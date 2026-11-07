/**
 * Central Configuration Manager
 * 
 * This module loads and validates all environment variables.
 * Uses a centralized approach to prevent scattered process.env calls.
 * 
 * @author WallX Engineering Team
 */

import dotenv from 'dotenv';

// Load environment variables. In tests, never override process.env so that test mocks and runner settings stay isolated.
const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
dotenv.config({ override: !isTest });

/**
 * Validates that required environment variables are present.
 */
function validateConfig() {
  const required = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  if (process.env.NODE_ENV === 'production') {
    required.push('ENCRYPTION_KEY', 'BLIND_INDEX_KEY');
  }

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file against .env.example'
    );
  }
}

// Run validation on import
validateConfig();

/**
 * Application Configuration Object
 */
/**
 * Parse PORT defensively. Render/Heroku inject PORT automatically; if a user
 * also adds it in the dashboard with a bad value (empty string, whitespace,
 * non-numeric), parseInt returns NaN and app.listen throws ERR_SOCKET_BAD_PORT.
/**
 * Parse PORT defensively. Cloud platforms (Railway, Render, Fly) inject PORT automatically.
 * Fall back to 3000 (standard Node/Express default) if none is provided.
 */
const parsePort = (raw: string | undefined): number => {
  const fallback = 3000;
  if (!raw || !raw.trim()) return fallback;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(
      `[config] Invalid PORT="${raw}" (must be integer 1-65535). Falling back to ${fallback}.`
    );
    return fallback;
  }
  return n;
};

/**
 * ERASE_TEST_ACCOUNTS toggle â€” one-shot sweep of throwaway test accounts
 * at server startup (src/scripts/erase-test-accounts.ts).
 *   unset / false / 0 / no / off  â†’ disabled
 *   true / 1 / yes / apply        â†’ delete matching accounts on startup
 *   anything else                 â†’ 'dry' (logs what WOULD be deleted), so a
 *     typo still produces visible log output instead of silently doing nothing.
 */
const parseEraseToggle = (raw: string | undefined): false | 'dry' | 'apply' => {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v || v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  if (v === 'true' || v === '1' || v === 'yes' || v === 'apply') return 'apply';
  return 'dry';
};

/**
 * First usable URL from a possibly comma-separated list.
 * FRONTEND_URL is a CORS allowlist (`http://localhost:5173,https://app.example.com`),
 * so it must never be interpolated into a link wholesale — only its first entry.
 */
