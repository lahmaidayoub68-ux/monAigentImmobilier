import { computeSlots } from "./slots.js";

/* ════════════════════════════════════════════════════════════════════
   Ce site fonctionne SANS clé IA : les parcours (pop-ups successifs) sont
   une machine à états. Avec une clé (AI_API_KEY), l'agent accompagne chaque
   étape et répond librement dans le chat.
   Tout le contenu (textes, horaires, carte, étapes) vient de data/site.json.
   ════════════════════════════════════════════════════════════════════ */

const PREVIEW = window.__AIGENT_PREVIEW__ || null; // aperçu hébergé par AiGENT : rien n'est enregistré
const NS = "aig:" + location.pathname;
const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const local = {
  get: (k) => safe(() => localStorage.getItem(NS + k)),
  set: (k, v) =>
    safe(() =>
      v == null
        ? localStorage.removeItem(NS + k)
        : localStorage.setItem(NS + k, v),
    ),
};
const tab = {
  get: (k) => safe(() => sessionStorage.getItem(NS + k)),
  set: (k, v) =>
    safe(() =>
      v == null
        ? sessionStorage.removeItem(NS + k)
        : sessionStorage.setItem(NS + k, v),
    ),
};

const root = document.getElementById("root");
const layer = document.getElementById("layer");

/* ── Petites aides ───────────────────────────────────────────────── */

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function")
      el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5z"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevL: '<path d="M14 6l-6 6 6 6"/>',
  chevR: '<path d="M10 6l6 6-6 6"/>',
};
function icon(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "ico");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name];
  return s;
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (s) => new Date(s + "T12:00:00");
const fmtDate = (s, o = { weekday: "long", day: "numeric", month: "long" }) =>
  dateOf(s).toLocaleDateString("fr-FR", o);
const fmtTime = (t) => String(t).replace(":", "h");
const eur = (n) =>
  n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });
const DAYS = [
  ["mon", "Lundi"],
  ["tue", "Mardi"],
  ["wed", "Mercredi"],
  ["thu", "Jeudi"],
  ["fri", "Vendredi"],
  ["sat", "Samedi"],
  ["sun", "Dimanche"],
];
const plural = (n, unit) => `${n} ${n > 1 ? unit[1] : unit[0]}`;

/** Texte de l'agent → nœuds DOM sûrs (aucun HTML injecté, gras et listes uniquement). */
function inline(text) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p) =>
      /^\*\*[^*]+\*\*$/.test(p)
        ? h("strong", {}, p.slice(2, -2))
        : p.replace(/\*/g, ""),
    );
}
function rich(text) {
  const out = [];
  let list = null;
  for (const raw of String(text || "")
    .replace(/\r/g, "")
    .split("\n")) {
    const m = raw.match(/^\s*[-•]\s+(.*)$/);
    if (m) {
      if (!list) {
        list = h("ul");
        out.push(list);
      }
      list.append(h("li", {}, inline(m[1])));
      continue;
    }
    list = null;
    out.push(
      raw.trim() ? h("p", {}, inline(raw.trim())) : h("div", { class: "gap" }),
    );
  }
  return out;
}

/* ── État ────────────────────────────────────────────────────────── */

const S = {
  site: null,
  user: null,
  token: null,
  view: "cover",
  authMode: "register",
  authEmail: "",
  after: null,
  flow: null,
  chat: { open: false, msgs: [], busy: false },
};
const needsLogin = () => S.site.runtime?.requireLogin !== false;
const chatEnabled = () => S.site.features?.chat !== false;
const flows = () => S.site.flows || [];
const business = () => S.site.business || {};
const firstName = () => (S.user?.name || "").split(" ")[0];

/* ── API ─────────────────────────────────────────────────────────── */

async function http(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (S.token) headers.Authorization = "Bearer " + S.token;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && S.token)
      logout("Votre session a expiré. Reconnectez-vous.");
    throw Object.assign(
      new Error(data.message || "Une erreur est survenue. Réessayez."),
      { status: res.status, data },
    );
  }
  return data;
}

const api = {
  site: async () =>
    window.__SITE__
      ? { ...window.__SITE__, runtime: { ai: false, requireLogin: true } }
      : http("/api/site"),
  auth: async (mode, form) => {
    if (PREVIEW)
      return {
        token: "preview",
        user: {
          id: "preview",
          name: form.name || form.email.split("@")[0],
          email: form.email,
        },
      };
    return http("/api/auth/" + mode, { method: "POST", body: form });
  },
  submit: async (flow, data) => {
    if (PREVIEW)
      return {
        ok: true,
        reference: "APERCU",
        title: flow.success?.title,
        message: flow.success?.message,
        preview: true,
      };
    return http(`/api/flows/${flow.id}/submit`, {
      method: "POST",
      body: { data },
    });
  },
  assist: (flowId, stepId, data) =>
    http("/api/assist", { method: "POST", body: { flowId, stepId, data } }),
  chat: async (message, history) => {
    if (PREVIEW) {
      const res = await fetch(PREVIEW.chat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "indisponible");
      return { reply: data.reply, sources: [], mode: "ai" };
    }
    return http("/api/chat", { method: "POST", body: { message, history } });
  },
};

/* ════════════════════════════════════════════════════════════════════
   NAVIGATION
   ════════════════════════════════════════════════════════════════════ */

function go(view) {
  S.view = view;
  render();
  window.scrollTo({ top: 0 });
}
function goAuth(mode) {
  S.authMode = mode;
  go("auth");
}
function saveSession(token, user) {
  S.token = token;
  S.user = user;
  local.set("token", token);
  local.set("user", JSON.stringify(user));
}
function logout(message) {
  S.token = null;
  S.user = null;
  local.set("token", null);
  local.set("user", null);
  tab.set("auto", null);
  closeFlow();
  toggleChat(false);
  S.chat.msgs = [];
  S.authNotice = typeof message === "string" ? message : "";
  go(S.authNotice ? "auth" : "cover");
}

/** Lance un parcours ; demande d'abord de se connecter si le site l'exige. */
function start(flowId, preset) {
  if (needsLogin() && !S.user) {
    S.after = () => openFlow(flowId, preset);
    return goAuth("register");
  }
  openFlow(flowId, preset);
}

