import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

async function main() {
  try {
    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "Tu es un assistant immobilier amical." },
        {
          role: "user",
          content: "Je cherche un appartement à Paris avec 500k €",
        },
      ],
      temperature: 0.2,
    });

    const message = response?.choices?.[0]?.message?.content;
    console.log("💬 Réponse de l'IA :", message);
  } catch (err) {
    console.error("[ERROR]", err);
  }
}

main();
