/**
 * fonctios-profil.js — AiGENT Dashboard v4
 * VERSION FUSIONNÉE : fonctios-profil.js + corrections-profil.js
 * Tous les bugs corrigés, toutes les fonctions boostées.
 *
 * BUGS RÉSOLUS :
 *  - BUG 1  : Notifications — authH() disponible partout
 *  - BUG 2  : Intégrations — vraies cards outils externes (WhatsApp, Google Agenda, etc.)
 *  - BUG 3  : Workspace — bouton Envoyer + champ email + vue symétrique membres
 *  - BUG 4  : Graphique Activité — Chart.js avec persistance DB
 *  - BUG 5  : SVG Intégrations sidenav
 *  - BUG 6  : Agenda — notificateur robuste (persistance DB, comparaison minute précise)
 *  - BUG 7  : Workspace — fonctionnalités complètes (partage projets, notes partagées, outils coll.)
 *  - BUG 8  : Workspace — vue symétrique (B voit A après acceptation)
 *  - BUG 9  : Menu 3 points projets — délégation d'événements robuste
 *  - BUG 10 : Temps d'écran — persistance DB via /api/me/session-time
 */

const API = window.location.origin;
let _boostUser = null;
let _boostToken = null;

// ══════════════════════════════════════════════════════════════════════
// HELPERS AUTH — disponibles globalement
// ══════════════════════════════════════════════════════════════════════

function _getToken() {
  try {
    const raw = localStorage.getItem("agent_user");
    return raw ? JSON.parse(raw)?.token : null;
  } catch {
    return null;
  }
}

function _authH() {
  const t = _boostToken || _getToken();
  return { Authorization: `Bearer ${t}` };
}

// Alias global pour compatibilité profil.js
window._authH = _authH;

// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  try {
    const raw = localStorage.getItem("agent_user");
    if (raw) {
      _boostUser = JSON.parse(raw);
      _boostToken = _boostUser?.token;
    }
  } catch {}

  _removeDuplicateSidenavLinks();

  initCommandPalette();
  initClickToCopy();
  initHotkeysModal();
  initProjectStatusMenus();
  initAgenda();
  initWorkspace();
  init2FA();
  initIntegrations();
  patchSkeletonLoaders();
  initSessionTimeTracking();
});

function authH() {
  return _authH();
}

// ══════════════════════════════════════════════════════════════════════
// SUPPRESSION DOUBLONS SIDENAV
// ══════════════════════════════════════════════════════════════════════

function _removeDuplicateSidenavLinks() {
  const sidenav = document.getElementById("settingsSidenav");
  if (!sidenav) return;
  ["agenda", "workspace", "integrations"].forEach((sec) => {
    sidenav
      .querySelectorAll(`.sidenav-link[data-section="${sec}"]`)
      .forEach((el) => el.remove());
    const existingSection = document.getElementById(`section-${sec}`);
    if (existingSection) existingSection.remove();
  });
}

// ══════════════════════════════════════════════════════════════════════
// TOAST HELPER
// ══════════════════════════════════════════════════════════════════════

function showBoostToast(message, type = "info") {
  if (typeof showToast === "function") {
    showToast(message, type);
    return;
  }
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const ICONS = {
    success: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--err)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    info: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${ICONS[type] || ICONS.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "fadeOutToast 0.35s ease forwards";
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ══════════════════════════════════════════════════════════════════════
// MODAL GÉNÉRIQUE
// ══════════════════════════════════════════════════════════════════════

function _fixShowModal({ icon, title, body, confirmLabel, onConfirm }) {
  document.querySelectorAll(".fix-modal-overlay").forEach((m) => m.remove());
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active fix-modal-overlay";
  overlay.style.zIndex = "9999";
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;animation:modalIn .18s cubic-bezier(.34,1.56,.64,1) both">
      <div style="text-align:center;margin-bottom:12px">${icon}</div>
      <h3 class="modal-title">${title}</h3>
      <div style="margin-bottom:16px">${body}</div>
      <div class="modal-actions">
        <button class="btn-secondary" id="fix-modal-cancel" style="flex:1">Annuler</button>
        <button class="btn-primary" id="fix-modal-confirm" style="flex:1">${confirmLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#fix-modal-cancel").onclick = () => overlay.remove();
  overlay.querySelector("#fix-modal-confirm").onclick = async () => {
    const result = await onConfirm();
    if (result !== false) overlay.remove();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ══════════════════════════════════════════════════════════════════════
// 1. COMMAND PALETTE
// ══════════════════════════════════════════════════════════════════════

const CMD_ITEMS = [
  {
    group: "Navigation",
    icon: "user",
    label: "Identité & Profil",
    section: "identity",
    shortcut: "I",
  },
  {
    group: "Navigation",
    icon: "lock",
    label: "Sécurité",
    section: "security",
    shortcut: "S",
  },
  {
    group: "Navigation",
    icon: "folder",
    label: "Mes projets",
    section: "projects",
    shortcut: "P",
  },
  {
    group: "Navigation",
    icon: "bell",
    label: "Notifications",
    section: "notifications",
    shortcut: "N",
  },
  {
    group: "Navigation",
    icon: "settings",
    label: "Préférences",
    section: "preferences",
    shortcut: "R",
  },
  {
    group: "Navigation",
    icon: "activity",
    label: "Activité",
    section: "activity",
    shortcut: "A",
  },
  {
    group: "Navigation",
    icon: "message",
    label: "Support",
    section: "support",
    shortcut: "",
  },
  {
    group: "Navigation",
    icon: "calendar",
    label: "Agenda",
    section: "agenda",
    shortcut: "",
  },
  {
    group: "Navigation",
    icon: "users",
    label: "Espace de travail",
    section: "workspace",
    shortcut: "",
  },
  {
    group: "Navigation",
    icon: "plug",
    label: "Intégrations",
    section: "integrations",
    shortcut: "",
  },
  {
    group: "Navigation",
    icon: "alert",
    label: "Zone critique",
    section: "danger",
    shortcut: "",
  },
  {
    group: "Actions",
    icon: "moon",
    label: "Basculer thème sombre/clair",
    action: "toggleTheme",
  },
  { group: "Actions", icon: "shield", label: "Activer 2FA", action: "open2FA" },
  {
    group: "Actions",
    icon: "keyboard",
    label: "Raccourcis clavier",
    action: "openHotkeys",
  },
  {
    group: "Actions",
    icon: "download",
    label: "Exporter mes données",
    action: "exportData",
  },
  { group: "Actions", icon: "logout", label: "Déconnexion", action: "logout" },
];

const ICON_SVG = {
  user: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  lock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  folder: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`,
  bell: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  settings: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
  activity: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  message: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  calendar: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  users: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  plug: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  alert: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  moon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  shield: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  keyboard: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="6" y1="14" x2="18" y2="14"/></svg>`,
  download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  logout: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
};

let cmdActiveIdx = -1;
let cmdFiltered = CMD_ITEMS;

function initCommandPalette() {
  const overlay = document.createElement("div");
  overlay.id = "cmdOverlay";
  overlay.className = "cmd-overlay";
  overlay.innerHTML = `
    <div class="cmd-box" id="cmdBox">
      <div class="cmd-input-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="cmd-input" id="cmdInput" placeholder="Rechercher une action ou une section…" autocomplete="off"/>
        <span class="cmd-shortcut-hint">ESC</span>
      </div>
      <div class="cmd-results" id="cmdResults"></div>
      <div class="cmd-footer">
        <span><kbd>↑↓</kbd> Naviguer</span>
        <span><kbd>↵</kbd> Sélectionner</span>
        <span><kbd>Esc</kbd> Fermer</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = document.getElementById("cmdInput");
  const results = document.getElementById("cmdResults");

  function renderCmdResults() {
    const q = (input.value || "").toLowerCase().trim();
    cmdFiltered = q
      ? CMD_ITEMS.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            (i.group || "").toLowerCase().includes(q),
        )
      : CMD_ITEMS;
    cmdActiveIdx = cmdFiltered.length > 0 ? 0 : -1;
    drawCmdResults();
  }

  function drawCmdResults() {
    if (!cmdFiltered.length) {
      results.innerHTML = `<div class="cmd-no-results">Aucun résultat</div>`;
      return;
    }
    const groups = {};
    cmdFiltered.forEach((item, idx) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push({ ...item, _idx: idx });
    });
    let html = "";
    for (const [group, items] of Object.entries(groups)) {
      html += `<div class="cmd-group-label">${group}</div>`;
      items.forEach((item) => {
        html += `<div class="cmd-item${item._idx === cmdActiveIdx ? " active" : ""}" data-idx="${item._idx}">
          <div class="cmd-item-icon">${ICON_SVG[item.icon] || ""}</div>
          <span>${item.label}</span>
          ${item.shortcut ? `<span class="cmd-item-meta"><kbd>${item.shortcut}</kbd></span>` : ""}
        </div>`;
      });
    }
    results.innerHTML = html;
    results.querySelectorAll(".cmd-item").forEach((el) => {
      el.addEventListener("click", () =>
        executeCmdItem(parseInt(el.dataset.idx, 10)),
      );
      el.addEventListener("mouseenter", () => {
        cmdActiveIdx = parseInt(el.dataset.idx, 10);
        drawCmdResults();
      });
    });
    const active = results.querySelector(".cmd-item.active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function openCmd() {
    overlay.classList.add("active");
    input.value = "";
    renderCmdResults();
    setTimeout(() => input.focus(), 50);
  }
  function closeCmd() {
    overlay.classList.remove("active");
  }

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      overlay.classList.contains("active") ? closeCmd() : openCmd();
    }
    if (!overlay.classList.contains("active")) return;
    if (e.key === "Escape") {
      closeCmd();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cmdActiveIdx = Math.min(cmdActiveIdx + 1, cmdFiltered.length - 1);
      drawCmdResults();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      cmdActiveIdx = Math.max(cmdActiveIdx - 1, 0);
      drawCmdResults();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (cmdActiveIdx >= 0) executeCmdItem(cmdActiveIdx);
    }
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeCmd();
  });
  input.addEventListener("input", renderCmdResults);

  function executeCmdItem(idx) {
    const item = cmdFiltered[idx];
    if (!item) return;
    closeCmd();
    if (item.section) {
      const link = document.querySelector(
        `.sidenav-link[data-section="${item.section}"]`,
      );
      if (link) link.click();
      return;
    }
    switch (item.action) {
      case "toggleTheme":
        document.getElementById("btn-theme")?.click();
        break;
      case "open2FA":
        document
          .querySelector('.sidenav-link[data-section="security"]')
          ?.click();
        setTimeout(
          () =>
            document
              .getElementById("btn-enable2fa")
              ?.scrollIntoView({ behavior: "smooth" }),
          300,
        );
        break;
      case "openHotkeys":
        window.openHotkeysModal();
        break;
      case "exportData":
        document.getElementById("btnExportData")?.click();
        break;
      case "logout":
        document.getElementById("btn-logout")?.click();
        break;
    }
  }
  window.openCommandPalette = openCmd;
}

// ══════════════════════════════════════════════════════════════════════
// 2. CLICK-TO-COPY
// ══════════════════════════════════════════════════════════════════════

function initClickToCopy() {
  document.querySelectorAll("[data-copy]").forEach(attachCopyBtn);
}

function attachCopyBtn(el) {
  const wrap = document.createElement("div");
  wrap.className = "copy-field-wrap";
  el.parentNode.insertBefore(wrap, el);
  wrap.appendChild(el);
  const btn = document.createElement("button");
  btn.className = "copy-btn";
  btn.title = "Copier";
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  wrap.appendChild(btn);
  btn.addEventListener("click", () => {
    navigator.clipboard.writeText(el.textContent.trim()).then(() => {
      btn.classList.add("copied");
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      }, 1800);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// 3. SKELETON LOADERS
// ══════════════════════════════════════════════════════════════════════

function patchSkeletonLoaders() {
  const skeletonTarget = document.getElementById("projects-list");
  if (skeletonTarget && skeletonTarget.textContent.trim() === "Chargement…") {
    skeletonTarget.innerHTML = [1, 2, 3]
      .map(
        () => `
      <div style="display:flex;align-items:stretch;border:1px solid var(--border);border-radius:var(--r8);overflow:hidden;margin-bottom:7px">
        <div class="skeleton" style="width:3px;flex-shrink:0"></div>
        <div style="flex:1;padding:10px 13px">
          <div class="skeleton skel-block wide" style="margin-bottom:7px"></div>
          <div class="skeleton skel-block mid"></div>
        </div>
      </div>`,
      )
      .join("");
  }
  ["act-matches", "act-favoris", "act-messages", "act-compat"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.textContent === "—") {
      el.innerHTML = `<span class="skeleton skel-block" style="width:40px;height:20px;display:inline-block"></span>`;
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// 4. HOTKEYS MODAL
// ══════════════════════════════════════════════════════════════════════

const HOTKEYS = [
  { desc: "Ouvrir la Command Palette", keys: ["⌘", "K"] },
  { desc: "Afficher les raccourcis", keys: ["?"] },
  { desc: "Aller à Identité", keys: ["G", "puis", "I"] },
  { desc: "Aller à Sécurité", keys: ["G", "puis", "S"] },
  { desc: "Aller à Projets", keys: ["G", "puis", "P"] },
  { desc: "Aller à Notifications", keys: ["G", "puis", "N"] },
  { desc: "Aller à Agenda", keys: ["G", "puis", "A"] },
  { desc: "Basculer thème", keys: ["T"] },
  { desc: "Nouveau projet", keys: ["⌘", "N"] },
  { desc: "Sauvegarder session", keys: ["⌘", "S"] },
];

let _gMode = false;

function initHotkeysModal() {
  const overlay = document.createElement("div");
  overlay.id = "hotkeysOverlay";
  overlay.className = "hotkeys-modal-overlay";
  overlay.innerHTML = `
    <div class="hotkeys-modal-box">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <h3 style="font-size:14px;font-weight:700;color:var(--t1)">Raccourcis clavier</h3>
        <button id="closeHotkeys" style="background:transparent;border:none;cursor:pointer;color:var(--t4);font-size:18px;line-height:1">&times;</button>
      </div>
      <p style="font-size:11px;color:var(--t4);margin-bottom:2px">Actifs sur toutes les pages.</p>
      <div class="hotkeys-grid">
        ${HOTKEYS.map(
          (h) => `
          <div class="hotkey-row">
            <span class="hotkey-desc">${h.desc}</span>
            <span class="hotkey-keys">
              ${h.keys.map((k) => (k === "puis" ? `<span class="hotkey-sep">puis</span>` : `<span class="hotkey-key">${k}</span>`)).join("")}
            </span>
          </div>`,
        ).join("")}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById("closeHotkeys").onclick = () =>
    overlay.classList.remove("active");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("active");
  });

  window.openHotkeysModal = () => overlay.classList.add("active");

  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (e.key === "?") {
      e.preventDefault();
      window.openHotkeysModal();
      return;
    }
    if (e.key === "t" || e.key === "T") {
      document.getElementById("btn-theme")?.click();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault();
      document.querySelector('[data-section="projects"]')?.click();
      return;
    }
    if (e.key === "g" || e.key === "G") {
      _gMode = true;
      setTimeout(() => (_gMode = false), 1200);
      return;
    }
    if (_gMode) {
      _gMode = false;
      const map = {
        i: "identity",
        s: "security",
        p: "projects",
        n: "notifications",
        a: "agenda",
      };
      const section = map[e.key.toLowerCase()];
      if (section)
        document
          .querySelector(`.sidenav-link[data-section="${section}"]`)
          ?.click();
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// 5. PROJECT STATUS MENUS — délégation d'événements robuste (BUG 9 fixé)
// ══════════════════════════════════════════════════════════════════════

const PROJECT_STATUSES = [
  { key: "inprogress", label: "En cours", color: "#7c3aed" },
  { key: "done", label: "Terminé", color: "#059669" },
  { key: "paused", label: "En pause", color: "#d97706" },
  { key: "cancelled", label: "Annulé", color: "#dc2626" },
  { key: "draft", label: "Brouillon", color: "#9898b8" },
];

const _projectStatuses = JSON.parse(
  localStorage.getItem("aigent_project_statuses") || "{}",
);
function saveProjectStatuses() {
  localStorage.setItem(
    "aigent_project_statuses",
    JSON.stringify(_projectStatuses),
  );
}

function initProjectStatusMenus() {
  // Délégation au niveau du document pour capturer les éléments créés dynamiquement
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".pc-3dot-btn") &&
      !e.target.closest(".pc-status-menu")
    ) {
      document.querySelectorAll(".pc-status-menu").forEach((m) => m.remove());
    }

    const dotBtn = e.target.closest(".pc-3dot-btn");
    if (!dotBtn) return;
    e.stopPropagation();

    document.querySelectorAll(".pc-status-menu").forEach((m) => m.remove());

    const card = dotBtn.closest(".project-card");
    if (!card) return;

    const viewBtn = card.querySelector(".pc-btn-view");
    const projectId = viewBtn?.dataset?.id;
    const currentStatus = _projectStatuses[projectId] || "inprogress";

    const menu = document.createElement("div");
    menu.className = "pc-status-menu";
    // Position de base — on calcule après insertion
    menu.style.cssText =
      "position:fixed;z-index:9999;background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--r8);box-shadow:var(--s4);min-width:195px;padding:4px 0;visibility:hidden;";
    menu.innerHTML = `
      <div style="padding:4px 8px 5px;font-size:9.5px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.08em">Statut du projet</div>
      ${PROJECT_STATUSES.map(
        (s) => `
        <div class="pc-status-menu-item${s.key === currentStatus ? " active" : ""}" data-status="${s.key}" style="display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;font-size:12px;font-weight:600;color:var(--t1);transition:background .1s">
          <span class="pc-status-dot" style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
          ${s.label}
          ${s.key === currentStatus ? `<svg style="margin-left:auto" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
        </div>`,
      ).join("")}
      <div style="border-top:1px solid var(--border);margin:4px 0"></div>
      <div class="pc-status-menu-item" data-action="rename" style="display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;font-size:12px;font-weight:600;color:var(--t2);transition:background .1s">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        Renommer
      </div>
      <div class="pc-status-menu-item danger" data-action="delete" style="display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;font-size:12px;font-weight:600;color:var(--err);transition:background .1s">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        Supprimer
      </div>`;
    // On append au body pour éviter tout clipping par overflow:hidden
    document.body.appendChild(menu);

    // Calcul de position intelligente après insertion
    // Calcul de position intelligente après insertion dans le body (position:fixed)
    requestAnimationFrame(() => {
      const btnRect = dotBtn.getBoundingClientRect();
      const menuH = menu.offsetHeight;
      const menuW = menu.offsetWidth;
      const vp = { w: window.innerWidth, h: window.innerHeight };

      // Horizontal : aligner à droite du bouton, sans dépasser les bords
      let left = btnRect.right - menuW;
      if (left < 8) left = btnRect.left;
      if (left + menuW > vp.w - 8) left = vp.w - menuW - 8;

      // Vertical : en dessous si ça tient, sinon au-dessus
      let top = btnRect.bottom + 4;
      if (top + menuH > vp.h - 8) {
        top = btnRect.top - menuH - 4;
        if (top < 8) top = Math.max(8, vp.h - menuH - 8);
      }

      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.visibility = "visible";
    });

    // Fermeture lors du scroll — le menu reste dans le body (position:fixed)
    const closeOnScroll = () => menu.remove();
    window.addEventListener("scroll", closeOnScroll, {
      once: true,
      passive: true,
    });
    document
      .querySelector(".settings-main")
      ?.addEventListener("scroll", closeOnScroll, {
        once: true,
        passive: true,
      });
    // NE PAS faire card.appendChild(menu) — il reste dans document.body pour que position:fixed fonctionne
    // Hover styles
    menu.querySelectorAll(".pc-status-menu-item").forEach((item) => {
      item.onmouseenter = () => (item.style.background = "var(--bg-surface)");
      item.onmouseleave = () => (item.style.background = "transparent");
    });

    menu.querySelectorAll("[data-status]").forEach((item) => {
      item.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const newStatus = item.dataset.status;
        _projectStatuses[projectId] = newStatus;
        saveProjectStatuses();
        const chip = card.querySelector(".project-status-chip");
        if (chip) {
          const info = PROJECT_STATUSES.find((s) => s.key === newStatus);
          chip.textContent = info.label;
          chip.className = `project-status-chip status-chip-${newStatus}`;
        }
        menu.remove();
      });
    });

    menu
      .querySelector("[data-action='delete']")
      ?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        menu.remove();
        card.querySelector(".pc-btn-delete")?.click();
      });

    menu
      .querySelector("[data-action='rename']")
      ?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        menu.remove();
        const nameEl = card.querySelector(".pc-name");
        if (!nameEl) return;
        const currentName = nameEl.textContent;
        const input = document.createElement("input");
        input.value = currentName;
        input.className = "field-input";
        input.style.cssText =
          "font-size:12px;height:26px;padding:2px 6px;width:140px";
        nameEl.replaceWith(input);
        input.focus();
        input.select();
        const done = async () => {
          const newName = input.value.trim() || currentName;
          const span = document.createElement("span");
          span.className = "pc-name";
          span.textContent = newName;
          input.replaceWith(span);
          if (newName !== currentName && projectId) {
            await fetch(`${API}/api/projects/${projectId}`, {
              method: "PATCH",
              headers: { ..._authH(), "Content-Type": "application/json" },
              body: JSON.stringify({ name: newName }),
            }).catch(() => {});
          }
        };
        input.addEventListener("blur", done);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") input.blur();
          if (e.key === "Escape") {
            input.value = currentName;
            input.blur();
          }
        });
      });
  });

  // Observer pour ajouter status chips sur nouveaux éléments
  const observer = new MutationObserver(() => _attachStatusChips());
  const list = document.getElementById("projects-list");
  if (list) observer.observe(list, { childList: true, subtree: true });
  _attachStatusChips();
}

function _attachStatusChips() {
  document
    .querySelectorAll(".project-card:not([data-status-attached])")
    .forEach((card) => {
      card.setAttribute("data-status-attached", "1");
      card.style.position = "relative";

      const actionsEl = card.querySelector(".pc-actions");
      if (!actionsEl) return;

      const viewBtn = card.querySelector(".pc-btn-view");
      const projectId = viewBtn?.dataset?.id;

      const headerEl = card.querySelector(".pc-header");
      if (
        headerEl &&
        projectId &&
        !headerEl.querySelector(".project-status-chip")
      ) {
        const status = _projectStatuses[projectId] || "inprogress";
        const info =
          PROJECT_STATUSES.find((s) => s.key === status) || PROJECT_STATUSES[0];
        const chip = document.createElement("span");
        chip.className = `project-status-chip status-chip-${status}`;
        chip.textContent = info.label;
        headerEl.appendChild(chip);
      }

      if (!actionsEl.querySelector(".pc-3dot-btn")) {
        const dotBtn = document.createElement("button");
        dotBtn.className = "pc-3dot-btn";
        dotBtn.title = "Options";
        dotBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>`;
        actionsEl.appendChild(dotBtn);
      }
    });
}

