//======================================================================//
//  AiGENT — contrat de site v2 : validation, normalisation, données.
//  Tout ce que l'IA propose passe ici. Rien n'est utilisé tel quel.
//======================================================================//

const FIELD_KINDS = new Set([
  "text",
  "longtext",
  "number",
  "date",
  "enum",
  "relation",
  "email",
  "boolean",
]);
const VIEW_TYPES = new Set([
  "table",
  "board",
  "list",
  "stats",
  "chart",
  "form",
  "text",
  "profile",
]);
export const ICON_NAMES = [
  "home",
  "list",
  "check",
  "users",
  "file",
  "calendar",
  "chart",
  "inbox",
  "message",
  "folder",
  "settings",
  "user",
  "search",
  "tag",
  "clock",
  "star",
  "shield",
  "book",
  "wallet",
  "map",
];
const KEY_RE = /^[a-z][a-z0-9_]*$/;
const STORAGE_TO_KIND = {
  number: "number",
  date: "date",
  richtext: "longtext",
  text: "text",
};

const clean = (v, max) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
export const slug = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/* ── Entités : le plan (ids, clés) fait foi, l'IA enrichit les types ── */
export function buildEntities(planEntities, raw) {
  const meta =
    raw && typeof raw.entities === "object" && raw.entities ? raw.entities : {};
  const ids = new Set(planEntities.map((e) => e.id));

  return planEntities.map((pe) => {
    const m = meta[pe.id] && typeof meta[pe.id] === "object" ? meta[pe.id] : {};
    const fm = m.fields && typeof m.fields === "object" ? m.fields : {};
    const used = new Set();
    const fields = [];

    const push = (key, label, kindIn, src) => {
      if (
        !KEY_RE.test(key) ||
        used.has(key) ||
        key === "ref" ||
        fields.length >= 14
      )
        return;
      used.add(key);
      const f = {
        key,
        label: clean(label, 48) || key,
        kind: FIELD_KINDS.has(kindIn) ? kindIn : "text",
      };
      if (f.kind === "enum") {
        const options = [
          ...new Set(
            (Array.isArray(src.options) ? src.options : [])
              .map((o) => clean(o, 32))
              .filter(Boolean),
          ),
        ].slice(0, 8);
        if (options.length >= 2) f.options = options;
        else f.kind = "text";
      }
      if (f.kind === "relation") {
        if (ids.has(src.target) && src.target !== pe.id) f.target = src.target;
        else f.kind = "text";
      }
      if (src.required === true) f.required = true;
      fields.push(f);
    };

    for (const pf of pe.fields) {
      const src =
        fm[pf.key] && typeof fm[pf.key] === "object" ? fm[pf.key] : {};
      push(
        pf.key,
        src.label || pf.label,
        FIELD_KINDS.has(src.kind)
          ? src.kind
          : STORAGE_TO_KIND[pf.type] || "text",
        src,
      );
    }
    for (const nf of (Array.isArray(m.addFields) ? m.addFields : []).slice(
      0,
      4,
    )) {
      if (nf && typeof nf === "object")
        push(clean(nf.key, 40), nf.label, nf.kind, nf);
    }

    const textual = fields.filter(
      (f) => f.kind === "text" || f.kind === "email",
    );
    const titleField =
      fields.find(
        (f) =>
          f.key === m.titleField && (f.kind === "text" || f.kind === "email"),
      )?.key ||
      textual[0]?.key ||
      fields[0]?.key;
    const enums = fields.filter((f) => f.kind === "enum");
    const statusField =
      enums.find((f) => f.key === m.statusField)?.key ||
      enums.find((f) => /status|statut|etat|state/.test(f.key))?.key ||
      null;
    const title = fields.find((f) => f.key === titleField);
    if (title) title.required = true;

    fields.push({ key: "ref", label: "Référence", kind: "ref" });
    return {
      id: pe.id,
      label: clean(pe.label, 48) || pe.id,
      plural: clean(m.plural, 48) || `${clean(pe.label, 46)}s`,
      titleField,
      statusField,
      fields,
    };
  });
}

/** Ce que le serveur généré (SRV_ENTITIES) sait valider : text | number | date | richtext. */
export function toStorageEntities(entities) {
  return entities.map((e) => ({
    id: e.id,
    label: e.label,
    fields: e.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type:
        f.kind === "number"
          ? "number"
          : f.kind === "date"
            ? "date"
            : f.kind === "longtext"
              ? "richtext"
              : "text",
    })),
  }));
}

