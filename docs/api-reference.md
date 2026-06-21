# Interledger Tourism — API Reference

> Base URL: `https://interledger.whoangel.work`

---

## Health

### `GET /health`
Basic health check.

```json
{ "success": true, "message": "Server is running", "data": { "status": "OK" } }
```

### `GET /health/full`
Full check: server, Redis, MongoDB.

```json
{
  "success": true,
  "data": { "server": "OK", "redis": "OK", "mongo": "OK" }
}
```

---

## P2P Payment

### `POST /api/payments/initiate`
Initiate a 1-to-1 payment. Returns `redirectUrl` for user authorization.

**Request:**
```json
{
  "senderWalletUrl": "https://ilp.interledger-test.dev/alice",
  "recipientWalletUrl": "https://ilp.interledger-test.dev/bob",
  "amount": { "value": "100", "assetCode": "USD", "assetScale": 2 }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Pago iniciado",
  "data": {
    "paymentId": "uuid",
    "redirectUrl": "https://auth.interledger-test.dev/interact/...",
    "status": "PENDING_AUTHORIZATION",
    "quote": {
      "debitAmount": { "value": "1722", "assetCode": "MXN", "assetScale": 2 },
      "receiveAmount": { "value": "100", "assetCode": "USD", "assetScale": 2 }
    }
  }
}
```

### `POST /api/payments/:paymentId/complete`
Manual fallback to complete payment after user authorized via `redirectUrl`.

**Response:**
```json
{ "success": true, "data": { "status": "COMPLETED" } }
```

### `GET /api/payments/:paymentId`
Get payment status and details.

### `GET /api/payments/callback`
Auto-callback after GNAP interactive authorization. Used internally by auth server redirect.

**Query:** `?paymentId=uuid&interact_ref=...`

---

## Split Payment

### `POST /api/split-payments/checkout`
One sender splits payment across N recipients (by percentage). Percentages must sum to 100%.

**Request:**
```json
{
  "senderWalletUrl": "https://ilp.interledger-test.dev/alice",
  "recipients": [
    { "walletUrl": "https://ilp.interledger-test.dev/guide", "percentage": 60 },
    { "walletUrl": "https://ilp.interledger-test.dev/community", "percentage": 40 }
  ],
  "totalAmount": { "value": "10000", "assetCode": "USD", "assetScale": 2 }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "splitPaymentId": "uuid",
    "redirectUrl": "https://auth.interledger-test.dev/interact/...",
    "status": "PENDING_AUTHORIZATION",
    "summary": {
      "totalRecipients": 2,
      "successfulRecipients": 2,
      "totalDebitAmount": { "value": "18330", "assetCode": "MXN", "assetScale": 2 },
      "recipients": [
        { "wallet": "https://...guide", "percentage": 60, "amount": 6000, "assetCode": "USD" },
        { "wallet": "https://...community", "percentage": 40, "amount": 4000, "assetCode": "EUR" }
      ]
    }
  }
}
```

### `POST /api/split-payments/:splitPaymentId/complete`
Manual fallback. Completes all outgoing payments in parallel after authorization.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "COMPLETED",
    "outgoingPayments": [
      { "recipient": "...", "percentage": 60, "outgoingPayment": { "id": "...", "failed": false } }
    ],
    "summary": { "total": 2, "successful": 2, "failed": 0 }
  }
}
```

### `GET /api/split-payments/:splitPaymentId`
Get split payment status and full details.

### `GET /api/split-payments/callback`
Auto-callback. Same pattern as P2P callback.

**Query:** `?splitPaymentId=uuid&interact_ref=...`

---

## Group Checkout (Union Payments)

### `POST /api/split/group-checkout`
Multiple payers split a total equally and pay a single merchant. Each payer gets their own `redirectUrl`.

**Request:**
```json
{
  "merchantAddress": "https://ilp.interledger-test.dev/restaurant",
  "totalAmountMinor": "500",
  "payers": [
    "https://ilp.interledger-test.dev/alice",
    "https://ilp.interledger-test.dev/bob"
  ]
}
```

`totalAmountMinor` is an integer in the merchant's smallest currency unit (e.g. 500 = 5.00 if scale=2).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "groupId": "uuid",
    "merchant": "https://ilp.interledger-test.dev/restaurant",
    "totalMinor": 500,
    "count": 2,
    "results": [
      {
        "payer": "https://ilp.interledger-test.dev/alice",
        "shareMinor": 250,
        "redirectUrl": "https://auth.interledger-test.dev/interact/...",
        "nonce": "abc123..."
      },
      {
        "payer": "https://ilp.interledger-test.dev/bob",
        "shareMinor": 250,
        "redirectUrl": "https://auth.interledger-test.dev/interact/...",
        "nonce": "def456..."
      }
    ]
  }
}
```

