/**
 * ============================================================
 * AiGENT VOYAGE — FRONT CHAT (v2)
 * ============================================================
 * Connecté à server-voyage.js. Aucune donnée n'est inventée ici :
 * tout ce qui est affiché (critères, matches, pricing, idées,
 * urgence, raisons) provient tel quel des réponses serveur, qui
 * elles-mêmes proviennent du moteur déterministe et de l'IA.
 * Ce fichier ne fait que : appeler l'API, garder l'état de session,
 * et rendre l'interface.
 *
 * v2 — changements majeurs :
 *  - Suppression totale de l'ancien formulaire de connexion interne
 *    (renderAuthGate / handleAuthSubmit / finishAuth). La page chat
 *    ne gère plus jamais l'authentification : elle est soit connectée,
 *    soit elle redirige vers login-voyage.html. Point.
 *  - Déconnexion : deux chemins distincts.
 *      · Déconnexion INVOLONTAIRE (session expirée / token invalide)
 *        → nettoyage ciblé → redirection vers ./login-voyage.html
 *      · Déconnexion VOLONTAIRE (bouton "Déconnexion")
 *        → vidage complet du localStorage → redirection vers ./cto-voyage.html
 *  - Pièces jointes (fichier / photo / billet) réellement câblées,
 *    avec aperçu propre dans le composer et dans les bulles de chat.
 *  - Bouton flottant "revenir en bas" quand la conversation défile.
 * ============================================================
 */

const API = "";
const AUTH_KEY = "agent_voyage_user";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );
const scrollBottom = (el) =>
  el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });

const CATEGORY_LABELS = {
  mer: "Mer",
  nature: "Nature",
  culture: "Culture",
  gastronomie: "Gastronomie",
  detente: "Détente",
  aventure: "Aventure",
  nocturne: "Nocturne",
  famille: "Famille",
  transport: "Transport",
  hebergement: "Hébergement",
};

const URGENCY_META = {
  immediate: { label: "Départ imminent", tone: "critical" },
  urgente: { label: "Urgent", tone: "warning" },
  proche: { label: "Créneau proche", tone: "info" },
  lointaine: { label: "Flexible", tone: "calm" },
  indeterminee: { label: "Créneau libre", tone: "neutral" },
  expiree: { label: "Expiré", tone: "critical" },
};

const MISSING_LABELS = {
  activite: "le type d'activité",
  ville: "la ville",
  date: "la date",
  heure: "l'heure",
  categorie: "le type d'expérience",
  placesRestantes: "le nombre de places restantes",
  prixHabituel: "le prix habituel",
  nombrePersonnes: "le nombre de personnes",
  budgetTotal: "le budget",
};

const PREFERENCE_TAGS = {
  voyageur: [
    "Calme",
    "Actif",
    "Romantique",
    "En intérieur",
    "Avec enfants",
    "Nature",
    "Confort",
    "Économique",
    "Local",
    "Insolite",
  ],
  prestataire: [
    "Annulation gratuite",
    "Petit groupe",
    "Accessible PMR",
    "Matériel fourni",
    "Guide francophone",
    "Vue exceptionnelle",
    "Options végétariennes",
    "Parking inclus",
  ],
};

const CATEGORY_META = {
  mer: {
    label: "Mer",
    color: "#0ea5e9",
    image: "./images/voyage-mer.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M3 20c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M12 4v7"/><path d="M9 7l3-3 3 3"/></svg>`,
    subthemes: ["Plage", "Voile / Bateau", "Plongée", "Sports nautiques"],
  },
  nature: {
    label: "Nature",
    color: "#16a34a",
    image: "./images/voyage-nature.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c0-6 3-10 8-11-1 6-4 9-8 11z"/><path d="M12 21c0-5-2-8-7-10 0 5 2 9 7 10z"/></svg>`,
    subthemes: ["Randonnée", "Forêt", "Montagne", "Lac / Rivière"],
  },
  culture: {
    label: "Culture",
    color: "#8b5cf6",
    image: "./images/voyage-culture.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16M4 20h16"/><path d="M6 10v10M10 10v10M14 10v10M18 10v10"/><path d="M3 10l9-6 9 6"/></svg>`,
    subthemes: ["Musée", "Monument historique", "Visite guidée", "Exposition"],
  },
  gastronomie: {
    label: "Gastronomie",
    color: "#f59e0b",
    image: "./images/voyage-gastronomie.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11"/><path d="M17 3c-1.5 0-2.5 1.5-2.5 4s1 4 2.5 5v9"/></svg>`,
    subthemes: [
      "Restaurant gastronomique",
      "Dégustation",
      "Atelier culinaire",
      "Marché local",
    ],
  },
  detente: {
    label: "Détente",
    color: "#14b8a6",
    image: "./images/voyage-detente.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.4"/><path d="M12 3c1.6 2 1.6 4-.2 5.5M12 3c-1.6 2-1.6 4 .2 5.5M21 12c-2 1.6-4 1.6-5.5-.2M21 12c-2-1.6-4-1.6-5.5.2M12 21c1.6-2 1.6-4-.2-5.5M12 21c-1.6-2-1.6-4 .2-5.5M3 12c2-1.6 4-1.6 5.5.2M3 12c2 1.6 4 1.6 5.5-.2"/></svg>`,
    subthemes: ["Spa / Bien-être", "Balade tranquille", "Hébergement cosy"],
  },
  aventure: {
    label: "Aventure",
    color: "#ef4444",
    image: "./images/voyage-aventure.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18l6-9 4 5 2-3 6 7z"/></svg>`,
    subthemes: [
      "Randonnée sportive",
      "Escalade",
      "Sports extrêmes",
      "Excursion nature",
    ],
  },
  nocturne: {
    label: "Nocturne",
    color: "#6366f1",
    image: "./images/voyage-nocturne.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/><path d="M18 3l.6 1.4L20 5l-1.4.6L18 7l-.6-1.4L16 5l1.4-.6z"/></svg>`,
    subthemes: [
      "Bar / Rooftop",
      "Concert / Soirée",
      "Croisière nocturne",
      "Visite nocturne",
    ],
  },
  famille: {
    label: "Famille",
    color: "#ec4899",
    image: "./images/voyage-famille.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.2"/><path d="M3 20c.6-3 2.6-5 5-5s4.4 2 5 5"/><path d="M13 20c.5-2.6 2.2-4.4 4.2-4.4S20.9 17.4 21 20"/></svg>`,
    subthemes: [
      "Parc d'attractions",
      "Zoo / Aquarium",
      "Activité enfants",
      "Sortie éducative",
    ],
  },
  transport: {
    label: "Transport",
    color: "#64748b",
    image: "./images/voyage-transport.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13"/><path d="M3 13h18v4a1 1 0 0 1-1 1h-1.5a1.5 1.5 0 0 1-3 0H6.5a1.5 1.5 0 0 1-3 0H2a1 1 0 0 1-1-1z"/></svg>`,
    subthemes: ["Transfert aéroport", "Location de véhicule", "Navette"],
  },
  hebergement: {
    label: "Hébergement",
    color: "#a16207",
    image: "./images/voyage-hebergement.png",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v6"/><path d="M3 18h18v-3a2 2 0 0 0-2-2h-6"/><path d="M3 12V7"/></svg>`,
    subthemes: [
      "Hôtel",
      "Chambre d'hôtes",
      "Location courte durée",
      "Camping / Glamping",
    ],
  },
};

const MAX_INLINE_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 Mo — au-delà, on n'envoie que les métadonnées

/* ════════════════════════════════════════════════════════════════════════
   ÉTAT
   ════════════════════════════════════════════════════════════════════════ */

