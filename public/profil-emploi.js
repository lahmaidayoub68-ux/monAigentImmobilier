/**
 * profil-emploi.js — Mon AiGENT Emploi · Page Profil
 *
 * Dépend de i18n-emploi.js (chargé AVANT ce script) pour :
 *   - window.EmploiPrefs.applyAll(prefs)      → applique langue/devise/unité/thème partout
 *   - window.EmploiPrefs.t(key)               → traduction courte
 *   - window.EmploiPrefs.formatPrice(n)       → salaire dans la devise choisie
 *   - window.EmploiPrefs.formatDistance(km)   → distance dans l'unité choisie
 */

const API = "";
const TOKEN_KEYS = ["emploi_token", "agent_emploi_token", "token"];
const USER_KEYS = ["emploi_user", "agent_emploi_user", "agent_user"];

let TOKEN = null;
let ME = null;
let PREFS = {};
let ANNONCES = [];
let EVENTS = [];
let AVATARS = [];
let AVATAR_DEFAULT = "/images/avatar-default.jpg";
let pendingAvatar = null;
let calCursor = new Date();
let evColor = "#7cfc3c";
let editingEventId = null;
let DIAGNOSTIC = null;

const EV_COLORS = [
  "#7cfc3c",
  "#76b900",
  "#ffb35c",
  "#4b8cff",
  "#ff5252",
  "#b06bff",
];
const KIND_LABELS = {
  entretien: "Entretien",
  relance: "Relance",
  essai: "Journée d'essai",
  echeance: "Échéance candidature",
  autre: "Autre",
};

/* ══════════════ HELPERS ══════════════ */
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmtNum = (n) => (n || n === 0 ? Number(n).toLocaleString("fr-FR") : "—");
const fmtSalary = (n) => {
  if (!n && n !== 0) return "Non renseigné";
  if (window.EmploiPrefs?.formatPrice) return window.EmploiPrefs.formatPrice(n);
  return `${Number(n).toLocaleString("fr-FR")} €/an`;
};
const fmtMin = (m) =>
  m >= 60
    ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`
    : `${m} min`;
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

function localISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const ICONS = {
  ok: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  err: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>',
};

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${ICONS[type] || ICONS.info}<span>${esc(msg)}</span>`;
  $("toasts").appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    el.style.transition = "all .25s";
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

async function api(path, opts = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers,
    body:
      opts.body && !(opts.body instanceof FormData)
        ? JSON.stringify(opts.body)
        : opts.body,
  });
  if (res.status === 401 || res.status === 403) {
    logout();
    throw new Error("Session expirée");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

/* ══════════════ AUTH STORAGE HELPERS ══════════════ */
function getStoredToken() {
  for (const k of TOKEN_KEYS) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }
  for (const k of USER_KEYS) {
    const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.token)
          return parsed.token;
      } catch {}
    }
  }
  return null;
}

function logout() {
  [...TOKEN_KEYS, ...USER_KEYS].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  window.location.href = "/login-emploi.html";
}

/* ══════════════ BOOT ══════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  TOKEN = getStoredToken();
  if (!TOKEN) return logout();

  initTheme();
  initNav();
  initSidebarMobile();
  initPasswordUI();
  initAvatarModal();
  initAgendaUI();
  initPrefsUI();
  initBindings();
  initVaultFileInput();
  initActivityTracker();

  try {
    await loadIdentity();
    await loadPreferences();
    await Promise.all([
      loadStats(),
      loadAnnonces(),
      loadAgenda(),
      loadActivity(),
      load2FA(),
      loadNotifications(),
    ]);
  } catch (e) {
    toast(e.message, "err");
  }

  const hash = (location.hash || "").replace("#", "");
  if (hash) showSection(hash);
});

/* ══════════════ THÈME ══════════════ */
function initTheme() {
  const saved = localStorage.getItem("emploi_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  $("btnTheme").addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("emploi_theme", next);
    if ($("prefTheme")) $("prefTheme").value = next;
    savePreferences({ theme: next }, true);
    renderActivityChart();
  });
}

/* ══════════════ NAVIGATION ══════════════ */
function showSection(name) {
  const btn = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (!btn) return;
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b === btn));
  $$(".panel").forEach((p) =>
    p.classList.toggle("active", p.id === `panel-${name}`),
  );
  $("crumbTitle").textContent = btn.textContent.trim().replace(/\s+\d+$/, "");
  history.replaceState(null, "", `#${name}`);
  $("sidenav").classList.remove("open");
  $("sbOverlay").classList.remove("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "activite") renderActivityChart();
  if (name === "support") loadTickets();
  if (name === "coffre") loadVault();
  if (name === "diagnostic" && !DIAGNOSTIC) runDiagnostic();
}
window.emploiGotoSection = showSection;

function initNav() {
  $$(".nav-item").forEach((b) =>
    b.addEventListener("click", () => showSection(b.dataset.section)),
  );
  $$("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => showSection(b.dataset.goto)),
  );
}

function initSidebarMobile() {
  $("btnBurger").addEventListener("click", () => {
    $("sidenav").classList.add("open");
    $("sbOverlay").classList.add("active");
  });
  $("sbOverlay").addEventListener("click", () => {
    $("sidenav").classList.remove("open");
    $("sbOverlay").classList.remove("active");
  });
}

