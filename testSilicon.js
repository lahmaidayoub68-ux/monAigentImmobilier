import "dotenv/config";
import fs from "node:fs/promises";

const API_KEY = process.env.NEURAL4D_API_KEY;
const BASE_URL = "https://alb.neural4d.com:3000/api";

const PROMPT =
  "A high-quality magical crystal sword, low-poly game asset style, " +
  "detailed ornate hilt, translucent blue crystal blade, clean geometry";

const MODEL_COUNT = 1;
const DISABLE_PBR = 1; // 1 = sans textures PBR ; 0 = avec PBR
const POLL_INTERVAL_MS = 10_000;
const MAX_ATTEMPTS = 36;

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lit la réponse sans supposer qu'elle contient du JSON.
 * Affiche un extrait utile si le serveur renvoie du HTML.
 */
async function readResponse(response, label) {
  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    const preview = raw.slice(0, 500).replace(/\s+/g, " ");

    throw new Error(
      `${label} : le serveur n'a pas renvoyé du JSON.\n` +
        `HTTP ${response.status} ${response.statusText}\n` +
        `Content-Type : ${response.headers.get("content-type")}\n` +
        `Réponse : ${preview || "(vide)"}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `${label} : HTTP ${response.status}\n` + JSON.stringify(data, null, 2),
    );
  }

  return data;
}

/**
 * Envoie une requête à l'API officielle Neural4D.
 */
async function apiPost(endpoint, body, label) {
  const response = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  return readResponse(response, label);
}

/**
 * Vérifie le solde avant de lancer une génération payante en crédits.
 */
async function checkBalance() {
  console.log("🔎 Vérification du solde de crédits...");

  const data = await apiPost("queryPointsInfo", {}, "Vérification du solde");

  if (data.statusType !== 0) {
    throw new Error(
      "Impossible de confirmer le solde. Génération annulée par sécurité.\n" +
        JSON.stringify(data, null, 2),
    );
  }

  const balance = Number(data.data);

  if (!Number.isFinite(balance)) {
    throw new Error(
      "Le solde reçu n'est pas numérique. Génération annulée par sécurité.\n" +
        JSON.stringify(data, null, 2),
    );
  }

  console.log(`💳 Solde disponible : ${balance} crédits`);

  if (balance < 60) {
    throw new Error(
      `Solde insuffisant : ${balance} crédits disponibles, ` +
        "mais 60 crédits sont nécessaires pour cette génération. " +
        "Aucune génération n'a été lancée.",
    );
  }

  return balance;
}

/**
 * Télécharge le modèle généré.
 */
async function downloadModel(modelUrl) {
  if (typeof modelUrl !== "string" || !modelUrl.startsWith("https://")) {
    throw new Error(`URL du modèle absente ou invalide : ${String(modelUrl)}`);
  }

  console.log("\n📥 Téléchargement du modèle 3D...");

  const response = await fetch(modelUrl, {
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(
      `Téléchargement impossible : HTTP ${response.status}\n${details}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length === 0) {
    throw new Error("Le fichier téléchargé est vide.");
  }

  const filename = "neural4d-model.glb";
  await fs.writeFile(filename, bytes);

  console.log(`✅ Fichier enregistré : ${filename}`);
  console.log(`📦 Taille : ${(bytes.length / 1024 / 1024).toFixed(2)} Mo`);
}

/**
 * Génération texte-vers-3D et récupération du résultat.
 */
async function testNeural4DGeneration() {
  if (!API_KEY) {
    throw new Error(
      "NEURAL4D_API_KEY n'est pas définie dans ton fichier .env.",
    );
  }

  console.log("🚀 1. Connexion à l'API officielle Neural4D...");
  console.log(`🌐 Endpoint : ${BASE_URL}`);

  await checkBalance();

  console.log("\n🧊 2. Envoi de la demande de génération 3D...");

  const generation = await apiPost(
    "generateModelWithText",
    {
      prompt: PROMPT,
      modelCount: MODEL_COUNT,
      disablePbr: DISABLE_PBR,
    },
    "Création du modèle",
  );

  const uuids = generation.uuids;

  if (!Array.isArray(uuids) || uuids.length === 0) {
    throw new Error(
      "La génération n'a retourné aucun UUID.\n" +
        JSON.stringify(generation, null, 2),
    );
  }

  const uuid = uuids[0];

  console.log("✅ Demande acceptée !");
  console.log(`🆔 UUID : ${uuid}`);
  console.log("\n⏳ 3. Attente de la fin de génération...");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await delay(POLL_INTERVAL_MS);

    const result = await apiPost(
      "retrieveModel",
      { uuid },
      `Vérification ${attempt}`,
    );

    const status = Number(result.codeStatus);

    console.log(
      `[${attempt}/${MAX_ATTEMPTS}] ` +
        `codeStatus=${String(result.codeStatus)}`,
    );

    if (status === 0) {
      console.log("\n🎉 Modèle 3D généré !");
      console.log("🔗 URL du modèle :", result.modelUrl);

      await downloadModel(result.modelUrl);
      return;
    }

    if (status === 1) {
      console.log("   Génération toujours en cours...");
      continue;
    }

    if (status === -1) {
      throw new Error(
        "Clé API invalide ou expirée. Vérifie ton token Neural4D.",
      );
    }

    if (status === -2) {
      throw new Error(
        "UUID inconnu de Neural4D. La tâche n'a pas été retrouvée.",
      );
    }

    if (status === -3) {
      throw new Error(
        "La génération a échoué : " +
          (result.message || JSON.stringify(result)),
      );
    }

    throw new Error(
      "Statut inattendu renvoyé par Neural4D :\n" +
        JSON.stringify(result, null, 2),
    );
  }

  console.log(
    "\n⌛ Délai dépassé. La génération peut encore continuer côté serveur.",
  );
  console.log(`Tu peux vérifier cette tâche plus tard avec l'UUID : ${uuid}`);
}

testNeural4DGeneration().catch((error) => {
  console.error("\n❌ Échec du test Neural4D :");
  console.error(error.message);
  process.exitCode = 1;
});
