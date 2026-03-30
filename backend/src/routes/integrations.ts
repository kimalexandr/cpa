import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

router.get('/health', async (req: AuthRequest, res: Response) => {
  try {
    const protocol = req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    const origin = `${protocol}://${host}`;
    const postbackUrl = origin + '/api/events';

    let links: Array<{ token: string; offerTitle: string }> = [];
    if (req.user?.role === 'affiliate') {
      const rows = await prisma.trackingLink.findMany({
        where: { affiliateId: req.user.userId },
        include: { offer: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      links = rows.map((r) => ({ token: r.token, offerTitle: r.offer.title }));
    } else if (req.user?.role === 'supplier') {
      const rows = await prisma.trackingLink.findMany({
        where: { offer: { supplierId: req.user.userId } },
        include: { offer: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      links = rows.map((r) => ({ token: r.token, offerTitle: r.offer.title }));
    }

    const linkTokens = links.map((l) => l.token);
    const eventRows = linkTokens.length
      ? await prisma.event.findMany({
          where: { trackingLink: { token: { in: linkTokens } } },
          include: { trackingLink: { select: { token: true, offer: { select: { title: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    const lastResponses = eventRows.map((e) => ({
      createdAt: e.createdAt,
      token: e.trackingLink.token,
      offerTitle: e.trackingLink.offer.title,
      eventType: e.eventType,
      status: e.status,
      amount: e.amount != null ? Number(e.amount) : null,
    }));

    res.json({
      postbackUrl,
      trackingTokens: links,
      lastResponses,
    });
  } catch (e) {
    console.error('GET /api/integrations/health:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
