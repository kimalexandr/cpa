import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

/** Заработано по одобренным лидам/продажам с учётом холда и модели оффера (CPL=lead, CPA/RevShare=sale) */
async function getEarnedWithHold(linkIds: string[]): Promise<number> {
  if (!linkIds.length) return 0;
  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      trackingLinkId: { in: linkIds },
      eventType: { in: ['lead', 'sale'] },
      status: 'approved',
    },
    select: { amount: true, eventType: true, createdAt: true, trackingLinkId: true },
  });
  const links = await prisma.trackingLink.findMany({
    where: { id: { in: linkIds } },
    select: { id: true, offerId: true },
  });
  const offers = await prisma.offer.findMany({
    where: { id: { in: links.map((l) => l.offerId) } },
    select: { id: true, holdDays: true, payoutModel: true },
  });
  const offerById: Record<string, { holdDays: number | null; payoutModel: string }> = {};
  offers.forEach((o) => {
    offerById[o.id] = { holdDays: o.holdDays != null ? Number(o.holdDays) : null, payoutModel: o.payoutModel };
  });
  const linkToOffer: Record<string, string> = {};
  links.forEach((l) => { linkToOffer[l.id] = l.offerId; });
  let sum = 0;
  for (const e of events) {
    const offer = offerById[linkToOffer[e.trackingLinkId]];
    if (!offer) continue;
    const holdDays = offer.holdDays ?? 0;
    const holdUntil = new Date((e.createdAt as Date).getTime() + holdDays * 24 * 60 * 60 * 1000);
    if (holdUntil > now) continue;
    const countLead = offer.payoutModel === 'CPL' && e.eventType === 'lead';
    const countSale = (offer.payoutModel === 'CPA' || offer.payoutModel === 'RevShare') && e.eventType === 'sale';
    if (countLead || countSale) sum += Number(e.amount ?? 0);
  }
  return sum;
}

router.use(requireAuth);
router.use(requireRole('affiliate'));

