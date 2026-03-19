// carte-matchs.js - version animée + heatmap + filtres interactif
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
    openBtn.style.display = "none";
  });
}

if (closeBtn && sidebar && overlay) {
  closeBtn.addEventListener("click", () => {
    console.log("[SIDEBAR] Fermeture menu");
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    openBtn.style.display = "flex";
  });
}

if (overlay && sidebar) {
  overlay.addEventListener("click", () => {
    console.log("[SIDEBAR] Fermeture menu via overlay");
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    openBtn.style.display = "flex";
  });
}
// ==========================
// FETCH STATS
// ==========================
async function fetchStats() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) throw new Error("Token manquant");

    let token;
    let user;

    try {
      user = JSON.parse(raw);
      token = user.token;
      if (!token) throw new Error("Token JWT manquant");
    } catch (e) {
      throw new Error("Erreur parsing localStorage");
    }

    const res = await fetch("/api/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Erreur API: ${res.status}`);

    const data = await res.json();

    return {
      ...data,
      currentUser: user, // IMPORTANT → on injecte le user ici
    };
  } catch (err) {
    console.error("[Carte Matchs] fetchStats error:", err);
    return null;
  }
}

// ==========================
// COULEUR COMPATIBILITÉ
// ==========================
function getColorByCompatibility(c) {
  if (c >= 80) return "#4caf50";
  if (c >= 60) return "#2196f3";
  if (c >= 40) return "#ff9800";
  return "#f44336";
}

