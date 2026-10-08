import "dotenv/config";

const API_KEY = process.env.POLLINATIONS_API_KEY;

const BASE_URL = "https://gen.pollinations.ai";
const MODELS_URL = `${BASE_URL}/text/models`;
const CHAT_URL = `${BASE_URL}/v1/chat/completions`;

const TIMEOUT_MS = 15_000;
const MAX_TESTS = 12;
const MAX_TOKENS = 80;

const PROMPT =
  "Réponds très brièvement en français : donne 3 avantages d'une API d'IA.";

if (!API_KEY) {
  console.error("❌ POLLINATIONS_API_KEY absent du fichier .env");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

function formatMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortName(id, max = 38) {
  if (id.length <= max) return id;
  return id.slice(0, max - 3) + "...";
}

function getTextPricing(model) {
  const pricing = model.pricing ?? {};

  return {
    prompt: Number(pricing.promptTextTokens ?? NaN),
    completion: Number(pricing.completionTextTokens ?? NaN),
    currency: pricing.currency ?? null,
  };
}

function classifyModel(model) {
  const id = String(model.id ?? model.name ?? "").toLowerCase();
  const pricing = getTextPricing(model);

  // Gratuit explicite : prix texte à 0
  if (pricing.prompt === 0 || pricing.completion === 0) {
    return "FREE";
  }

  // Certains modèles indiquent free dans leur nom,
  // mais Pollinations ne garantit pas que cela signifie
  // "gratuit sans consommation d'allocation".
  if (
    id.includes(":free") ||
    id.includes("-free") ||
    id.includes("_free") ||
    id.includes("/free")
  ) {
    return "CANDIDAT";
  }

  // Modèles sans pricing exploitable
  if (
    !Number.isFinite(pricing.prompt) &&
    !Number.isFinite(pricing.completion)
  ) {
    return "INCONNU";
  }

  return "PAYANT";
}

// ─────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────

async function getModels() {
  const response = await fetch(MODELS_URL, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
    signal: timeoutSignal(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Catalogue HTTP ${response.status}`);
  }

  const json = await response.json();

  // Pollinations peut retourner directement un tableau
  // ou un objet contenant data.
  const models = Array.isArray(json)
    ? json
    : Array.isArray(json.data)
      ? json.data
      : [];

  return models;
}

// ─────────────────────────────────────────────────────────────
// Test d'un modèle
// ─────────────────────────────────────────────────────────────

async function testModel(model) {
  const id = model.id ?? model.name;

  const started = Date.now();

  try {
    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: id,
        messages: [
          {
            role: "user",
            content: PROMPT,
          },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
      }),
      signal: timeoutSignal(TIMEOUT_MS),
    });

    const elapsed = Date.now() - started;

    let json = null;
    let raw = "";

    try {
      json = await response.json();
    } catch {
      raw = await response.text();
    }

    if (!response.ok) {
      const message =
        json?.error?.message || json?.error || raw || `HTTP ${response.status}`;

      return {
        id,
        ok: false,
        status: response.status,
        elapsed,
        message: String(message).replace(/\s+/g, " ").slice(0, 90),
      };
    }

    const text =
      json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? "";

    const usage = json?.usage ?? {};

    return {
      id,
      ok: true,
      status: response.status,
      elapsed,
      text: String(text).replace(/\s+/g, " ").slice(0, 100),
      usage,
    };
  } catch (error) {
    const elapsed = Date.now() - started;

    return {
      id,
      ok: false,
      status: "ERR",
      elapsed,
      message:
        error?.name === "TimeoutError"
          ? "timeout"
          : String(error?.message || error).slice(0, 90),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Sélection intelligente
// ─────────────────────────────────────────────────────────────

function selectModels(models) {
  const textModels = models.filter((m) => {
    const id = String(m.id ?? m.name ?? "").toLowerCase();

    // On exclut explicitement les familles non-chat
    const excluded = [
      "embedding",
      "tts",
      "transcribe",
      "whisper",
      "realtime",
      "audio",
      "image",
      "flux",
      "video",
      "3d",
    ];

    return id && !excluded.some((word) => id.includes(word));
  });

  const free = [];
  const candidates = [];
  const cheap = [];

  for (const model of textModels) {
    const classification = classifyModel(model);
    const pricing = getTextPricing(model);

    if (classification === "FREE") {
      free.push(model);
      continue;
    }

    if (classification === "CANDIDAT") {
      candidates.push(model);
      continue;
    }

    if (
      Number.isFinite(pricing.prompt) &&
      Number.isFinite(pricing.completion)
    ) {
      // On prend seulement les modèles très peu chers
      if (pricing.prompt <= 0.000001 && pricing.completion <= 0.000003) {
        cheap.push(model);
      }
    }
  }

  // Priorité :
  // 1. gratuit explicite
  // 2. modèles nommés free
  // 3. modèles très peu chers
  return [...free, ...candidates, ...cheap]
    .filter(
      (model, index, arr) =>
        arr.findIndex((x) => (x.id ?? x.name) === (model.id ?? model.name)) ===
        index,
    )
    .slice(0, MAX_TESTS);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`
╔══════════════════════════════════════════════════╗
║       Pollinations — Model Test Suite            ║
╚══════════════════════════════════════════════════╝
`);

  console.log(`🔐 API key : ${API_KEY ? "présente" : "absente"}`);
  console.log(`🌐 API     : ${BASE_URL}`);
  console.log(`⏱️ Timeout : ${TIMEOUT_MS / 1000}s`);
  console.log(`🧪 Max tok : ${MAX_TOKENS}`);
  console.log(`📦 Max tests : ${MAX_TESTS}`);

  console.log("\n🔎 Catalogue...");

  const catalogStarted = Date.now();

  let models;

  try {
    models = await getModels();
  } catch (error) {
    console.error(`❌ Impossible de récupérer le catalogue`);
    console.error(`   ${error.message}`);
    process.exit(1);
  }

  console.log(
    `   ✅ ${models.length} modèles en ${formatMs(
      Date.now() - catalogStarted,
    )}`,
  );

  const textModels = models.filter((m) => {
    const id = String(m.id ?? m.name ?? "").toLowerCase();

    return ![
      "embedding",
      "tts",
      "transcribe",
      "whisper",
      "realtime",
      "audio",
      "image",
      "flux",
      "video",
      "3d",
    ].some((x) => id.includes(x));
  });

  const classifications = {
    FREE: 0,
    CANDIDAT: 0,
    PAYANT: 0,
    INCONNU: 0,
  };

  for (const model of textModels) {
    classifications[classifyModel(model)]++;
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CATALOGUE TEXTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 Modèles texte       : ${textModels.length}
🟢 Gratuit explicite   : ${classifications.FREE}
🟡 Candidat "free"     : ${classifications.CANDIDAT}
🔴 Avec pricing        : ${classifications.PAYANT}
⚪ Pricing inconnu     : ${classifications.INCONNU}
`);

  const selected = selectModels(models);

  if (!selected.length) {
    console.log("⚠️ Aucun modèle candidat trouvé.");
    console.log("   Le catalogue ne permet pas de confirmer");
    console.log("   un modèle gratuit automatiquement.");
    return;
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🚀 TEST DE ${selected.length} MODÈLE(S)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  for (const model of selected) {
    const id = model.id ?? model.name;
    const type = classifyModel(model);

    console.log(`⏳ ${type === "FREE" ? "🟢" : "🟡"} ${shortName(id)}`);
  }

  console.log("\n⚡ Lancement parallèle...\n");

  const results = await Promise.all(selected.map(testModel));

  for (const result of results) {
    const status = result.ok ? "✅" : "❌";
    const time = formatMs(result.elapsed);

    if (result.ok) {
      console.log(
        `${status} ${shortName(result.id, 38).padEnd(41)} ` +
          `${String(result.status).padEnd(3)}  ${time.padStart(6)}  ` +
          `${result.text}`,
      );
    } else {
      console.log(
        `${status} ${shortName(result.id, 38).padEnd(41)} ` +
          `${String(result.status).padEnd(3)}  ${time.padStart(6)}  ` +
          `${result.message}`,
      );
    }
  }

  const success = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 RÉSUMÉ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 Réponses OK : ${success.length}
🔴 Échecs      : ${failed.length}
📦 Testés      : ${results.length}
`);

  if (success.length) {
    console.log("🟢 MODÈLES QUI RÉPONDENT :");

    for (const result of success) {
      console.log(`   ✓ ${shortName(result.id)} — ${formatMs(result.elapsed)}`);
    }
  }

  console.log("\nTerminé.");
}

main();
