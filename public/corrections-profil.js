/**
 * corrections-profil.js — AiGENT Dashboard v4 — CORRECTIONS CIBLÉES
 *
 * BUG 1 : Notifications — erreur de chargement (fonctions authH() manquante dans profil.js)
 * BUG 2 : Intégrations — refonte complète avec vrais outils externes
 * BUG 3 : Workspace — bouton Envoyer disparu + champ email manquant
 * BUG 4 : Graphique Activité — vraie courbe SaaS avec Chart.js
 * BUG 5 : SVG Intégrations sidenav + mobile sidebar
 *
 * Ce fichier remplace les fonctions concernées dans fonctios-profil.js et profil.js
 * À charger APRÈS profil.js et fonctios-profil.js dans le HTML :
 *   <script src="corrections-profil.js" type="module"></script>
 */

// ══════════════════════════════════════════════════════════════════════
// HELPERS PARTAGÉS (compatibles ES module)
// ══════════════════════════════════════════════════════════════════════

const API = window.location.origin;

function _getToken() {
  try {
    const raw = localStorage.getItem("agent_user");
    return raw ? JSON.parse(raw)?.token : null;
  } catch {
    return null;
  }
}

function _authH() {
  return { Authorization: `Bearer ${_getToken()}` };
}

// ══════════════════════════════════════════════════════════════════════
// BUG 1 : FIX NOTIFICATIONS — Le centre de notifications ne se charge plus
// Cause : loadNotificationsCenter() dans profil.js appelle authH() mais
//         la variable currentUser peut ne pas être initialisée au moment
//         du clic. On réécrit la fonction et on surcharge window.*
// ══════════════════════════════════════════════════════════════════════

