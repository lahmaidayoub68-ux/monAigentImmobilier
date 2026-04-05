function formatTime(dateString) {
  const date = new Date(dateString);

  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
// ==========================
// AUTH TOKEN UTILITAIRE
// ==========================
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
// ==========================
// LOGOUT
// ==========================
function logout() {
  console.log("[AUTH] Déconnexion...");

  // Supprimer la session
  localStorage.removeItem("agent_user");

  // Vider les stores locaux
  Object.keys(messagesStore).forEach((k) => delete messagesStore[k]);
  conversationStore.clear();
  Object.keys(unreadStore).forEach((k) => delete unreadStore[k]);

  // Nettoyer le DOM
  const list = document.querySelector(".conversations-list");
  const chat = document.getElementById("chat-box");

  if (list) list.innerHTML = "";
  if (chat) chat.innerHTML = "";

  // Redirection vers la page login
  window.location.href = "index.html";
}
// ==========================
// MENU LATÉRAL
// ==========================
const sidebar = document.getElementById("sidebar");
const openBtn = document.getElementById("openSidebar");
const closeBtn = document.getElementById("closeSidebar");
const overlay = document.getElementById("sidebarOverlay");

if (openBtn && sidebar && overlay) {
  openBtn.addEventListener("click", () => {
    console.log("[SIDEBAR] Ouverture menu");
    sidebar.classList.add("open");
    overlay.classList.add("active");
    // FAIRE DISPARAÎTRE LE BOUTON DU MENU
    openBtn.style.display = "none";
  });
}

if (closeBtn && sidebar && overlay) {
  closeBtn.addEventListener("click", () => {
    console.log("[SIDEBAR] Fermeture menu");
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    // FAIRE RÉAPPARAÎTRE LE BOUTON DU MENU
    openBtn.style.display = "flex"; // flex pour conserver l'alignement initial
  });
}

if (overlay && sidebar) {
  overlay.addEventListener("click", () => {
    console.log("[SIDEBAR] Fermeture menu via overlay");
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    // FAIRE RÉAPPARAÎTRE LE BOUTON DU MENU
    openBtn.style.display = "flex";
  });
}

// ==========================
// GESTION CONVERSATIONS
// ==========================
let conversations = document.querySelectorAll(".conversation");
const chatWithTitle = document.getElementById("chat-with");
const chatBox = document.getElementById("chat-box");

// Stockage messages, emails et receiverId par pseudo
const messagesStore = {};
const conversationStore = new Set();
const userEmailStore = {};
const receiverIdStore = {}; // <-- nouveau
const unreadStore = {};

const currentUser = JSON.parse(
  localStorage.getItem("agent_user"),
)?.username?.toLowerCase();

// ==========================
// ATTACH CONVERSATION CLICK
// ==========================
function attachConversationClick(convo) {
  convo.addEventListener("click", async () => {
    // reset active
    document
      .querySelectorAll(".conversation")
      .forEach((c) => c.classList.remove("active"));
    convo.classList.add("active");

    const name = convo.dataset.user;

    // 🔥 RESET NON LU
    unreadStore[name.toLowerCase()] = false;
    convo.querySelector(".unread")?.remove();
    convo.classList.remove("has-unread");

    chatWithTitle.textContent = name;

    console.log(`[CONVERSATION] Ouverture de ${name}`);
    await loadConversation(name);

    // ==========================
    // 🔥 AJOUT ICI (TRÈS IMPORTANT)
    // ==========================
    if (window.innerWidth <= 768) {
      const wrapper = document.querySelector(".mobile-wrapper");

      if (wrapper) {
        wrapper.classList.remove("conversations-active");
        wrapper.classList.add("chat-active");
      }
    }
  });
}
conversations.forEach(attachConversationClick);

// ==========================
// CHARGER TOUTES LES CONVERSATIONS
// ==========================
async function loadAllConversations() {
  try {
    const token = getAuthToken();
    if (!token) {
      alert("Vous devez être connecté pour voir vos messages.");
      return;
    }

    const res = await fetch("/api/messages", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      alert("Erreur lors de la récupération des messages.");
      return;
    }

    const msgs = Array.isArray(data) ? data : [];
    console.log("[DEBUG RAW MESSAGES]", msgs);

    // RESET
    Object.keys(messagesStore).forEach((k) => delete messagesStore[k]);
    conversationStore.clear();

    // REGROUPEMENT DES MESSAGES
    msgs.forEach((m) => {
      const pseudoNorm =
        m.sender.trim().toLowerCase() === currentUser
          ? m.receiver.trim().toLowerCase()
          : m.sender.trim().toLowerCase();

      if (!messagesStore[pseudoNorm]) messagesStore[pseudoNorm] = [];
      messagesStore[pseudoNorm].push(m);
      conversationStore.add(pseudoNorm);

      // NON LU
      if (m.receiver?.toLowerCase() === currentUser && !m.read) {
        unreadStore[pseudoNorm] = true;
      }

      // Email
      if (m.senderEmail)
        userEmailStore[pseudoNorm] = m.senderEmail.trim().toLowerCase();

      // ReceiverId
      receiverIdStore[pseudoNorm] =
        m.sender.trim().toLowerCase() === currentUser
          ? m.receiver_id
          : m.sender_id;
      console.log("[DEBUG GROUPING]", {
        sender: m.sender,
        receiver: m.receiver,
        senderAvatar: m.senderAvatar,
        receiverAvatar: m.receiverAvatar,
      });
    });

    // TRI DES CONVERSATIONS
    const recentes = [];
    const anciennes = [];

    conversationStore.forEach((pseudo) => {
      const msgs = messagesStore[pseudo];
      const lastMsg = msgs[msgs.length - 1];
      const date = new Date(lastMsg.timestamp);
      const now = new Date();
      const diffHours = (now - date) / (1000 * 60 * 60);
      if (diffHours < 24) {
        recentes.push({ pseudo, lastMsg });
      } else {
        anciennes.push({ pseudo, lastMsg });
      }
    });

    // RENDER HTML
    const container = document.getElementById("conversations-container");

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
          console.log("[DEBUG CONVERSATION AVATAR]", {
            pseudo,
            lastMsg,
            sender: lastMsg.sender,
            receiver: lastMsg.receiver,
            senderAvatar: lastMsg.senderAvatar,
            receiverAvatar: lastMsg.receiverAvatar,
            chosenAvatar:
              lastMsg.sender.trim().toLowerCase() === currentUser
                ? lastMsg.receiverAvatar
                : lastMsg.senderAvatar,
          });

          const time = new Date(lastMsg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          return `
  <div class="conversation ${unreadStore[pseudo] ? "has-unread" : ""}" data-user="${pseudo}">
    ${unreadStore[pseudo] ? `<div class="unread new"></div>` : ""}
    <div class="avatar" style="background-image:url('${avatarUrl || "/images/user-avatar.jpg"}')"></div>
    <div class="info">
      <div class="top-line">
        <span class="name">${pseudo}</span>
        <span class="time">${time}</span>
      </div>
      <div class="preview">
        ${lastMsg.body.substring(0, 40)}
      </div>
    </div>
    <div class="conv-actions" data-user="${pseudo}">🗑</div>
  </div>
`;
        })
        .join("")}
    </div>
  `;
    }

    container.innerHTML =
      renderGroup("Récentes", recentes) + renderGroup("Anciennes", anciennes);

    // REBIND EVENTS
    const newConversations = document.querySelectorAll(".conversation");
    newConversations.forEach(attachConversationClick);

    // DELETE BTN
    document.querySelectorAll(".conv-actions").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();

        const pseudo = btn.dataset.user;

        if (!confirm(`Supprimer la conversation avec ${pseudo} ?`)) return;

        try {
          const token = getAuthToken();
          if (!token) throw new Error("Token manquant");

          const receiverId = Number(receiverIdStore[pseudo]);

          if (!receiverId) {
            alert("Erreur : utilisateur introuvable");
            return;
          }

          // 🔥 SUPPRESSION BACKEND
          await fetch(`/api/conversations/${receiverId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          // 🔥 CLEAN FRONT
          delete messagesStore[pseudo];
          conversationStore.delete(pseudo);

          const el = document.querySelector(
            `.conversation[data-user='${pseudo}']`,
          );
          if (el) el.remove();

          if (chatWithTitle.textContent === pseudo) {
            chatBox.innerHTML = "";
            chatWithTitle.textContent = "";
          }

          console.log("Conversation supprimée :", pseudo);
        } catch (err) {
          console.error(err);
          alert("Erreur suppression");
        }
      });
    });
    conversations = newConversations;
  } catch (err) {
    console.error("[ERROR] Erreur chargement conversations :", err);
  }
}
// ==========================
// CHARGER UNE CONVERSATION
// ==========================
async function loadConversation(name) {
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

    const div = document.createElement("div");
    div.classList.add("bubble", isContact ? "contact" : "user");

    const avatarUrl = isContact ? msg.senderAvatar : msg.receiverAvatar;
    const date = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    div.innerHTML = `
      <div class="bubble-content">
        <div class="avatar" style="background-image:url('${avatarUrl}')"></div>
        <div class="message-body">
          <span class="text">
  ${msg.subject ? `[${msg.subject}] ` : ""}${msg.body}
</span>
        </div>
      </div>
      <div class="msg-menu-btn" data-id="${msg.id}">
        <svg viewBox="0 0 24 24">
          <defs>
            <linearGradient id="gradientDots" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7b5cff"/>
              <stop offset="100%" stop-color="#ff4ecd"/>
            </linearGradient>
          </defs>
          <circle cx="5" cy="12" r="2"/>
          <circle cx="12" cy="12" r="2"/>
          <circle cx="19" cy="12" r="2"/>
        </svg>
      </div>
    `;

    const timestampDiv = document.createElement("div");
    timestampDiv.classList.add(
      "timestamp-container",
      isContact ? "left" : "right",
    );
    timestampDiv.textContent = time;

    wrapper.appendChild(div);
    wrapper.appendChild(timestampDiv);

    chatBox.appendChild(wrapper); // ✅ uniquement le wrapper
  });
  document.querySelectorAll(".msg-menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      selectedMessageId = btn.dataset.id;

      msgMenu.style.top = e.pageY + "px";
      msgMenu.style.left = e.pageX + "px";
      msgMenu.classList.remove("hidden");
    });
  });

  chatBox.scrollTop = chatBox.scrollHeight;
} // ==========================
// ENVOI DE MESSAGE RAPIDE
// ==========================
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  const pseudo = chatWithTitle.textContent.trim().toLowerCase();

  const receiverId = Number(receiverIdStore[pseudo]);
  const email = userEmailStore[pseudo];

  const payload =
    receiverId && !isNaN(receiverId)
      ? { receiverId, body: text, subject: "" } // subject vide
      : { pseudo, email, body: text, subject: "" }; // subject vide

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

    // reset input
    userInput.value = "";

    // refresh clean
    await loadAllConversations();
    await loadConversation(pseudo);
  } catch (err) {
    console.error("[ERROR] Erreur envoi message :", err);
  }
});

