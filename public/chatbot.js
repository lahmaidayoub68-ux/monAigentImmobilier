import { openNiveauEnergetiquePopup } from "./niveauEnergetiquePopup.js";
import { openProximitePopup } from "./proximitePopup.js";
import { initSessionReplay } from "./sessionReplay.js";
import { renderProjectionHTML } from "./compatibilityProjection.js";

// ================== CONFIG & STATE ==================
const API_BASE = window.location.origin;
const MAX_HISTORY = 50;
const ROLE_LABELS = { buyer: "Acheteur", seller: "Vendeur" };

const state = {
  user: null,
  role: null,
  criteria: {},
  history: [],
  sending: false,
  ready: false,
  ui: {
    etatPopupOpened: false,
    imagesPopupOpened: false,
    niveauEnergetiquePopupOpened: false,
    contactStep: null, // null | 'awaiting_profile_selection'
    modifyingCriteria: false,
    lastMatches: [],
  },
};

// ================== UTILS & DOM ==================
const $ = (id) => document.getElementById(id);
const log = (...args) => console.log("[CHATBOT]", ...args);
const err = (...args) => console.error("[CHATBOT]", ...args);

const scrollBottom = (el, smooth = true) => {
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
};

function normalizeCriteria(c) {
  const surface = c.surface ?? c.surfaceMin ?? null;
  return {
    ville: c.ville ?? null,
    budget: c.budget ?? c.budgetMax ?? c.budgetMin ?? null,
    budgetMin: c.budgetMin ?? c.budget ?? null,
    budgetMax: c.budgetMax ?? c.budget ?? null,
    surface: surface,
    surfaceMin: surface,
    surfaceMax: c.surfaceMax ?? null,
    pieces: c.pieces ?? c.piecesMin ?? null,
    piecesMin: c.piecesMin ?? c.pieces ?? null,
    piecesMax: c.piecesMax ?? null,
    toleranceKm: c.toleranceKm ?? 0,
    etatBien: c.etatBien ?? null,
    type: c.type ?? null,
    niveauEnergetique: c.niveauEnergetique ?? null,
    imagesbien: Array.isArray(c.imagesbien) ? c.imagesbien : [],
    // NOUVEAU
    proximite: Array.isArray(c.proximite) ? c.proximite : (c.proximite ?? null),
  };
}

const parseImages = (img) => {
  if (!img) return [];
  if (Array.isArray(img)) return img;
  try {
    return JSON.parse(img);
  } catch {
    return [];
  }
};
function unlockPanelActions() {
  document.querySelectorAll(".ai-btn").forEach((btn) => {
    btn.removeAttribute("disabled");
    btn.classList.remove("btn-locked");
  });
  // Afficher un indicateur visuel que les actions sont disponibles
  const panelHint = document.querySelector(".ai-panel-hint");
  if (panelHint) {
    panelHint.textContent = "Actions disponibles";
    panelHint.classList.add("hint-active");
  }
}

function lockPanelActions() {
  document.querySelectorAll(".ai-btn").forEach((btn) => {
    btn.setAttribute("disabled", "true");
    btn.classList.add("btn-locked");
  });
  const panelHint = document.querySelector(".ai-panel-hint");
  if (panelHint) {
    panelHint.textContent = "Disponible après les résultats";
    panelHint.classList.remove("hint-active");
  }
}
function addThinkingIndicator(type = "default") {
  const thinkEl = document.createElement("div");
  thinkEl.className = "msg bot thinking-msg";
  thinkEl.innerHTML = `<span class="thinking-text">Analyse cognitive en cours<span class="dots"><span>.</span><span>.</span><span>.</span></span></span>`;
  $("chat-box").appendChild(thinkEl);
  scrollBottom($("chat-box"));
  return thinkEl;
}
// ================== STORAGE & SESSION ==================
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

function restoreSession() {
  const rawUser = localStorage.getItem("agent_user");
  if (!rawUser) return;
  try {
    state.user = JSON.parse(rawUser);
    state.role = state.user.role ?? null;
    state.criteria = load("criteria") ?? {};
    state.history = load("chat") ?? [];

    if (!state.user.avatar) {
      fetch("/api/me", {
        headers: { Authorization: `Bearer ${state.user.token}` },
      })
        .then((res) => res.json())
        .then((userData) => {
          state.user.avatar = userData.avatar || "/images/user-avatar.jpg";
          localStorage.setItem("agent_user", JSON.stringify(state.user));
          render();
        })
        .catch((e) => err("Erreur fetch avatar", e));
    }
  } catch (e) {
    err("Erreur restauration session", e);
  }
}
if (load("phase") === "results") {
  state.phase = "results";
  state.lastMatches = load("lastMatches") || [];
  unlockPanelActions();
} else {
  lockPanelActions();
}
// ================== UI: PROGRESS & THEME ==================
function updateProgressBar() {
  const c = state.criteria;
  const fields =
    state.role === "seller"
      ? ["ville", "type", "budgetMin", "surfaceMin", "piecesMin"]
      : ["ville", "type", "budgetMax", "surfaceMin", "piecesMin"];

  const filled = fields.filter((f) => c[f] !== null && c[f] !== "").length;
  const progress = Math.round((filled / fields.length) * 100);
  const bar = document.querySelector(".progress-fill");
  if (bar) bar.style.width = `${progress}%`;
}

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

// ================== AI PANEL (STATISTIQUES) ==================
const AI = {
  ville: () => $("ai-ville"),
  budget: () => $("ai-budget"),
  surface: () => $("ai-surface"),
  pieces: () => $("ai-pieces"),
  statut: () => $("ai-statut"),
  analyse: () => $("ai-analyse"),
};

function updateAIPanel(matches = []) {
  const c = state.criteria;
  if (AI.ville()) AI.ville().textContent = c.ville || "En attente";
  if (AI.budget())
    AI.budget().textContent =
      c.budgetMax || c.budgetMin
        ? `${c.budgetMax || c.budgetMin} €`
        : "En attente";
  if (AI.surface())
    AI.surface().textContent = c.surfaceMin
      ? `${c.surfaceMin} m²`
      : "En attente";
  if (AI.pieces())
    AI.pieces().textContent = c.piecesMin ? `${c.piecesMin} p.` : "En attente";

  if (!matches.length) {
    if (AI.statut()) AI.statut().textContent = "En attente de résultats";
    return;
  }

  let totalCompat = 0;
  matches.forEach((m) => (totalCompat += m.compatibility || 0));
  const avgCompat = Math.round(totalCompat / matches.length);

  if (AI.statut())
    AI.statut().textContent = `${matches.length} profils (${avgCompat}%)`;

  const analyse = [];
  if (avgCompat > 75) analyse.push("Forte compatibilité détectée");
  if (c.toleranceKm > 0) analyse.push(`Rayon élargi : +${c.toleranceKm}km`);
  if (AI.analyse())
    AI.analyse().innerHTML = analyse.map((a) => `<li>${a}</li>`).join("");
}

