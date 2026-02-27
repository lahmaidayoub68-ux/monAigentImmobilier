console.log("AUTH.JS CHARGE");

const API_BASE = window.location.origin;
const $ = (id) => document.getElementById(id);

if (!window.AIGENT_AUTH_INIT) {
  window.AIGENT_AUTH_INIT = true;

  document.addEventListener("DOMContentLoaded", async () => {
    console.log("[auth] Initialisation...");

    const fetchUserInfo = async (token) => {
      try {
        const res = await fetch(`${API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok)
          throw new Error("Impossible de récupérer les infos utilisateur");
        return await res.json();
      } catch (err) {
        console.error("[auth] Erreur fetch /api/me:", err);
        return null;
      }
    };

    // ---------------- SESSION ----------------
    const savedUser = localStorage.getItem("agent_user");
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        const payload = JSON.parse(atob(user.token.split(".")[1]));

        if (Date.now() < payload.exp * 1000) {
          console.log("[auth] Utilisateur déjà connecté");

          // Récupérer role & contact depuis backend
          const fullUser = await fetchUserInfo(user.token);
          if (fullUser) {
            user.role = fullUser.role || user.role;
            user.contact = fullUser.contact || user.contact;
            localStorage.setItem("agent_user", JSON.stringify(user));
          }

          const path = window.location.pathname;
          if (
            !path.endsWith("/accueil.html") &&
            !path.endsWith("/profil.html")
          ) {
            window.location.href = "/accueil.html";
          }
          return;
        }
      } catch {
        console.warn("[auth] Token invalide ou expiré");
      }
      localStorage.removeItem("agent_user");
    }

    // ---------------- LOGIN ----------------
    const loginForm = $("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = $("login-username")?.value.trim();
        const password = $("login-password")?.value;

        if (!username || !password)
          return alert("Veuillez remplir tous les champs");

        try {
          const res = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          const data = await res.json();

          if (!res.ok || !data.token) {
            return alert(data.error || `Erreur connexion (${res.status})`);
          }

          // Récupérer role & contact depuis backend
          const fullUser = await fetchUserInfo(data.token);

          const userObj = {
            username,
            token: data.token,
            role: fullUser?.role || data.role || null,
            contact: fullUser?.contact || data.contact || null,
          };

          localStorage.setItem("agent_user", JSON.stringify(userObj));
          window.location.href = "/accueil.html";
        } catch (err) {
          console.error("[auth] Erreur réseau LOGIN:", err);
          alert("Erreur réseau lors de la connexion");
        }
      });
    }

    // ---------------- REGISTER ----------------
    const registerForm = $("registerForm");
    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = $("register-username")?.value.trim();
        const password = $("register-password")?.value;
        const role = $("register-role")?.value;
        const email = $("register-email")?.value.trim();

        if (!username || !password || !role || !email) {
          return alert("Veuillez remplir tous les champs correctement");
        }
        if (username.length < 3)
          return alert("Le pseudo doit contenir au moins 3 caractères");
        if (password.length < 6)
          return alert("Le mot de passe doit contenir au moins 6 caractères");
        if (!["buyer", "seller"].includes(role)) return alert("Rôle invalide");

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email))
          return alert("Veuillez entrer une adresse email valide");

        try {
          const res = await fetch(`${API_BASE}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              password,
              role,
              contact: email,
            }),
          });
          const data = await res.json();

          if (!res.ok || !data.token) {
            return alert(data.error || `Erreur inscription (${res.status})`);
          }

          // Récupérer role & contact depuis backend
          const fullUser = await fetchUserInfo(data.token);

          const userObj = {
            username,
            token: data.token,
            role: fullUser?.role || role,
            contact: fullUser?.contact || email,
          };

          localStorage.setItem("agent_user", JSON.stringify(userObj));
          window.location.href = "/accueil.html";
        } catch (err) {
          console.error("[auth] Erreur réseau SIGNUP:", err);
          alert("Erreur réseau lors de l'inscription");
        }
      });
    }
  });
}
