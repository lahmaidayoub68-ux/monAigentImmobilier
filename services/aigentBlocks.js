//======================================================================//
//  AiGENT BLOCKS — bibliothèque de blocs partagée
//----------------------------------------------------------------------//
//  Extrait de aigentGenerator.js v4 pour une raison précise : à la fois
//  aigentGenerator.js (qui compile les blocs côté client) ET
//  aigentAgents.js (qui les PRODUIT via l'IA) ont besoin du même
//  catalogue PRIMITIVES et du même validateur sanitizeBlockTree. Si
//  aigentAgents.js les importait directement depuis aigentGenerator.js,
//  on aurait un import circulaire (aigentGenerator.js importe déjà
//  runMultiAgentBuild depuis aigentAgents.js) : ça peut fonctionner en
//  ESM tant que personne n'y touche au niveau racine du module, mais
//  c'est fragile et ça casse silencieusement au premier refactor. Ce
//  fichier est donc la SEULE source de vérité du schéma de blocs.
//
//  aigentGenerator.js réexporte PRIMITIVES et sanitizeBlockTree depuis
//  ici pour que rien d'existant qui ferait
//  `import { PRIMITIVES } from "./aigentGenerator.js"` ne casse.
//======================================================================//

const STR = (max) => ({ kind: "str", max });
const ARR = (of, max) => ({ kind: "arr", of, max });
const ENUM = (values) => ({ kind: "enum", values });

/** Schéma de chaque type de bloc : variantes autorisées + props attendues.
 *  Un champ absent du schéma est ignoré (jamais recopié tel quel). Ce
 *  catalogue est LA définition de ce qu'une IA peut produire pour composer
 *  une page — rien en dehors de cette liste n'atteint jamais le navigateur. */
export const PRIMITIVES = {
  hero: {
    variants: ["centered", "split", "media-right"],
    props: {
      eyebrow: STR(60),
      title: STR(90),
      lead: STR(260),
      bullets: ARR(STR(80), 4),
    },
    required: ["title", "lead"],
  },
  "stat-band": {
    variants: ["row-3", "row-4"],
    props: {
      stats: ARR(
        { kind: "obj", fields: { value: STR(20), label: STR(40) } },
        4,
      ),
    },
    required: ["stats"],
  },
  "split-media": {
    variants: ["media-left", "media-right"],
    props: { title: STR(70), text: STR(320), points: ARR(STR(80), 5) },
    required: ["title", "text"],
  },
  "feature-grid": {
    variants: ["grid-2", "grid-3", "list"],
    props: {
      title: STR(70),
      items: ARR(
        { kind: "obj", fields: { title: STR(50), text: STR(170) } },
        8,
      ),
    },
    required: ["items"],
  },
  "timeline-vertical": {
    variants: ["numbered", "dated"],
    props: {
      title: STR(70),
      steps: ARR(
        { kind: "obj", fields: { title: STR(60), text: STR(170) } },
        6,
      ),
    },
    required: ["steps"],
  },
  "quote-block": {
    variants: ["centered", "left-border"],
    props: { quote: STR(220), attribution: STR(60) },
    required: ["quote"],
  },
  "comparison-table": {
    variants: ["compact", "detailed"],
    props: {
      title: STR(60),
      columns: ARR(STR(30), 4),
      rows: ARR(
        { kind: "obj", fields: { label: STR(40), values: ARR(STR(30), 4) } },
        6,
      ),
    },
    required: ["columns", "rows"],
  },
  "quiz-preview": {
    variants: ["single", "carousel"],
    props: { title: STR(60), question: STR(170), options: ARR(STR(60), 5) },
    required: ["question", "options"],
  },
  "progress-tracker": {
    variants: ["horizontal", "vertical"],
    props: {
      title: STR(60),
      stages: ARR(
        {
          kind: "obj",
          fields: {
            label: STR(40),
            status: ENUM(["done", "current", "upcoming"]),
          },
        },
        6,
      ),
    },
    required: ["stages"],
  },
  "faq-accordion": {
    variants: ["default"],
    props: {
      title: STR(60),
      items: ARR({ kind: "obj", fields: { q: STR(110), a: STR(420) } }, 8),
    },
    required: ["items"],
  },
  "cta-band": {
    variants: ["solid", "outline"],
    props: { title: STR(80), text: STR(170), actionLabel: STR(34) },
    required: ["title", "actionLabel"],
  },
  spotlight: {
    variants: ["default"],
    props: {
      title: STR(80),
      paragraphs: ARR(STR(420), 3),
      bullets: ARR(STR(90), 4),
    },
    required: ["title", "paragraphs"],
  },
  "list-preview": {
    variants: ["cards", "rows"],
    props: {
      title: STR(70),
      items: ARR(
        { kind: "obj", fields: { title: STR(60), subtitle: STR(110) } },
        6,
      ),
    },
    required: ["items"],
  },
  "pricing-table": {
    variants: ["row", "cards"],
    props: {
      title: STR(60),
      plans: ARR(
        {
          kind: "obj",
          fields: { name: STR(34), price: STR(24), features: ARR(STR(70), 6) },
        },
        4,
      ),
    },
    required: ["plans"],
  },
  "steps-numbered": {
    variants: ["default"],
    props: { title: STR(60), steps: ARR(STR(150), 6) },
    required: ["steps"],
  },
  "media-gallery": {
    variants: ["strip", "grid"],
    props: { title: STR(60), captions: ARR(STR(70), 6) },
    required: ["captions"],
  },
  "dashboard-cards": {
    variants: ["default"],
    props: {
      title: STR(60),
      cards: ARR(
        { kind: "obj", fields: { label: STR(44), value: STR(24) } },
        6,
      ),
    },
    required: ["cards"],
  },
  "entity-list-preview": {
    variants: ["cards", "rows"],
    props: { entityLabel: STR(44), sampleItems: ARR(STR(70), 6) },
    required: ["entityLabel", "sampleItems"],
  },
  "banner-note": {
    variants: ["default"],
    props: { text: STR(210), tone: ENUM(["info", "warn", "success"]) },
    required: ["text"],
  },
  "chat-launcher-inline": {
    variants: ["default"],
    props: { title: STR(64), prompt: STR(110) },
    required: ["title", "prompt"],
  },
};

