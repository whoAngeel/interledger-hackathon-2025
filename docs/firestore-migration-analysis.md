# Análisis de Migración: Firestore → Almacenamiento Alternativo

> **Fecha:** 2026-06-19
> **Propósito:** Evaluar implicaciones técnicas y arquitectónicas de reemplazar Firestore por otro motor de base de datos.

---

## 1. Uso Actual de Firestore en el Código

### 1.1 Colecciones / Colecciones

| Colección | Propósito | Operaciones |
|---|---|---|
| `payments` | Pagos P2P individuales | `create`, `getById`, `update`, `query` con filtros |
| `split_payments` | Pagos divididos entre múltiples receptores | `create`, `getById`, `update`, `query` con filtros |
| `splitPayments` | (Legado, usado en `payments.controller.js:234`) | `create` |

### 1.2 Archivos que tocan Firestore

| Archivo | Rol | Líneas afectadas |
|---|---|---|
| `src/config/firestore.js` | Inicialización y conexión | 107 líneas (TODO el archivo) |
| `src/services/firestore.service.js` | Capa de abstracción CRUD | 117 líneas (TODO el archivo) |
| `src/services/payments.query.service.js` | Consultas avanzadas con filtros | 353 líneas (TODO el archivo) |
| `src/controllers/payments.controller.js` | Orquestador de pagos P2P | ~30 líneas |
| `src/controllers/splitpayments.controller.js` | Orquestador de split payments | ~40 líneas |
| `server.js` | Inicialización de servicios | 3 líneas |

### 1.3 Operaciones CRUD Requeridas

```
firestoreService.create(collection, id, data)
  → Inserta documento con createdAt/updatedAt automáticos

firestoreService.getById(collection, id)
  → Obtiene documento por ID exacto

firestoreService.update(collection, id, data)
  → Actualiza campos parciales, agrega updatedAt

firestoreService.query(collection, filters)
  → Filtros tipo [{ field, operator, value }]
  → Los operadores usados son: "==", ">=", "<="

firestoreService.softDelete(collection, id)
  → Marca deleted: true + deletedAt (nunca borra físicamente)
```

### 1.4 Patrones de Query Avanzados (payments.query.service.js)

```javascript
// Filtros compuestos con ordenamiento
db.collection("payments")
  .where("status", "==", status)
  .where("createdAt", ">=", startDate)
  .where("createdAt", "<=", endDate)
  .orderBy("createdAt", "desc")

// Lectura por ID exacto (búsqueda en 2 colecciones en paralelo)
db.collection("payments").doc(searchTerm).get()
db.collection("split_payments").doc(searchTerm).get()

// Filtro en memoria post-query (Firestore no soporta OR nativo)
docs.filter(payment =>
  payment.senderWalletUrl === walletUrl ||
  payment.recipientWalletUrl === walletUrl
)
```

### 1.5 Campos Específicos Almacenados

