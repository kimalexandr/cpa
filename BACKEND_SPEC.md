# Техническое задание: бэкенд и БД RealCPA Hub

Укороченное ТЗ для реализации бэкенда и базы данных платформы RealCPA Hub. При необходимости можно детализировать под конкретный стек (Node/Python/Go, PostgreSQL/MySQL и т.д.).

---

## 1. Общая концепция

Нужно реализовать **бэкенд и БД** для платформы **RealCPA Hub** — агрегатора CPA‑офферов в B2B‑секторе (опт: продукты, стройматериалы, автозапчасти и т.п.).

Должны поддерживаться:
- роли и авторизация;
- управление офферами;
- заявки партнёров на участие в офферах;
- трекинг (клики, лиды, заказы);
- статистика и выплаты.

---

## 2. Роли и права

### 2.1 Гость
- Регистрация, вход.
- Просмотр публичного списка офферов (без деталей контактов).

### 2.2 Affiliate (партнёр)
- Просмотр каталога офферов.
- Подача заявки на участие в оффере (join request).
- Получение своей партнёрской ссылки/ID для трекинга.
- Просмотр личной статистики: клики, лиды, заказы, выплаты.
- Управление своим профилем, реквизитами для выплат.

### 2.3 Поставщик
- Создание и редактирование своих офферов.
- Модерация заявок аффилиатов на участие в его оффере.
- Просмотр статистики по своим офферам: клики, лиды, конверсия, выплачено.
- Управление статусом офферов (черновик, активен, пауза, завершён).

### 2.4 Администратор
- Полный доступ ко всем пользователям и офферам.
- Модерация и блокировка пользователей и офферов.
- Просмотр агрегированной статистики по платформе.

---

## 3. Модель данных (основные таблицы)

### 3.1 Users
| Поле | Тип | Описание |
|------|-----|----------|
| id | PK | |
| email | string, unique | |
| password_hash | string | |
| role | enum | guest, affiliate, supplier, admin (гость без записи; фактически: affiliate, supplier, admin) |
| name | string | |
| company_name | string | nullable |
| phone | string | nullable |
| country / city | string | nullable |
| status | enum | active, blocked, pending_email_confirmation |
| created_at | timestamp | |
| updated_at | timestamp | |

### 3.2 AffiliateProfile
Для роли affiliate (связь 1–1 с Users).

| Поле | Тип | Описание |
|------|-----|----------|
| user_id | PK, FK → Users.id | |
| payout_details | text/json | реквизиты для выплат |
| traffic_sources | text | |
| notes | text | nullable |

### 3.3 SupplierProfile
Для роли supplier.

| Поле | Тип | Описание |
|------|-----|----------|
| user_id | PK, FK → Users.id | |
| legal_entity | string | юр. лицо |
| inn / kpp / vat_id | string | по необходимости |
| website | string | nullable |
| payout_terms | text | условия оплаты партнёрам |

### 3.4 Categories
Набор вертикалей (продукты, стройматериалы, автозапчасти и т.д.).

| Поле | Тип | Описание |
|------|-----|----------|
| id | PK | |
| name | string | например «Продукты питания» |
| slug | string | unique |
| description | text | nullable |
| is_active | boolean | |

### 3.5 Offers
| Поле | Тип | Описание |
|------|-----|----------|
| id | PK | |
| supplier_id | FK → Users.id (role = supplier) | |
| category_id | FK → Categories.id | |
| title | string | |
| description | text | |
| target_geo | text/json | страны/регионы |
| payout_model | enum | CPL, CPA, RevShare и т.п. |
| payout_amount | decimal | |
| currency | string | |
| landing_url | string | целевая страница поставщика |
| status | enum | draft, active, paused, closed |
| created_at | timestamp | |
| updated_at | timestamp | |

Дополнительно по ТЗ фронта можно расширить: ставки (несколько действий), условия (cookie lifetime, срок подтверждения, гео, трекинг в приложении), «обратите внимание» (важно/запрещено), требования к источникам трафика (по согласованию / запрещено).

### 3.6 AffiliateOfferParticipation
Заявка/допуск аффилиата к офферу.

| Поле | Тип | Описание |
|------|-----|----------|
| id | PK | |
| offer_id | FK → Offers.id | |
| affiliate_id | FK → Users.id (role = affiliate) | |
| status | enum | pending, approved, rejected, blocked |
| created_at | timestamp | |
| updated_at | timestamp | |

Уникальность: пара (offer_id, affiliate_id) — одна заявка на оффер от одного аффилиата.

### 3.7 TrackingLinks
| Поле | Тип | Описание |
|------|-----|----------|
| id | PK | |
| offer_id | FK → Offers.id | |
| affiliate_id | FK → Users.id | |
| token | string, unique | используется в URL типа `...?aff=TOKEN` или `/t/TOKEN` |
| created_at | timestamp | |

Создаётся после одобрения заявки (AffiliateOfferParticipation.status = approved).

### 3.8 Events
Клики, лиды, заказы.

| Поле | Тип | Описание |
|------|-----|----------|
| id | PK | |
| tracking_link_id | FK → TrackingLinks.id | |
| event_type | enum | click, lead, sale |
| amount | decimal | для sale/оплаченных лидов, nullable |
| currency | string | nullable |
| status | enum | pending, approved, rejected |
| external_id | string | ID заявки/заказа у поставщика, nullable |
| created_at | timestamp | |

### 3.9 Payouts
Выплаты партнёрам.

| Поле | Тип | Описание |
|------|-----|----------|
| id | PK | |
| affiliate_id | FK → Users.id | |
| period_start | date | |
| period_end | date | |
| amount | decimal | |
| currency | string | |
| status | enum | pending, processing, paid, canceled |
| created_at | timestamp | |
| paid_at | timestamp | nullable |

