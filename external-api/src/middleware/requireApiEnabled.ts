import type { RequestHandler } from 'express';
import type { Config } from '../config.js';
import { AppError } from '../lib/errors.js';

/**
 * Kill-switch layer 1 of 3 (D16): env -> platform -> account. Mounted on `/api`
 * only, and mounted *after* the health route, so `EXTERNAL_API_ENABLED=false`
 * takes the API out of service while the process still reports healthy and
 * Railway does not restart it in a loop.
 */
export const requireApiEnabled =
  (config: Config): RequestHandler =>
  (_req, _res, next) => {
    if (!config.EXTERNAL_API_ENABLED) {
      next(new AppError(503, 'API_DISABLED', 'The external API is temporarily disabled'));
      return;
    }

    next();
  };
