//======================================================================//
//  AiGENT GENERATOR — v5 : fusion V3 (infrastructure complète) + V4
//  (composition réelle par blocs), sans faux-site, sans doublon.
//----------------------------------------------------------------------//
//  CE QUE CE FICHIER EST :
//   - C'est LE fichier complet, celui qui remplace à la fois l'ancien
//     "aigentGenerator.js v3" et le brouillon "v4" partiel. Rien n'a été
//     perdu de v3 (tout le back-end Express, les outils, les données de
//     démo, le ZIP, l'aperçu hébergé, le garde-fou anti-secrets) ; tout
//     ce que v4 avait corrigé (la composition réelle de l'accueil et des
//     pages génériques par un arbre de blocs plutôt qu'un squelette figé)
//     est repris et achevé.
//
//  CE QUI CHANGE PAR RAPPORT À v3 :
//   - L'accueil ET les pages génériques du plan de site ne sont plus un
//     DOM figé (hero/feature-grid/faq/cta toujours dans le même ordre) :
//     ce sont des arbres JSON de blocs, choisis dans la bibliothèque de
//     ~20 primitives de `aigentBlocks.js`, compilés côté client par
//     `renderBlock()` (voir CLIENT_BLOCKS). Le panneau d'action réel de
//     l'accueil (suivi de colis / réservation / question libre — qui
//     dépend des VRAIS modules métier, pas d'un texte générique) reste
//     fonctionnel : il est injecté dans le premier bloc "hero" via
//     `renderBlockTree(blocks, { heroSide })`, quelle que soit sa variante.
//   - `PRIMITIVES` et `sanitizeBlockTree` ne sont plus définis ici : ils
//     viennent de `aigentBlocks.js`, la seule source de vérité du schéma
//     de blocs, partagée avec `aigentAgents.js` (qui les PRODUIT via
//     l'IA). Ce fichier les réexporte pour que tout code existant qui
//     ferait `import { PRIMITIVES } from "./aigentGenerator.js"` continue
//     de fonctionner sans rien changer.
//   - Un filet de sécurité supplémentaire : si `generateProject` est
//     appelé sans être passé par l'équipe multi-agents (bp.homeBlocks
//     absent), l'accueil n'est JAMAIS vide — un compositeur de secours
//     déterministe mais varié (`composeFallbackBlocks`) prend le relais.
//
//  CE QUI NE CHANGE PAS :
//   - La classification de domaine (commandes/retours/réservation/
//     catalogue) reste déterministe, avec le même filet de sécurité par
//     mots-clés, éventuellement corrigé par l'architecte IA.
//   - Tout le back-end (Express, auth, outils, base de données, ZIP,
//     garde-fou anti-secrets, vérification syntaxique du JS généré)
//     reste l'infrastructure de v3, à l'identique.
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
import { PRIMITIVES, sanitizeBlockTree } from "./aigentBlocks.js";
import {
  normalizeDesign,
  designCss,
  designAttrs,
  fontHref,
  composeHome,
  agentBehaviorRules,
} from "../public/aigent-design.js"; // ajuste le chemin

// Réexportés pour compatibilité : tout code existant qui importerait
// PRIMITIVES/sanitizeBlockTree depuis ce fichier (comme avant la
// factorisation dans aigentBlocks.js) continue de fonctionner sans rien
// changer. La définition elle-même n'existe qu'à un seul endroit
// (aigentBlocks.js) — voir ce fichier pour le schéma complet.
export { PRIMITIVES, sanitizeBlockTree };

/* ════════════════════════════════════════════════════════════════════
   1. HELPERS
   ════════════════════════════════════════════════════════════════════ */

const J = (o) => JSON.stringify(o, null, 2);

/** JSON sûr à embarquer dans un <script> : le texte vient d'un LLM ou d'un
 *  utilisateur, il ne doit jamais pouvoir fermer la balise. */
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

/** Mini-moteur de gabarits : `//#if flag` … `//#endif` (imbriquables, `!flag`
 *  pour la négation) et jetons `__CLE__`. Les gabarits sont des String.raw :
 *  aucun échappement à gérer dans le code généré. */
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
   2. BLUEPRINT — la compréhension du besoin, sans IA, donc fiable
   ────────────────────────────────────────────────────────────────────
   Inchangé par rapport à v3 : ce n'était pas la source du "faux-site".
   Commandes/retours/réservation/catalogue sont de VRAIS modules métier
   (vraie base de données, vrai suivi de commande…). Le problème était
   qu'ils apparaissaient hors sujet, et que TOUT LE RESTE du site
   (accueil, pages génériques) était toujours composé pareil. Ce dernier
   point est corrigé plus bas par le système de blocs, pas ici.
   ════════════════════════════════════════════════════════════════════ */

/** Classification par mots-clés : c'était l'unique source de vérité avant.
 *  C'est désormais un FILET DE SÉCURITÉ, jamais le chemin normal — il ne
 *  sert que quand l'IA (classification de l'architecte) est indisponible,
 *  pour que le site reste tout de même livrable. */
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

/** Fusionne la classification de l'architecte (IA) avec le filet regex :
 *  chaque clé que l'IA a tranchée gagne ; ce qu'elle n'a pas traité
 *  retombe sur le regex. Jamais de valeur non booléenne, jamais d'échec. */
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

/** Construit le blueprint complet à partir d'une classification déjà
 *  tranchée (par l'IA de préférence, par le regex en secours). */
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

  /* ── Parcours de réservation (déclaratif : rendu par l'assistant pas à pas) ── */
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

  /* ── Textes de secours (déterministes) — servent au filet de secours des
     blocs (composeFallbackBlocks) et au prompt système de l'assistant, PAS
     à l'accueil final quand l'équipe multi-agents produit un vrai arbre. ── */
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
    // Texte de connexion/inscription : déterministe et déjà adapté au
    // module réellement actif. Reste surchargeable par l'IA (taskAuthCopy)
    // pour un vocabulaire propre au projet.
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

/** Point d'entrée public : classification par regex, utilisée comme
 *  brouillon de contexte pour l'architecte IA et comme filet de secours
 *  si l'IA échoue. */
export function deriveBlueprint(spec = {}) {
  return buildBlueprintFromClassification(spec, classifyDomainByRegex(spec));
}

/** Ajoute les capacités que le site livré exige (contact, catalogue,
 *  réservation…) même si le Builder ne les a pas cochées explicitement. */
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
   3. COMPOSITEUR DE SECOURS — déterministe, mais VARIÉ (v4)
   ────────────────────────────────────────────────────────────────────
   Chemin normal : l'équipe multi-agents (aigentAgents.js) produit un
   arbre de blocs pour l'accueil et chaque page statique, validé par
   sanitizeBlockTree (aigentBlocks.js). Si cette étape échoue ou n'est
   pas disponible (appel direct de generateProject sans agents), ce
   compositeur prend le relais. Il ne produit JAMAIS le même squelette :
   il choisit, à partir d'un hachage stable du projet (nom + objectif),
   parmi plusieurs mises en page différentes pour chaque rôle de bloc.
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

/** Compose l'accueil, à partir du blueprint métier déjà déterminé (bp) et
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
 *  déclarée, jamais le même agencement pour "hero" seul. */
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
   4. FUSION DES DÉCISIONS DE L'ÉQUIPE MULTI-AGENTS
   ────────────────────────────────────────────────────────────────────
   `overrides.homeBlocks` et `overrides.sitePlan.pages[].blocks` sont les
   arbres produits par l'équipe IA (aigentAgents.js). Chaque arbre est
   revalidé ICI, indépendamment de la confiance qu'on accorde à l'agent
   qui l'a produit : sanitizeBlockTree est la seule porte d'entrée vers
   le rendu, jamais un raccourci "on lui fait confiance".
   ════════════════════════════════════════════════════════════════════ */

/** Les pages génériques (au-delà de commande/retour/réservation/catalogue)
 *  s'ajoutent à la navigation existante SANS jamais remplacer ce qui
 *  fonctionne déjà. Une page dont le chemin entre en collision avec la
 *  navigation existante est ignorée. Chaque page reçoit un arbre de blocs
 *  validé (celui de l'IA, ou un secours varié si absent/invalide). */
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
  // Une entité est protégée dès qu'UNE page qui la sert exige une auth.
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

/** Point d'entrée unique après l'équipe multi-agents : si l'architecte a
 *  tranché un vrai classement de domaine (commerceModel), le blueprint est
 *  RECONSTRUIT à partir de cette décision — le regex n'a alors plus aucun
 *  mot à dire sur le domaine, il ne fournit que les clés que l'IA n'a pas
 *  traitées. Sans classification IA (échec, timeout), on retombe sur le
 *  brouillon regex existant : le site reste livrable dans tous les cas. */
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

/** Fusionne le résultat de l'équipe multi-agents dans le blueprint
 *  déterministe. Toute clé absente ou invalide reste au comportement
 *  d'origine — c'est la garantie de ne jamais rien casser. L'accueil
 *  (`homeBlocks`) est TOUJOURS défini en sortie : l'arbre validé de l'IA
 *  si exploitable, sinon un secours varié — jamais un squelette figé
 *  unique, jamais une page vide. */
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
      // Une page protégée exige des comptes clients : on l'active plutôt
      // que de livrer une page "auth: true" jamais réellement protégée.
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
    // Message d'accueil de l'assistant dans le vocabulaire réel du projet,
    // uniquement quand rien ne l'a encore personnalisé.
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
  // secours varié — jamais le squelette figé unique, jamais une page vide.
  const validatedHome = sanitizeBlockTree(overrides.homeBlocks, next.modules);
  next.homeBlocks =
    validatedHome ||
    composeFallbackBlocks(spec, next, overrides.copyForFallback || null);

  return next;
}

/** Point d'entrée build : fait travailler l'équipe multi-agents puis
 *  génère le projet. En cas d'échec de l'équipe (réseau, providers tous
 *  indisponibles...), repli total et silencieux sur le blueprint standard
 *  (généreProject() applique lui-même son propre filet de sécurité pour
 *  homeBlocks, donc l'accueil n'est jamais vide même dans ce cas). */
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
   5. CONTENU DE DÉPART — connaissances, données de démo (inchangé v3)
   ════════════════════════════════════════════════════════════════════ */

/** Règles ajoutées au prompt système du projet livré (modifiables par le client). */
function moduleRules(bp) {
  const r = [];
  // Si l'équipe a reformulé les capacités pour ce projet précis, le
  // modèle du site livré les voit décrites dans SON vocabulaire, pas
  // dans le libellé générique du catalogue AiGENT.
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

/* ── Connaissances de départ : vraies pour CE site, jamais inventées ── */

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

/** Fichiers de connaissances. Tout passage marqué [À compléter] alimente
 *  l'assistant mais n'apparaît PAS dans la FAQ publique du site. */
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

/* ── Données de démonstration (aperçu Builder + `npm run db:seed`) ── */

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
   6. CAPACITÉS, SERVICES, THÈME (inchangé v3)
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

/** Le site livré a toujours besoin d'une base (contact, comptes, demandes). */
function needsDatabase() {
  return true;
}

/** Ce que le site livré est : un vrai site, avec un assistant en complément. */
export function computeInterfaceMode() {
  return "site";
}

/** Le produit livré est CLAIR (c'est le Builder qui est sombre). Seule la
 *  couleur d'accent change selon le style choisi. */
const LIGHT_ACCENTS = {
  monochrome: "#16171A",
  warm: "#D9752B",
  clinical: "#2E6FE0",
  calm: "#2E9E74",
};

/** La roue de couleurs (spec.interface.theme) prime sur le preset ;
 *  accentTo permet un dégradé sur les boutons primaires ; headerBg est
 *  un jeton consommé par --nav-bg dans le CSS. */
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
  // Réglages avancés (facultatifs) : bornés ici, jamais transmis tels
  // quels au CSS, pour ne jamais produire une valeur invalide.
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

/** Intégrations du catalogue AiGENT + celles propres aux modules du site. */
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

/** Variables d'environnement nécessaires, dédoublonnées. */
export function envKeysFor(spec) {
  const keys = new Set(["PORT"]);
  for (const i of integrationsFor(spec))
    (i.env || []).forEach((e) => keys.add(e));
  return [...keys];
}

/* ════════════════════════════════════════════════════════════════════
   7. FICHIERS RACINE (inchangé v3)
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
   8. BACK-END — gabarits (inchangé v3 : ce n'est pas la source du bug)
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

// ── Santé : le site s'en sert pour signaler ce qu'il reste à brancher ──
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

// ── Conversation ───────────────────────────────────────────────────
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

// ── API du site ────────────────────────────────────────────────────
//#if auth
app.use("/api/admin", adminRoutes);
app.use("/api", accountRoutes);
//#endif
app.use("/api", siteRoutes);

// ── Outils exposés en HTTP (vos propres intégrations) ──────────────
app.use("/api/tools", rateLimit({ windowMs: 60000, max: 60 }), toolRoutes);
//#if entities
// ── Rubriques génériques du plan de site ────────────────────────────
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

// Sans SESSION_SECRET, un secret éphémère protège quand même le site (les
// sessions sont simplement perdues au redémarrage).
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

/** Renseigne req.customer si un jeton valide est présent, sans jamais bloquer. */
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
    ref: o.ref,
    status: o.status,
    placedAt: o.placed_at,
    total: Number(o.total),
    currency: o.currency || "EUR",
    carrier: o.carrier,
    trackingNumber: o.tracking_number,
    trackingUrl: o.tracking_url,
    eta: o.eta,
    shippingAddress: o.shipping_address,
    itemsCount: items.reduce((s, i) => s + i.qty, 0),
    items,
    events,
  };
}

/** Une commande appartient au client par son id OU par son email : les
 *  commandes importées avant l'inscription apparaissent donc toutes seules. */
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

/** scope : { customer } (client connecté) ou { email } (suivi public). */
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

// ── Comptes ────────────────────────────────────────────────────────
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

// ── Commandes ──────────────────────────────────────────────────────
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

// Suivi public : numéro de commande ET email doivent correspondre.
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

// ── Retours ────────────────────────────────────────────────────────
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

const SRV_ADMIN = String.raw`import express from "express";
import crypto from "node:crypto";
import { withTx, isConfigured } from "../db.js";

/** API d'administration : c'est par ici que votre boutique ou votre back-office
 *  pousse les commandes. Protégée par ADMIN_TOKEN (en-tête X-Admin-Token). */
export const adminRoutes = express.Router();

const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();

adminRoutes.use((req, res, next) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return res.status(503).json({ ok: false, error: "service_not_configured", service: "orders_source", message: "Renseignez ADMIN_TOKEN dans .env pour activer l'API d'administration." });
  }
  if (!isConfigured()) {
    return res.status(503).json({ ok: false, error: "service_not_configured", service: "database", message: "La base de données n'est pas connectée." });
  }
  if (!crypto.timingSafeEqual(digest(req.headers["x-admin-token"] || ""), digest(expected))) {
    return res.status(401).json({ ok: false, error: "unauthorized", message: "Jeton d'administration invalide." });
  }
  next();
});

const ORDER_STATUSES = ["processing", "shipped", "out_for_delivery", "delivered", "cancelled"];
const badReq = (res, message) => res.status(400).json({ ok: false, error: "invalid", message });
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

async function insertEvents(q, orderId, events) {
  for (const e of events) {
    await q(
      "INSERT INTO order_events (order_id, status, label, location, occurred_at) VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz, NOW()))",
      [orderId, String(e.status || "processing"), e.label || null, e.location || null, e.occurredAt || null],
    );
  }
}

// Crée ou met à jour une commande (les tableaux fournis remplacent les existants).
adminRoutes.post("/orders", async (req, res, next) => {
  try {
    const o = req.body || {};
    if (!o.ref || !o.email) return badReq(res, "ref et email sont requis.");
    if (o.status && !ORDER_STATUSES.includes(o.status)) return badReq(res, "Statut inconnu : " + ORDER_STATUSES.join(", "));
    const id = await withTx(async (q) => {
      const rows = await q(
        "INSERT INTO orders (ref, email, status, placed_at, total, currency, carrier, tracking_number, tracking_url, eta, shipping_address, customer_id) " +
          "VALUES ($1,$2,$3,COALESCE($4::timestamptz, NOW()),$5,$6,$7,$8,$9,$10::date,$11,(SELECT id FROM customers WHERE lower(email) = lower($2))) " +
          "ON CONFLICT (ref) DO UPDATE SET email = EXCLUDED.email, status = EXCLUDED.status, total = EXCLUDED.total, currency = EXCLUDED.currency, " +
          "carrier = EXCLUDED.carrier, tracking_number = EXCLUDED.tracking_number, tracking_url = EXCLUDED.tracking_url, eta = EXCLUDED.eta, " +
          "shipping_address = EXCLUDED.shipping_address, customer_id = COALESCE(orders.customer_id, EXCLUDED.customer_id) RETURNING id",
        [String(o.ref), String(o.email).toLowerCase(), o.status || "processing", o.placedAt || null, num(o.total), o.currency || "EUR",
         o.carrier || null, o.trackingNumber || null, o.trackingUrl || null, o.eta || null, o.shippingAddress || null],
      );
      const orderId = rows[0].id;
      if (Array.isArray(o.items)) {
        await q("DELETE FROM order_items WHERE order_id = $1", [orderId]);
        for (const it of o.items) {
          await q("INSERT INTO order_items (order_id, sku, name, qty, unit_price) VALUES ($1,$2,$3,$4,$5)",
            [orderId, String(it.sku || it.name || "").slice(0, 60), String(it.name || it.sku || "Article").slice(0, 160), Math.max(1, Math.floor(num(it.qty, 1))), num(it.unitPrice)]);
        }
      }
      if (Array.isArray(o.events)) {
        await q("DELETE FROM order_events WHERE order_id = $1", [orderId]);
        await insertEvents(q, orderId, o.events);
      }
      return orderId;
    });
    res.json({ ok: true, id, ref: o.ref });
  } catch (e) {
    next(e);
  }
});

// Ajoute un événement de suivi et met le statut de la commande à jour.
adminRoutes.post("/orders/:ref/events", async (req, res, next) => {
  try {
    const e = req.body || {};
    if (!ORDER_STATUSES.includes(e.status)) return badReq(res, "Statut inconnu : " + ORDER_STATUSES.join(", "));
    const found = await withTx(async (q) => {
      const rows = await q("UPDATE orders SET status = $1 WHERE upper(ref) = upper($2) RETURNING id", [e.status, req.params.ref]);
      if (!rows.length) return false;
      await insertEvents(q, rows[0].id, [e]);
      return true;
    });
    if (!found) return res.status(404).json({ ok: false, error: "not_found", message: "Commande introuvable." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
//#if returns

adminRoutes.patch("/returns/:ref", async (req, res, next) => {
  try {
    const status = String((req.body || {}).status || "");
    if (!["requested", "approved", "received", "refunded", "rejected"].includes(status)) return badReq(res, "Statut de retour inconnu.");
    const rows = await withTx((q) => q("UPDATE returns SET status = $1 WHERE upper(ref) = upper($2) RETURNING ref", [status, req.params.ref]));
    if (!rows.length) return res.status(404).json({ ok: false, error: "not_found", message: "Retour introuvable." });
    res.json({ ok: true, ref: rows[0].ref, status });
  } catch (err) {
    next(err);
  }
});
//#endif
`;

/** Routes génériques pour les entités décidées par l'architecte de site
 *  (ex : "quiz", "leçons") — un CRUD minimal, générique, jamais spécifique
 *  à un secteur, pour que le générateur puisse rendre n'importe quel
 *  domaine sans coder une table dédiée à chaque fois. */
