import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/:token', async (req: Request, res: Response) => {
  try {
    const link = await prisma.trackingLink.findUnique({
      where: { token: req.params.token },
      include: { offer: true },
    });
    if (!link) {
      res.status(404).send('Ссылка не найдена');
      return;
    }
    await prisma.event.create({
      data: {
        trackingLinkId: link.id,
        eventType: 'click',
        status: 'approved',
        source: req.query.source ? String(req.query.source) : null,
        subid1: req.query.subid1 ? String(req.query.subid1) : null,
        subid2: req.query.subid2 ? String(req.query.subid2) : null,
        subid3: req.query.subid3 ? String(req.query.subid3) : null,
        subid4: req.query.subid4 ? String(req.query.subid4) : null,
        subid5: req.query.subid5 ? String(req.query.subid5) : null,
        utmSource: req.query.utm_source ? String(req.query.utm_source) : null,
        utmMedium: req.query.utm_medium ? String(req.query.utm_medium) : null,
        utmCampaign: req.query.utm_campaign ? String(req.query.utm_campaign) : null,
        utmTerm: req.query.utm_term ? String(req.query.utm_term) : null,
        utmContent: req.query.utm_content ? String(req.query.utm_content) : null,
        ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket.remoteAddress || null),
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
        deviceFingerprint: req.query.df ? String(req.query.df) : null,
      },
    });
    res.redirect(302, link.offer.landingUrl);
  } catch (e) {
    console.error('GET /t/:token:', e);
    res.status(500).send('Ошибка');
  }
});

export default router;
