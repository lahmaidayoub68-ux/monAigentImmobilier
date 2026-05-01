import "dotenv/config";
import OpenAI from "openai";
/* ─── CLIENT GROQ (primaire) ─────────────────────────────────────────────── */
const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
  timeout: 10000,
  maxRetries: 0,
});

/* ─── CLIENT MISTRAL (fallback) ──────────────────────────────────────────── */
const mistralClient = new OpenAI({
  apiKey: process.env.MISTRAL,
  baseURL: "https://api.mistral.ai/v1",
  timeout: 12000,
  maxRetries: 0,
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

/* ─── LLM CALL ────────────────────────────────────────────────────────────── */
async function callLLM(messages, maxTokens = 500) {
  try {
    const res = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    });
    const text = res?.choices?.[0]?.message?.content || "";
    if (text.trim()) {
      console.log("✅ Groq OK | RAW:", text.slice(0, 120));
      return text;
    }
    console.warn("⚠️ Groq réponse vide");
  } catch (e) {
    console.warn("⚠️ Groq FAILED:", e?.code || e?.message?.slice(0, 80));
  }

  try {
    const res = await mistralClient.chat.completions.create({
      model: "mistral-small-latest",
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    });
    const text = res?.choices?.[0]?.message?.content || "";
    if (text.trim()) {
      console.log("✅ Mistral (fallback) OK | RAW:", text.slice(0, 120));
      return text;
    }
    console.warn("⚠️ Mistral réponse vide");
  } catch (e) {
    console.warn("⚠️ Mistral FAILED:", e?.code || e?.message?.slice(0, 80));
  }

  return null;
}

/* ─── MERGE CRITÈRES ─────────────────────────────────────────────────────── */
function mergeNewCriteria(existing, incoming, role = "buyer") {
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
      if (Array.isArray(val) && val.length > 0) merged.proximite = val;
      continue;
    }
    if (key === "imagesbien") {
      if (Array.isArray(val)) merged.imagesbien = val;
      continue;
    }

    if (typeof val === "string" && val.trim()) merged[key] = val.trim();
    else if (typeof val === "boolean") merged[key] = val;
  }

  // ── Symétrie min/max — SEULEMENT si l'IA a explicitement retourné les deux côtés
  // Pour un acheteur : on NE force PAS surfaceMax/piecesMax/budgetMax à partir du min
  // car "surface min 50m²" doit garder surfaceMax=null (pas de plafond)
  // Pour un vendeur : valeur unique → min = max (prix fixe, surface fixe, pièces fixes)
  if (role === "seller") {
    for (const [mn, mx] of [
      ["budgetMin", "budgetMax"],
      ["piecesMin", "piecesMax"],
      ["surfaceMin", "surfaceMax"],
    ]) {
      if (merged[mn] != null && merged[mx] == null) merged[mx] = merged[mn];
      if (merged[mx] != null && merged[mn] == null) merged[mn] = merged[mx];
    }
  } else {
    // Acheteur : symétrie uniquement si l'IA a fourni les deux, ou si budget est une valeur unique
    // Budget : si min ET max fournis → ok. Si un seul → on garde tel quel.
    // MAIS : si l'IA retourne budgetMin=budgetMax=X (valeur unique genre "300k") → ok aussi
    // On ne symétrise PAS surface et pièces car "minimum X" ne veut pas dire "maximum X"
    for (const [mn, mx] of [["piecesMin", "piecesMax"]]) {
      // Pour les pièces, si min fourni sans max → pas de plafond (laisser null)
      // La symétrie est gérée plus tard dans buildNormalized avec une valeur 999
    }
  }

  return merged;
}

/* ─── FALLBACK MESSAGE ───────────────────────────────────────────────────── */
function buildFallbackMessage(role, sc, phase) {
  if (phase === "results")
    return "Souhaitez-vous comparer ces profils en détail ?";

  if (role === "buyer") {
    if (!sc.ville) return "Dans quelle ville recherchez-vous votre bien ?";
    if (sc.toleranceKm == null)
      return "Dans quel rayon autour de cette ville souhaitez-vous chercher ?";
    if (sc.budgetMin == null && sc.budgetMax == null)
      return "Quel est votre budget ?";
    if (sc.surfaceMin == null) return "Quelle surface minimum vous convient ?";
    if (sc.piecesMin == null)
      return "Combien de pièces minimum souhaitez-vous ?";
    if (!sc.type) return "Maison ou appartement ?";
    return "Parfait, je recherche les meilleures correspondances.";
  }

  // seller — tunnel uniquement, sans pop-ups
  if (!sc.ville) return "Dans quelle ville se situe votre bien ?";
  if (!sc.type) return "S'agit-il d'une maison ou d'un appartement ?";
  if (!sc.piecesMin || sc.piecesMin <= 0)
    return "Combien de pièces compte votre bien ?";
  if (!sc.surfaceMin || sc.surfaceMin <= 0)
    return "Quelle est la surface en m² ?";
  if (!sc.budgetMin || sc.budgetMin <= 0)
    return "À quel prix souhaitez-vous vendre votre bien ?";
  return "Très bien, nous allons continuer.";
}

