/**
 * ============================================================
 * CHAT OCCASION — FRONT COMPLET (v2)
 * ============================================================
 * Tunnel IA acheteur/vendeur piloté par le serveur (déterministe),
 * pop-ups véhicule (carburant, état par zones, photos, CarVertical),
 * récapitulatif d'annonce avant publication, rendu des annonces.
 * ============================================================
 */

import { renderRecapCard, renderMatchResults } from "./vehicle-ad-cards.js";

const API_BASE = "http://localhost:3100";
const ROLE_LABELS = { buyer: "Acheteur", seller: "Vendeur" };

const state = {
  user: null,
  role: null,
  criteria: {},
  history: [],
  sending: false,
  phase: null,
  lastMatches: [],
  ui: {
    carburantPopupOpened: false,
    etatPopupOpened: false,
    imagesPopupOpened: false,
    carverticalPopupOpened: false,
    recapPopupOpened: false,
  },
};

const $ = (id) => document.getElementById(id);
const scrollBottom = (el, smooth = true) =>
  el?.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });

const storageKey = (key) =>
  state.user ? `${key}_occas_${state.user.username}` : null;
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
  const raw = localStorage.getItem("agent_occas_user");
  if (!raw) return;
  try {
    state.user = JSON.parse(raw);
    state.role = state.user.role ?? null;
    state.criteria = load("criteria") ?? { intent: state.role };
    state.history = load("chat") ?? [];
  } catch {}
}

// ================== EMPTY STATE ==================
const EMPTY_STATE_HTML = `
  <div class="chat-empty-state" id="chat-empty-state">
    <div class="ces-inner">
      <div class="ces-badge">
        <span class="pulse-dot"></span>
        Moteur de mise en relation Occasion — actif
      </div>
      <h1 class="ces-title">
        Trouvez le bon véhicule,<br />ou le bon acheteur.
      </h1>
      <p class="ces-sub">
        Décrivez ce que vous cherchez ou ce que vous vendez — l'IA
        analyse modèle, kilométrage, état et budget pour vous mettre
        en relation directement.
      </p>
      <div class="ces-cards">
        <div class="ces-card" data-prompt="Je souhaite acheter un véhicule d'occasion">
          <div class="ces-card-icon c1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3 17V9l2-5h10l4 5v8"/>
            </svg>
          </div>
          <div class="ces-card-title">Je veux acheter un véhicule</div>
        </div>
        <div class="ces-card" data-prompt="Je souhaite vendre mon véhicule d'occasion">
          <div class="ces-card-icon c2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div class="ces-card-title">Vendre mon véhicule</div>
        </div>
        <div class="ces-card" data-prompt="Je recherche une pièce détachée auto">
          <div class="ces-card-icon c3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"/>
            </svg>
          </div>
          <div class="ces-card-title">Rechercher une pièce détachée</div>
        </div>
        <div class="ces-card" data-prompt="Peux-tu analyser les tendances actuelles du marché occasion ?">
          <div class="ces-card-icon c4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
              <polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>
          <div class="ces-card-title">Analyser le marché occasion</div>
        </div>
      </div>
    </div>
  </div>`;

function bindEmptyStateEvents() {
  document.querySelectorAll(".ces-card").forEach((card) => {
    card.addEventListener("click", () => {
      const prompt =
        card.dataset.prompt ||
        card.querySelector(".ces-card-title")?.textContent?.trim();
      const input = $("user-input");
      if (input && prompt) {
        input.value = prompt;
        input.focus();
      }
    });
  });
}

// ================== MESSAGING ==================
function addThinkingIndicator() {
  const box = $("chat-box");
  const el = document.createElement("div");
  el.className = "msg bot thinking-msg";
  el.innerHTML = `<span class="thinking-shimmer">Analyse en cours</span>`;
  box.appendChild(el);
  scrollBottom(box);
  return el;
}

function addMessage({
  text,
  from = "bot",
  structured = false,
  persist = true,
  typing = false,
}) {
  if (!text) return;

  const es = document.querySelector(".chat-empty-state");
  if (es) es.remove();

  const box = $("chat-box");
  const row = document.createElement("div");
  row.className = `msg ${from} ${structured ? "structured" : "text-msg"}`;

  if (from === "user") {
    row.innerHTML = `<div class="bubble-user">${text.replace(/</g, "&lt;")}</div>`;
    box.appendChild(row);
  } else if (structured) {
    const c = document.createElement("div");
    c.innerHTML = text;
    row.appendChild(c);
    box.appendChild(row);
  } else {
    row.innerHTML = `
      <div class="bot-row">
        <div class="bot-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <div class="ai-text"></div>
      </div>`;
    box.appendChild(row);
    const aiText = row.querySelector(".ai-text");
    if (typing) {
      let i = 0;
      const full = text;
      const step = () => {
        if (i < full.length) {
          aiText.innerHTML = full.substring(0, i + 1);
          i++;
          scrollBottom(box);
          setTimeout(step, Math.random() * 12 + 3);
        }
      };
      step();
    } else {
      aiText.innerHTML = text;
    }
  }

  if (persist && state.user) {
    state.history.push({ role: from, content: text, structured });
    save("chat", state.history);
  }
  scrollBottom(box);
}

