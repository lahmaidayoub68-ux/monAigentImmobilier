/* ══════════════════════════════════════════════════════════════════
   aigent-design.js — personnalisation du site produit (isomorphe)
   Importé par aigent.js (navigateur) ET par le serveur / générateur.
   ══════════════════════════════════════════════════════════════════ */

export const FONTS = {
  inter: {
    label: "Inter",
    stack: "'Inter', system-ui, sans-serif",
    g: "Inter:wght@400;500;600;700",
  },
  manrope: {
    label: "Manrope",
    stack: "'Manrope', system-ui, sans-serif",
    g: "Manrope:wght@400;500;600;700",
  },
  poppins: {
    label: "Poppins",
    stack: "'Poppins', system-ui, sans-serif",
    g: "Poppins:wght@400;500;600;700",
  },
  dmsans: {
    label: "DM Sans",
    stack: "'DM Sans', system-ui, sans-serif",
    g: "DM+Sans:wght@400;500;600;700",
  },
  jakarta: {
    label: "Jakarta",
    stack: "'Plus Jakarta Sans', system-ui, sans-serif",
    g: "Plus+Jakarta+Sans:wght@400;500;600;700",
  },
  playfair: {
    label: "Playfair",
    stack: "'Playfair Display', Georgia, serif",
    g: "Playfair+Display:wght@400;500;600;700",
  },
  lora: {
    label: "Lora",
    stack: "'Lora', Georgia, serif",
    g: "Lora:wght@400;500;600;700",
  },
  system: {
    label: "Système",
    stack: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    g: null,
  },
};

export const SECTIONS = [
  { id: "hero", label: "Hero", blocks: ["hero"] },
  { id: "about", label: "Présentation", blocks: ["spotlight", "split-media"] },
  {
    id: "services",
    label: "Services",
    blocks: [
      "feature-grid",
      "list-preview",
      "entity-list-preview",
      "comparison-table",
    ],
  },
  {
    id: "how",
    label: "Fonctionnement",
    blocks: ["timeline-vertical", "steps-numbered", "progress-tracker"],
  },
  {
    id: "stats",
    label: "Chiffres clés",
    blocks: ["stat-band", "dashboard-cards"],
  },
  { id: "testimonials", label: "Témoignages", blocks: ["quote-block"] },
  { id: "gallery", label: "Galerie", blocks: ["media-gallery"] },
  { id: "pricing", label: "Tarifs", blocks: ["pricing-table"] },
  { id: "faq", label: "FAQ", blocks: ["faq-accordion"] },
  {
    id: "contact",
    label: "Contact",
    blocks: ["cta-band", "banner-note", "chat-launcher-inline"],
  },
  { id: "footer", label: "Pied de page", blocks: [] },
];
const SECTION_OF = {};
SECTIONS.forEach((s) => s.blocks.forEach((b) => (SECTION_OF[b] = s.id)));

/** « Style général » : un raccourci qui règle plusieurs curseurs d'un coup. */
/** « Style global » : un raccourci qui règle plusieurs groupes de réglages d'un coup. */
export const MOODS = {
  minimal: {
    label: "Minimal",
    patch: {
      type: { font: "inter", weight: 500 },
      layout: {
        radius: "square",
        shadow: "none",
        border: "thin",
        spacing: "airy",
        cards: "outline",
        buttons: "solid",
        btnShape: "auto",
        divider: "line",
      },
      fx: {
        contrast: "balanced",
        texture: "none",
        backdrop: "plain",
        hover: "none",
      },
      nav: { style: "classic" },
    },
  },
  luxe: {
    label: "Luxe",
    patch: {
      type: { font: "playfair", weight: 500 },
      layout: {
        radius: "square",
        shadow: "none",
        border: "thin",
        spacing: "airy",
        cards: "outline",
        buttons: "outline",
        btnShape: "square",
        divider: "line",
      },
      fx: {
        contrast: "soft",
        texture: "none",
        backdrop: "plain",
        hover: "lift",
      },
      nav: { style: "classic" },
    },
  },
  brutalist: {
    label: "Brutaliste",
    patch: {
      type: { font: "manrope", weight: 700 },
      layout: {
        radius: "square",
        shadow: "none",
        border: "double",
        spacing: "balanced",
        cards: "outline",
        buttons: "solid",
        btnShape: "square",
        divider: "line",
      },
      fx: {
        contrast: "strong",
        texture: "none",
        backdrop: "plain",
        hover: "none",
      },
      nav: { style: "classic" },
    },
  },
  editorial: {
    label: "Éditorial",
    patch: {
      type: { font: "lora", weight: 500 },
      layout: {
        radius: "square",
        shadow: "none",
        border: "thin",
        spacing: "airy",
        cards: "outline",
        buttons: "outline",
        btnShape: "auto",
        divider: "line",
      },
      fx: {
        contrast: "balanced",
        texture: "paper",
        backdrop: "plain",
        hover: "none",
      },
      nav: { style: "classic" },
    },
  },
  futuristic: {
    label: "Futuriste",
    patch: {
      type: { font: "jakarta", weight: 600 },
      layout: {
        radius: "soft",
        shadow: "glow",
        border: "thin",
        spacing: "balanced",
        cards: "glass",
        buttons: "solid",
        btnShape: "auto",
        divider: "none",
      },
      fx: {
        contrast: "strong",
        texture: "none",
        backdrop: "mesh",
        hover: "glow",
      },
      nav: { style: "glass" },
    },
  },
  soft: {
    label: "Soft",
    patch: {
      type: { font: "poppins", weight: 500 },
      layout: {
        radius: "round",
        shadow: "soft",
        border: "none",
        spacing: "balanced",
        cards: "float",
        buttons: "solid",
        btnShape: "pill",
        divider: "none",
      },
      fx: {
        contrast: "soft",
        texture: "none",
        backdrop: "gradient",
        hover: "lift",
      },
      nav: { style: "classic" },
    },
  },
  glass: {
    label: "Glass",
    patch: {
      type: { font: "dmsans", weight: 500 },
      layout: {
        radius: "round",
        shadow: "soft",
        border: "thin",
        spacing: "balanced",
        cards: "glass",
        buttons: "solid",
        btnShape: "auto",
        divider: "none",
      },
      fx: {
        contrast: "balanced",
        texture: "none",
        backdrop: "mesh",
        hover: "lift",
      },
      nav: { style: "glass" },
    },
  },
  organic: {
    label: "Organique",
    patch: {
      type: { font: "lora", weight: 500 },
      layout: {
        radius: "organic",
        shadow: "soft",
        border: "none",
        spacing: "airy",
        cards: "filled",
        buttons: "solid",
        btnShape: "pill",
        divider: "none",
      },
      fx: {
        contrast: "soft",
        texture: "paper",
        backdrop: "gradient",
        hover: "lift",
      },
      nav: { style: "classic" },
    },
  },
};

