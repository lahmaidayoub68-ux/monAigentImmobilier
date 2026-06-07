/**
 * ============================================================
 * CHATBOT INIT — VERSION COMPLÈTE RESTAURÉE
 * ============================================================
 * Restaure TOUTES les fonctionnalités perdues:
 * - Pop-ups proximité, état, DPE (vendeur)
 * - Modals: Carte Leaflet, détails, negociation
 * - Actions panel (sans doublons)
 * - Upload fichiers
 * - PDF report
 * - Tous les critères affichés (panel droit)
 * ============================================================
 */

import { generateSessionPDF } from "./sessionReplay.js";
import { openNiveauEnergetiquePopup } from "./niveauEnergetiquePopup.js";
import { openProximitePopup } from "./proximitePopup.js";
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
  phase: null,
  lastMatches: [],
  ui: {
    etatPopupOpened: false,
    imagesPopupOpened: false,
    niveauEnergetiquePopupOpened: false,
    proximitePopupOpened: false,
    contactStep: null,
    modifyingCriteria: false,
  },
};

// ================== DOM & UTILS ==================
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
    proximite: Array.isArray(c.proximite) ? c.proximite : (c.proximite ?? null),
  };
}

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

function restoreSession() {
  const rawUser = localStorage.getItem("agent_user");
  if (!rawUser) return;
  try {
    state.user = JSON.parse(rawUser);
    state.role = state.user.role ?? null;
    state.criteria = load("criteria") ?? {};
    state.history = load("chat") ?? [];
    updateProfileUI();
  } catch (e) {
    err("Restore session:", e);
  }
}

function updateProfileUI() {
  if (!state.user) return;
  const nm = $("profile-name");
  const rl = $("profile-role");
  const av = $("profile-avatar");
  if (nm) nm.textContent = state.user.username || "Alexandre";
  if (rl) rl.textContent = ROLE_LABELS[state.role] || state.role || "Acheteur";
  if (av) av.textContent = (state.user.username || "A")[0].toUpperCase();
  const uit = $("user-info-text");
  if (uit)
    uit.textContent = `Connecté : ${state.user.username || "Alexandre"} (${ROLE_LABELS[state.role] || state.role || "Acheteur"})`;
}

// ================== PANEL ACTIONS LOCK/UNLOCK ==================
function unlockPanelActions() {
  [
    "btn-mise-relation",
    "btn-analyse-marche",
    "btn-modifier-criteres",
    "btn-rapport",
  ].forEach((id) => {
    const btn = $(id);
    if (btn) {
      btn.removeAttribute("disabled");
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
  });
}

function lockPanelActions() {
  [
    "btn-mise-relation",
    "btn-analyse-marche",
    "btn-modifier-criteres",
    "btn-rapport",
  ].forEach((id) => {
    const btn = $(id);
    if (btn) {
      btn.setAttribute("disabled", "true");
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
    }
  });
}

// ================== THINKING INDICATOR ==================
function addThinkingIndicator() {
  const box = $("chat-box");
  const el = document.createElement("div");
  el.className = "msg bot thinking-msg";
  el.innerHTML = `<span class="thinking-shimmer">Analyse en cours</span>`;
  box.appendChild(el);
  scrollBottom(box);
  return el;
}
// ================== MESSAGING ==================
function addMessage({
  text,
  from = "bot",
  structured = false,
  persist = true,
  typing = false,
}) {
  if (!text) return;

  const es = $("chat-empty-state");
  if (es) es.remove();

  const box = $("chat-box");
  const row = document.createElement("div");
  row.className = `msg ${from} ${structured ? "structured" : "text-msg"}`;
  if (from === "user") {
    row.innerHTML = `
      <div class="bubble-user">
        <div class="bu-text">${text}</div>
        <div class="bu-time">${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>`;
    box.appendChild(row);
  } else if (structured) {
    const c = document.createElement("div");
    c.innerHTML = text;
    row.appendChild(c);
    box.appendChild(row);
  } else {
    // Wrap the text and actions
    const contentWrap = document.createElement("div");
    contentWrap.style.flex = "1";
    contentWrap.style.minWidth = "0";

    const aiText = document.createElement("div");
    aiText.className = "ai-text";
    contentWrap.appendChild(aiText);

    // Barre d'actions (Copier)
    // REMPLACER le bloc actionsBar dans addMessage (branche bot non-structuré)
    const actionsBar = document.createElement("div");
    actionsBar.className = "msg-actions";
    actionsBar.innerHTML = `
  <button class="msg-action-copy" title="Copier">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  </button>`;

    const copyBtn = actionsBar.querySelector(".msg-action-copy");
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(aiText.innerText).then(() => {
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        }, 2000);
      });
    };

    contentWrap.appendChild(actionsBar);
    row.appendChild(contentWrap);
    box.appendChild(row);

    // Activer l'effet glow sur l'avatar du bot
    const avatarEl = row.querySelector(".bot-avatar");
    if (avatarEl) avatarEl.classList.add("generating");

    if (typing) {
      let i = 0;
      const full = text;
      aiText.innerHTML = "";

      // Typing effect plus naturel (légèrement aléatoire)
      function typeChar() {
        if (i < full.length) {
          aiText.innerHTML = full.substring(0, i + 1);
          i++;
          scrollBottom(box);
          // Vitesse aléatoire entre 2ms et 15ms pour faire humain
          setTimeout(typeChar, Math.random() * 13 + 2);
        } else {
          if (avatarEl) avatarEl.classList.remove("generating");
        }
      }
      typeChar();
    } else {
      aiText.innerHTML = text;
      if (avatarEl) avatarEl.classList.remove("generating");
    }
  }
  if (persist && state.user) {
    state.history.push({ role: from, content: text, structured });
    save("chat", state.history);
  }
  scrollBottom(box);
}

// ================== CORE MESSAGING LOGIC ==================
async function handleResultsResponse(data) {
  if (Array.isArray(data.matches) && data.matches.length > 0)
    state.lastMatches = data.matches;

  if (data.actionType === "criteria_updated_relaunch") {
    await relaunchMatching();
    return;
  }

  if (
    data.matchingDone &&
    Array.isArray(data.matches) &&
    data.matches.length > 0 &&
    data.postReply
  ) {
    renderMatches(data.matches, data.postReply);
    return;
  }

  if (data.actionType === "relaunch_done" && Array.isArray(data.matches)) {
    if (data.reply) addMessage({ text: data.reply, from: "bot", typing: true });
    renderMatches(data.matches, null);
    return;
  }

  const msg = data.reply || data.postReply;
  if (msg && !msg.trim().startsWith("{")) {
    addMessage({ text: msg, from: "bot", typing: true });
  }
}

async function relaunchMatching() {
  const thinkEl = addThinkingIndicator();
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
  const thinkEl = addThinkingIndicator();
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

async function sendSpecialUpdate(payload) {
  const thinkEl = addThinkingIndicator();
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
      updateAIPanel(state.lastMatches || []);
    }

    if (data.reply || data.message) {
      addMessage({
        text: data.reply || data.message,
        from: "bot",
        typing: true,
      });
    }

    // ── VENDEUR POPUPS CASCADE ────────────────────────────────────
    // APRÈS :
    if (data.triggerProximitePopup && !state.ui.proximitePopupOpened) {
      state.ui.proximitePopupOpened = true;
      openProximitePopup({ state, save, addMessage, sendProximite });
    } else if (data.triggerEtatBienPopup && !state.ui.etatPopupOpened) {
      state.ui.etatPopupOpened = true;
      setTimeout(() => openEtatPopup(), 800);
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
      setTimeout(() => openImagesPopup(), 800);
    } else if (Array.isArray(data.matches) && data.matches.length > 0) {
      renderMatches(data.matches, data.postReply);
    }
  } catch (e) {
    thinkEl.remove();
    addMessage({
      text: "Erreur de communication avec le serveur.",
      from: "bot",
    });
  }
}

