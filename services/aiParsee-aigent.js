//======================================================================//
//  AI PARSEE — AiGENT MASTER (« Créez votre AiGENT »)
//----------------------------------------------------------------------//
//  Moteur IA du Builder. Aucune logique de matching ici : ce fichier
//  ne sert QU'À comprendre un besoin, le structurer, le challenger,
//  le visualiser, puis produire les artefacts de conception.
//
//  CASCADE DE PROVIDERS (ordre par défaut, surchargeable via
//  AIGENT_PROVIDER_ORDER="openrouter,groq,cerebras,github,cohere,mistral,nvidia,gemini")
//
//    1. OpenRouter  — découverte dynamique des modèles réellement :free
//    2. Groq        — découverte dynamique + tri (gpt-oss, qwen, llama…)
//    3. Cerebras    — fallback très rapide (gpt-oss-120b…)
//    4. GitHub Models (openai/gpt-4.1) — qualité rédactionnelle
//    5. Cohere      — découverte dynamique des modèles Chat actifs
//    6. Mistral     — mistral-small-latest
//    7. NVIDIA      — meta/llama-3.3-70b-instruct
//    8. Gemini      — @google/genai, liste de modèles dégressive
//
//  Chaque provider est : timeouté (AbortController), health-tracké
//  (cooldown après échec), filtré (anti-charabia / anti-CoT / anti-anglais).
//
//  ⚠️ SÉCURITÉ : aucune clé, aucun nom de provider, aucun prompt interne
//  ne doit fuir dans un projet généré. Ce module ne produit JAMAIS de
//  valeur secrète — uniquement des noms de variables d'environnement.
//======================================================================//

import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

/* ════════════════════════════════════════════════════════════════════
   0. CONSTANTES / CATALOGUES FERMÉS
   Le Builder ne peut composer QUE dans ces catalogues. C'est ce qui
   évite de « promettre » à l'utilisateur des capacités inexistantes.
   ════════════════════════════════════════════════════════════════════ */

export const TOOL_CATALOG = [
  {
    id: "knowledge.search",
    label: "Recherche dans les connaissances",
    category: "knowledge",
    description:
      "Retrouve la bonne information dans les documents fournis (menu, FAQ, tarifs, procédures).",
    service: null,
    env: [],
  },
  {
    id: "lead.capture",
    label: "Collecte de contact",
    category: "data",
    description: "Enregistre nom, email, téléphone et la demande du visiteur.",
    service: "database",
    env: ["DATABASE_URL"],
  },
  {
    id: "booking.request",
    label: "Demande de réservation",
    category: "action",
    description:
      "Enregistre une demande de réservation (date, heure, couverts) en attente de confirmation humaine.",
    service: "database",
    env: ["DATABASE_URL"],
  },
  {
    id: "booking.confirm",
    label: "Réservation confirmée automatiquement",
    category: "action",
    description:
      "Réserve réellement un créneau. Nécessite une source de disponibilités fiable.",
    service: "availability_source",
    env: ["BOOKING_API_URL", "BOOKING_API_KEY"],
    requiresHumanReview: true,
  },
  {
    id: "email.send",
    label: "Envoi d'email",
    category: "action",
    description: "Envoie une confirmation ou une notification par email.",
    service: "email",
    env: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"],
  },
  {
    id: "notify.webhook",
    label: "Notification webhook",
    category: "action",
    description:
      "Envoie l'événement vers un système externe (Slack, CRM, automatisation).",
    service: "webhook",
    env: ["WEBHOOK_URL"],
  },
  {
    id: "catalog.browse",
    label: "Parcours de catalogue",
    category: "data",
    description:
      "Liste et filtre des produits, plats, offres ou services depuis la base.",
    service: "database",
    env: ["DATABASE_URL"],
  },
  {
    id: "availability.check",
    label: "Vérification de disponibilité",
    category: "data",
    description:
      "Interroge un planning ou un stock avant de promettre quoi que ce soit.",
    service: "availability_source",
    env: ["BOOKING_API_URL", "BOOKING_API_KEY"],
  },
  {
    id: "handoff.human",
    label: "Transfert à un humain",
    category: "safety",
    description:
      "Escalade vers une personne réelle quand l'agent n'est pas sûr ou que l'enjeu est élevé.",
    service: null,
    env: [],
  },
  {
    id: "faq.answer",
    label: "Réponses FAQ",
    category: "knowledge",
    description:
      "Répond aux questions récurrentes à partir d'une FAQ structurée.",
    service: null,
    env: [],
  },
  {
    id: "form.submit",
    label: "Formulaire structuré",
    category: "data",
    description: "Collecte un ensemble de champs définis puis les enregistre.",
    service: "database",
    env: ["DATABASE_URL"],
  },
  {
    id: "search.web",
    label: "Recherche web",
    category: "knowledge",
    description: "Cherche une information publique à jour.",
    service: "search",
    env: ["SEARCH_API_KEY"],
  },
  {
    id: "payment.link",
    label: "Lien de paiement",
    category: "action",
    description:
      "Génère un lien de paiement. L'agent ne manipule jamais de carte bancaire.",
    service: "payment",
    env: ["PAYMENT_API_KEY"],
    requiresHumanReview: true,
  },
];

export const SERVICE_CATALOG = {
  ai_provider: {
    label: "Fournisseur IA",
    required: true,
    env: ["AI_API_KEY", "AI_MODEL", "AI_BASE_URL"],
    help: "Le cerveau de votre AiGENT. Vous branchez votre propre compte et vos propres clés.",
  },
  database: {
    label: "Base de données",
    env: ["DATABASE_URL"],
    help: "Stockage des conversations, demandes et contacts (PostgreSQL ou SQLite en local).",
  },
  email: {
    label: "Service email",
    env: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"],
    help: "Envoi des confirmations et notifications.",
  },
  availability_source: {
    label: "Source de disponibilités",
    env: ["BOOKING_API_URL", "BOOKING_API_KEY"],
    help: "Planning, logiciel de réservation ou API métier qui sait ce qui est réellement libre.",
  },
  webhook: {
    label: "Webhook sortant",
    env: ["WEBHOOK_URL"],
    help: "URL appelée à chaque événement.",
  },
  search: {
    label: "Recherche web",
    env: ["SEARCH_API_KEY"],
    help: "Fournisseur de recherche.",
  },
  payment: {
    label: "Paiement",
    env: ["PAYMENT_API_KEY"],
    help: "Prestataire de paiement.",
  },
  storage: {
    label: "Stockage fichiers",
    env: ["STORAGE_URL", "STORAGE_KEY"],
    help: "Images et documents.",
  },
};

export const KNOWLEDGE_TYPES = ["text", "faq", "file", "url", "table"];

export const INTERFACE_KINDS = [
  {
    id: "web",
    label: "AiGENT Web",
    description: "Une page complète, autonome, prête à héberger.",
  },
  {
    id: "widget",
    label: "Widget",
    description: "Une bulle intégrable sur un site existant.",
  },
  {
    id: "api",
    label: "API",
    description: "Un endpoint à brancher dans vos propres applications.",
  },
];

/** Styles proposés visuellement pendant la conception (tokens, pas d'images). */
export const STYLE_PRESETS = [
  {
    id: "monochrome",
    name: "Monochrome",
    mood: "Sobre, éditorial, intemporel",
    tokens: {
      bg: "#0A0A0A",
      surface: "#111111",
      border: "#242424",
      text: "#FAFAFA",
      muted: "#8A8A8A",
      accent: "#FFFFFF",
      accentText: "#0A0A0A",
      radius: "14px",
      font: "'Inter', system-ui, sans-serif",
    },
  },
  {
    id: "warm",
    name: "Chaleureux",
    mood: "Accueillant, humain, restauration & commerce de proximité",
    tokens: {
      bg: "#0B0A09",
      surface: "#141210",
      border: "#2A2521",
      text: "#FBF7F2",
      muted: "#9A8F84",
      accent: "#E8853B",
      accentText: "#150C05",
      radius: "18px",
      font: "'Inter', system-ui, sans-serif",
    },
  },
  {
    id: "clinical",
    name: "Précis",
    mood: "Technique, dense, orienté produit et données",
    tokens: {
      bg: "#08090B",
      surface: "#0F1114",
      border: "#1D2126",
      text: "#F2F5F8",
      muted: "#7C8794",
      accent: "#3D8BFD",
      accentText: "#03060B",
      radius: "10px",
      font: "'Inter', system-ui, sans-serif",
    },
  },
  {
    id: "calm",
    name: "Apaisé",
    mood: "Santé, bien-être, service public",
    tokens: {
      bg: "#070B0A",
      surface: "#0E1413",
      border: "#1C2624",
      text: "#F1F7F5",
      muted: "#7E9490",
      accent: "#3FB98C",
      accentText: "#04120D",
      radius: "16px",
      font: "'Inter', system-ui, sans-serif",
    },
  },

  {
    id: "vibrant",
    name: "Affirmé",
    mood: "Culture, événementiel, marques qui veulent marquer",
    tokens: {
      bg: "#0A0A0F",
      surface: "#121218",
      border: "#26262E",
      text: "#F8F8FB",
      muted: "#8B8B98",
      accent: "#7C5CFF",
      accentText: "#0A0A0F",
      radius: "12px",
      font: "'Inter', system-ui, sans-serif",
    },
  },
  {
    id: "editorial",
    name: "Éditorial",
    mood: "Contenu, presse, cabinets de conseil",
    tokens: {
      bg: "#0B0B09",
      surface: "#121210",
      border: "#28251F",
      text: "#F7F5EF",
      muted: "#9A9184",
      accent: "#C9A15A",
      accentText: "#0B0B09",
      radius: "6px",
      font: "'Inter', system-ui, sans-serif",
    },
  },
  {
    id: "midnight",
    name: "Nocturne",
    mood: "Finance, immobilier, services premium",
    tokens: {
      bg: "#070A12",
      surface: "#0D111C",
      border: "#1C2333",
      text: "#EEF1F8",
      muted: "#7C87A0",
      accent: "#4C7BFF",
      accentText: "#070A12",
      radius: "14px",
      font: "'Inter', system-ui, sans-serif",
    },
  },
  {
    id: "sand",
    name: "Naturel",
    mood: "Artisanat, agriculture, associations",
    tokens: {
      bg: "#0C0B09",
      surface: "#131110",
      border: "#2A2521",
      text: "#F6F1EA",
      muted: "#9C9187",
      accent: "#B57A4E",
      accentText: "#0C0B09",
      radius: "16px",
      font: "'Inter', system-ui, sans-serif",
    },
  },
];

