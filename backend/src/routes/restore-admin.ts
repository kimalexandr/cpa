/**
 * Одноразовый эндпоинт для восстановления учётной записи администратора в БД сервера.
 * Защищён секретом из env RESTORE_ADMIN_SECRET.
 */
import { Router, Request, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const router = Router();
const prisma = new PrismaClient();
const SECRET = process.env.RESTORE_ADMIN_SECRET;

router.post('/', async (_req: Request, res: Response) => {
  if (!SECRET) {
    res.status(501).json({ error: 'RESTORE_ADMIN_SECRET не задан на сервере' });
    return;
  }
  const provided = _req.headers['x-restore-secret'] ?? _req.body?.secret;
  if (provided !== SECRET) {
    res.status(403).json({ error: 'Неверный секрет' });
    return;
  }
  try {
    const adminPasswordHash = await bcrypt.hash('kAlkiujn7', 10);
    const adminUser = await prisma.user.upsert({
      where: { email: 'ya@ya.ru' },
      update: { passwordHash: adminPasswordHash, role: UserRole.admin, status: 'active' },
      create: {
        email: 'ya@ya.ru',
        passwordHash: adminPasswordHash,
        role: UserRole.admin,
        name: 'Администратор',
        status: 'active',
      },
    });
    res.json({ ok: true, email: adminUser.email });
  } catch (e) {
    console.error('restore-admin:', e);
    res.status(500).json({ error: 'Ошибка при восстановлении админа' });
  }
});

export default router;
