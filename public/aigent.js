/* ══════════════════════════════════════════════════════════════════
   AiGENT — Builder, côté navigateur
   Se branche sur server-aigent.js. Aucune clé ici : tout passe par
   le back, qui garde nos providers pour lui.
   ══════════════════════════════════════════════════════════════════ */

import {
  FONTS,
  MOODS,
  SECTIONS,
  DESIGN_DEFAULTS,
  normalizeDesign,
  applyMood,
  designCss,
  designAttrs,
  fontHref,
  exampleBody,
  EXAMPLE_DOC,
  ROLES,
} from "./aigent-design.js";

const LOGO = "./images/aigent.ico";
const TOKEN_KEY = "aigent_token";
const LOGIN_PAGE = "./aigent-login.html";

/* ── État ─────────────────────────────────────────────────────────── */
const state = {
  account: null,
  projectId: null,
  project: null,
  catalog: null,
  build: null,
  changes: [],
  view: "chat",
  busy: false,
  shots: [],
  shooting: false,
  lightbox: null,
};

/* ── Raccourcis DOM ───────────────────────────────────────────────── */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (id, cls) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  if (cls) svg.setAttribute("class", cls);
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#" + id);
  svg.appendChild(use);
  return svg;
};
const logoImg = (size) => {
  const img = new Image();
  img.src = LOGO;
  img.alt = "";
  if (size) {
    img.width = size;
    img.height = size;
  }
  return img;
};
const now = () =>
  new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

const thread = $("#thread");
const composer = $("#composer");
const input = $("#input");
const sendBtn = $("#sendBtn");
const panel = $("#panel");
const panelBody = $("#panelBody");
const shell = $("#shell");

/* ── API ──────────────────────────────────────────────────────────── */
const token = () => localStorage.getItem(TOKEN_KEY);

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem(TOKEN_KEY);
    location.href = LOGIN_PAGE;
    throw new Error("session");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw Object.assign(new Error(data.error || "Erreur serveur"), { data });
  return data;
}

function toast(message, ms = 2600) {
  const t = $("#toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), ms);
}

/* ══════════════════════════════════════════════════════════════════
   RENDU DU FIL
   ══════════════════════════════════════════════════════════════════ */

function scroll() {
  requestAnimationFrame(() => (thread.scrollTop = thread.scrollHeight));
}

function addUser(text) {
  const turn = el("div", "turn user");
  const bubble = el("div", "bubble");
  bubble.appendChild(el("p", null, text));
  bubble.appendChild(el("div", "time", now()));
  turn.appendChild(bubble);
  thread.appendChild(turn);
  scroll();
}

function addAgent(text, node) {
  const turn = el("div", "turn");
  const mark = el("div", "agent-mark");
  mark.appendChild(logoImg(17));
  const body = el("div", "body");
  if (text) body.appendChild(el("p", null, text));
  if (node) body.appendChild(node);
  body.appendChild(el("div", "time", now()));
  turn.append(mark, body);
  thread.appendChild(turn);
  scroll();
  return turn;
}

// APRÈS
/* Logo tracé au trait : deux losanges entrelacés, chacun passe « dessous » à un croisement.
   Redessiné d'après ta capture. Pour un tracé strictement identique à ton fichier source,
   remplace les deux « d » par ceux de ton SVG (viewBox 0 0 40 32). */
const MARK_PATHS = [
  "M20.6 11.1L23.9 14.4Q25.5 16 23.9 17.6L17.1 24.4Q15.5 26 13.9 24.4L7.1 17.6Q5.5 16 7.1 14.4L13.9 7.6Q15.5 6 17.1 7.6L18.9 9.4",
  "M18.9 20.9L15.6 17.6Q14 16 15.6 14.4L22.4 7.6Q24 6 25.6 7.6L32.4 14.4Q34 16 32.4 17.6L25.6 24.4Q24 26 22.4 24.4L20.6 22.6",
];

function drawnMark(width = 30) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 40 32");
  svg.setAttribute("class", "mark-draw");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = width + "px";
  svg.style.height = width * 0.8 + "px";
  MARK_PATHS.forEach((d) => {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("pathLength", "1"); // longueur normalisée : animation indépendante de la taille
    svg.appendChild(p);
  });
  return svg;
}

function startThinking(steps) {
  const block = el("div", "thinking");
  const mark = el("div", "agent-mark");
  mark.appendChild(drawnMark(40));
  const body = el("div", "body");
  body.appendChild(el("h4", null, "AiGENT réfléchit"));
  const list = el("div", "steps");
  (steps || ["Analyse du besoin", "Préparation de la réponse"]).forEach(
    (label, i) => {
      const s = el("div", "step" + (i === 0 ? " is-active" : ""));
      s.style.setProperty("--i", i);
      const dot = el("span", "dot");
      dot.appendChild(icon("i-check"));
      s.append(
        dot,
        el("span", null, typeof label === "string" ? label : label.label),
      );
      list.appendChild(s);
    },
  );
  body.appendChild(list);
  block.append(mark, body);
  thread.appendChild(block);
  scroll();
  composer.classList.add("is-busy"); // le champ de saisie pulse pendant que l'AiGENT travaille

  // Rythme : les premières étapes s'enchaînent vite, les suivantes respirent.
  const delays = [1100, 1500, 1900, 2300];
  const steppers = [...list.children];
  let i = 0;
  let timer = setTimeout(function tick() {
    if (i >= steppers.length - 1) return; // jamais au-delà de la dernière étape
    steppers[i].classList.remove("is-active");
    steppers[i].classList.add("is-done");
    i++;
    steppers[i].classList.add("is-active");
    timer = setTimeout(tick, delays[Math.min(i, delays.length - 1)]);
  }, delays[0]);

  return {
    done() {
      clearTimeout(timer);
      composer.classList.remove("is-busy");
      block.remove();
    },
  };
}

/* ── Aperçu : galerie dans le chat, visionneuse ─────────────────── */
function shotSrc(u) {
  return u.startsWith("blob:")
    ? u
    : `${u}${u.includes("?") ? "&" : "?"}token=${encodeURIComponent(token())}`;
}

function shotGallery(items) {
  const wrap = el("div", "shots");
  const head = el("div", "shots-head");
  head.append(
    el("strong", null, "Aperçu du site"),
    el("span", null, "Cliquez pour agrandir"),
  );
  const grid = el("div", "shots-grid");
  wrap.append(head, grid);

  const cells = items.map((it) => {
    const b = el("button", "shot is-loading");
    b.type = "button";
    b.disabled = true;
    b.setAttribute("aria-label", it.label);
    const frame = el("span", "shot-frame");
    const skel = el("span", "shot-skel");
    skel.appendChild(drawnMark(34));
    frame.appendChild(skel);
    b.append(frame, el("span", "shot-cap", it.label));
    grid.appendChild(b);
    return b;
  });

  function reveal(i, url) {
    items[i].url = url;
    const b = cells[i];
    const img = new Image();
    img.alt = items[i].label;
    img.decoding = "async";
    img.onload = () => {
      b.querySelector(".shot-frame").appendChild(img);
      requestAnimationFrame(() => {
        b.classList.remove("is-loading");
        b.classList.add("is-ready");
        b.disabled = false;
      });
    };
    img.onerror = () => b.remove();
    img.src = shotSrc(url);
    b.onclick = () => openLightbox(items, i);
  }
  items.forEach((it, i) => it.url && reveal(i, it.url));
  return { node: wrap, reveal };
}

function openLightbox(items, start) {
  const list = items.filter((s) => s.url);
  if (!list.length) return;
  let at = Math.max(0, list.indexOf(items[start]));
  const img = el("img", "lb-img");
  const cap = el("span", "lb-cap");
  const count = el("span", "lb-count");
  const prev = el("button", "icon-btn");
  prev.setAttribute("aria-label", "Précédent");
  prev.appendChild(icon("i-back"));
  const next = el("button", "icon-btn");
  next.setAttribute("aria-label", "Suivant");
  next.appendChild(icon("i-send"));
  const bar = el("div", "lb-bar");
  bar.append(prev, cap, count, next);
  const show = (n) => {
    at = (n + list.length) % list.length;
    img.src = shotSrc(list[at].url);
    img.alt = list[at].label;
    cap.textContent = list[at].label;
    count.textContent = `${at + 1} / ${list.length}`;
  };
  prev.addEventListener("click", () => show(at - 1));
  next.addEventListener("click", () => show(at + 1));
  img.addEventListener("click", () => show(at + 1));
  show(at);
  modal("Aperçu du site", [img, bar]);
  state.lightbox = { step: (d) => show(at + d) };
}

/** Capture, remplit la galerie au fil de l'eau, puis enregistre. */
async function runPreviews(manifest) {
  if (state.shooting || !manifest?.shots?.length) return;
  state.shooting = true;
  composer.classList.add("is-busy");
  const items = manifest.shots.map((s) => ({ label: s.label }));
  const gallery = shotGallery(items);
  const turn = addAgent("Voici l'aperçu de votre site.", gallery.node);
  try {
    const got = await captureShots(manifest, state.project?.slug, (it) =>
      gallery.reveal(it.idx, it.url),
    );
    if (!got.length) return turn.remove(); // rien de fiable à montrer : on reste discret
    for (let k = 0; k < got.length; k++) {
      const it = got[k];
      const q = `idx=${it.idx}&label=${encodeURIComponent(it.label)}${k === got.length - 1 ? "&done=1" : ""}`;
      await fetch(`/api/aigent/projects/${state.projectId}/previews?${q}`, {
        method: "POST",
        headers: {
          "Content-Type": it.blob.type,
          Authorization: `Bearer ${token()}`,
        },
        body: it.blob,
      }).catch(() => {});
    }
    state.shots = got.map((it) => ({ label: it.label, url: it.url }));
    if (!panel.hidden) renderProjectPanel();
  } finally {
    state.shooting = false;
    composer.classList.remove("is-busy");
  }
}

/* ══════════════════════════════════════════════════════════════════
   SCHÉMAS (SVG généré, jamais d'image décorative)
   ══════════════════════════════════════════════════════════════════ */

function schemaFromArchitecture(arch) {
  const wrap = el("div", "schema");
  const nodes = arch?.nodes || [];
  const order = ["actor", "surface", "core", "data", "tools", "service"];
  const rows = order
    .map((kind) => nodes.filter((n) => n.kind === kind))
    .filter((r) => r.length);

  const W = 680,
    boxH = 44,
    gapY = 30,
    padY = 14;
  const H = padY * 2 + rows.length * boxH + (rows.length - 1) * gapY;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Schéma d'architecture de l'AiGENT");

  const marker = document.createElementNS(ns, "marker");
  marker.setAttribute("id", "arrow");
  marker.setAttribute("viewBox", "0 0 8 8");
  marker.setAttribute("refX", "6");
  marker.setAttribute("refY", "4");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("orient", "auto");
  const tri = document.createElementNS(ns, "path");
  tri.setAttribute("d", "M0 1 L7 4 L0 7 z");
  tri.setAttribute("class", "s-arrow");
  marker.appendChild(tri);
  const defs = document.createElementNS(ns, "defs");
  defs.appendChild(marker);
  svg.appendChild(defs);

  const pos = new Map();
  rows.forEach((row, r) => {
    const y = padY + r * (boxH + gapY);
    const boxW = Math.min(230, (W - 40 - (row.length - 1) * 18) / row.length);
    const totalW = row.length * boxW + (row.length - 1) * 18;
    let x = (W - totalW) / 2;
    row.forEach((n) => {
      pos.set(n.id, { x: x + boxW / 2, y, h: boxH });
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", boxW);
      rect.setAttribute("height", boxH);
      rect.setAttribute("rx", 10);
      rect.setAttribute(
        "class",
        "s-box" + (n.kind === "core" ? " core" : n.external ? " ext" : ""),
      );
      svg.appendChild(rect);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", x + boxW / 2);
      label.setAttribute("y", y + 20);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "s-label");
      label.textContent = (n.label || n.id).slice(0, 26);
      svg.appendChild(label);

      const kind = document.createElementNS(ns, "text");
      kind.setAttribute("x", x + boxW / 2);
      kind.setAttribute("y", y + 34);
      kind.setAttribute("text-anchor", "middle");
      kind.setAttribute("class", "s-kind");
      kind.textContent = n.external
        ? "service externe à connecter"
        : {
            actor: "point d'entrée",
            surface: "interface",
            core: "votre AiGENT",
            data: "connaissances",
            tools: "capacités",
            service: "externe",
          }[n.kind] || "";
      svg.appendChild(kind);

      x += boxW + 18;
    });
  });

  (arch?.edges || []).forEach((e) => {
    const a = pos.get(e.from),
      b = pos.get(e.to);
    if (!a || !b) return;
    const path = document.createElementNS(ns, "path");
    path.setAttribute(
      "d",
      `M ${a.x} ${a.y + a.h} C ${a.x} ${a.y + a.h + 14}, ${b.x} ${b.y - 14}, ${b.x} ${b.y - 4}`,
    );
    path.setAttribute("class", "s-line" + (e.external ? " ext" : ""));
    path.setAttribute("marker-end", "url(#arrow)");
    svg.appendChild(path);
  });

  wrap.appendChild(svg);
  if (arch?.caption) wrap.appendChild(el("p", "schema-caption", arch.caption));
  return wrap;
}

