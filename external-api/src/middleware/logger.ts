import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

/** Health probes are frequent and carry no information worth a log line. */
const SILENT_PATHS = new Set(['/health']);

/**
 * Logs method, path, status and duration — never the body, and never the query
 * string. `req.path` is used rather than `req.originalUrl` because a capability
 * URL carries its credential in the path (`/public/invoices/:shareToken/pdf`,
 * plan §8.4); query strings are just as easy to leak a token through.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  if (SILENT_PATHS.has(req.path)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    logger.info(
      {
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      'request',
    );
  });

  next();
};
