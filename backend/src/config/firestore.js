import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Firestore } from "@google-cloud/firestore";

let db = null;

export const initializeFirestore = () => {
  if (!db) {
    // Si se proporciona la ruta a las credenciales mediante
    // GOOGLE_APPLICATION_CREDENTIALS, las leemos y las pasamos
    // explícitamente al cliente. Si no, dejamos que el cliente
    // use ADC (Application Default Credentials).
    let firestoreOptions = {};

    // Nombre de la base de datos (por defecto "opendb")
    const databaseId = process.env.FIRESTORE_DATABASE_ID || "opendb";

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Resolver la ruta del archivo (puede ser relativa o absoluta)
      const credentialsPath = resolve(
        process.env.GOOGLE_APPLICATION_CREDENTIALS
      );

      if (!existsSync(credentialsPath)) {
        throw new Error(
          `❌ El archivo de credenciales no existe: ${credentialsPath}\n` +
            `   Verifica que GOOGLE_APPLICATION_CREDENTIALS apunte a un archivo válido.`
        );
      }

      let serviceAccount;
      try {
        serviceAccount = JSON.parse(readFileSync(credentialsPath, "utf8"));
      } catch (error) {
        throw new Error(
          `❌ Error leyendo el archivo de credenciales: ${credentialsPath}\n` +
            `   Error: ${error.message}`
        );
      }

      // Validar que el archivo tenga los campos necesarios
      if (!serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error(
          `❌ El archivo de credenciales no contiene los campos necesarios (client_email, private_key).`
        );
      }

      firestoreOptions = {
        projectId: process.env.GCP_PROJECT_ID || serviceAccount.project_id,
        databaseId: databaseId,
        credentials: {
          client_email: serviceAccount.client_email,
          private_key: serviceAccount.private_key,
        },
      };

      if (!firestoreOptions.projectId) {
        throw new Error(
          `❌ No se pudo determinar el projectId.\n` +
            `   Configura GCP_PROJECT_ID en tu archivo .env o asegúrate de que el archivo de credenciales tenga project_id.`
        );
      }
    } else {
      // Rely on Application Default Credentials and optional GCP_PROJECT_ID
      firestoreOptions = {
        databaseId: databaseId,
      };
      if (process.env.GCP_PROJECT_ID) {
        firestoreOptions.projectId = process.env.GCP_PROJECT_ID;
      } else {
        console.warn(
          "⚠️  GOOGLE_APPLICATION_CREDENTIALS no está configurado y GCP_PROJECT_ID tampoco.\n" +
            "   Se intentará usar Application Default Credentials (ADC)."
        );
      }
    }

    try {
      db = new Firestore(firestoreOptions);

      // Configuración para Firestore
      db.settings({
        ignoreUndefinedProperties: true,
      });

      console.log(`✅ Firestore inicializado - Base de datos: ${databaseId}`);
      console.log(
        `✅ Proyecto GCP: ${firestoreOptions.projectId || "usando ADC"}`
      );
    } catch (error) {
      throw new Error(
        `❌ Error inicializando Firestore: ${error.message}\n` +
          `   Verifica tus credenciales y configuración.`
      );
    }
  }
  return db;
};

export const getDb = () => {
  if (!db) {
    throw new Error(
      "Firestore no ha sido inicializado. Llama a initializeFirestore() primero."
    );
  }
  return db;
};
