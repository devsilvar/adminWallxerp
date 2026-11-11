import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  EXTERNAL_API_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  INSTANCE_COUNT: z.coerce.number().int().positive().default(1),
  EXTERNAL_DATA_RATE_LIMIT: z.coerce.number().int().positive().default(120),
  EXTERNAL_ACTIVATION_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  EXTERNAL_PUBLIC_PDF_RATE_LIMIT: z.coerce.number().int().positive().default(30),

  EXTERNAL_ROTATE_GRACE_MINUTES: z.coerce.number().int().nonnegative().default(10),
  EXTERNAL_CODE_TTL_HOURS: z.coerce.number().int().positive().default(72),
  EXTERNAL_SHARE_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  EXTERNAL_TOMBSTONE_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  EXTERNAL_AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(730),

  PLATFORM_FLAT_FEE_NGN: z.coerce.number().nonnegative().default(0),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}
