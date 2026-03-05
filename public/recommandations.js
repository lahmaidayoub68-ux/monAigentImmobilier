// recommandations.js – version NLG avancée ultime “quasi humaine”
// =============================================================

import { PHRASES } from "./PHRASES.js";

let currentTab = "global",
  globalStatsCache = null,
  centralEl = null,
  tabsEls = null,
  mapInstance = null;

// =======================================================
// CONFIGURATION CRITÈRES ET CONNECTEURS
// =======================================================

const WEIGHTS = { budget: 3, surface: 1, pieces: 1, ville: 2, type: 1 };

const CONNECTORS = {
  addition: [
    "Par ailleurs",
    "De plus",
    "En complément",
    "Dans le même esprit",
    "Il est également à noter que",
  ],
  contrast: [
    "En revanche",
    "Cependant",
    "Néanmoins",
    "Toutefois",
    "Malgré tout",
  ],
  cause: [
    "En raison de cela",
    "Compte tenu de ces éléments",
    "Étant donné la situation",
    "Du fait de cette observation",
  ],
  effect: [
    "ce qui entraîne",
    "ce qui implique",
    "d'où la nécessité de",
    "ce qui peut nécessiter",
  ],
  summary: [
    "Dans l’ensemble",
    "Globalement",
    "Au final",
    "Ainsi",
    "En conclusion",
  ],
};

const CRITERIA_ORDER = ["budget", "surface", "pieces", "ville", "type"];

// =======================================================
// UTILITAIRES TEXTE ET CONNECTEURS
// =======================================================

function cleanText(text) {
  if (!text) return "";
  // Normalisation NFC pour préserver accents + suppression espaces multiples
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function capitalizeSentences(text) {
  // Capitalisation par phrase, sans perdre les accents
  return text
    .split(/([.!?]+)/)
    .map((s, i) => (i % 2 === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join("")
    .trim();
}

function pickConnectorUnique(used, type) {
  const pool = _.shuffle(CONNECTORS[type].filter((c) => !used.has(c)));
  const choice = pool[0] || _.sample(CONNECTORS[type]);
  used.add(choice);
  return choice;
}

// =======================================================
// ANALYSE MATCHES
// =======================================================

function analyzeMatchesPro(matches) {
  const stats = { budget: 0, surface: 0, pieces: 0, ville: 0, type: 0 };
  matches.forEach((m) => {
    if (m.budget >= m.userBudget) stats.budget++;
    if (m.surface >= m.userSurface) stats.surface++;
    if (m.pieces >= m.userPieces) stats.pieces++;
    if (m.cityScore >= 0.7) stats.ville++;
    if (m.typeMatch >= 0.7) stats.type++;
  });

  const ratio = (v) => v / matches.length;
  const context = {
    budget: ratio(stats.budget) > 0.6 ? "budgetOk" : "budgetHigh",
    surface: ratio(stats.surface) > 0.6 ? "surfaceOk" : "surfaceLow",
    pieces: ratio(stats.pieces) > 0.6 ? "piecesOk" : "piecesLow",
    ville: ratio(stats.ville) > 0.6 ? "villeOk" : "villeLow",
    type: ratio(stats.type) > 0.6 ? "typeOk" : "typeLow",
  };

  context.scores = Object.keys(context).reduce((acc, key) => {
    acc[key] = WEIGHTS[key] * (context[key].endsWith("Ok") ? 1 : -1);
    return acc;
  }, {});

  return context;
}

// =======================================================
// SÉLECTION PHRASES – NLG QUASI HUMAINE
// =======================================================

function selectSentencesProUltimate(role, context) {
  const paragraphs = [],
    usedConnectors = new Set();
  let lastConnector = null;

  CRITERIA_ORDER.forEach((criterion) => {
    const key = context[criterion];
    const bank = PHRASES[role][key];
    if (!bank || !bank.length) return;

    const block = _.sample(bank);
    const idea = block[0],
      explanation = block[1] || "",
      recommendation =
        block[2] ||
        "Il est recommandé d’adapter vos critères selon ce constat.";

    const connectorIdea =
      context.scores[criterion] < 0
        ? pickConnectorUnique(usedConnectors, "contrast")
        : pickConnectorUnique(usedConnectors, "addition");
    const connectorExp = explanation
      ? pickConnectorUnique(usedConnectors, "effect")
      : "";
    const connectorReco = pickConnectorUnique(usedConnectors, "cause");

    // Liaison fluide avec le critère précédent
    const interConnector = lastConnector || connectorIdea;
    lastConnector = connectorIdea;

    const ideaText = capitalizeSentences(
      `${interConnector}, ${cleanText(idea)}.`,
    );
    const explanationText = explanation
      ? capitalizeSentences(`${connectorExp}, ${cleanText(explanation)}.`)
      : "";
    const recoText = capitalizeSentences(
      `${connectorReco}, ${cleanText(recommendation)}.`,
    );

    paragraphs.push({
      criterion,
      text: [ideaText, explanationText, recoText].filter(Boolean).join(" "),
      score: context.scores[criterion],
    });
  });

  // Synthèse finale
  const synth = _.sample(
    PHRASES[role].conclusion || ["Analyse globale effectuée."],
  );
  const summaryConnector = pickConnectorUnique(usedConnectors, "summary");
  paragraphs.push({
    criterion: "synthese",
    text: capitalizeSentences(`${summaryConnector}, ${cleanText(synth)}`),
    score: 0,
  });

  return paragraphs.sort((a, b) => b.score - a.score);
}

// =======================================================
// CONSTRUCTION PARAGRAPHES
// =======================================================

function buildParagraphsProUltimate(paragraphs) {
  return paragraphs.map((p) => cleanText(p.text));
}

// =======================================================
// GÉNÉRATION DIAGNOSTIC – EXPORT
// =======================================================

export function generateDiagnosticPro(matches, role = "buyer") {
  if (!matches || !matches.length)
    return ["Aucune donnée n’est disponible pour réaliser une analyse fiable."];
  const context = analyzeMatchesPro(matches);
  const paragraphsData = selectSentencesProUltimate(role, context);
  return buildParagraphsProUltimate(paragraphsData);
}
// =======================================================
// MENU LATÉRAL
// =======================================================

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

// =======================================================
// FETCH STATS
// =======================================================

async function fetchStats() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) throw new Error("Token manquant");

    const user = JSON.parse(raw);
    const token = user.token;

    const res = await fetch("/api/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Erreur API");

    const data = await res.json();
    return { ...data, top30: data.matches.slice(0, 30) };
  } catch (err) {
    console.error("[fetchStats]", err);
    return null;
  }
}

