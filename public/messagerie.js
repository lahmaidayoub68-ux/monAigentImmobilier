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

let conversations = [];
let selectedMessageId = null;

// Cache d'éléments DOM réutilisés fréquemment
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
    const user = JSON.parse(raw);
    return user.token || null;
  } catch {
    return null;
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
      const current = html.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
      localStorage.setItem("aigent_theme", next);
    });
  }
}

// ============================================================
// DECONNEXION
// ============================================================
function logout() {
  console.log("[AUTH] Déconnexion...");

  // Vider les sessions et stores locaux
  localStorage.removeItem("agent_user");
  Object.keys(messagesStore).forEach((k) => delete messagesStore[k]);
  conversationStore.clear();
  Object.keys(unreadStore).forEach((k) => delete unreadStore[k]);

  // Nettoyage visuel
  const list = document.querySelector("#conversations-container");
  if (list) list.innerHTML = "";
  if (chatBox) chatBox.innerHTML = "";

  window.location.href = "index.html";
}

// ============================================================
// SIDEBAR NAVIGATION (Menu latéral overlay)
// ============================================================
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");
  const overlay = document.getElementById("sidebarOverlay");

  function openSidebar() {
    if (sidebar) sidebar.classList.add("open");
    if (overlay) overlay.classList.add("active");
    if (openBtn) openBtn.style.display = "none";
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("active");
    if (openBtn) openBtn.style.display = "flex";
  }

  if (openBtn) openBtn.addEventListener("click", openSidebar);
  if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
  if (overlay) overlay.addEventListener("click", closeSidebar);
}

// ============================================================
// VUE MOBILE (Glissement Liste <-> Chat)
// ============================================================
function showChatView() {
  if (window.innerWidth <= 768 && mobileWrapper) {
    mobileWrapper.classList.add("show-chat");
  }
}

function showListView() {
  if (mobileWrapper) mobileWrapper.classList.remove("show-chat");
}

function initMobileViews() {
  const btnBackToList = document.getElementById("btn-back-to-list");
  if (btnBackToList) btnBackToList.addEventListener("click", showListView);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768 && mobileWrapper) {
      mobileWrapper.classList.remove("show-chat");
    }
  });
}

// ============================================================
// BADGES NON LUS ET FILTRES (Tabs)
// ============================================================
function updateGlobalUnread() {
  const count = Object.values(unreadStore).filter((v) => v).length;
  const badge = document.getElementById("unread-count-tab");

  if (!badge) return;

  if (count > 0) {
    badge.textContent = count;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
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
    if (filter === "all") {
      c.style.display = "flex";
    } else if (filter === "unread") {
      c.style.display = c.classList.contains("has-unread") ? "flex" : "none";
    } else if (filter === "archived") {
      c.style.display = "none"; // Optionnel : Placeholder pour le futur
    }
  });
}

// ============================================================
// RECHERCHE DANS LA LISTE
// ============================================================
function initSearch() {
  const searchInputBase = document.getElementById("search-conversations");
  if (searchInputBase) {
    searchInputBase.addEventListener("input", () => {
      const value = searchInputBase.value.toLowerCase();
      document.querySelectorAll(".conversation").forEach((c) => {
        const name = (c.dataset.user || "").toLowerCase();
        c.style.display = name.includes(value) ? "flex" : "none";
      });
    });
  }
}

