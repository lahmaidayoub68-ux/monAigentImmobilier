// ================== LOGIQUE UI & THÈME ==================
const html = document.documentElement;
const btnTheme = document.getElementById("btn-theme");
const sidebar = document.getElementById("sidebar");

// Charger et appliquer le thème sauvegardé immédiatement
const savedTheme = localStorage.getItem("aigent_theme") || "dark";
html.setAttribute("data-theme", savedTheme);

if (btnTheme) {
  btnTheme.addEventListener("click", () => {
    const current = html.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("aigent_theme", next);
  });
}

// Sidebar logic
document.getElementById("openSidebar").onclick = () =>
  sidebar.classList.add("open");
document.getElementById("closeSidebar").onclick = () =>
  sidebar.classList.remove("open");
// ================== MODE FOCUS (PLEIN ÉCRAN) ==================
const graphShell = document.getElementById("mainGraphContainer");

document.getElementById("focusMode").onclick = () => {
  graphShell.classList.toggle("fullscreen");
};

// Fermer le fullscreen avec la touche Echap
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && graphShell.classList.contains("fullscreen")) {
    graphShell.classList.remove("fullscreen");
  }
});
let currentChartInstance = null;
let globalStatsCache = null;
let currentView = "repartition";

// Palette Signature Violet-Rose
const SIG_COLORS = {
  violet: "#8b5cf6",
  pink: "#ec4899",
  purple: "#a78bfa",
  dark: "#1e293b",
  glass: "rgba(255, 255, 255, 0.05)",
  border: "rgba(139, 92, 246, 0.2)",
};

/* =======================================================
   BLOC 1 — CONFIGURATION DES VUES (CHART VIEWS)
======================================================= */
const VUES_CONFIG = [
  {
    id: "repartition",
    icon: `<svg class="vue-svg" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
  <path d="M22 12A10 10 0 0 0 12 2v10z"/>
</svg>`,
    label: "Répartition",
    desc: "Segmentation du marché",
  },
  {
    id: "profil",
    icon: `<svg class="vue-svg" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
  <circle cx="9" cy="7" r="4"/>
  <path d="M19 8l2 2 4-4"/>
</svg>`,
    label: "Top Profils",
    desc: "Performances et matching",
  },
  {
    id: "criteres",
    icon: `
    <svg class="vue-svg" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"/>
      <line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/>
      <line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="2" y1="14" x2="6" y2="14"/>
      <line x1="10" y1="8" x2="14" y2="8"/>
      <line x1="18" y1="16" x2="22" y2="16"/>
    </svg>`,
    label: "Critères",
    desc: "Analyse granulaire",
  },
];
/**
 * Génère les onglets de navigation du Dashboard
 */
function buildDashboardTabs() {
  const container = document.getElementById("tabsContainer");
  if (!container) return;
  container.innerHTML = "";

  VUES_CONFIG.forEach((vue) => {
    const activeClass = vue.id === currentView ? "active" : "";
    const tab = document.createElement("div");
    tab.className = `tab-item ${activeClass}`;
    tab.innerHTML = `
            <div class="tab-pct" style="background: ${SIG_COLORS.glass}">${vue.icon}</div>
            <div class="tab-info">
                <div class="tab-name">${vue.label}</div>
                <div class="tab-loc">${vue.desc}</div>
            </div>
        `;
    tab.onclick = () => {
      document
        .querySelectorAll(".tab-item")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      switchView(vue.id);
    };
    container.appendChild(tab);
  });
}

/* =======================================================
   API & DATA FETCHING
======================================================= */
async function fetchStats() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) return null;
    const { token } = JSON.parse(raw);

    const res = await fetch("/api/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return await res.json();
  } catch (err) {
    console.error("Erreur Sync Stats:", err);
    return null;
  }
}

/* =======================================================
   ENGINE : CHART RENDERING (BOOSTED)
======================================================= */
function getCanvasCtx() {
  return document.getElementById("dynamicChart").getContext("2d");
}

function destroyChart() {
  if (currentChartInstance) {
    currentChartInstance.destroy();
    currentChartInstance = null;
  }
}

