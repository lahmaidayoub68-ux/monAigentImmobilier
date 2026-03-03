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
// CHARGEMENT PROFIL + ACTIONS
// ==========================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[PROFIL] DOMContentLoaded");

  // ==========================
  // AVATAR POPUP / ELEMENTS
  // ==========================
  const popup = document.getElementById("avatarPopup");
  const openBtn = document.getElementById("openAvatarPopup");
  const mainAvatar = document.getElementById("mainAvatar");

  // ==========================
  // AUTH / PROFIL
  // ==========================
  const savedUser = localStorage.getItem("agent_user");
  if (!savedUser) {
    console.warn(
      "[PROFIL] Pas de session détectée, redirection vers index.html",
    );
    alert("Session expirée ou non connectée. Veuillez revenir à l'accueil.");
    window.location.href = "/index.html";
    return;
  }

  let token;
  try {
    const userObj = JSON.parse(savedUser);
    token = userObj.token;

    // Vérification de l'expiration du token
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (Date.now() >= payload.exp * 1000) {
      console.warn("[PROFIL] Token expiré");
      localStorage.removeItem("agent_user");
      window.location.href = "/index.html";
      return;
    }

    console.log("[PROFIL] Token valide récupéré :", token);
  } catch (err) {
    console.error("[PROFIL] Token invalide ou corrompu :", err);
    localStorage.removeItem("agent_user");
    window.location.href = "/index.html";
    return;
  }

  // ==========================
  // FETCH /api/me
  // ==========================
  try {
    console.log("[PROFIL] Envoi de la requête /api/me au serveur");
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log("[PROFIL] Statut de /api/me :", res.status);

    if (!res.ok) {
      console.error("[PROFIL] /api/me retour non OK :", res.status);
      alert(
        "Erreur lors du chargement du profil. Veuillez revenir à l'accueil.",
      );
      localStorage.removeItem("agent_user");
      window.location.href = "/index.html";
      return;
    }

    const user = await res.json();
    console.log("[PROFIL] Données utilisateur reçues :", user);

    // ==========================
    // INJECTION DES DONNÉES
    // ==========================
    const usernameEl = document.getElementById("profile-username");
    const emailEl = document.getElementById("profile-email");
    const roleEl = document.getElementById("profile-role");
    const lastLoginEl = document.getElementById("profile-last-login");

    // === AVATAR ===
    if (mainAvatar) {
      mainAvatar.style.backgroundImage = `url(${user.avatar || "/images/default-avatar.png"})`;
      mainAvatar.style.backgroundSize = "cover";
      mainAvatar.style.backgroundPosition = "center";
      mainAvatar.style.backgroundRepeat = "no-repeat";
    }

    if (usernameEl) {
      usernameEl.textContent = user.username;
      console.log("[PROFIL] username injecté :", user.username);
    }
    if (emailEl) {
      emailEl.textContent = user.contact;
      console.log("[PROFIL] email injecté :", user.contact);
    }
    if (roleEl) {
      roleEl.textContent = user.role === "buyer" ? "Acheteur" : "Vendeur";
      console.log("[PROFIL] role injecté :", roleEl.textContent);
    }
    if (lastLoginEl) {
      lastLoginEl.textContent = new Date().toLocaleString("fr-FR");
      console.log("[PROFIL] lastLogin injecté :", lastLoginEl.textContent);
    }
  } catch (err) {
    console.error("[PROFIL] Erreur lors du fetch /api/me :", err);
    alert("Erreur lors du chargement du profil. Veuillez revenir à l'accueil.");
    window.location.href = "/index.html";
    return;
  }

  // ==========================
  // BOUTONS ACTIONS PROFIL
  // ==========================
  const btnModifierMDP = Array.from(
    document.querySelectorAll(".info-list button"),
  ).find((btn) => btn.textContent.includes("Modifier"));

  const btnDeconnexion = document.getElementById("btnDeconnexion");

  const btnSupprimerCompte = Array.from(
    document.querySelectorAll(".action-btn"),
  ).find((btn) => btn.textContent.includes("Supprimer"));

  const btnSupport = Array.from(document.querySelectorAll(".action-btn")).find(
    (btn) => btn.textContent.includes("Contacter"),
  );

  // ==========================
  // DÉCONNEXION
  // ==========================
  if (btnDeconnexion) {
    btnDeconnexion.addEventListener("click", () => {
      console.log("[PROFIL] Bouton déconnexion cliqué");
      const confirmLogout = confirm("Voulez-vous vraiment vous déconnecter ?");
      if (!confirmLogout) {
        console.log("[PROFIL] Déconnexion annulée par l'utilisateur");
        return;
      }

      localStorage.removeItem("agent_user");
      console.log(
        "[PROFIL] Token supprimé du localStorage, redirection vers index",
      );
      alert("Déconnexion réussie");
      window.location.href = "/index.html";
    });
  }

  // ==========================
  // POPUP CHANGER MOT DE PASSE
  // ==========================
  const passwordOverlay = document.getElementById("passwordOverlay");
  const openPasswordBtn = document.getElementById("openPasswordModal");

  if (openPasswordBtn && passwordOverlay) {
    // Ouvrir la popup
    openPasswordBtn.addEventListener("click", () => {
      console.log("[PROFIL] Ouverture popup mot de passe");
      passwordOverlay.classList.add("active");
    });

    // Fermer la popup si clic en dehors du modal
    passwordOverlay.addEventListener("click", (e) => {
      if (e.target === passwordOverlay) {
        console.log("[PROFIL] Fermeture popup mot de passe");
        passwordOverlay.classList.remove("active");
        clearPasswordFields();
      }
    });
  }

  // Champs du formulaire
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const btnChangePassword = document.getElementById("btnChangePassword");

  const clearPasswordFields = () => {
    if (currentPasswordInput) currentPasswordInput.value = "";
    if (newPasswordInput) newPasswordInput.value = "";
    if (confirmPasswordInput) confirmPasswordInput.value = "";
  };

  // Gestion du clic sur "Changer le mot de passe"
  if (
    btnChangePassword &&
    currentPasswordInput &&
    newPasswordInput &&
    confirmPasswordInput
  ) {
    btnChangePassword.addEventListener("click", async () => {
      const currentPassword = currentPasswordInput.value.trim();
      const newPassword = newPasswordInput.value.trim();
      const confirmPassword = confirmPasswordInput.value.trim();

      // Validation simple côté front
      if (!currentPassword) {
        alert("Veuillez entrer votre mot de passe actuel.");
        return;
      }
      if (!newPassword || newPassword.length < 6) {
        alert("Le nouveau mot de passe doit contenir au moins 6 caractères.");
        return;
      }
      if (newPassword !== confirmPassword) {
        alert(
          "Le nouveau mot de passe et la confirmation ne correspondent pas.",
        );
        return;
      }

      // Récupération du token
      const savedUser = localStorage.getItem("agent_user");
      if (!savedUser) {
        alert("Session expirée. Veuillez vous reconnecter.");
        window.location.href = "/index.html";
        return;
      }

      let token;
      try {
        token = JSON.parse(savedUser).token;
      } catch {
        alert("Token invalide. Veuillez vous reconnecter.");
        localStorage.removeItem("agent_user");
        window.location.href = "/index.html";
        return;
      }

      try {
        console.log("[PROFIL] Envoi requête /api/change-password au serveur");
        const res = await fetch("/api/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });

        if (res.ok) {
          alert("Mot de passe changé avec succès !");
          passwordOverlay.classList.remove("active");
          clearPasswordFields();
        } else {
          const data = await res.json();
          alert(
            "Erreur : " +
              (data.error || "Impossible de changer le mot de passe."),
          );
          console.warn("[PROFIL] /api/change-password réponse erreur :", data);
        }
      } catch (err) {
        console.error("[PROFIL] Erreur fetch /api/change-password :", err);
        alert("Erreur serveur. Veuillez réessayer plus tard.");
      }
    });
  }

  // ==========================
  // SUPPRIMER COMPTE
  // ==========================
  if (btnSupprimerCompte) {
    btnSupprimerCompte.addEventListener("click", async () => {
      console.log("[PROFIL] Bouton supprimer compte cliqué");
      const confirmSupp = confirm(
        "Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.",
      );

      if (!confirmSupp) {
        console.log("[PROFIL] Suppression annulée par l'utilisateur");
        return;
      }

      alert("Compte supprimé (simulation)");
      console.log(
        "[PROFIL] TODO : API DELETE /api/me + suppression token + redirection",
      );
      // TODO : appel API DELETE /api/me
      // puis localStorage.removeItem("agent_user");
      // window.location.href = "/";
    });
  }

  // ==========================
  // POPUP AVATAR
  // ==========================
  if (openBtn && popup && mainAvatar) {
    // Ouvrir popup
    openBtn.addEventListener("click", () => popup.classList.add("active"));

    // Fermer si clic en dehors
    popup.addEventListener("click", (e) => {
      if (e.target === popup) popup.classList.remove("active");
    });

    document.querySelectorAll(".avatar-item img").forEach((img) => {
      img.addEventListener("click", () => {
        // Mettre l'image sélectionnée
        mainAvatar.style.backgroundImage = `url(${img.src})`;
        mainAvatar.style.backgroundColor = "#83c9f4";
        mainAvatar.style.backgroundSize = "cover";
        mainAvatar.style.backgroundPosition = "center";
        mainAvatar.style.backgroundRepeat = "no-repeat";

        // Fermer le popup
        popup.classList.remove("active");

        // ================== PERSISTE EN BASE ==================
        (async () => {
          try {
            const token = JSON.parse(localStorage.getItem("agent_user")).token;
            const res = await fetch("/api/change-avatar", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ avatar: img.src }),
            });
            if (!res.ok) throw new Error("Erreur sauvegarde avatar");
            console.log("[PROFIL] Avatar sauvegardé en DB ✅");
          } catch (err) {
            console.error("[PROFIL] Impossible de sauvegarder l'avatar :", err);
          }
        })();
      });
    });
  }

  // ==========================
  // SUPPORT
  // ==========================
  if (btnSupport) {
    btnSupport.addEventListener("click", () => {
      console.log("[PROFIL] Bouton support cliqué");
      alert("Contacter le support...");
      // window.location.href = "/support.html";
    });
  }
});
