// ================= CONFIG =================
const API_BASE =
  window.location.hostname === "localhost" ? "http://localhost:3000" : ""; // vide = même domaine en prod

function getToken() {
  const raw = localStorage.getItem("agent_user");
  if (!raw) return null;

  try {
    const user = JSON.parse(raw);
    return user.token;
  } catch {
    return null;
  }
}

// ================= STATE =================
let currentUser = null;
let favoris = [];

function logout() {
  // Supprime la session
  localStorage.removeItem("agent_user");

  // Réinitialise les variables locales
  currentUser = null;
  favoris = [];

  // Vider le DOM si besoin
  const container = document.querySelector(".favoris-grid");
  if (container) container.innerHTML = "";

  // Redirection vers la page d'accueil
  window.location.href = "index.html";

  console.log("[FAVORIS] Déconnecté");
}

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

// ================= HELPERS =================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function getUser() {
  const raw = localStorage.getItem("agent_user");
  return raw ? JSON.parse(raw) : null;
}

async function loadFavorisFromAPI() {
  try {
    const res = await fetch(`${API_BASE}/api/favorites`, {
      headers: {
        Authorization: "Bearer " + getToken(),
      },
    });

    if (!res.ok) {
      console.error("Erreur chargement favoris");
      return [];
    }

    return await res.json();
  } catch (e) {
    console.error("Erreur réseau chargement favoris", e);
    return [];
  }
}