const SRV_ENTITIES = String.raw`import express from "express";
import { query, isConfigured } from "../db.js";
//#if auth
import { requireAuth } from "../auth.js";
//#endif

// Listes fermées : définies par la conception, jamais par l'utilisateur final.
const ENTITY_IDS = __ENTITY_IDS__;
const PROTECTED_IDS = __ENTITY_AUTH_IDS__;

export const entityRoutes = express.Router();

function assertEntity(req, res, next) {
  if (!ENTITY_IDS.includes(req.params.entityId)) {
    return res.status(404).json({ ok: false, error: "not_found", message: "Cette rubrique n'existe pas." });
  }
  next();
}

// Une rubrique protégée exige une session ET scope systématiquement les
// données au client connecté : plus de filtre optionnel côté client.
function requireAuthIfProtected(req, res, next) {
  if (!PROTECTED_IDS.includes(req.params.entityId)) return next();
//#if auth
  return requireAuth(req, res, next);
//#endif
//#if !auth
  return res.status(503).json({ ok: false, error: "service_not_configured", service: "database", message: "Cette rubrique nécessite des comptes clients, non configurés sur ce projet." });
//#endif
}

entityRoutes.get("/:entityId", assertEntity, requireAuthIfProtected, async (req, res, next) => {
  if (!isConfigured()) return res.status(503).json({ ok: false, error: "service_not_configured", service: "database" });
  try {
    const scoped = PROTECTED_IDS.includes(req.params.entityId);
    const rows = scoped
      ? await query("SELECT id, data, created_at FROM generic_items WHERE entity_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT 100", [req.params.entityId, req.customer.id])
      : await query("SELECT id, data, created_at FROM generic_items WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 100", [req.params.entityId]);
    res.json({ ok: true, items: rows.map((r) => ({ id: r.id, ...r.data, createdAt: r.created_at })) });
  } catch (e) {
    next(e);
  }
});

entityRoutes.get("/:entityId/:id", assertEntity, requireAuthIfProtected, async (req, res, next) => {
  if (!isConfigured()) return res.status(503).json({ ok: false, error: "service_not_configured", service: "database" });
  try {
    const scoped = PROTECTED_IDS.includes(req.params.entityId);
    const rows = scoped
      ? await query("SELECT id, data, created_at FROM generic_items WHERE entity_id = $1 AND id = $2 AND customer_id = $3", [req.params.entityId, Number(req.params.id) || 0, req.customer.id])
      : await query("SELECT id, data, created_at FROM generic_items WHERE entity_id = $1 AND id = $2", [req.params.entityId, Number(req.params.id) || 0]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "not_found", message: "Introuvable." });
    res.json({ ok: true, item: { id: rows[0].id, ...rows[0].data, createdAt: rows[0].created_at } });
  } catch (e) {
    next(e);
  }
});

entityRoutes.post("/:entityId", assertEntity, requireAuthIfProtected, async (req, res, next) => {
  if (!isConfigured()) return res.status(503).json({ ok: false, error: "service_not_configured", service: "database" });
  try {
    const data = req.body && typeof req.body === "object" ? req.body : {};
    const row = await query(
      "INSERT INTO generic_items (entity_id, customer_id, data) VALUES ($1,$2,$3::jsonb) RETURNING id, created_at",
      [req.params.entityId, req.customer?.id || null, JSON.stringify(data)],
    );
    res.json({ ok: true, id: row[0].id, createdAt: row[0].created_at });
  } catch (e) {
    next(e);
  }
});
`;
const SRV_SITE = String.raw`import express from "express";
import { allKnowledge } from "../knowledge.js";
import { query, isConfigured } from "../db.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { lead_capture } from "../tools/lead-capture.js";
//#if bookingRequest
import { booking_request } from "../tools/booking-request.js";
//#endif
//#if bookingConfirm
import { availability_check } from "../tools/availability-check.js";
import { booking_confirm } from "../tools/booking-confirm.js";
//#endif
//#if webhook
import { notify_webhook } from "../tools/notify-webhook.js";
//#endif
//#if email
import { email_send } from "../tools/email-send.js";
//#endif

export const siteRoutes = express.Router();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const status = (out) => (out.error === "service_not_configured" ? 503 : out.error === "upstream_error" ? 502 : 500);

// FAQ publique : les passages « [À compléter] » restent cachés.
siteRoutes.get("/knowledge", (req, res) => {
  const sections = allKnowledge()
    .map((d) => ({
      title: d.title,
      answer: d.content.replace(/^#{1,3} .*\n?/, "").replace(/<!--[\s\S]*?-->/g, "").trim(),
    }))
    .filter((s) => s.answer.length > 4 && !/\[à compléter\]/i.test(s.answer));
  res.json({ ok: true, sections });
});
//#if catalog

siteRoutes.get("/catalog", async (req, res, next) => {
  if (!isConfigured()) {
    return res.status(503).json({ ok: false, error: "service_not_configured", service: "database", message: "Le catalogue n'est pas encore disponible." });
  }
  try {
    const search = String(req.query.search || "").trim().slice(0, 80) || null;
    const category = String(req.query.category || "").trim().slice(0, 60) || null;
    const items = await query(
      "SELECT id, name, category, description, price FROM catalog_items " +
        "WHERE ($1::text IS NULL OR name ILIKE '%'||$1||'%' OR description ILIKE '%'||$1||'%') AND ($2::text IS NULL OR category = $2) " +
        "ORDER BY category, name LIMIT 100",
      [search, category],
    );
    const cats = await query("SELECT DISTINCT category FROM catalog_items WHERE category IS NOT NULL ORDER BY category");
    res.json({
      ok: true,
      items: items.map((i) => ({ ...i, price: i.price == null ? null : Number(i.price) })),
      categories: cats.map((c) => c.category),
    });
  } catch (e) {
    next(e);
  }
});
//#endif

siteRoutes.post("/contact", rateLimit({ windowMs: 60000, max: 8 }), async (req, res, next) => {
  try {
    const { name, email, phone, message } = req.body || {};
    if (!name || !EMAIL_RE.test(String(email || "")) || !message) {
      return res.status(400).json({ ok: false, error: "invalid", message: "Nom, email valide et message sont requis." });
    }
    const out = await lead_capture({
      name: String(name).slice(0, 120),
      email: String(email).slice(0, 160),
      phone: phone ? String(phone).slice(0, 40) : null,
      request: String(message).slice(0, 4000),
    });
    if (out.ok === false) return res.status(status(out)).json(out);
//#if webhook
    notify_webhook({ event: "contact", payload: { name, email, phone, message } }).catch(() => {});
//#endif
    res.json({ ok: true, message: "Merci, votre message a bien été transmis. Nous revenons vers vous rapidement." });
  } catch (e) {
    next(e);
  }
});
//#if booking

siteRoutes.post("/booking", rateLimit({ windowMs: 60000, max: 8 }), async (req, res, next) => {
  try {
    const b = req.body || {};
    const people = b.people == null || b.people === "" ? null : Math.max(1, Math.min(50, Math.floor(Number(b.people)) || 1));
    if (!b.date || !b.name || !b.contact) {
      return res.status(400).json({ ok: false, error: "invalid", message: "Date, nom et moyen de contact sont requis." });
    }
//#if bookingConfirm
    const avail = await availability_check({ date: b.date, time: b.time, people });
    if (avail.ok === false) return res.status(status(avail)).json(avail);
    if (!avail.slotId) {
      return res.status(409).json({ ok: false, error: "unavailable", message: "Ce créneau n'est pas disponible. Essayez une autre heure." });
    }
    const out = await booking_confirm({ slotId: avail.slotId, name: b.name, contact: b.contact });
    if (out.ok === false) return res.status(status(out)).json(out);
    out.message = out.message || "Votre réservation est confirmée.";
//#endif
//#if !bookingConfirm
    const out = await booking_request({
      name: String(b.name).slice(0, 120), contact: String(b.contact).slice(0, 160), date: b.date, time: b.time || null,
      people, note: b.note ? String(b.note).slice(0, 500) : null,
    });
    if (out.ok === false) return res.status(status(out)).json(out);
//#endif
//#if webhook
    notify_webhook({ event: "booking", payload: b }).catch(() => {});
//#endif
//#if email
    if (EMAIL_RE.test(String(b.contact))) {
      email_send({
        to: b.contact,
        subject: "Votre demande du " + b.date,
        body: "Bonjour " + b.name + ",\n\nNous avons bien reçu votre demande pour le " + b.date + (b.time ? " à " + b.time : "") + ".\n" + (out.message || "") + "\n",
      }).catch(() => {});
    }
//#endif
    res.json({ ok: true, status: out.status || "confirmed", message: out.message });
  } catch (e) {
    next(e);
  }
});
//#endif
`;

const SRV_AGENT = String.raw`import { SYSTEM_PROMPT, MODULE_RULES, AGENT_LANGUAGE } from "./prompt.js";
import { searchKnowledge } from "./knowledge.js";
import { TOOLS, runTool } from "./tools/index.js";
//#if orders
import { listOrders } from "./services/orders.js";
import { isConfigured } from "./db.js";
//#endif

const BASE_URL = process.env.AI_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.AI_MODEL || "gpt-4o-mini";

/**
 * Appel du modèle. Endpoint compatible OpenAI : fonctionne avec OpenAI,
 * Mistral, Groq, OpenRouter, Together, un modèle local (Ollama/LM Studio)…
 */
async function callModel(messages, { tools = [], maxTokens = 800 } = {}) {
  const res = await fetch(BASE_URL + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.AI_API_KEY },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.4,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw Object.assign(new Error("Le fournisseur IA a refusé la requête."), { status: 502, detail: detail.slice(0, 400) });
  }
  return res.json();
}
//#if orders

/** Ce que l'assistant sait du client connecté : il répond sur SES commandes. */
async function customerBlock(customer) {
  if (!customer) {
    return "CLIENT NON CONNECTÉ : pour parler d'une commande, demande le numéro de commande et l'email utilisé, ou invite le client à se connecter.";
  }
  let lines = "";
  if (isConfigured()) {
    try {
      const orders = await listOrders(customer);
      lines = orders
        .slice(0, 5)
        .map((o) => "- " + o.ref + " : " + o.status + ", " + o.total + " " + o.currency + ", passée le " + new Date(o.placedAt).toLocaleDateString("fr-FR"))
        .join("\n");
    } catch (_) {}
  }
  return "CLIENT CONNECTÉ : " + customer.name + " (" + customer.email + ")." + (lines ? "\nSes commandes récentes :\n" + lines : "");
}
//#endif

export async function handleChat({ message, history = [], sessionId, customer = null }) {
  // 1. Contexte : on ne laisse jamais le modèle inventer vos informations.
  const context = await searchKnowledge(message, 5);
  const contextBlock = context.length
    ? context.map((c) => "### " + c.title + "\n" + c.content).join("\n\n")
    : "(aucune connaissance trouvée pour cette question)";
//#if orders
  const account = await customerBlock(customer);
//#endif
//#if !orders
  const account = "";
//#endif

  const messages = [
    {
      role: "system",
      content:
        SYSTEM_PROMPT +
        (MODULE_RULES ? "\n\n" + MODULE_RULES : "") +
        (account ? "\n\n" + account : "") +
        "\n\nCONNAISSANCES PERTINENTES :\n" + contextBlock +
        "\n\nSi la réponse ne figure ni ci-dessus ni dans les données d'un outil, dis-le et propose un transfert humain." +
        (AGENT_LANGUAGE === "fr" ? "\nRéponds en français." : ""),
    },
    ...history.slice(-10).map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.content).slice(0, 2000),
    })),
    { role: "user", content: message },
  ];

  // 2. Premier tour, avec outils si disponibles.
  let data = await callModel(messages, { tools: TOOLS });
  let choice = data.choices?.[0];
  const actions = [];

  // 3. Boucle d'outils (2 tours maximum : suffisant et prévisible).
  for (let round = 0; round < 2; round++) {
    const calls = choice?.message?.tool_calls;
    if (!calls?.length) break;
    messages.push(choice.message);
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch (_) {}
      const result = await runTool(call.function.name, args, { sessionId, customer });
      actions.push({ tool: call.function.name, args, result: { ok: result && result.ok !== false } });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
    data = await callModel(messages, { tools: TOOLS });
    choice = data.choices?.[0];
  }

  return {
    reply: choice?.message?.content?.trim() || "Je n'ai pas de réponse à vous donner sur ce point.",
    actions,
    sources: context.map((c) => c.title),
  };
}
`;

const SRV_KNOWLEDGE = String.raw`import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, "..", "..", "knowledge");

let DOCS = [];

/** Charge tous les .md de knowledge/ et les découpe en sections. */
export async function loadKnowledge() {
  DOCS = [];
  let files = [];
  try {
    files = await fs.readdir(KNOWLEDGE_DIR);
  } catch (_) {
    console.warn("Dossier knowledge/ introuvable — l'agent répondra sans base documentaire.");
    return DOCS;
  }
  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const raw = await fs.readFile(path.join(KNOWLEDGE_DIR, file), "utf-8");
    for (const section of raw.split(/\n(?=#{1,3} )/g)) {
      const content = section.trim();
      if (content.length < 10) continue;
      const title = (content.match(/^#{1,3} (.+)$/m) || [])[1] || file.replace(".md", "");
      DOCS.push({ file, title, content });
    }
  }
  console.log("Connaissances chargées : " + DOCS.length + " section(s).");
  return DOCS;
}

function normalize(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Recherche lexicale pondérée. Remplaçable par des embeddings si besoin. */
export async function searchKnowledge(query, limit = 5) {
  if (!DOCS.length) await loadKnowledge();
  const terms = normalize(query).split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (!terms.length) return DOCS.slice(0, limit);
  return DOCS.map((doc) => {
    const hay = normalize(doc.title + " " + doc.content);
    let score = 0;
    for (const term of terms) {
      score += hay.split(term).length - 1;
      if (normalize(doc.title).includes(term)) score += 3;
    }
    return { ...doc, score };
  })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function allKnowledge() {
  return DOCS;
}
`;

const SRV_DB = String.raw`import pg from "pg";

let pool = null;

export function isConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export async function initPool() {
  if (!isConfigured()) {
    console.warn("⚠️  DATABASE_URL manquante — les fonctions de stockage renverront service_not_configured.");
    return null;
  }
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await pool.query("SELECT 1");
  console.log("Base de données connectée.");
  return pool;
}

async function ensurePool() {
  if (!pool) await initPool();
  if (!pool) throw Object.assign(new Error("Base de données non configurée"), { status: 503 });
  return pool;
}

export async function query(sql, params = []) {
  const res = await (await ensurePool()).query(sql, params);
  return res.rows;
}

/** Exécute plusieurs requêtes dans une transaction. fn reçoit q(sql, params). */
export async function withTx(fn) {
  const client = await (await ensurePool()).connect();
  try {
    await client.query("BEGIN");
    const out = await fn((sql, params = []) => client.query(sql, params).then((r) => r.rows));
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
`;

const SRV_INIT_DB = String.raw`import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { query, isConfigured } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!isConfigured()) {
  console.error("DATABASE_URL manquante dans .env");
  process.exit(1);
}

const schema = await fs.readFile(path.join(__dirname, "..", "..", "database", "schema.sql"), "utf-8");
for (const statement of schema.split(";").map((s) => s.trim()).filter(Boolean)) {
  await query(statement);
}
console.log("Schéma appliqué.");
process.exit(0);
`;

const SRV_SEED = String.raw`import "dotenv/config";
import { withTx, isConfigured } from "../src/db.js";
//#if auth
import { hashPassword } from "../src/auth.js";
//#endif

const DEMO = __DEMO__;

if (!isConfigured()) {
  console.error("DATABASE_URL manquante dans .env");
  process.exit(1);
}

const at = (days) => new Date(Date.now() - days * 86400000).toISOString();

await withTx(async (q) => {
//#if orders
  const email = "demo@exemple.fr";
  const customer = await q(
    "INSERT INTO customers (name, email, password_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    ["Camille Demo", email, await hashPassword("demo1234")],
  );
  for (const o of DEMO.orders) {
    const eta = o.etaInDays == null ? null : new Date(Date.now() + o.etaInDays * 86400000).toISOString().slice(0, 10);
    const rows = await q(
      "INSERT INTO orders (ref, customer_id, email, status, placed_at, total, carrier, tracking_number, eta, shipping_address) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10) ON CONFLICT (ref) DO NOTHING RETURNING id",
      [o.ref, customer[0].id, email, o.status, at(o.placedDaysAgo), o.total, o.carrier || null, o.trackingNumber || null, eta, o.shippingAddress],
    );
    if (!rows.length) continue;
    for (const it of o.items) {
      await q("INSERT INTO order_items (order_id, sku, name, qty, unit_price) VALUES ($1,$2,$3,$4,$5)", [rows[0].id, it.sku, it.name, it.qty, it.unitPrice]);
    }
    for (const e of o.events) {
      await q("INSERT INTO order_events (order_id, status, label, location, occurred_at) VALUES ($1,$2,$3,$4,$5)", [rows[0].id, e.status, e.label, e.location, at(e.daysAgo)]);
    }
  }
//#endif
//#if catalog
  for (const it of DEMO.catalog) {
    await q(
      "INSERT INTO catalog_items (name, category, description, price) SELECT $1,$2,$3,$4 WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE name = $1)",
      [it.name, it.category, it.description, it.price],
    );
  }
//#endif
});

console.log("Données de démonstration insérées.");
//#if orders
console.log("Compte de démonstration : demo@exemple.fr / demo1234");
//#endif
process.exit(0);
`;

const SRV_RATE = String.raw`const buckets = new Map();

export function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  return (req, res, next) => {
    const key = req.ip + ":" + req.baseUrl + req.path;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > bucket.reset) {
      bucket.count = 0;
      bucket.reset = now + windowMs;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > max) {
      return res.status(429).json({ ok: false, error: "rate_limited", message: "Trop de requêtes, réessayez dans un instant.", retryAfter: Math.ceil((bucket.reset - now) / 1000) });
    }
    next();
  };
}
`;

const SRV_ERRORS = String.raw`export function notFound(req, res) {
  res.status(404).json({ ok: false, error: "not_found", path: req.path });
}

export function errorHandler(err, req, res, next) {
  console.error("[error]", err.message, err.detail || "");
  // 42P01 : la table n'existe pas — le schéma n'a pas été appliqué.
  if (err.code === "42P01") {
    return res.status(503).json({ ok: false, error: "service_not_configured", service: "database", message: "La base de données n'est pas initialisée : lancez « npm run db:init »." });
  }
  const status = err.status || 500;
  const safe = status < 500 || status === 502 || process.env.NODE_ENV !== "production";
  res.status(status).json({
    ok: false,
    error: status === 502 ? "ai_provider_error" : "server_error",
    message: safe ? err.message : "Une erreur est survenue.",
  });
}
`;

/* ─── Outils exposés à l'assistant (function-calling) et en HTTP ─── */

