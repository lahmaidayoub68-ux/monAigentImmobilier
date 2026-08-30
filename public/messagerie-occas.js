// ============================================================
// MESSAGERIE-OCCAS.JS — Mon AiGENT Occasion
// Front connecté à server-occas.js (/occas/api/messages, archives,
// blocages, upload-chat-images, upload-chat-files...)
// Pas d'enregistrement vocal (volontairement absent).
// ============================================================
const API = "/occas/api";
const TOKEN_KEYS = ["occas_token", "agent_occas_token", "token"];
const USER_KEYS = ["occas_user", "agent_occas_user", "agent_user"];

// ── AUTH / USER COURANT ──────────────────────────────────────
let currentUser = "";
let authToken = null;
let meRole = "";

function loadAuth() {
  try {
    // 1. Recherche du Token (localStorage et sessionStorage)
    for (const k of TOKEN_KEYS) {
      const v = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (v) {
        authToken = v;
        break;
      }
    }

    // 2. Recherche des données utilisateur
    let userObj = null;
    for (const k of USER_KEYS) {
      const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (raw) {
        try {
          userObj = JSON.parse(raw);
          if (userObj && typeof userObj === "object") {
            if (!authToken && userObj.token) authToken = userObj.token;
            if (userObj.username)
              currentUser = (userObj.username || "").trim().toLowerCase();
            if (userObj.role) meRole = userObj.role || "";
            break;
          }
        } catch {}
      }
    }

    if (!authToken) return null;
    return userObj || { token: authToken, username: currentUser, role: meRole };
  } catch {
    return null;
  }
}
function getAuthToken() {
  return authToken;
}
function authHeaders(json = true) {
  const h = { Authorization: `Bearer ${authToken}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ── STORES ────────────────────────────────────────────────────
const messagesStore = {}; // key -> [messages]
const conversationStore = new Set();
const userEmailStore = {};
const receiverIdStore = {};
const unreadStore = {};
const groupStore = {}; // groupId -> { name, participants: [] }
const archivedStore = new Set();
const blockedStore = new Set();

let activeConversationId = null;
let pendingFiles = []; // [{file,type:'image'|'file',previewUrl}]
let selectedMessageId = null;
let groupParticipantsDraft = [];
let selectedMentions = new Set();

// ── COULEURS PAR UTILISATEUR ────────────────────────────────
const SOLID_COLORS = [
  "#ff7a3d",
  "#ef4444",
  "#f0993d",
  "#ff6b5b",
  "#e8362f",
  "#ffa35c",
  "#d97a1f",
  "#c2410c",
];
const userColorMap = {};
let colorIdx = 0;
function colorFor(username) {
  if (!username) return SOLID_COLORS[0];
  if (userColorMap[username] === undefined) {
    userColorMap[username] = colorIdx % SOLID_COLORS.length;
    colorIdx++;
  }
  return SOLID_COLORS[userColorMap[username]];
}

// ── DOM ──────────────────────────────────────────────────────
const shell = document.getElementById("shell");
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const btnSend = document.getElementById("btnSend");
const conversationsContainer = document.getElementById(
  "conversationsContainer",
);
const detailsPanel = document.getElementById("detailsPanel");

// ============================================================
// UTILITAIRES
// ============================================================
function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatRelative(dateString) {
  const d = new Date(dateString);
  const diffH = (Date.now() - d) / 36e5;
  if (diffH < 24)
    return d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (diffH < 48) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "short" });
}
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function formatBytes(b) {
  if (b < 1024) return b + " o";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " Ko";
  return (b / (1024 * 1024)).toFixed(1) + " Mo";
}
function clean(s) {
  return (s || "").replace(/"/g, "").trim().toLowerCase();
}
function showToast(message, type = "info", duration = 2600) {
  const wrap = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 200);
  }, duration);
}

// ── Encodage des groupes (subject) — même méthode que AiGENT Immo ──
function makeGroupId(participants) {
  return "groupe__" + [...participants].sort().join("__");
}
function groupLabel(groupId) {
  const g = groupStore[groupId];
  return g ? g.name : groupId.replace("groupe__", "").replace(/__/g, ", ");
}
function buildGroupSubject(groupId, name, objet, participantsWithEmails) {
  const encoded = participantsWithEmails
    ? "|MEMBERS:" +
      participantsWithEmails.map((p) => `${p.pseudo}:${p.email}`).join(",")
    : "";
  return `[Groupe:${name}|ID:${groupId}${encoded}]${objet ? " " + objet : ""}`;
}
function extractGroupIdFromSubject(subject) {
  if (!subject) return null;
  const m = subject.match(/\[Groupe:[^|]+\|ID:([^|\]]+)/);
  return m ? m[1] : null;
}
function extractMembersFromSubject(subject) {
  if (!subject) return null;
  const m = subject.match(/\|MEMBERS:([^\]]+)\]/);
  if (!m) return null;
  try {
    return m[1].split(",").map((entry) => {
      const [pseudo, email] = entry.split(":");
      return { pseudo, email };
    });
  } catch {
    return null;
  }
}
function saveGroupsToStorage() {
  try {
    localStorage.setItem("occas_groupes", JSON.stringify(groupStore));
  } catch {}
}
function loadGroupsFromStorage() {
  try {
    const raw = localStorage.getItem("occas_groupes");
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.keys(data).forEach((k) => {
      if (!groupStore[k]) groupStore[k] = data[k];
    });
  } catch {}
}

// ============================================================
// THÈME
// ============================================================
// initTheme() garde le localStorage mais n'a plus besoin du bouton retiré
function initTheme() {
  const html = document.documentElement;
  const saved = localStorage.getItem("occas_theme") || "dark";
  html.setAttribute("data-theme", saved);
}

// ============================================================
// RAIL (sidebar icône collapsible)
// ============================================================
function initRail() {
  const rail = document.getElementById("rail");
  const saved = localStorage.getItem("occas_rail_expanded") === "1";
  if (saved) rail.classList.add("expanded");
  document.getElementById("btnRailToggle")?.addEventListener("click", () => {
    rail.classList.toggle("expanded");
    localStorage.setItem(
      "occas_rail_expanded",
      rail.classList.contains("expanded") ? "1" : "0",
    );
  });
}

// ============================================================
// LOGOUT / USER DISPLAY
// ============================================================
function logout() {
  [...TOKEN_KEYS, ...USER_KEYS].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  window.location.href = "/login-occas.html";
}
function initUserDisplay() {
  const av = document.getElementById("meAvatar");
  const name = document.getElementById("meName");
  if (name) name.textContent = currentUser || "Utilisateur";
  if (av) {
    av.textContent = (currentUser || "?").charAt(0).toUpperCase();
    av.style.background = colorFor(currentUser);
  }
  document.getElementById("btnLogout")?.addEventListener("click", logout);
}

// ============================================================
// MOBILE VIEWS
// ============================================================
function showChatView() {
  if (window.innerWidth <= 760) shell.classList.add("show-chat");
}
function showListView() {
  shell.classList.remove("show-chat");
}
function initMobile() {
  document
    .getElementById("btnBackToList")
    ?.addEventListener("click", showListView);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) shell.classList.remove("show-chat");
  });
}

// ============================================================
// DROPDOWNS génériques
// ============================================================
function bindDropdown(btnId, dropId) {
  const btn = document.getElementById(btnId);
  const drop = document.getElementById(dropId);
  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".new-dropdown, .chat-dropdown").forEach((d) => {
      if (d !== drop) d.classList.add("hidden");
    });
    drop?.classList.toggle("hidden");
  });
}
document.addEventListener("click", () => {
  document
    .querySelectorAll(".new-dropdown, .chat-dropdown")
    .forEach((d) => d.classList.add("hidden"));
});

// ============================================================
// TABS + SEARCH
// ============================================================
function initTabsAndSearch() {
  document.querySelectorAll(".conv-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".conv-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      applyFilter();
    });
  });
  document.getElementById("searchConv")?.addEventListener("input", (e) => {
    const v = e.target.value.toLowerCase();
    document.querySelectorAll(".conv-item").forEach((c) => {
      const key = (c.dataset.user || "").toLowerCase();
      const nm = (
        c.querySelector(".conv-name")?.textContent || ""
      ).toLowerCase();
      c.style.display = key.includes(v) || nm.includes(v) ? "flex" : "none";
    });
  });
}
function applyFilter() {
  const active = document.querySelector(".conv-tab.active");
  if (!active) return;
  const filter = active.dataset.filter;
  document.querySelectorAll(".conv-item").forEach((c) => {
    const key = c.dataset.user || "";
    const isGroup = key.startsWith("groupe__");
    const isArchived = archivedStore.has(key);
    if (filter === "all") c.style.display = "flex";
    else if (filter === "unread")
      c.style.display = c.classList.contains("has-unread") ? "flex" : "none";
    else if (filter === "groups") c.style.display = isGroup ? "flex" : "none";
    else if (filter === "archived")
      c.style.display = isArchived ? "flex" : "none";
  });
}

// ============================================================
// UPLOAD PIÈCES JOINTES
// ============================================================
function initUploadButtons() {
  const inpImg = document.getElementById("inputImages");
  const inpFile = document.getElementById("inputFiles");
  document
    .getElementById("btnAttachImage")
    ?.addEventListener("click", () => inpImg?.click());
  document
    .getElementById("btnAttachFile")
    ?.addEventListener("click", () => inpFile?.click());
  inpImg?.addEventListener("change", (e) => {
    Array.from(e.target.files || []).forEach((f) => addPendingFile(f, "image"));
    inpImg.value = "";
  });
  inpFile?.addEventListener("change", (e) => {
    Array.from(e.target.files || []).forEach((f) => addPendingFile(f, "file"));
    inpFile.value = "";
  });
}
function addPendingFile(file, type) {
  const previewUrl = type === "image" ? URL.createObjectURL(file) : null;
  pendingFiles.push({ file, type, previewUrl });
  renderAttachmentsPreview();
}
function renderAttachmentsPreview() {
  const container = document.getElementById("attachmentsPreview");
  container.innerHTML = "";
  pendingFiles.forEach((entry, idx) => {
    const item = document.createElement("div");
    item.className = "att-chip";
    if (entry.type === "image" && entry.previewUrl) {
      const img = document.createElement("img");
      img.src = entry.previewUrl;
      item.appendChild(img);
    } else {
      const icon = document.createElement("span");
      icon.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
      item.appendChild(icon);
    }
    const nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = entry.file.name;
    item.appendChild(nameEl);
    const rm = document.createElement("span");
    rm.className = "rm";
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      pendingFiles.splice(idx, 1);
      renderAttachmentsPreview();
    });
    item.appendChild(rm);
    container.appendChild(item);
  });
}
async function uploadPendingFiles() {
  if (!pendingFiles.length) return [];
  const results = [];
  const images = pendingFiles.filter((f) => f.type === "image");
  const files = pendingFiles.filter((f) => f.type === "file");

  if (images.length) {
    try {
      const fd = new FormData();
      images.forEach((f) => fd.append("images", f.file));
      const res = await fetch(`${API}/upload-chat-images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.images)
        data.images.forEach((url) =>
          results.push({ type: "image", url, name: "" }),
        );
    } catch (err) {
      console.error("[UPLOAD IMAGES]", err);
    }
  }
  if (files.length) {
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f.file));
      const res = await fetch(`${API}/upload-chat-files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.files) {
        data.files.forEach((f) =>
          results.push({
            type: "file",
            url: f.url,
            name: f.name,
            size: f.size,
          }),
        );
      }
    } catch (err) {
      console.error("[UPLOAD FILES]", err);
    }
  }
  return results;
}

// ============================================================
// CHARGEMENT DES CONVERSATIONS
// ============================================================
async function loadBlockedAndArchived() {
  try {
    const [archRes, blockRes] = await Promise.all([
      fetch(`${API}/conversations/archived`, { headers: authHeaders(false) }),
      fetch(`${API}/users/blocked`, { headers: authHeaders(false) }),
    ]);
    const archived = await archRes.json();
    const blocked = await blockRes.json();
    (archived || []).forEach((k) => archivedStore.add(k));
    (blocked || []).forEach((u) => blockedStore.add(u));
  } catch (err) {
    console.warn("[loadBlockedAndArchived]", err);
  }
}

async function loadAllConversations() {
  try {
    const res = await fetch(`${API}/messages`, { headers: authHeaders(false) });
    const data = await res.json();
    if (!res.ok) {
      showToast("Erreur de récupération des messages", "err");
      return;
    }
    const msgs = Array.isArray(data) ? data : [];
    Object.keys(messagesStore).forEach((k) => delete messagesStore[k]);
    conversationStore.clear();

    msgs.forEach((m) => {
      const groupId = extractGroupIdFromSubject(m.subject);
      if (groupId) {
        if (!groupStore[groupId]) {
          const nameMatch = m.subject.match(/\[Groupe:([^|]+)\|ID:/);
          const name = nameMatch
            ? nameMatch[1]
            : groupId.replace("groupe__", "").replace(/__/g, ", ");
          const members = extractMembersFromSubject(m.subject);
          if (members) {
            members.forEach(({ pseudo, email }) => {
              if (pseudo && email && pseudo !== currentUser)
                userEmailStore[pseudo] = userEmailStore[pseudo] || email;
            });
          }
          const pFromId = groupId.replace("groupe__", "").split("__");
          groupStore[groupId] = { name, participants: pFromId };
          saveGroupsToStorage();
        }
        if (!messagesStore[groupId]) messagesStore[groupId] = [];
        if (!messagesStore[groupId].find((x) => x.id === m.id))
          messagesStore[groupId].push(m);
        conversationStore.add(groupId);
        if (clean(m.receiver) === currentUser && !m.read)
          unreadStore[groupId] = true;
      } else {
        const pseudoNorm =
          clean(m.sender) === currentUser ? clean(m.receiver) : clean(m.sender);
        if (!messagesStore[pseudoNorm]) messagesStore[pseudoNorm] = [];
        messagesStore[pseudoNorm].push(m);
        conversationStore.add(pseudoNorm);
        if (clean(m.receiver) === currentUser && !m.read)
          unreadStore[pseudoNorm] = true;
        receiverIdStore[pseudoNorm] =
          clean(m.sender) === currentUser ? m.receiver_id : m.sender_id;
      }
      const senderNorm = clean(m.sender);
      const receiverNorm = clean(m.receiver);
      if (senderNorm !== currentUser) {
        if (m.senderEmail)
          userEmailStore[senderNorm] = m.senderEmail.trim().toLowerCase();
        receiverIdStore[senderNorm] = m.sender_id;
      }
      if (receiverNorm !== currentUser) {
        if (m.receiverEmail)
          userEmailStore[receiverNorm] = m.receiverEmail.trim().toLowerCase();
        receiverIdStore[receiverNorm] = m.receiver_id;
      }
    });

    loadGroupsFromStorage();
    updateUnreadBadge();
    renderConversationList();
  } catch (err) {
    console.error("[loadAllConversations]", err);
  }
}

function updateUnreadBadge() {
  const count = Object.values(unreadStore).filter(Boolean).length;
  const badge = document.getElementById("unreadBadge");
  if (badge) {
    badge.textContent = count;
    badge.classList.toggle("hidden", count === 0);
  }
}

function renderConversationList() {
  const now = new Date();
  const recent = [];
  const older = [];

  conversationStore.forEach((pseudo) => {
    if (pseudo.startsWith("groupe__")) return;
    const list = messagesStore[pseudo] || [];
    const last = list[list.length - 1];
    if (!last) return;
    const diffH = (now - new Date(last.timestamp)) / 36e5;
    (diffH < 24 ? recent : older).push({ key: pseudo, last, isGroup: false });
  });
  Object.keys(groupStore).forEach((groupId) => {
    const list = messagesStore[groupId] || [];
    const last = list[list.length - 1];
    if (!last) return;
    const diffH = (now - new Date(last.timestamp)) / 36e5;
    (diffH < 24 ? recent : older).push({ key: groupId, last, isGroup: true });
  });

  const sortMode = localStorage.getItem("occas_sort") || "recent";

  const sortFn = (a, b) => {
    // Si le mode "Non lues" est sélectionné,
    // les conversations non lues passent en premier.
    if (sortMode === "unread") {
      const uA = unreadStore[a.key] ? 1 : 0;
      const uB = unreadStore[b.key] ? 1 : 0;

      if (uA !== uB) {
        return uB - uA;
      }
    }

    // À égalité (ou pour "Récentes"/"Anciennes"),
    // on trie par date du dernier message.
    return new Date(b.last.timestamp) - new Date(a.last.timestamp);
  };

  recent.sort(sortFn);
  older.sort(sortFn);

  function renderItem({ key, last, isGroup }) {
    const displayName = isGroup ? groupLabel(key) : key;
    const time = formatRelative(last.timestamp);
    const hasUnread = !!unreadStore[key];
    const preview = (last.body || "").substring(0, 38);
    let avatarHtml;
    if (isGroup && groupStore[key]) {
      const others = groupStore[key].participants
        .filter((p) => p !== currentUser)
        .slice(0, 2);
      avatarHtml = `<div class="conv-avatar-group">${others
        .map(
          (p) =>
            `<div class="sub" style="background:${colorFor(p)}">${p.charAt(0).toUpperCase()}</div>`,
        )
        .join("")}</div>`;
    } else {
      const avatarUrl =
        clean(last.sender) === currentUser
          ? last.receiverAvatar
          : last.senderAvatar;
      const initials =
        key
          .split(/[\s_-]+/)
          .map((w) => w.charAt(0).toUpperCase())
          .slice(0, 2)
          .join("") || key.substring(0, 2).toUpperCase();
      avatarHtml = `<div class="conv-avatar" style="${avatarUrl ? `background-image:url('${avatarUrl}');` : ""}">${!avatarUrl ? initials : ""}<span class="online-dot"></span></div>`;
    }
    const groupPill = isGroup
      ? `<span class="group-pill"><svg viewBox="0 0 24 24" width="9" height="9"><circle cx="9" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><path d="M3 20c0-3 2.7-5 6-5h6c3.3 0 6 2 6 5"/></svg>Groupe</span>`
      : "";
    return `
      <div class="conv-item ${hasUnread ? "has-unread" : ""}" data-user="${key}">
        ${avatarHtml}
        <div class="conv-info">
          <div class="conv-top">
            <span class="conv-name">${displayName} ${groupPill}</span>
            <span class="conv-time">${time}</span>
          </div>
          <div class="conv-preview">${preview}${preview.length >= 38 ? "…" : ""}</div>
        </div>
        <div class="conv-meta">
          ${hasUnread ? `<div class="unread-dot"></div>` : ""}
          <button class="conv-delete" data-user="${key}" title="Supprimer">
            <svg viewBox="0 0 24 24" width="13" height="13"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>`;
  }

  let html = "";
  if (recent.length)
    html +=
      `<div class="conv-section-label">Récentes</div>` +
      recent.map(renderItem).join("");
  if (older.length)
    html +=
      `<div class="conv-section-label">Plus anciennes</div>` +
      older.map(renderItem).join("");
  if (!recent.length && !older.length)
    html = `<div class="conv-empty">Aucune conversation pour l'instant.</div>`;
  conversationsContainer.innerHTML = html;

  document.querySelectorAll(".conv-item").forEach(attachConversationClick);
  document.querySelectorAll(".conv-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const key = btn.dataset.user;
      openConfirm(
        "Supprimer la conversation",
        `Supprimer la conversation avec ${key.startsWith("groupe__") ? groupLabel(key) : key} ?`,
        () => deleteConversation(key),
      );
    });
  });

  if (activeConversationId) {
    document
      .querySelector(`.conv-item[data-user="${activeConversationId}"]`)
      ?.classList.add("active");
  }
  applyFilter();
}