// ══════════════════════════════════════════════════════════════════════
// 6. AGENDA — stockage DB + notificateur robuste (BUG 6 fixé)
// ══════════════════════════════════════════════════════════════════════

let _agendaEvents = [];
let _agendaCurrentDate = new Date();

async function loadAgendaEvents() {
  try {
    const res = await fetch(`${API}/api/agenda`, { headers: _authH() });
    if (res.ok) _agendaEvents = await res.json();
    else
      _agendaEvents = JSON.parse(
        localStorage.getItem("aigent_agenda_events") || "[]",
      );
  } catch {
    _agendaEvents = JSON.parse(
      localStorage.getItem("aigent_agenda_events") || "[]",
    );
  }
}
async function saveAgendaEvent(ev) {
  localStorage.setItem("aigent_agenda_events", JSON.stringify(_agendaEvents));

  // Sync automatique Google Calendar si connecté
  try {
    const integRes = await fetch(`${API}/api/integrations`, {
      headers: _authH(),
    });
    if (integRes.ok) {
      const { connected } = await integRes.json();
      if (connected.includes("google-agenda")) {
        fetch(`${API}/api/integrations/google/sync-event`, {
          method: "POST",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ event: ev }),
        })
          .then(async (r) => {
            if (r.ok) {
              const d = await r.json();
              if (d.htmlLink)
                showBoostToast(`✅ Synchronisé avec Google Agenda`, "success");
            }
          })
          .catch(() => {});
      }
    }
  } catch {}

  try {
    const res = await fetch(`${API}/api/agenda`, {
      method: "POST",
      headers: { ..._authH(), "Content-Type": "application/json" },
      body: JSON.stringify(ev),
    });
    if (res.ok) {
      const data = await res.json();
      ev.id = data.id || ev.id;
    }
  } catch {}
}

async function deleteAgendaEvent(id) {
  _agendaEvents = _agendaEvents.filter((e) => e.id !== id);
  localStorage.setItem("aigent_agenda_events", JSON.stringify(_agendaEvents));
  try {
    await fetch(`${API}/api/agenda/${id}`, {
      method: "DELETE",
      headers: _authH(),
    });
  } catch {}
}

