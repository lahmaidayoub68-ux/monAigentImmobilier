import dotenv from "dotenv";
import { db } from "./db.js";

dotenv.config();

async function runMigration() {
  console.log("🚀 Migration SAFE niveauenergetique...");

  try {
    // =========================
    // 1. ADD COLUMN IF NOT EXISTS
    // =========================
    await db
      .prepare(
        `
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS niveauenergetique TEXT DEFAULT '';
      `,
      )
      .run();

    // =========================
    // 2. CLEAN EXISTING DATA (OPTIONNEL MAIS PROPRE)
    // =========================
    await db
      .prepare(
        `
        UPDATE users
        SET niveauenergetique = ''
        WHERE niveauenergetique IS NULL;
      `,
      )
      .run();

    // =========================
    // 3. VERIFY STRUCTURE
    // =========================
    const check = await db
      .prepare(
        `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'niveauenergetique';
      `,
      )
      .all();

    console.log("🧠 CHECK niveauenergetique:");
    console.table(check);

    console.log("✅ Migration niveauenergetique terminée !");
  } catch (err) {
    console.error("❌ Migration error:", err);
  } finally {
    console.log("🏁 FIN");
    process.exit(0);
  }
}

runMigration();