// ============================================================
// SÉLECTION D'UNE CONVERSATION
// ============================================================
function attachConversationClick(item) {
  item.addEventListener("click", async () => {
    document
      .querySelectorAll(".conv-item")
      .forEach((c) => c.classList.remove("active"));
    item.classList.add("active");
    const key = item.dataset.user;
    activeConversationId = key;
    const isGroup = key.startsWith("groupe__");

    unreadStore[key] = false;
    item.classList.remove("has-unread");
    item.querySelector(".unread-dot")?.remove();
    updateUnreadBadge();
    applyFilter();

    document.getElementById("chatEmptyState")?.remove();
    renderChatHeader(key, isGroup);
    renderMessages(key);
    // Le bouton reste toujours visible, il affiche un message d'erreur si ce n'est pas un groupe.
    document
      .getElementById("btnToggleDetails")
      .classList.toggle("is-group", isGroup);
    if (!isGroup) closeDetailsPanel();
    updateBlockLabel();
    updateArchiveLabel();

    if (!isGroup) {
      const otherId = Number(receiverIdStore[key]);
      if (otherId) {
        fetch(`${API}/messages/mark-read`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ otherUserId: otherId }),
        }).catch(() => {});
      }
    }
    showChatView();
  });
}

function renderChatHeader(key, isGroup) {
  const title = document.getElementById("chatTitle");
  const subtitle = document.getElementById("chatSubtitle");
  const wrap = document.getElementById("chatAvatarWrap");

  if (isGroup && groupStore[key]) {
    const g = groupStore[key];
    title.textContent = g.name;
    const others = g.participants.filter((p) => p !== currentUser);
    subtitle.textContent = `${g.participants.length} membres · Conversation de groupe`;
    subtitle.classList.remove("online");
    const av2 = others.slice(0, 2);
    wrap.innerHTML = `<div class="chat-av-group">${av2
      .map(
        (p) =>
          `<div class="sub" style="background:${colorFor(p)}">${p.charAt(0).toUpperCase()}</div>`,
      )
      .join("")}</div>`;
  } else {
    title.textContent = key;
    subtitle.textContent = "Contact";
    subtitle.classList.remove("online");
    wrap.innerHTML = `<div class="chat-av" style="background:${colorFor(key)}">${key.charAt(0).toUpperCase()}</div>`;
  }
}