const state = {
  token: null,
  user: null,
  role: null,
  criteria: {},
  phase: "gathering",
  published: false,
  history: [],
  lastMatches: [],
  sending: false,
  categories: [],
  attachments: [], // { id, file, kind: 'image'|'doc'|'ticket', name, size, mime, previewUrl }
};

function storageKey(k) {
  return state.user ? `voyage_${k}_${state.user.username}` : null;
}
function persist(k, v) {
  const key = storageKey(k);
  if (key) localStorage.setItem(key, JSON.stringify(v));
}
function recall(k, fallback = null) {
  const key = storageKey(k);
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   ICÔNES (SVG uniquement)
   ════════════════════════════════════════════════════════════════════════ */

const ICON = {
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h13"/><path d="M13 6l7 6-7 6"/></svg>`,
  compass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"/><path d="M15 9l-2 6-6 2 2-6z"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5.6-8 12-8 12s-8-6.4-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.6"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 15.2c.4.7 1.3 1.1 2.5 1.1 1.6 0 2.6-.7 2.6-1.8 0-2.4-5-1-5-3.4 0-1.1 1-1.8 2.5-1.8 1.1 0 2 .4 2.4 1.1M12 7.4V16.6"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.8 19c.5-3 3-5 6.2-5s5.7 2 6.2 5"/><path d="M16 8.4a3 3 0 0 1 0 5.8"/><path d="M21.2 19c-.4-2.4-1.9-4.2-4-4.8"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.6 3H5.6A1.6 1.6 0 0 0 4 4.6v7l9 9 8.4-8.4-9-9z"/><circle cx="8.2" cy="8.2" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.8 2.8M15.2 15.2 18 18M18 6l-2.8 2.8M8.8 15.2 6 18"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/></svg>`,
  handshake: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5 10.8 15l7-7"/><path d="M2 12l3.6-3.6 3.6 1.8 2.6-2.6 4.4 4.4-2.6 2.6-3.6-1.8L6.4 16z"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>`,
  plane: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.5 15 10l6 3-1 1.6-6.3-1.3-3 4.7.8 2.7-1.4.9-1.9-3.2-3.6.4-.6-1.5 3-2-1.3-6.3L8 7.5l4.5-4z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
};

const LOGO_SVG = `<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="1.6" opacity=".35"/><path d="M24 8c3 5 5 10 5 16s-2 11-5 16c-3-5-5-10-5-16s2-11 5-16z" stroke="currentColor" stroke-width="1.6"/><path d="M8 24h32M11 15.5h26M11 32.5h26" stroke="currentColor" stroke-width="1.3" opacity=".55"/></svg>`;

/* ════════════════════════════════════════════════════════════════════════
   API HELPERS
   ════════════════════════════════════════════════════════════════════════ */
// Un seul forceLogout jamais concurrent, + une marge de grâce et un retry
// juste après une connexion fraîche pour absorber la propagation de
// session côté serveur.
let loggingOut = false;
let sessionStartedAt = 0; // posé dans restoreSession()

async function api(
  path,
  { method = "GET", body, auth = true, _retried = false } = {},
) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { success: false, error: "Réponse invalide du serveur" };
  }

  if (res.status === 403 && auth && !loggingOut) {
    const justLoggedIn = Date.now() - sessionStartedAt < 3000;
    if (justLoggedIn && !_retried) {
      // Session encore en propagation côté serveur : on retente une fois
      // après un court délai plutôt que de renvoyer l'utilisateur au login.
      await new Promise((r) => setTimeout(r, 600));
      return api(path, { method, body, auth, _retried: true });
    }
    forceLogout("Session expirée, reconnectez-vous.");
  }
  return data;
}
const postChat = (payload) =>
  api("/api/voyage/chat", { method: "POST", body: payload });

/* ════════════════════════════════════════════════════════════════════════
   AUTHENTIFICATION
   ────────────────────────────────────────────────────────────────────────
   La page chat NE GÈRE PLUS aucun formulaire de connexion. Elle est soit
   connectée (session valide restaurée depuis localStorage), soit elle
   redirige immédiatement vers ./login-voyage.html — c'est cette dernière
   qui possède le seul formulaire de connexion/inscription de l'app.
   ════════════════════════════════════════════════════════════════════════ */

function restoreSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user) return false;
    state.token = parsed.token;
    state.user = parsed.user;
    state.role = parsed.user.role;
    sessionStartedAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

// Vide explicitement toutes les données de l'utilisateur courant (pas
// seulement le token), pour qu'il n'y ait plus jamais un message ou un
// critère de l'ancienne session visible pour le prochain compte connecté.
function clearUserData() {
  if (!state.user?.username) return;
  const prefix = `voyage_`;
  const suffix = `_${state.user.username}`;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix) && k.endsWith(suffix))
    .forEach((k) => localStorage.removeItem(k));
}

// Déconnexion INVOLONTAIRE : session expirée / token invalide détecté en
// cours d'usage (ex: 403 sur un appel API). On nettoie ce qui concerne cet
// utilisateur puis on renvoie vers la page de connexion.
function forceLogout(message) {
  if (message) console.warn(message);
  loggingOut = true;
  clearUserData();
  localStorage.removeItem(AUTH_KEY);
  window.location.href = "./login-voyage.html";
}