export const PHASES = [
  "idea",
  "understanding",
  "exploration",
  "design",
  "validation",
  "build",
  "test",
  "export",
];

/* ════════════════════════════════════════════════════════════════════
   1. HELPERS TEXTE / JSON
   ════════════════════════════════════════════════════════════════════ */

function stripThinking(text) {
  if (!text) return text;
  let out = String(text);
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  out = out.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
  out = out
    .replace(/^\s*(analysis|reasoning)\s*:[\s\S]*?(?=\n\s*\n)/i, "")
    .trim();
  const finalMarkers =
    /(?:^|\n)\s*(?:final answer|réponse finale|réponse)\s*:\s*/i;
  const parts = out.split(finalMarkers);
  if (parts.length > 1) out = parts[parts.length - 1].trim();
  return out;
}

export function extractJSON(text) {
  if (!text) return null;
  const cleaned = stripThinking(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct === "object") return direct;
  } catch (_) {}
  // Objet
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch (_) {}
    // dernière chance : virgules traînantes
    try {
      return JSON.parse(obj[0].replace(/,\s*([}\]])/g, "$1"));
    } catch (_) {}
  }
  // Tableau
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) {
    try {
      return JSON.parse(arr[0]);
    } catch (_) {}
  }
  return null;
}

/** Rejette les sorties inexploitables (raisonnement brut, méta-commentaire,
 *  verdicts de classifieurs de modération, anglais, JSON non demandé…). */
function isUnusableOutput(text, { expectJson = false, maxChars = 900 } = {}) {
  if (!text || !text.trim()) return true;
  const t = text.toLowerCase();
  if (!expectJson && text.length > maxChars) return true;
  if (!expectJson && text.trim().split(/\s+/).length < 3) return true;
  const meta = [
    /\btu es un\b/,
    /\bta tâche\b/,
    /\bje dois générer\b/,
    /\bréponds uniquement\b/,
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
  if (meta.some((re) => re.test(t))) return true;
  if (!expectJson && /[{}]/.test(text)) return true;
  const englishTells = (
    t.match(
      /\b(the|here|where|every|this|should|would|i am|as an|okay|please note)\b/g,
    ) || []
  ).length;
  if (englishTells >= 3) return true;
  return false;
}

const LANG_GUARD = `IMPÉRATIF : réponds exclusivement en français, sobrement, sans emphase commerciale.
N'affiche JAMAIS ton raisonnement, aucune balise <think>, aucun méta-commentaire ("je vais", "ma tâche est"…).
Ne recopie jamais la consigne. Ne produis aucun mot en anglais hors noms techniques.
Ne renvoie du JSON QUE si un schéma JSON est explicitement demandé — sinon une réponse en texte brut, sans accolades ni guillemets encadrants.`;

const PRODUCT_GUARD = `CONTEXTE PRODUIT (à respecter absolument) :
- Tu es le copilote d'AiGENT, une plateforme qui conçoit puis génère de VRAIS projets logiciels.
- Tu ne livres jamais l'infrastructure d'AiGENT : l'utilisateur recevra SON code, à brancher sur SES services via des variables d'environnement.
- Tu ne promets jamais une capacité qui n'existe pas dans le catalogue d'outils fourni.
- Quand une action nécessite une source de données externe (disponibilités, stock, paiement), tu le DIS au lieu de faire semblant.
- Tu ne demandes jamais deux fois une information déjà connue.`;

/* ════════════════════════════════════════════════════════════════════
   2. PROVIDERS
   ════════════════════════════════════════════════════════════════════ */

const DEFAULT_TIMEOUT = Number(process.env.AIGENT_LLM_TIMEOUT_MS || 20000);

/** Santé des providers : un provider qui échoue est mis en cooldown
 *  pour ne pas ralentir toutes les requêtes suivantes. */
const health = new Map(); // name -> { failures, until }
function isDown(name) {
  const h = health.get(name);
  return !!(h && h.until > Date.now());
}
function markFail(name) {
  const h = health.get(name) || { failures: 0, until: 0 };
  h.failures += 1;
  h.until = Date.now() + Math.min(5 * 60_000, 15_000 * h.failures);
  health.set(name, h);
}
function markOk(name) {
  health.set(name, { failures: 0, until: 0 });
}

async function fetchJSON(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/* ─── 2.1 OpenRouter (découverte des modèles réellement gratuits) ─── */
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";
let orCache = null;
let orCacheAt = 0;
const OR_TTL = 15 * 60 * 1000;

function openRouterPriority(model, { allowReasoning }) {
  const id = model.id.toLowerCase();
  if (!allowReasoning && /(r1|qwq|thinking|reasoning|-o1|-o3)/.test(id))
    return -1;
  if (/(guard|moderation|vision-only|embedding)/.test(id)) return -1;
  if (id.includes("nemotron")) return 100;
  if (id.includes("deepseek")) return 92;
  if (id.includes("qwen")) return 88;
  if (id.includes("llama-3.3") || id.includes("llama3.3")) return 84;
  if (id.includes("llama")) return 78;
  if (id.includes("gemma")) return 70;
  if (id.includes("mistral")) return 64;
  if (id.includes("glm")) return 60;
  return 10;
}

async function getOpenRouterFreeModels(opts = {}) {
  if (orCache && Date.now() - orCacheAt < OR_TTL) return orCache;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];
  const { ok, data, status } = await fetchJSON(
    `${OPENROUTER_API_URL}/models?output_modalities=text`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
    12000,
  );
  if (!ok) throw new Error(data?.error?.message || `HTTP ${status}`);
  const models = (data?.data || [])
    .filter((m) => {
      const p = Number(m.pricing?.prompt ?? -1);
      const c = Number(m.pricing?.completion ?? -1);
      return (
        p === 0 &&
        c === 0 &&
        m.architecture?.output_modalities?.includes("text")
      );
    })
    .filter((m) => openRouterPriority(m, opts) >= 0)
    .sort((a, b) => openRouterPriority(b, opts) - openRouterPriority(a, opts))
    .slice(0, 6);
  orCache = models;
  orCacheAt = Date.now();
  return models;
}

async function callOpenRouter(messages, o) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  let models = [];
  try {
    models = await getOpenRouterFreeModels(o);
  } catch (e) {
    console.warn(
      "⚠️ [AiGENT AI] OpenRouter — liste indisponible:",
      e.message?.slice(0, 90),
    );
    return null;
  }
  if (!models.length) return null;

  for (const model of models.slice(0, o.maxModelTries || 3)) {
    try {
      const { ok, status, data } = await fetchJSON(
        `${OPENROUTER_API_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model.id,
            messages,
            max_tokens: o.maxTokens,
            temperature: o.temperature,
            ...(o.expectJson
              ? { response_format: { type: "json_object" } }
              : {}),
          }),
        },
        o.timeoutMs,
      );
      if (!ok) {
        console.warn(`⚠️ [AiGENT AI] OpenRouter ${model.id}: HTTP ${status}`);
        continue;
      }
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      if (text && !isUnusableOutput(text, o)) {
        console.log(`✅ [AiGENT AI] OpenRouter OK (${model.id})`);
        return text;
      }
    } catch (e) {
      console.warn(
        `⚠️ [AiGENT AI] OpenRouter ${model.id} FAILED:`,
        e.message?.slice(0, 80),
      );
    }
  }
  return null;
}

/* ─── 2.2 Groq (découverte dynamique) ─── */
const GROQ_API_URL = "https://api.groq.com/openai/v1";
let groqCache = null;
let groqCacheAt = 0;
const GROQ_TTL = 10 * 60 * 1000;

function groqPriority(model) {
  const id = model.id.toLowerCase();
  if (/(whisper|guard|tts|speech|audio)/.test(id)) return -1;
  if (id.includes("gpt-oss-120b")) return 100;
  if (id.includes("gpt-oss-20b")) return 90;
  if (id.includes("qwen")) return 80;
  if (id.includes("llama-3.3")) return 76;
  if (id.includes("llama")) return 70;
  if (id.includes("compound")) return 60;
  return 10;
}

async function getGroqModels() {
  if (groqCache && Date.now() - groqCacheAt < GROQ_TTL) return groqCache;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return [];
  const { ok, data, status } = await fetchJSON(
    `${GROQ_API_URL}/models`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
    10000,
  );
  if (!ok) throw new Error(`HTTP ${status}`);
  const models = (data?.data || [])
    .filter((m) => groqPriority(m) >= 0)
    .sort((a, b) => groqPriority(b) - groqPriority(a))
    .slice(0, 5);
  groqCache = models;
  groqCacheAt = Date.now();
  return models;
}

async function callGroq(messages, o) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  let models = [];
  try {
    models = await getGroqModels();
  } catch (e) {
    console.warn(
      "⚠️ [AiGENT AI] Groq — liste indisponible:",
      e.message?.slice(0, 80),
    );
    return null;
  }
  for (const model of models.slice(0, o.maxModelTries || 3)) {
    try {
      const { ok, status, data } = await fetchJSON(
        `${GROQ_API_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model.id,
            messages,
            max_tokens: o.maxTokens,
            temperature: o.temperature,
            ...(model.id.includes("gpt-oss")
              ? { reasoning_effort: "low" }
              : {}),
            ...(o.expectJson
              ? { response_format: { type: "json_object" } }
              : {}),
          }),
        },
        o.timeoutMs,
      );
      if (!ok) {
        console.warn(
          `⚠️ [AiGENT AI] Groq ${model.id}: HTTP ${status} ${data?.error?.message || ""}`,
        );
        continue;
      }
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      if (text && !isUnusableOutput(text, o)) {
        console.log(`✅ [AiGENT AI] Groq OK (${model.id})`);
        return text;
      }
    } catch (e) {
      console.warn(
        `⚠️ [AiGENT AI] Groq ${model.id} FAILED:`,
        e.message?.slice(0, 80),
      );
    }
  }
  return null;
}

