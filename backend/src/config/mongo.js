import { MongoClient } from "mongodb";

let client = null;
let db = null;

export const initializeMongo = async () => {
  if (!db) {
    const uri = process.env.MONGO_URI || "mongodb://localhost:27017/openpayments";

    try {
      client = new MongoClient(uri);
      await client.connect();

      const url = new URL(uri);
      const dbName = url.pathname.replace("/", "") || "openpayments";
      db = client.db(dbName);

      await db.command({ ping: 1 });
      console.log(`✅ MongoDB inicializado - Base de datos: ${dbName}`);

      await db.collection("payments").createIndex({ createdAt: -1 });
      await db.collection("payments").createIndex({ status: 1 });
      await db.collection("split_payments").createIndex({ createdAt: -1 });
      await db.collection("split_payments").createIndex({ status: 1 });
    } catch (error) {
      throw new Error(
        `❌ Error inicializando MongoDB: ${error.message}\n` +
          `   Verifica que MONGO_URI sea correcto y MongoDB esté corriendo.`
      );
    }
  }
  return db;
};

export const getDb = () => {
  if (!db) {
    throw new Error(
      "MongoDB no ha sido inicializado. Llama a initializeMongo() primero."
    );
  }
  return db;
};

export const closeMongo = async () => {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("✅ MongoDB desconectado");
  }
};
