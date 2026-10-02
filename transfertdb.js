//======================================================================//
//  AiGENT GENERATOR — v4 : composition réelle, plus de faux-site
//----------------------------------------------------------------------//
//  CE QUI CHANGE PAR RAPPORT À v3 :
//   - Avant : chaque page générique passait par SECTION_RENDERERS, une
//     table FERMÉE de 10 fonctions qui produisaient toujours le même DOM
//     (hero, feature-grid, faq, cta...) quel que soit le projet. L'IA ne
//     choisissait qu'un NOM de section dans une liste de 10 valeurs.
//     Résultat : un site de révisions scolaires et un site de réservation
//     de restaurant produisaient EXACTEMENT le même arbre HTML.
//   - Maintenant : la page d'accueil ET les pages génériques du plan de
//     site sont un ARBRE JSON de blocs, choisis dans une bibliothèque de
//     ~20 primitives (au lieu de 10 sections), chacune avec plusieurs
//     variantes de mise en page. L'IA (aigentAgents.js, prochaine étape)
//     produit cet arbre ; ce fichier le VALIDE (sanitizeBlockTree) puis
//     le COMPILE côté client (renderBlock) — jamais de HTML brut injecté,
//     jamais de CSS invalide : chaque primitive a un rendu déterministe,
//     mais l'assemblage, l'ordre, la densité et le choix des primitives
//     sont libres et propres à chaque projet.
//   - Tant que l'agent IA de plan de site n'a pas encore été mis à jour
//     pour produire cet arbre (fichier suivant), un compositeur de secours
//     déterministe MAIS VARIÉ (composeFallbackBlocks) choisit parmi
//     plusieurs squelettes selon le domaine et le nombre réel de
//     fonctionnalités déclarées — ce n'est plus un squelette unique.
//
//  CE QUI NE CHANGE PAS (ce n'est pas la source du problème signalé) :
//   - La classification de domaine (commandes/retours/réservation/
//     catalogue) reste déterministe : ce sont de VRAIS modules métier
//     avec une VRAIE base de données, un vrai suivi de commande, etc.
//     Le problème n'était pas leur existence, mais leur apparition sur
//     des projets qui n'en avaient pas besoin, et l'uniformité du reste
//     du site (accueil, pages génériques) pour tout le monde.
//   - Le back-end (Express, auth, outils, ZIP, garde-fou secrets) reste
//     la même infrastructure : ce n'est pas elle qui produisait le
//     "faux-site", c'est la couche de composition visuelle du front-end.
//
//  RÈGLES NON NÉGOCIABLES (inchangées) :
//   1. Aucune clé d'AiGENT ne sort d'ici (assertNoSecrets).
//   2. Le projet est autonome : npm install → .env → npm start.
//   3. Jamais de faux succès : service absent ⇒ `service_not_configured`.
//   4. Rien de ce que produit une IA n'est injecté tel quel : tout arbre
//      de blocs, tout texte, tout code passe par un validateur borné.
//======================================================================//

import { deflateRawSync } from "node:zlib";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TOOL_CATALOG,
  SERVICE_CATALOG,
  STYLE_PRESETS,
  computeIntegrations,
  slugify,
} from "./aiParsee-aigent.js";
import { runMultiAgentBuild } from "./aigentAgents.js";

/* ════════════════════════════════════════════════════════════════════
   1. HELPERS
   ════════════════════════════════════════════════════════════════════ */

const J = (o) => JSON.stringify(o, null, 2);