export const DESIGN_DEFAULTS = () => ({
  colors: {
    accent: "#3D8BFD",
    accentTo: null,
    gradient: false,
    bg: "#FFFFFF",
    text: "#101114",
    header: null,
    mode: "light",
  },
  brand: { logo: null, favicon: null },
  type: { font: "inter", weight: 600, scale: 100 },
  mood: "minimal",
  icons: "line",
  layout: {
    width: "standard",
    spacing: "balanced",
    radius: "soft",
    shadow: "soft",
    border: "thin",
    align: "left",
    density: "balanced",
    cards: "outline",
    buttons: "solid",
    btnShape: "auto",
    hero: "standard",
    cut: "straight",
    divider: "line",
  },
  fx: {
    contrast: "balanced",
    texture: "none",
    backdrop: "plain",
    reveal: "none",
    speed: "normal",
    hover: "none",
    spot: false,
  },
  nav: {
    mode: "horizontal",
    logo: "left",
    style: "classic",
    scroll: "fixed",
    height: "standard",
    cta: true,
    ctaLabel: "Prendre rendez-vous",
    maxLinks: 5,
  },
  media: {
    heroImage: null,
    heroMode: "none",
    heroFocus: "center",
    aboutImage: null,
    shape: "rounded",
    ratio: "16/10",
    showPhotos: true,
    treatment: "natural",
  },
  content: {
    title: "",
    subtitle: "",
    cta: "",
    testimonial: { quote: "", author: "" },
    keyPoints: [],
    faq: [],
    address: "",
    phone: "",
    email: "",
    social: "",
  },
  sections: SECTIONS.map((s) => ({ id: s.id, enabled: true })),
  agent: {
    position: "right",
    autoOpen: false,
    name: "",
    avatar: null,
    greeting: "",
    tone: "professional",
    formality: "vous",
    collectEmail: true,
    collectPhone: false,
    booking: false,
    maxQuestions: 3,
    afterMsg: "",
  },
  responsive: {
    stickyCta: false,
    hideHero: false,
    textScale: 100,
    navMobile: "hamburger",
  },
  edits: {},
});

