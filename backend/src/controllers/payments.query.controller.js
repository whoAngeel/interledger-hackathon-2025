import paymentsQueryService from "../services/payments.query.service.js";
import { success, error } from "../utils/response.js";
import log from "../utils/logger.js";

class PaymentsQueryController {
  // GET /api/payments/list - Listar pagos con filtros y paginación
  async listPayments(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        startDate,
        endDate,
        walletUrl,
      } = req.query;

      // Validar parámetros
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(pageNum) || pageNum < 1) {
        return error(res, "page debe ser un número positivo", 400);
      }
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return error(res, "limit debe ser un número entre 1 y 100", 400);
      }

      // Convertir fechas si están presentes
      const parsedStartDate = startDate ? new Date(startDate) : null;
      const parsedEndDate = endDate ? new Date(endDate) : null;

      if (startDate && isNaN(parsedStartDate.getTime())) {
        return error(
          res,
          "startDate debe ser una fecha válida (ISO 8601)",
          400
        );
      }
      if (endDate && isNaN(parsedEndDate.getTime())) {
        return error(res, "endDate debe ser una fecha válida (ISO 8601)", 400);
      }

      log.info("Listando pagos con filtros:", {
        page: pageNum,
        limit: limitNum,
        status,
        startDate: parsedStartDate?.toISOString(),
        endDate: parsedEndDate?.toISOString(),
        walletUrl,
      });

      const result = await paymentsQueryService.listPayments({
        page: pageNum,
        limit: limitNum,
        status,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        walletUrl,
      });

      return success(res, result, "Pagos listados exitosamente");
    } catch (err) {
      next(err);
    }
  }

  // GET /api/payments/stats - Obtener estadísticas
  async getPaymentStats(req, res, next) {
    try {
      const { startDate, endDate, walletUrl } = req.query;

      // Convertir fechas si están presentes
      const parsedStartDate = startDate ? new Date(startDate) : null;
      const parsedEndDate = endDate ? new Date(endDate) : null;

      if (startDate && isNaN(parsedStartDate.getTime())) {
        return error(
          res,
          "startDate debe ser una fecha válida (ISO 8601)",
          400
        );
      }
      if (endDate && isNaN(parsedEndDate.getTime())) {
        return error(res, "endDate debe ser una fecha válida (ISO 8601)", 400);
      }

      log.info("Obteniendo estadísticas con filtros:", {
        startDate: parsedStartDate?.toISOString(),
        endDate: parsedEndDate?.toISOString(),
        walletUrl,
      });

      const stats = await paymentsQueryService.getPaymentStats({
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        walletUrl,
      });

      return success(res, stats, "Estadísticas obtenidas exitosamente");
    } catch (err) {
      next(err);
    }
  }

  // GET /api/payments/search?q=paymentId - Buscar pagos por ID
  async searchPayments(req, res, next) {
    try {
      const { q } = req.query;

      if (!q || q.length < 3) {
        return error(
          res,
          "El término de búsqueda debe tener al menos 3 caracteres",
          400
        );
      }

      log.info("Buscando pago:", q);

      const results = await paymentsQueryService.searchPayments(q);

      if (results.length === 0) {
        return success(res, [], "No se encontraron pagos con ese ID");
      }

      return success(res, results, "Búsqueda completada");
    } catch (err) {
      next(err);
    }
  }

  // GET /api/payments/:paymentId - Obtener detalle de un pago
  async getPaymentById(req, res, next) {
    try {
      const { paymentId } = req.params;
      const { type } = req.query; // opcional: 'payment' o 'split_payment'

      log.info("Obteniendo pago:", { paymentId, type });

      const payment = await paymentsQueryService.getPaymentById(
        paymentId,
        type
      );

      if (!payment) {
        return error(res, "Pago no encontrado", 404);
      }

      return success(res, payment, "Pago encontrado");
    } catch (err) {
      next(err);
    }
  }
}

export default new PaymentsQueryController();
