/**
 * marche.js — AiGENT · Marché Immobilier Dashboard
 * Rewrite complet — architecture propre, données réelles
 */

/* ── CONFIG ─────────────────────────────────────────────── */
const REFRESH_MS = 8000; // intervalle fetch API réel
const TICK_MS = 2000; // intervalle simulation entre refreshes
const FLUX_MAX = 8;
const VIEW_WINDOW = 30; // points visibles sur le graphique

/* ── STATE ───────────────────────────────────────────────── */
let mainChart = null;
let donutChart = null;
let liveTimer = null;
let liveEnabled = true;
let currentMetric = "prix";
let currentRange = "1h";
let currentCity = "all";
let historyOffset = 0;
let marketHistory = [];
let lastData = null;

/* ── AUTH ────────────────────────────────────────────────── */
function getToken() {
  try {
    const raw = localStorage.getItem("agent_user");
    return raw ? JSON.parse(raw).token : null;
  } catch {
    return null;
  }
}

/* ── UTILS ───────────────────────────────────────────────── */
const fmt = (n, d = 0) =>
  n == null || isNaN(n)
    ? "—"
    : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d });
const nowTime = () =>
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
  el._t = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ── FETCH ───────────────────────────────────────────────── */
async function fetchMarche() {
  const token = getToken();
  try {
    const res = await fetch("/api/marche", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (e) {
    console.warn("[marche] fetch error:", e.message);
    return null;
  }
}

/* ── TICKER ──────────────────────────────────────────────── */
function renderTicker(data) {
  const track = document.getElementById("tickerTrack");
  if (!track || !data) return;
  const items = [];

  (data.villes || []).forEach((v) => {
    const dir =
      (v.variation || 0) > 0 ? "up" : (v.variation || 0) < 0 ? "down" : "";
    const sign =
      (v.variation || 0) > 0 ? "▲" : (v.variation || 0) < 0 ? "▼" : "—";
    items.push(`
      <span class="t-item">
        <span class="t-name">${v.ville.toUpperCase()}</span>
        <span class="t-val ${dir}">${fmt(v.prixM2)} €/m²</span>
        <span class="t-chg">${sign} ${Math.abs(v.variation || 0).toFixed(1)}%</span>
      </span>
      <span class="t-dot">·</span>
    `);
  });

  items.push(`
    <span class="t-item"><span class="t-name">MATCHS</span><span class="t-val">${fmt(data.kpi?.totalMatchs)}</span></span>
    <span class="t-dot">·</span>
    <span class="t-item"><span class="t-name">COMPAT</span><span class="t-val">${fmt(data.kpi?.compatMoy, 1)} %</span></span>
    <span class="t-dot">·</span>
    <span class="t-item"><span class="t-name">SURFACE</span><span class="t-val">${fmt(data.kpi?.surfaceMediane)} m²</span></span>
    <span class="t-dot">·</span>
  `);

  const html = items.join("");
  track.innerHTML = html + html;
}

/* ── KPI CARDS ───────────────────────────────────────────── */
function renderKPI(data) {
  if (!data?.kpi) return;
  const k = data.kpi;
  setKPI(
    "matches",
    fmt(k.totalMatchs),
    k.matchsMois,
    "ce mois",
    "spark-matches",
    k.sparkMatchs,
  );
  setKPI(
    "prix",
    fmt(k.prixMedianM2) + " €",
    k.variationPrix,
    "% var.",
    "spark-prix",
    k.sparkPrix,
  );
  setKPI(
    "compat",
    fmt(k.compatMoy, 1) + " %",
    k.variationCompat,
    "pts",
    "spark-compat",
    k.sparkCompat,
  );
  setKPI(
    "users",
    fmt(k.usersActifs),
    k.nouveauxUsers,
    "nouveaux",
    "spark-users",
    k.sparkUsers,
  );
  setKPI(
    "surface",
    fmt(k.surfaceMediane) + " m²",
    k.variationSurface,
    "m²",
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
    dltEl.textContent = (isUp ? "+" : "") + fmt(delta, 1) + " " + suffix;
    dltEl.className =
      "kpi-delta " + (isUp ? "up" : delta < 0 ? "down" : "flat");
  }
  if (card) {
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
  }
  if (sparkId && sparkData?.length > 1) renderSparkline(sparkId, sparkData);
}

function renderSparkline(id, values) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const max = Math.max(...values),
    min = Math.min(...values),
    range = max - min || 1;
  const W = 80,
    H = 24,
    pad = 2;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (W - pad * 2);
      const y = H - pad - ((v - min) / range) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  svg.innerHTML = `
    <defs>
      <linearGradient id="sg-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${pts} ${W - pad},${H} ${pad},${H}" fill="url(#sg-${id})"/>
    <polyline points="${pts}" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

/* ── MAIN CHART ──────────────────────────────────────────── */
const METRIC_META = {
  prix: { label: "Prix médian / m²", color: "#6366f1", unit: " €/m²" },
  matchs: { label: "Matchs", color: "#38bdf8", unit: "" },
  compat: { label: "Compatibilité", color: "#22c55e", unit: " %" },
  surface: { label: "Surface", color: "#f59e0b", unit: " m²" },
};

function initMainChart() {
  const canvas = document.getElementById("mainChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, "rgba(99,102,241,0.18)");
  grad.addColorStop(1, "rgba(99,102,241,0)");

  mainChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Valeur",
          data: [],
          borderColor: "#6366f1",
          backgroundColor: grad,
          borderWidth: 1.5,
          fill: true,
          tension: 0.42,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: "#6366f1",
        },
        {
          label: "Zone haute",
          data: [],
          borderColor: "transparent",
          backgroundColor: "rgba(99,102,241,0.06)",
          fill: "+1",
          tension: 0.42,
          pointRadius: 0,
          borderWidth: 0,
        },
        {
          label: "Zone basse",
          data: [],
          borderColor: "transparent",
          backgroundColor: "transparent",
          fill: false,
          tension: 0.42,
          pointRadius: 0,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: { duration: 500, easing: "easeInOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f0f18",
          borderColor: "rgba(99,102,241,0.25)",
          borderWidth: 1,
          titleColor: "#8884a0",
          bodyColor: "#e8e6f0",
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const meta = METRIC_META[currentMetric] || METRIC_META.prix;
              return ` ${ctx.parsed.y.toFixed(1)}${meta.unit}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.04)", drawBorder: false },
          ticks: {
            color: "#4a4760",
            font: { family: "'IBM Plex Mono', monospace", size: 9 },
            maxTicksLimit: 7,
            maxRotation: 0,
          },
        },
        y: {
          position: "right",
          grid: { color: "rgba(255,255,255,0.04)", drawBorder: false },
          ticks: {
            color: "#4a4760",
            font: { family: "'IBM Plex Mono', monospace", size: 9 },
            callback: (v) =>
              v.toFixed(0) + (METRIC_META[currentMetric]?.unit || ""),
          },
        },
      },
    },
  });
}

