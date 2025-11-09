API Extension — https://github.com/RonaldoAO/Interledger_back
Frontend - https://github.com/RonaldoAO/Interledger_turismo

# Backend — Open Payments (Interledger) Integration

This backend implements P2P (peer-to-peer) and Split Payments using the Open Payments standard from the Interledger ecosystem.

It is designed to demonstrate interoperable, programmable, and secure payments across different wallets, following the GNAP protocol for authorization.

---

## Project Purpose

Within the hackathon context, the goal was to integrate Open Payments into a backend that enables:

- Payments between users (different wallets) without relying on a centralized provider.
- Split Payments where a single amount is automatically distributed among multiple recipients.
- End-user authorization via the interactive GNAP flow (redirect URL).
- Persistence of transactions, states, and logs for traceability in Firestore.

## Table of Contents

- Architecture
- Configuration
- Payment Flows
- Open Payments Integration
- State Management in Firestore
- Security and Best Practices
- Lessons and Challenges
- References
- Team

## Architecture

Main project structure:

```
backend/
└─ src/
   ├─ config/        # External services configuration
   ├─ controllers/   # Endpoint entry logic
   ├─ services/      # Business logic (Open Payments, Firestore, Redis)
   ├─ routes/        # Express route definitions
   ├─ middleware/    # Logging and error handling
   └─ server.js      # Main entry point
```

## Key Technologies

- Express.js — Backend framework
- @interledger/open-payments — Official SDK for Open Payments
- Firestore (GCP) — Persistence for payments, grants, and logs
- Redis — Cache and rate-limiting
- Winston — Structured logging
- Docker — Portable deployment environment

## Configuration

Create a `.env` file based on `env.example` and configure the required variables:

```env
PORT=3000
WALLET_ADDRESS_URL=https://ilp.interledger-test.dev/your_user
PRIVATE_KEY_PATH=./keys/private-key.pem
KEY_ID=my-key-id
GOOGLE_APPLICATION_CREDENTIALS=credentials.json
FIRESTORE_DATABASE_ID=opendb
FRONTEND_URL=http://localhost:3001
CALLBACK_BASE_URL=http://localhost:3000
```

## Installation and Run

```bash
npm install
npm run dev
# or with Docker
npm run docker:dev
```

## Payment Flows

Payments use the client → backend → Open Payments model. Both types (P2P and Split) require interactive authorization (GNAP).

### P2P (Peer-to-Peer) Payment

1. Client → `POST /api/payments/initiate`
2. Backend creates an incoming payment on the recipient's wallet
3. Backend creates a quote and requests an interactive grant
4. Returns `redirectUrl` to the client
5. User authorizes in the wallet
6. Client → `POST /api/payments/:id/complete`
7. Backend finalizes the grant and creates an outgoing payment

#### Example request

```json
{
  "senderWalletUrl": "https://ilp.interledger-test.dev/angeel",
  "recipientWalletUrl": "https://ilp.interledger-test.dev/ronaldoelguapo",
  "amount": { "value": "1000", "assetCode": "USD", "assetScale": 2 }
}
```

### Split Payment

Allows splitting a payment among multiple recipients with a single authorization.

1. Client → `POST /api/split-payments/checkout`
2. Backend creates multiple incoming payments (one per recipient)
3. Requests a single interactive grant and returns `redirectUrl`
4. User authorizes the split in the wallet
5. Client → `POST /api/split-payments/:id/complete`
6. Backend creates parallel outgoing payments
7. Firestore updates the global state

#### Example request

```json
{
  "senderWalletUrl": "https://ilp.interledger-test.dev/angeel",
  "recipients": [
    { "walletUrl": "https://ilp.interledger-test.dev/ronaldoelguapo", "percentage": 70 },
    { "walletUrl": "https://ilp.interledger-test.dev/mochi", "percentage": 30 }
  ],
  "totalAmount": { "value": "1000", "assetCode": "USD", "assetScale": 2 }
}
```

## Open Payments Integration

The integration uses the official `@interledger/open-payments` SDK with private-key authentication and `keyId`, following GNAP.

Example grant request (simplified):

```js
await client.grant.request({ url: wallet.authServer }, {
  access_token: { access: [{ type: 'quote', actions: ['create'] }] },
  interact: { start: ['redirect'], finish: 'redirect' }
});
```

## State Management in Firestore

Each payment is stored with a state that reflects its lifecycle:

- PENDING_AUTHORIZATION — Waiting for user confirmation
- COMPLETED — Payment succeeded
- PARTIAL — In split payments, some legs failed
- FAILED — General error in the flow

## Security and Best Practices

- Rate limiting with Redis
- Dynamically configured CORS
- Helmet.js for secure headers
- Thorough input validation
- Structured logs for auditing (Winston)
- Do not expose tokens or private keys in responses

## Lessons and Challenges

Challenges during the integration:

- Understanding the interactive GNAP flow and when to use grants vs direct tokens
- Handling quote errors before authorization is completed
- Coordinating Split Payments to ensure all recipients receive their share
- Ensuring idempotency and auditability in Firestore

Successfully executed P2P and Split payments in the test environment `https://ilp.interledger-test.dev/` with authorization and persistence.

## References

- Open Payments Guide
- Interledger Protocol
- GNAP Specification (IETF Draft)

## Team

### Los Vibecoders
- [Ronaldo Acevedo Ojeda](https://www.linkedin.com/in/ronaldoacevedo/)
- Amado Juvencio Jose Santiago
- [Angel Jesus Zorrilla Cuevas](https://www.linkedin.com/in/angel-jesus-zorrilla-cuevas-269a9b296/)
- Oliver Caballero Silva

