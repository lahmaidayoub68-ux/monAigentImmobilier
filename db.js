import Database from "better-sqlite3";
import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const isProd = process.env.NODE_ENV === "production";
console.log("Mode prod ?", isProd);

// ================== SQLite (dev) ==================
const sqlite = new Database("data.db");
if (!isProd) {
  sqlite.pragma("foreign_keys = ON");
}

// ================== PostgreSQL (prod) ==================
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://monaigentimmobilerdataprod_user:kBvGVC3LAB47BOLFmySA6WVS7B07T5Uk@dpg-d74l02vfte5s73f33qig-a.oregon-postgres.render.com/monaigentimmobilerdataprod",
  ssl: { rejectUnauthorized: false },
});

// 🔥 Conversion des placeholders SQLite (?) → PostgreSQL ($1, $2…)
function convertQuery(query) {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

// ================== Wrapper DB ==================
export const db = {
  prepare(query) {
    if (!isProd) {
      // === DEV : SQLite ===
      return sqlite.prepare(query);
    }

    // === PROD : PostgreSQL ===
    return {
      async get(...params) {
        const res = await pool.query(convertQuery(query), params);
        return res.rows[0];
      },

      async all(...params) {
        const res = await pool.query(convertQuery(query), params);
        return res.rows;
      },

      async run(...params) {
        await pool.query(convertQuery(query), params);
        return { changes: 1 };
      },

      // 🔥 UPSERT helper pour PostgreSQL (robuste)
      async upsert(tableName, values = {}, conflictKey, updateCols = []) {
        if (!values || Object.keys(values).length === 0) {
          console.warn(`⚠️ upsert appelé avec values vide pour ${tableName}`);
          return { changes: 0 };
        }

        const columns = Object.keys(values);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

        const update = updateCols.length
          ? updateCols.map((col) => `${col} = EXCLUDED.${col}`).join(", ")
          : columns.map((col) => `${col} = EXCLUDED.${col}`).join(", ");

        const sql = `
          INSERT INTO ${tableName} (${columns.join(", ")})
          VALUES (${placeholders})
          ON CONFLICT (${conflictKey}) DO UPDATE SET ${update}
        `;

        try {
          await pool.query(sql, Object.values(values));
        } catch (err) {
          console.error(`[DB UPSERT ERROR] table=${tableName}`, err);
          throw err;
        }

        return { changes: 1 };
      },
    };
  },

  // ✅ Helper pour exécuter des commandes SQLite uniquement en dev
  runDevOnly(sqliteQuery) {
    if (!isProd) {
      return sqlite.prepare(sqliteQuery).run();
    }
  },
};