function updateMainChart() {
  if (!mainChart || !marketHistory.length) return;

  const cityKey = currentCity === "all" ? "all" : currentCity;
  const filtered = marketHistory.filter((p) => p.city === cityKey);
  const src = filtered.length
    ? filtered
    : marketHistory.filter((p) => p.city === "all");

  const total = src.length;
  const end = Math.max(0, total - historyOffset);
  const start = Math.max(0, end - VIEW_WINDOW);
  const slice = src.slice(start, end);

  const meta = METRIC_META[currentMetric] || METRIC_META.prix;
  const labels = slice.map((p) => p.time);
  const values = slice.map(
    (p) =>
      p[
        currentMetric === "prix"
          ? "prixM2"
          : currentMetric === "matchs"
            ? "matchs"
            : currentMetric === "compat"
              ? "compat"
              : "surface"
      ],
  );

  const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const std = Math.sqrt(
    values.reduce((a, b) => a + (b - avg) ** 2, 0) / (values.length || 1),
  );

  // Update gradient
  const canvas = document.getElementById("mainChart");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, meta.color + "30");
    grad.addColorStop(1, meta.color + "00");
    mainChart.data.datasets[0].backgroundColor = grad;
    mainChart.data.datasets[0].borderColor = meta.color;
    mainChart.data.datasets[0].pointHoverBackgroundColor = meta.color;
  }

  mainChart.data.labels = labels;
  mainChart.data.datasets[0].data = values;
  mainChart.data.datasets[0].label = meta.label;
  mainChart.data.datasets[1].data = values.map((v) => v + std * 0.4);
  mainChart.data.datasets[2].data = values.map((v) => v - std * 0.4);
  mainChart.update("active");

  // Hero overlay
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : last;
  const chg = prev ? ((last - prev) / prev) * 100 : 0;

  const covLabel = document.getElementById("cov-label");
  const covValue = document.getElementById("cov-value");
  const covChg = document.getElementById("cov-chg");
  const legendLbl = document.getElementById("legend-label");
  const lastUpd = document.getElementById("last-update");

  if (covLabel) covLabel.textContent = meta.label.toUpperCase();
  if (covValue)
    covValue.textContent = (last?.toFixed(1) ?? "—") + (meta.unit || "");
  if (covChg) {
    const sign = chg >= 0 ? "▲" : "▼";
    covChg.textContent = `${sign} ${Math.abs(chg).toFixed(2)} %`;
    covChg.className = `hero-change ${chg > 0 ? "up" : chg < 0 ? "down" : "flat"}`;
  }
  if (legendLbl) legendLbl.textContent = meta.label;
  if (lastUpd) lastUpd.textContent = "Màj " + nowTime();

  // Nav buttons
  const btnBack = document.getElementById("btn-nav-back");
  const btnFwd = document.getElementById("btn-nav-fwd");
  const navLbl = document.getElementById("chart-nav-label");
  if (btnBack) btnBack.disabled = end <= VIEW_WINDOW;
  if (btnFwd) btnFwd.disabled = historyOffset === 0;
  if (navLbl)
    navLbl.textContent =
      historyOffset === 0 ? "Direct" : `-${historyOffset} pts`;
}