async function sendMessage(text) {
  if (state.sending || !text) return;
  state.sending = true;
  addMessage({ text, from: "user" });

  const thinkEl = addThinkingIndicator();
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user?.token || ""}`,
      },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    thinkEl.remove();

    if (data.role) state.role = data.role;
    if (data.criteria) {
      state.criteria = normalizeCriteria({
        ...state.criteria,
        ...data.criteria,
      });
      save("criteria", state.criteria);
      updateAIPanel(data.matches || []);
    }

    // ── VENDEUR FLOW ──────────────────────────────────────────────
    if (state.role === "seller") {
      if (data.reply || data.message)
        addMessage({
          text: data.reply || data.message,
          from: "bot",
          typing: true,
        });
      // APRÈS (version avec import) :
      if (data.triggerProximitePopup && !state.ui.proximitePopupOpened) {
        state.ui.proximitePopupOpened = true;
        setTimeout(
          () => openProximitePopup({ state, save, addMessage, sendProximite }),
          800,
        );
        return;
      }
      if (data.triggerEtatBienPopup && !state.ui.etatPopupOpened) {
        state.ui.etatPopupOpened = true;
        setTimeout(() => openEtatPopup(), 800);
        return;
      }

      // APRÈS :
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
          800,
        );
        return;
      }
      if (data.triggerImagesPopup && !state.ui.imagesPopupOpened) {
        state.ui.imagesPopupOpened = true;
        setTimeout(openImagesPopup, 1200);
        return;
      }

      if (Array.isArray(data.matches) && data.matches.length > 0)
        renderMatches(data.matches, data.postReply);

      return;
    }

    // ── BUYER FLOW ────────────────────────────────────────────────
    if (data.matchingDone) {
      if (state.phase !== "results") {
        state.phase = "results";
        save("phase", "results");
        unlockPanelActions();
      }

      if (Array.isArray(data.matches) && data.matches.length > 0) {
        renderMatches(data.matches, data.postReply);
      } else {
        const msg = data.postReply || data.reply;
        if (msg) addMessage({ text: msg, from: "bot", typing: true });
      }
      return;
    }

    if (state.phase === "results") {
      await handleResultsResponse(data);
      return;
    }

    if (data.reply || data.message)
      addMessage({
        text: data.reply || data.message,
        from: "bot",
        typing: true,
      });
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

// ================== SPECIALIZED UPDATES ==================
async function sendProximite(val) {
  state.ui.proximitePopupOpened = true;
  state.criteria.proximite = Array.isArray(val) ? val : [];
  save("criteria", state.criteria);
  await sendSpecialUpdate({
    proximite: state.criteria.proximite,
    message: "__PROXIMITE_SELECTED__",
  });
}

async function sendEtatBien(val) {
  state.ui.etatPopupOpened = true;
  await sendSpecialUpdate({
    etatBien: val,
    message: "__ETAT_SELECTED__",
  });
}

async function sendNiveauEnergetique(val) {
  state.ui.niveauEnergetiquePopupOpened = true;
  await sendSpecialUpdate({
    niveauEnergetique: val,
    message: "__NIVEAU_ENERGETIQUE_SELECTED__",
  });
}

// ================== AI PANEL UPDATE ==================
function updateAIPanel(matches = []) {
  const c = state.criteria;

  if ($("ai-ville")) $("ai-ville").textContent = c.ville || "En attente";
  if ($("ai-budget"))
    $("ai-budget").textContent =
      c.budgetMax || c.budgetMin
        ? `${Number(c.budgetMax || c.budgetMin).toLocaleString("fr-FR")} €`
        : "En attente";
  if ($("ai-surface"))
    $("ai-surface").textContent = c.surfaceMin
      ? `${c.surfaceMin} m²`
      : "En attente";
  if ($("ai-pieces"))
    $("ai-pieces").textContent = c.piecesMin
      ? `${c.piecesMin} pièces`
      : "En attente";
  if ($("ai-tolerance"))
    $("ai-tolerance").textContent = c.toleranceKm
      ? `${c.toleranceKm} km`
      : "En attente";

  if (!matches.length) {
    if ($("ai-statut")) $("ai-statut").textContent = "En attente de résultats";
    return;
  }

  let totalCompat = 0;
  matches.forEach((m) => (totalCompat += m.compatibility || 0));
  const avgCompat = Math.round(totalCompat / matches.length);

  if ($("ai-statut"))
    $("ai-statut").textContent = `${matches.length} profils (${avgCompat}%)`;
}

// ================== FAVORIS ==================
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
    const res = await fetch(`${API_BASE}/api/favorites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user.token}`,
      },
      body: JSON.stringify({
        ...match,
        lat: match.lat ?? match.buyerLat ?? null,
        lng: match.lng ?? match.buyerLng ?? null,
        buyerLat: match.buyerLat ?? match.lat ?? null,
        buyerLng: match.buyerLng ?? match.lng ?? null,
      }),
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

// ================== RENDER MATCHES ==================
async function renderMatches(matches, postReply) {
  state.lastMatches = matches;
  state.phase = "results";
  save("phase", "results");
  save("lastMatches", matches);
  unlockPanelActions();

  addMessage({
    text: `<strong>${matches.length} profil(s) pertinent(s)</strong> identifié(s) par le Cerveau IA :`,
    from: "bot",
    structured: false,
  });

  const existingFavs = await loadFavorites();

  matches.forEach((m, matchIdx) => {
    const row = document.createElement("div");
    row.className = "msg bot structured";
    const wrap = document.createElement("div");
    wrap.className = "match-card-wrap";

    const commonHTML = (m.common || [])
      .map((c) => `<span class="pill pill-common">${c}</span>`)
      .join("");
    const differentHTML = (m.different || [])
      .map((d) => `<span class="pill pill-different">${d}</span>`)
      .join("");

    const isFav = existingFavs.has(m.contact);

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

    const compatColor =
      m.compatibility >= 80
        ? "#10b981"
        : m.compatibility >= 60
          ? "#818cf8"
          : m.compatibility >= 40
            ? "#f59e0b"
            : "#ef4444";

    wrap.innerHTML = `
      <div class="mc-header">
        <div>
          <div class="mc-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>${m.type || "Bien"}</div>
          <div class="mc-title">${m.type || "Bien"} · ${m.ville}</div>
        </div>
        <div class="mc-actions">
          ${m.role === "seller" ? `<button class="mc-icon-btn details-btn" title="Voir détails"><svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></button>` : ""}
          <button class="mc-icon-btn fav-btn${isFav ? " fav-active" : ""}" data-contact="${m.contact}" title="${isFav ? "Retirer des favoris" : "Ajouter aux favoris"}">
            <svg viewBox="0 0 24 24"><path d="M12 2.5l2.63 5.33 5.87.85-4.25 4.14 1 5.85L12 16.15l-5.25 2.52 1-5.85L3.5 8.68l5.87-.85z" fill="${isFav ? "#f472b6" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
      <div class="mc-grid">
        <div class="mc-cell"><div class="mc-cell-label">Prix</div><div class="mc-cell-value price">${Number(m.price || m.budgetMax || 0).toLocaleString("fr-FR")} €</div></div>
        <div class="mc-cell"><div class="mc-cell-label">Surface</div><div class="mc-cell-value">${m.surface || m.surfaceMin || "N/A"} m²</div></div>
        <div class="mc-cell"><div class="mc-cell-label">Pièces</div><div class="mc-cell-value">${m.pieces || m.piecesMin || "N/A"} p.</div></div>
        <div class="mc-cell"><div class="mc-cell-label">Contact</div><div class="mc-cell-value" style="font-size:12px;font-weight:500;color:#7c7aa0">${m.contact || "N/A"}</div></div>
      </div>
      ${m.common?.length || m.different?.length ? `<div class="mc-pills">${commonHTML}${differentHTML}</div>` : ""}
      <div class="mc-footer">
        <div class="compat-wrap">
          <div class="compat-header"><span class="compat-pct" style="color:${compatColor}">${m.compatibility}%</span><span class="compat-label">compatibilité</span></div>
          <div class="compat-bar"><div class="compat-bar-inner" style="width:${m.compatibility}%;background:linear-gradient(90deg,${compatColor},${compatColor}aa)"></div></div>
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;">
          <button class="mc-btn mc-btn-nego" data-nego-match="${matchJson}" data-nego-criteria="${criteriaJson}"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>Simuler</button>
          <button class="mc-btn mc-btn-map voir-carte-btn" data-lat="${m.lat ?? m.buyerLat ?? 48.8566}" data-lng="${m.lng ?? m.buyerLng ?? 2.3522}" data-buyer-lat="${m.buyerLat ?? m.lat ?? 48.8566}" data-buyer-lng="${m.buyerLng ?? m.lng ?? 2.3522}" data-ville="${m.ville}"><svg viewBox="0 0 24 24"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Carte</button>
        </div>
      </div>
    `;

    // ── DETAILS MODAL (VENDEUR UNIQUEMENT) ────────────────────────
    if (m.role === "seller") {
      wrap.querySelector(".details-btn").onclick = () => openDetailsModal(m);
    }

    // ── NEGO BUTTON ────────────────────────────────────────────────
    wrap.querySelector(".mc-btn-nego").onclick = (e) => {
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
          console.warn("[Nego] openNegoModal non disponible");
        }
      } catch (err) {
        console.error("[Nego] Parse error:", err);
      }
    };

    // ── FAVORIS BUTTON ────────────────────────────────────────────
    const favBtn = wrap.querySelector(".fav-btn");
    favBtn.onclick = async (e) => {
      e.stopPropagation();
      const wasActive = favBtn.classList.contains("fav-active");
      favBtn.classList.toggle("fav-active", !wasActive);
      favBtn.disabled = true;
      const ok = wasActive
        ? await removeFavorite(m.contact)
        : await addFavorite(m);
      favBtn.disabled = false;
      if (!ok) {
        favBtn.classList.toggle("fav-active", wasActive);
      }
    };

    // ── CARTE BUTTON ───────────────────────────────────────────────
    wrap.querySelector(".voir-carte-btn").onclick = () => openMapModal(m);

    // APRÈS
    // Projection de compatibilité (ancien comportement restauré)
    try {
      const projHTML = renderProjectionHTML(m, state.criteria);
      if (projHTML) {
        const projEl = document.createElement("div");
        projEl.innerHTML = projHTML;
        if (projEl.firstElementChild)
          wrap.appendChild(projEl.firstElementChild);
      }
    } catch (e) {
      /* renderProjectionHTML optionnel */
    }

    row.appendChild(wrap);
    $("chat-box").appendChild(row);
  });

  if (postReply) addMessage({ text: postReply, from: "bot", typing: true });
  updateAIPanel(matches);
}

// ================== MODALS ==================
function openDetailsModal(m) {
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
    if (!items.length)
      return `<p style="font-size:12px;color:#64748b;margin:0;font-style:italic">Non renseigné</p>`;
    return items
      .map((item) => {
        const parts = item.split(" : ");
        const type = parts.length > 1 ? parts[0].trim() : "Lieu";
        const name = parts.length > 1 ? parts[1].trim() : item;
        const color = getInfraColor(type);
        return `<span class="prox-detail-chip" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;margin:2px;border-radius:20px;font-size:11px;font-weight:500;background:${color}1A;border:1px solid ${color}55;"><span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0"></span><span style="color:${color};font-weight:600">${type}</span><span style="color:${color};opacity:0.85">${name}</span></span>`;
      })
      .join("");
  }

  const renderContent = () => {
    const hasImages = images.length > 0;
    modal.innerHTML = `
      <div class="details-popup-content">
        <div class="details-header">
          Détails de l'annonce
          <button class="close-details-btn">&times;</button>
        </div>
        ${
          hasImages
            ? `
          <div class="details-carousel-container">
            <div class="details-img-wrapper">
              <img src="${images[currentIndex]}" class="details-main-img" alt="Bien"/>
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

    modal.querySelector(".close-details-btn").onclick = () => modal.remove();

    if (images.length > 1) {
      modal.querySelector(".c-prev").onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        renderContent();
      };
      modal.querySelector(".c-next").onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex + 1) % images.length;
        renderContent();
      };
    }
  };

  renderContent();
  document.body.appendChild(modal);
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

function openMapModal(m) {
  const modal = $("mapModal");
  modal.style.display = "flex";

  const isSeller = state.role === "seller";
  const matchLat = parseFloat(m.lat ?? m.buyerLat ?? 48.8566);
  const matchLng = parseFloat(m.lng ?? m.buyerLng ?? 2.3522);
  const buyerLat = parseFloat(m.buyerLat ?? m.lat ?? 48.8566);
  const buyerLng = parseFloat(m.buyerLng ?? m.lng ?? 2.3522);
  const userLat = buyerLat;
  const userLng = buyerLng;
  const userVille = isSeller
    ? "Acheteur potentiel"
    : state.criteria.ville || "Votre position";

  const mapEl = document.getElementById("map");
  mapEl.innerHTML = "";

  if (typeof L === "undefined") {
    addMessage({ text: "Erreur: Leaflet non chargé", from: "bot" });
    return;
  }

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
      .bindTooltip(`Rayon : ${toleranceKm} km`, { permanent: false });
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
    html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);box-shadow:0 0 0 3px rgba(99,102,241,.35),0 4px 12px rgba(99,102,241,.5)"><svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

  const matchIcon = L.divIcon({
    html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#c084fc,#f472b6);clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);box-shadow:0 0 0 3px rgba(192,132,252,.35),0 4px 12px rgba(244,114,182,.5)"><svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>`,
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
      `<strong>🏠 ${m.ville}</strong><br><span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:20px;background:${lineColor}22;color:${lineColor};font-size:11px;font-weight:600;border:1px solid ${lineColor}44;">${distanceKm} km</span>`,
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
}

