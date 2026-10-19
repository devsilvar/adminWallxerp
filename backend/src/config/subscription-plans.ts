/**
 * ============================================================================
 * 📋 WALLX SUBSCRIPTION PLANS CONFIGURATION (EASY-EDIT PANEL)
 * ============================================================================
 *
 * Welcome to the central plan configuration!
 * Want to change subscription prices, business limits, team member caps,
 * or feature permissions? You ONLY need to edit this file!
 *
 * HOW TO EDIT:
 * 1. Numbers: Set any limit (e.g. maxBusinesses: 2).
 *    To allow UNLIMITED, set the number to -1 (e.g. maxBusinesses: -1).
 * 2. Features: Set to `true` to allow or `false` to block/lock.
 *
 * All changes made here automatically update:
 *  - Guard middleware (preventing unauthorized creation)
 *  - Public pricing APIs (frontend automatically receives the latest values)
 *  - Team invitation caps and AI query counters
 * ============================================================================
 */

export interface PlanFeatures {
  /** Core sales transaction creation and recording */
  salesManagement: boolean;
  /** Expense tracking, categories, and receipts */
  expenseManagement: boolean;
  /** Invoices and official receipts */
  invoicingAndReceipts: boolean;
  /** Dedicated Virtual Account (DVA) auto-capture */
  dvaVirtualAccount: boolean;
  /** FIRS / NRS tax calculation, period closing, and slips */
  taxFilingAndReports: boolean;
  /** Customer Credit Management / Buy Now Pay Later (BNPL) */
  bnplCredits: boolean;
  /** Excel & CSV bulk sales and expense import */
  bulkImport: boolean;
  /** Automated customer debt and invoice reminders count */
  automatedRemindersCount: number;
}

export interface PlanDefinition {
  /** Display name of the plan */
  name: string;
  /** Plan code matching user.subscriptionTier. MUST be unique — duplicate keys silently overwrite in the SUBSCRIPTION_PLANS record. */
  tier: 'free' | 'starter' | 'business' | 'scale';
  /** Price in Nigerian Naira (NGN) */
  priceNgn: number;
  /** Standard billing frequency */
  billingCycle: 'monthly' | 'quarterly' | 'annual';
  /** Maximum businesses / branches an owner can create (-1 = unlimited) */
  maxBusinesses: number;
  /** Maximum team members per business (-1 = unlimited) */
  maxTeamMembers: number;
  /** Maximum AI CFO questions per calendar month (-1 = unlimited) */
  maxMonthlyAiQueries: number;
  /** Feature access permissions */
  features: PlanFeatures;
}