function afterLogin() {
  const next = S.after;
  S.after = null;
  go("home");
  if (next) return next();
  const first = flows()[0];
  if (first && !tab.get("auto")) {
    tab.set("auto", "1");
    openFlow(first.id); // l'utilisateur arrive directement sur la première question
  }
}

/* ════════════════════════════════════════════════════════════════════
   PAGES
   ════════════════════════════════════════════════════════════════════ */

function mark() {
  return h(
    "span",
    { class: "mark", "aria-hidden": "true" },
    (S.site.brand.name || "A").trim().charAt(0).toUpperCase(),
  );
}

function header() {
  const { brand } = S.site;
  return h(
    "header",
    { class: "top" },
    h(
      "button",
      {
        class: "brand",
        type: "button",
        onclick: () => go(S.user ? "home" : "cover"),
      },
      mark(),
      h("span", { class: "brand-name" }, brand.name),
    ),
    h(
      "nav",
      { class: "top-nav", "aria-label": "Navigation" },
      chatEnabled() &&
        h(
          "button",
          {
            class: "btn ghost sm",
            type: "button",
            onclick: () => toggleChat(true),
          },
          icon("chat"),
          "Une question ?",
        ),
      S.user
        ? [
            h("span", { class: "who" }, S.user.name),
            h(
              "button",
              {
                class: "btn ghost sm",
                type: "button",
                onclick: () => logout(),
              },
              "Se déconnecter",
            ),
          ]
        : [
            h(
              "button",
              {
                class: "btn ghost sm",
                type: "button",
                onclick: () => goAuth("login"),
              },
              "Se connecter",
            ),
            needsLogin() &&
              h(
                "button",
                {
                  class: "btn sm",
                  type: "button",
                  onclick: () => goAuth("register"),
                },
                "Créer un compte",
              ),
          ],
    ),
  );
}

function sampleBar() {
  if (!S.site.meta?.sample) return null;
  return h(
    "div",
    { class: "sample-bar" },
    PREVIEW
      ? "Aperçu : les horaires, la carte et les textes sont des exemples, remplacez-les dans data/site.json."
      : "Contenu d'exemple. Modifiez data/site.json, puis retirez « sample » pour masquer ce bandeau.",
  );
}

function hoursBlock() {
  const hours = business().hours;
  if (!hours || !Object.values(hours).some((r) => r?.length)) return null;
  return h(
    "dl",
    { class: "hours" },
    DAYS.map(([k, label]) => [
      h("dt", {}, label),
      h(
        "dd",
        { class: hours[k]?.length ? "" : "closed" },
        hours[k]?.length
          ? hours[k]
              .map((r) => r.replace(/:/g, "h").replace("-", " – "))
              .join(" · ")
          : "Fermé",
      ),
    ]),
  );
}

function contactLines() {
  const b = business();
  return [
    b.address && h("p", {}, b.address),
    b.phone &&
      h(
        "p",
        {},
        h("a", { href: "tel:" + b.phone.replace(/[^+\d]/g, "") }, b.phone),
      ),
    b.email && h("p", {}, h("a", { href: "mailto:" + b.email }, b.email)),
  ];
}

function infoBand() {
  const hours = hoursBlock();
  const contact = contactLines().filter(Boolean);
  if (!hours && !contact.length) return null;
  return h(
    "section",
    { class: "band" },
    hours && h("div", {}, h("h2", { class: "band-title" }, "Horaires"), hours),
    contact.length > 0 &&
      h("div", {}, h("h2", { class: "band-title" }, "Nous trouver"), contact),
  );
}

function menuBlock() {
  const menu = business().menu || [];
  if (!menu.length) return null;
  const groups = new Map();
  menu.forEach((m) =>
    groups.set(m.category || "Carte", [
      ...(groups.get(m.category || "Carte") || []),
      m,
    ]),
  );
  return h(
    "section",
    { class: "menu" },
    h("h2", { class: "band-title" }, "La carte"),
    h(
      "div",
      { class: "menu-cols" },
      [...groups].map(([cat, items]) =>
        h(
          "div",
          { class: "menu-group" },
          h("h3", {}, cat),
          items.map((m) =>
            h(
              "div",
              { class: "menu-item" },
              h(
                "div",
                { class: "menu-line" },
                h("span", { class: "menu-name" }, m.name),
                typeof m.price === "number" &&
                  h("span", { class: "menu-price" }, eur(m.price)),
              ),
              m.description && h("p", {}, m.description),
              (m.tags || []).length > 0 && h("small", {}, m.tags.join(" · ")),
            ),
          ),
        ),
      ),
    ),
  );
}

