// ============================================================
// MESSAGERIE.JS — AiGENT Premium v3
// Toutes fonctionnalités originales + design boosté
// ============================================================

import { injectTimeline } from "./transactionTimeline.js";

// ── USER COURANT ──
let currentUser = "";
try {
  const rawUser = localStorage.getItem("agent_user");
  if (rawUser) {
    currentUser = JSON.parse(rawUser)?.username?.toLowerCase() || "";
  }
} catch (err) {
  console.warn("[AUTH] Erreur lecture user local", err);
}

// ── STORES ──
const messagesStore = {};
const conversationStore = new Set();
const userEmailStore = {};
const receiverIdStore = {};
const unreadStore = {};
const groupeStore = {}; // groupeId → { participants, name }

let activeConversationId = null;
let pendingFiles = []; // [{ file, type:'image'|'file', previewUrl }]
let selectedMessageId = null;

// ── COULEURS CORRESPONDANTS ──
const SOLID_COLORS = [
  "#7c3aed",
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];
const userColorIndexMap = {};
let colorIndexCounter = 0;

function getUserSolidColor(username) {
  if (userColorIndexMap[username] === undefined) {
    userColorIndexMap[username] = colorIndexCounter % SOLID_COLORS.length;
    colorIndexCounter++;
  }
  return SOLID_COLORS[userColorIndexMap[username]];
}

// ── CACHE DOM ──
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const appMain = document.getElementById("appMain");

// ============================================================
// UTILITAIRES
// ============================================================
function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatRelativeDate(dateString) {
  const d = new Date(dateString);
  const now = new Date();
  const diff = (now - d) / (1000 * 60 * 60);
  if (diff < 24)
    return d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (diff < 48) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "short" });
}
function getAuthToken() {
  try {
    return JSON.parse(localStorage.getItem("agent_user"))?.token || null;
  } catch {
    return null;
  }
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " o";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
  return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
}
function makeGroupeId(participants) {
  return "groupe__" + [...participants].sort().join("__");
}
function groupLabel(groupeId) {
  const g = groupeStore[groupeId];
  return g ? g.name : groupeId.replace("groupe__", "").replace(/__/g, ", ");
}
function buildGroupeSubject(
  groupeId,
  nomGroupe,
  objet,
  participantsWithEmails,
) {
  const participantsEncoded = participantsWithEmails
    ? "|MEMBERS:" +
      participantsWithEmails.map((p) => `${p.pseudo}:${p.email}`).join(",")
    : "";
  return `[Groupe:${nomGroupe}|ID:${groupeId}${participantsEncoded}]${objet ? " " + objet : ""}`;
}
function extractGroupeIdFromSubject(subject) {
  if (!subject) return null;
  const match = subject.match(/\[Groupe:[^|]+\|ID:([^|\]]+)/);
  return match ? match[1] : null;
}
function extractMembersFromSubject(subject) {
  if (!subject) return null;
  const match = subject.match(/\|MEMBERS:([^\]]+)\]/);
  if (!match) return null;
  try {
    return match[1].split(",").map((entry) => {
      const [pseudo, email] = entry.split(":");
      return { pseudo, email };
    });
  } catch {
    return null;
  }
}
function formatAudioDuration(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function buildAudioBubble(url, duration, isMe) {
  const id = "ap_" + Math.random().toString(36).slice(2, 8);
  // On injecte un mini player avec waveform statique + bouton play
  return `
    <div class="audio-bubble" id="${id}" data-url="${url}" data-dur="${duration || ""}">
      <button class="audio-play-btn" onclick="toggleAudioPlay('${id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isMe ? "#fff" : "var(--brand)"}">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </button>
      <div class="audio-waveform-static">
        ${Array.from({ length: 24 }, (_, i) => {
          const h = 20 + Math.sin(i * 0.7) * 10 + Math.random() * 12;
          return `<div class="awb" style="height:${Math.round(h)}px"></div>`;
        }).join("")}
      </div>
      <span class="audio-dur">${duration || ""}</span>
      <audio id="aud_${id}" src="${url}" preload="none" style="display:none"></audio>
    </div>`;
}
window.toggleAudioPlay = function (bubbleId) {
  const wrap = document.getElementById(bubbleId);
  if (!wrap) return;
  const audio = document.getElementById("aud_" + bubbleId);
  const btn = wrap.querySelector(".audio-play-btn svg");
  if (!audio) return;

  if (audio.paused) {
    // Pauser tous les autres audios
    document.querySelectorAll(".audio-bubble audio").forEach((a) => {
      if (a !== audio) a.pause();
    });
    audio.play();
    // Icône pause
    btn.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;

    // Avancement sur la waveform (colorier les barres)
    audio.ontimeupdate = () => {
      const pct = audio.duration ? audio.currentTime / audio.duration : 0;
      const bars = wrap.querySelectorAll(".awb");
      bars.forEach((b, i) => {
        b.classList.toggle("awb--played", i / bars.length < pct);
      });
      // Mettre à jour le timer
      const durEl = wrap.querySelector(".audio-dur");
      if (durEl) durEl.textContent = formatAudioDuration(audio.currentTime);
    };
    audio.onended = () => {
      btn.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
      const durEl = wrap.querySelector(".audio-dur");
      if (durEl) durEl.textContent = wrap.dataset.dur;
      wrap
        .querySelectorAll(".awb")
        .forEach((b) => b.classList.remove("awb--played"));
    };
  } else {
    audio.pause();
    btn.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
  }
};
// ============================================================
// THÈME
// ============================================================
function initTheme() {
  const themeButtons = document.querySelectorAll(
    "#btn-theme, .btn-theme-toggle",
  );
  const html = document.documentElement;

  const applyTheme = (theme) => {
    html.setAttribute("data-theme", theme);
    localStorage.setItem("aigent_theme", theme);
  };

  const saved = localStorage.getItem("aigent_theme") || "light";
  applyTheme(saved);

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const current = html.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
    });
  });
}

// ============================================================
// DÉCONNEXION
// ============================================================
function logout() {
  localStorage.removeItem("agent_user");
  window.location.href = "index.html";
}

// ============================================================
// UTILISATEUR CONNECTÉ — affichage sidebar
// ============================================================
function initUserDisplay() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) return;
    const user = JSON.parse(raw);
    const name = user.username || "Utilisateur";
    const email = user.email || "";
    const sbName = document.getElementById("sb-user-name");
    const sbEmail = document.getElementById("sb-user-email");
    const sbAv = document.getElementById("sb-user-avatar");
    if (sbName) sbName.textContent = name;
    if (sbEmail) sbEmail.textContent = email;
    if (sbAv) sbAv.textContent = name.charAt(0).toUpperCase();
  } catch {}
}

// ============================================================
// SIDEBAR — COLLAPSE
// ============================================================
function initSidebarCollapse() {
  const sidebar = document.getElementById("sidebar");
  const btn = document.getElementById("btnCollapseSidebar");
  if (!sidebar || !btn) return;
  const savedState = localStorage.getItem("aigent_sidebar_collapsed");
  if (savedState === "1") sidebar.classList.add("collapsed");

  btn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    localStorage.setItem(
      "aigent_sidebar_collapsed",
      sidebar.classList.contains("collapsed") ? "1" : "0",
    );
  });
}

// ============================================================
// MOBILE — show/hide chat panel
// ============================================================
function showChatView() {
  if (window.innerWidth <= 640 && appMain) appMain.classList.add("show-chat");
}
function showListView() {
  if (appMain) appMain.classList.remove("show-chat");
}
function initMobileViews() {
  document
    .getElementById("btn-back-to-list")
    ?.addEventListener("click", showListView);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 640) appMain?.classList.remove("show-chat");
  });
}

// ============================================================
// BADGES
// ============================================================
function updateGlobalUnread() {
  const count = Object.values(unreadStore).filter(Boolean).length;
  const badge = document.getElementById("unread-count-tab");
  const sbBadge = document.getElementById("sb-unread-badge");
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-block" : "none";
  }
  if (sbBadge) {
    sbBadge.textContent = count;
    sbBadge.style.display = count > 0 ? "inline-block" : "none";
  }
}

