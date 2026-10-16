import { readableTickStep } from "./visual-registry.js";
import { planAssembly } from "./assembly-engine.js";
import {
  FAMILIES as FAMILIES_1,
  DATA_FAMILIES as DATA_1,
} from "./diagram-families.js";

import {
  FAMILIES_2,
  DATA_FAMILIES_2,
  inferFamily,
  FAMILY_OPTIONS,
} from "./diagram-families-2.js";

import {
  FAMILIES_3,
  DATA_FAMILIES_3,
  decorate,
  applyArrow,
} from "./diagram-families-3.js";
import { FRAMES, schemaEntry, SCHEMA_BY_ID } from "./schema-types.js";
import { mountCodeView, highlightCode } from "./code-view.js";
import {
  STYLES,
  REPS,
  VIEWS,
  LIGHTS,
  applyStyle,
  applyRep,
  applyLighting,
  makeCamera,
  makeEnv,
  addDimensions,
} from "./render-styles.js";

const FAMILIES = { ...FAMILIES_1, ...FAMILIES_2, ...FAMILIES_3 };
const DATA_FAMILIES = new Set([
  ...DATA_1,
  ...DATA_FAMILIES_2,
  ...DATA_FAMILIES_3,
]);
export { highlightCode };

/* ═══════════════════════════════════════════════════════════════════
   AiGENT Artifact Engine v1
   L'IA remplit un JSON → normalizeArtifact (validation) → layout → rendu.
   Types : plot · diagram · timeline · probtree · scene3d · sheet
   Chaque artefact possède son propre état (zoom, pan, sélection, layers).
   ═══════════════════════════════════════════════════════════════════ */
const NS = "http://www.w3.org/2000/svg";
const PALETTE = [
  "#8d79ff",
  "#e69138",
  "#3988dc",
  "#18a67a",
  "#d4587a",
  "#71823c",
];
const dom = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const svgn = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (parent) parent.append(n);
  return n;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, d = 3) => {
  if (!Number.isFinite(v)) return "—";
  const r = Number(v.toFixed(d));
  return String(r === 0 ? 0 : r).replace(".", ",");
};
const sub = (n) => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);
const raf = (fn) => {
  let q = 0;
  return () => {
    if (!q)
      q = requestAnimationFrame(() => {
        q = 0;
        fn();
      });
  };
};
// APRÈS
const uid = (() => {
  let n = 0;
  return (p = "ax") => `${p}${++n}`;
})();
const visualDebugEnabled = () =>
  ["localhost", "127.0.0.1", "::1"].includes(location.hostname) ||
  new URLSearchParams(location.search).get("visualDebug") === "1";

/* ── Sécurité des expressions mathjs ── */
const BAD_FN =
  /\b(import|createUnit|evaluate|parse|compile|simplify|derivative|resolve|reviver|typed|chain|config|help|eval|Function)\b/i;
const safeExpr = (s) => {
  const t = String(s);
  if (t.length > 300 || BAD_FN.test(t))
    throw new Error("Expression non autorisée");
  return t;
};

/* ── Export : styles CSS inlinés (variables résolues) ── */
const SVG_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "paint-order",
  "display",
];
function inlineStyles(src, dst) {
  const cs = getComputedStyle(src),
    parts = [];
  for (const p of SVG_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v) parts.push(`${p}:${v}`);
  }
  dst.setAttribute("style", parts.join(";"));
  dst.removeAttribute("class");
  for (let i = 0; i < src.children.length; i++)
    if (dst.children[i]) inlineStyles(src.children[i], dst.children[i]);
}
const svgBox = (svg) => {
  const g = svg.querySelector("[data-pz]");
  if (!g) return null;
  const b = g.getBBox();
  return b.width && b.height
    ? { x: b.x, y: b.y, w: b.width, h: b.height }
    : null;
};
function svgMarkup(svg, box) {
  const clone = svg.cloneNode(true);
  inlineStyles(svg, clone);
  let w, h;
  if (box) {
    const pad = 24;
    clone
      .querySelector("[data-pz]")
      .setAttribute("transform", `translate(${pad - box.x} ${pad - box.y})`);
    w = Math.ceil(box.w + pad * 2);
    h = Math.ceil(box.h + pad * 2);
    clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
  } else {
    const vb = svg.viewBox.baseVal;
    w = vb.width || svg.clientWidth;
    h = vb.height || svg.clientHeight;
  }
  clone.setAttribute("xmlns", NS);
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute(
    "fill",
    getComputedStyle(svg).getPropertyValue("--bg").trim() || "#ffffff",
  );
  clone.insertBefore(bg, clone.firstChild);
  return { xml: new XMLSerializer().serializeToString(clone), w, h };
}
async function svgToPng(svg, box, scale = 2) {
  const { xml, w, h } = svgMarkup(svg, box),
    url = URL.createObjectURL(
      new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
    ),
    img = new Image();
  try {
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    const g = c.getContext("2d");
    g.scale(scale, scale);
    g.drawImage(img, 0, 0, w, h);
    return await new Promise((r) => c.toBlob(r, "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
const saveUrl = (name, url) => {
  const a = dom("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
};
const saveBlob = (name, blob) => {
  const url = URL.createObjectURL(blob);
  saveUrl(name, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const fileName = (t, ext) =>
  `${
    String(t || "figure")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "figure"
  }.${ext}`;

/* ── Menu contextuel (clic droit ou bouton ⋯) ── */
function attachMenu(root, items, { context = true } = {}) {
  const menu = dom("div", "ax-menu");
  menu.hidden = true;
  root.append(menu);
  const close = () => {
    menu.hidden = true;
  };
  const open = (cx, cy) => {
    menu.replaceChildren();
    items.forEach((it) => {
      if (it === "|") {
        menu.append(dom("i", "ax-menu-sep"));
        return;
      }
      const b = dom("button", "ax-menu-item", it.label);
      b.type = "button";
      b.onclick = async () => {
        close();
        try {
          await it.run();
        } catch (e) {
          console.warn("[AiGENT menu]", e);
        }
      };
      menu.append(b);
    });
    menu.hidden = false;
    const r = root.getBoundingClientRect();
    menu.style.left = `${clamp(cx - r.left, 6, Math.max(6, r.width - menu.offsetWidth - 6))}px`;
    menu.style.top = `${clamp(cy - r.top, 6, Math.max(6, r.height - menu.offsetHeight - 6))}px`;
  };
  const onDoc = (e) => {
    if (!menu.hidden && !menu.contains(e.target)) close();
  };
  document.addEventListener("pointerdown", onDoc, true);
  track(root, () => document.removeEventListener("pointerdown", onDoc, true));
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  if (context)
    root.addEventListener("contextmenu", (e) => {
      if (!e.target.closest(".ax-stage")) return;
      e.preventDefault();
      open(e.clientX, e.clientY);
    });
  const bar = root.querySelector(":scope > .ax-toolbar");
  if (bar) {
    const b = dom("button", "ax-btn", "⋯");
    b.type = "button";
    b.title = "Plus d’actions";
    b.setAttribute("aria-label", "Plus d’actions");
    b.onclick = (e) => {
      e.stopPropagation();
      const r = b.getBoundingClientRect();
      open(r.right - 170, r.bottom + 6);
    };
    bar.append(b);
  }
}
function figureMenu(a, root, ctx) {
  const svg = root.querySelector("svg.ax-svg"),
    items = [];
  if (ctx.onExpand && !ctx.full)
    items.push({ label: "Ouvrir en grand", run: ctx.onExpand }, "|");
  if (svg)
    items.push(
      {
        label: "Exporter en SVG",
        run: () => {
          const { xml } = svgMarkup(svg, svgBox(svg));
          saveBlob(
            fileName(a.title, "svg"),
            new Blob([xml], { type: "image/svg+xml" }),
          );
        },
      },
      {
        label: "Exporter en PNG",
        run: async () => {
          const b = await svgToPng(svg, svgBox(svg));
          if (b) saveBlob(fileName(a.title, "png"), b);
        },
      },
    );
  if (root.__capture)
    items.push({
      label: "Capture d’écran (PNG)",
      run: () => saveUrl(fileName(a.title, "png"), root.__capture()),
    });
  items.push({
    label: "Copier les données (JSON)",
    run: () => navigator.clipboard.writeText(JSON.stringify(a, null, 2)),
  });
  return items;
}

/* ── Bibliothèques chargées à la demande ── */
const libs = {};
const lazy = (k, url) => (libs[k] ||= import(/* @vite-ignore */ url));
export const loadMath = () =>
  lazy("math", "https://cdn.jsdelivr.net/npm/mathjs@12.4.2/+esm");
export const loadThree = () =>
  lazy(
    "three",
    "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  );
export const loadKatex = () =>
  lazy("katex", "https://cdn.jsdelivr.net/npm/katex@0.16.11/+esm");
const mathLib = async () => {
  const m = await loadMath();
  return m.compile ? m : m.default;
};

/* ═══ 1. NETTOYAGE DU TEXTE ═══ */
export function looksAsciiChart(code) {
  const lines = String(code)
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 5) return false;
  const art = lines.filter((l) =>
    /(^\s*\|)|\+-{3,}|-{4,}>|\s[\/\\]\s*$|^\s*[\/\\|•*]+\s*$/.test(l),
  ).length;
  return art / lines.length >= 0.45;
}
export function isFormulaLine(line) {
  if (
    !/\\(?:frac|sqrt|partial|nabla|vec|cdot|infty|int|sum|prod|alpha|beta|gamma|Delta|neq|leq|geq|rho|mu|tau|text|times|theta|lambda)\b/.test(
      line,
    )
  )
    return false;
  const bare = line
    .replace(/\\text\{[^}]*\}/g, " ")
    .replace(/\\[A-Za-z]+/g, " ");
  return (bare.match(/[A-Za-zÀ-ÿ]{4,}/g) || []).length <= 2;
}
export function sanitizeText(src) {
  let t = String(src ?? "").replace(/\u00a0/g, " ");
  t = t.replace(/\[object (?:Text|Object|Undefined|Node)\]/gi, "");
  t = t.replace(/\[\[\s*\/?\s*AIGENT_?DATA\s*\]\]/gi, "");
  // $…$ contenant du texte français collé (≥14 lettres d'affilée) = formule corrompue → on retire les délimiteurs
  t = t.replace(/\$([^$\n]+)\$/g, (m, f) =>
    /[A-Za-zÀ-ÿ]{14,}/.test(f.replace(/\\[A-Za-z]+/g, "")) ? f : m,
  );
  return t;
}
function parseLooseJson(s) {
  let b = String(s)
    .replace(/```json|```/gi, "")
    .trim();
  const i = b.indexOf("{"),
    j = b.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  b = b.slice(i, j + 1);
  for (const c of [b, b.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(c);
    } catch {}
  }
  return null;
}
/** Récupère un bloc [[AIGENT_DATA]] qui aurait fuité dans le texte visible. */
export function extractLeakedArtifacts(src) {
  const found = [];
  const re =
    /\[\[\s*AIGENT_?DATA\s*\]\]([\s\S]*?)(?:\[\[\s*\/\s*AIGENT_?DATA\s*\]\]|$)/gi;
  const text = String(src ?? "").replace(re, (_, body) => {
    const j = parseLooseJson(body);
    if (j) found.push(j);
    return "";
  });
  return { text: text.trim(), found };
}
export function toArtifact(j) {
  if (!j || typeof j !== "object") return null;
  const body = j.data && typeof j.data === "object" ? j.data : {};
  const a = j.type
    ? { ...j }
    : { ...body, type: j.artifact, title: j.title || body.title };
  delete a.artifact;
  delete a.recommendedMode;
  delete a.suggestions;
  return a.type ? a : null;
}

/* ═══ 2. SÉMANTIQUE & NORMALISATION (validation avant rendu) ═══ */
const KINDS = {
  process: { label: "Processus", c: "#7f8aa3" },
  step: { label: "Étape", c: "#7f8aa3" },
  decision: { label: "Décision", c: "#d99a2b" },
  data: { label: "Données", c: "#2fa38a" },
  actor: { label: "Acteur", c: "#4f8fe0" },
  document: { label: "Résultat / document", c: "#b08968" },
  service: { label: "Service", c: "#6b7fd7" },
  cloud: { label: "Réseau / cloud", c: "#4aa3c7" },
  capsule: { label: "Début / fin", c: "#8a8f9c" },
  hexagon: { label: "Système", c: "#6aa6b5" },
  circle: { label: "Événement", c: "#d4587a" },
  rounded: { label: "Élément", c: "#7f8aa3" },
};
const REL = {
  leads_to: { label: "mène à" },
  depends_on: { label: "dépend de", dash: "6 5" },
  triggers: { label: "déclenche" },
  produces: { label: "produit", start: "dot" },
  contains: { label: "contient", start: "dia", end: false },
  transforms: { label: "transforme", w: 2.6 },
  communicates: { label: "communique avec", both: true },
  causes: { label: "cause", w: 2.2 },
};
function inferKind(n) {
  const t = `${n.label} ${n.detail || ""}`.toLowerCase();
  if (/base de donn|database|\bsql\b|bdd|stockage|donn[ée]es|dataset/.test(t))
    return "data";
  if (/\?\s*$|d[ée]cision|condition|valide[rz]?\b|choix|test(e|er)? /.test(t))
    return "decision";
  if (
    /utilisateur|client|[ée]l[èe]ve|professeur|acteur|\buser\b|admin|visiteur/.test(
      t,
    )
  )
    return "actor";
  if (
    /document|rapport|\bpdf\b|fichier|r[ée]sultat|livrable|sortie|bilan/.test(t)
  )
    return "document";
  if (
    /\bapi\b|service|serveur|module|composant|backend|frontend|microservice|application/.test(
      t,
    )
  )
    return "service";
  if (/cloud|internet|r[ée]seau|\bweb\b/.test(t)) return "cloud";
  if (/^(d[ée]but|start|fin|end|d[ée]marrage)\b/.test(t)) return "capsule";
  return "process";
}
export function normalizeArtifact(a) {
  if (!a || typeof a !== "object") return a;
  const o = { ...a },
    num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d),
    warn = [];
  if (o.type === "diagram" && !DATA_FAMILIES.has(o.semanticType)) {
    const seen = new Set();
    o.nodes = (o.nodes || [])
      .filter(
        (n) =>
          n &&
          n.id != null &&
          n.label != null &&
          !seen.has(String(n.id)) &&
          seen.add(String(n.id)),
      )
      .slice(0, 60)
      .map((n) => ({
        ...n,
        id: String(n.id),
        label: String(n.label).slice(0, 80),
        detail: n.detail ? String(n.detail).slice(0, 140) : "",
        kind: KINDS[n.kind] ? n.kind : inferKind(n),
      }));
    const ids = new Set(o.nodes.map((n) => n.id)),
      ek = new Set();
    o.edges = (o.edges || [])
      .map((e) => ({ ...e, from: String(e.from), to: String(e.to) }))
      .filter((e) => {
        const k = `${e.from}>${e.to}|${e.label || ""}`;
        const ok =
          ids.has(e.from) && ids.has(e.to) && e.from !== e.to && !ek.has(k);
        if (ok) ek.add(k);
        else warn.push(`arête invalide ${k}`);
        return ok;
      })
      .slice(0, 120);
    // APRÈS
    o.direction = o.direction === "TB" ? "TB" : "LR";
    o.layout = o.layout === "force" ? "force" : "layered";
  } else if (o.type === "plot") {
    o.functions = (o.functions || []).filter((f) => f && f.expr).slice(0, 6);
    o.points = (o.points || []).slice(0, 40);
    o.series = (o.series || []).slice(0, 4);
  } else if (o.type === "timeline") {
    o.events = (o.events || []).filter((e) => e && e.label).slice(0, 40);
  } else if (o.type === "probtree") {
    o.root = o.root || { label: "Départ", children: [] };
  } else if (o.type === "scene3d") {
    o.objects = Array.isArray(o.objects) ? o.objects.slice(0, 400) : [];
    o.relationships = Array.isArray(o.relationships)
      ? o.relationships.slice(0, 800)
      : [];
  } else if (o.type === "map") {
    o.markers = Array.isArray(o.markers) ? o.markers.slice(0, 300) : [];
    o.routes = Array.isArray(o.routes) ? o.routes.slice(0, 100) : [];
  } else if (o.type === "sheet") {
    // APRÈS
    o.columns = (o.columns || []).slice(0, 20);
    o.rows = (o.rows || []).slice(0, 300);
  } else if (o.type === "doc") {
    normalizeDoc(o);
  }
  if (warn.length && visualDebugEnabled())
    console.warn("[AiGENT artefact]", warn.join("; "));
  return o;
}
/** Anciens artefacts du serveur → nouveau moteur (sans toucher au backend). */
export function adaptLegacy(a) {
  if (!a || typeof a !== "object") return null;
  // APRÈS
  if (
    [
      "venturi",
      "boundary-layer",
      "forces",
      "cascade",
      "shock",
      "cfd-grid",
    ].includes(a.variant)
  )
    return null;
  if (a.type === "document" && typeof a.body === "string" && !a.sections)
    return docFromMarkdown(a);
  if (a.type === "report" && Array.isArray(a.sections))
    return {
      type: "doc",
      title: a.title,
      summary: a.summary,
      sections: a.sections.map((s, i) => ({
        id: `s${i}`,
        title: s.title || `Section ${i + 1}`,
        level: 2,
        blocks: [
          ...(s.summary ? [{ type: "text", md: s.summary }] : []),
          { type: "artifact", artifact: s },
        ],
      })),
    };
  if (
    ["diagram", "mindmap", "diagram3d"].includes(a.type) &&
    Array.isArray(a.nodes)
  ) {
    const edges = [...(a.edges || [])];
    (a.nodes || []).forEach((n) => {
      if (n.parent && !edges.some((e) => e.from === n.parent && e.to === n.id))
        edges.push({ from: n.parent, to: n.id });
    });
    // APRÈS
    return {
      ...a,
      type: "diagram",
      semanticType: a.type === "mindmap" ? "mind_map" : a.semanticType,
      edges,
      direction: a.direction || "LR",
      layout: a.layout || (a.type === "mindmap" ? "force" : undefined),
    };
  }
  if (
    a.type === "chart" &&
    a.chartType === "line" &&
    (a.points || []).length > 1 &&
    a.points.every((p) =>
      Number.isFinite(Number(String(p.label).replace(",", "."))),
    )
  ) {
    return {
      type: "plot",
      title: a.title,
      summary: a.summary,
      xLabel: a.xLabel || "x",
      yLabel: a.yLabel || a.unit || "y",
      equal: false,
      series: [
        {
          id: "s1",
          label: a.legend || a.title || "Données",
          mode: "line",
          points: a.points.map((p) => [
            Number(String(p.label).replace(",", ".")),
            Number(p.value),
          ]),
        },
      ],
    };
  }
  return null;
}
// APRÈS
export const ENGINE_TYPES = new Set([
  "code",
  "plot",
  "diagram",
  "timeline",
  "probtree",
  "scene3d",
  "map",
  "sheet",
  "doc",
]);
export const isEngineArtifact = (a) =>
  !!a && !a.variant && (!!adaptLegacy(a) || ENGINE_TYPES.has(a.type));

/* ═══ 3. INFRASTRUCTURE COMMUNE ═══ */
const live = new Set();
const track = (root, destroy) => live.add({ root, destroy });
export function disposeDetached() {
  for (const r of [...live])
    if (!r.root.isConnected) {
      try {
        r.destroy();
      } catch {}
      live.delete(r);
    }
}

function dropdown(root, it) {
  const wrap = dom("div", "ax-dd"),
    btn = dom("button", "ax-dd-btn"),
    menu = dom("div", "ax-dd-menu"),
    val = dom("b", "ax-dd-val");
  btn.type = "button";
  btn.title = it.label;
  btn.setAttribute("aria-haspopup", "listbox");
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  btn.append(
    dom("span", "ax-dd-lab", it.label),
    val,
    dom("i", "ax-dd-car", "▾"),
  );
  let cur = it.value;
  const close = () => {
    menu.hidden = true;
    wrap.classList.remove("is-open");
  };
  const paint = () => {
    const o = it.options.find((x) => x[0] === cur) || it.options[0];
    val.textContent = o[1];
    menu
      .querySelectorAll(".ax-dd-item")
      .forEach((n) =>
        n.classList.toggle("is-on", n.dataset.v === String(o[0])),
      );
  };
  it.options.forEach(([v, l, hint]) => {
    const row = dom("button", "ax-dd-item");
    row.type = "button";
    row.dataset.v = String(v);
    row.setAttribute("role", "option");
    row.append(dom("span", "ax-dd-check", "✓"), dom("span", "ax-dd-text", l));
    if (hint) row.append(dom("small", null, hint));
    row.addEventListener("click", () => {
      cur = v;
      paint();
      close();
      it.run(v);
    });
    menu.append(row);
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    root.querySelectorAll(".ax-dd-menu").forEach((m) => (m.hidden = true));
    root
      .querySelectorAll(".ax-dd")
      .forEach((w) => w.classList.remove("is-open"));
    menu.hidden = !open;
    wrap.classList.toggle("is-open", open);
    if (open) {
      const r = btn.getBoundingClientRect(),
        rr = root.getBoundingClientRect();
      menu.style.top = `${r.bottom - rr.top + 6}px`;
      menu.style.left = `${Math.max(6, Math.min(r.left - rr.left, rr.width - 258))}px`;
      menu.querySelector(".is-on")?.scrollIntoView({ block: "nearest" });
    }
  });
  const off = (e) => {
    if (!wrap.contains(e.target) && !menu.contains(e.target)) close();
  };
  document.addEventListener("pointerdown", off, true);
  track(root, () => document.removeEventListener("pointerdown", off, true));
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  wrap.append(btn);
  root.append(menu);
  paint();
  return wrap;
}
function makeShell(kind, ctx) {
  const root = dom(
    "section",
    `ax ax-${kind}${ctx.inline ? " is-inline" : ""}${ctx.full ? " is-full" : ""}${ctx.panel ? " is-panel" : ""}`,
  );
  root.tabIndex = 0;
  root.addEventListener("pointerdown", () => root.classList.add("is-active"));
  root.addEventListener("focusout", (e) => {
    if (!root.contains(e.relatedTarget)) root.classList.remove("is-active");
  });
  const stage = dom("div", "ax-stage");
  root.append(stage);
  const tip = dom("div", "ax-tip"),
    pop = dom("div", "ax-pop");
  tip.hidden = pop.hidden = true;
  root.append(tip, pop);
  const rel = (e) => {
    const r = root.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const place = (el, x, y) => {
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.left = `${clamp(x + 14, 6, Math.max(6, root.clientWidth - el.offsetWidth - 6))}px`;
    el.style.top = `${clamp(y + 14, 6, Math.max(6, root.clientHeight - el.offsetHeight - 6))}px`;
  };
  const pt = (e) => (Array.isArray(e) ? e : rel(e));
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") pop.hidden = true;
  });
  return {
    root,
    stage,
    rel,
    tip(e, title, lines = []) {
      if (!title) {
        tip.hidden = true;
        return;
      }
      tip.replaceChildren(
        dom("b", null, title),
        ...lines.filter(Boolean).map((l) => dom("span", null, l)),
      );
      tip.hidden = false;
      place(tip, ...pt(e));
    },
    hideTip() {
      tip.hidden = true;
    },
    pop(e, title, rows = [], color) {
      pop.replaceChildren();
      const hd = dom("div", "ax-pop-title");
      if (color) {
        const d = dom("i", "ax-dot");
        d.style.background = color;
        hd.append(d);
      }
      const close = dom("button", "ax-pop-close", "×");
      close.type = "button";
      close.onclick = () => {
        pop.hidden = true;
      };
      hd.append(dom("span", null, title), close);
      pop.append(hd);
      rows.forEach(([k, v]) => {
        const r = dom("div", "ax-pop-row");
        r.append(dom("span", null, k), dom("b", null, v));
        pop.append(r);
      });
      pop.hidden = false;
      tip.hidden = true;
      place(pop, ...pt(e));
    },
    closePop() {
      pop.hidden = true;
    },
    toolbar(items) {
      const bar = dom("div", "ax-toolbar");
      items.forEach((it) => {
        if (it === "|") {
          bar.append(dom("i", "ax-sep"));
          return;
        }
        if (it?.type === "select") {
          bar.append(dropdown(root, it));
          return;
        }
        const b = dom("button", `ax-btn${it.on ? " is-on" : ""}`, it.label);
        b.type = "button";
        b.title = it.title || it.label;
        b.setAttribute("aria-label", it.title || it.label);
        b.onclick = () => {
          if (it.toggle) b.classList.toggle("is-on");
          it.run(b.classList.contains("is-on"), b);
        };
        bar.append(b);
      });
      if (ctx.onExpand && !ctx.full) {
        const x = dom("button", "ax-btn", "⤢");
        x.type = "button";
        x.title = "Ouvrir en grand";
        x.setAttribute("aria-label", "Ouvrir en grand");
        x.onclick = () => ctx.onExpand();
        bar.append(dom("i", "ax-sep"), x);
      }
      root.append(bar);
      return bar;
    },
    hint(text) {
      root.append(dom("div", "ax-hint", text));
    },
  };
}
const wheelOK = (e, root) =>
  e.ctrlKey ||
  e.metaKey ||
  root.classList.contains("is-active") ||
  root.classList.contains("is-full");

function panZoom(svg, g, root, { min = 0.25, max = 4 } = {}) {
  const st = { k: 1, x: 0, y: 0 };
  g.dataset.pz = "1";
  const ptrs = new Map();
  let drag = null,
    moved = false,
    pinch = null;
  const apply = () =>
    g.setAttribute("transform", `translate(${st.x} ${st.y}) scale(${st.k})`);
  const zoomAt = (cx, cy, f) => {
    const r = svg.getBoundingClientRect(),
      px = cx - r.left,
      py = cy - r.top,
      k2 = clamp(st.k * f, min, max),
      real = k2 / st.k;
    st.x = px - (px - st.x) * real;
    st.y = py - (py - st.y) * real;
    st.k = k2;
    apply();
  };
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("[data-node]")) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    if (ptrs.size === 2) {
      const [p, q] = [...ptrs.values()];
      pinch = {
        d: Math.hypot(p.x - q.x, p.y - q.y) || 1,
        k: st.k,
        x: st.x,
        y: st.y,
        cx: (p.x + q.x) / 2,
        cy: (p.y + q.y) / 2,
      };
      drag = null;
      moved = true;
      svg.classList.remove("is-panning");
      return;
    }
    drag = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y };
    moved = false;
    svg.classList.add("is-panning");
  });
  svg.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    if (pinch && ptrs.size >= 2) {
      const [a1, b1] = [...ptrs.values()],
        d = Math.hypot(a1.x - b1.x, a1.y - b1.y) || 1,
        r = svg.getBoundingClientRect(),
        k2 = clamp((pinch.k * d) / pinch.d, min, max),
        real = k2 / pinch.k;
      st.k = k2;
      st.x = (a1.x + b1.x) / 2 - r.left - (pinch.cx - r.left - pinch.x) * real;
      st.y = (a1.y + b1.y) / 2 - r.top - (pinch.cy - r.top - pinch.y) * real;
      apply();
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 3) moved = true;
    st.x = drag.sx + dx;
    st.y = drag.sy + dy;
    apply();
  });
  const end = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) {
      drag = null;
      svg.classList.remove("is-panning");
    } else if (!pinch) {
      const [r] = [...ptrs.values()];
      drag = { x: r.x, y: r.y, sx: st.x, sy: st.y };
    }
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener(
    "wheel",
    (e) => {
      if (!wheelOK(e, root)) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    },
    { passive: false },
  );
  return {
    st,
    apply,
    zoomAt,
    wasPan: () => moved,
    set(k, x, y) {
      st.k = k;
      st.x = x;
      st.y = y;
      apply();
    },
    zoomCenter(f) {
      const r = svg.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
    },
  };
}
/** Viewport : taille de scène adaptée au contenu, zoom initial jamais illisible. */
function viewport(sh, svg, g, bboxFn, ctx, opts = {}) {
  const pz = panZoom(svg, g, sh.root, opts);
  const size = () => {
    const r = svg.getBoundingClientRect();
    return [r.width || 700, r.height || 420];
  };
  const b0 = bboxFn();
  if (!ctx.full && !ctx.panel) {
    const cw0 = sh.root.clientWidth || 700,
      k0 = clamp((cw0 - 72) / b0.w, 0.8, 1.15);
    sh.stage.style.height = `${clamp(b0.h * k0 + 72, 300, 520)}px`;
  }
  const fit = (box) => {
    const b = box || bboxFn(),
      [cw, ch] = size(),
      pad = 36,
      k = clamp(
        Math.min((cw - pad * 2) / b.w, (ch - pad * 2) / b.h),
        ctx.full || ctx.panel ? 0.25 : 0.55,
        ctx.full ? 3 : 1.15,
      );
    const x =
        b.w * k <= cw - pad * 2 ? (cw - b.w * k) / 2 - b.x * k : pad - b.x * k,
      y =
        b.h * k <= ch - pad * 2 ? (ch - b.h * k) / 2 - b.y * k : pad - b.y * k;
    pz.set(k, x, y);
  };
  const fitAll = (box) => {
    const b = box || bboxFn(),
      [cw, ch] = size(),
      k = clamp(
        Math.min((cw - 60) / b.w, (ch - 60) / b.h),
        0.25,
        ctx.full ? 3 : 1.5,
      );
    pz.set(k, (cw - b.w * k) / 2 - b.x * k, (ch - b.h * k) / 2 - b.y * k);
  };
  const ro = new ResizeObserver(() => {
    const [w, h] = size();
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    requestAnimationFrame(() => fitAll());
  });
  ro.observe(svg);
  const [w, h] = size();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  requestAnimationFrame(() => fit());
  return { pz, fit, fitAll, destroy: () => ro.disconnect() };
}
function markers(defs, id) {
  const mk = (name, d, refX) => {
    const m = svgn(
      "marker",
      {
        id: `${id}-${name}`,
        viewBox: "0 0 10 10",
        refX,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: "auto-start-reverse",
      },
      defs,
    );
    svgn("path", { d, class: "ax-mk" }, m);
  };
  mk("arr", "M0 0L10 5L0 10z", 9);
  mk("dot", "M5 1a4 4 0 1 0 .01 0z", 5);
  mk("dia", "M5 0L10 5L5 10L0 5z", 5);
}
const mctx = document.createElement("canvas").getContext("2d");
const LBL = "600 14px Inter, system-ui, sans-serif",
  DET = "400 12px Inter, system-ui, sans-serif";
