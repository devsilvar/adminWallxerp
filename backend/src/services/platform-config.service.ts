import prisma from '@/lib/prisma';
import { toNumber } from '@/shared/helpers';
import { logAudit } from '@/lib/audit';
import logger from '@/lib/logger';

export interface PlatformFeeConfigData {
  withdrawalFeePct: number;
  withdrawalFeeCap: number;
  minWithdrawalAmount: number;
  advanceFeePct: number;
  advanceFeeCap: number;
  maxAdvancePct: number;
  minAdvanceAmount: number;
  autoSweepEnabled: boolean;
  autoSweepThreshold: number;
  maxDailyPayout: number;
  updatedAt?: Date;
  updatedBy?: string | null;
}

export const DEFAULT_FEE_CONFIG: PlatformFeeConfigData = {
  withdrawalFeePct: 1.0,
  withdrawalFeeCap: 300.0,
  minWithdrawalAmount: 1000.0,
  advanceFeePct: 1.0,
  advanceFeeCap: 500.0,
  maxAdvancePct: 30.0,
  minAdvanceAmount: 1000.0,
  autoSweepEnabled: true,
  autoSweepThreshold: 1000.0,
  maxDailyPayout: 500000.0,
};

let cachedFeeConfig: PlatformFeeConfigData | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds (balances DB query reduction with multi-instance freshness)

export class PlatformConfigService {
  /**
   * Retrieves the active platform fee configuration.
   * Utilizes in-memory caching with 30-second TTL and graceful fallback to defaults.
   */
  static async getFeeConfig(): Promise<PlatformFeeConfigData> {
    const now = Date.now();
    if (cachedFeeConfig && now < cacheExpiry) {
      return cachedFeeConfig;
    }

    try {
      const configRecord = await prisma.platformFeeConfig.findUnique({
        where: { id: 'default' },
      });

      if (configRecord) {
        cachedFeeConfig = {
          withdrawalFeePct: toNumber(configRecord.withdrawalFeePct),
          withdrawalFeeCap: toNumber(configRecord.withdrawalFeeCap),
          minWithdrawalAmount: toNumber(configRecord.minWithdrawalAmount),
          advanceFeePct: toNumber(configRecord.advanceFeePct ?? DEFAULT_FEE_CONFIG.advanceFeePct),
          advanceFeeCap: toNumber(configRecord.advanceFeeCap ?? DEFAULT_FEE_CONFIG.advanceFeeCap),
          maxAdvancePct: toNumber(configRecord.maxAdvancePct ?? DEFAULT_FEE_CONFIG.maxAdvancePct),
          minAdvanceAmount: toNumber(configRecord.minAdvanceAmount ?? DEFAULT_FEE_CONFIG.minAdvanceAmount),
          autoSweepEnabled: configRecord.autoSweepEnabled ?? true,
          autoSweepThreshold: toNumber(configRecord.autoSweepThreshold ?? 1000.0),
          maxDailyPayout: toNumber(configRecord.maxDailyPayout ?? 500000.0),
          updatedAt: configRecord.updatedAt,
          updatedBy: configRecord.updatedBy,
        };
        cacheExpiry = now + CACHE_TTL_MS;
        return cachedFeeConfig;
      }
    } catch (err: any) {
      logger.warn(`Failed to fetch platform fee config from database, using fallback: ${err.message}`);
    }

    // Fallback if not found or DB query errors
    cachedFeeConfig = { ...DEFAULT_FEE_CONFIG, updatedAt: new Date() };
    cacheExpiry = now + CACHE_TTL_MS;
    return cachedFeeConfig;
  }

