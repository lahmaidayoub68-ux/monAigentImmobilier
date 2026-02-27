// ================================================
// recommandations.js (corrigé, sans backticks)
// ================================================

let currentTab = "global";
let globalStatsCache = null; // Contient Top30, distribution, totalMatches
let centralEl = null;
let tabsEls = null;
let mapInstance = null; // Leaflet map

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
   ENVOI MESSAGE À L'IA VIA L'API
======================================================= */
async function sendMessageToAI(message) {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) throw new Error("Token manquant");
    const user = JSON.parse(raw);
    const token = user.token;
    if (!token) throw new Error("Token JWT manquant");

    const resp = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ message: message }),
    });

    if (!resp.ok) throw new Error("Erreur API: " + resp.status);
    return resp.json();
  } catch (err) {
    console.error("[sendMessageToAI] Erreur :", err);
    return { message: "Impossible de contacter l'IA." };
  }
}
async function waitForTop30(retries = 5, delayMs = 300) {
  for (let i = 0; i < retries; i++) {
    const stats = await fetchStats();
    if (stats && stats.top30 && stats.top30.length === 30) {
      return stats;
    }
    // Attendre un petit délai avant de réessayer
    await new Promise((r) => setTimeout(r, delayMs));
  }
  console.warn("[waitForTop30] Top30 incomplet après plusieurs tentatives");
  return null;
}
/* =======================================================
   INIT RECOMMANDATIONS
======================================================= */
async function initRecommendations() {
  centralEl = document.getElementById("central-diagnostic");
  tabsEls = document.querySelectorAll(".reco-tab");

  // 1️⃣ Afficher un loader global
  centralEl.innerHTML = `<div class="loader"></div> Chargement des données...`;

  // 2️⃣ Récupérer les stats avec retry si nécessaire
  globalStatsCache = await waitForTop30();

  if (!globalStatsCache) {
    centralEl.innerHTML =
      "⚠️ Impossible de récupérer les données de la session.";
    return;
  }

  animateTotalMatches(globalStatsCache.totalMatches || 30);

  // 3️⃣ Lancer le diagnostic IA
  await updateDiagnostic();

  // 4️⃣ Initialiser la map
  initMap();

  // 5️⃣ Écoute des tabs
  tabsEls.forEach(function (tab) {
    tab.addEventListener("click", async function () {
      var tabName = tab.dataset.tab;
      await switchTab(tabName);
    });
  });
}
/* =======================================================
   FETCH STATS → Top30 et distribution
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

    return Object.assign({}, data, { top30: data.matches.slice(0, 30) });
  } catch (err) {
    console.error("[fetchStats] Error:", err);
    return null;
  }
}

/* =======================================================
   SWITCH TAB CENTRAL
======================================================= */
async function switchTab(tabName) {
  currentTab = tabName;
  tabsEls.forEach(function (t) {
    t.classList.remove("active");
  });
  var selectedTab = document.querySelector(
    ".reco-tab[data-tab='" + tabName + "']",
  );
  if (selectedTab) selectedTab.classList.add("active");

  await updateCentralContent();
}

/* =======================================================
   UPDATE CENTRAL CONTENT SELON TAB
======================================================= */
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

