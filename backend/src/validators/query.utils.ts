import { z } from 'zod';

// Transform query params from string | string[] to single values
// Express returns string | string[] for query params
const asString = z.preprocess(
  (val) => (Array.isArray(val) ? val[0] : val),
  z.string()
);

const asStringOptional = z.preprocess(
  (val) => (Array.isArray(val) ? val[0] : val),
  z.string().optional()
);

const asNumber = (opts?: { min?: number; max?: number; int?: boolean }) =>
  z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    opts?.int
      ? z.coerce.number().int().min(opts.min ?? 0).max(opts.max ?? Number.MAX_SAFE_INTEGER)
      : z.coerce.number().min(opts?.min ?? 0).max(opts?.max ?? Number.MAX_SAFE_INTEGER)
  );

const asNumberOptional = (opts?: { min?: number; max?: number; int?: boolean }) =>
  z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    opts?.int
      ? z.coerce.number().int().min(opts.min ?? 0).max(opts.max ?? Number.MAX_SAFE_INTEGER).optional()
      : z.coerce.number().min(opts?.min ?? 0).max(opts?.max ?? Number.MAX_SAFE_INTEGER).optional()
  );

const asBooleanOptional = z.preprocess((val) => {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === '' || raw === undefined) return undefined;
  return raw;
}, z.boolean().optional());

export { asString, asStringOptional, asNumber, asNumberOptional, asBooleanOptional };