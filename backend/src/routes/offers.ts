import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'object' && v !== null && 'toString' in v) return Number((v as { toString: () => string }).toString()) || null;
  return Number(v) || null;
}

function serializeOffer(offer: Record<string, unknown>): Record<string, unknown> {
  const out = { ...offer };
  if ('payoutAmount' in out) out.payoutAmount = toNumber(out.payoutAmount);
  if ('capAmount' in out) out.capAmount = toNumber(out.capAmount);
  return out;
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const categorySlug = req.query.category as string | undefined;
    const status = (req.query.status as string) || 'active';
    const search = (req.query.search as string) || '';
    const where: Record<string, unknown> = {};
    if (status === 'active') {
      where.status = { in: ['active', 'paused'] };
    } else if (status) {
      where.status = status;
    }
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
    res.json(offers.map((o) => serializeOffer(o as Record<string, unknown>)));
  } catch (e) {
    console.error('GET /api/offers:', e);
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('column') && msg.includes('does not exist')) {
      res.status(500).json({ error: 'Обновите БД: выполните npx prisma db push или npm run db:migrate в папке backend' });
      return;
    }
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
    res.json(serializeOffer(offer as Record<string, unknown>));
  } catch (e) {
    console.error('GET /api/offers/:id:', e);
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('column') && msg.includes('does not exist')) {
      res.status(500).json({ error: 'Обновите БД: выполните npx prisma db push или npm run db:migrate в папке backend' });
      return;
    }
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
