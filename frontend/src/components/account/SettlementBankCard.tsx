import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ShieldCheck,
  Clock,
  ArrowRight,
  Lock,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import BankSelect from '@/components/BankSelect.tsx';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import type { Bank } from '@/types';
import api from '@/lib/axios.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

export interface SettlementBankCardProps {
  businessId?: string;
  isLinked: boolean;
  isOwner?: boolean;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  availableBalance?: number;
  pendingWithdrawn?: number;
  autoPayoutEnabled?: boolean;
  updatingAutoPayout?: boolean;
  isBalanceLoading?: boolean;
  onWithdraw?: () => void;
  onToggleAutoPayout?: () => void;
  banks?: Bank[] | null;
  banksLoading?: boolean;
  banksError?: string;
  onSettlementLinkedSuccess?: () => Promise<void> | void;
}

export const SettlementBankCard: React.FC<SettlementBankCardProps> = ({
  businessId,
  isLinked,
  isOwner: isOwnerProp,
  bankName,
  accountNumber,
  accountName,
  availableBalance = 0,
  pendingWithdrawn = 0,
  autoPayoutEnabled = false,
  updatingAutoPayout = false,
  isBalanceLoading = false,
  onWithdraw,
  onToggleAutoPayout,
  banks,
  banksLoading = false,
  banksError = '',
  onSettlementLinkedSuccess,
}) => {
  useDisplayCurrency();
  const isOwner = isOwnerProp ?? Boolean(onSettlementLinkedSuccess);
  const [showForm, setShowForm] = useState(false);
  const [settlementBank, setSettlementBank] = useState('');
  const [settlementAccount, setSettlementAccount] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [connectingSettlement, setConnectingSettlement] = useState(false);
  const [settlementError, setSettlementError] = useState('');

  const handleResolveSettlement = async () => {
    if (!businessId) {
      setSettlementError('Select a business first');
      return;
    }
    if (!/^\d{10}$/.test(settlementAccount)) {
      setSettlementError('Account number must be 10 digits');
      return;
    }
    if (!settlementBank) {
      setSettlementError('Select a bank');
      return;
    }

    setSettlementError('');
    setResolvingAccount(true);
    try {
      const res = await api.post(`/businesses/${businessId}/dva/settlement/resolve`, {
        bankCode: settlementBank,
        accountNumber: settlementAccount,
      });
      setResolvedName(res.data.data?.accountName || '');
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to verify account';
      setSettlementError(msg);
    } finally {
      setResolvingAccount(false);
    }
  };

  const handleConnectSettlement = async () => {
    if (!resolvedName) return;
    if (!businessId) {
      setSettlementError('Select a business first');
      return;
    }

    setConnectingSettlement(true);
    try {
      const selectedBank = banks?.find((b) => b.code === settlementBank);
      await api.post(`/businesses/${businessId}/settlement/connect`, {
        bankCode: settlementBank,
        bankName: selectedBank?.name || '',
        accountNumber: settlementAccount,
        commissionPct: 0,
      });
      setShowForm(false);
      setSettlementBank('');
      setSettlementAccount('');
      setResolvedName('');
      if (onSettlementLinkedSuccess) {
        await onSettlementLinkedSuccess();
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Connection failed';
      setSettlementError(msg);
    } finally {
      setConnectingSettlement(false);
    }
  };

  return (
    <div
      data-testid="settlement-bank-card"
      className="rounded-xl border border-gray-200/80 bg-white shadow-xs p-5 sm:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            <Building2 className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">Payout Bank</h3>
        </div>
        {isLinked && !showForm && (
          <span
            data-testid="linked-badge"
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
          >
            <CheckCircle2 className="h-3 w-3" /> Linked
          </span>
        )}
      </div>

      {isLinked && !showForm ? (
        <div className="space-y-4">
          {/* Bank Details Pill */}
          <div
            data-testid="bank-details-pill"
            className="rounded-xl bg-gray-50 border border-gray-200/70 p-3.5"
          >
            <div className="flex items-center justify-between">
              <p
                data-testid="settlement-account-name"
                className="text-xs font-semibold text-gray-900 truncate"
              >
                {accountName || 'Connected Commercial Account'}
              </p>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 shrink-0">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            </div>
            <p
              data-testid="settlement-account-details"
              className="text-xs text-gray-600 mt-0.5 font-mono"
            >
              {bankName || 'Bank'} · •••• {accountNumber ? accountNumber.slice(-4) : '••••'}
            </p>
          </div>

          {/* Available for Instant Withdrawal Box */}
          <div className="rounded-xl bg-purple-50/60 border border-purple-100 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-purple-900 font-semibold">Wallet Balance</span>
              {isBalanceLoading ? (
                <Skeleton width={80} height={18} />
              ) : (
                <span
                  data-testid="settlement-balance"
                  className="font-mono font-bold text-purple-950 text-sm"
                >
                  {formatNaira(availableBalance)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-purple-800/80 leading-relaxed">
              Available for instant transfer to your verified payout bank account.
            </p>
            {pendingWithdrawn > 0 && (
              <div
                data-testid="pending-withdrawal-alert"
                className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800 flex items-start gap-1.5"
              >
                <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  {formatNaira(pendingWithdrawn)} currently reserved by a withdrawal that's in flight.
                </span>
              </div>
            )}
            {onWithdraw && (
              <Button
                variant="primary"
                size="sm"
                onClick={onWithdraw}
                disabled={!isLinked}
                subscriptionExempt={true}
                className="w-full text-xs bg-purple-900 hover:bg-purple-950 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Withdraw Funds <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>

          {/* Automatic Payouts (T+1) Mode Toggle */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div className="pr-3">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-gray-900">Automatic Payouts (T+1)</p>
                <span
                  data-testid="auto-payout-mode-badge"
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    autoPayoutEnabled
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {autoPayoutEnabled ? 'Automatic' : 'Manual'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {autoPayoutEnabled
                  ? 'Your balance is automatically paid out to your bank the next business day. No PIN required.'
                  : 'Withdraw anytime with your 4-digit PIN. You control when money moves to your bank.'}
              </p>
            </div>
            {onToggleAutoPayout && (
              <button
                type="button"
                data-testid="auto-payout-toggle"
                aria-label="Toggle automatic daily payouts"
                disabled={updatingAutoPayout}
                onClick={onToggleAutoPayout}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                  autoPayoutEnabled ? 'bg-purple-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    autoPayoutEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            )}
          </div>

          {/* Payout Bank Lock Notice */}
          <div
            data-testid="payout-bank-lock-notice"
            className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 mt-3"
          >
            <div className="flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-900">Bank Account Locked</p>
                <p className="mt-0.5 text-blue-700">
                  Your payout bank is locked for security. Contact support if you need to change it.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : !isLinked && !showForm ? (
        <div className="text-center py-4">
          <p className="text-xs text-gray-500 mb-3">
            {isOwner
              ? 'Connect your Nigerian bank account to receive automatic transfers.'
              : 'No commercial bank account has been connected for automated payouts yet. Only the business owner can connect a settlement bank.'}
          </p>
          <Button
            size="sm"
            disabled={!isOwner}
            subscriptionExempt={true}
            title={!isOwner ? 'Only business owners can connect bank accounts' : undefined}
            onClick={() => {
              if (isOwner) setShowForm(true);
            }}
            className="w-full text-xs"
          >
            <Building2 className="h-3.5 w-3.5 mr-1" /> Connect Bank
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {settlementError && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-2.5">
              <p className="text-xs text-red-700">{settlementError}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Bank</label>
            <BankSelect
              banks={banks || null}
              loading={banksLoading}
              error={banksError}
              value={settlementBank}
              onChange={(code) => {
                setSettlementBank(code);
                setSettlementError('');
                setResolvedName('');
              }}
            />
          </div>

          <Input
            label="Account number"
            type="text"
            maxLength={10}
            value={settlementAccount}
            onChange={(e) => {
              setSettlementAccount(e.target.value.replace(/\D/g, ''));
              setSettlementError('');
              setResolvedName('');
            }}
            placeholder="0123456789"
          />

          {!resolvedName ? (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                subscriptionExempt={true}
                onClick={handleResolveSettlement}
                isLoading={resolvingAccount}
              >
                Verify Account
              </Button>
              <Button
                variant="ghost"
                size="sm"
                subscriptionExempt={true}
                onClick={() => {
                  setShowForm(false);
                  setSettlementError('');
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs font-semibold text-emerald-700">Account Verified</p>
                </div>
                <p className="text-sm font-bold text-gray-900">{resolvedName}</p>
                <p className="text-xs text-gray-600">
                  {banks?.find((b) => b.code === settlementBank)?.name}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  subscriptionExempt={true}
                  onClick={handleConnectSettlement}
                  isLoading={connectingSettlement}
                >
                  Save & Link Bank
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  subscriptionExempt={true}
                  onClick={() => {
                    setShowForm(false);
                    setResolvedName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SettlementBankCard;