const TOOL_IMPLEMENTATIONS = {
  "knowledge.search": {
    fn: "knowledge_search",
    params: { query: { type: "string", description: "La question posée" } },
    body: String.raw`import { searchKnowledge } from "../knowledge.js";
export async function knowledge_search({ query }) {
  const results = await searchKnowledge(query, 4);
  return { found: results.length, sections: results.map((r) => ({ title: r.title, content: r.content.slice(0, 1200) })) };
}`,
  },
  "faq.answer": {
    fn: "faq_answer",
    params: {
      question: { type: "string", description: "La question du visiteur" },
    },
    body: String.raw`import { searchKnowledge } from "../knowledge.js";
export async function faq_answer({ question }) {
  const results = await searchKnowledge(question, 2);
  if (!results.length) return { answered: false, reason: "Aucune entrée de FAQ ne correspond." };
  return { answered: true, best: results[0].content.slice(0, 1000) };
}`,
  },
  "lead.capture": {
    fn: "lead_capture",
    params: {
      name: { type: "string", description: "Nom du contact" },
      email: { type: "string", description: "Email du contact" },
      phone: { type: "string", description: "Téléphone (facultatif)" },
      request: { type: "string", description: "Demande formulée" },
    },
    body: String.raw`import { query, isConfigured } from "../db.js";
export async function lead_capture({ name, email, phone, request }) {
  if (!isConfigured()) return { ok: false, error: "service_not_configured", service: "database" };
  const row = await query(
    "INSERT INTO leads (name, email, phone, request) VALUES ($1,$2,$3,$4) RETURNING id, created_at",
    [name || null, email || null, phone || null, request || null],
  );
  return { ok: true, leadId: row[0]?.id };
}`,
  },
  "form.submit": {
    fn: "form_submit",
    params: { fields: { type: "object", description: "Champs collectés" } },
    body: String.raw`import { query, isConfigured } from "../db.js";
export async function form_submit({ fields }) {
  if (!isConfigured()) return { ok: false, error: "service_not_configured", service: "database" };
  const row = await query("INSERT INTO submissions (payload) VALUES ($1) RETURNING id", [JSON.stringify(fields || {})]);
  return { ok: true, submissionId: row[0]?.id };
}`,
  },
  "booking.request": {
    fn: "booking_request",
    params: {
      name: { type: "string", description: "Nom" },
      contact: { type: "string", description: "Email ou téléphone" },
      date: { type: "string", description: "Date souhaitée (AAAA-MM-JJ)" },
      time: { type: "string", description: "Heure souhaitée (HH:MM)" },
      people: { type: "number", description: "Nombre de personnes" },
      note: { type: "string", description: "Précision éventuelle" },
    },
    body: String.raw`import { query, isConfigured } from "../db.js";
export async function booking_request({ name, contact, date, time, people, note }) {
  if (!isConfigured()) return { ok: false, error: "service_not_configured", service: "database" };
  const row = await query(
    "INSERT INTO booking_requests (name, contact, date, time, people, note, status) VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id",
    [name || null, contact || null, date || null, time || null, people || null, note || null],
  );
  // Statut « pending » : la demande est enregistrée, PAS confirmée.
  return { ok: true, status: "pending", bookingId: row[0]?.id,
    message: "Demande enregistrée. Elle doit être confirmée par un humain." };
}`,
  },
  "availability.check": {
    fn: "availability_check",
    params: {
      date: { type: "string", description: "Date (AAAA-MM-JJ)" },
      time: { type: "string", description: "Heure (HH:MM)" },
      people: { type: "number", description: "Nombre de personnes" },
    },
    body: String.raw`export async function availability_check({ date, time, people }) {
  if (!process.env.BOOKING_API_URL || !process.env.BOOKING_API_KEY) {
    return { ok: false, error: "service_not_configured", service: "availability_source",
      message: "Aucune source de disponibilités connectée : impossible de garantir un créneau." };
  }
  const url = process.env.BOOKING_API_URL + "/availability?date=" + encodeURIComponent(date) +
    "&time=" + encodeURIComponent(time || "") + "&people=" + (people || 1);
  const res = await fetch(url, { headers: { Authorization: "Bearer " + process.env.BOOKING_API_KEY } });
  if (!res.ok) return { ok: false, error: "upstream_error", status: res.status };
  return { ok: true, ...(await res.json()) };
}`,
  },
  "booking.confirm": {
    fn: "booking_confirm",
    params: {
      slotId: { type: "string", description: "Identifiant du créneau vérifié" },
      name: { type: "string", description: "Nom" },
      contact: { type: "string", description: "Email ou téléphone" },
    },
    body: String.raw`export async function booking_confirm({ slotId, name, contact }) {
  if (!process.env.BOOKING_API_URL || !process.env.BOOKING_API_KEY) {
    return { ok: false, error: "service_not_configured", service: "availability_source" };
  }
  if (!slotId) return { ok: false, error: "slot_not_verified",
    message: "Vérifiez d'abord la disponibilité avec availability_check." };
  const res = await fetch(process.env.BOOKING_API_URL + "/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.BOOKING_API_KEY },
    body: JSON.stringify({ slotId, name, contact }),
  });
  if (!res.ok) return { ok: false, error: "upstream_error", status: res.status };
  return { ok: true, ...(await res.json()) };
}`,
  },
  "email.send": {
    fn: "email_send",
    params: {
      to: { type: "string", description: "Destinataire" },
      subject: { type: "string", description: "Objet" },
      body: { type: "string", description: "Contenu" },
    },
    body: String.raw`import nodemailer from "nodemailer";
export async function email_send({ to, subject, body }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return { ok: false, error: "service_not_configured", service: "email" };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to, subject, text: body,
  });
  return { ok: true, messageId: info.messageId };
}`,
  },
  "notify.webhook": {
    fn: "notify_webhook",
    params: {
      event: { type: "string", description: "Nom de l'événement" },
      payload: { type: "object", description: "Données" },
    },
    body: String.raw`export async function notify_webhook({ event, payload }) {
  if (!process.env.WEBHOOK_URL) return { ok: false, error: "service_not_configured", service: "webhook" };
  const res = await fetch(process.env.WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, payload, at: new Date().toISOString() }),
  });
  return { ok: res.ok, status: res.status };
}`,
  },
  "catalog.browse": {
    fn: "catalog_browse",
    params: {
      search: { type: "string", description: "Mot-clé" },
      category: { type: "string", description: "Catégorie" },
    },
    body: String.raw`import { query, isConfigured } from "../db.js";
export async function catalog_browse({ search, category }) {
  if (!isConfigured()) return { ok: false, error: "service_not_configured", service: "database" };
  const rows = await query(
    "SELECT id, name, category, description, price FROM catalog_items WHERE ($1::text IS NULL OR name ILIKE '%'||$1||'%') AND ($2::text IS NULL OR category = $2) ORDER BY name LIMIT 25",
    [search || null, category || null],
  );
  return { ok: true, count: rows.length, items: rows };
}`,
  },
  "search.web": {
    fn: "search_web",
    params: { query: { type: "string", description: "Requête" } },
    body: String.raw`export async function search_web({ query }) {
  if (!process.env.SEARCH_API_KEY) return { ok: false, error: "service_not_configured", service: "search" };
  // Adaptez cet appel au fournisseur de recherche que vous choisirez.
  return { ok: false, error: "not_implemented",
    message: "Branchez ici l'API de recherche de votre choix (Brave, Tavily, SerpAPI…)." };
}`,
  },
  "payment.link": {
    fn: "payment_link",
    params: {
      amount: { type: "number", description: "Montant" },
      label: { type: "string", description: "Intitulé" },
    },
    body: String.raw`export async function payment_link({ amount, label }) {
  if (!process.env.PAYMENT_API_KEY) return { ok: false, error: "service_not_configured", service: "payment" };
  return { ok: false, error: "not_implemented",
    message: "Branchez ici votre prestataire de paiement. L'agent ne manipule jamais de carte." };
}`,
  },
  "handoff.human": {
    fn: "handoff_human",
    params: {
      reason: { type: "string", description: "Pourquoi l'escalade" },
      summary: { type: "string", description: "Résumé de l'échange" },
    },
    body: String.raw`import { query, isConfigured } from "../db.js";
export async function handoff_human({ reason, summary }) {
  if (isConfigured()) {
    await query("INSERT INTO handoffs (reason, summary) VALUES ($1,$2)", [reason || null, summary || null]).catch(() => {});
  }
  if (process.env.WEBHOOK_URL) {
    await fetch(process.env.WEBHOOK_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "handoff", reason, summary }),
    }).catch(() => {});
  }
  return { ok: true, message: "Un membre de l'équipe va prendre le relais." };
}`,
  },
};

/** Outils propres aux modules du site (commandes, retours) : l'assistant peut
 *  consulter le dossier du client, jamais celui d'un autre. */
const MODULE_TOOLS = {
  "orders.lookup": {
    label: "Consultation de commande",
    description:
      "Consulte une commande précise ou liste les commandes récentes du client connecté. Sans client connecté, le numéro de commande ET l'email sont obligatoires.",
    fn: "orders_lookup",
    params: {
      ref: {
        type: "string",
        description:
          "Numéro de commande (ex. CMD-48213). Absent = liste des commandes récentes du client connecté.",
      },
      email: {
        type: "string",
        description:
          "Email de la commande (requis si le client n'est pas connecté)",
      },
    },
    required: [],
    body: String.raw`import { isConfigured } from "../db.js";
import { getOrder, listOrders } from "../services/orders.js";
export async function orders_lookup({ ref, email }, ctx = {}) {
  if (!isConfigured()) return { ok: false, error: "service_not_configured", service: "database" };
  const customer = ctx.customer || null;
  if (!ref) {
    if (!customer) return { ok: false, error: "identity_required", message: "Demandez le numéro de commande et l'email utilisé, ou invitez le client à se connecter." };
    return { ok: true, orders: (await listOrders(customer)).slice(0, 5) };
  }
  const scope = customer ? { customer } : email ? { email: String(email).toLowerCase() } : null;
  if (!scope) return { ok: false, error: "identity_required", message: "Demandez l'email utilisé pour cette commande, ou invitez le client à se connecter." };
  const order = await getOrder(ref, scope);
  return order ? { ok: true, order } : { ok: false, error: "not_found", message: "Aucune commande ne correspond." };
}`,
  },
  "returns.status": {
    label: "Suivi des retours",
    description:
      "Liste les demandes de retour du client connecté et leur statut.",
    fn: "returns_status",
    params: {},
    required: [],
    body: String.raw`import { isConfigured } from "../db.js";
import { listReturns } from "../services/orders.js";
export async function returns_status(args, ctx = {}) {
  if (!isConfigured()) return { ok: false, error: "service_not_configured", service: "database" };
  if (!ctx.customer) return { ok: false, error: "auth_required", message: "Le client doit être connecté pour consulter ses retours." };
  return { ok: true, returns: await listReturns(ctx.customer) };
}`,
  },
  "returns.create": {
    label: "Création d'un retour",
    description:
      "Enregistre une demande de retour pour le client connecté. À n'utiliser qu'après confirmation explicite du client.",
    fn: "returns_create",
    params: {
      orderRef: { type: "string", description: "Numéro de la commande livrée" },
      items: {
        type: "array",
        description: "Articles à retourner",
        items: {
          type: "object",
          properties: { sku: { type: "string" }, qty: { type: "number" } },
        },
      },
      reason: {
        type: "string",
        enum: [
          "too_small",
          "too_big",
          "defective",
          "not_as_described",
          "wrong_item",
          "other",
        ],
        description: "Motif",
      },
      resolution: {
        type: "string",
        enum: ["refund", "exchange", "credit"],
        description: "Solution souhaitée",
      },
      comment: { type: "string", description: "Précision éventuelle" },
    },
    required: ["orderRef", "items", "reason", "resolution"],
    body: String.raw`import { isConfigured } from "../db.js";
import { createReturn } from "../services/orders.js";
export async function returns_create(args, ctx = {}) {
  if (!isConfigured()) return { ok: false, error: "service_not_configured", service: "database" };
  if (!ctx.customer) return { ok: false, error: "auth_required", message: "Le client doit être connecté pour demander un retour." };
  return createReturn(ctx.customer, args || {});
}`,
  },
};

function moduleToolDefs(bp) {
  const ids = [];
  if (bp.modules.orders) ids.push("orders.lookup");
  if (bp.modules.returns) ids.push("returns.status", "returns.create");
  return ids.map((id) => ({ id, ...MODULE_TOOLS[id] }));
}

function toolFiles(spec, bp) {
  const files = {};
  // L'outil optionnel produit par l'agent Backend (déjà vérifié par
  // l'agent Sécurité en amont) s'ajoute comme n'importe quel autre outil.
  const selected = [
    ...toolsOf(spec)
      .map((def) => ({ def, impl: TOOL_IMPLEMENTATIONS[def.id] }))
      .filter((t) => t.impl),
    ...moduleToolDefs(bp).map((def) => ({ def, impl: def })),
    ...(bp.extraTool
      ? [
          {
            def: {
              id: `custom.${bp.extraTool.slug}`,
              label: bp.extraTool.label,
              description: bp.extraTool.description,
            },
            impl: {
              fn: bp.extraTool.fn,
              params: bp.extraTool.params,
              body: bp.extraTool.jsBody,
              required: Object.keys(bp.extraTool.params || {}),
            },
          },
        ]
      : []),
  ];
  // Quand l'équipe a choisi et reformulé des capacités pour CE projet
  // (bp.capabilities), le libellé/description réellement envoyés au
  // modèle du site livré (schéma de fonction) reflètent son vocabulaire.
  // La fonction technique (`impl`) ne change jamais : seule sa DESCRIPTION
  // change, ce qui influence quand le modèle choisit de l'utiliser.
  if (Array.isArray(bp.capabilities) && bp.capabilities.length) {
    const overridesById = new Map(bp.capabilities.map((c) => [c.id, c]));
    for (const entry of selected) {
      const o = overridesById.get(entry.def.id);
      if (o) {
        entry.def = {
          ...entry.def,
          label: o.label || entry.def.label,
          description: o.description || entry.def.description,
        };
      }
    }
  }
  const fileOf = (id) => id.replace(".", "-");
  for (const { def, impl } of selected) {
    files[`backend/src/tools/${fileOf(def.id)}.js`] =
      `// ${def.label} — ${def.description}\n\n${impl.body}\n`;
  }
  const imports = selected
    .map(
      ({ def, impl }) => `import { ${impl.fn} } from "./${fileOf(def.id)}.js";`,
    )
    .join("\n");
  const schemas = selected.map(({ def, impl }) => ({
    type: "function",
    function: {
      name: impl.fn,
      description: def.description,
      parameters: {
        type: "object",
        properties: impl.params,
        required: impl.required || Object.keys(impl.params).slice(0, 1),
      },
    },
  }));
  const registry = selected.map(({ impl }) => `  ${impl.fn},`).join("\n");

  files["backend/src/tools/index.js"] = tpl(
    String.raw`import express from "express";
__IMPORTS__

/** Schémas exposés au modèle (format OpenAI tools). */
export const TOOLS = __SCHEMAS__;

const REGISTRY = {
__REGISTRY__
};

export async function runTool(name, args, ctx = {}) {
  const fn = REGISTRY[name];
  if (!fn) return { ok: false, error: "unknown_tool", name };
  try {
    return await fn(args || {}, ctx);
  } catch (err) {
    console.error("[tool]", name, err.message);
    return { ok: false, error: "tool_failed", message: err.message };
  }
}

/** Les mêmes outils, appelables en HTTP : utile pour vos propres intégrations. */
export const toolRoutes = express.Router();

toolRoutes.get("/", (req, res) => {
  res.json({ tools: TOOLS.map((t) => ({ name: t.function.name, description: t.function.description })) });
});

toolRoutes.post("/:name", async (req, res) => {
  const result = await runTool(req.params.name, req.body || {}, { customer: req.customer || null });
  res.status(result && result.ok === false && result.error === "service_not_configured" ? 503 : 200).json(result);
});
`,
    { IMPORTS: imports, SCHEMAS: J(schemas), REGISTRY: registry },
  );
  return files;
}

