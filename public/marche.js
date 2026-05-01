/**
 * marche.js — AiGENT · Marché Live Dashboard
 * ─────────────────────────────────────────────────────
 * Temps réel · données issues de /api/marche
 * Graphiques Chart.js · Heatmap · Flux live · Ticker
 * ─────────────────────────────────────────────────────
 */

/* ════════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════════ */
const REFRESH_INTERVAL = 8000; // ms entre chaque refresh live
const FLUX_MAX = 8; // nombre max d'événements dans le flux
const VIEW_WINDOW = 30; // Nombre de points visibles sur le graphique

let mainChart = null;
let historyOffset = 0; // 0 = Direct, > 0 = Passé
let donutChart = null;
let liveTimer = null;
let liveEnabled = true;
let currentMetric = "prix";
let currentRange = "1h";
let currentCity = "all"; // filtre ville actif
let marketHistory = []; // tous les points accumulés
let lastData = null;
/* ════════════════════════════════════════════════
   AUTH
════════════════════════════════════════════════ */
function getToken() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) return null;
    return JSON.parse(raw).token || null;
  } catch {
    return null;
  }
}

function redirectIfNoAuth() {
  if (!getToken()) {
    // window.location.href = "/login.html"; // Commented out to avoid redirect loops during dev if login page doesn't exist
    console.log("No token found, redirect skipped for demo");
  }
}

/* ════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════ */
const fmt = (n, d = 0) =>
  n == null || isNaN(n)
    ? "—"
    : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d });
const fmtPrice = (n) =>
  n ? (n >= 1_000_000 ? fmt(n / 1_000_000, 2) + " M€" : fmt(n, 0) + " €") : "—";
const fmtPct = (n) => (n != null ? "+" + fmt(n, 1) + " %" : "—");
const now = () =>
  new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2800);
}

