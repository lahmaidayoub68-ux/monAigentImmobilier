//================ MATCHING ENGINE — MON AIGENT EMPLOI (v2) =================//
// Moteur de scoring candidat <-> recruteur. Pas un simple filtre : chaque
// critère est pondéré, avec bonus/malus, obligatoires vs secondaires, et
// exploitation de la hiérarchie domaine > sous-domaine > métier (deux
// intitulés différents mais proches dans l'arbre restent compatibles).
//
// v2 — CONNECTE LES PRÉFÉRENCES UTILISATEUR (Profil > Préférences > Agent
// & matching) au tri et au filtrage réels des résultats :
//   - triPertinence (défaut ON)   : tri par score de compatibilité.
//                                   Si désactivé -> tri par date de
//                                   publication la plus récente.
//   - prioriteCV (défaut ON)      : les profils avec CV + lettre complets
//                                   remontent en tête des résultats.
//   - masquerPourvus (défaut ON)  : les annonces marquées "pourvu" côté
//                                   auteur sont retirées du pool avant
//                                   calcul (voir champ `pourvu` sur chaque
//                                   entrée du pool).
//   - autoMatch                   : toujours vrai, non négociable (géré
//                                   côté serveur, ne change rien ici).
//
// API principale :
//   getMatchesForProfile(selfCriteria, selfRole, candidatePool, prefs)
//     -> [{ ...profile, compatibility, breakdown, reasons, warnings }]
//   computeMatchScore(candidatCriteria, recruteurCriteria) -> { score, breakdown, reasons, warnings }
//===============================================================//

/* ────────────────────────── NORMALISATION ────────────────────────── */
const normStr = (s) =>
  typeof s === "string"
    ? s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    : "";

const STOPWORDS = new Set([
  "de",
  "du",
  "des",
  "le",
  "la",
  "les",
  "un",
  "une",
  "et",
  "en",
  "d",
  "l",
  "au",
  "aux",
  "pour",
]);

function tokenize(str) {
  return normStr(str)
    .split(/[^a-z0-9+]+/)
    .filter((t) => t && t.length > 1 && !STOPWORDS.has(t));
}

function jaccard(aArr, bArr) {
  const a = new Set(aArr);
  const b = new Set(bArr);
  if (!a.size && !b.size) return null; // pas assez de données
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

/* ────────────────────────── ÉCHELLE ÉTUDES ────────────────────────── */
const ETUDE_LEVELS = [
  { re: /aucun|sans dipl[oô]me|non requis/, rank: 0 },
  { re: /cap|bep/, rank: 1 },
  { re: /bac(?!\s*\+)/, rank: 2 },
  { re: /bts|dut|bac\s*\+\s*2/, rank: 3 },
  { re: /licence|bachelor|bac\s*\+\s*3/, rank: 4 },
  { re: /master|bac\s*\+\s*5|ing[ée]nieur/, rank: 5 },
  { re: /doctorat|phd|bac\s*\+\s*8/, rank: 6 },
];
function etudeRank(label) {
  const n = normStr(label);
  if (!n) return null;
  for (const lvl of ETUDE_LEVELS) if (lvl.re.test(n)) return lvl.rank;
  return null;
}

/* ────────────────────────── DOMAINE / MÉTIER ────────────────────────── */
function domainePathScore(pathA = [], pathB = []) {
  const a = (pathA || []).map(normStr).filter(Boolean);
  const b = (pathB || []).map(normStr).filter(Boolean);
  if (!a.length || !b.length) return null;

  let common = 0;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) common++;
    else break;
  }
  let prefixScore = maxLen === 0 ? 0 : common / maxLen;

  const lastA = a[a.length - 1] || "";
  const lastB = b[b.length - 1] || "";
  let lexicalBonus = 0;
  if (lastA && lastB) {
    if (lastA === lastB) lexicalBonus = 0.35;
    else {
      const j = jaccard(tokenize(lastA), tokenize(lastB));
      if (j !== null) lexicalBonus = j * 0.3;
    }
  }

  return Math.max(0, Math.min(1, prefixScore * 0.7 + lexicalBonus));
}

