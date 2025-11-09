import express from "express";
import splitPaymentsController from "../controllers/splitpayments.controller.js";

const router = express.Router();

// Iniciar split payment (checkout)
router.post(
  "/checkout",
  splitPaymentsController.initiateSplitPayment.bind(splitPaymentsController)
);

// Callback del IDP después de autorización
router.get(
  "/callback",
  splitPaymentsController.handleCallback.bind(splitPaymentsController)
);

// Completar split payment (opcional, para uso manual)
router.post(
  "/:splitPaymentId/complete",
  splitPaymentsController.completeSplitPayment.bind(splitPaymentsController)
);

// Obtener estado de split payment
router.get(
  "/:splitPaymentId",
  splitPaymentsController.getSplitPaymentStatus.bind(splitPaymentsController)
);

export default router;
