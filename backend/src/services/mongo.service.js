import { getDb } from "../config/mongo.js";
import log from "../utils/logger.js";
import { ObjectId } from "mongodb";

const OPERATOR_MAP = {
  "==": "$eq",
  ">=": "$gte",
  "<=": "$lte",
  ">": "$gt",
  "<": "$lt",
  "!=": "$ne",
};

class MongoService {
  constructor() {
    this.db = null;
  }

  initialize() {
    this.db = getDb();
    log.info?.("✅ MongoService inicializado");
  }

  async create(collection, id, data) {
    try {
      if (!this.db)
        throw new Error(
          "MongoService no inicializado. Llama a mongoService.initialize() después de initializeMongo()."
        );
      const doc = {
        _id: id,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.db.collection(collection).insertOne(doc);
      log.info?.(`✅ Documento creado en ${collection}/${id}`);
      const { _id, ...rest } = doc;
      return { id: _id, ...rest };
    } catch (error) {
      log.error?.(`❌ Error creando documento en ${collection}:`, error);
      throw error;
    }
  }

  async getById(collection, id) {
    try {
      if (!this.db)
        throw new Error(
          "MongoService no inicializado. Llama a mongoService.initialize() después de initializeMongo()."
        );
      const doc = await this.db.collection(collection).findOne({ _id: id });
      if (!doc) return null;
      const { _id, ...rest } = doc;
      return { id: _id, ...rest };
    } catch (error) {
      log.error?.(`❌ Error obteniendo documento ${collection}/${id}:`, error);
      throw error;
    }
  }

  async update(collection, id, data) {
    try {
      if (!this.db)
        throw new Error(
          "MongoService no inicializado. Llama a mongoService.initialize() después de initializeMongo()."
        );
      const updateData = {
        ...data,
        updatedAt: new Date().toISOString(),
      };
      await this.db
        .collection(collection)
        .updateOne({ _id: id }, { $set: updateData });
      log.info?.(`✅ Documento actualizado en ${collection}/${id}`);
      return { id, ...data };
    } catch (error) {
      log.error?.(`❌ Error actualizando documento en ${collection}:`, error);
      throw error;
    }
  }

  async query(collection, filters = []) {
    try {
      if (!this.db)
        throw new Error(
          "MongoService no inicializado. Llama a mongoService.initialize() después de initializeMongo()."
        );

      const mongoFilter = {};
      for (const f of filters) {
        const op = OPERATOR_MAP[f.operator] || "$eq";
        if (op === "$eq") {
          mongoFilter[f.field] = f.value;
        } else {
          if (!mongoFilter[f.field]) mongoFilter[f.field] = {};
          mongoFilter[f.field][op] = f.value;
        }
      }

      const docs = await this.db
        .collection(collection)
        .find(mongoFilter)
        .toArray();

      return docs.map((doc) => {
        const { _id, ...rest } = doc;
        return { id: _id, ...rest };
      });
    } catch (error) {
      log.error?.(`❌ Error en query de ${collection}:`, error);
      throw error;
    }
  }

  async softDelete(collection, id) {
    try {
      await this.update(collection, id, {
        deleted: true,
        deletedAt: new Date().toISOString(),
      });
      log.info?.(`🗑️ Documento marcado como eliminado en ${collection}/${id}`);
      return true;
    } catch (error) {
      log.error?.(`❌ Error eliminando documento en ${collection}:`, error);
      throw error;
    }
  }
}

export default new MongoService();
