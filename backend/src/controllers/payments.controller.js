import openPaymentsService from "../services/open.payments.service.js";
import firestoreService from "../services/firestore.service.js";
import cacheService from "../services/cache.service.js";
import { success, error } from "../utils/response.js";
import log from "../utils/logger.js";
import { randomUUID } from "crypto";

class PaymentsController {
  // GET /api/payments/wallet/:walletUrl - Obtener info de una wallet
  async getWalletInfo(req, res, next) {
    try {
      const walletUrl = decodeURIComponent(req.query.walletUrl);

      if (!walletUrl) {
        return error(res, "Falta el parámetro walletUrl", 400);
      }

      // Intentar obtener de cache
      const cached = await cacheService.get(`wallet:${walletUrl}`);
      if (cached) {
        log.debug("Wallet info obtenida de cache");
        return success(res, cached, "Wallet info (cached)");
      }

      const walletInfo = await openPaymentsService.getWalletAddress(walletUrl);

      // Guardar en cache por 5 minutos
      await cacheService.set(`wallet:${walletUrl}`, walletInfo, 300);

      return success(res, walletInfo, "Wallet info obtenida");
    } catch (err) {
      next(err);
    }
  }

  // POST /api/payments/initiate - Iniciar un pago
  async initiatePayment(req, res, next) {
    try {
      const { senderWalletUrl, recipientWalletUrl, amount } = req.body;

      // Validaciones básicas
      if (!senderWalletUrl || !recipientWalletUrl || !amount) {
        return error(res, "Faltan campos requeridos", 400, {
          required: ["senderWalletUrl", "recipientWalletUrl", "amount"],
        });
      }

      if (!amount.value || !amount.assetCode) {
        return error(res, "Amount debe tener value y assetCode", 400);
      }

      // Generar ID único para este pago
      const paymentId = randomUUID();

      log.info("Iniciando pago:", {
        paymentId,
        senderWalletUrl,
        recipientWalletUrl,
      });

      // Iniciar flujo de pago
      const paymentFlow = await openPaymentsService.initiatePayment(
        senderWalletUrl,
        recipientWalletUrl,
        amount
      );

      // Guardar en Firestore
      await firestoreService.create("payments", paymentId, {
        senderWalletUrl,
        recipientWalletUrl,
        amount,
        status: "PENDING_AUTHORIZATION",
        incomingPaymentId: paymentFlow.incomingPayment.id,
        quoteId: paymentFlow.quote.id,
        continueUri: paymentFlow.grantRequest.continueUri,
        continueToken: paymentFlow.grantRequest.continueToken,
        redirectUrl: paymentFlow.grantRequest.redirectUrl,
        debitAmount: paymentFlow.quote.debitAmount,
        receiveAmount: paymentFlow.quote.receiveAmount,
      });

      // Guardar en cache por 10 minutos
      await cacheService.set(`payment:${paymentId}`, paymentFlow, 600);

      return success(
        res,
        {
          paymentId,
          redirectUrl: paymentFlow.grantRequest.redirectUrl,
          status: "PENDING_AUTHORIZATION",
          quote: {
            debitAmount: paymentFlow.quote.debitAmount,
            receiveAmount: paymentFlow.quote.receiveAmount,
          },
          message: "El usuario debe autorizar el pago en la URL proporcionada",
        },
        "Pago iniciado",
        201
      );
    } catch (err) {
      next(err);
    }
  }

