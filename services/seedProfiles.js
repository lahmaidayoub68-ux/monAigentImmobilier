import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { addSeller, addBuyer, normalize } from "./matchingEngine.js";

// ================== PATH ==================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const villesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "villes-france.json"), "utf-8"),
);

// ================== IMAGE POOLS (SAFE IMPORT) ==================
const imagePools = JSON.parse(
  fs.readFileSync(new URL("./imagePools.json", import.meta.url), "utf-8"),
);

const IMAGE_POOL_MAISON = imagePools.maison || [];
const IMAGE_POOL_APPART = imagePools.appartement || [];

// ================== CONFIG ==================
const TYPES = ["appartement", "maison"];

const ETATS_BIEN = ["neuf", "renove", "bon", "a_rafraichir", "travaux"];
const NIVEAUX_ENERGETIQUES = ["A", "B", "C", "D", "E", "F", "G"];

const SEED_TAG = "SEED_2026_BATCH_1";

// ================== EMAIL POOL ==================
const emailPool = Array.from({ length: 100 }, (_, i) => {
  const names = [
    "alex",
    "julien",
    "sarah",
    "mehdi",
    "lea",
    "nicolas",
    "camille",
    "antoine",
    "emma",
    "lucas",
    "ines",
    "thomas",
    "manon",
    "youssef",
    "hugo",
    "clara",
    "adam",
    "lina",
    "maxime",
    "chloe",
  ];

  const domains = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.fr"];

  const name = names[i % names.length];
  const num = Math.floor(Math.random() * 999);

  return `${name}${num}@${domains[Math.floor(Math.random() * domains.length)]}`;
});

// ================== UTILS ==================
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomEmail() {
  return emailPool[Math.floor(Math.random() * emailPool.length)];
}

// ================== IMAGE SELECTION ==================
function getRandomImages(type) {
  const pool = type === "maison" ? IMAGE_POOL_MAISON : IMAGE_POOL_APPART;

  const count = randomInt(1, 3);

  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

// ================== SEED ==================
export async function seedProfiles(count = 50) {
  console.log(`🚀 SEED ${SEED_TAG} → ${count} sellers & buyers`);

  const sellersData = [];
  const buyersData = [];

  // ================== SELLERS ==================
  for (let i = 1; i <= count; i++) {
    const ville = randomChoice(villesData);
    const type = randomChoice(TYPES);

    sellersData.push({
      username: `seller_seed_${i}`,
      contact: getRandomEmail(),

      ville: ville.ville,
      region: ville.ville,
      departement: ville.departement,
      code: ville.code,

      type: normalize(type),
      price: randomInt(120_000, 900_000),
      surface: randomInt(25, 180),
      pieces: randomInt(1, 6),

      lat: ville.lat,
      lng: ville.lng,

      etatBien: randomChoice(ETATS_BIEN),
      niveauEnergetique: randomChoice(NIVEAUX_ENERGETIQUES),

      imagesbien: getRandomImages(type),

      seedTag: SEED_TAG,
    });
  }

  // ================== BUYERS ==================
  for (let i = 1; i <= count; i++) {
    const ville = randomChoice(villesData);
    const type = randomChoice(TYPES);
    const ref = randomChoice(sellersData);

    const budgetBase = ref.price;

    buyersData.push({
      username: `buyer_seed_${i}`,
      contact: getRandomEmail(),

      ville: ville.ville,
      region: ville.ville,
      departement: ville.departement,
      code: ville.code,

      type: normalize(type),

      budgetMin: Math.floor(budgetBase * 0.8),
      budgetMax: Math.floor(budgetBase * 1.2),

      pieces: randomInt(1, 5),
      surface: randomInt(30, 150),

      piecesMin: Math.min(ref.pieces, 2),
      surfaceMin: Math.min(ref.surface, 60),

      lat: ville.lat,
      lng: ville.lng,

      toleranceKm: randomInt(5, 80),

      seedTag: SEED_TAG,
    });
  }

  // ================== DB INSERT ==================
  const sellers = await Promise.all(sellersData.map(addSeller));

  const buyers = await Promise.all(buyersData.map(addBuyer));

  console.log(
    `✅ DONE ${SEED_TAG} →`,
    sellers.length,
    "sellers /",
    buyers.length,
    "buyers",
  );

  return { sellers, buyers };
}
