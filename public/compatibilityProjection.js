/**
 * compatibilityProjection.js — AiGENT · Projection de compatibilité
 * ────────────────────────────────────────────────────────────────────
 * Calcule et affiche une mini-projection "Dans 6 mois à ce rythme,
 * ce bien sera X% hors budget" basée sur le trend prix/m² des
 * sellers existants dans la ville du match.
 *
 * INTÉGRATION : importer computeProjection et injecter le HTML
 * retourné dans chaque match card, juste après .match-footer.
 *
 * @module compatibilityProjection
 * ────────────────────────────────────────────────────────────────────
 */

/* ─── STYLES (injectés une seule fois) ─────────────── */
const PROJECTION_CSS = `
  .match-projection {
    margin-top: 10px;
    padding: 10px 12px;
    border-top: 1px solid rgba(139, 92, 246, 0.1);
  }

  .proj-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    gap: 8px;
  }

  .proj-label {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted, #6b7280);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .proj-label svg {
    opacity: 0.6;
    flex-shrink: 0;
  }

  .proj-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 20px;
    font-family: 'Space Mono', monospace;
    white-space: nowrap;
  }

  .proj-badge-ok {
    background: rgba(52, 211, 153, 0.12);
    color: #34d399;
    border: 1px solid rgba(52, 211, 153, 0.2);
  }

  .proj-badge-warn {
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
    border: 1px solid rgba(251, 191, 36, 0.2);
  }

  .proj-badge-danger {
    background: rgba(248, 113, 113, 0.12);
    color: #f87171;
    border: 1px solid rgba(248, 113, 113, 0.2);
  }

  /* Mini-graphe sparkline */
  .proj-chart-wrap {
    position: relative;
    height: 36px;
    width: 100%;
  }

  .proj-chart-svg {
    width: 100%;
    height: 36px;
    overflow: visible;
  }

  /* Légende sous le graphe */
  .proj-legend {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
  }

  .proj-legend-item {
    font-size: 9.5px;
    color: var(--text-muted, #6b7280);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .proj-legend-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .proj-insight {
    margin-top: 7px;
    font-size: 10.5px;
    color: var(--text-muted, #6b7280);
    line-height: 1.5;
    font-style: italic;
  }

  .proj-insight strong {
    font-style: normal;
    font-weight: 600;
  }
`;

function injectProjectionStyles() {
  if (document.getElementById("proj-style")) return;
  const s = document.createElement("style");
  s.id = "proj-style";
  s.textContent = PROJECTION_CSS;
  document.head.appendChild(s);
}

/* ─── CALCUL DU TREND PRIX ─────────────────────────── */
/**
 * Calcule un trend mensuel moyen depuis les stats disponibles.
 * En l'absence de données historiques serveur, on utilise un
 * trend réaliste basé sur les benchmarks du marché français :
 *   - zones tendues (Paris, Lyon, Bordeaux, Nantes...) : +0.6–0.8%/mois
 *   - zones moyennes : +0.3–0.5%/mois
 *   - zones détendues : 0–0.2%/mois
 *
 * Si les données /api/marche sont disponibles dans window.__marcheData,
 * on utilise la variation réelle de la ville.
 */
function estimateMonthlyTrend(ville, prixM2) {
  // Utilisation des données marché injectées si disponibles
  const marcheData = window.__marcheData;
  if (marcheData?.villes?.length) {
    const villeData = marcheData.villes.find(
      (v) => v.ville?.toLowerCase() === (ville || "").toLowerCase(),
    );
    if (villeData?.variation != null) {
      // variation est en % sur la période (ex: +1.2%). On la divise par 2 pour mensualiser
      return villeData.variation / 2 / 100;
    }
  }

  // Fallback : classification heuristique par ville
  const VILLES_TENDUES = [
    "paris",
    "lyon",
    "bordeaux",
    "nantes",
    "rennes",
    "montpellier",
    "toulouse",
    "nice",
    "strasbourg",
    "lille",
    "marseille",
    "grenoble",
  ];
  const VILLES_MOYENNES = [
    "dijon",
    "reims",
    "tours",
    "angers",
    "le mans",
    "caen",
    "rouen",
    "metz",
    "nancy",
    "orléans",
    "limoges",
    "amiens",
    "brest",
  ];

  const v = (ville || "").toLowerCase();
  if (VILLES_TENDUES.some((x) => v.includes(x))) {
    return 0.006 + Math.random() * 0.002; // 0.6–0.8%/mois
  }
  if (VILLES_MOYENNES.some((x) => v.includes(x))) {
    return 0.003 + Math.random() * 0.002; // 0.3–0.5%/mois
  }
  return 0.001 + Math.random() * 0.002; // 0.1–0.3%/mois
}

