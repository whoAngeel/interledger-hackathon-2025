import express from "express";
import { getRedisClient } from "../config/redis.js";
import { getDb } from "../config/mongo.js";
import { success, error } from "../utils/response.js";

const router = express.Router();

// Health check básico
router.get("/health", (req, res) => {
  success(res, { status: "OK" }, "Server is running");
});

// Health check completo (Redis, MongoDB)
router.get("/health/full", async (req, res) => {
  const health = {
    server: "OK",
    redis: "NOT_CHECKED",
    mongo: "NOT_CHECKED",
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

    // Check MongoDB
    try {
      const db = getDb();
      await db.command({ ping: 1 });
      health.mongo = "OK";
    } catch {
      health.mongo = "DISCONNECTED";
    }

    const checks = { server: health.server, redis: health.redis, mongo: health.mongo };
    const allHealthy = Object.values(checks).every((v) => v === "OK");

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
