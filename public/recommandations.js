import { PHRASES } from "./PHRASES.js";
// VARIABLES GLOBALES
// =======================================================
let centralEl; // Élément central pour le diagnostic
let tabsEls; // Tous les onglets
let globalStatsCache; // Cache des stats récupérées
let currentTab = "global"; // Onglet courant
let mapInstance; // Instance de la carte Leaflet
async function fetchAIAnalysis(prompt, data) {
  try {
    const tokenRaw = localStorage.getItem("agent_user");
    if (!tokenRaw) throw new Error("Token manquant");
    const { token } = JSON.parse(tokenRaw);

    const res = await fetch("/api/ai-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ prompt, data }),
    });

    if (!res.ok) throw new Error("Erreur IA: " + res.status);
    const json = await res.json();
    return json.analysis; // texte brut IA
  } catch (err) {
    console.error("[fetchAIAnalysis]", err);
    return null;
  }
}

function buildAIFrontPrompt(matches, criteriaOrder = CRITERIA_ORDER) {
  let prompt =
    "Tu es un expert analyste immobilier. Analyse les 30 meilleurs biens :\n\n";
  criteriaOrder.forEach((crit) => {
    prompt += `Critère: ${crit}\n`;
    prompt += `Données: ${JSON.stringify(matches)}\n`;
    prompt +=
      "Rédige un paragraphe clair, structuré avec analyse et recommandations pour ce critère.\n\n";
  });
  prompt +=
    "Le texte final doit être en français, professionnel, lisible et concis.\n";
  return prompt;
}

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
(function injectProCSS() {
  const style = document.createElement("style");
  style.innerHTML = `
    /* --- Animations --- */
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes spin { 
      to { transform: rotate(360deg); } 
    }

    /* --- Conteneur Principal --- */
    #central-diagnostic {
      color: #2d3748;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 10px;
    }

    /* --- Cartes d'Analyse (Staggered Animation) --- */
    .analysis-card {
      background: #ffffff;
      padding: 1.5rem;
      border-radius: 12px;
      border: 1px solid #edf2f7;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      transition: all 0.2s ease;
      animation: fadeInUp 0.5s ease forwards;
      opacity: 0; /* Géré par l'animation */
    }

    .analysis-card:hover {
      transform: translateX(5px);
      border-color: #cbd5e0;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }

    /* Delays pour l'effet de cascade (stagger) */
    .analysis-card:nth-child(1) { animation-delay: 0.1s; }
    .analysis-card:nth-child(2) { animation-delay: 0.2s; }
    .analysis-card:nth-child(3) { animation-delay: 0.3s; }
    .analysis-card:nth-child(4) { animation-delay: 0.4s; }
    .analysis-card:nth-child(5) { animation-delay: 0.5s; }
    .analysis-card:nth-child(6) { animation-delay: 0.6s; }

    /* --- Badges de Critères --- */
    .criterion-badge {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
      box-shadow: 0 2px 4px rgba(118, 75, 162, 0.2);
    }

    /* --- Typographie Interne --- */
    .analysis-card p {
      margin: 0 !important;
      line-height: 1.7;
      font-size: 0.95rem;
      text-align: left;
      color: #4a5568;
    }

    .analysis-card b {
      color: #2d3748;
      background: #f1f5f9;
      padding: 0 4px;
      border-radius: 4px;
      font-weight: 600;
    }

    /* --- Loader Premium --- */
    .loader-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      text-align: center;
    }

    .custom-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e2e8f0;
      border-top-color: #9b59ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }

    /* --- Tableaux (Onglet Critères/Actions) --- */
    .criteria-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-top: 1rem;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }

    .criteria-table th {
      background: #f8fafc;
      padding: 12px;
      font-weight: 700;
      font-size: 0.85rem;
      text-transform: uppercase;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
    }

    .criteria-table td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 0.9rem;
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
    const { token } = JSON.parse(raw);

    const res = await fetch("/api/stats", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error("Erreur API: " + res.status);

    const data = await res.json();

    // VERIFICATION : Si le nombre total est inférieur à 20, on renvoie une erreur spécifique
    if (data.totalMatches < 20) {
      return { error: "insufficient_data", count: data.totalMatches };
    }

    return data; // Contient totalMatches, matches, etc.
  } catch (err) {
    console.error("[fetchStats]", err);
    return null;
  }
}

/* =======================================================
INIT RECOMMANDATIONS
======================================================= */
// =======================================================
// INIT RECOMMANDATIONS
// =======================================================
async function initRecommendations() {
  centralEl = document.getElementById("central-diagnostic");
  if (!centralEl) return;

  centralEl.innerHTML = `<div class="loader"></div> Analyse du marché en cours...`;

  globalStatsCache = await fetchStats();

  // --- BLOCAGE SI < 20 MATCHS ---
  if (globalStatsCache?.error === "insufficient_data") {
    centralEl.innerHTML = `
      <div style="padding: 30px; text-align: center; background: #fff5f5; border-radius: 12px; border: 1px solid #feb2b2;">
        <h3 style="color: #c53030; margin-bottom: 15px;">📊 Constat indisponible</h3>
        <p style="color: #4a5568; line-height: 1.6;">
          Le diagnostic automatique nécessite au moins <b>20 profils compatibles</b> pour générer une analyse statistique fiable.
        </p>
        <p style="font-size: 1.2rem; font-weight: bold; margin: 15px 0;">
          Actuellement : <span style="color: #c53030;">${globalStatsCache.count} / 20</span>
        </p>
        <p style="font-size: 0.9rem; color: #718096;">
          💡 <i>Conseil : Essayez d'ajuster vos critères (élargir la zone géographique ou le budget) pour augmenter le nombre de résultats.</i>
        </p>
      </div>`;

    // On met quand même à jour l'élément HTML totalMatches s'il existe sur cette page
    const totalEl = document.getElementById("totalMatches");
    if (totalEl) totalEl.textContent = globalStatsCache.count;

    return; // On arrête l'initialisation ici
  }

  if (!globalStatsCache) {
    centralEl.innerHTML = "⚠️ Erreur lors du chargement des statistiques.";
    return;
  }

  // --- SI >= 20, ON CONTINUE NORMALEMENT ---
  const role = globalStatsCache.userRole || "buyer";

  // Mise à jour du texte d'en-tête dynamique
  animateTotalMatches(globalStatsCache.totalMatches);

  // Initialisation du contenu
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
/* =======================================================
UPDATE CENTRAL CONTENT AVEC IA
======================================================= */
/* =======================================================
UPDATE CENTRAL CONTENT AVEC IA & STRUCTURE PAR CRITÈRES
======================================================= */
async function updateCentralContent(role = "buyer") {
  if (!globalStatsCache) return;

  const analysisCount = globalStatsCache.totalMatches || 0;
  const matchesToAnalyze = globalStatsCache.matches.slice(0, analysisCount);

  if (matchesToAnalyze.length === 0) {
    centralEl.innerHTML = `<p style="text-align:center; padding:2rem;">Aucune donnée pertinente à analyser pour le moment.</p>`;
    return;
  }

  if (currentTab === "global") {
    // 1. Loader "Premium"
    centralEl.innerHTML = `
      <div class="loader-container">
        <div class="custom-spinner"></div>
        <p style="margin-top:1.2rem; color:#4a5568; font-weight:500; font-size:0.95rem;">
          Intelligence Artificielle en cours d'analyse sur ${analysisCount} profils...
        </p>
      </div>`;

    // 2. Préparation et appel IA
    const prompt = buildAIFrontPrompt(matchesToAnalyze, CRITERIA_ORDER);
    let rawAiContent = await fetchAIAnalysis(prompt, matchesToAnalyze);

    let paragraphsArray = [];

    // 3. Gestion du contenu (IA ou Fallback local)
    if (rawAiContent) {
      // Découpage propre par bloc de texte
      paragraphsArray = rawAiContent
        .split(/\n{1,2}/)
        .map((p) => p.trim())
        .filter(Boolean);
    } else {
      console.warn("[updateCentralContent] Fallback vers diagnostic local.");
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

      // On récupère le tableau de paragraphes générés localement
      paragraphsArray = generateDiagnostic(
        matchesToAnalyze,
        userCriteria,
        role,
      );
    }

    // 4. Reconstruction avec structure "Badge + Card"
    // On s'assure que CRITERIA_ORDER et les paragraphes s'alignent
    let formattedHTML = paragraphsArray
      .map((text, index) => {
        // Nettoyage des balises <p> résiduelles pour garder le contrôle total sur le style
        const cleanText = text.replace(/<\/?[^>]+(>|$)/g, "");

        // Détermination du nom du critère (Fallback sur "Analyse globale" pour la conclusion)
        const criterionKey = CRITERIA_ORDER[index] || "Synthèse";
        const badgeLabel = `Analyse critère : ${criterionKey}`;

        return `
        <div class="analysis-card">
          <span class="criterion-badge">${badgeLabel}</span>
          <p><span>${cleanText}</span></p>
        </div>
      `;
      })
      .join("");

    // 5. Correction grammaticale finale sur le bloc complet
    const finalContent =
      await correctWithLanguageToolPreserveHTML(formattedHTML);

    const minimalReportSVG = `
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 10px;">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#9b59ff"/><stop offset="100%" stop-color="#4e73df"/>
          </linearGradient>
        </defs>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="url(#grad1)"/>
      </svg>`;

    centralEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom: 1px solid #edf2f7; padding-bottom: 1rem;">
        <h4 style="margin:0; display:flex; align-items:center; font-weight:700;">
          ${minimalReportSVG} Diagnostic stratégique
        </h4>
        <span style="font-size:0.75rem; font-weight:600; color:#718096; background:#f1f5f9; padding:4px 10px; border-radius:20px;">
          ${analysisCount} profils traités
        </span>
      </div>
      <div class="ai-content-fade-in">${finalContent}</div>
    `;
  } else if (currentTab === "criteria") {
    centralEl.innerHTML = generateCriteriaHTML(matchesToAnalyze);
    updateMap(matchesToAnalyze);
  } else if (currentTab === "actions") {
    centralEl.innerHTML = generateSuggestionsHTML(matchesToAnalyze);
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
  const criteriaSVG = `
<svg class="icon-report" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     width="24" height="24" style="vertical-align: middle; margin-right:6px;">
  <defs>
    <linearGradient id="gradientBars" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#9b59ff"/>
      <stop offset="100%" stop-color="#4e73df"/>
    </linearGradient>
  </defs>
  <rect x="4" y="10" width="3" height="10" fill="url(#gradientBars)" rx="0.5"/>
  <rect x="10.5" y="6" width="3" height="14" fill="url(#gradientBars)" rx="0.5"/>
  <rect x="17" y="2" width="3" height="18" fill="url(#gradientBars)" rx="0.5"/>
</svg>
`;

  // Puis tu l’intègres dans ton header
  var html = `<h4>${criteriaSVG} Constat par critère</h4>
     <table class='criteria-table'>
       <tr><th>Critère</th><th>Compatibilité</th><th>Observation</th></tr>`;

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

  const suggestionSVG = `
<svg class="icon-suggestion" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     width="24" height="24" style="vertical-align: middle; margin-right:6px;">
  <defs>
    <linearGradient id="gradientBulb" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#9b59ff"/>
      <stop offset="100%" stop-color="#4e73df"/>
    </linearGradient>
  </defs>
  <path d="M12 2C8.13 2 5 5.13 5 9c0 3.25 2.11 5.98 5 6.73V21h2v-5.27c2.89-.75 5-3.48 5-6.73 0-3.87-3.13-7-7-7z"
        fill="url(#gradientBulb)"/>
  <rect x="11" y="21" width="2" height="2" fill="url(#gradientBulb)"/>
</svg>
`;

  // Intégration dans ton header
  var html = `<h4>${suggestionSVG} Suggestions concrètes</h4>
     <table class='criteria-table'>
       <tr><th>Critère</th><th>Changement proposé</th><th>Compatibilité après</th></tr>`;
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
ANIMATION BARRES DE PROGRESSION
======================================================= */
function animateProgressBars() {
  // Sélectionne toutes les barres
  const bars = document.querySelectorAll(".progress-fill");
  bars.forEach((bar) => {
    const value = parseInt(bar.dataset.value || 0, 10); // récupération du % cible
    bar.style.width = "0%"; // reset
    // animation fluide avec delay léger pour effet cascade si plusieurs
    setTimeout(() => {
      bar.style.transition = "width 1.2s ease-in-out";
      bar.style.width = `${value}%`;
    }, 50);
  });
}

// Appeler à chaque mise à jour de tab avec les progress bars visibles
function refreshProgressBars() {
  // petit timeout pour s'assurer que le DOM est mis à jour
  setTimeout(animateProgressBars, 100);
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
  const old = document.getElementById("total-matches-header");
  if (old) old.remove();

  const container = document.createElement("div");
  container.id = "total-matches-header";
  container.style.cssText = `
    background: #f8fafc;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    border: 1px solid #e2e8f0;
    text-align: center;
    animation: fadeInUp 0.8s ease;
  `;

  container.innerHTML = `
    <span style="color: #718096; font-size: 0.9rem; font-weight: 600; text-transform: uppercase;">Volume de données</span>
    <div style="font-size: 2rem; font-weight: 800; color: #1a202c; margin-top: 5px;">
      ${total} <span style="font-size: 1rem; font-weight: 500; color: #4a5568;">Profils Qualifiés</span>
    </div>
  `;
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