/** Carte du hero : les 7 prochains jours réservables, cliquables. Sans étape « date », liste des étapes. */
function heroCard(flow) {
  if (!flow) return null;
  const hasDate = flow.steps.some((s) => s.type === "date");
  if (!hasDate) {
    const steps = flow.steps.filter((s) => s.type !== "summary");
    return h(
      "aside",
      { class: "hero-card" },
      h("h2", {}, flow.title),
      h(
        "ol",
        { class: "steps-list" },
        steps.map((s) => h("li", {}, s.title)),
      ),
      h(
        "button",
        { class: "btn wide", type: "button", onclick: () => start(flow.id) },
        flow.cta || "Commencer",
      ),
    );
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from(
    { length: 7 },
    (_, i) => new Date(today.getTime() + i * 86400000),
  );
  return h(
    "aside",
    { class: "hero-card" },
    h("h2", {}, flow.title),
    h("p", { class: "muted" }, "Choisissez un jour pour commencer."),
    h(
      "div",
      { class: "week" },
      days.map((d) => {
        const key = ymd(d);
        const open = computeSlots(business(), key).length > 0;
        return h(
          "button",
          {
            class: "week-day",
            type: "button",
            disabled: !open,
            onclick: () => start(flow.id, { date: key }),
            "aria-label": fmtDate(key) + (open ? "" : ", indisponible"),
          },
          h(
            "span",
            { class: "wd" },
            d
              .toLocaleDateString("fr-FR", { weekday: "short" })
              .replace(".", ""),
          ),
          h("span", { class: "dn" }, String(d.getDate())),
        );
      }),
    ),
    h(
      "button",
      { class: "link", type: "button", onclick: () => start(flow.id) },
      "Voir toutes les dates",
    ),
  );
}

function coverView() {
  const c = S.site.cover || {};
  const main = flows()[0];
  const primary = main
    ? h(
        "button",
        { class: "btn lg", type: "button", onclick: () => start(main.id) },
        c.cta || main.cta || "Commencer",
      )
    : h(
        "button",
        {
          class: "btn lg",
          type: "button",
          onclick: () =>
            needsLogin() && !S.user ? goAuth("register") : toggleChat(true),
        },
        c.cta || "Poser une question",
      );
  return h(
    "div",
    { class: "page" },
    header(),
    h(
      "main",
      {},
      h(
        "section",
        { class: "hero" },
        h(
          "div",
          { class: "hero-copy" },
          c.eyebrow && h("p", { class: "eyebrow" }, c.eyebrow),
          h("h1", {}, c.headline || S.site.brand.name),
          c.subline && h("p", { class: "lead" }, c.subline),
          h(
            "div",
            { class: "hero-actions" },
            primary,
            !S.user &&
              needsLogin() &&
              h(
                "button",
                {
                  class: "btn ghost lg",
                  type: "button",
                  onclick: () => goAuth("login"),
                },
                "J'ai déjà un compte",
              ),
          ),
        ),
        heroCard(main),
      ),
      (c.highlights || []).length > 0 &&
        h(
          "section",
          { class: "highlights" },
          c.highlights.map((x) =>
            h("div", {}, h("h3", {}, x.title), x.text && h("p", {}, x.text)),
          ),
        ),
      menuBlock(),
      infoBand(),
    ),
    footer(),
  );
}

function footer() {
  return h(
    "footer",
    { class: "foot" },
    h("span", {}, "© " + new Date().getFullYear() + " " + S.site.brand.name),
    h("span", { class: "muted" }, "Créé avec AiGENT"),
  );
}

/* ── Connexion / création de compte ──────────────────────────────── */

function authView() {
  const register = S.authMode === "register";
  const errBox = h(
    "p",
    { class: "form-error", role: "alert" },
    S.authNotice || "",
  );
  S.authNotice = "";
  const fields = {};
  const field = (name, label, type, autocomplete, hint) => {
    const input = h("input", {
      id: "f-" + name,
      name,
      type,
      autocomplete,
      required: true,
      value: name === "email" ? S.authEmail : "",
      "aria-describedby": "e-" + name,
    });
    fields[name] = input;
    return h(
      "div",
      { class: "field" },
      h("label", { for: "f-" + name }, label),
      input,
      hint && h("small", { class: "muted" }, hint),
      h("small", { class: "field-error", id: "e-" + name }),
    );
  };
  const submit = h(
    "button",
    { class: "btn wide", type: "submit" },
    register ? "Créer mon compte" : "Se connecter",
  );

  const form = h(
    "form",
    {
      class: "auth-form",
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        Object.values(fields).forEach((i) => {
          i.setAttribute("aria-invalid", "false");
          document.getElementById("e-" + i.name).textContent = "";
        });
        errBox.textContent = "";
        const body = Object.fromEntries(
          Object.entries(fields).map(([k, i]) => [k, i.value.trim()]),
        );
        body.password = fields.password.value;
        S.authEmail = body.email;
        const problem = !/^\S+@\S+\.\S{2,}$/.test(body.email)
          ? ["email", "Adresse e-mail invalide."]
          : register && body.name.length < 2
            ? ["name", "Indiquez votre prénom."]
            : register && body.password.length < 8
              ? ["password", "Au moins 8 caractères."]
              : !body.password
                ? ["password", "Saisissez votre mot de passe."]
                : null;
        if (problem) {
          fields[problem[0]].setAttribute("aria-invalid", "true");
          document.getElementById("e-" + problem[0]).textContent = problem[1];
          fields[problem[0]].focus();
          return;
        }
        submit.disabled = true;
        try {
          const res = await api.auth(register ? "register" : "login", body);
          saveSession(res.token, res.user);
          afterLogin();
        } catch (err) {
          if (err.data?.field && fields[err.data.field]) {
            document.getElementById("e-" + err.data.field).textContent =
              err.message;
            fields[err.data.field].setAttribute("aria-invalid", "true");
          } else errBox.textContent = err.message;
          submit.disabled = false;
        }
      },
    },
    register && field("name", "Prénom", "text", "given-name"),
    field("email", "Adresse e-mail", "email", "email"),
    field(
      "password",
      "Mot de passe",
      "password",
      register ? "new-password" : "current-password",
      register ? "8 caractères minimum" : null,
    ),
    errBox,
    submit,
  );

  const reasons =
    flows()[0]?.kind === "booking"
      ? [
          "Retrouvez vos demandes au même endroit",
          "Réservez sans ressaisir vos coordonnées",
          "Recevez la confirmation de l'équipe",
        ]
      : [
          "Vos échanges sont rattachés à votre compte",
          "Vos coordonnées sont préremplies",
          "L'équipe vous répond directement",
        ];

  return h(
    "div",
    { class: "auth" },
    h(
      "aside",
      { class: "auth-side" },
      h(
        "button",
        { class: "brand", type: "button", onclick: () => go("cover") },
        mark(),
        h("span", { class: "brand-name" }, S.site.brand.name),
      ),
      h(
        "div",
        {},
        h(
          "p",
          { class: "auth-claim" },
          S.site.cover?.headline || S.site.brand.name,
        ),
        h(
          "ul",
          { class: "ticks" },
          reasons.map((r) => h("li", {}, icon("check"), r)),
        ),
      ),
    ),
    h(
      "main",
      { class: "auth-main" },
      h(
        "div",
        { class: "auth-card" },
        h(
          "div",
          { class: "tabs", role: "tablist" },
          ["register", "login"].map((m) =>
            h(
              "button",
              {
                class: "tab" + (S.authMode === m ? " on" : ""),
                role: "tab",
                "aria-selected": String(S.authMode === m),
                type: "button",
                onclick: () => {
                  S.authMode = m;
                  render();
                },
              },
              m === "register" ? "Créer un compte" : "Se connecter",
            ),
          ),
        ),
        h("h1", {}, register ? "Bienvenue" : "Bon retour"),
        h(
          "p",
          { class: "muted" },
          register
            ? "Un compte suffit pour commencer."
            : "Retrouvez votre espace.",
        ),
        form,
        !needsLogin() &&
          h(
            "button",
            { class: "link", type: "button", onclick: () => go("cover") },
            "Continuer sans compte",
          ),
      ),
    ),
  );
}