function initAgenda() {
  const main = document.querySelector(".settings-main");
  if (!main) return;

  const sidenav = document.getElementById("settingsSidenav");
  if (sidenav) {
    const firstGroup = sidenav.querySelector(".sidenav-group .sidenav-links");
    if (
      firstGroup &&
      !sidenav.querySelector('.sidenav-link[data-section="agenda"]')
    ) {
      const link = document.createElement("a");
      link.href = "#";
      link.className = "sidenav-link";
      link.dataset.section = "agenda";
      link.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Agenda`;
      firstGroup.appendChild(link);
    }
  }

  const section = document.createElement("section");
  section.className = "settings-section";
  section.id = "section-agenda";
  section.innerHTML = `
    <div class="section-title-row">
      <h2>Agenda</h2>
      <p>Planifiez vos visites, rendez-vous et échéances — synchronisé avec votre compte</p>
    </div>
    <div class="settings-block agenda-section-relative">
      <div class="agenda-nav">
        <button class="agenda-nav-btn" id="agenda-prev">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="agenda-month-label" id="agenda-month-label"></span>
        <div style="display:flex;gap:6px">
          <button class="agenda-nav-btn" id="agenda-today" style="width:auto;padding:0 9px;font-size:11px;font-weight:700">Aujourd'hui</button>
          <button class="agenda-nav-btn" id="agenda-next">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div class="agenda-grid" id="agenda-grid"></div>
      <div class="agenda-upcoming" id="agenda-upcoming">
        <div class="agenda-upcoming-title">Prochains événements</div>
        <div style="font-size:12px;color:var(--t4);font-style:italic">Chargement…</div>
      </div>
    </div>`;
  main.appendChild(section);

  document.getElementById("agenda-prev").onclick = () => {
    _agendaCurrentDate.setMonth(_agendaCurrentDate.getMonth() - 1);
    renderAgendaCalendar();
  };
  document.getElementById("agenda-next").onclick = () => {
    _agendaCurrentDate.setMonth(_agendaCurrentDate.getMonth() + 1);
    renderAgendaCalendar();
  };
  document.getElementById("agenda-today").onclick = () => {
    _agendaCurrentDate = new Date();
    renderAgendaCalendar();
  };

  loadAgendaEvents().then(() => {
    renderAgendaCalendar();
    startAgendaNotifier();
  });
}

function renderAgendaCalendar() {
  const grid = document.getElementById("agenda-grid");
  const label = document.getElementById("agenda-month-label");
  if (!grid || !label) return;

  const year = _agendaCurrentDate.getFullYear();
  const month = _agendaCurrentDate.getMonth();
  const today = new Date();

  label.textContent = new Date(year, month, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  grid.innerHTML = DAY_NAMES.map(
    (d) => `<div class="agenda-day-header">${d}</div>`,
  ).join("");

  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "agenda-cell";
    let cellDate;
    let otherMonth = false;

    if (i < startDow) {
      cellDate = new Date(year, month - 1, daysInPrevMonth - startDow + i + 1);
      otherMonth = true;
    } else if (i >= startDow + daysInMonth) {
      cellDate = new Date(year, month + 1, i - startDow - daysInMonth + 1);
      otherMonth = true;
    } else {
      cellDate = new Date(year, month, i - startDow + 1);
    }

    if (otherMonth) cell.classList.add("other-month");
    if (cellDate.toDateString() === today.toDateString())
      cell.classList.add("today");

    const numEl = document.createElement("div");
    numEl.className = "agenda-day-num";
    numEl.textContent = cellDate.getDate();
    cell.appendChild(numEl);

    const dateStr = cellDate.toISOString().split("T")[0];
    const dayEvents = _agendaEvents.filter((e) => e.date === dateStr);
    dayEvents.slice(0, 3).forEach((ev) => {
      const pill = document.createElement("div");
      pill.className = `agenda-event-pill${ev.color ? " event-" + ev.color : ""}`;
      pill.textContent = ev.name;
      pill.title = ev.description || ev.name;
      pill.onclick = (e) => {
        e.stopPropagation();
        openEventDetail(ev);
      };
      cell.appendChild(pill);
    });
    if (dayEvents.length > 3) {
      const more = document.createElement("div");
      more.style.cssText =
        "font-size:9px;color:var(--t4);padding:1px 4px;font-weight:600";
      more.textContent = `+${dayEvents.length - 3} autre(s)`;
      cell.appendChild(more);
    }
    cell.addEventListener("click", () => openCreateEventModal(cellDate));
    grid.appendChild(cell);
  }
  renderAgendaUpcoming();
}

function openCreateEventModal(date) {
  document.querySelectorAll(".agenda-create-modal").forEach((m) => m.remove());
  const modal = document.createElement("div");
  modal.className = "agenda-create-modal";
  const dateStr = date.toISOString().split("T")[0];
  const dateLabel = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  modal.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">${dateLabel}</div>
    <div class="field-stack">
      <div class="field-group">
        <label class="field-label">Nom de l'événement <span style="color:#f472b6">*</span></label>
        <input type="text" id="ev-name" class="field-input" placeholder="Ex: Visite appartement…" maxlength="60"/>
      </div>
      <div class="field-row">
        <div class="field-group">
          <label class="field-label">Heure</label>
          <input type="time" id="ev-time" class="field-input" value="10:00"/>
        </div>
        <div class="field-group">
          <label class="field-label">Type</label>
          <select id="ev-color" class="field-select">
            <option value="">Bleu (défaut)</option>
            <option value="ok">Vert — Confirmé</option>
            <option value="warn">Orange — Rappel</option>
            <option value="err">Rouge — Urgent</option>
          </select>
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Description</label>
        <input type="text" id="ev-desc" class="field-input" placeholder="Adresse, notes…" maxlength="120"/>
      </div>
    </div>
    <div style="display:flex;gap:7px;margin-top:12px">
      <button class="btn-secondary" id="ev-cancel" style="flex:1">Annuler</button>
      <button class="btn-primary" id="ev-save" style="flex:1">Créer</button>
    </div>`;

  const section = document.querySelector(".agenda-section-relative");
  if (section) section.appendChild(modal);

  document.getElementById("ev-cancel").onclick = () => modal.remove();
  document.getElementById("ev-save").onclick = async () => {
    const name = document.getElementById("ev-name").value.trim();
    if (!name) {
      document.getElementById("ev-name").focus();
      return;
    }
    const ev = {
      id: Date.now().toString(),
      date: dateStr,
      name,
      time: document.getElementById("ev-time").value,
      description: document.getElementById("ev-desc").value.trim(),
      color: document.getElementById("ev-color").value,
      notified: false,
    };
    _agendaEvents.push(ev);
    await saveAgendaEvent(ev);
    modal.remove();
    renderAgendaCalendar();
  };

  setTimeout(() => document.getElementById("ev-name")?.focus(), 50);
  setTimeout(() => {
    document.addEventListener(
      "click",
      (e) => {
        if (!modal.contains(e.target)) modal.remove();
      },
      { once: true },
    );
  }, 20);
}

function openEventDetail(ev) {
  document.querySelectorAll(".agenda-create-modal").forEach((m) => m.remove());
  const modal = document.createElement("div");
  modal.className = "agenda-create-modal";
  modal.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--t1)">${ev.name}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${ev.date}${ev.time ? " · " + ev.time : ""}</div>
        ${ev.description ? `<div style="font-size:11px;color:var(--t2);margin-top:5px">${ev.description}</div>` : ""}
      </div>
      <button id="ev-del" class="btn-ghost-destructive" style="flex-shrink:0;height:28px;font-size:11px;padding:0 9px">Supprimer</button>
    </div>`;
  const section = document.querySelector(".agenda-section-relative");
  if (section) section.appendChild(modal);
  document.getElementById("ev-del").onclick = async () => {
    await deleteAgendaEvent(ev.id);
    modal.remove();
    renderAgendaCalendar();
  };
  setTimeout(() => {
    document.addEventListener(
      "click",
      (e) => {
        if (!modal.contains(e.target)) modal.remove();
      },
      { once: true },
    );
  }, 20);
}

function renderAgendaUpcoming() {
  const container = document.getElementById("agenda-upcoming");
  if (!container) return;
  const todayStr = new Date().toISOString().split("T")[0];
  const upcoming = _agendaEvents
    .filter((e) => e.date >= todayStr)
    .sort((a, b) =>
      a.date + (a.time || "") > b.date + (b.time || "") ? 1 : -1,
    )
    .slice(0, 5);

  if (!upcoming.length) {
    container.innerHTML = `<div class="agenda-upcoming-title">Prochains événements</div><div style="font-size:12px;color:var(--t4);font-style:italic">Aucun événement à venir. Cliquez sur un jour pour en créer un.</div>`;
    return;
  }
  const COLOR_MAP = {
    ok: "#059669",
    warn: "#d97706",
    err: "#dc2626",
    "": "#7c3aed",
  };
  container.innerHTML = `<div class="agenda-upcoming-title">Prochains événements</div>
    ${upcoming
      .map((ev) => {
        const color = COLOR_MAP[ev.color] || "#7c3aed";
        const dateLabel = new Date(ev.date + "T00:00:00").toLocaleDateString(
          "fr-FR",
          { day: "numeric", month: "short" },
        );
        return `<div class="agenda-upcoming-item">
        <span class="agenda-upcoming-dot" style="background:${color}"></span>
        <div class="agenda-upcoming-content">
          <div class="agenda-upcoming-name">${ev.name}</div>
          <div class="agenda-upcoming-meta">${ev.description ? ev.description.slice(0, 50) : ""}</div>
        </div>
        <span class="agenda-time-badge">${dateLabel}${ev.time ? " · " + ev.time : ""}</span>
        <button class="agenda-upcoming-del" data-id="${ev.id}" title="Supprimer">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
      })
      .join("")}`;

  container.querySelectorAll(".agenda-upcoming-del").forEach((btn) => {
    btn.onclick = async () => {
      await deleteAgendaEvent(btn.dataset.id);
      renderAgendaCalendar();
    };
  });
}

// ══════════════════════════════════════
// NOTIFICATEUR AGENDA ROBUSTE (BUG 6)
// Comparaison "HH:MM" précise, rechargement DB à chaque minute
// ══════════════════════════════════════
function startAgendaNotifier() {
  // 1. Demander la permission notifications
  if (Notification && Notification.permission === "default") {
    Notification.requestPermission();
  }

  // 2. Enregistrer le Service Worker et lui passer le token
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw-agenda.js")
      .then((reg) => {
        // Attendre que le SW soit actif
        const sw = reg.active || reg.installing || reg.waiting;
        const sendStart = (controller) => {
          if (!controller) return;
          const raw = localStorage.getItem("agent_user");
          const token = raw ? JSON.parse(raw)?.token : null;
          if (!token) return;
          controller.postMessage({
            type: "AGENDA_START",
            token,
            apiOrigin: window.location.origin,
          });
        };
        if (reg.active) {
          sendStart(reg.active);
        } else {
          navigator.serviceWorker.ready.then((r) => sendStart(r.active));
        }
        // Exposer la fonction dismiss pour le bouton "Vu"
        window._agendaDismiss = async (evId) => {
          dismissNotif(evId);
          if (reg.active) {
            reg.active.postMessage({ type: "AGENDA_DISMISS", evId });
          }
        };
      })
      .catch((err) => {
        console.warn(
          "[SW Agenda] Enregistrement échoué, fallback polling:",
          err,
        );
        _startAgendaPollingFallback();
      });
  } else {
    // Navigateur sans SW : fallback polling sur la page
    _startAgendaPollingFallback();
  }

  // 3. Conserver le checker IN-PAGE pour l'affichage des toasts persistants
  // (complément du SW — gère l'UI toast quand la page est ouverte)
  _startAgendaInPageToasts();
}

// ── Fallback polling (si SW non supporté) ─────────────────────────────────
function _startAgendaPollingFallback() {
  const PENDING_KEY = "aigent_agenda_pending_notifs";
  function getPendingNotifs() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function setPendingNotifs(obj) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(obj));
  }
  function dismissNotif(evId) {
    const pending = getPendingNotifs();
    delete pending[evId];
    setPendingNotifs(pending);
    document.getElementById(`agenda-toast-${evId}`)?.remove();
  }

  async function checkAndNotify() {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    try {
      const res = await fetch(`${API}/api/agenda`, { headers: _authH() });
      if (res.ok) _agendaEvents = await res.json();
    } catch {}
    const pending = getPendingNotifs();
    for (const ev of _agendaEvents) {
      const evId = String(ev.id);
      if (ev.date !== todayStr || ev.notified || pending[evId]) continue;
      const evTime = (ev.time || "").trim().slice(0, 5);
      if (!evTime) continue;
      const [evH, evM] = evTime.split(":").map(Number);
      const evMinutes = evH * 60 + evM;
      if (nowMinutes >= evMinutes && nowMinutes - evMinutes <= 480) {
        _showPersistentAgendaToast(ev, dismissNotif);
        if (Notification?.permission === "granted") {
          new Notification(`📅 ${ev.name}`, {
            body: ev.description?.slice(0, 80) || `Événement à ${ev.time}`,
            icon: "/images/logo.png",
            tag: `agenda-${evId}`,
            requireInteraction: true,
          });
        }
        const p = getPendingNotifs();
        p[evId] = { ev, shownAt: Date.now() };
        setPendingNotifs(p);
        try {
          await fetch(`${API}/api/agenda/${evId}`, {
            method: "PATCH",
            headers: { ..._authH(), "Content-Type": "application/json" },
            body: JSON.stringify({ notified: true }),
          });
          ev.notified = true;
        } catch {}
      }
    }
  }

  window._agendaDismiss = async (evId) => {
    dismissNotif(evId);
    try {
      await fetch(`${API}/api/agenda/${evId}`, {
        method: "PATCH",
        headers: { ..._authH(), "Content-Type": "application/json" },
        body: JSON.stringify({ notified: true }),
      });
      const ev = _agendaEvents.find((e) => String(e.id) === String(evId));
      if (ev) ev.notified = true;
    } catch {}
  };

  checkAndNotify();
  const msUntilNext =
    (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
  setTimeout(() => {
    checkAndNotify();
    setInterval(checkAndNotify, 60000);
  }, msUntilNext);
}

// ── Toasts in-page (quand la page est ouverte — complément du SW) ──────────
function _startAgendaInPageToasts() {
  const PENDING_KEY = "aigent_agenda_pending_notifs";
  function getPendingNotifs() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function setPendingNotifs(obj) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(obj));
  }

  function dismissNotif(evId) {
    const pending = getPendingNotifs();
    delete pending[evId];
    setPendingNotifs(pending);
    document.getElementById(`agenda-toast-${evId}`)?.remove();
    _repositionToasts();
  }

  window._agendaDismiss = async (evId) => {
    dismissNotif(evId);
    try {
      await fetch(`${API}/api/agenda/${evId}`, {
        method: "PATCH",
        headers: { ..._authH(), "Content-Type": "application/json" },
        body: JSON.stringify({ notified: true }),
      });
      const ev = _agendaEvents.find((e) => String(e.id) === String(evId));
      if (ev) ev.notified = true;
    } catch {}
    _repositionToasts();
  };

  function _repositionToasts() {
    const pending = getPendingNotifs();
    Object.keys(pending).forEach((id, idx) => {
      const el = document.getElementById(`agenda-toast-${id}`);
      if (el) el.style.bottom = `${18 + idx * 76}px`;
    });
  }

  // Restaurer les toasts en attente (événements non encore vus)
  const pending = getPendingNotifs();
  const todayStr = new Date().toISOString().split("T")[0];
  const cleaned = {};
  Object.entries(pending).forEach(([evId, { ev }]) => {
    if (ev.date === todayStr && !ev.notified) {
      _showPersistentAgendaToast(ev, dismissNotif);
      cleaned[evId] = { ev };
    }
  });
  setPendingNotifs(cleaned);

  // Vérifier aussi les événements du jour déjà chargés mais pas encore affichés en toast
  async function checkInPageToasts() {
    try {
      const res = await fetch(`${API}/api/agenda`, { headers: _authH() });
      if (res.ok) _agendaEvents = await res.json();
    } catch {}
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const pending = getPendingNotifs();
    for (const ev of _agendaEvents) {
      const evId = String(ev.id);
      if (ev.date !== todayStr || ev.notified || pending[evId]) continue;
      const evTime = (ev.time || "").trim().slice(0, 5);
      if (!evTime) continue;
      const [evH, evM] = evTime.split(":").map(Number);
      const evMinutes = evH * 60 + evM;
      if (nowMinutes >= evMinutes && nowMinutes - evMinutes <= 480) {
        _showPersistentAgendaToast(ev, dismissNotif);
        const p = getPendingNotifs();
        p[evId] = { ev, shownAt: Date.now() };
        setPendingNotifs(p);
      }
    }
  }

  checkInPageToasts();
  const msUntilNext =
    (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
  setTimeout(() => {
    checkInPageToasts();
    setInterval(checkInPageToasts, 60000);
  }, msUntilNext);
}

// ── Helper toast persistant (partagé par les deux modes) ──────────────────
function _showPersistentAgendaToast(ev, dismissFn) {
  document.getElementById(`agenda-toast-${ev.id}`)?.remove();
  const COLOR_MAP = {
    ok: "#059669",
    warn: "#d97706",
    err: "#dc2626",
    "": "#7c3aed",
  };
  const dotColor = COLOR_MAP[ev.color] || "#7c3aed";
  const PENDING_KEY = "aigent_agenda_pending_notifs";
  function getPendingCount() {
    try {
      return Object.keys(JSON.parse(localStorage.getItem(PENDING_KEY) || "{}"))
        .length;
    } catch {
      return 0;
    }
  }
  const toast = document.createElement("div");
  toast.id = `agenda-toast-${ev.id}`;
  toast.style.cssText = `
    position:fixed;bottom:${18 + getPendingCount() * 76}px;left:18px;z-index:9998;
    background:var(--bg-panel);border:1px solid var(--border-mid);border-left:3px solid ${dotColor};
    border-radius:var(--r8);box-shadow:var(--s4);padding:11px 14px;max-width:310px;
    display:flex;flex-direction:column;gap:5px;animation:toastIn .18s var(--ease) both;
    font-family:inherit;
  `;
  toast.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;animation:pulse 1.4s infinite"></span>
        <div style="font-size:12px;font-weight:700;color:var(--t1)">${ev.name}</div>
      </div>
      <button onclick="window._agendaDismiss('${ev.id}')" style="background:rgba(5,150,105,.12);border:1px solid rgba(5,150,105,.25);border-radius:5px;cursor:pointer;color:var(--ok);font-size:10.5px;font-weight:700;padding:2px 8px;white-space:nowrap;font-family:inherit">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle"><polyline points="20 6 9 17 4 12"/></svg>
        Vu
      </button>
    </div>
    ${ev.description ? `<div style="font-size:11px;color:var(--t3);padding-left:15px">${ev.description.slice(0, 70)}</div>` : ""}
    <div style="font-size:10px;color:var(--t4);padding-left:15px;display:flex;align-items:center;gap:5px">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Aujourd'hui à ${ev.time || "--:--"} — cliquez "Vu" pour fermer
    </div>`;
  document.body.appendChild(toast);
}

function showAgendaToast(ev) {
  document.querySelector(".agenda-notif-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "agenda-notif-toast visible";
  toast.style.cssText =
    "position:fixed;bottom:18px;left:18px;z-index:9998;background:var(--bg-panel);border:1px solid var(--border-mid);border-left:3px solid var(--v);border-radius:var(--r8);box-shadow:var(--s4);padding:11px 14px;max-width:300px;display:flex;flex-direction:column;gap:4px;animation:toastIn .18s var(--ease) both;";
  const COLOR_MAP = {
    ok: "#059669",
    warn: "#d97706",
    err: "#dc2626",
    "": "#7c3aed",
  };
  const dotColor = COLOR_MAP[ev.color] || "#7c3aed";
  toast.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div style="display:flex;align-items:center;gap:7px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>
        <div style="font-size:12px;font-weight:700;color:var(--t1)">${ev.name}</div>
      </div>
      <button onclick="this.closest('.agenda-notif-toast').remove()" style="background:none;border:none;cursor:pointer;color:var(--t4);font-size:16px;line-height:1;padding:0 2px;">×</button>
    </div>
    ${ev.description ? `<div style="font-size:11px;color:var(--t3);padding-left:15px">${ev.description.slice(0, 60)}</div>` : ""}
    <div style="font-size:10px;color:var(--t4);padding-left:15px">Maintenant · ${ev.time}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "fadeOutToast .35s ease forwards";
    setTimeout(() => toast.remove(), 350);
  }, 12000);
}

// ══════════════════════════════════════════════════════════════════════
// 7. WORKSPACE — BOOSTÉ (BUG 2, 3, 7, 8 fixés)
// Vue symétrique, toutes fonctionnalités, notes partagées, partage projets
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// 7. WORKSPACE — COMPLET AVEC PERSISTANCE DB
// ══════════════════════════════════════════════════════════════════════

const WS_API = `${API}/api/workspace`;

async function _wsGet(type) {
  try {
    const res = await fetch(`${WS_API}/data/${type}`, { headers: _authH() });
    if (!res.ok) return [];
    const data = await res.json();
    // Dédupliquer par clé (au cas où la query renvoie des doublons owner↔member)
    const seen = new Map();
    for (const item of data) {
      if (!seen.has(item.key)) seen.set(item.key, item);
    }
    return [...seen.values()];
  } catch {
    return [];
  }
}

async function _wsSet(type, key, value) {
  await fetch(`${WS_API}/data/${type}`, {
    method: "POST",
    headers: { ..._authH(), "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
}

async function _wsDel(type, key) {
  await fetch(`${WS_API}/data/${type}/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: _authH(),
  });
}