/* ── DONUT ───────────────────────────────────────────────── */
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
          backgroundColor: ["#22c55e", "#6366f1", "#f59e0b", "#ef4444"],
          borderColor: "#13131f",
          borderWidth: 3,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      cutout: "74%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f0f18",
          borderColor: "rgba(99,102,241,0.25)",
          borderWidth: 1,
          titleColor: "#8884a0",
          bodyColor: "#e8e6f0",
          padding: 8,
        },
      },
      animation: { animateRotate: true, duration: 800 },
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

  const avgEl = document.getElementById("donut-avg");
  if (avgEl)
    avgEl.textContent = data.kpi?.compatMoy ? fmt(data.kpi.compatMoy, 1) : "—";

  const badge = document.getElementById("badge-total-dist");
  if (badge) badge.textContent = fmt(total);

  const legend = document.getElementById("donut-legend");
  if (!legend) return;
  const colors = ["#22c55e", "#6366f1", "#f59e0b", "#ef4444"];
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

/* ── VILLES ──────────────────────────────────────────────── */
function renderVilles(data) {
  const list = document.getElementById("ville-list");
  const badge = document.getElementById("badge-villes");
  if (!list || !data?.villes?.length) return;
  const villes = data.villes.slice(0, 8);
  const max = Math.max(...villes.map((v) => v.matchs || 0));
  if (badge) badge.textContent = `${villes.length} marchés`;
  list.innerHTML = villes
    .map(
      (v, i) => `
    <div class="ville-row">
      <span class="ville-rank">${i + 1}</span>
      <span class="ville-name">${v.ville}</span>
      <div class="ville-bar-track"><div class="ville-bar-fill" data-w="${max ? Math.round((v.matchs / max) * 100) : 0}"></div></div>
      <span class="ville-count">${v.matchs}</span>
    </div>
  `,
    )
    .join("");

  // City select options
  const sel = document.getElementById("chartCitySelect");
  if (sel) {
    const existing = new Set([...sel.options].map((o) => o.value));
    villes.forEach((v) => {
      if (!existing.has(v.ville)) {
        const opt = document.createElement("option");
        opt.value = v.ville;
        opt.textContent = v.ville;
        sel.appendChild(opt);
      }
    });
  }

  requestAnimationFrame(() =>
    setTimeout(() => {
      list.querySelectorAll(".ville-bar-fill").forEach((el) => {
        el.style.width = el.dataset.w + "%";
      });
    }, 80),
  );
}

