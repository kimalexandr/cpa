import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

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
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
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
    const [clicks, leads, sales, approvedSum, payoutsSum] = await Promise.all([
      prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'click' } }),
      prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'lead' } }),
      prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'sale' } }),
      prisma.event.aggregate({
        where: { trackingLinkId: { in: linkIds }, eventType: 'sale', status: 'approved' },
        _sum: { amount: true },
      }),
      prisma.payout.aggregate({
        where: { affiliateId: req.user!.userId, status: 'paid' },
        _sum: { amount: true },
      }),
    ]);
    const connectedOffers = await prisma.affiliateOfferParticipation.count({
      where: { affiliateId: req.user!.userId, status: 'approved' },
    });
    res.json({
      clicks,
      leads,
      sales,
      earned: Number(approvedSum._sum.amount || 0),
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

/** Баланс: заработано, выведено, доступно к выводу */
router.get('/balance', async (req: AuthRequest, res: Response) => {
  try {
    const links = await prisma.trackingLink.findMany({
      where: { affiliateId: req.user!.userId },
      select: { id: true },
    });
    const linkIds = links.map((l: { id: string }) => l.id);
    const [approvedSum, payoutsSum] = await Promise.all([
      prisma.event.aggregate({
        where: { trackingLinkId: { in: linkIds }, eventType: 'sale', status: 'approved' },
        _sum: { amount: true },
      }),
      prisma.payout.aggregate({
        where: { affiliateId: req.user!.userId, status: 'paid' },
        _sum: { amount: true },
      }),
    ]);
    const earned = Number(approvedSum._sum.amount || 0);
    const paidOut = Number(payoutsSum._sum.amount || 0);
    const pendingSum = await prisma.payout.aggregate({
      where: { affiliateId: req.user!.userId, status: { in: ['pending', 'processing'] } },
      _sum: { amount: true },
    });
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
    const [approvedSum, payoutsSum, pendingSum] = await Promise.all([
      prisma.event.aggregate({
        where: { trackingLinkId: { in: linkIds }, eventType: 'sale', status: 'approved' },
        _sum: { amount: true },
      }),
      prisma.payout.aggregate({
        where: { affiliateId: req.user!.userId, status: 'paid' },
        _sum: { amount: true },
      }),
      prisma.payout.aggregate({
        where: { affiliateId: req.user!.userId, status: { in: ['pending', 'processing'] } },
        _sum: { amount: true },
      }),
    ]);
    const earned = Number(approvedSum._sum.amount || 0);
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
      select: { createdAt: true, eventType: true, amount: true, status: true },
    });

    const byDayMap: Record<string, { clicks: number; leads: number; sales: number; earned: number }> = {};
    let summary = { clicks: 0, leads: 0, sales: 0, earned: 0 };
    for (const e of events) {
      const d = (e.createdAt as Date).toISOString().slice(0, 10);
      if (!byDayMap[d]) byDayMap[d] = { clicks: 0, leads: 0, sales: 0, earned: 0 };
      if (e.eventType === 'click') { byDayMap[d].clicks++; summary.clicks++; }
      if (e.eventType === 'lead') { byDayMap[d].leads++; summary.leads++; }
      if (e.eventType === 'sale') {
        byDayMap[d].sales++;
        summary.sales++;
        if (e.status === 'approved' && e.amount != null) {
          byDayMap[d].earned += Number(e.amount);
          summary.earned += Number(e.amount);
        }
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
