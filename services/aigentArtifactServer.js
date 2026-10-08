/* ═══ AiGENT — contrat d'artefacts côté serveur ═══
   • parseAigentBlock : accepte AIGENT_DATA / AIGENTDATA / AIGENT-DATA, JSON avec virgules
     traînantes, JSON tronqué (réparé), plusieurs blocs, bloc non fermé.
   • sanitizeEngineArtifact : valide plot, diagram, timeline, probtree, scene3d, sheet, doc.
   • engineFallback : figures déterministes si le modèle n'a rien produit. */

const txt = (v, n = 300) =>
  String(v ?? "")
    .trim()
    .slice(0, n);
const num = (v, d, lo = -1e6, hi = 1e6) => {
  if (v === null || v === undefined || v === "") return d;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
};
const hex = (v) =>
  /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : undefined;
const ident = (v, d) =>
  String(v ?? "")
    .trim()
    .replace(/[^\w-]+/g, "_")
    .slice(0, 40) || d;
const pair = (v) => {
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const a = num(v[0], NaN),
    b = num(v[1], NaN);
  return Number.isFinite(a) && Number.isFinite(b) && a < b ? [a, b] : undefined;
};

const SAFE_EXPR = /^[0-9a-zA-Z_+\-*/^().,\s<>=!%|&:?²³×−–]*$/;
const BAD_FN =
  /\b(import|createUnit|evaluate|parse|compile|simplify|derivative|resolve|reviver|typed|chain|config|help|eval|Function)\b/i;
export const safeExprText = (v) => {
  const s = String(v ?? "")
    .trim()
    .slice(0, 240);
  return s && SAFE_EXPR.test(s) && !BAD_FN.test(s) ? s : "";
};

export const ENGINE_TYPE_SET = new Set([
  "plot",
  "diagram",
  "timeline",
  "probtree",
  "scene3d",
  "sheet",
  "doc",
]);
export const ENGINE_ALIASES = {
  function: "plot",
  graph: "plot",
  plot2d: "plot",
  frise: "timeline",
  chronology: "timeline",
  tree: "probtree",
  probability_tree: "probtree",
  spacetime: "scene3d",
  scene_3d: "scene3d",
  excel: "sheet",
  structured_document: "doc",
};

const KINDS = new Set([
  "process",
  "step",
  "decision",
  "data",
  "actor",
  "document",
  "service",
  "cloud",
  "capsule",
  "hexagon",
  "circle",
  "rounded",
]);
const RELATIONS = new Set([
  "leads_to",
  "depends_on",
  "triggers",
  "produces",
  "contains",
  "transforms",
  "communicates",
  "causes",
]);

/* ── JSON tolérant ── */
export function repairJson(src) {
  let s = String(src ?? "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const start = s.indexOf("{");
  if (start < 0) return null;
  s = s.slice(start);
  const parse = (t) => {
    for (const c of [t, t.replace(/,(\s*[}\]])/g, "$1")]) {
      try {
        const v = JSON.parse(c);
        if (v && typeof v === "object") return v;
      } catch {}
    }
    return null;
  };
  const direct = parse(s);
  if (direct) return direct;
  let inStr = false,
    esc = false,
    end = -1;
  const stack = [],
    cuts = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      stack.pop();
      if (!stack.length) {
        end = i;
        break;
      }
    } else if (c === "," && stack.length)
      cuts.push({ i, close: [...stack].reverse().join("") });
  }
  if (end >= 0) {
    const v = parse(s.slice(0, end + 1));
    if (v) return v;
  }
  // JSON tronqué : on referme, puis on recule de virgule en virgule
  const tail =
    (s + (inStr ? '"' : "")).replace(/[,:\s]+$/, "") +
    [...stack].reverse().join("");
  const whole = parse(tail);
  if (whole) return whole;
  for (let k = cuts.length - 1, tries = 0; k >= 0 && tries < 80; k--, tries++) {
    const v = parse(s.slice(0, cuts[k].i) + cuts[k].close);
    if (v) return v;
  }
  return null;
}

