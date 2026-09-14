//================ MON AIGENT VOYAGE — MOTEUR DE MATCHING (v1) ===============//
// 100% déterministe. Aucune valeur ici n'est générée par un LLM : l'IA
// (aiParseeVoyage.js) ne fait qu'INTERPRÉTER et EXPLIQUER ce que ce moteur
// calcule. Si un score, un prix recommandé ou un classement change, c'est
// TOUJOURS parce que ce fichier l'a recalculé — jamais parce qu'un modèle
// l'a "deviné".
//
// Pondérations reprises telles quelles du CTO (section "Pondération du
// score de compatibilité") :
//   Zone / distance ............. 24 %
//   Créneau horaire .............. 20 %
//   Budget total du groupe ....... 18 %
//   Nombre de personnes .......... 12 %
//   Type d'expérience ............ 12 %
//   Préférences déclarées ......... 8 %
//   Qualité de l'offre ............ 6 %
//
// Bonus : départ < 24h (+10), offre complète/vérifiée (+6), annulation
// flexible (+4).
// Exclusions dures : hors budget total du groupe, créneau déjà hors
// d'atteinte, places insuffisantes.
// ─────────────────────────────────────────────────────────────────────────

import { CATEGORIES_EXPERIENCE, CATEGORIES_PROCHES } from "./aiParseeVoyage.js";

export const WEIGHTS = {
  zone: 0.24,
  creneau: 0.2,
  budget: 0.18,
  personnes: 0.12,
  type: 0.12,
  preferences: 0.08,
  qualite: 0.06,
};

const BONUS_DEPART_IMMINENT = 10;
const BONUS_OFFRE_COMPLETE = 6;
const BONUS_ANNULATION_FLEXIBLE = 4;

/* ════════════════════════════════════════════════════════════════════════
   HELPERS TEMPS — normalisation date/heure en instant réel
   ════════════════════════════════════════════════════════════════════════ */

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/** Résout un champ "date" (aujourd'hui / demain / ISO / chaîne libre type
 *  "ce week-end") + une heure entière 0-23 en objet Date réel. Retourne
 *  null si la date est totalement inexploitable (chaîne libre non ISO) —
 *  dans ce cas le moteur ne pénalise ni ne bonifie sur le créneau temporel
 *  absolu, il se rabat sur la comparaison d'heure seule. */
function resolveDateTime(dateStr, heure) {
  if (!dateStr) return null;
  const now = new Date();
  const h = Number.isInteger(heure) ? heure : 12;
  const norm = String(dateStr).trim().toLowerCase();

  let base = null;
  if (norm === "aujourd'hui" || norm === "aujourdhui") {
    base = new Date(now);
  } else if (norm === "demain") {
    base = new Date(now.getTime() + 24 * 3600 * 1000);
  } else if (/^\d{4}-\d{2}-\d{2}/.test(norm)) {
    base = new Date(norm);
  } else {
    // Chaîne libre ("ce week-end", "la semaine prochaine"...) : pas de
    // date absolue exploitable de façon fiable et déterministe.
    return null;
  }
  if (isNaN(base.getTime())) return null;
  base.setHours(h, 0, 0, 0);
  return base;
}

/** Heures restantes avant le créneau (peut être négatif si déjà passé). */
function hoursUntil(dt) {
  if (!dt) return null;
  return (dt.getTime() - Date.now()) / 3600000;
}

/* ════════════════════════════════════════════════════════════════════════
   SOUS-SCORES — un par critère de pondération
   ════════════════════════════════════════════════════════════════════════ */