function schemaFromFlow(flow) {
  const wrap = el("div", "schema");
  const ns = "http://www.w3.org/2000/svg";
  const stepW = 128,
    gap = 22,
    H = 78;
  const W = flow.length * stepW + (flow.length - 1) * gap;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Parcours d'une demande");

  flow.forEach((s, i) => {
    const x = i * (stepW + gap);
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", 8);
    rect.setAttribute("width", stepW);
    rect.setAttribute("height", 52);
    rect.setAttribute("rx", 10);
    rect.setAttribute("class", "s-box");
    svg.appendChild(rect);

    const t1 = document.createElementNS(ns, "text");
    t1.setAttribute("x", x + stepW / 2);
    t1.setAttribute("y", 28);
    t1.setAttribute("text-anchor", "middle");
    t1.setAttribute("class", "s-label");
    t1.textContent = s.step;
    svg.appendChild(t1);

    const t2 = document.createElementNS(ns, "text");
    t2.setAttribute("x", x + stepW / 2);
    t2.setAttribute("y", 44);
    t2.setAttribute("text-anchor", "middle");
    t2.setAttribute("class", "s-kind");
    t2.textContent = (s.detail || "").slice(0, 22);
    svg.appendChild(t2);

    if (i < flow.length - 1) {
      const line = document.createElementNS(ns, "path");
      line.setAttribute("d", `M ${x + stepW} 34 H ${x + stepW + gap - 6}`);
      line.setAttribute("class", "s-line");
      line.setAttribute("marker-end", "url(#arrow)");
      svg.appendChild(line);
    }
  });

  wrap.appendChild(svg);
  return wrap;
}

/* ══════════════════════════════════════════════════════════════════
   PANNEAUX DE CONCEPTION
   ══════════════════════════════════════════════════════════════════ */

function angleFromWheel(wheelEl, evt) {
  const rect = wheelEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.bottom;
  const dx = evt.clientX - cx;
  const dy = cy - evt.clientY;
  const deg = Math.atan2(dx, dy) * (180 / Math.PI);
  return Math.max(-90, Math.min(90, deg));
}

