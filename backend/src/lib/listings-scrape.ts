import { OfferStatus, PrismaClient } from '@prisma/client';
import { ExternalListingItem, upsertExternalListings } from './listings-import';
import { logger } from './logger';

export type ScrapeParseResult = {
  items: ExternalListingItem[];
  httpStatus: number;
  contentType: string;
  htmlLength: number;
  captchaDetected: boolean;
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Парсит карточки Agroserver (div.line) из HTML категории. */
export function parseAgroserverCategoryHtml(
  html: string,
  categoryUrl: string,
  maxItems: number,
): ExternalListingItem[] {
  const parts = html.split(/<div class="line" id="p/);
  const items: ExternalListingItem[] = [];

  for (let i = 1; i < parts.length && items.length < maxItems; i += 1) {
    const part = parts[i];
    const hrefMatch = part.match(/href="(\/b\/[^"]+\.htm)"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    const titleMatch = part.match(/class="th"><a href="\/b\/[^"]+">([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]);
    const geoMatch = part.match(/class="bl geo">\s*([\s\S]*?)<\/div>/);
    const textMatch = part.match(/class="text">([\s\S]*?)<\/div>/);
    const priceMatch = part.match(/class="[^"]*price[^"]*">([\s\S]*?)<\/div>/);
    const sellerMatch =
      part.match(/class="personal_org[^"]*"[^>]*>([^<]+)/) ||
      part.match(/<a class="personal_org[^"]*"[^>]*>([^<]+)/) ||
      part.match(/class="bl org">[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    const idMatch = href.match(/-(\d+)\.htm$/);
    if (!idMatch) continue;

    items.push({
      externalId: idMatch[1],
      url: `https://agroserver.ru${href}`,
      title,
      geo: geoMatch ? decodeHtmlEntities(geoMatch[1].replace(/<[^>]+>/g, '')) : '',
      description: textMatch ? decodeHtmlEntities(textMatch[1].replace(/<[^>]+>/g, '')) : '',
      price: priceMatch ? decodeHtmlEntities(priceMatch[1].replace(/<[^>]+>/g, '')) : null,
      seller: sellerMatch ? decodeHtmlEntities(sellerMatch[1]) : '',
      sourceCategory: categoryUrl,
    });
  }

  return items;
}

export function detectCaptchaOrBlock(html: string): string | null {
  const lower = html.toLowerCase();
  if (lower.includes('не робот') || lower.includes('wm_code') || lower.includes('проверка, что вы не робот')) {
    return 'Сайт показал капчу («проверка, что вы не робот»). Прямой парсинг с сервера заблокирован. Нужен Apify/прокси или ручной JSON-импорт.';
  }
  if (lower.includes('access denied') || lower.includes('cf-browser-verification')) {
    return 'Доступ к сайту заблокирован (CDN/антибот).';
  }
  return null;
}

export async function fetchCategoryPage(categoryUrl: string): Promise<ScrapeParseResult> {
  let resp: Response;
  try {
    resp = await fetch(categoryUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Не удалось открыть URL: ${msg}`);
  }

  const contentType = resp.headers.get('content-type') || '';
  const html = await resp.text();
  const captchaMsg = detectCaptchaOrBlock(html);
  const captchaDetected = Boolean(captchaMsg);

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} при запросе ${categoryUrl}. Content-Type: ${contentType}. Длина ответа: ${html.length}`);
  }

  if (captchaMsg) {
    const err = new Error(captchaMsg) as Error & { detail?: string };
    err.detail = `url=${categoryUrl}; http=${resp.status}; htmlLength=${html.length}; sample=${html.slice(0, 280).replace(/\s+/g, ' ')}`;
    throw err;
  }

  const items = parseAgroserverCategoryHtml(html, categoryUrl, 1000);
  return {
    items,
    httpStatus: resp.status,
    contentType,
    htmlLength: html.length,
    captchaDetected,
  };
}

export type RunSourceOptions = {
  trigger?: 'manual' | 'schedule' | 'admin';
  prisma: PrismaClient;
};

/**
 * Прогон одного источника из админки: парсинг URL → upsert офферов → лог с ошибками.
 */
export async function runListingsSource(
  sourceId: string,
  options: RunSourceOptions,
): Promise<{
  ok: boolean;
  logId: string;
  status: string;
  message: string;
  detail?: string | null;
  itemsFound: number;
  upserted: number;
  skipped: number;
}> {
  const { prisma } = options;
  const trigger = options.trigger || 'manual';

  const source = await prisma.listingsSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new Error('Источник не найден');
  }

  const log = await prisma.listingsImportLog.create({
    data: {
      sourceId: source.id,
      trigger,
      status: 'running',
      message: `Старт парсинга: ${source.categoryUrl}`,
    },
  });

  try {
    const scraped = await fetchCategoryPage(source.categoryUrl);
    const items = scraped.items.slice(0, Math.max(1, source.maxItems));

    if (items.length === 0) {
      const message =
        'Страница открылась, но карточки объявлений не найдены (ожидались блоки div.line). Возможно, изменилась вёрстка сайта или URL не является списком категории.';
      const detail = JSON.stringify({
        url: source.categoryUrl,
        httpStatus: scraped.httpStatus,
        contentType: scraped.contentType,
        htmlLength: scraped.htmlLength,
        hint: 'Проверьте URL категории. Для Agroserver пример: https://agroserver.ru/organo-mineralnye-udobreniya/',
      });

      await prisma.listingsImportLog.update({
        where: { id: log.id },
        data: {
          status: 'error',
          message,
          detail,
          itemsFound: 0,
          finishedAt: new Date(),
        },
      });
      await prisma.listingsSource.update({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'error',
          lastError: message,
        },
      });

      return {
        ok: false,
        logId: log.id,
        status: 'error',
        message,
        detail,
        itemsFound: 0,
        upserted: 0,
        skipped: 0,
      };
    }

    const offerStatus =
      source.offerStatus === 'draft' ? OfferStatus.draft : OfferStatus.active;

    const result = await upsertExternalListings(prisma, items, {
      source: source.sourceKey,
      idPrefix: source.idPrefix,
      categorySlug: source.categorySlug,
      categoryName: source.name,
      status: offerStatus,
    });

    const message = `Успешно: найдено ${items.length}, записано ${result.upserted}, пропущено ${result.skipped}`;
    const detail =
      result.errors.length > 0
        ? JSON.stringify({ parseErrors: result.errors, offerIds: result.offerIds })
        : JSON.stringify({ offerIds: result.offerIds });

    await prisma.listingsImportLog.update({
      where: { id: log.id },
      data: {
        status: result.errors.length ? 'partial' : 'ok',
        message,
        detail,
        itemsFound: items.length,
        upserted: result.upserted,
        skipped: result.skipped,
        finishedAt: new Date(),
      },
    });
    await prisma.listingsSource.update({
      where: { id: source.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: result.errors.length ? 'partial' : 'ok',
        lastError: result.errors.length ? JSON.stringify(result.errors) : null,
      },
    });

    return {
      ok: result.errors.length === 0,
      logId: log.id,
      status: result.errors.length ? 'partial' : 'ok',
      message,
      detail,
      itemsFound: items.length,
      upserted: result.upserted,
      skipped: result.skipped,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const detail =
      e && typeof e === 'object' && 'detail' in e
        ? String((e as { detail?: string }).detail || '')
        : e instanceof Error && e.stack
          ? e.stack.slice(0, 4000)
          : null;

    logger.error({ err: e, sourceId }, 'listings source scrape failed');

    await prisma.listingsImportLog.update({
      where: { id: log.id },
      data: {
        status: 'error',
        message,
        detail,
        finishedAt: new Date(),
      },
    });
    await prisma.listingsSource.update({
      where: { id: source.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'error',
        lastError: message,
      },
    });

    return {
      ok: false,
      logId: log.id,
      status: 'error',
      message,
      detail,
      itemsFound: 0,
      upserted: 0,
      skipped: 0,
    };
  }
}

/** Суточный прогон всех enabled-источников из БД. */
export async function runAllEnabledListingsSources(prisma: PrismaClient): Promise<void> {
  const sources = await prisma.listingsSource.findMany({
    where: { enabled: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const source of sources) {
    try {
      await runListingsSource(source.id, { prisma, trigger: 'schedule' });
    } catch (e) {
      logger.error({ err: e, sourceId: source.id }, 'scheduled listings source failed');
    }
  }
}