/* ─── 2.3 Cerebras ─── */
// APRÈS — plus de liste figée : on interroge /v1/models, on teste TOUT
// (en parallèle, résultat mis en cache 20 min via pingModel), et seuls les
// modèles qui répondent réellement sont essayés pour de vrai.
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1";
let cerebrasCache = null;
let cerebrasCacheAt = 0;
const CEREBRAS_TTL = 15 * 60 * 1000;

function cerebrasPriority(id) {
  const s = id.toLowerCase();
  if (/(whisper|embed|guard|moderation|vision|tts)/.test(s)) return -1;
  if (/(235b|120b|180b)/.test(s)) return 100;
  if (/(70b|72b)/.test(s)) return 85;
  if (/(32b|34b)/.test(s)) return 70;
  if (/(8b|9b)/.test(s)) return 50;
  return 30;
}

async function getCerebrasModelIds() {
  if (cerebrasCache && Date.now() - cerebrasCacheAt < CEREBRAS_TTL)
    return cerebrasCache;
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) return [];
  const { ok, data, status } = await fetchJSON(
    `${CEREBRAS_API_URL}/models`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
    10000,
  );
  if (!ok) throw new Error(`HTTP ${status}`);
  const ids = [...new Set((data?.data || []).map((m) => m.id).filter(Boolean))]
    .filter((id) => cerebrasPriority(id) >= 0)
    .sort((a, b) => cerebrasPriority(b) - cerebrasPriority(a));
  cerebrasCache = ids;
  cerebrasCacheAt = Date.now();
  return ids;
}

async function callCerebras(messages, o) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) return null;
  let candidates = [];
  try {
    candidates = await getCerebrasModelIds();
  } catch (e) {
    console.warn(
      "⚠️ [AiGENT AI] Cerebras — liste indisponible:",
      e.message?.slice(0, 90),
    );
    return null;
  }
  if (!candidates.length) return null;

  const call = (model, msgs, opts) =>
    fetchJSON(
      `${CEREBRAS_API_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: msgs,
          max_completion_tokens: opts.maxTokens,
          temperature: opts.temperature,
        }),
      },
      opts.timeoutMs,
    ).then((r) => {
      if (!r.ok)
        throw Object.assign(new Error(`HTTP ${r.status}`), {
          status: r.status,
        });
      return r.data?.choices?.[0]?.message?.content?.trim() || "";
    });

  const healthy = (
    await Promise.all(
      candidates.slice(0, 15).map(async (model) => {
        const ok = await pingModel(`cerebras:${model}`, (msgs, opts) =>
          call(model, msgs, opts),
        );
        return ok ? model : null;
      }),
    )
  ).filter(Boolean);

  for (const model of healthy.slice(0, o.maxModelTries || 3)) {
    try {
      const text = await withRetry(() => call(model, messages, o));
      if (text && !isUnusableOutput(text, o)) {
        console.log(`✅ [AiGENT AI] Cerebras OK (${model})`);
        return text;
      }
    } catch (e) {
      MODEL_HEALTH.set(`cerebras:${model}`, {
        ok: false,
        checkedAt: Date.now(),
      });
      console.warn(
        `⚠️ [AiGENT AI] Cerebras ${model} FAILED:`,
        e.message?.slice(0, 80),
      );
    }
  }
  return null;
}
/* ─── 2.4 GitHub Models ─── */
async function callGithubModels(messages, o) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  try {
    const { ok, status, data } = await fetchJSON(
      "https://models.github.ai/inference/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GITHUB_MODEL || "openai/gpt-4.1",
          messages,
          max_tokens: o.maxTokens,
          temperature: o.temperature,
        }),
      },
      o.timeoutMs,
    );
    if (!ok) {
      console.warn(`⚠️ [AiGENT AI] GitHub Models: HTTP ${status}`);
      return null;
    }
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    if (text && !isUnusableOutput(text, o)) {
      console.log("✅ [AiGENT AI] GitHub Models OK");
      return text;
    }
  } catch (e) {
    console.warn(
      "⚠️ [AiGENT AI] GitHub Models FAILED:",
      e.message?.slice(0, 80),
    );
  }
  return null;
}

/* ─── 2.5 Cohere (découverte dynamique) ─── */
const COHERE_API_URL = "https://api.cohere.com";
let cohereCache = null;
let cohereCacheAt = 0;
const COHERE_TTL = 30 * 60 * 1000;

async function getCohereModels() {
  if (cohereCache && Date.now() - cohereCacheAt < COHERE_TTL)
    return cohereCache;
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return [];
  const models = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ endpoint: "chat", page_size: "100" });
    if (pageToken) params.set("page_token", pageToken);
    const { ok, data, status } = await fetchJSON(
      `${COHERE_API_URL}/v1/models?${params}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
      10000,
    );
    if (!ok) throw new Error(data?.message || `HTTP ${status}`);
    models.push(...(data?.models || []));
    pageToken = data?.next_page_token || null;
  } while (pageToken);
  const filtered = models.filter(
    (m) => !m.is_deprecated && m.endpoints?.includes("chat"),
  );
  cohereCache = filtered;
  cohereCacheAt = Date.now();
  return filtered;
}

