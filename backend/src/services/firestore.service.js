// services/firestoreService.js
import { getDb } from "../config/firestore.js";
import log from "../utils/logger.js"; // Asumimos que tienes un logger; si no, puedes usar console.log

class FirestoreService {
  constructor() {
    // No obtener la DB en la importación: se inicializa explícitamente
    // desde `server.js` llamando a firestoreService.initialize()
    this.db = null;
  }

  initialize() {
    // Lanza si initializeFirestore() no se llamó antes
    this.db = getDb();
    log.info?.("✅ FirestoreService inicializado");
  }

  // Crear documento
  async create(collection, id, data) {
    try {
      if (!this.db)
        throw new Error(
          "FirestoreService no inicializado. Llama a firestoreService.initialize() después de initializeFirestore()."
        );
      const docRef = this.db.collection(collection).doc(id);
      await docRef.set({
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      log.info?.(`✅ Documento creado en ${collection}/${id}`);
      return { id, ...data };
    } catch (error) {
      log.error?.(`❌ Error creando documento en ${collection}:`, error);
      throw error;
    }
  }

  // Obtener documento por ID
  async getById(collection, id) {
    try {
      if (!this.db)
        throw new Error(
          "FirestoreService no inicializado. Llama a firestoreService.initialize() después de initializeFirestore()."
        );
      const doc = await this.db.collection(collection).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      log.error?.(`❌ Error obteniendo documento ${collection}/${id}:`, error);
      throw error;
    }
  }

  // Actualizar documento
  async update(collection, id, data) {
    try {
      if (!this.db)
        throw new Error(
          "FirestoreService no inicializado. Llama a firestoreService.initialize() después de initializeFirestore()."
        );
      const docRef = this.db.collection(collection).doc(id);
      await docRef.update({
        ...data,
        updatedAt: new Date().toISOString(),
      });
      log.info?.(`✅ Documento actualizado en ${collection}/${id}`);
      return { id, ...data };
    } catch (error) {
      log.error?.(`❌ Error actualizando documento en ${collection}:`, error);
      throw error;
    }
  }

  // Consulta con filtros
  async query(collection, filters = []) {
    try {
      if (!this.db)
        throw new Error(
          "FirestoreService no inicializado. Llama a firestoreService.initialize() después de initializeFirestore()."
        );
      let query = this.db.collection(collection);

      for (const f of filters) {
        query = query.where(f.field, f.operator, f.value);
      }

      const snapshot = await query.get();
      const results = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return results;
    } catch (error) {
      log.error?.(`❌ Error en query de ${collection}:`, error);
      throw error;
    }
  }

  // Eliminar documento (soft delete)
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

export default new FirestoreService();
