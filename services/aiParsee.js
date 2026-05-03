import "dotenv/config";
import OpenAI from "openai";

/* ─── CLIENT GROQ (primaire) ─────────────────────────────────────────────── */
const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
  timeout: 10000,
  maxRetries: 0,
});

/* ─── CLIENT FEATHERLESS (fallback 1) ───────────────────────────────────── */
const featherlessClient = new OpenAI({
  apiKey: process.env.FEATHERLESS_API_KEY,
  baseURL: "https://api.featherless.ai/v1",
  timeout: 12000,
  maxRetries: 0,
});

/* ─── CLIENT MISTRAL (fallback 2) ────────────────────────────────────────── */
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
export function detectResultsIntent(userMessage) {
  const msg = userMessage.toLowerCase().trim();

  // Mise en relation
  if (
    /mise en relation|contact|contacter|envoyer un message|écrire à|prendre contact|joindre/i.test(
      msg,
    )
  ) {
    return "contact";
  }

  // Modifier critères
  if (
    /modif|chang|adjust|revoir|reprendre|nouveau|différent|autre|élargir|réduire|budget|surface|pièce|ville|rayon/i.test(
      msg,
    )
  ) {
    return "modify_criteria";
  }

  // Analyse marché
  if (
    /marché|tendance|analyse|évolution|prix|secteur|investissement|rentabilité|stat|indicateur/i.test(
      msg,
    )
  ) {
    return "market_analysis";
  }

  // Comparaison profils
  if (
    /compar|meilleur|lequel|priorité|classer|rang|différence entre|vs\b|versus/i.test(
      msg,
    )
  ) {
    return "compare";
  }

  // Demande d'info sur un match spécifique
  if (
    /détail|plus d'info|tell me|dis-moi|parle-moi|ce profil|ce bien|cet acheteur/i.test(
      msg,
    )
  ) {
    return "detail";
  }

  return "general";
}
export async function generateContactMessage(
  senderRole,
  senderCriteria,
  targetProfile,
) {
  const isSenderBuyer = senderRole === "buyer";

  const prompt = `Tu es un conseiller immobilier expert. Rédige un message de prise de contact professionnel et personnalisé.
 
ÉMETTEUR : ${isSenderBuyer ? "Acheteur" : "Vendeur"}
Profil émetteur :
${
  isSenderBuyer
    ? `- Recherche : ${senderCriteria.type || "bien"} à ${senderCriteria.ville || "N/A"}
- Budget max : ${senderCriteria.budgetMax ? senderCriteria.budgetMax.toLocaleString("fr-FR") + " €" : "N/A"}
- Surface min : ${senderCriteria.surfaceMin || "N/A"} m²
- Pièces min : ${senderCriteria.piecesMin || "N/A"}`
    : `- Bien : ${senderCriteria.type || "bien"} à ${senderCriteria.ville || "N/A"}
- Prix : ${senderCriteria.budgetMin ? senderCriteria.budgetMin.toLocaleString("fr-FR") + " €" : "N/A"}
- Surface : ${senderCriteria.surfaceMin || "N/A"} m²
- Pièces : ${senderCriteria.piecesMin || "N/A"}
- État : ${senderCriteria.etatBien || "N/A"}
- DPE : ${senderCriteria.niveauEnergetique || "N/A"}`
}
 
DESTINATAIRE : ${isSenderBuyer ? "Vendeur" : "Acheteur"}
Profil destinataire :
${
  isSenderBuyer
    ? `- Bien proposé : ${targetProfile.type || "bien"} à ${targetProfile.ville}
- Prix : ${targetProfile.price || targetProfile.budgetMax || "N/A"} €
- Compatibilité : ${targetProfile.compatibility}%`
    : `- Recherche : ${targetProfile.type || "bien"} à ${targetProfile.ville}
- Budget max : ${targetProfile.budgetMax || "N/A"} €
- Compatibilité : ${targetProfile.compatibility}%`
}
 
Rédige un message de contact :
- Court (5-7 lignes), professionnel, sincère
- Mentionne le point commun clé qui justifie le contact
- Formule une invitation à échanger
- Pas de formules creuses ni de jargon excessif
- Commence directement par "Bonjour," (pas de "Objet:" ni de sujet)
 
Réponds UNIQUEMENT avec le texte du message (pas de JSON, pas de balises).`;

  const aiText = await callLLM(
    [
      { role: "system", content: prompt },
      { role: "user", content: "Génère le message de mise en relation." },
    ],
    300,
  );

  if (!aiText) {
    return isSenderBuyer
      ? `Bonjour,\n\nJe suis intéressé(e) par votre bien à ${targetProfile.ville} et votre profil correspond à mes critères de recherche. Je serais ravi(e) d'échanger avec vous à ce sujet.\n\nCordialement.`
      : `Bonjour,\n\nVotre profil d'acheteur correspond à mon bien à ${senderCriteria.ville}. Je serais heureux(se) d'échanger avec vous.\n\nCordialement.`;
  }

  return aiText.trim();
}

