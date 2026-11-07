export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 2;
export const TRIAL_STORAGE_KEY = 'wallx_trial_started_at';

export interface FrontendPlanLimits {
  name: string;
  maxBusinesses: number;
  maxTeamMembers: number;
  maxMonthlyAiQueries: number;
  bnplCredits: boolean;
}

export const PLAN_LIMITS: Record<string, FrontendPlanLimits> = {
  free: {
    name: '30-Day Free Trial',
    maxBusinesses: 5,
    maxTeamMembers: 10,
    maxMonthlyAiQueries: 30,
    bnplCredits: true,
  },
  starter: {
    name: 'Starter Plan',
    maxBusinesses: 2,
    maxTeamMembers: 3,
    maxMonthlyAiQueries: 30,
    bnplCredits: false,
  },
  business: {
    name: 'Business Plan',
    maxBusinesses: 5,
    maxTeamMembers: 10,
    maxMonthlyAiQueries: 100,
    bnplCredits: true,
  },
  scale: {
    name: 'Scale-Up Plan',
    maxBusinesses: -1,
    maxTeamMembers: -1,
    maxMonthlyAiQueries: -1,
    bnplCredits: true,
  },
};

export function getPlanLimits(tier?: string | null): FrontendPlanLimits {
  if (!tier) return PLAN_LIMITS.free;
  const normalized = tier.toLowerCase().trim();
  if (normalized === 'scale_up' || normalized === 'scaleup') return PLAN_LIMITS.scale;
  if (normalized === 'free_trial' || normalized === 'trial') return PLAN_LIMITS.free;
  return PLAN_LIMITS[normalized] ?? PLAN_LIMITS.free;
}
