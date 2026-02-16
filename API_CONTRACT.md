# API Contract (Offline Write Option 1)

All PWA writes **must** use `POST /api/v1/sync/push`. PWA clients must **not** POST to domain endpoints (invoices, stock moves, customers). All PWA reads use the read-only REST endpoints and `sync/pull` for bulk updates.

## Authentication
- **JWT** (user + device bound). Include `Authorization: Bearer <token>`.
- `device_id` is mandatory in sync requests.

---

## Standard Error Envelope
All API errors (sync and non-sync) use this response shape:

```json
{
  "code": "validation_error",
  "message": "Validation failed.",
  "errors": {"field": ["This field is required."]},
  "status": 422
}
```

### Stable error `code` values
- `validation_error` → request body/query validation failed (`400`/`422`)
- `not_authenticated` → missing auth credentials (`401`)
- `authentication_failed` → invalid auth credentials (`401`)
- `permission_denied` → caller is authenticated but blocked (`403`)
- `not_found` → resource not found (`404`)
- `method_not_allowed` → HTTP method unsupported (`405`)
- `throttled` → request rate-limited (`429`)
- `parse_error` → malformed body payload (`400`)
- `unsupported_media_type` → bad `Content-Type` (`415`)
- `not_acceptable` → response content negotiation failed (`406`)
- `forbidden_device` → sync device is outside caller branch (`403`)
- `device_not_found` → sync device missing or inactive (`404`)
- `internal_server_error` → unhandled server error (`500`)

`message` is human-readable, `errors` contains field-level/structured details (or `null` when unavailable), and `status` mirrors the HTTP status code.

---

## Sync Outbox (Monotonic Cursor)
The server emits **SyncOutbox** rows on every domain change. The `id` is a **BIGINT cursor**.

**Model**: `sync.SyncOutbox`
- `id` BIGSERIAL (cursor)
- `branch_id` UUID
- `entity` string
- `entity_id` UUID
- `op` string (`upsert|delete`)
- `payload` JSONB
- `created_at` timestamp

**Indexes**
- `(branch_id, id)`
- `(entity, id)`

---

# Endpoints

## Sync Push (PWA write-only)
### `POST /api/v1/sync/push`
**Auth**: Required

**Request**
```json
{
  "device_id": "uuid",
  "events": [
    {
      "event_id": "uuid",
      "event_type": "invoice.create|customer.upsert|stock.adjust",
      "payload": { "...": "..." },
      "created_at": "2025-01-01T12:00:00Z"
    }
  ]
}
```

**Response**
```json
{
  "acknowledged": ["uuid"],
  "rejected": [
    {
      "event_id": "uuid",
      "reason": "validation_failed|forbidden|conflict",
      "details": {"field": "error"}
    }
  ],
  "server_cursor": 12345
}
```

**Error responses**
- Uses the standard error envelope (`code`, `message`, `errors`, `status`).
- Common `code` values for this endpoint: `validation_error`, `forbidden_device`, `device_not_found`, `not_authenticated`.

---

## Sync Pull (PWA read)
### `POST /api/v1/sync/pull`
**Auth**: Required

**Request**
```json
{ "device_id": "uuid", "cursor": 0, "limit": 500 }
```

**Response**
```json
{
  "server_cursor": 12345,
  "updates": [
    { "cursor": 12340, "entity": "product", "op": "upsert", "entity_id": "uuid", "payload": {"...": "..."} },
    { "cursor": 12341, "entity": "invoice", "op": "upsert", "entity_id": "uuid", "payload": {"...": "..."} }
  ],
  "has_more": true
}
```

---

## Read-only REST (PWA read)
- `GET /api/v1/products`
- `GET /api/v1/categories`
- `GET /api/v1/warehouses`
- `GET /api/v1/customers`
- `GET /api/v1/invoices`

Default list pagination uses DRF page-number format.

**Defaults**
- `page=1` when omitted
- `page_size=50` when omitted
- `page_size` can be provided by client via query param
- `page_size` is capped at `200` (values above 200 are clamped to 200)

**Paginated response shape**
```json
{
  "count": 123,
  "next": "https://api.example.com/api/v1/products/?page=2&page_size=50",
  "previous": null,
  "results": [
    {"id": "uuid", "...": "..."}
  ]
}
```

**Explicit unpaginated endpoints**
- `GET /api/v1/purchase-orders/pending/` (small dashboard dataset of open POs)
- `GET /api/v1/alerts/unread/` (badge/feed lookup; caller typically needs complete unread set)
- `GET /api/v1/invoices/recent-activity/` (fixed latest-10 activity feed)

These endpoints intentionally return a JSON array instead of the paginated envelope.

---

# Event Payload Contracts (Gemini-ready)

## 1) `invoice.create`
**Payload**
```json
{
  "branch_id": "uuid",
  "device_id": "uuid",
  "user_id": "uuid",
  "local_invoice_no": "POS-DEV-000123",
  "invoice_number": null,
  "customer": {
    "customer_id": "uuid",
    "name": "Optional inline name",
    "phone": "+20123456789",
    "email": "customer@example.com"
  },
  "lines": [
    {
      "product_id": "uuid",
      "qty": 2,
      "unit_price": "9.99",
      "discount": "0.50",
      "tax_rate": "0.14"
    }
  ],
  "payments": [
    {
      "method": "cash",
      "amount": "19.48",
      "paid_at": "2025-01-01T12:01:00Z"
    }
  ],
  "totals": {
    "subtotal": "19.98",
    "discount_total": "0.50",
    "tax_total": "2.80",
    "total": "22.28"
  },
  "created_at": "2025-01-01T12:00:00Z"
}
```

