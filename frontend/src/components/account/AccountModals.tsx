import React from 'react';
import TransactionDetailPanel, { type TransactionDetailData } from '@/components/TransactionDetailPanel';
import PayoutWithdrawalModal from '@/components/PayoutWithdrawalModal.tsx';
import PinModal from '@/components/PinModal.tsx';
import StatementExportModal from '@/components/StatementExportModal.tsx';
import AccountQrModal from './AccountQrModal.tsx';
import PayoutDetailPanel from './PayoutDetailPanel.tsx';
import type { PayoutItem } from './WithdrawalsTable.tsx';

export interface AccountModalsProps {
  businessId?: string;
  businessName?: string;
  qrModal: {
    isOpen: boolean;
    onClose: () => void;
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  detailPanel: {
    transaction: TransactionDetailData | null;
    onClose: () => void;
    onVerifySuccess: () => void;
  };
  payoutDetailPanel?: {
    payout: PayoutItem | null;
    onClose: () => void;
  };
  payoutModal: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
  };
  autoPayoutPinModal?: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (token: string) => Promise<void>;
    enabled: boolean;
  };
  exportModal: {
    isOpen: boolean;
    onClose: () => void;
  };
}

export const AccountModals: React.FC<AccountModalsProps> = ({
  businessId,
  businessName = '',
  qrModal,
  detailPanel,
  payoutDetailPanel,
  payoutModal,
  autoPayoutPinModal,
  exportModal,
}) => {
  return (
    <>
      {/* Scan to Transfer QR Modal */}
      <AccountQrModal
        isOpen={qrModal.isOpen}
        onClose={qrModal.onClose}
        businessName={businessName}
        bankName={qrModal.bankName}
        accountNumber={qrModal.accountNumber}
        accountName={qrModal.accountName}
      />

      {/* Transaction Classification Slide-Over */}
      <TransactionDetailPanel
        isOpen={Boolean(detailPanel.transaction)}
        onClose={detailPanel.onClose}
        transaction={detailPanel.transaction}
        onVerifySuccess={detailPanel.onVerifySuccess}
      />

      {/* Withdrawal Detail Slide-Over */}
      {payoutDetailPanel && (
        <PayoutDetailPanel
          isOpen={Boolean(payoutDetailPanel.payout)}
          onClose={payoutDetailPanel.onClose}
          payout={payoutDetailPanel.payout}
        />
      )}

      {/* Instant Payout Modal */}
      {businessId && (
        <PayoutWithdrawalModal
          isOpen={payoutModal.isOpen}
          onClose={payoutModal.onClose}
          businessId={businessId}
          onSuccess={payoutModal.onSuccess}
        />
      )}

      {/* Auto-Payout Mode Step-Up PIN Modal */}
      {businessId && autoPayoutPinModal && (
        <PinModal
          isOpen={autoPayoutPinModal.isOpen}
          onClose={autoPayoutPinModal.onClose}
          onSuccess={autoPayoutPinModal.onSuccess}
          title={autoPayoutPinModal.enabled ? 'Switch to Manual Payouts' : 'Enable Instant Auto-Payouts'}
          description={
            autoPayoutPinModal.enabled
              ? "Enter your 4-digit transaction PIN to disable instant payouts. Turn off automatic daily payouts. You'll still be able to withdraw instantly, any time you want."
              : 'Enter your 4-digit transaction PIN to enable instant automatic payouts directly to your connected bank.'
          }
        />
      )}

      {/* Statement Export Modal */}
      {businessId && (
        <StatementExportModal
          isOpen={exportModal.isOpen}
          onClose={exportModal.onClose}
          businessId={businessId}
          businessName={businessName}
        />
      )}
    </>
  );
};

export default AccountModals;