/* ══════════════ IDENTITÉ ══════════════ */
async function loadIdentity() {
  const r = await api("/emploi/api/me/full");
  ME = r;
  const avatar = ME.avatar || AVATAR_DEFAULT;
  $("heroAvatar").src = avatar;
  $("navAvatar").src = avatar;
  $("heroName").textContent = ME.username;
  $("navUsername").textContent = ME.username;
  const role = ME.role === "recruteur" ? "Recruteur" : "Candidat";
  $("navRole").textContent = role;
  $("chipRole").textContent = role;

  const ville = ME.ville || "";
  $("chipVille").innerHTML =
    `<svg viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(ville || "Zone non renseignée")}`;
  $("chipSince").innerHTML =
    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Membre depuis ${fmtDate(ME.created_at)}`;
  $("fUsername").value = ME.username;
  $("fContact").value = ME.contact || "";
  $("fVille").value = ville;
}

async function loadStats() {
  const s = await api("/emploi/api/stats");
  $("statAnnonces").textContent = s.totalAnnonces;
  $("statFavoris").textContent = s.totalFavoris;
  $("statConvos").textContent = s.activeConversations;
}

/* ══════════════ AVATARS ══════════════ */
function initAvatarModal() {
  const open = async () => {
    if (!AVATARS.length) {
      try {
        const d = await api("/emploi/api/avatars");
        AVATARS = d.avatars || [];
        AVATAR_DEFAULT = d.default || AVATAR_DEFAULT;
      } catch {
        AVATARS = Array.from(
          { length: 15 },
          (_, i) => `/images/avatar-${i + 1}.jpg`,
        );
      }
    }
    pendingAvatar = ME?.avatar || AVATAR_DEFAULT;
    $("avatarGrid").innerHTML = AVATARS.map(
      (a) =>
        `<button class="avatar-opt ${a === pendingAvatar ? "sel" : ""}" data-a="${esc(a)}">
           <img src="${esc(a)}" alt="Avatar" loading="lazy" onerror="this.src='${esc(AVATAR_DEFAULT)}'"/>
         </button>`,
    ).join("");
    $$(".avatar-opt", $("avatarGrid")).forEach((b) =>
      b.addEventListener("click", () => {
        pendingAvatar = b.dataset.a;
        $$(".avatar-opt").forEach((x) => x.classList.toggle("sel", x === b));
      }),
    );
    $("avatarOverlay").classList.add("active");
  };

  $("avatarOpen").addEventListener("click", open);
  $("avatarOpen").addEventListener(
    "keydown",
    (e) => e.key === "Enter" && open(),
  );
  const close = () => $("avatarOverlay").classList.remove("active");
  $("avatarClose").addEventListener("click", close);
  $("avatarCancel").addEventListener("click", close);
  $("avatarOverlay").addEventListener("click", (e) => {
    if (e.target === $("avatarOverlay")) close();
  });

  $("avatarSave").addEventListener("click", async () => {
    if (!pendingAvatar) return close();
    try {
      await api("/emploi/api/change-avatar", {
        method: "POST",
        body: { avatar: pendingAvatar },
      });
      ME.avatar = pendingAvatar;
      $("heroAvatar").src = pendingAvatar;
      $("navAvatar").src = pendingAvatar;
      toast("Avatar mis à jour", "ok");
      close();
    } catch (e) {
      toast(e.message, "err");
    }
  });
}

/* ══════════════ BINDINGS GÉNÉRAUX ══════════════ */
function initBindings() {
  $("btnLogout").addEventListener("click", logout);

  $("btnSaveContact").addEventListener("click", async () => {
    const contact = $("fContact").value.trim();
    if (!contact) return toast("Contact requis", "err");
    try {
      await api("/emploi/api/me", { method: "PATCH", body: { contact } });
      ME.contact = contact;
      toast("Contact enregistré", "ok");
    } catch (e) {
      toast(e.message, "err");
    }
  });

  $("btnSaveVille").addEventListener("click", async () => {
    const ville = $("fVille").value.trim();
    try {
      await api("/emploi/api/me", { method: "PATCH", body: { ville } });
      ME.ville = ville;
      $("chipVille").innerHTML =
        `<svg viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(ville || "Zone non renseignée")}`;
      toast("Zone enregistrée", "ok");
    } catch (e) {
      toast(e.message, "err");
    }
  });

  $("btnChangePwd").addEventListener("click", handleChangePassword);
  $("btnExport").addEventListener("click", handleExport);
  $("btnSupport").addEventListener("click", handleSupport);
  $("btnVaultAdd").addEventListener("click", handleVaultAdd);
  $("btnDiagRefresh").addEventListener("click", runDiagnostic);
  $("btnSavePrefs").addEventListener("click", () =>
    savePreferences(collectPrefs()),
  );
  $("annFilter").addEventListener("change", renderAnnonces);
  $("actRange").addEventListener("change", loadActivity);

  $("btnNotif").addEventListener("click", () =>
    $("notifOverlay").classList.add("active"),
  );
  $("notifClose").addEventListener("click", () =>
    $("notifOverlay").classList.remove("active"),
  );
  $("notifOverlay").addEventListener("click", (e) => {
    if (e.target === $("notifOverlay"))
      $("notifOverlay").classList.remove("active");
  });
  $("notifReadAll").addEventListener("click", async () => {
    await api("/emploi/api/notifications/read", { method: "POST", body: {} });
    $("notifDot").style.display = "none";
    loadNotifications();
  });

  $("annClose").addEventListener("click", () =>
    $("annOverlay").classList.remove("active"),
  );
  $("annOverlay").addEventListener("click", (e) => {
    if (e.target === $("annOverlay"))
      $("annOverlay").classList.remove("active");
  });

  $$("[data-danger]").forEach((b) =>
    b.addEventListener("click", () => openDanger(b.dataset.danger)),
  );
  $("confirmClose").addEventListener("click", closeConfirm);
  $("confirmCancel").addEventListener("click", closeConfirm);
}

/* ══════════════ MES ANNONCES ══════════════ */
async function loadAnnonces() {
  try {
    ANNONCES = await api("/emploi/api/my-annonces");
  } catch {
    ANNONCES = [];
  }
  $("badgeAnnonces").textContent = ANNONCES.length;
  renderAnnonces();
}

function annTitle(a) {
  const c = a.criteria || {};
  const metier =
    c.metier ||
    (Array.isArray(c.domainePath)
      ? c.domainePath[c.domainePath.length - 1]
      : null);
  return (
    metier || (a.role === "recruteur" ? "Offre d'emploi" : "Recherche de poste")
  );
}

function renderAnnonces() {
  const f = $("annFilter").value;
  const list = ANNONCES.filter((a) => (f === "all" ? true : a.role === f));
  $("annCount").textContent =
    `${list.length} annonce${list.length > 1 ? "s" : ""} affichée${list.length > 1 ? "s" : ""}`;

  if (!list.length) {
    $("annGrid").innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>
        <b>Aucune annonce</b>
        <p>Lancez une conversation avec votre AiGENT pour publier votre première candidature ou offre.</p>
      </div>`;
    return;
  }

  $("annGrid").innerHTML = list
    .map((a) => {
      const c = a.criteria || {};
      const recruteur = a.role === "recruteur";
      const salary = c.salaireMax ?? c.salaireMin;
      const exp = recruteur ? c.experienceRequiseAnnees : c.experienceAnnees;
      const skills = (recruteur ? c.competencesRequises : c.competences) || [];
      return `
      <article class="ann" data-id="${a.id}">
        <div class="ann-top">
          <div class="ann-ic">
            <svg viewBox="0 0 24 24">${
              recruteur
                ? '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
                : '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'
            }</svg>
          </div>
          <div>
            <div class="ann-title">${esc(annTitle(a))}</div>
            <div class="ann-sub">${esc(c.zone || "Zone libre")} · mis à jour le ${fmtDate(a.updated_at || a.created_at)}</div>
          </div>
          <div class="ann-badges">
            <span class="ann-badge on">${recruteur ? "Offre" : "Candidature"}</span>
          </div>
        </div>
        <div class="ann-strip">
          <span>${salary ? fmtSalary(salary) : "Salaire libre"}</span>
          ${exp != null ? `<i class="sep"></i><span>${exp} an${exp > 1 ? "s" : ""} d'expérience</span>` : ""}
          ${c.typeContrat ? `<i class="sep"></i><span>${esc(c.typeContrat)}</span>` : ""}
        </div>
        ${
          skills.length
            ? `<div class="ann-skills">${skills
                .slice(0, 5)
                .map((s) => `<span class="ann-skill">${esc(s)}</span>`)
                .join("")}</div>`
            : ""
        }
        <div class="ann-actions">
          <button class="btn btn-sm" data-view="${a.id}">Voir le détail</button>
          <button class="btn btn-sm" data-pourvu="${a.id}" data-state="${a.pourvu ? "1" : "0"}">
  ${a.pourvu ? "Marquer comme ouverte" : "Marquer comme pourvue"}
</button>
          <a class="btn btn-sm" href="/chat-emploi.html">Conversation</a>
          <button class="btn btn-sm btn-danger" data-del="${a.id}">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>
      </article>`;
    })
    .join("");

  $$("[data-view]").forEach((b) =>
    b.addEventListener("click", () => openAnnonce(Number(b.dataset.view))),
  );
  $$("[data-del]").forEach((b) =>
    b.addEventListener("click", () => {
      openConfirm({
        title: "Supprimer cette annonce ?",
        text: "L'annonce sera retirée de l'historique et du matching. Action irréversible.",
        word: null,
        onOk: async () => {
          await api(`/emploi/api/my-annonces/${b.dataset.del}`, {
            method: "DELETE",
          });
          toast("Annonce supprimée", "ok");
          await Promise.all([loadAnnonces(), loadStats()]);
        },
      });
    }),
  );
  $$("[data-pourvu]").forEach((b) =>
    b.addEventListener("click", async () => {
      const next = b.dataset.state !== "1";
      await api(`/emploi/api/my-annonces/${b.dataset.pourvu}/pourvu`, {
        method: "POST",
        body: { pourvu: next },
      });
      toast(next ? "Annonce marquée comme pourvue" : "Annonce réouverte", "ok");
      loadAnnonces();
    }),
  );
}

function openAnnonce(id) {
  const a = ANNONCES.find((x) => x.id === id);
  if (!a) return;
  const c = a.criteria || {};
  const recruteur = a.role === "recruteur";
  const salary = c.salaireMax ?? c.salaireMin;
  const skills = (recruteur ? c.competencesRequises : c.competences) || [];
  const docs = a.documents || {};
  $("annModalTitle").textContent = annTitle(a);
  $("annModalBody").innerHTML = `
    <div class="stack">
      ${[
        ["Rôle", recruteur ? "Offre (recruteur)" : "Candidature (candidat)"],
        ["Zone", c.zone],
        ["Salaire", salary ? fmtSalary(salary) : null],
        [
          "Expérience",
          (recruteur ? c.experienceRequiseAnnees : c.experienceAnnees) != null
            ? `${recruteur ? c.experienceRequiseAnnees : c.experienceAnnees} an(s)`
            : null,
        ],
        ["Diplôme", recruteur ? c.niveauEtudeRequis : c.niveauEtude],
        ["Type de contrat", c.typeContrat],
        ["Compétences", skills.length ? skills.join(", ") : null],
        ["CV joint", docs.cv ? "Oui" : null],
        ["Lettre jointe", docs.lettre ? "Oui" : null],
      ]
        .filter(([, v]) => v)
        .map(
          ([k, v]) =>
            `<div class="doc"><div><b>${esc(k)}</b></div><div class="right"><span style="font-size:13px;color:var(--txt-2)">${esc(v)}</span></div></div>`,
        )
        .join("")}
    </div>`;
  $("annOverlay").classList.add("active");
}

/* ══════════════ AGENDA ══════════════ */
function initAgendaUI() {
  $("evColors").innerHTML = EV_COLORS.map(
    (c, i) =>
      `<button type="button" class="color-pick ${i === 0 ? "sel" : ""}" data-c="${c}" style="background:${c}"></button>`,
  ).join("");
  bindColorPicks();

  $("calPrev").addEventListener("click", () => {
    calCursor.setMonth(calCursor.getMonth() - 1);
    renderCalendar();
  });
  $("calNext").addEventListener("click", () => {
    calCursor.setMonth(calCursor.getMonth() + 1);
    renderCalendar();
  });
  $("btnAddEvent").addEventListener("click", addOrUpdateEvent);
  $("evDate").value = localISO();
}

function bindColorPicks() {
  $$(".color-pick").forEach((b) =>
    b.addEventListener("click", () => {
      evColor = b.dataset.c;
      $$(".color-pick").forEach((x) => x.classList.toggle("sel", x === b));
    }),
  );
}

function selectColorInPicker(color) {
  evColor = color || EV_COLORS[0];
  $$(".color-pick").forEach((x) =>
    x.classList.toggle(
      "sel",
      x.dataset.c.toLowerCase() === evColor.toLowerCase(),
    ),
  );
}

async function loadAgenda() {
  try {
    EVENTS = await api("/emploi/api/agenda");
  } catch {
    EVENTS = [];
  }
  $("badgeAgenda").textContent = EVENTS.length;
  renderCalendar();
  renderUpcoming();
}

async function addOrUpdateEvent() {
  const name = $("evName").value.trim();
  const date = $("evDate").value;
  if (!name || !date) return toast("Titre et date requis", "err");
  const body = {
    name,
    date,
    time: $("evTime").value,
    kind: $("evKind").value,
    description: $("evDesc").value.trim(),
    color: evColor,
  };
  try {
    if (editingEventId) {
      await api(`/emploi/api/agenda/${editingEventId}`, {
        method: "PATCH",
        body,
      });
      toast("Évènement mis à jour", "ok");
    } else {
      await api("/emploi/api/agenda", { method: "POST", body });
      toast("Évènement ajouté", "ok");
    }
    resetEventForm();
    loadAgenda();
  } catch (e) {
    toast(e.message, "err");
  }
}

function resetEventForm() {
  editingEventId = null;
  $("evName").value = "";
  $("evDesc").value = "";
  $("evTime").value = "";
  $("evKind").value = "entretien";
  $("evDate").value = localISO();
  selectColorInPicker(EV_COLORS[0]);
  $("btnAddEvent").textContent = "Ajouter à l'agenda";
}

function editEvent(id) {
  const e = EVENTS.find((x) => String(x.id) === String(id));
  if (!e) return;
  editingEventId = e.id;
  $("evName").value = e.name;
  $("evDate").value = String(e.date).slice(0, 10);
  $("evTime").value = e.time ? String(e.time).slice(0, 5) : "";
  $("evKind").value = e.kind || "entretien";
  $("evDesc").value = e.description || "";
  selectColorInPicker(e.color || EV_COLORS[0]);
  $("btnAddEvent").textContent = "Mettre à jour l'évènement";
  $("evName").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteEvent(id) {
  try {
    await api(`/emploi/api/agenda/${id}`, { method: "DELETE" });
    toast("Évènement supprimé", "ok");
    if (editingEventId === id) resetEventForm();
    loadAgenda();
  } catch (e) {
    toast(e.message, "err");
  }
}

function renderCalendar() {
  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  $("calMonth").textContent = calCursor.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  $("calSub").textContent =
    `${EVENTS.length} évènement${EVENTS.length > 1 ? "s" : ""} enregistré${EVENTS.length > 1 ? "s" : ""}`;

  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const startBase = new Date(y, m, 1 - startOffset);
  const today = localISO();

  let html = ["L", "M", "M", "J", "V", "S", "D"]
    .map((d) => `<div class="cal-dow">${d}</div>`)
    .join("");

  for (let i = 0; i < 42; i++) {
    const d = new Date(
      startBase.getFullYear(),
      startBase.getMonth(),
      startBase.getDate() + i,
    );
    const iso = localISO(d);
    const evs = EVENTS.filter((e) => String(e.date).slice(0, 10) === iso);
    html += `<div class="cal-day ${d.getMonth() !== m ? "out" : ""} ${iso === today ? "today" : ""}" data-d="${iso}">
      <b>${d.getDate()}</b>
      ${evs
        .slice(0, 3)
        .map(
          (e) =>
            `<span class="ev" title="${esc(e.name)}" data-evopen="${e.id}"><i style="background:${esc(e.color || "#7cfc3c")}"></i>${esc(e.time ? e.time.slice(0, 5) + " " : "")}${esc(e.name)}</span>`,
        )
        .join("")}
      ${evs.length > 3 ? `<span class="ev">+${evs.length - 3}</span>` : ""}
    </div>`;
  }
  $("calGrid").innerHTML = html;
  $$(".cal-day").forEach((d) =>
    d.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-evopen]")) return;
      $("evDate").value = d.dataset.d;
      $("evName").focus();
    }),
  );
  $$("[data-evopen]").forEach((el) =>
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      editEvent(el.dataset.evopen);
    }),
  );
}

function renderUpcoming() {
  const now = localISO();
  const soon = EVENTS.filter((e) => String(e.date).slice(0, 10) >= now)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 6);
  if (!soon.length) {
    $("evUpcoming").innerHTML = `<div class="empty" style="padding:26px 10px">
      <b>Rien de prévu</b><p>Ajoutez un entretien ou une relance.</p></div>`;
    return;
  }
  $("evUpcoming").innerHTML = soon
    .map(
      (e) => `<div class="ev-row" data-evrow="${e.id}" style="cursor:pointer">
        <span class="bar" style="background:${esc(e.color || "#7cfc3c")}"></span>
        <div>
          <b>${esc(e.name)}</b>
          <p>${fmtDate(e.date)}${e.time ? " · " + esc(e.time.slice(0, 5)) : ""} · ${esc(KIND_LABELS[e.kind] || "Autre")}</p>
        </div>
        <button class="icon-btn" style="margin-left:auto" data-evdel="${e.id}">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>`,
    )
    .join("");
  $$("[data-evdel]").forEach((b) =>
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      deleteEvent(b.dataset.evdel);
    }),
  );
  $$("[data-evrow]").forEach((row) =>
    row.addEventListener("click", () => editEvent(row.dataset.evrow)),
  );
}

/* ══════════════ ACTIVITÉ ══════════════ */
let ACTIVITY = null;

function initActivityTracker() {
  let seconds = 0;
  let events = 0;
  document.addEventListener("click", () => events++);
  setInterval(() => {
    if (document.visibilityState === "visible") seconds += 15;
  }, 15000);
  const flush = () => {
    if (!seconds && !events) return;
    const body = JSON.stringify({ seconds, events });
    seconds = 0;
    events = 0;
    fetch(`${API}/emploi/api/activity/ping`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body,
    }).catch(() => {});
  };
  setInterval(flush, 60000);
  window.addEventListener("beforeunload", flush);
}

async function loadActivity() {
  try {
    ACTIVITY = await api(`/emploi/api/activity?days=${$("actRange").value}`);
  } catch {
    ACTIVITY = { series: [], totalMinutes: 0, activeDays: 0, avgMinutes: 0 };
  }
  $("kpiTotal").textContent = fmtMin(ACTIVITY.totalMinutes || 0);
  $("kpiAvg").textContent = fmtMin(ACTIVITY.avgMinutes || 0);
  $("kpiDays").textContent = `${ACTIVITY.activeDays || 0}`;
  $("kpiBest").textContent = ACTIVITY.bestDay?.minutes
    ? `${fmtMin(ACTIVITY.bestDay.minutes)}`
    : "—";
  $("actSub").textContent = `${ACTIVITY.series?.length || 0} jours analysés`;
  $("kpiMiniTime").textContent = fmtMin(ACTIVITY.totalMinutes || 0);
  $("kpiMiniDays").textContent = `${ACTIVITY.activeDays || 0}`;
  renderActivityChart();
}

function linePath(pts) {
  if (!pts.length) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

function drawChart(svgEl, series, w, h, withAxis) {
  if (!svgEl) return;
  const pad = { l: withAxis ? 42 : 8, r: 10, t: 14, b: withAxis ? 26 : 10 };
  const max = Math.max(10, ...series.map((p) => p.minutes));
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const pts = series.map((p, i) => [
    pad.l + (iw * i) / Math.max(series.length - 1, 1),
    pad.t + ih - (ih * p.minutes) / max,
  ]);
  const grid = withAxis
    ? [0, 0.25, 0.5, 0.75, 1]
        .map((r) => {
          const y = pad.t + ih * r;
          return `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="currentColor" stroke-opacity=".08" stroke-width="1"/>
            <text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="currentColor" opacity=".45">${Math.round(max * (1 - r))}</text>`;
        })
        .join("")
    : "";
  const area = `${linePath(pts)} L ${pts[pts.length - 1]?.[0] || 0} ${pad.t + ih} L ${pts[0]?.[0] || 0} ${pad.t + ih} Z`;
  svgEl.innerHTML = `
    <defs>
      <linearGradient id="gr-${svgEl.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#a6ff3d" stop-opacity=".4"/>
        <stop offset="100%" stop-color="#4b8600" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="gs-${svgEl.id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#c3ff5c"/><stop offset="100%" stop-color="#4b8600"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#gr-${svgEl.id})"/>
    <path d="${linePath(pts)}" fill="none" stroke="url(#gs-${svgEl.id})" stroke-width="2.4" stroke-linecap="round"/>
    ${pts
      .map(
        (p, i) =>
          `<circle class="pt" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="${series[i].minutes ? 3 : 0}" fill="#090b09" stroke="#a6ff3d" stroke-width="2"/>`,
      )
      .join("")}
    <rect x="0" y="0" width="${w}" height="${h}" fill="transparent" class="hit"/>`;
  return { pts, pad, iw };
}

function renderActivityChart() {
  const series = ACTIVITY?.series || [];
  if (!series.length) return;
  const big = drawChart($("actChart"), series, 900, 260, true);
  drawChart($("miniChart"), series.slice(-14), 600, 180, false);

  const tip = $("chartTip");
  const wrap = $("chartWrap");
  const svg = $("actChart");
  if (!big || !svg) return;
  svg.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 900;
    let idx = Math.round(
      ((x - big.pad.l) / Math.max(big.iw, 1)) * (series.length - 1),
    );
    idx = Math.max(0, Math.min(series.length - 1, idx));
    const p = series[idx];
    tip.innerHTML = `${new Date(p.day).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })} · <b>${fmtMin(p.minutes)}</b>`;
    tip.style.opacity = "1";
    tip.style.left = `${Math.min(wrap.clientWidth - 150, Math.max(0, (big.pts[idx][0] / 900) * r.width - 60))}px`;
    tip.style.top = `${(big.pts[idx][1] / 260) * r.height - 42}px`;
  });
  svg.addEventListener("mouseleave", () => (tip.style.opacity = "0"));
}

/* ══════════════ COFFRE CV & LETTRES ══════════════ */
async function loadVault() {
  let d;
  try {
    d = await api("/emploi/api/vault");
  } catch {
    d = { cv: [], lettres: [] };
  }
  const items = [
    ...d.cv.map((x) => ({ ...x, kindLabel: "CV" })),
    ...d.lettres.map((x) => ({ ...x, kindLabel: "Lettre" })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  $("vaultCount").textContent =
    `${items.length} document${items.length > 1 ? "s" : ""}`;
  if (!items.length) {
    $("vaultList").innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
      <b>Coffre vide</b><p>Déposez vos CV et lettres pour les réutiliser en un clic dans vos candidatures.</p></div>`;
    return;
  }
  $("vaultList").innerHTML = items
    .map(
      (it) => `<div class="doc">
        <div class="ic"><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg></div>
        <div><b>${esc(it.label)}</b><p><span class="kind-tag ${it.kind}">${esc(it.kindLabel)}</span> · déposé le ${fmtDate(it.created_at)}</p></div>
        <div class="right">
          <a class="btn btn-sm" target="_blank" rel="noopener" href="${esc(it.url)}">Ouvrir</a>
          <button class="btn btn-sm btn-danger" data-vdel="${it.id}"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
      </div>`,
    )
    .join("");
  $$("[data-vdel]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/emploi/api/vault/${b.dataset.vdel}`, { method: "DELETE" });
      toast("Document retiré", "ok");
      loadVault();
    }),
  );
}