function fileSchema(spec, bp) {
  const ids = [...toolIds(spec)];
  const parts = [
    `-- Schéma de ${(spec.name || "votre AiGENT").replace(/;/g, ",")}`,
    "",
  ];
  parts.push(`CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
  if (ids.includes("lead.capture"))
    parts.push(`
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name TEXT, email TEXT, phone TEXT, request TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
  if (ids.includes("form.submit"))
    parts.push(`
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
  if (ids.includes("booking.request"))
    parts.push(`
CREATE TABLE IF NOT EXISTS booking_requests (
  id SERIAL PRIMARY KEY,
  name TEXT, contact TEXT, date TEXT, time TEXT,
  people INTEGER, note TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
  if (ids.includes("catalog.browse"))
    parts.push(`
CREATE TABLE IF NOT EXISTS catalog_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL, category TEXT, description TEXT, price NUMERIC
);`);
  if (ids.includes("handoff.human"))
    parts.push(`
CREATE TABLE IF NOT EXISTS handoffs (
  id SERIAL PRIMARY KEY,
  reason TEXT, summary TEXT,
  handled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
  if (bp.modules.auth)
    parts.push(`
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);`);
  if (bp.modules.orders)
    parts.push(`
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  placed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  carrier TEXT, tracking_number TEXT, tracking_url TEXT,
  eta DATE,
  shipping_address TEXT
);

CREATE INDEX IF NOT EXISTS orders_email_idx ON orders (lower(email));

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku TEXT, name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_events (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  label TEXT, location TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
  if (bp.modules.returns)
    parts.push(`
CREATE TABLE IF NOT EXISTS returns (
  id SERIAL PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  reason TEXT, resolution TEXT, comment TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS return_items (
  id SERIAL PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sku TEXT, name TEXT,
  qty INTEGER NOT NULL DEFAULT 1
);`);
  if (bp.sitePlan?.entities?.length)
    parts.push(`
CREATE TABLE IF NOT EXISTS generic_items (
  id SERIAL PRIMARY KEY,
  entity_id TEXT NOT NULL,
  customer_id INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS generic_items_entity_idx ON generic_items (entity_id);`);
  return parts.join("\n") + "\n";
}

function filePrompt(spec, bp, systemPrompt) {
  return `/**
 * Instructions système de votre AiGENT.
 * Modifiez librement ces textes : ils définissent son comportement.
 */

export const AGENT_NAME = ${JSON.stringify(spec.name || "Assistant")};
export const AGENT_LANGUAGE = ${JSON.stringify(spec.language || "fr")};

export const SYSTEM_PROMPT = ${JSON.stringify(systemPrompt)};

/** Règles propres aux modules du site (commandes, retours, réservation). */
export const MODULE_RULES = ${JSON.stringify(
    moduleRules(bp) +
      "\n" +
      agentBehaviorRules(normalizeDesign(spec.interface?.design)),
  )};

export const GREETING = ${JSON.stringify(bp.greeting)};

export const SUGGESTIONS = ${J(bp.suggestions)};
`;
}

/* ════════════════════════════════════════════════════════════════════
   9. FRONT-END — coque HTML et feuille de style (inchangé v3, CSS
   augmentée de quelques classes pour les nouvelles primitives)
   ════════════════════════════════════════════════════════════════════ */

const HTML_SHELL = String.raw`<!DOCTYPE html>
<html lang="__LANG__" __ATTRS__>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="__THEME__" />
<title>__TITLE__</title>
<meta name="description" content="__DESC__" />
__FAVICON__
<link rel="stylesheet" href="./styles.css" />
</head>
<body>
<div id="banner" class="banner" hidden></div>
<header id="nav" class="nav"></header>
<main id="view" tabindex="-1"></main>
<footer id="footer" class="footer"></footer>
<div id="assistant-root"></div>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<script>window.__APP__ = __CONFIG__;</script>
<script src="./app.js"></script>
</body>
</html>
`;

const CSS = String.raw`/* Apparence de __NAME__ — thème clair, une seule couleur d'accent.
   Modifiez les variables ci-dessous : tout le site suit. */
:root, .shot-root {
  --bg: __BG__;
  --surface: color-mix(in srgb, __SURFACE__ calc(__SURFACEOPACITY__ * 100%), transparent);
  --alt: __ALT__;
  --border: __BORDER__;
  --text: __TEXT__;
  --muted: __MUTED__;
  --accent: __ACCENT__;
  --accent-to: __ACCENTTO__;
  --nav-bg: __HEADERBG__;
  --on-accent: __ONACCENT__;
  --r: __RADIUS__;
  --font: __FONT__;
  --bubble-r: __BUBBLERADIUS__;
  --soft: color-mix(in srgb, var(--accent) 8%, var(--bg));
  --ring: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  --shadow: 0 1px 2px rgba(16, 17, 20, .04), 0 18px 40px -22px rgba(16, 17, 20, .22);
  --green: #1c9a62; --amber: #b4740f; --red: #d24545; --blue: #2c6fdc;
}
__DARKBLOCK__
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body, .shot-body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 var(--font); -webkit-font-smoothing: antialiased; }
body.noscroll { overflow: hidden; }
h1, h2, h3, p, ul, ol, dl { margin: 0; }
ul, ol { padding: 0; list-style: none; }
a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
[hidden] { display: none !important; }
:focus-visible { outline: none; box-shadow: var(--ring); }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.grow { flex: 1; min-width: 0; }
.center { text-align: center; }

/* ── Bandeau de configuration ── */
.banner { background: var(--alt); border-bottom: 1px solid var(--border); color: var(--muted); font-size: 13px; padding: 8px 16px; text-align: center; }

/* ── Navigation ── */
.nav { position: sticky; top: 0; z-index: 50; background: color-mix(in srgb, var(--nav-bg) __NAVBGMIX__, transparent); backdrop-filter: __NAVBLUR__; border-bottom: 1px solid var(--border); }
.nav-in { display: flex; align-items: center; gap: 18px; height: 60px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 650; letter-spacing: -.01em; }
.mark { width: 30px; height: 30px; border-radius: calc(var(--r) * .55); background: var(--accent); color: var(--on-accent); display: inline-grid; place-items: center; font-weight: 700; font-size: 14px; flex: none; }
.mark.lg { width: 44px; height: 44px; font-size: 19px; }
.nav-links { display: flex; gap: 2px; flex: 1; margin-left: 8px; }
.nav-link { padding: 6px 12px; border-radius: 8px; color: var(--muted); font-size: 14px; white-space: nowrap; }
.nav-link:hover { color: var(--text); background: var(--alt); }
.nav-link.on { color: var(--text); background: var(--alt); font-weight: 550; }
.nav-right { display: flex; align-items: center; gap: 8px; }
.nav-user { display: flex; align-items: center; gap: 8px; font-size: 14px; padding: 0 4px; }
.avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--soft); color: var(--accent); display: grid; place-items: center; font-weight: 650; font-size: 13px; }

/* ── Boutons et champs ── */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); font-weight: 550; font-size: 14px; transition: background .15s, border-color .15s, filter .15s; white-space: nowrap; }
.btn:hover { background: var(--alt); }
.btn.primary { background: linear-gradient(135deg, var(--accent), var(--accent-to)); color: var(--on-accent); border-color: var(--accent); }
.btn.primary:hover { filter: brightness(1.14); background: var(--accent); }
.btn.soft { background: var(--soft); border-color: transparent; color: var(--accent); }
.btn.soft:hover { filter: brightness(.97); }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.ghost:hover { color: var(--text); background: var(--alt); }
.btn.sm { height: 34px; padding: 0 12px; font-size: 13px; }
.btn.lg { height: 48px; padding: 0 22px; font-size: 15px; border-radius: 12px; }
.btn.block { width: 100%; }
.btn:disabled { opacity: .5; cursor: default; }
.icon-btn { width: 34px; height: 34px; border-radius: 9px; border: none; background: transparent; color: var(--muted); display: grid; place-items: center; }
.icon-btn:hover { background: var(--alt); color: var(--text); }
input, select, textarea { width: 100%; height: 42px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); outline: none; transition: border-color .15s, box-shadow .15s; }
textarea { height: auto; padding: 10px 12px; resize: vertical; }
input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: var(--ring); }
input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--accent); flex: none; }
.field { display: grid; gap: 6px; font-size: 13.5px; font-weight: 550; }
.field small { color: var(--muted); font-weight: 400; }
.form { display: grid; gap: 14px; }
.form-error { color: var(--red); font-size: 13.5px; margin-top: 10px; }

/* ── Accueil ── */
.hero { padding: 72px 0 56px; }
.hero-in { display: grid; grid-template-columns: 1.1fr .9fr; gap: 56px; align-items: center; }
.hero h1 { font-size: clamp(38px, 5.2vw, 60px); line-height: 1.04; letter-spacing: -.038em; font-weight: 620; }
.lead { font-size: 18px; line-height: 1.55; color: var(--muted); margin-top: 20px; max-width: 52ch; }
.hero-cta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 32px; }
.panel { background: var(--bg); border: 1px solid var(--border); border-radius: 18px; padding: 26px; box-shadow: var(--shadow); display: grid; gap: 14px; }
.panel h2 { font-size: 20px; letter-spacing: -.02em; }
.panel-link { text-align: center; color: var(--muted); font-size: 13.5px; }
.panel-link:hover { color: var(--text); }
.block { padding: 56px 0; border-top: 1px solid var(--border); }
.block h2 { font-size: 28px; letter-spacing: -.028em; font-weight: 620; }
.block .sub { color: var(--muted); margin: 8px 0 32px; max-width: 56ch; }
.caps { display: grid; grid-template-columns: repeat(2, 1fr); border-top: 1px solid var(--border); }

.cap { display: flex; gap: 16px; padding: 24px 28px 24px 0; border-bottom: 1px solid var(--border); text-align: left; background: none; border-left: 0; border-right: 0; border-top: 0; color: inherit; }
.cap:nth-child(even) { padding-left: 28px; padding-right: 0; border-left: 1px solid var(--border); }
.cap:hover .cap-t { text-decoration: underline; text-underline-offset: 3px; }
.cap-ico { width: 40px; height: 40px; border-radius: 10px; background: var(--soft); color: var(--accent); display: grid; place-items: center; flex: none; }
.cap-t { font-weight: 600; font-size: 15.5px; }
.cap p { color: var(--muted); margin-top: 3px; }
.spotlight { padding: 40px; border: 1px solid var(--border); border-radius: 20px; background: var(--surface); }
.spotlight h2 { font-size: 24px; letter-spacing: -.025em; margin-bottom: 12px; }
.spotlight p { color: var(--muted); max-width: 68ch; }
.spotlight p + p { margin-top: 10px; }
.spotlight ul { margin-top: 16px; display: grid; gap: 8px; }
.spotlight li { display: flex; gap: 10px; color: var(--text); font-size: 14.5px; }
.caps.list { display: grid; grid-template-columns: 1fr; }
.caps.list .cap { padding: 18px 0; border-left: 0 !important; border-right: 0 !important; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; counter-reset: s; }
.steps li { counter-increment: s; border-top: 2px solid var(--accent); padding-top: 16px; }
.steps li::before { content: counter(s); font-weight: 650; font-size: 13px; color: var(--accent); display: block; margin-bottom: 6px; }
.faq { border-top: 1px solid var(--border); }
.faq details { border-bottom: 1px solid var(--border); }
.faq summary { cursor: pointer; list-style: none; padding: 18px 0; font-weight: 550; display: flex; justify-content: space-between; gap: 16px; align-items: center; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary svg { transition: transform .18s; color: var(--muted); flex: none; }
.faq details[open] summary svg { transform: rotate(90deg); }
.faq .a { padding: 0 0 20px; color: var(--muted); max-width: 70ch; }
.band { background: var(--accent); color: var(--on-accent); border-radius: 20px; padding: 40px 44px; display: flex; justify-content: space-between; align-items: center; gap: 24px; flex-wrap: wrap; }
.band h2 { font-size: 26px; letter-spacing: -.025em; }
.band p { opacity: .8; margin-top: 4px; }
.band .btn { background: var(--on-accent); color: var(--accent); border-color: transparent; }
.footer { border-top: 1px solid var(--border); margin-top: 24px; }
.foot-in { display: grid; grid-template-columns: 1.2fr 1.4fr auto; gap: 32px; padding: 36px 24px; align-items: start; font-size: 14px; }
.foot-links { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.foot-links a { color: var(--muted); }
.foot-links a:hover { color: var(--text); }

/* ── Pages internes ── */
.page { padding: 44px 0 72px; }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; }
.page-head h1 { font-size: 32px; letter-spacing: -.03em; font-weight: 620; }
.back { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 14px; margin-bottom: 14px; }
.back:hover { color: var(--text); }
.back svg { transform: rotate(180deg); }
.card { background: var(--bg); border: 1px solid var(--border); border-radius: 14px; }
.card.pad { padding: 24px; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 4px; }
.card h2 { font-size: 17px; letter-spacing: -.01em; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
.stat { padding: 20px 22px; }
.stat b { display: block; font-size: 32px; letter-spacing: -.03em; line-height: 1.1; margin-top: 4px; font-weight: 620; }
.rows { display: grid; }
.row { display: flex; align-items: center; gap: 14px; padding: 16px 20px; border-bottom: 1px solid var(--border); transition: background .12s; }
.row:last-child { border-bottom: 0; }
a.row:hover { background: var(--surface); }
.thumb { width: 40px; height: 40px; border-radius: 10px; background: var(--alt); color: var(--muted); display: grid; place-items: center; flex: none; }
.row small { display: block; color: var(--muted); }
.row .end { text-align: right; display: grid; gap: 4px; justify-items: end; }
.row .chev { color: var(--muted); }
.section-title { display: flex; justify-content: space-between; align-items: center; margin: 32px 0 12px; }
.section-title h2 { font-size: 18px; letter-spacing: -.015em; }
.quick { display: flex; gap: 10px; flex-wrap: wrap; }
.pill { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--alt); color: var(--muted); white-space: nowrap; }
.pill.green { background: color-mix(in srgb, var(--green) 13%, var(--bg)); color: var(--green); }
.pill.amber { background: color-mix(in srgb, var(--amber) 13%, var(--bg)); color: var(--amber); }
.pill.blue { background: color-mix(in srgb, var(--blue) 12%, var(--bg)); color: var(--blue); }
.pill.red { background: color-mix(in srgb, var(--red) 12%, var(--bg)); color: var(--red); }
.chips, .filters { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { height: 32px; padding: 0 13px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); font-size: 13px; }
.chip:hover { background: var(--alt); }
.chip.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.notice { display: flex; gap: 14px; align-items: flex-start; padding: 18px 20px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
.notice.warn { border-color: color-mix(in srgb, var(--amber) 40%, var(--border)); }
.notice p { color: var(--muted); margin-top: 2px; }
.empty { text-align: center; padding: 56px 20px; color: var(--muted); }
.empty h3 { color: var(--text); font-size: 17px; margin-bottom: 4px; }
.skeleton { height: 120px; border-radius: 14px; background: linear-gradient(90deg, var(--alt), var(--surface), var(--alt)); background-size: 200% 100%; animation: sk 1.2s infinite linear; }
@keyframes sk { to { background-position: -200% 0; } }
#view.loading { opacity: .55; transition: opacity .15s; }

/* ── Commande : suivi ── */
.order-grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; align-items: start; }
.stack { display: grid; gap: 16px; }
.eta { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--muted); }
.eta strong { color: var(--text); }
.timeline { margin-top: 22px; }
.timeline li { position: relative; padding: 0 0 24px 34px; color: var(--muted); }
.timeline li:last-child { padding-bottom: 0; }
.timeline li::before { content: ""; position: absolute; left: 9px; top: 20px; bottom: -2px; width: 2px; background: var(--border); }
.timeline li:last-child::before { display: none; }
.timeline .dot { position: absolute; left: 0; top: 2px; width: 20px; height: 20px; border-radius: 50%; background: var(--bg); border: 2px solid var(--border); display: grid; place-items: center; color: var(--on-accent); }
.timeline li.done { color: var(--text); }
.timeline li.done .dot { background: var(--green); border-color: var(--green); }
.timeline li.done::before { background: var(--green); }
.timeline li.current { color: var(--text); font-weight: 600; }
.timeline li.current .dot { border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent); }
.timeline li.current .dot::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.timeline small { display: block; font-weight: 400; color: var(--muted); }
.carrier { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13.5px; }
.carrier a { color: var(--accent); font-weight: 550; }
.lines li { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.lines li:last-child { border-bottom: 0; }
.lines small { display: block; color: var(--muted); }
.total { display: flex; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--border); font-size: 16px; }
.order-head { margin: 28px 0 16px; }
.order-head h2 { font-size: 22px; letter-spacing: -.02em; }
.track-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; padding: 20px; }

/* ── Catalogue ── */
.tools { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 22px; }
.tools .search { position: relative; flex: 1; min-width: 220px; }
.tools .search svg { position: absolute; left: 12px; top: 11px; color: var(--muted); }
.tools .search input { padding-left: 38px; }
.products { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.product { padding: 20px; display: grid; gap: 6px; align-content: start; }
.product .tag { font-size: 12.5px; color: var(--muted); }
.product h3 { font-size: 16px; letter-spacing: -.01em; }
.product p { color: var(--muted); font-size: 14px; }
.product .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
.price { font-weight: 650; font-size: 16px; }

/* ── Connexion ── */
.auth { display: grid; grid-template-columns: 1fr 1fr; min-height: calc(100vh - 61px); }
.auth-aside { background: var(--soft); border-right: 1px solid var(--border); padding: 72px 64px; display: flex; align-items: center; }
.auth-aside h2 { font-size: 30px; letter-spacing: -.03em; margin: 22px 0 8px; font-weight: 620; max-width: 20ch; }
.ticks { margin-top: 20px; }
.ticks li { display: flex; gap: 10px; align-items: flex-start; margin-top: 12px; }
.ticks svg { color: var(--green); flex: none; margin-top: 4px; }
.auth-main { display: grid; place-items: center; padding: 40px 24px; }
.auth-card { width: 100%; max-width: 380px; }
.auth-card h1 { font-size: 28px; letter-spacing: -.03em; font-weight: 620; }
.auth-card .form { margin-top: 24px; }
.alt { margin-top: 20px; text-align: center; color: var(--muted); font-size: 14px; }
.alt a { color: var(--accent); font-weight: 600; }

/* ── Assistant pas à pas (fenêtre) ── */
.overlay { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 16px; background: rgba(16, 17, 20, .42); backdrop-filter: blur(3px); opacity: 0; transition: opacity .16s; }
.overlay.show { opacity: 1; }
.modal { width: 100%; max-width: 520px; max-height: calc(100vh - 32px); overflow: auto; background: var(--bg); border-radius: 18px; box-shadow: 0 30px 80px -20px rgba(0, 0, 0, .4); transform: translateY(10px) scale(.985); transition: transform .18s; }
.overlay.show .modal { transform: none; }
.modal-head { display: flex; justify-content: space-between; gap: 12px; padding: 22px 24px 6px; }
.modal-head h2 { font-size: 17px; letter-spacing: -.01em; }
.modal-head p { color: var(--muted); font-size: 13.5px; }
.steps-bar { display: flex; gap: 5px; padding: 10px 24px 4px; }
.steps-bar i { flex: 1; height: 3px; border-radius: 2px; background: var(--border); transition: background .2s; }
.steps-bar i.on { background: var(--accent); }
.modal-body { padding: 16px 24px 8px; min-height: 170px; }
.q { font-size: 21px; letter-spacing: -.02em; margin-bottom: 6px; font-weight: 620; }
.hint { color: var(--muted); font-size: 13.5px; margin-bottom: 14px; }
.modal-body > input, .modal-body > textarea { margin-top: 10px; }
.modal-foot { display: flex; justify-content: space-between; gap: 10px; padding: 16px 24px 22px; }
.choices, .items { display: grid; gap: 8px; margin-top: 12px; }
.choice { text-align: left; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); display: grid; gap: 2px; transition: border-color .12s; }
.choice:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
.choice.on { border-color: var(--accent); background: var(--soft); box-shadow: var(--ring); }
.choice span { color: var(--muted); font-size: 13px; }
.item-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; cursor: pointer; }
.item-row small { display: block; color: var(--muted); }
.item-row .qty { width: 64px; height: 34px; padding: 0 6px; }
.review { display: grid; grid-template-columns: 120px 1fr; gap: 10px 14px; margin: 14px 0; font-size: 14px; }
.review dt { color: var(--muted); }
.review dd { margin: 0; word-break: break-word; }
.result { text-align: center; padding: 18px 0 6px; }
.result-ico { width: 54px; height: 54px; border-radius: 50%; background: color-mix(in srgb, var(--green) 14%, var(--bg)); color: var(--green); display: grid; place-items: center; margin: 0 auto 14px; }
.result h3 { font-size: 19px; letter-spacing: -.015em; }
.result p { color: var(--muted); margin-top: 6px; }

/* ── Assistant IA ── */
.a-fab { position: fixed; right: 20px; bottom: 20px; z-index: 80; height: 48px; padding: 0 18px 0 15px; border-radius: 999px; border: none; background: var(--accent); color: var(--on-accent); display: flex; gap: 8px; align-items: center; font-weight: 600; box-shadow: var(--shadow); }
.a-fab:hover { filter: brightness(1.14); }
.a-panel { position: fixed; right: 20px; bottom: 20px; z-index: 90; width: 400px; max-width: calc(100vw - 24px); height: min(640px, calc(100vh - 40px)); display: none; flex-direction: column; overflow: hidden; background: var(--bg); border: 1px solid var(--border); border-radius: 18px; box-shadow: 0 30px 80px -24px rgba(0, 0, 0, .35); }
.a-panel.open { display: flex; }
.a-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.a-head small { display: flex; align-items: center; gap: 6px; color: var(--muted); }
.live { width: 7px; height: 7px; border-radius: 50%; background: var(--green); display: inline-block; }
.a-thread { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; font-size: 14px; }
.msg { max-width: 92%; }
.msg.user { align-self: flex-end; background: var(--accent); color: var(--on-accent); padding: 9px 13px; border-radius: var(--bubble-r) var(--bubble-r) calc(var(--bubble-r) * .28) var(--bubble-r); }
.msg.agent { align-self: flex-start; background: var(--alt); padding: 10px 13px; border-radius: var(--bubble-r) var(--bubble-r) var(--bubble-r) calc(var(--bubble-r) * .28); }
.md p + p { margin-top: 8px; }
.md ul { list-style: disc; padding-left: 18px; margin: 6px 0; }
.acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.act { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--green); background: var(--bg); border: 1px solid var(--border); border-radius: 999px; padding: 2px 9px; }
.typing { display: inline-flex; gap: 4px; padding: 14px; }
.typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); opacity: .4; animation: bl 1s infinite; }
.typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
@keyframes bl { 50% { opacity: 1; transform: translateY(-2px); } }
.a-chips { padding: 0 16px 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.a-form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--border); }
.a-send { width: 42px; flex: none; border: none; border-radius: 10px; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; }
.a-send:disabled, .a-form input:disabled { opacity: .5; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 300; background: var(--text); color: var(--bg); padding: 10px 16px; border-radius: 10px; font-size: 13.5px; max-width: calc(100vw - 32px); }

/* ── AJOUT v5 — primitives supplémentaires du système de blocs
   (comparison-table, quote-block). Le reste des primitives réutilise les
   classes ci-dessus (.card/.stats/.faq/.products/.timeline/.band/
   .spotlight/.steps/.choices/.chips). ── */
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th, .table td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.table th:first-child, .table td:first-child { color: var(--muted); font-weight: 500; }
.table tr:first-child th { color: var(--muted); font-weight: 600; font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 2px solid var(--border); }
blockquote { margin: 0; }

@media (max-width: 900px) {
  .hero { padding: 40px 0 32px; }
  .hero-in, .order-grid, .auth { grid-template-columns: 1fr; }
  .hero-in { gap: 32px; }
  .caps, .steps, .products { grid-template-columns: 1fr; }
  .cap, .cap:nth-child(even) { padding: 20px 0; border-left: 0; }
  .steps { gap: 24px; }
  .auth-aside { display: none; }
  .foot-in { grid-template-columns: 1fr; }
  .stats { grid-template-columns: 1fr; }
  .nav-in { flex-wrap: wrap; height: auto; padding-top: 10px; padding-bottom: 6px; }
  .nav-links { order: 3; width: 100%; margin: 0; overflow-x: auto; padding-bottom: 4px; }
  .nav-right { margin-left: auto; }
  .nav-user span:last-child { display: none; }
  .track-form { grid-template-columns: 1fr; }
  .band { padding: 28px; }
  .a-panel { right: 0; bottom: 0; width: 100vw; max-width: 100vw; height: 100dvh; border-radius: 0; border: 0; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;

function fileFrontendHtml(spec, bp) {
  const design = normalizeDesign(spec.interface?.design);
  const icon = design.brand.favicon || spec.interface?.icon;
  const iconMime = icon?.match(/^data:(image\/[a-z0-9.+-]+);base64,/i)?.[1];
  const favicon = iconMime
    ? `<link rel="icon" type="${esc(iconMime)}" href="${icon}" />`
    : "";
  const fh = fontHref(design);
  const fontLink = fh
    ? `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="${fh}" />`
    : "";
  return tpl(HTML_SHELL, {
    LANG: esc(spec.language || "fr"),
    ATTRS: Object.entries(designAttrs(design))
      .map(([k, v]) => `data-${k}="${esc(v)}"`)
      .join(" "),
    TITLE: esc(spec.name || "Mon AiGENT"),
    DESC: esc(spec.tagline || spec.purpose || ""),
    THEME: design.colors.bg,
    FAVICON: favicon + fontLink,
    CONFIG: jsonForScript(clientConfig(spec, bp)),
  });
}

function fileFrontendCss(spec, bp) {
  const t = lightTokensFor(spec, bp);
  const designSheet = designCss(normalizeDesign(spec.interface?.design));
  return (
    tpl(CSS, {
      NAME: (spec.name || "votre AiGENT").replace(/[<>]|\*\//g, ""),
      BG: t.bg,
      SURFACE: t.surface,
      ALT: t.surfaceAlt,
      BORDER: t.border,
      TEXT: t.text,
      MUTED: t.muted,
      ACCENT: t.accent,
      ACCENTTO: t.accentTo,
      HEADERBG: t.headerBg,
      ONACCENT: t.accentText,
      RADIUS: t.radius,
      FONT: t.font,
      SURFACEOPACITY: String(t.surfaceOpacity),
      BUBBLERADIUS: t.bubbleRadius,
      NAVBLUR:
        t.navStyle === "translucent" ? "saturate(1.4) blur(12px)" : "none",
      NAVBGMIX: t.navStyle === "translucent" ? "86%" : "100%",
      DARKBLOCK:
        t.darkBg || t.darkText || t.darkSurface
          ? `@media (prefers-color-scheme: dark) {\n  :root {\n${[
              t.darkBg && `    --bg: ${t.darkBg};`,
              t.darkSurface && `    --surface: ${t.darkSurface};`,
              t.darkText && `    --text: ${t.darkText};`,
            ]
              .filter(Boolean)
              .join("\n")}\n  }\n}`
          : "",
    }) +
    "\n" +
    designSheet
  );
}

/** Configuration embarquée dans la page : le site s'en sert pour se
 *  composer. `homeBlocks` est l'arbre compilé côté client par
 *  renderBlockTree (voir CLIENT_BLOCKS) — c'est la vraie composition de
 *  l'accueil, plus jamais un texte plat dans un squelette figé. */
function clientConfig(spec, bp) {
  const design = normalizeDesign(spec.interface?.design);
  // contenu saisi + ordre + visibilité des sections, puis validation habituelle
  const home =
    sanitizeBlockTree(composeHome(bp.homeBlocks, design), bp.modules) ||
    bp.homeBlocks;
  return {
    design,
    agentName: design.agent.name || spec.name || "Assistant",
    agentAvatar: design.agent.avatar,
    name: spec.name || "Mon AiGENT",
    slug: spec.slug || slugify(spec.name || "mon-aigent"),
    tagline: spec.tagline || "",
    domain: bp.domain,
    currency: bp.currency,
    modules: bp.modules,
    labels: bp.labels,
    hero: bp.hero,
    features: bp.features,
    featureVariant: bp.featureVariant || "grid",
    spotlight: bp.spotlight || null,
    steps: bp.steps,
    benefits: bp.benefits,
    nav: bp.nav,
    booking: bp.booking,
    greeting: design.agent.greeting || bp.greeting,
    suggestions: bp.suggestions,
    sitePlan: bp.sitePlan || null,
    homeBlocks: home || null,
    authCopy: bp.authCopy,
  };
}

/* ════════════════════════════════════════════════════════════════════
   10. FRONT-END — application (une seule page, routes par « # »)
   Écrit sans backtick ni interpolation : les gabarits restent des String.raw.
   ════════════════════════════════════════════════════════════════════ */

const CLIENT_CORE = String.raw`(() => {
  "use strict";
  const APP = window.__APP__;
  const M = APP.modules;
  const SHOT = /[?&]__shot=(guest|user)/.test(location.search);
  const TOKEN_KEY = "tok:" + (SHOT ? "shot:" : "") + (APP.slug || "site");
  const state = { token: null, customer: null, health: null };
  try { state.token = localStorage.getItem(TOKEN_KEY); } catch (_) {}

  /* ── Utilitaires ─────────────────────────────────────────────── */
  const $ = (s, r) => (r || document).querySelector(s);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "value") el.value = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    (function add(list) {
      for (const c of list) {
        if (c == null || c === false) continue;
        if (Array.isArray(c)) add(c);
        else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      }
    })(kids);
    return el;
  }
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    package: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    send: '<path d="m22 2-9 20-3-9-9-3z"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    tag: '<path d="M20 12 12 20 4 12V4h8z"/><circle cx="8.5" cy="8.5" r="1"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
  };
  const ico = (name, size) =>
    h("span", { class: "ico", "aria-hidden": "true", style: "display:inline-flex", html:
      '<svg viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg>" });

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
  const fmtWhen = (d) => (d ? new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const money = (n, cur) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur || APP.currency || "EUR" }).format(Number(n) || 0);
  const initial = (s) => (String(s || "?").trim().charAt(0) || "?").toUpperCase();
  const firstName = (s) => String(s || "").trim().split(/\s+/)[0];
   const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? u : null);
  const DSG = APP.design || {};
  const sectionOn = (id) => { const s = (DSG.sections || []).find((x) => x.id === id); return !s || s.enabled !== false; };
  const ctaAction = () => { if (typeof startBooking === "function") startBooking(); else openAssistant(); };

  const STATUS = {
    processing: ["En préparation", "amber"], shipped: ["Expédiée", "blue"], out_for_delivery: ["En livraison", "blue"],
    delivered: ["Livrée", "green"], cancelled: ["Annulée", "red"],
    requested: ["Demande reçue", "amber"], approved: ["Retour accepté", "blue"], received: ["Colis reçu", "blue"],
    refunded: ["Remboursé", "green"], rejected: ["Refusé", "red"],
  };
  const pill = (s) => { const x = STATUS[s] || [s, "gray"]; return h("span", { class: "pill " + x[1] }, x[0]); };

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
  }
  const field = (label, input, hint) => h("label", { class: "field" }, h("span", null, label), input, hint ? h("small", null, hint) : null);

  /* ── API ─────────────────────────────────────────────────────── */
  async function api(path, opts) {
    const o = opts || {};
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers.Authorization = "Bearer " + state.token;
    let res;
    try {
      res = await fetch("/api" + path, { method: o.method || "GET", headers, body: o.body ? JSON.stringify(o.body) : undefined });
    } catch (_) {
      return { ok: false, error: "network_error" };
    }
    let data = {};
    try { data = await res.json(); } catch (_) {}
    data.httpStatus = res.status;
    if (data.ok === undefined) data.ok = res.ok;
    return data;
  }
  const HINT = { database: "DATABASE_URL", ai_provider: "AI_API_KEY", availability_source: "BOOKING_API_URL", email: "SMTP_HOST", orders_source: "ADMIN_TOKEN" };
  function friendly(res) {
    if (!res) return "Un problème est survenu. Réessayez dans un instant.";
    if (res.error === "service_not_configured") {
      const env = state.health && state.health.env;
      const dev = env && env !== "production" && env !== "preview";
      return "Cette fonctionnalité n'est pas encore activée. Merci de nous contacter directement en attendant." +
        (dev && HINT[res.service] ? " (Développeur : renseignez " + HINT[res.service] + " dans .env.)" : "");
    }
    if (res.error === "network_error") return "Connexion impossible. Vérifiez votre réseau et réessayez.";
    return res.message || "Un problème est survenu. Réessayez dans un instant.";
  }
  function errorCard(res) {
    const off = res && res.error === "service_not_configured";
    return h("div", { class: "notice" + (off ? "" : " warn") }, ico(off ? "lock" : "help", 20),
      h("div", null, h("strong", null, off ? "Bientôt disponible" : "Un problème est survenu"), h("p", null, friendly(res))));
  }

  /* ── Session ─────────────────────────────────────────────────── */
  function setSession(token, customer) {
    state.token = token; state.customer = customer;
    try { localStorage.setItem(TOKEN_KEY, token); } catch (_) {}
  }
  function clearSession() {
    state.token = null; state.customer = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
  }
  function logout() { clearSession(); go("/"); toast("Vous êtes déconnecté."); }

  /* ── Routeur ─────────────────────────────────────────────────── */
  const routes = [];
  function route(path, opts) {
    const keys = [];
    const re = new RegExp("^" + path.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }) + "$");
    routes.push(Object.assign({ path, re, keys }, opts));
  }
  const go = (path) => { location.hash = "#" + path; };
  function parseHash() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const i = raw.indexOf("?");
    const query = {};
    new URLSearchParams(i < 0 ? "" : raw.slice(i + 1)).forEach((v, k) => { query[k] = v; });
    return { path: i < 0 ? raw : raw.slice(0, i), query };
  }
  const visible = (n) => (!n.auth || state.customer) && (!n.guest || !state.customer);

   function renderNav(path) {
    const nav = $("#nav");
    nav.innerHTML = "";
    nav.classList.remove("open");
    const N = DSG.nav || {};
    const links = APP.nav.filter(visible).slice(0, N.maxLinks || 6).map((n) =>
      h("a", { class: "nav-link" + ((n.path === "/" ? path === "/" : path === n.path || path.indexOf(n.path + "/") === 0) ? " on" : ""), href: "#" + n.path, onclick: () => nav.classList.remove("open") }, n.label));
    const right = [];
    if (N.cta !== false && N.ctaLabel) right.push(h("button", { class: "btn primary sm nav-cta", type: "button", onclick: ctaAction }, N.ctaLabel));
    if (M.auth) {
      if (state.customer) {
        right.push(h("a", { class: "nav-user", href: "#/compte" }, h("span", { class: "avatar" }, initial(state.customer.name)), h("span", null, firstName(state.customer.name))));
        right.push(h("button", { class: "btn ghost sm", onclick: logout }, "Déconnexion"));
      } else {
        right.push(h("a", { class: "btn ghost sm", href: "#/connexion" }, "Se connecter"));
      }
    }
    right.push(h("button", { class: "burger", type: "button", "aria-label": "Menu", onclick: () => nav.classList.toggle("open"),
      html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' }));
    const brandMark = (DSG.brand && DSG.brand.logo)
      ? h("img", { class: "logo-img", src: DSG.brand.logo, alt: "" })
      : h("span", { class: "mark" }, initial(APP.name));
    nav.appendChild(h("div", { class: "wrap nav-in" },
      h("a", { class: "brand", href: "#/" }, brandMark, h("span", null, APP.name)),
      h("nav", { class: "nav-links", "aria-label": "Navigation principale" }, links),
      h("div", { class: "nav-right" }, right)));
  }
  function renderFooter() {
    const f = $("#footer");
    f.innerHTML = "";
    f.hidden = !sectionOn("footer");
    if (f.hidden) return;
    const C = DSG.content || {};
    const contact = [C.address, C.phone && h("a", { href: "tel:" + C.phone.replace(/\s/g, "") }, C.phone), C.email && h("a", { href: "mailto:" + C.email }, C.email),
      C.social && (safeUrl(C.social) ? h("a", { href: C.social, target: "_blank", rel: "noopener" }, C.social) : C.social)].filter(Boolean);
    f.appendChild(h("div", { class: "wrap foot-in" },
      h("div", null, h("strong", null, APP.name), h("p", { class: "muted" }, APP.tagline || ""), contact.length ? h("div", { class: "muted small", style: "margin-top:10px;display:grid;gap:4px" }, contact.map((x) => h("div", null, x))) : null),
      h("nav", { class: "foot-links", "aria-label": "Liens" }, APP.nav.filter(visible).map((n) => h("a", { href: "#" + n.path }, n.label))),
      h("p", { class: "muted small" }, "© " + new Date().getFullYear() + " " + APP.name)));
  }
  function renderBanner() {
    const b = $("#banner");
    const hl = state.health;
    b.hidden = true;
    if (!hl) return;
    let msg = null;
    if (hl.env === "preview") {
      msg = "Aperçu de démonstration : les données sont fictives. Créez un compte avec n'importe quel email pour tout essayer. Le projet exporté utilisera votre base de données et votre IA.";
    } else if (hl.env !== "production") {
      const names = { ai: "IA (AI_API_KEY)", database: "base de données (DATABASE_URL)", sessions: "sessions (SESSION_SECRET)", email: "email (SMTP)" };
      const miss = Object.keys(hl.configured || {}).filter((k) => !hl.configured[k]).map((k) => names[k] || k);
      if (miss.length) msg = "Configuration incomplète : " + miss.join(", ") + ". Renseignez vos clés dans le fichier .env.";
    }
    if (msg) { b.hidden = false; b.textContent = msg; }
  }

  let renderId = 0;
  async function render() {
    const id = ++renderId;
    const { path, query } = parseHash();
    let match = null;
    const params = {};
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) { match = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
    }
    if (!match) match = routes.find((r) => r.path === "/404");
    if (match.auth && !state.customer) { location.replace("#/connexion?next=" + encodeURIComponent(path)); return; }
    if (match.guestOnly && state.customer) { location.replace("#/compte"); return; }
    renderNav(path);
    renderFooter();
    const view = $("#view");
    view.classList.add("loading");
    let node;
    try { node = await match.render({ params, query, path }); }
    catch (e) { console.error(e); node = h("div", { class: "wrap page" }, errorCard({ error: "client_error" })); }
    if (id !== renderId) return;
    view.innerHTML = "";
    view.classList.remove("loading");
    view.appendChild(node);
    document.title = (match.title ? match.title + " · " : "") + APP.name;
    window.scrollTo(0, 0);
  }

  /* ── Assistant pas à pas : une question à la fois, dans une fenêtre ── */
  function openWizard(cfg) {
    const values = Object.assign({}, cfg.initial || {});
    const steps = cfg.steps;
    let index = 0, phase = "steps", busy = false, result = null, errorMsg = "", control = null, errBox = null;
    const overlay = h("div", { class: "overlay" });
    const box = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": cfg.title });
    overlay.appendChild(box);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 170);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("noscroll");
    }
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
    document.body.classList.add("noscroll");
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    const visibleSteps = () => steps.filter((s) => !(s.skip && s.skip(values)));
    const optionsOf = (s) => (typeof s.options === "function" ? s.options(values) : s.options || []);
    function display(s, v) {
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "—";
      if (s.type === "items") return v.map((i) => i.qty + " × " + i.name).join(", ");
      if (s.type === "choice") { const o = optionsOf(s).find((x) => x.value === v); return o ? o.label : v; }
      return String(v);
    }
    function buildControl(s) {
      const cur = values[s.key];
      if (s.type === "choice") {
        let selected = cur == null ? null : cur;
        const wrap = h("div", { class: "choices", role: "radiogroup" });
        const paint = () => {
          wrap.innerHTML = "";
          optionsOf(s).forEach((o) => wrap.appendChild(h("button", { type: "button", role: "radio", "aria-checked": selected === o.value ? "true" : "false", class: "choice" + (selected === o.value ? " on" : ""), onclick: () => { selected = o.value; paint(); } },
            h("strong", null, o.label), o.hint ? h("span", null, o.hint) : null)));
        };
        paint();
        return { el: wrap, get: () => selected };
      }
      if (s.type === "items") {
        const chosen = {};
        (cur || []).forEach((i) => { chosen[i.sku] = i.qty; });
        const rows = [];
        const wrap = h("div", { class: "items" });
        s.options(values).forEach((it) => {
          const qty = h("select", { class: "qty", "aria-label": "Quantité" });
          for (let q = 1; q <= it.max; q++) qty.appendChild(h("option", { value: String(q) }, String(q)));
          qty.value = String(chosen[it.sku] || it.max);
          const cb = h("input", { type: "checkbox" });
          cb.checked = it.sku in chosen;
          rows.push({ it, cb, qty });
          wrap.appendChild(h("label", { class: "item-row" }, cb, h("span", { class: "grow" }, h("strong", null, it.name), it.sub ? h("small", null, it.sub) : null), qty));
        });
        return { el: wrap, get: () => rows.filter((r) => r.cb.checked).map((r) => ({ sku: r.it.sku, name: r.it.name, qty: Number(r.qty.value) })) };
      }
      const input = s.type === "textarea"
        ? h("textarea", { rows: "4", placeholder: s.placeholder || "" })
        : h("input", { type: s.type || "text", placeholder: s.placeholder || "", autocomplete: s.autocomplete || "off", min: s.min, max: s.max });
      input.value = cur == null ? "" : cur;
      if (s.type === "date") input.min = new Date().toISOString().slice(0, 10);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && s.type !== "textarea") { e.preventDefault(); next(); } });
      return { el: input, get: () => input.value.trim(), focus: () => input.focus() };
    }
    function validate(s, v) {
      const empty = v == null || v === "" || (Array.isArray(v) && !v.length);
      if (empty) return s.optional ? null : (s.type === "choice" || s.type === "items" ? "Faites un choix pour continuer." : "Ce champ est nécessaire pour continuer.");
      if (s.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "Cette adresse email semble invalide.";
      if (s.type === "number" && (!(Number(v) >= (s.min || 1)) || (s.max && Number(v) > s.max))) return "Indiquez un nombre entre " + (s.min || 1) + " et " + (s.max || 99) + ".";
      if (s.type === "date" && v < new Date().toISOString().slice(0, 10)) return "Choisissez une date à venir.";
      return null;
    }
    function next() {
      const s = visibleSteps()[index];
      const v = control.get();
      const err = validate(s, v);
      if (err) { errBox.textContent = err; errBox.hidden = false; return; }
      values[s.key] = v;
      index++;
      render();
    }
    function back() { if (index > 0) { index--; errorMsg = ""; render(); } }
    async function submit() {
      busy = true; errorMsg = ""; render();
      const res = await cfg.submit(values);
      busy = false;
      if (res && res.ok !== false) { result = res; phase = "done"; } else errorMsg = friendly(res);
      render();
    }
    function render() {
      const vs = visibleSteps();
      box.innerHTML = "";
      box.appendChild(h("div", { class: "modal-head" },
        h("div", null, h("h2", null, cfg.title), cfg.subtitle ? h("p", null, cfg.subtitle) : null),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Fermer", onclick: close }, ico("x", 18))));
      if (phase !== "done") {
        const bar = h("div", { class: "steps-bar" });
        for (let i = 0; i < vs.length + 1; i++) bar.appendChild(h("i", { class: i <= index ? "on" : "" }));
        box.appendChild(bar);
      }
      const body = h("div", { class: "modal-body" });
      const foot = h("div", { class: "modal-foot" });
      box.appendChild(body); box.appendChild(foot);

      if (phase === "done") {
        body.appendChild(h("div", { class: "result" }, h("div", { class: "result-ico" }, ico("check", 26)),
          h("h3", null, cfg.successTitle || "C'est envoyé"),
          h("p", null, typeof cfg.successText === "function" ? cfg.successText(result) : cfg.successText || (result && result.message) || "Votre demande a bien été enregistrée.")));
        foot.appendChild(h("span"));
        foot.appendChild(h("button", { class: "btn primary", type: "button", onclick: () => { close(); if (cfg.onDone) cfg.onDone(result); } }, "Terminer"));
        return;
      }
      if (index >= vs.length) {
        body.appendChild(h("h3", { class: "q" }, "Vérifiez avant d'envoyer"));
        const dl = h("dl", { class: "review" });
        vs.forEach((s) => { dl.appendChild(h("dt", null, s.summary || s.label)); dl.appendChild(h("dd", null, display(s, values[s.key]))); });
        body.appendChild(dl);
        if (errorMsg) body.appendChild(h("p", { class: "form-error" }, errorMsg));
        foot.appendChild(h("button", { class: "btn ghost", type: "button", onclick: () => { index = vs.length - 1; errorMsg = ""; render(); } }, "Modifier"));
        foot.appendChild(h("button", { class: "btn primary", type: "button", disabled: busy, onclick: submit }, busy ? "Envoi…" : cfg.submitLabel || "Confirmer"));
        return;
      }
      const s = vs[index];
      body.appendChild(h("h3", { class: "q" }, s.label));
      if (s.hint) body.appendChild(h("p", { class: "hint" }, s.hint));
      control = buildControl(s);
      body.appendChild(control.el);
      errBox = h("p", { class: "form-error", hidden: true });
      body.appendChild(errBox);
      foot.appendChild(h("button", { class: "btn ghost", type: "button", disabled: index === 0, onclick: back }, "Retour"));
      foot.appendChild(h("button", { class: "btn primary", type: "button", onclick: next }, index === vs.length - 1 ? "Vérifier" : "Continuer"));
      if (control.focus) setTimeout(control.focus, 40);
    }
    render();
  }

  /* ── Assistant IA ────────────────────────────────────────────── */
  const chat = { built: false, busy: false, history: [] };
  const ACTION_LABEL = {
    orders_lookup: "Commande consultée", returns_create: "Retour enregistré", returns_status: "Retours consultés",
    booking_request: "Demande enregistrée", booking_confirm: "Réservation confirmée", lead_capture: "Coordonnées transmises",
    handoff_human: "Transmis à l'équipe", form_submit: "Demande enregistrée",
  };
  const aiOn = () => !(state.health && state.health.configured && state.health.configured.ai === false);
  function inline(text) {
    const out = [];
    const re = /\*\*(.+?)\*\*/g;
    let last = 0, m;
    while ((m = re.exec(text))) { if (m.index > last) out.push(text.slice(last, m.index)); out.push(h("strong", null, m[1])); last = re.lastIndex; }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
  function md(text) {
    const box = h("div", { class: "md" });
    let list = null;
    String(text).split("\n").forEach((line) => {
      const li = line.match(/^\s*[-*•]\s+(.*)$/);
      if (li) { if (!list) { list = h("ul"); box.appendChild(list); } list.appendChild(h("li", null, inline(li[1]))); }
      else { list = null; if (line.trim()) box.appendChild(h("p", null, inline(line))); }
    });
    return box;
  }
  function addMsg(role, text, actions) {
    const el = h("div", { class: "msg " + role }, role === "agent" ? md(text) : text);
    const done = (actions || []).filter((a) => a.result && a.result.ok !== false && ACTION_LABEL[a.tool]);
    if (role === "agent" && done.length) el.appendChild(h("div", { class: "acts" }, done.map((a) => h("span", { class: "act" }, ico("check", 13), ACTION_LABEL[a.tool]))));
    chat.thread.appendChild(el);
    chat.thread.scrollTop = chat.thread.scrollHeight;
    return el;
  }
  async function ask(text) {
    text = String(text || "").trim();
    if (!text || chat.busy) return;
    chat.chips.hidden = true;
    addMsg("user", text);
    if (!aiOn()) { addMsg("agent", "L'assistant n'est pas encore activé. En attendant, la page Aide répond aux questions fréquentes."); return; }
    chat.busy = true;
    const typing = h("div", { class: "msg agent typing", "aria-label": "L'assistant écrit" }, h("i"), h("i"), h("i"));
    chat.thread.appendChild(typing);
    chat.thread.scrollTop = chat.thread.scrollHeight;
    const res = await api("/chat", { method: "POST", body: { message: text, history: chat.history.slice(-10) } });
    typing.remove();
    chat.busy = false;
    if (!res.reply) { addMsg("agent", friendly(res.error ? res : { message: "Je ne parviens pas à répondre pour le moment. Réessayez dans un instant." })); return; }
    addMsg("agent", res.reply, res.actions);
    chat.history.push({ role: "user", content: text }, { role: "assistant", content: res.reply });
  }
  function buildAssistant() {
    const thread = h("div", { class: "a-thread", "aria-live": "polite" });
    const input = h("input", { type: "text", placeholder: "Posez votre question…", autocomplete: "off", "aria-label": "Votre message" });
    const form = h("form", { class: "a-form", onsubmit: (e) => { e.preventDefault(); const t = input.value; input.value = ""; ask(t); } },
      input, h("button", { type: "submit", class: "a-send", "aria-label": "Envoyer" }, ico("send", 18)));
    const chips = h("div", { class: "a-chips" }, APP.suggestions.slice(0, 3).map((s) => h("button", { type: "button", class: "chip", onclick: () => ask(s) }, s)));
    const panel = h("section", { class: "a-panel", "aria-label": "Assistant" },
         h("div", { class: "a-head" },
        APP.agentAvatar ? h("img", { class: "logo-img", src: APP.agentAvatar, alt: "", style: "width:30px;height:30px;border-radius:50%;object-fit:cover" }) : h("span", { class: "mark" }, initial(APP.agentName || APP.name)),
        h("div", { class: "grow" }, h("strong", null, APP.agentName || APP.name), h("small", null, h("i", { class: "live" }), "Assistant en ligne")),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Fermer l'assistant", onclick: closeAssistant }, ico("x", 18))),
      thread, chips, form);
    const fab = h("button", { class: "a-fab", type: "button", onclick: () => openAssistant() }, ico("spark", 18), "Assistant");
    $("#assistant-root").append(fab, panel);
    Object.assign(chat, { panel, thread, input, chips, fab, built: true });
  }
  function openAssistant(text) {
    if (!chat.built) buildAssistant();
    chat.panel.classList.add("open");
    chat.fab.hidden = true;
    if (!chat.thread.children.length) {
      addMsg("agent", APP.greeting);
      if (!aiOn()) addMsg("agent", "L'assistant sera actif dès que la clé IA aura été renseignée. La page Aide répond déjà aux questions fréquentes.");
    }
    chat.input.disabled = !aiOn();
    if (text && String(text).trim()) ask(text); else setTimeout(() => chat.input.focus(), 50);
  }
  function closeAssistant() { chat.panel.classList.remove("open"); chat.fab.hidden = false; }
`;

/** Compilateur de blocs — REMPLACE l'ancien SECTION_RENDERERS figé de v3.
 *  Chaque bloc {type, variant, props} vient d'un arbre déjà validé côté
 *  serveur (sanitizeBlockTree) : aucune valeur n'est injectée telle quelle
 *  sans passer par h(), donc pas de risque d'injection HTML.
 *
 *  `HERO_SIDE_OVERRIDE` permet à l'accueil d'injecter, dans le premier
 *  bloc "hero" (quelle que soit sa variante), le VRAI panneau d'action
 *  fonctionnel (suivi de colis / réservation / question libre — voir
 *  actionPanel() dans CLIENT_HOME), plutôt qu'un panneau générique. Les
 *  pages génériques (sans panneau fonctionnel) gardent le panneau par
 *  défaut. */
const CLIENT_BLOCKS = String.raw`
    let HERO_SIDE_OVERRIDE = null;
  const DM_ = (APP.design && APP.design.media) || {};
  const photoOr = (fallback) => (DM_.aboutImage && DM_.showPhotos !== false ? h("img", { class: "media-img", src: DM_.aboutImage, alt: "" }) : fallback);
  const BLOCK_RENDERERS = {
    hero(b) {
      const inner = [
        b.props.eyebrow ? h("p", { class: "small muted", style: "text-transform:uppercase;letter-spacing:.06em" }, b.props.eyebrow) : null,
        h("h1", null, b.props.title),
        h("p", { class: "lead" }, b.props.lead),
        b.props.bullets ? h("ul", { class: "ticks", style: "margin-top:16px" }, b.props.bullets.map((t) => h("li", null, ico("check", 16), t))) : null,
      ];
      const side = HERO_SIDE_OVERRIDE;
      if (b.variant === "split") return h("section", { class: "hero" }, h("div", { class: "wrap hero-in" }, h("div", null, inner), side || h("div", { class: "panel" }, h("h2", null, APP.name), h("p", { class: "muted" }, APP.tagline || ""))));
      if (b.variant === "media-right") return h("section", { class: "block", style: "padding-top:56px" }, h("div", { class: "wrap hero-in" }, h("div", null, inner), side || h("div", { class: "card pad", style: "aspect-ratio:4/3;display:grid;place-items:center" }, ico("spark", 40))));
      return h("section", { class: "hero" }, h("div", { class: "wrap", style: "max-width:760px;text-align:center;margin:0 auto" }, inner, side ? h("div", { style: "margin-top:28px;max-width:420px;margin-left:auto;margin-right:auto;text-align:left" }, side) : null));
    },
    "stat-band"(b) {
      return h("section", { class: "block" }, h("div", { class: "wrap" }, h("div", { class: "stats", style: b.variant === "row-4" ? "grid-template-columns:repeat(4,1fr)" : "" },
        b.props.stats.map((s) => h("div", { class: "card stat" }, h("span", { class: "muted" }, s.label), h("b", null, s.value))))));
    },
    "split-media"(b) {
      const text = h("div", null, h("h2", null, b.props.title), h("p", { class: "sub" }, b.props.text),
        b.props.points ? h("ul", { class: "ticks" }, b.props.points.map((p) => h("li", null, ico("check", 16), p))) : null);
          const media = photoOr(h("div", { class: "card pad", style: "aspect-ratio:var(--ratio);display:grid;place-items:center;border-radius:var(--img-r)" }, ico("tag", 36)));
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
  function renderBlockTree(blocks, opts) {
    const wrap = h("div", null);
    const heroSide = (opts && opts.heroSide) || null;
    (blocks || []).forEach((b, i) => {
      HERO_SIDE_OVERRIDE = (i === 0 && b.type === "hero") ? heroSide : null;
      const n = renderBlock(b);
      if (n) wrap.appendChild(n);
    });
    HERO_SIDE_OVERRIDE = null;
    return wrap;
  }
`;

const CLIENT_HELP = String.raw`
  /* ── Aide, FAQ, contact ──────────────────────────────────────── */
  function faqList(items) {
    return h("div", { class: "faq" }, items.map((f) => h("details", null,
      h("summary", null, h("span", null, f.title), ico("chevron", 18)), h("div", { class: "a" }, md(f.answer)))));
  }
  function startContact() {
    openWizard({
      title: "Nous écrire", subtitle: "Un membre de l'équipe vous répond.",
      initial: state.customer ? { name: state.customer.name, email: state.customer.email } : {},
      steps: [
        { key: "name", summary: "Nom", label: "Comment vous appelez-vous ?", type: "text", autocomplete: "name" },
        { key: "email", summary: "Email", label: "Quelle est votre adresse email ?", hint: "Nous vous répondrons à cette adresse.", type: "email", autocomplete: "email" },
        { key: "phone", summary: "Téléphone", label: "Un numéro pour vous joindre ?", hint: "Facultatif.", type: "tel", optional: true },
        { key: "message", summary: "Message", label: "Que pouvons-nous faire pour vous ?", type: "textarea" },
      ],
      submitLabel: "Envoyer le message",
      submit: (v) => api("/contact", { method: "POST", body: v }),
      successTitle: "Message envoyé",
    });
  }
  route("/aide", { title: "Aide", render: async () => {
    const res = await api("/knowledge");
    const all = (res.ok && res.sections) || [];
    const holder = h("div");
    const search = h("input", { type: "search", placeholder: "Rechercher dans l'aide…", "aria-label": "Rechercher dans l'aide" });
    const paint = () => {
      const q = search.value.trim().toLowerCase();
      const list = q ? all.filter((f) => (f.title + " " + f.answer).toLowerCase().indexOf(q) >= 0) : all;
      holder.innerHTML = "";
      holder.appendChild(list.length ? faqList(list) : h("div", { class: "empty" }, h("h3", null, all.length ? "Aucun résultat" : "Aucune question pour le moment"), h("p", null, "Posez votre question à l'assistant ou écrivez-nous.")));
    };
    search.addEventListener("input", paint);
    paint();
    return h("div", { class: "wrap page" },
      h("div", { class: "page-head" }, h("div", null, h("h1", null, "Aide"), h("p", { class: "muted" }, "Les réponses aux questions les plus fréquentes."))),
      h("div", { class: "tools" }, h("div", { class: "search" }, ico("search", 18), search)),
      holder,
      h("div", { class: "section-title" }, h("h2", null, "Toujours pas de réponse ?")),
      h("div", { class: "quick" },
        h("button", { class: "btn primary", type: "button", onclick: () => openAssistant() }, ico("spark", 16), "Demander à l'assistant"),
        h("button", { class: "btn", type: "button", onclick: startContact }, ico("mail", 16), "Nous écrire")));
  } });
`;

const CLIENT_AUTH = String.raw`
  /* ── Comptes ─────────────────────────────────────────────────── */
  function authShell(title, sub, form, alt) {
    return h("section", { class: "auth" },
      h("aside", { class: "auth-aside" }, h("div", null, h("span", { class: "mark lg" }, initial(APP.name)),
        h("h2", null, APP.tagline || APP.name), h("ul", { class: "ticks" }, APP.benefits.map((b) => h("li", null, ico("check", 16), b))))),
      h("div", { class: "auth-main" }, h("div", { class: "auth-card" }, h("h1", null, title), h("p", { class: "muted", style: "margin-top:6px" }, sub), form, alt)));
  }
  function authForm(kind, query) {
    const register = kind === "register";
    const name = h("input", { type: "text", autocomplete: "name", required: true, placeholder: "Camille Martin" });
    const email = h("input", { type: "email", autocomplete: "email", required: true, placeholder: "vous@exemple.fr" });
    const pass = h("input", { type: "password", autocomplete: register ? "new-password" : "current-password", required: true, minlength: "8" });
    const err = h("p", { class: "form-error", hidden: true });
        const label = register ? (AUTH_COPY.registerCta || "Créer mon compte") : (AUTH_COPY.loginCta || "Se connecter");
    const btn = h("button", { class: "btn primary lg block", type: "submit" }, label);
    return h("form", { class: "form", onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true; btn.textContent = "Un instant…"; err.hidden = true;
      const r = await api(register ? "/auth/register" : "/auth/login", { method: "POST", body: register ? { name: name.value, email: email.value, password: pass.value } : { email: email.value, password: pass.value } });
      btn.disabled = false; btn.textContent = label;
      if (!r.ok) { err.textContent = friendly(r); err.hidden = false; return; }
      setSession(r.token, r.customer);
      go(query.next || "/compte");
    } }, register ? field("Nom complet", name) : null, field("Adresse email", email),
      field("Mot de passe", pass, register ? "8 caractères minimum." : null), err, btn);
  }
   const AUTH_COPY = APP.authCopy || {};
  route("/connexion", { title: "Connexion", guestOnly: true, render: ({ query }) => authShell(
    AUTH_COPY.loginTitle || "Content de vous revoir",
    AUTH_COPY.loginSub || "Connectez-vous pour retrouver votre espace personnel.",
    authForm("login", query),
    h("p", { class: "alt" }, "Pas encore de compte ? ", h("a", { href: "#/inscription" + (query.next ? "?next=" + encodeURIComponent(query.next) : "") }, "Créer un compte"))) });
  route("/inscription", { title: "Créer un compte", guestOnly: true, render: ({ query }) => authShell(
    AUTH_COPY.registerTitle || "Créer votre compte",
    AUTH_COPY.registerSub || "Quelques secondes suffisent pour créer votre espace personnel.",
    authForm("register", query),
    h("p", { class: "alt" }, "Déjà inscrit ? ", h("a", { href: "#/connexion" + (query.next ? "?next=" + encodeURIComponent(query.next) : "") }, "Se connecter"))) });
  route("/compte", { title: "Mon espace", auth: true, render: async () => {
    const [o, r] = await Promise.all([M.orders ? api("/orders") : null, M.returns ? api("/returns") : null]);
    const orders = (o && o.ok && o.orders) || [];
    const rets = (r && r.ok && r.returns) || [];
    const page = h("div", { class: "wrap page" });
    const quick = h("div", { class: "quick" });
    if (M.returns) quick.appendChild(h("button", { class: "btn", type: "button", onclick: () => startReturn() }, ico("undo", 16), "Nouveau retour"));
    quick.appendChild(h("button", { class: "btn soft", type: "button", onclick: () => openAssistant() }, ico("spark", 16), "Poser une question"));
    quick.appendChild(h("button", { class: "btn", type: "button", onclick: startContact }, ico("mail", 16), "Nous écrire"));
    page.appendChild(h("div", { class: "page-head" },
      h("div", null, h("h1", null, "Bonjour, " + firstName(state.customer.name)), h("p", { class: "muted" }, state.customer.email)), quick));
    if (M.orders) {
      if (!o.ok) { page.appendChild(errorCard(o)); return page; }
      const active = orders.filter((x) => ["processing", "shipped", "out_for_delivery"].indexOf(x.status) >= 0).length;
      const stats = h("div", { class: "stats" },
        h("div", { class: "card stat" }, h("span", { class: "muted" }, "Commandes en cours"), h("b", null, String(active))),
        h("div", { class: "card stat" }, h("span", { class: "muted" }, "Commandes livrées"), h("b", null, String(orders.filter((x) => x.status === "delivered").length))));
      if (M.returns) stats.appendChild(h("div", { class: "card stat" }, h("span", { class: "muted" }, "Retours en cours"), h("b", null, String(rets.filter((x) => ["requested", "approved", "received"].indexOf(x.status) >= 0).length))));
      page.appendChild(stats);
      page.appendChild(h("div", { class: "section-title", style: "margin-top:0" }, h("h2", null, "Dernières commandes"), h("a", { class: "btn ghost sm", href: "#/commandes" }, "Tout voir")));
      page.appendChild(orders.length ? h("div", { class: "card rows" }, orders.slice(0, 3).map(orderRow)) : emptyOrders());
    } else {
      page.appendChild(h("div", { class: "notice" }, ico("user", 20), h("div", null, h("strong", null, "Votre espace est prêt"), h("p", null, "Vos échanges avec l'assistant et vos demandes sont rattachés à ce compte."))));
    }
    return page;
  } });
`;

const CLIENT_ORDERS = String.raw`
  /* ── Commandes et suivi ──────────────────────────────────────── */
  const STEPS = [["placed", "Commande confirmée"], ["processing", "En préparation"], ["shipped", "Expédiée"], ["out_for_delivery", "En cours de livraison"], ["delivered", "Livrée"]];
  const REACHED = { processing: 1, shipped: 2, out_for_delivery: 3, delivered: 4 };

  function timeline(o) {
    if (o.status === "cancelled") return h("div", { class: "notice warn", style: "margin-top:16px" }, ico("help", 20), h("div", null, h("strong", null, "Commande annulée"), h("p", null, "Contactez-nous si vous pensez qu'il s'agit d'une erreur.")));
    const idx = REACHED[o.status] == null ? 1 : REACHED[o.status];
    const when = {};
    (o.events || []).forEach((e) => { when[e.status] = e; });
    if (!when.placed) when.placed = { occurredAt: o.placedAt, label: "" };
    return h("ol", { class: "timeline" }, STEPS.map((s, i) => {
      const st = i < idx || (i === idx && idx === 4) ? "done" : i === idx ? "current" : "";
      const ev = when[s[0]];
      return h("li", { class: st }, h("span", { class: "dot" }, st === "done" ? ico("check", 12) : null),
        s[1], ev && st ? h("small", null, [fmtWhen(ev.occurredAt), ev.location ? " · " + ev.location : ""].join("")) : null);
    }));
  }

  function orderView(o, opts) {
    const guest = !!(opts && opts.guest);
    const link = safeUrl(o.trackingUrl);
    const actions = h("div", { class: "quick" });
    if (M.returns && !guest && o.status === "delivered") actions.appendChild(h("button", { class: "btn", type: "button", onclick: () => startReturn(o.ref) }, ico("undo", 16), "Demander un retour"));
    actions.appendChild(h("button", { class: "btn soft", type: "button", onclick: () => openAssistant("J'ai une question sur ma commande " + o.ref) }, ico("spark", 16), "Une question sur cette commande"));
    if (guest && M.returns) actions.appendChild(h("a", { class: "btn", href: "#/inscription" }, "Créer un compte pour gérer un retour"));
    return h("div", { class: "order-grid" },
      h("div", { class: "card pad" },
        h("div", { class: "card-head" }, h("h2", null, "Suivi"), pill(o.status)),
        o.eta && o.status !== "delivered" && o.status !== "cancelled" ? h("p", { class: "eta" }, ico("clock", 16), "Livraison estimée : ", h("strong", null, fmtDate(o.eta))) : null,
        timeline(o),
        o.carrier ? h("p", { class: "carrier" }, "Transporteur : ", h("strong", null, o.carrier), o.trackingNumber ? " · n° " + o.trackingNumber : "", link ? [" · ", h("a", { href: link, target: "_blank", rel: "noopener" }, "Suivre chez le transporteur")] : null) : null),
      h("div", { class: "stack" },
        h("div", { class: "card pad" }, h("h2", null, "Articles"),
          h("ul", { class: "lines" }, (o.items || []).map((i) => h("li", null, h("span", null, i.name, h("small", null, "Quantité : " + i.qty)), h("span", null, money(i.unitPrice * i.qty, o.currency))))),
          h("div", { class: "total" }, h("span", null, "Total"), h("strong", null, money(o.total, o.currency)))),
        o.shippingAddress ? h("div", { class: "card pad" }, h("h2", null, "Livraison"), h("p", { class: "muted", style: "margin-top:6px" }, o.shippingAddress)) : null,
        actions));
  }

  function orderRow(o) {
    const names = (o.items || []).map((i) => i.name);
    return h("a", { class: "row", href: "#/commande/" + encodeURIComponent(o.ref) },
      h("span", { class: "thumb" }, ico("package", 20)),
      h("div", { class: "grow" }, h("strong", null, "Commande " + o.ref), h("small", null, fmtDate(o.placedAt) + " · " + (names.slice(0, 2).join(", ") + (names.length > 2 ? " +" + (names.length - 2) : "")))),
      h("div", { class: "end" }, pill(o.status), h("span", { class: "small muted" }, money(o.total, o.currency))),
      h("span", { class: "chev" }, ico("chevron", 18)));
  }
  const emptyOrders = () => h("div", { class: "card empty" }, h("h3", null, "Aucune commande pour le moment"), h("p", null, "Vos commandes apparaîtront ici dès qu'elles seront enregistrées avec l'adresse " + (state.customer ? state.customer.email : "de votre compte") + "."));

  function trackCard() {
    const ref = h("input", { type: "text", placeholder: "CMD-48213", autocomplete: "off", "aria-label": "Numéro de commande" });
    const email = h("input", { type: "email", placeholder: "vous@exemple.fr", autocomplete: "email", "aria-label": "Email" });
    return h("form", { class: "panel", onsubmit: (e) => { e.preventDefault(); go("/suivi?ref=" + encodeURIComponent(ref.value.trim()) + "&email=" + encodeURIComponent(email.value.trim())); } },
      h("h2", null, "Où en est ma commande ?"), h("p", { class: "muted" }, "Saisissez votre numéro de commande et l'email utilisé."),
      field("Numéro de commande", ref), field("Email", email),
      h("button", { class: "btn primary lg block", type: "submit" }, "Suivre ma commande"),
      state.customer ? h("a", { class: "panel-link", href: "#/commandes" }, "Voir toutes mes commandes") : h("a", { class: "panel-link", href: "#/connexion" }, "Se connecter pour tout retrouver"));
  }

  route("/suivi", { title: "Suivre un colis", render: ({ query }) => {
    const ref = h("input", { type: "text", placeholder: "CMD-48213", autocomplete: "off", value: query.ref || "" });
    const email = h("input", { type: "email", placeholder: "vous@exemple.fr", autocomplete: "email", value: query.email || "" });
    const out = h("div");
    async function run() {
      const r = ref.value.trim(), e = email.value.trim();
      if (!r || !e) { toast("Indiquez votre numéro de commande et votre email."); return; }
      out.innerHTML = "";
      out.appendChild(h("div", { class: "skeleton" }));
      const res = await api("/track", { method: "POST", body: { ref: r, email: e } });
      out.innerHTML = "";
      if (!res.ok) { out.appendChild(h("div", { style: "margin-top:20px" }, errorCard(res))); return; }
      out.appendChild(h("div", { class: "order-head" }, h("h2", null, "Commande " + res.order.ref), h("p", { class: "muted" }, "Passée le " + fmtDate(res.order.placedAt))));
      out.appendChild(orderView(res.order, { guest: true }));
    }
    const page = h("div", { class: "wrap page" },
      h("div", { class: "page-head" }, h("div", null, h("h1", null, "Suivre un colis"), h("p", { class: "muted" }, "Sans compte : votre numéro de commande et l'email de l'achat suffisent."))),
      h("form", { class: "card track-form", onsubmit: (e) => { e.preventDefault(); run(); } },
        field("Numéro de commande", ref), field("Email", email), h("button", { class: "btn primary", type: "submit", style: "height:42px" }, "Suivre")),
      out);
    if (query.ref && query.email) setTimeout(run, 0);
    return page;
  } });

  route("/commandes", { title: "Mes commandes", auth: true, render: async () => {
    const res = await api("/orders");
    const page = h("div", { class: "wrap page" }, h("div", { class: "page-head" }, h("div", null, h("h1", null, "Mes commandes"), h("p", { class: "muted" }, "Cliquez sur une commande pour voir son suivi détaillé."))));
    if (!res.ok) { page.appendChild(errorCard(res)); return page; }
    const filters = [["all", "Toutes", () => true], ["open", "En cours", (o) => ["processing", "shipped", "out_for_delivery"].indexOf(o.status) >= 0], ["done", "Livrées", (o) => o.status === "delivered"]];
    let current = "all";
    const chips = h("div", { class: "filters", style: "margin-bottom:16px" });
    const list = h("div");
    const paint = () => {
      chips.innerHTML = "";
      filters.forEach((f) => chips.appendChild(h("button", { type: "button", class: "chip" + (current === f[0] ? " on" : ""), onclick: () => { current = f[0]; paint(); } }, f[1])));
      const rows = res.orders.filter(filters.find((f) => f[0] === current)[2]);
      list.innerHTML = "";
      list.appendChild(rows.length ? h("div", { class: "card rows" }, rows.map(orderRow)) : res.orders.length ? h("div", { class: "card empty" }, h("h3", null, "Aucune commande dans cette catégorie")) : emptyOrders());
    };
    paint();
    page.appendChild(chips); page.appendChild(list);
    return page;
  } });

  route("/commande/:ref", { title: "Commande", auth: true, render: async ({ params }) => {
    const res = await api("/orders/" + encodeURIComponent(params.ref));
    const page = h("div", { class: "wrap page" }, h("a", { class: "back", href: "#/commandes" }, ico("arrow", 16), "Mes commandes"));
    if (!res.ok) { page.appendChild(errorCard(res)); return page; }
    page.appendChild(h("div", { class: "page-head" }, h("div", null, h("h1", null, "Commande " + res.order.ref), h("p", { class: "muted" }, "Passée le " + fmtDate(res.order.placedAt)))));
    page.appendChild(orderView(res.order));
    return page;
  } });
`;

const CLIENT_RETURNS = String.raw`
  /* ── Retours ─────────────────────────────────────────────────── */
  const REASONS = [["too_small", "Trop petit"], ["too_big", "Trop grand"], ["defective", "Article défectueux ou abîmé"], ["not_as_described", "Ne correspond pas à la description"], ["wrong_item", "Erreur dans ma commande"], ["other", "Autre raison"]];
  const RESOLUTIONS = [["refund", "Remboursement", "Sur votre moyen de paiement initial."], ["exchange", "Échange", "Un autre article ou une autre taille."], ["credit", "Avoir", "Un crédit pour une prochaine commande."]];
  const labelOf = (list, code) => { const x = list.find((r) => r[0] === code); return x ? x[1] : code; };

  async function startReturn(presetRef) {
    const r = await api("/orders");
    if (!r.ok) { toast(friendly(r)); return; }
    const eligible = r.orders.filter((o) => o.status === "delivered");
    if (!eligible.length) { toast("Aucune commande livrée n'est éligible à un retour pour le moment."); return; }
    const preset = presetRef && eligible.some((o) => o.ref === presetRef) ? presetRef : null;
    const days = state.health && state.health.policy ? state.health.policy.returnWindowDays : 30;
    openWizard({
      title: "Demander un retour", subtitle: "Quelques questions, et c'est envoyé.",
      initial: preset ? { order: preset } : {},
      steps: [
        { key: "order", summary: "Commande", label: "Quelle commande est concernée ?", type: "choice", skip: () => !!preset,
          options: () => eligible.map((o) => ({ value: o.ref, label: "Commande " + o.ref, hint: fmtDate(o.placedAt) + " · " + o.items.map((i) => i.name).slice(0, 2).join(", ") })) },
        { key: "items", summary: "Articles", label: "Quels articles souhaitez-vous retourner ?", hint: "Retours acceptés jusqu'à " + days + " jours après la livraison.", type: "items",
          options: (v) => ((eligible.find((o) => o.ref === v.order) || { items: [] }).items).map((i) => ({ sku: i.sku, name: i.name, max: i.qty, sub: money(i.unitPrice) })) },
        { key: "reason", summary: "Motif", label: "Pourquoi retournez-vous ces articles ?", type: "choice", options: () => REASONS.map((x) => ({ value: x[0], label: x[1] })) },
        { key: "resolution", summary: "Solution", label: "Que souhaitez-vous en échange ?", type: "choice", options: () => RESOLUTIONS.map((x) => ({ value: x[0], label: x[1], hint: x[2] })) },
        { key: "comment", summary: "Précision", label: "Un détail à nous préciser ?", hint: "Facultatif.", type: "textarea", optional: true },
      ],
      submitLabel: "Envoyer ma demande",
      submit: (v) => api("/returns", { method: "POST", body: { orderRef: v.order, items: v.items.map((i) => ({ sku: i.sku, qty: i.qty })), reason: v.reason, resolution: v.resolution, comment: v.comment } }),
      successTitle: "Demande de retour enregistrée",
      successText: (res) => "Votre demande " + res.return.ref + " est enregistrée. Suivez son avancement dans la rubrique Retours.",
      onDone: () => { if (parseHash().path === "/retours") render(); else go("/retours"); },
    });
  }

  route("/retours", { title: "Retours", auth: true, render: async () => {
    const res = await api("/returns");
    const page = h("div", { class: "wrap page" }, h("div", { class: "page-head" },
      h("div", null, h("h1", null, "Retours"), h("p", { class: "muted" }, "Suivez vos demandes ou lancez-en une nouvelle.")),
      h("button", { class: "btn primary", type: "button", onclick: () => startReturn() }, ico("undo", 16), "Nouveau retour")));
    if (!res.ok) { page.appendChild(errorCard(res)); return page; }
    page.appendChild(res.returns.length
      ? h("div", { class: "card rows" }, res.returns.map((x) => h("div", { class: "row" },
          h("span", { class: "thumb" }, ico("undo", 20)),
          h("div", { class: "grow" }, h("strong", null, "Retour " + x.ref), h("small", null, "Commande " + x.orderRef + " · " + fmtDate(x.createdAt)),
            h("small", null, x.items.map((i) => i.qty + " × " + i.name).join(", ") + " · " + labelOf(REASONS, x.reason) + " · " + labelOf(RESOLUTIONS, x.resolution))),
          h("div", { class: "end" }, pill(x.status)))))
      : h("div", { class: "card empty" }, h("h3", null, "Aucune demande de retour"), h("p", null, "Un article ne convient pas ? Lancez un retour en quelques clics.")));
    return page;
  } });
`;

const CLIENT_CATALOG = String.raw`
  /* ── Catalogue ───────────────────────────────────────────────── */
  route("/catalogue", { title: APP.labels.catalog, render: async () => {
    let cat = "", timer = null;
    const search = h("input", { type: "search", placeholder: "Rechercher…", "aria-label": "Rechercher" });
    const chips = h("div", { class: "filters" });
    const grid = h("div");
    let categories = null;
    async function load() {
      const res = await api("/catalog?search=" + encodeURIComponent(search.value.trim()) + "&category=" + encodeURIComponent(cat));
      grid.innerHTML = "";
      if (!res.ok) { grid.appendChild(errorCard(res)); return; }
      if (!categories) categories = res.categories || [];
      paintChips();
      grid.appendChild(res.items.length
        ? h("div", { class: "products" }, res.items.map((it) => h("div", { class: "card product" },
            it.category ? h("span", { class: "tag" }, it.category) : null, h("h3", null, it.name), it.description ? h("p", null, it.description) : null,
            h("div", { class: "foot" }, it.price != null ? h("span", { class: "price" }, money(it.price)) : h("span"),
              h("button", { class: "btn sm", type: "button", onclick: () => openAssistant("Parle-moi de « " + it.name + " »") }, ico("chat", 14), "Poser une question")))))
        : h("div", { class: "empty" }, h("h3", null, "Aucun résultat"), h("p", null, "Essayez un autre mot-clé ou une autre catégorie.")));
    }
    function paintChips() {
      chips.innerHTML = "";
      if (!categories || !categories.length) return;
      [""].concat(categories).forEach((c) => chips.appendChild(h("button", { type: "button", class: "chip" + (cat === c ? " on" : ""), onclick: () => { cat = c; load(); } }, c || "Tout")));
    }
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 220); });
    const page = h("div", { class: "wrap page" },
      h("div", { class: "page-head" }, h("div", null, h("h1", null, APP.labels.catalog), h("p", { class: "muted" }, "Recherchez, filtrez, et posez vos questions sur n'importe quelle fiche."))),
      h("div", { class: "tools" }, h("div", { class: "search" }, ico("search", 18), search)), chips, h("div", { style: "height:16px" }), grid);
    await load();
    return page;
  } });
`;

const CLIENT_BOOKING = String.raw`
  /* ── Réservation ─────────────────────────────────────────────── */
  function startBooking() {
    openWizard({
      title: APP.booking.title, subtitle: "Quelques questions, et c'est fait.",
      initial: state.customer ? { name: state.customer.name } : {},
      steps: APP.booking.fields,
      submitLabel: "Envoyer",
      submit: (v) => api("/booking", { method: "POST", body: v }),
      successTitle: "C'est noté",
    });
  }
  route("/reservation", { title: APP.booking.title, render: ({ query }) => {
    if (query.open !== "0") setTimeout(startBooking, 150);
    return h("div", { class: "wrap page" },
      h("div", { class: "page-head" }, h("div", null, h("h1", null, APP.booking.title), h("p", { class: "muted" }, "Répondez à quelques questions, une à la fois."))),
      h("ol", { class: "steps", style: "margin-bottom:28px" }, APP.steps.map((s) => h("li", null, s))),
      h("button", { class: "btn primary lg", type: "button", onclick: startBooking }, ico("calendar", 18), APP.booking.title));
  } });
`;

/** Accueil : composé par blocs (voir CLIENT_BLOCKS). Le panneau d'action
 *  réel (suivi de colis / réservation / question libre) dépend des VRAIS
 *  modules métier du projet, pas d'un texte générique : il est injecté
 *  dans le premier bloc "hero" via renderBlockTree(blocks, { heroSide }). */
const CLIENT_HOME = String.raw`
  function actionPanel() {
    if (M.orders) return trackCard();
    if (M.booking) {
      return h("div", { class: "panel" }, h("h2", null, APP.booking.title), h("p", { class: "muted" }, "Quelques questions, et c'est fait."),
        h("button", { class: "btn primary lg block", type: "button", onclick: startBooking }, APP.booking.title));
    }
    const input = h("input", { type: "text", placeholder: "Votre question…", "aria-label": "Votre question" });
    return h("form", { class: "panel", onsubmit: (e) => { e.preventDefault(); const t = input.value; input.value = ""; openAssistant(t); } },
      h("h2", null, "Une question ?"), h("p", { class: "muted" }, "L'assistant répond tout de suite."), input,
      h("button", { class: "btn primary lg block", type: "submit" }, "Demander à l'assistant"));
  }

  route("/", { title: "", render: async () => {
    const page = renderBlockTree(APP.homeBlocks, { heroSide: actionPanel() });
    const DM = DSG.media || {};
    const first = page.firstElementChild;
    if (first && DM.heroImage && DM.heroMode === "background" && DM.showPhotos !== false) {
      first.classList.add("hero-bg");
      first.style.setProperty("--hero-img", 'url("' + DM.heroImage + '")');
    }
    const faq = sectionOn("faq") ? await api("/knowledge") : { ok: false };
    const items = (faq.ok && faq.sections) || [];
    if (items.length && !(DSG.content && DSG.content.faq && DSG.content.faq.length)) {
      page.appendChild(h("section", { class: "block" }, h("div", { class: "wrap" },
        h("div", { class: "section-title", style: "margin-top:0" }, h("h2", null, "Questions fréquentes"), h("a", { class: "btn ghost sm", href: "#/aide" }, "Toute l'aide")),
        faqList(items.slice(0, 4)))));
    }
    return page;
  } });
`;

/** Pages génériques (plan de site) : les pages "static" sont composées
 *  par blocs (voir CLIENT_BLOCKS) — plus jamais un contenu figé. Les
 *  pages liées à une entité (liste/détail/formulaire/tableau de bord)
 *  restent des gabarits dédiés, car elles doivent parler à une vraie
 *  API CRUD, pas à un simple rendu de blocs. */
const CLIENT_GENERIC = String.raw`
  const SITE_PLAN = APP.sitePlan || { pages: [], entities: [] };
  const entityOf = (id) => (SITE_PLAN.entities || []).find((e) => e.id === id);

  function genericStaticPage(page) {
    return renderBlockTree(page.blocks);
  }
  function itemLabel(entity, item) {
    const first = entity?.fields?.[0]?.key;
    return (first && item[first]) || item.title || item.name || ("#" + item.id);
  }
  async function genericListPage(page) {
    const entity = entityOf(page.entity);
    const res = await api("/entities/" + page.entity);
    const wrap = h("div", { class: "wrap page" },
      h("div", { class: "page-head" }, h("div", null, h("h1", null, page.label), h("p", { class: "muted" }, entity ? entity.label : ""))));
    if (!res.ok) { wrap.appendChild(errorCard(res)); return wrap; }
    const items = res.items || [];
    wrap.appendChild(items.length
      ? h("div", { class: "card rows" }, items.map((it) => h("a", { class: "row", href: "#" + page.path + "/" + it.id },
          h("span", { class: "thumb" }, ico("tag", 20)),
          h("div", { class: "grow" }, h("strong", null, itemLabel(entity, it))),
          h("span", { class: "chev" }, ico("chevron", 18)))))
      : h("div", { class: "card empty" }, h("h3", null, "Rien pour l'instant"), h("p", null, "Ce contenu apparaîtra ici une fois ajouté.")));
    return wrap;
  }
  async function genericDetailPage(page, id) {
    const entity = entityOf(page.entity);
    const res = await api("/entities/" + page.entity + "/" + id);
    const wrap = h("div", { class: "wrap page" }, h("a", { class: "back", href: "#" + page.path }, ico("arrow", 16), page.label));
    if (!res.ok) { wrap.appendChild(errorCard(res)); return wrap; }
    const item = res.item;
    wrap.appendChild(h("div", { class: "page-head" }, h("h1", null, itemLabel(entity, item))));
    const dl = h("dl", { class: "review" });
    (entity?.fields || []).forEach((f) => { dl.appendChild(h("dt", null, f.label)); dl.appendChild(h("dd", null, String(item[f.key] ?? "—"))); });
    wrap.appendChild(h("div", { class: "card pad" }, dl));
    return wrap;
  }
  function genericFormPage(page) {
    const entity = entityOf(page.entity);
    const inputs = (entity?.fields || []).map((f) => {
      const inputEl = f.type === "richtext" ? h("textarea", { rows: "4" }) : h("input", { type: f.type === "number" ? "number" : f.type === "date" ? "date" : "text" });
      return { key: f.key, el: field(f.label, inputEl), input: inputEl };
    });
    const err = h("p", { class: "form-error", hidden: true });
    const btn = h("button", { class: "btn primary lg block", type: "submit" }, "Envoyer");
    const form = h("form", { class: "card pad form", onsubmit: async (e) => {
      e.preventDefault();
      const data = {}; inputs.forEach((i) => (data[i.key] = i.input.value.trim()));
      const res = await api("/entities/" + page.entity, { method: "POST", body: data });
      if (!res.ok) { err.textContent = friendly(res); err.hidden = false; return; }
      toast("Envoyé."); go(page.path);
    } }, inputs.map((i) => i.el), err, btn);
    return h("div", { class: "wrap page" }, h("div", { class: "page-head" }, h("h1", null, page.label)), form);
  }

  (SITE_PLAN.pages || []).forEach((page) => {
    if (page.kind === "list" && page.entity) {
      route(page.path, { title: page.label, auth: !!page.auth, render: () => genericListPage(page) });
      route(page.path + "/:id", { title: page.label, auth: !!page.auth, render: ({ params }) => genericDetailPage(page, params.id) });
    } else if (page.kind === "form" && page.entity) {
      route(page.path, { title: page.label, auth: !!page.auth, render: () => genericFormPage(page) });
    } else if (page.kind === "chat") {
      route(page.path, { title: page.label, auth: !!page.auth, render: () => { setTimeout(() => openAssistant(), 50); return h("div", { class: "wrap page" }, h("p", { class: "muted" }, "Ouverture de l'assistant…")); } });
    } else if (page.kind === "dashboard") {
      route(page.path, { title: page.label, auth: true, render: () => h("div", { class: "wrap page" },
        h("div", { class: "page-head" }, h("h1", null, page.label)),
        h("p", { class: "muted" }, "Votre espace personnel pour cette rubrique.")) });
    } else {
      route(page.path, { title: page.label, auth: !!page.auth, render: () => genericStaticPage(page) });
    }
  });
`;

const CLIENT_BOOT = String.raw`
  route("/404", { title: "Page introuvable", render: () => h("section", { class: "wrap page center" },
    h("h1", null, "Page introuvable"), h("p", { class: "lead", style: "margin:12px auto 24px" }, "Cette page n'existe pas ou a été déplacée."),
    h("a", { class: "btn primary", href: "#/" }, "Retour à l'accueil")) });

  async function boot() {
    const jobs = [api("/health")];
    if (M.auth && state.token) jobs.push(api("/auth/me"));
    const out = await Promise.all(jobs);
    state.health = out[0] && out[0].status ? out[0] : null;
    if (out[1]) { if (out[1].ok && out[1].customer) state.customer = out[1].customer; else if (out[1].httpStatus === 401) clearSession(); }
    renderBanner();
    buildAssistant();
        window.addEventListener("hashchange", render);
    var root = document.documentElement, lastY = 0;
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      root.setAttribute("data-scrolled", y > 24 ? "on" : "off");
      if (Math.abs(y - lastY) > 6) { root.setAttribute("data-dir", y > lastY ? "down" : "up"); lastY = y; }
    }, { passive: true });
    if (root.getAttribute("data-spot") === "on") {
      window.addEventListener("pointermove", function (e) {
        root.style.setProperty("--mx", e.clientX + "px");
        root.style.setProperty("--my", e.clientY + "px");
      });
    }
    render();
    if (DSG.responsive && DSG.responsive.stickyCta && DSG.nav) {
      document.body.appendChild(h("div", { class: "m-cta" }, h("button", { class: "btn primary lg", type: "button", style: "width:100%", onclick: ctaAction }, DSG.nav.ctaLabel || "Nous contacter")));
    }
    if (DSG.agent && DSG.agent.autoOpen && !SHOT) setTimeout(() => openAssistant(), 1800);
  }
  boot();
})();
`;

function clientJs(bp) {
  const m = bp.modules;
  return [
    CLIENT_CORE,
    CLIENT_BLOCKS,
    CLIENT_HELP,
    m.auth && CLIENT_AUTH,
    m.orders && CLIENT_ORDERS,
    m.returns && CLIENT_RETURNS,
    m.catalog && CLIENT_CATALOG,
    m.booking && CLIENT_BOOKING,
    CLIENT_HOME,
    bp.sitePlan?.pages?.length && CLIENT_GENERIC,
    CLIENT_BOOT,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ════════════════════════════════════════════════════════════════════
   11. WIDGET (bulle intégrable sur un site existant) — inchangé v3
   ════════════════════════════════════════════════════════════════════ */

function fileWidget(spec, bp) {
  const t = lightTokensFor(spec);
  const css = [
    `.aig-btn{position:fixed;right:20px;bottom:20px;width:52px;height:52px;border-radius:50%;background:${t.accent};color:${t.accentText};border:none;cursor:pointer;font-size:20px;z-index:2147483000;}`,
    `.aig-panel{position:fixed;right:20px;bottom:84px;width:360px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);background:${t.bg};color:${t.text};border:1px solid ${t.border};border-radius:${t.radius};display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:${t.font};font-size:14px;box-shadow:0 24px 60px -24px rgba(0,0,0,.35);}`,
    `.aig-panel.open{display:flex;}`,
    `.aig-head{padding:14px 16px;border-bottom:1px solid ${t.border};font-weight:600;}`,
    `.aig-thread{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px;}`,
    `.aig-msg{white-space:pre-wrap;max-width:88%;}`,
    `.aig-msg.u{align-self:flex-end;background:${t.surfaceAlt};border-radius:12px;padding:8px 11px;}`,
    `.aig-form{display:flex;border-top:1px solid ${t.border};}`,
    `.aig-form input{flex:1;background:none;border:none;outline:none;padding:13px 16px;color:${t.text};font:inherit;}`,
    `.aig-form button{background:none;border:none;color:${t.accent};padding:0 16px;cursor:pointer;font-size:16px;}`,
  ].join("");
  return tpl(
    String.raw`/**
 * Widget __NAME__ — à coller sur n'importe quelle page :
 *   <script src="https://VOTRE-DOMAINE/widget.js" data-api="https://VOTRE-DOMAINE"></script>
 */
