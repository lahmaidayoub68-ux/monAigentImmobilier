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
/* =======================================================
   PALETTE NIVEAUX
======================================================= */
const LEVEL_COLOR = {
  perfect: "#10b981", // vert
  close: "#3b82f6", // bleu
  tolerated: "#f59e0b", // orange
  weak: "#f97316", // orange foncé
  out: "#ef4444", // rouge
  none: "#9ca3af", // gris
};

const LEVEL_LABEL = {
  perfect: "Parfait",
  close: "Proche",
  tolerated: "Toléré",
  weak: "Faible",
  out: "Hors critère",
  none: "Non défini",
};

/* =======================================================
   HELPER — score moyen d'un critère sur tous les matches
======================================================= */
function avgCriteriaScore(matches, key) {
  const values = matches
    .map((m) => m.criteriaMatch?.detail?.[key]?.score)
    .filter((v) => v != null);
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/* =======================================================
   HELPER — distribution des niveaux pour un critère
======================================================= */
function levelDistribution(matches, key) {
  const dist = { perfect: 0, close: 0, tolerated: 0, weak: 0, out: 0, none: 0 };
  matches.forEach((m) => {
    const level = m.criteriaMatch?.detail?.[key]?.level ?? "none";
    dist[level] = (dist[level] || 0) + 1;
  });
  return dist;
}

/* =======================================================
   GRAPHIQUE CRITÈRES — barres empilées par niveau
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
    data: {
      labels: criteria.map((c) => c.label),
      datasets,
    },
    options: {
      indexAxis: "y",
      responsive: true,
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

  // Inject scorecard sous le canvas
  renderCriteriaScoreCards(matches, criteria);
}

/* =======================================================
   SCORECARDS sous le graphique
======================================================= */
function renderCriteriaScoreCards(matches, criteria) {
  const existing = document.getElementById("criteriaScoreCards");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.id = "criteriaScoreCards";
  container.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;
    justify-content: center;
  `;

  criteria.forEach(({ key, label }) => {
    const avg = avgCriteriaScore(matches, key);
    const dist = levelDistribution(matches, key);
    const topLevel =
      ["perfect", "close", "tolerated", "weak", "out"].find(
        (l) => dist[l] > 0,
      ) ?? "none";

    const color =
      avg == null
        ? "#9ca3af"
        : avg >= 75
          ? "#10b981"
          : avg >= 50
            ? "#3b82f6"
            : avg >= 25
              ? "#f59e0b"
              : "#ef4444";

    const card = document.createElement("div");
    card.style.cssText = `
      background: #1e293b;
      border: 1px solid ${color}44;
      border-left: 4px solid ${color};
      border-radius: 10px;
      padding: 10px 16px;
      min-width: 130px;
      text-align: center;
      flex: 1 1 130px;
      max-width: 160px;
    `;

    card.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">${label}</div>
      <div style="font-size:26px;font-weight:700;color:${color}">${avg != null ? avg : "—"}</div>
      <div style="font-size:11px;color:#64748b">/ 100</div>
      <div style="margin-top:6px;font-size:11px;color:${LEVEL_COLOR[topLevel] ?? "#9ca3af"}">${LEVEL_LABEL[topLevel]}</div>
    `;

    container.appendChild(card);
  });

  // Insérer après le canvas
  const canvas = document.getElementById("dynamicChart");
  canvas.parentNode.insertBefore(container, canvas.nextSibling);
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
function animateTotalMatches(total) {
  const container = document.createElement("div");
  container.className = "stats-header-centered";

  const mainText = document.createElement("div");
  mainText.className = "stats-title-centered";
  mainText.innerText = "Analyse des 30 meilleurs profils";

  const subText = document.createElement("div");
  subText.className = "stats-subtitle";
  subText.innerText = "Par session";

  container.appendChild(mainText);
  container.appendChild(subText);

  document.querySelector(".content-wrapper").prepend(container);
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
