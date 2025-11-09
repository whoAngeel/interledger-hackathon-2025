import openPaymentsService from "../services/open.payments.service.js";
import firestoreService from "../services/firestore.service.js";
import cacheService from "../services/cache.service.js";
import { success, error } from "../utils/response.js";
import log from "../utils/logger.js";
import { randomUUID } from "crypto";

class SplitPaymentsController {
  // POST /api/split-payments/checkout - Iniciar split payment
  async initiateSplitPayment(req, res, next) {
    try {
      const { senderWalletUrl, recipients, totalAmount } = req.body;

      // Validaciones
      if (!senderWalletUrl || !recipients || !totalAmount) {
        return error(res, "Faltan campos requeridos", 400, {
          required: ["senderWalletUrl", "recipients", "totalAmount"],
        });
      }

      if (!Array.isArray(recipients) || recipients.length === 0) {
        return error(
          res,
          "recipients debe ser un array con al menos 1 receptor",
          400
        );
      }

      // Validar estructura de recipients
      for (const recipient of recipients) {
        if (!recipient.walletUrl || !recipient.percentage) {
          return error(
            res,
            "Cada recipient debe tener walletUrl y percentage",
            400
          );
        }
        if (recipient.percentage <= 0 || recipient.percentage > 100) {
          return error(res, "percentage debe estar entre 0 y 100", 400);
        }
      }

      // Validar que porcentajes sumen 100%
      const totalPercentage = recipients.reduce(
        (sum, r) => sum + r.percentage,
        0
      );
      if (Math.abs(totalPercentage - 100) > 0.01) {
        return error(
          res,
          `Los porcentajes deben sumar 100%. Actual: ${totalPercentage}%`,
          400
        );
      }

      if (!totalAmount.value || !totalAmount.assetCode) {
        return error(res, "totalAmount debe tener value y assetCode", 400);
      }

      // Generar ID único
      const splitPaymentId = randomUUID();

      log.info("Iniciando split payment:", {
        splitPaymentId,
        senderWalletUrl,
        recipients: recipients.length,
        totalAmount,
      });

      // Iniciar flujo de split payment
      const splitFlow = await openPaymentsService.initiateSplitPayment(
        senderWalletUrl,
        recipients,
        totalAmount
      );

      // Guardar en Firestore (igual que P2P)
      await firestoreService.create("split_payments", splitPaymentId, {
        senderWalletUrl,
        recipients,
        totalAmount,
        status: "PENDING_AUTHORIZATION",
        incomingPayments: splitFlow.incomingPayments.map((ip) => ({
          recipient: ip.recipient,
          percentage: ip.percentage,
          amount: ip.amount,
          assetCode: ip.assetCode || ip.incomingPayment.incomingAmount.assetCode, // Asset detectado
          assetScale: ip.assetScale || ip.incomingPayment.incomingAmount.assetScale,
          incomingPaymentId: ip.incomingPayment.id,
        })),
        incomingPaymentErrors: splitFlow.errors || [],
        quotes: splitFlow.quotes.map((q) => ({
          recipient: q.recipient,
          percentage: q.percentage,
          quoteId: q.quote.id,
          debitAmount: q.quote.debitAmount,
          receiveAmount: q.quote.receiveAmount,
        })),
        continueUri: splitFlow.grantRequest.continueUri,
        continueToken: splitFlow.grantRequest.continueToken,
        redirectUrl: splitFlow.grantRequest.redirectUrl,
        totalDebitAmount: splitFlow.grantRequest.totalDebitAmount,
      });

      // Guardar en cache por 10 minutos (igual que P2P)
      await cacheService.set(`split_payment:${splitPaymentId}`, splitFlow, 600);

      return success(
        res,
        {
          splitPaymentId,
          redirectUrl: splitFlow.grantRequest.redirectUrl,
          status: "PENDING_AUTHORIZATION",
          summary: splitFlow.summary,
          errors: splitFlow.errors || undefined,
          message: splitFlow.errors && splitFlow.errors.length > 0
            ? `Split payment iniciado con advertencias: ${splitFlow.errors.length} receptor(es) fallaron. El usuario debe autorizar el pago en la URL proporcionada.`
            : "El usuario debe autorizar el pago en la URL proporcionada",
        },
        splitFlow.errors && splitFlow.errors.length > 0
          ? "Split payment iniciado con advertencias"
          : "Split payment iniciado",
        201
      );
    } catch (err) {
      next(err);
    }
  }