async function waitForTop30(retries = 5) {
  for (let i = 0; i < retries; i++) {
    const stats = await fetchStats();
    if (stats?.top30?.length === 30) return stats;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

// =======================================================
// INIT RECOMMANDATIONS
// =======================================================

async function initRecommendations() {
  centralEl = document.getElementById("central-diagnostic");
  tabsEls = document.querySelectorAll(".reco-tab");

  centralEl.innerHTML = `<div class="loader"></div> Chargement des données...`;

  globalStatsCache = await waitForTop30();
  if (!globalStatsCache) {
    centralEl.innerHTML = "⚠️ Impossible de récupérer les données.";
    return;
  }

  animateTotalMatches(globalStatsCache.totalMatches || 30);
  await updateDiagnostic();
  initMap();

  tabsEls.forEach((tab) => {
    tab.addEventListener("click", async () => {
      await switchTab(tab.dataset.tab);
    });
  });
}

// =======================================================
// SWITCH TAB
// =======================================================

async function switchTab(tabName) {
  currentTab = tabName;
  tabsEls.forEach((t) => t.classList.remove("active"));
  const selected = document.querySelector(`.reco-tab[data-tab='${tabName}']`);
  if (selected) selected.classList.add("active");
  await updateCentralContent();
}

// =======================================================
// UPDATE CENTRAL
// =======================================================

async function updateCentralContent() {
  if (!globalStatsCache) return;

  if (currentTab === "global") {
    centralEl.innerHTML = "<p>🧠 Analyse en cours...</p>";
    await updateDiagnostic();
  } else if (currentTab === "criteria") {
    centralEl.innerHTML = generateCriteriaHTML(globalStatsCache.top30);
    updateMap(globalStatsCache.top30);
  } else if (currentTab === "actions") {
    centralEl.innerHTML = generateSuggestionsHTML(globalStatsCache.top30);
  }
}

// =======================================================
// DIAGNOSTIC
// =======================================================

async function updateDiagnostic() {
  try {
    centralEl.innerHTML = `<div class="loader"></div> Analyse en cours...`;

    const raw = localStorage.getItem("agent_user");
    const user = raw ? JSON.parse(raw) : { role: "buyer" };
    const role = user.role || "buyer";

    const paragraphs = generateDiagnosticPro(globalStatsCache.top30, role);

    centralEl.innerHTML = `<div style="font-size:14px;">${paragraphs
      .map((p) => `<p style="margin-bottom:14px;line-height:1.6;">${p}</p>`)
      .join("")}</div>`;
  } catch (err) {
    console.error("[updateDiagnostic]", err);
    centralEl.innerHTML = "<p>⚠️ Erreur lors de l'analyse.</p>";
  }
}

// =======================================================
// MAP LEAFLET
// =======================================================

function initMap() {
  const mapContainer = document.getElementById("criteria-map");
  if (!mapContainer) return;

  mapInstance = L.map(mapContainer).setView([48.8566, 2.3522], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
    mapInstance,
  );
}

function updateMap(matches) {
  if (!mapInstance) return;

  mapInstance.eachLayer((layer) => {
    if (layer instanceof L.Marker) mapInstance.removeLayer(layer);
  });

  matches.forEach((m) => {
    if (m.lat && m.lng)
      L.marker([m.lat, m.lng])
        .addTo(mapInstance)
        .bindPopup(`<b>${m.name || "Bien"}</b><br>${m.city || ""}`);
  });
}

// =======================================================
// HEADER
// =======================================================

function animateTotalMatches(total) {
  const container = document.createElement("div");
  container.style.cssText =
    "font-size:24px;font-weight:700;text-align:center;margin-bottom:15px;color:#333";
  container.innerText = `Analyse des ${total} meilleurs profils (session)`;
  document.querySelector(".content-wrapper").prepend(container);
}

// =======================================================
// INIT
// =======================================================

document.addEventListener("DOMContentLoaded", initRecommendations);
