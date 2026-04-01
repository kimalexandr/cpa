import { PrismaClient } from '@prisma/client';
import { queueLagGauge } from './metrics';
import { logger } from './logger';

const prisma = new PrismaClient();
const MAX_ATTEMPTS = 5;

async function tryDeliver(row: { id: string; url: string; payload: string; attempts: number }) {
  try {
    const resp = await fetch(row.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: row.payload,
    });
    const ok = resp.ok;
    await prisma.webhookDelivery.update({
      where: { id: row.id },
      data: {
        ok,
        statusCode: resp.status,
        attempts: row.attempts + 1,
        nextRetryAt: ok || row.attempts + 1 >= MAX_ATTEMPTS ? null : new Date(Date.now() + (row.attempts + 1) * 60 * 1000),
        error: ok ? null : ('HTTP ' + resp.status),
      },
    });
  } catch (e) {
    await prisma.webhookDelivery.update({
      where: { id: row.id },
      data: {
        ok: false,
        attempts: row.attempts + 1,
        nextRetryAt: row.attempts + 1 >= MAX_ATTEMPTS ? null : new Date(Date.now() + (row.attempts + 1) * 60 * 1000),
        error: e instanceof Error ? e.message : String(e),
      },
    });
  }
}

export function startWebhookRetryWorker(): void {
  setInterval(async () => {
    try {
      const rows = await prisma.webhookDelivery.findMany({
        where: {
          ok: false,
          attempts: { lt: MAX_ATTEMPTS },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        },
        take: 50,
        orderBy: { createdAt: 'asc' },
      });
      queueLagGauge.set(rows.length);
      for (const row of rows) {
        await tryDeliver({ id: row.id, url: row.url, payload: row.payload, attempts: row.attempts });
      }
    } catch (e) {
      logger.error({ err: e }, 'webhook retry worker failed');
    }
  }, 15000);
}

