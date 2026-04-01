import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyToken } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/stream', async (req, res: Response) => {
  const tokenQ = typeof req.query.token === 'string' ? req.query.token : '';
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const tokenH = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const token = tokenH || tokenQ;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let lastUnread = -1;
  let lastSessions = -1;
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const tick = async () => {
    try {
      const unreadCount = await prisma.notification.count({
        where: { userId: payload.userId, readAt: null },
      });
      const activeSessions = await prisma.userSession.count({
        where: {
          userId: payload.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (lastUnread !== unreadCount) {
        lastUnread = unreadCount;
        send('notifications_update', { unreadCount });
      }
      if (lastSessions !== activeSessions) {
        lastSessions = activeSessions;
        send('sessions_update', { activeSessions });
      }
      if (lastUnread === unreadCount && lastSessions === activeSessions) {
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