/* ── Validation : SEUL point d'entrée de ce que l'utilisateur envoie ── */
const HEX = /^#[0-9a-fA-F]{6}$/;
const IMG =
  /^data:image\/(png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/;
const hex = (v, d) => (HEX.test(v) ? v : d);
const one = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, min, max, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const img = (v) =>
  typeof v === "string" && v.length <= 600_000 && IMG.test(v) ? v : null;
const bool = (v, d) => (typeof v === "boolean" ? v : d);

/* ── Éditeur d'éléments : les « rôles » que l'on peut cliquer dans l'aperçu.
   Chaque rôle = un sélecteur CSS commun à l'aperçu ET au site livré. ── */
export const ROLES = [
  {
    id: "heroTitle",
    label: "Titre principal",
    sel: ".hero h1,.hero-in h1",
    can: ["color", "size", "align"],
    sizes: {
      s: "clamp(26px,3.2vw,38px)",
      l: "clamp(42px,6vw,76px)",
      xl: "clamp(52px,8vw,104px)",
    },
  },
  {
    id: "heroLead",
    label: "Sous-titre",
    sel: ".lead",
    can: ["color", "size", "align", "hidden"],
    sizes: { s: "15px", l: "21px", xl: "26px" },
  },
  {
    id: "button",
    label: "Boutons",
    sel: ".btn.primary",
    can: ["color", "bg", "size"],
    sizes: { s: "13px", l: "16px", xl: "18px" },
  },
  {
    id: "brand",
    label: "Logo / nom",
    sel: ".brand",
    can: ["color", "size"],
    sizes: { s: "14px", l: "19px", xl: "23px" },
  },
  {
    id: "assistant",
    label: "Bouton assistant",
    sel: ".a-fab",
    can: ["color", "bg", "hidden"],
  },
  {
    id: "image",
    label: "Images",
    sel: ".media-img",
    can: ["focus", "ratio", "hidden"],
  },
  {
    id: "title",
    label: "Titres de section",
    sel: ".block h2",
    can: ["color", "size", "align"],
    sizes: { s: "22px", l: "34px", xl: "42px" },
  },
  {
    id: "card",
    label: "Cartes",
    sel: ".card,.stat,.product,.spotlight",
    can: ["color", "bg", "space"],
    spaces: { s: "12px", l: "36px" },
  },
  {
    id: "band",
    label: "Bandeau d'action",
    sel: ".band",
    can: ["color", "bg", "align", "space", "hidden"],
    spaces: { s: "20px 28px", l: "64px 56px" },
  },
  {
    id: "nav",
    label: "Barre de navigation",
    sel: ".nav",
    can: ["color", "bg"],
  },
  {
    id: "footer",
    label: "Pied de page",
    sel: ".footer",
    can: ["color", "bg", "align", "hidden"],
  },
];

function normalizeEdits(raw) {
  const out = {};
  const src = raw && typeof raw === "object" ? raw : {};
  for (const role of ROLES) {
    const e = src[role.id];
    if (!e || typeof e !== "object") continue;
    const can = new Set(role.can);
    const v = {};
    if (can.has("color") && HEX.test(e.color)) v.color = e.color;
    if (can.has("bg") && HEX.test(e.bg)) v.bg = e.bg;
    if (can.has("size") && ["s", "l", "xl"].includes(e.size)) v.size = e.size;
    if (can.has("align") && ["left", "center", "right"].includes(e.align))
      v.align = e.align;
    if (can.has("space") && ["s", "l"].includes(e.space)) v.space = e.space;
    if (can.has("hidden") && e.hidden === true) v.hidden = true;
    if (can.has("focus") && ["top", "center", "bottom"].includes(e.focus))
      v.focus = e.focus;
    if (can.has("ratio") && ["16/10", "4/3", "1/1"].includes(e.ratio))
      v.ratio = e.ratio;
    if (Object.keys(v).length) out[role.id] = v;
  }
  return out;
}

function editsCss(edits) {
  let css = "";
  for (const role of ROLES) {
    const e = edits && edits[role.id];
    if (!e) continue;
    const r = [];
    if (e.color) r.push(`color:${e.color}!important`);
    if (e.bg) r.push(`background:${e.bg}!important`);
    if (e.size && role.sizes?.[e.size])
      r.push(`font-size:${role.sizes[e.size]}!important`);
    if (e.align) {
      r.push(`text-align:${e.align}!important`);
      if (e.align === "center")
        r.push("margin-left:auto!important", "margin-right:auto!important");
      if (e.align === "right") r.push("margin-left:auto!important");
    }
    if (e.space && role.spaces?.[e.space])
      r.push(`padding:${role.spaces[e.space]}!important`);
    if (e.hidden) r.push("display:none!important");
    if (e.focus) r.push(`object-position:center ${e.focus}!important`);
    if (e.ratio) r.push(`aspect-ratio:${e.ratio}!important`);
    if (r.length)
      css += `${role.sel
        .split(",")
        .map((s) => "html " + s.trim())
        .join(",")}{${r.join(";")}}\n`;
  }
  return css;
}

export function normalizeDesign(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const D = DESIGN_DEFAULTS();
  const o = (k) => (r[k] && typeof r[k] === "object" ? r[k] : {});
  const col = o("colors"),
    br = o("brand"),
    ty = o("type"),
    ly = o("layout"),
    nv = o("nav"),
    md = o("media"),
    ct = o("content"),
    ag = o("agent"),
    rs = o("responsive"),
    fx = o("fx");
  const tm =
    ct.testimonial && typeof ct.testimonial === "object" ? ct.testimonial : {};

  const known = new Set(SECTIONS.map((s) => s.id));
  const seen = new Set();
  const sections = [];
  for (const s of Array.isArray(r.sections) ? r.sections : []) {
    if (s && known.has(s.id) && !seen.has(s.id)) {
      seen.add(s.id);
      sections.push({ id: s.id, enabled: s.enabled !== false });
    }
  }
  for (const s of SECTIONS)
    if (!seen.has(s.id)) sections.push({ id: s.id, enabled: true });

  return {
    colors: {
      accent: hex(col.accent, D.colors.accent),
      accentTo: hex(col.accentTo, null),
      gradient: bool(col.gradient, false),
      bg: hex(col.bg, D.colors.bg),
      text: hex(col.text, D.colors.text),
      header: hex(col.header, null),
      mode: one(col.mode, ["light", "dark", "auto"], "light"),
    },
    brand: { logo: img(br.logo), favicon: img(br.favicon) },
    type: {
      font: one(ty.font, Object.keys(FONTS), D.type.font),
      weight: one(Number(ty.weight), [400, 500, 600, 700], D.type.weight),
      scale: num(ty.scale, 90, 115, 100),
    },
    mood: one(r.mood, Object.keys(MOODS), D.mood),
    icons: one(r.icons, ["line", "solid", "minimal"], "line"),
    layout: {
      width: one(ly.width, ["compact", "standard", "wide"], "standard"),
      spacing: one(ly.spacing, ["tight", "balanced", "airy"], "balanced"),
      radius: one(ly.radius, ["square", "soft", "round", "organic"], "soft"),
      shadow: one(ly.shadow, ["none", "soft", "strong", "glow"], "soft"),
      border: one(ly.border, ["none", "thin", "visible", "double"], "thin"),
      align: one(ly.align, ["left", "center"], "left"),
      density: one(ly.density, ["compact", "balanced", "airy"], "balanced"),
      cards: one(ly.cards, ["outline", "filled", "glass", "float"], "outline"),
      buttons: one(ly.buttons, ["solid", "outline", "ghost"], "solid"),
      btnShape: one(ly.btnShape, ["auto", "pill", "square"], "auto"),
      hero: one(ly.hero, ["compact", "standard", "full"], "standard"),
      cut: one(ly.cut, ["straight", "diagonal", "curve"], "straight"),
      divider: one(ly.divider, ["none", "line", "dotted"], "line"),
    },
    fx: {
      contrast: one(fx.contrast, ["soft", "balanced", "strong"], "balanced"),
      texture: one(fx.texture, ["none", "grain", "paper"], "none"),
      backdrop: one(
        fx.backdrop,
        ["plain", "gradient", "mesh", "grid"],
        "plain",
      ),
      reveal: one(fx.reveal, ["none", "fade", "slide", "blur"], "none"),
      speed: one(fx.speed, ["slow", "normal", "fast"], "normal"),
      hover: one(fx.hover, ["none", "lift", "glow", "zoom"], "none"),
      spot: bool(fx.spot, false),
    },
    nav: {
      mode: one(nv.mode, ["horizontal", "hamburger"], "horizontal"),
      logo: one(nv.logo, ["left", "center"], "left"),
      // anciens projets : sticky / transparent → nouveaux réglages
      style: one(
        nv.style,
        ["classic", "float", "glass", "transparent"],
        nv.transparent === true ? "transparent" : "classic",
      ),
      scroll: one(
        nv.scroll,
        ["fixed", "hide", "shrink", "static"],
        nv.sticky === false ? "static" : "fixed",
      ),
      height: one(nv.height, ["compact", "standard", "tall"], "standard"),
      cta: bool(nv.cta, true),
      ctaLabel: str(nv.ctaLabel, 30) || D.nav.ctaLabel,
      maxLinks: num(nv.maxLinks, 2, 6, 5),
    },
    media: {
      heroImage: img(md.heroImage),
      heroMode: one(md.heroMode, ["none", "background"], "none"),
      heroFocus: one(md.heroFocus, ["top", "center", "bottom"], "center"),
      aboutImage: img(md.aboutImage),
      shape: one(md.shape, ["square", "rounded", "circle"], "rounded"),
      ratio: one(md.ratio, ["16/10", "4/3", "1/1"], "16/10"),
      showPhotos: bool(md.showPhotos, true),
      treatment: one(
        md.treatment,
        ["natural", "bw", "contrast", "cine"],
        "natural",
      ),
    },
    content: {
      title: str(ct.title, 90),
      subtitle: str(ct.subtitle, 260),
      cta: str(ct.cta, 30),
      testimonial: { quote: str(tm.quote, 240), author: str(tm.author, 80) },
      keyPoints: (Array.isArray(ct.keyPoints) ? ct.keyPoints : [])
        .map((s) => str(s, 90))
        .filter(Boolean)
        .slice(0, 6),
      faq: (Array.isArray(ct.faq) ? ct.faq : [])
        .map((x) => ({ q: str(x?.q, 140), a: str(x?.a, 500) }))
        .filter((x) => x.q && x.a)
        .slice(0, 8),
      address: str(ct.address, 140),
      phone: str(ct.phone, 30),
      email: str(ct.email, 100),
      social: str(ct.social, 140),
    },
    sections,
    agent: {
      position: one(ag.position, ["right", "left"], "right"),
      autoOpen: bool(ag.autoOpen, false),
      name: str(ag.name, 40),
      avatar: img(ag.avatar),
      greeting: str(ag.greeting, 240),
      tone: one(
        ag.tone,
        ["professional", "friendly", "direct", "premium"],
        "professional",
      ),
      formality: one(ag.formality, ["vous", "tu"], "vous"),
      collectEmail: bool(ag.collectEmail, true),
      collectPhone: bool(ag.collectPhone, false),
      booking: bool(ag.booking, false),
      maxQuestions: num(ag.maxQuestions, 0, 5, 3),
      afterMsg: str(ag.afterMsg, 160),
    },
    responsive: {
      stickyCta: bool(rs.stickyCta, false),
      hideHero: bool(rs.hideHero, false),
      textScale: num(rs.textScale, 90, 110, 100),
      navMobile: one(rs.navMobile, ["hamburger", "inline"], "hamburger"),
    },
    edits: normalizeEdits(r.edits),
  };
}

export const applyMood = (design, id) => {
  const m = MOODS[id];
  if (!m) return design;
  const next = JSON.parse(JSON.stringify(design));
  for (const [group, vals] of Object.entries(m.patch))
    next[group] = { ...(next[group] || {}), ...vals };
  next.mood = id;
  return normalizeDesign(next);
};

/* ── Compilation en CSS : la même sortie sert l'aperçu ET le site livré ── */
function readable(h) {
  const n = parseInt(h.slice(1), 16),
    r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 165 ? "#101114" : "#FFFFFF";
}
export const fontHref = (d) => {
  const f = FONTS[d.type.font];
  return f?.g
    ? `https://fonts.googleapis.com/css2?family=${f.g}&display=swap`
    : "";
};

export const designAttrs = (d) => ({
  align: d.layout.align,
  icons: d.icons,
  nav: d.nav.mode,
  navm: d.responsive.navMobile,
  logo: d.nav.logo,
  navs: d.nav.style,
  nvs: d.nav.scroll,
  apos: d.agent.position,
  mcta: d.responsive.stickyCta ? "on" : "off",
  mhero: d.responsive.hideHero ? "off" : "on",
  cards: d.layout.cards,
  btn: d.layout.buttons,
  border: d.layout.border,
  hero: d.layout.hero,
  cut: d.layout.cut,
  div: d.layout.divider,
  bg: d.fx.backdrop,
  texture: d.fx.texture,
  reveal: d.fx.reveal,
  hover: d.fx.hover,
  spot: d.fx.spot ? "on" : "off",
  mode: d.colors.mode,
});

export function designCss(d) {
  const f = FONTS[d.type.font] || FONTS.inter,
    c = d.colors,
    L = d.layout,
    X = d.fx,
    N = d.nav;
  const R = {
    square: ["4px", "3px", "4px"],
    soft: ["12px", "10px", "12px"],
    round: ["22px", "999px", "16px"],
    organic: ["30px 8px 30px 8px", "14px", "14px"],
  }[L.radius];
  const rbtn = { auto: R[1], pill: "999px", square: "3px" }[L.btnShape];
  const ct = {
    soft: [50, 7, 22],
    balanced: [58, 10, 30],
    strong: [72, 15, 42],
  }[X.contrast];
  const shadow = {
    none: "none",
    soft: "0 1px 2px rgba(16,17,20,.04),0 18px 40px -22px rgba(16,17,20,.22)",
    strong: "0 2px 4px rgba(16,17,20,.10),0 26px 50px -18px rgba(16,17,20,.42)",
    glow: "0 0 0 1px color-mix(in srgb,var(--accent) 22%,transparent),0 16px 44px -10px color-mix(in srgb,var(--accent) 42%,transparent)",
  }[L.shadow];
  const border = {
    none: "transparent",
    thin: `color-mix(in srgb,var(--text) ${ct[1]}%,var(--bg))`,
    visible: `color-mix(in srgb,var(--text) ${ct[2]}%,var(--bg))`,
    double: `color-mix(in srgb,var(--text) ${ct[2]}%,var(--bg))`,
  }[L.border];
  const sec = { tight: "36px", balanced: "56px", airy: "92px" }[L.spacing];
  const pad = { compact: "16px", balanced: "24px", airy: "32px" }[L.density];
  const wrap = { compact: "880px", standard: "1120px", wide: "1360px" }[
    L.width
  ];
  const ratio = d.media.shape === "circle" ? "1/1" : d.media.ratio;
  const imgR = { square: "0", rounded: "var(--r)", circle: "50%" }[
    d.media.shape
  ];
  const filt = {
    natural: "none",
    bw: "grayscale(1)",
    contrast: "contrast(1.14) saturate(1.12)",
    cine: "contrast(1.1) saturate(.88) sepia(.18)",
  }[d.media.treatment];
  const hpos = { top: "center top", center: "center", bottom: "center bottom" }[
    d.media.heroFocus
  ];
  const navH = { compact: "52px", standard: "60px", tall: "76px" }[N.height];
  const dur = { slow: "1.1s", normal: ".65s", fast: ".35s" }[X.speed];
  const CARDS = [".card", ".panel", ".spotlight", ".stat", ".product"];
  const cardSel = (v) =>
    CARDS.map((s) => `html[data-cards=${v}] ${s}`).join(",");
  const HOV = [".card", ".product", ".stat", ".cap"];
  const hov = (v, suffix = "") =>
    HOV.map((s) => `html[data-hover=${v}] ${s}${suffix}`).join(",");
  const reveal = (n, anim) =>
    `html[data-reveal=${n}] .hero,html[data-reveal=${n}] .block{animation:${anim} var(--dur) cubic-bezier(.22,.61,.36,1) both}`;
  const stack = `html[data-nav=hamburger] .nav.open .nav-links`;
  const drop = `display:flex;position:absolute;left:0;right:0;top:100%;flex-direction:column;background:var(--bg);border-bottom:1px solid var(--border);padding:8px 16px;margin:0;width:auto`;
  const grain = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;
  const dark = "--bg:#0B0C10;--text:#F2F3F7;--nav-bg:#0B0C10;color-scheme:dark";
  return `/* ── design AiGENT (généré) ── */
:root{
--bg:${c.bg};--text:${c.text};--accent:${c.accent};--accent-to:${c.gradient && c.accentTo ? c.accentTo : c.accent};--on-accent:${readable(c.accent)};
--nav-bg:${c.header || c.bg};--font:${f.stack};--fw:${d.type.weight};--r:${R[0]};--rb:${R[1]};--rt:${R[2]};--rbtn:${rbtn};--shadow:${shadow};
--wrap:${wrap};--sec:${sec};--pad:${pad};--ts:${d.type.scale / 100};--tsm:${d.responsive.textScale / 100};--ratio:${ratio};--img-r:${imgR};
--border:${border};--dur:${dur};--navh:${navH};--img-f:${filt};--hpos:${hpos};
--surface:color-mix(in srgb,var(--text) 3%,var(--bg));--alt:color-mix(in srgb,var(--text) 6%,var(--bg));
--muted:color-mix(in srgb,var(--text) ${ct[0]}%,var(--bg));--soft:color-mix(in srgb,var(--accent) 9%,var(--bg));
}
body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:calc(15px*var(--ts))}
h1,h2,h3,.q,.cap-t,.brand{font-weight:var(--fw);font-family:var(--font)}
.wrap{max-width:var(--wrap)}
.block{padding-top:var(--sec);padding-bottom:var(--sec)}
.card,.panel,.spotlight,.notice,.stat,.product,.band,.a-panel,.modal,.choice{border-radius:var(--r)}
.card,.panel,.spotlight,.stat,.product{box-shadow:var(--shadow)}
.card.pad{padding:var(--pad)}
.btn,.chip,.icon-btn,.burger{border-radius:var(--rbtn)}
.btn.block{padding:0 16px}
input,select{border-radius:var(--rb);border-color:color-mix(in srgb,var(--text) 14%,var(--bg))}
textarea{border-radius:var(--rt);border-color:color-mix(in srgb,var(--text) 14%,var(--bg))}
.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent-to));color:var(--on-accent)}
.media-img{display:block;width:100%;aspect-ratio:var(--ratio);object-fit:cover;border-radius:var(--img-r);filter:var(--img-f)}
.logo-img{height:28px;width:auto;display:block}
/* bordures doubles */
${CARDS.map((s) => `html[data-border=double] ${s}`).join(",")},html[data-border=double] .band{border:3px double var(--border)}
/* cartes */
${cardSel("filled")}{background:var(--surface);border-color:transparent}
${cardSel("glass")}{background:color-mix(in srgb,var(--bg) 55%,transparent);backdrop-filter:blur(14px) saturate(1.4);border-color:color-mix(in srgb,var(--text) 14%,transparent)}
${cardSel("float")}{border-color:transparent;box-shadow:0 2px 4px rgba(16,17,20,.06),0 22px 44px -16px rgba(16,17,20,.34)}
/* boutons */
html[data-btn=outline] .btn.primary{background:transparent;color:var(--accent);border:1.5px solid var(--accent)}
html[data-btn=outline] .btn.primary:hover{background:var(--accent);color:var(--on-accent)}
html[data-btn=ghost] .btn.primary{background:var(--soft);color:var(--accent);border-color:transparent}
/* icônes */
html[data-icons=solid] .ico svg{fill:currentColor;fill-opacity:.18;stroke-width:1.9}
html[data-icons=minimal] .ico svg{stroke-width:1.25}
html[data-icons=minimal] .cap-ico{background:none;padding:0}
/* séparateurs */
html[data-div=none] .block,html[data-div=none] .footer{border-top:0}
html[data-div=dotted] .block,html[data-div=dotted] .footer{border-top-style:dashed}
/* arrière-plan et matière */
html[data-bg=gradient] body{background-image:linear-gradient(180deg,color-mix(in srgb,var(--accent) 8%,var(--bg)),var(--bg) 560px)}
html[data-bg=mesh] body{background-image:radial-gradient(46% 38% at 12% 0%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 70%),radial-gradient(40% 34% at 92% 6%,color-mix(in srgb,var(--accent-to) 16%,transparent),transparent 70%),radial-gradient(50% 40% at 50% 100%,color-mix(in srgb,var(--accent) 10%,transparent),transparent 70%);background-attachment:fixed}
html[data-bg=grid] body{background-image:linear-gradient(color-mix(in srgb,var(--text) 6%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--text) 6%,transparent) 1px,transparent 1px);background-size:44px 44px}
html[data-texture=grain] body::before,html[data-texture=paper] body::before{content:"";position:fixed;inset:0;z-index:1;pointer-events:none;background-image:${grain};opacity:.07}
html[data-texture=paper] body{background-color:color-mix(in srgb,#f4ecd8 18%,var(--bg))}
/* alignement */
html[data-align=center] .hero .wrap,html[data-align=center] .hero-in>div:first-child{text-align:center}
html[data-align=center] .lead{margin-left:auto;margin-right:auto}
html[data-align=center] .hero-cta{justify-content:center}
html[data-align=center] .block>.wrap>h2,html[data-align=center] .block .sub{text-align:center;margin-left:auto;margin-right:auto}
/* hero : hauteur et découpe */
html[data-hero=compact] .hero{padding:36px 0 28px}
html[data-hero=full] .hero{min-height:min(88vh,860px);display:flex;align-items:center}
html[data-hero=full] .hero>.wrap{width:100%}
html[data-cut=diagonal] .hero{clip-path:polygon(0 0,100% 0,100% 90%,0 100%);padding-bottom:calc(56px + 6vw);background-color:var(--soft)}
html[data-cut=curve] .hero{clip-path:ellipse(80% 100% at 50% 0);padding-bottom:calc(56px + 5vw);background-color:var(--soft)}
/* hero image de fond */
.hero-bg{background:linear-gradient(180deg,rgba(8,9,12,.62),rgba(8,9,12,.42)),var(--hero-img) var(--hpos)/cover no-repeat;color:#fff;border-top:0}
.hero-bg h1,.hero-bg .ticks{color:#fff}.hero-bg .lead{color:rgba(255,255,255,.84)}
.hero-bg .panel{color:var(--text)}
.hero-bg .btn:not(.primary){background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.3)}
/* navigation */
.burger{display:none;width:36px;height:36px;border:1px solid var(--border);background:transparent;place-items:center;color:inherit;cursor:pointer}
.nav-in{height:var(--navh)}
html[data-navs=float] .nav{top:10px;margin:10px 16px 0;border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow)}
html[data-navs=glass] .nav{background:color-mix(in srgb,var(--nav-bg) 50%,transparent);backdrop-filter:blur(18px) saturate(1.6)}
html[data-navs=transparent] .nav{background:transparent;backdrop-filter:none;border-bottom-color:transparent}
html[data-nvs=static] .nav{position:relative}
html[data-nvs=hide] .nav{transition:transform .3s ease}
html[data-nvs=hide][data-dir=down][data-scrolled=on] .nav{transform:translateY(-130%)}
html[data-nvs=shrink] .nav-in{transition:height .25s ease}
html[data-nvs=shrink][data-scrolled=on] .nav-in{height:46px}
html[data-logo=center] .nav-in{position:relative;flex-direction:column;height:auto;padding:14px 0 8px;gap:6px}
html[data-logo=center] .nav-links{margin:0;justify-content:center;flex:none}
html[data-logo=center] .nav-right{position:absolute;right:24px;top:14px}
html[data-nav=hamburger] .burger{display:inline-grid}
html[data-nav=hamburger] .nav-links{display:none}
${stack}{${drop}}
/* assistant */
html[data-apos=left] .a-fab,html[data-apos=left] .a-panel{right:auto;left:20px}
/* CTA collant mobile */
.m-cta{display:none;position:fixed;left:0;right:0;bottom:0;z-index:70;padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px);border-top:1px solid var(--border)}
/* survol */
${hov("lift")}{transition:transform .2s ease,box-shadow .2s ease}
${hov("lift", ":hover")}{transform:translateY(-4px)}
html[data-hover=lift] .btn{transition:transform .18s ease}
html[data-hover=lift] .btn:hover{transform:translateY(-2px)}
${hov("glow")}{transition:box-shadow .25s ease,border-color .25s ease}
${hov("glow", ":hover")}{border-color:var(--accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 30%,transparent),0 14px 40px -12px color-mix(in srgb,var(--accent) 50%,transparent)}
html[data-hover=glow] .btn.primary:hover{box-shadow:0 8px 28px -6px color-mix(in srgb,var(--accent) 60%,transparent)}
html[data-hover=zoom] .media-img{transition:transform .5s ease}
html[data-hover=zoom] .media-img:hover{transform:scale(1.04)}
/* lueur qui suit la souris */
html[data-spot=on] body::after{content:"";position:fixed;inset:0;z-index:2;pointer-events:none;background:radial-gradient(420px circle at var(--mx,50%) var(--my,30%),color-mix(in srgb,var(--accent) 14%,transparent),transparent 70%)}
/* apparitions */
@keyframes aig-fade{from{opacity:0}to{opacity:1}}
@keyframes aig-slide{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes aig-blur{from{opacity:0;filter:blur(10px);transform:translateY(8px)}to{opacity:1;filter:none;transform:none}}
${reveal("fade", "aig-fade")}
${reveal("slide", "aig-slide")}
${reveal("blur", "aig-blur")}
@supports(animation-timeline:view()){html[data-reveal=fade] .block,html[data-reveal=slide] .block,html[data-reveal=blur] .block{animation-duration:auto;animation-timeline:view();animation-range:entry 0% entry 40%}}
@media(prefers-reduced-motion:reduce){html[data-reveal] *{animation:none!important}html[data-hover] *{transition:none!important}}
@media(max-width:900px){
html[data-navm=hamburger] .burger{display:inline-grid}
html[data-navm=hamburger] .nav-links{display:none}
html[data-navm=hamburger] .nav.open .nav-links{${drop}}
}
@media(max-width:700px){
body{font-size:calc(15px*var(--tsm))}
html[data-mcta=on] .m-cta{display:block}
html[data-mcta=on] .a-fab{bottom:84px}
html[data-mhero=off] .hero-bg{background:none;color:inherit}
html[data-mhero=off] .hero-bg h1,html[data-mhero=off] .hero-bg .lead{color:inherit}
}
/* mode sombre */
html[data-mode=dark]{${dark}}
@media(prefers-color-scheme:dark){html[data-mode=auto]{${dark}}}
/* éditeur d'éléments */
${editsCss(d.edits)}`;
}

/* ── Compositeur d'accueil : contenu saisi + ordre + visibilité des sections ── */
export function composeHome(blocks, d) {
  const out = JSON.parse(JSON.stringify(blocks || []));
  const c = d.content;
  const hero = out.find((b) => b.type === "hero");
  if (hero) {
    if (c.title) hero.props.title = c.title;
    if (c.subtitle) hero.props.lead = c.subtitle;
  }

  if (c.testimonial.quote) {
    const props = {
      quote: c.testimonial.quote,
      ...(c.testimonial.author ? { attribution: c.testimonial.author } : {}),
    };
    const q = out.find((b) => b.type === "quote-block");
    if (q) Object.assign(q.props, props);
    else out.push({ type: "quote-block", variant: "centered", props });
  }
  if (c.faq.length) {
    const items = c.faq.map((x) => ({ q: x.q, a: x.a }));
    const f = out.find((b) => b.type === "faq-accordion");
    if (f) f.props.items = items;
    else
      out.push({
        type: "faq-accordion",
        variant: "default",
        props: { title: "Questions fréquentes", items },
      });
  }
  if (c.keyPoints.length) {
    const s = out.find((b) => b.type === "spotlight");
    if (s) s.props.bullets = c.keyPoints.slice(0, 4);
    else
      out.push({
        type: "spotlight",
        variant: "default",
        props: {
          title: "Nos atouts",
          paragraphs: [
            c.subtitle || "Ce qui fait la différence, concrètement.",
          ],
          bullets: c.keyPoints.slice(0, 4),
        },
      });
  }
  const idx = new Map(d.sections.map((s, i) => [s.id, i]));
  const on = new Map(d.sections.map((s) => [s.id, s.enabled]));
  return out
    .map((b, k) => ({ b, k, id: SECTION_OF[b.type] || null }))
    .filter((x) => !x.id || on.get(x.id) !== false)
    .sort((a, z) => (idx.get(a.id) ?? 99) - (idx.get(z.id) ?? 99) || a.k - z.k)
    .map((x) => x.b);
}

/** Règles ajoutées au prompt système de l'assistant livré. */
export function agentBehaviorRules(d) {
  const a = d.agent,
    r = [];
  r.push(
    "TON : " +
      {
        professional: "professionnel et rassurant",
        friendly: "amical et chaleureux",
        direct: "direct et concis",
        premium: "premium, soigné et posé",
      }[a.tone] +
      ".",
  );
  r.push(
    a.formality === "tu"
      ? "Tutoie ton interlocuteur."
      : "Vouvoie ton interlocuteur.",
  );
  r.push(
    `Pose au plus ${a.maxQuestions} question(s) de qualification avant de proposer une action.`,
  );
  if (a.collectEmail)
    r.push(
      "Quand la conversation avance, demande l'email du visiteur pour donner suite.",
    );
  if (a.collectPhone)
    r.push("Propose de laisser un numéro de téléphone pour être rappelé.");
  if (a.booking)
    r.push("Quand c'est pertinent, propose de prendre rendez-vous.");
  if (a.afterMsg)
    r.push(
      `Une fois une demande enregistrée, termine par : « ${a.afterMsg} ».`,
    );
  return r.join("\n");
}

/* ══════════════════════════════════════════════════════════════════
   SITE EXEMPLE — HTML/CSS propre, mêmes classes que le site livré.
   Le CSS dynamique (designCss) est injecté par-dessus : rendu identique.
   ══════════════════════════════════════════════════════════════════ */
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );

