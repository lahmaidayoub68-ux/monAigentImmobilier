/*
matchingEngine.js
Moteur de matching IMMOBILIER
Scoring + compatibilité (%)
Pondération : Budget 40 Ville 30 Pièces 20 Surface 10
*/
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// ================== DONNÉES ==================
let SELLERS = [];
let BUYERS = [];
let NEXT_SELLER_ID = 1;
let NEXT_BUYER_ID = 1;

// Valeurs max pour DB et calcul
const MAX_PIECES = 100;
const MAX_SURFACE = 1000;

// ================== COORDONNÉES VILLES ==================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const villesCoordsArray = JSON.parse(
  fs.readFileSync(path.join(__dirname, "villes_simplifie.json"), "utf-8"),
);

const dbPath = path.join(__dirname, "../data.db"); // ajuste le chemin selon ton projet
export const db = new Database(dbPath);

// Crée une Map pour accès rapide
const villesMap = new Map();
for (const v of villesCoordsArray) {
  villesMap.set(normalize(v.ville), { lat: v.lat, lng: v.lng });
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

export function distanceKm(ville1, ville2) {
  const v1 = getCoords(ville1);
  const v2 = getCoords(ville2);
  if (!v1 || !v2) return MAX_SURFACE; // valeur max raisonnable

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
  maxDistance = 200,
) {
  const dist = distanceKm(sellerVille, buyerVille);
  if (dist === 0) return maxPoints;
  if (dist > maxDistance) return 0;
  return Math.round(maxPoints * (1 - dist / maxDistance));
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
// ================== AJOUT / MISE À JOUR VENDEUR ==================
export function addSeller(criteria = {}) {
  const existingIndex = SELLERS.findIndex(
    (s) => s.username === criteria.username,
  );

  const seller = {
    id: existingIndex >= 0 ? SELLERS[existingIndex].id : NEXT_SELLER_ID++,
    username: criteria.username || `seller_${NEXT_SELLER_ID}`,
    role: "seller",
    ville: criteria.ville || "",
    region: criteria.region || criteria.ville || "",
    type: normalize(criteria.type || "appartement"),
    price: Number(criteria.price ?? 0),
    pieces: Math.min(Number(criteria.pieces ?? 0), MAX_PIECES),
    surface: Math.min(Number(criteria.surface ?? 0), MAX_SURFACE),
    contact: criteria.contact || "",
  };

  // Mettre à jour la mémoire
  if (existingIndex >= 0) SELLERS[existingIndex] = seller;
  else SELLERS.push(seller);

  // Mettre à jour la DB avec paramètres nommés
  try {
    const stmt = db.prepare(`
      INSERT INTO users (
        username, password, role, contact, type, ville, region,
        price, budgetMin, budgetMax,
        piecesMin, piecesMax,
        surfaceMin, surfaceMax,
        pieces, budget, surface
      ) VALUES (
        @username, '', @role, @contact, @type, @ville, @region,
        @price, 0, 0,
        0, @piecesMax,
        0, @surfaceMax,
        @pieces, 0, @surface
      )
      ON CONFLICT(username) DO UPDATE SET
        role = excluded.role,
        contact = excluded.contact,
        type = excluded.type,
        ville = excluded.ville,
        region = excluded.region,
        price = excluded.price,
        pieces = excluded.pieces,
        surface = excluded.surface
    `);

    stmt.run({
      username: seller.username,
      role: seller.role,
      contact: seller.contact,
      type: seller.type,
      ville: seller.ville,
      region: seller.region,
      piecesMax: MAX_PIECES,
      surfaceMax: MAX_SURFACE,
      pieces: seller.pieces,
      surface: seller.surface,
      price: seller.price,
    });
  } catch (err) {
    console.error("[ADD SELLER DB ERROR]:", err);
  }

  return seller;
}

// ================== AJOUT / MISE À JOUR ACHETEUR ==================
export function addBuyer(criteria = {}) {
  const existingIndex = BUYERS.findIndex(
    (b) => b.username === criteria.username,
  );

  const budget = criteria.budget != null ? Number(criteria.budget) : null;
  const budgetMin =
    criteria.budgetMin != null ? Number(criteria.budgetMin) : (budget ?? 0);
  const budgetMax =
    criteria.budgetMax != null ? Number(criteria.budgetMax) : budgetMin;

  const buyer = {
    id: existingIndex >= 0 ? BUYERS[existingIndex].id : NEXT_BUYER_ID++,
    username: criteria.username || `buyer_${NEXT_BUYER_ID}`,
    role: "buyer",
    ville: criteria.ville || "",
    region: criteria.region || criteria.ville || "",
    type: normalize(criteria.type || ""),
    budget,
    budgetMin,
    budgetMax,
    piecesMin: Number(criteria.piecesMin ?? 0),
    piecesMax: Math.min(Number(criteria.piecesMax ?? MAX_PIECES), MAX_PIECES),
    surfaceMin: Number(criteria.surfaceMin ?? 0),
    surfaceMax: Math.min(
      Number(criteria.surfaceMax ?? MAX_SURFACE),
      MAX_SURFACE,
    ),
    contact: criteria.contact || "",
    preferences:
      existingIndex >= 0
        ? BUYERS[existingIndex].preferences
        : { typeWeights: {}, regionWeights: {} },
  };

  // Mettre à jour la mémoire
  if (existingIndex >= 0) BUYERS[existingIndex] = buyer;
  else BUYERS.push(buyer);

  // Mettre à jour la DB avec paramètres nommés
  try {
    const stmt = db.prepare(`
      INSERT INTO users (
        username, password, role, contact, type, ville, region,
        price, budgetMin, budgetMax,
        piecesMin, piecesMax,
        surfaceMin, surfaceMax,
        pieces, budget, surface
      ) VALUES (
        @username, '', @role, @contact, @type, @ville, @region,
        0, @budgetMin, @budgetMax,
        @piecesMin, @piecesMax,
        @surfaceMin, @surfaceMax,
        0, @budget, 0
      )
      ON CONFLICT(username) DO UPDATE SET
        role = excluded.role,
        contact = excluded.contact,
        type = excluded.type,
        ville = excluded.ville,
        region = excluded.region,
        budget = excluded.budget,
        budgetMin = excluded.budgetMin,
        budgetMax = excluded.budgetMax,
        piecesMin = excluded.piecesMin,
        piecesMax = excluded.piecesMax,
        surfaceMin = excluded.surfaceMin,
        surfaceMax = excluded.surfaceMax
    `);

    stmt.run({
      username: buyer.username,
      role: buyer.role,
      contact: buyer.contact,
      type: buyer.type,
      ville: buyer.ville,
      region: buyer.region,
      budget: buyer.budget ?? 0,
      budgetMin: buyer.budgetMin,
      budgetMax: buyer.budgetMax,
      piecesMin: buyer.piecesMin,
      piecesMax: buyer.piecesMax,
      surfaceMin: buyer.surfaceMin,
      surfaceMax: buyer.surfaceMax,
    });
  } catch (err) {
    console.error("[ADD BUYER DB ERROR]:", err);
  }

  return buyer;
}
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
const TOTAL_WEIGHT =
  BUDGET_WEIGHT + VILLE_WEIGHT + PIECES_WEIGHT + SURFACE_WEIGHT;
const TOLERANCE = 50_000;

// ===== Acheteur → Vendeur =====
function scoreSellerForBuyer(seller, buyer) {
  let score = 0;

  const budgetDiff = seller.price - buyer.budgetMax;
  if (budgetDiff <= 0) score += BUDGET_WEIGHT;
  else if (budgetDiff <= TOLERANCE)
    score += Math.round(BUDGET_WEIGHT * (1 - budgetDiff / TOLERANCE));

  if (seller.ville && buyer.ville) {
    score += scoreVille(seller.ville, buyer.ville, VILLE_WEIGHT, 200);
  }

  if (seller.pieces >= buyer.piecesMin) score += PIECES_WEIGHT;
  if (seller.surface >= buyer.surfaceMin) score += SURFACE_WEIGHT;

  return Math.max(0, Math.round(score));
}

// ===== Vendeur → Acheteur =====
function scoreBuyerForSeller(buyer, seller) {
  let score = 0;

  const budgetDiff = seller.price - buyer.budgetMax;
  if (budgetDiff <= 0) score += BUDGET_WEIGHT;
  else if (budgetDiff <= TOLERANCE)
    score += Math.round(BUDGET_WEIGHT * (1 - budgetDiff / TOLERANCE));

  if (buyer.ville && seller.ville) {
    score += scoreVille(seller.ville, buyer.ville, VILLE_WEIGHT, 200);
  }

  if (seller.pieces >= buyer.piecesMin) score += PIECES_WEIGHT;
  if (seller.surface >= buyer.surfaceMin) score += SURFACE_WEIGHT;

  return Math.max(0, Math.round(score));
}

// ================== MATCHING ACHETEUR → VENDEURS ==================
export function matchUsers(buyerProfile, topN = 5) {
  if (!buyerProfile || !buyerProfile.role?.includes("buyer")) return [];

  const buyerCoords = getCoords(buyerProfile.ville);
  const normalizedBuyerCity = normalize(buyerProfile.ville);

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

  if (geoPool.length < 30) {
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
      .sort((a, b) => a.distanceToBuyer - b.distanceToBuyer);

    geoPool = [...geoPool, ...otherSellers.slice(0, remainingNeeded)];
  }

  const scored = geoPool.map((seller) => {
    let matchedWeight = 0;
    const common = [];
    const different = [];

    const criteriaMatch = {
      budget: false,
      ville: false,
      pieces: false,
      surface: false,
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
      } else if (seller.distanceToBuyer <= 200) {
        different.push("Ville éloignée");
      } else {
        different.push("Ville trop éloignée");
      }

      villeScoreVal = scoreVille(
        seller.ville,
        buyerProfile.ville,
        VILLE_WEIGHT,
        200,
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

    return {
      ...seller,
      score: scoreSellerForBuyer(seller, buyerProfile),
      compatibility: Math.round((matchedWeight / TOTAL_WEIGHT) * 100),
      common,
      different,
      criteriaMatch,
      villeScoreVal,
      buyerLat: buyerCoords?.lat ?? null,
      buyerLng: buyerCoords?.lng ?? null,

      // ✅ Ajout pour le front : ville originale
      villeOriginal:
        villesCoordsArray.find(
          (v) => normalize(v.ville) === normalize(seller.ville),
        )?.ville || seller.ville,
    };
  });

  scored.sort((a, b) => b.compatibility - a.compatibility);
  return scored.slice(0, topN);
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

      // Ajout pour le front
      pieces: buyer.piecesMin, // ou sellerProfile.pieces ?
      surface: buyer.surfaceMin,
      price: buyer.budgetMax,
      villeOriginal:
        villesCoordsArray.find(
          (v) => normalize(v.ville) === normalize(buyer.ville),
        )?.ville || buyer.ville,
    };
  });

  scored.sort((a, b) => b.compatibility - a.compatibility);
  return scored.slice(0, topN);
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