const BLOCK =
  /\[\[\s*AIGENT[\s_-]?DATA\s*\]\]([\s\S]*?)(?:\[\[\s*\/\s*AIGENT[\s_-]?DATA\s*\]\]|$)/gi;
export function parseAigentBlock(raw) {
  const payloads = [];
  let found = false;
  const text = String(raw ?? "")
    .replace(BLOCK, (_, body) => {
      found = true;
      const j = repairJson(body);
      if (j) payloads.push(j);
      return "";
    })
    .replace(/\[\[\s*\/?\s*AIGENT[\s_-]?DATA\s*\]\]/gi, "")
    .replace(/```(?:json)?\s*```/g, "")
    .trim();
  return {
    text,
    found,
    payload: payloads.find((p) => p.artifact || p.type) || payloads[0] || null,
  };
}
/** Accepte {artifact:{…}}, {type:…} à plat, et {artifact:"chart", data:{…}} (cas observé). */
export function normalizeBlockPayload(p) {
  if (!p || typeof p !== "object") return null;
  let artifact = null,
    title;
  if (p.artifact && typeof p.artifact === "object") {
    artifact = p.artifact;
    title = typeof p.title === "string" ? p.title : undefined;
  } else if (typeof p.artifact === "string")
    artifact = {
      ...(p.data && typeof p.data === "object" ? p.data : {}),
      type: p.artifact,
      title: p.title || p.data?.title,
    };
  else if (p.type) {
    const { reply, recommendedMode, suggestions, ...rest } = p;
    artifact = rest;
  } else if (p.data && typeof p.data === "object" && p.data.type)
    artifact = p.data;
  return {
    reply: typeof p.reply === "string" ? p.reply : undefined,
    artifact,
    recommendedMode: p.recommendedMode,
    suggestions: p.suggestions,
    title,
  };
}

const looksAscii = (code) => {
  const l = String(code)
    .split("\n")
    .filter((x) => x.trim());
  return (
    l.length >= 5 &&
    l.filter((x) =>
      /(^\s*\|)|\+-{3,}|-{4,}>|\s[\/\\]\s*$|^\s*[\/\\|•*]+\s*$/.test(x),
    ).length /
      l.length >=
      0.45
  );
};
export const scrubAnswer = (s) =>
  String(s ?? "")
    .replace(/\[object (?:Text|Object|Undefined|Node)\]/gi, "")
    .replace(/\[\[\s*\/?\s*AIGENT[\s_-]?DATA\s*\]\]/gi, "")
    .replace(/```(?:json)?\s*```/g, "")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (m, c) => (looksAscii(c) ? "" : m))
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Le panneau droit ne s'ouvre que pour Create ou une demande explicite de document/export. */
const DELIVERABLE_A =
  /\b(cr[ée]e[rz]?|g[ée]n[èe]re[rz]?|produis|fais|r[ée]dige|exporte[rz]?|pr[ée]pare|construis|mets? en forme)\b[^.\n]{0,60}\b(document|doc|rapport|dossier|fiche|plan|pr[ée]sentation|fichier|feuille|tableur|excel|csv|pdf|frise|mod[eè]le 3d|sc[èe]ne 3d|maquette|sch[ée]ma technique|corrig[ée]|cours)\b/i;
const DELIVERABLE_B =
  /\b(exporter|t[ée]l[ée]charger|imprimer|importer|en pdf|en excel)\b/i;
export const isDeliverableRequest = (message, mode) =>
  mode === "create" ||
  DELIVERABLE_A.test(message || "") ||
  DELIVERABLE_B.test(message || "");

