import { db } from "./db.js";
import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

(async () => {
  try {
    // Affiche l'URL de connexion PostgreSQL (Render)
    const connectionString = process.env.DATABASE_URL;
    console.log("🌐 Connexion DB utilisée :", connectionString);

    // Vérifie le nombre de sellers et buyers
    const sellers = await db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE role='seller'")
      .all();
    const buyers = await db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE role='buyer'")
      .all();

    console.log("📦 Nombre de sellers en DB prod :", sellers[0].count);
    console.log("📦 Nombre de buyers en DB prod  :", buyers[0].count);

    // Affiche un exemple concret de seller et buyer
    const exampleSeller = await db
      .prepare("SELECT * FROM users WHERE role='seller' LIMIT 1")
      .all();
    const exampleBuyer = await db
      .prepare("SELECT * FROM users WHERE role='buyer' LIMIT 1")
      .all();

    console.log("🔍 Exemple seller :", exampleSeller[0]);
    console.log("🔍 Exemple buyer  :", exampleBuyer[0]);

    console.log("✅ Tout semble bien persistant sur PostgreSQL Render !");
  } catch (err) {
    console.error("❌ ERREUR vérif DB :", err);
  }
})();
