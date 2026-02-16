/**
 * Одноразовый эндпоинт для восстановления админа и наполнения каталога офферов в БД сервера.
 * Защищён секретом из env RESTORE_ADMIN_SECRET.
 */
import { Router, Request, Response } from 'express';
import { PrismaClient, UserRole, OfferStatus, PayoutModel } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const router = Router();
const prisma = new PrismaClient();
const SECRET = process.env.RESTORE_ADMIN_SECRET;

router.post('/', async (_req: Request, res: Response) => {
  if (!SECRET) {
    res.status(501).json({ error: 'RESTORE_ADMIN_SECRET не задан на сервере' });
    return;
  }
  const provided = _req.headers['x-restore-secret'] ?? _req.body?.secret;
  if (provided !== SECRET) {
    res.status(403).json({ error: 'Неверный секрет' });
    return;
  }
  try {
    const adminPasswordHash = await bcrypt.hash('kAlkiujn7', 10);
    const adminUser = await prisma.user.upsert({
      where: { email: 'ya@ya.ru' },
      update: { passwordHash: adminPasswordHash, role: UserRole.admin, status: 'active' },
      create: {
        email: 'ya@ya.ru',
        passwordHash: adminPasswordHash,
        role: UserRole.admin,
        name: 'Администратор',
        status: 'active',
      },
    });

    const supplierPasswordHash = await bcrypt.hash('TestPassword123!', 10);
    const catProducts = await prisma.category.upsert({
      where: { slug: 'products' },
      update: {},
      create: { name: 'Продукты питания', slug: 'products', description: 'Офферы FMCG и HoReCa', isActive: true },
    });
    const catConstruction = await prisma.category.upsert({
      where: { slug: 'construction' },
      update: {},
      create: { name: 'Стройматериалы', slug: 'construction', description: 'Строительство и ремонт', isActive: true },
    });
    const catAuto = await prisma.category.upsert({
      where: { slug: 'auto' },
      update: {},
      create: { name: 'Автозапчасти', slug: 'auto', description: 'Запчасти, шины', isActive: true },
    });
    const catElectronics = await prisma.category.upsert({
      where: { slug: 'electronics' },
      update: {},
      create: { name: 'Электроника и техника', slug: 'electronics', description: 'Бытовая техника', isActive: true },
    });
    const catClothing = await prisma.category.upsert({
      where: { slug: 'clothing' },
      update: {},
      create: { name: 'Одежда и обувь', slug: 'clothing', description: 'Опт и дропшиппинг', isActive: true },
    });
    const catOther = await prisma.category.upsert({
      where: { slug: 'other' },
      update: {},
      create: { name: 'Другое', slug: 'other', description: 'Прочие офферы', isActive: true },
    });

    const supplier = await prisma.user.upsert({
      where: { email: 'supplier@example.com' },
      update: {},
      create: {
        email: 'supplier@example.com',
        passwordHash: supplierPasswordHash,
        role: UserRole.supplier,
        name: 'Иван Поставщиков',
        companyName: 'ООО СтройОпт',
        status: 'active',
      },
    });
    await prisma.supplierProfile.upsert({
      where: { userId: supplier.id },
      update: {},
      create: {
        userId: supplier.id,
        legalEntity: 'ООО "СтройОпт"',
        inn: '7700123456',
        website: 'https://example.com',
        payoutTerms: 'Выплаты еженедельно, минимум 1000 ₽',
      },
    });

    const seedOffers = [
      { id: 'seed-offer-1', catId: catConstruction.id, title: 'Стройматериалы оптом — CPA 500 ₽ за заказ', description: 'Приведи покупателя, оплата за заказ 500 ₽. Оптовые поставки по всей РФ.', targetGeo: 'Российская Федерация', amount: 500, url: 'https://example.com/construction' },
      { id: 'seed-offer-2', catId: catProducts.id, title: 'Продукты питания оптом — CPA 300 ₽', description: 'Оптовые поставки для HoReCa и розницы. Москва, СПб.', targetGeo: 'Москва, Санкт-Петербург', amount: 300, url: 'https://example.com/food' },
      { id: 'seed-offer-3', catId: catConstruction.id, title: 'Черновые материалы — CPA 400 ₽', description: 'Цемент, сухие смеси, доставка по РФ.', targetGeo: 'Российская Федерация', amount: 400, url: 'https://example.com/materials' },
      { id: 'seed-offer-4', catId: catAuto.id, title: 'Автозапчасти и шины — CPA 350 ₽', description: 'Запчасти, шины, автохимия. Вся РФ.', targetGeo: 'Вся РФ', amount: 350, url: 'https://example.com/auto' },
      { id: 'seed-offer-5', catId: catElectronics.id, title: 'Бытовая техника оптом — CPA 600 ₽', description: 'Крупная и мелкая бытовая техника для розницы и HoReCa.', targetGeo: 'Москва, МО, РФ', amount: 600, url: 'https://example.com/electronics' },
      { id: 'seed-offer-6', catId: catClothing.id, title: 'Одежда и обувь оптом — CPA 250 ₽', description: 'Дропшиппинг и опт. Женская, мужская, детская одежда.', targetGeo: 'Российская Федерация', amount: 250, url: 'https://example.com/clothing' },
    ];
    for (const o of seedOffers) {
      await prisma.offer.upsert({
        where: { id: o.id },
        update: { status: OfferStatus.active },
        create: {
          id: o.id,
          supplierId: supplier.id,
          categoryId: o.catId,
          title: o.title,
          description: o.description,
          targetGeo: o.targetGeo,
          payoutModel: PayoutModel.CPA,
          payoutAmount: o.amount,
          currency: 'RUB',
          landingUrl: o.url,
          status: OfferStatus.active,
        },
      });
      await prisma.offerCategory.upsert({
        where: { offerId_categoryId: { offerId: o.id, categoryId: o.catId } },
        create: { offerId: o.id, categoryId: o.catId },
        update: {},
      });
    }

    res.json({ ok: true, email: adminUser.email, offers: seedOffers.length });
  } catch (e) {
    console.error('restore-admin:', e);
    res.status(500).json({ error: 'Ошибка при восстановлении админа и офферов' });
  }
});

export default router;
