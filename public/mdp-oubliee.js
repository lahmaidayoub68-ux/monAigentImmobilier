function togglePwd(inputId, btn) {
  const input = document.getElementById(inputId);
  input.type = input.type === "password" ? "text" : "password";
}

// ── MOT DE PASSE OUBLIÉ ──
const API_BASE = window.location.origin;
let _forgotResetToken = null;

function _forgotCalcStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function _forgotUpdateStrength(pw) {
  const bar = document.getElementById("forgot-pwd-strength-bar");
  const label = document.getElementById("forgot-pwd-strength-label");
  if (!bar || !label) return;
  const configs = [
    { pct: 0, color: "transparent", text: "" },
    { pct: 25, color: "#f43f5e", text: "Trop faible" },
    { pct: 50, color: "#f59e0b", text: "Faible" },
    { pct: 75, color: "#3b82f6", text: "Bon" },
    { pct: 100, color: "#10b981", text: "Excellent" },
  ];
  const cfg = configs[_forgotCalcStrength(pw)];
  bar.style.width = cfg.pct + "%";
  bar.style.background = cfg.color;
  label.textContent = cfg.text;
  label.style.color = cfg.color;
}

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("forgot-overlay");
  const modal = document.getElementById("forgot-modal");

  document.getElementById("forgot-pwd-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    overlay.style.display = "flex";
    document.getElementById("forgot-step1").style.display = "";
    document.getElementById("forgot-step2").style.display = "none";
    document.getElementById("forgot-step3").style.display = "none";
    document.getElementById("forgot-username").value = "";
    document.getElementById("forgot-recovery-code").value = "";
    document.getElementById("forgot-step1-error").style.display = "none";
    _forgotResetToken = null;
  });

  document.getElementById("forgot-close")?.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.style.display = "none";
  });

  // Barre de force en temps réel
  document.getElementById("forgot-new-pwd")?.addEventListener("input", (e) => {
    _forgotUpdateStrength(e.target.value);
  });

  // ÉTAPE 1 : vérifier pseudo + code récupération
  document
    .getElementById("forgot-step1-btn")
    ?.addEventListener("click", async () => {
      const username = document.getElementById("forgot-username").value.trim();
      const code = document
        .getElementById("forgot-recovery-code")
        .value.trim()
        .toUpperCase();
      const errEl = document.getElementById("forgot-step1-error");
      const btn = document.getElementById("forgot-step1-btn");

      if (!username || !code) {
        errEl.textContent = "Pseudo et code de récupération requis.";
        errEl.style.display = "";
        return;
      }

      btn.textContent = "Vérification…";
      btn.disabled = true;
      errEl.style.display = "none";

      try {
        const res = await fetch(`${API_BASE}/api/2fa/verify-recovery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, recoveryCode: code }),
        });
        const data = await res.json();

        if (!res.ok) {
          errEl.textContent =
            data.error || "Code invalide ou compte introuvable.";
          errEl.style.display = "";
          btn.textContent = "Vérifier le code →";
          btn.disabled = false;
          return;
        }

        _forgotResetToken = data.resetToken;
        document.getElementById("forgot-step1").style.display = "none";
        document.getElementById("forgot-step2").style.display = "";
        setTimeout(
          () => document.getElementById("forgot-new-pwd")?.focus(),
          80,
        );
      } catch {
        errEl.textContent = "Erreur réseau. Réessayez.";
        errEl.style.display = "";
        btn.textContent = "Vérifier le code →";
        btn.disabled = false;
      }
    });

  // ÉTAPE 2 : nouveau mot de passe
  document
    .getElementById("forgot-step2-btn")
    ?.addEventListener("click", async () => {
      const newPwd = document.getElementById("forgot-new-pwd").value;
      const confirmPwd = document.getElementById("forgot-confirm-pwd").value;
      const errEl = document.getElementById("forgot-step2-error");
      const btn = document.getElementById("forgot-step2-btn");

      errEl.style.display = "none";

      if (newPwd.length < 8) {
        errEl.textContent =
          "Le mot de passe doit contenir au moins 8 caractères.";
        errEl.style.display = "";
        return;
      }
      if (newPwd !== confirmPwd) {
        errEl.textContent = "Les mots de passe ne correspondent pas.";
        errEl.style.display = "";
        return;
      }
      if (_forgotCalcStrength(newPwd) < 2) {
        errEl.textContent =
          "Mot de passe trop faible. Ajoutez des chiffres ou majuscules.";
        errEl.style.display = "";
        return;
      }

      btn.textContent = "Enregistrement…";
      btn.disabled = true;

      try {
        const res = await fetch(`${API_BASE}/api/2fa/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resetToken: _forgotResetToken,
            newPassword: newPwd,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          errEl.textContent =
            data.error || "Erreur lors de la réinitialisation.";
          errEl.style.display = "";
          btn.textContent = "Enregistrer le nouveau mot de passe";
          btn.disabled = false;
          return;
        }

        document.getElementById("forgot-step2").style.display = "none";
        document.getElementById("forgot-step3").style.display = "";
      } catch {
        errEl.textContent = "Erreur réseau. Réessayez.";
        errEl.style.display = "";
        btn.textContent = "Enregistrer le nouveau mot de passe";
        btn.disabled = false;
      }
    });

  // ÉTAPE 3 : retour connexion
  document.getElementById("forgot-step3-btn")?.addEventListener("click", () => {
    overlay.style.display = "none";
    document.getElementById("login-username").value = "";
    document.getElementById("login-password").value = "";
    document.getElementById("login-username")?.focus();
  });
});
