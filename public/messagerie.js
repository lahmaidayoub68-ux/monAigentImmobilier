// ============================================================
// VARIABLES GLOBALES ET STORES
// ============================================================
let currentUser = "";
try {
  const rawUser = localStorage.getItem("agent_user");
  if (rawUser) {
    currentUser = JSON.parse(rawUser)?.username?.toLowerCase() || "";
  }
} catch (err) {
  console.warn("Erreur lecture user local", err);
}

const messagesStore = {};
const conversationStore = new Set();
const userEmailStore = {};
const receiverIdStore = {};
const unreadStore = {};
// Store pour les groupes : clé = groupeId (string), valeur = { participants: [...], name: string }
const groupeStore = {};

// BUG FIX 3 : on stocke séparément le groupeId actif (la vraie clé groupe__...)
// et le titre affiché (nom lisible). chatWithTitle.textContent = nom lisible,
// mais on lit activeConversationId pour les opérations internes.
let activeConversationId = null; // ex: "groupe__jean__olivier__moi" ou "jean"

// Fichiers en attente d'envoi (images + pièces jointes)
let pendingFiles = []; // [{ file, type: 'image'|'file', previewUrl }]

let conversations = [];
let selectedMessageId = null;

// Palette de couleurs pour différencier les correspondants dans les groupes
const CORRESPONDENT_COLORS = [
  "linear-gradient(135deg,#7c3aed,#a855f7)",
  "linear-gradient(135deg,#0ea5e9,#38bdf8)",
  "linear-gradient(135deg,#10b981,#34d399)",
  "linear-gradient(135deg,#f59e0b,#fbbf24)",
  "linear-gradient(135deg,#ef4444,#f87171)",
  "linear-gradient(135deg,#ec4899,#f472b6)",
  "linear-gradient(135deg,#6366f1,#818cf8)",
  "linear-gradient(135deg,#14b8a6,#2dd4bf)",
];
const userColorMap = {};

function getUserColor(username) {
  if (!userColorMap[username]) {
    const idx = Object.keys(userColorMap).length % CORRESPONDENT_COLORS.length;
    userColorMap[username] = CORRESPONDENT_COLORS[idx];
  }
  return userColorMap[username];
}

const CORRESPONDENT_SOLID_COLORS = [
  "#7c3aed",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
];

// Map stable username -> index de couleur (persistant par session, assigné à la première utilisation)
const userColorIndexMap = {};
let colorIndexCounter = 0;

function getUserSolidColor(username) {
  if (userColorIndexMap[username] === undefined) {
    userColorIndexMap[username] =
      colorIndexCounter % CORRESPONDENT_SOLID_COLORS.length;
    colorIndexCounter++;
  }
  return CORRESPONDENT_SOLID_COLORS[userColorIndexMap[username]];
}

// Cache DOM réutilisé
const chatWithTitle = document.getElementById("chat-with");
const chatAvatar = document.getElementById("chat-avatar");
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const mobileWrapper = document.getElementById("mobileWrapper");

// ============================================================
// UTILITAIRES
// ============================================================
function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAuthToken() {
  const raw = localStorage.getItem("agent_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw).token || null;
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

// Génère une clé unique de groupe à partir d'un tableau de pseudos (triés)
function makeGroupeId(participants) {
  return "groupe__" + [...participants].sort().join("__");
}

// Génère un label lisible pour la conversation en groupe
function groupLabel(groupeId) {
  const g = groupeStore[groupeId];
  return g ? g.name : groupeId.replace("groupe__", "").replace(/__/g, ", ");
}

// BUG FIX 1 : extrait le groupeId encodé dans le sujet d'un message
// Format: [Groupe:NOM_GROUPE|ID:groupe__a__b__c]
// Remplacer ces deux fonctions :

function buildGroupeSubject(
  groupeId,
  nomGroupe,
  objet,
  participantsWithEmails,
) {
  // participantsWithEmails = [{ pseudo, email }, ...]
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

// Nouvelle fonction : extraire les membres encodés dans le sujet
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

// ============================================================
// GESTION DU THÈME
// ============================================================
function initTheme() {
  const btnTheme = document.getElementById("btn-theme");
  const html = document.documentElement;
  const savedTheme = localStorage.getItem("aigent_theme") || "dark";
  html.setAttribute("data-theme", savedTheme);
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const next =
        html.getAttribute("data-theme") === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
      localStorage.setItem("aigent_theme", next);
    });
  }
}