/* ════════════════════════════════════════════════
   FETCH API
════════════════════════════════════════════════ */
// APRÈS
async function fetchMarche() {
  const token = getToken();
  try {
    const res = await fetch("/api/marche", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("API marche " + res.status);
    return await res.json();
  } catch (e) {
    console.warn("[marche] fetchMarche error:", e.message);
    return null;
  }
}

/* ════════════════════════════════════════════════
   TICKER
════════════════════════════════════════════════ */
function renderTicker(data) {
  const track = document.getElementById("tickerTrack");
  if (!track || !data) return;

  const items = [];

  // Prix par ville
  if (data.villes && data.villes.length) {
    data.villes.forEach((v) => {
      const chg = v.variation > 0 ? "up" : v.variation < 0 ? "down" : "flat";
      const sign = v.variation > 0 ? "▲" : v.variation < 0 ? "▼" : "—";
      items.push(`
        <span class="ticker-item">
          <span>${v.ville.toUpperCase()}</span>
          <span class="ticker-val ${chg}">${fmt(v.prixM2, 0)} €/m²</span>
          <span class="ticker-chg">${sign} ${Math.abs(v.variation || 0).toFixed(1)}%</span>
        </span>
        <span class="ticker-sep">·</span>
      `);
    });
  }

  // Stats globales
  items.push(`
    <span class="ticker-item">
      <span>MATCHS TOTAL</span>
      <span class="ticker-val up">${fmt(data.kpi?.totalMatchs, 0)}</span>
    </span>
    <span class="ticker-sep">·</span>
    <span class="ticker-item">
      <span>COMPAT MOY</span>
      <span class="ticker-val flat">${fmt(data.kpi?.compatMoy, 1)} %</span>
    </span>
    <span class="ticker-sep">·</span>
    <span class="ticker-item">
      <span>SURFACE MÉD</span>
      <span class="ticker-val flat">${fmt(data.kpi?.surfaceMediane, 0)} m²</span>
    </span>
    <span class="ticker-sep">·</span>
  `);

  // Double pour l'animation infinie
  const html = items.join("");
  track.innerHTML = html + html;
}

/* ════════════════════════════════════════════════
   KPI CARDS
════════════════════════════════════════════════ */
function renderKPI(data) {
  if (!data?.kpi) return;
  const k = data.kpi;

  setKPI(
    "matches",
    fmt(k.totalMatchs, 0),
    k.matchsMois,
    "ce mois",
    "spark-matches",
    k.sparkMatchs,
  );
  setKPI(
    "prix",
    fmt(k.prixMedianM2, 0) + " €",
    k.variationPrix,
    "variation",
    "spark-prix",
    k.sparkPrix,
  );
  setKPI(
    "compat",
    fmt(k.compatMoy, 1) + " %",
    k.variationCompat,
    "points",
    "spark-compat",
    k.sparkCompat,
  );
  setKPI(
    "users",
    fmt(k.usersActifs, 0),
    k.nouveauxUsers,
    "nouveaux",
    "spark-users",
    k.sparkUsers,
  );
  setKPI(
    "surface",
    fmt(k.surfaceMediane, 0) + " m²",
    k.variationSurface,
    "m² vs mois",
    "spark-surface",
    k.sparkSurface,
  );
}

function setKPI(id, value, delta, suffix, sparkId, sparkData) {
  const valEl = document.getElementById("kv-" + id);
  const dltEl = document.getElementById("kd-" + id);
  const card = document.getElementById("kpi-" + id);

  if (valEl) valEl.textContent = value;
  if (dltEl && delta != null) {
    const isUp = delta > 0;
    const isDown = delta < 0;
    dltEl.textContent = (isUp ? "+" : "") + fmt(delta, 1) + " " + suffix;
    dltEl.className = "kpi-delta " + (isUp ? "up" : isDown ? "down" : "flat");
  }

  // Flash update
  if (card) {
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
  }

  // Sparkline
  if (sparkId && sparkData && sparkData.length > 1) {
    renderSparkline(sparkId, sparkData);
  }
}

function renderSparkline(id, values) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 100,
    h = 32,
    pad = 2;
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  svg.innerHTML = `
    <defs>
      <linearGradient id="sg-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--violet)" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="var(--violet)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${points} ${w - pad},${h} ${pad},${h}" fill="url(#sg-${id})"/>
    <polyline points="${points}" fill="none" stroke="var(--violet)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

/* ════════════════════════════════════════════════
   GRAPHIQUE PRINCIPAL
════════════════════════════════════════════════ */
function buildChartData(history, metric) {
  // Filtre ville si actif
  const filtered =
    currentCity === "all"
      ? history
      : history.filter((p) => p.city === currentCity);

  const src = filtered.length ? filtered : history; // fallback si ville sans data

  const labels = src.map((p) => p.time);
  const values = src.map((p) => {
    switch (metric) {
      case "prix":
        return p.prixM2;
      case "matchs":
        return p.matchs;
      case "compat":
        return p.compat;
      case "surface":
        return p.surface;
      default:
        return p.prixM2;
    }
  });

  const metaMap = {
    prix: { label: "Prix médian/m²", color: "#8b5cf6", unit: " €/m²" },
    matchs: { label: "Matchs", color: "#22d3ee", unit: "" },
    compat: { label: "Compatibilité", color: "#34d399", unit: " %" },
    surface: { label: "Surface", color: "#f472b6", unit: " m²" },
  };

  return { labels, values, meta: metaMap[metric] || metaMap.prix };
}

function initMainChart() {
  const canvas = document.getElementById("mainChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, "rgba(139,92,246,0.2)");
  gradient.addColorStop(1, "rgba(139,92,246,0)");

  mainChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Prix médian/m²",
          data: [],
          borderColor: "#8b5cf6",
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.45,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: "#8b5cf6",
        },
        {
          label: "Zone haute",
          data: [],
          borderColor: "transparent",
          backgroundColor: "rgba(139,92,246,0.07)",
          fill: "+1",
          tension: 0.45,
          pointRadius: 0,
          borderWidth: 0,
        },
        {
          label: "Zone basse",
          data: [],
          borderColor: "transparent",
          backgroundColor: "transparent",
          fill: false,
          tension: 0.45,
          pointRadius: 0,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: { duration: 600, easing: "easeInOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(13,13,30,0.95)",
          borderColor: "rgba(139,92,246,0.3)",
          borderWidth: 1,
          titleColor: "#a89ec9",
          bodyColor: "#f1f0ff",
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const meta = buildChartData(marketHistory, currentMetric).meta;
              return ` ${ctx.parsed.y.toFixed(1)}${meta.unit}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(138,92,246,0.06)", drawBorder: false },
          ticks: {
            color: "#5e5a7a",
            font: { family: "'Space Mono', monospace", size: 9 },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
        },
        y: {
          position: "right",
          grid: { color: "rgba(138,92,246,0.06)", drawBorder: false },
          ticks: {
            color: "#5e5a7a",
            font: { family: "'Space Mono', monospace", size: 9 },
            callback: (v) => {
              const meta = buildChartData(marketHistory, currentMetric).meta;
              return v.toFixed(0) + (meta.unit || "");
            },
          },
        },
      },
    },
  });
}

