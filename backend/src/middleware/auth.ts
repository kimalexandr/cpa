import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'realcpa-dev-secret-change-in-production';
const prisma = new PrismaClient();

export type UserRole = 'affiliate' | 'supplier' | 'admin';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  sid?: string;
  authType?: 'jwt' | 'api_key';
  scopes?: string[];
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

export function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export interface PasswordResetPayload {
  userId: string;
  purpose: 'password_reset';
  iat?: number;
  exp?: number;
}

export function signPasswordResetToken(userId: string): string {
  return jwt.sign(
    { userId, purpose: 'password_reset' } as PasswordResetPayload,
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

export function verifyPasswordResetToken(token: string): PasswordResetPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as PasswordResetPayload;
    return payload.purpose === 'password_reset' && payload.userId ? payload : null;
  } catch {
    return null;
  }
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  const payload = verifyToken(token);
  if (payload) {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { status: true },
    });
    if (!user || user.status !== 'active') {
      res.status(401).json({ error: 'Недействительный или истёкший токен' });
      return;
    }
    if (payload.sid) {
      const session = await prisma.userSession.findUnique({
        where: { id: payload.sid },
        select: { userId: true, revokedAt: true, expiresAt: true },
      });
      if (!session || session.userId !== payload.userId || session.revokedAt || session.expiresAt < new Date()) {
        res.status(401).json({ error: 'Сессия недействительна. Войдите снова.' });
        return;
      }
    }
    req.user = { ...payload, authType: 'jwt' };
    next();
    return;
  }
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: { select: { id: true, email: true, role: true, status: true } } },
  });
  if (!apiKey || !apiKey.user || apiKey.user.status !== 'active' || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
    res.status(401).json({ error: 'Недействительный или истёкший токен' });
    return;
  }
  req.user = {
    userId: apiKey.user.id,
    email: apiKey.user.email,
    role: apiKey.user.role,
    authType: 'api_key',
    scopes: apiKey.scopes || [],
  };
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    next();
  };
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const payload = verifyToken(token);
    if (payload) req.user = payload;
  }
  next();
}

export function requireScope(...scopes: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }
    if (req.user.authType !== 'api_key') {
      next();
      return;
    }
    const userScopes = req.user.scopes || [];
    const ok = scopes.some((s) => userScopes.includes(s) || userScopes.includes('*'));
    if (!ok) {
      res.status(403).json({ error: 'Недостаточно scope прав для API key' });
      return;
    }
    next();
  };
}
