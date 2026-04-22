let currentChartInstance = null;
let globalStatsCache = null;
let currentView = "repartition";

/* =======================================================
   BLOC 1 — DÉFINITION DES TABS (icône + label + sous-titre)
   Remplace les div statiques en HTML
======================================================= */
const TABS_CONFIG = [
  {
    view: "repartition",
    icon: "◎",
    label: "Aperçu Global",
    subFn: (cache) => `${cache.top30.length} profils analysés`,
  },
  {
    view: "profil",
    icon: "▲",
    label: "Top Profils",
    subFn: (cache) => `Top ${cache.top30.length} par score`,
  },
  {
    view: "criteres",
    icon: "◈",
    label: "Détail Critères",
    subFn: () => "Score moyen par critère",
  },
];

/* =======================================================
   BLOC 1 — GÉNÉRATION DYNAMIQUE DES TABS
   Injecte dans #tabsContainer avec icône, nom, sous-titre
======================================================= */
function buildTabs(cache) {
  const container = document.getElementById("tabsContainer");
  if (!container) return;
  container.innerHTML = "";

  TABS_CONFIG.forEach(({ view, icon, label, subFn }) => {
    const tab = document.createElement("div");
    tab.className = "tab" + (view === currentView ? " active" : "");
    tab.dataset.view = view;

    tab.innerHTML = `
      <div class="tab-icon">${icon}</div>
      <div class="tab-body">
        <div class="tab-name">${label}</div>
        <div class="tab-sub">${subFn(cache)}</div>
      </div>
      <div class="tab-arrow">›</div>
    `;

    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      switchView(view);
    });

    container.appendChild(tab);
  });
}

/* =======================================================
   MENU LATÉRAL
======================================================= */
const sidebar = document.getElementById("sidebar");
const openBtn = document.getElementById("openSidebar");
const closeBtn = document.getElementById("closeSidebar");
const overlay = document.getElementById("sidebarOverlay");

if (openBtn && sidebar && overlay) {
  openBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
    overlay.classList.add("active");
    openBtn.style.display = "none";
  });
}
if (closeBtn && sidebar && overlay) {
  closeBtn.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    openBtn.style.display = "flex";
  });
}
if (overlay && sidebar) {
  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    openBtn.style.display = "flex";
  });
}

/* =======================================================
   FETCH STATS
======================================================= */
async function fetchStats() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) throw new Error("Token manquant dans le localStorage");

    let token;
    try {
      const user = JSON.parse(raw);
      token = user.token;
      if (!token) throw new Error("Token JWT manquant");
    } catch (parseErr) {
      console.error("[fetchStats] Erreur parsing JSON:", parseErr);
      throw new Error("Erreur parsing token localStorage");
    }

    const res = await fetch("/api/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Erreur API: ${res.status}`);

    const data = await res.json();
    console.log("[fetchStats] Données reçues:", data);
    return data;
  } catch (err) {
    console.error("[fetchStats] Error:", err);
    return null;
  }
}

/* =======================================================
   GESTION CANVAS
======================================================= */
function destroyCurrentChart() {
  if (currentChartInstance) {
    currentChartInstance.destroy();
    currentChartInstance = null;
  }
}
function getCanvasContext() {
  return document.getElementById("dynamicChart").getContext("2d");
}

/* =======================================================
   DONUT - Répartition compatibilité
======================================================= */
function generateDonut(distribution) {
  destroyCurrentChart();
  const ctx = getCanvasContext();

  currentChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: [
        "Forte (≥80%)",
        "Bonne (60-79%)",
        "Moyenne (40-59%)",
        "Faible (<40%)",
      ],
      datasets: [
        {
          data: [
            distribution.forte,
            distribution.bonne,
            distribution.moyenne,
            distribution.faible,
          ],
          backgroundColor: ["#9b59ff", "#ff71cd", "#d194ed", "#f1f5f9"],
          borderColor: "#ffffff",
          borderWidth: 3,
          hoverOffset: 15,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.6,
      plugins: {
        legend: {
          position: "bottom",
          labels: { padding: 20, font: { size: 12, weight: "600" } },
        },
        tooltip: {
          backgroundColor: "#1e293b",
          padding: 12,
          callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} Matchs` },
        },
      },
      cutout: "70%",
      animation: { animateRotate: true, animateScale: true },
    },
  });
}

/* =======================================================
   BAR CHART VERTICAL - Top Profils
======================================================= */
function generateBarChart(matches) {
  destroyCurrentChart();
  const ctx = getCanvasContext();

  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, "#ff71cd");
  gradient.addColorStop(1, "#9b59ff");

  currentChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: matches.map((m) => m.username),
      datasets: [
        {
          label: "Score de Compatibilité",
          data: matches.map((m) => m.compatibility),
          backgroundColor: gradient,
          borderRadius: 10,
          borderSkipped: false,
          hoverBackgroundColor: "#9b59ff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            padding: 16,
            color: "#94a3b8",
            boxWidth: 12,
            usePointStyle: true,
            pointStyle: "rectRounded",
          },
        },
        tooltip: {
          backgroundColor: "#1e293b",
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const m = matches[ctx.dataIndex];
              return ` ${m.username} : ${m.compatibility}%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#94a3b8",
            font: { size: 10 },
            autoSkip: true,
            maxRotation: 0,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: "rgba(0,0,0,0.04)" },
          ticks: {
            callback: (v) => v + "%",
            color: "#94a3b8",
          },
        },
      },
      animation: { duration: 1500, easing: "easeOutQuart" },
    },
  });
}

