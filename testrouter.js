// test-ia.js
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

async function testIA() {
  try {
    const aiClient = new OpenAI({
      apiKey: process.env.ROUTER, // ta clé OpenRouter
      baseURL: "https://openrouter.ai/api/v1", // URL correcte
    });

    const prompt = `
      Tu es un expert immobilier. Analyse ces biens fictifs :
      [
        { "ville": "Montreuil", "budget": 350000, "surface": 70, "pieces": 3 },
        { "ville": "Paris", "budget": 550000, "surface": 50, "pieces": 2 }
      ]
      Fournis un texte structuré, clair et concis.
    `;

    const aiResponse = await aiClient.chat.completions.create({
      model: "openai/gpt-4o-mini", // ou un modèle gratuit : "openai/gpt-4o-mini"
      messages: [
        { role: "system", content: "Tu es un expert analyste immobilier." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    });

    const aiText = aiResponse?.choices?.[0]?.message?.content?.trim();
    console.log("=== IA OUTPUT ===\n", aiText);
  } catch (err) {
    console.error("Erreur IA :", err);
  }
}

testIA();
