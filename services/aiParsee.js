import "dotenv/config";
import Together from "together-ai";

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
   Together Client
========================= */

const aiClient = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

let conversationMessages = [];

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

  const systemPrompt = `
Tu es un assistant immobilier. Tu es dans la peau d’un agent immobilier humain.
Tu discutes avec l’utilisateur pour l’aider à acheter ou vendre un bien.
Tu parles naturellement mais tu DOIS répondre uniquement avec un JSON strict au format :
{
  "message": "texte naturel",
  "criteria": {
    "intent": null,
    "type": null,
    "ville": null,
    "budgetMin": null,
    "piecesMin": null,
    "espaceMin": null
  }
}
Aucune explication, aucun texte hors JSON. Même le message humain doit être dans "message".
Si tu n'es pas sûr, mets la valeur à null.
Ne produis JAMAIS de texte hors JSON.
Ne mets PAS de balises json .
Toute réponse non conforme sera considérée comme une erreur.
Phase : ${phase}
MatchingProfiles : ${JSON.stringify(matchingProfiles)}
`;

  if (conversationMessages.length === 0) {
    conversationMessages.push({
      role: "system",
      content: systemPrompt,
    });
  }

  conversationMessages.push({
    role: "user",
    content: userMessage,
  });

  try {
    const response = await aiClient.chat.completions.create({
      model: "ServiceNow-AI/Apriel-1.6-15b-Thinker",
      messages: conversationMessages,
      temperature: 0.2,
    });

    const aiText = response?.choices?.[0]?.message?.content || "";
    console.log("AI TEXT RAW:", aiText);

    conversationMessages.push({
      role: "assistant",
      content: aiText,
    });

    const raw = extractJSON(aiText);

    const normalized = { ...existingCriteria };

    if (raw.criteria && typeof raw.criteria === "object") {
      for (const key of Object.keys(raw.criteria)) {
        if (["budgetMin", "piecesMin", "espaceMin"].includes(key)) {
          const n = normalizeNumber(raw.criteria[key]);
          if (n !== undefined) normalized[key] = n;
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