function initVaultFileInput() {
  const input = $("vFile");
  if (!input) return;
  input.style.display = "none";

  const wrap = document.createElement("div");
  wrap.className = "file-picker";
  wrap.innerHTML = `
    <button type="button" class="file-picker-btn">
      <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>
      <span>Choisir un fichier</span>
    </button>
    <span class="file-picker-name">Aucun fichier sélectionné</span>`;
  input.parentNode.insertBefore(wrap, input.nextSibling);

  const btn = wrap.querySelector(".file-picker-btn");
  const nameEl = wrap.querySelector(".file-picker-name");
  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    nameEl.textContent = input.files?.[0]?.name || "Aucun fichier sélectionné";
    nameEl.classList.toggle("has-file", !!input.files?.[0]);
  });
}

async function handleVaultAdd() {
  const label = $("vLabel").value.trim();
  const kind = $("vKind").value;
  const file = $("vFile").files[0];
  if (!label) return toast("Libellé requis", "err");
  if (!file) return toast("Sélectionnez un fichier", "err");
  try {
    const fd = new FormData();
    fd.append("label", label);
    fd.append("kind", kind);
    fd.append("file", file);
    await api("/emploi/api/vault", { method: "POST", body: fd });
    $("vLabel").value = "";
    $("vFile").value = "";
    const nameEl = document.querySelector(".file-picker-name");
    if (nameEl) {
      nameEl.textContent = "Aucun fichier sélectionné";
      nameEl.classList.remove("has-file");
    }
    toast("Document ajouté au coffre", "ok");
    loadVault();
  } catch (e) {
    toast(e.message, "err");
  }
}