export function engineFallback(message) {
  const m = String(message || "");
  if (
    /(espace[- ]?temps|courbure|trou noir|relativit[ée] g[ée]n[ée]rale)/i.test(
      m,
    ) &&
    /(3d|repr[ée]sent|visuali|sch[ée]ma|montre|trace|g[ée]n[èe]re|dessine)/i.test(
      m,
    )
  )
    return {
      type: "scene3d",
      title: "Courbure de l'espace-temps",
      preset: "spacetime",
      params: {
        mass: 1.2,
        curvature: 1,
        extent: 12,
        lines: 26,
        orbit: true,
        light: true,
      },
    };
  const fm = /\b[fgh]\s*\(\s*x\s*\)\s*=\s*([^\n?!;]{1,120})/i.exec(m);
  if (
    fm &&
    /\b(trac|graph|courbe|repr[ée]sent|racines?|parabole|dessine)/i.test(m)
  ) {
    const raw = fm[1]
      .replace(
        /[.,]?\s+(?:et|avec|sur|puis|pour|montre|afficher)\b[\s\S]*$/i,
        "",
      )
      .replace(/[.\s]+$/, "");
    const expr = safeExprText(
      raw
        .replace(/²/g, "^2")
        .replace(/³/g, "^3")
        .replace(/×/g, "*")
        .replace(/[−–]/g, "-")
        .replace(/(\d),(\d)/g, "$1.$2"),
    );
    if (expr)
      return {
        type: "plot",
        title: `f(x) = ${raw}`,
        xLabel: "x",
        yLabel: "f(x)",
        functions: [{ id: "f", expr, label: "f(x)" }],
      };
  }
  return null;
}

