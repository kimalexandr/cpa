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
      },
    });
    res.redirect(302, link.offer.landingUrl);
  } catch (e) {
    console.error('GET /t/:token:', e);
    res.status(500).send('Ошибка');
  }
});

export default router;
