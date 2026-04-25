/**
 * favoris.js - Dashboard Premium AiGENT
 */

const API_BASE = window.location.origin;
let currentUser = null;
let favoris = [];
let mapInstance = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = JSON.parse(localStorage.getItem("agent_user"));

  if (!currentUser || !currentUser.token) {
    window.location.href = "index.html";
    return;
  }

  if ($("user-welcome")) {
    $("user-welcome").textContent = `Session : ${currentUser.username}`;
  }

  initTheme();
  initSidebar();
  initSearch();
  await refreshFavoris();

  const btnLogout = $("btn-logout");
  if (btnLogout) {
    btnLogout.classList.remove("hidden");
    btnLogout.addEventListener("click", logout);
  }
});

// ================== THEME ==================
function initTheme() {
  const btnTheme = $("btn-theme");
  const html = document.documentElement;
  const savedTheme = localStorage.getItem("aigent_theme") || "dark";
  html.setAttribute("data-theme", savedTheme);

  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const current = html.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
      localStorage.setItem("aigent_theme", next);
    });
  }
}

// ================== DATA ==================
async function refreshFavoris() {
  try {
    const res = await fetch(`${API_BASE}/api/favorites`, {
      headers: { Authorization: `Bearer ${currentUser.token}` },
    });
    if (!res.ok) throw new Error("Erreur");
    favoris = await res.json();
    renderFavoris(favoris);
    updateStats(favoris);
  } catch (err) {
    console.error(err);
    updateStats([]);
  }
}

function updateStats(list) {
  if ($("count-total")) $("count-total").textContent = list.length;

  if ($("avg-compat")) {
    const avg =
      list.length > 0
        ? Math.round(
            list.reduce((acc, f) => acc + (Number(f.compatibility) || 0), 0) /
              list.length,
          )
        : 0;
    $("avg-compat").textContent = `${avg}%`;
  }

  const emptyState = $("empty-state");
  const grid = $("favoris-grid");

  if (list.length === 0) {
    if (emptyState) emptyState.style.display = "flex";
    if (grid) grid.style.display = "none";
  } else {
    if (emptyState) emptyState.style.display = "none";
    if (grid) grid.style.display = "grid";
  }
}

// ================== RENDU CARDS — IDENTIQUE ACCUEIL ==================
function renderFavoris(list) {
  const grid = $("favoris-grid");
  if (!grid) return;
  grid.innerHTML = "";
  list.forEach((m, i) => grid.appendChild(createFavCard(m, i)));
}

function formatEtatBien(etat) {
  const MAP = {
    neuf: "Neuf",
    renove: "Rénové",
    bon: "Bon état",
    a_rafraichir: "À rafraîchir",
    travaux: "Travaux à prévoir",
  };
  return MAP[etat] || "Non renseigné";
}

function parseImages(img) {
  if (!img) return [];
  if (Array.isArray(img)) return img;
  try {
    return JSON.parse(img);
  } catch {
    return [];
  }
}