/* ─── LLM CALL ────────────────────────────────────────────────────────────── */
async function callLLM(messages, maxTokens = 500) {
  // ── Groq (primaire) ──────────────────────────────────────────────────────
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

  // ── Featherless (fallback 1) ─────────────────────────────────────────────
  try {
    const models = [
      // 🥇 meilleur choix stable
      "meta-llama/Llama-3.1-8B-Instruct",

      // 🥈 bon raisonnement + structuré
      "Qwen/Qwen2.5-7B-Instruct",

      // 🥉 celui que tu as déjà validé (SAFE)
      "mistralai/Mistral-7B-Instruct-v0.2",
    ];

    let lastError = null;

    for (const model of models) {
      try {
        console.log(`🧪 Featherless test model: ${model}`);

        const res = await featherlessClient.chat.completions.create({
          model,
          messages,
          temperature: 0.2,
          max_tokens: maxTokens,
        });

        const text = res?.choices?.[0]?.message?.content || "";

        if (text.trim()) {
          console.log(
            `✅ Featherless OK (${model}) | RAW:`,
            text.slice(0, 120),
          );
          return text;
        } else {
          console.warn(`⚠️ Réponse vide (${model})`);
        }
      } catch (err) {
        lastError = err;
        console.warn(
          `⚠️ Model FAILED (${model}):`,
          err?.status || err?.code || err?.message?.slice(0, 80),
        );
      }
    }

    console.warn("❌ Tous les modèles Featherless ont échoué", lastError);
  } catch (e) {
    console.warn("⚠️ Featherless GLOBAL FAILED:", e?.message?.slice(0, 120));
  }
  // ── Mistral (fallback 2) ─────────────────────────────────────────────────
  try {
    const res = await mistralClient.chat.completions.create({
      model: "mistral-small-latest",
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    });
    const text = res?.choices?.[0]?.message?.content || "";
    if (text.trim()) {
      console.log("✅ Mistral (fallback 2) OK | RAW:", text.slice(0, 120));
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
  3. BUDGET D'ACHAT — si absent (une seule valeur = budgetMin=budgetMax, c'est suffisant)
  4. SURFACE MINIMUM (en m²) — si absente (une seule valeur = surfaceMin, c'est suffisant, NE demande JAMAIS surfaceMax)
  5. NOMBRE DE PIÈCES MINIMUM — si absent (une seule valeur = piecesMin, c'est suffisant, NE demande JAMAIS piecesMax)
  6. TYPE DE BIEN (maison ou appartement) — si absent

RÈGLE ABSOLUE : surfaceMax, piecesMax et budgetMax sont OPTIONNELS.
- Si l'utilisateur donne UNE valeur pour surface → surfaceMin = cette valeur, surfaceMax = surfaceMin. NE repose JAMAIS la question pour surfaceMax.
- Si l'utilisateur donne UNE valeur pour pièces → piecesMin = cette valeur, piecesMax = piecesMin. NE repose JAMAIS la question pour piecesMax.
- Si l'utilisateur donne UNE valeur pour budget → budgetMin = budgetMax = budgetMin. NE repose JAMAIS la question pour budgetMax.
- SI l'utilisateur emploie lui-meme un intervalle (entre) tu enregistres proprement les min et max pour les critères qui ont des max.
- Un critère est ACQUIS dès qu'il a une valeur minimum. 
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

function buildBuyerResultsPrompt(sc, matches, userMessage, intent, context) {
  const topMatches = (matches || []).slice(0, 5);

  // Résumé critères actuels
  const criteriaLines = [];
  if (sc.ville) criteriaLines.push(`Ville recherchée : ${sc.ville}`);
  if (sc.toleranceKm != null)
    criteriaLines.push(`Rayon : ${sc.toleranceKm} km`);
  if (sc.budgetMax || sc.budgetMin)
    criteriaLines.push(
      `Budget : ${sc.budgetMin ? sc.budgetMin + " € min" : ""} ${sc.budgetMax ? "→ " + sc.budgetMax + " € max" : ""}`.trim(),
    );
  if (sc.surfaceMin)
    criteriaLines.push(`Surface minimum : ${sc.surfaceMin} m²`);
  if (sc.piecesMin) criteriaLines.push(`Pièces minimum : ${sc.piecesMin}`);
  if (sc.type) criteriaLines.push(`Type : ${sc.type}`);

  // Résumé matchs
  const matchSummary = topMatches.map((m, i) => ({
    rang: i + 1,
    type: m.type,
    ville: m.ville,
    prix: m.price || m.budgetMax,
    surface: m.surface || m.surfaceMin,
    pieces: m.pieces || m.piecesMin,
    contact: m.contact,
    compatibilite: m.compatibility,
    dpe: m.niveauEnergetique || null,
    etat: m.etatBien || null,
    commun: m.common || [],
    divergent: m.different || [],
  }));

  // Instructions selon l'intention détectée
  let intentInstruction = "";

  if (intent === "contact") {
    intentInstruction = `
INTENTION DÉTECTÉE : MISE EN RELATION
L'utilisateur veut contacter un vendeur parmi les matchs.
→ Demande-lui QUEL profil il veut contacter (donne la liste numérotée des matchs : ville, prix, compatibilité).
→ Une fois le profil identifié (le serveur le passera dans __ACTION_CONTACT__), tu n'as RIEN à faire.
→ Sois direct et professionnel : "Voici vos ${topMatches.length} correspondances — laquelle souhaitez-vous contacter ?"
→ NE réponds pas que tu "ne peux pas" envoyer de messages. Le système le fait automatiquement.
`;
  } else if (intent === "modify_criteria") {
    intentInstruction = `
INTENTION DÉTECTÉE : MODIFICATION DES CRITÈRES
L'utilisateur veut réviser sa recherche.
→ Affiche un récapitulatif CLAIR et lisible de ses critères actuels (utilise des tirets, 1 critère par ligne).
→ Demande ce qu'il souhaite modifier en étant précis : budget, surface, ville, rayon, type, pièces.
→ Ton message doit se terminer par une invitation ouverte : "Qu'est-ce que vous souhaitez ajuster ?"
→ NE relance pas le matching toi-même. Le serveur gère ça avec __RELAUNCH_MATCHING__.
`;
  } else if (intent === "market_analysis") {
    intentInstruction = `
INTENTION DÉTECTÉE : ANALYSE MARCHÉ
L'utilisateur demande une analyse du marché ou un conseil stratégique.
→ Analyse les données de ses matchs pour formuler un diagnostic précis :
   - Tension prix/budget (écarts constatés)
   - Concentration géographique des biens disponibles
   - Qualité énergétique du parc disponible (DPE)
   - Recommandation stratégique personnalisée (élargir le rayon ? réviser le budget ?)
→ Sois expert, précis, chiffré. Pas de banalités.
→ Termine par une action concrète recommandée.
`;
  } else if (intent === "compare") {
    intentInstruction = `
INTENTION DÉTECTÉE : COMPARAISON
L'utilisateur veut comparer des profils entre eux.
→ Compare objectivement les matchs disponibles sur : prix, surface, DPE, état, localisation.
→ Identifie clairement le profil le plus adapté et explique POURQUOI avec des arguments précis.
→ Formule une recommandation finale nette : "Votre meilleur choix est le profil n°X car…"
`;
  } else {
    intentInstruction = `
INTENTION : CONVERSATION GÉNÉRALE / CONSEIL
→ Réponds de façon précise et utile en t'appuyant sur les données des matchs.
→ Ton expertise doit transparaître : chiffres, tendances, recommandations concrètes.
→ Évite les formules creuses. Chaque phrase doit apporter de la valeur.
`;
  }

  return `Tu es un conseiller immobilier expert de haut niveau. Un acheteur vient de recevoir ses résultats de matching.
 
PROFIL ACHETEUR :
${criteriaLines.map((l) => `  - ${l}`).join("\n") || "  (données incomplètes)"}
 
MATCHS AFFICHÉS (${topMatches.length} résultats) :
${JSON.stringify(matchSummary, null, 2)}
 
MESSAGE DE L'UTILISATEUR : "${userMessage}"
 
${intentInstruction}
 
RÈGLES ABSOLUES :
- NE jamais répéter textuellement le même message deux fois de suite
- NE jamais dire "je ne peux pas" pour une action que le serveur gère
- Toujours t'appuyer sur les données réelles des matchs (prix, ville, compatibilité)
- Ton rôle est celui d'un conseiller haut de gamme : précis, direct, utile
- Maximum 4 phrases sauf si comparaison détaillée demandée
 
Réponds UNIQUEMENT avec ce JSON :
{
  "message": "ton message de conseiller expert",
  "intent": "${intent}",
  "criteria": null
}`.trim();
}

// ─── PROMPT RESULTS VENDEUR ───────────────────────────────────────────────────
function buildSellerResultsPrompt(sc, matches, userMessage, intent, context) {
  const topMatches = (matches || []).slice(0, 5);

  const criteriaLines = [];
  if (sc.ville) criteriaLines.push(`Ville du bien : ${sc.ville}`);
  if (sc.type) criteriaLines.push(`Type : ${sc.type}`);
  if (sc.piecesMin) criteriaLines.push(`Pièces : ${sc.piecesMin}`);
  if (sc.surfaceMin) criteriaLines.push(`Surface : ${sc.surfaceMin} m²`);
  if (sc.budgetMin)
    criteriaLines.push(
      `Prix de vente : ${sc.budgetMin.toLocaleString("fr-FR")} €`,
    );
  if (sc.etatBien) criteriaLines.push(`État : ${sc.etatBien}`);
  if (sc.niveauEnergetique) criteriaLines.push(`DPE : ${sc.niveauEnergetique}`);

  const matchSummary = topMatches.map((m, i) => ({
    rang: i + 1,
    ville: m.ville,
    budgetMax: m.budgetMax,
    surface: m.surfaceMin || m.surface,
    pieces: m.piecesMin || m.pieces,
    contact: m.contact,
    compatibilite: m.compatibility,
  }));

  let intentInstruction = "";

  if (intent === "contact") {
    intentInstruction = `
INTENTION DÉTECTÉE : MISE EN RELATION
Le vendeur veut contacter un acheteur parmi ses matchs.
→ Demande QUEL acheteur (liste numérotée : ville, budget, compatibilité).
→ Sois direct : "Voici vos ${topMatches.length} acheteurs potentiels — lequel souhaitez-vous contacter ?"
→ NE dis pas que tu ne peux pas envoyer de messages. Le système le fait.
`;
  } else if (intent === "modify_criteria") {
    intentInstruction = `
INTENTION DÉTECTÉE : MODIFICATION
Le vendeur veut ajuster les caractéristiques de son bien ou son prix.
→ Affiche le récapitulatif des caractéristiques actuelles (liste).
→ Demande ce qu'il souhaite modifier.
→ Explique que modifier le prix ou la surface peut impacter le matching.
`;
  } else if (intent === "market_analysis") {
    intentInstruction = `
INTENTION DÉTECTÉE : ANALYSE MARCHÉ
→ Analyse le profil des acheteurs matchés : budget médian, localisation, exigences surfaces.
→ Évalue si le prix de vente est positionné correctement par rapport à la demande réelle.
→ Recommande une stratégie de vente concrète basée sur les données.
`;
  } else if (intent === "compare") {
    intentInstruction = `
INTENTION DÉTECTÉE : COMPARAISON
→ Compare les acheteurs potentiels : solvabilité (budget), localisation, score de compatibilité.
→ Identifie le profil acheteur le plus sérieux et le plus solvable.
→ Recommandation finale nette sur quel acheteur prioriser.
`;
  } else {
    intentInstruction = `
INTENTION : CONSEIL GÉNÉRAL
→ Conseil expert sur la vente, le positionnement, ou les démarches à suivre.
→ S'appuie sur les données des acheteurs matchés.
`;
  }

  return `Tu es un conseiller immobilier expert de haut niveau. Un vendeur vient de recevoir ses acheteurs potentiels.
 
PROFIL DU BIEN :
${criteriaLines.map((l) => `  - ${l}`).join("\n") || "  (données incomplètes)"}
 
ACHETEURS MATCHÉS (${topMatches.length}) :
${JSON.stringify(matchSummary, null, 2)}
 
MESSAGE DE L'UTILISATEUR : "${userMessage}"
 
${intentInstruction}
 
RÈGLES ABSOLUES :
- NE jamais répéter textuellement le même message deux fois de suite
- NE jamais dire "je ne peux pas" pour une action que le serveur gère
- Toujours t'appuyer sur les données réelles des matchs
- Ton rôle : conseiller premium, précis, direct, utile
- Maximum 4 phrases sauf si comparaison
 
Réponds UNIQUEMENT avec ce JSON :
{
  "message": "ton message de conseiller expert",
  "intent": "${intent}",
  "criteria": null
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
      __NO_RESULTS__: `La recherche n'a retourné aucun profil correspondant aux critères de l'utilisateur. 
Explique-lui avec empathie qu'aucun résultat ne correspond exactement à ses critères actuels.
Propose-lui deux ou trois pistes concrètes pour débloquer la situation : élargir le rayon géographique, revoir légèrement le budget à la hausse, ou assouplir la surface minimum.
Termine par une question ouverte pour savoir ce qu'il préfère ajuster en premier.
Ne dis jamais que des profils ont été affichés. Sois direct, bienveillant et constructif.`,
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
// AJOUTER à la fin de aiParsee.js, avant la dernière ligne
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

  const systemPrompt =
    role === "seller"
      ? buildSellerResultsPrompt(
          existingCriteria,
          matches,
          userMessage,
          intent,
          context,
        )
      : buildBuyerResultsPrompt(
          existingCriteria,
          matches,
          userMessage,
          intent,
          context,
        );

  const aiText = await callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    600,
  );

  if (!aiText) {
    return {
      message: "Je suis à votre disposition pour analyser ces profils.",
      intent: "general",
      criteria: null,
    };
  }

  const raw = extractJSON(aiText);

  if (!raw) {
    return {
      message: aiText.trim(),
      intent,
      criteria: null,
    };
  }

  return {
    message: raw?.message?.trim() || "Je suis à votre disposition.",
    intent: raw?.intent || intent,
    criteria: null,
  };
}