// ==========================
// BOUTONS ACTIONS CHAT
// ==========================
document.querySelectorAll(".chat-actions .action-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const pseudo = chatWithTitle.textContent.trim().toLowerCase();

    if (!pseudo) {
      alert("Aucune conversation sélectionnée.");
      return;
    }

    const msgs = messagesStore[pseudo] || [];
    const receiverId = Number(receiverIdStore[pseudo]);

    // ✅ IDENTIFICATION PAR ID
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
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          // nettoyage front
          delete messagesStore[pseudo];
          conversationStore.delete(pseudo);

          const convoEl = document.querySelector(
            `.conversation[data-user='${pseudo}']`,
          );
          if (convoEl) convoEl.remove();

          chatBox.innerHTML = "";
          chatWithTitle.textContent = "";

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
// ==========================
// REPONDRE / NOUVEAU MESSAGE
// ==========================
document
  .getElementById("btn-reply")
  .addEventListener("click", () => userInput.focus());
const btnNouveau = document.getElementById("btn-nouveau-message");

// ==========================
// POPUP NOUVEAU MESSAGE
// ==========================
const newMsgOverlay = document.getElementById("newMsgOverlay");
const newMsgClose = document.getElementById("newMsgClose");
const newMsgSend = document.getElementById("newMsgSend");
const newMsgPseudo = document.getElementById("newMsgPseudo");
const newMsgEmail = document.getElementById("newMsgEmail");
const newMsgObjet = document.getElementById("newMsgObjet");
const newMsgBody = document.getElementById("newMsgBody");

btnNouveau.addEventListener("click", () => {
  newMsgOverlay.classList.add("active");
});

newMsgClose.addEventListener("click", () => {
  newMsgOverlay.classList.remove("active");
});

newMsgOverlay.addEventListener("click", (e) => {
  if (e.target === newMsgOverlay) newMsgOverlay.classList.remove("active");
});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+.[^\s@]+$/.test(email);
}

