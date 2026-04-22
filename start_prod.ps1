// ================== DONNÉES ==================
let SELLERS = [];
let BUYERS = [];
let NEXT_SELLER_ID = 1;
let NEXT_BUYER_ID = 1;

// Valeurs max pour DB et calcul
const MAX_PIECES = 100;
const MAX_SURFACE = 1000;
const DEBUG_MATCH = true;

function logStep(step, data, type = "INFO") {
  if (!DEBUG_MATCH) return;

  const time = new Date().toISOString();
  const icon = type === "ERROR" ? "❌" : type === "WARN" ? "⚠️" : "🧠";

  const formatted =
    `${icon} [${type}] [${time}] === ${step} ===\n` +
    JSON.stringify(data, null, 2) +
    "\n\n";

  // console léger
  console.log(`${icon} ${step}`);

  // fichier complet
  logStream.write(formatted);
}
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db.js";

const LOG_PATH = path.join(process.cwd(), "logs", "match.log");

// crée dossier si pas existant
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

// stream en append (IMPORTANT: pas de surcharge mémoire)
const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });

// ================== COORDONNÉES VILLES ==================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const villesCoordsArray = JSON.parse(
  fs.readFileSync(path.join(__dirname, "villes-france.json"), "utf-8"),
);

const villesMap = new Map();
for (const v of villesCoordsArray) {
  villesMap.set(normalize(v.ville), {
    lat: v.lat,
    lng: v.lng,
    departement: v.departement,
  });
}
function safeImagesParse(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;

  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}
const energieRank = {
  A: 7,
  B: 6,
  C: 5,
  D: 4,
  E: 3,
  F: 2,
  G: 1,
};

function getEnergyScore(letter) {
  if (!letter) return 3; // neutre (D/E)
  return energieRank[letter] || 0;
}
// ================== UTILITAIRES ==================
export function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function getCoords(ville) {
  return villesMap.get(normalize(ville)) || null;
}

export function getDepartement(ville) {
  return getCoords(ville)?.departement ?? null;
}

