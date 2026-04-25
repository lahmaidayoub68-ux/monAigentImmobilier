/**
 * profil.js - Dashboard Premium AiGENT
 */

const API_BASE = window.location.origin;
let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
  const rawUser = localStorage.getItem("agent_user");
  if (!rawUser) {
    window.location.href = "index.html";
    return;
  }
  currentUser = JSON.parse(rawUser);

  initTheme();
  initSidebar();
  await loadProfile();

  // Event listeners
  document
    .getElementById("btn-logout-header")
    ?.addEventListener("click", logout);
  document.getElementById("btnDeconnexion")?.addEventListener("click", logout);
  document
    .getElementById("btnDeleteAccount")
    ?.addEventListener("click", deleteAccount);

  // Modals
  setupModal("openPasswordModal", "passwordOverlay");
  setupModal("openSupportModal", "supportOverlay");
  setupModal("openAvatarPopup", "avatarPopup");

  // Password logic
  document
    .getElementById("btnChangePassword")
    ?.addEventListener("click", handleChangePassword);

  // Support logic
  document
    .getElementById("btnSendSupport")
    ?.addEventListener("click", handleSendSupport);

  // Avatar list init
  initAvatarList();
});

// --- THÈME ---
function initTheme() {
  const btn = document.getElementById("btn-theme");
  const html = document.documentElement;
  const apply = (t) => {
    html.setAttribute("data-theme", t);
    localStorage.setItem("aigent_theme", t);
  };
  btn.addEventListener("click", () => {
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    apply(next);
  });
  apply(localStorage.getItem("aigent_theme") || "dark");
}

// --- CHARGEMENT PROFIL ---
async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${currentUser.token}` },
    });
    if (!res.ok) throw new Error("Session invalide");

    const data = await res.json();

    // Injection Hero
    document.getElementById("hero-user").textContent = data.username;
    document.getElementById("mainAvatar").style.backgroundImage =
      `url(${data.avatar || "images/default-avatar.png"})`;

    // Injection Champs
    document
      .querySelectorAll(".profile-username")
      .forEach((el) => (el.textContent = data.username));
    document
      .querySelectorAll(".profile-email")
      .forEach((el) => (el.textContent = data.contact));
    const roleFr =
      data.role === "buyer" ? "Acheteur Premium" : "Vendeur Certifié";
    document
      .querySelectorAll(".profile-role")
      .forEach((el) => (el.textContent = roleFr));

    document.getElementById("profile-last-login").textContent =
      new Date().toLocaleString("fr-FR");
  } catch (err) {
    console.error(err);
    logout();
  }
}

// --- MODALS HELPER ---
function setupModal(triggerId, overlayId) {
  const trigger = document.getElementById(triggerId);
  const overlay = document.getElementById(overlayId);
  if (!trigger || !overlay) return;

  trigger.addEventListener("click", () => overlay.classList.add("active"));

  overlay.addEventListener("click", (e) => {
    if (
      e.target === overlay ||
      e.target.classList.contains("btn-close-modal")
    ) {
      overlay.classList.remove("active");
    }
  });
}

// --- CHANGEMENT MOT DE PASSE ---
async function handleChangePassword() {
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirm = document.getElementById("confirmPassword").value;

  if (newPassword !== confirm)
    return alert("Les mots de passe ne correspondent pas.");
  if (newPassword.length < 6) return alert("Le mot de passe est trop court.");

  try {
    const res = await fetch(`${API_BASE}/api/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.ok) {
      alert("Mot de passe mis à jour !");
      document.getElementById("passwordOverlay").classList.remove("active");
    } else {
      const err = await res.json();
      alert(err.error || "Erreur lors du changement");
    }
  } catch (e) {
    alert("Erreur serveur");
  }
}

// --- ENVOI SUPPORT ---
async function handleSendSupport() {
  const subject = document.getElementById("supportSubject").value;
  const message = document.getElementById("supportMessage").value;

  if (!subject || !message) return alert("Veuillez remplir tous les champs.");

  try {
    const res = await fetch(`${API_BASE}/api/support`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`,
      },
      body: JSON.stringify({ subject, message }),
    });
    if (res.ok) {
      alert("Message envoyé à l'équipe !");
      document.getElementById("supportOverlay").classList.remove("active");
    }
  } catch (e) {
    alert("Erreur envoi support");
  }
}

// --- AVATARS ---
function initAvatarList() {
  const grid = document.getElementById("avatarList");
  const seeds = [
    "Mackenzie",
    "Luis",
    "Maria",
    "Amaya",
    "Destiny",
    "Eden",
    "Easton",
    "Christian",
    "Alexander",
    "Katherine",
    "Brian",
    "Caleb",
  ];

  seeds.forEach((seed) => {
    const url = `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`;
    const item = document.createElement("div");
    item.className = "avatar-item";
    item.innerHTML = `<img src="${url}" alt="avatar">`;
    item.onclick = () => updateAvatar(url);
    grid.appendChild(item);
  });
}

async function updateAvatar(url) {
  try {
    const res = await fetch(`${API_BASE}/api/change-avatar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentUser.token}`,
      },
      body: JSON.stringify({ avatar: url }),
    });
    if (res.ok) {
      document.getElementById("mainAvatar").style.backgroundImage =
        `url(${url})`;
      document.getElementById("avatarPopup").classList.remove("active");
    }
  } catch (e) {
    console.error(e);
  }
}

// --- AUTH ACTIONS ---
function initSidebar() {
  const side = document.getElementById("sidebar");
  const open = document.getElementById("openSidebar");
  const close = document.getElementById("closeSidebar");
  const over = document.getElementById("sidebarOverlay");
  const toggle = (s) => {
    side.classList.toggle("open", s);
    over.classList.toggle("active", s);
  };
  open.onclick = () => toggle(true);
  close.onclick = () => toggle(false);
  over.onclick = () => toggle(false);
}

function logout() {
  if (confirm("Se déconnecter ?")) {
    localStorage.clear();
    window.location.href = "index.html";
  }
}

function deleteAccount() {
  if (
    confirm("⚠️ Action irréversible : Supprimer définitivement votre compte ?")
  ) {
    alert("Action simulée : Compte supprimé.");
    localStorage.clear();
    window.location.href = "index.html";
  }
}
