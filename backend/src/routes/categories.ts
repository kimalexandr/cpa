import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/** Плоский список категорий (для фильтров, выбора) */
router.get('/', async (req: Request, res: Response) => {
  try {
    const levelParam = req.query.level != null ? Number(req.query.level) : NaN;
    const activeOnly = req.query.active !== 'false';
    const where: { isActive?: boolean; level?: number } = {};
    if (activeOnly) where.isActive = true;
    if (Number.isInteger(levelParam) && levelParam >= 1) where.level = levelParam;

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    res.json(categories);
  } catch (e) {
    console.error('GET /api/categories:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** Дерево категорий (вложенный JSON для UI и фильтрации) */
router.get('/tree', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active !== 'false';
    const where: { isActive?: boolean } = activeOnly ? { isActive: true } : {};

    const all = await prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    const byId = new Map(all.map((c) => [c.id, { ...c, children: [] as typeof all }]));
    const roots: typeof all = [];
    for (const c of all) {
      const node = byId.get(c.id)!;
      if (!c.parentId) {
        roots.push(node);
      } else {
        const parent = byId.get(c.parentId);
        if (parent) (parent as { children: typeof all }).children.push(node);
        else roots.push(node);
      }
    }
    res.json(roots);
  } catch (e) {
    console.error('GET /api/categories/tree:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