// ============================================================
// AFFICHAGE DES MESSAGES
// ============================================================
function renderMessages(key) {
  chatMessages.innerHTML = "";
  const isGroup = key.startsWith("groupe__");
  let msgs = messagesStore[key] || [];
  msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (!msgs.length) {
    chatMessages.innerHTML = `
      <div class="chat-empty">
        <div class="ic"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
        <b>Aucun message</b>
        <p>Écrivez le premier message de cette conversation.</p>
      </div>`;
    return;
  }

  let lastDay = "";
  msgs.forEach((msg) => {
    const isMe = clean(msg.sender) === currentUser;
    const senderName = isMe ? "Moi" : msg.sender;
    const avColor = isMe ? "" : colorFor(clean(msg.sender));
    const avatarUrl = msg.senderAvatar;
    const time = msg.timestamp ? formatTime(msg.timestamp) : "";

    const dayLabel = msg.timestamp
      ? new Date(msg.timestamp).toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : "";
    if (dayLabel && dayLabel !== lastDay) {
      const sep = document.createElement("div");
      sep.className = "day-sep";
      sep.innerHTML = `<span>${dayLabel}</span>`;
      chatMessages.appendChild(sep);
      lastDay = dayLabel;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "msg-wrap";
    const letter = senderName ? senderName.charAt(0).toUpperCase() : "?";
    const avStyle = avatarUrl
      ? `background-image:url('${avatarUrl}');background-color:${avColor}`
      : `background:${avColor || colorFor(clean(msg.sender))}`;
    const rowClass = isMe ? "msg-row me" : "msg-row";

    const attachments = (() => {
      if (!msg.attachments) return [];
      if (Array.isArray(msg.attachments)) return msg.attachments;
      try {
        const p = JSON.parse(msg.attachments);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    })();

    let bubbleContent = "";
    if (msg.subject && !msg.subject.startsWith("[Groupe:")) {
      bubbleContent += `<span class="bubble-subject">${msg.subject}</span>`;
    }
    if (msg.body && msg.body.trim() !== " ")
      bubbleContent += escapeHtml(msg.body);
    attachments.forEach((att) => {
      if (att.type === "image") {
        bubbleContent += `<img src="${att.url}" class="bubble-img" data-src="${att.url}" alt="image" />`;
      } else {
        bubbleContent += `
          <a class="bubble-file" href="${att.url}" download="${att.name || "fichier"}" target="_blank">
            <div class="fi"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
            <div><div class="fn">${att.name || "Fichier"}</div><div class="fs">${att.size ? formatBytes(att.size) : ""}</div></div>
          </a>`;
      }
    });

    const senderColor = isGroup && !isMe ? avColor : "var(--txt-3)";
    wrapper.innerHTML = `
      <div class="${rowClass}">
        ${!isMe ? `<div class="msg-av" style="${avStyle}">${!avatarUrl ? letter : ""}</div>` : ""}
        <div class="msg-body">
          ${!isMe && isGroup ? `<div class="msg-sender" style="color:${senderColor}">${senderName}</div>` : ""}
          <div class="msg-content-wrap">
            ${isMe ? `<button class="msg-menu-btn" data-id="${msg.id}"><svg viewBox="0 0 24 24" width="13" height="13"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></button>` : ""}
            <div class="bubble ${isMe ? "me" : "them"}">${bubbleContent}</div>
            ${!isMe ? `<button class="msg-menu-btn" data-id="${msg.id}"><svg viewBox="0 0 24 24" width="13" height="13"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></button>` : ""}
          </div>
          <div class="msg-time">${time}</div>
        </div>
      </div>`;
    chatMessages.appendChild(wrapper);
  });

  chatMessages.querySelectorAll(".msg-menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedMessageId = btn.dataset.id;
      const menu = document.getElementById("msgCtxMenu");
      menu.style.top = `${e.pageY}px`;
      menu.style.left = `${Math.max(0, e.pageX - 160)}px`;
      menu.classList.remove("hidden");
    });
  });
  chatMessages.querySelectorAll(".bubble-img").forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.dataset.src));
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
  renderSharedMedia(key);
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// LIGHTBOX
// ============================================================
function openLightbox(src) {
  document.getElementById("lightboxImg").src = src;
  document.getElementById("lightbox").classList.add("active");
}
function initLightbox() {
  const lb = document.getElementById("lightbox");
  lb.addEventListener("click", () => lb.classList.remove("active"));
  document.getElementById("lightboxClose")?.addEventListener("click", (e) => {
    e.stopPropagation();
    lb.classList.remove("active");
  });
}