function updateMainChart() {
  if (!mainChart || !marketHistory.length) return;

  // ── FILTRAGE AVANT SLICING ──
  // AVANT : on tranchait puis on filtrait (donnant des graphiques quasi vides si bcp de villes)
  // APRES : on filtre par ville d'abord, puis on extrait les derniers points
  const filteredHistory =
    currentCity === "all"
      ? marketHistory.filter((p) => p.city === "all")
      : marketHistory.filter((p) => p.city === currentCity);

  const total = filteredHistory.length;
  const end = Math.max(0, total - historyOffset);
  const start = Math.max(0, end - VIEW_WINDOW);
  const slice = filteredHistory.slice(start, end);

  const { labels, values, meta } = buildChartData(slice, currentMetric);

  const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const std = Math.sqrt(
    values.reduce((a, b) => a + (b - avg) ** 2, 0) / (values.length || 1),
  );

  mainChart.data.labels = labels;
  mainChart.data.datasets[0].data = values;
  mainChart.data.datasets[0].label = meta.label;
  mainChart.data.datasets[0].borderColor = meta.color;

  const canvas = document.getElementById("mainChart");
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, meta.color + "33");
  gradient.addColorStop(1, meta.color + "00");
  mainChart.data.datasets[0].backgroundColor = gradient;

  mainChart.data.datasets[1].data = values.map((v) => v + std * 0.5);
  mainChart.data.datasets[2].data = values.map((v) => v - std * 0.5);

  mainChart.update("active");

  // ── Overlay valeur ──
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : last;
  const chgPct = prev ? ((last - prev) / prev) * 100 : 0;

  const covLabel = document.getElementById("cov-label");
  const covValue = document.getElementById("cov-value");
  const covChg = document.getElementById("cov-chg");
  const legendLabel = document.getElementById("legend-label");
  const lastUpd = document.getElementById("last-update");

  if (covLabel) covLabel.textContent = meta.label.toUpperCase();
  if (covValue)
    covValue.textContent = (last?.toFixed(1) ?? "—") + (meta.unit || "");
  if (covChg) {
    const sign = chgPct >= 0 ? "▲" : "▼";
    covChg.textContent = `${sign} ${Math.abs(chgPct).toFixed(2)} %`;
    covChg.className = "cov-chg " + (chgPct >= 0 ? "up" : "down");
  }
  if (legendLabel) legendLabel.textContent = meta.label;
  if (lastUpd) lastUpd.textContent = "MAJ " + now();

  // ── Mise à jour boutons nav ──
  const btnBack = document.getElementById("btn-nav-back");
  const btnFwd = document.getElementById("btn-nav-fwd");
  const navLabel = document.getElementById("chart-nav-label");

  if (btnBack) btnBack.disabled = end <= VIEW_WINDOW;
  if (btnFwd) btnFwd.disabled = historyOffset === 0;
  if (navLabel)
    navLabel.textContent =
      historyOffset === 0 ? "Direct" : `-${historyOffset} pts`;
}