// Déconnexion VOLONTAIRE : l'utilisateur clique sur "Déconnexion". On vide
// intégralement le localStorage (toutes données, tous comptes confondus)
// et on renvoie vers la page d'accueil, pas vers le login.
async function voluntaryLogout() {
  if (loggingOut) return;
  loggingOut = true;
  const btn = $("btn-logout");
  if (btn) btn.disabled = true;

  const finish = () => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    window.location.href = "./cto-voyage.html";
  };

  try {
    await Promise.race([
      api("/api/voyage/logout", { method: "POST", body: {} }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* on se déconnecte localement même si l'appel réseau échoue */
  } finally {
    finish();
  }
}
/* ════════════════════════════════════════════════════════════════════════
   THÈME
   ════════════════════════════════════════════════════════════════════════ */

function initTheme() {
  const saved = localStorage.getItem("voyage_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeToggleIcon(saved);
  $("theme-toggle")?.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("voyage_theme", next);
    updateThemeToggleIcon(next);
  });
}
function updateThemeToggleIcon(theme) {
  const btn = $("theme-toggle");
  if (btn) btn.innerHTML = theme === "dark" ? ICON.sun : ICON.moon;
}

/* ════════════════════════════════════════════════════════════════════════
   RENDU — MESSAGES
   ════════════════════════════════════════════════════════════════════════ */

function clearEmptyState() {
  document.querySelector(".empty-state")?.remove();
}

function humanFileSize(bytes) {
  if (bytes == null) return "";
  const units = ["o", "Ko", "Mo", "Go"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i > 0 && v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function renderMessageAttachments(attachments) {
  if (!attachments?.length) return "";
  return `<div class="msg-attachments">${attachments
    .map((a) => {
      if (a.kind === "image" && a.previewUrl) {
        return `<img class="msg-attachment-img" src="${a.previewUrl}" alt="${esc(a.name)}" />`;
      }
      const isTicket = a.kind === "ticket";
      return `<div class="msg-attachment-doc ${isTicket ? "is-ticket" : ""}">
          <span class="msg-attachment-icon">${isTicket ? ICON.plane : ICON.doc}</span>
          <span class="msg-attachment-name">${esc(a.name)}</span>
        </div>`;
    })
    .join("")}</div>`;
}

function addMessage(
  text,
  from = "assistant",
  { persist: keep = true, typing = false, attachments = [] } = {},
) {
  if (!text && !attachments.length) return;
  clearEmptyState();
  const box = $("conversation");
  const row = document.createElement("div");
  row.className = `msg-row msg-${from}`;

  if (from === "user") {
    const attHtml = renderMessageAttachments(attachments);
    row.innerHTML = `
      <div class="bubble-stack">
        ${attHtml}
        ${text ? `<div class="bubble bubble-user">${esc(text)}</div>` : ""}
      </div>`;
  } else {
    row.innerHTML = `
      <div class="assistant-avatar">${LOGO_SVG}</div>
      <div class="bubble bubble-assistant"><span class="bubble-text"></span></div>`;
  }
  box.appendChild(row);
  scrollBottom(box);

  if (from === "assistant" && text) {
    const span = row.querySelector(".bubble-text");
    if (typing) {
      let i = 0;
      const step = () => {
        span.textContent = text.slice(0, i + 1);
        i++;
        if (i < text.length) {
          scrollBottom(box);
          requestAnimationFrame(() => setTimeout(step, 6 + Math.random() * 10));
        }
      };
      step();
    } else {
      span.textContent = text;
    }
  }

  if (keep) {
    // On ne persiste jamais les URL d'objets (blob:) car elles ne survivent
    // pas à un rechargement de page : seule la métadonnée est conservée.
    const persistedAttachments = attachments.map((a) => ({
      name: a.name,
      kind: a.kind,
    }));
    state.history.push({ from, text, attachments: persistedAttachments });
    persist("history", state.history);
  }
}

function addThinking() {
  clearEmptyState();
  const box = $("conversation");
  const row = document.createElement("div");
  row.className = "msg-row msg-assistant thinking-row";
  row.innerHTML = `
    <div class="assistant-avatar pulsing">${LOGO_SVG}</div>
    <div class="bubble bubble-assistant thinking-bubble">
      <span class="think-dot"></span><span class="think-dot"></span><span class="think-dot"></span>
    </div>`;
  box.appendChild(row);
  scrollBottom(box);
  return row;
}

/* ════════════════════════════════════════════════════════════════════════
   PIÈCES JOINTES — composer
   ════════════════════════════════════════════════════════════════════════ */

function initAttachments() {
  const input = $("attach-input");
  if (!input) return;

  const openPicker = (accept, kind) => {
    input.value = "";
    input.accept = accept;
    input.dataset.kind = kind;
    input.click();
  };

  $("btn-attach-file")?.addEventListener("click", () => openPicker("", "doc"));
  $("btn-attach-photo")?.addEventListener("click", () =>
    openPicker("image/*", "image"),
  );
  $("btn-attach-doc")?.addEventListener("click", () =>
    openPicker(".pdf,.doc,.docx,.jpg,.jpeg,.png", "ticket"),
  );

  input.addEventListener("change", () => {
    const kind = input.dataset.kind || "doc";
    Array.from(input.files || []).forEach((file) => {
      const isImage = file.type.startsWith("image/");
      state.attachments.push({
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        kind: isImage ? "image" : kind,
        name: file.name,
        size: file.size,
        mime: file.type,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
      });
    });
    renderAttachStrip();
  });
}

function removeAttachment(id) {
  const idx = state.attachments.findIndex((a) => a.id === id);
  if (idx === -1) return;
  const [removed] = state.attachments.splice(idx, 1);
  if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  renderAttachStrip();
}

function clearAttachments() {
  state.attachments.forEach(
    (a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl),
  );
  state.attachments = [];
  renderAttachStrip();
}

function renderAttachStrip() {
  const strip = $("attach-strip");
  if (!strip) return;
  strip.classList.toggle("hidden", state.attachments.length === 0);
  strip.innerHTML = state.attachments
    .map((a) => {
      if (a.kind === "image") {
        return `
          <div class="attach-chip attach-chip-image" data-id="${a.id}">
            <img src="${a.previewUrl}" alt="${esc(a.name)}" />
            <button type="button" class="attach-remove" data-remove="${a.id}" aria-label="Retirer la photo">${ICON.close}</button>
          </div>`;
      }
      const isTicket = a.kind === "ticket";
      return `
        <div class="attach-chip attach-chip-doc ${isTicket ? "is-ticket" : ""}" data-id="${a.id}">
          <span class="attach-chip-icon">${isTicket ? ICON.plane : ICON.doc}</span>
          <span class="attach-chip-info">
            <span class="attach-chip-name">${esc(a.name)}</span>
            <span class="attach-chip-size">${humanFileSize(a.size)}</span>
          </span>
          <button type="button" class="attach-remove" data-remove="${a.id}" aria-label="Retirer le fichier">${ICON.close}</button>
        </div>`;
    })
    .join("");
  strip
    .querySelectorAll("[data-remove]")
    .forEach((btn) =>
      btn.addEventListener("click", () => removeAttachment(btn.dataset.remove)),
    );
}

function prepareAttachmentPayload(att) {
  return new Promise((resolve) => {
    const meta = {
      name: att.name,
      mime: att.mime,
      size: att.size,
      kind: att.kind,
    };
    if (!att.file || att.file.size > MAX_INLINE_ATTACHMENT_BYTES) {
      resolve(meta);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ ...meta, dataUrl: reader.result });
    reader.onerror = () => resolve(meta);
    reader.readAsDataURL(att.file);
  });
}

/* ════════════════════════════════════════════════════════════════════════
   ENVOI DE MESSAGES
   ════════════════════════════════════════════════════════════════════════ */

async function sendMessage(text) {
  if (state.sending) return;
  if (!text && !state.attachments.length) return;
  state.sending = true;
  setComposerBusy(true);

  const attachmentsSnapshot = state.attachments.slice();
  addMessage(text, "user", { attachments: attachmentsSnapshot });
  clearAttachments();

  const thinker = addThinking();
  try {
    const payloadAttachments = await Promise.all(
      attachmentsSnapshot.map(prepareAttachmentPayload),
    );
    const data = await postChat({
      message: text,
      attachments: payloadAttachments,
    });
    thinker.remove();
    handleResponse(data);
  } catch {
    thinker.remove();
    addMessage(
      "La connexion au marché a été interrompue. Réessayez.",
      "assistant",
    );
  } finally {
    state.sending = false;
    setComposerBusy(false);
  }
}

async function sendSpecial(payload, { silent = false } = {}) {
  const thinker = silent ? null : addThinking();
  try {
    const data = await postChat(payload);
    thinker?.remove();
    handleResponse(data);
    return data;
  } catch {
    thinker?.remove();
    addMessage("Une erreur est survenue, réessayez.", "assistant");
    return null;
  }
}

function setComposerBusy(busy) {
  $("composer-send").disabled = busy;
  $("composer-input").disabled = busy;
  ["btn-attach-file", "btn-attach-photo", "btn-attach-doc"].forEach((id) => {
    const b = $(id);
    if (b) b.disabled = busy;
  });
}

/* ════════════════════════════════════════════════════════════════════════
   DISPATCH DES RÉPONSES SERVEUR
   ════════════════════════════════════════════════════════════════════════ */

function handleResponse(data) {
  if (!data || data.success === false) {
    addMessage(data?.error || "Une erreur est survenue.", "assistant");
    return;
  }

  if (data.phase) {
    state.phase = data.phase;
    persist("phase", data.phase);
  }
  if (data.criteria) {
    state.criteria = data.criteria;
    persist("criteria", state.criteria);
  }

  if (data.reply) addMessage(data.reply, "assistant", { typing: true });

  if (Array.isArray(data.matches)) {
    state.lastMatches = data.matches;
    persist("matches", data.matches);
  }

  updatePanel();

  if (data.matches) renderMatches(data.matches);
  if (data.pricing !== undefined)
    renderPricing(data.pricing, data.pricingExplanation);
  if (data.ideas) renderIdeas(data.ideas);
  if (data.postReply) addMessage(data.postReply, "assistant", { typing: true });

  if (data.actionType === "reserve_done") {
    renderReserveConfirmation(data.messageSent, data.contactInfo);
  }

  updateMissingHint(data.missing);
  refreshActionAvailability();

  // Un seul pop-up possible à la fois, déclenché automatiquement par le
  // fil de la conversation — jamais par une action manuelle dans le panel.
  if (data.triggerCategoriePopup) {
    setTimeout(() => openCategoryModal(data.categorieHint), 380);
  } else if (data.triggerPreferencesPopup) {
    setTimeout(() => openPreferencesModal(data.preferencesHint), 380);
  } else if (data.triggerPublishPopup) {
    setTimeout(() => openPublishModal(), 380);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   PANEL — TRAVEL INTELLIGENCE
   ════════════════════════════════════════════════════════════════════════ */

function fieldRow(icon, label, value) {
  return `
    <div class="ti-row ${value ? "" : "is-empty"}">
      <span class="ti-icon">${icon}</span>
      <span class="ti-label">${label}</span>
      <span class="ti-value">${value ? esc(value) : "—"}</span>
    </div>`;
}

function updatePanel() {
  const c = state.criteria || {};
  const isPresta = state.role === "prestataire";
  const panel = $("ti-fields");
  if (!panel) return;

  const rows = isPresta
    ? [
        fieldRow(
          ICON.tag,
          "Activité",
          c.activite || (c.categorie ? CATEGORY_LABELS[c.categorie] : null),
        ),
        fieldRow(
          ICON.pin,
          "Zone",
          [c.ville, c.zonePrecise].filter(Boolean).join(" · "),
        ),
        fieldRow(ICON.clock, "Créneau", formatWhen(c.date, c.heure)),
        fieldRow(
          ICON.users,
          "Places restantes",
          c.placesRestantes != null ? String(c.placesRestantes) : null,
        ),
        fieldRow(
          ICON.coin,
          "Prix habituel",
          c.prixHabituel != null ? `${c.prixHabituel} €` : null,
        ),
        fieldRow(
          ICON.check,
          "Annulation flexible",
          c.annulationFlexible === true
            ? "Oui"
            : c.annulationFlexible === false
              ? "Non"
              : null,
        ),
      ]
    : [
        fieldRow(ICON.pin, "Destination", c.ville || c.zone),
        fieldRow(ICON.clock, "Créneau", formatWhen(c.date, c.heure)),
        fieldRow(
          ICON.users,
          "Voyageurs",
          c.nombrePersonnes != null ? String(c.nombrePersonnes) : null,
        ),
        fieldRow(
          ICON.coin,
          "Budget total",
          c.budgetTotal != null ? `${c.budgetTotal} €` : null,
        ),
        fieldRow(
          ICON.tag,
          "Type d'expérience",
          c.categorie ? CATEGORY_LABELS[c.categorie] || c.categorie : null,
        ),
        fieldRow(ICON.spark, "Préférences", c.preferences),
      ];

  panel.innerHTML = rows.join("");
  const filled = rows.filter((r) => !r.includes("is-empty")).length;
  const bar = $("ti-progress-bar");
  if (bar) bar.style.width = `${Math.round((filled / rows.length) * 100)}%`;

  const statusEl = $("ti-status");
  if (statusEl) {
    statusEl.textContent = state.published
      ? "Annonce publiée — marché actif"
      : state.phase === "results"
        ? "Résultats en cours d'analyse"
        : "Compréhension en cours";
    statusEl.className = `ti-status ${state.published ? "is-live" : ""}`;
  }
}

function formatWhen(date, heure) {
  if (!date && heure == null) return null;
  const d =
    date === "aujourd'hui" || date === "aujourdhui"
      ? "Aujourd'hui"
      : date === "demain"
        ? "Demain"
        : date;
  const h = heure != null ? `${heure}h` : "";
  return [d, h].filter(Boolean).join(" · ");
}
function missingLabel(field) {
  if (field === "preferences") {
    return state.role === "prestataire"
      ? "vos atouts à mettre en avant"
      : "vos préférences";
  }
  return MISSING_LABELS[field] || field;
}

// Le panel ne fait plus QUE constater l'état — la collecte se fait
// exclusivement dans le fil de la conversation (voir handleResponse).
function updateMissingHint(missing) {
  const el = $("ti-missing");
  if (!el) return;
  if (!missing || !missing.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = `
    <span class="ti-missing-icon">${ICON.bolt}</span>
    <span>La conversation continue pour préciser : ${missing.map(missingLabel).join(", ")}</span>`;
}
function refreshActionAvailability() {
  const unlocked = state.phase === "results";
  const btn = $("btn-ideas");
  if (btn) btn.disabled = !unlocked;
}

/* ════════════════════════════════════════════════════════════════════════
   CARTES D'OPPORTUNITÉS
   ════════════════════════════════════════════════════════════════════════ */

function renderMatches(matches) {
  const wrap = $("opportunities");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!matches.length) {
    wrap.innerHTML = `
      <div class="opp-empty">
        <span class="opp-empty-icon">${ICON.compass}</span>
        <p>Aucune opportunité compatible pour l'instant sur le marché.</p>
      </div>`;
    return;
  }

  const isPresta = state.role === "prestataire";
  matches.forEach((m, i) => {
    const urgency = URGENCY_META[m.urgence] || URGENCY_META.indeterminee;
    const title = isPresta
      ? m.categorie
        ? CATEGORY_LABELS[m.categorie] || m.categorie
        : "Demande voyageur"
      : m.activite ||
        (m.categorie ? CATEGORY_LABELS[m.categorie] : "Expérience");
    const meta = isPresta
      ? [
          m.ville,
          formatWhen(m.date, m.heure),
          m.nombrePersonnes != null ? `${m.nombrePersonnes} pers.` : null,
          m.budgetTotal != null ? `${m.budgetTotal} € budget` : null,
        ]
      : [
          m.ville,
          formatWhen(m.date, m.heure),
          m.placesRestantes != null ? `${m.placesRestantes} places` : null,
          (m.prixRecommande ?? m.prixHabituel) != null
            ? `${m.prixRecommande ?? m.prixHabituel} €`
            : null,
        ];

    const card = document.createElement("article");
    card.className = "opp-card";
    card.style.setProperty("--compat", `${m.compatibility}%`);
    card.innerHTML = `
      <div class="opp-top">
        <div class="opp-compat" data-tone="${compatTone(m.compatibility)}">${m.compatibility}%</div>
        <div class="opp-heading">
          <h4>${esc(title)}</h4>
          <div class="opp-meta">${meta.filter(Boolean).map(esc).join(" · ")}</div>
        </div>
        <span class="opp-urgency" data-tone="${urgency.tone}">${urgency.label}</span>
      </div>
      ${
        m.reasons?.length
          ? `<div class="opp-reasons">${m.reasons
              .slice(0, 3)
              .map(
                (r) => `<span class="opp-reason">${ICON.check}${esc(r)}</span>`,
              )
              .join("")}</div>`
          : ""
      }
      <div class="opp-actions">
        <button class="opp-btn-ghost" data-detail="${i}">Détails</button>
        ${!isPresta ? `<button class="opp-btn-primary" data-reserve="${i}">${ICON.handshake} Réserver</button>` : ""}
      </div>`;
    wrap.appendChild(card);
  });

  wrap
    .querySelectorAll("[data-detail]")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        openDetailModal(matches[Number(btn.dataset.detail)]),
      ),
    );
  wrap
    .querySelectorAll("[data-reserve]")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        confirmReserve(
          Number(btn.dataset.reserve),
          matches[Number(btn.dataset.reserve)],
        ),
      ),
    );
}

