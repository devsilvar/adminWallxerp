import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { verifyBusinessAccess } from '@/lib/ownership';
import { AppError } from '@/middleware/errorHandler';
import { evaluateTaxConfig } from '@/shared/tax-quiz-engine';
import { STATUTORY_TAX_CONSTANTS, type AnnualTurnoverOption } from '@/shared/tax-constants';
import { generateTaxObligationReport } from '@/services/pdf/tax-obligation-report';
import type { QuizAnswers, TaxProfileConfiguration } from '@/shared/tax-constants';
import { resolveTaxPolicy, type BusinessTaxPolicy } from './tax-policy.service';
import { calculateTaxWithStrategy } from './tax-calculation-strategy';

export type { BusinessTaxPolicy };

/**
 * Retrieve resolved tax policy for a business
 * Note: authorized by 'tax.read', does not require active subscription (accessible during grace period)
 */
export async function getTaxPolicy(userId: string, businessId: string): Promise<BusinessTaxPolicy> {
  await verifyBusinessAccess(userId, businessId, 'tax.read');
  return resolveTaxPolicy(businessId);
}

/**
 * Retrieve tax profile for a business
 */
export async function getTaxProfile(userId: string, businessId: string) {
  await verifyBusinessAccess(userId, businessId, 'tax.read');

  return prisma.businessTaxProfile.findUnique({
    where: { businessId },
    select: {
      id: true,
      businessId: true,
      quizAnswers: true,
      computedConfig: true,
      completedAt: true,
      lastReviewedAt: true,
      needsManualReview: true,
      reviewReasons: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Save or update tax profile from quiz answers
 */
export async function saveTaxProfile(
  userId: string,
  businessId: string,
  answers: QuizAnswers
): Promise<{
  profile: any;
  config: TaxProfileConfiguration;
}> {
  // Owner, manager, or accountant — whoever may calculate tax may set its inputs.
  await verifyBusinessAccess(userId, businessId, 'tax.calculate');

  // Pure deterministic evaluation
  const config = evaluateTaxConfig(answers);

  // Read before the upsert so the audit trail carries the config being replaced
  const existing = await prisma.businessTaxProfile.findUnique({
    where: { businessId },
    select: { quizAnswers: true, computedConfig: true },
  });

  // Persist to database
  const profile = await prisma.businessTaxProfile.upsert({
    where: { businessId },
    create: {
      businessId,
      quizAnswers: answers as any,
      computedConfig: config as any,
      completedAt: new Date(),
      needsManualReview: config.needsManualReview,
      reviewReasons: config.reviewReasons,
    },
    update: {
      quizAnswers: answers as any,
      computedConfig: config as any,
      completedAt: new Date(),
      lastReviewedAt: new Date(),
      needsManualReview: config.needsManualReview,
      reviewReasons: config.reviewReasons,
    },
  });

  // Audit trail
  await logAudit({
    userId,
    businessId,
    action: 'tax_profile.updated',
    resourceType: 'business_tax_profile',
    resourceId: profile.id,
    oldData: existing
      ? { answers: existing.quizAnswers, config: existing.computedConfig }
      : undefined,
    newData: { answers, config },
  });

  logger.info('Tax profile saved successfully', {
    businessId,
    vatExempt: config.vatExempt,
    citRate: config.citRate,
    needsReview: config.needsManualReview,
  });

  // ── TAX-18: Recalculate unlocked reports after profile save ──────────────
  await recalculateUnlockedReports(businessId, profile.id, config);

  // ── TAX-19: Check T12M turnover vs declared band ─────────────────────────
  await checkT12mTurnoverParity(businessId, answers.annualTurnover, profile.id);

  return { profile, config };
}

/**
 * Delete tax profile (reset to baseline)
 */
export async function deleteTaxProfile(userId: string, businessId: string) {
  await verifyBusinessAccess(userId, businessId, 'tax.calculate');

  const existing = await prisma.businessTaxProfile.findUnique({
    where: { businessId },
  });

  if (!existing) {
    throw new AppError(404, 'Tax profile not found for this business', 'NOT_FOUND');
  }

  const deleted = await prisma.businessTaxProfile.delete({
    where: { businessId },
  });

  await logAudit({
    userId,
    businessId,
    action: 'tax_profile.deleted',
    resourceType: 'business_tax_profile',
    resourceId: deleted.id,
    oldData: deleted as any,
  });

  return deleted;
}

/**
 * Generate official PDF tax obligation report based on completed profile
 */
export async function getObligationReportPdf(userId: string, businessId: string): Promise<Buffer> {
  const { business } = await verifyBusinessAccess(userId, businessId, 'tax.read');

  const profile = await prisma.businessTaxProfile.findUnique({
    where: { businessId },
  });

  if (!profile) {
    throw new AppError(404, 'Tax profile not found. Please complete the quiz first.', 'PROFILE_NOT_FOUND');
  }

  return generateTaxObligationReport({
    business: {
      id: business.id,
      businessName: business.businessName,
      ownerName: business.ownerName,
      taxId: business.taxId,
    },
    answers: profile.quizAnswers as any,
    config: profile.computedConfig as any,
    completedAt: profile.completedAt,
  });
}

// ─── TAX-18 helper ────────────────────────────────────────────────────────────

/**
 * After a profile save, recalculate taxPayable/taxRate for every unlocked
 * MonthlyTaxReport for this business in the current year.
 * Locked reports are audited (logged) but never updated.
 */
async function recalculateUnlockedReports(
  businessId: string,
  profileId: string,
  // newConfig is reserved for future use (e.g. strategy selection hints)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _newConfig: TaxProfileConfiguration,
): Promise<void> {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(currentYear, 0, 1));
  const yearEnd = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));

  const reports = await prisma.monthlyTaxReport.findMany({
    where: {
      businessId,
      taxMonth: { gte: yearStart, lte: yearEnd },
    },
    select: {
      id: true,
      taxMonth: true,
      totalSales: true,
      totalExpenses: true,
      grossProfit: true,
      taxPayable: true,
      taxRate: true,
      isLocked: true,
    },
  });

  // Pre-fetch the saved profile once for the dispatcher
  // (prevents nested Prisma client calls inside strategy execution)
  const freshProfile = await prisma.businessTaxProfile.findUnique({
    where: { businessId },
    select: { completedAt: true, computedConfig: true },
  });

  let recalculated = 0;
  let skippedLocked = 0;

  for (const report of reports) {
    const month = report.taxMonth.getUTCMonth() + 1;
    const year = report.taxMonth.getUTCFullYear();
    const grossProfit = Number(report.grossProfit);
    const totalSales = Number(report.totalSales);
    const totalExpenses = Number(report.totalExpenses);
    const oldPayable = Number(report.taxPayable);
    const oldRate = Number(report.taxRate);

    if (report.isLocked) {
      logger.info('[TAX-18] Skipping locked report (audit only)', {
        businessId,
        reportId: report.id,
        month,
        year,
        taxPayable: oldPayable,
        taxRate: oldRate,
      });
      skippedLocked++;
      continue;
    }

    const result = await calculateTaxWithStrategy({
      businessId,
      month,
      year,
      totalSales,
      totalExpenses,
      grossProfit,
      profile: freshProfile,
    });

    if (
      Math.abs(result.taxPayable - oldPayable) > 0.001 ||
      Math.abs(result.taxRate - oldRate) > 0.001
    ) {
      await prisma.monthlyTaxReport.update({
        where: { id: report.id },
        data: {
          taxPayable: result.taxPayable,
          taxRate: result.taxRate,
        },
      });

      logger.info('[TAX-18] Unlocked report recalculated after profile save', {
        businessId,
        reportId: report.id,
        month,
        year,
        oldPayable,
        newPayable: result.taxPayable,
        oldRate,
        newRate: result.taxRate,
        strategyUsed: result.strategyUsed,
      });
      recalculated++;
    }
  }

  logger.info('[TAX-18] Report recalculation complete', {
    businessId,
    profileId,
    recalculated,
    skippedLocked,
    total: reports.length,
  });
}

// ─── TAX-19 helper ────────────────────────────────────────────────────────────

// Threshold = lower bound of the NEXT band (i.e. the amount that would cross INTO the next bucket)
const BAND_THRESHOLDS: Record<AnnualTurnoverOption, number | null> = {
  UNDER_25M: STATUTORY_TAX_CONSTANTS.VAT.EXEMPT_TURNOVER_LIMIT, // ₦25M — cross into M25M_TO_50M
  M25M_TO_50M: 50_000_000,                                       // ₦50M — cross into M50M_TO_100M
  M50M_TO_100M: STATUTORY_TAX_CONSTANTS.CIT.SMALL_COMPANY.TURNOVER_LIMIT, // ₦100M — cross into ABOVE_100M
  ABOVE_100M: null,  // No upper bound to cross
  UNKNOWN: null,     // Cannot check without a declared band
};

/**
 * TAX-19: After profile save, sum the past 12 months of confirmed/completed
 * SalesTransaction amounts and compare against the declared annualTurnover band.
 *
 * If the actual T12M turnover meets or exceeds the band threshold:
 *   - Set needsManualReview = true on the businessTaxProfile
 *   - Append a specific reviewReason describing the crossing event
 *   - Log the crossing event for audit
 *
 * The computedConfig (quiz-derived) is NEVER auto-changed.
 */
async function checkT12mTurnoverParity(
  businessId: string,
  declaredBand: AnnualTurnoverOption,
  profileId: string,
): Promise<void> {
  const threshold = BAND_THRESHOLDS[declaredBand];
  if (threshold === null) {
    // ABOVE_100M or UNKNOWN — no meaningful threshold to cross
    return;
  }

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  // Aggregate taxable, confirmed/completed sales for the trailing 12 months
  const aggResult = await prisma.salesTransaction.aggregate({
    where: {
      businessId,
      status: { in: ['confirmed', 'completed'] },
      createdAt: { gte: twelveMonthsAgo },
    },
    _sum: { amount: true },
  });

  const t12mTotal = Number(aggResult._sum.amount ?? 0);

  if (t12mTotal >= threshold) {
    const formattedTotal = t12mTotal.toLocaleString('en-NG');
    const formattedThreshold = (threshold / 1_000_000).toFixed(0);
    const reviewReason =
      `[TAX-19] Trailing-12-month revenue \u20a6${formattedTotal} meets or exceeds the \u20a6${formattedThreshold}M threshold ` +
      `for declared band '${declaredBand}'. Manual review required \u2014 consider updating your tax profile.`;

    await prisma.businessTaxProfile.update({
      where: { businessId },
      data: {
        needsManualReview: true,
        reviewReasons: {
          push: reviewReason,
        },
      },
    });

    logger.warn('[TAX-19] T12M turnover crosses declared band threshold', {
      businessId,
      profileId,
      declaredBand,
      t12mTotal,
      threshold,
      reviewReason,
    });
  } else {
    logger.info('[TAX-19] T12M turnover within declared band — no review needed', {
      businessId,
      profileId,
      declaredBand,
      t12mTotal,
      threshold,
    });
  }
}