// ================== POPUPS VENDEUR ==================

function openEtatPopup() {
  const row = document.createElement("div");
  row.className = "msg bot structured";

  const ETAT_OPTIONS = [
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

  const html = `
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
        ${ETAT_OPTIONS.map(
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

  row.innerHTML = html;
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
          text: btn.querySelector(".etat-card-label").textContent,
          from: "user",
        });
        row.remove();
        sendEtatBien(btn.dataset.value);
      }, 250);
    };
  });
}

// ================== POPUP IMAGES — PRO CAROUSEL (CORRIGÉ) ==================
function openImagesPopup() {
  const MAX_IMAGES = 3;
  const row = document.createElement("div");
  row.className = "msg bot structured";

  row.innerHTML = `
    <div class="bubble saas-popup images-popup" style="max-width:420px;width:100%">
      <div class="saas-popup-header">
        <div class="saas-popup-icon">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div>
          <h3 class="saas-popup-title">Valorisation visuelle</h3>
          <p class="saas-popup-sub">Jusqu'à 3 photos pour attirer les acheteurs</p>
        </div>
      </div>
      <input type="file" id="images-input-popup" multiple hidden accept="image/*"/>
      <div id="img-stage-popup">
        <div class="img-drop-zone" id="upload-zone-popup">
          <div><svg viewBox="0 0 24 24" fill="none" width="32" height="32"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <p class="img-drop-label">Déposer ou <span class="img-drop-link">parcourir</span></p>
          <p class="img-drop-hint">JPG, PNG — max 3 fichiers</p>
        </div>
      </div>
      <div class="img-carousel-wrap" id="carousel-wrap-popup" style="display:none">
        <button class="carousel-nav" id="carousel-prev-popup"><svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="carousel-viewport"><div class="carousel-track" id="carousel-track-popup"></div></div>
        <button class="carousel-nav" id="carousel-next-popup"><svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div class="img-counter" id="img-counter-popup" style="display:none">image <span id="counter-cur-popup">1</span>/<span id="counter-tot-popup">0</span></div>
      <div class="saas-popup-actions">
        <button class="btn-saas-ghost" id="skip-img-popup">Passer</button>
        <button class="btn-saas-primary" id="valider-img-popup" disabled>
          <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Valider les photos
        </button>
      </div>
    </div>`;

  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));

  const input = row.querySelector("#images-input-popup");
  const dropZone = row.querySelector("#upload-zone-popup");
  const carouselWrap = row.querySelector("#carousel-wrap-popup");
  const track = row.querySelector("#carousel-track-popup");
  const counterWrap = row.querySelector("#img-counter-popup");
  const counterCur = row.querySelector("#counter-cur-popup");
  const counterTot = row.querySelector("#counter-tot-popup");
  const prevBtn = row.querySelector("#carousel-prev-popup");
  const nextBtn = row.querySelector("#carousel-next-popup");
  const validerBtn = row.querySelector("#valider-img-popup");
  const skipBtn = row.querySelector("#skip-img-popup");

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
    if (selectedFiles.length < MAX_IMAGES) {
      const addSlide = document.createElement("button");
      addSlide.className = "carousel-add-slot";
      addSlide.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="22" height="22"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Ajouter</span>`;
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
        headers: { Authorization: `Bearer ${state.user?.token || ""}` },
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

// ================== EMPTY STATE ==================
function renderEmptyState() {
  const box = $("chat-box");
  if (!box) return;

  const isVendeur = state.role === "seller";
  const emptyEl = document.createElement("div");
  emptyEl.id = "chat-empty-state";
  emptyEl.className = "chat-empty-state";

  // Les 4 cartes avec les SVG pro
  const cardsHTML = `
  <div class="ces-cards">
    <div class="ces-card" data-prompt="Je veux acheter une maison">
      <div class="ces-card-icon c1">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
      </div>
      <span class="ces-card-title">Je veux acheter<br>une maison</span>
    </div>
    <div class="ces-cards-bottom-row">
      <div class="ces-card" data-prompt="Estimer mon bien pour vendre">
        <div class="ces-card-icon c2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line><polyline points="4 10 12 2 20 10"></polyline></svg>
        </div>
        <span class="ces-card-title">Estimer mon<br>bien pour vendre</span>
      </div>
      <div class="ces-card" data-prompt="Recherche sur Paris avec 3 pièces">
        <div class="ces-card-icon c3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
        </div>
        <span class="ces-card-title">Paris<br>3 pièces</span>
      </div>
      <div class="ces-card" data-prompt="Analyse du marché actuel">
        <div class="ces-card-icon c4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
        </div>
        <span class="ces-card-title">Marché<br>actuel</span>
      </div>
    </div>
  </div>`;

  emptyEl.innerHTML = `
    <div class="ces-inner">
      <div class="ces-badge"><span class="ces-badge-dot"></span>Cerveau IA actif</div>
      <div class="ces-sparkle">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
      </div>
      <h2 class="ces-title">${isVendeur ? "Valorisez votre bien, l'IA fait le reste." : "Votre futur bien vous attend ici."}</h2>
      <p class="ces-sub">${isVendeur ? "Décrivez votre propriété à l'IA — elle analyse, valorise et identifie les acheteurs idéaux en temps réel." : "Parlez à l'IA de vos critères et laissez-la dénicher les biens<br>qui vous correspondent vraiment."}</p>
      ${cardsHTML}
    </div>`;

  box.appendChild(emptyEl);

  // Écouteur de clic pour auto-remplir l'input en bas
  emptyEl.querySelectorAll(".ces-card").forEach((card) => {
    card.addEventListener("click", () => {
      const input = $("user-input");
      if (input) {
        input.value = card.dataset.prompt || "";
        input.focus();
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
      }
    });
  });
}

// ================== PANEL ACTIONS ==================
function initPanelActions() {
  const btnMise = $("btn-mise-relation");
  const btnAnalyse = $("btn-analyse-marche");
  const btnModifier = $("btn-modifier-criteres");
  const btnRapport = $("btn-rapport");

  // Éviter les doublons en supprimant les anciens listeners
  if (btnMise) {
    btnMise.onclick = null;
    btnMise.addEventListener("click", triggerContactFlow);
  }

  if (btnAnalyse) {
    btnAnalyse.onclick = null;
    btnAnalyse.addEventListener("click", triggerMarketAnalysis);
  }

  if (btnModifier) {
    btnModifier.onclick = null;
    btnModifier.addEventListener("click", triggerModifyCriteria);
  }

  if (btnRapport) {
    btnRapport.onclick = null;
    btnRapport.addEventListener("click", triggerPDFReport);
  }
}

function triggerContactFlow() {
  const matches = state.lastMatches || [];
  if (!matches.length) {
    addMessage({
      text: "Aucun profil disponible pour la mise en relation.",
      from: "bot",
      persist: false,
    });
    return;
  }

  state.ui.contactStep = "awaiting_profile_selection";

  const row = document.createElement("div");
  row.className = "msg bot structured";
  const isBuyer = state.role === "buyer";

  row.innerHTML = `
    <div class="bubble contact-select-card">
      <div class="contact-select-header">
        <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke="#f472b6" stroke-width="1.6"/><path d="M22 6l-10 7L2 6" stroke="#8b5cf6" stroke-width="1.6" stroke-linecap="round"/></svg>
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
  const thinkEl = addThinkingIndicator();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user.token}`,
      },
      body: JSON.stringify({ message: `__ACTION_CONTACT__:${matchIndex}` }),
    });

    const data = await res.json();
    thinkEl.remove();

    if (data.reply) {
      addMessage({ text: data.reply, from: "bot", typing: true });
    }

    if (data.messageSent) {
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
    addMessage({ text: "Erreur lors de l'envoi.", from: "bot" });
  }
}

