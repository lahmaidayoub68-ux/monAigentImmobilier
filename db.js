import Database from "better-sqlite3";
import pkg from "pg";
import dotenv from "dotenv";
import { executeSchemaWithRetry, executeSelectWithRetry, executeUpdateWithRetry, isTransientPostgresError } from "./services/aigentDbRetry.js";
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
  // Laisse au PostgreSQL hébergé le temps de réveiller une instance après inactivité.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 30_000,
  keepAlive: true,
});

pool.on("error", (error) => {
  console.warn("[DB] Connexion PostgreSQL idle perdue; le pool la remplacera.", error?.code || error?.message || "erreur réseau");
});

async function getWithRetry(query, params = [], { attempts = 5 } = {}) {
  return executeSelectWithRetry(query, params, (sql, values) => pool.query(convertQuery(sql), values), {
    attempts,
    warn: (message) => console.warn(message),
  });
}

// 🔥 Conversion des placeholders SQLite (?) → PostgreSQL ($1, $2…)
function convertQuery(query) {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

// ================== Wrapper DB ==================
export const db = {
  async getWithRetry(query, ...params) {
    if (!isProd) return sqlite.prepare(query).get(...params);
    return getWithRetry(query, params);
  },
  async updateWithRetry(query, ...params) {
    if (!isProd) return sqlite.prepare(query).get(...params);
    const result = await executeUpdateWithRetry(query, params, (sql, values) => pool.query(convertQuery(sql), values), {
      warn: (message) => console.warn(message),
    });
    return result.rows[0];
  },
  __test: { transientPostgresError: isTransientPostgresError },
  prepare(query) {
    if (!isProd) {
      // === DEV : SQLite ===
      return sqlite.prepare(query);
    }

    // === PROD : PostgreSQL ===
    return {
      async get(...params) {
        if (/^\s*SELECT\b/i.test(query)) return getWithRetry(query, params);
        const res = await pool.query(convertQuery(query), params);
        return res.rows[0];
      },

      async all(...params) {
        if (/^\s*SELECT\b/i.test(query)) {
          let lastError;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            try { return (await pool.query(convertQuery(query), params)).rows; }
            catch (error) {
              lastError = error;
              if (!isTransientPostgresError(error) || attempt === 4) throw error;
              const delay = 250 * (attempt + 1);
              console.warn(`[DB] Lecture interrompue (${error?.code || "socket"}); nouvelle connexion dans ${delay} ms (tentative ${attempt + 2}/5).`);
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
          throw lastError;
        }
        return (await pool.query(convertQuery(query), params)).rows;
      },

      async run(...params) {
        if (/^\s*(?:CREATE\s+(?:TEMP(?:ORARY)?\s+)?(?:TABLE|(?:UNIQUE\s+)?INDEX|SEQUENCE)\s+IF\s+NOT\s+EXISTS\b|ALTER\s+TABLE\b[\s\S]*\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b)/i.test(query)) {
          await executeSchemaWithRetry(query, params, (sql, values) => pool.query(convertQuery(sql), values), {
            warn: (message) => console.warn(message),
          });
        } else {
          await pool.query(convertQuery(query), params);
        }
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