/* ══════════════ DIAGNOSTIC MARCHÉ ══════════════ */
function gaugeSVG(value) {
  const v = Math.max(0, Math.min(100, value));
  const angle = -90 + (v / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 95,
    cy = 95,
    r = 78;
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);
  const large = v > 50 ? 1 : 0;
  return `<svg viewBox="0 0 190 110">
    <path d="M17 95 A78 78 0 0 1 173 95" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="14" stroke-linecap="round"/>
    <path d="M17 95 A78 78 0 ${large} 1 ${x} ${y}" fill="none" stroke="url(#gaugeGrad)" stroke-width="14" stroke-linecap="round"/>
    <defs><linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#c3ff5c"/><stop offset="100%" stop-color="#4b8600"/>
    </linearGradient></defs>
  </svg>`;
}

async function runDiagnostic() {
  $("diagScoreBody").innerHTML =
    '<div class="skeleton" style="height:150px"></div>';
  $("diagSalaryBody").innerHTML =
    '<div class="skeleton" style="height:80px"></div>';
  $("diagSkillsBody").innerHTML =
    '<div class="skeleton" style="height:80px"></div>';
  $("diagRecoBody").innerHTML =
    '<div class="skeleton" style="height:60px"></div>';
  try {
    const r = await api("/emploi/api/diagnostic", { method: "POST", body: {} });
    DIAGNOSTIC = r;
    if (!r.available) {
      const empty = `<div class="empty">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <b>Diagnostic indisponible</b><p>${esc(r.message || "Publiez une annonce pour lancer le diagnostic.")}</p></div>`;
      $("diagScoreBody").innerHTML = empty;
      $("diagSalaryBody").innerHTML = "";
      $("diagSkillsBody").innerHTML = "";
      $("diagRecoBody").innerHTML = "";
      return;
    }

    $("diagSub").textContent = r.scopedToDomaine
      ? `Comparé à ${r.sampleSize} profil(s) du même domaine`
      : `Comparé à ${r.sampleSize} profil(s) sur la plateforme`;

    $("diagScoreBody").innerHTML = `
      <div class="gauge-wrap">
        ${gaugeSVG(r.attractiveness)}
        <div class="gauge-value">${r.attractiveness}</div>
        <div class="gauge-label">Score d'attractivité</div>
      </div>`;

    const sal = r.salary || {};
    $("diagSalaryBody").innerHTML =
      sal.mine != null
        ? `
      <div class="mini-kpis" style="grid-template-columns:repeat(3,1fr);margin-top:0">
        <div class="kpi"><b>${fmtSalary(sal.mine)}</b><span>Le vôtre</span></div>
        <div class="kpi"><b>${sal.average != null ? fmtSalary(sal.average) : "—"}</b><span>Moyenne marché</span></div>
        <div class="kpi"><b>${sal.percentile != null ? sal.percentile + "e" : "—"}</b><span>Percentile</span></div>
      </div>`
        : `<div class="hint">Aucun salaire renseigné sur votre dernière annonce.</div>`;

    const demanded = r.skills?.demanded || [];
    $("diagSkillsSub").textContent = r.scopedToDomaine
      ? "Dans votre domaine"
      : "Sur l'ensemble de la plateforme";
    $("diagSkillsBody").innerHTML = demanded.length
      ? demanded
          .map(
            (d) => `<div class="bar-row">
              <span class="name">${esc(d.skill)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${d.pct}%"></span></span>
              <span class="bar-pct">${d.pct}%</span>
            </div>`,
          )
          .join("") +
        (r.skills.gaps?.length
          ? `<div style="margin-top:12px"><span class="label" style="display:block;margin-bottom:6px">Compétences en tension chez vous</span>${r.skills.gaps.map((g) => `<span class="gap-chip">${esc(g.skill)}</span>`).join("")}</div>`
          : "")
      : `<div class="hint">Pas assez de données pour établir un classement des compétences.</div>`;

    $("diagRecoBody").innerHTML = (r.recommendations || [])
      .map(
        (t) => `<div class="reco">
          <svg viewBox="0 0 24 24"><path d="M13 2 3 14h8l-1 8 11-14h-8z"/></svg>
          <span>${esc(t)}</span>
        </div>`,
      )
      .join("");
  } catch (e) {
    toast(e.message, "err");
    $("diagScoreBody").innerHTML =
      `<div class="empty"><b>Erreur</b><p>${esc(e.message)}</p></div>`;
  }
}