/* =======================================================
   DIAGNOSTIC IA GLOBAL
======================================================= */
async function updateDiagnostic() {
  try {
    centralEl.innerHTML = `<div class="loader"></div> Analyse IA en cours...`;

    // Récupérer le rôle utilisateur
    const raw = localStorage.getItem("agent_user");
    const user = raw ? JSON.parse(raw) : { role: "buyer" };
    const role = user.role || "buyer";

    // Préparer le prompt
    const prompt = `
Analyse la session immobilière actuelle.
Tu disposes des 30 meilleurs profils correspondants à l'utilisateur.
L'utilisateur est un <ROLE_UTILISATEUR> (${role}).

Pour chaque critère (ville, type, surface, budget, pièces), rédige un texte clair et détaillé en 3 paragraphes :
1. Synthèse des observations par critère, phrases complètes, pas de liste ni de symboles.
2. Diagnostic actionnable et conseils concrets pour améliorer les opportunités ou la pertinence des biens.
3. Recommandations pour maximiser la compatibilité globale et la sélection des biens, avec des suggestions stratégiques.
4. Synthèse globale de tous les critères et plan d'action en 3-5 phrases à la fin du texte

⚠️ Adapte le texte au rôle de l'utilisateur :
- Si c'est un buyer, parle des biens à acheter et de la compatibilité avec les offres disponibles, en améliorant la précision et la clarté du constat.
- Si c'est un seller, sois ultra-robuste : rédige strictement du point de vue du vendeur, analyse les profils d'acheteurs et leurs attentes, identifie les opportunités de vente, propose des suggestions de mise en marché concrètes et ne glisse jamais de formulations centrées sur l'acheteur ("votre budget", "vos critères", etc.). Adapte le ton pour qu'il soit professionnel, analytique et actionnable.

Optimise la qualité du constat et des recommandations pour les deux rôles.
Formate la réponse finale comme : { "message": "texte clair avec retours à la ligne" }.
`.replace("<ROLE_UTILISATEUR>", role);

    const context = {
      phase: "results",
      matchingProfiles: globalStatsCache.top30,
      role: role,
    };

    // Appel IA
    const aiResp = await sendMessageToAI(JSON.stringify({ prompt, context }));

    // Découper le texte en paragraphes, forcer au moins 3 paragraphes
    let paragraphs = aiResp.message
      ? aiResp.message.split(/\n{1,}/).filter((p) => p.trim() !== "")
      : [];
    while (paragraphs.length < 3) paragraphs.push(""); // padding si IA renvoie trop court

    paragraphs = paragraphs
      .map((p) => {
        let txt = p.trim();

        const importantWords = ["ville", "pièces", "budget", "surface", "type"];
        const highlightWords = [
          "compatibilité",
          "recommandations",
          "diagnostic",
          "sélection",
        ];

        importantWords.forEach((w, idx) => {
          if (idx < 4)
            txt = txt.replace(new RegExp(`\\b${w}\\b`, "gi"), "<b>$&</b>");
        });
        highlightWords.slice(0, 2).forEach((w) => {
          txt = txt.replace(new RegExp(`\\b${w}\\b`, "gi"), "<u>$&</u>");
        });

        return `<p style="margin-bottom:12px; line-height:1.5;">${txt}</p>`;
      })
      .join("");

    centralEl.innerHTML = `<div style="font-size:14px;">${paragraphs}</div>`;
  } catch (err) {
    console.error("[updateDiagnostic]", err);
    centralEl.innerHTML =
      "<p>⚠️ Une erreur est survenue lors de l'analyse IA.</p>";
  }
}
/* =======================================================
   GENERATE CRITERIA HTML
======================================================= */
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
    html +=
      "<tr><td>" +
      capitalize(crit) +
      "</td><td style='color:" +
      color +
      "; font-weight:600'>" +
      percent +
      "%</td><td>" +
      obs +
      "</td></tr>";
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
    html +=
      "<tr><td>" +
      capitalize(crit) +
      "</td><td>" +
      suggestion +
      "</td><td style='color:" +
      color +
      "; font-weight:600'>" +
      newCompat +
      "%</td></tr>";
  });

  html += "</table>";
  return html;
}

/* =======================================================
   LEAFLET MAP
======================================================= */
function initMap() {
  var mapContainer = document.getElementById("criteria-map");
  if (!mapContainer) return;

  mapInstance = L.map(mapContainer).setView([48.8566, 2.3522], 12); // Paris par défaut
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(mapInstance);
}

function updateMap(matches) {
  if (!mapInstance || !matches) return;

  mapInstance.eachLayer(function (layer) {
    if (layer instanceof L.Marker) mapInstance.removeLayer(layer);
  });

  matches.forEach(function (m) {
    if (m.lat && m.lng) {
      L.marker([m.lat, m.lng])
        .addTo(mapInstance)
        .bindPopup(
          "<b>" + (m.name || "Bien immobilier") + "</b><br/>" + (m.city || ""),
        );
    }
  });

  if (matches.length > 0) {
    var bounds = matches
      .filter(function (m) {
        return m.lat && m.lng;
      })
      .map(function (m) {
        return [m.lat, m.lng];
      });
    if (bounds.length > 0) mapInstance.fitBounds(bounds, { padding: [50, 50] });
  }
}

/* =======================================================
   ANIMATION TOTAL MATCHES
======================================================= */
function animateTotalMatches(total) {
  var container = document.createElement("div");
  container.style.cssText =
    "font-size:24px;font-weight:700;text-align:center;margin-bottom:15px;color:#333";
  container.innerText = "Analyse des 30 meilleurs profils (par session)";
  document.querySelector(".content-wrapper").prepend(container);
}

/* =======================================================
   CAPITALIZE
======================================================= */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* =======================================================
   INIT
======================================================= */
document.addEventListener("DOMContentLoaded", initRecommendations);
