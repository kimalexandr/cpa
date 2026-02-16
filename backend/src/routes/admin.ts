import { Router, Response } from 'express';
import { PrismaClient, EventType, EventStatus } from '@prisma/client';
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

/** Список категорий (админ: все, фильтр по уровню/активности/поиск) */
router.get('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const levelParam = req.query.level != null ? Number(req.query.level) : NaN;
    const search = (req.query.search as string)?.trim();
    const where: { isActive?: boolean; level?: number; name?: { contains: string; mode: 'insensitive' } } = {};
    if (activeOnly) where.isActive = true;
    if (Number.isInteger(levelParam) && levelParam >= 1) where.level = levelParam;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const categories = await prisma.category.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { offerCategories: true, offersAsPrimary: true } },
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    res.json(categories.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      parent: c.parent,
      name: c.name,
      slug: c.slug,
      description: c.description,
      level: c.level,
      isActive: c.isActive,
      externalRef: c.externalRef,
      offersCount: (c._count.offerCategories || 0) + (c._count.offersAsPrimary || 0),
    })));
  } catch (e) {
    console.error('Admin categories list error:', e);
    res.status(500).json({ error: 'Ошибка загрузки категорий' });
  }
});

/** Дерево категорий (админ) */
router.get('/categories/tree', async (req: AuthRequest, res: Response) => {
  try {
    const activeOnly = req.query.active !== 'false';
    const all = await prisma.category.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { name: 'asc' },
    });
    const byId = new Map(all.map((c) => [c.id, { ...c, children: [] as typeof all }]));
    const roots: typeof all = [];
    for (const c of all) {
      const node = byId.get(c.id)!;
      if (!c.parentId) roots.push(node);
      else {
        const parent = byId.get(c.parentId);
        if (parent) (parent as { children: typeof all }).children.push(node);
        else roots.push(node);
      }
    }
    res.json(roots);
  } catch (e) {
    console.error('Admin categories tree error:', e);
    res.status(500).json({ error: 'Ошибка загрузки дерева' });
  }
});

