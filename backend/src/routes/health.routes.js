import express from "express";
import { getRedisClient } from "../config/redis.js";
import { success, error } from "../utils/response.js";

const router = express.Router();

// Health check básico
router.get("/health", (req, res) => {
  success(res, { status: "OK" }, "Server is running");
});

// Health check completo (Redis, Firestore)
router.get("/health/full", async (req, res) => {
  const health = {
    server: "OK",
    redis: "NOT_CHECKED",
    firestore: "NOT_CHECKED",
    timestamp: new Date().toISOString(),
  };

  try {
    // Check Redis
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      await redis.ping();
      health.redis = "OK";
    } else {
      health.redis = "DISCONNECTED";
    }

    const allHealthy = Object.values(health).every(
      (v) => v === "OK" || v === new Date().toISOString()
    );

    if (allHealthy) {
      return success(res, health, "All systems operational");
    } else {
      return error(res, "Some systems are down", 503, health);
    }
  } catch (err) {
    health.error = err.message;
    return error(res, "Health check failed", 503, health);
  }
});

export default router;
