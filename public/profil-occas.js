/**
 * profil-occas.js — Mon AiGENT Occasion · Page Profil
 * v2 — corrige : ville auto-remplie depuis le chat, agenda (date + couleur),
 * estimation fonctionnelle, préférences réellement connectées (langue,
 * devise, unité, thème, alertes), 2FA à 3 codes, input fichier stylé.
 *
 * Dépend de i18n-occas.js (chargé AVANT ce script) pour :
 *   - window.OccasPrefs.applyAll(prefs)      → applique langue/devise/unité/thème partout
 *   - window.OccasPrefs.t(key)               → traduction courte
 *   - window.OccasPrefs.formatPrice(n)       → prix dans la devise choisie
 *   - window.OccasPrefs.formatDistance(km)   → distance dans l'unité choisie
 */

const API = "http://localhost:3100";
const TOKEN_KEYS = ["occas_token", "agent_occas_token", "token"];
const USER_KEYS = ["occas_user", "agent_occas_user", "agent_user"];

let TOKEN = null;
let ME = null;
let PREFS = {};
let ANNONCES = [];
let EVENTS = [];
let AVATARS = [];
let AVATAR_DEFAULT = "/images/avatar-default.jpg";
let pendingAvatar = null;
let calCursor = new Date();
let evColor = "#ff6a2b";
let editingEventId = null;

