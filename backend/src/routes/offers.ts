import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const categorySlug = req.query.category as string | undefined;
    const status = (req.query.status as string) || 'active';
    const search = (req.query.search as string) || '';
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (categorySlug) {
      where.category = { slug: categorySlug };
    }
    if (search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }
    const offers = await prisma.offer.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        supplier: { select: { id: true, companyName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(offers);
  } catch (e) {
    console.error('GET /api/offers:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        supplier: {
          select: {
            id: true,
            companyName: true,
            name: true,
            supplierProfile: { select: { legalEntity: true, inn: true } },
          },
        },
      },
    });
    if (!offer) {
      res.status(404).json({ error: 'Оффер не найден' });
      return;
    }
    if (offer.status !== 'active' && offer.status !== 'paused') {
      res.status(404).json({ error: 'Оффер не найден или не опубликован' });
      return;
    }
    res.json(offer);
  } catch (e) {
    console.error('GET /api/offers/:id:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