  /**
   * Updates the global platform fee configuration and purges memory cache.
   */
  static async updateFeeConfig(
    params: {
      withdrawalFeePct?: number;
      withdrawalFeeCap?: number;
      minWithdrawalAmount?: number;
      advanceFeePct?: number;
      advanceFeeCap?: number;
      maxAdvancePct?: number;
      minAdvanceAmount?: number;
      autoSweepEnabled?: boolean;
      autoSweepThreshold?: number;
      maxDailyPayout?: number;
    },
    adminUserId: string,
    reqMeta?: { ip?: string; userAgent?: string }
  ): Promise<PlatformFeeConfigData> {
    const previousConfig = await this.getFeeConfig();

    const withdrawalFeePct = params.withdrawalFeePct !== undefined ? params.withdrawalFeePct : previousConfig.withdrawalFeePct;
    const withdrawalFeeCap = params.withdrawalFeeCap !== undefined ? params.withdrawalFeeCap : previousConfig.withdrawalFeeCap;
    const minWithdrawalAmount = params.minWithdrawalAmount !== undefined ? params.minWithdrawalAmount : previousConfig.minWithdrawalAmount;
    const advanceFeePct = params.advanceFeePct !== undefined ? params.advanceFeePct : previousConfig.advanceFeePct;
    const advanceFeeCap = params.advanceFeeCap !== undefined ? params.advanceFeeCap : previousConfig.advanceFeeCap;
    const maxAdvancePct = params.maxAdvancePct !== undefined ? params.maxAdvancePct : previousConfig.maxAdvancePct;
    const minAdvanceAmount = params.minAdvanceAmount !== undefined ? params.minAdvanceAmount : previousConfig.minAdvanceAmount;
    const autoSweepEnabled = params.autoSweepEnabled ?? previousConfig.autoSweepEnabled;
    const autoSweepThreshold = params.autoSweepThreshold ?? previousConfig.autoSweepThreshold;
    const maxDailyPayout = params.maxDailyPayout !== undefined ? params.maxDailyPayout : previousConfig.maxDailyPayout;

    const updated = await prisma.platformFeeConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        withdrawalFeePct,
        withdrawalFeeCap,
        minWithdrawalAmount,
        advanceFeePct,
        advanceFeeCap,
        maxAdvancePct,
        minAdvanceAmount,
        autoSweepEnabled,
        autoSweepThreshold,
        maxDailyPayout,
        updatedBy: adminUserId,
      },
      update: {
        withdrawalFeePct,
        withdrawalFeeCap,
        minWithdrawalAmount,
        advanceFeePct,
        advanceFeeCap,
        maxAdvancePct,
        minAdvanceAmount,
        autoSweepEnabled,
        autoSweepThreshold,
        maxDailyPayout,
        updatedBy: adminUserId,
      },
    });

    const result: PlatformFeeConfigData = {
      withdrawalFeePct: toNumber(updated.withdrawalFeePct),
      withdrawalFeeCap: toNumber(updated.withdrawalFeeCap),
      minWithdrawalAmount: toNumber(updated.minWithdrawalAmount),
      advanceFeePct: toNumber(updated.advanceFeePct),
      advanceFeeCap: toNumber(updated.advanceFeeCap),
      maxAdvancePct: toNumber(updated.maxAdvancePct),
      minAdvanceAmount: toNumber(updated.minAdvanceAmount),
      autoSweepEnabled: updated.autoSweepEnabled,
      autoSweepThreshold: toNumber(updated.autoSweepThreshold),
      maxDailyPayout: toNumber(updated.maxDailyPayout),
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    };

    // Invalidate and refresh cache
    cachedFeeConfig = result;
    cacheExpiry = Date.now() + CACHE_TTL_MS;

    // Audit log
    await logAudit({
      userId: adminUserId,
      action: 'admin.fee_config_updated',
      resourceType: 'PlatformFeeConfig',
      resourceId: 'default',
      oldData: previousConfig as any,
      newData: result as any,
      ipAddress: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
    });

    return result;
  }

  /**
   * Clears the active fee cache.
   */
  static invalidateFeeConfigCache(): void {
    cachedFeeConfig = null;
    cacheExpiry = 0;
  }

  /**
   * Alias for test suites and scripts to purge memory cache.
   */
  static clearCache(): void {
    this.invalidateFeeConfigCache();
  }
}
