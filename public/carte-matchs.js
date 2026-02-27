// carte-matchs.js - version animée + heatmap + filtres interactifs

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
async function fetchStats() {
  try {
    // Récupération brute du localStorage
    const raw = localStorage.getItem("agent_user");
    if (!raw) throw new Error("Token manquant");

    // Parse le JSON pour obtenir l'objet et le token JWT
    let token;
    try {
      const user = JSON.parse(raw);
      token = user.token;
      if (!token)
        throw new Error("Token JWT manquant dans l'objet localStorage");
    } catch (parseErr) {
      throw new Error("Erreur lors du parsing du token depuis localStorage");
    }

    // Appel à l'API avec le token JWT correct
    const res = await fetch("/api/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Vérification du statut HTTP
    if (!res.ok) throw new Error(`Erreur API: ${res.status}`);

    // Lecture des données JSON
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("[Carte Matchs] fetchStats error:", err);
    return null;
  }
}
function getColorByCompatibility(c) {
  if (c >= 80) return "#4caf50";
  if (c >= 60) return "#2196f3";
  if (c >= 40) return "#ff9800";
  return "#f44336";
}

// Créer les filtres interactifs
function createFilterControls(container, applyFiltersCallback) {
  const filtersDiv = document.createElement("div");

  // Styles structurels à garder
  filtersDiv.style.display = "flex";
  filtersDiv.style.gap = "15px";
  filtersDiv.style.marginBottom = "20px";
  filtersDiv.style.flexWrap = "wrap";
  filtersDiv.style.padding = "12px";
  filtersDiv.style.borderRadius = "15px";

  // Styles visuels à remplacer/ajouter
  filtersDiv.style.background = "rgba(255, 255, 255, 0.12)";
  filtersDiv.style.backdropFilter = "blur(14px)";
  filtersDiv.style.webkitBackdropFilter = "blur(14px)";
  filtersDiv.style.border = "1px solid rgba(255, 255, 255, 0.25)";
  filtersDiv.style.boxShadow = "0 8px 32px rgba(31, 38, 135, 0.25)";
  filtersDiv.style.color = "#ffffff";

  filtersDiv.innerHTML = `
    <label>Compatibilité min: <input type="number" id="filterCompat" value="0" min="0" max="100" step="5"/></label>
    <label>Type: 
      <select id="filterType">
        <option value="">Tous</option>
        <option value="appartement">Appartement</option>
        <option value="maison">Maison</option>
      </select>
    </label>
    <label>Prix min: <input type="number" id="filterPriceMin" value="0" min="0"/></label>
    <label>Prix max: <input type="number" id="filterPriceMax" value="1000000" min="0"/></label>
    <button id="applyFiltersBtn">Appliquer</button>
  `;

  container.prepend(filtersDiv);

  document.getElementById("applyFiltersBtn").addEventListener("click", () => {
    const filters = {
      compatMin: Number(document.getElementById("filterCompat").value) || 0,
      type: document.getElementById("filterType").value,
      priceMin: Number(document.getElementById("filterPriceMin").value) || 0,
      priceMax:
        Number(document.getElementById("filterPriceMax").value) || Infinity,
    };
    applyFiltersCallback(filters);
  });
}

function createMap(matches) {
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

  const statsDiv = document.createElement("div");
  statsDiv.style.marginTop = "20px";
  statsDiv.style.padding = "15px";
  statsDiv.style.borderRadius = "15px";

  statsDiv.style.background =
    "linear-gradient(135deg, #8fc2ff 0%, #e6a6f5 100%)";
  statsDiv.style.color = "#ffffff";
  statsDiv.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  statsDiv.style.boxShadow = "0 15px 40px rgba(0, 0, 0, 0.25)";
  document.querySelector(".content-wrapper").appendChild(statsDiv);

  function renderMap(filteredMatches) {
    markersGroup.clearLayers();
    heatLayer.setLatLngs([]);

    filteredMatches.forEach((m, index) => {
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

        const popupContent = `
          <b>${m.username}</b> (${m.type})<br/>
          Ville: ${m.ville}<br/>
          Prix: ${m.price} €<br/>
          Pièces: ${m.pieces}<br/>
          Surface: ${m.surface} m²<br/>
          Compatibilité: ${m.compatibility}%<br/>
          Score: ${m.score}<br/>
          <b>Points communs:</b> ${m.common.join(", ")}<br/>
          <b>Différences:</b> ${m.different.join(", ")}
        `;

        marker.bindPopup(popupContent);
      }, index * 50);
    });

    if (filteredMatches.length > 0) {
      const totalMatches = filteredMatches.length;
      const avgCompat = Math.round(
        filteredMatches.reduce((sum, m) => sum + (m.compatibility || 0), 0) /
          totalMatches,
      );
      const topMatch = filteredMatches.sort(
        (a, b) => b.compatibility - a.compatibility,
      )[0];

      statsDiv.innerHTML = `
        <h3>Résumé des Matchs</h3>
        <p><b>Total de profils:</b> ${totalMatches}</p>
        <p><b>Compatibilité moyenne:</b> ${avgCompat}%</p>
        <p><b>Profil le plus compatible:</b> ${topMatch ? topMatch.username : "N/A"} (${topMatch ? topMatch.compatibility : 0}%)</p>
      `;
    } else {
      statsDiv.innerHTML = `<p>Aucun match pour les filtres sélectionnés.</p>`;
    }

    map.addLayer(markersGroup);
  }

  // Initial render
  renderMap(matches);

  // Ajouter filtres interactifs
  createFilterControls(
    document.querySelector(".content-wrapper"),
    (filters) => {
      const filtered = matches.filter(
        (m) =>
          m.compatibility >= filters.compatMin &&
          (!filters.type || m.type === filters.type) &&
          m.price >= filters.priceMin &&
          m.price <= filters.priceMax,
      );
      renderMap(filtered);
    },
  );
}

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

  createMap(stats.matches);
}

document.addEventListener("DOMContentLoaded", init);