const EV_COLORS = [
  "#ff6a2b",
  "#e8362f",
  "#ffb35c",
  "#2fd07f",
  "#4b8cff",
  "#b06bff",
];
const KIND_LABELS = {
  essai: "Essai véhicule",
  ct: "Contrôle technique",
  revision: "Révision / entretien",
  rdv: "Rendez-vous acheteur",
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
const fmtPrice = (n) => {
  if (!n && n !== 0) return "Prix à définir";
  if (window.OccasPrefs?.formatPrice) return window.OccasPrefs.formatPrice(n);
  return `${Number(n).toLocaleString("fr-FR")} €`;
};
const fmtDist = (km) => {
  if (km == null) return "—";
  if (window.OccasPrefs?.formatDistance)
    return window.OccasPrefs.formatDistance(km);
  return `${fmtNum(km)} km`;
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

/** Date locale "YYYY-MM-DD" SANS passer par toISOString (évite le décalage UTC). */
function localISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
/** Ajoute n jours à une date "YYYY-MM-DD" en restant en arithmétique civile pure (pas de fuseau). */
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localISO(dt);
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
        if (parsed && typeof parsed === "object" && parsed.token) {
          return parsed.token;
        }
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
  window.location.href = "/login-occas.html";
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
    // La devise/unité doit être connue AVANT tout rendu de prix ou distance
    // (annonces, stats, activité) : sinon le premier affichage reste en EUR/km.
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
  const saved = localStorage.getItem("occas_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  $("btnTheme").addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("occas_theme", next);
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
}
// Exposé pour que les notifications puissent rediriger ("Voir plus →")
window.occasGotoSection = showSection;

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
  ME = await api("/occas/api/me/full");
  const avatar = ME.avatar || AVATAR_DEFAULT;
  $("heroAvatar").src = avatar;
  $("navAvatar").src = avatar;
  $("heroName").textContent = ME.username;
  $("navUsername").textContent = ME.username;
  const role = ME.role === "seller" ? "Vendeur" : "Acheteur";
  $("navRole").textContent = role;
  $("chipRole").textContent = role;

  // Ville : profil > repli sur la dernière ville renseignée dans le chat (villeFromAnnonce)
  const villeAffichee = ME.ville || ME.villeFromAnnonce || "";
  $("chipVille").innerHTML =
    `<svg viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(villeAffichee || "Ville non renseignée")}`;
  $("chipSince").innerHTML =
    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Membre depuis ${fmtDate(ME.created_at)}`;
  $("fUsername").value = ME.username;
  $("fContact").value = ME.contact || "";
  $("fVille").value = villeAffichee;

  // Si la ville venait uniquement du chat (pas encore enregistrée sur le profil),
  // on la persiste silencieusement pour ne plus dépendre du repli.
  if (!ME.ville && ME.villeFromAnnonce) {
    api("/occas/api/me", {
      method: "PATCH",
      body: { ville: ME.villeFromAnnonce },
    })
      .then(() => {
        ME.ville = ME.villeFromAnnonce;
      })
      .catch(() => {});
  }
}

async function loadStats() {
  const s = await api("/occas/api/stats");
  $("statAnnonces").textContent = s.totalAnnonces;
  $("statFavoris").textContent = s.totalFavoris;
  $("statConvos").textContent = s.activeConversations;
}

/* ══════════════ AVATARS ══════════════ */
function initAvatarModal() {
  const open = async () => {
    if (!AVATARS.length) {
      try {
        const d = await api("/occas/api/avatars");
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
           <img src="${esc(a)}" alt="Avatar" loading="lazy"
                onerror="this.src='${esc(AVATAR_DEFAULT)}'"/>
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
      await api("/occas/api/change-avatar", {
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
      await api("/occas/api/me", { method: "PATCH", body: { contact } });
      ME.contact = contact;
      toast("Contact enregistré", "ok");
    } catch (e) {
      toast(e.message, "err");
    }
  });

  $("btnSaveVille").addEventListener("click", async () => {
    const ville = $("fVille").value.trim();
    try {
      await api("/occas/api/me", { method: "PATCH", body: { ville } });
      ME.ville = ville;
      $("chipVille").innerHTML =
        `<svg viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(ville || "Ville non renseignée")}`;
      toast("Ville enregistrée", "ok");
    } catch (e) {
      toast(e.message, "err");
    }
  });

  $("btnChangePwd").addEventListener("click", handleChangePassword);
  $("btnExport").addEventListener("click", handleExport);
  $("btnSupport").addEventListener("click", handleSupport);
  $("btnEstimate").addEventListener("click", handleEstimate);
  $("btnVaultAdd").addEventListener("click", handleVaultAdd);
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
    await api("/occas/api/notifications/read", { method: "POST", body: {} });
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
    ANNONCES = await api("/occas/api/my-annonces");
  } catch {
    ANNONCES = [];
  }
  $("badgeAnnonces").textContent = ANNONCES.length;
  renderAnnonces();
}

function annImage(a) {
  const imgs = Array.isArray(a.imagesbien) ? a.imagesbien : [];
  if (a.role === "buyer") return "/images/image-acheteur.jpg";
  return imgs[0] || "/images/vehicule-placeholder.jpg";
}

function renderAnnonces() {
  const f = $("annFilter").value;
  const list = ANNONCES.filter((a) => {
    if (f === "published") return a.published;
    if (f === "draft") return !a.published;
    if (f === "seller") return a.role === "seller";
    if (f === "buyer") return a.role === "buyer";
    return true;
  });
  $("annCount").textContent =
    `${list.length} annonce${list.length > 1 ? "s" : ""} affichée${list.length > 1 ? "s" : ""}`;

  if (!list.length) {
    $("annGrid").innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <svg viewBox="0 0 24 24"><path d="M5 17h14M6.5 17V9.8L8 6h8l1.5 3.8V17"/></svg>
        <b>Aucune annonce</b>
        <p>Lancez une conversation avec votre AiGENT pour créer votre première annonce.</p>
      </div>`;
    return;
  }

  $("annGrid").innerHTML = list
    .map((a) => {
      const seller = a.role === "seller";
      const title = `${a.marque || "Véhicule"} ${a.modele || ""}`.trim();
      const price = seller
        ? fmtPrice(a.prix)
        : a.budgetmax
          ? `≤ ${fmtPrice(a.budgetmax)}`
          : "Budget libre";
      const bits = [
        seller ? a.annee : a.anneemin ? `dès ${a.anneemin}` : null,
        seller
          ? a.kilometrage
            ? fmtDist(a.kilometrage)
            : null
          : a.kilometragemax
            ? `≤ ${fmtDist(a.kilometragemax)}`
            : null,
        a.carburant,
        a.boite,
        a.ville,
      ].filter(Boolean);
      const imgs = Array.isArray(a.imagesbien) ? a.imagesbien : [];
      return `
      <article class="ann" data-id="${a.id}">
        <div class="ann-photo">
          <div class="ann-badges">
            <span class="ann-badge ${a.published ? "on" : ""}">${a.published ? "Publiée" : "Brouillon"}</span>
            <span class="ann-badge">${seller ? "Vendeur" : "Acheteur"}</span>
            ${a.carverticalurl ? '<span class="ann-badge on">CarVertical</span>' : ""}
          </div>
          <img src="${esc(annImage(a))}" alt="${esc(title)}" loading="lazy"
               onerror="this.src='/images/vehicule-placeholder.jpg'"/>
        </div>
        <div class="ann-head">
          <div>
            <div class="ann-title">${esc(title)}</div>
            <div class="ann-sub">${imgs.length > 1 ? imgs.length + " photos · " : ""}mis à jour le ${fmtDate(a.updated_at || a.created_at)}</div>
          </div>
          <div class="ann-price">${price}</div>
        </div>
        <div class="ann-strip">
          ${bits.map((b, i) => `${i ? '<i class="sep"></i>' : ""}<span>${esc(b)}</span>`).join("")}
        </div>
        <div class="ann-actions">
          <button class="btn btn-sm" data-view="${a.id}">Voir le détail</button>
          <a class="btn btn-sm" href="/chat-occas.html?annonce=${a.id}">Conversation</a>
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
        text: "L'annonce et sa conversation seront retirées du matching. Action irréversible.",
        word: null,
        onOk: async () => {
          await api(`/occas/api/my-annonces/${b.dataset.del}`, {
            method: "DELETE",
          });
          toast("Annonce supprimée", "ok");
          await Promise.all([loadAnnonces(), loadStats()]);
        },
      });
    }),
  );
}

function openAnnonce(id) {
  const a = ANNONCES.find((x) => x.id === id);
  if (!a) return;
  const seller = a.role === "seller";
  const zones =
    a.etatzones && typeof a.etatzones === "object" ? a.etatzones : {};
  const imgs = Array.isArray(a.imagesbien) ? a.imagesbien : [];
  $("annModalTitle").textContent =
    `${a.marque || "Véhicule"} ${a.modele || ""}`.trim();
  $("annModalBody").innerHTML = `
    <div class="ann" style="border:none;box-shadow:none">
      <div class="ann-photo" style="height:220px;border-radius:12px;overflow:hidden">
        <img src="${esc(annImage(a))}" alt="" onerror="this.src='/images/vehicule-placeholder.jpg'"/>
      </div>
      <div class="ann-head" style="padding:14px 0 10px">
        <div>
          <div class="ann-title">${esc(`${a.marque || ""} ${a.modele || ""}`.trim() || "Véhicule")}</div>
          <div class="ann-sub">${seller ? "Annonce vendeur" : "Recherche acheteur"} · ${esc(a.ville || "—")}</div>
        </div>
        <div class="ann-price">${seller ? fmtPrice(a.prix) : a.budgetmax ? `≤ ${fmtPrice(a.budgetmax)}` : "Budget libre"}</div>
      </div>
    </div>
    <div class="stack">
      ${[
        [
          "Année",
          seller ? a.annee : a.anneemin ? `à partir de ${a.anneemin}` : null,
        ],
        [
          "Kilométrage",
          seller
            ? a.kilometrage
              ? fmtDist(a.kilometrage)
              : null
            : a.kilometragemax
              ? `≤ ${fmtDist(a.kilometragemax)}`
              : null,
        ],
        ["Carburant", a.carburant],
        ["Boîte", a.boite],
        ["Rayon", a.tolerancekm ? fmtDist(a.tolerancekm) : null],
        ["Photos", imgs.length ? `${imgs.length}` : null],
        ["Rapport CarVertical", a.carverticalurl ? "Disponible" : null],
        [
          "Zones d'état renseignées",
          Object.keys(zones).length ? Object.keys(zones).length : null,
        ],
      ]
        .filter(([, v]) => v)
        .map(
          ([k, v]) =>
            `<div class="doc"><div><b>${esc(k)}</b></div><div class="right"><span style="font-size:13px;color:var(--txt-2)">${esc(v)}</span></div></div>`,
        )
        .join("")}
    </div>
    ${
      a.carverticalurl
        ? `<a class="btn btn-primary" style="margin-top:14px;width:100%" target="_blank" rel="noopener" href="${esc(a.carverticalurl)}">Ouvrir le rapport CarVertical</a>`
        : ""
    }`;
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
    EVENTS = await api("/occas/api/agenda");
  } catch {
    EVENTS = [];
  }
  $("badgeAgenda").textContent = EVENTS.length;
  renderCalendar();
  renderUpcoming();
}

async function addOrUpdateEvent() {
  const name = $("evName").value.trim();
  const date = $("evDate").value; // "YYYY-MM-DD" — jamais transformé, envoyé tel quel
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
      await api(`/occas/api/agenda/${editingEventId}`, {
        method: "PATCH",
        body,
      });
      toast("Évènement mis à jour", "ok");
    } else {
      await api("/occas/api/agenda", { method: "POST", body });
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
  $("evKind").value = "essai";
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
  $("evKind").value = e.kind || "essai";
  $("evDesc").value = e.description || "";
  selectColorInPicker(e.color || EV_COLORS[0]);
  $("btnAddEvent").textContent = "Mettre à jour l'évènement";
  $("evName").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteEvent(id) {
  try {
    await api(`/occas/api/agenda/${id}`, { method: "DELETE" });
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

  // Grille calculée en arithmétique civile pure (Date locale, jamais toISOString)
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // lundi = 0
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
            `<span class="ev" title="${esc(e.name)}" data-evopen="${e.id}"><i style="background:${esc(e.color || "#ff6a2b")}"></i>${esc(e.time ? e.time.slice(0, 5) + " " : "")}${esc(e.name)}</span>`,
        )
        .join("")}
      ${evs.length > 3 ? `<span class="ev">+${evs.length - 3}</span>` : ""}
    </div>`;
  }
  $("calGrid").innerHTML = html;
  $$(".cal-day").forEach((d) =>
    d.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-evopen]")) return; // géré séparément
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
      <b>Rien de prévu</b><p>Ajoutez un essai ou un contrôle technique.</p></div>`;
    return;
  }
  $("evUpcoming").innerHTML = soon
    .map(
      (e) => `<div class="ev-row" data-evrow="${e.id}" style="cursor:pointer">
        <span class="bar" style="background:${esc(e.color || "#ff6a2b")}"></span>
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
    fetch(`${API}/occas/api/activity/ping`, {
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
    ACTIVITY = await api(`/occas/api/activity?days=${$("actRange").value}`);
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
        <stop offset="0%" stop-color="#ff6a2b" stop-opacity=".38"/>
        <stop offset="100%" stop-color="#e8362f" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="gs-${svgEl.id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ff8f4d"/><stop offset="100%" stop-color="#e8362f"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#gr-${svgEl.id})"/>
    <path d="${linePath(pts)}" fill="none" stroke="url(#gs-${svgEl.id})" stroke-width="2.4" stroke-linecap="round"/>
    ${pts
      .map(
        (p, i) =>
          `<circle class="pt" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="${series[i].minutes ? 3 : 0}" fill="#0a090d" stroke="#ff8f4d" stroke-width="2"/>`,
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

/* ══════════════ COFFRE CARVERTICAL ══════════════ */
async function loadVault() {
  let d;
  try {
    d = await api("/occas/api/vault");
  } catch {
    d = { docs: [], fromAnnonces: [] };
  }
  const items = [
    ...d.docs.map((x) => ({
      id: x.id,
      label: x.label,
      sub: [x.plate, x.vin].filter(Boolean).join(" · ") || "Document personnel",
      url: x.url,
      note: x.note,
      deletable: true,
    })),
    ...d.fromAnnonces.map((x) => ({
      id: `a${x.annonce_id}`,
      label: `${x.marque || "Véhicule"} ${x.modele || ""}`.trim(),
      sub: `Rattaché à une annonce${x.annee ? " · " + x.annee : ""}`,
      url: x.url,
      note: x.note,
      deletable: false,
    })),
  ];
  $("vaultCount").textContent =
    `${items.length} document${items.length > 1 ? "s" : ""}`;
  if (!items.length) {
    $("vaultList").innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.4"/></svg>
      <b>Coffre vide</b><p>Déposez vos rapports CarVertical pour les réutiliser en un clic dans vos annonces.</p></div>`;
    return;
  }
  $("vaultList").innerHTML = items
    .map(
      (it) => `<div class="doc">
        <div class="ic"><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg></div>
        <div><b>${esc(it.label)}</b><p>${esc(it.sub)}</p></div>
        <div class="right">
          ${it.note ? `<span class="score">${Number(it.note).toFixed(1)}/10</span>` : ""}
          <a class="btn btn-sm" target="_blank" rel="noopener" href="${esc(it.url)}">Ouvrir</a>
          ${it.deletable ? `<button class="btn btn-sm btn-danger" data-vdel="${it.id}"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : ""}
        </div>
      </div>`,
    )
    .join("");
  $$("[data-vdel]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/occas/api/vault/${b.dataset.vdel}`, { method: "DELETE" });
      toast("Document retiré", "ok");
      loadVault();
    }),
  );
}