### `GET /api/op/callback`
Auto-callback for each payer. Completes their individual payment.

**Query:** `?nonce=abc123...&interact_ref=...`

---

## Query & History

### `GET /api/payments/list`
Paginated list of all payments (P2P + split). All params optional.

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number |
| `limit` | int | 10 | Results per page (max 100) |
| `status` | string | — | Filter: `PENDING_AUTHORIZATION`, `COMPLETED`, `FAILED`, `PARTIAL` |
| `startDate` | ISO8601 | — | Filter by createdAt >= |
| `endDate` | ISO8601 | — | Filter by createdAt <= |
| `walletUrl` | string | — | Filter payments where sender or recipient matches |

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      { "id": "...", "type": "payment", "status": "COMPLETED", "amount": {...}, ... },
      { "id": "...", "type": "split_payment", "status": "PENDING_AUTHORIZATION", ... }
    ],
    "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5, "hasNextPage": true }
  }
}
```

### `GET /api/payments/stats`
Aggregated statistics. Same date/wallet filters as list.

```json
{
  "success": true,
  "data": {
    "total": 42,
    "byStatus": { "COMPLETED": 30, "PENDING_AUTHORIZATION": 10, "FAILED": 2 },
    "byType": { "payment": 25, "split_payment": 17 },
    "byAssetCode": { "USD": { "count": 30, "volume": 15000 } },
    "totalVolume": { "USD": 15000 },
    "successRate": "71.43"
  }
}
```

### `GET /api/payments/search?q=paymentId`
Search by exact payment ID.

### `GET /api/payments/:paymentId?type=payment|split_payment`
Get full payment details by ID. Optional `type` query param to disambiguate.

---

## FX Comparison

### `POST /api/fx/compare`
Compare Interledger exchange rate vs external market rates.

| Supported currencies | Wallet |
|---|---|
| USD | `https://ilp.interledger-test.dev/usd_25` |
| EUR | `https://ilp.interledger-test.dev/eur_25` |
| MXN | `https://ilp.interledger-test.dev/mx_25` |
| EGG | `https://ilp.interledger-test.dev/eg25` |
| PEB | `https://ilp.interledger-test.dev/peb_25` |
| PKR | `https://ilp.interledger-test.dev/pkr_25` |

**Request:**
```json
{ "from": "MXN", "to": "USD" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "from": "MXN",
    "to": "USD",
    "sendMajor": 100,
    "ilp": {
      "rate": 0.054,
      "debitAmount": { "value": "10000", "assetCode": "MXN", "assetScale": 2 },
      "receiveAmount": { "value": "545", "assetCode": "USD", "assetScale": 2 }
    },
    "market": { "rate": 0.055, "source": "multi" },
    "deltaPct": -2.15
  }
}
```

---

## Wallet Info

### `GET /api/payments/wallet?walletUrl=https://ilp.interledger-test.dev/alice`
Resolve wallet address. Cached in Redis (5 min).

```json
{
  "success": true,
  "data": {
    "id": "https://ilp.interledger-test.dev/alice",
    "publicName": "alice-wallet",
    "assetCode": "USD",
    "assetScale": 2,
    "authServer": "https://auth.interledger-test.dev/...",
    "resourceServer": "https://ilp.interledger-test.dev/..."
  }
}
```

---

## Auth Flow (GNAP Interactive)

All payment flows follow the same pattern:

```
1. POST /api/payments/initiate (or /checkout)
   └─ returns redirectUrl (auth server interaction page)

2. User opens redirectUrl in browser → clicks "Allow"

3. Auth server redirects to our callback:
   └─ GET /api/payments/callback?paymentId=...&interact_ref=...
   └─ GET /api/split-payments/callback?splitPaymentId=...&interact_ref=...
   └─ GET /api/op/callback?nonce=...&interact_ref=...

4. Callback auto-finalizes grant and executes payment(s)
   └─ Redirects to frontend with ?status=COMPLETED
```

Status values: `PENDING_AUTHORIZATION` → `COMPLETED` | `FAILED` | `PARTIAL`

---

## Test Console

Interactive UI at `https://interledger.whoangel.work` with 3 tabs:
- **Split Payment** — 1 sender → N recipients (percentage)
- **Group Checkout** — N payers → 1 merchant (equal split)
- **P2P Payment** — 1 sender → 1 recipient

---

## Infrastructure

| Service | Internal Port | Notes |
|---|---|---|
| Backend (Node.js 20) | 8080 | Express 5, Open Payments SDK |
| MongoDB 4.4 | 27017 | No AVX required |
| Redis 7 | 6379 | Cache + rate limiting |

Dependencies: `@interledger/open-payments` v7.x, `mongodb`, `ioredis`, `socket.io`, `express-rate-limit`.
