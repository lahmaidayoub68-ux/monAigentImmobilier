/**
 * profil.js — AiGENT Dashboard v4 — FULLY FUNCTIONAL
 */

const API = window.location.origin;
let currentUser = null;
let profileData = null;

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  const raw = localStorage.getItem("agent_user");
  if (!raw) {
    window.location.href = "index.html";
    return;
  }
  currentUser = JSON.parse(raw);

  initTheme();
  initSectionNav();
  initSidebar();
  initPasswordToggles();
  initPasswordStrength();
  initAvatarPicker();

  await loadProfile();
  await loadStats();
  await loadPreferencesFromDB();
  loadNotificationsFromStorage();

  // Bindings
  bindEl("btnSaveEmail", handleSaveEmail);
  bindEl("btnSaveVille", handleSaveVille);
  bindEl("btnChangePassword", handleChangePassword);
  bindEl("btnDeconnexion", handleDeconnexion);
  bindEl("btn-logout", handleDeconnexion);
  bindEl("btnExportData", handleExportData);
  bindEl("btnSaveNotifications", handleSaveNotifications);
  bindEl("btnSavePreferences", handleSavePreferences);
  bindEl("btnSendSupport", handleSendSupport);
  bindEl("btnResetProfile", handleResetProfile);
  bindEl("btnDeleteData", handleDeleteData);
  bindEl("btnDeleteAccount", handleDeleteAccount);
  bindEl("openAvatarPopup", () =>
    document.getElementById("avatarOverlay")?.classList.add("active"),
  );
  bindEl("closeAvatarModal", () =>
    document.getElementById("avatarOverlay")?.classList.remove("active"),
  );

  document.getElementById("avatarOverlay")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("avatarOverlay"))
      document.getElementById("avatarOverlay").classList.remove("active");
  });

  initDeleteConfirm();
});

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function bindEl(id, fn) {
  document.getElementById(id)?.addEventListener("click", fn);
}
function qs(sel) {
  return document.querySelector(sel);
}
function qsa(sel) {
  return document.querySelectorAll(sel);
}
function auth() {
  return { Authorization: `Bearer ${currentUser?.token}` };
}
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function roleLabel(role) {
  if (role === "buyer") return "Acheteur Premium";
  if (role === "seller") return "Vendeur Certifié";
  return role || "—";
}