### 3.10 StaticPages / LegalDocs
Для страниц «Политика конфиденциальности», «Пользовательское соглашение» и т.п. (редактирование через админку).

| Поле | Тип | Описание |
|------|-----|----------|
| id | PK | |
| slug | string | policy, terms, personal-data, faq и т.п. |
| title | string | |
| content | text | |
| language | string | ru, en |
| updated_at | timestamp | |

---

## 4. Требования к схеме БД

1. **Реляционная БД** (PostgreSQL или MySQL).
2. Все связи через **внешние ключи**. Каскадное обновление/ограничение удаления — там, где нужно сохранить историю (например, Events не удалять при удалении пользователя; вместо этого — логическое удаление пользователя).
3. **Индексы:**
   - `Users.email` (unique).
   - `Offers.category_id`, `Offers.status`, `Offers.supplier_id`.
   - `AffiliateOfferParticipation.offer_id`, `AffiliateOfferParticipation.affiliate_id`, уникальность (offer_id, affiliate_id).
   - `TrackingLinks.token` (unique), `TrackingLinks.offer_id`, `TrackingLinks.affiliate_id`.
   - `Events.tracking_link_id`, `Events.event_type`, `Events.status`, `Events.created_at`.
   - `Payouts.affiliate_id`, `Payouts.status`.

---

## 5. API (черновой список эндпоинтов)

Формат: **REST/JSON**. Авторизация через **JWT** (access + refresh) или аналогичный механизм.

### 5.1 Auth
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | /api/auth/register | Вход: email, пароль, роль (affiliate/supplier), базовые поля профиля. Выход: пользователь, токены. |
| POST | /api/auth/login | |
| POST | /api/auth/logout | |
| POST | /api/auth/refresh | |

### 5.2 Профиль
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | /api/me | Текущий пользователь. |
| PATCH | /api/me | Обновление профиля. |
| GET/PATCH | /api/me/affiliate-profile | Профиль аффилиата (реквизиты, источники трафика). |
| GET/PATCH | /api/me/supplier-profile | Профиль поставщика. |

### 5.3 Категории и офферы
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | /api/categories | Публично, список активных категорий. |
| GET | /api/offers | Публично. Фильтры: категория, статус=active, поиск по названию. |
| GET | /api/offers/{id} | Публично (без чувствительных данных, например контактов поставщика). |
| POST | /api/supplier/offers | Создание оффера (только поставщик). |
| PATCH | /api/supplier/offers/{id} | Редактирование своего оффера. |
| PATCH | /api/supplier/offers/{id}/status | Смена статуса (draft/active/paused/closed). |

### 5.4 Участие аффилиатов в офферах
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | /api/affiliate/offers/{id}/join | Подать заявку на участие. |
| GET | /api/affiliate/my-offers | Список офферов с участием и статусом (в т.ч. трекинг-ссылки). |
| GET | /api/supplier/offers/{id}/affiliates | Поставщик: заявки по офферу. |
| PATCH | /api/supplier/affiliate-participation/{id} | approve / reject заявки. После approve — создаётся запись в TrackingLinks. |

### 5.5 Трекинг и события
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | /t/{token} | Редирект по партнёрской ссылке: фиксирует событие типа `click`, 302 на Offers.landing_url. |
| POST | /api/events | Вебхук/служебный эндпоинт для регистрации лидов/заказов. Вход: token или tracking_link_id, event_type (lead/sale), amount, external_id. Авторизация: API‑ключ или подпись. |

### 5.6 Статистика и дашборды
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | /api/affiliate/stats | Суммарная статистика по аффилиату: клики, лиды, конверсии, выплаты по периодам. |
| GET | /api/supplier/stats | Статистика по офферам поставщика (клики, лиды, конверсия, выплачено). |
| GET | /api/admin/stats | Агрегированная статистика платформы (офферы, партнёры, выплаченные суммы, конверсия) — для блока «RealCPA Hub в цифрах». |

### 5.7 Админка (при необходимости)
- Управление пользователями (блокировка, смена роли).
- Модерация офферов.
- CRUD для StaticPages (policy, terms, personal-data, faq).

---

## 6. Безопасность и персональные данные

1. Пароли — только **безопасный хеш** (bcrypt, argon2).
2. **Подтверждение e‑mail** через одноразовую ссылку.
3. **Логирование** всех входов и важных действий админов.
4. **Выгрузка/удаление персональных данных** по запросу пользователя (поддержка политики конфиденциальности и «Обработки персональных данных»): экспорт данных пользователя, возможность удаления аккаунта и связанных ПД.

---

## 7. Нефункциональные требования

1. Вся бизнес‑логика — на бэкенде; фронт общается только через JSON API.
2. Возможность развёртывания через **Docker** (docker-compose: app + DB).
3. **Миграции БД** и базовый скрипт создания тестовых данных:
   - 1–2 категории;
   - несколько офферов;
   - один аффилиат и один поставщик для проверки сценариев.

---

## 8. Связь с фронтом

Текущий фронт (HTML/JS) ожидает:
- Каталог офферов с фильтрами (категория, регион, CPA).
- Детальную страницу оффера (KPI, описание, ставки, условия, требования к трафику).
- Регистрацию с выбором роли (Affiliate / Поставщик) и редирект в соответствующий кабинет.
- Кабинет поставщика: «Мои офферы», «Создать оффер», «Заявки партнёров», «Расходы».
- Кабинет партнёра: «Каталог офферов», «Мои подключения», «Выплаты», «Подключиться к офферу».

После реализации API фронт нужно перевести на запросы к этим эндпоинтам и JWT-авторизацию.
