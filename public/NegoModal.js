/* ============================================================
   NEGO MODAL — Linear/Vercel style
   Pure JS, dark/light theme aware (utilise tes vars CSS)
   ============================================================ */

const API_BASE_NEGO = window.location.origin;

/* ---------- Auth helpers ---------- */
function getNegoToken() {
  try {
    const raw = localStorage.getItem("agent_user");
    return raw ? JSON.parse(raw).token || null : null;
  } catch {
    return null;
  }
}
function getNegoUsername() {
  try {
    const raw = localStorage.getItem("agent_user");
    return raw ? JSON.parse(raw).username || "Vous" : "Vous";
  } catch {
    return "Vous";
  }
}

/* ---------- SVG icons (Lucide-style, 1.5 stroke) ---------- */
const ICONS = {
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/></svg>`,
  handshake: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l2 2a1 1 0 0 0 1.41 0L20 13.41a2 2 0 0 0 0-2.83l-3.59-3.58a2 2 0 0 0-2.83 0L8 12.41a2 2 0 0 0 0 2.83L9.59 17"/><path d="M14 9l-3 3M4 13l3 3M7 16l-2.59 2.59a2 2 0 1 0 2.83 2.83L10 19"/></svg>`,
  door: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6a2 2 0 0 1 2 2v14H9z"/><path d="M9 4v16H5V6a2 2 0 0 1 2-2zM13 12h.01"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
};

/* ---------- State ---------- */
const negoState = {
  sessionId: null,
  adverseRole: null,
  sending: false,
  outcome: null,
  turnCount: 0,
  matchProfile: null,
  userCriteria: null,
};

/* ---------- Public API ---------- */
window.openNegoModal = async function (matchProfile, userCriteria) {
  injectNegoStyles();
  negoState.matchProfile = matchProfile;
  negoState.userCriteria = userCriteria;

  let overlay = document.getElementById("nego-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "nego-overlay";
  overlay.className = "nego-overlay";
  overlay.innerHTML = buildModalShell(matchProfile);
  document.body.appendChild(overlay);

  // Bindings
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeNegoModal();
  });
  overlay
    .querySelector(".nego-close")
    ?.addEventListener("click", closeNegoModal);
  overlay.querySelector("#nego-send")?.addEventListener("click", onSendClick);
  const input = overlay.querySelector("#nego-input");
  input?.addEventListener("keydown", onInputKey);
  input?.addEventListener("input", autoResize);

  // ESC
  document.addEventListener("keydown", escClose);

  await startNegoSession(matchProfile, userCriteria);
};

function escClose(e) {
  if (e.key === "Escape") closeNegoModal();
}

function closeNegoModal() {
  document.removeEventListener("keydown", escClose);
  const overlay = document.getElementById("nego-overlay");
  if (!overlay) return;
  overlay.classList.add("closing");
  setTimeout(() => overlay.remove(), 160);
}