async function triggerMarketAnalysis() {
  addMessage({
    text: "Analysez le marché pour mes résultats actuels.",
    from: "user",
  });

  const thinkEl = addThinkingIndicator();

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

  if (c.ville) lines.push(`Ville : <strong>${c.ville}</strong>`);
  if (c.toleranceKm != null)
    lines.push(`Rayon : <strong>${c.toleranceKm} km</strong>`);
  if (c.type) lines.push(`Type : <strong>${c.type}</strong>`);
  if (c.budgetMin || c.budgetMax) {
    const b = c.budgetMax || c.budgetMin;
    lines.push(
      `Budget max : <strong>${b ? Number(b).toLocaleString("fr-FR") + " €" : "N/A"}</strong>`,
    );
  }
  if (c.surfaceMin)
    lines.push(`Surface min : <strong>${c.surfaceMin} m²</strong>`);
  if (c.piecesMin) lines.push(`Pièces min : <strong>${c.piecesMin}</strong>`);

  const row = document.createElement("div");
  row.className = "msg bot structured";

  row.innerHTML = `
    <div class="bubble modify-criteria-card">
      <div class="mc-header">
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="#f472b6" stroke-width="1.6" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#8b5cf6" stroke-width="1.6" stroke-linecap="round"/></svg>
        <span>Critères actuels</span>
      </div>
      <div class="mc-list">
        ${lines.length ? lines.map((l) => `<div class="mc-item">${l}</div>`).join("") : '<div class="mc-item">Aucun critère enregistré</div>'}
      </div>
      <div class="mc-prompt">Qu'est-ce que vous souhaitez modifier ?</div>
    </div>`;

  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));

  sendResultsMessage("Je souhaite modifier mes critères de recherche.");
}