const measure = (t, f) => {
  mctx.font = f;
  return mctx.measureText(t).width;
};
function wrap(text, max, font) {
  const lines = [];
  let cur = "";
  for (const w of String(text).split(/\s+/)) {
    const t = cur ? `${cur} ${w}` : w;
    if (measure(t, font) > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 6);
}

/* ═══ 4. REPÈRE MATHÉMATIQUE (plot) ═══ */
const prep = (s) =>
  String(s ?? "")
    .trim()
    .replace(/^[a-zA-Z]\w*\s*\(\s*x\s*\)\s*=\s*/, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/×/g, "*")
    .replace(/[−–]/g, "-");
function nice(min, max, count = 8) {
  const span = max - min || 1,
    raw = span / count,
    p = 10 ** Math.floor(Math.log10(raw)),
    f = raw / p,
    step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p,
    out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step)
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return { ticks: out, step };
}
async function mountPlot(a, host, ctx) {
  const math = await mathLib(),
    sh = makeShell("plot", ctx);
  host.append(sh.root);
  const W = 800,
    Hh = 540,
    ML = 68,
    MR = 28,
    MT = 28,
    MB = 58,
    PW = W - ML - MR,
    PH = Hh - MT - MB,
    id = uid("axp");
  const fns = (a.functions || []).map((f, i) => {
    let code = null,
      error = null;
    try {
      // APRÈS
      code = math.compile(safeExpr(prep(f.expr)));
    } catch (e) {
      error = e.message;
    }
    return {
      ...f,
      id: f.id || `f${i + 1}`,
      label: f.label || `f${i + 1}(x)`,
      color: f.color || PALETTE[i % PALETTE.length],
      code,
      error,
      visible: true,
    };
  });
  const ev = (f, x) => {
    if (!f.code) return NaN;
    try {
      const v = f.code.evaluate({ x });
      return typeof v === "number" && Number.isFinite(v) ? v : NaN;
    } catch {
      return NaN;
    }
  };
  const inDom = (f, x) =>
    !f.domain || (x >= f.domain[0] - 1e-9 && x <= f.domain[1] + 1e-9);
  const slope = (f, x) => (ev(f, x + 1e-5) - ev(f, x - 1e-5)) / 2e-5;
  const bisect = (g, lo, hi) => {
    let flo = g(lo);
    for (let i = 0; i < 70; i++) {
      const m = (lo + hi) / 2,
        fm = g(m);
      if (Math.sign(fm) === Math.sign(flo)) {
        lo = m;
        flo = fm;
      } else hi = m;
    }
    return (lo + hi) / 2;
  };
  const scan = (g, lo, hi, n = 900) => {
    const out = [];
    let px = lo,
      pv = g(lo);
    for (let i = 1; i <= n; i++) {
      const x = lo + ((hi - lo) * i) / n,
        v = g(x);
      if (Number.isFinite(pv) && Number.isFinite(v)) {
        if (pv === 0) out.push(px);
        else if (pv * v < 0) out.push(bisect(g, px, x));
      }
      px = x;
      pv = v;
    }
    return out.filter((x, i, arr) => !i || Math.abs(x - arr[i - 1]) > 1e-6);
  };

  const pts = [],
    addPt = (p) => {
      if (!pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6))
        pts.push(p);
    };
  (a.points || []).forEach((p, i) => {
    const f = fns.find((f) => f.id === p.on);
    let y = p.y;
    if (y == null && f) y = ev(f, p.x);
    if (Number.isFinite(p.x) && Number.isFinite(y))
      addPt({
        id: p.id || `P${i}`,
        label: p.label ?? p.id ?? `P${i + 1}`,
        x: +p.x,
        y,
        on: p.on,
        draggable: !!p.draggable && !!f,
        kind: p.kind || "Point",
        color: p.color,
        info: p.info,
        user: true,
      });
  });
  (a.series || []).forEach((s, si) =>
    (s.points || []).forEach(([x, y], i) =>
      addPt({
        id: `${s.id || "s" + si}-${i}`,
        label: "",
        x,
        y,
        kind: `Donnée · ${s.label || "série"}`,
        small: true,
        color: PALETTE[si % PALETTE.length],
        series: true,
      }),
    ),
  );
  let X = a.domain?.x;
  if (!X) {
    const ds = fns.filter((f) => f.domain).map((f) => f.domain);
    X = ds.length
      ? [Math.min(...ds.map((d) => d[0])), Math.max(...ds.map((d) => d[1]))]
      : [-10, 10];
    const px = pts.map((p) => p.x);
    if (px.length) X = [Math.min(X[0], ...px), Math.max(X[1], ...px)];
    const pad = (X[1] - X[0]) * 0.08 || 1;
    X = [X[0] - pad, X[1] + pad];
  }
  const auto = {
    roots: true,
    extrema: true,
    yIntercept: true,
    intersections: true,
    ...(a.auto || {}),
  };
  fns.forEach((f) => {
    if (!f.code) return;
    const [lo, hi] = f.domain || X,
      g = (x) => ev(f, x);
    if (auto.roots)
      scan(g, lo, hi).forEach((x, k, arr) =>
        addPt({
          id: `${f.id}-r${k}`,
          label: arr.length > 1 ? `x${sub(k + 1)}` : "x₀",
          x,
          y: 0,
          on: f.id,
          kind: `Racine de ${f.label}`,
          color: "#18a67a",
        }),
      );
    if (auto.yIntercept && lo <= 0 && hi >= 0 && Number.isFinite(g(0)))
      addPt({
        id: `${f.id}-y0`,
        label: "y₀",
        x: 0,
        y: g(0),
        on: f.id,
        kind: `Ordonnée à l'origine de ${f.label}`,
        color: "#3988dc",
      });
    if (auto.extrema) {
      const ex = scan((x) => slope(f, x), lo, hi, 700);
      ex.forEach((x, k) => {
        const d2 = slope(f, x + 1e-3) - slope(f, x - 1e-3),
          isMax = d2 < 0;
        addPt({
          id: `${f.id}-e${k}`,
          label:
            ex.length === 1
              ? "S"
              : isMax
                ? `Max${ex.length > 2 ? sub(k + 1) : ""}`
                : `Min${ex.length > 2 ? sub(k + 1) : ""}`,
          x,
          y: g(x),
          on: f.id,
          kind: `${ex.length === 1 ? "Sommet" : "Extremum local"} · ${isMax ? "maximum" : "minimum"}`,
          color: "#e69138",
          extra: [["Condition", "f′(x) = 0"]],
        });
      });
    }
  });
  if (auto.intersections)
    for (let i = 0; i < fns.length; i++)
      for (let j = i + 1; j < fns.length; j++) {
        const f = fns[i],
          g = fns[j];
        if (!f.code || !g.code) continue;
        const lo = Math.max((f.domain || X)[0], (g.domain || X)[0]),
          hi = Math.min((f.domain || X)[1], (g.domain || X)[1]);
        if (hi > lo)
          scan((x) => ev(f, x) - ev(g, x), lo, hi).forEach((x, k) =>
            addPt({
              id: `${f.id}-${g.id}-i${k}`,
              label: `I${sub(k + 1)}`,
              x,
              y: ev(f, x),
              on: f.id,
              kind: `Intersection ${f.label} ∩ ${g.label}`,
              color: "#d4587a",
            }),
          );
      }
  const P = (ref) =>
    typeof ref === "string"
      ? pts.find((p) => p.id === ref || p.label === ref)
      : ref && Number.isFinite(ref.x)
        ? ref
        : null;
  const lineOf = (l) => {
    if (l.through) {
      const p = P(l.through[0]),
        q = P(l.through[1]);
      if (!p || !q) return null;
      if (Math.abs(q.x - p.x) < 1e-12) return { vx: p.x, p, q };
      const m = (q.y - p.y) / (q.x - p.x);
      return { m, b: p.y - m * p.x, p, q };
    }
    if (l.x != null) return { vx: +l.x };
    if (l.y != null) return { m: 0, b: +l.y };
    if (l.slope != null) return { m: +l.slope, b: +(l.intercept || 0) };
    return null;
  };

  const yv = [];
  fns.forEach((f) => {
    if (!f.code) return;
    const [lo, hi] = f.domain || X;
    for (let i = 0; i <= 300; i++) {
      const y = ev(f, lo + ((hi - lo) * i) / 300);
      if (Number.isFinite(y) && Math.abs(y) < 1e6) yv.push(y);
    }
  });
  pts.forEach((p) => yv.push(p.y));
  yv.push(0);
  let Y = a.domain?.y;
  if (!Y) {
    yv.sort((p, q) => p - q);
    const lo = yv.length > 60 ? yv[Math.floor(yv.length * 0.02)] : yv[0],
      hi =
        yv.length > 60
          ? yv[Math.ceil(yv.length * 0.98) - 1]
          : yv[yv.length - 1],
      pad = (hi - lo) * 0.14 || 1;
    Y = [Math.min(lo, 0) - (lo < 0 ? pad : 0), hi + pad];
    if (lo >= 0) Y[0] = -pad * 0.35;
  }
  const home = { x0: X[0], x1: X[1], y0: Y[0], y1: Y[1] };
  const equalize = (v) => {
    if (!a.equal) return v;
    const xs = v.x1 - v.x0,
      ys = (xs * PH) / PW,
      cy = (v.y0 + v.y1) / 2;
    return { ...v, y0: cy - ys / 2, y1: cy + ys / 2 };
  };
  Object.assign(home, equalize(home));
  let v = { ...home };
  const show = {
    grid: a.grid !== false,
    axes: a.axes !== false,
    coords: false,
  };
  let gridType = ["grid", "none", "simple", "graduated", "subdivided"].includes(
    a.gridType,
  )
    ? a.gridType
    : "grid";
  const requestedGridSpacing =
    Number.isFinite(Number(a.gridSpacing)) && Number(a.gridSpacing) > 0
      ? Number(a.gridSpacing)
      : null;
  let sel = null,
    trans = null;
  const sx = (x) => ML + ((x - v.x0) / (v.x1 - v.x0)) * PW,
    sy = (y) => MT + ((v.y1 - y) / (v.y1 - v.y0)) * PH,
    ix = (px) => v.x0 + ((px - ML) / PW) * (v.x1 - v.x0),
    iy = (py) => v.y1 - ((py - MT) / PH) * (v.y1 - v.y0);

  const svg = svgn("svg", {
    viewBox: `0 0 ${W} ${Hh}`,
    class: "ax-svg ax-plot-svg",
    role: "img",
    "aria-label": a.title || "Repère",
  });
  sh.stage.append(svg);
  const defs = svgn("defs", {}, svg);
  markers(defs, id);
  svgn(
    "rect",
    { x: ML, y: MT, width: PW, height: PH },
    svgn("clipPath", { id: `${id}-c` }, defs),
  );
  const gGrid = svgn("g", {}, svg),
    gAxes = svgn("g", {}, svg),
    gCur = svgn("g", { "clip-path": `url(#${id}-c)` }, svg),
    gGeo = svgn("g", { "clip-path": `url(#${id}-c)` }, svg),
    gPts = svgn("g", {}, svg),
    gHover = svgn("g", { "pointer-events": "none" }, svg);

  const curvePath = (f) => {
    const [lo, hi] = f.domain || [-Infinity, Infinity],
      a0 = Math.max(v.x0, lo),
      a1 = Math.min(v.x1, hi);
    if (a1 <= a0) return "";
    const N = Math.min(
      700,
      Math.ceil(((a1 - a0) / (v.x1 - v.x0)) * PW * 1.2) + 2,
    );
    let d = "",
      pen = false,
      py = NaN;
    for (let i = 0; i <= N; i++) {
      const x = a0 + ((a1 - a0) * i) / N,
        y = ev(f, x);
      if (!Number.isFinite(y)) {
        pen = false;
        continue;
      }
      const Yp = clamp(sy(y), -4000, 4000);
      if (pen && Math.abs(Yp - py) > PH * 4) pen = false;
      d += `${pen ? "L" : "M"}${sx(x).toFixed(1)} ${Yp.toFixed(1)}`;
      pen = true;
      py = Yp;
    }
    return d;
  };
  const allPts = () => (trans ? [...pts, trans] : pts);

  const draw = raf(() => {
    [gGrid, gAxes, gCur, gGeo, gPts].forEach((g) => g.replaceChildren());
    const xt = nice(v.x0, v.x1, PW / 95),
      yt = nice(v.y0, v.y1, PH / 62),
      ticks = (lo, hi, fallback, pixels, targetCount) => {
        const step = readableTickStep(
          lo,
          hi,
          requestedGridSpacing,
          targetCount,
        );
        if (
          Math.abs(step - nice(lo, hi, targetCount).step) < 1e-12 ||
          (pixels * step) / (hi - lo) < 42
        )
          return fallback;
        const first = Math.ceil(lo / step - 1e-9) * step;
        const count = Math.min(
          100,
          Math.max(0, Math.floor((hi - first) / step) + 1),
        );
        return Array.from({ length: count }, (_, index) =>
          Number((first + index * step).toPrecision(12)),
        );
      },
      xTicks = ticks(v.x0, v.x1, xt.ticks, PW, PW / 95),
      yTicks = ticks(v.y0, v.y1, yt.ticks, PH, PH / 62),
      sparse = (values, limit) =>
        values.length <= limit
          ? values
          : values.filter(
              (_, index) =>
                index === 0 ||
                index === values.length - 1 ||
                index % Math.ceil((values.length - 1) / (limit - 1)) === 0,
            ),
      xGridTicks = sparse(xTicks, 18),
      yGridTicks = sparse(yTicks, 14),
      xLabels = sparse(xTicks, 10),
      yLabels = sparse(yTicks, 8),
      showGrid = show.grid && gridType !== "none" && gridType !== "simple";
    if (showGrid) {
      xGridTicks.forEach((t) =>
        svgn(
          "path",
          { d: `M${sx(t)} ${MT}V${MT + PH}`, class: "ax-grid" },
          gGrid,
        ),
      );
      yGridTicks.forEach((t) =>
        svgn(
          "path",
          { d: `M${ML} ${sy(t)}H${ML + PW}`, class: "ax-grid" },
          gGrid,
        ),
      );
      if (gridType === "subdivided" && a.subdivisions > 0) {
        const divisions = Math.min(12, Math.round(a.subdivisions));
        const drawMinor = (major, map, line) =>
          major.slice(1).forEach((edge, index) => {
            const start = major[index];
            for (let part = 1; part < divisions; part++) {
              const position = start + ((edge - start) * part) / divisions;
              svgn(
                "path",
                { d: line(map(position)), class: "ax-grid-sub" },
                gGrid,
              );
            }
          });
        drawMinor(
          xGridTicks,
          sx,
          (position) => `M${position} ${MT}V${MT + PH}`,
        );
        drawMinor(
          yGridTicks,
          sy,
          (position) => `M${ML} ${position}H${ML + PW}`,
        );
      }
    }
    svgn(
      "rect",
      { x: ML, y: MT, width: PW, height: PH, class: "ax-frame" },
      gAxes,
    );
    xLabels.forEach(
      (t) =>
        (svgn(
          "text",
          {
            x: sx(t),
            y: MT + PH + 20,
            class: "ax-tick",
            "text-anchor": "middle",
          },
          gAxes,
        ).textContent = fmt(t, 4)),
    );
    yLabels.forEach(
      (t) =>
        (svgn(
          "text",
          { x: ML - 10, y: sy(t) + 4, class: "ax-tick", "text-anchor": "end" },
          gAxes,
        ).textContent = fmt(t, 4)),
    );
    if (a.xLabel)
      svgn(
        "text",
        {
          x: ML + PW / 2,
          y: Hh - 10,
          class: "ax-axis-title",
          "text-anchor": "middle",
        },
        gAxes,
      ).textContent = a.xLabel;
    if (a.yLabel)
      svgn(
        "text",
        {
          x: 16,
          y: MT + PH / 2,
          class: "ax-axis-title",
          "text-anchor": "middle",
          transform: `rotate(-90 16 ${MT + PH / 2})`,
        },
        gAxes,
      ).textContent = a.yLabel;
    const ox = sx(Number(a.origin?.x) || 0),
      oy = sy(Number(a.origin?.y) || 0),
      vis = (z, a0, b0) => z >= a0 && z <= b0;
    if (show.axes) {
      if (vis(ox, ML, ML + PW)) {
        svgn(
          "path",
          {
            d: `M${ox} ${MT + PH}V${MT + 8}`,
            class: "ax-axis",
            "marker-end": `url(#${id}-arr)`,
          },
          gAxes,
        );
        yLabels.forEach(
          (t) =>
            t &&
            svgn(
              "path",
              { d: `M${ox - 4} ${sy(t)}H${ox + 4}`, class: "ax-axis-tick" },
              gAxes,
            ),
        );
      }
      if (vis(oy, MT, MT + PH)) {
        svgn(
          "path",
          {
            d: `M${ML} ${oy}H${ML + PW - 8}`,
            class: "ax-axis",
            "marker-end": `url(#${id}-arr)`,
          },
          gAxes,
        );
        xLabels.forEach(
          (t) =>
            t &&
            svgn(
              "path",
              { d: `M${sx(t)} ${oy - 4}V${oy + 4}`, class: "ax-axis-tick" },
              gAxes,
            ),
        );
      }
      if (vis(ox, ML, ML + PW) && vis(oy, MT, MT + PH))
        svgn(
          "text",
          { x: ox - 9, y: oy + 16, class: "ax-tick", "text-anchor": "end" },
          gAxes,
        ).textContent = "O";
    }
    fns.forEach((f) => {
      if (!f.visible || !f.code) return;
      const d = curvePath(f);
      if (d)
        svgn(
          "path",
          {
            d,
            class: "ax-curve",
            stroke: f.color,
            "stroke-dasharray": f.dashed ? "7 5" : null,
          },
          gCur,
        );
    });
    (a.series || []).forEach((s, si) => {
      const d = (s.points || [])
        .map(
          ([x, y], i) =>
            `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`,
        )
        .join("");
      if (d && s.mode !== "scatter")
        svgn(
          "path",
          { d, class: "ax-curve", stroke: PALETTE[si % PALETTE.length] },
          gCur,
        );
    });
    (a.lines || []).forEach((l, i) => {
      const L = lineOf(l);
      if (!L) return;
      const col = l.color || "#7f8aa3";
      let p1, p2;
      if (L.vx != null) {
        p1 = [sx(L.vx), MT];
        p2 = [sx(L.vx), MT + PH];
      } else if (l.segment && L.p) {
        p1 = [sx(L.p.x), sy(L.p.y)];
        p2 = [sx(L.q.x), sy(L.q.y)];
      } else {
        p1 = [sx(v.x0), sy(L.m * v.x0 + L.b)];
        p2 = [sx(v.x1), sy(L.m * v.x1 + L.b)];
      }
      svgn(
        "path",
        {
          d: `M${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}`,
          class: "ax-line",
          stroke: col,
          "stroke-dasharray": l.dashed ? "6 5" : null,
        },
        gGeo,
      );
    });
    (a.vectors || []).forEach((vc) => {
      const p = P(vc.from) || { x: vc.x1, y: vc.y1 },
        q = P(vc.to) || { x: vc.x2, y: vc.y2 };
      if (![p.x, p.y, q.x, q.y].every(Number.isFinite)) return;
      svgn(
        "path",
        {
          d: `M${sx(p.x)} ${sy(p.y)}L${sx(q.x)} ${sy(q.y)}`,
          class: "ax-vector",
          stroke: vc.color || "#4f8fe0",
          "marker-end": `url(#${id}-arr)`,
        },
        gGeo,
      );
      if (vc.label)
        svgn(
          "text",
          {
            x: (sx(p.x) + sx(q.x)) / 2 + 6,
            y: (sy(p.y) + sy(q.y)) / 2 - 8,
            class: "ax-ptlabel",
          },
          gGeo,
        ).textContent = vc.label;
    });
    (a.annotations || []).forEach((n) => {
      if (Number.isFinite(n.x) && Number.isFinite(n.y))
        svgn(
          "text",
          { x: sx(n.x), y: sy(n.y), class: "ax-note" },
          gGeo,
        ).textContent = n.text;
    });
    if (sel && sel.on) {
      const f = fns.find((f) => f.id === sel.on);
      if (f && f.code) {
        const m = slope(f, sel.x),
          x1 = v.x0,
          x2 = v.x1;
        svgn(
          "path",
          {
            d: `M${sx(x1)} ${sy(sel.y + m * (x1 - sel.x))}L${sx(x2)} ${sy(sel.y + m * (x2 - sel.x))}`,
            class: "ax-tangent",
          },
          gGeo,
        );
      }
    }
    allPts().forEach((p) => {
      if (
        !vis(sx(p.x), ML - 2, ML + PW + 2) ||
        !vis(sy(p.y), MT - 2, MT + PH + 2)
      )
        return;
      const isSel = sel === p,
        c = p.color || "var(--text)",
        g = svgn(
          "g",
          {
            class: `ax-pt${isSel ? " is-sel" : ""}${p.draggable ? " is-drag" : ""}`,
            "data-pt": p.id,
          },
          gPts,
        );
      if (isSel)
        svgn(
          "circle",
          { cx: sx(p.x), cy: sy(p.y), r: 11, class: "ax-ring", stroke: c },
          g,
        );
      svgn(
        "circle",
        {
          cx: sx(p.x),
          cy: sy(p.y),
          r: p.small ? 3.6 : 5.6,
          class: "ax-dotpt",
          stroke: c,
        },
        g,
      );
      svgn("circle", { cx: sx(p.x), cy: sy(p.y), r: 13, class: "ax-hit" }, g);
      if (p.label) {
        const t = svgn(
          "text",
          { x: sx(p.x) + 9, y: sy(p.y) - 9, class: "ax-ptlabel" },
          g,
        );
        t.textContent = show.coords
          ? `${p.label} (${fmt(p.x, 2)} ; ${fmt(p.y, 2)})`
          : p.label;
      }
    });
  });
  const svgXY = (e) => {
    const r = svg.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * W) / r.width,
      ((e.clientY - r.top) * Hh) / r.height,
    ];
  };
  const nearest = (px, py) => {
    const x = ix(px);
    let best = null;
    fns.forEach((f) => {
      if (!f.visible || !f.code || !inDom(f, x)) return;
      const y = ev(f, x);
      if (!Number.isFinite(y)) return;
      const d = Math.abs(sy(y) - py);
      if (d < 18 && (!best || d < best.d)) best = { f, x, y, d };
    });
    return best;
  };
  const rowsFor = (p) => {
    const f = fns.find((f) => f.id === p.on),
      r = [
        ["Coordonnées", `(${fmt(p.x)} ; ${fmt(p.y)})`],
        ["Nature", p.kind],
      ];
    if (f) {
      r.push(["Fonction", `${f.label} = ${f.expr}`]);
      if (!p.series) r.push(["Pente f′(x)", fmt(slope(f, p.x))]);
    }
    (p.extra || []).forEach((e) => r.push(e));
    if (p.info) r.push(["Info", p.info]);
    return r;
  };
  const toRoot = (p) => {
    const r = svg.getBoundingClientRect(),
      rr = sh.root.getBoundingClientRect();
    return [
      r.left - rr.left + (sx(p.x) * r.width) / W,
      r.top - rr.top + (sy(p.y) * r.height) / Hh,
    ];
  };
  const zoom = (f, px, py) => {
    const cx = ix(px),
      cy = iy(py);
    v = {
      x0: cx - (cx - v.x0) * f,
      x1: cx + (v.x1 - cx) * f,
      y0: cy - (cy - v.y0) * f,
      y1: cy + (v.y1 - cy) * f,
    };
    draw();
  };
  // APRÈS
  let pan = null,
    dragPt = null,
    pinch = null;
  const touches = new Map();
  const zoomFrom = (v0, f, px, py) => {
    const cx = v0.x0 + ((px - ML) / PW) * (v0.x1 - v0.x0),
      cy = v0.y1 - ((py - MT) / PH) * (v0.y1 - v0.y0);
    v = {
      x0: cx - (cx - v0.x0) * f,
      x1: cx + (v0.x1 - cx) * f,
      y0: cy - (cy - v0.y0) * f,
      y1: cy + (v0.y1 - cy) * f,
    };
    draw();
  };
  svg.addEventListener("pointerdown", (e) => {
    // APRÈS
    if (e.button !== 0) return;
    sh.closePop();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    if (touches.size === 2) {
      const [p, q] = [...touches.values()];
      pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, v: { ...v } };
      pan = null;
      dragPt = null;
      svg.classList.remove("is-panning");
      return;
    }
    const t = e.target.closest("[data-pt]");
    const [px, py] = svgXY(e);
    if (t) {
      const p = allPts().find((q) => q.id === t.getAttribute("data-pt"));
      if (p?.draggable) {
        dragPt = p;
        svg.setPointerCapture(e.pointerId);
      }
      pan = { moved: false, pt: p, id: e.pointerId, nopan: true };
      return;
    }
    pan = { x: px, y: py, v: { ...v }, moved: false };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("is-panning");
  });
  // APRÈS
  svg.addEventListener("pointermove", (e) => {
    const tp = touches.get(e.pointerId);
    if (tp) {
      tp.x = e.clientX;
      tp.y = e.clientY;
    }
    if (pinch && touches.size >= 2) {
      const [p, q] = [...touches.values()],
        d = Math.hypot(p.x - q.x, p.y - q.y) || 1,
        r = svg.getBoundingClientRect();
      zoomFrom(
        pinch.v,
        clamp(pinch.d / d, 0.05, 20),
        (((p.x + q.x) / 2 - r.left) * W) / r.width,
        (((p.y + q.y) / 2 - r.top) * Hh) / r.height,
      );
      return;
    }
    const [px, py] = svgXY(e);
    if (dragPt) {
      const f = fns.find((f) => f.id === dragPt.on);
      const x = clamp(ix(px), ...(f.domain || [-Infinity, Infinity]));
      dragPt.x = x;
      dragPt.y = ev(f, x);
      pan && (pan.moved = true);
      draw();
      return;
    }
    if (pan && !pan.nopan) {
      const dx = ((px - pan.x) / PW) * (pan.v.x1 - pan.v.x0),
        dy = ((py - pan.y) / PH) * (pan.v.y1 - pan.v.y0);
      if (Math.hypot(px - pan.x, py - pan.y) > 3) pan.moved = true;
      v = {
        x0: pan.v.x0 - dx,
        x1: pan.v.x1 - dx,
        y0: pan.v.y0 + dy,
        y1: pan.v.y1 + dy,
      };
      draw();
      return;
    }
    gHover.replaceChildren();
    const inside = px >= ML && px <= ML + PW && py >= MT && py <= MT + PH;
    if (!inside) {
      sh.hideTip();
      return;
    }
    const hp = e.target.closest("[data-pt]");
    if (hp) {
      const p = allPts().find((q) => q.id === hp.getAttribute("data-pt"));
      sh.tip(e, p.label || p.kind, [
        `x = ${fmt(p.x)}  ·  y = ${fmt(p.y)}`,
        p.kind,
      ]);
      return;
    }
    const n = nearest(px, py);
    if (n) {
      svgn(
        "path",
        { d: `M${sx(n.x)} ${MT + PH}V${sy(n.y)}H${ML}`, class: "ax-cross" },
        gHover,
      );
      svgn(
        "circle",
        {
          cx: sx(n.x),
          cy: sy(n.y),
          r: 5,
          fill: n.f.color,
          class: "ax-hoverdot",
        },
        gHover,
      );
      sh.tip(e, n.f.label, [`x = ${fmt(n.x)}`, `y = ${fmt(n.y)}`]);
    } else sh.tip(e, "", []);
    if (show.coords && !n)
      sh.tip(e, "Curseur", [`x = ${fmt(ix(px), 2)}  ·  y = ${fmt(iy(py), 2)}`]);
  });
  // APRÈS
  const up = (e) => {
    touches.delete(e.pointerId);
    if (pinch) {
      if (touches.size < 2) pinch = null;
      pan = null;
      dragPt = null;
      svg.classList.remove("is-panning");
      return;
    }
    svg.classList.remove("is-panning");
    const was = pan;
    pan = null;
    const wasDrag = dragPt;
    dragPt = null;
    if (!was || was.moved) {
      if (wasDrag) renderChips();
      return;
    }
    const [px, py] = svgXY(e),
      t = e.target.closest("[data-pt]");
    if (t) {
      const p = allPts().find((q) => q.id === t.getAttribute("data-pt"));
      sel = p;
      draw();
      sh.pop(e, p.label || "Point", rowsFor(p), p.color);
      return;
    }
    const n = nearest(px, py);
    if (n) {
      trans = {
        id: "__t",
        label: "M",
        x: n.x,
        y: n.y,
        on: n.f.id,
        kind: `Point sur ${n.f.label}`,
        color: n.f.color,
      };
      sel = trans;
      draw();
      sh.pop(e, "Point sur la courbe", rowsFor(trans), n.f.color);
    } else {
      sel = null;
      trans = null;
      draw();
    }
  };
  svg.addEventListener("pointerup", up);
  // APRÈS
  svg.addEventListener("pointercancel", (e) => {
    touches.delete(e.pointerId);
    pinch = null;
    pan = null;
    dragPt = null;
    svg.classList.remove("is-panning");
  });
  svg.addEventListener("pointerleave", () => {
    gHover.replaceChildren();
    sh.hideTip();
  });
  svg.addEventListener(
    "wheel",
    (e) => {
      if (!wheelOK(e, sh.root)) return;
      e.preventDefault();
      const [px, py] = svgXY(e);
      zoom(e.deltaY < 0 ? 0.87 : 1.15, px, py);
    },
    { passive: false },
  );
  svg.addEventListener("dblclick", () => {
    v = { ...home };
    draw();
  });

  const bar = sh.toolbar([
    {
      label: "+",
      title: "Zoom avant",
      run: () => zoom(0.8, ML + PW / 2, MT + PH / 2),
    },
    {
      label: "−",
      title: "Zoom arrière",
      run: () => zoom(1.25, ML + PW / 2, MT + PH / 2),
    },
    {
      label: "Réinit.",
      title: "Réinitialiser la vue",
      run: () => {
        v = { ...home };
        draw();
      },
    },
    "|",
    {
      type: "select",
      label: "Type de repère",
      value: gridType,
      options: [
        ["grid", "Quadrillage"],
        ["subdivided", "Subdivisions"],
        ["graduated", "Gradué"],
        ["simple", "Simple"],
        ["none", "Sans quadrillage"],
      ],
      run: (value) => {
        gridType = value;
        show.grid = value !== "none";
        draw();
      },
    },
    {
      label: "Grille",
      toggle: true,
      on: show.grid,
      run: (on) => {
        show.grid = on;
        if (on && gridType === "none") gridType = "grid";
        draw();
      },
    },
    {
      label: "Rotation",
      title: "Rotation automatique",
      toggle: true,
      on: false,
      run: (on) => (turn = on),
    },
    {
      label: "Mesurer",
      title: "Cliquer deux points pour mesurer",
      toggle: true,
      on: false,
      run: (on) => {
        measuring = on;
        clearMeasure();
        canvas.style.cursor = on ? "crosshair" : "grab";
      },
    },
    {
      label: "Axes",
      toggle: true,
      on: show.axes,
      run: (on) => {
        show.axes = on;
        draw();
      },
    },
    {
      label: "Coordonnées",
      toggle: true,
      on: false,
      run: (on) => {
        show.coords = on;
        draw();
      },
    },
  ]);
  if (fns.length) {
    const lg = dom("div", "ax-legend");
    fns.forEach((f) => {
      const b = dom("button", "ax-leg-item");
      b.type = "button";
      const i = dom("i");
      i.style.background = f.color;
      b.append(
        i,
        dom(
          "span",
          null,
          f.error
            ? `${f.label} (expression invalide)`
            : `${f.label} = ${f.expr}`,
        ),
      );
      b.onclick = () => {
        f.visible = !f.visible;
        b.classList.toggle("is-off", !f.visible);
        draw();
      };
      lg.append(b);
    });
    sh.root.append(lg);
  }
  const chipsBox = dom("div", "ax-chips");
  sh.root.append(chipsBox);
  function renderChips() {
    chipsBox.replaceChildren();
    const list = pts.filter((p) => !p.series && p.label);
    if (!list.length) return;
    chipsBox.append(dom("span", "ax-chips-title", "Points remarquables"));
    list.forEach((p) => {
      const b = dom(
        "button",
        "ax-chip",
        `${p.label}  (${fmt(p.x, 2)} ; ${fmt(p.y, 2)})`,
      );
      b.type = "button";
      b.onclick = () => {
        sel = p;
        draw();
        const [x, y] = toRoot(p);
        sh.pop([x - 14, y - 40], p.label, rowsFor(p), p.color);
      };
      chipsBox.append(b);
    });
  }
  renderChips();
  draw();
  sh.hint("Clic : sélectionner · glisser : déplacer · Ctrl + molette : zoom");
  track(sh.root, () => {});
}