router.post('/offers/:id/join', async (req: AuthRequest, res: Response) => {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
    });
    if (!offer || offer.status !== 'active') {
      res.status(404).json({ error: 'Оффер не найден или не активен' });
      return;
    }
    const existing = await prisma.affiliateOfferParticipation.findUnique({
      where: {
        offerId_affiliateId: { offerId: req.params.id, affiliateId: req.user!.userId },
      },
    });
    if (existing) {
      res.status(400).json({ error: 'Заявка уже подана', participation: existing });
      return;
    }
    const participation = await prisma.affiliateOfferParticipation.create({
      data: {
        offerId: req.params.id,
        affiliateId: req.user!.userId,
        status: 'pending',
      },
      include: { offer: { select: { id: true, title: true, status: true } } },
    });
    res.status(201).json(participation);
  } catch (e) {
    console.error('POST /api/affiliate/offers/:id/join:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/my-offers', async (req: AuthRequest, res: Response) => {
  try {
    const participations = await prisma.affiliateOfferParticipation.findMany({
      where: { affiliateId: req.user!.userId },
      include: {
        offer: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const trackingLinks = await prisma.trackingLink.findMany({
      where: { affiliateId: req.user!.userId },
      select: { offerId: true, token: true },
    });
    const tokenByOfferId: Record<string, string> = {};
    trackingLinks.forEach((t: { offerId: string; token: string }) => {
      tokenByOfferId[t.offerId] = t.token;
    });
    const baseUrl =
      process.env.API_BASE_URL ||
      (req.protocol && req.get('host') ? `${req.protocol}://${req.get('host')}` : 'http://localhost:3000');
    const list = participations.map((p: { offerId: string; [k: string]: unknown }) => ({
      ...p,
      trackingLink: tokenByOfferId[p.offerId] ? baseUrl + '/t/' + tokenByOfferId[p.offerId] : null,
    }));
    res.json(list);
  } catch (e) {
    console.error('GET /api/affiliate/my-offers:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const links = await prisma.trackingLink.findMany({
      where: { affiliateId: req.user!.userId },
      select: { id: true },
    });
    const linkIds = links.map((l: { id: string }) => l.id);
    const [clicks, leads, sales, payoutsSum, earned] = await Promise.all([
      prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'click' } }),
      prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'lead' } }),
      prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'sale' } }),
      prisma.payout.aggregate({
        where: { affiliateId: req.user!.userId, status: 'paid' },
        _sum: { amount: true },
      }),
      getEarnedWithHold(linkIds),
    ]);
    const connectedOffers = await prisma.affiliateOfferParticipation.count({
      where: { affiliateId: req.user!.userId, status: 'approved' },
    });
    res.json({
      clicks,
      leads,
      sales,
      earned,
      paidOut: Number(payoutsSum._sum.amount || 0),
      connectedOffers,
    });
  } catch (e) {
    console.error('GET /api/affiliate/stats:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

const MIN_PAYOUT = 1000;
const CURRENCY = 'RUB';

/** Баланс: заработано (с холдом), выведено, доступно к выводу */
router.get('/balance', async (req: AuthRequest, res: Response) => {
  try {
    const links = await prisma.trackingLink.findMany({
      where: { affiliateId: req.user!.userId },
      select: { id: true },
    });
    const linkIds = links.map((l: { id: string }) => l.id);
    const [earned, payoutsSum, pendingSum] = await Promise.all([
      getEarnedWithHold(linkIds),
      prisma.payout.aggregate({
        where: { affiliateId: req.user!.userId, status: 'paid' },
        _sum: { amount: true },
      }),
      prisma.payout.aggregate({
        where: { affiliateId: req.user!.userId, status: { in: ['pending', 'processing'] } },
        _sum: { amount: true },
      }),
    ]);
    const paidOut = Number(payoutsSum._sum.amount || 0);
    const pendingAmount = Number(pendingSum._sum.amount || 0);
    const availableBalance = Math.max(0, earned - paidOut - pendingAmount);
    res.json({
      earned,
      paidOut,
      pendingAmount,
      availableBalance,
      currency: CURRENCY,
      minPayout: MIN_PAYOUT,
    });
  } catch (e) {
    console.error('GET /api/affiliate/balance:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** Заявка на вывод средств */
router.post('/payouts', async (req: AuthRequest, res: Response) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < MIN_PAYOUT) {
      res.status(400).json({ error: 'Минимальная сумма вывода: ' + MIN_PAYOUT + ' ' + CURRENCY });
      return;
    }
    const links = await prisma.trackingLink.findMany({
      where: { affiliateId: req.user!.userId },
      select: { id: true },
    });
    const linkIds = links.map((l: { id: string }) => l.id);
    const [earned, payoutsSum, pendingSum] = await Promise.all([
      getEarnedWithHold(linkIds),
      prisma.payout.aggregate({
        where: { affiliateId: req.user!.userId, status: 'paid' },
        _sum: { amount: true },
      }),
      prisma.payout.aggregate({
        where: { affiliateId: req.user!.userId, status: { in: ['pending', 'processing'] } },
        _sum: { amount: true },
      }),
    ]);
    const paidOut = Number(payoutsSum._sum.amount || 0);
    const pendingAmount = Number(pendingSum._sum.amount || 0);
    const availableBalance = Math.max(0, earned - paidOut - pendingAmount);
    if (amount > availableBalance) {
      res.status(400).json({ error: 'Недостаточно средств. Доступно: ' + availableBalance.toFixed(2) + ' ' + CURRENCY });
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const payout = await prisma.payout.create({
      data: {
        affiliateId: req.user!.userId,
        periodStart: today,
        periodEnd: today,
        amount,
        currency: CURRENCY,
        status: 'pending',
      },
    });
    res.status(201).json(payout);
  } catch (e) {
    console.error('POST /api/affiliate/payouts:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** История выплат */
router.get('/payouts', async (req: AuthRequest, res: Response) => {
  try {
    const list = await prisma.payout.findMany({
      where: { affiliateId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(list);
  } catch (e) {
    console.error('GET /api/affiliate/payouts:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** Аналитика по периодам */
router.get('/analytics', async (req: AuthRequest, res: Response) => {
  try {
    const fromQ = (req.query.from as string) || '';
    const toQ = (req.query.to as string) || '';
    const toDate = toQ ? new Date(toQ) : new Date();
    const fromDate = fromQ ? new Date(fromQ) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const links = await prisma.trackingLink.findMany({
      where: { affiliateId: req.user!.userId },
      select: { id: true },
    });
    const linkIds = links.map((l: { id: string }) => l.id);
    if (!linkIds.length) {
      res.json({ summary: { clicks: 0, leads: 0, sales: 0, earned: 0 }, byDay: [] });
      return;
    }

    const events = await prisma.event.findMany({
      where: {
        trackingLinkId: { in: linkIds },
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: { createdAt: true, eventType: true, amount: true, status: true, trackingLinkId: true },
    });

    const byDayMap: Record<string, { clicks: number; leads: number; sales: number; earned: number }> = {};
    let summary = { clicks: 0, leads: 0, sales: 0, earned: 0 };
    const linksWithOffers = await prisma.trackingLink.findMany({
      where: { id: { in: linkIds } },
      select: { id: true, offerId: true },
    });
    const offersForAnalytics = await prisma.offer.findMany({
      where: { id: { in: linksWithOffers.map((l) => l.offerId) } },
      select: { id: true, payoutModel: true },
    });
    const offerModel: Record<string, string> = {};
    offersForAnalytics.forEach((o) => { offerModel[o.id] = o.payoutModel; });
    const linkToOffer: Record<string, string> = {};
    linksWithOffers.forEach((l) => { linkToOffer[l.id] = l.offerId; });

    for (const e of events) {
      const d = (e.createdAt as Date).toISOString().slice(0, 10);
      if (!byDayMap[d]) byDayMap[d] = { clicks: 0, leads: 0, sales: 0, earned: 0 };
      if (e.eventType === 'click') { byDayMap[d].clicks++; summary.clicks++; }
      if (e.eventType === 'lead') { byDayMap[d].leads++; summary.leads++; }
      if (e.eventType === 'sale') { byDayMap[d].sales++; summary.sales++; }
      const model = offerModel[linkToOffer[e.trackingLinkId]];
      const countEarned = e.status === 'approved' && e.amount != null &&
        ((model === 'CPL' && e.eventType === 'lead') || ((model === 'CPA' || model === 'RevShare') && e.eventType === 'sale'));
      if (countEarned) {
        byDayMap[d].earned += Number(e.amount);
        summary.earned += Number(e.amount);
      }
    }
    const byDay = Object.keys(byDayMap).sort().map((date) => ({ date, ...byDayMap[date] }));
    res.json({ summary, byDay });
  } catch (e) {
    console.error('GET /api/affiliate/analytics:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