// ============================================================
// ENVOI DE MESSAGE
// ============================================================
async function handleSendMessage() {
  const text = messageInput.value.trim();
  const hasPending = pendingFiles.length > 0;
  if (!text && !hasPending) return;
  if (!activeConversationId) return;

  const isGroup = activeConversationId.startsWith("groupe__");
  if (!isGroup && blockedStore.has(activeConversationId)) {
    showToast("Impossible : cet utilisateur est bloqué.", "err");
    return;
  }

  let uploaded = [];
  if (hasPending) {
    uploaded = await uploadPendingFiles();
    pendingFiles = [];
    renderAttachmentsPreview();
  }

  if (isGroup) {
    const group = groupStore[activeConversationId];
    if (!group) return;
    const receivers = group.participants
      .filter((p) => p !== currentUser)
      .map((p) => ({ pseudo: p, email: userEmailStore[p] || "" }));

    const localMsg = {
      id: "local_" + Date.now(),
      sender: currentUser,
      receiver: receivers[0]?.pseudo || "",
      subject: buildGroupSubject(activeConversationId, group.name, ""),
      body: text,
      timestamp: new Date().toISOString(),
      attachments: uploaded,
    };
    if (!messagesStore[activeConversationId])
      messagesStore[activeConversationId] = [];
    messagesStore[activeConversationId].push(localMsg);
    messageInput.value = "";
    autosizeInput();
    renderMessages(activeConversationId);

    try {
      const res = await fetch(`${API}/messages/group`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          groupId: activeConversationId,
          groupName: group.name,
          participants: receivers,
          body: text || " ",
          attachments: uploaded,
        }),
      });
      const data = await res.json();
      if (res.ok && data.failed?.length) {
        showToast(
          `Non délivré à : ${data.failed.join(", ")} (introuvable).`,
          "err",
          4000,
        );
      } else if (!res.ok) {
        showToast(data.error || "Erreur d'envoi au groupe.", "err");
      }
    } catch (err) {
      console.error("[GROUP SEND]", err);
      showToast("Erreur d'envoi au groupe.", "err");
    }
    return;
  }

  const receiverId = Number(receiverIdStore[activeConversationId]);
  const email = userEmailStore[activeConversationId];
  const payload =
    receiverId && !isNaN(receiverId)
      ? { receiverId, body: text || " ", subject: "", attachments: uploaded }
      : {
          pseudo: activeConversationId,
          email,
          body: text || " ",
          subject: "",
          attachments: uploaded,
        };

  if (!receiverId && !email) {
    showToast(
      `Impossible d'envoyer : contact de ${activeConversationId} inconnu`,
      "err",
    );
    return;
  }

  try {
    const res = await fetch(`${API}/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur d'envoi", "err");
      return;
    }
    messageInput.value = "";
    autosizeInput();
    await loadAllConversations();
    activeConversationId && renderMessages(activeConversationId);
    if (activeConversationId)
      document
        .querySelector(`.conv-item[data-user="${activeConversationId}"]`)
        ?.classList.add("active");
  } catch (err) {
    console.error("[SEND]", err);
    showToast("Erreur d'envoi", "err");
  }
}

function autosizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
}

function initComposer() {
  messageInput.addEventListener("input", autosizeInput);
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });
  btnSend.addEventListener("click", handleSendMessage);
}

// ============================================================
// NOUVEAU MESSAGE (popup orange)
// ============================================================
function initNewMsgPopup() {
  const overlay = document.getElementById("newMsgOverlay");
  const open = () => overlay.classList.add("active");
  const close = () => overlay.classList.remove("active");

  document.getElementById("btnOpenNewMsg")?.addEventListener("click", () => {
    document.getElementById("newDropdown")?.classList.add("hidden");
    open();
  });
  document.getElementById("newMsgClose")?.addEventListener("click", close);
  document.getElementById("nmCancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => e.target === overlay && close());

  document.getElementById("nmSend")?.addEventListener("click", async () => {
    const p = document.getElementById("nmPseudo").value.trim().toLowerCase();
    const em = document.getElementById("nmEmail").value.trim().toLowerCase();
    const o = document.getElementById("nmSubject").value.trim();
    const b = document.getElementById("nmBody").value.trim();
    if (!p || !em || !o || !b)
      return showToast("Tous les champs sont obligatoires.", "err");
    if (!isValidEmail(em)) return showToast("Adresse email invalide.", "err");
    try {
      const res = await fetch(`${API}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ pseudo: p, email: em, subject: o, body: b }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || "Erreur", "err");
      await loadAllConversations();
      ["nmPseudo", "nmEmail", "nmSubject", "nmBody"].forEach(
        (id) => (document.getElementById(id).value = ""),
      );
      close();
      showToast("Message envoyé.", "ok");
    } catch (err) {
      showToast("Erreur envoi.", "err");
    }
  });
}