// ============================================================
// TABS
// ============================================================
function initTabs() {
  document.querySelectorAll(".conv-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".conv-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      applyTabFilter();
    });
  });
}
function applyTabFilter() {
  const activeTab = document.querySelector(".conv-tab.active");
  if (!activeTab) return;
  const filter = activeTab.dataset.filter;

  document.querySelectorAll(".conversation").forEach((c) => {
    const key = c.dataset.user || "";
    const isGroupe = key.startsWith("groupe__");
    const isArchived = archivedStore.has(key);

    if (filter === "all") {
      // "Tous" = tout afficher, archivés inclus (comme Groupes apparaît dans Tous)
      c.style.display = "flex";
    } else if (filter === "unread") {
      c.style.display = c.classList.contains("has-unread") ? "flex" : "none";
    } else if (filter === "groupes") {
      c.style.display = isGroupe ? "flex" : "none";
    } else if (filter === "archived") {
      c.style.display = isArchived ? "flex" : "none";
    }
  });
}

// ============================================================
// RECHERCHE
// ============================================================
function initSearch() {
  const inp = document.getElementById("search-conversations");
  inp?.addEventListener("input", () => {
    const v = inp.value.toLowerCase();
    document.querySelectorAll(".conversation").forEach((c) => {
      c.style.display = (c.dataset.user || "").toLowerCase().includes(v)
        ? "flex"
        : "none";
    });
  });
}

// ============================================================
// UPLOAD — BOUTONS
// ============================================================
function initUploadButtons() {
  const btnImg = document.getElementById("btn-upload-image");
  const btnFile = document.getElementById("btn-upload-file");
  const inpImg = document.getElementById("file-input-images");
  const inpFile = document.getElementById("file-input-attachments");

  btnImg?.addEventListener("click", (e) => {
    e.preventDefault();
    inpImg?.click();
  });
  btnFile?.addEventListener("click", (e) => {
    e.preventDefault();
    inpFile?.click();
  });

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
  const container = document.getElementById("attachments-preview");
  if (!container) return;
  container.innerHTML = "";
  pendingFiles.forEach((entry, idx) => {
    const item = document.createElement("div");
    item.className = "att-preview-item";
    if (entry.type === "image" && entry.previewUrl) {
      const img = document.createElement("img");
      img.src = entry.previewUrl;
      img.className = "att-preview-thumb";
      item.appendChild(img);
    } else {
      const icon = document.createElement("span");
      icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
      item.appendChild(icon);
    }
    const nameEl = document.createElement("span");
    nameEl.className = "att-preview-name";
    nameEl.textContent = entry.file.name;
    item.appendChild(nameEl);

    const rm = document.createElement("span");
    rm.className = "att-preview-remove";
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
  const token = getAuthToken();
  const results = [];
  const images = pendingFiles.filter((f) => f.type === "image");
  const files = pendingFiles.filter((f) => f.type === "file");

  if (images.length) {
    try {
      const formData = new FormData();
      images.forEach((f) => formData.append("images", f.file));
      const res = await fetch("/api/upload-imagesbien", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
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
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f.file));
      const res = await fetch("/api/upload-files", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.files)
          data.files.forEach((f) =>
            results.push({
              type: "file",
              url: f.url,
              name: f.name,
              size: f.size,
            }),
          );
      } else {
        files.forEach((f) =>
          results.push({
            type: "file",
            url: URL.createObjectURL(f.file),
            name: f.file.name,
            size: f.file.size,
          }),
        );
      }
    } catch (err) {
      console.error("[UPLOAD FILES]", err);
      files.forEach((f) =>
        results.push({
          type: "file",
          url: URL.createObjectURL(f.file),
          name: f.file.name,
          size: f.file.size,
        }),
      );
    }
  }
  return results;
}

// ============================================================
// DROPDOWN NOUVEAU MESSAGE (sidebar)
// ============================================================
function initNewMsgDropdown() {
  const chevron = document.getElementById("btnNewMsgDropdown");
  const dropdown = document.getElementById("newMsgDropdown");
  chevron?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle("hidden");
  });
  document.addEventListener("click", () => dropdown?.classList.add("hidden"));
}

// ============================================================
// HEADER CHAT — dropdown "plus"
// ============================================================
function initChatHeaderDropdown() {
  const btn = document.getElementById("chatMoreBtn");
  const dropdown = document.getElementById("chatMoreDropdown");
  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle("hidden");
  });
  document.addEventListener("click", () => dropdown?.classList.add("hidden"));
}

// ============================================================
// CONVERSATION — CLICK
// ============================================================
function attachConversationClick(convo) {
  convo.addEventListener("click", async () => {
    document
      .querySelectorAll(".conversation")
      .forEach((c) => c.classList.remove("active"));
    convo.classList.add("active");

    const conversationKey = convo.dataset.user;
    activeConversationId = conversationKey;
    const isGroupe = conversationKey.startsWith("groupe__");

    unreadStore[conversationKey] = false;
    convo.querySelector(".conv-unread-dot")?.remove();
    convo.classList.remove("has-unread");
    updateGlobalUnread();
    applyTabFilter();

    // Titre header
    const chatTitleEl = document.getElementById("chat-with");
    if (chatTitleEl)
      chatTitleEl.textContent = isGroupe
        ? groupLabel(conversationKey)
        : conversationKey;

    // Members count + participants pills
    const membersCountEl = document.getElementById("chatMembersCount");
    const participantsBar = document.getElementById("participants-bar");
    const chatStatusEl = document.getElementById("chat-status");

    if (isGroupe && groupeStore[conversationKey]) {
      const groupe = groupeStore[conversationKey];
      const others = groupe.participants.filter((p) => p !== currentUser);

      if (membersCountEl) {
        membersCountEl.textContent = `${groupe.participants.length} membres`;
        membersCountEl.style.display = "inline";
      }
      if (participantsBar) {
        participantsBar.style.display = "flex";
        participantsBar.innerHTML =
          others
            .slice(0, 3)
            .map(
              (p) =>
                `<span class="participant-pill" style="background:${getUserSolidColor(p)}">${p.charAt(0).toUpperCase()}${p.slice(1, 4)}</span>`,
            )
            .join("") +
          (others.length > 3
            ? `<span class="participant-pill" style="background:#6b7280">+${others.length - 3}</span>`
            : "");
      }
      if (chatStatusEl) {
        chatStatusEl.textContent = "";
        chatStatusEl.className = "chat-status";
      }

      // Avatar groupe
      _setGroupeAvatar(conversationKey);
    } else {
      if (membersCountEl) {
        membersCountEl.textContent = "";
        membersCountEl.style.display = "none";
      }
      if (participantsBar) {
        participantsBar.style.display = "none";
        participantsBar.innerHTML = "";
      }
      _setSingleAvatar(conversationKey);
    }

    // Empty state
    document.getElementById("chat-empty-state")?.remove?.();

    await loadConversation(conversationKey);
    // À la fin du handler click dans attachConversationClick, avant showChatView() :
    updateBlockBtnLabel();
    showChatView();
  });
}