/* ── Validation par type ── */
export function sanitizeEngineArtifact(
  type,
  raw,
  { depth = 0, sanitizeChild } = {},
) {
  const base = {
    type,
    title: txt(raw.title, 120) || "Figure",
    summary: txt(raw.summary, 500),
  };
  switch (type) {
    case "plot":
      return cleanPlot(base, raw);
    case "diagram":
      return cleanDiagram(base, raw);
    case "timeline":
      return cleanTimeline(base, raw);
    case "probtree":
      return cleanProbTree(base, raw);
    case "scene3d":
      return cleanScene(base, raw);
    case "sheet":
      return cleanSheet(base, raw);
    case "doc":
      return cleanDoc(base, raw, depth, sanitizeChild);
    default:
      return null;
  }
}
function cleanPlot(base, raw) {
  const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  const ref = (v) =>
    typeof v === "string"
      ? txt(v, 40)
      : v &&
          typeof v === "object" &&
          Number.isFinite(Number(v.x)) &&
          Number.isFinite(Number(v.y))
        ? { x: Number(v.x), y: Number(v.y) }
        : null;
  const functions = arr(raw.functions, 6)
    .map((f, i) => ({
      id: ident(f?.id, `f${i + 1}`),
      expr: safeExprText(f?.expr),
      label: txt(f?.label, 40) || `f${i + 1}(x)`,
      domain: pair(f?.domain),
      dashed: f?.dashed === true,
      color: hex(f?.color),
    }))
    .filter((f) => f.expr);
  const points = arr(raw.points, 40)
    .map((p, i) => ({
      id: ident(p?.id, `P${i + 1}`),
      label: txt(p?.label ?? p?.id, 30),
      x: num(p?.x, NaN),
      y: num(p?.y, undefined),
      on: p?.on ? ident(p.on, "") : undefined,
      draggable: p?.draggable === true,
      info: txt(p?.info, 200) || undefined,
      color: hex(p?.color),
    }))
    .filter((p) => Number.isFinite(p.x));
  const series = arr(raw.series, 4)
    .map((s, i) => ({
      id: ident(s?.id, `s${i + 1}`),
      label: txt(s?.label, 40),
      mode: s?.mode === "scatter" ? "scatter" : "line",
      points: arr(s?.points, 300)
        .map((q) => [num(q?.[0], NaN), num(q?.[1], NaN)])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
    }))
    .filter((s) => s.points.length);
  const lines = arr(raw.lines, 12)
    .map((l) => {
      const o = {
        label: txt(l?.label, 40) || undefined,
        dashed: l?.dashed === true,
        segment: l?.segment === true,
        color: hex(l?.color),
      };
      if (Array.isArray(l?.through) && l.through.length === 2) {
        const p = ref(l.through[0]),
          q = ref(l.through[1]);
        if (p && q) return { ...o, through: [p, q] };
      }
      if (l?.x != null && Number.isFinite(Number(l.x)))
        return { ...o, x: Number(l.x) };
      if (l?.y != null && Number.isFinite(Number(l.y)))
        return { ...o, y: Number(l.y) };
      if (l?.slope != null)
        return { ...o, slope: num(l.slope, 0), intercept: num(l.intercept, 0) };
      return null;
    })
    .filter(Boolean);
  const vectors = arr(raw.vectors, 12)
    .map((v) => ({
      from: ref(v?.from),
      to: ref(v?.to),
      label: txt(v?.label, 30) || undefined,
      color: hex(v?.color),
    }))
    .filter((v) => v.from && v.to);
  const annotations = arr(raw.annotations, 12)
    .map((n) => ({
      x: num(n?.x, NaN),
      y: num(n?.y, NaN),
      text: txt(n?.text, 80),
    }))
    .filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && n.text);
  if (!functions.length && !points.length && !series.length) return null;
  const dx = pair(raw.domain?.x),
    dy = pair(raw.domain?.y);
  const auto =
    raw.auto && typeof raw.auto === "object"
      ? Object.fromEntries(
          ["roots", "extrema", "yIntercept", "intersections"]
            .filter((k) => typeof raw.auto[k] === "boolean")
            .map((k) => [k, raw.auto[k]]),
        )
      : undefined;
  return {
    ...base,
    xLabel: txt(raw.xLabel, 50),
    yLabel: txt(raw.yLabel, 50),
    equal: raw.equal === true,
    grid: raw.grid !== false,
    axes: raw.axes !== false,
    domain: dx ? { x: dx, ...(dy ? { y: dy } : {}) } : undefined,
    functions,
    points,
    series,
    lines,
    vectors,
    annotations,
    auto,
  };
}
function cleanDiagram(base, raw) {
  const seen = new Set();
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : [])
    .slice(0, 40)
    .map((n, i) => ({
      id: ident(n?.id, `n${i}`),
      label: txt(n?.label, 90),
      detail: txt(n?.detail, 200),
      parent: n?.parent ? ident(n.parent, "") : null,
      group: txt(n?.group, 40),
      kind: KINDS.has(n?.kind) ? n.kind : "",
      color: hex(n?.color),
    }))
    .filter((n) => n.label && !seen.has(n.id) && seen.add(n.id));
  if (nodes.length < 2 && !RAW_VARIANTS.has(raw.variant)) return null;
  const edges = (Array.isArray(raw.edges) ? raw.edges : [])
    .slice(0, 80)
    .map((e) => ({
      from: ident(e?.from, ""),
      to: ident(e?.to, ""),
      label: txt(e?.label, 60),
      relation: RELATIONS.has(e?.relation) ? e.relation : "",
    }))
    .filter((e) => seen.has(e.from) && seen.has(e.to));
  const groups = (Array.isArray(raw.groups) ? raw.groups : [])
    .slice(0, 10)
    .map((g) => ({
      id: ident(g?.id, ""),
      label: txt(g?.label, 60),
      members: (Array.isArray(g?.members) ? g.members : [])
        .map((m) => ident(m, ""))
        .filter((m) => seen.has(m))
        .slice(0, 30),
    }))
    .filter((g) => g.id && g.members.length);
  return {
    ...base,
    variant: RAW_VARIANTS.has(raw.variant) ? raw.variant : "",
    direction: raw.direction === "TB" ? "TB" : "LR",
    layout: raw.layout === "force" ? "force" : "layered",
    nodes,
    edges,
    groups,
  };
}
const RAW_VARIANTS = new Set([
  "venturi",
  "boundary-layer",
  "forces",
  "cascade",
  "shock",
  "cfd-grid",
]);
function cleanTimeline(base, raw) {
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .slice(0, 40)
    .map((e) => ({
      date: txt(e?.date, 40),
      t: e?.t != null && Number.isFinite(Number(e.t)) ? Number(e.t) : undefined,
      label: txt(e?.label, 90),
      detail: txt(e?.detail, 240),
      kind: ["start", "milestone", "end"].includes(e?.kind)
        ? e.kind
        : undefined,
      group: txt(e?.group, 40) || undefined,
    }))
    .filter((e) => e.label);
  return events.length >= 2 ? { ...base, events } : null;
}
function cleanProbTree(base, raw) {
  const node = (n, d) => ({
    label: txt(n?.label, 60) || "?",
    p:
      typeof n?.p === "number"
        ? n.p
        : /^[\d.,\s/%]+$/.test(String(n?.p ?? ""))
          ? String(n.p).trim().slice(0, 12)
          : undefined,
    children:
      d < 5 && Array.isArray(n?.children)
        ? n.children.slice(0, 6).map((c) => node(c, d + 1))
        : [],
  });
  const root = node(raw.root || {}, 0);
  if (!root.children.length) return null;
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .slice(0, 8)
    .map((e) => ({
      label: txt(e?.label, 80),
      where: (Array.isArray(e?.where) ? e.where : [])
        .slice(0, 5)
        .map((w) => txt(w, 60)),
    }))
    .filter((e) => e.label);
  return { ...base, root, events };
}
function cleanScene(base, raw) {
  const p = raw.params || {};
  return {
    ...base,
    preset: "spacetime",
    params: {
      mass: num(p.mass, 1, 0.2, 4),
      curvature: num(p.curvature, 1, 0.2, 3),
      extent: num(p.extent, 12, 6, 30),
      lines: num(p.lines, 26, 8, 60),
      orbit: p.orbit !== false,
      light: p.light !== false,
    },
    annotations: (Array.isArray(raw.annotations) ? raw.annotations : [])
      .slice(0, 8)
      .map((n) => ({
        text: txt(n?.text, 80),
        at:
          Array.isArray(n?.at) && n.at.length === 3
            ? n.at.map((v) => num(v, 0, -40, 40))
            : [0, 0.6, 0],
      }))
      .filter((n) => n.text),
    legend: (Array.isArray(raw.legend) ? raw.legend : [])
      .slice(0, 6)
      .map((l) => ({
        label: txt(l?.label, 60),
        color: hex(l?.color) || "#8d79ff",
      }))
      .filter((l) => l.label),
  };
}
function cleanSheet(base, raw) {
  const columns = (Array.isArray(raw.columns) ? raw.columns : [])
    .slice(0, 20)
    .map((c) => txt(c, 60));
  let budget = 150000;
  const rows = [];
  for (const r of (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 300)) {
    const row = (Array.isArray(r) ? r : [])
      .slice(0, 20)
      .map((c) => txt(c, 200));
    budget -= row.join("").length;
    if (budget < 0) break;
    rows.push(row);
  }
  return columns.length && rows.length ? { ...base, columns, rows } : null;
}
function cleanBlock(b, depth, sanitizeChild) {
  if (typeof b === "string") return { type: "text", md: txt(b, 6000) };
  if (!b || typeof b !== "object") return null;
  const list = (v, n, m) =>
    Array.isArray(v) ? v.slice(0, n).map((x) => txt(x, m)) : [];
  switch (b.type) {
    case "list":
      return {
        type: "list",
        ordered: b.ordered === true,
        items: list(b.items, 30, 300),
      };
    case "callout":
      return {
        type: "callout",
        tone: ["info", "warn", "success"].includes(b.tone) ? b.tone : "info",
        title: txt(b.title, 80),
        md: txt(b.md ?? b.text, 2000),
      };
    case "quote":
      return {
        type: "quote",
        md: txt(b.md ?? b.text, 1500),
        cite: txt(b.cite, 100),
      };
    case "table":
      return {
        type: "table",
        title: txt(b.title, 100),
        columns: list(b.columns, 10, 60),
        rows: (Array.isArray(b.rows) ? b.rows : [])
          .slice(0, 60)
          .map((r) => list(r, 10, 200)),
      };
    case "formula":
      return {
        type: "formula",
        tex: txt(b.tex ?? b.formula, 400),
        label: txt(b.label, 80),
      };
    case "code":
      return { type: "code", lang: txt(b.lang, 20), code: txt(b.code, 4000) };
    case "artifact": {
      if (!sanitizeChild || depth > 0) return null;
      const child = sanitizeChild(b.artifact);
      return child && child.type !== "doc"
        ? {
            type: "artifact",
            artifact: child,
            caption: txt(b.caption, 160) || undefined,
          }
        : null;
    }
    default:
      return b.type === "text" || b.md != null
        ? { type: "text", md: txt(b.md ?? b.text, 6000) }
        : null;
  }
}
function cleanDoc(base, raw, depth, sanitizeChild) {
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .slice(0, 30)
    .map((s, i) => ({
      id: ident(s?.id, `s${i + 1}`),
      title: txt(s?.title, 140) || `Section ${i + 1}`,
      level: s?.level === 3 ? 3 : 2,
      blocks: (Array.isArray(s?.blocks) ? s.blocks : [])
        .slice(0, 40)
        .map((b) => cleanBlock(b, depth, sanitizeChild))
        .filter(Boolean),
    }));
  return sections.length ? { ...base, sections } : null;
}