// ============================================================
// DECONNEXION
// ============================================================
function logout() {
  localStorage.removeItem("agent_user");
  Object.keys(messagesStore).forEach((k) => delete messagesStore[k]);
  conversationStore.clear();
  Object.keys(unreadStore).forEach((k) => delete unreadStore[k]);
  const list = document.querySelector("#conversations-container");
  if (list) list.innerHTML = "";
  if (chatBox) chatBox.innerHTML = "";
  window.location.href = "index.html";
}

// ============================================================
// SIDEBAR
// ============================================================
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const open = () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("active");
    if (openBtn) openBtn.style.display = "none";
  };
  const close = () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("active");
    if (openBtn) openBtn.style.display = "flex";
  };
  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  overlay?.addEventListener("click", close);
}

// ============================================================
// VUE MOBILE
// ============================================================
function showChatView() {
  if (window.innerWidth <= 768 && mobileWrapper)
    mobileWrapper.classList.add("show-chat");
}
function showListView() {
  if (mobileWrapper) mobileWrapper.classList.remove("show-chat");
}
function initMobileViews() {
  document
    .getElementById("btn-back-to-list")
    ?.addEventListener("click", showListView);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768 && mobileWrapper)
      mobileWrapper.classList.remove("show-chat");
  });
}

// ============================================================
// BADGES NON LUS ET TABS
// ============================================================
function updateGlobalUnread() {
  const count = Object.values(unreadStore).filter((v) => v).length;
  const badge = document.getElementById("unread-count-tab");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = "inline-block";
  } else badge.style.display = "none";
}

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
    if (filter === "all") c.style.display = "flex";
    else if (filter === "unread")
      c.style.display = c.classList.contains("has-unread") ? "flex" : "none";
    else if (filter === "archived") c.style.display = "none";
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
// UPLOAD IMAGES ET FICHIERS — VRAIS BOUTONS
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
    const files = Array.from(e.target.files || []);
    files.forEach((f) => addPendingFile(f, "image"));
    inpImg.value = "";
  });

  inpFile?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => addPendingFile(f, "file"));
    inpFile.value = "";
  });
}

function addPendingFile(file, type) {
  const previewUrl = type === "image" ? URL.createObjectURL(file) : null;
  const entry = { file, type, previewUrl };
  pendingFiles.push(entry);
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

// BUG FIX 2 : upload vers /api/upload-imagesbien (images) ou /api/upload-files (fichiers)
// Les fichiers génériques sont aussi uploadés sur le serveur pour persistance
async function uploadPendingFiles() {
  if (!pendingFiles.length) return [];
  const token = getAuthToken();
  const results = [];

  const images = pendingFiles.filter((f) => f.type === "image");
  const files = pendingFiles.filter((f) => f.type === "file");

  // Upload images via l'API existante
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
      if (res.ok && data.images) {
        data.images.forEach((url) =>
          results.push({ type: "image", url, name: "" }),
        );
      }
    } catch (err) {
      console.error("[UPLOAD IMAGES]", err);
    }
  }

  // BUG FIX 2 : upload les fichiers génériques via /api/upload-files
  // (route à ajouter côté serveur — voir patch serveur)
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
        if (data.files) {
          data.files.forEach((f) =>
            results.push({
              type: "file",
              url: f.url,
              name: f.name,
              size: f.size,
            }),
          );
        }
      } else {
        // Fallback : blob URL temporaire si le serveur ne supporte pas encore /api/upload-files
        console.warn(
          "[UPLOAD FILES] /api/upload-files non disponible, fallback blob URL",
        );
        files.forEach((f) => {
          const blobUrl = URL.createObjectURL(f.file);
          results.push({
            type: "file",
            url: blobUrl,
            name: f.file.name,
            size: f.file.size,
          });
        });
      }
    } catch (err) {
      console.error("[UPLOAD FILES]", err);
      // Fallback blob URL
      files.forEach((f) => {
        const blobUrl = URL.createObjectURL(f.file);
        results.push({
          type: "file",
          url: blobUrl,
          name: f.file.name,
          size: f.file.size,
        });
      });
    }
  }

  return results;
}