// ================== MESSAGERIE UI ==================
function addMessage({
  text,
  from = "bot",
  structured = false,
  persist = true,
  typing = false,
}) {
  if (!text) return;

  // Retire l'empty state dès le premier message
  const emptyState = $("chat-empty-state");
  if (emptyState) emptyState.remove(); // ← AJOUTER ICI

  const box = $("chat-box");
  const row = document.createElement("div");
  row.className = `msg ${from} ${structured ? "structured" : "text-msg"}`;

  const content = document.createElement("div");
  content.className = structured ? "" : "ai-text";

  if (from === "user") {
    row.innerHTML = `<div class="bubble">${text}<span class="timestamp">${new Date().toLocaleTimeString().slice(0, 5)}</span></div>`;
    box.appendChild(row);
  } else {
    row.appendChild(content);
    box.appendChild(row);
    if (typing && !structured) {
      let i = 0;
      content.innerHTML = "";
      const interval = setInterval(() => {
        content.innerHTML += text.charAt(i);
        i++;
        if (i >= text.length) {
          clearInterval(interval);
          scrollBottom(box);
        }
      }, 15);
    } else {
      content.innerHTML = text;
    }
  }
  if (persist && state.user) {
    state.history.push({ role: from, content: text, structured });
    save("chat", state.history);
  }
  scrollBottom(box);
}
// AVANT : handleResultsResponse, relaunchMatching, sendResultsMessage
// sont définies DANS le try{} de sendMessage → inaccessibles globalement

// APRÈS : les déplacer AVANT la fonction sendMessage, au niveau du module

async function handleResultsResponse(data) {
  // Mise à jour des matchs en mémoire
  if (Array.isArray(data.matches) && data.matches.length > 0) {
    state.lastMatches = data.matches;
  }

  // Actions spéciales prioritaires — pas de message affiché ici
  if (data.actionType === "criteria_updated_relaunch") {
    await relaunchMatching();
    return;
  }

  // Premier matching (matchingDone + matches + postReply) — on affiche les matchs
  if (
    data.matchingDone &&
    Array.isArray(data.matches) &&
    data.matches.length > 0 &&
    data.postReply
  ) {
    renderMatches(data.matches, data.postReply);
    return;
  }

  // Relaunch matching — on affiche les nouveaux matchs sans postReply
  if (data.actionType === "relaunch_done" && Array.isArray(data.matches)) {
    if (data.reply) addMessage({ text: data.reply, from: "bot", typing: true });
    renderMatches(data.matches, null);
    return;
  }

  // Réponse IA results standard (conversation, analyse, comparaison...)
  // Uniquement si ce n'est pas du JSON brut
  const msg = data.reply || data.postReply;
  if (msg) {
    // Garde-fou : on n'affiche pas si c'est du JSON brut exposé
    const isRawJson = msg.trim().startsWith("{") && msg.includes('"message"');
    if (!isRawJson) {
      addMessage({ text: msg, from: "bot", typing: true });
    }
  }
}

