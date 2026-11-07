import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import NoBusinessPrompt from '@/components/NoBusinessPrompt.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useSettlementStore } from '@/stores/settlement.store.ts';
import { hasPerm } from '@/components/auth/PermissionGate.tsx';
import toast from 'react-hot-toast';
import type { TransactionDetailData } from '@/components/TransactionDetailPanel';
import { useAccountData } from '@/hooks/useAccountData.ts';
import { useSSE } from '@/hooks/useSSE';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import {
  WalletBalanceCard,
  SettlementBankCard,
  SettlementAdvanceCard,
  DvaVerificationScreen,
  DvaOnboardingWizard,
  AccountMetricStrip,
  ComplianceTierCard,
  AccountSkeleton,
  AccountModals,
  AccountHeader,
  AccountFeedSection,
  type PayoutItem,
} from '@/components/account';

export default function Account() {
  useDisplayCurrency();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const businesses = useBusinessStore((s) => s.businesses);
  const businessStoreLoading = useBusinessStore((s) => s.isLoading);
  const fetchBusinesses = useBusinessStore((s) => s.fetchBusinesses);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const user = useAuthStore((s) => s.user);

  const isOwner = Boolean(
    biz ? (biz.myRole === 'owner' || biz.userId === user?.id) : user?.isOwnerAccount !== false
  );

  const canViewAccount = Boolean(
    isOwner ||
    hasPerm('wallet.read', biz, user?.id) ||
    biz?.myRole === 'manager' ||
    biz?.myRole === 'accountant'
  );

  const navigate = useNavigate();

  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAutoPayoutPinModal, setShowAutoPayoutPinModal] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<TransactionDetailData | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<PayoutItem | null>(null);

  const settlementPreview = useSettlementStore((s) => s.preview);
  const regulatory = useSettlementStore((s) => s.regulatory);
  const loadingPreview = useSettlementStore((s) => s.loadingPreview);
  const fetchSettlementPreview = useSettlementStore((s) => s.fetchPreview);
  const toggleAutoPayout = useSettlementStore((s) => s.toggleAutoPayout);
  const updatingAutoPayout = useSettlementStore((s) => s.updatingAutoPayout);
  const payoutHistory = useSettlementStore((s) => s.history);
  const fetchPayoutHistory = useSettlementStore((s) => s.fetchHistory);
  const loadingPayoutHistory = useSettlementStore((s) => s.loadingHistory);
  const payoutPagination = useSettlementStore((s) => s.pagination);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [activeFeedTab, setActiveFeedTab] = useState<'inflows' | 'withdrawals'>(
    urlTab === 'withdrawals' ? 'withdrawals' : 'inflows'
  );

  useEffect(() => {
    if (window.location.hash === '#settlement-advance') {
      const timer = setTimeout(() => {
        const el = document.getElementById('settlement-advance');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, []);
  const [payoutStatusFilter, setPayoutStatusFilter] = useState<'all' | 'completed' | 'pending' | 'failed' | 'advance'>('all');
  const [payoutSearch, setPayoutSearch] = useState('');

  const {
    dva, setDva, loading, banks, banksLoading, banksError,
    awaitingValidation, setAwaitingValidation, transactions,
    loadingTransactions, moneyIn, isRefreshing, fetchDVA,
    fetchTransactions, refreshAccountData,
  } = useAccountData(
    canViewAccount ? biz?.id : undefined, biz?.virtualAccountNumber || user?.virtualAccountNumber || undefined,
    biz?.virtualAccountBank || user?.virtualAccountBank || undefined,
    fetchBusinesses, fetchMe, fetchSettlementPreview,
    fetchPayoutHistory, payoutStatusFilter, payoutSearch
  );

  const activeBusinessId = biz?.id;

  useSSE(
    'dva_transfer_received',
    (e: any) => {
      if (!activeBusinessId || e.businessId !== activeBusinessId) return;
      toast.success(`💰 ${formatNaira(Number(e.amount))} from ${e.customerName}`);
      refreshAccountData?.(false);
    },
    [activeBusinessId, refreshAccountData]
  );

  useSSE(
    'payout_completed',
    (e: any) => {
      if (!activeBusinessId || e.businessId !== activeBusinessId) return;
      if (e.status === 'completed') {
        toast.success(`✅ Payout ${formatNaira(Number(e.amount))} completed`);
      } else {
        toast.error(e.failureReason || 'Payout failed');
      }
      fetchPayoutHistory?.(activeBusinessId, 1);
      fetchSettlementPreview?.(activeBusinessId);
    },
    [activeBusinessId, fetchPayoutHistory, fetchSettlementPreview]
  );

  const isBalanceLoading = (!settlementPreview && loadingPreview) || (!settlementPreview && isRefreshing);
  const isTxnsLoading = (loadingTransactions && transactions.length === 0) || (isRefreshing && transactions.length === 0);
  const isPayoutsLoading = (loadingPayoutHistory && payoutHistory.length === 0) || (isRefreshing && payoutHistory.length === 0);
  const isSettlementLinked = Boolean(biz?.settlementAccountNumber || settlementPreview?.settlementAccount?.isConnected || user?.settlementAccountNumber);
  const resolvedBankName = settlementPreview?.settlementAccount?.bankName || biz?.settlementBankName || user?.settlementBankName || 'Not Connected';
  const resolvedAccountNum = settlementPreview?.settlementAccount?.accountNumber || biz?.settlementAccountNumber || user?.settlementAccountNumber;
  const resolvedAccountName = settlementPreview?.settlementAccount?.accountName || biz?.settlementAccountName || user?.settlementAccountName;
  // `dva.accountName` is the NUBAN's legal holder (Business.ownerName) — the
  // name the bank resolves on transfer. Merchants and the customers paying
  // them care about the business being paid, so the business name leads here.
  const displayAccountName = biz?.businessName || dva?.accountName || biz?.ownerName || '';
  const isMultiBusiness = (businesses?.length ?? 0) > 1 || Boolean(settlementPreview?.isPooled);
  const activeBusinessBalance = settlementPreview?.businessBalance ?? moneyIn.businessBalance ?? settlementPreview?.availableForWithdrawal ?? 0;

  useEffect(() => {
    if (urlTab === 'withdrawals') setActiveFeedTab('withdrawals');
    else if (urlTab === 'inflows') setActiveFeedTab('inflows');
  }, [urlTab]);

  const handleTabChange = (tab: 'inflows' | 'withdrawals') => {
    setActiveFeedTab(tab);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', tab);
      return p;
    }, { replace: true });
  };

  const handleShare = async () => {
    if (!dva?.accountNumber) return;
    const text = `Pay ${biz?.businessName}\nBank: ${dva.bankName || 'Wema Bank'}\nAccount Number: ${dva.accountNumber}\nAccount Name: ${displayAccountName}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Pay ${biz?.businessName}`, text }); return; } catch {}
    }
    navigator.clipboard?.writeText(text);
    toast.success('Account details copied to clipboard');
  };

  // Verification resolves via Paystack webhook — poll while it is in flight so
  // success and failure both surface without the user hitting Refresh.
  const isActive = dva?.status === 'active';
  const isVerifying = !isActive && (awaitingValidation || dva?.status === 'pending');
  const bizId = biz?.id;

  useEffect(() => {
    if (!isVerifying || !canViewAccount || !bizId) return;
    const timer = setInterval(() => {
      void fetchDVA();
    }, 5000);
    return () => clearInterval(timer);
  }, [isVerifying, canViewAccount, bizId, fetchDVA]);

  if (businessStoreLoading) return <AccountSkeleton />;
  if (!biz) {
    return (
      <div className="mx-auto max-w-4xl py-12">
        <NoBusinessPrompt title="No business selected" message="Select or create a business to access your dedicated bank account, wallet balance, and payout settings." />
      </div>
    );
  }

  if (!canViewAccount) {
    return (
      <div className="mx-auto max-w-md py-16 px-4 text-center animate-fade-in">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mb-4 shadow-xs">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-base font-bold text-gray-900">Bank Account Access Restricted</h2>
        <p className="mt-2 text-xs text-gray-600 leading-relaxed">
          You do not have permission to view dedicated bank account details or wallet balances for <strong>{biz.businessName}</strong>. Access is restricted to the Business Owner, Manager, and Accountant.
        </p>
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" size="sm" subscriptionExempt={true} onClick={() => navigate('/dashboard')} className="text-xs">
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in pb-16">
      <AccountHeader
        businessName={biz.businessName}
        isActive={isActive}
        isRefreshing={isRefreshing || loading || loadingTransactions || loadingPayoutHistory}
        onRefresh={() => refreshAccountData(true)}
      />

      {loading && !dva ? (
        <AccountSkeleton />
      ) : isActive ? (
        <div className="space-y-6">
          <WalletBalanceCard
            availableBalance={settlementPreview?.availableForWithdrawal ?? 0}
            totalInflows={(isMultiBusiness ? settlementPreview?.pooledInflows : settlementPreview?.totalInflows) ?? moneyIn.totalBalance}
            pendingSettlement={(isMultiBusiness ? settlementPreview?.pooledPendingSettlement : settlementPreview?.pendingSettlement) ?? 0}
            isLoading={isBalanceLoading}
            isRefreshing={isRefreshing}
            onRefresh={() => refreshAccountData(true)}
            onWithdraw={isOwner ? () => setShowPayoutModal(true) : undefined}
            onExportStatement={() => setShowExportModal(true)}
            onShareDetails={handleShare}
            settlementConnected={isSettlementLinked}
            dvaAccountNumber={dva?.accountNumber}
            dvaBankName={dva?.bankName}
            accountName={displayAccountName}
            onShowQR={() => setShowQR(true)}
          />

          <AccountMetricStrip
            totalInflows={settlementPreview?.totalInflows ?? moneyIn.totalBalance}
            completedTransfersCount={transactions.filter((t) => t.status === 'completed').length}
            totalWithdrawn={settlementPreview?.totalWithdrawn ?? 0}
            pendingWithdrawn={settlementPreview?.pendingWithdrawn ?? 0}
            businessBalance={activeBusinessBalance}
            businessName={biz?.businessName}
            isPooled={isMultiBusiness}
            receivedThisMonth={moneyIn.receivedThisMonth}
            payoutBankName={resolvedBankName}
            payoutAccountNumber={resolvedAccountNum || undefined}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <AccountFeedSection
              activeTab={activeFeedTab}
              onTabChange={handleTabChange}
              hasPendingPayout={payoutHistory.some((p) => p.status === 'pending' || p.status === 'processing')}
              transactions={transactions}
              isTxnsLoading={isTxnsLoading}
              onSelectTransaction={(txn) => setSelectedTxn({
                id: txn.id,
                type: 'dva_inflow',
                amount: txn.amount,
                status: txn.status,
                date: txn.date,
                referenceId: txn.referenceId,
                description: txn.description,
                customerHint: txn.customerHint,
                needsVerification: txn.needsVerification,
                businessId: biz.id,
                virtualAccountNumber: dva?.accountNumber,
                virtualAccountBank: dva?.bankName,
              })}
              payouts={payoutHistory}
              isPayoutsLoading={isPayoutsLoading}
              payoutPagination={payoutPagination}
              payoutStatusFilter={payoutStatusFilter}
              payoutSearch={payoutSearch}
              onStatusFilterChange={setPayoutStatusFilter}
              onSearchChange={setPayoutSearch}
              onPageChange={(page) =>
                fetchPayoutHistory(
                  biz.id,
                  page,
                  payoutStatusFilter !== 'all' ? (payoutStatusFilter === 'advance' ? undefined : payoutStatusFilter) : undefined,
                  payoutSearch,
                  payoutStatusFilter === 'advance' ? true : undefined
                )
              }
              onRequestWithdrawal={isOwner ? () => setShowPayoutModal(true) : undefined}
              onSelectPayout={(payout) => setSelectedPayout(payout)}
            />

            <div className="space-y-6">
              <SettlementBankCard
                businessId={biz.id}
                isLinked={isSettlementLinked}
                isOwner={isOwner}
                bankName={resolvedBankName}
                accountNumber={resolvedAccountNum || undefined}
                accountName={resolvedAccountName || biz.ownerName}
                availableBalance={settlementPreview?.availableForWithdrawal ?? 0}
                pendingWithdrawn={settlementPreview?.pooledPendingWithdrawn ?? settlementPreview?.pendingWithdrawn ?? 0}
                autoPayoutEnabled={Boolean(settlementPreview?.autoPayoutEnabled)}
                updatingAutoPayout={updatingAutoPayout}
                isBalanceLoading={isBalanceLoading}
                onWithdraw={isOwner ? () => setShowPayoutModal(true) : undefined}
                onToggleAutoPayout={isOwner ? () => setShowAutoPayoutPinModal(true) : undefined}
                banks={banks}
                banksLoading={banksLoading}
                banksError={banksError}
                onSettlementLinkedSuccess={isOwner ? async () => {
                  await fetchBusinesses(true);
                  if (biz?.id) await fetchSettlementPreview(biz.id);
                } : undefined}
              />

              {isOwner && (
                <SettlementAdvanceCard
                  businessId={biz.id}
                  isOwner={isOwner}
                  isLinked={isSettlementLinked}
                  onSuccess={() => {
                    fetchDVA();
                    fetchTransactions();
                    if (biz?.id) {
                      fetchSettlementPreview(biz.id);
                      fetchPayoutHistory(biz.id);
                    }
                    handleTabChange('withdrawals');
                  }}
                />
              )}

              {isOwner && (
                <ComplianceTierCard
                  businessName={biz.businessName}
                  bvnVerifiedAt={user?.bvnVerifiedAt}
                  regulatory={regulatory}
                />
              )}
            </div>
          </div>
        </div>
      ) : isVerifying ? (
        <DvaVerificationScreen loading={loading} onRefresh={fetchDVA} onEditDetails={() => setAwaitingValidation(false)} />
      ) : (
        <DvaOnboardingWizard
          businessId={biz.id}
          businessName={biz.businessName}
          loading={loading}
          dvaStatus={dva?.status}
          dvaMessage={dva?.message}
          banks={banks}
          banksLoading={banksLoading}
          banksError={banksError}
          onSuccess={async (newDva) => {
            setDva(newDva);
            setAwaitingValidation(false);
            await fetchMe();
            await fetchBusinesses();
          }}
          onNeedsValidation={() => {
            setAwaitingValidation(true);
            fetchMe();
            fetchDVA();
          }}
          onRefreshMe={fetchMe}
        />
      )}

      <AccountModals
        businessId={biz?.id}
        businessName={biz?.businessName}
        qrModal={{
          isOpen: showQR,
          onClose: () => setShowQR(false),
          bankName: dva?.bankName || 'Wema Bank',
          accountNumber: dva?.accountNumber || '',
          accountName: displayAccountName,
        }}
        detailPanel={{
          transaction: selectedTxn,
          onClose: () => setSelectedTxn(null),
          onVerifySuccess: () => {
            if (biz?.id) {
              refreshAccountData(true);
              fetchTransactions();
            }
          },
        }}
        payoutDetailPanel={{
          payout: selectedPayout,
          onClose: () => setSelectedPayout(null),
        }}
        payoutModal={{
          isOpen: showPayoutModal,
          onClose: () => setShowPayoutModal(false),
          onSuccess: () => {
            fetchDVA();
            fetchTransactions();
            fetchSettlementPreview(biz.id);
            fetchPayoutHistory(biz.id);
            handleTabChange('withdrawals');
          },
        }}
        autoPayoutPinModal={{
          isOpen: showAutoPayoutPinModal,
          onClose: () => setShowAutoPayoutPinModal(false),
          enabled: Boolean(settlementPreview?.autoPayoutEnabled),
          onSuccess: async (stepUpToken: string) => {
            setShowAutoPayoutPinModal(false);
            if (biz?.id) {
              await toggleAutoPayout(biz.id, {
                enabled: !Boolean(settlementPreview?.autoPayoutEnabled),
                stepUpToken,
              });
            }
          },
        }}
        exportModal={{
          isOpen: showExportModal,
          onClose: () => setShowExportModal(false),
        }}
      />
    </div>
  );
}
