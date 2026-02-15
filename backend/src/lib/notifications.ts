import { PrismaClient } from '@prisma/client';

type NotificationType = 'participation_approved' | 'participation_rejected' | 'payout_paid' | 'system';

export async function createNotification(
  prisma: PrismaClient,
  data: { userId: string; type: NotificationType; title: string; body?: string | null; link?: string | null }
) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      link: data.link ?? null,
    },
  });
}
