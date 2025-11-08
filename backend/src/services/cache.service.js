import { getRedisClient } from "../config/redis.js";
import log from "../utils/logger.js";

class CacheService {
  constructor() {
    this.client = null;
    this.DEFAULT_TTL = 3600; // 1 hora
  }

  initialize() {
    this.client = getRedisClient();
  }

  // Guardar en cache
  async set(key, value, ttl = this.DEFAULT_TTL) {
    try {
      if (!this.client) this.initialize();

      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttl, serialized);
      log.debug(`Cache set: ${key}`);
      return true;
    } catch (error) {
      log.error("Error guardando en cache:", error);
      return false;
    }
  }

  // Obtener de cache
  async get(key) {
    try {
      if (!this.client) this.initialize();

      const value = await this.client.get(key);
      if (!value) return null;
      log.debug(`Cache hit: ${key}`);
      return JSON.parse(value);
    } catch (error) {
      log.error("Error obteniendo de cache:", error);
      return null;
    }
  }

  // Eliminar de cache
  async delete(key) {
    try {
      if (!this.client) this.initialize();

      await this.client.del(key);
      log.debug(`Cache deleted: ${key}`);
      return true;
    } catch (error) {
      log.error("Error eliminando de cache:", error);
      return false;
    }
  }

  // Limpiar cache por patrón
  async deletePattern(pattern) {
    try {
      if (!this.client) this.initialize();

      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        log.debug(`Cache pattern deleted: ${pattern} (${keys.length} keys)`);
      }
      return true;
    } catch (error) {
      log.error("Error eliminando patrón de cache:", error);
      return false;
    }
  }
}

export default new CacheService();