async function relaunchMatching() {
  const thinkEl = addThinkingIndicator("action");
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user.token}`,
      },
      body: JSON.stringify({ message: "__RELAUNCH_MATCHING__" }),
    });
    const data = await res.json();
    thinkEl.remove();
    if (data.matchingDone && state.phase !== "results") {
      state.phase = "results";
      save("phase", "results");
      unlockPanelActions();
    }
    if (data.reply) addMessage({ text: data.reply, from: "bot", typing: true });
    if (Array.isArray(data.matches) && data.matches.length > 0) {
      state.lastMatches = data.matches;
      renderMatches(data.matches, null);
    } else {
      addMessage({
        text: "Aucun profil trouvé avec ces nouveaux critères. Souhaitez-vous les ajuster ?",
        from: "bot",
      });
    }
  } catch (e) {
    thinkEl.remove();
    addMessage({ text: "Erreur lors du rechargement.", from: "bot" });
  }
}

async function sendResultsMessage(text) {
  const thinkEl = addThinkingIndicator("analyze");
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user.token}`,
      },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    thinkEl.remove();
    if (data.criteria) {
      state.criteria = normalizeCriteria({
        ...state.criteria,
        ...data.criteria,
      });
      save("criteria", state.criteria);
    }
    await handleResultsResponse(data);
  } catch (e) {
    thinkEl.remove();
    addMessage({ text: "Erreur de communication.", from: "bot" });
  }
}
// ================== LOGIQUE CORE: SEND MESSAGE ==================
async function sendMessage(text) {
  if (state.sending || !text) return;
  state.sending = true;
  addMessage({ text, from: "user" });

  // Indicateur de saisie IA
  const thinkEl = document.createElement("div");
  thinkEl.className = "msg bot thinking-msg";
  thinkEl.innerHTML = `<span class="thinking-text">Analyse cognitive en cours<span class="dots"><span>.</span><span>.</span><span>.</span></span></span>`;
  $("chat-box").appendChild(thinkEl);
  scrollBottom($("chat-box"));

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user.token}`,
      },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    thinkEl.remove();

    // Merge critères
    if (data.role) state.role = data.role;
    if (data.criteria) {
      state.criteria = normalizeCriteria({
        ...state.criteria,
        ...data.criteria,
      });
      save("criteria", state.criteria);
      updateAIPanel(data.matches || []);
      updateProgressBar();
    }

    // ── Pop-up : ORDRE STRICT VENDEUR ────────────────────────────────
    if (state.role === "seller") {
      // Réponse IA vendeur (toujours affichée sauf si matchs présents)
      if (data.reply || data.message) {
        addMessage({
          text: data.reply || data.message,
          from: "bot",
          typing: true,
        });
      }

      // 1. Proximite (premier pop-up vendeur)
      if (data.triggerProximitePopup && !state.ui.proximitePopupOpened) {
        state.ui.proximitePopupOpened = true;
        setTimeout(
          () =>
            openProximitePopup({
              state,
              save,
              addMessage,
              sendProximite,
            }),
          800,
        );
        return;
      }

      // 2. État du bien
      if (data.triggerEtatBienPopup && !state.ui.etatPopupOpened) {
        state.ui.etatPopupOpened = true;
        setTimeout(openEtatPopup, 1200);
        return;
      }

      // 3. Niveau énergétique
      if (
        data.triggerNiveauEnergetiquePopup &&
        !state.ui.niveauEnergetiquePopupOpened
      ) {
        state.ui.niveauEnergetiquePopupOpened = true;
        setTimeout(
          () =>
            openNiveauEnergetiquePopup({
              state,
              save,
              addMessage,
              sendNiveauEnergetique,
            }),
          1200,
        );
        return;
      }

      // 4. Images
      if (data.triggerImagesPopup && !state.ui.imagesPopupOpened) {
        state.ui.imagesPopupOpened = true;
        setTimeout(openImagesPopup, 1200);
        return;
      }

      // Matchs vendeur
      if (Array.isArray(data.matches) && data.matches.length > 0) {
        renderMatches(data.matches, data.postReply);
      }
      return;
    }

    // ── BUYER ─────────────────────────────────────────────────────────
    // Si matchs présents : on n'affiche PAS reply (message tunnel obsolète),
    // renderMatches affiche postReply à la place
    // APRÈS le thinkEl.remove() et le merge criteria, dans la branche buyer :

    // Premier matching : matchingDone arrive avec matches + postReply
    // ── BUYER ─────────────────────────────────────────────────────────
    // Premier matching : matchingDone arrive avec matches + postReply
    if (data.matchingDone) {
      if (state.phase !== "results") {
        state.phase = "results";
        save("phase", "results");
        unlockPanelActions();
      }
      // ✅ FIX : on n'affiche PAS data.reply ici (message tunnel obsolète)
      // On appelle directement renderMatches comme la branche seller
      if (Array.isArray(data.matches) && data.matches.length > 0) {
        renderMatches(data.matches, data.postReply);
      } else {
        // Aucun match trouvé : on affiche postReply ou reply en fallback
        const msg = data.postReply || data.reply;
        if (msg) addMessage({ text: msg, from: "bot", typing: true });
      }
      return;
    }

    // Phase results déjà active (messages suivants)
    if (state.phase === "results") {
      await handleResultsResponse(data);
      return;
    }

    // Tunnel collecting normal — seulement si PAS matchingDone
    if (data.reply || data.message) {
      addMessage({
        text: data.reply || data.message,
        from: "bot",
        typing: true,
      });
    }
    // ← FIN. Le bloc dupliqué "Pas encore de matching" est supprimé.
  } catch (e) {
    thinkEl.remove();
    addMessage({
      text: "Erreur de communication avec le serveur.",
      from: "bot",
    });
  } finally {
    state.sending = false;
  }
}

// ================== FONCTIONS D'UPDATE POPUPS ==================
async function sendSpecialUpdate(payload) {
  // ── Indicateur thinking ──────────────────────────────────────────
  const thinkEl = document.createElement("div");
  thinkEl.className = "msg bot thinking-msg";
  thinkEl.innerHTML = `<span class="thinking-text">Analyse cognitive en cours<span class="dots"><span>.</span><span>.</span><span>.</span></span></span>`;
  $("chat-box").appendChild(thinkEl);
  scrollBottom($("chat-box"));

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user.token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    thinkEl.remove();

    if (data.criteria) {
      state.criteria = normalizeCriteria({
        ...state.criteria,
        ...data.criteria,
      });
      save("criteria", state.criteria);
      updateProgressBar();
    }

    // ── Affiche TOUJOURS le message IA s'il existe ────────────────
    if (data.reply || data.message) {
      addMessage({
        text: data.reply || data.message,
        from: "bot",
        typing: true,
      });
    }

    // ── Cascade pop-ups vendeur ───────────────────────────────────
    if (data.triggerProximitePopup && !state.ui.proximitePopupOpened) {
      state.ui.proximitePopupOpened = true;
      openProximitePopup({ state, save, addMessage, sendProximite });
    } else if (data.triggerEtatBienPopup && !state.ui.etatPopupOpened) {
      state.ui.etatPopupOpened = true;
      setTimeout(openEtatPopup, 600);
    } else if (
      data.triggerNiveauEnergetiquePopup &&
      !state.ui.niveauEnergetiquePopupOpened
    ) {
      state.ui.niveauEnergetiquePopupOpened = true;
      openNiveauEnergetiquePopup({
        state,
        save,
        addMessage,
        sendNiveauEnergetique,
      });
    } else if (data.triggerImagesPopup && !state.ui.imagesPopupOpened) {
      state.ui.imagesPopupOpened = true;
      openImagesPopup();
    } else if (Array.isArray(data.matches) && data.matches.length > 0) {
      renderMatches(data.matches, data.postReply);
    }
  } catch (e) {
    thinkEl.remove();
    console.error("[sendSpecialUpdate]", e);
    addMessage({
      text: "Erreur de communication avec le serveur.",
      from: "bot",
    });
  }
}

async function sendNiveauEnergetique(val) {
  state.ui.niveauEnergetiquePopupOpened = true;
  await sendSpecialUpdate({
    niveauEnergetique: val,
    message: "__NIVEAU_ENERGETIQUE_SELECTED__",
  });
}
async function sendProximite(val) {
  // val : tableau de strings ex: ["Transport : Arrêt bus Saint-Lazare", "École : École primaire Jules Ferry"]
  state.ui.proximitePopupOpened = true;
  state.criteria.proximite = Array.isArray(val) ? val : [];
  save("criteria", state.criteria);

  await sendSpecialUpdate({
    proximite: state.criteria.proximite,
    message: "__PROXIMITE_SELECTED__",
  });
}

// ================== RENDU MATCHS ==================
// ================== FAVORIS — API + PERSISTANCE FIXE ==================
// Remplace entièrement le bloc favoris dans chatbot.js
// (supprimer favoritesKey, loadFavorites, saveFavorites, toggleFavorite, applyFavoriteState)

async function loadFavorites() {
  if (!state.user?.token) return new Set();
  try {
    const res = await fetch(`${API_BASE}/api/favorites`, {
      headers: { Authorization: `Bearer ${state.user.token}` },
    });
    if (!res.ok) return new Set();
    const list = await res.json();
    return new Set(list.map((f) => f.contact));
  } catch {
    return new Set();
  }
}

async function addFavorite(match) {
  if (!state.user?.token) return false;
  try {
    const enriched = {
      ...match,
      lat: match.lat ?? match.buyerLat ?? null,
      lng: match.lng ?? match.buyerLng ?? null,
      buyerLat: match.buyerLat ?? match.lat ?? null,
      buyerLng: match.buyerLng ?? match.lng ?? null,
    };
    const res = await fetch(`${API_BASE}/api/favorites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user.token}`,
      },
      body: JSON.stringify(enriched),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function removeFavorite(contact) {
  if (!state.user?.token) return false;
  try {
    const res = await fetch(
      `${API_BASE}/api/favorites/${encodeURIComponent(contact)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${state.user.token}` },
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function applyFavoriteState(btn) {
  const favs = await loadFavorites();
  const contact = btn.dataset.contact;
  if (favs.has(contact)) {
    btn.classList.add("fav-active");
    btn.setAttribute("aria-label", "Retirer des favoris");
  } else {
    btn.classList.remove("fav-active");
    btn.setAttribute("aria-label", "Ajouter aux favoris");
  }
}

async function toggleFavorite(match, btn) {
  const contact = match.contact;
  const isActive = btn.classList.contains("fav-active");

  // Optimistic UI
  btn.classList.toggle("fav-active", !isActive);
  btn.setAttribute(
    "aria-label",
    isActive ? "Ajouter aux favoris" : "Retirer des favoris",
  );
  btn.disabled = true;

  let ok;
  if (isActive) {
    ok = await removeFavorite(contact);
  } else {
    ok = await addFavorite(match);
  }

  btn.disabled = false;

  // Rollback si erreur
  if (!ok) {
    btn.classList.toggle("fav-active", isActive);
    btn.setAttribute(
      "aria-label",
      isActive ? "Retirer des favoris" : "Ajouter aux favoris",
    );
  }
}

// ================== RENDU MATCHS (avec favoris API) ==================
async function renderMatches(matches, postReply) {
  state.lastMatches = matches;
  state.phase = "results";
  save("phase", "results");
  unlockPanelActions();

  addMessage({
    text: `${matches.length} profil(s) pertinent(s) identifié(s) :`,
    from: "bot",
    structured: true,
  });

  // Charger les favoris existants une seule fois
  const existingFavs = await loadFavorites();
  save("lastMatches", matches);

  matches.forEach((m, matchIdx) => {
    const row = document.createElement("div");
    row.className = "msg bot structured";
    const bubble = document.createElement("div");
    bubble.className = "bubble match-card";

    const formatLabel = (l) =>
      l?.replace(/ville/i, "Ville").replace(/surface/i, "Surface");
    const commonHTML = (m.common || [])
      .map((c) => `<span class="pill pill-common">${formatLabel(c)}</span>`)
      .join("");
    const differentHTML = (m.different || [])
      .map((d) => `<span class="pill pill-different">${formatLabel(d)}</span>`)
      .join("");

    const isFav = existingFavs.has(m.contact);

    // ── Sérialiser le profil pour le bouton nego ──────────────────────────
    const matchJson = JSON.stringify({
      ville: m.ville,
      type: m.type,
      price: m.price || m.budgetMax,
      budgetMax: m.budgetMax,
      surface: m.surface || m.surfaceMin,
      surfaceMin: m.surfaceMin,
      pieces: m.pieces || m.piecesMin,
      piecesMin: m.piecesMin,
      contact: m.contact,
      compatibility: m.compatibility,
      niveauEnergetique: m.niveauEnergetique,
      etatBien: m.etatBien,
      role: m.role,
    }).replace(/"/g, "&quot;");

    const criteriaJson = JSON.stringify({
      ville: state.criteria.ville,
      budgetMax: state.criteria.budgetMax,
      budgetMin: state.criteria.budgetMin,
      surfaceMin: state.criteria.surfaceMin,
      piecesMin: state.criteria.piecesMin,
      type: state.criteria.type,
      toleranceKm: state.criteria.toleranceKm,
    }).replace(/"/g, "&quot;");

    bubble.innerHTML = `
      <div class="match-header">
        <div class="match-title"><strong>${m.type || "Bien"}</strong> – ${m.ville}</div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${
            m.role === "seller"
              ? `
<button class="details-btn" aria-label="Voir détails">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 16V12M12 8H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" 
      stroke="url(#grad-details-${matchIdx})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <defs>
      <linearGradient id="grad-details-${matchIdx}" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stop-color="#f472b6" />
        <stop offset="1" stop-color="#8b5cf6" />
      </linearGradient>
    </defs>
  </svg>
</button>`
              : ""
          }
          <button class="fav-btn${isFav ? " fav-active" : ""}"
            data-contact="${m.contact}"
            aria-label="${isFav ? "Retirer des favoris" : "Ajouter aux favoris"}">
            <svg class="fav-icon" viewBox="0 0 24 24" fill="${isFav ? "var(--rose)" : "none"}" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2.5l2.63 5.33 5.87.85-4.25 4.14 1 5.85L12 16.15l-5.25 2.52 1-5.85L3.5 8.68l5.87-.85z"
                stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="match-details">
        <div class="detail-row"><span>Prix</span><strong>${m.price || m.budgetMax || "N/A"} €</strong></div>
        <div class="detail-row"><span>Surface</span><strong>${m.surface || m.surfaceMin || "N/A"} m²</strong></div>
        <div class="detail-row"><span>Pièces</span><strong>${m.pieces || m.piecesMin || "N/A"} p.</strong></div>
        <div class="detail-row"><span>Contact</span><strong>${m.contact || "N/A"}</strong></div>
      </div>
      <div class="match-criteria">
        <div class="criteria-list">${commonHTML}${differentHTML}</div>
      </div>
      <div class="match-footer">
        <div class="compat-container">
          <div class="compat-label">${m.compatibility}%</div>
          <div class="compat-bar">
            <div class="compat-bar-inner" style="width:${m.compatibility}%"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="nego-btn"
            data-nego-match="${matchJson}"
            data-nego-criteria="${criteriaJson}"
            aria-label="Simuler une négociation">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            Simuler
          </button>
          <button class="voir-carte-btn"
            data-lat="${m.lat ?? m.buyerLat ?? 48.8566}"
            data-lng="${m.lng ?? m.buyerLng ?? 2.3522}"
            data-buyer-lat="${m.buyerLat ?? m.lat ?? 48.8566}"
            data-buyer-lng="${m.buyerLng ?? m.lng ?? 2.3522}"
            data-ville="${m.ville}">Carte</button>
        </div>
      </div>
    `;
    const projHTML = renderProjectionHTML(m, state.criteria);
    if (projHTML) {
      const projEl = document.createElement("div");
      projEl.innerHTML = projHTML;
      bubble.appendChild(projEl.firstElementChild);
    }

    // ── Modal détails vendeur (code original conservé intégralement) ───────
    if (m.role === "seller") {
      bubble.querySelector(".details-btn").onclick = () => {
        const images = Array.isArray(m.imagesbien) ? m.imagesbien : [];
        const proximite = Array.isArray(m.proximite) ? m.proximite : [];
        let currentIndex = 0;

        const modal = document.createElement("div");
        modal.className = "details-modal-overlay";
        modal.style.display = "flex";

        const INFRA_COLORS = {
          Transport: "#6366f1",
          École: "#8b5cf6",
          Commerce: "#ec4899",
          Santé: "#f43f5e",
          "Parc / Nature": "#10b981",
          "Restaurant / Café": "#f59e0b",
        };

        function getInfraColor(label) {
          for (const [key, color] of Object.entries(INFRA_COLORS)) {
            if (label.toLowerCase().includes(key.toLowerCase())) return color;
          }
          return "#a78bfa";
        }

        function buildProximiteHTML(items) {
          if (!items.length) {
            return `<p style="font-size:12px;color:#64748b;margin:0;font-style:italic">Non renseigné</p>`;
          }
          return items
            .map((item) => {
              const parts = item.split(" : ");
              const type = parts.length > 1 ? parts[0].trim() : "Lieu";
              const name = parts.length > 1 ? parts[1].trim() : item;
              const color = getInfraColor(type);
              return `<span class="prox-detail-chip" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;margin:2px;border-radius:20px;font-size:11px;font-weight:500;background:${color}1A;border:1px solid ${color}55;">
                <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;"></span>
                <span style="color:${color};font-weight:600;">${type}</span>
                <span style="color:${color};opacity:0.85;">${name}</span>
              </span>`;
            })
            .join("");
        }

        const renderModalContent = () => {
          const hasImages = images.length > 0;
          modal.innerHTML = `
            <div class="details-popup-content">
              <div class="details-header">Détails de l'annonce
                <button class="close-details-btn">&times;</button>
              </div>
              ${
                hasImages
                  ? `
                <div class="details-carousel-container">
                  <div class="details-img-wrapper">
                    <img src="${images[currentIndex]}" class="details-main-img" alt="Bien">
                    ${
                      images.length > 1
                        ? `
                      <button class="c-nav c-prev">‹</button>
                      <button class="c-nav c-next">›</button>
                      <div class="c-counter">${currentIndex + 1} / ${images.length}</div>
                    `
                        : ""
                    }
                  </div>
                </div>
              `
                  : '<div class="no-img-placeholder">Aucune photo disponible</div>'
              }
              <div class="details-grid">
                <div class="feature-item"><span>DPE</span><strong>${m.niveauEnergetique || "N/A"}</strong></div>
                <div class="feature-item"><span>État</span><strong>${m.etatBien || "N/A"}</strong></div>
                <div class="feature-item"><span>Contact</span><strong>${m.contact || "N/A"}</strong></div>
              </div>
              ${
                proximite.length > 0
                  ? `
                <div class="details-proximite-section">
                  <div class="details-proximite-header">
                    <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#a78bfa"/></svg>
                    <span>Commodités à proximité</span>
                  </div>
                  <div class="details-proximite-chips">${buildProximiteHTML(proximite)}</div>
                </div>
              `
                  : ""
              }
            </div>`;

          modal.querySelector(".close-details-btn").onclick = () =>
            modal.remove();
          if (images.length > 1) {
            modal.querySelector(".c-prev").onclick = (e) => {
              e.stopPropagation();
              currentIndex = (currentIndex - 1 + images.length) % images.length;
              renderModalContent();
            };
            modal.querySelector(".c-next").onclick = (e) => {
              e.stopPropagation();
              currentIndex = (currentIndex + 1) % images.length;
              renderModalContent();
            };
          }
        };

        renderModalContent();
        document.body.appendChild(modal);
        modal.onclick = (e) => {
          if (e.target === modal) modal.remove();
        };
      };
    }

    // ── Bouton NEGO ────────────────────────────────────────────────────────
    bubble.querySelector(".nego-btn").onclick = (e) => {
      e.stopPropagation();
      try {
        const btn = e.currentTarget;
        const matchProfile = JSON.parse(
          btn.dataset.negoMatch.replace(/&quot;/g, '"'),
        );
        const userCriteria = JSON.parse(
          btn.dataset.negoCriteria.replace(/&quot;/g, '"'),
        );
        if (typeof window.openNegoModal === "function") {
          window.openNegoModal(matchProfile, userCriteria);
        } else {
          console.error(
            "[Nego] openNegoModal non disponible — vérifiez que negoModal.js est chargé",
          );
        }
      } catch (err) {
        console.error("[Nego] Erreur parsing profil:", err);
      }
    };

    // ── Favoris ────────────────────────────────────────────────────────────
    const favBtn = bubble.querySelector(".fav-btn");
    const favIcon = favBtn.querySelector(".fav-icon path");
    favBtn.onclick = async (e) => {
      e.stopPropagation();
      const wasActive = favBtn.classList.contains("fav-active");
      favBtn.classList.toggle("fav-active", !wasActive);
      favIcon.setAttribute("fill", wasActive ? "none" : "var(--rose)");
      favBtn.disabled = true;
      const ok = wasActive
        ? await removeFavorite(m.contact)
        : await addFavorite(m);
      favBtn.disabled = false;
      if (!ok) {
        favBtn.classList.toggle("fav-active", wasActive);
        favIcon.setAttribute("fill", wasActive ? "var(--rose)" : "none");
      }
    };

    row.appendChild(bubble);
    $("chat-box").appendChild(row);
  });

  // ── Carte Leaflet (code original conservé intégralement) ─────────────────
  document.querySelectorAll(".voir-carte-btn").forEach((btn) => {
    btn.onclick = () => {
      const modal = $("mapModal");
      modal.style.display = "flex";

      const isSeller = state.role === "seller";
      const matchLat = parseFloat(btn.dataset.lat);
      const matchLng = parseFloat(btn.dataset.lng);
      const buyerLat = parseFloat(btn.dataset.buyerLat);
      const buyerLng = parseFloat(btn.dataset.buyerLng);
      const userLat = !isNaN(buyerLat) ? buyerLat : 48.8566;
      const userLng = !isNaN(buyerLng) ? buyerLng : 2.3522;
      const userVille = isSeller
        ? "Acheteur potentiel"
        : state.criteria.ville || "Votre position";

      const mapEl = document.getElementById("map");
      mapEl.innerHTML = "";
      const map = L.map("map").setView(
        [(matchLat + userLat) / 2, (matchLng + userLng) / 2],
        11,
      );
      setTimeout(() => map.invalidateSize(), 150);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      const toleranceKm = state.criteria?.toleranceKm;
      if (!isSeller && toleranceKm && toleranceKm > 0) {
        L.circle([userLat, userLng], {
          radius: toleranceKm * 1000,
          color: "#818cf8",
          fillColor: "#818cf8",
          fillOpacity: 0.06,
          weight: 1.5,
          dashArray: "6 4",
        })
          .addTo(map)
          .bindTooltip(`Rayon de recherche : ${toleranceKm} km`, {
            permanent: false,
            direction: "top",
            className: "leaflet-tooltip-radius",
          });
      }

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

      L.polyline(
        [
          [userLat, userLng],
          [matchLat, matchLng],
        ],
        { color: lineColor, weight: 2.5, dashArray: "6 5", opacity: 0.85 },
      ).addTo(map);

      const userIcon = L.divIcon({
        html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);box-shadow:0 0 0 3px rgba(99,102,241,0.35),0 4px 12px rgba(99,102,241,0.5);"><svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const matchIcon = L.divIcon({
        html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#c084fc,#f472b6);clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);box-shadow:0 0 0 3px rgba(192,132,252,0.35),0 4px 12px rgba(244,114,182,0.5);"><svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      L.marker([userLat, userLng], { icon: userIcon })
        .addTo(map)
        .bindPopup(
          `<strong>📍 ${userVille}</strong><br><span style="font-size:11px;opacity:0.7">Votre position</span>`,
        )
        .openPopup();
      L.marker([matchLat, matchLng], { icon: matchIcon })
        .addTo(map)
        .bindPopup(
          `<strong>🏠 ${btn.dataset.ville}</strong><br><span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:20px;background:${lineColor}22;color:${lineColor};font-size:11px;font-weight:600;border:1px solid ${lineColor}44;">${distanceKm} km</span>`,
        );

      map.fitBounds(
        [
          [userLat, userLng],
          [matchLat, matchLng],
        ],
        { padding: [40, 40] },
      );

      $("closeModal").onclick = () => {
        modal.style.display = "none";
        map.remove();
      };
    };
  });

  if (postReply) addMessage({ text: postReply, from: "bot", typing: true });
  updateAIPanel(matches);
}