(function () {
  var script = document.currentScript;
  var API = (script && script.dataset.api) || window.location.origin;
  var style = document.createElement("style");
  style.textContent = __CSS__;
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.className = "aig-btn";
  btn.textContent = "?";
  btn.setAttribute("aria-label", "Ouvrir l'assistant");

  var panel = document.createElement("div");
  panel.className = "aig-panel";
  var head = document.createElement("div");
  head.className = "aig-head";
  head.textContent = __NAME_JSON__;
  var thread = document.createElement("div");
  thread.className = "aig-thread";
  var form = document.createElement("form");
  form.className = "aig-form";
  var input = document.createElement("input");
  input.placeholder = "Votre question…";
  var send = document.createElement("button");
  send.type = "submit";
  send.textContent = "→";
  form.append(input, send);
  panel.append(head, thread, form);
  document.body.append(btn, panel);

  var history = [];
  function add(role, text) {
    var d = document.createElement("div");
    d.className = "aig-msg " + (role === "user" ? "u" : "a");
    d.textContent = text;
    thread.appendChild(d);
    thread.scrollTop = thread.scrollHeight;
  }

  btn.onclick = function () {
    panel.classList.toggle("open");
    if (panel.classList.contains("open") && !thread.children.length) add("agent", __GREETING__);
  };

  form.onsubmit = async function (e) {
    e.preventDefault();
    var msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    add("user", msg);
    try {
      var res = await fetch(API + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: history.slice(-10) }),
      });
      var data = await res.json();
      add("agent", data.reply || data.message || "Service momentanément indisponible.");
      if (data.reply) history.push({ role: "user", content: msg }, { role: "assistant", content: data.reply });
    } catch (_) {
      add("agent", "Connexion impossible.");
    }
  };
})();
`,
    {
      NAME: (spec.name || "AiGENT").replace(/[<>]|\*\//g, ""),
      NAME_JSON: JSON.stringify(spec.name || "Assistant"),
      GREETING: JSON.stringify(bp.greeting),
      CSS: JSON.stringify(css),
    },
  );
}

/* ════════════════════════════════════════════════════════════════════
   12. ASSEMBLAGE (inchangé v3)
   ════════════════════════════════════════════════════════════════════ */

/** Vérifie que chaque fichier .js généré est syntaxiquement valide EN ESM
 *  (import / export / import.meta / top-level await compris), sans jamais
 *  l'exécuter. Deux stratégies, sans transformer ni supprimer quoi que ce
 *  soit du code généré :
 *   1. vm.SourceTextModule — rapide, en-process, mais seulement disponible
 *      si Node tourne avec --experimental-vm-modules.
 *   2. Repli : `node --check` sur un fichier temporaire .mjs. */

function hasSourceTextModule() {
  return typeof vm.SourceTextModule === "function";
}

function checkWithSourceTextModule(content, filename) {
  try {
    // eslint-disable-next-line no-new
    new vm.SourceTextModule(content, { identifier: filename });
    return { supported: true, ok: true };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { supported: true, ok: false, error: err };
    }
    return { supported: false };
  }
}

function checkWithNodeSubprocess(content) {
  const dir = mkdtempSync(join(tmpdir(), "aigent-jscheck-"));
  const tmpFile = join(dir, "check.mjs");
  try {
    writeFileSync(tmpFile, content, "utf8");
    execFileSync(process.execPath, ["--check", tmpFile], {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 8000,
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString("utf8") : err.message;
    throw new Error(
      stderr.split("\n").slice(0, 3).join(" ").trim() || err.message,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertValidJs(files) {
  const useSourceTextModule = hasSourceTextModule();
  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.endsWith(".js")) continue;
    try {
      if (useSourceTextModule) {
        const check = checkWithSourceTextModule(content, filePath);
        if (check.supported) {
          if (!check.ok) throw check.error;
          continue;
        }
      }
      checkWithNodeSubprocess(content);
    } catch (err) {
      throw new Error(
        `Fichier JS invalide généré (${filePath}) : ${err.message}. Génération annulée — corrigez le gabarit.`,
      );
    }
  }
}

/**
 * @param {Object} spec0          AgentSpec validée
 * @param {Object} extras         { systemPrompt, knowledgeEntries }
 * @returns {{files: Record<string,string>, manifest: Object}}
 */
export function generateProject(spec0, extras = {}, precomputedBp = null) {
  const bp = precomputedBp || deriveBlueprint(spec0);
  // Filet de sécurité : quelle que soit la façon dont ce point d'entrée a
  // été appelé (avec ou sans équipe multi-agents), l'accueil n'est JAMAIS
  // vide — un secours varié prend le relais si besoin.
  if (!bp.homeBlocks) bp.homeBlocks = composeFallbackBlocks(spec0, bp, null);

  const spec = withImpliedTools(spec0, bp);
  const integrations = integrationsFor(spec, bp);
  const ids = toolIds(spec);
  const m = bp.modules;
  const flags = {
    auth: m.auth,
    orders: m.orders,
    returns: m.returns,
    catalog: m.catalog,
    booking: m.booking,
    bookingRequest: m.booking && bp.bookingMode !== "confirm",
    bookingConfirm: bp.bookingMode === "confirm",
    webhook: ids.has("notify.webhook"),
    email: needsEmail(spec),
    entities: !!bp.sitePlan?.entities?.length,
  };
  const files = {};

  // Racine
  files["README.md"] = fileReadme(spec, bp, integrations);
  files[".env.example"] = fileEnvExample(spec, bp);
  files[".gitignore"] = fileGitignore();
  files["package.json"] = filePackageJson(spec, bp);
  files["agent.config.json"] = J(sanitizeSpec(spec));

  // Back-end
  files["backend/server.js"] = tpl(
    SRV_SERVER,
    {
      AGENT_NAME: JSON.stringify(spec.name || "AiGENT"),
      MODULES: JSON.stringify(Object.keys(m).filter((k) => m[k])),
    },
    flags,
  );
  files["backend/src/prompt.js"] = filePrompt(
    spec,
    bp,
    extras.systemPrompt || "",
  );
  files["backend/src/agent.js"] = tpl(SRV_AGENT, {}, flags);
  files["backend/src/knowledge.js"] = SRV_KNOWLEDGE;
  files["backend/src/db.js"] = SRV_DB;
  files["backend/src/middleware/rate-limit.js"] = SRV_RATE;
  files["backend/src/middleware/errors.js"] = SRV_ERRORS;
  files["backend/src/routes/site.js"] = tpl(SRV_SITE, {}, flags);
  if (m.auth) {
    files["backend/src/auth.js"] = SRV_AUTH;
    files["backend/src/routes/account.js"] = tpl(SRV_ACCOUNT, {}, flags);
    files["backend/src/routes/admin.js"] = tpl(SRV_ADMIN, {}, flags);
  }
  if (m.orders)
    files["backend/src/services/orders.js"] = tpl(
      SRV_ORDERS_SERVICE,
      {},
      flags,
    );
  Object.assign(files, toolFiles(spec, bp));
  if (bp.sitePlan?.entities?.length) {
    files["backend/src/routes/entities.js"] = tpl(
      SRV_ENTITIES,
      {
        ENTITY_IDS: JSON.stringify(bp.sitePlan.entities.map((e) => e.id)),
        ENTITY_AUTH_IDS: JSON.stringify(
          Object.keys(bp.sitePlan.entityAuth || {}),
        ),
      },
      flags,
    );
  }

  // Données
  files["database/schema.sql"] = fileSchema(spec, bp);
  files["backend/scripts/init-db.js"] = SRV_INIT_DB;
  if (hasDemo(bp))
    files["backend/scripts/seed-demo.js"] = tpl(
      SRV_SEED,
      { DEMO: J(demoDataFor(bp)) },
      flags,
    );

  // Connaissances (FAQ vraie pour ce site + politiques à compléter)
  Object.assign(files, knowledgeFiles(bp, extras.knowledgeEntries));

  // Front-end
  files["frontend/index.html"] = fileFrontendHtml(spec, bp);
  files["frontend/styles.css"] = fileFrontendCss(spec, bp);
  files["frontend/app.js"] = clientJs(bp);
  if (
    spec.interface?.kind === "widget" ||
    (spec.export?.formats || []).includes("widget")
  ) {
    files["frontend/widget.js"] = fileWidget(spec, bp);
  }

  // Docs
  files["docs/SERVICES.md"] = integrations
    .map(
      (i) =>
        `## ${i.label}\n\n${i.reason}\n\nVariables : \`${i.env.join("`, `")}\`\n\n${SERVICE_CATALOG[i.service]?.help || ""}\n`,
    )
    .join("\n");

  assertNoSecrets(files);
  assertValidJs(files);

  const manifest = {
    name: spec.name,
    slug: spec.slug || slugify(spec.name || "mon-aigent"),
    generatedAt: new Date().toISOString(),
    fileCount: Object.keys(files).length,
    totalBytes: Object.values(files).reduce(
      (s, c) => s + Buffer.byteLength(c, "utf8"),
      0,
    ),
    files: Object.keys(files).sort(),
    domain: bp.domain,
    modules: Object.keys(m).filter((k) => m[k]),
    pages: bp.nav.map((n) => n.label),
    qaFlag: bp.qaFlag || null,
    shots: previewShotsFor(spec0),
    stack: {
      frontend: "Site monopage HTML/CSS/JS (sans build)",
      backend: "Node.js 18+ · Express",
      database: "PostgreSQL",
      ai: "endpoint compatible OpenAI (votre fournisseur)",
    },
    integrations,
    envKeys: envKeysFor(spec),
  };
  return { files, manifest };
}