export function exampleBody(d, brand = "Site exemple") {
  const c = d.content,
    n = d.nav,
    m = d.media,
    photos = m.showPhotos !== false;
  const I = (p) =>
    `<span class="ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`;
  const P = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
  };
  const logo = d.brand.logo
    ? `<img class="logo-img" src="${d.brand.logo}" alt="">`
    : `<span class="mark">${esc((brand[0] || "S").toUpperCase())}</span>`;
  const links = [
    "Services",
    "Fonctionnement",
    "Tarifs",
    "Témoignages",
    "Aide",
    "Contact",
  ].slice(0, n.maxLinks);
  const header = `<header class="nav"><div class="wrap nav-in"><a class="brand">${logo}<span>${esc(brand)}</span></a>
<nav class="nav-links">${links.map((l, i) => `<a class="nav-link${i === 0 ? " on" : ""}">${l}</a>`).join("")}</nav>
<div class="nav-right">${n.cta ? `<a class="btn primary sm nav-cta">${esc(n.ctaLabel)}</a>` : ""}<button class="burger" type="button" aria-label="Menu"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div></div></header>`;

  const heroBg = photos && m.heroImage && m.heroMode === "background";
  const about = c.keyPoints.length
    ? c.keyPoints.slice(0, 4)
    : [
        "Un interlocuteur unique",
        "Des conseils concrets",
        "Un suivi de bout en bout",
      ];
  const tile = (label) =>
    photos && m.aboutImage
      ? `<img class="media-img" src="${m.aboutImage}" alt="">`
      : `<div class="tile media-img">${label}</div>`;
  const faq = c.faq.length
    ? c.faq
    : [
        {
          q: "Comment prendre rendez-vous ?",
          a: "Utilisez le bouton en haut de page : quelques questions et votre demande nous parvient.",
        },
        {
          q: "Quels sont vos délais de réponse ?",
          a: "L'assistant répond immédiatement ; l'équipe confirme sous 24 heures.",
        },
        {
          q: "Puis-je modifier ma demande ?",
          a: "Oui, écrivez-nous ou demandez-le directement à l'assistant.",
        },
      ];

  const S = {
    hero: `<section class="hero${heroBg ? " hero-bg" : ""}"${heroBg ? ` style="--hero-img:url('${m.heroImage}')"` : ""}><div class="wrap hero-in"><div>
<span class="eyebrow"><i></i>Assistant disponible 24 h/24</span>
<h1>${esc(c.title || "Un site clair, pensé pour vos clients")}</h1>
<p class="lead">${esc(c.subtitle || "Présentez votre activité, répondez aux questions courantes et prenez rendez-vous, sans friction.")}</p>
<div class="hero-cta"><a class="btn primary lg">${esc(c.cta || n.ctaLabel)}</a><a class="btn lg">Découvrir</a></div></div>
<div class="mock"><div class="mock-h"><span class="mark">${esc((brand[0] || "S").toUpperCase())}</span><div><b>${esc(d.agent.name || "Assistant")}</b><small>En ligne</small></div></div>
<div class="bub a">Bonjour, comment puis-je vous aider ?</div><div class="bub u">Je voudrais un rendez-vous jeudi.</div><div class="bub a">Bien sûr. Plutôt 10 h ou 15 h ?</div>
<div class="mock-in"><span>Votre message…</span><i></i></div></div></div></section>`,
    about: `<section class="block"><div class="wrap hero-in"><div><h2>Une équipe à votre écoute</h2><p class="sub">Depuis plus de dix ans, nous accompagnons nos clients avec des conseils concrets et un suivi attentif.</p>
<ul class="ticks">${about.map((t) => `<li>${I(P.check)}<span>${esc(t)}</span></li>`).join("")}</ul></div>${tile("Photo de l'équipe")}</div></section>`,
    services: `<section class="block"><div class="wrap"><h2>Ce que nous faisons pour vous</h2><p class="sub">Quatre engagements, sans jargon.</p><div class="caps">
${[
  [
    "user",
    "Accueil personnalisé",
    "Un premier échange pour comprendre votre besoin.",
  ],
  [
    "chat",
    "Réponses immédiates",
    "L'assistant répond à toute heure à partir de vos informations.",
  ],
  ["cal", "Prise de rendez-vous", "Choisissez un créneau en quelques clics."],
  ["clock", "Suivi des demandes", "Retrouvez l'historique de vos échanges."],
]
  .map(
    ([i, t, x]) =>
      `<div class="cap"><span class="cap-ico">${I(P[i])}</span><div><div class="cap-t">${t}</div><p>${x}</p></div></div>`,
  )
  .join("")}</div></div></section>`,
    how: `<section class="block"><div class="wrap"><h2>Comment ça marche</h2><p class="sub">Trois étapes, aucune complication.</p><ol class="steps"><li><strong>Exprimez votre besoin</strong><p class="muted">Décrivez votre situation en quelques mots.</p></li><li><strong>Recevez une réponse</strong><p class="muted">Immédiate, fondée sur nos informations.</p></li><li><strong>Passez à l'action</strong><p class="muted">Rendez-vous, devis ou rappel : vous choisissez.</p></li></ol></div></section>`,
    stats: `<section class="block"><div class="wrap"><div class="stats">${[
      ["24 h/24", "Assistant disponible"],
      ["< 2 min", "Pour obtenir une réponse"],
      ["98 %", "Clients satisfaits"],
    ]
      .map(
        ([v, l]) =>
          `<div class="card stat"><span class="muted">${l}</span><b>${v}</b></div>`,
      )
      .join("")}</div></div></section>`,
    testimonials: `<section class="block"><div class="wrap"><p class="quote">« ${esc(c.testimonial.quote || "Nos clients obtiennent une réponse en quelques secondes, et nous gagnons un temps précieux.")} »</p><p class="muted small" style="text-align:center;margin-top:12px">${esc(c.testimonial.author || "Camille M., gérante")}</p></div></section>`,
    gallery: `<section class="block"><div class="wrap"><h2>En images</h2><div class="grid3" style="margin-top:20px">${[1, 2, 3].map((i) => `<div class="tile media-img">Photo ${i}</div>`).join("")}</div></div></section>`,
    pricing: `<section class="block"><div class="wrap"><h2>Tarifs</h2><div class="grid3" style="margin-top:20px">${[
      ["Essentiel", "29 €", "Pour démarrer"],
      ["Confort", "59 €", "Le plus choisi"],
      ["Sur mesure", "Devis", "Selon votre besoin"],
    ]
      .map(
        ([t, p, x]) =>
          `<div class="card pad"><h3>${t}</h3><p style="font-size:28px;font-weight:var(--fw);margin:8px 0">${p}</p><p class="muted">${x}</p></div>`,
      )
      .join("")}</div></div></section>`,
    faq: `<section class="block"><div class="wrap"><h2 style="margin-bottom:20px">Questions fréquentes</h2><div class="faq">${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div></div></section>`,
    contact: `<section class="wrap" style="padding:0 24px var(--sec)"><div class="band"><div><h2>Une question ?</h2><p style="opacity:.8;margin-top:4px">Notre assistant vous répond tout de suite.</p></div><a class="btn lg">Ouvrir l'assistant</a></div></section>`,
    footer: `<footer class="footer"><div class="wrap foot-in"><div><strong>${esc(brand)}</strong><p class="muted">Un site clair, un assistant utile.</p></div><div class="muted">${
      [c.address, c.phone, c.email, c.social]
        .filter(Boolean)
        .map((x) => `<div>${esc(x)}</div>`)
        .join("") ||
      "<div>12 rue des Lilas, Lyon</div><div>contact@site-exemple.fr</div>"
    }</div></div></footer>`,
  };
  const wrapSec = (id) => `<div data-sec="${id}">${S[id] || ""}</div>`;
  const main = d.sections
    .filter((s) => s.enabled && s.id !== "footer")
    .map((s) => wrapSec(s.id))
    .join("");
  const foot =
    d.sections.find((s) => s.id === "footer")?.enabled !== false
      ? wrapSec("footer")
      : "";
  return `${header}<main>${main}</main>${foot}<button class="a-fab" type="button">${esc(d.agent.name || "Assistant")}</button><div class="m-cta"><a class="btn primary lg" style="width:100%">${esc(n.ctaLabel)}</a></div>`;
}

