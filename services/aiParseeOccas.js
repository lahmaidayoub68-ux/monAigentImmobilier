//================ AI PARSEE — MON AIGENT OCCASION (v2) ====================//
// Cascade IA : Cerebras (primaire) → GitHub Models / GPT-4.1 (fallback 1)
// → NVIDIA NIM / Llama-3.3-70b (fallback 2).
//
// ─────────────────────────────────────────────────────────────────────────
// PRINCIPE DE LA V2 (fix des bugs "l'IA se perd / oublie / boucle") :
// On sépare STRICTEMENT trois responsabilités qui étaient mélangées dans
// un seul prompt géant avant :
//
//   1) EXTRACTION  (extractCriteria)   — l'IA lit le message libre et sort
//      UNIQUEMENT les champs qu'elle y trouve, sans réfléchir à "la suite".
//      Peut extraire PLUSIEURS critères d'un coup.
//
//   2) FLUX / ORDRE (computeNextStep)  — 100% code déterministe. Ce n'est
//      JAMAIS l'IA qui décide quelle est la prochaine question : c'est une
//      checklist en dur (BUYER_STEPS / SELLER_STEPS) parcourue dans l'ordre.
//      → l'IA ne peut plus "oublier" une question ou en reposer une déjà
//        répondue, puisqu'elle ne gère plus cet état.
//
//   3) FORMULATION (generatePhrasing)  — l'IA transforme une instruction
//      déterministe ("demande le kilométrage max, ton acheteur") en une
//      phrase chaleureuse. Si l'IA plante, un fallback texte garanti prend
//      le relais : le tunnel ne s'arrête donc JAMAIS.
// ─────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

/* ─── CLIENTS ─────────────────────────────────────────────────────────────── */
const cerebras = process.env.CEREBRAS_API_KEY
  ? new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY })
  : null;

const CEREBRAS_MODELS = ["gpt-oss-120b"];

// ── Circuit breaker : si Cerebras est down, on arrête de le retenter en boucle
// pendant quelques minutes (évite d'ajouter 4 appels morts à chaque requête).
let cerebrasDownUntil = 0;
const CEREBRAS_COOLDOWN_MS = 5 * 60 * 1000;

/* ─── HELPERS NUMÉRIQUES / JSON ──────────────────────────────────────────── */
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

function extractJSON(text) {
  if (!text) return null;
  const cleaned = text
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

/* ─── CASCADE LLM : CEREBRAS → GITHUB MODELS → NVIDIA ───────────────────── */

async function callLLM(messages, maxTokens = 500) {
  if (cerebras && Date.now() > cerebrasDownUntil) {
    let anySuccess = false;
    for (const model of CEREBRAS_MODELS) {
      try {
        const res = await cerebras.chat.completions.create({
          model,
          messages,
          temperature: 0.25,
          max_completion_tokens: maxTokens,
        });
        const text = res?.choices?.[0]?.message?.content || "";
        if (text.trim()) {
          anySuccess = true;
          return text;
        }
      } catch (e) {
        console.warn(
          `⚠️ [OCCAS AI] Cerebras ${model} FAILED:`,
          e?.message?.slice(0, 100),
        );
      }
    }
    if (!anySuccess) {
      cerebrasDownUntil = Date.now() + CEREBRAS_COOLDOWN_MS;
      console.warn(
        `⚠️ [OCCAS AI] Cerebras mis en pause ${CEREBRAS_COOLDOWN_MS / 1000}s (tous modèles KO)`,
      );
    }
  }

  // ── Groq : fallback rapide et stable, déjà utilisé ailleurs dans l'écosystème ──
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          temperature: 0.25,
          max_tokens: maxTokens,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const text = d?.choices?.[0]?.message?.content || "";
        if (text.trim()) return text;
      } else {
        console.warn(`⚠️ [OCCAS AI] Groq FAILED: ${r.status}`);
      }
    }
  } catch (e) {
    console.warn("⚠️ [OCCAS AI] Groq FAILED:", e?.message?.slice(0, 100));
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      const client = ModelClient(
        "https://models.github.ai/inference",
        new AzureKeyCredential(token),
      );
      const response = await client.path("/chat/completions").post({
        body: {
          messages,
          model: "openai/gpt-4.1",
          max_tokens: maxTokens,
          temperature: 0.3,
        },
      });
      if (!isUnexpected(response)) {
        const text = response.body?.choices?.[0]?.message?.content || "";
        if (text.trim()) return text;
      }
    }
  } catch (e) {
    console.warn(
      "⚠️ [OCCAS AI] GitHub Models FAILED:",
      e?.message?.slice(0, 100),
    );
  }

  try {
    const key = process.env.NVIDIA_API_KEY;
    if (key) {
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
      if (r.ok) {
        const d = await r.json();
        const text = d?.choices?.[0]?.message?.content || "";
        if (text.trim()) return text;
      }
    }
  } catch (e) {
    console.warn("⚠️ [OCCAS AI] NVIDIA FAILED:", e?.message?.slice(0, 100));
  }

  console.error("❌ [OCCAS AI] Tous les providers ont échoué");
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   1) CHECKLIST DÉTERMINISTE — LE CŒUR DU FIX
   ════════════════════════════════════════════════════════════════════════ */