/** Mots interdits par module absent — même principe que le QA de
 *  aigentAgents.js, appliqué ici comme dernier filet : un bloc produit
 *  par l'IA ne peut jamais afficher un mot d'un module qui n'existe pas
 *  sur ce site (ex : "commande" sur un site sans module commandes). */
const MODULE_WORDS = {
  orders: /\bcommandes?\b|\bcolis\b|\blivraison\b|\bexp[ée]di/i,
  returns: /\bretours?\b|\brembours/i,
  booking: /\br[ée]serv\w*|\bcr[ée]neaux?\b|\bcouverts?\b|\brendez-vous\b/i,
  catalog: /\bproduits?\b|\bcatalogue\b|\barticles?\b/i,
};

function violatesModules(text, modules) {
  if (typeof text !== "string" || !text) return false;
  for (const [mod, re] of Object.entries(MODULE_WORDS)) {
    if (!modules[mod] && re.test(text)) return true;
  }
  return false;
}

/** Valide une valeur contre un schéma de champ (STR/ARR/ENUM/obj), en
 *  rejetant (retourne undefined) plutôt qu'en "réparant" un contenu
 *  suspect — mieux vaut un champ manquant qu'une donnée devinée. */
function validateField(schema, value, modules) {
  if (!schema || value == null) return undefined;
  if (schema.kind === "str") {
    if (typeof value !== "string") return undefined;
    const v = value.trim();
    if (!v || v.length > schema.max) return undefined;
    if (violatesModules(v, modules)) return undefined;
    return v;
  }
  if (schema.kind === "enum") {
    return schema.values.includes(value) ? value : undefined;
  }
  if (schema.kind === "obj") {
    if (!value || typeof value !== "object") return undefined;
    const out = {};
    for (const [k, sub] of Object.entries(schema.fields)) {
      const v = validateField(sub, value[k], modules);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (schema.kind === "arr") {
    if (!Array.isArray(value)) return undefined;
    const out = value
      .slice(0, schema.max)
      .map((item) => validateField(schema.of, item, modules))
      .filter((v) => v !== undefined);
    return out.length ? out : undefined;
  }
  return undefined;
}

/** Valide UN bloc {type, variant, props}. Rejette tout le bloc si un champ
 *  requis manque après validation — un bloc à moitié rempli ne s'affiche
 *  pas à moitié, il n'existe pas. */
function validateBlock(block, modules) {
  if (!block || typeof block !== "object") return null;
  const def = PRIMITIVES[block.type];
  if (!def) return null;
  const variant = def.variants.includes(block.variant)
    ? block.variant
    : def.variants[0];
  const props = {};
  for (const [key, schema] of Object.entries(def.props)) {
    const v = validateField(schema, block.props?.[key], modules);
    if (v !== undefined) props[key] = v;
  }
  for (const req of def.required || []) {
    if (!(req in props)) return null;
  }
  return { type: block.type, variant, props };
}

/** Valide un arbre de blocs entier (une page). Borné à 10 blocs par page :
 *  au-delà, une page devient illisible, pas plus impressionnante. C'est
 *  la SEULE porte d'entrée vers le rendu : tout arbre produit par une IA,
 *  quelle qu'elle soit, passe par ici avant d'exister sur le site livré. */
export function sanitizeBlockTree(tree, modules = {}) {
  if (!Array.isArray(tree)) return null;
  const blocks = tree
    .map((b) => validateBlock(b, modules))
    .filter(Boolean)
    .slice(0, 10);
  return blocks.length ? blocks : null;
}