function normalizeStr(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Zone / distance — sans service de géocodage, on compare les libellés
 *  de ville/zone déclarés. Si des coordonnées sont un jour disponibles sur
 *  l'offre/la demande (offer.lat/lng, demande.lat/lng), on bascule sur une
 *  vraie distance haversine. */
function scoreZone(offer, demande) {
  if (
    typeof offer.lat === "number" &&
    typeof offer.lng === "number" &&
    typeof demande.lat === "number" &&
    typeof demande.lng === "number"
  ) {
    const R = 6371;
    const dLat = ((demande.lat - offer.lat) * Math.PI) / 180;
    const dLng = ((demande.lng - offer.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((offer.lat * Math.PI) / 180) *
        Math.cos((demande.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const distanceKm = 2 * R * Math.asin(Math.sqrt(a));
    if (distanceKm <= 3) return 100;
    if (distanceKm <= 8) return 85;
    if (distanceKm <= 15) return 65;
    if (distanceKm <= 30) return 40;
    return 15;
  }

  const oVille = normalizeStr(offer.ville);
  const dVille = normalizeStr(demande.ville || demande.zone);
  const oZone = normalizeStr(offer.zonePrecise);
  const dZone = normalizeStr(demande.zone);

  if (!oVille || !dVille) return 50; // info manquante : neutre, pas pénalisant
  if (oVille === dVille) {
    if (oZone && dZone) return oZone === dZone ? 100 : 88;
    return 92;
  }
  if (oVille.includes(dVille) || dVille.includes(oVille)) return 60;
  return 20;
}

/** Créneau horaire — écart en heures, tolérance = flexibilité déclarée. */
function scoreCreneau(offer, demande) {
  if (offer.heure == null || demande.heure == null) return 55;
  const gap = Math.abs(offer.heure - demande.heure);
  const toleranceH = (demande.flexibiliteHeureMinutes ?? 60) / 60;
  if (gap <= toleranceH) return clamp(100 - gap * 6);
  return clamp(100 - gap * 20);
}

/** Budget total du groupe — EXCLUSION dure si le total dépasse le budget. */
function scoreBudget(prixUnitaire, personnes, budgetTotal) {
  if (prixUnitaire == null || !personnes)
    return { score: 55, total: null, excluded: false };
  const total = prixUnitaire * personnes;
  if (budgetTotal != null && total > budgetTotal) {
    return { score: 0, total, excluded: true, reason: "hors budget du groupe" };
  }
  if (budgetTotal == null) return { score: 60, total, excluded: false };
  const usage = total / budgetTotal; // 1 = utilise tout le budget
  // Favorise ce qui reste dans le budget sans le gâcher inutilement :
  // proche de 70-100% d'utilisation = meilleur score.
  const score =
    usage >= 0.55 ? clamp(100 - (1 - usage) * 50) : clamp(60 + usage * 60);
  return { score: clamp(score), total, excluded: false };
}

/** Nombre de personnes — EXCLUSION dure si pas assez de places. */
function scorePersonnes(placesRestantes, personnes) {
  if (placesRestantes == null || !personnes)
    return { score: 55, excluded: false };
  if (placesRestantes < personnes)
    return {
      score: 0,
      excluded: true,
      reason: "pas assez de places disponibles",
    };
  const marge = placesRestantes - personnes;
  return { score: marge <= 2 ? 100 : clamp(100 - marge * 4), excluded: false };
}

/** Type d'expérience — via la table de proximité de catégories de l'IA. */
function scoreType(offerCategorie, demandeCategorie) {
  const o = normalizeStr(offerCategorie);
  const d = normalizeStr(demandeCategorie);
  if (!o || !d) return 50;
  if (o === d) return 100;
  const proches = CATEGORIES_PROCHES?.[d] || [];
  if (proches.includes(o)) return 65;
  return 30;
}

/** Préférences déclarées — recoupement lexical simple entre le texte libre
 *  de préférences du voyageur et le descriptif de l'offre. */
/** Préférences déclarées / atouts prestataire — recoupement lexical entre
 *  les préférences du voyageur et TOUT ce que l'offre met en avant, y
 *  compris ses "atouts" (offer.preferences, même champ, label différent
 *  côté prestataire). Remonte aussi les mots-clés communs, utilisés pour
 *  afficher "Points communs : ..." dans les raisons du match. */
function matchPreferenceTokens(offer, demande) {
  const prefText = normalizeStr(demande.preferences);
  if (!prefText) return { score: 55, matched: [] };
  const offerText = normalizeStr(
    [offer.activite, offer.conditions, offer.categorie, offer.preferences]
      .filter(Boolean)
      .join(" "),
  );
  if (!offerText) return { score: 50, matched: [] };
  const tokens = prefText.split(/[\s,;.]+/).filter((t) => t.length > 2);
  if (!tokens.length) return { score: 55, matched: [] };
  const matched = tokens.filter((t) => offerText.includes(t));
  const ratio = matched.length / tokens.length;
  return { score: clamp(45 + ratio * 55), matched };
}

/** Qualité / fiabilité de l'offre — complétude + conditions déclarées. */
function scoreQualite(offer) {
  let score = 55;
  if (offer.annulationFlexible === true) score += 15;
  if (offer.placesTotales != null) score += 10;
  if (offer.prixHabituel != null) score += 10;
  if (offer.conditions) score += 5;
  if (offer.ageMinimum != null) score += 2;
  return clamp(score);
}

/* ════════════════════════════════════════════════════════════════════════
   URGENCE — même échelle utilisée pour le classement ET pour le pricing
   ════════════════════════════════════════════════════════════════════════ */

export function computeUrgency(heuresRestantes) {
  if (heuresRestantes == null) return "indeterminee";
  if (heuresRestantes < 0) return "expiree";
  if (heuresRestantes <= 6) return "immediate";
  if (heuresRestantes <= 24) return "urgente";
  if (heuresRestantes <= 72) return "proche";
  return "lointaine";
}

/* ════════════════════════════════════════════════════════════════════════
   PRICING DÉTERMINISTE — appelé au moment de la publication d'une offre,
   et réévaluable à tout instant (le prix recommandé bouge avec le temps).
   ════════════════════════════════════════════════════════════════════════ */

export function computePricingForOffer(offer) {
  const dt = resolveDateTime(offer.date, offer.heure);
  const heuresRestantesRaw = hoursUntil(dt);
  const heuresRestantes =
    heuresRestantesRaw == null ? null : Math.round(heuresRestantesRaw);

  const prixHabituel = offer.prixHabituel ?? null;
  if (prixHabituel == null) {
    return {
      prixRecommande: null,
      remisePourcent: 0,
      urgence: computeUrgency(heuresRestantes),
      heuresRestantes,
    };
  }

  let baseRemise;
  if (heuresRestantes == null) baseRemise = 15;
  else if (heuresRestantes < 0)
    baseRemise = 50; // créneau déjà passé : n'a normalement plus lieu d'être proposé
  else if (heuresRestantes <= 6) baseRemise = 35;
  else if (heuresRestantes <= 24) baseRemise = 25;
  else if (heuresRestantes <= 72) baseRemise = 15;
  else baseRemise = 8;

  let fillRate = 0.5;
  if (
    offer.placesTotales != null &&
    offer.placesTotales > 0 &&
    offer.placesRestantes != null
  ) {
    fillRate =
      (clamp(1 - offer.placesRestantes / offer.placesTotales, 0, 1) / 100) *
      100; // garde 0..1
    fillRate = 1 - offer.placesRestantes / offer.placesTotales;
  }
  const extraRemise = Math.round((1 - clamp(fillRate, 0, 1)) * 10);

  const remisePourcent = Math.max(5, Math.min(60, baseRemise + extraRemise));
  const prixRecommande = Math.max(
    1,
    Math.round(prixHabituel * (1 - remisePourcent / 100)),
  );

  return {
    prixRecommande,
    remisePourcent,
    urgence: computeUrgency(heuresRestantes),
    heuresRestantes,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   RAISONS LISIBLES — courts libellés factuels, jamais de phrase entière
   (c'est le rôle de l'IA de les mettre en prose côté chat).
   ════════════════════════════════════════════════════════════════════════ */

function buildReasons({
  subscores,
  heuresRestantes,
  offer,
  personnes,
  matchedPreferences,
}) {
  const reasons = [];
  if (subscores.zone >= 85) reasons.push("Zone très compatible");
  if (subscores.creneau >= 80) reasons.push("Créneau proche de la demande");
  if (subscores.budget >= 75) reasons.push("Bien dans le budget du groupe");
  if (subscores.type === 100) reasons.push("Type d'expérience exact");
  else if (subscores.type >= 60) reasons.push("Type d'expérience proche");
  if (matchedPreferences?.length)
    reasons.push(
      `Points communs : ${matchedPreferences.slice(0, 3).join(", ")}`,
    );
  if (heuresRestantes != null && heuresRestantes <= 24 && heuresRestantes >= 0)
    reasons.push("Départ dans moins de 24h");
  if (offer.annulationFlexible) reasons.push("Annulation flexible");
  if (offer.placesTotales != null) reasons.push("Offre complète et vérifiée");
  return reasons;
}

/* ════════════════════════════════════════════════════════════════════════
   SCORING GÉNÉRIQUE — un couple (offre, demande) → verdict complet
   ════════════════════════════════════════════════════════════════════════ */

function scorePair(offer, demande) {
  const personnes = demande.nombrePersonnes ?? 1;
  const prixRef = offer.prixRecommande ?? offer.prixHabituel ?? null;

  const budgetRes = scoreBudget(prixRef, personnes, demande.budgetTotal);
  const personnesRes = scorePersonnes(offer.placesRestantes, personnes);

  const dt = resolveDateTime(offer.date, offer.heure);
  const heuresRestantesRaw = hoursUntil(dt);
  const heuresRestantes =
    heuresRestantesRaw == null ? null : Math.round(heuresRestantesRaw);
  const creneauExpire = heuresRestantes != null && heuresRestantes < 0;

  const prefRes = matchPreferenceTokens(offer, demande);
  const subscores = {
    zone: scoreZone(offer, demande),
    creneau: scoreCreneau(offer, demande),
    budget: budgetRes.score,
    personnes: personnesRes.score,
    type: scoreType(offer.categorie || offer.activite, demande.categorie),
    preferences: prefRes.score,
    qualite: scoreQualite(offer),
  };
  const excluded = budgetRes.excluded || personnesRes.excluded || creneauExpire;
  const exclusionReason = budgetRes.excluded
    ? budgetRes.reason
    : personnesRes.excluded
      ? personnesRes.reason
      : creneauExpire
        ? "créneau déjà passé"
        : null;

  let weighted =
    subscores.zone * WEIGHTS.zone +
    subscores.creneau * WEIGHTS.creneau +
    subscores.budget * WEIGHTS.budget +
    subscores.personnes * WEIGHTS.personnes +
    subscores.type * WEIGHTS.type +
    subscores.preferences * WEIGHTS.preferences +
    subscores.qualite * WEIGHTS.qualite;

  let bonus = 0;
  if (heuresRestantes != null && heuresRestantes >= 0 && heuresRestantes <= 24)
    bonus += BONUS_DEPART_IMMINENT;
  if (
    offer.placesTotales != null &&
    offer.prixHabituel != null &&
    offer.date &&
    offer.ville
  )
    bonus += BONUS_OFFRE_COMPLETE;
  if (offer.annulationFlexible) bonus += BONUS_ANNULATION_FLEXIBLE;

  const compatibility = excluded
    ? 0
    : clamp(Math.round(weighted + bonus), 0, 99);

  const economie =
    offer.prixHabituel != null && prixRef != null
      ? Math.max(0, (offer.prixHabituel - prixRef) * personnes)
      : null;

  return {
    excluded,
    exclusionReason,
    compatibility,
    breakdown: subscores,
    heuresRestantes,
    urgence: computeUrgency(heuresRestantes),
    economie,
    reasons: excluded
      ? []
      : buildReasons({
          subscores,
          heuresRestantes,
          offer,
          personnes,
          matchedPreferences: prefRes.matched,
        }),
    total: budgetRes.total,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   API PUBLIQUE
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Calcule et classe les offres compatibles avec une demande voyageur.
 * @param {object} demandCriteria - critères extraits côté voyageur (sc)
 * @param {object[]} offersPool - offres actives des prestataires (criteria + username)
 * @param {object} opts - { limit }
 */
export function getMatchesForDemand(demandCriteria, offersPool, opts = {}) {
  const limit = opts.limit ?? 8;
  const demande = demandCriteria || {};

  const scored = (offersPool || [])
    .map((entry) => {
      const offer = entry.criteria || entry;
      const verdict = scorePair(offer, demande);
      if (verdict.excluded) return null;
      return {
        username: entry.username,
        activite: offer.activite || null,
        categorie: offer.categorie || null,
        ville: offer.ville || null,
        zonePrecise: offer.zonePrecise || null,
        date: offer.date || null,
        heure: offer.heure ?? null,
        placesRestantes: offer.placesRestantes ?? null,
        placesTotales: offer.placesTotales ?? null,
        prixHabituel: offer.prixHabituel ?? null,
        prixRecommande: offer.prixRecommande ?? offer.prixHabituel ?? null,
        annulationFlexible: !!offer.annulationFlexible,
        conditions: offer.conditions || null,
        compatibility: verdict.compatibility,
        breakdown: verdict.breakdown,
        urgence: verdict.urgence,
        heuresRestantes: verdict.heuresRestantes,
        economie: verdict.economie,
        reasons: verdict.reasons,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.compatibility !== a.compatibility)
        return b.compatibility - a.compatibility;
      const urgencyRank = {
        immediate: 0,
        urgente: 1,
        proche: 2,
        lointaine: 3,
        indeterminee: 4,
      };
      return (urgencyRank[a.urgence] ?? 5) - (urgencyRank[b.urgence] ?? 5);
    });

  return scored.slice(0, limit);
}

/**
 * Symétrique : classe les demandes voyageurs compatibles avec une offre
 * prestataire (utile pour un futur "trouvez-moi des clients pour ce créneau").
 */
export function getMatchesForOffer(offerCriteria, demandesPool, opts = {}) {
  const limit = opts.limit ?? 8;
  const offer = offerCriteria || {};

  const scored = (demandesPool || [])
    .map((entry) => {
      const demande = entry.criteria || entry;
      const verdict = scorePair(offer, demande);
      if (verdict.excluded) return null;
      return {
        username: entry.username,
        ville: demande.ville || demande.zone || null,
        date: demande.date || null,
        heure: demande.heure ?? null,
        nombrePersonnes: demande.nombrePersonnes ?? null,
        budgetTotal: demande.budgetTotal ?? null,
        categorie: demande.categorie || null,
        preferences: demande.preferences || null,
        compatibility: verdict.compatibility,
        breakdown: verdict.breakdown,
        urgence: verdict.urgence,
        heuresRestantes: verdict.heuresRestantes,
        reasons: verdict.reasons,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.compatibility - a.compatibility);

  return scored.slice(0, limit);
}

export { resolveDateTime, hoursUntil };