/* ── Espace connecté ─────────────────────────────────────────────── */

function requests() {
  return safe(() => JSON.parse(local.get("requests") || "[]"), []);
}
function rememberRequest(entry) {
  local.set("requests", JSON.stringify([entry, ...requests()].slice(0, 6)));
}

function homeView() {
  const list = requests();
  return h(
    "div",
    { class: "page" },
    header(),
    h(
      "main",
      { class: "home" },
      h(
        "h1",
        { class: "home-title" },
        firstName() ? `Bonjour ${firstName()}` : "Bonjour",
      ),
      h(
        "p",
        { class: "lead" },
        flows().length
          ? "Que souhaitez-vous faire ?"
          : "Posez votre question à l'assistant.",
      ),
      flows().length > 0 &&
        h(
          "section",
          { class: "actions" },
          flows().map((f) =>
            h(
              "div",
              { class: "action-row" },
              h("div", {}, h("h2", {}, f.title), h("p", {}, f.description)),
              h(
                "button",
                { class: "btn", type: "button", onclick: () => openFlow(f.id) },
                f.cta || "Commencer",
              ),
            ),
          ),
        ),
      list.length > 0 &&
        h(
          "section",
          { class: "recent" },
          h("h2", { class: "band-title" }, "Vos dernières demandes"),
          list.map((r) =>
            h(
              "div",
              { class: "recent-row" },
              h("div", {}, h("strong", {}, r.title), h("p", {}, r.summary)),
              h("span", { class: "ref" }, r.reference),
            ),
          ),
        ),
      menuBlock(),
      infoBand(),
    ),
    footer(),
  );
}

function render() {
  if (!S.site) return;
  const view =
    S.view === "auth"
      ? authView()
      : S.view === "home" && S.user
        ? homeView()
        : coverView();
  root.replaceChildren(...[sampleBar(), view].filter(Boolean));
}

/* ════════════════════════════════════════════════════════════════════
   PARCOURS À POP-UPS (machine à états)
   ════════════════════════════════════════════════════════════════════ */

const fieldsOf = (step) =>
  step.type === "contact"
    ? ["name", "phone", "email"]
    : step.field
      ? [step.field]
      : [];
const isOptional = (step) => step.required === false && step.type !== "summary";

function draftKey(id) {
  return "draft:" + id;
}
function persist() {
  const st = S.flow;
  if (st && !st.done)
    tab.set(draftKey(st.flow.id), JSON.stringify({ i: st.i, data: st.data }));
}

function openFlow(id, preset = {}) {
  const flow = flows().find((f) => f.id === id);
  if (!flow) return;
  const steps = flow.steps.filter(
    (s) => s.type !== "dishes" || (business().menu || []).length,
  );
  const data = {};
  for (const s of steps)
    if (s.type === "number") data[s.field] = s.default ?? s.min ?? 1;
  if (S.user) {
    data.name = S.user.name;
    if (S.user.email && S.user.id !== "preview") data.email = S.user.email;
  }
  let i = 0;
  const draft = safe(() => JSON.parse(tab.get(draftKey(id))));
  if (draft && !preset.date) {
    Object.assign(data, draft.data);
    i = Math.min(draft.i, steps.length - 1);
  }
  if (preset.date) {
    data.date = preset.date;
    i = Math.max(
      0,
      steps.findIndex((s) => s.type === "time"),
    );
  }
  S.flow = {
    flow,
    steps,
    i,
    data,
    errors: {},
    busy: false,
    done: null,
    cal: null,
    cat: 0,
    say: {},
    opener: document.activeElement,
    announce: true,
  };
  document.body.classList.add("locked");
  renderFlow(true);
}

function closeFlow() {
  if (!S.flow) return;
  const opener = S.flow.opener;
  S.flow = null;
  layer.querySelector(".overlay")?.remove();
  document.body.classList.remove("locked");
  if (S.chat.open) return;
  safe(() => opener?.focus?.());
}

/** Renvoie le message d'erreur d'une étape, ou null si elle est valide. */
function check(step, data) {
  const v = data[step.field];
  switch (step.type) {
    case "date":
      return v && computeSlots(business(), v).length
        ? null
        : "Choisissez un jour disponible.";
    case "time":
      return v && computeSlots(business(), data.date || "").includes(v)
        ? null
        : "Choisissez un créneau.";
    case "number":
      return Number.isInteger(v) &&
        v >= (step.min ?? 1) &&
        v <= (step.max ?? 100)
        ? null
        : "Indiquez un nombre valide.";
    case "choice":
      return v || isOptional(step) ? null : "Faites un choix.";
    case "text":
    case "textarea":
      return String(v || "").trim() || isOptional(step)
        ? null
        : "Ce champ est requis.";
    case "contact": {
      const errs = {};
      if (String(data.name || "").trim().length < 2)
        errs.name = "Indiquez votre nom.";
      if (data.phone && !/^[+()\d\s.-]{6,20}$/.test(data.phone.trim()))
        errs.phone = "Numéro invalide.";
      if (data.email && !/^\S+@\S+\.\S{2,}$/.test(data.email.trim()))
        errs.email = "Adresse invalide.";
      if (!String(data.phone || "").trim() && !String(data.email || "").trim())
        errs.phone = "Laissez un téléphone ou un e-mail pour vous répondre.";
      return Object.keys(errs).length ? errs : null;
    }
    default:
      return null;
  }
}

function setValue(step, value) {
  const st = S.flow;
  st.data[step.field] = value;
  st.errors = {};
  if (
    step.type === "date" &&
    st.data.time &&
    !computeSlots(business(), value).includes(st.data.time)
  )
    delete st.data.time;
  persist();
}

function summaryRows(st) {
  const rows = [];
  st.steps.forEach((s, index) => {
    const d = st.data;
    let value = null;
    if (s.type === "date" && d[s.field]) value = fmtDate(d[s.field]);
    else if (s.type === "time" && d[s.field]) value = fmtTime(d[s.field]);
    else if (s.type === "number" && d[s.field])
      value = plural(d[s.field], s.unit || ["", ""]).trim();
    else if (s.type === "dishes" && (d[s.field] || []).length)
      value = d[s.field]
        .map(
          (x) =>
            `${x.qty} × ${(business().menu || []).find((m) => m.id === x.id)?.name || x.id}`,
        )
        .join(", ");
    else if (s.type === "contact")
      value = [d.name, d.phone, d.email].filter(Boolean).join(" · ");
    else if (["text", "textarea"].includes(s.type) && d[s.field])
      value = d[s.field];
    else if (s.type === "choice" && d[s.field])
      value =
        (s.options || []).find((o) => o.value === d[s.field])?.label ||
        d[s.field];
    if (value)
      rows.push({
        label: s.label || s.title.replace(/\s*\?$/, ""),
        value,
        index,
      });
  });
  return rows;
}