/* ─── PROMPT ACHETEUR ────────────────────────────────────────────────────── */
/* ─── PROMPT ACHETEUR (CORRIGÉ : LOGIQUE DU TUNNEL INTÉGRÉE AU LLM) ────────── */
function buildBuyerSystemPrompt(phase, sc, matchingProfiles) {
  // ── Critères déjà acquis (État AVANT le message de l'utilisateur) ──
  const acquired = [];
  if (sc.ville) acquired.push(`ville = "${sc.ville}"`);
  if (sc.toleranceKm != null)
    acquired.push(`toleranceKm = ${sc.toleranceKm} km`);
  if (sc.budgetMin != null) acquired.push(`budgetMin = ${sc.budgetMin}`);
  if (sc.budgetMax != null) acquired.push(`budgetMax = ${sc.budgetMax}`);
  if (sc.surfaceMin != null) acquired.push(`surfaceMin = ${sc.surfaceMin} m²`);
  if (sc.surfaceMax != null) acquired.push(`surfaceMax = ${sc.surfaceMax} m²`);
  if (sc.piecesMin != null) acquired.push(`piecesMin = ${sc.piecesMin}`);
  if (sc.piecesMax != null) acquired.push(`piecesMax = ${sc.piecesMax}`);
  if (sc.type) acquired.push(`type = "${sc.type}"`);

  const acquiredBlock = acquired.length
    ? acquired.map((a) => `  - ${a}`).join("\n")
    : "  (aucun encore)";

  const resultsBlock =
    phase === "results"
      ? `\nPHASE RÉSULTATS — aide l'utilisateur à comparer les profils affichés. Ne modifie PAS les critères.\nProfils :\n${JSON.stringify(matchingProfiles?.slice(0, 5), null, 2)}`
      : "";

  return `Tu es un agent immobilier expert, chaleureux, haut de gamme et très professionnel. Tu accompagnes un ACHETEUR.

CRITÈRES DÉJÀ ENREGISTRÉS (Avant le dernier message du client) :
${acquiredBlock}

TUNNEL ACHETEUR — Ordre strict pour poser tes questions.
Évalue ce que l'utilisateur vient de dire. S'il répond à un critère manquant, passe DIRECTEMENT à la question suivante dans cette liste :
  1. VILLE — si absente
  2. RAYON (en km) — si absent
  3. BUDGET D'ACHAT — si absent
  4. SURFACE MINIMUM (en m²) — si absente
  5. NOMBRE DE PIÈCES MINIMUM — si absent
  6. TYPE DE BIEN (maison ou appartement) — si absent

INSTRUCTION :
- Extraits TOUTES les informations du message actuel du client pour remplir le JSON.
- Confirme brièvement et naturellement ce qu'il vient de t'annoncer.
- Pose UNE SEULE QUESTION pour obtenir le PROCHAIN critère manquant de la liste ci-dessus.
- Si tous les critères sont réunis, annonce simplement que tu lances la recherche (ne pose plus de question).

STYLE ET TON (TRÈS IMPORTANT) :
  - Tu es un conseiller premium. Fais des phrases fluides et valorisantes.
  - Ne pose pas de questions sèches comme un robot. Amène la question de façon conversationnelle.
  - Ne mentionne JAMAIS tes variables techniques (budgetMin, piecesMax, toleranceKm, etc.) à l'utilisateur.

RÈGLES D'EXTRACTION JSON (Applique-les à TOUT le message) :
  Budget : "300k" ou "300 000 €" -> budgetMin=300000, budgetMax=300000 / "entre 200k et 350k" -> budgetMin=200000, budgetMax=350000 / "max 300k" -> budgetMax=300000, budgetMin=null
  Surface : "50m²" -> surfaceMin=50, surfaceMax=null
  Pièces : "4 pièces" -> piecesMin=4, piecesMax=null
  Rayon : "60 km" -> toleranceKm=60 / "peu importe" -> toleranceKm=100
  Type : maison/villa/pavillon -> type="maison" / appartement/studio/loft -> type="appartement"

${resultsBlock}

Réponds UNIQUEMENT avec ce JSON (aucun texte en dehors) :
{
  "message": "Ton message d'agent immobilier pro et chaleureux",
  "criteria": {
    "intent": "buyer",
    "type": null,
    "ville": null,
    "toleranceKm": null,
    "budgetMin": null,
    "budgetMax": null,
    "surfaceMin": null,
    "surfaceMax": null,
    "piecesMin": null,
    "piecesMax": null
  }
}`.trim();
}