// ══════════════════════════════════════════════
// THÈME — appliqué à TOUTES les pages via localStorage + attribut HTML
// ══════════════════════════════════════════════
function initTheme() {
  const btn = document.getElementById("btn-theme");
  const html = document.documentElement;
  const darkToggle = document.getElementById("pref-darkmode");

  const apply = (t) => {
    html.setAttribute("data-theme", t);
    localStorage.setItem("aigent_theme", t);
    if (darkToggle) darkToggle.checked = t === "dark";
    // Persister en DB
    fetch(`${API}/api/me/preferences`, {
      method: "PATCH",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  };

  btn?.addEventListener("click", () => {
    apply(html.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  darkToggle?.addEventListener("change", () => {
    apply(darkToggle.checked ? "dark" : "light");
  });

  apply(localStorage.getItem("aigent_theme") || "dark");
}

// À appeler sur CHAQUE page (insérer dans chaque <script> global ou layout)
// Applique le thème stocké immédiatement au chargement
(function applyThemeEarly() {
  const t = localStorage.getItem("aigent_theme") || "dark";
  document.documentElement.setAttribute("data-theme", t);
})();

// ══════════════════════════════════════════════
// SECTION NAV
// ══════════════════════════════════════════════
function initSectionNav() {
  const sections = qsa(".settings-section");
  const sideLinks = qsa(".sidenav-link");
  const tabBtns = qsa(".tab-btn");

  function activateSection(sectionId) {
    sections.forEach((s) =>
      s.classList.toggle("active", s.id === `section-${sectionId}`),
    );
    sideLinks.forEach((l) =>
      l.classList.toggle("active", l.dataset.section === sectionId),
    );
    tabBtns.forEach((t) =>
      t.classList.toggle("active", t.dataset.section === sectionId),
    );
    if (sectionId === "activity") renderActivityChart();
    if (sectionId === "notifications") loadNotificationsCenter();
  }

  sideLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      activateSection(link.dataset.section);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activateSection(btn.dataset.section);
      window.scrollTo({ top: 64, behavior: "smooth" });
    });
  });
}

// ══════════════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════════════
function initSidebar() {
  const side = document.getElementById("sidebar");
  const open = document.getElementById("openSidebar");
  const openMobile = document.getElementById("openSidebarMobile");
  const close = document.getElementById("closeSidebar");
  const over = document.getElementById("sidebarOverlay");
  const toggle = (s) => {
    side?.classList.toggle("open", s);
    over?.classList.toggle("active", s);
  };
  open?.addEventListener("click", () => toggle(true));
  openMobile?.addEventListener("click", () => toggle(true));
  close?.addEventListener("click", () => toggle(false));
  over?.addEventListener("click", () => toggle(false));
}

// ══════════════════════════════════════════════
// CHARGEMENT PROFIL
// ══════════════════════════════════════════════
async function loadProfile() {
  try {
    const res = await fetch(`${API}/api/me`, { headers: auth() });
    if (!res.ok) throw new Error("Session invalide");
    profileData = await res.json();

    setEl("hero-username", profileData.username);
    setEl("hero-email", profileData.contact || "—");
    setEl("hero-role-badge", roleLabel(profileData.role));
    setEl("hero-lastlogin", new Date().toLocaleString("fr-FR"));
    setEl("hero-since", "cette année");

    setEl("sidenavName", profileData.username);
    setEl("sidenavRole", roleLabel(profileData.role));

    const avatarUrl = profileData.avatar || "images/default-avatar.png";
    const mainAvatar = document.getElementById("mainAvatar");
    const sidenavAvatar = document.getElementById("sidenavAvatar");
    if (mainAvatar) mainAvatar.style.backgroundImage = `url(${avatarUrl})`;
    if (sidenavAvatar)
      sidenavAvatar.style.backgroundImage = `url(${avatarUrl})`;

    const emailField = document.getElementById("field-email");
    const villeField = document.getElementById("field-ville");
    if (emailField) emailField.value = profileData.contact || "";
    if (villeField) villeField.value = profileData.ville || "";

    setEl("field-username", profileData.username);
    setEl("field-role", roleLabel(profileData.role));

    const delLabel = document.getElementById("deleteConfirmUsername");
    if (delLabel) delLabel.textContent = `"${profileData.username}"`;
    initDeleteConfirm();

    // Appliquer la langue stockée en DB
    if (profileData.langue) applyLangue(profileData.langue);
  } catch (err) {
    console.error("[loadProfile]", err);
    logout();
  }
}

// ══════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════
async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats`, { headers: auth() });
    if (!res.ok) return;
    const data = await res.json();

    setEl("stat-matches", data.totalMatches ?? "0");
    setEl("stat-favoris", data.totalFavoris ?? "0");
    setEl("stat-messages", data.activeConversations ?? "0");

    setEl("act-matches", data.totalMatches ?? "0");
    setEl("act-favoris", data.totalFavoris ?? "0");
    setEl("act-messages", data.activeConversations ?? "0");
    setEl(
      "act-compat",
      data.averageCompatibility ? `${data.averageCompatibility}%` : "—",
    );

    window._statsMatches = data.matches || [];
  } catch (err) {
    console.warn("[loadStats]", err);
  }
}

function renderActivityChart() {
  const chart = document.getElementById("activityChart");
  if (!chart) return;
  const matches = window._statsMatches || [];
  if (!matches.length) {
    chart.innerHTML =
      '<div class="chart-loading">Aucune donnée disponible</div>';
    return;
  }
  const values = matches.slice(0, 20).map((m) => m.compatibility || 0);
  const max = Math.max(...values, 1);
  chart.innerHTML = values
    .map((v) => {
      const h = Math.round((v / max) * 76);
      return `<div class="chart-bar" style="height:${Math.max(4, h)}px" title="${v}%"></div>`;
    })
    .join("");
}

// ══════════════════════════════════════════════
// SAVE EMAIL
// ══════════════════════════════════════════════
async function handleSaveEmail() {
  const val = document.getElementById("field-email")?.value?.trim();
  if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
    return showToast("Adresse e-mail invalide", "error");
  try {
    const res = await fetch(`${API}/api/me`, {
      method: "PATCH",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ contact: val }),
    });
    if (!res.ok) throw new Error();
    setEl("hero-email", val);
    showToast("E-mail mis à jour avec succès", "success");
  } catch {
    showToast("Erreur lors de la mise à jour", "error");
  }
}

// ══════════════════════════════════════════════
// SAVE VILLE — persistée en DB
// ══════════════════════════════════════════════
async function handleSaveVille() {
  const val = document.getElementById("field-ville")?.value?.trim();
  if (!val) return showToast("Veuillez saisir une ville", "error");
  try {
    const res = await fetch(`${API}/api/me`, {
      method: "PATCH",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ ville: val }),
    });
    if (!res.ok) throw new Error();
    if (profileData) profileData.ville = val;
    showToast("Ville mise à jour", "success");
  } catch {
    showToast("Erreur lors de la mise à jour", "error");
  }
}

// ══════════════════════════════════════════════
// MOT DE PASSE
// ══════════════════════════════════════════════
async function handleChangePassword() {
  const current = document.getElementById("currentPassword")?.value;
  const newPw = document.getElementById("newPassword")?.value;
  const confirm = document.getElementById("confirmPassword")?.value;

  if (!current)
    return showToast("Saisissez votre mot de passe actuel", "error");
  if (newPw.length < 8)
    return showToast(
      "Le nouveau mot de passe doit contenir au moins 8 caractères",
      "error",
    );
  if (newPw !== confirm)
    return showToast("Les mots de passe ne correspondent pas", "error");

  try {
    const res = await fetch(`${API}/api/change-password`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return showToast(err.error || "Mot de passe actuel incorrect", "error");
    }
    showToast("Mot de passe modifié avec succès", "success");
    ["currentPassword", "newPassword", "confirmPassword"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    updateStrengthBar("");
  } catch {
    showToast("Erreur serveur", "error");
  }
}

function initPasswordToggles() {
  qsa(".pw-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      const showIcon = btn.querySelector(".eye-show");
      const hideIcon = btn.querySelector(".eye-hide");
      if (showIcon) showIcon.style.display = isHidden ? "none" : "";
      if (hideIcon) hideIcon.style.display = isHidden ? "" : "none";
    });
  });
}

function initPasswordStrength() {
  const input = document.getElementById("newPassword");
  input?.addEventListener("input", () => updateStrengthBar(input.value));
}

function updateStrengthBar(value) {
  const fill = document.getElementById("pwStrengthFill");
  const label = document.getElementById("pwStrengthLabel");
  if (!fill || !label) return;
  const score = calcPwStrength(value);
  const configs = [
    { pct: 0, color: "transparent", text: "" },
    { pct: 25, color: "#f43f5e", text: "Très faible" },
    { pct: 50, color: "#f59e0b", text: "Faible" },
    { pct: 75, color: "#3b82f6", text: "Bon" },
    { pct: 100, color: "#10b981", text: "Excellent" },
  ];
  const cfg = configs[score];
  fill.style.width = `${cfg.pct}%`;
  fill.style.background = cfg.color;
  label.textContent = cfg.text;
  label.style.color = cfg.color;
}

function calcPwStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

// ══════════════════════════════════════════════
// AVATAR PICKER
// ══════════════════════════════════════════════
const AVATAR_SEEDS = [
  { seed: "Mackenzie", style: "avataaars" },
  { seed: "Luis", style: "avataaars" },
  { seed: "Maria", style: "avataaars" },
  { seed: "Amaya", style: "avataaars" },
  { seed: "Destiny", style: "avataaars" },
  { seed: "Eden", style: "avataaars" },
  { seed: "Easton", style: "avataaars" },
  { seed: "Christian", style: "avataaars" },
  { seed: "Alexander", style: "bottts" },
  { seed: "Katherine", style: "bottts" },
  { seed: "Brian", style: "bottts" },
  { seed: "Caleb", style: "bottts" },
];

function avatarUrl(seed, style) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
}

function initAvatarPicker() {
  const inlineGrid = document.getElementById("avatarPickerGrid");
  if (inlineGrid) {
    inlineGrid.innerHTML = "";
    AVATAR_SEEDS.forEach(({ seed, style }) => {
      const url = avatarUrl(seed, style);
      const div = document.createElement("div");
      div.className = "avatar-pick-item";
      div.innerHTML = `<img src="${url}" alt="${seed}" loading="lazy" />`;
      div.addEventListener("click", () => applyAvatar(url, div, inlineGrid));
      inlineGrid.appendChild(div);
    });
  }

  const modalGrid = document.getElementById("avatarModalGrid");
  if (modalGrid) {
    modalGrid.innerHTML = "";
    AVATAR_SEEDS.forEach(({ seed, style }) => {
      const url = avatarUrl(seed, style);
      const div = document.createElement("div");
      div.className = "avatar-modal-item";
      div.innerHTML = `<img src="${url}" alt="${seed}" loading="lazy" />`;
      div.addEventListener("click", () => {
        applyAvatar(url, div, modalGrid);
        setTimeout(
          () =>
            document
              .getElementById("avatarOverlay")
              ?.classList.remove("active"),
          400,
        );
      });
      modalGrid.appendChild(div);
    });
  }
}

async function applyAvatar(url, clickedEl, grid) {
  grid
    .querySelectorAll(".avatar-pick-item, .avatar-modal-item")
    .forEach((el) => el.classList.remove("selected"));
  clickedEl.classList.add("selected");

  const mainAvatar = document.getElementById("mainAvatar");
  const sidenavAvatar = document.getElementById("sidenavAvatar");
  if (mainAvatar) mainAvatar.style.backgroundImage = `url(${url})`;
  if (sidenavAvatar) sidenavAvatar.style.backgroundImage = `url(${url})`;

  const hint = document.getElementById("avatarHint");
  if (hint) hint.textContent = "Avatar appliqué ✓";

  try {
    const res = await fetch(`${API}/api/change-avatar`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: url }),
    });
    if (!res.ok) throw new Error();
    showToast("Avatar mis à jour", "success");
  } catch {
    showToast("Erreur lors de la mise à jour de l'avatar", "error");
  }
}

// ══════════════════════════════════════════════
// DÉCONNEXION
// ══════════════════════════════════════════════
function handleDeconnexion() {
  showConfirm({
    icon: "🔒",
    title: "Se déconnecter ?",
    desc: "Vous serez redirigé vers la page de connexion.",
    onConfirm: logout,
  });
}

function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}

// ══════════════════════════════════════════════
// EXPORT RGPD
// ══════════════════════════════════════════════
async function handleExportData() {
  const btn = document.getElementById("btnExportData");
  if (btn) {
    btn.textContent = "Génération en cours…";
    btn.disabled = true;
  }

  try {
    const res = await fetch(`${API}/api/export-data`, { headers: auth() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    downloadJSON(
      data,
      `aigent-donnees-${new Date().toISOString().split("T")[0]}.json`,
    );
    showToast("Export téléchargé avec succès", "success");
  } catch {
    const fallback = {
      user: profileData,
      exportedAt: new Date().toISOString(),
      note: "Export partiel",
    };
    downloadJSON(
      fallback,
      `aigent-donnees-${new Date().toISOString().split("T")[0]}.json`,
    );
    showToast("Export local téléchargé", "info");
  } finally {
    if (btn) {
      btn.textContent = "Exporter mes données";
      btn.disabled = false;
    }
  }
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════
// NOTIFICATIONS — préférences
// ══════════════════════════════════════════════
function loadNotificationsFromStorage() {
  const stored = JSON.parse(localStorage.getItem("aigent_notifs") || "{}");
  const defaults = {
    "notif-matches": true,
    "notif-messages": true,
    "notif-radar": false,
    "notif-newsletter": false,
  };
  Object.entries(defaults).forEach(([id, defVal]) => {
    const el = document.getElementById(id);
    if (el) el.checked = id in stored ? stored[id] : defVal;
  });
}

async function handleSaveNotifications() {
  const ids = [
    "notif-matches",
    "notif-messages",
    "notif-radar",
    "notif-newsletter",
  ];
  const prefs = {};
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) prefs[id] = el.checked;
  });
  localStorage.setItem("aigent_notifs", JSON.stringify(prefs));

  // Persister en DB
  try {
    await fetch(`${API}/api/me/preferences`, {
      method: "PATCH",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    showToast("Préférences de notification enregistrées", "success");
  } catch {
    showToast("Sauvegardé localement", "info");
  }
}

// ══════════════════════════════════════════════
// PRÉFÉRENCES UI — thème, animations, compact, langue
// ══════════════════════════════════════════════
async function loadPreferencesFromDB() {
  try {
    const res = await fetch(`${API}/api/me/preferences`, { headers: auth() });
    if (!res.ok) return;
    const prefs = await res.json();

    // Thème
    if (prefs.theme) {
      document.documentElement.setAttribute("data-theme", prefs.theme);
      localStorage.setItem("aigent_theme", prefs.theme);
      const darkToggle = document.getElementById("pref-darkmode");
      if (darkToggle) darkToggle.checked = prefs.theme === "dark";
    }

    // Animations réduites
    const reducedMotion = document.getElementById("pref-reducedmotion");
    if (reducedMotion) reducedMotion.checked = prefs.reducedMotion || false;
    applyReducedMotion(prefs.reducedMotion || false);

    // Compact
    const compact = document.getElementById("pref-compact");
    if (compact) compact.checked = prefs.compact || false;
    applyCompact(prefs.compact || false);

    // Langue
    const langueEl = document.getElementById("pref-langue");
    if (langueEl) langueEl.value = prefs.langue || "fr";
    // Dans le bloc if (prefs.langue) — APRÈS la ligne existante
    if (prefs.langue) {
      applyLangue(prefs.langue);
      localStorage.setItem("aigent_langue", prefs.langue); // ← AJOUTER cette ligne
    }

    // Rayon
    const rayon = document.getElementById("pref-rayon");
    if (rayon) rayon.value = prefs.rayon || "50";

    // Synchro notifs
    const notifIds = [
      "notif-matches",
      "notif-messages",
      "notif-radar",
      "notif-newsletter",
    ];
    notifIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el && prefs[id] !== undefined) el.checked = prefs[id];
    });
  } catch (err) {
    console.warn("[loadPreferencesFromDB]", err);
    loadPreferencesFromStorage_local();
  }
}

function loadPreferencesFromStorage_local() {
  const prefs = JSON.parse(localStorage.getItem("aigent_prefs") || "{}");
  const reducedMotion = document.getElementById("pref-reducedmotion");
  if (reducedMotion) reducedMotion.checked = prefs.reducedMotion || false;
  const compact = document.getElementById("pref-compact");
  if (compact) compact.checked = prefs.compact || false;
  const langue = document.getElementById("pref-langue");
  if (langue) langue.value = prefs.langue || "fr";
  const rayon = document.getElementById("pref-rayon");
  if (rayon) rayon.value = prefs.rayon || "50";
  applyReducedMotion(prefs.reducedMotion || false);
  applyCompact(prefs.compact || false);
}

function applyReducedMotion(active) {
  document.documentElement.style.setProperty(
    "--transition",
    active ? "0s" : "0.2s cubic-bezier(0.4,0,0.2,1)",
  );
  document.documentElement.classList.toggle("reduce-motion", active);
}

function applyCompact(active) {
  document.documentElement.classList.toggle("compact-mode", active);
}

// Dictionnaire de traductions (à enrichir selon vos pages)
const TRANSLATIONS = {
  fr: {},
  en: {
    Identité: "Identity",
    Sécurité: "Security",
    Avatar: "Avatar",
    Préférences: "Preferences",
    Notifications: "Notifications",
    Activité: "Activity",
    Support: "Support",
    "Zone critique": "Danger Zone",
    "Se déconnecter": "Log out",
    Enregistrer: "Save",
    "Ville principale": "Main city",
    "Adresse e-mail": "Email address",
    "Mot de passe actuel": "Current password",
    "Nouveau mot de passe": "New password",
    Confirmer: "Confirm",
    Supprimer: "Delete",
    Annuler: "Cancel",
    "Thème sombre": "Dark theme",
    "Animations réduites": "Reduced motion",
    "Mode compact": "Compact mode",
    Langue: "Language",
  },
  es: {
    Identité: "Identidad",
    Sécurité: "Seguridad",
    Avatar: "Avatar",
    Préférences: "Preferencias",
    Notifications: "Notificaciones",
    Activité: "Actividad",
    Support: "Soporte",
    "Zone critique": "Zona crítica",
    "Se déconnecter": "Cerrar sesión",
    Enregistrer: "Guardar",
    "Ville principale": "Ciudad principal",
    "Thème sombre": "Tema oscuro",
    "Animations réduites": "Movimiento reducido",
    "Mode compact": "Modo compacto",
    Langue: "Idioma",
  },
};
// APRÈS
function applyLangue(lang) {
  localStorage.setItem("aigent_langue", lang);
  if (window.AigentI18n) window.AigentI18n.apply(lang);
  document.documentElement.lang = lang;
}

// APRÈS
async function handleSavePreferences() {
  const prefs = {
    reducedMotion:
      document.getElementById("pref-reducedmotion")?.checked || false,
    compact: document.getElementById("pref-compact")?.checked || false,
    langue: document.getElementById("pref-langue")?.value || "fr",
    rayon: document.getElementById("pref-rayon")?.value || "50",
    theme: document.documentElement.getAttribute("data-theme") || "dark",
  };

  applyReducedMotion(prefs.reducedMotion);
  applyCompact(prefs.compact);
  applyLangue(prefs.langue);

  // Persister localement
  localStorage.setItem("aigent_prefs", JSON.stringify(prefs));
  // Persister la langue séparément pour lecture facile sur toutes les pages
  localStorage.setItem("aigent_langue", prefs.langue);

  try {
    await fetch(`${API}/api/me`, {
      method: "PATCH",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ langue: prefs.langue }),
    });
  } catch {}

  try {
    await fetch(`${API}/api/me/preferences`, {
      method: "PATCH",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    showToast("Préférences enregistrées", "success");
  } catch {
    showToast("Préférences enregistrées localement", "info");
  }
}

// ══════════════════════════════════════════════
// SUPPORT
// ══════════════════════════════════════════════
async function handleSendSupport() {
  const subject = document.getElementById("supportSubject")?.value;
  const message = document.getElementById("supportMessage")?.value?.trim();

  if (!subject) return showToast("Choisissez un sujet", "error");
  if (!message || message.length < 10)
    return showToast("Rédigez un message d'au moins 10 caractères", "error");

  const btn = document.getElementById("btnSendSupport");
  if (btn) {
    btn.textContent = "Envoi en cours…";
    btn.disabled = true;
  }

  try {
    const res = await fetch(`${API}/api/support`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });
    if (!res.ok) throw new Error();
    showToast("Message envoyé — nous répondons sous 24h", "success");
    if (document.getElementById("supportMessage"))
      document.getElementById("supportMessage").value = "";
    if (document.getElementById("supportSubject"))
      document.getElementById("supportSubject").value = "";
  } catch {
    showToast("Erreur lors de l'envoi. Réessayez.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer le message`;
    }
  }
}