function hueToHex(hue, sat = 72, light = 46) {
  const c = (1 - Math.abs((2 * light) / 100 - 1)) * (sat / 100);
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light / 100 - c / 2;
  const seg = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][Math.min(5, Math.floor(hue / 60))];
  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(seg[0])}${toHex(seg[1])}${toHex(seg[2])}`;
}

const COLOR_MEANINGS = [
  {
    max: 15,
    name: "Rouge",
    text: "Urgence, forte visibilité. À réserver aux alertes ou actions ponctuelles.",
  },
  {
    max: 45,
    name: "Orange",
    text: "Énergie, chaleur. Convient au commerce de proximité et à l'artisanat.",
  },
  {
    max: 65,
    name: "Jaune",
    text: "Optimisme, attention. Efficace en petite dose, fatigant en grande surface.",
  },
  {
    max: 90,
    name: "Vert clair",
    text: "Croissance, validation. Adapté à la santé et à l'environnement.",
  },
  {
    max: 150,
    name: "Vert",
    text: "Sérénité, confirmation. Associé à la confiance et à la nature.",
  },
  {
    max: 190,
    name: "Turquoise",
    text: "Fraîcheur, clarté. Convient au numérique et aux services modernes.",
  },
  {
    max: 230,
    name: "Bleu",
    text: "Confiance, sérieux. Le choix le plus sûr pour un service professionnel.",
  },
  {
    max: 260,
    name: "Indigo",
    text: "Précision, technologie. Renforce une image experte et posée.",
  },
  {
    max: 290,
    name: "Violet",
    text: "Créativité, distinction. Permet de se différencier sans être criard.",
  },
  {
    max: 320,
    name: "Magenta",
    text: "Audace, caractère. À utiliser avec parcimonie sur un fond sobre.",
  },
  {
    max: 345,
    name: "Rose",
    text: "Douceur, accessibilité. Adapté aux marques chaleureuses et inclusives.",
  },
  {
    max: 360,
    name: "Rouge",
    text: "Urgence, forte visibilité. À réserver aux alertes ou actions ponctuelles.",
  },
];
function meaningFor(hue) {
  return (
    COLOR_MEANINGS.find((m) => hue <= m.max) ||
    COLOR_MEANINGS[COLOR_MEANINGS.length - 1]
  );
}

/* ══════════════════════════════════════════════════════════════════
   STUDIO DE STYLE — briques d'interface
   ══════════════════════════════════════════════════════════════════ */
const DEVICES = [
  ["desktop", "Ordinateur", "i-monitor"],
  ["tablet", "Tablette", "i-tablet"],
  ["mobile", "Mobile", "i-phone"],
];
const setPath = (o, p, v) => {
  const k = p.split(".");
  let t = o;
  while (k.length > 1) t = t[k.shift()];
  t[k[0]] = v;
};
const getPath = (o, p) => p.split(".").reduce((t, k) => t?.[k], o);

let fontsLoaded = false;
function ensureFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href =
    "https://fonts.googleapis.com/css2?" +
    Object.values(FONTS)
      .filter((f) => f.g)
      .map((f) => "family=" + f.g)
      .join("&") +
    "&display=swap";
  document.head.appendChild(l);
}

function seg(options, value, onPick) {
  const wrap = el("div", "seg");
  const btns = options.map(([v, label]) => {
    const b = el("button", "seg-b" + (v === value ? " is-on" : ""), label);
    b.type = "button";
    b.addEventListener("click", () => {
      btns.forEach((x) => x.classList.remove("is-on"));
      b.classList.add("is-on");
      onPick(v);
    });
    wrap.appendChild(b);
    return b;
  });
  return wrap;
}
function ctl(label, node, hint) {
  const w = el("div", "ctl");
  const h = el("div", "ctl-h");
  h.appendChild(el("label", null, label));
  if (hint) h.appendChild(el("span", null, hint));
  w.append(h, node);
  return w;
}
const group = (title, ...nodes) => {
  const g = el("section", "grp");
  g.appendChild(el("h4", null, title));
  nodes.forEach((n) => g.appendChild(n));
  return g;
};
function range(min, max, value, onInput, fmt = (v) => v) {
  const w = el("div", "rng-w");
  const i = el("input", "rng");
  i.type = "range";
  i.min = min;
  i.max = max;
  i.value = value;
  const out = el("span", "rng-out", fmt(value));
  const paint = () =>
    i.style.setProperty("--p", ((i.value - min) / (max - min)) * 100 + "%");
  i.addEventListener("input", () => {
    paint();
    out.textContent = fmt(+i.value);
    onInput(+i.value);
  });
  paint();
  w.append(i, out);
  w.input = i;
  w.paint = paint;
  return w;
}
function toggleSw(value, onChange) {
  const b = el("button", "sw" + (value ? " is-on" : ""));
  b.type = "button";
  b.setAttribute("role", "switch");
  b.setAttribute("aria-checked", String(!!value));
  b.appendChild(el("i"));
  b.addEventListener("click", () => {
    value = !value;
    b.classList.toggle("is-on", value);
    b.setAttribute("aria-checked", String(value));
    onChange(value);
  });
  return b;
}
function switchRow(label, value, onChange, hint) {
  const r = el("div", "sw-row");
  const t = el("div");
  t.appendChild(el("strong", null, label));
  if (hint) t.appendChild(el("span", null, hint));
  r.append(t, toggleSw(value, onChange));
  return r;
}
function textIn(
  value,
  onInput,
  { placeholder = "", area = false, max = 120, rows = 3 } = {},
) {
  const n = el(area ? "textarea" : "input");
  n.value = value || "";
  n.placeholder = placeholder;
  n.maxLength = max;
  if (area) n.rows = rows;
  n.addEventListener("input", () => onInput(n.value));
  return n;
}
function fileIn(label, { accept, maxKB = 300, value, onData }) {
  const w = el("div", "file-field");
  const prev = el("div", "file-prev");
  const paint = (v) => {
    prev.innerHTML = "";
    if (!v) return;
    const im = el("img");
    im.src = v;
    im.alt = "";
    const rm = el("button", "link-btn", "Retirer");
    rm.type = "button";
    rm.addEventListener("click", () => {
      onData(null);
      paint(null);
    });
    prev.append(im, rm);
  };
  const inp = el("input");
  inp.type = "file";
  inp.accept = accept;
  const btn = el("label", "file-btn");
  btn.append(icon("i-upload"), el("span", null, label), inp);
  inp.addEventListener("change", () => {
    const f = inp.files?.[0];
    if (!f) return;
    if (f.size > maxKB * 1024) {
      toast(`Image trop lourde (${maxKB} Ko maximum).`);
      inp.value = "";
      return;
    }
    const rd = new FileReader();
    rd.onload = () => {
      onData(rd.result);
      paint(rd.result);
    };
    rd.readAsDataURL(f);
  });
  paint(value);
  w.append(btn, prev);
  return w;
}

function colorIn(value, onPick) {
  const w = el("div", "color-field");
  const i = el("input", "color-in");
  i.type = "color";
  i.value = /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#3d8bfd";
  const clear = el("button", "link-btn", "Rétablir");
  clear.type = "button";
  clear.hidden = !value;
  i.addEventListener("input", () => {
    clear.hidden = false;
    onPick(i.value);
  });
  clear.addEventListener("click", () => {
    clear.hidden = true;
    onPick(null);
  });
  w.append(i, clear);
  return w;
}

/* ── Conversions couleur ── */

/* ── Conversions couleur ── */
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2,
    d = mx - mn;
  let h = 0,
    s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h =
      mx === r
        ? ((g - b) / d) % 6
        : mx === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}
const shiftHue = (hex, by) => {
  const { h, s, l } = hexToHsl(hex);
  return hueToHex((h + by) % 360, Math.max(s, 40), l);
};

/* ── Sélecteur : demi-anneau chromatique + intensité + clarté + hex ── */
function buildColorPicker(onPick) {
  const S = { hue: 220, s: 78, l: 50 };
  const wrap = el("div", "picker");
  const ring = el("div", "hue-ring");
  const handle = el("div", "hue-handle");
  ring.appendChild(handle);
  const meaning = el("p", "picker-meaning");
  const hexIn = el("input", "hex-in");
  hexIn.maxLength = 7;
  hexIn.spellcheck = false;
  const sat = range(
    25,
    100,
    S.s,
    (v) => {
      S.s = v;
      emit();
    },
    (v) => v + " %",
  );
  const lig = range(
    25,
    75,
    S.l,
    (v) => {
      S.l = v;
      emit();
    },
    (v) => v + " %",
  );

  const R = 87;
  function place() {
    const deg = (S.hue / 360) * 180 - 90,
      rad = (deg * Math.PI) / 180;
    handle.style.left = 110 + R * Math.sin(rad) + "px";
    handle.style.top = 110 - R * Math.cos(rad) + "px";
  }
  function paint(hexValue) {
    ring.style.setProperty("--s", S.s + "%");
    ring.style.setProperty("--l", S.l + "%");
    handle.style.background = hexValue;
    hexIn.value = hexValue.toUpperCase();
    const m = meaningFor(S.hue);
    meaning.replaceChildren(
      el("strong", null, m.name),
      document.createTextNode(" — " + m.text),
    );
  }
  function emit() {
    const hx = hueToHex(S.hue, S.s, S.l);
    place();
    paint(hx);
    onPick(hx);
  }
  function set(hexValue) {
    const c = hexToHsl(hexValue);
    S.hue = c.h;
    S.s = Math.min(100, Math.max(25, c.s));
    S.l = Math.min(75, Math.max(25, c.l));
    sat.input.value = S.s;
    lig.input.value = S.l;
    sat.paint();
    lig.paint();
    place();
    paint(hexValue);
  }

  let dragging = false;
  const move = (e) => {
    S.hue = ((angleFromWheel(ring, e) + 90) / 180) * 360;
    emit();
  };
  ring.addEventListener("pointerdown", (e) => {
    dragging = true;
    ring.setPointerCapture(e.pointerId);
    move(e);
  });
  ring.addEventListener("pointermove", (e) => dragging && move(e));
  ring.addEventListener("pointerup", () => (dragging = false));

  hexIn.addEventListener("input", () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexIn.value)) {
      set(hexIn.value);
      onPick(hexIn.value);
    }
  });

  const sw = el("div", "swatches");
  [
    "#FFFFFF",
    "#0A0A0A",
    "#3D8BFD",
    "#7C5CFF",
    "#3FB98C",
    "#E8853B",
    "#C9A15A",
    "#E5484D",
  ].forEach((c) => {
    const b = el("button", "swatch");
    b.type = "button";
    b.style.background = c;
    b.title = c;
    b.addEventListener("click", () => {
      set(c);
      onPick(c);
    });
    sw.appendChild(b);
  });

  const sliders = el("div", "picker-sliders");
  sliders.append(ctl("Intensité", sat), ctl("Clarté", lig));
  const hexRow = el("div", "hex-row");
  hexRow.append(hexIn, sw);
  const pl = el("div", "picker-l");
  pl.append(ring, meaning);
  const pr = el("div", "picker-r");
  pr.append(sliders, hexRow);
  wrap.append(pl, pr);
  set("#3D8BFD");
  return { node: wrap, set };
}

/* ── Aperçu : le site exemple, en iframe, recoloré en direct ── */
function buildSitePreview(ctx, { device: start = "desktop", onPick } = {}) {
  const node = el("div", "sp");
  const bar = el("div", "sp-bar");
  const dots = el("span", "sp-dots");
  dots.append(el("i"), el("i"), el("i"));
  const url = el("span", "sp-url", "site-exemple.fr");
  const devs = el("div", "sp-devs");
  const stage = el("div", "sp-stage");
  const frame = document.createElement("iframe");
  frame.className = "sp-frame";
  frame.title = "Aperçu du site";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.srcdoc = EXAMPLE_DOC;
  stage.appendChild(frame);

  const W = { desktop: 1200, tablet: 820, mobile: 390 };
  let device = start,
    timer = null,
    editOn = false,
    activeRole = null;

  function fit() {
    const b = stage.getBoundingClientRect();
    if (!b.width) return;
    const w = W[device],
      s = Math.min(1, b.width / w);
    frame.style.width = w + "px";
    frame.style.height = b.height / s + "px";
    frame.style.transform = `scale(${s})`;
    frame.style.left = Math.max(0, (b.width - w * s) / 2) + "px";
    stage.dataset.device = device;
  }
  function flush() {
    const { design, brand } = ctx();
    frame.contentWindow?.postMessage(
      {
        k: "aigent-render",
        css: designCss(design),
        attrs: designAttrs(design),
        font: fontHref(design),
        html: exampleBody(design, brand),
      },
      "*",
    );
  }
  const sendEdit = () =>
    frame.contentWindow?.postMessage(
      {
        k: "aigent-edit",
        on: editOn,
        active: activeRole,
        roles: ROLES.map((r) => [r.id, r.label, r.sel]),
      },
      "*",
    );
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, 50);
  };

  DEVICES.forEach(([id, label, ic]) => {
    const b = el("button", "sp-dev" + (id === device ? " is-on" : ""));
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild(icon(ic));
    b.addEventListener("click", () => {
      device = id;
      devs
        .querySelectorAll(".sp-dev")
        .forEach((x) => x.classList.toggle("is-on", x === b));
      fit();
    });
    devs.appendChild(b);
  });
  bar.append(dots, url, devs);
  node.append(
    bar,
    stage,
    el(
      "p",
      "sp-note",
      "Aperçu en direct — chaque réglage est appliqué au site livré.",
    ),
  );
  frame.addEventListener("load", () => {
    fit();
    flush();
    sendEdit();
  });
  new ResizeObserver(fit).observe(stage);

  const onMsg = (e) => {
    if (!frame.isConnected) {
      window.removeEventListener("message", onMsg);
      return;
    }
    if (e.source !== frame.contentWindow) return;
    const m = e.data;
    if (m && m.k === "aigent-pick") {
      activeRole = m.id;
      onPick?.(m.id);
    }
  };
  window.addEventListener("message", onMsg);

  const scrollTo = (id) =>
    frame.contentWindow?.postMessage({ k: "aigent-scroll", id }, "*");
  const setEdit = (on, active) => {
    editOn = !!on;
    activeRole = active || null;
    sendEdit();
  };
  return { node, refresh, scrollTo, setEdit };
}

function cardShell({ title, sub, badge, glyph }) {
  const card = el("div", "card");
  const head = el("div", "card-head");
  head.appendChild(icon(glyph || "i-idea", "glyph"));
  const txt = el("div");
  txt.appendChild(el("h3", null, title));
  if (sub) txt.appendChild(el("p", "sub", sub));
  head.append(txt);
  if (badge) {
    const b = el("span", "badge " + (badge.tone || ""), badge.label);
    head.appendChild(b);
  }
  const body = el("div", "card-body");
  card.append(head, body);
  return { card, body };
}

function footer(card, actions) {
  const foot = el("div", "card-foot");
  actions.forEach((a) => foot.appendChild(a));
  card.appendChild(foot);
}

function actionBtn(label, kind, onClick, disabled) {
  const b = el("button", "btn" + (kind === "primary" ? " primary" : ""), label);
  b.disabled = !!disabled;
  b.addEventListener("click", onClick);
  return b;
}

function renderPanel(p) {
  if (!p) return null;
  const render = PANELS[p.type];
  return render ? render(p) : null;
}

/** Un panneau qui plante ne doit jamais passer pour une panne serveur :
 *  on garde le message, on journalise la vraie erreur dans la console. */
function renderPanelSafe(p) {
  try {
    return renderPanel(p);
  } catch (err) {
    console.error(`[panneau « ${p?.type} »]`, err);
    const n = el("div", "notice");
    n.append(
      icon("i-warn"),
      el(
        "span",
        null,
        `Ce panneau n'a pas pu s'afficher (${err?.message || "erreur"}). Votre progression est conservée : rechargez la page.`,
      ),
    );
    return n;
  }
}

const PALETTES = [
  {
    name: "Océan",
    accent: "#3D8BFD",
    accentTo: "#7C5CFF",
    bg: "#FFFFFF",
    text: "#101114",
  },
  {
    name: "Forêt",
    accent: "#2E9E74",
    accentTo: "#7CC35B",
    bg: "#FAFBF9",
    text: "#0F1A14",
  },
  {
    name: "Ambre",
    accent: "#E8853B",
    accentTo: "#E5484D",
    bg: "#FFFBF7",
    text: "#1A120B",
  },
  {
    name: "Encre",
    accent: "#16171A",
    accentTo: "#4B5563",
    bg: "#FFFFFF",
    text: "#0B0B0D",
  },
  {
    name: "Nocturne",
    accent: "#7C5CFF",
    accentTo: "#3D8BFD",
    bg: "#0B0C10",
    text: "#F2F3F7",
  },
  {
    name: "Sable",
    accent: "#B57A4E",
    accentTo: "#C9A15A",
    bg: "#FBF8F3",
    text: "#1C1712",
  },
];

const PANELS = {
  /* ── Compréhension ───────────────────────────────────────────── */
  understanding(p) {
    const { card, body } = cardShell({
      title: p.title || "AiGENT comprend votre idée",
      sub: p.objective,
      badge:
        p.confidence != null
          ? { label: `Confiance ${Math.round(p.confidence * 100)} %` }
          : null,
      glyph: "i-idea",
    });

    const table = el("table", "table");
    const row = (k, v) => {
      const tr = el("tr");
      tr.append(el("th", null, k), el("td", null, v || "—"));
      table.appendChild(tr);
    };
    row("Objectif", p.objective);
    row("Utilisateurs", p.audience);
    body.appendChild(table);

    if (p.missions?.length) {
      const ul = el("ul", "checklist");
      p.missions.forEach((m) => {
        const li = el("li");
        li.append(icon("i-check"), el("span", null, m.label));
        ul.appendChild(li);
      });
      body.appendChild(el("h4", "panel-desc", "Missions détectées"));
      body.appendChild(ul);
    }

    if (p.capabilities?.length || p.knowledge?.length) {
      const tri = el("div", "triptych");
      const tile = (iconId, title, items) => {
        const t = el("div", "tile");
        const h = el("div", "tile-head");
        h.append(icon(iconId), el("span", null, title));
        t.append(
          h,
          el("p", null, items.length ? items.join(" · ") : "à définir"),
        );
        return t;
      };
      tri.append(
        tile(
          "i-book",
          "Connaissances",
          (p.knowledge || []).map((k) => k.label),
        ),
        tile(
          "i-tool",
          "Capacités",
          (p.capabilities || []).map((c) => c.label),
        ),
      );
      body.appendChild(tri);
    }

    (p.risks || []).forEach((r) => {
      const n = el("div", "notice");
      n.append(icon("i-warn"), el("span", null, r));
      body.appendChild(n);
    });

    footer(card, [
      actionBtn("Modifier", null, () => {
        input.value = "Je voudrais préciser : ";
        input.focus();
      }),
      actionBtn("Valider", "primary", (e) => {
        disableCard(card);
        send("__UNDERSTANDING_VALIDATED__", { silent: true });
      }),
    ]);
    return card;
  },

  /* ── Question de conception ──────────────────────────────────── */
  question(p) {
    const q = p.question || {};
    const { card, body } = cardShell({
      title: q.question,
      sub: q.why,
      glyph: "i-help",
    });

    if (q.options?.length) {
      const choices = el("div", "choices");
      q.options.forEach((o) => {
        const c = el("button", "choice");
        c.appendChild(el("h5", null, o.label));
        if (o.detail) c.appendChild(el("p", null, o.detail));
        c.addEventListener("click", () => {
          disableCard(card);
          c.classList.add("is-selected");
          send("__QUESTION_ANSWERED__", {
            silent: true,
            payload: { questionId: q.id, optionId: o.id },
            echo: o.label,
          });
        });
        choices.appendChild(c);
      });
      body.appendChild(choices);
    }

    const free = el("p", "panel-desc", "Ou répondez directement dans le chat.");
    body.appendChild(free);
    return card;
  },

  /* ── Architecture + parcours ─────────────────────────────────── */
  architecture(p) {
    const { card, body } = cardShell({
      title: p.title || "Architecture proposée",
      glyph: "i-network",
    });
    body.appendChild(schemaFromArchitecture(p.architecture));
    if (p.architecture?.flow?.length) {
      body.appendChild(el("h4", "panel-desc", "Parcours d'une demande"));
      body.appendChild(schemaFromFlow(p.architecture.flow));
    }
    if (p.workflows?.length) {
      const table = el("table", "table");
      p.workflows.forEach((w) => {
        const tr = el("tr");
        tr.append(
          el("th", null, w.name),
          el("td", null, (w.steps || []).map((s) => s.label).join(" → ")),
        );
        table.appendChild(tr);
      });
      body.appendChild(el("h4", "panel-desc", "Automatisations"));
      body.appendChild(table);
    }
    if (p.integrations?.length) {
      const list = el("div", "services");
      p.integrations.forEach((i) => {
        const s = el("div", "service");
        s.append(
          el("span", "ring"),
          el("strong", null, i.label),
          el("code", null, i.env.join(" ")),
        );
        list.appendChild(s);
      });
      body.appendChild(el("h4", "panel-desc", "Services externes nécessaires"));
      body.appendChild(list);
    }
    footer(card, [
      actionBtn("Ajuster", null, () => {
        input.focus();
      }),
      actionBtn("Continuer", "primary", () => {
        disableCard(card);
        send("__ARCHITECTURE_VALIDATED__", { silent: true });
      }),
    ]);
    return card;
  },

  /* ── Identité ────────────────────────────────────────────────── */
  identity(p) {
    const { card, body } = cardShell({
      title: p.title || "Identité de votre AiGENT",
      glyph: "i-user-id",
    });
    const choices = el("div", "choices");
    let selected = null;
    (p.options || []).forEach((o) => {
      const c = el("button", "choice");
      c.appendChild(el("h5", null, o.name));
      c.appendChild(el("p", null, o.tagline));
      if (o.tone?.length) c.appendChild(el("p", null, o.tone.join(" · ")));
      c.addEventListener("click", () => {
        choices
          .querySelectorAll(".choice")
          .forEach((x) => x.classList.remove("is-selected"));
        c.classList.add("is-selected");
        selected = o;
        confirm.disabled = false;
      });
      choices.appendChild(c);
    });
    body.appendChild(choices);
    if (p.greeting) {
      body.appendChild(
        el("p", "panel-desc", `Première phrase : « ${p.greeting} »`),
      );
    }
    const confirm = actionBtn(
      "Choisir cette identité",
      "primary",
      () => {
        if (!selected) return;
        disableCard(card);
        send("__IDENTITY_SELECTED__", {
          silent: true,
          payload: { identity: selected },
          echo: selected.name,
        });
      },
      true,
    );
    footer(card, [confirm]);
    return card;
  },

  /* ── Capacités ───────────────────────────────────────────────── */
  features(p) {
    const { card, body } = cardShell({
      title: p.title || "Capacités de votre AiGENT",
      glyph: "i-toggles",
    });
    const grid = el("div", "toggle-grid");
    const enabled = new Map((p.cards || []).map((c) => [c.id, c.enabled]));

    function renderCard(t, isSuggested) {
      const btn = el("button", "toggle" + (enabled.get(t.id) ? " is-on" : ""));
      const box = el("span", "box");
      box.appendChild(icon("i-check"));
      const txt = el("div");
      const head = el("div", "toggle-head");
      head.appendChild(el("strong", null, t.label));
      if (isSuggested)
        head.appendChild(el("span", "badge ok sm", "Suggéré pour ce projet"));
      txt.append(head, el("span", null, t.description));
      if (t.needsService || t.service)
        txt.appendChild(el("em", null, `Service requis : ${t.service}`));
      btn.append(box, txt);
      btn.addEventListener("click", () => {
        const on = !enabled.get(t.id);
        enabled.set(t.id, on);
        btn.classList.toggle("is-on", on);
      });
      grid.appendChild(btn);
    }
    (p.cards || []).forEach((c) => renderCard(c, !!c.suggested));
    body.appendChild(grid);

    // Rien n'est jamais totalement caché : on peut toujours élargir au
    // catalogue complet si la suggestion a manqué quelque chose.
    if (p.allTools && p.cards.length < p.allTools.length) {
      const shown = new Set(p.cards.map((c) => c.id));
      const more = actionBtn(
        "Voir toutes les capacités disponibles",
        null,
        () => {
          (state.catalog?.tools || []).forEach((t) => {
            if (shown.has(t.id)) return;
            shown.add(t.id);
            enabled.set(t.id, false);
            renderCard(t, false);
          });
          more.remove();
        },
      );
      body.appendChild(more);
    }

    footer(card, [
      actionBtn("Continuer", "primary", () => {
        disableCard(card);
        const tools = [...enabled.entries()].map(([id, on]) =>
          on ? { id } : { id, _remove: true },
        );
        send("__FEATURES_UPDATED__", {
          silent: true,
          payload: { patch: { tools } },
        });
      }),
    ]);
    return card;
  },

  /* ── Récapitulatif ───────────────────────────────────────────── */
  recap(p) {
    const r = p.recap || {};
    const { card, body } = cardShell({
      title: r.identity?.name || "Fiche de conception",
      sub: r.identity?.tagline,
      badge: {
        label: `Conception ${r.completeness ?? 0} %`,
        tone: p.ready ? "ok" : "warn",
      },
      glyph: "i-clipboard",
    });

    if (r.summary) body.appendChild(el("p", null, r.summary));

    const table = el("table", "table");
    const row = (k, v) => {
      const tr = el("tr");
      tr.append(el("th", null, k), el("td", null, v || "—"));
      table.appendChild(tr);
    };
    row("Mission", r.mission);
    row("Utilisateurs", r.audience);
    row("Connaissances", (r.knowledge || []).map((k) => k.label).join(", "));
    row("Actions", (r.tools || []).map((t) => t.label).join(", "));
    row(
      "Interface",
      (state.catalog?.interfaces || []).find((i) => i.id === r.interface?.kind)
        ?.label,
    );
    row("Ton", (r.identity?.tone || []).join(" · "));
    body.appendChild(table);

    if (r.integrations?.length) {
      const list = el("div", "services");
      r.integrations.forEach((i) => {
        const s = el("div", "service");
        s.append(
          el("span", "ring"),
          el("strong", null, i.label),
          el("code", null, i.env.join(" ")),
        );
        list.appendChild(s);
      });
      body.append(el("h4", "panel-desc", "À connecter après l'export"), list);
    }

    (p.issues || []).forEach((i) => {
      const n = el("div", "notice");
      n.append(icon("i-warn"), el("span", null, i.message));
      body.appendChild(n);
    });

    footer(card, [
      actionBtn("Modifier", null, () => {
        disableCard(card);
        send("__RECAP_MODIFY__", { silent: true });
      }),
      actionBtn(
        "Construire mon AiGENT",
        "primary",
        () => {
          disableCard(card);
          startBuild();
        },
        !p.ready,
      ),
    ]);
    return card;
  },

  /* ── Styles : studio (panneau de réglages + canvas d'aperçu) ─── */
  styles(p) {
    ensureFonts();
    const spec = state.project?.spec || {};
    const design = normalizeDesign(spec.interface?.design);
    if (!spec.interface?.design && spec.interface?.theme?.accent)
      design.colors.accent = spec.interface.theme.accent;

    const { card, body } = cardShell({
      title: p.title || "Direction visuelle",
      sub: "Réglez à gauche, vérifiez à droite : chaque réglage est appliqué au site livré.",
      glyph: "i-palette",
    });
    card.classList.add("studio-card");

    let kind = spec.interface?.kind || "web";
    let tab = "brand";
    let sections = {};

    const nameIn = textIn(spec.name || "", () => commit(), {
      placeholder: "Nom du site",
      max: 60,
    });
    const tagIn = textIn(spec.tagline || "", () => {}, {
      placeholder: "Phrase d'accroche",
      max: 120,
    });
    const ctx = () => ({
      design,
      brand: nameIn.value.trim() || "Site exemple",
    });
    const pv = buildSitePreview(ctx);
    const commit = () => pv.refresh();

    const switchRowWith = (sw, label, hint) => {
      const r = el("div", "sw-row");
      const t = el("div");
      t.append(el("strong", null, label), el("span", null, hint));
      r.append(t, sw);
      return r;
    };

    /* ── Coque : panneau (onglets + contenu) | canvas ── */
    const studio = el("div", "studio");
    const side = el("div", "studio-side");
    const tabsEl = el("nav", "studio-tabs");
    const pane = el("div", "studio-pane");
    const canvas = el("div", "studio-canvas");
    canvas.appendChild(pv.node);
    side.append(tabsEl, pane);
    studio.append(side, canvas);
    body.appendChild(studio);

    function show(id, keepScroll) {
      const y = keepScroll ? pane.scrollTop : 0;
      tab = id;
      tabsEl
        .querySelectorAll(".studio-tab")
        .forEach((b) => b.classList.toggle("is-on", b.dataset.id === id));
      pane.replaceChildren(...(sections[id] || []));
      pane.scrollTop = y;
    }
    [
      ["brand", "Marque"],
      ["colors", "Couleurs"],
      ["type", "Texte"],
      ["shape", "Forme"],
      ["use", "Usage"],
    ].forEach(([id, label]) => {
      const b = el("button", "studio-tab", label);
      b.type = "button";
      b.dataset.id = id;
      b.addEventListener("click", () => show(id));
      tabsEl.appendChild(b);
    });

    /* ── Contenu des onglets ── */
    function paint() {
      const bind = (path) => (v) => {
        setPath(design, path, v);
        commit();
      };
      const S = {};

      /* Marque */
      const idRow = el("div", "field-row");
      idRow.append(ctl("Nom du site", nameIn), ctl("Accroche", tagIn));
      S.brand = [
        group("Identité", idRow),
        group(
          "Visuels",
          ctl(
            "Logo",
            fileIn("Choisir un logo", {
              accept: "image/png,image/jpeg,image/svg+xml,image/webp",
              maxKB: 300,
              value: design.brand.logo,
              onData: bind("brand.logo"),
            }),
          ),
          ctl(
            "Favicon",
            fileIn("Choisir un favicon", {
              accept: "image/png,image/svg+xml,image/x-icon",
              maxKB: 100,
              value: design.brand.favicon,
              onData: bind("brand.favicon"),
            }),
          ),
        ),
      ];

      /* Couleurs */
      const TARGETS = [
        ["accent", "Accent", "colors.accent"],
        ["accentTo", "Secondaire", "colors.accentTo"],
        ["bg", "Fond", "colors.bg"],
        ["text", "Texte", "colors.text"],
        ["header", "En-tête", "colors.header"],
      ];
      const valueOf = (k) => {
        const c = design.colors;
        return k === "accentTo"
          ? c.accentTo || c.accent
          : k === "header"
            ? c.header || c.bg
            : c[k];
      };
      let active = "accent";
      const chips = el("div", "field-chips");
      const chipEls = {};
      const paintChips = () =>
        TARGETS.forEach(
          ([k]) =>
            (chipEls[k].querySelector(".sw-dot").style.background = valueOf(k)),
        );
      const gradSw = toggleSw(design.colors.gradient, (v) => {
        design.colors.gradient = v;
        if (v && !design.colors.accentTo) {
          design.colors.accentTo = shiftHue(design.colors.accent, 38);
          paintChips();
        }
        commit();
      });
      const picker = buildColorPicker((hexv) => {
        setPath(design, TARGETS.find((t) => t[0] === active)[2], hexv);
        if (active === "accentTo" && !design.colors.gradient) {
          design.colors.gradient = true;
          gradSw.classList.add("is-on");
          gradSw.setAttribute("aria-checked", "true");
        }
        paintChips();
        commit();
      });
      TARGETS.forEach(([k, label]) => {
        const c = el(
          "button",
          "field-chip" + (k === active ? " is-active" : ""),
        );
        c.type = "button";
        c.append(el("span", "sw-dot"), el("span", null, label));
        c.addEventListener("click", () => {
          active = k;
          Object.values(chipEls).forEach((x) =>
            x.classList.remove("is-active"),
          );
          c.classList.add("is-active");
          picker.set(valueOf(k));
        });
        chipEls[k] = c;
        chips.appendChild(c);
      });
      paintChips();
      picker.set(valueOf(active));

      const pal = el("div", "palettes");
      PALETTES.forEach((pp) => {
        const b = el("button", "pal");
        b.type = "button";
        b.title = pp.name;
        b.style.background = `linear-gradient(135deg, ${pp.bg} 50%, ${pp.accent} 50%)`;
        b.addEventListener("click", () => {
          Object.assign(design.colors, {
            accent: pp.accent,
            accentTo: pp.accentTo,
            gradient: true,
            bg: pp.bg,
            text: pp.text,
            header: null,
          });
          gradSw.classList.add("is-on");
          gradSw.setAttribute("aria-checked", "true");
          paintChips();
          picker.set(valueOf(active));
          commit();
        });
        pal.appendChild(b);
      });
      S.colors = [
        group("Palettes", pal),
        group(
          "Couleurs personnalisées",
          chips,
          picker.node,
          switchRowWith(
            gradSw,
            "Dégradé sur les boutons",
            "Accent → couleur secondaire",
          ),
        ),
      ];

      /* Texte */
      const fonts = el("div", "font-grid");
      Object.entries(FONTS).forEach(([id, f]) => {
        const b = el(
          "button",
          "font-tile" + (design.type.font === id ? " is-on" : ""),
        );
        b.type = "button";
        const aa = el("span", "aa", "Aa");
        aa.style.fontFamily = f.stack;
        b.append(aa, el("span", "fn", f.label));
        b.addEventListener("click", () => {
          fonts
            .querySelectorAll(".font-tile")
            .forEach((x) => x.classList.remove("is-on"));
          b.classList.add("is-on");
          design.type.font = id;
          commit();
        });
        fonts.appendChild(b);
      });
      S.type = [
        group("Police", fonts),
        group(
          "Réglages",
          ctl(
            "Épaisseur des titres",
            seg(
              [
                [400, "Légère"],
                [500, "Normale"],
                [600, "Semi-grasse"],
                [700, "Grasse"],
              ],
              design.type.weight,
              bind("type.weight"),
            ),
          ),
          ctl(
            "Style général",
            seg(
              Object.entries(MOODS).map(([id, m]) => [id, m.label]),
              design.mood,
              (id) => {
                Object.assign(design, applyMood(design, id));
                paint();
                commit();
              },
            ),
            "règle plusieurs curseurs",
          ),
        ),
      ];

      /* Forme */
      S.shape = [
        group(
          "Surfaces",
          ctl(
            "Coins",
            seg(
              [
                ["square", "Carrés"],
                ["soft", "Arrondis"],
                ["round", "Très arrondis"],
              ],
              design.layout.radius,
              bind("layout.radius"),
            ),
          ),
          ctl(
            "Ombres",
            seg(
              [
                ["none", "Aucune"],
                ["soft", "Légères"],
                ["strong", "Prononcées"],
              ],
              design.layout.shadow,
              bind("layout.shadow"),
            ),
          ),
          ctl(
            "Densité",
            seg(
              [
                ["airy", "Aérée"],
                ["balanced", "Équilibrée"],
                ["compact", "Compacte"],
              ],
              design.layout.density,
              bind("layout.density"),
            ),
          ),
        ),
      ];

      /* Usage */
      const kinds = el("div", "toggle-grid");
      (p.interfaces || []).forEach((i) => {
        const t = el("button", "toggle" + (i.id === kind ? " is-on" : ""));
        t.type = "button";
        const box = el("span", "box");
        box.appendChild(icon("i-check"));
        const txt = el("div");
        txt.append(
          el("strong", null, i.label),
          el("span", null, i.description),
        );
        t.append(box, txt);
        t.addEventListener("click", () => {
          kinds
            .querySelectorAll(".toggle")
            .forEach((x) => x.classList.remove("is-on"));
          t.classList.add("is-on");
          kind = i.id;
        });
        kinds.appendChild(t);
      });
      S.use = [group("Où votre AiGENT sera utilisé", kinds)];

      sections = S;
      show(tab, true);
    }

    /* ── Pied du panneau : réglages avancés, toujours visibles ── */
    const adv = el("button", "adv-btn");
    adv.type = "button";
    const at = el("span", "adv-t");
    at.append(
      el("strong", null, "Personnalisation avancée"),
      el(
        "span",
        null,
        "Mise en page · navigation · images · contenu · sections · assistant",
      ),
    );
    adv.append(icon("i-sliders"), at, icon("i-send"));
    adv.addEventListener("click", () =>
      openAdvanced(design, ctx, commit, () => {
        paint();
        commit();
      }),
    );
    const sideFoot = el("div", "studio-side-foot");
    sideFoot.appendChild(adv);
    side.appendChild(sideFoot);

    paint();

    footer(card, [
      actionBtn("Appliquer ce style", "primary", () => {
        disableCard(card);
        send("__STYLE_SELECTED__", {
          silent: true,
          payload: {
            interfaceKind: kind,
            name: nameIn.value.trim() || undefined,
            tagline: tagIn.value.trim() || undefined,
            design,
          },
        });
      }),
    ]);
    return card;
  },

  /* ── Prêt à construire ───────────────────────────────────────── */
  build_ready(p) {
    const { card, body } = cardShell({
      title: "Construction",
      glyph: "i-rocket",
    });
    body.appendChild(
      el(
        "p",
        null,
        "Le projet va être généré : interface, serveur, données, configuration.",
      ),
    );
    footer(card, [
      actionBtn("Lancer la construction", "primary", () => {
        disableCard(card);
        startBuild();
      }),
    ]);
    return card;
  },

  /* ── Construit ───────────────────────────────────────────────── */
  built(p) {
    const { card, body } = cardShell({
      title: p.title || "Votre AiGENT est prêt",
      sub: `${p.manifest?.fileCount || 0} fichiers générés`,
      badge: { label: "Prêt à utiliser", tone: "ok" },
      glyph: "i-rocket",
    });

    const ul = el("ul", "checklist");
    (p.checks || []).forEach((c) => {
      const li = el("li");
      li.append(icon("i-check"), el("span", null, c.label));
      ul.appendChild(li);
    });
    body.appendChild(ul);

    if (p.missingServices?.length) {
      body.appendChild(el("h4", "panel-desc", "Il reste à connecter"));
      const list = el("div", "services");
      p.missingServices.forEach((s) => {
        const row = el("div", "service");
        row.append(
          el("span", "ring"),
          el("strong", null, s.label),
          el("code", null, s.env.join(" ")),
        );
        list.appendChild(row);
      });
      body.appendChild(list);
      body.appendChild(
        el(
          "p",
          "panel-desc",
          "Les clés attendues sont listées dans le fichier .env.example du projet.",
        ),
      );
    }

    footer(card, [
      actionBtn("Voir le code", null, openCode),
      actionBtn("Ouvrir mon AiGENT", "primary", () =>
        window.open(p.previewUrl, "_blank"),
      ),
    ]);
    return card;
  },

  /* ── Aperçu du site (galerie enregistrée) ────────────────────── */
  previews(p) {
    return shotGallery((p.shots || []).map((s) => ({ ...s }))).node;
  },
};

function disableCard(card) {
  card.querySelectorAll("button").forEach((b) => (b.disabled = true));
  card.style.opacity = ".72";
}

/* ══════════════════════════════════════════════════════════════════
   PERSONNALISATION AVANCÉE — pop-up à onglets + aperçu en direct
   ══════════════════════════════════════════════════════════════════ */
function openAdvanced(design, ctx, commit, onClose) {
  design.edits = design.edits || {};
  const snapshot = JSON.parse(JSON.stringify(design));
  const restore = (src) => {
    Object.keys(design).forEach((k) => delete design[k]);
    Object.assign(design, JSON.parse(JSON.stringify(src)));
  };
  let activeRole = null;
  let current = "edit";
  const pv = buildSitePreview(ctx, {
    onPick: (id) => {
      activeRole = id;
      if (current === "edit") show("edit");
    },
  });
  const change = () => {
    commit();
    pv.refresh();
  };
  const bind = (path) => (v) => {
    setPath(design, path, v);
    change();
  };
  const S = (path, opts) => seg(opts, getPath(design, path), bind(path));

  const TAB = {
    /* ── Éditeur : clic dans l'aperçu ── */
    edit: () => {
      const intro = el(
        "p",
        "panel-desc",
        "Cliquez un élément dans l'aperçu pour le sélectionner, puis réglez-le ici. Le réglage vaut pour tous les éléments du même type sur le site livré.",
      );
      const chips = el("div", "chips-row");
      ROLES.forEach((r) => {
        const b = el(
          "button",
          "chip-s" + (r.id === activeRole ? " is-on" : ""),
          r.label,
        );
        b.type = "button";
        b.addEventListener("click", () => {
          activeRole = r.id;
          show("edit");
        });
        chips.appendChild(b);
      });
      const role = ROLES.find((r) => r.id === activeRole);
      if (!role) return [intro, chips];

      const can = new Set(role.can);
      const cur = () => design.edits[role.id] || {};
      const setE = (key, val) => {
        const next = { ...cur() };
        if (val === null || val === "" || val === false) delete next[key];
        else next[key] = val;
        if (Object.keys(next).length) design.edits[role.id] = next;
        else delete design.edits[role.id];
        change();
      };
      const pick = (key, opts) =>
        seg(opts, cur()[key] || "", (v) => setE(key, v || null));

      const ctls = [];
      if (can.has("color"))
        ctls.push(
          ctl(
            "Couleur du texte",
            colorIn(cur().color, (v) => setE("color", v)),
          ),
        );
      if (can.has("bg"))
        ctls.push(
          ctl(
            "Couleur de fond",
            colorIn(cur().bg, (v) => setE("bg", v)),
          ),
        );
      if (can.has("size"))
        ctls.push(
          ctl(
            "Taille",
            pick("size", [
              ["", "Auto"],
              ["s", "Petit"],
              ["l", "Grand"],
              ["xl", "Très grand"],
            ]),
          ),
        );
      if (can.has("align"))
        ctls.push(
          ctl(
            "Alignement",
            pick("align", [
              ["", "Auto"],
              ["left", "Gauche"],
              ["center", "Centre"],
              ["right", "Droite"],
            ]),
          ),
        );
      if (can.has("space"))
        ctls.push(
          ctl(
            "Espacement intérieur",
            pick("space", [
              ["", "Auto"],
              ["s", "Serré"],
              ["l", "Large"],
            ]),
          ),
        );
      if (can.has("focus"))
        ctls.push(
          ctl(
            "Cadrage",
            pick("focus", [
              ["", "Auto"],
              ["top", "Haut"],
              ["center", "Centre"],
              ["bottom", "Bas"],
            ]),
          ),
        );
      if (can.has("ratio"))
        ctls.push(
          ctl(
            "Format",
            pick("ratio", [
              ["", "Auto"],
              ["16/10", "16:10"],
              ["4/3", "4:3"],
              ["1/1", "1:1"],
            ]),
          ),
        );
      if (can.has("hidden"))
        ctls.push(
          switchRow("Masquer cet élément", !!cur().hidden, (v) =>
            setE("hidden", v),
          ),
        );
      const back = actionBtn("Rétablir cet élément", null, () => {
        delete design.edits[role.id];
        change();
        show("edit", true);
      });
      return [intro, chips, group(role.label, ...ctls, back)];
    },

    /* ── Apparence : style global ── */
    style: () => [
      group(
        "Style global",
        ctl(
          "Style",
          seg(
            Object.entries(MOODS).map(([id, m]) => [id, m.label]),
            design.mood,
            (id) => {
              Object.assign(design, applyMood(design, id));
              change();
              show("style", true);
            },
          ),
          "règle plusieurs réglages d'un coup",
        ),
      ),
      group(
        "Rendu",
        ctl(
          "Contraste",
          S("fx.contrast", [
            ["soft", "Doux"],
            ["balanced", "Équilibré"],
            ["strong", "Fort"],
          ]),
        ),
        ctl(
          "Matière",
          S("fx.texture", [
            ["none", "Aucune"],
            ["grain", "Grain"],
            ["paper", "Papier"],
          ]),
        ),
        ctl(
          "Arrière-plan",
          S("fx.backdrop", [
            ["plain", "Uni"],
            ["gradient", "Dégradé"],
            ["mesh", "Mesh"],
            ["grid", "Grille"],
          ]),
        ),
      ),
      group(
        "Thème",
        ctl(
          "Mode",
          S("colors.mode", [
            ["light", "Clair"],
            ["dark", "Sombre"],
            ["auto", "Automatique"],
          ]),
          "automatique = suit l'appareil du visiteur",
        ),
        ctl(
          "Taille du texte",
          range(
            90,
            115,
            design.type.scale,
            bind("type.scale"),
            (v) => v + " %",
          ),
        ),
      ),
    ],

    /* ── Apparence : formes ── */
    shape: () => [
      group(
        "Surfaces",
        ctl(
          "Rayon des coins",
          S("layout.radius", [
            ["square", "Carrés"],
            ["soft", "Arrondis"],
            ["round", "Très arrondis"],
            ["organic", "Organique"],
          ]),
          "appliqué aux cartes, champs et images",
        ),
        ctl(
          "Bordures",
          S("layout.border", [
            ["none", "Aucune"],
            ["thin", "Fines"],
            ["visible", "Contrastées"],
            ["double", "Doubles"],
          ]),
        ),
        ctl(
          "Ombres",
          S("layout.shadow", [
            ["none", "Aucune"],
            ["soft", "Douces"],
            ["strong", "Profondes"],
            ["glow", "Glow"],
          ]),
        ),
        ctl(
          "Cartes",
          S("layout.cards", [
            ["outline", "Contour"],
            ["filled", "Remplies"],
            ["glass", "Verre"],
            ["float", "Flottantes"],
          ]),
        ),
      ),
      group(
        "Boutons & icônes",
        ctl(
          "Style des boutons",
          S("layout.buttons", [
            ["solid", "Plein"],
            ["outline", "Contour"],
            ["ghost", "Discret"],
          ]),
        ),
        ctl(
          "Forme des boutons",
          S("layout.btnShape", [
            ["auto", "Suit les coins"],
            ["pill", "Capsule"],
            ["square", "Carrés"],
          ]),
        ),
        ctl(
          "Icônes",
          S("icons", [
            ["line", "Ligne"],
            ["solid", "Plein"],
            ["minimal", "Minimal"],
          ]),
        ),
      ),
    ],

    /* ── Apparence : mise en page ── */
    layout: () => [
      group(
        "Structure",
        ctl(
          "Largeur du site",
          S("layout.width", [
            ["compact", "Compact"],
            ["standard", "Standard"],
            ["wide", "Large"],
          ]),
        ),
        ctl(
          "Densité",
          seg(
            [
              ["airy", "Aérée"],
              ["balanced", "Équilibrée"],
              ["compact", "Compacte"],
            ],
            design.layout.density,
            (v) => {
              design.layout.density = v;
              design.layout.spacing = {
                airy: "airy",
                balanced: "balanced",
                compact: "tight",
              }[v];
              change();
            },
          ),
        ),
        ctl(
          "Alignement du contenu",
          S("layout.align", [
            ["left", "Gauche"],
            ["center", "Centré"],
          ]),
        ),
      ),
      group(
        "En-tête de page (hero)",
        ctl(
          "Hauteur",
          S("layout.hero", [
            ["compact", "Compact"],
            ["standard", "Standard"],
            ["full", "Plein écran"],
          ]),
        ),
        ctl(
          "Découpe du bas",
          S("layout.cut", [
            ["straight", "Droite"],
            ["diagonal", "Diagonale"],
            ["curve", "Courbe"],
          ]),
        ),
        ctl(
          "Séparateurs",
          S("layout.divider", [
            ["line", "Ligne"],
            ["dotted", "Pointillés"],
            ["none", "Aucun"],
          ]),
        ),
      ),
    ],

    /* ── Apparence : images ── */
    media: () => [
      group(
        "Image d'en-tête",
        ctl(
          "Image du hero",
          fileIn("Choisir une image", {
            accept: "image/png,image/jpeg,image/webp",
            maxKB: 400,
            value: design.media.heroImage,
            onData: (v) => {
              design.media.heroImage = v;
              if (v && design.media.heroMode === "none")
                design.media.heroMode = "background";
              change();
            },
          }),
        ),
        ctl(
          "Affichage",
          S("media.heroMode", [
            ["none", "Aucune"],
            ["background", "En arrière-plan"],
          ]),
        ),
        ctl(
          "Cadrage",
          S("media.heroFocus", [
            ["top", "Haut"],
            ["center", "Centre"],
            ["bottom", "Bas"],
          ]),
        ),
      ),
      group(
        "Photos du site",
        ctl(
          "Image de la section Présentation",
          fileIn("Choisir une image", {
            accept: "image/png,image/jpeg,image/webp",
            maxKB: 400,
            value: design.media.aboutImage,
            onData: bind("media.aboutImage"),
          }),
        ),
        ctl(
          "Forme",
          S("media.shape", [
            ["square", "Rectangle"],
            ["rounded", "Arrondi"],
            ["circle", "Cercle"],
          ]),
        ),
        ctl(
          "Format",
          S("media.ratio", [
            ["16/10", "16:10"],
            ["4/3", "4:3"],
            ["1/1", "1:1"],
          ]),
        ),
        ctl(
          "Traitement",
          S("media.treatment", [
            ["natural", "Naturel"],
            ["bw", "Noir & blanc"],
            ["contrast", "Contrasté"],
            ["cine", "Cinéma"],
          ]),
        ),
        switchRow(
          "Afficher les photos",
          design.media.showPhotos,
          bind("media.showPhotos"),
        ),
      ),
    ],

    /* ── Apparence : mouvement ── */
    motion: () => [
      group(
        "Apparitions",
        ctl(
          "Effet",
          S("fx.reveal", [
            ["none", "Aucun"],
            ["fade", "Fondu"],
            ["slide", "Glissé"],
            ["blur", "Flou → net"],
          ]),
        ),
        ctl(
          "Vitesse",
          S("fx.speed", [
            ["slow", "Lente"],
            ["normal", "Naturelle"],
            ["fast", "Rapide"],
          ]),
        ),
      ),
      group(
        "Interactions",
        ctl(
          "Au survol",
          S("fx.hover", [
            ["none", "Aucun"],
            ["lift", "Lévitation"],
            ["glow", "Glow"],
            ["zoom", "Zoom image"],
          ]),
          "cartes, boutons et images",
        ),
        switchRow(
          "Lueur qui suit la souris",
          design.fx.spot,
          bind("fx.spot"),
          "signature interactive",
        ),
      ),
      el(
        "p",
        "panel-desc",
        "Les animations ne se rejouent pas dans l'aperçu (elles se relanceraient à chaque réglage) : vérifiez-les sur le site livré.",
      ),
    ],

    /* ── Apparence : navigation ── */
    nav: () => {
      const cta = textIn(design.nav.ctaLabel, bind("nav.ctaLabel"), {
        max: 30,
      });
      const sugg = el("div", "chips-row");
      [
        "Prendre rendez-vous",
        "Nous contacter",
        "Commencer",
        "Demander un devis",
      ].forEach((t) => {
        const b = el("button", "chip-s", t);
        b.type = "button";
        b.addEventListener("click", () => {
          cta.value = t;
          bind("nav.ctaLabel")(t);
        });
        sugg.appendChild(b);
      });
      return [
        group(
          "Barre de navigation",
          ctl(
            "Style",
            S("nav.style", [
              ["classic", "Classique"],
              ["float", "Flottante"],
              ["glass", "Verre"],
              ["transparent", "Transparente"],
            ]),
          ),
          ctl(
            "Au défilement",
            S("nav.scroll", [
              ["fixed", "Fixe"],
              ["hide", "Se masque"],
              ["shrink", "Se compacte"],
              ["static", "Non fixe"],
            ]),
          ),
          ctl(
            "Hauteur",
            S("nav.height", [
              ["compact", "Compacte"],
              ["standard", "Standard"],
              ["tall", "Haute"],
            ]),
          ),
          ctl(
            "Affichage",
            S("nav.mode", [
              ["horizontal", "Horizontale"],
              ["hamburger", "Menu hamburger"],
            ]),
          ),
          ctl(
            "Logo",
            S("nav.logo", [
              ["left", "À gauche"],
              ["center", "Centré"],
            ]),
          ),
          ctl(
            "Nombre de liens",
            range(2, 6, design.nav.maxLinks, bind("nav.maxLinks")),
          ),
        ),
        group(
          "Bouton principal",
          switchRow("Afficher le bouton", design.nav.cta, bind("nav.cta")),
          ctl("Texte du bouton", cta),
          sugg,
        ),
      ];
    },

    /* ── Site : contenu ── */
    content: () => {
      const c = design.content;
      const faq = textIn(
        c.faq.map((x) => `${x.q} | ${x.a}`).join("\n"),
        (v) => {
          c.faq = v
            .split("\n")
            .map((l) => {
              const [q, ...a] = l.split("|");
              return { q: (q || "").trim(), a: a.join("|").trim() };
            })
            .filter((x) => x.q && x.a)
            .slice(0, 8);
          change();
        },
        {
          area: true,
          rows: 4,
          max: 1600,
          placeholder:
            "Comment réserver ? | Cliquez sur le bouton en haut de page.",
        },
      );
      return [
        group(
          "Page d'accueil",
          ctl(
            "Titre principal",
            textIn(c.title, bind("content.title"), {
              max: 90,
              placeholder: "Un titre clair, en une phrase",
            }),
          ),
          ctl(
            "Sous-titre",
            textIn(c.subtitle, bind("content.subtitle"), {
              area: true,
              max: 260,
            }),
          ),
          ctl(
            "Texte du bouton principal",
            textIn(c.cta, bind("content.cta"), {
              max: 30,
              placeholder: design.nav.ctaLabel,
            }),
          ),
        ),
        group(
          "Preuves & arguments",
          ctl(
            "Témoignage",
            textIn(c.testimonial.quote, bind("content.testimonial.quote"), {
              area: true,
              max: 240,
            }),
          ),
          ctl(
            "Auteur du témoignage",
            textIn(c.testimonial.author, bind("content.testimonial.author"), {
              max: 80,
            }),
          ),
          ctl(
            "Arguments clés",
            textIn(
              c.keyPoints.join("\n"),
              (v) => {
                c.keyPoints = v
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 6);
                change();
              },
              { area: true, rows: 4, max: 600 },
            ),
            "un par ligne",
          ),
          ctl("FAQ", faq, "Question | Réponse, une par ligne"),
        ),
        group(
          "Coordonnées",
          ctl(
            "Adresse",
            textIn(c.address, bind("content.address"), { max: 140 }),
          ),
          ctl("Téléphone", textIn(c.phone, bind("content.phone"), { max: 30 })),
          ctl("Email", textIn(c.email, bind("content.email"), { max: 100 })),
          ctl(
            "Réseaux sociaux (lien)",
            textIn(c.social, bind("content.social"), {
              max: 140,
              placeholder: "https://…",
            }),
          ),
        ),
      ];
    },

    /* ── Site : sections ── */
    sections: () => {
      const list = el("ul", "sec-list");
      const paint = () => {
        list.innerHTML = "";
        design.sections.forEach((s, i) => {
          const def = SECTIONS.find((x) => x.id === s.id);
          const li = el("li", "sec-item");
          li.draggable = true;
          const h = el("span", "drag");
          h.appendChild(icon("i-drag"));
          li.append(
            h,
            el("strong", null, def.label),
            toggleSw(s.enabled, (v) => {
              s.enabled = v;
              change();
              setTimeout(() => pv.scrollTo(s.id), 120);
            }),
          );
          li.addEventListener("click", (e) => {
            if (!e.target.closest(".sw")) pv.scrollTo(s.id);
          });
          li.addEventListener("dragstart", (e) => {
            li.classList.add("is-drag");
            e.dataTransfer.setData("text/plain", String(i));
            e.dataTransfer.effectAllowed = "move";
          });
          li.addEventListener("dragend", () => li.classList.remove("is-drag"));
          li.addEventListener("dragover", (e) => {
            e.preventDefault();
            li.classList.add("is-over");
          });
          li.addEventListener("dragleave", () =>
            li.classList.remove("is-over"),
          );
          li.addEventListener("drop", (e) => {
            e.preventDefault();
            const from = +e.dataTransfer.getData("text/plain");
            if (from === i) return;
            const [m] = design.sections.splice(from, 1);
            design.sections.splice(i, 0, m);
            paint();
            change();
          });
          list.appendChild(li);
        });
      };
      paint();
      return [
        el(
          "p",
          "panel-desc",
          "Activez, masquez et réordonnez par glisser-déposer. L'ordre s'applique au site livré.",
        ),
        list,
      ];
    },

    /* ── Site : assistant ── */
    agent: () => [
      group(
        "Présence",
        ctl(
          "Position",
          S("agent.position", [
            ["right", "Bas droite"],
            ["left", "Bas gauche"],
          ]),
        ),
        switchRow(
          "Ouvrir automatiquement le chat",
          design.agent.autoOpen,
          bind("agent.autoOpen"),
          "après quelques secondes",
        ),
        ctl(
          "Nom de l'assistant",
          textIn(design.agent.name, bind("agent.name"), {
            max: 40,
            placeholder: "Assistant",
          }),
        ),
        ctl(
          "Avatar",
          fileIn("Choisir un avatar", {
            accept: "image/png,image/jpeg,image/svg+xml,image/webp",
            maxKB: 150,
            value: design.agent.avatar,
            onData: bind("agent.avatar"),
          }),
        ),
        ctl(
          "Message d'accueil",
          textIn(design.agent.greeting, bind("agent.greeting"), {
            area: true,
            max: 240,
          }),
        ),
      ),
      group(
        "Comportement",
        ctl(
          "Ton",
          S("agent.tone", [
            ["professional", "Professionnel"],
            ["friendly", "Amical"],
            ["direct", "Direct"],
            ["premium", "Premium"],
          ]),
        ),
        ctl(
          "Formalité",
          S("agent.formality", [
            ["vous", "Vouvoiement"],
            ["tu", "Tutoiement"],
          ]),
        ),
        ctl(
          "Questions de qualification (max.)",
          range(0, 5, design.agent.maxQuestions, bind("agent.maxQuestions")),
        ),
      ),
      group(
        "Conversion",
        switchRow(
          "Collecter l'email",
          design.agent.collectEmail,
          bind("agent.collectEmail"),
        ),
        switchRow(
          "Collecter le téléphone",
          design.agent.collectPhone,
          bind("agent.collectPhone"),
        ),
        switchRow(
          "Proposer un rendez-vous",
          design.agent.booking,
          bind("agent.booking"),
        ),
        ctl(
          "Message après conversion",
          textIn(design.agent.afterMsg, bind("agent.afterMsg"), {
            max: 160,
            placeholder: "Merci, nous revenons vers vous très vite.",
          }),
        ),
      ),
    ],

    /* ── Site : mobile ── */
    resp: () => [
      group(
        "Mobile",
        ctl(
          "Navigation mobile",
          S("responsive.navMobile", [
            ["hamburger", "Menu hamburger"],
            ["inline", "Liens visibles"],
          ]),
        ),
        ctl(
          "Taille du texte mobile",
          range(
            90,
            110,
            design.responsive.textScale,
            bind("responsive.textScale"),
            (v) => v + " %",
          ),
        ),
        switchRow(
          "Bouton d'action collant en bas",
          design.responsive.stickyCta,
          bind("responsive.stickyCta"),
        ),
        switchRow(
          "Masquer l'image du hero",
          design.responsive.hideHero,
          bind("responsive.hideHero"),
        ),
      ),
      el(
        "p",
        "panel-desc",
        "Bascule l'aperçu sur Mobile (icône en haut à droite de l'aperçu) pour voir l'effet.",
      ),
    ],
  };

  const TABS = [
    ["--g1", "Édition"],
    ["edit", "Éditeur d'éléments", "i-pen"],
    ["--g2", "Apparence"],
    ["style", "Style", "i-palette"],
    ["shape", "Formes", "i-box"],
    ["layout", "Mise en page", "i-layout"],
    ["media", "Images", "i-image"],
    ["motion", "Mouvement", "i-play"],
    ["nav", "Navigation", "i-menu"],
    ["--g3", "Site"],
    ["content", "Contenu", "i-type"],
    ["sections", "Sections", "i-grid"],
    ["agent", "Assistant", "i-message"],
    ["resp", "Mobile", "i-phone"],
  ];

  /* ── Coque : onglets | réglages | aperçu, pied en dessous ── */
  const shell = el("div", "adv");
  const tabs = el("nav", "adv-tabs");
  const pane = el("div", "adv-pane");
  const side = el("div", "adv-side");
  const foot = el("div", "adv-foot");
  side.appendChild(pv.node);

  const cancel = actionBtn("Annuler les changements", null, () => {
    restore(snapshot);
    closeModal();
  });
  // Remet les réglages avancés à zéro ; les couleurs et la marque du studio sont conservées.
  const reset = actionBtn("Réinitialiser", null, () => {
    const keep = { colors: design.colors, brand: design.brand };
    restore({ ...normalizeDesign(DESIGN_DEFAULTS()), ...keep });
    change();
    show(current);
  });
  reset.title =
    "Remet les réglages avancés à zéro (couleurs et marque conservées)";
  const spacer = el("span");
  spacer.style.flex = "1";
  foot.append(
    reset,
    spacer,
    cancel,
    actionBtn("Terminer", "primary", closeModal),
  );

  function show(id, keepScroll) {
    const y = keepScroll ? pane.scrollTop : 0;
    current = id;
    pv.setEdit(id === "edit", activeRole);
    tabs
      .querySelectorAll("button[data-id]")
      .forEach((b) => b.classList.toggle("is-on", b.dataset.id === id));
    pane.innerHTML = "";
    pane.appendChild(el("h3", null, TABS.find((t) => t[0] === id)[1]));
    TAB[id]().forEach((n) => pane.appendChild(n));
    pane.scrollTop = y;
  }
  TABS.forEach(([id, label, ic]) => {
    if (id.startsWith("--")) {
      tabs.appendChild(el("p", "adv-group", label));
      return;
    }
    const b = el("button");
    b.type = "button";
    b.dataset.id = id;
    b.append(icon(ic), el("span", null, label));
    b.addEventListener("click", () => show(id));
    tabs.appendChild(b);
  });

  shell.append(tabs, pane, side, foot);
  modal("Personnalisation avancée", [shell]);
  $("#overlay .modal").classList.add("modal-wide");
  state.onModalClose = onClose;
  show("style");
}
/* ══════════════════════════════════════════════════════════════════
   ÉCHANGES AVEC LE BACK
   ══════════════════════════════════════════════════════════════════ */

const PHASE_STEPS = {
  idea: [
    "Analyse du besoin",
    "Identification du domaine",
    "Sélection des capacités",
  ],
  understanding: [
    "Vérification des intégrations",
    "Définition de l'architecture",
  ],
  exploration: ["Définition de l'architecture", "Préparation des parcours"],
  design: ["Composition de l'identité", "Préparation de l'interface"],
  validation: ["Contrôle de cohérence", "Vérification des dépendances"],
};

async function send(message, { silent = false, payload = {}, echo } = {}) {
  if (state.busy || !state.projectId) return;
  state.busy = true;
  sendBtn.disabled = true;

  if (!silent) addUser(message);
  else if (echo) addUser(echo);

  const think = startThinking(
    PHASE_STEPS[state.project?.phase] || PHASE_STEPS.idea,
  );

  try {
    const data = await api(`/api/aigent/projects/${state.projectId}/chat`, {
      method: "POST",
      body: { message, ...payload },
    });
    think.done();

    state.project = {
      ...(state.project || {}),
      phase: data.phase,
      spec: data.spec,
    };
    addAgent(data.reply, renderPanelSafe(data.panel));
    noteChange(data);
    $("#undoBtn").disabled = !data.canUndo;
    refreshHeader();
  } catch (err) {
    think.done();
    console.error("[send]", err);
    if (err.message !== "session") {
      addAgent(
        "La requête n'a pas abouti. Reformulez ou réessayez dans un instant.",
      );
    }
  } finally {
    state.busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function noteChange(data) {
  if (!data?.spec) return;
  state.changes.unshift({
    at: now(),
    label:
      data.panel?.type === "built"
        ? "Projet construit"
        : data.panel?.title || `Conception ${data.progress} %`,
  });
  state.changes = state.changes.slice(0, 12);
  if (!panel.hidden) renderProjectPanel();
}

/* ── Construction en direct (SSE) ─────────────────────────────────── */
// APRÈS — remplace intégralement la fonction, ainsi que l'ajout de
// startAgentBuild() juste avant

/** Bloc "L'équipe AiGENT travaille" : liste de tâches dynamique, chaque
 *  ligne identifiée par id, mise à jour indépendamment (support du
 *  parallélisme réel de l'équipe multi-agents). Réutilise les classes CSS
 *  existantes (.thinking .steps .step .dot .is-active .is-done). */
function startAgentBuild() {
  const block = el("div", "thinking");
  const mark = el("div", "agent-mark");
  mark.appendChild(drawnMark(40));
  const body = el("div", "body");
  body.appendChild(el("h4", null, "L'équipe AiGENT travaille"));
  const list = el("div", "steps");
  body.appendChild(list);
  block.append(mark, body);
  thread.appendChild(block);
  scroll();
  composer.classList.add("is-busy");

  const rows = new Map();

  function setPlan(steps) {
    list.innerHTML = "";
    rows.clear();
    (steps || []).forEach((s) => {
      const row = el("div", "step");
      const dot = el("span", "dot");
      dot.appendChild(icon("i-check"));
      const label = s.agent ? `${s.agent} — ${s.label}` : s.label;
      row.append(dot, el("span", null, label));
      list.appendChild(row);
      rows.set(s.id, row);
    });
  }

  function setStatus(id, status) {
    const row = rows.get(id);
    if (!row) return;
    row.classList.remove("is-active", "is-done", "is-error");
    if (status === "active") row.classList.add("is-active");
    else if (status === "done") row.classList.add("is-done");
    else if (status === "error") row.classList.add("is-error");
  }

  return {
    setPlan,
    setStatus,
    done() {
      composer.classList.remove("is-busy");
      block.remove();
    },
  };
}

function startBuild() {
  const think = startAgentBuild();
  const url = `/api/aigent/projects/${state.projectId}/build/stream?token=${encodeURIComponent(token())}`;
  const source = new EventSource(url);

  source.onmessage = async (event) => {
    if (event.data === "[DONE]") {
      source.close();
      return;
    }
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "plan") {
      think.setPlan(msg.steps);
      return;
    }
    if (msg.type === "step") {
      think.setStatus(msg.id, msg.status);
      return;
    }

    if (msg.type === "done") {
      source.close();
      think.done();
      await loadProject(state.projectId, { quiet: true });
      const built = {
        type: "built",
        title: "Votre AiGENT est prêt",
        manifest: msg.manifest,
        previewUrl: msg.previewUrl,
        checks: [
          { label: "Architecture construite" },
          { label: "Contenu rédigé par l'équipe éditoriale" },
          { label: "Interface créée" },
          { label: "Backend préparé" },
          { label: "Contrôle sécurité effectué" },
          { label: "Configuration générée" },
          { label: "Dépendances identifiées" },
          { label: "Projet testable" },
        ],
        missingServices: (msg.manifest?.integrations || []).map((i) => ({
          label: i.label,
          env: i.env,
          reason: i.reason,
        })),
      };
      state.build = msg.manifest;
      addAgent(
        `Votre AiGENT est construit. Il reste ${(msg.manifest?.integrations || []).length} service(s) à connecter dans votre fichier .env.`,
        renderPanel(built),
      );
      state.shots = [];
      openProjectPanel();
      runPreviews(msg.manifest);
    }

    if (msg.type === "error") {
      source.close();
      think.done();
      addAgent(
        "La construction a échoué. Vos décisions sont conservées : réessayez depuis le récapitulatif.",
      );
    }
  };

  source.onerror = () => {
    source.close();
    think.done();
    addAgent("La connexion au serveur de construction a été interrompue.");
  };
}

/* ══════════════════════════════════════════════════════════════════
   PANNEAU DROIT — visible uniquement après construction
   ══════════════════════════════════════════════════════════════════ */

function openProjectPanel() {
  panel.hidden = false;
  shell.classList.add("has-panel");
  renderProjectPanel();
}
function closeProjectPanel() {
  panel.hidden = true;
  shell.classList.remove("has-panel");
}

function renderProjectPanel() {
  const spec = state.project?.spec || {};
  panelBody.innerHTML = "";

  const id = el("div", "panel-id");
  const mark = el("div", "mark");
  mark.appendChild(logoImg(24));
  const txt = el("div");
  txt.appendChild(
    el("h2", null, spec.name || state.project?.name || "Votre AiGENT"),
  );
  txt.appendChild(el("span", "badge ok", "Prêt à utiliser"));
  id.append(mark, txt);
  panelBody.appendChild(id);

  if (spec.purpose) panelBody.appendChild(el("p", "panel-desc", spec.purpose));

  const test = el("button", "btn primary full");
  test.append(icon("i-play"), el("span", null, "Tester l'AiGENT"));
  test.addEventListener("click", openSandbox);
  panelBody.appendChild(test);

  // Aperçu du site
  if (state.shots.length) {
    const sec = el("section", "panel-section");
    sec.appendChild(el("h3", null, "Aperçu du site"));
    const strip = el("div", "panel-shots");
    state.shots.forEach((s, i) => {
      const b = el("button", "panel-shot");
      b.title = s.label;
      const im = new Image();
      im.src = shotSrc(s.url);
      im.alt = s.label;
      b.appendChild(im);
      b.addEventListener("click", () => openLightbox(state.shots, i));
      strip.appendChild(b);
    });
    sec.appendChild(strip);
    panelBody.appendChild(sec);
  } else if (state.build?.shots?.length && !state.shooting) {
    const gen = el("button", "row-btn");
    gen.append(icon("i-globe"), el("span", null, "Générer l'aperçu du site"));
    gen.addEventListener("click", () => runPreviews(state.build));
    panelBody.appendChild(gen);
  }

  // Actions rapides
  const quick = el("section", "panel-section");
  quick.appendChild(el("h3", null, "Actions rapides"));
  const rows = [
    ["i-pen", "Modifier la configuration", openConfig],
    ["i-book", "Voir les connaissances", openKnowledge],
    ["i-tool", "Gérer les outils", openTools],
    ["i-export", "Exporter l'AiGENT", () => download("zip")],
  ];
  rows.forEach(([ico, label, fn]) => {
    const b = el("button", "row-btn");
    b.append(icon(ico), el("span", null, label));
    b.addEventListener("click", fn);
    quick.appendChild(b);
  });
  panelBody.appendChild(quick);

  // Changements
  if (state.changes.length) {
    const sec = el("section", "panel-section");
    sec.appendChild(el("h3", null, "Changements"));
    const list = el("div", "changes");
    state.changes.forEach((c) => {
      const row = el("div", "change");
      row.append(el("time", null, c.at), el("span", null, c.label));
      list.appendChild(row);
    });
    sec.appendChild(list);
    panelBody.appendChild(sec);
  }

  // Exports
  const exp = el("section", "panel-section");
  exp.appendChild(el("h3", null, "Export possible"));
  const list = el("div", "export-list");
  const items = [
    [
      "i-globe",
      "AiGENT Web",
      "Utilisation directe",
      () => window.open(`/a/${state.project.slug}`, "_blank"),
    ],
    [
      "i-code",
      "Widget",
      "Intégration sur votre site",
      () => download("widget"),
    ],
    ["i-cloud", "API", "Intégration personnalisée", openApi],
    ["i-box", "Projet Node.js", "Code source complet", () => download("zip")],
    ["i-braces", "JSON", "Configuration complète", () => download("json")],
  ];
  items.forEach(([ico, title, sub, fn]) => {
    const b = el("button", "export-item");
    const box = el("span", "ico");
    box.appendChild(icon(ico));
    const t = el("div");
    t.append(el("strong", null, title), el("span", null, sub));
    b.append(box, t);
    b.addEventListener("click", fn);
    list.appendChild(b);
  });
  exp.appendChild(list);
  panelBody.appendChild(exp);
}

/* ── Bac à sable ──────────────────────────────────────────────────── */
function openSandbox() {
  const box = el("div", "sandbox");
  const thread2 = el("div", "sandbox-thread");
  const greet =
    state.project?.spec?.interface?.greeting ||
    "Bonjour, comment puis-je vous aider ?";
  thread2.appendChild(el("div", "sandbox-msg agent", greet));

  const form = el("form", "sandbox-form");
  const field = el("input");
  field.placeholder = "Posez une question à votre AiGENT…";
  const btn = el("button", null);
  btn.type = "submit";
  btn.appendChild(icon("i-send"));
  form.append(field, btn);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = field.value.trim();
    if (!msg) return;
    field.value = "";
    thread2.appendChild(el("div", "sandbox-msg user", msg));
    const pending = el("div", "sandbox-msg agent", "…");
    thread2.appendChild(pending);
    thread2.scrollTop = thread2.scrollHeight;
    try {
      const data = await api(`/api/aigent/projects/${state.projectId}/test`, {
        method: "POST",
        body: { message: msg },
      });
      pending.textContent = data.reply;
    } catch {
      pending.textContent = "Le bac à sable n'a pas répondu.";
    }
    thread2.scrollTop = thread2.scrollHeight;
  });

  box.append(thread2, form);
  modal("Tester l'AiGENT", [
    el(
      "p",
      "panel-desc",
      "Test réalisé avec l'infrastructure AiGENT. Le projet exporté, lui, utilisera vos propres clés.",
    ),
    box,
  ]);
  setTimeout(() => field.focus(), 60);
}

/* ── Code ─────────────────────────────────────────────────────────── */
async function openCode() {
  let data;
  try {
    data = await api(`/api/aigent/projects/${state.projectId}/files`);
  } catch {
    return toast("Construisez d'abord votre AiGENT.");
  }

  const layout = el("div", "code-layout");
  const tree = el("div", "file-tree");
  const pre = el("pre", "code", "Choisissez un fichier.");

  data.files.forEach((path) => {
    const b = el("button", null, path);
    b.addEventListener("click", async () => {
      tree
        .querySelectorAll("button")
        .forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      pre.textContent = "…";
      const file = await api(
        `/api/aigent/projects/${state.projectId}/files?path=${encodeURIComponent(path)}`,
      );
      pre.textContent = file.content;
    });
    tree.appendChild(b);
  });

  layout.append(tree, pre);
  modal(`Code source — ${data.files.length} fichiers`, [layout]);
  tree.querySelector("button")?.click();
}

/* ── Configuration, connaissances, outils, API ───────────────────── */
function openConfig() {
  const spec = state.project?.spec || {};
  const fields = [];
  const mk = (label, key, value, multiline) => {
    const f = el("div", "field");
    f.appendChild(el("label", null, label));
    const node = multiline ? el("textarea") : el("input");
    node.value = value || "";
    if (multiline) node.rows = 3;
    node.dataset.key = key;
    f.appendChild(node);
    fields.push(node);
    return f;
  };

  const save = el("button", "btn primary", "Enregistrer");
  save.addEventListener("click", async () => {
    const patch = {};
    fields.forEach((f) => (patch[f.dataset.key] = f.value.trim() || null));
    await api(`/api/aigent/projects/${state.projectId}/patch`, {
      method: "POST",
      body: { patch },
    });
    await loadProject(state.projectId, { quiet: true });
    renderProjectPanel();
    closeModal();
    toast("Configuration enregistrée");
  });

  modal("Configuration", [
    mk("Nom", "name", spec.name),
    mk("Description", "tagline", spec.tagline),
    mk("Mission", "purpose", spec.purpose, true),
    mk("Utilisateurs", "audience", spec.audience),
    mk("Message d'accueil", "greeting", spec.interface?.greeting),
    save,
  ]);
}

function openKnowledge() {
  const list = state.project?.spec?.knowledge || [];
  const table = el("table", "table");
  list.forEach((k) => {
    const tr = el("tr");
    tr.append(
      el("th", null, k.label),
      el("td", null, `${k.type} · à remplir dans knowledge/`),
    );
    table.appendChild(tr);
  });
  modal("Connaissances", [
    el(
      "p",
      "panel-desc",
      "Chaque entrée devient un fichier markdown dans le dossier knowledge/ du projet exporté.",
    ),
    list.length
      ? table
      : el("p", "panel-desc", "Aucune connaissance définie pour l'instant."),
  ]);
}

function openTools() {
  const enabled = new Set((state.project?.spec?.tools || []).map((t) => t.id));
  const grid = el("div", "toggle-grid");
  const next = new Map();

  (state.catalog?.tools || []).forEach((t) => {
    const on = enabled.has(t.id);
    next.set(t.id, on);
    const b = el("button", "toggle" + (on ? " is-on" : ""));
    const box = el("span", "box");
    box.appendChild(icon("i-check"));
    const txt = el("div");
    txt.append(el("strong", null, t.label), el("span", null, t.description));
    if (t.service)
      txt.appendChild(el("em", null, `Service requis : ${t.service}`));
    b.append(box, txt);
    b.addEventListener("click", () => {
      const v = !next.get(t.id);
      next.set(t.id, v);
      b.classList.toggle("is-on", v);
    });
    grid.appendChild(b);
  });

  const save = el("button", "btn primary", "Enregistrer les outils");
  save.addEventListener("click", async () => {
    const tools = [...next.entries()].map(([id, on]) =>
      on ? { id } : { id, _remove: true },
    );
    await api(`/api/aigent/projects/${state.projectId}/patch`, {
      method: "POST",
      body: { patch: { tools } },
    });
    await loadProject(state.projectId, { quiet: true });
    renderProjectPanel();
    closeModal();
    toast("Outils mis à jour. Reconstruisez pour appliquer.");
  });

  modal("Outils", [grid, save]);
}

function openApi() {
  const base = location.origin;
  const snippet =
    `curl -X POST ${base}/api/chat \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"message":"Bonjour"}'`;
  modal("API", [
    el(
      "p",
      "panel-desc",
      "Le projet exporté expose /api/chat et /api/tools sur votre propre serveur.",
    ),
    (() => {
      const p = el("pre", "code", snippet);
      return p;
    })(),
  ]);
}

