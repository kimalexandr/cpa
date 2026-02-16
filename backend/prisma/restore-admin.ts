/**
 * Восстановление учётной записи администратора.
 * Запуск из папки backend: npm run restore-admin
 * Требуется .env с DATABASE_URL (или полный сид: npm run db:seed).
 */
import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
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
  console.log('Администратор восстановлен:', adminUser.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
