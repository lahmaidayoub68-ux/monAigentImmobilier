import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// === Chemin absolu du fichier courant ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const villesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "villes_simplifie.json"), "utf-8"),
);

import {
  addSeller,
  addBuyer,
  scoreVille,
  normalize,
} from "./matchingEngine.js";

// ================== CONFIG ==================
const types = ["appartement", "maison"];
const contactsDomain = "test.com";

// ================== UTILS ==================
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateContact(username) {
  return `${username}@${contactsDomain}`;
}

// ================== FONCTION PRINCIPALE ==================
export function seedProfiles(count = 50) {
  console.log(
    `🚀 Génération de ${count} vendeurs et ${count} acheteurs fictifs...`,
  );

  const sellersData = [];
  const buyersData = [];

  // ===== VENDEURS EN MEMOIRE =====
  for (let i = 1; i <= count; i++) {
    const villeObj = randomChoice(villesData); // { ville, lat, lng }
    const type = randomChoice(types);
    const price = randomInt(100_000, 1_000_000);
    const surface = randomInt(20, 200);
    const pieces = randomInt(1, 6);
    const contact = generateContact(`seller${i}`);

    sellersData.push({
      username: `seller${i}`,
      ville: villeObj.ville,
      type: normalize(type),
      price,
      surface,
      pieces,
      contact,
      lat: villeObj.lat,
      lng: villeObj.lng,
    });
  }

  // ===== ACHETEURS EN MEMOIRE =====
  for (let i = 1; i <= count; i++) {
    const villeObj = randomChoice(villesData);
    const type = randomChoice(types);

    const referenceSeller = randomChoice(sellersData);

    const budgetBase = referenceSeller.price;
    const budgetMin = Math.floor(budgetBase * 0.8);
    const budgetMax = Math.floor(budgetBase * 1.2);

    const pieces = randomInt(1, 5);
    const surface = randomInt(30, 150);

    const piecesMin = Math.min(pieces, referenceSeller.pieces);
    const surfaceMin = Math.min(surface, referenceSeller.surface);

    const contact = generateContact(`buyer${i}`);

    buyersData.push({
      username: `buyer${i}`,
      ville: normalize(villeObj.ville),
      type: normalize(type),
      budgetMin,
      budgetMax,
      piecesMin,
      surfaceMin,
      pieces,
      surface,
      contact,
      lat: villeObj.lat,
      lng: villeObj.lng,
    });
  }

  // ===== AJOUT DES VENDEURS =====
  const sellers = sellersData.map((s) => addSeller(s));

  // ===== AJOUT DES ACHETEURS =====
  const buyers = buyersData.map((b) => {
    const buyer = addBuyer(b);

    sellers.forEach((seller) => {
      scoreVille(seller.ville, buyer.ville, 30, 150);
    });

    return buyer;
  });
}