/* ══════════════ PRÉFÉRENCES ══════════════ */
const SEARCH_PREFS = [
  [
    "autoMatch",
    "Matching automatique",
    "Lance la recherche de profils dès qu'une annonce est complète.",
    "M4 12h6l2-4 2 8 2-4h4",
  ],
  [
    "masquerPourvus",
    "Masquer les postes pourvus",
    "Les offres et candidatures conclues disparaissent des résultats.",
    "M3 3l18 18M10 10a3 3 0 0 0 4 4",
  ],
  [
    "prioriteCV",
    "Prioriser les profils avec CV complet",
    "Les profils avec CV et lettre passent en tête des résultats.",
    "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z",
  ],
  [
    "triPertinence",
    "Trier par compatibilité",
    "Classe les résultats par score de compatibilité plutôt que par date.",
    "M3 17l5-6 4 4 5-7 4 5",
  ],
];
const ALERT_PREFS = [
  [
    "alertMatch",
    "Nouveau match",
    "Un profil correspond à vos critères — coordonnées incluses.",
  ],
  [
    "alertMessage",
    "Nouveau message",
    "Un candidat ou recruteur vous contacte.",
  ],
  ["alertAgenda", "Rappel agenda", "24h avant chaque entretien."],
  [
    "alertDiagnostic",
    "Évolution du diagnostic marché",
    "Votre score d'attractivité change significativement.",
  ],
];
const LANGS = [
  ["fr", "Français", "🇫🇷"],
  ["en", "English", "🇬🇧"],
  ["es", "Español", "🇪🇸"],
  ["de", "Deutsch", "🇩🇪"],
];

