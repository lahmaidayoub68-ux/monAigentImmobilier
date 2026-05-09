/**
 * transactionTimeline.js — AiGENT · Timeline de dossier partagée
 * ────────────────────────────────────────────────────────────────
 * Affiche une mini-timeline Acheteur/Vendeur dans la messagerie,
 * cochable par l'un ou l'autre, persistée en localStorage.
 *
 * Étapes : Premier contact → Visite → Offre → Compromis → Acte
 *
 * Usage :
 *   import { injectTimeline } from './transactionTimeline.js';
 *
 *   // Après avoir chargé une conversation, appeler :
 *   injectTimeline(conversationKey, currentUser);
 *
 * ────────────────────────────────────────────────────────────────
 */

/* ─── CONFIG ÉTAPES ───────────────────────────────────── */
const TIMELINE_STEPS = [
  {
    id: "contact",
    label: "Premier contact",
    desc: "Les deux parties ont échangé",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  },
  {
    id: "visite",
    label: "Visite",
    desc: "Visite du bien planifiée ou effectuée",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>`,
  },
  {
    id: "offre",
    label: "Offre",
    desc: "Offre d'achat formulée",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
  },
  {
    id: "compromis",
    label: "Compromis",
    desc: "Compromis de vente signé",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  },
  {
    id: "acte",
    label: "Acte notarié",
    desc: "Signature chez le notaire",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>`,
  },
];

/* ─── PERSISTANCE ──────────────────────────────────── */
const STORAGE_KEY = "aigent_timelines";

