import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { signAccessToken, signRefreshToken, verifyToken } from '../middleware/auth';

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

export default router;
