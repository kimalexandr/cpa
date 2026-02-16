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

  async function fetchFull() {
    return prisma.offer.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true, level: true } },
        offerCategories: { select: { category: { select: { id: true, name: true, slug: true, level: true } } } },
        supplier: { select: { id: true, companyName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Запрос без offerCategories (если таблица/колонки ещё не применены) */
  async function fetchFallback() {
    const whereSimple: Record<string, unknown> = { ...where };
    if (categorySlug) {
      delete (whereSimple as Record<string, unknown>).OR;
      (whereSimple as Record<string, unknown>).category = { slug: categorySlug };
    }
    return prisma.offer.findMany({
      where: whereSimple,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        supplier: { select: { id: true, companyName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Минимальный запрос: только Offer + category/supplier без level и без offerCategories */
  async function fetchMinimal() {
    const whereMin: Record<string, unknown> = {};
    if (where.status) whereMin.status = where.status;
    if (categorySlug) (whereMin as Record<string, unknown>).category = { slug: categorySlug };
    if (search.trim()) {
      (whereMin as Record<string, unknown>).OR = [
        { title: { contains: search.trim(), mode: 'insensitive' as const } },
        { description: { contains: search.trim(), mode: 'insensitive' as const } },
      ];
    }
    return prisma.offer.findMany({
      where: whereMin,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        supplier: { select: { id: true, companyName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  function isDbSchemaError(msg: string): boolean {
    const s = msg.toLowerCase();
    return (
      s.includes('does not exist') ||
      s.includes('relation') ||
      s.includes('column') ||
      s.includes('offer_categories') ||
      s.includes('offer_locations') ||
      s.includes('level')
    );
  }

  try {
    let offers: Awaited<ReturnType<typeof fetchFull>>;
    try {
      offers = await fetchFull();
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      if (isDbSchemaError(msg)) {
        try {
          offers = (await fetchFallback()) as typeof offers;
        } catch (fallbackErr) {
          const msg2 = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          if (isDbSchemaError(msg2)) {
            offers = (await fetchMinimal()) as typeof offers;
          } else {
            throw fallbackErr;
          }
        }
      } else {
        throw dbErr;
      }
    }
    res.json(offers.map((o) => {
      const out = serializeOffer(o as Record<string, unknown>) as Record<string, unknown>;
      const oAny = o as { offerCategories?: { category: unknown }[]; category?: unknown };
      const cats = (oAny.offerCategories || []).map((oc: { category: unknown }) => oc.category);
      out.categories = Array.isArray(cats) && cats.length > 0 ? cats : (oAny.category ? [oAny.category] : []);
      return out;
    }));
  } catch (e) {
    console.error('GET /api/offers:', e);
    const msg = e instanceof Error ? e.message : '';
    if (isDbSchemaError(msg)) {
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
  const id = req.params.id;
  const fullInclude = {
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
  };
  const fallbackInclude = {
    category: { select: { id: true, name: true, slug: true, level: true } },
    supplier: {
      select: {
        id: true,
        companyName: true,
        name: true,
        supplierProfile: { select: { legalEntity: true, inn: true } },
      },
    },
  };
  try {
    let offer: Awaited<ReturnType<typeof prisma.offer.findUnique>>;
    try {
      offer = await prisma.offer.findUnique({
        where: { id },
        include: fullInclude,
      });
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('offer_categories') || msg.includes('offer_locations')) {
        offer = await prisma.offer.findUnique({
          where: { id },
          include: fallbackInclude,
        }) as typeof offer;
      } else {
        throw dbErr;
      }
    }
    if (!offer) {
      res.status(404).json({ error: 'Оффер не найден' });
      return;
    }
    if (offer.status !== 'active' && offer.status !== 'paused') {
      res.status(404).json({ error: 'Оффер не найден или не опубликован' });
      return;
    }
    const out = serializeOffer(offer as Record<string, unknown>) as Record<string, unknown>;
    const oAny = offer as { offerCategories?: { category: unknown }[]; category?: unknown; offerLocations?: { location: unknown }[] };
    out.categories = (oAny.offerCategories || []).map((oc: { category: unknown }) => oc.category);
    if (!(out.categories as unknown[]).length && oAny.category) out.categories = [oAny.category];
    out.locations = (oAny.offerLocations || []).map((ol: { location: unknown }) => ol.location);
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
