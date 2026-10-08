export function isTransientPostgresError(error) {
  return /^(08|57P0[13])/.test(String(error?.code || "")) ||
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"].includes(error?.code) ||
    /connection terminated unexpectedly|connection terminated|socket hang up|connection timeout/i.test(String(error?.message || ""));
}

const IDEMPOTENT_SCHEMA_STATEMENT = /^\s*(?:CREATE\s+(?:TEMP(?:ORARY)?\s+)?(?:TABLE|(?:UNIQUE\s+)?INDEX|SEQUENCE)\s+IF\s+NOT\s+EXISTS\b|ALTER\s+TABLE\b[\s\S]*\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b)/i;

export async function executeSchemaWithRetry(query, params, execute, options = {}) {
  if (!IDEMPOTENT_SCHEMA_STATEMENT.test(query)) {
    throw new Error("executeSchemaWithRetry accepte uniquement les changements de schéma idempotents.");
  }
  const { attempts = 4, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), warn = () => {} } = options;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await execute(query, params); }
    catch (error) {
      lastError = error;
      if (!isTransientPostgresError(error) || attempt === attempts - 1) throw error;
      const delay = 400 * (attempt + 1);
      warn(`[DB] Initialisation du schéma interrompue (${error?.code || "socket"}); nouvelle tentative dans ${delay} ms (${attempt + 2}/${attempts}).`);
      await wait(delay);
    }
  }
  throw lastError;
}

export async function executeSelectWithRetry(query, params, execute, { attempts = 5, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), warn = () => {} } = {}) {
  if (!/^\s*SELECT\b/i.test(query)) throw new Error("executeSelectWithRetry accepte uniquement les lectures SELECT idempotentes.");
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await execute(query, params);
      return result.rows[0];
    } catch (error) {
      lastError = error;
      if (!isTransientPostgresError(error) || attempt === attempts - 1) throw error;
      const delay = 250 * (attempt + 1);
      warn(`[DB] Lecture interrompue (${error?.code || "socket"}); nouvelle connexion dans ${delay} ms (tentative ${attempt + 2}/${attempts}).`);
      await wait(delay);
    }
  }
  throw lastError;
}

export async function executeUpdateWithRetry(query, params, execute, options = {}) {
  if (!/^\s*UPDATE\b/i.test(query) || !/\bSET\b/i.test(query)) throw new Error("executeUpdateWithRetry accepte uniquement une mise à jour par affectations idempotentes.");
  const setClause = query.split(/\bSET\b/i)[1]?.split(/\bWHERE\b/i)[0] || "";
  if (/\b[A-Za-z_][\w.]*\s*=\s*[A-Za-z_][\w.]*\s*[+-]/.test(setClause)) throw new Error("Cette mise à jour contient un calcul non idempotent.");
  const { attempts = 5, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), warn = () => {} } = options;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await execute(query, params); }
    catch (error) {
      lastError = error;
      if (!isTransientPostgresError(error) || attempt === attempts - 1) throw error;
      const delay = 250 * (attempt + 1);
      warn(`[DB] Mise à jour interrompue (${error?.code || "socket"}); nouvelle connexion dans ${delay} ms (tentative ${attempt + 2}/${attempts}).`);
      await wait(delay);
    }
  }
  throw lastError;
}