function initPrefsUI() {
  $("prefsAgent").innerHTML = SEARCH_PREFS.map(
    ([k, t, d, p]) => `<div class="row-toggle">
      <div class="ic"><svg viewBox="0 0 24 24"><path d="${p}"/></svg></div>
      <div><b>${t}</b><p>${d}</p></div>
      <button type="button" class="switch" data-pref="${k}"></button></div>`,
  ).join("");
  $("prefsAlerts").innerHTML = ALERT_PREFS.map(
    ([k, t, d]) => `<div class="row-toggle">
      <div class="ic"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/></svg></div>
      <div><b>${t}</b><p>${d}</p></div>
      <button type="button" class="switch" data-pref="${k}"></button></div>`,
  ).join("");
  $("langPicks").innerHTML = LANGS.map(
    ([
      code,
      name,
      flag,
    ]) => `<button type="button" class="doc" data-lang="${code}" style="width:100%;text-align:left">
      <span style="font-size:20px;line-height:1">${flag}</span>
      <div><b>${name}</b><p>${code.toUpperCase()}</p></div>
      <span class="right"><span class="chip" data-check="${code}" style="display:none">Actif</span></span>
    </button>`,
  ).join("");

  $$("[data-pref]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.pref === "autoMatch") {
        toast("Le matching automatique est toujours activé.", "info");
        return;
      }
      b.classList.toggle("on");
      savePreferences({ [b.dataset.pref]: b.classList.contains("on") }, true);
    }),
  );
  $$("[data-lang]").forEach((b) =>
    b.addEventListener("click", () => {
      PREFS.langue = b.dataset.lang;
      paintLang();
      window.EmploiPrefs?.applyLanguage?.(b.dataset.lang);
      savePreferences({ langue: b.dataset.lang }, true);
    }),
  );

  $("prefCurrency")?.addEventListener("change", () => {
    PREFS.devise = $("prefCurrency").value;
    window.EmploiPrefs?.applyCurrency?.(PREFS.devise);
    savePreferences({ devise: PREFS.devise }, true);
  });
  $("prefUnit")?.addEventListener("change", () => {
    window.EmploiPrefs?.applyUnit?.($("prefUnit").value);
  });
}