/* ── Vues ── */
function cleanCard(c, ent) {
  if (!c || typeof c !== "object") return null;
  const e = ent.get(c.entity);
  const label = clean(c.label, 40);
  if (!e || !label) return null;
  const agg = ["count", "sum", "avg"].includes(c.agg) ? c.agg : "count";
  let field = null;
  if (agg !== "count") {
    field =
      e.fields.find((f) => f.key === c.field && f.kind === "number")?.key ||
      null;
    if (!field) return null;
  }
  let where = null;
  if (c.where && typeof c.where === "object") {
    const wf = e.fields.find(
      (f) => f.key === c.where.field && f.kind === "enum",
    );
    if (wf && wf.options.includes(c.where.equals))
      where = { field: wf.key, equals: c.where.equals };
  }
  return { label, entity: e.id, agg, field, where, unit: clean(c.unit, 10) };
}

function cleanView(v, ent) {
  if (!v || typeof v !== "object" || !VIEW_TYPES.has(v.type)) return null;
  const t = v.type;
  const title = clean(v.title, 60);
  if (t === "profile") return { type: t };
  if (t === "text") {
    const body = typeof v.body === "string" ? v.body.trim().slice(0, 900) : "";
    return body ? { type: t, title, body } : null;
  }
  if (t === "stats") {
    const cards = (Array.isArray(v.cards) ? v.cards : [])
      .map((c) => cleanCard(c, ent))
      .filter(Boolean)
      .slice(0, 6);
    return cards.length ? { type: t, title, cards } : null;
  }
  const e = ent.get(v.entity);
  if (!e) return null;
  const keys = new Set(e.fields.map((f) => f.key));
  if (t === "table") {
    return {
      type: t,
      entity: e.id,
      title,
      columns: (Array.isArray(v.columns) ? v.columns : [])
        .filter((k) => keys.has(k) && k !== "ref")
        .slice(0, 6),
    };
  }
  if (t === "board" || t === "chart") {
    const g = e.fields.find(
      (f) => f.key === (v.groupBy || e.statusField) && f.kind === "enum",
    );
    return g ? { type: t, entity: e.id, title, groupBy: g.key } : null;
  }
  if (t === "list") return { type: t, entity: e.id, title };
  if (t === "form")
    return {
      type: t,
      entity: e.id,
      title,
      submitLabel: clean(v.submitLabel, 30),
    };
  return null;
}

const iconFor = (p) =>
  ({
    dashboard: "home",
    list: "list",
    form: "file",
    chat: "message",
    settings: "settings",
    profile: "user",
    workspace: "folder",
  })[p.kind] || "folder";

/** Vues par défaut d'UNE page seulement (jamais d'un site entier). */
function defaultViews(p, entities) {
  const e = entities.find((x) => x.id === p.entity);
  if (p.kind === "form" && e)
    return [
      { type: "form", entity: e.id, title: p.label, submitLabel: "Envoyer" },
    ];
  if (e) return [{ type: "table", entity: e.id, title: "", columns: [] }];
  if (entities.length && (p.kind === "dashboard" || p.kind === "workspace")) {
    return [
      {
        type: "stats",
        title: "",
        cards: entities
          .slice(0, 4)
          .map((x) => ({
            label: x.plural,
            entity: x.id,
            agg: "count",
            field: null,
            where: null,
            unit: "",
          })),
      },
      {
        type: "table",
        entity: entities[0].id,
        title: entities[0].plural,
        columns: [],
      },
    ];
  }
  const body =
    (p.features || [])
      .map((f) => f.description || f.label)
      .filter(Boolean)
      .join("\n") || p.label;
  return [{ type: "text", title: p.label, body }];
}