async function callCohere(messages, o) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return null;
  let models = [];
  try {
    models = await getCohereModels();
  } catch (e) {
    console.warn(
      "⚠️ [AiGENT AI] Cohere — liste indisponible:",
      e.message?.slice(0, 80),
    );
    return null;
  }
  for (const model of models.slice(0, o.maxModelTries || 2)) {
    try {
      const { ok, status, data } = await fetchJSON(
        `${COHERE_API_URL}/v2/chat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model.name,
            messages,
            max_tokens: o.maxTokens,
            temperature: o.temperature,
          }),
        },
        o.timeoutMs,
      );
      if (!ok) {
        console.warn(`⚠️ [AiGENT AI] Cohere ${model.name}: HTTP ${status}`);
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
      if (text && !isUnusableOutput(text, o)) {
        console.log(`✅ [AiGENT AI] Cohere OK (${model.name})`);
        return text;
      }
    } catch (e) {
      console.warn(
        `⚠️ [AiGENT AI] Cohere ${model.name} FAILED:`,
        e.message?.slice(0, 80),
      );
    }
  }
  return null;
}

/* ─── 2.6 Mistral ─── */
// APRÈS — liste de modèles gratuits/économiques candidats (du plus capable
// au plus rapide), chacun ping-testé avant usage réel. Un 402 (quota/payant)
// ou 429 (rate-limit persistant) invalide immédiatement le cache : on ne
// perd plus de temps dessus aux appels suivants pendant la fenêtre TTL.
const MISTRAL_MODELS = [
  process.env.MISTRAL_MODEL,
  "mistral-small-latest",
  "open-mistral-nemo",
  "ministral-8b-latest",
  "ministral-3b-latest",
].filter(Boolean);

// APRÈS
const MISTRAL_API_URL = "https://api.mistral.ai/v1";
let mistralCache = null;
let mistralCacheAt = 0;
const MISTRAL_TTL = 15 * 60 * 1000;

function mistralPriority(id) {
  const s = id.toLowerCase();
  if (/(embed|moderation|ocr|guard)/.test(s)) return -1;
  if (s.includes("open-mixtral-8x22b")) return 100;
  if (s.includes("open-mixtral")) return 85;
  if (s.includes("open-mistral-nemo")) return 80;
  if (s.includes("ministral-8b")) return 60;
  if (s.includes("mistral-small")) return 55;
  if (s.includes("ministral-3b")) return 40;
  return 20;
}

async function getMistralModelIds() {
  if (mistralCache && Date.now() - mistralCacheAt < MISTRAL_TTL)
    return mistralCache;
  const apiKey = process.env.MISTRAL || process.env.MISTRAL_API_KEY;
  if (!apiKey) return [];
  const { ok, data, status } = await fetchJSON(
    `${MISTRAL_API_URL}/models`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
    10000,
  );
  if (!ok) throw new Error(`HTTP ${status}`);
  const ids = [...new Set((data?.data || []).map((m) => m.id).filter(Boolean))]
    .filter((id) => mistralPriority(id) >= 0)
    .sort((a, b) => mistralPriority(b) - mistralPriority(a));
  mistralCache = ids;
  mistralCacheAt = Date.now();
  return ids;
}

async function callMistral(messages, o) {
  const apiKey = process.env.MISTRAL || process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;
  let candidates = [];
  try {
    candidates = await getMistralModelIds();
  } catch (e) {
    console.warn(
      "⚠️ [AiGENT AI] Mistral — liste indisponible:",
      e.message?.slice(0, 90),
    );
    return null;
  }
  if (!candidates.length) return null;

  const call = (model, msgs, opts) =>
    fetchJSON(
      `${MISTRAL_API_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: msgs,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          ...(opts.expectJson
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
      },
      opts.timeoutMs,
    ).then((r) => {
      if (!r.ok)
        throw Object.assign(new Error(`HTTP ${r.status}`), {
          status: r.status,
        });
      return r.data?.choices?.[0]?.message?.content?.trim() || "";
    });

  const healthy = (
    await Promise.all(
      candidates.slice(0, 15).map(async (model) => {
        const ok = await pingModel(`mistral:${model}`, (msgs, opts) =>
          call(model, msgs, opts),
        );
        return ok ? model : null;
      }),
    )
  ).filter(Boolean);

  for (const model of healthy.slice(0, o.maxModelTries || 3)) {
    try {
      const text = await withRetry(() => call(model, messages, o));
      if (text && !isUnusableOutput(text, o)) {
        console.log(`✅ [AiGENT AI] Mistral OK (${model})`);
        return text;
      }
    } catch (e) {
      MODEL_HEALTH.set(`mistral:${model}`, {
        ok: false,
        checkedAt: Date.now(),
      });
      console.warn(
        `⚠️ [AiGENT AI] Mistral ${model} FAILED:`,
        e.message?.slice(0, 80),
      );
    }
  }
  return null;
}

/* ─── 2.7 NVIDIA ─── */
// APRÈS — même filet de sécurité : liste de modèles candidats du catalogue
// NIM gratuit (build.nvidia.com), ping avant usage réel. Le 410 que tu
// observais (endpoint/modèle retiré) invalide le cache dès le premier échec
// au lieu d'être retenté indéfiniment à chaque requête utilisateur.
const NVIDIA_MODELS = [
  process.env.NVIDIA_MODEL,
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-70b-instruct",
  "nvidia/nemotron-4-340b-instruct",
  "mistralai/mixtral-8x22b-instruct-v0.1",
].filter(Boolean);

// APRÈS
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1";
let nvidiaCache = null;
let nvidiaCacheAt = 0;
const NVIDIA_TTL = 15 * 60 * 1000;

function nvidiaPriority(id) {
  const s = id.toLowerCase();
  if (/(embed|rerank|guard|moderation|vision|tts|asr)/.test(s)) return -1;
  if (/(405b|340b)/.test(s)) return 100;
  if (/(70b|72b)/.test(s)) return 85;
  if (/(mixtral|8x22b)/.test(s)) return 75;
  if (/(34b|32b)/.test(s)) return 60;
  if (/(8b|9b)/.test(s)) return 40;
  return 20;
}

async function getNvidiaModelIds() {
  if (nvidiaCache && Date.now() - nvidiaCacheAt < NVIDIA_TTL)
    return nvidiaCache;
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return [];
  const { ok, data, status } = await fetchJSON(
    `${NVIDIA_API_URL}/models`,
    { headers: { Authorization: `Bearer ${key}` } },
    10000,
  );
  if (!ok) throw new Error(`HTTP ${status}`);
  const ids = [...new Set((data?.data || []).map((m) => m.id).filter(Boolean))]
    .filter((id) => nvidiaPriority(id) >= 0)
    .sort((a, b) => nvidiaPriority(b) - nvidiaPriority(a));
  nvidiaCache = ids;
  nvidiaCacheAt = Date.now();
  return ids;
}

async function callNvidia(messages, o) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  let candidates = [];
  try {
    candidates = await getNvidiaModelIds();
  } catch (e) {
    console.warn(
      "⚠️ [AiGENT AI] NVIDIA — liste indisponible:",
      e.message?.slice(0, 90),
    );
    return null;
  }
  if (!candidates.length) return null;

  const call = (model, msgs, opts) =>
    fetchJSON(
      `${NVIDIA_API_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: msgs,
          max_tokens: opts.maxTokens,
          temperature: opts.temperature,
          stream: false,
        }),
      },
      opts.timeoutMs,
    ).then((r) => {
      if (!r.ok)
        throw Object.assign(new Error(`HTTP ${r.status}`), {
          status: r.status,
        });
      return r.data?.choices?.[0]?.message?.content?.trim() || "";
    });

  const healthy = (
    await Promise.all(
      candidates.slice(0, 15).map(async (model) => {
        const ok = await pingModel(`nvidia:${model}`, (msgs, opts) =>
          call(model, msgs, opts),
        );
        return ok ? model : null;
      }),
    )
  ).filter(Boolean);

  for (const model of healthy.slice(0, o.maxModelTries || 3)) {
    try {
      const text = await withRetry(() => call(model, messages, o));
      if (text && !isUnusableOutput(text, o)) {
        console.log(`✅ [AiGENT AI] NVIDIA OK (${model})`);
        return text;
      }
    } catch (e) {
      MODEL_HEALTH.set(`nvidia:${model}`, { ok: false, checkedAt: Date.now() });
      console.warn(
        `⚠️ [AiGENT AI] NVIDIA ${model} FAILED:`,
        e.message?.slice(0, 80),
      );
    }
  }
  return null;
}
/* ─── 2.8 Gemini ─── */
const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-2.5-flash",
];

async function callGemini(messages, o) {
  if (!geminiClient) return null;
  const contents = messages
    .map((m) =>
      m.role === "system" ? `[Instructions système]\n${m.content}` : m.content,
    )
    .join("\n\n");
  for (const model of GEMINI_MODELS.slice(0, o.maxModelTries || 3)) {
    try {
      const response = await geminiClient.models.generateContent({
        model,
        contents,
        config: { maxOutputTokens: o.maxTokens, temperature: o.temperature },
      });
      const text = response?.text?.trim() || "";
      if (text && !isUnusableOutput(text, o)) {
        console.log(`✅ [AiGENT AI] Gemini OK (${model})`);
        return text;
      }
    } catch (e) {
      console.warn(
        `⚠️ [AiGENT AI] Gemini ${model} FAILED:`,
        e.message?.slice(0, 80),
      );
    }
  }
  return null;
}

// AJOUT dans aiParsee-aigent.js — nouveau provider, même schéma que les autres

/* ─── 2.9 Cloudflare Workers AI ─── */
// Liste issue de ton test réel (script fourni) : uniquement les modèles qui
// ont renvoyé une réponse EXPLOITABLE (pas juste "OK" mais du texte cohérent
// et complet), triés du plus capable au plus rapide pour le rôle "code".
const CLOUDFLARE_MODELS = [
  "@cf/openai/gpt-oss-120b",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/qwen/qwen2.5-coder-32b-instruct",
  "@cf/openai/gpt-oss-20b",
];

async function callCloudflare(messages, o) {
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiKey || !accountId) return null;
  const prompt = messages
    .map(
      (m) =>
        `${m.role === "system" ? "[Instructions]" : m.role === "assistant" ? "[Assistant]" : "[Utilisateur]"} ${m.content}`,
    )
    .join("\n\n");

  for (const model of CLOUDFLARE_MODELS.slice(0, o.maxModelTries || 2)) {
    const healthKey = `cloudflare:${model}`;
    const call = (msgsPrompt, opts) =>
      fetchJSON(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: msgsPrompt,
            max_tokens: opts.maxTokens,
          }),
        },
        opts.timeoutMs,
      ).then((r) => {
        if (!r.ok || r.data?.success === false)
          throw Object.assign(new Error(`HTTP ${r.status}`), {
            status: r.status,
          });
        const out =
          r.data?.result?.response ?? r.data?.result?.choices?.[0]?.text ?? "";
        return typeof out === "string" ? out.trim() : "";
      });

    const healthy = await pingModel(healthKey, () =>
      call(PING_PROMPT.map((m) => m.content).join("\n"), {
        maxTokens: 10,
        timeoutMs: 8000,
      }),
    );
    if (!healthy) continue;

    try {
      const text = await withRetry(() => call(prompt, o));
      if (text && !isUnusableOutput(text, o)) {
        console.log(`✅ [AiGENT AI] Cloudflare OK (${model})`);
        return text;
      }
    } catch (e) {
      MODEL_HEALTH.set(healthKey, { ok: false, checkedAt: Date.now() });
      console.warn(
        `⚠️ [AiGENT AI] Cloudflare ${model} FAILED:`,
        e.message?.slice(0, 80),
      );
    }
  }
  return null;
}

// AJOUT dans aiParsee-aigent.js

/** Interroge plusieurs providers EN PARALLÈLE sur la même tâche et garde
 *  la meilleure réponse JSON valide (le plus de champs correctement remplis).
 *  Réservé aux tâches où la qualité prime sur la vitesse. */
export async function callLLMConsensus(
  messages,
  opts = {},
  providerNames = ["openrouter", "groq", "cloudflare"],
) {
  const attempts = providerNames.map((name) =>
    callLLM(messages, { ...opts, order: [name] }).catch(() => null),
  );
  const results = (await Promise.all(attempts)).filter(Boolean);
  if (!results.length) return null;
  if (!opts.expectJson) return results.sort((a, b) => b.length - a.length)[0];
  const parsed = results.map((r) => extractJSON(r)).filter(Boolean);
  if (!parsed.length) return results[0];
  return parsed.sort(
    (a, b) => JSON.stringify(b).length - JSON.stringify(a).length,
  )[0];
}

/** Génération de source pour les builds : les limites de sortie texte/JSON
 *  classiques ne doivent jamais tronquer ou rejeter un fichier de code.
 *  Le rôle choisit un ordre dédié de fournisseurs, puis la cascade normale
 *  assure le repli si un modèle est absent ou indisponible. */
const CODE_PROVIDER_ORDERS = {
  architect: ["github", "gemini", "cloudflare", "groq", "openrouter", "cerebras", "mistral", "nvidia", "cohere"],
  design: ["gemini", "github", "cloudflare", "groq", "openrouter", "cerebras", "mistral", "nvidia", "cohere"],
  frontend: ["cloudflare", "groq", "github", "gemini", "openrouter", "cerebras", "mistral", "nvidia", "cohere"],
  backend: ["github", "cloudflare", "groq", "cerebras", "gemini", "openrouter", "mistral", "nvidia", "cohere"],
  qa: ["gemini", "github", "cloudflare", "groq", "openrouter", "cerebras", "mistral", "nvidia", "cohere"],
};

export async function callCode(messages, opts = {}) {
  const role = CODE_PROVIDER_ORDERS[opts.role] ? opts.role : "frontend";
  const envOrder = process.env[`AIGENT_${role.toUpperCase()}_PROVIDER_ORDER`];
  const order = envOrder
    ? envOrder.split(",").map((name) => name.trim()).filter(Boolean)
    : CODE_PROVIDER_ORDERS[role];
  const raw = await callLLM(messages, {
    profile: "code",
    expectJson: true, // accepte accolades, code long et syntaxe anglaise
    maxTokens: Math.min(12000, Math.max(1200, Number(opts.maxTokens) || 7000)),
    temperature: 0.2,
    timeoutMs: Math.min(120000, Math.max(30000, Number(opts.timeoutMs) || 90000)),
    maxModelTries: 1,
    order,
  });
  if (!raw || !String(raw).trim()) return null;
  let source = String(raw).trim();
  const fence = source.match(/^```(?:javascript|js|css|html|sql)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  if (fence) source = fence[1].trim();
  return source || null;
}

/* ─── 2.9 Cascade ─── */
// APRÈS — Cloudflare placé après Groq/OpenRouter (rapides, fiables) et
// avant les providers à problèmes, puisque tes tests le montrent stable.
const PROVIDERS = {
  openrouter: callOpenRouter,
  groq: callGroq,
  cloudflare: callCloudflare,
  cerebras: callCerebras,
  github: callGithubModels,
  cohere: callCohere,
  mistral: callMistral,
  nvidia: callNvidia,
  gemini: callGemini,
};

const DEFAULT_ORDER = (
  process.env.AIGENT_PROVIDER_ORDER ||
  "openrouter,groq,cloudflare,github,cohere,gemini,cerebras,mistral,nvidia"
)
  .split(",")
  .map((s) => s.trim())
  .filter((s) => PROVIDERS[s]);

/**
 * Appel LLM avec cascade complète.
 * @param {Array} messages  messages OpenAI-like
 * @param {Object} opts     { maxTokens, temperature, expectJson, timeoutMs,
 *                            allowReasoning, order, profile, maxModelTries }
 */
export async function callLLM(messages, opts = {}) {
  const profiles = {
    fast: {
      maxTokens: 220,
      temperature: 0.4,
      timeoutMs: 12000,
      maxModelTries: 2,
    },
    chat: {
      maxTokens: 600,
      temperature: 0.55,
      timeoutMs: 20000,
      maxModelTries: 3,
    },
    json: {
      maxTokens: 900,
      temperature: 0.15,
      expectJson: true,
      timeoutMs: 25000,
      maxModelTries: 3,
    },
    deep: {
      maxTokens: 2200,
      temperature: 0.3,
      expectJson: true,
      timeoutMs: 40000,
      maxModelTries: 4,
      allowReasoning: true,
    },
    code: {
      maxTokens: 7000,
      temperature: 0.2,
      expectJson: true,
      timeoutMs: 90000,
      maxModelTries: 1,
      allowReasoning: false,
    },
  };
  const base = profiles[opts.profile || "chat"] || profiles.chat;
  const o = {
    maxTokens: 600,
    temperature: 0.4,
    expectJson: false,
    timeoutMs: DEFAULT_TIMEOUT,
    allowReasoning: false,
    maxModelTries: 3,
    ...base,
    ...opts,
  };

  const order = (opts.order || DEFAULT_ORDER).filter((n) => PROVIDERS[n]);
  const live = order.filter((n) => !isDown(n));
  const chain = live.length ? live : order; // si tout est en cooldown, on retente quand même

  for (const name of chain) {
    try {
      const out = await PROVIDERS[name](messages, o);
      if (out) {
        markOk(name);
        return stripThinking(out);
      }
      markFail(name);
    } catch (e) {
      markFail(name);
      console.warn(
        `⚠️ [AiGENT AI] ${name} exception:`,
        e.message?.slice(0, 80),
      );
    }
  }
  console.error(
    "❌ [AiGENT AI] Tous les providers ont échoué:",
    chain.join(", "),
  );
  return null;
}

/** Appel JSON avec re-tentative « réparation » si le modèle bavarde. */
async function callJSON(systemPrompt, userPrompt, opts = {}) {
  const raw = await callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { profile: "json", ...opts },
  );
  if (!raw) return null;
  const parsed = extractJSON(raw);
  if (parsed) return parsed;

  const repaired = await callLLM(
    [
      {
        role: "system",
        content:
          "Tu convertis un texte en JSON strict. Réponds uniquement avec le JSON, sans texte autour.",
      },
      {
        role: "user",
        content: `Convertis ceci en JSON valide correspondant au schéma demandé :\n\n${raw.slice(0, 4000)}`,
      },
    ],
    { profile: "json", maxTokens: 900 },
  );
  return repaired ? extractJSON(repaired) : null;
}

/** Diagnostic providers — utilisé par /api/aigent/health. */
export async function probeProviders() {
  const results = {};
  const configured = {
    openrouter: !!process.env.OPENROUTER_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    cerebras: !!process.env.CEREBRAS_API_KEY,
    github: !!process.env.GITHUB_TOKEN,
    cohere: !!process.env.COHERE_API_KEY,
    mistral: !!(process.env.MISTRAL || process.env.MISTRAL_API_KEY),
    nvidia: !!process.env.NVIDIA_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  };
  for (const name of DEFAULT_ORDER) {
    const h = health.get(name);
    results[name] = {
      configured: !!configured[name],
      cooldownUntil:
        h?.until && h.until > Date.now()
          ? new Date(h.until).toISOString()
          : null,
      failures: h?.failures || 0,
    };
  }
  return { order: DEFAULT_ORDER, providers: results };
}

// AJOUT dans aiParsee-aigent.js — juste après la section "2. PROVIDERS"

/* ─── Health-checker actif : ne fait confiance qu'à un modèle testé ─── */
const MODEL_HEALTH = new Map(); // "provider:model" -> { ok, checkedAt }
const HEALTH_TTL = 20 * 60 * 1000;
const PING_PROMPT = [{ role: "user", content: "Réponds uniquement: ok" }];

/** Erreurs qui justifient un nouvel essai (transitoires) vs erreurs
 *  définitives (mauvaise clé, modèle payant, modèle retiré...). */
function isTransient(status) {
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 522 ||
    status === 524
  );
}

