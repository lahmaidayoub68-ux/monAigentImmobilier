/* ═══ AiGENT — contrat d'artefacts côté serveur ═══
   • parseAigentBlock : accepte AIGENT_DATA / AIGENTDATA / AIGENT-DATA, JSON avec virgules
     traînantes, JSON tronqué (réparé), plusieurs blocs, bloc non fermé.
   • sanitizeEngineArtifact : valide plot, diagram, timeline, probtree, scene3d, sheet, doc.
   • aucun contenu visuel n'est substitué si la génération ne fournit pas d'artefact valide. */

import { normalizeScientificText } from "../public/artifacts/scientific-text.js";
import { LIB_NAMES } from "../public/artifacts/shape-kit.js";
import {
  SCHEMA_BY_ID,
  schemaContract,
} from "../public/artifacts/schema-types.js";

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
export const ENGINE_ALIASES = {
  function: "plot",
  graph: "plot",
  plot2d: "plot",
  frise: "timeline",
  chronology: "timeline",
  tree: "probtree",
  probability_tree: "probtree",
  scene_3d: "scene3d",
  geographic_map: "map",
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
    .replace(/```json\s*([\s\S]*?)```/gi, (whole, body) => {
      const j = repairJson(body);
      if (!j || !(j.artifact || j.type)) return whole;
      found = true;
      payloads.push(j);
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
  normalizeScientificText(String(s ?? ""))
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
const EXPLICIT_VISUAL_REQUEST =
  /\b(?:je veux|j'aimerais|j’aimerais|je voudrais|je souhaite|constru\w*|cr[ée]e\w*|g[ée]n[èe]re\w*|dessin\w*|trac\w*|repr[ée]sent\w*|fourn\w*|produi\w*|pr[ée]pare\w*|ajout\w*|fais\w*|montre(?:-moi)?\w*)\b[\s\S]{0,120}\b(?:visuel(?:le)?|illustration|sch[ée]ma|arbre|frise|chronologie|plan|rep[èe]re|graphe|graphique|courbe|maquette|mod[èe]le 3d|sc[èe]ne 3d|organigramme|diagramme|document|rapport|dossier|fiche|pr[ée]sentation)\b/i;
export const isDeliverableRequest = (message, mode) =>
  mode === "create" ||
  DELIVERABLE_A.test(message || "") ||
  DELIVERABLE_B.test(message || "") ||
  EXPLICIT_VISUAL_REQUEST.test(message || "");

export const engineFallback = () => null;

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
  if (type === "diagram" && raw.schemaType && SCHEMA_BY_ID[raw.schemaType])
    raw = {
      ...raw,
      semanticType: raw.semanticType || SCHEMA_BY_ID[raw.schemaType].renderer,
    };
  switch (type) {
    case "code":
      return cleanCode(base, raw);
    case "plot":
      return cleanPlot(base, raw);
    case "diagram": {
      const d = cleanDiagram(base, raw);
      if (d && SCHEMA_BY_ID[raw.schemaType]) d.schemaType = raw.schemaType;
      return d;
    }
    case "timeline":
      return cleanTimeline(base, raw);
    case "probtree":
      return cleanProbTree(base, raw);
    case "scene3d":
      return cleanScene(base, raw);
    case "map":
      return cleanMap(base, raw);
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
    gridType: ["none", "simple", "graduated", "subdivided", "grid"].includes(
      raw.gridType,
    )
      ? raw.gridType
      : raw.grid === false
        ? "none"
        : "grid",
    gridSpacing: num(raw.gridSpacing, 1, 0.0001, 1e6),
    subdivisions: Math.round(num(raw.subdivisions, 0, 0, 20)),
    origin:
      raw.origin && typeof raw.origin === "object"
        ? { x: num(raw.origin.x, 0), y: num(raw.origin.y, 0) }
        : { x: 0, y: 0 },
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

const FAMILY_DATA = new Set([
  "charts",
  "sequence_diagram",
  "state_diagram",
  "er_diagram",
  "class_diagram",
  "quadrant",
  "venn",
  "gantt",
  "sankey_diagram",
  "electrical_circuit",
  "hydraulic_circuit",
  "heatmap",
  "forces_diagram",
  "transit_map",
]);
function cleanFamily(base, raw) {
  const t = raw.semanticType,
    L = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []),
    idl = (v, i, p) => ident(v?.id, `${p}${i + 1}`);
  if (t === "sequence_diagram") {
    const lifelines = L(raw.lifelines, 12)
      .map((l, i) => ({
        id: idl(l, i, "p"),
        label: txt(l?.label, 60),
        kind: l?.kind === "actor" ? "actor" : "system",
      }))
      .filter((l) => l.label);
    const ids = new Set(lifelines.map((l) => l.id));
    const messages = L(raw.messages, 60)
      .map((m) => ({
        from: ident(m?.from, ""),
        to: ident(m?.to, ""),
        label: txt(m?.label, 80),
        type: ["sync", "async", "return", "self"].includes(m?.type)
          ? m.type
          : "sync",
        note: txt(m?.note, 100) || undefined,
      }))
      .filter((m) => ids.has(m.from) && ids.has(m.to));
    return lifelines.length >= 2 && messages.length
      ? { ...base, semanticType: t, lifelines, messages }
      : null;
  }
  if (t === "state_diagram") {
    const states = L(raw.states, 30)
      .map((s, i) => ({
        id: idl(s, i, "s"),
        label: txt(s?.label, 60),
        kind: ["start", "end", "choice"].includes(s?.kind) ? s.kind : "state",
        detail: txt(s?.detail, 80),
      }))
      .filter((s) => s.label);
    const ids = new Set(states.map((s) => s.id));
    const transitions = L(raw.transitions, 80)
      .map((x) => ({
        from: ident(x?.from, ""),
        to: ident(x?.to, ""),
        label: txt(x?.label, 60),
      }))
      .filter((x) => ids.has(x.from) && ids.has(x.to));
    return states.length >= 2 && transitions.length
      ? { ...base, semanticType: t, states, transitions }
      : null;
  }
  if (t === "er_diagram" || t === "class_diagram") {
    const entities = L(raw.entities, 24)
      .map((e, i) => ({
        id: idl(e, i, "e"),
        name: txt(e?.name, 60),
        stereotype: txt(e?.stereotype, 24) || undefined,
        fields: L(e?.fields, 20)
          .map((f) => ({
            name: txt(f?.name, 40),
            type: txt(f?.type, 24),
            key: f?.key === "pk" || f?.key === "fk" ? f.key : undefined,
          }))
          .filter((f) => f.name),
        methods: L(e?.methods, 12)
          .map((m) => txt(m, 60))
          .filter(Boolean),
      }))
      .filter((e) => e.name);
    const ids = new Set(entities.map((e) => e.id));
    const relations = L(raw.relations, 60)
      .map((r) => ({
        from: ident(r?.from, ""),
        to: ident(r?.to, ""),
        label: txt(r?.label, 40),
        kind: r?.kind === "inherit" ? "inherit" : "assoc",
        card: Array.isArray(r?.card)
          ? r.card.slice(0, 2).map((c) => txt(c, 6))
          : undefined,
      }))
      .filter((r) => ids.has(r.from) && ids.has(r.to));
    return entities.length >= 2
      ? { ...base, semanticType: t, entities, relations }
      : null;
  }
  if (t === "quadrant") {
    const items = L(raw.items, 40)
      .map((i, k) => ({
        id: idl(i, k, "q"),
        label: txt(i?.label, 50),
        x: num(i?.x, 0.5, 0, 1),
        y: num(i?.y, 0.5, 0, 1),
        group: txt(i?.group, 30),
      }))
      .filter((i) => i.label);
    const ax = raw.axes || {};
    return items.length
      ? {
          ...base,
          semanticType: t,
          items,
          quadrants: L(raw.quadrants, 4).map((q) => txt(q, 40)),
          axes: {
            xLabel: txt(ax.xLabel, 50),
            yLabel: txt(ax.yLabel, 50),
            x: L(ax.x, 2).map((v) => txt(v, 24)),
            y: L(ax.y, 2).map((v) => txt(v, 24)),
          },
        }
      : null;
  }
  if (t === "venn") {
    const sets = L(raw.sets, 3)
      .map((s, i) => ({
        id: idl(s, i, "set"),
        label: txt(s?.label, 50),
        items: L(s?.items, 6).map((x) => txt(x, 40)),
      }))
      .filter((s) => s.label);
    const overlaps = L(raw.overlaps, 5)
      .map((o) => ({
        sets: L(o?.sets, 3).map((x) => ident(x, "")),
        label: txt(o?.label, 60),
      }))
      .filter((o) => o.label);
    return sets.length >= 2
      ? { ...base, semanticType: t, sets, overlaps }
      : null;
  }
  if (t === "gantt") {
    const tasks = L(raw.tasks, 80)
      .map((x, i) => ({
        id: idl(x, i, "t"),
        label: txt(x?.label, 80),
        start: num(x?.start, 0, 0, 1e5),
        duration: num(x?.duration, 1, 0, 1e5),
        group: txt(x?.group, 40),
        deps: (Array.isArray(x?.deps) ? x.deps : [])
          .slice(0, 6)
          .map((d) => ident(d, "")),
        milestone: x?.milestone === true,
        progress: num(x?.progress, 0, 0, 1),
      }))
      .filter((x) => x.label);
    return tasks.length >= 2
      ? { ...base, semanticType: t, unit: txt(raw.unit, 16), tasks }
      : null;
  }
  if (t === "sankey_diagram") {
    const flows = L(raw.flows, 80)
      .map((f) => ({
        from: ident(f?.from, ""),
        to: ident(f?.to, ""),
        value: num(f?.value, 0, 0, 1e12),
      }))
      .filter((f) => f.from && f.to && f.from !== f.to && f.value > 0);
    const labels =
      raw.labels && typeof raw.labels === "object"
        ? Object.fromEntries(
            Object.entries(raw.labels)
              .slice(0, 60)
              .map(([k, v]) => [ident(k, ""), txt(v, 50)]),
          )
        : {};
    return flows.length >= 2
      ? { ...base, semanticType: t, unit: txt(raw.unit, 16), flows, labels }
      : null;
  }
  if (t === "electrical_circuit" || t === "hydraulic_circuit") {
    const comp = (c) => ({
      type: txt(c?.type, 20),
      label: txt(c?.label, 30),
      value: txt(c?.value, 24),
    });
    const stages = L(raw.stages, 10)
      .map((s) =>
        Array.isArray(s?.parallel)
          ? { parallel: s.parallel.slice(0, 5).map(comp) }
          : comp(s),
      )
      .filter((s) => (s.parallel ? s.parallel.length : s.type));
    return stages.length
      ? {
          ...base,
          semanticType: t,
          source: comp(
            raw.source || {
              type: t === "electrical_circuit" ? "battery" : "pump",
            },
          ),
          stages,
        }
      : null;
  }
  if (t === "heatmap") {
    const rows = L(raw.rows, 40).map((x) => txt(x, 40)),
      cols = L(raw.cols, 30).map((x) => txt(x, 30)),
      values = L(raw.values, 40).map((r) =>
        L(r, 30).map((v) =>
          Number.isFinite(Number(v)) && v !== null && v !== ""
            ? Number(v)
            : null,
        ),
      );
    return rows.length && cols.length && values.length
      ? {
          ...base,
          semanticType: t,
          rows,
          cols,
          values,
          unit: txt(raw.unit, 16),
          min: Number.isFinite(Number(raw.min)) ? Number(raw.min) : undefined,
          max: Number.isFinite(Number(raw.max)) ? Number(raw.max) : undefined,
        }
      : null;
  }
  if (t === "forces_diagram") {
    const forces = L(raw.forces, 12)
      .map((f) => ({
        label: txt(f?.label, 40),
        angle: num(f?.angle, 0, -360, 360),
        magnitude: num(f?.magnitude, 1, 0, 1e9),
        unit: txt(f?.unit, 10),
        point: txt(f?.point, 12),
      }))
      .filter((f) => f.label);
    return forces.length
      ? {
          ...base,
          semanticType: t,
          body: {
            label: txt(raw.body?.label, 40),
            shape: ["block", "sphere", "beam"].includes(raw.body?.shape)
              ? raw.body.shape
              : "block",
          },
          forces,
        }
      : null;
  }
  if (t === "transit_map") {
    const stations = L(raw.stations, 80)
        .map((s, i) => ({ id: idl(s, i, "s"), label: txt(s?.label, 40) }))
        .filter((s) => s.label),
      ids = new Set(stations.map((s) => s.id));
    const lines = L(raw.lines, 10)
      .map((l, i) => ({
        id: idl(l, i, "l"),
        label: txt(l?.label, 30),
        color: hex(l?.color),
        stations: L(l?.stations, 60)
          .map((s) => ident(s, ""))
          .filter((s) => ids.has(s)),
      }))
      .filter((l) => l.stations.length >= 2);
    return lines.length ? { ...base, semanticType: t, stations, lines } : null;
  }
  if (t === "charts") {
    const series = L(raw.series, 6)
      .map((s) => ({
        label: txt(s?.label, 40),
        values: L(s?.values, 60).map((v) => num(v, 0, -1e12, 1e12)),
      }))
      .filter((s) => s.values.length);
    return series.length
      ? {
          ...base,
          semanticType: t,
          chart: ["pie", "bar", "line"].includes(raw.chart) ? raw.chart : "bar",
          labels: L(raw.labels, 60).map((x) => txt(x, 30)),
          series,
          unit: txt(raw.unit, 16),
        }
      : null;
  }
  return null;
}

function cleanCode(base, raw) {
  const files = (Array.isArray(raw.files) ? raw.files : [])
    .slice(0, 12)
    .map((f, i) => ({
      path: txt(f?.path, 120) || `fichier-${i + 1}.txt`,
      lang: txt(f?.lang, 20),
      content: String(f?.content ?? "").slice(0, 60000),
    }))
    .filter((f) => f.content.trim());
  return files.length ? { ...base, files, run: txt(raw.run, 300) } : null;
}
function cleanDiagram(base, raw) {
  if (FAMILY_DATA.has(raw.semanticType)) return cleanFamily(base, raw);
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
      weight: Number.isFinite(Number(e?.weight ?? e?.value))
        ? num(e?.weight ?? e?.value, 0, 0, 1e12)
        : undefined,
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
    semanticType: [
      "blocks",
      "steps",
      "tree_lr",
      "pyramid",
      "star",
      "comm_model",
      "fishbone",
      "swot",
      "layers_diagram",
      "cycle_diagram",
      "org_chart",
      "mind_map",
      "concept_map",
      "flowchart",
      "process_diagram",
      "system_diagram",
      "architecture_diagram",
      "scientific_diagram",
      "org_chart",
      "scientific_cross_section",
      "technical_plan",
      "site_plan",
      "piping_instrumentation",
      "electrical_single_line",
      "heat_flow_diagram",
      "energy_sankey",
      "network",
      "hierarchy",
      "circuit_diagram",
      "biological_diagram",
      "anatomy_diagram",
      "mechanical_diagram",
      "comparison_diagram",
      "layers_diagram",
      "cycle_diagram",
    ].includes(raw.semanticType)
      ? raw.semanticType
      : undefined,
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

const cleanPattern = (p) =>
  p && typeof p === "object" && ["linear", "grid", "radial"].includes(p.type)
    ? {
        type: p.type,
        count: Math.round(num(p.count, 1, 1, 600)),
        countX: Math.round(num(p.countX, 0, 0, 100)),
        step: Array.isArray(p.step)
          ? [0, 1, 2].map((i) => num(p.step[i], 0, -1e3, 1e3))
          : undefined,
        stepX: num(p.stepX, 1, -1e3, 1e3),
        stepZ: num(p.stepZ, 1, -1e3, 1e3),
        radius: num(p.radius, 1, 0, 1e3),
      }
    : undefined;

const SHAPE_OPS = new Set([
  "box",
  "cyl",
  "sphere",
  "dome",
  "cone",
  "capsule",
  "torus",
  "prism",
  "wedge",
  "lathe",
  "extrude",
  "loft",
  "tube",
  "hollow",
  "plate",
  "stairs",
  "rail",
  "truss",
  "group",
  "array",
  "mirror",
  "lib",
]);
const vecN = (v, len, d = 0) =>
  Array.isArray(v)
    ? Array.from({ length: len }, (_, i) => num(v[i], d, -1e4, 1e4))
    : undefined;
const polyOf = (v) => {
  const p = (Array.isArray(v) ? v : [])
    .slice(0, 60)
    .map((q) => [num(q?.[0], 0, -1e4, 1e4), num(q?.[1], 0, -1e4, 1e4)]);
  return p.length >= 3 ? p : null;
};
const pathOf = (v) => {
  const p = (Array.isArray(v) ? v : [])
    .slice(0, 60)
    .map((q) => [
      num(q?.[0], 0, -1e4, 1e4),
      num(q?.[1], 0, -1e4, 1e4),
      num(q?.[2], 0, -1e4, 1e4),
    ]);
  return p.length >= 2 ? p : null;
};
function cleanShape(n, depth = 0, budget = { n: 0 }) {
  if (
    !n ||
    typeof n !== "object" ||
    depth > 5 ||
    budget.n++ > 400 ||
    !SHAPE_OPS.has(n.op)
  )
    return null;
  const f = (v, d, lo = 0.001, hi = 1e4) => num(v, d, lo, hi),
    sz = (v, len) =>
      (vecN(v, len, 1) || Array(len).fill(1)).map((x) => Math.max(0.001, x));
  const o = {
    op: n.op,
    mat: n.mat ? txt(n.mat, 40) : undefined,
    at: vecN(n.at, 3),
    rot: vecN(n.rot, 3),
    scale: Array.isArray(n.scale)
      ? vecN(n.scale, 3, 1)
      : n.scale != null
        ? f(n.scale, 1, 0.01, 100)
        : undefined,
  };
  switch (n.op) {
    case "box":
      o.size = sz(n.size, 3);
      o.r = f(n.r, 0, 0, 100);
      break;
    case "cyl":
      o.r = f(n.r, 0.5);
      if (n.rt != null) o.rt = f(n.rt, 0.5, 0);
      if (n.rb != null) o.rb = f(n.rb, 0.5, 0);
      o.h = f(n.h, 1);
      break;
    case "sphere":
    case "dome":
      o.r = f(n.r, 0.5);
      break;
    case "cone":
    case "capsule":
      o.r = f(n.r, 0.5);
      o.h = f(n.h, 1);
      break;
    case "torus":
      o.R = f(n.R, 1);
      o.r = f(n.r, 0.1);
      break;
    case "prism":
      o.r = f(n.r, 0.5);
      o.h = f(n.h, 1);
      o.n = Math.round(f(n.n, 6, 3, 64));
      break;
    case "wedge":
      o.size = sz(n.size, 3);
      break;
    case "lathe":
      o.profile = (Array.isArray(n.profile) ? n.profile : [])
        .slice(0, 40)
        .map((p) => [num(p?.[0], 0.1, 0, 1e3), num(p?.[1], 0, -1e3, 1e3)]);
      if (o.profile.length < 2) return null;
      break;
    case "extrude":
      o.poly = polyOf(n.poly);
      if (!o.poly) return null;
      o.h = f(n.h, 1);
      o.bevel = f(n.bevel, 0, 0, 10);
      break;
    case "loft":
      o.sections = (Array.isArray(n.sections) ? n.sections : [])
        .slice(0, 24)
        .map((s) => ({ y: num(s?.y, 0, -1e3, 1e3), poly: polyOf(s?.poly) }))
        .filter((s) => s.poly);
      if (o.sections.length < 2) return null;
      break;
    case "tube":
      o.path = pathOf(n.path);
      if (!o.path) return null;
      o.r = f(n.r, 0.05);
      break;
    case "rail":
      o.path = pathOf(n.path);
      if (!o.path) return null;
      o.h = f(n.h, 1);
      break;
    case "hollow":
      o.size = sz(n.size, 3);
      o.t = f(n.t, 0.1, 0.001, 50);
      o.open = ["top", "bottom", "front", "back", "none"].includes(n.open)
        ? n.open
        : "top";
      o.r = f(n.r, 0, 0, 50);
      break;
    case "plate":
      o.size = sz(n.size, 2);
      o.t = f(n.t, 0.05, 0.001, 50);
      o.holes = (Array.isArray(n.holes) ? n.holes : [])
        .slice(0, 40)
        .map((h) => [
          num(h?.[0], 0, -1e3, 1e3),
          num(h?.[1], 0, -1e3, 1e3),
          f(h?.[2], 0.05),
        ]);
      break;
    case "stairs":
      o.n = Math.round(f(n.n, 10, 2, 60));
      o.w = f(n.w, 1, 0.1, 50);
      o.rise = f(n.rise, 0.18, 0.01, 5);
      o.run = f(n.run, 0.28, 0.01, 5);
      break;
    case "truss":
      o.from = vecN(n.from, 3);
      o.to = vecN(n.to, 3);
      o.w = f(n.w, 0.4, 0.05, 20);
      o.bays = Math.round(f(n.bays, 6, 2, 40));
      break;
    case "group":
      o.children = (Array.isArray(n.children) ? n.children : [])
        .slice(0, 60)
        .map((c) => cleanShape(c, depth + 1, budget))
        .filter(Boolean);
      break;
    case "array":
      o.of = cleanShape(n.of, depth + 1, budget);
      if (!o.of) return null;
      o.kind = ["linear", "grid", "radial"].includes(n.kind)
        ? n.kind
        : "linear";
      o.n = Math.round(f(n.n, 2, 1, 200));
      o.step = vecN(n.step, 3);
      o.nx = Math.round(f(n.nx, 0, 0, 50));
      o.sx = num(n.sx, 1, -100, 100);
      o.sz = num(n.sz, 1, -100, 100);
      o.r = f(n.r, 0, 0, 500);
      break;
    case "mirror":
      o.of = cleanShape(n.of, depth + 1, budget);
      if (!o.of) return null;
      o.axis = ["x", "y", "z"].includes(n.axis) ? n.axis : "x";
      break;
    case "lib":
      if (!LIB_NAMES.includes(n.name)) return null;
      o.name = n.name;
      o.params = Object.fromEntries(
        Object.entries(n.params && typeof n.params === "object" ? n.params : {})
          .slice(0, 8)
          .map(([k, v]) => [
            txt(k, 20),
            typeof v === "number" ? num(v, 0, -1e4, 1e4) : txt(v, 60),
          ]),
      );
      break;
  }
  return o;
}
function cleanScene(base, raw) {
  const preset = ["assembly", "geothermal"].includes(raw.preset)
    ? raw.preset
    : "";
  if (!preset) return null;
  const ids = new Set();
  const objects = (Array.isArray(raw.objects) ? raw.objects : [])
    .slice(0, 400)
    .map((object, index) => {
      object = Array.isArray(object?.position)
        ? {
            ...object,
            position: {
              x: object.position[0],
              y: object.position[1],
              z: object.position[2],
            },
          }
        : object;
      const id = ident(object?.id, `part${index + 1}`);
      if (ids.has(id)) return null;
      ids.add(id);
      return {
        id,
        label: txt(object?.label, 90) || `Pièce ${index + 1}`,
        detail: txt(object?.detail, 220),
        kind: txt(object?.kind, 48),
        material: txt(object?.material, 48) || undefined,
        primitive: [
          "box",
          "sphere",
          "cylinder",
          "cylindrical_shell",
          "stator",
          "rotor",
          "shaft",
          "bearing",
          "coil",
          "propeller",
          "atom",
          "cone",
          "plate",
        ].includes(object?.primitive)
          ? object.primitive
          : "box",
        scale: Array.isArray(object?.scale)
          ? [0, 1, 2].map((i) => num(object.scale[i], 1, 0.05, 20))
          : [1, 1, 1],
        positionProvided:
          object?.positionProvided === false
            ? false
            : !!object?.position &&
              ["x", "y", "z"].some((axis) =>
                Number.isFinite(Number(object.position[axis])),
              ),
        shape: cleanShape(object?.shape),
        lib: LIB_NAMES.includes(object?.lib) ? object.lib : undefined,
        material: object?.material ? txt(object.material, 40) : undefined,
        floating: object?.floating === true,
        role: txt(object?.role, 40) || undefined,
        parent: object?.parent ? ident(object.parent, "") : undefined,
        side: ["left", "right", "center"].includes(object?.side)
          ? object.side
          : undefined,
        placement: object?.placement === "manual" ? "manual" : undefined,
        major: object?.major === true,
        mirror: ["x", "y", "z"].includes(object?.mirror)
          ? object.mirror
          : undefined,
        rotation: Array.isArray(object?.rotation)
          ? [0, 1, 2].map((i) => num(object.rotation[i], 0, -360, 360))
          : undefined,
        pattern: cleanPattern(object?.pattern),
        params:
          object?.params && typeof object.params === "object"
            ? Object.fromEntries(
                Object.entries(object.params)
                  .slice(0, 12)
                  .map(([k, v]) => [
                    txt(k, 30),
                    typeof v === "number" && Number.isFinite(v)
                      ? v
                      : txt(v, 40),
                  ]),
              )
            : undefined,
        position: {
          x: num(object?.position?.x, 0, -100, 100),
          y: num(object?.position?.y, 0, -100, 100),
          z: num(object?.position?.z, 0, -100, 100),
        },
        color: hex(object?.color),
        depthRange: Array.isArray(object?.depthRange)
          ? object.depthRange
              .slice(0, 2)
              .map((value) => num(value, 0, -20000, 20000))
          : undefined,
        temperatureRange: Array.isArray(object?.temperatureRange)
          ? object.temperatureRange
              .slice(0, 2)
              .map((value) => num(value, 0, -300, 2000))
          : undefined,
        metadata:
          object?.metadata && typeof object.metadata === "object"
            ? object.metadata
            : undefined,
        dimensions:
          object?.dimensions && typeof object.dimensions === "object"
            ? Object.fromEntries(
                Object.entries(object.dimensions)
                  .slice(0, 14)
                  .map(([key, value]) => [
                    txt(key, 30),
                    typeof value === "number" && Number.isFinite(value)
                      ? value
                      : txt(value, 40),
                  ]),
              )
            : undefined,
      };
    })
    .filter(Boolean);
  if (objects.length < 2) return null;
  const relationships = (
    Array.isArray(raw.relationships) ? raw.relationships : []
  )
    .slice(0, 800)
    .map((item) => ({
      from: ident(item?.from, ""),
      to: ident(item?.to, ""),
      type: txt(item?.type, 48),
      label: txt(item?.label, 80),
    }))
    .filter(
      (item) => ids.has(item.from) && ids.has(item.to) && item.from !== item.to,
    );
  return {
    ...base,
    preset,
    detailLevel: ["overview", "standard", "detailed"].includes(raw.detailLevel)
      ? raw.detailLevel
      : "standard",
    domain: txt(raw.domain, 40) || undefined,
    simplifications: (Array.isArray(raw.simplifications)
      ? raw.simplifications
      : []
    )
      .slice(0, 8)
      .map((s) => txt(s, 160))
      .filter(Boolean),
    assemblyType:
      preset === "assembly"
        ? txt(raw.assemblyType, 48) || "technical_3d"
        : undefined,
    objects,
    relationships,
    exploded: raw.exploded === true,
    camera:
      raw.camera && typeof raw.camera === "object"
        ? {
            view: ["isometric", "front", "top", "side"].includes(
              raw.camera.view,
            )
              ? raw.camera.view
              : "isometric",
            zoom: num(raw.camera.zoom, 1, 0.5, 2.5),
          }
        : undefined,
    interaction:
      raw.interaction && typeof raw.interaction === "object"
        ? {
            zoom: raw.interaction.zoom !== false,
            pan: raw.interaction.pan !== false,
            rotate: raw.interaction.rotate !== false,
            selectable: raw.interaction.selectable !== false,
          }
        : undefined,
    scaleNote: txt(raw.scaleNote, 180),
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
    layers: (Array.isArray(raw.layers) ? raw.layers : [])
      .slice(0, 12)
      .map((layer, index) => ({
        id: ident(layer?.id, `layer${index + 1}`),
        label: txt(layer?.label, 60) || `Couche ${index + 1}`,
        objectIds: (Array.isArray(layer?.objectIds) ? layer.objectIds : [])
          .map((value) => ident(value, ""))
          .filter((value) => ids.has(value))
          .slice(0, 80),
        visible: layer?.visible !== false,
        opacity: num(layer?.opacity, 1, 0, 1),
      }))
      .filter((layer) => layer.objectIds.length),
    renderStyle: [
      "realistic",
      "semi",
      "clay",
      "toon",
      "flat",
      "matcap",
      "wire",
      "blueprint",
      "npr",
    ].includes(raw.renderStyle)
      ? raw.renderStyle
      : undefined,
    view: [
      "free",
      "iso",
      "axo",
      "p1",
      "p2",
      "p3",
      "ortho_front",
      "ortho_top",
      "ortho_side",
    ].includes(raw.view)
      ? raw.view
      : undefined,
    representation: [
      "solid",
      "lowpoly",
      "quad",
      "tri",
      "voxel",
      "scan",
      "splat",
      "sculpt",
    ].includes(raw.representation)
      ? raw.representation
      : undefined,
    lighting: ["studio", "sun", "ao", "fog", "flat"].includes(raw.lighting)
      ? raw.lighting
      : undefined,
    unitScale:
      raw.unitScale != null ? num(raw.unitScale, 1, 0.0001, 1e6) : undefined,
    unitLabel: txt(raw.unitLabel, 8) || undefined,
  };
}
function cleanMap(base, raw) {
  const markers = (Array.isArray(raw.markers) ? raw.markers : [])
    .slice(0, 300)
    .map((marker, index) => ({
      id: ident(marker?.id, `place${index + 1}`),
      label: txt(marker?.label || marker?.name, 100),
      detail: txt(marker?.detail || marker?.description, 240),
      longitude: num(
        marker?.longitude ?? marker?.lon ?? marker?.x,
        NaN,
        -180,
        180,
      ),
      latitude: num(marker?.latitude ?? marker?.lat ?? marker?.y, NaN, -90, 90),
      group: txt(marker?.group || marker?.category, 48),
    }))
    .filter(
      (marker) =>
        marker.label &&
        Number.isFinite(marker.longitude) &&
        Number.isFinite(marker.latitude),
    );
  if (!markers.length) return null;
  const routes = (Array.isArray(raw.routes) ? raw.routes : [])
    .slice(0, 100)
    .map((route, index) => ({
      id: ident(route?.id, `route${index + 1}`),
      label: txt(route?.label, 100),
      points: (Array.isArray(route?.points) ? route.points : [])
        .slice(0, 100)
        .map((point) => [
          num(point?.longitude ?? point?.lon ?? point?.[0], NaN, -180, 180),
          num(point?.latitude ?? point?.lat ?? point?.[1], NaN, -90, 90),
        ])
        .filter((point) => point.every(Number.isFinite)),
    }))
    .filter((route) => route.points.length >= 2);
  return {
    ...base,
    projection: raw.projection === "mercator" ? "mercator" : "equirectangular",
    markers,
    routes,
    provenance: txt(raw.provenance?.sourceDescription || raw.provenance, 220),
    scale: txt(raw.scale, 80),
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
    case "kpi":
      return {
        type: "kpi",
        items: (Array.isArray(b.items) ? b.items : [])
          .slice(0, 6)
          .map((i) => ({
            label: txt(i?.label, 40),
            value: txt(i?.value, 24),
            unit: txt(i?.unit, 12),
            note: txt(i?.note, 60),
          }))
          .filter((i) => i.label && i.value),
      };
    case "steps":
      return { type: "steps", items: list(b.items, 20, 260) };
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
  const KINDS_DOC = [
    "report",
    "design_file",
    "datasheet",
    "protocol",
    "spec",
    "architecture",
    "manual",
    "validation",
    "analysis",
    "brief",
    "guide",
    "lesson",
  ];
  return sections.length
    ? {
        ...base,
        kind: KINDS_DOC.includes(raw.kind) ? raw.kind : "report",
        meta:
          raw.meta && typeof raw.meta === "object"
            ? Object.fromEntries(
                Object.entries(raw.meta)
                  .slice(0, 8)
                  .map(([k, v]) => [txt(k, 24), txt(v, 80)]),
              )
            : undefined,
        sections,
      }
    : null;
}

/* ── Contrat envoyé au modèle ── */
export const ENGINE_TYPES_GUIDE = `TYPES D'ARTEFACTS (tu remplis des champs, le moteur gère rendu, mise en page et interactions) :
- plot : {type:"plot", title, xLabel, yLabel, equal?:bool, domain?:{x:[a,b],y?:[a,b]},
    functions:[{id,expr,label,domain?,dashed?}],
    points:[{id,label,x,y?,on?:fnId,draggable?,info?}], series?:[{id,label,mode:"line|scatter",points:[[x,y]]}],
    lines?:[{through:["A","B"],segment?,label?} | {slope,intercept} | {x:3} | {y:2}], vectors?:[{from:"A",to:"B",label}],
    auto?:{roots,extrema,yIntercept,intersections}}
  Les calculs dérivés ne sont montrés que s'ils sont pertinents et calculables à partir des données. N'ajoute aucune fonction aux points mesurés. Géométrie : equal:true lorsque les unités le permettent.
- diagram : {type:"diagram", semanticType?:"system_diagram|process_diagram|flowchart|architecture_diagram|scientific_diagram|scientific_cross_section|technical_plan|site_plan|piping_instrumentation|electrical_single_line|heat_flow_diagram|energy_sankey|mind_map|concept_map|network|hierarchy|circuit_diagram|biological_diagram|anatomy_diagram|mechanical_diagram|comparison_diagram", title, direction:"LR|TB", layout?:"layered|force",
    nodes:[{id,label,detail?,kind:"process|decision|data|actor|document|service|cloud|capsule|hexagon|circle|rounded",group?}],
    edges:[{from,to,label?,relation:"leads_to|depends_on|triggers|produces|contains|transforms|communicates|causes",weight?:number}], groups?:[{id,label,members:[ids]}]}
  Le semanticType est obligatoire dès qu'un schéma spécialisé est demandé; le moteur choisit symboles, traits, légendes et géométrie selon ce type. mind_map = branches courbes hiérarchiques; concept_map = concepts + relations nommées; architecture_diagram = couches/frontières; scientific_diagram = éléments physiques, forces/flux et unités; scientific_cross_section = couches stratifiées; technical_plan/site_plan = zones et implantations cotées; piping_instrumentation = symboles de pompe, vanne, instrument et circuits colorés; electrical_single_line = symboles électriques; heat_flow_diagram = transferts thermiques; energy_sankey = largeur des flux proportionnelle au champ weight (unité constante et bilan sourcé). Ne substitue pas un organigramme à ces types. Les kind nœuds décrivent les rôles sémantiques, pas seulement une forme générique.
- timeline : {type:"timeline", title, events:[{date,t?,label,detail?,kind?:"start|milestone|end"}]}
- probtree : {type:"probtree", title, root:{label,children:[{label,p,children:[]}]}, events?:[{label,where:[]}]} (p = nombre, fraction ou pourcentage; n'indique un calcul que si les données le permettent)
- scene3d : {type:"scene3d", title, preset:"assembly|geothermal", objects:[{id,label,detail?,kind,primitive,scale:[x,y,z],position:{x,y,z},color?,depthRange?,temperatureRange?,metadata?}], relationships:[{from,to,type,label?}], layers?:[{id,label,objectIds,visible,opacity}], exploded?:bool,camera?,annotations?,interaction?}. Compose une nomenclature sémantique et spatiale propre au sujet; pour une scène technique détaillée, décris les sous-ensembles réellement constitutifs (souvent 12–40 objets distincts si le sujet s'y prête), des dimensions relatives cohérentes, des positions et relations qui relient chaque pièce. kind conserve le nom physique précis (ex. containment, reactor_vessel, reactor_core, steam_generator, pressurizer, primary_pump, turbine, alternator, condenser, cooling_tower, transformer, fuel_assembly; ou rack, server, network_switch, cooling_unit pour un centre informatique); les noms sont une bibliothèque de géométries adaptatives, pas un modèle à injecter. Le renderer ne remplit aucune pièce manquante, aucune relation et aucun fait. Le type 3D seul ne justifie aucun objet ni preset. Donne à chaque pièce un id stable afin que les schémas associés puissent réutiliser ces ids.
- map : {type:"map",title,projection:"equirectangular|mercator",markers:[{id,label,detail?,longitude,latitude,group?}],routes:[{id,label?,points:[[longitude,latitude],…]}],provenance?,scale?}. Coordonnées réelles seulement, jamais de géolocalisation inventée; la carte rend les données fournies sans fond cartographique externe.
- diagram3d (Chat) : {type:"diagram3d", title, summary, nodes:[{id,label,detail,group}], edges:[{from,to,label}]}. Pour une vue en perspective ou éclatée, nomme les éléments et relations correspondant au sujet.
- sheet : {type:"sheet", title, columns:[…], rows:[[…]]}  (cellules "=SOMME(B2:B5)" autorisées)
- doc : {type:"doc", title, summary?, sections:[{id,title,level?:2|3,blocks:[
    {type:"text",md}, {type:"list",ordered?,items:[…]}, {type:"callout",tone:"info|warn|success",title?,md},
    {type:"quote",md,cite?}, {type:"table",title?,columns,rows}, {type:"formula",tex,label?}, {type:"code",lang,code},
    {type:"artifact",artifact:{plot|diagram|timeline|probtree|scene3d|sheet…},caption?}]}]}
  Pour tout cours, corrigé, rapport ou dossier demandé comme livrable : un doc structuré et les figures intégrées en blocs artifact.
Autres types (formats habituels) : table {columns,rows} · chart (barres) {chartType:"bar",unit,points:[{label,value}]} · decision {recommendation,confidence,rationale,criteria,options:[{label,detail,benefit,risk}],nextSteps:[{title,detail}]} · debate {for,against,verdict} · perspectives {views:[{role,position,risk}],consensus} · plan {items:[{title,detail}]} · presentation {slides:[{title,body,bullets}]}.`;

export const ENGINE_CONTRACT_V3 = `

DIRECTION VISUELLE V3 — qualité « bureau d'études »
A. CHOIX DU FORMAT (diagram.semanticType) : décide d'après la STRUCTURE des données, jamais par défaut.
- hiérarchie de personnes/services → org_chart : nodes avec parent ; detail = fonction ; group = département ; edges hors hiérarchie = liens transverses (label).
- idée centrale + branches → mind_map : nodes avec parent, 2 à 4 niveaux, labels courts. Concepts reliés par des verbes → concept_map (edges avec label).
- échanges chronologiques entre acteurs → sequence_diagram {lifelines:[{id,label,kind:"actor|system"}], messages:[{from,to,label,type:"sync|async|return|self",note?}]}
- cycle de vie / modes de fonctionnement → state_diagram {states:[{id,label,kind:"start|state|choice|end",detail?}], transitions:[{from,to,label}]}
- tables ou classes → er_diagram | class_diagram {entities:[{id,name,stereotype?,fields:[{name,type,key:"pk|fk"}],methods?:[]}], relations:[{from,to,label,card:["1","N"],kind:"assoc|inherit"}]}
- positionnement selon 2 critères → quadrant {axes:{xLabel,yLabel,x:["faible","fort"],y:["faible","fort"]}, quadrants:[hautGauche,hautDroite,basGauche,basDroite], items:[{id,label,x:0..1,y:0..1,group?}]}
- intersections d'ensembles → venn {sets:[{id,label,items:[]}], overlaps:[{sets:[ids],label}]} (2 ou 3 ensembles).
- couches/services → architecture_diagram (groups = zones, kind = rôle) ; dispositif expérimental → scientific_diagram ; P&ID, électrique, thermique, Sankey : types déjà listés.
- flowchart/process_diagram UNIQUEMENT pour un algorithme ou une procédure à décisions. Un organigramme n'est jamais la réponse par défaut.

B. 3D (scene3d) : le moteur construit des géométries paramétriques ; tu fournis la nomenclature, pas les formes.
- Chaque objet : id stable, label précis, role (fuselage|wing|hstab|fin|engine|gear|cockpit|flap|cog|spring|housing|pcb|chip|capacitor|connector|slab|column|wall|roof|stairs|foundation|membrane|nucleus|mito|golgi|tank|pipe|valve ou un nom précis), side:"left|right" si pertinent, dimensions réelles dans UNE SEULE unité pour toute la scène (length, span, diameter, height, width, depth, thickness, chord), params (teeth, cylinders, turns, steps…).
- Répétitions : pattern {type:"linear|grid|radial",count,step:[x,y,z] | countX,stepX,stepZ | radius}. Symétries : mirror:"z". Sous-ensembles : parent:"id".
- Laisse position vide pour un placement automatique cohérent ; ne mets placement:"manual" et des positions que si tu les connais. Ne mets jamais toutes les pièces à (0,0,0).
- Une scène technique décrit 12 à 60 pièces réellement constitutives. major:true sur au plus 10 pièces à étiqueter. Déclare detailLevel (overview|standard|detailed), domain et simplifications (liste de ce qui est volontairement simplifié).
- Exemple (avion) : objects:[{id:"fus",label:"Fuselage",role:"fuselage",dimensions:{length:37,diameter:4},major:true},{id:"wl",label:"Aile gauche",role:"wing",side:"left",dimensions:{span:34,chord:6},major:true},{id:"hs",label:"Stabilisateur horizontal",role:"hstab",dimensions:{span:12}},{id:"fn",label:"Dérive",role:"fin",dimensions:{height:6}},{id:"el",label:"Moteur gauche",role:"engine",side:"left",dimensions:{length:4.5,diameter:2.4},major:true},{id:"gn",label:"Train avant",role:"gear"},{id:"gm",label:"Trains principaux",role:"gear",dimensions:{height:3.2}},{id:"fl",label:"Volets",role:"flap"}], relationships:[{from:"wl",to:"el",type:"carries"}].

C. DOCUMENTS (doc) : renseigne kind (report|design_file|datasheet|protocol|spec|architecture|manual|validation|analysis|brief|guide|lesson) et meta {Référence, Version, Statut, Auteur}. Un dossier technique = résumé → contexte/hypothèses → sections avec un bloc artifact par figure demandée (3D, schéma, courbe) → blocs kpi pour les chiffres clés → steps pour les procédures → tableaux de vérification → limites. Réutilise les mêmes artefacts que le chat, sans les redécrire.

D. AUTOCONTRÔLE avant d'émettre le JSON : (1) le format est-il dicté par la structure des données ? (2) chaque pièce 3D est-elle nommée, dimensionnée et reliée ? (3) aucune pièce, valeur ou relation inventée sans l'indiquer dans simplifications ? (4) le texte de réponse répond à chaque question sans renvoyer au visuel ?`;
export const ENGINE_CONTRACT = `RÈGLES DE SORTIE (impératives)
1. Formules : toujours en LaTeX entre $…$ (inline) ou $$…$$ (bloc). Jamais de formule en texte brut, jamais "[object …]".
2. Interdit : schémas ASCII, graphiques dessinés avec | + - /, scripts ou blocs de code pour "dessiner". Si une figure aide, remplis un artefact adapté au sujet.
3. Le bloc [[AIGENT_DATA]]…[[/AIGENT_DATA]] (orthographe exacte, avec underscore) contient UNIQUEMENT du JSON valide, placé à la toute fin, jamais évoqué dans le texte.
4. Format du bloc : {"artifact":{…},"recommendedMode":"think","suggestions":["…","…"],"title":"titre court de la conversation"}. "recommendedMode" ∈ think|advisor|decide|debate|perspectives|create, jamais un type d'artefact.
5. Si l'utilisateur demande une fonction, un schéma, un arbre, une frise, un tableau, un tableur, un document ou une scène 3D, tu REMPLIS l'artefact complet. Tu ne le remplaces JAMAIS par du texte, un tableau simplifié ou une description. Le texte de réponse reste développé : il répond à chaque question, interprète les données, explicite les calculs et leurs unités, distingue constats, hypothèses et limites, puis donne des conclusions proportionnées. Pour une étude, un diagnostic ou un dossier technique, rédige une synthèse explicite avant le livrable, puis analyse les résultats, incertitudes et vérifications nécessaires. Chaque question reçoit une réponse textuelle, même si un document est généré; le document complète cette analyse et ne la remplace jamais par « voir le document ».
6. Un dossier peut réunir toutes les représentations demandées et celles réellement utiles, sans plafond arbitraire de deux figures. Regroupe-les dans un document structuré avec une section distincte, un titre explicite et un bloc artifact complet par représentation. Ne duplique pas le même schéma sous plusieurs noms et n'omets aucun type explicitement demandé faute de place.

${ENGINE_TYPES_GUIDE}

CONTRAT VISUEL V2 — le catalogue fourni par le serveur définit les types. Pour chaque demande, déduis le document du message courant, renseigne uniquement des éléments appuyés par la demande, les données ou une inférence explicitement qualifiée. N'introduis aucun objet, domaine, valeur, courbe, relation, seuil ou exemple prédéfini. Si des mesures sont disponibles, reprends les points tels quels et sépare les variables ayant des unités différentes. Si une donnée manque, laisse-la inconnue ou indique l'hypothèse au lieu de la compléter. Le renderer ne crée aucun contenu sémantique. Les exports sont générés par l'application; ne fournis jamais un script à la place du livrable. ${ENGINE_CONTRACT_V3}`;

export const ENGINE_CONTRACT_V4 = `

FAMILLES DE SCHÉMAS SUPPLÉMENTAIRES (diagram.semanticType) — données propres à chaque famille :
- flowchart : nodes (kind:"decision" pour un choix, "capsule" début/fin, "data" entrée/sortie) + edges avec label "Oui"/"Non" ; les boucles de retour sont autorisées.
- concept_map : nodes + edges avec label = verbe de liaison ; les liens hors arbre s'affichent en croisés.
- network : nodes (group = communauté) + edges avec weight. cycle_diagram : nodes + edges formant une boucle unique. layers_diagram : nodes avec group = nom de la strate.
- gantt : {tasks:[{id,label,start,duration,group?,deps?:[ids],milestone?,progress?:0..1}], unit:"jours|semaines|mois"} (start et duration en unités de l'échelle).
- sankey_diagram : {flows:[{from,to,value}], labels:{id:"Libellé"}, unit:"MW"} ; les flux doivent respecter la conservation (entrées = sorties + pertes ; nomme « Pertes » les pertes).
- electrical_circuit : {source:{type,label,value}, stages:[{type,label,value} | {parallel:[{type,label,value},…]}]} ; types : battery, resistor, capacitor, inductor, switch, diode, led, lamp, fuse, ammeter, voltmeter, motor, ac.
- hydraulic_circuit : même forme ; types : pump, tank, valve, check, throttle, filter, cylinder, gauge.
- heatmap : {rows:[], cols:[], values:[[…]], unit, min?, max?} (null si inconnu). forces_diagram : {body:{label,shape:"block|sphere|beam"}, forces:[{label,angle,magnitude,unit,point?}]} (angle en degrés, 0 = vers la droite) ; la résultante est calculée par le moteur.
- transit_map : {stations:[{id,label}], lines:[{id,label,color,stations:[ids dans l'ordre]}]} ; une station présente dans deux lignes est une correspondance.
Règle : ne jamais inventer de valeur de mesure ; une valeur illustrative doit être indiquée comme telle dans summary.

CODE ET SCRIPTS : tout code de plus de 5 lignes est livré dans un artefact {type:"code", title, files:[{path,lang,content}], run:"commande pour l'exécuter"} — jamais recopié dans le texte de réponse, qui explique ce que fait le code, ses hypothèses et comment le lancer. Code complet, exécutable, commenté sobrement. ${schemaContract()}`;