/** Remplace le champ fichier navigateur par défaut par un bouton "Parcourir" stylé. */
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
  const file = $("vFile").files[0];
  const url = $("vUrl").value.trim();
  if (!label) return toast("Libellé requis", "err");
  if (!file && !url) return toast("Ajoutez un fichier ou un lien", "err");
  try {
    const fd = new FormData();
    fd.append("label", label);
    fd.append("plate", $("vPlate").value.trim());
    fd.append("vin", $("vVin").value.trim());
    if ($("vNote").value) fd.append("note", $("vNote").value);
    if (url) fd.append("url", url);
    if (file) fd.append("file", file);
    await api("/occas/api/vault", { method: "POST", body: fd });
    ["vLabel", "vPlate", "vVin", "vNote", "vUrl"].forEach(
      (k) => ($(k).value = ""),
    );
    $("vFile").value = "";
    const nameEl = document.querySelector(".file-picker-name");
    if (nameEl) {
      nameEl.textContent = "Aucun fichier sélectionné";
      nameEl.classList.remove("has-file");
    }
    toast("Rapport ajouté au coffre", "ok");
    loadVault();
  } catch (e) {
    toast(e.message, "err");
  }
}

/* ══════════════ COTE & ESTIMATION ══════════════ */
async function handleEstimate() {
  const marque = $("eMarque").value.trim();
  if (!marque) return toast("Marque requise", "err");
  $("estResult").innerHTML =
    '<div class="skeleton" style="height:150px"></div>';
  const btn = $("btnEstimate");
  btn.disabled = true;
  try {
    const r = await api("/occas/api/estimation", {
      method: "POST",
      body: {
        marque,
        modele: $("eModele").value.trim(),
        annee: Number($("eAnnee").value) || null,
        kilometrage: Number($("eKm").value) || null,
      },
    });
    if (!r.found) {
      $("estResult").innerHTML =
        `<div class="empty"><b>Données insuffisantes</b><p>${esc(r.message || "Pas assez d'annonces comparables sur la plateforme pour ce modèle.")}</p></div>`;
      return;
    }
    $("estResult").innerHTML = `
      <div style="text-align:center;padding:6px 0 14px">
        <div style="font-size:36px;font-weight:800;letter-spacing:-.03em;background:linear-gradient(135deg,#ffd18a,#ff6a2b);-webkit-background-clip:text;background-clip:text;color:transparent">${fmtPrice(r.estimated)}</div>
        <div style="font-size:12.5px;color:var(--txt-3)">Fourchette ${fmtPrice(r.rangeLow)} — ${fmtPrice(r.rangeHigh)}</div>
      </div>
      <div class="mini-kpis" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi"><b>${fmtPrice(r.median)}</b><span>Médiane</span></div>
        <div class="kpi"><b>${fmtPrice(r.average)}</b><span>Moyenne</span></div>
        <div class="kpi"><b>${r.found}</b><span>Comparables</span></div>
      </div>`;
  } catch (e) {
    toast(e.message, "err");
    $("estResult").innerHTML =
      `<div class="empty"><b>Erreur</b><p>${esc(e.message)}</p></div>`;
  } finally {
    btn.disabled = false;
  }
}