/* ─── PROMPT VENDEUR (inchangé) ──────────────────────────────────────────── */
function buildSellerSystemPrompt(phase, sc, matchingProfiles, context) {
  const triggerContext = context?.triggerContext || null;

  const knownEntries = Object.entries(sc).filter(
    ([k, v]) =>
      !["intent"].includes(k) &&
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

  const resultsBlock =
    phase === "results"
      ? `\nPHASE RÉSULTATS — aide à comparer les profils affichés. Ne modifie PAS les critères.\nProfils :\n${JSON.stringify(matchingProfiles?.slice(0, 5), null, 2)}`
      : "";

  let sellerInstruction = "";

  if (triggerContext === "proximite_about_to_trigger") {
    sellerInstruction = `
INSTRUCTION UNIQUE : la ville "${sc.ville}" vient d'être enregistrée.
Le système va immédiatement afficher une carte interactive pour sélectionner
les commerces, transports, écoles et services proches du bien.
→ Confirme avoir noté la ville.
→ Annonce que tu affiches la carte des commodités à proximité.
→ Ne pose AUCUNE autre question. Ne parle PAS des pièces, surface, prix, état ou DPE.
`;
  } else if (triggerContext === "post_proximite") {
    const missingInTunnel =
      (!sc.type ? "le type de bien (maison ou appartement)" : "") ||
      (!sc.piecesMin || sc.piecesMin <= 0 ? "le nombre de pièces" : "") ||
      (!sc.surfaceMin || sc.surfaceMin <= 0 ? "la surface en m²" : "") ||
      (!sc.budgetMin || sc.budgetMin <= 0 ? "le prix de vente" : "");

    sellerInstruction = `
INSTRUCTION : les commodités à proximité ont été sélectionnées.
Confirme brièvement (une phrase), puis pose la prochaine question du tunnel :

TUNNEL VENDEUR — ordre strict, UNE question à la fois :
  1. TYPE — maison ou appartement (si absent)
  2. PIÈCES — nombre de pièces (si absent ou 0)
  3. SURFACE — en m² (si absente ou 0)
  4. PRIX DE VENTE — "À quel prix souhaitez-vous vendre ?" (si absent ou 0)

Prochain critère manquant : ${missingInTunnel || "aucun (tunnel complet)"}

RÈGLES :
  - Toujours "prix de vente", JAMAIS "budget"
  - Prix → budgetMin = budgetMax = valeur annoncée
  - piecesMin = piecesMax, surfaceMin = surfaceMax
  - Ne parle PAS de l'état du bien, DPE ou photos (ce sont des pop-ups automatiques)
`;
  } else if (triggerContext === "etat_about_to_trigger") {
    sellerInstruction = `
INSTRUCTION UNIQUE : tous les critères principaux sont maintenant enregistrés
(ville, type, pièces, surface, prix de vente, commodités).
Le système va afficher un sélecteur pour qualifier l'état général du bien.
→ Fais un bref récapitulatif des critères collectés (une phrase).
→ Annonce que tu vas qualifier l'état du bien.
→ Ne pose AUCUNE autre question.
`;
  } else if (triggerContext === "dpe_about_to_trigger") {
    sellerInstruction = `
INSTRUCTION UNIQUE : l'état du bien "${sc.etatBien}" vient d'être enregistré.
Le système va afficher le sélecteur de diagnostic de performance énergétique (DPE).
→ Confirme l'état du bien.
→ Annonce que tu vas afficher le diagnostic énergétique.
→ Ne pose AUCUNE autre question.
`;
  } else if (triggerContext === "images_about_to_trigger") {
    sellerInstruction = `
INSTRUCTION UNIQUE : le DPE "${sc.niveauEnergetique}" vient d'être enregistré.
Le système va afficher l'interface pour déposer des photos du bien.
→ Confirme le DPE.
→ Annonce que tu vas permettre d'ajouter des photos pour valoriser le bien.
→ Ne pose AUCUNE autre question.
`;
  } else {
    sellerInstruction = `
TUNNEL VENDEUR — ordre strict, UNE question à la fois :
  1. VILLE — si absente
  2. TYPE — maison ou appartement, si absent
  3. PIÈCES — nombre de pièces, si absent ou 0
  4. SURFACE — en m², si absente ou 0
  5. PRIX DE VENTE — "À quel prix souhaitez-vous vendre ?" si absent ou 0

RÈGLES CRITIQUES :
  - "prix de vente" uniquement, JAMAIS "budget"
  - Prix → budgetMin = budgetMax = valeur annoncée
  - piecesMin = piecesMax, surfaceMin = surfaceMax
  - NE JAMAIS mentionner l'état du bien, le DPE ou les photos dans ce tunnel
    → ces éléments sont gérés automatiquement par des pop-ups APRÈS le tunnel
  - Ne redemande JAMAIS un critère déjà listé dans les critères enregistrés
`;
  }

  return `Tu es un agent immobilier expert, chaleureux et précis.

RÔLE : VENDEUR | Phase : ${phase}

CRITÈRES DÉJÀ ENREGISTRÉS — NE PAS REDEMANDER :
${knownBlock}

${sellerInstruction}

STYLE :
  - Confirme brièvement ce que l'utilisateur vient de dire
  - UNE seule question à la fois, phrases courtes et naturelles
  - Ne mentionne jamais les noms techniques (budgetMin, piecesMax, surfaceMin…)
  - Hors-sujet → réponds naturellement puis recentre
${resultsBlock}

EXTRACTION JSON — extrais TOUTES les infos du message actuel :
  Prix vendeur : valeur unique → budgetMin=budgetMax=valeur, piecesMin=piecesMax, surfaceMin=surfaceMax.

Réponds UNIQUEMENT avec ce JSON (aucun texte en dehors) :
{
  "message": "ton message naturel",
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
}`.trim();
}

/* ─── DISPATCH PROMPT selon le rôle ─────────────────────────────────────── */
function buildSystemPrompt(role, phase, sc, matchingProfiles, context) {
  if (role === "seller") {
    return buildSellerSystemPrompt(phase, sc, matchingProfiles, context);
  }
  return buildBuyerSystemPrompt(phase, sc, matchingProfiles);
}

/* ─── EXPORT PRINCIPAL ────────────────────────────────────────────────────── */
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

  const isInternal =
    typeof userMessage === "string" && userMessage.startsWith("__");

  let effectiveUserMessage = userMessage;
  if (isInternal) {
    const INTERNAL_MAP = {
      __PROXIMITE_SELECTED__: `Les commodités à proximité ont été sélectionnées : ${JSON.stringify(existingCriteria.proximite || [])}. Confirme et continue le tunnel.`,
      __ETAT_SELECTED__: `L'état du bien a été sélectionné : "${existingCriteria.etatBien}". Confirme et annonce le DPE.`,
      __NIVEAU_ENERGETIQUE_SELECTED__: `Le DPE a été sélectionné : "${existingCriteria.niveauEnergetique}". Confirme et annonce les photos.`,
      __IMAGES_UPLOADED__: `${(existingCriteria.imagesbien || []).length} photo(s) uploadée(s). Confirme et annonce la recherche d'acheteurs.`,
      __IMAGES_SKIPPED__: `Pas de photos. Confirme et annonce la recherche d'acheteurs.`,
      __POST_RESULTS__: `Les profils ont été affichés. Propose de l'aide pour comparer et choisir.`,
    };
    effectiveUserMessage =
      INTERNAL_MAP[userMessage] ||
      `Action : ${userMessage}. Confirme et continue.`;
  }

  const sc = existingCriteria;
  const systemPrompt = buildSystemPrompt(role, phase, sc, matches, context);

  const aiText = await callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: effectiveUserMessage },
    ],
    500,
  );

  if (!aiText) {
    const fallback = buildFallbackMessage(role, existingCriteria, phase);
    console.warn("⚠️ LLM indispo — fallback:", fallback);
    return { message: fallback, criteria: { ...existingCriteria } };
  }

  const raw = extractJSON(aiText);

  if (!raw) {
    return {
      message:
        aiText.trim() || buildFallbackMessage(role, existingCriteria, phase),
      criteria: { ...existingCriteria },
    };
  }

  const message =
    raw?.message?.trim() || buildFallbackMessage(role, existingCriteria, phase);

  // Merge avec connaissance du rôle pour la symétrie min/max
  const merged = mergeNewCriteria(existingCriteria, raw?.criteria || {}, role);

  return { message, criteria: merged };
}