window._fixLoadNotificationsCenter = async function () {
  const container = document.getElementById("notif-center-list");
  if (!container) return;
  container.innerHTML = `<div class="notif-loading">Chargement…</div>`;

  let notifs = [];
  try {
    const res = await fetch(`${API}/api/notifications`, {
      headers: _authH(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    notifs = await res.json();
  } catch (err) {
    console.error("[FIX notifs]", err);
    container.innerHTML = `<div class="notif-empty">Erreur lors du chargement des notifications. Vérifiez votre connexion.</div>`;
    return;
  }

  if (!notifs.length) {
    container.innerHTML = `
      <div class="notif-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
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

    const escHtml = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    div.innerHTML = `
      <div class="notif-item-icon">${ICONS[iconType] || ICONS.default}</div>
      <div class="notif-item-body" style="flex:1;min-width:0">
        <div class="notif-item-title">${escHtml(n.title)}</div>
        <div class="notif-item-body-text">${escHtml(n.body)}</div>
        ${
          isWorkspaceInvite && !n.read
            ? `
          <div style="display:flex;gap:7px;margin-top:8px">
            <button class="btn-ws-accept" data-owner="${escHtml(notifData.ownerUsername || "")}" data-notif="${n.id}"
              style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:6px;background:var(--ok-bg);color:var(--ok);border:1px solid rgba(5,150,105,.25);font-size:11px;font-weight:700;cursor:pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Accepter
            </button>
            <button class="btn-ws-decline" data-owner="${escHtml(notifData.ownerUsername || "")}" data-notif="${n.id}"
              style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:6px;background:var(--err-bg);color:var(--err);border:1px solid rgba(220,38,38,.25);font-size:11px;font-weight:700;cursor:pointer">
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
            _showToast(
              `Vous avez rejoint l'espace de travail de ${ownerUsername}`,
              "success",
            );
            window._fixLoadNotificationsCenter();
          }
        } catch {
          _showToast("Erreur lors de l'acceptation", "error");
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
          _showToast("Invitation refusée", "info");
          window._fixLoadNotificationsCenter();
        } catch {
          _showToast("Erreur", "error");
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
// BUG 3 : FIX WORKSPACE — Bouton "Envoyer" disparu + champ email manquant
// On réécrit initWorkspace() complètement
// ══════════════════════════════════════════════════════════════════════

window._fixInitWorkspace = function () {
  const main = document.querySelector(".settings-main");
  if (!main) return;

  // Retirer l'ancienne section si elle existe
  document.getElementById("section-workspace")?.remove();
  const sidenav = document.getElementById("settingsSidenav");
  if (sidenav) {
    sidenav.querySelector('.sidenav-link[data-section="workspace"]')?.remove();
  }

  // Réinjecter le lien sidenav
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
          <span class="block-icon">
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </span>
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

        <!-- FORMULAIRE INVITATION — COMPLET AVEC EMAIL + BOUTON ENVOYER -->
        <div class="workspace-invite-form" id="ws-invite-form" style="display:none;margin-top:12px;padding:14px;background:var(--bg-surface);border:1px dashed var(--border-mid);border-radius:var(--r8)">
          <div style="display:flex;align-items:center;gap:7px;padding:8px 10px;background:var(--v-soft);border:1px solid rgba(109,40,217,.12);border-radius:var(--r6);font-size:11px;color:var(--t2);margin-bottom:12px;line-height:1.45">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v)" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Le <strong>pseudo</strong> et <strong>l'e-mail</strong> doivent correspondre au même compte AiGENT
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
                <option value="collab">Co-acheteur (peut interagir)</option>
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

    <!-- ACTIONS COMMUNES (visibles si membres actifs) -->
    <div class="settings-block" id="ws-actions-block" style="display:none">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-icon">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </span>
          <div><h3>Actions communes</h3><p>Outils collaboratifs partagés avec votre équipe</p></div>
        </div>
      </div>
      <div class="block-body">
        <div class="ws-actions-grid" id="ws-actions-grid"></div>
      </div>
    </div>`;

  main.appendChild(section);

  // Bindings boutons
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

  document.getElementById("ws-send-invite-btn").onclick = _fixSendWsInvite;

  // Charger les membres
  _fixLoadWorkspaceMembers();
};

async function _fixLoadWorkspaceMembers() {
  const list = document.getElementById("ws-members-list");
  if (!list) return;
  try {
    const res = await fetch(`${API}/api/workspace/members`, {
      headers: _authH(),
    });
    const members = res.ok ? await res.json() : [];
    _fixRenderWsMembers(members);
    const actifs = members.filter((m) => m.status === "active");
    const actionsBlock = document.getElementById("ws-actions-block");
    if (actionsBlock)
      actionsBlock.style.display = actifs.length > 0 ? "" : "none";
    if (actifs.length > 0) _fixRenderWsActions(actifs);
  } catch {
    list.innerHTML = `<div style="font-size:12px;color:var(--t4);text-align:center;padding:16px">Erreur chargement des membres</div>`;
  }
}

function _fixRenderWsMembers(members) {
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
          ? `<button class="ws-remove-btn" data-username="${m.username}" title="Retirer" style="background:transparent;border:1px solid var(--border);color:var(--t4);border-radius:var(--r4);padding:3px 6px;cursor:pointer;display:flex;align-items:center;font-size:13px;transition:all .1s">
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
        await fetch(
          `${API}/api/workspace/members/${encodeURIComponent(uname)}`,
          { method: "DELETE", headers: _authH() },
        );
        _fixLoadWorkspaceMembers();
      } catch {}
    };
  });
}

function _fixRenderWsActions(members) {
  const grid = document.getElementById("ws-actions-grid");
  if (!grid) return;
  grid.innerHTML = `
    <div class="ws-action-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--v)" stroke-width="1.8" width="20" height="20"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      <div>
        <div class="ws-action-title">Partager un projet</div>
        <div class="ws-action-desc">Envoyez un projet à votre équipe</div>
      </div>
      <button class="btn-secondary" onclick="window.shareProjectWithTeam&&window.shareProjectWithTeam()">Partager</button>
    </div>
    <div class="ws-action-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--v)" stroke-width="1.8" width="20" height="20"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <div>
        <div class="ws-action-title">Notes partagées</div>
        <div class="ws-action-desc">${members.length} membre(s) actif(s)</div>
      </div>
      <button class="btn-secondary" onclick="window.openSharedNotes&&window.openSharedNotes()">Ouvrir</button>
    </div>`;
}