/* ════════════════════════════════════════════════
   DONUT CHART — Distribution compatibilité
════════════════════════════════════════════════ */
function initDonutChart() {
  const canvas = document.getElementById("donutChart");
  if (!canvas) return;

  donutChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: ["Forte ≥80%", "Bonne 60-79%", "Moyenne 40-59%", "Faible <40%"],
      datasets: [
        {
          data: [0, 0, 0, 0],
          backgroundColor: ["#34d399", "#8b5cf6", "#fbbf24", "#f87171"],
          borderColor: "#13132a",
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(13,13,30,0.95)",
          borderColor: "rgba(139,92,246,0.3)",
          borderWidth: 1,
          titleColor: "#a89ec9",
          bodyColor: "#f1f0ff",
          padding: 10,
        },
      },
      animation: { animateRotate: true, duration: 900 },
    },
  });
}

function updateDonut(data) {
  if (!donutChart || !data?.distribution) return;
  const d = data.distribution;
  const total =
    (d.forte || 0) + (d.bonne || 0) + (d.moyenne || 0) + (d.faible || 0);

  donutChart.data.datasets[0].data = [
    d.forte || 0,
    d.bonne || 0,
    d.moyenne || 0,
    d.faible || 0,
  ];
  donutChart.update();

  // Centre
  const avg = data.kpi?.compatMoy;
  const avgEl = document.getElementById("donut-avg");
  if (avgEl) avgEl.textContent = avg ? fmt(avg, 1) : "—";

  // Badge total
  const badge = document.getElementById("badge-total-dist");
  if (badge) badge.textContent = fmt(total, 0);

  // Légende donut
  const legend = document.getElementById("donut-legend");
  if (!legend) return;
  const colors = ["#34d399", "#8b5cf6", "#fbbf24", "#f87171"];
  const labels = ["Forte", "Bonne", "Moy.", "Faible"];
  const counts = [d.forte || 0, d.bonne || 0, d.moyenne || 0, d.faible || 0];
  legend.innerHTML = labels
    .map(
      (l, i) => `
    <div class="donut-legend-item">
      <div class="dl-dot" style="background:${colors[i]}"></div>
      <span class="dl-label">${l}</span>
      <span class="dl-val">${counts[i]}</span>
    </div>
  `,
    )
    .join("");
}

/* ════════════════════════════════════════════════
   TOP VILLES
════════════════════════════════════════════════ */
function renderVilles(data) {
  const list = document.getElementById("ville-list");
  const badge = document.getElementById("badge-villes");
  if (!list || !data?.villes?.length) return;

  const villes = data.villes.slice(0, 8);
  const max = Math.max(...villes.map((v) => v.matchs || 0));

  badge.textContent = villes.length + " villes";

  list.innerHTML = villes
    .map(
      (v, i) => `
    <div class="ville-row">
      <span class="ville-rank">${i + 1}</span>
      <span class="ville-name">${v.ville}</span>
      <div class="ville-bar-wrap">
        <div class="ville-bar-fill" data-w="${max ? Math.round((v.matchs / max) * 100) : 0}"></div>
      </div>
      <span class="ville-count">${v.matchs}</span>
    </div>
  `,
    )
    .join("");
  // ── Peupler le select ville ──
  const sel = document.getElementById("chartCitySelect");
  if (sel && data?.villes?.length) {
    const existing = new Set([...sel.options].map((o) => o.value));
    data.villes.forEach((v) => {
      if (!existing.has(v.ville)) {
        const opt = document.createElement("option");
        opt.value = v.ville;
        opt.textContent = v.ville;
        sel.appendChild(opt);
      }
    });
  }

  // Animation barres
  requestAnimationFrame(() =>
    setTimeout(() => {
      list.querySelectorAll(".ville-bar-fill").forEach((el) => {
        el.style.width = el.dataset.w + "%";
      });
    }, 100),
  );
}

