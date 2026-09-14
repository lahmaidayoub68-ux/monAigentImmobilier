import "dotenv/config";

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.error("❌ OPENROUTER_API_KEY manquante dans .env");
  process.exit(1);
}

const API_URL = "https://openrouter.ai/api/v1";

const prompt = `
Rédige un paragraphe détaillé en français sur les principaux enjeux
géopolitiques et humanitaires liés aux conflits actuels au Moyen-Orient.

Reste factuel, neutre et prudent concernant les informations susceptibles
d'évoluer. N'invente pas de chiffres ou de faits.

Le texte doit faire environ 150 à 200 mots.
`;

async function getFreeModels() {
  const response = await fetch(`${API_URL}/models?output_modalities=text`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || data?.message || `HTTP ${response.status}`,
    );
  }

  return (data.data || []).filter((model) => {
    const promptPrice = Number(model.pricing?.prompt ?? -1);
    const completionPrice = Number(model.pricing?.completion ?? -1);

    return (
      promptPrice === 0 &&
      completionPrice === 0 &&
      model.architecture?.output_modalities?.includes("text")
    );
  });
}

function priority(model) {
  const id = model.id.toLowerCase();

  if (id.includes("nemotron")) return 100;
  if (id.includes("trinity-large")) return 95;
  if (id.includes("deepseek")) return 90;
  if (id.includes("qwen")) return 85;
  if (id.includes("llama")) return 80;

  return 10;
}

async function testModel(model) {
  const start = Date.now();

  const response = await fetch(`${API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.id,
      messages: [
        {
          role: "user",
          content: prompt.trim(),
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  const duration = Date.now() - start;

  let data;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      success: false,
      status: response.status,
      duration,
      error: data?.error?.message || data?.message || `HTTP ${response.status}`,
    };
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    return {
      success: false,
      status: response.status,
      duration,
      error: "Réponse reçue mais contenu texte vide.",
    };
  }

  return {
    success: true,
    duration,
    text,
    modelUsed: data?.model || model.id,
    usage: data?.usage || null,
  };
}

async function main() {
  console.log("🚀 TEST RÉEL DE L'API OPENROUTER\n");

  console.log("🔑 Récupération des modèles gratuits...");

  let freeModels;

  try {
    freeModels = await getFreeModels();
  } catch (error) {
    console.error("❌ Impossible de récupérer les modèles.");
    console.error(`   ${error.message}`);
    process.exit(1);
  }

  freeModels.sort((a, b) => priority(b) - priority(a));

  console.log(
    `✅ ${freeModels.length} modèles gratuits actuellement détectés.`,
  );

  if (freeModels.length === 0) {
    console.error("\n❌ Aucun modèle gratuit détecté.");
    process.exit(1);
  }

  const models = freeModels.slice(0, 5);

  console.log(`🧪 ${models.length} modèles sélectionnés.\n`);

  console.log("Modèles testés :");

  for (const model of models) {
    console.log(`  • ${model.id}`);
  }

  console.log("\n" + "─".repeat(70));

  const results = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];

    console.log(`\n[${i + 1}/${models.length}] 🔄 ${model.id}`);

    try {
      const result = await testModel(model);

      results.push({
        model: model.id,
        ...result,
      });

      if (result.success) {
        console.log("✅ SUCCÈS");
        console.log(`⏱️  Temps : ${result.duration} ms`);

        if (result.modelUsed) {
          console.log(`🤖 Modèle réellement utilisé : ${result.modelUsed}`);
        }

        if (result.usage) {
          console.log(
            `📥 Tokens entrée : ${result.usage.prompt_tokens ?? "?"}`,
          );

          console.log(
            `📤 Tokens sortie : ${result.usage.completion_tokens ?? "?"}`,
          );

          console.log(`📊 Total tokens : ${result.usage.total_tokens ?? "?"}`);
        }

        console.log("\n📝 Réponse :");
        console.log("─".repeat(70));
        console.log(result.text);
        console.log("─".repeat(70));
      } else {
        console.log("❌ ÉCHEC");
        console.log(`   HTTP : ${result.status ?? "?"}`);
        console.log(`   ${result.error}`);
      }
    } catch (error) {
      console.log("❌ ERREUR");
      console.log(`   ${error.message}`);
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log("📊 RÉSUMÉ");
  console.log("═".repeat(70));

  const successful = results.filter((result) => result.success);

  const failed = results.filter((result) => !result.success);

  console.log(
    `\n✅ ${successful.length}/${results.length} modèles fonctionnels`,
  );

  if (successful.length > 0) {
    console.log("\nModèles fonctionnels :");

    for (const result of successful) {
      console.log(`  ✅ ${result.model} — ${result.duration} ms`);
    }
  }

  if (failed.length > 0) {
    console.log("\nModèles en échec :");

    for (const result of failed) {
      console.log(
        `  ❌ ${result.model} — HTTP ${result.status ?? "?"} — ${result.error}`,
      );
    }
  }

  if (successful.length === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\n💥 Erreur fatale :");
  console.error(error.message);
  process.exitCode = 1;
});
