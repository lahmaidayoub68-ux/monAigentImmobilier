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
  bindEl("btnCreateProjectProfile", () => {
    window.location.href = "accueil.html";
  });
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
  if (window.location.hash === "#projects") {
    setTimeout(() => {
      document.querySelector('[data-section="projects"]')?.click();
    }, 300);
  }

  if (window.location.hash === "#notifications") {
    setTimeout(() => {
      document.querySelector('[data-section="notifications"]')?.click();
    }, 300);
  }

  initDeleteConfirm();
  function initMobileSidebar() {
    const toggleBtn = document.getElementById("mobile-menu-toggle");
    const overlay = document.getElementById("mobile-sidenav-overlay");
    const drawer = document.getElementById("mobile-sidenav-drawer");
    const closeBtn = document.getElementById("mobile-drawer-close");
    const drawerContent = document.getElementById("mobile-drawer-content");

    if (!toggleBtn || !overlay || !drawer) return;

    // Cloner le contenu de la sidenav dans le drawer
    const sidenav = document.getElementById("settingsSidenav");
    if (sidenav && drawerContent) {
      drawerContent.innerHTML = sidenav.innerHTML;

      // Les liens dans le drawer doivent aussi naviguer
      drawerContent.querySelectorAll(".sidenav-link").forEach((link) => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          closeDrawer();
          // Déclencher la navigation via le même mécanisme que la sidenav desktop
          const section = link.dataset.section;
          document
            .querySelectorAll(".settings-section")
            .forEach((s) =>
              s.classList.toggle("active", s.id === `section-${section}`),
            );
          document
            .querySelectorAll(".sidenav-link")
            .forEach((l) =>
              l.classList.toggle("active", l.dataset.section === section),
            );
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
    }

    function openDrawer() {
      drawer.classList.add("open");
      overlay.classList.add("open");
      document.body.style.overflow = "hidden";
    }
    function closeDrawer() {
      drawer.classList.remove("open");
      overlay.classList.remove("open");
      document.body.style.overflow = "";
    }

    toggleBtn.addEventListener("click", openDrawer);
    closeBtn?.addEventListener("click", closeDrawer);
    overlay.addEventListener("click", closeDrawer);

    // Swipe left pour fermer
    let touchStartX = 0;
    drawer.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.touches[0].clientX;
      },
      { passive: true },
    );
    drawer.addEventListener(
      "touchend",
      (e) => {
        if (touchStartX - e.changedTouches[0].clientX > 60) closeDrawer();
      },
      { passive: true },
    );
  }
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
  function activateSection(sectionId) {
    // 1. On recherche les éléments dynamiquement à chaque clic (inclut les nouvelles sections JS)
    document
      .querySelectorAll(".settings-section")
      .forEach((s) =>
        s.classList.toggle("active", s.id === `section-${sectionId}`),
      );
    document
      .querySelectorAll(".sidenav-link")
      .forEach((l) =>
        l.classList.toggle("active", l.dataset.section === sectionId),
      );
    document
      .querySelectorAll(".tab-btn")
      .forEach((t) =>
        t.classList.toggle("active", t.dataset.section === sectionId),
      );

    if (sectionId === "projects") loadProjectsSection();
  }

  // 2. Délégation d'événements sur le document pour capter les boutons ajoutés par JS
  document.addEventListener("click", (e) => {
    const link = e.target.closest(".sidenav-link");
    if (link) {
      e.preventDefault();
      activateSection(link.dataset.section);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const btn = e.target.closest(".tab-btn");
    if (btn) {
      activateSection(btn.dataset.section);
      window.scrollTo({ top: 64, behavior: "smooth" });
    }
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
  // Déléguer à la version boostée Chart.js de fonctios-profil.js
  if (typeof window._fixRenderActivityChart === "function") {
    return window._fixRenderActivityChart();
  }
  // Fallback : version basique si fonctios-profil.js pas encore prêt
  const chartWrap = document.querySelector(".activity-chart-wrap");
  if (!chartWrap) return;

  // Récupérer ou initialiser les données de session
  const SESSION_KEY = "aigent_session_log";
  function getSessionLog() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
    } catch {
      return [];
    }
  }

  // Tracker le temps actif (appelé au chargement)
  function trackSession() {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    let log = getSessionLog();

    // Trouver la session du jour
    let dayEntry = log.find((e) => e.date === today);
    if (!dayEntry) {
      dayEntry = { date: today, minutes: 0, sessions: 0 };
      log.push(dayEntry);
    }

    // Incrémenter (appelé toutes les minutes)
    dayEntry.minutes = (dayEntry.minutes || 0) + 1;
    dayEntry.sessions = (dayEntry.sessions || 0) + 1;

    // Garder seulement les 28 derniers jours
    log = log.slice(-28);
    localStorage.setItem(SESSION_KEY, JSON.stringify(log));
    return log;
  }

  // Lancer le tracking
  if (!window._sessionTrackInterval) {
    window._sessionTrackInterval = setInterval(trackSession, 60000);
    trackSession(); // immédiat
  }

  // Périodes disponibles
  const PERIODS = [
    { key: "day", label: "Aujourd'hui", slots: 24, unit: "h" },
    { key: "week", label: "7 jours", slots: 7, unit: "j" },
    { key: "month", label: "30 jours", slots: 30, unit: "j" },
  ];

  let currentPeriod = "week";

  function getChartData(period) {
    const log = getSessionLog();
    const now = new Date();

    if (period === "day") {
      // Distribution par heure (simulée si pas de granularité fine)
      const today = now.toISOString().split("T")[0];
      const todayEntry = log.find((e) => e.date === today);
      const totalMin = todayEntry?.minutes || 0;
      const currentHour = now.getHours();

      // Répartir les minutes sur les heures passées (estimation)
      return Array.from({ length: 24 }, (_, h) => {
        if (h > currentHour) return { label: `${h}h`, value: 0 };
        if (h === currentHour)
          return { label: `${h}h`, value: Math.min(totalMin, 45) };
        // Distribution gaussienne autour des heures de pointe (9h, 14h, 20h)
        const peak =
          Math.exp(-((h - 9) ** 2) / 8) +
          Math.exp(-((h - 14) ** 2) / 8) +
          Math.exp(-((h - 20) ** 2) / 8);
        return {
          label: `${h}h`,
          value: totalMin > 0 ? Math.round((peak / 3.2) * totalMin * 0.8) : 0,
        };
      });
    }

    // Semaine / mois
    const days = period === "week" ? 7 : 30;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      const dateStr = d.toISOString().split("T")[0];
      const entry = log.find((e) => e.date === dateStr);
      const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
      return {
        label:
          period === "week"
            ? dayNames[d.getDay()]
            : `${d.getDate()}/${d.getMonth() + 1}`,
        value: entry?.minutes || 0,
        isToday: dateStr === now.toISOString().split("T")[0],
      };
    });
  }

  function formatDuration(minutes) {
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
  }

  function renderChart(period) {
    const data = getChartData(period);
    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const totalMin = data.reduce((s, d) => s + d.value, 0);
    const avgMin = Math.round(totalMin / data.length);
    const peakEntry = data.reduce(
      (best, d) => (d.value > best.value ? d : best),
      data[0],
    );

    chartWrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <p class="activity-chart-label" style="margin:0">Activité — temps d'utilisation</p>
        <div style="display:flex;gap:4px">
          ${PERIODS.map(
            (p) =>
              `<button onclick="window._renderScreenChart('${p.key}')" style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${currentPeriod === p.key ? "var(--v)" : "var(--border)"};background:${currentPeriod === p.key ? "var(--v-soft)" : "var(--bg-panel)"};color:${currentPeriod === p.key ? "var(--v)" : "var(--t3)"};font-family:inherit">${p.label}</button>`,
          ).join("")}
        </div>
      </div>
 
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
        <div style="padding:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8);text-align:center">
          <div style="font-size:16px;font-weight:800;color:var(--v);letter-spacing:-.03em">${formatDuration(totalMin)}</div>
          <div style="font-size:9.5px;font-weight:600;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Total</div>
        </div>
        <div style="padding:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8);text-align:center">
          <div style="font-size:16px;font-weight:800;color:var(--v);letter-spacing:-.03em">${formatDuration(avgMin)}</div>
          <div style="font-size:9.5px;font-weight:600;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Moyenne</div>
        </div>
        <div style="padding:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r8);text-align:center">
          <div style="font-size:16px;font-weight:800;color:var(--v);letter-spacing:-.03em">${peakEntry.label}</div>
          <div style="font-size:9.5px;font-weight:600;color:var(--t4);text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Pic d'activité</div>
        </div>
      </div>
 
      <div style="position:relative;height:80px;display:flex;align-items:flex-end;gap:${data.length > 20 ? "1px" : "3px"};padding-bottom:20px">
        ${data
          .map((d, i) => {
            const pct = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
            const isToday = d.isToday;
            const barH = Math.max(pct * 0.6, d.value > 0 ? 4 : 1);
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;position:relative" title="${d.label} : ${formatDuration(d.value)}">
              <div style="width:100%;border-radius:2px 2px 0 0;background:${isToday ? "var(--v)" : d.value > 0 ? "var(--v-tint)" : "var(--bg-inset)"};height:${barH}px;transition:all .2s;cursor:pointer;border:${isToday ? "1px solid var(--v)" : "none"}" onmouseenter="this.style.background='var(--v)'" onmouseleave="this.style.background='${isToday ? "var(--v)" : d.value > 0 ? "var(--v-tint)" : "var(--bg-inset)"}'"></div>
              ${data.length <= 12 || i % Math.ceil(data.length / 8) === 0 ? `<div style="position:absolute;bottom:-18px;font-size:9px;color:var(--t4);white-space:nowrap;font-weight:${isToday ? "700" : "400"};color:${isToday ? "var(--v)" : "var(--t4)"}">${d.label}</div>` : ""}
            </div>`;
          })
          .join("")}
      </div>
 
      ${
        totalMin === 0
          ? `<div style="text-align:center;font-size:11.5px;color:var(--t4);margin-top:8px;font-style:italic">Aucune activité enregistrée — le suivi démarre maintenant ✓</div>`
          : ""
      }`;
  }

  window._renderScreenChart = (period) => {
    currentPeriod = period;
    renderChart(period);
  };

  renderChart(currentPeriod);
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
  // Déléguer à la version corrigée de fonctios-profil.js si disponible
  if (typeof window._fixLoadNotificationsCenter === "function") {
    return window._fixLoadNotificationsCenter();
  }

  const container = document.getElementById("notif-center-list");
  if (!container) return;
  container.innerHTML = `<div class="notif-loading">Chargement…</div>`;

  // auth() est la fonction locale de profil.js (currentUser.token)
  const authHeader = { Authorization: `Bearer ${currentUser?.token}` };

  try {
    const res = await fetch(`${API}/api/notifications`, {
      headers: authHeader,
    });
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
          headers: { ...authH(), "Content-Type": "application/json" },
          body: JSON.stringify({ id: null }),
        });
        loadNotificationsCenter();
      });

    const itemsEl = document.getElementById("notif-items");

    const ICONS = {
      match: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      message: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      radar: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="#f59e0b"/></svg>`,
      workspace: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      default: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };

    notifs.forEach((n) => {
      // Détecter si c'est une invitation workspace
      let notifData = {};
      try {
        notifData = JSON.parse(n.data || "{}");
      } catch {}
      const isWorkspaceInvite =
        notifData.type === "workspace_invite" ||
        n.title?.toLowerCase().includes("invitation espace");

      const div = document.createElement("div");
      div.className = `notif-item ${n.read ? "read" : "unread"}`;

      const iconType = isWorkspaceInvite
        ? "workspace"
        : n.type === "radar"
          ? "radar"
          : n.type === "message"
            ? "message"
            : "match";

      div.innerHTML = `
        <div class="notif-item-icon">${ICONS[iconType] || ICONS.default}</div>
        <div class="notif-item-body" style="flex:1;min-width:0">
          <div class="notif-item-title">${escapeHtml(n.title)}</div>
          <div class="notif-item-body-text">${escapeHtml(n.body)}</div>
          ${
            isWorkspaceInvite && !n.read
              ? `<div class="ws-invite-actions" style="display:flex;gap:7px;margin-top:8px">
              <button class="btn-ws-accept" data-owner="${escapeHtml(notifData.ownerUsername || "")}" data-notif="${n.id}"
                style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:6px;background:var(--ok-bg);color:var(--ok);border:1px solid rgba(5,150,105,.25);font-size:11px;font-weight:700;cursor:pointer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Accepter
              </button>
              <button class="btn-ws-decline" data-owner="${escapeHtml(notifData.ownerUsername || "")}" data-notif="${n.id}"
                style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:6px;background:var(--err-bg);color:var(--err);border:1px solid rgba(220,38,38,.25);font-size:11px;font-weight:700;cursor:pointer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Refuser
              </button>
            </div>`
              : ""
          }
          <div class="notif-item-date">${new Date(n.created_at).toLocaleString("fr-FR")}</div>
        </div>
        <div class="notif-item-actions">
          ${!n.read ? `<button class="btn-read-one" data-id="${n.id}" title="Marquer comme lu">✓</button>` : ""}
          <button class="btn-delete-notif" data-id="${n.id}" title="Supprimer">×</button>
        </div>`;

      // Accepter invitation workspace
      div
        .querySelector(".btn-ws-accept")
        ?.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ownerUsername = e.currentTarget.dataset.owner;
          const notifId = e.currentTarget.dataset.notif;
          try {
            const r = await fetch(`${API}/api/workspace/respond`, {
              method: "POST",
              headers: { ...authH(), "Content-Type": "application/json" },
              body: JSON.stringify({ ownerUsername, accept: true }),
            });
            if (r.ok) {
              // Marquer la notif comme lue
              await fetch(`${API}/api/notifications/read`, {
                method: "POST",
                headers: { ...authH(), "Content-Type": "application/json" },
                body: JSON.stringify({ id: notifId }),
              });
              showBoostToast(
                `Vous avez rejoint l'espace de travail de ${ownerUsername}`,
                "success",
              );
              loadNotificationsCenter();
            }
          } catch {
            showBoostToast("Erreur lors de l'acceptation", "error");
          }
        });

      // Refuser invitation workspace
      div
        .querySelector(".btn-ws-decline")
        ?.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ownerUsername = e.currentTarget.dataset.owner;
          const notifId = e.currentTarget.dataset.notif;
          try {
            await fetch(`${API}/api/workspace/respond`, {
              method: "POST",
              headers: { ...authH(), "Content-Type": "application/json" },
              body: JSON.stringify({ ownerUsername, accept: false }),
            });
            await fetch(`${API}/api/notifications/read`, {
              method: "POST",
              headers: { ...authH(), "Content-Type": "application/json" },
              body: JSON.stringify({ id: notifId }),
            });
            showBoostToast("Invitation refusée", "info");
            loadNotificationsCenter();
          } catch {
            showBoostToast("Erreur", "error");
          }
        });

      div
        .querySelector(".btn-read-one")
        ?.addEventListener("click", async (e) => {
          e.stopPropagation();
          await fetch(`${API}/api/notifications/read`, {
            method: "POST",
            headers: { ...authH(), "Content-Type": "application/json" },
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
            headers: authH(),
          });
          div.remove();
        });

      div.addEventListener("click", async () => {
        if (!n.read) {
          await fetch(`${API}/api/notifications/read`, {
            method: "POST",
            headers: { ...authH(), "Content-Type": "application/json" },
            body: JSON.stringify({ id: n.id }),
          });
          div.classList.replace("unread", "read");
        }
      });

      itemsEl.appendChild(div);
    });
  } catch (err) {
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

    document.querySelectorAll(".notif-badge").forEach((el) => {
      el.textContent = count > 0 ? (count > 99 ? "99+" : count) : "";
      el.style.display = count > 0 ? "flex" : "none";
    });

    const hdrBadge = document.getElementById("notif-badge-global");
    if (hdrBadge) {
      hdrBadge.textContent = count > 99 ? "99+" : count;
      hdrBadge.style.display = count > 0 ? "flex" : "none";
    }
  } catch {}
}

