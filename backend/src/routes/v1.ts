import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireScope } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

router.get('/affiliate/events', requireScope('affiliate:events.read', '*'), async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'affiliate') return res.status(403).json({ error: 'Только для affiliate' });
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const rows = await prisma.event.findMany({
      where: { trackingLink: { affiliateId: req.user.userId } },
      include: {
        trackingLink: { select: { token: true, offer: { select: { id: true, title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ items: rows });
  } catch (e) {
    console.error('GET /api/v1/affiliate/events:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/supplier/events', requireScope('supplier:events.read', '*'), async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'supplier') return res.status(403).json({ error: 'Только для supplier' });
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const rows = await prisma.event.findMany({
      where: { trackingLink: { offer: { supplierId: req.user.userId } } },
      include: {
        trackingLink: { select: { token: true, offer: { select: { id: true, title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ items: rows });
  } catch (e) {
    console.error('GET /api/v1/supplier/events:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/events', requireScope('events.write', '*'), async (req: AuthRequest, res: Response) => {
  try {
    const token = req.body?.token ? String(req.body.token) : '';
    if (!token) return res.status(400).json({ error: 'Передайте token' });
    const link = await prisma.trackingLink.findUnique({ where: { token }, select: { id: true } });
    if (!link) return res.status(404).json({ error: 'Tracking token не найден' });
    const event = await prisma.event.create({
      data: {
        trackingLinkId: link.id,
        eventType: req.body?.event_type === 'sale' ? 'sale' : 'lead',
        amount: req.body?.amount != null ? Number(req.body.amount) : null,
        currency: 'RUB',
        status: 'pending',
        externalId: req.body?.external_id ? String(req.body.external_id) : null,
      },
    });
    res.status(201).json(event);
  } catch (e) {
    console.error('POST /api/v1/events:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;

