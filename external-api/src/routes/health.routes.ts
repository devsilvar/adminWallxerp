import { Router } from 'express';

export const healthRouter = Router();

/**
 * Liveness only — it does not touch Postgres, so a database blip cannot cause
 * Railway to kill a process that is otherwise fine. Reachability of the database
 * belongs in a separate readiness check when there is a database to reach
 * (Phase 1).
 */
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    data: {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});