// ============================================================
// CONVERSATIONS — ATTACHE CLICK
// ============================================================
function attachConversationClick(convo) {
  convo.addEventListener("click", async () => {
    document
      .querySelectorAll(".conversation")
      .forEach((c) => c.classList.remove("active"));
    convo.classList.add("active");

    // BUG FIX 3 : data-user contient toujours la vraie clé (pseudo ou groupeId)
    const conversationKey = convo.dataset.user; // ex: "groupe__jean__olivier__moi" ou "jean"
    activeConversationId = conversationKey;

    const isGroupe = conversationKey.startsWith("groupe__");

    unreadStore[conversationKey] = false;
    convo.querySelector(".unread")?.remove();
    convo.classList.remove("has-unread");
    updateGlobalUnread();
    applyTabFilter();

    // BUG FIX 3 : le titre affiche le nom lisible, mais activeConversationId garde la vraie clé
    if (chatWithTitle) {
      chatWithTitle.textContent = isGroupe
        ? groupLabel(conversationKey)
        : conversationKey;
    }

    const participantsBar = document.getElementById("participants-bar");
    if (isGroupe && groupeStore[conversationKey]) {
      // Avatar groupe
      const currentChatAvatar = document.getElementById("chat-avatar");
      if (currentChatAvatar) {
        const newAv = document.createElement("div");
        newAv.className = "chat-avatar-group";
        newAv.id = "chat-avatar";
        const others = groupeStore[conversationKey].participants
          .filter((p) => p !== currentUser)
          .slice(0, 2);
        others.forEach((p, i) => {
          const sub = document.createElement("div");
          sub.className = "av-sub";
          sub.style.background = getUserSolidColor(p);
          sub.style.zIndex = String(2 - i);
          sub.textContent = p.charAt(0).toUpperCase();
          newAv.appendChild(sub);
        });
        currentChatAvatar.replaceWith(newAv);
      }
      // Participants bar
      if (participantsBar) {
        participantsBar.style.display = "flex";
        participantsBar.innerHTML = groupeStore[conversationKey].participants
          .filter((p) => p !== currentUser)
          .map(
            (p) =>
              `<span class="participant-pill" style="background:${getUserSolidColor(p)}">${p.charAt(0).toUpperCase()}${p.slice(0, 4)}</span>`,
          )
          .join("");
      }
    } else {
      if (participantsBar) {
        participantsBar.style.display = "none";
        participantsBar.innerHTML = "";
      }
      const currentChatAvatar = document.getElementById("chat-avatar");
      if (currentChatAvatar) {
        currentChatAvatar.className = "chat-avatar";
        currentChatAvatar.id = "chat-avatar";
        currentChatAvatar.textContent = conversationKey.charAt(0).toUpperCase();
        currentChatAvatar.classList.add("online");
      }
    }

    const emptyState = document.getElementById("chat-empty-state");
    if (emptyState) emptyState.style.display = "none";

    await loadConversation(conversationKey);
    showChatView();
  });
}

