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
function isUnusableOutput(
  text,
  { expectJson = false, expectCode = false, maxChars = 900, profile = "" } = {},
) {
  if (!text || !text.trim()) return true;
  // Le code source est validé par aigentCodegen.js après réception. Les
  // filtres de prose ne doivent ni couper sa longueur ni forcer du JSON.
  if (expectCode) return false;
  const t = text.toLowerCase();
  // Les réponses du Chat sont volontairement plus longues et peuvent contenir
  // un bloc de livrable [[AIGENT_DATA]] en JSON. Le filtre court était conçu
  // pour les réponses de classification, pas pour une conversation.
  const conversational =
    profile === "chat" || profile === "deep" || profile === "fast";
  if (
    !expectJson &&
    text.length > (conversational ? Math.max(maxChars, 16000) : maxChars)
  )
    return true;
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
  // APRÈS
  // En conversation, « tu es un… » ou « let me » sont des phrases légitimes : on ne filtre que les vraies fuites.
  const leaks = [
    /<think/i,
    /^\s*(safe|unsafe)\s*[:.]?\s*$/i,
    /\bmoderation (result|verdict|flag)\b/i,
    /\bpolicy violation\b/i,
  ];
  if (
    (conversational ? leaks : meta).some((re) =>
      re.test(conversational ? text : t),
    )
  )
    return true;
  if (!expectJson && !conversational && /[{}]/.test(text)) return true;
  const englishTells = (
    t.match(
      /\b(the|here|where|every|this|should|would|i am|as an|okay|please note)\b/g,
    ) || []
  ).length;
  // APRÈS
  if (!conversational && englishTells >= 3) return true;
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
    .slice(0, 12);
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
  if (!models.length) {
    console.warn(
      "[AiGENT AI] OpenRouter : aucun modèle texte explicitement gratuit au catalogue.",
    );
    return null;
  }

  const tested = await Promise.all(
    models.map(async (model) => {
      const healthy = await pingModel(
        `openrouter:${model.id}`,
        async (msgs, opts) => {
          const result = await fetchJSON(
            `${OPENROUTER_API_URL}/chat/completions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: model.id,
                messages: msgs,
                max_tokens: opts.maxTokens,
                temperature: 0,
              }),
            },
            opts.timeoutMs,
          );
          if (!result.ok)
            throw Object.assign(new Error(`HTTP ${result.status}`), {
              status: result.status,
            });
          return result.data?.choices?.[0]?.message?.content?.trim() || "";
        },
      );
      return healthy ? model : null;
    }),
  );
  models = tested.filter(Boolean);
  console.info(
    `[AiGENT AI] OpenRouter : ${models.length} modèles gratuits testés et disponibles.`,
  );
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
        MODEL_HEALTH.set(`openrouter:${model.id}`, {
          ok: false,
          checkedAt: Date.now(),
        });
        continue;
      }
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      if (text && !isUnusableOutput(text, o)) {
        console.log(`✅ [AiGENT AI] OpenRouter OK (${model.id})`);
        return text;
      }
      MODEL_HEALTH.set(`openrouter:${model.id}`, {
        ok: false,
        checkedAt: Date.now(),
      });
      console.warn(
        `[AiGENT AI] OpenRouter ${model.id} : réponse vide ou rejetée par le filtre de sortie.`,
      );
    } catch (e) {
      console.warn(
        `⚠️ [AiGENT AI] OpenRouter ${model.id} FAILED:`,
        e.message?.slice(0, 80),
      );
    }
  }
  return null;
}

/* ─── Pollinations : catalogue vivant + qualification des modèles gratuits ─── */
const POLLINATIONS_URL = "https://gen.pollinations.ai";
let pollinationsCatalog = null;
let pollinationsCatalogAt = 0;
let pollinationsWorking = null;
let pollinationsWorkingAt = 0;
const POLLINATIONS_TTL = 5 * 60 * 1000;
const POLLINATIONS_MAX_TESTS = 12;

function pollinationsPricing(model) {
  const pricing = model?.pricing || {};
  return {
    prompt: Number(pricing.promptTextTokens ?? NaN),
    completion: Number(pricing.completionTextTokens ?? NaN),
  };
}

function pollinationsClassify(model) {
  const id = String(model?.id ?? model?.name ?? "").toLowerCase();
  const { prompt, completion } = pollinationsPricing(model);
  if (prompt === 0 || completion === 0) return "free";
  if (/:free$|-free(?:$|[-_])|_free(?:$|[-_])|\/free(?:$|[-_])/.test(id))
    return "candidate";
  if (!Number.isFinite(prompt) && !Number.isFinite(completion))
    return "unknown";
  if (prompt <= 0.000001 && completion <= 0.000003) return "cheap";
  return "paid";
}

function pollinationsPriority(model) {
  const id = String(model?.id ?? model?.name ?? "").toLowerCase();
  const capabilities = [
    model?.description,
    model?.type,
    ...(model?.input_modalities || []),
    ...(model?.output_modalities || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (
    /(embedding|tts|transcrib|whisper|realtime|audio|voice|speech|image|flux|video|3d|moderation)/.test(
      `${id} ${capabilities}`,
    )
  )
    return -1;
  if (/gpt-oss-120b/.test(id)) return 110;
  if (/gpt-oss-20b/.test(id)) return 101;
  if (
    /(deepseek.*(v3|coder)|qwen.*(coder|72b|110b)|llama.*70b|nemotron.*(70b|120b)|command-r-plus|mistral-large)/.test(
      id,
    )
  )
    return 100;
  if (
    /(qwen.*32b|llama.*(32b|3\.3)|mistral-small|command-r|glm.*(4|9b))/.test(id)
  )
    return 80;
  if (/(qwen|llama|mistral|gemma|phi|granite|aya|deepseek)/.test(id)) return 60;
  return 30;
}

function selectPollinationsModels(models) {
  const candidates = (Array.isArray(models) ? models : [])
    .filter((model) => pollinationsPriority(model) >= 0)
    .filter((model) =>
      ["free", "candidate", "cheap"].includes(pollinationsClassify(model)),
    )
    .sort((a, b) => {
      return (
        pollinationsPriority(b) - pollinationsPriority(a) ||
        { free: 3, candidate: 2, cheap: 1 }[pollinationsClassify(b)] -
          { free: 3, candidate: 2, cheap: 1 }[pollinationsClassify(a)]
      );
    });
  return candidates
    .filter(
      (model, index, all) =>
        all.findIndex(
          (other) => (other.id ?? other.name) === (model.id ?? model.name),
        ) === index,
    )
    .slice(0, POLLINATIONS_MAX_TESTS);
}

async function getPollinationsCatalog() {
  if (
    pollinationsCatalog &&
    Date.now() - pollinationsCatalogAt < POLLINATIONS_TTL
  )
    return pollinationsCatalog;
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return [];
  const { ok, status, data } = await fetchJSON(
    `${POLLINATIONS_URL}/text/models`,
    {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    },
    12000,
  );
  if (!ok) throw new Error(data?.error?.message || `HTTP ${status}`);
  pollinationsCatalog = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  pollinationsCatalogAt = Date.now();
  return pollinationsCatalog;
}

async function pollinationsCompletion(model, messages, opts, key) {
  const { ok, status, data } = await fetchJSON(
    `${POLLINATIONS_URL}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        ...(opts.expectJson
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
    },
    opts.timeoutMs,
  );
  if (!ok)
    throw Object.assign(new Error(data?.error?.message || `HTTP ${status}`), {
      status,
    });
  const content =
    data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
  return Array.isArray(content)
    ? content
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim()
    : String(content).trim();
}

async function getPollinationsWorkingModels() {
  if (
    pollinationsWorking &&
    Date.now() - pollinationsWorkingAt < POLLINATIONS_TTL
  )
    return pollinationsWorking;
  const key = process.env.POLLINATIONS_API_KEY;
  const candidates = selectPollinationsModels(await getPollinationsCatalog());
  const tested = await Promise.all(
    candidates.map(async (model) => {
      const id = String(model.id ?? model.name);
      const healthy = await pingModel(
        `pollinations:${id}`,
        (messages, opts) => pollinationsCompletion(id, messages, opts, key),
        { ttl: POLLINATIONS_TTL },
      );
      return healthy ? model : null;
    }),
  );
  pollinationsWorking = tested.filter(Boolean);
  pollinationsWorkingAt = Date.now();
  console.info(
    `[AiGENT AI] Pollinations : ${pollinationsWorking.length}/${candidates.length} modèles candidats répondent.`,
  );
  return pollinationsWorking;
}

async function callPollinations(messages, o) {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return null;
  let models;
  try {
    models = await getPollinationsWorkingModels();
  } catch (error) {
    console.warn(
      "[AiGENT AI] Pollinations catalogue indisponible :",
      error.message?.slice(0, 100),
    );
    return null;
  }
  for (const model of models.slice(0, o.maxModelTries || 3)) {
    const id = String(model.id ?? model.name);
    try {
      const text = await withRetry(() =>
        pollinationsCompletion(id, messages, o, key),
      );
      if (text && !isUnusableOutput(text, o)) {
        console.info(`[AiGENT AI] Pollinations OK (${id})`);
        return text;
      }
      console.warn(
        `[AiGENT AI] Pollinations ${id} : réponse vide ou invalide.`,
      );
    } catch (error) {
      MODEL_HEALTH.set(`pollinations:${id}`, {
        ok: false,
        checkedAt: Date.now(),
      });
      console.warn(
        `[AiGENT AI] Pollinations ${id} échec HTTP ${error.status || "réseau"}.`,
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
    .slice(0, 12);
  groqCache = models;
  groqCacheAt = Date.now();
  return models;
}

async function callGroq(messages, o) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  // Quota de sortie ~1000 tokens/min : impossible de produire un fichier de code complet.
  if (o.expectCode) return null;
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
  const tested = await Promise.all(
    models.map(async (model) => {
      const healthy = await pingModel(
        `groq:${model.id}`,
        async (msgs, opts) => {
          const result = await fetchJSON(
            `${GROQ_API_URL}/chat/completions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: model.id,
                messages: msgs,
                max_tokens: opts.maxTokens,
                temperature: 0,
                ...(model.id.includes("gpt-oss")
                  ? { reasoning_effort: "low" }
                  : {}),
              }),
            },
            opts.timeoutMs,
          );
          if (!result.ok)
            throw Object.assign(new Error(`HTTP ${result.status}`), {
              status: result.status,
            });
          return result.data?.choices?.[0]?.message?.content?.trim() || "";
        },
      );
      return healthy ? model : null;
    }),
  );
  const healthyModels = tested.filter(Boolean);
  console.info(
    `[AiGENT AI] Groq : ${healthyModels.length}/${models.length} modèles du catalogue répondent.`,
  );
  if (healthyModels.length)
    console.info(
      `[AiGENT AI] Groq candidats validés : ${healthyModels.map((model) => model.id).join(", ")}.`,
    );
  for (const model of healthyModels.slice(0, o.maxModelTries || 3)) {
    try {
      let maxTokens = o.maxTokens;
      let result;
      for (let attempt = 0; attempt < 2; attempt++) {
        result = await fetchJSON(
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
              max_tokens: maxTokens,
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
        const errorText = String(result.data?.error?.message || "");
        if (
          attempt === 0 &&
          result.status === 429 &&
          /output tokens per minute|requested .* tokens|reduce max_tokens/i.test(
            errorText,
          ) &&
          maxTokens > 256
        ) {
          maxTokens = Math.max(
            256,
            Math.min(900, Math.floor(maxTokens * 0.75)),
          );
          console.warn(
            `[AiGENT AI] Groq ${model.id}: quota de sortie, nouvel essai avec ${maxTokens} tokens.`,
          );
          continue;
        }
        break;
      }
      const { ok, status, data } = result;
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
  if (/gpt-oss-120b/.test(s)) return 115;
  if (/gpt-oss-20b/.test(s)) return 100;
  if (/(235b|120b|180b)/.test(s)) return 95;
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
  if (!candidates.length) {
    console.warn(
      "[AiGENT AI] Cerebras : aucun modèle de chat actif dans le catalogue.",
    );
    return null;
  }

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
        const ok = await pingModel(
          `cerebras:${model}`,
          (msgs, opts) => call(model, msgs, opts),
          { logFailure: true },
        );
        return ok ? model : null;
      }),
    )
  ).filter(Boolean);

  console.info(
    `[AiGENT AI] Cerebras : ${healthy.length}/${candidates.length} modèles du catalogue répondent.`,
  );
  if (healthy.length)
    console.info(
      `[AiGENT AI] Cerebras candidats validés : ${healthy.join(", ")}.`,
    );

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
    console.warn(
      "[AiGENT AI] GitHub Models : réponse vide ou rejetée par le filtre de sortie.",
    );
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
  const rank = (model) => {
    const id = String(model.name || "").toLowerCase();
    if (/(embed|rerank|classify|summarize|moderation)/.test(id)) return -1;
    if (/command-a|command-r-plus/.test(id)) return 100;
    if (/command-r/.test(id)) return 85;
    if (/command/.test(id)) return 70;
    if (/aya/.test(id)) return 55;
    return 20;
  };
  const candidates = models
    .filter((model) => rank(model) >= 0)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 4);
  const healthy = await Promise.all(
    candidates.map(async (model) => {
      const id = String(model.name);
      const ok = await pingModel(`cohere:${id}`, async (msgs, opts) => {
        const result = await fetchJSON(
          `${COHERE_API_URL}/v2/chat`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: id,
              messages: msgs,
              max_tokens: opts.maxTokens,
              temperature: 0,
            }),
          },
          opts.timeoutMs,
        );
        if (!result.ok)
          throw Object.assign(new Error(`HTTP ${result.status}`), {
            status: result.status,
          });
        const parts = result.data?.message?.content;
        return Array.isArray(parts)
          ? parts
              .filter((part) => part?.type === "text")
              .map((part) => part.text)
              .join(" ")
              .trim()
          : "";
      });
      return ok ? model : null;
    }),
  );
  for (const model of healthy.filter(Boolean).slice(0, o.maxModelTries || 2)) {
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
const MISTRAL_API_URL = "https://api.mistral.ai/v1";
let mistralCache = null;
let mistralCacheAt = 0;
const MISTRAL_TTL = 15 * 60 * 1000;

function mistralPriority(id) {
  const s = id.toLowerCase();
  if (/(embed|moderation|ocr|guard)/.test(s)) return -1;
  if (s.includes("mistral-large")) return 110;
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
  if (!candidates.length) {
    console.warn(
      "[AiGENT AI] Mistral : aucun modèle de chat actif dans le catalogue.",
    );
    return null;
  }

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

  console.info(
    `[AiGENT AI] Mistral : ${healthy.length}/${candidates.length} modèles du catalogue répondent.`,
  );
  if (healthy.length)
    console.info(
      `[AiGENT AI] Mistral candidats validés : ${healthy.join(", ")}.`,
    );

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
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1";
let nvidiaCache = null;
let nvidiaCacheAt = 0;
const NVIDIA_TTL = 15 * 60 * 1000;

function nvidiaPriority(id) {
  const s = id.toLowerCase();
  if (
    /(embed|rerank|guard|moderation|vision|tts|asr|reasoning|calibration|omni)/.test(
      s,
    )
  )
    return -1;
  if (/nemotron-3\.5-lightning/.test(s)) return 125;
  if (/nemotron-3-ultra|nemotron-3-nano-omni/.test(s)) return 115;
  if (/ising-calibration/.test(s)) return 105;
  if (/laguna-xs/.test(s)) return 95;
  if (
    /gpt-oss-120b|deepseek.*(v3|r1)|llama-3\.3-70b|qwen.*(coder|72b)|nemotron.*(70b|120b)/.test(
      s,
    )
  )
    return 110;
  if (
    /gpt-oss-20b|llama.*70b|command-r-plus|mistral-large|mixtral.*8x22b/.test(s)
  )
    return 100;
  if (/(405b|340b)/.test(s)) return 95;
  if (/(70b|72b)/.test(s)) return 85;
  if (/(mixtral|8x22b)/.test(s)) return 75;
  if (/(34b|32b)/.test(s)) return 60;
  if (/(8b|9b)/.test(s)) return 40;
  return 10;
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
  if (!candidates.length) {
    console.warn(
      "[AiGENT AI] NVIDIA : aucun modèle de chat actif dans le catalogue.",
    );
    return null;
  }

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

  const healthy = [];
  // Le catalogue NVIDIA peut contenir des dizaines de modèles retirés ou
  // non conversationnels. Les sonder tous ajoutait plusieurs minutes à chaque
  // génération et se répétait sur des appels simultanés. Vérifier uniquement
  // les 12 meilleurs candidats; le cache ping/in-flight mutualise le travail.
  const shortlist = candidates.slice(0, 12);
  for (let offset = 0; offset < shortlist.length; offset += 6) {
    const checked = await Promise.all(
      shortlist.slice(offset, offset + 6).map(async (model) => {
        const ok = await pingModel(
          `nvidia:${model}`,
          (msgs, opts) => call(model, msgs, opts),
          { logFailure: true },
        );
        return ok ? model : null;
      }),
    );
    healthy.push(...checked.filter(Boolean));
  }

  console.info(
    `[AiGENT AI] NVIDIA : ${healthy.length}/${shortlist.length} candidats prioritaires répondent (${candidates.length} listés).`,
  );
  if (healthy.length)
    console.info(
      `[AiGENT AI] NVIDIA candidats validés : ${healthy.join(", ")}.`,
    );

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

let geminiModelsCache = null;
let geminiModelsCacheAt = 0;
const GEMINI_MODELS_TTL = 5 * 60 * 1000;

async function getGeminiModels() {
  if (geminiModelsCache && Date.now() - geminiModelsCacheAt < GEMINI_MODELS_TTL)
    return geminiModelsCache;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  const { ok, status, data } = await fetchJSON(
    "https://generativelanguage.googleapis.com/v1beta/models",
    {
      headers: { "x-goog-api-key": key, Accept: "application/json" },
    },
    12000,
  );
  if (!ok) throw new Error(data?.error?.message || `HTTP ${status}`);
  const rank = (id) => {
    const name = id.toLowerCase();
    if (/embedding|aqa|tts|image|veo/.test(name)) return -1;
    if (/gemini-3.*pro/.test(name)) return 110;
    if (/gemini-2\.5-pro/.test(name)) return 100;
    if (/gemini-3.*flash/.test(name)) return 90;
    if (/gemini-2\.5-flash(?!-lite)/.test(name)) return 85;
    if (/flash-lite/.test(name)) return 60;
    return 40;
  };
  geminiModelsCache = [
    ...new Set(
      (data?.models || [])
        .filter((model) =>
          model.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((model) => String(model.name || "").replace(/^models\//, ""))
        .filter((id) => id && rank(id) >= 0),
    ),
  ]
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 12);
  geminiModelsCacheAt = Date.now();
  return geminiModelsCache;
}

async function callGemini(messages, o) {
  if (!geminiClient) return null;
  let models;
  try {
    models = await getGeminiModels();
  } catch (error) {
    console.warn(
      "[AiGENT AI] Gemini catalogue indisponible :",
      error.message?.slice(0, 100),
    );
    return null;
  }
  const candidates = await Promise.all(
    models.map(async (model) => {
      const healthy = await pingModel(`gemini:${model}`, async (msgs, opts) => {
        const contents = msgs
          .map(
            (message) =>
              `${message.role === "system" ? "[Instructions]" : message.role === "assistant" ? "[Assistant]" : "[Utilisateur]"} ${message.content}`,
          )
          .join("\n\n");
        const response = await geminiClient.models.generateContent({
          model,
          contents,
          config: { maxOutputTokens: opts.maxTokens, temperature: 0 },
        });
        return response?.text?.trim() || "";
      });
      return healthy ? model : null;
    }),
  );
  const healthyModels = candidates.filter(Boolean);
  if (!healthyModels.length) {
    console.warn(
      `[AiGENT AI] Gemini : 0/${models.length} modèles du catalogue répondent.`,
    );
    return null;
  }
  console.info(
    `[AiGENT AI] Gemini : ${healthyModels.length}/${models.length} modèles du catalogue répondent.`,
  );
  const hasMultimodal = messages.some((message) =>
    Array.isArray(message.content),
  );
  const contents = hasMultimodal
    ? messages
        .filter((message) => message.role !== "system")
        .map((message, index) => {
          const parts = Array.isArray(message.content)
            ? message.content
                .map((part) => {
                  if (part.type === "text")
                    return { text: String(part.text || "") };
                  if (part.type === "inline_data")
                    return {
                      inlineData: { mimeType: part.mimeType, data: part.data },
                    };
                  if (part.type === "image_url") {
                    const match = String(part.image_url?.url || "").match(
                      /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i,
                    );
                    return match
                      ? { inlineData: { mimeType: match[1], data: match[2] } }
                      : null;
                  }
                  return null;
                })
                .filter(Boolean)
            : [{ text: String(message.content || "") }];
          if (index === 0)
            parts.unshift({
              text: `[Instructions système]\n${messages
                .filter((item) => item.role === "system")
                .map((item) => item.content)
                .join("\n\n")}\n\n`,
            });
          return {
            role: message.role === "assistant" ? "model" : "user",
            parts,
          };
        })
    : messages
        .map((m) =>
          m.role === "system"
            ? `[Instructions système]\n${m.content}`
            : m.content,
        )
        .join("\n\n");
  for (const model of healthyModels.slice(0, o.maxModelTries || 3)) {
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

/* ─── 2.9 Cloudflare Workers AI ─── */
const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4";
let cloudflareModelsCache = null;
let cloudflareModelsCacheAt = 0;
const CLOUDFLARE_TTL = 10 * 60 * 1000;

function cloudflarePriority(model) {
  const id = String(model?.name || model?.id || "").toLowerCase();
  const task = String(
    model?.task?.name || model?.task || model?.pipeline_tag || "",
  ).toLowerCase();
  if (!id || (task && !/(text generation|text-generation|chat)/.test(task)))
    return -1;
  if (
    /(embed|rerank|guard|moderation|vision|tts|asr|whisper|image|audio)/.test(
      id,
    )
  )
    return -1;
  if (
    /gpt-oss-120b|deepseek.*(v3|coder)|qwen.*(coder|72b)|llama.*70b|command-r-plus|mistral-large/.test(
      id,
    )
  )
    return 100;
  if (/gpt-oss-20b|qwen.*32b|llama.*32b|mistral-small|command-r/.test(id))
    return 80;
  return 50;
}

async function getCloudflareModelIds(accountId, apiKey) {
  if (
    cloudflareModelsCache &&
    Date.now() - cloudflareModelsCacheAt < CLOUDFLARE_TTL
  )
    return cloudflareModelsCache;
  const { ok, status, data } = await fetchJSON(
    `${CLOUDFLARE_API_URL}/accounts/${encodeURIComponent(accountId)}/ai/models/search?hide_experimental=true&per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
    12000,
  );
  if (!ok || data?.success === false)
    throw new Error(data?.errors?.[0]?.message || `HTTP ${status}`);
  const models = (
    Array.isArray(data?.result)
      ? data.result
      : Array.isArray(data?.result?.data)
        ? data.result.data
        : []
  )
    .map((model) => ({ model, id: String(model?.name || model?.id || "") }))
    .filter(
      ({ model, id }) => id && cloudflarePriority({ ...model, name: id }) >= 0,
    )
    .sort(
      (a, b) =>
        cloudflarePriority({ ...b.model, name: b.id }) -
        cloudflarePriority({ ...a.model, name: a.id }),
    );
  cloudflareModelsCache = [...new Set(models.map(({ id }) => id))];
  cloudflareModelsCacheAt = Date.now();
  return cloudflareModelsCache;
}

async function callCloudflare(messages, o) {
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiKey || !accountId) return null;
  let models;
  try {
    models = await getCloudflareModelIds(accountId, apiKey);
  } catch (error) {
    console.warn(
      "[AiGENT AI] Cloudflare catalogue indisponible :",
      error.message?.slice(0, 100),
    );
    return null;
  }
  if (!models.length) {
    console.warn(
      "[AiGENT AI] Cloudflare : aucun modèle de génération de texte dans le catalogue.",
    );
    return null;
  }
  const healthyModels = (
    await Promise.all(
      models.slice(0, 15).map(async (model) => {
        const healthy = await pingModel(`cloudflare:${model}`, (msgs, opts) => {
          const prompt = msgs.map((message) => message.content).join("\n\n");
          return fetchJSON(
            `${CLOUDFLARE_API_URL}/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ prompt, max_tokens: opts.maxTokens }),
            },
            opts.timeoutMs,
          ).then((result) => {
            if (!result.ok || result.data?.success === false)
              throw Object.assign(new Error(`HTTP ${result.status}`), {
                status: result.status,
              });
            return (
              result.data?.result?.response ||
              result.data?.result?.choices?.[0]?.text ||
              ""
            );
          });
        });
        return healthy ? model : null;
      }),
    )
  ).filter(Boolean);
  console.info(
    `[AiGENT AI] Cloudflare : ${healthyModels.length}/${models.length} modèles du catalogue répondent.`,
  );
  if (healthyModels.length)
    console.info(
      `[AiGENT AI] Cloudflare candidats validés : ${healthyModels.join(", ")}.`,
    );
  if (!healthyModels.length) return null;
  const prompt = messages
    .map(
      (m) =>
        `${m.role === "system" ? "[Instructions]" : m.role === "assistant" ? "[Assistant]" : "[Utilisateur]"} ${m.content}`,
    )
    .join("\n\n");

  for (const model of healthyModels.slice(0, o.maxModelTries || 2)) {
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
  architect: [
    "gemini",
    "github",
    "openrouter",
    "groq",
    "cerebras",
    "cohere",
    "mistral",
    "nvidia",
    "pollinations",
    "cloudflare",
  ],
  design: [
    "pollinations",
    "gemini",
    "cohere",
    "mistral",
    "nvidia",
    "groq",
    "cerebras",
    "openrouter",
    "github",
    "cloudflare",
  ],
  frontend: [
    "gemini",
    "mistral",
    "github",
    "cohere",
    "pollinations",
    "openrouter",
    "nvidia",
    "cloudflare",
  ],
  backend: [
    "gemini",
    "mistral",
    "github",
    "cohere",
    "pollinations",
    "openrouter",
    "nvidia",
    "cloudflare",
  ],
  qa: [
    "cohere",
    "gemini",
    "github",
    "nvidia",
    "mistral",
    "cerebras",
    "groq",
    "openrouter",
    "pollinations",
    "cloudflare",
  ],
};

export async function callCode(messages, opts = {}) {
  const role = CODE_PROVIDER_ORDERS[opts.role] ? opts.role : "frontend";
  const envOrder = process.env[`AIGENT_${role.toUpperCase()}_PROVIDER_ORDER`];
  const order = envOrder
    ? envOrder
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    : CODE_PROVIDER_ORDERS[role];
  const raw = await callLLM(messages, {
    profile: "code",
    expectJson: false,
    expectCode: true,
    maxTokens: Math.min(12000, Math.max(1200, Number(opts.maxTokens) || 7000)),
    temperature: 0.2,
    timeoutMs: Math.min(
      120000,
      Math.max(30000, Number(opts.timeoutMs) || 90000),
    ),
    maxModelTries: 1,
    order,
  });
  if (!raw || !String(raw).trim()) return null;
  let source = String(raw).trim();
  const fence = source.match(
    /^```(?:javascript|js|css|html|sql)?\s*\r?\n([\s\S]*?)\r?\n```$/i,
  );
  if (fence) source = fence[1].trim();
  return source || null;
}

export const __aiModelTestHooks = {
  isUnusableOutput,
  pollinationsClassify,
  pollinationsPriority,
  selectPollinationsModels,
  cloudflarePriority,
  codeProviderOrders: CODE_PROVIDER_ORDERS,
  normalizeUnderstanding,
};

/* ─── 2.9 Cascade ─── */
// APRÈS — Cloudflare placé après Groq/OpenRouter (rapides, fiables) et
// avant les providers à problèmes, puisque tes tests le montrent stable.
const PROVIDERS = {
  openrouter: callOpenRouter,
  groq: callGroq,
  pollinations: callPollinations,
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
  "openrouter,groq,cerebras,gemini,github,pollinations,nvidia,mistral,cohere,cloudflare"
)
  .split(",")
  .map((s) => s.trim())
  .filter((s) => PROVIDERS[s]);

/**
 * Appel LLM avec cascade complète.
 * @param {Array} messages  messages OpenAI-like
 * @param {Object} opts     { maxTokens, temperature, expectJson, expectCode, timeoutMs,
 *                            allowReasoning, order, profile, maxModelTries }
 */

const SLOT_LIMIT = { gemini: 2, openrouter: 2, pollinations: 2, cloudflare: 2 };
const slots = new Map();
async function withSlot(name, fn) {
  const s = slots.get(name) || { active: 0, queue: [] };
  slots.set(name, s);
  if (s.active >= (SLOT_LIMIT[name] || 1))
    await new Promise((r) => s.queue.push(r));
  s.active++;
  try {
    return await fn();
  } finally {
    s.active--;
    s.queue.shift()?.();
  }
}
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
      expectJson: false,
      expectCode: true,
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

  const deadline =
    Number(opts.totalTimeoutMs) > 0
      ? Date.now() + Number(opts.totalTimeoutMs)
      : Infinity;
  for (const name of chain) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      console.warn(
        `[AiGENT AI] Délai global atteint après ${Number(opts.totalTimeoutMs)} ms; cascade interrompue.`,
      );
      break;
    }
    try {
      console.info(`[AiGENT AI] Tentative fournisseur : ${name}.`);
      const attemptOptions = Number.isFinite(deadline)
        ? { ...o, timeoutMs: Math.max(500, Math.min(o.timeoutMs, remaining)) }
        : o;
      let out;
      if (Number.isFinite(deadline)) {
        let timer;
        const providerBudget = Math.max(500, Math.min(o.timeoutMs, remaining));
        const attemptOptions = { ...o, timeoutMs: providerBudget };
        try {
          out = await Promise.race([
            withSlot(name, () => PROVIDERS[name](messages, attemptOptions)),
            new Promise((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      `Délai fournisseur dépassé (${providerBudget} ms)`,
                    ),
                  ),
                providerBudget,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      } else
        out = await withSlot(name, () =>
          PROVIDERS[name](messages, attemptOptions),
        );
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
    pollinations: !!process.env.POLLINATIONS_API_KEY,
    cerebras: !!process.env.CEREBRAS_API_KEY,
    github: !!process.env.GITHUB_TOKEN,
    cohere: !!process.env.COHERE_API_KEY,
    mistral: !!(process.env.MISTRAL || process.env.MISTRAL_API_KEY),
    nvidia: !!process.env.NVIDIA_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    cloudflare: !!(
      process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_ACCOUNT_ID
    ),
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
const MODEL_PROBES_IN_FLIGHT = new Map();
const HEALTH_TTL = 5 * 60 * 1000;
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
async function pingModel(
  key,
  callFn,
  { ttl = HEALTH_TTL, logFailure = false } = {},
) {
  const cached = MODEL_HEALTH.get(key);
  if (cached && Date.now() - cached.checkedAt < ttl) return cached.ok;
  if (MODEL_PROBES_IN_FLIGHT.has(key)) return MODEL_PROBES_IN_FLIGHT.get(key);
  const probe = (async () => {
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
    } catch (error) {
      if (logFailure) {
        const reason = error.status
          ? `HTTP ${error.status}`
          : String(error.message || "échec réseau");
        console.warn(
          `[AiGENT AI] Ping ${key} refusé : ${reason.slice(0, 140)}.`,
        );
      }
    }
    MODEL_HEALTH.set(key, { ok, checkedAt: Date.now() });
    return ok;
  })();
  MODEL_PROBES_IN_FLIGHT.set(key, probe);
  try {
    return await probe;
  } finally {
    MODEL_PROBES_IN_FLIGHT.delete(key);
  }
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
    "objective": "objectif concret déduit de la demande utilisateur",
    "audience": "public réellement visé, ou public à préciser si la demande ne le dit pas",
    "sector": "secteur réellement déduit, ou général si inconnu",
    "missions": [{"id":"mission-1","label":"mission concrète liée à la demande","enabled":true}],
    "summary": "résumé fidèle et spécifique du besoin"
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

  const json = await callJSON(system, user, {
    maxTokens: 1600,
    profile: "json",
    timeoutMs: 18000,
    totalTimeoutMs: 45000,
    maxModelTries: 1,
    order: [
      "groq",
      "gemini",
      "cohere",
      "mistral",
      "openrouter",
      "pollinations",
      "cloudflare",
    ],
  });
  if (!json?.understanding) return fallbackUnderstanding(message);
  return normalizeUnderstanding(json, message);
}

function isTemplateValue(value) {
  const text = String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr");
  return (
    !text ||
    /^(?:une phrase|un mot-cl[eé]|mot-cl[eé]|\.\.\.|…|n\/a|tbd|à définir|a definir|non pr[eé]cis[eé]|slug|mission concr[eè]te|public r[eé]ellement vis[eé])$/i.test(
      text,
    )
  );
}

function normalizeUnderstanding(raw, message) {
  const u =
    raw.understanding && typeof raw.understanding === "object"
      ? raw.understanding
      : {};
  const fallback = fallbackUnderstanding(message).understanding;
  const objective =
    isTemplateValue(u.objective) ||
    /^assistant intelligent\s*:/i.test(String(u.objective || ""))
      ? fallback.objective
      : String(u.objective).trim().slice(0, 360);
  const audience = isTemplateValue(u.audience)
    ? fallback.audience
    : String(u.audience).trim().slice(0, 180);
  const sector = isTemplateValue(u.sector)
    ? fallback.sector
    : String(u.sector).trim().slice(0, 100);
  const missions = (Array.isArray(u.missions) ? u.missions : [])
    .filter(
      (item) =>
        item && typeof item === "object" && !isTemplateValue(item.label),
    )
    .slice(0, 8)
    .map((item, index) => ({
      id: /^[a-z][a-z0-9_-]{1,48}$/.test(String(item.id || ""))
        ? item.id
        : `mission-${index + 1}`,
      label: String(item.label).trim().slice(0, 140),
      enabled: item.enabled !== false,
    }));
  const summary = isTemplateValue(u.summary)
    ? fallback.summary
    : String(u.summary).trim().slice(0, 500);
  return {
    ...raw,
    understanding: {
      ...u,
      objective,
      audience,
      sector,
      missions: missions.length ? missions : fallback.missions,
      summary,
    },
    suggestedTools: Array.isArray(raw.suggestedTools) ? raw.suggestedTools : [],
    suggestedKnowledge: Array.isArray(raw.suggestedKnowledge)
      ? raw.suggestedKnowledge.filter(
          (item) => item && !isTemplateValue(item.label),
        )
      : [],
    questions: Array.isArray(raw.questions)
      ? raw.questions
          .filter((item) => item && !isTemplateValue(item.question))
          .slice(0, 3)
      : [],
    risks: Array.isArray(raw.risks)
      ? raw.risks.filter((item) => !isTemplateValue(item)).slice(0, 8)
      : [],
    confidence: Number.isFinite(Number(raw.confidence))
      ? Math.max(0, Math.min(1, Number(raw.confidence)))
      : 0.4,
  };
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
Tu proposes l'identité de marque d'un assistant à créer. La demande complète de l'utilisateur décrit le produit : elle ne doit JAMAIS être découpée en questions ni transformée en choix de fonctionnalités.
Propose exactement trois directions créatives cohérentes et distinctes pour le nom, la signature, le ton et la personnalité de l'assistant. Chaque choix est une identité complète, pas une question, une fonctionnalité ou un résumé du cahier des charges. Sobriété : pas de superlatifs, pas d'emoji. Le nom est court (1 à 3 mots), mémorisable, sans jeu de mots forcé. Les signatures sont des slogans courts; les personas décrivent la manière de parler, jamais les exigences du produit.

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
  const validOptions = Array.isArray(json?.options)
    ? json.options
        .filter((option) => {
          const name = String(option?.name || "").trim();
          const tagline = String(option?.tagline || "").trim();
          const persona = String(option?.persona || "").trim();
          const words = name.split(/\s+/).filter(Boolean);
          return (
            name &&
            name.length <= 40 &&
            words.length <= 4 &&
            tagline.length <= 130 &&
            persona.length <= 300 &&
            !/[?？]/.test(`${name} ${tagline}`) &&
            !/^(?:quel|quelle|quels|quelles|comment|pourquoi)\b/i.test(name)
          );
        })
        .slice(0, 3)
    : [];
  if (validOptions.length === 3) return { ...json, options: validOptions };
  const base = spec.sector || "Assistant";
  return {
    options: [
      {
        id: "a",
        name: `${cap(base)} Atelier`,
        tagline: "Le suivi clair de chaque intervention",
        tone: ["professionnel", "chaleureux"],
        persona:
          "Il accueille avec assurance, suit le dossier avec méthode et explique chaque étape sans jargon.",
      },
      {
        id: "b",
        name: `${cap(base)} Copilote`,
        tagline: "La bonne information au bon moment",
        tone: ["clair", "direct"],
        persona:
          "Il est concis et réactif, anticipe les prochaines étapes et donne des réponses concrètes.",
      },
      {
        id: "c",
        name: `${cap(base)} Confiance`,
        tagline: "Un accueil attentif, du premier contact à la restitution",
        tone: ["rassurant", "accessible"],
        persona:
          "Il met les personnes à l'aise, reformule les informations importantes et veille à ce que rien ne soit oublié.",
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
  const integrations = computeIntegrations(spec).filter(
    (i) => i.service !== "ai_provider",
  );
  const knowledgeSources = (spec.knowledge || []).map((item, index) => ({
    ...item,
    graphId: `knowledge_${slugify(item.id || item.label || `source-${index + 1}`)}`,
  }));
  const configuredTools = (spec.tools || []).map((tool, index) => {
    const definition = TOOL_CATALOG.find((entry) => entry.id === tool.id);
    return {
      ...tool,
      definition,
      graphId: `tool_${slugify(tool.id || `tool-${index + 1}`)}`,
    };
  });
  const domain =
    `${spec.sector || ""} ${spec.purpose || ""} ${spec.name || ""}`.toLowerCase();
  const education =
    /éduc|pédagog|scol|cours|apprentiss|révision|pronote|élève|professeur|devoir/.test(
      domain,
    );
  const theme = /éduc|scol|cours|apprentiss|révision/.test(domain)
    ? { accent: "#6459d9", core: "#24223f", tint: "#f0efff" }
    : /immobilier|logement|maison|habitat/.test(domain)
      ? { accent: "#328276", core: "#1f3b39", tint: "#eaf6f3" }
      : /emploi|carrière|recrut|cv/.test(domain)
        ? { accent: "#b56a35", core: "#392b22", tint: "#fbf1e8" }
        : /voyage|tourisme|séjour/.test(domain)
          ? { accent: "#3475a8", core: "#1f3042", tint: "#edf5fb" }
          : { accent: "#655bd8", core: "#24223f", tint: "#f0efff" };
  const deterministic = {
    theme,
    nodes: [
      {
        id: "user",
        label: spec.audience || "Utilisateur",
        description: "Point d’entrée",
        kind: "actor",
      },
      {
        id: "interface",
        label:
          INTERFACE_KINDS.find((i) => i.id === spec.interface?.kind)?.label ||
          "Interface",
        description: "Canal d’accès configuré",
        kind: "surface",
      },
      {
        id: "agent",
        label: spec.name || "AiGENT",
        description: `LLM · ${(spec.tools || []).length} outil(s) · ${(spec.knowledge || []).length} source(s)`,
        kind: "core",
      },
      ...knowledgeSources.map((item) => ({
        id: item.graphId,
        label: item.label || item.type || "Source documentaire",
        description: `${item.type || "source"} · ${item.status || "configurée"}`,
        kind: "data",
        status: item.status,
      })),
      ...configuredTools.map((tool) => ({
        id: tool.graphId,
        label: tool.definition?.label || tool.id || "Outil",
        description: `${tool.definition?.category || "capacité"} · ${tool.status || "configurée"}`,
        kind: "tools",
        status: tool.status,
      })),
      ...(education
        ? [
            {
              id: "school_courses",
              label: "Cours & leçons",
              description: "Supports, matières et ressources",
              kind: "data",
            },
            {
              id: "school_assignments",
              label: "Devoirs",
              description: "Consignes, échéances et rendu",
              kind: "data",
            },
            {
              id: "school_assessments",
              label: "DS & évaluations",
              description: "Sujets, réponses et correction",
              kind: "data",
            },
            {
              id: "school_grades",
              label: "Notes",
              description: "Résultats et appréciations",
              kind: "data",
            },
            {
              id: "school_progress",
              label: "Progression",
              description: "Compétences acquises et lacunes",
              kind: "data",
            },
            {
              id: "school_students",
              label: "Dossier élève",
              description: "Classe, matières et préférences",
              kind: "tools",
            },
            {
              id: "school_teacher",
              label: "Espace professeur",
              description: "Publication et suivi pédagogique",
              kind: "service",
              external: true,
            },
            {
              id: "school_alerts",
              label: "Notifications",
              description: "Échéances et résultats importants",
              kind: "service",
              external: true,
            },
          ]
        : []),
      ...integrations.map((i) => ({
        id: `svc_${i.service}`,
        label: i.label,
        description: i.reason || i.service,
        kind: "service",
        external: true,
      })),
    ],
    edges: [
      { from: "user", to: "interface" },
      { from: "interface", to: "agent" },
      ...knowledgeSources.map((item) => ({
        from: "agent",
        to: item.graphId,
        label: "READ",
      })),
      ...configuredTools.map((tool) => ({
        from: "agent",
        to: tool.graphId,
        label: "EXEC",
      })),
      ...(education
        ? [
            ...[
              "school_courses",
              "school_assignments",
              "school_assessments",
              "school_grades",
              "school_progress",
            ].map((to) => ({ from: "agent", to, label: "READ / WRITE" })),
            { from: "agent", to: "school_students", label: "CONTEXT" },
            { from: "agent", to: "school_teacher", label: "PUBLISH" },
            { from: "agent", to: "school_alerts", label: "NOTIFY" },
          ]
        : []),
      ...integrations.map((integration) => {
        const sourceTool = configuredTools.find(
          (tool) => tool.definition?.service === integration.service,
        );
        return {
          from: sourceTool?.graphId || "agent",
          to: `svc_${integration.service}`,
          label: "API",
          external: true,
        };
      }),
    ],
    caption: `${integrations.length} service${integrations.length === 1 ? "" : "s"} externe${integrations.length === 1 ? "" : "s"} · ${configuredTools.length} outil${configuredTools.length === 1 ? "" : "s"} · ${knowledgeSources.length} source${knowledgeSources.length === 1 ? "" : "s"} de connaissance.`,
    flow: education
      ? [
          {
            step: "Demande pédagogique",
            detail:
              "L’élève ou le professeur précise matière, classe et objectif.",
          },
          {
            step: "Contexte élève",
            detail: "Vérification du profil, du niveau et des préférences.",
          },
          {
            step: "Cours & ressources",
            detail: "Recherche dans les leçons et supports autorisés.",
          },
          {
            step: "Devoirs & échéances",
            detail: "Repérage des consignes et travaux à rendre.",
          },
          {
            step: "Révision ciblée",
            detail: "Exercices et QCM adaptés aux notions à renforcer.",
          },
          {
            step: "Évaluation",
            detail: "Correction guidée et explication des erreurs.",
          },
          {
            step: "Notes & progression",
            detail: "Mise à jour du suivi après validation.",
          },
          {
            step: "Partage sécurisé",
            detail: "Synthèse à l’élève et notification au professeur.",
          },
        ]
      : [
          {
            step: "Demande reçue",
            detail: "L’utilisateur formule son besoin.",
          },
          {
            step: "Qualification",
            detail: "Le besoin est classé selon les missions configurées.",
          },
          {
            step: "Contexte",
            detail:
              "Les informations déjà fournies sont rapprochées de la demande.",
          },
          {
            step: "Contrôle",
            detail: "Les consignes et limites de l’AiGENT sont appliquées.",
          },
          {
            step: (spec.knowledge || []).length
              ? "Recherche documentaire"
              : "Vérification des informations",
            detail: (spec.knowledge || []).length
              ? "Consultation des sources de connaissance connectées."
              : "Repérage des précisions nécessaires avant de poursuivre.",
          },
          {
            step: (spec.tools || []).length
              ? "Action autorisée"
              : "Préparation de la réponse",
            detail: (spec.tools || []).length
              ? "Sélection d’un outil déclaré et autorisé."
              : "Organisation des éléments utiles sans action externe.",
          },
          {
            step: "Contrôle du résultat",
            detail:
              "La réponse est vérifiée au regard de la demande et du contexte.",
          },
          {
            step: "Réponse & suivi",
            detail:
              "L’utilisateur reçoit une réponse claire et les prochaines étapes utiles.",
          },
        ],
  };
  return deterministic;
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
