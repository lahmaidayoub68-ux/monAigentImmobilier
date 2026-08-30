const API_KEY =
  "cpk_7c93df9eeef24a7ba0870b5baf9cba73.2a8cd5582efc5b59bf330c91223c6a90.O5yLG1DJa0WZhQR4JaWnpWr4dewDaNhV";
const MODEL = "Qwen/Qwen3-32B-TEE";

async function testIA() {
  const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: "Bonjour ! Présente-toi en une phrase.",
        },
      ],
      max_tokens: 100,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Erreur Chutes :", data);
    return;
  }

  console.log("Réponse de l'IA :", data.choices[0].message.content);
}

testIA();