/* ══════════════ PRÉFÉRENCES ══════════════ */
// Bloc "Recherche & Matching" — paramètres concrets, sans jargon IA.
const SEARCH_PREFS = [
  [
    "autoMatch",
    "Matching automatique",
    "Lance la recherche de profils dès qu'une annonce est complète.",
    "M4 12h6l2-4 2 8 2-4h4",
  ],
  [
    "masquerVendus",
    "Masquer les véhicules vendus",
    "Les annonces conclues disparaissent des résultats.",
    "M3 3l18 18M10 10a3 3 0 0 0 4 4",
  ],
  [
    "prioriteCarV",
    "Prioriser les annonces CarVertical",
    "Les véhicules avec rapport passent en tête des résultats.",
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
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
  ["alertMessage", "Nouveau message", "Un acheteur ou vendeur vous contacte."],
  ["alertPrice", "Baisse de prix", "Un véhicule suivi change de prix."],
  ["alertAgenda", "Rappel agenda", "24h avant chaque rendez-vous."],
  ["alertNews", "Actualité marché", "Tendances et cote de votre modèle."],
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
      // Activation/désactivation immédiate (pas besoin d'attendre "Enregistrer")
      savePreferences({ [b.dataset.pref]: b.classList.contains("on") }, true);
    }),
  );
  $$("[data-lang]").forEach((b) =>
    b.addEventListener("click", () => {
      PREFS.langue = b.dataset.lang;
      paintLang();
      window.OccasPrefs?.applyLanguage?.(b.dataset.lang);
      savePreferences({ langue: b.dataset.lang }, true);
    }),
  );

  $("prefCurrency")?.addEventListener("change", () => {
    PREFS.devise = $("prefCurrency").value;
    window.OccasPrefs?.applyCurrency?.(PREFS.devise);
    updateCurrencyIcon();
    savePreferences({ devise: PREFS.devise }, true);
  });
  $("prefUnit")?.addEventListener("change", () => {
    window.OccasPrefs?.applyUnit?.($("prefUnit").value);
  });
}