function _setGroupeAvatar(conversationKey) {
  const wrap = document.getElementById("chatAvatarWrap");
  if (!wrap) return;
  const others = (groupeStore[conversationKey]?.participants || [])
    .filter((p) => p !== currentUser)
    .slice(0, 2);
  wrap.innerHTML = `<div class="chat-av-group">${others
    .map(
      (p) =>
        `<div class="av-sub" style="background:${getUserSolidColor(p)}">${p.charAt(0).toUpperCase()}</div>`,
    )
    .join("")}</div>`;
}
function _setSingleAvatar(conversationKey) {
  const wrap = document.getElementById("chatAvatarWrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="chat-av" id="chat-avatar">${conversationKey.charAt(0).toUpperCase()}</div>`;
}

// ============================================================
// CHARGEMENT DE TOUTES LES CONVERSATIONS
// ============================================================
async function loadAllConversations() {
  try {
    const token = getAuthToken();
    if (!token) {
      alert("Vous devez être connecté.");
      return;
    }

    const res = await fetch("/api/messages", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      alert("Erreur récupération messages.");
      return;
    }

    const msgs = Array.isArray(data) ? data : [];

    Object.keys(messagesStore).forEach((k) => delete messagesStore[k]);
    conversationStore.clear();

    msgs.forEach((m) => {
      const groupeId = extractGroupeIdFromSubject(m.subject);

      if (groupeId) {
        if (!groupeStore[groupeId]) {
          const nameMatch = m.subject.match(/\[Groupe:([^|]+)\|ID:/);
          const nomGroupe = nameMatch
            ? nameMatch[1]
            : groupeId.replace("groupe__", "").replace(/__/g, ", ");
          const members = extractMembersFromSubject(m.subject);
          if (members)
            members.forEach(({ pseudo, email }) => {
              if (pseudo && email && pseudo !== currentUser)
                userEmailStore[pseudo] = userEmailStore[pseudo] || email;
            });
          const pFromId = groupeId.replace("groupe__", "").split("__");
          groupeStore[groupeId] = { name: nomGroupe, participants: pFromId };
          saveGroupesToStorage();
        }
        if (!messagesStore[groupeId]) messagesStore[groupeId] = [];
        if (!messagesStore[groupeId].find((x) => x.id === m.id))
          messagesStore[groupeId].push(m);
        conversationStore.add(groupeId);
        if (m.receiver?.toLowerCase() === currentUser && !m.read)
          unreadStore[groupeId] = true;
      } else {
        const pseudoNorm =
          m.sender.trim().toLowerCase() === currentUser
            ? m.receiver.trim().toLowerCase()
            : m.sender.trim().toLowerCase();
        if (!messagesStore[pseudoNorm]) messagesStore[pseudoNorm] = [];
        messagesStore[pseudoNorm].push(m);
        conversationStore.add(pseudoNorm);
        if (m.receiver?.toLowerCase() === currentUser && !m.read)
          unreadStore[pseudoNorm] = true;
        if (m.senderEmail)
          userEmailStore[pseudoNorm] = m.senderEmail.trim().toLowerCase();
        receiverIdStore[pseudoNorm] =
          m.sender.trim().toLowerCase() === currentUser
            ? m.receiver_id
            : m.sender_id;
      }

      // Store emails & receiverIds pour tous les participants
      const senderNorm = m.sender.trim().toLowerCase();
      const receiverNorm = m.receiver.trim().toLowerCase();
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

    loadGroupesFromStorage();
    updateGlobalUnread();

    const now = new Date();
    const recentes = [];
    const anciennes = [];

    conversationStore.forEach((pseudo) => {
      if (pseudo.startsWith("groupe__")) return;
      const mList = messagesStore[pseudo] || [];
      const lastMsg = mList[mList.length - 1];
      if (!lastMsg) return;
      const diffH = (now - new Date(lastMsg.timestamp)) / (1000 * 60 * 60);
      (diffH < 24 ? recentes : anciennes).push({
        pseudo,
        lastMsg,
        isGroupe: false,
      });
    });
    Object.keys(groupeStore).forEach((groupeId) => {
      const mList = messagesStore[groupeId] || [];
      const lastMsg = mList[mList.length - 1];
      if (!lastMsg) return;
      const diffH = (now - new Date(lastMsg.timestamp)) / (1000 * 60 * 60);
      (diffH < 24 ? recentes : anciennes).push({
        pseudo: groupeId,
        lastMsg,
        isGroupe: true,
      });
    });

    // Tri par date décroissante
    const sortDesc = (a, b) =>
      new Date(b.lastMsg.timestamp) - new Date(a.lastMsg.timestamp);
    recentes.sort(sortDesc);
    anciennes.sort(sortDesc);

    const container = document.getElementById("conversations-container");
    if (!container) return;

    function renderSectionLabel(title) {
      return `<div class="conv-section-label">${title}</div>`;
    }
    function renderConvItem({ pseudo, lastMsg, isGroupe }) {
      const displayName = isGroupe ? groupLabel(pseudo) : pseudo;
      const time = formatRelativeDate(lastMsg.timestamp);
      const hasUnread = !!unreadStore[pseudo];
      const bodyPreview = (lastMsg.body || "").substring(0, 42);

      let avatarHtml;
      if (isGroupe && groupeStore[pseudo]) {
        const others = groupeStore[pseudo].participants
          .filter((p) => p !== currentUser)
          .slice(0, 2);
        avatarHtml = `<div class="conv-avatar-group">${others
          .map(
            (p) =>
              `<div class="av-sub" style="background:${getUserSolidColor(p)}">${p.charAt(0).toUpperCase()}</div>`,
          )
          .join("")}</div>`;
      } else {
        const avatarUrl =
          lastMsg.sender.trim().toLowerCase() === currentUser
            ? lastMsg.receiverAvatar
            : lastMsg.senderAvatar;
        avatarHtml = `<div class="conv-avatar" style="${avatarUrl ? `background-image:url('${avatarUrl}');` : ""}background-color:${getUserSolidColor(pseudo)}">${!avatarUrl ? pseudo.charAt(0).toUpperCase() : ""}</div>`;
      }

      const pilleGroupe = isGroupe
        ? `<span class="conv-groupe-pill"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><path d="M3 20c0-3 2.7-5 6-5h6c3.3 0 6 2 6 5"/></svg> Groupe</span>`
        : "";

      return `
      <div class="conversation ${hasUnread ? "has-unread" : ""} ${archivedStore.has(pseudo) ? "is-archived" : ""}" data-user="${pseudo}">
          ${avatarHtml}
          <div class="conv-info">
            <div class="conv-top">
              <span class="conv-name">${displayName} ${pilleGroupe}</span>
              <span class="conv-time">${time}</span>
            </div>
            <div class="conv-preview">${bodyPreview}${bodyPreview.length >= 42 ? "…" : ""}</div>
          </div>
          <div class="conv-meta">
            ${hasUnread ? `<div class="conv-unread-dot"></div>` : ""}
            <button class="conv-delete-btn" data-user="${pseudo}" title="Supprimer" aria-label="Supprimer la conversation">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
            </button>
          </div>
        </div>`;
    }

    let html = "";
    if (recentes.length)
      html +=
        renderSectionLabel("Épinglées") + recentes.map(renderConvItem).join("");
    if (anciennes.length)
      html +=
        renderSectionLabel("Récentes") + anciennes.map(renderConvItem).join("");
    container.innerHTML = html;

    document.querySelectorAll(".conversation").forEach(attachConversationClick);

    // Boutons de suppression
    document.querySelectorAll(".conv-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const pseudo = btn.dataset.user;
        if (
          !confirm(
            `Supprimer la conversation avec ${pseudo.startsWith("groupe__") ? groupLabel(pseudo) : pseudo} ?`,
          )
        )
          return;
        await deleteConversation(pseudo);
      });
    });

    // Ré-activer la convo courante visuellement
    if (activeConversationId) {
      document
        .querySelector(`.conversation[data-user="${activeConversationId}"]`)
        ?.classList.add("active");
    }

    applyTabFilter();
  } catch (err) {
    console.error("[ERROR] loadAllConversations:", err);
  }
}

async function deleteConversation(pseudo) {
  try {
    const tkn = getAuthToken();
    if (!tkn) throw new Error("Token manquant");

    if (pseudo.startsWith("groupe__")) {
      delete groupeStore[pseudo];
      delete messagesStore[pseudo];
      conversationStore.delete(pseudo);
      saveGroupesToStorage();
    } else {
      const receiverId = Number(receiverIdStore[pseudo]);
      if (!receiverId) {
        alert("Erreur : utilisateur introuvable");
        return;
      }
      await fetch(`/api/conversations/${receiverId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tkn}` },
      });
      delete messagesStore[pseudo];
      conversationStore.delete(pseudo);
    }

    document.querySelector(`.conversation[data-user='${pseudo}']`)?.remove();
    if (activeConversationId === pseudo) resetChatZone();
  } catch (err) {
    console.error("[DELETE CONV]", err);
    alert("Erreur suppression");
  }
}

