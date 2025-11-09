# 🌍 Interledger Tourism — Open Payments for Sustainable Tourism

A payment orchestration platform built on **Interledger Protocol** and **Open Payments** that enables instant, interoperable, and transparent transactions for sustainable tourism.
  [Project Resources (video, presentation, diagrams, etc)](https://drive.google.com/drive/folders/1_oFnr9xJkG9FJCV80pUnZOVvM38BDrlm)


----------

## 📂 Project Repositories

### 🔧 [Backend - Payment Orchestration API](https://github.com/whoAngeel/interledger-hackathon-2025/tree/main/backend)
[Deepwiki Documentation](https://deepwiki.com/whoAngeel/interledger-hackathon-2025/tree/main/backend)
**Stack:** Node.js, Express, Open Payments SDK, Firestore, Redis

Unified backend that orchestrates all payment flows with Open Payments integration:

-   P2P payments with automatic currency conversion
-   Split Payments: distribute funds to multiple recipients in one authorization
-   Transaction history and analytics
-   Union payments flow
-   GNAP interactive authorization flow
-   Deployed on Google Cloud Run

### Backend in 
**Production backend url**
https://interledger-backend-845205707453.us-central1.run.app/api/

**health check** 
https://interledger-backend-845205707453.us-central1.run.app/health/

**Key Endpoints:**

-   `POST /api/payments/initiate` - P2P payment
-   `POST /api/split-payments/checkout` - Split payment
-   `GET /api/payments/query/list` - Transaction history
-   `GET /api/payments/query/stats` - Analytics
 -   `POST /api/payments/{id}/complete` - Complete P2P payment
-   `POST /api/split-payments/{id}/complete` - Complete split payment
-   `GET/api/split-payments/{id}` - Get status payment
-   `POST /api/payments/{id}` - Get Status payment


----------

### 🔧 [Backend - Microservice (union payments and metrics service)](https://github.com/RonaldoAO/Interledger_back)
[Deepwiki Documentation](https://deepwiki.com/whoAngeel/interledger-hackathon-2025/tree/main/backend)
**Stack:** Node.js, Express, Typescript, Open Payments SDK, AWS

backend for union payments and system metrics
[Deepwiki Documentation](https://deepwiki.com/RonaldoAO/Interledger_turismo)

### 📱 [Mobile/Web App - Tourism Plattform with QR Payments](https://github.com/RonaldoAO/Interledger_turismo)
[Deepwiki Documentation](https://deepwiki.com/RonaldoAO/Interledger_turismo)

**Stack:** Flutter, NFC, QR Scanner

Point-of-sale mobile payments:

-   Browse sustainable tourism experiences
-   Contactless NFC payments
-   QR code generation and scanning
-   Offline mode support
-   Multi-currency wallet

----------

## 🎯 Impact

**Real-World Scenario:** Tourist pays $100 USD for eco-tour in Oaxaca

**Traditional systems:**

-   3-5% credit card fees
-   2-3 day settlement
-   Unfavorable FX rates
-   Community receives share weeks later
-  Separate bills when paying at a restaurant are often tedious for commerce

**With Interledger Tourism:**

-   ✅ Instant split: 60% guide, 30% community, 10% platform
-   ✅ No banking intermediaries
-   ✅ Real-time currency conversion (ILP)
-   ✅ Funds available immediately
-   ✅ Union Payments Scanning QR codes
-    ✅ P2P payments immediately



----------

## 🔑 Open Payments Integration

### Core Concepts

**1. Wallet Address Resolution**

javascript

```javascript
const wallet = await client.walletAddress.get({ 
  url: 'https://ilp.interledger-test.dev/user' 
});
// Returns: assetCode, authServer, resourceServer
```

**2. Interactive Authorization (GNAP)**

javascript

```javascript
const grant = await client.grant.request({
  access_token: {
    access: [{ type: 'outgoing-payment', actions: ['create'] }]
  },
  interact: { start: ['redirect'] }  // User authorization
});
// Returns: redirectUrl for user consent
```

**3. Quote Generation**

javascript

```javascript
const quote = await client.quote.create({
  walletAddress: senderWallet.id,
  receiver: incomingPayment.id
});
// debitAmount: 1,850.81 MXN → receiveAmount: 100.00 USD
```

**4. Payment Execution**

javascript

```javascript
const outgoingPayment = await client.outgoingPayment.create({
  walletAddress: senderWallet.id,
  quoteId: quote.id
});
// Atomic ILP transfer
```

### Split Payment Flow

javascript

```javascript
// 1. Create N incoming payments (one per recipient)
const incomingPayments = await createMultipleIncomingPayments(recipients);

// 2. Generate quotes for each
const quotes = await createQuotesForAll(incomingPayments);

// 3. Request SINGLE grant with total amount
const totalAmount = quotes.reduce((sum, q) => sum + q.debitAmount, 0);
const grant = await requestGrant({ limits: { debitAmount: totalAmount } });

// 4. User authorizes ONCE

// 5. Execute N outgoing payments in parallel
await Promise.all(
  quotes.map(q => createOutgoingPayment(q, grant.access_token))
);
```

**Key Innovation:** Single authorization for multiple recipients using grant with `actions: ['create', 'read', 'list']`

---

## 🏗️ Architecture
```
┌─────────────────────────────────────────────────────┐
│  Frontend Web + Mobile (Flutter)                │
└──────────────────┬──────────────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────────────┐
│  Backend (Express + Open Payments SDK)              │
│  ├─ P2P Payment Service                             │
│  ├─ Split Payment Service                           │
│  ├─ Union Payment Service                           │
│  ├─ Query Service                                   │
│  └─ Open Payments Client (GNAP auth)                │
└──────────────┬────────────┬─────────────────────────┘
               │            │
    ┌──────────▼───┐   ┌───▼──────────┐
    │  Firestore   │   │ Redis Cache  │
    └──────────────┘   └──────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  Interledger Network (Rafiki)                       │
│  ├─ Authorization Server (GNAP)                     │
│  ├─ Resource Server                                 │
│  └─ ILP Connectors                                  │
└─────────────────────────────────────────────────────┘
```

----------

## 🚀 Quick Start

### Prerequisites

-   Node.js 20+
-   Docker
-   GCP account
-   Interledger wallet test (https://wallet.interledger-test.dev/)

### Setup

bash

```bash
# Clone
git clone https://github.com/whoAngeel/interledger-hackathon-2025.git
cd Interledger_back

# Install
npm install

# Configure .env
cp .env.example .env
# Edit .env with your credentials

# Run locally
npm run dev

# Or with Docker
npm run docker:dev
```

### Deploy to GCP

bash

```bash
# Create secrets
gcloud secrets create interledger-private-key --data-file=dev.key
gcloud secrets create interledger-datastore-sa --data-file=credentials.json

# Build and deploy
docker build --platform linux/amd64 -f Dockerfile.production -t IMAGE_URL .
docker push IMAGE_URL
gcloud run deploy interledger-backend --image=IMAGE_URL --region=us-central1
```

----------

## 📊 API Examples

### P2P Payment

http

```http
POST /api/payments/initiate
{
  "senderWalletUrl": "https://ilp.interledger-test.dev/sender",
  "recipientWalletUrl": "https://ilp.interledger-test.dev/recipient",
  "amount": { "value": "10000", "assetCode": "USD", "assetScale": 2 }
}

Response:
{
  "paymentId": "uuid",
  "redirectUrl": "https://auth.interledger-test.dev/interact/...",
  "status": "PENDING_AUTHORIZATION",
  "quote": {
    "debitAmount": { "value": "185081", "assetCode": "MXN" },
    "receiveAmount": { "value": "10000", "assetCode": "USD" }
  }
}

# User authorizes at redirectUrl

POST /api/payments/:paymentId/complete
→ Status: COMPLETED
```

### Split Payment

http

```http
POST /api/split-payments/checkout
{
  "senderWalletUrl": "https://ilp.interledger-test.dev/sender",
  "totalAmount": { "value": "10000", "assetCode": "USD" },
  "recipients": [
    { "walletUrl": "https://ilp.interledger-test.dev/guide", "percentage": 60 },
    { "walletUrl": "https://ilp.interledger-test.dev/community", "percentage": 30 },
    { "walletUrl": "https://ilp.interledger-test.dev/platform", "percentage": 10 }
  ]
}

Response:
{
  "splitPaymentId": "uuid",
  "redirectUrl": "https://auth.interledger-test.dev/interact/...",
  "summary": {
    "totalRecipients": 3,
    "totalDebitAmount": { "value": "185081", "assetCode": "MXN" }
  }
}

# User authorizes once for all recipients

POST /api/split-payments/:splitPaymentId/complete
→ 3 payments executed in parallel
```

----------

## 🎓 Key Learnings

### Challenges Overcome

1.  **GNAP Interactive Flow**
    -   Managing grant lifecycle: request → user interaction → finalize
    -   Handling grant expiration and refresh
2.  **Split Payment Coordination**
    -   Single authorization for multiple recipients
    -   Parallel execution with partial failure handling
    -   Atomic or partial success states
3.  **Currency Conversion**
    -   Real-time quotes with transparent exchange rates
    -   Different asset scales (e.g., MXN scale=2, USD scale=2)
4.  **Idempotency**
    -   Preventing duplicate transactions on retry
    -   Correlation IDs for distributed debugging

### Best Practices

-   ✅ State machine for payment lifecycle
-   ✅ Exponential backoff with jitter for retries
-   ✅ Circuit breaker for external API calls
-   ✅ Comprehensive audit logs
-   ✅ Rate limiting (100 req/min)
-   ✅ Input validation with clear error messages

----------

## 📚 Resources

-   [Open Payments Guide](https://openpayments.guide/)
-   [Interledger Protocol](https://interledger.org/)
-   [GNAP Specification](https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol)
-   [Project Resources](https://drive.google.com/drive/folders/1_oFnr9xJkG9FJCV80pUnZOVvM38BDrlm)

----------

## 🛠️ Tech Stack

-   **Backend:** Express.js, @interledger/open-payments
-   **Database:** Firestore (GCP)
-   **Cache:** Redis (Memorystore)
-   **Frontend:** React, TailwindCSS
-   **Mobile:** Flutter, NFC, QR
-   **Infrastructure:** Docker, GCP Cloud Run

----------

## 👥 Team - Los Vibecoders

-   **[Ronaldo Acevedo Ojeda](https://www.linkedin.com/in/ronaldoacevedo/)** - Tech Lead & Backend
-   **Amado Juvencio Jose Santiago** - Frontend & UX
-   **[Angel Jesus Zorrilla Cuevas](https://www.linkedin.com/in/angel-jesus-zorrilla-cuevas-269a9b296/)** - Backend developer & DevOps
-   **Oliver Caballero Silva** - Business & Product

----------

## 📜 License

MIT License - See `LICENSE` file