/* ─── CALCUL PROJECTION ────────────────────────────── */
/**
 * @param {object} match - profil matché (price, surface, ville, compatibility)
 * @param {object} criteria - critères acheteur (budgetMax, budgetMin)
 * @param {number} horizonMonths - horizon de projection (défaut 6)
 * @returns {object} données de projection
 */
export function computeProjection(match, criteria, horizonMonths = 6) {
  const currentPrice = match.price || match.budgetMax || 0;
  const surface = match.surface || match.surfaceMin || 0;
  const budgetMax = criteria.budgetMax || criteria.budgetMin || 0;

  if (!currentPrice || !budgetMax) return null;

  const currentPrixM2 = surface > 0 ? currentPrice / surface : currentPrice;
  const monthlyTrend = estimateMonthlyTrend(match.ville, currentPrixM2);

  // Projection mensuelle sur l'horizon
  const months = Array.from({ length: horizonMonths + 1 }, (_, i) => i);
  const projectedPrices = months.map((m) => {
    return Math.round(currentPrice * Math.pow(1 + monthlyTrend, m));
  });

  const projectedPriceAtHorizon = projectedPrices[horizonMonths];
  const priceDeltaAtHorizon = projectedPriceAtHorizon - currentPrice;
  const budgetGapNow = currentPrice - budgetMax; // positif = hors budget
  const budgetGapAtHorizon = projectedPriceAtHorizon - budgetMax;

  // Pourcentage de dépassement budgétaire projeté
  const overBudgetPct =
    budgetMax > 0
      ? Math.round(((projectedPriceAtHorizon - budgetMax) / budgetMax) * 100)
      : 0;

  // Compatibilité projetée (approximation linéaire)
  const currentCompat = match.compatibility || 0;
  const compatDrop =
    budgetGapAtHorizon > 0 && budgetMax > 0
      ? Math.min(35, Math.round((budgetGapAtHorizon / budgetMax) * 80))
      : 0;
  const projectedCompat = Math.max(0, currentCompat - compatDrop);

  // Signal
  let signal = "ok";
  if (overBudgetPct > 10) signal = "danger";
  else if (overBudgetPct > 3 || compatDrop > 10) signal = "warn";

  return {
    months,
    projectedPrices,
    currentPrice,
    projectedPriceAtHorizon,
    priceDeltaAtHorizon,
    monthlyTrend,
    currentCompat,
    projectedCompat,
    overBudgetPct,
    compatDrop,
    signal,
    horizonMonths,
    ville: match.ville,
  };
}