/* ── FLUX LIVE ───────────────────────────────────────────── */
function pushFluxEvent(evt) {
  const list = document.getElementById("flux-list");
  if (!list) return;
  const item = document.createElement("div");
  item.className = "flux-item";
  item.innerHTML = `
    <div class="flux-dot ${evt.dot}"></div>
    <div class="flux-text">${evt.text}</div>
    <div class="flux-time">${nowTime().slice(0, 5)}</div>
  `;
  list.prepend(item);
  while (list.children.length > FLUX_MAX) list.removeChild(list.lastChild);
}

function renderFlux(data) {
  if (!data?.fluxLive?.length) return;
  data.fluxLive.forEach((evt) => pushFluxEvent(evt));
}

/* ── TYPES ───────────────────────────────────────────────── */
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
const TYPE_COLORS = [
  "#6366f1",
  "#38bdf8",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
];

function renderTypes(data) {
  const list = document.getElementById("type-list");
  if (!list || !data?.types?.length) return;
  const total = data.types.reduce((s, t) => s + t.count, 0);
  list.innerHTML = data.types
    .slice(0, 6)
    .map((t, i) => {
      const pct = total ? Math.round((t.count / total) * 100) : 0;
      const col = TYPE_COLORS[i] || "#6366f1";
      return `
      <div class="type-row">
        <div class="type-icon" style="background:${col}18">${TYPE_ICONS[t.type] || "🏠"}</div>
        <div class="type-info">
          <div class="type-name">${t.type.charAt(0).toUpperCase() + t.type.slice(1)}</div>
          <div class="type-bar-track"><div class="type-bar-fill" data-w="${pct}" style="background:${col}"></div></div>
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
    }, 120),
  );
}

/* ── PRIX TABLE ──────────────────────────────────────────── */
function renderPrixTable(data) {
  const tbody = document.getElementById("prix-table-body");
  if (!tbody || !data?.villes?.length) return;
  tbody.innerHTML = data.villes
    .slice(0, 8)
    .map((v) => {
      const up = (v.variation || 0) >= 0;
      const sign = up ? "▲" : "▼";
      return `
      <tr>
        <td>${v.ville}</td>
        <td>${fmt(v.prixM2)} €</td>
        <td>${v.matchs}</td>
        <td class="${up ? "td-up" : "td-down"}">${sign} ${Math.abs(v.variation || 0).toFixed(1)}%</td>
      </tr>
    `;
    })
    .join("");
}

/* ── HEATMAP ─────────────────────────────────────────────── */
const DAY_LABELS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

function renderHeatmap(data) {
  const grid = document.getElementById("heatmap-grid");
  const days = document.getElementById("hmap-days");
  if (!grid) return;
  if (days)
    days.innerHTML = DAY_LABELS.map(
      (d) => `<div class="hmap-day">${d}</div>`,
    ).join("");

  const heatData =
    data?.heatmap ||
    Array.from({ length: 28 }, (_, i) => {
      const total = data?.kpi?.totalMatchs || 80;
      return Math.round(
        ((i % 7 < 5 ? 0.6 : 0.25) + Math.random() * 0.4) * (total / 28),
      );
    });
  const maxVal = Math.max(...heatData, 1);

  grid.innerHTML = heatData
    .map((v, i) => {
      const ratio = v / maxVal;
      let bg = "";
      if (ratio > 0.8) bg = "background:var(--accent)";
      else if (ratio > 0.6) bg = "background:rgba(99,102,241,0.7)";
      else if (ratio > 0.4) bg = "background:rgba(99,102,241,0.45)";
      else if (ratio > 0.1) bg = "background:rgba(99,102,241,0.2)";
      const dayName = DAY_LABELS[i % 7];
      const weekNum = Math.floor(i / 7) + 1;
      return `<div class="hmap-cell" style="${bg}" title="${v} matchs · S${weekNum} ${dayName}"></div>`;
    })
    .join("");
}

/* ── HISTORY ─────────────────────────────────────────────── */
function updateHistory(data) {
  if (!data?.kpi) return;
  const k = data.kpi;
  const t = nowTime();

  marketHistory.push({
    time: t,
    city: "all",
    prixM2: k.prixMedianM2 || 0,
    matchs: k.totalMatchs || 0,
    compat: k.compatMoy || 0,
    surface: k.surfaceMediane || 0,
  });

  (data.villes || []).forEach((v) => {
    marketHistory.push({
      time: t,
      city: v.ville,
      prixM2: v.prixM2 || 0,
      matchs: v.matchs || 0,
      compat: k.compatMoy || 0,
      surface: k.surfaceMediane || 0,
    });
  });

  const maxPts = 2000;
  if (marketHistory.length > maxPts)
    marketHistory = marketHistory.slice(-maxPts);
}

/* ── SIMULATION ──────────────────────────────────────────── */
function simulateTick() {
  if (!lastData?.kpi || !marketHistory.length) return;
  const t = nowTime();
  const noise = (base, p = 0.0015) =>
    Math.round(base * (1 + (Math.random() - 0.5) * p) * 100) / 100;
  const rb = {
    prixM2: lastData.kpi.prixMedianM2 || 0,
    matchs: lastData.kpi.totalMatchs || 0,
    compat: lastData.kpi.compatMoy || 0,
    surface: lastData.kpi.surfaceMediane || 0,
  };

  marketHistory.push({
    time: t,
    city: "all",
    prixM2: noise(rb.prixM2),
    matchs: rb.matchs + (Math.random() > 0.85 ? 1 : 0),
    compat: Math.max(0, Math.min(100, noise(rb.compat, 0.002))),
    surface: noise(rb.surface, 0.001),
  });

  if (currentCity !== "all") {
    const vd = lastData.villes?.find((v) => v.ville === currentCity);
    if (vd) {
      marketHistory.push({
        time: t,
        city: currentCity,
        prixM2: noise(vd.prixM2 || rb.prixM2),
        matchs: vd.matchs || 0,
        compat: noise(rb.compat, 0.002),
        surface: noise(rb.surface, 0.001),
      });
    }
  }

  if (marketHistory.length > 2000) marketHistory = marketHistory.slice(-2000);
  if (historyOffset === 0) updateMainChart();

  // Occasional live flux event
  if (Math.random() > 0.65) {
    const villes = lastData.villes?.map((v) => v.ville) || ["Paris", "Lyon"];
    const ville = villes[Math.floor(Math.random() * villes.length)];
    const evts = [
      { dot: "match", text: `<strong>Matching</strong> en cours · ${ville}` },
      {
        dot: "view",
        text: `Consultation de profil · <strong>${ville}</strong>`,
      },
      { dot: "fav", text: `Nouveau favori ajouté · <strong>${ville}</strong>` },
    ];
    pushFluxEvent(evts[Math.floor(Math.random() * evts.length)]);
  }
}

/* ── REFRESH ─────────────────────────────────────────────── */
async function refresh() {
  const icon = document.getElementById("refresh-icon");
  if (icon) icon.style.animation = "spin 0.9s linear";

  const data = await fetchMarche();
  if (icon) setTimeout(() => (icon.style.animation = ""), 900);
  if (!data) return;

  lastData = data;
  window.__marcheData = data;

  renderTicker(data);
  renderKPI(data);
  renderVilles(data);
  renderTypes(data);
  renderPrixTable(data);
  renderFlux(data);
  updateDonut(data);
  renderHeatmap(data);
  updateHistory(data);
  updateMainChart();

  const sub = document.getElementById("page-sub");
  if (sub)
    sub.textContent = `Dernière mise à jour · ${nowTime()} · AiGENT matching engine`;
}

/* ── LIVE TIMER ──────────────────────────────────────────── */
function startLive() {
  if (liveTimer) clearInterval(liveTimer);
  let ticks = 0;
  liveTimer = setInterval(async () => {
    if (!liveEnabled) return;
    ticks++;
    if (ticks % 4 === 0) await refresh();
    else simulateTick();
  }, TICK_MS);
}

/* ── FILTERS ─────────────────────────────────────────────── */
function initFilters() {
  document.querySelectorAll("#metricPills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("#metricPills .pill")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentMetric = btn.dataset.metric;
      updateMainChart();
    });
  });

  document.querySelectorAll("#rangePills .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("#rangePills .pill")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      marketHistory = [];
      refresh();
    });
  });

  document
    .getElementById("chartCitySelect")
    ?.addEventListener("change", (e) => {
      currentCity = e.target.value;
      historyOffset = 0;
      updateMainChart();
    });
}

/* ── ACTIONS ─────────────────────────────────────────────── */
function initActions() {
  const liveBtn = document.getElementById("btn-live-toggle");
  const liveLabel = document.getElementById("live-label");

  liveBtn?.addEventListener("click", () => {
    liveEnabled = !liveEnabled;
    if (liveEnabled) {
      liveBtn.classList.remove("paused");
      if (liveLabel) liveLabel.textContent = "Live actif";
      showToast("Live activé");
    } else {
      liveBtn.classList.add("paused");
      if (liveLabel) liveLabel.textContent = "Live pausé";
      showToast("Live pausé");
    }
  });

  document.getElementById("btn-refresh")?.addEventListener("click", () => {
    marketHistory = [];
    refresh();
    showToast("Actualisation en cours…");
  });

  document.getElementById("btn-export")?.addEventListener("click", exportCSV);

  document.getElementById("btn-nav-back")?.addEventListener("click", () => {
    const max = Math.max(0, marketHistory.length - VIEW_WINDOW);
    historyOffset = Math.min(historyOffset + Math.floor(VIEW_WINDOW / 2), max);
    updateMainChart();
  });

  document.getElementById("btn-nav-fwd")?.addEventListener("click", () => {
    historyOffset = Math.max(0, historyOffset - Math.floor(VIEW_WINDOW / 2));
    updateMainChart();
  });
}

/* ── EXPORT ──────────────────────────────────────────────── */
function exportCSV() {
  if (!lastData) {
    showToast("Aucune donnée à exporter");
    return;
  }
  const lines = ["Ville,Prix m²,Matchs,Variation %"];
  (lastData.villes || []).forEach((v) =>
    lines.push(
      `${v.ville},${v.prixM2 || 0},${v.matchs || 0},${v.variation || 0}`,
    ),
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aigent-marche-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Export CSV téléchargé");
}

/* ── THEME ───────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);

  document.getElementById("btn-theme")?.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateThemeIcon(next);
  });
}
function updateThemeIcon(theme) {
  const moon = document.getElementById("icon-moon");
  const sun = document.getElementById("icon-sun");
  if (moon) moon.style.display = theme === "dark" ? "block" : "none";
  if (sun) sun.style.display = theme === "light" ? "block" : "none";
}

/* ── SIDEBAR MOBILE ──────────────────────────────────────── */
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const openBtn = document.getElementById("openSidebar");
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
  overlay?.addEventListener("click", close);
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    localStorage.removeItem("agent_user");
    window.location.href = "/login.html";
  });
}

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initSidebar();
  initFilters();
  initActions();
  initMainChart();
  initDonutChart();
  await refresh();
  startLive();
});
