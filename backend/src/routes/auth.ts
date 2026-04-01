import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { signAccessToken, signRefreshToken, signPasswordResetToken, verifyPasswordResetToken, verifyToken } from '../middleware/auth';
import { buildEmailConfirmLink, buildResetLink, sendEmailConfirmation, sendResetPassword, sendWelcome } from '../lib/email';
import * as crypto from 'crypto';
import speakeasy from 'speakeasy';

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
        status: 'pending_email_confirmation',
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
    // Email confirmation token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 часа
    await prisma.emailConfirmationToken.create({
      data: { userId: user.id, token, expiresAt },
    });
    const confirmLink = buildEmailConfirmLink(token);
    sendEmailConfirmation(user.email, confirmLink).catch(() => {});
    // Дополнительно отправляем welcome-письмо (без автологина)
    sendWelcome(user.email, user.name || undefined).catch(() => {});
    res.status(201).json({
      message: 'Регистрация успешно завершена. Проверьте почту и подтвердите email по ссылке из письма.',
      emailConfirmationSent: true,
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
    if (!user) {
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }
    if (user.status === 'pending_email_confirmation') {
      res.status(403).json({ error: 'Email ещё не подтверждён. Проверьте почту и перейдите по ссылке из письма.' });
      return;
    }
    if (user.status !== 'active') {
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }
    if (user.role === 'admin' && user.twoFactorEnabled) {
      const otp = req.body.otp ? String(req.body.otp).trim() : '';
      if (!otp || !user.twoFactorSecret) {
        res.status(401).json({ error: 'Требуется 2FA код' });
        return;
      }
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: otp,
        window: 1,
      });
      if (!verified) {
        res.status(401).json({ error: 'Неверный 2FA код' });
        return;
      }
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

// Подтверждение email по токену (из письма)
router.post('/confirm-email', async (req: Request, res: Response) => {
  try {
    const token = req.body.token && String(req.body.token).trim();
    if (!token) {
      res.status(400).json({ error: 'Не указан токен подтверждения.' });
      return;
    }
    const now = new Date();
    const record = await prisma.emailConfirmationToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < now) {
      res.status(400).json({ error: 'Ссылка недействительна или истекла.' });
      return;
    }
    const user = record.user;
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { status: 'active' },
      }),
      prisma.emailConfirmationToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      }),
    ]);
    res.json({ message: 'Email успешно подтверждён. Теперь вы можете войти.' });
  } catch (e) {
    console.error('Confirm email error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Повторная отправка письма подтверждения
router.post('/resend-confirmation', async (req: Request, res: Response) => {
  try {
    const email = (req.body.email && String(req.body.email).trim().toLowerCase()) || '';
    if (!email) {
      res.status(400).json({ error: 'Укажите email' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      res.json({ message: 'Если аккаунт с таким email существует, на него отправлена ссылка для подтверждения.' });
      return;
    }
    if (user.status === 'active') {
      res.json({ message: 'Email уже подтверждён.' });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    await prisma.emailConfirmationToken.create({
      data: { userId: user.id, token, expiresAt },
    });
    const confirmLink = buildEmailConfirmLink(token);
    await sendEmailConfirmation(user.email, confirmLink);
    res.json({ message: 'Ссылка для подтверждения email отправлена. Проверьте почту.' });
  } catch (e) {
    console.error('Resend confirmation error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
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
