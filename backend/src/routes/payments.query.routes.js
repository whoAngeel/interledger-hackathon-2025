import express from "express";
import paymentsQueryController from "../controllers/payments.query.controller.js";
import paymentsController from "../controllers/payments.controller.js";

const router = express.Router();

// ⚠️ IMPORTANTE: Las rutas específicas ANTES de las rutas con parámetros

// Listar pagos con filtros y paginación
router.get(
  "/list",
  paymentsQueryController.listPayments.bind(paymentsQueryController)
);

// Obtener estadísticas
router.get(
  "/stats",
  paymentsQueryController.getPaymentStats.bind(paymentsQueryController)
);

// Buscar pagos por ID
router.get(
  "/search",
  paymentsQueryController.searchPayments.bind(paymentsQueryController)
);

// Callback automático de autorización (GNAP finish redirect)
router.get(
  "/callback",
  paymentsController.handleCallback.bind(paymentsController)
);

// ⚠️ Esta ruta con parámetro debe ir AL FINAL
router.get(
  "/:paymentId",
  paymentsQueryController.getPaymentById.bind(paymentsQueryController)
);

export default router;