async function withRetry(fn, { retries = 2, baseDelay = 400 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransient(e.status) || i === retries) break;
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

/** Ping réel d'un modèle avant de le proposer à la cascade. Résultat mis
 *  en cache : on ne re-teste pas à chaque requête utilisateur. */
async function pingModel(key, callFn) {
  const cached = MODEL_HEALTH.get(key);
  if (cached && Date.now() - cached.checkedAt < HEALTH_TTL) return cached.ok;
  let ok = false;
  try {
    const out = await withRetry(
      () =>
        callFn(PING_PROMPT, {
          maxTokens: 10,
          temperature: 0,
          timeoutMs: 8000,
          expectJson: false,
        }),
      { retries: 1 },
    );
    ok = !!out && out.trim().length > 0;
  } catch (_) {
    ok = false;
  }
  MODEL_HEALTH.set(key, { ok, checkedAt: Date.now() });
  return ok;
}

/* ════════════════════════════════════════════════════════════════════
   3. ÉTAT DU PROJET (AgentSpec) — source de vérité du Builder
   ════════════════════════════════════════════════════════════════════ */

export function emptySpec() {
  return {
    schemaVersion: 1,
    name: null,
    slug: null,
    tagline: null,
    purpose: null,
    audience: null,
    sector: null,
    language: "fr",
    tone: [],
    persona: null,
    missions: [], // [{id,label,enabled,note}]
    knowledge: [], // [{id,type,label,ref,status}]
    tools: [], // [{id,config,status,service}]
    workflows: [], // [{id,name,trigger,steps:[]}]
    permissions: {
      allowedTools: [],
      dataCollection: [],
      escalation: "handoff.human",
      autonomy: "assist", // assist | act_with_confirmation | autonomous
    },
    interface: {
      kind: "web",
      styleId: "monochrome",
      theme: null,
      greeting: null,
      suggestions: [],
    },
    integrations: [], // [{service, required, env:[], status, reason}]
    deployment: { target: "export", runtime: "node" },
    export: { formats: ["zip", "json"] },
    openQuestions: [], // [{id, question, why, options[]}]
    assumptions: [],
    notes: [],
  };
}

const ARRAY_KEYED = {
  missions: "id",
  knowledge: "id",
  tools: "id",
  workflows: "id",
  integrations: "service",
  openQuestions: "id",
};

function slugify(str) {
  return (
    String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "mon-aigent"
  );
}
export { slugify };

/** Applique un patch sûr : jamais d'écrasement destructif implicite,
 *  fusion des tableaux par clé, suppression explicite via {_remove:true}. */
export function applyPatch(spec, patch) {
  const next = JSON.parse(JSON.stringify(spec || emptySpec()));
  if (!patch || typeof patch !== "object") return next;

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    if (ARRAY_KEYED[key]) {
      const idKey = ARRAY_KEYED[key];
      const current = Array.isArray(next[key]) ? next[key] : [];
      const incoming = Array.isArray(value) ? value : [value];
      const map = new Map(current.map((it) => [it?.[idKey], it]));
      for (const item of incoming) {
        if (!item || typeof item !== "object") continue;
        const id =
          item[idKey] ||
          slugify(item.label || item.name || item.question || "");
        if (!id) continue;
        if (item._remove) {
          map.delete(id);
          continue;
        }
        map.set(id, { ...(map.get(id) || {}), ...item, [idKey]: id });
      }
      next[key] = [...map.values()];
      continue;
    }

    if (["permissions", "interface", "deployment", "export"].includes(key)) {
      next[key] = { ...(next[key] || {}), ...(value || {}) };
      continue;
    }

    if (["tone", "assumptions", "notes"].includes(key)) {
      const arr = Array.isArray(value) ? value : [value];
      next[key] = [
        ...new Set([...(next[key] || []), ...arr.filter(Boolean)]),
      ].slice(0, 12);
      continue;
    }

    if (value === null) continue; // null = « je ne sais pas », on ne casse rien
    next[key] = value;
  }

  if (next.name && !next.slug) next.slug = slugify(next.name);
  return next;
}

/* ════════════════════════════════════════════════════════════════════
   4. COHÉRENCE / FAISABILITÉ (déterministe, avant toute IA)
   ════════════════════════════════════════════════════════════════════ */

export function computeIntegrations(spec) {
  const map = new Map();
  map.set("ai_provider", {
    service: "ai_provider",
    label: SERVICE_CATALOG.ai_provider.label,
    required: true,
    env: SERVICE_CATALOG.ai_provider.env,
    status: "to_connect",
    reason: "Votre AiGENT a besoin de son propre fournisseur IA.",
  });

  for (const t of spec.tools || []) {
    const def = TOOL_CATALOG.find((c) => c.id === t.id);
    if (!def?.service) continue;
    const svc = SERVICE_CATALOG[def.service];
    if (!svc) continue;
    map.set(def.service, {
      service: def.service,
      label: svc.label,
      required: true,
      env: svc.env,
      status: "to_connect",
      reason: `Requis par « ${def.label} ».`,
    });
  }

  if (
    (spec.knowledge || []).some((k) =>
      ["file", "table", "url"].includes(k.type),
    )
  ) {
    const svc = SERVICE_CATALOG.database;
    if (!map.has("database"))
      map.set("database", {
        service: "database",
        label: svc.label,
        required: true,
        env: svc.env,
        status: "to_connect",
        reason: "Stockage des connaissances structurées.",
      });
  }
  return [...map.values()];
}

