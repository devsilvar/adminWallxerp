/**
 * Data Migration Script: Generate PINs for Existing Voucher Cards
 * 
 * This script generates PINs for all customer cards that were created before
 * the PIN authentication feature was deployed (cards with pinHash = null).
 * 
 * USAGE:
 *   npx tsx scripts/migrate-generate-pins.ts [--dry-run]
 * 
 * FLAGS:
 *   --dry-run    Preview changes without committing to database
 * 
 * SAFETY:
 *   - Only processes cards with pinHash = null
 *   - Skips cards that already have PINs
 *   - Sends email notifications to customers with email addresses
 *   - Logs all operations for audit trail
 */

import prisma from '../src/lib/prisma';
import logger from '../src/lib/logger';
import { generateVoucherPin, hashVoucherPin } from '../src/services/voucher-pin.service';
import { dispatchVoucherNotificationEmail } from '../src/services/email-dispatch.service';

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  emailsSent: number;
  errors: number;
}

async function migrateGeneratePins(dryRun: boolean = false): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    emailsSent: 0,
    errors: 0,
  };

  logger.info('Starting PIN migration for existing voucher cards', { dryRun });

  try {
    // Find all cards without PIN hash
    const cardsWithoutPin = await prisma.customerCard.findMany({
      where: {
        pinHash: null,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    stats.total = cardsWithoutPin.length;

    logger.info(`Found ${stats.total} cards without PINs`);

    if (stats.total === 0) {
      logger.info('No cards need PIN migration. Exiting.');
      return stats;
    }

    // Process each card
    for (const card of cardsWithoutPin) {
      try {
        // Validate customer has sufficient phone number
        const phoneDigits = card.customer.phone?.replace(/\D/g, '') || '';
        if (phoneDigits.length < 4) {
          logger.warn('Skipping card - customer phone insufficient for PIN auth', {
            cardId: card.id,
            customerId: card.customerId,
            customerName: card.customer.name,
            phone: card.customer.phone,
          });
          stats.skipped++;
          continue;
        }

        // Generate PIN and hash
        const plainPin = generateVoucherPin();
        const pinHash = await hashVoucherPin(plainPin);

        logger.info('Generated PIN for card', {
          cardId: card.id,
          cardCode: card.cardCode,
          customerId: card.customerId,
          customerName: card.customer.name,
          dryRun,
        });

        if (!dryRun) {
          // Update card with PIN hash
          await prisma.customerCard.update({
            where: { id: card.id },
            data: {
              pinHash,
              pinAttempts: 0,
              pinLockedUntil: null,
            },
          });

          stats.migrated++;

          // Send email notification if customer has email
          if (card.customer.email) {
            try {
              await dispatchVoucherNotificationEmail({
                businessId: card.businessId,
                customerId: card.customerId,
                cardCode: card.cardCode,
                balance: Number(card.balance),
                actionType: 'created',
                toEmail: card.customer.email,
                customerName: card.customer.name,
                pinCode: plainPin,
                notes: 'Your voucher card PIN has been generated as part of our security upgrade.',
              });
              stats.emailsSent++;
              logger.info('PIN email sent', {
                cardId: card.id,
                email: card.customer.email,
              });
            } catch (emailErr) {
              logger.warn('Failed to send PIN email (non-critical)', {
                cardId: card.id,
                email: card.customer.email,
                error: emailErr instanceof Error ? emailErr.message : String(emailErr),
              });
            }
          } else {
            logger.warn('No email address for customer - PIN not sent', {
              cardId: card.id,
              customerId: card.customerId,
              customerName: card.customer.name,
              pin: plainPin, // Log PIN for manual delivery
            });
          }
        } else {
          stats.migrated++; // Count as would-be migrated in dry run
        }

        // Add small delay to avoid overwhelming email service
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (cardErr) {
        stats.errors++;
        logger.error('Failed to migrate card', {
          cardId: card.id,
          customerId: card.customerId,
          error: cardErr instanceof Error ? cardErr.message : String(cardErr),
        });
      }
    }

    logger.info('PIN migration completed', stats);

  } catch (err) {
    logger.error('PIN migration failed', {
      error: err instanceof Error ? err.message : String(err),
      stats,
    });
    throw err;
  }

  return stats;
}

// Main execution
async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be committed\n');
  } else {
    console.log('\n⚠️  LIVE MODE - Changes will be committed to database\n');
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const stats = await migrateGeneratePins(dryRun);

  console.log('\n📊 Migration Results:');
  console.log(`   Total cards found:     ${stats.total}`);
  console.log(`   Cards migrated:        ${stats.migrated}`);
  console.log(`   Cards skipped:         ${stats.skipped}`);
  console.log(`   Emails sent:           ${stats.emailsSent}`);
  console.log(`   Errors:                ${stats.errors}`);
  console.log();

  if (dryRun) {
    console.log('✅ Dry run completed. Run without --dry-run to apply changes.\n');
  } else {
    console.log('✅ Migration completed successfully.\n');
  }

  await prisma.$disconnect();
}

main()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
