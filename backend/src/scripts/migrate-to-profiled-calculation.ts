/**
 * Migration Script: Prompt Existing Businesses for NTA 2025 Profile Assessment
 * 
 * Usage:
 *   npx tsx src/scripts/migrate-to-profiled-calculation.ts [--dry-run | --execute]
 */

import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { sendEmail } from '@/lib/email';

export async function migrateExistingBusinesses(options: { dryRun?: boolean } = {}) {
  const isDryRun = options.dryRun ?? !process.argv.includes('--execute');

  logger.info(`Starting Tax Profile Migration (Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE EXECUTION'})`);

  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Find active businesses without a completed tax profile
  const businesses = await prisma.business.findMany({
    where: {
      taxProfile: null,
      sales: {
        some: {
          transactionDate: {
            gte: threeMonthsAgo,
          },
        },
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
    },
  });

  logger.info(`Found ${businesses.length} active business(es) requiring tax profile assessment.`);

  let migratedCount = 0;

  for (const business of businesses) {
    logger.info(`[${isDryRun ? 'DRY-RUN' : 'MIGRATE'}] Business: "${business.businessName}" (${business.id}) - Owner: ${business.user?.email}`);

    if (!isDryRun) {
      // Create pending tax profile to prompt completion in UI
      await prisma.businessTaxProfile.create({
        data: {
          businessId: business.id,
          quizAnswers: {},
          computedConfig: {},
          needsManualReview: true,
          reviewReasons: [
            'System Migration (NTA 2025): Please complete the 2-minute tax assessment to confirm your statutory 0% CIT and VAT exemption reliefs.',
          ],
        },
      });

      // Dispatch notification email if owner has an email
      if (business.user?.email) {
        try {
          await sendEmail({
            to: business.user.email,
            subject: 'Action Required: Complete Your NTA 2025 Tax Profile on PayMyTax',
            html: `
              <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
                <div style="background-color: #4f46e5; padding: 20px; border-radius: 8px 8px 0 0; color: white;">
                  <h1 style="margin: 0; font-size: 20px;">PayMyTax by WallX</h1>
                </div>
                <div style="background-color: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
                  <h2 style="color: #0f172a; margin-top: 0;">Personalized Tax Assessment Now Active</h2>
                  <p>Hello ${business.user.fullName || 'Business Owner'},</p>
                  <p>Under the new <strong>Nigeria Tax Act (NTA) 2025</strong>, small businesses enjoy substantial statutory reliefs:</p>
                  <ul>
                    <li><strong>0% Corporate Income Tax (CIT)</strong> for qualifying companies with turnover under ₦100M and fixed assets under ₦250M.</li>
                    <li><strong>100% VAT Exemption</strong> for businesses with annual turnover under ₦25M.</li>
                    <li><strong>Progressive Personal Income Tax (PIT)</strong> bands for Sole Proprietorships.</li>
                  </ul>
                  <p>To ensure your monthly tax calculations accurately apply these reliefs to <strong>${business.businessName}</strong>, please complete the quick 2-minute assessment on your dashboard.</p>
                  <div style="margin: 24px 0;">
                    <a href="https://app.paymytax.ng/tax-reports" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                      Complete 2-Min Assessment &rarr;
                    </a>
                  </div>
                  <p style="font-size: 12px; color: #64748b; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    This is an automated operational notification from PayMyTax by WallX.
                  </p>
                </div>
              </div>
            `,
          });
        } catch (emailErr) {
          logger.warn(`Failed to dispatch tax migration email to ${business.user.email}:`, emailErr);
        }
      }

      migratedCount++;
    }
  }

  logger.info(`Migration finished. Total businesses processed: ${isDryRun ? businesses.length : migratedCount}`);
  return { found: businesses.length, migrated: isDryRun ? 0 : migratedCount };
}

// Execute directly if run via CLI
if (require.main === module) {
  migrateExistingBusinesses()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Migration failed:', err);
      process.exit(1);
    });
}
