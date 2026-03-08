import { PHRASES } from "./PHRASES.js";
// VARIABLES GLOBALES
// =======================================================
let centralEl; // Élément central pour le diagnostic
let tabsEls; // Tous les onglets
let globalStatsCache; // Cache des stats récupérées
let currentTab = "global"; // Onglet courant
let mapInstance; // Instance de la carte Leaflet
// =======================================================
// CONFIGURATION CRITÈRES ET POIDS
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
// UTILITAIRES TEXTE
// =======================================================

function cleanText(text) {
  if (!text) return "";
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function capitalizeSentences(text) {
  return text
    .split(/([.!?]+)/)
    .map((s, i) => (i % 2 === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join("")
    .trim();
}

function pickConnector(type, exclude = []) {
  const pool = CONNECTORS[type].filter((c) => !exclude.includes(c));
  return pool.length
    ? pool[Math.floor(Math.random() * pool.length)]
    : CONNECTORS[type][Math.floor(Math.random() * CONNECTORS[type].length)];
}

// =======================================================
// STATISTIQUES DU MARCHÉ
// =======================================================

function computeStats(matches) {
  const avg = (key) =>
    Math.round(matches.reduce((s, m) => s + (m[key] ?? 0), 0) / matches.length);

  const median = (key) => {
    const sorted = [...matches].sort((a, b) => (a[key] ?? 0) - (b[key] ?? 0));
    return sorted[Math.floor(sorted.length / 2)][key] ?? 0;
  };

  return {
    avgSurfaceTop30: avg("surface"),
    avgRoomsTop30: avg("pieces"),
    medianSurfaceTop30: median("surface"),
    medianRoomsTop30: median("pieces"),
  };
}

// =======================================================
// ANALYSE MATCHES (acheteur ou vendeur)
// =======================================================
function analyzeMatches(matches, userCriteria, role = "buyer") {
  const stats = { budget: 0, surface: 0, pieces: 0, ville: 0, type: 0 };

  matches.forEach((m) => {
    let matchBudget, userBudgetValue;
    let matchSurface, userSurfaceValue;
    let matchPieces, userPiecesValue;

    if (role === "buyer") {
      matchBudget = m.price ?? 0; // pour comparer au budget max du buyer
      userBudgetValue = userCriteria.budgetMax ?? 0;
      matchSurface = m.surface ?? 0;
      userSurfaceValue = userCriteria.surfaceMax ?? 0;
      matchPieces = m.pieces ?? 0;
      userPiecesValue = userCriteria.piecesMax ?? 0;
    } else if (role === "seller") {
      matchBudget = m.price ?? 0;
      userBudgetValue = userCriteria.budget ?? 0;
      matchSurface = m.surface ?? 0;
      userSurfaceValue = userCriteria.surface ?? 0;
      matchPieces = m.pieces ?? 0;
      userPiecesValue = userCriteria.pieces ?? 0;
    }

    if (matchBudget <= userBudgetValue) stats.budget++; // budget ok si <= pour acheteur
    if (matchSurface >= userSurfaceValue) stats.surface++;
    if (matchPieces >= userPiecesValue) stats.pieces++;
    if ((m.villeScoreVal ?? 0) >= 0.7) stats.ville++;
    if ((m.typeMatch ?? 0) >= 0.7) stats.type++;
  });

  const ratio = (v) => (matches.length ? v / matches.length : 0);

  const context = {
    budget: ratio(stats.budget) > 0.6 ? "budgetOk" : "budgetHigh",
    surface: ratio(stats.surface) > 0.6 ? "surfaceOk" : "surfaceLow",
    pieces: ratio(stats.pieces) > 0.6 ? "piecesOk" : "piecesLow",
    ville: ratio(stats.ville) > 0.6 ? "villeOk" : "villeLow",
    type: ratio(stats.type) > 0.6 ? "typeOk" : "typeLow",
  };

  const scores = {};
  Object.keys(context).forEach((k) => {
    scores[k] = WEIGHTS[k] * (context[k].endsWith("Ok") ? 1 : -1);
  });

  return { context, scores };
}
// =======================================================
// INJECTION CSS ULTRA-PRO (sobre et lisible)
// =======================================================
(function injectProCSS() {
  const style = document.createElement("style");
  style.innerHTML = `
    #central-diagnostic p {
      font-size: 1rem;           /* taille de texte standard */
      line-height: 1.6;          /* interligne agréable */
      text-align: justify;       /* justifié pour un rendu pro */
      margin-bottom: 1em;        /* un seul espace entre paragraphes */
      text-indent: 0.8em;        /* alinéa discret au début */
    }
    #central-diagnostic span {
      display: inline;           /* inline pour phrases dans le paragraphe */
    }
    #central-diagnostic b {
      font-weight: 700;          /* gras pour mots clés seulement */
    }
    /* Tableaux éventuels */
    .criteria-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1em;
    }
    .criteria-table th, .criteria-table td {
      padding: 0.5em 0.8em;
      text-align: left;
      border-bottom: 1px solid #ddd;
      font-size: 0.95rem;
    }
    .criteria-table th {
      font-weight: 700;
      background-color: #f5f5f5;
    }
    .loader {
      font-size: 1rem;
      text-align: center;
      margin: 2em 0;
    }
  `;
  document.head.appendChild(style);
})();
// =======================================================
// CONSTRUCTION DE PARAGRAPHE ULTRA-PRO (fluidité & connecteurs logiques révisés)
// =======================================================
function buildParagraph(block, vars, usedConnectors, score = 0) {
  if (!block) return "";

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Interpolation des variables
  const interpolate = (str) =>
    str.replace(/{(\w+)}/g, (_, key) => {
      const val = vars[key] ?? "";
      // Montant affiché avec € si key contient budget
      if (typeof val === "number") {
        return key.toLowerCase().includes("budget")
          ? `<b>€${val}</b>`
          : `<b>${val}</b>`;
      }
      return val;
    });

  // Choix des phrases
  const obsRaw = pick(block.observation);
  const marketRaw = pick(block.market);
  const impactRaw = pick(block.impact);
  let recRaw = pick(block.recommendation);

  // S'assurer que la recommandation est une chaîne
  if (typeof recRaw === "object") recRaw = JSON.stringify(recRaw);

  // Emphase sur mots clés intelligents
  const emphasizeWords = (text) => {
    if (!text) return "";
    const keywords = [
      "parfait",
      "conforme",
      "optimal",
      "limité",
      "nécessité",
      "attention",
      "flexibilité",
      "utile",
      "pratique",
    ];
    keywords.forEach((w) => {
      const regex = new RegExp(`\\b(${w})\\b`, "gi");
      text = text.replace(regex, "<b>$1</b>");
    });
    return text;
  };

  const obs = emphasizeWords(interpolate(obsRaw));
  const market = emphasizeWords(interpolate(marketRaw));
  const impact = emphasizeWords(interpolate(impactRaw));
  const rec = emphasizeWords(interpolate(recRaw));

  // Connecteurs logiques adaptés au contexte
  const c1 =
    score >= 0
      ? pickConnector("addition", [...usedConnectors])
      : pickConnector("contrast", [...usedConnectors]); // Observation
  usedConnectors.add(c1);

  const c2 = pickConnector("cause", [...usedConnectors]); // Marché / comparaison
  usedConnectors.add(c2);

  const c3 = pickConnector("effect", [...usedConnectors]); // Impact / conséquence
  usedConnectors.add(c3);

  const c4 =
    score >= 0
      ? pickConnector("addition", [...usedConnectors])
      : pickConnector("contrast", [...usedConnectors]); // Recommandation
  usedConnectors.add(c4);

  // Construction du paragraphe fluide
  const paragraph = `
    <p style="text-indent:0.8em; margin-bottom:1em;">
      <span>${c1} ${obs}.</span>
      <span>${c2} ${market}.</span>
      <span>${c3} ${impact}.</span>
      <span>${c4} ${rec}.</span>
    </p>
  `;

  // Nettoyage et capitalisation : uniquement début de phrase en majuscule
  const cleaned = cleanText(paragraph).replace(
    /([.!?]\s+)(\w)/g,
    (_, punc, letter) => punc + letter.toLowerCase(),
  );

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// =======================================================
// GÉNÉRATION DIAGNOSTIC ULTRA-PRO (acheteur ou vendeur)
// =======================================================
export function generateDiagnostic(matches, userCriteria, role = "buyer") {
  if (!matches || !matches.length) {
    return [
      "<p>Aucune donnée n’est disponible pour établir une analyse fiable.</p>",
    ];
  }

  // Analyse avec prise en compte du rôle
  const { context, scores } = analyzeMatches(matches, userCriteria, role);
  const marketStats = computeStats(matches);
  const usedConnectors = new Set();
  const paragraphs = [];

  CRITERIA_ORDER.forEach((criterion) => {
    const key = context[criterion];
    const block = PHRASES?.[role]?.[key];
    if (!block) return;

    // Mapping exact des variables selon addBuyer/addSeller
    const vars = {
      ...marketStats,
      surface: matches[0]?.surface ?? 0,
      rooms: matches[0]?.pieces ?? 0,
      userSurface:
        role === "buyer"
          ? (userCriteria.surfaceMax ?? 0)
          : (userCriteria.surface ?? 0),
      userBudget:
        role === "buyer"
          ? (userCriteria.budgetMax ?? 0)
          : (userCriteria.budget ?? 0),
      userPieces:
        role === "buyer"
          ? (userCriteria.piecesMax ?? 0)
          : (userCriteria.pieces ?? 0),
      topCount: matches.length,
    };

    const paragraphHTML = buildParagraph(
      block,
      vars,
      usedConnectors,
      scores[criterion] ?? 0,
    );

    paragraphs.push({
      criterion,
      html: paragraphHTML,
      score: scores[criterion] ?? 0,
    });
  });

  // Synthèse finale
  const positives =
    paragraphs
      .filter((p) => p.score > 0)
      .map((p) => `<b>${p.criterion}</b>`)
      .join(", ") || "plusieurs critères";
  const negatives =
    paragraphs
      .filter((p) => p.score < 0)
      .map((p) => `<b>${p.criterion}</b>`)
      .join(", ") || "aucun point critique";

  let conclusion = PHRASES?.[role]?.conclusion ?? "";
  if (Array.isArray(conclusion))
    conclusion = conclusion[Math.floor(Math.random() * conclusion.length)];

  const summaryConnector = pickConnector("summary");

  paragraphs.push({
    criterion: "summary",
    score: 0,
    html: `<p style="text-indent:0.8em; margin-bottom:1em;">
             <span>${summaryConnector}, le bien présente des points positifs sur ${positives}, tout en nécessitant une attention particulière concernant ${negatives}.</span>
             <span><b>Recommandations :</b> ${conclusion}</span>
           </p>`,
  });

  return paragraphs
    .sort((a, b) => (a.criterion === "budget" ? -1 : b.score - a.score))
    .map((p) => p.html);
}
//=====================================================
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

/* =======================================================
FETCH STATS
======================================================= */
async function fetchStats() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) throw new Error("Token manquant");

    const user = JSON.parse(raw);
    const token = user.token;
    if (!token) throw new Error("Token JWT manquant");

    const res = await fetch("/api/stats", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error("Erreur API: " + res.status);

    const data = await res.json();
    return { ...data, top30: data.matches.slice(0, 30) };
  } catch (err) {
    console.error("[fetchStats]", err);
    return null;
  }
}

async function waitForTop30(retries = 5, delayMs = 300) {
  for (let i = 0; i < retries; i++) {
    const stats = await fetchStats();
    if (stats?.top30?.length === 30) return stats;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  console.warn("[waitForTop30] Top30 incomplet après plusieurs tentatives");
  return null;
}

/* =======================================================
INIT RECOMMANDATIONS
======================================================= */
// =======================================================
// INIT RECOMMANDATIONS
// =======================================================
async function initRecommendations() {
  centralEl = document.getElementById("central-diagnostic");
  tabsEls = document.querySelectorAll(".reco-tab");

  if (!centralEl) {
    console.error("Élément central-diagnostic introuvable !");
    return;
  }

  centralEl.innerHTML = `<div class="loader"></div> Chargement des données...`;

  // Récupérer les stats
  globalStatsCache = await waitForTop30();
  if (!globalStatsCache) {
    centralEl.innerHTML = "⚠️ Impossible de récupérer les données.";
    return;
  }

  // Déterminer le rôle : seller ou buyer
  const role = globalStatsCache?.userRole || "buyer";

  animateTotalMatches(globalStatsCache.totalMatches || 30);

  // Affichage initial
  centralEl.innerHTML = `<p>🧠 Analyse des 30 meilleurs profils prête (${role}).</p>`;

  initMap();

  // Écoute des tabs avec passage du rôle
  tabsEls.forEach((tab) => {
    tab.addEventListener("click", async () => {
      currentTab = tab.dataset.tab;

      // Gestion classe active
      tabsEls.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Mise à jour du contenu central avec rôle correct
      await updateCentralContent(role);
    });
  });

  // Affichage initial du diagnostic global
  await updateCentralContent(role);
}
/* =======================================================
SWITCH TAB
======================================================= */
async function switchTab(tabName) {
  currentTab = tabName;
  if (!tabsEls) return;

  tabsEls.forEach((t) => t.classList.remove("active"));
  const selected = document.querySelector(`.reco-tab[data-tab='${tabName}']`);
  if (selected) selected.classList.add("active");

  await updateCentralContent();
}

/* =======================================================
LANGUAGETOOL - CORRECTION GRAMMAIRE / ORTHOGRAPHE
======================================================= */
async function correctWithLanguageToolPreserveHTML(html) {
  try {
    // Extraire le texte sans balises mais garder une map des <b> et <span>
    const tagMap = [];
    const textOnly = html.replace(/<[^>]+>/g, (tag) => {
      const placeholder = `@@${tagMap.length}@@`;
      tagMap.push(tag);
      return placeholder;
    });

    // Appel LanguageTool
    const res = await fetch("https://api.languagetoolplus.com/v2/check", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        text: textOnly,
        language: "fr",
      }),
    });

    const result = await res.json();
    if (!result.matches || result.matches.length === 0) return html;

    let corrected = textOnly;

    // Appliquer les corrections de la fin vers le début
    result.matches
      .sort((a, b) => b.offset - a.offset)
      .forEach((m) => {
        if (m.replacements && m.replacements.length > 0) {
          const replacement = m.replacements[0].value;
          corrected =
            corrected.slice(0, m.offset) +
            replacement +
            corrected.slice(m.offset + m.length);
        }
      });

    // Remettre les balises
    corrected = corrected.replace(/@@(\d+)@@/g, (_, idx) => tagMap[idx] || "");

    return corrected;
  } catch (err) {
    console.error("Erreur LanguageTool:", err);
    return html;
  }
}