/* =======================================================
   PALETTE NIVEAUX
======================================================= */
const LEVEL_COLOR = {
  perfect: "#9b59ff", // violet signature
  close: "#7c8cff", // bleu lavande
  tolerated: "#f6a8d7", // rose doux
  weak: "#f7b977", // pêche premium
  out: "#ff8f9f", // rouge soft luxe
  none: "#e8ecf5",
};

// Couleur de barre de progression selon score
function barColorFromScore(score) {
  if (score == null) return "#e2e8f0";
  if (score >= 80) return "linear-gradient(90deg, #9b59ff, #ff71cd)";
  if (score >= 60) return "linear-gradient(90deg, #3b82f6, #60a5fa)";
  if (score >= 40) return "linear-gradient(90deg, #f59e0b, #fcd34d)";
  return "linear-gradient(90deg, #ef4444, #f87171)";
}

const LEVEL_LABEL = {
  perfect: "Parfait",
  close: "Proche",
  tolerated: "Toléré",
  weak: "Faible",
  out: "Hors critère",
  none: "Non défini",
};

/* =======================================================
   HELPERS
======================================================= */
function avgCriteriaScore(matches, key) {
  const values = matches
    .map((m) => m.criteriaMatch?.detail?.[key]?.score)
    .filter((v) => v != null);
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function levelDistribution(matches, key) {
  const dist = { perfect: 0, close: 0, tolerated: 0, weak: 0, out: 0, none: 0 };
  matches.forEach((m) => {
    const level = m.criteriaMatch?.detail?.[key]?.level ?? "none";
    dist[level] = (dist[level] || 0) + 1;
  });
  return dist;
}

function topLevelOf(dist) {
  return (
    ["perfect", "close", "tolerated", "weak", "out"].find((l) => dist[l] > 0) ??
    "none"
  );
}

/* =======================================================
   GRAPHIQUE CRITÈRES — barres empilées
======================================================= */
function generateHorizontalBarChart(matches) {
  destroyCurrentChart();
  const ctx = getCanvasContext();
  const total = matches.length;
  if (!total) return;

  const criteria = [
    { key: "budget", label: "Budget" },
    { key: "ville", label: "Localisation" },
    { key: "pieces", label: "Pièces" },
    { key: "surface", label: "Surface" },
    { key: "type", label: "Type de bien" },
    { key: "dpe", label: "DPE" },
    { key: "etat", label: "État du bien" },
    { key: "photos", label: "Photos" },
  ];

  const levels = ["perfect", "close", "tolerated", "weak", "out"];

  const datasets = levels.map((level) => ({
    label: LEVEL_LABEL[level],
    data: criteria.map(({ key }) => {
      const dist = levelDistribution(matches, key);
      return Math.round((dist[level] / total) * 100);
    }),
    backgroundColor: LEVEL_COLOR[level],
    borderRadius: 4,
    borderSkipped: false,
  }));

  currentChartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels: criteria.map((c) => c.label), datasets },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          beginAtZero: true,
          max: 100,
          title: { display: true, text: "Répartition des profils (%)" },
          ticks: { callback: (v) => `${v}%` },
        },
        y: { stacked: true },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { usePointStyle: true, pointStyle: "rectRounded" },
        },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => {
              const levelKey = levels[ctx.datasetIndex];
              const criteriaKey = criteria[ctx.dataIndex].key;
              const dist = levelDistribution(matches, criteriaKey);
              const count = dist[levelKey] ?? 0;
              return ` ${LEVEL_LABEL[levelKey]} : ${ctx.raw}% (${count} profil${count > 1 ? "s" : ""})`;
            },
            afterBody: (items) => {
              const criteriaKey = criteria[items[0].dataIndex].key;
              const avg = avgCriteriaScore(matches, criteriaKey);
              return avg != null ? [`Score moyen : ${avg}/100`] : [];
            },
          },
        },
      },
      animation: { duration: 1000, easing: "easeOutQuart" },
    },
  });

  renderCriteriaScoreCards(matches, criteria);
}