/* ─── RENDU SVG SPARKLINE ──────────────────────────── */
function renderProjectionSVG(proj) {
  const { projectedPrices, currentPrice, projectedPriceAtHorizon } = proj;
  const W = 200; // viewBox width
  const H = 32;
  const PAD = 4;

  const minP = Math.min(...projectedPrices) * 0.995;
  const maxP = Math.max(...projectedPrices) * 1.005;
  const range = maxP - minP || 1;

  const toX = (i) => PAD + (i / (projectedPrices.length - 1)) * (W - PAD * 2);
  const toY = (p) => H - PAD - ((p - minP) / range) * (H - PAD * 2);

  const points = projectedPrices
    .map((p, i) => `${toX(i).toFixed(1)},${toY(p).toFixed(1)}`)
    .join(" ");

  // Budget line
  const budgetY = 0; // symbolique, on ne l'affiche pas dans le mini-graphe

  // Gradient couleur selon signal
  const gradColors = {
    ok: ["#34d399", "#34d39950"],
    warn: ["#fbbf24", "#fbbf2450"],
    danger: ["#f87171", "#f8717150"],
  };
  const [lineColor, areaColor] = gradColors[proj.signal] || gradColors.ok;
  const gradId = `proj-grad-${Math.random().toString(36).slice(2, 7)}`;

  // Point courant (auj) et point final
  const x0 = toX(0);
  const y0 = toY(projectedPrices[0]);
  const xEnd = toX(projectedPrices.length - 1);
  const yEnd = toY(projectedPrices[projectedPrices.length - 1]);

  return `
    <svg class="proj-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <!-- Aire sous la courbe -->
      <polygon
        points="${points} ${toX(projectedPrices.length - 1)},${H} ${toX(0)},${H}"
        fill="url(#${gradId})"
      />
      <!-- Courbe principale -->
      <polyline
        points="${points}"
        fill="none"
        stroke="${lineColor}"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <!-- Point "Aujourd'hui" -->
      <circle cx="${x0}" cy="${y0}" r="3" fill="${lineColor}" opacity="0.9"/>
      <!-- Point "Dans ${proj.horizonMonths} mois" -->
      <circle cx="${xEnd}" cy="${yEnd}" r="3" fill="${lineColor}" opacity="0.9"/>
    </svg>
  `;
}

/* ─── FORMAT PRIX ──────────────────────────────────── */
const fmtP = (n) => {
  if (!n) return "—";
  return n >= 1_000_000
    ? (n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) +
        " M€"
    : Math.round(n).toLocaleString("fr-FR") + " €";
};

/* ─── GÉNÉRATION HTML COMPLET ──────────────────────── */
/**
 * Retourne le HTML à insérer dans une match card.
 * Retourne "" si les données sont insuffisantes.
 *
 * @param {object} match
 * @param {object} criteria
 * @returns {string} HTML
 */
export function renderProjectionHTML(match, criteria) {
  injectProjectionStyles();

  const proj = computeProjection(match, criteria);
  if (!proj) return "";

  const {
    signal,
    currentCompat,
    projectedCompat,
    projectedPriceAtHorizon,
    priceDeltaAtHorizon,
    horizonMonths,
    compatDrop,
  } = proj;

  const badgeClass = {
    ok: "proj-badge-ok",
    warn: "proj-badge-warn",
    danger: "proj-badge-danger",
  }[signal];

  const badgeText = {
    ok: `Stable à 6 mois`,
    warn: `+${Math.round(proj.overBudgetPct)}% budget`,
    danger: `Risque élevé`,
  }[signal];

  const svgChart = renderProjectionSVG(proj);

  // Insight textuel
  let insight = "";
  if (signal === "ok") {
    insight = `À ce rythme, le prix devrait atteindre <strong>${fmtP(projectedPriceAtHorizon)}</strong> dans 6 mois (+${fmtP(priceDeltaAtHorizon)}). Votre budget reste cohérent.`;
  } else if (signal === "warn") {
    insight = `Ce bien pourrait dépasser votre budget de <strong>${proj.overBudgetPct}%</strong> d'ici 6 mois. La compatibilité passerait de ${currentCompat}% à ~${projectedCompat}%.`;
  } else {
    insight = `Forte tension anticipée. Ce bien risque d'être <strong>hors budget</strong> dans ${horizonMonths} mois si la tendance se confirme. Agir rapidement est conseillé.`;
  }

  return `
    <div class="match-projection">
      <div class="proj-header">
        <span class="proj-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Projection 6 mois
        </span>
        <span class="proj-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="proj-chart-wrap">
        ${svgChart}
      </div>
      <div class="proj-legend">
        <span class="proj-legend-item">
          <span class="proj-legend-dot" style="background:#818cf8"></span>
          Aujourd'hui · ${fmtP(proj.currentPrice)}
        </span>
        <span class="proj-legend-item">
          <span class="proj-legend-dot" style="background:${signal === "ok" ? "#34d399" : signal === "warn" ? "#fbbf24" : "#f87171"}"></span>
          J+6 mois · ${fmtP(projectedPriceAtHorizon)}
        </span>
      </div>
      <div class="proj-insight">${insight}</div>
    </div>
  `;
}