/** Détecte les incohérences « produit » : promesses impossibles, données
 *  manquantes, risques. C'est le cœur de l'intelligence perçue. */
export function checkCoherence(spec) {
  const issues = [];
  const push = (severity, code, message, question) =>
    issues.push({ severity, code, message, question: question || null });

  if (!spec.purpose)
    push(
      "blocking",
      "no_purpose",
      "L'objectif de l'AiGENT n'est pas encore défini.",
    );
  if (!spec.audience)
    push(
      "warning",
      "no_audience",
      "On ne sait pas encore à qui cet AiGENT s'adresse.",
    );

  const toolIds = (spec.tools || []).map((t) => t.id);

  if (
    toolIds.includes("booking.confirm") &&
    !toolIds.includes("availability.check")
  ) {
    push(
      "blocking",
      "booking_without_source",
      "Réserver réellement suppose de savoir ce qui est libre. Sans source de disponibilités, l'AiGENT peut au mieux enregistrer une demande.",
      {
        id: "booking_mode",
        question:
          "Pour les réservations, votre AiGENT doit-il seulement enregistrer la demande, ou réserver réellement le créneau ?",
        why: "Une réservation confirmée exige une source de disponibilités connectée.",
        options: [
          {
            id: "request",
            label: "Enregistrer la demande",
            patchHint: "booking.request",
          },
          {
            id: "confirm",
            label: "Réserver réellement",
            patchHint: "booking.confirm+availability.check",
          },
        ],
      },
    );
  }

  if (
    toolIds.includes("payment.link") &&
    spec.permissions?.autonomy === "autonomous"
  ) {
    push(
      "warning",
      "payment_autonomy",
      "Un paiement déclenché sans confirmation humaine est risqué. Une validation est recommandée.",
    );
  }

  if (
    (spec.missions || []).some((m) => /r[ée]serv/i.test(m.label || "")) &&
    !toolIds.some((id) => id.startsWith("booking."))
  ) {
    push(
      "warning",
      "mission_without_tool",
      "Une mission de réservation est annoncée mais aucun outil de réservation n'est activé.",
    );
  }

  if (
    toolIds.some((id) =>
      ["lead.capture", "form.submit", "booking.request"].includes(id),
    ) &&
    !(spec.permissions?.dataCollection || []).length
  ) {
    push(
      "info",
      "data_undeclared",
      "Des données personnelles seront collectées : il faut préciser lesquelles et pour quelle durée (RGPD).",
    );
  }

  if (!(spec.knowledge || []).length) {
    push(
      "warning",
      "no_knowledge",
      "Sans connaissances fournies, l'AiGENT répondra de façon générique.",
    );
  }

  if (!toolIds.includes("handoff.human")) {
    push(
      "info",
      "no_handoff",
      "Aucun transfert vers un humain n'est prévu en cas de blocage.",
    );
  }

  const score = Math.max(
    0,
    100 -
      issues.reduce(
        (s, i) =>
          s +
          (i.severity === "blocking" ? 25 : i.severity === "warning" ? 10 : 3),
        0,
      ),
  );
  return {
    issues,
    score,
    blocking: issues.filter((i) => i.severity === "blocking"),
  };
}

