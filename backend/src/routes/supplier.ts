import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import { sendParticipationApproved, sendParticipationRejected } from '../lib/email';
import { createNotification } from '../lib/notifications';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);
router.use(requireRole('supplier'));

router.get('/offers', async (req: AuthRequest, res: Response) => {
  const offers = await prisma.offer.findMany({
    where: { supplierId: req.user!.userId },
    include: { category: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(offers);
});

router.post('/offers', async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body;
    if (!b.categoryId || !b.title || !b.landingUrl) {
      res.status(400).json({ error: 'Укажите категорию, название и ссылку на лендинг' });
      return;
    }
    const categoryExists = await prisma.category.findUnique({
      where: { id: String(b.categoryId), isActive: true },
    });
    if (!categoryExists) {
      res.status(400).json({ error: 'Выбранная категория не найдена. Обновите страницу и выберите категорию снова.' });
      return;
    }
    const offer = await prisma.offer.create({
      data: {
        supplierId: req.user!.userId,
        categoryId: String(b.categoryId),
        title: String(b.title),
        description: String(b.description || ''),
        targetGeo: b.targetGeo ? String(b.targetGeo) : null,
        payoutModel: (b.payoutModel as 'CPA' | 'CPL' | 'RevShare') || 'CPA',
        payoutAmount: Number(b.payoutAmount) || 0,
        currency: String(b.currency || 'RUB'),
        landingUrl: String(b.landingUrl),
        status: 'draft',
        holdDays: b.holdDays != null ? Number(b.holdDays) : null,
        rules: b.rules != null ? String(b.rules) : null,
        capAmount: b.capAmount != null ? Number(b.capAmount) : null,
        capConversions: b.capConversions != null ? Number(b.capConversions) : null,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    res.status(201).json(offer);
  } catch (e) {
    console.error('POST /offers error:', e);
    const message = e instanceof Error ? e.message : 'Ошибка создания оффера';
    res.status(500).json({ error: message });
  }
});

router.patch('/offers/:id', async (req: AuthRequest, res: Response) => {
  const offer = await prisma.offer.findFirst({
    where: { id: req.params.id, supplierId: req.user!.userId },
  });
  if (!offer) {
    res.status(404).json({ error: 'Оффер не найден' });
    return;
  }
  const b = req.body;
  const data: Record<string, unknown> = {};
  if (b.categoryId != null) data.categoryId = b.categoryId;
  if (b.title != null) data.title = b.title;
  if (b.description != null) data.description = b.description;
  if (b.targetGeo != null) data.targetGeo = b.targetGeo;
  if (b.payoutModel != null) data.payoutModel = b.payoutModel;
  if (b.payoutAmount != null) data.payoutAmount = Number(b.payoutAmount);
  if (b.currency != null) data.currency = b.currency;
  if (b.landingUrl != null) data.landingUrl = b.landingUrl;
  if (b.holdDays !== undefined) data.holdDays = b.holdDays == null ? null : Number(b.holdDays);
  if (b.rules !== undefined) data.rules = b.rules == null ? null : String(b.rules);
  if (b.capAmount !== undefined) data.capAmount = b.capAmount == null ? null : Number(b.capAmount);
  if (b.capConversions !== undefined) data.capConversions = b.capConversions == null ? null : Number(b.capConversions);
  const updated = await prisma.offer.update({
    where: { id: req.params.id },
    data,
    include: { category: { select: { id: true, name: true, slug: true } } },
  });
  res.json(updated);
});

router.patch('/offers/:id/status', async (req: AuthRequest, res: Response) => {
  const offer = await prisma.offer.findFirst({
    where: { id: req.params.id, supplierId: req.user!.userId },
  });
  if (!offer) {
    res.status(404).json({ error: 'Оффер не найден' });
    return;
  }
  const status = req.body.status;
  if (!['draft', 'active', 'paused', 'closed'].includes(status)) {
    res.status(400).json({ error: 'Недопустимый статус' });
    return;
  }
  const updated = await prisma.offer.update({
    where: { id: req.params.id },
    data: { status },
    include: { category: { select: { id: true, name: true, slug: true } } },
  });
  res.json(updated);
});

router.get('/offers/:id/affiliates', async (req: AuthRequest, res: Response) => {
  const offer = await prisma.offer.findFirst({
    where: { id: req.params.id, supplierId: req.user!.userId },
  });
  if (!offer) {
    res.status(404).json({ error: 'Оффер не найден' });
    return;
  }
  const list = await prisma.affiliateOfferParticipation.findMany({
    where: { offerId: req.params.id },
    include: {
      affiliate: { select: { id: true, email: true, name: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(list);
});

router.patch('/affiliate-participation/:id', async (req: AuthRequest, res: Response) => {
  const status = req.body.status;
  if (status !== 'approved' && status !== 'rejected') {
    res.status(400).json({ error: 'Укажите status: approved или rejected' });
    return;
  }
  const p = await prisma.affiliateOfferParticipation.findUnique({
    where: { id: req.params.id },
    include: { offer: true, affiliate: { select: { email: true, affiliateProfile: { select: { notifyParticipation: true } } } } },
  });
  if (!p || p.offer.supplierId !== req.user!.userId) {
    res.status(404).json({ error: 'Заявка не найдена' });
    return;
  }
  const updated = await prisma.affiliateOfferParticipation.update({
    where: { id: req.params.id },
    data: { status },
  });
  if (status === 'approved') {
    const token = 'tk-' + p.affiliateId.slice(0, 8) + '-' + p.offerId.slice(0, 8);
    await prisma.trackingLink.upsert({
      where: { token },
      update: {},
      create: { offerId: p.offerId, affiliateId: p.affiliateId, token },
    });
  }
  const sendParticipationEmail = (p.affiliate as { affiliateProfile?: { notifyParticipation: boolean | null } } | null)?.affiliateProfile?.notifyParticipation !== false;
  if (p.affiliate?.email && sendParticipationEmail) {
    if (status === 'approved') {
      const baseApi = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
      const token = 'tk-' + p.affiliateId.slice(0, 8) + '-' + p.offerId.slice(0, 8);
      const trackingUrl = baseApi.replace(/\/api\/?$/, '') + '/t/' + token;
      await sendParticipationApproved(p.affiliate.email, p.offer.title, trackingUrl);
    } else {
      await sendParticipationRejected(p.affiliate.email, p.offer.title);
    }
  }
  await createNotification(prisma, {
    userId: p.affiliateId,
    type: status === 'approved' ? 'participation_approved' : 'participation_rejected',
    title: status === 'approved' ? 'Заявка на оффер одобрена' : 'Заявка на оффер отклонена',
    body: 'Оффер: ' + p.offer.title,
    link: status === 'approved' ? '/dashboard-affiliate-connections.html' : undefined,
  });
  res.json(updated);
});

router.get('/stats', async (req: AuthRequest, res: Response) => {
  const offers = await prisma.offer.findMany({
    where: { supplierId: req.user!.userId },
    select: { id: true },
  });
  const offerIds = offers.map((o: { id: string }) => o.id);
  const links = await prisma.trackingLink.findMany({
    where: { offerId: { in: offerIds } },
    select: { id: true },
  });
  const linkIds = links.map((l: { id: string }) => l.id);
  const [clicks, leads, sales, sumResult] = await Promise.all([
    prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'click' } }),
    prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'lead' } }),
    prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'sale' } }),
    prisma.event.aggregate({
      where: { trackingLinkId: { in: linkIds }, eventType: 'sale', status: 'approved' },
      _sum: { amount: true },
    }),
  ]);
  res.json({
    offersCount: offers.length,
    clicks,
    leads,
    sales,
    totalPayout: Number(sumResult._sum.amount || 0),
  });
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

    const offers = await prisma.offer.findMany({
      where: { supplierId: req.user!.userId },
      select: { id: true },
    });
    const offerIds = offers.map((o: { id: string }) => o.id);
    const links = await prisma.trackingLink.findMany({
      where: { offerId: { in: offerIds } },
      select: { id: true },
    });
    const linkIds = links.map((l: { id: string }) => l.id);
    if (!linkIds.length) {
      res.json({ summary: { clicks: 0, leads: 0, sales: 0, totalPayout: 0 }, byDay: [] });
      return;
    }

    const events = await prisma.event.findMany({
      where: {
        trackingLinkId: { in: linkIds },
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: { createdAt: true, eventType: true, amount: true, status: true },
    });

    const byDayMap: Record<string, { clicks: number; leads: number; sales: number; totalPayout: number }> = {};
    let summary = { clicks: 0, leads: 0, sales: 0, totalPayout: 0 };
    for (const e of events) {
      const d = (e.createdAt as Date).toISOString().slice(0, 10);
      if (!byDayMap[d]) byDayMap[d] = { clicks: 0, leads: 0, sales: 0, totalPayout: 0 };
      if (e.eventType === 'click') { byDayMap[d].clicks++; summary.clicks++; }
      if (e.eventType === 'lead') { byDayMap[d].leads++; summary.leads++; }
      if (e.eventType === 'sale') {
        byDayMap[d].sales++;
        summary.sales++;
        if (e.status === 'approved' && e.amount != null) {
          const amt = Number(e.amount);
          byDayMap[d].totalPayout += amt;
          summary.totalPayout += amt;
        }
      }
    }
    const byDay = Object.keys(byDayMap).sort().map((date) => ({ date, ...byDayMap[date] }));
    res.json({ summary, byDay });
  } catch (e) {
    console.error('GET /api/supplier/analytics:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** Список лидов/продаж по офферам поставщика (для модерации) */
router.get('/events', async (req: AuthRequest, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const offers = await prisma.offer.findMany({
      where: { supplierId: req.user!.userId },
      select: { id: true },
    });
    const offerIds = offers.map((o: { id: string }) => o.id);
    const links = await prisma.trackingLink.findMany({
      where: { offerId: { in: offerIds } },
      select: { id: true, offerId: true, token: true, affiliateId: true },
    });
    const linkIds = links.map((l: { id: string }) => l.id);
    const where: { trackingLinkId: { in: string[] }; status?: string } = { trackingLinkId: { in: linkIds } };
    if (status && ['pending', 'approved', 'rejected'].includes(status)) where.status = status as 'pending' | 'approved' | 'rejected';

    const events = await prisma.event.findMany({
      where: { ...where, eventType: { in: ['lead', 'sale'] } },
      include: {
        trackingLink: {
          select: {
            token: true,
            offer: { select: { id: true, title: true, payoutAmount: true } },
            affiliate: { select: { id: true, email: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      amount: e.amount != null ? Number(e.amount) : null,
      status: e.status,
      externalId: e.externalId,
      createdAt: e.createdAt,
      offerId: e.trackingLink.offer.id,
      offerTitle: e.trackingLink.offer.title,
      payoutAmount: e.trackingLink.offer.payoutAmount != null ? Number(e.trackingLink.offer.payoutAmount) : null,
      token: e.trackingLink.token,
      affiliate: e.trackingLink.affiliate,
    })));
  } catch (e) {
    console.error('GET /api/supplier/events:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** Одобрить или отклонить лид/продажу */
router.patch('/events/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const status = req.body?.status;
    if (!status || (status !== 'approved' && status !== 'rejected')) {
      res.status(400).json({ error: 'Укажите status: approved или rejected' });
      return;
    }
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        trackingLink: {
          include: { offer: true, affiliate: { select: { id: true, email: true } } },
        },
      },
    });
    if (!event || event.trackingLink.offer.supplierId !== req.user!.userId) {
      res.status(404).json({ error: 'Событие не найдено' });
      return;
    }
    if (event.eventType !== 'lead' && event.eventType !== 'sale') {
      res.status(400).json({ error: 'Можно модерировать только лиды и продажи' });
      return;
    }
    const updateData: { status: 'approved' | 'rejected'; amount?: number } = { status: status as 'approved' | 'rejected' };
    if (status === 'approved') {
      const newAmount = req.body.amount != null ? Number(req.body.amount) : (event.amount != null ? Number(event.amount) : Number(event.trackingLink.offer.payoutAmount));
      updateData.amount = newAmount;
    }
    const updated = await prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        trackingLink: {
          select: { token: true, offer: { select: { title: true } }, affiliate: { select: { email: true, name: true } } },
        },
      },
    });
    res.json(updated);
  } catch (e) {
    console.error('PATCH /api/supplier/events/:id:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
