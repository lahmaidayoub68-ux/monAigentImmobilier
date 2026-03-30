// migrate-all-better-sqlite3-to-postgres.mjs
import Database from "better-sqlite3";
import pkg from "pg";
const { Client } = pkg;

const IS_PROD = process.env.NODE_ENV === "production"; // ⚡️ Contrôle prod/dev

// Config PostgreSQL (prod)
const pgClient = new Client({
  connectionString:
    "postgresql://monaigentimmobilerdataprod_user:kBvGVC3LAB47BOLFmySA6WVS7B07T5Uk@dpg-d74l02vfte5s73f33qig-a.oregon-postgres.render.com/monaigentimmobilerdataprod",
  ssl: { rejectUnauthorized: false },
});

// Chemin vers ta base SQLite locale
const db = new Database("./data.db");

async function migrate() {
  try {
    await pgClient.connect();
    console.log("Connecté à PostgreSQL ✅");

    // 1️⃣ Récupérer toutes les tables SQLite (sauf sqlite_*)
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`,
      )
      .all()
      .map((r) => r.name);

    // -----------------------------
    // 2️⃣ CRÉER TOUTES LES TABLES D’ABORD
    // -----------------------------
    for (const tableName of tables) {
      const columns = db.prepare(`PRAGMA table_info(${tableName});`).all();

      const columnDefs = columns
        .map((col) => {
          let type = col.type.toUpperCase();

          if (type.includes("INT")) type = "INTEGER";
          else if (type.includes("CHAR") || type.includes("TEXT"))
            type = "TEXT";
          else if (
            type.includes("REAL") ||
            type.includes("FLOA") ||
            type.includes("DOUB")
          )
            type = "REAL";
          else if (type.includes("NUMERIC") || type.includes("DEC"))
            type = "NUMERIC";
          else if (type.includes("BLOB")) type = "BYTEA";
          else if (type.includes("BOOLEAN")) type = "BOOLEAN";
          else if (type.includes("DATE") || type.includes("TIME"))
            type = "TIMESTAMP";
          else type = "TEXT";

          let def = `${col.name} ${type}`;
          if (col.pk === 1) def = `${col.name} SERIAL PRIMARY KEY`;
          if (col.notnull === 1 && col.pk !== 1) def += " NOT NULL";
          if (col.dflt_value !== null && col.pk !== 1) {
            let val = col.dflt_value.replace(/^['"]|['"]$/g, "");
            if (val === "CURRENT_TIMESTAMP") val = "NOW()";
            def += ` DEFAULT '${val.replace(/'/g, "''")}'`;
          }
          return def;
        })
        .join(", ");

      await pgClient.query(
        `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs});`,
      );
      console.log(`Table "${tableName}" créée`);

      if (IS_PROD) {
        await pgClient.query(
          `TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE;`,
        );
        console.log(`Table "${tableName}" vidée avant migration (prod)`);
      }
    }

    // -----------------------------
    // 3️⃣ MIGRER LES DONNÉES APRÈS LA CRÉATION DE TOUTES LES TABLES
    // -----------------------------
    for (const tableName of tables) {
      const rows = db.prepare(`SELECT * FROM ${tableName};`).all();

      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => c !== "id"); // id = SERIAL
        const vals = Object.values(row)
          .filter((_, i) => Object.keys(row)[i] !== "id")
          .map((v) => {
            if (v === null) return "NULL";
            if (typeof v === "string")
              return v === "CURRENT_TIMESTAMP"
                ? "NOW()"
                : `'${v.replace(/'/g, "''")}'`;
            return v;
          });

        await pgClient.query(
          `INSERT INTO ${tableName} (${cols.join(",")}) VALUES (${vals.join(",")});`,
        );
      }

      console.log(
        `Données migrées pour "${tableName}" (${rows.length} lignes)`,
      );

      // 🔹 Synchroniser la séquence SERIAL
      await pgClient.query(
        `SELECT setval(
    pg_get_serial_sequence('${tableName}','id'),
    GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${tableName}), 1)
  );`,
      );
      console.log(`Séquence SERIAL pour "${tableName}" synchronisée`);
    }

    console.log("\n✅ Migration complète réussie !");
  } catch (err) {
    console.error("Erreur migration :", err);
  } finally {
    await pgClient.end();
    db.close();
  }
}

migrate();
