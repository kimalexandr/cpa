import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        companyName: true,
        phone: true,
        country: true,
        city: true,
        status: true,
        createdAt: true,
        affiliateProfile: true,
        supplierProfile: true,
      },
    });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    res.json(user);
  } catch (e) {
    console.error('GET /api/me:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, companyName, phone, country, city } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(name !== undefined && { name }),
        ...(companyName !== undefined && { companyName }),
        ...(phone !== undefined && { phone }),
        ...(country !== undefined && { country }),
        ...(city !== undefined && { city }),
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        companyName: true,
        phone: true,
        country: true,
        city: true,
      },
    });
    res.json(user);
  } catch (e) {
    console.error('PATCH /api/me:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/affiliate-profile', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'affiliate') {
      res.status(403).json({ error: 'Доступ только для партнёра' });
      return;
    }
    const profile = await prisma.affiliateProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    if (!profile) {
      res.status(404).json({ error: 'Профиль не найден' });
      return;
    }
    res.json(profile);
  } catch (e) {
    console.error('GET /api/me/affiliate-profile:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/affiliate-profile', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'affiliate') {
      res.status(403).json({ error: 'Доступ только для партнёра' });
      return;
    }
    const { payoutDetails, trafficSources, notes } = req.body;
    const profile = await prisma.affiliateProfile.upsert({
      where: { userId: req.user!.userId },
      update: {
        ...(payoutDetails !== undefined && { payoutDetails }),
        ...(trafficSources !== undefined && { trafficSources }),
        ...(notes !== undefined && { notes }),
      },
      create: {
        userId: req.user!.userId,
        payoutDetails: payoutDetails || null,
        trafficSources: trafficSources || null,
        notes: notes || null,
      },
    });
    res.json(profile);
  } catch (e) {
    console.error('PATCH /api/me/affiliate-profile:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/supplier-profile', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'supplier') {
      res.status(403).json({ error: 'Доступ только для поставщика' });
      return;
    }
    const profile = await prisma.supplierProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    if (!profile) {
      res.status(404).json({ error: 'Профиль не найден' });
      return;
    }
    res.json(profile);
  } catch (e) {
    console.error('GET /api/me/supplier-profile:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/supplier-profile', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'supplier') {
      res.status(403).json({ error: 'Доступ только для поставщика' });
      return;
    }
    const { legalEntity, inn, kpp, vatId, website, payoutTerms } = req.body;
    const profile = await prisma.supplierProfile.upsert({
      where: { userId: req.user!.userId },
      update: {
        ...(legalEntity !== undefined && { legalEntity }),
        ...(inn !== undefined && { inn }),
        ...(kpp !== undefined && { kpp }),
        ...(vatId !== undefined && { vatId }),
        ...(website !== undefined && { website }),
        ...(payoutTerms !== undefined && { payoutTerms }),
      },
      create: {
        userId: req.user!.userId,
        legalEntity: legalEntity || '—',
        inn: inn || null,
        kpp: kpp || null,
        vatId: vatId || null,
        website: website || null,
        payoutTerms: payoutTerms || null,
      },
    });
    res.json(profile);
  } catch (e) {
    console.error('PATCH /api/me/supplier-profile:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