#### Documento `payments`
```json
{
  "senderWalletUrl": "string",
  "recipientWalletUrl": "string",
  "amount": { "value": "string", "assetCode": "string" },
  "status": "PENDING_AUTHORIZATION | COMPLETED | FAILED",
  "incomingPaymentId": "string",
  "quoteId": "string",
  "continueUri": "string",
  "continueToken": "string",
  "redirectUrl": "string",
  "debitAmount": { "value": "string", "assetCode": "string", "assetScale": "number" },
  "receiveAmount": { "value": "string", "assetCode": "string", "assetScale": "number" },
  "outgoingPaymentId": "string",
  "completedAt": "ISO8601",
  "failedAt": "ISO8601",
  "error": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

#### Documento `split_payments`
```json
{
  "senderWalletUrl": "string",
  "recipients": [{ "walletUrl": "string", "percentage": "number" }],
  "totalAmount": { "value": "string", "assetCode": "string" },
  "status": "PENDING_AUTHORIZATION | COMPLETED | FAILED | PARTIAL",
  "incomingPayments": [{ "recipient": "string", "percentage": "number", "amount": "number", "assetCode": "string", "assetScale": "number", "incomingPaymentId": "string" }],
  "incomingPaymentErrors": [],
  "quotes": [{ "recipient": "string", "percentage": "number", "quoteId": "string", "debitAmount": {}, "receiveAmount": {} }],
  "continueUri": "string",
  "continueToken": "string",
  "redirectUrl": "string",
  "totalDebitAmount": { "value": "string", "assetCode": "string", "assetScale": "number" },
  "outgoingPayments": [],
  "errors": [],
  "completedAt": "ISO8601",
  "failedAt": "ISO8601",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

---

## 2. Candidatos de Reemplazo

### 2.1 Comparativa Rápida

| Característica | MongoDB | PostgreSQL (JSONB) | DynamoDB | Supabase | SQLite (Turso/LibSQL) |
|---|---|---|---|---|---|
| **Tipo** | NoSQL Documento | SQL + JSONB | NoSQL Key-Value+ | PostgreSQL hosted | SQL embebido |
| **Similitud con Firestore** | Alta | Media | Media-Alta | Baja (es PG) | Baja |
| **Self-hosted** | Sí | Sí | No (AWS) | Sí/Cloud | Sí |
| **Consultas flexibles** | Alta | Muy alta | Baja (requiere GSIs) | Muy alta | Alta |
| **Índices compuestos** | Sí | Sí | GSIs limitados | Sí | Sí |
| **Filtros en memoria** | No necesario | No necesario | Parcial | No necesario | No necesario |
| **Transacciones** | Sí (v4+) | Sí (ACID) | Sí (limitadas) | Sí (ACID) | Sí (ACID) |
| **Peso operacional** | Medio | Alto | Bajo (managed) | Bajo (managed) | Muy bajo |
| **Presupuesto** | $0 (self) | $0 (self) | Pay-per-request | Free tier → $25/mo | $0 (self) |

### 2.2 Recomendación: **MongoDB**

**Justificación:**
- Es el reemplazo más directo: NoSQL documento → NoSQL documento
- Las colecciones de Firestore mapean 1:1 a colecciones de MongoDB
- Los documentos JSON no requieren transformación de esquema
- El 90% de las queries actuales se traducen directamente
- Self-hosted sin dependencia de GCP → portabilidad total
- Ya tienes Redis corriendo en Docker, agregar MongoDB es trivial

---

## 3. Implicaciones Técnicas de la Migración

### 3.1 Cambios en Código

| Archivo | Cambio Requerido | Complejidad |
|---|---|---|
| `src/config/firestore.js` | Eliminar. Crear `src/config/mongo.js` | Baja |
| `src/services/firestore.service.js` | Reescribir como `mongo.service.js` | Media |
| `src/services/payments.query.service.js` | Adaptar queries compuestas | Media |
| `src/controllers/payments.controller.js` | Cambiar imports y llamadas | Baja |
| `src/controllers/splitpayments.controller.js` | Cambiar imports y llamadas | Baja |
| `server.js` | Cambiar `initializeFirestore` → `initializeMongo` | Baja |
| `package.json` | Eliminar `@google-cloud/firestore`, agregar `mongodb` o `mongoose` | Baja |
| `docker-compose.yml` | Agregar servicio `mongo` | Baja |
| `env.example` / `.env` | Cambiar variables GCP → MongoDB URI | Baja |

### 3.2 Mapeo de Operaciones Firestore → MongoDB

```javascript
// Firestore: db.collection("payments").doc(id).set(data)
// MongoDB:  db.collection("payments").insertOne({ _id: id, ...data })

// Firestore: db.collection("payments").doc(id).get()
// MongoDB:  db.collection("payments").findOne({ _id: id })

// Firestore: db.collection("payments").doc(id).update(data)
// MongoDB:  db.collection("payments").updateOne({ _id: id }, { $set: data })

// Firestore: db.collection("payments").where("status", "==", "COMPLETED")
// MongoDB:  db.collection("payments").find({ status: "COMPLETED" })

// Firestore: db.collection("payments").where("createdAt", ">=", date)
// MongoDB:  db.collection("payments").find({ createdAt: { $gte: date } })

// Firestore: .orderBy("createdAt", "desc")
// MongoDB:  .sort({ createdAt: -1 })

// Firestore: .where("status", "==", s).where("createdAt", ">=", d1).where("createdAt", "<=", d2)
// MongoDB:  .find({ status: s, createdAt: { $gte: d1, $lte: d2 } })
```

### 3.3 Ventajas de Mongo sobre Firestore para este caso

1. **$or nativo** → Elimina filtros en memoria del `payments.query.service.js`
2. **Agregaciones** → Las estadísticas (`getPaymentStats`) se pueden hacer con aggregation pipeline en vez de iterar en JS
3. **Índices explícitos** → Control total sobre qué campos se indexan
4. **Sin dependencia de GCP** → El proyecto funciona 100% offline/local
5. **Transacciones multi-documento** → Split payments pueden ser atómicos
6. **Change Streams** → Reemplazo nativo para WebSocket de notificaciones

### 3.4 Desventajas

1. **Mayor consumo de RAM** (~512MB mínimo recomendado para MongoDB)
2. **Docker compose más pesado** (imagen ~400MB vs Redis ~30MB)
3. **Sin serverless nativo** como Firestore (pero no aplica si es self-hosted)

---

## 4. Estrategia de Migración Propuesta

### Fase 1: Infraestructura (1-2 horas)

```yaml
# Agregar a docker-compose.yml
mongo:
  image: mongo:7
  container_name: interledger-mongo
  ports:
    - "27017:27017"
  environment:
    MONGO_INITDB_DATABASE: openpayments
  volumes:
    - mongo-data:/data/db
  networks:
    - app-network
  healthcheck:
    test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
    interval: 10s
    timeout: 3s
    retries: 3
```

```bash
# Nuevas variables de entorno
MONGO_URI=mongodb://localhost:27017/openpayments
# Eliminar:
# GOOGLE_APPLICATION_CREDENTIALS, GCP_PROJECT_ID, FIRESTORE_DATABASE_ID
```

### Fase 2: Capa de Datos (3-4 horas)

Crear `src/config/mongo.js` y `src/services/mongo.service.js` con la misma interfaz que `firestore.service.js`:

```javascript
// La interfaz pública debe ser idéntica para minimizar
// cambios en controllers:
class MongoService {
  async create(collection, id, data) { ... }
  async getById(collection, id) { ... }
  async update(collection, id, data) { ... }
  async query(collection, filters) { ... }
  async softDelete(collection, id) { ... }
}
```

### Fase 3: Queries Avanzadas (2-3 horas)

Refactorizar `payments.query.service.js` para usar aggregations de MongoDB en lugar de `filter()` en memoria + combinación manual:

```javascript
// Antes: Dos queries paralelas + filter JS + sort JS + slice JS
// Después: Aggregation pipeline con $unionWith, $match, $sort, $skip, $limit
```

### Fase 4: Verificación (1-2 horas)

```bash
# Pruebas manuales de cada endpoint
curl -X POST http://localhost:3000/api/payments/initiate -H "Content-Type: application/json" -d '{...}'
curl http://localhost:3000/api/payments/list
curl http://localhost:3000/api/payments/stats
curl -X POST http://localhost:3000/api/split-payments/checkout -H "Content-Type: application/json" -d '{...}'
```

---

## 5. Plan de Acción Resumido

| Paso | Acción | Archivos |
|---|---|---|
| 1 | Agregar MongoDB a `docker-compose.yml` | `docker-compose.yml`, `docker-compose.dev.yml` |
| 2 | Crear `MONGO_URI` en `.env` y `env.example` | `env.example` |
| 3 | Crear `src/config/mongo.js` | Nuevo archivo |
| 4 | Crear `src/services/mongo.service.js` | Nuevo archivo |
| 5 | Refactorizar `payments.query.service.js` | Modificar existente |
| 6 | Actualizar imports en `payments.controller.js` | Modificar existente |
| 7 | Actualizar imports en `splitpayments.controller.js` | Modificar existente |
| 8 | Actualizar `server.js` | Modificar existente |
| 9 | Eliminar `@google-cloud/firestore` de `package.json` | Modificar existente |
| 10 | Agregar `mongodb` (driver nativo) a `package.json` | Modificar existente |
| 11 | Opcional: eliminar `@google-cloud/storage` si no se usa | Modificar existente |
| 12 | Probar todos los endpoints | Manual/script |

### Dependencias a instalar/eliminar

```bash
npm uninstall @google-cloud/firestore @google-cloud/storage
npm install mongodb
```

### Archivos que se eliminan
- `src/config/firestore.js` → reemplazado por `src/config/mongo.js`
- `src/services/firestore.service.js` → reemplazado por `src/services/mongo.service.js`
- `credentials.json` (ya no necesario)
- `dev.key` (solo si no se usa Open Payments, pero este SÍ se necesita)

### Archivos que se modifican
- `server.js:4` — `import { initializeFirestore }` → `import { initializeMongo }`
- `server.js:20` — `await initializeFirestore()` → `await initializeMongo()`
- `src/controllers/payments.controller.js:2` — import firestoreService → mongoService
- `src/controllers/splitpayments.controller.js:2` — ídem
- `src/services/payments.query.service.js` — reescribir queries
- `docker-compose.yml` — agregar servicio mongo
- `env.example` — reemplazar vars GCP por `MONGO_URI`

---

## 6. Alternativas Consideradas y Descartadas

### PostgreSQL
- **Descartada por:** Sobrecarga innecesaria. Los datos son documentos JSON sin relaciones complejas. No hay JOINs en el código actual. Migrar documentos anidados a tablas normalizadas es trabajo extra sin beneficio.

### DynamoDB
- **Descartada por:** Vendor lock-in (AWS). Mismas limitaciones de queries que Firestore. Requiere definir GSIs para cada patrón de acceso.

### Supabase
- **Descartada por:** Es PostgreSQL con esteroides. Mismo problema que PG. El BaaS añade complejidad innecesaria para un backend que ya tiene su propia API.

### SQLite (Turso/LibSQL)
- **Descartada por:** Las queries actuales dependen de campos anidados y búsquedas flexibles. SQLite requeriría un ORM o queries JSON complejas.

---

## 7. Riesgos Identificados

| Riesgo | Mitigación |
|---|---|
| **Regresión en queries** | Mantener misma interfaz `firestoreService` → `mongoService` para que controllers no cambien |
| **Índices faltantes** | Crear índices en `createdAt`, `status`, `senderWalletUrl` al inicializar |
| **Datos existentes en Firestore** | Script de exportación JSON → importación a MongoDB si hay datos que migrar |
| **Conexión a MongoDB caída** | Mismo patrón de reconexión que Redis: `server.js` no inicia hasta que Mongo responda |
| **Timestamps inconsistentes** | Seguir usando `new Date().toISOString()` como ya se hace |