function resetChatZone() {
  activeConversationId = null;
  if (chatBox) {
    chatBox.innerHTML = `
      <div class="chat-empty-state" id="chat-empty-state">
        <div class="ces-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <h3>Aucune conversation sélectionnée</h3>
        <p>Choisis une conversation à gauche ou démarre-en une nouvelle.</p>
      </div>`;
  }
  const titleEl = document.getElementById("chat-with");
  if (titleEl) titleEl.textContent = "Sélectionne une conversation";
  const wrap = document.getElementById("chatAvatarWrap");
  if (wrap) wrap.innerHTML = `<div class="chat-av" id="chat-avatar">A</div>`;
  const pb = document.getElementById("participants-bar");
  if (pb) {
    pb.style.display = "none";
    pb.innerHTML = "";
  }
  const mc = document.getElementById("chatMembersCount");
  if (mc) {
    mc.textContent = "";
    mc.style.display = "none";
  }
}

// ============================================================
// CHARGEMENT D'UNE CONVERSATION
// ============================================================
async function loadConversation(conversationKey) {
  if (!chatBox) return;
  chatBox.innerHTML = "";

  const clean = (s) => (s || "").replace(/"/g, "").trim().toLowerCase();
  const pseudoNorm = clean(conversationKey);
  const isGroupe = pseudoNorm.startsWith("groupe__");

  let msgs = messagesStore[pseudoNorm] || [];
  msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  let lastDayLabel = "";

  msgs.forEach((msg) => {
    const isMe = clean(msg.sender) === clean(currentUser);
    const senderName = isMe ? "Moi" : msg.sender;
    const avColor = isMe ? "" : getUserSolidColor(clean(msg.sender));
    const avatarUrl = isMe ? msg.senderAvatar : msg.senderAvatar;
    const time = msg.timestamp ? formatTime(msg.timestamp) : "";

    // Day separator
    const dayLabel = msg.timestamp
      ? new Date(msg.timestamp).toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : "";
    if (dayLabel && dayLabel !== lastDayLabel) {
      const sep = document.createElement("div");
      sep.className = "day-sep";
      sep.innerHTML = `<span>${dayLabel}</span>`;
      chatBox.appendChild(sep);
      lastDayLabel = dayLabel;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "bubble-wrapper";

    const letter = senderName ? senderName.charAt(0).toUpperCase() : "?";
    const avStyle = avatarUrl
      ? `background-image:url('${avatarUrl}');background-color:${avColor}`
      : `background:${avColor || getUserSolidColor(clean(msg.sender))}`;
    const rowClass = isMe ? "msg-row me" : "msg-row";

    // Attachments
    const attachments = (() => {
      if (!msg.attachments) return [];
      if (Array.isArray(msg.attachments)) return msg.attachments;
      if (typeof msg.attachments === "string") {
        try {
          const p = JSON.parse(msg.attachments);
          return Array.isArray(p) ? p : [];
        } catch {
          return [];
        }
      }
      return [];
    })();

    let bubbleContent = "";
    if (msg.subject && !msg.subject.startsWith("[Groupe:")) {
      bubbleContent += `<strong style="display:block;margin-bottom:4px;font-size:12px;opacity:0.7">${msg.subject}</strong>`;
    }
    bubbleContent += msg.body || "";
    attachments.forEach((att) => {
      if (att.type === "image") {
        bubbleContent += `<img src="${att.url}" class="bubble-img" data-src="${att.url}" alt="image"/>`;
      } else if (att.type === "audio") {
        const dur = att.duration ? formatAudioDuration(att.duration) : "";
        bubbleContent += buildAudioBubble(att.url, dur, isMe);
      } else {
        bubbleContent += `
          <a class="bubble-attachment" href="${att.url}" download="${att.name || "fichier"}" target="_blank">
            <div class="att-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
            <div class="att-info"><div class="att-name">${att.name || "Fichier"}</div><div class="att-size">${att.size ? formatBytes(att.size) : ""}</div></div>
            <svg class="att-download" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>`;
      }
    });

    const senderColor = isGroupe && !isMe ? avColor : "var(--tx-muted)";

    wrapper.innerHTML = `
      <div class="${rowClass}">
        ${!isMe ? `<div class="msg-av-wrap" style="${avStyle}">${!avatarUrl ? letter : ""}</div>` : ""}
        <div class="msg-body">
          ${!isMe && isGroupe ? `<div class="msg-sender-name" style="color:${senderColor}">${senderName}</div>` : ""}
          <div class="bubble-content-wrap">
            ${isMe ? `<button class="msg-menu-btn" data-id="${msg.id}" aria-label="Options message"><svg viewBox="0 0 24 24" width="13" height="13"><circle cx="5" cy="12" r="1.5" fill="url(#gradientDots)"/><circle cx="12" cy="12" r="1.5" fill="url(#gradientDots)"/><circle cx="19" cy="12" r="1.5" fill="url(#gradientDots)"/></svg></button>` : ""}
            <div class="bubble ${isMe ? "me" : "them"}">${bubbleContent}</div>
            ${!isMe ? `<button class="msg-menu-btn" data-id="${msg.id}" aria-label="Options message"><svg viewBox="0 0 24 24" width="13" height="13"><circle cx="5" cy="12" r="1.5" fill="url(#gradientDots)"/><circle cx="12" cy="12" r="1.5" fill="url(#gradientDots)"/><circle cx="19" cy="12" r="1.5" fill="url(#gradientDots)"/></svg></button>` : ""}
          </div>
          <div class="msg-time">${time}${isMe ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="opacity:0.5"><polyline points="20 6 9 17 4 12"/></svg>` : ""}</div>
        </div>
      </div>`;
    chatBox.appendChild(wrapper);
  });

  // Bind menu contextuel
  const msgMenu = document.getElementById("msgMenu");
  chatBox.querySelectorAll(".msg-menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedMessageId = btn.dataset.id;
      if (msgMenu) {
        msgMenu.style.top = `${e.pageY}px`;
        msgMenu.style.left = `${Math.max(0, e.pageX - 160)}px`;
        msgMenu.classList.remove("hidden");
      }
    });
  });

  // Lightbox
  chatBox.querySelectorAll(".bubble-img").forEach((img) => {
    img.addEventListener("click", () =>
      openLightbox(img.dataset.src || img.src),
    );
  });

  chatBox.scrollTop = chatBox.scrollHeight;
  injectTimeline(conversationKey, currentUser);
}

// ============================================================
// LIGHTBOX
// ============================================================
function openLightbox(src) {
  const lb = document.getElementById("imgLightbox");
  const lbImg = document.getElementById("imgLightboxSrc");
  if (!lb || !lbImg) return;
  lbImg.src = src;
  lb.classList.add("active");
}
function initLightbox() {
  const lb = document.getElementById("imgLightbox");
  const close = document.getElementById("lbClose");
  lb?.addEventListener("click", () => lb.classList.remove("active"));
  close?.addEventListener("click", (e) => {
    e.stopPropagation();
    lb?.classList.remove("active");
  });
}

// ============================================================
// ENVOI MESSAGE
// ============================================================
async function handleSendMessage(e) {
  if (e) e.preventDefault();
  if (!userInput) return;

  const text = userInput.value.trim();
  const hasPending = pendingFiles.length > 0;
  if (!text && !hasPending) return;

  const conversationKey = activeConversationId;
  if (!conversationKey) return;
  // Guard blocage
  if (
    !activeConversationId.startsWith("groupe__") &&
    blockedStore.has(activeConversationId)
  ) {
    showToast("Impossible : cet utilisateur est bloqué.");
    return;
  }

  const isGroupe = conversationKey.startsWith("groupe__");
  let uploadedAttachments = [];
  if (hasPending) {
    uploadedAttachments = await uploadPendingFiles();
    pendingFiles = [];
    renderAttachmentsPreview();
  }

  const token = getAuthToken();

  if (isGroupe) {
    const groupe = groupeStore[conversationKey];
    if (!groupe) return;
    const receivers = groupe.participants.filter((p) => p !== currentUser);

    const localMsg = {
      id: "local_" + Date.now(),
      sender: currentUser,
      receiver: receivers[0] || "",
      subject: buildGroupeSubject(conversationKey, groupe.name, ""),
      body: text,
      timestamp: new Date().toISOString(),
      attachments: uploadedAttachments,
      senderAvatar: null,
      receiverAvatar: null,
    };
    if (!messagesStore[conversationKey]) messagesStore[conversationKey] = [];
    messagesStore[conversationKey].push(localMsg);

    userInput.value = "";
    userInput.style.height = "auto";
    await loadConversation(conversationKey);

    const membersForEncoding = groupe.participants
      .filter((p) => p !== currentUser)
      .map((p) => ({ pseudo: p, email: userEmailStore[p] || "" }))
      .filter((p) => p.email);
    const groupeSubject = buildGroupeSubject(
      conversationKey,
      groupe.name,
      "",
      membersForEncoding,
    );

    for (const p of receivers) {
      const receiverId = Number(receiverIdStore[p]);
      const email = userEmailStore[p];
      const payload =
        receiverId && !isNaN(receiverId)
          ? {
              receiverId,
              body: text || " ",
              subject: groupeSubject,
              attachments: uploadedAttachments,
            }
          : {
              pseudo: p,
              email,
              body: text || " ",
              subject: groupeSubject,
              attachments: uploadedAttachments,
            };
      if (!receiverId && !email) continue;
      try {
        await fetch("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error("[GROUPE SEND]", err);
      }
    }
    return;
  }

  // 1-à-1
  const receiverId = Number(receiverIdStore[conversationKey]);
  const email = userEmailStore[conversationKey];
  const payload =
    receiverId && !isNaN(receiverId)
      ? {
          receiverId,
          body: text || " ",
          subject: "",
          attachments: uploadedAttachments,
        }
      : {
          pseudo: conversationKey,
          email,
          body: text || " ",
          subject: "",
          attachments: uploadedAttachments,
        };

  if (!receiverId && !email) {
    alert(
      `Impossible d'envoyer : email du destinataire ${conversationKey} inconnu`,
    );
    return;
  }

  try {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      alert("Erreur : " + data.error);
      return;
    }

    if (data.messageId) {
      const localMsg = {
        id: data.messageId,
        sender: currentUser,
        receiver: conversationKey,
        subject: "",
        body: text || " ",
        timestamp: new Date().toISOString(),
        attachments: uploadedAttachments,
        senderAvatar: null,
        receiverAvatar: null,
      };
      if (!messagesStore[conversationKey]) messagesStore[conversationKey] = [];
      const existIdx = messagesStore[conversationKey].findIndex(
        (m) => m.id === data.messageId,
      );
      if (existIdx >= 0)
        messagesStore[conversationKey][existIdx].attachments =
          uploadedAttachments;
      else messagesStore[conversationKey].push(localMsg);
    }

    userInput.value = "";
    userInput.style.height = "auto";
    await loadAllConversations();
    await loadConversation(conversationKey);
  } catch (err) {
    console.error("[SEND]", err);
  }
}