**Notes**
- **Idempotency** enforced by `(event_id, device_id)` at `SyncEvent` and domain write level.
- **Invoice numbering**: client always sends `local_invoice_no`. Server **assigns** `invoice_number` (final) and returns it via `sync/pull`. `invoice_number` is optional in payload and ignored if present.
- **Pricing conflicts**: server **accepts client `unit_price`** (POS standard), but logs and stores it as the invoice line price even if catalog price changed.

---

## 2) `customer.upsert`
**Payload**
```json
{
  "branch_id": "uuid",
  "customer_id": "uuid",
  "name": "Jane Doe",
  "phone": "+20123400000",
  "email": "jane@example.com",
  "updated_at": "2025-01-01T09:00:00Z"
}
```

**Notes**
- `customer_id` is client-generated UUID. Server upserts by `customer_id`.

---

## 3) `stock.adjust`
**Payload**
```json
{
  "branch_id": "uuid",
  "warehouse_id": "uuid",
  "product_id": "uuid",
  "quantity": "-3",
  "reason": "adjustment",
  "note": "Damaged items",
  "created_at": "2025-01-01T08:30:00Z"
}
```

**Notes**
- Server validates: product active, warehouse belongs to branch, quantity non-zero.

---

# Conflict & Numbering Rules
- **Idempotency**: same `(event_id, device_id)` returns ack with no duplication.
- **Invoice numbering**: server generates `invoice_number` (branch-scoped sequence). Client uses `local_invoice_no` for offline uniqueness; server returns the final number via outbox sync.
- **Stock validation**: server rejects adjustments if product inactive or warehouse not in branch.
- **Price changes while offline**: server accepts client `unit_price` and stores it as the invoice line price; catalog price changes are not retroactively applied.

---

# Examples

## Example 1: Push invoice
**Request**
```json
{
  "device_id": "11111111-1111-1111-1111-111111111111",
  "events": [
    {
      "event_id": "22222222-2222-2222-2222-222222222222",
      "event_type": "invoice.create",
      "payload": {
        "branch_id": "33333333-3333-3333-3333-333333333333",
        "device_id": "11111111-1111-1111-1111-111111111111",
        "user_id": "44444444-4444-4444-4444-444444444444",
        "local_invoice_no": "POS-DEV-000123",
        "invoice_number": null,
        "customer": null,
        "lines": [
          {
            "product_id": "55555555-5555-5555-5555-555555555555",
            "qty": 2,
            "unit_price": "9.99",
            "discount": "0",
            "tax_rate": "0.14"
          }
        ],
        "payments": [
          {"method": "cash", "amount": "19.98", "paid_at": "2025-01-01T12:01:00Z"}
        ],
        "totals": {"subtotal": "19.98", "discount_total": "0", "tax_total": "2.80", "total": "22.78"},
        "created_at": "2025-01-01T12:00:00Z"
      },
      "created_at": "2025-01-01T12:00:00Z"
    }
  ]
}
```

**Response**
```json
{
  "acknowledged": ["22222222-2222-2222-2222-222222222222"],
  "rejected": [],
  "server_cursor": 12345
}
```

## Example 2: Pull mixed updates
**Request**
```json
{ "device_id": "11111111-1111-1111-1111-111111111111", "cursor": 12340, "limit": 2 }
```

**Response**
```json
{
  "server_cursor": 12341,
  "updates": [
    {
      "cursor": 12340,
      "entity": "product",
      "op": "upsert",
      "entity_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "payload": {
        "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "branch_id": "33333333-3333-3333-3333-333333333333",
        "sku": "SKU-001",
        "name": "Soda",
        "price": "9.99",
        "tax_rate": "0.14",
        "is_active": true,
        "updated_at": "2025-01-01T10:00:00Z"
      }
    },
    {
      "cursor": 12341,
      "entity": "invoice",
      "op": "upsert",
      "entity_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "payload": {
        "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "branch_id": "33333333-3333-3333-3333-333333333333",
        "invoice_number": "INV-2025-000001",
        "local_invoice_no": "POS-DEV-000123",
        "total": "22.78",
        "status": "paid",
        "created_at": "2025-01-01T12:00:00Z"
      }
    }
  ],
  "has_more": false
}
```


## Authorization permission matrix

Roles: `cashier`, `supervisor`, `admin` (superuser always allowed).

| Endpoint / Action | Capability | Cashier | Supervisor | Admin |
|---|---|---:|---:|---:|
| `GET /api/v1/invoices/`, `GET /api/v1/invoices/dashboard-summary/` | `sales.dashboard.view` | ✅ | ✅ | ✅ |
| `POST /api/v1/pos/invoices/`, `POST /api/v1/payments/`, `POST /api/v1/returns/`, shift open/current | `sales.pos.access` | ✅ | ✅ | ✅ |
| `GET /api/v1/customers/` | `sales.customers.view` | ✅ | ✅ | ✅ |
| `POST /api/v1/shifts/{id}/close/` (own shift) | `shift.close.self` | ✅ | ✅ | ✅ |
| `POST /api/v1/shifts/{id}/close/` (override another cashier) | `shift.close.override` | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/invoices/{id}/void/` | `invoice.void` | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/stock-transfers/{id}/approve/` | `stock.transfer.approve` | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/stock-transfers/{id}/complete/` | `stock.transfer.complete` | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/purchase-orders/{id}/receive/` | `stock.adjust` | ❌ | ✅ | ✅ |
| `POST/PUT/DELETE /api/v1/devices/` | `device.manage` | ❌ | ❌ | ✅ |
| Admin CRUD (`/api/v1/admin/*`) | `admin.records.manage` | ❌ | ❌ | ✅ |

Denied authorization attempts are logged under logger `security.authorization`.
