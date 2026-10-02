// test-cloudflare-models.js

import "dotenv/config";

const API_KEY = process.env.CLOUDFLARE_API_KEY;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

const PROMPT = `
Create a modern landing page for an AI assistant.
Return a concise implementation plan and a small example of HTML/CSS/JavaScript.
`;

const TIMEOUT_MS = 30000;
const PER_PAGE = 100;

if (!API_KEY) {
  console.error("❌ CLOUDFLARE_API_KEY manquant dans .env");
  process.exit(1);
}

if (!ACCOUNT_ID) {
  console.error("❌ CLOUDFLARE_ACCOUNT_ID manquant dans .env");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

/**
 * Récupère les modèles Cloudflare.
 */
async function getModels() {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}` +
    `/ai/models/search?per_page=${PER_PAGE}&hide_experimental=false`;

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      `Impossible de récupérer les modèles: HTTP ${response.status}\n` +
        JSON.stringify(data, null, 2),
    );
  }

  return data.result || [];
}

/**
 * Détermine si un modèle semble être un modèle texte/génératif.
 */
function isTextGenerationModel(model) {
  const text = JSON.stringify(model).toLowerCase();

  // On exclut les modèles qui ne sont clairement pas adaptés
  // au prompt conversationnel.
  const excluded = [
    "embedding",
    "rerank",
    "bge-",
    "whisper",
    "speech",
    "tts",
    "asr",
    "image-classification",
    "object-detection",
    "zero-shot-image",
  ];

  if (excluded.some((word) => text.includes(word))) {
    return false;
  }

  // Favorise les familles pertinentes pour notre test.
  const preferred = [
    "llama",
    "qwen",
    "mistral",
    "gemma",
    "deepseek",
    "phi",
    "glm",
    "nemotron",
    "kimi",
    "gpt",
    "coder",
    "instruct",
  ];

  return preferred.some((word) => text.includes(word));
}

/**
 * Exécute UN modèle.
 *
 * IMPORTANT :
 * On utilise l'endpoint Cloudflare documenté :
 *
 * /accounts/{account_id}/ai/run/{model_name}
 *
 * et PAS une URL où le nom complet du modèle est
 * encodé avec encodeURIComponent().
 */
async function testModel(model) {
  const modelName = model.name || model.model || model.id;

  if (!modelName) {
    return {
      ok: false,
      model: "unknown",
      time: 0,
      error: "Nom du modèle introuvable",
    };
  }

  const start = Date.now();

  try {
    const url =
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}` +
      `/ai/run/${modelName}`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        prompt: PROMPT,
      }),
    });

    const elapsed = Date.now() - start;

    let data;

    try {
      data = await response.json();
    } catch {
      data = {
        raw: await response.text(),
      };
    }

    if (!response.ok || data.success === false) {
      return {
        ok: false,
        model: modelName,
        time: elapsed,
        status: response.status,
        error: data.errors || data,
      };
    }

    return {
      ok: true,
      model: modelName,
      time: elapsed,
      response: data.result?.response ?? data.result ?? data,
    };
  } catch (error) {
    return {
      ok: false,
      model: modelName,
      time: Date.now() - start,
      error: error.message,
    };
  }
}

/**
 * Teste les modèles avec une petite concurrence
 * pour éviter de saturer Cloudflare.
 */
async function testWithConcurrency(models, concurrency = 3) {
  const results = [];
  let index = 0;

  async function worker() {
    while (true) {
      const current = index++;

      if (current >= models.length) {
        return;
      }

      const model = models[current];

      console.log(`\n🤖 [${current + 1}/${models.length}] ${model.name}`);

      const result = await testModel(model);

      results.push(result);

      if (result.ok) {
        console.log(`   ✅ OK — ${result.time} ms`);

        const text =
          typeof result.response === "string"
            ? result.response
            : JSON.stringify(result.response);

        console.log(`   💬 ${text.slice(0, 350)}`);
      } else {
        console.log(
          `   ❌ FAILED — HTTP ${result.status || "?"} — ${result.time} ms`,
        );

        console.log(`   ⚠️ ${JSON.stringify(result.error)}`);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, models.length) },
    () => worker(),
  );

  await Promise.all(workers);

  return results;
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════╗
║      CLOUDFLARE AI — MODEL STRESS TEST      ║
╚══════════════════════════════════════════════╝
`);

  console.log("📡 Récupération des modèles Cloudflare...");

  const allModels = await getModels();

  console.log(`📦 ${allModels.length} modèles retournés par Cloudflare`);

  const candidates = allModels.filter(isTextGenerationModel);

  // Évite les doublons.
  const unique = new Map();

  for (const model of candidates) {
    const name = model.name || model.model || model.id;

    if (name) {
      unique.set(name, model);
    }
  }

  const models = [...unique.values()];

  console.log(`🧪 ${models.length} modèles texte/coding candidats`);

  console.log(`⚡ Concurrence: 3 modèles simultanément`);

  console.log(`⏱️ Timeout par modèle: ${TIMEOUT_MS / 1000}s\n`);

  const results = await testWithConcurrency(models, 3);

  // ─────────────────────────────────────────────
  // RÉSULTATS
  // ─────────────────────────────────────────────

  const successful = results
    .filter((r) => r.ok)
    .sort((a, b) => a.time - b.time);

  const failed = results.filter((r) => !r.ok);

  console.log(`
╔══════════════════════════════════════════════╗
║                 🏆 SUCCÈS                    ║
╚══════════════════════════════════════════════╝
`);

  if (!successful.length) {
    console.log("❌ Aucun modèle n'a répondu.");
  } else {
    successful.forEach((r, i) => {
      console.log(`${i + 1}. ${r.model} — ${r.time} ms`);
    });
  }

  console.log(`
╔══════════════════════════════════════════════╗
║                 ❌ ÉCHECS                    ║
╚══════════════════════════════════════════════╝
`);

  for (const r of failed) {
    console.log(`${r.model} — HTTP ${r.status || "N/A"}`);
  }

  // ─────────────────────────────────────────────
  // RÉSUMÉ
  // ─────────────────────────────────────────────

  console.log(`
╔══════════════════════════════════════════════╗
║                  📊 RÉSUMÉ                   ║
╚══════════════════════════════════════════════╝

Total testé : ${results.length}
✅ Fonctionnels : ${successful.length}
❌ Échecs      : ${failed.length}
`);

  // Sauvegarde exploitable par AiGENT.
  const output = {
    testedAt: new Date().toISOString(),
    total: results.length,
    working: successful.map((r) => ({
      model: r.model,
      responseTimeMs: r.time,
    })),
    failed: failed.map((r) => ({
      model: r.model,
      status: r.status,
      error: r.error,
    })),
  };

  const fs = await import("node:fs/promises");

  await fs.writeFile(
    "./cloudflare-model-results.json",
    JSON.stringify(output, null, 2),
  );

  console.log("💾 Résultats sauvegardés dans cloudflare-model-results.json");
}

main().catch((error) => {
  console.error("\n💥 ERREUR FATALE");
  console.error(error);
  process.exit(1);
});
