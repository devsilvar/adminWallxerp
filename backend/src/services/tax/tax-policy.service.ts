import prisma, { TxClient } from '@/lib/prisma';
import logger from '@/lib/logger';
import config from '@/config';
import type { TaxProfileConfiguration } from '@/shared/tax-constants';

export interface BusinessTaxPolicy {
  source: 'PROFILE' | 'DEFAULT';
  vat: { chargeable: boolean; rate: number; reason: string | null };
  incomeTax: { type: 'CIT' | 'PIT'; rate: number; devLevyRate: number };
  /**
   * TAX-20: Advisory labels for taxes that have no in-app workflow.
   * These are informational only — no DB writes, no new columns.
   * Populated only for PROFILE-sourced policies; always [] for DEFAULT.
   */
  advisories: string[];
}

/**
 * What a monthly payment actually settles, derived from the policy.
 * `MonthlyTaxReport` has no column for this, so it is always computed on read.
 */
/**
 * A profile counts only when the quiz was completed AND produced a usable
 * configuration. Anything less has no statutory scenario to apply.
 */
export function isTaxProfileComplete(
  profile: { completedAt: Date | null; computedConfig: unknown } | null | undefined
): boolean {
  if (!profile?.completedAt || !profile.computedConfig) return false;
  if (typeof profile.computedConfig !== 'object') return false;
  return Object.keys(profile.computedConfig as Record<string, unknown>).length > 0;
}

export type TaxPaymentBasis = 'vat' | 'cit-provision' | 'pit-provision';

export function paymentBasisForPolicy(policy: BusinessTaxPolicy): TaxPaymentBasis {
  if (policy.vat.chargeable) return 'vat';
  return policy.incomeTax.type === 'PIT' ? 'pit-provision' : 'cit-provision';
}

/**
 * Resolves the statutory tax policy governing a business.
 *
 * Rules:
 * - Read business_tax_profiles once per call (completedAt, computedConfig). No caching.
 * - No profile, uncompleted profile, or empty computedConfig => source: 'DEFAULT',
 *   vat.chargeable: true, vat.rate: config.tax.defaultRate, incomeTax: { type: 'CIT', rate: config.tax.defaultRate, devLevyRate: 0 }.
 * - With a completed profile:
 *     - If legacy inconsistent row (vatExempt: false && mustChargeVat: false):
 *         chargeable: false, rate: 0, logger.warn.
 *     - Otherwise:
 *         chargeable = !vatExempt && mustChargeVat.
 *         rate = chargeable ? config.tax.defaultRate : 0.
 *     - incomeTax from incomeTaxType ('CIT' | 'PIT'), citRate, devLevyRate.
 */
export async function resolveTaxPolicy(
  businessId: string,
  client?: TxClient | typeof prisma,
): Promise<BusinessTaxPolicy> {
  const db = client ?? prisma;
  const profile = await db.businessTaxProfile.findUnique({
    where: { businessId },
    select: {
      completedAt: true,
      computedConfig: true,
    },
  });

  if (!profile || !profile.completedAt || !profile.computedConfig) {
    return {
      source: 'DEFAULT',
      vat: {
        chargeable: true,
        rate: config.tax.defaultRate,
        reason: null,
      },
      incomeTax: {
        type: 'CIT',
        rate: config.tax.defaultRate,
        devLevyRate: 0,
      },
      advisories: [],
    };
  }

  const cfg = profile.computedConfig as unknown as Partial<TaxProfileConfiguration>;

  if (Object.keys(cfg).length === 0) {
    return {
      source: 'DEFAULT',
      vat: {
        chargeable: true,
        rate: config.tax.defaultRate,
        reason: null,
      },
      incomeTax: {
        type: 'CIT',
        rate: config.tax.defaultRate,
        devLevyRate: 0,
      },
      advisories: [],
    };
  }

  let chargeable = false;
  let reason: string | null = null;

  // Normalise legacy inconsistent rows: vatExempt: false and mustChargeVat: false
  if (cfg.vatExempt === false && cfg.mustChargeVat === false) {
    logger.warn('Legacy inconsistent tax profile detected: vatExempt=false and mustChargeVat=false', { businessId });
    chargeable = false;
    reason = 'Inconsistent tax profile: marked neither exempt nor chargeable (treated as not chargeable)';
  } else {
    chargeable = !cfg.vatExempt && !!cfg.mustChargeVat;
    if (Array.isArray(cfg.reviewReasons) && cfg.reviewReasons.length > 0) {
      reason = cfg.reviewReasons.find((r) => r.toLowerCase().includes('vat')) ?? cfg.reviewReasons[0];
    }
  }

  const vatRate = chargeable ? config.tax.defaultRate : 0;
  const incomeTaxType: 'CIT' | 'PIT' = cfg.incomeTaxType === 'PIT' ? 'PIT' : 'CIT';
  const incomeTaxRate = typeof cfg.citRate === 'number' ? cfg.citRate : 0;
  const devLevyRate = typeof cfg.devLevyRate === 'number' ? cfg.devLevyRate : 0;

  // TAX-20: Compute advisory labels for taxes with no in-app workflow
  const advisories: string[] = [];

  // PAYE advisory: business must deduct employee tax but the app has no PAYE workflow
  if (cfg.mustDeductPAYE === true) {
    advisories.push(
      'PAYE Advisory: Your business is required to deduct and remit PAYE (employee income tax) ' +
      'by the 10th of each month. This is not currently tracked in-app — please use a payroll system.',
    );
  }

  // WHT advisory: business must deduct withholding tax — in-app tracking is optional
  if (cfg.mustDeductWHT === true) {
    const exemptNote =
      typeof cfg.whtTransactionExemptionLimit === 'number'
        ? ' Transactions up to \u20a6' + cfg.whtTransactionExemptionLimit.toLocaleString('en-NG') + ' per vendor are exempt.'
        : '';
    advisories.push(
      'WHT Advisory: Your business must deduct Withholding Tax on qualifying payments and remit ' +
      'by the 21st of the following month.' + exemptNote +
      ' In-app WHT credit tracking is available but not enforced.',
    );
  }

  // CGT/Annual filing advisory: CIT businesses with rate > 0 have an annual filing obligation
  if (incomeTaxType === 'CIT' && incomeTaxRate > 0) {
    advisories.push(
      'CIT Annual Filing Advisory: Your business is subject to 30% Corporate Income Tax. ' +
      'Annual CIT returns must be filed with FIRS within 6 months of your fiscal year end ' +
      '(typically 30 June for calendar-year businesses). ' +
      'Capital Gains Tax (CGT) at 30% also applies on disposal of chargeable assets.',
    );
  }

  return {
    source: 'PROFILE',
    vat: {
      chargeable,
      rate: vatRate,
      reason,
    },
    incomeTax: {
      type: incomeTaxType,
      rate: incomeTaxRate,
      devLevyRate,
    },
    advisories,
  };
}
