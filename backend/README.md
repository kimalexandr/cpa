# RealCPA Hub — Backend

Бэкенд с REST API: БД (PostgreSQL + Prisma), миграции, сид, JWT-авторизация, Docker.

## Требования

- Node.js 20+
- Docker и Docker Compose (для БД)

## Быстрый старт

### 1. Переменные окружения

```bash
cp .env.example .env
# При необходимости отредактируйте DATABASE_URL
```

### 2. База данных (Docker)

```bash
docker-compose up -d db
```

Дождитесь готовности PostgreSQL (healthcheck). БД: `realcpa`, пользователь/пароль: `realcpa`, порт: `5432`.

### 3. Зависимости и Prisma

```bash
npm install
npx prisma generate
```

### 4. Миграции

```bash
npm run db:migrate
# или для разработки с созданием миграций:
# npm run db:migrate:dev
```

### 5. Сид (тестовые данные)

```bash
npm run db:seed
```

Создаются: 2 категории, поставщик `supplier@example.com`, аффилиат `affiliate@example.com`, офферы, участие и трекинг-ссылка. Пароль для входа: `TestPassword123!`.

### 6. Запуск API-сервера

```bash
npm run dev
# или
npm run build && npm start
```

Сервер слушает порт 3000 (или `PORT` из `.env`). Фронт в корне проекта подключается к `http://localhost:3000` (или задайте `window.REALCPA_API_URL` перед загрузкой `api.js`).

## Полный стек в Docker

```bash
docker-compose up -d
```

Поднимаются сервисы `db` и `app`. Миграции и сид в контейнере выполняются вручную:

```bash
docker-compose run --rm app npm run db:migrate
docker-compose run --rm app npm run db:seed
```

## Полезные команды

| Команда | Описание |
|--------|----------|
| `npm run db:generate` | Генерация Prisma Client |
| `npm run db:migrate` | Применить миграции (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Разработка миграций (`prisma migrate dev`) |
| `npm run db:seed` | Заполнить БД тестовыми данными |
| `npm run db:studio` | Открыть Prisma Studio |

## API

- **POST /api/auth/register** — регистрация (email, password, role: affiliate|supplier, name, companyName, trafficSources, legalEntity, inn)
- **POST /api/auth/login** — вход (email, password) → accessToken, refreshToken, user
- **POST /api/auth/refresh** — обновление access по refreshToken
- **GET /api/me** — текущий пользователь (Authorization: Bearer)
- **GET /api/categories** — список активных категорий
- **GET /api/offers** — каталог офферов (?category=slug&status=active&search=)
- **GET /api/offers/:id** — карточка оффера
- **POST /api/supplier/offers** — создание оффера (поставщик)
- **PATCH /api/supplier/offers/:id**, **PATCH /api/supplier/offers/:id/status**
- **GET /api/supplier/offers/:id/affiliates** — заявки по офферу
- **PATCH /api/supplier/affiliate-participation/:id** — approve/reject заявки
- **POST /api/affiliate/offers/:id/join** — заявка на участие (партнёр)
- **GET /api/affiliate/my-offers** — мои подключения и трекинг-ссылки
- **GET /t/:token** — редирект по партнёрской ссылке (фиксация клика)
- **POST /api/events** — вебхук лид/сейл (token или tracking_link_id, event_type, amount, external_id)
- **GET /api/pages/:slug** — статические страницы (policy, terms, personal-data)

## Структура

- `prisma/schema.prisma` — схема БД
- `prisma/migrations/` — миграции
- `prisma/seed.ts` — сид
- `src/index.ts` — запуск HTTP-сервера
- `src/app.ts` — Express, CORS, роуты
- `src/routes/` — auth, me, categories, offers, supplier, affiliate, tracking, events, pages
