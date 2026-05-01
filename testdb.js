import "dotenv/config";
import OpenAI from "openai";

/* =========================
   CLIENTS LLM
========================= */
const mistralClient = new OpenAI({
  apiKey: process.env.MISTRAL,
  baseURL: "https://api.mistral.ai/v1",
});

const aiClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/* =========================
   HELPERS
========================= */
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
  if (!text) return {};
  try {
    const direct = JSON.parse(text.trim());
    if (typeof direct === "object") return direct;
  } catch (_) {}
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (_) {}
  return {};
}

function normalizeIntent(intent) {
  if (!intent) return null;
  const map = {
    achat: "buyer",
    acheter: "buyer",
    buy: "buyer",
    buyer: "buyer",
    vente: "seller",
    vendre: "seller",
    sell: "seller",
    seller: "seller",
  };
  return map[String(intent).toLowerCase().trim()] ?? null;
}

function normalizeType(type) {
  if (!type) return null;
  const t = type.toLowerCase().trim();
  const maison = [
    "maison",
    "villa",
    "pavillon",
    "chalet",
    "fermette",
    "mas",
    "bungalow",
  ];
  const appart = [
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
  if (maison.some((k) => t.includes(k))) return "maison";
  if (appart.some((k) => t.includes(k))) return "appartement";
  return null;
}

/* =========================
   MESSAGES SYSTÈME (pop-ups)
========================= */
const SYSTEM_MESSAGES = {
  __PROXIMITE_SELECTED__:
    "L'utilisateur vient de valider les commodités à proximité via la carte interactive. Ce critère est maintenant rempli. Continue avec le prochain critère manquant selon l'ordre strict.",
  __ETAT_SELECTED__:
    "L'utilisateur vient de sélectionner l'état du bien. Ce critère est maintenant rempli. Continue avec le prochain critère manquant (DPE / niveauEnergetique).",
  __NIVEAU_ENERGETIQUE_SELECTED__:
    "L'utilisateur vient de sélectionner le DPE. Ce critère est maintenant rempli. Continue avec le prochain critère manquant (photos).",
  __IMAGES_UPLOADED__:
    "L'utilisateur vient d'uploader ses photos. Le profil vendeur est complet. Conclus chaleureusement.",
  __IMAGES_SKIPPED__:
    "L'utilisateur a choisi de ne pas ajouter de photos. Le profil vendeur est complet. Conclus chaleureusement.",
  __POST_RESULTS__:
    "Les résultats de matching viennent d'être affichés. Propose à l'utilisateur de comparer ou affiner.",
};

/* =========================
   CLÉS UI — ne jamais injecter dans criteria
========================= */
const UI_KEYS = new Set([
  "triggerProximitePopup",
  "triggerEtatBienPopup",
  "triggerNiveauEnergetiquePopup",
  "triggerImagesPopup",
  "intent",
]);

/* =========================
   LABELS HUMAINS PAR CRITÈRE
========================= */
function getNextStepLabel(step, role) {
  const labels = {
    ville: "la ville",
    toleranceKm:
      "le rayon de recherche en km autour de la ville (ex: 30 km, ou 'toute la France')",
    budget:
      role === "seller"
        ? "le prix de vente souhaité pour le bien"
        : "le budget total",
    budgetMin:
      role === "seller"
        ? "le prix de vente souhaité pour le bien"
        : "le budget total",
    piecesMin: "le nombre de pièces",
    surfaceMin: "la surface en m²",
    type: "le type de bien (maison ou appartement)",
    etatBien:
      "l'état général du bien — indique à l'utilisateur qu'une interface va s'afficher pour le sélectionner",
    niveauEnergetique:
      "le DPE (diagnostic de performance énergétique) — indique à l'utilisateur qu'une interface va s'afficher pour le sélectionner",
    imagesbien:
      "les photos du bien — indique à l'utilisateur qu'une interface va s'afficher pour uploader ses photos",
    proximite:
      role === "seller"
        ? "les commodités à proximité — indique à l'utilisateur qu'une carte interactive va s'afficher"
        : "les commodités souhaitées à proximité",
  };
  return labels[step] || step;
}

/* =========================
   MAIN FUNCTION
========================= */
export async function aiChatWithCriteria(
  userMessage,
  existingCriteria = {},
  context = {},
) {
  const phase = context.phase || "collecting";
  const matchingProfiles = Array.isArray(context.matchingProfiles)
    ? context.matchingProfiles
    : [];
  const detectedRole =
    normalizeIntent(existingCriteria.intent || context.role) || "buyer";

  const isSystemMessage = Object.prototype.hasOwnProperty.call(
    SYSTEM_MESSAGES,
    userMessage,
  );
  const systemMsgContext = isSystemMessage
    ? SYSTEM_MESSAGES[userMessage]
    : null;

  // ─── Résumé des critères déjà connus ─────────────────────────────────────
  const knownCriteriaLines = Object.entries(existingCriteria)
    .filter(
      ([k, v]) =>
        !UI_KEYS.has(k) &&
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0 && k !== "proximite"),
    )
    .map(([k, v]) => `  ${k}: ${Array.isArray(v) ? JSON.stringify(v) : v}`)
    .join("\n");

  const criteriaContext = knownCriteriaLines
    ? `Critères DÉJÀ COLLECTÉS — NE PAS redemander, NE PAS inclure dans le JSON retourné :\n${knownCriteriaLines}`
    : "Aucun critère collecté pour l'instant.";

  // ─── Prochain critère ─────────────────────────────────────────────────────
  const nextStep = context.nextStep ?? null;
  const nextStepLabel = nextStep
    ? getNextStepLabel(nextStep, detectedRole)
    : null;

  // ─── Contenu utilisateur envoyé à l'IA ───────────────────────────────────
  const effectiveUserContent = isSystemMessage
    ? `[ACTION SYSTÈME]\n${systemMsgContext}\n\n${criteriaContext}\n\nGénère un message naturel de transition. Ne redemande JAMAIS les critères déjà listés ci-dessus.`
    : `Message utilisateur : "${userMessage}"\n\n${criteriaContext}\n\nRôle : ${detectedRole}`;

  // ─── System prompt ────────────────────────────────────────────────────────
  // CORRECTIF PRINCIPAL : nextStepInstruction est dans le system prompt, pas dans le user content.
  // L'IA suit beaucoup mieux les contraintes de flow depuis le system prompt.
  const nextStepBlock = nextStepLabel
    ? `
═══════════════════
🚨 INSTRUCTION ABSOLUE POUR CE TOUR
═══════════════════
Le prochain critère à collecter est : "${nextStepLabel}".
Tu DOIS poser UNE SEULE question portant UNIQUEMENT sur ce critère.
Tu ne mentionnes PAS d'autres critères. Tu ne poses pas d'autre question.
Si ce critère implique une interface (pop-up, carte), tu annonces simplement qu'elle va s'afficher.`
    : `
═══════════════════
🚨 INSTRUCTION ABSOLUE POUR CE TOUR
═══════════════════
Tous les critères sont remplis. Ne pose AUCUNE question. Conclus chaleureusement.`;

  const systemPrompt = `
Tu es un assistant immobilier conversationnel HAUT DE GAMME, précis, fiable et proactif.
Tu parles en français naturel, fluide et humain.

═══════════════════
🎯 TES DEUX RESPONSABILITÉS PAR TOUR
═══════════════════
1. EXTRAIRE les nouvelles informations du message utilisateur → dans "criteria" (UNIQUEMENT les nouvelles)
2. RÉDIGER un message naturel : confirmation brève + une seule question sur le prochain critère manquant

Tu ne gères PAS le flow (c'est le serveur). Tu CONFIRMES et ENCHAÎNES.

═══════════════════
⚠️ RÈGLE ABSOLUE — EXTRACTION
═══════════════════
Dans le champ "criteria" de ta réponse JSON :
- Tu mets UNIQUEMENT ce que l'utilisateur vient de dire dans CE message
- Tu ne remets JAMAIS les critères déjà connus (ils te sont donnés pour contexte seulement)
- Si l'utilisateur n'a rien dit de nouveau sur un champ → null

═══════════════════
⚠️ RÈGLE ABSOLUE — MESSAGE
═══════════════════
Chaque "message" DOIT :
1. Confirmer naturellement (reformulation intelligente, jamais mot pour mot)
2. Poser UNE SEULE question : celle du prochain critère indiqué dans INSTRUCTION ABSOLUE ci-dessous
3. Ne JAMAIS redemander un critère déjà dans les "Critères DÉJÀ COLLECTÉS"

❌ Interdit :
- Poser 2 questions
- Mentionner un critère déjà collecté comme si c'était une question ouverte
- Copier mot pour mot les exemples de ce prompt

═══════════════════
🚫 RÈGLE ANTI-REDONDANCE (CRITIQUE)
═══════════════════
Si un critère apparaît dans "Critères DÉJÀ COLLECTÉS" → il est VALIDÉ DÉFINITIVEMENT.
Tu n'en parles plus jamais. Tu passes au suivant UNIQUEMENT si l'INSTRUCTION ABSOLUE le précise.

═══════════════════
🧠 EXTRACTION MULTI-CRITÈRES (CRITIQUE)
═══════════════════
Si l'utilisateur donne plusieurs infos dans UN message → extrait-les TOUTES dans "criteria".
L'ordre des critères sert à savoir QUOI DEMANDER ensuite, pas à filtrer ce qu'on extrait.

Exemple : "Je vends une maison à Lyon de 4 pièces à 300k"
→ criteria doit contenir : type="maison", ville="Lyon", piecesMin=4, piecesMax=4, budgetMin=300000, budgetMax=300000

═══════════════════
💰 RÈGLES BUDGET (CRITIQUE)
═══════════════════

VENDEUR :
- Tu parles TOUJOURS de "prix de vente", JAMAIS de "budget"
- Une seule valeur donnée → budgetMin = budgetMax = cette valeur
- Tu ne demandes JAMAIS un minimum ET un maximum séparément

ACHETEUR :
- Tu parles TOUJOURS de "budget", JAMAIS de "budget minimum" ou "budget maximum" dans tes questions
- Une seule valeur donnée → budgetMin = budgetMax = cette valeur → on passe au critère suivant SANS redemander
- Un intervalle donné (ex: "entre 200k et 300k") → budgetMin=200000, budgetMax=300000
- Tu ne demandes JAMAIS le maximum si le minimum a été donné seul

═══════════════════
🔢 NORMALISATION NUMÉRIQUE
═══════════════════
- "300k" → 300000
- "entre 200 et 300k" → budgetMin: 200000, budgetMax: 300000
- valeur unique → min ET max identiques
- "pas de limite" / "toute la France" → toleranceKm: 999
- "uniquement la ville" / "0 km" → toleranceKm: 0

═══════════════════
🏡 ORDRES STRICTS (pour contexte — le serveur décide, pas toi)
═══════════════════

ACHETEUR (buyer) :
1. ville → 2. toleranceKm → 3. budgetMin/Max → 4. surfaceMin → 5. piecesMin → 6. type

VENDEUR (seller) :
1. ville → 2. proximite (POP-UP carte) → 3. type → 4. piecesMin → 5. surfaceMin
→ 6. budgetMin (= prix de vente) → 7. etatBien (POP-UP) → 8. niveauEnergetique (POP-UP) → 9. imagesbien (POP-UP)

Pour les étapes POP-UP : tu annonces que l'interface va s'afficher, tu ne poses pas de question textuelle.

═══════════════════
📦 FORMAT JSON STRICT — RÉPONSE COMPLÈTE
═══════════════════

{
  "message": "confirmation naturelle + UNE question suivante",
  "triggerProximitePopup": false,
  "criteria": {
    "intent": null,
    "type": null,
    "ville": null,
    "toleranceKm": null,
    "proximite": null,
    "budgetMin": null,
    "budgetMax": null,
    "piecesMin": null,
    "piecesMax": null,
    "surfaceMin": null,
    "surfaceMax": null,
    "etatBien": null,
    "imagesbien": null,
    "niveauEnergetique": null
  }
}

RÈGLES JSON :
- "criteria" contient UNIQUEMENT ce qui vient d'être appris dans CE tour → sinon null
- "message" jamais vide
- types corrects : number (pas string), array pour proximite/imagesbien, boolean
- jamais de "" pour les strings → null si vide
- Réponds UNIQUEMENT avec le JSON. Aucun texte avant ou après.
${nextStepBlock}
`.trim();

  // ─── Appel LLM ────────────────────────────────────────────────────────────
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: effectiveUserContent },
  ];

  let aiText = "";

  try {
    const response = await aiClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.15,
      max_tokens: 600,
    });
    aiText = response?.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.warn(
      "⚠️ Groq failed → fallback Mistral",
      err?.code || err?.message,
    );
    try {
      const mistralResponse = await mistralClient.chat.completions.create({
        model: "mistral-small-latest",
        messages,
        temperature: 0.15,
        max_tokens: 600,
      });
      aiText = mistralResponse?.choices?.[0]?.message?.content || "";
    } catch (err2) {
      console.error("❌ Mistral failed", err2?.message);
      return {
        message:
          "Désolé, une erreur technique est survenue. Pouvez-vous réessayer ?",
        criteria: {},
        triggerProximitePopup: false,
      };
    }
  }

  console.log("AI TEXT RAW:", aiText);

  // ─── Parsing JSON ─────────────────────────────────────────────────────────
  const raw = extractJSON(aiText);

  if (!raw.message || raw.message.trim() === "") {
    // Fallback intelligent selon le nextStep plutôt qu'un message générique
    if (nextStep && nextStepLabel) {
      raw.message = `C'est bien noté. Pouvez-vous me préciser ${nextStepLabel} ?`;
    } else {
      raw.message = "C'est bien noté, merci !";
    }
    console.warn("⚠️ Message IA vide — fallback appliqué");
  }

  // ─── Construction des critères appris dans CE tour ────────────────────────
  const learnedCriteria = {};

  if (raw.criteria && typeof raw.criteria === "object") {
    // Passe 1 : champs scalaires + min
    for (const [key, val] of Object.entries(raw.criteria)) {
      if (val === null || val === undefined) continue;

      if (key === "intent") {
        const normalized = normalizeIntent(val);
        if (normalized) learnedCriteria.intent = normalized;
        continue;
      }

      if (key === "type") {
        const normalized = normalizeType(val);
        if (normalized) learnedCriteria.type = normalized;
        continue;
      }

      if (
        ["budgetMin", "piecesMin", "surfaceMin", "toleranceKm"].includes(key)
      ) {
        const n = normalizeNumber(val);
        if (n !== null) learnedCriteria[key] = n;
        continue;
      }

      if (key === "proximite") {
        if (Array.isArray(val)) learnedCriteria.proximite = val;
        continue;
      }
    }

    // Passe 2 : champs max — symétrie uniquement si min absent dans CE tour
    for (const [key, val] of Object.entries(raw.criteria)) {
      if (val === null || val === undefined) continue;

      if (key === "budgetMax") {
        const n = normalizeNumber(val);
        if (n !== null) {
          learnedCriteria.budgetMax = n;
          if (learnedCriteria.budgetMin == null) learnedCriteria.budgetMin = n;
        }
        continue;
      }

      if (key === "piecesMax") {
        const n = normalizeNumber(val);
        if (n !== null) {
          learnedCriteria.piecesMax = n;
          if (learnedCriteria.piecesMin == null) learnedCriteria.piecesMin = n;
        }
        continue;
      }

      if (key === "surfaceMax") {
        const n = normalizeNumber(val);
        if (n !== null) {
          learnedCriteria.surfaceMax = n;
          if (learnedCriteria.surfaceMin == null)
            learnedCriteria.surfaceMin = n;
        }
        continue;
      }

      // Champs string simples non encore traités
      if (
        ![
          "intent",
          "type",
          "budgetMin",
          "piecesMin",
          "surfaceMin",
          "toleranceKm",
          "proximite",
          "budgetMax",
          "piecesMax",
          "surfaceMax",
        ].includes(key)
      ) {
        // Jamais injecter les clés UI dans criteria
        if (UI_KEYS.has(key)) continue;

        if (typeof val === "string" && val.trim() !== "") {
          learnedCriteria[key] = val.trim();
        } else if (typeof val === "boolean") {
          learnedCriteria[key] = val;
        } else if (Array.isArray(val)) {
          learnedCriteria[key] = val;
        }
      }
    }
  }

  // ─── Symétrie budgetMin = budgetMax si valeur unique apprise dans CE tour ─
  // CORRECTIF : si l'IA a extrait budgetMin mais pas budgetMax dans ce tour,
  // on force budgetMax = budgetMin (valeur unique = on ne pose pas la question du max)
  if (learnedCriteria.budgetMin != null && learnedCriteria.budgetMax == null) {
    learnedCriteria.budgetMax = learnedCriteria.budgetMin;
  }
  if (learnedCriteria.budgetMax != null && learnedCriteria.budgetMin == null) {
    learnedCriteria.budgetMin = learnedCriteria.budgetMax;
  }

  // Idem pièces
  if (learnedCriteria.piecesMin != null && learnedCriteria.piecesMax == null) {
    learnedCriteria.piecesMax = learnedCriteria.piecesMin;
  }
  if (learnedCriteria.piecesMax != null && learnedCriteria.piecesMin == null) {
    learnedCriteria.piecesMin = learnedCriteria.piecesMax;
  }

  // Idem surface
  if (
    learnedCriteria.surfaceMin != null &&
    learnedCriteria.surfaceMax == null
  ) {
    learnedCriteria.surfaceMax = learnedCriteria.surfaceMin;
  }
  if (
    learnedCriteria.surfaceMax != null &&
    learnedCriteria.surfaceMin == null
  ) {
    learnedCriteria.surfaceMin = learnedCriteria.surfaceMax;
  }

  return {
    message: raw.message,
    criteria: learnedCriteria,
    triggerProximitePopup: raw.triggerProximitePopup === true,
  };
}