// ============================================================
// COMPOSER INIT
// ============================================================
function initComposer() {
  userInput?.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 100) + "px";
  });
  userInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });
  sendBtn?.addEventListener("click", handleSendMessage);

  // Quick replies
  document.querySelectorAll(".qr-tag").forEach((tag) => {
    tag.addEventListener("click", () => {
      if (userInput) {
        userInput.value = tag.dataset.quick;
        userInput.focus();
        userInput.dispatchEvent(new Event("input"));
      }
    });
  });
}

// ============================================================
// POPUP NOUVEAU MESSAGE
// ============================================================
function initNewMsgPopup() {
  const overlay = document.getElementById("newMsgOverlay");
  const closeEl = document.getElementById("newMsgClose");
  const cancel = document.getElementById("newMsgCancel");
  const sendEl = document.getElementById("newMsgSend");
  const pseudo = document.getElementById("newMsgPseudo");
  const email = document.getElementById("newMsgEmail");
  const objet = document.getElementById("newMsgObjet");
  const body = document.getElementById("newMsgBody");

  const open = () => overlay?.classList.add("active");
  const close = () => overlay?.classList.remove("active");

  document
    .getElementById("btn-nouveau-message")
    ?.addEventListener("click", open);
  document
    .getElementById("btn-nouveau-message-sidebar")
    ?.addEventListener("click", () => {
      close();
      open();
      document.getElementById("newMsgDropdown")?.classList.add("hidden");
    });
  document
    .getElementById("btn-nouveau-message-sidebar-2")
    ?.addEventListener("click", open);
  closeEl?.addEventListener("click", close);
  cancel?.addEventListener("click", close);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  sendEl?.addEventListener("click", async () => {
    const p = pseudo?.value.trim().toLowerCase();
    const em = email?.value.trim().toLowerCase();
    const o = objet?.value.trim();
    const b = body?.value.trim();
    if (!p || !em || !o || !b) {
      alert("Tous les champs sont obligatoires.");
      return;
    }
    if (!isValidEmail(em)) {
      alert("Adresse email invalide.");
      return;
    }
    try {
      const token = getAuthToken();
      if (!token) throw new Error("Token manquant");
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pseudo: p, email: em, subject: o, body: b }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Erreur : ${data.error || res.status}`);
        return;
      }
      await loadAllConversations();
      [pseudo, email, objet, body].forEach((el) => {
        if (el) el.value = "";
      });
      close();
    } catch (err) {
      console.error(err);
      alert("Erreur envoi.");
    }
  });
}

// ============================================================
// POPUP GROUPE
// ============================================================
let groupeParticipants = [];

function renderGroupeParticipants() {
  const container = document.getElementById("groupe-participants-list");
  if (!container) return;
  container.innerHTML = groupeParticipants
    .map(
      (p, idx) => `
    <span class="groupe-participant-tag" style="background:${getUserSolidColor(p.pseudo)}">
      ${p.pseudo}
      <span class="remove-p" data-idx="${idx}">×</span>
    </span>`,
    )
    .join("");
  container.querySelectorAll(".remove-p").forEach((btn) => {
    btn.addEventListener("click", () => {
      groupeParticipants.splice(Number(btn.dataset.idx), 1);
      renderGroupeParticipants();
    });
  });
}

function initGroupePopup() {
  const overlay = document.getElementById("groupeOverlay");
  const closeEl = document.getElementById("groupeClose");
  const cancel = document.getElementById("groupeCancel");
  const addBtn = document.getElementById("groupeAddBtn");
  const sendEl = document.getElementById("groupeSend");

  const open = () => {
    groupeParticipants = [];
    renderGroupeParticipants();
    overlay?.classList.add("active");
  };
  const close = () => overlay?.classList.remove("active");

  document
    .getElementById("btn-nouveau-groupe-sidebar")
    ?.addEventListener("click", () => {
      close();
      open();
      document.getElementById("newMsgDropdown")?.classList.add("hidden");
    });
  document
    .getElementById("btn-nouveau-groupe-sidebar-2")
    ?.addEventListener("click", open);
  closeEl?.addEventListener("click", close);
  cancel?.addEventListener("click", close);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  addBtn?.addEventListener("click", () => {
    const addPseudo = document
      .getElementById("groupeAddPseudo")
      ?.value.trim()
      .toLowerCase();
    const addEmail = document
      .getElementById("groupeAddEmail")
      ?.value.trim()
      .toLowerCase();
    if (!addPseudo || !addEmail) {
      alert("Pseudo et email requis.");
      return;
    }
    if (!isValidEmail(addEmail)) {
      alert("Email invalide.");
      return;
    }
    if (groupeParticipants.find((p) => p.pseudo === addPseudo)) {
      alert("Déjà ajouté.");
      return;
    }
    if (addPseudo === currentUser) {
      alert("Tu es automatiquement inclus dans le groupe.");
      return;
    }
    groupeParticipants.push({ pseudo: addPseudo, email: addEmail });
    userEmailStore[addPseudo] = addEmail;
    renderGroupeParticipants();
    const gAddPseudo = document.getElementById("groupeAddPseudo");
    const gAddEmail = document.getElementById("groupeAddEmail");
    if (gAddPseudo) gAddPseudo.value = "";
    if (gAddEmail) gAddEmail.value = "";
  });

  sendEl?.addEventListener("click", async () => {
    const nom = document.getElementById("groupeNom")?.value.trim();
    const objet = document.getElementById("groupeObjet")?.value.trim();
    const body = document.getElementById("groupeBody")?.value.trim();
    if (!nom) {
      alert("Donne un nom au groupe.");
      return;
    }
    if (groupeParticipants.length < 1) {
      alert("Ajoute au moins un participant.");
      return;
    }
    if (!objet || !body) {
      alert("L'objet et le message sont obligatoires.");
      return;
    }

    const allParticipants = [
      currentUser,
      ...groupeParticipants.map((p) => p.pseudo),
    ];
    const groupeId = makeGroupeId(allParticipants);
    groupeStore[groupeId] = { name: nom, participants: allParticipants };
    saveGroupesToStorage();

    const groupeSubject = buildGroupeSubject(
      groupeId,
      nom,
      objet,
      groupeParticipants,
    );
    const localMsg = {
      id: "local_" + Date.now(),
      sender: currentUser,
      receiver: groupeParticipants[0]?.pseudo || "",
      subject: groupeSubject,
      body,
      timestamp: new Date().toISOString(),
      attachments: [],
      senderAvatar: null,
      receiverAvatar: null,
    };
    if (!messagesStore[groupeId]) messagesStore[groupeId] = [];
    messagesStore[groupeId].push(localMsg);

    const token = getAuthToken();
    for (const p of groupeParticipants) {
      const receiverId = Number(receiverIdStore[p.pseudo]);
      const email = p.email || userEmailStore[p.pseudo];
      const payload =
        receiverId && !isNaN(receiverId)
          ? { receiverId, body, subject: groupeSubject }
          : { pseudo: p.pseudo, email, body, subject: groupeSubject };
      if (!receiverId && !email) continue;
      try {
        await fetch("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error("[GROUPE INIT SEND]", err);
      }
    }

    ["groupeNom", "groupeObjet", "groupeBody"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    groupeParticipants = [];
    renderGroupeParticipants();
    close();

    await loadAllConversations();
    document.querySelector(`.conversation[data-user="${groupeId}"]`)?.click();
  });
}

// ============================================================
// CHAT ACTIONS (archive, delete, block)
// ============================================================
// ============================================================
// STORES RUNTIME
// ============================================================
const archivedStore = new Set(); // conversation_key archivées
const blockedStore = new Set(); // usernames bloqués (par currentUser)

// ============================================================
// INIT — charger archives + bloqués depuis l'API
// ============================================================
async function loadBlockedAndArchived() {
  const token = getAuthToken();
  try {
    const [archRes, blockRes] = await Promise.all([
      fetch("/api/conversations/archived", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/users/blocked", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    const archived = await archRes.json();
    const blocked = await blockRes.json();
    archived.forEach((k) => archivedStore.add(k));
    blocked.forEach((u) => blockedStore.add(u));
  } catch (err) {
    console.warn("[loadBlockedAndArchived]", err);
  }
}

// ============================================================
// CHAT ACTIONS — Archive / Block / Delete (VERSION RÉELLE)
// ============================================================
function initChatActions() {
  // ── ARCHIVER ──────────────────────────────────────────────
  document
    .getElementById("btn-archive")
    ?.addEventListener("click", async () => {
      const cKey = activeConversationId;
      if (!cKey) return;
      document.getElementById("chatMoreDropdown")?.classList.add("hidden");

      const token = getAuthToken();
      const isAlreadyArchived = archivedStore.has(cKey);

      if (isAlreadyArchived) {
        // Désarchiver
        await fetch(`/api/conversations/archive/${encodeURIComponent(cKey)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        archivedStore.delete(cKey);
        showToast("Conversation désarchivée.");
      } else {
        // Archiver
        await fetch("/api/conversations/archive", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ conversationKey: cKey }),
        });
        archivedStore.add(cKey);
        showToast("Conversation archivée.");
      }

      await loadAllConversations();
      applyTabFilter();
    });

  // ── BLOQUER / DÉBLOQUER ──────────────────────────────────
  document.getElementById("btn-block")?.addEventListener("click", async () => {
    const cKey = activeConversationId;
    if (!cKey || cKey.startsWith("groupe__")) return;
    document.getElementById("chatMoreDropdown")?.classList.add("hidden");

    const token = getAuthToken();
    const isBlocked = blockedStore.has(cKey);

    if (isBlocked) {
      // Débloquer
      if (!confirm(`Débloquer ${cKey} ?`)) return;
      await fetch(`/api/users/block/${encodeURIComponent(cKey)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      blockedStore.delete(cKey);
      showToast(`${cKey} débloqué.`);
    } else {
      // Bloquer
      if (
        !confirm(`Bloquer ${cKey} ? Vous ne pourrez plus échanger de messages.`)
      )
        return;
      await fetch("/api/users/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUsername: cKey }),
      });
      blockedStore.add(cKey);
      showToast(`${cKey} bloqué.`);
    }

    // Mettre à jour le label du bouton
    updateBlockBtnLabel();
  });

  // ── SUPPRIMER ─────────────────────────────────────────────
  document.getElementById("btn-delete")?.addEventListener("click", async () => {
    const cKey = activeConversationId;
    if (!cKey) {
      alert("Aucune conversation sélectionnée.");
      return;
    }
    const isGroupe = cKey.startsWith("groupe__");
    if (
      !confirm(
        `Supprimer la conversation avec ${isGroupe ? groupLabel(cKey) : cKey} ?`,
      )
    )
      return;
    document.getElementById("chatMoreDropdown")?.classList.add("hidden");
    await deleteConversation(cKey);
  });
}

// Met à jour le label "Bloquer" ↔ "Débloquer" selon l'état courant
function updateBlockBtnLabel() {
  const btn = document.getElementById("btn-block");
  if (!btn || !activeConversationId) return;
  const isBlocked = blockedStore.has(activeConversationId);
  // Remplacer le texte du bouton en gardant l'icône SVG
  const svgEl = btn.querySelector("svg");
  btn.textContent = isBlocked ? "Débloquer" : "Bloquer";
  if (svgEl) btn.prepend(svgEl);
}

// ============================================================
// MENU CONTEXTUEL BULLE
// ============================================================
function initContextMenu() {
  const msgMenu = document.getElementById("msgMenu");
  msgMenu?.addEventListener("click", async (e) => {
    const item = e.target.closest(".ctx-item");
    if (!item) return;
    const action = item.dataset.action;
    const cKey = activeConversationId;
    if (!cKey) {
      msgMenu.classList.add("hidden");
      return;
    }

    const msgs = messagesStore[cKey] || [];
    const msg = msgs.find((m) => String(m.id) === String(selectedMessageId));
    if (!msg) {
      msgMenu.classList.add("hidden");
      return;
    }

    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(msg.body);
      } catch {
        const el = document.createElement("textarea");
        el.value = msg.body;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      // Toast feedback
      showToast("Message copié !");
    }
    if (action === "delete") {
      try {
        const token = getAuthToken();
        const idStr = String(msg.id);
        if (!idStr.startsWith("local_") && !isNaN(Number(idStr))) {
          await fetch(`/api/messages/${msg.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
        messagesStore[cKey] = msgs.filter((m) => m.id !== msg.id);
        await loadConversation(cKey);
      } catch (err) {
        console.error("[DELETE MSG]", err);
      }
    }
    if (action === "save") {
      console.log("Message enregistré :", msg);
      showToast("Message enregistré.");
    }
    msgMenu.classList.add("hidden");
  });
  document.addEventListener("click", () => msgMenu?.classList.add("hidden"));
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(message, duration = 2500) {
  let toast = document.getElementById("__toast__");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "__toast__";
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%) translateY(10px)",
      background: "var(--tx-primary)",
      color: "var(--bg-sidebar)",
      padding: "10px 20px",
      borderRadius: "10px",
      fontSize: "13px",
      fontWeight: "600",
      boxShadow: "var(--sh-lg)",
      zIndex: "99999",
      opacity: "0",
      transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
      pointerEvents: "none",
    });
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(toast.__timer__);
  toast.__timer__ = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(10px)";
  }, duration);
}

