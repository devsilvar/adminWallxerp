import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { userToggleAutoPayout } from '@/modules/wallet/services/merchant-payout.service';
import { adminToggleUserAutoPayout } from '@/modules/wallet/services/admin-payout.service';
import * as withdrawalActorModule from '@/shared/helpers/withdrawal-actor';
import * as pinService from '@/services/pin.service';
import * as auditModule from '@/lib/audit';
import prisma from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';

describe('userToggleAutoPayout Unit Suite', () => {
  const mockUserId = 'usr-owner-001';
  const mockBusinessId = 'biz-wallet-001';

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(auditModule, 'logAudit').mockReturnValue(undefined as any);
  });

  test('successfully enables auto-payout with valid PIN and linked settlement account', async () => {
    jest.spyOn(withdrawalActorModule, 'getWithdrawalActor').mockResolvedValue({
      id: mockBusinessId,
      userId: mockUserId,
      businessName: 'Lagos Ventures',
      settlementAccountNumber: '0123456789',
      settlementBankCode: '058',
      settlementBankName: 'GTBank',
      user: {
        id: mockUserId,
        transactionPin: '$2b$12$hashed...',
        pinLockedUntil: null,
        pinAttempts: 0,
        settlementAccountNumber: null,
        settlementBankCode: null,
        autoPayoutEnabled: false,
      },
    } as any);

    jest.spyOn(pinService, 'verifyPin').mockResolvedValue(undefined as any);

    jest.spyOn(prisma.user, 'update').mockResolvedValue({
      id: mockUserId,
      autoPayoutEnabled: true,
    } as any);

    const result = await userToggleAutoPayout(mockUserId, mockBusinessId, {
      enabled: true,
      pin: '1234',
    });

    expect(result).toEqual({ autoPayoutEnabled: true });
    expect(pinService.verifyPin).toHaveBeenCalledWith(mockUserId, '1234');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: mockUserId },
      data: { autoPayoutEnabled: true },
      select: {
        id: true,
        autoPayoutEnabled: true,
      },
    });
    expect(auditModule.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockUserId,
        businessId: mockBusinessId,
        action: 'settlement.auto_payout_toggled',
        resourceType: 'user',
        resourceId: mockUserId,
        oldData: { autoPayoutEnabled: false },
        newData: { autoPayoutEnabled: true },
      })
    );
  });

  test('successfully disables auto-payout with valid step-up token even without bank account', async () => {
    jest.spyOn(withdrawalActorModule, 'getWithdrawalActor').mockResolvedValue({
      id: mockBusinessId,
      userId: mockUserId,
      businessName: 'Lagos Ventures',
      settlementAccountNumber: null,
      settlementBankCode: null,
      user: {
        id: mockUserId,
        transactionPin: '$2b$12$hashed...',
        pinLockedUntil: null,
        pinAttempts: 0,
        settlementAccountNumber: null,
        settlementBankCode: null,
        autoPayoutEnabled: true,
      },
    } as any);

    jest.spyOn(pinService, 'verifyStepUpToken').mockReturnValue(undefined as any);

    jest.spyOn(prisma.user, 'update').mockResolvedValue({
      id: mockUserId,
      autoPayoutEnabled: false,
    } as any);

    const result = await userToggleAutoPayout(mockUserId, mockBusinessId, {
      enabled: false,
      stepUpToken: 'valid-token-xyz',
    });

    expect(result).toEqual({ autoPayoutEnabled: false });
    expect(pinService.verifyStepUpToken).toHaveBeenCalledWith(mockUserId, 'valid-token-xyz');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: mockUserId },
      data: { autoPayoutEnabled: false },
      select: {
        id: true,
        autoPayoutEnabled: true,
      },
    });
    expect(auditModule.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockUserId,
        businessId: mockBusinessId,
        action: 'settlement.auto_payout_toggled',
        resourceType: 'user',
        resourceId: mockUserId,
        oldData: { autoPayoutEnabled: true },
        newData: { autoPayoutEnabled: false },
      })
    );
  });

  test('throws SETTLEMENT_ACCOUNT_REQUIRED when enabling auto-payout without linked bank', async () => {
    jest.spyOn(withdrawalActorModule, 'getWithdrawalActor').mockResolvedValue({
      id: mockBusinessId,
      userId: mockUserId,
      businessName: 'Lagos Ventures',
      settlementAccountNumber: null,
      settlementBankCode: null,
      user: {
        id: mockUserId,
        transactionPin: '$2b$12$hashed...',
        pinLockedUntil: null,
        pinAttempts: 0,
        settlementAccountNumber: null,
        settlementBankCode: null,
        autoPayoutEnabled: false,
      },
    } as any);

    await expect(
      userToggleAutoPayout(mockUserId, mockBusinessId, {
        enabled: true,
        pin: '1234',
      })
    ).rejects.toThrow(
      new AppError(
        400,
        'Connect your settlement account first — automatic payouts require a connected settlement bank account before they can be enabled.',
        'SETTLEMENT_ACCOUNT_REQUIRED'
      )
    );
  });

  test('throws PIN_REQUIRED when neither PIN nor step-up token is provided', async () => {
    jest.spyOn(withdrawalActorModule, 'getWithdrawalActor').mockResolvedValue({
      id: mockBusinessId,
      userId: mockUserId,
      businessName: 'Lagos Ventures',
      settlementAccountNumber: '0123456789',
      settlementBankCode: '058',
      user: {
        id: mockUserId,
        transactionPin: '$2b$12$hashed...',
        pinLockedUntil: null,
        pinAttempts: 0,
        autoPayoutEnabled: false,
      },
    } as any);

    await expect(
      userToggleAutoPayout(mockUserId, mockBusinessId, {
        enabled: true,
      } as any)
    ).rejects.toThrow(
      new AppError(400, 'Transaction PIN or step-up authorization token is required', 'PIN_REQUIRED')
    );
  });

  test('throws BUSINESS_NOT_FOUND when user is not the business owner', async () => {
    jest.spyOn(withdrawalActorModule, 'getWithdrawalActor').mockRejectedValue(
      new AppError(404, 'Business not found or access denied', 'BUSINESS_NOT_FOUND')
    );

    await expect(
      userToggleAutoPayout(mockUserId, mockBusinessId, {
        enabled: true,
        pin: '1234',
      })
    ).rejects.toThrow(
      new AppError(404, 'Business not found or access denied', 'BUSINESS_NOT_FOUND')
    );
  });
});

