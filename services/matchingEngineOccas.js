//================ MATCHING ENGINE — MON AIGENT OCCASION ==================//
// Inchangé par rapport à la version d'origine : ce fichier n'était pas en
// cause dans les bugs signalés (le tunnel n'atteignait simplement jamais
// la phase de matching). Conservé tel quel pour compatibilité.
//===========================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import levenshtein from "fast-levenshtein";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let VILLES = [];
try {
  VILLES = JSON.parse(
    fs.readFileSync(path.join(__dirname, "villes-france.json"), "utf-8"),
  );
} catch {
  console.warn(
    "[matchingEngineOccas] villes-france.json introuvable — distances désactivées (fallback 0km)",
  );
}
const VILLES_NORM = VILLES.map((v) => ({
  ...v,
  _norm: normalize(v.ville || ""),
}));

export function normalize(str) {
  return typeof str === "string"
    ? str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    : "";
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findVille(nom) {
  const n = normalize(nom);
  return VILLES_NORM.find((v) => v._norm === n) || null;
}

export function distanceKm(villeA, villeB) {
  if (!villeA || !villeB) return 0;
  if (normalize(villeA) === normalize(villeB)) return 0;
  const a = findVille(villeA);
  const b = findVille(villeB);
  if (!a || !b || !a.lat || !b.lat) return 40;
  return Math.round(
    haversine(
      parseFloat(a.lat),
      parseFloat(a.lng || a.lon),
      parseFloat(b.lat),
      parseFloat(b.lng || b.lon),
    ),
  );
}

export function getDepartement(ville) {
  const v = findVille(ville);
  return v?.departement || v?.dept || "";
}

const CARBURANT_FAMILLES = {
  essence: ["essence", "gpl"],
  diesel: ["diesel"],
  hybride: ["hybride", "hybride rechargeable", "essence", "electrique"],
  electrique: ["electrique", "hybride rechargeable"],
  gpl: ["gpl", "essence"],
};

export const ZONE_STATUS_SCORE = {
  parfait: 100,
  bon: 82,
  usure: 60,
  rayure: 45,
  choc: 25,
  a_reparer: 10,
};

export function computeEtatScore(zones) {
  if (!zones || typeof zones !== "object") return null;
  const vals = Object.values(zones)
    .map((z) => ZONE_STATUS_SCORE[z?.status] ?? null)
    .filter((v) => v !== null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export const BUYERS_OCCAS = [];
export const SELLERS_OCCAS = [];

export function resetProfilesOccas() {
  BUYERS_OCCAS.length = 0;
  SELLERS_OCCAS.length = 0;
}

export function addBuyerOccas(profile) {
  const idx = BUYERS_OCCAS.findIndex((b) => b.username === profile.username);
  const full = {
    id: idx >= 0 ? BUYERS_OCCAS[idx].id : Date.now() + Math.random(),
    updatedAt: profile.updatedAt ?? Date.now(),
    ...profile,
  };
  if (idx >= 0) BUYERS_OCCAS[idx] = full;
  else BUYERS_OCCAS.push(full);
  return full;
}

export function addSellerOccas(profile) {
  const idx = SELLERS_OCCAS.findIndex((s) => s.username === profile.username);
  const full = {
    id: idx >= 0 ? SELLERS_OCCAS[idx].id : Date.now() + Math.random(),
    updatedAt: profile.updatedAt ?? Date.now(),
    ...profile,
  };
  if (idx >= 0) SELLERS_OCCAS[idx] = full;
  else SELLERS_OCCAS.push(full);
  return full;
}
export function scoreCarMatch(seller, buyer, opts = {}) {
  const prioriteCarV = opts.prioriteCarV !== false; // activé par défaut
  const detail = {};

  const dist = distanceKm(seller.ville, buyer.ville);
  const tol = Number(buyer.toleranceKm) > 0 ? Number(buyer.toleranceKm) : 60;
  let zoneScore;
  if (dist === 0) zoneScore = 100;
  else if (dist <= tol * 0.4) zoneScore = 100;
  else if (dist <= tol)
    zoneScore = Math.round(100 * (1 - (dist - tol * 0.4) / (tol * 0.6)));
  else zoneScore = Math.max(0, Math.round(100 * (1 - (dist - tol) / 80)));
  detail.zone = { score: zoneScore, distanceKm: dist, toleranceKm: tol };

  if (dist > tol * 2.2 && dist > 60) return null;

  const prix = Number(seller.prix) || 0;
  const budgetMax = Number(buyer.budgetMax) || 0;
  let budgetScore = 50;
  if (budgetMax > 0 && prix > 0) {
    if (prix <= budgetMax) budgetScore = 100;
    else if (prix <= budgetMax * 1.08)
      budgetScore = Math.round(
        100 * (1 - (prix - budgetMax) / (budgetMax * 0.08)),
      );
    else budgetScore = 0;
  }
  detail.budget = {
    score: budgetScore,
    prix,
    budgetMax,
    diff: prix - budgetMax,
  };
  if (budgetMax > 0 && prix > budgetMax * 1.15) return null;

  const km = Number(seller.kilometrage) || 0;
  const kmMax = Number(buyer.kilometrageMax) || 0;
  let kmScore = 70;
  if (kmMax > 0) {
    if (km <= kmMax) kmScore = 100;
    else if (km <= kmMax * 1.15)
      kmScore = Math.round(100 * (1 - (km - kmMax) / (kmMax * 0.15)));
    else kmScore = 15;
  }
  detail.kilometrage = { score: kmScore, km, kmMax };

  const annee = Number(seller.annee) || 0;
  const anneeMin = Number(buyer.anneeMin) || 0;
  let yearScore = 70;
  if (anneeMin > 0 && annee > 0) {
    if (annee >= anneeMin) yearScore = 100;
    else if (annee >= anneeMin - 2) yearScore = 55;
    else yearScore = 20;
  }
  detail.annee = { score: yearScore, annee, anneeMin };

  const sC = normalize(seller.carburant || "");
  const bC = normalize(buyer.carburant || "");
  let carburantScore = 100;
  if (bC && sC) {
    if (bC === sC) carburantScore = 100;
    else if ((CARBURANT_FAMILLES[bC] || []).includes(sC)) carburantScore = 65;
    else carburantScore = 20;
  }
  detail.carburant = { score: carburantScore, seller: sC, buyer: bC };

  let modeleScore = 60;
  if (buyer.marque || buyer.modele) {
    const target = normalize(
      `${buyer.marque || ""} ${buyer.modele || ""}`.trim(),
    );
    const source = normalize(
      `${seller.marque || ""} ${seller.modele || ""}`.trim(),
    );
    if (target && source) {
      if (source.includes(target) || target.includes(source)) modeleScore = 100;
      else {
        const d = levenshtein.get(target, source);
        const maxLen = Math.max(target.length, source.length, 1);
        modeleScore = Math.max(0, Math.round(100 * (1 - d / maxLen)));
      }
    }
  }
  detail.modele = {
    score: modeleScore,
    marque: seller.marque,
    modele: seller.modele,
  };

  let boiteScore = 80;
  if (buyer.boite && seller.boite) {
    boiteScore = normalize(buyer.boite) === normalize(seller.boite) ? 100 : 55;
  }
  detail.boite = { score: boiteScore };

  const etatScore = computeEtatScore(seller.etatZones);
  detail.etat = { score: etatScore ?? 65, renseigne: etatScore !== null };

  const base =
    zoneScore * 0.28 +
    budgetScore * 0.18 +
    kmScore * 0.14 +
    yearScore * 0.1 +
    carburantScore * 0.1 +
    modeleScore * 0.08 +
    boiteScore * 0.04 +
    (etatScore ?? 65) * 0.08;

  let bonus = 0;
  const nbImages = Array.isArray(seller.imagesbien)
    ? seller.imagesbien.length
    : 0;
  if (nbImages > 0) bonus += Math.min(8, 3 + nbImages * 1.5);
  // Le bonus CarVertical n'est appliqué que si la préférence "Prioriser les
  // annonces CarVertical" est active (par défaut oui) — sinon toutes les
  // annonces sont traitées à égalité, avec ou sans rapport.
  if (prioriteCarV && seller.carverticalUrl) {
    bonus += 10;
    if (seller.carverticalNote != null && Number(seller.carverticalNote) >= 80)
      bonus += 5;
  }

  const compatibility = Math.max(0, Math.min(100, Math.round(base + bonus)));

  const common = [];
  const different = [];
  if (zoneScore >= 80) common.push(`📍 ${dist} km`);
  else different.push(`📍 ${dist} km`);
  if (carburantScore >= 90) common.push(`⛽ ${seller.carburant}`);
  if (budgetScore >= 90) common.push("💰 Budget respecté");
  else if (budgetScore < 50) different.push("💰 Au-delà du budget");
  if (etatScore != null && etatScore >= 80) common.push("✅ Très bon état");
  if (nbImages > 0) common.push(`🖼️ ${nbImages} photo(s)`);
  if (seller.carverticalUrl) common.push("🛡️ CarVertical joint");

  return {
    compatibility,
    detail,
    bonus: Math.round(bonus),
    common,
    different,
  };
}

function toResult(seller, buyer, m) {
  return {
    id: seller.id,
    username: seller.username,
    contact: seller.contact,
    ville: seller.ville,
    departement: getDepartement(seller.ville),
    marque: seller.marque,
    modele: seller.modele,
    annee: seller.annee,
    carburant: seller.carburant,
    boite: seller.boite,
    kilometrage: seller.kilometrage,
    prix: seller.prix,
    etatZones: seller.etatZones || null,
    etatScore: computeEtatScore(seller.etatZones),
    imagesbien: Array.isArray(seller.imagesbien) ? seller.imagesbien : [],
    carverticalUrl: seller.carverticalUrl || null,
    carverticalNote: seller.carverticalNote ?? null,
    compatibility: m.compatibility,
    common: m.common,
    different: m.different,
    criteriaMatch: { detail: m.detail },
  };
}
function sortResults(results, sellerOrBuyerMap, triPertinence) {
  if (triPertinence === false) {
    // Préférence désactivée : on classe par annonce la plus récente,
    // sans donner le moindre poids au score de compatibilité.
    results.sort((a, b) => {
      const ua = sellerOrBuyerMap.get(a.username)?.updatedAt || 0;
      const ub = sellerOrBuyerMap.get(b.username)?.updatedAt || 0;
      return ub - ua;
    });
    return results; // pas de filtrage qualitatif : on montre tout, classé par fraîcheur
  }
  results.sort((a, b) => b.compatibility - a.compatibility);
  return results.length > 2
    ? results.filter((r, i) => i < 2 || r.compatibility >= 45)
    : results;
}

export function matchSellersForBuyer(buyer, limit = 5, prefs = {}) {
  const results = [];
  const byUsername = new Map();
  for (const seller of SELLERS_OCCAS) {
    if (seller.username === buyer.username) continue;
    const m = scoreCarMatch(seller, buyer, {
      prioriteCarV: prefs.prioriteCarV,
    });
    if (!m) continue;
    byUsername.set(seller.username, seller);
    results.push(toResult(seller, buyer, m));
  }
  const filtered = sortResults(results, byUsername, prefs.triPertinence);
  return filtered.slice(0, limit);
}

export function matchBuyersForSeller(seller, limit = 5, prefs = {}) {
  const results = [];
  const byUsername = new Map();
  for (const buyer of BUYERS_OCCAS) {
    if (buyer.username === seller.username) continue;
    const m = scoreCarMatch(seller, buyer, {
      prioriteCarV: prefs.prioriteCarV,
    });
    if (!m) continue;
    byUsername.set(buyer.username, buyer);
    results.push({
      id: buyer.id,
      username: buyer.username,
      contact: buyer.contact,
      ville: buyer.ville,
      budgetMax: buyer.budgetMax,
      carburant: buyer.carburant,
      marque: buyer.marque,
      modele: buyer.modele,
      compatibility: m.compatibility,
      common: m.common,
      different: m.different,
      criteriaMatch: { detail: m.detail },
    });
  }
  const filtered = sortResults(results, byUsername, prefs.triPertinence);
  return filtered.slice(0, limit);
}
export function getStatsMatchesOccas(profile, limit = 30, prefs = {}) {
  if (!profile) return [];
  if (profile.role === "buyer" || profile.budgetMax !== undefined)
    return matchSellersForBuyer(profile, limit, prefs);
  return matchBuyersForSeller(profile, limit, prefs);
}
