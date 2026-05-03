import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY manquante");
  process.exit(1);
}

const API_KEY = process.env.GEMINI_API_KEY;

const MODELS = [
  "gemini-2.5-pro", // 🧠 meilleur
  "gemini-2.5-flash", // ⚡ fallback rapide
];

async function testGemini() {
  console.log("🚀 Envoi requête à Gemini...");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Donne-moi un conseil rapide pour investir dans l'immobilier à Paris.",
          },
        ],
      },
    ],
  };

  for (const model of MODELS) {
    try {
      console.log(`🧪 Test model: ${model}`);

      const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${API_KEY}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      console.log("📡 Status:", res.status);

      const data = await res.json();
      console.log("📥 Réponse brute:", JSON.stringify(data, null, 2));

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        console.log("\n💬 Réponse Gemini:");
        console.log(text);
        return;
      }
    } catch (e) {
      console.warn("❌ Model failed:", model);
    }
  }

  console.error("💥 Tous les modèles Gemini ont échoué");
}

testGemini();