// ================== POPUP ÉTAT DU BIEN — BOOSTED ==================
function openEtatPopup() {
  const row = document.createElement("div");
  row.className = "msg bot structured";

  const ETAT_CONFIG = [
    {
      value: "neuf",
      label: "Neuf",
      icon: "✦",
      desc: "Jamais habité, livraison récente",
    },
    {
      value: "renove",
      label: "Rénové",
      icon: "◈",
      desc: "Travaux récents, état impeccable",
    },
    {
      value: "bon",
      label: "Bon état",
      icon: "◇",
      desc: "Entretenu, habitabilité immédiate",
    },
    {
      value: "a_rafraichir",
      label: "À rafraîchir",
      icon: "◉",
      desc: "Quelques travaux cosmétiques",
    },
    {
      value: "travaux",
      label: "Travaux",
      icon: "◌",
      desc: "Rénovation complète à prévoir",
    },
  ];

  row.innerHTML = `
    <div class="bubble saas-popup etat-popup">
      <div class="saas-popup-header">
        <div class="saas-popup-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="M9 21V12h6v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <h3 class="saas-popup-title">État général du bien</h3>
          <p class="saas-popup-sub">Sélectionnez la catégorie la plus proche</p>
        </div>
      </div>
      <div class="etat-grid">
        ${ETAT_CONFIG.map(
          ({ value, label, icon, desc }) => `
          <button class="etat-card" data-value="${value}">
            <span class="etat-card-icon">${icon}</span>
            <span class="etat-card-label">${label}</span>
            <span class="etat-card-desc">${desc}</span>
          </button>
        `,
        ).join("")}
      </div>
    </div>`;

  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));

  row.querySelectorAll(".etat-card").forEach((btn) => {
    btn.onclick = () => {
      row
        .querySelectorAll(".etat-card")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      setTimeout(() => {
        addMessage({
          text: btn.querySelector(".etat-card-label").innerText,
          from: "user",
        });
        row.remove();
        sendSpecialUpdate({
          etatBien: btn.dataset.value,
          message: "__ETAT_SELECTED__",
        });
      }, 250);
    };
  });
}

