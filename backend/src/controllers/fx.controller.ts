import type { Request, Response } from 'express';
import { getRates } from '@/services/fx.service';

export async function getRatesHandler(_req: Request, res: Response) {
  const data = await getRates();
  res.json({ success: true, data });
}