/* ════════════════════════════════════════════════
   FLUX LIVE
════════════════════════════════════════════════ */
const FLUX_TEMPLATES = [
  (d) => ({
    type: "match",
    dot: "match",
    text: `<strong>${d.u1}</strong> matché avec <strong>${d.u2}</strong> · ${d.compat}% de compatibilité`,
  }),
  (d) => ({
    type: "signup",
    dot: "signup",
    text: `<strong>${d.pseudo}</strong> vient de rejoindre AiGENT · ${d.ville}`,
  }),
  (d) => ({
    type: "view",
    dot: "view",
    text: `<strong>${d.u1}</strong> consulte le profil de <strong>${d.u2}</strong>`,
  }),
  (d) => ({
    type: "fav",
    dot: "fav",
    text: `<strong>${d.u1}</strong> a ajouté un bien en favori · ${d.ville}`,
  }),
];

function pushFluxEvent(event) {
  const list = document.getElementById("flux-list");
  if (!list) return;

  const item = document.createElement("div");
  item.className = "flux-item";
  item.innerHTML = `
    <div class="flux-dot ${event.dot}"></div>
    <div class="flux-text">${event.text}</div>
    <div class="flux-time">${now().slice(0, 5)}</div>
  `;

  list.prepend(item);

  // Limiter
  while (list.children.length > FLUX_MAX) {
    list.removeChild(list.lastChild);
  }
}

function renderFlux(data) {
  if (!data?.fluxLive?.length) return;
  data.fluxLive.forEach((evt) => pushFluxEvent(evt));
}

/* ════════════════════════════════════════════════
   TYPES DE BIENS
════════════════════════════════════════════════ */
const TYPE_ICONS = {
  appartement: "🏢",
  maison: "🏡",
  studio: "🛏",
  villa: "🏠",
  loft: "🏗",
  duplex: "🏛",
  pavillon: "🌳",
  terrain: "🌿",
};

function renderTypes(data) {
  const list = document.getElementById("type-list");
  if (!list || !data?.types?.length) return;

  const total = data.types.reduce((s, t) => s + t.count, 0);
  const colors = [
    "#6366f1",
    "#8b5cf6",
    "#f472b6",
    "#22d3ee",
    "#34d399",
    "#fbbf24",
  ];

  list.innerHTML = data.types
    .slice(0, 6)
    .map((t, i) => {
      const pct = total ? Math.round((t.count / total) * 100) : 0;
      return `
      <div class="type-row">
        <div class="type-icon" style="background:${colors[i]}22">${TYPE_ICONS[t.type] || "🏠"}</div>
        <div class="type-info">
          <div class="type-name">${t.type.charAt(0).toUpperCase() + t.type.slice(1)}</div>
          <div class="type-bar-wrap">
            <div class="type-bar-fill" data-w="${pct}" style="background:${colors[i]}"></div>
          </div>
        </div>
        <div class="type-count">${t.count}</div>
      </div>
    `;
    })
    .join("");

  requestAnimationFrame(() =>
    setTimeout(() => {
      list.querySelectorAll(".type-bar-fill").forEach((el) => {
        el.style.width = el.dataset.w + "%";
      });
    }, 150),
  );
}

/* ════════════════════════════════════════════════
   TABLE PRIX / VILLE
════════════════════════════════════════════════ */
function renderPrixTable(data) {
  const tbody = document.getElementById("prix-table-body");
  if (!tbody || !data?.villes?.length) return;

  tbody.innerHTML = data.villes
    .slice(0, 8)
    .map((v) => {
      const trendUp = (v.variation || 0) >= 0;
      const sign = trendUp ? "▲" : "▼";
      const trendCls = trendUp ? "prix-trend-up" : "prix-trend-down";
      return `
      <tr>
        <td>${v.ville}</td>
        <td style="font-family:'Space Mono',monospace;font-size:11px">${fmt(v.prixM2, 0)} €</td>
        <td>${v.matchs}</td>
        <td class="${trendCls}">${sign} ${Math.abs(v.variation || 0).toFixed(1)}%</td>
      </tr>
    `;
    })
    .join("");
}