/* ═══ 5. DIAGRAMME SÉMANTIQUE + LAYOUT EN COUCHES ═══ */
function sizeNode(n) {
  const max = n.kind === "decision" || n.kind === "actor" ? 150 : 220,
    lines = wrap(n.label, max, LBL),
    det = n.detail ? wrap(n.detail, max + 20, DET).slice(0, 4) : [];
  const tw = Math.max(
      60,
      ...lines.map((l) => measure(l, LBL)),
      ...det.map((l) => measure(l, DET)),
    ),
    th = lines.length * 18 + det.length * 16 + (det.length ? 4 : 0);
  let w = tw + 36,
    h = th + 26;
  switch (n.kind) {
    case "decision":
      w = tw * 1.5 + 40;
      h = th * 1.7 + 34;
      break;
    case "hexagon":
      w += 34;
      break;
    case "data":
      h += 24;
      w += 10;
      break;
    case "cloud":
      w = w * 1.3 + 20;
      h = h * 1.35 + 8;
      break;
    case "document":
      h += 12;
      break;
    case "service":
      w += 18;
      break;
    case "actor":
      w = Math.max(tw + 24, 90);
      h = th + 64;
      break;
    case "circle":
      w = h = Math.max(w, h) * 1.05;
      break;
    case "capsule":
      w += 16;
      break;
  }
  if (n.width) w = clamp(+n.width, 60, 400);
  if (n.height) h = clamp(+n.height, 40, 300);
  return { ...n, w: Math.round(w), h: Math.round(h), lines, det, th };
}
function layeredLayout(nodes, edges, dir) {
  const GAP_M = 96,
    GAP_C = 34,
    ids = nodes.map((n) => n.id),
    size = new Map(
      nodes.map((n) => [n.id, dir === "LR" ? [n.w, n.h] : [n.h, n.w]]),
    );
  const adj = new Map(ids.map((i) => [i, []]));
  edges.forEach((e, k) => adj.get(e.from).push({ ...e, k }));
  const inCount = new Map(ids.map((i) => [i, 0]));
  edges.forEach((e) => inCount.set(e.to, inCount.get(e.to) + 1));
  const state = new Map(),
    dag = [];
  const visit = (u) => {
    state.set(u, 1);
    for (const e of adj.get(u)) {
      const s = state.get(e.to);
      if (s === 1) dag.push({ ...e, from: e.to, to: e.from, rev: true });
      else {
        dag.push(e);
        if (!s) visit(e.to);
      }
    }
    state.set(u, 2);
  };
  [...ids.filter((i) => !inCount.get(i)), ...ids].forEach((i) => {
    if (!state.get(i)) visit(i);
  });
  const indeg = new Map(ids.map((i) => [i, 0])),
    out = new Map(ids.map((i) => [i, []]));
  dag.forEach((e) => {
    indeg.set(e.to, indeg.get(e.to) + 1);
    out.get(e.from).push(e);
  });
  const layer = new Map(ids.map((i) => [i, 0])),
    q = ids.filter((i) => !indeg.get(i));
  while (q.length) {
    const u = q.shift();
    out.get(u).forEach((e) => {
      layer.set(e.to, Math.max(layer.get(e.to), layer.get(u) + 1));
      indeg.set(e.to, indeg.get(e.to) - 1);
      if (!indeg.get(e.to)) q.push(e.to);
    });
  }
  const segs = [],
    chain = new Map();
  let dn = 0;
  dag.forEach((e) => {
    let prev = e.from;
    const dums = [];
    for (let l = layer.get(e.from) + 1; l < layer.get(e.to); l++) {
      const id = `~${dn++}`;
      layer.set(id, l);
      size.set(id, [0, 12]);
      dums.push(id);
      segs.push([prev, id]);
      prev = id;
    }
    segs.push([prev, e.to]);
    chain.set(e.k, { dums, rev: !!e.rev });
  });
  const maxL = Math.max(0, ...layer.values()),
    L = Array.from({ length: maxL + 1 }, () => []);
  [...layer.keys()].forEach((id) => L[layer.get(id)].push(id));
  const nb = new Map(),
    N = (id) => nb.get(id) || nb.set(id, { up: [], down: [] }).get(id);
  segs.forEach(([a, b]) => {
    N(a).down.push(b);
    N(b).up.push(a);
  });
  const idx = new Map(),
    reindex = () => L.forEach((l) => l.forEach((id, i) => idx.set(id, i)));
  reindex();
  const bary = (id, side) => {
    const ns = nb.get(id)?.[side] || [];
    return ns.length
      ? ns.reduce((s, n) => s + idx.get(n), 0) / ns.length
      : idx.get(id);
  };
  for (let it = 0; it < 8; it++) {
    const down = it % 2 === 0;
    (down ? L.slice(1) : L.slice(0, -1).reverse()).forEach((l) => {
      l.sort(
        (x, y) => bary(x, down ? "up" : "down") - bary(y, down ? "up" : "down"),
      );
      reindex();
    });
  }
  const main = [];
  let acc = 0;
  L.forEach((l, i) => {
    const mx = Math.max(0, ...l.map((id) => size.get(id)[0]));
    main[i] = acc + mx / 2;
    acc += mx + GAP_M;
  });
  const cross = new Map();
  L.forEach((l) => {
    let c =
      -(l.reduce((s, id) => s + size.get(id)[1], 0) + GAP_C * (l.length - 1)) /
      2;
    l.forEach((id) => {
      const s = size.get(id)[1];
      cross.set(id, c + s / 2);
      c += s + GAP_C;
    });
  });
  const relax = (l, side) => {
    const want = l.map((id) => {
        const ns = nb.get(id)?.[side] || [];
        return ns.length
          ? ns.reduce((s, n) => s + cross.get(n), 0) / ns.length
          : cross.get(id);
      }),
      pos = want.slice();
    for (let i = 1; i < l.length; i++)
      pos[i] = Math.max(
        pos[i],
        pos[i - 1] + (size.get(l[i - 1])[1] + size.get(l[i])[1]) / 2 + GAP_C,
      );
    const shift = l.length
      ? want.reduce((s, w, i) => s + w - pos[i], 0) / l.length
      : 0;
    l.forEach((id, i) => cross.set(id, pos[i] + shift));
  };
  for (let it = 0; it < 6; it++) {
    L.slice(1).forEach((l) => relax(l, "up"));
    L.slice(0, -1)
      .reverse()
      .forEach((l) => relax(l, "down"));
  }
  const xy = (id) => {
    const m = main[layer.get(id)],
      c = cross.get(id);
    return dir === "LR" ? { x: m, y: c } : { x: c, y: m };
  };
  const pos = new Map(ids.map((id) => [id, xy(id)])),
    ways = new Map();
  chain.forEach((c, k) => {
    const pts = c.dums.map(xy);
    ways.set(k, c.rev ? pts.reverse() : pts);
  });
  return { pos, ways };
}
function drawShape(g, n, semanticType = "") {
  const w = n.w,
    h = n.h,
    hw = w / 2,
    hh = h / 2,
    add = (t, at) => svgn(t, { class: "ax-shape", ...at }, g);
  if (semanticType === "mind_map") {
    if (n.isMindRoot) {
      add("circle", {
        cx: 0,
        cy: 0,
        r: Math.min(hw, hh) - 2,
        class: "ax-mind-root",
      });
      add("circle", {
        cx: 0,
        cy: 0,
        r: Math.min(hw, hh) - 8,
        class: "ax-mind-root-inner",
      });
    } else {
      add("rect", {
        x: -hw,
        y: -hh,
        width: w,
        height: h,
        rx: Math.min(22, hh),
        class: "ax-mind-branch",
      });
      add("rect", {
        x: -hw,
        y: -hh,
        width: 5,
        height: h,
        rx: 2.5,
        class: "ax-mind-accent",
      });
    }
    return;
  }
  if (semanticType === "concept_map") {
    add("path", {
      d: `M${-hw + 14} ${-hh}H${hw - 14}L${hw} 0L${hw - 14} ${hh}H${-hw + 14}L${-hw} 0Z`,
      class: "ax-concept-node",
    });
    return;
  }
  if (semanticType === "architecture_diagram") {
    add("rect", {
      x: -hw,
      y: -hh,
      width: w,
      height: h,
      rx: 8,
      class: "ax-architecture-node",
    });
    add("rect", {
      x: -hw + 5,
      y: -hh + 5,
      width: w - 10,
      height: 7,
      rx: 3.5,
      class: "ax-architecture-cap",
    });
    return;
  }
  if (semanticType === "flowchart" || semanticType === "process_diagram") {
    if (n.kind === "decision")
      add("path", {
        d: `M0 ${-hh}L${hw} 0L0 ${hh}L${-hw} 0Z`,
        class: "ax-flow-decision",
      });
    else if (
      n.kind === "capsule" ||
      /start|end|finish|début|fin/i.test(n.semanticKind || n.label)
    )
      add("rect", {
        x: -hw,
        y: -hh * 0.78,
        width: w,
        height: h * 0.78,
        rx: hh * 0.78,
        class: "ax-flow-terminal",
      });
    else if (
      /data|input|output|entrée|sortie/i.test(`${n.kind} ${n.semanticKind}`)
    )
      add("path", {
        d: `M${-hw + 14} ${-hh}H${hw}L${hw - 14} ${hh}H${-hw}Z`,
        class: "ax-flow-io",
      });
    else
      add("rect", {
        x: -hw,
        y: -hh,
        width: w,
        height: h,
        rx: 5,
        class: "ax-flow-process",
      });
    return;
  }
  if (semanticType === "network") {
    add("circle", {
      cx: 0,
      cy: 0,
      r: Math.min(hw, hh) * 0.72,
      class: "ax-network-node",
    });
    add("circle", { cx: 0, cy: 0, r: 3.5, class: "ax-network-port" });
    return;
  }
  if (semanticType === "piping_instrumentation") {
    const role = `${n.semanticKind || ""} ${n.label}`.toLowerCase();
    if (/valve|vanne|robinet/.test(role))
      add("path", {
        d: `M-25 0L0 -18L25 0L0 18Z M-25 -18L25 18 M-25 18L25 -18`,
        class: "ax-pid-valve",
      });
    else if (/pump|pompe/.test(role)) {
      add("circle", { cx: 0, cy: 0, r: 27, class: "ax-pid-pump" });
      add("path", { d: "M-8 -13L15 0L-8 13Z", class: "ax-pid-impeller" });
    } else if (
      /sensor|capteur|transmitter|instrument|pressure|temperature|pt-|tt-/.test(
        role,
      )
    ) {
      add("circle", { cx: 0, cy: 0, r: 23, class: "ax-pid-instrument" });
      add("path", { d: "M-12 4L-4 -7L3 4L11 -8", class: "ax-pid-glyph" });
    } else if (/exchanger|échangeur|generator|g[ée]n[ée]rateur/.test(role)) {
      add("rect", {
        x: -hw,
        y: -hh,
        width: w,
        height: h,
        rx: hh,
        class: "ax-pid-vessel",
      });
      add("path", {
        d: `M${-hw + 12} ${hh - 10}Q0 ${-hh} ${hw - 12} ${-hh + 10}`,
        class: "ax-pid-coil",
      });
    } else if (/tank|vessel|cuve|reservoir|réservoir/.test(role)) {
      add("path", {
        d: `M${-hw} ${-hh + 14}Q0 ${-hh - 8} ${hw} ${-hh + 14}V${hh - 14}Q0 ${hh + 8} ${-hw} ${hh - 14}Z`,
        class: "ax-pid-vessel",
      });
    } else
      add("rect", {
        x: -hw,
        y: -hh,
        width: w,
        height: h,
        rx: 6,
        class: "ax-pid-equipment",
      });
    return;
  }
  if (semanticType === "electrical_single_line") {
    const role = `${n.semanticKind || ""} ${n.label}`.toLowerCase();
    if (/transformer|transformateur/.test(role)) {
      add("circle", { cx: -11, cy: 0, r: 20, class: "ax-electrical-coil" });
      add("circle", { cx: 11, cy: 0, r: 20, class: "ax-electrical-coil" });
    } else if (/breaker|disjoncteur|protection/.test(role))
      add("path", {
        d: "M-26 0H-8L12 -17M12 0H27",
        class: "ax-electrical-switch",
      });
    else if (/generator|alternator|alternateur|source/.test(role)) {
      add("circle", { cx: 0, cy: 0, r: 25, class: "ax-electrical-source" });
      svgn(
        "text",
        { x: 0, y: 5, "text-anchor": "middle", class: "ax-electrical-symbol" },
        g,
      ).textContent = "G";
    } else
      add("rect", {
        x: -hw,
        y: -hh,
        width: w,
        height: h,
        rx: 4,
        class: "ax-electrical-equipment",
      });
    return;
  }
  if (semanticType === "scientific_cross_section") {
    add("rect", {
      x: -hw,
      y: -hh,
      width: w,
      height: h,
      rx: 2,
      class: "ax-section-layer",
    });
    add("path", {
      d: `M${-hw} ${-hh + 8}Q0 ${-hh - 5} ${hw} ${-hh + 8}`,
      class: "ax-section-boundary",
    });
    return;
  }
  if (semanticType === "technical_plan" || semanticType === "site_plan") {
    const role = `${n.semanticKind || ""} ${n.label}`.toLowerCase();
    if (/road|route|circulation|allée|aisle/.test(role))
      add("path", { d: `M${-hw} 0H${hw}`, class: "ax-plan-road" });
    else if (/boundary|limite|zone|area|périmètre/.test(role))
      add("rect", {
        x: -hw,
        y: -hh,
        width: w,
        height: h,
        rx: 4,
        class: "ax-plan-zone",
      });
    else
      add("rect", {
        x: -hw,
        y: -hh,
        width: w,
        height: h,
        rx: 2,
        class: "ax-plan-building",
      });
    return;
  }
  if (semanticType === "system_diagram" || semanticType === "process_diagram") {
    add("rect", {
      x: -hw,
      y: -hh,
      width: w,
      height: h,
      rx: 12,
      class: "ax-system-node",
    });
    add("rect", {
      x: -hw,
      y: -hh,
      width: 5,
      height: h,
      rx: 2.5,
      class: "ax-system-rail",
    });
    return;
  }
  if (semanticType === "chemistry_structure") {
    add("circle", {
      cx: 0,
      cy: 0,
      r: Math.max(24, Math.min(hw, hh) - 3),
      class: "ax-atom",
    });
    return;
  }
  if (semanticType === "biological_diagram") {
    const kind = `${n.semanticKind || ""} ${n.label}`.toLowerCase();
    add("circle", { cx: 0, cy: 0, r: Math.min(hw, hh) - 4, class: "ax-cell" });
    add("circle", {
      cx: /noyau|nucleus/.test(kind) ? 0 : -hw * 0.12,
      cy: 0,
      r: Math.max(9, Math.min(hw, hh) * 0.34),
      class: "ax-nucleus",
    });
    if (/mitochond|chloroplast/.test(kind)) {
      add("ellipse", {
        cx: hw * 0.42,
        cy: -hh * 0.34,
        rx: hw * 0.2,
        ry: hh * 0.14,
        class: "ax-organelle",
      });
      add("path", {
        d: `M${hw * 0.27} ${-hh * 0.34}q7 -8 14 0t14 0`,
        class: "ax-organelle-fold",
      });
    }
    return;
  }
  if (semanticType === "anatomy_diagram") {
    const kind = `${n.semanticKind || ""} ${n.label}`.toLowerCase();
    add("rect", {
      x: -hw,
      y: -hh,
      width: w,
      height: h,
      rx: 16,
      class: "ax-anatomy-frame",
    });
    if (/cœur|coeur|heart/.test(kind))
      add("path", {
        d: "M0 25C-9 17 -23 8 -20 -5C-18 -18 -3 -18 0 -7C5 -19 20 -16 20 -4C20 8 9 19 0 25Z",
        class: "ax-organ-heart",
      });
    else if (/poumon|lung/.test(kind)) {
      add("path", {
        d: "M0 -20V2M-3 -7C-14 -20 -23 -8 -21 10Q-18 22 -5 17ZM3 -7C14 -20 23 -8 21 10Q18 22 5 17Z",
        class: "ax-organ-lung",
      });
    } else if (/os|bone|squelette/.test(kind))
      add("path", {
        d: "M-17 -14Q-23 -22 -17 -25Q-11 -27 -8 -19L9 12Q17 9 20 17Q23 24 16 27Q9 29 6 21L-11 -10Q-19 -7 -17 -14Z",
        class: "ax-organ-bone",
      });
    else
      add("circle", {
        cx: 0,
        cy: 0,
        r: Math.min(hw, hh) * 0.32,
        class: "ax-organ-generic",
      });
    return;
  }
  if (semanticType === "mechanical_diagram") {
    const kind = `${n.semanticKind || ""} ${n.label}`.toLowerCase();
    if (/gear|engrenage/.test(kind)) {
      const points = Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const radius = i % 2 ? 22 : 28;
        return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
      }).join(" ");
      add("polygon", { points, class: "ax-gear" });
      add("circle", { cx: 0, cy: 0, r: 8, class: "ax-gear-hole" });
    } else if (/shaft|arbre|axe/.test(kind))
      add("path", {
        d: "M-36 -8H28V-16L42 0L28 16V8H-36Z",
        class: "ax-mechanical-part",
      });
    else
      add("rect", {
        x: -hw,
        y: -hh,
        width: w,
        height: h,
        rx: 9,
        class: "ax-mechanical-frame",
      });
    return;
  }
  if (semanticType === "circuit_diagram") {
    const kind = `${n.semanticKind || ""} ${n.label}`.toLowerCase();
    if (/battery|power_source|pile/.test(kind)) {
      add("path", {
        d: "M-20 -15V15M-10 -8V8M10 -15V15M20 -8V8",
        class: "ax-symbol",
      });
      return;
    }
    if (/resistor|resistance/.test(kind)) {
      add("path", {
        d: "M-40 0H-24L-16 -12L-4 12L8 -12L20 12L28 0H40",
        class: "ax-symbol",
      });
      return;
    }
    if (/motor|lamp|diode|capacitor/.test(kind)) {
      add("circle", { cx: 0, cy: 0, r: 22, class: "ax-symbol" });
      const glyph = /motor/.test(kind)
        ? "M"
        : /lamp/.test(kind)
          ? "L"
          : /capacitor/.test(kind)
            ? "C"
            : "D";
      svgn(
        "text",
        { x: 0, y: 5, "text-anchor": "middle", class: "ax-symbol-label" },
        g,
      ).textContent = glyph;
      return;
    }
  }
  switch (n.kind) {
    case "decision":
      add("path", { d: `M0 ${-hh}L${hw} 0L0 ${hh}L${-hw} 0Z` });
      break;
    case "hexagon":
      add("path", {
        d: `M${-hw + 18} ${-hh}H${hw - 18}L${hw} 0L${hw - 18} ${hh}H${-hw + 18}L${-hw} 0Z`,
      });
      break;
    case "data": {
      const ry = 9;
      add("path", {
        d: `M${-hw} ${-hh + ry}A${hw} ${ry} 0 0 1 ${hw} ${-hh + ry}V${hh - ry}A${hw} ${ry} 0 0 1 ${-hw} ${hh - ry}Z`,
      });
      add("ellipse", {
        cx: 0,
        cy: -hh + ry,
        rx: hw,
        ry,
        class: "ax-shape ax-top",
      });
      break;
    }
    case "document":
      add("path", {
        d: `M${-hw} ${-hh}H${hw}V${hh - 6}Q${hw / 2} ${hh + 6} 0 ${hh - 6}T${-hw} ${hh - 6}Z`,
      });
      break;
    case "cloud":
      add("path", {
        d: `M${-w * 0.32} ${h * 0.3}A${h * 0.26} ${h * 0.26} 0 0 1 ${-w * 0.36} ${-h * 0.12}A${h * 0.3} ${h * 0.3} 0 0 1 ${-w * 0.08} ${-h * 0.3}A${h * 0.32} ${h * 0.32} 0 0 1 ${w * 0.28} ${-h * 0.18}A${h * 0.26} ${h * 0.26} 0 0 1 ${w * 0.34} ${h * 0.3}Z`,
      });
      break;
    case "circle":
      add("ellipse", { cx: 0, cy: 0, rx: hw, ry: hh });
      break;
    case "capsule":
      add("rect", { x: -hw, y: -hh, width: w, height: h, rx: hh });
      break;
    case "service":
      add("rect", { x: -hw, y: -hh, width: w, height: h, rx: 8 });
      add("rect", {
        x: -hw - 6,
        y: -10,
        width: 12,
        height: 8,
        rx: 2,
        class: "ax-shape ax-tab",
      });
      add("rect", {
        x: -hw - 6,
        y: 4,
        width: 12,
        height: 8,
        rx: 2,
        class: "ax-shape ax-tab",
      });
      break;
    case "actor": {
      const y0 = -hh + 6;
      add("circle", { cx: 0, cy: y0 + 11, r: 10 });
      add("path", {
        d: `M-17 ${y0 + 42}Q-17 ${y0 + 25} 0 ${y0 + 25}Q17 ${y0 + 25} 17 ${y0 + 42}`,
        fill: "none",
      });
      break;
    }
    case "rounded":
      add("rect", { x: -hw, y: -hh, width: w, height: h, rx: 16 });
      break;
    default:
      add("rect", { x: -hw, y: -hh, width: w, height: h, rx: 8 });
  }
}
// APRÈS
/** Layout organique (Fruchterman-Reingold déterministe + anti-chevauchement des rectangles). */
function forceLayout(nodes, edges) {
  const n = nodes.length,
    K = 230 + Math.min(120, n * 4),
    idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const P = nodes.map((nd, i) => {
    const t = (i / Math.max(1, n)) * Math.PI * 2,
      r = 100 + n * 18;
    return { x: Math.cos(t) * r, y: Math.sin(t) * r, w: nd.w, h: nd.h };
  });
  const L = edges
    .map((e) => [idx.get(e.from), idx.get(e.to)])
    .filter(([s, t]) => s != null && t != null);
  const iters = 360;
  for (let it = 0; it < iters; it++) {
    const T = 70 * (1 - it / iters) + 1,
      D = P.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let dx = P[i].x - P[j].x,
          dy = P[i].y - P[j].y,
          d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = 0.01 * (i + 1);
          dy = 0.01 * (j + 1);
          d = Math.hypot(dx, dy);
        }
        const f = (K * K) / d;
        D[i].x += (dx / d) * f;
        D[i].y += (dy / d) * f;
        D[j].x -= (dx / d) * f;
        D[j].y -= (dy / d) * f;
      }
    L.forEach(([s, t]) => {
      const dx = P[s].x - P[t].x,
        dy = P[s].y - P[t].y,
        d = Math.hypot(dx, dy) || 0.01,
        f = (d * d) / K;
      D[s].x -= (dx / d) * f;
      D[s].y -= (dy / d) * f;
      D[t].x += (dx / d) * f;
      D[t].y += (dy / d) * f;
    });
    P.forEach((p, i) => {
      D[i].x -= p.x * 0.15;
      D[i].y -= p.y * 0.15;
      const m = Math.hypot(D[i].x, D[i].y) || 1;
      p.x += (D[i].x / m) * Math.min(m, T);
      p.y += (D[i].y / m) * Math.min(m, T);
    });
  }
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const ox = (P[i].w + P[j].w) / 2 + 36 - Math.abs(P[i].x - P[j].x),
          oy = (P[i].h + P[j].h) / 2 + 30 - Math.abs(P[i].y - P[j].y);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (ox < oy) {
            const s = ((P[i].x < P[j].x ? -1 : 1) * ox) / 2;
            P[i].x += s;
            P[j].x -= s;
          } else {
            const s = ((P[i].y < P[j].y ? -1 : 1) * oy) / 2;
            P[i].y += s;
            P[j].y -= s;
          }
        }
      }
    if (!moved) break;
  }
  return new Map(nodes.map((nd, i) => [nd.id, { x: P[i].x, y: P[i].y }]));
}
/** Point d'une arête sur le contour réel de la forme (losange, ellipse, rectangle). */
function rimPoint(A, B) {
  const dx = B.x - A.x,
    dy = B.y - A.y;
  if (!dx && !dy) return { x: A.x, y: A.y };
  const hw = A.w / 2,
    hh = A.h / 2;
  let s;
  if (A.kind === "decision") s = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else if (A.kind === "circle" || A.kind === "cloud")
    s = 1 / Math.hypot(dx / hw, dy / hh);
  else
    s = Math.min(
      dx ? hw / Math.abs(dx) : Infinity,
      dy ? hh / Math.abs(dy) : Infinity,
    );
  return { x: A.x + dx * s, y: A.y + dy * s };
}
async function mountFamily(a, host, ctx, render) {
  const sh = makeShell("diagram", ctx);
  sh.root.dataset.semanticType = a.semanticType;
  host.append(sh.root);
  const id = uid("axf");
  const svg = svgn("svg", {
    class: "ax-svg ax-fill",
    role: "img",
    "aria-label": a.title || "Schéma",
  });
  sh.stage.append(svg);
  markers(svgn("defs", {}, svg), id);
  const g = svgn("g", {}, svg);
  const H = { svgn, wrap, measure, clamp, PALETTE, LBL, DET, id, sh, fmt },
    entry = schemaEntry(a),
    frame = FRAMES[entry.frame] || FRAMES.explain;
  const inner = render(a, g, H),
    box = decorate(H, g, inner, entry, frame);
  applyArrow(svg, id, frame.arrow);
  sh.root.dataset.schemaType = a.schemaType || a.semanticType;
  const vp = viewport(sh, svg, g, () => box, ctx);
  const items = [
    { label: "+", title: "Zoom avant", run: () => vp.pz.zoomCenter(1.2) },
    {
      label: "−",
      title: "Zoom arrière",
      run: () => vp.pz.zoomCenter(1 / 1.2),
    },
    { label: "Ajuster", title: "Tout afficher", run: () => vp.fitAll() },
  ];
  if ((a.nodes || []).length >= 2 && !DATA_FAMILIES.has(a.semanticType))
    items.push("|", {
      type: "select",
      label: "Type de schéma",
      value: a.semanticType,
      options: FAMILY_OPTIONS,
      run: (value) => {
        host.replaceChildren();
        mountArtifact({ ...a, semanticType: value }, host, ctx);
      },
    });
  sh.toolbar(items);
  sh.hint(
    "Glisser : déplacer · Ctrl + molette : zoom · « Type de schéma » : change la représentation sans perdre les données",
  );
  track(sh.root, () => vp.destroy());
}
async function mountDiagram(a, host, ctx) {
  if (a.schemaType && SCHEMA_BY_ID[a.schemaType] && !a.semanticType)
    a = { ...a, semanticType: SCHEMA_BY_ID[a.schemaType].renderer };
  if (!a.semanticType) a = { ...a, semanticType: inferFamily(a) };
  const family = FAMILIES[a.semanticType];
  if (family) return mountFamily(a, host, ctx, family);
  const sh = makeShell("diagram", ctx);
  if (a.semanticType) sh.root.dataset.semanticType = a.semanticType;
  host.append(sh.root);
  const dir = a.direction === "TB" ? "TB" : "LR",
    id = uid("axd");
  const svg = svgn("svg", {
    class: "ax-svg ax-fill",
    role: "img",
    "aria-label": a.title || "Schéma",
  });
  sh.stage.append(svg);
  markers(svgn("defs", {}, svg), id);
  const g = svgn("g", {}, svg),
    gG = svgn("g", {}, g),
    gE = svgn("g", {}, g),
    gN = svgn("g", {}, g);
  let nodes = a.nodes.map(sizeNode);
  const manual = new Map();
  let ways = new Map(),
    sel = null,
    drag = null;
  const nodeEls = new Map(),
    edgeRefs = [];
  nodes.forEach((n) => {
    if (Number.isFinite(+n.x) && Number.isFinite(+n.y))
      manual.set(n.id, { x: +n.x, y: +n.y });
  });
  const map = () => new Map(nodes.map((n) => [n.id, n]));
  // APRÈS
  let mode = a.layout === "force" ? "force" : "layered";
  let layoutGeneration = 0,
    vp = null;
  const layout = () => {
    const generation = ++layoutGeneration;
    if (mode === "force") {
      const pos = forceLayout(nodes, a.edges);
      ways = new Map();
      nodes.forEach((n) => {
        const p = pos.get(n.id),
          m = manual.get(n.id);
        n.x = m ? m.x : p.x;
        n.y = m ? m.y : p.y;
      });
    } else {
      const r = layeredLayout(nodes, a.edges, dir);
      ways = r.ways;
      nodes.forEach((n) => {
        const p = r.pos.get(n.id),
          m = manual.get(n.id);
        n.x = m ? m.x : p.x;
        n.y = m ? m.y : p.y;
      });
    }
    if (mode === "force") {
      loadD3Force()
        .then((d3) => {
          if (!d3 || generation !== layoutGeneration || mode !== "force")
            return;
          const positions = nodes.map((node, index) => ({
            ...node,
            x: Number.isFinite(node.x) ? node.x : index * 40,
            y: Number.isFinite(node.y) ? node.y : 0,
          }));
          const links = a.edges
            .map((edge) => ({ source: edge.from, target: edge.to }))
            .filter(
              (edge) =>
                nodes.some((node) => node.id === edge.source) &&
                nodes.some((node) => node.id === edge.target),
            );
          const simulation = d3
            .forceSimulation(positions)
            .force(
              "link",
              d3
                .forceLink(links)
                .id((node) => node.id)
                .distance((edge) => (edge.source.w + edge.target.w) / 2 + 70),
            )
            .force("charge", d3.forceManyBody().strength(-460))
            .force(
              "collide",
              d3
                .forceCollide((node) => Math.hypot(node.w, node.h) * 0.38 + 16)
                .iterations(3),
            )
            .force("center", d3.forceCenter(0, 0))
            .stop();
          for (let tick = 0; tick < 180; tick++) simulation.tick();
          positions.forEach((position) => {
            const node = nodes.find((entry) => entry.id === position.id);
            if (node && !manual.has(node.id)) {
              node.x = position.x;
              node.y = position.y;
            }
          });
          drawAll();
          vp?.fit();
        })
        .catch(() => {});
    } else {
      loadELK()
        .then((ELK) => {
          if (!ELK || generation !== layoutGeneration || mode !== "layered")
            return;
          const instance = new ELK();
          return instance
            .layout({
              id: "root",
              layoutOptions: {
                "elk.algorithm": "layered",
                "elk.direction": dir === "LR" ? "RIGHT" : "DOWN",
                "elk.edgeRouting": "ORTHOGONAL",
                "elk.spacing.nodeNode": "42",
                "elk.layered.spacing.nodeNodeBetweenLayers": "88",
              },
              children: nodes.map((node) => ({
                id: node.id,
                width: node.w,
                height: node.h,
              })),
              edges: a.edges.map((edge, index) => ({
                id: `e${index}`,
                sources: [edge.from],
                targets: [edge.to],
              })),
            })
            .then((graph) => {
              if (generation !== layoutGeneration) return;
              ways = new Map();
              graph.children?.forEach((position) => {
                const node = nodes.find((entry) => entry.id === position.id);
                if (node && !manual.has(node.id)) {
                  node.x = position.x + node.w / 2;
                  node.y = position.y + node.h / 2;
                }
              });
              drawAll();
              vp?.fit();
            });
        })
        .catch(() => {});
    }
  };
  const forceEdge = (ref) => {
    const m = map(),
      A = m.get(ref.e.from),
      B = m.get(ref.e.to),
      p0 = rimPoint(A, B),
      p1 = rimPoint(B, A);
    const back = a.edges.some(
        (e) => e.from === ref.e.to && e.to === ref.e.from,
      ),
      dx = p1.x - p0.x,
      dy = p1.y - p0.y,
      len = Math.hypot(dx, dy) || 1,
      off = back ? 26 : 0;
    const mx0 = (p0.x + p1.x) / 2,
      my0 = (p0.y + p1.y) / 2;
    return {
      d: `M${p0.x} ${p0.y}Q${mx0 - (dy / len) * off} ${my0 + (dx / len) * off} ${p1.x} ${p1.y}`,
      mx: mx0 - ((dy / len) * off) / 2,
      my: my0 + ((dx / len) * off) / 2,
    };
  };
  const bbox = () => {
    const x0 = Math.min(...nodes.map((n) => n.x - n.w / 2)),
      x1 = Math.max(...nodes.map((n) => n.x + n.w / 2)),
      y0 = Math.min(...nodes.map((n) => n.y - n.h / 2)),
      y1 = Math.max(...nodes.map((n) => n.y + n.h / 2));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const groups = (() => {
    const gs = new Map();
    (a.groups || []).forEach((gr) =>
      gs.set(gr.id, {
        id: gr.id,
        label: gr.label || gr.id,
        members: gr.members || [],
      }),
    );
    nodes.forEach((n) => {
      if (n.group) {
        if (!gs.has(n.group))
          gs.set(n.group, { id: n.group, label: n.group, members: [] });
        const m = gs.get(n.group).members;
        if (!m.includes(n.id)) m.push(n.id);
      }
    });
    return [...gs.values()].filter((x) => x.members.length);
  })();
  const groupBox = (gr) => {
    const ms = nodes.filter((n) => gr.members.includes(n.id));
    if (!ms.length) return null;
    const x0 = Math.min(...ms.map((n) => n.x - n.w / 2)) - 26,
      y0 = Math.min(...ms.map((n) => n.y - n.h / 2)) - 34,
      x1 = Math.max(...ms.map((n) => n.x + n.w / 2)) + 26,
      y1 = Math.max(...ms.map((n) => n.y + n.h / 2)) + 26;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  // APRÈS
  const edgeGeom = (ref) => {
    if (mode === "force") return forceEdge(ref);
    const m = map(),
      A = m.get(ref.e.from),
      B = m.get(ref.e.to),
      touched = manual.has(A.id) || manual.has(B.id),
      wp = touched ? [] : ways.get(ref.k) || [];
    const s = (dir === "LR" ? B.x >= A.x : B.y >= A.y) ? 1 : -1;
    const p0 =
        dir === "LR"
          ? { x: A.x + (s * A.w) / 2, y: A.y }
          : { x: A.x, y: A.y + (s * A.h) / 2 },
      pn =
        dir === "LR"
          ? { x: B.x - (s * B.w) / 2, y: B.y }
          : { x: B.x, y: B.y - (s * B.h) / 2 };
    const all = [p0, ...wp, pn];
    let d = `M${p0.x} ${p0.y}`;
    for (let i = 1; i < all.length; i++) {
      const p = all[i - 1],
        q = all[i];
      if (dir === "LR") {
        const k = Math.max(28, Math.abs(q.x - p.x) * 0.5);
        d += `C${p.x + s * k} ${p.y},${q.x - s * k} ${q.y},${q.x} ${q.y}`;
      } else {
        const k = Math.max(28, Math.abs(q.y - p.y) * 0.5);
        d += `C${p.x} ${p.y + s * k},${q.x} ${q.y - s * k},${q.x} ${q.y}`;
      }
    }
    const mi = Math.floor((all.length - 1) / 2),
      pa = all[mi],
      pb = all[mi + 1];
    return { d, mx: (pa.x + pb.x) / 2, my: (pa.y + pb.y) / 2 };
  };
  const placeEdge = (ref) => {
    const gm = edgeGeom(ref);
    ref.path.setAttribute("d", gm.d);
    if (ref.lab)
      ref.lab.setAttribute("transform", `translate(${gm.mx} ${gm.my})`);
  };
  const applyFocus = () => {
    const nbrs = new Set();
    if (sel) {
      nbrs.add(sel);
      a.edges.forEach((e) => {
        if (e.from === sel) nbrs.add(e.to);
        if (e.to === sel) nbrs.add(e.from);
      });
    }
    nodeEls.forEach((el, nid) => {
      el.classList.toggle("is-dim", !!sel && !nbrs.has(nid));
      el.classList.toggle("is-sel", nid === sel);
    });
    edgeRefs.forEach((r) =>
      r.g.classList.toggle(
        "is-dim",
        !!sel && r.e.from !== sel && r.e.to !== sel,
      ),
    );
  };
  const info = (n) => {
    const m = map(),
      ins = a.edges
        .filter((e) => e.to === n.id)
        .map((e) => m.get(e.from)?.label),
      outs = a.edges
        .filter((e) => e.from === n.id)
        .map((e) => m.get(e.to)?.label);
    const r = [["Type", KINDS[n.kind].label]];
    if (n.detail) r.push(["Détail", n.detail]);
    if (ins.length) r.push(["Reçoit de", ins.join(", ")]);
    if (outs.length) r.push(["Envoie vers", outs.join(", ")]);
    return r;
  };
  function edit(n) {
    const inp = dom("input", "ax-edit");
    inp.value = n.label;
    const r = svg.getBoundingClientRect(),
      rr = sh.root.getBoundingClientRect(),
      k = vp.pz.st.k;
    inp.style.left = `${r.left - rr.left + vp.pz.st.x + (n.x - 80) * k}px`;
    inp.style.top = `${r.top - rr.top + vp.pz.st.y + n.y * k - 14}px`;
    inp.style.width = `${160 * k}px`;
    sh.root.append(inp);
    inp.focus();
    inp.select();
    let done = false;
    const commit = (ok) => {
      if (done) return;
      done = true;
      if (ok && inp.value.trim()) {
        n.label = inp.value.trim().slice(0, 80);
        const { x, y } = n;
        Object.assign(n, sizeNode(n), { x, y });
        drawAll();
      }
      inp.remove();
    };
    inp.onkeydown = (e) => {
      if (e.key === "Enter") commit(true);
      if (e.key === "Escape") commit(false);
    };
    inp.onblur = () => commit(true);
  }

  function drawAll() {
    [gG, gE, gN].forEach((x) => x.replaceChildren());
    nodeEls.clear();
    edgeRefs.length = 0;
    groups.forEach((gr) => {
      const b = groupBox(gr);
      if (!b) return;
      const gg = svgn("g", { class: "ax-group" }, gG);
      svgn("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 16 }, gg);
      svgn("text", { x: b.x + 14, y: b.y + 20 }, gg).textContent = gr.label;
    });
    const maxFlow = Math.max(
      1,
      ...a.edges.map((edge) => Number(edge.weight) || 0),
    );
    a.edges.forEach((e, k) => {
      const rel = REL[e.relation] || REL.leads_to,
        eg = svgn("g", { class: "ax-edge" }, gE),
        flowWidth =
          a.semanticType === "energy_sankey" && Number(e.weight) > 0
            ? 2 + 22 * Math.sqrt(e.weight / maxFlow)
            : null,
        path = svgn(
          "path",
          {
            class: "ax-edgepath",
            "stroke-dasharray": rel.dash || null,
            "stroke-width": flowWidth || rel.w || 1.6,
          },
          eg,
        );
      if (a.semanticType === "energy_sankey") {
        path.classList.add("ax-sankey-flow");
        path.setAttribute("stroke-linecap", "butt");
      }
      if (a.semanticType === "mind_map") {
        const source = nodes.find((node) => node.id === e.from);
        eg.style.setProperty(
          "--k",
          source?.color || KINDS[source?.kind || "process"].c,
        );
      }
      if (rel.end !== false && a.semanticType !== "energy_sankey")
        path.setAttribute("marker-end", `url(#${id}-arr)`);
      if (rel.both) path.setAttribute("marker-start", `url(#${id}-arr)`);
      if (rel.start)
        path.setAttribute("marker-start", `url(#${id}-${rel.start})`);
      let lab = null;
      if (e.label) {
        lab = svgn("g", { class: "ax-elabel" }, eg);
        const tw = measure(e.label, DET) + 14;
        svgn(
          "rect",
          { x: -tw / 2, y: -11, width: tw, height: 22, rx: 11 },
          lab,
        );
        svgn("text", { x: 0, y: 4, "text-anchor": "middle" }, lab).textContent =
          e.label;
      }
      eg.addEventListener("pointerenter", (ev) =>
        sh.tip(
          ev,
          `${(nodes.find((n) => n.id === e.from) || {}).label} → ${(nodes.find((n) => n.id === e.to) || {}).label}`,
          [rel.label, e.label],
        ),
      );
      eg.addEventListener("pointermove", (ev) =>
        sh.tip(
          ev,
          `${(nodes.find((n) => n.id === e.from) || {}).label} → ${(nodes.find((n) => n.id === e.to) || {}).label}`,
          [rel.label, e.label],
        ),
      );
      eg.addEventListener("pointerleave", () => sh.hideTip());
      const ref = { e, k, g: eg, path, lab };
      edgeRefs.push(ref);
      placeEdge(ref);
    });
    nodes.forEach((n) => {
      const ng = svgn(
        "g",
        {
          class: "ax-node",
          "data-node": n.id,
          transform: `translate(${n.x} ${n.y})`,
        },
        gN,
      );
      n.isMindRoot =
        a.semanticType === "mind_map" &&
        (n.id === a.rootId || (!a.rootId && !n.parent));
      ng.classList.toggle("is-mind-root", n.isMindRoot);
      ng.style.setProperty("--k", n.color || KINDS[n.kind].c);
      const element = (n.group || n.label || "").toUpperCase();
      const atomColor = {
        C: "#526071",
        H: "#dbe3ee",
        O: "#d66a68",
        N: "#698bd2",
        S: "#d5a33b",
        P: "#dc8558",
      }[element];
      if (a.semanticType === "chemistry_structure") {
        ng.classList.add("is-atom");
        ng.classList.add(`atom-${element.toLowerCase()}`);
        if (atomColor) ng.style.setProperty("--k", atomColor);
      }
      drawShape(ng, n, a.semanticType);
      const t = svgn(
        "text",
        { class: "ax-ntext", "text-anchor": "middle" },
        ng,
      );
      let y =
        -n.th / 2 +
        13 +
        (n.kind === "data" ? 8 : 0) +
        (n.kind === "actor" ? n.h / 2 - n.th + 4 - 2 : 0);
      if (n.kind === "actor") y = n.h / 2 - n.th + 12;
      if (a.semanticType === "chemistry_structure") y = 5;
      n.lines.forEach((l, i) => {
        svgn("tspan", { x: 0, y: y + i * 18, class: "ax-nl" }, t).textContent =
          l;
      });
      if (n.det.length) {
        const t2 = svgn(
          "text",
          { class: "ax-ndetail", "text-anchor": "middle" },
          ng,
        );
        n.det.forEach((l, i) => {
          svgn(
            "tspan",
            { x: 0, y: y + n.lines.length * 18 + 4 + i * 16 },
            t2,
          ).textContent = l;
        });
      }
      ng.addEventListener("pointerenter", (ev) =>
        sh.tip(ev, n.label, [KINDS[n.kind].label, n.detail]),
      );
      ng.addEventListener("pointerleave", () => sh.hideTip());
      ng.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        ev.stopPropagation();
        ng.setPointerCapture(ev.pointerId);
        drag = {
          n,
          sx: ev.clientX,
          sy: ev.clientY,
          ox: n.x,
          oy: n.y,
          moved: false,
        };
        sh.closePop();
      });
      ng.addEventListener("pointermove", (ev) => {
        if (!drag || drag.n !== n) return;
        const dx = (ev.clientX - drag.sx) / vp.pz.st.k,
          dy = (ev.clientY - drag.sy) / vp.pz.st.k;
        if (Math.hypot(dx, dy) * vp.pz.st.k > 4) drag.moved = true;
        if (!drag.moved) return;
        n.x = drag.ox + dx;
        n.y = drag.oy + dy;
        manual.set(n.id, { x: n.x, y: n.y });
        ng.setAttribute("transform", `translate(${n.x} ${n.y})`);
        edgeRefs.forEach(
          (r) => (r.e.from === n.id || r.e.to === n.id) && placeEdge(r),
        );
        sh.hideTip();
      });
      ng.addEventListener("pointerup", (ev) => {
        const d = drag;
        drag = null;
        if (!d || d.moved) return;
        sel = sel === n.id ? null : n.id;
        applyFocus();
        if (sel) sh.pop(ev, n.label, info(n), n.color || KINDS[n.kind].c);
      });
      ng.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        edit(n);
      });
      nodeEls.set(n.id, ng);
    });
    applyFocus();
  }
  layout();
  drawAll();
  vp = viewport(sh, svg, g, bbox, ctx);
  svg.addEventListener("pointerup", (e) => {
    if (!e.target.closest("[data-node]") && !vp.pz.wasPan()) {
      sel = null;
      applyFocus();
      sh.closePop();
    }
  });
  const items = [
    { label: "+", title: "Zoom avant", run: () => vp.pz.zoomCenter(1.2) },
    { label: "−", title: "Zoom arrière", run: () => vp.pz.zoomCenter(1 / 1.2) },
    { label: "Ajuster", title: "Tout afficher", run: () => vp.fitAll() },
    {
      label: "Recalculer",
      title: "Recalculer le layout automatique",
      // APRÈS
      run: () => {
        manual.clear();
        layout();
        drawAll();
        vp.fit();
      },
    },
    {
      label: "Organique",
      title: "Disposition organique (force-directed)",
      toggle: true,
      on: mode === "force",
      run: (on) => {
        mode = on ? "force" : "layered";
        manual.clear();
        layout();
        drawAll();
        vp.fit();
      },
    },
  ];
  if (groups.length) {
    items.push("|");
    groups.slice(0, 6).forEach((gr) =>
      items.push({
        label: gr.label,
        title: `Aller au groupe « ${gr.label} »`,
        run: () => {
          const b = groupBox(gr);
          if (b) vp.fitAll(b);
        },
      }),
    );
  }
  if (a.nodes.length >= 2)
    items.push("|", {
      type: "select",
      label: "Type de schéma",
      value: "system_diagram",
      options: FAMILY_OPTIONS,
      run: (value) => {
        host.replaceChildren();
        mountArtifact({ ...a, semanticType: value }, host, ctx);
      },
    });
  sh.toolbar(items);
  sh.hint(
    "Glisser un bloc : le déplacer · double-clic : renommer · Ctrl + molette : zoom",
  );
  track(sh.root, () => vp.destroy());
}