// ══════════════════════════════════════════════
// RÉINITIALISER PROFIL DE RECHERCHE
// ══════════════════════════════════════════════
function handleResetProfile() {
  showConfirm({
    icon: "🔄",
    title: "Réinitialiser le profil ?",
    desc: "Vos critères de matching et l'historique du chat IA seront effacés. Votre compte, vos messages et vos favoris sont conservés.",
    onConfirm: async () => {
      try {
        await fetch(`${API}/api/reset-profile`, {
          method: "POST",
          headers: auth(),
        });
      } catch {}
      // Nettoyage local lié à l'utilisateur
      const username = currentUser?.username;
      if (username) {
        ["criteria", "chat", "phase", "lastMatches"].forEach((k) => {
          localStorage.removeItem(`${k}_${username}`);
        });
      }
      localStorage.removeItem("aigent_session");
      localStorage.removeItem("aigent_criteria");
      showToast("Profil de recherche réinitialisé", "success");
    },
    confirmLabel: "Réinitialiser",
    confirmClass: "btn-warning",
  });
}

// ══════════════════════════════════════════════
// SUPPRIMER DONNÉES — irréversible en DB
// ══════════════════════════════════════════════
function handleDeleteData() {
  showConfirm({
    icon: "🗑️",
    title: "Supprimer vos données ?",
    desc: "Favoris, messages et historique seront effacés définitivement en base de données. Votre accès au compte est maintenu.",
    onConfirm: async () => {
      try {
        const res = await fetch(`${API}/api/delete-data`, {
          method: "DELETE",
          headers: auth(),
        });
        if (!res.ok) throw new Error();
        // Nettoyage local
        const username = currentUser?.username;
        if (username) {
          ["criteria", "chat", "phase", "lastMatches"].forEach((k) => {
            localStorage.removeItem(`${k}_${username}`);
          });
        }
        showToast("Données supprimées définitivement", "success");
        await loadStats();
      } catch {
        showToast("Erreur lors de la suppression", "error");
      }
    },
    confirmLabel: "Supprimer",
  });
}