// ==========================
// ENVOI NOUVEAU MESSAGE
// ==========================
newMsgSend.addEventListener("click", async () => {
  const pseudo = newMsgPseudo.value.trim().toLowerCase();
  const email = newMsgEmail.value.trim().toLowerCase();
  const objet = newMsgObjet.value.trim();
  const body = newMsgBody.value.trim();

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
      alert(`Erreur lors de l'envoi du message : ${data.error || res.status}`);
      return;
    }

    await loadAllConversations();

    newMsgPseudo.value = "";
    newMsgEmail.value = "";
    newMsgObjet.value = "";
    newMsgBody.value = "";
    newMsgOverlay.classList.remove("active");
  } catch (err) {
    console.error("[ERROR] Erreur envoi nouveau message :", err);
    alert("Erreur lors de l'envoi du message au serveur.");
  }
});
// ==========================
// BOUTON LOGOUT
// ==========================
const logoutBtn = document.getElementById("btn-logout");

if (logoutBtn) {
  logoutBtn.classList.remove("hidden");
  logoutBtn.addEventListener("click", logout);
}
const searchInput = document.getElementById("search-conversations");

if (searchInput) {
  searchInput.addEventListener("input", () => {
    const value = searchInput.value.toLowerCase();

    document.querySelectorAll(".conversation").forEach((c) => {
      const name = c.dataset.user;

      if (name.includes(value)) {
        c.style.display = "flex";
      } else {
        c.style.display = "none";
      }
    });
  });
}
// ==========================
// FILTRE DES ONGLETS
// ==========================
document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    // Reset active
    document
      .querySelectorAll(".tabs button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const filter = btn.dataset.filter;

    document.querySelectorAll(".conversation").forEach((c) => {
      if (filter === "all") {
        c.style.display = "flex";
      } else if (filter === "unread") {
        // ✅ Maintenant on check la classe has-unread
        c.style.display = c.classList.contains("has-unread") ? "flex" : "none";
      } else if (filter === "archived") {
        c.style.display = "none"; // placeholder pour futur
      }
    });
  });
});
//Menu 3 points//
const msgMenu = document.getElementById("msgMenu");
let selectedMessageId = null;
function updateOnlineStatus() {
  const status = document.getElementById("chat-status");
  if (!status) return;

  const isOnline = Math.random() > 0.5;

  status.textContent = isOnline ? "En ligne" : "Hors ligne";
  status.style.opacity = isOnline ? "1" : "0.6";
}
msgMenu.addEventListener("click", async (e) => {
  const action = e.target.closest(".menu-item")?.dataset.action;

  if (!action) return;

  const pseudo = chatWithTitle.textContent.trim().toLowerCase();
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // remove local
      messagesStore[pseudo] = msgs.filter((m) => m.id !== msg.id);

      await loadConversation(pseudo);
    } catch (err) {
      console.error(err);
    }
  }

  if (action === "save") {
    console.log("Message sauvegardé :", msg);
    alert("Message enregistré (à implémenter)");
  }

  msgMenu.classList.add("hidden");
});
document.addEventListener("click", () => {
  msgMenu.classList.add("hidden");
});

