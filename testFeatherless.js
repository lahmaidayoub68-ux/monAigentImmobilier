import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

import "dotenv/config";

async function testGPT5() {
  const client = ModelClient(
    "https://models.github.ai/inference",
    new AzureKeyCredential(process.env.GITHUB_TOKEN),
  );

  try {
    const response = await client.path("/chat/completions").post({
      body: {
        model: "openai/gpt-4.1",

        messages: [
          {
            role: "user",
            content: "Dis juste bonjour",
          },
        ],

        max_completion_tokens: 100,
      },
    });

    console.log(JSON.stringify(response.body, null, 2));
  } catch (e) {
    console.error(e);
  }
}

testGPT5();