export function distanceKm(ville1, ville2) {
  const v1 = getCoords(ville1);
  const v2 = getCoords(ville2);
  if (!v1 || !v2) return MAX_SURFACE;

  const R = 6371;
  const dLat = ((v2.lat - v1.lat) * Math.PI) / 180;
  const dLon = ((v2.lng - v1.lng) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((v1.lat * Math.PI) / 180) *
      Math.cos((v2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function scoreVille(
  sellerVille,
  buyerVille,
  maxPoints = 30,
  maxDistance = null,
) {
  const dist = distanceKm(sellerVille, buyerVille);

  if (dist === 0) return maxPoints;

  // aucune tolérance = score doux mondial
  if (!maxDistance) {
    const softLimit = 300;
    if (dist >= softLimit) return 0;

    return Math.round(maxPoints * (1 - dist / softLimit));
  }

  // tolerance buyer définie
  if (dist > maxDistance) return 0;

  const zoneParfaite = maxDistance * 0.35;

  if (dist <= zoneParfaite) {
    return maxPoints;
  }

  const ratio = (dist - zoneParfaite) / (maxDistance - zoneParfaite);

  return Math.round(maxPoints * (1 - ratio));
}

// ================== HELPERS CRITIQUES (FIX BUG 0) ==================
function cleanBuyerNumber(v, fallback = null) {
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return fallback; // 🔥 FIX IMPORTANT
  return n;
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function getBuyerToleranceKm(buyer) {
  const t = Number(buyer?.toleranceKm);

  if (!Number.isFinite(t) || t <= 0) {
    return null; // aucune limite
  }

  return t;
}
function isTypeCompatible(buyerType, sellerType) {
  const b = normalize(buyerType);
  const s = normalize(sellerType);

  if (!b) return true; // buyer ouvert
  if (!s) return true;

  if (b === s) return true;

  // familles proches
  const appartements = ["appartement", "studio", "loft", "duplex"];
  const maisons = ["maison", "villa", "pavillon"];

  if (appartements.includes(b) && appartements.includes(s)) return true;
  if (maisons.includes(b) && maisons.includes(s)) return true;

  return false;
}
function scoreBudgetSmart(seller, buyer) {
  const max = Number(buyer?.budgetMax);

  if (!max || max <= 0) return 20;

  const diff = seller.price - max;

  if (diff <= 0) {
    return 100;
  }

  const energy = normalize(seller.niveauEnergetique);

  let tolerance = 0.05; // +5%

  if (["a", "b"].includes(energy)) tolerance = 0.1;
  if (["c"].includes(energy)) tolerance = 0.07;

  const maxOver = max * tolerance;

  if (diff > maxOver) return 0;

  return Math.round(100 * (1 - diff / maxOver));
}
function scoreTechniqueSmart(seller, buyer) {
  let score = 0;

  // pièces
  if (seller.pieces >= buyer.piecesMin) {
    score += 45;

    const extra = seller.pieces - buyer.piecesMin;

    if (extra === 1) score += 10;
    if (extra >= 3) score -= 5;
  }

  // surface
  if (seller.surface >= buyer.surfaceMin) {
    score += 45;
  }

  // type
  if (isTypeCompatible(buyer.type, seller.type)) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}
function scoreEmotionSmart(seller) {
  let score = 50;

  const energy = getEnergyScore(seller.niveauEnergetique);
  score += energy * 4;

  const photos = Array.isArray(seller.imagesbien)
    ? seller.imagesbien.length
    : 0;

  score += Math.min(photos, 6) * 4;

  const etat = normalize(seller.etatBien);

  if (etat.includes("neuf")) score += 15;
  else if (etat.includes("renove")) score += 10;
  else if (etat.includes("travaux")) score -= 15;

  return Math.max(0, Math.min(100, score));
}
function getSurfacePiecesAdjustement(seller) {
  const surface = Number(seller.surface);
  const pieces = Number(seller.pieces);

  if (!surface || !pieces) return 0;
  if (pieces <= 0) return 0;

  const ratio = surface / pieces; // m² par pièce

  // zone saine
  if (ratio >= 18 && ratio <= 45) {
    return 0;
  }

  // trop petit par pièce
  if (ratio < 18) {
    const gap = 18 - ratio;
    return -Math.min(8, Math.round(gap * 0.8));
  }

  // trop grand par pièce
  if (ratio > 45) {
    const gap = ratio - 45;
    return -Math.min(5, Math.round(gap * 0.15));
  }

  return 0;
}
// ================== RESET ==================
export function resetSellers() {
  SELLERS = [];
  NEXT_SELLER_ID = 1;
}

export function resetBuyers() {
  BUYERS = [];
  NEXT_BUYER_ID = 1;
}

export function resetProfiles() {
  resetSellers();
  resetBuyers();
}

// ================== ADD SELLER ==================
export async function addSeller(criteria = {}) {
  const existingIndex = SELLERS.findIndex(
    (s) => s.username === criteria.username,
  );

  const seller = {
    id: existingIndex >= 0 ? SELLERS[existingIndex].id : NEXT_SELLER_ID++,
    username: criteria.username,
    role: "seller",
    ville: criteria.ville || "",
    type: normalize(criteria.type || "appartement"),

    price: safeNumber(criteria.price, 0),
    pieces: safeNumber(criteria.pieces, 0),
    surface: safeNumber(criteria.surface, 0),

    contact: criteria.contact || "",
    etatBien:
      criteria.etatBien !== undefined
        ? criteria.etatBien
        : existingIndex >= 0
          ? SELLERS[existingIndex].etatBien
          : null,
    imagesbien: Array.isArray(criteria.imagesbien)
      ? criteria.imagesbien
      : safeImagesParse(criteria.imagesbien),

    niveauEnergetique:
      criteria.niveauEnergetique !== undefined
        ? criteria.niveauEnergetique
        : existingIndex >= 0
          ? SELLERS[existingIndex].niveauEnergetique
          : null,
  };

  if (existingIndex >= 0) SELLERS[existingIndex] = seller;
  else SELLERS.push(seller);

  await db.prepare().upsert(
    "users",
    {
      username: seller.username,
      role: seller.role,
      ville: seller.ville,
      type: seller.type,
      price: seller.price,
      pieces: seller.pieces,
      surface: seller.surface,
      contact: seller.contact,
      etatBien: seller.etatBien,
      imagesbien: JSON.stringify(seller.imagesbien || []),
      niveauenergetique: seller.niveauEnergetique,
    },
    "username",
    [
      "role",
      "ville",
      "type",
      "price",
      "pieces",
      "surface",
      "contact",
      "etatBien",
      "imagesbien",
      "niveauenergetique",
    ],
  );

  return seller;
}

// ================== ADD BUYER (FIX PRINCIPAL) ==================
export async function addBuyer(criteria = {}) {
  const existingIndex = BUYERS.findIndex(
    (b) => b.username === criteria.username,
  );

  const buyer = {
    id: existingIndex >= 0 ? BUYERS[existingIndex].id : NEXT_BUYER_ID++,
    username: criteria.username,
    role: "buyer",
    ville: criteria.ville || "",
    type: normalize(criteria.type || ""),

    budgetMin: cleanBuyerNumber(criteria.budgetMin, null),
    budgetMax: cleanBuyerNumber(criteria.budgetMax, null),

    piecesMin: cleanBuyerNumber(criteria.piecesMin, null),
    piecesMax: cleanBuyerNumber(criteria.piecesMax, MAX_PIECES),

    surfaceMin: cleanBuyerNumber(criteria.surfaceMin, null),
    surfaceMax: cleanBuyerNumber(criteria.surfaceMax, MAX_SURFACE),
    toleranceKm: cleanBuyerNumber(criteria.toleranceKm, null),
    contact: criteria.contact || "",
    preferences:
      existingIndex >= 0
        ? BUYERS[existingIndex].preferences
        : { typeWeights: {}, regionWeights: {} },
  };

  if (existingIndex >= 0) BUYERS[existingIndex] = buyer;
  else BUYERS.push(buyer);

  await db.prepare().upsert(
    "users",
    {
      username: buyer.username,
      role: buyer.role,
      ville: buyer.ville,
      type: buyer.type,

      budgetMin: buyer.budgetMin,
      budgetMax: buyer.budgetMax,

      piecesMin: buyer.piecesMin,
      piecesMax: buyer.piecesMax,

      surfaceMin: buyer.surfaceMin,
      surfaceMax: buyer.surfaceMax,

      toleranceKm: buyer.toleranceKm,

      contact: buyer.contact,
    },
    "username",
    [
      "role",
      "ville",
      "type",
      "budgetMin",
      "budgetMax",
      "piecesMin",
      "piecesMax",
      "surfaceMin",
      "surfaceMax",
      "toleranceKm",
      "contact",
    ],
  );

  return buyer;
}
export async function getAllSellers() {
  return await db.sellers.find({}); // ou la méthode de ta DB
}

export async function getAllBuyers() {
  return await db.buyers.find({});
}
// ================== SCORING ET MATCHING ==================
// Ici, tout reste identique à ton code original (scoreSellerForBuyer, scoreBuyerForSeller, matchUsers, matchSellerToBuyers)
// Seule la persistance est modifiée pour PostgreSQL

// ================== SYNC IDs AVEC DB ==================
export function syncNextIds() {
  NEXT_SELLER_ID = SELLERS.length
    ? Math.max(...SELLERS.map((s) => s.id)) + 1
    : 1;
  NEXT_BUYER_ID = BUYERS.length ? Math.max(...BUYERS.map((b) => b.id)) + 1 : 1;
}
// ================== SCORING ==================
const BUDGET_WEIGHT = 40;
const VILLE_WEIGHT = 30;
const PIECES_WEIGHT = 20;
const SURFACE_WEIGHT = 10;

const TOTAL_WEIGHT = 100;

// nouveau moteur
const VITAL_WEIGHT = 60;
const TECH_WEIGHT = 30;
const EMOTION_WEIGHT = 10;
const TOLERANCE = 50_000;

// ===== Vendeur → Acheteur =====
function scoreSellerForBuyer(seller, buyer) {
  const budgetScore = scoreBudgetSmart(seller, buyer);

  const villeScore = scoreVille(
    seller.ville,
    buyer.ville,
    100,
    getBuyerToleranceKm(buyer),
  );

  const vital = budgetScore * 0.55 + villeScore * 0.45;

  const tech = scoreTechniqueSmart(seller, buyer);

  const emotion = scoreEmotionSmart(seller);

  const final = vital * 0.6 + tech * 0.3 + emotion * 0.1;
  logStep("SELLER SCORE DETAIL", {
    seller: seller.username,
    budgetDiff: seller.price - buyer?.budgetMax,
    distance: seller.distanceToBuyer,
    energy: seller.niveauEnergetique,
    finalScore: final,
  });
  return Math.round(final);
}

// ================== MATCHING ACHETEUR → VENDEURS ==================
export function matchUsers(buyerProfile, topN = 5) {
  logStep("ENTRY BUYER", {
    buyer: {
      username: buyerProfile.username,
      ville: buyerProfile.ville,
      budgetMax: buyerProfile.budgetMax,
      piecesMin: buyerProfile.piecesMin,
      surfaceMin: buyerProfile.surfaceMin,
      toleranceKm: buyerProfile.toleranceKm,
    },
    system: {
      sellersCount: SELLERS.length,
      buyersCount: BUYERS.length,
    },
  });
  if (!buyerProfile || !buyerProfile.role?.includes("buyer")) return [];
  const buyerCoords = getCoords(buyerProfile.ville);
  const normalizedBuyerCity = normalize(buyerProfile.ville);
  const toleranceKm = getBuyerToleranceKm(buyerProfile);

  let geoPool = SELLERS.filter(
    (seller) =>
      seller.role === "seller" &&
      normalize(seller.ville) === normalizedBuyerCity,
  ).map((seller) => {
    const sellerCoords = getCoords(seller.ville);
    return {
      ...seller,
      distanceToBuyer: 0,
      lat: sellerCoords?.lat ?? null,
      lng: sellerCoords?.lng ?? null,
    };
  });
  logStep("GEO POOL INITIAL", {
    size: geoPool.length,
    stats: {
      avgDistance:
        geoPool.length > 0
          ? Math.round(
              geoPool.reduce((acc, s) => acc + (s.distanceToBuyer || 0), 0) /
                geoPool.length,
            )
          : 0,
    },
    sample: geoPool.slice(0, 5).map((s) => ({
      username: s.username,
      ville: s.ville,
      distanceKm: Math.round(s.distanceToBuyer || 0),
    })),
  });

  if (geoPool.length < 30) {
    logStep("POOL BEFORE EXPANSION", {
      geoPoolSize: geoPool.length,
      remainingNeeded: 30 - geoPool.length,
    });
    const remainingNeeded = 30 - geoPool.length;

    const otherSellers = SELLERS.filter(
      (seller) =>
        seller.role === "seller" &&
        normalize(seller.ville) !== normalizedBuyerCity,
    )
      .map((seller) => {
        const sellerCoords = getCoords(seller.ville);
        const distanceToBuyer =
          sellerCoords && buyerCoords
            ? distanceKm(seller.ville, buyerProfile.ville)
            : Infinity;

        return {
          ...seller,
          distanceToBuyer,
          lat: sellerCoords?.lat ?? null,
          lng: sellerCoords?.lng ?? null,
        };
      })
      .filter((seller) => {
        if (!toleranceKm) return true;
        return seller.distanceToBuyer <= toleranceKm;
      })
      .sort((a, b) => a.distanceToBuyer - b.distanceToBuyer);
    geoPool = [...geoPool, ...otherSellers.slice(0, remainingNeeded)];
    logStep("POOL AFTER EXPANSION", {
      geoPoolSize: geoPool.length,
    });
  }
  const filteredPool = geoPool.filter((seller) => {
    if (!isTypeCompatible(buyerProfile.type, seller.type)) {
      return false;
    }

    if (toleranceKm && seller.distanceToBuyer > toleranceKm * 1.25) {
      return false;
    }

    return true;
  });
  logStep("AFTER FILTER TYPE + TOLERANCE", {
    before: geoPool.length,
    after: filteredPool.length,
    dropped: geoPool.length - filteredPool.length,
  });
  logStep("BEFORE SCORING", {
    poolSize: filteredPool.length,
  });

  const scored = filteredPool.map((seller) => {
    let matchedWeight = 0;
    const common = [];
    const different = [];

    const criteriaMatch = {
      budget: false,
      ville: false,
      pieces: false,
      surface: false,
      type: false,
    };

    // ===== Budget =====
    const budgetDiff = seller.price - buyerProfile.budgetMax;
    if (budgetDiff <= 0) {
      common.push("Budget parfait");
      matchedWeight += BUDGET_WEIGHT;
      criteriaMatch.budget = true;
    } else if (budgetDiff <= TOLERANCE) {
      different.push("Prix légèrement supérieur");
      matchedWeight += Math.round(BUDGET_WEIGHT * (1 - budgetDiff / TOLERANCE));
      criteriaMatch.budget = true;
    } else {
      different.push("Prix hors budget");
    }

    // ===== Ville =====
    let villeScoreVal = 0;
    if (buyerCoords && seller.distanceToBuyer !== Infinity) {
      if (seller.distanceToBuyer === 0) {
        common.push("Ville parfaite");
        criteriaMatch.ville = true;
      } else if (seller.distanceToBuyer < 100) {
        common.push("Ville proche");
        criteriaMatch.ville = true;
      } else if (!toleranceKm || seller.distanceToBuyer <= toleranceKm) {
        different.push("Ville éloignée");
      } else {
        different.push("Ville trop éloignée");
      }

      villeScoreVal = scoreVille(
        seller.ville,
        buyerProfile.ville,
        VILLE_WEIGHT,
        toleranceKm,
      );
      matchedWeight += villeScoreVal;
    } else {
      different.push("Ville inconnue");
    }

    // ===== Pièces =====
    if (seller.pieces >= buyerProfile.piecesMin) {
      if (seller.pieces === buyerProfile.piecesMin)
        common.push("Pièces parfaites");
      else common.push("Nombre de pièces supérieur");

      matchedWeight += PIECES_WEIGHT;
      criteriaMatch.pieces = true;
    } else {
      different.push("Pièces incompatibles");
    }

    // ===== Surface =====
    if (seller.surface >= buyerProfile.surfaceMin) {
      if (seller.surface === buyerProfile.surfaceMin)
        common.push("Surface parfaite");
      else common.push("Surface supérieure");

      matchedWeight += SURFACE_WEIGHT;
      criteriaMatch.surface = true;
    } else {
      different.push("Surface incompatible");
    }
    if (isTypeCompatible(buyerProfile.type, seller.type)) {
      matchedWeight += 10;
      criteriaMatch.type = true;
      common.push("Type compatible");
    }

    const departement = getDepartement(seller.ville);

    return {
      ...seller,
      score: scoreSellerForBuyer(seller, buyerProfile),
      compatibility: scoreSellerForBuyer(seller, buyerProfile),
      common,
      different,
      criteriaMatch,
      villeScoreVal,
      buyerLat: buyerCoords?.lat ?? null,
      buyerLng: buyerCoords?.lng ?? null,

      // pour le front
      villeOriginal: seller.ville,
      departement: getDepartement(seller.ville) || "TEST",
      etatBien: seller.etatBien,
      niveauEnergetique: seller.niveauEnergetique, // <-- ajouté ici pour le front

      imagesbien: Array.isArray(seller.imagesbien)
        ? seller.imagesbien
        : safeImagesParse(seller.imagesbien),
    };
  });
  // 🔥 AJOUT ICI
  const scores = scored.map((s) => s.compatibility || 0);

  const min = scores.length ? Math.min(...scores) : 0;
  const max = scores.length ? Math.max(...scores) : 0;
  const avg = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  logStep("AFTER SCORING", {
    scoredCount: scored.length,
    stats: { min, max, avg },
    topSample: scored.slice(0, 3).map((s) => ({
      username: s.username,
      compatibility: s.compatibility,
    })),
  });
  logStep("FINAL RESULT", {
    returned: topN,
    results: scored.slice(0, topN).map((s) => ({
      username: s.username,
      score: s.compatibility,
      boosted: s.boostedScore,
      ville: s.villeOriginal,
    })),
  });

  scored.sort((a, b) => b.compatibility - a.compatibility);
  console.log(
    "[MATCH USERS] SELLERS en mémoire:",
    SELLERS.map((s) => s.username),
  );
  console.log(
    "[MATCH USERS] buyerProfile:",
    buyerProfile.username,
    buyerProfile.ville,
  );

  // ================== POOL ÉLARGI ==================
  const poolSize = Math.max(topN * 3, 15); // ex: 15 si topN=5
  const pool = scored;

  // ================== BOOST DPE ==================
  const boosted = pool.map((s) => {
    const energy = getEnergyScore(s.niveauEnergetique);

    let energyBoost = energy * 0.7;

    if (["F", "G"].includes(s.niveauEnergetique)) energyBoost -= 4;
    if (["A", "B"].includes(s.niveauEnergetique)) energyBoost += 2;

    const photoCount = Array.isArray(s.imagesbien) ? s.imagesbien.length : 0;
    const photoBoost = Math.min(photoCount, 6) * 0.6;

    const etat = normalize(s.etatBien);
    let etatBoost = 0;

    if (etat.includes("neuf")) etatBoost += 3;
    else if (etat.includes("renove")) etatBoost += 2;
    else if (etat.includes("travaux")) etatBoost -= 3;

    const ratioBoost = getSurfacePiecesAdjustement(s);

    const finalScore =
      s.compatibility +
      energyBoost * 0.4 +
      photoBoost * 0.4 +
      etatBoost * 0.4 +
      ratioBoost;

    return {
      ...s,
      boostedScore: finalScore,
    };
  });
  logStep("BOOST STEP", {
    input: pool.length,
    boosted: boosted.length,
  });

  // ================== TRI FINAL ==================
  // ================== TRI FINAL ==================

  const boostedWithProximity = boosted.map((s) => {
    const proximityScore =
      s.compatibility * 0.7 +
      (s.villeScoreVal || 0) * 0.2 +
      (s.boostedScore || 0) * 0.1;

    return {
      ...s,
      proximityScore,
    };
  });

  // 🔥 TRI GLOBAL
  boostedWithProximity.sort((a, b) => b.proximityScore - a.proximityScore);

  // ================== SÉLECTION INTELLIGENTE ==================
  const result = [];
  const used = new Set();

  // 1. CAS 1 — STRICT (bons matchs)
  for (const s of boostedWithProximity) {
    if (result.length >= topN) break;

    if (s.proximityScore >= 70) {
      result.push(s);
      used.add(s.username);
    }
  }

  // 2. CAS 2 — NORMAL (compléter proprement)
  for (const s of boostedWithProximity) {
    if (result.length >= topN) break;
    if (used.has(s.username)) continue;

    if (s.proximityScore >= 40) {
      result.push(s);
      used.add(s.username);
    }
  }

  // 3. CAS 3 — FALLBACK (presque compatibles)
  if (result.length < topN) {
    for (const s of boostedWithProximity) {
      if (result.length >= topN) break;
      if (used.has(s.username)) continue;

      result.push({
        ...s,
        fallback: true,
      });
    }
  }

  return result;
}
// ================== MATCHING VENDEUR → ACHETEURS ==================
export function matchSellerToBuyers(sellerProfile, topN = 5) {
  if (!sellerProfile || !sellerProfile.role?.includes("seller")) return [];
  const sellerCoords = getCoords(sellerProfile.ville);
  const normalizedSellerCity = normalize(sellerProfile.ville);

  let geoPool = BUYERS.filter(
    (buyer) =>
      buyer.role === "buyer" && normalize(buyer.ville) === normalizedSellerCity,
  ).map((buyer) => {
    const buyerCoords = getCoords(buyer.ville);
    return {
      ...buyer,
      distanceToSeller: 0,
      lat: buyerCoords?.lat ?? null,
      lng: buyerCoords?.lng ?? null,
    };
  });

  if (geoPool.length < 30) {
    const remainingNeeded = 30 - geoPool.length;

    const otherBuyers = BUYERS.filter(
      (buyer) =>
        buyer.role === "buyer" &&
        normalize(buyer.ville) !== normalizedSellerCity,
    )
      .map((buyer) => {
        const buyerCoords = getCoords(buyer.ville);
        const distanceToSeller =
          buyerCoords && sellerCoords
            ? distanceKm(sellerProfile.ville, buyer.ville)
            : Infinity;

        return {
          ...buyer,
          distanceToSeller,
          lat: buyerCoords?.lat ?? null,
          lng: buyerCoords?.lng ?? null,
        };
      })
      .sort((a, b) => a.distanceToSeller - b.distanceToSeller);

    geoPool = [...geoPool, ...otherBuyers.slice(0, remainingNeeded)];
  }

  const scored = geoPool.map((buyer) => {
    const score = scoreBuyerForSeller(buyer, sellerProfile);
    const common = [];
    const different = [];

    const criteriaMatch = {
      budget: false,
      ville: false,
      pieces: false,
      surface: false,
    };

    // ===== Budget =====
    if (buyer.budgetMax >= sellerProfile.price) {
      common.push("Budget compatible");
      criteriaMatch.budget = true;
    } else if (buyer.budgetMax + TOLERANCE >= sellerProfile.price) {
      different.push("Prix légèrement supérieur au budget");
      criteriaMatch.budget = true;
    } else {
      different.push("Budget incompatible");
    }

    // ===== Ville =====
    if (sellerCoords && buyer.distanceToSeller !== Infinity) {
      if (buyer.distanceToSeller === 0) {
        common.push("Ville parfaite");
        criteriaMatch.ville = true;
      } else if (buyer.distanceToSeller < 100) {
        common.push("Ville proche");
        criteriaMatch.ville = true;
      } else if (buyer.distanceToSeller <= 200) {
        different.push("Ville éloignée");
      } else {
        different.push("Ville trop éloignée");
      }
    } else {
      different.push("Ville inconnue");
    }

    // ===== Pièces =====
    if (sellerProfile.pieces > buyer.piecesMin) {
      common.push("Nombre de pièces supérieur");
      criteriaMatch.pieces = true;
    } else if (sellerProfile.pieces === buyer.piecesMin) {
      common.push("Pièces parfaites");
      criteriaMatch.pieces = true;
    } else {
      different.push("Pièces insuffisantes");
    }

    // ===== Surface =====
    if (sellerProfile.surface > buyer.surfaceMin) {
      common.push("Surface supérieure");
      criteriaMatch.surface = true;
    } else if (sellerProfile.surface === buyer.surfaceMin) {
      common.push("Surface parfaite");
      criteriaMatch.surface = true;
    } else {
      different.push("Surface insuffisante");
    }

    const compatibility = Math.round((score / TOTAL_WEIGHT) * 100);
    const buyerCoords = getCoords(buyer.ville);

    const departement = getDepartement(buyer.ville);

    return {
      ...buyer,
      score,
      compatibility,
      common,
      different,
      criteriaMatch,
      villeScoreVal: scoreVille(
        sellerProfile.ville,
        buyer.ville,
        VILLE_WEIGHT,
        200,
      ),
      buyerLat: sellerCoords?.lat ?? null,
      buyerLng: sellerCoords?.lng ?? null,
      lat: buyerCoords?.lat ?? null,
      lng: buyerCoords?.lng ?? null,
      piecesMin: buyer.piecesMin,
      piecesMax: buyer.piecesMax,
      surfaceMin: buyer.surfaceMin,
      surfaceMax: buyer.surfaceMax,
      budgetMin: buyer.budgetMin,
      budgetMax: buyer.budgetMax,
      price: sellerProfile.price,

      villeOriginal: buyer.ville,
      departement: getDepartement(buyer.ville),
    };
  });

  scored.sort((a, b) => b.compatibility - a.compatibility);
  console.log(
    "[MATCH SELLERS → BUYERS] BUYERS en mémoire:",
    BUYERS.map((b) => b.username),
  );
  console.log(
    "[MATCH SELLERS → BUYERS] sellerProfile:",
    sellerProfile.username,
    sellerProfile.ville,
  );
  return scored.slice(0, topN);
}
export function getStatsMatches(buyerProfile, limit = 30) {
  const buyerCoords = getCoords(buyerProfile.ville);
  const toleranceKm = getBuyerToleranceKm(buyerProfile);
  const normalizedBuyerCity = normalize(buyerProfile.ville);

  const pool = SELLERS.filter((s) => s.role === "seller")
    .map((seller) => {
      const coords = getCoords(seller.ville);

      const distanceToBuyer =
        coords && buyerCoords
          ? distanceKm(seller.ville, buyerProfile.ville)
          : Infinity;

      return {
        ...seller,
        distanceToBuyer,
        villeScoreVal: scoreVille(
          seller.ville,
          buyerProfile.ville,
          30,
          toleranceKm,
        ),
      };
    })
    .filter((s) => {
      if (!isTypeCompatible(buyerProfile.type, s.type)) return false;
      return true;
    });

  const scored = pool.map((seller) => {
    const compatibility = scoreSellerForBuyer(seller, buyerProfile);

    // ===== BUDGET =====
    const budgetMax = buyerProfile.budgetMax ?? null;
    const budgetMin = buyerProfile.budgetMin ?? null;
    const priceDiff = budgetMax != null ? seller.price - budgetMax : 0;
    const budgetRatio = budgetMax ? (seller.price / budgetMax) * 100 : null;

    const budgetMatch =
      budgetMax == null
        ? "none"
        : priceDiff <= 0
          ? "perfect"
          : priceDiff <= 15_000
            ? "close"
            : priceDiff <= 35_000
              ? "tolerated"
              : priceDiff <= 50_000
                ? "weak"
                : "out";

    // ===== VILLE =====
    const dist = seller.distanceToBuyer ?? Infinity;
    const effectiveTolerance = toleranceKm ?? 100;

    const villeMatch =
      dist === 0
        ? "perfect"
        : dist <= 10
          ? "close"
          : dist <= effectiveTolerance * 0.5
            ? "tolerated"
            : dist <= effectiveTolerance
              ? "weak"
              : "out";

    // ===== PIÈCES =====
    const piecesMin = buyerProfile.piecesMin ?? null;
    const piecesMax = buyerProfile.piecesMax ?? null;
    const piecesDiff = piecesMin != null ? seller.pieces - piecesMin : null;

    const piecesMatch =
      piecesMin == null
        ? "none"
        : piecesDiff < 0
          ? "out"
          : piecesDiff === 0
            ? "perfect"
            : piecesDiff === 1
              ? "close"
              : piecesDiff <= 3
                ? "tolerated"
                : "weak"; // trop de pièces par rapport à la demande

    // ===== SURFACE =====
    const surfaceMin = buyerProfile.surfaceMin ?? null;
    const surfaceMax = buyerProfile.surfaceMax ?? null;
    const surfaceDiff = surfaceMin != null ? seller.surface - surfaceMin : null;
    const surfaceRatio = surfaceMin
      ? (seller.surface / surfaceMin) * 100
      : null;

    const surfaceMatch =
      surfaceMin == null
        ? "none"
        : surfaceDiff < 0
          ? "out"
          : surfaceDiff === 0
            ? "perfect"
            : surfaceDiff <= 10
              ? "close"
              : surfaceDiff <= 25
                ? "tolerated"
                : "weak"; // surface largement supérieure (surqualifié)

    // ===== TYPE =====
    const typeMatch =
      !buyerProfile.type || !seller.type
        ? "none"
        : normalize(buyerProfile.type) === normalize(seller.type)
          ? "perfect"
          : isTypeCompatible(buyerProfile.type, seller.type)
            ? "close"
            : "out";

    // ===== DPE =====
    const dpeScore = getEnergyScore(seller.niveauEnergetique);
    const dpeMatch =
      dpeScore >= 6
        ? "perfect" // A/B
        : dpeScore >= 5
          ? "close" // C
          : dpeScore >= 4
            ? "tolerated" // D
            : dpeScore >= 2
              ? "weak" // E/F
              : "out"; // G ou inconnu

    // ===== ÉTAT DU BIEN (nouveau) =====
    const etat = normalize(seller.etatBien ?? "");
    const etatMatch = etat.includes("neuf")
      ? "perfect"
      : etat.includes("renove")
        ? "close"
        : etat.includes("bon")
          ? "tolerated"
          : etat.includes("travaux")
            ? "weak"
            : "none";

    // ===== PHOTOS (nouveau) =====
    const photoCount = Array.isArray(seller.imagesbien)
      ? seller.imagesbien.length
      : 0;
    const photoMatch =
      photoCount >= 8
        ? "perfect"
        : photoCount >= 5
          ? "close"
          : photoCount >= 2
            ? "tolerated"
            : photoCount >= 1
              ? "weak"
              : "out";

    // ===== SCORE PAR CRITÈRE (0-100, pour sparkline front) =====
    const levelToScore = {
      perfect: 100,
      close: 75,
      tolerated: 50,
      weak: 25,
      out: 0,
      none: null,
    };

    // ===== BOOLEAN RÉTROCOMPAT =====
    const criteriaMatch = {
      budget: ["perfect", "close", "tolerated"].includes(budgetMatch),
      ville: ["perfect", "close", "tolerated"].includes(villeMatch),
      pieces: ["perfect", "close", "tolerated"].includes(piecesMatch),
      surface: ["perfect", "close", "tolerated"].includes(surfaceMatch),
      type: ["perfect", "close"].includes(typeMatch),
      dpe: ["perfect", "close", "tolerated"].includes(dpeMatch),
      etat: ["perfect", "close"].includes(etatMatch),

      detail: {
        budget: {
          level: budgetMatch,
          diff: priceDiff,
          ratio: budgetRatio ? Math.round(budgetRatio) : null,
          max: budgetMax,
          min: budgetMin,
          score: levelToScore[budgetMatch],
        },
        ville: {
          level: villeMatch,
          distanceKm: dist !== Infinity ? Math.round(dist) : null,
          toleranceKm: effectiveTolerance,
          score: levelToScore[villeMatch],
        },
        pieces: {
          level: piecesMatch,
          seller: seller.pieces,
          min: piecesMin,
          max: piecesMax,
          diff: piecesDiff,
          score: levelToScore[piecesMatch],
        },
        surface: {
          level: surfaceMatch,
          seller: seller.surface,
          min: surfaceMin,
          max: surfaceMax,
          diff: surfaceDiff,
          ratio: surfaceRatio ? Math.round(surfaceRatio) : null,
          score: levelToScore[surfaceMatch],
        },
        type: {
          level: typeMatch,
          seller: seller.type,
          buyer: buyerProfile.type,
          score: levelToScore[typeMatch],
        },
        dpe: {
          level: dpeMatch,
          letter: seller.niveauEnergetique,
          score: dpeScore,
          levelScore: levelToScore[dpeMatch],
        },
        etat: {
          level: etatMatch,
          value: seller.etatBien,
          score: levelToScore[etatMatch],
        },
        photos: {
          level: photoMatch,
          count: photoCount,
          score: levelToScore[photoMatch],
        },
      },
    };

    return { ...seller, compatibility, criteriaMatch };
  });

  scored.sort((a, b) => b.compatibility - a.compatibility);

  return scored.slice(0, limit);
}
// ================== APPRENTISSAGE ==================
export function learnPreference(buyerProfile, seller) {
  if (!buyerProfile?.preferences) return;

  const type = normalize(seller.type);
  const region = normalize(seller.region);

  buyerProfile.preferences.typeWeights[type] =
    (buyerProfile.preferences.typeWeights[type] || 0) + 5;
  buyerProfile.preferences.regionWeights[region] =
    (buyerProfile.preferences.regionWeights[region] || 0) + 5;
}

// ================== EXPORTS ==================
export { SELLERS, BUYERS, NEXT_SELLER_ID, NEXT_BUYER_ID };
