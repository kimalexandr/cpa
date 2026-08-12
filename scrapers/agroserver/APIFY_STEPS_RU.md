# Apify: что куда вставить (по шагам)

Код парсера: `actor-main.ts` в этой папке.

## В Apify Console (уже открыт Actor)

### 1) Файл `src/main.ts`
1. Слева откройте **`src/main.ts`**
2. Выделите **весь** код (Ctrl+A) → Delete
3. Откройте у себя файл репозитория:  
   `scrapers/agroserver/actor-main.ts`
4. Скопируйте **весь** файл и вставьте в `src/main.ts`
5. Нажмите **Save**

### 2) Файл `package.json` (важно)
1. Слева откройте **`package.json`**
2. В `dependencies` должно быть примерно так (имена важны):

```json
{
  "dependencies": {
    "apify": "^3.4.0",
    "crawlee": "^3.13.0",
    "playwright": "^1.49.0"
  }
}
```

Уберите `@crawlee/cheerio`, если есть.  
Save.

### 3) Build
Внизу зелёная кнопка **Build** → дождитесь успеха (вкладка **Builds**).

### 4) Первый запуск
1. Вкладка **Standby / Input** или кнопка **Start**
2. Input JSON:

```json
{
  "categoryUrl": "https://agroserver.ru/organo-mineralnye-udobreniya/",
  "maxItems": 10
}
```

3. Start → дождитесь **Succeeded**
4. Откройте **Dataset** у этого Run — должны быть строки с `title`, `url`, `externalId`

Если ошибка про капчу — нужен Apify Proxy RESIDENTIAL (часто платный план; на $0 может не хватить).

### 5) Webhook на FactPay
1. Actor → **Integrations** → Webhooks → Add
2. Event: **Run succeeded**
3. URL: `https://tovarkin.com/api/integrations/listings/import`
4. Header:  
   `x-listings-import-secret` = тот же секрет, что в `/root/cpa/backend/.env` → `LISTINGS_IMPORT_SECRET`
5. В `.env` на сервере также нужен `APIFY_TOKEN=...` (Settings → Integrations в Apify)
6. `cd /root/cpa/backend && docker-compose up -d --build`

### 6) Раз в сутки
Actor → **Schedules** → каждый день, тот же Input JSON.