// ============================================================
// NOUVEAU GROUPE (popup rouge)
// ============================================================
function renderGroupParticipants() {
  const container = document.getElementById("grpParticipants");
  container.innerHTML = groupParticipantsDraft
    .map(
      (p, idx) => `
      <span class="p-tag" style="background:${colorFor(p.pseudo)}">
        ${p.pseudo}
        <span class="rm" data-idx="${idx}">×</span>
      </span>`,
    )
    .join("");
  container.querySelectorAll(".rm").forEach((btn) => {
    btn.addEventListener("click", () => {
      groupParticipantsDraft.splice(Number(btn.dataset.idx), 1);
      renderGroupParticipants();
    });
  });
}
function initGroupPopup() {
  const overlay = document.getElementById("groupOverlay");
  const open = () => {
    groupParticipantsDraft = [];
    renderGroupParticipants();
    overlay.classList.add("active");
  };
  const close = () => overlay.classList.remove("active");

  document.getElementById("btnOpenNewGroup")?.addEventListener("click", () => {
    document.getElementById("newDropdown")?.classList.add("hidden");
    open();
  });
  document.getElementById("groupClose")?.addEventListener("click", close);
  document.getElementById("groupCancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => e.target === overlay && close());

  document.getElementById("grpAddBtn")?.addEventListener("click", async () => {
    const pseudo = document
      .getElementById("grpAddPseudo")
      .value.trim()
      .toLowerCase();
    const email = document
      .getElementById("grpAddEmail")
      .value.trim()
      .toLowerCase();
    if (!pseudo || !email) return showToast("Pseudo et email requis.", "err");
    if (!isValidEmail(email)) return showToast("Email invalide.", "err");
    if (groupParticipantsDraft.find((p) => p.pseudo === pseudo))
      return showToast("Déjà ajouté.", "err");
    if (pseudo === currentUser)
      return showToast("Vous êtes automatiquement inclus.", "err");

    const addBtn = document.getElementById("grpAddBtn");
    addBtn.disabled = true;
    try {
      const res = await fetch(`${API}/users/verify`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ pseudo, email }),
      });
      const data = await res.json();
      if (!res.ok || !data.exists) {
        showToast(
          `Aucun compte trouvé pour "${pseudo}" avec cet email.`,
          "err",
        );
        return;
      }
      groupParticipantsDraft.push({
        pseudo: data.username,
        email: data.contact,
      });
      userEmailStore[data.username] = data.contact;
      renderGroupParticipants();
      document.getElementById("grpAddPseudo").value = "";
      document.getElementById("grpAddEmail").value = "";
    } catch (err) {
      console.error("[VERIFY USER]", err);
      showToast("Erreur de vérification du compte.", "err");
    } finally {
      addBtn.disabled = false;
    }
  });

  document.getElementById("groupSend")?.addEventListener("click", async () => {
    const name = document.getElementById("grpName").value.trim();
    const objet = document.getElementById("grpSubject").value.trim();
    const body = document.getElementById("grpBody").value.trim();
    if (!name) return showToast("Donnez un nom au groupe.", "err");
    if (!groupParticipantsDraft.length)
      return showToast("Ajoutez au moins un participant.", "err");
    if (!objet || !body)
      return showToast("Objet et message obligatoires.", "err");

    const allParticipants = [
      currentUser,
      ...groupParticipantsDraft.map((p) => p.pseudo),
    ];
    const groupId = makeGroupId(allParticipants);

    try {
      const res = await fetch(`${API}/messages/group`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          groupId,
          groupName: name,
          participants: groupParticipantsDraft,
          body,
          objet,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Erreur création du groupe.", "err");
        return;
      }
      if (data.failed?.length) {
        showToast(
          `Introuvables, non ajoutés : ${data.failed.join(", ")}`,
          "err",
          4000,
        );
      }

      groupStore[groupId] = { name, participants: allParticipants };
      saveGroupsToStorage();

      ["grpName", "grpSubject", "grpBody"].forEach(
        (id) => (document.getElementById(id).value = ""),
      );
      groupParticipantsDraft = [];
      renderGroupParticipants();
      close();
      await loadAllConversations();
      document.querySelector(`.conv-item[data-user="${groupId}"]`)?.click();
      showToast(
        `Groupe créé — ${data.sentCount}/${data.totalRequested} notifié(s).`,
        "ok",
      );
    } catch (err) {
      console.error("[GROUP INIT]", err);
      showToast("Erreur création du groupe.", "err");
    }
  });
}

// ============================================================
// INVITER (ajout membre à un groupe existant)
// ============================================================
function initInvitePopup() {
  const overlay = document.getElementById("inviteOverlay");
  const open = () => overlay.classList.add("active");
  const close = () => overlay.classList.remove("active");
  document.getElementById("btnInvite")?.addEventListener("click", () => {
    if (!activeConversationId?.startsWith("groupe__")) {
      showToast(
        "Ouvrez d'abord une conversation de groupe pour inviter quelqu'un.",
        "err",
      );
      return;
    }
    open();
  });
  document.getElementById("inviteClose")?.addEventListener("click", close);
  document.getElementById("inviteCancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => e.target === overlay && close());

  document.getElementById("inviteSend")?.addEventListener("click", async () => {
    const pseudo = document
      .getElementById("invPseudo")
      .value.trim()
      .toLowerCase();
    const email = document
      .getElementById("invEmail")
      .value.trim()
      .toLowerCase();
    if (!pseudo || !email) return showToast("Pseudo et email requis.", "err");
    if (!isValidEmail(email)) return showToast("Email invalide.", "err");
    const group = groupStore[activeConversationId];
    if (!group) return;
    if (group.participants.includes(pseudo))
      return showToast("Déjà membre du groupe.", "err");

    try {
      const verifyRes = await fetch(`${API}/users/verify`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ pseudo, email }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.exists) {
        showToast(
          `Aucun compte trouvé pour "${pseudo}" avec cet email.`,
          "err",
        );
        return;
      }

      group.participants.push(verifyData.username);
      userEmailStore[verifyData.username] = verifyData.contact;
      saveGroupsToStorage();

      // Ne reçoit QUE ce message et les suivants — l'historique n'est jamais
      // rétroactivement envoyé, il n'était de toute façon pas adressé à ce membre.
      const res = await fetch(`${API}/messages/group`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          groupId: activeConversationId,
          groupName: group.name,
          participants: [
            { pseudo: verifyData.username, email: verifyData.contact },
          ],
          body: `${currentUser} vous a ajouté au groupe "${group.name}".`,
        }),
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error || "Erreur invitation.", "err");
      else showToast(`${verifyData.username} invité(e) au groupe.`, "ok");
    } catch (err) {
      showToast("Erreur invitation.", "err");
    }
    document.getElementById("invPseudo").value = "";
    document.getElementById("invEmail").value = "";
    close();
    renderChatHeader(activeConversationId, true);
    renderDetailsPanel(activeConversationId);
  });
}

