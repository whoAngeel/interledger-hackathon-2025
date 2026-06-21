import { getDb } from "../config/mongo.js";
import log from "../utils/logger.js";

class PaymentsQueryService {
  constructor() {
    this.db = null;
  }

  initialize() {
    this.db = getDb();
    log.info("✅ PaymentsQueryService inicializado");
  }

  _buildBaseFilter({ status, startDate, endDate }) {
    const filter = {};
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = startDate.toISOString();
      if (endDate) filter.createdAt.$lte = endDate.toISOString();
    }
    return filter;
  }

  _walletFilterPayment(walletUrl) {
    return { $or: [{ senderWalletUrl: walletUrl }, { recipientWalletUrl: walletUrl }] };
  }

  _walletFilterSplitPayment(walletUrl) {
    return {
      $or: [
        { senderWalletUrl: walletUrl },
        { "recipients.walletUrl": walletUrl },
      ],
    };
  }

  async _queryPayments({ status, startDate, endDate, walletUrl }) {
    try {
      let filter = this._buildBaseFilter({ status, startDate, endDate });

      if (walletUrl) {
        const walletFilter = this._walletFilterPayment(walletUrl);
        filter = { $and: [filter, walletFilter] };
      }

      const docs = await this.db
        .collection("payments")
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      return docs.map((doc) => {
        const { _id, ...rest } = doc;
        return { id: _id, type: "payment", ...rest };
      });
    } catch (error) {
      log.error("Error consultando payments:", error);
      throw error;
    }
  }

  async _querySplitPayments({ status, startDate, endDate, walletUrl }) {
    try {
      let filter = this._buildBaseFilter({ status, startDate, endDate });

      if (walletUrl) {
        const walletFilter = this._walletFilterSplitPayment(walletUrl);
        filter = { $and: [filter, walletFilter] };
      }

      const docs = await this.db
        .collection("split_payments")
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      return docs.map((doc) => {
        const { _id, ...rest } = doc;
        return { id: _id, type: "split_payment", ...rest };
      });
    } catch (error) {
      log.error("Error consultando split_payments:", error);
      throw error;
    }
  }

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

      const [payments, splitPayments] = await Promise.all([
        this._queryPayments({ status, startDate, endDate, walletUrl }),
        this._querySplitPayments({ status, startDate, endDate, walletUrl }),
      ]);

      const allPayments = [...payments, ...splitPayments];
      allPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const startAt = (page - 1) * limit;
      const paginatedPayments = allPayments.slice(startAt, startAt + limit);

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

  async getPaymentStats({ startDate = null, endDate = null, walletUrl = null }) {
    try {
      if (!this.db) {
        this.initialize();
      }

      const [payments, splitPayments] = await Promise.all([
        this._queryPayments({ startDate, endDate, walletUrl }),
        this._querySplitPayments({ startDate, endDate, walletUrl }),
      ]);

      const allPayments = [...payments, ...splitPayments];

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
        stats.byStatus[payment.status] =
          (stats.byStatus[payment.status] || 0) + 1;

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

      const completed = stats.byStatus["COMPLETED"] || 0;
      stats.successRate =
        stats.total > 0 ? ((completed / stats.total) * 100).toFixed(2) : 0;

      return stats;
    } catch (error) {
      log.error("Error obteniendo estadísticas:", error);
      throw error;
    }
  }

  async searchPayments(searchTerm) {
    try {
      if (!this.db) {
        this.initialize();
      }

      const [paymentDoc, splitPaymentDoc] = await Promise.all([
        this.db.collection("payments").findOne({ _id: searchTerm }),
        this.db.collection("split_payments").findOne({ _id: searchTerm }),
      ]);

      const results = [];

      if (paymentDoc) {
        const { _id, ...rest } = paymentDoc;
        results.push({ type: "payment", id: _id, ...rest });
      }

      if (splitPaymentDoc) {
        const { _id, ...rest } = splitPaymentDoc;
        results.push({ type: "split_payment", id: _id, ...rest });
      }

      return results;
    } catch (error) {
      log.error("Error buscando pagos:", error);
      throw error;
    }
  }

  async getPaymentById(paymentId, type = null) {
    try {
      if (!this.db) {
        this.initialize();
      }

      if (type === "payment") {
        const doc = await this.db
          .collection("payments")
          .findOne({ _id: paymentId });
        if (!doc) return null;
        const { _id, ...rest } = doc;
        return { type: "payment", id: _id, ...rest };
      }

      if (type === "split_payment") {
        const doc = await this.db
          .collection("split_payments")
          .findOne({ _id: paymentId });
        if (!doc) return null;
        const { _id, ...rest } = doc;
        return { type: "split_payment", id: _id, ...rest };
      }

      const [paymentDoc, splitPaymentDoc] = await Promise.all([
        this.db.collection("payments").findOne({ _id: paymentId }),
        this.db.collection("split_payments").findOne({ _id: paymentId }),
      ]);

      if (paymentDoc) {
        const { _id, ...rest } = paymentDoc;
        return { type: "payment", id: _id, ...rest };
      }

      if (splitPaymentDoc) {
        const { _id, ...rest } = splitPaymentDoc;
        return { type: "split_payment", id: _id, ...rest };
      }

      return null;
    } catch (error) {
      log.error("Error obteniendo pago por ID:", error);
      throw error;
    }
  }
}

export default new PaymentsQueryService();
