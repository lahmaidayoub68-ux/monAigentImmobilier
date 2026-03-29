// ================== CONFIG ==================
const API_BASE = window.location.origin;
const MAX_HISTORY = 50;

const ROLE_LABELS = {
  buyer: "Acheteur",
  seller: "Vendeur",
};
// ================== STATE ==================
const state = {
  user: null, // { username, token, role, contact }
  role: null, // buyer / seller
  criteria: {},
  history: [],
  sending: false,
  ready: false,
};
function normalizeCriteria(c) {
  const surface = c.surface ?? c.surfaceMin ?? null;

  return {
    ville: c.ville ?? null,
    budget: c.budget ?? c.budgetMax ?? c.budgetMin ?? null,
    surface: surface,
    surfaceMin: surface,
    pieces: c.pieces ?? c.piecesMin ?? null,
    toleranceKm: c.toleranceKm ?? 0,
  };
}

// ================== DOM ==================
const $ = (id) => document.getElementById(id);
// ================== AI PANEL DOM ==================
const AI = {
  ville: () => document.querySelector(".ai-block:nth-child(1) li:nth-child(1)"),
  budget: () =>
    document.querySelector(".ai-block:nth-child(1) li:nth-child(2)"),
  surface: () =>
    document.querySelector(".ai-block:nth-child(1) li:nth-child(3)"),
  pieces: () =>
    document.querySelector(".ai-block:nth-child(1) li:nth-child(4)"),
  statut: () => document.querySelector(".ai-block:nth-child(3) p"),
  analyse: () => document.querySelector(".ai-block:nth-child(5) ul"),
};

// ================== LOG ==================
const log = (...args) => console.log("[CHATBOT]", ...args);
const err = (...args) => console.error("[CHATBOT]", ...args);

// ================== SCROLL ==================
const scrollBottom = (el, smooth = true) => {
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
};

// ================== STORAGE ==================
const storageKey = (key) =>
  state.user ? `${key}_${state.user.username}` : null;

const save = (key, value) => {
  const k = storageKey(key);
  if (k) localStorage.setItem(k, JSON.stringify(value));
};

const load = (key) => {
  const k = storageKey(key);
  if (!k) return null;
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};

// ================== SESSION ==================
function restoreSession() {
  const rawUser = localStorage.getItem("agent_user");
  if (!rawUser) return;

  try {
    state.user = JSON.parse(rawUser);
    state.role = state.user.role ?? null;
    state.criteria = load("criteria") ?? {};
    state.history = load("chat") ?? [];
    log("🔑 Session restaurée :", state.user.username);

    // --- Ajout pour avatar ---
    if (!state.user.avatar) {
      // récupérer depuis /api/me si nécessaire
      fetch("/api/me", {
        headers: { Authorization: `Bearer ${state.user.token}` },
      })
        .then((res) => res.json())
        .then((userData) => {
          state.user.avatar = userData.avatar || "/images/user-avatar.jpg";
          saveSession(); // sauvegarder l'avatar dans localStorage
          render(); // rerender pour mettre à jour l'UI
        })
        .catch((err) => console.error("[CHATBOT] Erreur fetch avatar :", err));
    }
  } catch (e) {
    err("Erreur restauration session", e);
  }
}

function saveSession() {
  if (!state.user) return;
  localStorage.setItem("agent_user", JSON.stringify(state.user));
  save("criteria", state.criteria);
  save("chat", state.history);
}
function logout() {
  // 🔥 animation fade out
  document.body.style.transition = "opacity 0.3s ease";
  document.body.style.opacity = "0";

  setTimeout(() => {
    // 🔥 nettoyage localStorage
    localStorage.clear();

    // 🔥 reset state
    Object.assign(state, {
      user: null,
      role: null,
      criteria: {},
      history: [],
    });

    render();

    // 🔥 redirection
    window.location.href = "/login.html";
  }, 300);
}
function isBuyer() {
  return state.role === "buyer";
}
// ================== API ==================
async function apiRequest(url, options = {}) {
  if (!state.user?.token) throw new Error("Non authentifié");

  const headers = options.headers || {};
  headers["Authorization"] = `Bearer ${state.user.token}`;
  headers["Content-Type"] = "application/json";

  const res = await fetch(API_BASE + url, { ...options, headers });

  if (!res.ok) {
    let errPayload;
    try {
      errPayload = await res.json();
    } catch {
      throw new Error(`Erreur ${res.status}`);
    }
    throw new Error(errPayload.error || errPayload.reply || "Erreur serveur");
  }

  return res.json();
}

