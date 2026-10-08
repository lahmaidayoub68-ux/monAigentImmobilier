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
  if (o.type === "diagram") {
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
    o.params = {
      mass: num(o.params?.mass, 1),
      curvature: num(o.params?.curvature, 1),
      extent: num(o.params?.extent, 12),
      lines: num(o.params?.lines, 26),
      ...(o.params || {}),
    };
  } else if (o.type === "sheet") {
    // APRÈS
    o.columns = (o.columns || []).slice(0, 20);
    o.rows = (o.rows || []).slice(0, 300);
  } else if (o.type === "doc") {
    normalizeDoc(o);
  }
  if (warn.length) console.warn("[AiGENT artefact]", warn.join("; "));
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
  "plot",
  "diagram",
  "timeline",
  "probtree",
  "scene3d",
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
        0.8,
        1.15,
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
      k = clamp(Math.min((cw - 60) / b.w, (ch - 60) / b.h), 0.25, 1.5);
    pz.set(k, (cw - b.w * k) / 2 - b.x * k, (ch - b.h * k) / 2 - b.y * k);
  };
  const ro = new ResizeObserver(() => {
    const [w, h] = size();
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
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
      yt = nice(v.y0, v.y1, PH / 62);
    if (show.grid) {
      xt.ticks.forEach((t) =>
        svgn(
          "path",
          { d: `M${sx(t)} ${MT}V${MT + PH}`, class: "ax-grid" },
          gGrid,
        ),
      );
      yt.ticks.forEach((t) =>
        svgn(
          "path",
          { d: `M${ML} ${sy(t)}H${ML + PW}`, class: "ax-grid" },
          gGrid,
        ),
      );
    }
    svgn(
      "rect",
      { x: ML, y: MT, width: PW, height: PH, class: "ax-frame" },
      gAxes,
    );
    xt.ticks.forEach(
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
    yt.ticks.forEach(
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
    const ox = sx(0),
      oy = sy(0),
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
        yt.ticks.forEach(
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
        xt.ticks.forEach(
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
      label: "Grille",
      toggle: true,
      on: show.grid,
      run: (on) => {
        show.grid = on;
        draw();
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
function drawShape(g, n) {
  const w = n.w,
    h = n.h,
    hw = w / 2,
    hh = h / 2,
    add = (t, at) => svgn(t, { class: "ax-shape", ...at }, g);
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
async function mountDiagram(a, host, ctx) {
  const sh = makeShell("diagram", ctx);
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
  const layout = () => {
    if (mode === "force") {
      const pos = forceLayout(nodes, a.edges);
      ways = new Map();
      nodes.forEach((n) => {
        const p = pos.get(n.id),
          m = manual.get(n.id);
        n.x = m ? m.x : p.x;
        n.y = m ? m.y : p.y;
      });
      return;
    }
    const r = layeredLayout(nodes, a.edges, dir);
    ways = r.ways;
    nodes.forEach((n) => {
      const p = r.pos.get(n.id),
        m = manual.get(n.id);
      n.x = m ? m.x : p.x;
      n.y = m ? m.y : p.y;
    });
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
    a.edges.forEach((e, k) => {
      const rel = REL[e.relation] || REL.leads_to,
        eg = svgn("g", { class: "ax-edge" }, gE),
        path = svgn(
          "path",
          {
            class: "ax-edgepath",
            "stroke-dasharray": rel.dash || null,
            "stroke-width": rel.w || 1.6,
          },
          eg,
        );
      if (rel.end !== false) path.setAttribute("marker-end", `url(#${id}-arr)`);
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
      ng.style.setProperty("--k", n.color || KINDS[n.kind].c);
      drawShape(ng, n);
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
  const vp = viewport(sh, svg, g, bbox, ctx);
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
    table.append(dom("thead")).append(head);
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

/* ═══ 9. SCÈNE 3D — COURBURE DE L'ESPACE-TEMPS ═══ */
async function mountScene3D(a, host, ctx) {
  const T = await loadThree(),
    sh = makeShell("scene3d", ctx);
  host.append(sh.root);
  const P = a.params,
    E = clamp(P.extent, 6, 30),
    N = clamp(Math.round(P.lines), 8, 60),
    M = clamp(P.mass, 0.2, 4),
    Dp = 3.4 * clamp(P.curvature, 0.2, 3) * M,
    SOFT = 1.15,
    dark = document.documentElement.dataset.theme !== "light";
  const hAt = (x, z) =>
      -Dp *
      (1 / Math.sqrt(x * x + z * z + SOFT * SOFT) -
        1 / Math.sqrt(E * E + SOFT * SOFT)),
    maxDepth = Math.abs(hAt(0, 0));
  const VIOLET = new T.Color(0x8d79ff),
    BASE = new T.Color(dark ? 0x8a93ab : 0x56607a),
    AMBER = 0xf0b429;
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  sh.stage.append(renderer.domElement);
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(42, 1, 0.1, 500);
  const gSpace = new T.Group(),
    gAxes = new T.Group(),
    gObj = new T.Group(),
    gPath = new T.Group();
  scene.add(gSpace, gAxes, gObj, gPath);
  const tint = (t) => BASE.clone().lerp(VIOLET, Math.pow(clamp(t, 0, 1), 0.65));
  // Layer 1 — espace : surface + grille réellement déformées
  const S = 96,
    seg = [],
    col = [];
  const pushLine = (fn) => {
    for (let s = 0; s < S; s++)
      for (const k of [s, s + 1]) {
        const [x, z] = fn(k / S),
          y = hAt(x, z),
          c = tint(-y / maxDepth);
        seg.push(x, y, z);
        col.push(c.r, c.g, c.b);
      }
  };
  for (let i = 0; i <= N; i++) {
    const c = -E + (2 * E * i) / N;
    pushLine((t) => [c, -E + 2 * E * t]);
    pushLine((t) => [-E + 2 * E * t, c]);
  }
  const lg = new T.BufferGeometry();
  lg.setAttribute("position", new T.Float32BufferAttribute(seg, 3));
  lg.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  gSpace.add(
    new T.LineSegments(
      lg,
      new T.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
      }),
    ),
  );
  const pg = new T.PlaneGeometry(2 * E, 2 * E, 80, 80);
  pg.rotateX(-Math.PI / 2);
  const pp = pg.attributes.position,
    pc = [];
  for (let i = 0; i < pp.count; i++) {
    const y = hAt(pp.getX(i), pp.getZ(i));
    pp.setY(i, y - 0.02);
    const c = tint(-y / maxDepth);
    pc.push(c.r, c.g, c.b);
  }
  pg.setAttribute("color", new T.Float32BufferAttribute(pc, 3));
  pg.computeVertexNormals();
  gSpace.add(
    new T.Mesh(
      pg,
      new T.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.26,
        side: T.DoubleSide,
        roughness: 0.9,
        metalness: 0,
      }),
    ),
  );
  // Layer 2 — axes
  const labels = [],
    lab = (text, get, layer, cls = "") => {
      const el = dom("div", `ax-3d-label ${cls}`, text);
      labels.push({ el, get, layer });
      return el;
    };
  const axis = (from, to, name, color) => {
    const f = new T.Vector3(...from),
      t = new T.Vector3(...to),
      d = t.clone().sub(f).normalize();
    gAxes.add(
      new T.Line(
        new T.BufferGeometry().setFromPoints([f, t]),
        new T.LineBasicMaterial({ color }),
      ),
    );
    const cone = new T.Mesh(
      new T.ConeGeometry(0.16, 0.5, 14),
      new T.MeshBasicMaterial({ color }),
    );
    cone.position.copy(t);
    cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d);
    gAxes.add(cone);
    lab(
      name,
      () => t.clone().add(d.clone().multiplyScalar(1.1)),
      "axes",
      "is-axis",
    );
  };
  const axC = dark ? 0xaab1c5 : 0x4b5468;
  axis([-E, 0, E], [E, 0, E], "x · espace", axC);
  axis([-E, 0, E], [-E, 0, -E], "y · espace", axC);
  axis(
    [-E, 0, E],
    [-E, -Math.max(4, maxDepth + 1.6), E],
    "Potentiel / temps ralenti",
    axC,
  );
  // Layer 3 — objets
  const rm = 0.55 + 0.32 * Math.cbrt(M),
    massPos = new T.Vector3(0, hAt(0, 0) + rm * 0.9, 0);
  const mass = new T.Mesh(
    new T.SphereGeometry(rm, 48, 32),
    new T.MeshStandardMaterial({
      color: dark ? 0xe9e7f6 : 0x2d2b45,
      emissive: 0x6a55e0,
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.1,
    }),
  );
  mass.position.copy(massPos);
  mass.userData = { id: "mass", title: "Masse centrale" };
  const gc = document.createElement("canvas");
  gc.width = gc.height = 128;
  const gx = gc.getContext("2d"),
    gr = gx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, "rgba(141,121,255,.55)");
  gr.addColorStop(1, "rgba(141,121,255,0)");
  gx.fillStyle = gr;
  gx.fillRect(0, 0, 128, 128);
  const glow = new T.Sprite(
    new T.SpriteMaterial({
      map: new T.CanvasTexture(gc),
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  glow.scale.setScalar(rm * 7);
  glow.position.copy(massPos);
  gObj.add(mass, glow);
  scene.add(new T.AmbientLight(0xffffff, dark ? 0.75 : 0.9));
  const dl = new T.DirectionalLight(0xffffff, 0.9);
  dl.position.set(6, 14, 8);
  scene.add(dl);
  const pl = new T.PointLight(0x8d79ff, 0.9, 30);
  pl.position.copy(massPos).add(new T.Vector3(0, 1.5, 0));
  scene.add(pl);
  // Layer 4 — trajectoires (équations de géodésique de Schwarzschild, M en unités arbitraires)
  const Mg = 0.3 * M,
    onSurf = (r, ph, up = 0.14) =>
      new T.Vector3(
        r * Math.cos(ph),
        hAt(r * Math.cos(ph), r * Math.sin(ph)) + up,
        r * Math.sin(ph),
      );
  const orbit = [],
    r0 = E * 0.75,
    u0 = 1 / r0,
    uc = (((((u0 * 2.2) / 2) * 1.6) / 1.6) * (1 + 2.2)) / 2.2;
  {
    let u = u0,
      du = 0,
      ph = 0,
      n = 0;
    const hh = 0.004,
      uC = (u0 * (1 + 2.2)) / 2;
    while (ph < Math.PI * 6.4 && n++ < 6000) {
      du += (-u + uC + 3 * Mg * u * u) * hh;
      u += du * hh;
      ph += hh;
      if (n % 8 === 0) {
        const r = 1 / u;
        if (r > 0.9 && r < E * 1.02) orbit.push(onSurf(r, ph));
      }
    }
  }
  const rayPts = [];
  {
    const b = E * 0.38;
    let u = 0.02,
      ph = 0,
      n = 0;
    const hh = 0.002;
    let du = Math.sqrt(Math.max(0, 1 / (b * b) - u * u + 2 * Mg * u ** 3));
    while (u > 0.0005 && ph < Math.PI * 1.4 && n++ < 9000) {
      du += (-u + 3 * Mg * u * u) * hh;
      u += du * hh;
      ph += hh;
      const r = 1 / u;
      if (n % 5 === 0 && r < E * 1.05 && r > 0.9)
        rayPts.push(onSurf(r, ph, 0.12));
    }
  }
  const tube = (pts, color, rad, data) => {
    if (pts.length < 3) return null;
    const m = new T.Mesh(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(pts),
        pts.length,
        rad,
        6,
        false,
      ),
      new T.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.5,
      }),
    );
    m.userData = data;
    gPath.add(m);
    return m;
  };
  const orbitMesh =
      P.orbit !== false &&
      tube(orbit, 0x8d79ff, 0.05, {
        id: "orbit",
        title: "Orbite (géodésique)",
      }),
    rayMesh =
      P.light !== false &&
      tube(rayPts, AMBER, 0.045, {
        id: "light",
        title: "Rayon lumineux dévié",
      });
  if (rayPts.length > 3) {
    const b = E * 0.38,
      a1 = new T.Vector3(E, hAt(E, b) + 0.12, b),
      a2 = new T.Vector3(-E, hAt(-E, b) + 0.12, b),
      ref = new T.Line(
        new T.BufferGeometry().setFromPoints([a1, a2]),
        new T.LineDashedMaterial({
          color: 0x9aa1b5,
          dashSize: 0.5,
          gapSize: 0.35,
          transparent: true,
          opacity: 0.7,
        }),
      );
    ref.computeLineDistances();
    gPath.add(ref);
  }
  const body = new T.Mesh(
    new T.SphereGeometry(0.2, 20, 16),
    new T.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x8d79ff,
      emissiveIntensity: 0.9,
    }),
  );
  body.userData = { id: "body", title: "Corps en orbite" };
  if (orbit.length) {
    body.position.copy(orbit[0]);
    gObj.add(body);
  }
  // Layer 5 — annotations
  lab(
    "Masse centrale M",
    () => massPos.clone().add(new T.Vector3(0, rm + 0.7, 0)),
    "notes",
    "is-note",
  );
  if (orbit.length)
    lab(
      "Orbite : géodésique qui précesse",
      () =>
        orbit[Math.floor(orbit.length * 0.04)]
          .clone()
          .add(new T.Vector3(0, 0.7, 0)),
      "notes",
      "is-note",
    );
  if (rayPts.length)
    lab(
      "Rayon lumineux dévié",
      () =>
        rayPts[Math.floor(rayPts.length * 0.12)]
          .clone()
          .add(new T.Vector3(0, 0.7, 0)),
      "notes",
      "is-note",
    );
  lab(
    "Temps plus lent : Δt′ = Δt·√(1 − 2GM/rc²)",
    () => new T.Vector3(2.4, hAt(2.4, 2.4) - 0.5, 2.4),
    "notes",
    "is-note is-math",
  );
  (a.annotations || []).forEach((n) => {
    const at = n.at || [0, 0, 0];
    lab(
      n.text,
      () => new T.Vector3(at[0], hAt(at[0], at[2]) + (at[1] || 0.6), at[2]),
      "notes",
      "is-note",
    );
  });
  const labBox = dom("div", "ax-3d-labels");
  labels.forEach((l) => labBox.append(l.el));
  sh.stage.append(labBox);
  // Layer 6 — légende
  const legend = dom("div", "ax-3d-legend");
  (
    a.legend || [
      { label: "Grille d'espace-temps déformée", color: "#8d79ff" },
      { label: "Orbite d'un corps", color: "#8d79ff" },
      { label: "Rayon lumineux", color: "#f0b429" },
      { label: "Trajectoire sans gravité", color: "#9aa1b5" },
    ]
  ).forEach((it) => {
    const r = dom("div");
    const i = dom("i");
    i.style.background = it.color;
    r.append(i, dom("span", null, it.label));
    legend.append(r);
  });
  sh.root.append(legend);
  // Caméra : contrôles propres à l'artefact
  const cam = { th: 0.8, ph: 1.0, d: E * 2.05, tx: 0, ty: -1.2, tz: 0 },
    home = { ...cam };
  const placeCam = () => {
    const sp = Math.sin(cam.ph);
    camera.position.set(
      cam.tx + cam.d * sp * Math.sin(cam.th),
      cam.ty + cam.d * Math.cos(cam.ph),
      cam.tz + cam.d * sp * Math.cos(cam.th),
    );
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  };
  const ptrs = new Map();
  let lastPinch = 0,
    moved = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    sh.closePop();
    lastPinch = 0;
  });
  el.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) {
      hover(e);
      return;
    }
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    moved += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX;
    p.y = e.clientY;
    if (ptrs.size === 2) {
      const [q, r] = [...ptrs.values()],
        dist = Math.hypot(q.x - r.x, q.y - r.y);
      if (lastPinch) cam.d = clamp((cam.d * lastPinch) / dist, 5, 90);
      lastPinch = dist;
      return;
    }
    if (e.buttons === 2 || e.shiftKey) {
      const s = cam.d * 0.0016;
      cam.tx -= dx * s * Math.cos(cam.th);
      cam.tz += dx * s * Math.sin(cam.th);
      cam.ty += dy * s;
    } else {
      cam.th -= dx * 0.006;
      cam.ph = clamp(cam.ph - dy * 0.006, 0.08, 1.6);
    }
    sh.hideTip();
  });
  const pend = (e) => {
    ptrs.delete(e.pointerId);
    lastPinch = 0;
    if (moved < 5 && e.type === "pointerup") pick(e);
  };
  el.addEventListener("pointerup", pend);
  el.addEventListener("pointercancel", pend);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener(
    "wheel",
    (e) => {
      if (!wheelOK(e, sh.root)) return;
      e.preventDefault();
      cam.d = clamp(cam.d * (e.deltaY < 0 ? 0.9 : 1.1), 5, 90);
    },
    { passive: false },
  );
  el.addEventListener("dblclick", () => Object.assign(cam, home));
  const ray = new T.Raycaster(),
    targets = () => [mass, body, orbitMesh, rayMesh].filter(Boolean);
  const hit = (e) => {
    const r = el.getBoundingClientRect();
    ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    return ray.intersectObjects(targets(), false)[0]?.object || null;
  };
  const hover = (e) => {
    const o = hit(e);
    el.style.cursor = o ? "pointer" : "grab";
    if (o) sh.tip(e, o.userData.title);
    else sh.hideTip();
  };
  const INFO = {
    mass: [
      ["Rôle", "Source de la courbure"],
      ["Masse M", `${fmt(M)} (unités arbitraires)`],
      ["Rayon de Schwarzschild", "r_s = 2GM/c²"],
      ["Temps propre", "Δt′ = Δt·√(1 − r_s/r)"],
    ],
    orbit: [
      ["Nature", "Géodésique d'un corps massif"],
      ["Effet GR", "Précession du périhélie"],
      ["Formule", "Δφ ≈ 6πGM / (c²·a(1−e²))"],
    ],
    light: [
      ["Nature", "Géodésique nulle (photon)"],
      ["Déflexion", "α ≈ 4GM / (c²·b)"],
      ["Référence", "Pointillés : trajet sans gravité"],
    ],
    body: [
      ["Nature", "Corps d'épreuve"],
      ["Mouvement", "Suit la géodésique de l'orbite"],
    ],
  };
  let selected = null;
  const glowMat = (o, v) => {
    if (o?.material?.emissiveIntensity != null)
      o.material.emissiveIntensity = v;
  };
  const pick = (e) => {
    glowMat(
      selected,
      selected === mass ? 0.25 : selected === body ? 0.9 : 0.35,
    );
    selected = hit(e);
    if (!selected) return;
    glowMat(selected, 1.4);
    sh.pop(
      e,
      selected.userData.title,
      INFO[selected.userData.id] || [],
      "#8d79ff",
    );
  };
  const layers = { space: gSpace, axes: gAxes, objects: gObj, paths: gPath },
    layerOn = {
      space: true,
      axes: true,
      objects: true,
      paths: true,
      notes: true,
      legend: true,
    };
  const setLayer = (k, on) => {
    layerOn[k] = on;
    if (layers[k]) layers[k].visible = on;
    if (k === "legend") legend.style.display = on ? "" : "none";
  };
  let playing = true,
    idx = 0,
    visible = true,
    destroyed = false,
    req = 0;
  const resize = () => {
    const w = sh.stage.clientWidth || 600,
      h = sh.stage.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(sh.stage);
  resize();
  const io = new IntersectionObserver((en) => {
    visible = en[0].isIntersecting;
  });
  io.observe(sh.root);
  const tick = () => {
    if (destroyed) return;
    req = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    if (playing && orbit.length) {
      idx = (idx + 0.7) % orbit.length;
      body.position.copy(orbit[Math.floor(idx)]);
    }
    placeCam();
    renderer.render(scene, camera);
    const w = renderer.domElement.clientWidth,
      h = renderer.domElement.clientHeight;
    labels.forEach((l) => {
      const v = l.get().project(camera),
        on = layerOn[l.layer] && v.z < 1;
      l.el.style.display = on ? "" : "none";
      if (on)
        l.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px,${(-v.y * 0.5 + 0.5) * h}px) translate(-50%,-120%)`;
    });
  };
  tick();
  c; // APRÈS
  sh.root.__capture = () => {
    placeCam();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  };
  const lyr = (k, label) => ({
    label,
    toggle: true,
    on: true,
    title: `Afficher / masquer : ${label}`,
    run: (on) => setLayer(k, on),
  });
  sh.toolbar([
    {
      label: "Réinit.",
      title: "Réinitialiser la caméra",
      run: () => Object.assign(cam, home),
    },
    {
      label: "Dessus",
      run: () => Object.assign(cam, { th: 0.8, ph: 0.12, d: E * 2.4, ty: 0 }),
    },
    {
      label: "Profil",
      run: () => Object.assign(cam, { th: 0.3, ph: 1.5, d: E * 1.9 }),
    },
    {
      label: "Lecture",
      toggle: true,
      on: true,
      run: (on) => {
        playing = on;
      },
    },
    "|",
    lyr("space", "Espace"),
    lyr("axes", "Axes"),
    lyr("objects", "Objets"),
    lyr("paths", "Trajectoires"),
    lyr("notes", "Annotations"),
    lyr("legend", "Légende"),
  ]);
  sh.hint(
    "Glisser : tourner · Maj/clic droit : déplacer · molette (après un clic) : zoom · clic sur un objet : détails",
  );
  track(sh.root, () => {
    destroyed = true;
    cancelAnimationFrame(req);
    ro.disconnect();
    io.disconnect();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => {
        x.map?.dispose?.();
        x.dispose();
      });
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
  });
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
  const head = dom("header", "ax-doc-head"),
    titleBox = dom("div");
  if (!ctx.inline || ctx.full) {
    titleBox.append(dom("h2", null, a.title || "Document"));
    if (a.summary) titleBox.append(dom("p", null, a.summary));
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
          t.append(dom("thead")).append(hr);
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
  a.sections.forEach((s) => {
    const sec = dom("section", "ax-sec"),
      h = dom(s.level === 3 ? "h4" : "h3", "ax-sec-title", s.title);
    sec.append(h);
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
    link.onclick = () =>
      body.scrollTo({
        top: Math.max(0, sec.offsetTop - 8),
        behavior: "smooth",
      }); // défile dans le document, jamais dans le Chat
    toc.append(link);
    links.set(s.id, link);
  });
  let tick = false;
  const spy = () => {
    let cur = secs[0];
    secs.forEach((s) => {
      if (s.el.offsetTop - body.scrollTop <= 48) cur = s;
    });
    links.forEach((l) => l.classList.remove("is-on"));
    if (cur) links.get(cur.id)?.classList.add("is-on");
  };
  body.addEventListener("scroll", () => {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => {
      tick = false;
      spy();
    });
  });
  spy();
  track(root, () => io.disconnect());
}

/* ═══ 10. POINT D'ENTRÉE ═══ */
// APRÈS
const MOUNT = {
  plot: mountPlot,
  diagram: mountDiagram,
  timeline: mountTimeline,
  probtree: mountProbTree,
  scene3d: mountScene3D,
  sheet: mountSheet,
  doc: mountDoc,
};
export async function mountArtifact(artifact, host, ctx = {}) {
  if (artifact?.variant && ctx.renderLegacy) {
    ctx.renderLegacy(artifact, host);
    return true;
  } // schémas physiques historiques
  const a = normalizeArtifact(adaptLegacy(artifact) || artifact);
  if (a && !MOUNT[a.type] && ctx.renderLegacy) {
    ctx.renderLegacy(a, host);
    return true;
  } // table, decision, plan… dans un doc
  if (!a || !MOUNT[a.type]) return false;
  const loading = dom("div", "ax-loading", "Préparation de la figure…");
  host.append(loading);
  try {
    await MOUNT[a.type](a, host, ctx);
    loading.remove();
    const root = [...host.children]
      .reverse()
      .find((n) => n.classList?.contains("ax"));
    if (root && a.type !== "doc")
      attachMenu(root, figureMenu(a, root, ctx), {
        context: a.type !== "scene3d",
      }); // 3D : clic droit = déplacer la caméra
    return true;
  } catch (e) {
    console.error("[AiGENT artefact]", e);
    loading.textContent = `Figure indisponible : ${e.message}`;
    return false;
  }
}