/* ════════════════════════════════════════════════
   HEATMAP
════════════════════════════════════════════════ */
function renderHeatmap(data) {
  const grid = document.getElementById("heatmap-grid");
  const days = document.getElementById("hmap-days");
  if (!grid) return;

  const DAY_LABELS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
  if (days) {
    days.innerHTML = DAY_LABELS.map(
      (d) => `<div class="hmap-day-label">${d}</div>`,
    ).join("");
  }

  // Construire une matrice 4 semaines × 7 jours depuis data.heatmap
  const heatData = data?.heatmap || generateDefaultHeatmap(data);
  const maxVal = Math.max(...heatData, 1);

  grid.innerHTML = heatData
    .map((v, i) => {
      const intensity = v / maxVal;
      let opacity = 0;
      if (intensity > 0.8) opacity = 1;
      else if (intensity > 0.6) opacity = 0.65;
      else if (intensity > 0.4) opacity = 0.4;
      else if (intensity > 0.1) opacity = 0.2;

      const style =
        opacity > 0 ? `background: rgba(139, 92, 246, ${opacity})` : "";

      const dayName = DAY_LABELS[i % 7];
      const weekNum = Math.floor(i / 7) + 1;

      return `<div class="hmap-cell" style="${style}" data-tip="${v} matchs · S${weekNum} ${dayName}"></div>`;
    })
    .join("");
}

function generateDefaultHeatmap(data) {
  // Génère une heatmap réaliste basée sur le total de matchs
  const total = data?.kpi?.totalMatchs || 100;
  return Array.from({ length: 28 }, (_, i) => {
    const dayOfWeek = i % 7;
    // Plus d'activité en semaine
    const base = dayOfWeek < 5 ? 0.6 : 0.3;
    return Math.round((base + Math.random() * 0.4) * (total / 28));
  });
}

/* ════════════════════════════════════════════════
   HISTORIQUE GRAPHIQUE — accumulation locale
════════════════════════════════════════════════ */
/* AVANT : Accumulation de points sans distinction claire du filtre ville lors de l'affichage */
/* APRES : Normalisation du stockage pour permettre un filtrage fluide sans "explosion" de données invisibles */
function updateHistory(data) {
  if (!data?.kpi) return;
  const k = data.kpi;
  const t = now();

  // Point global (toutes villes)
  marketHistory.push({
    time: t,
    city: "all",
    prixM2: k.prixMedianM2 || 0,
    matchs: k.totalMatchs || 0,
    compat: k.compatMoy || 0,
    surface: k.surfaceMediane || 0,
  });

  // Points par ville (pour filtre)
  if (data.villes?.length) {
    data.villes.forEach((v) => {
      marketHistory.push({
        time: t,
        city: v.ville,
        prixM2: v.prixM2 || 0,
        matchs: v.matchs || 0,
        compat: k.compatMoy || 0,
        surface: k.surfaceMediane || 0,
      });
    });
  }

  const maxPoints = { "1h": 60, "6h": 72, "24h": 96, "7d": 84, "30d": 90 };
  const max = (maxPoints[currentRange] || 60) * 10; // ×10 car on stocke N villes
  if (marketHistory.length > max) marketHistory = marketHistory.slice(-max);
}