/* =======================================================
UPDATE CENTRAL CONTENT (intégration LanguageTool + variantes)
======================================================= */
async function updateCentralContent(role = "buyer") {
  if (!globalStatsCache) return;

  if (currentTab === "global") {
    // Détermination des critères exacts selon le rôle
    const userCriteria =
      role === "buyer"
        ? {
            budgetMax: globalStatsCache.userBudget ?? 0,
            surfaceMax: globalStatsCache.userSurface ?? 0,
            piecesMax: globalStatsCache.userPieces ?? 0,
          }
        : {
            budget: globalStatsCache.userBudget ?? 0,
            surface: globalStatsCache.userSurface ?? 0,
            pieces: globalStatsCache.userPieces ?? 0,
          };

    // 1️⃣ Génération du diagnostic
    const diagnosticBlocks = generateDiagnostic(
      globalStatsCache.top30,
      userCriteria,
      role,
    );

    // 2️⃣ Correction avec LanguageTool et variantes
    const correctedParagraphs = await Promise.all(
      diagnosticBlocks.map(async (html) => {
        // Correction grammaticale et orthographique
        let corrected = await correctWithLanguageToolPreserveHTML(html);

        // Découper en phrases, nettoyer et filtrer
        let sentences = corrected
          .split(/(?<=\.)\s+/)
          .map((s) => s.trim())
          .filter(Boolean);

        // Shuffle léger pour éviter répétitions et créer variantes naturelles
        sentences = sentences
          .map((s) => [s, Math.random()])
          .sort((a, b) => a[1] - b[1])
          .map((x) => x[0]);

        // Reconstitution du paragraphe avec alinéa et <span> conservé
        return `<p style="text-indent:0.8em; margin-bottom:1em;">
                  <span>${sentences.join(" ")}</span>
                </p>`;
      }),
    );

    // 3️⃣ Affichage final
    centralEl.innerHTML = `<h4>🧠 Constat global</h4>
                           <div>${correctedParagraphs.join("")}</div>`;
  } else if (currentTab === "criteria") {
    centralEl.innerHTML = generateCriteriaHTML(globalStatsCache.top30);
    updateMap(globalStatsCache.top30);
  } else if (currentTab === "actions") {
    centralEl.innerHTML = generateSuggestionsHTML(globalStatsCache.top30);
  }
}
//=========================================
//GENERATE CRITERIA HTML
//======================================================//
function generateCriteriaHTML(matches) {
  if (!matches || matches.length === 0)
    return "<p>Aucune donnée disponible.</p>";

  var stats = { surface: 0, ville: 0, type: 0, budget: 0, pieces: 0 };

  matches.forEach(function (m) {
    if (!m.common) return;
    if (
      m.common.includes("Surface parfaite") ||
      m.common.includes("Surface supérieure")
    )
      stats.surface++;
    if (
      m.common.includes("Ville parfaite") ||
      m.common.includes("Ville proche")
    )
      stats.ville++;
    if (m.common.includes("Type parfait")) stats.type++;
    if (
      m.common.includes("Budget parfait") ||
      m.different.includes("Prix légèrement supérieur")
    )
      stats.budget++;
    if (
      m.common.includes("Pièces parfaites") ||
      m.common.includes("Nombre de pièces supérieur")
    )
      stats.pieces++;
  });

  var total = matches.length;
  var html =
    "<h4>📊 Constat par critère</h4><table class='criteria-table'>" +
    "<tr><th>Critère</th><th>Compatibilité</th><th>Observation</th></tr>";

  ["surface", "ville", "type", "budget", "pieces"].forEach(function (crit) {
    var percent = Math.round((stats[crit] / total) * 100);
    var color =
      percent >= 80
        ? "#4caf50"
        : percent >= 60
          ? "#2196f3"
          : percent >= 40
            ? "#ff9800"
            : "#f44336";
    var obs =
      percent > 80
        ? "Très large"
        : percent > 60
          ? "Large"
          : percent > 40
            ? "Modéré"
            : "Très restrictif";
    html += `<tr><td>${capitalize(crit)}</td><td style="color:${color}; font-weight:600">${percent}%</td><td>${obs}</td></tr>`;
  });

  html += "</table><div id='criteria-map' style='height:250px;'></div>";
  return html;
}

