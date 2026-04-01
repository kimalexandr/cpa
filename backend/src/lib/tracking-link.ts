import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

function makeToken(): string {
  return 'tk_' + crypto.randomBytes(24).toString('base64url');
}

export async function ensureTrackingLink(prisma: PrismaClient, offerId: string, affiliateId: string): Promise<{ id: string; token: string }> {
  const existing = await prisma.trackingLink.findFirst({
    where: { offerId, affiliateId },
    select: { id: true, token: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  for (let i = 0; i < 5; i++) {
    const token = makeToken();
    try {
      const created = await prisma.trackingLink.create({
        data: { offerId, affiliateId, token },
        select: { id: true, token: true },
      });
      return created;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code !== 'P2002') throw e;
    }
  }
  throw new Error('Не удалось сгенерировать уникальный tracking token');
}
