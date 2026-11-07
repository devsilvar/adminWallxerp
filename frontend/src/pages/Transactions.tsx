import { useEffect, useState, useRef } from 'react';
import {
  Search,
  Download,
  Landmark,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useLedgerStore } from '@/stores/ledger.store.ts';
import Button from '@/components/ui/Button.tsx';
import StatementExportModal from '@/components/StatementExportModal';
import TransactionDetailPanel, {
  type TransactionDetailData,
  type TransactionDetailType,
} from '@/components/TransactionDetailPanel';
import type { UnifiedLedgerRow } from '@/types';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export default function Transactions() {
  useDisplayCurrency();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const { items, summary, scope, loading, setScope, fetchLedger, pagination } =
    useLedgerStore();

  const storeSearchQuery = useLedgerStore((s) => s.searchQuery);
  const [inputValue, setInputValue] = useState(storeSearchQuery);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<TransactionDetailData | null>(
    null,
  );
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (biz?.id) fetchLedger(biz.id);
  }, [biz?.id, fetchLedger]);

  useEffect(() => {
    setInputValue(storeSearchQuery);
  }, [storeSearchQuery]);
  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  const panelTypeFor = (
    sourceType: UnifiedLedgerRow['sourceType'],
  ): TransactionDetailType => {
    if (sourceType === 'tax_payment') return 'tax_payment';
    if (sourceType === 'dva_transfer') return 'dva_inflow';
    return 'sales_transaction';
  };

  const sourceFor = (
    sourceType: UnifiedLedgerRow['sourceType'],
  ): string | undefined => {
    switch (sourceType) {
      case 'dva_transfer':
        return 'bank_transfer';
      case 'pos':
        return 'pos';
      case 'invoice_payment':
        return 'invoice';
      case 'manual_sale':
        return 'manual';
      case 'credit_sale':
        return 'credit';
      default:
        return undefined;
    }
  };

  const handleTxnClick = (item: UnifiedLedgerRow) => {
    if (!biz?.id) return;
    setSelectedTxn({
      id: item.id,
      amount: item.amount,
      type: panelTypeFor(item.sourceType),
      description: item.description,
      date: item.date,
      referenceId: item.reference,
      status: item.status,
      customerName:
        item.counterparty && item.counterparty !== 'Customer'
          ? item.counterparty
          : undefined,
      source: sourceFor(item.sourceType),
      businessId: biz.id,
      accrualLinked: item.accrualLinked,
      needsVerification: item.needsVerification,
      dvaOrigin: item.dvaOrigin,
      verifiedAt: item.verifiedAt,
    });
  };

  const handleSearch = (query: string) => {
    setInputValue(query);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (biz?.id) useLedgerStore.getState().setSearchQuery(biz.id, query);
    }, 300);
  };

  if (!biz) {
    return (
      <div className='flex items-center justify-center h-[60vh]'>
        <p className='text-sm text-gray-500'>
          Select a business to view transactions
        </p>
      </div>
    );
  }

  const isWallet = scope === 'dva_bank';
  const totalOut =
    (summary.totalPayoutDebits ?? 0) + (summary.totalSplitDebits ?? 0);

  return (
    <div className='pb-8 animate-in fade-in duration-200'>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-xl font-bold text-gray-900'>Transactions</h1>
        <Button
          onClick={() => setShowExportModal(true)}
          variant='secondary'
          size='sm'
          disabled={items.length === 0}
        >
          <Download className='h-3.5 w-3.5' /> Export
        </Button>
      </div>

      {/* ── View Tabs ──────────────────────────────────────── */}
      <div className='flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6'>
        <button
          type='button'
          onClick={() => setScope(biz.id, 'dva_bank')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-all ${
            isWallet
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Landmark className='h-3.5 w-3.5' />
          Wallet
        </button>
        <button
          type='button'
          onClick={() => setScope(biz.id, 'all_income')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-all ${
            !isWallet
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Receipt className='h-3.5 w-3.5' />
          All Sales
        </button>
      </div>

      {/* ── Summary Strip ──────────────────────────────────── */}
      {isWallet ? (
        /* Wallet view: In / Out / Tax / Balance */
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200 rounded-xl overflow-hidden mb-6'>
          <div className='bg-white p-4'>
            <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
              Money In
            </p>
            <p className='text-lg font-bold text-emerald-600 tabular-nums mt-1'>
              {summary.totalCredits > 0
                ? `+${formatNaira(summary.totalCredits)}`
                : formatNaira(0)}
            </p>
            <p className='text-[10px] text-gray-400 mt-1'>
              Bank transfers received
            </p>
          </div>
          <div className='bg-white p-4'>
            <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
              Sent Out
            </p>
            <p
              className={`text-lg font-bold tabular-nums mt-1 ${totalOut > 0 ? 'text-purple-700' : 'text-gray-800'}`}
            >
              {totalOut > 0 ? `-${formatNaira(totalOut)}` : formatNaira(0)}
            </p>
            <p className='text-[10px] text-gray-400 mt-1'>
              Withdrawals & splits
            </p>
          </div>
          <div className='bg-white p-4'>
            <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
              Tax Paid
            </p>
            <p
              className={`text-lg font-bold tabular-nums mt-1 ${(summary.totalTaxDebits ?? 0) > 0 ? 'text-rose-600' : 'text-gray-800'}`}
            >
              {(summary.totalTaxDebits ?? 0) > 0
                ? `-${formatNaira(summary.totalTaxDebits ?? 0)}`
                : formatNaira(0)}
            </p>
            <p className='text-[10px] text-gray-400 mt-1'>NRS payments</p>
          </div>
          <div className='bg-gray-900 p-4 text-white'>
            <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
              Balance
            </p>
            <p className='text-lg font-bold text-emerald-400 tabular-nums mt-1'>
              {formatNaira(summary.closingBalance)}
            </p>
            <p className='text-[10px] text-gray-500 mt-1'>
              Current wallet balance
            </p>
          </div>
        </div>
      ) : (
        /* All Sales view: Total + breakdown if available */
        <div
          className={`grid gap-px bg-gray-200 rounded-xl overflow-hidden mb-6 ${summary.breakdown ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-1'}`}
        >
          <div className='bg-white p-4'>
            <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
              Total Revenue
            </p>
            <p className='text-lg font-bold text-gray-900 tabular-nums mt-1'>
              {formatNaira(summary.totalCredits)}
            </p>
            <p className='text-[10px] text-gray-400 mt-1'>
              All channels combined
            </p>
          </div>
          {summary.breakdown && (
            <>
              <div className='bg-white p-4'>
                <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
                  Bank Transfers
                </p>
                <p className='text-lg font-bold text-emerald-600 tabular-nums mt-1'>
                  {formatNaira(summary.breakdown.creditsBySource.dva_transfer)}
                </p>
                <p className='text-[10px] text-gray-400 mt-1'>
                  Auto-captured via wallet
                </p>
              </div>
              <div className='bg-white p-4'>
                <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
                  Direct Sales
                </p>
                <p className='text-lg font-bold text-blue-600 tabular-nums mt-1'>
                  {formatNaira(
                    summary.breakdown.creditsBySource.manual_sale +
                      summary.breakdown.creditsBySource.pos,
                  )}
                </p>
                <p className='text-[10px] text-gray-400 mt-1'>
                  Cash, POS & manual entries
                </p>
              </div>
              <div className='bg-white p-4'>
                <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
                  Invoices
                </p>
                <p className='text-lg font-bold text-orange-600 tabular-nums mt-1'>
                  {formatNaira(
                    summary.breakdown.creditsBySource.invoice_payment,
                  )}
                </p>
                <p className='text-[10px] text-gray-400 mt-1'>Paid invoices</p>
              </div>
              <div className='bg-white p-4'>
                <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
                  Credit / Debt
                </p>
                <p className='text-lg font-bold text-amber-600 tabular-nums mt-1'>
                  {formatNaira(
                    summary.breakdown.creditsBySource.credit_sale || 0,
                  )}
                </p>
                <p className='text-[10px] text-gray-400 mt-1'>
                  Buy now, pay later
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Search ─────────────────────────────────────────── */}
      <div className='relative mb-4'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400' />
        <input
          type='text'
          value={inputValue}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder='Search transactions...'
          className='w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors'
        />
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      <div className='bg-white rounded-xl border border-gray-200/80 overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead>
              <tr className='border-b border-gray-100'>
                <th className='px-5 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase'>
                  Date
                </th>
                <th className='px-5 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase'>
                  Description
                </th>
                <th className='px-5 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase hidden sm:table-cell'>
                  Ref
                </th>
                <th className='px-5 py-3 text-right text-[10px] font-semibold text-gray-500 uppercase'>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-50'>
              {loading ? (
                <tr>
                  <td colSpan={4} className='py-16 text-center'>
                    <Loader2 className='h-5 w-5 animate-spin text-gray-300 mx-auto' />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className='py-16 text-center text-sm text-gray-400'
                  >
                    {storeSearchQuery
                      ? 'No results'
                      : isWallet
                        ? 'No wallet transactions yet'
                        : 'No sales recorded yet'}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleTxnClick(item)}
                    className='hover:bg-gray-50/60 cursor-pointer transition-colors'
                  >
                    <td className='px-5 py-3 text-xs text-gray-500 whitespace-nowrap'>
                      {formatDate(item.date)}
                    </td>
                    <td className='px-5 py-3 text-sm text-gray-900'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <span>{item.description}</span>
                        {item.needsVerification && (
                          <span className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300'>
                            <AlertCircle className='h-3 w-3 text-amber-600' />
                            Unverified Inflow
                          </span>
                        )}
                      </div>
                    </td>
                    <td className='px-5 py-3 text-[11px] font-mono text-gray-400 hidden sm:table-cell'>
                      {item.reference || '—'}
                    </td>
                    <td
                      className={`px-5 py-3 text-sm font-semibold text-right whitespace-nowrap tabular-nums ${
                        item.entryType === 'credit'
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {item.entryType === 'credit' ? '+' : '-'}
                      {formatNaira(item.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className='flex items-center justify-between px-5 py-3 border-t border-gray-100'>
            <p className='text-[11px] text-gray-400'>
              {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)}{' '}
              of {pagination.total}
            </p>
            <div className='flex gap-1'>
              <button
                onClick={() =>
                  biz?.id &&
                  useLedgerStore.getState().setPage(biz.id, pagination.page - 1)
                }
                disabled={!pagination.hasPrev || loading}
                className='p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors'
              >
                <ChevronLeft className='h-4 w-4' />
              </button>
              <button
                onClick={() =>
                  biz?.id &&
                  useLedgerStore.getState().setPage(biz.id, pagination.page + 1)
                }
                disabled={!pagination.hasNext || loading}
                className='p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors'
              >
                <ChevronRight className='h-4 w-4' />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      <StatementExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        businessId={biz.id}
        businessName={biz.businessName}
      />

      {selectedTxn && (
        <TransactionDetailPanel
          isOpen={Boolean(selectedTxn)}
          transaction={selectedTxn}
          onClose={() => setSelectedTxn(null)}
        />
      )}
    </div>
  );
}