// ============================================================
// CHARGEMENT ET GESTION DES CONVERSATIONS (API & DOM)
// ============================================================
function attachConversationClick(convo) {
  convo.addEventListener("click", async () => {
    // Reset active state
    document
      .querySelectorAll(".conversation")
      .forEach((c) => c.classList.remove("active"));
    convo.classList.add("active");

    const name = convo.dataset.user;

    // Suppression du point / badge non-lu
    unreadStore[name.toLowerCase()] = false;
    convo.querySelector(".unread")?.remove();
    convo.classList.remove("has-unread");
    updateGlobalUnread();
    applyTabFilter(); // Maintient l'état du filtre actif

    // Mise à jour de l'en-tête de chat
    if (chatWithTitle) chatWithTitle.textContent = name;
    if (chatAvatar) {
      chatAvatar.textContent = name.charAt(0).toUpperCase();
      chatAvatar.classList.add("online");
    }

    const emptyState = document.getElementById("chat-empty-state");
    if (emptyState) emptyState.style.display = "none";

    console.log(`[CONVERSATION] Ouverture de ${name}`);
    await loadConversation(name);

    // Déclenche l'affichage mobile si on est sur petit écran
    showChatView();
  });
}

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

    // Reset complet des stores
    Object.keys(messagesStore).forEach((k) => delete messagesStore[k]);
    conversationStore.clear();

    // Regroupement
    msgs.forEach((m) => {
      const pseudoNorm =
        m.sender.trim().toLowerCase() === currentUser
          ? m.receiver.trim().toLowerCase()
          : m.sender.trim().toLowerCase();

      if (!messagesStore[pseudoNorm]) messagesStore[pseudoNorm] = [];
      messagesStore[pseudoNorm].push(m);
      conversationStore.add(pseudoNorm);

      // Traitement des non-lus
      if (m.receiver?.toLowerCase() === currentUser && !m.read) {
        unreadStore[pseudoNorm] = true;
      }

      if (m.senderEmail)
        userEmailStore[pseudoNorm] = m.senderEmail.trim().toLowerCase();
      receiverIdStore[pseudoNorm] =
        m.sender.trim().toLowerCase() === currentUser
          ? m.receiver_id
          : m.sender_id;
    });

    updateGlobalUnread();

    // Tri temporel
    const recentes = [];
    const anciennes = [];

    conversationStore.forEach((pseudo) => {
      const mList = messagesStore[pseudo];
      const lastMsg = mList[mList.length - 1];
      const date = new Date(lastMsg.timestamp);
      const now = new Date();
      const diffHours = (now - date) / (1000 * 60 * 60);

      if (diffHours < 24) {
        recentes.push({ pseudo, lastMsg });
      } else {
        anciennes.push({ pseudo, lastMsg });
      }
    });

    // Rendu HTML
    const container = document.getElementById("conversations-container");
    if (!container) return;

    function renderGroup(title, list) {
      if (!list.length) return "";
      return `
        <div class="conversation-group">
          <div class="group-title">${title}</div>
          ${list
            .map(({ pseudo, lastMsg }) => {
              const avatarUrl =
                lastMsg.sender.trim().toLowerCase() === currentUser
                  ? lastMsg.receiverAvatar
                  : lastMsg.senderAvatar;

              const time = new Date(lastMsg.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return `
            <div class="conversation ${unreadStore[pseudo] ? "has-unread" : ""}" data-user="${pseudo}">
              <div class="avatar" style="background-image:url('${avatarUrl || ""}')">
                 ${!avatarUrl ? pseudo.charAt(0).toUpperCase() : ""}
              </div>
              <div class="conv-info">
                <div class="top-line">
                  <span class="conv-name">${pseudo}</span>
                  <span class="time">${time}</span>
                </div>
                <div class="preview">
                  ${lastMsg.body.substring(0, 40)}...
                </div>
              </div>
              <div class="conv-meta">
                ${unreadStore[pseudo] ? `<div class="unread new"></div>` : ""}
              </div>
              <div class="conv-actions" data-user="${pseudo}" title="Supprimer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </div>
            </div>`;
            })
            .join("")}
        </div>
      `;
    }

    container.innerHTML =
      renderGroup("Récentes", recentes) + renderGroup("Anciennes", anciennes);

    // Re-bind des événements
    const newConversations = document.querySelectorAll(".conversation");
    newConversations.forEach(attachConversationClick);
    conversations = newConversations;

    // Écouteur pour la suppression via la miniature de la sidebar
    document.querySelectorAll(".conv-actions").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();

        const pseudo = btn.dataset.user;
        if (!confirm(`Supprimer la conversation avec ${pseudo} ?`)) return;

        try {
          const tkn = getAuthToken();
          if (!tkn) throw new Error("Token manquant");

          const receiverId = Number(receiverIdStore[pseudo]);
          if (!receiverId) {
            alert("Erreur : utilisateur introuvable");
            return;
          }

          // Appel Backend
          await fetch(`/api/conversations/${receiverId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tkn}` },
          });

          // Nettoyage Frontend
          delete messagesStore[pseudo];
          conversationStore.delete(pseudo);

          const el = document.querySelector(
            `.conversation[data-user='${pseudo}']`,
          );
          if (el) el.remove();

          if (chatWithTitle && chatWithTitle.textContent === pseudo) {
            if (chatBox) {
              chatBox.innerHTML = `
                <div class="chat-empty" id="chat-empty-state">
                  <div class="chat-empty-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <h3>Aucune conversation sélectionnée</h3>
                  <p>Choisis une conversation à gauche<br />ou démarre-en une nouvelle.</p>
                </div>`;
            }
            chatWithTitle.textContent = "Sélectionne une conversation";
            if (chatAvatar) chatAvatar.textContent = "A";
          }
        } catch (err) {
          console.error(err);
          alert("Erreur suppression");
        }
      });
    });

    // On s'assure que le filtre tab sélectionné reste actif
    applyTabFilter();
  } catch (err) {
    console.error("[ERROR] Erreur chargement conversations :", err);
  }
}