// --- VIEW 1 : DONUT (REPARTITION) ---
function generateDonut(dist) {
  destroyChart();
  const ctx = getCanvasCtx();

  currentChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Forte (≥80%)", "Bonne (60-79%)", "Moyenne (40-59%)", "Faible"],
      datasets: [
        {
          data: [dist.forte, dist.bonne, dist.moyenne, dist.faible],
          backgroundColor: [
            SIG_COLORS.pink,
            SIG_COLORS.violet,
            SIG_COLORS.purple,
            "#1e1e2e",
          ],
          borderWidth: 0,
          hoverOffset: 20,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "75%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#94a3b8",
            font: { size: 12, weight: "600" },
            padding: 20,
          },
        },
        tooltip: {
          backgroundColor: "#0f172a",
          padding: 15,
          titleFont: { size: 14 },
        },
      },
      animation: { animateScale: true, animateRotate: true },
    },
  });
}

// --- VIEW 2 : BAR CHART (TOP PROFILS) ---
function generateBarChart(matches) {
  destroyChart();
  const ctx = getCanvasCtx();

  // Gradient Signature
  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, SIG_COLORS.pink);
  gradient.addColorStop(1, SIG_COLORS.violet);

  currentChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: matches.map((m) => m.username),
      datasets: [
        {
          label: "Score %",
          data: matches.map((m) => m.compatibility),
          backgroundColor: gradient,
          borderRadius: 12,
          hoverBackgroundColor: SIG_COLORS.pink,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: "rgba(255,255,255,0.03)" },
          ticks: { color: "#64748b" },
        },
        x: { grid: { display: false }, ticks: { color: "#94a3b8" } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#0f172a" },
      },
    },
  });
}

// --- VIEW 3 : HORIZONTAL STACKED (CRITERES) ---
function generateCriteriaChart(matches) {
  destroyChart();
  const ctx = getCanvasCtx();
  const total = matches.length;

  const criteria = [
    { key: "budget", label: "Budget" },
    { key: "surface", label: "Surface" },
    { key: "ville", label: "Localisation" },
    { key: "pieces", label: "Pièces" },
  ];

  const datasets = [
    { label: "Parfait", color: SIG_COLORS.pink, level: "perfect" },
    { label: "Proche", color: SIG_COLORS.violet, level: "close" },
    { label: "Hors-sujet", color: "#1e1e2e", level: "out" },
  ].map((conf) => ({
    label: conf.label,
    backgroundColor: conf.color,
    data: criteria.map((c) => {
      const count = matches.filter(
        (m) => m.criteriaMatch?.[c.key] === (conf.level === "perfect"),
      ).length;
      return Math.round((count / total) * 100);
    }),
    borderRadius: 6,
  }));

  currentChartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels: criteria.map((c) => c.label), datasets },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, max: 100, grid: { display: false } },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { color: "#fff", font: { weight: "600" } },
        },
      },
      plugins: { legend: { position: "bottom", labels: { color: "#94a3b8" } } },
    },
  });

  renderBreakdownTiles(matches);
}

/* =======================================================
   UI COMPONENTS : TILES & INSIGHTS
======================================================= */
function renderBreakdownTiles(matches) {
  const container = document.getElementById("criteriaScoreCards");
  if (!container) return;

  const keys = ["budget", "surface", "ville", "pieces"];
  container.innerHTML = keys
    .map((key) => {
      const score = Math.round(
        matches.reduce(
          (acc, m) => acc + (m.criteriaMatch?.[key] ? 100 : 30),
          0,
        ) / matches.length,
      );
      return `
            <div class="tile">
                <div class="tile-label">${key}</div>
                <div class="tile-score">${score}%</div>
                <div class="tile-bar"><div class="tile-bar-fill" style="width: ${score}%"></div></div>
            </div>
        `;
    })
    .join("");
}

