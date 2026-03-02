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

// ================== DOM ==================
const $ = (id) => document.getElementById(id);

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
  localStorage.clear();
  Object.assign(state, {
    user: null,
    role: null,
    criteria: {},
    history: [],
  });
  render();
  log("🚪 Déconnecté");
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
  const row = document.createElement("div");
  row.className = `msg ${from} ${structured ? "structured" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = text;

  const time = document.createElement("span");
  time.className = "timestamp";
  time.textContent = new Date().toLocaleTimeString().slice(0, 5);
  bubble.appendChild(time);

  from === "user" ? row.append(bubble, avatar) : row.append(avatar, bubble);

  box.appendChild(row);
  requestAnimationFrame(() => (row.style.opacity = 1));
  scrollBottom(box);

  if (persist && state.user) {
    state.history.push({
      role: from === "user" ? "user" : "bot",
      content: text,
      structured,
    });
    if (state.history.length > MAX_HISTORY) state.history.shift();
    save("chat", state.history);
  }
}

function showThinking() {
  const el = document.createElement("div");
  el.className = "msg bot";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = "Analyse en cours";

  const dots = document.createElement("span");
  dots.className = "dots";

  // Crée 3 spans pour animation CSS
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.textContent = ".";
    dots.appendChild(dot);
  }

  bubble.appendChild(dots);
  el.appendChild(bubble);
  $("chat-box").appendChild(el);
  scrollBottom($("chat-box"));

  return {
    el,
    remove: () => el.remove(),
  };
}

// ================== MATCH RENDER ==================
async function renderMatches(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    addMessage({
      text: "Aucun profil ne correspond à vos critères.",
      from: "bot",
    });
    return;
  }

  addMessage({
    text: `🤝 ${matches.length} profil${matches.length > 1 ? "s" : ""} correspondant${matches.length > 1 ? "s" : ""} à vos critères :`,
    from: "bot",
  });

  const formatLabel = (label) =>
    label
      ?.replace(/ville/i, "Ville")
      .replace(/pièces/i, "Pièces")
      .replace(/surface/i, "Surface") ?? "";

  // ===== Récupération des favoris depuis l'API =====
  let existingFavs = [];
  try {
    const favRes = await fetch(`${API_BASE}/api/favorites`, {
      headers: {
        Authorization: `Bearer ${state.user?.token}`,
      },
    });
    if (favRes.ok) {
      existingFavs = await favRes.json();
    }
  } catch (e) {
    console.error("Erreur récupération favoris depuis le serveur :", e);
  }

  matches.forEach((m, index) => {
    const row = document.createElement("div");
    row.className = "msg bot structured match-row";
    row.style.display = "flex";
    row.style.flexDirection = "column";
    row.style.marginBottom = "18px";
    row.style.opacity = 0;

    const avatar = document.createElement("div");
    avatar.className = "avatar";

    const bubble = document.createElement("div");
    bubble.className = "bubble match-card";
    bubble.style.display = "flex";
    bubble.style.flexDirection = "column";
    bubble.style.gap = "8px";
    bubble.style.position = "relative";

    const villeLabel = m.villeOriginal || m.ville || "Ville inconnue";
    const piecesLabel =
      (m.pieces ?? m.piecesMin)
        ? `${m.pieces ?? m.piecesMin} pièces`
        : "Pièces inconnues";
    const surfaceLabel =
      (m.surface ?? m.surfaceMin)
        ? `${m.surface ?? m.surfaceMin} m²`
        : "Surface inconnue";

    const common = m.common ?? [];
    const different = m.different ?? [];
    const pct = Number(m.compatibility ?? 0);

    const commonHTML = common.length
      ? common
          .map(
            (c) => `<span class="pill pill-common">
                      <span class="pill-icon">✔</span>
                      <span class="pill-text">${formatLabel(c)}</span>
                    </span>`,
          )
          .join("")
      : `<span class="pill pill-neutral">Aucun critère commun</span>`;

    const differentHTML = different.length
      ? different
          .map(
            (d) => `<span class="pill pill-different">
                      <span class="pill-icon">✕</span>
                      <span class="pill-text">${formatLabel(d)}</span>
                    </span>`,
          )
          .join("")
      : `<span class="pill pill-neutral">Aucune différence</span>`;

    let priceLabel = "N/A";
    if (m.price != null) priceLabel = `${m.price} €`;
    else if (m.budget != null) priceLabel = `${m.budget} €`;
    else if (m.budgetMin != null && m.budgetMax != null) {
      priceLabel =
        m.budgetMin === m.budgetMax
          ? `${m.budgetMin} €`
          : `${m.budgetMin} – ${m.budgetMax} €`;
    }

    const alreadyFav = existingFavs.some((p) => p.contact === m.contact);

    bubble.innerHTML = `
      <button class="fav-btn" data-index="${index}" style="
        position:absolute;
        top:8px;
        right:8px;
        background:#1976ff;
        color:white;
        border:none;
        border-radius:50%;
        width:28px;
        height:28px;
        font-size:14px;
        cursor:pointer;
        transition:0.2s;
      ">⭐</button>

      <div class="match-header">🏠 <strong>${m.type}</strong> – <span class="match-city">${villeLabel}</span></div>

      <div class="match-meta">
        <span>🛏️ ${piecesLabel}</span>
        <span>📐 ${surfaceLabel}</span>
      </div>

      <div class="match-meta">
        <span>💰 ${priceLabel}</span>
        <span>📞 ${m.contact ?? "N/A"}</span>
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

      <div class="match-compat">
        <div class="compat-label">Compatibilité : <strong>${pct}%</strong></div>
        <div class="compat-bar">
          <div class="compat-bar-inner"></div>
        </div>
      </div>

      <button class="voir-carte-btn"
        data-lat="${m.lat ?? m.buyerLat ?? 48.8566}"
        data-lng="${m.lng ?? m.buyerLng ?? 2.3522}"
        data-buyer-lat="${m.buyerLat ?? 48.8566}"
        data-buyer-lng="${m.buyerLng ?? 2.3522}"
        data-ville="${villeLabel}">
        Voir la carte
      </button>
    `;

    row.append(avatar, bubble);
    $("chat-box").appendChild(row);

    const favBtn = bubble.querySelector(".fav-btn");
    if (alreadyFav) {
      favBtn.style.background = "gold";
      favBtn.style.color = "black";
    }

    // ===== Ajout favoris via API =====
    favBtn.addEventListener("click", async () => {
      try {
        if (favBtn.style.background === "gold") return;

        // 🔥 ON CLONE ET ON AJOUTE LES COORDONNÉES ACHETEUR
        const enrichedMatch = {
          ...m,
          lat: m.lat ?? m.buyerLat,
          lng: m.lng ?? m.buyerLng,
          buyerLat: m.buyerLat,
          buyerLng: m.buyerLng,
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
          favBtn.style.background = "gold";
          favBtn.style.color = "black";
        } else {
          console.error("Erreur ajout favori :", await res.text());
        }
      } catch (err) {
        console.error("Erreur ajout favori :", err);
      }
    });

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
        bar.style.background = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      }
      row.style.opacity = 1;
    });
  });

  scrollBottom($("chat-box"));

  // ====== BOUTON "Voir la carte" EXACTEMENT COMME AVANT ======
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
  const thinking = showThinking();

  try {
    const data = await sendToAPI(text);
    thinking?.remove?.();

    console.log("API RESPONSE", data);

    if (!data) throw new Error("Réponse serveur vide");

    if (!data.matches && data.reply) {
      addMessage({ text: data.reply, from: "bot" });
    }

    if (data.role) state.role = data.role;

    if (data.criteria) {
      Object.assign(state.criteria, data.criteria);
      save("criteria", state.criteria);
    }
    if (Array.isArray(data.matches)) {
      renderMatches(data.matches);

      // === ICI ===
      if (data.postReply) {
        setTimeout(() => {
          addMessage({
            text: data.postReply,
            from: "bot",
          });
        }, 600);
      }
    }

    renderUserInfo();
  } catch (e) {
    thinking?.remove?.();
    console.error("SEND ERROR", e);

    addMessage({
      text: "Erreur serveur ou connexion perdue.",
      from: "bot",
    });
  } finally {
    state.sending = false;
  }
}

// ================== RENDER ==================
function render() {
  const box = $("chat-box");
  const section = $("chat-section");
  box.innerHTML = "";

  if (!state.user) {
    section.style.display = "none";
    renderUserInfo();
    return;
  }

  section.style.display = "block";
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
}

// ================== INIT ==================
export function initChatbot() {
  if (state.ready) return;
  state.ready = true;

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

  logoutBtn?.addEventListener("click", logout);
  log("✅ Chatbot prêt");
}
