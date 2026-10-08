//======================================================================//
//  AiGENT AGENTS — équipe multi-IA pour l'écriture du site livré  (v2)
//----------------------------------------------------------------------//
//  CE QUI CHANGE PAR RAPPORT À v1 :
//   - v1 faisait réécrire par l'IA un texte plat (hero/features/steps/
//     benefits/spotlight) injecté dans un squelette de page FIXE : le
//     texte changeait, la mise en page ne changeait jamais. C'est ce qui
//     produisait "toujours le même site".
//   - v2 fait composer par l'IA un ARBRE DE BLOCS réel (accueil + pages
//     statiques du plan de site), choisi dans la bibliothèque de ~20
//     primitives de aigentBlocks.js — la même que celle que le site
//     compile côté client. L'agent "Rédaction" ne remplit plus des trous
//     dans un gabarit : il assemble la page, primitive par primitive,
//     avec un contenu propre à CE projet.
//   - Le texte plat (hero/features/steps/benefits/spotlight) est CONSERVÉ
//     mais rétrogradé au rang de filet de secours (`copyForFallback`) :
//     s'il ne reste rien d'exploitable de l'arbre de blocs (échec IA,
//     tout rejeté par le validateur), aigentGenerator.js retombe sur un
//     squelette varié construit à partir de ce texte, jamais sur un
//     squelette unique figé.
//   - Le panneau "Capacités de votre AiGENT" (conception ET build) a
//     désormais un repli déterministe basé sur mots-clés au lieu de
//     retomber sur le catalogue complet (13 outils, y compris réservation/
//     paiement) dès que l'IA échoue une fois — c'est ce qui produisait le
//     panneau incohérent signalé (compétences de réservation proposées
//     pour un site de révisions scolaires).
//
//  CE QUI NE CHANGE PAS :
//   - Aucune nouvelle clé, aucun nouveau fournisseur : on réutilise
//     callLLM (aiParsee-aigent.js), exactement la même cascade.
//   - Rien de ce qu'une IA produit n'est utilisé tel quel : tout texte
//     plat passe par qaFilterCopy/qaFilterAuthCopy, tout code passe par
//     staticSecurityScan, tout arbre de blocs passe par sanitizeBlockTree
//     (aigentBlocks.js) — deux fois : une fois ici en validation
//     structurelle permissive, une fois dans aigentGenerator.js avec les
//     VRAIS modules du site (le filtre anti-mots-hors-sujet définitif).
//   - PRIMITIVES et sanitizeBlockTree viennent de aigentBlocks.js, jamais
//     directement de aigentGenerator.js : aigentGenerator.js importe déjà
//     runMultiAgentBuild depuis ce fichier, un import dans l'autre sens
//     créerait un cycle. Voir aigentBlocks.js pour le détail.
//======================================================================//

import {
  callLLM,
  extractJSON,
  compactSpec,
  TOOL_CATALOG as TOOL_CATALOG_REF,
} from "./aiParsee-aigent.js";
import { PRIMITIVES, sanitizeBlockTree } from "./aigentBlocks.js";
import { qualityRulesFor } from "./aigentPromptRules.js";

/* ════════════════════════════════════════════════════════════════════
   0. LE "GROS DOSSIER" — lu par chaque agent avant de produire quoi
   que ce soit. C'est la charte de qualité du produit livré.
   ════════════════════════════════════════════════════════════════════ */

export const PRODUCT_QUALITY_GUIDE = `CHARTE QUALITÉ — PRODUIT AiGENT (site livré au client final)

Tu fais partie d'une petite équipe d'IA qui construit un vrai site pour un vrai client payant.
Ce que tu produis n'est jamais un brouillon : c'est ce que le client verra en premier. Le prix
du produit se justifie par cette exigence. Un texte générique, interchangeable avec n'importe
quel autre site, est un échec — même s'il est grammaticalement correct.

DESIGN (déjà en place, ne le remets pas en cause) :
- Inspiration Linear : sobre, beaucoup d'espace, hiérarchie typographique nette, une seule
  couleur d'accent, aucun dégradé décoratif, aucune icône superflue.
- Zéro émoji, zéro superlatif marketing ("révolutionnaire", "incroyable", "le meilleur").
- Les phrases sont courtes, concrètes, jamais génériques. Interdiction absolue de produire une
  phrase qui pourrait s'appliquer telle quelle à un autre secteur d'activité que celui décrit.

COMPOSITION (quand la tâche te demande de choisir des blocs) :
- Tu n'assembles PAS toujours le même enchaînement. Un site de révisions scolaires ne se
  compose pas comme une boutique ni comme un cabinet médical : choisis les primitives qui
  RACONTENT ce projet précis (une timeline pour un parcours, une comparison-table pour des
  offres à distinguer, un quote-block pour un témoignage, un stat-band pour des chiffres).
- Une page qui ne mérite pas 8 blocs n'en a pas 8 : mieux vaut 3 blocs justes que 8 blocs de
  remplissage.

FIDÉLITÉ AU DOMAINE (règle la plus importante) :
- Tu écris SEULEMENT sur ce que ce site fait réellement. Si le projet ne concerne ni commande, ni
  livraison, ni retour, ni réservation : n'utilise JAMAIS ces mots, même en passant, même en
  exemple. Un site de révisions ne parle pas de "créneaux" ; un site de conseil ne parle pas de
  "produits" ; un site associatif ne parle pas de "paiement" sauf s'il collecte des dons.
- Base-toi uniquement sur l'objectif, le public, le secteur et les missions fournis dans le
  CONTEXTE PARTAGÉ. N'invente pas de fonctionnalité absente de ce contexte.
- Utilise le vocabulaire du métier réel (un cabinet médical, un refuge animalier, une agence
  immobilière, un site de révisions... n'ont pas le même lexique).

LOGIQUE avant style : une jolie phrase creuse est un échec. Chaque texte doit répondre à une
question concrète que se pose le visiteur de CE site précis. Préfère une phrase factuelle et
spécifique à une phrase élégante et vague.

FORMAT : tu réponds UNIQUEMENT avec le JSON demandé, en français, sans balise, sans commentaire,
sans emoji, sans guillemets décoratifs autour des valeurs.`;

/* ════════════════════════════════════════════════════════════════════
   1. RÔLES DE L'ÉQUIPE
   ════════════════════════════════════════════════════════════════════ */

const ROLE = {
  lead: {
    label: "Lead / Orchestrateur",
    qualityRole: "architect",
    mission: "Découpe le travail et garde la cohérence globale.",
  },
  architect: {
    label: "Architecte de site",
    qualityRole: "architect",
    mission:
      "Décide, à partir du besoin réel, quelles pages, données et vocabulaire ce site précis a besoin — jamais un squelette fixe recopié d'un projet à l'autre.",
  },
  uiux: {
    label: "UI/UX",
    qualityRole: "design",
    mission:
      "Donne une direction de composition (rythme visuel, primitives à privilégier) que l'agent de rédaction suivra pour assembler des pages qui ne se ressemblent pas toutes.",
  },
  composer: {
    label: "Composition de pages",
    qualityRole: "frontend",
    mission:
      "Assemble l'accueil et les pages statiques du plan de site à partir de la bibliothèque de blocs, en choisissant primitives, variantes et contenu réellement propres à ce projet.",
  },
  copy: {
    label: "Rédaction",
    qualityRole: "product",
    mission:
      "Écrit le contenu de secours et les textes transverses (connexion, capacités) dans le vocabulaire réel du projet.",
  },
  backend: {
    label: "Backend",
    qualityRole: "backend",
    mission:
      "Identifie si une logique métier spécifique au secteur manque et, si besoin seulement, propose UNE fonction pure supplémentaire.",
  },
  security: {
    label: "Sécurité",
    qualityRole: "review",
    mission:
      "Analyse tout code produit par l'équipe avant qu'il ne soit intégrable. Aucune tolérance.",
  },
  qa: {
    label: "QA / Cohérence",
    qualityRole: "review",
    mission:
      "Vérifie que rien de générique, hors-sujet ou incohérent avec les modules du site n'est livré.",
  },
  integrator: {
    label: "Intégration",
    qualityRole: "architect",
    mission:
      "Assemble les décisions validées en un seul jeu de contenus prêt à être injecté dans le site.",
  },
};

/* ════════════════════════════════════════════════════════════════════
   2. MÉMOIRE DE PROJET PARTAGÉE
   Chaque agent lit ce que les précédents ont décidé.
   ════════════════════════════════════════════════════════════════════ */

function makeMemory(spec, bp) {
  const m = {
    brief: compactSpec(spec),
    bp: {
      domain: bp.domain,
      modules: bp.modules,
      bookingMode: bp.bookingMode,
      labels: bp.labels,
      nav: bp.nav.map((n) => n.label),
      featureSlots: bp.features.map((f) => ({ title: f.title, text: f.text })),
      stepsCount: bp.steps.length,
      benefitsCount: bp.benefits.length,
    },
    brand: null,
    designGuidance: null,
    homeBlocks: null,
    copyForFallback: null,
    backendTool: null,
    securityVerdict: null,
    qaVerdict: null,
    verifyVerdict: null,
    sitePlan: null,
    capabilities: null,
    authCopy: null,
    copyRejectionReason: null,
  };
  m.shared = () => {
    // Le domaine "réel" (tranché par l'architecte) prime sur la simple
    // classification par mots-clés dès qu'il est disponible : tous les
    // agents suivants doivent voir les VRAIS modules actifs, pas le
    // brouillon regex, sinon le panneau de capacités et la composition
    // peuvent rester incohérents avec la décision de l'architecte.
    const cm = m.sitePlan?.commerceModel;
    const merged = cm
      ? {
          orders:
            typeof cm.orders === "boolean" ? cm.orders : m.bp.modules.orders,
          returns:
            typeof cm.returns === "boolean" ? cm.returns : m.bp.modules.returns,
          booking:
            typeof cm.booking === "boolean" ? cm.booking : m.bp.modules.booking,
          catalog:
            typeof cm.catalog === "boolean" ? cm.catalog : m.bp.modules.catalog,
        }
      : m.bp.modules;
    return {
      domaine: m.sitePlan?.domainLabel || m.bp.domain,
      archétype: m.sitePlan?.archetype || "custom",
      assistant: m.sitePlan?.assistant || { enabled: false, mode: "none" },
      modules_actifs: Object.keys(merged).filter((k) => merged[k]),
      objectif: m.brief.purpose,
      public: m.brief.audience,
      secteur: m.brief.sector,
      ton_choisi: m.brand?.voice || null,
      mots_interdits: m.brand?.bannedWords || [],
      direction_composition: m.designGuidance || null,
      vocabulaire_reel: m.sitePlan?.vocabulary || null,
      pages_reelles: (m.sitePlan?.pages || []).map((p) => p.label),
    };
  };
  return m;
}

