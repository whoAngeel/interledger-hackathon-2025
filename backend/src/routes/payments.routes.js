import express from "express";
import paymentsController from "../controllers/payments.controller.js";

const router = express.Router();

// Obtener info de una wallet
router.get(
  "/wallet",
  paymentsController.getWalletInfo.bind(paymentsController)
);

// Iniciar un pago
router.post(
  "/initiate",
  paymentsController.initiatePayment.bind(paymentsController)
);

// Iniciar un split payment
router.post(
  "/split",
  paymentsController.initiateSplitPayment.bind(paymentsController)
);
// Completar un pago (después de autorización)
router.post(
  "/:paymentId/complete",
  paymentsController.completePayment.bind(paymentsController)
);

// Obtener estado de un pago
router.get(
  "/:paymentId",
  paymentsController.getPaymentStatus.bind(paymentsController)
);

export default router;