const EXAMPLE_BASE_CSS = `*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 var(--font);-webkit-font-smoothing:antialiased}
h1,h2,h3,p,ul,ol{margin:0}ul,ol{padding:0;list-style:none}a{color:inherit;text-decoration:none;cursor:pointer}
.wrap{max-width:var(--wrap);margin:0 auto;padding:0 24px}.muted{color:var(--muted)}.small{font-size:13px}
.nav{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--nav-bg) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.nav-in{display:flex;align-items:center;gap:18px;height:60px}.brand{display:flex;align-items:center;gap:10px}
.mark{width:30px;height:30px;border-radius:calc(var(--r)*.55);background:var(--accent);color:var(--on-accent);display:inline-grid;place-items:center;font-weight:700;font-size:14px}
.nav-links{display:flex;gap:2px;flex:1;margin-left:8px}.nav-link{padding:6px 12px;border-radius:8px;color:var(--muted);font-size:14px;white-space:nowrap}.nav-link.on{color:var(--text);background:var(--alt)}
.nav-right{display:flex;align-items:center;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border:1px solid var(--border);background:var(--bg);color:inherit;font:550 14px var(--font);cursor:pointer;white-space:nowrap}
.btn.primary{border-color:transparent}.btn.sm{height:34px;padding:0 12px;font-size:13px}.btn.lg{height:48px;padding:0 22px;font-size:15px}
.hero{padding:72px 0 56px}.hero-in{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center}
.hero h1{font-size:clamp(34px,4.6vw,56px);line-height:1.05;letter-spacing:-.035em}
.lead{font-size:18px;line-height:1.55;color:var(--muted);margin-top:18px;max-width:52ch}.hero-cta{display:flex;gap:10px;flex-wrap:wrap;margin-top:28px}
.panel{background:var(--bg);border:1px solid var(--border);padding:26px;display:grid;gap:14px}.panel h2{font-size:20px;letter-spacing:-.02em}
.field-fake{height:42px;border:1px solid var(--border);border-radius:var(--rb);display:flex;align-items:center;padding:0 12px;color:var(--muted)}
.block{border-top:1px solid var(--border)}.block h2{font-size:28px;letter-spacing:-.028em}.sub{color:var(--muted);margin:8px 0 28px;max-width:56ch}
.ticks{display:grid;gap:10px}.ticks li{display:flex;gap:10px;align-items:center}.ticks .ico{color:var(--accent)}
.caps{display:grid;grid-template-columns:repeat(2,1fr);border-top:1px solid var(--border)}
.cap{display:flex;gap:16px;padding:22px 28px 22px 0;border-bottom:1px solid var(--border)}.cap:nth-child(even){padding-left:28px;border-left:1px solid var(--border)}
.cap-ico{width:40px;height:40px;border-radius:calc(var(--r)*.8);background:var(--soft);color:var(--accent);display:grid;place-items:center;flex:none}
.cap-t{font-size:15.5px}.cap p{color:var(--muted);margin-top:3px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;counter-reset:s}.steps li{counter-increment:s;border-top:2px solid var(--accent);padding-top:16px}
.steps li::before{content:counter(s);font-weight:650;font-size:13px;color:var(--accent);display:block;margin-bottom:6px}
.stats,.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:var(--bg);border:1px solid var(--border)}
.stat{padding:var(--pad)}.stat b{display:block;font-size:32px;letter-spacing:-.03em;margin-top:4px}
.quote{font-size:22px;letter-spacing:-.015em;max-width:680px;margin:0 auto;text-align:center}
.faq{border-top:1px solid var(--border)}.faq details{border-bottom:1px solid var(--border)}.faq summary{cursor:pointer;padding:18px 0;font-weight:550;list-style:none}.faq p{padding:0 0 18px;color:var(--muted)}
.band{background:var(--accent);color:var(--on-accent);padding:40px 44px;display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap}
.band h2{font-size:26px}.band .btn{background:var(--on-accent);color:var(--accent);border-color:transparent}
.tile{display:grid;place-items:center;background:var(--alt);color:var(--muted);font-size:13px;border:1px solid var(--border);min-height:120px}
.footer{border-top:1px solid var(--border)}.foot-in{display:grid;grid-template-columns:1.2fr 1fr;gap:32px;padding:36px 24px;font-size:14px}
.a-fab{position:fixed;right:20px;bottom:20px;z-index:60;height:48px;padding:0 18px;border-radius:999px;border:0;background:var(--accent);color:var(--on-accent);font:600 14px var(--font);cursor:pointer}
@media(max-width:900px){.hero{padding:40px 0 32px}.hero-in,.stats,.grid3,.steps,.caps,.foot-in{grid-template-columns:1fr;gap:24px}.cap,.cap:nth-child(even){padding:20px 0;border-left:0}}`;