function createFavCard(m, index) {
  const row = document.createElement("div");
  row.className = "msg bot structured";
  row.style.animationDelay = `${index * 0.05}s`;

  const bubble = document.createElement("div");
  bubble.className = "bubble match-card";

  const ville = m.villeOriginal || m.ville || "Ville inconnue";
  const dep = m.departement ? ` (${m.departement})` : "";
  const villeLabel = ville + dep;

  const pct = Number(m.compatibility ?? 0);

  // Prix selon rôle
  let priceLabel = "N/A";
  if (m.role === "buyer") {
    if (m.budgetMin != null && m.budgetMax != null) {
      priceLabel =
        m.budgetMin === m.budgetMax
          ? `${m.budgetMin} €`
          : `${m.budgetMin} – ${m.budgetMax} €`;
    } else if (m.budgetMin != null) {
      priceLabel = `${m.budgetMin} €`;
    }
  } else {
    if (m.price != null) priceLabel = `${m.price} €`;
    else if (m.budgetMax != null) priceLabel = `${m.budgetMax} €`;
  }

  const surfaceLabel =
    (m.surface ?? m.surfaceMin) ? `${m.surface ?? m.surfaceMin} m²` : "N/A";
  const piecesLabel =
    (m.pieces ?? m.piecesMin) ? `${m.pieces ?? m.piecesMin} p.` : "N/A";

  // Coordonnées — priorité lat/lng du bien, fallback buyerLat/buyerLng
  const matchLat = m.lat ?? m.buyerLat ?? 48.8566;
  const matchLng = m.lng ?? m.buyerLng ?? 2.3522;
  const buyerLat = m.buyerLat ?? m.lat ?? 48.8566;
  const buyerLng = m.buyerLng ?? m.lng ?? 2.3522;

  bubble.innerHTML = `
    <div class="match-header">
      <div class="match-title"><strong>${m.type || "Bien"}</strong> – ${villeLabel}</div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${m.role === "seller" ? `<button class="details-btn" aria-label="Voir détails">ℹ️</button>` : ""}
        <button class="btn-remove-fav" data-contact="${m.contact}" aria-label="Supprimer des favoris">
          <svg viewBox="0 0 24 24" fill="none" width="13" height="13">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="match-details">
      <div class="detail-row"><span>Prix</span><strong>${priceLabel}</strong></div>
      <div class="detail-row"><span>Surface</span><strong>${surfaceLabel}</strong></div>
      <div class="detail-row"><span>Pièces</span><strong>${piecesLabel}</strong></div>
      <div class="detail-row"><span>Contact</span><strong>${m.contact || "N/A"}</strong></div>
    </div>

    <div class="match-criteria">
      <div class="criteria-list">
        ${(m.common || []).map((c) => `<span class="pill pill-common">${c}</span>`).join("")}
        ${(m.different || []).map((d) => `<span class="pill pill-different">${d}</span>`).join("")}
      </div>
    </div>

    <div class="match-footer">
      <div class="compat-container">
        <div class="compat-label">${pct}%</div>
        <div class="compat-bar">
          <div class="compat-bar-inner" style="width:${pct}%"></div>
        </div>
      </div>
      <button class="voir-carte-btn"
        data-lat="${matchLat}"
        data-lng="${matchLng}"
        data-buyer-lat="${buyerLat}"
        data-buyer-lng="${buyerLng}"
        data-ville="${villeLabel}">Carte</button>
    </div>
  `;

  // Modal détails vendeur
  if (m.role === "seller") {
    const detailsBtn = bubble.querySelector(".details-btn");
    const images = [
      ...parseImages(m.imagesbien),
      ...parseImages(m.images),
    ].filter(Boolean);

    const modalOverlay = document.createElement("div");
    modalOverlay.className = "details-modal-overlay";
    modalOverlay.innerHTML = `
      <div class="details-popup-content" onclick="event.stopPropagation()">
        <div class="details-header">
          Détails de l'annonce
          <button class="close-details-btn">&times;</button>
        </div>
        ${
          images.length > 0
            ? `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:12px;">
               ${images.map((img) => `<img src="${img}" class="carousel-img" style="height:140px;width:auto;flex-shrink:0;border-radius:8px;object-fit:cover;" />`).join("")}
             </div>`
            : `<div style="padding:16px 0;text-align:center;color:var(--text-muted);font-style:italic;font-size:13px;">Aucune image disponible</div>`
        }
        <div class="details-grid">
          <div class="feature-item"><span>État</span><strong>${formatEtatBien(m.etatBien)}</strong></div>
          <div class="feature-item"><span>DPE</span><strong>${m.niveauEnergetique || "N/A"}</strong></div>
          <div class="feature-item"><span>Charges</span><strong>${m.charges ?? "N/A"}</strong></div>
          <div class="feature-item"><span>Taxe Foncière</span><strong>${m.taxeFonciere ?? "N/A"}</strong></div>
        </div>
      </div>`;
    document.body.appendChild(modalOverlay);

    detailsBtn.addEventListener("click", () => {
      modalOverlay.style.display = "flex";
    });
    modalOverlay.addEventListener("click", () => {
      modalOverlay.style.display = "none";
    });
    modalOverlay
      .querySelector(".close-details-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        modalOverlay.style.display = "none";
      });
  }

  // Suppression favoris
  bubble.querySelector(".btn-remove-fav").addEventListener("click", (e) => {
    deleteFavori(m.contact, row);
  });

  // Carte Leaflet — signature identique accueil
  bubble.querySelector(".voir-carte-btn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    openMap(
      parseFloat(btn.dataset.lat),
      parseFloat(btn.dataset.lng),
      parseFloat(btn.dataset.buyerLat),
      parseFloat(btn.dataset.buyerLng),
      btn.dataset.ville,
    );
  });

  row.appendChild(bubble);
  return row;
}