async function triggerPDFReport() {
  const thinkEl = addThinkingIndicator();

  try {
    if (!state.history || state.history.length === 0) {
      thinkEl.remove();
      showFloatingToast("Démarrez une conversation d'abord", "error");
      return;
    }

    generateSessionPDF(state);

    thinkEl.remove();
    showFloatingToast("✓ Rapport PDF téléchargé");
  } catch (e) {
    console.error("[PDF REPORT ERROR]", e);

    thinkEl.remove();
    showFloatingToast("Erreur lors de la génération du PDF", "error");
  }
}

// Toast flottant léger (sans polluer le chat)
function showFloatingToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `floating-toast floating-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 350);
  }, 2800);
}

// ================== RENDER & INIT ==================
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
    renderEmptyState();
  }

  updateAIPanel();
}
// ================== PROJET STATE ==================
const projectState = {
  currentProject: null, // { id, name, color }
  currentChatId: null, // id du chat sauvegardé en DB
  isSaved: false, // le chat courant est-il sauvegardé ?
};

// ================== INIT SIDEBAR PROJET ==================
function initProjectSidebar() {
  loadCurrentProjectBadge();

  const btnNew = document.querySelector(".btn-new-project");
  if (btnNew) {
    btnNew.onclick = (e) => {
      e.preventDefault();
      openNewProjectPopup();
    };
  }

  const btnSave = $("btn-save-session");
  if (btnSave) {
    btnSave.onclick = () => openSaveSessionPopup();
  }
}
// ================== POP-UP SAVE SESSION (UNIFIÉ) ==================
async function openSaveSessionPopup() {
  if (state.history.length === 0) {
    showProjectToast("Aucun message à sauvegarder", "warn");
    return;
  }

  const existing = document.getElementById("save-session-overlay");
  if (existing) existing.remove();

  // Charger les projets existants
  let existingProjects = [];
  try {
    const res = await fetch(`${API_BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${state.user.token}` },
    });
    if (res.ok) existingProjects = await res.json();
  } catch {}

  const autoTitle = generateChatTitle();
  const overlay = document.createElement("div");
  overlay.id = "save-session-overlay";
  overlay.className = "project-popup-overlay";

  overlay.innerHTML = `
    <div class="project-popup" style="max-width:480px">
      <div class="project-popup-header">
        <div class="project-popup-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
        </div>
        <div>
          <h3 class="project-popup-title">Enregistrer la session</h3>
          <p class="project-popup-sub">${state.history.length} message(s) · ${state.lastMatches?.length || 0} match(es)</p>
        </div>
        <button class="project-popup-close" id="close-save-session">&times;</button>
      </div>

      <div class="project-popup-body">
        <div class="ppf-group">
          <label class="ppf-label">Titre de la conversation</label>
          <input type="text" id="session-title-input" class="ppf-input" value="${autoTitle}" maxlength="80" />
        </div>

        <!-- CHOIX : projet existant OU nouveau projet -->
        <div class="ppf-group">
          <label class="ppf-label">Affilier à un projet</label>
          <div id="project-choice-tabs" style="display:flex;gap:8px;margin-bottom:12px;">
            <button class="ppf-tab-btn active" id="tab-existing" onclick="switchSaveTab('existing')" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:.18s;border:1px solid rgba(139,92,246,.4);background:rgba(139,92,246,.12);color:#a78bfa;font-family:inherit">
              Projet existant
            </button>
            <button class="ppf-tab-btn" id="tab-new" onclick="switchSaveTab('new')" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:.18s;border:1px solid var(--border-mid);background:var(--bg-surface);color:var(--text-muted);font-family:inherit">
              Nouveau projet
            </button>
          </div>

          <!-- PANEL : projets existants -->
          <div id="panel-existing">
            ${
              existingProjects.length === 0
                ? `<div style="padding:16px;text-align:center;font-size:13px;color:var(--text-muted);font-style:italic;border:1px dashed var(--border-mid);border-radius:10px;">
                  Aucun projet existant.<br>Créez-en un via l'onglet "Nouveau projet".
                </div>`
                : `<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;">
                  ${existingProjects
                    .map(
                      (p) => `
                    <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border-mid);cursor:pointer;transition:.15s;" class="project-select-row" onmouseenter="this.style.borderColor='rgba(139,92,246,.4)'" onmouseleave="this.style.borderColor=''">
                      <input type="radio" name="save-project" value="${p.id}" data-name="${p.name}" data-color="${p.color || "#8b5cf6"}" style="accent-color:var(--violet)"/>
                      <span style="width:10px;height:10px;border-radius:50%;background:${p.color || "#8b5cf6"};flex-shrink:0"></span>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${p.chat_count || 0} conversation(s)</div>
                      </div>
                    </label>
                  `,
                    )
                    .join("")}
                </div>`
            }
          </div>

          <!-- PANEL : nouveau projet -->
          <div id="panel-new" style="display:none">
            <div class="ppf-group" style="margin-bottom:10px">
              <label class="ppf-label">Nom du projet <span style="color:#f472b6">*</span></label>
              <input type="text" id="new-project-name-inline" class="ppf-input" placeholder="Ex: Achat Paris 3 pièces" maxlength="60"/>
            </div>
            <div class="ppf-group">
              <label class="ppf-label">Couleur</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;" id="inline-colors">
                ${[
                  "#8b5cf6",
                  "#6366f1",
                  "#f472b6",
                  "#10b981",
                  "#f59e0b",
                  "#3b82f6",
                ]
                  .map(
                    (c, i) =>
                      `<button onclick="selectInlineColor('${c}',this)" style="width:26px;height:26px;border-radius:50%;background:${c};border:${i === 0 ? "2px solid #fff" : "2px solid transparent"};cursor:pointer;transition:.18s" data-color="${c}"></button>`,
                  )
                  .join("")}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="project-popup-footer">
        <button class="ppf-btn-ghost" id="cancel-save-session">Annuler</button>
        <button class="ppf-btn-primary" id="confirm-save-session">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          Enregistrer
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Tab switch
  window.switchSaveTab = (tab) => {
    const isExisting = tab === "existing";
    document.getElementById("panel-existing").style.display = isExisting
      ? ""
      : "none";
    document.getElementById("panel-new").style.display = isExisting
      ? "none"
      : "";
    document.getElementById("tab-existing").style.background = isExisting
      ? "rgba(139,92,246,.12)"
      : "var(--bg-surface)";
    document.getElementById("tab-existing").style.color = isExisting
      ? "#a78bfa"
      : "var(--text-muted)";
    document.getElementById("tab-existing").style.borderColor = isExisting
      ? "rgba(139,92,246,.4)"
      : "var(--border-mid)";
    document.getElementById("tab-new").style.background = !isExisting
      ? "rgba(139,92,246,.12)"
      : "var(--bg-surface)";
    document.getElementById("tab-new").style.color = !isExisting
      ? "#a78bfa"
      : "var(--text-muted)";
    document.getElementById("tab-new").style.borderColor = !isExisting
      ? "rgba(139,92,246,.4)"
      : "var(--border-mid)";
  };

  // Color picker inline
  let selectedInlineColor = "#8b5cf6";
  window.selectInlineColor = (color, btn) => {
    selectedInlineColor = color;
    document
      .querySelectorAll("#inline-colors button")
      .forEach((b) => (b.style.border = "2px solid transparent"));
    btn.style.border = "2px solid #fff";
  };

  overlay.querySelector("#close-save-session").onclick = overlay.querySelector(
    "#cancel-save-session",
  ).onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  overlay.querySelector("#confirm-save-session").onclick = async () => {
    const title =
      overlay.querySelector("#session-title-input").value.trim() || autoTitle;
    const btn = overlay.querySelector("#confirm-save-session");
    const isNewTab =
      document.getElementById("panel-new").style.display !== "none";

    btn.innerHTML = `<span class="btn-loading"></span> Sauvegarde…`;
    btn.disabled = true;

    try {
      let projectId;
      let projectName;
      let projectColor;

      if (isNewTab) {
        // Créer un nouveau projet d'abord
        const newName = document
          .getElementById("new-project-name-inline")
          .value.trim();
        if (!newName) {
          document
            .getElementById("new-project-name-inline")
            .classList.add("ppf-error");
          btn.disabled = false;
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Enregistrer`;
          return;
        }
        const pRes = await fetch(`${API_BASE}/api/projects`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${state.user.token}`,
          },
          body: JSON.stringify({ name: newName, color: selectedInlineColor }),
        });
        const pData = await pRes.json();
        if (!pData.id) throw new Error("Erreur création projet");
        projectId = pData.id;
        projectName = newName;
        projectColor = selectedInlineColor;
        projectState.currentProject = {
          id: projectId,
          name: projectName,
          color: projectColor,
        };
        localStorage.setItem(
          "aigent_current_project",
          JSON.stringify(projectState.currentProject),
        );
        renderProjectBadge(projectState.currentProject);
      } else {
        // Projet existant sélectionné via radio
        const selected = overlay.querySelector(
          'input[name="save-project"]:checked',
        );
        if (!selected && existingProjects.length > 0) {
          showProjectToast("Sélectionnez un projet", "warn");
          btn.disabled = false;
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Enregistrer`;
          return;
        }
        if (!selected) {
          overlay.remove();
          return;
        }
        projectId = parseInt(selected.value, 10);
        projectName = selected.dataset.name;
        projectColor = selected.dataset.color;
      }

      // Sauvegarder le chat dans ce projet
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.user.token}`,
        },
        body: JSON.stringify({
          title,
          messages: state.history,
          criteria: state.criteria,
          phase: state.phase || "collecting",
          lastMatches: state.lastMatches || [],
        }),
      });
      const data = await res.json();
      if (!data.chatId) throw new Error();

      projectState.currentChatId = data.chatId;
      projectState.isSaved = true;
      overlay.remove();
      showProjectToast(
        `✓ Session enregistrée dans "${projectName}"`,
        projectColor,
      );
      updateSaveButtonState();
    } catch {
      btn.innerHTML = `Réessayer`;
      btn.disabled = false;
      showProjectToast("Erreur lors de la sauvegarde", "error");
    }
  };

  // Si pas de projets existants, basculer sur "nouveau projet" directement
  if (existingProjects.length === 0) {
    window.switchSaveTab("new");
  }

  setTimeout(() => overlay.querySelector("#session-title-input")?.focus(), 100);
}
function loadCurrentProjectBadge() {
  const stored = localStorage.getItem("aigent_current_project");
  if (stored) {
    try {
      projectState.currentProject = JSON.parse(stored);
      renderProjectBadge(projectState.currentProject);
    } catch {}
  }
}

