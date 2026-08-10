# Agroserver → FactPay (Apify)

Чтобы объявления **тянулись автоматически раз в сутки**, нужен парсер снаружи (на Agroserver капча). Рекомендуемый путь — Apify Actor + webhook на ваш API.

## 1. Создайте Actor в Apify

1. Зарегистрируйтесь на [apify.com](https://apify.com/).
2. Create new → Actor from scratch (Node.js + Playwright / Crawlee).
3. Вставьте код из `actor-main.js` (или адаптируйте под свой шаблон).
4. Input пример:

```json
{
  "categoryUrl": "https://agroserver.ru/organo-mineralnye-udobreniya/",
  "maxItems": 10
}
```

5. Прогоните вручную. Если сайт показал капчу — включите Apify Proxy (residential) или решайте капчу в Actor.

## 2. Автозалив на FactPay (проще всего)

В Actor → **Integrations → Webhooks** → событие **Run succeeded**:

- URL: `https://tovarkin.com/api/integrations/listings/import`
- Header: `x-listings-import-secret: ВАШ_LISTINGS_IMPORT_SECRET`
- Payload: оставьте default (там будет `resource.defaultDatasetId`)

В `.env` на сервере:

```env
LISTINGS_IMPORT_SECRET=ваш-секрет
APIFY_TOKEN=apify_api_...
```

`LISTINGS_FEED_URL` **не обязателен**, если webhook шлёт `datasetId`.

Расписание: в Apify Actor → Schedules → каждый день.

## 3. Альтернатива: наш cron тянет dataset

Если Actor уже пишет в постоянный dataset:

```env
LISTINGS_IMPORT_ENABLED=true
REDIS_URL=redis://redis:6379
APIFY_TOKEN=apify_api_...
LISTINGS_APIFY_DATASET_ID=xxxxx
LISTINGS_IMPORT_CRON=0 3 * * *
```

Или чтобы **наш** cron сам запускал Actor:

```env
LISTINGS_IMPORT_ENABLED=true
REDIS_URL=redis://redis:6379
APIFY_TOKEN=apify_api_...
LISTINGS_APIFY_ACTOR_ID=username~agroserver-listings
LISTINGS_CATEGORY_URL=https://agroserver.ru/organo-mineralnye-udobreniya/
LISTINGS_MAX_ITEMS=10
```

Токен: Apify → Settings → Integrations → API tokens.