export function buildPages(plan, entities, raw) {
  const rawPages =
    raw && raw.pages && typeof raw.pages === "object" ? raw.pages : {};
  const ent = new Map(entities.map((e) => [e.id, e]));
  const order = new Map((plan.nav || []).map((id, i) => [id, i]));
  const defaulted = [];
  let authPath = null;
  const pages = [];

  for (const p of plan.pages) {
    if (p.kind === "auth") {
      authPath = p.path;
      continue;
    }
    const m =
      rawPages[p.id] && typeof rawPages[p.id] === "object"
        ? rawPages[p.id]
        : {};
    let views = (Array.isArray(m.views) ? m.views : [])
      .map((v) => cleanView(v, ent))
      .filter(Boolean)
      .slice(0, 4);
    if (p.kind === "profile" || p.kind === "settings")
      views = [{ type: "profile" }];
    // A dashboard with only KPI cards reads as an unfinished blank page.
    // Keep the model's chosen cards, then add the most relevant live records.
    if (p.kind === "dashboard" && entities.length) {
      const hasRecordsView = views.some((view) => ["table", "list", "board", "chart"].includes(view.type));
      if (!hasRecordsView) {
        const entity = entities.find((item) => item.id === p.entity) || entities[0];
        views = [...views, { type: "table", entity: entity.id, title: `Derniers ${entity.plural.toLowerCase()}`, columns: [] }].slice(0, 5);
      }
    }
    if (!views.length) {
      views = defaultViews(p, entities);
      defaulted.push(p.id);
    }
    pages.push({
      id: p.id,
      path: p.path,
      label: clean(p.label, 40),
      title: clean(m.title, 70) || clean(p.label, 70),
      description: clean(m.description, 200),
      icon: ICON_NAMES.includes(m.icon) ? m.icon : iconFor(p),
      section: clean(m.section, 24),
      auth: !!p.auth,
      views,
    });
  }
  pages.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));

  const nav = [];
  for (const p of pages) {
    let sec = nav.find((s) => s.title === p.section);
    if (!sec) {
      sec = { title: p.section, pages: [] };
      nav.push(sec);
    }
    sec.pages.push(p.id);
  }
  const authEnabled =
    pages.some((p) => p.auth) || !!authPath || plan.authRequired === true;
  return {
    pages,
    nav,
    defaulted,
    auth: { enabled: authEnabled, path: authPath || "/login" },
  };
}

/* ── Données de démonstration ── */
export function cleanSeed(entity, raw, refs) {
  const rows = (
    Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : []
  ).slice(0, 8);
  const seen = new Set();
  const out = [];
  rows.forEach((r, i) => {
    if (!r || typeof r !== "object") return;
    const row = {};
    for (const f of entity.fields) {
      if (f.key === "ref") continue;
      let v = r[f.key];
      if (v == null || v === "") continue;
      switch (f.kind) {
        case "number":
          v = Number(v);
          if (!Number.isFinite(v)) continue;
          break;
        case "date":
          v = String(v).slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
          break;
        case "enum":
          v = f.options.includes(String(v)) ? String(v) : f.options[0];
          break;
        case "relation": {
          const pool = refs[f.target] || [];
          v = pool.includes(String(v))
            ? String(v)
            : pool.length
              ? pool[i % pool.length]
              : null;
          break;
        }
        case "boolean":
          v = v === true || v === "true" ? "true" : "false";
          break;
        default:
          v = String(v)
            .trim()
            .slice(0, f.kind === "longtext" ? 800 : 200);
      }
      if (v == null || v === "") continue;
      row[f.key] = v;
    }
    if (!row[entity.titleField]) return;
    let ref = slug(r.ref) || slug(row[entity.titleField]) || `item-${i + 1}`;
    while (seen.has(ref)) ref += `-${i + 1}`;
    seen.add(ref);
    row.ref = ref;
    out.push(row);
  });
  return out;
}

/** Ordre de génération : une entité après celles qu'elle référence. */
export function seedOrder(entities) {
  const done = [];
  const left = [...entities];
  while (left.length) {
    const i = left.findIndex((e) =>
      e.fields.every(
        (f) => f.kind !== "relation" || done.some((d) => d.id === f.target),
      ),
    );
    done.push(left.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return done;
}

/** Contrôle final : un contrat incohérent n'atteint jamais le runtime. */
export function assertContract(contract) {
  const ids = new Set(contract.entities.map((e) => e.id));
  if (!contract.pages.length)
    throw new Error("Le contrat ne contient aucune page.");
  for (const p of contract.pages) {
    if (!p.views.length)
      throw new Error(`La page « ${p.label} » n'a aucune vue.`);
    for (const v of p.views)
      if (v.entity && !ids.has(v.entity))
        throw new Error(
          `La page « ${p.label} » référence une entité inconnue (${v.entity}).`,
        );
  }
  for (const e of contract.entities)
    if (!e.titleField)
      throw new Error(`L'entité « ${e.label} » n'a pas de champ titre.`);
}

export const serializeForScript = (o) =>
  JSON.stringify(o)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
