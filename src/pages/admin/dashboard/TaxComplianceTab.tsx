import { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.tsx';
import api from '@/lib/axios.ts';
import type { PlatformTaxConfig } from '@/types/index.ts';
import {
  HairlineCell,
  HairlineGrid,
  Panel,
  PanelHeader,
} from '../shared/Panel';
import StatusPill from '../shared/StatusPill';
import { formatDate } from '../shared/format';

const DEDUCTIBLE = [
  'Rent & Office Space',
  'Staff Salaries & Wages',
  'Cost of Goods / Inventory',
  'Power, Fuel & Utilities',
  'Marketing & Logistics',
  'Bad Debt Write-offs (CITA §25)',
];

export default function TaxComplianceTab() {
  const [taxConfig, setTaxConfig] = useState<PlatformTaxConfig | null>(null);
  const [taxForm, setTaxForm] = useState({
    autoFinalizeDay: 20,
    autoFinalizeEnabled: true,
  });
  const [isTaxLoading, setIsTaxLoading] = useState(false);
  const [isTaxSaving, setIsTaxSaving] = useState(false);

  useEffect(() => {
    setIsTaxLoading(true);
    api
      .get('/admin/settings/tax')
      .then((r) => {
        const cfg = r.data.data;
        setTaxConfig(cfg);
        setTaxForm({
          autoFinalizeDay: Number(cfg.autoFinalizeDay ?? 20),
          autoFinalizeEnabled: cfg.autoFinalizeEnabled !== false,
        });
      })
      .catch((err: any) => {
        toast.error(
          err.response?.data?.error?.message ||
            'Failed to load tax configuration',
        );
      })
      .finally(() => setIsTaxLoading(false));
  }, []);

  const handleSaveTaxConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTaxSaving(true);
    try {
      const res = await api.patch('/admin/settings/tax', {
        autoFinalizeDay: Number(taxForm.autoFinalizeDay),
        autoFinalizeEnabled: Boolean(taxForm.autoFinalizeEnabled),
      });
      setTaxConfig(res.data.data);
      toast.success(
        'Platform tax compliance & auto-finalization configuration saved.',
      );
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to update tax settings',
      );
    } finally {
      setIsTaxSaving(false);
    }
  };

  const handleToggleAutoFinalize = async () => {
    const nextState = !taxForm.autoFinalizeEnabled;
    setTaxForm((prev) => ({ ...prev, autoFinalizeEnabled: nextState }));
    try {
      const res = await api.patch('/admin/settings/tax', {
        autoFinalizeEnabled: nextState,
      });
      setTaxConfig(res.data.data);
      toast.success(
        `Tax auto-finalization engine ${nextState ? 'enabled' : 'disabled'}.`,
      );
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          'Failed to toggle auto-finalization',
      );
      setTaxForm((prev) => ({ ...prev, autoFinalizeEnabled: !nextState }));
    }
  };

  return (
    <div className='max-w-5xl space-y-4'>
      <Panel>
        <header className='flex flex-col items-start justify-between gap-3 border-b border-hairline px-3 py-2.5 md:flex-row md:items-center'>
          <div className='flex items-start gap-2.5'>
            <Calendar
              className='mt-0.5 h-4 w-4 shrink-0 text-primary-600'
              aria-hidden='true'
            />
            <div>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 className='text-[13px] font-semibold text-ink'>
                  NRS Statutory Tax Auto-Finalization Engine
                </h2>
                <StatusPill
                  tone={taxForm.autoFinalizeEnabled ? 'success' : 'danger'}
                >
                  {taxForm.autoFinalizeEnabled
                    ? 'Engine active'
                    : 'Engine disabled'}
                </StatusPill>
              </div>
              <p className='mt-0.5 max-w-2xl text-[11px] text-ink-muted'>
                Nigerian Tax Compliance (NRS VAT Act §15 &amp; CITA §55): draft
                tax reports for the concluded prior month remain editable from
                Day 1 through month-end. On the designated admin
                auto-finalization day each month, unfinalized drafts are
                recalculated against live sales and allowable expenses, then
                committed to finalized status.
              </p>
            </div>
          </div>

          <div className='shrink-0'>
            <Button
              type='button'
              variant={taxForm.autoFinalizeEnabled ? 'danger' : 'primary'}
              size='sm'
              onClick={handleToggleAutoFinalize}
            >
              <Power className='h-3.5 w-3.5' />
              {taxForm.autoFinalizeEnabled
                ? 'Disable auto-finalization'
                : 'Enable auto-finalization'}
            </Button>
          </div>
        </header>

        <div className='p-3'>
          <HairlineGrid columns={3}>
            <HairlineCell>
              <p className='text-[11px] text-ink-muted'>Day 1 of each month</p>
              <p className='mt-0.5 text-xs font-medium text-ink'>
                Finalization opens
              </p>
              <p className='mt-0.5 text-[10px] text-ink-subtle'>
                Businesses receive automated review reminders to reconcile sales
                &amp; expenses.
              </p>
            </HairlineCell>
            <HairlineCell className='bg-primary-50'>
              <p className='text-[11px] text-ink-muted'>
                Day {taxForm.autoFinalizeDay} of month
              </p>
              <p className='mt-0.5 text-xs font-medium text-ink'>
                Automated nightly sweep
              </p>
              <p className='mt-0.5 text-[10px] text-ink-subtle'>
                Unfinalized drafts auto-finalize with live recalculation to
                prevent statutory non-compliance.
              </p>
            </HairlineCell>
            <HairlineCell>
              <p className='text-[11px] text-ink-muted'>Day 21 of month</p>
              <p className='mt-0.5 text-xs font-medium text-ink'>
                NRS statutory remittance
              </p>
              <p className='mt-0.5 text-[10px] text-ink-subtle'>
                Statutory deadline for remitting tax to avoid NRS late-payment
                penalties.
              </p>
            </HairlineCell>
          </HairlineGrid>
        </div>
      </Panel>

      <div className='grid grid-cols-1 items-start gap-4 lg:grid-cols-2'>
        <Panel>
          <PanelHeader title='Auto-Finalization Day Configuration' />
          <div className='px-3 py-3'>
            <form onSubmit={handleSaveTaxConfig} className='space-y-4'>
              <div>
                <label
                  htmlFor='finalize-day'
                  className='mb-1 block text-[11px] font-medium text-ink-muted'
                >
                  Cron execution day of month (1 – 28)
                </label>
                <div className='flex items-center gap-3'>
                  <input
                    id='finalize-day'
                    type='number'
                    min={1}
                    max={28}
                    required
                    value={taxForm.autoFinalizeDay}
                    onChange={(e) =>
                      setTaxForm((prev) => ({
                        ...prev,
                        autoFinalizeDay: Number(e.target.value),
                      }))
                    }
                    className='h-8 w-28 rounded border border-hairline-strong bg-panel px-2.5 font-mono text-xs font-medium text-ink focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
                  />
                  <span className='text-[11px] text-ink-muted'>
                    Day {taxForm.autoFinalizeDay} of each month
                  </span>
                </div>
                <p className='mt-1 text-[10px] text-ink-subtle'>
                  Recommended statutory setting: <strong>Day 20</strong> (1 day
                  before the NRS 21st deadline) or <strong>Day 21</strong> (the
                  official deadline date).
                </p>
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-[11px] font-medium text-ink-muted'>
                  Statutory presets
                </span>
                {[20, 21].map((day) => (
                  <button
                    key={day}
                    type='button'
                    onClick={() =>
                      setTaxForm((prev) => ({ ...prev, autoFinalizeDay: day }))
                    }
                    aria-pressed={taxForm.autoFinalizeDay === day}
                    className={`h-7 rounded border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
                      taxForm.autoFinalizeDay === day
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-hairline bg-panel text-ink-muted hover:bg-panel-subtle hover:text-ink'
                    }`}
                  >
                    Day {day}
                  </button>
                ))}
                <span className='text-[10px] text-ink-subtle'>
                  {taxForm.autoFinalizeDay === 20
                    ? 'Pre-deadline sweep'
                    : taxForm.autoFinalizeDay === 21
                      ? 'NRS due date'
                      : 'Custom day'}
                </span>
              </div>

              <div className='flex items-center justify-between gap-3 border-t border-hairline pt-3'>
                <span className='text-[10px] text-ink-subtle'>
                  {isTaxLoading
                    ? 'Loading current setting...'
                    : taxConfig?.updatedAt
                      ? `Last modified ${formatDate(taxConfig.updatedAt)}`
                      : ''}
                </span>
                <Button
                  type='submit'
                  size='sm'
                  isLoading={isTaxSaving}
                  disabled={isTaxSaving || isTaxLoading}
                >
                  Save tax configuration
                </Button>
              </div>
            </form>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title='Allowable Expense Deductibility Verification' />
          <div className='space-y-3 px-3 py-3 text-[11px] leading-relaxed text-ink-muted'>
            <p>
              Under NRS CITA Section 24 and statutory tax guidelines, allowable
              operational expenses directly reduce taxable turnover to compute{' '}
              <strong className='text-ink'>Gross Profit</strong>:
            </p>

            <div className='rounded border border-hairline bg-panel-subtle px-2.5 py-2 font-mono text-xs text-ink'>
              <p className='font-semibold'>Tax base formula</p>
              <p className='mt-1'>
                Gross Profit = Total Sales − Allowable Expenses
              </p>
              <p className='mt-1'>Tax Payable = 7.5% × Gross Profit</p>
            </div>

            <p className='font-medium text-ink'>
              Categories verified as automatically deductible (
              <span className='font-mono text-success-700'>
                isDeductible = true
              </span>
              ):
            </p>

            <ul className='grid grid-cols-1 gap-1.5 sm:grid-cols-2'>
              {DEDUCTIBLE.map((item) => (
                <li
                  key={item}
                  className='flex items-center gap-1.5 rounded border border-hairline bg-panel-subtle px-2 py-1.5 text-[11px] text-ink'
                >
                  <CheckCircle2
                    className='h-3.5 w-3.5 shrink-0 text-success-600'
                    aria-hidden='true'
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