const EXAMPLE_POLISH_CSS = `
.hero{background:radial-gradient(60% 90% at 85% 0%,color-mix(in srgb,var(--accent) 13%,transparent),transparent 70%)}
.hero h1{font-size:clamp(34px,4.4vw,54px);line-height:1.04;letter-spacing:-.04em}
.eyebrow{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 12px;margin-bottom:18px;border:1px solid var(--border);border-radius:999px;background:var(--surface);font-size:12.5px;color:var(--muted)}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:#1c9a62;box-shadow:0 0 0 3px rgba(28,154,98,.18)}
.mock{background:var(--bg);border:1px solid var(--border);border-radius:calc(var(--r)*1.3);box-shadow:var(--shadow);padding:16px;display:flex;flex-direction:column;gap:10px;max-width:420px;margin-left:auto;width:100%}
.mock-h{display:flex;align-items:center;gap:10px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.mock-h b{display:block;font-size:14px}.mock-h small{color:var(--muted);font-size:12px}
.bub{max-width:82%;padding:9px 13px;font-size:13.5px;line-height:1.45;border-radius:14px}
.bub.a{background:var(--alt);border-bottom-left-radius:4px}
.bub.u{align-self:flex-end;background:linear-gradient(135deg,var(--accent),var(--accent-to));color:var(--on-accent);border-bottom-right-radius:4px}
.mock-in{display:flex;align-items:center;justify-content:space-between;margin-top:4px;height:40px;padding:0 6px 0 13px;border:1px solid var(--border);border-radius:var(--rb);color:var(--muted);font-size:13px}
.mock-in i{width:28px;height:28px;border-radius:50%;background:var(--accent)}
.tile{position:relative;overflow:hidden;color:transparent;font-size:0;min-height:150px;border:1px solid var(--border);background:linear-gradient(135deg,var(--soft),color-mix(in srgb,var(--accent) 20%,var(--bg)))}
.tile::before{content:"";position:absolute;width:62%;aspect-ratio:1;right:-12%;top:-22%;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-to));opacity:.85}
.tile::after{content:"";position:absolute;left:12%;bottom:14%;width:40%;height:26%;border-radius:var(--rb);background:var(--bg);box-shadow:var(--shadow)}
.cap{transition:background .15s}.cap:hover{background:var(--surface)}
.stat{transition:transform .15s}.stat:hover{transform:translateY(-2px)}
html[data-reveal] .hero,html[data-reveal] .block{animation:none!important}
.aig-sel{outline:2px solid #3D8BFD!important;outline-offset:3px}
.aig-hov{outline:2px dashed #3D8BFD;outline-offset:3px}
html[data-editing] *{cursor:pointer!important}
`;

