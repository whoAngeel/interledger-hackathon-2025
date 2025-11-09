import dotenv from "dotenv";
import app from "./src/app.js";
import { initializeRedis } from "./src/config/redis.js";
import { initializeFirestore } from "./src/config/firestore.js";
import { initializeOpenPayments } from "./src/config/openPayments.js";
import firestoreService from "./src/services/firestore.service.js";
import cacheService from "./src/services/cache.service.js";
import openPaymentsService from "./src/services/open.payments.service.js";
import log from "./src/utils/logger.js";

dotenv.config();

const PORT = process.env.PORT || 8080; // Cambiar de 3000 a 8080

async function startServer() {
  try {
    log.info("🚀 Inicializando servicios...");

    // Inicializar conexiones
    await initializeFirestore();
    await initializeRedis();
    await initializeOpenPayments();

    // Inicializar servicios
    firestoreService.initialize();
    cacheService.initialize();
    openPaymentsService.initialize();

    log.info("✅ Todos los servicios inicializados");

    // Iniciar servidor
    app.listen(PORT, () => {
      log.info(`🚀 Servidor corriendo en puerto ${PORT}`);
      log.info(`📍 Ambiente: ${process.env.NODE_ENV}`);
      log.info(`🔗 Health check: http://localhost:${PORT}/health`);
      log.info(`💳 Payments API: http://localhost:${PORT}/api/payments`);
    });
  } catch (error) {
    log.error("❌ Error iniciando servidor:", error);
    process.exit(1);
  }
}

// Manejo de errores no capturados
process.on("unhandledRejection", (reason, promise) => {
  log.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  log.error("Uncaught Exception:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  log.info("SIGTERM recibido, cerrando servidor...");
  process.exit(0);
});

process.on("SIGINT", () => {
  log.info("SIGINT recibido, cerrando servidor...");
  process.exit(0);
});

startServer();
