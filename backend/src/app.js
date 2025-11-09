import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { requestLogger } from "./middleware/requestHandler.js";
import { errorHandler } from "./middleware/errorHandler.js";
import healthRoutes from "./routes/health.routes.js";

import paymentRoutes from "./routes/payments.routes.js";
import splitPaymentRoutes from "./routes/splitpayments.routes.js";
import paymentsQueryRoutes from "./routes/payments.query.routes.js";
import fxRoutes from "./routes/fx.routes.js";
import openPaymentsRoutes from "./routes/openpayments.routes.js";
const app = express();

// Security con helmet (configuración permisiva para desarrollo)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "unsafe-none" },
  })
);

// CORS - Permitir todos los orígenes
app.use(
  cors({
    origin: "*", // Permitir cualquier origen
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: false, // No necesitamos cookies para un MVP
  })
);

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logger
app.use(requestLogger);

// Rate limiting (permisivo para MVP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // 1000 requests por ventana (muy permisivo)
  message: "Demasiadas peticiones desde esta IP, intenta más tarde",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Routes
app.use("/", healthRoutes);
app.use("/api/payments", paymentsQueryRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/split-payments", splitPaymentRoutes);
app.use("/api/fx", fxRoutes);
app.use("/api", openPaymentsRoutes);

// 404 handler (debe ir después de todas las rutas)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint no encontrado",
    path: req.originalUrl,
  });
});

// Error handler (debe ir al final)
app.use(errorHandler);

export default app;
