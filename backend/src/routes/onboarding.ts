import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

router.get('/progress', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }
    if (req.user.role === 'affiliate') {
      const participations = await prisma.affiliateOfferParticipation.findMany({
        where: { affiliateId: req.user.userId },
        select: { status: true, offerId: true },
      });
      const approvedOfferIds = participations.filter((p) => p.status === 'approved').map((p) => p.offerId);
      const links = await prisma.trackingLink.findMany({
        where: { affiliateId: req.user.userId, offerId: { in: approvedOfferIds } },
        select: { id: true },
      });
      const linkIds = links.map((l) => l.id);
      const [clicks, leads] = await Promise.all([
        prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'click' } }),
        prisma.event.count({ where: { trackingLinkId: { in: linkIds }, eventType: 'lead' } }),
      ]);
      const steps = [
        {
          id: 'connect_offer',
          title: 'Подключитесь к офферу',
          done: approvedOfferIds.length > 0,
          actionLink: '/offers.html',
        },
        {
          id: 'first_click',
          title: 'Сделайте первый клик',
          done: clicks > 0,
          actionLink: '/dashboard-affiliate-connections.html',
        },
        {
          id: 'test_lead',
          title: 'Отправьте тестовый лид',
          done: leads > 0,
          actionLink: '/dashboard-affiliate-connections.html',
        },
      ];
      res.json({
        role: 'affiliate',
        done: steps.filter((s) => s.done).length,
        total: steps.length,
        steps,
      });
      return;
    }

    if (req.user.role === 'supplier') {
      const [offersCount, activeOffers, pendingRequests] = await Promise.all([
        prisma.offer.count({ where: { supplierId: req.user.userId } }),
        prisma.offer.count({ where: { supplierId: req.user.userId, status: 'active' } }),
        prisma.affiliateOfferParticipation.count({
          where: { offer: { supplierId: req.user.userId } },
        }),
      ]);
      const steps = [
        {
          id: 'create_offer',
          title: 'Создайте оффер',
          done: offersCount > 0,
          actionLink: '/create-offer.html',
        },
        {
          id: 'activate_offer',
          title: 'Активируйте оффер',
          done: activeOffers > 0,
          actionLink: '/dashboard-supplier-offers.html',
        },
        {
          id: 'review_requests',
          title: 'Просмотрите заявки',
          done: pendingRequests > 0,
          actionLink: '/dashboard-supplier-requests.html',
        },
      ];
      res.json({
        role: 'supplier',
        done: steps.filter((s) => s.done).length,
        total: steps.length,
        steps,
      });
      return;
    }

    res.json({ role: req.user.role, done: 0, total: 0, steps: [] });
  } catch (e) {
    console.error('GET /api/onboarding/progress:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