/** Retire de la config exportée tout ce qui est interne au Builder. */
export function sanitizeSpec(spec) {
  const { openQuestions, notes, assumptions, ...clean } = spec || {};
  const bp = deriveBlueprint(spec || {});
  return {
    ...clean,
    blueprint: {
      domain: bp.domain,
      modules: bp.modules,
      bookingMode: bp.bookingMode,
    },
    generatedBy: "AiGENT",
    schemaVersion: spec?.schemaVersion || 1,
  };
}

/** Garde-fou : aucune valeur de nos variables d'environnement ne doit
 *  se retrouver dans le projet livré. */
export function assertNoSecrets(files) {
  const secrets = Object.entries(process.env)
    .filter(
      ([k, v]) =>
        /KEY|TOKEN|SECRET|PASS|DSN|CREDENTIAL/i.test(k) && v && v.length >= 12,
    )
    .map(([k, v]) => [k, v]);
  const blob = Object.values(files).join("\n");
  for (const [key, value] of secrets) {
    if (blob.includes(value)) {
      throw new Error(
        `Fuite de secret détectée dans le projet généré (${key}). Génération annulée.`,
      );
    }
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════════
   13. ARCHIVE ZIP (inchangé v3, sans dépendance externe)
   ════════════════════════════════════════════════════════════════════ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, day };
}