/** Complétude de la conception (0-100) — alimente la barre « Build 82% ». */
export function completeness(spec) {
  const checks = [
    !!spec.purpose,
    !!spec.audience,
    !!spec.name,
    !!spec.tagline,
    (spec.missions || []).length > 0,
    (spec.knowledge || []).length > 0,
    (spec.tools || []).length > 0,
    !!spec.interface?.kind,
    !!spec.interface?.styleId,
    (spec.tone || []).length > 0,
    (spec.workflows || []).length > 0,
    !!spec.permissions?.autonomy,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/* ════════════════════════════════════════════════════════════════════
   5. INTELLIGENCE DE CONCEPTION (appels IA)
   ════════════════════════════════════════════════════════════════════ */

const TOOL_LIST_FOR_PROMPT = TOOL_CATALOG.map(
  (t) =>
    `- ${t.id} : ${t.label} — ${t.description}${t.service ? ` [service requis : ${t.service}]` : ""}`,
).join("\n");

/** 5.1 — Première compréhension du besoin (carte « AiGENT comprend votre idée »). */
export async function understandIdea(
  message,
  spec = emptySpec(),
  history = [],
) {
  const system = `${LANG_GUARD}

${PRODUCT_GUARD}

Tu es un architecte produit + logiciel. On te donne une idée d'assistant à créer.
Ta mission : la COMPRENDRE, pas la coder.

CATALOGUE D'OUTILS DISPONIBLES (tu ne peux proposer que ceux-là) :
${TOOL_LIST_FOR_PROMPT}

Règles :
- Déduis l'objectif, le public, le secteur et 3 à 6 missions concrètes.
- Propose des outils du catalogue, jamais inventés.
- Formule 1 à 3 questions VRAIMENT utiles : celles dont la réponse change l'architecture
  (ex. « informer sur les réservations » vs « réserver réellement »).
- Si une capacité demandée nécessite une source de données externe, signale-la dans "risks".
- "confidence" entre 0 et 1.

Réponds UNIQUEMENT avec ce JSON :
{
  "understanding": {
    "objective": "une phrase",
    "audience": "une phrase",
    "sector": "mot-clé",
    "missions": [{"id":"slug","label":"…","enabled":true}],
    "summary": "2 phrases max, ce que tu as compris"
  },
  "suggestedTools": ["knowledge.search","…"],
  "suggestedKnowledge": [{"id":"slug","type":"text|faq|file|url|table","label":"…"}],
  "questions": [{"id":"slug","question":"…","why":"…","options":[{"id":"slug","label":"…"}]}],
  "risks": ["…"],
  "confidence": 0.8
}`;

  const user = `ÉTAT ACTUEL DU PROJET : ${JSON.stringify(compactSpec(spec))}
DERNIERS ÉCHANGES : ${JSON.stringify((history || []).slice(-6))}
NOUVELLE DEMANDE : "${message}"`;

  const json = await callJSON(system, user, { maxTokens: 1100 });
  if (!json?.understanding) return fallbackUnderstanding(message);
  return json;
}

function fallbackUnderstanding(message) {
  return {
    understanding: {
      objective: `Assistant intelligent : ${String(message).slice(0, 120)}`,
      audience: "Vos clients et visiteurs",
      sector: "général",
      missions: [
        { id: "repondre", label: "Répondre aux questions", enabled: true },
        { id: "informer", label: "Présenter vos informations", enabled: true },
        { id: "collecter", label: "Recueillir les demandes", enabled: true },
      ],
      summary:
        "J'ai retenu les grandes lignes. Précisons ensemble le périmètre.",
    },
    suggestedTools: [
      "knowledge.search",
      "faq.answer",
      "lead.capture",
      "handoff.human",
    ],
    suggestedKnowledge: [
      { id: "infos", type: "text", label: "Informations générales" },
    ],
    questions: [
      {
        id: "scope",
        question:
          "Votre AiGENT doit-il seulement informer, ou aussi enregistrer des demandes ?",
        why: "Cela change la base de données et les outils nécessaires.",
        options: [
          { id: "inform", label: "Informer uniquement" },
          { id: "act", label: "Informer et enregistrer" },
        ],
      },
    ],
    risks: [],
    confidence: 0.4,
  };
}

/** 5.2 — Extraction d'un patch de spec depuis un message libre. */
export async function extractSpecPatch(message, spec, history = []) {
  const system = `${LANG_GUARD}

Tu es un extracteur. Tu transformes un message utilisateur en PATCH JSON d'une configuration d'agent.
N'invente rien : ce qui n'est pas dit reste absent du patch.

CATALOGUE D'OUTILS AUTORISÉS :
${TOOL_LIST_FOR_PROMPT}

TYPES DE CONNAISSANCES : ${KNOWLEDGE_TYPES.join(", ")}
INTERFACES : ${INTERFACE_KINDS.map((i) => i.id).join(", ")}
STYLES : ${STYLE_PRESETS.map((s) => s.id).join(", ")}
AUTONOMIE : assist | act_with_confirmation | autonomous

Si l'utilisateur RETIRE quelque chose ("finalement pas de réservation"), renvoie l'élément
concerné avec {"id":"…","_remove":true} dans le tableau correspondant.

Réponds UNIQUEMENT avec ce JSON (omets les clés non concernées) :
{
  "patch": {
    "name": null, "tagline": null, "purpose": null, "audience": null, "sector": null,
    "tone": [], "persona": null,
    "missions": [], "knowledge": [], "tools": [], "workflows": [],
    "permissions": {}, "interface": {}, "assumptions": []
  },
  "userIntent": "refine|add|remove|question|confirm|other",
  "acknowledgement": "une phrase qui confirme ce que tu as compris"
}`;

  const user = `CONFIG ACTUELLE : ${JSON.stringify(compactSpec(spec))}
HISTORIQUE : ${JSON.stringify((history || []).slice(-6))}
MESSAGE : "${message}"`;

  const json = await callJSON(system, user, { maxTokens: 900 });
  return {
    patch: json?.patch || {},
    userIntent: json?.userIntent || "other",
    acknowledgement: json?.acknowledgement || null,
  };
}

/** 5.3 — Identité proposée (nom, description, ton, suggestions d'accueil). */
export async function proposeIdentity(spec) {
  const system = `${LANG_GUARD}
${PRODUCT_GUARD}
Tu proposes l'identité d'un assistant à créer. Sobriété : pas de superlatifs, pas d'emoji.
Le nom est court (1 à 3 mots), mémorisable, sans jeu de mots forcé.

Réponds UNIQUEMENT avec ce JSON :
{
  "options": [
    {"id":"a","name":"…","tagline":"…","tone":["…","…"],"persona":"2 phrases décrivant la façon de parler"},
    {"id":"b","…":"…"},
    {"id":"c","…":"…"}
  ],
  "greeting": "première phrase que l'agent dira à ses utilisateurs",
  "suggestions": ["question type 1","question type 2","question type 3"]
}`;
  const json = await callJSON(
    system,
    `PROJET : ${JSON.stringify(compactSpec(spec))}`,
    { maxTokens: 800 },
  );
  if (json?.options?.length) return json;
  const base = spec.sector || "Assistant";
  return {
    options: [
      {
        id: "a",
        name: `${cap(base)} Assistant`,
        tagline: spec.purpose || "Votre assistant intelligent",
        tone: ["professionnel", "chaleureux"],
        persona: "Il va droit au but, avec courtoisie.",
      },
      {
        id: "b",
        name: `${cap(base)} Copilote`,
        tagline: "L'aide en ligne de vos clients",
        tone: ["clair", "direct"],
        persona: "Il explique simplement, sans jargon.",
      },
      {
        id: "c",
        name: "Assistant Maison",
        tagline: "Toujours disponible pour vos visiteurs",
        tone: ["accueillant"],
        persona: "Il accueille comme le ferait un hôte attentif.",
      },
    ],
    greeting: "Bonjour, comment puis-je vous aider ?",
    suggestions: [
      "Quels sont vos horaires ?",
      "Puis-je réserver ?",
      "Comment vous joindre ?",
    ],
  };
}

/** 5.4 — Architecture visualisable (nœuds + liens) pour le panneau de réflexion. */
export async function proposeArchitecture(spec) {
  const deterministic = {
    nodes: [
      { id: "user", label: spec.audience || "Utilisateur", kind: "actor" },
      {
        id: "interface",
        label:
          INTERFACE_KINDS.find((i) => i.id === spec.interface?.kind)?.label ||
          "Interface",
        kind: "surface",
      },
      { id: "agent", label: spec.name || "AiGENT", kind: "core" },
      ...((spec.knowledge || []).length
        ? [{ id: "knowledge", label: "Connaissances", kind: "data" }]
        : []),
      ...((spec.tools || []).length
        ? [{ id: "tools", label: "Outils", kind: "tools" }]
        : []),
      ...computeIntegrations(spec)
        .filter((i) => i.service !== "ai_provider")
        .map((i) => ({
          id: `svc_${i.service}`,
          label: i.label,
          kind: "service",
          external: true,
        })),
    ],
    edges: [
      { from: "user", to: "interface" },
      { from: "interface", to: "agent" },
      ...((spec.knowledge || []).length
        ? [{ from: "agent", to: "knowledge" }]
        : []),
      ...((spec.tools || []).length ? [{ from: "agent", to: "tools" }] : []),
      ...computeIntegrations(spec)
        .filter((i) => i.service !== "ai_provider")
        .map((i) => ({
          from: "tools",
          to: `svc_${i.service}`,
          external: true,
        })),
    ],
  };

  const json = await callJSON(
    `${LANG_GUARD}
Tu décris, en une phrase par étape, le parcours d'une demande dans cet assistant.
Réponds UNIQUEMENT avec ce JSON :
{"caption":"une phrase de synthèse","flow":[{"step":"…","detail":"…"}]}`,
    `PROJET : ${JSON.stringify(compactSpec(spec))}`,
    { maxTokens: 500 },
  );

  return {
    ...deterministic,
    caption:
      json?.caption ||
      "Le visiteur écrit, l'AiGENT comprend, consulte vos informations puis agit.",
    flow: json?.flow || [
      { step: "Question", detail: "Le visiteur formule sa demande." },
      { step: "Compréhension", detail: "L'AiGENT identifie l'intention." },
      { step: "Recherche", detail: "Il consulte vos connaissances." },
      { step: "Décision", detail: "Il choisit d'informer ou d'agir." },
      {
        step: "Action",
        detail: "Il répond, enregistre ou transfère à un humain.",
      },
    ],
  };
}

/** 5.5 — Workflows proposés. */
export async function proposeWorkflows(spec) {
  const system = `${LANG_GUARD}
${PRODUCT_GUARD}
Tu proposes 1 à 3 parcours automatisés, chacun en 3 à 6 étapes.
Chaque étape utilise soit une réponse, soit un outil du catalogue :
${TOOL_LIST_FOR_PROMPT}

Réponds UNIQUEMENT avec ce JSON :
{"workflows":[{"id":"slug","name":"…","trigger":"phrase déclencheuse type","steps":[{"kind":"reply|tool|confirm|handoff","tool":"id ou null","label":"…"}]}]}`;
  const json = await callJSON(
    system,
    `PROJET : ${JSON.stringify(compactSpec(spec))}`,
    { maxTokens: 900 },
  );
  return json?.workflows || [];
}

/** 5.6 — Propositions de style (3 presets contextualisés, sans images). */
export async function proposeStyles(spec) {
  const json = await callJSON(
    `${LANG_GUARD}
On te donne 4 directions visuelles. Choisis-en 3 adaptées au projet et justifie chacune en une phrase.
Réponds UNIQUEMENT avec ce JSON : {"picks":[{"id":"…","why":"…"}]}`,
    `PROJET : ${JSON.stringify(compactSpec(spec))}
DIRECTIONS : ${JSON.stringify(STYLE_PRESETS.map((s) => ({ id: s.id, name: s.name, mood: s.mood })))}`,
    { maxTokens: 400 },
  );
  // APRÈS — le repli lui-même varie, plutôt que de montrer toujours les mêmes 3
  const picks = json?.picks?.length
    ? json.picks
    : [...STYLE_PRESETS]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((s) => ({ id: s.id, why: s.mood }));
  return picks
    .map((p) => {
      const preset = STYLE_PRESETS.find((s) => s.id === p.id);
      return preset ? { ...preset, why: p.why } : null;
    })
    .filter(Boolean);
}

/** 5.7 — Analyse de faisabilité : déterministe + enrichissement IA. */
export async function analyzeFeasibility(spec) {
  const local = checkCoherence(spec);
  const integrations = computeIntegrations(spec);

  const json = await callJSON(
    `${LANG_GUARD}
${PRODUCT_GUARD}
Tu es un architecte qui relit une conception d'assistant avant génération du code.
Signale UNIQUEMENT ce qui manque réellement ou ce qui est incohérent. Pas de généralités.
Chaque question doit avoir un impact concret sur l'architecture.

Réponds UNIQUEMENT avec ce JSON :
{"questions":[{"id":"slug","question":"…","why":"…","options":[{"id":"slug","label":"…"}]}],
 "warnings":["…"],
 "verdict":"ready|needs_input"}`,
    `CONFIG : ${JSON.stringify(compactSpec(spec))}
PROBLÈMES DÉTECTÉS LOCALEMENT : ${JSON.stringify(local.issues)}
SERVICES EXTERNES REQUIS : ${JSON.stringify(integrations.map((i) => i.service))}`,
    { maxTokens: 900 },
  );

  const questions = [
    ...local.issues.filter((i) => i.question).map((i) => i.question),
    ...(json?.questions || []),
  ];
  // dédoublonnage par id
  const seen = new Set();
  const uniqueQuestions = questions.filter(
    (q) => q?.id && !seen.has(q.id) && seen.add(q.id),
  );

  return {
    score: local.score,
    issues: local.issues,
    warnings: json?.warnings || [],
    questions: uniqueQuestions,
    integrations,
    verdict: local.blocking.length ? "needs_input" : json?.verdict || "ready",
  };
}

/** 5.8 — Fiche récapitulative « Voici ce que j'ai compris ». */
export async function buildRecap(spec) {
  const integrations = computeIntegrations(spec);
  const text = await callLLM(
    [
      {
        role: "system",
        content: `${LANG_GUARD}
Tu rédiges 2 phrases de synthèse d'une conception d'assistant, à destination de son créateur.
Sobre, factuel, sans superlatif. Pas de liste, pas de titre.`,
      },
      { role: "user", content: JSON.stringify(compactSpec(spec)) },
    ],
    { profile: "fast", maxTokens: 160 },
  );

  return {
    summary:
      text ||
      `${spec.name || "Votre AiGENT"} répondra à ${spec.audience || "vos utilisateurs"} et couvrira ${(spec.missions || []).length} missions.`,
    identity: {
      name: spec.name,
      tagline: spec.tagline,
      tone: spec.tone,
      persona: spec.persona,
    },
    mission: spec.purpose,
    audience: spec.audience,
    knowledge: spec.knowledge,
    tools: (spec.tools || []).map((t) => ({
      ...t,
      label: TOOL_CATALOG.find((c) => c.id === t.id)?.label || t.id,
    })),
    workflows: spec.workflows,
    interface: spec.interface,
    permissions: spec.permissions,
    integrations,
    completeness: completeness(spec),
  };
}

/** 5.9 — Étapes de travail affichées pendant « AiGENT réfléchit ».
 *  Ce sont des étapes RÉELLES du pipeline, jamais une chaîne de pensée. */
export function thinkingSteps(phase) {
  const map = {
    idea: ["Analyse du besoin", "Identification du domaine"],
    understanding: [
      "Analyse du besoin",
      "Définition des missions",
      "Sélection des capacités",
    ],
    exploration: [
      "Vérification des intégrations",
      "Définition de l'architecture",
    ],
    design: ["Préparation de l'interface", "Composition de l'identité"],
    validation: ["Contrôle de cohérence", "Vérification des dépendances"],
    build: [
      "Génération du front-end",
      "Génération du back-end",
      "Préparation des données",
      "Écriture de la configuration",
      "Vérification des secrets",
    ],
    test: ["Démarrage du bac à sable", "Chargement des connaissances"],
    export: ["Assemblage du projet", "Préparation de l'archive"],
  };
  return (map[phase] || map.understanding).map((label) => ({
    label,
    status: "pending",
  }));
}

/** 5.10 — Chat libre sur le projet (hors tunnel). */
export async function answerFreeform(message, spec, history = []) {
  const text = await callLLM(
    [
      {
        role: "system",
        content: `${LANG_GUARD}
${PRODUCT_GUARD}
Tu accompagnes quelqu'un qui conçoit son assistant. Réponds en 3 phrases maximum.
Si la question sort du sujet, réponds brièvement puis recentre sur la conception en cours.
Termine par une question ou une proposition d'étape suivante quand c'est utile.

CONFIGURATION ACTUELLE : ${JSON.stringify(compactSpec(spec))}`,
      },
      ...(history || []).slice(-6).map((h) => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: String(h.content).slice(0, 1200),
      })),
      { role: "user", content: message },
    ],
    { profile: "chat", maxTokens: 420 },
  );
  return (
    text ||
    "Je n'ai pas pu formuler de réponse à l'instant. Reformulez ou dites-moi simplement l'étape suivante."
  );
}

