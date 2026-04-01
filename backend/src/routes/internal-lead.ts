import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

router.post('/', async (req: Request, res: Response) => {
  try {
    const token = req.body?.token ? String(req.body.token).trim() : '';
    const offerId = req.body?.offerId ? String(req.body.offerId).trim() : '';
    const customerName = req.body?.name ? String(req.body.name).trim() : '';
    const customerPhone = req.body?.phone ? String(req.body.phone).trim() : '';
    const comment = req.body?.comment ? String(req.body.comment).trim() : '';
    if (!token || !offerId || !customerName || !customerPhone) {
      return res.status(400).json({ error: 'Передайте token, offerId, name, phone' });
    }
    const link = await prisma.trackingLink.findUnique({
      where: { token },
      include: { offer: { select: { id: true, title: true, payoutAmount: true, status: true, supplierId: true } } },
    });
    if (!link || link.offer.id !== offerId || (link.offer.status !== 'active' && link.offer.status !== 'paused')) {
      return res.status(404).json({ error: 'Оффер не найден или недоступен' });
    }
    const externalId = 'lf_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    const exists = await prisma.event.findFirst({
      where: { trackingLinkId: link.id, externalId },
      select: { id: true },
    });
    if (exists) return res.status(409).json({ error: 'Повторная отправка. Обновите страницу.' });
    const event = await prisma.event.create({
      data: {
        trackingLinkId: link.id,
        eventType: 'lead',
        amount: Number(link.offer.payoutAmount || 0),
        currency: 'RUB',
        status: 'pending',
        externalId,
        source: req.body?.source ? String(req.body.source).slice(0, 255) : 'internal_form',
        subid1: req.body?.subid1 ? String(req.body.subid1).slice(0, 255) : null,
        subid2: req.body?.subid2 ? String(req.body.subid2).slice(0, 255) : null,
        subid3: req.body?.subid3 ? String(req.body.subid3).slice(0, 255) : null,
        subid4: req.body?.subid4 ? String(req.body.subid4).slice(0, 255) : null,
        subid5: req.body?.subid5 ? String(req.body.subid5).slice(0, 255) : null,
        utmSource: req.body?.utm_source ? String(req.body.utm_source).slice(0, 255) : null,
        utmMedium: req.body?.utm_medium ? String(req.body.utm_medium).slice(0, 255) : null,
        utmCampaign: req.body?.utm_campaign ? String(req.body.utm_campaign).slice(0, 255) : null,
        utmTerm: req.body?.utm_term ? String(req.body.utm_term).slice(0, 255) : null,
        utmContent: req.body?.utm_content ? String(req.body.utm_content).slice(0, 255) : null,
        ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket.remoteAddress || null),
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
      },
    });
    await prisma.notification.create({
      data: {
        userId: link.offer.supplierId,
        type: 'system',
        title: 'Новый лид с внутренней формы',
        body: 'Оффер: ' + link.offer.title + '. Имя: ' + customerName + '. Телефон: ' + customerPhone + (comment ? ('. Комментарий: ' + comment) : ''),
        link: '/dashboard-supplier-leads.html',
      },
    });
    return res.status(201).json({ ok: true, eventId: event.id, externalId });
  } catch (e) {
    console.error('POST /api/internal-lead:', e);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