function loadAllTimelines() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllTimelines(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function getTimeline(conversationKey) {
  const all = loadAllTimelines();
  if (!all[conversationKey]) {
    all[conversationKey] = {
      steps: {},
      createdAt: new Date().toISOString(),
      lastUpdated: null,
      lastUpdatedBy: null,
    };
    saveAllTimelines(all);
  }
  return all[conversationKey];
}

function toggleStep(conversationKey, stepId, username) {
  const all = loadAllTimelines();
  if (!all[conversationKey]) {
    all[conversationKey] = { steps: {}, createdAt: new Date().toISOString() };
  }

  const tl = all[conversationKey];
  const isChecked = !!tl.steps[stepId];

  if (isChecked) {
    delete tl.steps[stepId];
  } else {
    tl.steps[stepId] = {
      by: username,
      at: new Date().toISOString(),
    };
  }

  tl.lastUpdated = new Date().toISOString();
  tl.lastUpdatedBy = username;
  saveAllTimelines(all);
  return !isChecked;
}

/* ─── CALCUL PROGRESSION ─────────────────────────── */
function getProgress(steps) {
  const checked = TIMELINE_STEPS.filter((s) => steps[s.id]).length;
  return Math.round((checked / TIMELINE_STEPS.length) * 100);
}

function getActiveStepIndex(steps) {
  for (let i = TIMELINE_STEPS.length - 1; i >= 0; i--) {
    if (steps[TIMELINE_STEPS[i].id]) return i;
  }
  return -1;
}

/* ─── FORMAT DATE RELATIVE ───────────────────────── */
function fmtRelative(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Il y a ${hrs}h`;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/* ─── RENDU HTML DE LA TIMELINE ──────────────────── */
function renderTimelineHTML(conversationKey, currentUser, tl) {
  const steps = tl.steps || {};
  const progress = getProgress(steps);
  const activeIdx = getActiveStepIndex(steps);
  const isComplete = progress === 100;

  const stepsHTML = TIMELINE_STEPS.map((step, idx) => {
    const isDone = !!steps[step.id];
    const meta = steps[step.id];
    const isPast = idx <= activeIdx;
    const isCurrent = idx === activeIdx + 1;

    let stateClass = "tl-step-pending";
    if (isDone) stateClass = "tl-step-done";
    else if (isCurrent) stateClass = "tl-step-current";

    return `
      <div class="tl-step ${stateClass}" data-step-id="${step.id}" data-conv-key="${conversationKey}" role="button" tabindex="0" aria-label="${isDone ? "Décocher" : "Cocher"} : ${step.label}">
        <div class="tl-step-indicator">
          <div class="tl-step-circle">
            ${
              isDone
                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
                : step.icon
            }
          </div>
          ${
            idx < TIMELINE_STEPS.length - 1
              ? `<div class="tl-connector ${isPast && activeIdx >= idx ? "tl-connector-done" : ""}"></div>`
              : ""
          }
        </div>
        <div class="tl-step-content">
          <div class="tl-step-label">${step.label}</div>
          <div class="tl-step-desc">${meta ? `<span class="tl-step-by">${meta.by} · ${fmtRelative(meta.at)}</span>` : step.desc}</div>
        </div>
      </div>
    `;
  }).join("");

  const lastUpdateText = tl.lastUpdated
    ? `Mis à jour ${fmtRelative(tl.lastUpdated)} par ${tl.lastUpdatedBy}`
    : "Aucune action enregistrée";

  return `
    <div class="transaction-timeline" id="tl-${conversationKey}" data-conv="${conversationKey}">
      <div class="tl-header">
        <div class="tl-header-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span class="tl-title">Suivi de dossier</span>
        </div>
        <div class="tl-progress-badge ${isComplete ? "tl-badge-complete" : ""}">
          ${progress}%
        </div>
      </div>

      <div class="tl-progress-track">
        <div class="tl-progress-fill" style="width: ${progress}%"></div>
      </div>

      <div class="tl-steps">
        ${stepsHTML}
      </div>

      <div class="tl-footer">
        <span class="tl-last-update">${lastUpdateText}</span>
        <button class="tl-collapse-btn" aria-label="Réduire la timeline">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
      </div>

      ${
        isComplete
          ? `
        <div class="tl-complete-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Transaction finalisée · Félicitations !
        </div>
      `
          : ""
      }
    </div>
  `;
}

/* ─── STYLES ─────────────────────────────────────── */
const TIMELINE_CSS = `
  .transaction-timeline {
    margin: 14px 0 6px;
    padding: 14px 16px;
    background: var(--bg-card, rgba(255,255,255,0.03));
    border: 1px solid var(--border, rgba(139,92,246,0.15));
    border-radius: 12px;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .tl-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .tl-header-left {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-secondary, #a89ec9);
  }

  .tl-header-left svg {
    opacity: 0.7;
  }

  .tl-title {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary, #a89ec9);
  }

  .tl-progress-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 20px;
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
    letter-spacing: 0.02em;
    font-family: 'Space Mono', monospace;
    transition: all 0.3s;
  }

  .tl-badge-complete {
    background: rgba(52, 211, 153, 0.15);
    color: #34d399;
  }

  .tl-progress-track {
    height: 3px;
    background: rgba(139, 92, 246, 0.1);
    border-radius: 3px;
    margin-bottom: 14px;
    overflow: hidden;
  }

  .tl-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #a855f7, #f472b6);
    border-radius: 3px;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tl-steps {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tl-step {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 7px 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    user-select: none;
  }

  .tl-step:hover {
    background: rgba(99, 102, 241, 0.06);
  }

  .tl-step:focus-visible {
    outline: 2px solid rgba(99, 102, 241, 0.5);
    outline-offset: 2px;
  }

  .tl-step-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    padding-top: 1px;
  }

  .tl-step-circle {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid rgba(139, 92, 246, 0.2);
    background: rgba(139, 92, 246, 0.05);
    color: var(--text-muted, #6b7280);
    transition: all 0.25s;
    flex-shrink: 0;
  }

  .tl-step-done .tl-step-circle {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border-color: transparent;
    color: #fff;
    box-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);
  }

  .tl-step-current .tl-step-circle {
    border-color: #818cf8;
    color: #818cf8;
    background: rgba(99, 102, 241, 0.08);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .tl-connector {
    width: 1.5px;
    height: 16px;
    background: rgba(139, 92, 246, 0.12);
    margin: 3px 0;
    border-radius: 1px;
    transition: background 0.3s;
  }

  .tl-connector-done {
    background: linear-gradient(180deg, #6366f1, rgba(99, 102, 241, 0.3));
  }

  .tl-step-content {
    flex: 1;
    min-width: 0;
    padding-top: 4px;
  }

  .tl-step-label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-primary, #f1f0ff);
    line-height: 1.2;
    transition: color 0.2s;
  }

  .tl-step-pending .tl-step-label {
    color: var(--text-muted, #6b7280);
    font-weight: 500;
  }

  .tl-step-done .tl-step-label {
    color: var(--text-primary, #f1f0ff);
  }

  .tl-step-desc {
    font-size: 10.5px;
    color: var(--text-muted, #6b7280);
    margin-top: 2px;
    line-height: 1.3;
  }

  .tl-step-by {
    color: #818cf8;
    font-weight: 500;
  }

  .tl-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(139, 92, 246, 0.08);
  }

  .tl-last-update {
    font-size: 10px;
    color: var(--text-muted, #6b7280);
    font-style: italic;
  }

  .tl-collapse-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 3px 6px;
    border-radius: 4px;
    color: var(--text-muted, #6b7280);
    display: flex;
    align-items: center;
    transition: background 0.15s, color 0.15s;
  }

  .tl-collapse-btn:hover {
    background: rgba(99, 102, 241, 0.08);
    color: #818cf8;
  }

  .tl-complete-banner {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 10px;
    padding: 8px 12px;
    background: rgba(52, 211, 153, 0.08);
    border: 1px solid rgba(52, 211, 153, 0.2);
    border-radius: 8px;
    font-size: 11.5px;
    font-weight: 600;
    color: #34d399;
  }

  /* Collapsed state */
  .transaction-timeline.tl-collapsed .tl-steps,
  .transaction-timeline.tl-collapsed .tl-footer,
  .transaction-timeline.tl-collapsed .tl-complete-banner {
    display: none;
  }

  .transaction-timeline.tl-collapsed {
    padding-bottom: 10px;
  }

  /* Animation entrée */
  .transaction-timeline {
    animation: tlSlideIn 0.3s ease forwards;
  }

  @keyframes tlSlideIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Step check animation */
  @keyframes tlCheckPop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.18); }
    100% { transform: scale(1); }
  }

  .tl-step-done .tl-step-circle {
    animation: tlCheckPop 0.28s ease;
  }
`;

/* ─── INJECTION DES STYLES ───────────────────────── */
function injectStyles() {
  if (document.getElementById("tl-style")) return;
  const style = document.createElement("style");
  style.id = "tl-style";
  style.textContent = TIMELINE_CSS;
  document.head.appendChild(style);
}

/* ─── MONTAGE / DÉMONTAGE ─────────────────────────── */
function mountTimeline(conversationKey, currentUser) {
  injectStyles();

  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;

  // Supprimer l'ancienne timeline si présente
  const existing = chatBox.querySelector(".transaction-timeline");
  if (existing) existing.remove();

  const tl = getTimeline(conversationKey);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderTimelineHTML(conversationKey, currentUser, tl);
  const tlEl = wrapper.firstElementChild;

  chatBox.prepend(tlEl);

  // Collapse/expand
  const collapseBtn = tlEl.querySelector(".tl-collapse-btn");
  collapseBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    tlEl.classList.toggle("tl-collapsed");
    const isCollapsed = tlEl.classList.contains("tl-collapsed");
    const svg = collapseBtn.querySelector("svg");
    if (svg) {
      svg.style.transform = isCollapsed ? "rotate(180deg)" : "";
    }
  });

  // Clic sur une étape
  tlEl.querySelectorAll(".tl-step[data-step-id]").forEach((step) => {
    const handler = (e) => {
      if (e.target.closest(".tl-collapse-btn")) return;
      const stepId = step.dataset.stepId;
      const convKey = step.dataset.convKey;
      const nowChecked = toggleStep(convKey, stepId, currentUser);

      // Feedback visuel immédiat (re-render)
      const tlFresh = getTimeline(convKey);
      const newWrapper = document.createElement("div");
      newWrapper.innerHTML = renderTimelineHTML(convKey, currentUser, tlFresh);
      const newTl = newWrapper.firstElementChild;

      // Préserver l'état collapsed
      if (tlEl.classList.contains("tl-collapsed")) {
        newTl.classList.add("tl-collapsed");
      }

      tlEl.replaceWith(newTl);
      // Remonter les listeners sur le nouveau DOM
      mountListeners(newTl, conversationKey, currentUser);
    };

    step.addEventListener("click", handler);
    step.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler(e);
      }
    });
  });
}

function mountListeners(tlEl, conversationKey, currentUser) {
  const collapseBtn = tlEl.querySelector(".tl-collapse-btn");
  collapseBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    tlEl.classList.toggle("tl-collapsed");
    const svg = collapseBtn.querySelector("svg");
    if (svg)
      svg.style.transform = tlEl.classList.contains("tl-collapsed")
        ? "rotate(180deg)"
        : "";
  });

  tlEl.querySelectorAll(".tl-step[data-step-id]").forEach((step) => {
    step.addEventListener("click", (e) => {
      if (e.target.closest(".tl-collapse-btn")) return;
      const stepId = step.dataset.stepId;
      toggleStep(conversationKey, stepId, currentUser);
      const wasColl = tlEl.classList.contains("tl-collapsed");
      const tlFresh = getTimeline(conversationKey);
      const nw = document.createElement("div");
      nw.innerHTML = renderTimelineHTML(conversationKey, currentUser, tlFresh);
      const newTl = nw.firstElementChild;
      if (wasColl) newTl.classList.add("tl-collapsed");
      tlEl.replaceWith(newTl);
      mountListeners(newTl, conversationKey, currentUser);
    });
    step.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        step.click();
      }
    });
  });
}

/* ─── EXPORT PUBLIC ──────────────────────────────── */
/**
 * injectTimeline(conversationKey, currentUser)
 *
 * À appeler après chaque chargement de conversation.
 * Ne s'affiche QUE si la conversation est entre un buyer et un seller
 * (détecté via la présence d'un match contact dans l'historique).
 * Pour simplifier l'intégration : toujours afficher dès qu'il y a une conversation.
 *
 * @param {string} conversationKey - identifiant de conversation (pseudo ou groupeId)
 * @param {string} currentUser - pseudo de l'utilisateur connecté
 */
export function injectTimeline(conversationKey, currentUser) {
  if (!conversationKey || conversationKey.startsWith("groupe__")) return;
  mountTimeline(conversationKey, currentUser);
}