/* ────────────────────────── SALAIRE ────────────────────────── */
function salaryScore(candMin, candMax, recMin, recMax) {
  if (candMax == null && recMax == null) return null;
  const cMin = candMin ?? candMax ?? 0;
  const cMax = candMax ?? candMin ?? cMin;
  const rMin = recMin ?? recMax ?? 0;
  const rMax = recMax ?? recMin ?? rMin;

  if (cMax === 0 || rMax === 0) return null;

  const overlapStart = Math.max(cMin, rMin);
  const overlapEnd = Math.min(cMax, rMax);
  if (overlapEnd >= overlapStart) {
    return 1;
  }
  const gap = overlapStart - overlapEnd;
  const ref = Math.max(cMax, rMax, 1);
  const ratio = Math.max(0, 1 - gap / ref);
  return Math.max(0, Math.min(0.6, ratio));
}

/* ────────────────────────── ZONE / GÉOGRAPHIE ────────────────────────── */
function zoneScore(candZone, recZone, candRemote, recRemote) {
  const remoteTotal =
    normStr(candRemote) === "total" || normStr(recRemote) === "total";
  if (remoteTotal) return 1;

  if (!candZone && !recZone) return null;
  if (!candZone || !recZone) return 0.4;

  const a = normStr(candZone);
  const b = normStr(recZone);
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.75;

  const j = jaccard(tokenize(candZone), tokenize(recZone));
  return j !== null ? 0.2 + j * 0.5 : 0.3;
}

/* ────────────────────────── EXPÉRIENCE ────────────────────────── */
function experienceScore(candExp, recExpRequise) {
  if (candExp == null && recExpRequise == null) return null;
  if (recExpRequise == null) return 0.8;
  if (candExp == null) return 0.4;

  if (candExp >= recExpRequise) {
    const surplus = candExp - recExpRequise;
    if (surplus > 6) return 0.75;
    return 1;
  }
  const deficit = recExpRequise - candExp;
  return Math.max(0, 1 - deficit / Math.max(recExpRequise, 1));
}

/* ────────────────────────── ÉTUDES ────────────────────────── */
function etudeScore(candNiveau, recNiveauRequis) {
  const rc = etudeRank(candNiveau);
  const rr = etudeRank(recNiveauRequis);
  if (rc == null && rr == null) return null;
  if (rr == null) return 0.8;
  if (rc == null) return 0.4;
  if (rc >= rr) return 1;
  return Math.max(0, 1 - (rr - rc) / 6);
}

/* ────────────────────────── COMPÉTENCES ────────────────────────── */
function competencesScore(candComp = [], recComp = []) {
  const a = (candComp || []).map(normStr).filter(Boolean);
  const b = (recComp || []).map(normStr).filter(Boolean);
  return jaccard(a, b);
}

/* ────────────────────────── PONDÉRATION GLOBALE ────────────────────────── */
const WEIGHTS = {
  domaine: 30,
  salaire: 20,
  zone: 15,
  experience: 15,
  etudes: 10,
  competences: 10,
};

export function computeMatchScore(
  candidatCriteria = {},
  recruteurCriteria = {},
) {
  const c = candidatCriteria;
  const r = recruteurCriteria;

  const raw = {
    domaine: domainePathScore(c.domainePath, r.domainePath),
    salaire: salaryScore(
      c.salaireMin,
      c.salaireMax,
      r.salaireMin,
      r.salaireMax,
    ),
    zone: zoneScore(c.zone, r.zone, c.remote, r.remote),
    experience: experienceScore(c.experienceAnnees, r.experienceRequiseAnnees),
    etudes: etudeScore(c.niveauEtude, r.niveauEtudeRequis),
    competences: competencesScore(c.competences, r.competencesRequises),
  };

  let weightedSum = 0;
  let weightTotal = 0;
  const breakdown = {};

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const val = raw[key];
    if (val === null) continue;
    breakdown[key] = Math.round(val * 100);
    weightedSum += val * weight;
    weightTotal += weight;
  }

  const score =
    weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) : 0;

  const reasons = [];
  const warnings = [];

  if (breakdown.domaine >= 80) reasons.push("Métier et domaine très proches");
  else if (breakdown.domaine >= 45)
    reasons.push("Domaine professionnel compatible");
  else if (breakdown.domaine != null && breakdown.domaine < 30)
    warnings.push("Domaines assez éloignés");

  if (breakdown.salaire >= 90) reasons.push("Rémunérations alignées");
  else if (breakdown.salaire != null && breakdown.salaire < 40)
    warnings.push("Écart de rémunération important");

  if (breakdown.zone >= 90) reasons.push("Même zone géographique");
  else if (breakdown.zone != null && breakdown.zone < 30)
    warnings.push("Zones géographiques éloignées");

  if (breakdown.experience >= 90) reasons.push("Expérience adéquate");
  else if (breakdown.experience != null && breakdown.experience < 40)
    warnings.push("Écart d'expérience à discuter");

  if (breakdown.etudes >= 90) reasons.push("Niveau d'études adapté");

  if (breakdown.competences != null && breakdown.competences >= 50)
    reasons.push("Compétences communes solides");
  else if (breakdown.competences != null && breakdown.competences < 15)
    warnings.push("Peu de compétences communes détectées");

  return { score, breakdown, reasons, warnings };
}

