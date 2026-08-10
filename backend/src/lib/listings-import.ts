import {
  LandingType,
  OfferStatus,
  PayoutModel,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

export type ExternalListingItem = {
  externalId?: string;
  id?: string;
  external_id?: string;
  url?: string;
  landingUrl?: string;
  link?: string;
  title?: string;
  name?: string;
  description?: string;
  text?: string;
  geo?: string;
  location?: string;
  city?: string;
  price?: string | number | null;
  seller?: string;
  company?: string;
  sourceCategory?: string;
  categoryUrl?: string;
};

export type ListingsImportOptions = {
  source?: string;
  idPrefix?: string;
  categorySlug?: string;
  categoryName?: string;
  categoryExternalRef?: string;
  supplierEmail?: string;
  status?: OfferStatus;
  payoutAmount?: number;
  currency?: string;
};

export type ListingsImportResult = {
  upserted: number;
  skipped: number;
  offerIds: string[];
  errors: Array<{ index: number; error: string }>;
};

function cleanText(value?: string | number | null): string {
  if (value == null) return '';
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\u0026quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickExternalId(item: ExternalListingItem): string | null {
  const raw = item.externalId || item.external_id || item.id;
  if (raw == null) return null;
  const id = String(raw).trim();
  return id || null;
}

function pickUrl(item: ExternalListingItem): string | null {
  const raw = item.url || item.landingUrl || item.link;
  if (!raw) return null;
  const url = String(raw).trim();
  return url || null;
}

function pickTitle(item: ExternalListingItem): string | null {
  const title = cleanText(item.title || item.name);
  return title || null;
}

function normalizeItem(item: ExternalListingItem) {
  const externalId = pickExternalId(item);
  const url = pickUrl(item);
  const title = pickTitle(item);
  if (!externalId || !url || !title) return null;

  const price = cleanText(item.price);
  const seller = cleanText(item.seller || item.company);
  const description = cleanText(item.description || item.text);
  const geo = cleanText(item.geo || item.location || item.city) || 'Российская Федерация';
  const categoryUrl = cleanText(item.sourceCategory || item.categoryUrl);

  const parts = [
    description,
    price ? `Цена: ${price}` : '',
    seller ? `Продавец: ${seller}` : '',
    `Источник: ${url}`,
  ].filter(Boolean);

  return {
    externalId,
    url,
    title,
    geo,
    categoryUrl,
    description: parts.join('\n\n'),
  };
}

/** Принимает массив items или обёртки Apify/Crawlee `{ items | datasetItems | data }`. */
export function extractListingItems(body: unknown): ExternalListingItem[] {
  if (Array.isArray(body)) return body as ExternalListingItem[];
  if (!body || typeof body !== 'object') return [];
  const obj = body as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as ExternalListingItem[];
  if (Array.isArray(obj.datasetItems)) return obj.datasetItems as ExternalListingItem[];
  if (Array.isArray(obj.data)) return obj.data as ExternalListingItem[];
  return [];
}

export async function upsertExternalListings(
  prisma: PrismaClient,
  items: ExternalListingItem[],
  options: ListingsImportOptions = {},
): Promise<ListingsImportResult> {
  const source = options.source || 'agroserver.ru';
  const idPrefix = options.idPrefix || 'agro';
  const categorySlug = options.categorySlug || process.env.LISTINGS_DEFAULT_CATEGORY_SLUG || 'agrochemistry';
  const categoryName = options.categoryName || 'Агрохимия';
  const categoryExternalRef =
    options.categoryExternalRef || `external:${source}:${categorySlug}`;
  const supplierEmail =
    options.supplierEmail || process.env.LISTINGS_SUPPLIER_EMAIL || 'supplier@example.com';
  const status =
    options.status ||
    ((process.env.LISTINGS_DEFAULT_STATUS as OfferStatus) || OfferStatus.active);
  const payoutAmount = options.payoutAmount ?? Number(process.env.LISTINGS_DEFAULT_PAYOUT || 300);
  const currency = options.currency || 'RUB';

  const passwordHash = await bcrypt.hash('TestPassword123!', 10);

  const category = await prisma.category.upsert({
    where: { slug: categorySlug },
    update: {
      name: categoryName,
      isActive: true,
      externalRef: categoryExternalRef,
    },
    create: {
      name: categoryName,
      slug: categorySlug,
      description: `Импорт объявлений (${source})`,
      isActive: true,
      level: 1,
      externalRef: categoryExternalRef,
    },
  });

  const supplier = await prisma.user.upsert({
    where: { email: supplierEmail },
    update: {},
    create: {
      email: supplierEmail,
      passwordHash,
      role: UserRole.supplier,
      name: 'Импорт поставщик',
      companyName: 'External Listings',
      status: 'active',
    },
  });

  await prisma.supplierProfile.upsert({
    where: { userId: supplier.id },
    update: {},
    create: {
      userId: supplier.id,
      legalEntity: 'External Listings Import',
      website: `https://${source}`,
      payoutTerms: 'Тестовый импорт внешних объявлений',
    },
  });

  const result: ListingsImportResult = {
    upserted: 0,
    skipped: 0,
    offerIds: [],
    errors: [],
  };

  for (let index = 0; index < items.length; index += 1) {
    const normalized = normalizeItem(items[index]);
    if (!normalized) {
      result.skipped += 1;
      result.errors.push({ index, error: 'Нужны externalId/id, url и title' });
      continue;
    }

    try {
      const id = `${idPrefix}-${normalized.externalId}`;
      const rules = JSON.stringify({
        source,
        externalId: normalized.externalId,
        categoryUrl: normalized.categoryUrl || null,
        importedAt: new Date().toISOString(),
      });

      const offer = await prisma.offer.upsert({
        where: { id },
        update: {
          title: normalized.title,
          description: normalized.description,
          targetGeo: normalized.geo,
          landingUrl: normalized.url,
          landingType: LandingType.external,
          status,
          categoryId: category.id,
          payoutModel: PayoutModel.CPA,
          payoutAmount,
          currency,
          rules,
        },
        create: {
          id,
          supplierId: supplier.id,
          categoryId: category.id,
          title: normalized.title,
          description: normalized.description,
          targetGeo: normalized.geo,
          payoutModel: PayoutModel.CPA,
          payoutAmount,
          currency,
          landingUrl: normalized.url,
          landingType: LandingType.external,
          status,
          rating: 4.5,
          reviewsCount: 1,
          rules,
        },
      });

      await prisma.offerCategory.upsert({
        where: {
          offerId_categoryId: {
            offerId: offer.id,
            categoryId: category.id,
          },
        },
        update: {},
        create: {
          offerId: offer.id,
          categoryId: category.id,
        },
      });

      result.upserted += 1;
      result.offerIds.push(offer.id);
    } catch (e) {
      result.errors.push({
        index,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

/** Загрузка JSON-ленты (массив или `{ items }`) по URL — для суточного job / Apify dataset. */
export async function fetchListingsFeed(feedUrl: string): Promise<ExternalListingItem[]> {
  const resp = await fetch(feedUrl, {
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) {
    throw new Error(`Feed HTTP ${resp.status}: ${feedUrl}`);
  }
  const body = await resp.json();
  return extractListingItems(body);
}

export async function fetchApifyDatasetItems(datasetId: string, token: string): Promise<ExternalListingItem[]> {
  const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}`;
  return fetchListingsFeed(url);
}

/** Собирает LISTINGS_FEED_URL из env, либо из APIFY_TOKEN + LISTINGS_APIFY_DATASET_ID. */
export function resolveListingsFeedUrl(): string {
  const explicit = (process.env.LISTINGS_FEED_URL || '').trim();
  if (explicit) return explicit;
  const datasetId = (process.env.LISTINGS_APIFY_DATASET_ID || '').trim();
  const token = (process.env.APIFY_TOKEN || '').trim();
  if (datasetId && token) {
    return `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}`;
  }
  return '';
}

/**
 * Запускает Apify Actor, ждёт завершения, возвращает defaultDatasetId.
 * LISTINGS_APIFY_ACTOR_ID: username~actor-name
 */
export async function runApifyActorAndGetDatasetId(
  actorId: string,
  token: string,
  input: Record<string, unknown> = {},
  waitSec = 180,
): Promise<string> {
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs` +
    `?token=${encodeURIComponent(token)}&waitForFinish=${Math.max(1, waitSec)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Apify actor run HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { data?: { defaultDatasetId?: string; status?: string } };
  const datasetId = json?.data?.defaultDatasetId;
  if (!datasetId) {
    throw new Error(`Apify run без defaultDatasetId (status=${json?.data?.status || '?'})`);
  }
  return datasetId;
}
