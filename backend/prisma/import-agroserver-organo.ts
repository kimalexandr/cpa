/**
 * Разовый импорт top-10 из agroserver-organo.json.
 * Постоянный путь: POST /api/integrations/listings/import (см. listings-import).
 *
 * Запуск: npm run db:import-agro
 */
import { OfferStatus, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { upsertExternalListings } from '../src/lib/listings-import';

const prisma = new PrismaClient();

async function main() {
  const dataPath = path.join(__dirname, 'data', 'agroserver-organo.json');
  const items = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const result = await upsertExternalListings(prisma, items, {
    source: 'agroserver.ru',
    idPrefix: 'agro',
    categorySlug: 'agrochemistry',
    categoryName: 'Агрохимия',
    categoryExternalRef: 'agroserver:organo-mineralnye-udobreniya',
    status: OfferStatus.active,
    payoutAmount: 300,
  });
  console.log(result);
  for (const id of result.offerIds) console.log('OK', id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
