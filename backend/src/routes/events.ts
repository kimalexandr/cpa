import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { token, tracking_link_id, event_type, amount, external_id } = req.body;
    const linkId = tracking_link_id || null;
    let trackingLinkId: string | null = null;
    if (token) {
      const link = await prisma.trackingLink.findUnique({
        where: { token: String(token) },
        select: { id: true },
      });
      trackingLinkId = link?.id || null;
    } else if (linkId) {
      const link = await prisma.trackingLink.findUnique({
        where: { id: String(linkId) },
        select: { id: true },
      });
      trackingLinkId = link?.id || null;
    }
    if (!trackingLinkId) {
      res.status(400).json({ error: 'Укажите token или tracking_link_id' });
      return;
    }
    const eventType = event_type === 'lead' || event_type === 'sale' ? event_type : 'lead';
    const event = await prisma.event.create({
      data: {
        trackingLinkId,
        eventType,
        amount: amount != null ? Number(amount) : null,
        currency: 'RUB',
        status: 'pending',
        externalId: external_id || null,
      },
    });
    res.status(201).json(event);
  } catch (e) {
    console.error('POST /api/events:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