/* ── Contrat envoyé au modèle ── */
export const ENGINE_TYPES_GUIDE = `TYPES D'ARTEFACTS (tu remplis des champs, le moteur gère rendu, mise en page et interactions) :
- plot : {type:"plot", title, xLabel, yLabel, equal?:bool, domain?:{x:[a,b],y?:[a,b]},
    functions:[{id,expr:"-0.2*x^2+2.4*x",label:"f(x)",domain?:[0,12],dashed?}],
    points:[{id,label,x,y?,on?:fnId,draggable?,info?}], series?:[{id,label,mode:"line|scatter",points:[[x,y]]}],
    lines?:[{through:["A","B"],segment?,label?} | {slope,intercept} | {x:3} | {y:2}], vectors?:[{from:"A",to:"B",label}],
    auto?:{roots,extrema,yIntercept,intersections}}
  Racines, sommet, ordonnée à l'origine et intersections sont CALCULÉS par le moteur : ne les donne pas. Géométrie (points, droites, vecteurs) : equal:true. Mets un domain adapté (ex. [-1,13] pour une trajectoire de 0 à 12).
- diagram : {type:"diagram", title, direction:"LR|TB", layout?:"layered|force",
    nodes:[{id,label,detail?,kind:"process|decision|data|actor|document|service|cloud|capsule|hexagon|circle|rounded",group?}],
    edges:[{from,to,label?,relation:"leads_to|depends_on|triggers|produces|contains|transforms|communicates|causes"}], groups?:[{id,label,members:[ids]}]}
  kind selon le SENS (donnée→data, choix→decision, personne→actor, résultat→document, API/serveur→service). Pas de coordonnées. layout "force" pour réseaux et cartes mentales, "layered" pour flux et processus.
- timeline : {type:"timeline", title, events:[{date:"1915",t?:1915,label,detail?,kind?:"start|milestone|end"}]}
- probtree : {type:"probtree", title, root:{label:"Départ",children:[{label:"A",p:"3/10",children:[{label:"B",p:0.5}]}]}, events?:[{label:"P(B)",where:["B"]}]}  (p = nombre, "3/10" ou "30%" ; produits et sommes calculés par le moteur)
- scene3d : {type:"scene3d", title, preset:"spacetime", params:{mass:1,curvature:1,extent:12,lines:26,orbit:true,light:true}, annotations?:[{text,at:[x,h,z]}]}
- sheet : {type:"sheet", title, columns:[…], rows:[[…]]}  (cellules "=SOMME(B2:B5)" autorisées)
- doc : {type:"doc", title, summary?, sections:[{id,title,level?:2|3,blocks:[
    {type:"text",md}, {type:"list",ordered?,items:[…]}, {type:"callout",tone:"info|warn|success",title?,md},
    {type:"quote",md,cite?}, {type:"table",title?,columns,rows}, {type:"formula",tex,label?}, {type:"code",lang,code},
    {type:"artifact",artifact:{plot|diagram|timeline|probtree|scene3d|sheet…},caption?}]}]}
  Pour tout cours, corrigé, rapport ou dossier demandé comme livrable : un doc avec un vrai plan, des formules en LaTeX et les figures intégrées en blocs artifact.
Autres types (formats habituels) : table {columns,rows} · chart (barres) {chartType:"bar",unit,points:[{label,value}]} · decision {recommendation,confidence,rationale,criteria,options:[{label,detail,benefit,risk}],nextSteps:[{title,detail}]} · debate {for,against,verdict} · perspectives {views:[{role,position,risk}],consensus} · plan {items:[{title,detail}]} · presentation {slides:[{title,body,bullets}]}.`;

