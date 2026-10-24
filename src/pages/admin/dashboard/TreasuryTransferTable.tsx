import { memo, useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import type { TransferMarginItem } from '@/types/index.ts';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import { formatNaira, formatSignedNaira, formatTransferStamp } from '../shared/format';

interface Row {
  id: string;
  type: 'inflow' | 'outflow';
  reference: string;
  stamp: string;
  businessName: string;
  gross: string;
  fee: string;
  feeIsMuted: boolean;
  cost: string;
  costIsMuted: boolean;
  margin: string;
  isLoss: boolean;
}

function buildRows(transfers: TransferMarginItem[]): Row[] {
  return transfers.map((item) => ({
    id: item.id,
    type: item.type,
    reference: item.reference,
    stamp: formatTransferStamp(item.date),
    businessName: item.businessName,
    gross: formatNaira(item.grossAmount),
    fee: item.feeCollected > 0 ? formatSignedNaira(item.feeCollected) : formatNaira(0),
    feeIsMuted: item.feeCollected <= 0,
    cost: item.gatewayCost > 0 ? formatSignedNaira(-item.gatewayCost) : formatNaira(0),
    costIsMuted: item.gatewayCost <= 0,
    margin: formatSignedNaira(item.netMargin),
    isLoss: item.netMargin < 0,
  }));
}

function TransferTable({
  transfers,
  isLoading,
  hasLoadedOnce,
  onInspect,
}: {
  transfers: TransferMarginItem[];
  isLoading: boolean;
  hasLoadedOnce: boolean;
  onInspect: (id: string, type: 'inflow' | 'outflow') => void;
}) {
  // Formatting runs once per fetched page, not once per render. This is what
  // stopped treasury-search keystrokes from re-running 20×3 Intl calls.
  const rows = useMemo(() => buildRows(transfers), [transfers]);

  const showSkeleton = isLoading && !hasLoadedOnce;

  return (
    // `isolate` bounds the stretched-link overlay to this table so it can't
    // escape into the pagination bar below.
    <div className='isolate overflow-x-auto'>
      <table className='w-full min-w-[880px] text-left text-xs'>
        <thead className='border-b border-hairline-strong bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
          <tr>
            <th scope='col' className='px-3 py-1.5'>Date &amp; Reference</th>
            <th scope='col' className='px-3 py-1.5'>Type</th>
            <th scope='col' className='px-3 py-1.5'>Merchant / Business</th>
            <th scope='col' className='w-[110px] px-3 py-1.5 text-right'>Gross Amount</th>
            <th scope='col' className='w-[110px] px-3 py-1.5 text-right'>Platform Fee</th>
            <th scope='col' className='w-[110px] px-3 py-1.5 text-right'>Gateway Cost</th>
            <th scope='col' className='w-[110px] px-3 py-1.5 text-right'>Net Margin</th>
            <th scope='col' className='w-[80px] px-3 py-1.5 text-center'>Action</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-hairline'>
          {showSkeleton ? (
            <tr>
              <td colSpan={8} className='p-3'>
                <TableSkeleton rows={6} columns={8} showHeader={false} />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={8} className='px-3 py-14 text-center'>
                <Scale className='mx-auto mb-2 h-8 w-8 text-hairline-strong' aria-hidden='true' />
                <p className='text-xs font-semibold text-ink'>No transfer records found</p>
                <p className='mt-1 text-[11px] text-ink-subtle'>
                  Try adjusting your filters or search terms.
                </p>
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const isInflow = row.type === 'inflow';
              return (
                // The row is NOT clickable and carries no tabIndex — that would
                // destroy row/cell semantics for screen readers. The Inspect
                // button's ::after overlay provides the full-row hit area.
                <tr key={row.id} className='relative transition-colors hover:bg-panel-subtle'>
                  <td className='px-3 py-1.5'>
                    <p className='font-mono text-xs font-medium text-ink'>{row.reference}</p>
                    <p className='font-mono text-[10px] text-ink-subtle'>{row.stamp}</p>
                  </td>

                  <td className='px-3 py-1.5'>
                    <span className='inline-flex items-center gap-1 text-[11px] text-ink-muted'>
                      {isInflow ? (
                        <ArrowDownLeft className='h-3 w-3 text-info-600' aria-hidden='true' />
                      ) : (
                        <ArrowUpRight className='h-3 w-3 text-primary-600' aria-hidden='true' />
                      )}
                      {isInflow ? 'DVA Inflow' : 'Payout'}
                    </span>
                  </td>

                  <td className='px-3 py-1.5 text-ink'>{row.businessName}</td>

                  <td className='px-3 py-1.5 text-right font-mono tabular-nums font-medium text-ink'>
                    {row.gross}
                  </td>

                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                      row.feeIsMuted ? 'text-ink-subtle' : 'text-success-700'
                    }`}
                  >
                    {row.fee}
                  </td>

                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                      row.costIsMuted ? 'text-ink-subtle' : 'text-ink-muted'
                    }`}
                  >
                    {row.cost}
                  </td>

                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${
                      row.isLoss ? 'text-danger-600' : 'text-success-700'
                    }`}
                  >
                    {row.margin}
                  </td>

                  <td className='px-3 py-1.5 text-center'>
                    <button
                      type='button'
                      onClick={() => onInspect(row.id, row.type)}
                      className='rounded px-2 py-0.5 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none after:absolute after:inset-0 after:content-[""]'
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default memo(TransferTable);