async function loadConversation(name) {
  if (!chatBox) return;
  chatBox.innerHTML = "";

  const clean = (s) => (s || "").replace(/"/g, "").trim().toLowerCase();
  const pseudoNorm = clean(name);
  const currentUserClean = clean(currentUser);

  let msgs = messagesStore[pseudoNorm] || [];
  msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  msgs.forEach((msg) => {
    const isContact = clean(msg.sender) !== currentUserClean;
    const wrapper = document.createElement("div");
    wrapper.classList.add("bubble-wrapper");

    const avatarUrl = isContact ? msg.senderAvatar : msg.receiverAvatar;
    const date = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const rowClass = isContact ? "msg-row" : "msg-row me";
    const bubbleClass = isContact ? "them" : "me";
    const displayName = isContact ? msg.sender : "Moi";
    const letter = displayName ? displayName.charAt(0).toUpperCase() : "";

    wrapper.innerHTML = `
      <div class="${rowClass}">
        ${isContact ? `<div class="msg-av" style="background-image:url('${avatarUrl || ""}')">${!avatarUrl ? letter : ""}</div>` : ""}
        <div class="msg-body">
          ${isContact ? `<div class="msg-sender">${displayName}</div>` : ""}
          <div class="bubble-content">
            <div class="bubble ${bubbleClass}">
              ${msg.subject ? `<strong>[${msg.subject}]</strong><br/>` : ""}${msg.body}
            </div>
            <div class="msg-menu-btn" data-id="${msg.id}">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <circle cx="5" cy="12" r="2" fill="#888"/>
                <circle cx="12" cy="12" r="2" fill="#888"/>
                <circle cx="19" cy="12" r="2" fill="#888"/>
              </svg>
            </div>
          </div>
          <div class="msg-time">${time}</div>
        </div>
      </div>
    `;
    chatBox.appendChild(wrapper);
  });

  // Re-bind du menu contextuel par message (3 points)
  const msgMenu = document.getElementById("msgMenu");
  document.querySelectorAll(".msg-menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedMessageId = btn.dataset.id;
      if (msgMenu) {
        msgMenu.style.top = e.pageY + "px";
        msgMenu.style.left = e.pageX - 150 + "px";
        msgMenu.classList.remove("hidden");
      }
    });
  });

  chatBox.scrollTop = chatBox.scrollHeight;
}

// ============================================================
// COMPOSER & ENVOI DE MESSAGE
// ============================================================
async function handleSendMessage(e) {
  if (e) e.preventDefault();
  if (!userInput) return;

  const text = userInput.value.trim();
  if (!text) return;

  const pseudo = chatWithTitle
    ? chatWithTitle.textContent.trim().toLowerCase()
    : "";
  if (!pseudo || pseudo === "sélectionne une conversation") return;

  const receiverId = Number(receiverIdStore[pseudo]);
  const email = userEmailStore[pseudo];

  const payload =
    receiverId && !isNaN(receiverId)
      ? { receiverId, body: text, subject: "" }
      : { pseudo, email, body: text, subject: "" };

  if (!receiverId && !email) {
    alert(`Impossible d'envoyer : email du destinataire ${pseudo} inconnu`);
    return;
  }

  try {
    const token = getAuthToken();
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

    // Réinitialisation de l'input et redimensionnement
    userInput.value = "";
    userInput.style.height = "auto";

    await loadAllConversations();
    await loadConversation(pseudo);
  } catch (err) {
    console.error("[ERROR] Erreur envoi message :", err);
  }
}

function initComposer() {
  if (userInput) {
    // Auto-resize du textarea
    userInput.addEventListener("input", () => {
      userInput.style.height = "auto";
      userInput.style.height = Math.min(userInput.scrollHeight, 80) + "px";
    });

    // Gérer la soumission rapide via "Entrée" sans "Shift"
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }

  // Bind du bouton final d'envoi
  if (sendBtn) sendBtn.addEventListener("click", handleSendMessage);

  // Quick Tags
  document.querySelectorAll(".comp-tag").forEach((tag) => {
    tag.addEventListener("click", () => {
      if (userInput) {
        userInput.value = tag.dataset.quick;
        userInput.focus();
        userInput.dispatchEvent(new Event("input")); // Pour forcer le resize
      }
    });
  });
}

