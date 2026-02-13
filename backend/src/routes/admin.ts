import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';

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

export default router;