/* ════════════════════════════════════════════════════════════════════
   3. APPEL IA JSON (réutilise callLLM, jamais de nouvelle clé)
   ════════════════════════════════════════════════════════════════════ */

async function askJSON(role, memory, task, userPrompt, opts = {}) {
  const system = `${PRODUCT_QUALITY_GUIDE}

RÈGLES DÉTAILLÉES OBLIGATOIRES :
${qualityRulesFor(role.qualityRole || "product")}

RÔLE DANS L'ÉQUIPE : ${role.label}
MISSION : ${role.mission}
TÂCHE PRÉCISE : ${task}

CONTEXTE PARTAGÉ DU PROJET (ce que l'équipe a déjà décidé — reste cohérent) :
${JSON.stringify(memory.shared())}`;

  const raw = await callLLM(
    [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    {
      profile: "json",
      maxTokens: 900,
      temperature: 0.6,
      maxModelTries: 2,
      ...opts,
    },
  );

  if (!raw) return null;
  return extractJSON(raw);
}

/* ════════════════════════════════════════════════════════════════════
   4. GUIDE DE LA BIBLIOTHÈQUE DE BLOCS — dérivé de PRIMITIVES
   ────────────────────────────────────────────────────────────────────
   IMPORTANT : calculé PARESSEUSEMENT (jamais au chargement du module).
   PRIMITIVES vient de aigentBlocks.js, un module sans cycle avec celui-
   ci, mais la prudence coûte peu : on ne lit jamais un import au niveau
   racine du fichier, uniquement à l'intérieur d'une fonction appelée à
   l'exécution, une fois tous les modules chargés.
   ════════════════════════════════════════════════════════════════════ */

let _primitivesGuideCache = null;

function describeFieldSchema(schema) {
  if (!schema) return "valeur";
  if (schema.kind === "str") return `texte (≤${schema.max}c)`;
  if (schema.kind === "enum") return `un de ["${schema.values.join('","')}"]`;
  if (schema.kind === "arr") {
    if (schema.of?.kind === "obj") {
      const fields = Object.entries(schema.of.fields)
        .map(([k, s]) => `${k}:${describeFieldSchema(s)}`)
        .join(", ");
      return `liste (≤${schema.max}) de {${fields}}`;
    }
    return `liste (≤${schema.max}) de ${describeFieldSchema(schema.of)}`;
  }
  if (schema.kind === "obj") {
    return `{${Object.entries(schema.fields)
      .map(([k, s]) => `${k}:${describeFieldSchema(s)}`)
      .join(", ")}}`;
  }
  return "valeur";
}

function getPrimitivesGuide() {
  if (_primitivesGuideCache) return _primitivesGuideCache;
  _primitivesGuideCache = Object.entries(PRIMITIVES)
    .map(([type, def]) => {
      const req = new Set(def.required || []);
      const props = Object.entries(def.props)
        .map(
          ([key, schema]) =>
            `${key}${req.has(key) ? "*" : ""}: ${describeFieldSchema(schema)}`,
        )
        .join(" ; ");
      return `• ${type} — variantes: [${def.variants.join(", ")}] — champs (*=obligatoire) : ${props}`;
    })
    .join("\n");
  return _primitivesGuideCache;
}

/** Un jeu de modules "tout activé" pour la validation STRUCTURELLE
 *  préliminaire faite ici (bornes de longueur, types, variantes). Le
 *  filtre anti-mots-hors-sujet définitif utilise les VRAIS modules du
 *  site et n'a lieu qu'une fois dans aigentGenerator.js — double
 *  filtrage volontaire, jamais un raccourci "on lui fait confiance". */
const PERMISSIVE_MODULES = {
  orders: true,
  returns: true,
  booking: true,
  catalog: true,
};

/** Comme validateField/validateBlock de aigentBlocks.js, mais qui
 *  TRONQUE plutôt que rejette. Un modèle qui dépasse un champ de 8
 *  caractères ne doit pas perdre tout le bloc pour autant — le rejet
 *  définitif (y compris mots hors-sujet) reste le travail exclusif de
 *  sanitizeBlockTree, appelé juste après ce pré-nettoyage. */
function preTrimFieldValue(schema, value) {
  if (!schema || value == null) return undefined;
  if (schema.kind === "str") {
    if (typeof value !== "string") return undefined;
    const v = value.trim();
    return v ? v.slice(0, schema.max) : undefined;
  }
  if (schema.kind === "enum") {
    return schema.values.includes(value) ? value : undefined;
  }
  if (schema.kind === "obj") {
    if (!value || typeof value !== "object") return undefined;
    const out = {};
    for (const [k, sub] of Object.entries(schema.fields)) {
      const v = preTrimFieldValue(sub, value[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (schema.kind === "arr") {
    if (!Array.isArray(value)) return undefined;
    const out = value
      .slice(0, schema.max)
      .map((item) => preTrimFieldValue(schema.of, item))
      .filter((v) => v !== undefined);
    return out.length ? out : undefined;
  }
  return undefined;
}

function preTrimBlock(block) {
  if (!block || typeof block !== "object") return null;
  const def = PRIMITIVES[block.type];
  if (!def) return null;
  const variant = def.variants.includes(block.variant)
    ? block.variant
    : def.variants[0];
  const props = {};
  for (const [key, schema] of Object.entries(def.props)) {
    const v = preTrimFieldValue(schema, block.props?.[key]);
    if (v !== undefined) props[key] = v;
  }
  return { type: block.type, variant, props };
}

function preTrimBlocks(blocks) {
  return Array.isArray(blocks) ? blocks.map(preTrimBlock).filter(Boolean) : [];
}

/** Extrait tous les textes d'un arbre de blocs déjà validé, pour la
 *  vérification thématique (taskVerify) : on ne renvoie pas l'arbre
 *  JSON complet à l'IA vérificatrice, juste la matière textuelle. */
function collectStrings(v, out) {
  if (typeof v === "string") {
    if (v.trim()) out.push(v.trim());
  } else if (Array.isArray(v)) {
    v.forEach((x) => collectStrings(x, out));
  } else if (v && typeof v === "object") {
    Object.values(v).forEach((x) => collectStrings(x, out));
  }
}
function extractBlockStrings(blocks) {
  const out = [];
  for (const b of blocks || []) {
    for (const v of Object.values(b.props || {})) collectStrings(v, out);
  }
  return out.slice(0, 40);
}

/* ════════════════════════════════════════════════════════════════════
   5. CONTRÔLES QA DÉTERMINISTES — texte de secours (fallback)
   ════════════════════════════════════════════════════════════════════ */

const DOMAIN_WORDS = {
  orders: /\bcommandes?\b|\bcolis\b|\blivraison\b|\bexp[ée]di/i,
  returns: /\bretours?\b|\brembours/i,
  booking: /\br[ée]serv\w*|\bcr[ée]neaux?\b|\bcouverts?\b|\brendez-vous\b/i,
  catalog: /\bproduits?\b|\bcatalogue\b|\barticles?\b/i,
};

/** Retire les mentions d'un module absent du site — sans casser la phrase,
 *  on préfère rejeter tout le champ et retomber sur le texte déterministe. */
function violatesDomain(text, bp) {
  if (!text) return false;
  for (const [mod, re] of Object.entries(DOMAIN_WORDS)) {
    if (!bp.modules[mod] && re.test(text)) return true;
  }
  return false;
}

function withinLength(text, max) {
  return (
    typeof text === "string" && text.trim().length > 0 && text.length <= max
  );
}

/** Filtre le contenu de SECOURS proposé (hero/features/steps/benefits/
 *  spotlight) : chaque champ qui viole une règle est retiré. */
function qaFilterCopy(copy, bp) {
  if (!copy || typeof copy !== "object") return null;
  const out = {};
  if (
    copy.hero &&
    withinLength(copy.hero.title, 90) &&
    withinLength(copy.hero.lead, 260) &&
    !violatesDomain(copy.hero.title, bp) &&
    !violatesDomain(copy.hero.lead, bp)
  ) {
    out.hero = { title: copy.hero.title.trim(), lead: copy.hero.lead.trim() };
  }
  if (Array.isArray(copy.features)) {
    out.features = copy.features.map((f) => {
      const title =
        withinLength(f?.title, 40) && !violatesDomain(f.title, bp)
          ? f.title.trim()
          : null;
      const text =
        withinLength(f?.text, 160) && !violatesDomain(f.text, bp)
          ? f.text.trim()
          : null;
      return { title, text };
    });
  }
  if (
    Array.isArray(copy.steps) &&
    copy.steps.every((s) => withinLength(s, 140) && !violatesDomain(s, bp))
  ) {
    out.steps = copy.steps.map((s) => s.trim());
  }
  if (
    Array.isArray(copy.benefits) &&
    copy.benefits.length &&
    copy.benefits.every((b) => withinLength(b, 90) && !violatesDomain(b, bp))
  ) {
    out.benefits = copy.benefits.slice(0, 4).map((b) => b.trim());
  }
  if (
    copy.spotlight &&
    withinLength(copy.spotlight.title, 70) &&
    Array.isArray(copy.spotlight.paragraphs) &&
    copy.spotlight.paragraphs.length &&
    copy.spotlight.paragraphs.every(
      (p) => withinLength(p, 400) && !violatesDomain(p, bp),
    )
  ) {
    out.spotlight = {
      title: copy.spotlight.title.trim(),
      paragraphs: copy.spotlight.paragraphs.slice(0, 3).map((p) => p.trim()),
      bullets: Array.isArray(copy.spotlight.bullets)
        ? copy.spotlight.bullets
            .filter((b) => withinLength(b, 80) && !violatesDomain(b, bp))
            .slice(0, 4)
            .map((b) => b.trim())
        : [],
    };
  }
  return out;
}

function qaFilterAuthCopy(copy, bp) {
  if (!copy || typeof copy !== "object") return null;
  const okText = (t, max) => withinLength(t, max) && !violatesDomain(t, bp);
  if (
    !okText(copy.loginTitle, 60) ||
    !okText(copy.loginSub, 160) ||
    !okText(copy.registerTitle, 60) ||
    !okText(copy.registerSub, 160) ||
    !okText(copy.loginCta, 30) ||
    !okText(copy.registerCta, 30)
  ) {
    return null;
  }
  return {
    loginTitle: copy.loginTitle.trim(),
    loginSub: copy.loginSub.trim(),
    registerTitle: copy.registerTitle.trim(),
    registerSub: copy.registerSub.trim(),
    loginCta: copy.loginCta.trim(),
    registerCta: copy.registerCta.trim(),
  };
}

/* ── Scanner statique du code produit par l'agent Backend ── */
const CODE_DENYLIST = [
  /require\s*\(/,
  /\bimport\s*\(/,
  /child_process/,
  /\bfs\b/,
  /process\s*\.\s*env/,
  /\beval\s*\(/,
  /new\s+Function/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /__proto__/,
  /globalThis/,
  /\bwhile\s*\(\s*true\s*\)/,
  /process\s*\.\s*exit/,
  /require\.resolve/,
];
function staticSecurityScan(jsBody) {
  if (typeof jsBody !== "string" || !jsBody.trim() || jsBody.length > 3000) {
    return { pass: false, reason: "vide ou trop volumineux" };
  }
  for (const re of CODE_DENYLIST) {
    if (re.test(jsBody))
      return { pass: false, reason: `motif interdit : ${re}` };
  }
  if (!/export\s+(async\s+)?function/.test(jsBody)) {
    return { pass: false, reason: "doit exporter une fonction" };
  }
  return { pass: true };
}

/* ════════════════════════════════════════════════════════════════════
   6. FILTRE DÉTERMINISTE DU PLAN DE SITE (structure uniquement — les
   blocs de contenu sont produits et validés séparément, cf. section 7)
   ════════════════════════════════════════════════════════════════════ */

const PAGE_KINDS = [
  "home",
  "list",
  "detail",
  "dashboard",
  "form",
  "chat",
  "static",
  "lesson",
  "quiz",
  "progress",
  "settings",
  "library",
  "workspace",
  "auth",
  "profile",
];

const WORKSPACE_FEATURES = [
  { id: "overview", label: "Vue d'ensemble", path: "/overview", kind: "dashboard", match: /tableau de bord|vue d'ensemble|overview|dashboard/i },
  { id: "inbox", label: "Inbox", path: "/inbox", kind: "list", entity: "notifications", match: /\binbox\b|notifications? intelligentes?|file d'action/i },
  { id: "projects", label: "Projets", path: "/projects", kind: "list", entity: "projects", match: /projets?|roadmap/i },
  { id: "tasks", label: "Tâches", path: "/tasks", kind: "list", entity: "tasks", match: /tâches?|actions? à (?:faire|exécuter)|deadlines?|échéances?/i },
  { id: "documents", label: "Documents", path: "/documents", kind: "list", entity: "documents", match: /documents?|fichiers?/i },
  { id: "team", label: "Équipe", path: "/team", kind: "list", entity: "teams", match: /équipes?|permissions par utilisateur/i },
  { id: "messages", label: "Messages", path: "/messages", kind: "list", entity: "messages", match: /messagerie|messages?|conversations?/i },
  { id: "meetings", label: "Réunions", path: "/meetings", kind: "list", entity: "meetings", match: /réunions?|compte rendu/i },
  { id: "decisions", label: "Décisions", path: "/decisions", kind: "list", entity: "decisions", match: /décisions?/i },
  { id: "search", label: "Recherche", path: "/search", kind: "workspace", match: /recherche globale|recherche intelligente|retrouver une information/i },
  { id: "agents", label: "Agents", path: "/agents", kind: "list", entity: "agents", match: /agents? spécialisés?|orchestrateur|project agent|document agent|meeting agent|communication agent|research agent|finance agent|strategy agent/i },
  { id: "analytics", label: "Analytics", path: "/analytics", kind: "dashboard", match: /analytics|indicateurs|kpi|statistiques/i },
  { id: "settings", label: "Paramètres", path: "/settings", kind: "settings", match: /paramètres?|settings/i },
  { id: "profile", label: "Profil", path: "/profile", kind: "profile", auth: true, match: /profil|compte utilisateur|utilisateur connecté/i },
  { id: "sign-in", label: "Connexion", path: "/connexion", kind: "auth", match: /\bconnexion\b|login|sign[ -]?in|authentification/i },
];

const WORKSPACE_ENTITIES = {
  notifications: { label: "Notification", fields: [{ key: "title", label: "Titre", type: "text" }, { key: "body", label: "Détail", type: "richtext" }, { key: "status", label: "État", type: "text" }, { key: "project_id", label: "Projet associé", type: "text" }, { key: "due_date", label: "Échéance", type: "date" }] },
  projects: { label: "Projet", fields: [{ key: "title", label: "Nom", type: "text" }, { key: "description", label: "Description", type: "richtext" }, { key: "status", label: "État", type: "text" }, { key: "owner_id", label: "Responsable", type: "text" }, { key: "team_id", label: "Équipe", type: "text" }, { key: "due_date", label: "Échéance", type: "date" }, { key: "progress", label: "Progression", type: "number" }] },
  tasks: { label: "Tâche", fields: [{ key: "title", label: "Tâche", type: "text" }, { key: "project_id", label: "Projet", type: "text" }, { key: "assignee_id", label: "Responsable", type: "text" }, { key: "status", label: "État", type: "text" }, { key: "priority", label: "Priorité", type: "text" }, { key: "due_date", label: "Échéance", type: "date" }] },
  documents: { label: "Document", fields: [{ key: "title", label: "Nom", type: "text" }, { key: "project_id", label: "Projet", type: "text" }, { key: "team_id", label: "Équipe", type: "text" }, { key: "source", label: "Source", type: "text" }, { key: "url", label: "Lien", type: "text" }, { key: "visibility", label: "Visibilité", type: "text" }] },
  teams: { label: "Équipe", fields: [{ key: "name", label: "Nom", type: "text" }, { key: "lead_id", label: "Responsable", type: "text" }, { key: "description", label: "Description", type: "richtext" }] },
  messages: { label: "Message", fields: [{ key: "conversation_id", label: "Conversation", type: "text" }, { key: "author_id", label: "Auteur", type: "text" }, { key: "project_id", label: "Projet", type: "text" }, { key: "body", label: "Message", type: "richtext" }] },
  meetings: { label: "Réunion", fields: [{ key: "title", label: "Sujet", type: "text" }, { key: "project_id", label: "Projet", type: "text" }, { key: "starts_at", label: "Date", type: "date" }, { key: "attendees", label: "Participants", type: "richtext" }, { key: "summary", label: "Compte rendu", type: "richtext" }, { key: "status", label: "État", type: "text" }] },
  decisions: { label: "Décision", fields: [{ key: "title", label: "Décision", type: "text" }, { key: "project_id", label: "Projet", type: "text" }, { key: "meeting_id", label: "Réunion", type: "text" }, { key: "owner_id", label: "Responsable", type: "text" }, { key: "rationale", label: "Contexte", type: "richtext" }, { key: "created_at", label: "Date", type: "date" }] },
  agents: { label: "Agent spécialisé", fields: [{ key: "name", label: "Nom", type: "text" }, { key: "specialty", label: "Spécialité", type: "text" }, { key: "status", label: "État", type: "text" }, { key: "description", label: "Mission", type: "richtext" }] },
};

function briefText(spec = {}) {
  const missions = (spec.missions || []).map((item) => typeof item === "string" ? item : item?.label || "");
  return [spec.name, spec.purpose, spec.tagline, spec.sector, ...missions].filter(Boolean).join(" ").toLowerCase();
}

function isPrivateWorkspaceBrief(spec = {}) {
  return /startup|\bworkspace\b|espace de travail|plateforme collaborative|système d'exploitation|système d’exploitation|\bintranet\b/i.test(briefText(spec));
}

function qaFilterSitePlan(plan) {
  if (!plan || typeof plan !== "object") return null;

  const okEntity = (e) =>
    e &&
    typeof e === "object" &&
    typeof e.id === "string" &&
    /^[a-z][a-z0-9_]*$/.test(e.id) &&
    typeof e.label === "string" &&
    e.label.trim() &&
    Array.isArray(e.fields) &&
    e.fields.length > 0 &&
    e.fields.every(
      (f) =>
        f &&
        typeof f.key === "string" &&
        /^[a-z][a-z0-9_]*$/.test(f.key) &&
        typeof f.label === "string" &&
        f.label.trim() &&
        ["text", "number", "date", "richtext"].includes(f.type),
    );
  const entities = Array.isArray(plan.entities)
    ? plan.entities
        .filter(okEntity)
        .slice(0, 20)
        .map((e) => ({ ...e, fields: e.fields.slice(0, 20) }))
    : [];
  const entityIds = new Set(entities.map((e) => e.id));

  const okPage = (p) =>
    p &&
    typeof p === "object" &&
    typeof p.id === "string" &&
    /^[a-z][a-z0-9-]*$/.test(p.id) &&
    p.path !== "/" &&
    typeof p.label === "string" &&
    p.label.trim() &&
    typeof p.path === "string" &&
    p.path.startsWith("/") &&
    PAGE_KINDS.includes(p.kind);

  const seenPaths = new Set();
  const pages = Array.isArray(plan.pages)
    ? plan.pages
        .filter(okPage)
        .filter((p) => !p.entity || entityIds.has(p.entity))
        .filter((p) =>
          seenPaths.has(p.path) ? false : (seenPaths.add(p.path), true),
        )
        .slice(0, 24)
        .map((p) => ({
          id: p.id,
          label: String(p.label).slice(0, 60),
          path: p.path,
          kind: p.kind,
          entity: p.entity && entityIds.has(p.entity) ? p.entity : null,
          auth: !!p.auth,
          features: cleanPlanItems(p.features, ["id", "label", "description", "kind"]),
          components: cleanPlanItems(p.components, ["id", "label", "description", "kind"]),
          actions: cleanPlanItems(p.actions, ["id", "label", "description", "operation"]),
        }))
    : [];
  if (!pages.length) return null; // rien d'exploitable : repli sur le squelette existant

  const pageIds = new Set(pages.map((p) => p.id));
  const nav = Array.isArray(plan.nav)
    ? plan.nav.filter((id) => pageIds.has(id)).slice(0, 24)
    : pages.map((p) => p.id);

  const vocab =
    plan.vocabulary && typeof plan.vocabulary === "object"
      ? {
          itemSingular: String(plan.vocabulary.itemSingular || "").slice(0, 40),
          itemPlural: String(plan.vocabulary.itemPlural || "").slice(0, 40),
          actionVerb: String(plan.vocabulary.actionVerb || "").slice(0, 40),
        }
      : { itemSingular: "", itemPlural: "", actionVerb: "" };

  const cm =
    plan.commerceModel && typeof plan.commerceModel === "object"
      ? plan.commerceModel
      : null;
  const boolOrNull = (v) => (typeof v === "boolean" ? v : null);
  const commerceModel = cm
    ? {
        orders: boolOrNull(cm.orders),
        returns: boolOrNull(cm.returns),
        booking: boolOrNull(cm.booking),
        catalog: boolOrNull(cm.catalog),
        bookingKind: ["table", "rdv", "generic"].includes(cm.bookingKind)
          ? cm.bookingKind
          : null,
        catalogIsMenu: boolOrNull(cm.catalogIsMenu),
      }
    : null;

  return {
    domainLabel:
      typeof plan.domainLabel === "string" ? plan.domainLabel.slice(0, 60) : "",
    archetype: ["learning", "coaching", "dashboard", "editorial", "community", "service", "ecommerce", "booking", "custom"].includes(plan.archetype)
      ? plan.archetype
      : "custom",
    assistant: plan.assistant && typeof plan.assistant === "object"
      ? {
          enabled: plan.assistant.enabled === true,
          mode: ["inline", "page", "contextual", "none"].includes(plan.assistant.mode) ? plan.assistant.mode : "none",
          pageId: typeof plan.assistant.pageId === "string" && /^[a-z][a-z0-9-]*$/.test(plan.assistant.pageId) ? plan.assistant.pageId : null,
        }
      : { enabled: false, mode: "none", pageId: null },
    commerceModel,
    vocabulary: vocab,
    entities,
    pages,
    nav,
    authRequired: plan.authRequired === true,
  };
}

function cleanPlanItems(items, keys) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 30).flatMap((item, index) => {
    if (typeof item === "string") return [{ id: `item-${index + 1}`, label: item.slice(0, 100) }];
    if (!item || typeof item !== "object") return [];
    const clean = {};
    for (const key of keys) if (typeof item[key] === "string" && item[key].trim()) clean[key] = item[key].trim().slice(0, 180);
    return clean.label || clean.id ? [clean] : [];
  });
}
function completePlanFromBrief(plan, spec = {}) {
  if (!plan) return null;
  // Cette étape normalise déjà le contrat dans qaFilterSitePlan. Elle ne
  // doit jamais inventer des pages à partir de mots-clés du prompt.
  return plan;
}

function sitePlanRelevanceErrors(plan, spec = {}) {
  if (!plan) return ["plan absent"];
  const brief = briefText(spec);
  const proposed = [plan.domainLabel, plan.archetype, ...(plan.entities || []).map((item) => item.label),
    ...(plan.pages || []).flatMap((page) => [page.label, page.id, ...(page.features || []).map((item) => `${item.label || ""} ${item.description || ""}`)])]
    .filter(Boolean).join(" ").toLocaleLowerCase("fr");
  const domains = [
    { id: "restauration", brief: /restaurant|restauration|restaurateur|cuisine|traiteur|menu|service en salle/i, plan: /restaurant|restauration|restaurateur|cuisine|traiteur|menu|plat|réservation de table|commande à emporter/i },
    { id: "archives", brief: /archive|archivage|archives|patrimoine documentaire/i, plan: /archive|archivage|archives|document|dossier|patrimoine documentaire/i },
    { id: "éducation", brief: /école|élève|élèves|professeur|pronote|cours scolaires?|devoirs scolaires?|bulletins? scolaires?|révisions scolaires?/i, plan: /école|élève|professeur|cours|scolaire|devoir|notes|révision|quiz|leçon/i },
    { id: "immobilier", brief: /immobilier|logement|appartement|maison|location|propriétaire|locataire/i, plan: /immobilier|logement|appartement|maison|location|propriétaire|locataire|annonce immobilière/i },
    { id: "e-commerce", brief: /boutique en ligne|e-commerce|panier|catalogue produit|produits à vendre/i, plan: /boutique|e-commerce|panier|catalogue produit|produits à vendre/i },
    { id: "santé", brief: /santé|patient|médical|cabinet médical|clinique|soin/i, plan: /santé|patient|médical|clinique|soin|rendez-vous médical/i },
  ];
  const requested = domains.filter((domain) => domain.brief.test(brief));
  const mismatches = requested.filter((domain) => !domain.plan.test(proposed));
  if (mismatches.length) return [`Le plan ne reprend aucun élément du domaine explicitement demandé (${mismatches.map((item) => item.id).join(", ")}).`];
  if (/^(?:une phrase|mot-clé|…|\.\.\.)$/i.test(String(plan.domainLabel || "").trim())) return ["le domaine du plan est resté un exemple de schéma"];
  return [];
}

function sitePlanCoverageErrors(plan, spec) {
  const brief = [spec.purpose, ...(spec.missions || [])].filter(Boolean).join(" ").toLowerCase();
  const educationContext = /\b(école|scolaire|étudiant|études|lycée|collège|université|enseignant|professeur|élève|formation|pédagogique|apprentissage|académique|cours)\b/i.test(brief);
  const pages = (plan?.pages || []).map((page) => {
    const entity = (plan.entities || []).find((item) => item.id === page.entity);
    return [page.id, page.label, page.kind, page.path, entity?.id, entity?.label,
      ...(page.features || []).flatMap((item) => Object.values(item)),
      ...(page.components || []).flatMap((item) => Object.values(item)),
      ...(page.actions || []).flatMap((item) => Object.values(item))]
      .filter(Boolean).join(" ").toLowerCase();
  }).join(" ");
  const errors = [];
  const checks = [
    [/\b(quiz|qcm|questionnaire)s?\b/i, /quiz|qcm|questionnaire/i, "quiz / QCM"],
    [/\b(exercices?|s'exercer|entraînement)\b/i, /exercice|s'exercer|entraînement|entrainement/i, "exercices"],
    [/\b(tests?|évaluations?|contrôles?)\b/i, /test|évaluation|evaluation|contrôle|controle/i, "tests / évaluations"],
    [/simulation.{0,24}(ds|devoir surveillé)|\b(ds|devoir surveillé)\b/i, /simulation|devoir surveillé|\bds\b/i, "simulation de DS"],
    [/correction.{0,20}(ia|automatique)|corrigés? par l'ia|correction ia/i, /correction|corrigé|feedback/i, "correction des réponses"],
  ];
  const missing = educationContext ? checks.filter(([requested, covered]) => requested.test(brief) && !covered.test(pages)).map(([, , label]) => label) : [];
  if (missing.length) errors.push(`Fonctionnalités éducatives non couvertes dans les pages, modules, composants ou actions : ${missing.join(", ")}.`);
  if (educationContext && /\b(progression|progrès|suivi des résultats|scores?)\b/i.test(brief) && !/(progression|progrès|suivi|score|résultat|évolution|dashboard|statistique)/i.test(pages)) errors.push("Suivi de progression demandé, mais aucune page ni aucun module/composant/action ne le décrit.");
  const workspaceChecks = [
    [/(notes?|bulletins?|moyennes?)/i, /notes?|bulletin|moyenne/i, "notes"],
    [/(devoirs?|travaux à rendre)/i, /devoir|travail à rendre/i, "devoirs"],
    [/(emploi du temps|planning|agenda)/i, /emploi du temps|planning|agenda|calendrier/i, "emploi du temps"],
    [/(messagerie|messages?)/i, /messagerie|message|conversation/i, "messagerie"],
    [/(tableau de bord|vue d'ensemble)/i, /tableau de bord|vue d'ensemble|dashboard|priorités/i, "tableau de bord"],
  ];
  for (const [requested, covered, label] of workspaceChecks) if ((!educationContext || !["notes", "devoirs"].includes(label)) && requested.test(brief) && !covered.test(pages)) errors.push(`Exigence métier « ${label} » sans fonctionnalité, composant ou action déclaré.`);  if (educationContext && /\b(leçons?|cours|révisions?|matières?|apprentissage)\b/i.test(brief) && !/(leçon|\bcours\b|révision|matière|apprentissage|lesson|library)/i.test(pages)) errors.push("Contenu de cours demandé, mais aucune page ni aucun module/composant/action ne le décrit.");
  if (/(paramètre|préférence|profil|mon compte)/i.test(brief) && !/(paramètre|préférence|profil|compte|settings)/i.test(pages)) errors.push("Espace de compte ou paramètres demandé, mais aucune page ni aucun module correspondant n'est décrit.");
  return errors;
}

function plannerTrace(stage, details = {}) {
  console.info(JSON.stringify({ subsystem: "aigent.planner", stage, ...details }));
}

function planShape(plan) {
  return {
    type: plan == null ? "null" : typeof plan,
    pagesCount: Array.isArray(plan?.pages) ? plan.pages.length : 0,
    entitiesCount: Array.isArray(plan?.entities) ? plan.entities.length : 0,
    pages: (plan?.pages || []).map((page) => ({
      id: page.id, label: page.label, path: page.path, kind: page.kind,
      entity: page.entity || null,
      features: (page.features || []).length,
      components: (page.components || []).length,
      actions: (page.actions || []).length,
    })),
  };
}

function detectedRequirements(spec = {}) {
  const text = briefText(spec);
  const educationContext = /\b(école|scolaire|étudiant|études|lycée|collège|université|enseignant|professeur|élève|formation|pédagogique|apprentissage|académique|cours)\b/i.test(text);
  const catalog = [
    [/\b(quiz|qcm|questionnaire)s?\b/i, "quiz / QCM", true], [/\b(exercices?|s'exercer|entraînement)\b/i, "exercices", true],
    [/\b(tests?|évaluations?|contrôles?)\b/i, "tests / évaluations", true], [/simulation.{0,24}(ds|devoir surveillé)|\b(ds|devoir surveillé)\b/i, "simulation de DS", true],
    [/correction.{0,20}(ia|automatique)|corrigés? par l'ia|correction ia/i, "correction des réponses", true],
    [/\b(progression|progrès|suivi des résultats|scores?)\b/i, "suivi de progression", true], [/\b(notes?|bulletins?|moyennes?)\b/i, "notes", true],
    [/\b(devoirs?|travaux à rendre)\b/i, "devoirs", true], [/emploi du temps|planning|agenda/i, "emploi du temps"],
    [/messagerie|messages?/i, "messagerie"], [/tableau de bord|vue d'ensemble/i, "tableau de bord"],
    [/\b(leçons?|cours|révisions?|matières?|apprentissage)\b/i, "cours et leçons", true],
  ];
  return catalog.filter(([pattern, , educationOnly]) => (!educationOnly || educationContext) && pattern.test(text)).map(([, label]) => label);
}

function addDeterministicCoverage(plan, spec) {
  if (!plan) return plan;
  const text = briefText(spec);
  const educationContext = /\b(école|scolaire|étudiant|études|lycée|collège|université|enseignant|professeur|élève|formation|pédagogique|apprentissage|académique|cours)\b/i.test(text);
  const ensure = (requested, needles, label, description) => {
    if (!requested.test(text)) return;
    const entries = plan.pages.flatMap((page) => [...(page.features || []), ...(page.components || []), ...(page.actions || [])]);
    if (entries.some((entry) => needles.test(`${entry.id || ""} ${entry.label || ""} ${entry.description || ""}`))) return;
    const page = plan.pages.find((item) => ["workspace", "dashboard", "home", "list"].includes(item.kind)) || plan.pages[0];
    page.features ||= [];
    page.features.push({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, description, kind: "module" });
  };
  if (educationContext) {
  ensure(/\b(quiz|qcm|questionnaire)s?\b/i, /quiz|qcm|questionnaire/i, "Quiz et QCM", "Créer et réaliser des quiz et QCM pour vérifier les acquis, puis consulter les réponses.");
  ensure(/\b(exercices?|s'exercer|entraînement)\b/i, /exercice|s'exercer|entraînement|entrainement/i, "Exercices", "Proposer des exercices d'entraînement adaptés aux notions étudiées.");
  ensure(/\b(tests?|évaluations?|contrôles?)\b/i, /test|évaluation|evaluation|contrôle|controle/i, "Évaluations", "Préparer et suivre les tests et évaluations demandés.");
  ensure(/simulation.{0,24}(ds|devoir surveillé)|\b(ds|devoir surveillé)\b/i, /simulation|devoir surveillé|\bds\b/i, "Simulation de DS", "Générer une simulation de devoir surveillé et s'entraîner dans les conditions prévues.");
  ensure(/correction.{0,20}(ia|automatique)|corrigés? par l'ia|correction ia/i, /correction|corrigé|feedback/i, "Correction des réponses", "Corriger les réponses et fournir un retour expliquant les points à reprendre.");
  ensure(/progression|progrès|suivi des résultats|scores?/i, /progression|progrès|suivi|score|résultat|évolution|dashboard|statistique/i, "Suivi de progression", "Suivre les résultats et visualiser l’évolution des acquis.");
  ensure(/notes?|bulletins?|moyennes?/i, /notes?|bulletin|moyenne/i, "Notes et moyennes", "Consulter les notes, moyennes et résultats scolaires.");
  ensure(/devoirs?|travaux à rendre/i, /devoir|travail à rendre/i, "Devoirs", "Consulter les devoirs et suivre les travaux à rendre.");
  ensure(/emploi du temps|planning|agenda/i, /emploi du temps|planning|agenda|calendrier/i, "Emploi du temps", "Consulter les cours et échéances dans un planning.");
  ensure(/messagerie|messages?/i, /messagerie|message|conversation/i, "Messagerie", "Échanger des messages liés au parcours scolaire.");
  ensure(/tableau de bord|vue d'ensemble/i, /tableau de bord|vue d'ensemble|dashboard|priorités/i, "Tableau de bord", "Afficher une vue d’ensemble et les priorités de l’utilisateur.");
  ensure(/\b(leçons?|cours|révisions?|matières?|apprentissage)\b/i, /leçon|\bcours\b|révision|matière|apprentissage|lesson|library/i, "Cours et leçons", "Organiser les cours et leçons pour faciliter les révisions.");
  }
  return plan;
}

export function buildDeterministicSitePlan(spec = {}) {
  const seed = qaFilterSitePlan({
    archetype: "custom", domainLabel: spec.sector || "Espace de travail",
    assistant: { enabled: false, mode: "none", pageId: null },
    commerceModel: { orders: false, returns: false, booking: false, bookingKind: null, catalog: false, catalogIsMenu: false },
    vocabulary: { itemSingular: "élément", itemPlural: "éléments", actionVerb: "gérer" },
    entities: [], nav: ["workspace"],
    pages: [{ id: "workspace", label: spec.name || "Espace principal", path: "/workspace", kind: "workspace", entity: null, auth: false,
      features: [{ id: "workspace-overview", label: "Espace métier", description: spec.purpose || "Retrouver les fonctions principales du service." }], components: [], actions: [] }],
  });
  const completed = completePlanFromBrief(seed, spec);
  const plan = addDeterministicCoverage(completed, spec);
  return { ...plan, entities: plan.entities || [], pages: plan.pages || [], nav: plan.nav || [] };
}
/** L'architecte comprend le VRAI projet et décide de son vrai domaine
 *  commercial ainsi que de ses pages/données/vocabulaire propres. Tourne
 *  seul et en premier : tout le reste de l'équipe lit son résultat via
 *  memory.shared(). Ne produit PAS encore le contenu des pages — ça, c'est
 *  le travail de taskComposeBlocks (section 7), pour garder chaque agent
 *  concentré sur une seule responsabilité. */
async function taskSitePlan(memory) {
  plannerTrace("generation.start", { expectedShape: ["archetype", "entities[]", "pages[]", "nav[]"] });
  const json = await askJSON(
    ROLE.architect,
    memory,
     "Conçois l'architecture réelle de cette application à partir du besoin. Choisis un archétype métier, les vraies pages, entités et le vocabulaire. La classification commerce est seulement un sous-ensemble : pour l'éducation, le sport, la santé, le suivi personnel ou tout autre sujet, mets commandes/retours/réservation/catalogue à false sauf demande explicite. Un article de cours, une leçon ou une carte géographique n'est pas un produit de boutique. Le chat assistant est facultatif; décide s'il sert ce parcours et où il vit. N'invente rien qui ne serait pas rendable.",
    `Projet : ${JSON.stringify(memory.brief)}
Classification par mots-clés faite en secours (à corriger si elle se trompe — un site qui parle de 'suivre ses révisions' n'est PAS une commande, par exemple) : ${JSON.stringify(memory.bp.modules)}

Types de page autorisés : ${PAGE_KINDS.join(", ")}
Archétypes : learning, coaching, dashboard, editorial, community, service, ecommerce, booking, custom.
Une page de type "list"/"detail"/"form" doit référencer une entité déclarée ci-dessous.
Ne propose jamais de page au chemin "/" : c'est déjà l'accueil.

Réponds avec ce JSON exact :
{
  "archetype": "learning|coaching|dashboard|editorial|community|service|ecommerce|booking|custom",
  "assistant": {"enabled":true|false,"mode":"inline|page|contextual|none","pageId":"identifiant de page ou null"},
  "domainLabel": "2 à 4 mots décrivant le vrai secteur du projet",
  "commerceModel": {
    "orders": true|false,
    "returns": true|false,
    "booking": true|false,
    "bookingKind": "table|rdv|generic|null",
    "catalog": true|false,
    "catalogIsMenu": true|false
  },
  "vocabulary": {"itemSingular":"…","itemPlural":"…","actionVerb":"…"},
  "entities": [{"id":"slug_court","label":"…","fields":[{"key":"slug_champ","label":"…","type":"text|number|date|richtext"}]}],
  "pages": [{"id":"slug_page","label":"…","path":"/chemin","kind":"home|list|detail|dashboard|form|chat|static|workspace|settings|profile|auth","entity":"id entité ou null","auth":true|false,"features":[{"id":"…","label":"capacité métier","description":"fonction concrète proposée dans cette page","kind":"module"}],"components":[{"id":"…","label":"composant visible","description":"rôle du composant"}],"actions":[{"id":"…","label":"action","description":"résultat attendu","operation":"create|read|update|delete|analyze"}]}],
  "authRequired": true|false,
  "nav": ["id de page", "…"]
}
"commerceModel" doit refléter la RÉALITÉ du projet, pas la classification par mots-clés fournie en contexte si elle se trompe. Maximum 20 entités, 24 pages et 20 champs par entité. Couvre chaque rubrique demandée explicitement et décris les capacités, composants et actions de chaque page. Une fonctionnalité peut vivre dans une page sans route dédiée. Pour une plateforme privée de travail d'équipe, prévois connexion, profil, permissions et protège les données.`,
    {
      maxTokens: 6000,
      profile: "deep",
      maxModelTries: 1,
      order: ["github", "gemini", "groq", "pollinations", "openrouter", "cerebras", "nvidia", "mistral", "cohere", "cloudflare"],
    },
  );
  plannerTrace("parse.complete", { parsed: Boolean(json), keys: json && typeof json === "object" ? Object.keys(json) : [], rawPlanShape: planShape(json) });
  const filtered = qaFilterSitePlan(json);
  const relevanceErrors = filtered ? sitePlanRelevanceErrors(filtered, memory.brief) : [];
  plannerTrace("normalization.complete", { accepted: Boolean(filtered) && !relevanceErrors.length, reason: !filtered ? "plan null ou aucune page conforme au schéma" : relevanceErrors[0] || null, plan: planShape(filtered) });
  memory.sitePlan = filtered && !relevanceErrors.length ? filtered : null;
  if (filtered && relevanceErrors.length) plannerTrace("selection.rejected", { reason: "plan hors sujet", errors: relevanceErrors, plan: planShape(filtered) });
  plannerTrace("completion.complete", { plan: planShape(memory.sitePlan) });
  if (!memory.sitePlan) {
    throw new Error("Le plan d'architecture IA est invalide ou hors sujet. Aucun plan générique ne sera substitué.");
  }
  plannerTrace("initial.validation", { requirements: detectedRequirements(memory.brief), missing: sitePlanCoverageErrors(memory.sitePlan, memory.brief), plan: planShape(memory.sitePlan) });
  return memory.sitePlan;
}

async function taskRepairSitePlan(memory, errors) {
  plannerTrace("repair.generation.start", { missing: errors, currentPlan: planShape(memory.sitePlan) });
  const json = await askJSON(
    ROLE.architect,
    memory,
    "Répare le plan incomplet. Une exigence peut être couverte par une feature, un composant ou une action dans une page existante; ne crée une page dédiée que si le parcours le justifie. Préserve les pages utiles et décris les capacités ajoutées.",
    `Plan à corriger : ${JSON.stringify(memory.sitePlan)}\n\nFonctionnalités manquantes (à traiter sémantiquement dans les pages/modules/composants/actions) :\n- ${errors.join("\n- ")}\n\nBesoin : ${JSON.stringify(memory.brief)}\n\nRetourne le plan JSON complet au même format que la tâche d'architecture : archetype, assistant, domainLabel, commerceModel, vocabulary, entities, pages et nav. Le site est personnalisé au besoin; ne crée aucun catalogue de boutique sauf demande explicite.`,
    {
      maxTokens: 2800,
      profile: "deep",
      maxModelTries: 1,
      order: ["github", "gemini", "groq", "pollinations", "openrouter", "cerebras", "nvidia", "mistral", "cohere", "cloudflare"],
    },
  );
  plannerTrace("repair.parse.complete", { parsed: Boolean(json), keys: json && typeof json === "object" ? Object.keys(json) : [], rawPlanShape: planShape(json) });
  const repaired = qaFilterSitePlan(json);
  plannerTrace("repair.normalization.complete", { accepted: Boolean(repaired), plan: planShape(repaired) });
  if (repaired) memory.sitePlan = repaired;
  plannerTrace("repair.revalidation", { missing: sitePlanCoverageErrors(memory.sitePlan, memory.brief), plan: planShape(memory.sitePlan) });
  return repaired;
}

/* ════════════════════════════════════════════════════════════════════
   7. COMPOSITION RÉELLE — accueil + pages statiques, par blocs
   ════════════════════════════════════════════════════════════════════ */

async function taskDesign(memory) {
  const json = await askJSON(
    ROLE.uiux,
    memory,
    "Donne une direction de composition brève pour l'enchaînement des blocs de ce site : quel rythme visuel (dense/aéré), quelles primitives privilégier compte tenu du contenu réel (un projet chiffré profite d'un stat-band, un projet narratif d'un split-media ou d'un quote-block, une offre à comparer d'une comparison-table ou pricing-table).",
    `Réponds avec ce JSON : {"guidance":"1 à 2 phrases, concrètes, pas de généralités"}`,
    { maxTokens: 220 },
  );
  memory.designGuidance =
    typeof json?.guidance === "string" && json.guidance.trim()
      ? json.guidance.trim().slice(0, 300)
      : null;
  return memory.designGuidance;
}

/** LE cœur du correctif : compose l'arbre de blocs de l'accueil ET de
 *  chaque page statique du plan de site, dans un seul appel cohérent,
 *  en piochant dans la bibliothèque de primitives. C'est cette fonction
 *  qui remplace le remplissage de texte dans un squelette fixe. */
async function taskComposeBlocks(memory) {
  const sitePlan = memory.sitePlan;
  const staticPages = (sitePlan?.pages || []).filter(
    (p) => p.kind === "static",
  );
  const pageBriefs = staticPages.map((p) => ({
    id: p.id,
    label: p.label,
    path: p.path,
  }));

  const json = await askJSON(
    ROLE.composer,
    memory,
    "Compose la page d'accueil ET chaque page statique du plan de site en piochant dans la bibliothèque de blocs fournie. Chaque page a sa PROPRE composition, adaptée à son rôle — jamais le même enchaînement partout.",
    `Bibliothèque de blocs disponible — un type, ses variantes autorisées, ses champs (*=obligatoire) :
${getPrimitivesGuide()}

Règles impératives :
- N'utilise JAMAIS un type ou une variante absente de la liste ci-dessus.
- Respecte les limites de longueur indiquées (≤Nc = N caractères maximum) : sois concis plutôt que tronqué.
- L'accueil a entre 4 et 8 blocs ; chaque page statique en a entre 2 et 5.
- Le premier bloc de l'accueil est presque toujours un "hero".
- Varie réellement les primitives choisies d'une page à l'autre : n'enchaîne pas systématiquement hero → feature-grid → cta-band si un quote-block, un stat-band, une timeline-vertical, une comparison-table ou une pricing-table racontent mieux ce projet précis.
- Le vocabulaire est celui du métier réel du projet, jamais un texte interchangeable avec un autre secteur.
${memory.designGuidance ? `Direction de composition suggérée : ${memory.designGuidance}` : ""}
${memory.copyRejectionReason ? `\nATTENTION : une version précédente a été jugée hors-sujet pour cette raison précise, corrige-la explicitement : ${memory.copyRejectionReason}\n` : ""}

Pages statiques à composer en plus de l'accueil : ${JSON.stringify(pageBriefs)}

Réponds avec ce JSON exact (la forme ci-dessous est un exemple STRUCTUREL à ne pas recopier — invente un contenu et un choix de blocs propres à ce projet) :
{
  "home": [{"type":"hero","variant":"centered","props":{"title":"…","lead":"…"}}, {"type":"cta-band","variant":"solid","props":{"title":"…","actionLabel":"…"}}],
  "pages": { "identifiant-de-page": [{"type":"hero","variant":"split","props":{"title":"…","lead":"…"}}] }
}`,
    { maxTokens: 2400, profile: "json", maxModelTries: 3 },
  );

  const home = preTrimBlocks(json?.home);
  memory.homeBlocks = sanitizeBlockTree(home, PERMISSIVE_MODULES) || null;

  const pagesOut =
    json?.pages && typeof json.pages === "object" ? json.pages : {};
  for (const page of staticPages) {
    const trimmed = preTrimBlocks(pagesOut[page.id]);
    const validated = sanitizeBlockTree(trimmed, PERMISSIVE_MODULES);
    if (validated) page.blocks = validated; // mute l'objet page dans memory.sitePlan.pages
  }
  return memory.homeBlocks;
}

/** Filet de secours texte plat : SEULEMENT utilisé si l'arbre de blocs
 *  échoue en aval (composeFallbackBlocks côté générateur). Même forme
 *  que l'ancien contenu v1, pour rester compatible avec le repli existant. */
async function taskCopy(memory) {
  const slots = memory.bp.featureSlots
    .map((f, i) => `${i}. ${f.title} — ${f.text}`)
    .join("\n");
  const json = await askJSON(
    ROLE.copy,
    memory,
    "Réécris, comme filet de secours seulement, le contenu texte plat de la page d'accueil (utilisé UNIQUEMENT si la composition par blocs échoue). Ne change PAS le nombre d'éléments des tableaux.",
    `Réécris ces ${memory.bp.featureSlots.length} capacités existantes (garde le même ordre, même nombre, adapte titre ET texte au projet) :
${slots}

Nombre d'étapes du parcours à écrire : ${memory.bp.stepsCount}
Nombre d'avantages à écrire : ${memory.bp.benefitsCount}

Réponds avec ce JSON exact :
{
  "hero": {"title":"accroche courte et spécifique","lead":"1-2 phrases qui disent ce que fait CE site pour CE public"},
  "features": [{"title":"…","text":"…"}, ...] (exactement ${memory.bp.featureSlots.length} éléments, dans l'ordre),
  "steps": ["…", ...] (exactement ${memory.bp.stepsCount} éléments),
  "benefits": ["…", ...] (${memory.bp.benefitsCount} à 4 éléments),
  "spotlight": {"title":"titre d'une section distinctive propre à ce projet","paragraphs":["1 à 2 paragraphes concrets sur ce qui rend ce site utile pour son public réel"],"bullets":["2 à 4 points factuels, pas de superlatifs"]}
}`,
    { maxTokens: 1300, profile: "json" },
  );
  memory.copyForFallback = qaFilterCopy(json, memory.bp);
  return memory.copyForFallback;
}

async function taskAuthCopy(memory) {
  if (!memory.bp.modules.auth) return null;
  const json = await askJSON(
    ROLE.copy,
    memory,
    "Rédige le texte de l'écran de connexion et d'inscription pour ce projet précis : titre, sous-titre, libellé des boutons.",
    `Réponds avec ce JSON :
{"loginTitle":"…","loginSub":"…","registerTitle":"…","registerSub":"…","loginCta":"…","registerCta":"…"}
Le sous-titre d'inscription doit dire concrètement ce que l'utilisateur retrouvera dans son espace une fois connecté, dans le vocabulaire réel de ce projet.`,
    { maxTokens: 400 },
  );
  memory.authCopy = qaFilterAuthCopy(json, memory.bp);
  return memory.authCopy;
}

/* ════════════════════════════════════════════════════════════════════
   8. LOGIQUE MÉTIER OPTIONNELLE
   ════════════════════════════════════════════════════════════════════ */

function needsCustomTool(memory) {
  const text =
    `${memory.brief.purpose || ""} ${(memory.brief.missions || []).join(" ")}`.toLowerCase();
  return /calcul|devis|estimation|simulat|diagnostic|score|tarif variable/.test(
    text,
  );
}

async function taskBackendTool(memory) {
  if (!needsCustomTool(memory)) return null;
  const json = await askJSON(
    ROLE.backend,
    memory,
    "Propose UNE seule fonction pure (aucun accès réseau, fichier ou base de données) qui répond à un besoin de calcul propre à ce projet, décrit dans le contexte.",
    `Réponds avec ce JSON :
{
  "label":"nom court de la fonctionnalité",
  "description":"ce que fait la fonction, pour le modèle qui l'appellera",
  "fn":"nom_de_fonction_js_valide",
  "params":{"nomParam":{"type":"number|string","description":"…"}},
  "jsBody":"export async function nom_de_fonction_js_valide(args) { /* calcul pur uniquement, pas d'I/O */ return { ok: true, result: ... }; }"
}
Si aucune fonction pertinente et sûre n'est nécessaire, réponds {"skip": true}.`,
    { maxTokens: 500 },
  );
  if (!json || json.skip || !json.fn || !json.jsBody) return null;
  memory.backendTool = {
    label: String(json.label || "Calcul métier").slice(0, 60),
    description: String(json.description || "").slice(0, 200),
    fn: /^[a-z][a-zA-Z0-9_]*$/.test(json.fn) ? json.fn : null,
    params: json.params && typeof json.params === "object" ? json.params : {},
    jsBody: String(json.jsBody),
    slug: String(json.fn || "custom")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-"),
  };
  return memory.backendTool;
}

async function taskSecurity(memory) {
  if (!memory.backendTool?.jsBody || !memory.backendTool?.fn) {
    memory.securityVerdict = { pass: true, tool: null };
    return memory.securityVerdict;
  }
  const scan = staticSecurityScan(memory.backendTool.jsBody);
  memory.securityVerdict = scan;
  if (!scan.pass) {
    console.warn("[AiGENT security] outil backend rejeté :", scan.reason);
    memory.backendTool = null;
  }
  return memory.securityVerdict;
}

/* ════════════════════════════════════════════════════════════════════
   9. CAPACITÉS — catalogue fermé, reformulé pour CE projet, avec un
   repli déterministe qui ne retombe JAMAIS sur le catalogue complet
   ════════════════════════════════════════════════════════════════════ */

function capabilityPrompt(domainLabel, entityLabels) {
  return `Catalogue fermé (ids et fonctions techniques figées — seuls label/description peuvent être reformulés) :
${JSON.stringify(TOOL_CATALOG_REF.map((t) => ({ id: t.id, category: t.category, service: t.service })))}

Secteur réel : ${domainLabel || "non précisé pour l'instant"}
Données réelles du projet : ${JSON.stringify(entityLabels || [])}

Réponds avec ce JSON :
{"selected":[{"id":"knowledge.search","label":"libellé reformulé pour CE projet","description":"description reformulée pour CE projet"}]}
Choisis entre 3 et 8 capacités pertinentes, jamais plus.`;
}

function parseCapabilities(json) {
  const validIds = new Set(TOOL_CATALOG_REF.map((t) => t.id));
  const selected = Array.isArray(json?.selected)
    ? json.selected
        .filter((s) => s && validIds.has(s.id))
        .slice(0, 8)
        .map((s) => ({
          id: s.id,
          label: String(s.label || "").slice(0, 60) || undefined,
          description: String(s.description || "").slice(0, 200) || undefined,
        }))
    : null;
  return selected?.length ? selected : null;
}

/** Repli déterministe par mots-clés : ne montre JAMAIS le catalogue brut
 *  complet (réservation/paiement/catalogue pour un site qui n'en a pas
 *  besoin) même si tous les fournisseurs IA échouent en même temps.
 *  Accepte aussi bien une spec brute (missions = objets {label}) qu'un
 *  compactSpec (missions = tableau de chaînes). */
function deterministicCapabilityFallback(specLike) {
  const missions = Array.isArray(specLike?.missions)
    ? specLike.missions
        .map((m) => (typeof m === "string" ? m : m?.label || ""))
        .join(" ")
    : "";
  const corpus =
    `${specLike?.purpose || ""} ${specLike?.sector || ""} ${missions}`.toLowerCase();
  const base = ["knowledge.search", "faq.answer", "handoff.human"];
  const extra = [];
  if (/commande|colis|livraison|exp[ée]di/.test(corpus))
    extra.push("lead.capture");
  if (/r[ée]serv|rendez-vous|cr[ée]neau/.test(corpus))
    extra.push("booking.request");
  if (/produit|catalogue|menu|article/.test(corpus))
    extra.push("catalog.browse");
  if (!extra.length) extra.push("lead.capture", "form.submit");
  const ids = [...new Set([...base, ...extra])].slice(0, 6);
  return ids
    .map((id) => {
      const t = TOOL_CATALOG_REF.find((c) => c.id === id);
      return t
        ? { id: t.id, label: t.label, description: t.description }
        : null;
    })
    .filter(Boolean);
}

async function taskCapabilities(memory) {
  const json = await askJSON(
    ROLE.copy,
    memory,
    "Choisis, dans le catalogue fourni, UNIQUEMENT les capacités réellement utiles à ce projet précis, et reformule leur libellé/description dans son vocabulaire réel. N'invente aucune capacité hors catalogue, ne garde jamais une capacité hors-sujet.",
    capabilityPrompt(
      memory.sitePlan?.domainLabel || memory.bp.domain,
      (memory.sitePlan?.entities || []).map((e) => e.label),
    ),
    { maxTokens: 700 },
  );
  memory.capabilities =
    parseCapabilities(json) || deterministicCapabilityFallback(memory.brief);
  return memory.capabilities;
}

/** Suggestion légère, utilisable AVANT la construction — pendant la
 *  conception, quand le plan de site détaillé n'existe pas encore — pour
 *  afficher un panneau "Capacités" pertinent dès l'étape de design. Ne
 *  retombe JAMAIS sur le catalogue complet même si l'IA échoue : c'est
 *  précisément le bug observé (compétences de réservation proposées pour
 *  un site de révisions) que ce repli déterministe corrige. */
export async function suggestCapabilities(spec) {
  const brief = compactSpec(spec);
  const fakeMemory = {
    shared: () => ({
      domaine: brief.sector || null,
      modules_actifs: [],
      objectif: brief.purpose,
      public: brief.audience,
      secteur: brief.sector,
      ton_choisi: null,
      mots_interdits: [],
      direction_composition: null,
      vocabulaire_reel: null,
      pages_reelles: [],
    }),
  };
  const json = await askJSON(
    ROLE.copy,
    fakeMemory,
    "Suggère, dans le catalogue fourni, UNIQUEMENT les capacités plausiblement utiles à ce projet précis, avant même de connaître son plan de site détaillé. N'invente aucune capacité hors catalogue.",
    capabilityPrompt(brief.sector, []),
    { maxTokens: 700 },
  );
  return parseCapabilities(json) || deterministicCapabilityFallback(spec);
}

/* ════════════════════════════════════════════════════════════════════
   10. QA GLOBALE ET VÉRIFICATION THÉMATIQUE
   ════════════════════════════════════════════════════════════════════ */

async function taskQA(memory) {
  const usable =
    !!(memory.homeBlocks && memory.homeBlocks.length) ||
    !!(
      memory.copyForFallback &&
      (memory.copyForFallback.hero ||
        (memory.copyForFallback.features || []).some(
          (f) => f.title || f.text,
        ) ||
        memory.copyForFallback.spotlight)
    );
  memory.qaVerdict = { pass: usable };
  return memory.qaVerdict;
}

/** Vérifie que le contenu composé parle réellement du bon sujet — jamais
 *  un contenu générique qui aurait pu s'appliquer à n'importe quel autre
 *  projet. Ne bloque jamais la livraison à l'aveugle : en cas de doute
 *  (réponse IA absente/illisible), on ne pénalise pas le client. */
async function taskVerify(memory) {
  const texts = extractBlockStrings(memory.homeBlocks);
  if (!texts.length) {
    memory.verifyVerdict = { pass: true, reason: null };
    return memory.verifyVerdict;
  }
  const json = await askJSON(
    ROLE.qa,
    memory,
    "Vérifie que ces extraits parlent réellement du secteur, du public et des données déclarés dans le contexte partagé — pas d'un projet générique ou d'un autre secteur.",
    `Extraits à vérifier : ${JSON.stringify(texts)}
Réponds avec ce JSON : {"pass":true|false,"reason":"si pass=false, en une phrase, ce qui ne colle pas"}`,
    { maxTokens: 250 },
  );
  const pass = json?.pass !== false;
  memory.verifyVerdict = {
    pass,
    reason: pass ? null : String(json?.reason || "").slice(0, 300),
  };
  return memory.verifyVerdict;
}

/* ════════════════════════════════════════════════════════════════════
   11. INTÉGRATION FINALE
   ════════════════════════════════════════════════════════════════════ */

function taskIntegrate(memory) {
  const overrides = {};
  const fb = memory.copyForFallback;
  if (fb?.hero) overrides.hero = fb.hero;
  if (fb?.features) overrides.features = fb.features;
  if (fb?.steps) overrides.steps = fb.steps;
  if (fb?.benefits) overrides.benefits = fb.benefits;
  if (fb?.spotlight) overrides.spotlight = fb.spotlight;
  if (fb) overrides.copyForFallback = fb;

  if (memory.homeBlocks) overrides.homeBlocks = memory.homeBlocks;

  if (memory.backendTool && memory.securityVerdict?.pass) {
    overrides.extraTool = { ...memory.backendTool, passedScan: true };
  }
  if (memory.sitePlan) overrides.sitePlan = memory.sitePlan;
  if (memory.sitePlan?.commerceModel)
    overrides.commerceModel = memory.sitePlan.commerceModel;
  if (memory.capabilities) overrides.capabilities = memory.capabilities;
  if (memory.authCopy) overrides.authCopy = memory.authCopy;
  if (memory.verifyVerdict) overrides.qaFlag = memory.verifyVerdict;
  return Object.keys(overrides).length ? overrides : null;
}

/* ════════════════════════════════════════════════════════════════════
   12. ORCHESTRATEUR
   ════════════════════════════════════════════════════════════════════ */

function runTask(agentKey, taskId, fn, emit) {
  emit({ type: "agent_start", agent: agentKey, task: taskId });
  return Promise.resolve()
    .then(fn)
    .then((r) => {
      emit({ type: "agent_done", agent: agentKey, task: taskId });
      return r;
    })
    .catch((e) => {
      emit({
        type: "agent_error",
        agent: agentKey,
        task: taskId,
        message: e?.message || "erreur",
      });
      return null;
    });
}

/** Tâches internes (filet de secours, texte auth) qui n'ont pas leur
 *  propre ligne dans la barre de progression du Builder : elles
 *  s'exécutent quand même, juste sans émettre d'événement dédié. */
async function runSilent(fn) {
  try {
    return await fn();
  } catch (e) {
    console.warn("[AiGENT agents] tâche silencieuse échouée :", e?.message);
    return null;
  }
}

/**
 * L'équipe commence par un vrai contrat de site. Le rendu legacy par blocs
 * n'est plus un chemin de construction : le codegen indépendant produit les
 * fichiers métier et bloque la livraison si le contrat manque.
 */
export async function runMultiAgentBuild(
  spec,
  bp,
  { onEvent = () => {} } = {},
) {
  const memory = makeMemory(spec, bp);
  const emit = (e) => {
    try {
      onEvent(e);
    } catch (_) {}
  };

  // Niveau 0 — architecture complète, sans inférer un commerce à partir
  // d'un mot isolé tel que « article » ou « suivre ses révisions ».
  if (spec.workArchitecture) {
    memory.sitePlan = qaFilterSitePlan(spec.workArchitecture);
    if (!memory.sitePlan)
      throw new Error("L’architecture approuvée n’est plus valide. Revenez à l’étape Architecture et corrigez-la avant la construction.");
    plannerTrace("plan.loaded_from_approved_architecture", { plan: planShape(memory.sitePlan) });
  } else {
    await runTask("architect", "site_plan", () => taskSitePlan(memory), emit);
  }
  if (!memory.sitePlan) {
    throw new Error("L'architecte IA n'a pas produit de plan de pages et de données validable.");
  }
  const MAX_PLAN_REPAIRS = 3;
  let coverageErrors = sitePlanCoverageErrors(memory.sitePlan, memory.brief);
  plannerTrace("validation.initial", { requirements: detectedRequirements(memory.brief), result: coverageErrors.length ? "rejected" : "accepted", missing: coverageErrors, plan: planShape(memory.sitePlan) });
  for (let attempt = 1; coverageErrors.length && attempt <= MAX_PLAN_REPAIRS; attempt++) {
    console.info(`[AiGENT planner] réparation ${attempt}/${MAX_PLAN_REPAIRS}; exigences absentes : ${coverageErrors.join(" | ")}`);
    const before = new Set((memory.sitePlan.pages || []).flatMap((page) => [...(page.features || []), ...(page.components || []), ...(page.actions || [])].map((item) => item.id || item.label)));
    await runTask("architect", "site_plan", () => taskRepairSitePlan(memory, coverageErrors), emit);
    const after = new Set((memory.sitePlan.pages || []).flatMap((page) => [...(page.features || []), ...(page.components || []), ...(page.actions || [])].map((item) => item.id || item.label)));
    const added = [...after].filter((item) => !before.has(item));
    console.info(`[AiGENT planner] capacités ajoutées : ${added.length ? added.join(", ") : "aucune"}`);
    coverageErrors = sitePlanCoverageErrors(memory.sitePlan, memory.brief);
    plannerTrace("validation.after_repair", { attempt, result: coverageErrors.length ? "rejected" : "accepted", missing: coverageErrors, plan: planShape(memory.sitePlan) });
  }
  if (coverageErrors.length) {
    plannerTrace("selection.rejected", { reason: "exigences métier encore absentes après réparation IA", missing: coverageErrors, plan: planShape(memory.sitePlan) });
    throw new Error(`Le plan reste incomplet après ${MAX_PLAN_REPAIRS} réparations IA : ${coverageErrors.join(" ")}`);
  } else {
    plannerTrace("selection.accepted", { reason: "toutes les exigences sont couvertes", plan: planShape(memory.sitePlan) });
  }
  // Les capacités de l'assistant sont calculées seulement si l'architecte
  // a décidé qu'un assistant sert réellement le parcours.
  if (memory.sitePlan.assistant?.enabled) {
    await runTask("copy", "capabilities", () => taskCapabilities(memory), emit);
  }

  const overrides = await runTask(
    "integrator",
    "integrate",
    () => taskIntegrate(memory),
    emit,
  );
  return overrides;
}

export async function proposeWorkArchitecture(spec, bp) {
  const memory = makeMemory(spec, bp);
  memory.sitePlan = await taskSitePlan(memory);
  if (!memory.sitePlan)
    throw new Error("L’architecte IA n’a pas produit de plan exploitable.");
  const maxRepairs = 3;
  for (let attempt = 0; attempt < maxRepairs; attempt += 1) {
    const missing = sitePlanCoverageErrors(memory.sitePlan, memory.brief);
    if (!missing.length) return memory.sitePlan;
    const repaired = await taskRepairSitePlan(memory, missing);
    if (!repaired) break;
  }
  const remaining = sitePlanCoverageErrors(memory.sitePlan, memory.brief);
  throw new Error(`L’architecture reste incomplète après correction : ${remaining.join(" ")}`);
}

async function taskBrand(memory) {
  const json = await askJSON(
    ROLE.copy,
    memory,
    "Définis en 2-3 mots le ton du site et liste les mots à ne jamais utiliser (hors-sujet par rapport au secteur).",
    `Projet : ${JSON.stringify(memory.brief)}
Modules réellement actifs sur ce site : ${JSON.stringify(memory.bp.modules)}
Réponds avec ce JSON : {"voice":["mot1","mot2"],"bannedWords":["mot interdit 1","mot interdit 2"]}`,
    { maxTokens: 300 },
  );
  memory.brand = json?.voice
    ? { voice: json.voice, bannedWords: json.bannedWords || [] }
    : { voice: [], bannedWords: [] };
  return memory.brand;
}

export default {
  runMultiAgentBuild,
  suggestCapabilities,
  PRODUCT_QUALITY_GUIDE,
};

export const __aigentAgentsTestHooks = { qaFilterSitePlan, sitePlanCoverageErrors, sitePlanRelevanceErrors, completePlanFromBrief, addDeterministicCoverage, buildDeterministicSitePlan, briefText, isPrivateWorkspaceBrief };
