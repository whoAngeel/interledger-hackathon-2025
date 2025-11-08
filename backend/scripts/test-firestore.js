#!/usr/bin/env node
import dotenv from "dotenv";
import { initializeFirestore, getDb } from "../src/config/firestore.js";

dotenv.config();

// Este script valida que el módulo se cargue correctamente y prueba la conexión
async function testFirestore() {
  try {
    console.log("🔍 Verificando configuración de Firestore...");
    console.log("GCP_PROJECT_ID:", process.env.GCP_PROJECT_ID || "(not set)");
    console.log(
      "FIRESTORE_DATABASE_ID:",
      process.env.FIRESTORE_DATABASE_ID || "opendb (default)"
    );
    console.log(
      "GOOGLE_APPLICATION_CREDENTIALS:",
      process.env.GOOGLE_APPLICATION_CREDENTIALS || "(not set)"
    );

    // Inicializar Firestore
    console.log("\n🚀 Inicializando Firestore...");
    const db = initializeFirestore();
    console.log("✅ Firestore inicializado correctamente");

    // Probar conexión haciendo una operación simple (listar colecciones)
    console.log("\n🔌 Probando conexión a la base de datos...");
    const collections = await db.listCollections();
    console.log(`✅ Conexión exitosa! Base de datos: opendb`);
    console.log(`📁 Colecciones encontradas: ${collections.length}`);

    if (collections.length > 0) {
      console.log("   Colecciones:");
      collections.forEach((col) => {
        console.log(`   - ${col.id}`);
      });
    } else {
      console.log("   (No hay colecciones aún)");
    }

    console.log("\n✅ Test completado exitosamente!");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error en la configuración o conexión de Firestore:");
    console.error(err.message);
    if (err.code) {
      console.error(`Código de error: ${err.code}`);
    }
    if (err.stack) {
      console.error("\nStack trace:");
      console.error(err.stack);
    }
    process.exit(1);
  }
}

testFirestore();