// ================== ENVOI ==================
async function sendMessage(text) {
  if (state.sending || !text) return;
  state.sending = true;
  addMessage({ text, from: "user" });
  const thinkEl = addThinkingIndicator();

  try {
    const res = await fetch(`${API_BASE}/occas/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user?.token || ""}`,
      },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    thinkEl.remove();
    await handleServerResponse(data);
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

async function sendSpecialUpdate(payload) {
  const thinkEl = addThinkingIndicator();
  try {
    const res = await fetch(`${API_BASE}/occas/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.user?.token || ""}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    thinkEl.remove();
    await handleServerResponse(data);
  } catch (e) {
    thinkEl.remove();
    addMessage({ text: "Erreur de communication.", from: "bot" });
  }
}

window.__vaAddUserMsg = (text) => addMessage({ text, from: "user" });
window.__vaAddBotMsg = (text, typing = false) =>
  addMessage({ text, from: "bot", typing });
window.__vaSendSpecialUpdate = (payload) => sendSpecialUpdate(payload);

async function handleServerResponse(data) {
  if (data.criteria) {
    state.criteria = { ...state.criteria, ...data.criteria };
    save("criteria", state.criteria);
    updateAIPanel();
  }

  if (data.reply) addMessage({ text: data.reply, from: "bot", typing: true });

  if (data.triggerCarburantPopup && !state.ui.carburantPopupOpened) {
    state.ui.carburantPopupOpened = true;
    setTimeout(openCarburantPopup, 700);
    return;
  }
  if (data.triggerEtatPopup && !state.ui.etatPopupOpened) {
    state.ui.etatPopupOpened = true;
    setTimeout(openEtatVoiturePopup, 700);
    return;
  }
  if (data.triggerImagesPopup && !state.ui.imagesPopupOpened) {
    state.ui.imagesPopupOpened = true;
    setTimeout(openImagesPopup, 700);
    return;
  }
  if (data.triggerCarverticalPopup && !state.ui.carverticalPopupOpened) {
    state.ui.carverticalPopupOpened = true;
    setTimeout(openCarverticalPopup, 700);
    return;
  }
  if (data.triggerRecapPopup) {
    // Le récap peut être redéclenché après une modification : on réautorise l'ouverture.
    state.ui.recapPopupOpened = true;
    setTimeout(() => renderRecapCard(data.recapData || state.criteria), 700);
    return;
  }

  if (data.matchingDone) {
    state.phase = "results";
    save("phase", "results");
    unlockPanelActions();
    if (Array.isArray(data.matches) && data.matches.length > 0) {
      renderMatchResults(data.matches, data.postReply);
    } else if (data.postReply) {
      addMessage({ text: data.postReply, from: "bot", typing: true });
    }
  }
}

// ================== PANEL IA (critères) ==================
function updateAIPanel() {
  const c = state.criteria;
  const isSeller = state.role === "seller";
  const set = (id, val) => {
    const el = $(id);
    if (el) el.textContent = val ?? "En attente";
  };
  set("ai-modele", [c.marque, c.modele].filter(Boolean).join(" ") || null);
  set(
    "ai-km",
    isSeller
      ? c.kilometrage
        ? `${Number(c.kilometrage).toLocaleString("fr-FR")} km`
        : null
      : c.kilometrageMax
        ? `≤ ${Number(c.kilometrageMax).toLocaleString("fr-FR")} km`
        : null,
  );

  // "État" ne concerne que le vendeur (pas de pop-up état côté acheteur)
  const etatRow = $("ai-etat")?.closest(".criteria-item");
  if (etatRow) {
    if (isSeller) {
      etatRow.style.display = "";
      set(
        "ai-etat",
        c.etatZones && Object.keys(c.etatZones).length ? "Renseigné" : null,
      );
    } else {
      etatRow.style.display = "none";
    }
  }

  // "Budget" (acheteur) devient "Prix de vente" (vendeur)
  const budgetLabelEl = document
    .getElementById("ai-budget")
    ?.closest(".criteria-item")
    ?.querySelector(".criteria-label");
  if (budgetLabelEl)
    budgetLabelEl.textContent = isSeller ? "Prix de vente" : "Budget";
  set(
    "ai-budget",
    c.budgetMax || c.budgetMin
      ? `${Number(c.budgetMax || c.budgetMin).toLocaleString("fr-FR")} €`
      : null,
  );
  set("ai-zone", c.ville || null);
}

function unlockPanelActions() {
  ["btn-mise-relation", "btn-analyse-marche", "btn-modifier-criteres"].forEach(
    (id) => {
      const btn = $(id);
      if (btn) {
        btn.removeAttribute("disabled");
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
      }
    },
  );
}

// ================== POP-UP 1 : CARBURANT + BOÎTE ==================
const FUEL_OPTIONS = [
  {
    value: "essence",
    label: "Essence",
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17"/><path d="M14 9h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.5a2.5 2.5 0 0 0-5 0V12"/><line x1="3" y1="22" x2="13" y2="22"/><rect x="6" y="6" width="4" height="4" rx="1"/></svg>`,
  },
  {
    value: "diesel",
    label: "Diesel",
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  },
  {
    value: "hybride",
    label: "Hybride",
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5M11 19h8.185a1.83 1.83 0 0 0 1.57-.881 1.785 1.785 0 0 0 .004-1.784L16.804 9.5"/><circle cx="12" cy="7" r="4"/><path d="m10 15 2 2 4-4"/></svg>`,
  },
  {
    value: "electrique",
    label: "Électrique",
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  },
  {
    value: "gpl",
    label: "GPL",
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  },
];

const BOITE_OPTIONS = [
  { value: "manuelle", label: "Manuelle" },
  { value: "automatique", label: "Automatique" },
];

function openCarburantPopup() {
  const row = document.createElement("div");
  row.className = "msg bot structured";
  row.innerHTML = `
    <div class="bubble saas-popup carburant-popup">
      <div class="saas-popup-header">
        <div class="saas-popup-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 9V5a2 2 0 00-2-2H6a2 2 0 00-2 2v14h9M14 9h1.5a2 2 0 012 2v3.5a1.5 1.5 0 003 0V9a4 4 0 00-1.17-2.83L17 4"/></svg>
        </div>
        <div>
          <h3 class="saas-popup-title">Motorisation</h3>
          <p class="saas-popup-sub">Sélectionnez le carburant, puis la boîte</p>
        </div>
      </div>
      <div class="fuel-grid">
        ${FUEL_OPTIONS.map((f) => `<button class="fuel-card" data-value="${f.value}"><span class="fuel-icon">${f.icon}</span><span>${f.label}</span></button>`).join("")}
      </div>
      <div class="fuel-boite-row" id="boite-row" style="display:none">
        ${BOITE_OPTIONS.map((b) => `<button class="boite-card" data-value="${b.value}">${b.label}</button>`).join("")}
      </div>
    </div>`;
  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));

  let selectedFuel = null;

  row.querySelectorAll(".fuel-card").forEach((btn) => {
    btn.onclick = () => {
      row
        .querySelectorAll(".fuel-card")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedFuel = btn.dataset.value;
      row.querySelector("#boite-row").style.display = "flex";
    };
  });

  row.querySelectorAll(".boite-card").forEach((btn) => {
    btn.onclick = () => {
      if (!selectedFuel) return;
      const boite = btn.dataset.value;
      addMessage({
        text: `${FUEL_OPTIONS.find((f) => f.value === selectedFuel)?.label} · boîte ${BOITE_OPTIONS.find((b) => b.value === boite)?.label.toLowerCase()}`,
        from: "user",
      });
      row.remove();
      sendSpecialUpdate({
        carburant: selectedFuel,
        boite,
        message: "__CARBURANT_SELECTED__",
      });
    };
  });
}

// ================== POP-UP 2 : ÉTAT VOITURE PAR ZONES ==================
const CAR_ZONES = [
  { id: "avant", label: "Avant / Pare-chocs", x: 15, y: 105, w: 60, h: 50 },
  { id: "capot", label: "Capot", x: 70, y: 70, w: 90, h: 45 },
  { id: "toit", label: "Toit", x: 165, y: 55, w: 140, h: 35 },
  { id: "pareBriseAvant", label: "Pare-brise", x: 160, y: 92, w: 60, h: 35 },
  {
    id: "portiereGauche",
    label: "Portières / Flancs",
    x: 165,
    y: 128,
    w: 220,
    h: 45,
  },
  { id: "vitres", label: "Vitres", x: 220, y: 90, w: 130, h: 35 },
  { id: "coffre", label: "Coffre / Malle", x: 390, y: 70, w: 70, h: 60 },
  {
    id: "arriere",
    label: "Arrière / Pare-chocs",
    x: 460,
    y: 100,
    w: 55,
    h: 55,
  },
  { id: "roues", label: "Jantes / Pneus", x: 90, y: 175, w: 380, h: 30 },
  {
    id: "interieur",
    label: "Intérieur / Habitacle",
    x: 220,
    y: 128,
    w: 90,
    h: 45,
  },
  { id: "mecanique", label: "Mécanique / Moteur", x: 60, y: 155, w: 60, h: 20 },
];

const ZONE_STATUS = [
  { value: "parfait", label: "Parfait", color: "#10b981" },
  { value: "bon", label: "Bon état", color: "#34d399" },
  { value: "usure", label: "Usure normale", color: "#ffb066" },
  { value: "rayure", label: "Rayure(s)", color: "#f59e0b" },
  { value: "choc", label: "Choc / Impact", color: "#ff6a3d" },
  { value: "a_reparer", label: "À réparer", color: "#ff3d3d" },
];

/**
 * Silhouette voiture améliorée (profil plus fluide, pare-brise/toit/capot
 * distincts, arches de roues creusées) — le viewBox et les coordonnées des
 * zones cliquables restent inchangés pour ne rien casser.
 */
function carSilhouetteSVG(extraDefs = "") {
  return `
    <path d="M12 128
             Q8 100 42 96
             L64 96
             Q78 66 118 60
             L318 60
             Q368 58 405 84
             L440 100
             Q478 104 500 122
             Q512 130 505 148
             L478 153
             Q474 176 452 176
             Q431 176 425 153
             L145 153
             Q139 176 118 176
             Q97 176 91 153
             L28 149
             Q6 145 12 128 Z"
      fill="rgba(255,106,61,0.06)" stroke="rgba(255,255,255,0.28)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M64 96 Q78 66 118 60 L165 60 L160 96 Z" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.16)" stroke-width="1.3"/>
    <path d="M318 60 Q368 58 405 84 L390 100 L318 100 Z" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.16)" stroke-width="1.3"/>
    <circle cx="118" cy="178" r="19" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.32)" stroke-width="2.2"/>
    <circle cx="118" cy="178" r="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" stroke-width="1.2"/>
    <circle cx="432" cy="178" r="19" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.32)" stroke-width="2.2"/>
    <circle cx="432" cy="178" r="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" stroke-width="1.2"/>
    ${extraDefs}
  `;
}

function openEtatVoiturePopup() {
  const row = document.createElement("div");
  row.className = "msg bot structured";
  const zones = state.criteria.etatZones ? { ...state.criteria.etatZones } : {};

  row.innerHTML = `
    <div class="bubble saas-popup etat-voiture-popup" style="max-width:560px;width:100%">
      <div class="saas-popup-header">
        <div class="saas-popup-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3 17V9l2-5h10l4 5v8"/></svg>
        </div>
        <div>
          <h3 class="saas-popup-title">État général du véhicule</h3>
          <p class="saas-popup-sub">Touchez une zone pour indiquer son état</p>
        </div>
      </div>

      <div class="car-diagram-wrap">
        <svg viewBox="0 0 520 220" class="car-diagram-svg" id="car-svg">
          ${carSilhouetteSVG()}
          ${CAR_ZONES.map(
            (z) => `
            <rect class="car-zone-hit" data-zone="${z.id}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="6"
              fill="${zones[z.id] ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.02)"}"
              stroke="${zones[z.id] ? "#10b981" : "rgba(255,255,255,0.15)"}" stroke-width="1.5"
              style="cursor:pointer;transition:.15s"/>
          `,
          ).join("")}
        </svg>
        <div class="car-diagram-legend" id="zone-legend"></div>
      </div>

      <div class="etat-progress" id="etat-progress"></div>

      <div class="saas-popup-actions">
        <button class="btn-saas-ghost" id="etat-reset">Réinitialiser</button>
        <button class="btn-saas-primary" id="etat-valider" ${Object.keys(zones).length ? "" : "disabled"}>
          <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          Valider l'état
        </button>
      </div>
    </div>`;

  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));

  const legend = row.querySelector("#zone-legend");
  const progress = row.querySelector("#etat-progress");
  const validerBtn = row.querySelector("#etat-valider");

  function renderProgress() {
    const total = CAR_ZONES.length;
    const done = Object.keys(zones).length;
    progress.innerHTML = `<div class="etat-progress-bar"><div style="width:${(done / total) * 100}%"></div></div><span>${done}/${total} zones qualifiées</span>`;
    validerBtn.disabled = done === 0;
  }
  renderProgress();

  function openZoneMiniPopup(zoneId) {
    const zoneDef = CAR_ZONES.find((z) => z.id === zoneId);
    document.querySelectorAll(".zone-mini-popup").forEach((p) => p.remove());

    const mini = document.createElement("div");
    mini.className = "zone-mini-popup";
    mini.innerHTML = `
      <div class="zmp-title">${zoneDef.label}</div>
      <div class="zmp-options">
        ${ZONE_STATUS.map((s) => `<button class="zmp-opt" data-status="${s.value}" style="--zc:${s.color}">${s.label}</button>`).join("")}
      </div>`;
    row.querySelector(".car-diagram-wrap").appendChild(mini);

    mini.querySelectorAll(".zmp-opt").forEach((btn) => {
      btn.onclick = () => {
        zones[zoneId] = { status: btn.dataset.status };
        const hit = row.querySelector(`.car-zone-hit[data-zone="${zoneId}"]`);
        const colorMap = Object.fromEntries(
          ZONE_STATUS.map((s) => [s.value, s.color]),
        );
        hit.setAttribute("fill", `${colorMap[btn.dataset.status]}2A`);
        hit.setAttribute("stroke", colorMap[btn.dataset.status]);
        mini.remove();
        renderProgress();
        renderLegend();
      };
    });
  }

  function renderLegend() {
    legend.innerHTML = Object.entries(zones)
      .map(([zid, z]) => {
        const zoneDef = CAR_ZONES.find((zz) => zz.id === zid);
        const st = ZONE_STATUS.find((s) => s.value === z.status);
        return `<span class="zone-chip" style="--zc:${st?.color || "#888"}">${zoneDef?.label || zid} · ${st?.label || ""}</span>`;
      })
      .join("");
  }
  renderLegend();

  row.querySelectorAll(".car-zone-hit").forEach((hit) => {
    hit.addEventListener("click", () => openZoneMiniPopup(hit.dataset.zone));
  });

  row.querySelector("#etat-reset").onclick = () => {
    Object.keys(zones).forEach((k) => delete zones[k]);
    row.querySelectorAll(".car-zone-hit").forEach((h) => {
      h.setAttribute("fill", "rgba(255,255,255,0.02)");
      h.setAttribute("stroke", "rgba(255,255,255,0.15)");
    });
    renderProgress();
    renderLegend();
  };

  validerBtn.onclick = () => {
    state.criteria.etatZones = zones;
    save("criteria", state.criteria);
    const summary = Object.entries(zones)
      .map(([k, v]) => {
        const zd = CAR_ZONES.find((z) => z.id === k);
        const st = ZONE_STATUS.find((s) => s.value === v.status);
        return `${zd?.label}: ${st?.label}`;
      })
      .join(", ");
    addMessage({ text: `État renseigné — ${summary}`, from: "user" });
    row.remove();
    sendSpecialUpdate({ etatZones: zones, message: "__ETAT_SELECTED__" });
  };
}

