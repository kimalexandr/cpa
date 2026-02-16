/**
 * Сид тестовых данных по BACKEND_SPEC.md:
 * 1–2 категории, несколько офферов, один аффилиат, один поставщик.
 */
import { PrismaClient, UserRole, OfferStatus, PayoutModel } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);

  // --- Категории ---
  const catFood = await prisma.category.upsert({
    where: { slug: 'products' },
    update: {},
    create: {
      name: 'Продукты питания',
      slug: 'products',
      description: 'Офферы по оптовым поставкам FMCG и HoReCa',
      isActive: true,
      level: 1,
    },
  });

  const catConstruction = await prisma.category.upsert({
    where: { slug: 'construction' },
    update: {},
    create: {
      name: 'Стройматериалы',
      slug: 'construction',
      description: 'CPA‑кампании для рынка строительства и ремонта',
      isActive: true,
      level: 1,
    },
  });

  const catAuto = await prisma.category.upsert({
    where: { slug: 'auto' },
    update: {},
    create: {
      name: 'Автозапчасти',
      slug: 'auto',
      description: 'Запчасти, шины, автохимия',
      isActive: true,
      level: 1,
    },
  });

  const catElectronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: {
      name: 'Электроника и техника',
      slug: 'electronics',
      description: 'Бытовая и цифровая техника, гаджеты',
      isActive: true,
      level: 1,
    },
  });

  const catClothing = await prisma.category.upsert({
    where: { slug: 'clothing' },
    update: {},
    create: {
      name: 'Одежда и обувь',
      slug: 'clothing',
      description: 'Опт и дропшиппинг одежды и обуви',
      isActive: true,
      level: 1,
    },
  });

  const catOther = await prisma.category.upsert({
    where: { slug: 'other' },
    update: {},
    create: {
      name: 'Другое',
      slug: 'other',
      description: 'Прочие офферы',
      isActive: true,
      level: 1,
    },
  });

  console.log('Categories:', catFood.slug, catConstruction.slug, catAuto.slug, catElectronics.slug, catClothing.slug, catOther.slug);

  // --- Админ ---
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
  console.log('Admin:', adminUser.email);

  // --- Поставщик ---
  const supplier = await prisma.user.upsert({
    where: { email: 'supplier@example.com' },
    update: {},
    create: {
      email: 'supplier@example.com',
      passwordHash,
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
      kpp: '770001001',
      website: 'https://example.com',
      payoutTerms: 'Выплаты еженедельно, минимум 1000 ₽',
    },
  });

  console.log('Supplier:', supplier.email);

  // --- Аффилиат ---
  const affiliate = await prisma.user.upsert({
    where: { email: 'affiliate@example.com' },
    update: {},
    create: {
      email: 'affiliate@example.com',
      passwordHash,
      role: UserRole.affiliate,
      name: 'Мария Партнёр',
      status: 'active',
    },
  });

  await prisma.affiliateProfile.upsert({
    where: { userId: affiliate.id },
    update: {},
    create: {
      userId: affiliate.id,
      trafficSources: 'SEO, Telegram, контекст',
      payoutDetails: '{"method":"card","card":"****1234"}',
    },
  });

  console.log('Affiliate:', affiliate.email);

  // --- Офферы (от поставщика) ---
  const offer1 = await prisma.offer.upsert({
    where: { id: 'seed-offer-1' },
    update: {},
    create: {
      id: 'seed-offer-1',
      supplierId: supplier.id,
      categoryId: catConstruction.id,
      title: 'Стройматериалы оптом — CPA 500 ₽ за заказ',
      description: 'Приведи покупателя, оплата за заказ 500 ₽. Работаем с оптовыми поставками по всей РФ.',
      targetGeo: 'Российская Федерация',
      payoutModel: PayoutModel.CPA,
      payoutAmount: 500,
      currency: 'RUB',
      landingUrl: 'https://example.com/construction',
      status: OfferStatus.active,
    },
  });

  const offer2 = await prisma.offer.upsert({
    where: { id: 'seed-offer-2' },
    update: {},
    create: {
      id: 'seed-offer-2',
      supplierId: supplier.id,
      categoryId: catFood.id,
      title: 'Продукты питания оптом — CPA 300 ₽',
      description: 'Оптовые поставки для HoReCa и розницы. Москва, СПб.',
      targetGeo: 'Москва, Санкт-Петербург',
      payoutModel: PayoutModel.CPA,
      payoutAmount: 300,
      currency: 'RUB',
      landingUrl: 'https://example.com/food',
      status: OfferStatus.active,
    },
  });

  const offer3 = await prisma.offer.upsert({
    where: { id: 'seed-offer-3' },
    update: { status: OfferStatus.active },
    create: {
      id: 'seed-offer-3',
      supplierId: supplier.id,
      categoryId: catConstruction.id,
      title: 'Черновые материалы — CPA 400 ₽',
      description: 'Цемент, сухие смеси, доставка по РФ.',
      targetGeo: 'Российская Федерация',
      payoutModel: PayoutModel.CPA,
      payoutAmount: 400,
      currency: 'RUB',
      landingUrl: 'https://example.com/materials',
      status: OfferStatus.active,
    },
  });

  const offer4 = await prisma.offer.upsert({
    where: { id: 'seed-offer-4' },
    update: {},
    create: {
      id: 'seed-offer-4',
      supplierId: supplier.id,
      categoryId: catAuto.id,
      title: 'Автозапчасти и шины — CPA 350 ₽',
      description: 'Запчасти, шины, автохимия. Регионы: вся РФ.',
      targetGeo: 'Вся РФ',
      payoutModel: PayoutModel.CPA,
      payoutAmount: 350,
      currency: 'RUB',
      landingUrl: 'https://example.com/auto',
      status: OfferStatus.active,
    },
  });

  const offer5 = await prisma.offer.upsert({
    where: { id: 'seed-offer-5' },
    update: {},
    create: {
      id: 'seed-offer-5',
      supplierId: supplier.id,
      categoryId: catElectronics.id,
      title: 'Бытовая техника оптом — CPA 600 ₽',
      description: 'Крупная и мелкая бытовая техника для розницы и HoReCa.',
      targetGeo: 'Москва, МО, РФ',
      payoutModel: PayoutModel.CPA,
      payoutAmount: 600,
      currency: 'RUB',
      landingUrl: 'https://example.com/electronics',
      status: OfferStatus.active,
    },
  });

  const offer6 = await prisma.offer.upsert({
    where: { id: 'seed-offer-6' },
    update: {},
    create: {
      id: 'seed-offer-6',
      supplierId: supplier.id,
      categoryId: catClothing.id,
      title: 'Одежда и обувь оптом — CPA 250 ₽',
      description: 'Дропшиппинг и опт. Женская, мужская, детская одежда.',
      targetGeo: 'Российская Федерация',
      payoutModel: PayoutModel.CPA,
      payoutAmount: 250,
      currency: 'RUB',
      landingUrl: 'https://example.com/clothing',
      status: OfferStatus.active,
    },
  });

  const offerCategoryPairs: { offerId: string; categoryId: string }[] = [
    { offerId: offer1.id, categoryId: catConstruction.id },
    { offerId: offer2.id, categoryId: catFood.id },
    { offerId: offer3.id, categoryId: catConstruction.id },
    { offerId: offer4.id, categoryId: catAuto.id },
    { offerId: offer5.id, categoryId: catElectronics.id },
    { offerId: offer6.id, categoryId: catClothing.id },
  ];
  for (const p of offerCategoryPairs) {
    await prisma.offerCategory.upsert({
      where: { offerId_categoryId: { offerId: p.offerId, categoryId: p.categoryId } },
      create: p,
      update: {},
    });
  }
  console.log('Offers:', offer1.id, offer2.id, offer3.id, offer4.id, offer5.id, offer6.id);

  // --- Заявка аффилиата на оффер и трекинг-ссылка (одобренная) ---
  const participation = await prisma.affiliateOfferParticipation.upsert({
    where: {
      offerId_affiliateId: { offerId: offer1.id, affiliateId: affiliate.id },
    },
    update: {},
    create: {
      offerId: offer1.id,
      affiliateId: affiliate.id,
      status: 'approved',
    },
  });

  const token = 'test-token-' + affiliate.id.slice(0, 8);
  await prisma.trackingLink.upsert({
    where: { token },
    update: {},
    create: {
      offerId: offer1.id,
      affiliateId: affiliate.id,
      token,
    },
  });

  console.log('Participation approved, tracking link created:', token);

  // --- Статические страницы (заглушки) ---
  const pages = [
    { slug: 'policy', title: 'Политика конфиденциальности', content: 'Текст политики конфиденциальности.' },
    { slug: 'terms', title: 'Пользовательское соглашение', content: 'Текст пользовательского соглашения.' },
    { slug: 'personal-data', title: 'Обработка персональных данных', content: 'Текст об обработке ПД.' },
  ];

  for (const p of pages) {
    await prisma.staticPage.upsert({
      where: { slug_language: { slug: p.slug, language: 'ru' } },
      update: { title: p.title, content: p.content },
      create: { slug: p.slug, title: p.title, content: p.content, language: 'ru' },
    });
  }

  console.log('Static pages created.');
  console.log('Seed finished. Login: affiliate@example.com / supplier@example.com, password: TestPassword123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