// ============================================================
// CHARGEMENT TOUTES LES CONVERSATIONS
// ============================================================
async function loadAllConversations() {
  try {
    const token = getAuthToken();
    if (!token) {
      alert("Vous devez être connecté pour voir vos messages.");
      return;
    }

    const res = await fetch("/api/messages", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      alert("Erreur lors de la récupération des messages.");
      return;
    }

    const msgs = Array.isArray(data) ? data : [];

    Object.keys(messagesStore).forEach((k) => delete messagesStore[k]);
    conversationStore.clear();

    // BUG FIX 1 : reconstituer les groupes depuis les messages reçus
    // en lisant le groupeId encodé dans le sujet
    msgs.forEach((m) => {
      const groupeId = extractGroupeIdFromSubject(m.subject);

      if (groupeId) {
        // Ce message appartient à un groupe
        // Reconstruire le groupeStore si absent
        if (!groupeStore[groupeId]) {
          // Extraire le nom depuis le sujet : [Groupe:NOM|ID:...]
          const nameMatch = m.subject.match(/\[Groupe:([^|]+)\|ID:/);
          const nomGroupe = nameMatch
            ? nameMatch[1]
            : groupeId.replace("groupe__", "").replace(/__/g, ", ");
          const membersFromSubject = extractMembersFromSubject(m.subject);
          if (membersFromSubject) {
            membersFromSubject.forEach(({ pseudo, email }) => {
              if (pseudo && email && pseudo !== currentUser) {
                if (!userEmailStore[pseudo]) userEmailStore[pseudo] = email;
              }
            });
          }
          // Participants = tous les usernames dans le groupeId
          const participantsFromId = groupeId
            .replace("groupe__", "")
            .split("__");
          groupeStore[groupeId] = {
            name: nomGroupe,
            participants: participantsFromId,
          };
          saveGroupesToStorage();
        }
        if (!messagesStore[groupeId]) messagesStore[groupeId] = [];
        // Éviter les doublons
        if (!messagesStore[groupeId].find((x) => x.id === m.id)) {
          messagesStore[groupeId].push(m);
        }
        conversationStore.add(groupeId);

        if (m.receiver?.toLowerCase() === currentUser && !m.read) {
          unreadStore[groupeId] = true;
        }
      } else {
        // Conversation normale 1-à-1
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

      // Toujours stocker emails et receiverIds pour les participants individuels
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

    // Charger aussi les groupes depuis localStorage (persistance légère)
    loadGroupesFromStorage();

    updateGlobalUnread();

    const recentes = [];
    const anciennes = [];
    const now = new Date();

    // Conversations normales (1-à-1)
    conversationStore.forEach((pseudo) => {
      if (pseudo.startsWith("groupe__")) return;
      const mList = messagesStore[pseudo] || [];
      const lastMsg = mList[mList.length - 1];
      if (!lastMsg) return;
      const diffHours = (now - new Date(lastMsg.timestamp)) / (1000 * 60 * 60);
      (diffHours < 24 ? recentes : anciennes).push({
        pseudo,
        lastMsg,
        isGroupe: false,
      });
    });

    // Conversations groupes
    Object.keys(groupeStore).forEach((groupeId) => {
      const mList = messagesStore[groupeId] || [];
      const lastMsg = mList[mList.length - 1];
      if (!lastMsg) return;
      const diffHours = (now - new Date(lastMsg.timestamp)) / (1000 * 60 * 60);
      (diffHours < 24 ? recentes : anciennes).push({
        pseudo: groupeId,
        lastMsg,
        isGroupe: true,
      });
    });

    const container = document.getElementById("conversations-container");
    if (!container) return;

    function renderGroup(title, list) {
      if (!list.length) return "";
      return `
        <div class="conversation-group">
          <div class="group-title">${title}</div>
          ${list.map(({ pseudo, lastMsg, isGroupe }) => renderConvItem(pseudo, lastMsg, isGroupe)).join("")}
        </div>`;
    }

    function renderConvItem(pseudo, lastMsg, isGroupe) {
      const displayName = isGroupe ? groupLabel(pseudo) : pseudo;
      const time = new Date(lastMsg.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const hasUnread = unreadStore[pseudo] || false;

      let avatarHtml;
      if (isGroupe && groupeStore[pseudo]) {
        const others = groupeStore[pseudo].participants
          .filter((p) => p !== currentUser)
          .slice(0, 2);
        avatarHtml = `<div class="avatar-group">
          ${others.map((p, i) => `<div class="av-sub" style="background:${getUserSolidColor(p)}">${p.charAt(0).toUpperCase()}</div>`).join("")}
        </div>`;
      } else {
        const avatarUrl =
          lastMsg.sender.trim().toLowerCase() === currentUser
            ? lastMsg.receiverAvatar
            : lastMsg.senderAvatar;
        avatarHtml = `<div class="avatar" style="background-image:url('${avatarUrl || ""}');background-color:${getUserSolidColor(pseudo)}">
          ${!avatarUrl ? pseudo.charAt(0).toUpperCase() : ""}
        </div>`;
      }

      // Prévisualisation du body (nettoyer le sujet groupe)
      const bodyPreview = (lastMsg.body || "").substring(0, 40);
      const pilleGroupe = isGroupe
        ? `<span class="conv-group-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><path d="M3 20c0-3 2.7-5 6-5h6c3.3 0 6 2 6 5"/></svg>Groupe</span>`
        : "";

      return `
        <div class="conversation ${hasUnread ? "has-unread" : ""}" data-user="${pseudo}">
          ${avatarHtml}
          <div class="conv-info">
            <div class="top-line">
              <span class="conv-name">${displayName}${pilleGroupe}</span>
              <span class="time">${time}</span>
            </div>
            <div class="preview">${bodyPreview}${bodyPreview.length >= 40 ? "…" : ""}</div>
          </div>
          <div class="conv-meta">${hasUnread ? `<div class="unread new"></div>` : ""}</div>
          <div class="conv-actions" data-user="${pseudo}" title="Supprimer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
            </svg>
          </div>
        </div>`;
    }

    container.innerHTML =
      renderGroup("Récentes", recentes) + renderGroup("Anciennes", anciennes);

    document.querySelectorAll(".conversation").forEach(attachConversationClick);
    conversations = document.querySelectorAll(".conversation");

    // Suppression via la miniature
    document.querySelectorAll(".conv-actions").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const pseudo = btn.dataset.user;
        if (
          !confirm(
            `Supprimer la conversation avec ${pseudo.startsWith("groupe__") ? groupLabel(pseudo) : pseudo} ?`,
          )
        )
          return;

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

          const el = document.querySelector(
            `.conversation[data-user='${pseudo}']`,
          );
          if (el) el.remove();

          if (activeConversationId === pseudo) {
            activeConversationId = null;
            resetChatZone();
          }
        } catch (err) {
          console.error(err);
          alert("Erreur suppression");
        }
      });
    });

    applyTabFilter();
  } catch (err) {
    console.error("[ERROR] Erreur chargement conversations :", err);
  }
}