/* ═══ 6. FRISE CHRONOLOGIQUE ═══ */
const TL = {
  milestone: "#d99a2b",
  start: "#2fa38a",
  end: "#d4587a",
  default: "#6b7fd7",
};
async function mountGeographicMap(a, host, ctx) {
  const sh = makeShell("map", ctx);
  host.append(sh.root);
  const svg = svgn("svg", {
    viewBox: "0 0 920 560",
    class: "ax-svg ax-map-svg",
    role: "img",
    "aria-label": a.title || "Carte géographique",
  });
  sh.stage.append(svg);
  const g = svgn("g", { "data-pz": "1" }, svg);
  const points = a.markers || [],
    routes = a.routes || [];
  const lons = [
    ...points.map((point) => point.longitude),
    ...routes.flatMap((route) => route.points.map((point) => point[0])),
  ];
  const lats = [
    ...points.map((point) => point.latitude),
    ...routes.flatMap((route) => route.points.map((point) => point[1])),
  ];
  let lon0 = Math.min(...lons),
    lon1 = Math.max(...lons),
    lat0 = Math.min(...lats),
    lat1 = Math.max(...lats);
  const lonPad = Math.max((lon1 - lon0) * 0.12, 0.01),
    latPad = Math.max((lat1 - lat0) * 0.12, 0.01);
  lon0 -= lonPad;
  lon1 += lonPad;
  lat0 -= latPad;
  lat1 += latPad;
  const project = (lon, lat) => ({
    x: 72 + ((lon - lon0) / (lon1 - lon0)) * 776,
    y: 480 - ((lat - lat0) / (lat1 - lat0)) * 400,
  });
  for (let index = 0; index <= 8; index++) {
    const x = 72 + index * 97,
      y = 80 + index * 50;
    svgn("path", { d: `M${x} 80V480M72 ${y}H848`, class: "ax-map-grid" }, g);
  }
  svgn(
    "rect",
    { x: 72, y: 80, width: 776, height: 400, rx: 4, class: "ax-map-frame" },
    g,
  );
  routes.forEach((route, index) => {
    const d = route.points
      .map(([lon, lat], pointIndex) => {
        const p = project(lon, lat);
        return `${pointIndex ? "L" : "M"}${p.x} ${p.y}`;
      })
      .join(" ");
    svgn(
      "path",
      { d, class: "ax-map-route", stroke: PALETTE[index % PALETTE.length] },
      g,
    );
    if (route.label) {
      const mid = project(...route.points[Math.floor(route.points.length / 2)]);
      svgn(
        "text",
        { x: mid.x, y: mid.y - 9, class: "ax-map-label" },
        g,
      ).textContent = route.label;
    }
  });
  points.forEach((marker, index) => {
    const p = project(marker.longitude, marker.latitude),
      color = PALETTE[index % PALETTE.length];
    const node = svgn(
      "g",
      {
        class: "ax-map-marker",
        tabindex: "0",
        role: "button",
        "aria-label": `${marker.label}, ${marker.latitude}, ${marker.longitude}`,
      },
      g,
    );
    svgn(
      "circle",
      { cx: p.x, cy: p.y, r: 10, fill: color, class: "ax-map-dot" },
      node,
    );
    svgn("circle", { cx: p.x, cy: p.y, r: 3, class: "ax-map-core" }, node);
    svgn(
      "text",
      { x: p.x + 14, y: p.y - 8, class: "ax-map-label" },
      node,
    ).textContent = marker.label;
    node.addEventListener("pointerenter", (event) =>
      sh.tip(
        event,
        marker.label,
        [
          marker.detail,
          `${fmt(marker.latitude, 5)}°, ${fmt(marker.longitude, 5)}°`,
        ].filter(Boolean),
      ),
    );
    node.addEventListener("pointerleave", () => sh.hideTip());
  });
  svgn(
    "text",
    { x: 848, y: 54, class: "ax-map-north", "text-anchor": "middle" },
    g,
  ).textContent = "N ↑";
  svgn(
    "text",
    { x: 460, y: 530, class: "ax-axis-title", "text-anchor": "middle" },
    g,
  ).textContent = "Longitude (°)";
  svgn(
    "text",
    {
      x: 22,
      y: 280,
      class: "ax-axis-title",
      "text-anchor": "middle",
      transform: "rotate(-90 22 280)",
    },
    g,
  ).textContent = "Latitude (°)";
  const box = () => ({ x: 60, y: 40, w: 800, h: 500 });
  let vp = viewport(sh, svg, g, box, ctx);
  sh.toolbar([
    { label: "+", title: "Zoom avant", run: () => vp.pz.zoomCenter(1.2) },
    { label: "−", title: "Zoom arrière", run: () => vp.pz.zoomCenter(1 / 1.2) },
    {
      label: "Ajuster",
      title: "Afficher tous les repères",
      run: () => vp.fitAll(),
    },
  ]);
  if (a.provenance) sh.hint(a.provenance);
  track(sh.root, () => vp.destroy());
}