function dishesTotal(st) {
  const menu = business().menu || [];
  const picked = st.data.dishes || [];
  if (!picked.length) return null;
  let total = 0;
  for (const p of picked) {
    const price = menu.find((m) => m.id === p.id)?.price;
    if (typeof price !== "number") return null;
    total += price * p.qty;
  }
  return total;
}

/* ── Corps de chaque type d'étape ────────────────────────────────── */

function stepBody(st, step) {
  const err = (f) =>
    st.errors[f] &&
    h("p", { class: "field-error", role: "alert" }, st.errors[f]);
  switch (step.type) {
    case "date":
      return dateBody(st, step);
    case "time":
      return timeBody(st, step);
    case "number":
      return numberBody(st, step);
    case "dishes":
      return dishesBody(st, step);
    case "choice":
      return h(
        "div",
        { class: "choices" },
        (step.options || []).map((o) =>
          h(
            "button",
            {
              class: "choice" + (st.data[step.field] === o.value ? " on" : ""),
              type: "button",
              "data-key": "c:" + o.value,
              onclick: () => {
                setValue(step, o.value);
                renderFlow(false);
                setTimeout(() => next(), 180);
              },
            },
            h("strong", {}, o.label),
            o.description && h("span", {}, o.description),
          ),
        ),
        err(step.field),
      );
    case "text":
      return h(
        "div",
        { class: "field" },
        h("input", {
          class: "big-input",
          type: "text",
          "aria-label": step.title,
          placeholder: step.placeholder || "",
          value: st.data[step.field] || "",
          oninput: (e) => {
            st.data[step.field] = e.target.value;
            persist();
          },
        }),
        err(step.field),
      );
    case "textarea":
      return h(
        "div",
        { class: "field" },
        h(
          "textarea",
          {
            rows: 4,
            "aria-label": step.title,
            placeholder: step.placeholder || "",
            oninput: (e) => {
              st.data[step.field] = e.target.value;
              persist();
            },
          },
          st.data[step.field] || "",
        ),
        err(step.field),
      );
    case "contact": {
      const f = (name, label, type, ac) =>
        h(
          "div",
          { class: "field" },
          h("label", { for: "c-" + name }, label),
          h("input", {
            id: "c-" + name,
            type,
            autocomplete: ac,
            value: st.data[name] || "",
            "aria-invalid": st.errors[name] ? "true" : "false",
            oninput: (e) => {
              st.data[name] = e.target.value;
              persist();
            },
          }),
          err(name),
        );
      return h(
        "div",
        { class: "contact" },
        f("name", "Nom", "text", "name"),
        h(
          "div",
          { class: "row2" },
          f("phone", "Téléphone", "tel", "tel"),
          f("email", "E-mail", "email", "email"),
        ),
      );
    }
    case "summary":
      return summaryBody(st);
    default:
      return null;
  }
}

function dateBody(st, step) {
  const b = business();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sel = st.data[step.field];
  if (!st.cal) {
    const base = sel ? dateOf(sel) : new Date();
    st.cal = { y: base.getFullYear(), m: base.getMonth() };
  }
  const { y, m } = st.cal;
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const count = new Date(y, m + 1, 0).getDate();
  const limit = new Date(
    today.getTime() + (b.booking?.maxAdvanceDays ?? 365) * 86400000,
  );
  const cells = Array.from({ length: lead }, () =>
    h("span", { class: "cal-blank" }),
  );
  for (let d = 1; d <= count; d++) {
    const date = new Date(y, m, d);
    const key = ymd(date);
    const open =
      date >= today && date <= limit && computeSlots(b, key).length > 0;
    cells.push(
      h(
        "button",
        {
          class:
            "cal-day" +
            (key === sel ? " on" : "") +
            (key === ymd(today) ? " today" : ""),
          type: "button",
          disabled: !open,
          "data-key": "d:" + key,
          "aria-pressed": String(key === sel),
          "aria-label": fmtDate(key) + (open ? "" : ", indisponible"),
          onclick: () => {
            setValue(step, key);
            renderFlow(false);
          },
        },
        String(d),
      ),
    );
  }
  const atStart = y === today.getFullYear() && m === today.getMonth();
  const atEnd = new Date(y, m + 1, 1) > limit;
  const shift = (n) => {
    const d = new Date(y, m + n, 1);
    st.cal = { y: d.getFullYear(), m: d.getMonth() };
    renderFlow(false);
  };
  return h(
    "div",
    { class: "cal" },
    h(
      "div",
      { class: "cal-head" },
      h(
        "button",
        {
          class: "icon-btn",
          type: "button",
          disabled: atStart,
          "aria-label": "Mois précédent",
          "data-key": "prev",
          onclick: () => shift(-1),
        },
        icon("chevL"),
      ),
      h(
        "strong",
        {},
        new Date(y, m, 1).toLocaleDateString("fr-FR", {
          month: "long",
          year: "numeric",
        }),
      ),
      h(
        "button",
        {
          class: "icon-btn",
          type: "button",
          disabled: atEnd,
          "aria-label": "Mois suivant",
          "data-key": "next",
          onclick: () => shift(1),
        },
        icon("chevR"),
      ),
    ),
    h(
      "div",
      { class: "cal-grid" },
      ["L", "M", "M", "J", "V", "S", "D"].map((d) =>
        h("span", { class: "cal-wd", "aria-hidden": "true" }, d),
      ),
      cells,
    ),
    st.errors[step.field] &&
      h("p", { class: "field-error", role: "alert" }, st.errors[step.field]),
  );
}

