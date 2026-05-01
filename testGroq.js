import "dotenv/config"; //actuel
import OpenAI from "openai";

/* ─── CLIENT MISTRAL UNIQUEMENT ──────────────────────────────────────────── */
// Groq retiré — URL toujours incorrecte selon votre env, Mistral suffit
const mistralClient = new OpenAI({
  apiKey: process.env.MISTRAL,
  baseURL: "https://api.mistral.ai/v1",
  timeout: 12000, // 12s max — si Mistral met plus, on prend le fallback statique
  maxRetries: 0, // pas de retry automatique — on gère nous-mêmes
});

/* ─── HELPERS ─────────────────────────────────────────────────────────────── */
function normalizeNumber(value) {
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
  // Mistral entoure parfois sa réponse de ```json ... ```
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

const UI_KEYS = new Set([
  "triggerProximitePopup",
  "triggerEtatBienPopup",
  "triggerNiveauEnergetiquePopup",
  "triggerImagesPopup",
]);

/* ─── TEXTES STATIQUES — utilisés directement sans passer par l'IA ────────── */
// Ces textes sont retournés TELS QUELS pour les messages internes (post pop-up)
// et comme fallback si Mistral échoue ou timeout.
const STATIC_ANNOUNCE = {
  proximite: (sc) =>
    `${sc.ville || "Votre ville"} enregistrée. Je vais afficher la carte pour sélectionner les commodités de votre quartier.`,

  etatBien: (sc) => {
    const parts = [
      sc.piecesMin
        ? `${sc.piecesMin} pièce${sc.piecesMin > 1 ? "s" : ""}`
        : null,
      sc.surfaceMin ? `${sc.surfaceMin} m²` : null,
      sc.budgetMin ? `${sc.budgetMin.toLocaleString("fr-FR")} €` : null,
    ].filter(Boolean);
    const recap = parts.length ? `(${parts.join(", ")}) ` : "";
    return `Parfait ${recap}— je vais afficher l'interface pour qualifier l'état de votre bien.`;
  },

  niveauEnergetique: (sc) =>
    `État "${sc.etatBien}" enregistré. Je vais afficher le sélecteur DPE — choisissez la lettre de A à G.`,

  imagesbien: () =>
    `DPE enregistré. Je vais afficher l'interface de dépôt de photos — jusqu'à 3 visuels.`,
};

// Textes pour les questions suivantes après chaque pop-up
const STATIC_NEXT_QUESTION = {
  proximite: "Combien de pièces compte votre bien ?",
  etatBien: null, // géré par le pop-up DPE directement
  niveauEnergetique: null, // géré par le pop-up photos directement
  imagesbien: null, // fin du tunnel
};

/* ─── LLM CALL ────────────────────────────────────────────────────────────── */
/**
 * Appelle Mistral avec un timeout de 12s.
 * Retourne le texte brut ou null si timeout/erreur.
 */
async function callLLM(messages, maxTokens = 350) {
  try {
    const res = await mistralClient.chat.completions.create({
      model: "mistral-small-latest",
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    });
    const text = res?.choices?.[0]?.message?.content || "";
    if (text.trim()) {
      console.log("✅ Mistral OK | RAW:", text.slice(0, 100));
      return text;
    }
    console.warn("⚠️ Mistral réponse vide");
    return null;
  } catch (e) {
    console.warn("⚠️ Mistral FAILED:", e?.code || e?.message?.slice(0, 80));
    return null;
  }
}

/* ─── MERGE CRITÈRES ─────────────────────────────────────────────────────── */
function mergeNewCriteria(existing, incoming) {
  if (!incoming || typeof incoming !== "object") return { ...existing };
  const merged = { ...existing };

  for (const [key, val] of Object.entries(incoming)) {
    if (val === null || val === undefined) continue;

    if (key === "intent") {
      const MAP = {
        achat: "buyer",
        acheter: "buyer",
        buy: "buyer",
        buyer: "buyer",
        vente: "seller",
        vendre: "seller",
        sell: "seller",
        seller: "seller",
        // valeurs parasites ignorées
        collecting: null,
        results: null,
      };
      const n = MAP[String(val).toLowerCase().trim()];
      if (n) merged.intent = n;
      continue;
    }

    if (key === "type") {
      const t = String(val).toLowerCase().trim();
      const MAISON = [
        "maison",
        "villa",
        "pavillon",
        "chalet",
        "fermette",
        "mas",
        "bungalow",
      ];
      const APPART = [
        "appartement",
        "appart",
        "studio",
        "loft",
        "duplex",
        "triplex",
        "t1",
        "t2",
        "t3",
        "t4",
        "t5",
        "t6",
        "f1",
        "f2",
        "f3",
        "f4",
        "f5",
      ];
      if (MAISON.some((k) => t.includes(k))) {
        merged.type = "maison";
        continue;
      }
      if (APPART.some((k) => t.includes(k))) {
        merged.type = "appartement";
        continue;
      }
      continue;
    }

    if (
      [
        "budgetMin",
        "budgetMax",
        "piecesMin",
        "piecesMax",
        "surfaceMin",
        "surfaceMax",
        "toleranceKm",
      ].includes(key)
    ) {
      const n = normalizeNumber(val);
      if (n !== null && !(["piecesMin", "piecesMax"].includes(key) && n === 0))
        merged[key] = n;
      continue;
    }

    if (key === "proximite") {
      if (Array.isArray(val)) merged.proximite = val;
      continue;
    }
    if (key === "imagesbien") {
      if (Array.isArray(val)) merged.imagesbien = val;
      continue;
    }
    if (UI_KEYS.has(key)) continue;

    if (typeof val === "string" && val.trim()) merged[key] = val.trim();
    else if (typeof val === "boolean") merged[key] = val;
  }

  for (const [mn, mx] of [
    ["budgetMin", "budgetMax"],
    ["piecesMin", "piecesMax"],
    ["surfaceMin", "surfaceMax"],
  ]) {
    if (merged[mn] != null && merged[mx] == null) merged[mx] = merged[mn];
    if (merged[mx] != null && merged[mn] == null) merged[mn] = merged[mx];
  }

  return merged;
}

/* ─── EXPORT PRINCIPAL ────────────────────────────────────────────────────── */
/**
 * Trois modes :
 *   MODE A — annonce pop-up     (isAnnounceCall === true)
 *             → texte statique direct, ZÉRO appel LLM, réponse < 1ms
 *   MODE B — collecte normale   (message utilisateur réel)
 *             → appel Mistral + fallback statique si timeout
 *   MODE C — phase résultats    (phase === "results")
 *             → appel Mistral + fallback statique si timeout
 */
export async function aiChatWithCriteria(
  userMessage,
  existingCriteria = {},
  context = {},
) {
  const phase = context.phase || "collecting";
  const role = context.role || existingCriteria.intent || "buyer";
  const matches = Array.isArray(context.matchingProfiles)
    ? context.matchingProfiles
    : [];
  const nextPopup = role === "seller" ? context.nextPopup || null : null;

  /* ══════════════════════════════════════════════════════════════════
     MODE A — Annonce pop-up
     AUCUN appel LLM — réponse statique immédiate.
     Déclenché par isAnnounceCall: true dans server.js.
     Critères INCHANGÉS.
  ══════════════════════════════════════════════════════════════════ */
  if (nextPopup && context.isAnnounceCall === true) {
    const message = STATIC_ANNOUNCE[nextPopup]
      ? STATIC_ANNOUNCE[nextPopup](existingCriteria)
      : "Je vais afficher l'interface correspondante.";

    console.log(`⚡ MODE A STATIQUE [${nextPopup}] → "${message}"`);
    return { message, criteria: { ...existingCriteria } };
  }

  /* ══════════════════════════════════════════════════════════════════
     MODE B/C — Collecte normale ou résultats
     Appel Mistral avec fallback statique si indisponible.
  ══════════════════════════════════════════════════════════════════ */
  const aiText = await callLLM(
    [
      {
        role: "system",
        content: buildPromptModeB(role, phase, existingCriteria, matches),
      },
      { role: "user", content: userMessage },
    ],
    350,
  );

  // Fallback immédiat si Mistral timeout ou échoue
  if (!aiText) {
    const fallback = buildFallbackMessage(role, existingCriteria, phase);
    console.warn("⚠️ Mistral indispo — fallback statique:", fallback);
    return { message: fallback, criteria: { ...existingCriteria } };
  }

  const raw = extractJSON(aiText);
  const message =
    raw?.message && typeof raw.message === "string" && raw.message.trim()
      ? raw.message.trim()
      : buildFallbackMessage(role, existingCriteria, phase);

  const merged = mergeNewCriteria(existingCriteria, raw?.criteria || {});
  return { message, criteria: merged };
}

/* ─── FALLBACK MESSAGE INTELLIGENT ──────────────────────────────────────── */
/**
 * Génère la prochaine question logique sans appeler l'IA.
 * Utilisé quand Mistral est indisponible.
 */
function buildFallbackMessage(role, sc, phase) {
  if (phase === "results")
    return "Souhaitez-vous comparer ces profils en détail ?";

  if (role === "buyer") {
    if (!sc.ville) return "Dans quelle ville recherchez-vous ?";
    if (sc.toleranceKm == null)
      return "Dans quel rayon autour de cette ville ? (en km)";
    if (!sc.budgetMin) return "Quel est votre budget maximum ?";
    if (!sc.surfaceMin) return "Quelle surface minimum souhaitez-vous ?";
    if (!sc.piecesMin) return "Combien de pièces minimum ?";
    if (!sc.type) return "Maison ou appartement ?";
    return "C'est noté. Je recherche les meilleures correspondances.";
  }

  // seller
  if (!sc.ville) return "Dans quelle ville se situe votre bien ?";
  if (!sc.type) return "S'agit-il d'une maison ou d'un appartement ?";
  if (!sc.piecesMin || sc.piecesMin <= 0)
    return "Combien de pièces compte votre bien ?";
  if (!sc.surfaceMin || sc.surfaceMin <= 0)
    return "Quelle est la surface en m² ?";
  if (!sc.budgetMin || sc.budgetMin <= 0)
    return "Quel est votre prix de vente ?";
  return "C'est noté.";
}

/* ─── PROMPT MODE B ─────────────────────────────────────────────────────── */
function buildPromptModeB(role, phase, sc, matchingProfiles) {
  const isSeller = role === "seller";

  const knownEntries = Object.entries(sc).filter(
    ([k, v]) =>
      !UI_KEYS.has(k) &&
      k !== "intent" &&
      v !== null &&
      v !== undefined &&
      v !== "" &&
      !(Array.isArray(v) && v.length === 0),
  );
  const knownBlock = knownEntries.length
    ? knownEntries
        .map(
          ([k, v]) => `  - ${k} = ${Array.isArray(v) ? JSON.stringify(v) : v}`,
        )
        .join("\n")
    : "  (aucun encore)";

  const tunnel = isSeller
    ? `
TUNNEL VENDEUR — ordre strict, UNE question à la fois :
  1 → VILLE           (si absente)
  2 → TYPE            maison ou appartement (si absent)
  3 → PIÈCES          piecesMin (si absent)
  4 → SURFACE         surfaceMin en m² (si absente)
  5 → PRIX DE VENTE   budgetMin = budgetMax (si absent) — TOUJOURS "prix de vente", jamais "budget"

NE mentionne PAS les pop-ups. NE dis PAS "je vais afficher". Pose juste la prochaine question manquante.`
    : `
PARCOURS ACHETEUR — ordre :
  1 → VILLE  2 → TOLÉRANCE km  3 → BUDGET  4 → SURFACE min  5 → PIÈCES min  6 → TYPE`;

  const resultsBlock =
    phase === "results"
      ? `\nPHASE RÉSULTATS — aide à comparer ces profils. Ne modifie PAS les critères.\n${JSON.stringify(matchingProfiles?.slice(0, 5), null, 2)}`
      : "";

  return `Tu es un agent immobilier expert, chaleureux et précis.

RÔLE : ${isSeller ? "VENDEUR" : "ACHETEUR"} | Phase : ${phase}

CRITÈRES DÉJÀ ENREGISTRÉS — NE PAS REDEMANDER, passer à l'étape suivante :
${knownBlock}
${tunnel}
${resultsBlock}

EXTRACTION — extrais TOUTES les infos données en même temps :
  "300k" → 300000 | "200 à 300k" → min=200000 max=300000 | valeur unique → min=max

STYLE : confirme brièvement, puis pose UNE seule question. Phrases courtes.

RÈGLES JSON :
- criteria = UNIQUEMENT ce que l'utilisateur dit dans CE message (connus → null)
- Nombres en number (jamais string)
- intent : "buyer" ou "seller" uniquement

Réponds UNIQUEMENT avec ce JSON :
{"message":"ton message","criteria":{"intent":null,"type":null,"ville":null,"toleranceKm":null,"proximite":null,"budgetMin":null,"budgetMax":null,"piecesMin":null,"piecesMax":null,"surfaceMin":null,"surfaceMax":null,"etatBien":null,"imagesbien":null,"niveauEnergetique":null}}`.trim();
}