// Acheteur : zone, budget, kilométrage, modèle (optionnel), carburant+boîte (popup)
export const BUYER_STEPS = [
  { field: "ville", kind: "text" },
  { field: "budgetMax", kind: "text" },
  { field: "kilometrageMax", kind: "text" },
  { field: "marqueModele", kind: "text", optional: true },
  { field: "carburant", kind: "popup", popup: "carburant" },
];

// Vendeur : zone, marque/modèle, année, carburant+boîte (popup), kilométrage,
// prix de vente, puis état (popup), photos (popup), carvertical (popup)
export const SELLER_STEPS = [
  { field: "ville", kind: "text" },
  { field: "marqueModele", kind: "text" },
  { field: "annee", kind: "text" },
  { field: "carburant", kind: "popup", popup: "carburant" },
  { field: "kilometrage", kind: "text" },
  { field: "budgetMin", kind: "text" },
  { field: "etatZones", kind: "popup", popup: "etat" },
  { field: "imagesbien", kind: "popup", popup: "images" },
  { field: "carverticalDecided", kind: "popup", popup: "carvertical" },
];

function isFieldSet(field, sc, role) {
  switch (field) {
    case "ville":
      return !!sc.ville;
    case "budgetMax": // acheteur = budget d'achat
      return sc.budgetMax != null || sc.budgetMin != null;
    case "budgetMin": // vendeur = prix de vente
      return sc.budgetMin != null || sc.budgetMax != null;
    case "kilometrageMax":
      return sc.kilometrageMax != null;
    case "kilometrage":
      return sc.kilometrage != null;
    case "marqueModele":
      // Vendeur : marque ET modèle exigés (c'est SON véhicule, précis).
      // Acheteur : l'un ou l'autre suffit (préférence indicative, optionnelle).
      return role === "seller"
        ? !!(sc.marque && sc.modele)
        : !!(sc.marque || sc.modele);
    case "annee":
      return sc.annee != null;
    case "carburant":
      return !!sc.carburant && !!sc.boite;
    case "etatZones":
      return !!(sc.etatZones && Object.keys(sc.etatZones).length > 0);
    case "imagesbien":
      return Array.isArray(sc.imagesbien);
    case "carverticalDecided":
      return sc.carverticalDecided === true;
    default:
      return true;
  }
}

/**
 * Détermine, en code pur (aucune IA), la prochaine étape du tunnel.
 * Retourne null si TOUT est renseigné → il est temps du récapitulatif.
 */
