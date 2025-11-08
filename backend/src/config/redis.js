import { createClient } from "redis";

let client = null;

export const initializeRedis = async () => {
  if (!client) {
    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT) || 6379,
        // Timeout para conexión
        connectTimeout: 10000,
      },
    };

    // Solo agregar password si existe
    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }

    client = createClient(redisConfig);

    client.on("error", (err) => console.error("❌ Redis Error:", err));
    client.on("connect", () =>
      console.log("✅ Redis conectado en", process.env.REDIS_HOST)
    );
    client.on("reconnecting", () => console.log("🔄 Redis reconectando..."));

    await client.connect();
  }
  return client;
};

export const getRedisClient = () => client;

// Función para cerrar conexión (útil para testing)
export const closeRedis = async () => {
  if (client) {
    await client.quit();
    client = null;
    console.log("✅ Redis desconectado");
  }
};