function paintLang() {
  $$("[data-check]").forEach((c) => {
    c.style.display =
      c.dataset.check === (PREFS.langue || "fr") ? "inline-flex" : "none";
    c.className = "chip green";
  });
}

const DEFAULT_ON_PREFS = new Set(["autoMatch", "prioriteCV", "triPertinence"]);

async function loadPreferences() {
  try {
    PREFS = await api("/emploi/api/preferences");
  } catch {
    PREFS = {};
  }
  $$("[data-pref]").forEach((b) => {
    const key = b.dataset.pref;
    const val = PREFS[key];
    const isOn = DEFAULT_ON_PREFS.has(key) ? val !== false : val === true;
    b.classList.toggle("on", isOn);
    if (key === "autoMatch") {
      b.classList.add("forced");
      b.setAttribute("aria-disabled", "true");
      b.title = "Toujours activé";
    }
  });
  $("prefCurrency").value = PREFS.devise || "EUR";
  $("prefUnit").value = PREFS.unite || "km";
  $("prefRadius").value = PREFS.rayon || 30;
  $("prefTheme").value =
    PREFS.theme || document.documentElement.getAttribute("data-theme");
  paintLang();

  window.EmploiPrefs?.applyAll?.(PREFS);
}

function collectPrefs() {
  const out = { ...PREFS };
  $$("[data-pref]").forEach(
    (b) => (out[b.dataset.pref] = b.classList.contains("on")),
  );
  out.autoMatch = true;
  out.devise = $("prefCurrency").value;
  out.unite = $("prefUnit").value;
  out.rayon = Number($("prefRadius").value) || 30;
  out.theme = $("prefTheme").value;
  out.langue = PREFS.langue || "fr";
  return out;
}

async function savePreferences(patch, silent) {
  try {
    const r = await api("/emploi/api/preferences", {
      method: "PATCH",
      body: patch,
    });
    PREFS = r.preferences || { ...PREFS, ...patch };
    if (PREFS.theme) {
      document.documentElement.setAttribute("data-theme", PREFS.theme);
      localStorage.setItem("emploi_theme", PREFS.theme);
    }
    window.EmploiPrefs?.applyAll?.(PREFS);
    if (!silent) toast("Préférences enregistrées", "ok");
  } catch (e) {
    if (!silent) toast(e.message, "err");
  }
}

/* ══════════════ SÉCURITÉ ══════════════ */
function initPasswordUI() {
  $$(".pwd-toggle").forEach((b) =>
    b.addEventListener("click", () => {
      const i = $(b.dataset.toggle);
      i.type = i.type === "password" ? "text" : "password";
    }),
  );
  $("pwdNew").addEventListener("input", (e) => {
    const v = e.target.value;
    let s = 0;
    if (v.length >= 8) s++;
    if (/[A-Z]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    $("pwdBar").style.width = `${(s / 4) * 100}%`;
    $("pwdHint").textContent =
      `Force : ${["—", "faible", "moyenne", "bonne", "excellente"][s]}`;
  });
}

async function handleChangePassword() {
  const cur = $("pwdCurrent").value;
  const nw = $("pwdNew").value;
  const cf = $("pwdConfirm").value;
  if (!cur || !nw) return toast("Remplissez tous les champs", "err");
  if (nw.length < 8) return toast("8 caractères minimum", "err");
  if (nw !== cf) return toast("La confirmation ne correspond pas", "err");
  try {
    await api("/emploi/api/change-password", {
      method: "POST",
      body: { currentPassword: cur, newPassword: nw },
    });
    ["pwdCurrent", "pwdNew", "pwdConfirm"].forEach((k) => ($(k).value = ""));
    $("pwdBar").style.width = "0";
    toast("Mot de passe mis à jour", "ok");
  } catch (e) {
    toast(e.message, "err");
  }
}

function base32(len = 32) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  return Array.from(
    { length: len },
    () => A[Math.floor(Math.random() * A.length)],
  ).join("");
}

async function load2FA() {
  let enabled = false;
  try {
    enabled = (await api("/emploi/api/2fa/status")).enabled;
  } catch {}
  $("tfaState").textContent = enabled ? "Activée" : "Inactive";
  $("chip2fa").textContent = enabled ? "2FA active" : "2FA inactive";
  $("chip2fa").className = `chip ${enabled ? "green" : "red"}`;

  if (enabled) {
    $("tfaBody").innerHTML = `
      <div class="row-toggle" style="border:none;padding-top:0">
        <div class="ic" style="color:var(--green)"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></div>
        <div><b>Votre compte est protégé</b><p>Un des 3 codes de sécurité est demandé à chaque connexion, en plus du mot de passe.</p></div>
      </div>
      <button class="btn btn-danger" id="btn2faOff" style="width:100%">Désactiver la 2FA</button>`;
    $("btn2faOff").addEventListener("click", async () => {
      try {
        await api("/emploi/api/2fa/disable", { method: "POST", body: {} });
        toast("2FA désactivée", "ok");
        load2FA();
      } catch (e) {
        toast(e.message, "err");
      }
    });
    return;
  }

  const secret = base32();
  const uri = `otpauth://totp/MonAiGENTEmploi:${encodeURIComponent(ME?.username || "user")}?secret=${secret}&issuer=MonAiGENT%20Emploi`;
  $("tfaBody").innerHTML = `
    <p style="font-size:12.8px;color:var(--txt-2);margin-bottom:12px">
      Scannez ce QR code dans Google Authenticator, Authy ou 1Password, puis saisissez le code généré.
    </p>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <img alt="QR code 2FA" width="132" height="132" style="border-radius:12px;border:1px solid var(--line-strong);background:#fff"
        src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}"/>
      <div style="flex:1;min-width:180px">
        <div class="label">Clé manuelle</div>
        <div class="input" style="font-family:ui-monospace,monospace;font-size:12px;word-break:break-all">${secret}</div>
      </div>
    </div>
    <div class="field" style="margin-top:14px">
      <label class="label" for="tfaCode">Code à 6 chiffres</label>
      <input class="input" id="tfaCode" maxlength="6" inputmode="numeric" placeholder="000000"/>
    </div>
    <button class="btn btn-primary" id="btn2faOn" style="width:100%">Activer la 2FA</button>`;

  $("btn2faOn").addEventListener("click", async () => {
    const code = $("tfaCode").value.trim();
    if (!/^\d{6}$/.test(code)) return toast("Code à 6 chiffres requis", "err");
    try {
      const r = await api("/emploi/api/2fa/enable", {
        method: "POST",
        body: { secret, code },
      });
      toast("2FA activée", "ok");
      if (r.backupCodes?.length) {
        $("confirmTitle").textContent = "Vos 3 codes de connexion";
        $("confirmText").innerHTML =
          `Conservez ces codes en lieu sûr. À chaque connexion, un des <b>3</b> suffira, en plus de votre mot de passe :<br><br><code style="font-size:14px;line-height:2.2;font-weight:700">${r.backupCodes.join("<br>")}</code>`;
        $("confirmTypeWrap").style.display = "none";
        $("confirmOk").textContent = "J'ai noté";
        $("confirmOk").className = "btn btn-primary";
        $("confirmOk").onclick = closeConfirm;
        $("confirmOverlay").classList.add("active");
      }
      load2FA();
    } catch (e) {
      toast(e.message, "err");
    }
  });
}

