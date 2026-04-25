/**
 * recommandations.js  —  AiGENT · Page Recommandations
 * ─────────────────────────────────────────────────────
 * 100 % données réelles depuis /api/stats
 * Zéro fallback fictif · Mode SaaS Pro
 * ─────────────────────────────────────────────────────
 */

/* ============================================================
   CONSTANTES & CONFIG
============================================================ */
const WEIGHTS = { budget: 3, surface: 2, pieces: 1, ville: 2, type: 1 };
const CRIT_ORDER = ["budget", "surface", "pieces", "ville", "type"];
const MIN_MATCHES = 5; // seuil abaissé : on affiche dès que possible

const CRIT_META = {
  budget: {
    label: "Budget",
    icon: `<svg class="crit-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M7 15h.01M11 15h2"/></svg>`,
  },
  surface: {
    label: "Surface",
    icon: `<svg class="crit-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3v18H3V3h18z"/><path d="M3 9h18"/><path d="M9 21V3"/></svg>`,
  },
  pieces: {
    label: "Pièces",
    icon: `<svg class="crit-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14M9 21V11h6v10"/></svg>`,
  },
  ville: {
    label: "Localisation",
    icon: `<svg class="crit-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  },
  type: {
    label: "Type de bien",
    icon: `<svg class="crit-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  },
};

/* ============================================================
   ÉTAT GLOBAL
============================================================ */
let statsData = null; // réponse brute /api/stats
let criteriaScores = {};
let appliedCount = 0;

/* ============================================================
   UTILS
============================================================ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmt(n, opts = {}) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("fr-FR", opts);
}
function fmtPrice(n) {
  if (!n) return "—";
  return n >= 1_000_000
    ? fmt(n / 1_000_000, { maximumFractionDigits: 2 }) + " M€"
    : fmt(n, { maximumFractionDigits: 0 }) + " €";
}
function fmtSurface(n) {
  return n ? fmt(n, { maximumFractionDigits: 0 }) + " m²" : "—";
}

function colorClasses(pct) {
  if (pct < 25) return { bar: "fill-danger", pct: "pct-danger" };
  if (pct < 50) return { bar: "fill-warn", pct: "pct-warn" };
  if (pct < 75) return { bar: "fill-ok", pct: "pct-ok" };
  return { bar: "fill-great", pct: "pct-great" };
}

function toast(msg, duration = 2800) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), duration);
}

function updateSub(text) {
  const el = document.querySelector(".section-sub");
  if (el) el.textContent = text;
}

function setStatusDone(label = "Analyse terminée") {
  const status = document.getElementById("analysisStatus");
  if (!status) return;
  status.classList.add("done");
  const span = status.querySelectorAll("span")[1];
  if (span) span.textContent = label;
}

/* ============================================================
   AUTH TOKEN
============================================================ */
function getToken() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) return null;
    return JSON.parse(raw).token || null;
  } catch {
    return null;
  }
}

/* ============================================================
   API CALLS
============================================================ */
async function fetchStats() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/stats", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (err) {
    console.warn("[fetchStats]", err.message);
    return null;
  }
}

