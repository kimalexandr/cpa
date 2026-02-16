import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import { sendPayoutPaid, sendParticipationApproved, sendParticipationRejected } from '../lib/email';
import { createNotification } from '../lib/notifications';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);
router.use(requireRole('admin'));

/** Метрики для главной админки */
router.get('/dashboard', async (_req: AuthRequest, res: Response) => {
  try {
    const [usersByRole, offersCounts, participationsPending, payoutsPending, eventsCounts] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], where: { status: 'active' }, _count: { id: true } }),
      prisma.offer.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.affiliateOfferParticipation.count({ where: { status: 'pending' } }),
      prisma.payout.count({ where: { status: { in: ['pending', 'processing'] } } }),
      prisma.event.groupBy({ by: ['status'], _count: { id: true } }),
    ]);

    const affiliates = usersByRole.find((r) => r.role === 'affiliate')?._count?.id ?? 0;
    const suppliers = usersByRole.find((r) => r.role === 'supplier')?._count?.id ?? 0;
    const admins = usersByRole.find((r) => r.role === 'admin')?._count?.id ?? 0;
    const activeOffers = offersCounts.find((r) => r.status === 'active')?._count?.id ?? 0;
    const draftOffers = offersCounts.find((r) => r.status === 'draft')?._count?.id ?? 0;
    const leadsNew = eventsCounts.find((r) => r.status === 'pending')?._count?.id ?? 0;
    const leadsApproved = eventsCounts.find((r) => r.status === 'approved')?._count?.id ?? 0;
    const leadsRejected = eventsCounts.find((r) => r.status === 'rejected')?._count?.id ?? 0;

    const payoutsSum = await prisma.payout.aggregate({
      where: { status: 'paid' },
      _sum: { amount: true },
    });

    res.json({
      users: { affiliates, suppliers, admins },
      offers: { active: activeOffers, draft: draftOffers, total: offersCounts.reduce((a, c) => a + c._count.id, 0) },
      moderation: { participationsPending, offersOnModeration: 0 },
      leads: { new: leadsNew, approved: leadsApproved, rejected: leadsRejected },
      payouts: { pendingCount: payoutsPending, paidSum: Number(payoutsSum._sum.amount ?? 0) },
    });
  } catch (e) {
    console.error('Admin dashboard error:', e);
    res.status(500).json({ error: 'Ошибка загрузки метрик' });
  }
});

/** Список категорий (админ, все включая неактивные) */
router.get('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const where = activeOnly ? { isActive: true } : {};
    const categories = await prisma.category.findMany({
      where,
      include: { _count: { select: { offers: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      isActive: c.isActive,
      offersCount: c._count.offers,
    })));
  } catch (e) {
    console.error('Admin categories list error:', e);
    res.status(500).json({ error: 'Ошибка загрузки категорий' });
  }
});

/** Создать категорию */
router.post('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, description, isActive } = req.body;
    if (!name || !slug || typeof name !== 'string' || typeof slug !== 'string') {
      res.status(400).json({ error: 'Укажите название и slug' });
      return;
    }
    const slugNorm = slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    if (!slugNorm) {
      res.status(400).json({ error: 'Slug должен содержать латинские буквы, цифры или дефис' });
      return;
    }
    const existing = await prisma.category.findUnique({ where: { slug: slugNorm } });
    if (existing) {
      res.status(400).json({ error: 'Категория с таким slug уже есть' });
      return;
    }
    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        slug: slugNorm,
        description: description != null ? String(description).trim() || null : null,
        isActive: isActive !== false,
      },
    });
    res.status(201).json(category);
  } catch (e) {
    console.error('Admin create category error:', e);
    res.status(500).json({ error: 'Ошибка создания категории' });
  }
});

/** Обновить категорию */
router.patch('/categories/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const { name, slug, description, isActive } = req.body;
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      res.status(404).json({ error: 'Категория не найдена' });
      return;
    }
    const data: { name?: string; slug?: string; description?: string | null; isActive?: boolean } = {};
    if (name !== undefined) data.name = String(name).trim();
    if (slug !== undefined) {
      const slugNorm = String(slug).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
      if (slugNorm) {
        const existing = await prisma.category.findFirst({ where: { slug: slugNorm, id: { not: id } } });
        if (existing) {
          res.status(400).json({ error: 'Категория с таким slug уже есть' });
          return;
        }
        data.slug = slugNorm;
      }
    }
    if (description !== undefined) data.description = description === '' ? null : String(description).trim();
    if (typeof isActive === 'boolean') data.isActive = isActive;

    const updated = await prisma.category.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (e) {
    console.error('Admin update category error:', e);
    res.status(500).json({ error: 'Ошибка обновления категории' });
  }
});

