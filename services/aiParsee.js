import "dotenv/config";
import Together from "together-ai";
import OpenAI from "openai";

/* =========================
   MISTRAL CLIENT
========================= */

const mistralClient = new OpenAI({
  apiKey: process.env.MISTRAL,
  baseURL: "https://api.mistral.ai/v1",
});

async function callMistral(systemPrompt, userMessage) {
  const response = await mistralClient.chat.completions.create({
    model: "mistral-small-latest",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
  });

  return response?.choices?.[0]?.message?.content || "";
}

/* =========================
   HELPERS
========================= */

function normalizeNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;

  value = value.replace(/\s+/g, "");

  if (value.toLowerCase().endsWith("k")) {
    return Math.round(parseFloat(value.slice(0, -1)) * 1000);
  }

  const n = parseFloat(value);
  return isNaN(n) ? undefined : n;
}

function extractJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  } catch {
    return {};
  }
}

/* =========================
   GROQ CLIENT
========================= */

const aiClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

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

  /* =========================
     SYSTEM PROMPT
  ========================== */

  const systemPrompt = `
Tu es un assistant immobilier.
Tu es dans la peau d’un agent immobilier humain.

Tu discutes avec l’utilisateur (acheteur ou vendeur) pour l’aider à acheter ou à vendre un bien.
Tu parles naturellement, comme dans une vraie conversation, jamais comme un formulaire.

Ton objectif principal est d’aider l’utilisateur à formuler ses critères immobiliers
afin qu’ils puissent être utilisés par le site.
Cependant, tu peux aussi répondre naturellement si la discussion s’écarte temporairement de l’immobilier.

────────────────────────
CONTEXTE DE CONVERSATION
────────────────────────

Phase actuelle : ${phase}

- Si la phase est "collecting" :
  - ton rôle est de collecter ou affiner les critères immobiliers.
- Si la phase est "results" :
  - les profils correspondants ont déjà été affichés à l’utilisateur,
  - tu aides à comprendre, comparer et choisir parmi ces profils,
  - tu ne modifies plus les critères existants,
  - sauf si l’utilisateur exprime explicitement un nouveau critère.

────────────────────────
INTENTION
────────────────────────

- Tu détectes dès que possible si l’utilisateur est acheteur ou vendeur.
- S’il ne le précise pas, tu lui poses la question avant d’adapter la discussion.
- Si le message de l’utilisateur n’a aucun lien avec l’immobilier :
  - tu peux répondre normalement (small talk, humour, discussion libre),
  - tu ne cherches pas à collecter de critères,
  - tu ne poses aucune question immobilière,
  - tu laisses tous les critères inchangés.
- Après une digression, tu peux proposer naturellement de revenir au projet immobilier.

────────────────────────
CRITÈRES
────────────────────────

Tu peux discuter des critères suivants :
- la ville
- le budget
- le type de bien
- le nombre de pièces
- la surface (m²)

Tu enregistres uniquement ces critères :
- intent
- type
- ville
- budgetMin
- piecesMin
- espaceMin
- toleranceKm
- etatBien

Règles générales :
- Si l’utilisateur donne une valeur unique, tu l’enregistres comme minimum.
- Tu ne demandes jamais de maximum.
- Tu ne reposes jamais une question dont le critère est déjà connu.
- Si une information est floue ou non chiffrée, tu n’enregistres rien.
- Si une information n’est pas donnée, tu laisses vide.

────────────────────────
CAS VENDEUR
────────────────────────

- Si l’utilisateur est vendeur, tu dois collecter tous les critères obligatoires :
  ville, type, superficie, nombre de pièces et prix.
- Tu n’envoies la validation finale que lorsque tout est connu.
- Tu restes strictement dans le cadre de la vente du bien.

Tu dois aussi obligatoirement collecter l'état du bien (etatBien).

Règles STRICTES :
- C’est une information obligatoire.
- Tu poses cette question uniquement une fois que tous les autres critères vendeur sont connus.
- Tu poses une question ouverte et naturelle, sans proposer de choix (le choix sera géré par l’interface).
- Exemple : "Comment décririez-vous l’état général du bien ?"

────────────────────────
APRÈS AFFICHAGE DES PROFILS
────────────────────────

Uniquement si la phase est "results" :

- Tu sais que les profils suivants ont été affichés :
${JSON.stringify(matchingProfiles, null, 2)}

- Tu aides à comparer et choisir sans phrase figée.
- Tu proposes 1 à 2 profils maximum si pertinent.
- Tu n’inventes jamais d’informations.
- Tu ne modifies pas les critères sauf demande explicite.

────────────────────────
TOLÉRANCE KM
────────────────────────

- uniquement pour les acheteurs
- obligatoire après la ville

Règles STRICTES :
- Dès que ville connue + acheteur → demander toleranceKm obligatoirement
- Impossible de continuer sans cette info
- Priorité absolue

────────────────────────
PRIORITÉ QUESTIONS ACHETEUR
────────────────────────
1. ville
2. toleranceKm
3. budget
4. surface / pièces

────────────────────────
FORMAT DE RÉPONSE (OBLIGATOIRE)
────────────────────────

{
  "message": "message naturel",
  "criteria": {
    "intent": null,
    "type": null,
    "ville": null,
    "toleranceKm": null,
    "budgetMin": null,
    "piecesMin": null,
    "espaceMin": null,
    "etatBien": null
  }
}

Aucun texte hors JSON.

Critères déjà connus :
${JSON.stringify(existingCriteria)}

Message utilisateur :
"${userMessage}"
`;

  let aiText = "";

  try {
    const response = await aiClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
    });

    aiText = response?.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.warn("⚠️ Groq failed → fallback Mistral", err?.code);
    console.log("🔁 fallback Mistral");

    try {
      const mistralResponse = await mistralClient.chat.completions.create({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
      });

      aiText = mistralResponse?.choices?.[0]?.message?.content || "";
    } catch (err2) {
      console.error("❌ Mistral failed", err2);

      return {
        message:
          "Je rencontre un problème temporaire. Vos critères sont bien enregistrés.",
        criteria: { ...existingCriteria },
        readyForMatching: false,
      };
    }
  }

  console.log("AI TEXT RAW:", aiText);

  const raw = extractJSON(aiText);
  const normalized = { ...existingCriteria };

  if (raw.criteria && typeof raw.criteria === "object") {
    for (const key of Object.keys(raw.criteria)) {
      if (
        ["budgetMin", "piecesMin", "espaceMin", "toleranceKm"].includes(key)
      ) {
        const n = normalizeNumber(raw.criteria[key]);

        if (key === "toleranceKm") {
          if (n !== undefined && n > 0) normalized[key] = n;
        } else {
          if (n !== undefined) normalized[key] = n;
        }
      } else {
        normalized[key] = raw.criteria[key];
      }
    }
  }

  const readyForMatching =
    !!normalized.ville ||
    !!normalized.type ||
    !!normalized.budgetMin ||
    !!normalized.piecesMin ||
    !!normalized.espaceMin;

  return {
    message: raw.message || "",
    criteria: normalized,
    readyForMatching,
  };
}