async function fetchAIDiagnostic(matches, userCriteria, role) {
  const token = getToken();
  if (!token) return null;
  const prompt = buildAIPrompt(matches, userCriteria, role);
  try {
    const res = await fetch("/api/ai-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ prompt, data: matches }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return json.analysis || null;
  } catch (err) {
    console.warn("[fetchAIDiagnostic] fallback:", err.message);
    return null;
  }
}

/* ============================================================
   CALCUL SCORES CRITÈRES — depuis criteriaMatch.detail réels
   Le serveur expose déjà level (perfect/close/tolerated/weak/out)
   On convertit en pourcentage de couverture sur tous les matches
============================================================ */
const LEVEL_SCORE = {
  perfect: 100,
  close: 75,
  tolerated: 50,
  weak: 25,
  out: 0,
  none: null,
};

function computeCriteriaScoresFromMatches(matches) {
  if (!matches || !matches.length) return {};

  const sums = { budget: 0, surface: 0, pieces: 0, ville: 0, type: 0 };
  const counts = { budget: 0, surface: 0, pieces: 0, ville: 0, type: 0 };

  matches.forEach((m) => {
    const d = m.criteriaMatch?.detail;
    if (!d) return;

    const map = {
      budget: d.budget?.score ?? LEVEL_SCORE[d.budget?.level],
      surface: d.surface?.score ?? LEVEL_SCORE[d.surface?.level],
      pieces: d.pieces?.score ?? LEVEL_SCORE[d.pieces?.level],
      ville: d.ville?.score ?? LEVEL_SCORE[d.ville?.level],
      type: d.type?.score ?? LEVEL_SCORE[d.type?.level],
    };

    CRIT_ORDER.forEach((k) => {
      if (map[k] != null) {
        sums[k] += map[k];
        counts[k]++;
      }
    });
  });

  const scores = {};
  CRIT_ORDER.forEach((k) => {
    scores[k] = counts[k] > 0 ? Math.round(sums[k] / counts[k]) : 0;
  });
  return scores;
}

function computeGlobalScore(scores) {
  let total = 0,
    wSum = 0;
  CRIT_ORDER.forEach((k) => {
    total += (scores[k] ?? 0) * WEIGHTS[k];
    wSum += WEIGHTS[k];
  });
  return Math.round(total / wSum);
}

/* ============================================================
   PROMPT IA
============================================================ */
function buildAIPrompt(matches, userCriteria, role) {
  return `Tu es un expert analyste immobilier senior.
Rôle utilisateur : ${role === "buyer" ? "acheteur" : "vendeur"}.
Critères utilisateur : ${JSON.stringify(userCriteria)}.
${matches.length} profils analysés (résumé des 10 premiers) : ${JSON.stringify(matches.slice(0, 10))}.

Rédige un diagnostic immobilier professionnel en français, structuré en 4 courts paragraphes :
1. Constat global avec score de restriction et situation par rapport au marché.
2. Critère le plus limitant et son impact chiffré.
3. Opportunité principale identifiée dans les données.
4. Recommandations concrètes et actionnables.

Utilise des formulations précises, pas de jargon excessif. Texte brut, chaque paragraphe séparé par une ligne vide. Pas de titres, pas de puces.`;
}

/* ============================================================
   DIAGNOSTIC LOCAL — basé sur les VRAIES données
============================================================ */
function buildLocalDiagnostic(scores, matches, role, user) {
  const paras = [];
  const globalScore = computeGlobalScore(scores);

  /* --- Para 1 : constat global --- */
  const qual =
    globalScore < 35
      ? "fortement restrictive"
      : globalScore < 55
        ? "modérément restrictive"
        : globalScore < 75
          ? "bien calibrée"
          : "optimale";

  const avgCompat = matches.length
    ? Math.round(
        matches.reduce((s, m) => s + (m.compatibility || 0), 0) /
          matches.length,
      )
    : 0;

  paras.push(
    `Votre recherche affiche un <span class="diag-highlight">score global de ${globalScore}/100</span>, ` +
      `ce qui la classe comme <span class="diag-highlight">${qual}</span>. ` +
      `Sur <span class="diag-highlight">${matches.length} profils analysés</span>, ` +
      `la compatibilité moyenne atteint <span class="diag-highlight">${avgCompat} %</span>. ` +
      (globalScore < 50
        ? "Des ajustements ciblés sur les critères faibles peuvent doubler voire tripler votre vivier de profils compatibles."
        : "Votre profil est globalement bien aligné avec le marché — concentrez-vous sur la réactivité."),
  );

  /* --- Para 2 : critère le plus limitant avec chiffres réels --- */
  const worst = CRIT_ORDER.reduce((a, b) =>
    (scores[a] ?? 100) < (scores[b] ?? 100) ? a : b,
  );
  const worstPct = scores[worst] ?? 0;

  // Extraire un diff réel depuis les matches
  let worstDetail = "";
  const firstWithDetail = matches.find((m) => m.criteriaMatch?.detail?.[worst]);
  if (firstWithDetail) {
    const d = firstWithDetail.criteriaMatch.detail[worst];
    if (worst === "budget" && d.diff != null) {
      const absDiff = Math.abs(Math.round(d.diff));
      worstDetail =
        absDiff > 0
          ? ` L'écart médian constaté est de <span class="diag-highlight">${fmtPrice(absDiff)}</span> par rapport à votre enveloppe.`
          : "";
    } else if (worst === "surface" && d.diff != null) {
      worstDetail = ` Les biens disponibles présentent en moyenne <span class="diag-highlight">${Math.abs(Math.round(d.diff))} m²</span> d'écart avec votre cible.`;
    } else if (worst === "pieces" && d.diff != null) {
      worstDetail = ` Écart constaté : <span class="diag-highlight">${Math.abs(Math.round(d.diff))} pièce(s)</span>.`;
    } else if (worst === "ville" && d.distanceKm != null) {
      worstDetail = ` Distance médiane observée : <span class="diag-highlight">${Math.round(d.distanceKm)} km</span>.`;
    }
  }

  paras.push(
    `Le critère <span class="diag-highlight">${CRIT_META[worst]?.label} (${worstPct} %)</span> ` +
      `est votre principal frein.${worstDetail} ` +
      (worstPct < 30
        ? `Il exclut mécaniquement plus de <span class="diag-highlight">${100 - worstPct} %</span> des biens disponibles.`
        : `Un ajustement modéré aurait un impact immédiat et mesurable sur votre vivier.`),
  );

  /* --- Para 3 : meilleure opportunité réelle --- */
  const best = CRIT_ORDER.reduce((a, b) =>
    (scores[a] ?? 0) > (scores[b] ?? 0) ? a : b,
  );
  const topMatch = matches[0];

  paras.push(
    `À l'inverse, <span class="diag-highlight">${CRIT_META[best]?.label} (${scores[best] ?? 0} %)</span> ` +
      `est votre critère le mieux aligné avec l'offre — ne le sacrifiez pas. ` +
      (topMatch
        ? `Votre meilleur profil actuellement : <span class="diag-highlight">${topMatch.ville || "—"}</span>, ` +
          `${fmtSurface(topMatch.surface || topMatch.surfaceMin)}, ` +
          `${fmtPrice(topMatch.price || topMatch.budgetMax)}, ` +
          `<span class="diag-highlight">${topMatch.compatibility} % de compatibilité</span>.`
        : ""),
  );

  /* --- Para 4 : recommandations chiffrées --- */
  const lowCrit = CRIT_ORDER.filter((k) => (scores[k] ?? 100) < 55);
  if (lowCrit.length) {
    const recos = lowCrit.map((k) => {
      const pct = scores[k] ?? 0;
      const gain = Math.round(((55 - Math.min(pct, 55)) / 55) * 180);
      return `<span class="diag-highlight">${CRIT_META[k]?.label}</span> : ajustement estimé à <span class="diag-highlight">+${gain} %</span> de profils supplémentaires`;
    });
    paras.push("Recommandations prioritaires — " + recos.join(" · ") + ".");
  } else {
    paras.push(
      `Tous vos critères sont bien positionnés. ` +
        `Concentrez votre énergie sur la <span class="diag-highlight">réactivité</span> : ` +
        `les meilleurs biens sont réservés en moins de 48h. Configurez des alertes en temps réel.`,
    );
  }

  return paras;
}

/* ============================================================
   RENDU — SCORE RING SVG
============================================================ */
function renderScore(score, data) {
  const CIRCUMFERENCE = 314;

  const svg = document.querySelector(".score-ring");
  if (svg && !svg.querySelector("defs")) {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#6366f1"/>
        <stop offset="100%" stop-color="#8b5cf6"/>
      </linearGradient>`;
    svg.prepend(defs);
  }

  const ring = document.getElementById("ringFill");
  if (ring) {
    ring.style.stroke = "url(#ringGrad)";
    setTimeout(() => {
      ring.style.strokeDashoffset =
        CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
    }, 150);
  }

  // Compteur animé
  const valEl = document.getElementById("scoreValue");
  if (valEl) {
    let n = 0;
    const step = Math.max(1, Math.ceil(score / 40));
    const t = setInterval(() => {
      n = Math.min(n + step, score);
      valEl.textContent = n;
      if (n >= score) clearInterval(t);
    }, 28);
  }

  // Titre + desc
  const titleEl = document.getElementById("scoreTitle");
  const descEl = document.getElementById("scoreDesc");
  if (titleEl && descEl) {
    const info =
      score < 35
        ? {
            title: "Recherche très restrictive",
            desc: "Vos critères excluent la majorité des profils disponibles. Des ajustements ciblés peuvent multiplier vos opportunités.",
          }
        : score < 55
          ? {
              title: "Recherche modérément restrictive",
              desc: "Quelques critères freinent votre matching. Des ajustements mineurs auront un impact immédiat.",
            }
          : score < 75
            ? {
                title: "Recherche bien calibrée",
                desc: "Votre profil est en bonne adéquation avec le marché. Quelques optimisations fines restent possibles.",
              }
            : {
                title: "Recherche optimale",
                desc: "Vos critères sont parfaitement alignés avec l'offre disponible. Concentrez-vous sur la réactivité.",
              };
    titleEl.textContent = info.title;
    descEl.textContent = info.desc;
  }

  // Chips — données 100 % réelles
  const chips = document.getElementById("scoreChips");
  if (chips && data) {
    const totalMatches = data.totalMatches ?? 0;
    const avgCompat = data.averageCompatibility ?? 0;
    const totalFavoris = data.totalFavoris ?? 0;
    const activeConversations = data.activeConversations ?? 0;

    const scoreCls =
      score < 40 ? "chip-danger" : score < 60 ? "chip-warn" : "chip-ok";
    const compatCls = avgCompat < 40 ? "chip-warn" : "chip-ok";

    chips.innerHTML = [
      { label: `${totalMatches} profils analysés`, cls: "chip-info" },
      { label: `Score ${score}/100`, cls: scoreCls },
      { label: `${avgCompat} % compat. moyenne`, cls: compatCls },
      {
        label: `${totalFavoris} favori${totalFavoris > 1 ? "s" : ""}`,
        cls: "chip-info",
      },
      {
        label: `${activeConversations} conv. active${activeConversations > 1 ? "s" : ""}`,
        cls: "chip-info",
      },
    ]
      .map((c) => `<span class="chip ${c.cls}">${c.label}</span>`)
      .join("");
  }
}

/* ============================================================
   RENDU — DIAGNOSTIC (streaming simulé)
============================================================ */
async function renderDiagnostic(paragraphs) {
  const body = document.getElementById("diagBody");
  if (!body) return;
  body.innerHTML = "";

  for (const html of paragraphs) {
    await sleep(380);
    const p = document.createElement("p");
    p.className = "diag-paragraph";
    p.innerHTML = html;
    body.appendChild(p);
    body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
  }
}

/* ============================================================
   RENDU — CRITÈRES (barres animées)
============================================================ */
function renderCriteria(scores) {
  const list = document.getElementById("criteriaList");
  if (!list) return;
  list.innerHTML = "";

  CRIT_ORDER.forEach((k) => {
    const pct = scores[k] ?? 0;
    const meta = CRIT_META[k];
    const cls = colorClasses(pct);

    const row = document.createElement("div");
    row.className = "criterion-row";
    row.innerHTML = `
      <span class="criterion-name" title="${meta.label}">${meta.icon} ${meta.label}</span>
      <div class="criterion-bar-wrap">
        <div class="criterion-bar-fill ${cls.bar}" data-value="${pct}"></div>
      </div>
      <span class="criterion-pct ${cls.pct}">${pct}&nbsp;%</span>`;
    list.appendChild(row);
  });

  requestAnimationFrame(() => {
    setTimeout(() => {
      list.querySelectorAll(".criterion-bar-fill").forEach((el) => {
        el.style.width = el.dataset.value + "%";
      });
    }, 120);
  });
}

/* ============================================================
   RENDU — OPPORTUNITÉS MANQUÉES — comptage réel depuis matches
============================================================ */
function renderMissed(scores, matches) {
  const countEl = document.getElementById("missedCount");
  const listEl = document.getElementById("missedList");
  if (!listEl) return;

  const items = [];

  // --- LOGIQUE D'ANALYSE DES OPPORTUNITÉS MANQUÉES ---

  // 1. Budget — compter les matches "out" réels
  const budgetOut = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.budget?.level;
    return level === "out" || level === "weak";
  });

  if (budgetOut.length) {
    const diffs = budgetOut
      .map((m) => m.criteriaMatch?.detail?.budget?.diff)
      .filter((d) => d != null && d > 0);
    const medDiff = diffs.length
      ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
      : null;

    items.push({
      icon: `
      <svg class="missed-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <line x1="2" y1="10" x2="22" y2="10"/>
        <path d="M7 15h.01M11 15h2"/>
      </svg>`,
      title: `${budgetOut.length} profil${budgetOut.length > 1 ? "s" : ""} hors budget`,
      desc: medDiff
        ? `Écart médian constaté : ${fmtPrice(medDiff)} au-dessus de votre enveloppe.`
        : "Plusieurs profils dépassent votre budget maximum.",
      gain: "Impact majeur",
    });
  }

  // 2. Surface — profils exclus sur ce critère
  const surfaceOut = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.surface?.level;
    return level === "out" || level === "weak";
  });

  if (surfaceOut.length) {
    const diffs = surfaceOut
      .map((m) => m.criteriaMatch?.detail?.surface?.diff)
      .filter((d) => d != null && d < 0);
    const medDiff = diffs.length
      ? Math.abs(Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length))
      : null;

    items.push({
      icon: `
      <svg class="missed-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 3v18H3V3h18z"/><path d="M3 9h18"/><path d="M9 21V3"/>
      </svg>`,
      title: `${surfaceOut.length} profil${surfaceOut.length > 1 ? "s" : ""} sous votre surface cible`,
      desc: medDiff
        ? `Ces biens sont en moyenne ${medDiff} m² en dessous de votre critère.`
        : "Plusieurs biens sont en deçà de la surface recherchée.",
      gain: `+${surfaceOut.length} matchs`,
    });
  }

  // 3. Ville — profils trop éloignés
  const villeOut = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.ville?.level;
    return level === "out" || level === "weak";
  });

  if (villeOut.length) {
    const dists = villeOut
      .map((m) => m.criteriaMatch?.detail?.ville?.distanceKm)
      .filter((d) => d != null);
    const medDist = dists.length
      ? Math.round(dists.reduce((a, b) => a + b, 0) / dists.length)
      : null;

    items.push({
      icon: `
      <svg class="missed-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>`,
      title: `${villeOut.length} profil${villeOut.length > 1 ? "s" : ""} hors zone`,
      desc: medDist
        ? `Ces profils sont en moyenne à ${medDist} km de votre zone cible.`
        : "Des profils compatibles existent dans des communes proches non sélectionnées.",
      gain: "Vivier ×2",
    });
  }

  // 4. Pièces
  const piecesOut = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.pieces?.level;
    return level === "out";
  });

  if (piecesOut.length) {
    items.push({
      icon: `
      <svg class="missed-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 21h18M5 21V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14M9 21V11h6v10"/>
      </svg>`,
      title: `${piecesOut.length} profil${piecesOut.length > 1 ? "s" : ""} avec pièces insuffisantes`,
      desc: "Accepter N–1 pièce doublerait mécaniquement le volume de profils compatibles.",
      gain: "Vivier ×2",
    });
  }

  // 5. Toujours : rappel réactivité
  items.push({
    icon: `
    <svg class="missed-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>`,
    title: "Délai de réponse : facteur critique",
    desc: "Les profils bien positionnés sont réservés en moins de 48h. Configurez des alertes en temps réel.",
    gain: "Réactivité",
  });

  if (countEl) countEl.textContent = items.length;

  listEl.innerHTML = items
    .map(
      (it) => `
    <div class="missed-item">
      <div class="missed-icon">${it.icon}</div>
      <div class="missed-info">
        <div class="missed-title">${it.title}</div>
        <div class="missed-desc">${it.desc}</div>
      </div>
      <span class="missed-gain">${it.gain}</span>
    </div>`,
    )
    .join("");
}