export function computeNextStep(role, sc) {
  const steps = role === "seller" ? SELLER_STEPS : BUYER_STEPS;
  for (const step of steps) {
    if (
      step.optional &&
      step.field === "marqueModele" &&
      sc.marqueModeleSkipped
    )
      continue;
    if (!isFieldSet(step.field, sc, role)) return step;
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   2) EXTRACTION — un seul job : lire le message, sortir ce qu'il contient
   ════════════════════════════════════════════════════════════════════════ */

const EXTRACTION_SCHEMA = `{
  "ville": null,
  "marque": null,
  "modele": null,
  "annee": null,
  "carburant": null,
  "boite": null,
  "kilometrage": null,
  "kilometrageMax": null,
  "budgetMin": null,
  "budgetMax": null,
  "toleranceKm": null,
  "marqueModeleIndifferent": false
}`;

function buildExtractionPrompt(role) {
  return `Tu es un extracteur d'informations. Tu ne discutes pas, tu ne poses pas de question, tu extrais UNIQUEMENT ce qui est explicitement écrit dans le message pour un contexte de ${role === "seller" ? "VENTE" : "ACHAT"} de véhicule d'occasion.

RÈGLES STRICTES :
- N'invente RIEN, ne déduis RIEN. Si une info n'est pas explicitement présente, laisse null.
- Le message peut contenir PLUSIEURS informations en même temps : extrais-les TOUTES, pas seulement la première.
- Kilométrage : ${role === "seller" ? 'utilise "kilometrage" (kilométrage actuel du véhicule vendu)' : 'utilise "kilometrageMax" (kilométrage maximum accepté par l\'acheteur)'}.
- Prix : ${role === "seller" ? 'utilise "budgetMin" (prix de vente souhaité)' : 'utilise "budgetMax" (budget maximum de l\'acheteur). Si une fourchette est donnée ("entre 10k et 18k"), remplis budgetMin ET budgetMax.'}
- "15k" / "15 000€" / "15000 euros" → 15000.
- Carburant : reconnaît essence / diesel / hybride / électrique / GPL.
- Boîte : reconnaît manuelle / automatique.
- Si l'utilisateur dit "peu importe", "n'importe quel modèle", "pas de préférence" à propos de la marque/du modèle → marqueModeleIndifferent: true.

Réponds UNIQUEMENT avec ce JSON strict, sans texte autour, sans commentaire :
${EXTRACTION_SCHEMA}`;
}

function mergeExtractedCriteria(existing, incoming, role) {
  const merged = { ...existing };
  if (!incoming || typeof incoming !== "object") return merged;

  for (const [key, val] of Object.entries(incoming)) {
    if (val === null || val === undefined || val === "") continue;

    if (key === "carburant") {
      const t = String(val).toLowerCase().trim();
      if (t.includes("elect")) merged.carburant = "electrique";
      else if (t.includes("hybrid")) merged.carburant = "hybride";
      else if (t.includes("diesel") || t.includes("gasoil"))
        merged.carburant = "diesel";
      else if (t.includes("gpl")) merged.carburant = "gpl";
      else if (t.includes("essence")) merged.carburant = "essence";
      continue;
    }
    if (key === "boite") {
      const t = String(val).toLowerCase().trim();
      if (t.includes("auto")) merged.boite = "automatique";
      else if (t.includes("man")) merged.boite = "manuelle";
      continue;
    }
    if (key === "marqueModeleIndifferent") {
      if (val === true) merged.marqueModeleSkipped = true;
      continue;
    }
    if (
      [
        "budgetMin",
        "budgetMax",
        "kilometrageMax",
        "kilometrage",
        "annee",
        "toleranceKm",
      ].includes(key)
    ) {
      const n = normalizeNumber(val);
      if (n !== null) merged[key] = n;
      continue;
    }
    if (typeof val === "string" && val.trim()) merged[key] = val.trim();
  }

  // Symétrie vendeur : prix unique → budgetMin = budgetMax = prix
  if (role === "seller") {
    if (merged.budgetMin != null && merged.budgetMax == null)
      merged.budgetMax = merged.budgetMin;
    if (merged.budgetMax != null && merged.budgetMin == null)
      merged.budgetMin = merged.budgetMax;
    if (merged.budgetMax != null) merged.prix = merged.budgetMax;
  }
  // Symétrie acheteur inverse (au cas où le modèle sort budgetMin par erreur)
  if (role === "buyer") {
    if (merged.budgetMax == null && merged.budgetMin != null)
      merged.budgetMax = merged.budgetMin;
  }

  return merged;
}

/**
 * Extrait les critères d'un message libre et les fusionne avec l'existant.
 * Ne gère JAMAIS la question suivante — uniquement l'extraction.
 */
// ── Filet de secours regex : couvre les cas les plus fréquents quand tous
// les providers IA sont indisponibles, pour que le tunnel avance quand même.
function heuristicExtract(userMessage, role) {
  const msg = (userMessage || "").toLowerCase();
  const out = {};

  // Prix / budget : "15000", "15 000€", "15k", "entre 10k et 18k"
  const priceMatches = [
    ...msg.matchAll(/(\d[\d\s]{2,7})\s?(k|000)?\s?(?:€|eur|euros?)?/g),
  ]
    .map((m) => normalizeNumber(m[0]))
    .filter((n) => n && n >= 500 && n <= 500000);
  if (priceMatches.length === 2) {
    if (role === "seller") {
      out.budgetMin = Math.min(...priceMatches);
      out.budgetMax = Math.max(...priceMatches);
    } else {
      out.budgetMin = Math.min(...priceMatches);
      out.budgetMax = Math.max(...priceMatches);
    }
  } else if (priceMatches.length === 1) {
    if (role === "seller") out.budgetMin = priceMatches[0];
    else out.budgetMax = priceMatches[0];
  }

  // Kilométrage : "80000 km", "80 000km", "80k km"
  const kmMatch = msg.match(/(\d[\d\s]{2,7})\s?(k)?\s?(?:km|kms|kilomètres?)/);
  if (kmMatch) {
    const n = normalizeNumber(kmMatch[1] + (kmMatch[2] || ""));
    if (n !== null) {
      if (role === "seller") out.kilometrage = n;
      else out.kilometrageMax = n;
    }
  }

  // Année : un nombre à 4 chiffres plausible (1990-2027)
  const yearMatch = msg.match(/\b(19[9]\d|20[0-2]\d)\b/);
  if (yearMatch) out.annee = parseInt(yearMatch[1], 10);

  // Carburant
  if (/électr/.test(msg)) out.carburant = "electrique";
  else if (/hybrid/.test(msg)) out.carburant = "hybride";
  else if (/diesel|gasoil/.test(msg)) out.carburant = "diesel";
  else if (/\bgpl\b/.test(msg)) out.carburant = "gpl";
  else if (/essence/.test(msg)) out.carburant = "essence";

  // Boîte
  if (/bo[iî]te\s*auto|automatique/.test(msg)) out.boite = "automatique";
  else if (/bo[iî]te\s*man|manuelle/.test(msg)) out.boite = "manuelle";

  // Indifférence marque/modèle
  if (/peu importe|n'importe quel|pas de préférence|indifférent/.test(msg))
    out.marqueModeleIndifferent = true;

  return out;
}

export async function extractCriteria(userMessage, role, existingCriteria) {
  const prompt = buildExtractionPrompt(role);
  const aiText = await callLLM(
    [
      { role: "system", content: prompt },
      { role: "user", content: userMessage },
    ],
    350,
  );

  if (aiText) {
    const raw = extractJSON(aiText);
    if (raw) return mergeExtractedCriteria(existingCriteria, raw, role);
  }

  // ── IA totalement indisponible : on ne bloque pas le tunnel, on extrait
  // ce qu'on peut par heuristique plutôt que de perdre le message de l'utilisateur.
  console.warn(
    "⚠️ [OCCAS AI] Extraction IA indisponible, fallback heuristique utilisé",
  );
  return mergeExtractedCriteria(
    existingCriteria,
    heuristicExtract(userMessage, role),
    role,
  );
}

/* ════════════════════════════════════════════════════════════════════════
   3) FORMULATION — habille une instruction déterministe en phrase naturelle
   ════════════════════════════════════════════════════════════════════════ */

const FIELD_LABELS = {
  buyer: {
    ville: "la ville ou la zone où l'acheteur souhaite trouver son véhicule",
    budgetMax: "le budget d'achat maximum de l'acheteur",
    kilometrageMax: "le kilométrage maximum accepté par l'acheteur",
    marqueModele:
      "si l'acheteur a une marque/modèle précis en tête, ou s'il n'a pas de préférence",
  },
  seller: {
    ville: "la ville où se trouve le véhicule à vendre",
    marqueModele: "la marque et le modèle du véhicule à vendre",
    annee: "l'année de mise en circulation du véhicule",
    kilometrage: "le kilométrage ACTUEL du véhicule (pas un maximum)",
    budgetMin: "le PRIX DE VENTE souhaité (jamais parler de 'budget' ici)",
  },
};

const POPUP_LABELS = {
  carburant:
    "un sélecteur visuel pour choisir la motorisation (carburant) puis le type de boîte de vitesses",
  etat: "un schéma interactif de la voiture pour qualifier l'état zone par zone (carrosserie, intérieur, mécanique...)",
  images: "une interface pour ajouter des photos du véhicule",
  carvertical:
    "la possibilité de joindre un rapport CarVertical (historique du véhicule) pour rassurer les acheteurs",
};

function buildPhrasingPrompt(role, sc, event) {
  const isSeller = role === "seller";
  const toneBlock = isSeller
    ? `Tu t'adresses à un VENDEUR à propos DE SON véhicule. Parle toujours "de votre véhicule", jamais de "budget" (dis "prix de vente"). Exemple de ton : "Quel est le kilométrage actuel de votre véhicule ?"`
    : `Tu t'adresses à un ACHETEUR à propos de SA RECHERCHE. Formule TOUJOURS du point de vue de sa recherche/ses critères, jamais comme si le véhicule lui appartenait. Exemple de ton : "Quel kilométrage maximum acceptez-vous ?" ou "Quel est votre budget ?" — jamais "quel est le kilométrage de votre voiture".`;

  let task = "";
  if (event.type === "question") {
    const label = FIELD_LABELS[role][event.field] || event.field;
    task = `Pose UNE SEULE question courte et naturelle pour connaître : ${label}.
Ne pose aucune autre question. Ne répète pas les infos déjà connues sous forme de question. Une phrase de transition brève est possible avant, mais reste concis (2 phrases max).`;
  } else if (event.type === "popup") {
    const label = POPUP_LABELS[event.popup] || event.popup;
    task = `Annonce en 1 à 2 phrases chaleureuses que tu vas maintenant lui présenter ${label}. Ne pose AUCUNE question dans ce message, l'interface va s'afficher juste après.`;
  } else if (event.type === "recap") {
    task = isSeller
      ? `Annonce en 1-2 phrases que toutes les informations sont réunies et que tu vas lui montrer un récapitulatif de son annonce avant publication.`
      : `Annonce en 1-2 phrases que tous les critères de recherche sont réunis et que tu vas lui montrer un récapitulatif avant de lancer la recherche.`;
  } else if (event.type === "match_intro") {
    if (isSeller) {
      task = event.hasMatches
        ? `Annonce avec enthousiasme que l'annonce vient d'être publiée et que tu as trouvé des acheteurs compatibles à lui présenter.`
        : `Annonce avec bienveillance que l'annonce a été publiée mais qu'aucun acheteur ne correspond parfaitement pour l'instant ; rassure-le, un profil compatible peut apparaître bientôt.`;
    } else {
      task = event.hasMatches
        ? `Annonce avec enthousiasme que tu as trouvé des véhicules compatibles avec sa recherche.`
        : `Explique avec empathie qu'aucun véhicule ne correspond parfaitement aux critères actuels, et propose 2-3 pistes concrètes (élargir le budget, le rayon, le kilométrage ou l'année).`;
    }
  } else if (event.type === "modify_prompt") {
    task = `Demande gentiment ce que la personne souhaite modifier dans les informations déjà données.`;
  }

  const known = Object.entries(sc)
    .filter(
      ([k, v]) =>
        !["intent", "marqueModeleSkipped"].includes(k) &&
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    )
    .map(([k, v]) => `${k} = ${typeof v === "object" ? "…" : v}`)
    .join(", ");

  return `Tu es un conseiller automobile expert, chaleureux, jamais robotique, jamais répétitif.

${toneBlock}

Informations déjà connues (ne les redemande jamais) : ${known || "aucune pour l'instant"}.

TÂCHE : ${task}

Réponds UNIQUEMENT avec le texte du message, sans JSON, sans guillemets autour, sans préambule du type "Voici".`;
}

function fallbackPhrase(role, sc, event) {
  const isSeller = role === "seller";
  if (event.type === "question") {
    const FALLBACKS = {
      buyer: {
        ville: "Dans quelle ville ou zone recherchez-vous votre véhicule ?",
        budgetMax: "Quel est votre budget d'achat ?",
        kilometrageMax: "Quel kilométrage maximum acceptez-vous ?",
        marqueModele:
          "Avez-vous une marque ou un modèle précis en tête ? (vous pouvez aussi me dire « peu importe »)",
      },
      seller: {
        ville: "Dans quelle ville se trouve votre véhicule ?",
        marqueModele: "Quelle est la marque et le modèle de votre véhicule ?",
        annee: "Quelle est son année de mise en circulation ?",
        kilometrage: "Quel est le kilométrage actuel de votre véhicule ?",
        budgetMin: "À quel prix souhaitez-vous vendre votre véhicule ?",
      },
    };
    return (
      FALLBACKS[role]?.[event.field] || "Pouvez-vous m'en dire un peu plus ?"
    );
  }
  if (event.type === "popup") {
    const FALLBACKS = {
      carburant:
        "Je vous propose de choisir la motorisation et la boîte de vitesses ci-dessous.",
      etat: "Je vous propose de qualifier l'état de votre véhicule zone par zone sur ce schéma.",
      images:
        "Ajoutons maintenant quelques photos pour valoriser votre annonce.",
      carvertical:
        "Souhaitez-vous joindre un rapport CarVertical pour rassurer les futurs acheteurs ?",
    };
    return FALLBACKS[event.popup] || "Continuons.";
  }
  if (event.type === "recap") {
    return isSeller
      ? "Toutes les informations sont réunies ! Voici l'aperçu de votre annonce avant publication."
      : "Tous vos critères sont réunis. Voici le récapitulatif de votre recherche avant de lancer le matching.";
  }
  if (event.type === "match_intro") {
    if (isSeller) {
      return event.hasMatches
        ? "Votre annonce est publiée ! Voici les acheteurs les plus compatibles."
        : "Votre annonce est publiée. Aucun acheteur ne correspond parfaitement pour le moment, nous vous préviendrons dès qu'un profil compatible apparaît.";
    }
    return event.hasMatches
      ? "Voici les véhicules les plus compatibles avec votre recherche."
      : "Aucun véhicule ne correspond parfaitement à vos critères actuels. Vous pouvez élargir le budget, le rayon ou le kilométrage.";
  }
  if (event.type === "modify_prompt")
    return "Bien sûr, dites-moi ce que vous souhaitez modifier.";
  return "Je vous écoute.";
}

/**
 * Habille une étape déterministe en message naturel. Ne modifie JAMAIS
 * les critères. Garantie de ne jamais retourner de texte vide (fallback).
 */
export async function generatePhrasing(role, sc, event) {
  try {
    const prompt = buildPhrasingPrompt(role, sc, event);
    const aiText = await callLLM(
      [
        { role: "system", content: prompt },
        { role: "user", content: "Génère le message." },
      ],
      180,
    );
    if (aiText && aiText.trim()) {
      return aiText.trim().replace(/^"|"$/g, "");
    }
  } catch (e) {
    console.warn("⚠️ [OCCAS AI] Phrasing FAILED:", e?.message?.slice(0, 100));
  }
  return fallbackPhrase(role, sc, event);
}

/* ════════════════════════════════════════════════════════════════════════
   MISE EN RELATION — message de contact (inchangé, fonctionnait bien)
   ════════════════════════════════════════════════════════════════════════ */
export async function generateContactMessage(
  senderRole,
  senderCriteria,
  targetProfile,
) {
  const isSenderBuyer = senderRole === "buyer";
  const prompt = `Tu es un conseiller automobile expert. Rédige un message de prise de contact professionnel, court (5-7 lignes), pour une mise en relation entre un acheteur et un vendeur de véhicule d'occasion.

ÉMETTEUR : ${isSenderBuyer ? "Acheteur" : "Vendeur"}
${
  isSenderBuyer
    ? `Recherche : ${senderCriteria.marque || ""} ${senderCriteria.modele || ""} — ${senderCriteria.ville || "N/A"} — budget max ${senderCriteria.budgetMax ? senderCriteria.budgetMax.toLocaleString("fr-FR") + " €" : "N/A"}`
    : `Vend : ${senderCriteria.marque || ""} ${senderCriteria.modele || ""} (${senderCriteria.annee || "N/A"}) — ${senderCriteria.kilometrage || "N/A"} km — ${senderCriteria.prix ? senderCriteria.prix.toLocaleString("fr-FR") + " €" : "N/A"}`
}

DESTINATAIRE :
${
  isSenderBuyer
    ? `Véhicule : ${targetProfile.marque || ""} ${targetProfile.modele || ""} à ${targetProfile.ville} — ${targetProfile.prix || "N/A"} € — Compatibilité ${targetProfile.compatibility}%`
    : `Recherche : ${targetProfile.marque || ""} ${targetProfile.modele || ""} — budget max ${targetProfile.budgetMax || "N/A"} € — Compatibilité ${targetProfile.compatibility}%`
}

Consignes : commence par "Bonjour,", mentionne le point commun clé, invite à échanger, pas de formule creuse. Réponds UNIQUEMENT avec le texte du message.`;

  const aiText = await callLLM(
    [
      { role: "system", content: prompt },
      { role: "user", content: "Génère le message de mise en relation." },
    ],
    280,
  );

  if (!aiText) {
    return isSenderBuyer
      ? `Bonjour,\n\nVotre véhicule à ${targetProfile.ville} correspond à ma recherche. Seriez-vous disponible pour échanger ?\n\nCordialement.`
      : `Bonjour,\n\nVotre recherche correspond à mon véhicule à ${senderCriteria.ville}. Je serais ravi d'échanger avec vous.\n\nCordialement.`;
  }
  return aiText.trim();
}

/* ════════════════════════════════════════════════════════════════════════
   PHASE RÉSULTATS — comparaison / mise en relation / analyse marché
   (inchangé dans l'esprit, toujours découplé du tunnel de collecte)
   ════════════════════════════════════════════════════════════════════════ */
export function detectResultsIntent(userMessage) {
  const msg = (userMessage || "").toLowerCase().trim();

  if (
    /mise en relation|contact|contacter|envoyer un message|écrire à|joindre/i.test(
      msg,
    )
  )
    return "contact";

  if (
    /modif|chang|adjust|revoir|reprendre|nouveau|différent|autre|élargir|réduire|budget|kilométr|km|carburant|boîte|boite|prix|ville|rayon|année/i.test(
      msg,
    )
  )
    return "modify_criteria";

  if (
    /marché|tendance|analyse|évolution|prix|secteur|cote|décote|investissement/i.test(
      msg,
    )
  )
    return "market_analysis";

  if (
    /compar|meilleur|lequel|priorité|classer|rang|différence entre|vs\b|versus/i.test(
      msg,
    )
  )
    return "compare";

  if (
    /détail|plus d'info|dis-moi|parle-moi|ce profil|cette voiture|cet acheteur/i.test(
      msg,
    )
  )
    return "detail";

  return "general";
}

function buildResultsPrompt(role, sc, matches, userMessage, intent) {
  const topMatches = (matches || []).slice(0, 5);
  const isBuyer = role === "buyer";

  const criteriaLines = isBuyer
    ? [
        sc.ville && `Zone : ${sc.ville}`,
        sc.budgetMax && `Budget max : ${sc.budgetMax} €`,
        sc.carburant && `Carburant : ${sc.carburant}`,
        sc.kilometrageMax && `Km max : ${sc.kilometrageMax}`,
      ].filter(Boolean)
    : [
        sc.ville && `Zone du véhicule : ${sc.ville}`,
        sc.marque && `${sc.marque} ${sc.modele || ""}`,
        sc.prix && `Prix : ${sc.prix} €`,
      ].filter(Boolean);

  let intentInstruction = "";
  if (intent === "contact") {
    intentInstruction = `INTENTION : MISE EN RELATION. Demande QUEL profil contacter parmi la liste (numérotée). Le système gère l'envoi automatiquement, ne dis jamais que tu ne peux pas.`;
  } else if (intent === "modify_criteria") {
    intentInstruction = `INTENTION : MODIFICATION. Récapitule les critères actuels clairement puis demande ce qu'il veut ajuster.`;
  } else if (intent === "market_analysis") {
    intentInstruction = `INTENTION : ANALYSE MARCHÉ. Analyse la cote/positionnement des annonces (prix vs kilométrage vs année), donne une recommandation chiffrée et concrète.`;
  } else if (intent === "compare") {
    intentInstruction = `INTENTION : COMPARAISON. Compare objectivement les profils (prix, km, état, compatibilité) et recommande le meilleur avec justification.`;
  } else {
    intentInstruction = `INTENTION : CONSEIL GÉNÉRAL. Réponds avec expertise en t'appuyant sur les données réelles.`;
  }

  return `Tu es un conseiller automobile expert de haut niveau. Un ${isBuyer ? "acheteur" : "vendeur"} vient de recevoir ses résultats de matching.

PROFIL :
${criteriaLines.map((l) => `  - ${l}`).join("\n") || "  (incomplet)"}

RÉSULTATS (${topMatches.length}) :
${JSON.stringify(topMatches, null, 2)}

MESSAGE UTILISATEUR : "${userMessage}"

${intentInstruction}

RÈGLES : maximum 4 phrases sauf comparaison détaillée, jamais de répétition, toujours factuel avec les vraies données.

Réponds UNIQUEMENT avec ce JSON :
{ "message": "ta réponse", "intent": "${intent}" }`.trim();
}

export async function aiResultsChat(
  userMessage,
  existingCriteria = {},
  context = {},
) {
  const role = context.role || existingCriteria.intent || "buyer";
  const matches = Array.isArray(context.matchingProfiles)
    ? context.matchingProfiles
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
    550,
  );

  if (!aiText)
    return {
      message: "Je suis à votre disposition pour analyser ces annonces.",
      intent: "general",
    };

  const raw = extractJSON(aiText);
  if (!raw) return { message: aiText.trim(), intent };

  return {
    message: raw?.message?.trim() || "Je suis à votre disposition.",
    intent: raw?.intent || intent,
  };
}
