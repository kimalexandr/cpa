import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

export interface LocationTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  fullName: string | null;
  level: number;
  isActive: boolean;
  code: string | null;
  children: LocationTreeNode[];
}

/** Дерево локаций: страна → округа → регионы → города (только is_active) */
router.get('/tree', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active !== 'false';
    const where = activeOnly ? { isActive: true } : {};

    const all = await prisma.location.findMany({
      where,
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    const byId = new Map<string, LocationTreeNode>();
    for (const loc of all) {
      byId.set(loc.id, {
        id: loc.id,
        parentId: loc.parentId,
        name: loc.name,
        type: loc.type,
        fullName: loc.fullName,
        level: loc.level,
        isActive: loc.isActive,
        code: loc.code,
        children: [],
      });
    }
    const roots: LocationTreeNode[] = [];
    for (const loc of all) {
      const node = byId.get(loc.id)!;
      if (!loc.parentId) {
        roots.push(node);
      } else {
        const parent = byId.get(loc.parentId);
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
    }
    res.json(roots);
  } catch (e) {
    console.error('GET /api/locations/tree:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