// ============================================================
// PANEL DÉTAILS (groupes uniquement)
// ============================================================
function openDetailsPanel() {
  detailsPanel.classList.remove("hidden");
}
function closeDetailsPanel() {
  detailsPanel.classList.add("hidden");
}
const EMPTY_GROUP_SVG = `<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="17" x2="16" y2="23"/><line x1="16" y1="17" x2="22" y2="23"/></svg>`;

function isGroupMuted(key) {
  try {
    return JSON.parse(
      localStorage.getItem("occas_muted_groups") || "[]",
    ).includes(key);
  } catch {
    return false;
  }
}
function toggleGroupMuted(key) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem("occas_muted_groups") || "[]");
  } catch {}
  const on = list.includes(key);
  list = on ? list.filter((k) => k !== key) : [...list, key];
  localStorage.setItem("occas_muted_groups", JSON.stringify(list));
  return !on;
}

function renderDetailsPanel(key) {
  const avatar = document.getElementById("detailsAvatar");
  if (!key || !key.startsWith("groupe__") || !groupStore[key]) {
    avatar.classList.add("empty");
    avatar.innerHTML = EMPTY_GROUP_SVG;
    document.getElementById("detailsName").textContent =
      "Aucun groupe sélectionné";
    document.getElementById("detailsStatus").textContent = "";
    document.getElementById("membersList").innerHTML =
      `<div class="media-empty">Ouvrez une conversation de groupe pour voir ses participants.</div>`;
    document.getElementById("sharedMedia").innerHTML = "";
    document.getElementById("groupAbout").textContent =
      "Aucun groupe sélectionné pour l'instant.";
    document.getElementById("muteToggle")?.classList.remove("on");
    return;
  }
  const group = groupStore[key];
  avatar.classList.remove("empty");
  avatar.textContent = group.name.charAt(0).toUpperCase();
  document.getElementById("detailsName").textContent = group.name;
  document.getElementById("detailsStatus").textContent =
    `${group.participants.length} membres`;

  const membersList = document.getElementById("membersList");
  membersList.innerHTML = group.participants
    .map(
      (p) => `
      <div class="member-row">
        <div class="av" style="background:${p === currentUser ? "var(--grad)" : colorFor(p)}">${p.charAt(0).toUpperCase()}</div>
        <span>${p === currentUser ? "Vous" : p}</span>
      </div>`,
    )
    .join("");

  document
    .getElementById("muteToggle")
    ?.classList.toggle("on", isGroupMuted(key));
  renderSharedMedia(key);
  document.getElementById("groupAbout").textContent =
    `${group.participants.length} membre(s) dans ce groupe. Toutes les pièces jointes échangées ici sont enregistrées et consultables ci-dessus.`;
}

function initMuteToggle() {
  document.getElementById("btnMuteGroup")?.addEventListener("click", () => {
    if (!activeConversationId?.startsWith("groupe__")) {
      showToast("Sélectionnez un groupe pour gérer ses notifications.", "err");
      return;
    }
    const nowOn = toggleGroupMuted(activeConversationId);
    document.getElementById("muteToggle")?.classList.toggle("on", nowOn);
    showToast(
      nowOn
        ? "Notifications du groupe désactivées."
        : "Notifications du groupe réactivées.",
      "ok",
    );
  });
}
function renderMediaTile(a) {
  return a.type === "image"
    ? `<div class="media-tile"><img src="${a.url}" alt="" /></div>`
    : `<a class="media-tile" href="${a.url}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></a>`;
}

function openAllMediaModal(key) {
  const msgs = messagesStore[key] || [];
  const media = [];
  msgs.forEach((m) => {
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    atts.forEach((a) => media.push(a));
  });
  const overlay = document.createElement("div");
  overlay.className = "overlay active";
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-head">
        <div><h3>Tous les médias et fichiers</h3><span>${media.length} élément(s)</span></div>
        <button class="modal-close" id="allMediaClose">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="shared-media-grid" style="grid-template-columns:repeat(4,1fr)">
          ${media.slice().reverse().map(renderMediaTile).join("") || `<div class="media-empty">Aucun média partagé.</div>`}
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => e.target === overlay && close());
  overlay.querySelector("#allMediaClose")?.addEventListener("click", close);
}

function renderSharedMedia(key) {
  const grid = document.getElementById("sharedMedia");
  if (!grid) return;
  const msgs = messagesStore[key] || [];
  const media = [];
  msgs.forEach((m) => {
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    atts.forEach((a) => media.push(a));
  });
  if (!media.length) {
    grid.innerHTML = `<div class="media-empty">Aucun média partagé.</div>`;
    return;
  }
  const ordered = media.slice().reverse();
  const MAX_SHOWN = 8;
  const shown = ordered.slice(0, MAX_SHOWN);
  const remaining = ordered.length - shown.length;

  grid.innerHTML = shown.map(renderMediaTile).join("");

  if (remaining > 0) {
    const moreTile = document.createElement("button");
    moreTile.type = "button";
    moreTile.className = "media-tile";
    moreTile.style.cssText =
      "font-weight:700;color:var(--orange);cursor:pointer;";
    moreTile.textContent = `+${remaining}`;
    moreTile.addEventListener("click", () => openAllMediaModal(key));
    grid.appendChild(moreTile);
  }
}
function initDetailsPanel() {
  document.getElementById("btnToggleDetails")?.addEventListener("click", () => {
    if (!activeConversationId?.startsWith("groupe__")) {
      showToast(
        "Sélectionnez une conversation de groupe pour voir les participants.",
        "err",
      );
      return;
    }
    if (detailsPanel.classList.contains("hidden")) {
      renderDetailsPanel(activeConversationId);
      openDetailsPanel();
    } else {
      closeDetailsPanel();
    }
  });
  document
    .getElementById("btnCloseDetails")
    ?.addEventListener("click", closeDetailsPanel);

  bindDropdown("btnDetailsMore", "detailsMoreDropdown");
  document
    .getElementById("btnArchiveFromDetails")
    ?.addEventListener("click", () => toggleArchive());
  document
    .getElementById("btnDeleteFromDetails")
    ?.addEventListener("click", () => {
      openConfirm(
        "Quitter le groupe",
        `Quitter et supprimer "${groupLabel(activeConversationId)}" ?`,
        () => deleteConversation(activeConversationId),
      );
    });
}