// ============================================================
// STATUT EN LIGNE (simulation)
// ============================================================
function updateOnlineStatus() {
  const status = document.getElementById("chat-status");
  if (!status || !activeConversationId) return;
  const isOnline = Math.random() > 0.4;
  status.textContent = isOnline ? "En ligne" : "Hors ligne";
  status.className = `chat-status ${isOnline ? "online" : "offline"}`;
}

// ============================================================
// PERSISTANCE GROUPES
// ============================================================
function saveGroupesToStorage() {
  try {
    localStorage.setItem("aigent_groupes", JSON.stringify(groupeStore));
  } catch (e) {
    console.warn("[STORAGE] groups save error", e);
  }
}
function loadGroupesFromStorage() {
  try {
    const raw = localStorage.getItem("aigent_groupes");
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.keys(data).forEach((k) => {
      if (!groupeStore[k]) groupeStore[k] = data[k];
    });
  } catch (e) {
    console.warn("[STORAGE] groups load error", e);
  }
}

// ============================================================
// EMOJI PICKER (simple)
// ============================================================
function initEmojiPicker() {
  const btn = document.getElementById("btn-emoji");
  if (!btn) return;
  const emojis = [
    "😊",
    "😂",
    "❤️",
    "👍",
    "🔥",
    "🎉",
    "👋",
    "😎",
    "🏠",
    "📎",
    "📅",
    "✅",
    "🙏",
    "💯",
    "🤝",
    "📞",
  ];
  let picker = null;
  btn.addEventListener("click", (e) => {
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
      background: "var(--bg-composer)",
      border: "1px solid var(--bd-mid)",
      borderRadius: "14px",
      padding: "12px",
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      width: "220px",
      boxShadow: "var(--sh-lg)",
      zIndex: "1000",
      animation: "dropIn 0.15s ease",
    });
    emojis.forEach((em) => {
      const sp = document.createElement("button");
      sp.textContent = em;
      Object.assign(sp.style, {
        fontSize: "22px",
        cursor: "pointer",
        borderRadius: "6px",
        padding: "2px",
        transition: "transform 0.1s",
        background: "none",
        border: "none",
      });
      sp.addEventListener("click", () => {
        if (userInput) {
          userInput.value += em;
          userInput.focus();
          userInput.dispatchEvent(new Event("input"));
        }
        picker?.remove();
        picker = null;
      });
      sp.addEventListener(
        "mouseenter",
        () => (sp.style.transform = "scale(1.25)"),
      );
      sp.addEventListener(
        "mouseleave",
        () => (sp.style.transform = "scale(1)"),
      );
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
// MOBILE SWIPE
// ============================================================
function initMobileSwipe() {
  if (window.innerWidth > 640 || !appMain) return;
  let startX = 0,
    isSwiping = false;
  appMain.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
      isSwiping = false;
    },
    { passive: true },
  );
  appMain.addEventListener(
    "touchmove",
    (e) => {
      isSwiping = true;
    },
    { passive: true },
  );
  appMain.addEventListener("touchend", (e) => {
    if (!isSwiping) return;
    const diffX = e.changedTouches[0].clientX - startX;
    if (diffX > 80) showListView();
    if (diffX < -80) showChatView();
  });
}
// ============================================================
// AUDIO RECORDER — Style WhatsApp/Snap
// ============================================================
let mediaRecorder = null;
let audioChunks = [];
let audioTimer = null;
let audioSeconds = 0;
let analyserNode = null;
let animFrameId = null;
let isRecording = false;

const MAX_AUDIO_SECONDS = 60;

function initVoiceRecorder() {
  const voiceBtn = document.querySelector(".comp-voice-btn");
  if (!voiceBtn) return;

  voiceBtn.addEventListener("click", async () => {
    if (!activeConversationId) {
      showToast("Sélectionne une conversation.");
      return;
    }
    if (blockedStore.has(activeConversationId)) {
      showToast("Impossible : utilisateur bloqué.");
      return;
    }

    if (isRecording) {
      stopRecording(true); // true = envoyer
    } else {
      await startRecording(voiceBtn);
    }
  });

  // Clic droit / long press annule
  voiceBtn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (isRecording) stopRecording(false); // annuler
  });
}

