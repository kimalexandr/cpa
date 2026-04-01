# CPA для товарного бизнеса: как должно работать

## 1) Цепочка событий (эталон)

1. Affiliate получает трек-ссылку (`/t/:token`).
2. Покупатель кликает по ссылке.
3. Система фиксирует click (token, subid, utm, ip, userAgent, время).
4. Пользователь оставляет лид или оплачивает заказ у поставщика.
5. Поставщик отправляет postback в `POST /api/events` с `external_id`.
6. Система создаёт событие `lead`/`sale` со статусом `pending`.
7. Модерация (авто/ручная) переводит событие в `approved/rejected`.
8. При `approved` начисляется выплата affiliate.
9. Выплаты попадают в реестр и затем в `paid`.
10. Все стороны видят прозрачный статус, причину и следующий шаг.

## 2) Как это выглядит для покупателя/лида

- Покупатель не видит “внутреннюю кухню CPA”.
- Для покупателя поток простой: клик -> лендинг -> заявка/покупка.
- Для бизнеса важно, чтобы на каждом шаге была техническая фиксация:
  - кто привёл клиента (tracking token),
  - откуда трафик (source/subid/utm),
  - какая конверсия произошла (lead/sale),
  - какой итог статуса и почему.

## 3) Что обязательно нужно для полноценной CPA-работы

## Трекинг и атрибуция

- Уникальный tracking token на каждое подключение affiliate к offer.
- Сбор `subid1..5`, UTM, source, click ip/userAgent/device.
- Дедупликация по `(trackingLinkId, external_id)`.
- Защита от подмены токена и “грязных” postback.

## Postback и события

- Надёжный приём postback (валидация полей + подпись запроса).
- Очередь доставки и retry для webhook/postback.
- История последних попыток и ответов (для диагностики).
- SLA по времени обработки pending событий.

## Модерация и антифрод

- Причина отклонения обязательна (`reasonCode + comment`).
- Антифрод-флаги: velocity spike, source blacklist, amount anomaly.
- Возможность dispute от affiliate и разбор в админке.
- Audit trail: кто и когда изменил статус/правила.

## Финансы и выплаты

- Ledger начислений (approved event -> payout record).
- Реестр выплат: `pending -> processing -> paid/canceled`.
- Экспорт выплат (CSV/XLSX), фильтры по периоду/affiliate.
- Фиксация комиссии сети и net amount.

## UX кабинетов

- Статусы на карточках offer: подключен / pending / rejected.
- Единый `status-center` с `nextStep` и `retryAllowed`.
- Realtime уведомления (SSE/WebSocket) + fallback polling.
- Диагностика интеграции: токен, postback test, last response.

## Безопасность

- Серверные сессии и отзыв всех устройств.
- 2FA для admin.
- API keys со scope, expiry, revoke.
- Rate-limit на auth/postback/admin endpoints.

## Эксплуатация

- Нормальный `/health` и `/ready` (DB/queue/mail checks).
- Метрики и алерты (5xx, latency, queue lag, postback fail rate).
- Ежедневный backup + проверка restore.
- Безопасный деплой без `db push --accept-data-loss` на проде.

## 4) Минимум для запуска в прод (Go-Live)

- [ ] Дедупликация postback на уровне БД и API.
- [ ] SLA-модерации и причины отклонения в UI.
- [ ] Реестр выплат + bulk статусы + экспорт.
- [ ] Диагностика postback “из коробки”.
- [ ] Realtime статусы/уведомления.
- [ ] Антифрод базового уровня.
- [ ] Логи, метрики, алерты.
- [ ] Бэкапы и rollback-процедура.

## 5) Что добавить в проект в следующую очередь

1. Подпись postback (HMAC secret на оффер/поставщика).
2. Full queue на Redis/BullMQ для webhook/postback.
3. Финансовый ledger (immutable) для аудита начислений.
4. Авто-правила антифрода с порогами в админке.
5. Визуальный “путь заказа” по external_id (таймлайн от клика до выплаты).
