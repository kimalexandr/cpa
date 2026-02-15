import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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

router.patch('/password', async (req: AuthRequest, res: Response) => {
  try {
    const currentPassword = req.body.currentPassword;
    const newPassword = req.body.newPassword;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Укажите текущий и новый пароль' });
      return;
    }
    if (String(newPassword).length < 6) {
      res.status(400).json({ error: 'Новый пароль должен быть не короче 6 символов' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { passwordHash: true },
    });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    const valid = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: 'Неверный текущий пароль' });
      return;
    }
    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { passwordHash },
    });
    res.json({ message: 'Пароль успешно изменён' });
  } catch (e) {
    console.error('PATCH /api/me/password:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';
    const where = { userId: req.user!.userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user!.userId, readAt: null } }),
    ]);
    res.json({ items, total, unreadCount });
  } catch (e) {
    console.error('GET /api/me/notifications:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/notifications/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ message: 'Все уведомления отмечены прочитанными' });
  } catch (e) {
    console.error('PATCH /api/me/notifications/read-all:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/notifications/:id', async (req: AuthRequest, res: Response) => {
  try {
    const n = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!n) {
      res.status(404).json({ error: 'Уведомление не найдено' });
      return;
    }
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { readAt: n.readAt ? undefined : new Date() },
    });
    res.json(updated);
  } catch (e) {
    console.error('PATCH /api/me/notifications/:id:', e);
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
    const { payoutDetails, trafficSources, notes, notifyNews, notifySystem, notifyParticipation, notifyPayouts } = req.body;
    const updateData: Record<string, unknown> = {};
    if (payoutDetails !== undefined) updateData.payoutDetails = payoutDetails || null;
    if (trafficSources !== undefined) updateData.trafficSources = trafficSources || null;
    if (notes !== undefined) updateData.notes = notes || null;
    if (notifyNews !== undefined) updateData.notifyNews = Boolean(notifyNews);
    if (notifySystem !== undefined) updateData.notifySystem = Boolean(notifySystem);
    if (notifyParticipation !== undefined) updateData.notifyParticipation = Boolean(notifyParticipation);
    if (notifyPayouts !== undefined) updateData.notifyPayouts = Boolean(notifyPayouts);
    const profile = await prisma.affiliateProfile.upsert({
      where: { userId: req.user!.userId },
      update: updateData,
      create: {
        userId: req.user!.userId,
        payoutDetails: payoutDetails || null,
        trafficSources: trafficSources || null,
        notes: notes || null,
        notifyNews: notifyNews !== undefined ? Boolean(notifyNews) : null,
        notifySystem: notifySystem !== undefined ? Boolean(notifySystem) : null,
        notifyParticipation: notifyParticipation !== undefined ? Boolean(notifyParticipation) : null,
        notifyPayouts: notifyPayouts !== undefined ? Boolean(notifyPayouts) : null,
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