export const EXAMPLE_DOC = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style id="base">${EXAMPLE_BASE_CSS}${EXAMPLE_POLISH_CSS}</style><style id="dyn"></style><link id="gf" rel="stylesheet"></head><body>
<script>
var ROLES=[],ACTIVE=null,EDIT=false,LAST=0,root=document.documentElement;
function clear(c){var n=document.querySelectorAll("."+c);for(var i=0;i<n.length;i++)n[i].classList.remove(c)}
function mark(){clear("aig-sel");if(!EDIT||!ACTIVE)return;for(var i=0;i<ROLES.length;i++){if(ROLES[i][0]!==ACTIVE)continue;var n=[];try{n=document.querySelectorAll(ROLES[i][2])}catch(e){}for(var j=0;j<n.length;j++)n[j].classList.add("aig-sel")}}
function pick(t){if(!t||!t.closest)return null;for(var i=0;i<ROLES.length;i++){var c=t.closest(ROLES[i][2]);if(c)return{id:ROLES[i][0],el:c}}return null}
addEventListener("message",function(e){var m=e.data;if(!m)return;
if(m.k==="aigent-scroll"){var t=document.querySelector('[data-sec="'+m.id+'"]');if(t)t.scrollIntoView({behavior:"smooth",block:"start"});return;}
if(m.k==="aigent-edit"){ROLES=m.roles||[];EDIT=!!m.on;ACTIVE=m.active||null;if(EDIT)root.setAttribute("data-editing","");else root.removeAttribute("data-editing");clear("aig-hov");mark();return;}
if(m.k!=="aigent-render")return;
document.getElementById("dyn").textContent=m.css;
var g=document.getElementById("gf");if(m.font)g.setAttribute("href",m.font);else g.removeAttribute("href");
for(var k in m.attrs)root.setAttribute("data-"+k,m.attrs[k]);
var y=scrollY;document.body.innerHTML=m.html;scrollTo(0,y);mark();});
document.addEventListener("click",function(e){if(!EDIT)return;e.preventDefault();e.stopImmediatePropagation();var p=pick(e.target);if(p){ACTIVE=p.id;mark();parent.postMessage({k:"aigent-pick",id:p.id},"*")}},true);
document.addEventListener("mouseover",function(e){if(!EDIT)return;clear("aig-hov");var p=pick(e.target);if(p)p.el.classList.add("aig-hov")});
addEventListener("click",function(e){var t=e.target;if(!t.closest)return;
if(t.closest(".burger")){var n=document.querySelector(".nav");n&&n.classList.toggle("open");}
if(t.closest("a"))e.preventDefault();});
addEventListener("scroll",function(){var y=scrollY;root.setAttribute("data-scrolled",y>24?"on":"off");if(Math.abs(y-LAST)>6){root.setAttribute("data-dir",y>LAST?"down":"up");LAST=y}},{passive:true});
addEventListener("pointermove",function(e){root.style.setProperty("--mx",e.clientX+"px");root.style.setProperty("--my",e.clientY+"px")});
</script></body></html>`;
