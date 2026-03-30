import { Router, Response } from 'express';
import { PrismaClient, ParticipationStatus } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

type StatusCenterItem = {
  id: string;
  entityType: 'offer_participation';
  offerId: string;
  offerTitle: string;
  status: ParticipationStatus;
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
    // MVP: единый центр статусов для аффилиата (подключения к офферам).
    if (req.user?.role !== 'affiliate') {
      res.json({ items: [] as StatusCenterItem[] });
      return;
    }

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
  } catch (e) {
    console.error('GET /api/status-center:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