function initWorkspace() {
  const main = document.querySelector(".settings-main");
  if (!main) return;

  const sidenav = document.getElementById("settingsSidenav");
  if (sidenav) {
    const firstGroup = sidenav.querySelector(".sidenav-group .sidenav-links");
    if (
      firstGroup &&
      !sidenav.querySelector('.sidenav-link[data-section="workspace"]')
    ) {
      const link = document.createElement("a");
      link.href = "#";
      link.className = "sidenav-link";
      link.dataset.section = "workspace";
      link.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Espace de travail`;
      firstGroup.appendChild(link);
    }
  }

  const section = document.createElement("section");
  section.className = "settings-section";
  section.id = "section-workspace";
  section.innerHTML = `
    <div class="section-title-row">
      <h2>Espace de travail</h2>
      <p>Collaborez avec votre co-acheteur, courtier ou notaire</p>
    </div>

    <div class="settings-block">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
          <div><h3>Membres</h3><p>Partagez votre recherche avec des personnes de confiance</p></div>
        </div>
        <button class="btn-primary" id="ws-invite-toggle" style="font-size:12px;height:30px;padding:0 12px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Inviter
        </button>
      </div>
      <div class="block-body">
        <div class="workspace-members" id="ws-members-list">
          <div style="text-align:center;padding:20px;color:var(--t4);font-size:12px">Chargement…</div>
        </div>
        <div id="ws-invite-form" style="display:none;margin-top:12px;padding:14px;background:var(--bg-surface);border:1px dashed var(--border-mid);border-radius:var(--r8)">
          <div style="display:flex;align-items:center;gap:7px;padding:8px 10px;background:var(--v-soft);border:1px solid rgba(109,40,217,.12);border-radius:var(--r6);font-size:11px;color:var(--t2);margin-bottom:12px;line-height:1.45">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v)" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Le pseudo et l'e-mail doivent correspondre au même compte AiGENT
          </div>
          <div class="field-stack">
            <div class="field-group">
              <label class="field-label">Pseudo exact <span style="color:#f472b6">*</span></label>
              <input type="text" id="ws-pseudo-input" class="field-input" placeholder="Pseudo de l'utilisateur…"/>
            </div>
            <div class="field-group">
              <label class="field-label">Adresse e-mail <span style="color:#f472b6">*</span></label>
              <input type="email" id="ws-email-input" class="field-input" placeholder="email@exemple.com"/>
            </div>
            <div class="field-group">
              <label class="field-label">Rôle</label>
              <select class="field-select" id="ws-role-select">
                <option value="collab">Co-acheteur (peut modifier)</option>
                <option value="readonly">Lecture seule (courtier, notaire…)</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:7px;margin-top:12px">
            <button class="btn-secondary" id="ws-cancel-invite" style="flex:1">Annuler</button>
            <button class="btn-primary" id="ws-send-invite-btn" style="flex:1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Envoyer l'invitation
            </button>
          </div>
          <div id="ws-invite-result" style="margin-top:8px"></div>
        </div>
      </div>
    </div>

    <div class="settings-block" id="ws-collab-block" style="display:none">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-icon"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>
          <div><h3>Outils collaboratifs</h3><p>Partagez, planifiez et préparez ensemble</p></div>
        </div>
        <div id="ws-sync-status" style="display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--t4)">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--ok);display:inline-block"></span>
          Synchronisé
        </div>
      </div>
      <div class="block-body" style="padding:0">
        <div id="ws-tabs" style="display:flex;border-bottom:1px solid var(--border);overflow-x:auto;scrollbar-width:none">
          <button class="ws-tab active" data-tab="projets" style="padding:11px 16px;font-size:12px;font-weight:700;color:var(--v);border:none;background:none;border-bottom:2px solid var(--v);cursor:pointer;white-space:nowrap;font-family:inherit">Projets partagés</button>
          <button class="ws-tab" data-tab="documents" style="padding:11px 16px;font-size:12px;font-weight:600;color:var(--t3);border:none;background:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;font-family:inherit">Documents</button>
          <button class="ws-tab" data-tab="notes" style="padding:11px 16px;font-size:12px;font-weight:600;color:var(--t3);border:none;background:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;font-family:inherit">Notes communes</button>
          <button class="ws-tab" data-tab="criteres" style="padding:11px 16px;font-size:12px;font-weight:600;color:var(--t3);border:none;background:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;font-family:inherit">Critères validés</button>
          <button class="ws-tab" data-tab="planning" style="padding:11px 16px;font-size:12px;font-weight:600;color:var(--t3);border:none;background:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;font-family:inherit">Planning visites</button>
        </div>
        <div id="ws-tab-content" style="padding:16px"></div>
      </div>
    </div>`;

  main.appendChild(section);

  document.getElementById("ws-invite-toggle").onclick = () => {
    const form = document.getElementById("ws-invite-form");
    const isHidden = form.style.display === "none";
    form.style.display = isHidden ? "" : "none";
    if (isHidden)
      setTimeout(() => document.getElementById("ws-pseudo-input")?.focus(), 50);
  };
  document.getElementById("ws-cancel-invite").onclick = () => {
    document.getElementById("ws-invite-form").style.display = "none";
  };
  document.getElementById("ws-send-invite-btn").onclick = _wsFixSendInvite;

  document.querySelectorAll(".ws-tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".ws-tab").forEach((t) => {
        t.style.color = "var(--t3)";
        t.style.borderBottomColor = "transparent";
        t.style.fontWeight = "600";
        t.classList.remove("active");
      });
      tab.style.color = "var(--v)";
      tab.style.borderBottomColor = "var(--v)";
      tab.style.fontWeight = "700";
      tab.classList.add("active");
      _wsRenderTab(tab.dataset.tab);
    };
  });

  loadWsMembers();
}

async function loadWsMembers() {
  const list = document.getElementById("ws-members-list");
  if (!list) return;
  try {
    const res = await fetch(`${WS_API}/members`, { headers: _authH() });
    const members = res.ok ? await res.json() : [];
    _wsRenderMembers(members);
    const actifs = members.filter((m) => m.status === "active");
    const collabBlock = document.getElementById("ws-collab-block");
    if (collabBlock)
      collabBlock.style.display = actifs.length > 0 ? "" : "none";
    if (actifs.length > 0) _wsRenderTab("projets");
  } catch {
    if (list)
      list.innerHTML = `<div style="font-size:12px;color:var(--t4);text-align:center;padding:16px">Erreur chargement des membres</div>`;
  }
}

function _wsRenderMembers(members) {
  const list = document.getElementById("ws-members-list");
  if (!list) return;
  const raw = localStorage.getItem("agent_user");
  const currentUser = raw ? JSON.parse(raw)?.username : "Vous";
  const roleLabels = {
    owner: "Propriétaire",
    collab: "Co-acheteur",
    readonly: "Lecture seule",
  };
  const badgeClass = { owner: "owner", collab: "collab", readonly: "readonly" };
  const allMembers = [
    { username: currentUser, role: "owner", status: "active" },
    ...members,
  ];

  list.innerHTML = allMembers
    .map((m, i) => {
      const displayRole =
        m.status === "pending" ? "En attente" : roleLabels[m.role] || m.role;
      const bClass =
        m.status === "pending" ? "pending" : badgeClass[m.role] || "readonly";
      return `<div class="workspace-member-item">
      <div class="member-avatar-ring">${(m.username || "?")[0].toUpperCase()}</div>
      <div class="member-info">
        <div class="member-name">${m.username}</div>
        ${m.status === "pending" ? `<div class="member-sub">En attente d'acceptation</div>` : ""}
      </div>
      <span class="member-role-badge ${bClass}">${displayRole}</span>
      ${
        i > 0
          ? `<button class="ws-remove-btn" data-username="${m.username}" style="background:transparent;border:1px solid var(--border);color:var(--t4);border-radius:var(--r4);padding:3px 6px;cursor:pointer;display:flex;align-items:center;font-size:13px;transition:all .1s">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`
          : ""
      }
    </div>`;
    })
    .join("");

  list.querySelectorAll(".ws-remove-btn").forEach((btn) => {
    btn.onmouseenter = () => {
      btn.style.borderColor = "var(--err)";
      btn.style.color = "var(--err)";
      btn.style.background = "var(--err-bg)";
    };
    btn.onmouseleave = () => {
      btn.style.borderColor = "var(--border)";
      btn.style.color = "var(--t4)";
      btn.style.background = "transparent";
    };
    btn.onclick = async () => {
      const uname = btn.dataset.username;
      if (!confirm(`Retirer ${uname} de l'espace de travail ?`)) return;
      try {
        await fetch(`${WS_API}/members/${encodeURIComponent(uname)}`, {
          method: "DELETE",
          headers: _authH(),
        });
        loadWsMembers();
      } catch {}
    };
  });
}

async function _wsRenderTab(tab) {
  const content = document.getElementById("ws-tab-content");
  if (!content) return;
  content.innerHTML = `<div style="text-align:center;padding:24px;color:var(--t4);font-size:12px">Chargement…</div>`;
  switch (tab) {
    case "projets":
      await _wsTabProjets(content);
      break;
    case "documents":
      await _wsTabDocuments(content);
      break;
    case "notes":
      await _wsTabNotes(content);
      break;
    case "criteres":
      await _wsTabCriteres(content);
      break;
    case "planning":
      await _wsTabPlanning(content);
      break;
  }
}

// ── TAB PROJETS ──────────────────────────────────────────────────────

async function _wsTabProjets(content) {
  let myProjects = [];
  let sharedData = [];
  try {
    const [projRes, sharedRes] = await Promise.all([
      fetch(`${API}/api/projects`, { headers: _authH() }),
      _wsGet("projets"),
    ]);
    if (projRes.ok) myProjects = await projRes.json();
    sharedData = sharedRes;
  } catch {}

  const sharedKeys = sharedData.map((d) => d.key);

  content.innerHTML = `
    <div style="margin-bottom:4px">
      <p style="font-size:12px;color:var(--t2);margin-bottom:14px;line-height:1.6">Partagez vos projets de recherche avec votre équipe. Les projets partagés sont visibles par tous les membres.</p>
      ${
        myProjects.length === 0
          ? `<div style="text-align:center;padding:28px;color:var(--t4);font-size:12px;border:1px dashed var(--border);border-radius:var(--r8)">Aucun projet — créez-en un depuis la section "Mes projets"</div>`
          : `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
            <div style="font-size:10.5px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Mes projets</div>
            ${myProjects
              .map((p) => {
                const isShared = sharedKeys.includes(`proj_${p.id}`);
                return `<div style="display:flex;align-items:center;gap:10px;padding:11px 13px;background:var(--bg-surface);border:1px solid ${isShared ? "var(--v)" : "var(--border)"};border-radius:var(--r8);transition:all .15s">
                <span style="width:10px;height:10px;border-radius:50%;background:${p.color || "#8b5cf6"};flex-shrink:0"></span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
                  <div style="font-size:10.5px;color:var(--t4)">${p.chat_count || 0} conversation(s)</div>
                </div>
                ${isShared ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--r99);background:var(--v-soft);color:var(--v);border:1px solid rgba(109,40,217,.15)">Partagé</span>` : ""}
                <button class="btn-${isShared ? "secondary" : "primary"} ws-share-project-btn" data-id="${p.id}" data-name="${p.name}" data-shared="${isShared}" style="height:27px;font-size:11px;padding:0 10px;flex-shrink:0">
                  ${isShared ? "Retirer" : "Partager"}
                </button>
              </div>`;
              })
              .join("")}
          </div>`
      }

      <div id="ws-received-projects-section">
        <div style="font-size:10.5px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;padding-top:${myProjects.length ? "12px" : "0"};border-top:${myProjects.length ? "1px solid var(--border)" : "none"}">Partagés par l'équipe</div>
        <div id="ws-received-projects-list" style="font-size:12px;color:var(--t4);font-style:italic">Chargement…</div>
      </div>
    </div>`;

  content.querySelectorAll(".ws-share-project-btn").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const wasShared = btn.dataset.shared === "true";
      if (wasShared) {
        await _wsDel("projets", `proj_${id}`);
        showBoostToast(`"${name}" retiré du partage`, "info");
      } else {
        const projDetail = myProjects.find((p) => String(p.id) === String(id));
        await _wsSet("projets", `proj_${id}`, {
          id,
          name,
          description: projDetail?.description || "",
          color: projDetail?.color || "#8b5cf6",
          chat_count: projDetail?.chat_count || 0,
          sharedAt: new Date().toISOString(),
        });
        showBoostToast(`"${name}" partagé avec l'équipe`, "success");
      }
      await _wsTabProjets(content);
    };
  });

  // Projets reçus
  const receivedList = document.getElementById("ws-received-projects-list");
  if (receivedList) {
    const raw = localStorage.getItem("agent_user");
    const currentUsername = raw ? JSON.parse(raw)?.username : "";
    const received = sharedData.filter((d) => d.created_by && d.value?.name);
    const otherProjects = received.filter((d) => {
      const ownedIds = myProjects.map((p) => `proj_${p.id}`);
      return !ownedIds.includes(d.key);
    });
    if (otherProjects.length === 0) {
      receivedList.innerHTML = `<div style="font-size:12px;color:var(--t4);font-style:italic;padding:12px 0">Aucun projet partagé par vos collaborateurs pour l'instant.</div>`;
    } else {
      receivedList.innerHTML = otherProjects
        .map((d) => {
          const p = d.value;
          return `<div style="display:flex;align-items:center;gap:10px;padding:11px 13px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8)">
          <span style="width:10px;height:10px;border-radius:50%;background:${p.color || "#8b5cf6"};flex-shrink:0"></span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;color:var(--t1)">${p.name}</div>
            <div style="font-size:10.5px;color:var(--t4)">${p.chat_count || 0} conversation(s) · Partagé le ${new Date(p.sharedAt).toLocaleDateString("fr-FR")}</div>
          </div>
          <span style="font-size:10px;color:var(--t4)">reçu</span>
        </div>`;
        })
        .join("");
    }
  }
}

// ── TAB DOCUMENTS ────────────────────────────────────────────────────

async function _wsTabDocuments(content) {
  const docs = await _wsGet("documents");

  function renderDocs(documents) {
    const EXT_ICON = (name) => {
      const ext = (name || "").split(".").pop().toLowerCase();
      const colors = {
        pdf: "#ef4444",
        doc: "#3b82f6",
        docx: "#3b82f6",
        xls: "#22c55e",
        xlsx: "#22c55e",
        png: "#a855f7",
        jpg: "#a855f7",
        jpeg: "#a855f7",
      };
      const color = colors[ext] || "#64748b";
      return `<svg width="28" height="34" viewBox="0 0 28 34" fill="none"><rect width="28" height="34" rx="4" fill="${color}" fill-opacity=".12"/><rect x="0.5" y="0.5" width="27" height="33" rx="3.5" stroke="${color}" stroke-opacity=".3"/><text x="14" y="22" text-anchor="middle" font-size="9" font-weight="700" fill="${color}" font-family="system-ui,sans-serif">${ext.toUpperCase().slice(0, 4)}</text></svg>`;
    };
    const fmtSize = (s) =>
      s
        ? s > 1048576
          ? `${(s / 1048576).toFixed(1)} Mo`
          : `${Math.round(s / 1024)} Ko`
        : "";

    content.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <p style="font-size:12px;color:var(--t2)">Partagez des documents avec votre équipe : diagnostics, devis, plans, compromis…</p>
          <label class="btn-primary" style="height:30px;font-size:11px;padding:0 12px;display:inline-flex;align-items:center;gap:5px;cursor:pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ajouter
            <input type="file" id="ws-doc-upload" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" multiple/>
          </label>
        </div>

        ${
          documents.length === 0
            ? `<div style="text-align:center;padding:32px;border:1px dashed var(--border);border-radius:var(--r8);color:var(--t4)">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 8px;display:block;opacity:.4"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div style="font-size:12px;font-style:italic">Aucun document partagé. Ajoutez des fichiers pour les rendre accessibles à votre équipe.</div>
            </div>`
            : `<div style="display:flex;flex-direction:column;gap:8px">
              ${documents
                .map((d) => {
                  const doc = d.value;
                  return `<div style="display:flex;align-items:center;gap:11px;padding:11px 13px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8)">
                  <div style="flex-shrink:0">${EXT_ICON(doc.name)}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${doc.name}</div>
                    <div style="font-size:10.5px;color:var(--t4)">${fmtSize(doc.size)} · Ajouté par ${doc.uploadedBy} · ${new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}</div>
                  </div>
                  <a href="${doc.url}" target="_blank" style="height:27px;padding:0 10px;border-radius:var(--r6);font-size:11px;font-weight:600;color:var(--v);background:var(--v-soft);border:1px solid rgba(109,40,217,.15);display:inline-flex;align-items:center;gap:4px;text-decoration:none;white-space:nowrap">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Ouvrir
                  </a>
                  <button class="ws-doc-del" data-key="${d.key}" style="background:transparent;border:none;cursor:pointer;color:var(--t4);padding:4px">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                  </button>
                </div>`;
                })
                .join("")}
            </div>`
        }
        <div id="ws-doc-upload-progress" style="margin-top:10px"></div>
      </div>`;

    document
      .getElementById("ws-doc-upload")
      ?.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const progress = document.getElementById("ws-doc-upload-progress");
        if (progress)
          progress.innerHTML = `<div style="font-size:11px;color:var(--t4)">Envoi en cours…</div>`;

        const formData = new FormData();
        files.forEach((f) => formData.append("files", f));

        try {
          const res = await fetch(`${API}/api/upload-files`, {
            method: "POST",
            headers: _authH(),
            body: formData,
          });
          if (!res.ok) throw new Error();
          const data = await res.json();
          for (const f of data.files) {
            await fetch(`${WS_API}/upload`, {
              method: "POST",
              headers: { ..._authH(), "Content-Type": "application/json" },
              body: JSON.stringify({
                name: f.name,
                url: f.url,
                size: f.size,
                fileType: f.name.split(".").pop(),
              }),
            });
          }
          showBoostToast(
            `${data.files.length} document(s) partagé(s) avec l'équipe`,
            "success",
          );
          const newDocs = await _wsGet("documents");
          renderDocs(newDocs);
        } catch {
          showBoostToast("Erreur lors de l'envoi", "error");
          if (progress) progress.innerHTML = "";
        }
      });

    content.querySelectorAll(".ws-doc-del").forEach((btn) => {
      btn.onclick = async () => {
        await _wsDel("documents", btn.dataset.key);
        const newDocs = await _wsGet("documents");
        renderDocs(newDocs);
      };
    });
  }

  renderDocs(docs);
}

// ── TAB NOTES ────────────────────────────────────────────────────────