function renderProjectBadge(project) {
  const badge = $("current-project-badge");
  if (!badge) return;
  badge.style.display = "flex";
  badge.querySelector(".cpb-color").style.background =
    project.color || "#8b5cf6";
  badge.querySelector(".cpb-name").textContent = project.name;
}

// ================== POP-UP : NOUVEAU PROJET ==================
function openNewProjectPopup() {
  const existing = document.getElementById("new-project-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "new-project-overlay";
  overlay.className = "project-popup-overlay";

  overlay.innerHTML = `
    <div class="project-popup">
      <div class="project-popup-header">
        <div class="project-popup-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        </div>
        <div>
          <h3 class="project-popup-title">Nouveau projet</h3>
          <p class="project-popup-sub">Organisez vos recherches immobilières</p>
        </div>
        <button class="project-popup-close" id="close-new-project">&times;</button>
      </div>

      <div class="project-popup-body">
        <div class="ppf-group">
          <label class="ppf-label">Nom du projet <span class="ppf-required">*</span></label>
          <input type="text" id="pp-name" class="ppf-input" placeholder="Ex: Achat appartement Paris" maxlength="60" />
        </div>
        <div class="ppf-group">
          <label class="ppf-label">Description</label>
          <textarea id="pp-desc" class="ppf-textarea" placeholder="Quelques mots sur ce projet…" rows="3" maxlength="200"></textarea>
        </div>
        <div class="ppf-group">
          <label class="ppf-label">Couleur</label>
          <div class="ppf-colors" id="pp-colors">
            <button class="ppf-color-btn selected" data-color="#8b5cf6" style="background:#8b5cf6" title="Violet"></button>
            <button class="ppf-color-btn" data-color="#6366f1" style="background:#6366f1" title="Indigo"></button>
            <button class="ppf-color-btn" data-color="#f472b6" style="background:#f472b6" title="Rose"></button>
            <button class="ppf-color-btn" data-color="#10b981" style="background:#10b981" title="Vert"></button>
            <button class="ppf-color-btn" data-color="#f59e0b" style="background:#f59e0b" title="Ambre"></button>
            <button class="ppf-color-btn" data-color="#3b82f6" style="background:#3b82f6" title="Bleu"></button>
          </div>
        </div>
      </div>

      <div class="project-popup-footer">
        <button class="ppf-btn-ghost" id="cancel-new-project">Annuler</button>
        <button class="ppf-btn-primary" id="confirm-new-project">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          Créer le projet
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Couleurs
  let selectedColor = "#8b5cf6";
  overlay.querySelectorAll(".ppf-color-btn").forEach((btn) => {
    btn.onclick = () => {
      overlay
        .querySelectorAll(".ppf-color-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedColor = btn.dataset.color;
    };
  });

  overlay.querySelector("#close-new-project").onclick = overlay.querySelector(
    "#cancel-new-project",
  ).onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  overlay.querySelector("#confirm-new-project").onclick = async () => {
    const name = overlay.querySelector("#pp-name").value.trim();
    const desc = overlay.querySelector("#pp-desc").value.trim();
    if (!name) {
      overlay.querySelector("#pp-name").classList.add("ppf-error");
      overlay.querySelector("#pp-name").placeholder = "⚠ Nom obligatoire";
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.user.token}`,
        },
        body: JSON.stringify({ name, description: desc, color: selectedColor }),
      });
      const data = await res.json();
      if (!data.id) throw new Error();

      const project = {
        id: data.id,
        name,
        description: desc,
        color: selectedColor,
      };
      projectState.currentProject = project;
      projectState.isSaved = false;
      projectState.currentChatId = null;
      localStorage.setItem("aigent_current_project", JSON.stringify(project));

      // Vider le localStorage de la session courante (nouveau projet = nouveau chat)
      if (state.user?.username) {
        ["criteria", "chat", "phase", "lastMatches"].forEach((k) => {
          localStorage.removeItem(`${k}_${state.user.username}`);
        });
      }

      overlay.remove();
      renderProjectBadge(project);

      // Vider le chat en mémoire + UI → nouveau projet = session fraîche
      state.history = [];
      state.criteria = {};
      state.phase = null;
      state.lastMatches = [];
      state.sending = false;

      const box = $("chat-box");
      if (box) box.innerHTML = "";
      renderEmptyState();
      lockPanelActions();
      updateAIPanel([]);

      showProjectToast(
        `Projet "${name}" créé ! Nouvelle session démarrée.`,
        selectedColor,
      );
    } catch {
      showProjectToast("Erreur lors de la création du projet", "error");
    }
  };

  // Focus auto
  setTimeout(() => overlay.querySelector("#pp-name")?.focus(), 100);
}