// ============================================================
// ACTIONS CHAT : ARCHIVER / BLOQUER / SUPPRIMER
// ============================================================
function updateArchiveLabel() {
  const isArchived =
    activeConversationId && archivedStore.has(activeConversationId);
  const label = isArchived ? "Désarchiver" : "Archiver";
  const l1 = document.getElementById("archiveLabel");
  const l2 = document.getElementById("archiveLabel2");
  if (l1) l1.textContent = label;
  if (l2) l2.textContent = label;
}
function updateBlockLabel() {
  const btn = document.getElementById("btnBlock");
  if (!btn || !activeConversationId) return;
  const isGroup = activeConversationId.startsWith("groupe__");
  btn.style.display = isGroup ? "none" : "flex";
  if (isGroup) return;
  const isBlocked = blockedStore.has(activeConversationId);
  document.getElementById("blockLabel").textContent = isBlocked
    ? "Débloquer"
    : "Bloquer";
}
async function toggleArchive() {
  if (!activeConversationId) return;
  document.getElementById("chatMoreDropdown")?.classList.add("hidden");
  document.getElementById("detailsMoreDropdown")?.classList.add("hidden");
  const isArchived = archivedStore.has(activeConversationId);
  try {
    if (isArchived) {
      await fetch(
        `${API}/conversations/archive/${encodeURIComponent(activeConversationId)}`,
        {
          method: "DELETE",
          headers: authHeaders(false),
        },
      );
      archivedStore.delete(activeConversationId);
      showToast("Conversation désarchivée.", "ok");
    } else {
      await fetch(`${API}/conversations/archive`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ conversationKey: activeConversationId }),
      });
      archivedStore.add(activeConversationId);
      showToast("Conversation archivée.", "ok");
    }
    updateArchiveLabel();
    renderConversationList();
  } catch (err) {
    showToast("Erreur.", "err");
  }
}
async function toggleBlock() {
  if (!activeConversationId || activeConversationId.startsWith("groupe__"))
    return;
  document.getElementById("chatMoreDropdown")?.classList.add("hidden");
  const isBlocked = blockedStore.has(activeConversationId);
  if (isBlocked) {
    openConfirm(
      "Débloquer",
      `Débloquer ${activeConversationId} ?`,
      async () => {
        await fetch(
          `${API}/users/block/${encodeURIComponent(activeConversationId)}`,
          { method: "DELETE", headers: authHeaders(false) },
        );
        blockedStore.delete(activeConversationId);
        updateBlockLabel();
        showToast(`${activeConversationId} débloqué.`, "ok");
      },
    );
  } else {
    openConfirm(
      "Bloquer",
      `Bloquer ${activeConversationId} ? Vous ne pourrez plus échanger de messages.`,
      async () => {
        await fetch(`${API}/users/block`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ targetUsername: activeConversationId }),
        });
        blockedStore.add(activeConversationId);
        updateBlockLabel();
        showToast(`${activeConversationId} bloqué.`, "ok");
      },
    );
  }
}
async function deleteConversation(key) {
  try {
    if (key.startsWith("groupe__")) {
      delete groupStore[key];
      delete messagesStore[key];
      conversationStore.delete(key);
      saveGroupsToStorage();
    } else {
      const receiverId = Number(receiverIdStore[key]);
      if (receiverId) {
        await fetch(`${API}/conversations/${receiverId}`, {
          method: "DELETE",
          headers: authHeaders(false),
        });
      }
      delete messagesStore[key];
      conversationStore.delete(key);
    }
    document.querySelector(`.conv-item[data-user="${key}"]`)?.remove();
    if (activeConversationId === key) resetChatZone();
    showToast("Conversation supprimée.", "ok");
  } catch (err) {
    showToast("Erreur suppression.", "err");
  }
}
function resetChatZone() {
  activeConversationId = null;
  chatMessages.innerHTML = `
    <div class="chat-empty" id="chatEmptyState">
      <div class="ic"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
      <b>Aucune conversation sélectionnée</b>
      <p>Choisis une conversation à gauche, ou démarre un nouveau message.</p>
    </div>`;
  document.getElementById("chatTitle").textContent =
    "Sélectionne une conversation";
  document.getElementById("chatSubtitle").textContent = "";
  document.getElementById("chatAvatarWrap").innerHTML =
    `<div class="chat-av" id="chatAvatarDefault">?</div>`;
  document.getElementById("btnToggleDetails").style.display = "none";
  closeDetailsPanel();
}
function initChatActions() {
  bindDropdown("btnChatMore", "chatMoreDropdown");
  document
    .getElementById("btnArchive")
    ?.addEventListener("click", toggleArchive);
  document.getElementById("btnBlock")?.addEventListener("click", toggleBlock);
  document.getElementById("btnDeleteConv")?.addEventListener("click", () => {
    if (!activeConversationId)
      return showToast("Aucune conversation sélectionnée.", "err");
    document.getElementById("chatMoreDropdown")?.classList.add("hidden");
    const isGroup = activeConversationId.startsWith("groupe__");
    openConfirm(
      "Supprimer la conversation",
      `Supprimer la conversation avec ${isGroup ? groupLabel(activeConversationId) : activeConversationId} ?`,
      () => deleteConversation(activeConversationId),
    );
  });
}

// ============================================================
// CONFIRMATION GÉNÉRIQUE
// ============================================================
let confirmCallback = null;
function openConfirm(title, text, callback) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmText").textContent = text;
  confirmCallback = callback;
  document.getElementById("confirmOverlay").classList.add("active");
}
function initConfirmModal() {
  const overlay = document.getElementById("confirmOverlay");
  const close = () => {
    overlay.classList.remove("active");
    confirmCallback = null;
  };
  document.getElementById("confirmClose")?.addEventListener("click", close);
  document.getElementById("confirmCancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => e.target === overlay && close());
  document.getElementById("confirmOk")?.addEventListener("click", async () => {
    const cb = confirmCallback;
    close();
    if (cb) await cb();
  });
}

// ============================================================
// MENU CONTEXTUEL MESSAGE
// ============================================================
function initContextMenu() {
  const menu = document.getElementById("msgCtxMenu");
  menu.addEventListener("click", async (e) => {
    const item = e.target.closest(".ctx-item");
    if (!item) return;
    const action = item.dataset.action;
    const key = activeConversationId;
    if (!key) return menu.classList.add("hidden");
    const msgs = messagesStore[key] || [];
    const msg = msgs.find((m) => String(m.id) === String(selectedMessageId));
    if (!msg) return menu.classList.add("hidden");

    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(msg.body);
      } catch {
        const el = document.createElement("textarea");
        el.value = msg.body;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        el.remove();
      }
      showToast("Message copié.", "ok");
    }
    if (action === "delete") {
      try {
        const idStr = String(msg.id);
        if (!idStr.startsWith("local_") && !isNaN(Number(idStr))) {
          await fetch(`${API}/messages/${msg.id}`, {
            method: "DELETE",
            headers: authHeaders(false),
          });
        }
        messagesStore[key] = msgs.filter((m) => m.id !== msg.id);
        renderMessages(key);
        showToast("Message supprimé.", "ok");
      } catch (err) {
        showToast("Erreur suppression.", "err");
      }
    }
    menu.classList.add("hidden");
  });
  document.addEventListener("click", () => menu.classList.add("hidden"));
}

// ============================================================
// EMOJI PICKER
// ============================================================
function initEmojiPicker() {
  const btn = document.getElementById("btnEmoji");
  const emojis = [
    "😊",
    "😂",
    "❤️",
    "👍",
    "🔥",
    "🎉",
    "🚗",
    "😎",
    "🏁",
    "📎",
    "📅",
    "✅",
    "🙏",
    "💯",
    "🤝",
    "📞",
  ];
  let picker = null;
  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (picker) {
      picker.remove();
      picker = null;
      return;
    }
    picker = document.createElement("div");
    Object.assign(picker.style, {
      position: "absolute",
      bottom: "60px",
      left: "20px",
      background: "var(--conv)",
      border: "1px solid var(--line-2)",
      borderRadius: "14px",
      padding: "12px",
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      width: "220px",
      boxShadow: "var(--shadow)",
      zIndex: "500",
    });
    emojis.forEach((em) => {
      const sp = document.createElement("button");
      sp.textContent = em;
      Object.assign(sp.style, { fontSize: "20px", padding: "3px" });
      sp.addEventListener("click", () => {
        messageInput.value += em;
        messageInput.focus();
        autosizeInput();
        picker?.remove();
        picker = null;
      });
      picker.appendChild(sp);
    });
    document.querySelector(".composer-zone")?.appendChild(picker);
    document.addEventListener(
      "click",
      () => {
        picker?.remove();
        picker = null;
      },
      { once: true },
    );
  });
}