// ================== SUPPRESSION ==================
async function deleteFavori(contact, cardElement) {
  if (!confirm("Retirer ce profil de vos favoris ?")) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/favorites/${encodeURIComponent(contact)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${currentUser.token}` },
      },
    );

    if (res.ok) {
      cardElement.style.transform = "scale(0.9) translateY(20px)";
      cardElement.style.opacity = "0";
      cardElement.style.transition = "all 0.3s ease";
      setTimeout(() => {
        cardElement.remove();
        favoris = favoris.filter((f) => f.contact !== contact);
        updateStats(favoris);
      }, 300);
    }
  } catch (err) {
    console.error("Erreur suppression:", err);
  }
}

// ================== RECHERCHE ==================
function initSearch() {
  const searchInput = $("fav-search");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const val = e.target.value.toLowerCase();
    const filtered = favoris.filter(
      (f) =>
        (f.ville || "").toLowerCase().includes(val) ||
        (f.type || "").toLowerCase().includes(val),
    );
    renderFavoris(filtered);
    updateStats(filtered);
  });
}

// ================== LOGOUT ==================
function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}

// ================== SIDEBAR ==================
function initSidebar() {
  const sidebar = $("sidebar");
  const openBtn = $("openSidebar");
  const closeBtn = $("closeSidebar");
  const overlay = $("sidebarOverlay");

  const toggle = (isOpen) => {
    sidebar?.classList.toggle("open", isOpen);
    overlay?.classList.toggle("active", isOpen);
    if (openBtn) openBtn.style.display = isOpen ? "none" : "flex";
  };

  openBtn?.addEventListener("click", () => toggle(true));
  closeBtn?.addEventListener("click", () => toggle(false));
  overlay?.addEventListener("click", () => toggle(false));
}

// ================== CARTE LEAFLET — SIGNATURE ==================
// ================== CARTE LEAFLET — SIGNATURE ==================
// APRÈS — complet
function openMap(matchLat, matchLng, userLat, userLng, ville) {
  const modal = $("mapModal");
  const closeM = $("closeModal");
  if (!modal) return;

  // Détruire instance précédente proprement
  if (mapInstance !== null) {
    try {
      mapInstance.remove();
    } catch {}
    mapInstance = null;
  }

  const mapEl = $("map");
  if (!mapEl) return;
  mapEl.innerHTML = "";

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";

  // Correction coordonnées identiques (même bug vendeur que chatbot)
  const coordsAreSame =
    Math.abs(matchLat - userLat) < 0.0001 &&
    Math.abs(matchLng - userLng) < 0.0001;

  if (coordsAreSame) {
    // Fallback : décaler légèrement pour avoir deux points visibles
    userLat = matchLat + 0.05;
    userLng = matchLng + 0.05;
  }

  const centerLat = (matchLat + userLat) / 2;
  const centerLng = (matchLng + userLng) / 2;

  mapInstance = L.map("map").setView([centerLat, centerLng], 11);

  // Force le rendu après ouverture de la modal
  setTimeout(() => mapInstance.invalidateSize(), 150);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
  }).addTo(mapInstance);

  // Distance Haversine
  const R = 6371;
  const dLat = ((matchLat - userLat) * Math.PI) / 180;
  const dLng = ((matchLng - userLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((userLat * Math.PI) / 180) *
      Math.cos((matchLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const distanceKm = Math.round(
    R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );

  const lineColor =
    distanceKm <= 5
      ? "#6ee7b7"
      : distanceKm <= 15
        ? "#818cf8"
        : distanceKm <= 40
          ? "#a78bfa"
          : "#f472b6";

  // Ligne pointillée colorée
  L.polyline(
    [
      [userLat, userLng],
      [matchLat, matchLng],
    ],
    { color: lineColor, weight: 2.5, dashArray: "6 5", opacity: 0.85 },
  ).addTo(mapInstance);

  // Marqueur bleu — position utilisateur/acheteur (identique chatbot.js)
  const userIcon = L.divIcon({
    html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);box-shadow:0 0 0 3px rgba(99,102,241,0.35),0 4px 12px rgba(99,102,241,0.5);"><svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

  // Marqueur rose — le bien/profil matché (identique chatbot.js)
  const matchIcon = L.divIcon({
    html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#c084fc,#f472b6);clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);box-shadow:0 0 0 3px rgba(192,132,252,0.35),0 4px 12px rgba(244,114,182,0.5);"><svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>`,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });

  const userMarker = L.marker([userLat, userLng], { icon: userIcon })
    .addTo(mapInstance)
    .bindPopup(
      `<strong>📍 Ma recherche</strong><br><span style="font-size:11px;opacity:0.7">Votre position</span>`,
    )
    .openPopup();

  const matchMarker = L.marker([matchLat, matchLng], { icon: matchIcon })
    .addTo(mapInstance)
    .bindPopup(
      `<strong>🏠 ${ville}</strong><br>` +
        `<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:20px;` +
        `background:${lineColor}22;color:${lineColor};font-size:11px;font-weight:600;` +
        `border:1px solid ${lineColor}44;">${distanceKm} km</span>`,
    );

  // Fit bounds sur les deux marqueurs
  mapInstance.fitBounds(
    [
      [userLat, userLng],
      [matchLat, matchLng],
    ],
    { padding: [40, 40] },
  );

  const closeAction = () => {
    modal.style.display = "none";
    document.body.style.overflow = "auto";
    if (mapInstance) {
      try {
        mapInstance.remove();
      } catch {}
      mapInstance = null;
    }
  };

  closeM.onclick = closeAction;
  modal.onclick = (e) => {
    if (e.target === modal) closeAction();
  };
}