setInterval(updateOnlineStatus, 5000);
//SWIPE MOBILE//
function initMobileSwipe() {
  if (window.innerWidth > 768) return;

  const wrapper = document.querySelector(".mobile-wrapper");
  const indicator = document.querySelector(".swipe-indicator");
  const line = indicator.querySelector(".line");

  if (!wrapper || !indicator) return;

  let startX = 0,
    currentX = 0,
    isSwiping = false;

  wrapper.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    isSwiping = false;
  });

  wrapper.addEventListener("touchmove", (e) => {
    currentX = e.touches[0].clientX;
    const diffX = currentX - startX;
    if (Math.abs(e.touches[0].clientY - e.touches[0].clientY) > Math.abs(diffX))
      return;

    isSwiping = true;

    let translate = wrapper.classList.contains("conversations-active")
      ? 0
      : -window.innerWidth;

    wrapper.style.transition = "none";
    wrapper.style.transform = `translateX(${translate + diffX}px)`;

    // montre et étire la ligne seulement pendant swipe
    line.style.width = `${Math.min(Math.abs(diffX), 150)}px`;
    line.style.opacity = "1";
  });

  wrapper.addEventListener("touchend", () => {
    wrapper.style.transition = "transform 0.3s ease";
    if (!isSwiping) return;

    const diff = currentX - startX;

    if (diff > 80) {
      wrapper.classList.remove("chat-active");
      wrapper.classList.add("conversations-active");
    } else if (diff < -80) {
      wrapper.classList.remove("conversations-active");
      wrapper.classList.add("chat-active");
    } else {
      wrapper.style.transform = wrapper.classList.contains("chat-active")
        ? "translateX(-100vw)"
        : "translateX(0)";
    }

    // 🔹 cache seulement la ligne, **pas les flèches**
    line.style.width = "0";
    line.style.opacity = "0";

    // 🔹 les flèches restent toujours visibles, pas de display:none
  });
}

window.addEventListener("load", initMobileSwipe);
window.addEventListener("load", () => {
  initMobileSwipe();

  // 🔥 INDICATEUR FADE
  const indicator = document.querySelector(".swipe-indicator");
});
// ==========================
// CHECK SESSION
// ==========================
document.addEventListener("DOMContentLoaded", () => {
  const user = localStorage.getItem("agent_user");

  if (!user) {
    console.warn("[AUTH] Aucun utilisateur connecté");
    window.location.href = "index.html";
    return;
  }

  loadAllConversations();
});