/** Visionneuse plein écran (lecture seule) du schéma d'état — utilisée
 * depuis le récap et depuis les cartes d'annonces du matching. */
function openEtatViewerModal(etatZones) {
  if (!etatZones || !Object.keys(etatZones).length) return;
  const colorMap = Object.fromEntries(
    ZONE_STATUS.map((s) => [s.value, s.color]),
  );

  const modal = document.createElement("div");
  modal.className = "details-modal-overlay";
  modal.style.display = "flex";
  modal.innerHTML = `
    <div class="details-popup-content etat-viewer-content">
      <div class="details-header">État du véhicule<button class="close-details-btn">&times;</button></div>
      <div class="car-diagram-wrap" style="border:none;background:transparent">
        <svg viewBox="0 0 520 220" class="car-diagram-svg">
          ${carSilhouetteSVG()}
          ${CAR_ZONES.map((z) => {
            const st = etatZones[z.id]?.status;
            const c = st ? colorMap[st] : "rgba(255,255,255,0.12)";
            return `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="6" fill="${st ? c + "33" : "rgba(255,255,255,0.02)"}" stroke="${c}" stroke-width="1.5"/>`;
          }).join("")}
        </svg>
        <div class="car-diagram-legend">
          ${Object.entries(etatZones)
            .map(([zid, z]) => {
              const zoneDef = CAR_ZONES.find((zz) => zz.id === zid);
              const st = ZONE_STATUS.find((s) => s.value === z.status);
              return `<span class="zone-chip" style="--zc:${st?.color || "#888"}">${zoneDef?.label || zid} · ${st?.label || ""}</span>`;
            })
            .join("")}
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector(".close-details-btn").onclick = () => modal.remove();
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