// ================== POP-UP : ENREGISTRER NÉCESSITE UN PROJET ==================
function openSaveRequiresProjectPopup() {
  const existing = document.getElementById("save-requires-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "save-requires-overlay";
  overlay.className = "project-popup-overlay";
  overlay.innerHTML = `
    <div class="project-popup project-popup-sm">
      <div class="project-popup-header">
        <div class="project-popup-icon warn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        </div>
        <div>
          <h3 class="project-popup-title">Aucun projet actif</h3>
          <p class="project-popup-sub">Créez un projet pour enregistrer cette session</p>
        </div>
        <button class="project-popup-close" id="close-save-req">&times;</button>
      </div>
      <div class="project-popup-body">
        <p class="pp-info-text">Pour enregistrer votre conversation, vous devez d'abord créer un projet. Le chat actuel sera automatiquement sauvegardé dedans.</p>
      </div>
      <div class="project-popup-footer">
        <button class="ppf-btn-ghost" id="cancel-save-req">Plus tard</button>
        <button class="ppf-btn-primary" id="goto-create-project">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Créer un projet
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector("#close-save-req").onclick = overlay.querySelector(
    "#cancel-save-req",
  ).onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
  overlay.querySelector("#goto-create-project").onclick = () => {
    overlay.remove();
    openNewProjectPopup();
  };
}

// ================== POP-UP : SAUVEGARDER LE CHAT ==================
function openSaveChatToProjectPopup() {
  if (state.history.length === 0) {
    showProjectToast("Aucun message à sauvegarder", "warn");
    return;
  }
  const existing = document.getElementById("save-chat-overlay");
  if (existing) existing.remove();

  const project = projectState.currentProject;
  const autoTitle = generateChatTitle();

  const overlay = document.createElement("div");
  overlay.id = "save-chat-overlay";
  overlay.className = "project-popup-overlay";
  overlay.innerHTML = `
    <div class="project-popup project-popup-sm">
      <div class="project-popup-header">
        <div class="project-popup-icon" style="background:${project.color}22;border-color:${project.color}55;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${project.color}" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        </div>
        <div>
          <h3 class="project-popup-title">Enregistrer la session</h3>
          <p class="project-popup-sub">Dans : <strong style="color:${project.color}">${project.name}</strong></p>
        </div>
        <button class="project-popup-close" id="close-save-chat">&times;</button>
      </div>
      <div class="project-popup-body">
        <div class="ppf-group">
          <label class="ppf-label">Titre de la conversation</label>
          <input type="text" id="chat-title-input" class="ppf-input" value="${autoTitle}" maxlength="80" />
        </div>
        <div class="pp-chat-preview">
          <span class="pp-preview-count">${state.history.length} message(s) · ${state.lastMatches?.length || 0} match(es)</span>
        </div>
      </div>
      <div class="project-popup-footer">
        <button class="ppf-btn-ghost" id="cancel-save-chat">Annuler</button>
        <button class="ppf-btn-primary" id="confirm-save-chat" style="background:linear-gradient(135deg,${project.color},${project.color}cc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          Enregistrer
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector("#close-save-chat").onclick = overlay.querySelector(
    "#cancel-save-chat",
  ).onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  overlay.querySelector("#confirm-save-chat").onclick = async () => {
    const title =
      overlay.querySelector("#chat-title-input").value.trim() || autoTitle;
    const btn = overlay.querySelector("#confirm-save-chat");
    btn.innerHTML = `<span class="btn-loading"></span> Sauvegarde…`;
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${project.id}/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.user.token}`,
        },
        body: JSON.stringify({
          title,
          messages: state.history,
          criteria: state.criteria,
          phase: state.phase || "collecting",
          lastMatches: state.lastMatches || [],
        }),
      });
      const data = await res.json();
      if (!data.chatId) throw new Error();
      projectState.currentChatId = data.chatId;
      projectState.isSaved = true;
      overlay.remove();
      showProjectToast(
        `✓ Session enregistrée dans "${project.name}"`,
        project.color,
      );
      updateSaveButtonState();
    } catch {
      btn.innerHTML = `Réessayer`;
      btn.disabled = false;
      showProjectToast("Erreur lors de la sauvegarde", "error");
    }
  };
}

function generateChatTitle() {
  const c = state.criteria;
  if (c.ville && c.type)
    return `${c.type.charAt(0).toUpperCase() + c.type.slice(1)} à ${c.ville}`;
  if (c.ville) return `Recherche à ${c.ville}`;
  const firstUserMsg = state.history.find((m) => m.role === "user");
  if (firstUserMsg)
    return (
      firstUserMsg.content.slice(0, 50) +
      (firstUserMsg.content.length > 50 ? "…" : "")
    );
  return `Session du ${new Date().toLocaleDateString("fr-FR")}`;
}

function updateSaveButtonState() {
  const btn = $("btn-save-session");
  if (!btn) return;
  if (projectState.isSaved) {
    btn.classList.add("saved");
    btn.title = "Session enregistrée";
  } else {
    btn.classList.remove("saved");
  }
}

// ================== TOAST PROJET ==================
function showProjectToast(message, colorOrType = "#8b5cf6") {
  const existing = document.querySelector(".project-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "project-toast";
  const isError = colorOrType === "error";
  const isWarn = colorOrType === "warn";
  toast.style.borderColor = isError
    ? "#ef4444"
    : isWarn
      ? "#f59e0b"
      : colorOrType;
  toast.style.color = isError ? "#ef4444" : isWarn ? "#f59e0b" : colorOrType;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}
export function initChatbot() {
  restoreSession();

  if (load("phase") === "results") {
    state.phase = "results";
    state.lastMatches = load("lastMatches") || [];
    unlockPanelActions();
  } else {
    lockPanelActions();
  }

  render();
  initPanelActions();
  initProjectSidebar();

  // ── INPUT & SEND ──────────────────────────────────────────────
  const input = $("user-input");
  const sendBtn = $("send-btn");
  // AJOUTER après "const sendBtn = $("send-btn");"
  const chatBox = $("chat-box");
  const scrollBtn = $("btn-scroll-bottom");

  if (chatBox && scrollBtn) {
    chatBox.addEventListener("scroll", () => {
      const distanceFromBottom =
        chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight;
      if (distanceFromBottom > 120) {
        scrollBtn.classList.add("visible");
      } else {
        scrollBtn.classList.remove("visible");
      }
    });
    scrollBtn.addEventListener("click", () => {
      scrollBottom(chatBox);
      scrollBtn.classList.remove("visible");
    });
  }

  if (input) {
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", doSend);
  }

  function doSend() {
    const text = (input?.value || "").trim();
    if (!text) return;

    if (state.user) {
      sendMessage(text);
    } else {
      addMessage({ text, from: "user" });
      setTimeout(() => {
        addMessage({
          text: "Connectez-vous pour accéder au Cerveau IA.",
          from: "bot",
        });
      }, 600);
    }

    if (input) {
      input.value = "";
      input.style.height = "auto";
    }
  }

  // ── SUGGESTIONS ──────────────────────────────────────────────
  const suggestionsBox = $("chat-suggestions");
  if (suggestionsBox && input) {
    suggestionsBox.addEventListener("click", (e) => {
      const btn = e.target.closest(".suggestion-btn");
      if (btn) {
        input.value = btn.textContent.trim();
        input.focus();
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
      }
    });
  }

  // ── FILE UPLOADS ──────────────────────────────────────────────
  [
    $("btn-attach-file"),
    $("btn-attach-pdf"),
    $("btn-attach-image"),
    $("btn-attach-excel"),
  ].forEach((btn, idx) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      const inputs = [
        $("file-input-general"),
        $("file-input-pdf"),
        $("file-input-image"),
        $("file-input-excel"),
      ];
      inputs[idx]?.click();
    });
  });

  // ── THEME ──────────────────────────────────────────────────────
  // APRÈS - un seul bloc propre, à mettre une seule fois dans initChatbot()
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("aigent_theme", theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  }

  // Un seul listener par bouton
  document.getElementById("btn-theme")?.addEventListener("click", toggleTheme);
  document
    .getElementById("mobile-theme-btn")
    ?.addEventListener("click", toggleTheme);

  // ── LOGOUT ────────────────────────────────────────────────────
  $("btn-logout")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  });
  // ── MOBILE MENU DRAWER ────────────────────────────────────
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const mobileDrawer = document.getElementById("mobile-sidebar-drawer");
  const drawerOverlay = document.getElementById("mobile-drawer-overlay");
  const drawerClose = document.getElementById("mobile-drawer-close");

  function openDrawer() {
    mobileDrawer?.classList.add("open");
  }
  function closeDrawer() {
    mobileDrawer?.classList.remove("open");
  }

  mobileMenuBtn?.addEventListener("click", openDrawer);
  drawerClose?.addEventListener("click", closeDrawer);
  drawerOverlay?.addEventListener("click", closeDrawer);

  // Swipe left pour fermer
  let _touchStartX = 0;
  mobileDrawer?.addEventListener(
    "touchstart",
    (e) => {
      _touchStartX = e.touches[0].clientX;
    },
    { passive: true },
  );
  mobileDrawer?.addEventListener(
    "touchend",
    (e) => {
      if (_touchStartX - e.changedTouches[0].clientX > 60) closeDrawer();
    },
    { passive: true },
  );

  // Sync avatar/name dans le drawer
  const mAv = document.getElementById("mobile-profile-avatar");
  const mName = document.getElementById("mobile-profile-name");
  const mRole = document.getElementById("mobile-profile-role");
  if (state.user && mAv && mName) {
    mAv.textContent = (state.user.username || "A")[0].toUpperCase();
    mName.textContent = state.user.username || "Alexandre";
    if (mRole) mRole.textContent = ROLE_LABELS[state.role] || "Acheteur";
  }

  // ── MOBILE THÈME BTN ────────────────────────────────────

  // ── NOTIFICATIONS ────────────────────────────────────────────
  $("btn-notif-bell")?.addEventListener("click", () => {
    window.location.href = "profil.html#notifications";
  });

  async function refreshNotifBadge() {
    if (!state.user?.token) return;
    try {
      const res = await fetch(`${API_BASE}/api/notifications`, {
        headers: { Authorization: `Bearer ${state.user.token}` },
      });
      if (!res.ok) return;
      const notifs = await res.json();
      const count = notifs.filter((n) => !n.read).length;
      const badge = $("notif-badge-global");
      if (badge) {
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = count > 0 ? "flex" : "none";
      }
    } catch {}
  }

  refreshNotifBadge();
  setInterval(refreshNotifBadge, 20000);

  // ── MAP CLOSE ────────────────────────────────────────────────
  $("closeModal")?.addEventListener("click", () => {
    const mapModal = $("mapModal");
    if (mapModal) mapModal.style.display = "none";
  });
  function collapseSidebar() {
    document.body.classList.add("sidebar-collapsed");
    localStorage.setItem("aigent_sidebar", "closed");
  }
  function expandSidebar() {
    document.body.classList.remove("sidebar-collapsed");
    localStorage.setItem("aigent_sidebar", "open");
  }
  // Bouton fermer (dans la sidebar)
  document
    .querySelectorAll("#btn-toggle-sidebar")
    .forEach((btn) => btn.addEventListener("click", collapseSidebar));

  // Bouton rouvrir (dans la mini-rail, hors sidebar)
  const btnReopen = $("btn-sidebar-reopen");
  if (btnReopen) btnReopen.addEventListener("click", expandSidebar);

  // Restaurer état
  if (localStorage.getItem("aigent_sidebar") === "closed") {
    document.body.classList.add("sidebar-collapsed");
  }
  log("✅ Chatbot initialisé");
}

document.addEventListener("DOMContentLoaded", initChatbot);
