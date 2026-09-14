/* ════════════════════════════════════════════════════════════════════════
   MON AIGENT EMPLOI — MESSAGERIE (front complet)
   Branché sur : messagerie-emploi.html / son CSS / server-emploi.js
   + les routes ajoutées dans server-emploi-ADDITIONS-messagerie.js

   Sommaire des sections :
     1. CONFIG & UTILITAIRES
     2. API (wrapper fetch)
     3. STATE
     4. DOM SHORTCUTS
     5. AUTH / SESSION / BOOTSTRAP
     6. THEME / RAIL / DROPDOWNS GÉNÉRIQUES
     7. PRÉSENCE
     8. CONVERSATIONS (chargement, regroupement, rendu liste)
     9. MESSAGES (rendu fil, envoi, réponse, édition, suppression)
    10. PIÈCES JOINTES (upload + rendu)
    11. RÉACTIONS (locales) & EMOJI PICKER
    12. GROUPES (création, invitation, détails)
    13. MODALES (nouveau message, nouveau groupe, invite, mention,
                 recherche, édition, confirmation)
    14. MENU CONTEXTUEL MESSAGE
    15. EXPORT CONVERSATION (.txt)
    16. RACCOURCIS CLAVIER / CLIC EXTÉRIEUR
    17. BOOT
   ════════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  /* Garde-fou : si ce script est exécuté une deuxième fois sur la même page
     (balise <script> dupliquée, template partiel réinclus, rechargement
     partiel du DOM…), on arrête tout de suite. Sans ça, une deuxième
     instance attache ses propres écouteurs sur les mêmes boutons/textarea,
     et un seul clic ou un seul Entrée déclenche deux envois identiques. */
  if (window.__aigentEmploiMessagerieBooted) return;
  window.__aigentEmploiMessagerieBooted = true;

  /* ────────────────────────── 1. CONFIG & UTILITAIRES ────────────────────────── */

  const TOKEN_KEYS = ["emploiToken", "emploi_token", "token", "authToken"];
  const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const LOGIN_REDIRECT = "/login-emploi.html";
  const PRESENCE_PING_MS = 20000;
  const PRESENCE_POLL_MS = 20000;
  const MESSAGES_POLL_MS = 4000;
  const PRESENCE_WINDOW_MS = 45000;

  const AVATAR_PALETTE = [
    "#3a7d3a",
    "#2f6f5e",
    "#5a8f3a",
    "#3a6f8f",
    "#7a6a2f",
    "#4a5a3a",
    "#2f5a4a",
    "#5a4a2f",
  ];

  function looksLikeJwt(v) {
    return typeof v === "string" && JWT_RE.test(v);
  }

  /** Recherche robuste du jeton : clés connues d'abord, puis scan complet de
   *  localStorage/sessionStorage (valeur brute JWT, ou objet JSON contenant
   *  un champ token/jwt/accessToken). Évite les faux "déconnecté" si une
   *  autre page du site stocke le jeton sous un nom ou un format différent. */
  function getToken() {
    for (const k of TOKEN_KEYS) {
      const v = localStorage.getItem(k);
      if (looksLikeJwt(v)) return v;
    }
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        const raw = storage.getItem(key);
        if (looksLikeJwt(raw)) return raw;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            for (const field of [
              "token",
              "jwt",
              "accessToken",
              "authToken",
              "emploiToken",
            ]) {
              if (looksLikeJwt(parsed[field])) return parsed[field];
            }
          }
        } catch {}
      }
    }
    return null;
  }
  function clearSession() {
    TOKEN_KEYS.forEach((k) => localStorage.removeItem(k));
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  function initials(name) {
    const clean = String(name || "?").trim();
    if (!clean) return "?";
    const parts = clean.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }

  function colorFor(name) {
    const s = String(name || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  }

  function fmtClock(dateLike) {
    const d = new Date(dateLike);
    return d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function fmtDaySeparator(dateLike) {
    const d = new Date(dateLike);
    const today = new Date();
    const yest = new Date(today);
    yest.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    if (sameDay(d, today)) return "Aujourd'hui";
    if (sameDay(d, yest)) return "Hier";
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  }

  function fmtRelativeShort(dateLike) {
    const d = new Date(dateLike);
    const diffMs = Date.now() - d.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days} j`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  function fmtFileSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  /** Écrase les suites de 3+ sauts de ligne en 1 seul saut vide (paragraphe) —
   *  évite les messages "étirés" verticalement quand le texte contient des
   *  doubles/triples retours à la ligne (courant dans les messages générés). */
  function normalizeMessageBody(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function uid() {
    return (
      crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }

  /* ────────────────────────── 2. API (wrapper fetch) ────────────────────────── */

  const Api = {
    async request(path, { method = "GET", body, isForm = false } = {}) {
      const token = getToken();
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (!isForm && body !== undefined)
        headers["Content-Type"] = "application/json";

      let res;
      try {
        res = await fetch(path, {
          method,
          headers,
          body:
            body === undefined
              ? undefined
              : isForm
                ? body
                : JSON.stringify(body),
        });
      } catch (netErr) {
        throw { network: true, message: "Connexion au serveur impossible." };
      }

      if (res.status === 401 || res.status === 403) {
        clearSession();
        window.location.href = LOGIN_REDIRECT;
        throw { auth: true, message: "Session expirée." };
      }

      let data = null;
      try {
        data = await res.json();
      } catch {
        /* pas de corps JSON */
      }

      if (!res.ok) {
        throw { status: res.status, message: data?.error || "Erreur serveur." };
      }
      return data;
    },
    get(path) {
      return this.request(path);
    },
    post(path, body) {
      return this.request(path, { method: "POST", body });
    },
    patch(path, body) {
      return this.request(path, { method: "PATCH", body });
    },
    del(path, body) {
      return this.request(path, { method: "DELETE", body });
    },
    upload(path, formData) {
      return this.request(path, {
        method: "POST",
        body: formData,
        isForm: true,
      });
    },
  };

  /* ────────────────────────── 3. STATE ────────────────────────── */

  const State = {
    me: null,
    conversations: new Map(),
    activeKey: null,
    filter: "all",
    sort: "recent",
    compact: false,
    searchTerm: "",
    archivedKeys: new Set(),
    blockedUsernames: new Set(),
    presence: new Map(),
    replyTo: null,
    pendingAttachments: [],
    localReactions: {},
    ctxTargetId: null,
    editingId: null,
    groupParticipants: [],
    lastMessageCount: -1,
    lastRenderedCount: new Map(),
    detailsForKey: null,
  };

  function saveLocal(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }
  function loadLocal(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }

  State.localReactions = loadLocal("emploi_msg_reactions", {});
  const mutedGroups = new Set(loadLocal("emploi_muted_groups", []));

  /* ────────────────────────── 4. DOM SHORTCUTS ────────────────────────── */

  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const dom = {
    shell: $("shell"),
    rail: $("rail"),
    btnRailToggle: $("btnRailToggle"),
    railNewMsg: $("railNewMsg"),
    railNewMsgMain: $("railNewMsgMain"),
    railNewMsgArrow: $("railNewMsgArrow"),
    railNewDropdown: $("railNewDropdown"),
    railBtnDirect: $("railBtnDirect"),
    railBtnGroup: $("railBtnGroup"),

    convPanel: $("convPanel"),
    btnNewDropdown: $("btnNewDropdown"),
    newDropdown: $("newDropdown"),
    btnOpenNewMsg: $("btnOpenNewMsg"),
    btnOpenNewGroup: $("btnOpenNewGroup"),
    searchConv: $("searchConv"),
    btnConvSettings: $("btnConvSettings"),
    convSettingsDropdown: $("convSettingsDropdown"),
    btnMarkAllRead: $("btnMarkAllRead"),
    btnToggleCompact: $("btnToggleCompact"),
    compactLabel: $("compactLabel"),
    btnThemeSwitch: $("btnThemeSwitch"),
    themeLabel: $("themeLabel"),
    convTabs: qsa(".conv-tab"),
    unreadBadge: $("unreadBadge"),
    conversationsContainer: $("conversationsContainer"),
    meAvatar: $("meAvatar"),
    meName: $("meName"),
    meStatus: $("meStatus"),
    btnLogout: $("btnLogout"),

    chatPanel: $("chatPanel"),
    btnBackToList: $("btnBackToList"),
    chatAvatarWrap: $("chatAvatarWrap"),
    chatTitle: $("chatTitle"),
    chatSubtitle: $("chatSubtitle"),
    btnSearchInChat: $("btnSearchInChat"),
    btnHeaderTheme: $("btnHeaderTheme"),
    btnToggleDetails: $("btnToggleDetails"),
    btnChatMore: $("btnChatMore"),
    chatMoreDropdown: $("chatMoreDropdown"),
    btnArchive: $("btnArchive"),
    archiveLabel: $("archiveLabel"),
    btnExportConv: $("btnExportConv"),
    btnBlock: $("btnBlock"),
    blockLabel: $("blockLabel"),
    btnDeleteConv: $("btnDeleteConv"),

    chatMessages: $("chatMessages"),
    chatEmptyState: $("chatEmptyState"),
    typingRow: $("typingRow"),

    replyBar: $("replyBar"),
    replyName: $("replyName"),
    replyText: $("replyText"),
    replyCancel: $("replyCancel"),

    attachmentsPreview: $("attachmentsPreview"),

    quickRepliesWrap: $("quickRepliesWrap"),
    quickReplies: $("quickReplies"),
    qrPrev: $("qrPrev"),
    qrNext: $("qrNext"),

    composerZone: qs(".composer-zone"),
    btnAttachFile: $("btnAttachFile"),
    btnAttachImage: $("btnAttachImage"),
    btnEmoji: $("btnEmoji"),
    btnMention: $("btnMention"),
    messageInput: $("messageInput"),
    btnSend: $("btnSend"),
    composerStatus: $("composerStatus"),
    inputImages: $("inputImages"),
    inputFiles: $("inputFiles"),

    detailsPanel: $("detailsPanel"),
    btnCloseDetails: $("btnCloseDetails"),
    detailsAvatar: $("detailsAvatar"),
    detailsName: $("detailsName"),
    detailsStatus: $("detailsStatus"),
    btnInvite: $("btnInvite"),
    btnDetailsMore: $("btnDetailsMore"),
    detailsMoreDropdown: $("detailsMoreDropdown"),
    btnArchiveFromDetails: $("btnArchiveFromDetails"),
    archiveLabel2: $("archiveLabel2"),
    btnDeleteFromDetails: $("btnDeleteFromDetails"),
    membersList: $("membersList"),
    btnMuteGroup: $("btnMuteGroup"),
    muteToggle: $("muteToggle"),
    sharedMedia: $("sharedMedia"),
    groupAbout: $("groupAbout"),

    newMsgOverlay: $("newMsgOverlay"),
    nmPseudo: $("nmPseudo"),
    nmEmail: $("nmEmail"),
    nmSubject: $("nmSubject"),
    nmBody: $("nmBody"),
    nmCheckHint: $("nmCheckHint"),
    newMsgClose: $("newMsgClose"),
    nmCancel: $("nmCancel"),
    nmSend: $("nmSend"),

    groupOverlay: $("groupOverlay"),
    grpName: $("grpName"),
    grpParticipants: $("grpParticipants"),
    grpAddPseudo: $("grpAddPseudo"),
    grpAddEmail: $("grpAddEmail"),
    grpAddBtn: $("grpAddBtn"),
    grpSubject: $("grpSubject"),
    grpBody: $("grpBody"),
    groupClose: $("groupClose"),
    groupCancel: $("groupCancel"),
    groupSend: $("groupSend"),

    inviteOverlay: $("inviteOverlay"),
    invPseudo: $("invPseudo"),
    invEmail: $("invEmail"),
    inviteClose: $("inviteClose"),
    inviteCancel: $("inviteCancel"),
    inviteSend: $("inviteSend"),

    mentionOverlay: $("mentionOverlay"),
    mentionList: $("mentionList"),
    mentionClose: $("mentionClose"),
    btnValidateMentions: $("btnValidateMentions"),

    searchOverlay: $("searchOverlay"),
    searchInChat: $("searchInChat"),
    searchResults: $("searchResults"),
    searchClose: $("searchClose"),

    editOverlay: $("editOverlay"),
    editBody: $("editBody"),
    editClose: $("editClose"),
    editCancel: $("editCancel"),
    editSave: $("editSave"),

    confirmOverlay: $("confirmOverlay"),
    confirmTitle: $("confirmTitle"),
    confirmText: $("confirmText"),
    confirmClose: $("confirmClose"),
    confirmCancel: $("confirmCancel"),
    confirmOk: $("confirmOk"),

    msgCtxMenu: $("msgCtxMenu"),
    lightbox: $("lightbox"),
    lightboxImg: $("lightboxImg"),
    lightboxClose: $("lightboxClose"),
    toasts: $("toasts"),
  };

  /* ────────────────────────── icônes svg utilitaires ────────────────────────── */

  const ICONS = {
    ok: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
    err: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    reply:
      '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    smile:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/></svg>',
    check1: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
  };

  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `${ICONS[type] || ICONS.info}<span>${escapeHtml(message)}</span>`;
    dom.toasts.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(12px)";
      setTimeout(() => el.remove(), 220);
    }, 3800);
  }

  /* ────────────────────────── 5. AUTH / SESSION / BOOTSTRAP ────────────────────────── */

  async function bootstrapSession() {
    const token = getToken();
    if (!token) {
      window.location.href = LOGIN_REDIRECT;
      return false;
    }
    try {
      const full = await Api.get("/emploi/api/me/full");
      State.me = {
        id: full.id,
        username: full.username,
        role: full.role,
        contact: full.contact,
        avatar: full.avatar,
        ville: full.ville,
      };
      renderMeRow();
      return true;
    } catch (err) {
      if (!err.auth)
        toast(err.message || "Impossible de charger votre session.", "err");
      return false;
    }
  }

  function renderMeRow() {
    if (!State.me) return;
    dom.meAvatar.textContent = initials(State.me.username);
    dom.meAvatar.style.background = colorFor(State.me.username);
    dom.meName.textContent = State.me.username;
  }

  dom.btnLogout.addEventListener("click", async () => {
    try {
      await Api.post("/api/emploi/logout");
    } catch {}
    clearSession();
    window.location.href = LOGIN_REDIRECT;
  });

  /* ────────────────────────── 6. THEME / RAIL / DROPDOWNS GÉNÉRIQUES ────────────────────────── */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("emploi_theme", theme);
    const label = theme === "dark" ? "Mode jour" : "Mode nuit";
    if (dom.themeLabel) dom.themeLabel.textContent = label;
  }
  function toggleTheme() {
    const current =
      document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  }
  applyTheme(
    localStorage.getItem("emploi_theme") ||
      document.documentElement.getAttribute("data-theme") ||
      "dark",
  );
  dom.btnThemeSwitch?.addEventListener("click", () => {
    toggleTheme();
    closeAllDropdowns();
  });
  dom.btnHeaderTheme?.addEventListener("click", toggleTheme);

  dom.btnRailToggle.addEventListener("click", () => {
    dom.shell.classList.toggle("rail-open");
    saveLocal("emploi_rail_open", dom.shell.classList.contains("rail-open"));
  });
  if (loadLocal("emploi_rail_open", false))
    dom.shell.classList.add("rail-open");

  const DROPDOWNS = [
    { btn: dom.railNewMsgArrow, menu: dom.railNewDropdown },
    { btn: dom.btnNewDropdown, menu: dom.newDropdown },
    { btn: dom.btnConvSettings, menu: dom.convSettingsDropdown },
    { btn: dom.btnChatMore, menu: dom.chatMoreDropdown },
    { btn: dom.btnDetailsMore, menu: dom.detailsMoreDropdown },
  ];

  function closeAllDropdowns(except = null) {
    DROPDOWNS.forEach(({ menu }) => {
      if (menu && menu !== except) menu.classList.add("hidden");
    });
  }
  DROPDOWNS.forEach(({ btn, menu }) => {
    if (!btn || !menu) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains("hidden");
      closeAllDropdowns();
      menu.classList.toggle("hidden", !willOpen);
    });
  });
  document.addEventListener("click", () => closeAllDropdowns());

  dom.railNewMsgMain.addEventListener("click", () => openNewMessageModal());
  dom.railBtnDirect.addEventListener("click", () => {
    closeAllDropdowns();
    openNewMessageModal();
  });
  dom.railBtnGroup.addEventListener("click", () => {
    closeAllDropdowns();
    openNewGroupModal();
  });
  dom.btnOpenNewMsg.addEventListener("click", () => {
    closeAllDropdowns();
    openNewMessageModal();
  });
  dom.btnOpenNewGroup.addEventListener("click", () => {
    closeAllDropdowns();
    openNewGroupModal();
  });

  /* Recherche / tri / filtres / vue compacte */
  dom.searchConv.addEventListener(
    "input",
    debounce((e) => {
      State.searchTerm = e.target.value.trim().toLowerCase();
      renderConversationList();
    }, 150),
  );

  qsa(".sort-opt", dom.convSettingsDropdown).forEach((btn) => {
    btn.addEventListener("click", () => {
      State.sort = btn.dataset.sort;
      qsa(".sort-opt", dom.convSettingsDropdown).forEach((b) =>
        b.classList.toggle("active", b === btn),
      );
      renderConversationList();
      closeAllDropdowns();
    });
  });

  dom.btnMarkAllRead.addEventListener("click", async () => {
    closeAllDropdowns();
    const unreadConvs = [...State.conversations.values()].filter(
      (c) => c.unreadCount > 0,
    );
    for (const c of unreadConvs) await markConversationRead(c);
    toast("Toutes les conversations ont été marquées comme lues.", "ok");
    renderConversationList();
  });

  dom.btnToggleCompact.addEventListener("click", () => {
    State.compact = !State.compact;
    dom.conversationsContainer.classList.toggle("compact", State.compact);
    dom.compactLabel.textContent = State.compact
      ? "Vue confortable"
      : "Vue compacte";
    saveLocal("emploi_compact", State.compact);
    closeAllDropdowns();
  });
  if (loadLocal("emploi_compact", false)) {
    State.compact = true;
    dom.conversationsContainer.classList.add("compact");
    dom.compactLabel.textContent = "Vue confortable";
  }

  dom.convTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      dom.convTabs.forEach((t) => t.classList.toggle("active", t === tab));
      State.filter = tab.dataset.filter;
      renderConversationList();
    });
  });

  /* ────────────────────────── 7. PRÉSENCE ────────────────────────── */

  async function pingPresence() {
    try {
      await Api.post("/emploi/api/presence/ping");
    } catch {}
  }

  async function pollPresence() {
    const usernames = new Set();
    for (const c of State.conversations.values()) {
      if (c.type === "direct") usernames.add(c.name);
      if (c.type === "group") c.members.forEach((m) => usernames.add(m.pseudo));
    }
    usernames.delete(State.me?.username);
    if (!usernames.size) return;
    try {
      const data = await Api.get(
        `/emploi/api/presence?usernames=${encodeURIComponent([...usernames].join(","))}`,
      );
      Object.entries(data).forEach(([u, v]) =>
        State.presence.set(u.toLowerCase(), v),
      );
      renderConversationList(true);
      updateChatHeaderPresence();
    } catch {}
  }

  function isOnline(username) {
    const p = State.presence.get((username || "").toLowerCase());
    return !!p?.online;
  }

  /* ────────────────────────── 8. CONVERSATIONS ────────────────────────── */

  function parseGroupSubject(subject) {
    const m =
      /^\[Groupe:(.*?)\|ID:(.*?)\|MEMBERS:(.*?)\](?:\s([\s\S]*))?$/.exec(
        subject || "",
      );
    if (!m) return null;
    const [, groupName, groupId, membersRaw, objet] = m;
    const members = membersRaw
      .split(",")
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf(":");
        return idx === -1
          ? { pseudo: pair, email: "" }
          : { pseudo: pair.slice(0, idx), email: pair.slice(idx + 1) };
      });
    return { groupName, groupId, members, objet: (objet || "").trim() };
  }

  function buildConversations(rawMessages) {
    const me = State.me.username;
    const map = new Map();

    for (const m of rawMessages) {
      const group = parseGroupSubject(m.subject);
      let key;
      if (group) {
        key = `group:${group.groupId}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            type: "group",
            groupId: group.groupId,
            name: group.groupName,
            members: [],
            objet: "",
            messages: [],
          });
        }
        const conv = map.get(key);
        conv.name = group.groupName;
        if (group.objet) conv.objet = group.objet;
        for (const mem of group.members) {
          if (mem.pseudo.toLowerCase() === me.toLowerCase()) continue;
          if (
            !conv.members.some(
              (x) => x.pseudo.toLowerCase() === mem.pseudo.toLowerCase(),
            )
          )
            conv.members.push(mem);
        }
      } else {
        const other =
          m.sender.toLowerCase() === me.toLowerCase() ? m.receiver : m.sender;
        const otherEmail =
          m.sender.toLowerCase() === me.toLowerCase()
            ? m.receiverEmail
            : m.senderEmail;
        key = `direct:${other}`;
        if (!map.has(key))
          map.set(key, {
            key,
            type: "direct",
            name: other,
            email: otherEmail,
            messages: [],
          });
      }
      map.get(key).messages.push(m);
    }

    for (const conv of map.values()) {
      conv.messages.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
      );
      conv.lastMessage = conv.messages[conv.messages.length - 1] || null;
      conv.lastTimestamp = conv.lastMessage?.timestamp || null;
      conv.unreadCount = conv.messages.filter(
        (mm) => mm.receiver.toLowerCase() === me.toLowerCase() && !mm.read,
      ).length;
    }
    return map;
  }

  async function loadArchivedAndBlocked() {
    try {
      const [archived, blocked] = await Promise.all([
        Api.get("/emploi/api/conversations/archived"),
        Api.get("/emploi/api/users/blocked"),
      ]);
      State.archivedKeys = new Set(archived);
      State.blockedUsernames = new Set(blocked.map((u) => u.toLowerCase()));
    } catch (err) {
      // Non bloquant : la messagerie reste utilisable sans ces filtres.
    }
  }

  async function loadMessages({ silent = false } = {}) {
    try {
      const rows = await Api.get("/emploi/api/messages");
      if (rows.length === State.lastMessageCount && silent) return; // rien de nouveau
      State.lastMessageCount = rows.length;
      const previousActive = State.activeKey;
      State.conversations = buildConversations(rows);
      renderConversationList();
      if (previousActive && State.conversations.has(previousActive)) {
        renderChatMessages(previousActive, { keepScroll: silent });
        renderDetailsPanel();
      } else if (previousActive && !silent) {
        // La conversation active a disparu (supprimée ailleurs) → retour à l'état vide.
        State.activeKey = null;
        renderEmptyChat();
      }
    } catch (err) {
      if (!silent)
        toast(err.message || "Impossible de charger les messages.", "err");
    }
  }

  function getConversationLabel(conv) {
    if (State.searchTerm) {
      const hay = `${conv.name} ${conv.lastMessage?.body || ""}`.toLowerCase();
      return hay.includes(State.searchTerm);
    }
    return true;
  }

  function visibleConversations() {
    let list = [...State.conversations.values()].filter(getConversationLabel);

    if (State.filter === "archived") {
      list = list.filter((c) => State.archivedKeys.has(c.key));
    } else {
      list = list.filter((c) => !State.archivedKeys.has(c.key));
      if (State.filter === "unread")
        list = list.filter((c) => c.unreadCount > 0);
      if (State.filter === "groups")
        list = list.filter((c) => c.type === "group");
    }

    if (State.sort === "alpha") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (State.sort === "unread") {
      list.sort(
        (a, b) =>
          b.unreadCount - a.unreadCount ||
          new Date(b.lastTimestamp) - new Date(a.lastTimestamp),
      );
    } else {
      list.sort(
        (a, b) =>
          new Date(b.lastTimestamp || 0) - new Date(a.lastTimestamp || 0),
      );
    }
    return list;
  }

  function renderConversationList(presenceOnly = false) {
    const totalUnread = [...State.conversations.values()].reduce(
      (s, c) => s + (State.archivedKeys.has(c.key) ? 0 : c.unreadCount),
      0,
    );
    dom.unreadBadge.textContent = totalUnread;
    dom.unreadBadge.classList.toggle("hidden", totalUnread === 0);

    if (presenceOnly) {
      qsa(".conv-item", dom.conversationsContainer).forEach((el) => {
        const conv = State.conversations.get(el.dataset.key);
        if (!conv || conv.type !== "direct") return;
        const dot = qs(".presence-dot", el);
        if (dot) dot.classList.toggle("online", isOnline(conv.name));
      });
      return;
    }

    const list = visibleConversations();
    dom.conversationsContainer.innerHTML = "";

    if (!list.length) {
      const msg =
        State.filter === "archived"
          ? "Aucune conversation archivée."
          : State.searchTerm
            ? "Aucun résultat pour cette recherche."
            : "Aucune conversation pour l'instant. Démarrez-en une avec le bouton « + ».";
      dom.conversationsContainer.innerHTML = `<div class="conv-empty">${escapeHtml(msg)}</div>`;
      return;
    }

    for (const conv of list) {
      dom.conversationsContainer.appendChild(renderConvItem(conv));
    }
  }

  function renderConvItem(conv) {
    const el = document.createElement("div");
    el.className = `conv-item ${conv.key === State.activeKey ? "active" : ""} ${conv.unreadCount > 0 ? "has-unread" : ""}`;
    el.dataset.key = conv.key;

    let avatarHtml;
    if (conv.type === "group") {
      const members = conv.members.slice(0, 2);
      avatarHtml = `<div class="conv-avatar-group">
        ${
          members
            .map(
              (m, i) =>
                `<div class="sub" style="background:${colorFor(m.pseudo)}">${initials(m.pseudo)}</div>`,
            )
            .join("") ||
          `<div class="sub" style="background:${colorFor(conv.name)}">${initials(conv.name)}</div>`
        }
      </div>`;
    } else {
      avatarHtml = `<div class="conv-avatar" style="background:${colorFor(conv.name)}">${initials(conv.name)}
        <span class="presence-dot ${isOnline(conv.name) ? "online" : ""}"></span></div>`;
    }

    const lastBody = conv.lastMessage
      ? conv.lastMessage.attachments?.length
        ? "📎 Pièce jointe".replace("📎", "") || "Pièce jointe"
        : escapeHtml(conv.lastMessage.body)
      : "Aucun message";
    const prefix =
      conv.lastMessage &&
      conv.lastMessage.sender.toLowerCase() === State.me.username.toLowerCase()
        ? "Vous : "
        : "";

    el.innerHTML = `
      ${avatarHtml}
      <div class="conv-info">
        <div class="conv-top">
          <div class="conv-name">${conv.type === "group" ? `<span class="group-pill">Groupe</span>` : ""}${escapeHtml(conv.name)}</div>
          <div class="conv-time">${conv.lastTimestamp ? fmtRelativeShort(conv.lastTimestamp) : ""}</div>
        </div>
        <div class="conv-preview">${prefix}${lastBody || ""}</div>
      </div>
      <div class="conv-meta">
        ${conv.unreadCount > 0 ? `<span class="unread-dot"></span>` : ""}
        <button class="conv-delete" title="Supprimer la conversation">${ICONS.trash}</button>
      </div>
    `;

    el.addEventListener("click", () => selectConversation(conv.key));
    qs(".conv-delete", el).addEventListener("click", (e) => {
      e.stopPropagation();
      confirmAction({
        title: "Supprimer la conversation",
        text: `Cette action supprimera définitivement votre copie de la conversation avec « ${conv.name} ».`,
        onConfirm: () => deleteConversation(conv),
      });
    });

    return el;
  }

  async function markConversationRead(conv) {
    try {
      if (conv.type === "group")
        await Api.post("/emploi/api/messages/mark-read", {
          groupId: conv.groupId,
        });
      else
        await Api.post("/emploi/api/messages/mark-read", {
          otherUsername: conv.name,
        });
      conv.messages.forEach((m) => {
        if (m.receiver.toLowerCase() === State.me.username.toLowerCase())
          m.read = true;
      });
      conv.unreadCount = 0;
    } catch {}
  }

  async function deleteConversation(conv) {
    try {
      await Api.post("/emploi/api/conversations/delete", {
        type: conv.type,
        key: conv.type === "group" ? conv.groupId : conv.name,
      });
      State.conversations.delete(conv.key);
      if (State.activeKey === conv.key) {
        State.activeKey = null;
        renderEmptyChat();
      }
      renderConversationList();
      toast("Conversation supprimée.", "ok");
    } catch (err) {
      toast(err.message || "Suppression impossible.", "err");
    }
  }

  /* ────────────────────────── sélection d'une conversation ────────────────────────── */

  async function selectConversation(key) {
    if (!State.conversations.has(key)) return;
    State.activeKey = key;
    State.replyTo = null;
    newSinceScroll = 0;
    dom.replyBar.classList.add("hidden");
    dom.shell.classList.add("show-chat");
    renderConversationList();
    renderChatHeader(key);
    renderChatMessages(key);
    renderQuickReplies();
    const conv = State.conversations.get(key);
    if (conv.unreadCount > 0) await markConversationRead(conv);
    renderConversationList();
    pollPresence();
    if (dom.shell.classList.contains("details-open")) renderDetailsPanel();
  }

  dom.btnBackToList.addEventListener("click", () =>
    dom.shell.classList.remove("show-chat"),
  );

  function renderEmptyChat() {
    dom.chatEmptyState.classList.remove("hidden");
    qsa(".msg-wrap, .day-sep", dom.chatMessages).forEach((n) => n.remove());
    dom.chatTitle.textContent = "Sélectionnez une conversation";
    dom.chatSubtitle.textContent = "";
    dom.chatSubtitle.classList.remove("online");
    dom.chatAvatarWrap.innerHTML = ""; // pas d'avatar générique tant que rien n'est choisi
    dom.shell.classList.remove("show-chat");
    dom.shell.classList.remove("details-open");
    renderDetailsPanel();
  }

  function renderChatHeader(key) {
    const conv = State.conversations.get(key);
    if (!conv) return;
    if (conv.type === "group") {
      const members = conv.members.slice(0, 2);
      dom.chatAvatarWrap.innerHTML = `<div class="chat-av-group">
        ${members.map((m) => `<div class="sub" style="background:${colorFor(m.pseudo)}">${initials(m.pseudo)}</div>`).join("")}
      </div>`;
      dom.chatTitle.textContent = conv.name;
      dom.chatSubtitle.textContent = `${conv.members.length + 1} membres`;
      dom.chatSubtitle.classList.remove("online");
      dom.btnBlock.parentElement.style.display = "";
      dom.blockLabel.textContent = "Bloquer";
      dom.btnBlock.disabled = true;
      dom.btnBlock.title = "Le blocage n'est pas disponible pour les groupes";
    } else {
      dom.chatAvatarWrap.innerHTML = `<div class="chat-av" style="background:${colorFor(conv.name)}">${initials(conv.name)}
        <span class="presence-dot ${isOnline(conv.name) ? "online" : ""}"></span></div>`;
      dom.chatTitle.textContent = conv.name;
      updateChatHeaderPresence();
      dom.btnBlock.disabled = false;
      dom.btnBlock.title = "";
      dom.blockLabel.textContent = State.blockedUsernames.has(
        conv.name.toLowerCase(),
      )
        ? "Débloquer"
        : "Bloquer";
    }
    dom.archiveLabel.textContent = State.archivedKeys.has(key)
      ? "Désarchiver"
      : "Archiver";
    dom.chatEmptyState.classList.add("hidden");
  }

  function updateChatHeaderPresence() {
    const conv = State.conversations.get(State.activeKey);
    if (!conv || conv.type !== "direct") return;
    const online = isOnline(conv.name);
    dom.chatSubtitle.textContent = online ? "En ligne" : "Hors ligne";
    dom.chatSubtitle.classList.toggle("online", online);
    const dot = qs(".presence-dot", dom.chatAvatarWrap);
    if (dot) dot.classList.toggle("online", online);
  }

  /* ────────────────────────── 9. MESSAGES ────────────────────────── */

  function findMessageById(id) {
    for (const conv of State.conversations.values()) {
      const m = conv.messages.find((mm) => String(mm.id) === String(id));
      if (m) return m;
    }
    return null;
  }

  function renderChatMessages(key, { keepScroll = false } = {}) {
    const conv = State.conversations.get(key);
    if (!conv) return;
    const scrollBefore = dom.chatMessages.scrollTop;
    const wasAtBottom =
      dom.chatMessages.scrollHeight -
        dom.chatMessages.clientHeight -
        scrollBefore <
      60;
    const previousCount = State.lastRenderedCount.get(key) || 0;
    const newArrived = Math.max(0, conv.messages.length - previousCount);
    State.lastRenderedCount.set(key, conv.messages.length);

    qsa(".msg-wrap, .day-sep", dom.chatMessages).forEach((n) => n.remove());
    dom.chatEmptyState.classList.add("hidden");

    let lastDay = null;
    for (const m of conv.messages) {
      const day = new Date(m.timestamp).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        const sep = document.createElement("div");
        sep.className = "day-sep";
        sep.innerHTML = `<span>${fmtDaySeparator(m.timestamp)}</span>`;
        dom.chatMessages.appendChild(sep);
      }
      dom.chatMessages.appendChild(renderMessageRow(m, conv));
    }

    if (!keepScroll || wasAtBottom) {
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      newSinceScroll = 0;
    } else {
      dom.chatMessages.scrollTop = scrollBefore;
      if (newArrived > 0) newSinceScroll += newArrived;
    }
    updateScrollButton();
  }

  /* Bouton flottant "revenir aux derniers messages" — apparaît quand on a
     remonté dans l'historique et qu'un nouveau message arrive pendant ce temps. */
  let scrollBtnEl = null;
  let newSinceScroll = 0;
  function ensureScrollButton() {
    if (scrollBtnEl) return scrollBtnEl;
    scrollBtnEl = document.createElement("button");
    scrollBtnEl.className = "scroll-bottom-btn";
    scrollBtnEl.type = "button";
    scrollBtnEl.title = "Aller aux derniers messages";
    scrollBtnEl.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg><span class="count hidden"></span>`;
    dom.chatPanel.appendChild(scrollBtnEl);
    scrollBtnEl.addEventListener("click", () => {
      dom.chatMessages.scrollTo({
        top: dom.chatMessages.scrollHeight,
        behavior: "smooth",
      });
    });
    return scrollBtnEl;
  }
  function updateScrollButton() {
    const btn = ensureScrollButton();
    const atBottom =
      dom.chatMessages.scrollHeight -
        dom.chatMessages.clientHeight -
        dom.chatMessages.scrollTop <
      60;
    const countEl = qs(".count", btn);
    if (atBottom) {
      newSinceScroll = 0;
      btn.classList.remove("visible");
      countEl.classList.add("hidden");
    } else {
      btn.classList.add("visible");
      if (newSinceScroll > 0) {
        countEl.textContent =
          newSinceScroll > 9 ? "9+" : String(newSinceScroll);
        countEl.classList.remove("hidden");
      } else {
        countEl.classList.add("hidden");
      }
    }
  }
  dom.chatMessages.addEventListener("scroll", debounce(updateScrollButton, 60));

  function renderMessageRow(m, conv) {
    const me = State.me.username.toLowerCase();
    const isMe = m.sender.toLowerCase() === me;

    const wrap = document.createElement("div");
    wrap.className = "msg-wrap";
    wrap.dataset.id = m.id;

    const senderLabel =
      conv.type === "group" && !isMe
        ? `<div class="msg-sender" style="color:${colorFor(m.sender)}">${escapeHtml(m.sender)}</div>`
        : "";

    const avatarHtml =
      conv.type === "group"
        ? `<div class="msg-av" style="background:${colorFor(m.sender)}">${initials(m.sender)}</div>`
        : "";

    let replyHtml = "";
    if (m.replyToId) {
      const quoted = findMessageById(m.replyToId);
      if (quoted) {
        replyHtml = `<span class="reply-quote"><b>${escapeHtml(quoted.sender)}</b>${escapeHtml((quoted.body || "").slice(0, 90))}</span>`;
      }
    }

    let subjectHtml = "";
    const rawSubject = m.subjectRaw ?? m.subject ?? "";
    if (rawSubject && !rawSubject.startsWith("[Groupe:")) {
      subjectHtml = `<span class="bubble-subject">${escapeHtml(rawSubject)}</span>`;
    }

    const bodyHtml = escapeHtml(normalizeMessageBody(m.body))
      .replace(/\n/g, "<br>")
      .replace(/@([a-zA-Z0-9_.\-]{2,30})/g, '<span class="mention">@$1</span>');
    const attachmentsHtml = renderAttachments(m.attachments);

    const editedHtml = m.edited ? `<span class="edited">(modifié)</span>` : "";
    const readHtml = isMe
      ? `<svg class="${m.read ? "read-ok" : ""}" viewBox="0 0 24 24"><path d="M2 13l4 4L13 8"/><path d="M11 15l2 2 9-10"/></svg>`
      : "";

    const reactions = State.localReactions[m.id];
    const reactionsHtml = reactions
      ? `<div class="reactions">${Object.entries(reactions)
          .map(
            ([emoji, users]) =>
              `<span class="reaction ${users.includes(me) ? "mine" : ""}" data-emoji="${emoji}">${emoji}<b>${users.length}</b></span>`,
          )
          .join("")}</div>`
      : "";

    wrap.innerHTML = `
      <div class="msg-row ${isMe ? "me" : ""}">
        ${avatarHtml}
        <div class="msg-body">
          ${senderLabel}
          <div class="msg-content-wrap">
            <div class="bubble ${isMe ? "me" : "them"}">
              ${replyHtml}${subjectHtml}${bodyHtml}${attachmentsHtml}
            </div>
            <div class="msg-actions">
              <button class="msg-act" data-action="react" title="Réagir">${ICONS.smile}</button>
              <button class="msg-act" data-action="reply" title="Répondre">${ICONS.reply}</button>
              ${isMe && m.body ? `<button class="msg-act" data-action="edit" title="Modifier">${ICONS.edit}</button>` : ""}
              <button class="msg-act" data-action="delete" title="Supprimer">${ICONS.trash}</button>
            </div>
          </div>
          ${reactionsHtml}
          <div class="msg-time">${fmtClock(m.timestamp)}${editedHtml}${readHtml}</div>
        </div>
      </div>
    `;

    qsa("img.bubble-img", wrap).forEach((img) => {
      img.addEventListener("click", () => openLightbox(img.src));
    });

    qs('[data-action="reply"]', wrap)?.addEventListener("click", () =>
      startReply(m),
    );
    qs('[data-action="edit"]', wrap)?.addEventListener("click", () =>
      openEditModal(m),
    );
    qs('[data-action="delete"]', wrap)?.addEventListener("click", () => {
      confirmAction({
        title: "Supprimer le message",
        text: "Ce message sera supprimé de votre côté de la conversation.",
        onConfirm: () => deleteMessage(m),
      });
    });
    qs('[data-action="react"]', wrap)?.addEventListener("click", (e) =>
      openReactionPicker(e.currentTarget, m.id),
    );
    qsa(".reaction", wrap).forEach((r) =>
      r.addEventListener("click", () => toggleReaction(m.id, r.dataset.emoji)),
    );

    wrap.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMessageContextMenu(e.clientX, e.clientY, m);
    });

    return wrap;
  }

  function renderAttachments(list) {
    if (!list || !list.length) return "";
    return list
      .map((a) => {
        if (a.type === "image") {
          return `<img class="bubble-img" src="${escapeHtml(a.url)}" alt="Pièce jointe">`;
        }
        return `<a class="bubble-file" href="${escapeHtml(a.url)}" target="_blank" rel="noopener" download>
        <div class="fi">${ICONS.file}</div>
        <div><div class="fn">${escapeHtml(a.name || "Document")}</div><div class="fs">${fmtFileSize(a.size)}</div></div>
      </a>`;
      })
      .join("");
  }

  function startReply(m) {
    State.replyTo = m;
    dom.replyBar.classList.remove("hidden");
    dom.replyName.textContent = m.sender;
    dom.replyText.textContent = m.body || "Pièce jointe";
    dom.messageInput.focus();
  }
  dom.replyCancel.addEventListener("click", () => {
    State.replyTo = null;
    dom.replyBar.classList.add("hidden");
  });

  function openEditModal(m) {
    State.editingId = m.id;
    dom.editBody.value = m.body || "";
    dom.editOverlay.classList.add("active");
    dom.editBody.focus();
  }
  function closeEditModal() {
    dom.editOverlay.classList.remove("active");
    State.editingId = null;
  }
  dom.editClose.addEventListener("click", closeEditModal);
  dom.editCancel.addEventListener("click", closeEditModal);
  dom.editSave.addEventListener("click", async () => {
    const body = dom.editBody.value.trim();
    if (!body || !State.editingId) return;
    try {
      await Api.patch(`/emploi/api/messages/${State.editingId}`, { body });
      const m = findMessageById(State.editingId);
      if (m) {
        m.body = body;
        m.edited = true;
      }
      closeEditModal();
      renderChatMessages(State.activeKey, { keepScroll: true });
      renderConversationList();
      toast("Message modifié.", "ok");
    } catch (err) {
      toast(err.message || "Modification impossible.", "err");
    }
  });

  async function deleteMessage(m) {
    try {
      await Api.del(`/emploi/api/messages/${m.id}`);
      const conv = State.conversations.get(State.activeKey);
      if (conv) conv.messages = conv.messages.filter((mm) => mm.id !== m.id);
      renderChatMessages(State.activeKey, { keepScroll: true });
      renderConversationList();
      toast("Message supprimé.", "ok");
    } catch (err) {
      toast(err.message || "Suppression impossible.", "err");
    }
  }

  /* ────────────────────────── envoi de message ────────────────────────── */

  let sending = false;
  let lastSentSignature = "";
  let lastSentAt = 0;
  const DUPLICATE_GUARD_MS = 1500;

  async function sendMessage() {
    if (sending) return;
    const conv = State.conversations.get(State.activeKey);
    if (!conv) {
      toast("Sélectionnez une conversation.", "info");
      return;
    }

    const text = dom.messageInput.value.trim();
    if (!text && !State.pendingAttachments.length) return;

    // Filet de sécurité : bloque un envoi identique (même texte, même
    // conversation, mêmes pièces jointes) déclenché deux fois de suite en
    // moins de 1,5s — quelle qu'en soit la cause côté navigateur.
    const signature = `${conv.key}::${text}::${State.pendingAttachments.map((a) => a.url).join(",")}`;
    if (
      signature === lastSentSignature &&
      Date.now() - lastSentAt < DUPLICATE_GUARD_MS
    )
      return;
    lastSentSignature = signature;
    lastSentAt = Date.now();

    sending = true;
    dom.btnSend.disabled = true;
    dom.composerStatus.textContent = "Envoi…";

    try {
      const payload = {
        body:
          text ||
          (State.pendingAttachments[0]?.name
            ? `Pièce jointe : ${State.pendingAttachments[0].name}`
            : "Pièce jointe"),
        attachments: State.pendingAttachments,
        replyToId: State.replyTo?.id || null,
      };

      if (conv.type === "group") {
        await Api.post("/emploi/api/messages/group", {
          groupId: conv.groupId,
          groupName: conv.name,
          participants: conv.members.map((m) => ({
            pseudo: m.pseudo,
            email: m.email,
          })),
          body: payload.body,
          objet: "",
          replyToId: payload.replyToId,
          attachments: payload.attachments,
        });
      } else {
        await Api.post("/emploi/api/messages", {
          toUsername: conv.name,
          subject: "",
          body: payload.body,
          replyToId: payload.replyToId,
          attachments: payload.attachments,
        });
      }

      dom.messageInput.value = "";
      dom.messageInput.style.height = "auto";
      State.pendingAttachments = [];
      renderAttachmentsPreview();
      State.replyTo = null;
      dom.replyBar.classList.add("hidden");
      dom.composerStatus.textContent = "";
      await loadMessages();
      selectConversation(conv.key);
    } catch (err) {
      toast(err.message || "Envoi impossible.", "err");
      dom.composerStatus.textContent = "";
    } finally {
      sending = false;
      dom.btnSend.disabled = false;
    }
  }

  dom.btnSend.addEventListener("click", sendMessage);
  dom.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  dom.messageInput.addEventListener("input", () => {
    dom.messageInput.style.height = "auto";
    dom.messageInput.style.height =
      Math.min(dom.messageInput.scrollHeight, 120) + "px";
  });

  /* Réponses rapides — génériques, utiles pour candidatures/recrutement */
  const QUICK_REPLIES = [
    "Bonjour, merci pour votre message.",
    "Je suis disponible cette semaine pour échanger.",
    "Pouvez-vous préciser le poste concerné ?",
    "Je vous envoie mon CV dans un instant.",
    "Quand seriez-vous disponible pour un entretien ?",
    "Merci, je reviens vers vous rapidement.",
  ];
  function renderQuickReplies() {
    dom.quickReplies.innerHTML = QUICK_REPLIES.map(
      (q) => `<button class="quick-reply-chip">${escapeHtml(q)}</button>`,
    ).join("");
    qsa(".quick-reply-chip", dom.quickReplies).forEach((chip) => {
      chip.addEventListener("click", () => {
        dom.messageInput.value = chip.textContent;
        dom.messageInput.focus();
        updateQuickRepliesNav();
      });
    });
    updateQuickRepliesNav();
  }
  function updateQuickRepliesNav() {
    const overflow =
      dom.quickReplies.scrollWidth > dom.quickReplies.clientWidth + 4;
    dom.qrPrev.classList.toggle(
      "visible",
      overflow && dom.quickReplies.scrollLeft > 4,
    );
    dom.qrNext.classList.toggle(
      "visible",
      overflow &&
        dom.quickReplies.scrollLeft <
          dom.quickReplies.scrollWidth - dom.quickReplies.clientWidth - 4,
    );
  }
  dom.quickReplies.addEventListener("scroll", updateQuickRepliesNav);
  dom.qrPrev.addEventListener("click", () =>
    dom.quickReplies.scrollBy({ left: -160, behavior: "smooth" }),
  );
  dom.qrNext.addEventListener("click", () =>
    dom.quickReplies.scrollBy({ left: 160, behavior: "smooth" }),
  );

  /* ────────────────────────── 10. PIÈCES JOINTES ────────────────────────── */

  dom.btnAttachImage.addEventListener("click", () => dom.inputImages.click());
  dom.btnAttachFile.addEventListener("click", () => dom.inputFiles.click());

  dom.inputImages.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));
    try {
      dom.composerStatus.textContent = "Envoi des images…";
      const { images } = await Api.upload("/emploi/api/upload-chat-images", fd);
      images.forEach((url) =>
        State.pendingAttachments.push({ type: "image", url }),
      );
      renderAttachmentsPreview();
    } catch (err) {
      toast(err.message || "Échec de l'envoi des images.", "err");
    } finally {
      dom.composerStatus.textContent = "";
      e.target.value = "";
    }
  });

  dom.inputFiles.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    try {
      dom.composerStatus.textContent = "Envoi des fichiers…";
      const { files: uploaded } = await Api.upload(
        "/emploi/api/upload-chat-files",
        fd,
      );
      uploaded.forEach((f) =>
        State.pendingAttachments.push({
          type: "file",
          url: f.url,
          name: f.name,
          size: f.size,
        }),
      );
      renderAttachmentsPreview();
    } catch (err) {
      toast(err.message || "Échec de l'envoi des fichiers.", "err");
    } finally {
      dom.composerStatus.textContent = "";
      e.target.value = "";
    }
  });

  function renderAttachmentsPreview() {
    dom.attachmentsPreview.innerHTML = State.pendingAttachments
      .map(
        (a, i) => `
      <div class="att-chip">
        ${a.type === "image" ? `<img src="${escapeHtml(a.url)}">` : ICONS.file}
        <span class="name">${escapeHtml(a.name || "Image")}</span>
        <span class="rm" data-i="${i}">&times;</span>
      </div>
    `,
      )
      .join("");
    qsa(".rm", dom.attachmentsPreview).forEach((rm) => {
      rm.addEventListener("click", () => {
        State.pendingAttachments.splice(Number(rm.dataset.i), 1);
        renderAttachmentsPreview();
      });
    });
  }

  function openLightbox(src) {
    dom.lightboxImg.src = src;
    dom.lightbox.classList.add("active");
  }
  dom.lightboxClose.addEventListener("click", () =>
    dom.lightbox.classList.remove("active"),
  );
  dom.lightbox.addEventListener("click", (e) => {
    if (e.target === dom.lightbox) dom.lightbox.classList.remove("active");
  });

  /* ────────────────────────── 11. RÉACTIONS (locales) & EMOJI PICKER ────────────────────────── */
  /* Remarque : le serveur ne stocke pas de réactions par message. Elles sont
     donc conservées localement (par navigateur) — c'est une fonctionnalité
     réelle et persistante, simplement non synchronisée entre appareils. */

  const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];
  const QUICK_EMOJIS = [
    "😀",
    "😁",
    "😂",
    "🙂",
    "😉",
    "😊",
    "😍",
    "🤔",
    "😐",
    "😴",
    "😢",
    "😭",
    "😡",
    "👍",
    "👎",
    "👏",
    "🙏",
    "💪",
    "🔥",
    "🎉",
    "✅",
    "❌",
    "📎",
    "📅",
    "💬",
    "⭐",
    "🚀",
    "🤝",
  ];

  function toggleReaction(msgId, emoji) {
    const me = State.me.username.toLowerCase();
    const map = State.localReactions[msgId] || {};
    const users = new Set(map[emoji] || []);
    if (users.has(me)) users.delete(me);
    else users.add(me);
    if (users.size) map[emoji] = [...users];
    else delete map[emoji];
    if (Object.keys(map).length) State.localReactions[msgId] = map;
    else delete State.localReactions[msgId];
    saveLocal("emploi_msg_reactions", State.localReactions);
    renderChatMessages(State.activeKey, { keepScroll: true });
  }

  let reactPopEl = null;
  function openReactionPicker(anchor, msgId) {
    closeReactionPicker();
    const rect = anchor.getBoundingClientRect();
    reactPopEl = document.createElement("div");
    reactPopEl.className = "react-pop";
    reactPopEl.style.top = `${rect.top - 44}px`;
    reactPopEl.style.left = `${Math.max(8, rect.left - 90)}px`;
    reactPopEl.innerHTML = REACTION_EMOJIS.map(
      (e) => `<button>${e}</button>`,
    ).join("");
    qsa("button", reactPopEl).forEach((b, i) =>
      b.addEventListener("click", () => {
        toggleReaction(msgId, REACTION_EMOJIS[i]);
        closeReactionPicker();
      }),
    );
    document.body.appendChild(reactPopEl);
    setTimeout(
      () =>
        document.addEventListener("click", closeReactionPicker, { once: true }),
      0,
    );
  }
  function closeReactionPicker() {
    reactPopEl?.remove();
    reactPopEl = null;
  }

  let emojiPopEl = null;
  dom.btnEmoji.addEventListener("click", (e) => {
    e.stopPropagation();
    if (emojiPopEl) {
      closeEmojiPicker();
      return;
    }
    emojiPopEl = document.createElement("div");
    emojiPopEl.className = "emoji-pop";
    emojiPopEl.innerHTML = `<div class="label">Émoticônes</div><div class="emoji-grid">${QUICK_EMOJIS.map((e) => `<button>${e}</button>`).join("")}</div>`;
    dom.composerZone.appendChild(emojiPopEl);
    qsa("button", emojiPopEl).forEach((b, i) =>
      b.addEventListener("click", () => insertAtCursor(QUICK_EMOJIS[i])),
    );
    setTimeout(
      () =>
        document.addEventListener("click", closeEmojiPicker, { once: true }),
      0,
    );
  });
  function closeEmojiPicker() {
    emojiPopEl?.remove();
    emojiPopEl = null;
  }
  function insertAtCursor(text) {
    const input = dom.messageInput;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.selectionStart = input.selectionEnd = start + text.length;
    input.focus();
  }

  /* ────────────────────────── 12. GROUPES ────────────────────────── */

  function renderDetailsPanel() {
    const conv = State.activeKey
      ? State.conversations.get(State.activeKey)
      : null;

    if (!conv || conv.type !== "group") {
      dom.detailsAvatar.className = "details-avatar empty";
      dom.detailsAvatar.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 17l-6 6M16 17l6 6"/></svg>`;
      dom.detailsName.textContent = "Aucun groupe sélectionné";
      dom.detailsStatus.textContent = "";
      dom.membersList.innerHTML = `<div class="media-empty">Sélectionnez une conversation de groupe pour voir ses participants.</div>`;
      dom.sharedMedia.innerHTML = `<div class="media-empty">—</div>`;
      dom.groupAbout.textContent =
        "Sélectionnez un groupe pour afficher son résumé.";
      dom.btnInvite.disabled = true;
      dom.muteToggle.classList.remove("on");
      return;
    }

    dom.btnInvite.disabled = false;
    dom.detailsAvatar.className = "details-avatar";
    dom.detailsAvatar.style.background = colorFor(conv.name);
    dom.detailsAvatar.textContent = initials(conv.name);
    dom.detailsName.textContent = conv.name;
    dom.detailsStatus.textContent = `${conv.members.length + 1} membres`;
    dom.archiveLabel2.textContent = State.archivedKeys.has(conv.key)
      ? "Désarchiver"
      : "Archiver";

    const allMembers = [
      { pseudo: State.me.username, self: true },
      ...conv.members,
    ];
    dom.membersList.innerHTML = allMembers
      .map(
        (m) => `
      <div class="member-row">
        <div class="av" style="background:${colorFor(m.pseudo)}">${initials(m.pseudo)}</div>
        <span>${escapeHtml(m.pseudo)}</span>
        ${m.self ? `<span class="role">Vous</span>` : ""}
      </div>
    `,
      )
      .join("");

    const mediaAttachments = conv.messages.flatMap((m) =>
      (m.attachments || []).map((a) => ({ ...a, from: m.sender })),
    );
    if (!mediaAttachments.length) {
      dom.sharedMedia.innerHTML = `<div class="media-empty">Aucun média ou document partagé pour l'instant.</div>`;
    } else {
      dom.sharedMedia.innerHTML = mediaAttachments
        .slice(-8)
        .reverse()
        .map((a) =>
          a.type === "image"
            ? `<a class="media-tile" href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.url)}"></a>`
            : `<a class="media-tile" href="${escapeHtml(a.url)}" target="_blank" rel="noopener" title="${escapeHtml(a.name || "")}">${ICONS.file}</a>`,
        )
        .join("");
    }

    dom.groupAbout.textContent = conv.objet
      ? conv.objet
      : `Conversation de groupe avec ${conv.members.length} autre${conv.members.length > 1 ? "s" : ""} membre${conv.members.length > 1 ? "s" : ""}.`;

    dom.muteToggle.classList.toggle("on", mutedGroups.has(conv.groupId));
  }

  dom.btnToggleDetails.addEventListener("click", () => {
    dom.shell.classList.toggle("details-open");
    if (dom.shell.classList.contains("details-open")) renderDetailsPanel();
  });
  dom.btnCloseDetails.addEventListener("click", () =>
    dom.shell.classList.remove("details-open"),
  );

  dom.btnMuteGroup.addEventListener("click", () => {
    const conv = State.conversations.get(State.activeKey);
    if (!conv || conv.type !== "group") return;
    if (mutedGroups.has(conv.groupId)) mutedGroups.delete(conv.groupId);
    else mutedGroups.add(conv.groupId);
    saveLocal("emploi_muted_groups", [...mutedGroups]);
    dom.muteToggle.classList.toggle("on", mutedGroups.has(conv.groupId));
  });

  async function sendGroupSystemMessage(conv, body, extraMembers = []) {
    const participants = [
      ...conv.members.map((m) => ({ pseudo: m.pseudo, email: m.email })),
      ...extraMembers,
    ];
    return Api.post("/emploi/api/messages/group", {
      groupId: conv.groupId,
      groupName: conv.name,
      participants,
      body,
      objet: "",
    });
  }

  dom.btnInvite.addEventListener("click", () => {
    if (dom.btnInvite.disabled) return;
    dom.invPseudo.value = "";
    dom.invEmail.value = "";
    dom.inviteOverlay.classList.add("active");
    dom.invPseudo.focus();
  });
  const closeInvite = () => dom.inviteOverlay.classList.remove("active");
  dom.inviteClose.addEventListener("click", closeInvite);
  dom.inviteCancel.addEventListener("click", closeInvite);
  dom.inviteSend.addEventListener("click", async () => {
    const conv = State.conversations.get(State.activeKey);
    if (!conv || conv.type !== "group") return;
    const pseudo = dom.invPseudo.value.trim();
    const email = dom.invEmail.value.trim();
    if (!pseudo) {
      toast("Le pseudo est requis.", "err");
      return;
    }
    try {
      const check = await Api.post("/emploi/api/users/verify", {
        pseudo,
        email,
      });
      await sendGroupSystemMessage(
        conv,
        `${check.username} a été ajouté(e) au groupe.`,
        [{ pseudo: check.username, email: check.contact }],
      );
      closeInvite();
      toast(`${check.username} a été invité(e) au groupe.`, "ok");
      await loadMessages();
      selectConversation(conv.key);
    } catch (err) {
      toast(err.message || "Utilisateur introuvable.", "err");
    }
  });

  /* Archivage / blocage / suppression — depuis le header ET le panel détails */
  async function toggleArchive(conv) {
    const key =
      conv.type === "group" ? `group:${conv.groupId}` : `direct:${conv.name}`;
    try {
      if (State.archivedKeys.has(key)) {
        await Api.del(
          `/emploi/api/conversations/archive/${encodeURIComponent(key)}`,
        );
        State.archivedKeys.delete(key);
        toast("Conversation désarchivée.", "ok");
      } else {
        await Api.post("/emploi/api/conversations/archive", {
          conversationKey: key,
        });
        State.archivedKeys.add(key);
        toast("Conversation archivée.", "ok");
      }
      renderConversationList();
      renderChatHeader(State.activeKey);
      renderDetailsPanel();
      closeAllDropdowns();
    } catch (err) {
      toast(err.message || "Action impossible.", "err");
    }
  }
  dom.btnArchive.addEventListener("click", () => {
    const conv = State.conversations.get(State.activeKey);
    if (conv) toggleArchive(conv);
  });
  dom.btnArchiveFromDetails.addEventListener("click", () => {
    const conv = State.conversations.get(State.activeKey);
    if (conv) toggleArchive(conv);
  });

  dom.btnBlock.addEventListener("click", () => {
    const conv = State.conversations.get(State.activeKey);
    if (!conv || conv.type !== "direct") return;
    const already = State.blockedUsernames.has(conv.name.toLowerCase());
    confirmAction({
      title: already ? "Débloquer cet utilisateur" : "Bloquer cet utilisateur",
      text: already
        ? `${conv.name} pourra de nouveau vous envoyer des messages.`
        : `${conv.name} ne pourra plus vous envoyer de messages.`,
      onConfirm: async () => {
        try {
          if (already) {
            await Api.del(
              `/emploi/api/users/block/${encodeURIComponent(conv.name)}`,
            );
            State.blockedUsernames.delete(conv.name.toLowerCase());
            toast(`${conv.name} a été débloqué(e).`, "ok");
          } else {
            await Api.post("/emploi/api/users/block", {
              targetUsername: conv.name,
            });
            State.blockedUsernames.add(conv.name.toLowerCase());
            toast(`${conv.name} a été bloqué(e).`, "ok");
          }
          renderChatHeader(State.activeKey);
          closeAllDropdowns();
        } catch (err) {
          toast(err.message || "Action impossible.", "err");
        }
      },
    });
  });

  dom.btnDeleteConv.addEventListener("click", () => {
    const conv = State.conversations.get(State.activeKey);
    if (!conv) return;
    confirmAction({
      title: "Supprimer la conversation",
      text: `Cette action supprimera définitivement votre copie de la conversation avec « ${conv.name} ».`,
      onConfirm: () => deleteConversation(conv),
    });
  });
  dom.btnDeleteFromDetails.addEventListener("click", () => {
    const conv = State.conversations.get(State.activeKey);
    if (!conv) return;
    confirmAction({
      title: "Quitter le groupe",
      text: `Vous allez quitter « ${conv.name} ». Vous ne recevrez plus ses messages.`,
      onConfirm: () => deleteConversation(conv),
    });
  });

  /* ────────────────────────── 13. MODALES ────────────────────────── */

  function closeAllOverlays() {
    qsa(".overlay.active").forEach((o) => o.classList.remove("active"));
  }

  /* — Nouveau message direct — */
  let nmVerified = null;
  function openNewMessageModal() {
    dom.nmPseudo.value = "";
    dom.nmEmail.value = "";
    dom.nmSubject.value = "";
    dom.nmBody.value = "";
    dom.nmCheckHint.textContent = "";
    dom.nmCheckHint.style.color = "";
    nmVerified = null;
    dom.newMsgOverlay.classList.add("active");
    dom.nmPseudo.focus();
  }
  function closeNewMessageModal() {
    dom.newMsgOverlay.classList.remove("active");
  }
  dom.newMsgClose.addEventListener("click", closeNewMessageModal);
  dom.nmCancel.addEventListener("click", closeNewMessageModal);

  const checkNmPseudo = debounce(async () => {
    const pseudo = dom.nmPseudo.value.trim();
    if (!pseudo) {
      dom.nmCheckHint.textContent = "";
      nmVerified = null;
      return;
    }
    try {
      const res = await Api.post("/emploi/api/users/verify", {
        pseudo,
        email: dom.nmEmail.value.trim(),
      });
      nmVerified = res;
      dom.nmCheckHint.textContent = `Compte trouvé : ${res.username}`;
      dom.nmCheckHint.style.color = "var(--accent)";
    } catch (err) {
      nmVerified = null;
      dom.nmCheckHint.textContent = err.message || "Utilisateur introuvable.";
      dom.nmCheckHint.style.color = "var(--red)";
    }
  }, 350);
  dom.nmPseudo.addEventListener("input", checkNmPseudo);
  dom.nmEmail.addEventListener("input", checkNmPseudo);

  dom.nmSend.addEventListener("click", async () => {
    if (dom.nmSend.disabled) return; // protège contre un double-écouteur sur le même bouton
    const pseudo = dom.nmPseudo.value.trim();
    const body = dom.nmBody.value.trim();
    if (!pseudo) {
      toast("Le pseudo du destinataire est requis.", "err");
      return;
    }
    if (!body) {
      toast("Le message ne peut pas être vide.", "err");
      return;
    }
    dom.nmSend.disabled = true;
    try {
      await Api.post("/emploi/api/messages", {
        pseudo,
        email: dom.nmEmail.value.trim() || undefined,
        subject: dom.nmSubject.value.trim(),
        body,
      });
      closeNewMessageModal();
      toast("Message envoyé.", "ok");
      await loadMessages();
      const targetUsername = nmVerified?.username || pseudo;
      if (State.conversations.has(`direct:${targetUsername}`))
        selectConversation(`direct:${targetUsername}`);
    } catch (err) {
      toast(err.message || "Envoi impossible.", "err");
    } finally {
      dom.nmSend.disabled = false;
    }
  });

  /* — Nouveau groupe — */
  function renderGroupParticipantsTags() {
    dom.grpParticipants.innerHTML =
      State.groupParticipants
        .map(
          (p, i) => `
      <span class="p-tag" style="background:${colorFor(p.pseudo)}">${escapeHtml(p.pseudo)}<span class="rm" data-i="${i}">&times;</span></span>
    `,
        )
        .join("") || "";
    qsa(".rm", dom.grpParticipants).forEach((rm) => {
      rm.addEventListener("click", () => {
        State.groupParticipants.splice(Number(rm.dataset.i), 1);
        renderGroupParticipantsTags();
      });
    });
  }
  function openNewGroupModal() {
    dom.grpName.value = "";
    dom.grpAddPseudo.value = "";
    dom.grpAddEmail.value = "";
    dom.grpSubject.value = "";
    dom.grpBody.value = "";
    State.groupParticipants = [];
    renderGroupParticipantsTags();
    dom.groupOverlay.classList.add("active");
    dom.grpName.focus();
  }
  function closeNewGroupModal() {
    dom.groupOverlay.classList.remove("active");
  }
  dom.groupClose.addEventListener("click", closeNewGroupModal);
  dom.groupCancel.addEventListener("click", closeNewGroupModal);

  dom.grpAddBtn.addEventListener("click", async () => {
    const pseudo = dom.grpAddPseudo.value.trim();
    const email = dom.grpAddEmail.value.trim();
    if (!pseudo) {
      toast("Pseudo requis.", "err");
      return;
    }
    if (
      State.groupParticipants.some(
        (p) => p.pseudo.toLowerCase() === pseudo.toLowerCase(),
      )
    ) {
      toast("Ce participant est déjà ajouté.", "info");
      return;
    }
    try {
      const res = await Api.post("/emploi/api/users/verify", { pseudo, email });
      State.groupParticipants.push({
        pseudo: res.username,
        email: res.contact,
      });
      renderGroupParticipantsTags();
      dom.grpAddPseudo.value = "";
      dom.grpAddEmail.value = "";
      dom.grpAddPseudo.focus();
    } catch (err) {
      toast(err.message || "Utilisateur introuvable.", "err");
    }
  });

  dom.groupSend.addEventListener("click", async () => {
    if (dom.groupSend.disabled) return; // protège contre un double-écouteur sur le même bouton
    const groupName = dom.grpName.value.trim();
    const body = dom.grpBody.value.trim();
    if (!groupName) {
      toast("Le nom du groupe est requis.", "err");
      return;
    }
    if (!State.groupParticipants.length) {
      toast("Ajoutez au moins un participant.", "err");
      return;
    }
    if (!body) {
      toast("Le premier message ne peut pas être vide.", "err");
      return;
    }
    dom.groupSend.disabled = true;
    try {
      const groupId = uid();
      await Api.post("/emploi/api/messages/group", {
        groupId,
        groupName,
        participants: State.groupParticipants,
        body,
        objet: dom.grpSubject.value.trim(),
      });
      closeNewGroupModal();
      toast("Groupe créé.", "ok");
      await loadMessages();
      selectConversation(`group:${groupId}`);
    } catch (err) {
      toast(err.message || "Création du groupe impossible.", "err");
    } finally {
      dom.groupSend.disabled = false;
    }
  });

  /* — Mentions — */
  function openMentionModal() {
    const conv = State.conversations.get(State.activeKey);
    if (!conv || conv.type !== "group") {
      toast("Les mentions sont disponibles dans les groupes.", "info");
      return;
    }
    State.mentionSelection = new Set();
    dom.mentionList.innerHTML = conv.members
      .map(
        (m) => `
      <div class="mention-item" data-pseudo="${escapeHtml(m.pseudo)}">
        <div class="mention-av" style="background:${colorFor(m.pseudo)}">${initials(m.pseudo)}</div>
        <span>${escapeHtml(m.pseudo)}</span>
        <div class="mention-check"></div>
      </div>
    `,
      )
      .join("");
    qsa(".mention-item", dom.mentionList).forEach((item) => {
      item.addEventListener("click", () => {
        item.classList.toggle("selected");
        const p = item.dataset.pseudo;
        if (item.classList.contains("selected")) State.mentionSelection.add(p);
        else State.mentionSelection.delete(p);
      });
    });
    dom.mentionOverlay.classList.add("active");
  }
  dom.btnMention.addEventListener("click", openMentionModal);
  dom.mentionClose.addEventListener("click", () =>
    dom.mentionOverlay.classList.remove("active"),
  );
  dom.btnValidateMentions.addEventListener("click", () => {
    State.mentionSelection.forEach((p) => insertAtCursor(`@${p} `));
    dom.mentionOverlay.classList.remove("active");
  });

  /* — Recherche dans la conversation — */
  dom.btnSearchInChat.addEventListener("click", () => {
    if (!State.activeKey) {
      toast("Sélectionnez une conversation.", "info");
      return;
    }
    dom.searchInChat.value = "";
    dom.searchResults.innerHTML = "";
    dom.searchOverlay.classList.add("active");
    dom.searchInChat.focus();
  });
  dom.searchClose.addEventListener("click", () =>
    dom.searchOverlay.classList.remove("active"),
  );
  dom.searchInChat.addEventListener(
    "input",
    debounce(() => {
      const term = dom.searchInChat.value.trim().toLowerCase();
      const conv = State.conversations.get(State.activeKey);
      if (!conv || !term) {
        dom.searchResults.innerHTML = "";
        return;
      }
      const matches = conv.messages.filter((m) =>
        (m.body || "").toLowerCase().includes(term),
      );
      dom.searchResults.innerHTML = matches.length
        ? matches
            .map(
              (m) => `
        <div class="mention-item" data-id="${m.id}">
          <div class="mention-av" style="background:${colorFor(m.sender)}">${initials(m.sender)}</div>
          <span>${escapeHtml(m.sender)} — ${escapeHtml((m.body || "").slice(0, 60))}</span>
        </div>`,
            )
            .join("")
        : `<div class="media-empty">Aucun résultat.</div>`;
      qsa(".mention-item", dom.searchResults).forEach((item) => {
        item.addEventListener("click", () => {
          dom.searchOverlay.classList.remove("active");
          const target = qs(
            `.msg-wrap[data-id="${item.dataset.id}"]`,
            dom.chatMessages,
          );
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.style.transition = "background .3s";
            target.style.background = "var(--accent-soft)";
            setTimeout(() => {
              target.style.background = "";
            }, 900);
          }
        });
      });
    }, 200),
  );

  /* — Confirmation générique — */
  let pendingConfirm = null;
  function confirmAction({ title, text, onConfirm }) {
    dom.confirmTitle.textContent = title;
    dom.confirmText.textContent = text;
    pendingConfirm = onConfirm;
    dom.confirmOverlay.classList.add("active");
  }
  function closeConfirm() {
    dom.confirmOverlay.classList.remove("active");
    pendingConfirm = null;
  }
  dom.confirmClose.addEventListener("click", closeConfirm);
  dom.confirmCancel.addEventListener("click", closeConfirm);
  dom.confirmOk.addEventListener("click", async () => {
    const fn = pendingConfirm;
    closeConfirm();
    if (fn) await fn();
  });

  /* ────────────────────────── 14. MENU CONTEXTUEL MESSAGE ────────────────────────── */

  function openMessageContextMenu(x, y, m) {
    State.ctxTargetId = m.id;
    const menu = dom.msgCtxMenu;
    menu.classList.remove("hidden");
    const isMe = m.sender.toLowerCase() === State.me.username.toLowerCase();
    qs('[data-action="edit"]', menu).style.display =
      isMe && m.body ? "" : "none";
    const w = 190,
      h = 170;
    menu.style.left = `${Math.min(x, window.innerWidth - w - 10)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - h - 10)}px`;
    setTimeout(
      () => document.addEventListener("click", closeCtxMenu, { once: true }),
      0,
    );
  }
  function closeCtxMenu() {
    dom.msgCtxMenu.classList.add("hidden");
  }

  qsa(".ctx-item", dom.msgCtxMenu).forEach((item) => {
    item.addEventListener("click", () => {
      const m = findMessageById(State.ctxTargetId);
      if (!m) return;
      const action = item.dataset.action;
      if (action === "reply") startReply(m);
      if (action === "copy") {
        navigator.clipboard?.writeText(m.body || "");
        toast("Message copié.", "ok");
      }
      if (action === "edit") openEditModal(m);
      if (action === "delete")
        confirmAction({
          title: "Supprimer le message",
          text: "Ce message sera supprimé de votre côté de la conversation.",
          onConfirm: () => deleteMessage(m),
        });
      closeCtxMenu();
    });
  });

  /* ────────────────────────── 15. EXPORT CONVERSATION (.txt) ────────────────────────── */

  dom.btnExportConv.addEventListener("click", () => {
    const conv = State.conversations.get(State.activeKey);
    if (!conv) {
      toast("Sélectionnez une conversation.", "info");
      return;
    }
    const lines = conv.messages.map(
      (m) =>
        `[${new Date(m.timestamp).toLocaleString("fr-FR")}] ${m.sender} : ${m.body || "(pièce jointe)"}`,
    );
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversation-${conv.name.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    closeAllDropdowns();
    toast("Export généré.", "ok");
  });

  /* ────────────────────────── 16. RACCOURCIS CLAVIER / CLIC EXTÉRIEUR ────────────────────────── */

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (dom.lightbox.classList.contains("active")) {
      dom.lightbox.classList.remove("active");
      return;
    }
    const openOverlay = qs(".overlay.active");
    if (openOverlay) {
      openOverlay.classList.remove("active");
      return;
    }
    if (!dom.msgCtxMenu.classList.contains("hidden")) {
      closeCtxMenu();
      return;
    }
    if (emojiPopEl) {
      closeEmojiPicker();
      return;
    }
    if (reactPopEl) {
      closeReactionPicker();
      return;
    }
    closeAllDropdowns();
  });

  document.addEventListener("click", (e) => {
    if (
      emojiPopEl &&
      !emojiPopEl.contains(e.target) &&
      e.target !== dom.btnEmoji
    )
      closeEmojiPicker();
  });

  qsa(".overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => {
      if (e.target === ov) ov.classList.remove("active");
    });
  });

  /* ────────────────────────── 17. BOOT ────────────────────────── */

  let messagesPollTimer = null;
  let presencePollTimer = null;
  let presencePingTimer = null;

  async function boot() {
    const ok = await bootstrapSession();
    if (!ok) return;

    renderEmptyChat();
    renderQuickReplies();

    await loadArchivedAndBlocked();
    await loadMessages();

    pingPresence();
    presencePingTimer = setInterval(pingPresence, PRESENCE_PING_MS);
    presencePollTimer = setInterval(pollPresence, PRESENCE_POLL_MS);
    messagesPollTimer = setInterval(
      () => loadMessages({ silent: true }),
      MESSAGES_POLL_MS,
    );
    pollPresence();

    window.addEventListener("beforeunload", () => {
      clearInterval(messagesPollTimer);
      clearInterval(presencePollTimer);
      clearInterval(presencePingTimer);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