  // POST /api/payments/:paymentId/complete - Completar pago después de autorización
  async completePayment(req, res, next) {
    try {
      const { paymentId } = req.params;

      log.info("Completando pago:", { paymentId });

      // Obtener datos del pago de Firestore
      const payment = await firestoreService.getById("payments", paymentId);

      if (!payment) {
        return error(res, "Pago no encontrado", 404);
      }

      if (payment.status !== "PENDING_AUTHORIZATION") {
        return error(res, `El pago ya está en estado: ${payment.status}`, 400);
      }

      // Finalizar grant
      const finalizedGrant =
        await openPaymentsService.finalizeOutgoingPaymentGrant(
          payment.continueUri,
          payment.continueToken
        );

      // Crear outgoing payment
      const outgoingPayment = await openPaymentsService.createOutgoingPayment(
        payment.senderWalletUrl,
        payment.quoteId,
        finalizedGrant.access_token.value
      );

      // Actualizar en Firestore
      await firestoreService.update("payments", paymentId, {
        status: outgoingPayment.failed ? "FAILED" : "COMPLETED",
        outgoingPaymentId: outgoingPayment.id,
        completedAt: new Date().toISOString(),
        outgoingPayment: outgoingPayment,
      });

      // Limpiar cache
      await cacheService.delete(`payment:${paymentId}`);

      return success(
        res,
        {
          paymentId,
          status: outgoingPayment.failed ? "FAILED" : "COMPLETED",
          outgoingPayment,
        },
        "Pago completado"
      );
    } catch (err) {
      // Marcar como fallido en caso de error
      try {
        await firestoreService.update("payments", req.params.paymentId, {
          status: "FAILED",
          error: err.message,
          failedAt: new Date().toISOString(),
        });
      } catch (updateError) {
        log.error("Error actualizando estado de pago fallido:", updateError);
      }
      next(err);
    }
  }

  // GET /api/payments/:paymentId - Obtener estado de un pago
  async getPaymentStatus(req, res, next) {
    try {
      const { paymentId } = req.params;

      // Intentar obtener de cache
      const cached = await cacheService.get(`payment:${paymentId}`);
      if (cached) {
        return success(res, cached, "Payment status (cached)");
      }

      const payment = await firestoreService.getById("payments", paymentId);

      if (!payment) {
        return error(res, "Pago no encontrado", 404);
      }

      return success(res, payment, "Payment status");
    } catch (err) {
      next(err);
    }
  }

  // POST /api/payments/split
  async initiateSplitPayment(req, res, next) {
    try {
      const { senderWalletUrl, recipients } = req.body;

      if (
        !senderWalletUrl ||
        !Array.isArray(recipients) ||
        recipients.length < 2
      ) {
        return error(
          res,
          "Se requieren senderWalletUrl y al menos 2 recipients",
          400
        );
      }

      // Generar ID del split payment
      const paymentId = randomUUID();

      log.info("Iniciando split payment:", {
        paymentId,
        senderWalletUrl,
        recipients: recipients.map((r) => r.walletUrl),
      });

      // Log completo de recipients para debugging (no contiene secrets)
      console.debug(
        "[PaymentsController] recipients payload:",
        JSON.stringify(recipients)
      );

      const splitFlow = await openPaymentsService.createSplitPayment(
        senderWalletUrl,
        recipients
      );

      // Guardar en Firestore
      await firestoreService.create("splitPayments", paymentId, {
        senderWalletUrl,
        recipients,
        status: "PENDING_AUTHORIZATION",
        quoteId: splitFlow.quote.id,
        incomingPayments: splitFlow.incomingPayments.map((i) => i.id),
        continueUri: splitFlow.grantRequest.continueUri,
        continueToken: splitFlow.grantRequest.continueToken,
        redirectUrl: splitFlow.grantRequest.redirectUrl,
        debitAmount: splitFlow.quote.debitAmount,
      });

      // Guardar en cache (opcional)
      await cacheService.set(`split:${paymentId}`, splitFlow, 600);

      return success(
        res,
        {
          paymentId,
          redirectUrl: splitFlow.grantRequest.redirectUrl,
          quote: splitFlow.quote,
          status: "PENDING_AUTHORIZATION",
        },
        "Split payment iniciado",
        201
      );
    } catch (err) {
      next(err);
    }
  }
}

export default new PaymentsController();