function resetChatZone() {
  activeConversationId = null;
  if (chatBox) {
    chatBox.innerHTML = `
      <div class="chat-empty" id="chat-empty-state">
        <div class="chat-empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div>
        <h3>Aucune conversation sélectionnée</h3>
        <p>Choisis une conversation à gauche<br/>ou démarre-en une nouvelle.</p>
      </div>`;
  }
  if (chatWithTitle) chatWithTitle.textContent = "Sélectionne une conversation";
  const av = document.getElementById("chat-avatar");
  if (av) {
    av.className = "chat-avatar";
    av.id = "chat-avatar";
    av.textContent = "A";
  }
  const pb = document.getElementById("participants-bar");
  if (pb) {
    pb.style.display = "none";
    pb.innerHTML = "";
  }
}

// ============================================================
// CHARGEMENT D'UNE CONVERSATION (normale ou groupe)
// ============================================================
async function loadConversation(conversationKey) {
  if (!chatBox) return;
  chatBox.innerHTML = "";

  const clean = (s) => (s || "").replace(/"/g, "").trim().toLowerCase();
  const pseudoNorm = clean(conversationKey);
  const isGroupe = pseudoNorm.startsWith("groupe__");

  let msgs = messagesStore[pseudoNorm] || [];
  msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  msgs.forEach((msg) => {
    const isMe = clean(msg.sender) === clean(currentUser);
    const senderName = isMe ? "Moi" : msg.sender;
    const wrapper = document.createElement("div");
    wrapper.className = "bubble-wrapper";

    const avatarUrl = isMe ? msg.receiverAvatar : msg.senderAvatar;
    const time = msg.timestamp
      ? new Date(msg.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    const rowClass = isMe ? "msg-row me" : "msg-row";
    const bubbleClass = isMe ? "me" : "them";
    const letter = senderName ? senderName.charAt(0).toUpperCase() : "?";

    // BUG FIX : couleur stable par correspondant dans les groupes
    const avColor = isMe ? "" : getUserSolidColor(clean(msg.sender));
    const avStyle = avatarUrl
      ? `background-image:url('${avatarUrl}');background-color:${avColor}`
      : `background:${avColor || getUserSolidColor(clean(msg.sender))}`;

    // Construction du contenu bulle (texte + attachments)
    let bubbleContent = "";

    // Afficher le sujet uniquement si ce n'est pas un sujet de groupe encodé
    if (msg.subject && !msg.subject.startsWith("[Groupe:")) {
      bubbleContent += `<strong>[${msg.subject}]</strong><br/>`;
    }
    bubbleContent += msg.body || "";

    // BUG FIX 2 : afficher les pièces jointes persistées dans le message
    const attachments = (() => {
      if (!msg.attachments) return [];
      if (Array.isArray(msg.attachments)) return msg.attachments;
      if (typeof msg.attachments === "string") {
        try {
          const parsed = JSON.parse(msg.attachments);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    })();

    attachments.forEach((att) => {
      if (att.type === "image") {
        bubbleContent += `<br/><img src="${att.url}" class="bubble-img" alt="image" data-src="${att.url}"/>`;
      } else {
        bubbleContent += `<br/><a class="bubble-attachment" href="${att.url}" download="${att.name || "fichier"}" target="_blank">
          <div class="att-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
          <div class="att-info"><div class="att-name">${att.name || "Fichier"}</div><div class="att-size">${att.size ? formatBytes(att.size) : ""}</div></div>
        </a>`;
      }
    });

    // Couleur du nom d'expéditeur dans les groupes (BUG FIX : couleur dédiée par user)
    const senderLabelColor = isGroupe && !isMe ? avColor : "var(--text-muted)";

    wrapper.innerHTML = `
      <div class="${rowClass}">
        ${!isMe ? `<div class="msg-av" style="${avStyle}">${!avatarUrl ? letter : ""}</div>` : ""}
        <div class="msg-body">
          ${!isMe ? `<div class="msg-sender" style="color:${senderLabelColor};font-weight:600;">${senderName}</div>` : ""}
          <div class="bubble-content">
            <div class="bubble ${bubbleClass}">${bubbleContent}</div>
            <div class="msg-menu-btn" data-id="${msg.id}">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <circle cx="5" cy="12" r="2" fill="url(#gradientDots)"/>
                <circle cx="12" cy="12" r="2" fill="url(#gradientDots)"/>
                <circle cx="19" cy="12" r="2" fill="url(#gradientDots)"/>
              </svg>
            </div>
          </div>
          <div class="msg-time">${time}</div>
        </div>
      </div>`;
    chatBox.appendChild(wrapper);
  });

  // Re-bind menu contextuel
  const msgMenu = document.getElementById("msgMenu");
  chatBox.querySelectorAll(".msg-menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedMessageId = btn.dataset.id;
      if (msgMenu) {
        msgMenu.style.top = e.pageY + "px";
        msgMenu.style.left = Math.max(0, e.pageX - 150) + "px";
        msgMenu.classList.remove("hidden");
      }
    });
  });

  // Lightbox sur les images
  chatBox.querySelectorAll(".bubble-img").forEach((img) => {
    img.addEventListener("click", () =>
      openLightbox(img.dataset.src || img.src),
    );
  });

  chatBox.scrollTop = chatBox.scrollHeight;
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
  lb?.addEventListener("click", () => lb.classList.remove("active"));
}

// ============================================================
// COMPOSER & ENVOI
// ============================================================
async function handleSendMessage(e) {
  if (e) e.preventDefault();
  if (!userInput) return;

  const text = userInput.value.trim();
  const hasPending = pendingFiles.length > 0;
  if (!text && !hasPending) return;

  // BUG FIX 3 : utiliser activeConversationId (la vraie clé) au lieu de chatWithTitle.textContent
  const conversationKey = activeConversationId;
  if (!conversationKey) return;

  const isGroupe = conversationKey.startsWith("groupe__");

  // Upload les fichiers en attente
  let uploadedAttachments = [];
  if (hasPending) {
    uploadedAttachments = await uploadPendingFiles();
    pendingFiles = [];
    renderAttachmentsPreview();
  }

  const token = getAuthToken();

  if (isGroupe) {
    // Envoi groupe : on envoie un message à chaque participant
    const groupe = groupeStore[conversationKey];
    if (!groupe) return;
    const receivers = groupe.participants.filter((p) => p !== currentUser);

    // Créer un pseudo-message local immédiatement pour affichage réactif
    const localMsg = {
      id: "local_" + Date.now(),
      sender: currentUser,
      receiver: receivers[0] || "",
      sender_id: null,
      receiver_id: null,
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

    // BUG FIX 1 : encoder le groupeId dans le sujet pour que les destinataires
    // puissent reconstruire la conversation groupée à la réception
    const membersForEncoding = groupe.participants
      .filter((p) => p !== currentUser)
      .map((p) => ({ pseudo: p, email: userEmailStore[p] || "" }))
      .filter((p) => p.email); // ne pas encoder les membres sans email connu
    const groupeSubject = buildGroupeSubject(
      conversationKey,
      groupe.name,
      "",
      membersForEncoding,
    );

    for (const p of receivers) {
      const receiverId = Number(receiverIdStore[p]);
      const email = userEmailStore[p];

      // BUG FIX 2 : inclure les attachments dans le payload
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
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          console.error("[GROUPE SEND] Erreur envoi à", p);
        }
      } catch (err) {
        console.error("[GROUPE SEND]", err);
      }
    }
    return;
  }

  // Conversation normale 1-à-1
  const receiverId = Number(receiverIdStore[conversationKey]);
  const email = userEmailStore[conversationKey];

  // BUG FIX 2 : inclure les attachments dans le payload
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

    // BUG FIX 2 : enrichir le message local avec les attachments pour affichage immédiat
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
      if (existIdx >= 0) {
        messagesStore[conversationKey][existIdx].attachments =
          uploadedAttachments;
      } else {
        messagesStore[conversationKey].push(localMsg);
      }
    }

    userInput.value = "";
    userInput.style.height = "auto";

    await loadAllConversations();
    await loadConversation(conversationKey);
  } catch (err) {
    console.error("[ERROR] Erreur envoi message :", err);
  }
}