// ============================================================
// POPUP NOUVEAU MESSAGE API CONNECT
// ============================================================
function initNewMsgPopup() {
  const newMsgOverlay = document.getElementById("newMsgOverlay");
  const newMsgClose = document.getElementById("newMsgClose");
  const newMsgCancel = document.getElementById("newMsgCancel");
  const newMsgSend = document.getElementById("newMsgSend");

  const newMsgPseudo = document.getElementById("newMsgPseudo");
  const newMsgEmail = document.getElementById("newMsgEmail");
  const newMsgObjet = document.getElementById("newMsgObjet");
  const newMsgBody = document.getElementById("newMsgBody");

  function openNewMsg() {
    if (newMsgOverlay) newMsgOverlay.classList.add("active");
  }

  function closeNewMsg() {
    if (newMsgOverlay) newMsgOverlay.classList.remove("active");
  }

  // Attaches ouverture
  document
    .getElementById("btn-nouveau-message")
    ?.addEventListener("click", openNewMsg);
  document
    .getElementById("btn-nouveau-message-sidebar")
    ?.addEventListener("click", openNewMsg);

  // Attaches fermetures
  if (newMsgClose) newMsgClose.addEventListener("click", closeNewMsg);
  if (newMsgCancel) newMsgCancel.addEventListener("click", closeNewMsg);
  if (newMsgOverlay) {
    newMsgOverlay.addEventListener("click", (e) => {
      if (e.target === newMsgOverlay) closeNewMsg();
    });
  }

  // Action d'envoi du nouveau message
  if (newMsgSend) {
    newMsgSend.addEventListener("click", async () => {
      const pseudo = newMsgPseudo?.value.trim().toLowerCase();
      const email = newMsgEmail?.value.trim().toLowerCase();
      const objet = newMsgObjet?.value.trim();
      const body = newMsgBody?.value.trim();

      if (!pseudo || !email || !objet || !body) {
        alert("Tous les champs sont obligatoires.");
        return;
      }

      if (!isValidEmail(email)) {
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
          body: JSON.stringify({ pseudo, email, subject: objet, body }),
        });

        const data = await res.json();
        if (!res.ok) {
          alert(
            `Erreur lors de l'envoi du message : ${data.error || res.status}`,
          );
          return;
        }

        await loadAllConversations();

        // Réinitialisation et fermeture propre
        if (newMsgPseudo) newMsgPseudo.value = "";
        if (newMsgEmail) newMsgEmail.value = "";
        if (newMsgObjet) newMsgObjet.value = "";
        if (newMsgBody) newMsgBody.value = "";
        closeNewMsg();
      } catch (err) {
        console.error("[ERROR] Erreur envoi nouveau message :", err);
        alert("Erreur lors de l'envoi du message au serveur.");
      }
    });
  }
}

