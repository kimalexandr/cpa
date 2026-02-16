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
      (where as Record<string, unknown>).OR = [
        { category: { slug: categorySlug } },
        { offerCategories: { some: { category: { slug: categorySlug } } } },
      ];
    }
    if (search.trim()) {
      const searchCond = [
        { title: { contains: search.trim(), mode: 'insensitive' as const } },
        { description: { contains: search.trim(), mode: 'insensitive' as const } },
      ];
      if (categorySlug) {
        (where as Record<string, unknown>).AND = [
          { OR: (where as Record<string, unknown>).OR },
          { OR: searchCond },
        ];
        delete (where as Record<string, unknown>).OR;
      } else {
        (where as Record<string, unknown>).OR = searchCond;
      }
    }
    const offers = await prisma.offer.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true, level: true } },
        offerCategories: { select: { category: { select: { id: true, name: true, slug: true, level: true } } } },
        supplier: { select: { id: true, companyName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(offers.map((o) => {
      const out = serializeOffer(o as Record<string, unknown>) as Record<string, unknown>;
      const cats = (o.offerCategories || []).map((oc: { category: unknown }) => oc.category);
      out.categories = Array.isArray(cats) && cats.length > 0 ? cats : (o.category ? [o.category] : []);
      return out;
    }));
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

/** Список выбранных локаций оффера (для модалки и отображения) */
router.get('/:id/locations', async (req: Request, res: Response): Promise<void> => {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!offer) {
      res.status(404).json({ error: 'Оффер не найден' });
      return;
    }
    const rows = await prisma.offerLocation.findMany({
      where: { offerId: req.params.id },
      include: { location: true },
    });
    res.json(rows.map((r) => r.location));
  } catch (e) {
    console.error('GET /api/offers/:id/locations:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { id: true, name: true, slug: true, level: true } },
        offerCategories: { select: { category: { select: { id: true, name: true, slug: true, level: true } } } },
        offerLocations: { select: { location: true } },
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
    const out = serializeOffer(offer as Record<string, unknown>) as Record<string, unknown>;
    out.categories = (offer.offerCategories || []).map((oc: { category: unknown }) => oc.category);
    if (!(out.categories as unknown[]).length && offer.category) out.categories = [offer.category];
    out.locations = (offer.offerLocations || []).map((ol: { location: unknown }) => ol.location);
    res.json(out);
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