// ================= RENDER MATCH CARD =================
// ================== CREATE FAVORITE MATCH CARD (CROIX EN HAUT DROITE) ==================
function createFavCard(m, index) {
  const row = document.createElement("div");
  row.className = "msg bot structured match-row";
  row.style.display = "flex";
  row.style.flexDirection = "column";
  row.style.marginBottom = "18px";
  row.style.opacity = 0;

  const bubble = document.createElement("div");
  bubble.className = "bubble match-card";
  bubble.style.position = "relative"; // pour positionner la croix

  const villeLabel = m.villeOriginal || m.ville || "Ville inconnue";
  const piecesLabel =
    (m.pieces ?? m.piecesMin)
      ? `${m.pieces ?? m.piecesMin} pièces`
      : "Pièces inconnues";
  const surfaceLabel =
    (m.surface ?? m.surfaceMin)
      ? `${m.surface ?? m.surfaceMin} m²`
      : "Surface inconnue";
  const pct = Number(m.compatibility ?? 0);

  const formatLabel = (label) =>
    label
      ?.replace(/ville/i, "Ville")
      .replace(/pièces/i, "Pièces")
      .replace(/surface/i, "Surface") ?? "";

  const commonHTML = (m.common ?? []).length
    ? m.common
        .map((c) => `<span class="pill pill-common">${formatLabel(c)}</span>`)
        .join("")
    : `<span class="pill pill-neutral">Aucun critère commun</span>`;

  const differentHTML = (m.different ?? []).length
    ? m.different
        .map(
          (d) => `<span class="pill pill-different">${formatLabel(d)}</span>`,
        )
        .join("")
    : `<span class="pill pill-neutral">Aucune différence</span>`;

  let priceLabel = "N/A";
  if (m.price != null) priceLabel = `${m.price} €`;
  else if (m.budget != null) priceLabel = `${m.budget} €`;
  else if (m.budgetMin != null && m.budgetMax != null)
    priceLabel =
      m.budgetMin === m.budgetMax
        ? `${m.budgetMin} €`
        : `${m.budgetMin} – ${m.budgetMax} €`;

  // ===== HTML de la carte =====
  bubble.innerHTML = `
    <div class="match-header">
      <div class="match-title"><strong>${m.type}</strong> – ${villeLabel}</div>
    </div>

    <button class="remove-fav-btn" data-index="${index}" 
      style="
        position: absolute;
        top: 8px;
        right: 8px;
        background: transparent;
        border: none;
        color: #aaa;
        font-size: 16px;
        cursor: pointer;
      ">
      ✕
    </button>

    <div class="match-details">
      <div class="detail-row"><span class="label">Prix</span><span class="value">${priceLabel}</span></div>
      <div class="detail-row"><span class="label">Pièces</span><span class="value">${piecesLabel}</span></div>
      <div class="detail-row"><span class="label">Surface</span><span class="value">${surfaceLabel}</span></div>
      <div class="detail-row"><span class="label">Contact</span><span class="value">${m.contact ?? "N/A"}</span></div>
    </div>

    <div class="match-criteria">
      <div class="criteria-group">
        <div class="criteria-title">Points communs</div>
        <div class="criteria-list">${commonHTML}</div>
      </div>
      <div class="criteria-group">
        <div class="criteria-title">Différences</div>
        <div class="criteria-list">${differentHTML}</div>
      </div>
    </div>

    <div class="match-footer">
      <div class="compat-container">
        <div class="compat-label">Compatibilité : <strong>${pct}%</strong></div>
        <div class="compat-bar"><div class="compat-bar-inner"></div></div>
      </div>
      <button class="voir-carte-btn"
        data-lat="${m.lat ?? m.buyerLat ?? 48.8566}"
        data-lng="${m.lng ?? m.buyerLng ?? 2.3522}"
        data-buyer-lat="${m.buyerLat ?? 48.8566}"
        data-buyer-lng="${m.buyerLng ?? 2.3522}"
        data-ville="${villeLabel}">
        Voir la carte
      </button>
    </div>
  `;

  row.appendChild(bubble);

  // ===== Bouton retirer favoris =====
  const removeBtn = bubble.querySelector(".remove-fav-btn");
  removeBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${API_BASE}/api/favorites/${m.contact}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${state.user?.token}` },
      });
      if (res.ok) row.remove();
    } catch (err) {
      console.error(err);
    }
  });

  // ===== Compatibilité =====
  requestAnimationFrame(() => {
    const bar = row.querySelector(".compat-bar-inner");
    if (bar) {
      bar.style.width = pct + "%";
      let r,
        g,
        b = 0;
      if (pct < 50) {
        r = 200 + (255 - 200) * (pct / 50);
        g = 80 + (190 - 80) * (pct / 50);
      } else {
        r = 255 - (255 - 60) * ((pct - 50) / 50);
        g = 190 - (190 - 130) * ((pct - 50) / 50);
      }
      bar.style.background = `linear-gradient(90deg, rgb(${Math.round(r)},${Math.round(g)},0), #7a5fff)`;
    }
    row.style.opacity = 1;
  });

  return row;
}
// ================= RENDER =================
function renderFavoris(list = favoris) {
  const container = $(".favoris-grid");
  container.innerHTML = "";
  list.forEach((m, i) => container.appendChild(createFavCard(m, i)));
  attachEvents();
}
// ================= EVENTS =================
function attachEvents() {
  // Supprimer favori
  $$(".remove-fav-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = parseInt(btn.dataset.index);
      const fav = favoris[index];

      await fetch(`${API_BASE}/api/favorites/${fav.dbId}`, {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + getToken(),
        },
      });

      favoris.splice(index, 1);
      renderFavoris();
    });
  });

  // Voir carte
  $$(".voir-carte-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const profileLat = parseFloat(btn.dataset.lat);
      const profileLng = parseFloat(btn.dataset.lng);
      const profileVille = btn.dataset.ville;
      const userLat = parseFloat(btn.dataset.buyerLat);
      const userLng = parseFloat(btn.dataset.buyerLng);

      const mapContainer = document.getElementById("map");
      if (!mapContainer) return;
      mapContainer.innerHTML = "";

      const modal = document.getElementById("mapModal");
      modal.style.display = "flex";
      document.body.classList.add("modal-open");

      const map = L.map("map").setView([userLat, userLng], 6);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const blueIcon = L.icon({
        iconUrl: "images/blue-marker.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      });

      const redIcon = L.icon({
        iconUrl: "images/red-marker.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      });

      const userMarker = L.marker([userLat, userLng], { icon: blueIcon })
        .addTo(map)
        .bindPopup("Vous / ville recherchée");

      const profileMarker = L.marker([profileLat, profileLng], {
        icon: redIcon,
      })
        .addTo(map)
        .bindPopup(profileVille);

      const distanceKm =
        map.distance([userLat, userLng], [profileLat, profileLng]) / 1000;

      let lineColor = "gray";
      if (distanceKm <= 110) lineColor = "green";
      else if (distanceKm <= 220) lineColor = "yellow";
      else lineColor = "red";

      L.polyline(
        [
          [userLat, userLng],
          [profileLat, profileLng],
        ],
        { color: lineColor, dashArray: "5,10", weight: 4 },
      ).addTo(map);

      const group = new L.featureGroup([userMarker, profileMarker]);
      map.fitBounds(group.getBounds().pad(0.2));

      L.tooltip({ permanent: true })
        .setContent(distanceKm.toFixed(1) + " km")
        .setLatLng([(userLat + profileLat) / 2, (userLng + profileLng) / 2])
        .addTo(map);

      document.getElementById("closeModal").onclick = () => {
        modal.style.display = "none";
        document.body.classList.remove("modal-open");
        map.remove();
      };
    });
  });
}

// ================= SEARCH =================
function initSearch() {
  const input = $(".search-bar");
  input.addEventListener("input", () => {
    const value = input.value.toLowerCase();
    const filtered = favoris.filter(
      (f) =>
        f.ville?.toLowerCase().includes(value) ||
        f.type?.toLowerCase().includes(value),
    );
    renderFavoris(filtered);
  });
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", () => {
  currentUser = getUser();
  if (!currentUser) {
    window.location.href = "index.html";
    return;
  }

  loadFavorisFromAPI().then((data) => {
    favoris = data;
    renderFavoris();
  });
  initSearch();

  // === Lien bouton déconnexion ===
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
});