describe('adminToggleUserAutoPayout Unit Suite', () => {
  const mockAdminId = 'usr-admin-999';
  const mockTargetUserId = 'usr-target-001';

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(auditModule, 'logAudit').mockReturnValue(undefined as any);
  });

  test('successfully enables user auto-payout when settlement account exists on business', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: mockTargetUserId,
      email: 'user@example.com',
      autoPayoutEnabled: false,
      settlementAccountNumber: null,
      settlementBankCode: null,
      businesses: [
        {
          id: 'biz-1',
          businessName: 'Biz One',
          settlementAccountNumber: '0123456789',
          settlementBankCode: '058',
        },
        {
          id: 'biz-2',
          businessName: 'Biz Two',
          settlementAccountNumber: null,
          settlementBankCode: null,
        },
      ],
    } as any);

    jest.spyOn(prisma.user, 'update').mockResolvedValue({
      id: mockTargetUserId,
      autoPayoutEnabled: true,
    } as any);

    const result = await adminToggleUserAutoPayout(mockAdminId, mockTargetUserId, true);

    expect(result).toEqual({ userId: mockTargetUserId, autoPayoutEnabled: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: mockTargetUserId },
      data: { autoPayoutEnabled: true },
      select: {
        id: true,
        autoPayoutEnabled: true,
      },
    });
    expect(auditModule.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockAdminId,
        action: 'admin.user_auto_payout_toggled',
        resourceType: 'user',
        resourceId: mockTargetUserId,
        oldData: { autoPayoutEnabled: false },
        newData: { autoPayoutEnabled: true },
      })
    );
  });

  test('successfully disables user auto-payout even without settlement account', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: mockTargetUserId,
      email: 'user@example.com',
      autoPayoutEnabled: true,
      settlementAccountNumber: null,
      settlementBankCode: null,
      businesses: [],
    } as any);

    jest.spyOn(prisma.user, 'update').mockResolvedValue({
      id: mockTargetUserId,
      autoPayoutEnabled: false,
    } as any);

    const result = await adminToggleUserAutoPayout(mockAdminId, mockTargetUserId, false);

    expect(result).toEqual({ userId: mockTargetUserId, autoPayoutEnabled: false });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: mockTargetUserId },
      data: { autoPayoutEnabled: false },
      select: {
        id: true,
        autoPayoutEnabled: true,
      },
    });
    expect(auditModule.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockAdminId,
        action: 'admin.user_auto_payout_toggled',
        resourceType: 'user',
        resourceId: mockTargetUserId,
        oldData: { autoPayoutEnabled: true },
        newData: { autoPayoutEnabled: false },
      })
    );
  });

  test('throws SETTLEMENT_ACCOUNT_REQUIRED when enabling user auto-payout without connected bank', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: mockTargetUserId,
      email: 'user@example.com',
      autoPayoutEnabled: false,
      settlementAccountNumber: null,
      settlementBankCode: null,
      businesses: [
        {
          id: 'biz-1',
          businessName: 'Biz One',
          settlementAccountNumber: null,
          settlementBankCode: null,
        },
      ],
    } as any);

    await expect(
      adminToggleUserAutoPayout(mockAdminId, mockTargetUserId, true)
    ).rejects.toThrow(
      new AppError(
        400,
        'Cannot enable automatic payouts for a user account without a connected settlement bank account',
        'SETTLEMENT_ACCOUNT_REQUIRED'
      )
    );
  });

  test('throws USER_NOT_FOUND when target user does not exist', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

    await expect(
      adminToggleUserAutoPayout(mockAdminId, 'non-existent-user', true)
    ).rejects.toThrow(new AppError(404, 'User not found', 'USER_NOT_FOUND'));
  });
});