async function startRecording(voiceBtn) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    isRecording = true;

    // Setup analyser pour visualisation
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64;
    source.connect(analyserNode);

    // MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    audioChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.start(100);

    // UI : transformer le composer
    showRecordingUI(stream);

    // Timer
    audioSeconds = 0;
    audioTimer = setInterval(() => {
      audioSeconds++;
      updateRecordingTimer(audioSeconds);
      if (audioSeconds >= MAX_AUDIO_SECONDS) stopRecording(true);
    }, 1000);

    // Waveform animation
    animateWaveform();
  } catch (err) {
    console.error("[Audio]", err);
    showToast("Microphone inaccessible.");
  }
}

function stopRecording(send) {
  if (!mediaRecorder) return;
  clearInterval(audioTimer);
  cancelAnimationFrame(animFrameId);
  isRecording = false;

  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
    hideRecordingUI();
    if (send && blob.size > 0) {
      await sendAudioMessage(blob, audioSeconds);
    }
    audioChunks = [];
    // Stop tracks
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    mediaRecorder = null;
  };
  mediaRecorder.stop();
}

// ── UI Recording ─────────────────────────────────────────────
function showRecordingUI(stream) {
  const composerInner = document.querySelector(".composer-inner");
  const textarea = document.getElementById("user-input");
  const sendBtnEl = document.getElementById("send-btn");
  const voiceBtn = document.querySelector(".comp-voice-btn");

  // Cacher textarea + left actions
  if (textarea) textarea.style.display = "none";
  const leftActions = document.querySelector(".comp-left-actions");
  if (leftActions) leftActions.style.display = "none";

  // Supprimer un éventuel rec-ui résiduel
  document.getElementById("rec-ui")?.remove();

  // Créer le bloc d'enregistrement
  const recUI = document.createElement("div");
  recUI.id = "rec-ui";
  recUI.style.cssText =
    "flex:1; display:flex; align-items:center; gap:12px; padding:0 8px;";
  recUI.innerHTML = `
    <div id="rec-dot" style="
      width:10px;height:10px;border-radius:50%;
      background:#ef4444;animation:recPulse 1s ease infinite;flex-shrink:0;
    "></div>
    <canvas id="waveform-canvas" width="160" height="36" style="flex:1;max-width:220px;border-radius:6px;"></canvas>
    <span id="rec-timer" style="
      font-size:13px;font-weight:700;color:var(--tx-primary);
      font-variant-numeric:tabular-nums;flex-shrink:0;min-width:42px;
    ">0:00</span>
    <button id="rec-cancel-btn" style="
      padding:4px 10px;border-radius:8px;background:var(--bg-hover);
      color:var(--tx-muted);font-size:12px;font-weight:600;border:1px solid var(--bd-mid);
      flex-shrink:0;
    ">✕ Annuler</button>
  `;

  // Inject style animation (une seule fois)
  if (!document.getElementById("rec-anim-style")) {
    const st = document.createElement("style");
    st.id = "rec-anim-style";
    st.textContent = `
      @keyframes recPulse {
        0%,100%{opacity:1;transform:scale(1);}
        50%{opacity:0.4;transform:scale(0.7);}
      }
    `;
    document.head.appendChild(st);
  }

  // ✅ FIX : insérer avant le bloc comp-right-actions (parent garanti)
  const rightActions = composerInner.querySelector(".comp-right-actions");
  if (rightActions) {
    composerInner.insertBefore(recUI, rightActions);
  } else {
    composerInner.appendChild(recUI);
  }

  document
    .getElementById("rec-cancel-btn")
    ?.addEventListener("click", () => stopRecording(false));

  // Changer le send btn en icône envoi audio
  if (sendBtnEl) {
    sendBtnEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>`;
    sendBtnEl.onclick = () => stopRecording(true);
  }

  // Voix btn rouge
  if (voiceBtn) {
    voiceBtn.style.color = "#ef4444";
    voiceBtn.title = "Arrêter";
  }
}

function hideRecordingUI() {
  document.getElementById("rec-ui")?.remove();
  const textarea = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const voiceBtn = document.querySelector(".comp-voice-btn");
  if (textarea) textarea.style.display = "";
  const leftActions = document.querySelector(".comp-left-actions");
  if (leftActions) leftActions.style.display = "";
  if (voiceBtn) {
    voiceBtn.style.color = "";
    voiceBtn.title = "Vocal";
  }
  // Restaurer send btn
  if (sendBtn) {
    sendBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>`;
    sendBtn.onclick = handleSendMessage;
  }
}