/** 5.11 — Prompt système du projet généré (injecté dans SON code, pas le nôtre). */
export async function generateAgentSystemPrompt(spec) {
  const toolLines = (spec.tools || [])
    .map((t) => {
      const def = TOOL_CATALOG.find((c) => c.id === t.id);
      return def ? `- ${def.id} : ${def.description}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const text = await callLLM(
    [
      {
        role: "system",
        content: `${LANG_GUARD}
Tu rédiges les INSTRUCTIONS SYSTÈME d'un assistant qui va être déployé par son propriétaire.
Ce texte sera lu par un modèle de langage, pas par un humain.
Structure : rôle, périmètre, ton, règles de refus, usage des outils, escalade.
Interdits : ne jamais inventer d'information absente des connaissances ; ne jamais confirmer
une action dont la disponibilité n'a pas été vérifiée ; toujours proposer un transfert humain
en cas de doute. Entre 150 et 300 mots. Texte brut, pas de JSON, pas de titre markdown.`,
      },
      {
        role: "user",
        content: `NOM : ${spec.name}
OBJECTIF : ${spec.purpose}
PUBLIC : ${spec.audience}
TON : ${(spec.tone || []).join(", ")}
PERSONA : ${spec.persona || "—"}
MISSIONS : ${(spec.missions || []).map((m) => m.label).join(" / ")}
CONNAISSANCES : ${(spec.knowledge || []).map((k) => `${k.label} (${k.type})`).join(" / ")}
OUTILS :
${toolLines || "(aucun)"}
AUTONOMIE : ${spec.permissions?.autonomy}`,
      },
    ],
    { profile: "chat", maxTokens: 700, temperature: 0.4 },
  );

  return (
    text ||
    `Tu es ${spec.name || "un assistant"}, au service de ${spec.audience || "les visiteurs"}.
Objectif : ${spec.purpose || "répondre aux questions courantes"}.
Réponds uniquement à partir des connaissances fournies. Si l'information est absente, dis-le
et propose de transmettre la demande à un humain. Ne confirme jamais une réservation ou une
commande sans validation explicite. Ton : ${(spec.tone || ["professionnel"]).join(", ")}.`
  );
}

/** 5.12 — Squelette de connaissances : questions à remplir par l'utilisateur. */
export async function generateKnowledgeSkeleton(spec) {
  const json = await callJSON(
    `${LANG_GUARD}
Tu prépares les fichiers de connaissances vides d'un assistant : ce que son propriétaire devra remplir.
Pour chaque entrée, donne un titre, un exemple de contenu très court, et 2 questions types auxquelles elle répond.
Réponds UNIQUEMENT avec ce JSON :
{"entries":[{"id":"slug","title":"…","sample":"…","answers":["…","…"]}]}`,
    `PROJET : ${JSON.stringify(compactSpec(spec))}`,
    { maxTokens: 900 },
  );
  return (
    json?.entries || [
      {
        id: "infos",
        title: "Informations générales",
        sample: "Adresse, horaires, contact.",
        answers: ["Où êtes-vous ?", "Quels sont vos horaires ?"],
      },
    ]
  );
}

/** 5.13 — Bac à sable : faire parler l'AiGENT conçu, AVEC NOS clés,
 *  côté serveur uniquement. L'utilisateur teste sans rien brancher. */
export async function runAgentSandbox(
  spec,
  userMessage,
  history = [],
  knowledgeText = "",
) {
  const system = `${spec.runtime?.systemPrompt || (await generateAgentSystemPrompt(spec))}

CONNAISSANCES DISPONIBLES :
${knowledgeText?.slice(0, 6000) || "(aucune connaissance fournie pour l'instant — dis-le honnêtement si on te demande un détail précis)"}

MODE TEST : tu es exécuté dans un bac à sable de démonstration. Aucune action réelle n'est
effectuée : si tu déclenches un outil, annonce-le clairement entre crochets, par exemple
[Action simulée : booking.request]. Réponds en ${spec.language === "en" ? "anglais" : "français"}.`;

  const text = await callLLM(
    [
      { role: "system", content: system },
      ...(history || []).slice(-8).map((h) => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: String(h.content).slice(0, 1500),
      })),
      { role: "user", content: userMessage },
    ],
    { profile: "chat", maxTokens: 600, temperature: 0.5 },
  );

  return text || "Je ne parviens pas à répondre pour le moment.";
}

/* ════════════════════════════════════════════════════════════════════
   6. PHRASING DU BUILDER (messages du chat)
   ════════════════════════════════════════════════════════════════════ */

const PHRASING_FALLBACKS = {
  understanding_ready:
    "Avant de construire, voici ce que j'ai compris de votre besoin. Corrigez ce qui ne va pas.",
  question: "Une précision m'aiderait à bien dimensionner la suite.",
  architecture: "Voici comment votre AiGENT serait structuré.",
  workflows: "Voici les parcours automatisés que je propose.",
  identity: "Passons à son identité : nom, description et ton.",
  styles:
    "Trois directions visuelles possibles. Choisissez celle qui vous correspond.",
  features:
    "Voici les capacités retenues. Vous pouvez en activer ou en retirer.",
  recap: "Voici la fiche de conception complète de votre AiGENT.",
  build_start: "Je construis votre AiGENT. Cela prend quelques instants.",
  build_done:
    "Votre AiGENT est construit. Il reste à connecter vos propres services.",
  test: "Vous pouvez le tester ici même avant de l'exporter.",
  export: "Votre projet est prêt à être téléchargé et ouvert dans VS Code.",
  patch_applied: "C'est noté, j'ai mis la conception à jour.",
  removed: "J'ai retiré cet élément et ajusté le reste de la conception.",
};

export async function phrase(event, spec, extra = {}) {
  const briefs = {
    understanding_ready:
      "Annonce que tu as compris le besoin et que la fiche de compréhension s'affiche. Ne pose aucune question.",
    question: `Pose cette question, reformulée naturellement : "${extra.question || ""}". Explique en une demi-phrase pourquoi elle compte.`,
    architecture:
      "Annonce que tu affiches l'architecture proposée. Une phrase.",
    workflows:
      "Annonce que tu affiches les parcours automatisés proposés. Une phrase.",
    identity:
      "Annonce que tu proposes plusieurs identités possibles. Une phrase.",
    styles: "Annonce que tu proposes trois directions visuelles. Une phrase.",
    features:
      "Annonce que tu affiches les capacités retenues, modifiables. Une phrase.",
    recap:
      "Annonce la fiche de conception complète, à valider ou modifier. Une phrase.",
    build_start: "Annonce que la construction démarre. Une phrase.",
    build_done: `Annonce que le projet est construit. Mentionne qu'il reste ${extra.missingCount || 0} service(s) à connecter via le fichier .env. Deux phrases maximum.`,
    test: "Invite à tester l'AiGENT dans l'aperçu. Une phrase.",
    export:
      "Annonce que le projet peut être téléchargé et ouvert dans un éditeur. Une phrase.",
    patch_applied: `Confirme la modification suivante sans la répéter mot pour mot : "${extra.change || ""}". Une phrase.`,
    removed: `Confirme le retrait de "${extra.change || ""}" et dis en une demi-phrase ce que ça simplifie.`,
  };

  const brief = briefs[event];
  if (!brief) return PHRASING_FALLBACKS[event] || "Continuons.";

  const text = await callLLM(
    [
      {
        role: "system",
        content: `${LANG_GUARD}
${PRODUCT_GUARD}
Tu es le copilote de conception. Ton sobre, précis, jamais commercial, jamais d'emoji.
Une à deux phrases, pas plus. Ne répète pas les informations déjà à l'écran.

CONFIGURATION : ${JSON.stringify(compactSpec(spec))}

TÂCHE : ${brief}`,
      },
      { role: "user", content: "Rédige le message." },
    ],
    { profile: "fast", maxTokens: 150 },
  );

  return text && !isUnusableOutput(text, { maxChars: 400 })
    ? text.replace(/^["«\s]+|["»\s]+$/g, "")
    : PHRASING_FALLBACKS[event];
}

/* ════════════════════════════════════════════════════════════════════
   7. UTILITAIRES
   ════════════════════════════════════════════════════════════════════ */

function cap(s) {
  return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "";
}

/** Version compacte de la spec envoyée aux prompts (économie de tokens). */
export function compactSpec(spec = {}) {
  return {
    name: spec.name,
    tagline: spec.tagline,
    purpose: spec.purpose,
    audience: spec.audience,
    sector: spec.sector,
    tone: spec.tone,
    missions: (spec.missions || []).map((m) => m.label),
    knowledge: (spec.knowledge || []).map((k) => `${k.label}:${k.type}`),
    tools: (spec.tools || []).map((t) => t.id),
    workflows: (spec.workflows || []).map((w) => w.name),
    interface: spec.interface?.kind,
    style: spec.interface?.styleId,
    autonomy: spec.permissions?.autonomy,
  };
}

export default {
  callLLM,
  probeProviders,
  emptySpec,
  applyPatch,
  slugify,
  understandIdea,
  extractSpecPatch,
  proposeIdentity,
  proposeArchitecture,
  proposeWorkflows,
  proposeStyles,
  analyzeFeasibility,
  buildRecap,
  thinkingSteps,
  answerFreeform,
  generateAgentSystemPrompt,
  generateKnowledgeSkeleton,
  runAgentSandbox,
  phrase,
  checkCoherence,
  computeIntegrations,
  completeness,
  TOOL_CATALOG,
  SERVICE_CATALOG,
  STYLE_PRESETS,
  INTERFACE_KINDS,
  KNOWLEDGE_TYPES,
  PHASES,
};
