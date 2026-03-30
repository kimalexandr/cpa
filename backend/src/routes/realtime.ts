import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyToken } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/stream', async (req, res: Response) => {
  const tokenQ = typeof req.query.token === 'string' ? req.query.token : '';
  const payload = tokenQ ? verifyToken(tokenQ) : null;
  if (!payload) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let lastUnread = -1;
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const tick = async () => {
    try {
      const unreadCount = await prisma.notification.count({
        where: { userId: payload.userId, readAt: null },
      });
      if (lastUnread !== unreadCount) {
        lastUnread = unreadCount;
        send('notifications_update', { unreadCount });
      } else {
        send('heartbeat', { ts: Date.now() });
      }
    } catch {
      // keep stream alive even if DB temporarily fails
      send('heartbeat', { ts: Date.now() });
    }
  };

  send('connected', { ok: true });
  await tick();
  const interval = setInterval(tick, 10000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

export default router;