/* =======================================================
GENERATE SUGGESTIONS HTML
======================================================= */
function generateSuggestionsHTML(matches) {
  if (!matches || matches.length === 0)
    return "<p>Aucune suggestion disponible.</p>";

  var total = matches.length;
  var stats = { surface: 0, ville: 0, type: 0, budget: 0, pieces: 0 };

  matches.forEach(function (m) {
    if (!m.common) return;
    if (
      m.common.includes("Surface parfaite") ||
      m.common.includes("Surface supérieure")
    )
      stats.surface++;
    if (
      m.common.includes("Ville parfaite") ||
      m.common.includes("Ville proche")
    )
      stats.ville++;
    if (m.common.includes("Type parfait")) stats.type++;
    if (
      m.common.includes("Budget parfait") ||
      m.different.includes("Prix légèrement supérieur")
    )
      stats.budget++;
    if (
      m.common.includes("Pièces parfaites") ||
      m.common.includes("Nombre de pièces supérieur")
    )
      stats.pieces++;
  });

  var html =
    "<h4>🚀 Suggestions concrètes</h4><table class='criteria-table'>" +
    "<tr><th>Critère</th><th>Changement proposé</th><th>Compatibilité après</th></tr>";

  ["surface", "ville", "type", "budget", "pieces"].forEach(function (crit) {
    var percent = Math.round((stats[crit] / total) * 100);
    var suggestion =
      percent < 60
        ? "Ajuster ce critère pour augmenter la compatibilité"
        : "Pas de changement";
    var newCompat = percent < 60 ? Math.min(100, percent + 20) : percent;
    var color =
      newCompat >= 80
        ? "#4caf50"
        : newCompat >= 60
          ? "#2196f3"
          : newCompat >= 40
            ? "#ff9800"
            : "#f44336";
    html += `<tr><td>${capitalize(crit)}</td><td>${suggestion}</td><td style="color:${color}; font-weight:600">${newCompat}%</td></tr>`;
  });

  html += "</table>";
  return html;
}