// ================== POP-UP 3 : PHOTOS ==================
function openImagesPopup() {
  const MAX_IMAGES = 6;
  const row = document.createElement("div");
  row.className = "msg bot structured";
  row.innerHTML = `
    <div class="bubble saas-popup images-popup" style="max-width:440px;width:100%">
      <div class="saas-popup-header">
        <div class="saas-popup-icon">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div>
          <h3 class="saas-popup-title">Photos du véhicule</h3>
          <p class="saas-popup-sub">Jusqu'à 6 photos — boostent fortement votre annonce</p>
        </div>
      </div>
      <input type="file" id="img-input-occas" multiple hidden accept="image/*"/>
      <div class="img-drop-zone" id="img-drop-occas">
        <svg viewBox="0 0 24 24" fill="none" width="30" height="30"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <p class="img-drop-label">Déposer ou <span class="img-drop-link">parcourir</span></p>
        <p class="img-drop-hint">JPG, PNG — max 6 fichiers</p>
      </div>
      <div class="img-thumbs" id="img-thumbs-occas"></div>
      <div class="saas-popup-actions">
        <button class="btn-saas-ghost" id="img-skip-occas">Passer</button>
        <button class="btn-saas-primary" id="img-valider-occas" disabled>
          <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Valider les photos
        </button>
      </div>
    </div>`;
  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));

  const input = row.querySelector("#img-input-occas");
  const dropZone = row.querySelector("#img-drop-occas");
  const thumbs = row.querySelector("#img-thumbs-occas");
  const validerBtn = row.querySelector("#img-valider-occas");
  let files = [];

  function renderThumbs() {
    thumbs.innerHTML = files
      .map(
        (f, i) =>
          `<div class="img-thumb" style="background-image:url(${URL.createObjectURL(f)})"><button class="img-thumb-remove" data-i="${i}">×</button></div>`,
      )
      .join("");
    thumbs.querySelectorAll(".img-thumb-remove").forEach((b) => {
      b.onclick = () => {
        files.splice(Number(b.dataset.i), 1);
        renderThumbs();
        validerBtn.disabled = files.length === 0;
      };
    });
  }

  dropZone.onclick = () => input.click();
  input.onchange = (e) => {
    files = [...files, ...e.target.files].slice(0, MAX_IMAGES);
    renderThumbs();
    validerBtn.disabled = files.length === 0;
    input.value = "";
  };

  row.querySelector("#img-skip-occas").onclick = () => {
    row.remove();
    sendSpecialUpdate({ skipImages: true, message: "__IMAGES_SKIPPED__" });
  };

  validerBtn.onclick = async () => {
    validerBtn.innerHTML = `<span class="btn-loading"></span> Envoi…`;
    validerBtn.disabled = true;
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("images", f));
      const res = await fetch(`${API_BASE}/occas/api/upload-images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.user?.token || ""}` },
        body: fd,
      });
      const data = await res.json();
      row.remove();
      sendSpecialUpdate({
        imagesbien: data.images || [],
        message: "__IMAGES_UPLOADED__",
      });
    } catch {
      validerBtn.innerHTML = `Réessayer`;
      validerBtn.disabled = false;
    }
  };
}