/* ════════════════════════════════════════════════
   SIMULATION TEMPS RÉEL (micro-variations)
════════════════════════════════════════════════ */
/* AVANT : Simulation qui pouvait décaler le graphique de façon imprévisible en ne poussant qu'un point */
/* APRES : Simulation d'un nouveau tick "global" et "ville" pour garder la synchro */
// APRÈS — micro-variation autour des valeurs réelles du dernier fetch
function simulateTick() {
  if (!lastData?.kpi || !marketHistory.length) return;
  const t = now();
  // Bruit minimal : ±0.15% pour "vivant" sans déformer la réalité
  const noise = (base, pct = 0.0015) =>
    Math.round(base * (1 + (Math.random() - 0.5) * pct) * 100) / 100;

  // Ancre sur les vraies valeurs du dernier fetch (pas sur le tick précédent)
  // pour éviter la dérive cumulative
  const realBase = {
    prixM2: lastData.kpi.prixMedianM2 || 0,
    matchs: lastData.kpi.totalMatchs || 0,
    compat: lastData.kpi.compatMoy || 0,
    surface: lastData.kpi.surfaceMediane || 0,
  };

  marketHistory.push({
    time: t,
    city: "all",
    prixM2: noise(realBase.prixM2),
    matchs: realBase.matchs + (Math.random() > 0.8 ? 1 : 0), // +1 rare et réaliste
    compat: Math.max(0, Math.min(100, noise(realBase.compat, 0.002))),
    surface: noise(realBase.surface, 0.001),
  });

  if (currentCity !== "all") {
    const villeData = lastData.villes?.find((v) => v.ville === currentCity);
    if (villeData) {
      marketHistory.push({
        time: t,
        city: currentCity,
        prixM2: noise(villeData.prixM2 || realBase.prixM2),
        matchs: villeData.matchs || 0,
        compat: noise(realBase.compat, 0.002),
        surface: noise(realBase.surface, 0.001),
      });
    }
  }

  const maxPoints = 2000;
  if (marketHistory.length > maxPoints)
    marketHistory = marketHistory.slice(-maxPoints);
  if (historyOffset === 0) updateMainChart();
}

/* ════════════════════════════════════════════════
   REFRESH COMPLET
════════════════════════════════════════════════ */
async function refresh() {
  const icon = document.getElementById("refresh-icon");
  if (icon) icon.style.animation = "spin 1s linear";

  const data = await fetchMarche();

  if (icon) setTimeout(() => (icon.style.animation = ""), 1000);

  if (!data) {
    console.warn("[marche] données indisponibles");
    return;
  }

  lastData = data;

  // Mise à jour UI
  renderTicker(data);
  renderKPI(data);
  renderVilles(data);
  renderTypes(data);
  renderPrixTable(data);
  renderFlux(data);
  updateDonut(data);
  renderHeatmap(data);

  // Historique + graphique
  updateHistory(data);
  updateMainChart();

  // Date page
  const sub = document.getElementById("page-sub");
  if (sub)
    sub.textContent = `Dernière mise à jour : ${now()} · données AiGENT temps réel`;
}

/* ════════════════════════════════════════════════
   LIVE TIMER
════════════════════════════════════════════════ */
// APRÈS — refresh API réel toutes les 8s, simulation entre-temps
function startLive() {
  if (liveTimer) clearInterval(liveTimer);

  let tickCount = 0;
  // Tick toutes les 2s. Refresh API réel toutes les 4 ticks (=8s).
  // Entre les refreshs : simulation légère ancrée sur lastData.
  liveTimer = setInterval(async () => {
    if (!liveEnabled) return;
    tickCount++;
    if (tickCount % 4 === 0) {
      // Refresh API réel : capte les nouveaux sellers/buyers/matchs
      await refresh();
    } else {
      simulateTick();
    }
  }, 2000);
}

function simulateFluxEvent() {
  if (!lastData) return;
  const villes = lastData.villes?.map((v) => v.ville) || [
    "Paris",
    "Lyon",
    "Bordeaux",
  ];
  const ville = villes[Math.floor(Math.random() * villes.length)];
  const types = [
    { dot: "match", text: `<strong>Matching</strong> en cours · ${ville}` },
    { dot: "view", text: `Consultation de profil · <strong>${ville}</strong>` },
    { dot: "fav", text: `Nouveau favori ajouté · <strong>${ville}</strong>` },
  ];
  const evt = types[Math.floor(Math.random() * types.length)];
  pushFluxEvent(evt);
}