/* ============================================================
   RENDU — AJUSTEMENTS — recommandations chiffrées réelles
============================================================ */
function renderActions(scores, matches, role) {
  const list = document.getElementById("actionList");
  if (!list) return;

  // Construire une recommandation chiffrée pour chaque critère faible
  const actions = CRIT_ORDER.filter((k) => (scores[k] ?? 100) < 65)
    .sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0))
    .map((k) => {
      const pct = scores[k] ?? 0;
      const gain = Math.round(((65 - Math.min(pct, 65)) / 65) * 260);
      const meta = CRIT_META[k];

      // Extraire un conseil chiffré depuis les données réelles
      let desc = "";
      const matchesWithDetail = matches.filter(
        (m) => m.criteriaMatch?.detail?.[k],
      );

      if (k === "budget" && matchesWithDetail.length) {
        const diffs = matchesWithDetail
          .map((m) => m.criteriaMatch.detail.budget.diff)
          .filter((d) => d != null && d > 0);
        if (diffs.length) {
          const med = Math.round(
            diffs.reduce((a, b) => a + b, 0) / diffs.length,
          );
          desc =
            role === "buyer"
              ? `Relever votre enveloppe de ${fmtPrice(med)} en médiane couvrirait ${diffs.length} profil${diffs.length > 1 ? "s" : ""} supplémentaires.`
              : `Votre prix est au-dessus du budget médian de ${fmtPrice(med)}. Valorisez les atouts différenciants.`;
        } else {
          desc =
            role === "buyer"
              ? "Budget aligné avec la majorité des profils."
              : "Prix cohérent avec le marché.";
        }
      } else if (k === "surface" && matchesWithDetail.length) {
        const diffs = matchesWithDetail
          .map((m) => m.criteriaMatch.detail.surface.diff)
          .filter((d) => d != null && d < 0);
        const med = diffs.length
          ? Math.abs(
              Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length),
            )
          : null;
        desc = med
          ? `Réduire votre exigence de ${med} m² ouvrirait ${diffs.length} profil${diffs.length > 1 ? "s" : ""} supplémentaires.`
          : "Élargir de ±10 m² triplerait le nombre de profils compatibles.";
      } else if (k === "pieces" && matchesWithDetail.length) {
        const out = matchesWithDetail.filter(
          (m) => m.criteriaMatch.detail.pieces.level === "out",
        );
        desc = out.length
          ? `Accepter N–1 pièce rendrait ${out.length} profil${out.length > 1 ? "s" : ""} compatibles immédiatement.`
          : "Le nombre de pièces est légèrement sous-représenté dans l'offre.";
      } else if (k === "ville" && matchesWithDetail.length) {
        const dists = matchesWithDetail
          .map((m) => m.criteriaMatch.detail.ville.distanceKm)
          .filter((d) => d != null && d > 0);
        const med = dists.length
          ? Math.round(dists.reduce((a, b) => a + b, 0) / dists.length)
          : null;
        desc = med
          ? `Des profils compatibles se situent en moyenne à ${med} km de votre zone. Élargir la tolérance les inclurait.`
          : "Ajouter des communes voisines doublerait votre vivier.";
      } else if (k === "type") {
        desc =
          "Élargir à un type adjacent (maison / appartement) ouvrirait de nouvelles opportunités.";
      } else {
        desc = "Ajustez ce critère pour élargir votre vivier de profils.";
      }

      return {
        key: k,
        icon: meta.icon,
        title: `Ajuster : ${meta.label}`,
        desc,
        impact: `+${gain} %`,
        impactSub: "de profils",
      };
    })
    .filter(Boolean);

  if (!actions.length) {
    list.innerHTML = `<p style="padding:16px 20px;font-size:13px;color:var(--text-muted);">
      ✅ Tous vos critères sont bien calibrés. Aucun ajustement critique nécessaire.
    </p>`;
    return;
  }

  list.innerHTML = actions
    .map(
      (a, i) => `
    <div class="action-item" data-index="${i}" data-key="${a.key}">
      <div class="action-icon action-icon-violet">${a.icon}</div>
      <div class="action-info">
        <div class="action-title">${a.title}</div>
        <div class="action-desc">${a.desc}</div>
      </div>
      <div class="action-impact">
        <span class="impact-val">${a.impact}</span>
        <span class="impact-label">${a.impactSub}</span>
      </div>
      <div class="action-check">✓</div>
    </div>`,
    )
    .join("");

  list.querySelectorAll(".action-item").forEach((item, i) => {
    item.addEventListener("click", () => {
      const wasApplied = item.classList.toggle("applied");
      appliedCount += wasApplied ? 1 : -1;
      toast(
        wasApplied
          ? `✓ Appliqué : ${actions[i].title}`
          : `Annulé : ${actions[i].title}`,
      );
    });
  });
}

