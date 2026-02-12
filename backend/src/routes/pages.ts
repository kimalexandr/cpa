import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const lang = (req.query.lang as string) || 'ru';
    const page = await prisma.staticPage.findUnique({
      where: { slug_language: { slug: req.params.slug, language: lang } },
    });
    if (!page) {
      res.status(404).json({ error: 'Страница не найдена' });
      return;
    }
    res.json({ slug: page.slug, title: page.title, content: page.content });
  } catch (e) {
    console.error('GET /api/pages/:slug:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
