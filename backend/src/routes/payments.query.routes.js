import express from "express";
import paymentsQueryController from "../controllers/payments.query.controller.js";

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

// ⚠️ Esta ruta con parámetro debe ir AL FINAL
router.get(
  "/:paymentId",
  paymentsQueryController.getPaymentById.bind(paymentsQueryController)
);

export default router;
