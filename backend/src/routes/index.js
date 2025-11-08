import { Router } from "express";
import { cacheMiddleware } from "../middleware/cache.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import paymentController from "../controllers/payment.controller.js";
import walletController from "../controllers/wallet.controller.js";

export function setupRoutes(app) {
  const router = Router();

  // Payment routes with rate limiting
  router.post(
    "/payments/initiate",
    rateLimiter("payments", 10, 60), // 10 requests per minute
    paymentController.initiatePayment
  );

  router.post("/payments/:id/quote", paymentController.createQuote);

  router.post("/payments/:id/authorize", paymentController.authorizePayment);

  router.get(
    "/payments/:id/status",
    cacheMiddleware("payment:status::id", 30),
    paymentController.getStatus
  );

  // Transaction history with caching
  router.get(
    "/transactions",
    cacheMiddleware("transactions:user::userId::query", 60),
    paymentController.getUserTransactions
  );

  // Wallet routes
  router.post("/wallets/register", walletController.register);

  router.get(
    "/wallets/:userId",
    cacheMiddleware("wallet::userId", 300),
    walletController.getWallet
  );

  // Webhook for authorization callback
  router.post("/payments/callback", paymentController.handleCallback);

  app.use("/api/v1", router);
}