// ══════════════════════════════════════════════
// SUPPRESSION COMPTE — irréversible
// ══════════════════════════════════════════════
function initDeleteConfirm() {
  const input = document.getElementById("deleteConfirmInput");
  const btn = document.getElementById("btnDeleteAccount");
  if (!input || !btn) return;

  input.addEventListener("input", () => {
    const expected = profileData?.username || "";
    btn.disabled = input.value.trim() !== expected;
  });
}

async function handleDeleteAccount() {
  const input = document.getElementById("deleteConfirmInput");
  const expected = profileData?.username || "";
  if (!input || input.value.trim() !== expected)
    return showToast("Le pseudo saisi ne correspond pas", "error");

  showConfirm({
    icon: "⚠️",
    title: "Suppression définitive",
    desc: `Cette action est irréversible. Le compte "${expected}" et toutes ses données seront supprimés définitivement en base de données.`,
    onConfirm: async () => {
      try {
        const res = await fetch(`${API}/api/delete-account`, {
          method: "DELETE",
          headers: auth(),
        });
        if (!res.ok) throw new Error("Erreur serveur");
        showToast("Compte supprimé. Au revoir.", "info");
        setTimeout(() => {
          localStorage.clear();
          window.location.href = "index.html";
        }, 1500);
      } catch (e) {
        showToast("Erreur lors de la suppression du compte", "error");
      }
    },
    confirmLabel: "Supprimer définitivement",
  });
}