/* =======================================================
   BLOC 2 — SCORECARDS redesignées
   Liseré top gradient, barre de progression dynamique
======================================================= */
function renderCriteriaScoreCards(matches, criteria) {
  const existing = document.getElementById("criteriaScoreCards");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.id = "criteriaScoreCards";

  criteria.forEach(({ key, label }, i) => {
    const avg = avgCriteriaScore(matches, key);
    const dist = levelDistribution(matches, key);
    const topLevel = topLevelOf(dist);
    const barColor = barColorFromScore(avg);
    const barWidth = avg != null ? avg : 0;

    const card = document.createElement("div");
    card.className = "pro-card-tile";
    // Délai d'animation décalé
    card.style.animation = `fadeInCard 0.4s ease-out ${i * 0.05}s both`;

    card.innerHTML = `
      <style>
        @keyframes fadeInCard {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      </style>
      <div class="card-label">${label}</div>
      <div class="card-score">${avg != null ? avg : "—"}<span class="card-score-sub">/100</span></div>
      <div class="card-bar">
        <div class="card-bar-fill" style="width:${barWidth}%; background:${barColor};"></div>
      </div>
      <div class="card-level" style="color:${LEVEL_COLOR[topLevel]};">${LEVEL_LABEL[topLevel]}</div>
    `;

    container.appendChild(card);
  });

  document.getElementById("mainGraphContainer").appendChild(container);
}
function animateChartSwap(callback) {
  const stage = document.getElementById("chartStage");

  stage.style.opacity = "0";
  stage.style.transform = "translateY(8px)";

  setTimeout(() => {
    callback();

    setTimeout(() => {
      currentChartInstance?.resize();

      stage.style.opacity = "1";
      stage.style.transform = "translateY(0)";
    }, 60);
  }, 180);
}
/* =======================================================
   SWITCH VIEW
======================================================= */
function switchView(view, force = false) {
  if (view === currentView && !force) return;

  const oldView = currentView;
  currentView = view;

  const existing = document.getElementById("criteriaScoreCards");
  if (existing) existing.remove();

  const actions = document.getElementById("chartActions");
  actions.style.display = view === "profil" ? "flex" : "none";

  animateChartSwap(() => {
    if (view === "repartition") {
      graphTitle.innerText = "Répartition Stratégique";
      generateDonut(globalStatsCache.distribution);
    }

    if (view === "profil") {
      graphTitle.innerText = "Performance du Top 30";
      generateBarChart(globalStatsCache.top30);
    }

    if (view === "criteres") {
      graphTitle.innerText = "Analyse par Critères";
      generateHorizontalBarChart(globalStatsCache.top30);
    }
  });
}
/* =======================================================
   BLOC 3 — ANIMATE VALUES (KPI chips)
======================================================= */
function animateValue(id, start, end, duration) {
  const obj = document.getElementById(id);
  if (!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start);
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

// ACTIONS //
document.getElementById("exportPNG")?.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "dashboard-aigent.png";
  link.href = document.getElementById("dynamicChart").toDataURL("image/png");
  link.click();
});
document.getElementById("exportCSV")?.addEventListener("click", () => {
  const rows = globalStatsCache.top30.map((m) => [
    m.username,
    m.compatibility,
    m.score,
    m.ville || "",
  ]);

  let csv = "Nom,Compatibilite,Score,Ville\n";

  rows.forEach((r) => (csv += r.join(",") + "\n"));

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "matchs-aigent.csv";
  a.click();
});
document
  .getElementById("scoreFilter")
  ?.addEventListener("change", applyFilters);
document.getElementById("cityFilter")?.addEventListener("change", applyFilters);
document.getElementById("typeFilter")?.addEventListener("change", applyFilters);