  // POST /api/split-payments/:splitPaymentId/complete - Completar split payment (igual que P2P)
  async completeSplitPayment(req, res, next) {
    try {
      const { splitPaymentId } = req.params;

      log.info("Completando split payment:", { splitPaymentId });

      // Obtener datos del split payment
      const splitPayment = await firestoreService.getById(
        "split_payments",
        splitPaymentId
      );

      if (!splitPayment) {
        return error(res, "Split payment no encontrado", 404);
      }

      if (splitPayment.status !== "PENDING_AUTHORIZATION") {
        return error(
          res,
          `El split payment ya está en estado: ${splitPayment.status}`,
          400
        );
      }

      // Finalizar grant
      const finalizedGrant =
        await openPaymentsService.finalizeOutgoingPaymentGrant(
          splitPayment.continueUri,
          splitPayment.continueToken
        );

      // Crear múltiples outgoing payments
      const result =
        await openPaymentsService.createSplitOutgoingPayments(
          splitPayment.senderWalletUrl,
          splitPayment.quotes.map((q) => ({
            recipient: q.recipient,
            percentage: q.percentage,
            quote: { id: q.quoteId },
          })),
          finalizedGrant.access_token.value
        );

      const { outgoingPayments, errors, hasErrors } = result;

      // Verificar si alguno falló (tanto en outgoing payments como en errores)
      const hasFailedPayments = outgoingPayments.some(
        (op) => op.outgoingPayment.failed
      );
      const allCompleted = outgoingPayments.every(
        (op) => !op.outgoingPayment.failed
      );

      // Determinar estado final
      let finalStatus;
      if (hasErrors && outgoingPayments.length === 0) {
        finalStatus = "FAILED";
      } else if (hasErrors || hasFailedPayments) {
        finalStatus = allCompleted ? "COMPLETED" : "PARTIAL";
      } else {
        finalStatus = "COMPLETED";
      }

      // Actualizar en Firestore (igual que P2P)
      await firestoreService.update("split_payments", splitPaymentId, {
        status: finalStatus,
        outgoingPayments: outgoingPayments.map((op) => ({
          recipient: op.recipient,
          percentage: op.percentage,
          outgoingPaymentId: op.outgoingPayment.id,
          failed: op.outgoingPayment.failed,
        })),
        errors: errors.map((e) => ({
          recipient: e.recipient,
          percentage: e.percentage,
          error: e.error,
          quoteId: e.quoteId,
        })),
        completedAt: new Date().toISOString(),
      });

      // Limpiar cache (igual que P2P)
      await cacheService.delete(`split_payment:${splitPaymentId}`);

      return success(
        res,
        {
          splitPaymentId,
          status: finalStatus,
          outgoingPayments: outgoingPayments.map((op) => ({
            recipient: op.recipient,
            percentage: op.percentage,
            outgoingPayment: op.outgoingPayment,
          })),
          errors: errors.length > 0 ? errors : undefined,
          summary: {
            total: splitPayment.quotes.length,
            successful: outgoingPayments.filter(
              (op) => !op.outgoingPayment.failed
            ).length,
            failed: outgoingPayments.filter((op) => op.outgoingPayment.failed)
              .length,
            errors: errors.length,
          },
        },
        finalStatus === "FAILED"
          ? "Split payment falló completamente"
          : finalStatus === "PARTIAL"
            ? "Split payment completado parcialmente"
            : "Split payment completado"
      );
    } catch (err) {
      // Marcar como fallido
      try {
        await firestoreService.update(
          "split_payments",
          req.params.splitPaymentId,
          {
            status: "FAILED",
            error: err.message,
            failedAt: new Date().toISOString(),
          }
        );
      } catch (updateError) {
        log.error("Error actualizando estado:", updateError);
      }
      next(err);
    }
  }

