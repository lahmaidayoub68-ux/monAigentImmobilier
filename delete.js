import "dotenv/config";

const apiKey = process.env.COHERE_API_KEY;

if (!apiKey) {
  console.error("❌ COHERE_API_KEY manquante dans .env");
  process.exit(1);
}

const API_URL = "https://api.cohere.com";

const prompt = `
Rédige un paragraphe détaillé en français sur les principaux enjeux
géopolitiques et humanitaires liés aux conflits actuels au Moyen-Orient.

Reste factuel, neutre et prudent concernant les informations susceptibles
d'évoluer. N'invente pas de chiffres ou de faits.

Le texte doit faire environ 150 à 200 mots.
`;

async function getModels() {
  const models = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      endpoint: "chat",
      page_size: "100",
    });

    if (pageToken) {
      params.set("page_token", pageToken);
    }

    const response = await fetch(`${API_URL}/v1/models?${params}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.message || data?.error || `HTTP ${response.status}`,
      );
    }

    models.push(...(data.models || []));
    pageToken = data.next_page_token || null;
  } while (pageToken);

  return models.filter(
    (model) => !model.is_deprecated && model.endpoints?.includes("chat"),
  );
}

async function testModel(model) {
  const start = Date.now();

  const response = await fetch(`${API_URL}/v2/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.name,
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
      error: data?.message || data?.error || `HTTP ${response.status}`,
    };
  }

  const content = data?.message?.content;

  const text = Array.isArray(content)
    ? content
        .filter((item) => item?.type === "text")
        .map((item) => item.text)
        .join("\n")
        .trim()
    : "";

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
    finishReason: data?.finish_reason,
    usage: data?.usage,
  };
}

async function main() {
  console.log("🚀 TEST RÉEL DE L'API COHERE\n");
  console.log("🔑 Récupération des modèles accessibles...");

  let models;

  try {
    models = await getModels();
  } catch (error) {
    console.error("❌ Impossible de récupérer les modèles.");
    console.error(`   ${error.message}`);
    process.exit(1);
  }

  console.log(`✅ ${models.length} modèles Chat actifs retournés par Cohere.`);

  if (models.length === 0) {
    console.error("\n❌ Aucun modèle Chat actif accessible.");
    process.exit(1);
  }

  console.log("\nModèles détectés :");

  for (const model of models) {
    console.log(`  • ${model.name}`);
  }

  console.log("\n" + "─".repeat(70));

  const results = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];

    console.log(`\n[${i + 1}/${models.length}] 🔄 ${model.name}`);

    try {
      const result = await testModel(model);

      results.push({
        model: model.name,
        ...result,
      });

      if (result.success) {
        console.log("✅ SUCCÈS");
        console.log(`⏱️  Temps : ${result.duration} ms`);

        if (result.finishReason) {
          console.log(`🏁 Fin : ${result.finishReason}`);
        }

        const tokens = result.usage?.tokens;
        const billed = result.usage?.billed_units;

        if (tokens) {
          console.log(`📥 Tokens entrée : ${tokens.input_tokens ?? "?"}`);
          console.log(`📤 Tokens sortie : ${tokens.output_tokens ?? "?"}`);
        }

        if (billed) {
          console.log(
            `💰 Tokens facturés : ${
              (billed.input_tokens ?? 0) + (billed.output_tokens ?? 0)
            }`,
          );
        }

        console.log("\n📝 Réponse :");
        console.log("─".repeat(70));
        console.log(result.text);
        console.log("─".repeat(70));
      } else {
        console.log("❌ ÉCHEC");
        console.log(`   HTTP : ${result.status}`);
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

  if (successful.length) {
    console.log("\nModèles fonctionnels :");

    for (const result of successful) {
      console.log(`  ✅ ${result.model} — ${result.duration} ms`);
    }
  }

  if (failed.length) {
    console.log("\nModèles en échec :");

    for (const result of failed) {
      console.log(
        `  ❌ ${result.model} — HTTP ${result.status ?? "?"} — ${result.error}`,
      );
    }
  }

  if (!successful.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\n💥 Erreur fatale :");
  console.error(error.message);
  process.exitCode = 1;
});
