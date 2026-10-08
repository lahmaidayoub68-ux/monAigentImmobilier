import test from "node:test";
import assert from "node:assert/strict";
import { executeSchemaWithRetry, executeSelectWithRetry, executeUpdateWithRetry, isTransientPostgresError } from "../services/aigentDbRetry.js";

test("reconnaît la fermeture réseau de pg-pool signalée par le log Work", () => {
  assert.equal(isTransientPostgresError(new Error("Connection terminated unexpectedly")), true);
  assert.equal(isTransientPostgresError(Object.assign(new Error("server error"), { code: "23505" })), false);
});

test("retente la lecture puis restitue le résultat quand le pool se reconnecte", async () => {
  let calls = 0;
  const waits = [];
  const row = await executeSelectWithRetry(
    "SELECT MAX(version) AS v FROM aigent_builds WHERE project_id = $1",
    [39],
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("Connection terminated unexpectedly");
      return { rows: [{ v: 7 }] };
    },
    { wait: async (ms) => waits.push(ms), warn: () => {} },
  );
  assert.deepEqual(row, { v: 7 });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [250, 500]);
});

test("refuse de retenter une écriture qui pourrait être exécutée deux fois", async () => {
  await assert.rejects(
    executeSelectWithRetry("INSERT INTO aigent_builds(project_id) VALUES($1)", [], async () => ({ rows: [] })),
    /uniquement les lectures SELECT idempotentes/,
  );
});

test("retente la sauvegarde idempotente de l'état de build après une socket perdue", async () => {
  let calls = 0;
  const result = await executeUpdateWithRetry(
    "UPDATE aigent_projects SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
    ["built", 39],
    async () => { calls += 1; if (calls === 1) throw new Error("Connection terminated unexpectedly"); return { rows: [{ status: "built" }] }; },
    { wait: async () => {}, warn: () => {} },
  );
  assert.deepEqual(result.rows[0], { status: "built" });
  assert.equal(calls, 2);
});

test("retente le DDL idempotent interrompu pendant le démarrage du serveur", async () => {
  let calls = 0;
  const waits = [];
  const result = await executeSchemaWithRetry(
    "CREATE TABLE IF NOT EXISTS users_occas (id SERIAL PRIMARY KEY)",
    [],
    async () => { calls += 1; if (calls === 1) throw new Error("Connection terminated due to connection timeout"); return { rowCount: 0 }; },
    { wait: async (ms) => waits.push(ms), warn: () => {} },
  );
  assert.equal(result.rowCount, 0);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [400]);
});

test("n'autorise jamais à retenter un INSERT via la voie réservée au schéma", async () => {
  await assert.rejects(executeSchemaWithRetry("INSERT INTO users(id) VALUES($1)", [], async () => ({})), /changements de schéma idempotents/);
});