export const SUBSCRIPTION_PLANS: Record<string, PlanDefinition> = {
  // --------------------------------------------------------------------------
  // 1. FREE TRIAL (30 Days)
  // Granted automatically to every new registered business owner.
  // --------------------------------------------------------------------------
  free: {
    name: '30-Day Free Trial',
    tier: 'free',
    priceNgn: 0,
    billingCycle: 'monthly',
    maxBusinesses: 5,           // Generous allowance during trial
    maxTeamMembers: 10,
    maxMonthlyAiQueries: 30,
    features: {
      salesManagement: true,
      expenseManagement: true,
      invoicingAndReceipts: true,
      dvaVirtualAccount: true,
      taxFilingAndReports: true,
      bnplCredits: true,        // Allowed during trial to explore all features
      bulkImport: true,
      automatedRemindersCount: 19,
    },
  },

  // --------------------------------------------------------------------------
  // 2. STARTER PLAN (Monthly: ₦5,000)
  // Designed for single retail stores and small growing businesses.
  // --------------------------------------------------------------------------
  starter: {
    name: 'Starter Plan',
    tier: 'starter',
    priceNgn: 5000,
    billingCycle: 'monthly',
    maxBusinesses: 2,           // Manage up to 2 businesses / branches
    maxTeamMembers: 3,          // Up to 3 team members
    maxMonthlyAiQueries: 30,    // 30 AI CFO queries / month
    features: {
      salesManagement: true,
      expenseManagement: true,
      invoicingAndReceipts: true,
      dvaVirtualAccount: true,
      taxFilingAndReports: true,
      bnplCredits: false,       // ❌ Credit management (BNPL) is Business+ only
      bulkImport: true,
      automatedRemindersCount: 0,
    },
  },

  // --------------------------------------------------------------------------
  // 3. BUSINESS PLAN (Quarterly: ₦12,000 — Save ₦3,000)
  // Perfect for established enterprises, wholesalers, and multi-branch SMEs.
  // --------------------------------------------------------------------------
  business: {
    name: 'Business Plan',
    tier: 'business',
    priceNgn: 12000,
    billingCycle: 'quarterly',
    maxBusinesses: 5,           // Manage up to 5 businesses / branches
    maxTeamMembers: 10,         // Up to 10 team members
    maxMonthlyAiQueries: 30,    // 30 AI CFO queries / month
    features: {
      salesManagement: true,
      expenseManagement: true,
      invoicingAndReceipts: true,
      dvaVirtualAccount: true,
      taxFilingAndReports: true,
      bnplCredits: true,        // ✅ Customer Credit Management (BNPL) enabled
      bulkImport: true,
      automatedRemindersCount: 19,
    },
  },

  // --------------------------------------------------------------------------
  // 4. SCALE-UP PLAN (Annual: ₦45,000 — Save ₦15,000)
  // Unlimited operations for high-volume merchants, chains, and scale-ups.
  // --------------------------------------------------------------------------
  scale: {
    name: 'Scale-Up Plan',
    tier: 'scale',
    priceNgn: 45000,
    billingCycle: 'annual',
    maxBusinesses: -1,          // 🚀 Unlimited businesses / branches
    maxTeamMembers: -1,         // 🚀 Unlimited team members
    maxMonthlyAiQueries: 30,    // 30 AI CFO queries / month
    features: {
      salesManagement: true,
      expenseManagement: true,
      invoicingAndReceipts: true,
      dvaVirtualAccount: true,
      taxFilingAndReports: true,
      bnplCredits: true,        // ✅ Included
      bulkImport: true,
      automatedRemindersCount: 30,
    },
  },
};

/**
 * Legacy spellings that must resolve to a catalog key. `scale_up` was written to
 * `users.subscription_tier` by an earlier admin override path and would otherwise
 * fall through to the free plan below (capping Scale-Up users at free-tier limits).
 */
const TIER_ALIASES: Record<string, keyof typeof SUBSCRIPTION_PLANS> = {
  scale_up: 'scale',
  scaleup: 'scale',
  free_trial: 'free',
  trial: 'free',
};

/**
 * Reduce a stored tier string to its canonical catalog key.
 * Unknown values resolve to `free`, matching getPlanLimits fallback behaviour.
 */
export function canonicalTier(tier?: string | null): keyof typeof SUBSCRIPTION_PLANS {
  if (!tier) return 'free';
  const normalized = tier.toLowerCase().trim();
  const aliased = TIER_ALIASES[normalized] ?? normalized;
  return aliased in SUBSCRIPTION_PLANS ? (aliased as keyof typeof SUBSCRIPTION_PLANS) : 'free';
}

/**
 * Helper: Retrieve limits for a given subscription tier with fallback to free trial.
 */
export function getPlanLimits(tier?: string | null): PlanDefinition {
  return SUBSCRIPTION_PLANS[canonicalTier(tier)];
}

/**
 * Helper: Check if a specific feature is enabled on a given tier.
 */
export function isFeatureAllowed(tier: string | null | undefined, feature: keyof PlanFeatures): boolean {
  const plan = getPlanLimits(tier);
  const val = plan.features[feature];
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  return false;
}