/* ---------- Shell ---------- */
function buildModalShell(m) {
  const price = m.price || m.budgetMax || 0;
  const surface = m.surface || m.surfaceMin || 0;
  const pieces = m.pieces || m.piecesMin || 0;
  const ville = m.ville || "—";
  const type =
    (m.type?.charAt(0).toUpperCase() || "") + (m.type?.slice(1) || "");
  const compat = m.compatibility ?? null;

  const chips = [
    `<span class="nego-chip">${type || "Bien"} · ${ville}</span>`,
    price
      ? `<span class="nego-chip">${price.toLocaleString("fr-FR")} €</span>`
      : "",
    surface ? `<span class="nego-chip">${surface} m²</span>` : "",
    pieces ? `<span class="nego-chip">${pieces} pièces</span>` : "",
    compat !== null
      ? `<span class="nego-chip nego-chip-accent"><span class="nego-dot"></span>${compat}% compat.</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="nego-modal" role="dialog" aria-modal="true" aria-label="Simulation de négociation">
      <header class="nego-head">
        <div class="nego-head-left">
          <div class="nego-head-badge">${ICONS.spark}</div>
          <div class="nego-head-text">
            <h2 class="nego-title">Simulation de négociation</h2>
            <p class="nego-sub">L'IA joue la partie adverse — préparez vos arguments</p>
          </div>
        </div>
        <button class="nego-close" aria-label="Fermer">${ICONS.close}</button>
      </header>

      <div class="nego-meta">${chips}</div>

      <section class="nego-chat" id="nego-chat" aria-live="polite">
        <div class="nego-thinking" id="nego-boot">
          <span class="nego-spinner"></span>
          <span>Préparation de la position adverse</span>
        </div>
      </section>

      <footer class="nego-foot">
        <div class="nego-input-wrap">
          <textarea id="nego-input" class="nego-input" rows="1"
            placeholder="Écrivez votre argument…" disabled></textarea>
          <button id="nego-send" class="nego-send" disabled aria-label="Envoyer">
            ${ICONS.send}
          </button>
        </div>
        <div class="nego-hint"><kbd>Entrée</kbd> pour envoyer · <kbd>Shift</kbd>+<kbd>Entrée</kbd> nouvelle ligne</div>
      </footer>
    </div>`;
}

/* ---------- Session ---------- */
async function startNegoSession(matchProfile, userCriteria) {
  const token = getNegoToken();
  if (!token) {
    setChat(
      `<div class="nego-error">${ICONS.alert}<span>Vous devez être connecté pour utiliser la simulation.</span></div>`,
    );
    return;
  }

  try {
    const res = await fetch(`${API_BASE_NEGO}/api/nego/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ matchProfile, userCriteria }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur serveur");

    negoState.sessionId = data.sessionId;
    negoState.adverseRole = data.adverseRole;
    negoState.outcome = null;
    negoState.turnCount = 0;

    setChat("");
    addNegoMessage("adverse", data.message);
    enableNegoInput();
  } catch (e) {
    setChat(
      `<div class="nego-error">${ICONS.alert}<span>Connexion impossible : ${escapeHtml(e.message)}</span></div>`,
    );
  }
}

async function sendNegoTurn(text) {
  if (
    !text.trim() ||
    negoState.sending ||
    !negoState.sessionId ||
    negoState.outcome
  )
    return;
  negoState.sending = true;
  disableNegoInput();
  addNegoMessage("user", text);

  const thinkId = "nego-think-" + Date.now();
  const chat = document.getElementById("nego-chat");
  if (chat) {
    const role = negoState.adverseRole === "vendeur" ? "Vendeur" : "Acheteur";
    chat.insertAdjacentHTML(
      "beforeend",
      `<div class="nego-thinking" id="${thinkId}"><span class="nego-spinner"></span><span>${role} réfléchit</span></div>`,
    );
    scrollNegoChat();
  }

  try {
    const token = getNegoToken();
    const res = await fetch(`${API_BASE_NEGO}/api/nego/turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId: negoState.sessionId,
        userMessage: text,
      }),
    });
    const data = await res.json();
    document.getElementById(thinkId)?.remove();

    addNegoMessage("adverse", data.message);
    negoState.turnCount = data.turnCount || negoState.turnCount + 1;

    if (data.analysis) addNegoAnalysis(data.analysis);

    if (data.outcome) {
      negoState.outcome = data.outcome;
      showNegoOutcome(data.outcome);
      await showNegoSummary();
    } else {
      enableNegoInput();
    }
  } catch (e) {
    document.getElementById(thinkId)?.remove();
    addNegoMessage(
      "adverse",
      "Connexion perdue. Veuillez relancer la simulation.",
    );
    enableNegoInput();
  }
  negoState.sending = false;
}