function compatTone(v) {
  if (v >= 80) return "excellent";
  if (v >= 60) return "good";
  if (v >= 40) return "fair";
  return "low";
}

/* ════════════════════════════════════════════════════════════════════════
   PRICING (prestataire) & IDÉES (voyageur)
   ════════════════════════════════════════════════════════════════════════ */

function renderPricing(pricing, explanation) {
  const box = $("pricing-box");
  if (!box) return;
  if (!pricing || pricing.prixRecommande == null) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="pricing-head">
      <span class="pricing-icon">${ICON.bolt}</span>
      <span>Prix recommandé par le moteur</span>
    </div>
    <div class="pricing-amount">${pricing.prixRecommande} €<span class="pricing-discount">-${pricing.remisePourcent}%</span></div>
    ${pricing.heuresRestantes != null ? `<div class="pricing-sub">${pricing.heuresRestantes}h avant le créneau</div>` : ""}
    ${explanation ? `<p class="pricing-explain">${esc(explanation)}</p>` : ""}`;
}

function renderIdeas(ideas) {
  if (!ideas?.length) return;
  clearEmptyState();
  const box = $("conversation");
  const row = document.createElement("div");
  row.className = "msg-row msg-assistant";
  row.innerHTML = `
    <div class="assistant-avatar">${LOGO_SVG}</div>
    <div class="ideas-grid">
      ${ideas
        .map(
          (idea) => `
        <div class="idea-card">
          <span class="idea-tag">${CATEGORY_LABELS[idea.categorie] || idea.categorie || "Idée"}</span>
          <h5>${esc(idea.titre)}</h5>
          <p>${esc(idea.description)}</p>
          <span class="idea-budget">${esc(idea.budgetEstime || "")}</span>
        </div>`,
        )
        .join("")}
    </div>`;
  box.appendChild(row);
  scrollBottom(box);
}

function renderReserveConfirmation(sent, contact) {
  clearEmptyState();
  const box = $("conversation");
  const row = document.createElement("div");
  row.className = "msg-row msg-assistant";
  row.innerHTML = `
    <div class="assistant-avatar">${LOGO_SVG}</div>
    <div class="confirm-card ${sent ? "" : "is-error"}">
      <span class="confirm-icon">${sent ? ICON.check : ICON.close}</span>
      <div>
        <strong>${sent ? "Demande envoyée" : "Échec de l'envoi"}</strong>
        ${sent && contact ? `<p>${esc(contact.name)}${contact.email ? " · " + esc(contact.email) : ""}</p>` : ""}
      </div>
    </div>`;
  box.appendChild(row);
  scrollBottom(box);
}

/* ════════════════════════════════════════════════════════════════════════
   MODALES
   ════════════════════════════════════════════════════════════════════════ */

function openModal(html, className = "") {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "active-modal";
  overlay.innerHTML = `<div class="modal-sheet ${className}">${html}</div>`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  return overlay;
}
function closeModal() {
  const m = $("active-modal");
  if (!m) return;
  m.classList.remove("is-open");
  setTimeout(() => m.remove(), 160);
}

function openDetailModal(m) {
  const isPresta = state.role === "prestataire";
  const urgency = URGENCY_META[m.urgence] || URGENCY_META.indeterminee;
  const breakdown = m.breakdown || {};
  const overlay = openModal(
    `
    <div class="modal-header">
      <h3>${esc(isPresta ? (m.categorie ? CATEGORY_LABELS[m.categorie] : "Demande") : m.activite || CATEGORY_LABELS[m.categorie] || "Expérience")}</h3>
      <button class="modal-close" id="modal-close-btn">${ICON.close}</button>
    </div>
    <div class="modal-body">
      <div class="detail-compat" data-tone="${compatTone(m.compatibility)}">
        <span>${m.compatibility}%</span>
        <small>compatibilité</small>
      </div>
      <div class="detail-grid">
        ${
          isPresta
            ? `
          <div><span>${ICON.pin}</span>${esc(m.ville || "—")}</div>
          <div><span>${ICON.clock}</span>${esc(formatWhen(m.date, m.heure) || "—")}</div>
          <div><span>${ICON.users}</span>${m.nombrePersonnes ?? "—"} personne(s)</div>
          <div><span>${ICON.coin}</span>${m.budgetTotal != null ? m.budgetTotal + " € budget" : "—"}</div>
        `
            : `
          <div><span>${ICON.pin}</span>${esc(m.ville || "—")}</div>
          <div><span>${ICON.clock}</span>${esc(formatWhen(m.date, m.heure) || "—")}</div>
          <div><span>${ICON.users}</span>${m.placesRestantes ?? "—"} places restantes</div>
          <div><span>${ICON.coin}</span>${(m.prixRecommande ?? m.prixHabituel) != null ? (m.prixRecommande ?? m.prixHabituel) + " €" : "—"}</div>
        `
        }
      </div>
      <span class="opp-urgency" data-tone="${urgency.tone}">${urgency.label}</span>
      ${
        Object.keys(breakdown).length
          ? `
        <div class="detail-breakdown">
          ${Object.entries(breakdown)
            .map(
              ([k, v]) => `
            <div class="breakdown-row">
              <span>${breakdownLabel(k)}</span>
              <div class="breakdown-bar"><div style="width:${v}%"></div></div>
              <small>${v}</small>
            </div>`,
            )
            .join("")}
        </div>`
          : ""
      }
      ${m.reasons?.length ? `<div class="opp-reasons">${m.reasons.map((r) => `<span class="opp-reason">${ICON.check}${esc(r)}</span>`).join("")}</div>` : ""}
      ${m.conditions ? `<p class="detail-conditions">${esc(m.conditions)}</p>` : ""}
    </div>
    ${!isPresta ? `<div class="modal-footer"><button class="opp-btn-primary" id="modal-reserve-btn">${ICON.handshake} Mettre en relation</button></div>` : ""}
  `,
    "detail-modal",
  );

  overlay
    .querySelector("#modal-close-btn")
    .addEventListener("click", closeModal);
  overlay.querySelector("#modal-reserve-btn")?.addEventListener("click", () => {
    const idx = state.lastMatches.findIndex(
      (x) => x.username === m.username && x.activite === m.activite,
    );
    closeModal();
    confirmReserve(idx >= 0 ? idx : 0, m);
  });
}

function breakdownLabel(k) {
  const labels = {
    zone: "Zone",
    creneau: "Créneau",
    budget: "Budget",
    personnes: "Personnes",
    type: "Type",
    preferences: "Préférences",
    qualite: "Qualité",
  };
  return labels[k] || k;
}

function confirmReserve(idx, m) {
  const overlay = openModal(
    `
    <div class="modal-header"><h3>Confirmer la mise en relation</h3><button class="modal-close" id="rc-close">${ICON.close}</button></div>
    <div class="modal-body">
      <p>Un message de réservation sera envoyé automatiquement au prestataire pour <strong>${esc(m.activite || CATEGORY_LABELS[m.categorie] || "cette expérience")}</strong>.</p>
    </div>
    <div class="modal-footer">
      <button class="opp-btn-ghost" id="rc-cancel">Annuler</button>
      <button class="opp-btn-primary" id="rc-confirm">${ICON.handshake} Envoyer la demande</button>
    </div>`,
    "confirm-modal",
  );
  overlay.querySelector("#rc-close").addEventListener("click", closeModal);
  overlay.querySelector("#rc-cancel").addEventListener("click", closeModal);
  overlay.querySelector("#rc-confirm").addEventListener("click", () => {
    closeModal();
    sendSpecial({ message: `__ACTION_RESERVE__:${idx}` });
  });
}

function openPublishModal() {
  const c = state.criteria;
  const isPresta = state.role === "prestataire";
  const overlay = openModal(
    `
    <div class="modal-header"><h3>${isPresta ? "Publier votre offre" : "Publier votre recherche"}</h3><button class="modal-close" id="pub-close">${ICON.close}</button></div>
    <div class="modal-body">
      <p class="modal-lead">Voici ce que l'agent a compris. Une fois publié, le marché sera analysé en temps réel.</p>
      <div class="detail-grid">
        ${
          isPresta
            ? `
          <div><span>${ICON.tag}</span>${esc(c.activite || CATEGORY_LABELS[c.categorie] || "—")}</div>
          <div><span>${ICON.pin}</span>${esc(c.ville || "—")}</div>
          <div><span>${ICON.clock}</span>${esc(formatWhen(c.date, c.heure) || "—")}</div>
          <div><span>${ICON.users}</span>${c.placesRestantes ?? "—"} places</div>
          <div><span>${ICON.coin}</span>${c.prixHabituel != null ? c.prixHabituel + " €" : "—"}</div>
        `
            : `
          <div><span>${ICON.pin}</span>${esc(c.ville || c.zone || "—")}</div>
          <div><span>${ICON.clock}</span>${esc(formatWhen(c.date, c.heure) || "—")}</div>
          <div><span>${ICON.users}</span>${c.nombrePersonnes ?? "—"} pers.</div>
          <div><span>${ICON.coin}</span>${c.budgetTotal != null ? c.budgetTotal + " €" : "—"}</div>
        `
        }
      </div>
    </div>
    <div class="modal-footer">
      <button class="opp-btn-ghost" id="pub-edit">Modifier</button>
      <button class="opp-btn-primary" id="pub-confirm">${ICON.check} Publier et analyser le marché</button>
    </div>`,
    "confirm-modal",
  );

  overlay.querySelector("#pub-close").addEventListener("click", closeModal);
  overlay.querySelector("#pub-edit").addEventListener("click", () => {
    closeModal();
    sendSpecial({ message: "__EDIT_CRITERIA__" });
  });
  overlay.querySelector("#pub-confirm").addEventListener("click", async () => {
    closeModal();
    state.published = true;
    const data = await sendSpecial({ message: "__PUBLISH_CONFIRMED__" });
    if (data?.success) renderAnnounceCard(state.criteria);
  });
}

function openCriteriaEditModal() {
  const c = state.criteria;
  const isPresta = state.role === "prestataire";
  const fields = isPresta
    ? [
        ["ville", "Ville", c.ville],
        ["date", "Date", c.date],
        ["heure", "Heure", c.heure],
        ["placesRestantes", "Places restantes", c.placesRestantes],
        ["prixHabituel", "Prix habituel (€)", c.prixHabituel],
      ]
    : [
        ["ville", "Ville", c.ville],
        ["date", "Date", c.date],
        ["heure", "Heure", c.heure],
        ["nombrePersonnes", "Nombre de personnes", c.nombrePersonnes],
        ["budgetTotal", "Budget total (€)", c.budgetTotal],
      ];

  const categorieLabel =
    c.categorieConfirmed && c.categorie
      ? CATEGORY_META[c.categorie]?.label || c.categorie
      : "Non défini";
  const prefTitle = isPresta ? "Atouts mis en avant" : "Préférences";
  const prefLabel = c.preferencesConfirmed
    ? c.preferences || "Aucune préférence"
    : "Non défini";

  const overlay = openModal(
    `
    <div class="modal-header"><h3>Modifier mes critères</h3><button class="modal-close" id="edit-close">${ICON.close}</button></div>
    <div class="modal-body">
      <form id="edit-form" class="edit-form">
        ${fields
          .map(
            ([key, label, val]) => `
          <label class="edit-field">
            <span>${esc(label)}</span>
            <input name="${key}" value="${val != null ? esc(val) : ""}" />
          </label>`,
          )
          .join("")}
      </form>
      <div class="edit-popup-rows">
        <div class="edit-popup-row">
          <div>
            <span class="edit-popup-label">Type d'expérience</span>
            <span class="edit-popup-value">${esc(categorieLabel)}</span>
          </div>
          <button type="button" class="opp-btn-ghost" id="edit-open-categorie">Modifier</button>
        </div>
        <div class="edit-popup-row">
          <div>
            <span class="edit-popup-label">${esc(prefTitle)}</span>
            <span class="edit-popup-value">${esc(prefLabel)}</span>
          </div>
          <button type="button" class="opp-btn-ghost" id="edit-open-preferences">Modifier</button>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="opp-btn-ghost" id="edit-cancel">Annuler</button>
      <button class="opp-btn-primary" id="edit-save">${ICON.check} Relancer le matching</button>
    </div>`,
    "edit-modal",
  );

  overlay.querySelector("#edit-close").addEventListener("click", closeModal);
  overlay.querySelector("#edit-cancel").addEventListener("click", closeModal);
  overlay
    .querySelector("#edit-open-categorie")
    .addEventListener("click", () => {
      closeModal();
      openCategoryModal();
    });
  overlay
    .querySelector("#edit-open-preferences")
    .addEventListener("click", () => {
      closeModal();
      openPreferencesModal();
    });
  overlay.querySelector("#edit-save").addEventListener("click", () => {
    const form = overlay.querySelector("#edit-form");
    const raw = Object.fromEntries(new FormData(form).entries());
    const updatedCriteria = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === "") continue;
      updatedCriteria[k] = [
        "heure",
        "nombrePersonnes",
        "budgetTotal",
        "placesRestantes",
        "prixHabituel",
      ].includes(k)
        ? Number(v)
        : v;
    }
    closeModal();
    sendSpecial({ message: "__CRITERIA_UPDATE__", updatedCriteria });
  });
}
function openCategoryModal(hint) {
  renderCategoryModal([], hint);
}

function buildCategoryModalHTML(path, hint) {
  const atRoot = path.length === 0;
  const meta = atRoot ? null : CATEGORY_META[path[0]];
  const items = atRoot
    ? Object.entries(CATEGORY_META).map(([id, m]) => ({
        id,
        label: m.label,
        icon: m.icon,
        color: m.color,
      }))
    : (meta.subthemes || []).map((s) => ({
        label: s,
        icon: meta.icon,
        color: meta.color,
      }));

  return `
    <div class="modal-header">
      <h3>${atRoot ? "Quel type d'expérience ?" : esc(meta.label)}</h3>
      <button class="modal-close" id="cat-close">${ICON.close}</button>
    </div>
    <div class="modal-body">
      ${atRoot && hint ? `<p class="modal-hint">Vous avez mentionné : « ${esc(hint)} » — choisissez le thème le plus proche.</p>` : ""}
      ${!atRoot ? `<button type="button" class="cat-back" id="cat-back">&larr; Retour aux thèmes</button>` : ""}
      <div class="cat-grid">
        ${items
          .map(
            (it, i) => `
          <button type="button" class="cat-tile" data-idx="${i}" style="--tile-color:${it.color}">
            <span class="cat-tile-icon">${it.icon}</span>
            <span class="cat-tile-label">${esc(it.label)}</span>
          </button>`,
          )
          .join("")}
      </div>
    </div>
    <div class="modal-footer">
      <button class="opp-btn-ghost" id="cat-cancel">Annuler</button>
      <button class="opp-btn-primary" id="cat-confirm" ${atRoot ? "disabled" : ""}>${ICON.check} Confirmer${!atRoot ? " : " + esc(meta.label) : ""}</button>
    </div>`;
}

function renderCategoryModal(path, hint) {
  const existing = $("active-modal");
  const html = buildCategoryModalHTML(path, hint);
  const overlay = existing ? existing : openModal(html, "category-modal");
  if (existing) overlay.querySelector(".modal-sheet").innerHTML = html;
  wireCategoryModal(overlay, path, hint);
}

function wireCategoryModal(overlay, path, hint) {
  overlay.querySelector("#cat-close")?.addEventListener("click", closeModal);
  overlay.querySelector("#cat-cancel")?.addEventListener("click", closeModal);
  overlay
    .querySelector("#cat-back")
    ?.addEventListener("click", () =>
      renderCategoryModal(path.slice(0, -1), hint),
    );
  overlay.querySelectorAll(".cat-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      if (path.length === 0) {
        const id = Object.keys(CATEGORY_META)[idx];
        CATEGORY_META[id].subthemes?.length
          ? renderCategoryModal([id], hint)
          : finalizeCategory(id, null);
      } else {
        finalizeCategory(path[0], CATEGORY_META[path[0]].subthemes[idx]);
      }
    });
  });
  overlay.querySelector("#cat-confirm")?.addEventListener("click", () => {
    if (path.length) finalizeCategory(path[0], null);
  });
}

function finalizeCategory(categorie, sousTheme) {
  closeModal();
  const updatedCriteria = { categorie };
  if (sousTheme) {
    const prev = state.criteria?.preferences || "";
    updatedCriteria.preferences = prev ? `${prev}, ${sousTheme}` : sousTheme;
  }
  sendSpecial({ message: "__CRITERIA_UPDATE__", updatedCriteria });
}

function openPreferencesModal(hint) {
  const isPresta = state.role === "prestataire";
  const tags = PREFERENCE_TAGS[state.role] || PREFERENCE_TAGS.voyageur;
  const current = (state.criteria?.preferences || hint || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const selected = new Set(current.filter((c) => tags.includes(c)));
  const customInitial = current.filter((c) => !tags.includes(c)).join(", ");

  const title = isPresta
    ? "Vos atouts à mettre en avant"
    : "Vos préférences de voyage";
  const lead = isPresta
    ? "Sélectionnez ce qui distingue votre offre — ces atouts sont comparés aux préférences des voyageurs compatibles."
    : "Sélectionnez ce qui compte pour vous — ces préférences sont comparées aux atouts mis en avant par les prestataires.";

  const overlay = openModal(
    `
    <div class="modal-header">
      <h3>${esc(title)}</h3>
      <button class="modal-close" id="pref-close">${ICON.close}</button>
    </div>
    <div class="modal-body">
      <p class="modal-lead">${esc(lead)}</p>
      ${hint ? `<p class="modal-hint">Vous avez mentionné : « ${esc(hint)} » — cochez ce qui s'en rapproche ci-dessous.</p>` : ""}
      <div class="cat-grid pref-grid">
        ${tags
          .map(
            (t) => `
          <button type="button" class="cat-tile pref-tile ${selected.has(t) ? "is-selected" : ""}" data-tag="${esc(t)}">
            <span class="cat-tile-icon">${ICON.check}</span>
            <span class="cat-tile-label">${esc(t)}</span>
          </button>`,
          )
          .join("")}
      </div>
      <label class="edit-field pref-custom">
        <span>Autre chose à préciser (facultatif)</span>
        <input id="pref-custom-input" value="${esc(customInitial)}" placeholder="Ex : proche de la mer, animaux acceptés..." />
      </label>
    </div>
    <div class="modal-footer">
      <button class="opp-btn-ghost" id="pref-skip">Aucune préférence</button>
      <button class="opp-btn-primary" id="pref-confirm">${ICON.check} Confirmer</button>
    </div>`,
    "category-modal",
  );

  overlay.querySelector("#pref-close").addEventListener("click", closeModal);
  overlay.querySelectorAll(".pref-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag;
      selected.has(tag) ? selected.delete(tag) : selected.add(tag);
      btn.classList.toggle("is-selected");
    });
  });
  overlay.querySelector("#pref-skip").addEventListener("click", () => {
    closeModal();
    sendSpecial({
      message: "__CRITERIA_UPDATE__",
      updatedCriteria: { preferences: "" },
    });
  });
  overlay.querySelector("#pref-confirm").addEventListener("click", () => {
    const custom = overlay.querySelector("#pref-custom-input").value.trim();
    const all = [...selected, ...(custom ? [custom] : [])];
    closeModal();
    sendSpecial({
      message: "__CRITERIA_UPDATE__",
      updatedCriteria: { preferences: all.join(", ") },
    });
  });
}

function renderAnnounceCard(criteria) {
  const meta = CATEGORY_META[criteria.categorie] || CATEGORY_META.detente;
  const isPresta = state.role === "prestataire";
  clearEmptyState();
  const box = $("conversation");
  const row = document.createElement("div");
  row.className = "msg-row msg-assistant";
  row.innerHTML = `
    <div class="assistant-avatar">${LOGO_SVG}</div>
    <article class="announce-card" style="--announce-color:${meta.color}">
      <div class="announce-media" style="background-image:url('${meta.image}')">
        <span class="announce-badge">${meta.icon}${esc(meta.label)}</span>
      </div>
      <div class="announce-body">
        <h4>${esc(isPresta ? criteria.activite || meta.label : criteria.ville || criteria.zone || "Votre recherche")}</h4>
        <div class="announce-rows">
          ${announceRow(ICON.pin, criteria.ville || criteria.zone)}
          ${announceRow(ICON.clock, formatWhen(criteria.date, criteria.heure))}
          ${
            isPresta
              ? announceRow(
                  ICON.users,
                  criteria.placesRestantes != null
                    ? criteria.placesRestantes + " places"
                    : null,
                )
              : announceRow(
                  ICON.users,
                  criteria.nombrePersonnes != null
                    ? criteria.nombrePersonnes + " pers."
                    : null,
                )
          }
          ${
            isPresta
              ? announceRow(
                  ICON.coin,
                  criteria.prixHabituel != null
                    ? criteria.prixHabituel + " €"
                    : null,
                )
              : announceRow(
                  ICON.coin,
                  criteria.budgetTotal != null
                    ? criteria.budgetTotal + " € budget"
                    : null,
                )
          }
        </div>
        <button type="button" class="announce-detail-btn" id="announce-detail-btn">Détails</button>
      </div>
    </article>`;
  box.appendChild(row);
  scrollBottom(box);
  row
    .querySelector("#announce-detail-btn")
    .addEventListener("click", () => openAnnounceDetailModal(criteria, meta));
}

function announceRow(icon, value) {
  if (!value) return "";
  return `<div class="announce-row"><span class="announce-icon">${icon}</span><span>${esc(value)}</span></div>`;
}

function openAnnounceDetailModal(c, meta) {
  const isPresta = state.role === "prestataire";
  const overlay = openModal(
    `
    <div class="modal-header"><h3>${esc(meta.label)}</h3><button class="modal-close" id="ad-close">${ICON.close}</button></div>
    <div class="modal-body">
      <div class="detail-grid">
        <div><span>${ICON.pin}</span>${esc(c.ville || c.zone || "—")}</div>
        <div><span>${ICON.clock}</span>${esc(formatWhen(c.date, c.heure) || "—")}</div>
        <div><span>${ICON.users}</span>${isPresta ? (c.placesRestantes ?? "—") + " places" : (c.nombrePersonnes ?? "—") + " pers."}</div>
        <div><span>${ICON.coin}</span>${isPresta ? (c.prixHabituel != null ? c.prixHabituel + " €" : "—") : c.budgetTotal != null ? c.budgetTotal + " €" : "—"}</div>
      </div>
            ${
              c.preferences
                ? `<p class="detail-conditions"><strong>${isPresta ? "Atouts" : "Préférences"} :</strong> ${esc(c.preferences)}</p>`
                : ""
            }
    </div>`,
    "detail-modal",
  );
  overlay.querySelector("#ad-close").addEventListener("click", closeModal);
}
/* ════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS
   ════════════════════════════════════════════════════════════════════════ */

async function loadNotifications() {
  const res = await api("/api/voyage/notifications");
  const list = Array.isArray(res?.notifications) ? res.notifications : [];
  const unread = list.filter((n) => !n.read).length;
  const dot = $("notif-dot");
  if (dot) dot.classList.toggle("hidden", unread === 0);
  return list;
}

function toggleNotifPanel() {
  const existing = $("notif-panel");
  if (existing) {
    existing.remove();
    return;
  }
  loadNotifications().then((list) => {
    const panel = document.createElement("div");
    panel.id = "notif-panel";
    panel.className = "notif-panel";
    panel.innerHTML = list.length
      ? list
          .slice(0, 8)
          .map(
            (n) => `
          <div class="notif-item ${n.read ? "" : "is-unread"}">
            <strong>${esc(n.title)}</strong>
            <p>${esc(n.body)}</p>
          </div>`,
          )
          .join("")
      : `<div class="notif-empty">Aucune notification.</div>`;
    $("notif-anchor").appendChild(panel);
    api("/api/voyage/notifications/read", { method: "POST", body: {} });
    $("notif-dot")?.classList.add("hidden");
    setTimeout(
      () =>
        document.addEventListener("click", function onDoc(e) {
          if (!panel.contains(e.target) && e.target.id !== "notif-btn") {
            panel.remove();
            document.removeEventListener("click", onDoc);
          }
        }),
      0,
    );
  });
}

/* ════════════════════════════════════════════════════════════════════════
   BOUTON "REVENIR EN BAS"
   ════════════════════════════════════════════════════════════════════════ */

function initScrollButton() {
  const box = $("conversation");
  const btn = $("scroll-bottom-btn");
  if (!box || !btn) return;

  const check = () => {
    const distance = box.scrollHeight - box.scrollTop - box.clientHeight;
    btn.classList.toggle("is-visible", distance > 160);
  };

  box.addEventListener("scroll", check, { passive: true });
  new MutationObserver(check).observe(box, { childList: true, subtree: true });
  window.addEventListener("resize", check);

  btn.addEventListener("click", () => {
    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  });

  check();
}

/* ════════════════════════════════════════════════════════════════════════
   COMPOSER
   ════════════════════════════════════════════════════════════════════════ */

function initComposer() {
  const input = $("composer-input");
  const sendBtn = $("composer-send");

  function doSend() {
    const text = input.value.trim();
    if (!text && !state.attachments.length) return;
    input.value = "";
    input.style.height = "auto";
    sendBtn.classList.remove("is-ready");
    sendMessage(text);
  }

  sendBtn.addEventListener("click", doSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
    sendBtn.classList.toggle("is-ready", input.value.trim().length > 0);
  });

  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      input.value = chip.dataset.prompt || chip.textContent.trim();
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
  });
}

/* ════════════════════════════════════════════════════════════════════════
   EMPTY STATE
   ════════════════════════════════════════════════════════════════════════ */

function emptyStateHTML() {
  const isPresta = state.role === "prestataire";
  const prompts = isPresta
    ? [
        {
          icon: ICON.tag,
          title: "Publier une capacité",
          prompt: "J'ai des places disponibles à publier pour demain.",
        },
        {
          icon: ICON.bolt,
          title: "Vendre un créneau urgent",
          prompt:
            "Il me reste des places sur un créneau qui part bientôt, aidez-moi à les vendre.",
        },
        {
          icon: ICON.coin,
          title: "Connaître le bon prix",
          prompt: "Quel prix recommandez-vous pour mon offre ?",
        },
      ]
    : [
        {
          icon: ICON.compass,
          title: "Trouver une expérience",
          prompt: "Je cherche une activité sympa pour demain après-midi.",
        },
        {
          icon: ICON.bolt,
          title: "Bonne affaire de dernière minute",
          prompt: "Je veux une bonne affaire de dernière minute près de moi.",
        },
        {
          icon: ICON.spark,
          title: "Me faire inspirer",
          prompt: "Je n'ai pas d'idée précise, inspirez-moi pour ce week-end.",
        },
      ];
  return `
    <div class="empty-state">
      <div class="empty-badge"><span class="pulse-dot"></span>Marché touristique — analyse en direct</div>
      <h1>${isPresta ? "Vendez votre capacité<br/>avant qu'elle ne se perde." : "Trouvez l'expérience<br/>qui vous correspond."}</h1>
      <p>${
        isPresta
          ? "Décrivez votre offre — l'agent structure votre annonce, calcule le prix optimal et vous met en relation avec les voyageurs compatibles."
          : "Décrivez votre envie — l'agent comprend votre contexte et interroge le marché en temps réel pour trouver les meilleures opportunités."
      }</p>
      <div class="empty-chips">
        ${prompts.map((p) => `<button class="suggestion-chip" data-prompt="${esc(p.prompt)}"><span>${p.icon}</span>${esc(p.title)}</button>`).join("")}
      </div>
    </div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   SIDEBAR / HEADER
   ════════════════════════════════════════════════════════════════════════ */

function updateIdentity() {
  const u = state.user;
  if (!u) return;
  $("user-name").textContent = u.username;
  $("user-role").textContent =
    state.role === "prestataire" ? "Prestataire" : "Voyageur";
  $("user-avatar").textContent = u.username.slice(0, 2).toUpperCase();
  document.body.setAttribute("data-role", state.role);
}

function newSearch() {
  state.criteria = {};
  state.phase = "gathering";
  state.published = false;
  state.history = [];
  state.lastMatches = [];
  clearAttachments();
  persist("criteria", {});
  persist("phase", "gathering");
  persist("history", []);
  persist("matches", []);
  $("conversation").innerHTML = emptyStateHTML();
  $("opportunities").innerHTML = "";
  $("pricing-box").classList.add("hidden");
  updatePanel();
  updateMissingHint(null);
  refreshActionAvailability();
}

/* ════════════════════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════════════════════ */

async function boot() {
  updateIdentity();

  const profileRes = await api("/api/voyage/profile");
  if (profileRes?.success) {
    state.criteria = profileRes.criteria || {};
    state.phase = profileRes.phase || "gathering";
    state.published = !!profileRes.published;
  }

  state.history = recall("history", []);
  state.lastMatches = recall("matches", []);

  const box = $("conversation");
  box.innerHTML = "";
  if (state.history.length) {
    state.history.forEach((m) =>
      addMessage(m.text, m.from, {
        persist: false,
        attachments: m.attachments || [],
      }),
    );
  } else {
    box.innerHTML = emptyStateHTML();
  }

  updatePanel();
  if (state.lastMatches.length) renderMatches(state.lastMatches);
  refreshActionAvailability();

  const cats = await api("/api/voyage/categories");
  if (cats?.success) state.categories = cats.categories;

  loadNotifications();
  initComposer();
  initAttachments();
  initScrollButton();

  $("btn-new-search")?.addEventListener("click", newSearch);
  $("btn-ideas")?.addEventListener("click", () =>
    sendSpecial({ message: "__ACTION_IDEAS__" }),
  );
  // Seul point d'entrée pour éditer les critères, y compris pour rouvrir
  // les pop-ups categorie/préférences : le crayon dans l'en-tête du panel.
  $("btn-edit-panel")?.addEventListener("click", openCriteriaEditModal);
  $("notif-btn")?.addEventListener("click", toggleNotifPanel);
  $("btn-logout")?.addEventListener("click", voluntaryLogout);
  document.body.classList.remove("is-loading");
}

function init() {
  initTheme();
  if (!restoreSession()) {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = "./login-voyage.html";
    return;
  }
  boot();
}

document.addEventListener("DOMContentLoaded", init);
