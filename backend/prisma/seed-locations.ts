/**
 * Сид справочника локаций: Россия → федеральные округа → регионы → города.
 * Данные: все 8 ФО, все субъекты РФ, города (админцентры + крупные).
 * Запуск: npm run db:seed-locations
 *
 * При первом запуске создаёт дерево. Если страна «Россия» уже есть — пропуск.
 * Для полной перезагрузки: удалить записи из offer_locations и locations, затем снова запустить сид.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { RUSSIA_TREE } from './data/locations-ru';

const prisma = new PrismaClient();

type LocationType = 'country' | 'federal_district' | 'region' | 'city';

interface LocationRow {
  name: string;
  type: LocationType;
  fullName?: string;
  code?: string;
  children?: LocationRow[];
}

function levelByType(type: LocationType): number {
  switch (type) {
    case 'country': return 1;
    case 'federal_district': return 2;
    case 'region': return 3;
    case 'city': return 4;
    default: return 1;
  }
}

async function createLocation(
  parentId: string | null,
  row: LocationRow,
  level: number
): Promise<string> {
  const fullName = row.fullName ?? (row.type === 'city' ? row.name : null);
  const loc = await prisma.location.create({
    data: {
      parentId,
      name: row.name,
      type: row.type,
      fullName,
      level,
      isActive: true,
      code: row.code ?? undefined,
    },
  });
  const id = loc.id;
  if (row.children?.length) {
    const nextLevel = level + 1;
    for (const child of row.children) {
      await createLocation(id, child, nextLevel);
    }
  }
  return id;
}

async function main() {
  const existing = await prisma.location.findFirst({ where: { type: 'country', name: 'Россия' } });
  if (existing) {
    const count = await prisma.location.count();
    console.log('Россия уже загружена. Всего локаций:', count);
    return;
  }
  console.log('Загрузка справочника: Россия, федеральные округа, регионы, города...');
  for (const country of RUSSIA_TREE) {
    await createLocation(null, country, levelByType(country.type));
    console.log('Создана корневая локация:', country.name);
  }
  const count = await prisma.location.count();
  console.log('Готово. Всего локаций:', count);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
