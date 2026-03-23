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
    convo.classList.remove("has-unread"); // ← IMPORTANT pour le filtre

    chatWithTitle.textContent = name;

    console.log(`[CONVERSATION] Ouverture de ${name}`);
    await loadConversation(name);
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

    // RESET
    Object.keys(messagesStore).forEach((k) => delete messagesStore[k]);
    conversationStore.clear();

    // ==========================
    // REGROUPEMENT DES MESSAGES
    // ==========================
    msgs.forEach((m) => {
      const pseudoNorm =
        m.sender.trim().toLowerCase() === currentUser
          ? m.receiver.trim().toLowerCase()
          : m.sender.trim().toLowerCase();

      if (!messagesStore[pseudoNorm]) messagesStore[pseudoNorm] = [];
      messagesStore[pseudoNorm].push(m);
      conversationStore.add(pseudoNorm);
      // 🔥 NON LU (AJOUT ICI)
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

    // ==========================
    // TRI DES CONVERSATIONS
    // ==========================
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

    // ==========================
    // RENDER HTML
    // ==========================
    const container = document.getElementById("conversations-container");

    function renderGroup(title, list) {
      if (!list.length) return "";

      return `
    <div class="conversation-group">
      <div class="group-title">${title}</div>

      ${list
        .map(({ pseudo, lastMsg }) => {
          let avatarUrl =
            lastMsg.sender?.trim().toLowerCase() === currentUser
              ? lastMsg.receiverAvatar
              : lastMsg.senderAvatar;

          const date = new Date(lastMsg.timestamp);
          const time = date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          return `
  <div class="conversation ${unreadStore[pseudo] ? "has-unread" : ""}" data-user="${pseudo}">
    ${unreadStore[pseudo] ? `<div class="unread new"></div>` : ""}
    <div class="avatar" style="background-image:url('${avatarUrl || ""}')"></div>
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

    // ==========================
    // REBIND EVENTS
    // ==========================
    const newConversations = document.querySelectorAll(".conversation");
    newConversations.forEach(attachConversationClick);
    // ACTION DELETE HOVER
    document.querySelectorAll(".conv-actions").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();

        const pseudo = btn.dataset.user;

        if (!confirm(`Supprimer la conversation avec ${pseudo} ?`)) return;

        try {
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
        } catch (err) {
          console.error(err);
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
  const pseudoNorm = name.trim().toLowerCase();
  let msgs = messagesStore[pseudoNorm] || [];

  msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  msgs.forEach((msg) => {
    const isContact = msg.sender.trim().toLowerCase() === pseudoNorm;

    const div = document.createElement("div");
    div.classList.add("bubble", isContact ? "contact" : "user");

    const date = new Date(msg.timestamp);
    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    div.innerHTML = `
  <span class="text">
    <span class="subject">[${msg.subject}]</span> ${msg.body}
  </span>
  <span class="timestamp">${time}</span>
`;

    chatBox.appendChild(div);
  });

  chatBox.scrollTop = chatBox.scrollHeight;
}
// ==========================
// ENVOI DE MESSAGE RAPIDE
// ==========================
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  const pseudo = chatWithTitle.textContent.trim().toLowerCase();
  const subject = "Message rapide";

  // Vérifier si on connaît déjà le receiverId
  const receiverId = receiverIdStore[pseudo];
  const email = userEmailStore[pseudo];

  const payload = receiverId
    ? { receiverId, subject, body: text }
    : { pseudo, email, subject, body: text };

  if (!receiverId && !email) {
    alert(`Impossible d'envoyer : email du destinataire ${pseudo} inconnu`);
    return;
  }

  const div = document.createElement("div");
  div.classList.add("bubble", "user");
  div.textContent = text;

  const time = document.createElement("span");
  time.classList.add("timestamp");
  time.textContent = formatTime(new Date());

  div.appendChild(time);
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  userInput.value = "";

  /* ==========================
    ✅ CORRECTION UNIQUE ICI
    ========================== */
  if (!messagesStore[pseudo]) messagesStore[pseudo] = [];
  messagesStore[pseudo].push({
    sender: "me",
    subject,
    body: text,
    timestamp: new Date().toISOString(),
  });

  try {
    const token = getAuthToken();
    if (!token) throw new Error("Token manquant");

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
      alert(`Erreur lors de l'envoi du message : ${data.error || res.status}`);
      return;
    }

    await loadAllConversations();
  } catch (err) {
    console.error("[ERROR] Erreur envoi message :", err);
    const errorDiv = document.createElement("div");
    errorDiv.classList.add("bubble", "contact");
    errorDiv.textContent = "Erreur lors de l'envoi du message";
    chatBox.appendChild(errorDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});

// ==========================
// BOUTONS ACTIONS CHAT
// ==========================
document.querySelectorAll(".chat-actions .action-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const action = btn.textContent.toLowerCase();
    const pseudo = chatWithTitle.textContent.trim().toLowerCase();

    if (!pseudo) {
      alert("Aucune conversation sélectionnée.");
      return;
    }

    const msgs = messagesStore[pseudo] || [];
    const receiverId = receiverIdStore[pseudo];

    if (action.includes("archiver")) {
      alert(`Conversation avec ${pseudo} archivée.`);
    } else if (action.includes("supprimer")) {
      if (!msgs.length) {
        alert("Aucune conversation à supprimer.");
        return;
      }

      if (confirm(`Supprimer toute la conversation avec ${pseudo} ?`)) {
        try {
          const token = getAuthToken();
          if (!token) throw new Error("Token manquant");

          // Supprimer tous les messages un par un côté back
          for (const msg of msgs) {
            const idToDelete = msg.id || receiverId; // utiliser msg.id si dispo, sinon receiverId
            if (!idToDelete) continue;

            const res = await fetch(`/api/messages/${idToDelete}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              console.warn(
                `Erreur suppression message ${idToDelete}:`,
                data.error || res.status,
              );
            }
          }

          // Mise à jour locale
          delete messagesStore[pseudo];
          conversationStore.delete(pseudo);

          // Retirer la conversation du DOM
          const convoEl = document.querySelector(
            `.conversation[data-user='${pseudo}']`,
          );
          if (convoEl) convoEl.remove();

          // Nettoyer la zone chat si c'était la conversation active
          chatBox.innerHTML = "";
          chatWithTitle.textContent = "";

          alert(`Conversation entière avec ${pseudo} supprimée !`);
        } catch (err) {
          console.error("[ERROR] Suppression conversation :", err);
          alert(`Erreur lors de la suppression : ${err.message}`);
        }
      }
    } else if (action.includes("bloquer")) {
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
function updateOnlineStatus() {
  const status = document.getElementById("chat-status");
  if (!status) return;

  const isOnline = Math.random() > 0.5;

  status.textContent = isOnline ? "En ligne" : "Hors ligne";
  status.style.opacity = isOnline ? "1" : "0.6";
}

setInterval(updateOnlineStatus, 5000);
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