/** Список пользователей */
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const role = req.query.role as string | undefined;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const where: Record<string, unknown> = {};
    if (role && ['affiliate', 'supplier', 'admin'].includes(role)) where.role = role;
    if (status && ['active', 'blocked', 'pending_email_confirmation'].includes(status)) where.status = status;
    if (search && search.trim()) {
      where.OR = [
        { email: { contains: search.trim(), mode: 'insensitive' } },
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { id: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.json(users);
  } catch (e) {
    console.error('Admin users list error:', e);
    res.status(500).json({ error: 'Ошибка загрузки пользователей' });
  }
});

/** Список офферов (админ) */
router.get('/offers', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const where: Record<string, unknown> = {};
    if (status && ['draft', 'active', 'paused', 'closed'].includes(status)) where.status = status;
    if (search && search.trim()) {
      where.title = { contains: search.trim(), mode: 'insensitive' };
    }

    const offers = await prisma.offer.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        supplier: { select: { id: true, email: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    res.json(offers);
  } catch (e) {
    console.error('Admin offers list error:', e);
    res.status(500).json({ error: 'Ошибка загрузки офферов' });
  }
});

/** Смена статуса оффера (админ): подтверждение черновика и др. */
router.patch('/offers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const status = req.body?.status as string | undefined;
    if (!status || !['draft', 'active', 'paused', 'closed'].includes(status)) {
      res.status(400).json({ error: 'Укажите статус: active, paused или closed' });
      return;
    }
    const offer = await prisma.offer.findUnique({ where: { id } });
    if (!offer) {
      res.status(404).json({ error: 'Оффер не найден' });
      return;
    }
    const updated = await prisma.offer.update({
      where: { id },
      data: { status: status as 'draft' | 'active' | 'paused' | 'closed' },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        supplier: { select: { id: true, email: true, name: true } },
      },
    });
    res.json(updated);
  } catch (e) {
    console.error('Admin PATCH offer status error:', e);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

/** Заявки на подключение (модерация) */
router.get('/moderation/participations', async (_req: AuthRequest, res: Response) => {
  try {
    const list = await prisma.affiliateOfferParticipation.findMany({
      where: { status: 'pending' },
      include: {
        offer: { select: { id: true, title: true }, include: { supplier: { select: { email: true, name: true } } } },
        affiliate: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(list);
  } catch (e) {
    console.error('Admin moderation participations error:', e);
    res.status(500).json({ error: 'Ошибка загрузки заявок' });
  }
});

/** Список заявок на выплаты */
router.get('/payouts', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const where: Record<string, unknown> = {};
    if (status && ['pending', 'processing', 'paid', 'canceled'].includes(status)) where.status = status;
    const list = await prisma.payout.findMany({
      where,
      include: { affiliate: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(list);
  } catch (e) {
    console.error('Admin payouts list error:', e);
    res.status(500).json({ error: 'Ошибка загрузки выплат' });
  }
});

/** Смена статуса выплаты (paid → отправить email) */
router.patch('/payouts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const status = req.body?.status as string | undefined;
    if (!status || !['pending', 'processing', 'paid', 'canceled'].includes(status)) {
      res.status(400).json({ error: 'Укажите status: pending, processing, paid или canceled' });
      return;
    }
    const payout = await prisma.payout.findUnique({
      where: { id },
      include: { affiliate: { select: { email: true, affiliateProfile: { select: { notifyPayouts: true } } } } },
    });
    if (!payout) {
      res.status(404).json({ error: 'Выплата не найдена' });
      return;
    }
    const data: { status: 'pending' | 'processing' | 'paid' | 'canceled'; paidAt?: Date } = { status: status as 'pending' | 'processing' | 'paid' | 'canceled' };
    if (status === 'paid') data.paidAt = new Date();
    const updated = await prisma.payout.update({
      where: { id },
      data,
      include: { affiliate: { select: { id: true, email: true, name: true } } },
    });
    const sendPayoutEmail = (payout.affiliate as { affiliateProfile?: { notifyPayouts: boolean | null } } | null)?.affiliateProfile?.notifyPayouts !== false;
    if (status === 'paid') {
      if (payout.affiliate?.email && sendPayoutEmail) {
        await sendPayoutPaid(payout.affiliate.email, Number(payout.amount), payout.currency);
      }
      await createNotification(prisma, {
        userId: payout.affiliateId,
        type: 'payout_paid',
        title: 'Выплата выполнена',
        body: `Сумма ${Number(payout.amount)} ${payout.currency} переведена.`,
        link: '/payments.html',
      });
    }
    res.json(updated);
  } catch (e) {
    console.error('Admin PATCH payout error:', e);
    res.status(500).json({ error: 'Ошибка обновления выплаты' });
  }
});

/** Список лидов/продаж (модерация) */
router.get('/events', async (req: AuthRequest, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const where: { eventType?: { in: string[] }; status?: string } = { eventType: { in: ['lead', 'sale'] } };
    if (status && ['pending', 'approved', 'rejected'].includes(status)) where.status = status as 'pending' | 'approved' | 'rejected';

    const events = await prisma.event.findMany({
      where,
      include: {
        trackingLink: {
          select: {
            token: true,
            offer: { select: { id: true, title: true, payoutAmount: true }, include: { supplier: { select: { email: true, name: true } } } },
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
      supplier: e.trackingLink.offer.supplier,
    })));
  } catch (e) {
    console.error('Admin GET events error:', e);
    res.status(500).json({ error: 'Ошибка загрузки событий' });
  }
});

/** Одобрить или отклонить лид/продажу (админ) */
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
      include: { trackingLink: { include: { offer: true } } },
    });
    if (!event || (event.eventType !== 'lead' && event.eventType !== 'sale')) {
      res.status(404).json({ error: 'Событие не найдено' });
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
    });
    res.json(updated);
  } catch (e) {
    console.error('Admin PATCH event error:', e);
    res.status(500).json({ error: 'Ошибка обновления события' });
  }
});