function download(format) {
  const url = `/api/aigent/projects/${state.projectId}/export?format=${format}&token=${encodeURIComponent(token())}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(
    format === "json" ? "Configuration téléchargée" : "Archive en préparation",
  );
}

/* ══════════════════════════════════════════════════════════════════
   MODALE
   ══════════════════════════════════════════════════════════════════ */
function modal(title, nodes) {
  $("#overlay .modal").classList.remove("modal-wide");
  $("#modalTitle").textContent = title;
  const body = $("#modalBody");
  body.innerHTML = "";
  nodes.forEach((n) => body.appendChild(n));
  $("#overlay").hidden = false;
}
function closeModal() {
  $("#overlay").hidden = true;
  state.lightbox = null;
  const cb = state.onModalClose;
  state.onModalClose = null;
  cb?.();
}

$("#modalClose").addEventListener("click", closeModal);
$("#overlay").addEventListener("click", (e) => {
  if (e.target === $("#overlay")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (state.lightbox && e.key === "ArrowRight") state.lightbox.step(1);
  if (state.lightbox && e.key === "ArrowLeft") state.lightbox.step(-1);
  // « / » ramène au champ de saisie, comme sur les outils qu'on aime
  if (
    e.key === "/" &&
    !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) &&
    $("#overlay").hidden
  ) {
    e.preventDefault();
    input.focus();
  }
});

/* ══════════════════════════════════════════════════════════════════
   VUES
   ══════════════════════════════════════════════════════════════════ */

function refreshHeader() {
  const spec = state.project?.spec || {};
  $("#projectTitle").textContent = spec.name || state.project?.name || "AiGENT";
  document.title = (spec.name ? spec.name + " — " : "") + "AiGENT";
  $("#projectSub").textContent =
    spec.tagline ||
    {
      idea: "Votre intelligence centralisée",
      understanding: "Compréhension",
      exploration: "Conception",
      design: "Conception",
      validation: "Validation",
      build: "Construction",
      test: "Test",
      export: "Export",
    }[state.project?.phase] ||
    "Votre intelligence centralisée";
}

function renderWelcome() {
  thread.innerHTML = "";

  const wrap = el("div", "empty empty-welcome");

  const intro = el("div", "welcome-intro");

  intro.appendChild(el("h2", null, "Quel AiGENT voulez-vous créer ?"));

  intro.appendChild(
    el(
      "p",
      null,
      "Décrivez simplement ce que vous voulez automatiser. Je m’occupe de concevoir votre AiGENT.",
    ),
  );

  wrap.appendChild(intro);

  const suggestions = el("div", "welcome-suggestions");

  suggestions.appendChild(
    el("div", "welcome-suggestions-label", "Quelques idées pour commencer"),
  );

  const prompts = el("div", "welcome-prompts");

  const examples = [
    {
      title: "Restaurant",
      text: "Clients & réservations",
      prompt:
        "Je veux créer un AiGENT pour mon restaurant qui répond aux clients, connaît mon menu et gère les réservations.",
    },
    {
      title: "Cabinet",
      text: "Questions & rendez-vous",
      prompt:
        "Un assistant pour mon cabinet qui répond aux questions courantes et prend les demandes de rendez-vous.",
    },
    {
      title: "E-commerce",
      text: "Commandes & support",
      prompt:
        "Un AiGENT support pour mon site e-commerce : suivi de commande, retours, questions produits.",
    },
  ];

  examples.forEach(({ title, text, prompt }) => {
    const b = el("button", "welcome-prompt");

    const content = el("span", "welcome-prompt-content");
    content.appendChild(el("strong", null, title));
    content.appendChild(el("span", null, text));

    const arrow = el("span", "welcome-prompt-arrow");
    arrow.innerHTML = `
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4.5 11.5 11.5 4.5"></path>
    <path d="M6.5 4.5h5v5"></path>
  </svg>
`;

    b.appendChild(content);
    b.appendChild(arrow);

    b.addEventListener("click", () => {
      input.value = prompt;
      input.dispatchEvent(new Event("input"));
      input.focus();
    });

    prompts.appendChild(b);
  });

  suggestions.appendChild(prompts);
  wrap.appendChild(suggestions);

  thread.appendChild(wrap);
}

async function renderProjects() {
  closeProjectPanel();
  thread.innerHTML = "";
  const { projects } = await api("/api/aigent/projects");
  const wrap = el("div", "empty");
  wrap.appendChild(el("h2", null, "Mes AiGENT"));

  if (!projects.length) {
    wrap.appendChild(
      el(
        "p",
        null,
        "Aucun AiGENT pour l'instant. Décrivez votre idée dans le chat pour en créer un.",
      ),
    );
    thread.appendChild(wrap);
    return;
  }

  const grid = el("div", "project-grid");
  projects.forEach((p) => {
    const c = el("button", "project-card");
    c.appendChild(el("h4", null, p.name));
    c.appendChild(
      el(
        "p",
        null,
        p.tagline ||
          { draft: "En conception", built: "Construit", exported: "Exporté" }[
            p.status
          ],
      ),
    );
    const bar = el("div", "bar");
    const i = el("i");
    i.style.width = `${p.progress}%`;
    bar.appendChild(i);
    c.appendChild(bar);
    c.addEventListener("click", () => {
      setView("chat");
      loadProject(p.id);
    });
    grid.appendChild(c);
  });
  wrap.appendChild(grid);
  thread.appendChild(wrap);
}

function renderSettings() {
  closeProjectPanel();
  thread.innerHTML = "";
  const wrap = el("div", "empty");
  wrap.appendChild(el("h2", null, "Paramètres"));
  wrap.appendChild(
    el(
      "p",
      null,
      `Connecté en tant que ${state.account?.username} via ${state.account?.sourceLabel}.`,
    ),
  );

  const out = el("button", "btn", "Se déconnecter");
  out.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    location.href = LOGIN_PAGE;
  });
  wrap.appendChild(out);
  thread.appendChild(wrap);
}

function setView(view) {
  state.view = view;
  document
    .querySelectorAll(".nav-item")
    .forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  if (view === "mine") renderProjects();
  else if (view === "settings") renderSettings();
  else if (view === "create") newProject();
  else if (view === "home" || view === "chat") {
    if (!state.projectId) renderWelcome();
  }
}

document
  .querySelectorAll(".nav-item")
  .forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

/* ══════════════════════════════════════════════════════════════════
   PROJETS
   ══════════════════════════════════════════════════════════════════ */

async function newProject() {
  const { project } = await api("/api/aigent/projects", {
    method: "POST",
    body: { name: "Nouveau AiGENT" },
  });
  state.projectId = project.id;
  state.project = project;
  state.changes = [];
  closeProjectPanel();
  thread.innerHTML = "";
  renderWelcome();
  refreshHeader();
  setView("chat");
  input.focus();
}

async function loadProject(id, { quiet = false } = {}) {
  const data = await api(`/api/aigent/projects/${id}`);
  state.projectId = id;
  state.project = data.project;
  state.build = data.build?.manifest || null;
  state.shots = data.previews || [];
  $("#undoBtn").disabled = !data.project.canUndo;
  refreshHeader();

  if (!quiet) {
    thread.innerHTML = "";
    if (!data.messages.length) renderWelcome();
    data.messages.forEach((m) => {
      if (m.role === "user") addUser(m.content);
      else addAgent(m.content, renderPanelSafe(m.panel));
    });
  }

  if (data.project.status !== "draft") openProjectPanel();
}

/* ══════════════════════════════════════════════════════════════════
   COMPOSER
   ══════════════════════════════════════════════════════════════════ */

const syncComposer = () =>
  (composer.dataset.empty = String(!input.value.trim()));
syncComposer();
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
  syncComposer();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  input.style.height = "auto";
  syncComposer();
  if (!state.projectId) await newProject();
  if (thread.querySelector(".empty")) thread.innerHTML = "";
  send(message);
});

$("#attachBtn").addEventListener("click", () =>
  toast("L'import de documents arrive avec la base de connaissances."),
);
$("#micBtn").addEventListener("click", () =>
  toast("La dictée n'est pas encore disponible."),
);

$("#undoBtn").addEventListener("click", async () => {
  const data = await api(`/api/aigent/projects/${state.projectId}/undo`, {
    method: "POST",
  });
  state.project.spec = data.spec;
  $("#undoBtn").disabled = !data.canUndo;
  refreshHeader();
  addAgent(
    "J'ai annulé la dernière décision. La conception est revenue à l'état précédent.",
  );
});

$("#themeBtn").addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("aigent_theme", next);
});

$("#panelBack").addEventListener("click", closeProjectPanel);
$("#panelMore").addEventListener("click", openConfig);
$("#menuBtn").addEventListener("click", () => {
  if (state.projectId) openCode();
});

const SHOT_W = 1440;
const SHOT_H = 900;
const XHTML = "http://www.w3.org/1999/xhtml";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(test, timeout = 6000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) {
    try {
      if (test()) return true;
    } catch {}
    await wait(40);
  }
  return false;
}

/** Iframe à taille d'écran de bureau : invisible, mais réellement affichée. */
function openShotFrame() {
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  f.style.cssText = `position:fixed;left:0;top:0;width:${SHOT_W}px;height:${SHOT_H}px;border:0;opacity:0;pointer-events:none;z-index:-1`;
  document.body.appendChild(f);
  return f;
}

/** Amène le site à l'écran voulu et attend qu'il soit réellement prêt. */
async function stageShot(frame, slug, shot, n) {
  await new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = reject;
    // « _ » rend chaque URL unique : un simple changement de « # » ne recharge pas la page.
    frame.src = `/a/${slug}?__shot=${shot.mode || "guest"}&_=${n}#${shot.hash}`;
  });
  const doc = frame.contentDocument;
  await until(() => doc.querySelector("#view h1, #view .auth"), 8000);
  await until(() => !doc.querySelector("#view.loading, .skeleton"), 6000);
  const byText = (t) =>
    [...doc.querySelectorAll("button, a")].find((b) =>
      b.textContent.includes(t),
    );
  if (shot.clickText) {
    await until(() => byText(shot.clickText), 4000);
    byText(shot.clickText)?.click();
  }
  if (shot.waitFor) await until(() => doc.querySelector(shot.waitFor), 4000);
  await doc.fonts?.ready;
  await wait(140);
  return doc;
}