// ══════════════════════════════════════════════
// CENTRE DE NOTIFICATIONS — chargé quand section "notifications" active
// ══════════════════════════════════════════════
async function loadNotificationsCenter() {
  const container = document.getElementById("notif-center-list");
  if (!container) return;

  container.innerHTML = `<div class="notif-loading">Chargement…</div>`;

  try {
    const res = await fetch(`${API}/api/notifications`, { headers: auth() });
    if (!res.ok) throw new Error();
    const notifs = await res.json();

    if (!notifs.length) {
      container.innerHTML = `
        <div class="notif-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <p>Aucune notification pour le moment.</p>
        </div>`;
      return;
    }

    // Bouton "Tout marquer comme lu"
    container.innerHTML = `
      <div class="notif-center-header">
        <span>${notifs.filter((n) => !n.read).length} non lue(s)</span>
        <button id="markAllRead" class="btn-mark-all">Tout marquer comme lu</button>
      </div>
      <div class="notif-center-items" id="notif-items"></div>`;

    document
      .getElementById("markAllRead")
      ?.addEventListener("click", async () => {
        await fetch(`${API}/api/notifications/read`, {
          method: "POST",
          headers: { ...auth(), "Content-Type": "application/json" },
          body: JSON.stringify({ id: null }),
        });
        loadNotificationsCenter();
      });

    const itemsEl = document.getElementById("notif-items");
    notifs.forEach((n) => {
      const ICONS = {
        match: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        message: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        radar: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="#f59e0b"/></svg>`,
        newsletter: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
        default: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      };

      const div = document.createElement("div");
      div.className = `notif-item ${n.read ? "read" : "unread"}`;
      div.innerHTML = `
        <div class="notif-item-icon">${ICONS[n.type] || ICONS.default}</div>
        <div class="notif-item-body">
          <div class="notif-item-title">${escapeHtml(n.title)}</div>
          <div class="notif-item-body-text">${escapeHtml(n.body)}</div>
          <div class="notif-item-date">${new Date(n.created_at).toLocaleString("fr-FR")}</div>
        </div>
        <div class="notif-item-actions">
          ${!n.read ? `<button class="btn-read-one" data-id="${n.id}" title="Marquer comme lu">✓</button>` : ""}
          <button class="btn-delete-notif" data-id="${n.id}" title="Supprimer">×</button>
        </div>`;

      div
        .querySelector(".btn-read-one")
        ?.addEventListener("click", async (e) => {
          e.stopPropagation();
          await fetch(`${API}/api/notifications/read`, {
            method: "POST",
            headers: { ...auth(), "Content-Type": "application/json" },
            body: JSON.stringify({ id: n.id }),
          });
          loadNotificationsCenter();
        });

      div
        .querySelector(".btn-delete-notif")
        .addEventListener("click", async (e) => {
          e.stopPropagation();
          await fetch(`${API}/api/notifications/${n.id}`, {
            method: "DELETE",
            headers: auth(),
          });
          div.remove();
        });

      div.addEventListener("click", async () => {
        if (!n.read) {
          await fetch(`${API}/api/notifications/read`, {
            method: "POST",
            headers: { ...auth(), "Content-Type": "application/json" },
            body: JSON.stringify({ id: n.id }),
          });
          div.classList.replace("unread", "read");
        }
      });

      itemsEl.appendChild(div);
    });
  } catch (err) {
    console.error("[loadNotificationsCenter]", err);
    container.innerHTML = `<div class="notif-empty">Erreur lors du chargement.</div>`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Badge global de notifications non lues (dans le menu de toutes les pages)
async function updateNotifBadge() {
  try {
    const res = await fetch(`${API}/api/notifications`, { headers: auth() });
    if (!res.ok) return;
    const notifs = await res.json();
    const count = notifs.filter((n) => !n.read).length;
    // Mettre à jour tous les badges sur la page courante
    document.querySelectorAll(".notif-badge").forEach((el) => {
      el.textContent = count > 0 ? (count > 99 ? "99+" : count) : "";
      el.style.display = count > 0 ? "flex" : "none";
    });
  } catch {}
}

// Appeler au chargement de chaque page
updateNotifBadge();
setInterval(updateNotifBadge, 30000); // rafraîchissement toutes les 30s

// ══════════════════════════════════════════════
// TOAST SYSTEM
// ══════════════════════════════════════════════
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || "ℹ️"}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "fadeOutToast 0.35s ease forwards";
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ══════════════════════════════════════════════
// CONFIRM MODAL
// ══════════════════════════════════════════════
function showConfirm({
  icon,
  title,
  desc,
  onConfirm,
  confirmLabel = "Confirmer",
  confirmClass = "btn-danger",
}) {
  const overlay = document.getElementById("confirmOverlay");
  if (!overlay) {
    if (window.confirm(desc)) onConfirm();
    return;
  }
  setEl("confirmIcon", icon);
  setEl("confirmTitle", title);
  setEl("confirmDesc", desc);

  const okBtn = document.getElementById("confirmOk");
  if (okBtn) {
    okBtn.textContent = confirmLabel;
    okBtn.className = confirmClass;
  }
  overlay.classList.add("active");
  const close = () => overlay.classList.remove("active");
  okBtn?.addEventListener(
    "click",
    () => {
      close();
      onConfirm();
    },
    { once: true },
  );
  document
    .getElementById("confirmCancel")
    ?.addEventListener("click", close, { once: true });
  overlay.addEventListener(
    "click",
    (e) => {
      if (e.target === overlay) close();
    },
    { once: true },
  );
}
