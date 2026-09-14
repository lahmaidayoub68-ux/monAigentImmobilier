//================ AI PARSEE — MON AIGENT VOYAGE (v1) ========================//
// Cascade IA : Gemini (liste ordonnée, testée séquentiellement)
//            → NVIDIA (Llama-3.3-70b)
//            → OpenRouter (découverte des modèles :free réellement dispo)
//            → Cohere (découverte dynamique des modèles Chat actifs)
//
// Différence structurelle avec Emploi / Occas / Immobilier :
//   - Pas de tunnel pas-à-pas champ par champ. L'IA VOYAGE lit UN message
//     libre (prestataire OU voyageur) et en extrait TOUS les critères
//     compatibles en une seule passe (activité, ville, créneau, capacité,
//     prix, budget, personnes, préférences, flexibilité...).
//   - L'IA ne se contente pas d'extraire : elle formule une confirmation
//     "d'agence de voyage" (une seule réponse, pas de questions en rafale),
//     elle explique un prix recommandé calculé par le moteur déterministe
//     (matchingEngineVoyage.js), et — spécificité unique à Voyage — elle
//     propose des IDÉES DE VOYAGE structurées quand la demande est ouverte
//     ou incomplète.
//   - Le calcul (score de compatibilité, prix recommandé, exclusions) reste
//     100% déterministe côté matchingEngineVoyage.js : l'IA ne fait QUE la
//     compréhension du langage naturel et la formulation. Elle reçoit les
//     résultats du moteur et les commente, elle ne les invente jamais.
// ─────────────────────────────────────────────────────────────────────────

import "dotenv/config";

/* ════════════════════════════════════════════════════════════════════════
   HELPERS NUMÉRIQUES / JSON / NETTOYAGE
   ════════════════════════════════════════════════════════════════════════ */