function initComposer() {
  userInput?.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 80) + "px";
  });
  userInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });
  sendBtn?.addEventListener("click", handleSendMessage);
  document.querySelectorAll(".comp-tag").forEach((tag) => {
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
  const cancelEl = document.getElementById("newMsgCancel");
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
    ?.addEventListener("click", open);
  closeEl?.addEventListener("click", close);
  cancelEl?.addEventListener("click", close);
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
      if (pseudo) pseudo.value = "";
      if (email) email.value = "";
      if (objet) objet.value = "";
      if (body) body.value = "";
      close();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'envoi du message au serveur.");
    }
  });
}

// ============================================================
// POPUP GROUPE
// ============================================================
let groupeParticipants = []; // { pseudo, email }

function getUserGradient(username) {
  getUserColor(username);
  return getUserSolidColor(username);
}

function renderGroupeParticipants() {
  const container = document.getElementById("groupe-participants-list");
  if (!container) return;
  container.innerHTML = groupeParticipants
    .map((p, idx) => {
      const color = getUserGradient(p.pseudo);
      return `<span class="groupe-participant-tag" style="background:${color}">
      ${p.pseudo}
      <span class="remove-p" data-idx="${idx}">×</span>
    </span>`;
    })
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
  const cancelEl = document.getElementById("groupeCancel");
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
    ?.addEventListener("click", open);
  closeEl?.addEventListener("click", close);
  cancelEl?.addEventListener("click", close);
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

    // Créer le groupe en mémoire
    groupeStore[groupeId] = { name: nom, participants: allParticipants };
    saveGroupesToStorage();

    // BUG FIX 1 : encoder le groupeId dans le sujet pour reconstruction côté destinataire
    const groupeSubject = buildGroupeSubject(
      groupeId,
      nom,
      objet,
      groupeParticipants, // [{ pseudo, email }] déjà disponible dans ce scope
    );
    // Message initial local
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

    // Envoyer le message initial à chaque participant avec le sujet encodé
    for (const p of groupeParticipants) {
      const receiverId = Number(receiverIdStore[p.pseudo]);
      const email = p.email || userEmailStore[p.pseudo];
      const payload =
        receiverId && !isNaN(receiverId)
          ? { receiverId, body, subject: groupeSubject }
          : {
              pseudo: p.pseudo,
              email,
              body,
              subject: groupeSubject,
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
        console.error("[GROUPE INIT SEND]", err);
      }
    }

    // Réinitialiser popup
    const gNom = document.getElementById("groupeNom");
    const gObjet = document.getElementById("groupeObjet");
    const gBody = document.getElementById("groupeBody");
    if (gNom) gNom.value = "";
    if (gObjet) gObjet.value = "";
    if (gBody) gBody.value = "";
    groupeParticipants = [];
    renderGroupeParticipants();
    close();

    // Rafraîchir et ouvrir le groupe
    await loadAllConversations();

    // BUG FIX 3 : ouvrir le groupe via data-user (la vraie clé groupeId)
    const convEl = document.querySelector(
      `.conversation[data-user="${groupeId}"]`,
    );
    if (convEl) convEl.click();
  });
}

