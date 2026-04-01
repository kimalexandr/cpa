# RealCPA Hub API Documentation

## Base URL

- Production: `https://tovarkin.com/api`
- Local: `http://localhost:3000/api`

All endpoints return JSON unless otherwise stated.

## Authentication

### JWT (web session)

Use standard login flow and send token in header:

`Authorization: Bearer <jwt_token>`

### API Key (for integrations)

Generate key in profile: `Профиль -> API и Webhook`.
Send in the same header:

`Authorization: Bearer <api_key>`

## Common Response Format

### Success

```json
{
  "ok": true
}
```

### Error

```json
{
  "error": "Ошибка сервера"
}
```

## Core Integration Flow

1. Affiliate gets tracking link/token.
2. Client click goes to `GET /t/:token`.
3. Supplier sends lead/sale postback to `POST /api/events`.
4. Event appears in affiliate/supplier/admin dashboards.

## Public Tracking

### Redirect by token

`GET /t/:token`

Records click event with attribution (`subid`, UTM, source, ip, userAgent) and redirects user to offer URL.

## Events and Postback

### Create lead/sale event

`POST /api/events`

#### Body

```json
{
  "token": "tk-xxxx",
  "event_type": "lead",
  "amount": 1200,
  "currency": "RUB",
  "external_id": "order-100500",
  "source": "facebook",
  "subid1": "campaignA",
  "utm_source": "google",
  "utm_campaign": "spring_sale"
}
```

#### Notes

- Idempotent by pair `(trackingLinkId, externalId)`.
- Duplicate `external_id` for same token returns existing event (`deduplicated: true`).
- Anti-fraud flags may be added automatically.

## Status Center

### Unified status endpoint

`GET /api/status-center`

Returns status objects with:

- `status` (`pending|approved|rejected|blocked`)
- `reason`
- `nextStep`
- `retryAllowed`

## Realtime Notifications

### SSE stream

`GET /api/realtime/stream`

If SSE unavailable, frontend falls back to polling notifications endpoint.

## Profile and API Keys

### Create API key

`POST /api/me/api-key`

Example body:

```json
{
  "name": "Default key",
  "days": 90,
  "scopes": ["*"]
}
```

### List keys

`GET /api/me/api-keys`

### Revoke key

`PATCH /api/me/api-keys/:id/revoke`

### Test webhook

`POST /api/me/webhook/test`

Example body:

```json
{
  "url": "https://example.com/webhook",
  "event": "manual_test",
  "payload": { "source": "profile" }
}
```

### API docs payload (machine-readable)

`GET /api/me/api-docs`

## Versioned API v1

Base: `/api/v1`

### Affiliate events (API key scope: `affiliate:events.read`)

`GET /api/v1/affiliate/events`

### Supplier events (API key scope: `supplier:events.read`)

`GET /api/v1/supplier/events`

### Create event (API key scope: `events.write`)

`POST /api/v1/events`

## Affiliate Endpoints

- `GET /api/affiliate/events`
- `GET /api/affiliate/analytics-sources`
- `POST /api/affiliate/events/:id/dispute`

## Supplier Endpoints

- `GET /api/supplier/analytics-sources`
- `GET /api/supplier/offers/:id/audit`
- `GET /api/supplier/affiliate-participations` (requests list)

## Admin Endpoints

- `GET /api/admin/payouts/registry`
- `GET /api/admin/payouts/export.csv`
- `PATCH /api/admin/payouts/bulk-status`
- `GET /api/admin/moderation/sla-summary`
- `POST /api/admin/moderation/sla-ping`
- `GET /api/admin/disputes`
- `PATCH /api/admin/disputes/:id`
- `GET /api/admin/kyc`
- `PATCH /api/admin/kyc/:id`

## HTTP Status Codes

- `200` OK
- `201` Created
- `400` Validation error
- `401` Unauthorized
- `403` Forbidden
- `404` Not found
- `409` Conflict (duplicate/idempotency cases)
- `500` Server error

## Security Recommendations

- Store API keys only in secret storage.
- Rotate keys every 60-90 days.
- Revoke keys immediately on incident.
- Enable 2FA for admin accounts.

## Quick cURL Examples

### Create event

```bash
curl -X POST "https://tovarkin.com/api/events" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"tk-xxxx\",\"event_type\":\"lead\",\"external_id\":\"order-123\"}"
```

### Read status center

```bash
curl "https://tovarkin.com/api/status-center" \
  -H "Authorization: Bearer <token>"
```
