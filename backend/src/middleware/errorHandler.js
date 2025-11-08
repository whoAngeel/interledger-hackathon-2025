import log from "../utils/logger.js";
import { error } from "../utils/response.js";

export const errorHandler = (err, req, res, next) => {
  log.error("Error en la aplicación:", err);

  // Errores de Open Payments
  if (err.message && err.message.includes("Open Payments")) {
    return error(res, "Error en el sistema de pagos", 500, err.message);
  }

  // Errores de Firestore
  if (err.code && err.code.includes("firestore")) {
    return error(res, "Error en la base de datos", 500, err.message);
  }

  // Error genérico
  const message =
    process.env.NODE_ENV === "development"
      ? err.message
      : "Error interno del servidor";

  return error(res, message, err.statusCode || 500);
};