export const ENGINE_CONTRACT = `RÈGLES DE SORTIE (impératives)
1. Formules : toujours en LaTeX entre $…$ (inline) ou $$…$$ (bloc). Jamais de formule en texte brut, jamais "[object …]".
2. Interdit : schémas ASCII, graphiques dessinés avec | + - /, blocs de code pour "dessiner". Si une figure aide, remplis un artefact.
3. Le bloc [[AIGENT_DATA]]…[[/AIGENT_DATA]] (orthographe exacte, avec underscore) contient UNIQUEMENT du JSON valide, placé à la toute fin, jamais évoqué dans le texte.
4. Format du bloc : {"artifact":{…},"recommendedMode":"think","suggestions":["…","…"],"title":"titre court de la conversation"}. "recommendedMode" ∈ think|advisor|decide|debate|perspectives|create, jamais un type d'artefact.
5. Si l'utilisateur demande une fonction, un schéma, un arbre, une frise, un tableau, un tableur, un document ou une scène 3D, tu REMPLIS l'artefact complet. Tu ne le remplaces JAMAIS par du texte, un tableau simplifié ou une description.
6. Un seul artefact principal par réponse (un doc peut en contenir plusieurs).

${ENGINE_TYPES_GUIDE}

EXEMPLE 1 — « Trace f(x)=2x²−4x−6 et montre ses racines »
[[AIGENT_DATA]]{"artifact":{"type":"plot","title":"f(x) = 2x² − 4x − 6","xLabel":"x","yLabel":"f(x)","functions":[{"id":"f","expr":"2*x^2-4*x-6","label":"f(x)"}],"domain":{"x":[-4,6]}},"recommendedMode":"think","suggestions":["Étudier le signe de f","Donner la forme canonique"]}[[/AIGENT_DATA]]
EXEMPLE 2 — « Courbure de l'espace-temps autour d'une masse »
[[AIGENT_DATA]]{"artifact":{"type":"scene3d","title":"Courbure de l'espace-temps","preset":"spacetime","params":{"mass":1.2,"curvature":1}},"recommendedMode":"think","suggestions":["Comparer avec un trou noir"]}[[/AIGENT_DATA]]`;