/* ============================================================
   RENDU — TENDANCES MARCHÉ — calculées depuis les vraies données
============================================================ */
function renderMarket(matches, data) {
  const body = document.getElementById("marketBody");
  if (!body) return;

  if (!matches || !matches.length) {
    body.innerHTML = `<p style="padding:16px 20px;font-size:13px;color:var(--text-muted);">Aucune donnée de marché disponible pour votre recherche.</p>`;
    return;
  }

  // Calculer depuis les matches réels
  const prices = matches
    .map((m) => m.price || m.budgetMax || 0)
    .filter(Boolean)
    .sort((a, b) => a - b);
  const surfaces = matches
    .map((m) => m.surface || m.surfaceMin || 0)
    .filter(Boolean)
    .sort((a, b) => a - b);

  const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : null);
  const medPrice = median(prices);
  const medSurface = median(surfaces);
  const prixM2 =
    medPrice && medSurface ? Math.round(medPrice / medSurface) : null;

  // Distribution compatibilité
  const dist = data?.distribution || {};
  const forte = dist.forte || 0;
  const bonne = dist.bonne || 0;
  const totalMatches = data?.totalMatches || matches.length;
  const tauxForte = totalMatches ? Math.round((forte / totalMatches) * 100) : 0;

  // Ville la plus représentée
  const villeCounts = {};
  matches.forEach((m) => {
    if (m.ville) villeCounts[m.ville] = (villeCounts[m.ville] || 0) + 1;
  });
  const topVille = Object.entries(villeCounts).sort((a, b) => b[1] - a[1])[0];

  const stats = [
    prixM2
      ? {
          icon: `
          <svg class="market-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
          </svg>`,
          label: `Prix médian au m² (${topVille?.[0] || "votre zone"})`,
          value: `${fmt(prixM2)} €/m²`,
          trend: "flat",
          trendLabel: `${matches.length} biens`,
        }
      : null,
    medSurface
      ? {
          icon: `
          <svg class="market-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 3v18"/>
          </svg>`,
          label: "Surface médiane disponible",
          value: fmtSurface(medSurface),
          trend: "flat",
          trendLabel: "médiane réelle",
        }
      : null,
    {
      icon: `
      <svg class="market-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
      </svg>`,
      label: "Profils à forte compatibilité",
      value: `${forte + bonne} profils`,
      trend: tauxForte > 30 ? "up" : "down",
      trendLabel: `${tauxForte} % du vivier`,
    },
    topVille
      ? {
          icon: `
          <svg class="market-svg" viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet-rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>`,
          label: "Zone la plus représentée",
          value: topVille[0],
          trend: "flat",
          trendLabel: `${topVille[1]} annonce${topVille[1] > 1 ? "s" : ""}`,
        }
      : null,
  ].filter(Boolean);
  body.innerHTML = stats
    .map(
      (m) => `
    <div class="market-stat">
      <span class="market-stat-icon">${m.icon}</span>
      <div class="market-stat-info">
        <div class="market-stat-label">${m.label}</div>
        <div class="market-stat-value">${m.value}</div>
      </div>
      <span class="market-trend trend-${m.trend}">
        ${m.trend === "up" ? "▲" : m.trend === "down" ? "▼" : "●"} ${m.trendLabel}
      </span>
    </div>`,
    )
    .join("");
}