// ================== POPUP IMAGES — PRO CAROUSEL ==================
function openImagesPopup() {
  const MAX_IMAGES = 3;
  const row = document.createElement("div");
  row.className = "msg bot structured";

  row.innerHTML = `
    <div class="bubble saas-popup images-popup">
      <div class="saas-popup-header">
        <div class="saas-popup-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.6"/>
            <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div>
          <h3 class="saas-popup-title">Valorisation visuelle</h3>
          <p class="saas-popup-sub">Jusqu'à 3 photos pour attirer les acheteurs</p>
        </div>
      </div>

      <input type="file" id="images-input" multiple hidden accept="image/*" />

      <div class="img-stage" id="img-stage">
        <div class="img-drop-zone" id="upload-zone">
          <div class="img-drop-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <p class="img-drop-label">Déposer ou <span class="img-drop-link">parcourir</span></p>
          <p class="img-drop-hint">JPG, PNG — max 3 fichiers</p>
        </div>
      </div>

      <div class="img-carousel-wrap" id="carousel-wrap" style="display:none;">
        <button class="carousel-nav carousel-prev" id="carousel-prev" aria-label="Précédent">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="carousel-viewport" id="carousel-viewport">
          <div class="carousel-track" id="carousel-track"></div>
        </div>
        <button class="carousel-nav carousel-next" id="carousel-next" aria-label="Suivant">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <div class="img-counter" id="img-counter" style="display:none;">image <span id="counter-cur">1</span>/<span id="counter-tot">0</span></div>

      <div class="saas-popup-actions">
        <button class="btn-saas-ghost" id="skip-img">Passer</button>
        <button class="btn-saas-primary" id="valider-img" disabled>
          <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Valider les photos
        </button>
      </div>
    </div>`;

  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));

  const input = row.querySelector("#images-input");
  const stage = row.querySelector("#img-stage");
  const dropZone = row.querySelector("#upload-zone");
  const carouselWrap = row.querySelector("#carousel-wrap");
  const track = row.querySelector("#carousel-track");
  const counterWrap = row.querySelector("#img-counter");
  const counterCur = row.querySelector("#counter-cur");
  const counterTot = row.querySelector("#counter-tot");
  const prevBtn = row.querySelector("#carousel-prev");
  const nextBtn = row.querySelector("#carousel-next");
  const validerBtn = row.querySelector("#valider-img");
  const skipBtn = row.querySelector("#skip-img");

  let selectedFiles = [];
  let currentIndex = 0;

  function renderCarousel() {
    if (!selectedFiles.length) {
      carouselWrap.style.display = "none";
      counterWrap.style.display = "none";
      dropZone.style.display = "flex";
      validerBtn.disabled = true;
      return;
    }

    dropZone.style.display = "none";
    carouselWrap.style.display = "flex";
    counterWrap.style.display = "block";

    counterTot.textContent = selectedFiles.length;
    counterCur.textContent = currentIndex + 1;

    track.innerHTML = "";
    selectedFiles.forEach((f, i) => {
      const slide = document.createElement("div");
      slide.className =
        "carousel-slide" + (i === currentIndex ? " active" : "");
      slide.style.backgroundImage = `url(${URL.createObjectURL(f)})`;

      // Bouton suppression
      const removeBtn = document.createElement("button");
      removeBtn.className = "carousel-remove";
      removeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="13" height="13"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        selectedFiles.splice(i, 1);
        if (currentIndex >= selectedFiles.length)
          currentIndex = Math.max(0, selectedFiles.length - 1);
        renderCarousel();
      };
      slide.appendChild(removeBtn);
      track.appendChild(slide);
    });

    prevBtn.style.opacity = currentIndex === 0 ? "0.3" : "1";
    prevBtn.disabled = currentIndex === 0;
    nextBtn.style.opacity =
      currentIndex === selectedFiles.length - 1 ? "0.3" : "1";
    nextBtn.disabled = currentIndex === selectedFiles.length - 1;

    validerBtn.disabled = false;

    // Ajouter un slot "+" si < MAX_IMAGES
    if (selectedFiles.length < MAX_IMAGES) {
      const addSlide = document.createElement("button");
      addSlide.className = "carousel-add-slot";
      addSlide.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" width="22" height="22"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span>Ajouter</span>`;
      addSlide.onclick = () => input.click();
      track.appendChild(addSlide);
    }
  }

  prevBtn.onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderCarousel();
    }
  };
  nextBtn.onclick = () => {
    if (currentIndex < selectedFiles.length - 1) {
      currentIndex++;
      renderCarousel();
    }
  };

  dropZone.onclick = () => input.click();

  input.onchange = (e) => {
    const incoming = [...e.target.files];
    selectedFiles = [...selectedFiles, ...incoming].slice(0, MAX_IMAGES);
    currentIndex = selectedFiles.length - 1;
    renderCarousel();
    input.value = "";
  };

  skipBtn.onclick = () => {
    row.remove();
    state.ui.imagesPopupOpened = true;
    sendSpecialUpdate({ skipImages: true, message: "__IMAGES_SKIPPED__" });
  };

  validerBtn.onclick = async () => {
    const fd = new FormData();
    selectedFiles.forEach((f) => fd.append("images", f));
    validerBtn.innerHTML = `<span class="btn-loading"></span> Envoi…`;
    validerBtn.disabled = true;
    try {
      const res = await fetch("/api/upload-imagesbien", {
        method: "POST",
        headers: { Authorization: `Bearer ${state.user.token}` },
        body: fd,
      });
      const data = await res.json();
      row.remove();
      state.ui.imagesPopupOpened = true;
      sendSpecialUpdate({
        imagesbien: data.images,
        message: "__IMAGES_UPLOADED__",
      });
    } catch {
      validerBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Réessayer`;
      validerBtn.disabled = false;
    }
  };
}
// ================== EMPTY STATE CHAT ==================
function renderEmptyState() {
  const box = $("chat-box");
  if (!box) return;

  const isVendeur = state.role === "seller";

  const emptyEl = document.createElement("div");
  emptyEl.id = "chat-empty-state";
  emptyEl.className = "chat-empty-state";
  emptyEl.innerHTML = `
    <div class="ces-inner">
     <div class="ces-logo">
  <div class="ces-sleeping-wrap">
    <img src="./images/lizard.png" alt="Mascotte lézard" class="ces-lizard-img" />
    <div class="ces-zzz" aria-hidden="true">
      <span class="zzz z1">z</span>
      <span class="zzz z2">z</span>
      <span class="zzz z3">Z</span>
    </div>
  </div>
</div>
      <h2 class="ces-title">
        ${
          isVendeur
            ? "Valorisez votre bien,<br>l'IA fait le reste."
            : "Votre futur bien<br>vous attend ici."
        }
      </h2>
      <p class="ces-sub">
        ${
          isVendeur
            ? "Décrivez votre propriété à l'IA — elle analyse, valorise et identifie les acheteurs idéaux en temps réel."
            : "Parlez à l'IA de vos critères et laissez-la dénicher les biens qui vous correspondent vraiment."
        }
      </p>
      <div class="ces-hint">
        <span class="ces-hint-dot"></span>
        Commencez par écrire un message
      </div>
    </div>
  `;

  box.appendChild(emptyEl);
}
// ================== INITIALISATION ET RENDU ==================
function render() {
  const box = $("chat-box");
  if (!box) return;
  box.innerHTML = "";

  if (state.history.length > 0) {
    state.history.forEach((m) =>
      addMessage({
        text: m.content,
        from: m.role,
        structured: m.structured,
        persist: false,
      }),
    );
  } else {
    renderEmptyState(); // ← AJOUTER ICI
  }
  updateAIPanel();
  updateProgressBar();
  renderUserInfo();
}

function renderUserInfo() {
  const el = $("user-info");
  if (!el || !state.user) return;
  el.textContent = `Connecté : ${state.user.username} (${ROLE_LABELS[state.role] || state.role})`;
}

export function initChatbot() {
  if (state.ready) return;
  state.ready = true;

  initTheme();
  restoreSession();

  // S'assurer que state.ui contient le flag proximite
  if (!state.ui) {
    state.ui = {
      etatPopupOpened: false,
      imagesPopupOpened: false,
      niveauEnergetiquePopupOpened: false,
      proximitePopupOpened: false,
    };
  } else if (state.ui.proximitePopupOpened === undefined) {
    state.ui.proximitePopupOpened = false;
  }

  render();
  initSessionReplay(state);

  // Suggestions
  const suggestionsBox = $("chat-suggestions");
  const input = $("user-input");

  if (suggestionsBox && input) {
    suggestionsBox.addEventListener("click", (e) => {
      const btn = e.target.closest(".suggestion-btn");
      if (btn) {
        input.value = btn.innerText.trim();
        input.focus();
      }
    });
  }

  function initPanelActions() {
    // Bouton 1 — Mise en relation
    document.querySelector(".ai-btn.primary")?.addEventListener("click", () => {
      if (state.phase !== "results") {
        addMessage({
          text: "La mise en relation sera disponible une fois vos résultats affichés.",
          from: "bot",
          persist: false,
        });
        return;
      }
      // Déclencher le flow contact
      triggerContactFlow();
    });

    // Bouton 2 — Analyse marché
    document.querySelectorAll(".ai-btn")[1]?.addEventListener("click", () => {
      if (state.phase !== "results") {
        addMessage({
          text: "L'analyse de marché sera disponible une fois vos résultats affichés.",
          from: "bot",
          persist: false,
        });
        return;
      }
      triggerMarketAnalysis();
    });

    // Bouton 3 — Modifier critères
    document.querySelector(".ai-btn.ghost")?.addEventListener("click", () => {
      if (state.phase !== "results") {
        addMessage({
          text: "Vous pourrez modifier vos critères après le premier matching.",
          from: "bot",
          persist: false,
        });
        return;
      }
      triggerModifyCriteria();
    });
  }
  function triggerContactFlow() {
    const matches = state.lastMatches || [];
    if (!matches.length) {
      addMessage({
        text: "Aucun profil disponible pour la mise en relation. Relancez une recherche.",
        from: "bot",
        persist: false,
      });
      return;
    }

    state.ui.contactStep = "awaiting_profile_selection";

    // Construire la liste interactive des matchs
    const row = document.createElement("div");
    row.className = "msg bot structured";

    const isBuyer = state.role === "buyer";

    row.innerHTML = `
    <div class="bubble contact-select-card">
      <div class="contact-select-header">
        <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke="url(#grad-mail)" stroke-width="1.6"/>
          <path d="M22 6l-10 7L2 6" stroke="url(#grad-mail)" stroke-width="1.6" stroke-linecap="round"/>
          <defs>
            <linearGradient id="grad-mail" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#f472b6"/><stop offset="1" stop-color="#8b5cf6"/>
            </linearGradient>
          </defs>
        </svg>
        <span>Sélectionnez le profil à contacter</span>
      </div>
      <div class="contact-select-list">
        ${matches
          .map(
            (m, i) => `
          <button class="contact-select-item" data-index="${i}">
            <div class="csi-rank">${i + 1}</div>
            <div class="csi-info">
              <span class="csi-title">${isBuyer ? (m.type || "Bien") + " · " + m.ville : "Acheteur · " + m.ville}</span>
              <span class="csi-sub">${isBuyer ? (m.price || m.budgetMax || "N/A") + " €" : "Budget max " + (m.budgetMax || "N/A") + " €"}</span>
            </div>
            <div class="csi-compat">${m.compatibility}%</div>
          </button>
        `,
          )
          .join("")}
      </div>
      <button class="csi-cancel">Annuler</button>
    </div>`;

    $("chat-box").appendChild(row);
    scrollBottom($("chat-box"));

    row.querySelectorAll(".contact-select-item").forEach((btn) => {
      btn.onclick = async () => {
        const idx = parseInt(btn.dataset.index, 10);
        const selected = matches[idx];
        row.remove();
        state.ui.contactStep = null;

        addMessage({
          text: `Mise en relation avec le profil ${idx + 1} — ${selected.ville}`,
          from: "user",
        });

        await executeContactAction(idx, selected);
      };
    });

    row.querySelector(".csi-cancel").onclick = () => {
      row.remove();
      state.ui.contactStep = null;
    };
  }

  async function executeContactAction(matchIndex, targetMatch) {
    const thinkEl = addThinkingIndicator("action");

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.user.token}`,
        },
        body: JSON.stringify({
          message: `__ACTION_CONTACT__:${matchIndex}`,
        }),
      });

      const data = await res.json();
      thinkEl.remove();

      if (data.reply) {
        addMessage({ text: data.reply, from: "bot", typing: true });
      }

      if (data.messageSent) {
        // Badge visuel succès
        const successEl = document.createElement("div");
        successEl.className = "msg bot structured";
        successEl.innerHTML = `
        <div class="bubble action-success-card">
          <div class="asc-icon">✓</div>
          <div class="asc-text">
            <strong>Message envoyé</strong>
            <span>${targetMatch.contact}</span>
          </div>
        </div>`;
        $("chat-box").appendChild(successEl);
        scrollBottom($("chat-box"));
      }
    } catch (e) {
      thinkEl.remove();
      addMessage({ text: "Erreur lors de l'envoi. Réessayez.", from: "bot" });
    }
  }

  async function triggerMarketAnalysis() {
    addMessage({
      text: "Analysez le marché pour mes résultats actuels.",
      from: "user",
    });

    const thinkEl = addThinkingIndicator("action");

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.user.token}`,
        },
        body: JSON.stringify({
          message:
            "Analysez le marché immobilier actuel pour mes résultats et donnez-moi un diagnostic stratégique précis basé sur mes matchs.",
        }),
      });

      const data = await res.json();
      thinkEl.remove();

      if (data.reply) {
        addMessage({ text: data.reply, from: "bot", typing: true });
      }
    } catch (e) {
      thinkEl.remove();
      addMessage({ text: "Erreur lors de l'analyse.", from: "bot" });
    }
  }

  function triggerModifyCriteria() {
    const c = state.criteria;

    const lines = [];
    if (c.ville)
      lines.push(`
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path d="M12 21s-6-5.5-6-10a6 6 0 1112 0c0 4.5-6 10-6 10z" stroke="url(#grad-pin)" stroke-width="1.6"/>
        <defs>
          <linearGradient id="grad-pin" x1="0" y1="0" x2="24" y2="24">
            <stop stop-color="#f472b6"/><stop offset="1" stop-color="#8b5cf6"/>
          </linearGradient>
        </defs>
      </svg>
      Ville : <strong>${c.ville}</strong>`);

    if (c.toleranceKm != null)
      lines.push(`
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
    <circle cx="12" cy="12" r="8" stroke="url(#grad-radius)" stroke-width="1.6"/>
    <circle cx="12" cy="12" r="3" stroke="url(#grad-radius)" stroke-width="1.6"/>
    <defs>
      <linearGradient id="grad-radius" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#f472b6"/><stop offset="1" stop-color="#8b5cf6"/>
      </linearGradient>
    </defs>
  </svg>
  Rayon : <strong>${c.toleranceKm} km</strong>`);
    if (c.type)
      lines.push(`
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V10z" stroke="url(#grad-home)" stroke-width="1.6"/>
        <defs>
          <linearGradient id="grad-home" x1="0" y1="0" x2="24" y2="24">
            <stop stop-color="#f472b6"/><stop offset="1" stop-color="#8b5cf6"/>
          </linearGradient>
        </defs>
      </svg>
      Type : <strong>${c.type}</strong>`);

    if (c.budgetMin || c.budgetMax) {
      const b = c.budgetMax || c.budgetMin;
      lines.push(`
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
    <path d="M17 6a7 7 0 10 0 12" stroke="url(#grad-euro)" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M7 10h8M7 14h8" stroke="url(#grad-euro)" stroke-width="1.6" stroke-linecap="round"/>
    <defs>
      <linearGradient id="grad-euro" x1="0" y1="0" x2="24" y2="24">
        <stop stop-color="#f472b6"/><stop offset="1" stop-color="#8b5cf6"/>
      </linearGradient>
    </defs>
  </svg>
  Budget max : <strong>${b ? Number(b).toLocaleString("fr-FR") + " €" : "N/A"}</strong>`);
    }

    if (c.surfaceMin)
      lines.push(`
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="url(#grad-area)" stroke-width="1.6"/>
        <defs>
          <linearGradient id="grad-area" x1="0" y1="0" x2="24" y2="24">
            <stop stop-color="#f472b6"/><stop offset="1" stop-color="#8b5cf6"/>
          </linearGradient>
        </defs>
      </svg>
      Surface min : <strong>${c.surfaceMin} m²</strong>`);

    if (c.piecesMin)
      lines.push(`
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path d="M3 7h18M3 12h18M3 17h18" stroke="url(#grad-rooms)" stroke-width="1.6" stroke-linecap="round"/>
        <defs>
          <linearGradient id="grad-rooms" x1="0" y1="0" x2="24" y2="24">
            <stop stop-color="#f472b6"/><stop offset="1" stop-color="#8b5cf6"/>
          </linearGradient>
        </defs>
      </svg>
      Pièces min : <strong>${c.piecesMin}</strong>`);

    const row = document.createElement("div");
    row.className = "msg bot structured";
    row.innerHTML = `
    <div class="bubble modify-criteria-card">
      <div class="mc-header">
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="url(#grad-edit)" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="url(#grad-edit)" stroke-width="1.6" stroke-linecap="round"/>
          <defs>
            <linearGradient id="grad-edit" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#f472b6"/><stop offset="1" stop-color="#8b5cf6"/>
            </linearGradient>
          </defs>
        </svg>
        <span>Critères actuels</span>
      </div>
      <div class="mc-list">
        ${lines.length ? lines.map((l) => `<div class="mc-item">${l}</div>`).join("") : "<div class='mc-item'>Aucun critère enregistré</div>"}
      </div>
      <div class="mc-prompt">Qu'est-ce que vous souhaitez modifier ?</div>
    </div>`;

    $("chat-box").appendChild(row);
    scrollBottom($("chat-box"));

    // Signaler au serveur qu'on entre en mode modification
    sendResultsMessage("Je souhaite modifier mes critères de recherche.");
  }
  initPanelActions();

  $("chat-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("user-input");
    if (input.value.trim()) {
      sendMessage(input.value.trim());
      input.value = "";
    }
  });

  $("btn-logout")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  });

  log("✅ Chatbot initialisé — proximite activé");
}
