import { Router, Response } from 'express';
import { PrismaClient, ParticipationStatus, EventStatus, OfferStatus, PayoutStatus } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

type StatusCenterItem = {
  id: string;
  entityType: 'offer_participation' | 'event_moderation' | 'offer_moderation' | 'payout';
  offerId?: string;
  offerTitle?: string;
  status: ParticipationStatus | EventStatus | OfferStatus | PayoutStatus;
  reason: string | null;
  nextStep: string;
  retryAllowed: boolean;
  actionLink: string;
  updatedAt: Date;
};

function parseReason(body: string | null): string | null {
  if (!body) return null;
  const m = body.match(/Причина:\s*([\s\S]+)/);
  return m && m[1] ? m[1].trim() : null;
}

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.json({ items: [] as StatusCenterItem[] });
    if (req.user.role === 'affiliate') {
      const participations = await prisma.affiliateOfferParticipation.findMany({
        where: { affiliateId: req.user.userId },
        include: { offer: { select: { id: true, title: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });

      const rejectedNotifs = await prisma.notification.findMany({
        where: {
          userId: req.user.userId,
          type: 'participation_rejected',
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
        select: { body: true, link: true },
      });

      const reasonByOfferId: Record<string, string> = {};
      for (const n of rejectedNotifs) {
        if (!n.link) continue;
        const marker = 'offer.html?id=';
        if (n.link.indexOf(marker) === -1) continue;
        const offerId = n.link.split(marker)[1]?.split('&')[0] || '';
        if (!offerId || reasonByOfferId[offerId]) continue;
        const reason = parseReason(n.body);
        if (reason) reasonByOfferId[offerId] = reason;
      }

      const items: StatusCenterItem[] = participations.map((p) => {
        let nextStep = 'Откройте оффер и проверьте условия.';
        let retryAllowed = false;
        if (p.status === 'approved') {
          nextStep = 'Запустите трафик по трекинг-ссылке и отправьте тестовый лид.';
        } else if (p.status === 'pending') {
          nextStep = 'Ожидайте модерацию или уточните условия у поставщика.';
        } else if (p.status === 'rejected' || p.status === 'blocked') {
          nextStep = 'Исправьте источник/креатив и подайте заявку повторно.';
          retryAllowed = true;
        }
        return {
          id: p.id,
          entityType: 'offer_participation',
          offerId: p.offerId,
          offerTitle: p.offer.title,
          status: p.status,
          reason: p.status === 'rejected' ? (reasonByOfferId[p.offerId] || null) : null,
          nextStep,
          retryAllowed,
          actionLink: '/offer.html?id=' + encodeURIComponent(p.offerId),
          updatedAt: p.updatedAt,
        };
      });
      res.json({ items });
      return;
    }

    if (req.user.role === 'supplier') {
      const [pendingParticipations, pendingEvents, draftOffers] = await Promise.all([
        prisma.affiliateOfferParticipation.findMany({
          where: { status: 'pending', offer: { supplierId: req.user.userId } },
          include: { offer: { select: { id: true, title: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 120,
        }),
        prisma.event.findMany({
          where: { status: 'pending', trackingLink: { offer: { supplierId: req.user.userId } }, eventType: { in: ['lead', 'sale'] } },
          include: { trackingLink: { include: { offer: { select: { id: true, title: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: 120,
        }),
        prisma.offer.findMany({
          where: { supplierId: req.user.userId, status: 'draft' },
          select: { id: true, title: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 60,
        }),
      ]);
      const items: StatusCenterItem[] = [];
      pendingParticipations.forEach((p) => items.push({
        id: 'sp-' + p.id,
        entityType: 'offer_participation',
        offerId: p.offerId,
        offerTitle: p.offer.title,
        status: p.status,
        reason: null,
        nextStep: 'Проверьте заявку affiliate и примите решение.',
        retryAllowed: false,
        actionLink: '/dashboard-supplier-requests.html',
        updatedAt: p.updatedAt,
      }));
      pendingEvents.forEach((e) => items.push({
        id: 'se-' + e.id,
        entityType: 'event_moderation',
        offerId: e.trackingLink.offer.id,
        offerTitle: e.trackingLink.offer.title,
        status: e.status,
        reason: null,
        nextStep: 'Проверьте лид/продажу и передайте на финальную модерацию.',
        retryAllowed: false,
        actionLink: '/dashboard-supplier-leads.html',
        updatedAt: e.createdAt,
      }));
      draftOffers.forEach((o) => items.push({
        id: 'so-' + o.id,
        entityType: 'offer_moderation',
        offerId: o.id,
        offerTitle: o.title,
        status: 'draft',
        reason: null,
        nextStep: 'Доработайте оффер и отправьте на модерацию.',
        retryAllowed: true,
        actionLink: '/create-offer.html?id=' + encodeURIComponent(o.id),
        updatedAt: o.updatedAt,
      }));
      res.json({ items: items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()) });
      return;
    }

    if (req.user.role === 'admin') {
      const [pendingEvents, draftOffers, pendingPayouts] = await Promise.all([
        prisma.event.findMany({
          where: { status: 'pending', eventType: { in: ['lead', 'sale'] } },
          include: { trackingLink: { include: { offer: { select: { id: true, title: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: 150,
        }),
        prisma.offer.findMany({
          where: { status: 'draft' },
          select: { id: true, title: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 100,
        }),
        prisma.payout.findMany({
          where: { status: { in: ['pending', 'processing'] } },
          select: { id: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 150,
        }),
      ]);
      const items: StatusCenterItem[] = [];
      pendingEvents.forEach((e) => items.push({
        id: 'ae-' + e.id,
        entityType: 'event_moderation',
        offerId: e.trackingLink.offer.id,
        offerTitle: e.trackingLink.offer.title,
        status: e.status,
        reason: null,
        nextStep: 'Проверьте событие и укажите решение (approved/rejected).',
        retryAllowed: false,
        actionLink: '/admin/moderation.html',
        updatedAt: e.createdAt,
      }));
      draftOffers.forEach((o) => items.push({
        id: 'ao-' + o.id,
        entityType: 'offer_moderation',
        offerId: o.id,
        offerTitle: o.title,
        status: 'draft',
        reason: null,
        nextStep: 'Проведите модерацию оффера (active/paused/closed).',
        retryAllowed: false,
        actionLink: '/admin/offers.html',
        updatedAt: o.updatedAt,
      }));
      pendingPayouts.forEach((p) => items.push({
        id: 'ap-' + p.id,
        entityType: 'payout',
        status: p.status,
        reason: null,
        nextStep: 'Обработайте выплату и обновите финальный статус.',
        retryAllowed: false,
        actionLink: '/admin/finance.html',
        updatedAt: p.createdAt,
      }));
      res.json({ items: items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()) });
      return;
    }

    res.json({ items: [] as StatusCenterItem[] });
  } catch (e) {
    console.error('GET /api/status-center:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
