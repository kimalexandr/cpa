import { Router, Request, Response } from 'express';
import { OfferStatus, PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middleware/auth';
import {
  extractListingItems,
  fetchApifyDatasetItems,
  upsertExternalListings,
} from '../lib/listings-import';
import { enqueueListingsImport } from '../lib/listings-import-queue';

const router = Router();
const prisma = new PrismaClient();
const IMPORT_SECRET = process.env.LISTINGS_IMPORT_SECRET;

function assertImportSecret(req: Request, res: Response): boolean {
  if (!IMPORT_SECRET) {
    res.status(501).json({ error: 'LISTINGS_IMPORT_SECRET не задан на сервере' });
    return false;
  }
  const provided =
    req.headers['x-listings-import-secret'] ??
    req.headers['x-apify-webhook-secret'] ??
    (req.body && (req.body.secret as string | undefined));
  if (provided !== IMPORT_SECRET) {
    res.status(403).json({ error: 'Неверный секрет' });
    return false;
  }
  return true;
}

/**
 * Webhook для Apify/Crawlee или прямой JSON-импорт.
 *
 * Body:
 * - { items: [...] }
 * - [...] 
 * - Apify run webhook: { resource: { defaultDatasetId } } (+ APIFY_TOKEN)
 *
 * Item fields: externalId|id, url|landingUrl|link, title|name, description?, geo?, price?, seller?
 */
router.post('/listings/import', async (req: Request, res: Response) => {
  if (!assertImportSecret(req, res)) return;

  try {
    let items = extractListingItems(req.body);
    const datasetId =
      (req.body && req.body.resource && req.body.resource.defaultDatasetId) ||
      (req.body && req.body.datasetId) ||
      null;

    if (items.length === 0 && datasetId) {
      const token = process.env.APIFY_TOKEN || '';
      if (!token) {
        res.status(400).json({ error: 'Для datasetId нужен APIFY_TOKEN' });
        return;
      }
      items = await fetchApifyDatasetItems(String(datasetId), token);
    }

    if (items.length === 0) {
      res.status(400).json({ error: 'Пустой список объявлений (items/datasetId)' });
      return;
    }

    const asyncMode = String(req.query.async || '') === '1' || req.body?.async === true;
    if (asyncMode) {
      const jobId = await enqueueListingsImport({
        reason: 'webhook',
        items,
        datasetId: datasetId ? String(datasetId) : undefined,
        source: req.body?.source,
        categorySlug: req.body?.categorySlug,
        status: req.body?.status,
      });
      res.status(202).json({ ok: true, queued: true, jobId, count: items.length });
      return;
    }

    const result = await upsertExternalListings(prisma, items, {
      source: req.body?.source || process.env.LISTINGS_SOURCE || 'agroserver.ru',
      categorySlug: req.body?.categorySlug || process.env.LISTINGS_DEFAULT_CATEGORY_SLUG || 'agrochemistry',
      status: (req.body?.status as OfferStatus) || undefined,
      payoutAmount: req.body?.payoutAmount != null ? Number(req.body.payoutAmount) : undefined,
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('POST /api/integrations/listings/import:', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Ошибка сервера' });
  }
});

/** Поставить суточный/ручной job в очередь (тянет LISTINGS_FEED_URL или переданный feedUrl/datasetId). */
router.post('/listings/run', async (req: Request, res: Response) => {
  if (!assertImportSecret(req, res)) return;

  try {
    const jobId = await enqueueListingsImport({
      reason: 'manual',
      feedUrl: req.body?.feedUrl,
      datasetId: req.body?.datasetId,
      items: extractListingItems(req.body),
      source: req.body?.source,
      categorySlug: req.body?.categorySlug,
      status: req.body?.status,
    });

    if (!jobId) {
      res.status(503).json({
        error: 'Очередь выключена. Задайте LISTINGS_IMPORT_ENABLED=true и Redis (REDIS_URL).',
      });
      return;
    }

    res.status(202).json({ ok: true, jobId });
  } catch (e) {
    console.error('POST /api/integrations/listings/run:', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Ошибка сервера' });
  }
});

router.use(requireAuth);

router.get('/health', async (req: AuthRequest, res: Response) => {
  try {
    const protocol = req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    const origin = `${protocol}://${host}`;
    const postbackUrl = origin + '/api/events';

    let links: Array<{ token: string; offerTitle: string }> = [];
    if (req.user?.role === 'affiliate') {
      const rows = await prisma.trackingLink.findMany({
        where: { affiliateId: req.user.userId },
        include: { offer: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      links = rows.map((r) => ({ token: r.token, offerTitle: r.offer.title }));
    } else if (req.user?.role === 'supplier') {
      const rows = await prisma.trackingLink.findMany({
        where: { offer: { supplierId: req.user.userId } },
        include: { offer: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      links = rows.map((r) => ({ token: r.token, offerTitle: r.offer.title }));
    }

    const linkTokens = links.map((l) => l.token);
    const eventRows = linkTokens.length
      ? await prisma.event.findMany({
          where: { trackingLink: { token: { in: linkTokens } } },
          include: { trackingLink: { select: { token: true, offer: { select: { title: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    const lastResponses = eventRows.map((e) => ({
      createdAt: e.createdAt,
      token: e.trackingLink.token,
      offerTitle: e.trackingLink.offer.title,
      eventType: e.eventType,
      status: e.status,
      amount: e.amount != null ? Number(e.amount) : null,
    }));

    res.json({
      postbackUrl,
      trackingTokens: links,
      lastResponses,
      listingsImport: {
        enabled: ['1', 'true', 'yes'].includes((process.env.LISTINGS_IMPORT_ENABLED || '').toLowerCase()),
        cron: process.env.LISTINGS_IMPORT_CRON || '0 3 * * *',
        hasFeedUrl: Boolean(process.env.LISTINGS_FEED_URL),
        hasSecret: Boolean(IMPORT_SECRET),
      },
    });
  } catch (e) {
    console.error('GET /api/integrations/health:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