function timeBody(st, step) {
  const slots = st.data.date ? computeSlots(business(), st.data.date) : [];
  if (!slots.length)
    return h(
      "p",
      { class: "empty" },
      "Plus aucun créneau ce jour-là. Revenez en arrière pour choisir une autre date.",
    );
  const period = (t) => {
    const hr = Number(t.slice(0, 2));
    return hr < 11
      ? "Matin"
      : hr < 15
        ? "Midi"
        : hr < 18
          ? "Après-midi"
          : "Soir";
  };
  const groups = new Map();
  slots.forEach((t) =>
    groups.set(period(t), [...(groups.get(period(t)) || []), t]),
  );
  return h(
    "div",
    { class: "slots" },
    [...groups].map(([label, list]) =>
      h(
        "div",
        { class: "slot-group" },
        groups.size > 1 && h("h3", {}, label),
        h(
          "div",
          { class: "chips" },
          list.map((t) =>
            h(
              "button",
              {
                class: "chip" + (st.data[step.field] === t ? " on" : ""),
                type: "button",
                "data-key": "t:" + t,
                "aria-pressed": String(st.data[step.field] === t),
                onclick: () => {
                  setValue(step, t);
                  renderFlow(false);
                },
              },
              fmtTime(t),
            ),
          ),
        ),
      ),
    ),
    st.errors[step.field] &&
      h("p", { class: "field-error", role: "alert" }, st.errors[step.field]),
  );
}

function numberBody(st, step) {
  const min = step.min ?? 1;
  const max = step.max ?? 100;
  const n = st.data[step.field];
  const unit = step.unit || ["", ""];
  const change = (delta) => {
    setValue(step, Math.min(max, Math.max(min, n + delta)));
    renderFlow(false);
  };
  const b = business();
  return h(
    "div",
    { class: "counter" },
    h(
      "div",
      { class: "stepper" },
      h(
        "button",
        {
          class: "round",
          type: "button",
          disabled: n <= min,
          "aria-label": "Diminuer",
          "data-key": "minus",
          onclick: () => change(-1),
        },
        icon("minus"),
      ),
      h(
        "div",
        { class: "count", "aria-live": "polite" },
        h("strong", {}, String(n)),
        h("span", {}, n > 1 ? unit[1] : unit[0]),
      ),
      h(
        "button",
        {
          class: "round",
          type: "button",
          disabled: n >= max,
          "aria-label": "Augmenter",
          "data-key": "plus",
          onclick: () => change(1),
        },
        icon("plus"),
      ),
    ),
    n >= max &&
      h(
        "p",
        { class: "muted center" },
        b.phone
          ? `Au-delà de ${max}, appelez-nous au ${b.phone}.`
          : `Pour un groupe plus important, laissez-nous un message.`,
      ),
  );
}

function dishesBody(st, step) {
  const menu = business().menu || [];
  const cats = [...new Set(menu.map((m) => m.category || "Carte"))];
  const cat = cats[Math.min(st.cat, cats.length - 1)];
  const picked = st.data[step.field] || [];
  const qty = (id) => picked.find((p) => p.id === id)?.qty || 0;
  const set = (id, q) => {
    const rest = picked.filter((p) => p.id !== id);
    st.data[step.field] =
      q > 0 ? [...rest, { id, qty: Math.min(20, q) }] : rest;
    persist();
    renderFlow(false);
  };
  const total = dishesTotal(st);
  return h(
    "div",
    { class: "dishes" },
    cats.length > 1 &&
      h(
        "div",
        { class: "cat-tabs", role: "tablist" },
        cats.map((c, i) =>
          h(
            "button",
            {
              class: "cat" + (c === cat ? " on" : ""),
              type: "button",
              role: "tab",
              "aria-selected": String(c === cat),
              "data-key": "cat:" + i,
              onclick: () => {
                st.cat = i;
                renderFlow(false);
              },
            },
            c,
          ),
        ),
      ),
    h(
      "div",
      { class: "dish-list" },
      menu
        .filter((m) => (m.category || "Carte") === cat)
        .map((m) =>
          h(
            "div",
            { class: "dish" + (qty(m.id) ? " on" : "") },
            h(
              "div",
              {},
              h("strong", {}, m.name),
              m.description && h("p", {}, m.description),
              typeof m.price === "number" &&
                h("span", { class: "price" }, eur(m.price)),
            ),
            h(
              "div",
              { class: "mini-stepper" },
              qty(m.id) > 0 &&
                h(
                  "button",
                  {
                    class: "round sm",
                    type: "button",
                    "aria-label": "Retirer " + m.name,
                    "data-key": "dm:" + m.id,
                    onclick: () => set(m.id, qty(m.id) - 1),
                  },
                  icon("minus"),
                ),
              qty(m.id) > 0 && h("span", { class: "q" }, String(qty(m.id))),
              h(
                "button",
                {
                  class: "round sm",
                  type: "button",
                  "aria-label": "Ajouter " + m.name,
                  "data-key": "dp:" + m.id,
                  onclick: () => set(m.id, qty(m.id) + 1),
                },
                icon("plus"),
              ),
            ),
          ),
        ),
    ),
    total != null &&
      h(
        "p",
        { class: "muted center" },
        `Estimation à titre indicatif : ${eur(total)}`,
      ),
  );
}

function summaryBody(st) {
  const rows = summaryRows(st);
  return h(
    "div",
    { class: "summary" },
    h(
      "dl",
      {},
      rows.map((r) => [
        h("dt", {}, r.label),
        h(
          "dd",
          {},
          r.value,
          h(
            "button",
            {
              class: "link inline",
              type: "button",
              onclick: () => {
                st.i = r.index;
                renderFlow(true);
              },
            },
            "Modifier",
          ),
        ),
      ]),
    ),
    st.flow.disclaimer && h("p", { class: "note" }, st.flow.disclaimer),
    st.errors._form &&
      h("p", { class: "field-error", role: "alert" }, st.errors._form),
  );
}

/* ── Cadre du pop-up ─────────────────────────────────────────────── */