function applyFilters() {
  const minScore = Number(document.getElementById("scoreFilter").value);

  const city = document.getElementById("cityFilter").value;
  const type = document.getElementById("typeFilter").value;

  const filtered = globalStatsCache.matches.filter((m) => {
    const scoreOk = (m.compatibility || 0) >= minScore;
    const cityOk = city === "all" || m.ville === city;
    const typeOk = type === "all" || m.type === type;

    return scoreOk && cityOk && typeOk;
  });

  globalStatsCache.top30 = filtered.slice(0, 30);
  switchView(currentView, true);
  generateInsights(filtered);
}
function generateInsights(matches) {
  const box = document.getElementById("insightsBox");
  if (!box) return;

  if (!matches.length) {
    box.innerHTML = "";
    return;
  }

  const avg = Math.round(
    matches.reduce((a, b) => a + (b.compatibility || 0), 0) / matches.length,
  );

  const best = matches[0]?.username || "N/A";

  const strong = matches.filter((m) => m.compatibility >= 80).length;

  box.innerHTML = `
      <div class="insight">
         <div class="insight-label">Top opportunité</div>
         <div class="insight-value">${best} affiche actuellement le meilleur potentiel.</div>
      </div>

      <div class="insight">
         <div class="insight-label">Performance moyenne</div>
         <div class="insight-value">${avg}% de compatibilité moyenne sur les profils filtrés.</div>
      </div>

      <div class="insight">
         <div class="insight-label">Segment premium</div>
         <div class="insight-value">${strong} profils dépassent le seuil stratégique des 80%.</div>
      </div>
   `;
}
function buildSmartFilters(matches) {
  const citySelect = document.getElementById("cityFilter");
  const typeSelect = document.getElementById("typeFilter");

  if (!citySelect || !typeSelect) return;

  const cities = [
    ...new Set(matches.map((m) => m.ville).filter(Boolean)),
  ].sort();

  const types = [...new Set(matches.map((m) => m.type).filter(Boolean))].sort();

  cities.forEach((city) => {
    citySelect.innerHTML += `<option value="${city}">${city}</option>`;
  });

  types.forEach((type) => {
    typeSelect.innerHTML += `<option value="${type}">${type}</option>`;
  });
}
const focusBtn = document.getElementById("focusMode");
const menuBtn = document.getElementById("detailsMenuBtn");
const menu = document.getElementById("detailsMenu");
const shell = document.getElementById("mainGraphContainer");

focusBtn?.addEventListener("click", () => {
  shell.classList.toggle("fullscreen");

  setTimeout(() => {
    currentChartInstance?.resize();
    currentChartInstance?.update("none");
  }, 350);
});

menuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  menu.classList.toggle("open");
});

document.addEventListener("click", () => {
  menu?.classList.remove("open");
});

menu?.addEventListener("click", (e) => {
  e.stopPropagation();

  const action = e.target.dataset.action;
  if (!action) return;

  if (action === "png") {
    document.getElementById("exportPNG")?.click();
  }

  if (action === "csv") {
    document.getElementById("exportCSV")?.click();
  }

  if (action === "refresh") {
    init();
  }

  if (action === "pro") {
    alert("Vue avancée Pro bientôt disponible");
  }

  menu.classList.remove("open");
});
/* =======================================================
   INIT
======================================================= */
async function init() {
  const stats = await fetchStats();
  if (!stats) return;

  globalStatsCache = {
    ...stats,
    top30: stats.matches.slice(0, 30),
  };

  // BLOC 3 — Calcul des KPIs pour les chips
  const compatValues = stats.matches
    .map((m) => m.compatibility)
    .filter((v) => v != null);
  const avgCompat = compatValues.length
    ? Math.round(compatValues.reduce((a, b) => a + b, 0) / compatValues.length)
    : 0;
  const topCompat = compatValues.length ? Math.max(...compatValues) : 0;

  // Animer les 3 KPI chips
  animateValue("matchCounter", 0, stats.totalMatches, 1800);
  animateValue("avgCompat", 0, avgCompat, 1800);
  animateValue("topCompat", 0, topCompat, 1800);

  // BLOC 1 — Génération dynamique des tabs
  buildTabs(globalStatsCache);
  buildSmartFilters(globalStatsCache.matches);

  // Vue initiale
  document.getElementById("graphTitle").innerText = "Répartition Stratégique";
  generateDonut(stats.distribution);
  generateInsights(globalStatsCache.top30);
}

document.addEventListener("DOMContentLoaded", init);