function updateRecordingTimer(seconds) {
  const el = document.getElementById("rec-timer");
  if (!el) return;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  el.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  // Couleur rouge quand reste peu de temps
  if (seconds >= MAX_AUDIO_SECONDS - 10) el.style.color = "#ef4444";
}

function animateWaveform() {
  const canvas = document.getElementById("waveform-canvas");
  if (!canvas || !analyserNode) return;
  const ctx = canvas.getContext("2d");
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    if (!isRecording) return;
    animFrameId = requestAnimationFrame(draw);
    analyserNode.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barCount = 28;
    const barWidth = 4;
    const gap = (canvas.width - barCount * barWidth) / (barCount - 1);
    const step = Math.floor(bufferLength / barCount);

    for (let i = 0; i < barCount; i++) {
      const val = dataArray[i * step] / 255;
      const barH = Math.max(4, val * canvas.height * 0.85);
      const x = i * (barWidth + gap);
      const y = (canvas.height - barH) / 2;

      // Dégradé violet → rose selon amplitude
      const gradient = ctx.createLinearGradient(x, y, x, y + barH);
      gradient.addColorStop(0, `rgba(124,58,237,${0.6 + val * 0.4})`);
      gradient.addColorStop(1, `rgba(167,139,250,${0.4 + val * 0.3})`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 2);
      ctx.fill();
    }
  }
  draw();
}

// ── Upload Supabase + envoi message ──────────────────────────
async function sendAudioMessage(blob, durationSeconds) {
  const conversationKey = activeConversationId;
  if (!conversationKey) return;

  showToast("Envoi de l'audio…");

  try {
    // 1. Upload vers /api/upload-audio (route serveur qui pousse vers Supabase)
    const formData = new FormData();
    const ext = blob.type.includes("webm") ? "webm" : "mp4";
    const fileName = `audio_${Date.now()}_${currentUser}.${ext}`;
    formData.append("audio", blob, fileName);
    formData.append("duration", String(durationSeconds));

    const token = getAuthToken();
    const uploadRes = await fetch("/api/upload-audio", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!uploadRes.ok) throw new Error("Upload audio échoué");
    const { url, name, duration } = await uploadRes.json();

    // 2. Envoyer comme message avec attachment type 'audio'
    const attachment = { type: "audio", url, name: fileName, duration };

    // Injection locale immédiate
    const localMsg = {
      id: "local_audio_" + Date.now(),
      sender: currentUser,
      receiver: conversationKey,
      subject: "",
      body: "",
      timestamp: new Date().toISOString(),
      attachments: [attachment],
      senderAvatar: null,
      receiverAvatar: null,
    };
    if (!messagesStore[conversationKey]) messagesStore[conversationKey] = [];
    messagesStore[conversationKey].push(localMsg);
    await loadConversation(conversationKey);

    // 3. Envoi API message
    const isGroupe = conversationKey.startsWith("groupe__");
    if (isGroupe) {
      const groupe = groupeStore[conversationKey];
      if (!groupe) return;
      for (const p of groupe.participants.filter((x) => x !== currentUser)) {
        const receiverId = Number(receiverIdStore[p]);
        const email = userEmailStore[p];
        const payload =
          receiverId && !isNaN(receiverId)
            ? {
                receiverId,
                body: " ",
                subject: buildGroupeSubject(conversationKey, groupe.name, ""),
                attachments: [attachment],
              }
            : {
                pseudo: p,
                email,
                body: " ",
                subject: buildGroupeSubject(conversationKey, groupe.name, ""),
                attachments: [attachment],
              };
        if (!receiverId && !email) continue;
        await fetch("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }).catch(console.error);
      }
    } else {
      const receiverId = Number(receiverIdStore[conversationKey]);
      const email = userEmailStore[conversationKey];
      const payload =
        receiverId && !isNaN(receiverId)
          ? { receiverId, body: " ", subject: "", attachments: [attachment] }
          : {
              pseudo: conversationKey,
              email,
              body: " ",
              subject: "",
              attachments: [attachment],
            };
      await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    }

    await loadAllConversations();
    await loadConversation(conversationKey);
  } catch (err) {
    console.error("[sendAudioMessage]", err);
    showToast("Erreur envoi audio.");
  }
}
function openParticipantsPopup() {
  if (!activeConversationId) return;
  const overlay = document.getElementById("participantsOverlay");
  const list = document.getElementById("participantsList");
  const isGroupe = activeConversationId.startsWith("groupe__");

  let members = [];
  if (isGroupe) {
    const g = groupeStore[activeConversationId];
    members = g.participants.map((p) => ({
      pseudo: p,
      email: userEmailStore[p] || "Email non renseigné",
    }));
  } else {
    members = [
      { pseudo: currentUser, email: "Moi" },
      {
        pseudo: activeConversationId,
        email: userEmailStore[activeConversationId] || "Email masqué",
      },
    ];
  }

  list.innerHTML = `
    <table class="saas-table">
      <thead>
        <tr>
          <th>Utilisateur</th>
          <th>Contact / Rôle</th>
        </tr>
      </thead>
      <tbody>
        ${members
          .map(
            (m) => `
          <tr>
            <td>
              <div style="display:flex; align-items:center; gap:10px;">
                <div class="av-sub" style="background:${getUserSolidColor(m.pseudo)}; width:24px; height:24px; font-size:10px;">${m.pseudo.charAt(0).toUpperCase()}</div>
                <span style="font-weight:600; color:var(--tx-primary)">${m.pseudo}</span>
              </div>
            </td>
            <td style="color:var(--tx-muted); font-size:12px;">${m.email}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
  overlay.classList.add("active");
}
let selectedMentions = new Set();

function initMentionAction() {
  const mentionBtn = document.querySelector(
    '.comp-icon-btn[title="Mentionner"]',
  );
  if (!mentionBtn) return;

  mentionBtn.addEventListener("click", () => {
    if (!activeConversationId) return;
    const isGroupe = activeConversationId.startsWith("groupe__");

    if (!isGroupe) {
      // 1-à-1 : Insertion directe
      insertMention(`@${activeConversationId} `);
    } else {
      // Groupe : Ouvrir popup
      openMentionPopup();
    }
  });
}

function openMentionPopup() {
  const overlay = document.getElementById("mentionOverlay");
  const list = document.getElementById("mentionList");
  const groupe = groupeStore[activeConversationId];
  selectedMentions.clear();

  list.innerHTML = groupe.participants
    .filter((p) => p !== currentUser)
    .map(
      (p) => `
      <div class="mention-item" onclick="toggleMentionSelection('${p}', this)">
        <div class="av-sub" style="background:${getUserSolidColor(p)}; width:20px; height:20px;">${p.charAt(0).toUpperCase()}</div>
        <span>@${p}</span>
        <div class="mention-checkbox"></div>
      </div>
    `,
    )
    .join("");

  overlay.classList.add("active");
}

window.toggleMentionSelection = function (pseudo, el) {
  if (selectedMentions.has(pseudo)) {
    selectedMentions.delete(pseudo);
    el.classList.remove("selected");
  } else {
    selectedMentions.add(pseudo);
    el.classList.add("selected");
  }
};

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

function insertMention(text) {
  const input = document.getElementById("user-input");
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.value =
    input.value.substring(0, start) + text + input.value.substring(end);
  input.focus();
  input.dispatchEvent(new Event("input"));
} // ============================================================
// BOOTSTRAP (VERSION CORRIGÉE)
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  const user = localStorage.getItem("agent_user");
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  initTheme();
  initUserDisplay();
  initSidebarCollapse();
  initMobileViews();
  initTabs();
  initSearch();
  initComposer();
  initUploadButtons();
  initNewMsgDropdown();
  initChatHeaderDropdown();
  initNewMsgPopup();
  initGroupePopup();
  initChatActions();
  initContextMenu();
  initLightbox();
  initEmojiPicker();
  initVoiceRecorder();
  initMobileSwipe();

  // ✅ AJOUTS ICI
  initMentionAction();
  document
    .getElementById("btn-toggle-participants")
    ?.addEventListener("click", openParticipantsPopup);

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.classList.remove("hidden");
    logoutBtn.addEventListener("click", logout);
  }

  setInterval(updateOnlineStatus, 5000);
  await loadBlockedAndArchived();
  loadAllConversations();
});
