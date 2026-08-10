import { Queue, Worker, Job } from 'bullmq';
import { OfferStatus, PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import { logger } from './logger';
import {
  ExternalListingItem,
  fetchApifyDatasetItems,
  fetchListingsFeed,
  upsertExternalListings,
} from './listings-import';

const QUEUE_NAME = 'listings-import';
const prisma = new PrismaClient();

export type ListingsImportJobData = {
  reason?: 'schedule' | 'manual' | 'webhook';
  feedUrl?: string;
  datasetId?: string;
  items?: ExternalListingItem[];
  source?: string;
  categorySlug?: string;
  status?: OfferStatus;
};

let connection: IORedis | null = null;
let queue: Queue<ListingsImportJobData> | null = null;
let worker: Worker<ListingsImportJobData> | null = null;

function redisUrl(): string {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

function isEnabled(): boolean {
  const flag = (process.env.LISTINGS_IMPORT_ENABLED || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(redisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }
  return connection;
}

export function getListingsImportQueue(): Queue<ListingsImportJobData> {
  if (!queue) {
    queue = new Queue<ListingsImportJobData>(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    });
  }
  return queue;
}

async function runImportJob(job: Job<ListingsImportJobData>) {
  const data = job.data || {};
  let items: ExternalListingItem[] = Array.isArray(data.items) ? data.items : [];

  if (items.length === 0 && data.datasetId) {
    const token = process.env.APIFY_TOKEN || '';
    if (!token) throw new Error('APIFY_TOKEN не задан для datasetId');
    items = await fetchApifyDatasetItems(data.datasetId, token);
  }

  if (items.length === 0) {
    const feedUrl = data.feedUrl || process.env.LISTINGS_FEED_URL || '';
    if (!feedUrl) {
      throw new Error('Нет items / datasetId / LISTINGS_FEED_URL для импорта');
    }
    items = await fetchListingsFeed(feedUrl);
  }

  const result = await upsertExternalListings(prisma, items, {
    source: data.source || process.env.LISTINGS_SOURCE || 'agroserver.ru',
    categorySlug: data.categorySlug || process.env.LISTINGS_DEFAULT_CATEGORY_SLUG || 'agrochemistry',
    status: data.status,
  });

  logger.info(
    {
      jobId: job.id,
      reason: data.reason,
      upserted: result.upserted,
      skipped: result.skipped,
      errors: result.errors.length,
    },
    'listings import finished',
  );

  return result;
}

export async function enqueueListingsImport(data: ListingsImportJobData = {}): Promise<string | null> {
  if (!isEnabled()) {
    logger.warn('LISTINGS_IMPORT_ENABLED is off — enqueue skipped');
    return null;
  }
  const q = getListingsImportQueue();
  const job = await q.add('import', { reason: 'manual', ...data });
  return String(job.id);
}

export function startListingsImportWorker(): void {
  if (!isEnabled()) {
    logger.info('listings import worker disabled (set LISTINGS_IMPORT_ENABLED=true)');
    return;
  }

  try {
    const conn = getConnection();
    worker = new Worker<ListingsImportJobData>(QUEUE_NAME, (job) => runImportJob(job), {
      connection: conn,
      concurrency: 1,
    });

    worker.on('failed', (job, err) => {
      logger.error({ err, jobId: job?.id }, 'listings import job failed');
    });

    const q = getListingsImportQueue();
    const cron = process.env.LISTINGS_IMPORT_CRON || '0 3 * * *';

    void q
      .add(
        'import',
        { reason: 'schedule' },
        {
          repeat: { pattern: cron },
          jobId: 'listings-import-daily',
        },
      )
      .then(() => {
        logger.info({ cron }, 'listings import daily schedule registered');
      })
      .catch((err) => {
        logger.error({ err }, 'failed to register listings import schedule');
      });
  } catch (err) {
    logger.error({ err }, 'listings import worker failed to start');
  }
}
