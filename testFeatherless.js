import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

// 🔐 Vérification de la clé API
if (!process.env.FEATHERLESS_API_KEY) {
  console.error("❌ ERREUR: FEATHERLESS_API_KEY manquante dans le .env");
  process.exit(1);
}

console.log("✅ Clé API détectée");

// ⚙️ Initialisation client
const client = new OpenAI({
  baseURL: "https://api.featherless.ai/v1",
  apiKey: process.env.FEATHERLESS_API_KEY,
});

// 🧠 Modèles à tester (fallback auto)
const MODELS = [
  "meta-llama/Llama-3-8b-instruct",
  "mistralai/Mistral-7B-Instruct-v0.2",
  "tiiuae/falcon-7b-instruct",
];

// 🔁 Fonction avec retry + fallback
async function callWithRetry(messages, maxRetries = 2) {
  for (let model of MODELS) {
    console.log(`\n🧪 Test du modèle: ${model}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`➡️ Tentative ${attempt}/${maxRetries}`);

        const response = await client.chat.completions.create({
          model,
          messages,
          max_tokens: 150,
        });

        console.log("📥 Réponse brute reçue");
        console.log(JSON.stringify(response, null, 2));

        const content = response?.choices?.[0]?.message?.content;

        if (!content) {
          console.warn("⚠️ Réponse vide, on retente...");
          continue;
        }

        console.log("\n💬 Réponse IA finale :");
        console.log(content);

        return content;
      } catch (error) {
        console.error(`❌ Erreur (tentative ${attempt})`);

        if (error.response) {
          console.error("📡 Status:", error.response.status);
          console.error("📡 Data:", error.response.data);
        } else {
          console.error("🧠 Message:", error.message);
        }

        if (attempt === maxRetries) {
          console.warn("⚠️ Échec total pour ce modèle, on passe au suivant...");
        } else {
          console.log("🔁 Retry...");
        }
      }
    }
  }

  throw new Error("❌ Tous les modèles ont échoué");
}

// ▶️ Test principal
async function testFeatherless() {
  console.log("🚀 Lancement du test Featherless");

  const messages = [
    {
      role: "system",
      content: "Tu es un assistant immobilier concis.",
    },
    {
      role: "user",
      content: "Donne-moi un conseil rapide pour investir à Paris",
    },
  ];

  try {
    await callWithRetry(messages);
  } catch (err) {
    console.error("\n💥 ERREUR FINALE:");
    console.error(err.message);
  }
}

// ▶️ Lancement
testFeatherless();
