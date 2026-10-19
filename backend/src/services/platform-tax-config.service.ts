import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import logger from '@/lib/logger';

export interface PlatformTaxConfigData {
  id?: string;
  autoFinalizeDay: number;
  autoFinalizeEnabled: boolean;
  updatedAt?: Date;
  updatedBy?: string | null;
}

export const DEFAULT_TAX_CONFIG: PlatformTaxConfigData = {
  id: 'default',
  autoFinalizeDay: 20,
  autoFinalizeEnabled: true,
};

let cachedTaxConfig: PlatformTaxConfigData | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

export class PlatformTaxConfigService {
  /**
   * Retrieves active platform tax and compliance configuration.
   * Utilizes in-memory caching with 30-second TTL and safe fallback.
   */
  static async getTaxConfig(): Promise<PlatformTaxConfigData> {
    const now = Date.now();
    if (cachedTaxConfig && now < cacheExpiry) {
      return cachedTaxConfig;
    }

    try {
      // Use any cast if client schema migration is pending in the DB table
      const configRecord = await (prisma as any).platformTaxConfig?.findUnique({
        where: { id: 'default' },
      });

      if (configRecord) {
        cachedTaxConfig = {
          id: configRecord.id || 'default',
          autoFinalizeDay: Number(configRecord.autoFinalizeDay) || 20,
          autoFinalizeEnabled: configRecord.autoFinalizeEnabled ?? true,
          updatedAt: configRecord.updatedAt,
          updatedBy: configRecord.updatedBy,
        };
        cacheExpiry = now + CACHE_TTL_MS;
        return cachedTaxConfig;
      }
    } catch (err: any) {
      logger.warn(`Failed to fetch platform tax config from database, using fallback: ${err.message}`);
    }

    cachedTaxConfig = { ...DEFAULT_TAX_CONFIG, updatedAt: new Date() };
    cacheExpiry = now + CACHE_TTL_MS;
    return cachedTaxConfig;
  }

  /**
   * Updates platform tax and compliance configuration and invalidates memory cache.
   */
  static async updateTaxConfig(
    params: {
      autoFinalizeDay?: number;
      autoFinalizeEnabled?: boolean;
    },
    adminUserId: string
  ): Promise<PlatformTaxConfigData> {
    const previous = await this.getTaxConfig();
    const autoFinalizeDay =
      params.autoFinalizeDay !== undefined ? params.autoFinalizeDay : previous.autoFinalizeDay;
    const autoFinalizeEnabled =
      params.autoFinalizeEnabled !== undefined ? params.autoFinalizeEnabled : previous.autoFinalizeEnabled;

    const updated = await (prisma as any).platformTaxConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        autoFinalizeDay,
        autoFinalizeEnabled,
        updatedBy: adminUserId,
      },
      update: {
        autoFinalizeDay,
        autoFinalizeEnabled,
        updatedBy: adminUserId,
      },
    });

    cachedTaxConfig = {
      id: updated.id || 'default',
      autoFinalizeDay: Number(updated.autoFinalizeDay),
      autoFinalizeEnabled: Boolean(updated.autoFinalizeEnabled),
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    };
    cacheExpiry = Date.now() + CACHE_TTL_MS;

    logAudit({
      userId: adminUserId,
      action: 'platform.tax_config_updated',
      resourceType: 'platform_tax_config',
      resourceId: 'default',
      oldData: previous,
      newData: cachedTaxConfig,
    });

    logger.info('Platform tax configuration updated by admin', {
      adminUserId,
      autoFinalizeDay,
      autoFinalizeEnabled,
    });

    return cachedTaxConfig;
  }

  /**
   * Clears in-memory cache for testing or manual eviction.
   */
  static invalidateCache(): void {
    cachedTaxConfig = null;
    cacheExpiry = 0;
  }
}
