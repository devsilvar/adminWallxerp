import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getPaymentProvider } from '@/lib/payment';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import logger from '@/lib/logger';
import * as pinService from '@/services/settlement/pin.service';
import { formatNaira } from '@/lib/format';
import {
  dvaFeeCapThreshold,
  dvaFeeTotalFromBuckets,
  feeSchedule,
} from '@/lib/paystack-fees';
import config from '@/config';
import {
  ToggleAutoPayoutInput,
} from '@/validators/settlement.validator';
import {
  toNumber,
  getWithdrawalActor,
  SETTLED_SALE_STATUSES,
} from '@/shared/helpers';
import { getPayoutLockStatus } from '@/lib/payout-lock';
import { WalletService } from '@/services/wallet/wallet.service';

/**
 * Re-exports for Phase 3 Strangler Fig pattern.
 * Extracted modules provide focused, cohesive services while preserving 100%
 * backward-compatibility for existing callers.
 */
export {
  resolveSettlementAccount,
  connectSettlementBank,
} from '@/services/bank/bank-resolution.service';

export {
  withdrawBalance,
  listPayoutHistory,
  adminListWithdrawalRequests,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  adminRequeryWithdrawal,
  adminToggleUserAutoPayout,
  adminManualSettleWithdrawal,
  userToggleAutoPayout,
} from './payout.service';

export { getPayoutPreview } from './payout-preview.service';


/**
 * Toggles gateway auto-split and updates tax split percentage
 */
export async function toggleAutoSplit(
  userId: string,
  businessId: string,
  params: ToggleAutoPayoutInput
) {
  const business = await getWithdrawalActor(userId, businessId);

  // Enable requires a provisioned subaccount — otherwise no split exists on the
  // DVA and inflows pool 100% on the platform while the UI says "on". (NEW-D)
  // Disabling is always allowed (harmless cleanup of a never-active flag).
  if (params.enabled && !business.paystackSubaccountCode) {
    throw new AppError(
      400,
      'Connect your settlement account first — auto-split needs a provisioned settlement account before it can be enabled.',
      'SETTLEMENT_ACCOUNT_REQUIRED'
    );
  }

  // PIN verification (outside tx)
  if (params.stepUpToken) {
    pinService.verifyStepUpToken(userId, params.stepUpToken);
  } else if (params.pin) {
    await pinService.verifyPin(userId, params.pin);
  } else {
    throw new AppError(400, 'Transaction PIN or step-up authorization token is required', 'PIN_REQUIRED');
  }

  const updatedBusiness = await prisma.business.update({
    where: { id: businessId },
    data: {
      autoSplitEnabled: params.enabled,
    },
  });

  // Sync with Paystack subaccount if provisioned
  if (business.paystackSubaccountCode) {
    const provider = getPaymentProvider();
    try {
      await provider.updateSubaccount(business.paystackSubaccountCode, {
        percentageCharge: params.enabled ? 7.5 : 0,
      });
    } catch (err) {
      logger.warn('Could not sync subaccount split percentage with Paystack', {
        businessId,
        subaccountCode: business.paystackSubaccountCode,
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  logAudit({
    userId,
    businessId,
    action: 'settlement.auto_split_updated',
    resourceType: 'business',
    resourceId: businessId,
    newData: {
      autoSplitEnabled: params.enabled,
    },
  });

  return {
    autoSplitEnabled: updatedBusiness.autoSplitEnabled,
    taxSplitPercentage: toNumber(updatedBusiness.taxSplitPercentage),
  };
}
