import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";

export function setupWebSocket(io) {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;

      // Join user's room
      socket.join(decoded.userId);

      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`User ${socket.userId} connected via WebSocket`);

    // Subscribe to transaction updates
    socket.on("subscribe:transaction", (transactionId) => {
      socket.join(`transaction:${transactionId}`);
    });

    // Unsubscribe from transaction
    socket.on("unsubscribe:transaction", (transactionId) => {
      socket.leave(`transaction:${transactionId}`);
    });

    // Get real-time balance
    socket.on("get:balance", async () => {
      // Implement balance check
      socket.emit("balance:update", { balance: 0 });
    });

    socket.on("disconnect", () => {
      logger.info(`User ${socket.userId} disconnected`);
    });
  });
}
