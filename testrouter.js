import Cerebras from "@cerebras/cerebras_cloud_sdk";
import dotenv from "dotenv";

dotenv.config();
const client = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
});

async function listModels() {
  try {
    const models = await client.models.list();

    console.log("📦 Modèles disponibles :");
    models.data.forEach((m, i) => {
      console.log(`${i + 1}. ${m.id}`);
    });

    return models.data;
  } catch (err) {
    console.error("❌ Erreur list models:", err.message);
  }
}

listModels();