/* ════════════════════════════════════════════════
   FILTRES RANGE + METRIC
════════════════════════════════════════════════ */
function initFilters() {
  // Filtre range
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      marketHistory = []; // reset historique local
      refresh();
    });
  });

  // Tabs métrique
  document.querySelectorAll(".metric-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".metric-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentMetric = tab.dataset.metric;
      updateMainChart();
    });
  });
}

/* ════════════════════════════════════════════════
   BOUTONS EN-TÊTE
════════════════════════════════════════════════ */
function initPageActions() {
  // Live toggle
  const liveBtn = document.getElementById("btn-live-toggle");
  if (liveBtn) {
    liveBtn.addEventListener("click", () => {
      liveEnabled = !liveEnabled;
      if (liveEnabled) {
        liveBtn.innerHTML =
          '<span class="live-dot" style="display:inline-block"></span> Live ON';
        liveBtn.style.opacity = "1";
        showToast("🟢 Live activé");
      } else {
        liveBtn.innerHTML = "⏸ Live OFF";
        liveBtn.style.opacity = "0.6";
        showToast("⏸ Live pausé");
      }
    });
  }

  // Refresh manuel
  document.getElementById("btn-refresh")?.addEventListener("click", () => {
    marketHistory = [];
    refresh();
    showToast("🔄 Actualisation en cours...");
  });

  // Export
  document.getElementById("btn-export")?.addEventListener("click", exportCSV);

  // ── Navigation temporelle ──
  document.getElementById("btn-nav-back")?.addEventListener("click", () => {
    const maxOffset = Math.max(0, marketHistory.length - VIEW_WINDOW);
    historyOffset = Math.min(
      historyOffset + Math.floor(VIEW_WINDOW / 2),
      maxOffset,
    );
    updateMainChart();
  });

  document.getElementById("btn-nav-fwd")?.addEventListener("click", () => {
    historyOffset = Math.max(0, historyOffset - Math.floor(VIEW_WINDOW / 2));
    updateMainChart();
  });

  // ── Filtre ville ──
  document
    .getElementById("chartCitySelect")
    ?.addEventListener("change", (e) => {
      currentCity = e.target.value;
      historyOffset = 0; // retour au direct lors du changement de ville
      updateMainChart();
    });
}

/* ════════════════════════════════════════════════
   EXPORT CSV
════════════════════════════════════════════════ */
function exportCSV() {
  if (!lastData) {
    showToast("Aucune donnée à exporter");
    return;
  }

  const lines = ["Ville,Prix m²,Matchs,Variation %"];
  (lastData.villes || []).forEach((v) => {
    lines.push(
      `${v.ville},${v.prixM2 || 0},${v.matchs || 0},${v.variation || 0}`,
    );
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aigent-marche-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("📄 Export CSV téléchargé");
}

/* ════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════
   SIDEBAR MOBILE
════════════════════════════════════════════════ */
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const openBtn = document.getElementById("openSidebar");
  const overlay = document.getElementById("sidebarOverlay");

  const mobileBtn = document.querySelector("#openSidebar");
  if (mobileBtn)
    mobileBtn.style.display = window.innerWidth <= 900 ? "flex" : "none";
  window.addEventListener("resize", () => {
    if (mobileBtn)
      mobileBtn.style.display = window.innerWidth <= 900 ? "flex" : "none";
  });

  const open = () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("active");
  };
  const close = () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("active");
  };

  openBtn?.addEventListener("click", open);
  overlay?.addEventListener("click", close);
}

/* ════════════════════════════════════════════════
   SPIN ANIMATION (refresh icon)
════════════════════════════════════════════════ */
const spinStyle = document.createElement("style");
spinStyle.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(spinStyle);

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  redirectIfNoAuth();
  initTheme();
  initSidebar();
  initFilters();
  initPageActions();
  initMainChart();
  initDonutChart();

  // Premier chargement
  await refresh();

  // Démarrer le live
  startLive();
});