async function mountTimeline(a, host, ctx) {
  const sh = makeShell("timeline", ctx);
  host.append(sh.root);
  const id = uid("axt");
  const svg = svgn("svg", {
    class: "ax-svg ax-fill",
    role: "img",
    "aria-label": a.title || "Chronologie",
  });
  sh.stage.append(svg);
  markers(svgn("defs", {}, svg), id);
  const g = svgn("g", {}, svg),
    CW = 196,
    numeric = a.events.every((e) => Number.isFinite(Number(e.t)));
  const items = a.events.map((e) => {
    const lines = wrap(e.label, CW - 24, LBL),
      det = e.detail ? wrap(e.detail, CW - 24, DET).slice(0, 4) : [];
    return {
      ...e,
      lines,
      det,
      h:
        (e.date ? 22 : 8) +
        lines.length * 18 +
        det.length * 16 +
        (det.length ? 6 : 0) +
        14,
      color: TL[e.kind] || TL.default,
    };
  });
  let xs;
  if (numeric) {
    const ts = items.map((e) => +e.t),
      lo = Math.min(...ts),
      span = Math.max(...ts) - lo || 1,
      total = Math.max(items.length * CW * 0.6, 900);
    xs = ts.map((t) => ((t - lo) / span) * total);
  } else xs = items.map((_, i) => i * (CW + 34));
  const placed = [],
    maxH = Math.max(...items.map((i) => i.h));
  items.forEach((it, i) => {
    it.x = xs[i];
    it.side = i % 2 ? 1 : -1;
    let lvl = 0;
    while (
      placed.some(
        (p) =>
          p.side === it.side && p.lvl === lvl && Math.abs(p.x - it.x) < CW + 14,
      )
    )
      lvl++;
    it.lvl = lvl;
    placed.push(it);
    it.y =
      it.side < 0 ? -(54 + lvl * (maxH + 22)) - it.h : 54 + lvl * (maxH + 22);
  });
  const x0 = Math.min(...xs) - CW / 2 - 40,
    x1 = Math.max(...xs) + CW / 2 + 70;
  svgn(
    "path",
    {
      d: `M${x0} 0H${x1}`,
      class: "ax-tl-axis",
      "marker-end": `url(#${id}-arr)`,
    },
    g,
  );
  items.forEach((it) => {
    const eg = svgn("g", { class: "ax-tl-ev" }, g);
    eg.style.setProperty("--k", it.color);
    svgn(
      "path",
      {
        d: `M${it.x} 0V${it.side < 0 ? it.y + it.h : it.y}`,
        class: "ax-tl-conn",
      },
      eg,
    );
    svgn("circle", { cx: it.x, cy: 0, r: 7, class: "ax-tl-dot" }, eg);
    svgn(
      "rect",
      {
        x: it.x - CW / 2,
        y: it.y,
        width: CW,
        height: it.h,
        rx: 10,
        class: "ax-tl-card",
      },
      eg,
    );
    svgn(
      "rect",
      {
        x: it.x - CW / 2,
        y: it.y + 10,
        width: 3,
        height: it.h - 20,
        rx: 1.5,
        class: "ax-tl-bar",
      },
      eg,
    );
    let ty = it.y + 20;
    if (it.date) {
      svgn(
        "text",
        { x: it.x - CW / 2 + 14, y: ty, class: "ax-tl-date" },
        eg,
      ).textContent = it.date;
      ty += 20;
    }
    it.lines.forEach((l, i) => {
      svgn(
        "text",
        { x: it.x - CW / 2 + 14, y: ty + i * 18, class: "ax-nl" },
        eg,
      ).textContent = l;
    });
    ty += it.lines.length * 18 + 2;
    it.det.forEach((l, i) => {
      svgn(
        "text",
        { x: it.x - CW / 2 + 14, y: ty + i * 16, class: "ax-ndetail" },
        eg,
      ).textContent = l;
    });
    eg.addEventListener("pointerenter", (e) =>
      sh.tip(e, it.label, [it.date, it.detail]),
    );
    eg.addEventListener("pointermove", (e) =>
      sh.tip(e, it.label, [it.date, it.detail]),
    );
    eg.addEventListener("pointerleave", () => sh.hideTip());
    eg.addEventListener("click", (e) =>
      sh.pop(
        e,
        it.label,
        [
          it.date && ["Date", it.date],
          it.detail && ["Détail", it.detail],
          it.group && ["Groupe", it.group],
        ].filter(Boolean),
        it.color,
      ),
    );
  });
  const bbox = () => {
    const y0 = Math.min(0, ...items.map((i) => i.y)) - 10,
      y1 = Math.max(0, ...items.map((i) => i.y + i.h)) + 10;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const vp = viewport(sh, svg, g, bbox, ctx, { min: 0.3, max: 3 });
  sh.toolbar([
    { label: "+", run: () => vp.pz.zoomCenter(1.2) },
    { label: "−", run: () => vp.pz.zoomCenter(1 / 1.2) },
    {
      label: "←",
      title: "Reculer",
      run: () => {
        vp.pz.st.x += 260;
        vp.pz.apply();
      },
    },
    {
      label: "→",
      title: "Avancer",
      run: () => {
        vp.pz.st.x -= 260;
        vp.pz.apply();
      },
    },
    { label: "Ajuster", run: () => vp.fitAll() },
  ]);
  sh.hint("Glisser pour naviguer · clic sur un événement : détails");
  track(sh.root, () => vp.destroy());
}

/* ═══ 7. ARBRE DE PROBABILITÉS ═══ */
const toP = (p) => {
  if (typeof p === "number") return p;
  const s = String(p ?? "").trim();
  if (/%$/.test(s)) return parseFloat(s) / 100;
  const f = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  return f ? +f[1] / +f[2] : parseFloat(s.replace(",", "."));
};
async function mountProbTree(a, host, ctx) {
  const sh = makeShell("probtree", ctx);
  host.append(sh.root);
  const svg = svgn("svg", {
    class: "ax-svg ax-fill",
    role: "img",
    "aria-label": a.title || "Arbre de probabilités",
  });
  sh.stage.append(svg);
  const g = svgn("g", {}, svg),
    gE = svgn("g", {}, g),
    gN = svgn("g", {}, g),
    COL = 230,
    ROW = 58,
    leaves = [],
    all = [],
    warns = [];
  let leafY = 0,
    maxD = 0;
  const walk = (n, d, path, factors, prod) => {
    n.d = Math.min(d, 5);
    n.path = path;
    n.factors = factors;
    n.prod = prod;
    n.kids = (n.children || []).slice(0, 6);
    n.w = Math.max(54, measure(String(n.label), LBL) + 26);
    all.push(n);
    maxD = Math.max(maxD, n.d);
    if (!n.kids.length || d >= 5) {
      n.y = leafY;
      leafY += ROW;
      n.isLeaf = true;
      leaves.push(n);
    } else {
      n.kids.forEach((c) => {
        c.p = toP(c.p);
        walk(
          c,
          d + 1,
          [...path, c.label],
          [...factors, c.p],
          prod * (Number.isFinite(c.p) ? c.p : 0),
        );
      });
      n.y = (n.kids[0].y + n.kids[n.kids.length - 1].y) / 2;
      const s = n.kids.reduce((t, c) => t + (c.p || 0), 0);
      n.sum = s;
      if (Math.abs(s - 1) > 1e-6)
        warns.push(
          `Σ des branches issues de « ${n.label} » = ${fmt(s, 4)} (≠ 1)`,
        );
    }
    n.x = n.d * COL;
  };
  const root = a.root;
  root.label = root.label || "Départ";
  walk(root, 0, [], [], 1);
  const resX = (maxD + 1) * COL - 40,
    under = (n) => {
      const out = [];
      const rec = (m) => {
        if (m.isLeaf) out.push(m);
        else m.kids.forEach(rec);
      };
      rec(n);
      return out;
    };
  all.forEach((n) => {
    n.leafSet = new Set(under(n));
  });
  const edgeEls = [],
    nodeEls = [],
    resEls = [];
  all.forEach((n) =>
    n.kids.forEach((c) => {
      const eg = svgn("g", { class: "ax-pt-edge" }, gE);
      svgn(
        "path",
        {
          d: `M${n.x + n.w / 2} ${n.y}L${c.x - c.w / 2} ${c.y}`,
          class: "ax-edgepath",
        },
        eg,
      );
      const mx = n.x + n.w / 2 + (c.x - c.w / 2 - n.x - n.w / 2) * 0.5,
        my = n.y + (c.y - n.y) * 0.5,
        txt = fmt(c.p, 4),
        tw = measure(txt, DET) + 14;
      svgn(
        "rect",
        {
          x: mx - tw / 2,
          y: my - 11,
          width: tw,
          height: 22,
          rx: 11,
          class: "ax-plabel-bg",
        },
        eg,
      );
      svgn(
        "text",
        { x: mx, y: my + 4, "text-anchor": "middle", class: "ax-plabel" },
        eg,
      ).textContent = txt;
      edgeEls.push({ el: eg, c });
    }),
  );
  all.forEach((n) => {
    const ng = svgn(
      "g",
      { class: "ax-pnode" + (n === root ? " is-root" : "") },
      gN,
    );
    svgn(
      "rect",
      { x: n.x - n.w / 2, y: n.y - 15, width: n.w, height: 30, rx: 15 },
      ng,
    );
    svgn(
      "text",
      { x: n.x, y: n.y + 5, "text-anchor": "middle", class: "ax-nl" },
      ng,
    ).textContent = n.label;
    if (n.sum != null && Math.abs(n.sum - 1) > 1e-6) {
      svgn(
        "circle",
        { cx: n.x + n.w / 2 - 2, cy: n.y - 15, r: 7, class: "ax-warn" },
        ng,
      );
      svgn(
        "text",
        {
          x: n.x + n.w / 2 - 2,
          y: n.y - 11,
          "text-anchor": "middle",
          class: "ax-warn-t",
        },
        ng,
      ).textContent = "!";
    }
    nodeEls.push({ el: ng, n });
    if (n.isLeaf && n !== root) {
      const t = svgn("text", { x: resX, y: n.y + 5, class: "ax-res" }, gN),
        calc = n.factors.map((f) => fmt(f, 4)).join(" × ");
      t.textContent = `P(${n.path.join(" ∩ ")}) = ${calc} = ${fmt(n.prod, 4)}`;
      resEls.push({ el: t, n });
      const hot = (on, ev) => {
        const set = new Set([n]);
        nodeEls.forEach((r) =>
          r.el.classList.toggle("is-dim", on && !r.n.leafSet.has(n)),
        );
        edgeEls.forEach((r) =>
          r.el.classList.toggle("is-dim", on && !r.c.leafSet.has(n)),
        );
        resEls.forEach((r) => r.el.classList.toggle("is-dim", on && r.n !== n));
        if (on)
          sh.tip(ev, `P(${n.path.join(" ∩ ")})`, [
            `Produit : ${calc}`,
            `= ${fmt(n.prod, 6)}`,
          ]);
        else sh.hideTip();
      };
      [ng, t].forEach((el) => {
        el.addEventListener("pointerenter", (e) => hot(true, e));
        el.addEventListener("pointermove", (e) =>
          sh.tip(e, `P(${n.path.join(" ∩ ")})`, [
            `Produit : ${calc}`,
            `= ${fmt(n.prod, 6)}`,
          ]),
        );
        el.addEventListener("pointerleave", () => hot(false));
      });
    }
  });
  const bbox = () => ({
    x: -40,
    y: -40,
    w: resX + 340,
    h: Math.max(ROW, leafY) + 40,
  });
  const vp = viewport(sh, svg, g, bbox, ctx, { min: 0.3, max: 3 });
  sh.toolbar([
    { label: "+", run: () => vp.pz.zoomCenter(1.2) },
    { label: "−", run: () => vp.pz.zoomCenter(1 / 1.2) },
    { label: "Ajuster", run: () => vp.fitAll() },
  ]);
  const notes = dom("div", "ax-notes");
  (a.events || []).forEach((ev) => {
    const sel = leaves.filter((l) =>
      (ev.where || []).every((w) => l.path.includes(w)),
    );
    const sum = sel.reduce((s, l) => s + l.prod, 0);
    notes.append(
      dom(
        "div",
        "ax-note-row",
        `${ev.label} = ${sel.map((l) => fmt(l.prod, 4)).join(" + ") || "0"} = ${fmt(sum, 4)}`,
      ),
    );
  });
  const total = leaves.reduce((s, l) => s + l.prod, 0);
  notes.append(
    dom(
      "div",
      "ax-note-row is-muted",
      `Vérification : somme des issues = ${fmt(total, 4)}`,
    ),
  );
  warns.forEach((w) => notes.append(dom("div", "ax-note-row is-warn", w)));
  sh.root.append(notes);
  sh.hint("Survoler une issue : met en évidence son chemin et son calcul");
  track(sh.root, () => vp.destroy());
}

/* ═══ 8. TABLEUR (tri, filtre, formules) ═══ */
async function mountSheet(a, host, ctx) {
  const math = await mathLib(),
    sh = makeShell("sheet", ctx);
  host.append(sh.root);
  const cols = a.columns.map(String),
    rows = a.rows.map((r) => cols.map((_, i) => r[i] ?? "")),
    cache = new Map();
  const val = (r, c, st = []) => {
    const k = `${r}:${c}`;
    if (cache.has(k)) return cache.get(k);
    const raw = rows[r]?.[c];
    let out = raw;
    if (typeof raw === "string" && raw.startsWith("=")) {
      if (st.includes(k)) out = "#CYCLE";
      else {
        try {
          out = evalF(raw.slice(1), [...st, k]);
        } catch {
          out = "#ERREUR";
        }
      }
    } else if (
      typeof raw === "string" &&
      raw.trim() !== "" &&
      Number.isFinite(Number(raw.replace(",", ".")))
    )
      out = Number(raw.replace(",", "."));
    cache.set(k, out);
    return out;
  };
  const evalF = (f, st) => {
    let s = f.replace(/([A-Z])(\d+):([A-Z])(\d+)/g, (_, c1, r1, c2, r2) => {
      const vals = [];
      for (let c = c1.charCodeAt(0) - 65; c <= c2.charCodeAt(0) - 65; c++)
        for (let r = +r1 - 2; r <= +r2 - 2; r++) {
          const v = val(r, c, st);
          if (typeof v === "number") vals.push(v);
        }
      return `[${vals.join(",")}]`;
    });
    s = s
      .replace(/\b([A-Z])(\d+)\b/g, (_, c, r) => {
        const v = val(+r - 2, c.charCodeAt(0) - 65, st);
        return typeof v === "number" ? `(${v})` : "0";
      })
      .replace(/\b(SOMME|SUM)\b/gi, "sum")
      .replace(/\b(MOYENNE|AVERAGE)\b/gi, "mean")
      .replace(/\bMIN\b/gi, "min")
      .replace(/\bMAX\b/gi, "max")
      .replace(/\b(NB|COUNT)\b/gi, "count")
      .replace(/\b(ARRONDI|ROUND)\b/gi, "round")
      .replace(/;/g, ",");
    // APRÈS
    return math.evaluate(safeExpr(s));
  };
  let sort = null,
    filter = "";
  const wrapEl = dom("div", "ax-sheet"),
    table = dom("table");
  wrapEl.append(table);
  sh.stage.append(wrapEl);
  const show = (v) => (typeof v === "number" ? fmt(v, 4) : String(v ?? ""));
  const render = () => {
    cache.clear();
    table.replaceChildren();
    const head = dom("tr");
    head.append(dom("th", "ax-rn", ""));
    cols.forEach((c, i) => {
      const th = dom(
        "th",
        null,
        `${c}${sort?.c === i ? (sort.dir > 0 ? " ▲" : " ▼") : ""}`,
      );
      th.title = `Colonne ${String.fromCharCode(65 + i)} — cliquer pour trier`;
      th.onclick = () => {
        sort =
          sort?.c === i
            ? sort.dir > 0
              ? { c: i, dir: -1 }
              : null
            : { c: i, dir: 1 };
        render();
      };
      head.append(th);
    });
    const thead = dom("thead");
    thead.append(head);
    table.append(thead);
    let idx = rows.map((_, i) => i);
    if (filter)
      idx = idx.filter((r) =>
        cols.some((_, c) =>
          String(show(val(r, c)))
            .toLowerCase()
            .includes(filter),
        ),
      );
    if (sort)
      idx.sort((x, y) => {
        const p = val(x, sort.c),
          q = val(y, sort.c);
        return (
          (typeof p === "number" && typeof q === "number"
            ? p - q
            : String(p).localeCompare(String(q), "fr")) * sort.dir
        );
      });
    const tb = dom("tbody");
    idx.forEach((r) => {
      const tr = dom("tr");
      tr.append(dom("td", "ax-rn", String(r + 2)));
      cols.forEach((_, c) => {
        const v = val(r, c),
          td = dom("td", typeof v === "number" ? "is-num" : "", show(v));
        if (typeof rows[r][c] === "string" && rows[r][c].startsWith("=")) {
          td.classList.add("is-formula");
          td.title = rows[r][c];
        }
        td.ondblclick = () => {
          const inp = dom("input", "ax-cell-edit");
          inp.value = rows[r][c];
          td.replaceChildren(inp);
          inp.focus();
          inp.onblur = () => {
            rows[r][c] = inp.value;
            render();
          };
          inp.onkeydown = (e) => {
            if (e.key === "Enter") inp.blur();
          };
        };
        tr.append(td);
      });
      tb.append(tr);
    });
    table.append(tb);
    count.textContent = `${idx.length} ligne${idx.length > 1 ? "s" : ""}`;
  };
  const bar = sh.toolbar([
    {
      label: "Exporter CSV",
      run: () =>
        ctx.downloadCsv?.({
          title: a.title,
          columns: cols,
          rows: rows.map((r, i) => r.map((_, c) => show(val(i, c)))),
        }),
    },
  ]);
  const f = dom("input", "ax-filter");
  f.placeholder = "Filtrer…";
  f.oninput = () => {
    filter = f.value.toLowerCase();
    render();
  };
  bar.prepend(f);
  const count = dom("div", "ax-sheet-count");
  sh.root.append(count);
  render();
  sh.hint(
    "Clic en-tête : trier · double-clic cellule : modifier (formules = SOMME(B2:B5)…)",
  );
  track(sh.root, () => {});
}

function mountAssembly3D(a, host, ctx, T, sh) {
  const hiddenIds = new Set();
  const visualStyle = ctx.visualStyle || "linear";
  sh.root.dataset.visualStyle = visualStyle;
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(
    Math.min(devicePixelRatio || 1, (a.objects || []).length > 200 ? 1.25 : 2),
  );
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  sh.stage.append(renderer.domElement);
  const scene = new T.Scene();
  const darkTheme = document.documentElement.dataset.theme !== "light";
  const dark = darkTheme;

  scene.background = new T.Color(
    visualStyle === "classroom"
      ? darkTheme
        ? 0x171f29
        : 0xf4f7fb
      : visualStyle === "mono"
        ? darkTheme
          ? 0x101216
          : 0xf3f4f5
        : darkTheme
          ? 0x10131b
          : 0xf7f8fc,
  );
  let camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
  camera.position.set(8, 6, 10);
  camera.lookAt(0, 0, 0);
  const hemi = new T.HemisphereLight(0xe8efff, 0x263043, 2.1);
  scene.add(hemi);
  const key = new T.DirectionalLight(0xffffff, 3.2);
  key.position.set(6, 9, 8);
  scene.add(key);
  const fill = new T.DirectionalLight(0x879cff, 1.4);
  fill.position.set(-7, 3, -5);
  scene.add(fill);
  const model = new T.Group();
  scene.add(model);
  const objects = a.objects || [];
  const colors = {
    housing: 0x8793a7,
    stator: 0x46627d,
    coil: 0xd9984e,
    rotor: 0x8d79ff,
    shaft: 0xb9c1cf,
    bearing: 0x6c91aa,
    atom: 0x56a8c7,
    propeller: 0x55a68b,
    geological_layer: 0x8a705b,
    reservoir: 0xe98148,
    injection_well: 0x4c8fd5,
    production_well: 0x42a987,
    thermal_flow: 0xf0a54a,
    ground_surface: 0x719274,
    rack: 0x53657d,
    server: 0x263448,
    network_switch: 0x274959,
    cooling_unit: 0x4c8c9a,
    data_center_floor: 0x273241,
  };
  const labels = [];
  const styledColor = (value) => {
    const c = new T.Color(value);
    if (visualStyle === "mono") {
      const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      c.setRGB(luma, luma, luma);
    } else if (visualStyle === "classroom") c.offsetHSL(0, 0.12, 0.08);
    return c;
  };
  const material = (color, opacity = 1, metalness = 0.35, extra = {}) => {
    const m = new T.MeshStandardMaterial({
      color: styledColor(color),
      roughness: extra.roughness ?? (visualStyle === "classroom" ? 0.52 : 0.36),
      metalness: visualStyle === "mono" ? 0.12 : metalness,
      transparent: opacity < 1,
      opacity,
      side: T.DoubleSide,
    });
    m.userData.spec = {
      color: styledColor(color).getHex(),
      opacity,
      metalness: m.metalness,
      roughness: m.roughness,
      emissive: !!extra.emissive,
    };
    return m;
  };
  const meshFor = (part) => {
    const kind = `${part.kind} ${part.primitive}`.toLowerCase();
    const [sx, sy, sz] = part.scale || [1, 1, 1];
    const color =
      part.color || colors[part.kind] || colors[part.primitive] || 0x74829a;
    const group = new T.Group();
    const add = (geometry, shade = color, opacity = 1, metalness = 0.35) => {
      const mesh = new T.Mesh(geometry, material(shade, opacity, metalness));
      group.add(mesh);
      return mesh;
    };
    const torusAt = (radius, tube, y, shade = 0xb1bdcc) => {
      const ring = add(
        new T.TorusGeometry(radius, tube, 12, 56),
        shade,
        1,
        0.56,
      );
      ring.position.y = y;
      return ring;
    };
    // Domain geometry is selected from the JSON component semantics. No scene is
    // populated unless the document explicitly describes the corresponding part.
    if (
      /containment|enceinte|reactor_building|b[aâ]timent.?r[ée]acteur/.test(
        kind,
      )
    ) {
      const radius = 1.8 * sx,
        wall = 3.1 * sy;
      add(
        new T.CylinderGeometry(radius, radius, wall, 64, 1, true),
        color,
        0.14,
        0.08,
      );
      const dome = add(
        new T.SphereGeometry(radius, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
        0xb7c8de,
        0.18,
        0.05,
      );
      dome.position.y = wall / 2;
      torusAt(radius, 0.045, -wall / 2, 0xa7b6c9);
      torusAt(radius, 0.045, wall / 2, 0xa7b6c9);
      return group;
    }
    if (
      /reactor_vessel|pressure_vessel|cuve.?du.?r[ée]acteur|cuve/.test(kind)
    ) {
      const radius = 0.72 * sx,
        height = 2.25 * sy;
      add(new T.CylinderGeometry(radius, radius, height, 56), color, 1, 0.58);
      add(
        new T.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        0xb8c5d7,
        1,
        0.5,
      ).position.y = height / 2;
      add(
        new T.SphereGeometry(
          radius,
          48,
          24,
          0,
          Math.PI * 2,
          Math.PI / 2,
          Math.PI / 2,
        ),
        0x7f8da1,
        1,
        0.5,
      ).position.y = -height / 2;
      torusAt(radius * 1.08, 0.075 * sx, -height * 0.33, 0xc6d0dd);
      torusAt(radius * 1.08, 0.075 * sx, height * 0.33, 0xc6d0dd);
      for (let nozzle = 0; nozzle < 4; nozzle++) {
        const angle = (nozzle * Math.PI) / 2;
        const pipe = add(
          new T.CylinderGeometry(0.12 * sx, 0.12 * sx, 0.58 * sz, 20),
          0xaeb9c8,
          1,
          0.52,
        );
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(
          Math.cos(angle) * radius,
          0.42 * sy,
          Math.sin(angle) * radius,
        );
      }
      return group;
    }
    if (/reactor_core|fuel_assembly|c[œo]ur|combustible|fuel_rod/.test(kind)) {
      const width = 0.95 * sx,
        height = 1.25 * sy,
        rows = /assembly|assemblage/.test(kind) ? 9 : 7;
      add(
        new T.BoxGeometry(width, 0.12 * sy, width),
        0x34495e,
        1,
        0.34,
      ).position.y = -height / 2;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < rows; col++) {
          const rod = add(
            new T.CylinderGeometry(0.018 * sx, 0.018 * sx, height, 8),
            (row + col) % 6 === 0 ? 0xf0a54a : 0xd5dee9,
            1,
            0.62,
          );
          rod.position.set(
            (col / (rows - 1) - 0.5) * width * 0.86,
            0,
            (row / (rows - 1) - 0.5) * width * 0.86,
          );
        }
      return group;
    }
    if (/steam_generator|g[ée]n[ée]rateur.?de.?vapeur|echangeur/.test(kind)) {
      const radius = 0.57 * sx,
        height = 1.85 * sy;
      add(
        new T.CylinderGeometry(radius, radius, height * 0.72, 48),
        color,
        0.88,
        0.42,
      );
      add(
        new T.SphereGeometry(radius, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        color,
        0.88,
        0.4,
      ).position.y = height * 0.36;
      add(
        new T.SphereGeometry(
          radius,
          40,
          24,
          0,
          Math.PI * 2,
          Math.PI / 2,
          Math.PI / 2,
        ),
        0x7f8da1,
        0.88,
        0.4,
      ).position.y = -height * 0.36;
      torusAt(radius * 1.04, 0.04 * sx, 0, 0xd8a864);
      for (let tubeIndex = 0; tubeIndex < 5; tubeIndex++) {
        const x = (tubeIndex - 2) * radius * 0.22;
        const pts = [
          new T.Vector3(x, -height * 0.35, 0),
          new T.Vector3(x, -height * 0.08, 0.18),
          new T.Vector3(x, height * 0.22, 0.18),
          new T.Vector3(x, height * 0.35, 0),
        ];
        const tube = add(
          new T.TubeGeometry(
            new T.CatmullRomCurve3(pts),
            28,
            0.018 * sx,
            8,
            false,
          ),
          0xd9a654,
          1,
          0.66,
        );
      }
      return group;
    }
    if (/pressurizer|pressuriseur/.test(kind)) {
      const radius = 0.48 * sx,
        height = 1.65 * sy;
      add(
        new T.CylinderGeometry(radius, radius, height * 0.7, 48),
        color,
        1,
        0.46,
      );
      add(
        new T.SphereGeometry(radius, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        color,
        1,
        0.44,
      ).position.y = height * 0.35;
      add(
        new T.SphereGeometry(
          radius,
          40,
          24,
          0,
          Math.PI * 2,
          Math.PI / 2,
          Math.PI / 2,
        ),
        color,
        1,
        0.44,
      ).position.y = -height * 0.35;
      for (let heater = -1; heater <= 1; heater++) {
        const rod = add(
          new T.CylinderGeometry(0.025 * sx, 0.025 * sx, 0.35 * sy, 10),
          0xe6a34a,
          1,
          0.3,
        );
        rod.position.set(heater * radius * 0.42, -height * 0.48, 0);
      }
      return group;
    }
    if (/primary_pump|coolant_pump|pompe/.test(kind)) {
      const axis = add(
        new T.CylinderGeometry(0.38 * sx, 0.38 * sx, 0.72 * sy, 40),
        color,
        1,
        0.55,
      );
      axis.rotation.z = Math.PI / 2;
      const volute = add(
        new T.TorusGeometry(0.35 * sx, 0.12 * sx, 16, 40),
        0x7e91a9,
        1,
        0.5,
      );
      volute.position.x = -0.22 * sx;
      volute.rotation.y = Math.PI / 2;
      const motor = add(
        new T.CylinderGeometry(0.28 * sx, 0.28 * sx, 0.72 * sz, 32),
        0x50647c,
        1,
        0.62,
      );
      motor.rotation.z = Math.PI / 2;
      motor.position.x = 0.58 * sx;
      for (let fin = 0; fin < 9; fin++) {
        const rib = add(
          new T.TorusGeometry(0.285 * sx, 0.018 * sx, 8, 32),
          0x9aaabe,
          1,
          0.56,
        );
        rib.rotation.z = Math.PI / 2;
        rib.position.x = 0.25 * sx + fin * 0.075 * sx;
      }
      return group;
    }
    if (/turbine|turbine_stage|turbine_low|turbine_high/.test(kind)) {
      const shaft = add(
        new T.CylinderGeometry(0.1 * sy, 0.1 * sy, 2.7 * sx, 32),
        0xb8c4d4,
        1,
        0.68,
      );
      shaft.rotation.z = Math.PI / 2;
      for (let stage = 0; stage < 5; stage++) {
        const x = (stage - 2) * 0.42 * sx,
          r = (0.32 + stage * 0.11) * sy;
        const disk = add(
          new T.CylinderGeometry(r, r, 0.11 * sx, 48),
          stage < 2 ? 0x8298bb : 0x6e8eb4,
          1,
          0.58,
        );
        disk.rotation.z = Math.PI / 2;
        disk.position.x = x;
        for (let blade = 0; blade < 16; blade++) {
          const angle = (blade * Math.PI) / 8;
          const vane = add(
            new T.BoxGeometry(0.19 * sx, 0.035 * sy, 0.055 * sz),
            0xc4d4e8,
            1,
            0.66,
          );
          vane.position.set(
            x,
            Math.sin(angle) * r * 0.78,
            Math.cos(angle) * r * 0.78,
          );
          vane.rotation.x = angle;
        }
      }
      return group;
    }
    if (/alternator|generator|alternateur/.test(kind)) {
      const casing = add(
        new T.CylinderGeometry(0.62 * sy, 0.62 * sy, 1.65 * sx, 56),
        color,
        0.78,
        0.55,
      );
      casing.rotation.z = Math.PI / 2;
      for (const x of [-0.85 * sx, 0.85 * sx]) {
        const end = add(
          new T.CylinderGeometry(0.58 * sy, 0.58 * sy, 0.08 * sx, 56),
          0xaebbd0,
          1,
          0.64,
        );
        end.rotation.z = Math.PI / 2;
        end.position.x = x;
      }
      const rotor = add(
        new T.CylinderGeometry(0.27 * sy, 0.27 * sy, 1.7 * sx, 40),
        0xb98748,
        1,
        0.68,
      );
      rotor.rotation.z = Math.PI / 2;
      for (let vent = 0; vent < 12; vent++) {
        const angle = (vent * Math.PI) / 6;
        const slot = add(
          new T.BoxGeometry(1.18 * sx, 0.035 * sy, 0.02 * sz),
          0x33445b,
          1,
          0.2,
        );
        slot.position.set(
          0,
          Math.sin(angle) * 0.62 * sy,
          Math.cos(angle) * 0.62 * sz,
        );
        slot.rotation.x = angle;
      }
      return group;
    }
    if (/condenser|condenseur/.test(kind)) {
      const radius = 0.62 * sy,
        length = 1.75 * sx;
      const shell = add(
        new T.CylinderGeometry(radius, radius, length, 48, 1, true),
        color,
        0.32,
        0.24,
      );
      shell.rotation.z = Math.PI / 2;
      for (const x of [-length * 0.49, length * 0.49]) {
        const head = add(
          new T.CylinderGeometry(radius, radius, 0.1 * sx, 48),
          0x8498ad,
          0.72,
          0.4,
        );
        head.rotation.z = Math.PI / 2;
        head.position.x = x;
      }
      for (let row = -3; row <= 3; row++)
        for (let col = -3; col <= 3; col++) {
          const tube = add(
            new T.CylinderGeometry(0.018 * sy, 0.018 * sy, length * 0.94, 8),
            0x80bdc5,
            0.95,
            0.5,
          );
          tube.rotation.z = Math.PI / 2;
          tube.position.set(0, row * radius * 0.2, col * radius * 0.2);
        }
      return group;
    }
    if (/cooling_tower|tour_de_refroidissement|cooling_tower/.test(kind)) {
      const height = 2.4 * sy,
        r = 0.86 * sx;
      const profile = [
        new T.Vector2(r * 0.88, -height / 2),
        new T.Vector2(r * 0.96, -height * 0.25),
        new T.Vector2(r * 0.82, 0),
        new T.Vector2(r * 0.73, height * 0.24),
        new T.Vector2(r * 0.88, height / 2),
      ];
      add(new T.LatheGeometry(profile, 64), color, 0.68, 0.12);
      const plume = add(
        new T.CylinderGeometry(r * 0.18, r * 0.3, height * 0.9, 24),
        0xd4e6f2,
        0.12,
        0,
      );
      plume.position.y = height * 0.95;
      return group;
    }
    if (/transformer|transformateur/.test(kind)) {
      add(new T.BoxGeometry(1.35 * sx, 0.9 * sy, 0.95 * sz), color, 1, 0.42);
      for (let coil = -1; coil <= 1; coil++) {
        const ring = add(
          new T.CylinderGeometry(0.13 * sx, 0.13 * sx, 0.58 * sy, 24),
          0xc4944c,
          1,
          0.62,
        );
        ring.position.set(coil * 0.34 * sx, 0.72 * sy, 0);
        for (let winding = 0; winding < 5; winding++) {
          const loop = add(
            new T.TorusGeometry(0.15 * sx, 0.022 * sx, 8, 28),
            0xe1bd78,
            1,
            0.58,
          );
          loop.position.set(
            coil * 0.34 * sx,
            0.51 * sy + winding * 0.09 * sy,
            0,
          );
        }
      }
      return group;
    }
    if (/aircraft_fuselage|fuselage|airplane_body|avion/.test(kind)) {
      const body = add(
        new T.CylinderGeometry(0.22 * sy, 0.32 * sy, 2.8 * sx, 40),
        color,
        1,
        0.46,
      );
      body.rotation.z = Math.PI / 2;
      const nose = add(
        new T.ConeGeometry(0.22 * sy, 0.58 * sx, 40),
        0xbac7d9,
        1,
        0.44,
      );
      nose.rotation.z = -Math.PI / 2;
      nose.position.x = 1.65 * sx;
      const tail = add(
        new T.ConeGeometry(0.3 * sy, 0.5 * sx, 32),
        color,
        1,
        0.38,
      );
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -1.55 * sx;
      const canopy = add(
        new T.SphereGeometry(0.25 * sy, 28, 18),
        0x68a8c9,
        0.82,
        0.24,
      );
      canopy.scale.set(1.3, 0.48, 0.85);
      canopy.position.set(0.7 * sx, 0.19 * sy, 0);
      return group;
    }
    if (/aircraft_wing|wing|aile/.test(kind)) {
      const shape = new T.Shape();
      shape.moveTo(-1.9 * sx, -0.12 * sz);
      shape.lineTo(1.8 * sx, -0.42 * sz);
      shape.lineTo(2.15 * sx, -0.28 * sz);
      shape.lineTo(1.65 * sx, 0.32 * sz);
      shape.lineTo(-1.2 * sx, 0.16 * sz);
      shape.closePath();
      const wing = add(
        new T.ExtrudeGeometry(shape, {
          depth: 0.08 * sy,
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: 0.025 * sy,
          bevelThickness: 0.02 * sy,
        }),
        color,
        1,
        0.42,
      );
      wing.rotation.x = Math.PI / 2;
      return group;
    }
    if (/tail_fin|vertical_stabilizer|d[ée]rive/.test(kind)) {
      const shape = new T.Shape();
      shape.moveTo(-0.45 * sx, 0);
      shape.lineTo(0.42 * sx, 0);
      shape.lineTo(0.12 * sx, 1.05 * sy);
      shape.lineTo(-0.18 * sx, 0.92 * sy);
      shape.closePath();
      const fin = add(
        new T.ExtrudeGeometry(shape, {
          depth: 0.07 * sz,
          bevelEnabled: true,
          bevelSize: 0.02,
          bevelThickness: 0.02,
          bevelSegments: 2,
        }),
        color,
        1,
        0.36,
      );
      fin.position.z = -0.04 * sz;
      return group;
    }
    if (/jet_engine|turbofan|reacteur_avion/.test(kind)) {
      const casing = add(
        new T.CylinderGeometry(0.43 * sy, 0.35 * sy, 1.7 * sx, 48, 1, true),
        color,
        0.62,
        0.5,
      );
      casing.rotation.z = Math.PI / 2;
      for (const x of [-0.82 * sx, 0.82 * sx]) {
        const rim = add(
          new T.TorusGeometry(0.4 * sy, 0.05 * sy, 12, 48),
          0xaab9cc,
          1,
          0.6,
        );
        rim.rotation.y = Math.PI / 2;
        rim.position.x = x;
      }
      const fanHub = add(
        new T.CylinderGeometry(0.08 * sy, 0.08 * sy, 0.12 * sx, 24),
        0xc1cbd8,
        1,
        0.68,
      );
      fanHub.rotation.z = Math.PI / 2;
      fanHub.position.x = 0.12 * sx;
      for (let blade = 0; blade < 18; blade++) {
        const angle = (blade * Math.PI) / 9;
        const vane = add(
          new T.BoxGeometry(0.26 * sx, 0.035 * sy, 0.07 * sz),
          0xd1d9e3,
          1,
          0.6,
        );
        vane.position.set(
          0.12 * sx,
          Math.sin(angle) * 0.25 * sy,
          Math.cos(angle) * 0.25 * sz,
        );
        vane.rotation.x = angle;
      }
      return group;
    }
    if (/drone_frame|quadcopter_frame|chassis/.test(kind)) {
      add(new T.BoxGeometry(0.32 * sx, 0.12 * sy, 0.32 * sz), color, 1, 0.45);
      for (let arm = 0; arm < 4; arm++) {
        const angle = Math.PI / 4 + (arm * Math.PI) / 2;
        const beam = add(
          new T.CylinderGeometry(0.045 * sy, 0.045 * sy, 1.15 * sx, 16),
          color,
          1,
          0.5,
        );
        beam.rotation.z = Math.PI / 2;
        beam.rotation.y = angle;
        beam.position.set(
          Math.cos(angle) * 0.37 * sx,
          0,
          Math.sin(angle) * 0.37 * sz,
        );
      }
      return group;
    }
    if (
      /building_shell|building|structure_b[aâ]timent|b[aâ]timent/.test(kind)
    ) {
      const width = 1.8 * sx,
        height = 1.5 * sy,
        depth = 1.4 * sz;
      add(new T.BoxGeometry(width, height, depth), color, 0.22, 0.08);
      for (const side of [-1, 1]) {
        const wall = add(
          new T.BoxGeometry(0.045 * sx, height, depth),
          0x94a6bd,
          0.5,
          0.08,
        );
        wall.position.x = side * width * 0.48;
      }
      for (let floor = 0; floor < 3; floor++)
        for (let win = 0; win < 4; win++) {
          const window = add(
            new T.BoxGeometry(0.18 * sx, 0.16 * sy, 0.025 * sz),
            0x65a7c8,
            0.76,
            0.12,
          );
          window.position.set(
            -0.6 * sx + win * 0.4 * sx,
            -0.38 * sy + floor * 0.42 * sy,
            depth * 0.51,
          );
        }
      return group;
    }
    if (/heart|c[œo]ur/.test(kind)) {
      const shape = new T.Shape();
      shape.moveTo(0, -0.55 * sy);
      shape.bezierCurveTo(
        -0.3 * sx,
        -0.2 * sy,
        -0.8 * sx,
        0.12 * sy,
        -0.65 * sx,
        0.58 * sy,
      );
      shape.bezierCurveTo(
        -0.5 * sx,
        0.95 * sy,
        -0.1 * sx,
        0.78 * sy,
        0,
        0.47 * sy,
      );
      shape.bezierCurveTo(
        0.18 * sx,
        0.83 * sy,
        0.58 * sx,
        0.84 * sy,
        0.7 * sx,
        0.45 * sy,
      );
      shape.bezierCurveTo(
        0.82 * sx,
        0.1 * sy,
        0.28 * sx,
        -0.22 * sy,
        0,
        -0.55 * sy,
      );
      add(
        new T.ExtrudeGeometry(shape, {
          depth: 0.32 * sz,
          bevelEnabled: true,
          bevelSegments: 4,
          bevelSize: 0.05,
          bevelThickness: 0.05,
        }),
        0xd76570,
        1,
        0.12,
      );
      return group;
    }
    if (/rack|cabinet|baie/.test(kind)) {
      const width = 1.45 * sx,
        height = 2.35 * sy,
        depth = 0.95 * sz;
      add(new T.BoxGeometry(width, height, depth), 0x263241, 0.24, 0.12);
      for (const x of [-width * 0.47, width * 0.47])
        for (const z of [-depth * 0.47, depth * 0.47]) {
          const post = add(
            new T.BoxGeometry(0.055 * sx, height, 0.055 * sz),
            color,
            1,
            0.62,
          );
          post.position.set(x, 0, z);
        }
      for (let level = 0; level < 8; level++) {
        const y = -height * 0.4 + level * height * 0.115;
        const shelf = add(
          new T.BoxGeometry(width * 0.82, 0.19 * sy, depth * 0.76),
          0x34465c,
          1,
          0.5,
        );
        shelf.position.set(0, y, depth * 0.02);
        const face = add(
          new T.BoxGeometry(width * 0.68, 0.105 * sy, 0.035 * sz),
          level % 2 ? 0x397a8e : 0x3d5e85,
          1,
          0.48,
        );
        face.position.set(0, y + 0.025 * sy, depth * 0.51);
        for (let led = 0; led < 4; led++) {
          const light = add(
            new T.SphereGeometry(0.018 * sx, 8, 6),
            led === 0 ? 0x4bd6a0 : 0x66aee8,
            1,
            0.05,
          );
          light.position.set(
            -width * 0.25 + led * width * 0.1,
            y + 0.035 * sy,
            depth * 0.54,
          );
        }
      }
      for (const side of [-1, 1]) {
        const rail = add(
          new T.BoxGeometry(0.035 * sx, height * 0.9, 0.035 * sz),
          0xa5b2c3,
          1,
          0.66,
        );
        rail.position.set(side * width * 0.39, 0, depth * 0.53);
      }
    } else if (/server|compute|storage_node/.test(kind)) {
      add(new T.BoxGeometry(1.12 * sx, 0.28 * sy, 0.82 * sz), color, 1, 0.48);
      const front = add(
        new T.BoxGeometry(0.88 * sx, 0.16 * sy, 0.025 * sz),
        0x182331,
        1,
        0.2,
      );
      front.position.z = 0.42 * sz;
      for (let i = 0; i < 4; i++) {
        const vent = add(
          new T.BoxGeometry(0.045 * sx, 0.11 * sy, 0.012 * sz),
          0x8492a5,
          1,
          0.2,
        );
        vent.position.set(-0.3 * sx + i * 0.12 * sx, 0, 0.44 * sz);
      }
      const led = add(
        new T.SphereGeometry(0.025 * sx, 10, 8),
        0x54e0a4,
        1,
        0.05,
      );
      led.position.set(0.42 * sx, 0, 0.45 * sz);
    } else if (/switch|router/.test(kind)) {
      add(new T.BoxGeometry(1.18 * sx, 0.2 * sy, 0.72 * sz), color, 1, 0.56);
      for (let port = 0; port < 10; port++) {
        const jack = add(
          new T.BoxGeometry(0.065 * sx, 0.075 * sy, 0.035 * sz),
          0x111a25,
          1,
          0.18,
        );
        jack.position.set(
          -0.48 * sx + port * 0.106 * sx,
          -0.015 * sy,
          0.37 * sz,
        );
      }
    } else if (/cooling|ventilation|climatisation/.test(kind)) {
      add(new T.BoxGeometry(1.15 * sx, 1.35 * sy, 0.72 * sz), color, 1, 0.38);
      for (let i = 0; i < 7; i++) {
        const vent = add(
          new T.BoxGeometry(0.82 * sx, 0.035 * sy, 0.025 * sz),
          0xb5dbe3,
          0.82,
          0.1,
        );
        vent.position.set(0, -0.42 * sy + i * 0.14 * sy, 0.38 * sz);
      }
      const fan = add(
        new T.TorusGeometry(0.22 * sx, 0.035 * sy, 10, 32),
        0x87bbc8,
        1,
        0.2,
      );
      fan.position.set(0, 0.45 * sy, 0.38 * sz);
    } else if (/aisle|all[ée]e/.test(kind)) {
      add(
        new T.BoxGeometry(1.8 * sx, 0.045 * sy, 1.15 * sz),
        0x33404e,
        1,
        0.08,
      );
      for (let mark = -2; mark <= 2; mark++) {
        const stripe = add(
          new T.BoxGeometry(0.035 * sx, 0.012 * sy, 0.16 * sz),
          0xe1b957,
          1,
          0.05,
        );
        stripe.position.set(mark * 0.29 * sx, 0.03 * sy, 0);
      }
    } else if (/data_center_floor|floor|ground_plane/.test(kind)) {
      add(new T.BoxGeometry(2 * sx, 0.08 * sy, 2 * sz), color, 1, 0.12);
      for (let mark = -2; mark <= 2; mark++) {
        const seam = add(
          new T.BoxGeometry(0.012 * sx, 0.003 * sy, 1.8 * sz),
          0x8995a4,
          0.4,
          0.04,
        );
        seam.position.x = mark * 0.38 * sx;
      }
    } else if (/atom/.test(kind)) {
      add(new T.SphereGeometry(0.38 * sx, 32, 24), color, 1, 0.08);
      const glow = new T.Mesh(
        new T.SphereGeometry(0.43 * sx, 24, 18),
        new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 }),
      );
      group.add(glow);
    } else if (/stator/.test(kind)) {
      add(
        new T.CylinderGeometry(0.95 * sx, 0.95 * sx, 1.6 * sy, 56, 1, true),
        color,
        0.3,
      );
      for (const y of [-0.72 * sy, 0.72 * sy])
        ((add(
          new T.TorusGeometry(0.95 * sx, 0.07 * sz, 10, 56),
          0x9aa8ba,
        ).rotation.x = Math.PI / 2),
          (group.children.at(-1).position.y = y));
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2;
        const slot = add(
          new T.BoxGeometry(0.14 * sx, 1.25 * sy, 0.19 * sz),
          0x2c4258,
        );
        slot.position.set(Math.sin(t) * 0.78 * sx, 0, Math.cos(t) * 0.78 * sz);
      }
    } else if (/coil|bobin/.test(kind)) {
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        const loop = add(
          new T.TorusGeometry(0.27 * sx, 0.065 * sy, 10, 28),
          color,
        );
        loop.rotation.x = Math.PI / 2;
        loop.position.set(Math.sin(t) * 0.8 * sx, 0, Math.cos(t) * 0.8 * sz);
      }
    } else if (/rotor/.test(kind)) {
      add(new T.CylinderGeometry(0.53 * sx, 0.53 * sx, 1.55 * sy, 48), color);
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        const magnet = add(
          new T.BoxGeometry(0.16 * sx, 1.2 * sy, 0.19 * sz),
          i % 2 ? 0xc36169 : 0x4d8cd3,
        );
        magnet.position.set(
          Math.sin(t) * 0.57 * sx,
          0,
          Math.cos(t) * 0.57 * sz,
        );
      }
    } else if (/shaft/.test(kind)) {
      add(new T.CylinderGeometry(0.12 * sx, 0.12 * sx, 2.4 * sy, 32), color);
      const step = add(
        new T.CylinderGeometry(0.2 * sx, 0.2 * sx, 0.42 * sy, 32),
        0x8996a8,
      );
      step.position.y = 0.55 * sy;
    } else if (/bearing/.test(kind)) {
      const ring = add(
        new T.TorusGeometry(0.48 * sx, 0.09 * sy, 16, 48),
        color,
      );
      ring.rotation.x = Math.PI / 2;
      const inner = add(
        new T.TorusGeometry(0.29 * sx, 0.055 * sy, 12, 40),
        0xc4cbd6,
      );
      inner.rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        const ball = add(new T.SphereGeometry(0.055 * sx, 14, 12), 0xd2d8e2);
        ball.position.set(Math.sin(t) * 0.38 * sx, 0, Math.cos(t) * 0.38 * sx);
      }
    } else if (/injection.?well|production.?well|puits/.test(kind)) {
      add(
        new T.CylinderGeometry(0.075 * sx, 0.075 * sx, 1.8 * sy, 20),
        color,
        0.9,
        0.25,
      );
      add(
        new T.CylinderGeometry(0.19 * sx, 0.19 * sx, 0.1 * sy, 24),
        color,
        0.95,
        0.25,
      ).position.y = 0.88 * sy;
    } else if (
      /geological.?layer|ground.?surface|reservoir|r[ée]servoir|formation/.test(
        kind,
      )
    ) {
      const opacity = /reservoir|r[ée]servoir/.test(kind)
        ? 0.42
        : /ground.?surface/.test(kind)
          ? 0.58
          : 0.32;
      add(new T.BoxGeometry(2 * sx, 2 * sy, 2 * sz), color, opacity, 0.05);
    } else if (/thermal.?flow|flux.?thermique/.test(kind)) {
      add(new T.SphereGeometry(0.14 * sx, 20, 16), color, 0.9, 0.05);
    } else if (/shell|housing|carter/.test(kind)) {
      add(
        new T.CylinderGeometry(0.92 * sx, 0.92 * sx, 1.9 * sy, 56, 1, true),
        color,
        0.16,
      );
      for (const y of [-0.95 * sy, 0.95 * sy]) {
        const rim = add(
          new T.TorusGeometry(0.92 * sx, 0.07 * sz, 12, 56),
          0x8f9bae,
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.y = y;
      }
    } else if (/propeller/.test(kind)) {
      const hub = add(
        new T.CylinderGeometry(0.18 * sx, 0.18 * sx, 0.28 * sy, 24),
        color,
      );
      for (let i = 0; i < 3; i++) {
        const blade = add(
          new T.BoxGeometry(0.14 * sx, 0.08 * sy, 1.05 * sz),
          color,
        );
        blade.rotation.y = (i / 3) * Math.PI * 2;
        blade.position.y = 0.08 * sy;
      }
      void hub;
    } else if (/sphere|atom/.test(kind))
      add(new T.SphereGeometry(0.55 * sx, 32, 24), color);
    else if (/cylinder/.test(kind))
      add(new T.CylinderGeometry(0.52 * sx, 0.52 * sx, 1.1 * sy, 40), color);
    else if (/cone/.test(kind))
      add(new T.ConeGeometry(0.6 * sx, 1.2 * sy, 36), color);
    else if (/plate/.test(kind))
      add(new T.BoxGeometry(1.2 * sx, 0.12 * sy, 0.85 * sz), color);
    else add(new T.BoxGeometry(1.1 * sx, 0.75 * sy, 0.8 * sz), color);
    return group;
  };
  const positions = new Map();
  const layerForPart = new Map(
    (a.layers || []).flatMap((layer) =>
      layer.objectIds.map((objectId) => [objectId, layer]),
    ),
  );
  let selectedPart = null;
  let gridHelper = null;
  const plan = planAssembly(T, objects, a, {
    material,
    meshFor,
    model,
    subject: ctx.subject,
  });
  plan.entries.forEach(({ part, object, anchor, center }) => {
    const layer = layerForPart.get(part.id);
    object.userData.visualLayer = layer?.id || "";
    if (layer?.visible === false) object.visible = false;
    positions.set(part.id, center);
    const rangeLabels = [];
    if (part.depthRange?.length === 2)
      rangeLabels.push(
        `${Number(part.depthRange[0]).toLocaleString("fr-FR")}–${Number(part.depthRange[1]).toLocaleString("fr-FR")} m`,
      );
    if (part.temperatureRange?.length === 2)
      rangeLabels.push(
        `${part.temperatureRange[0]}–${part.temperatureRange[1]} °C`,
      );
    const visibleLabel =
      a.preset === "geothermal" && rangeLabels.length
        ? `${part.label} · ${rangeLabels.join(" · ")}`
        : part.label;
    const label = dom("div", "ax-3d-label is-note", visibleLabel);
    label.title = part.detail || visibleLabel;
    sh.stage.append(label);
    labels.push({
      label,
      point: anchor.clone(),
      id: part.id,
      major: part.major === true || plan.entries.length <= 14,
    });
  });
  const relationGroup = new T.Group();
  model.add(relationGroup);
  (a.relationships || []).forEach((relation) => {
    const from = positions.get(relation.from),
      to = positions.get(relation.to);
    if (!from || !to) return;
    const semantics = `${relation.type} ${relation.label}`.toLowerCase();
    const thermal =
      a.preset === "geothermal" &&
      /flow|inject|produce|circul|heat/i.test(semantics);
    const circuitColor = /primary|primaire|hot_leg/i.test(semantics)
      ? 0xe16d5d
      : /secondary|vapeur|steam/i.test(semantics)
        ? 0xe6ad53
        : /cooling|coolant|refroidissement|tertiary/i.test(semantics)
          ? 0x53a9d4
          : /electric|electrical|power|réseau/i.test(semantics)
            ? 0xd4c76a
            : thermal
              ? 0xf0a54a
              : 0x99a4b8;
    const flowing =
      thermal ||
      /flow|circul|inject|produce|pipe|circuit|connects|transfers|transfert|heat/i.test(
        semantics,
      );
    const direction = to.clone().sub(from),
      length = direction.length();
    if (flowing && length > 0.12) {
      const bend = from.clone().add(to).multiplyScalar(0.5);
      bend.y += Math.min(0.35, length * 0.05) * (from.x <= to.x ? 1 : -1);
      const route = new T.CatmullRomCurve3([from, bend, to]);
      relationGroup.add(
        new T.Mesh(
          new T.TubeGeometry(route, 24, thermal ? 0.035 : 0.028, 8, false),
          material(circuitColor, 0.9, 0.38),
        ),
      );
      relationGroup.add(
        new T.ArrowHelper(
          direction.normalize(),
          from.clone().add(to).multiplyScalar(0.5),
          Math.min(length * 0.22, 0.38),
          circuitColor,
          0.15,
          0.1,
        ),
      );
    } else {
      const geometry = new T.BufferGeometry().setFromPoints([from, to]);
      relationGroup.add(
        new T.Line(
          geometry,
          new T.LineDashedMaterial({
            color: circuitColor,
            dashSize: 0.1,
            gapSize: 0.08,
            transparent: true,
            opacity: 0.82,
          }),
        ),
      );
      relationGroup.children.at(-1).computeLineDistances();
    }
    if (thermal && !flowing) {
      const direction = to.clone().sub(from),
        length = direction.length();
      if (length > 0.05)
        relationGroup.add(
          new T.ArrowHelper(
            direction.normalize(),
            from.clone().add(to).multiplyScalar(0.5),
            Math.min(length * 0.32, 0.7),
            circuitColor,
            0.22,
            0.14,
          ),
        );
    }
  });
  if (a.exploded) {
    plan.explode(true);
    relationGroup.visible = false;
  }
  const bounds = new T.Box3().setFromObject(model);
  const center = bounds.isEmpty()
    ? new T.Vector3()
    : bounds.getCenter(new T.Vector3());
  const radius = bounds.isEmpty()
    ? 3
    : Math.max(2, bounds.getBoundingSphere(new T.Sphere()).radius);
  const cameraDistance =
    (radius * 2.9 * (plan.camera?.dist || 1)) /
    Math.max(0.5, Number(a.camera?.zoom) || 1);
  const floorY = bounds.isEmpty() ? -1 : bounds.min.y - 0.02;
  const sc = key.shadow.camera;
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  sc.left = sc.bottom = -radius * 1.8;
  sc.right = sc.top = radius * 1.8;
  sc.near = 0.1;
  sc.far = radius * 10;
  sc.updateProjectionMatrix();
  key.position
    .copy(center)
    .add(new T.Vector3(radius * 1.3, radius * 2.4, radius * 1.6));
  key.target.position.copy(center);
  scene.add(key.target);
  if (a.preset !== "geothermal") {
    gridHelper = new T.GridHelper(
      radius * 5,
      40,
      dark ? 0x59657a : 0xaab3c5,
      dark ? 0x303949 : 0xd3d9e5,
    );
    gridHelper.position.y = floorY - 0.005;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.35;
    gridHelper.visible = false;
    scene.add(gridHelper);
    if (plan.recipe) bounds.isEmpty() || null;
    const floor = new T.Mesh(
      new T.PlaneGeometry(radius * 14, radius * 14),
      new T.ShadowMaterial({ opacity: 0.3 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.receiveShadow = true;
    scene.add(floor);
  }
  const asp0 = () =>
    (sh.stage.clientWidth || 560) / (sh.stage.clientHeight || 420);
  let currentView = VIEWS.some(([v]) => v === a.view) ? a.view : "free",
    home;
  const useView = (v) => {
    currentView = v;
    camera = makeCamera(
      T,
      v,
      asp0(),
      radius * (plan.camera?.dist || 1),
      center,
      plan.camera?.dir,
    );
    home = camera.position.clone();
  };
  useView(currentView);
  const resize = () => {
    const width = sh.stage.clientWidth || 560,
      height = sh.stage.clientHeight || 420,
      asp = width / height;
    renderer.setSize(width, height, false);
    if (camera.isOrthographicCamera) {
      camera.left = -camera.top * asp;
      camera.right = camera.top * asp;
    } else camera.aspect = asp;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(sh.stage);
  resize();
  let alive = true,
    visible = true,
    frame = 0,
    dragging = null;
  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting === true;
  });
  io.observe(sh.root);
  const canvas = renderer.domElement;
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (event) => {
    dragging = {
      x: event.clientX,
      y: event.clientY,
      rx: model.rotation.x,
      ry: model.rotation.y,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragging.x,
      dy = event.clientY - dragging.y;
    if (Math.hypot(dx, dy) > 4) dragging.moved = true;
    if (!dragging.moved) return;
    if (a.interaction?.rotate !== false) {
      model.rotation.y = dragging.ry + dx * 0.008;
      model.rotation.x = clamp(dragging.rx + dy * 0.008, -1.25, 1.25);
    }
  });
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2();
  const stopDrag = (event) => {
    const wasClick = dragging && !dragging.moved;
    dragging = null;
    if (!wasClick || a.interaction?.selectable === false) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster
      .intersectObjects(
        model.children.filter((child) => child !== relationGroup),
        true,
      )
      .find((item) => {
        let target = item.object;
        while (target && !target.userData.visualPart) target = target.parent;
        return target?.userData.visualPart;
      });
    if (!hit) return;
    if (measuring) {
      addMeasure(model.worldToLocal(hit.point.clone()));
      return;
    }
    let target = hit.object;
    while (target && !target.userData.visualPart) target = target.parent;
    const part = objects.find(
      (item) => item.id === target?.userData.visualPart,
    );
    if (!part) return;
    selectedPart = part.id;
    const related = (a.relationships || [])
      .filter((link) => link.from === part.id || link.to === part.id)
      .map((link) => {
        const other = objects.find(
          (item) => item.id === (link.from === part.id ? link.to : link.from),
        );
        return `${link.type || "Relation"}${other ? ` · ${other.label}` : ""}`;
      });
    const dims =
      part.dimensions && typeof part.dimensions === "object"
        ? Object.entries(part.dimensions)
            .map(([key, value]) => `${key} : ${value}`)
            .join(" · ")
        : "";
    sh.pop(
      event,
      part.label,
      [
        ["Composant", part.kind || "Équipement"],
        ...(part.detail ? [["Rôle", part.detail]] : []),
        ...(dims ? [["Dimensions illustratives", dims]] : []),
        ...(related.length
          ? [["Connexions", related.slice(0, 5).join("; ")]]
          : []),
      ],
      part.color || "#8d79ff",
    );
  };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", () => {
    dragging = null;
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (a.interaction?.zoom === false) return;
      if (!wheelOK(event, sh.root)) return;
      event.preventDefault();
      if (camera.isOrthographicCamera) {
        camera.zoom = clamp(
          camera.zoom * (event.deltaY < 0 ? 1.1 : 0.91),
          0.3,
          8,
        );
        camera.updateProjectionMatrix();
        return;
      }
      camera.position
        .sub(center)
        .multiplyScalar(event.deltaY < 0 ? 0.91 : 1.1)
        .add(center);
    },
    { passive: false },
  );

  const draw = () => {
    if (!alive) return;
    frame = requestAnimationFrame(draw);
    if (!visible || document.hidden) return;
    renderer.render(scene, camera);
    const width = renderer.domElement.clientWidth,
      height = renderer.domElement.clientHeight;
    const occupied = [];
    labels.forEach(({ label, point, major, id }, index) => {
      const projected = point
        .clone()
        .applyEuler(model.rotation)
        .add(model.position)
        .project(camera);
      const onScreen =
        projected.z < 1 &&
        Math.abs(projected.x) < 1.15 &&
        Math.abs(projected.y) < 1.15;
      label.hidden =
        !onScreen || hiddenIds.has(id) || !(major || selectedPart === id);
      if (onScreen) {
        const x = (projected.x * 0.5 + 0.5) * width,
          baseY = (-projected.y * 0.5 + 0.5) * height;
        let y = baseY - 26;
        while (
          occupied.some(
            ([ox, oy]) => Math.abs(ox - x) < 118 && Math.abs(oy - y) < 34,
          )
        )
          y -= 36;
        occupied.push([x, y]);
        label.style.transform = `translate(${x + ((index % 3) - 1) * 12}px,${y}px) translate(-50%,-100%)`;
      }
    });
  };
  draw();

  const matList = [];
  model.traverse((n) => {
    if (n.material)
      (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => {
        if (!matList.includes(m)) matList.push(m);
      });
  });
  const baseMat = new Map(
    matList.map((m) => [m, { o: m.opacity, t: m.transparent }]),
  );
  const isEnv = (n) => {
    for (let p = n; p; p = p.parent) if (p.userData?.env) return true;
    return false;
  };

  ((env = makeEnv(T, renderer, dark)), (repState = { overlays: [] }));
  const aoLights = [
    [1, 1, 1],
    [-1, 1, 1],
    [1, 1, -1],
    [-1, 1, -1],
  ].map(([x, y, z]) => {
    const l = new T.DirectionalLight(0xffffff, 0),
      s = l.shadow.camera;
    l.position
      .copy(center)
      .add(new T.Vector3(x, y * 1.6, z).multiplyScalar(radius * 2));
    l.target.position.copy(center);
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    s.left = s.bottom = -radius * 1.8;
    s.right = s.top = radius * 1.8;
    s.far = radius * 10;
    s.updateProjectionMatrix();
    l.visible = false;
    scene.add(l, l.target);
    return l;
  });
  const pick = (value, list, d) =>
      list.some(([v]) => v === value) ? value : d,
    look = {
      style: pick(a.renderStyle, STYLES, "realistic"),
      rep: pick(a.representation, REPS, "solid"),
      light: pick(a.lighting, LIGHTS, "studio"),
    };
  bg: () => scene.background?.getHex?.() ?? (dark ? 0x0b0c10 : 0xeef0f6);
  let xray = false,
    cutMode = 0,
    dims = null,
    hl = null,
    gridOn = false;
  const plane = new T.Plane(new T.Vector3(0, 0, -1), 0);
  const eachMat = (fn) =>
    model.traverse((n) => {
      if (n.material && !n.userData.noRestyle) fn(n.material);
    });
  const setXray = (on) => {
    xray = on;
    eachMat((m) => {
      if (m.userData.baseT === undefined) {
        m.userData.baseT = m.transparent;
        m.userData.baseO = m.opacity;
      }
      m.transparent = on ? true : m.userData.baseT;
      m.opacity = on ? Math.min(m.userData.baseO, 0.3) : m.userData.baseO;
      m.depthWrite = !on;
      m.needsUpdate = true;
    });
  };
  const applyCut = () =>
    eachMat((m) => {
      m.clippingPlanes = cutMode ? [plane] : [];
      m.needsUpdate = true;
    });
  const refreshLook = () => {
    const bg = applyStyle(T, model, look.style, dark);
    scene.background = bg == null ? null : new T.Color(bg);
    applyRep(T, model, look.rep, repState);
    applyLighting(T, lightCtx, look.light);
    applyCut();
    if (xray) setXray(true);
  };
  const setDims = (on) => {
    if (dims) {
      model.remove(dims.group);
      dims.items.forEach((it) => {
        it.label.remove();
        labels.splice(labels.indexOf(it), 1);
      });
      dims = null;
    }
    if (!on) return;
    const d = addDimensions(T, bounds, {
      scale: Number(a.unitScale) || 1,
      unit: a.unitScale ? a.unitLabel || "m" : "u",
    });
    model.add(d.group);
    dims = {
      group: d.group,
      items: d.labels.map((l, i) => {
        const el = dom("div", "ax-3d-label is-note is-dim", l.text);
        sh.stage.append(el);
        const it = { label: el, point: l.point, major: true, id: `dim-${i}` };
        labels.push(it);
        return it;
      }),
    };
  };
  const edgeLines = [];
  const setEdges = (on) => {
    if (on && !edgeLines.length)
      model.traverse((n) => {
        if (
          n.isMesh &&
          !n.isInstancedMesh &&
          !n.userData.noRestyle &&
          !n.userData.isOverlay &&
          n.geometry.attributes.position.count < 8000
        ) {
          const l = new T.LineSegments(
            new T.EdgesGeometry(n.geometry, 28),
            new T.LineBasicMaterial({
              color: dark ? 0xdfe6f3 : 0x1b2332,
              transparent: true,
              opacity: 0.5,
            }),
          );
          l.userData.noRestyle = l.userData.isOverlay = true;
          n.add(l);
          edgeLines.push(l);
        }
      });
    edgeLines.forEach((l) => (l.visible = on));
  };
  const hintBits = [
    plan.recipe
      ? `Modèle : ${plan.recipeLabel}`
      : objects.some((o) => o.shape || o.lib)
        ? "Modèle sur mesure (programme de formes)"
        : "Volumes déduits du sujet",
    ...(plan.notes || []),
    ...(plan.unmatched?.length && plan.recipe
      ? [`${plan.unmatched.length} élément(s) décrit(s) sans pièce dédiée`]
      : []),
    ...(a.simplifications || []).slice(0, 2),
  ];

  sh.hint(
    `${a.scaleNote ? `${a.scaleNote} · ` : ""}${hintBits.join(" · ")} · Glisser : tourner · molette : zoomer · clic : inspecter`,
  );
  const sel = (label, key, list, run) => ({
    type: "select",
    label,
    value: look[key],
    options: list,
    run,
  });
  let turn = false,
    measuring = false,
    mPts = [],
    mGroup = null,
    mLabels = [];
  const clearMeasure = () => {
    mPts = [];
    if (mGroup) {
      model.remove(mGroup);
      mGroup = null;
    }
    mLabels.forEach((it) => {
      it.label.remove();
      labels.splice(labels.indexOf(it), 1);
    });
    mLabels = [];
  };
  const addMeasure = (p) => {
    if (mPts.length >= 2) clearMeasure();
    mGroup = mGroup || new T.Group();
    mGroup.userData.noRestyle = true;
    if (!mGroup.parent) model.add(mGroup);
    const dot = new T.Mesh(
      new T.SphereGeometry(Math.max(0.02, radius * 0.012), 12, 8),
      new T.MeshBasicMaterial({ color: 0x59b6ff, depthTest: false }),
    );
    dot.position.copy(p);
    dot.renderOrder = 9;
    dot.userData.noRestyle = true;
    mGroup.add(dot);
    mPts.push(p.clone());
    if (mPts.length === 2) {
      const line = new T.Line(
        new T.BufferGeometry().setFromPoints(mPts),
        new T.LineBasicMaterial({ color: 0x59b6ff, depthTest: false }),
      );
      line.renderOrder = 9;
      line.userData.noRestyle = true;
      mGroup.add(line);
      const d = mPts[0].distanceTo(mPts[1]) * (Number(a.unitScale) || 1),
        el2 = dom(
          "div",
          "ax-3d-label is-note is-dim",
          `${d.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${a.unitScale ? a.unitLabel || "m" : "u"}`,
        );
      sh.stage.append(el2);
      const it = {
        label: el2,
        point: mPts[0].clone().add(mPts[1]).multiplyScalar(0.5),
        major: true,
        id: "measure",
      };
      labels.push(it);
      mLabels.push(it);
    }
  };
  sh.toolbar([
    {
      type: "select",
      label: "Vue",
      value: currentView,
      options: VIEWS,
      run: (v) => {
        useView(v);
        resize();
        model.rotation.set(0, 0, 0);
      },
    },
    sel("Style de rendu", "style", STYLES, (v) => {
      look.style = v;
      refreshLook();
      if (v === "blueprint") setDims(true);
    }),
    sel("Maillage", "rep", REPS, (v) => {
      look.rep = v;
      refreshLook();
    }),
    sel("Éclairage", "light", LIGHTS, (v) => {
      look.light = v;
      refreshLook();
    }),
    "|",
    {
      label: "Réinit.",
      title: "Réinitialiser la vue",
      run: () => {
        useView(currentView);
        resize();
        model.rotation.set(0, 0, 0);
      },
    },
    {
      label: a.exploded ? "Assemblée" : "Éclatée",
      title: "Vue éclatée",
      toggle: true,
      on: a.exploded,
      run: (on) => {
        plan.explode(on);
        relationGroup.visible = !on;
      },
    },
    {
      label: "Coupe",
      title: "Plan de coupe : longitudinal, transversal, aucun",
      run: (_, b) => {
        cutMode = (cutMode + 1) % 3;
        if (cutMode === 1) {
          plane.normal.set(0, 0, -1);
          plane.constant = center.z;
        } else if (cutMode === 2) {
          plane.normal.set(-1, 0, 0);
          plane.constant = center.x;
        }
        b.textContent = ["Coupe", "Coupe long.", "Coupe transv."][cutMode];
        b.classList.toggle("is-on", !!cutMode);
        applyCut();
      },
    },
    {
      label: "Transparent",
      title: "Mode radiographie",
      toggle: true,
      on: false,
      run: setXray,
    },
    {
      label: "Contours",
      title: "Traits de contour",
      toggle: true,
      on: false,
      run: setEdges,
    },
    {
      label: "Cotes",
      title: "Dimensions réelles de la maquette",
      toggle: true,
      on: false,
      run: setDims,
    },
    {
      label: "Grille",
      title: "Grille de mesure",
      toggle: true,
      on: false,
      run: (on) => {
        gridOn = on;
        if (gridHelper) gridHelper.visible = on;
      },
    },
  ]);
  if (ctx.full) {
    sh.root.classList.add("has-tree");
    const tree = dom("aside", "ax-tree"),
      search = dom("input", "ax-tree-search"),
      list = dom("div", "ax-tree-list"),
      rows = [],
      gmap = new Map((plan.groups || []).map((g2) => [g2.id, g2.label])),
      byGroup = new Map();
    search.placeholder = "Filtrer les pièces…";
    tree.append(
      dom("div", "ax-tree-head", `Scène · ${plan.entries.length} pièces`),
      search,
      list,
    );
    plan.entries.forEach((en) => {
      const k = en.group || en.part.group || "";
      (byGroup.get(k) || byGroup.set(k, []).get(k)).push(en);
    });
    const choose = (en) => {
      selectedPart = en.part.id;
      if (hl) model.remove(hl);
      hl = new T.BoxHelper(en.object, 0x59b6ff);
      hl.userData.noRestyle = true;
      model.add(hl);
      sh.pop(
        [280, 90],
        en.part.label,
        [
          ["Composant", en.part.kind || en.group || "Pièce"],
          ...(en.part.detail ? [["Rôle", en.part.detail]] : []),
        ],
        "#8d79ff",
      );
    };
    byGroup.forEach((ens, k) => {
      if (k || byGroup.size > 1)
        list.append(dom("div", "ax-tree-group", gmap.get(k) || k || "Pièces"));
      ens.forEach((en) => {
        const row = dom("div", "ax-tree-row"),
          eye = dom("button", "ax-tree-eye", "◉"),
          nm = dom("button", "ax-tree-name", en.part.label);
        eye.type = nm.type = "button";
        row.dataset.q = en.part.label.toLowerCase();
        eye.addEventListener("click", () => {
          const on = !en.object.visible;
          en.object.visible = on;
          eye.classList.toggle("is-off", !on);
          on ? hiddenIds.delete(en.part.id) : hiddenIds.add(en.part.id);
        });
        nm.addEventListener("click", () => choose(en));
        row.append(eye, nm);
        list.append(row);
        rows.push(row);
      });
    });
    search.addEventListener("input", () =>
      rows.forEach(
        (r) => (r.hidden = !r.dataset.q.includes(search.value.toLowerCase())),
      ),
    );
    sh.root.prepend(tree);
  }
  refreshLook();

  sh.root.__capture = () => {
    renderer.render(scene, camera);
    return canvas.toDataURL("image/png");
  };

  track(sh.root, () => {
    alive = false;
    cancelAnimationFrame(frame);
    observer.disconnect();
    io.disconnect();
    renderer.dispose();
    scene.traverse((node) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material))
        node.material.forEach((item) => item.dispose());
      else node.material?.dispose?.();
    });
  });
}
let elkModulePromise, d3ForceModulePromise;
const loadELK = () =>
  (elkModulePromise ||= import("https://cdn.jsdelivr.net/npm/elkjs@0.10.0/+esm")
    .then((module) => module.default || module)
    .catch(() => null));
