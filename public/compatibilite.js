let currentChartInstance = null;
let globalStatsCache = null;
let currentView = "repartition";

// ==========================
// MENU LATÉRAL
// ==========================
const sidebar = document.getElementById("sidebar");
const openBtn = document.getElementById("openSidebar");
const closeBtn = document.getElementById("closeSidebar");
const overlay = document.getElementById("sidebarOverlay");

if (openBtn && sidebar && overlay) {
  openBtn.addEventListener("click", () => {
    console.log("[SIDEBAR] Ouverture menu");
    sidebar.classList.add("open");
    overlay.classList.add("active");

    // FAIRE DISPARAÎTRE LE BOUTON DU MENU
    openBtn.style.display = "none";
  });
}

if (closeBtn && sidebar && overlay) {
  closeBtn.addEventListener("click", () => {
    console.log("[SIDEBAR] Fermeture menu");
    sidebar.classList.remove("open");
    overlay.classList.remove("active");

    // FAIRE RÉAPPARAÎTRE LE BOUTON DU MENU
    openBtn.style.display = "flex"; // flex pour conserver l'alignement initial
  });
}

if (overlay && sidebar) {
  overlay.addEventListener("click", () => {
    console.log("[SIDEBAR] Fermeture menu via overlay");
    sidebar.classList.remove("open");
    overlay.classList.remove("active");

    // FAIRE RÉAPPARAÎTRE LE BOUTON DU MENU
    openBtn.style.display = "flex";
  });
}

/* =======================================================
   FETCH STATS
   → récupère les stats depuis l'API
======================================================= */
async function fetchStats() {
  try {
    console.log("[fetchStats] Début récupération stats");

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
  const canvas = document.getElementById("dynamicChart");
  return canvas.getContext("2d");
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
          label: "Répartition compatibilités",
          data: [
            distribution.forte,
            distribution.bonne,
            distribution.moyenne,
            distribution.faible,
          ],
          backgroundColor: ["#4caf50", "#2196f3", "#ff9800", "#f44336"],
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw} match(s)`,
          },
        },
      },
      animation: { animateRotate: true, animateScale: true },
    },
  });
}

/* =======================================================
   BAR CHART VERTICAL - Compatibilité par profil
======================================================= */
function generateBarChart(matches) {
  destroyCurrentChart();

  const ctx = getCanvasContext();
  const labels = matches.map((m) => m.username);
  const data = matches.map((m) => m.compatibility);

  currentChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Compatibilité (%)",
          data,
          backgroundColor: data.map((c) =>
            c >= 80
              ? "#4caf50"
              : c >= 60
                ? "#2196f3"
                : c >= 40
                  ? "#ff9800"
                  : "#f44336",
          ),
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const m = matches[ctx.dataIndex];

              const pieces =
                m.pieces != null
                  ? `${m.pieces}`
                  : m.piecesMin != null
                    ? `≥${m.piecesMin}`
                    : m.piecesMax != null
                      ? `≤${m.piecesMax}`
                      : "";

              const surface =
                m.surface != null
                  ? `${m.surface} m²`
                  : m.surfaceMin != null
                    ? `≥${m.surfaceMin} m²`
                    : m.surfaceMax != null
                      ? `≤${m.surfaceMax} m²`
                      : "";

              const prix =
                m.price != null
                  ? `${m.price}€`
                  : m.budgetMin != null && m.budgetMax != null
                    ? `${m.budgetMin}€ - ${m.budgetMax}€`
                    : m.budgetMax != null
                      ? `≤${m.budgetMax}€`
                      : m.budgetMin != null
                        ? `≥${m.budgetMin}€`
                        : "";

              const lignes = [
                `Compatibilité: ${m.compatibility}%`,
                `Score: ${m.score}`,
              ];

              if (prix) lignes.push(`Prix / Budget: ${prix}`);
              if (pieces) lignes.push(`Pièces: ${pieces}`);
              if (surface) lignes.push(`Surface: ${surface}`);
              if (m.ville) lignes.push(`Ville: ${m.ville}`);

              return lignes;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          title: { display: true, text: "Compatibilité (%)" },
        },
        x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 } },
      },
      animation: { duration: 1500, easing: "easeOutBounce" },
    },
  });
}

/* =======================================================
   BARRES HORIZONTALES - Compatibilité par critère
   (Lecture directe de criteriaMatch - fidèle au back)
======================================================= */
function generateHorizontalBarChart(matches) {
  destroyCurrentChart();

  const ctx = getCanvasContext();
  const total = matches.length;

  const stats = {
    ville: 0,
    budget: 0,
    pieces: 0,
    surface: 0,
  };

  matches.forEach((m) => {
    if (!m.criteriaMatch) return;

    if (m.criteriaMatch.ville) stats.ville++;
    if (m.criteriaMatch.budget) stats.budget++;
    if (m.criteriaMatch.pieces) stats.pieces++;
    if (m.criteriaMatch.surface) stats.surface++;
  });

  const labels = ["Ville", "Prix / Budget", "Pièces", "Surface"];
  const data = [
    Math.round((stats.ville / total) * 100),
    Math.round((stats.budget / total) * 100),
    Math.round((stats.pieces / total) * 100),
    Math.round((stats.surface / total) * 100),
  ];

  currentChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Compatibilité (%)",
          data,
          backgroundColor: ["#6aace5", "#f59e0b", "#10b981", "#f43f5e"],
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          title: { display: true, text: "Compatibilité (%)" },
        },
        y: { title: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const percentage = ctx.raw;
              return `Compatibilité sur ce critère: ${percentage}% des profils`;
            },
          },
        },
      },
      animation: { duration: 1000, easing: "easeOutQuad" },
    },
  });
}
/* =======================================================
   SWITCH VIEW
======================================================= */
function switchView(view) {
  if (view === currentView) return;

  currentView = view;
  const title = document.getElementById("graphTitle");
  const canvas = document.getElementById("dynamicChart");
  canvas.style.display = "block";

  if (view === "repartition") {
    title.innerText = "Répartition des compatibilités";
    generateDonut(globalStatsCache.distribution);
  } else if (view === "profil") {
    title.innerText = "Compatibilité par profil";
    generateBarChart(globalStatsCache.top30);
  } else if (view === "criteres") {
    title.innerText = "Compatibilité par critère";
    generateHorizontalBarChart(globalStatsCache.top30);
  }
}

/* =======================================================
   ANIMATION TOTAL MATCHES
======================================================= */
function animateTotalMatches(total) {
  const container = document.createElement("div");
  container.style.cssText =
    "font-size:24px;font-weight:700;text-align:center;margin-bottom:15px;color:#333";
  container.innerText = "Nombre total de matchs : 0";
  document.querySelector(".content-wrapper").prepend(container);

  let count = 0;
  const step = Math.max(1, Math.floor(total / 60));
  const interval = setInterval(() => {
    count += step;
    if (count >= total) {
      count = total;
      clearInterval(interval);
    }
    container.innerText = `Analyse des 30 meilleurs profils (par session)`;
  }, 15);
}

/* =======================================================
   INIT
======================================================= */
async function init() {
  console.log("[init] Initialisation");
  const stats = await fetchStats();
  if (!stats) return;

  // Top 30 déjà calculé côté matchingEngine.js
  globalStatsCache = {
    ...stats,
    top30: stats.matches.slice(0, 30),
  };

  animateTotalMatches(stats.totalMatches);
  generateDonut(stats.distribution);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      switchView(tab.dataset.view);
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