async function sendToAPI(message) {
  return apiRequest("/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// ================== UI ==================
function renderUserInfo() {
  const el = $("user-info");
  const btn = $("btn-logout");
  if (!el) return;

  if (!state.user) {
    el.textContent = "";
    btn?.classList.add("hidden");
    return;
  }

  const roleFr = ROLE_LABELS[state.role] ?? state.role ?? "Inconnu";
  el.textContent = `Connecté : ${state.user.username} (${roleFr})`;
  btn?.classList.remove("hidden");
}
function addMessage({
  text,
  from = "bot",
  structured = false,
  persist = true,
}) {
  if (!text) return;

  const box = $("chat-box");

  // --- User : on garde la bulle existante ---
  if (from === "user") {
    const row = document.createElement("div");
    row.className = `msg user ${structured ? "structured" : ""}`;

    // ✅ Avatar
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.backgroundImage = `url('${
      state.user?.avatar || "/images/user-avatar.jpg"
    }')`;
    avatar.style.backgroundSize = "cover";
    avatar.style.backgroundPosition = "center";
    avatar.style.backgroundRepeat = "no-repeat";

    // ✅ Bulle
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = text;

    // ✅ Timestamp
    const time = document.createElement("span");
    time.className = "timestamp";
    time.textContent = new Date().toLocaleTimeString().slice(0, 5);
    bubble.appendChild(time);

    // ✅ Ordre important pour affichage droite/gauche
    row.appendChild(avatar);
    row.appendChild(bubble);

    box.appendChild(row);
    scrollBottom(box);

    // ✅ Persist
    if (persist && state.user) {
      state.history.push({ role: "user", content: text, structured });
      if (state.history.length > MAX_HISTORY) state.history.shift();
      save("chat", state.history);
    }

    return;
  }

  // --- Bot / IA : texte simple, sans bulle ni avatar ---
  const row = document.createElement("div");
  row.className = "msg bot text-msg";
  row.innerHTML = `<div class="ai-text">${text}</div>`;

  // --- Ajouter le séparateur seulement si le précédent message est de l'utilisateur ---
  const lastMsg = box.lastElementChild;
  if (lastMsg && lastMsg.classList.contains("user")) {
    row.style.borderTop = "1px solid #ccc"; // <-- le seul séparateur
  }

  row.style.padding = "6px 0";
  row.style.whiteSpace = "normal";

  box.appendChild(row);
  scrollBottom(box);

  if (persist && state.user) {
    state.history.push({ role: "bot", content: text });
    if (state.history.length > MAX_HISTORY) state.history.shift();
    save("chat", state.history);
  }
}
function showThinking() {
  const el = document.createElement("div");
  el.className = "msg bot thinking-msg"; // ← nouvelle classe

  const content = document.createElement("span");
  content.className = "thinking-text";
  content.setAttribute("unselectable", "on"); // non copiable
  content.textContent = "Analyse en cours";

  const dots = document.createElement("span");
  dots.className = "dots";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.textContent = ".";
    dots.appendChild(dot);
  }
  content.appendChild(dots);

  el.append(content);

  const box = $("chat-box");
  box.appendChild(el);
  scrollBottom(box);

  return {
    el,
    remove: () => el.remove(),
  };
}
function updateAIPanel(matches = []) {
  if (!state.criteria) return;
  console.log("ROLE:", state.role);
  console.log("CRITERIA:", state.criteria);

  const c = state.criteria;

  // =========================
  // 🎯 CRITÈRES USER
  // =========================
  AI.ville().innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
    <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
  ${c.ville || "Non défini"}
`;
  AI.budget().innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
  <circle cx="12" cy="12" r="10"/>
  <text x="12" y="16" text-anchor="middle" font-size="10" fill="white" font-family="Arial, sans-serif">€</text>
</svg>
${c.budget || c.budgetMax || "?"} €
`;

  // 2️⃣ affichage
  AI.surface().innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
  <rect x="2" y="10" width="20" height="4" rx="1"/>
  <line x1="4" y1="10" x2="4" y2="14"/>
  <line x1="8" y1="10" x2="8" y2="14"/>
  <line x1="12" y1="10" x2="12" y2="14"/>
  <line x1="16" y1="10" x2="16" y2="14"/>
  <line x1="20" y1="10" x2="20" y2="14"/>
</svg>
${c.surface || c.surfaceMin ? (c.surface || c.surfaceMin) + " m²" : "Non défini"}
`;
  console.log("SURFACE DEBUG", {
    role: state.role,
    surface: c.surface,
    surfaceMin: c.surfaceMin,
    typeSurface: typeof c.surface,
  });

  AI.pieces().innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>
  </svg>
  ${c.pieces || c.piecesMin || "?"} pièces
`;

  // =========================
  // ⚡ SI PAS DE MATCHS
  // =========================
  if (!matches.length) {
    AI.statut().textContent = "Aucun résultat";
    AI.analyse().innerHTML = "<li>→ En attente de résultats</li>";
    return;
  }

  // =========================
  // 📊 AGGREGATION DATA
  // =========================
  let totalPrice = 0;
  let totalSurface = 0;
  let totalPieces = 0;
  let totalCompat = 0;

  const villes = {};

  matches.forEach((m) => {
    totalPrice += isBuyer() ? m.price || 0 : m.budget || m.budgetMax || 0;

    totalSurface += isBuyer() ? m.surface || 0 : m.surfaceMin || 0;

    totalPieces += isBuyer() ? m.pieces || 0 : m.piecesMin || 0;
    totalCompat += m.compatibility || 0;

    const v = m.villeOriginal || m.ville;
    if (v) villes[v] = (villes[v] || 0) + 1;
  });

  const avgPrice = Math.round(totalPrice / matches.length);
  const avgSurface = Math.round(totalSurface / matches.length);
  const avgPieces = Math.round(totalPieces / matches.length);
  const avgCompat = Math.round(totalCompat / matches.length);

  const bestVille =
    Object.entries(villes).sort((a, b) => b[1] - a[1])[0]?.[0] || "Non défini";

  // =========================
  // ⚡ STATUT
  // =========================
  AI.statut().textContent = `${matches.length} biens • ${avgCompat}% compatibilité moyenne`;

  // =========================
  // 🧠 ANALYSE INTELLIGENTE
  // =========================
  const analyse = [];

  // 🔥 LOGIQUE SMART (basée sur tes vrais résultats)
  if (avgPrice > c.budgetMax || avgPrice > c.budget) {
    analyse.push("→ Marché au-dessus de votre budget");
  }

  if (avgSurface < c.surfaceMin) {
    analyse.push("→ Biens trop petits en moyenne");
  }

  if (avgPieces < c.piecesMin) {
    analyse.push("→ Peu de biens avec assez de pièces");
  }

  if (avgCompat > 75) {
    analyse.push("→ Excellentes opportunités détectées");
  } else if (avgCompat > 50) {
    analyse.push("→ Marché intéressant");
  } else {
    analyse.push("→ Peu de correspondances idéales");
  }

  if (c.toleranceKm > 40) {
    analyse.push(`→ Zone élargie (${c.toleranceKm}km)`);
  }

  // 💎 INSIGHT PREMIUM
  analyse.push(`→ Zone dominante : ${bestVille}`);
  analyse.push(`→ Moyenne : ${avgSurface}m² • ${avgPieces} pièces`);
  if (avgPrice < c.budget * 0.8) {
    analyse.push("→ Opportunités sous-évaluées détectées");
  }

  if (avgCompat > 80 && matches.length >= 3) {
    analyse.push("🔥 Plusieurs matchs très pertinents");
  }

  // =========================
  // 🔄 UPDATE DOM
  // =========================
  AI.analyse().innerHTML = analyse.map((a) => `<li>${a}</li>`).join("");

  flashPanel();
}
async function renderMatches(matches, postReply) {
  if (!Array.isArray(matches) || matches.length === 0) {
    addMessage({
      text: "Aucun profil ne correspond à vos critères.",
      from: "bot",
    });
    return;
  }

  addMessage({
    text: `${matches.length} profil${matches.length > 1 ? "s" : ""} correspondant${matches.length > 1 ? "s" : ""} à vos critères :`,
    from: "bot",
  });

  const formatLabel = (label) =>
    label
      ?.replace(/ville/i, "Ville")
      .replace(/pièces/i, "Pièces")
      .replace(/surface/i, "Surface") ?? "";

  // ===== Récupération des favoris =====
  let existingFavs = [];
  try {
    const favRes = await fetch(`${API_BASE}/api/favorites`, {
      headers: { Authorization: `Bearer ${state.user?.token}` },
    });
    if (favRes.ok) existingFavs = await favRes.json();
  } catch (e) {
    console.error("Erreur récupération favoris :", e);
  }

  matches.forEach((m, index) => {
    // Bot / IA
    const row = document.createElement("div");
    row.className = "msg bot structured";
    row.style.minHeight = "0";

    const bubble = document.createElement("div");
    bubble.className = "bubble match-card";

    const ville = m.villeOriginal || m.ville || "Ville inconnue";
    const dep = m.departement ? ` (${m.departement})` : "";
    const villeLabel = ville + dep;
    const piecesLabel =
      (m.pieces ?? m.piecesMin)
        ? `${m.pieces ?? m.piecesMin} pièces`
        : "Pièces inconnues";
    const surfaceLabel =
      (m.surface ?? m.surfaceMin)
        ? `${m.surface ?? m.surfaceMin} m²`
        : "Surface inconnue";
    const pct = Number(m.compatibility ?? 0);

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

    const alreadyFav = existingFavs.some((p) => p.contact === m.contact);

    // ===== HTML de la carte premium =====
    bubble.innerHTML = `
      <div class="match-header">
        <div class="match-title"><strong>${m.type}</strong> – ${villeLabel}</div>
        <button class="fav-btn" data-index="${index}">${alreadyFav ? "★" : "☆"}</button>
      </div>

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
          data-tolerance="${state.criteria.toleranceKm ?? 0}"
          data-ville="${villeLabel}">
          Voir la carte
        </button>
      </div>
    `;

    row.appendChild(bubble);
    $("chat-box").appendChild(row);

    // ===== Favoris =====
    const favBtn = bubble.querySelector(".fav-btn");
    favBtn.addEventListener("click", async () => {
      try {
        if (favBtn.style.color === "gold") return;
        const enrichedMatch = {
          ...m,
          lat: m.lat ?? m.buyerLat,
          lng: m.lng ?? m.buyerLng,
        };
        const res = await fetch(`${API_BASE}/api/favorites`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.user?.token}`,
          },
          body: JSON.stringify(enrichedMatch),
        });
        if (res.ok) {
          favBtn.textContent = "★";
          favBtn.style.color = "#0f08e1";
        }
      } catch (err) {
        console.error(err);
      }
    });

    // ===== Compatibilité =====
    requestAnimationFrame(() => {
      const bar = row.querySelector(".compat-bar-inner");
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
      row.style.opacity = 1;
    });
  });

  scrollBottom($("chat-box"));

  // ===== Bouton "Voir la carte" =====
  document.querySelectorAll(".voir-carte-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const profileLat = parseFloat(btn.dataset.lat);
      const profileLng = parseFloat(btn.dataset.lng);
      const profileVille = btn.dataset.ville;
      const userLat = parseFloat(btn.dataset.buyerLat);
      const userLng = parseFloat(btn.dataset.buyerLng);

      const mapContainer = document.getElementById("map");
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
      let lineColor =
        distanceKm <= 110 ? "green" : distanceKm <= 220 ? "yellow" : "red";
      L.polyline(
        [
          [userLat, userLng],
          [profileLat, profileLng],
        ],
        { color: lineColor, dashArray: "5,10", weight: 4 },
      ).addTo(map);

      const group = new L.featureGroup([userMarker, profileMarker]);
      map.fitBounds(group.getBounds().pad(0.2));
      const tolerance = parseFloat(btn.dataset.tolerance || 0);

      if (tolerance > 0) {
        L.circle([userLat, userLng], {
          radius: tolerance * 1000,
          color: "#6c5ce7",
          fillColor: "#a29bfe",
          fillOpacity: 0.15,
        }).addTo(map);
      }

      document.getElementById("closeModal").onclick = () => {
        modal.style.display = "none";
        document.body.classList.remove("modal-open");
        map.remove();
      };
    });
  });

  // ===== Post reply automatique =====
  if (postReply) addMessage({ text: postReply, from: "bot" });
  updateAIPanel(matches);
}
// ======== Bouton customiser le chat ======
const btn = document.getElementById("customize-btn");
const panel = document.getElementById("customize-panel");
const input = document.getElementById("bg-upload");
const chat = document.getElementById("chat-box");

btn.onclick = () => {
  panel.classList.toggle("hidden");
};

input.onchange = () => {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    const url = e.target.result;

    chat.style.backgroundImage = `url(${url})`;
    chat.style.backgroundSize = "cover";
    chat.style.backgroundPosition = "center";

    localStorage.setItem("chatBg", url);
  };

  reader.readAsDataURL(file);
};
const closeBtn = document.getElementById("close-panel");

closeBtn.onclick = () => {
  panel.classList.add("hidden");
};
document.addEventListener("click", (e) => {
  if (!panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.add("hidden");
  }
});
//============== SEND ==================//
async function sendMessage(text) {
  if (state.sending || !text) return;

  if (!state.user?.token) {
    addMessage({
      text: "❌ Vous devez être connecté pour envoyer un message.",
      from: "bot",
    });
    return;
  }

  state.sending = true;
  addMessage({ text, from: "user" });

  // Affiche le thinking
  const thinking = showThinking();

  try {
    const data = await sendToAPI(text); // <-- attend la vraie réponse de l'IA

    // Une fois la réponse reçue, supprime le thinking
    thinking?.remove?.();

    if (!data) throw new Error("Réponse serveur vide");

    const botText = data.reply || data.message;

    if (botText) {
      addMessage({ text: botText, from: "bot" });
    }

    // Si l'IA renvoie des critères / rôle
    if (data.role) state.role = data.role;
    if (data.criteria) {
      Object.assign(state.criteria, normalizeCriteria(data.criteria));
      save("criteria", state.criteria);
      updateAIPanel(data.matches || []);
    }

    // Si l'IA renvoie des matchs
    if (Array.isArray(data.matches)) {
      renderMatches(data.matches, data.postReply);
    }

    renderUserInfo();
  } catch (e) {
    thinking?.remove?.(); // supprime aussi le thinking en cas d'erreur
    console.error("SEND ERROR", e);
    addMessage({ text: "Erreur serveur ou connexion perdue.", from: "bot" });
  } finally {
    state.sending = false;
  }
}
function render() {
  const box = $("chat-box");
  const section = $("chat-section");
  const openBtn = $("openSidebar");

  box.innerHTML = "";

  if (!state.user) {
    section.style.display = "none";
    renderUserInfo();
    if (openBtn) openBtn.style.display = "none"; // <-- cacher menu si déconnecté
    return;
  }

  section.style.display = "flex";
  if (openBtn) openBtn.style.display = "flex"; // <-- réafficher si connecté

  state.history.forEach((m) =>
    addMessage({
      text: m.content,
      from: m.role === "user" ? "user" : "bot",
      structured: m.structured,
      persist: false,
    }),
  );

  renderUserInfo();
  scrollBottom(box, false);
  updateAIPanel([]);
}
function flashPanel() {
  const panel = document.querySelector(".ai-panel");
  if (!panel) return;

  panel.style.boxShadow = "0 0 20px rgba(124, 58, 237, 0.6)";
  setTimeout(() => {
    panel.style.boxShadow = "";
  }, 300);
}
// ================== INIT ==================
export function initChatbot() {
  if (state.ready) return;
  state.ready = true;
  document.body.classList.add("chat-page");

  const form = $("chat-form");
  const input = $("user-input");
  const logoutBtn = $("btn-logout");

  restoreSession();
  render();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    sendMessage(msg);
  });
  // ================== AI ACTIONS ==================
  document.querySelector(".ai-btn.primary")?.addEventListener("click", () => {
    addMessage({
      text: "Je souhaite être mis en relation avec un agent.",
      from: "user",
    });
    sendMessage("Je veux être mis en relation");
  });

  document.querySelectorAll(".ai-btn")[1]?.addEventListener("click", () => {
    addMessage({
      text: "Peux-tu analyser le marché immobilier pour moi ?",
      from: "user",
    });
    sendMessage("Analyse le marché immobilier");
  });

  document.querySelector(".ai-btn.ghost")?.addEventListener("click", () => {
    addMessage({
      text: "Je souhaite modifier mes critères.",
      from: "user",
    });
    sendMessage("Modifier mes critères");
  });

  logoutBtn?.addEventListener("click", logout);
  log("✅ Chatbot prêt");
}