const loadD3Force = () =>
  (d3ForceModulePromise ||=
    import("https://cdn.jsdelivr.net/npm/d3-force@3.0.0/+esm").catch(
      () => null,
    ));

/* ═══ 9. SCÈNE 3D — géométrie exclusivement issue du document validé ═══ */
async function mountScene3D(a, host, ctx) {
  const T = await loadThree(),
    sh = makeShell("scene3d", ctx);
  host.append(sh.root);
  if (a.preset === "assembly" || a.preset === "geothermal")
    return mountAssembly3D(a, host, ctx, T, sh);
  sh.stage.append(
    dom(
      "div",
      "ax-render-fallback",
      "Cette représentation ne contient pas de géométrie sémantique exploitable.",
    ),
  );
}
/* ═══ 11. DOCUMENT STRUCTURÉ : sommaire, sections éditables, figures intégrées, exports ═══ */
function docFromMarkdown(a) {
  const secs = [];
  let cur = null,
    fence = false,
    buf = [];
  const flush = () => {
    const t = buf.join("\n").trim();
    buf = [];
    if (!t) return;
    if (!cur) {
      cur = { title: "Introduction", level: 2, blocks: [] };
      secs.push(cur);
    }
    cur.blocks.push({ type: "text", md: t });
  };
  for (const line of String(a.body).split(/\r?\n/)) {
    if (/^```/.test(line.trim())) fence = !fence;
    const h = !fence && /^(#{1,3})\s+(.+?)\s*#*$/.exec(line);
    if (h) {
      flush();
      cur = { title: h[2], level: h[1].length >= 3 ? 3 : 2, blocks: [] };
      secs.push(cur);
    } else buf.push(line);
  }
  flush();
  return {
    type: "doc",
    title: a.title,
    summary: a.summary,
    sections: secs.map((s, i) => ({ id: `s${i}`, ...s })),
  };
}
function normBlock(b) {
  if (typeof b === "string") return { type: "text", md: b };
  if (!b || typeof b !== "object") return null;
  const t = b.type;
  if (t === "list")
    return {
      type: t,
      ordered: !!b.ordered,
      items: (b.items || []).map(String).slice(0, 30),
    };
  if (t === "callout")
    return {
      type: t,
      tone: ["info", "warn", "success"].includes(b.tone) ? b.tone : "info",
      title: b.title ? String(b.title) : "",
      md: String(b.md ?? b.text ?? ""),
    };
  if (t === "quote")
    return {
      type: t,
      md: String(b.md ?? b.text ?? ""),
      cite: b.cite ? String(b.cite) : "",
    };
  if (t === "table")
    return {
      type: t,
      title: b.title || "",
      columns: (b.columns || []).map(String).slice(0, 10),
      rows: (b.rows || [])
        .slice(0, 60)
        .map((r) => (Array.isArray(r) ? r : []).map((c) => String(c ?? ""))),
    };
  if (t === "formula")
    return {
      type: t,
      tex: String(b.tex ?? b.formula ?? ""),
      label: b.label ? String(b.label) : "",
    };
  if (t === "code")
    return { type: t, lang: String(b.lang || ""), code: String(b.code ?? "") };
  if (
    t === "artifact" &&
    b.artifact &&
    typeof b.artifact === "object" &&
    b.artifact.type !== "doc"
  ) {
    const ar = b.artifact;
    if (ar.type === "table" && Array.isArray(ar.columns))
      return normBlock({
        type: "table",
        title: ar.title,
        columns: ar.columns,
        rows: ar.rows,
      });
    return {
      type: t,
      artifact: ar,
      caption: b.caption ? String(b.caption) : "",
    };
  }
  if (t === "kpi")
    return {
      type: t,
      items: (b.items || []).slice(0, 6).map((i) => ({
        label: String(i?.label ?? ""),
        value: String(i?.value ?? ""),
        unit: String(i?.unit ?? ""),
        note: String(i?.note ?? ""),
      })),
    };
  if (t === "steps")
    return { type: t, items: (b.items || []).map(String).slice(0, 20) };
  return t === "text" || b.md != null
    ? { type: "text", md: String(b.md ?? b.text ?? "") }
    : null;
}
function normalizeDoc(o) {
  const ids = new Set();
  o.sections = (o.sections || [])
    .filter((s) => s && typeof s === "object")
    .slice(0, 30)
    .map((s, i) => {
      let id = String(s.id || `s${i + 1}`);
      while (ids.has(id)) id += "_";
      ids.add(id);
      return {
        id,
        title: String(s.title || `Section ${i + 1}`).slice(0, 140),
        level: s.level === 3 ? 3 : 2,
        blocks: (s.blocks || []).slice(0, 40).map(normBlock).filter(Boolean),
      };
    });
  if (!o.sections.length)
    o.sections = [
      { id: "s1", title: o.title || "Document", level: 2, blocks: [] },
    ];
}
function docToMarkdown(a) {
  const out = [`# ${a.title || "Document"}`];
  if (a.summary) out.push(`_${a.summary}_`);
  for (const s of a.sections) {
    out.push(`${s.level === 3 ? "###" : "##"} ${s.title}`);
    for (const b of s.blocks)
      switch (b.type) {
        case "text":
          out.push(b.md);
          break;
        case "list":
          out.push(
            b.items
              .map((t, i) => `${b.ordered ? `${i + 1}.` : "-"} ${t}`)
              .join("\n"),
          );
          break;
        case "callout":
          out.push(`> **${b.title || "Note"}** — ${b.md}`);
          break;
        case "quote":
          out.push(`> ${b.md}${b.cite ? `\n> — ${b.cite}` : ""}`);
          break;
        case "formula":
          out.push(`$$\n${b.tex}\n$$`);
          break;
        case "code":
          out.push("```" + (b.lang || "") + "\n" + b.code + "\n```");
          break;
        case "table":
          out.push(
            [
              `| ${b.columns.join(" | ")} |`,
              `| ${b.columns.map(() => "---").join(" | ")} |`,
              ...b.rows.map(
                (r) =>
                  `| ${b.columns.map((_, i) => String(r[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`,
              ),
            ].join("\n"),
          );
          break;
        case "artifact":
          out.push(`> Figure : ${b.artifact?.title || b.artifact?.type}`);
          break;
      }
  }
  return out.join("\n\n");
}
const PRINT_CSS =
  "body{font:14px/1.6 Inter,system-ui,sans-serif;color:#111;max-width:820px;margin:32px auto;padding:0 24px}h1{font-size:26px}h3{font-size:19px;margin:28px 0 8px}h4{font-size:15px;margin:20px 0 6px}table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid #ccc;padding:6px 9px;text-align:left}th{background:#f2f3f5}pre{background:#f5f5f7;padding:10px;overflow:auto;font-size:12px}blockquote{border-left:3px solid #ccc;margin:12px 0;padding:2px 12px;color:#444}.ax-block{margin:12px 0;break-inside:avoid}.ax-stage{border:0!important;height:auto!important;overflow:visible!important}svg,img{max-width:100%;height:auto}";
async function printDoc(body, a, mountAll) {
  const w = window.open("", "_blank");
  if (!w) return;
  await mountAll();
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
  const clone = body.cloneNode(true),
    srcS = [...body.querySelectorAll("svg")],
    dstS = [...clone.querySelectorAll("svg")];
  srcS.forEach((s, i) => {
    if (!s.classList.contains("ax-svg") || !dstS[i]) return;
    try {
      dstS[i].outerHTML = svgMarkup(s, svgBox(s)).xml;
    } catch {}
  });
  const srcC = [...body.querySelectorAll("canvas")],
    dstC = [...clone.querySelectorAll("canvas")];
  srcC.forEach((c, i) => {
    const url = c.closest(".ax-scene3d")?.__capture?.();
    if (!url || !dstC[i]) return;
    const img = new Image();
    img.src = url;
    dstC[i].replaceWith(img);
  });
  clone
    .querySelectorAll(
      ".ax-toolbar,.ax-hint,.ax-edit-btn,.ax-tip,.ax-pop,.ax-menu,.ax-loading,.ax-3d-labels",
    )
    .forEach((n) => n.remove());
  const esc = (t) =>
    String(t).replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
    );
  w.document.write(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${esc(a.title || "Document")}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><style>${PRINT_CSS}</style><body><h1>${esc(a.title || "Document")}</h1>${clone.innerHTML}<script>onload=()=>setTimeout(()=>print(),400)<\/script></body></html>`,
  );
  w.document.close();
}
async function mountDoc(a, host, ctx) {
  const root = dom(
    "section",
    `ax ax-doc${ctx.inline ? " is-inline" : ""}${ctx.full ? " is-full" : ""}${ctx.panel ? " is-panel" : ""}${a.sections.length < 2 ? " no-toc" : ""}`,
  );
  const md = (el, src) =>
    ctx.renderMarkdown
      ? ctx.renderMarkdown(el, src)
      : String(src)
          .split(/\n{2,}/)
          .forEach((p) => el.append(dom("p", null, p)));
  root.dataset.kind = a.kind || "report";
  const head = dom("header", "ax-doc-head"),
    titleBox = dom("div");
  if (ctx.panel) {
    if (a.summary) {
      titleBox.append(dom("p", "ax-doc-lead", a.summary));
    }
    if (a.meta) {
      const m = dom("div", "ax-doc-meta");
      Object.entries(a.meta).forEach(([k, v]) => {
        m.append(dom("span", null, `${k} · ${v}`));
      });
      titleBox.append(m);
    }
  } else if (!ctx.inline || ctx.full) {
    const KIND = {
      // Ton code d'origine continue ici

      report: "Rapport",
      design_file: "Dossier de conception",
      datasheet: "Fiche technique",
      protocol: "Protocole",
      spec: "Spécifications",
      architecture: "Dossier d'architecture",
      manual: "Notice",
      validation: "Validation & tests",
      analysis: "Analyse",
      brief: "Synthèse",
      guide: "Guide",
      lesson: "Cours",
    };
    if (a.kind)
      titleBox.append(dom("span", "ax-doc-kind", KIND[a.kind] || a.kind));
    titleBox.append(dom("h2", null, a.title || "Document"));
    if (a.summary) {
      const lead = dom("p", "ax-doc-lead", a.summary);
      lead.title = "Cliquer pour lire la suite";
      lead.addEventListener("click", () => lead.classList.toggle("is-open"));
      titleBox.append(lead);
    }
    if (a.meta) {
      const m = dom("div", "ax-doc-meta");
      Object.entries(a.meta).forEach(([k, v]) =>
        m.append(dom("span", null, `${k} · ${v}`)),
      );
      titleBox.append(m);
    }
  }
  const actions = dom("div", "ax-doc-actions");
  const act = (label, title, fn) => {
    const b = dom("button", "ax-btn", label);
    b.type = "button";
    b.title = title;
    b.onclick = fn;
    actions.append(b);
  };
  const layout = dom("div", "ax-doc-layout"),
    toc = dom("nav", "ax-doc-toc"),
    body = dom("article", "ax-doc-body");
  const pending = [],
    io = new IntersectionObserver(
      (en) =>
        en.forEach((x) => {
          if (x.isIntersecting) {
            io.unobserve(x.target);
            x.target.__mount?.();
          }
        }),
      { rootMargin: "300px" },
    );
  const mountAll = async () => {
    for (const w of pending.splice(0)) {
      io.unobserve(w);
      await w.__mount?.();
    }
  };
  act("Markdown", "Télécharger en Markdown", () =>
    saveBlob(
      fileName(a.title, "md"),
      new Blob([docToMarkdown(a)], { type: "text/markdown;charset=utf-8" }),
    ),
  );
  act("Imprimer / PDF", "Ouvrir la version imprimable", () =>
    printDoc(body, a, mountAll),
  );
  if (ctx.onExpand && !ctx.full) act("⤢", "Ouvrir en grand", ctx.onExpand);
  head.append(titleBox, actions);
  toc.setAttribute("aria-label", "Sommaire");
  toc.append(dom("span", "ax-doc-toc-title", "Sommaire"));
  layout.append(toc, body);
  root.append(head, layout);
  host.append(root);

  const changed = () => ctx.onChange?.(a),
    secs = [],
    links = new Map();
  const renderBlock = (b, s) => {
    const wrap = dom("div", `ax-block ax-b-${b.type}`);
    const fill = () => {
      wrap.replaceChildren();
      switch (b.type) {
        case "text": {
          const view = dom("div", "ax-b-md");
          md(view, b.md);
          wrap.append(view);
          const ed = dom("button", "ax-edit-btn", "Modifier");
          ed.type = "button";
          ed.onclick = () => {
            const ta = dom("textarea", "ax-b-editor");
            ta.value = b.md;
            const row = dom("div", "ax-b-editrow"),
              ok = dom("button", "ax-btn", "Enregistrer"),
              no = dom("button", "ax-btn", "Annuler");
            ok.type = no.type = "button";
            ok.onclick = () => {
              b.md = ta.value;
              fill();
              changed();
            };
            no.onclick = fill;
            row.append(ok, no);
            wrap.replaceChildren(ta, row);
            ta.style.height = `${Math.min(420, Math.max(120, ta.scrollHeight))}px`;
            ta.focus();
          };
          wrap.append(ed);
          break;
        }
        case "list": {
          const v = dom("div", "ax-b-md");
          md(
            v,
            b.items
              .map((t, i) => `${b.ordered ? `${i + 1}.` : "-"} ${t}`)
              .join("\n"),
          );
          wrap.append(v);
          break;
        }
        case "callout": {
          wrap.classList.add(`is-${b.tone}`);
          if (b.title) wrap.append(dom("strong", null, b.title));
          const v = dom("div", "ax-b-md");
          md(v, b.md);
          wrap.append(v);
          break;
        }
        case "quote": {
          const v = dom("blockquote", "ax-b-md");
          md(v, b.md);
          if (b.cite) v.append(dom("cite", null, `— ${b.cite}`));
          wrap.append(v);
          break;
        }
        case "formula": {
          wrap.append(
            ctx.renderMath
              ? ctx.renderMath(b.tex, true)
              : dom("pre", null, b.tex),
          );
          if (b.label) wrap.append(dom("small", null, b.label));
          break;
        }
        case "code": {
          const pre = dom("pre"),
            code = dom("code", null, b.code);
          pre.append(code);
          const cp = dom("button", "ax-edit-btn", "Copier");
          cp.type = "button";
          cp.onclick = () => navigator.clipboard.writeText(b.code);
          wrap.append(pre, cp);
          break;
        }
        case "table": {
          if (b.title) wrap.append(dom("strong", null, b.title));
          const tw = dom("div", "ax-b-tablewrap"),
            t = dom("table"),
            hr = dom("tr");
          b.columns.forEach((c) => hr.append(dom("th", null, c)));
          const thead = dom("thead");
          thead.append(hr);
          t.append(thead);
          const tb = dom("tbody");
          b.rows.forEach((r) => {
            const tr = dom("tr");
            b.columns.forEach((_, i) => tr.append(dom("td", null, r[i] ?? "")));
            tb.append(tr);
          });
          t.append(tb);
          tw.append(t);
          wrap.append(tw);
          const csv = dom("button", "ax-edit-btn", "CSV");
          csv.type = "button";
          csv.onclick = () =>
            ctx.downloadCsv?.({
              title: b.title || s.title,
              columns: b.columns,
              rows: b.rows,
            });
          wrap.append(csv);
          break;
        }
        case "kpi": {
          const row = dom("div", "ax-kpis");
          b.items.forEach((i) => {
            const c = dom("div", "ax-kpi");
            c.append(
              dom("small", null, i.label),
              dom("strong", null, `${i.value}${i.unit ? ` ${i.unit}` : ""}`),
            );
            if (i.note) c.append(dom("span", null, i.note));
            row.append(c);
          });
          wrap.append(row);
          break;
        }
        case "steps": {
          const ol = dom("ol", "ax-steps");
          b.items.forEach((t) => {
            const li = dom("li");
            md(li, t);
            ol.append(li);
          });
          wrap.append(ol);
          break;
        }
        case "artifact": {
          const slot = dom("div", "ax-doc-art");
          wrap.append(slot);
          if (b.caption) wrap.append(dom("small", "ax-b-caption", b.caption));
          wrap.__mount = () => {
            wrap.__mount = null;
            return mountArtifact(b.artifact, slot, {
              ...ctx,
              inline: true,
              nested: true,
              subject:
                ctx.subject ||
                [a.subject, a.title, a.summary].filter(Boolean).join(" "),
              panel: false,
              full: false,
              onExpand: ctx.openArtifact
                ? () => ctx.openArtifact(b.artifact)
                : null,
            });
          };
          pending.push(wrap);
          io.observe(wrap);
          break;
        }
      }
    };
    fill();
    return wrap;
  };
  const scroller = () =>
    ctx.panel ? root.closest(".artifact-content") || body : body;
  const stripH = () =>
    ctx.panel && toc.offsetWidth > 400 ? toc.offsetHeight : 0;
  const goTo = (sec) => {
    const sc = scroller();
    sc.scrollTo({
      top: Math.max(
        0,
        sec.getBoundingClientRect().top -
          sc.getBoundingClientRect().top +
          sc.scrollTop -
          stripH() -
          8,
      ),
      behavior: "smooth",
    });
  };
  a.sections.forEach((s) => {
    const sec = dom("section", "ax-sec"),
      h = dom(s.level === 3 ? "h4" : "h3", "ax-sec-title", s.title);
    sec.append(h);
    const chev = dom("button", "ax-sec-chev", "▾");
    chev.type = "button";
    chev.title = "Replier / déplier";
    chev.addEventListener("click", (e) => {
      e.stopPropagation();
      sec.classList.toggle("is-collapsed");
      chev.classList.toggle("is-shut");
    });
    sec.prepend(chev);
    h.title = "Double-clic pour renommer";
    h.ondblclick = () => {
      const inp = dom("input", "ax-edit");
      inp.style.position = "static";
      inp.style.width = "100%";
      inp.value = s.title;
      h.replaceWith(inp);
      inp.focus();
      inp.select();
      let done = false;
      const commit = (ok) => {
        if (done) return;
        done = true;
        if (ok && inp.value.trim()) {
          s.title = inp.value.trim().slice(0, 140);
          h.textContent = s.title;
          links.get(s.id).textContent = s.title;
          changed();
        }
        inp.replaceWith(h);
      };
      inp.onkeydown = (e) => {
        if (e.key === "Enter") commit(true);
        if (e.key === "Escape") commit(false);
      };
      inp.onblur = () => commit(true);
    };
    s.blocks.forEach((b) => sec.append(renderBlock(b, s)));
    body.append(sec);
    secs.push({ id: s.id, el: sec });
    const link = dom(
      "button",
      `ax-toc-link${s.level === 3 ? " is-sub" : ""}`,
      s.title,
    );
    link.type = "button";
    link.onclick = () => goTo(sec);
    toc.append(link);
    links.set(s.id, link);
  });
  let tick = false;
  let setCur = () => {},
    setProg = () => {};
  const spy = () => {
    const sc = scroller(),
      base = sc.getBoundingClientRect().top + stripH() + 56;
    let at = 0;
    secs.forEach((s, i) => {
      if (s.el.getBoundingClientRect().top <= base) at = i;
    });
    links.forEach((l) => l.classList.remove("is-on"));
    links.get(secs[at].id)?.classList.add("is-on");
    setCur(at);
    setProg(sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight));
  };
  const onScroll = () => {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => {
      tick = false;
      spy();
    });
  };
  requestAnimationFrame(() => {
    scroller().addEventListener("scroll", onScroll, { passive: true });
    spy();
  });
  track(root, () => scroller().removeEventListener("scroll", onScroll));
  if (ctx.panel) {
    const bar = dom("div", "ax-docbar"),
      btn = dom("button", "ax-docbar-menu"),
      cur = dom("span", "ax-docbar-cur"),
      prev = dom("button", "ax-docbar-nav", "‹"),
      next = dom("button", "ax-docbar-nav", "›"),
      prog = dom("i", "ax-docbar-prog"),
      menu = dom("div", "ax-docmenu"),
      all = dom("button", "ax-docmenu-all", "Tout replier");
    [btn, prev, next, all].forEach((b) => (b.type = "button"));
    prev.title = "Section précédente ( [ )";
    next.title = "Section suivante ( ] )";
    menu.hidden = true;
    btn.append(
      dom("span", "ax-docbar-ico", "≡"),
      dom("b", null, "Sommaire"),
      cur,
    );
    all.addEventListener("click", () => {
      const shut = all.textContent === "Tout replier";
      secs.forEach((s) => {
        s.el.classList.toggle("is-collapsed", shut);
        s.el.querySelector(".ax-sec-chev")?.classList.toggle("is-shut", shut);
      });
      all.textContent = shut ? "Tout déplier" : "Tout replier";
    });
    menu.append(all);
    a.sections.forEach((s, i) => {
      const b = dom(
        "button",
        `ax-docmenu-item${s.level === 3 ? " is-sub" : ""}`,
      );
      b.type = "button";
      b.append(
        dom("span", "ax-docmenu-n", String(i + 1).padStart(2, "0")),
        dom("span", null, s.title),
      );
      b.addEventListener("click", () => {
        menu.hidden = true;
        secs[i].el.classList.remove("is-collapsed");
        goTo(secs[i].el);
      });
      menu.append(b);
    });
    let idx = 0;
    setCur = (i) => {
      idx = i;
      cur.textContent = a.sections[i]?.title || "";
      prev.disabled = i === 0;
      next.disabled = i === secs.length - 1;
      [...menu.querySelectorAll(".ax-docmenu-item")].forEach((b, k) =>
        b.classList.toggle("is-on", k === i),
      );
    };
    setProg = (p) =>
      (prog.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    prev.addEventListener("click", () => goTo(secs[Math.max(0, idx - 1)].el));
    next.addEventListener("click", () =>
      goTo(secs[Math.min(secs.length - 1, idx + 1)].el),
    );
    const off = (e) => {
      if (!bar.contains(e.target)) menu.hidden = true;
    };
    document.addEventListener("pointerdown", off, true);
    track(root, () => document.removeEventListener("pointerdown", off, true));
    root.tabIndex = -1;
    root.addEventListener("keydown", (e) => {
      if (e.key === "]") next.click();
      if (e.key === "[") prev.click();
      if (e.key === "Escape") menu.hidden = true;
    });
    bar.append(btn, prev, next, menu, prog);
    root.insertBefore(bar, layout);
    setCur(0);
  }
  track(root, () => io.disconnect());
}

/* ═══ 10. POINT D'ENTRÉE ═══ */
// APRÈS
const MOUNT = {
  code: mountCodeView,
  plot: mountPlot,
  diagram: mountDiagram,
  map: mountGeographicMap,
  timeline: mountTimeline,
  probtree: mountProbTree,
  scene3d: mountScene3D,
  sheet: mountSheet,
  doc: mountDoc,
};

export async function mountArtifact(artifact, host, ctx = {}) {
  const firstChild = host.childNodes.length;
  let loading = null;
  try {
    if (artifact?.variant && ctx.renderLegacy) {
      ctx.renderLegacy(artifact, host);
      return true;
    }
    const a = normalizeArtifact(adaptLegacy(artifact) || artifact);
    if (a && !MOUNT[a.type] && ctx.renderLegacy) {
      ctx.renderLegacy(a, host);
      return true;
    }
    if (!a || !MOUNT[a.type]) return false;
    loading = dom("div", "ax-loading", "Préparation de la figure…");
    host.append(loading);
    await MOUNT[a.type](a, host, ctx);
    loading.remove();
    const root = [...host.children]
      .reverse()
      .find((n) => n.classList?.contains("ax"));
    if (root) {
      if (ctx.visualStyle) root.dataset.visualStyle = ctx.visualStyle;
      if (a.type !== "doc" && a.type !== "code")
        attachMenu(root, figureMenu(a, root, ctx), {
          context: a.type !== "scene3d",
        }); // 3D : clic droit = déplacer la caméra
    }
    return true;
  } catch (error) {
    if (visualDebugEnabled()) console.error("[AiGENT artefact]", error);
    [...host.childNodes].slice(firstChild).forEach((node) => node.remove());
    const fallback = dom("div", "ax-render-fallback");
    fallback.setAttribute("role", "status");
    fallback.append(
      dom("strong", null, "Cette représentation n’a pas pu être affichée."),
      dom(
        "p",
        null,
        "Les informations de la réponse restent disponibles. Vous pouvez réessayer ou demander une autre vue.",
      ),
    );
    const retry = dom("button", "ax-btn", "Réessayer le rendu");
    retry.type = "button";
    retry.addEventListener("click", () => {
      fallback.remove();
      mountArtifact(artifact, host, ctx);
    });
    fallback.append(retry);
    host.append(fallback);
    return false;
  }
}

export const exportFigure = { svgMarkup, svgBox, svgToPng };