/** Rasterise la page : DOM vivant → <foreignObject> SVG → canvas. Les feuilles de
 *  style d'origine sont conservées : pseudo-éléments, color-mix(), fixed… restent fidèles. */
async function rasterize(doc, scale = 2) {
  const css =
    [...doc.querySelectorAll("style")].map((s) => s.textContent).join("\n") +
    "\n*{animation:none!important;transition:none!important;caret-color:transparent!important}";
  const wrap = document.createElementNS(XHTML, "div");
  wrap.setAttribute("class", "shot-root shot-body");
  wrap.setAttribute(
    "style",
    `width:${SHOT_W}px;height:${SHOT_H}px;overflow:hidden;position:relative`,
  );
  const style = document.createElementNS(XHTML, "style");
  style.textContent = css;
  wrap.appendChild(style);

  const live = [...doc.body.children].filter(
    (n) => n.tagName !== "SCRIPT" && !n.classList.contains("aigent-badge"),
  );
  live.forEach((n) => wrap.appendChild(document.importNode(n, true)));

  // Les valeurs saisies sont des propriétés, pas du HTML : on les recopie.
  const fields = "input, textarea, select";
  const from = live.flatMap((n) => [...n.querySelectorAll(fields)]);
  const to = [...wrap.querySelectorAll(fields)];
  from.forEach((s, i) => {
    const d = to[i];
    if (!d) return;
    if (s.tagName === "TEXTAREA") d.textContent = s.value;
    else if (s.tagName === "SELECT")
      [...d.options].forEach((o, j) =>
        s.options[j].selected
          ? o.setAttribute("selected", "")
          : o.removeAttribute("selected"),
      );
    else if (s.type === "checkbox" || s.type === "radio") {
      if (s.checked) d.setAttribute("checked", "");
    } else d.setAttribute("value", s.value);
  });

  const xml = new XMLSerializer().serializeToString(wrap);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHOT_W}" height="${SHOT_H}">` +
    `<foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = SHOT_W * scale;
  canvas.height = SHOT_H * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, SHOT_W, SHOT_H);
  return new Promise((res) => canvas.toBlob(res, "image/webp", 0.9));
}

async function captureShots(manifest, slug, onShot) {
  const shots = manifest?.shots || [];
  if (!shots.length || !slug) return [];
  const frame = openShotFrame();
  const out = [];
  try {
    for (let n = 0; n < shots.length; n++) {
      try {
        const doc = await stageShot(frame, slug, shots[n], n);
        const blob = await rasterize(doc);
        // Une capture vide pèse quelques Ko : mieux vaut ne rien montrer qu'un rectangle blanc.
        if (!blob || blob.size < 6000) continue;
        const item = {
          idx: n,
          label: shots[n].label,
          blob,
          url: URL.createObjectURL(blob),
        };
        out.push(item);
        onShot?.(item, n);
      } catch (err) {
        console.warn("[aperçu] écran ignoré :", shots[n].id, err);
      }
    }
  } finally {
    frame.remove();
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   DÉMARRAGE
   ══════════════════════════════════════════════════════════════════ */

(async function boot() {
  document.documentElement.dataset.theme =
    localStorage.getItem("aigent_theme") || "dark";

  if (!token()) {
    location.href = LOGIN_PAGE;
    return;
  }

  try {
    const me = await api("/api/aigent/me");
    state.account = me.account;
    $("#accountName").textContent = me.account.username;
    $("#accountSource").textContent =
      me.account.sourceLabel || me.account.source;
    $("#avatar").textContent = (me.account.username || "?")
      .slice(0, 1)
      .toUpperCase();

    state.catalog = await api("/api/aigent/catalog");

    const { projects } = await api("/api/aigent/projects");
    if (projects.length) await loadProject(projects[0].id);
    else renderWelcome();
  } catch (err) {
    if (err.message !== "session") {
      thread.innerHTML = "";
      const wrap = el("div", "empty");
      wrap.appendChild(el("h2", null, "Connexion au serveur impossible"));
      wrap.appendChild(
        el(
          "p",
          null,
          "Vérifiez que le serveur AiGENT est démarré, puis rechargez la page.",
        ),
      );
      thread.appendChild(wrap);
    }
  }
})();