// ============================================================
// MENTIONS
// ============================================================
function initMention() {
  document.getElementById("btnMention")?.addEventListener("click", () => {
    if (!activeConversationId) return;
    const isGroup = activeConversationId.startsWith("groupe__");
    if (!isGroup) {
      insertMention(`@${activeConversationId} `);
    } else {
      openMentionPopup();
    }
  });
  document.getElementById("mentionClose")?.addEventListener("click", () => {
    document.getElementById("mentionOverlay").classList.remove("active");
  });
  document
    .getElementById("btnValidateMentions")
    ?.addEventListener("click", () => {
      if (selectedMentions.size > 0) {
        const text =
          Array.from(selectedMentions)
            .map((p) => `@${p}`)
            .join(", ") + " ";
        insertMention(text);
      }
      document.getElementById("mentionOverlay").classList.remove("active");
    });
}
function openMentionPopup() {
  const list = document.getElementById("mentionList");
  const group = groupStore[activeConversationId];
  selectedMentions.clear();
  list.innerHTML = group.participants
    .filter((p) => p !== currentUser)
    .map(
      (p) => `
      <div class="mention-item" data-p="${p}">
        <div class="mention-av" style="background:${colorFor(p)}">${p.charAt(0).toUpperCase()}</div>
        <span>@${p}</span>
        <div class="mention-check"></div>
      </div>`,
    )
    .join("");
  list.querySelectorAll(".mention-item").forEach((el) => {
    el.addEventListener("click", () => {
      const p = el.dataset.p;
      if (selectedMentions.has(p)) {
        selectedMentions.delete(p);
        el.classList.remove("selected");
      } else {
        selectedMentions.add(p);
        el.classList.add("selected");
      }
    });
  });
  document.getElementById("mentionOverlay").classList.add("active");
}
function insertMention(text) {
  const start = messageInput.selectionStart;
  const end = messageInput.selectionEnd;
  messageInput.value =
    messageInput.value.substring(0, start) +
    text +
    messageInput.value.substring(end);
  messageInput.focus();
  autosizeInput();
}

function initRailNewMessage() {
  const arrowBtn = document.getElementById("railNewMsgArrow");
  const dropdown = document.getElementById("railNewDropdown");
  document.getElementById("railNewMsgMain")?.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    document.getElementById("newMsgOverlay").classList.add("active");
  });
  arrowBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
  });
  document.getElementById("railBtnDirect")?.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    document.getElementById("newMsgOverlay").classList.add("active");
  });
  document.getElementById("railBtnGroup")?.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    document.getElementById("groupOverlay").classList.add("active");
    groupParticipantsDraft = [];
    renderGroupParticipants();
  });
}

function initConvSettingsPopover() {
  bindDropdown("btnConvSettings", "convSettingsDropdown");

  document.querySelectorAll(".sort-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      localStorage.setItem("occas_sort", btn.dataset.sort);
      document
        .querySelectorAll(".sort-opt")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderConversationList();
    });
  });
  const savedSort = localStorage.getItem("occas_sort") || "recent";
  document
    .querySelector(`.sort-opt[data-sort="${savedSort}"]`)
    ?.classList.add("active");

  document
    .getElementById("btnMarkAllRead")
    ?.addEventListener("click", async () => {
      document.getElementById("convSettingsDropdown")?.classList.add("hidden");
      const ids = [...new Set(Object.values(receiverIdStore).filter(Boolean))];
      await Promise.all(
        ids.map((id) =>
          fetch(`${API}/messages/mark-read`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ otherUserId: Number(id) }),
          }).catch(() => {}),
        ),
      );
      Object.keys(unreadStore).forEach((k) => (unreadStore[k] = false));
      updateUnreadBadge();
      renderConversationList();
      showToast("Toutes les conversations sont marquées comme lues.", "ok");
    });

  const compactBtn = document.getElementById("btnToggleCompact");
  const compactLabel = document.getElementById("compactLabel");
  const applyCompact = (on) => {
    conversationsContainer.classList.toggle("compact", on);
    compactLabel.textContent = on ? "Vue confortable" : "Vue compacte";
  };
  const savedCompact = localStorage.getItem("occas_compact") === "1";
  applyCompact(savedCompact);
  compactBtn?.addEventListener("click", () => {
    const on = !conversationsContainer.classList.contains("compact");
    applyCompact(on);
    localStorage.setItem("occas_compact", on ? "1" : "0");
  });
}

function initHeaderExtras() {
  document.getElementById("btnHeaderTheme")?.addEventListener("click", () => {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("occas_theme", next);
  });
  document
    .getElementById("btnCall")
    ?.addEventListener("click", () =>
      showToast("Les appels arrivent bientôt.", "info"),
    );
  document
    .getElementById("btnVideoCall")
    ?.addEventListener("click", () =>
      showToast("L'appel vidéo arrive bientôt.", "info"),
    );
  // Le toggle du panel "Détails du groupe" est géré exclusivement par
  // initDetailsPanel() — un seul écouteur, plus de conflit ouverture/fermeture.
}

const QUICK_REPLIES = [
  "Le véhicule est-il toujours disponible ?",
  "Possible de faire une contre-visite ?",
  "Dernier prix ?",
  "Contrôle technique à jour ?",
  "Je suis disponible ce week-end.",
];
function renderQuickReplies() {
  const track = document.getElementById("quickReplies");
  const prev = document.getElementById("qrPrev");
  const next = document.getElementById("qrNext");
  if (!track) return;
  track.innerHTML = QUICK_REPLIES.map(
    (t) => `<button class="quick-reply-chip">${t}</button>`,
  ).join("");
  track.querySelectorAll(".quick-reply-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      messageInput.value = messageInput.value
        ? messageInput.value.trim() + " " + chip.textContent
        : chip.textContent;
      messageInput.focus();
      autosizeInput();
    });
  });

  const updateNav = () => {
    const max = track.scrollWidth - track.clientWidth;
    prev.classList.toggle("visible", track.scrollLeft > 4);
    next.classList.toggle("visible", track.scrollLeft < max - 4);
  };
  track.addEventListener("scroll", updateNav);
  prev?.addEventListener("click", () =>
    track.scrollBy({ left: -180, behavior: "smooth" }),
  );
  next?.addEventListener("click", () =>
    track.scrollBy({ left: 180, behavior: "smooth" }),
  );
  requestAnimationFrame(updateNav);
  window.addEventListener("resize", updateNav);
}
// ============================================================
// BOOTSTRAP
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  const auth = loadAuth();
  if (!auth || !authToken) {
    showToast("Vous devez être connecté.", "err", 4000);
    return;
  }

  initTheme();
  initRail();
  initUserDisplay();
  initMobile();
  initTabsAndSearch();
  initConvSettingsPopover();
  initMuteToggle();
  initHeaderExtras();
  initUploadButtons();
  initRailNewMessage();
  initComposer();
  bindDropdown("btnNewDropdown", "newDropdown");
  initNewMsgPopup();
  initGroupPopup();
  initInvitePopup();
  initDetailsPanel();
  initChatActions();
  initConfirmModal();
  initContextMenu();
  renderQuickReplies();
  initLightbox();
  initEmojiPicker();
  initMention();

  await loadBlockedAndArchived();
  await loadAllConversations();
});
