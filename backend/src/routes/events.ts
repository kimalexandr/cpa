import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createNotification } from '../lib/notifications';
import * as crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();
const MAX_AMOUNT = 9_999_999_999.99;
const MAX_EXTERNAL_ID = 128;
const MAX_TEXT_FIELD = 255;
const SIGN_WINDOW_SEC = 300;

function cleanText(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > MAX_AMOUNT) return null;
  return n;
}

function verifyPostbackSignature(secret: string, ts: string, payload: string, sign: string): boolean {
  const mac = crypto.createHmac('sha256', secret).update(ts + '.' + payload).digest('hex');
  const a = Buffer.from(mac, 'utf8');
  const b = Buffer.from(sign.toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const token = cleanText(req.body?.token, 128);
    const linkId = cleanText(req.body?.tracking_link_id, 64);
    const eventTypeRaw = cleanText(req.body?.event_type, 16);
    const eventType = eventTypeRaw === 'lead' || eventTypeRaw === 'sale' ? eventTypeRaw : null;
    const externalId = cleanText(req.body?.external_id, MAX_EXTERNAL_ID);
    const source = cleanText(req.body?.source, MAX_TEXT_FIELD);
    const subid1 = cleanText(req.body?.subid1, MAX_TEXT_FIELD);
    const subid2 = cleanText(req.body?.subid2, MAX_TEXT_FIELD);
    const subid3 = cleanText(req.body?.subid3, MAX_TEXT_FIELD);
    const subid4 = cleanText(req.body?.subid4, MAX_TEXT_FIELD);
    const subid5 = cleanText(req.body?.subid5, MAX_TEXT_FIELD);
    const utmSource = cleanText(req.body?.utm_source, MAX_TEXT_FIELD);
    const utmMedium = cleanText(req.body?.utm_medium, MAX_TEXT_FIELD);
    const utmCampaign = cleanText(req.body?.utm_campaign, MAX_TEXT_FIELD);
    const utmTerm = cleanText(req.body?.utm_term, MAX_TEXT_FIELD);
    const utmContent = cleanText(req.body?.utm_content, MAX_TEXT_FIELD);
    const deviceFingerprint = cleanText(req.body?.device_fingerprint, MAX_TEXT_FIELD);
    const amountNumInput = parseAmount(req.body?.amount);
    if (!eventType) {
      res.status(400).json({ error: 'event_type обязателен и должен быть lead или sale' });
      return;
    }
    if (!externalId) {
      res.status(400).json({ error: 'external_id обязателен' });
      return;
    }
    if (amountNumInput == null) {
      res.status(400).json({ error: 'amount обязателен и должен быть числом от 0 до 9 999 999 999.99' });
      return;
    }
    let link: { id: string; offerId: string; affiliateId: string } | null = null;
    if (token) {
      link = await prisma.trackingLink.findUnique({
        where: { token: String(token) },
        select: { id: true, offerId: true, affiliateId: true },
      });
    } else if (linkId) {
      link = await prisma.trackingLink.findUnique({
        where: { id: String(linkId) },
        select: { id: true, offerId: true, affiliateId: true },
      });
    }
    if (!link) {
      res.status(400).json({ error: 'Укажите token или tracking_link_id' });
      return;
    }
    if (externalId) {
      const existingByExternal = await prisma.event.findFirst({
        where: { trackingLinkId: link.id, externalId: String(externalId) },
        orderBy: { createdAt: 'desc' },
      });
      if (existingByExternal) {
        res.json({ ...existingByExternal, deduplicated: true, idempotencyKey: String(externalId) });
        return;
      }
    }
    const offer = await prisma.offer.findUnique({
      where: { id: link.offerId },
      select: { payoutAmount: true, payoutModel: true, capAmount: true, capConversions: true, supplierId: true, title: true, postbackSecret: true },
    });
    let amountNum = amountNumInput;
    if (amountNum == null && offer) {
      amountNum = Number(offer.payoutAmount ?? 0);
    }
    const sigTs = cleanText(req.headers['x-postback-ts'], 32);
    const sig = cleanText(req.headers['x-postback-sign'], 128);
    if (offer?.postbackSecret) {
      if (!sigTs || !sig) {
        res.status(401).json({ error: 'Требуется подпись postback (x-postback-ts, x-postback-sign)' });
        return;
      }
      const tsNum = Number(sigTs);
      if (!Number.isFinite(tsNum)) {
        res.status(401).json({ error: 'Некорректный x-postback-ts' });
        return;
      }
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - Math.floor(tsNum)) > SIGN_WINDOW_SEC) {
        res.status(401).json({ error: 'Подпись устарела' });
        return;
      }
      const payload = [
        token ? ('token:' + token) : ('link:' + link.id),
        eventType,
        externalId,
        String(amountNum ?? ''),
      ].join('|');
      const okSign = verifyPostbackSignature(offer.postbackSecret, sigTs, payload, sig);
      if (!okSign) {
        res.status(401).json({ error: 'Неверная подпись postback' });
        return;
      }
    }

    if (eventType === 'sale') {
      if (!offer) {
        res.status(400).json({ error: 'Оффер не найден' });
        return;
      }
      if (offer.capAmount != null || offer.capConversions != null) {
        const offerLinkIds = (await prisma.trackingLink.findMany({
          where: { offerId: link.offerId },
          select: { id: true },
        })).map((l: { id: string }) => l.id);
        const [sumResult, currentCount] = await Promise.all([
          prisma.event.aggregate({
            where: {
              trackingLinkId: { in: offerLinkIds },
              eventType: 'sale',
              status: 'approved',
            },
            _sum: { amount: true },
          }),
          prisma.event.count({
            where: {
              trackingLinkId: { in: offerLinkIds },
              eventType: 'sale',
              status: 'approved',
            },
          }),
        ]);
        const currentSum = Number(sumResult._sum.amount || 0);
        if (offer.capAmount != null && currentSum + (amountNum || 0) > Number(offer.capAmount)) {
          res.status(400).json({ error: 'Достигнут лимит бюджета по офферу (cap)' });
          return;
        }
        if (offer.capConversions != null && currentCount + 1 > Number(offer.capConversions)) {
          res.status(400).json({ error: 'Достигнут лимит конверсий по офферу (cap)' });
          return;
        }
      }
    }

    const fraudFlags: string[] = [];
    const sourceValue = source ? String(source).toLowerCase() : '';
    const blacklist = (process.env.SOURCE_BLACKLIST || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (sourceValue && blacklist.includes(sourceValue)) fraudFlags.push('blacklisted_source');
    const recentCount = await prisma.event.count({
      where: {
        trackingLinkId: link.id,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    if (recentCount >= 25) fraudFlags.push('velocity_spike');
    if (externalId && String(externalId).length < 4) fraudFlags.push('weak_external_id');
    if (offer && amountNum != null && Number(offer.payoutAmount) > 0 && Number(amountNum) > Number(offer.payoutAmount) * 5) fraudFlags.push('amount_anomaly');

    const event = await prisma.event.create({
      data: {
        trackingLinkId: link.id,
        eventType,
        amount: amountNum ?? (offer ? Number(offer.payoutAmount) : 0),
        currency: 'RUB',
        status: fraudFlags.includes('blacklisted_source') ? 'rejected' : 'pending',
        externalId: externalId || null,
        source: source || null,
        subid1: subid1 || null,
        subid2: subid2 || null,
        subid3: subid3 || null,
        subid4: subid4 || null,
        subid5: subid5 || null,
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
        ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket.remoteAddress || null),
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
        deviceFingerprint,
        fraudScore: fraudFlags.length ? Math.min(100, fraudFlags.length * 25) : 0,
        fraudFlags,
      },
    });
    if (fraudFlags.length) {
      const admins = await prisma.user.findMany({
        where: { role: 'admin', status: 'active' },
        select: { id: true },
      });
      await Promise.all(admins.map((a) => createNotification(prisma, {
        userId: a.id,
        type: 'system',
        title: '[FRAUD] Автофлаг события',
        body: 'Оффер: ' + (offer?.title || link.offerId) + '. eventId: ' + event.id + '. Флаги: ' + fraudFlags.join(', ') + '. external_id: ' + (externalId || '—'),
        link: '/admin/moderation.html',
      })));
      if (offer?.supplierId) {
        await createNotification(prisma, {
          userId: offer.supplierId,
          type: 'system',
          title: '[FRAUD] Автофлаг события',
          body: 'Событие отправлено на ручную проверку. eventId: ' + event.id + '. Флаги: ' + fraudFlags.join(', ') + '. source: ' + (source || '—') + '. subid: ' + [subid1, subid2, subid3, subid4, subid5].filter(Boolean).join('|'),
          link: '/dashboard-supplier-leads.html',
        });
      }
    }
    await createNotification(prisma, {
      userId: link.affiliateId,
      type: 'system',
      title: 'Событие получено',
      body: 'Принято событие ' + eventType + (externalId ? ('. external_id: ' + String(externalId)) : '') + '. Статус: pending.' + (fraudFlags.length ? (' Автофлаги: ' + fraudFlags.join(', ')) : ''),
      link: '/analytics.html',
    });
    const webhookUrl = process.env.POSTBACK_QUEUE_WEBHOOK_URL || '';
    if (/^https?:\/\//i.test(webhookUrl)) {
      await prisma.webhookDelivery.create({
        data: {
          eventId: event.id,
          url: webhookUrl,
          payload: JSON.stringify({
            eventId: event.id,
            token: token || null,
            eventType,
            externalId: externalId || null,
            status: event.status,
            amount: event.amount != null ? Number(event.amount) : null,
            source: source || null,
            subids: [subid1, subid2, subid3, subid4, subid5].filter(Boolean),
            utm: {
              source: utmSource,
              medium: utmMedium,
              campaign: utmCampaign,
              term: utmTerm,
              content: utmContent,
            },
          }),
          attempts: 0,
          ok: false,
          nextRetryAt: new Date(),
        },
      });
    }
    res.status(201).json({ ...event, fraudFlags, source: source || null, subids: [subid1, subid2, subid3, subid4, subid5].filter(Boolean) });
  } catch (e) {
    console.error('POST /api/events:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