// Persistance groupes dans localStorage
function saveGroupesToStorage() {
  try {
    localStorage.setItem("aigent_groupes", JSON.stringify(groupeStore));
  } catch (e) {
    console.warn("groupes save error", e);
  }
}
function loadGroupesFromStorage() {
  try {
    const raw = localStorage.getItem("aigent_groupes");
    if (!raw) return;
    const data = JSON.parse(raw);
    // Merge sans écraser ce qui a déjà été reconstruit depuis les messages
    Object.keys(data).forEach((k) => {
      if (!groupeStore[k]) groupeStore[k] = data[k];
    });
  } catch (e) {
    console.warn("groupes load error", e);
  }
}

// ============================================================
// CHAT ACTIONS (bas)
// ============================================================
function initChatActions() {
  document
    .getElementById("btn-reply")
    ?.addEventListener("click", () => userInput?.focus());

  document.querySelectorAll(".chat-actions .action-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      // BUG FIX 3 : utiliser activeConversationId
      const conversationKey = activeConversationId;
      if (!conversationKey) {
        alert("Aucune conversation sélectionnée.");
        return;
      }

      if (btn.id === "btn-archive") {
        alert(`Conversation archivée.`);
      } else if (btn.id === "btn-delete") {
        const msgs = messagesStore[conversationKey] || [];
        const isGroupe = conversationKey.startsWith("groupe__");
        if (!msgs.length && !isGroupe) {
          alert("Aucune conversation à supprimer.");
          return;
        }
        if (
          !confirm(
            `Supprimer toute la conversation avec ${isGroupe ? groupLabel(conversationKey) : conversationKey} ?`,
          )
        )
          return;
        try {
          if (isGroupe) {
            delete groupeStore[conversationKey];
            delete messagesStore[conversationKey];
            conversationStore.delete(conversationKey);
            saveGroupesToStorage();
          } else {
            const token = getAuthToken();
            if (!token) throw new Error("Token manquant");
            const receiverId = receiverIdStore[conversationKey];
            await fetch(`/api/conversations/${receiverId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            delete messagesStore[conversationKey];
            conversationStore.delete(conversationKey);
          }
          document
            .querySelector(`.conversation[data-user='${conversationKey}']`)
            ?.remove();
          resetChatZone();
          alert("Conversation supprimée !");
        } catch (err) {
          console.error(err);
          alert("Erreur suppression");
        }
      } else if (btn.id === "btn-block") {
        alert(`Utilisateur bloqué.`);
      }
    });
  });
}

// ============================================================
// MENU CONTEXTUEL BULLE
// ============================================================
function initContextMenu() {
  const msgMenu = document.getElementById("msgMenu");
  msgMenu?.addEventListener("click", async (e) => {
    const action = e.target.closest(".menu-item")?.dataset.action;
    if (!action) return;

    // BUG FIX 3 : utiliser activeConversationId
    const conversationKey = activeConversationId;
    if (!conversationKey) {
      msgMenu.classList.add("hidden");
      return;
    }
    const msgs = messagesStore[conversationKey] || [];
    const msg = msgs.find((m) => String(m.id) === String(selectedMessageId));
    if (!msg) {
      msgMenu.classList.add("hidden");
      return;
    }

    if (action === "copy") {
      navigator.clipboard.writeText(msg.body);
      alert("Message copié !");
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
        messagesStore[conversationKey] = msgs.filter((m) => m.id !== msg.id);
        await loadConversation(conversationKey);
      } catch (err) {
        console.error(err);
      }
    }
    if (action === "save") {
      console.log("Message enregistré :", msg);
      alert("Message enregistré.");
    }
    msgMenu.classList.add("hidden");
  });

  document.addEventListener("click", () => msgMenu?.classList.add("hidden"));
}

// ============================================================
// STATUT EN LIGNE (simulation)
// ============================================================
function updateOnlineStatus() {
  const status = document.getElementById("chat-status");
  if (!status) return;
  const isOnline = Math.random() > 0.5;
  status.textContent = isOnline ? "En ligne" : "Hors ligne";
  status.className = "status" + (isOnline ? " online" : " offline");
}

// ============================================================
// SWIPE MOBILE
// ============================================================
function initMobileSwipe() {
  if (window.innerWidth > 768 || !mobileWrapper) return;
  let startX = 0,
    currentX = 0,
    isSwiping = false;

  mobileWrapper.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
      isSwiping = false;
    },
    { passive: true },
  );

  mobileWrapper.addEventListener(
    "touchmove",
    (e) => {
      currentX = e.touches[0].clientX;
      const diffX = currentX - startX;
      isSwiping = true;
      let translate = mobileWrapper.classList.contains("show-chat")
        ? -window.innerWidth
        : 0;
      mobileWrapper.style.transition = "none";
      mobileWrapper.style.transform = `translateX(${translate + diffX}px)`;
    },
    { passive: true },
  );

  mobileWrapper.addEventListener("touchend", () => {
    mobileWrapper.style.transition =
      "transform 0.35s cubic-bezier(0.4,0,0.2,1)";
    if (!isSwiping) return;
    const diff = currentX - startX;
    if (diff > 80) {
      mobileWrapper.classList.remove("show-chat");
      mobileWrapper.style.transform = "";
    } else if (diff < -80) {
      mobileWrapper.classList.add("show-chat");
      mobileWrapper.style.transform = "";
    } else mobileWrapper.style.transform = "";
  });
}

// ============================================================
// BOOTSTRAP
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const user = localStorage.getItem("agent_user");
  if (!user) {
    console.warn("[AUTH] Aucun utilisateur connecté");
    window.location.href = "index.html";
    return;
  }

  initTheme();
  initSidebar();
  initMobileViews();
  initTabs();
  initSearch();
  initComposer();
  initUploadButtons();
  initNewMsgPopup();
  initGroupePopup();
  initChatActions();
  initContextMenu();
  initLightbox();
  initMobileSwipe();

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.classList.remove("hidden");
    logoutBtn.addEventListener("click", logout);
  }

  setInterval(updateOnlineStatus, 5000);

  loadAllConversations();
});