async function _wsTabNotes(content) {
  async function renderNotes() {
    const notes = await _wsGet("notes");

    const TAG_COLORS = {
      info: "#6366f1",
      decision: "#059669",
      attention: "#d97706",
      visite: "#8b5cf6",
      budget: "#0ea5e9",
    };
    const TAG_LABELS = {
      info: "Info",
      decision: "Décision",
      attention: "Attention",
      visite: "Visite",
      budget: "Budget",
    };
    const TAG_ICONS = {
      info: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      decision: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      attention: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>`,
      visite: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>`,
      budget: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
    };

    content.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <p style="font-size:12px;color:var(--t2)">Notes communes visibles par toute l'équipe en temps réel</p>
          <button class="btn-primary" id="ws-add-note-btn" style="height:30px;font-size:11px;padding:0 12px">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nouvelle note
          </button>
        </div>

        <div id="ws-note-form" style="display:none;margin-bottom:14px;padding:13px;background:var(--bg-surface);border:1px dashed var(--border-mid);border-radius:var(--r8)">
          <input type="text" id="ws-note-title" class="field-input" placeholder="Titre de la note…" style="margin-bottom:8px"/>
          <textarea id="ws-note-body" class="field-input textarea" rows="3" placeholder="Contenu, décision, information importante…" style="margin-bottom:8px;resize:vertical"></textarea>
          <div style="display:flex;gap:7px;align-items:center">
            <select id="ws-note-tag" class="field-select" style="flex:1;height:34px">
              <option value="info">Info</option>
              <option value="decision">Décision</option>
              <option value="attention">Point d'attention</option>
              <option value="visite">Visite</option>
              <option value="budget">Budget</option>
            </select>
            <button class="btn-secondary" id="ws-note-cancel" style="height:34px;padding:0 10px">Annuler</button>
            <button class="btn-primary" id="ws-note-save" style="height:34px;padding:0 12px">Enregistrer</button>
          </div>
        </div>

        <div id="ws-notes-list">
          ${
            notes.length === 0
              ? `<div style="text-align:center;padding:32px;border:1px dashed var(--border);border-radius:var(--r8);color:var(--t4)">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 8px;display:block;opacity:.4"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <div style="font-size:12px;font-style:italic">Aucune note. Ajoutez des informations importantes pour votre équipe.</div>
              </div>`
              : notes
                  .map((n) => {
                    const note = n.value;
                    const color = TAG_COLORS[note.tag] || "#6366f1";
                    return `<div style="padding:12px 14px;background:var(--bg-surface);border:1px solid var(--border);border-left:3px solid ${color};border-radius:var(--r8);margin-bottom:8px">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
                    <div>
                      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;border-radius:var(--r99);background:${color}18;color:${color};border:1px solid ${color}33;margin-bottom:5px">
                        <span style="color:${color}">${TAG_ICONS[note.tag] || ""}</span>
                        ${TAG_LABELS[note.tag] || "Info"}
                      </span>
                      <div style="font-size:13px;font-weight:700;color:var(--t1)">${note.title}</div>
                    </div>
                    <button data-key="${n.key}" class="ws-note-del" style="background:transparent;border:none;cursor:pointer;color:var(--t4);font-size:18px;line-height:1;padding:2px;flex-shrink:0">×</button>
                  </div>
                  <div style="font-size:12px;color:var(--t2);line-height:1.6;white-space:pre-wrap">${note.body}</div>
                  <div style="font-size:10px;color:var(--t4);margin-top:6px">${note.author} · ${note.date}</div>
                </div>`;
                  })
                  .join("")
          }
        </div>
      </div>`;

    document.getElementById("ws-add-note-btn").onclick = () => {
      const form = document.getElementById("ws-note-form");
      form.style.display = form.style.display === "none" ? "" : "none";
      if (form.style.display !== "none")
        setTimeout(() => document.getElementById("ws-note-title")?.focus(), 50);
    };
    document.getElementById("ws-note-cancel").onclick = () => {
      document.getElementById("ws-note-form").style.display = "none";
    };
    document.getElementById("ws-note-save").onclick = async () => {
      const title = document.getElementById("ws-note-title").value.trim();
      const body = document.getElementById("ws-note-body").value.trim();
      const tag = document.getElementById("ws-note-tag").value;
      if (!title) {
        showBoostToast("Titre requis", "error");
        return;
      }
      const raw = localStorage.getItem("agent_user");
      const username = raw ? JSON.parse(raw)?.username : "Vous";
      const key = `note_${Date.now()}`;
      await _wsSet("notes", key, {
        title,
        body,
        tag,
        author: username,
        date: new Date().toLocaleDateString("fr-FR"),
      });
      showBoostToast("Note partagée avec l'équipe", "success");
      renderNotes();
    };
    content.querySelectorAll(".ws-note-del").forEach((btn) => {
      btn.onclick = async () => {
        await _wsDel("notes", btn.dataset.key);
        renderNotes();
      };
    });
  }
  await renderNotes();
}

// ── TAB CRITÈRES ─────────────────────────────────────────────────────

async function _wsTabCriteres(content) {
  const existing = await _wsGet("criteres");
  const saved = existing.length > 0 ? existing[0].value : {};

  content.innerHTML = `
    <div>
      <p style="font-size:12px;color:var(--t2);margin-bottom:14px;line-height:1.6">Verrouillez les critères validés par l'équipe. Visibles et modifiables par tous les membres.</p>
      <div class="field-stack">
        <div class="field-row">
          <div class="field-group">
            <label class="field-label">Ville cible</label>
            <input type="text" id="ws-crit-ville" class="field-input" placeholder="Paris, Lyon…" value="${saved.ville || ""}"/>
          </div>
          <div class="field-group">
            <label class="field-label">Type de bien</label>
            <select id="ws-crit-type" class="field-select">
              <option value="appartement" ${saved.type === "appartement" ? "selected" : ""}>Appartement</option>
              <option value="maison" ${saved.type === "maison" ? "selected" : ""}>Maison</option>
              <option value="studio" ${saved.type === "studio" ? "selected" : ""}>Studio</option>
              <option value="loft" ${saved.type === "loft" ? "selected" : ""}>Loft</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field-group">
            <label class="field-label">Budget max (€)</label>
            <input type="number" id="ws-crit-budget" class="field-input" placeholder="350 000" value="${saved.budget || ""}"/>
          </div>
          <div class="field-group">
            <label class="field-label">Surface min (m²)</label>
            <input type="number" id="ws-crit-surface" class="field-input" placeholder="50" value="${saved.surface || ""}"/>
          </div>
        </div>
        <div class="field-row">
          <div class="field-group">
            <label class="field-label">Pièces min</label>
            <input type="number" id="ws-crit-pieces" class="field-input" placeholder="3" value="${saved.pieces || ""}"/>
          </div>
          <div class="field-group">
            <label class="field-label">DPE max accepté</label>
            <select id="ws-crit-dpe" class="field-select">
              <option value="">Indifférent</option>
              ${["A", "B", "C", "D", "E", "F", "G"].map((l) => `<option value="${l}" ${saved.dpe === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">Proximités indispensables</label>
          <input type="text" id="ws-crit-proximites" class="field-input" placeholder="Métro, école, commerces…" value="${(saved.proximites || []).join(", ")}"/>
        </div>
        <div class="field-group">
          <label class="field-label">État du bien</label>
          <select id="ws-crit-etat" class="field-select">
            <option value="">Indifférent</option>
            <option value="neuf" ${saved.etat === "neuf" ? "selected" : ""}>Neuf</option>
            <option value="bon" ${saved.etat === "bon" ? "selected" : ""}>Bon état</option>
            <option value="rafraichir" ${saved.etat === "rafraichir" ? "selected" : ""}>À rafraîchir</option>
            <option value="travaux" ${saved.etat === "travaux" ? "selected" : ""}>Avec travaux</option>
          </select>
        </div>
      </div>
      <div class="block-footer-actions" style="margin-top:14px">
        <button class="btn-primary" id="ws-crit-save">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Valider et partager
        </button>
      </div>
      ${
        saved.ville
          ? `
        <div style="margin-top:16px;padding:12px 14px;background:var(--ok-bg);border:1px solid rgba(5,150,105,.18);border-radius:var(--r8)">
          <div style="font-size:11px;font-weight:700;color:var(--ok);margin-bottom:7px;display:flex;align-items:center;gap:5px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Critères validés par l'équipe
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;font-size:11.5px;color:var(--t2)">
            ${saved.ville ? `<div><span style="color:var(--t4)">Ville</span> ${saved.ville}</div>` : ""}
            ${saved.type ? `<div><span style="color:var(--t4)">Type</span> ${saved.type}</div>` : ""}
            ${saved.budget ? `<div><span style="color:var(--t4)">Budget</span> ${Number(saved.budget).toLocaleString("fr-FR")} €</div>` : ""}
            ${saved.surface ? `<div><span style="color:var(--t4)">Surface</span> ${saved.surface} m² min</div>` : ""}
            ${saved.pieces ? `<div><span style="color:var(--t4)">Pièces</span> ${saved.pieces} min</div>` : ""}
            ${saved.dpe ? `<div><span style="color:var(--t4)">DPE max</span> ${saved.dpe}</div>` : ""}
            ${saved.etat ? `<div><span style="color:var(--t4)">État</span> ${saved.etat}</div>` : ""}
            ${saved.proximites?.length ? `<div style="grid-column:span 2"><span style="color:var(--t4)">Proximités</span> ${saved.proximites.join(", ")}</div>` : ""}
          </div>
        </div>`
          : ""
      }
    </div>`;

  document.getElementById("ws-crit-save").onclick = async () => {
    const data = {
      ville: document.getElementById("ws-crit-ville").value.trim(),
      type: document.getElementById("ws-crit-type").value,
      budget: document.getElementById("ws-crit-budget").value,
      surface: document.getElementById("ws-crit-surface").value,
      pieces: document.getElementById("ws-crit-pieces").value,
      dpe: document.getElementById("ws-crit-dpe").value,
      etat: document.getElementById("ws-crit-etat").value,
      proximites: document
        .getElementById("ws-crit-proximites")
        .value.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    await _wsSet("criteres", "criteres_communs", data);
    showBoostToast("Critères partagés avec l'équipe", "success");
    await _wsTabCriteres(content);
  };
}

// ── TAB PLANNING VISITES ─────────────────────────────────────────────

async function _wsTabPlanning(content) {
  async function renderPlanning() {
    const visits = await _wsGet("planning");

    const STATUS_COLORS = {
      confirme: "#059669",
      propose: "#d97706",
      annule: "#dc2626",
    };
    const STATUS_LABELS = {
      confirme: "Confirmée",
      propose: "Proposée",
      annule: "Annulée",
    };
    const STATUS_ICONS = {
      confirme: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      propose: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      annule: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    };

    content.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <p style="font-size:12px;color:var(--t2)">Planifiez et coordonnez vos visites avec votre équipe</p>
          <button class="btn-primary" id="ws-visit-add-btn" style="height:30px;font-size:11px;padding:0 12px">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Planifier une visite
          </button>
        </div>

        <div id="ws-visit-form" style="display:none;margin-bottom:14px;padding:13px;background:var(--bg-surface);border:1px dashed var(--border-mid);border-radius:var(--r8)">
          <div class="field-stack">
            <div class="field-group">
              <label class="field-label">Adresse du bien <span style="color:#f472b6">*</span></label>
              <input type="text" id="ws-visit-address" class="field-input" placeholder="12 rue des Lilas, Paris 75011…"/>
            </div>
            <div class="field-row">
              <div class="field-group">
                <label class="field-label">Date <span style="color:#f472b6">*</span></label>
                <input type="date" id="ws-visit-date" class="field-input"/>
              </div>
              <div class="field-group">
                <label class="field-label">Heure</label>
                <input type="time" id="ws-visit-time" class="field-input" value="10:00"/>
              </div>
            </div>
            <div class="field-row">
              <div class="field-group">
                <label class="field-label">Statut</label>
                <select id="ws-visit-status" class="field-select">
                  <option value="propose">Proposée</option>
                  <option value="confirme">Confirmée</option>
                </select>
              </div>
              <div class="field-group">
                <label class="field-label">Contact agence</label>
                <input type="text" id="ws-visit-contact" class="field-input" placeholder="Agent, tél…"/>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">Notes</label>
              <input type="text" id="ws-visit-notes" class="field-input" placeholder="Points à vérifier, questions…"/>
            </div>
          </div>
          <div style="display:flex;gap:7px;margin-top:12px">
            <button class="btn-secondary" id="ws-visit-cancel" style="flex:1">Annuler</button>
            <button class="btn-primary" id="ws-visit-save" style="flex:1">Ajouter à l'agenda équipe</button>
          </div>
        </div>

        ${
          visits.length === 0
            ? `<div style="text-align:center;padding:32px;border:1px dashed var(--border);border-radius:var(--r8);color:var(--t4)">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 8px;display:block;opacity:.4"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <div style="font-size:12px;font-style:italic">Aucune visite planifiée. Ajoutez des visites pour les coordonner avec votre équipe.</div>
            </div>`
            : visits
                .sort((a, b) =>
                  (a.value.date || "") > (b.value.date || "") ? 1 : -1,
                )
                .map((v) => {
                  const visit = v.value;
                  const color = STATUS_COLORS[visit.status] || "#d97706";
                  return `<div style="display:flex;gap:12px;padding:13px;background:var(--bg-surface);border:1px solid var(--border);border-left:3px solid ${color};border-radius:var(--r8);margin-bottom:8px">
                <div style="flex-shrink:0;padding-top:2px">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px">
                    <div style="font-size:12px;font-weight:700;color:var(--t1)">${visit.address}</div>
                    <div style="display:flex;align-items:center;gap:6px">
                      <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:var(--r99);background:${color}18;color:${color};border:1px solid ${color}33;white-space:nowrap">
                        ${STATUS_ICONS[visit.status] || ""}${STATUS_LABELS[visit.status] || "Proposée"}
                      </span>
                      <button data-key="${v.key}" class="ws-visit-del" style="background:transparent;border:none;cursor:pointer;color:var(--t4);padding:2px">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                  <div style="font-size:11px;color:var(--t3)">${visit.date ? new Date(visit.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "—"}${visit.time ? " à " + visit.time : ""}</div>
                  ${visit.contact ? `<div style="font-size:11px;color:var(--t4);margin-top:2px">${visit.contact}</div>` : ""}
                  ${visit.notes ? `<div style="font-size:11px;color:var(--t2);margin-top:4px;padding:6px 8px;background:var(--bg-inset);border-radius:var(--r4)">${visit.notes}</div>` : ""}
                  <div style="font-size:10px;color:var(--t4);margin-top:5px">Ajouté par ${visit.addedBy}</div>
                </div>
              </div>`;
                })
                .join("")
        }
      </div>`;

    document.getElementById("ws-visit-add-btn").onclick = () => {
      const form = document.getElementById("ws-visit-form");
      form.style.display = form.style.display === "none" ? "" : "none";
      if (form.style.display !== "none")
        setTimeout(
          () => document.getElementById("ws-visit-address")?.focus(),
          50,
        );
    };
    document.getElementById("ws-visit-cancel").onclick = () => {
      document.getElementById("ws-visit-form").style.display = "none";
    };
    document.getElementById("ws-visit-save").onclick = async () => {
      const address = document.getElementById("ws-visit-address").value.trim();
      const date = document.getElementById("ws-visit-date").value;
      if (!address || !date) {
        showBoostToast("Adresse et date requises", "error");
        return;
      }
      const raw = localStorage.getItem("agent_user");
      const username = raw ? JSON.parse(raw)?.username : "Vous";
      await _wsSet("planning", `visit_${Date.now()}`, {
        address,
        date,
        time: document.getElementById("ws-visit-time").value,
        status: document.getElementById("ws-visit-status").value,
        contact: document.getElementById("ws-visit-contact").value.trim(),
        notes: document.getElementById("ws-visit-notes").value.trim(),
        addedBy: username,
        addedAt: new Date().toISOString(),
      });
      showBoostToast("Visite ajoutée à l'agenda équipe", "success");
      renderPlanning();
    };
    content.querySelectorAll(".ws-visit-del").forEach((btn) => {
      btn.onclick = async () => {
        await _wsDel("planning", btn.dataset.key);
        renderPlanning();
      };
    });
  }
  await renderPlanning();
}

// ── ENVOI INVITATION ─────────────────────────────────────────────────

async function _wsFixSendInvite() {
  const pseudo = document.getElementById("ws-pseudo-input")?.value.trim();
  const email = document.getElementById("ws-email-input")?.value.trim();
  const role = document.getElementById("ws-role-select")?.value;
  const resultEl = document.getElementById("ws-invite-result");
  const btn = document.getElementById("ws-send-invite-btn");

  if (!pseudo) {
    showBoostToast("Pseudo requis", "error");
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showBoostToast("Adresse e-mail invalide", "error");
    return;
  }

  btn.textContent = "Vérification…";
  btn.disabled = true;

  try {
    const res = await fetch(`${WS_API}/invite`, {
      method: "POST",
      headers: { ..._authH(), "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUsername: pseudo,
        targetEmail: email,
        role,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      showBoostToast(
        data.error || "Utilisateur introuvable ou e-mail ne correspond pas",
        "error",
      );
      btn.disabled = false;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer l'invitation`;
      return;
    }

    if (resultEl)
      resultEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:7px;padding:8px 10px;background:var(--ok-bg);border:1px solid rgba(5,150,105,.18);border-radius:var(--r6);font-size:11.5px;font-weight:600;color:var(--ok)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Invitation envoyée à <strong>${pseudo}</strong>
      </div>`;

    setTimeout(() => {
      document.getElementById("ws-invite-form").style.display = "none";
      document.getElementById("ws-pseudo-input").value = "";
      document.getElementById("ws-email-input").value = "";
      if (resultEl) resultEl.innerHTML = "";
      loadWsMembers();
    }, 3000);

    btn.disabled = false;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer l'invitation`;
  } catch {
    showBoostToast("Erreur serveur", "error");
    btn.disabled = false;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer l'invitation`;
  }
}

// ══════════════════════════════════════════════════════════════════════
// 8. 2FA — codes de récupération en DB
// ══════════════════════════════════════════════════════════════════════

function init2FA() {
  const securitySection = document.getElementById("section-security");
  if (!securitySection) return;

  const twoFABlock = document.createElement("div");
  twoFABlock.className = "settings-block";
  twoFABlock.innerHTML = `
    <div class="block-header">
      <div class="block-header-left">
        <span class="block-icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
        <div><h3>Authentification à deux facteurs</h3><p>Sécurisez votre compte avec une App Authenticator</p></div>
      </div>
    </div>
    <div class="block-body" id="tfa-body">
      <div class="tfa-status-row">
        <div class="tfa-dot" id="tfa-dot"></div>
        <div>
          <div class="tfa-status-label" id="tfa-status-label">2FA désactivé</div>
          <div class="tfa-status-sub" id="tfa-status-sub">Votre compte n'est protégé que par votre mot de passe</div>
        </div>
      </div>
      <div id="tfa-setup-zone"></div>
      <div class="block-footer-actions">
        <button class="btn-primary" id="btn-enable2fa">Activer la 2FA</button>
        <button class="btn-ghost-destructive" id="btn-disable2fa" style="display:none">Désactiver</button>
      </div>
    </div>`;

  const blocks = securitySection.querySelectorAll(".settings-block");
  if (blocks.length >= 2) blocks[1].after(twoFABlock);
  else securitySection.appendChild(twoFABlock);

  fetch(`${API}/api/2fa/status`, { headers: _authH() })
    .then((r) => r.json())
    .then((d) => apply2FAState(d.enabled))
    .catch(() =>
      apply2FAState(localStorage.getItem("aigent_2fa_enabled") === "true"),
    );

  document.getElementById("btn-enable2fa").onclick = start2FASetup;
  document.getElementById("btn-disable2fa").onclick = disable2FA;
}

function apply2FAState(enabled) {
  const dot = document.getElementById("tfa-dot");
  const label = document.getElementById("tfa-status-label");
  const sub = document.getElementById("tfa-status-sub");
  const btnEnable = document.getElementById("btn-enable2fa");
  const btnDisable = document.getElementById("btn-disable2fa");
  if (!dot) return;
  if (enabled) {
    dot.classList.add("active");
    label.textContent = "2FA activé";
    sub.textContent = "Votre compte est protégé par une App Authenticator";
    if (btnEnable) btnEnable.style.display = "none";
    if (btnDisable) btnDisable.style.display = "";
    localStorage.setItem("aigent_2fa_enabled", "true");
  } else {
    dot.classList.remove("active");
    label.textContent = "2FA désactivé";
    sub.textContent = "Votre compte n'est protégé que par votre mot de passe";
    if (btnEnable) btnEnable.style.display = "";
    if (btnDisable) btnDisable.style.display = "none";
    localStorage.removeItem("aigent_2fa_enabled");
  }
}

function generateTOTPSecret() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  for (let i = 0; i < 32; i++)
    secret += chars[Math.floor(Math.random() * chars.length)];
  return secret;
}

function start2FASetup() {
  const zone = document.getElementById("tfa-setup-zone");
  if (!zone) return;
  const secret = generateTOTPSecret();
  localStorage.setItem("aigent_2fa_secret_pending", secret);
  const issuer = "AiGENT";
  const account = _boostUser?.username || "user";
  const otpUri = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

  zone.innerHTML = `
    <div class="tfa-steps">
      <div class="tfa-step active-step">
        <div class="tfa-step-num">1</div>
        <div class="tfa-step-content">
          <div class="tfa-step-title">Installez une App Authenticator</div>
          <div class="tfa-step-desc">Google Authenticator, Authy, Microsoft Authenticator ou toute app TOTP compatible.</div>
        </div>
      </div>
      <div class="tfa-step active-step">
        <div class="tfa-step-num">2</div>
        <div class="tfa-step-content">
          <div class="tfa-step-title">Scannez le QR Code ou entrez la clé manuellement</div>
          <div class="qr-wrap">
            <canvas id="tfa-qr-canvas" width="128" height="128"></canvas>
            <div class="qr-info">
              <div style="font-size:11px;color:var(--t3);margin-bottom:4px">Clé manuelle :</div>
              <code class="qr-secret-field">${secret}</code>
              <button class="btn-secondary" style="margin-top:7px;height:28px;font-size:11px;padding:0 9px" onclick="navigator.clipboard.writeText('${secret}').then(()=>this.textContent='Copié !')">Copier la clé</button>
            </div>
          </div>
        </div>
      </div>
      <div class="tfa-step active-step">
        <div class="tfa-step-num">3</div>
        <div class="tfa-step-content">
          <div class="tfa-step-title">Entrez le code à 6 chiffres affiché par l'app</div>
          <div class="tfa-code-row">
            <input type="text" class="tfa-code-input" id="tfa-verify-code" maxlength="6" placeholder="000000" inputmode="numeric"/>
            <button class="btn-primary" id="tfa-verify-btn" style="height:42px;padding:0 16px">Vérifier</button>
          </div>
          <div id="tfa-verify-error" style="font-size:11px;color:var(--err);margin-top:5px;display:none">Code incorrect. Vérifiez votre app et réessayez.</div>
        </div>
      </div>
    </div>`;

  const canvas = document.getElementById("tfa-qr-canvas");
  if (canvas) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(otpUri)}`;
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 128, 128);
    };
    img.onerror = () => {
      canvas.style.display = "none";
    };
  }

  document.getElementById("tfa-verify-btn").onclick = () =>
    verify2FACode(secret);
  document
    .getElementById("tfa-verify-code")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") verify2FACode(secret);
    });
}

async function verify2FACode(secret) {
  const code = document.getElementById("tfa-verify-code")?.value.trim();
  const errEl = document.getElementById("tfa-verify-error");
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    if (errEl) errEl.style.display = "";
    return;
  }

  const btn = document.getElementById("tfa-verify-btn");
  btn.textContent = "Vérification…";
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/2fa/enable`, {
      method: "POST",
      headers: { ..._authH(), "Content-Type": "application/json" },
      body: JSON.stringify({ secret, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (errEl) errEl.style.display = "";
      btn.textContent = "Vérifier";
      btn.disabled = false;
      return;
    }

    const backupCodes = data.backupCodes || [];
    const zone = document.getElementById("tfa-setup-zone");
    zone.innerHTML = `
      <div style="padding:12px;background:var(--ok-bg);border:1px solid rgba(5,150,105,.18);border-radius:var(--r8);margin-bottom:10px">
        <div style="font-size:12px;font-weight:700;color:var(--ok);margin-bottom:4px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          2FA configuré avec succès
        </div>
        <div style="font-size:11px;color:var(--ok);opacity:.85">Votre compte est maintenant protégé par votre App Authenticator.</div>
      </div>
      <div style="margin-top:10px">
        <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:6px">Codes de récupération — conservez-les en lieu sûr</div>
        <div class="tfa-backup-codes">${backupCodes.map((c) => `<div class="tfa-backup-code">${c}</div>`).join("")}</div>
        <div style="font-size:10.5px;color:var(--t4);margin-top:7px">Utilisables depuis la page de connexion si vous perdez votre téléphone. Chaque code n'est valide qu'une seule fois.</div>
        <button class="btn-secondary" style="margin-top:10px;font-size:11px" onclick="const codes=this.parentElement.querySelectorAll('.tfa-backup-code');const text=[...codes].map(c=>c.textContent).join('\\n');navigator.clipboard.writeText(text).then(()=>this.textContent='Copié !');">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copier tous les codes
        </button>
      </div>`;
    apply2FAState(true);
  } catch {
    if (errEl) errEl.style.display = "";
    btn.textContent = "Vérifier";
    btn.disabled = false;
  }
}

async function disable2FA() {
  if (
    !confirm(
      "Désactiver la 2FA réduit la sécurité de votre compte. Continuer ?",
    )
  )
    return;
  try {
    await fetch(`${API}/api/2fa/disable`, {
      method: "POST",
      headers: _authH(),
    });
  } catch {}
  const zone = document.getElementById("tfa-setup-zone");
  if (zone) zone.innerHTML = "";
  apply2FAState(false);
}

// ══════════════════════════════════════════════════════════════════════
// 9. INTÉGRATIONS — VRAIES CARDS OUTILS EXTERNES (BUG 2 fixé)
// Version corrections-profil.js : cards Google Agenda, WhatsApp, etc.
// ══════════════════════════════════════════════════════════════════════

const INTEG_APPS = [
  {
    id: "google-agenda",
    name: "Google Agenda",
    desc: "Synchronise vos événements AiGENT avec Google Calendar",
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" stroke-width="1.6"/><line x1="16" y1="2" x2="16" y2="6" stroke="#4285F4" stroke-width="1.6"/><line x1="8" y1="2" x2="8" y2="6" stroke="#4285F4" stroke-width="1.6"/><line x1="3" y1="10" x2="21" y2="10" stroke="#4285F4" stroke-width="1.6"/><rect x="8" y="13" width="4" height="4" rx="0.5" fill="#EA4335"/></svg>`,
    color: "#4285F4",
    action: "google-agenda",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    desc: "Recevez vos alertes de matchs et visites sur WhatsApp",
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><circle cx="12" cy="12" r="10" fill="#25D366" fill-opacity=".12"/><path d="M17.5 14.5c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.1-.7.1l-1 1.2c-.2.2-.4.2-.6.1-1.4-.5-2.5-1.4-3.2-2.7-.2-.4 0-.6.2-.8l.6-.7c.2-.2.2-.4.1-.6l-.9-2.2c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4C7.4 8.3 7 9.2 7 10.3c0 1.1.7 2.7 2.2 4.3 1.5 1.6 3.4 2.5 5.1 2.5.9 0 1.9-.3 2.6-.9.7-.6 1.1-1.4 1.1-2.1 0-.2 0-.5-.2-.6h-.3z" fill="#25D366"/></svg>`,
    color: "#25D366",
    action: "whatsapp",
    configUI: "phone",
  },
  {
    id: "gmail",
    name: "Gmail",
    desc: "Envoyez et recevez des messages via votre Gmail",
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" fill="#EA4335" fill-opacity=".12" stroke="#EA4335" stroke-width="1.3"/><polyline points="2,6 12,13 22,6" stroke="#EA4335" stroke-width="1.3"/></svg>`,
    color: "#EA4335",
    action: "gmail",
    configUI: "email",
  },
  {
    id: "yahoo-mail",
    name: "Yahoo Mail",
    desc: "Notifications et messages via votre adresse Yahoo",
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><circle cx="12" cy="12" r="10" fill="#6001D2" fill-opacity=".1"/><text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="#6001D2" font-family="Arial,sans-serif">Y!</text></svg>`,
    color: "#6001D2",
    action: "yahoo-mail",
    configUI: "email",
  },
  {
    id: "slack",
    name: "Slack",
    desc: "Recevez les alertes AiGENT dans votre workspace Slack",
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><rect x="3" y="3" width="7" height="7" rx="2" fill="#E01E5A" fill-opacity=".15" stroke="#E01E5A" stroke-width="1.2"/><rect x="14" y="3" width="7" height="7" rx="2" fill="#36C5F0" fill-opacity=".15" stroke="#36C5F0" stroke-width="1.2"/><rect x="3" y="14" width="7" height="7" rx="2" fill="#2EB67D" fill-opacity=".15" stroke="#2EB67D" stroke-width="1.2"/><rect x="14" y="14" width="7" height="7" rx="2" fill="#ECB22E" fill-opacity=".15" stroke="#ECB22E" stroke-width="1.2"/></svg>`,
    color: "#E01E5A",
    action: "slack",
    configUI: "webhook",
  },
  {
    id: "notion",
    name: "Notion",
    desc: "Exportez vos projets et notes vers votre workspace Notion",
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" fill="#000" fill-opacity=".06" stroke="#000" stroke-width="1.3"/><line x1="8" y1="8" x2="16" y2="8" stroke="#000" stroke-width="1.2"/><line x1="8" y1="12" x2="16" y2="12" stroke="#000" stroke-width="1.2"/><line x1="8" y1="16" x2="12" y2="16" stroke="#000" stroke-width="1.2"/></svg>`,
    color: "#000000",
    action: "notion",
    configUI: "token",
  },
  {
    id: "telegram",
    name: "Telegram",
    desc: "Alertes instantanées de matchs et visites sur Telegram",
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><circle cx="12" cy="12" r="10" fill="#26A5E4" fill-opacity=".12"/><path d="M5.5 12l2.5 1 1 3 2-2.5 3 2 2.5-8.5-11 4z" stroke="#26A5E4" stroke-width="1.3" fill="#26A5E4" fill-opacity=".2"/></svg>`,
    color: "#26A5E4",
    action: "telegram",
    configUI: "chat-id",
  },
  {
    id: "apple-calendar",
    name: "Apple Calendar",
    desc: "Abonnez-vous à votre agenda AiGENT via lien iCal",
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" fill="#FF3B30" fill-opacity=".1" stroke="#FF3B30" stroke-width="1.3"/><line x1="3" y1="9" x2="21" y2="9" stroke="#FF3B30" stroke-width="1.3"/><text x="12" y="17" text-anchor="middle" font-size="7" font-weight="700" fill="#FF3B30" font-family="Arial,sans-serif">CAL</text></svg>`,
    color: "#FF3B30",
    action: "ical",
  },
];

function initIntegrations() {
  const main = document.querySelector(".settings-main");
  if (!main) return;

  const INTEGRATIONS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>`;

  const sidenav = document.getElementById("settingsSidenav");
  if (sidenav) {
    const firstGroup = sidenav.querySelector(".sidenav-group .sidenav-links");
    if (
      firstGroup &&
      !sidenav.querySelector('.sidenav-link[data-section="integrations"]')
    ) {
      const link = document.createElement("a");
      link.href = "#";
      link.className = "sidenav-link";
      link.dataset.section = "integrations";
      link.innerHTML = `${INTEGRATIONS_SVG} Intégrations`;
      firstGroup.appendChild(link);
    }
  }

  const section = document.createElement("section");
  section.className = "settings-section";
  section.id = "section-integrations";
  section.innerHTML = `
    <div class="section-title-row">
      <h2>Intégrations</h2>
      <p>Connectez votre compte AiGENT à vos applications du quotidien</p>
    </div>
    <div class="settings-block">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-icon">${INTEGRATIONS_SVG}</span>
          <div><h3>Applications connectées</h3><p>Vos outils externes synchronisés avec AiGENT</p></div>
        </div>
        <span id="integ-connected-count" style="font-size:10.5px;font-weight:700;color:var(--v);background:var(--v-badge);padding:2px 9px;border-radius:var(--r99);border:1px solid rgba(109,40,217,.12)">0 connecté(s)</span>
      </div>
      <div class="block-body" style="padding:16px">
        <div id="integ-apps-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:10px"></div>
      </div>
    </div>
    <div class="settings-block">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
          <div><h3>Export de données</h3><p>Téléchargez vos matchs et favoris en CSV</p></div>
        </div>
        <button class="btn-secondary" onclick="window._fixExportCSV&&window._fixExportCSV()" style="font-size:12px;height:30px;padding:0 12px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exporter CSV
        </button>
      </div>
      <div class="block-body">
        <p class="block-description">Exportez tous vos matchs et favoris dans un fichier CSV compatible Excel et Google Sheets.</p>
      </div>
    </div>`;
  // Bloc rapport hebdomadaire — à ajouter après le bloc export CSV dans initIntegrations
  const reportBlock = document.createElement("div");
  reportBlock.className = "settings-block";
  reportBlock.innerHTML = `
    <div class="block-header">
      <div class="block-header-left">
        <span class="block-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>
        <div><h3>Rapport hebdomadaire</h3><p>Envoyez votre rapport sur toutes vos plateformes connectées</p></div>
      </div>
      <button class="btn-primary" id="btnSendWeeklyReport" style="font-size:12px;height:30px;padding:0 12px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Envoyer maintenant
      </button>
    </div>
    <div class="block-body">
      <p class="block-description">Envoie un rapport complet (activité, matchs, critères) sur WhatsApp, Telegram, Slack et Gmail selon vos intégrations actives. Idéal pour partager votre avancement avec votre co-acheteur.</p>
    </div>`;
  section.appendChild(reportBlock);

  document
    .getElementById("btnSendWeeklyReport")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById("btnSendWeeklyReport");
      btn.textContent = "Envoi en cours…";
      btn.disabled = true;
      try {
        const res = await fetch(`${API}/api/integrations/send-weekly-report`, {
          method: "POST",
          headers: _authH(),
        });
        const data = await res.json();
        if (data.sent?.length) {
          showBoostToast(
            `Rapport envoyé sur : ${data.sent.join(", ")}`,
            "success",
          );
        } else {
          showBoostToast("Aucune intégration active pour ce rapport", "info");
        }
      } catch {
        showBoostToast("Erreur lors de l'envoi", "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer maintenant`;
      }
    });

  main.appendChild(section);
  _fixRenderIntegApps();
}

