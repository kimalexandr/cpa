import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { signAccessToken, signRefreshToken, signPasswordResetToken, verifyPasswordResetToken, verifyToken } from '../middleware/auth';
import { buildResetLink, sendResetPassword, sendWelcome } from '../lib/email';

const router = Router();
const prisma = new PrismaClient();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, role, name, companyName, trafficSources, legalEntity, inn } = req.body;
    if (!email || !password || !role) {
      res.status(400).json({ error: 'Укажите email, пароль и роль (affiliate или supplier)' });
      return;
    }
    if (role !== 'affiliate' && role !== 'supplier') {
      res.status(400).json({ error: 'Роль должна быть affiliate или supplier' });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (existing) {
      res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован' });
      return;
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: {
        email: String(email).toLowerCase(),
        passwordHash,
        role: role as 'affiliate' | 'supplier',
        name: name || null,
        companyName: companyName || null,
        status: 'active',
      },
    });
    if (role === 'affiliate') {
      await prisma.affiliateProfile.create({
        data: { userId: user.id, trafficSources: trafficSources || null },
      });
    } else {
      await prisma.supplierProfile.create({
        data: {
          userId: user.id,
          legalEntity: legalEntity || user.companyName || '—',
          inn: inn || null,
        },
      });
    }
    sendWelcome(user.email, user.name || undefined).catch(() => {});
    const payload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name, companyName: user.companyName },
      accessToken,
      refreshToken,
      expiresIn: 3600,
    });
  } catch (e) {
    console.error('Register error:', e);
    const message = e instanceof Error ? e.message : 'Ошибка регистрации';
    res.status(500).json({ error: 'Ошибка регистрации', detail: message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Укажите email и пароль' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase() },
    });
    if (!user || user.status !== 'active') {
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }
    const payload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    res.json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name, companyName: user.companyName },
      accessToken,
      refreshToken,
      expiresIn: 3600,
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

router.post('/refresh', (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken) {
    res.status(401).json({ error: 'Нет refresh-токена' });
    return;
  }
  const payload = verifyToken(refreshToken);
  if (!payload) {
    res.status(401).json({ error: 'Недействительный refresh-токен' });
    return;
  }
  const accessToken = signAccessToken({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
  });
  res.json({ accessToken, expiresIn: 3600 });
});

// Запрос на восстановление пароля: отправка ссылки на email (в проде — письмо, в dev — можно вернуть ссылку)
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const email = (req.body.email && String(req.body.email).trim().toLowerCase()) || '';
    if (!email) {
      res.status(400).json({ error: 'Укажите email' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) {
      res.json({ message: 'Если аккаунт с таким email существует, на него отправлена ссылка для сброса пароля.' });
      return;
    }
    const token = signPasswordResetToken(user.id);
    const resetUrl = buildResetLink(token);
    if (process.env.NODE_ENV !== 'production') console.log('[forgot-password] Reset link for', user.email, ':', resetUrl);
    await sendResetPassword(user.email, resetUrl);
    res.json({
      message: 'Если аккаунт с таким email существует, на него отправлена ссылка для сброса пароля. Проверьте почту.',
      resetLink: process.env.NODE_ENV !== 'production' ? resetUrl : undefined,
    });
  } catch (e) {
    console.error('Forgot password error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Установка нового пароля по токену из ссылки
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const token = req.body.token && String(req.body.token).trim();
    const newPassword = req.body.newPassword || req.body.password;
    if (!token) {
      res.status(400).json({ error: 'Не указан токен сброса. Перейдите по ссылке из письма.' });
      return;
    }
    if (!newPassword || String(newPassword).length < 6) {
      res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
      return;
    }
    const payload = verifyPasswordResetToken(token);
    if (!payload) {
      res.status(400).json({ error: 'Ссылка недействительна или истекла. Запросите сброс пароля снова.' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true },
    });
    if (!user) {
      res.status(400).json({ error: 'Пользователь не найден.' });
      return;
    }
    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    res.json({ message: 'Пароль успешно изменён. Войдите с новым паролем.' });
  } catch (e) {
    console.error('Reset password error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
