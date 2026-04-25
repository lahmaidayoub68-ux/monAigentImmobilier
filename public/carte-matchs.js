/**
 * carte-matchs.js - Dashboard Premium
 */

let map, heatLayer, markersLayer;
let allMatches = [];
let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = JSON.parse(localStorage.getItem("agent_user"));
  if (!currentUser) return (window.location.href = "index.html");

  initTheme();
  initSidebar();
  await initMapDashboard();
});

function initTheme() {
  const btn = document.getElementById("btn-theme");
  const html = document.documentElement;
  const update = (t) => html.setAttribute("data-theme", t);

  btn.addEventListener("click", () => {
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    update(next);
    localStorage.setItem("aigent_theme", next);
  });
  update(localStorage.getItem("aigent_theme") || "dark");
}

async function initMapDashboard() {
  // 1. Fetch data
  try {
    const res = await fetch("/api/stats", {
      headers: { Authorization: `Bearer ${currentUser.token}` },
    });
    const data = await res.json();
    allMatches = data.matches || [];

    // 2. Setup Leaflet
    const center =
      allMatches.length > 0
        ? [allMatches[0].lat, allMatches[0].lng]
        : [46.6, 2.5];
    map = L.map("map", { zoomControl: false }).setView(center, 6);

    // Style de carte sombre par défaut
    // APRÈS — OSM France (labels français natifs)
    L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a> France',
      subdomains: "abc",
      maxZoom: 20,
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);

    // 3. Heatmap Style Signature (Rose/Violet)
    // APRÈS — gradient progressif foncé→clair, style signature, visible mais subtil
    if (typeof L.heatLayer === "function") {
      heatLayer = L.heatLayer([], {
        radius: 40,
        blur: 28,
        maxZoom: 12,
        max: 1.0,
        minOpacity: 0.25, // ← plancher de visibilité même zones peu denses
        gradient: {
          0.0: "#1e1b4b", // indigo très foncé — zones quasi vides
          0.2: "#3730a3", // indigo foncé
          0.4: "#6366f1", // indigo vif
          0.6: "#8b5cf6", // violet
          0.8: "#c084fc", // violet clair
          1.0: "#f472b6", // rose — zones très denses
        },
      }).addTo(map);
    } else {
      console.warn("[MAP] leaflet.heat.js non chargé — heatmap désactivé");
    }
    renderData(allMatches);
    initFilters();
  } catch (e) {
    console.error(e);
  }
}

function renderData(matches) {
  markersLayer.clearLayers();
  const heatData = [];

  matches.forEach((m) => {
    if (!m.lat || !m.lng) return;

    // Signature Marker: DivIcon SVG Pulsant
    // APRÈS — marker SVG inline avec halo animé
    const compat = m.compatibility || 50;
    const markerColor =
      compat >= 75 ? "#f472b6" : compat >= 50 ? "#8b5cf6" : "#6366f1";

    const icon = L.divIcon({
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: `
    <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
      <!-- Halo pulsant -->
      <div style="
        position:absolute;
        width:28px;height:28px;
        border-radius:50%;
        background:${markerColor};
        opacity:0.25;
        animation:markerPulse 2s ease-out infinite;
      "></div>
      <!-- Point central -->
      <div style="
        width:12px;height:12px;
        border-radius:50%;
        background:${markerColor};
        border:2px solid rgba(255,255,255,0.9);
        box-shadow:0 0 8px ${markerColor};
        position:relative;
        z-index:1;
      "></div>
    </div>
  `,
    });

    const marker = L.marker([m.lat, m.lng], { icon }).addTo(markersLayer);

    // Popup stylé
    marker.bindPopup(`
            <div style="font-family:'Segoe UI'; padding:10px;">
                <strong style="color:#7c3aed; font-size:14px;">${m.type} - ${m.ville}</strong><br>
                <div style="margin-top:5px; font-size:12px;">
                    Score: <b>${m.compatibility}%</b><br>
                    Prix: ${m.price || m.budgetMax} €
                </div>
            </div>
        `);
    heatData.push([
      parseFloat(m.lat),
      parseFloat(m.lng),
      Math.max(0.4, m.compatibility / 100), // floor à 0.4 sinon invisible
    ]);
  });
  if (heatLayer && heatData.length > 0) {
    heatLayer.setLatLngs(heatData);
    heatLayer.redraw(); // force le rendu
  }
  updateStats(matches);
}

function updateStats(list) {
  document.getElementById("stat-count").textContent = list.length;
  const avg =
    list.length > 0
      ? Math.round(
          list.reduce((acc, m) => acc + m.compatibility, 0) / list.length,
        )
      : 0;
  document.getElementById("stat-avg").textContent = `${avg}%`;

  // Zone dominante
  const counts = {};
  list.forEach((m) => (counts[m.ville] = (counts[m.ville] || 0) + 1));
  const topZone = Object.keys(counts).reduce(
    (a, b) => (counts[a] > counts[b] ? a : b),
    "N/A",
  );
  document.getElementById("stat-zone").textContent = topZone;
}

function initFilters() {
  const scoreIn = document.getElementById("filterScore");
  const typeIn = document.getElementById("filterType");
  const scoreVal = document.getElementById("scoreValue");

  const apply = () => {
    const min = parseInt(scoreIn.value);
    const type = typeIn.value;
    scoreVal.textContent = min + "%";

    const filtered = allMatches.filter((m) => {
      return (
        m.compatibility >= min &&
        (type === "all" || m.type.toLowerCase() === type)
      );
    });
    renderData(filtered);
  };

  scoreIn.addEventListener("input", apply);
  typeIn.addEventListener("change", apply);
  document.getElementById("resetFilters").onclick = () => {
    scoreIn.value = 0;
    typeIn.value = "all";
    apply();
  };
}

function initSidebar() {
  const side = document.getElementById("sidebar");
  const open = document.getElementById("openSidebar");
  const close = document.getElementById("closeSidebar");
  const over = document.getElementById("sidebarOverlay");

  const toggle = (st) => {
    side.classList.toggle("open", st);
    over.classList.toggle("active", st);
  };
  open.onclick = () => toggle(true);
  close.onclick = () => toggle(false);
  over.onclick = () => toggle(false);
}