/** Одобрить/отклонить заявку аффилиата на оффер (админ) */
router.patch('/moderation/participations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const status = req.body?.status;
    if (!status || (status !== 'approved' && status !== 'rejected')) {
      res.status(400).json({ error: 'Укажите status: approved или rejected' });
      return;
    }
    const p = await prisma.affiliateOfferParticipation.findUnique({
      where: { id },
      include: { offer: true, affiliate: { select: { email: true, affiliateProfile: { select: { notifyParticipation: true } } } } },
    });
    if (!p) {
      res.status(404).json({ error: 'Заявка не найдена' });
      return;
    }
    const updated = await prisma.affiliateOfferParticipation.update({
      where: { id },
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
    const sendEmail = (p.affiliate as { affiliateProfile?: { notifyParticipation: boolean | null } } | null)?.affiliateProfile?.notifyParticipation !== false;
    if (p.affiliate?.email && sendEmail) {
      const baseApi = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
      const trackingUrl = baseApi.replace(/\/api\/?$/, '') + '/t/' + (status === 'approved' ? 'tk-' + p.affiliateId.slice(0, 8) + '-' + p.offerId.slice(0, 8) : '');
      if (status === 'approved') await sendParticipationApproved(p.affiliate.email, p.offer.title, trackingUrl);
      else await sendParticipationRejected(p.affiliate.email, p.offer.title);
    }
    await createNotification(prisma, {
      userId: p.affiliateId,
      type: status === 'approved' ? 'participation_approved' : 'participation_rejected',
      title: status === 'approved' ? 'Заявка на оффер одобрена' : 'Заявка на оффер отклонена',
      body: 'Оффер: ' + p.offer.title,
      link: status === 'approved' ? '/dashboard-affiliate-connections.html' : undefined,
    });
    res.json(updated);
  } catch (e) {
    console.error('Admin PATCH participation error:', e);
    res.status(500).json({ error: 'Ошибка обновления заявки' });
  }
});

export default router;