/** Construit un ZIP (deflate) à partir d'une map { chemin: contenu }. */
export function buildZip(files, rootFolder = "") {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, day } = dosDateTime();

  for (const [rawPath, content] of Object.entries(files)) {
    const name = (rootFolder ? `${rootFolder}/` : "") + rawPath;
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);
    const deflated = deflateRawSync(data, { level: 6 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, payload);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(payload.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

/* ════════════════════════════════════════════════════════════════════
   14. APERÇU HÉBERGÉ (inchangé v3)
   ════════════════════════════════════════════════════════════════════ */

const DEMO_SHIM = String.raw`(function () {
  var DEMO = __DEMO__, META = __META__, ENDPOINT = __ENDPOINT__;
  var MODE = (location.search.match(/[?&]__shot=(guest|user)/) || [])[1] || null, SHOT = !!MODE;
  var PREFIX = "aigd:" + (SHOT ? "shot:" : "") + META.slug + ":";
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  function load(k, d) { try { var v = localStorage.getItem(PREFIX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} }
  function day(n) { return new Date(Date.now() - n * 864e5).toISOString(); }
  function hash(s) { var x = 5381; for (var i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return String(x); }
  // Mode capture (?__shot=guest|user) : compte de démonstration prêt, aucune animation,
  // aucun bandeau — l'aperçu est identique au site livré.
  if (SHOT) {
    var TK = "tok:shot:" + META.slug;
    save("users", [{ name: "Camille Martin", email: "camille@exemple.fr", pass: hash("demo1234") }]);
    try { if (MODE === "user") localStorage.setItem(TK, "demo." + encodeURIComponent("camille@exemple.fr")); else localStorage.removeItem(TK); } catch (e) {}
    document.documentElement.setAttribute("data-shot", "1");
    var st = document.createElement("style");
    st.textContent = "[data-shot] *{animation:none!important;transition:none!important;caret-color:transparent!important}[data-shot] .aigent-badge{display:none!important}";
    document.head.appendChild(st);
  }
  function json(status, obj) { return new Response(JSON.stringify(obj), { status: status, headers: { "Content-Type": "application/json" } }); }
  var NEED_AUTH = [401, { ok: false, error: "auth_required", message: "Connectez-vous pour continuer." }];

  var orders = DEMO.orders.map(function (o) {
    return {
      ref: o.ref, status: o.status, placedAt: day(o.placedDaysAgo), total: o.total, currency: "EUR",
      carrier: o.carrier || null, trackingNumber: o.trackingNumber || null, trackingUrl: null,
      eta: o.etaInDays == null ? null : new Date(Date.now() + o.etaInDays * 864e5).toISOString().slice(0, 10),
      shippingAddress: o.shippingAddress,
      itemsCount: o.items.reduce(function (s, i) { return s + i.qty; }, 0), items: o.items,
      events: o.events.map(function (e) { return { status: e.status, label: e.label, location: e.location, occurredAt: day(e.daysAgo) }; })
    };
  });
  function findOrder(ref) { return orders.filter(function (o) { return o.ref.toUpperCase() === String(ref || "").trim().toUpperCase(); })[0]; }
  function who(auth) {
    var t = String(auth || "").replace(/^Bearer /, "");
    if (t.indexOf("demo.") !== 0) return null;
    var email = decodeURIComponent(t.slice(5));
    return load("users", []).filter(function (u) { return u.email === email; })[0] || null;
  }
  function pub(u) { return { id: 1, name: u.name, email: u.email }; }

  function handle(method, path, body, user, qs) {
    var m;
    if (path === "/health") return [200, { status: "ok", env: SHOT ? "production" : "preview", demo: true, agent: META.name, modules: META.modules, policy: { returnWindowDays: DEMO.returnWindowDays }, configured: { ai: true, database: true, sessions: true } }];
    if (path === "/knowledge") return [200, { ok: true, sections: DEMO.faq }];
    if (path === "/catalog") {
      var s = (qs.get("search") || "").toLowerCase(), c = qs.get("category") || "";
      var items = DEMO.catalog.filter(function (i) { return (!c || i.category === c) && (!s || (i.name + " " + i.description).toLowerCase().indexOf(s) >= 0); });
      var cats = []; DEMO.catalog.forEach(function (i) { if (i.category && cats.indexOf(i.category) < 0) cats.push(i.category); });
      return [200, { ok: true, items: items, categories: cats }];
    }
    if (path === "/auth/register" && method === "POST") {
      var name = String(body.name || "").trim(), email = String(body.email || "").trim().toLowerCase();
      if (name.length < 2) return [400, { ok: false, error: "invalid", message: "Indiquez votre nom." }];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return [400, { ok: false, error: "invalid", message: "Adresse email invalide." }];
      if (String(body.password || "").length < 8) return [400, { ok: false, error: "invalid", message: "Le mot de passe doit contenir au moins 8 caractères." }];
      var users = load("users", []);
      if (users.some(function (u) { return u.email === email; })) return [409, { ok: false, error: "email_taken", message: "Un compte existe déjà avec cet email. Connectez-vous." }];
      var u = { name: name, email: email, pass: hash(body.password) };
      users.push(u); save("users", users);
      return [200, { ok: true, token: "demo." + encodeURIComponent(email), customer: pub(u) }];
    }
    if (path === "/auth/login" && method === "POST") {
      var e2 = String(body.email || "").trim().toLowerCase();
      var found = load("users", []).filter(function (u) { return u.email === e2 && u.pass === hash(body.password || ""); })[0];
      if (!found) return [401, { ok: false, error: "bad_credentials", message: "Email ou mot de passe incorrect." }];
      return [200, { ok: true, token: "demo." + encodeURIComponent(e2), customer: pub(found) }];
    }
    if (path === "/auth/me") return user ? [200, { ok: true, customer: pub(user) }] : NEED_AUTH;
    if (path === "/track" && method === "POST") {
      var o = findOrder(body.ref);
      if (!o || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(body.email || ""))) return [404, { ok: false, error: "not_found", message: "Aucune commande ne correspond à ces informations. En démonstration, essayez " + (orders[0] ? orders[0].ref : "CMD-48213") + " avec n'importe quel email." }];
      return [200, { ok: true, order: o }];
    }
    if (path === "/orders") return user ? [200, { ok: true, orders: orders }] : NEED_AUTH;
    if ((m = path.match(/^\/orders\/([^/]+)$/))) {
      if (!user) return NEED_AUTH;
      var one = findOrder(decodeURIComponent(m[1]));
      return one ? [200, { ok: true, order: one }] : [404, { ok: false, error: "not_found", message: "Commande introuvable." }];
    }
    if (path === "/returns" && method === "GET") return user ? [200, { ok: true, returns: load("returns:" + user.email, []) }] : NEED_AUTH;
    if (path === "/returns" && method === "POST") {
      if (!user) return NEED_AUTH;
      var ord = findOrder(body.orderRef);
      if (!ord) return [404, { ok: false, error: "not_found", message: "Commande introuvable." }];
      if (ord.status !== "delivered") return [422, { ok: false, error: "not_eligible", message: "Seules les commandes livrées peuvent faire l'objet d'un retour." }];
      var picked = [];
      (body.items || []).forEach(function (it) {
        var line = ord.items.filter(function (i) { return i.sku === it.sku; })[0], q = Math.floor(Number(it.qty));
        if (line && q >= 1 && q <= line.qty) picked.push({ sku: line.sku, name: line.name, qty: q });
      });
      if (!picked.length) return [400, { ok: false, error: "invalid", message: "Sélectionnez au moins un article à retourner." }];
      var ret = { ref: "RET-" + (100000 + Math.floor(Math.random() * 899999)), orderRef: ord.ref, status: "requested", reason: body.reason, resolution: body.resolution, comment: body.comment || null, createdAt: new Date().toISOString(), items: picked };
      var list = load("returns:" + user.email, []); list.unshift(ret); save("returns:" + user.email, list);
      return [200, { ok: true, return: ret }];
    }
    if (path === "/contact" && method === "POST") {
      if (!body.name || !body.email || !body.message) return [400, { ok: false, error: "invalid", message: "Nom, email valide et message sont requis." }];
      var msgs = load("contacts", []); msgs.push(body); save("contacts", msgs);
      return [200, { ok: true, message: "Merci, votre message a bien été transmis. Nous revenons vers vous rapidement." }];
    }
    if (path === "/booking" && method === "POST") {
      if (!body.date || !body.name || !body.contact) return [400, { ok: false, error: "invalid", message: "Date, nom et moyen de contact sont requis." }];
      var bk = load("bookings", []); bk.push(body); save("bookings", bk);
      return [200, { ok: true, status: META.bookingMode === "confirm" ? "confirmed" : "pending", message: META.bookingMode === "confirm" ? "Votre réservation est confirmée." : "Demande enregistrée. Elle doit être confirmée par un humain." }];
    }
    return [404, { ok: false, error: "not_found" }];
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input && input.url;
    if (!url || url.indexOf("/api/") !== 0) return realFetch ? realFetch(input, init) : Promise.reject(new Error("fetch indisponible"));
    var path = url.slice(4).split("?")[0], qs = new URLSearchParams(url.split("?")[1] || "");
    var method = ((init && init.method) || "GET").toUpperCase();
    var body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
    var headers = (init && init.headers) || {};
    var user = who(headers.Authorization || headers.authorization);
    if (path === "/chat") {
      if (!realFetch) return Promise.resolve(json(503, { error: "service_not_configured", service: "ai_provider" }));
      var ctx = user
        ? " [Contexte de démonstration — client connecté : " + user.name + ". Commandes : " + orders.map(function (o) { return o.ref + " " + o.status + " (" + o.items.map(function (i) { return i.name; }).join(", ") + ")"; }).join(" ; ") + ".]"
        : "";
      return realFetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: String(body.message || "").slice(0, 900) + ctx, history: body.history || [] }) });
    }
    var out = handle(method, path, body, user, qs);
    return Promise.resolve(json(out[0], out[1]));
  };
})();
`;

export function buildPreviewHtml(spec, files, previewEndpoint) {
  const bp = deriveBlueprint(spec);
  const html = files["frontend/index.html"] || "";
  const css = files["frontend/styles.css"] || "";
  const js = files["frontend/app.js"] || "";
  const shim = tpl(DEMO_SHIM, {
    DEMO: jsonForScript(demoDataFor(bp)),
    META: jsonForScript({
      name: spec.name || "AiGENT",
      slug: spec.slug || slugify(spec.name || "mon-aigent"),
      modules: Object.keys(bp.modules).filter((k) => bp.modules[k]),
      bookingMode: bp.bookingMode,
    }),
    ENDPOINT: jsonForScript(previewEndpoint),
  });
  const badge = `<div class="aigent-badge" style="position:fixed;left:12px;bottom:10px;z-index:60;font:500 11px/1 ${styleTokens(spec).font};color:#6B6E76;background:rgba(255,255,255,.9);border:1px solid #E6E7EB;border-radius:999px;padding:6px 10px;pointer-events:none">APERÇU · Créé avec AiGENT</div>`;
  return html
    .replace(
      '<link rel="stylesheet" href="./styles.css" />',
      () => `<style>\n${css}\n</style>`,
    )
    .replace(
      '<script src="./app.js"></script>',
      () => `<script>\n${shim}\n</script>\n<script>\n${js}\n</script>`,
    )
    .replace("</body>", () => `${badge}</body>`);
}

/** Les 3 écrans qui racontent le mieux le site livré (le Builder les capture). */
export function previewShotsFor(spec) {
  const bp = deriveBlueprint(spec);
  const m = bp.modules;
  const home = { id: "accueil", label: "Accueil", mode: "guest", hash: "/" };
  if (m.orders) {
    return [
      home,
      {
        id: "suivi",
        label: "Suivi de commande",
        mode: "user",
        hash: "/commande/CMD-48377",
      },
      m.returns
        ? {
            id: "retour",
            label: "Demande de retour",
            mode: "user",
            hash: "/commande/CMD-48213",
            clickText: "Demander un retour",
            waitFor: ".overlay.show",
          }
        : {
            id: "compte",
            label: "Espace client",
            mode: "user",
            hash: "/compte",
          },
    ];
  }
  if (m.booking) {
    return [
      home,
      m.catalog
        ? {
            id: "catalogue",
            label: bp.labels.catalog,
            mode: "guest",
            hash: "/catalogue",
          }
        : { id: "aide", label: "Aide", mode: "guest", hash: "/aide" },
      {
        id: "reservation",
        label: bp.booking.title,
        mode: "guest",
        hash: "/reservation",
        waitFor: ".overlay.show",
      },
    ];
  }
  return [
    home,
    m.catalog
      ? {
          id: "catalogue",
          label: bp.labels.catalog,
          mode: "guest",
          hash: "/catalogue",
        }
      : { id: "aide", label: "Aide", mode: "guest", hash: "/aide" },
    {
      id: "assistant",
      label: "Assistant",
      mode: "guest",
      hash: "/",
      clickText: "Poser une question",
      waitFor: ".a-panel.open",
    },
  ];
}

export default {
  previewShotsFor,
  generateProject,
  buildZip,
  buildPreviewHtml,
  assertNoSecrets,
  sanitizeSpec,
  envKeysFor,
  integrationsFor,
  deriveBlueprint,
  finalizeBlueprint,
  applyCreativeOverrides,
  composeFallbackBlocks,
  composeFallbackPageBlocks,
  computeInterfaceMode,
  generateProjectWithAgents,
  PRIMITIVES,
  sanitizeBlockTree,
};