function renderFlow(animate) {
  const st = S.flow;
  if (!st) return;
  const focusKey = document.activeElement?.dataset?.key;

  const dialog = st.done
    ? doneView(st)
    : (() => {
        const step = st.steps[st.i];
        const last = step.type === "summary";
        const sayText = st.say[step.id + "|" + sayKey(st)] || step.hint;
        return h(
          "div",
          {
            class: "dialog" + (animate ? " enter" : ""),
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": "dlg-title",
          },
          h(
            "div",
            { class: "dlg-head" },
            h(
              "div",
              {
                class: "progress",
                role: "progressbar",
                "aria-valuemin": "1",
                "aria-valuemax": String(st.steps.length),
                "aria-valuenow": String(st.i + 1),
                "aria-label": `Étape ${st.i + 1} sur ${st.steps.length}`,
              },
              st.steps.map((_, k) =>
                h("span", { class: "seg" + (k <= st.i ? " on" : "") }),
              ),
            ),
            h(
              "button",
              {
                class: "icon-btn",
                type: "button",
                "aria-label": "Fermer",
                onclick: () => closeFlow(),
              },
              icon("close"),
            ),
          ),
          h(
            "div",
            { class: "dlg-body" },
            h("h2", { id: "dlg-title", tabindex: "-1" }, step.title),
            sayText && h("p", { class: "say", id: "say" }, sayText),
            stepBody(st, step),
          ),
          h(
            "div",
            { class: "dlg-foot" },
            h(
              "button",
              { class: "btn ghost", type: "button", onclick: () => back() },
              st.i === 0 ? "Annuler" : "Retour",
            ),
            h(
              "div",
              { class: "foot-right" },
              isOptional(step) &&
                h(
                  "button",
                  { class: "btn ghost", type: "button", onclick: () => skip() },
                  "Passer",
                ),
              h(
                "button",
                {
                  class: "btn",
                  type: "button",
                  id: "next",
                  disabled: st.busy,
                  onclick: () => next(),
                },
                last
                  ? st.busy
                    ? "Envoi…"
                    : "Envoyer la demande"
                  : "Continuer",
              ),
            ),
          ),
        );
      })();

  const overlay = h(
    "div",
    {
      class: "overlay",
      onmousedown: (e) => {
        if (e.target === e.currentTarget) closeFlow();
      },
      onkeydown: trap,
    },
    dialog,
  );
  layer.querySelector(".overlay")?.remove();
  layer.append(overlay);

  if (animate) {
    (
      overlay.querySelector("#dlg-title") || overlay.querySelector(".done h2")
    )?.focus({ preventScroll: true });
    if (!st.done) requestSay();
  } else if (focusKey) {
    [...overlay.querySelectorAll("[data-key]")]
      .find((el) => el.dataset.key === focusKey)
      ?.focus({ preventScroll: true });
  }
}

function trap(e) {
  if (e.key === "Escape") return closeFlow();
  if (
    e.key === "Enter" &&
    e.target.tagName === "INPUT" &&
    S.flow &&
    !S.flow.done
  ) {
    e.preventDefault();
    return next();
  }
  if (e.key !== "Tab") return;
  const items = [
    ...e.currentTarget.querySelectorAll(
      "button:not([disabled]), input, textarea, [tabindex='-1']",
    ),
  ].filter((el) => el.offsetParent !== null || el.tagName === "H2");
  if (!items.length) return;
  const first = items[0],
    lastEl = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    lastEl.focus();
  } else if (!e.shiftKey && document.activeElement === lastEl) {
    e.preventDefault();
    first.focus();
  }
}

function back() {
  const st = S.flow;
  if (st.i === 0) return closeFlow();
  st.i -= 1;
  st.errors = {};
  persist();
  renderFlow(true);
}
function skip() {
  const st = S.flow;
  st.i = Math.min(st.i + 1, st.steps.length - 1);
  st.errors = {};
  persist();
  renderFlow(true);
}

async function next() {
  const st = S.flow;
  if (!st || st.busy) return;
  const step = st.steps[st.i];
  const problem = check(step, st.data);
  if (problem) {
    st.errors =
      typeof problem === "string" ? { [step.field]: problem } : problem;
    renderFlow(false);
    overlayFocusError();
    return;
  }
  st.errors = {};
  if (step.type !== "summary") {
    st.i += 1;
    persist();
    return renderFlow(true);
  }

  st.busy = true;
  renderFlow(false);
  try {
    const payload = { ...st.data };
    const res = await api.submit(st.flow, payload);
    const rows = summaryRows(st).filter((r) =>
      ["date", "time", "people"].includes(st.steps[r.index].field),
    );
    if (!res.preview)
      rememberRequest({
        reference: res.reference,
        title: st.flow.title,
        summary: rows.map((r) => r.value).join(" · ") || "Demande envoyée",
      });
    tab.set(draftKey(st.flow.id), null);
    st.done = res;
    st.busy = false;
    if (S.view === "home") render();
    renderFlow(true);
  } catch (err) {
    st.busy = false;
    const errors = err.data?.errors;
    if (errors) {
      const idx = st.steps.findIndex((s) => fieldsOf(s).some((f) => errors[f]));
      st.errors = errors;
      if (idx >= 0) st.i = idx;
    } else {
      st.errors = { _form: err.message };
    }
    renderFlow(true);
  }
}

function overlayFocusError() {
  layer
    .querySelector("[role='alert']")
    ?.closest(".field, .cal, .slots, .counter, .contact")
    ?.querySelector("input, button:not([disabled])")
    ?.focus?.();
}

function doneView(st) {
  const res = st.done;
  return h(
    "div",
    {
      class: "dialog done enter",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "done-title",
    },
    h(
      "div",
      { class: "done-body" },
      h("span", { class: "done-mark" }, icon("check")),
      h(
        "h2",
        { id: "done-title", tabindex: "-1" },
        res.title || "Demande envoyée",
      ),
      h("p", { class: "muted" }, res.message),
      res.preview
        ? h("p", { class: "note" }, "Aperçu : rien n'a été enregistré.")
        : h(
            "p",
            { class: "ref-line" },
            "Référence ",
            h("span", { class: "ref" }, res.reference),
          ),
      h(
        "div",
        { class: "done-actions" },
        h(
          "button",
          { class: "btn", type: "button", onclick: () => closeFlow() },
          "Terminer",
        ),
        h(
          "button",
          {
            class: "btn ghost",
            type: "button",
            onclick: () => openFlow(st.flow.id),
          },
          "Nouvelle demande",
        ),
      ),
    ),
  );
}

/* ── Accompagnement IA facultatif (jamais bloquant) ─────────────── */

const sayKey = (st) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(st.data).filter(
        ([k, v]) =>
          typeof v !== "object" &&
          !["name", "phone", "email", "note", "message"].includes(k),
      ),
    ),
  );