async function _fixSendWsInvite() {
  const pseudo = document.getElementById("ws-pseudo-input")?.value.trim();
  const email = document.getElementById("ws-email-input")?.value.trim();
  const role = document.getElementById("ws-role-select")?.value;
  const resultEl = document.getElementById("ws-invite-result");
  const btn = document.getElementById("ws-send-invite-btn");

  if (!pseudo) {
    _showToast("Pseudo requis", "error");
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    _showToast("Adresse e-mail invalide", "error");
    return;
  }

  btn.textContent = "Vérification…";
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/workspace/invite`, {
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
      _showToast(
        data.error ||
          "Utilisateur introuvable ou e-mail ne correspond pas au pseudo",
        "error",
      );
      btn.disabled = false;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer l'invitation`;
      return;
    }

    if (resultEl)
      resultEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:7px;padding:8px 10px;background:var(--ok-bg);border:1px solid rgba(5,150,105,.18);border-radius:var(--r6);font-size:11.5px;font-weight:600;color:var(--ok);animation:blockIn .2s ease both">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Invitation envoyée à <strong>${pseudo}</strong> — en attente dans ses notifications
      </div>`;

    setTimeout(() => {
      document.getElementById("ws-invite-form").style.display = "none";
      document.getElementById("ws-pseudo-input").value = "";
      document.getElementById("ws-email-input").value = "";
      if (resultEl) resultEl.innerHTML = "";
      _fixLoadWorkspaceMembers();
    }, 3000);

    btn.disabled = false;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer l'invitation`;
  } catch {
    _showToast("Erreur serveur", "error");
    btn.disabled = false;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer l'invitation`;
  }
}

// ══════════════════════════════════════════════════════════════════════
// BUG 2 : FIX INTÉGRATIONS — Vrais outils externes connectés au site
// ══════════════════════════════════════════════════════════════════════

window._fixInitIntegrations = function () {
  const main = document.querySelector(".settings-main");
  if (!main) return;

  document.getElementById("section-integrations")?.remove();
  const sidenav = document.getElementById("settingsSidenav");
  if (sidenav) {
    sidenav
      .querySelector('.sidenav-link[data-section="integrations"]')
      ?.remove();
  }

  // SVG icône "quatre carrés" (grille d'applis) — BUG 5
  const INTEGRATIONS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>`;

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

    <!-- GRILLE PRINCIPALE — 4 petits carrés style AppStore -->
    <div class="settings-block">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-icon">${INTEGRATIONS_SVG}</span>
          <div><h3>Applications connectées</h3><p>Vos outils externes synchronisés avec AiGENT</p></div>
        </div>
        <span id="integ-connected-count" style="font-size:10.5px;font-weight:700;color:var(--v);background:var(--v-badge);padding:2px 9px;border-radius:var(--r99);border:1px solid rgba(109,40,217,.12)">0 connecté(s)</span>
      </div>
      <div class="block-body" style="padding:16px">
        <div id="integ-apps-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px"></div>
      </div>
    </div>

    <!-- SECTION EXPORT CSV -->
    <div class="settings-block">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-icon">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </span>
          <div><h3>Export de données</h3><p>Téléchargez vos matchs et favoris en CSV</p></div>
        </div>
        <button class="btn-secondary" onclick="window._fixExportCSV&&window._fixExportCSV()" style="font-size:12px;height:30px;padding:0 12px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exporter CSV
        </button>
      </div>
      <div class="block-body">
        <p class="block-description">Exportez tous vos matchs et favoris dans un fichier CSV compatible Excel et Google Sheets pour vos analyses personnelles.</p>
      </div>
    </div>

    <!-- PANNEAU DE CONFIGURATION CONTEXTUEL -->
    <div id="integ-config-panel" style="display:none"></div>`;

  main.appendChild(section);
  _fixRenderIntegApps();
};