function paintLang() {
  $$("[data-check]").forEach((c) => {
    c.style.display =
      c.dataset.check === (PREFS.langue || "fr") ? "inline-flex" : "none";
    c.className = "chip orange";
  });
}

const DEFAULT_ON_PREFS = new Set([
  "autoMatch",
  "prioriteCarV",
  "triPertinence",
]);

function updateCurrencyIcon() {
  const glyph = { EUR: "€", USD: "$", GBP: "£", CHF: "Fr" };
  const sym = glyph[PREFS.devise || "EUR"] || "€";
  const navIcon = $("navCoteIcon");
  const cardIcon = $("coteCardIcon");
  if (navIcon) navIcon.textContent = sym;
  if (cardIcon) cardIcon.textContent = sym;
}

async function loadPreferences() {
  try {
    PREFS = await api("/occas/api/preferences");
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
  $("prefRadius").value = PREFS.rayon || 60;
  $("prefTheme").value =
    PREFS.theme || document.documentElement.getAttribute("data-theme");
  paintLang();
  updateCurrencyIcon();

  // Applique immédiatement langue / devise / unité / thème sur toute la page
  window.OccasPrefs?.applyAll?.(PREFS);
}

function collectPrefs() {
  const out = { ...PREFS };
  $$("[data-pref]").forEach(
    (b) => (out[b.dataset.pref] = b.classList.contains("on")),
  );
  out.autoMatch = true; // toujours actif, jamais désactivable
  out.devise = $("prefCurrency").value;
  out.unite = $("prefUnit").value;
  out.rayon = Number($("prefRadius").value) || 60;
  out.theme = $("prefTheme").value;
  out.langue = PREFS.langue || "fr";
  return out;
}

async function savePreferences(patch, silent) {
  try {
    const r = await api("/occas/api/preferences", {
      method: "PATCH",
      body: patch,
    });
    PREFS = r.preferences || { ...PREFS, ...patch };
    if (PREFS.theme) {
      document.documentElement.setAttribute("data-theme", PREFS.theme);
      localStorage.setItem("occas_theme", PREFS.theme);
    }
    window.OccasPrefs?.applyAll?.(PREFS);
    updateCurrencyIcon();
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
    // Le serveur vérifie réellement currentPassword via bcrypt.compare avant
    // d'accepter le changement — un mauvais mot de passe actuel est rejeté (401).
    await api("/occas/api/change-password", {
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
    enabled = (await api("/occas/api/2fa/status")).enabled;
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
        await api("/occas/api/2fa/disable", { method: "POST", body: {} });
        toast("2FA désactivée", "ok");
        load2FA();
      } catch (e) {
        toast(e.message, "err");
      }
    });
    return;
  }

  const secret = base32();
  const uri = `otpauth://totp/MonAiGENTOccasion:${encodeURIComponent(ME?.username || "user")}?secret=${secret}&issuer=MonAiGENT%20Occasion`;
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
      const r = await api("/occas/api/2fa/enable", {
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
    const data = await api("/occas/api/export-data");
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mon-aigent-occasion-${ME.username}.json`;
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
    const r = await api("/occas/api/support", {
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
    rows = await api("/occas/api/support");
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
        <div class="right"><span class="chip ${t.status === "open" ? "orange" : "green"}">${t.status === "open" ? "En cours" : "Résolu"}</span></div>
      </div>`,
    )
    .join("");
}

/* ══════════════ NOTIFICATIONS ══════════════ */
async function loadNotifications() {
  let rows = [];
  try {
    rows = await api("/occas/api/notifications");
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
            data.type === "match" && data.contact
              ? `<div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:var(--surface-3);font-size:11.5px;line-height:1.6">
                   <b>${esc(data.username || "Profil")}</b> · ${esc(data.contact)}<br>
                   <span style="color:var(--txt-3)">Contactez ce profil depuis la messagerie avec ce pseudo et cet e-mail.</span>
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
        await api("/occas/api/reset-profile", { method: "POST", body: {} });
        toast("Profil réinitialisé", "ok");
        await Promise.all([loadAnnonces(), loadStats()]);
      },
    });

  if (kind === "data")
    return openConfirm({
      title: "Supprimer toutes vos données ?",
      text: "Annonces, favoris et messages seront définitivement supprimés.",
      word: "SUPPRIMER",
      onOk: async () => {
        await api("/occas/api/delete-data", { method: "DELETE" });
        toast("Données supprimées", "ok");
        await Promise.all([loadAnnonces(), loadStats()]);
      },
    });

  return openConfirm({
    title: "Supprimer définitivement le compte ?",
    text: "Cette action est irréversible : compte, annonces et historique seront effacés.",
    word: "SUPPRIMER",
    onOk: async () => {
      await api("/occas/api/delete-account", { method: "DELETE" });
      toast("Compte supprimé", "ok");
      setTimeout(logout, 900);
    },
  });
}