updateNotifBadge();
setInterval(updateNotifBadge, 20000);

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
// ══════════════════════════════════════════════
// PROJETS
// ══════════════════════════════════════════════
async function loadProjectsSection() {
  const container = document.getElementById("projects-list");
  if (!container) return;
  container.innerHTML = `<div class="projects-loading">Chargement…</div>`;

  try {
    const res = await fetch(`${API}/api/projects`, { headers: auth() });
    if (!res.ok) throw new Error();
    const projects = await res.json();

    if (!projects.length) {
      container.innerHTML = `
        <div class="projects-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          <p>Aucun projet pour l'instant.</p>
          <span>Créez votre premier projet depuis le chat IA.</span>
        </div>`;
      return;
    }

    container.innerHTML = "";
    projects.forEach((p) => {
      const card = document.createElement("div");
      card.className = "project-card";
      card.innerHTML = `
        <div class="pc-color-bar" style="background:${p.color || "#8b5cf6"}"></div>
        <div class="pc-body">
          <div class="pc-header">
            <span class="pc-name">${escapeHtml(p.name)}</span>
            <span class="pc-count">${p.chat_count || 0} chat(s)</span>
          </div>
          ${p.description ? `<p class="pc-desc">${escapeHtml(p.description)}</p>` : ""}
          <div class="pc-meta">
            <span>${new Date(p.created_at).toLocaleDateString("fr-FR")}</span>
          </div>
        </div>
        <div class="pc-actions">
          <button class="pc-btn-view" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-desc="${escapeHtml(p.description || "")}" data-color="${p.color || "#8b5cf6"}">
            Voir les chats →
          </button>
          <button class="pc-btn-delete" data-id="${p.id}" title="Supprimer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>`;

      card.querySelector(".pc-btn-view").onclick = () =>
        openProjectDetail(p.id, p.name, p.description, p.color);

      card.querySelector(".pc-btn-delete").onclick = () => {
        showConfirm({
          icon: "🗑️",
          title: `Supprimer "${p.name}" ?`,
          desc: "Toutes les conversations de ce projet seront supprimées.",
          onConfirm: async () => {
            await fetch(`${API}/api/projects/${p.id}`, {
              method: "DELETE",
              headers: auth(),
            });
            loadProjectsSection();
          },
          confirmLabel: "Supprimer",
        });
      };

      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<div class="projects-empty">Erreur lors du chargement.</div>`;
  }
}

async function openProjectDetail(projectId, name, desc, color) {
  document.getElementById("projects-list").parentElement.style.display = "none";
  const detailBlock = document.getElementById("project-detail-block");
  detailBlock.style.display = "";
  document.getElementById("project-detail-name").textContent = name;
  document.getElementById("project-detail-desc").textContent =
    desc || "Aucune description";
  document.getElementById("project-detail-icon").style.color =
    color || "#8b5cf6";

  const chatsList = document.getElementById("project-chats-list");
  chatsList.innerHTML = `<div class="projects-loading">Chargement…</div>`;

  document.getElementById("back-to-projects").onclick = () => {
    detailBlock.style.display = "none";
    document.getElementById("projects-list").parentElement.style.display = "";
  };

  try {
    const res = await fetch(`${API}/api/projects/${projectId}/chats`, {
      headers: auth(),
    });
    const chats = await res.json();

    if (!chats.length) {
      chatsList.innerHTML = `<div class="projects-empty"><p>Aucune conversation dans ce projet.</p></div>`;
      return;
    }

    chatsList.innerHTML = "";
    chats.forEach((chat) => {
      const item = document.createElement("div");
      item.className = "chat-history-item";
      item.style.cursor = "pointer";
      item.innerHTML = `
    <div class="chi-icon" style="background:${color}22;border-color:${color}44">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    </div>
    <div class="chi-info">
      <span class="chi-title">${escapeHtml(chat.title || "Conversation")}</span>
      <span class="chi-meta">${chat.message_count || 0} messages · ${new Date(chat.updated_at).toLocaleDateString("fr-FR")}</span>
    </div>
    <div class="chi-arrow" style="color:${color};font-size:18px;opacity:.7">→</div>`;

      item.addEventListener("click", () => loadChatAndRedirect(chat.id));
      item.addEventListener("mouseenter", () => {
        item.style.background = `${color}11`;
        item.style.borderColor = `${color}44`;
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "";
        item.style.borderColor = "";
      });

      chatsList.appendChild(item);
    });
  } catch {
    chatsList.innerHTML = `<div class="projects-empty">Erreur lors du chargement.</div>`;
  }
}
async function loadChatAndRedirect(chatId) {
  try {
    const res = await fetch(`${API}/api/projects/chats/${chatId}`, {
      headers: auth(),
    });
    if (!res.ok) throw new Error();
    const chat = await res.json();

    // Stocker les données du chat dans localStorage pour que accueil.html les restaure
    const username = currentUser?.username;
    if (!username) return;

    localStorage.setItem(
      `chat_${username}`,
      JSON.stringify(chat.messages || []),
    );
    localStorage.setItem(
      `criteria_${username}`,
      JSON.stringify(chat.criteria || {}),
    );
    localStorage.setItem(
      `phase_${username}`,
      JSON.stringify(chat.phase || "collecting"),
    );
    localStorage.setItem(
      `lastMatches_${username}`,
      JSON.stringify(chat.lastMatches || []),
    );

    // Mémoriser le projet associé
    if (chat.project_name) {
      localStorage.setItem(
        "aigent_current_project",
        JSON.stringify({
          id: chat.project_id || null,
          name: chat.project_name,
          color: chat.project_color || "#8b5cf6",
        }),
      );
    }

    showToast(`Chargement de "${chat.title}"…`, "info");
    setTimeout(() => {
      window.location.href = "accueil.html";
    }, 800);
  } catch {
    showToast("Erreur lors du chargement du chat", "error");
  }
}
