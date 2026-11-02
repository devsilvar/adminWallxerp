import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { verifyBusinessAccess } from '@/lib/ownership';
import { AppError } from '@/middleware/errorHandler';
import { evaluateTaxConfig } from '@/shared/tax-quiz-engine';
import { generateTaxObligationReport } from '@/services/pdf/tax-obligation-report';
import type { QuizAnswers, TaxProfileConfiguration } from '@/shared/tax-constants';

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
  // Only authorized owner/manager can update profile configuration
  await verifyBusinessAccess(userId, businessId, 'settings.update');

  // Pure deterministic evaluation
  const config = evaluateTaxConfig(answers);

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
    newData: { answers, config },
  });

  logger.info('Tax profile saved successfully', {
    businessId,
    vatExempt: config.vatExempt,
    citRate: config.citRate,
    needsReview: config.needsManualReview,
  });

  return { profile, config };
}

/**
 * Delete tax profile (reset to baseline)
 */
export async function deleteTaxProfile(userId: string, businessId: string) {
  await verifyBusinessAccess(userId, businessId, 'settings.update');

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