function generateInsights(matches) {
  const box = document.getElementById("insightsBox");
  if (!box || !matches.length) return;

  const avg = Math.round(
    matches.reduce((a, b) => a + (b.compatibility || 0), 0) / matches.length,
  );
  const best = matches[0].username;

  box.innerHTML = `
        <div class="insight" style="margin-top:20px;">
            <div class="insight-label">💡 IA Insight</div>
            <div class="insight-value">
                Le profil <strong>${best}</strong> domine votre segment avec <strong>${matches[0].compatibility}%</strong> de match. 
                Optimisation suggérée : focalisez-vous sur les biens avec une moyenne de <strong>${avg}%</strong>.
            </div>
        </div>
    `;
}

/* =======================================================
   NAVIGATION LOGIC
======================================================= */
function switchView(view) {
  currentView = view;
  const stage = document.querySelector(".chart-stage");

  // Animation de transition
  stage.style.opacity = "0";
  stage.style.transform = "translateY(10px)";

  setTimeout(() => {
    if (view === "repartition") {
      document.getElementById("graphTitle").innerText = "Répartition du Marché";
      generateDonut(globalStatsCache.distribution);
    } else if (view === "profil") {
      document.getElementById("graphTitle").innerText = "Performance du Top 30";
      generateBarChart(globalStatsCache.top30);
    } else if (view === "criteres") {
      document.getElementById("graphTitle").innerText = "Analyse par Critères";
      generateCriteriaChart(globalStatsCache.top30);
    }
    stage.style.opacity = "1";
    stage.style.transform = "translateY(0)";
    generateInsights(globalStatsCache.top30);
  }, 300);
}

function animateValue(id, start, end, duration) {
  const obj = document.getElementById(id);
  if (!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerText = Math.floor(progress * (end - start) + start);
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

/* =======================================================
   CONTROLS & FILTERS
======================================================= */
function applyFilters() {
  const minScore = parseInt(document.getElementById("scoreFilter").value);
  const city = document.getElementById("cityFilter").value;
  const type = document.getElementById("typeFilter").value;

  const filtered = globalStatsCache.matches.filter((m) => {
    const scoreOk = m.compatibility >= minScore;
    const cityOk = city === "all" || m.ville === city;
    const typeOk = type === "all" || m.type === type;
    return scoreOk && cityOk && typeOk;
  });

  globalStatsCache.top30 = filtered.slice(0, 30);
  switchView(currentView);
}

function buildSmartFilters(matches) {
  const citySel = document.getElementById("cityFilter");
  const typeSel = document.getElementById("typeFilter");

  const cities = [...new Set(matches.map((m) => m.ville))].sort();
  const types = [...new Set(matches.map((m) => m.type))].sort();

  cities.forEach(
    (c) => (citySel.innerHTML += `<option value="${c}">${c}</option>`),
  );
  types.forEach(
    (t) => (typeSel.innerHTML += `<option value="${t}">${t}</option>`),
  );
}

// Export PNG Boosté
document.getElementById("exportPNG").onclick = () => {
  const link = document.createElement("a");
  link.download = "AiGENT-Analysis.png";
  link.href = document.getElementById("dynamicChart").toDataURL("image/png");
  link.click();
};

document.getElementById("refreshData").onclick = () => init();
document.getElementById("btnHome")?.addEventListener("click", () => {
  window.location.href = "accueil.html";
});
/* =======================================================
   INITIALIZATION
======================================================= */
async function init() {
  const data = await fetchStats();
  if (!data) return;

  globalStatsCache = {
    ...data,
    top30: data.matches.slice(0, 30),
  };

  // KPIs Animations
  animateValue("matchCounter", 0, data.totalMatches, 1500);
  animateValue("avgCompat", 0, data.averageCompatibility, 1500);
  animateValue("topCompat", 0, data.topMatch?.compatibility || 0, 1500);

  // Sidebar & Filters
  buildDashboardTabs();
  buildSmartFilters(data.matches);

  // Listeners
  document.getElementById("scoreFilter").onchange = applyFilters;
  document.getElementById("cityFilter").onchange = applyFilters;
  document.getElementById("typeFilter").onchange = applyFilters;

  // View par défaut
  switchView("repartition");
}

document.addEventListener("DOMContentLoaded", init);

// Responsive Chart Update
window.addEventListener("resize", () => {
  if (currentChartInstance) currentChartInstance.resize();
});
