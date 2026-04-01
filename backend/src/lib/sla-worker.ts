import { PrismaClient } from '@prisma/client';
import { createNotification } from './notifications';
import { logger } from './logger';

const prisma = new PrismaClient();

export function startSlaWorker(): void {
  const intervalMs = Number(process.env.SLA_WORKER_INTERVAL_MS || 15 * 60 * 1000);
  setInterval(async () => {
    try {
      const slaHours = Number(process.env.MODERATION_SLA_HOURS || 48);
      const threshold = new Date(Date.now() - slaHours * 60 * 60 * 1000);
      const overdue = await prisma.event.findMany({
        where: { status: 'pending', eventType: { in: ['lead', 'sale'] }, createdAt: { lte: threshold } },
        include: { trackingLink: { select: { offer: { select: { title: true, supplierId: true } } } } },
        take: 200,
        orderBy: { createdAt: 'asc' },
      });
      for (const e of overdue) {
        if (!e.trackingLink.offer.supplierId) continue;
        await createNotification(prisma, {
          userId: e.trackingLink.offer.supplierId,
          type: 'system',
          title: '[SLA] Требуется модерация',
          body: 'Событие ' + e.id + ' по офферу "' + e.trackingLink.offer.title + '" ожидает проверки более ' + slaHours + 'ч.',
          link: '/dashboard-supplier-leads.html',
        });
      }
    } catch (e) {
      logger.error({ err: e }, 'sla worker failed');
    }
  }, intervalMs);
}

