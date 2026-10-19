import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import config from '@/config';
import { authenticate } from '@/middleware/auth';
import { eventBus } from '@/lib/realtime-emitter';
import logger from '@/lib/logger';

const router = Router();

// Ticket issuer — uses existing authenticate (Bearer accessToken) — no new auth logic
router.get('/ticket', authenticate, (req: Request, res: Response) => {
  const userId = (req as any).user.userId as string;
  const ticket = jwt.sign(
    { userId, aud: 'sse' },
    (config as any).realtime.ticketSecret,
    { expiresIn: '30s', algorithm: 'HS256' }
  );
  res.json({ ticket });
});

// Stream — verifies ticket, NOT raw JWT from query (ticket prevents log leak, short expiry)
router.get('/stream', async (req: Request, res: Response) => {
  const ticket = (req.query.ticket as string) || '';
  if (!ticket) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'SSE ticket required — GET /api/v1/events/ticket first' },
    });
  }

  let payload: any;
  try {
    payload = jwt.verify(ticket, (config as any).realtime.ticketSecret, {
      algorithms: ['HS256'],
      audience: 'sse',
    } as any);
  } catch {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired SSE ticket' },
    });
  }

  const userId = payload.userId as string;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(`data: ${JSON.stringify({ type: 'connection_established', userId, timestamp: new Date().toISOString() })}\n\n`);
  logger.info('SSE opened', { userId });

  const handler = (event: any) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (e) {
      cleanup();
    }
  };

  eventBus.on(`user:${userId}`, handler);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      cleanup();
    }
  }, 30000);

  const cleanup = () => {
    clearInterval(keepAlive);
    eventBus.off(`user:${userId}`, handler);
    logger.info('SSE closed', { userId });
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
});

export default router;
