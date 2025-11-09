Backend – Integración con Open Payments (Interledger)

Este backend implementa pagos P2P (peer-to-peer) y Split Payments (pagos divididos) utilizando el estándar Open Payments
 del ecosistema Interledger.

Diseñado para demostrar pagos interoperables, programables y seguros entre wallets distintas, siguiendo el protocolo GNAP para autorización.

🧠 Propósito del Proyecto

En el contexto del hackathon, nuestro objetivo fue integrar Open Payments en un backend real que permitiera:

Pagos entre usuarios (wallets distintas) sin depender de un proveedor centralizado.

Pagos divididos (Split Payments) donde un mismo monto se reparte automáticamente entre varios receptores.

Autorización del usuario final mediante el flujo interactivo de GNAP (con redirect URL).

Persistencia de transacciones, estados y logs para trazabilidad en Firestore.

📋 Tabla de Contenidos

Arquitectura

Configuración

Flujos de Pago

Integración con Open Payments

Seguridad

Aprendizajes y Retos

Referencias

🏗️ Arquitectura
backend/
├── src/
│   ├── config/                  # Configuración de servicios externos
│   ├── controllers/             # Lógica de entrada de endpoints
│   ├── services/                # Lógica de negocio (Open Payments, Firestore, Redis)
│   ├── routes/                  # Definición de rutas Express
│   └── middleware/              # Logging y manejo de errores
└── server.js                    # Punto de entrada principal

🧩 Tecnologías Clave
Componente	Uso
Express.js	Framework backend
@interledger/open-payments	SDK oficial para integrar Open Payments
Firestore (GCP)	Persistencia de pagos, grants y logs
Redis	Cache y rate-limiting
Winston	Logging estructurado
Docker	Entorno de despliegue portable
⚙️ Configuración

Crea un archivo .env basado en env.example:

PORT=3000
WALLET_ADDRESS_URL=https://ilp.interledger-test.dev/tu_usuario
PRIVATE_KEY_PATH=./keys/private-key.pem
KEY_ID=mi-key-id
GOOGLE_APPLICATION_CREDENTIALS=credentials.json
FIRESTORE_DATABASE_ID=opendb
FRONTEND_URL=http://localhost:3001
CALLBACK_BASE_URL=http://localhost:3000

Instalación y ejecución
npm install
npm run dev
# o con Docker
npm run docker:dev

🔄 Flujos de Pago

Los pagos usan el modelo cliente → backend → Open Payments.
Ambos tipos (P2P y Split) siguen el principio de grants interactivos, es decir, el usuario debe autorizar cada pago.

🧍 Pago P2P (Peer-to-Peer)
1. Cliente → POST /api/payments/initiate
2. Backend crea incoming payment en wallet del receptor
3. Backend genera quote y solicita grant interactivo
4. Devuelve redirectUrl al cliente
5. Usuario autoriza en la wallet
6. Cliente → POST /api/payments/:id/complete
7. Backend finaliza grant y ejecuta outgoing payment


🧩 Ejemplo de request

{
  "senderWalletUrl": "https://ilp.interledger-test.dev/alice",
  "recipientWalletUrl": "https://ilp.interledger-test.dev/bob",
  "amount": { "value": "1000", "assetCode": "USD", "assetScale": 2 }
}

🤝 Split Payment (Pagos Divididos)

Permite dividir un solo pago entre múltiples receptores con una sola autorización del usuario.

1. Cliente → POST /api/split-payments/checkout
2. Backend crea múltiples incoming payments (uno por receptor)
3. Solicita grant interactivo (único) y devuelve redirectUrl
4. Usuario autoriza el split en la wallet
5. Cliente → POST /api/split-payments/:id/complete
6. Backend crea los outgoing payments paralelos
7. Firestore actualiza estado global


🧩 Ejemplo de request

{
  "senderWalletUrl": "https://ilp.interledger-test.dev/alice",
  "recipients": [
    { "walletUrl": "https://ilp.interledger-test.dev/bob", "percentage": 70 },
    { "walletUrl": "https://ilp.interledger-test.dev/charlie", "percentage": 30 }
  ],
  "totalAmount": { "value": "1000", "assetCode": "USD", "assetScale": 2 }
}

💳 Integración con Open Payments

Nuestra integración se basa completamente en el SDK oficial @interledger/open-payments, con autenticación mediante clave privada y keyId, siguiendo el estándar GNAP.

🔐 Flujo de Autorización (GNAP interactivo)

Cada pago requiere una autorización interactiva del usuario:

El backend solicita un grant con interact.redirect.

El servidor de la wallet devuelve una redirect URL.

El usuario aprueba o rechaza el pago desde su wallet.

Nuestro backend recibe la confirmación y ejecuta el pago final.

Ejemplo de solicitud de grant:

await client.grant.request({ url: wallet.authServer }, {
  access_token: { access: [{ type: 'quote', actions: ['create'] }] },
  interact: { start: ['redirect'], finish: 'redirect' }
});

🧠 Manejo de Estados en Firestore

Cada pago se guarda con su estado:

Estado	Descripción
PENDING_AUTHORIZATION	Esperando confirmación del usuario
COMPLETED	Pago exitoso
PARTIAL	En split payments, algunos pagos fallaron
FAILED	Error general en el flujo

Esto nos permitió visualizar todo el ciclo de vida de cada pago dentro del hackathon.

🔐 Seguridad y Buenas Prácticas

Rate limiting con Redis

CORS configurado dinámicamente

Helmet.js para headers seguros

Validación exhaustiva de inputs

Logs estructurados para auditoría (Winston)

No se exponen tokens ni claves privadas en respuestas

🚧 Aprendizajes y Retos

Durante la integración encontramos varios desafíos:

Entender el flujo interactivo de GNAP (y cuándo usar grants vs tokens directos).

Manejar errores de quote vacíos cuando el usuario aún no autoriza.

Implementar Split Payments sincronizados, asegurando que todos los receptores reciban su parte correctamente.

Asegurar que los pagos sean idempotentes y auditables en Firestore.

💡 Finalmente logramos ejecutar pagos P2P y Split reales en el entorno de prueba https://ilp.interledger-test.dev/, con autorización de usuario y persistencia completa.

📚 Referencias

Open Payments Guide

Interledger Protocol

GNAP Specification (IETF Draft)

👥 Equipo

Los Vibecoders