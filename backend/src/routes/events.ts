import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { token, tracking_link_id, event_type, amount, external_id } = req.body;
    const linkId = tracking_link_id || null;
    let link: { id: string; offerId: string } | null = null;
    if (token) {
      link = await prisma.trackingLink.findUnique({
        where: { token: String(token) },
        select: { id: true, offerId: true },
      });
    } else if (linkId) {
      link = await prisma.trackingLink.findUnique({
        where: { id: String(linkId) },
        select: { id: true, offerId: true },
      });
    }
    if (!link) {
      res.status(400).json({ error: 'Укажите token или tracking_link_id' });
      return;
    }
    const eventType = event_type === 'lead' || event_type === 'sale' ? event_type : 'lead';
    const offer = await prisma.offer.findUnique({
      where: { id: link.offerId },
      select: { payoutAmount: true, payoutModel: true, capAmount: true, capConversions: true },
    });
    let amountNum = amount != null ? Number(amount) : null;
    if (amountNum == null && offer) {
      amountNum = Number(offer.payoutAmount ?? 0);
    }

    if (eventType === 'sale') {
      if (!offer) {
        res.status(400).json({ error: 'Оффер не найден' });
        return;
      }
      if (offer.capAmount != null || offer.capConversions != null) {
        const offerLinkIds = (await prisma.trackingLink.findMany({
          where: { offerId: link.offerId },
          select: { id: true },
        })).map((l: { id: string }) => l.id);
        const [sumResult, currentCount] = await Promise.all([
          prisma.event.aggregate({
            where: {
              trackingLinkId: { in: offerLinkIds },
              eventType: 'sale',
              status: 'approved',
            },
            _sum: { amount: true },
          }),
          prisma.event.count({
            where: {
              trackingLinkId: { in: offerLinkIds },
              eventType: 'sale',
              status: 'approved',
            },
          }),
        ]);
        const currentSum = Number(sumResult._sum.amount || 0);
        if (offer.capAmount != null && currentSum + (amountNum || 0) > Number(offer.capAmount)) {
          res.status(400).json({ error: 'Достигнут лимит бюджета по офферу (cap)' });
          return;
        }
        if (offer.capConversions != null && currentCount + 1 > Number(offer.capConversions)) {
          res.status(400).json({ error: 'Достигнут лимит конверсий по офферу (cap)' });
          return;
        }
      }
    }

    const event = await prisma.event.create({
      data: {
        trackingLinkId: link.id,
        eventType,
        amount: amountNum ?? (offer ? Number(offer.payoutAmount) : 0),
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
