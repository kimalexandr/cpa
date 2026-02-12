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

export default router;