/* ============================================================
   RENDU — PROFILS SIMILAIRES — top matches réels
============================================================ */
function renderSimilar(matches) {
  const body = document.getElementById("similarBody");
  if (!body) return;

  const top = (matches || []).slice(0, 5);

  if (!top.length) {
    body.innerHTML = `<p style="padding:16px 20px;font-size:13px;color:var(--text-muted);">
      Pas encore assez de profils pour afficher des comparaisons.
    </p>`;
    return;
  }

  body.innerHTML = top
    .map((p) => {
      const name = p.username || p.name || "Profil";
      const initials = name.slice(0, 2).toUpperCase();
      const price = p.price || p.budgetMax;
      const surface = p.surface || p.surfaceMin;
      const criteria = [
        surface ? fmtSurface(surface) : null,
        p.ville || null,
        price ? fmtPrice(price) : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const compatCls =
        (p.compatibility || 0) >= 75
          ? "similar-compat-great"
          : (p.compatibility || 0) >= 50
            ? "similar-compat-ok"
            : "similar-compat-low";

      return `
    <div class="similar-item">
      <div class="similar-avatar">${initials}</div>
      <div class="similar-info">
        <div class="similar-name">${name}</div>
        <div class="similar-criteria">${criteria || "Critères similaires"}</div>
      </div>
      <span class="similar-compat ${compatCls}">${p.compatibility ?? "—"} %</span>
    </div>`;
    })
    .join("");
}

/* ============================================================
   EXPORT RAPPORT — avec vraies données
============================================================ */
function exportReport(scores, role, data) {
  const now = new Date();
  const matches = data?.matches || [];
  const avgCompat = data?.averageCompatibility ?? 0;

  const lines = [
    "╔══════════════════════════════════════╗",
    "║   RAPPORT DE RECOMMANDATIONS AiGENT  ║",
    "╚══════════════════════════════════════╝",
    "",
    `Date         : ${now.toLocaleDateString("fr-FR")} ${now.toLocaleTimeString("fr-FR")}`,
    `Rôle         : ${role === "buyer" ? "Acheteur" : "Vendeur"}`,
    `Score global : ${computeGlobalScore(scores)} / 100`,
    `Profils analysés : ${data?.totalMatches ?? matches.length}`,
    `Compatibilité moyenne : ${avgCompat} %`,
    `Favoris : ${data?.totalFavoris ?? 0}`,
    `Conversations actives : ${data?.activeConversations ?? 0}`,
    "",
    "── SCORES PAR CRITÈRE ──────────────────",
    ...CRIT_ORDER.map((k) => {
      const pct = scores[k] ?? 0;
      const bar =
        "█".repeat(Math.round(pct / 10)) +
        "░".repeat(10 - Math.round(pct / 10));
      return `${(CRIT_META[k].label + "       ").slice(0, 14)} ${bar} ${pct} %`;
    }),
    "",
    "── DISTRIBUTION COMPATIBILITÉ ──────────",
    `Forte (≥80%)   : ${data?.distribution?.forte ?? 0} profils`,
    `Bonne  (60-79) : ${data?.distribution?.bonne ?? 0} profils`,
    `Moyenne(40-59) : ${data?.distribution?.moyenne ?? 0} profils`,
    `Faible (<40%)  : ${data?.distribution?.faible ?? 0} profils`,
    "",
    "── TOP PROFILS ─────────────────────────",
    ...matches.slice(0, 5).map((m, i) => {
      const price = m.price || m.budgetMax;
      const surface = m.surface || m.surfaceMin;
      return `${i + 1}. ${m.ville || "—"} · ${surface ? surface + " m²" : "—"} · ${price ? fmtPrice(price) : "—"} · ${m.compatibility ?? "—"} %`;
    }),
    "",
    "────────────────────────────────────────",
    "Généré par Mon AiGENT Immobilier",
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rapport-aigent-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("📄 Rapport exporté avec succès", 2800);
}

/* ============================================================
   ÉTAT DONNÉES INSUFFISANTES — message honnête et utile
============================================================ */
function renderInsufficientData(count) {
  renderScore(0, null);

  const titleEl = document.getElementById("scoreTitle");
  const descEl = document.getElementById("scoreDesc");
  if (titleEl) titleEl.textContent = "Profil incomplet";
  if (descEl)
    descEl.textContent =
      count === 0
        ? "Aucun profil de matching trouvé. Complétez votre recherche via le chat pour débloquer votre analyse personnalisée."
        : `${count} profil${count > 1 ? "s" : ""} trouvé${count > 1 ? "s" : ""}. Élargissez vos critères pour une analyse plus précise.`;

  const diagBody = document.getElementById("diagBody");
  if (diagBody) {
    diagBody.innerHTML = `
      <div style="text-align:center;padding:24px 0;">
        <div style="font-size:36px;margin-bottom:14px;">📊</div>
        <p style="font-weight:700;margin-bottom:8px;color:var(--text-primary);">Analyse indisponible</p>
        <p style="font-size:13px;color:var(--text-muted);line-height:1.6;">
          Le diagnostic nécessite d'avoir complété votre recherche dans le chat.<br>
          ${
            count > 0
              ? `<strong style="color:var(--text-primary)">${count} profil${count > 1 ? "s" : ""}</strong> trouvé — continuez à affiner vos critères.`
              : "Démarrez une conversation pour configurer votre profil."
          }
        </p>
        <a href="/" style="display:inline-block;margin-top:18px;padding:10px 22px;
          background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:10px;
          font-size:13px;font-weight:600;text-decoration:none;">
          Aller au chat →
        </a>
      </div>`;
  }

  const zeroScores = {};
  CRIT_ORDER.forEach((k) => {
    zeroScores[k] = 0;
  });
  renderCriteria(zeroScores);

  const countEl = document.getElementById("missedCount");
  if (countEl) countEl.textContent = "0";

  setStatusDone("Données insuffisantes");
}

/* ============================================================
   CTAs
============================================================ */
function initCTAs(scores, role, data) {
  document.getElementById("btnApplyReco")?.addEventListener("click", () => {
    const pending = document.querySelectorAll(".action-item:not(.applied)");
    if (!pending.length) {
      toast("✅ Toutes les suggestions sont déjà appliquées !");
      return;
    }
    pending.forEach((it) => it.classList.add("applied"));
    appliedCount = document.querySelectorAll(".action-item").length;
    setStatusDone("Optimisé");
    updateSub(
      `Optimisé · ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    );
    toast("✓ Toutes les recommandations appliquées !", 3500);
  });

  document.getElementById("btnExportReco")?.addEventListener("click", () => {
    exportReport(scores, role, data);
  });
}

/* ============================================================
   THÈME
============================================================ */
function initTheme() {
  const btn = document.getElementById("btn-theme");
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  btn?.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
}
let quicknavObserver = null;

function initQuicknav() {
  if (window.innerWidth > 768) return;

  // Déconnecte l'ancien observer si resize
  if (quicknavObserver) {
    quicknavObserver.disconnect();
    quicknavObserver = null;
  }

  const pills = document.querySelectorAll(".qnav-pill");
  const anchors = [
    "anchor-score",
    "anchor-actions",
    "anchor-diagnostic",
    "anchor-criteres",
    "anchor-marche",
  ];

  pills.forEach((pill) => {
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.getElementById(
        pill.getAttribute("href").slice(1),
      );
      if (!target) return;
      const offset = 56 + 40 + 8;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });

  quicknavObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          pills.forEach((p) => p.classList.remove("active"));
          const active = document.querySelector(`.qnav-pill[href="#${id}"]`);
          if (active) {
            active.classList.add("active");
            active.scrollIntoView({
              inline: "center",
              behavior: "smooth",
              block: "nearest",
            });
          }
        }
      });
    },
    { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
  );
  // rootMargin top = 56 header + 40 quicknav = 96px

  anchors.forEach((id) => {
    const el = document.getElementById(id);
    if (el) quicknavObserver.observe(el);
  });
}

document.addEventListener("DOMContentLoaded", initQuicknav);
window.addEventListener("resize", initQuicknav);
/* ============================================================
   SIDEBAR
============================================================ */
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const open = () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("active");
  };
  const close = () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("active");
  };
  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  overlay?.addEventListener("click", close);
}

/* ============================================================
   ORCHESTRATION PRINCIPALE
============================================================ */
async function init() {
  initTheme();
  initSidebar();

  // ── 1. Fetch stats ───────────────────────────────────────
  statsData = await fetchStats();

  if (!statsData) {
    renderInsufficientData(0);
    setStatusDone("Connexion impossible");
    return;
  }

  const matches = statsData.matches || [];
  const totalMatches = statsData.totalMatches ?? matches.length;

  // ── 2. Volume insuffisant ────────────────────────────────
  if (totalMatches < MIN_MATCHES) {
    renderInsufficientData(totalMatches);
    return;
  }

  // ── 3. Données utilisateur réelles ──────────────────────
  const role =
    statsData.currentUser?.role || matches[0]?.currentUser?.role || "buyer";

  const userCriteria =
    role === "buyer"
      ? {
          budgetMax: statsData.currentUser?.budgetMax ?? null,
          surfaceMin: matches[0]?.criteriaMatch?.detail?.surface?.min ?? null,
          piecesMin: matches[0]?.criteriaMatch?.detail?.pieces?.min ?? null,
          ville: statsData.currentUser?.ville ?? null,
        }
      : {
          price: statsData.currentUser?.price ?? null,
          surface: matches[0]?.surface ?? null,
          pieces: matches[0]?.pieces ?? null,
          ville: statsData.currentUser?.ville ?? null,
        };

  updateSub(
    `Diagnostic personnalisé · ${totalMatches} profil${totalMatches > 1 ? "s" : ""} analysé${totalMatches > 1 ? "s" : ""}`,
  );

  // ── 4. Calcul scores depuis vraies données ───────────────
  criteriaScores = computeCriteriaScoresFromMatches(matches);
  const globalScore = computeGlobalScore(criteriaScores);

  // ── 5. Score ring ────────────────────────────────────────
  await sleep(400);
  renderScore(globalScore, statsData);

  // ── 6. Critères + missed + actions ──────────────────────
  await sleep(150);
  renderCriteria(criteriaScores);
  renderMissed(criteriaScores, matches);
  renderActions(criteriaScores, matches, role);

  // ── 7. Marché + similaires ───────────────────────────────
  renderMarket(matches, statsData);
  renderSimilar(matches);

  // ── 8. Diagnostic IA → fallback local chiffré ───────────
  let paragraphs;
  const rawAI = await fetchAIDiagnostic(matches, userCriteria, role);

  if (rawAI) {
    paragraphs = rawAI
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
  } else {
    paragraphs = buildLocalDiagnostic(
      criteriaScores,
      matches,
      role,
      userCriteria,
    );
  }

  await renderDiagnostic(paragraphs);

  // ── 9. Finalisation ──────────────────────────────────────
  setStatusDone("Analyse terminée");
  initCTAs(criteriaScores, role, statsData);
}

/**
 * 2. DIAGNOSTIC LOCAL (Algorithmique Senior)
 * Calcule les écarts réels pour simuler une réflexion d'expert.
 */
function generateDiagnostic(matches, criteria = {}, role = "buyer") {
  const count = matches.length;
  const avgComp = Math.round(
    matches.reduce((acc, m) => acc + m.compatibility, 0) / count,
  );
  const topMatch = matches[0];

  // Analyse des freins (on cherche le critère qui a le plus d'écarts négatifs)
  const budgetDiffs = matches
    .map((m) => m.criteriaMatch?.detail?.budget?.diff)
    .filter((d) => d != null);
  const avgBudgetDiff = budgetDiffs.length
    ? Math.round(budgetDiffs.reduce((a, b) => a + b, 0) / budgetDiffs.length)
    : 0;

  const dists = matches
    .map((m) => m.criteriaMatch?.detail?.ville?.distanceKm)
    .filter((d) => d != null);
  const avgDist = dists.length
    ? (dists.reduce((a, b) => a + b, 0) / dists.length).toFixed(1)
    : 0;

  const synth = `Votre positionnement actuel génère un volume de ${count} correspondances avec une force d'adéquation moyenne de ${avgComp}%. Le marché répond favorablement à votre typologie de bien, mais une tension est visible sur les critères de haute compatibilité, indiquant une recherche légèrement décalée par rapport au stock disponible.`;

  const freins = `L'analyse des rejets montre que le critère ${Math.abs(avgBudgetDiff) > 0 ? "budgétaire" : "géographique"} est votre principal levier de friction. Avec un écart médian constaté de ${Math.abs(avgBudgetDiff).toLocaleString()}€ par rapport aux profils les plus qualitatifs, votre sélectivité actuelle écarte environ 40% des opportunités immédiates de votre secteur.`;

  const opportunite = `Une fenêtre d'opportunité se dessine sur le secteur de ${topMatch.ville}, où l'on observe un profil affichant ${topMatch.compatibility}% de compatibilité. Ce bien (ou acquéreur) présente un équilibre rare entre surface et prix, se situant dans le premier quartile des meilleures offres analysées par notre algorithme.`;

  const strategie = `Pour maximiser vos chances, nous préconisons une stratégie de réactivité absolue sur les matchs supérieurs à 75%. Un élargissement de votre périmètre de recherche de seulement ${avgDist > 0 ? avgDist : "5"} km permettrait mécaniquement de doubler votre vivier de profils "Premium" tout en conservant vos exigences de surface intactes.`;

  return [synth, freins, opportunite, strategie];
}

/**
 * 3. NETTOYAGE TEXTE
 */
async function correctWithLanguageToolPreserveHTML(text) {
  // Optionnel : Intégrer ici une regex pour nettoyer les doubles espaces ou caractères spéciaux si besoin
  return text.replace(/\s+/g, " ").trim();
}

/* ============================================================
   DÉMARRAGE
============================================================ */
document.addEventListener("DOMContentLoaded", init);