/* ────────────────────────── PRÉFÉRENCES ────────────────────────── */
// Normalise les préférences reçues (objet `preferences` de users_emploi) en
// un jeu d'options utilisable ici. Les clés absentes gardent leur défaut
// "ON", cohérent avec DEFAULT_ON_PREFS côté serveur/front.
function normalizePrefs(prefs = {}) {
  return {
    triPertinence: prefs.triPertinence !== false,
    prioriteCV: prefs.prioriteCV !== false,
    masquerPourvus: prefs.masquerPourvus === true, // OFF par défaut : aucune donnée "pourvu" fiable tant que l'auteur ne l'a pas marqué
  };
}

function hasCompleteDocs(documents = {}) {
  return !!(documents && documents.cv && documents.lettre);
}

/**
 * Calcule et trie les matches pour un profil donné parmi un pool de profils
 * du rôle opposé.
 * @param {object} selfCriteria critères du profil courant
 * @param {'candidat'|'recruteur'} selfRole
 * @param {Array<{username:string, criteria:object, documents?:object, updatedAt?:string|Date, pourvu?:boolean}>} candidatePool
 * @param {object} [prefs] préférences utilisateur (Profil > Préférences)
 */
export function getMatchesForProfile(
  selfCriteria,
  selfRole,
  candidatePool = [],
  prefs = {},
) {
  const opts = normalizePrefs(prefs);
  const isCandidat = selfRole === "candidat";

  let pool = candidatePool;
  if (opts.masquerPourvus) {
    pool = pool.filter((entry) => !entry.pourvu);
  }

  const results = pool
    .map((entry) => {
      const targetCriteria = entry.criteria || {};
      const targetDocuments = entry.documents || {};
      const { score, breakdown, reasons, warnings } = isCandidat
        ? computeMatchScore(selfCriteria, targetCriteria)
        : computeMatchScore(targetCriteria, selfCriteria);

      return {
        username: entry.username,
        domainePath: targetCriteria.domainePath || [],
        metier:
          targetCriteria.metier ||
          (targetCriteria.domainePath || [])[
            (targetCriteria.domainePath || []).length - 1
          ] ||
          null,
        zone: targetCriteria.zone || null,
        salaireMin: targetCriteria.salaireMin ?? null,
        salaireMax: targetCriteria.salaireMax ?? null,
        experience:
          targetCriteria.experienceAnnees ??
          targetCriteria.experienceRequiseAnnees ??
          null,
        niveauEtude:
          targetCriteria.niveauEtude ||
          targetCriteria.niveauEtudeRequis ||
          null,
        competences:
          targetCriteria.competences ||
          targetCriteria.competencesRequises ||
          [],
        typeContrat: targetCriteria.typeContrat || null,
        remote: targetCriteria.remote || null,
        compatibility: score,
        breakdown,
        reasons,
        warnings,
        _hasCompleteDocs: hasCompleteDocs(targetDocuments),
        _updatedAt: entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0,
      };
    })
    .filter((m) => m.compatibility > 0);

  // Tri principal : compatibilité (défaut) ou date de publication la plus
  // récente si "Trier par compatibilité" est désactivé dans les préférences.
  results.sort((a, b) => {
    if (opts.triPertinence) return b.compatibility - a.compatibility;
    return b._updatedAt - a._updatedAt;
  });

  // Priorité aux profils avec CV + lettre complets : tri stable en deux
  // groupes (complets d'abord), sans casser l'ordre calculé ci-dessus.
  let ordered = results;
  if (opts.prioriteCV) {
    const complete = results.filter((r) => r._hasCompleteDocs);
    const incomplete = results.filter((r) => !r._hasCompleteDocs);
    ordered = [...complete, ...incomplete];
  }

  return ordered.map(({ _hasCompleteDocs, _updatedAt, ...rest }) => rest);
}

export default { computeMatchScore, getMatchesForProfile };