/** Создать категорию */
router.post('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug: slugIn, description, isActive, parentId, level, externalRef } = req.body;
    if (!name || !slugIn || typeof name !== 'string' || typeof slugIn !== 'string') {
      res.status(400).json({ error: 'Укажите название и slug' });
      return;
    }
    const slugNorm = slugIn.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    if (!slugNorm) {
      res.status(400).json({ error: 'Slug должен содержать латинские буквы, цифры или дефис' });
      return;
    }
    const existing = await prisma.category.findUnique({ where: { slug: slugNorm } });
    if (existing) {
      res.status(400).json({ error: 'Категория с таким slug уже есть' });
      return;
    }
    const levelNum = level != null ? Number(level) : (parentId ? 2 : 1);
    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        slug: slugNorm,
        description: description != null ? String(description).trim() || null : null,
        isActive: isActive !== false,
        parentId: parentId || null,
        level: levelNum,
        externalRef: externalRef != null ? String(externalRef).trim() || null : null,
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
    const { name, slug: slugIn, description, isActive, parentId, level, externalRef } = req.body;
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      res.status(404).json({ error: 'Категория не найдена' });
      return;
    }
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (slugIn !== undefined) {
      const slugNorm = String(slugIn).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
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
    if (parentId !== undefined) data.parentId = parentId || null;
    if (level != null) data.level = Number(level);
    if (externalRef !== undefined) data.externalRef = externalRef === '' ? null : String(externalRef).trim();

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

/** Экспорт категорий (JSON) */
router.get('/categories/export', async (req: AuthRequest, res: Response) => {
  try {
    const list = await prisma.category.findMany({
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    res.setHeader('Content-Disposition', 'attachment; filename="categories.json"');
    res.json(list);
  } catch (e) {
    console.error('Admin categories export error:', e);
    res.status(500).json({ error: 'Ошибка экспорта' });
  }
});

/** Импорт категорий (JSON: массив { name, slug, parentId?, level?, description?, externalRef? }) */
router.post('/categories/import', async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body;
    const list = Array.isArray(body) ? body : (body.items && Array.isArray(body.items) ? body.items : []);
    let created = 0;
    for (const row of list) {
      const slugNorm = String(row.slug || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '') || null;
      if (!row.name || !slugNorm) continue;
      await prisma.category.upsert({
        where: { slug: slugNorm },
        update: {
          name: String(row.name).trim(),
          parentId: row.parentId || null,
          level: row.level != null ? Number(row.level) : 1,
          description: row.description != null ? String(row.description) : null,
          externalRef: row.externalRef != null ? String(row.externalRef) : null,
        },
        create: {
          name: String(row.name).trim(),
          slug: slugNorm,
          parentId: row.parentId || null,
          level: row.level != null ? Number(row.level) : 1,
          description: row.description != null ? String(row.description) : null,
          externalRef: row.externalRef != null ? String(row.externalRef) : null,
          isActive: true,
        },
      });
      created++;
    }
    res.json({ imported: created });
  } catch (e) {
    console.error('Admin categories import error:', e);
    res.status(500).json({ error: 'Ошибка импорта' });
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
    const where: { eventType: { in: EventType[] }; status?: EventStatus } = { eventType: { in: [EventType.lead, EventType.sale] } };
    if (status === 'pending' || status === 'approved' || status === 'rejected') where.status = status as EventStatus;

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
    res.json(events.map((e) => {
      const link = e.trackingLink;
      return {
        id: e.id,
        eventType: e.eventType,
        amount: e.amount != null ? Number(e.amount) : null,
        status: e.status,
        externalId: e.externalId,
        createdAt: e.createdAt,
        offerId: link.offer.id,
        offerTitle: link.offer.title,
        payoutAmount: link.offer.payoutAmount != null ? Number(link.offer.payoutAmount) : null,
        token: link.token,
        affiliate: link.affiliate,
        supplier: link.offer.supplier,
      };
    }));
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

/** ——— География (локации) ——— */
router.get('/locations', async (req: AuthRequest, res: Response) => {
  try {
    const levelParam = req.query.level != null ? Number(req.query.level) : NaN;
    const typeParam = req.query.type as string | undefined;
    const search = (req.query.search as string)?.trim();
    const where: { level?: number; type?: 'country' | 'federal_district' | 'region' | 'city'; isActive?: boolean; name?: { contains: string; mode: 'insensitive' } } = {};
    if (Number.isInteger(levelParam) && levelParam >= 1) where.level = levelParam;
    if (typeParam && ['country', 'federal_district', 'region', 'city'].includes(typeParam)) where.type = typeParam as 'country' | 'federal_district' | 'region' | 'city';
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const list = await prisma.location.findMany({
      where,
      include: { parent: { select: { id: true, name: true } }, _count: { select: { offerLocations: true } } },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    res.json(list.map((l) => ({ ...l, offersCount: l._count.offerLocations })));
  } catch (e) {
    console.error('Admin locations list error:', e);
    res.status(500).json({ error: 'Ошибка загрузки локаций' });
  }
});

router.get('/locations/tree', async (_req: AuthRequest, res: Response) => {
  try {
    const all = await prisma.location.findMany({ orderBy: [{ level: 'asc' }, { name: 'asc' }] });
    const byId = new Map(all.map((l) => [l.id, { ...l, children: [] as typeof all }]));
    const roots: typeof all = [];
    for (const l of all) {
      const node = byId.get(l.id)!;
      if (!l.parentId) roots.push(node);
      else {
        const parent = byId.get(l.parentId);
        if (parent) (parent as { children: typeof all }).children.push(node);
        else roots.push(node);
      }
    }
    res.json(roots);
  } catch (e) {
    console.error('Admin locations tree error:', e);
    res.status(500).json({ error: 'Ошибка загрузки дерева' });
  }
});

router.post('/locations', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, fullName, level, parentId, code, isActive } = req.body;
    if (!name || !type || !['country', 'federal_district', 'region', 'city'].includes(type)) {
      res.status(400).json({ error: 'Укажите название и тип (country, federal_district, region, city)' });
      return;
    }
    const levelNum = level != null ? Number(level) : (type === 'country' ? 1 : type === 'federal_district' ? 2 : type === 'region' ? 3 : 4);
    const loc = await prisma.location.create({
      data: {
        name: String(name).trim(),
        type: type as 'country' | 'federal_district' | 'region' | 'city',
        fullName: fullName != null ? String(fullName).trim() : null,
        level: levelNum,
        parentId: parentId || null,
        code: code != null ? String(code).trim() || null : null,
        isActive: isActive !== false,
      },
    });
    res.status(201).json(loc);
  } catch (e) {
    console.error('Admin POST location error:', e);
    res.status(500).json({ error: 'Ошибка создания локации' });
  }
});

router.patch('/locations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, fullName, level, parentId, code, isActive } = req.body;
    const data: { name?: string; type?: 'country' | 'federal_district' | 'region' | 'city'; fullName?: string | null; level?: number; parentId?: string | null; code?: string | null; isActive?: boolean } = {};
    if (name != null) data.name = String(name).trim();
    if (type != null && ['country', 'federal_district', 'region', 'city'].includes(type)) data.type = type;
    if (fullName !== undefined) data.fullName = fullName ? String(fullName).trim() : null;
    if (level != null) data.level = Number(level);
    if (parentId !== undefined) data.parentId = parentId || null;
    if (code !== undefined) data.code = code ? String(code).trim() || null : null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    const loc = await prisma.location.update({
      where: { id: req.params.id },
      data,
    });
    res.json(loc);
  } catch (e) {
    console.error('Admin PATCH location error:', e);
    res.status(500).json({ error: 'Ошибка обновления локации' });
  }
});

router.get('/locations/export', async (_req: AuthRequest, res: Response) => {
  try {
    const list = await prisma.location.findMany({
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    res.setHeader('Content-Disposition', 'attachment; filename="locations.json"');
    res.json(list);
  } catch (e) {
    console.error('Admin locations export error:', e);
    res.status(500).json({ error: 'Ошибка экспорта' });
  }
});

/** Импорт локаций: JSON массив { id?, parentId, name, type, fullName?, level, code?, isActive? }. По id или (parentId+name+type) обновление. */
router.post('/locations/import', async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body;
    const list = Array.isArray(body) ? body : (body.items && Array.isArray(body.items) ? body.items : []);
    let created = 0;
    let updated = 0;
    for (const row of list) {
      const name = String(row.name || '').trim();
      const type = ['country', 'federal_district', 'region', 'city'].includes(row.type) ? row.type : null;
      if (!name || !type) continue;
      const parentId = row.parentId || null;
      const level = row.level != null ? Number(row.level) : (type === 'country' ? 1 : type === 'federal_district' ? 2 : type === 'region' ? 3 : 4);
      const fullName = row.fullName != null ? String(row.fullName).trim() : null;
      const code = row.code != null ? String(row.code).trim() || null : null;
      const isActive = row.isActive !== false;
      const existing = row.id ? await prisma.location.findUnique({ where: { id: row.id } }) : await prisma.location.findFirst({ where: { parentId, name, type } });
      if (existing) {
        await prisma.location.update({
          where: { id: existing.id },
          data: { name, type, fullName, level, parentId, code, isActive },
        });
        updated++;
      } else {
        await prisma.location.create({
          data: { name, type, fullName, level, parentId, code, isActive },
        });
        created++;
      }
    }
    res.json({ imported: created + updated, created, updated });
  } catch (e) {
    console.error('Admin locations import error:', e);
    res.status(500).json({ error: 'Ошибка импорта' });
  }
});

/** Сохранить локации оффера (админ — любой оффер) */
router.post('/offers/:id/locations', async (req: AuthRequest, res: Response) => {
  try {
    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!offer) {
      res.status(404).json({ error: 'Оффер не найден' });
      return;
    }
    const locationIds = Array.isArray(req.body.locationIds) ? req.body.locationIds.map((id: unknown) => String(id)) : [];
    const valid = await prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true } });
    const ids = valid.map((l) => l.id);
    await prisma.offerLocation.deleteMany({ where: { offerId: req.params.id } });
    if (ids.length > 0) {
      await prisma.offerLocation.createMany({ data: ids.map((locationId) => ({ offerId: req.params.id, locationId })) });
    }
    const rows = await prisma.offerLocation.findMany({
      where: { offerId: req.params.id },
      include: { location: true },
    });
    res.json(rows.map((r) => r.location));
  } catch (e) {
    console.error('Admin POST offers/:id/locations error:', e);
    res.status(500).json({ error: 'Ошибка сохранения локаций' });
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