// ==========================
// CARTE
// ==========================
function createMap(matches, currentUser) {
  const role = currentUser?.role;

  // Valeurs perso importantes
  const myBudget = currentUser?.budgetMax || currentUser?.budget || 0;
  const myPrice = currentUser?.price || 0;

  const defaultLatLng = [46.6, 2.5];
  const firstMatch = matches[0];

  const mapCenter = firstMatch
    ? [firstMatch.lat || defaultLatLng[0], firstMatch.lng || defaultLatLng[1]]
    : defaultLatLng;

  const map = L.map("map").setView(mapCenter, 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const markersGroup = L.markerClusterGroup();

  const heatLayer = L.heatLayer([], {
    radius: 25,
    blur: 15,
    maxZoom: 12,
    gradient: { 0.3: "blue", 0.5: "lime", 0.7: "orange", 1: "red" },
  }).addTo(map);

  // ==========================
  // PANEL DATA
  // ==========================
  const dataPanel = document.querySelector(".map-data-panel");

  function updateDashboard(data) {
    const total = data.length;

    const avg =
      total > 0
        ? Math.round(
            data.reduce((sum, m) => sum + (m.compatibility || 0), 0) / total,
          )
        : 0;

    const cityCount = {};
    data.forEach((m) => {
      if (m.ville) {
        cityCount[m.ville] = (cityCount[m.ville] || 0) + 1;
      }
    });

    let dominantCity = "N/A";
    let max = 0;

    for (const city in cityCount) {
      if (cityCount[city] > max) {
        max = cityCount[city];
        dominantCity = city;
      }
    }

    if (dataPanel) {
      dataPanel.innerHTML = `
        <div class="data-card">
          <h3>Matchs affichés</h3>
          <p>${total}</p>
        </div>
        <div class="data-card">
          <h3>Score moyen</h3>
          <p>${avg}%</p>
        </div>
        <div class="data-card">
          <h3>Zone dominante</h3>
          <p>${dominantCity}</p>
        </div>
      `;
    }
  }

  // ==========================
  // NORMALISATION DONNÉES MATCH
  // ==========================
  function enrichMatch(m) {
    return {
      ...m,

      // 🔥 valeur réelle selon rôle
      displayPrice:
        role === "buyer"
          ? m.price // prix bien
          : m.price, // budget acheteur (hack back)

      // 🔥 type logique de valeur
      isBuyerBudget: role === "seller",
    };
  }

  function renderMap(filteredMatches) {
    markersGroup.clearLayers();
    heatLayer.setLatLngs([]);

    filteredMatches.forEach((rawMatch, index) => {
      const m = enrichMatch(rawMatch);

      if (!m.lat || !m.lng) return;

      heatLayer.addLatLng([m.lat, m.lng, m.compatibility || 0.5]);

      setTimeout(() => {
        const color = getColorByCompatibility(m.compatibility);

        const marker = L.circleMarker([m.lat, m.lng], {
          radius: 9,
          fillColor: color,
          color: "#fff",
          weight: 1.5,
          opacity: 0,
          fillOpacity: 0.85,
        }).addTo(markersGroup);

        let opacity = 0;
        const fadeInterval = setInterval(() => {
          opacity += 0.05;
          marker.setStyle({ opacity });
          if (opacity >= 1) clearInterval(fadeInterval);
        }, 20);

        // 🔥 TEXTE ADAPTÉ AU ROLE
        const priceLabel =
          role === "buyer" ? "Prix du bien" : "Budget acheteur";

        const popupContent = `
          <b>${m.username}</b> (${m.type})<br/>
          Ville: ${m.ville}<br/>
          ${priceLabel}: ${m.displayPrice} €<br/>
          Pièces: ${m.pieces}<br/>
          Surface: ${m.surface} m²<br/>
          Compatibilité: ${m.compatibility || 0}%<br/>
          Score: ${m.score}<br/>
          <b>Points communs:</b> ${m.common?.join(", ") || ""}<br/>
          <b>Différences:</b> ${m.different?.join(", ") || ""}
        `;

        marker.bindPopup(popupContent);
      }, index * 50);
    });

    updateDashboard(filteredMatches);
    map.addLayer(markersGroup);
  }

  // Initial render
  renderMap(matches);

  // ==========================
  // FILTRES
  // ==========================
  const scoreInput = document.getElementById("filterScore");
  const typeInput = document.getElementById("filterType");
  const budgetInput = document.getElementById("filterBudget");
  const resetBtn = document.getElementById("resetFilters");
  const scoreValue = document.getElementById("scoreValue");

  // 🔥 UI dynamique selon rôle
  if (budgetInput) {
    const label = document.querySelector("label[for='filterBudget']");
    if (label) {
      label.textContent =
        role === "buyer" ? "Budget maximum" : "Budget minimum acheteur";
    }
  }

  scoreInput.addEventListener("input", () => {
    scoreValue.textContent = scoreInput.value + "%";
    applyFilters();
  });

  typeInput.addEventListener("change", applyFilters);
  budgetInput.addEventListener("input", applyFilters);

  resetBtn.addEventListener("click", () => {
    scoreInput.value = 0;
    typeInput.value = "all";
    budgetInput.value = "";
    scoreValue.textContent = "0%";

    renderMap(matches);
  });

  // ==========================
  // LOGIQUE FILTRAGE (ULTRA PROPRE)
  // ==========================
  function applyFilters() {
    const compatMin = parseInt(scoreInput.value) || 0;
    const type = typeInput.value;
    const budgetValue = parseInt(budgetInput.value);

    const filtered = matches.filter((m) => {
      // base commune
      if ((m.compatibility || 0) < compatMin) return false;
      if (type !== "all" && m.type !== type) return false;

      // ===== LOGIQUE MÉTIER =====

      // 👤 ACHETEUR
      if (role === "buyer") {
        if (!budgetValue) return true;
        return (m.price || 0) <= budgetValue;
      }

      // 🏠 VENDEUR
      if (role === "seller") {
        if (!budgetValue) return true;
        return (m.price || 0) >= budgetValue;
      }

      return true;
    });

    renderMap(filtered);
  }
}

// ==========================
// INIT
// ==========================
async function init() {
  const stats = await fetchStats();

  if (!stats || !stats.matches || stats.matches.length === 0) {
    const msg = document.createElement("p");
    msg.innerText = "Aucun match disponible pour affichage sur la carte.";
    msg.style.textAlign = "center";
    msg.style.fontSize = "18px";
    msg.style.marginTop = "20px";

    document.querySelector(".content-wrapper").appendChild(msg);
    return;
  }

  createMap(stats.matches, stats.currentUser);
}

document.addEventListener("DOMContentLoaded", init);
