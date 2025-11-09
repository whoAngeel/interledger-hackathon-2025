import { getDb } from "../config/firestore.js";
import log from "../utils/logger.js";

class PaymentsQueryService {
  constructor() {
    this.db = null;
  }

  initialize() {
    this.db = getDb();
    log.info("✅ PaymentsQueryService inicializado");
  }

  // Consultar pagos normales
  async _queryPayments({ status, startDate, endDate, walletUrl }) {
    try {
      let query = this.db.collection("payments");

      // Aplicar filtros
      if (status) {
        query = query.where("status", "==", status);
      }
      if (startDate) {
        query = query.where("createdAt", ">=", startDate.toISOString());
      }
      if (endDate) {
        query = query.where("createdAt", "<=", endDate.toISOString());
      }

      // Ordenar
      query = query.orderBy("createdAt", "desc");

      const snapshot = await query.get();
      let docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        type: "payment",
        ...doc.data(),
      }));

      // Filtrar por wallet en memoria (Firestore no soporta OR nativamente)
      if (walletUrl) {
        docs = docs.filter(
          (payment) =>
            payment.senderWalletUrl === walletUrl ||
            payment.recipientWalletUrl === walletUrl
        );
      }

      return docs;
    } catch (error) {
      log.error("Error consultando payments:", error);
      throw error;
    }
  }

  // Consultar split payments
  async _querySplitPayments({ status, startDate, endDate, walletUrl }) {
    try {
      let query = this.db.collection("split_payments");

      // Aplicar filtros
      if (status) {
        query = query.where("status", "==", status);
      }
      if (startDate) {
        query = query.where("createdAt", ">=", startDate.toISOString());
      }
      if (endDate) {
        query = query.where("createdAt", "<=", endDate.toISOString());
      }

      // Ordenar
      query = query.orderBy("createdAt", "desc");

      const snapshot = await query.get();
      let docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        type: "split_payment",
        ...doc.data(),
      }));

      // Filtrar por wallet en memoria
      if (walletUrl) {
        docs = docs.filter((payment) => {
          // Verificar sender
          if (payment.senderWalletUrl === walletUrl) return true;

          // Verificar recipients
          if (payment.recipients) {
            return payment.recipients.some((r) => r.walletUrl === walletUrl);
          }

          return false;
        });
      }

      return docs;
    } catch (error) {
      log.error("Error consultando split_payments:", error);
      throw error;
    }
  }

  // Listar pagos con paginación y filtros
  async listPayments({
    page = 1,
    limit = 10,
    status = null,
    startDate = null,
    endDate = null,
    walletUrl = null,
  }) {
    try {
      if (!this.db) {
        this.initialize();
      }

      log.info("Buscando pagos con filtros:", {
        page,
        limit,
        status,
        startDate,
        endDate,
        walletUrl,
      });

      // Consultar ambas colecciones en paralelo
      const [payments, splitPayments] = await Promise.all([
        this._queryPayments({ status, startDate, endDate, walletUrl }),
        this._querySplitPayments({ status, startDate, endDate, walletUrl }),
      ]);

      log.info(
        `Encontrados: ${payments.length} pagos regulares, ${splitPayments.length} split payments`
      );

      // Combinar resultados
      const allPayments = [...payments, ...splitPayments];

      // Ordenar por fecha de creación descendente
      allPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Aplicar paginación
      const startAt = (page - 1) * limit;
      const paginatedPayments = allPayments.slice(startAt, startAt + limit);

      log.info(
        `Retornando ${paginatedPayments.length} pagos de un total de ${allPayments.length}`
      );

      return {
        payments: paginatedPayments,
        pagination: {
          page,
          limit,
          total: allPayments.length,
          totalPages: Math.ceil(allPayments.length / limit),
          hasNextPage: startAt + limit < allPayments.length,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      log.error("Error listando pagos:", error);
      throw error;
    }
  }

  // Obtener estadísticas de pagos
  async getPaymentStats({
    startDate = null,
    endDate = null,
    walletUrl = null,
  }) {
    try {
      if (!this.db) {
        this.initialize();
      }

      log.info("Calculando estadísticas de pagos");

      // Obtener todos los pagos (normales y split)
      const [payments, splitPayments] = await Promise.all([
        this._queryPayments({ startDate, endDate, walletUrl }),
        this._querySplitPayments({ startDate, endDate, walletUrl }),
      ]);

      const allPayments = [...payments, ...splitPayments];

      // Calcular estadísticas
      const stats = {
        total: allPayments.length,
        byStatus: {},
        byType: {
          payment: payments.length,
          split_payment: splitPayments.length,
        },
        byAssetCode: {},
        totalVolume: {},
        successRate: 0,
        dateRange: {
          start: startDate?.toISOString() || null,
          end: endDate?.toISOString() || null,
        },
      };

      allPayments.forEach((payment) => {
        // Conteo por status
        stats.byStatus[payment.status] =
          (stats.byStatus[payment.status] || 0) + 1;

        // Conteo y volumen por asset code
        if (payment.type === "payment" && payment.amount) {
          const assetCode = payment.amount.assetCode;
          const value = Number(payment.amount.value) || 0;

          if (!stats.byAssetCode[assetCode]) {
            stats.byAssetCode[assetCode] = { count: 0, volume: 0 };
          }
          if (!stats.totalVolume[assetCode]) {
            stats.totalVolume[assetCode] = 0;
          }

          stats.byAssetCode[assetCode].count++;
          stats.byAssetCode[assetCode].volume += value;
          stats.totalVolume[assetCode] += value;
        }

        // Para split payments, sumar todos los montos
        if (payment.type === "split_payment" && payment.totalAmount) {
          const assetCode = payment.totalAmount.assetCode;
          const value = Number(payment.totalAmount.value) || 0;

          if (!stats.byAssetCode[assetCode]) {
            stats.byAssetCode[assetCode] = { count: 0, volume: 0 };
          }
          if (!stats.totalVolume[assetCode]) {
            stats.totalVolume[assetCode] = 0;
          }

          stats.byAssetCode[assetCode].count++;
          stats.byAssetCode[assetCode].volume += value;
          stats.totalVolume[assetCode] += value;
        }
      });

      // Calcular tasa de éxito
      const completed = stats.byStatus["COMPLETED"] || 0;
      stats.successRate =
        stats.total > 0 ? ((completed / stats.total) * 100).toFixed(2) : 0;

      log.info("Estadísticas calculadas:", stats);

      return stats;
    } catch (error) {
      log.error("Error obteniendo estadísticas:", error);
      throw error;
    }
  }

  // Buscar pagos por ID
  async searchPayments(searchTerm) {
    try {
      if (!this.db) {
        this.initialize();
      }

      log.info("Buscando pago con ID:", searchTerm);

      // Buscar en ambas colecciones en paralelo
      const [paymentDoc, splitPaymentDoc] = await Promise.all([
        this.db.collection("payments").doc(searchTerm).get(),
        this.db.collection("split_payments").doc(searchTerm).get(),
      ]);

      const results = [];

      if (paymentDoc.exists) {
        results.push({
          type: "payment",
          id: paymentDoc.id,
          ...paymentDoc.data(),
        });
      }

      if (splitPaymentDoc.exists) {
        results.push({
          type: "split_payment",
          id: splitPaymentDoc.id,
          ...splitPaymentDoc.data(),
        });
      }

      log.info(`Encontrados ${results.length} resultados`);

      return results;
    } catch (error) {
      log.error("Error buscando pagos:", error);
      throw error;
    }
  }

  // Obtener detalles de un pago específico
  async getPaymentById(paymentId, type = null) {
    try {
      if (!this.db) {
        this.initialize();
      }

      // Si se especifica el tipo, buscar solo en esa colección
      if (type === "payment") {
        const doc = await this.db.collection("payments").doc(paymentId).get();
        return doc.exists
          ? { type: "payment", id: doc.id, ...doc.data() }
          : null;
      }

      if (type === "split_payment") {
        const doc = await this.db
          .collection("split_payments")
          .doc(paymentId)
          .get();
        return doc.exists
          ? { type: "split_payment", id: doc.id, ...doc.data() }
          : null;
      }

      // Si no se especifica tipo, buscar en ambas
      const [paymentDoc, splitPaymentDoc] = await Promise.all([
        this.db.collection("payments").doc(paymentId).get(),
        this.db.collection("split_payments").doc(paymentId).get(),
      ]);

      if (paymentDoc.exists) {
        return { type: "payment", id: paymentDoc.id, ...paymentDoc.data() };
      }

      if (splitPaymentDoc.exists) {
        return {
          type: "split_payment",
          id: splitPaymentDoc.id,
          ...splitPaymentDoc.data(),
        };
      }

      return null;
    } catch (error) {
      log.error("Error obteniendo pago por ID:", error);
      throw error;
    }
  }
}

export default new PaymentsQueryService();
