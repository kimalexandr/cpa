import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';

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
  const b = req.body;
  if (!b.categoryId || !b.title || !b.landingUrl) {
    res.status(400).json({ error: 'Укажите категорию, название и ссылку на лендинг' });
    return;
  }
  const offer = await prisma.offer.create({
    data: {
      supplierId: req.user!.userId,
      categoryId: b.categoryId,
      title: b.title,
      description: b.description || '',
      targetGeo: b.targetGeo || null,
      payoutModel: b.payoutModel || 'CPA',
      payoutAmount: Number(b.payoutAmount) || 0,
      currency: b.currency || 'RUB',
      landingUrl: b.landingUrl,
      status: 'draft',
    },
    include: { category: { select: { id: true, name: true, slug: true } } },
  });
  res.status(201).json(offer);
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
    include: { offer: true },
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

export default router;
