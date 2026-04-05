import "dotenv/config";
import Together from "together-ai";
import OpenAI from "openai";

/* =========================
   Helpers
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
   Groq Client
========================= */

const aiClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/* =========================
   Main Function
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
     PROMPT COMPLET
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

────────────────────────
APRÈS AFFICHAGE DES PROFILS
────────────────────────

Uniquement si la phase est "results" :

- Tu sais que les profils suivants ont été affichés :
${JSON.stringify(matchingProfiles, null, 2)}

- Juste après l’affichage, tu proposes naturellement ton aide
  pour comparer ou choisir, sans phrase figée.

- Pour aider :
  - tu compares les profils selon les critères connus,
  - tu expliques les compromis,
  - tu peux recommander au maximum un ou deux profils,
  - si les profils sont proches, tu poses une seule question de priorité.

- Message type à envoyer : tu formules naturellement quelque chose comme
  "Parmi ces profils, souhaitez-vous que je vous aide à choisir celui qui correspond le mieux à vos critères, ou préférez-vous que je vous donne des éclaircissements sur un aspect du marché immobilier ?"
- Adapte toujours ce message au contexte et au ton de l’utilisateur.

- Tu n’inventes jamais d’informations.
- Tu ne modifies pas les critères sauf demande explicite.

La tolérance autour de la ville (toleranceKm) :
- uniquement pour les acheteurs
- elle correspond à une distance maximale autour de la ville en kilomètres
- tu poses cette question uniquement après avoir obtenu la ville
- exemple de question naturelle :
"Quel rayon maximum autour de cette ville vous conviendrait ? (en km)"
────────────────────────
STYLE
────────────────────────

- Tu reformules régulièrement ce que l’utilisateur dit.
- Tu poses des questions naturelles.
- En phase "collecting", tu termines par la question du critère manquant.
- En phase "results", tu ne poses une question que si elle aide à trancher.
- Tu restes humain, fluide, non pressant.

────────────────────────
FORMAT DE RÉPONSE (OBLIGATOIRE)
────────────────────────

Tu réponds toujours avec :
{
  "message": "message naturel et humain",
  "criteria": {
  "intent": null,
  "type": null,
  "ville": null,
  "toleranceKm": null,
  "budgetMin": null,
  "piecesMin": null,
  "espaceMin": null
}
}
- Les critères doivent conserver les valeurs existantes.
- Ne modifier que ce que l’utilisateur dit explicitement.
- Aucun texte dans les critères.
IMPORTANT :
Ne produis absolument aucun texte hors du JSON, pas de balises JSON
Si tu ajoutes du texte en dehors du JSON, la réponse sera invalide.

Critères déjà connus :
${JSON.stringify(existingCriteria)}

Message utilisateur :
"${userMessage}"
`;

  try {
    const response = await aiClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
    });

    const aiText = response?.choices?.[0]?.message?.content || "";
    console.log("AI TEXT RAW:", aiText);

    const raw = extractJSON(aiText);

    const normalized = { ...existingCriteria };

    if (raw.criteria && typeof raw.criteria === "object") {
      for (const key of Object.keys(raw.criteria)) {
        if (
          ["budgetMin", "piecesMin", "espaceMin", "toleranceKm"].includes(key)
        ) {
          const n = normalizeNumber(raw.criteria[key]);
          // ✅ Nouveau fix pour toleranceKm
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
  } catch (err) {
    console.error("[AI CHAT ERROR]", err);

    return {
      message: "Désolé, je n'ai pas compris. Pouvez-vous reformuler ?",
      criteria: { ...existingCriteria },
      readyForMatching: false,
    };
  }
}
