/**
 * Сид справочника локаций: Россия → федеральные округа → регионы → города.
 * Запуск: npm run db:seed-locations
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type LocationType = 'country' | 'federal_district' | 'region' | 'city';

interface LocationRow {
  name: string;
  type: LocationType;
  fullName?: string;
  code?: string;
  children?: LocationRow[];
}

// Россия: 8 федеральных округов, по 2–4 региона на округ, по 2–5 городов на регион
const RUSSIA_TREE: LocationRow[] = [
  {
    name: 'Россия',
    type: 'country',
    code: 'RU',
    children: [
      {
        name: 'Центральный федеральный округ',
        type: 'federal_district',
        children: [
          { name: 'Москва', type: 'region', code: '77', children: [{ name: 'Москва', type: 'city', fullName: 'Москва (Москва)' }] },
          { name: 'Московская область', type: 'region', code: '50', children: [{ name: 'Подольск', type: 'city', fullName: 'Подольск (Московская область)' }, { name: 'Химки', type: 'city', fullName: 'Химки (Московская область)' }, { name: 'Балашиха', type: 'city', fullName: 'Балашиха (Московская область)' }] },
          { name: 'Воронежская область', type: 'region', code: '36', children: [{ name: 'Воронеж', type: 'city', fullName: 'Воронеж (Воронежская область)' }, { name: 'Борисоглебск', type: 'city', fullName: 'Борисоглебск (Воронежская область)' }] },
        ],
      },
      {
        name: 'Северо-Западный федеральный округ',
        type: 'federal_district',
        children: [
          { name: 'Санкт-Петербург', type: 'region', code: '78', children: [{ name: 'Санкт-Петербург', type: 'city', fullName: 'Санкт-Петербург (Санкт-Петербург)' }] },
          { name: 'Ленинградская область', type: 'region', code: '47', children: [{ name: 'Выборг', type: 'city', fullName: 'Выборг (Ленинградская область)' }, { name: 'Гатчина', type: 'city', fullName: 'Гатчина (Ленинградская область)' }] },
        ],
      },
      {
        name: 'Южный федеральный округ',
        type: 'federal_district',
        children: [
          { name: 'Краснодарский край', type: 'region', code: '23', children: [{ name: 'Краснодар', type: 'city', fullName: 'Краснодар (Краснодарский край)' }, { name: 'Сочи', type: 'city', fullName: 'Сочи (Краснодарский край)' }, { name: 'Новороссийск', type: 'city', fullName: 'Новороссийск (Краснодарский край)' }] },
          { name: 'Ростовская область', type: 'region', code: '61', children: [{ name: 'Ростов-на-Дону', type: 'city', fullName: 'Ростов-на-Дону (Ростовская область)' }, { name: 'Таганрог', type: 'city', fullName: 'Таганрог (Ростовская область)' }] },
        ],
      },
      {
        name: 'Северо-Кавказский федеральный округ',
        type: 'federal_district',
        children: [
          { name: 'Ставропольский край', type: 'region', code: '26', children: [{ name: 'Ставрополь', type: 'city', fullName: 'Ставрополь (Ставропольский край)' }, { name: 'Пятигорск', type: 'city', fullName: 'Пятигорск (Ставропольский край)' }] },
        ],
      },
      {
        name: 'Приволжский федеральный округ',
        type: 'federal_district',
        children: [
          { name: 'Нижегородская область', type: 'region', code: '52', children: [{ name: 'Нижний Новгород', type: 'city', fullName: 'Нижний Новгород (Нижегородская область)' }, { name: 'Дзержинск', type: 'city', fullName: 'Дзержинск (Нижегородская область)' }] },
          { name: 'Республика Татарстан', type: 'region', code: '16', children: [{ name: 'Казань', type: 'city', fullName: 'Казань (Республика Татарстан)' }, { name: 'Набережные Челны', type: 'city', fullName: 'Набережные Челны (Республика Татарстан)' }] },
        ],
      },
      {
        name: 'Уральский федеральный округ',
        type: 'federal_district',
        children: [
          { name: 'Свердловская область', type: 'region', code: '66', children: [{ name: 'Екатеринбург', type: 'city', fullName: 'Екатеринбург (Свердловская область)' }, { name: 'Нижний Тагил', type: 'city', fullName: 'Нижний Тагил (Свердловская область)' }] },
          { name: 'Тюменская область', type: 'region', code: '72', children: [{ name: 'Тюмень', type: 'city', fullName: 'Тюмень (Тюменская область)' }, { name: 'Тобольск', type: 'city', fullName: 'Тобольск (Тюменская область)' }] },
        ],
      },
      {
        name: 'Сибирский федеральный округ',
        type: 'federal_district',
        children: [
          { name: 'Новосибирская область', type: 'region', code: '54', children: [{ name: 'Новосибирск', type: 'city', fullName: 'Новосибирск (Новосибирская область)' }, { name: 'Бердск', type: 'city', fullName: 'Бердск (Новосибирская область)' }] },
          { name: 'Красноярский край', type: 'region', code: '24', children: [{ name: 'Красноярск', type: 'city', fullName: 'Красноярск (Красноярский край)' }, { name: 'Норильск', type: 'city', fullName: 'Норильск (Красноярский край)' }] },
        ],
      },
      {
        name: 'Дальневосточный федеральный округ',
        type: 'federal_district',
        children: [
          { name: 'Амурская область', type: 'region', code: '28', children: [{ name: 'Благовещенск', type: 'city', fullName: 'Благовещенск (Амурская область)' }, { name: 'Белогорск', type: 'city', fullName: 'Белогорск (Амурская область)' }] },
          { name: 'Приморский край', type: 'region', code: '25', children: [{ name: 'Владивосток', type: 'city', fullName: 'Владивосток (Приморский край)' }, { name: 'Находка', type: 'city', fullName: 'Находка (Приморский край)' }] },
          { name: 'Хабаровский край', type: 'region', code: '27', children: [{ name: 'Хабаровск', type: 'city', fullName: 'Хабаровск (Хабаровский край)' }, { name: 'Комсомольск-на-Амуре', type: 'city', fullName: 'Комсомольск-на-Амуре (Хабаровский край)' }] },
        ],
      },
    ],
  },
];

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
    console.log('Russia already seeded. Locations total:', await prisma.location.count());
    return;
  }
  for (const country of RUSSIA_TREE) {
    const rootId = await createLocation(null, country, levelByType(country.type));
    console.log('Created root:', country.name, rootId);
  }
  const count = await prisma.location.count();
  console.log('Locations total:', count);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