// ============================================================
// ACTIONS CHAT : BOTTOM ET HEADER
// ============================================================
function initChatActions() {
  // Focus sur la zone de saisie via le bouton répondre du Header
  document.getElementById("btn-reply")?.addEventListener("click", () => {
    if (userInput) userInput.focus();
  });

  // Barre d'actions du bas (Archiver, Supprimer, Bloquer)
  document.querySelectorAll(".chat-actions .action-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pseudo = chatWithTitle
        ? chatWithTitle.textContent.trim().toLowerCase()
        : "";

      if (!pseudo || pseudo === "sélectionne une conversation") {
        alert("Aucune conversation sélectionnée.");
        return;
      }

      const msgs = messagesStore[pseudo] || [];

      if (btn.id === "btn-archive") {
        alert(`Conversation avec ${pseudo} archivée.`);
      } else if (btn.id === "btn-delete") {
        if (!msgs.length) {
          alert("Aucune conversation à supprimer.");
          return;
        }

        if (confirm(`Supprimer toute la conversation avec ${pseudo} ?`)) {
          try {
            const token = getAuthToken();
            if (!token) throw new Error("Token manquant");

            const receiverId = receiverIdStore[pseudo];

            await fetch(`/api/conversations/${receiverId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });

            // Nettoyage Frontend global
            delete messagesStore[pseudo];
            conversationStore.delete(pseudo);

            const convoEl = document.querySelector(
              `.conversation[data-user='${pseudo}']`,
            );
            if (convoEl) convoEl.remove();

            if (chatBox) {
              chatBox.innerHTML = `
                <div class="chat-empty" id="chat-empty-state">
                  <div class="chat-empty-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                  </div>
                  <h3>Aucune conversation sélectionnée</h3>
                  <p>Choisis une conversation à gauche<br />ou démarre-en une nouvelle.</p>
                </div>`;
            }
            if (chatWithTitle)
              chatWithTitle.textContent = "Sélectionne une conversation";
            if (chatAvatar) chatAvatar.textContent = "A";

            alert(`Conversation supprimée !`);
          } catch (err) {
            console.error(err);
            alert("Erreur suppression");
          }
        }
      } else if (btn.id === "btn-block") {
        alert(`Utilisateur ${pseudo} bloqué.`);
      }
    });
  });
}

// ============================================================
// MENU CONTEXTUEL BULLE MESSAGE (3 POINTS)
// ============================================================
function initContextMenu() {
  const msgMenu = document.getElementById("msgMenu");

  if (msgMenu) {
    msgMenu.addEventListener("click", async (e) => {
      const action = e.target.closest(".menu-item")?.dataset.action;
      if (!action) return;

      const pseudo = chatWithTitle
        ? chatWithTitle.textContent.trim().toLowerCase()
        : "";
      const msgs = messagesStore[pseudo] || [];
      const msg = msgs.find((m) => String(m.id) === String(selectedMessageId));

      if (!msg) return;

      if (action === "copy") {
        navigator.clipboard.writeText(msg.body);
        alert("Message copié !");
      }

      if (action === "delete") {
        try {
          const token = getAuthToken();
          await fetch(`/api/messages/${msg.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });

          // Retrait local direct
          messagesStore[pseudo] = msgs.filter((m) => m.id !== msg.id);
          await loadConversation(pseudo);
        } catch (err) {
          console.error(err);
        }
      }

      if (action === "save") {
        console.log("Message sauvegardé :", msg);
        alert("Message enregistré (à implémenter API)");
      }

      msgMenu.classList.add("hidden");
    });
  }

  // Fermer le menu si on clique ailleurs dans le document
  document.addEventListener("click", () => {
    if (msgMenu) msgMenu.classList.add("hidden");
  });
}

// ============================================================
// GESTION DU STATUT EN LIGNE (Simulation)
// ============================================================
function updateOnlineStatus() {
  const status = document.getElementById("chat-status");
  if (!status) return;

  const isOnline = Math.random() > 0.5; // Simulateur démo
  status.textContent = isOnline ? "En ligne" : "Hors ligne";
  status.className = "status" + (isOnline ? " online" : " offline");
}

// ============================================================
// GESTION DU SWIPE SUR MOBILE
// ============================================================
function initMobileSwipe() {
  if (window.innerWidth > 768) return;
  if (!mobileWrapper) return;

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

      // Ignorer si le swipe est plus vertical qu'horizontal
      if (
        Math.abs(e.touches[0].clientY - e.touches[0].clientY) > Math.abs(diffX)
      )
        return;

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
      "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)";
    if (!isSwiping) return;

    const diff = currentX - startX;

    if (diff > 80) {
      // Retour à la liste (vers la droite)
      mobileWrapper.classList.remove("show-chat");
      mobileWrapper.style.transform = "";
    } else if (diff < -80) {
      // Glisse vers le chat (vers la gauche)
      mobileWrapper.classList.add("show-chat");
      mobileWrapper.style.transform = "";
    } else {
      // Retour origine si mouvement incomplet
      mobileWrapper.style.transform = "";
    }
  });
}

// ============================================================
// INITIALISATION GLOBALE DU DOCUMENT (BOOTSTRAPPER)
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // Sécurité Auth
  const user = localStorage.getItem("agent_user");
  if (!user) {
    console.warn("[AUTH] Aucun utilisateur connecté");
    window.location.href = "index.html";
    return;
  }

  // Initialisation de tous les modules de l'interface
  initTheme();
  initSidebar();
  initMobileViews();
  initTabs();
  initSearch();
  initComposer();
  initNewMsgPopup();
  initChatActions();
  initContextMenu();
  initMobileSwipe();

  // Attache du bouton Logout
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.classList.remove("hidden");
    logoutBtn.addEventListener("click", logout);
  }

  // Lancement du cycle du statut
  setInterval(updateOnlineStatus, 5000);

  // Chargement de l'API Messagerie pour le Master Render
  loadAllConversations();
});