const firstUrl = (raw: string | undefined, fallback: string): string => {
  const candidate = (raw ?? '')
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .find((u) => /^https?:\/\//i.test(u));
  return candidate || fallback;
};

export const config = {
  // Application
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parsePort(process.env.PORT),
    apiVersion: process.env.API_VERSION || 'v1',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
  },

  // Database
  database: {
    url: process.env.DATABASE_URL!,
  },

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || '',
  },

  // Realtime SSE ticket config
  realtime: {
    ticketSecret: process.env.SSE_TICKET_SECRET || process.env.JWT_ACCESS_SECRET!,
    ticketExpiry: '30s',
  },

  // Payment
  payment: {
    provider: (process.env.PAYMENT_PROVIDER || 'paystack') as 'paystack' | 'wallx',
  },

  // Paystack
  //
  // `preferredBank` is the DVA-creation bank slug Paystack expects on
  // POST /dedicated_account. Test mode REQUIRES `test-bank` â€” `wema-bank`
  // returns a 400 with test keys. Live mode accepts `wema-bank` (default),
  // `titan-paystack`, etc. We auto-pick based on the secret-key prefix so
  // local dev with test keys just works; explicit env var overrides if you
  // ever need a different live partner bank.
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
    preferredBank:
      process.env.PAYSTACK_PREFERRED_BANK ||
      ((process.env.PAYSTACK_SECRET_KEY || '').startsWith('sk_test_')
        ? 'test-bank'
        : 'wema-bank'),
    // DEV/TEST-ONLY fixture switch. When true (or when NODE_ENV=test), failed
    // Paystack name-enquiry (/bank/resolve) and subaccount-creation calls fall
    // back to a local fixture instead of surfacing the error â€” lets devs and
    // CI exercise settlement connect without real bank resolution.
    // NEVER set this in production; see paystack.provider.ts shouldUseBankFixture().
    mockBankResolution: process.env.PAYSTACK_MOCK_BANK_RESOLUTION === 'true',
    
    // Paystack's published pricing. Rules, worked examples and the source URL
    // for every number live in src/lib/paystack-fees.ts â€” read that first.
    // These are the defaults as published on paystack.com/pricing and
    // support.paystack.com on 2026-09-03; override via env if Paystack moves.
    fees: {
      // DVA inflow: 1% per transfer, capped at â‚¦300, deducted from the
      // merchant's settlement (the sender is NOT charged extra).
      dvaPct: Number(process.env.PAYSTACK_DVA_FEE_PCT ?? 1),
      dvaCap: Number(process.env.PAYSTACK_DVA_FEE_CAP ?? 300),

      // Withdrawals: banded FLAT transfer fee, not a percentage.
      transferLow: Number(process.env.PAYSTACK_TRANSFER_FEE_LOW ?? 10),
      transferLowMax: Number(process.env.PAYSTACK_TRANSFER_FEE_LOW_MAX ?? 5000),
      transferMid: Number(process.env.PAYSTACK_TRANSFER_FEE_MID ?? 25),
      transferMidMax: Number(process.env.PAYSTACK_TRANSFER_FEE_MID_MAX ?? 50000),
      transferHigh: Number(process.env.PAYSTACK_TRANSFER_FEE_HIGH ?? 50),

      // Nigeria Tax Act 2025 stamp duty, live since 18 Feb 2026: flat â‚¦50 on
      // every transfer of â‚¦10,000+ out of a Paystack balance, on top of the
      // transfer fee. Set to 0 only if the business is a registered payroll
      // merchant (the only exemption Paystack documents).
      stampDuty: Number(process.env.PAYSTACK_STAMP_DUTY ?? 50),
      stampDutyFrom: Number(process.env.PAYSTACK_STAMP_DUTY_FROM ?? 10000),

      // Who bears the WallX withdrawal fee: 'merchant' (default) adds the fee
      // on top of the requested amount; 'platform' absorbs it entirely.
      // Confirm with finance before flipping this.
      withdrawalFeeBearer: (process.env.WITHDRAWAL_FEE_BEARER === 'platform'
        ? 'platform'
        : 'merchant') as 'merchant' | 'platform',
    },
  },

  // DigitalOcean Spaces
  spaces: {
    endpoint: process.env.DO_SPACES_ENDPOINT || '',
    region: process.env.DO_SPACES_REGION || 'nyc3',
    bucket: process.env.DO_SPACES_BUCKET || '',
    accessKey: process.env.DO_SPACES_ACCESS_KEY || '',
    secretKey: process.env.DO_SPACES_SECRET_KEY || '',
    cdnEndpoint: process.env.DO_SPACES_CDN_ENDPOINT || '',
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },


  // Email
  email: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM || 'WallX ERP <noreply@wallxerp.com>',
  },

  // SMS
  sms: {
    apiKey: process.env.TERMII_API_KEY || '',
    senderId: process.env.TERMII_SENDER_ID || 'WallX ERP',
  },

  // Monitoring
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN || '',
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  // CORS
  cors: {
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  // App URLs â€” used in outbound links (WhatsApp messages, emails) where the
  // customer (not the SME) is the recipient. Distinct from `cors.frontendUrl`
  // because the SME-facing app and the public-PDF host might diverge in prod
  // (e.g. app.paymytax.com vs api.paymytax.com). Defaults assume single-host
  // dev where the frontend proxies /api to the backend.
  publicUrls: {
    // Base for /api/v1/public/* links (customer hits this directly, no proxy).
    apiBase: firstUrl(
      process.env.PUBLIC_API_URL || process.env.FRONTEND_URL,
      'http://localhost:5173',
    ),
    // Base for customer-facing *frontend* routes in outbound links
    // (/verify-voucher/:id, /reset-password…). Never the API host — those are
    // React routes. In tests this is rewritten per-suite via PUBLIC_APP_URL.
    appBase: firstUrl(
      process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL,
      'http://localhost:5173',
    ),
  },

  // Tax
  tax: {
    defaultRate: parseFloat(process.env.TAX_DEFAULT_RATE || '7.5'),
    minRate: parseFloat(process.env.TAX_MIN_RATE || '0'),
    maxRate: parseFloat(process.env.TAX_MAX_RATE || '50'),
    currency: process.env.TAX_CURRENCY || 'NGN',
    taxAuthority: process.env.TAX_AUTHORITY || 'NRS',
  },

  // FX Display Rates (display-only; no schema or ledger involvement)
  fx: {
    provider: process.env.FX_PROVIDER || 'er-api',
    displayCurrencies: (process.env.FX_DISPLAY_CURRENCIES || 'USD,GBP,EUR,CAD')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    maxAgeMs: parseInt(process.env.FX_MAX_AGE_MS || '21600000', 10), // 6h
    timeoutMs: parseInt(process.env.FX_TIMEOUT_MS || '5000', 10),
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(
      process.env.RATE_LIMIT_MAX_REQUESTS ||
        (process.env.NODE_ENV === 'production' ? '1000' : '1000000'),
      10
    ),
    authWindowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '900000', 10), // 15 minutes default
    authMaxRequests: parseInt(
      process.env.RATE_LIMIT_AUTH_MAX_REQUESTS ||
        (process.env.NODE_ENV === 'production' ? '10' : '10000'),
      10
    ),
  },

  // PIN Security
  pin: {
    maxAttempts: Number(process.env.PIN_MAX_ATTEMPTS ?? 5),
    attemptWindowHours: Number(process.env.PIN_ATTEMPT_WINDOW_HOURS ?? 24),
  },

  // Voucher bonus & ledger requests â€” merchant-funded extra % on top-ups and verification defaults
  voucher: {
    maxBonusPct: Number(process.env.VOUCHER_MAX_BONUS_PCT ?? 10),
    verificationExpiryHours: Number(process.env.VOUCHER_VERIFICATION_EXPIRY_HOURS ?? 24),
    adjustmentThreshold: Number(process.env.VOUCHER_ADJUSTMENT_THRESHOLD ?? 50000),
  },

  // Settlement & Split Payouts
  settlement: {
    minTaxSplitPct: Number(process.env.SETTLEMENT_MIN_TAX_SPLIT_PCT ?? 7.5),
    maxTaxSplitPct: Number(process.env.SETTLEMENT_MAX_TAX_SPLIT_PCT ?? 50),
    platformCommissionPct: Number(process.env.PLATFORM_COMMISSION_PCT ?? 0),
  },

  // Marketplace & Monetization (Phases 9 - 14)
  marketplace: {
    slotAllowanceDefault: parseInt(process.env.MARKETPLACE_SLOT_ALLOWANCE_DEFAULT ?? '3', 10),
    slotUnitPrice: Number(process.env.MARKETPLACE_SLOT_UNIT_PRICE ?? '1000'),
    boostPrices: {
      week: Number(process.env.MARKETPLACE_BOOST_PRICE_WEEK ?? '2000'),
      fortnight: Number(process.env.MARKETPLACE_BOOST_PRICE_FORTNIGHT ?? '3500'),
      month: Number(process.env.MARKETPLACE_BOOST_PRICE_MONTH ?? '6000'),
    },
    boostDurationsDays: {
      week: 7,
      fortnight: 14,
      month: 30,
    },
    maxCategoryBoostsPerPage: parseInt(process.env.MARKETPLACE_MAX_CATEGORY_BOOSTS_PER_PAGE ?? '3', 10),
  },

  // Scheduled Jobs (node-cron)
  // Auto-enabled in production; opt-in for dev so `tsx watch` doesn't
  // re-register the schedule on every file save.
  cron: {
    enabled:
      process.env.ENABLE_CRON === 'true' ||
      process.env.NODE_ENV === 'production',
  },

  // One-shot sweep of throwaway test accounts at startup
  // (src/scripts/erase-test-accounts.ts). Off unless ERASE_TEST_ACCOUNTS is set:
  // 'dry' logs what would be deleted, 'apply' deletes. Idempotent either way.
  cleanup: {
    eraseTestAccounts: parseEraseToggle(process.env.ERASE_TEST_ACCOUNTS),
  },

  // Security & KYC Cryptography
  security: {
    encryptionKey:
      process.env.ENCRYPTION_KEY ||
      'dev-tax-wallx-encryption-key-32b-secret!',
    blindIndexKey:
      process.env.BLIND_INDEX_KEY ||
      'dev-tax-wallx-blind-index-key-32b-secret!',
  },

  // PII Encryption
  pii: {
    encryptionKey:
      process.env.PII_ENCRYPTION_KEY ||
      process.env.ENCRYPTION_KEY ||
      'dev-tax-wallx-encryption-key-32b-secret!',
    blindIndexKey:
      process.env.BLIND_INDEX_KEY ||
      'dev-tax-wallx-blind-index-key-32b-secret!',
  },

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
  },

  // KudiSMS Hosted OTP Integration
  kudisms: {
    apiToken: process.env.KUDISMS_API_TOKEN || '',
    senderId: process.env.KUDISMS_SENDER_ID || 'WallX',
    appnameCode: process.env.KUDISMS_APPNAME_CODE || '',
    templateCode: process.env.KUDISMS_TEMPLATE_CODE || '',
    // KUDISMS=false or kudisms=false or KUDISMS_ENABLED=false or KUDISMS_SILENT_MODE=true activates silent simulation mode.
    // KUDISMS=true or kudisms=true or KUDISMS_ENABLED=true forces live API token dispatch.
    silentMode:
      process.env.kudisms === 'false' ||
      process.env.KUDISMS === 'false' ||
      process.env.KUDISMS_ENABLED === 'false' ||
      process.env.KUDISMS_SILENT_MODE === 'true' ||
      ((process.env.kudisms !== 'true' &&
        process.env.KUDISMS !== 'true' &&
        process.env.KUDISMS_ENABLED !== 'true') &&
        (!process.env.KUDISMS_API_TOKEN || process.env.KUDISMS_SILENT_MODE !== 'false')),
  },

  // AI Assistant & Business Intelligence
  ai: {
    provider: (process.env.AI_PROVIDER || 'groq') as 'groq' | 'gemini',
    groqApiKey: process.env.GROQ_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.AI_MODEL || 'qwen/qwen3.8-27b',
  },

  // Regulatory & Non-Custodial Compliance Disclosures
  // Compliant with CBN NPS Framework & FCCPC Consumer Protection Rules
  regulatory: {
    companyLegalName: 'WallX Technology Services Limited',
    platformRole: 'Financial Technology Software Provider (Non-Bank)',
    partnerPSP: 'Paystack Payments Limited',
    partnerPSPLicense: 'CBN-Licensed Payment Solution Service Provider (PSSP)',
    partnerBanks: 'Titan Trust Bank Limited, Wema Bank Plc',
    governingLaw: 'Laws of the Federal Republic of Nigeria',
    nonCustodialNotice:
      'WallXERP by WallX is a financial technology software platform, not a bank or deposit-taking institution. Dedicated Virtual Accounts, split settlement routing, and interbank transfers are powered exclusively by CBN-licensed financial institutions. Merchant funds are held in trust by partner commercial banks and are never co-mingled with WallX operating capital.',
    termsVersion: '2026.1-cbn-noncustodial',
  },

  // Subscription Access Control & Quotas
  subscription: {
    trialDays: parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS || '30', 10),
    graceDays: parseInt(process.env.SUBSCRIPTION_GRACE_DAYS || '2', 10),
    enforcementEnabled: process.env.SUBSCRIPTION_ENFORCEMENT_ENABLED === 'true',
    grandfatherCutoff: new Date(process.env.SUBSCRIPTION_BACKFILL_CUTOFF || '2026-10-08T00:00:00.000Z'),
  },
} as const;

export default config;