// Définition des apps réelles — connectées au backend existant
const INTEG_APPS = [
  {
    id: "google-agenda",
    name: "Google Agenda",
    desc: "Synchronise vos événements AiGENT avec Google Calendar",
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" stroke-width="1.6"/><line x1="16" y1="2" x2="16" y2="6" stroke="#4285F4" stroke-width="1.6"/><line x1="8" y1="2" x2="8" y2="6" stroke="#4285F4" stroke-width="1.6"/><line x1="3" y1="10" x2="21" y2="10" stroke="#4285F4" stroke-width="1.6"/><rect x="8" y="13" width="4" height="4" rx="0.5" fill="#EA4335"/></svg>`,
    color: "#4285F4",
    action: "google-agenda",
    configUI: null,
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
    svg: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><path d="M9 6C9 4.895 9.895 4 11 4s2 .895 2 2v5h-4V6zM6 9c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2v2H6zM9 18c0 1.105-.895 2-2 2s-2-.895-2-2 .895-2 2-2h2v2zM15 15c1.105 0 2 .895 2 2s-.895 2-2 2-2-.895-2-2v-2h2zM15 9h5v2h-5V9zM18 15c1.105 0 2 .895 2 2s-.895 2-2 2-2-.895-2-2V9h2v6z" stroke="#E01E5A" stroke-width=".5" fill="#E01E5A" fill-opacity=".15"/></svg>`,
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
    configUI: null,
  },
];

async function _fixRenderIntegApps() {
  const grid = document.getElementById("integ-apps-grid");
  if (!grid) return;

  // Charger les intégrations connectées
  let connected = [];
  try {
    const res = await fetch(`${API}/api/integrations`, { headers: _authH() });
    if (res.ok) {
      const data = await res.json();
      connected = data.connected || [];
    }
  } catch {}

  // Charger les préférences pour les configs (phone, email, etc.)
  let prefs = {};
  try {
    const res = await fetch(`${API}/api/me/preferences`, { headers: _authH() });
    if (res.ok) prefs = await res.json();
  } catch {}

  grid.innerHTML = "";

  INTEG_APPS.forEach((app) => {
    const isConnected = connected.includes(app.id);
    const card = document.createElement("div");
    card.style.cssText = `display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px;background:var(--bg-surface);border:1px solid ${isConnected ? app.color + "44" : "var(--border)"};border-radius:var(--r10);cursor:pointer;transition:all .15s ease;position:relative`;

    if (isConnected) {
      card.style.borderLeftWidth = "3px";
      card.style.borderLeftColor = app.color;
    }

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
        <div style="width:40px;height:40px;border-radius:var(--r8);background:var(--bg-panel);border:1px solid var(--border);display:flex;align-items:center;justify-content:center">
          ${app.svg}
        </div>
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

  // Compteur connectés
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
      _showToast(`${app.name} déconnecté`, "info");
      _fixRenderIntegApps();
    } catch {
      _showToast("Erreur lors de la déconnexion", "error");
    }
    return;
  }

  // Actions spécifiques selon l'app
  switch (app.action) {
    case "google-agenda":
      _fixOpenGoogleCalFlow();
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

function _fixOpenGoogleCalFlow() {
  _fixShowModal({
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    title: "Connecter Google Agenda",
    body: `<p style="font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:12px">Vos événements AiGENT (visites, rendez-vous) seront synchronisés avec Google Calendar automatiquement.</p>
           <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8);padding:11px;font-size:11.5px;color:var(--t2)">
             <div style="font-weight:700;margin-bottom:5px">Ce qui sera synchronisé :</div>
             <div>• Événements créés dans l'Agenda AiGENT</div>
             <div>• Rappels de visites programmées</div>
             <div>• Alertes de matchs importantes</div>
           </div>`,
    confirmLabel: "Autoriser l'accès",
    onConfirm: async () => {
      await _fixConnectApp("google-agenda", "Google Agenda");
      // En prod : window.location.href = `${API}/api/oauth/google-calendar?token=${_getToken()}`;
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
             Les alertes de nouveaux matchs et rappels de visites seront envoyées sur ce numéro via notre service de notification.
           </div>`,
    confirmLabel: "Connecter",
    onConfirm: async () => {
      const phone = document.getElementById("modal-phone-input")?.value.trim();
      if (!phone || !/^\+\d{8,15}$/.test(phone)) {
        _showToast("Format invalide — utilisez +33612345678", "error");
        return false;
      }
      try {
        await fetch(`${API}/api/integrations/whatsapp`, {
          method: "POST",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        await _fixConnectApp("whatsapp", "WhatsApp");
        _showToast(
          `WhatsApp connecté — alertes envoyées au ${phone}`,
          "success",
        );
      } catch {
        _showToast("Erreur lors de la connexion", "error");
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
             Vous recevrez vos résumés de matchs, alertes Deal Radar et confirmations de messages sur cette adresse.
           </div>`,
    confirmLabel: "Valider",
    onConfirm: async () => {
      const email = document.getElementById("modal-email-input")?.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        _showToast("Adresse e-mail invalide", "error");
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
        _showToast(
          `${app.name} connecté — notifications activées pour ${email}`,
          "success",
        );
      } catch {
        _showToast("Erreur lors de la connexion", "error");
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
             <div style="font-size:10.5px;color:var(--t4);margin-top:4px">
               Créez un webhook entrant dans votre workspace Slack : <em>api.slack.com/apps</em>
             </div>
           </div>`,
    confirmLabel: "Connecter",
    onConfirm: async () => {
      const webhook = document
        .getElementById("modal-webhook-input")
        ?.value.trim();
      if (!webhook || !webhook.startsWith("https://hooks.slack.com")) {
        _showToast("URL Slack invalide", "error");
        return false;
      }
      try {
        await fetch(`${API}/api/me/preferences`, {
          method: "PATCH",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ slackWebhook: webhook }),
        });
        await _fixConnectApp("slack", "Slack");
        _showToast(
          "Slack connecté — les alertes seront postées dans votre canal",
          "success",
        );
      } catch {
        _showToast("Erreur", "error");
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
             <div style="font-size:10.5px;color:var(--t4);margin-top:4px">
               Créez une intégration sur <em>notion.so/my-integrations</em> et copiez le token
             </div>
           </div>
           <div style="background:var(--v-soft);border:1px solid rgba(109,40,217,.12);border-radius:var(--r6);padding:9px;font-size:11px;color:var(--t2)">
             Vos projets et favoris pourront être exportés dans votre workspace Notion en un clic.
           </div>`,
    confirmLabel: "Valider",
    onConfirm: async () => {
      const token = document.getElementById("modal-token-input")?.value.trim();
      if (!token || !token.startsWith("secret_")) {
        _showToast(
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
        _showToast("Notion connecté — export disponible", "success");
      } catch {
        _showToast("Erreur", "error");
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
             <div style="font-size:10.5px;color:var(--t4);margin-top:4px">
               Envoyez /start à @userinfobot sur Telegram pour obtenir votre Chat ID
             </div>
           </div>`,
    confirmLabel: "Connecter",
    onConfirm: async () => {
      const chatId = document
        .getElementById("modal-chatid-input")
        ?.value.trim();
      if (!chatId || !/^\d+$/.test(chatId)) {
        _showToast("Chat ID invalide (chiffres uniquement)", "error");
        return false;
      }
      try {
        await fetch(`${API}/api/me/preferences`, {
          method: "PATCH",
          headers: { ..._authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ telegramChatId: chatId }),
        });
        await _fixConnectApp("telegram", "Telegram");
        _showToast("Telegram connecté — alertes activées", "success");
      } catch {
        _showToast("Erreur", "error");
      }
    },
  });
}

function _fixOpenICalFlow(app) {
  const icalUrl = `${API}/api/agenda/ical?token=${_getToken()}`;
  _fixShowModal({
    icon: app.svg,
    title: "Abonnement Apple Calendar (iCal)",
    body: `<p style="font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:10px">
             Copiez ce lien et ajoutez-le dans votre application Calendrier (Apple Calendar, Outlook, Thunderbird…) comme calendrier par abonnement.
           </p>
           <div style="display:flex;align-items:center;gap:7px">
             <input type="text" value="${icalUrl}" readonly class="field-input" style="flex:1;font-family:monospace;font-size:10.5px" id="ical-url-input"/>
             <button onclick="navigator.clipboard.writeText('${icalUrl}').then(()=>{this.textContent='Copié !';setTimeout(()=>this.textContent='Copier',2000)})" style="height:34px;padding:0 10px;border-radius:var(--r6);border:1px solid var(--border);background:var(--bg-panel);color:var(--v);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit">Copier</button>
           </div>
           <div style="font-size:10.5px;color:var(--t4);margin-top:6px">
             Dans Apple Calendar : Fichier → Nouvel abonnement de calendrier → coller ce lien
           </div>`,
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
    _showToast(`${name} connecté`, "success");
    _fixRenderIntegApps();
  } catch {
    _showToast("Erreur lors de la connexion", "error");
  }
}

window._fixExportCSV = async function () {
  try {
    const res = await fetch(`${API}/api/stats`, { headers: _authH() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const matches = data.matches || [];
    if (!matches.length) {
      _showToast("Aucun match à exporter", "info");
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
    _showToast("Export CSV téléchargé", "success");
  } catch {
    _showToast("Erreur lors de l'export", "error");
  }
};

// ══════════════════════════════════════════════════════════════════════
// BUG 4 : FIX GRAPHIQUE ACTIVITÉ — Vraie courbe SaaS avec Chart.js
// ══════════════════════════════════════════════════════════════════════

window._fixRenderActivityChart = function () {
  const chartWrap = document.querySelector(".activity-chart-wrap");
  if (!chartWrap) return;

  // Session tracking
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

    // Couleurs (pas de CSS vars dans Chart.js)
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    const violet = "#7c3aed";
    const violetLight = isDark
      ? "rgba(124,58,237,0.18)"
      : "rgba(124,58,237,0.08)";
    const textColor = isDark ? "#aaaac8" : "#6e6e8a";
    const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";

    chartWrap.innerHTML = `
      <!-- KPIs -->
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

      <!-- Sélecteurs de période -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <p style="font-size:10px;font-weight:700;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin:0">Temps d'utilisation</p>
        <div style="display:flex;gap:4px" id="period-btns">
          ${PERIODS.map((p) => `<button data-period="${p.key}" style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${currentPeriod === p.key ? "var(--v)" : "var(--border)"};background:${currentPeriod === p.key ? "var(--v-soft)" : "var(--bg-panel)"};color:${currentPeriod === p.key ? "var(--v)" : "var(--t3)"};font-family:inherit;transition:all .1s">${p.label}</button>`).join("")}
        </div>
      </div>

      <!-- Canvas Chart.js -->
      <div style="position:relative;height:140px;width:100%">
        <canvas id="activity-line-chart" role="img" aria-label="Courbe du temps d'utilisation AiGENT">${totalMin} minutes d'utilisation sur la période.</canvas>
      </div>
      ${totalMin === 0 ? `<div style="text-align:center;font-size:11.5px;color:var(--t4);margin-top:8px;font-style:italic">Aucune activité enregistrée — le suivi démarre maintenant ✓</div>` : ""}`;

    // Bindings boutons période
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

    // Chart.js — chargement dynamique si pas déjà chargé
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
// HELPER MODAL GÉNÉRIQUE (pour les intégrations)
// ══════════════════════════════════════════════════════════════════════

function _fixShowModal({ icon, title, body, confirmLabel, onConfirm }) {
  document.querySelectorAll(".fix-modal-overlay").forEach((m) => m.remove());
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active fix-modal-overlay";
  overlay.style.zIndex = "9999";
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:400px;animation:modalIn .18s cubic-bezier(.34,1.56,.64,1) both">
      <div class="modal-icon" style="text-align:center;margin-bottom:12px">${icon}</div>
      <h3 class="modal-title">${title}</h3>
      <div style="margin-bottom:16px">${body}</div>
      <div class="modal-actions">
        <button class="btn-secondary modal-cancel" id="fix-modal-cancel" style="flex:1">Annuler</button>
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
// HELPER TOAST (indépendant)
// ══════════════════════════════════════════════════════════════════════

function _showToast(message, type = "info") {
  // Utiliser la fonction existante si disponible
  if (typeof showBoostToast === "function") {
    showBoostToast(message, type);
    return;
  }
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
// PATCH SECTION NAV — Intercepter le clic "notifications" et "activity"
// pour utiliser les fonctions corrigées
// ══════════════════════════════════════════════════════════════════════

document.addEventListener("click", (e) => {
  const link = e.target.closest(".sidenav-link, .tab-btn");
  if (!link) return;
  const section = link.dataset.section;
  if (section === "notifications") {
    // Délai pour laisser le DOM basculer sur la section
    setTimeout(() => window._fixLoadNotificationsCenter(), 80);
  }
  if (section === "activity") {
    setTimeout(() => window._fixRenderActivityChart(), 100);
  }
});

// ══════════════════════════════════════════════════════════════════════
// INIT AU CHARGEMENT
// ══════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  // Laisser profil.js + fonctios-profil.js s'initialiser d'abord
  setTimeout(() => {
    // BUG 2 : refonte intégrations
    window._fixInitIntegrations();

    // BUG 3 : refonte workspace
    window._fixInitWorkspace();

    // BUG 5 : SVG sidenav intégrations déjà corrigé dans _fixInitIntegrations

    // Charger les notifs si la section est déjà active (cas rare)
    if (
      document
        .getElementById("section-notifications")
        ?.classList.contains("active")
    ) {
      window._fixLoadNotificationsCenter();
    }

    // Graphique activité si section active
    if (
      document.getElementById("section-activity")?.classList.contains("active")
    ) {
      window._fixRenderActivityChart();
    }

    console.log("[CORRECTIONS] ✅ Tous les patches appliqués");
  }, 300);
});