// ================== POP-UP 4 : CARVERTICAL ==================
function openCarverticalPopup() {
  const row = document.createElement("div");
  row.className = "msg bot structured";
  row.innerHTML = `
    <div class="bubble saas-popup carvertical-popup" style="max-width:460px;width:100%">
      <div class="saas-popup-header">
        <div class="saas-popup-icon" style="background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.3);color:#10b981">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>
        </div>
        <div>
          <h3 class="saas-popup-title">Rapport CarVertical</h3>
          <p class="saas-popup-sub">Renforcez fortement la crédibilité de votre annonce</p>
        </div>
      </div>
      <div class="carvertical-info">
        <span class="cv-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Historique kilométrique</span>
        <span class="cv-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Accidents déclarés</span>
        <span class="cv-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Confiance acheteurs +</span>
      </div>
      <input type="file" id="cv-input" hidden accept="application/pdf,image/*"/>
      <div class="img-drop-zone" id="cv-drop">
        <svg viewBox="0 0 24 24" fill="none" width="28" height="28"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6"/><polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.6"/></svg>
        <p class="img-drop-label">Déposer le rapport (<span class="img-drop-link">PDF ou image</span>)</p>
      </div>
      <div id="cv-file-preview" style="display:none"></div>
      <div class="saas-popup-actions">
        <button class="btn-saas-ghost" id="cv-skip">Passer</button>
        <button class="btn-saas-primary" id="cv-valider" disabled>
          <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          Joindre le rapport
        </button>
      </div>
    </div>`;
  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));

  const input = row.querySelector("#cv-input");
  const dropZone = row.querySelector("#cv-drop");
  const preview = row.querySelector("#cv-file-preview");
  const validerBtn = row.querySelector("#cv-valider");
  let file = null;

  dropZone.onclick = () => input.click();
  input.onchange = (e) => {
    file = e.target.files[0];
    if (!file) return;
    preview.style.display = "flex";
    preview.innerHTML = `<span class="cv-file-name"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${file.name}</span>`;
    validerBtn.disabled = false;
  };

  row.querySelector("#cv-skip").onclick = () => {
    row.remove();
    sendSpecialUpdate({
      skipCarvertical: true,
      message: "__CARVERTICAL_SKIPPED__",
    });
  };

  validerBtn.onclick = async () => {
    validerBtn.innerHTML = `<span class="btn-loading"></span> Envoi…`;
    validerBtn.disabled = true;
    try {
      const fd = new FormData();
      fd.append("report", file);
      const res = await fetch(`${API_BASE}/occas/api/upload-carvertical`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.user?.token || ""}` },
        body: fd,
      });
      const data = await res.json();
      row.remove();
      sendSpecialUpdate({
        carverticalUrl: data.url,
        carverticalNote: data.note,
        message: "__CARVERTICAL_UPLOADED__",
      });
    } catch {
      validerBtn.innerHTML = "Réessayer";
      validerBtn.disabled = false;
    }
  };
}

// ================== POP-UP 5 : RÉCAPITULATIF D'ANNONCE ==================
function fmtEuro(n) {
  return n != null ? `${Number(n).toLocaleString("fr-FR")} €` : "—";
}
function fmtKm(n) {
  return n != null ? `${Number(n).toLocaleString("fr-FR")} km` : "—";
}

function openRecapPopup(data) {
  const isSeller = data.role === "seller";
  const row = document.createElement("div");
  row.className = "msg bot structured";

  if (isSeller) {
    const bg = data.imagesbien?.[0] || null;
    const nbImg = data.imagesbien?.length || 0;
    row.innerHTML = `
      <div class="recap-ad-wrap">
        <div class="recap-ad-media ${bg ? "has-img" : "no-img"}">
          ${
            bg
              ? `<img src="${bg}" alt="véhicule"/>`
              : `<div class="car-card-placeholder">
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3 17V9l2-5h10l4 5v8"/><path d="M3 12h18"/></svg>
                </div>`
          }
          <div class="recap-ad-media-overlay">
            <div class="recap-ad-title">${data.marque || ""} ${data.modele || ""} <span>${data.annee || ""}</span></div>
            <div class="recap-ad-price">${fmtEuro(data.prix)}</div>
          </div>
          <div class="recap-ad-badges">
            ${nbImg > 1 ? `<button class="recap-badge-btn" id="recap-btn-gallery" title="Voir toutes les photos"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> ${nbImg}</button>` : ""}
            ${data.carverticalUrl ? `<button class="recap-badge-btn recap-badge-cv" id="recap-btn-cv" title="Rapport CarVertical"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg></button>` : ""}
            ${data.etatZones && Object.keys(data.etatZones).length ? `<button class="recap-badge-btn" id="recap-btn-etat" title="État détaillé du véhicule"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3 17V9l2-5h10l4 5v8"/></svg></button>` : ""}
          </div>
        </div>
        <div class="recap-ad-body">
          <div class="recap-ad-meta">
            <span>${data.carburant || "—"}</span>
            <span>boîte ${data.boite || "—"}</span>
            <span>${fmtKm(data.kilometrage)}</span>
            <span>${data.ville || "—"}</span>
          </div>
          <button class="recap-more-btn" id="recap-btn-more">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Détails de l'annonce
          </button>
          <div class="saas-popup-actions" style="margin-top:14px">
            <button class="btn-saas-ghost" id="recap-modify">Modifier</button>
            <button class="btn-saas-primary" id="recap-confirm">
              <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
              Publier l'annonce
            </button>
          </div>
        </div>
      </div>`;

    $("chat-box").appendChild(row);
    scrollBottom($("chat-box"));

    row
      .querySelector("#recap-btn-gallery")
      ?.addEventListener("click", () => openGalleryModal(data.imagesbien));
    row
      .querySelector("#recap-btn-cv")
      ?.addEventListener("click", () =>
        window.open(data.carverticalUrl, "_blank"),
      );
    row
      .querySelector("#recap-btn-etat")
      ?.addEventListener("click", () => openEtatViewerModal(data.etatZones));
    row.querySelector("#recap-btn-more")?.addEventListener("click", () => {
      document.querySelectorAll(".zone-mini-popup").forEach((p) => p.remove());
      const mini = document.createElement("div");
      mini.className = "zone-mini-popup recap-more-popup";
      mini.innerHTML = `
        <div class="zmp-title">Détails</div>
        <div class="recap-detail-row">Année : <strong>${data.annee || "—"}</strong></div>
        <div class="recap-detail-row">Kilométrage : <strong>${fmtKm(data.kilometrage)}</strong></div>
        <div class="recap-detail-row">Boîte : <strong>${data.boite || "—"}</strong></div>
        <div class="recap-detail-row">CarVertical : <strong>${data.carverticalUrl ? "Joint" : "Non fourni"}</strong></div>`;
      row.querySelector(".recap-ad-body").appendChild(mini);
      setTimeout(() => {
        document.addEventListener(
          "click",
          function h(e) {
            if (!mini.contains(e.target)) {
              mini.remove();
              document.removeEventListener("click", h);
            }
          },
          { once: false },
        );
      }, 10);
    });

    row.querySelector("#recap-confirm").onclick = () => {
      addMessage({ text: "Je confirme, publiez l'annonce.", from: "user" });
      row.remove();
      sendSpecialUpdate({
        recapConfirmed: true,
        message: "__RECAP_CONFIRMED__",
      });
    };
    row.querySelector("#recap-modify").onclick = () => {
      addMessage({
        text: "Je souhaite modifier des informations.",
        from: "user",
      });
      row.remove();
      sendSpecialUpdate({ message: "__RECAP_MODIFY__" });
    };
  } else {
    row.innerHTML = `
      <div class="bubble saas-popup recap-search-popup" style="max-width:460px;width:100%">
        <div class="saas-popup-header">
          <div class="saas-popup-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <div>
            <h3 class="saas-popup-title">Récapitulatif de votre recherche</h3>
            <p class="saas-popup-sub">Vérifiez avant de lancer le matching</p>
          </div>
        </div>
        <div class="publish-recap">
          <div class="recap-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${data.ville || "—"}</span></div>
          <div class="recap-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span>Budget max ${fmtEuro(data.budgetMax)}</span></div>
          <div class="recap-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${fmtKm(data.kilometrageMax)} max</span></div>
          <div class="recap-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linecap="round"><path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17"/><path d="M14 9h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.5a2.5 2.5 0 0 0-5 0V12"/></svg><span>${data.carburant || "—"} · boîte ${data.boite || "—"}</span></div>
          <div class="recap-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linecap="round"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3 17V9l2-5h10l4 5v8"/></svg><span>${data.marqueModeleSkipped ? "Peu importe le modèle" : [data.marque, data.modele].filter(Boolean).join(" ") || "—"}</span></div>
        </div>
        <div class="saas-popup-actions">
          <button class="btn-saas-ghost" id="recap-modify">Modifier</button>
          <button class="btn-saas-primary" id="recap-confirm">
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
            Lancer la recherche
          </button>
        </div>
      </div>`;

    $("chat-box").appendChild(row);
    scrollBottom($("chat-box"));

    row.querySelector("#recap-confirm").onclick = () => {
      addMessage({ text: "C'est parfait, lancez la recherche.", from: "user" });
      row.remove();
      sendSpecialUpdate({
        recapConfirmed: true,
        message: "__RECAP_CONFIRMED__",
      });
    };
    row.querySelector("#recap-modify").onclick = () => {
      addMessage({ text: "Je souhaite modifier des critères.", from: "user" });
      row.remove();
      sendSpecialUpdate({ message: "__RECAP_MODIFY__" });
    };
  }
}

// ================== RENDU DES ANNONCES (résultats matching) ==================
function renderMatches(matches, postReply) {
  state.lastMatches = matches;
  save("lastMatches", matches);

  addMessage({
    text: `<strong>${matches.length} annonce(s)</strong> identifiée(s) par le Cerveau IA :`,
    from: "bot",
  });

  matches.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "msg bot structured";
    const bgImg = m.imagesbien?.[0] || null;
    const compatColor =
      m.compatibility >= 80
        ? "#10b981"
        : m.compatibility >= 60
          ? "#818cf8"
          : m.compatibility >= 40
            ? "#f59e0b"
            : "#ef4444";

    row.innerHTML = `
      <div class="car-card-wrap" style="${bgImg ? `--bg:url(${bgImg})` : ""}">
        <div class="car-card-media ${bgImg ? "has-img" : "no-img"}">
          ${
            bgImg
              ? `<img src="${bgImg}" alt="véhicule"/>`
              : `<div class="car-card-placeholder">
                  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3 17V9l2-5h10l4 5v8"/><path d="M3 12h18"/></svg>
                </div>`
          }
          <div class="car-card-compat" style="color:${compatColor};border-color:${compatColor}55">${m.compatibility}%</div>
          ${
            m.imagesbien?.length > 1
              ? `<button class="car-card-gallery-btn" data-idx="${i}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  ${m.imagesbien.length} photos
                </button>`
              : ""
          }
          ${
            m.etatZones && Object.keys(m.etatZones).length
              ? `<button class="car-card-etat-btn" data-idx="${i}" title="État détaillé">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3 17V9l2-5h10l4 5v8"/></svg>
                </button>`
              : ""
          }
        </div>
        <div class="car-card-body">
          <div class="car-card-title">${m.marque || ""} ${m.modele || ""} <span class="car-card-year">${m.annee || ""}</span></div>
          <div class="car-card-meta">
            <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${m.ville || "—"}</span>
            <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${m.kilometrage ? Number(m.kilometrage).toLocaleString("fr-FR") + " km" : "—"}</span>
            <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17"/><path d="M14 9h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.5a2.5 2.5 0 0 0-5 0V12"/></svg> ${m.carburant || "—"}</span>
          </div>
          <div class="car-card-price">${m.prix ? Number(m.prix).toLocaleString("fr-FR") + " €" : m.budgetMax ? "Budget " + Number(m.budgetMax).toLocaleString("fr-FR") + " €" : "—"}</div>
          ${
            m.carverticalUrl
              ? `
            <a href="${m.carverticalUrl}" target="_blank" class="car-card-cv" title="Voir le rapport CarVertical">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              CarVertical ${m.carverticalNote != null ? `· ${m.carverticalNote}/100` : ""}
              <span class="cv-hover-hint">Rapport vérifié — cliquez pour consulter / télécharger</span>
            </a>`
              : ""
          }
          <div class="car-card-footer">
            <button class="mc-btn mc-btn-contact" data-idx="${i}">Mettre en relation</button>
          </div>
        </div>
      </div>`;

    $("chat-box").appendChild(row);

    if (m.imagesbien?.length > 1) {
      row.querySelector(".car-card-gallery-btn").onclick = () =>
        openGalleryModal(m.imagesbien);
    }
    row
      .querySelector(".car-card-etat-btn")
      ?.addEventListener("click", () => openEtatViewerModal(m.etatZones));
    row.querySelector(".mc-btn-contact").onclick = () => {
      addMessage({
        text: `Mise en relation avec ${m.marque || ""} ${m.modele || ""} — ${m.ville}`,
        from: "user",
      });
      sendSpecialUpdate({ message: `__ACTION_CONTACT__:${i}` });
    };
  });

  if (postReply) addMessage({ text: postReply, from: "bot", typing: true });
}

function openGalleryModal(images) {
  let idx = 0;
  const modal = document.createElement("div");
  modal.className = "details-modal-overlay";
  modal.style.display = "flex";
  function render() {
    modal.innerHTML = `
      <div class="details-popup-content">
        <div class="details-header">Photos<button class="close-details-btn">&times;</button></div>
        <div class="details-img-wrapper">
          <img src="${images[idx]}" class="details-main-img"/>
          <button class="c-nav c-prev">‹</button><button class="c-nav c-next">›</button>
          <div class="c-counter">${idx + 1} / ${images.length}</div>
        </div>
      </div>`;
    modal.querySelector(".close-details-btn").onclick = () => modal.remove();
    modal.querySelector(".c-prev").onclick = () => {
      idx = (idx - 1 + images.length) % images.length;
      render();
    };
    modal.querySelector(".c-next").onclick = () => {
      idx = (idx + 1) % images.length;
      render();
    };
  }
  render();
  document.body.appendChild(modal);
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

// ================== PANEL ACTIONS ==================
function initPanelActions() {
  $("btn-mise-relation")?.addEventListener("click", () =>
    sendMessage("Je souhaite être mis en relation avec un profil."),
  );
  $("btn-analyse-marche")?.addEventListener("click", () =>
    sendMessage(
      "Peux-tu analyser le marché de l'occasion pour mes résultats actuels ?",
    ),
  );
  $("btn-modifier-criteres")?.addEventListener("click", () =>
    sendMessage("Je souhaite modifier mes critères de recherche."),
  );
}

// ================== INIT ==================
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
    box.innerHTML = EMPTY_STATE_HTML;
    bindEmptyStateEvents();
  }
  updateAIPanel();
}

export function initChatOccas() {
  restoreSession();
  if (!state.user) return;

  if (load("phase") === "results") {
    state.phase = "results";
    state.lastMatches = load("lastMatches") || [];
    unlockPanelActions();
  }

  render();
  initPanelActions();

  const input = $("user-input");
  const sendBtn = $("send-btn");

  function doSend() {
    const text = (input?.value || "").trim();
    if (!text) return;
    sendMessage(text);
    if (input) {
      input.value = "";
      input.style.height = "auto";
    }
  }

  sendBtn?.addEventListener("click", doSend);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
  input?.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  document.querySelectorAll(".suggestion-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = btn.textContent.trim();
      input.focus();
    });
  });
}

document.addEventListener("DOMContentLoaded", initChatOccas);