async function requestSay() {
  const st = S.flow;
  if (!st || PREVIEW || !S.site.runtime?.ai) return;
  const step = st.steps[st.i];
  if (["contact", "summary"].includes(step.type)) return;
  const key = step.id + "|" + sayKey(st);
  if (st.say[key]) return;
  const index = st.i;
  try {
    const { say } = await api.assist(
      st.flow.id,
      step.id,
      JSON.parse(sayKey(st)),
    );
    if (say && S.flow === st && st.i === index) {
      st.say[key] = say;
      const el = document.getElementById("say");
      if (el) {
        el.textContent = say;
        el.classList.add("fresh");
      }
    }
  } catch {
    /* le texte statique reste affiché */
  }
}

/* ════════════════════════════════════════════════════════════════════
   CHAT
   ════════════════════════════════════════════════════════════════════ */

function toggleChat(force) {
  if (force && needsLogin() && !S.user) {
    S.after = () => toggleChat(true);
    return goAuth("register");
  }
  S.chat.open = force ?? !S.chat.open;
  layer.querySelector(".drawer")?.remove();
  if (!S.chat.open) return;
  if (!S.chat.msgs.length)
    S.chat.msgs.push({
      role: "assistant",
      text: S.site.brand.greeting || "Bonjour, comment puis-je vous aider ?",
    });
  renderChat();
  layer.querySelector(".drawer input")?.focus();
}

function flowsFor(text, force) {
  const low = String(text).toLowerCase();
  const hits = flows().filter((f) =>
    (f.keywords || []).some((k) => low.includes(k.toLowerCase())),
  );
  return hits.length ? hits : force ? flows() : [];
}

function renderChat() {
  if (!S.chat.open) return;
  const existing = layer.querySelector(".drawer");
  const thread = h(
    "div",
    { class: "thread", "aria-live": "polite" },
    S.chat.msgs.map((m) =>
      h(
        "div",
        { class: "msg " + m.role + (m.error ? " error" : "") },
        m.role === "assistant" ? rich(m.text) : m.text,
        m.sources?.length > 0 &&
          h("small", { class: "sources" }, "Source : " + m.sources.join(", ")),
        (m.flows || []).length > 0 &&
          h(
            "div",
            { class: "msg-actions" },
            m.flows.map((f) =>
              h(
                "button",
                { class: "btn sm", type: "button", onclick: () => start(f.id) },
                f.title,
              ),
            ),
          ),
      ),
    ),
    S.chat.busy &&
      h(
        "div",
        { class: "msg assistant" },
        h("span", { class: "typing" }, h("i"), h("i"), h("i")),
      ),
  );
  const suggestions =
    S.chat.msgs.length <= 1 &&
    (S.site.brand.suggestions || []).length > 0 &&
    h(
      "div",
      { class: "suggest" },
      S.site.brand.suggestions.map((q) =>
        h(
          "button",
          { class: "chip", type: "button", onclick: () => sendChat(q) },
          q,
        ),
      ),
    );
  const input = h("input", {
    type: "text",
    placeholder: "Écrivez votre message",
    "aria-label": "Votre message",
    autocomplete: "off",
    maxlength: "500",
  });
  const drawer = h(
    "aside",
    {
      class: "drawer",
      "aria-label": "Assistant",
      onkeydown: (e) => {
        if (e.key === "Escape") toggleChat(false);
      },
    },
    h(
      "div",
      { class: "drawer-head" },
      h(
        "div",
        { class: "brand" },
        mark(),
        h(
          "div",
          {},
          h("strong", {}, S.site.brand.name),
          h("small", { class: "muted" }, S.site.brand.tagline || "Assistant"),
        ),
      ),
      h(
        "button",
        {
          class: "icon-btn",
          type: "button",
          "aria-label": "Fermer l'assistant",
          onclick: () => toggleChat(false),
        },
        icon("close"),
      ),
    ),
    thread,
    suggestions,
    h(
      "form",
      {
        class: "composer",
        onsubmit: (e) => {
          e.preventDefault();
          const t = input.value.trim();
          if (t) {
            input.value = "";
            sendChat(t);
          }
        },
      },
      input,
      h(
        "button",
        {
          class: "round",
          type: "submit",
          "aria-label": "Envoyer",
          disabled: S.chat.busy,
        },
        icon("send"),
      ),
    ),
  );
  if (existing) existing.replaceWith(drawer);
  else layer.prepend(drawer);
  thread.scrollTop = thread.scrollHeight;
  if (existing && document.activeElement === document.body) input.focus();
}

async function sendChat(text) {
  if (S.chat.busy) return;
  const history = S.chat.msgs
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.text }));
  S.chat.msgs.push({ role: "user", text });
  S.chat.busy = true;
  renderChat();
  layer.querySelector(".drawer input")?.focus();
  try {
    const res = await api.chat(text, history);
    const noAnswer = !res.sources?.length && res.mode !== "ai";
    S.chat.msgs.push({
      role: "assistant",
      text: res.reply,
      sources: res.sources,
      flows: flowsFor(text, noAnswer),
    });
  } catch (err) {
    S.chat.msgs.push({
      role: "assistant",
      text:
        err.status === 429
          ? "Trop de messages d'un coup. Patientez quelques secondes."
          : "Connexion impossible pour le moment. Réessayez dans un instant.",
      error: true,
    });
  }
  S.chat.busy = false;
  renderChat();
  layer.querySelector(".drawer input")?.focus();
}

/* ════════════════════════════════════════════════════════════════════
   DÉMARRAGE
   ════════════════════════════════════════════════════════════════════ */

async function boot() {
  try {
    S.site = await api.site();
  } catch {
    root.append(
      h(
        "p",
        { class: "boot-error" },
        "Ce site est momentanément indisponible. Réessayez dans un instant.",
      ),
    );
    return;
  }
  document.title = S.site.brand.name;
  document.documentElement.lang = S.site.brand.language || "fr";

  S.token = local.get("token");
  if (S.token) {
    if (PREVIEW) S.user = safe(() => JSON.parse(local.get("user")));
    else {
      try {
        S.user = (await http("/api/auth/me")).user;
      } catch {
        S.token = null;
        local.set("token", null);
      }
    }
  }
  S.view = S.user ? "home" : "cover";
  render();
  if (S.user) {
    const first = flows()[0];
    if (first && !tab.get("auto")) {
      tab.set("auto", "1");
      openFlow(first.id);
    }
  }
}

boot();
