import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const UNSPLASH_KEY = process.env.UNSPLASH_KEY;

if (!UNSPLASH_KEY) {
  throw new Error("❌ UNSPLASH_KEY manquant dans .env");
}

// ================== CONFIG ==================
const TARGET_HOUSES = 25;
const TARGET_APTS = 25;
const MAX_ATTEMPTS = 120;

// ================== PROMPTS ==================
const HOUSE_PROMPTS = [
  "modern house exterior france architecture garden sunlight ultra realistic",
  "luxury house living room natural light interior design wide angle",
  "modern kitchen marble wood high end house interior cinematic",
  "cozy modern bedroom minimal design warm light house interior",
  "luxury bathroom stone marble spa style house interior",
  "french house garden backyard trees summer realistic",
  "elegant dining room modern house interior design table setup",
  "modern staircase architecture house interior design minimal",
  "terrace outdoor modern house sunlight furniture lifestyle",
  "house entrance front door modern architecture realistic",
  "secondary bedroom modern house interior cozy minimal",
  "modern garage house exterior driveway car realistic",
];

const APARTMENT_PROMPTS = [
  "modern apartment paris architecture exterior city skyline realistic",
  "apartment living room city view natural light modern design",
  "small apartment kitchen compact modern design wood clean",
  "modern apartment bedroom cozy minimal paris style interior",
  "luxury apartment bathroom clean marble tiles modern design",
  "apartment balcony paris skyline sunset realistic view",
  "modern apartment dining area small space design aesthetic",
  "apartment hallway clean modern interior architecture",
  "apartment office workspace modern aesthetic minimal setup",
  "apartment window paris skyline city night view realistic",
  "luxury apartment lobby entrance modern architecture glass",
  "apartment facade paris modern building architecture street",
];

// ================== LOG UTILS ==================
const log = (msg) => console.log(`[UNSPLASH] ${msg}`);

// ================== FETCH UNSPLASH ==================
async function fetchImages(query) {
  try {
    log(`Fetch → ${query}`);

    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        query,
      )}&per_page=30&orientation=landscape&client_id=${UNSPLASH_KEY}`,
    );

    const data = await res.json();

    if (!data?.results?.length) {
      log(`⚠️ Aucun résultat → ${query}`);
      return [];
    }

    const urls = data.results.map((img) => img.urls.regular);

    log(`✔ ${urls.length} images reçues`);
    return urls;
  } catch (e) {
    log(`❌ Erreur fetch ${query} → ${e.message}`);
    return [];
  }
}

// ================== POOL UNIQUE BUILDER ==================
async function buildUniquePool(prompts, targetSize, label) {
  const pool = new Set();
  const used = new Set();

  let attempts = 0;

  log(`🚀 BUILD ${label} → target ${targetSize}`);

  while (pool.size < targetSize && attempts < MAX_ATTEMPTS) {
    const prompt =
      prompts[Math.floor(Math.random() * prompts.length)] +
      " ultra realistic high quality";

    const images = await fetchImages(prompt);

    for (const url of images) {
      if (pool.size >= targetSize) break;

      // anti doublon STRICT
      if (!used.has(url)) {
        used.add(url);
        pool.add(url);
      }
    }

    log(
      `📊 ${label} progress: ${pool.size}/${targetSize} (attempt ${attempts})`,
    );

    attempts++;
  }

  if (pool.size < targetSize) {
    log(
      `⚠️ WARNING ${label}: seulement ${pool.size}/${targetSize} images générées`,
    );
  } else {
    log(`✅ ${label} complete`);
  }

  return Array.from(pool);
}

// ================== MAIN ==================
async function generatePool() {
  console.log("\n🚀 Génération dataset ULTRA PRO (50 images uniques)\n");

  const [houses, apts] = await Promise.all([
    buildUniquePool(HOUSE_PROMPTS, TARGET_HOUSES, "MAISON"),
    buildUniquePool(APARTMENT_PROMPTS, TARGET_APTS, "APPARTEMENT"),
  ]);

  const imagePools = {
    maison: houses,
    appartement: apts,
  };

  fs.writeFileSync("imagePools.json", JSON.stringify(imagePools, null, 2));

  console.log("\n=====================");
  console.log("✅ DONE FINAL RESULT");
  console.log("🏡 maisons:", houses.length);
  console.log("🏢 appartements:", apts.length);
  console.log("📦 total:", houses.length + apts.length);
  console.log("=====================\n");
}

generatePool();