async function showNegoSummary() {
  if (!negoState.sessionId) return;
  const token = getNegoToken();
  try {
    const res = await fetch(
      `${API_BASE_NEGO}/api/nego/summary/${negoState.sessionId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json();
    if (data.summary) renderNegoSummary(data.summary, data.outcome);
  } catch (e) {
    console.warn("[NegoModal] summary error:", e);
  }
}

/* ---------- Render helpers ---------- */
function setChat(html) {
  const c = document.getElementById("nego-chat");
  if (c) c.innerHTML = html;
}

function addNegoMessage(role, text) {
  const chat = document.getElementById("nego-chat");
  if (!chat) return;
  const isUser = role === "user";
  const username = getNegoUsername();
  const initial = isUser
    ? username.charAt(0).toUpperCase()
    : negoState.adverseRole === "vendeur"
      ? "V"
      : "A";

  const row = document.createElement("div");
  row.className = `nego-msg ${isUser ? "is-user" : "is-adverse"}`;
  row.innerHTML = `
    <div class="nego-av ${isUser ? "av-user" : "av-adverse"}">${initial}</div>
    <div class="nego-msg-body">
      <div class="nego-msg-meta">${isUser ? escapeHtml(username) : negoState.adverseRole === "vendeur" ? "Vendeur" : "Acheteur"}</div>
      <div class="nego-bubble">${escapeHtml(text)}</div>
    </div>`;
  chat.appendChild(row);
  scrollNegoChat();
}

function addNegoAnalysis(text) {
  const modal = document.querySelector(".nego-modal");
  if (!modal) return;
  const el = document.createElement("div");
  el.className = "nego-analysis";
  el.innerHTML = `<span class="nego-analysis-icon">${ICONS.bulb}</span><span>${escapeHtml(text)}</span>`;
  modal.querySelector(".nego-foot")?.before(el);
  setTimeout(() => {
    el.classList.add("fade-out");
    setTimeout(() => el.remove(), 320);
  }, 6000);
}

function showNegoOutcome(outcome) {
  const modal = document.querySelector(".nego-modal");
  if (!modal) return;
  const map = {
    deal: {
      icon: ICONS.handshake,
      title: "Accord trouvé",
      sub: "Vous avez conclu la simulation avec succès.",
    },
    walkaway: {
      icon: ICONS.door,
      title: "Négociation rompue",
      sub: "La partie adverse a mis fin aux discussions.",
    },
    deadlock: {
      icon: ICONS.pause,
      title: "Positions irréconciliables",
      sub: "Trop de tours sans mouvement — impasse.",
    },
  };
  const o = map[outcome] || {
    icon: ICONS.alert,
    title: "Fin de simulation",
    sub: "",
  };
  const card = document.createElement("div");
  card.className = `nego-outcome nego-outcome-${outcome}`;
  card.innerHTML = `
    <div class="nego-outcome-icon">${o.icon}</div>
    <div><div class="nego-outcome-title">${o.title}</div><div class="nego-outcome-sub">${o.sub}</div></div>`;
  modal.querySelector(".nego-foot")?.before(card);

  disableNegoInput();
  const input = document.getElementById("nego-input");
  if (input) input.placeholder = "Simulation terminée";
}

function renderNegoSummary(summary, outcome) {
  const modal = document.querySelector(".nego-modal");
  if (!modal) return;
  const chat = modal.querySelector(".nego-chat");
  const foot = modal.querySelector(".nego-foot");
  modal
    .querySelectorAll(".nego-analysis, .nego-outcome")
    .forEach((n) => n.remove());

  const note = summary.globalNote ?? "—";
  const verdict = summary.verdict || "Simulation terminée.";

  let sections = "";
  if (summary.pointsForts?.length)
    sections += sectionBlock(
      "Points forts",
      summary.pointsForts,
      ICONS.check,
      "ok",
    );
  if (summary.pointsFaibles?.length)
    sections += sectionBlock(
      "À améliorer",
      summary.pointsFaibles,
      ICONS.alert,
      "warn",
    );
  if (summary.objectionsRatees?.length)
    sections += sectionBlock(
      "Objections manquées",
      summary.objectionsRatees,
      ICONS.x,
      "err",
    );
  if (summary.conseilPrioritaire)
    sections += sectionBlock(
      "Conseil prioritaire",
      [summary.conseilPrioritaire],
      ICONS.bulb,
      "info",
    );
  if (summary.prochaineFois)
    sections += sectionBlock(
      "La prochaine fois",
      [summary.prochaineFois],
      ICONS.refresh,
      "info",
    );

  const panel = document.createElement("div");
  panel.className = "nego-summary";
  panel.innerHTML = `
    <div class="nego-summary-score">
      <div class="nego-score-ring" data-note="${note}">
        <div class="nego-score-num">${note}<small>/10</small></div>
      </div>
      <div class="nego-score-verdict">${escapeHtml(verdict)}</div>
    </div>
    <div class="nego-summary-sections">${sections}</div>`;

  if (chat) chat.style.display = "none";
  foot?.before(panel);

  const actions = document.createElement("div");
  actions.className = "nego-actions";
  actions.innerHTML = `
    <button class="nego-btn nego-btn-primary" id="nego-restart">${ICONS.refresh}<span>Rejouer</span></button>
    <button class="nego-btn nego-btn-ghost" id="nego-close-summary">Fermer</button>`;
  foot?.before(actions);
  if (foot) foot.style.display = "none";

  document.getElementById("nego-restart")?.addEventListener("click", () => {
    panel.remove();
    actions.remove();
    if (chat) {
      chat.style.display = "";
      chat.innerHTML = "";
    }
    if (foot) foot.style.display = "";
    negoState.sessionId = null;
    negoState.outcome = null;
    startNegoSession(negoState.matchProfile, negoState.userCriteria);
  });
  document
    .getElementById("nego-close-summary")
    ?.addEventListener("click", closeNegoModal);
}

function sectionBlock(title, items, icon, tone) {
  return `<div class="nego-section">
    <div class="nego-section-h">${title}</div>
    <ul class="nego-section-list">
      ${items.map((it) => `<li class="nego-section-item tone-${tone}"><span class="nego-li-icon">${icon}</span><span>${escapeHtml(it)}</span></li>`).join("")}
    </ul>
  </div>`;
}

/* ---------- Input ---------- */
function enableNegoInput() {
  const i = document.getElementById("nego-input"),
    s = document.getElementById("nego-send");
  if (i) {
    i.disabled = false;
    i.placeholder = "Écrivez votre argument…";
    i.focus();
  }
  if (s) s.disabled = false;
}
function disableNegoInput() {
  const i = document.getElementById("nego-input"),
    s = document.getElementById("nego-send");
  if (i) i.disabled = true;
  if (s) s.disabled = true;
}
function onSendClick() {
  const i = document.getElementById("nego-input");
  if (!i || !i.value.trim()) return;
  const t = i.value.trim();
  i.value = "";
  i.style.height = "auto";
  sendNegoTurn(t);
}
function onInputKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const t = e.target.value.trim();
    if (t && !negoState.sending && negoState.sessionId) {
      e.target.value = "";
      e.target.style.height = "auto";
      sendNegoTurn(t);
    }
  }
}
function autoResize(e) {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
}
function scrollNegoChat() {
  const c = document.getElementById("nego-chat");
  if (c) c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
}
function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

/* ---------- Styles injectées une seule fois ---------- */
function injectNegoStyles() {
  if (document.getElementById("nego-modal-styles")) return;
  const s = document.createElement("style");
  s.id = "nego-modal-styles";
  s.textContent = NEGO_CSS;
  document.head.appendChild(s);
}

const NEGO_CSS = `
/* === NEGO MODAL — Linear/Vercel === */
.nego-overlay{
  position:fixed; inset:0; z-index:9999;
  background:color-mix(in srgb, #000 55%, transparent);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  display:flex; align-items:center; justify-content:center;
  padding:24px;
  animation: negoFade .18s ease-out;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Text", "Segoe UI", system-ui, sans-serif;
}
.nego-overlay.closing{ animation: negoFade .16s ease-in reverse; }
@keyframes negoFade { from{opacity:0} to{opacity:1} }

.nego-modal{
  width: min(720px, 100%);
  max-height: min(86vh, 880px);
  display:flex; flex-direction:column;
  background: var(--bg-panel, #0b0b10);
  border: 1px solid var(--border-soft, rgba(255,255,255,.08));
  border-radius: 14px;
  box-shadow:
    0 1px 0 rgba(255,255,255,.04) inset,
    0 24px 64px -16px rgba(0,0,0,.5),
    0 8px 24px -8px rgba(0,0,0,.4);
  overflow:hidden;
  animation: negoSlide .22s cubic-bezier(.2,.8,.2,1);
}
[data-theme="light"] .nego-modal{
  box-shadow:
    0 1px 0 rgba(0,0,0,.02) inset,
    0 24px 64px -16px rgba(15,23,42,.18),
    0 8px 24px -8px rgba(15,23,42,.12);
}
@keyframes negoSlide{ from{opacity:0; transform:translateY(8px) scale(.985)} to{opacity:1; transform:none} }

/* Header */
.nego-head{
  display:flex; align-items:flex-start; justify-content:space-between;
  gap:12px; padding:16px 18px;
  border-bottom:1px solid var(--border-soft, rgba(255,255,255,.06));
}
.nego-head-left{ display:flex; gap:12px; align-items:flex-start; min-width:0; }
.nego-head-badge{
  width:34px; height:34px; flex:none;
  display:flex; align-items:center; justify-content:center;
  border-radius:8px;
  background: color-mix(in srgb, var(--violet, #8b5cf6) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--violet, #8b5cf6) 28%, transparent);
  color: var(--violet, #8b5cf6);
}
.nego-head-badge svg{ width:18px; height:18px; }
.nego-head-text{ min-width:0; }
.nego-title{
  font-size:14.5px; font-weight:600; letter-spacing:-.01em;
  color: var(--text-primary, #f4f4f6); margin:0;
}
.nego-sub{
  font-size:12.5px; color: var(--text-muted, #8a8a99);
  margin:2px 0 0; font-weight:400;
}
.nego-close{
  width:30px; height:30px; flex:none;
  display:flex; align-items:center; justify-content:center;
  background:transparent; border:1px solid transparent; border-radius:7px;
  color: var(--text-muted, #8a8a99); cursor:pointer;
  transition: background .15s, color .15s, border-color .15s;
}
.nego-close:hover{
  background: var(--bg-surface, rgba(255,255,255,.04));
  color: var(--text-primary, #fff);
  border-color: var(--border-soft, rgba(255,255,255,.08));
}
.nego-close svg{ width:16px; height:16px; }

/* Meta chips */
.nego-meta{
  display:flex; flex-wrap:wrap; gap:6px;
  padding:12px 18px;
  border-bottom:1px solid var(--border-soft, rgba(255,255,255,.06));
  background: color-mix(in srgb, var(--bg-surface, #15151c) 50%, transparent);
}
.nego-chip{
  display:inline-flex; align-items:center; gap:6px;
  padding:4px 9px; border-radius:6px;
  font-size:11.5px; font-weight:500; letter-spacing:-.005em;
  color: var(--text-primary, #e6e6ea);
  background: var(--bg-surface, rgba(255,255,255,.04));
  border:1px solid var(--border-soft, rgba(255,255,255,.06));
}
.nego-chip-accent{
  color: #10b981;
  background: color-mix(in srgb, #10b981 10%, transparent);
  border-color: color-mix(in srgb, #10b981 24%, transparent);
}
.nego-dot{
  width:5px; height:5px; border-radius:50%; background:#10b981;
  box-shadow:0 0 0 2px color-mix(in srgb,#10b981 18%,transparent);
}

/* Chat */
.nego-chat{
  flex:1; min-height:0; overflow-y:auto;
  padding:20px 18px;
  display:flex; flex-direction:column; gap:18px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-mid, #2a2a3e) transparent;
}
.nego-chat::-webkit-scrollbar{ width:8px }
.nego-chat::-webkit-scrollbar-thumb{ background:var(--border-mid, #2a2a3e); border-radius:4px }

.nego-msg{ display:flex; gap:10px; align-items:flex-start; }
.nego-msg.is-user{ flex-direction:row-reverse; }

.nego-av{
  width:26px; height:26px; flex:none; border-radius:6px;
  display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:600; letter-spacing:-.01em;
  color:#fff;
  background: var(--bg-surface, #1f1f29);
  border:1px solid var(--border-soft, rgba(255,255,255,.08));
}
.av-adverse{
  background: color-mix(in srgb, var(--violet, #8b5cf6) 18%, transparent);
  color: var(--violet, #c4b5fd);
  border-color: color-mix(in srgb, var(--violet, #8b5cf6) 30%, transparent);
}
.av-user{
  background: color-mix(in srgb, #6366f1 18%, transparent);
  color:#a5b4fc;
  border-color: color-mix(in srgb, #6366f1 30%, transparent);
}

.nego-msg-body{ min-width:0; max-width: 78%; display:flex; flex-direction:column; gap:4px; }
.nego-msg.is-user .nego-msg-body{ align-items:flex-end; }
.nego-msg-meta{
  font-size:11px; color: var(--text-muted, #8a8a99);
  font-weight:500; letter-spacing:-.005em;
  padding: 0 2px;
}
.nego-bubble{
  font-size:13.5px; line-height:1.55;
  color: var(--text-primary, #ececf1);
  background: var(--bg-surface, #15151c);
  border:1px solid var(--border-soft, rgba(255,255,255,.06));
  padding:10px 13px; border-radius:10px;
  word-wrap:break-word; white-space:pre-wrap;
}
.nego-msg.is-user .nego-bubble{
  background: color-mix(in srgb, #6366f1 14%, var(--bg-surface, #15151c));
  border-color: color-mix(in srgb, #6366f1 28%, transparent);
}

/* Thinking */
.nego-thinking{
  display:flex; align-items:center; gap:9px;
  padding:8px 12px; border-radius:8px;
  background: var(--bg-surface, rgba(255,255,255,.03));
  border:1px solid var(--border-soft, rgba(255,255,255,.06));
  color: var(--text-muted, #8a8a99);
  font-size:12.5px; align-self:flex-start;
}
.nego-spinner{
  width:12px; height:12px; border-radius:50%;
  border:1.5px solid var(--border-mid, #2a2a3e);
  border-top-color: var(--violet, #8b5cf6);
  animation: negoSpin .7s linear infinite;
}
@keyframes negoSpin{ to{ transform:rotate(360deg) } }

/* Error */
.nego-error{
  display:flex; align-items:center; gap:10px;
  margin:8px 0; padding:12px 14px; border-radius:8px;
  background: color-mix(in srgb, #ef4444 8%, transparent);
  border:1px solid color-mix(in srgb, #ef4444 22%, transparent);
  color:#fca5a5; font-size:13px;
}
.nego-error svg{ width:16px; height:16px; flex:none; }

/* Analysis (coach toast) */
.nego-analysis{
  margin: 0 18px 12px;
  display:flex; align-items:flex-start; gap:10px;
  padding:10px 12px; border-radius:8px;
  background: color-mix(in srgb, var(--violet, #8b5cf6) 8%, transparent);
  border:1px solid color-mix(in srgb, var(--violet, #8b5cf6) 22%, transparent);
  color: var(--text-primary, #e8e8ee); font-size:12.5px; line-height:1.5;
  transition: opacity .3s, transform .3s;
}
.nego-analysis.fade-out{ opacity:0; transform:translateY(-4px); }
.nego-analysis-icon{ color: var(--violet, #c4b5fd); display:flex; }
.nego-analysis-icon svg{ width:16px; height:16px; }

/* Outcome card */
.nego-outcome{
  margin: 0 18px 12px;
  display:flex; align-items:center; gap:12px;
  padding:14px; border-radius:10px;
  background: var(--bg-surface, rgba(255,255,255,.03));
  border:1px solid var(--border-soft, rgba(255,255,255,.08));
}
.nego-outcome-icon{
  width:36px; height:36px; flex:none; border-radius:8px;
  display:flex; align-items:center; justify-content:center;
}
.nego-outcome-icon svg{ width:18px; height:18px; }
.nego-outcome-title{ font-size:13.5px; font-weight:600; color: var(--text-primary); }
.nego-outcome-sub{ font-size:12px; color: var(--text-muted); margin-top:2px; }
.nego-outcome-deal .nego-outcome-icon{ background:color-mix(in srgb,#10b981 14%,transparent); color:#10b981; }
.nego-outcome-walkaway .nego-outcome-icon{ background:color-mix(in srgb,#f59e0b 14%,transparent); color:#f59e0b; }
.nego-outcome-deadlock .nego-outcome-icon{ background:color-mix(in srgb,#64748b 18%,transparent); color:#94a3b8; }

/* Footer */
.nego-foot{
  padding:12px 14px 14px;
  border-top:1px solid var(--border-soft, rgba(255,255,255,.06));
  background: color-mix(in srgb, var(--bg-surface, #15151c) 40%, transparent);
}
.nego-input-wrap{
  position:relative;
  display:flex; align-items:flex-end; gap:8px;
  padding:6px 6px 6px 12px;
  background: var(--bg-panel, #0b0b10);
  border:1px solid var(--border-soft, rgba(255,255,255,.1));
  border-radius:10px;
  transition: border-color .15s, box-shadow .15s;
}
.nego-input-wrap:focus-within{
  border-color: color-mix(in srgb, var(--violet, #8b5cf6) 50%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--violet, #8b5cf6) 14%, transparent);
}
.nego-input{
  flex:1; min-height:22px; max-height:140px;
  background:transparent; border:none; outline:none; resize:none;
  color: var(--text-primary, #ececf1);
  font: 400 13.5px/1.5 inherit;
  padding:6px 0;
}
.nego-input::placeholder{ color: var(--text-muted, #8a8a99); }
.nego-input:disabled{ opacity:.5; cursor:not-allowed; }

.nego-send{
  width:30px; height:30px; flex:none;
  display:flex; align-items:center; justify-content:center;
  border-radius:7px; cursor:pointer;
  color:#fff;
  background: var(--violet, #8b5cf6);
  border:1px solid color-mix(in srgb, var(--violet, #8b5cf6) 80%, #000);
  transition: filter .15s, transform .1s, opacity .15s;
}
.nego-send svg{ width:14px; height:14px; }
.nego-send:hover:not(:disabled){ filter:brightness(1.1); }
.nego-send:active:not(:disabled){ transform:scale(.96); }
.nego-send:disabled{ opacity:.4; cursor:not-allowed; }

.nego-hint{
  margin-top:8px; font-size:11px; color: var(--text-muted, #8a8a99);
  display:flex; gap:6px; align-items:center; flex-wrap:wrap;
}
.nego-hint kbd{
  font: 500 10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  padding:2px 5px; border-radius:4px;
  background: var(--bg-surface, rgba(255,255,255,.05));
  border:1px solid var(--border-soft, rgba(255,255,255,.1));
  color: var(--text-primary, #ececf1);
}

/* Summary */
.nego-summary{
  flex:1; overflow-y:auto; padding:20px 18px;
  display:flex; flex-direction:column; gap:18px;
}
.nego-summary-score{
  display:flex; align-items:center; gap:16px;
  padding:16px; border-radius:12px;
  background: var(--bg-surface, rgba(255,255,255,.03));
  border:1px solid var(--border-soft, rgba(255,255,255,.06));
}
.nego-score-ring{
  width:64px; height:64px; flex:none; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  background: conic-gradient(var(--violet, #8b5cf6) calc(var(--p,70%) * 1), var(--bg-panel, #0b0b10) 0);
  position:relative;
}
.nego-score-ring::after{
  content:""; position:absolute; inset:4px; border-radius:50%;
  background: var(--bg-panel, #0b0b10);
}
.nego-score-num{
  position:relative; z-index:1; font-size:18px; font-weight:600;
  color: var(--text-primary); letter-spacing:-.02em;
}
.nego-score-num small{ font-size:11px; opacity:.5; font-weight:500; }
.nego-score-verdict{ font-size:13px; line-height:1.55; color: var(--text-primary); }

.nego-summary-sections{ display:flex; flex-direction:column; gap:14px; }
.nego-section-h{
  font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
  color: var(--text-muted, #8a8a99); margin-bottom:6px;
}
.nego-section-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.nego-section-item{
  display:flex; gap:9px; align-items:flex-start;
  padding:9px 11px; border-radius:8px;
  background: var(--bg-surface, rgba(255,255,255,.03));
  border:1px solid var(--border-soft, rgba(255,255,255,.06));
  font-size:13px; line-height:1.5; color: var(--text-primary);
}
.nego-li-icon{ display:flex; margin-top:1px; flex:none; }
.nego-li-icon svg{ width:14px; height:14px; }
.tone-ok .nego-li-icon{ color:#10b981 } 
.tone-warn .nego-li-icon{ color:#f59e0b }
.tone-err .nego-li-icon{ color:#ef4444 }
.tone-info .nego-li-icon{ color: var(--violet, #a78bfa) }

/* Actions */
.nego-actions{
  display:flex; gap:8px; padding:12px 18px 16px;
  border-top:1px solid var(--border-soft, rgba(255,255,255,.06));
}
.nego-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:6px;
  padding:8px 14px; border-radius:7px; cursor:pointer;
  font: 500 12.5px/1 inherit; letter-spacing:-.005em;
  transition: background .15s, border-color .15s, filter .15s;
}
.nego-btn svg{ width:14px; height:14px; }
.nego-btn-primary{
  background: var(--violet, #8b5cf6); color:#fff;
  border:1px solid color-mix(in srgb, var(--violet, #8b5cf6) 80%, #000);
}
.nego-btn-primary:hover{ filter:brightness(1.08); }
.nego-btn-ghost{
  background:transparent; color: var(--text-primary);
  border:1px solid var(--border-soft, rgba(255,255,255,.1));
}
.nego-btn-ghost:hover{
  background: var(--bg-surface, rgba(255,255,255,.04));
  border-color: var(--border-mid, rgba(255,255,255,.16));
}

/* Light theme tweaks */
[data-theme="light"] .nego-overlay{ background: color-mix(in srgb, #0f172a 35%, transparent); }
[data-theme="light"] .nego-bubble{ background:#fff; }
[data-theme="light"] .nego-msg.is-user .nego-bubble{
  background: color-mix(in srgb, #6366f1 8%, #fff);
}
[data-theme="light"] .nego-input-wrap{ background:#fff; }
[data-theme="light"] .nego-hint kbd{ background:#f1f3f8; }

/* Mobile */
@media (max-width: 640px){
  .nego-overlay{ padding:0; }
  .nego-modal{ border-radius:0; max-height:100vh; height:100vh; width:100%; }
  .nego-msg-body{ max-width: 85%; }
}
`;
