import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createNotification } from '../lib/notifications';

const router = Router();
const prisma = new PrismaClient();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { token, tracking_link_id, event_type, amount, external_id, source, subid1, subid2, subid3, subid4, subid5 } = req.body;
    const linkId = tracking_link_id || null;
    let link: { id: string; offerId: string; affiliateId: string } | null = null;
    if (token) {
      link = await prisma.trackingLink.findUnique({
        where: { token: String(token) },
        select: { id: true, offerId: true, affiliateId: true },
      });
    } else if (linkId) {
      link = await prisma.trackingLink.findUnique({
        where: { id: String(linkId) },
        select: { id: true, offerId: true, affiliateId: true },
      });
    }
    if (!link) {
      res.status(400).json({ error: 'Укажите token или tracking_link_id' });
      return;
    }
    const eventType = event_type === 'lead' || event_type === 'sale' ? event_type : 'lead';
    if (external_id) {
      const existingByExternal = await prisma.event.findFirst({
        where: { trackingLinkId: link.id, externalId: String(external_id) },
        orderBy: { createdAt: 'desc' },
      });
      if (existingByExternal) {
        res.json({ ...existingByExternal, deduplicated: true, idempotencyKey: String(external_id) });
        return;
      }
    }
    const offer = await prisma.offer.findUnique({
      where: { id: link.offerId },
      select: { payoutAmount: true, payoutModel: true, capAmount: true, capConversions: true, supplierId: true, title: true },
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
    const fraudFlags: string[] = [];
    const recentCount = await prisma.event.count({
      where: {
        trackingLinkId: link.id,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    if (recentCount >= 25) fraudFlags.push('velocity_spike');
    if (external_id && String(external_id).length < 4) fraudFlags.push('weak_external_id');
    if (offer && amountNum != null && Number(offer.payoutAmount) > 0 && Number(amountNum) > Number(offer.payoutAmount) * 5) fraudFlags.push('amount_anomaly');
    if (fraudFlags.length) {
      const admins = await prisma.user.findMany({
        where: { role: 'admin', status: 'active' },
        select: { id: true },
      });
      await Promise.all(admins.map((a) => createNotification(prisma, {
        userId: a.id,
        type: 'system',
        title: '[FRAUD] Автофлаг события',
        body: 'Оффер: ' + (offer?.title || link.offerId) + '. eventId: ' + event.id + '. Флаги: ' + fraudFlags.join(', ') + '. external_id: ' + (external_id || '—'),
        link: '/admin/moderation.html',
      })));
      if (offer?.supplierId) {
        await createNotification(prisma, {
          userId: offer.supplierId,
          type: 'system',
          title: '[FRAUD] Автофлаг события',
          body: 'Событие отправлено на ручную проверку. eventId: ' + event.id + '. Флаги: ' + fraudFlags.join(', ') + '. source: ' + (source || '—') + '. subid: ' + [subid1, subid2, subid3, subid4, subid5].filter(Boolean).join('|'),
          link: '/dashboard-supplier-leads.html',
        });
      }
    }
    await createNotification(prisma, {
      userId: link.affiliateId,
      type: 'system',
      title: 'Событие получено',
      body: 'Принято событие ' + eventType + (external_id ? ('. external_id: ' + String(external_id)) : '') + '. Статус: pending.' + (fraudFlags.length ? (' Автофлаги: ' + fraudFlags.join(', ')) : ''),
      link: '/analytics.html',
    });
    res.status(201).json({ ...event, fraudFlags, source: source || null, subids: [subid1, subid2, subid3, subid4, subid5].filter(Boolean) });
  } catch (e) {
    console.error('POST /api/events:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
