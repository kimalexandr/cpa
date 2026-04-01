import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthRequest, requireAuth } from '../middleware/auth';
import * as crypto from 'crypto';
import speakeasy from 'speakeasy';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

router.get('/sessions', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const rows = await prisma.userSession.findMany({
      where: {
        userId: req.user!.userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
    res.json({
      items: rows,
      currentSessionId: req.user?.sid || null,
    });
  } catch (e) {
    console.error('GET /api/me/sessions:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/sessions/revoke-all', async (req: AuthRequest, res: Response) => {
  try {
    const includeCurrent = Boolean(req.body?.includeCurrent);
    const where: Record<string, unknown> = {
      userId: req.user!.userId,
      revokedAt: null,
    };
    if (!includeCurrent && req.user?.sid) {
      where.id = { not: req.user.sid };
    }
    const result = await prisma.userSession.updateMany({
      where,
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true, revoked: result.count });
  } catch (e) {
    console.error('POST /api/me/sessions/revoke-all:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/sessions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.userSession.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      select: { id: true, revokedAt: true },
    });
    if (!session) {
      res.status(404).json({ error: 'Сессия не найдена' });
      return;
    }
    if (session.revokedAt) {
      res.json({ ok: true });
      return;
    }
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true, revoked: session.id });
  } catch (e) {
    console.error('DELETE /api/me/sessions/:id:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

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

router.post('/2fa/setup', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: '2FA доступно только для админа' });
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const secret = speakeasy.generateSecret({ name: 'RealCPA Admin (' + user.email + ')' });
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { twoFactorSecret: secret.base32, twoFactorEnabled: false },
    });
    res.json({ secret: secret.base32, otpauthUrl: secret.otpauth_url });
  } catch (e) {
    console.error('POST /api/me/2fa/setup:', e);
    res.status(500).json({ error: 'Ошибка настройки 2FA' });
  }
});

router.post('/2fa/enable', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: '2FA доступно только для админа' });
    const otp = String(req.body?.otp || '').trim();
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { twoFactorSecret: true },
    });
    if (!user || !user.twoFactorSecret) return res.status(400).json({ error: 'Сначала выполните setup 2FA' });
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: otp,
      window: 1,
    });
    if (!verified) return res.status(400).json({ error: 'Неверный OTP код' });
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { twoFactorEnabled: true },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/me/2fa/enable:', e);
    res.status(500).json({ error: 'Ошибка включения 2FA' });
  }
});

router.post('/2fa/disable', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: '2FA доступно только для админа' });
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/me/2fa/disable:', e);
    res.status(500).json({ error: 'Ошибка отключения 2FA' });
  }
});

router.post('/api-key', async (req: AuthRequest, res: Response) => {
  try {
    const daysRaw = Number(req.body?.days);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 90;
    const name = String(req.body?.name || 'Default key');
    const scopesRaw = Array.isArray(req.body?.scopes) ? req.body.scopes : [];
    const scopes = scopesRaw.map((s: unknown) => String(s)).filter(Boolean);
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const rawKey = 'rk_' + crypto.randomBytes(24).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const row = await prisma.apiKey.create({
      data: {
        userId: user.id,
        name,
        keyHash,
        scopes: scopes.length ? scopes : ['*'],
        expiresAt,
      },
      select: { id: true, name: true, scopes: true, expiresAt: true, createdAt: true },
    });
    res.json({
      token: rawKey,
      key: row,
      expiresInDays: days,
      note: 'Ключ показывается один раз. Сохраните его.',
    });
  } catch (e) {
    console.error('POST /api/me/api-key:', e);
    res.status(500).json({ error: 'Ошибка генерации API ключа' });
  }
});

router.get('/api-keys', async (req: AuthRequest, res: Response) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, scopes: true, createdAt: true, expiresAt: true, revokedAt: true, lastUsedAt: true },
    });
    res.json({ items: keys });
  } catch (e) {
    console.error('GET /api/me/api-keys:', e);
    res.status(500).json({ error: 'Ошибка списка API ключей' });
  }
});

router.patch('/api-keys/:id/revoke', async (req: AuthRequest, res: Response) => {
  try {
    const row = await prisma.apiKey.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      select: { id: true },
    });
    if (!row) return res.status(404).json({ error: 'Ключ не найден' });
    await prisma.apiKey.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/me/api-keys/:id/revoke:', e);
    res.status(500).json({ error: 'Ошибка revoke API ключа' });
  }
});

router.post('/kyc', async (req: AuthRequest, res: Response) => {
  try {
    const documentType = String(req.body?.documentType || '').trim();
    const documentUrl = String(req.body?.documentUrl || '').trim();
    if (!documentType || !documentUrl) return res.status(400).json({ error: 'Укажите documentType и documentUrl' });
    const row = await prisma.kycRequest.create({
      data: {
        userId: req.user!.userId,
        documentType,
        documentUrl,
        status: 'pending',
      },
    });
    res.status(201).json(row);
  } catch (e) {
    console.error('POST /api/me/kyc:', e);
    res.status(500).json({ error: 'Ошибка создания KYC заявки' });
  }
});

router.post('/webhook/test', async (req: AuthRequest, res: Response) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\/[\w.-]/i.test(url)) return res.status(400).json({ error: 'Укажите корректный URL webhook' });
    const payload = {
      event: String(req.body?.event || 'test'),
      sentAt: new Date().toISOString(),
      userId: req.user!.userId,
      role: req.user!.role,
      payload: req.body?.payload || { ok: true },
    };
    const result = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await result.text();
    res.json({ ok: result.ok, status: result.status, response: text.slice(0, 1000) });
  } catch (e) {
    console.error('POST /api/me/webhook/test:', e);
    res.status(500).json({ error: 'Ошибка теста webhook' });
  }
});

router.get('/api-docs', (_req: AuthRequest, res: Response) => {
  res.json({
    title: 'RealCPA API docs',
    auth: 'Bearer <token>',
    endpoints: [
      { method: 'GET', path: '/api/affiliate/events', desc: 'События аффилиата, фильтры status/externalId' },
      { method: 'GET', path: '/api/affiliate/analytics', desc: 'Аналитика аффилиата по дням' },
      { method: 'GET', path: '/api/affiliate/analytics-sources', desc: 'Аналитика по источникам (token)' },
      { method: 'GET', path: '/api/supplier/events', desc: 'События поставщика (лиды/продажи)' },
      { method: 'GET', path: '/api/supplier/analytics', desc: 'Аналитика поставщика по дням' },
      { method: 'GET', path: '/api/supplier/analytics-sources', desc: 'Аналитика поставщика по источникам (token)' },
      { method: 'POST', path: '/api/events', desc: 'Приём postback событий (token/external_id)' },
      { method: 'GET', path: '/api/admin/payouts/registry', desc: 'Реестр выплат (админ)' },
      { method: 'GET', path: '/api/admin/payouts/export.csv', desc: 'Экспорт выплат CSV (админ)' },
      { method: 'POST', path: '/api/me/api-key', desc: 'Личный long-lived API ключ' },
      { method: 'GET', path: '/api/me/api-keys', desc: 'Список API ключей' },
      { method: 'PATCH', path: '/api/me/api-keys/:id/revoke', desc: 'Отзыв API ключа' },
      { method: 'GET', path: '/api/v1/affiliate/events', desc: 'Версионированный API v1 (через API key)' },
      { method: 'POST', path: '/api/me/webhook/test', desc: 'Тест webhook URL' },
    ],
  });
});

export default router;