  // GET /api/split-payments/callback - Callback del IDP (opcional, similar a P2P)
  // Nota: El flujo principal usa /complete como en P2P, este callback es opcional
  async handleCallback(req, res, next) {
    try {
      const { interact_ref, hash, splitPaymentId } = req.query;

      if (!splitPaymentId) {
        return error(
          res,
          "Falta el parámetro splitPaymentId en el callback",
          400
        );
      }

      log.info("Callback recibido:", { interact_ref, hash, splitPaymentId });

      // Obtener split payment
      const splitPayment = await firestoreService.getById(
        "split_payments",
        splitPaymentId
      );

      if (!splitPayment) {
        return error(res, "Split payment no encontrado", 404);
      }

      if (splitPayment.status !== "PENDING_AUTHORIZATION") {
        return error(
          res,
          `El split payment ya está en estado: ${splitPayment.status}`,
          400
        );
      }

      // Usar el mismo flujo que completeSplitPayment
      // Finalizar grant
      const finalizedGrant =
        await openPaymentsService.finalizeOutgoingPaymentGrant(
          splitPayment.continueUri,
          splitPayment.continueToken
        );

      // Crear múltiples outgoing payments
      const result =
        await openPaymentsService.createSplitOutgoingPayments(
          splitPayment.senderWalletUrl,
          splitPayment.quotes.map((q) => ({
            recipient: q.recipient,
            percentage: q.percentage,
            quote: { id: q.quoteId },
          })),
          finalizedGrant.access_token.value
        );

      const { outgoingPayments, errors, hasErrors } = result;

      // Verificar si alguno falló (tanto en outgoing payments como en errores)
      const hasFailedPayments = outgoingPayments.some(
        (op) => op.outgoingPayment.failed
      );
      const allCompleted = outgoingPayments.every(
        (op) => !op.outgoingPayment.failed
      );

      // Determinar estado final
      let finalStatus;
      if (hasErrors && outgoingPayments.length === 0) {
        finalStatus = "FAILED";
      } else if (hasErrors || hasFailedPayments) {
        finalStatus = allCompleted ? "COMPLETED" : "PARTIAL";
      } else {
        finalStatus = "COMPLETED";
      }

      // Actualizar en Firestore
      await firestoreService.update("split_payments", splitPaymentId, {
        status: finalStatus,
        outgoingPayments: outgoingPayments.map((op) => ({
          recipient: op.recipient,
          percentage: op.percentage,
          outgoingPaymentId: op.outgoingPayment.id,
          failed: op.outgoingPayment.failed,
        })),
        errors: errors.map((e) => ({
          recipient: e.recipient,
          percentage: e.percentage,
          error: e.error,
          quoteId: e.quoteId,
        })),
        completedAt: new Date().toISOString(),
        interactRef: interact_ref,
      });

      // Limpiar cache
      await cacheService.delete(`split_payment:${splitPaymentId}`);

      return success(
        res,
        {
          splitPaymentId,
          status: finalStatus,
          outgoingPayments: outgoingPayments.map((op) => ({
            recipient: op.recipient,
            percentage: op.percentage,
            outgoingPayment: op.outgoingPayment,
          })),
          errors: errors.length > 0 ? errors : undefined,
          summary: {
            total: splitPayment.quotes.length,
            successful: outgoingPayments.filter(
              (op) => !op.outgoingPayment.failed
            ).length,
            failed: outgoingPayments.filter((op) => op.outgoingPayment.failed)
              .length,
            errors: errors.length,
          },
        },
        finalStatus === "FAILED"
          ? "Split payment falló completamente"
          : finalStatus === "PARTIAL"
            ? "Split payment completado parcialmente"
            : "Split payment completado exitosamente"
      );
    } catch (err) {
      log.error("Error en callback de split payment:", err);
      // Intentar marcar como fallido si tenemos el ID
      if (req.query.splitPaymentId) {
        try {
          await firestoreService.update(
            "split_payments",
            req.query.splitPaymentId,
            {
              status: "FAILED",
              error: err.message,
              failedAt: new Date().toISOString(),
            }
          );
        } catch (updateError) {
          log.error("Error actualizando estado:", updateError);
        }
      }
      next(err);
    }
  }

  // GET /api/split-payments/:splitPaymentId - Obtener estado (igual que P2P)
  async getSplitPaymentStatus(req, res, next) {
    try {
      const { splitPaymentId } = req.params;

      // Intentar obtener de cache (igual que P2P)
      const cached = await cacheService.get(`split_payment:${splitPaymentId}`);
      if (cached) {
        return success(res, cached, "Split payment status (cached)");
      }

      const splitPayment = await firestoreService.getById(
        "split_payments",
        splitPaymentId
      );

      if (!splitPayment) {
        return error(res, "Split payment no encontrado", 404);
      }

      return success(res, splitPayment, "Split payment status");
    } catch (err) {
      next(err);
    }
  }
}

export default new SplitPaymentsController();