async function _fixRenderIntegApps() {
  const grid = document.getElementById("integ-apps-grid");
  if (!grid) return;

  let connected = [];
  try {
    const res = await fetch(`${API}/api/integrations`, { headers: _authH() });
    if (res.ok) {
      const data = await res.json();
      connected = data.connected || [];
    }
  } catch {}

  let prefs = {};
  try {
    const res = await fetch(`${API}/api/me/preferences`, { headers: _authH() });
    if (res.ok) prefs = await res.json();
  } catch {}

  grid.innerHTML = "";

  INTEG_APPS.forEach((app) => {
    const isConnected = connected.includes(app.id);
    const card = document.createElement("div");
    card.style.cssText = `display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px;background:var(--bg-surface);border:1px solid ${isConnected ? app.color + "44" : "var(--border)"};border-radius:var(--r10);cursor:pointer;transition:all .15s ease;position:relative${isConnected ? ";border-left-width:3px;border-left-color:" + app.color : ""}`;

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
        <div style="width:40px;height:40px;border-radius:var(--r8);background:var(--bg-panel);border:1px solid var(--border);display:flex;align-items:center;justify-content:center">${app.svg}</div>
        ${isConnected ? `<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;border-radius:var(--r99);background:${app.color}18;color:${app.color};border:1px solid ${app.color}33">Actif</span>` : ""}
      </div>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:2px">${app.name}</div>
        <div style="font-size:10.5px;color:var(--t3);line-height:1.4">${app.desc}</div>
      </div>
      <button data-app="${app.id}" class="integ-app-btn" style="width:100%;height:26px;border-radius:var(--r6);font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${isConnected ? "rgba(220,38,38,.3)" : "var(--border)"};background:${isConnected ? "var(--err-bg)" : "var(--bg-panel)"};color:${isConnected ? "var(--err)" : "var(--v)"};transition:all .12s;font-family:inherit">
        ${isConnected ? "Déconnecter" : "Connecter"}
      </button>`;

    card.onmouseenter = () => {
      card.style.borderColor = isConnected ? app.color : app.color + "66";
      card.style.boxShadow = `0 2px 8px ${app.color}22`;
    };
    card.onmouseleave = () => {
      card.style.borderColor = isConnected ? app.color + "44" : "var(--border)";
      card.style.boxShadow = "none";
    };
    card.querySelector(".integ-app-btn").onclick = (e) => {
      e.stopPropagation();
      _fixHandleIntegAction(app, isConnected, prefs);
    };
    grid.appendChild(card);
  });

  const countEl = document.getElementById("integ-connected-count");
  if (countEl) {
    const n = connected.length;
    countEl.textContent = `${n} connecté${n > 1 ? "s" : ""}`;
  }
}

async function _fixHandleIntegAction(app, isConnected, prefs) {
  if (isConnected) {
    if (!confirm(`Déconnecter ${app.name} ?`)) return;
    try {
      await fetch(`${API}/api/integrations/disconnect`, {
        method: "POST",
        headers: { ..._authH(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: app.id }),
      });
      showBoostToast(`${app.name} déconnecté`, "info");
      _fixRenderIntegApps();
    } catch {
      showBoostToast("Erreur lors de la déconnexion", "error");
    }
    return;
  }
  switch (app.action) {
    case "google-agenda":
      _fixOpenGoogleCalFlow(isConnected);
      break;
    case "whatsapp":
      _fixOpenPhoneFlow(app);
      break;
    case "gmail":
    case "yahoo-mail":
      _fixOpenEmailFlow(app);
      break;
    case "slack":
      _fixOpenWebhookFlow(app);
      break;
    case "notion":
      _fixOpenTokenFlow(app);
      break;
    case "telegram":
      _fixOpenTelegramFlow(app);
      break;
    case "ical":
      _fixOpenICalFlow(app);
      break;
    default:
      await _fixConnectApp(app.id, app.name);
  }
}

function _fixOpenGoogleCalFlow(isConnected) {
  if (isConnected) {
    _fixShowModal({
      icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      title: "Synchroniser un événement",
      body: `<p style="font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:8px">Google Agenda est connecté. Les événements créés dans votre Agenda AiGENT sont synchronisés automatiquement lors de leur création.</p>
             <p style="font-size:12px;color:var(--t2)">Pour forcer la synchronisation de vos événements existants, cliquez sur "Synchroniser maintenant".</p>`,
      confirmLabel: "Synchroniser maintenant",
      onConfirm: async () => {
        showBoostToast("Synchronisation en cours…", "info");
        try {
          const res = await fetch(`${API}/api/agenda`, { headers: _authH() });
          const events = res.ok ? await res.json() : [];
          let synced = 0;
          for (const ev of events.filter((e) => !e.notified).slice(0, 10)) {
            const r = await fetch(`${API}/api/integrations/google/sync-event`, {
              method: "POST",
              headers: { ..._authH(), "Content-Type": "application/json" },
              body: JSON.stringify({ event: ev }),
            });
            if (r.ok) synced++;
          }
          showBoostToast(
            `${synced} événement(s) synchronisé(s) avec Google Agenda`,
            "success",
          );
        } catch {
          showBoostToast("Erreur de synchronisation", "error");
        }
      },
    });
    return;
  }

  _fixShowModal({
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    title: "Connecter Google Agenda",
    body: `<p style="font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:12px">Autorisez AiGENT à créer des événements dans votre Google Agenda. Vos visites, rendez-vous et alertes apparaîtront automatiquement.</p>
           <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8);padding:11px;font-size:11.5px;color:var(--t2)">
             <div style="font-weight:700;margin-bottom:5px">Ce qui sera synchronisé :</div>
             <div>• Événements créés dans l'Agenda AiGENT</div>
             <div>• Rappels de visites programmées</div>
             <div>• Alertes Deal Radar importantes</div>
           </div>`,
    confirmLabel: "Autoriser via Google →",
    onConfirm: async () => {
      try {
        const r = await fetch(`${API}/api/integrations/google/auth`, {
          headers: _authH(),
        });
        const data = await r.json();
        if (data.authUrl) {
          window.open(data.authUrl, "_blank", "width=500,height=600,noopener");
          showBoostToast(
            "Autorisez l'accès dans la fenêtre Google ouverte",
            "info",
          );
        }
      } catch {
        showBoostToast("Erreur lors de l'initialisation OAuth", "error");
      }
    },
  });
}

function _fixOpenPhoneFlow(app) {
  _fixShowModal({
    icon: app.svg,
    title: "Connecter WhatsApp",
    body: `<div style="margin-bottom:10px">
             <label class="field-label" style="display:block;margin-bottom:4px">Numéro WhatsApp</label>
             <input type="tel" id="modal-phone-input" class="field-input" placeholder="+33612345678" style="width:100%"/>
             <div style="font-size:10.5px;color:var(--t4);margin-top:4px">Format international requis : +33 suivi des 9 chiffres</div>
           </div>
           <div style="background:var(--v-soft);border:1px solid rgba(109,40,217,.12);border-radius:var(--r6);padding:9px;font-size:11px;color:var(--t2);line-height:1.5">
             Les alertes de nouveaux matchs et rappels de visites seront envoyées sur ce numéro.
           </div>`,
    confirmLabel: "Connecter",
    onConfirm: async () => {
      const phone = document.getElementById("modal-phone-input")?.value.trim();
      if (!phone || !/^\+\d{8,15}$/.test(phone)) {
        showBoostToast("Format invalide — utilisez +33612345678", "error");
        return false;
      }
      try {
        await fetch(`${API}/api/integrations/whatsapp`, {
          method: "POST",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        await _fixConnectApp("whatsapp", "WhatsApp");
        showBoostToast(
          `WhatsApp connecté — alertes envoyées au ${phone}`,
          "success",
        );
      } catch {
        showBoostToast("Erreur lors de la connexion", "error");
      }
    },
  });
}

function _fixOpenEmailFlow(app) {
  _fixShowModal({
    icon: app.svg,
    title: `Connecter ${app.name}`,
    body: `<div style="margin-bottom:10px">
             <label class="field-label" style="display:block;margin-bottom:4px">Adresse e-mail</label>
             <input type="email" id="modal-email-input" class="field-input" placeholder="vous@${app.id === "gmail" ? "gmail" : "yahoo"}.com" style="width:100%"/>
           </div>
           <div style="background:var(--v-soft);border:1px solid rgba(109,40,217,.12);border-radius:var(--r6);padding:9px;font-size:11px;color:var(--t2);line-height:1.5">
             Vous recevrez vos résumés de matchs, alertes Deal Radar et confirmations sur cette adresse.
           </div>`,
    confirmLabel: "Valider",
    onConfirm: async () => {
      const email = document.getElementById("modal-email-input")?.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showBoostToast("Adresse e-mail invalide", "error");
        return false;
      }
      try {
        await fetch(`${API}/api/me/preferences`, {
          method: "PATCH",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({
            [`${app.id}Email`]: email,
            [`${app.id}Notifs`]: true,
          }),
        });
        await _fixConnectApp(app.id, app.name);
        showBoostToast(
          `${app.name} connecté — notifications activées pour ${email}`,
          "success",
        );
      } catch {
        showBoostToast("Erreur lors de la connexion", "error");
      }
    },
  });
}

function _fixOpenWebhookFlow(app) {
  _fixShowModal({
    icon: app.svg,
    title: `Connecter ${app.name}`,
    body: `<div style="margin-bottom:10px">
             <label class="field-label" style="display:block;margin-bottom:4px">Webhook URL Slack</label>
             <input type="url" id="modal-webhook-input" class="field-input" placeholder="https://hooks.slack.com/services/…" style="width:100%"/>
             <div style="font-size:10.5px;color:var(--t4);margin-top:4px">Créez un webhook entrant dans votre workspace Slack : <em>api.slack.com/apps</em></div>
           </div>`,
    confirmLabel: "Connecter",
    onConfirm: async () => {
      const webhook = document
        .getElementById("modal-webhook-input")
        ?.value.trim();
      if (!webhook || !webhook.startsWith("https://hooks.slack.com")) {
        showBoostToast("URL Slack invalide", "error");
        return false;
      }
      try {
        await fetch(`${API}/api/me/preferences`, {
          method: "PATCH",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ slackWebhook: webhook }),
        });
        await _fixConnectApp("slack", "Slack");
        showBoostToast(
          "Slack connecté — les alertes seront postées dans votre canal",
          "success",
        );
      } catch {
        showBoostToast("Erreur", "error");
      }
    },
  });
}

function _fixOpenTokenFlow(app) {
  _fixShowModal({
    icon: app.svg,
    title: "Connecter Notion",
    body: `<div style="margin-bottom:10px">
             <label class="field-label" style="display:block;margin-bottom:4px">Token d'intégration Notion</label>
             <input type="text" id="modal-token-input" class="field-input" placeholder="secret_…" style="width:100%;font-family:monospace;font-size:11px"/>
             <div style="font-size:10.5px;color:var(--t4);margin-top:4px">Créez une intégration sur <em>notion.so/my-integrations</em></div>
           </div>`,
    confirmLabel: "Valider",
    onConfirm: async () => {
      const token = document.getElementById("modal-token-input")?.value.trim();
      if (!token || !token.startsWith("secret_")) {
        showBoostToast(
          "Token Notion invalide (doit commencer par secret_)",
          "error",
        );
        return false;
      }
      try {
        await fetch(`${API}/api/me/preferences`, {
          method: "PATCH",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ notionToken: token }),
        });
        await _fixConnectApp("notion", "Notion");
        showBoostToast("Notion connecté — export disponible", "success");
      } catch {
        showBoostToast("Erreur", "error");
      }
    },
  });
}

function _fixOpenTelegramFlow(app) {
  _fixShowModal({
    icon: app.svg,
    title: "Connecter Telegram",
    body: `<div style="margin-bottom:10px">
             <label class="field-label" style="display:block;margin-bottom:4px">Votre Chat ID Telegram</label>
             <input type="text" id="modal-chatid-input" class="field-input" placeholder="123456789" style="width:100%"/>
             <div style="font-size:10.5px;color:var(--t4);margin-top:4px">Envoyez /start à @userinfobot sur Telegram pour obtenir votre Chat ID</div>
           </div>`,
    confirmLabel: "Connecter",
    onConfirm: async () => {
      const chatId = document
        .getElementById("modal-chatid-input")
        ?.value.trim();
      if (!chatId || !/^\d+$/.test(chatId)) {
        showBoostToast("Chat ID invalide (chiffres uniquement)", "error");
        return false;
      }
      try {
        await fetch(`${API}/api/me/preferences`, {
          method: "PATCH",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ telegramChatId: chatId }),
        });
        await _fixConnectApp("telegram", "Telegram");
        showBoostToast("Telegram connecté — alertes activées", "success");
      } catch {
        showBoostToast("Erreur", "error");
      }
    },
  });
}

function _fixOpenICalFlow(app) {
  const icalUrl = `${API}/api/agenda/ical?token=${_getToken()}`;
  _fixShowModal({
    icon: app.svg,
    title: "Abonnement Apple Calendar (iCal)",
    body: `<p style="font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:10px">Copiez ce lien et ajoutez-le dans votre application Calendrier comme calendrier par abonnement.</p>
           <div style="display:flex;align-items:center;gap:7px">
             <input type="text" value="${icalUrl}" readonly class="field-input" style="flex:1;font-family:monospace;font-size:10.5px" id="ical-url-input"/>
             <button onclick="navigator.clipboard.writeText('${icalUrl}').then(()=>{this.textContent='Copié !';setTimeout(()=>this.textContent='Copier',2000)})" style="height:34px;padding:0 10px;border-radius:var(--r6);border:1px solid var(--border);background:var(--bg-panel);color:var(--v);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit">Copier</button>
           </div>
           <div style="font-size:10.5px;color:var(--t4);margin-top:6px">Dans Apple Calendar : Fichier → Nouvel abonnement de calendrier → coller ce lien</div>`,
    confirmLabel: "C'est fait !",
    onConfirm: async () => {
      await _fixConnectApp("apple-calendar", "Apple Calendar");
    },
  });
}

async function _fixConnectApp(id, name) {
  try {
    await fetch(`${API}/api/integrations/connect`, {
      method: "POST",
      headers: { ..._authH(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: id }),
    });
    showBoostToast(`${name} connecté`, "success");
    _fixRenderIntegApps();
  } catch {
    showBoostToast("Erreur lors de la connexion", "error");
  }
}

window._fixExportCSV = async function () {
  try {
    const res = await fetch(`${API}/api/stats`, { headers: _authH() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const matches = data.matches || [];
    if (!matches.length) {
      showBoostToast("Aucun match à exporter", "info");
      return;
    }
    const headers = [
      "Ville",
      "Type",
      "Prix",
      "Surface",
      "Pièces",
      "Compatibilité",
      "Contact",
    ];
    const rows = matches.map((m) => [
      m.ville || "",
      m.type || "",
      m.price || m.budgetMax || "",
      m.surface || m.surfaceMin || "",
      m.pieces || m.piecesMin || "",
      m.compatibility || "",
      m.contact || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aigent-matchs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showBoostToast("Export CSV téléchargé", "success");
  } catch {
    showBoostToast("Erreur lors de l'export", "error");
  }
};

// ══════════════════════════════════════════════════════════════════════
// 10. GRAPHIQUE ACTIVITÉ — Chart.js + persistance DB (BUG 4 fixé)
// ══════════════════════════════════════════════════════════════════════

window._fixRenderActivityChart = function () {
  const chartWrap = document.querySelector(".activity-chart-wrap");
  if (!chartWrap) return;

  const SESSION_KEY = "aigent_session_log";
  function getLog() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function trackSession() {
    const today = new Date().toISOString().split("T")[0];
    let log = getLog();
    let entry = log.find((e) => e.date === today);
    if (!entry) {
      entry = { date: today, minutes: 0 };
      log.push(entry);
    }
    entry.minutes++;
    log = log.slice(-30);
    localStorage.setItem(SESSION_KEY, JSON.stringify(log));
    // Persistance DB en arrière-plan (non bloquant)
    _persistSessionTime(today, entry.minutes).catch(() => {});
  }
  if (!window._activityInterval) {
    window._activityInterval = setInterval(trackSession, 60000);
    trackSession();
  }

  const PERIODS = [
    { key: "day", label: "Aujourd'hui", slots: 24 },
    { key: "week", label: "7 jours", slots: 7 },
    { key: "month", label: "30 jours", slots: 30 },
  ];
  let currentPeriod = "week";
  let chartInstance = null;

  function getChartData(period) {
    const log = getLog();
    const now = new Date();
    if (period === "day") {
      const todayStr = now.toISOString().split("T")[0];
      const todayEntry = log.find((e) => e.date === todayStr);
      const totalMin = todayEntry?.minutes || 0;
      const curH = now.getHours();
      return Array.from({ length: 24 }, (_, h) => {
        if (h > curH) return { label: `${h}h`, value: 0 };
        if (h === curH)
          return { label: `${h}h`, value: Math.min(totalMin, 45) };
        const peak =
          Math.exp(-((h - 9) ** 2) / 8) +
          Math.exp(-((h - 14) ** 2) / 8) +
          Math.exp(-((h - 20) ** 2) / 8);
        return {
          label: `${h}h`,
          value: totalMin > 0 ? Math.round((peak / 3.2) * totalMin * 0.8) : 0,
        };
      });
    }
    const days = period === "week" ? 7 : 30;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      const dateStr = d.toISOString().split("T")[0];
      const entry = log.find((e) => e.date === dateStr);
      const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
      return {
        label:
          period === "week"
            ? dayNames[d.getDay()]
            : `${d.getDate()}/${d.getMonth() + 1}`,
        value: entry?.minutes || 0,
        isToday: dateStr === now.toISOString().split("T")[0],
      };
    });
  }

  function formatDuration(m) {
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    const mn = m % 60;
    return mn > 0 ? `${h}h${String(mn).padStart(2, "0")}` : `${h}h`;
  }

  function renderChart(period) {
    const data = getChartData(period);
    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const totalMin = data.reduce((s, d) => s + d.value, 0);
    const avgMin = Math.round(totalMin / data.length);
    const peakEntry = data.reduce(
      (b, d) => (d.value > b.value ? d : b),
      data[0],
    );

    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    const violet = "#7c3aed";
    const violetLight = isDark
      ? "rgba(124,58,237,0.18)"
      : "rgba(124,58,237,0.08)";
    const textColor = isDark ? "#aaaac8" : "#6e6e8a";
    const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";

    chartWrap.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
        <div style="padding:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8);text-align:center">
          <div style="font-size:17px;font-weight:800;color:var(--v);letter-spacing:-.03em">${formatDuration(totalMin)}</div>
          <div style="font-size:9.5px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Total</div>
        </div>
        <div style="padding:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8);text-align:center">
          <div style="font-size:17px;font-weight:800;color:var(--v);letter-spacing:-.03em">${formatDuration(avgMin)}</div>
          <div style="font-size:9.5px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Moyenne</div>
        </div>
        <div style="padding:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8);text-align:center">
          <div style="font-size:17px;font-weight:800;color:var(--v);letter-spacing:-.03em">${peakEntry.label}</div>
          <div style="font-size:9.5px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Pic</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <p style="font-size:10px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin:0">Temps d'utilisation</p>
        <div style="display:flex;gap:4px" id="period-btns">
          ${PERIODS.map((p) => `<button data-period="${p.key}" style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${currentPeriod === p.key ? "var(--v)" : "var(--border)"};background:${currentPeriod === p.key ? "var(--v-soft)" : "var(--bg-panel)"};color:${currentPeriod === p.key ? "var(--v)" : "var(--t3)"};font-family:inherit;transition:all .1s">${p.label}</button>`).join("")}
        </div>
      </div>
      <div style="position:relative;height:140px;width:100%">
        <canvas id="activity-line-chart" role="img" aria-label="Courbe du temps d'utilisation AiGENT"></canvas>
      </div>
      ${totalMin === 0 ? `<div style="text-align:center;font-size:11.5px;color:var(--t4);margin-top:8px;font-style:italic">Aucune activité enregistrée — le suivi démarre maintenant ✓</div>` : ""}`;

    document
      .getElementById("period-btns")
      .querySelectorAll("button")
      .forEach((btn) => {
        btn.onclick = () => {
          currentPeriod = btn.dataset.period;
          if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
          }
          renderChart(currentPeriod);
        };
      });

    function initChart() {
      const canvas = document.getElementById("activity-line-chart");
      if (!canvas) return;
      const labels = data.map((d) => d.label);
      const values = data.map((d) => d.value);
      const pointColors = data.map((d) => (d.isToday ? violet : "transparent"));
      const pointBorderColors = data.map((d) =>
        d.isToday ? violet : "transparent",
      );
      if (window.Chart) {
        if (chartInstance) chartInstance.destroy();
        chartInstance = new window.Chart(canvas, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Temps (min)",
                data: values,
                borderColor: violet,
                backgroundColor: violetLight,
                fill: true,
                tension: 0.45,
                pointBackgroundColor: pointColors,
                pointBorderColor: pointBorderColors,
                pointRadius: data.map((d) => (d.isToday ? 5 : 0)),
                pointHoverRadius: 5,
                pointHoverBackgroundColor: violet,
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: isDark ? "#18181f" : "#fff",
                borderColor: isDark
                  ? "rgba(255,255,255,.1)"
                  : "rgba(0,0,0,.08)",
                borderWidth: 1,
                titleColor: isDark ? "#ededf5" : "#111118",
                bodyColor: isDark ? "#aaaac8" : "#6e6e8a",
                padding: 10,
                callbacks: {
                  label: (ctx) =>
                    ` ${formatDuration(Math.round(ctx.parsed.y))}`,
                },
              },
            },
            scales: {
              x: {
                grid: { color: gridColor, drawBorder: false },
                ticks: {
                  color: textColor,
                  font: { size: 10, family: "'Plus Jakarta Sans', sans-serif" },
                  maxRotation: 0,
                  autoSkip: true,
                  maxTicksLimit: period === "month" ? 10 : 8,
                },
              },
              y: {
                grid: { color: gridColor, drawBorder: false },
                ticks: {
                  color: textColor,
                  font: { size: 10, family: "'Plus Jakarta Sans', sans-serif" },
                  callback: (v) => formatDuration(Math.round(v)),
                  maxTicksLimit: 5,
                },
                min: 0,
              },
            },
          },
        });
      }
    }

    if (!window.Chart) {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
      script.onload = initChart;
      document.head.appendChild(script);
    } else {
      initChart();
    }
  }

  renderChart(currentPeriod);
};

// ══════════════════════════════════════════════════════════════════════
// 11. TRACKING TEMPS D'ÉCRAN — persistance DB (BUG 10 fixé)
// Les données survivent entre sessions via /api/me/preferences
// ══════════════════════════════════════════════════════════════════════

async function _persistSessionTime(date, minutes) {
  try {
    // Charger les prefs actuelles
    const res = await fetch(`${API}/api/me/preferences`, { headers: _authH() });
    if (!res.ok) return;
    const prefs = await res.json();

    // Fusionner avec les données de session locales
    const remoteLog = prefs.sessionLog || [];
    const existingIdx = remoteLog.findIndex((e) => e.date === date);
    if (existingIdx >= 0) {
      // Garder le max (évite la régression si local < remote)
      remoteLog[existingIdx].minutes = Math.max(
        remoteLog[existingIdx].minutes,
        minutes,
      );
    } else {
      remoteLog.push({ date, minutes });
    }
    // Garder les 30 derniers jours
    const trimmed = remoteLog.slice(-30);

    await fetch(`${API}/api/me/preferences`, {
      method: "PATCH",
      headers: { ..._authH(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionLog: trimmed }),
    });
  } catch {}
}

async function _loadSessionTimeFromDB() {
  try {
    const res = await fetch(`${API}/api/me/preferences`, { headers: _authH() });
    if (!res.ok) return;
    const prefs = await res.json();
    const remoteLog = prefs.sessionLog || [];
    if (!remoteLog.length) return;

    // Fusionner log DB avec log local (le max de chaque jour)
    const SESSION_KEY = "aigent_session_log";
    let localLog = [];
    try {
      localLog = JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
    } catch {}

    const merged = [...localLog];
    for (const remoteEntry of remoteLog) {
      const localIdx = merged.findIndex((e) => e.date === remoteEntry.date);
      if (localIdx >= 0) {
        merged[localIdx].minutes = Math.max(
          merged[localIdx].minutes,
          remoteEntry.minutes,
        );
      } else {
        merged.push(remoteEntry);
      }
    }
    merged.sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(SESSION_KEY, JSON.stringify(merged.slice(-30)));
  } catch {}
}

function initSessionTimeTracking() {
  // Charger depuis DB au démarrage pour fusionner avec les données locales
  _loadSessionTimeFromDB().then(() => {
    // Démarrer le tracking si pas déjà actif
    if (!window._sessionTrackInterval) {
      window._sessionTrackInterval = setInterval(() => {
        const today = new Date().toISOString().split("T")[0];
        const SESSION_KEY = "aigent_session_log";
        let log = [];
        try {
          log = JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
        } catch {}
        let entry = log.find((e) => e.date === today);
        if (!entry) {
          entry = { date: today, minutes: 0 };
          log.push(entry);
        }
        entry.minutes++;
        log = log.slice(-30);
        localStorage.setItem(SESSION_KEY, JSON.stringify(log));
        _persistSessionTime(today, entry.minutes).catch(() => {});
      }, 60000);
    }
  });

  // Sauvegarder en DB à la fermeture de la page (best-effort)
  window.addEventListener("beforeunload", () => {
    const SESSION_KEY = "aigent_session_log";
    let log = [];
    try {
      log = JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
    } catch {}
    const today = new Date().toISOString().split("T")[0];
    const todayEntry = log.find((e) => e.date === today);
    if (todayEntry) {
      // sendBeacon pour garantir l'envoi même en fermeture
      const payload = JSON.stringify({ sessionLog: log.slice(-30) });
      navigator.sendBeacon(`${API}/api/me/preferences-beacon`, payload);
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// PATCH SECTION NAV — intercepter les sections pour déclencher les bons rendus
// ══════════════════════════════════════════════════════════════════════

document.addEventListener("click", (e) => {
  const link = e.target.closest(".sidenav-link, .tab-btn");
  if (!link) return;
  const section = link.dataset.section;
  if (section === "notifications")
    setTimeout(() => window._fixLoadNotificationsCenter?.(), 80);
  if (section === "activity")
    setTimeout(() => window._fixRenderActivityChart(), 100);
});

// Exposer les fonctions corrigées globalement pour compatibilité profil.js
window._fixLoadNotificationsCenter = async function () {
  const container = document.getElementById("notif-center-list");
  if (!container) return;
  container.innerHTML = `<div class="notif-loading">Chargement…</div>`;
  let notifs = [];
  try {
    const res = await fetch(`${API}/api/notifications`, { headers: _authH() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    notifs = await res.json();
  } catch (err) {
    container.innerHTML = `<div class="notif-empty">Erreur lors du chargement des notifications.</div>`;
    return;
  }

  if (!notifs.length) {
    container.innerHTML = `<div class="notif-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <p>Aucune notification pour le moment.</p>
    </div>`;
    return;
  }

  const ICONS = {
    match: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    message: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    radar: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="#f59e0b"/></svg>`,
    workspace: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    default: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  container.innerHTML = `
    <div class="notif-center-header">
      <span>${notifs.filter((n) => !n.read).length} non lue(s)</span>
      <button id="markAllRead" class="btn-mark-all">Tout marquer comme lu</button>
    </div>
    <div class="notif-center-items" id="notif-items"></div>`;

  document
    .getElementById("markAllRead")
    ?.addEventListener("click", async () => {
      await fetch(`${API}/api/notifications/read`, {
        method: "POST",
        headers: { ..._authH(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: null }),
      });
      window._fixLoadNotificationsCenter();
    });

  const itemsEl = document.getElementById("notif-items");
  const escHtml = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  notifs.forEach((n) => {
    let notifData = {};
    try {
      notifData = JSON.parse(n.data || "{}");
    } catch {}
    const isWorkspaceInvite =
      notifData.type === "workspace_invite" ||
      n.title?.toLowerCase().includes("invitation espace");
    const iconType = isWorkspaceInvite
      ? "workspace"
      : n.type === "radar"
        ? "radar"
        : n.type === "message"
          ? "message"
          : "match";

    const div = document.createElement("div");
    div.className = `notif-item ${n.read ? "read" : "unread"}`;
    div.innerHTML = `
      <div class="notif-item-icon">${ICONS[iconType] || ICONS.default}</div>
      <div class="notif-item-body" style="flex:1;min-width:0">
        <div class="notif-item-title">${escHtml(n.title)}</div>
        <div class="notif-item-body-text">${escHtml(n.body)}</div>
        ${
          isWorkspaceInvite && !n.read
            ? `
          <div style="display:flex;gap:7px;margin-top:8px">
            <button class="btn-ws-accept" data-owner="${escHtml(notifData.ownerUsername || "")}" data-notif="${n.id}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:6px;background:var(--ok-bg);color:var(--ok);border:1px solid rgba(5,150,105,.25);font-size:11px;font-weight:700;cursor:pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Accepter
            </button>
            <button class="btn-ws-decline" data-owner="${escHtml(notifData.ownerUsername || "")}" data-notif="${n.id}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:6px;background:var(--err-bg);color:var(--err);border:1px solid rgba(220,38,38,.25);font-size:11px;font-weight:700;cursor:pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Refuser
            </button>
          </div>`
            : ""
        }
        <div class="notif-item-date">${new Date(n.created_at).toLocaleString("fr-FR")}</div>
      </div>
      <div class="notif-item-actions">
        ${!n.read ? `<button class="btn-read-one" data-id="${n.id}" title="Marquer comme lu">✓</button>` : ""}
        <button class="btn-delete-notif" data-id="${n.id}" title="Supprimer">×</button>
      </div>`;

    div
      .querySelector(".btn-ws-accept")
      ?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ownerUsername = e.currentTarget.dataset.owner;
        const notifId = e.currentTarget.dataset.notif;
        try {
          const r = await fetch(`${API}/api/workspace/respond`, {
            method: "POST",
            headers: { ..._authH(), "Content-Type": "application/json" },
            body: JSON.stringify({ ownerUsername, accept: true }),
          });
          if (r.ok) {
            await fetch(`${API}/api/notifications/read`, {
              method: "POST",
              headers: { ..._authH(), "Content-Type": "application/json" },
              body: JSON.stringify({ id: notifId }),
            });
            showBoostToast(
              `Vous avez rejoint l'espace de travail de ${ownerUsername}`,
              "success",
            );
            window._fixLoadNotificationsCenter();
          }
        } catch {
          showBoostToast("Erreur lors de l'acceptation", "error");
        }
      });

    div
      .querySelector(".btn-ws-decline")
      ?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ownerUsername = e.currentTarget.dataset.owner;
        const notifId = e.currentTarget.dataset.notif;
        try {
          await fetch(`${API}/api/workspace/respond`, {
            method: "POST",
            headers: { ..._authH(), "Content-Type": "application/json" },
            body: JSON.stringify({ ownerUsername, accept: false }),
          });
          await fetch(`${API}/api/notifications/read`, {
            method: "POST",
            headers: { ..._authH(), "Content-Type": "application/json" },
            body: JSON.stringify({ id: notifId }),
          });
          showBoostToast("Invitation refusée", "info");
          window._fixLoadNotificationsCenter();
        } catch {
          showBoostToast("Erreur", "error");
        }
      });

    div.querySelector(".btn-read-one")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch(`${API}/api/notifications/read`, {
        method: "POST",
        headers: { ..._authH(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
      window._fixLoadNotificationsCenter();
    });

    div
      .querySelector(".btn-delete-notif")
      ?.addEventListener("click", async (e) => {
        e.stopPropagation();
        await fetch(`${API}/api/notifications/${n.id}`, {
          method: "DELETE",
          headers: _authH(),
        });
        div.remove();
      });

    div.addEventListener("click", async () => {
      if (!n.read) {
        await fetch(`${API}/api/notifications/read`, {
          method: "POST",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ id: n.id }),
        });
        div.classList.replace("unread", "read");
      }
    });

    itemsEl.appendChild(div);
  });
};

// ══════════════════════════════════════════════════════════════════════
// INIT AU CHARGEMENT
// ══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (
      document
        .getElementById("section-notifications")
        ?.classList.contains("active")
    ) {
      window._fixLoadNotificationsCenter();
    }
    if (
      document.getElementById("section-activity")?.classList.contains("active")
    ) {
      window._fixRenderActivityChart();
    }
    console.log("[fonctios-profil.js] ✅ Tous les modules initialisés");
  }, 350);
});
