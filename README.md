
📋 Tabla de Contenidos
# Backend – Integración con Open Payments (Interledger)

Este backend implementa pagos P2P (peer-to-peer) y Split Payments (pagos divididos) utilizando el estándar Open Payments del ecosistema Interledger.

Diseñado para demostrar pagos interoperables, programables y seguros entre wallets distintas, siguiendo el protocolo GNAP para autorización.

---

## 🧠 Propósito del proyecto

En el contexto del hackathon, el objetivo fue integrar Open Payments en un backend que permita:

- Pagos entre usuarios (wallets distintas) sin depender de un proveedor centralizado.
- Pagos divididos (Split Payments) donde un mismo monto se reparte automáticamente entre varios receptores.
- Autorización del usuario final mediante el flujo interactivo de GNAP (redirect URL).
- Persistencia de transacciones, estados y logs para trazabilidad en Firestore.

## 📋 Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Configuración](#configuración)
- [Flujos de pago](#flujos-de-pago)
- [Integración con Open Payments](#integración-con-open-payments)
- [Manejo de estados en Firestore](#manejo-de-estados-en-firestore)
- [Seguridad y buenas prácticas](#seguridad-y-buenas-prácticas)
- [Aprendizajes y retos](#aprendizajes-y-retos)
- [Referencias](#referencias)

## 🏗️ Arquitectura

Estructura principal del proyecto:

```
backend/
├── src/
│   ├── config/        # Configuración de servicios externos
│   ├── controllers/   # Lógica de entrada de endpoints
│   ├── services/      # Lógica de negocio (Open Payments, Firestore, Redis)
│   ├── routes/        # Definición de rutas Express
│   └── middleware/    # Logging y manejo de errores
└── server.js          # Punto de entrada principal
```

## 🧩 Tecnologías clave

| Componente | Uso |
|---|---|
| Express.js | Framework backend |
| @interledger/open-payments | SDK oficial para integrar Open Payments |
| Firestore (GCP) | Persistencia de pagos, grants y logs |
| Redis | Cache y rate-limiting |
| Winston | Logging estructurado |
| Docker | Entorno de despliegue portable |

## ⚙️ Configuración

Crea un archivo `.env` basado en `env.example` y configura las variables necesarias:

```env
PORT=3000
WALLET_ADDRESS_URL=https://ilp.interledger-test.dev/tu_usuario
PRIVATE_KEY_PATH=./keys/private-key.pem
KEY_ID=mi-key-id
GOOGLE_APPLICATION_CREDENTIALS=credentials.json
FIRESTORE_DATABASE_ID=opendb
FRONTEND_URL=http://localhost:3001
CALLBACK_BASE_URL=http://localhost:3000
```

### Instalación y ejecución

```bash
npm install
npm run dev
# o con Docker
npm run docker:dev
```

## 🔄 Flujos de pago

Los pagos usan el modelo cliente → backend → Open Payments. Ambos tipos (P2P y Split) requieren autorización interactiva (GNAP).

### Pago P2P (Peer-to-Peer)

1. Cliente → `POST /api/payments/initiate`
2. Backend crea incoming payment en la wallet del receptor
3. Backend genera quote y solicita grant interactivo
4. Devuelve `redirectUrl` al cliente
5. Usuario autoriza en la wallet
6. Cliente → `POST /api/payments/:id/complete`
7. Backend finaliza grant y crea outgoing payment

#### Ejemplo de request

```json
{
  "senderWalletUrl": "https://ilp.interledger-test.dev/angeel",
  "recipientWalletUrl": "https://ilp.interledger-test.dev/ronaldoelguapo",
  "amount": { "value": "1000", "assetCode": "USD", "assetScale": 2 }
}
```

### Split Payment (Pagos divididos)

Permite dividir un pago entre varios receptores con una única autorización.

1. Cliente → `POST /api/split-payments/checkout`
2. Backend crea múltiples incoming payments (uno por receptor)
3. Solicita un grant interactivo único y devuelve `redirectUrl`
4. Usuario autoriza el split en la wallet
5. Cliente → `POST /api/split-payments/:id/complete`
6. Backend crea outgoing payments paralelos
7. Firestore actualiza el estado global

#### Ejemplo de request

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

## 💳 Integración con Open Payments

La integración utiliza el SDK oficial `@interledger/open-payments` con autenticación mediante clave privada y `keyId`, siguiendo GNAP.

Ejemplo de solicitud de grant (simplificado):

```js
await client.grant.request({ url: wallet.authServer }, {
  access_token: { access: [{ type: 'quote', actions: ['create'] }] },
  interact: { start: ['redirect'], finish: 'redirect' }
});
```

## 🧠 Manejo de estados en Firestore

Cada pago se guarda con un estado que refleja su ciclo de vida:

| Estado | Descripción |
|---|---|
| PENDING_AUTHORIZATION | Esperando confirmación del usuario |
| COMPLETED | Pago exitoso |
| PARTIAL | En split payments, algunos pagos fallaron |
| FAILED | Error general en el flujo |

## 🔐 Seguridad y buenas prácticas

- Rate limiting con Redis
- CORS configurado dinámicamente
- Helmet.js para headers seguros
- Validación exhaustiva de inputs
- Logs estructurados para auditoría (Winston)
- No se exponen tokens ni claves privadas en respuestas

## 🚧 Aprendizajes y retos

Desafíos encontrados durante la integración:

- Entender el flujo interactivo de GNAP y cuándo usar grants vs tokens directos.
- Manejar errores en quotes cuando la autorización aún no se ha completado.
- Coordinar Split Payments para asegurar que todos los receptores reciban su parte.
- Asegurar idempotencia y auditoría en Firestore.

Finalmente se lograron ejecutar pagos P2P y Split en el entorno de prueba `https://ilp.interledger-test.dev/`, con autorización y persistencia.

## 📚 Referencias

- Open Payments Guide
- Interledger Protocol
- GNAP Specification (IETF Draft)

## 👥 Equipo

Los Vibecoders
