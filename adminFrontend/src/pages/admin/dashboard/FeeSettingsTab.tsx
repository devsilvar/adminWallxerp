import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.tsx';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import api from '@/lib/axios.ts';
import type { PlatformFeeConfig } from '@/types/index.ts';
import { Panel, PanelHeader } from '../shared/Panel';
import { formatNaira, formatSignedNaira, formatStamp } from '../shared/format';

const inputClass =
  'h-8 w-full rounded border border-hairline-strong bg-panel px-2.5 font-mono text-xs text-ink focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none';

export default function FeeSettingsTab({ onSweepCompleted: _onSweepCompleted }: { onSweepCompleted?: () => void } = {}) {
  const [feeConfig, setFeeConfig] = useState<PlatformFeeConfig | null>(null);
  const [feeForm, setFeeForm] = useState({
    withdrawalFeePct: 1.0,
    withdrawalFeeCap: 300,
    minWithdrawalAmount: 1000,
  });
  const [isFeeLoading, setIsFeeLoading] = useState(false);
  const [isFeeSaving, setIsFeeSaving] = useState(false);

  useEffect(() => {
    setIsFeeLoading(true);
    api.get('/admin/settings/fees')
      .then((r) => {
        const cfg = r.data.data;
        setFeeConfig(cfg);
        setFeeForm({
          withdrawalFeePct: Number(cfg.withdrawalFeePct),
          withdrawalFeeCap: Number(cfg.withdrawalFeeCap),
          minWithdrawalAmount: Number(cfg.minWithdrawalAmount),
        });
      })
      .catch((err: any) => {
        toast.error(err.response?.data?.error?.message || 'Failed to load fee configuration');
      })
      .finally(() => setIsFeeLoading(false));
  }, []);

  const handleSaveFeeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsFeeSaving(true);
    try {
      const res = await api.patch('/admin/settings/fees', {
        withdrawalFeePct: Number(feeForm.withdrawalFeePct),
        withdrawalFeeCap: Number(feeForm.withdrawalFeeCap),
        minWithdrawalAmount: Number(feeForm.minWithdrawalAmount),
      });
      setFeeConfig(res.data.data);
      toast.success('Platform fee configuration saved successfully.');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to update fee settings');
    } finally {
      setIsFeeSaving(false);
    }
  };

  const simulatedTiers = useMemo(() => {
    const minAmt = Math.max(100, Number(feeForm.minWithdrawalAmount) || 1000);
    const standardTiers = [5000, 10000, 50000, 100000, 250000];
    const rawAmounts = [minAmt, ...standardTiers.filter((t) => t > minAmt)];
    const amounts = Array.from(new Set(rawAmounts)).sort((a, b) => a - b);
    const pct = Number(feeForm.withdrawalFeePct) || 0;
    const cap = Number(feeForm.withdrawalFeeCap) || 0;

    return amounts.map((amt) => {
      const customerFee = Math.min((amt * pct) / 100, cap);

      let transferFee = 50;
      if (amt <= 5000) transferFee = 10;
      else if (amt <= 50000) transferFee = 25;

      const stampDuty = amt >= 10000 ? 50 : 0;
      const totalGatewayCost = transferFee + stampDuty;
      const netMargin = customerFee - totalGatewayCost;

      return { amount: amt, customerFee, totalGatewayCost, netMargin, isProfit: netMargin >= 0 };
    });
  }, [feeForm.withdrawalFeePct, feeForm.withdrawalFeeCap, feeForm.minWithdrawalAmount]);

  return (
    <div className='max-w-5xl space-y-4'>
      <div className='grid grid-cols-1 items-start gap-4 lg:grid-cols-2'>
        <Panel>
          <PanelHeader
            title='Global Withdrawal Fee Policy'
            hint='Applies dynamically to all merchant disbursements across the platform.'
          />
          <div className='px-3 py-3'>
            {isFeeLoading ? (
              <div className='space-y-4'>
                <Skeleton width='100%' height={32} />
                <Skeleton width='100%' height={32} />
                <Skeleton width='100%' height={32} />
                <Skeleton width='100%' height={32} />
              </div>
            ) : (
              <form onSubmit={handleSaveFeeConfig} className='space-y-4'>
                <div>
                  <label htmlFor='fee-pct' className='mb-1 block text-[11px] font-medium text-ink-muted'>
                    Withdrawal fee percentage (%)
                  </label>
                  <div className='relative'>
                    <input
                      id='fee-pct'
                      type='number'
                      step='0.01'
                      min='0'
                      max='10'
                      required
                      value={feeForm.withdrawalFeePct}
                      onChange={(e) =>
                        setFeeForm({ ...feeForm, withdrawalFeePct: parseFloat(e.target.value) || 0 })
                      }
                      className={`${inputClass} pr-7`}
                    />
                    <span className='absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-subtle'>%</span>
                  </div>
                  <p className='mt-1 text-[10px] text-ink-subtle'>
                    Standard fee charged to merchant on withdrawal (default: 1.00%).
                  </p>
                </div>

                <div>
                  <label htmlFor='fee-cap' className='mb-1 block text-[11px] font-medium text-ink-muted'>
                    Maximum fee cap (₦)
                  </label>
                  <input
                    id='fee-cap'
                    type='number'
                    step='1'
                    min='0'
                    max='100000'
                    required
                    value={feeForm.withdrawalFeeCap}
                    onChange={(e) =>
                      setFeeForm({ ...feeForm, withdrawalFeeCap: parseFloat(e.target.value) || 0 })
                    }
                    className={inputClass}
                  />
                  <p className='mt-1 text-[10px] text-ink-subtle'>
                    Maximum fee collected regardless of withdrawal volume (default: ₦300.00).
                  </p>
                </div>

                <div>
                  <label htmlFor='fee-min' className='mb-1 block text-[11px] font-medium text-ink-muted'>
                    Minimum withdrawal floor (₦)
                  </label>
                  <input
                    id='fee-min'
                    type='number'
                    step='100'
                    min='100'
                    max='1000000'
                    required
                    value={feeForm.minWithdrawalAmount}
                    onChange={(e) =>
                      setFeeForm({ ...feeForm, minWithdrawalAmount: parseFloat(e.target.value) || 0 })
                    }
                    className={inputClass}
                  />
                  <p className='mt-1 text-[10px] text-ink-subtle'>
                    Minimum allowable withdrawal request amount (default: ₦1,000.00).
                  </p>
                </div>

                {feeConfig?.updatedAt && (
                  <div className='flex items-center justify-between rounded border border-hairline bg-panel-subtle px-2.5 py-1.5 text-[10px] text-ink-muted'>
                    <span>Last policy update</span>
                    <span className='font-mono text-ink'>{formatStamp(feeConfig.updatedAt)}</span>
                  </div>
                )}

                <Button type='submit' size='sm' isLoading={isFeeSaving} className='w-full'>
                  {isFeeSaving ? 'Saving policy...' : 'Save & deploy fee configuration'}
                </Button>
              </form>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title='Live Dynamic Margin Simulator'
            hint='Real-time projected platform revenue vs Paystack gateway fees.'
          />
          <div className='px-3 py-3'>
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[380px] text-left text-xs'>
                <thead className='border-b border-hairline-strong bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                  <tr>
                    <th scope='col' className='px-2 py-1.5'>Requested</th>
                    <th scope='col' className='px-2 py-1.5 text-right'>Cust. fee</th>
                    <th scope='col' className='px-2 py-1.5 text-right'>Gateway cost</th>
                    <th scope='col' className='px-2 py-1.5 text-right'>Net margin</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-hairline'>
                  {simulatedTiers.map((tier) => (
                    <tr key={tier.amount} className='transition-colors hover:bg-panel-subtle'>
                      <td className='px-2 py-1.5 font-mono tabular-nums font-medium text-ink'>
                        {formatNaira(tier.amount)}
                      </td>
                      <td className='px-2 py-1.5 text-right font-mono tabular-nums text-success-700'>
                        {formatSignedNaira(tier.customerFee)}
                      </td>
                      <td className='px-2 py-1.5 text-right font-mono tabular-nums text-ink-muted'>
                        {formatSignedNaira(-tier.totalGatewayCost)}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-mono tabular-nums font-semibold ${
                          tier.isProfit ? 'text-success-700' : 'text-danger-600'
                        }`}
                      >
                        {formatSignedNaira(tier.netMargin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className='mt-3 space-y-1 rounded border border-info-200 bg-info-50 px-2.5 py-2 text-[10px] text-info-700'>
              <p className='flex items-center gap-1.5 font-semibold text-info-700'>
                <Info className='h-3.5 w-3.5 shrink-0' aria-hidden='true' /> Paystack &amp; Federal cost rules
              </p>
              <ul className='list-disc space-y-0.5 pl-4'>
                <li>₦10 transfer fee on amounts up to ₦5,000</li>
                <li>₦25 transfer fee on amounts ₦5,001 – ₦50,000</li>
                <li>₦50 transfer fee on amounts over ₦50,000</li>
                <li>₦50 Federal EMTL (Electronic Money Transfer Levy) on amounts ₦10,000 and above</li>
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}