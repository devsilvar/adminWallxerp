import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * The server always mints the id; an inbound `X-Request-Id` is deliberately
 * ignored. Accepting one would let a caller choose its own correlation id,
 * which can be used to collide two tenants' logs or to poison a support trace.
 */
export const requestId: RequestHandler = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