async function handleExport() {
  try {
    const data = await api("/emploi/api/export-data");
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mon-aigent-emploi-${ME.username}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Export téléchargé", "ok");
  } catch (e) {
    toast(e.message, "err");
  }
}

/* ══════════════ SUPPORT ══════════════ */
async function handleSupport() {
  const subject = $("supSubject").value.trim();
  const message = $("supMessage").value.trim();
  if (!subject || message.length < 10)
    return toast("Sujet et message (10 caractères min.) requis", "err");
  const btn = $("btnSupport");
  btn.disabled = true;
  try {
    const r = await api("/emploi/api/support", {
      method: "POST",
      body: { subject, message, category: $("supCat").value },
    });
    $("supSubject").value = "";
    $("supMessage").value = "";
    toast(`Ticket #${r.ticketId} envoyé — notre équipe répond sous 24h`, "ok");
    loadTickets();
    loadNotifications();
  } catch (e) {
    toast(e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function loadTickets() {
  let rows = [];
  try {
    rows = await api("/emploi/api/support");
  } catch {}
  if (!rows.length) {
    $("supList").innerHTML =
      `<div class="empty" style="padding:26px 10px"><b>Aucun ticket</b><p>Vos demandes apparaîtront ici.</p></div>`;
    return;
  }
  $("supList").innerHTML = rows
    .map(
      (t) => `<div class="doc">
        <div class="ic"><svg viewBox="0 0 24 24"><path d="M4 4h16v12H7l-3 3z"/></svg></div>
        <div><b>#${t.id} — ${esc(t.subject)}</b><p>${esc(t.category)} · ${fmtDate(t.created_at)}</p></div>
        <div class="right"><span class="chip ${t.status === "open" ? "green" : "green"}">${t.status === "open" ? "En cours" : "Résolu"}</span></div>
      </div>`,
    )
    .join("");
}

/* ══════════════ NOTIFICATIONS ══════════════ */
async function loadNotifications() {
  let rows = [];
  try {
    rows = await api("/emploi/api/notifications");
  } catch {}
  const unread = rows.filter((r) => !r.read).length;
  $("notifDot").style.display = unread ? "block" : "none";
  $("notifList").innerHTML = rows.length
    ? rows
        .map((n) => {
          let data = {};
          try {
            data =
              typeof n.data === "string" ? JSON.parse(n.data) : n.data || {};
          } catch {}
          const linkBtn = data.link
            ? `<button type="button" class="btn btn-sm" data-notiflink="${esc(data.link)}" style="margin-top:6px">Voir plus →</button>`
            : "";
          const matchDetails =
            data.type === "match" && data.username
              ? `<div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:var(--surface-3);font-size:11.5px;line-height:1.6">
                   <b>${esc(data.username)}</b><br>
                   <span style="color:var(--txt-3)">Contactez ce profil depuis la messagerie.</span>
                 </div>`
              : "";
          return `<div class="doc" style="${n.read ? "opacity:.6" : ""};align-items:flex-start">
            <div class="ic"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/></svg></div>
            <div style="flex:1">
              <b>${esc(n.title)}</b><p>${esc(n.body)}</p>
              ${matchDetails}
              ${linkBtn}
            </div>
            <div class="right"><span style="font-size:11px;color:var(--txt-3)">${fmtDate(n.created_at)}</span></div>
          </div>`;
        })
        .join("")
    : `<div class="empty" style="padding:26px 10px"><b>Aucune notification</b><p>Vous êtes à jour.</p></div>`;

  $$("[data-notiflink]").forEach((b) =>
    b.addEventListener("click", () => {
      $("notifOverlay").classList.remove("active");
      showSection(b.dataset.notiflink);
    }),
  );
}

/* ══════════════ ZONE CRITIQUE ══════════════ */
function closeConfirm() {
  $("confirmOverlay").classList.remove("active");
}

function openConfirm({ title, text, word, onOk }) {
  $("confirmTitle").textContent = title;
  $("confirmText").textContent = text;
  $("confirmTypeWrap").style.display = word ? "block" : "none";
  $("confirmWord").textContent = word || "";
  $("confirmInput").value = "";
  $("confirmOk").textContent = "Confirmer";
  $("confirmOk").className = "btn btn-danger";
  $("confirmOk").onclick = async () => {
    if (word && $("confirmInput").value.trim().toUpperCase() !== word)
      return toast(`Tapez ${word} pour confirmer`, "err");
    try {
      await onOk();
      closeConfirm();
    } catch (e) {
      toast(e.message, "err");
    }
  };
  $("confirmOverlay").classList.add("active");
}

function openDanger(kind) {
  if (kind === "reset")
    return openConfirm({
      title: "Réinitialiser le profil AiGENT ?",
      text: "Vos annonces seront effacées et l'agent repartira de zéro. Votre compte reste actif.",
      word: "RESET",
      onOk: async () => {
        await api("/emploi/api/reset-profile", { method: "POST", body: {} });
        toast("Profil réinitialisé", "ok");
        await Promise.all([loadAnnonces(), loadStats()]);
      },
    });

  if (kind === "data")
    return openConfirm({
      title: "Supprimer toutes vos données ?",
      text: "Annonces, agenda, coffre et messages seront définitivement supprimés.",
      word: "SUPPRIMER",
      onOk: async () => {
        await api("/emploi/api/delete-data", { method: "DELETE" });
        toast("Données supprimées", "ok");
        await Promise.all([
          loadAnnonces(),
          loadStats(),
          loadAgenda(),
          loadVault(),
        ]);
      },
    });

  return openConfirm({
    title: "Supprimer définitivement le compte ?",
    text: "Cette action est irréversible : compte, annonces et historique seront effacés.",
    word: "SUPPRIMER",
    onOk: async () => {
      await api("/emploi/api/delete-account", { method: "DELETE" });
      toast("Compte supprimé", "ok");
      setTimeout(logout, 900);
    },
  });
}