export function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, "").replace(/[€$]/g, "");
  if (cleaned.toLowerCase().endsWith("k")) {
    const n = parseFloat(cleaned.slice(0, -1)) * 1000;
    return isNaN(n) ? null : Math.round(n);
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function stripThinking(text) {
  if (!text) return text;
  let cleaned = text;
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
  const finalMarkers =
    /(?:^|\n)\s*(?:final answer|réponse finale|réponse)\s*:\s*/i;
  const parts = cleaned.split(finalMarkers);
  if (parts.length > 1) cleaned = parts[parts.length - 1].trim();
  return cleaned;
}

function extractJSON(text) {
  if (!text) return null;
  const cleaned = stripThinking(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const direct = JSON.parse(cleaned);
    if (typeof direct === "object" && direct !== null) return direct;
  } catch (_) {}
  try {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (_) {}
  return null;
}

const LANG_GUARD = `IMPÉRATIF : réponds exclusivement en français courant, comme le ferait un humain à l'oral. N'affiche JAMAIS ton raisonnement, tes étapes de réflexion, de balises comme <think>, ni de méta-commentaire du type "je dois générer", "ma tâche est", "tu es un conseiller"... Ne recopie jamais la consigne. Ne produis aucun mot en anglais. Ne renvoie du JSON QUE si un schéma JSON est explicitement demandé ci-dessous — sinon renvoie une phrase brute, sans accolades, sans guillemets, sans préambule. Une seule réponse finale, rien d'autre.`;

// Filtre anti-charabia / anti-méta-commentaire / anti-anglais / anti-verdict
// de classifieur de modération — trop de modèles gratuits renvoient un
// artefact au lieu de la réponse attendue.
function isUnusableOutput(text, { expectJson = false } = {}) {
  if (!text || !text.trim()) return true;
  const t = text.toLowerCase();
  if (!expectJson && t.length > 620) return true;
  if (!expectJson && text.trim().split(/\s+/).length < 3) return true;
  const metaPatterns = [
    /\btu es un\b/,
    /\bta tâche\b/,
    /\bla tâche est\b/,
    /\bje dois générer\b/,
    /\bréponds uniquement\b/,
    /\bvoici le message\b/,
    /\ben tant qu'ia\b/,
    /<think/i,
    /\bas an ai\b/,
    /\bokay,?\s*so\b/,
    /\blet me\b/,
    /\buser safety\b/i,
    /\bcontent safety\b/i,
    /^\s*(safe|unsafe)\s*[:.]?\s*$/i,
    /\bmoderation (result|verdict|flag)\b/i,
    /\bpolicy violation\b/i,
  ];
  if (metaPatterns.some((re) => re.test(t))) return true;
  if (!expectJson && /[{}]/.test(text)) return true;
  if (/\b\w{3,}ells\w*\b/i.test(t)) return true;
  const englishTells = (
    t.match(
      /\b(the|here|where|deep|every|this|should|would|i am|as an|okay)\b/g,
    ) || []
  ).length;
  if (englishTells >= 3) return true;
  return false;
}

/* ════════════════════════════════════════════════════════════════════════
   PROVIDER 1 — GEMINI (liste ordonnée, testée séquentiellement)
   ════════════════════════════════════════════════════════════════════════ */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Du plus capable/récent au plus basique — à réajuster si Google fait
// évoluer sa gamme "flash" gratuite. On ne touche jamais aux modèles payants.
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

let geminiClient = null;
if (GEMINI_API_KEY) {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  } catch (e) {
    console.warn(
      "⚠️ [VOYAGE AI] Package @google/genai introuvable — Gemini désactivé:",
      e.message,
    );
  }
}

function messagesToGeminiContents(messages) {
  return messages
    .map((m) =>
      m.role === "system" ? `[Instructions système]\n${m.content}` : m.content,
    )
    .join("\n\n");
}

function getGeminiStatus(error) {
  return (
    error?.status || error?.response?.status || error?.httpStatusCode || null
  );
}

async function callGemini(messages, maxTokens = 500, opts = {}) {
  if (!geminiClient) return null;
  const contents = messagesToGeminiContents(messages);

  for (const model of GEMINI_MODELS) {
    try {
      // APRÈS
      const response = await geminiClient.models.generateContent({
        model,
        contents,
        config: {
          maxOutputTokens: maxTokens,
          temperature: 0.3,
          thinkingConfig: { thinkingBudget: 0 }, // désactive le raisonnement caché qui grignotait le quota
        },
      });
      const text = response?.text?.trim() || "";
      if (text && !isUnusableOutput(text, opts)) {
        console.log(`✅ [VOYAGE AI] Gemini OK (${model})`);
        return text;
      }
      console.warn(
        `⚠️ [VOYAGE AI] Gemini ${model} — sortie inexploitable ou vide, modèle suivant`,
      );
    } catch (e) {
      const status = getGeminiStatus(e);
      console.warn(
        `⚠️ [VOYAGE AI] Gemini ${model} FAILED:${status ? " HTTP " + status : ""}`,
        e.message?.slice(0, 100),
      );
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   PROVIDER 2 — NVIDIA (Llama-3.3-70b)
   ════════════════════════════════════════════════════════════════════════ */

async function callNvidia(messages, maxTokens = 500) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "meta/llama-3.3-70b-instruct",
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
          stream: false,
        }),
      },
    );
    if (!r.ok) {
      console.warn(`⚠️ [VOYAGE AI] NVIDIA FAILED: HTTP ${r.status}`);
      return null;
    }
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content?.trim() || "";
    if (text) {
      console.log("✅ [VOYAGE AI] NVIDIA OK");
      return text;
    }
    console.warn("⚠️ [VOYAGE AI] NVIDIA — réponse vide");
    return null;
  } catch (e) {
    console.warn("⚠️ [VOYAGE AI] NVIDIA FAILED:", e.message?.slice(0, 100));
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   PROVIDER 3 — OPENROUTER (découverte des modèles :free)
   ════════════════════════════════════════════════════════════════════════ */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";
let openRouterModelsCache = null;
let openRouterModelsCacheAt = 0;
const OPENROUTER_MODELS_TTL = 15 * 60 * 1000; // 15 min

function openRouterPriority(model) {
  const id = model.id.toLowerCase();
  if (/(r1|qwq|thinking|reasoning|o1|o3)/.test(id)) return -1;
  if (id.includes("nemotron")) return 100;
  if (id.includes("trinity-large")) return 95;
  if (id.includes("deepseek")) return 90;
  if (id.includes("qwen")) return 85;
  if (id.includes("llama")) return 80;
  if (id.includes("gemma")) return 70;
  if (id.includes("mistral")) return 60;
  return 10;
}

async function getOpenRouterFreeModels() {
  if (
    openRouterModelsCache &&
    Date.now() - openRouterModelsCacheAt < OPENROUTER_MODELS_TTL
  ) {
    return openRouterModelsCache;
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const response = await fetch(
    `${OPENROUTER_API_URL}/models?output_modalities=text`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.error?.message || data?.message || `HTTP ${response.status}`,
    );
  }

  const models = (data.data || [])
    .filter((model) => {
      const promptPrice = Number(model.pricing?.prompt ?? -1);
      const completionPrice = Number(model.pricing?.completion ?? -1);
      return (
        promptPrice === 0 &&
        completionPrice === 0 &&
        model.architecture?.output_modalities?.includes("text")
      );
    })
    .filter((model) => openRouterPriority(model) >= 0)
    .sort((a, b) => openRouterPriority(b) - openRouterPriority(a))
    .slice(0, 5);

  openRouterModelsCache = models;
  openRouterModelsCacheAt = Date.now();
  return models;
}

async function callOpenRouter(messages, maxTokens = 500, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  let models;
  try {
    models = await getOpenRouterFreeModels();
  } catch (e) {
    console.warn(
      "⚠️ [VOYAGE AI] OpenRouter — impossible de récupérer les modèles:",
      e.message,
    );
    return null;
  }
  if (!models.length) {
    console.warn("⚠️ [VOYAGE AI] OpenRouter — aucun modèle :free disponible");
    return null;
  }

  for (const model of models) {
    try {
      const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model.id,
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.warn(
          `⚠️ [VOYAGE AI] OpenRouter ${model.id} FAILED: HTTP ${response.status} — ${data?.error?.message || data?.message || ""}`,
        );
        continue;
      }
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      if (text && !isUnusableOutput(text, opts)) {
        console.log(`✅ [VOYAGE AI] OpenRouter OK (${model.id})`);
        return text;
      }
      console.warn(
        `⚠️ [VOYAGE AI] OpenRouter ${model.id} — sortie inexploitable, modèle suivant`,
      );
    } catch (e) {
      console.warn(
        `⚠️ [VOYAGE AI] OpenRouter ${model.id} FAILED:`,
        e.message?.slice(0, 100),
      );
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   PROVIDER 4 — COHERE (découverte dynamique des modèles Chat actifs)
   ════════════════════════════════════════════════════════════════════════ */

const COHERE_API_URL = "https://api.cohere.com";
let cohereModelsCache = null;
let cohereModelsCacheAt = 0;
const COHERE_MODELS_TTL = 30 * 60 * 1000; // 30 min

function isCohereTextModel(model) {
  return !model.is_deprecated && model.endpoints?.includes("chat");
}

async function getCohereModels() {
  if (
    cohereModelsCache &&
    Date.now() - cohereModelsCacheAt < COHERE_MODELS_TTL
  ) {
    return cohereModelsCache;
  }
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return [];

  const models = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ endpoint: "chat", page_size: "100" });
    if (pageToken) params.set("page_token", pageToken);
    const response = await fetch(`${COHERE_API_URL}/v1/models?${params}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data?.message || data?.error || `HTTP ${response.status}`,
      );
    }
    models.push(...(data.models || []));
    pageToken = data.next_page_token || null;
  } while (pageToken);

  const filtered = models.filter(isCohereTextModel);
  cohereModelsCache = filtered;
  cohereModelsCacheAt = Date.now();
  return filtered;
}

async function callCohere(messages, maxTokens = 500) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return null;

  let models;
  try {
    models = await getCohereModels();
  } catch (e) {
    console.warn(
      "⚠️ [VOYAGE AI] Cohere — impossible de récupérer les modèles:",
      e.message,
    );
    return null;
  }
  if (!models.length) {
    console.warn("⚠️ [VOYAGE AI] Cohere — aucun modèle Chat actif disponible");
    return null;
  }

  for (const model of models) {
    try {
      const response = await fetch(`${COHERE_API_URL}/v2/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model.name,
          messages,
          max_tokens: maxTokens,
          temperature: 0.2,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.warn(
          `⚠️ [VOYAGE AI] Cohere ${model.name} FAILED: HTTP ${response.status} — ${data?.message || data?.error || ""}`,
        );
        continue;
      }
      const content = data?.message?.content;
      const text = Array.isArray(content)
        ? content
            .filter((i) => i?.type === "text")
            .map((i) => i.text)
            .join("\n")
            .trim()
        : "";
      if (text) {
        console.log(`✅ [VOYAGE AI] Cohere OK (${model.name})`);
        return text;
      }
      console.warn(`⚠️ [VOYAGE AI] Cohere ${model.name} — réponse vide`);
    } catch (e) {
      console.warn(
        `⚠️ [VOYAGE AI] Cohere ${model.name} FAILED:`,
        e.message?.slice(0, 100),
      );
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   CASCADE PRINCIPALE — Gemini → NVIDIA → OpenRouter → Cohere
   ════════════════════════════════════════════════════════════════════════ */

async function callLLM(messages, maxTokens = 500, opts = {}) {
  const gemini = await callGemini(messages, maxTokens, opts);
  if (gemini) return stripThinking(gemini);

  const nvidia = await callNvidia(messages, maxTokens);
  if (nvidia) return stripThinking(nvidia);

  const or = await callOpenRouter(messages, maxTokens, opts);
  if (or) return stripThinking(or);

  const cohere = await callCohere(messages, maxTokens);
  if (cohere) return stripThinking(cohere);

  console.error(
    "❌ [VOYAGE AI] Tous les providers ont échoué (Gemini, NVIDIA, OpenRouter, Cohere)",
  );
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   TAXONOMIE — CATÉGORIES D'EXPÉRIENCE
   ════════════════════════════════════════════════════════════════════════ */

export const CATEGORIES_EXPERIENCE = [
  "mer",
  "nature",
  "culture",
  "gastronomie",
  "detente",
  "aventure",
  "nocturne",
  "famille",
  "transport",
  "hebergement",
];

export const CATEGORIES_PROCHES = {
  mer: ["nature", "aventure"],
  nature: ["mer", "aventure"],
  culture: ["gastronomie", "famille"],
  gastronomie: ["culture", "detente"],
  detente: ["gastronomie", "hebergement"],
  aventure: ["mer", "nature"],
  nocturne: ["gastronomie", "detente"],
  famille: ["culture", "nature"],
  transport: [],
  hebergement: ["detente"],
};

/* ════════════════════════════════════════════════════════════════════════
   EXTRACTION — PRESTATAIRE (offre) vs VOYAGEUR (demande)
   Tout est extrait EN UNE SEULE PASSE, sans tunnel séquentiel.
   ════════════════════════════════════════════════════════════════════════ */

const EXTRACTION_SCHEMA_PRESTATAIRE = `{
  "activite": null,
  "categorie": null,
  "ville": null,
  "zonePrecise": null,
  "date": null,
  "heure": null,
  "dureeMinutes": null,
  "placesTotales": null,
  "placesRestantes": null,
  "prixHabituel": null,
  "ageMinimum": null,
  "annulationFlexible": null,
  "conditions": null
}`;

const EXTRACTION_SCHEMA_VOYAGEUR = `{
  "ville": null,
  "zone": null,
  "date": null,
  "heure": null,
  "flexibiliteHeureMinutes": null,
  "nombrePersonnes": null,
  "budgetTotal": null,
  "budgetParPersonne": null,
  "categorie": null,
  "preferences": null,
  "mobilite": null
}`;

function buildExtractionPrompt(role) {
  const isPrestataire = role === "prestataire";
  const categories = CATEGORIES_EXPERIENCE.join(", ");
  return `${LANG_GUARD}

Tu es le moteur de compréhension de Mon AiGENT Voyage, une plateforme qui transforme la capacité touristique invendue (places, chambres, créneaux) en transactions. Tu analyses UN SEUL message ${isPrestataire ? "d'un PRESTATAIRE (hôtel, bateau, guide, activité, transfert) qui propose de la capacité disponible" : "d'un VOYAGEUR qui cherche une expérience"} et tu en extrais TOUS les critères présents, EN UNE SEULE PASSE — n'attends jamais un message par champ, le voyageur/prestataire donne souvent tout d'un coup ("demain 18h, il me reste 5 places sur le bateau, normalement 55€" ou "je suis à Marseille demain avec ma copine, on a 80€ et on veut faire un truc sympa l'après-midi").

RÈGLES STRICTES :
- N'invente RIEN, ne déduis RIEN au-delà de ce qui est raisonnablement implicite (ex: "ma copine et moi" → nombrePersonnes=2 ; "cet après-midi" → heure≈15, flexibiliteHeureMinutes=120). Si une info n'est vraiment pas déductible, laisse null.
- categorie : classe dans une de ces catégories si possible : ${categories}. Sinon null.
- date : normalise en "aujourd'hui" / "demain" / une date ISO si donnée / null. Ne calcule pas de date absolue toi-même si le message dit juste "ce week-end" — renseigne alors la chaîne telle quelle.
- heure : nombre entier 0-23 représentant l'heure de créneau souhaitée/proposée (ex: "cet après-midi" → 15, "en soirée" → 20, "le matin" → 10).
- Prix / budget : "55€" / "80 balles" / "environ 100€ pour nous deux" → convertis en nombre. Si un budget est donné "pour nous deux/tous", c'est budgetTotal (pas par personne).
- ${
    isPrestataire
      ? `placesTotales / placesRestantes : nombre de places disponibles. Si un seul nombre est donné ("il me reste 5 places"), c'est placesRestantes ; placesTotales reste null sauf précision.
- annulationFlexible : true/false uniquement si explicitement mentionné (remboursable, annulation gratuite...).`
      : `nombrePersonnes : déduit du contexte (couple, famille de 4, seul...).
- mobilite : "a-pied" / "voiture" / "transports" si mentionné, sinon null.
- preferences : toute envie ou contrainte libre (calme, actif, en intérieur, avec enfants, romantique...) sous forme de texte court.`
  }

Réponds UNIQUEMENT avec ce JSON strict, sans texte autour, sans commentaire :
${isPrestataire ? EXTRACTION_SCHEMA_PRESTATAIRE : EXTRACTION_SCHEMA_VOYAGEUR}`;
}

function mergeExtractedCriteria(existing, incoming, role) {
  const merged = { ...existing };
  if (!incoming || typeof incoming !== "object") return merged;

  for (const [key, val] of Object.entries(incoming)) {
    if (val === null || val === undefined || val === "") continue;

    if (
      [
        "prixHabituel",
        "placesTotales",
        "placesRestantes",
        "dureeMinutes",
        "ageMinimum",
        "nombrePersonnes",
        "budgetTotal",
        "budgetParPersonne",
        "flexibiliteHeureMinutes",
        "heure",
      ].includes(key)
    ) {
      const n = normalizeNumber(val);
      if (n !== null) merged[key] = n;
      continue;
    }
    if (key === "annulationFlexible") {
      merged[key] = val === true || String(val).toLowerCase() === "true";
      continue;
    }
    if (key === "categorie") {
      const v = String(val).trim().toLowerCase();
      merged.categorie = CATEGORIES_EXPERIENCE.includes(v) ? v : v || null;
      continue;
    }
    if (typeof val === "string" && val.trim()) merged[key] = val.trim();
    else if (typeof val === "object") merged[key] = val;
  }

  // Cohérences croisées
  if (role === "prestataire") {
    if (merged.placesRestantes != null && merged.placesTotales == null)
      merged.placesTotales = merged.placesRestantes;
  } else {
    if (merged.budgetTotal != null && merged.nombrePersonnes) {
      merged.budgetParPersonne = Math.round(
        merged.budgetTotal / merged.nombrePersonnes,
      );
    } else if (merged.budgetParPersonne != null && merged.nombrePersonnes) {
      merged.budgetTotal = Math.round(
        merged.budgetParPersonne * merged.nombrePersonnes,
      );
    }
  }

  return merged;
}

/**
 * Extrait TOUS les critères présents dans un message libre, en une seule
 * passe IA, et les fusionne avec les critères déjà connus.
 */
export async function extractCriteria(userMessage, role, existingCriteria) {
  const prompt = buildExtractionPrompt(role);
  const aiText = await callLLM(
    [
      { role: "system", content: prompt },
      { role: "user", content: userMessage },
    ],
    400,
    { expectJson: true },
  );

  if (!aiText) return { ...existingCriteria };
  const raw = extractJSON(aiText);
  if (!raw) return { ...existingCriteria };
  return mergeExtractedCriteria(existingCriteria, raw, role);
}

/* ════════════════════════════════════════════════════════════════════════
   CHAMPS MANQUANTS CRITIQUES (pour relance ciblée, jamais en tunnel rigide)
   ════════════════════════════════════════════════════════════════════════ */

// Ordre de collecte STRICT et SÉQUENTIEL — un seul champ à la fois.
// categorie et preferences sont toujours en dernier : ce sont les deux
// seuls champs qui ne peuvent JAMAIS être validés par du texte libre,
// uniquement via leur pop-up dédié (voir isFieldFilled ci-dessous).
export const FIELD_ORDER = {
  voyageur: [
    "ville",
    "date",
    "heure",
    "nombrePersonnes",
    "budgetTotal",
    "categorie",
    "preferences",
  ],
  prestataire: [
    "categorie",
    "ville",
    "date",
    "heure",
    "placesRestantes",
    "prixHabituel",
    "preferences",
  ],
};

export function isFieldFilled(sc, field, role) {
  switch (field) {
    case "ville":
      return role === "voyageur" ? !!(sc.ville || sc.zone) : !!sc.ville;
    case "date":
      return !!sc.date;
    case "heure":
      return sc.heure != null;
    case "nombrePersonnes":
      return sc.nombrePersonnes != null;
    case "budgetTotal":
      return sc.budgetTotal != null;
    case "placesRestantes":
      return sc.placesRestantes != null;
    case "prixHabituel":
      return sc.prixHabituel != null;
    // Ces deux champs ne sont "remplis" QUE si le flag *Confirmed est
    // passé à true — et ce flag n'est JAMAIS posé par l'extraction IA,
    // uniquement par la validation du pop-up côté serveur.
    case "categorie":
      return sc.categorieConfirmed === true;
    case "preferences":
      return sc.preferencesConfirmed === true;
    default:
      return sc[field] != null && sc[field] !== "";
  }
}

export function missingCriticalFields(sc, role) {
  return FIELD_ORDER[role].filter((f) => !isFieldFilled(sc, f, role));
}

export function nextMissingField(sc, role) {
  const missing = missingCriticalFields(sc, role);
  return missing.length ? missing[0] : null;
}

/* ════════════════════════════════════════════════════════════════════════
   FORMULATION — confirmation "agence de voyage" en une seule réponse
   ════════════════════════════════════════════════════════════════════════ */
const SINGLE_FIELD_LABELS = {
  voyageur: {
    ville: "la ville ou la zone où le voyageur veut partir",
    date: "la date souhaitée",
    heure: "l'heure ou le moment de la journée souhaité",
    nombrePersonnes: "le nombre de personnes qui voyageront",
    budgetTotal: "le budget total du groupe pour cette expérience",
  },
  prestataire: {
    ville: "la ville où se situe l'offre",
    date: "la date du créneau proposé",
    heure: "l'heure du créneau proposé",
    placesRestantes: "le nombre de places restantes",
    prixHabituel: "le prix habituel de cette prestation",
  },
};

function toneBlock(role) {
  return role === "prestataire"
    ? `Tu t'adresses à un PRESTATAIRE touristique au sujet de la capacité qu'il propose. Ton professionnel, efficace, orienté vente — jamais robotique.`
    : `Tu t'adresses à un VOYAGEUR. Ton chaleureux, expert, comme une conciergerie de voyage haut de gamme — jamais robotique, jamais une liste de questions froides.`;
}

function knownSummary(sc) {
  return Object.entries(sc)
    .filter(
      ([k, v]) =>
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !k.endsWith("Hint") &&
        !k.endsWith("Confirmed"),
    )
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ");
}

function buildSingleQuestionPrompt(role, sc, field) {
  const label = SINGLE_FIELD_LABELS[role][field];
  return `Tu es l'agent IA de Mon AiGENT Voyage, expert en tourisme et négociation de dernière minute.

${toneBlock(role)}

Informations déjà comprises (ne les redemande JAMAIS) : ${knownSummary(sc) || "aucune pour l'instant"}.

TÂCHE : pose UNE SEULE question, courte et naturelle, pour connaître : ${label}. Une phrase, deux maximum. Ne pose aucune autre question, même si plusieurs infos manquent encore.

Réponds UNIQUEMENT avec le texte du message, sans JSON, sans guillemets, sans préambule.`;
}

function buildPopupTransitionPrompt(role, sc, field, hint) {
  const fieldLabel =
    field === "categorie"
      ? "le type d'expérience"
      : role === "prestataire"
        ? "les atouts à mettre en avant"
        : "les préférences pour cette expérience";
  const hintNote = hint
    ? `La personne a déjà glissé une piste ("${hint}") dans la conversation : reconnais-la brièvement et avec naturel, sans la valider officiellement.`
    : "";

  return `Tu es l'agent IA de Mon AiGENT Voyage.

${toneBlock(role)}

Informations déjà comprises : ${knownSummary(sc) || "aucune pour l'instant"}.
${hintNote}

TÂCHE : annonce en UNE SEULE phrase fluide et chaleureuse (jamais robotique) que tu affiches maintenant un sélecteur pour préciser ${fieldLabel}. Ne pose AUCUNE question ouverte — l'interface s'affiche juste après ton message.

Réponds UNIQUEMENT avec le texte du message, sans JSON, sans guillemets.`;
}

function fallbackSingleQuestion(role, field) {
  const FALLBACKS = {
    voyageur: {
      ville: "Dans quelle ville ou zone souhaitez-vous partir ?",
      date: "Quelle date envisagez-vous ?",
      heure: "À quelle heure, ou à quel moment de la journée ?",
      nombrePersonnes: "Combien serez-vous ?",
      budgetTotal: "Quel est votre budget total pour le groupe ?",
    },
    prestataire: {
      ville: "Dans quelle ville se situe votre offre ?",
      date: "Quelle est la date du créneau ?",
      heure: "À quelle heure ?",
      placesRestantes: "Combien de places vous reste-t-il ?",
      prixHabituel: "Quel est le prix habituel de cette prestation ?",
    },
  };
  return FALLBACKS[role]?.[field] || "Pouvez-vous préciser ce point ?";
}

function fallbackPopupTransition(role, field, hint) {
  if (field === "categorie") {
    return hint
      ? `Parfait, je garde en tête l'idée de "${hint}" — choisissez ci-dessous le type d'expérience le plus proche pour que je cible juste.`
      : "Sélectionnez ci-dessous le type d'expérience qui vous correspond.";
  }
  return role === "prestataire"
    ? "Indiquez ci-dessous les atouts que vous souhaitez mettre en avant sur votre offre."
    : "Indiquez ci-dessous vos préférences pour cette expérience, si vous en avez.";
}

/**
 * Cœur du tunnel séquentiel : détermine le PROCHAIN champ manquant et
 * génère UNE SEULE question (ou une transition vers pop-up) à la fois.
 * Ne renvoie jamais plusieurs demandes groupées.
 */
export async function generateConfirmation(role, sc) {
  const field = nextMissingField(sc, role);

  if (!field) {
    return {
      message: null,
      missing: [],
      nextField: null,
      popup: null,
      done: true,
    };
  }

  const missing = missingCriticalFields(sc, role);

  if (field === "categorie" || field === "preferences") {
    const hint = field === "categorie" ? sc.categorieHint : sc.preferencesHint;
    try {
      const prompt = buildPopupTransitionPrompt(role, sc, field, hint);
      const aiText = await callLLM(
        [
          { role: "system", content: prompt },
          { role: "user", content: "Génère le message." },
        ],
        160,
      );
      const message =
        aiText && !isUnusableOutput(aiText)
          ? aiText.trim().replace(/^"|"$/g, "")
          : fallbackPopupTransition(role, field, hint);
      return { message, missing, nextField: field, popup: field, done: false };
    } catch (e) {
      console.warn(
        "⚠️ [VOYAGE AI] Transition pop-up FAILED:",
        e?.message?.slice(0, 100),
      );
      return {
        message: fallbackPopupTransition(role, field, hint),
        missing,
        nextField: field,
        popup: field,
        done: false,
      };
    }
  }

  try {
    const prompt = buildSingleQuestionPrompt(role, sc, field);
    const aiText = await callLLM(
      [
        { role: "system", content: prompt },
        { role: "user", content: "Génère la question." },
      ],
      140,
    );
    const message =
      aiText && !isUnusableOutput(aiText)
        ? aiText.trim().replace(/^"|"$/g, "")
        : fallbackSingleQuestion(role, field);
    return { message, missing, nextField: field, popup: null, done: false };
  } catch (e) {
    console.warn("⚠️ [VOYAGE AI] Question FAILED:", e?.message?.slice(0, 100));
    return {
      message: fallbackSingleQuestion(role, field),
      missing,
      nextField: field,
      popup: null,
      done: false,
    };
  }
}

/* ════════════════════════════════════════════════════════════════════════
   IDÉES DE VOYAGE — spécificité unique à AiGENT Voyage.
   L'IA participe activement : même sans match parfait dans le pool réel,
   elle propose des pistes structurées et exploitables.
   ════════════════════════════════════════════════════════════════════════ */

function buildIdeasPrompt(sc) {
  const known = Object.entries(sc)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

  return `${LANG_GUARD}

Tu es un conseiller voyage expert et créatif pour Mon AiGENT Voyage. Un voyageur a exprimé une demande. Propose 3 IDÉES D'EXPÉRIENCES concrètes et réalistes (pas nécessairement dans le pool de la plateforme — des pistes générales adaptées à sa ville, son budget et son créneau), pour l'inspirer et affiner sa recherche.

Demande connue : ${known || "peu d'informations, reste générique mais utile"}.

Réponds UNIQUEMENT avec ce JSON strict (tableau de 3 objets), sans texte autour :
{
  "idees": [
    { "titre": "string court", "description": "1-2 phrases concrètes", "budgetEstime": "string ex: 30-50€/pers", "categorie": "mer|nature|culture|gastronomie|detente|aventure|nocturne|famille" }
  ]
}`;
}

const FALLBACK_IDEAS = [
  {
    titre: "Balade en bord de mer ou de rivière",
    description:
      "Une marche ou un tour en petit bateau selon la ville, idéal pour un après-midi flexible sur le budget.",
    budgetEstime: "10-30€/pers",
    categorie: "nature",
  },
  {
    titre: "Visite guidée du centre historique",
    description:
      "Une découverte culturelle à pied avec un guide local, adaptable à un petit groupe.",
    budgetEstime: "15-25€/pers",
    categorie: "culture",
  },
  {
    titre: "Moment détente ou dégustation locale",
    description:
      "Un spa, un atelier culinaire ou une dégustation pour finir la journée en douceur.",
    budgetEstime: "25-55€/pers",
    categorie: "detente",
  },
];

/** Génère 3 idées de voyage structurées, même en l'absence de résultats réels. */
export async function generateTravelIdeas(demandCriteria) {
  try {
    const prompt = buildIdeasPrompt(demandCriteria);
    const aiText = await callLLM(
      [
        { role: "system", content: prompt },
        { role: "user", content: "Génère les idées." },
      ],
      450,
      { expectJson: true },
    );
    const raw = aiText ? extractJSON(aiText) : null;
    if (raw?.idees && Array.isArray(raw.idees) && raw.idees.length) {
      return raw.idees.slice(0, 3);
    }
  } catch (e) {
    console.warn("⚠️ [VOYAGE AI] Idées FAILED:", e?.message?.slice(0, 100));
  }
  return FALLBACK_IDEAS;
}

/* ════════════════════════════════════════════════════════════════════════
   PRICING — l'IA explique un prix déjà calculé par le moteur déterministe,
   elle ne le recalcule jamais elle-même.
   ════════════════════════════════════════════════════════════════════════ */

function buildPricingPrompt(offer, pricing) {
  return `${LANG_GUARD}

Tu es le module de pricing conversationnel de Mon AiGENT Voyage. Le moteur de calcul (déterministe, pas toi) a déjà déterminé le prix recommandé ci-dessous à partir du temps restant avant le créneau et du taux de remplissage. Ta seule tâche : l'expliquer en 2-3 phrases claires et convaincantes au prestataire, pour qu'il comprenne pourquoi ce prix maximise ses chances de vendre sa capacité avant qu'elle ne soit perdue.

Offre : ${offer.activite || offer.categorie || "activité"} — ${offer.ville || ""} — ${offer.placesRestantes ?? "?"} places restantes — prix habituel ${offer.prixHabituel ?? "?"}€.
Calcul du moteur : prix recommandé ${pricing.prixRecommande}€ (remise de ${pricing.remisePourcent}%), urgence "${pricing.urgence}", ${pricing.heuresRestantes != null ? `${pricing.heuresRestantes}h avant le créneau` : "créneau non daté"}.

Réponds UNIQUEMENT avec le texte du message, sans JSON, sans préambule.`;
}

function fallbackPricingExplanation(offer, pricing) {
  return `À ${pricing.heuresRestantes ?? "quelques"}h du créneau, je recommande ${pricing.prixRecommande}€ (soit ${pricing.remisePourcent}% de remise sur votre prix habituel) : c'est le prix qui maximise vos chances de vendre ces places avant qu'elles ne soient définitivement perdues.`;
}

/** Explique en langage naturel un prix déjà calculé par matchingEngineVoyage.js. */
export async function explainPricing(offer, pricing) {
  try {
    const prompt = buildPricingPrompt(offer, pricing);
    const aiText = await callLLM(
      [
        { role: "system", content: prompt },
        { role: "user", content: "Explique le prix." },
      ],
      180,
    );
    if (aiText && !isUnusableOutput(aiText)) return aiText.trim();
  } catch (e) {
    console.warn(
      "⚠️ [VOYAGE AI] Pricing explain FAILED:",
      e?.message?.slice(0, 100),
    );
  }
  return fallbackPricingExplanation(offer, pricing);
}

/* ════════════════════════════════════════════════════════════════════════
   PHASE RÉSULTATS — chat conseil, comparaison, mise en relation, marché
   ════════════════════════════════════════════════════════════════════════ */

export function detectResultsIntent(userMessage) {
  const msg = (userMessage || "").toLowerCase().trim();
  if (/réserv|book|prendre cette|je prends|mise en relation|contact/i.test(msg))
    return "reserve";
  if (
    /modif|chang|adjust|revoir|nouveau|différent|autre|élargir|réduire|budget|créneau|heure|date/i.test(
      msg,
    )
  )
    return "modify_criteria";
  if (/idée|inspir|propose|autre chose|surprends/i.test(msg)) return "ideas";
  if (/compar|meilleur|lequel|priorité|classer|rang|vs\b|versus/i.test(msg))
    return "compare";
  if (/détail|plus d'info|dis-moi|parle-moi|cette offre|ce créneau/i.test(msg))
    return "detail";
  return "general";
}

function buildResultsPrompt(role, sc, matches, userMessage, intent) {
  const isPrestataire = role === "prestataire";
  const top = (matches || []).slice(0, 5);

  const criteriaLines = [
    (sc.ville || sc.zone) && `Zone : ${sc.ville || sc.zone}`,
    (sc.activite || sc.categorie) &&
      `${isPrestataire ? "Activité proposée" : "Type recherché"} : ${sc.activite || sc.categorie}`,
    sc.date && `Date : ${sc.date}`,
    sc.heure != null && `Créneau : ${sc.heure}h`,
    !isPrestataire &&
      sc.budgetTotal != null &&
      `Budget total : ${sc.budgetTotal}€`,
    !isPrestataire &&
      sc.nombrePersonnes != null &&
      `Personnes : ${sc.nombrePersonnes}`,
  ].filter(Boolean);

  let intentInstruction = "";
  if (intent === "reserve") {
    intentInstruction = `INTENTION : RÉSERVATION. Demande QUELLE offre numérotée réserver/contacter. Le système gère la transaction automatiquement.`;
  } else if (intent === "modify_criteria") {
    intentInstruction = `INTENTION : MODIFICATION. Récapitule clairement les critères actuels puis demande ce qu'il veut ajuster (budget, créneau, zone...).`;
  } else if (intent === "ideas") {
    intentInstruction = `INTENTION : INSPIRATION. Propose 1 à 2 pistes nouvelles adaptées à sa zone et son budget, en t'appuyant sur les résultats réels si pertinents.`;
  } else if (intent === "compare") {
    intentInstruction = `INTENTION : COMPARAISON. Compare objectivement les offres (prix, créneau, compatibilité, places restantes) et recommande la meilleure avec justification chiffrée.`;
  } else {
    intentInstruction = `INTENTION : CONSEIL GÉNÉRAL. Réponds avec expertise en t'appuyant sur les données réelles fournies, jamais inventées.`;
  }

  return `Tu es l'agent IA de Mon AiGENT Voyage, expert en tourisme de dernière minute et en négociation tarifaire.

PROFIL :
${criteriaLines.map((l) => `  - ${l}`).join("\n") || "  (incomplet)"}

RÉSULTATS RÉELS DU MOTEUR (${top.length}) :
${JSON.stringify(top, null, 2)}

MESSAGE UTILISATEUR : "${userMessage}"

${intentInstruction}

RÈGLES : maximum 4 phrases sauf comparaison détaillée, jamais de répétition, toujours factuel et basé sur les données ci-dessus, jamais de prix ou de créneau inventé.

Réponds UNIQUEMENT avec ce JSON :
{ "message": "ta réponse", "intent": "${intent}" }`.trim();
}

export async function aiResultsChat(
  userMessage,
  existingCriteria = {},
  context = {},
) {
  const role = context.role || "voyageur";
  const matches = Array.isArray(context.matchingOffers)
    ? context.matchingOffers
    : [];
  const intent = detectResultsIntent(userMessage);

  const systemPrompt = buildResultsPrompt(
    role,
    existingCriteria,
    matches,
    userMessage,
    intent,
  );
  const aiText = await callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    900,
    { expectJson: true },
  );

  if (!aiText)
    return {
      message: "Je suis à votre disposition pour affiner cette recherche.",
      intent: "general",
    };

  const raw = extractJSON(aiText);
  if (!raw) return { message: aiText.trim(), intent };
  return {
    message: raw?.message?.trim() || "Je suis à votre disposition.",
    intent: raw?.intent || intent,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   MESSAGE DE MISE EN RELATION (réservation)
   ════════════════════════════════════════════════════════════════════════ */

export async function generateReservationMessage(
  senderRole,
  senderCriteria,
  targetOffer,
) {
  const isVoyageur = senderRole === "voyageur";
  const prompt = `Tu rédiges un message court (4-6 lignes), professionnel et chaleureux, de demande de réservation sur Mon AiGENT Voyage.

ÉMETTEUR : ${isVoyageur ? "Voyageur" : "Prestataire"}
CIBLE : ${targetOffer.activite || targetOffer.categorie || "expérience"} — ${targetOffer.ville || "N/A"} — ${targetOffer.date || ""} ${targetOffer.heure != null ? targetOffer.heure + "h" : ""} — prix ${targetOffer.prixRecommande ?? targetOffer.prixHabituel ?? "N/A"}€ — compatibilité ${targetOffer.compatibility ?? "N/A"}%

Consignes : commence par "Bonjour,", confirme l'intention de réserver, mentionne le créneau et le nombre de personnes si connu, invite à confirmer la disponibilité. Réponds UNIQUEMENT avec le texte du message.`;

  const aiText = await callLLM(
    [
      { role: "system", content: prompt },
      { role: "user", content: "Génère le message de réservation." },
    ],
    260,
  );

  if (!aiText || isUnusableOutput(aiText)) {
    return `Bonjour,\n\nJe souhaite réserver "${targetOffer.activite || "cette expérience"}" à ${targetOffer.ville || ""} le ${targetOffer.date || "créneau proposé"}${targetOffer.heure != null ? " à " + targetOffer.heure + "h" : ""}. Merci de me confirmer la disponibilité.\n\nCordialement.`;
  }
  return aiText.trim();
}
