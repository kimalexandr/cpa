import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: 'Продукты питания', slug: 'products', description: 'Офферы по оптовым поставкам FMCG и HoReCa' },
  { name: 'Стройматериалы', slug: 'construction', description: 'CPA‑кампании для рынка строительства и ремонта' },
  { name: 'Автозапчасти', slug: 'auto', description: 'Запчасти, шины, автохимия' },
  { name: 'Электроника и техника', slug: 'electronics', description: 'Бытовая и цифровая техника, гаджеты' },
  { name: 'Одежда и обувь', slug: 'clothing', description: 'Опт и дропшиппинг одежды и обуви' },
  { name: 'Другое', slug: 'other', description: 'Прочие офферы' },
];

router.get('/', async (_req: Request, res: Response) => {
  try {
    let categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    if (categories.length === 0) {
      for (const c of DEFAULT_CATEGORIES) {
        await prisma.category.upsert({
          where: { slug: c.slug },
          update: {},
          create: { name: c.name, slug: c.slug, description: c.description, isActive: true },
        });
      }
      categories = await prisma.category.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    }
    res.json(categories);
  } catch (e) {
    console.error('GET /api/categories:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