/* =======================================================
MAP LEAFLET
======================================================= */
function initMap() {
  var mapContainer = document.getElementById("criteria-map");
  if (!mapContainer) return;

  mapInstance = L.map(mapContainer).setView([48.8566, 2.3522], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(mapInstance);
}

function updateMap(matches) {
  if (!mapInstance || !matches) return;

  mapInstance.eachLayer((layer) => {
    if (layer instanceof L.Marker) mapInstance.removeLayer(layer);
  });

  matches.forEach((m) => {
    if (m.lat && m.lng)
      L.marker([m.lat, m.lng])
        .addTo(mapInstance)
        .bindPopup(`<b>${m.name || "Bien immobilier"}</b><br>${m.city || ""}`);
  });

  const bounds = matches
    .filter((m) => m.lat && m.lng)
    .map((m) => [m.lat, m.lng]);
  if (bounds.length > 0) mapInstance.fitBounds(bounds, { padding: [50, 50] });
}

/* =======================================================
ANIMATION TOTAL MATCHES
======================================================= */
function animateTotalMatches(total) {
  const container = document.createElement("div");
  container.style.cssText =
    "font-size:24px;font-weight:700;text-align:center;margin-bottom:15px;color:#333";
  container.innerText = `Analyse des ${total} meilleurs profils (par session)`;
  document.querySelector(".content-wrapper").prepend(container);
}

/* =======================================================
UTILS
======================================================= */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* =======================================================
INIT
======================================================= */
document.addEventListener("DOMContentLoaded", initRecommendations);