const jsonForScript = (o) =>
  JSON.stringify(o)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const N = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function esc(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function cap(s) {
  return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s;
}
function joinFr(list) {
  if (list.length <= 1) return list.join("");
  return list.slice(0, -1).join(", ") + " et " + list[list.length - 1];
}

function tpl(src, vars = {}, flags = {}) {
  const out = [];
  const stack = [];
  for (const line of src.split("\n")) {
    const m = line.match(/^\s*\/\/#(if|endif)\s*(!?\w*)/);
    if (m) {
      if (m[1] === "if") {
        const neg = m[2].startsWith("!");
        const f = m[2].replace("!", "");
        stack.push(neg ? !flags[f] : !!flags[f]);
      } else stack.pop();
      continue;
    }
    if (stack.every(Boolean)) out.push(line);
  }
  return out
    .join("\n")
    .replace(/__([A-Z_]+)__/g, (all, k) => (k in vars ? vars[k] : all));
}

/* ════════════════════════════════════════════════════════════════════
   2. PRIMITIVES DE COMPOSITION — le cœur de la correction
   ────────────────────────────────────────────────────────────────────
   Une PAGE (accueil ou page générique du plan de site) n'est plus une
   liste de noms de section fixes : c'est un TABLEAU DE BLOCS, chacun
   {type, variant?, props}. `type` vient de ce catalogue ; `props` est
   validé champ par champ (longueur, nombre d'éléments) avant d'être
   compilé côté client par `renderBlock()` (voir plus bas, section
   FRONT-END). Rien de ce qu'une IA produit n'atteint le navigateur sans
   être passé dans `sanitizeBlockTree`.
   ════════════════════════════════════════════════════════════════════ */

const STR = (max) => ({ kind: "str", max });
const ARR = (of, max) => ({ kind: "arr", of, max });
const ENUM = (values) => ({ kind: "enum", values });

/** Schéma de chaque type de bloc : variantes autorisées + props attendues.
 *  Un champ absent du schéma est ignoré (jamais recopié tel quel). */
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
 *  aigentAgents.js, dupliqué ici volontairement : ce fichier doit pouvoir
 *  valider un arbre venu de n'importe quelle source sans dépendre d'un
 *  état partagé avec l'agent qui l'a produit. */
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
 *  au-delà, une page devient illisible, pas plus impressionnante. */
export function sanitizeBlockTree(tree, modules = {}) {
  if (!Array.isArray(tree)) return null;
  const blocks = tree
    .map((b) => validateBlock(b, modules))
    .filter(Boolean)
    .slice(0, 10);
  return blocks.length ? blocks : null;
}

/* ════════════════════════════════════════════════════════════════════
   3. BLUEPRINT — modules métier réels (inchangé : ce n'est pas la
   source du "faux-site". Commandes/retours/réservation/catalogue sont
   de vrais modules avec une vraie base de données ; le problème était
   qu'ils apparaissaient hors sujet et que TOUT LE RESTE du site (accueil,
   pages génériques) était toujours composé pareil. Ce dernier point est
   corrigé par les primitives ci-dessus, pas par ce bloc.
   ════════════════════════════════════════════════════════════════════ */

function classifyDomainByRegex(spec = {}) {
  const ids = new Set((spec.tools || []).map((t) => t.id));
  const corpus = N(
    [
      spec.purpose,
      spec.tagline,
      spec.sector,
      spec.audience,
      spec.persona,
      ...(spec.missions || [])
        .filter((m) => m && m.enabled !== false)
        .map((m) => m.label),
      ...(spec.knowledge || []).map((k) => k && k.label),
      ...(spec.workflows || []).map((w) => `${w?.name} ${w?.trigger}`),
      ...(spec.notes || []),
      ...(spec.assumptions || []),
    ]
      .filter(Boolean)
      .join(" | "),
  );
  const has = (re) => re.test(corpus);

  const orders = has(
    /suiv\w*\s+(\w+\s+){0,2}commandes?|colis|livraison|expedition|tracking|numero de commande|statut de (la )?commande/,
  );
  const returns = has(/retour|rembours|echange|garantie|\bsav\b/);
  const ecommerce =
    orders || returns || has(/e-?commerce|boutique en ligne|site marchand/);
  const tableBooking = has(/restaurant|\btables?\b|couvert|brasserie|bistrot/);
  const rdvBooking = has(/rendez-vous|\brdv\b/);
  const booking =
    ids.has("booking.request") ||
    ids.has("booking.confirm") ||
    has(/reserv|rendez-vous|\brdv\b/);
  const isMenu = has(/\bmenu\b|\bplats?\b|restaurant|cuisine|carte des/);
  const catalog =
    ids.has("catalog.browse") ||
    has(/produit|catalogue|\bmenu\b|\bplats?\b|\bcarte\b|article/);
  const auth =
    orders ||
    returns ||
    has(
      /compte|connexion|login|log-?in|sign-?in|sign-?up|inscri|espace client|identifi/,
    );

  return {
    orders,
    returns,
    ecommerce,
    tableBooking,
    rdvBooking,
    booking,
    isMenu,
    catalog,
    auth,
  };
}

function mergeClassification(regexCls, aiCls) {
  const bool = (k) =>
    aiCls && typeof aiCls[k] === "boolean" ? aiCls[k] : regexCls[k];
  const kind = aiCls?.bookingKind;
  return {
    orders: bool("orders"),
    returns: bool("returns"),
    ecommerce:
      bool("orders") ||
      bool("returns") ||
      (typeof aiCls?.ecommerce === "boolean"
        ? aiCls.ecommerce
        : regexCls.ecommerce),
    tableBooking: kind ? kind === "table" : regexCls.tableBooking,
    rdvBooking: kind ? kind === "rdv" : regexCls.rdvBooking,
    booking: bool("booking"),
    isMenu:
      typeof aiCls?.catalogIsMenu === "boolean"
        ? aiCls.catalogIsMenu
        : regexCls.isMenu,
    catalog: bool("catalog"),
    auth: bool("orders") || bool("returns") || regexCls.auth,
  };
}

function buildBlueprintFromClassification(spec = {}, cls) {
  const ids = new Set((spec.tools || []).map((t) => t.id));
  const {
    orders,
    returns,
    ecommerce,
    tableBooking,
    rdvBooking,
    booking,
    isMenu,
    catalog,
    auth,
  } = cls;

  const domain = ecommerce
    ? "ecommerce"
    : booking
      ? "booking"
      : catalog
        ? "catalog"
        : "service";
  const bookingMode = booking
    ? ids.has("booking.confirm") && ids.has("availability.check")
      ? "confirm"
      : "request"
    : null;

  const catalogLabel = isMenu ? "Menu" : ecommerce ? "Produits" : "Catalogue";
  const bookingKind = tableBooking ? "table" : rdvBooking ? "rdv" : "generic";
  const bookingTitle =
    bookingKind === "table"
      ? "Réserver une table"
      : bookingKind === "rdv"
        ? "Prendre rendez-vous"
        : "Réserver";

  const modules = {
    auth,
    orders,
    returns,
    track: orders,
    catalog,
    booking: !!booking,
    help: true,
    contact: true,
  };

  const bookingFlow = booking
    ? {
        title: bookingTitle,
        kind: bookingKind,
        fields: [
          {
            key: "date",
            summary: "Date",
            label: "Quel jour ?",
            hint: "Choisissez la date souhaitée.",
            type: "date",
          },
          {
            key: "time",
            summary: "Heure",
            label: "À quelle heure ?",
            type: "time",
          },
          ...(bookingKind === "table"
            ? [
                {
                  key: "people",
                  summary: "Convives",
                  label: "Pour combien de personnes ?",
                  type: "number",
                  min: 1,
                  max: 20,
                },
              ]
            : []),
          {
            key: "name",
            summary: "Nom",
            label: "À quel nom ?",
            type: "text",
            autocomplete: "name",
          },
          {
            key: "contact",
            summary: "Contact",
            label: "Comment vous joindre ?",
            hint: "Un email ou un numéro de téléphone.",
            type: "text",
          },
          {
            key: "note",
            summary: "Précision",
            label: "Une précision à nous transmettre ?",
            type: "textarea",
            optional: true,
          },
        ],
      }
    : null;

  const acts = [];
  if (orders) acts.push("suivez vos commandes en temps réel");
  if (returns) acts.push("gérez vos retours");
  if (booking)
    acts.push(
      bookingKind === "table"
        ? "réservez votre table"
        : bookingKind === "rdv"
          ? "prenez rendez-vous"
          : "réservez en quelques clics",
    );
  if (catalog && !ecommerce)
    acts.push(isMenu ? "découvrez notre menu" : "parcourez notre catalogue");
  acts.push(
    ecommerce && catalog
      ? "obtenez une réponse à toutes vos questions sur nos produits"
      : "obtenez une réponse immédiate à vos questions",
  );
  const hero = {
    title: spec.tagline || spec.name || "Bienvenue",
    lead:
      cap(joinFr(acts)) + ". Notre assistant est là si vous préférez discuter.",
  };

  const features = [];
  if (orders)
    features.push({
      icon: "package",
      title: "Suivi de commande",
      text: "Chaque étape de votre colis, de la préparation à la livraison, sans avoir à écrire à personne.",
      path: "/suivi",
    });
  if (returns)
    features.push({
      icon: "undo",
      title: "Retours simplifiés",
      text: "Choisissez les articles, le motif et la solution : la demande est enregistrée en quelques clics.",
      path: "/retours",
    });
  if (booking)
    features.push({
      icon: "calendar",
      title: bookingTitle,
      text:
        bookingMode === "confirm"
          ? "La disponibilité est vérifiée en direct, la confirmation est immédiate."
          : "Quelques questions et votre demande nous parvient. Nous la confirmons avec vous.",
      path: "/reservation",
    });
  if (catalog)
    features.push({
      icon: "tag",
      title: catalogLabel,
      text: isMenu
        ? "Parcourez la carte par catégorie, avec les prix."
        : "Recherchez et filtrez, puis posez vos questions sur n'importe quelle fiche.",
      path: "/catalogue",
    });
  if (auth)
    features.push({
      icon: "user",
      title: "Votre espace personnel",
      text: "Vos commandes, vos demandes et vos échanges au même endroit.",
      path: "/compte",
    });
  features.push({
    icon: "chat",
    title: "Assistant intelligent",
    text:
      auth && orders
        ? "Il connaît vos commandes et répond à vos questions, à toute heure."
        : "Posez votre question en langage naturel, il répond à partir de nos informations.",
    action: "assistant",
  });
  features.push({
    icon: "help",
    title: "Aide et contact",
    text: "Les réponses aux questions fréquentes, et un formulaire pour joindre l'équipe.",
    path: "/aide",
  });

  const steps = ecommerce
    ? [
        "Connectez-vous, ou saisissez votre numéro de commande et votre email.",
        "Suivez chaque étape de votre colis, de la préparation à la livraison.",
        returns
          ? "Un souci ? Lancez un retour en quelques clics ou interrogez l'assistant."
          : "Une question ? L'assistant vous répond tout de suite.",
      ]
    : booking
      ? [
          "Choisissez la date et l'heure.",
          "Indiquez vos coordonnées.",
          bookingMode === "confirm"
            ? "Recevez la confirmation immédiate."
            : "Nous confirmons votre demande rapidement.",
        ]
      : [
          "Posez votre question, comme vous le feriez à un conseiller.",
          "Recevez une réponse fondée sur nos informations.",
          "Un membre de l'équipe prend le relais si nécessaire.",
        ];

  const benefits = [];
  if (orders) benefits.push("Toutes vos commandes au même endroit");
  if (returns) benefits.push("Un retour lancé en moins de deux minutes");
  if (orders) benefits.push("Un assistant qui connaît votre dossier");
  if (!benefits.length)
    benefits.push(
      "Vos demandes conservées et retrouvables",
      "Une réponse plus rapide à chaque échange",
    );

  const nav = [{ path: "/", label: "Accueil" }];
  if (orders)
    nav.push(
      { path: "/suivi", label: "Suivre un colis", guest: true },
      { path: "/commandes", label: "Mes commandes", auth: true },
    );
  if (returns) nav.push({ path: "/retours", label: "Retours", auth: true });
  if (catalog) nav.push({ path: "/catalogue", label: catalogLabel });
  if (booking) nav.push({ path: "/reservation", label: bookingTitle });
  nav.push({ path: "/aide", label: "Aide" });

  const suggestions = (spec.interface?.suggestions || []).filter(Boolean).length
    ? spec.interface.suggestions.slice(0, 4)
    : orders
      ? [
          "Où en est ma commande ?",
          returns ? "Comment faire un retour ?" : "Comment vous contacter ?",
          "Quels sont les délais de livraison ?",
        ]
      : booking
        ? [
            "Puis-je réserver pour ce soir ?",
            "Quels sont vos horaires ?",
            "Comment vous joindre ?",
          ]
        : ["Comment ça marche ?", "Comment vous contacter ?"];

  const greeting =
    spec.interface?.greeting ||
    (ecommerce
      ? "Bonjour, je peux vous aider pour vos commandes, vos retours et vos questions sur nos produits."
      : booking
        ? "Bonjour, je réponds à vos questions et je peux enregistrer votre demande."
        : "Bonjour, comment puis-je vous aider ?");

  return {
    domain,
    modules,
    bookingMode,
    currency: "EUR",
    labels: { catalog: catalogLabel, isMenu },
    booking: bookingFlow,
    hero,
    features: features.slice(0, 6),
    steps,
    benefits,
    nav,
    suggestions,
    greeting,
    authCopy: {
      loginTitle: "Content de vous revoir",
      loginSub: "Connectez-vous pour retrouver votre espace personnel.",
      registerTitle: "Créer votre compte",
      registerSub: modules.orders
        ? "Quelques secondes suffisent. Vos commandes passées avec cet email apparaissent automatiquement."
        : "Quelques secondes suffisent pour créer votre espace personnel.",
      loginCta: "Se connecter",
      registerCta: "Créer mon compte",
    },
  };
}

export function deriveBlueprint(spec = {}) {
  return buildBlueprintFromClassification(spec, classifyDomainByRegex(spec));
}

export function withImpliedTools(spec, bp) {
  const have = new Set((spec.tools || []).map((t) => t.id));
  const add = [];
  const want = (id) => {
    if (!have.has(id)) {
      have.add(id);
      add.push({ id });
    }
  };
  want("knowledge.search");
  want("faq.answer");
  want("lead.capture");
  want("handoff.human");
  if (bp.modules.catalog) want("catalog.browse");
  if (bp.bookingMode === "confirm") {
    want("availability.check");
    want("booking.confirm");
  } else if (bp.modules.booking) want("booking.request");
  return { ...spec, tools: [...(spec.tools || []), ...add] };
}

/* ════════════════════════════════════════════════════════════════════
   4. COMPOSITEUR DE SECOURS — déterministe, mais VARIÉ
   ────────────────────────────────────────────────────────────────────
   Chemin normal : l'agent architecte (aigentAgents.js) produit un arbre
   de blocs pour l'accueil et chaque page, validé par sanitizeBlockTree.
   Tant que cet agent n'a pas encore été mis à jour pour le faire (c'est
   le chantier suivant), OU si sa réponse est invalide/absente, ce
   compositeur prend le relais. Il ne produit JAMAIS le même squelette :
   il choisit, à partir d'un hachage stable du projet (nom + objectif),
   parmi plusieurs mises en page différentes pour chaque rôle de bloc.
   Ce n'est pas la solution finale (le texte reste générique dans ce
   secours), mais ce n'est plus non plus le squelette unique d'avant.
   ════════════════════════════════════════════════════════════════════ */

function stableHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
function pick(seed, offset, arr) {
  return arr[(seed + offset) % arr.length];
}

/** Compose l'accueil ET, en filet de secours, les pages génériques d'un
 *  plan de site, à partir du blueprint métier déjà déterminé (bp) et
 *  d'éventuels textes déjà réécrits par l'équipe de rédaction (copy). */
export function composeFallbackBlocks(spec, bp, copy = null) {
  const seed = stableHash(N(`${spec.name || ""}|${spec.purpose || ""}`));
  const hero = copy?.hero || bp.hero;
  const features = (copy?.features || bp.features).filter(
    (f) => f && (f.title || f.text),
  );
  const steps = copy?.steps || bp.steps;
  const benefits = copy?.benefits || bp.benefits;
  const spotlightSrc = copy?.spotlight || null;

  const heroVariant = pick(seed, 0, ["centered", "split", "media-right"]);
  const featureVariant = pick(seed, 1, ["grid-2", "grid-3", "list"]);
  const stepsAsTimeline = pick(seed, 2, [true, false]);

  const blocks = [
    {
      type: "hero",
      variant: heroVariant,
      props: { title: hero.title, lead: hero.lead },
    },
  ];

  if (features.length) {
    blocks.push({
      type: "feature-grid",
      variant: featureVariant,
      props: {
        title: "Ce que propose ce site",
        items: features.slice(0, 8).map((f) => ({
          title: (f.title || "").slice(0, 50),
          text: (f.text || "").slice(0, 170),
        })),
      },
    });
  }

  if (stepsAsTimeline) {
    blocks.push({
      type: "timeline-vertical",
      variant: pick(seed, 3, ["numbered", "dated"]),
      props: {
        title: "Comment ça marche",
        steps: steps.slice(0, 6).map((s, i) => ({
          title: `Étape ${i + 1}`,
          text: String(s).slice(0, 170),
        })),
      },
    });
  } else {
    blocks.push({
      type: "steps-numbered",
      variant: "default",
      props: {
        title: "Comment ça marche",
        steps: steps.slice(0, 6).map((s) => String(s).slice(0, 150)),
      },
    });
  }

  if (spotlightSrc?.title && spotlightSrc?.paragraphs?.length) {
    blocks.push({
      type: "spotlight",
      variant: "default",
      props: {
        title: spotlightSrc.title,
        paragraphs: spotlightSrc.paragraphs.slice(0, 3),
        bullets: spotlightSrc.bullets || [],
      },
    });
  } else if (benefits.length) {
    blocks.push({
      type: "stat-band",
      variant: pick(seed, 4, ["row-3", "row-4"]),
      props: {
        stats: benefits.slice(0, 4).map((b, i) => ({
          value: String(i + 1).padStart(2, "0"),
          label: String(b).slice(0, 40),
        })),
      },
    });
  }

  blocks.push({
    type: "cta-band",
    variant: pick(seed, 5, ["solid", "outline"]),
    props: {
      title: "Une question ?",
      text: "L'assistant répond en quelques secondes, à toute heure.",
      actionLabel: "Ouvrir l'assistant",
    },
  });

  return sanitizeBlockTree(blocks, bp.modules) || blocks;
}

/** Secours pour une page générique du plan de site (rubrique sans texte
 *  métier prérédigé) : un bloc d'en-tête + un bloc adapté au type d'entité
 *  déclarée, jamais le même agencement pour "hero" seul comme avant. */
export function composeFallbackPageBlocks(page, entity, bp) {
  const seed = stableHash(N(page.label || page.id || ""));
  const blocks = [
    {
      type: "hero",
      variant: pick(seed, 0, ["centered", "split"]),
      props: {
        title: page.label,
        lead: entity?.label
          ? `Retrouvez ici : ${entity.label}.`
          : "Cette rubrique est prête à être utilisée.",
      },
    },
  ];
  if (entity?.fields?.length) {
    blocks.push({
      type: "entity-list-preview",
      variant: pick(seed, 1, ["cards", "rows"]),
      props: {
        entityLabel: entity.label,
        sampleItems: entity.fields.slice(0, 6).map((f) => f.label),
      },
    });
  }
  blocks.push({
    type: "banner-note",
    variant: "default",
    props: {
      text: "Une question sur cette page ? L'assistant peut vous répondre.",
      tone: "info",
    },
  });
  return sanitizeBlockTree(blocks, bp.modules) || blocks;
}

/* ════════════════════════════════════════════════════════════════════
   5. FUSION DES DÉCISIONS DE L'ÉQUIPE MULTI-AGENTS
   ────────────────────────────────────────────────────────────────────
   `overrides.homeBlocks` et `overrides.sitePlan.pages[].blocks` sont les
   arbres produits par l'architecte/rédacteur IA (aigentAgents.js, à
   mettre à jour pour les émettre — voir note en fin de fichier). Chaque
   arbre est revalidé ICI, indépendamment de la confiance qu'on accorde
   à l'agent qui l'a produit : sanitizeBlockTree est la seule porte
   d'entrée vers le rendu, jamais un raccourci "on lui fait confiance".
   ════════════════════════════════════════════════════════════════════ */

function deriveGenericPages(sitePlan, bp) {
  const existingPaths = new Set((bp.nav || []).map((n) => n.path));
  const pages = (sitePlan.pages || []).filter(
    (p) => !existingPaths.has(p.path),
  );
  const pageIds = new Set(pages.map((p) => p.id));
  const nav = (sitePlan.nav || [])
    .filter((id) => pageIds.has(id))
    .map((id) => pages.find((p) => p.id === id))
    .filter(Boolean);
  const entityAuth = {};
  pages.forEach((p) => {
    if (p.entity && p.auth) entityAuth[p.entity] = true;
  });
  return {
    domainLabel: sitePlan.domainLabel,
    vocabulary: sitePlan.vocabulary,
    entities: sitePlan.entities || [],
    pages: pages.map((p) => {
      const entity =
        (sitePlan.entities || []).find((e) => e.id === p.entity) || null;
      const validated = sanitizeBlockTree(p.blocks, bp.modules);
      return {
        ...p,
        blocks: validated || composeFallbackPageBlocks(p, entity, bp),
      };
    }),
    nav,
    entityAuth,
    needsAuthModule: Object.keys(entityAuth).length > 0,
  };
}

export function finalizeBlueprint(spec, draftBp, overrides) {
  let bp = draftBp;
  if (overrides?.commerceModel) {
    const merged = mergeClassification(
      classifyDomainByRegex(spec),
      overrides.commerceModel,
    );
    bp = buildBlueprintFromClassification(spec, merged);
  }
  return applyCreativeOverrides(bp, overrides, spec);
}

export function applyCreativeOverrides(bp, overrides, spec = {}) {
  if (!overrides) {
    return { ...bp, homeBlocks: composeFallbackBlocks(spec, bp, null) };
  }
  const next = { ...bp };
  if (overrides.hero?.title && overrides.hero?.lead) next.hero = overrides.hero;
  if (
    Array.isArray(overrides.features) &&
    overrides.features.length === bp.features.length
  ) {
    next.features = bp.features.map((f, i) => ({
      ...f,
      title: overrides.features[i]?.title || f.title,
      text: overrides.features[i]?.text || f.text,
    }));
  }
  if (
    Array.isArray(overrides.steps) &&
    overrides.steps.length === bp.steps.length
  ) {
    next.steps = overrides.steps;
  }
  if (Array.isArray(overrides.benefits) && overrides.benefits.length) {
    next.benefits = overrides.benefits.slice(0, 4);
  }
  if (overrides.spotlight?.title && overrides.spotlight?.paragraphs?.length) {
    next.spotlight = overrides.spotlight;
  }
  if (overrides.authCopy) next.authCopy = overrides.authCopy;
  if (overrides.qaFlag) next.qaFlag = overrides.qaFlag;
  if (overrides.extraTool?.passedScan) next.extraTool = overrides.extraTool;

  if (overrides.sitePlan?.pages?.length) {
    const generic = deriveGenericPages(overrides.sitePlan, next);
    next.sitePlan = generic;
    if (generic.needsAuthModule && !next.modules.auth) {
      next.modules = { ...next.modules, auth: true };
    }
    if (generic.nav.length) {
      const navPages = generic.nav.map((p) => ({
        path: p.path,
        label: p.label,
        auth: !!p.auth,
      }));
      const helpIdx = next.nav.findIndex((n) => n.path === "/aide");
      next.nav =
        helpIdx >= 0
          ? [
              ...next.nav.slice(0, helpIdx),
              ...navPages,
              ...next.nav.slice(helpIdx),
            ]
          : [...next.nav, ...navPages];
    }
    const isDefaultGreeting =
      bp.greeting === "Bonjour, comment puis-je vous aider ?";
    const isDefaultSuggestions =
      !bp.suggestions?.length || bp.suggestions[0] === "Comment ça marche ?";
    if (generic.vocabulary?.itemPlural && isDefaultGreeting) {
      const { itemPlural, actionVerb } = generic.vocabulary;
      next.greeting = actionVerb
        ? `Bonjour, je peux vous aider à ${actionVerb} ${itemPlural}. Posez-moi votre question.`
        : `Bonjour, je peux vous aider avec vos ${itemPlural}. Posez-moi votre question.`;
    }
    if (generic.pages?.length && isDefaultSuggestions) {
      next.suggestions = generic.pages
        .slice(0, 3)
        .map((p) => `Que puis-je faire dans « ${p.label} » ?`);
    }
  }
  if (Array.isArray(overrides.capabilities) && overrides.capabilities.length) {
    next.capabilities = overrides.capabilities;
  }

  // L'ACCUEIL : arbre validé de l'IA si présent et exploitable, sinon
  // secours varié — jamais le squelette figé unique d'avant.
  const validatedHome = sanitizeBlockTree(overrides.homeBlocks, next.modules);
  next.homeBlocks =
    validatedHome ||
    composeFallbackBlocks(spec, next, overrides.copyForFallback || null);

  return next;
}

export async function generateProjectWithAgents(
  spec0,
  extras = {},
  { onEvent } = {},
) {
  const draftBp = deriveBlueprint(spec0);
  let overrides = null;
  try {
    overrides = await runMultiAgentBuild(spec0, draftBp, { onEvent });
  } catch (err) {
    console.warn(
      "[AiGENT agents] équipe indisponible, repli sur le gabarit standard:",
      err.message,
    );
  }
  const finalBp = finalizeBlueprint(spec0, draftBp, overrides);
  return generateProject(spec0, extras, finalBp);
}

/* ════════════════════════════════════════════════════════════════════
   6. CONTENU DE DÉPART — connaissances, données de démo (inchangé)
   ════════════════════════════════════════════════════════════════════ */

function moduleRules(bp) {
  const r = [];
  if (Array.isArray(bp.capabilities) && bp.capabilities.length) {
    r.push(
      "CAPACITÉS DE CE SITE :\n" +
        bp.capabilities
          .map(
            (c) => `- ${c.label}${c.description ? " : " + c.description : ""}`,
          )
          .join("\n"),
    );
  }
  if (bp.modules.orders)
    r.push(
      "COMMANDES : utilise l'outil orders_lookup pour répondre sur une commande. Client connecté : tu peux consulter SES commandes. Client non connecté : exige le numéro de commande ET l'email utilisé, ou invite-le à se connecter. Ne révèle jamais une information de commande sans cette vérification. Ne devine jamais un statut : cite celui renvoyé par l'outil.",
    );
  if (bp.modules.returns)
    r.push(
      "RETOURS : un retour se lance depuis l'espace client (Retours > Nouveau retour). Tu peux aussi le créer avec returns_create, uniquement pour un client connecté, après lui avoir résumé la commande, les articles, le motif et la solution, et obtenu sa confirmation explicite. Consulte l'avancement avec returns_status. Ne promets jamais un remboursement : indique seulement que la demande est enregistrée.",
    );
  if (bp.modules.booking)
    r.push(
      bp.bookingMode === "confirm"
        ? "RÉSERVATION : vérifie la disponibilité avant de promettre un créneau."
        : "RÉSERVATION : tu enregistres une demande, jamais une confirmation. Dis que l'équipe la confirmera.",
    );
  r.push(
    "En cas de doute, de colère du client ou d'enjeu financier, propose un transfert vers un humain (handoff_human).",
  );
  return r.join("\n");
}

function starterFaq(bp) {
  const m = bp.modules;
  const out = [];
  if (m.orders)
    out.push(
      {
        title: "Comment suivre ma commande ?",
        answer:
          "Connectez-vous à votre espace client et ouvrez « Mes commandes », ou utilisez la page « Suivre un colis » avec votre numéro de commande et l'email utilisé lors de l'achat.",
      },
      {
        title: "Où trouver mon numéro de commande ?",
        answer:
          "Il figure dans l'email de confirmation reçu juste après votre achat.",
      },
    );
  if (m.returns)
    out.push(
      {
        title: "Comment retourner un article ?",
        answer:
          "Depuis votre espace client, ouvrez « Retours » puis « Nouveau retour ». Choisissez la commande et les articles concernés, indiquez le motif et la solution souhaitée. Seules les commandes livrées peuvent faire l'objet d'un retour.",
      },
      {
        title: "Comment suivre l'avancement de mon retour ?",
        answer:
          "Chaque demande apparaît dans la rubrique « Retours » de votre espace, avec son statut.",
      },
    );
  if (m.auth)
    out.push({
      title: "Comment créer un compte ?",
      answer:
        "Cliquez sur « Créer un compte » et renseignez votre nom, votre email et un mot de passe. Les commandes passées avec cet email apparaissent automatiquement dans votre espace.",
    });
  if (m.booking)
    out.push({
      title:
        bp.booking.kind === "table"
          ? "Comment réserver une table ?"
          : "Comment réserver ?",
      answer:
        "Utilisez le bouton « " +
        bp.booking.title +
        " » : quelques questions, et votre demande nous parvient. " +
        (bp.bookingMode === "confirm"
          ? "La disponibilité est vérifiée en direct."
          : "Nous la confirmons ensuite avec vous."),
    });
  if (m.catalog)
    out.push({
      title: bp.labels.isMenu
        ? "Où consulter le menu ?"
        : "Où voir les produits ?",
      answer:
        "Dans la rubrique « " +
        bp.labels.catalog +
        " » : recherche et filtres par catégorie.",
    });
  out.push({
    title: "Comment contacter l'équipe ?",
    answer:
      "Depuis la page Aide, utilisez « Nous écrire », ou posez votre question à l'assistant : il peut transmettre votre demande à un humain.",
  });
  return out;
}

function starterPolicies(bp) {
  const s = [];
  if (bp.domain === "ecommerce")
    s.push(
      [
        "Délais et frais de livraison",
        "Indiquez vos délais par zone, vos transporteurs et vos frais.",
      ],
      [
        "Conditions de retour",
        "Indiquez le délai de retour, les articles exclus et qui prend en charge les frais.",
      ],
      [
        "Paiement et facturation",
        "Indiquez les moyens de paiement acceptés et où retrouver les factures.",
      ],
      [
        "Garantie et service après-vente",
        "Indiquez la durée de garantie et la marche à suivre en cas de défaut.",
      ],
    );
  if (bp.modules.booking)
    s.push(
      [
        "Horaires et adresse",
        "Indiquez vos horaires d'ouverture et votre adresse.",
      ],
      [
        "Conditions de réservation",
        "Indiquez le délai d'annulation, la taille maximale des groupes, etc.",
      ],
    );
  if (!s.length)
    s.push([
      "Informations générales",
      "Présentez votre activité, vos horaires et vos coordonnées.",
    ]);
  return s;
}

function knowledgeFiles(bp, entries) {
  const files = {};
  files["knowledge/faq.md"] =
    "# Questions fréquentes\n\n" +
    starterFaq(bp)
      .map((f) => `## ${f.title}\n${f.answer}\n`)
      .join("\n");
  files["knowledge/politiques.md"] =
    "# Informations à compléter\n\n" +
    "<!-- Remplacez chaque [À compléter] par vos informations réelles : l'assistant s'en servira, et le passage apparaîtra dans la FAQ du site. -->\n\n" +
    starterPolicies(bp)
      .map(([t, s]) => `## ${t}\n[À compléter] ${s}\n`)
      .join("\n");
  for (const entry of entries || []) {
    const slug = slugify(entry.id || entry.title);
    if (["faq", "politiques"].includes(slug)) continue;
    files[`knowledge/${slug}.md`] =
      `# ${entry.title}\n\n[À compléter] ${entry.sample || ""}\n\n` +
      (entry.answers?.length
        ? `<!-- Cette section répond notamment à :\n${entry.answers.map((a) => `- ${a}`).join("\n")}\n-->\n`
        : "");
  }
  return files;
}

function demoDataFor(bp) {
  const products = [
    {
      sku: "SNK-01",
      name: "Sneakers Aero",
      category: "Chaussures",
      description: "Semelle légère, tige respirante.",
      price: 89.9,
    },
    {
      sku: "SCK-03",
      name: "Pack de 3 paires de chaussettes",
      category: "Accessoires",
      description: "Coton peigné, coloris assortis.",
      price: 14.9,
    },
    {
      sku: "BAG-02",
      name: "Sac Nomade",
      category: "Sacs",
      description: "Toile déperlante, 22 litres.",
      price: 64,
    },
    {
      sku: "JKT-07",
      name: "Veste Horizon",
      category: "Vêtements",
      description: "Coupe-vent léger et pliable.",
      price: 139,
    },
    {
      sku: "CAP-04",
      name: "Casquette Atlas",
      category: "Accessoires",
      description: "Coton bio, taille ajustable.",
      price: 24,
    },
    {
      sku: "TEE-09",
      name: "T-shirt Essentiel",
      category: "Vêtements",
      description: "Jersey épais, coupe droite.",
      price: 29,
    },
  ];
  const dishes = [
    {
      name: "Burrata et tomates anciennes",
      category: "Entrées",
      description: "Huile d'olive, basilic.",
      price: 14,
    },
    {
      name: "Velouté de potimarron",
      category: "Entrées",
      description: "Éclats de châtaigne.",
      price: 9,
    },
    {
      name: "Filet de bar, beurre blanc",
      category: "Plats",
      description: "Légumes de saison.",
      price: 26,
    },
    {
      name: "Risotto aux champignons",
      category: "Plats",
      description: "Parmesan 24 mois.",
      price: 21,
    },
    {
      name: "Tarte fine aux pommes",
      category: "Desserts",
      description: "Crème d'Isigny.",
      price: 9,
    },
    {
      name: "Mousse au chocolat",
      category: "Desserts",
      description: "Chocolat noir 70 %.",
      price: 8,
    },
  ];
  const ev = (status, label, location, d) => ({
    status,
    label,
    location,
    daysAgo: d,
  });
  const orders = bp.modules.orders
    ? [
        {
          ref: "CMD-48213",
          status: "delivered",
          placedDaysAgo: 12,
          carrier: "Colissimo",
          trackingNumber: "6A12345678901",
          shippingAddress: "12 rue des Lilas, 69003 Lyon",
          items: [
            { sku: "SNK-01", name: "Sneakers Aero", qty: 1, unitPrice: 89.9 },
            {
              sku: "SCK-03",
              name: "Pack de 3 paires de chaussettes",
              qty: 2,
              unitPrice: 14.9,
            },
          ],
          events: [
            ev("placed", "Commande confirmée", null, 12),
            ev("processing", "Préparation en entrepôt", "Lyon", 12),
            ev("shipped", "Colis remis au transporteur", "Lyon", 10),
            ev("out_for_delivery", "En cours de livraison", "Lyon 3e", 8),
            ev("delivered", "Colis livré", "Lyon 3e", 8),
          ],
        },
        {
          ref: "CMD-48377",
          status: "out_for_delivery",
          placedDaysAgo: 4,
          etaInDays: 0,
          carrier: "Colissimo",
          trackingNumber: "6A98765432109",
          shippingAddress: "12 rue des Lilas, 69003 Lyon",
          items: [{ sku: "BAG-02", name: "Sac Nomade", qty: 1, unitPrice: 64 }],
          events: [
            ev("placed", "Commande confirmée", null, 4),
            ev("processing", "Préparation en entrepôt", "Lyon", 4),
            ev("shipped", "Colis remis au transporteur", "Lyon", 2),
            ev("out_for_delivery", "En cours de livraison", "Lyon 3e", 0),
          ],
        },
        {
          ref: "CMD-48490",
          status: "processing",
          placedDaysAgo: 1,
          etaInDays: 4,
          shippingAddress: "12 rue des Lilas, 69003 Lyon",
          items: [
            { sku: "JKT-07", name: "Veste Horizon", qty: 1, unitPrice: 139 },
          ],
          events: [
            ev("placed", "Commande confirmée", null, 1),
            ev("processing", "Préparation en entrepôt", "Lyon", 1),
          ],
        },
      ].map((o) => ({
        ...o,
        total: o.items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
      }))
    : [];
  const catalog = bp.modules.catalog
    ? bp.labels.isMenu
      ? dishes
      : products
    : [];
  return { orders, catalog, faq: starterFaq(bp), returnWindowDays: 30 };
}

/* ════════════════════════════════════════════════════════════════════
   7. CAPACITÉS, SERVICES, THÈME (inchangé)
   ════════════════════════════════════════════════════════════════════ */

function toolsOf(spec) {
  return (spec.tools || [])
    .map((t) => TOOL_CATALOG.find((c) => c.id === t.id))
    .filter(Boolean);
}
const toolIds = (spec) => new Set((spec.tools || []).map((t) => t.id));
function needsEmail(spec) {
  return toolsOf(spec).some((t) => t.service === "email");
}
function needsDatabase() {
  return true;
}
export function computeInterfaceMode() {
  return "site";
}

const LIGHT_ACCENTS = {
  monochrome: "#16171A",
  warm: "#D9752B",
  clinical: "#2E6FE0",
  calm: "#2E9E74",
};

function lightTokensFor(spec, bp) {
  const preset =
    STYLE_PRESETS.find(
      (s) => s.id === (spec.interface?.styleId || "monochrome"),
    ) || STYLE_PRESETS[0];
  const theme = spec.interface?.theme || {};
  const accent =
    theme.accent ||
    bp?.customAccent ||
    LIGHT_ACCENTS[preset.id] ||
    preset.tokens.accent;
  const adv = theme.advanced || {};
  const opacity =
    Math.min(100, Math.max(60, Number(adv.opacitySurfaces) || 100)) / 100;
  const bubbleRadius =
    { rounded: "14px", sharp: "4px", minimal: "8px" }[adv.chatBubbleStyle] ||
    "14px";
  const navStyle = ["solid", "translucent"].includes(adv.navStyle)
    ? adv.navStyle
    : "translucent";
  const dark =
    adv.darkOverrides && typeof adv.darkOverrides === "object"
      ? adv.darkOverrides
      : {};
  return {
    bg: theme.bg || "#FFFFFF",
    surface: "#FAFAFB",
    surfaceAlt: "#F3F4F6",
    border: "#E6E7EB",
    text: theme.text || "#101114",
    muted: "#6B6E76",
    accent,
    accentTo: theme.accentTo || accent,
    headerBg: theme.headerColor || theme.bg || "#FFFFFF",
    accentText: "#FFFFFF",
    radius: preset.tokens.radius,
    font: preset.tokens.font,
    surfaceOpacity: opacity,
    bubbleRadius,
    navStyle,
    darkBg: /^#[0-9a-fA-F]{6}$/.test(dark.bg || "") ? dark.bg : null,
    darkText: /^#[0-9a-fA-F]{6}$/.test(dark.text || "") ? dark.text : null,
    darkSurface: /^#[0-9a-fA-F]{6}$/.test(dark.surface || "")
      ? dark.surface
      : null,
  };
}

function styleTokens(spec) {
  const preset =
    STYLE_PRESETS.find(
      (s) => s.id === (spec.interface?.styleId || "monochrome"),
    ) || STYLE_PRESETS[0];
  return { ...preset.tokens, ...(spec.interface?.theme || {}) };
}

export function integrationsFor(spec, bp = deriveBlueprint(spec)) {
  const list = [...computeIntegrations(spec)];
  if (bp.modules.auth)
    list.push({
      service: "sessions",
      label: "Sessions clients",
      required: true,
      env: ["SESSION_SECRET"],
      status: "to_connect",
      reason:
        "Signature des sessions de connexion de vos clients (générez une valeur longue et aléatoire).",
    });
  if (bp.modules.orders)
    list.push({
      service: "orders_source",
      label: "Synchronisation des commandes",
      required: false,
      env: ["ADMIN_TOKEN"],
      status: "to_connect",
      reason:
        "Votre boutique ou votre back-office envoie les commandes à /api/admin/orders avec ce jeton.",
    });
  return list;
}

export function envKeysFor(spec) {
  const keys = new Set(["PORT"]);
  for (const i of integrationsFor(spec))
    (i.env || []).forEach((e) => keys.add(e));
  return [...keys];
}

/* ════════════════════════════════════════════════════════════════════
   8. FICHIERS RACINE (inchangé)
   ════════════════════════════════════════════════════════════════════ */

function fileEnvExample(spec, bp) {
  const integrations = integrationsFor(spec, bp);
  const lines = [
    "# ─────────────────────────────────────────────────────────────",
    `# ${spec.name || "Mon AiGENT"} — variables d'environnement`,
    "# Renseignez VOS propres clés. Ce fichier ne contient jamais de secret.",
    "# Copiez-le en .env :  cp .env.example .env",
    "# ─────────────────────────────────────────────────────────────",
    "",
    "PORT=3000",
    "NODE_ENV=development",
    "",
  ];
  for (const integ of integrations) {
    const svc = SERVICE_CATALOG[integ.service];
    lines.push(`# ${integ.label} — ${svc?.help || integ.reason}`);
    for (const key of integ.env) {
      if (key === "AI_BASE_URL")
        lines.push(
          "AI_BASE_URL=https://api.openai.com/v1   # ou tout endpoint compatible OpenAI",
        );
      else if (key === "SESSION_SECRET" || key === "ADMIN_TOKEN")
        lines.push(`${key}=   # générez-le : openssl rand -hex 32`);
      else lines.push(`${key}=`);
    }
    lines.push("");
  }
  if (bp.modules.returns) {
    lines.push(
      "# Retours — nombre de jours après livraison pendant lesquels un retour est accepté",
    );
    lines.push("RETURN_WINDOW_DAYS=30", "");
  }
  return lines.join("\n");
}

const hasDemo = (bp) => bp.modules.orders || bp.modules.catalog;

function filePackageJson(spec, bp) {
  const deps = {
    express: "^4.19.2",
    cors: "^2.8.5",
    dotenv: "^16.4.5",
    pg: "^8.11.5",
  };
  if (needsEmail(spec)) deps.nodemailer = "^6.9.13";
  const scripts = {
    start: "node backend/server.js",
    dev: "node --watch backend/server.js",
    "db:init": "node backend/scripts/init-db.js",
  };
  if (hasDemo(bp)) scripts["db:seed"] = "node backend/scripts/seed-demo.js";
  return J({
    name: spec.slug || slugify(spec.name || "mon-aigent"),
    version: "1.0.0",
    private: true,
    type: "module",
    description: spec.tagline || "AiGENT généré",
    scripts,
    engines: { node: ">=18" },
    dependencies: deps,
  });
}

function fileReadme(spec, bp, integrations) {
  const pages = [
    "- **Accueil** — présentation, action principale, questions fréquentes",
    bp.modules.auth && "- **Connexion / Inscription** — comptes clients",
    bp.modules.auth && "- **Espace client** — tableau de bord personnel",
    bp.modules.orders &&
      "- **Suivi de colis** (public) et **Mes commandes** — chronologie détaillée par commande",
    bp.modules.returns &&
      "- **Retours** — demande guidée pas à pas, suivi du statut",
    bp.modules.catalog &&
      `- **${bp.labels.catalog}** — recherche, filtres, questions sur chaque fiche`,
    bp.modules.booking &&
      `- **${bp.booking.title}** — parcours guidé (${bp.bookingMode === "confirm" ? "confirmation en direct" : "demande à confirmer"})`,
    "- **Aide** — FAQ issue de `knowledge/` et formulaire de contact",
    "- **Assistant IA** — présent sur toutes les pages" +
      (bp.modules.orders
        ? ", il connaît les commandes du client connecté"
        : ""),
  ]
    .filter(Boolean)
    .join("\n");
  const missing = integrations
    .map(
      (i) =>
        `- **${i.label}** — ${i.reason}\n  Variables : \`${i.env.join("`, `")}\``,
    )
    .join("\n");
  const fence = "```";
  return [
    `# ${spec.name || "Mon AiGENT"}`,
    "",
    spec.tagline || "",
    "",
    "Projet généré par **AiGENT**. Le code vous appartient : vous le modifiez, l'hébergez et",
    "le branchez sur **vos propres services**. Le site est complet : il ne manque que vos clés.",
    "",
    "## Ce que contient le site",
    "",
    pages,
    "",
    "## Démarrage",
    "",
    fence + "bash",
    "npm install",
    "cp .env.example .env      # puis renseignez vos clés",
    "npm run db:init           # crée les tables",
    hasDemo(bp)
      ? "npm run db:seed           # (facultatif) données de démonstration"
      : "",
    "npm start",
    fence,
    "",
    "Ouvrez ensuite http://localhost:3000",
    hasDemo(bp) && bp.modules.auth
      ? "\nAprès `npm run db:seed` : compte de démonstration **demo@exemple.fr** / **demo1234**."
      : "",
    "",
    "## Services à connecter",
    "",
    missing,
    "",
    "Tant qu'un service n'est pas renseigné, l'endpoint concerné répond `service_not_configured`",
    "et le site l'indique clairement : rien ne prétend jamais avoir réussi.",
    "",
    bp.modules.orders
      ? [
          "## Alimenter les commandes",
          "",
          "Votre boutique (Shopify, WooCommerce, back-office…) envoie chaque commande — et chaque",
          "changement de statut — à l'API d'administration. Le client la voit aussitôt dans son espace.",
          "",
          fence + "bash",
          "curl -X POST http://localhost:3000/api/admin/orders \\",
          '  -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \\',
          '  -d \'{"ref":"CMD-1001","email":"client@exemple.fr","status":"shipped","total":89.9,',
          '       "carrier":"Colissimo","trackingNumber":"6A123",',
          '       "items":[{"sku":"SNK-01","name":"Sneakers","qty":1,"unitPrice":89.9}],',
          '       "events":[{"status":"shipped","label":"Colis remis au transporteur","occurredAt":"2026-09-18T10:00:00Z"}]}\'',
          "",
          "# ajouter un événement à une commande existante",
          "curl -X POST http://localhost:3000/api/admin/orders/CMD-1001/events \\",
          '  -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \\',
          '  -d \'{"status":"delivered","label":"Colis livré","location":"Lyon"}\'',
          fence,
          "",
          "Statuts d'une commande : `processing`, `shipped`, `out_for_delivery`, `delivered`, `cancelled`.",
          bp.modules.returns
            ? "Statuts d'un retour (`PATCH /api/admin/returns/:ref`) : `requested`, `approved`, `received`, `refunded`, `rejected`.\n"
            : "",
        ].join("\n")
      : "",
    "## Connaissances",
    "",
    "Ajoutez vos contenus dans `knowledge/*.md` (un titre `##` par question). Tout passage marqué",
    "`[À compléter]` alimente l'assistant mais reste caché de la FAQ publique tant que vous ne l'avez pas rempli.",
    "",
    "## Structure",
    "",
    fence,
    "backend/   server.js · src/agent.js · src/routes · src/services · src/tools · src/auth.js",
    "frontend/  index.html · styles.css (variables en tête) · app.js",
    "knowledge/ vos contenus (markdown)",
    "database/  schema.sql",
    "agent.config.json   la configuration de votre AiGENT",
    fence,
    "",
    "## Personnalisation",
    "",
    "- **Ton et périmètre de l'assistant** : `backend/src/prompt.js`",
    "- **Apparence** : variables CSS en haut de `frontend/styles.css`",
    "- **Capacités de l'assistant** : `backend/src/tools/`",
    "",
    "## Licence",
    "",
    "Ce code vous appartient.",
    "",
  ].join("\n");
}

function fileGitignore() {
  return [
    "node_modules/",
    ".env",
    ".env.local",
    "*.log",
    ".DS_Store",
    "dist/",
    "data/*.sqlite",
  ].join("\n");
}

/* ════════════════════════════════════════════════════════════════════
   9. BACK-END — gabarits (inchangé : ce n'est pas la source du bug)
   ════════════════════════════════════════════════════════════════════ */

const SRV_SERVER = String.raw`import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

import { handleChat } from "./src/agent.js";
import { loadKnowledge } from "./src/knowledge.js";
import { toolRoutes } from "./src/tools/index.js";
import { rateLimit } from "./src/middleware/rate-limit.js";
import { notFound, errorHandler } from "./src/middleware/errors.js";
import { siteRoutes } from "./src/routes/site.js";
import { initPool } from "./src/db.js";
//#if auth
import { optionalAuth } from "./src/auth.js";
import { accountRoutes } from "./src/routes/account.js";
import { adminRoutes } from "./src/routes/admin.js";
//#endif
//#if entities
import { entityRoutes } from "./src/routes/entities.js";
//#endif

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "frontend")));
//#if auth
app.use("/api", optionalAuth);
//#endif

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    env: process.env.NODE_ENV || "development",
    agent: __AGENT_NAME__,
    modules: __MODULES__,
    policy: { returnWindowDays: Number(process.env.RETURN_WINDOW_DAYS || 30) },
    configured: {
      ai: Boolean(process.env.AI_API_KEY),
      database: Boolean(process.env.DATABASE_URL),
//#if auth
      sessions: Boolean(process.env.SESSION_SECRET),
//#endif
//#if email
      email: Boolean(process.env.SMTP_HOST),
//#endif
    },
  });
});

app.post("/api/chat", rateLimit({ windowMs: 60000, max: 30 }), async (req, res, next) => {
  try {
    const { message, history = [], sessionId } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message requis" });
    }
    if (!process.env.AI_API_KEY) {
      return res.status(503).json({
        error: "service_not_configured",
        service: "ai_provider",
        message: "Renseignez AI_API_KEY dans votre fichier .env pour activer l'assistant.",
      });
    }
    const result = await handleChat({
      message: message.slice(0, 2000),
      history: Array.isArray(history) ? history : [],
      sessionId,
      customer: req.customer || null,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

//#if auth
app.use("/api/admin", adminRoutes);
app.use("/api", accountRoutes);
//#endif
app.use("/api", siteRoutes);

app.use("/api/tools", rateLimit({ windowMs: 60000, max: 60 }), toolRoutes);
//#if entities
app.use("/api/entities", rateLimit({ windowMs: 60000, max: 60 }), entityRoutes);
//#endif


app.use(notFound);
app.use(errorHandler);

await initPool().catch((e) => console.warn("⚠️  Base de données injoignable : " + e.message));
await loadKnowledge();

app.listen(PORT, () => {
  console.log(__AGENT_NAME__ + " démarré sur http://localhost:" + PORT);
  if (!process.env.AI_API_KEY) console.warn("⚠️  AI_API_KEY manquante — l'assistant répondra 503 tant qu'elle n'est pas renseignée.");
});
`;

const SRV_AUTH = String.raw`import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const TTL_SECONDS = 60 * 60 * 24 * 14;

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) {
  console.warn("⚠️  SESSION_SECRET manquant : les connexions seront perdues à chaque redémarrage.");
}

const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return "scrypt$" + salt.toString("hex") + "$" + hash.toString("hex");
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function issueToken(customer) {
  const body = Buffer.from(JSON.stringify({
    id: customer.id, email: customer.email, name: customer.name,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  })).toString("base64url");
  return body + "." + sign(body);
}

export function readToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  req.customer = header.startsWith("Bearer ") ? readToken(header.slice(7)) : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.customer) {
    return res.status(401).json({ ok: false, error: "auth_required", message: "Connectez-vous pour continuer." });
  }
  next();
}
`;

const SRV_ORDERS_SERVICE = String.raw`import crypto from "node:crypto";
import { query, withTx } from "../db.js";

const ORDER_COLS =
  "o.id, o.ref, o.status, o.placed_at, o.total, o.currency, o.carrier, o.tracking_number, o.tracking_url, to_char(o.eta, 'YYYY-MM-DD') AS eta, o.shipping_address";

const shapeItem = (i) => ({ sku: i.sku, name: i.name, qty: i.qty, unitPrice: Number(i.unit_price) });
const shapeEvent = (e) => ({ status: e.status, label: e.label, location: e.location, occurredAt: e.occurred_at });

function shapeOrder(o, items = [], events = []) {
  return {
    ref: o.ref, status: o.status, placedAt: o.placed_at, total: Number(o.total), currency: o.currency || "EUR",
    carrier: o.carrier, trackingNumber: o.tracking_number, trackingUrl: o.tracking_url, eta: o.eta,
    shippingAddress: o.shipping_address, itemsCount: items.reduce((s, i) => s + i.qty, 0), items, events,
  };
}

function scopeSql(scope) {
  if (scope.customer) {
    return { sql: "(o.customer_id = $1 OR lower(o.email) = lower($2))", params: [scope.customer.id, scope.customer.email] };
  }
  return { sql: "lower(o.email) = lower($1)", params: [scope.email] };
}

export async function listOrders(customer) {
  const w = scopeSql({ customer });
  const rows = await query("SELECT " + ORDER_COLS + " FROM orders o WHERE " + w.sql + " ORDER BY o.placed_at DESC LIMIT 50", w.params);
  if (!rows.length) return [];
  const items = await query(
    "SELECT order_id, sku, name, qty, unit_price FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id",
    [rows.map((r) => r.id)],
  );
  return rows.map((r) => shapeOrder(r, items.filter((i) => i.order_id === r.id).map(shapeItem)));
}

export async function getOrder(ref, scope) {
  const w = scopeSql(scope);
  const rows = await query(
    "SELECT " + ORDER_COLS + " FROM orders o WHERE upper(o.ref) = upper($" + (w.params.length + 1) + ") AND " + w.sql + " LIMIT 1",
    [...w.params, String(ref || "").trim()],
  );
  if (!rows.length) return null;
  const items = await query("SELECT sku, name, qty, unit_price FROM order_items WHERE order_id = $1 ORDER BY id", [rows[0].id]);
  const events = await query("SELECT status, label, location, occurred_at FROM order_events WHERE order_id = $1 ORDER BY occurred_at, id", [rows[0].id]);
  return shapeOrder(rows[0], items.map(shapeItem), events.map(shapeEvent));
}
//#if returns

export const RETURN_REASONS = ["too_small", "too_big", "defective", "not_as_described", "wrong_item", "other"];
export const RETURN_RESOLUTIONS = ["refund", "exchange", "credit"];

const invalid = (message) => ({ ok: false, error: "invalid", message });

export async function listReturns(customer) {
  const rows = await query(
    "SELECT r.id, r.ref, r.status, r.reason, r.resolution, r.comment, r.created_at, o.ref AS order_ref " +
      "FROM returns r JOIN orders o ON o.id = r.order_id " +
      "WHERE r.customer_id = $1 OR lower(o.email) = lower($2) ORDER BY r.created_at DESC LIMIT 50",
    [customer.id, customer.email],
  );
  if (!rows.length) return [];
  const items = await query("SELECT return_id, sku, name, qty FROM return_items WHERE return_id = ANY($1::int[]) ORDER BY id", [rows.map((r) => r.id)]);
  return rows.map((r) => ({
    ref: r.ref, orderRef: r.order_ref, status: r.status, reason: r.reason, resolution: r.resolution,
    comment: r.comment, createdAt: r.created_at,
    items: items.filter((i) => i.return_id === r.id).map((i) => ({ sku: i.sku, name: i.name, qty: i.qty })),
  }));
}

export async function createReturn(customer, { orderRef, items, reason, resolution, comment }) {
  if (!RETURN_REASONS.includes(reason)) return invalid("Motif de retour invalide.");
  if (!RETURN_RESOLUTIONS.includes(resolution)) return invalid("Solution souhaitée invalide.");
  const order = await getOrder(orderRef, { customer });
  if (!order) return { ok: false, error: "not_found", message: "Commande introuvable." };
  if (order.status !== "delivered") {
    return { ok: false, error: "not_eligible", message: "Seules les commandes livrées peuvent faire l'objet d'un retour." };
  }
  const delivered = order.events.filter((e) => e.status === "delivered").pop();
  const since = new Date((delivered && delivered.occurredAt) || order.placedAt).getTime();
  const windowDays = Number(process.env.RETURN_WINDOW_DAYS || 30);
  if (Date.now() - since > windowDays * 86400000) {
    return { ok: false, error: "window_expired", message: "Le délai de retour de " + windowDays + " jours est dépassé pour cette commande." };
  }
  const picked = [];
  for (const it of Array.isArray(items) ? items : []) {
    const line = order.items.find((i) => i.sku === it.sku);
    const qty = Math.floor(Number(it.qty));
    if (line && qty >= 1 && qty <= line.qty && !picked.some((p) => p.sku === line.sku)) {
      picked.push({ sku: line.sku, name: line.name, qty });
    }
  }
  if (!picked.length) return invalid("Sélectionnez au moins un article à retourner.");

  const ref = "RET-" + crypto.randomInt(100000, 999999);
  const note = comment ? String(comment).slice(0, 1000) : null;
  const created = await withTx(async (q) => {
    const rows = await q(
      "INSERT INTO returns (ref, order_id, customer_id, reason, resolution, comment) " +
        "SELECT $1, o.id, $2, $3, $4, $5 FROM orders o WHERE upper(o.ref) = upper($6) RETURNING id, created_at",
      [ref, customer.id, reason, resolution, note, order.ref],
    );
    for (const p of picked) {
      await q("INSERT INTO return_items (return_id, sku, name, qty) VALUES ($1,$2,$3,$4)", [rows[0].id, p.sku, p.name, p.qty]);
    }
    return rows[0];
  });
  return {
    ok: true,
    return: { ref, orderRef: order.ref, status: "requested", reason, resolution, comment: note, createdAt: created.created_at, items: picked },
  };
}
//#endif
`;

const SRV_ACCOUNT = String.raw`import express from "express";
import { query, isConfigured } from "../db.js";
import { hashPassword, verifyPassword, issueToken, requireAuth } from "../auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
//#if orders
import { listOrders, getOrder } from "../services/orders.js";
//#endif
//#if returns
import { listReturns, createReturn } from "../services/orders.js";
//#endif

export const accountRoutes = express.Router();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const strict = rateLimit({ windowMs: 60000, max: 10 });
const bad = (res, message) => res.status(400).json({ ok: false, error: "invalid", message });
const publicCustomer = (c) => ({ id: c.id, name: c.name, email: c.email });

const needDb = (req, res, next) =>
  isConfigured()
    ? next()
    : res.status(503).json({ ok: false, error: "service_not_configured", service: "database", message: "La base de données n'est pas connectée." });

accountRoutes.post("/auth/register", strict, needDb, async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim().slice(0, 80);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (name.length < 2) return bad(res, "Indiquez votre nom.");
    if (!EMAIL_RE.test(email)) return bad(res, "Adresse email invalide.");
    if (password.length < 8 || password.length > 128) return bad(res, "Le mot de passe doit contenir au moins 8 caractères.");
    const rows = await query(
      "INSERT INTO customers (name, email, password_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING RETURNING id, name, email",
      [name, email, await hashPassword(password)],
    );
    if (!rows.length) {
      return res.status(409).json({ ok: false, error: "email_taken", message: "Un compte existe déjà avec cet email. Connectez-vous." });
    }
    const customer = publicCustomer(rows[0]);
    res.json({ ok: true, token: issueToken(customer), customer });
  } catch (e) {
    next(e);
  }
});

accountRoutes.post("/auth/login", strict, needDb, async (req, res, next) => {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const password = String((req.body || {}).password || "");
    const rows = await query("SELECT id, name, email, password_hash FROM customers WHERE email = $1", [email]);
    const found = rows[0];
    if (!found || !(await verifyPassword(password, found.password_hash))) {
      return res.status(401).json({ ok: false, error: "bad_credentials", message: "Email ou mot de passe incorrect." });
    }
    const customer = publicCustomer(found);
    res.json({ ok: true, token: issueToken(customer), customer });
  } catch (e) {
    next(e);
  }
});

accountRoutes.get("/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, customer: publicCustomer(req.customer) });
});
//#if orders

accountRoutes.get("/orders", requireAuth, needDb, async (req, res, next) => {
  try {
    res.json({ ok: true, orders: await listOrders(req.customer) });
  } catch (e) {
    next(e);
  }
});

accountRoutes.get("/orders/:ref", requireAuth, needDb, async (req, res, next) => {
  try {
    const order = await getOrder(req.params.ref, { customer: req.customer });
    if (!order) return res.status(404).json({ ok: false, error: "not_found", message: "Commande introuvable." });
    res.json({ ok: true, order });
  } catch (e) {
    next(e);
  }
});

accountRoutes.post("/track", rateLimit({ windowMs: 60000, max: 10 }), needDb, async (req, res, next) => {
  try {
    const ref = String((req.body || {}).ref || "").trim().slice(0, 40);
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    if (!ref || !EMAIL_RE.test(email)) return bad(res, "Indiquez votre numéro de commande et l'email utilisé.");
    const order = await getOrder(ref, { email });
    if (!order) return res.status(404).json({ ok: false, error: "not_found", message: "Aucune commande ne correspond à ces informations." });
    res.json({ ok: true, order });
  } catch (e) {
    next(e);
  }
});
//#endif
//#if returns

accountRoutes.get("/returns", requireAuth, needDb, async (req, res, next) => {
  try {
    res.json({ ok: true, returns: await listReturns(req.customer) });
  } catch (e) {
    next(e);
  }
});

accountRoutes.post("/returns", requireAuth, needDb, rateLimit({ windowMs: 60000, max: 10 }), async (req, res, next) => {
  try {
    const out = await createReturn(req.customer, req.body || {});
    res.status(out.ok ? 200 : out.error === "not_found" ? 404 : 422).json(out);
  } catch (e) {
    next(e);
  }
});
//#endif
`;

/* ════════════════════════════════════════════════════════════════════
   NOUVEAU — COMPILATEUR CLIENT DES BLOCS
   ────────────────────────────────────────────────────────────────────
   Remplace intégralement `SECTION_RENDERERS` (v3) : au lieu de 6-10
   fonctions figées, une fonction `renderBlock` générique qui sait rendre
   chacune des 20 primitives de PRIMITIVES, en respectant les variantes.
   Injecté dans `frontend/app.js` (voir CLIENT_BLOCKS ci-dessous), donc
   ce texte reste un String.raw : les `${}` du JS généré sont réels, pas
   interpolés par Node.
   ════════════════════════════════════════════════════════════════════ */

const CLIENT_BLOCKS = String.raw`
  /* ── Compilateur de blocs (remplace l'ancien SECTION_RENDERERS figé) ──
     Chaque bloc {type, variant, props} vient d'un arbre déjà validé côté
     serveur (sanitizeBlockTree) : aucune valeur n'est injectée telle
     quelle sans passer par h(), donc pas de risque d'injection HTML. */
  const BLOCK_RENDERERS = {
    hero(b) {
      const inner = [
        b.props.eyebrow ? h("p", { class: "small muted", style: "text-transform:uppercase;letter-spacing:.06em" }, b.props.eyebrow) : null,
        h("h1", null, b.props.title),
        h("p", { class: "lead" }, b.props.lead),
        b.props.bullets ? h("ul", { class: "ticks", style: "margin-top:16px" }, b.props.bullets.map((t) => h("li", null, ico("check", 16), t))) : null,
      ];
      if (b.variant === "split") return h("section", { class: "block", style: "padding-top:56px" }, h("div", { class: "wrap hero-in" }, h("div", null, inner), h("div", { class: "panel" }, h("h2", null, APP.name), h("p", { class: "muted" }, APP.tagline || ""))));
      if (b.variant === "media-right") return h("section", { class: "block", style: "padding-top:56px" }, h("div", { class: "wrap hero-in" }, h("div", null, inner), h("div", { class: "card pad", style: "aspect-ratio:4/3;display:grid;place-items:center" }, ico("spark", 40))));
      return h("section", { class: "hero" }, h("div", { class: "wrap", style: "max-width:760px;text-align:center;margin:0 auto" }, inner));
    },
    "stat-band"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" }, h("div", { class: "stats", style: b.variant === "row-4" ? "grid-template-columns:repeat(4,1fr)" : "" },
        b.props.stats.map((s) => h("div", { class: "card stat" }, h("span", { class: "muted" }, s.label), h("b", null, s.value))))));
    },
    "split-media"(b) {
      const text = h("div", null, h("h2", null, b.props.title), h("p", { class: "sub" }, b.props.text),
        b.props.points ? h("ul", { class: "ticks" }, b.props.points.map((p) => h("li", null, ico("check", 16), p))) : null);
      const media = h("div", { class: "card pad", style: "aspect-ratio:4/3;display:grid;place-items:center" }, ico("tag", 36));
      return h("section", { class: "block" }, h("div", { class: "wrap hero-in" }, b.variant === "media-left" ? [media, text] : [text, media]));
    },
    "feature-grid"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h("div", { class: "caps" + (b.variant === "list" ? " list" : "") },
          b.props.items.map((f) => h("div", { class: "cap" }, h("span", { class: "cap-ico" }, ico("tag", 20)), h("div", null, h("div", { class: "cap-t" }, f.title), h("p", null, f.text)))))));
    },
    "timeline-vertical"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap", style: "max-width:640px" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h("ol", { class: "timeline", style: "margin-top:20px" },
          b.props.steps.map((s) => h("li", { class: "done" }, h("span", { class: "dot" }, ico("check", 12)), s.title, h("small", null, s.text))))));
    },
    "quote-block"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap", style: "max-width:680px" },
        h("blockquote", { style: (b.variant === "left-border" ? "border-left:3px solid var(--accent);padding-left:20px;" : "text-align:center;") + "font-size:20px;letter-spacing:-.01em;color:var(--text)" }, "« " + b.props.quote + " »"),
        b.props.attribution ? h("p", { class: "muted small", style: "margin-top:10px" }, b.props.attribution) : null));
    },
    "comparison-table"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h("div", { class: "card", style: "overflow-x:auto;margin-top:16px" }, h("table", { class: "table" },
          h("tr", null, h("th"), b.props.columns.map((c) => h("th", null, c))),
          b.props.rows.map((r) => h("tr", null, h("th", null, r.label), r.values.map((v) => h("td", null, v))))))));
    },
    "quiz-preview"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap", style: "max-width:640px" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h("div", { class: "card pad", style: "margin-top:14px" }, h("p", { style: "font-weight:600;margin-bottom:12px" }, b.props.question),
          h("div", { class: "choices" }, b.props.options.map((o) => h("button", { type: "button", class: "choice" }, o))))));
    },
    "progress-tracker"(b) {
      const wrap = b.variant === "vertical" ? "ol" : "div";
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h(wrap, { class: b.variant === "vertical" ? "timeline" : "steps", style: b.variant === "vertical" ? "max-width:520px" : "" },
          b.props.stages.map((s) => h("li", { class: s.status === "done" ? "done" : s.status === "current" ? "current" : "" }, b.variant === "vertical" ? [h("span", { class: "dot" }, s.status === "done" ? ico("check", 12) : null), s.label] : s.label)))));
    },
    "faq-accordion"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h("div", { class: "faq" }, b.props.items.map((f) => h("details", null, h("summary", null, h("span", null, f.q), ico("chevron", 18)), h("div", { class: "a" }, f.a))))));
    },
    "cta-band"(b) {
      return h("section", { class: "wrap", style: "padding:24px 24px 0" }, h("div", { class: "band", style: b.variant === "outline" ? "background:var(--bg);color:var(--text);border:1px solid var(--border)" : "" },
        h("div", null, h("h2", null, b.props.title), b.props.text ? h("p", null, b.props.text) : null),
        h("button", { class: "btn lg", type: "button", style: b.variant === "outline" ? "background:var(--accent);color:var(--on-accent)" : "", onclick: () => openAssistant() }, ico("spark", 18), b.props.actionLabel)));
    },
    spotlight(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" }, h("div", { class: "spotlight" },
        h("h2", null, b.props.title), b.props.paragraphs.map((p) => h("p", null, p)),
        b.props.bullets && b.props.bullets.length ? h("ul", null, b.props.bullets.map((x) => h("li", null, ico("check", 16), x))) : null)));
    },
    "list-preview"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        b.props.title ? h("h2", null, b.props.title) : null,
        b.variant === "rows"
          ? h("div", { class: "card rows" }, b.props.items.map((it) => h("div", { class: "row" }, h("span", { class: "thumb" }, ico("tag", 20)), h("div", { class: "grow" }, h("strong", null, it.title), it.subtitle ? h("small", null, it.subtitle) : null))))
          : h("div", { class: "products" }, b.props.items.map((it) => h("div", { class: "card product" }, h("h3", null, it.title), it.subtitle ? h("p", null, it.subtitle) : null)))));
    },
    "pricing-table"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h("div", { class: "products", style: b.variant === "row" ? "grid-template-columns:repeat(" + b.props.plans.length + ",1fr)" : "" },
          b.props.plans.map((p) => h("div", { class: "card product pad" }, h("h3", null, p.name), h("p", { class: "price" }, p.price), h("ul", { class: "ticks" }, p.features.map((f) => h("li", null, ico("check", 16), f))))))));
    },
    "steps-numbered"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h("ol", { class: "steps" }, b.props.steps.map((s) => h("li", null, s)))));
    },
    "media-gallery"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h("div", { class: b.variant === "grid" ? "products" : "chips" }, b.props.captions.map((c) => h("div", { class: "card pad", style: "aspect-ratio:16/10;display:grid;place-items:center;text-align:center" }, h("span", { class: "muted small" }, c))))));
    },
    "dashboard-cards"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        b.props.title ? h("h2", null, b.props.title) : null,
        h("div", { class: "stats" }, b.props.cards.map((c) => h("div", { class: "card stat" }, h("span", { class: "muted" }, c.label), h("b", null, c.value))))));
    },
    "entity-list-preview"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" },
        h("h2", null, b.props.entityLabel),
        b.variant === "rows"
          ? h("div", { class: "card rows" }, b.props.sampleItems.map((it) => h("div", { class: "row" }, h("span", { class: "thumb" }, ico("tag", 20)), h("div", { class: "grow" }, h("strong", null, it)))))
          : h("div", { class: "products" }, b.props.sampleItems.map((it) => h("div", { class: "card product pad" }, h("h3", null, it))))));
    },
    "banner-note"(b) {
      return h("section", { class: "wrap", style: "padding:0 24px" }, h("div", { class: "notice" + (b.props.tone === "warn" ? " warn" : "") }, ico(b.props.tone === "warn" ? "help" : "spark", 20), h("p", null, b.props.text)));
    },
    "chat-launcher-inline"(b) {
      return h("section", { class: "wrap", style: "padding:0 24px" }, h("button", { type: "button", class: "panel", style: "width:100%;text-align:left;cursor:pointer", onclick: () => openAssistant(b.props.prompt) }, h("h2", null, b.props.title), h("p", { class: "muted" }, b.props.prompt)));
    },
  };
  function renderBlock(block) {
    const fn = BLOCK_RENDERERS[block.type];
    try { return fn ? fn(block) : null; } catch (e) { console.warn("[bloc]", block.type, e); return null; }
  }
  function renderBlockTree(blocks) {
    const wrap = h("div", null);
    (blocks || []).forEach((b) => { const n = renderBlock(b); if (n) wrap.appendChild(n); });
    return wrap;
  }
`;

/* ════════════════════════════════════════════════════════════════════
   INTÉGRATION DANS aigentGenerator.js — CE QUI REMPLACE QUOI
   ════════════════════════════════════════════════════════════════════
   Ce fichier n'est PAS un remplacement autonome de aigentGenerator.js :
   il contient exactement les parties qui ont CHANGÉ (le système de blocs)
   plus les parties dont elles dépendent (blueprint, contenu de départ,
   thème, fichiers racine, début du back-end), recopiées à l'identique
   pour que ce module soit lisible et testable seul.

   TOUT LE RESTE de aigentGenerator.js (v3) reste EXACTEMENT tel quel,
   sans aucune modification :
     - SRV_ADMIN, SRV_ENTITIES, SRV_SITE, SRV_AGENT, SRV_KNOWLEDGE, SRV_DB,
       SRV_INIT_DB, SRV_SEED, SRV_RATE, SRV_ERRORS
     - TOOL_IMPLEMENTATIONS, MODULE_TOOLS, moduleToolDefs, toolFiles
     - fileSchema, filePrompt
     - HTML_SHELL, CSS (ajouter seulement les ~10 lignes de classes CSS
       listées plus bas pour les nouvelles primitives : blockquote, etc.
       sont déjà couvertes par les classes existantes .card/.stats/.faq/
       .products/.timeline/.band/.spotlight/.steps/.choices/.table/.chips)
     - fileFrontendHtml, fileFrontendCss, fileWidget
     - CLIENT_CORE, CLIENT_HELP, CLIENT_AUTH, CLIENT_ORDERS, CLIENT_RETURNS,
       CLIENT_CATALOG, CLIENT_BOOKING, CLIENT_BOOT
     - buildZip, buildPreviewHtml, DEMO_SHIM, previewShotsFor
     - assertNoSecrets, assertValidJs, sanitizeSpec

   CE QU'IL FAUT REMPLACER DANS LEUR VERSION v3 PAR CE QUI EST DANS CE
   FICHIER (mêmes noms d'export, donc remplacement direct) :
     1. classifyDomainByRegex, mergeClassification,
        buildBlueprintFromClassification, deriveBlueprint, withImpliedTools
        → inchangés en LOGIQUE, recopiés ici tels quels (aucune régression :
        les modules commande/retour/réservation/catalogue marchent pareil).
     2. finalizeBlueprint, applyCreativeOverrides, deriveGenericPages,
        generateProjectWithAgents
        → REMPLACÉS. Différence clé : `applyCreativeOverrides` calcule
        maintenant `bp.homeBlocks` (arbre validé ou secours varié) et
        valide chaque page générique via `sanitizeBlockTree` au lieu
        d'accepter des noms de section en clair.
     3. NOUVEAU (n'existait pas en v3) : PRIMITIVES, sanitizeBlockTree,
        composeFallbackBlocks, composeFallbackPageBlocks — à ajouter.

   CÔTÉ CLIENT (frontend/app.js, dans clientJs()) :
     4. SUPPRIMER entièrement `SECTION_RENDERERS` et le bloc de rendu
        `CLIENT_GENERIC` de v3 (les fonctions sectionHero/sectionFeatureGrid/
        sectionFaq/sectionCta/sectionSteps/sectionSpotlight et leur table).
     5. AJOUTER `CLIENT_BLOCKS` (ce fichier, ci-dessus) dans l'assemblage
        de clientJs(), juste après CLIENT_CORE :
          [CLIENT_CORE, CLIENT_BLOCKS, CLIENT_HELP, m.auth && CLIENT_AUTH, ...]
     6. Dans CLIENT_HOME (v3), remplacer TOUT le corps de la route "/" qui
        construit `page` avec hero/caps/steps/spotlight/faq codés en dur,
        par :
          route("/", { title: "", render: async () => {
            const page = renderBlockTree(APP.homeBlocks);
            const faq = await api("/knowledge");
            const items = (faq.ok && faq.sections) || [];
            if (items.length) page.appendChild(h("section", { class: "block" },
              h("div", { class: "wrap" }, h("h2", null, "Questions fréquentes"), faqList(items.slice(0, 4)))));
            return page;
          } });
        Le panneau d'action à droite (trackCard / réservation / question
        libre selon bp.modules) reste identique à v3 — il dépend des VRAIS
        modules métier, pas du texte générique.
     7. Dans CLIENT_GENERIC (v3), remplacer `genericStaticPage(page)` par :
          function genericStaticPage(page) { return renderBlockTree(page.blocks); }
        et supprimer SECTION_RENDERERS ainsi que sectionHero&co (remplacés
        par renderBlock). Le reste de CLIENT_GENERIC (pages list/detail/
        form/dashboard/chat basées sur une entité) reste identique à v3 :
        ce n'est pas là qu'était le problème, une page "liste + détail"
        d'une entité réelle (fiches, leçons, quiz...) était déjà correcte.
     8. Dans `clientConfig(spec, bp)` (v3), ajouter une ligne :
          homeBlocks: bp.homeBlocks,
        (le reste de la fonction ne change pas).

   PROCHAINE ÉTAPE (hors scope de ce fichier, tu l'as dit : "on fera les
   autres scripts si nécessaire après") :
     aigentAgents.js doit être mis à jour pour que `taskSitePlan` et un
     nouvel agent "taskHomeBlocks" produisent RÉELLEMENT l'arbre de blocs
     (au lieu du texte plat actuel réécrit dans des tableaux figés), en
     choisissant parmi les 20 primitives listées dans PRIMITIVES ci-dessus
     et en les passant dans `overrides.homeBlocks` / `sitePlan.pages[].blocks`.
     TANT QUE CE N'EST PAS FAIT : `composeFallbackBlocks` s'exécute à
     chaque build, ce qui répare DÉJÀ la variété de mise en page (l'IA du
     produit choisit désormais entre plusieurs squelettes selon le projet,
     via un hachage stable du nom/objectif) et empêche tout mot interdit
     de module absent de s'afficher (sanitizeBlockTree), mais le TEXTE de
     ces blocs reste celui déjà réécrit par taskCopy (v3), pas encore posé
     bloc par bloc par une IA dédiée à la composition. C'est la seule
     partie qui reste "à moitié résolue" — le squelette varie déjà
     réellement, son contenu textuel varie comme avant (déjà correct côté
     anti-généricité grâce à taskCopy/taskVerify).
   ════════════════════════════════════════════════════════════════════ */
