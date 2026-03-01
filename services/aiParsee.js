import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

function normalizeNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  value = value.replace(/\s+/g, "");
  if (value.toLowerCase().endsWith("k"))
    return Math.round(parseFloat(value.slice(0, -1)) * 1000);
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

const aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
let conversationMessages = [];

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
Phase : ${phase}
MatchingProfiles : ${JSON.stringify(matchingProfiles)}
`;

  if (conversationMessages.length === 0) {
    conversationMessages.push({ role: "system", text: systemPrompt });
  }

  conversationMessages.push({ role: "user", text: userMessage });

  try {
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: conversationMessages,
    });

    const aiText = response.output_text || "";
    conversationMessages.push({ role: "assistant", text: aiText });

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
