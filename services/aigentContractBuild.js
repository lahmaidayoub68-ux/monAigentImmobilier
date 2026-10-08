//======================================================================//
//  AiGENT — génération du site par contrat v2.
//  L'IA conçoit (petits appels JSON validés) ; le runtime fait main rend.
//  Remplace aigentCodegen.generateApplicationCode (même signature).
//======================================================================//

import vm from "node:vm";
import { callLLM, extractJSON, compactSpec } from "./aiParsee-aigent.js";
import { qualityRulesFor } from "./aigentPromptRules.js";
import {
  buildEntities,
  toStorageEntities,
  buildPages,
  cleanSeed,
  seedOrder,
  assertContract,
  serializeForScript,
  ICON_NAMES,
} from "./aigentContract.js";
import { RUNTIME_JS, RUNTIME_CSS, INDEX_HTML } from "./aigentRuntime.js";

// Les petits appels structurés privilégient les modèles rapides; Groq est inclus
// car ses modèles de secours répondent souvent lorsque Gemini/Mistral sont en panne.
const ORDER = [
  "groq",
  "gemini",
  "github",
  "mistral",
  "cohere",
  "openrouter",
  "pollinations",
  "nvidia",
  "cloudflare",
];

async function askJSON(task, payload, { maxTokens = 3000 } = {}) {
  const base = `${qualityRulesFor("architect")}\n\n${task}\n\nRéponds uniquement avec un objet JSON valide, en français, sans Markdown ni commentaire, sans emoji.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const system = attempt
      ? `${base}\n\nLa sortie précédente était invalide ou incomplète : renvoie le JSON complet et valide.`
      : base;
    const raw = await callLLM(
      [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
      {
        profile: "json",
        maxTokens,
        temperature: 0.25,
        timeoutMs: 14000,
        totalTimeoutMs: 35000,
        maxModelTries: 2,
        order: ORDER,
      },
    );
    const json = raw ? extractJSON(raw) : null;
    if (json && typeof json === "object" && !Array.isArray(json)) return json;
    console.warn(
      JSON.stringify({
        subsystem: "aigent.contract",
        stage: "askJSON.invalid",
        attempt,
        got: raw ? "texte non JSON" : "aucune réponse",
      }),
    );
  }
  return null;
}

const TASK_ENTITIES = `Tu es l'architecte de données d'une application métier. Pour chaque entité fournie, précise le TYPE d'interface de chaque champ et complète le modèle si un champ métier indispensable manque.
Types de champ : text | longtext | number | date | enum | relation | email | boolean.
- enum : options = 3 à 7 valeurs dans le vocabulaire du métier, la première étant l'état initial.
- relation : target = id d'une AUTRE entité de la liste (le champ stocke la référence de l'enregistrement lié).
- titleField : le champ texte qui nomme l'enregistrement. statusField : le champ enum d'avancement, ou null si le métier n'en a pas.
- required : 1 à 3 champs réellement obligatoires. addFields : 0 à 4 champs ajoutés au maximum, clés en snake_case.
- plural : pluriel naturel du nom de l'entité.
Format : {"entities":{"<id>":{"plural":"…","titleField":"cle","statusField":"cle|null","fields":{"<cle>":{"kind":"…","label":"…","options":["…"],"target":"id|null","required":true}},"addFields":[{"key":"cle","label":"…","kind":"…","options":[],"target":null}]}}}`;

const TASK_VIEWS = `Tu es le concepteur produit d'une application métier de type SaaS (référence : Linear). Pour CHAQUE page fournie, conçois son contenu à partir de ce qu'elle sert réellement.
Pour chaque page : title (court), description (1 phrase concrète), icon (parmi : ${ICON_NAMES.join(", ")}), section (groupe de navigation de 1 à 2 mots, identique pour les pages proches), views (1 à 4).
Vues possibles (n'utilise que les clés réelles des entités fournies) :
- {"type":"table","entity":"id","title":"","columns":["cle","cle"]}  gérer ou comparer des enregistrements
- {"type":"board","entity":"id","groupBy":"cle_enum","title":""}  suivre un flux par état (seulement avec un champ enum)
- {"type":"list","entity":"id","title":""}  file de travail courte
- {"type":"stats","title":"","cards":[{"label":"…","entity":"id","agg":"count|sum|avg","field":"cle_number|null","where":{"field":"cle_enum","equals":"option"},"unit":""}]}  indicateurs
- {"type":"chart","entity":"id","groupBy":"cle_enum","title":""}  répartition
- {"type":"form","entity":"id","title":"","submitLabel":"…"}  saisie
- {"type":"text","title":"","body":"2 à 4 phrases utiles"}  explication métier
Règles : varie les vues d'une page à l'autre ; un tableau de bord combine stats + chart/board ; une page de liste préfère table ou board ; chaque vue répond à une question concrète de l'utilisateur de CE métier. Les pages de type settings/profile n'ont pas besoin de vues.
Format : {"pages":{"<idPage>":{"title":"…","description":"…","icon":"…","section":"…","views":[…]}}}`;

const TASK_SEED = `Tu produis des données de démonstration fictives mais crédibles pour UNE entité d'une application métier, en français. 5 à 7 enregistrements, cohérents avec le métier, aux valeurs variées.
Respecte exactement les clés fournies. Chaque enregistrement a une "ref" unique en kebab-case. Un champ enum prend une des options. Un champ relation prend une des refs de refsDisponibles pour sa cible. Les dates sont au format AAAA-MM-JJ, autour de la date du jour fournie. Les nombres sont plausibles. Aucun vrai nom de personne célèbre, aucun e-mail réel.
Format : {"items":[{"ref":"…","<cle>":valeur}]}`;

const describeEntity = (e) => ({
  id: e.id,
  label: e.label,
  titleField: e.titleField,
  statusField: e.statusField,
  fields: e.fields
    .filter((f) => f.kind !== "ref")
    .map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      options: f.options,
      target: f.target,
    })),
});

function fallbackSeedItems(entity, refs, today) {
  return Array.from({ length: 5 }, (_, index) => {
    const item = { ref: `${String(entity.id || "element").replace(/[^a-z0-9-]/gi, "-")}-${index + 1}` };
    for (const field of entity.fields) {
      if (field.key === "ref") continue;
      if (field.key === entity.titleField) { item[field.key] = `${entity.label} ${String(index + 1).padStart(2, "0")}`; continue; }
      if (field.kind === "enum") item[field.key] = field.options?.[index % (field.options.length || 1)] || "À traiter";
      else if (field.kind === "number") item[field.key] = (index + 1) * 10;
      else if (field.kind === "date") { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + index); item[field.key] = date.toISOString().slice(0, 10); }
      else if (field.kind === "boolean") item[field.key] = false;
      else if (field.kind === "email") item[field.key] = `contact-${index + 1}@example.test`;
      else if (field.kind === "relation") { const pool = refs[field.target] || []; if (pool.length) item[field.key] = pool[index % pool.length]; }
      else item[field.key] = field.kind === "longtext" ? `Donnée de démonstration pour ${field.label.toLowerCase()}, à remplacer par les informations réelles.` : `${field.label} ${index + 1}`;
    }
    return item;
  });
}

export async function generateApplicationCode(
  spec,
  bp,
  { onEvent = () => {} } = {},
) {
  const emit = (e) => {
    try {
      onEvent(e);
    } catch (_) {}
  };
  const plan = bp.sitePlan;
  if (!plan?.pages?.length)
    throw new Error(
      "Aucun plan de pages validé : impossible de construire l'application.",
    );
  const brief = {
    ...compactSpec(spec),
    domaine: plan.domainLabel,
    vocabulaire: plan.vocabulary,
  };
  const qualityFallbacks = [];

  /* 1. Modèle de données */
  emit({
    type: "codegen_start",
    role: "model",
    files: ["builder/site-contract.json"],
  });
  const metaRaw = plan.entities.length
    ? await askJSON(
        TASK_ENTITIES,
        { projet: brief, entites: plan.entities },
        { maxTokens: 3500 },
      )
    : {};
  if (plan.entities.length && !metaRaw) {
    console.warn(
      JSON.stringify({
        subsystem: "aigent.contract",
        stage: "entities.defaulted",
        reason: "aucune réponse JSON valide",
      }),
    );
  }
  const entities = buildEntities(plan.entities, metaRaw || {});
  emit({
    type: "codegen_done",
    role: "model",
    checks: [`${entities.length} entité(s) typée(s)`],
  });

  /* 2. Vues et navigation */
  emit({ type: "codegen_start", role: "views", files: ["frontend/app.js"] });
  const viewsPayload = {
    projet: brief,
    entites: entities.map(describeEntity),
    pages: plan.pages
      .filter((p) => p.kind !== "auth")
      .map((p) => ({
        id: p.id,
        label: p.label,
        kind: p.kind,
        entity: p.entity,
        features: (p.features || []).map((f) => f.label),
        actions: (p.actions || []).map((a) => a.label),
      })),
  };
  let viewsRaw = await askJSON(
    TASK_VIEWS,
    viewsPayload,
    { maxTokens: 6000 },
  );
  const viewsNeededDeterministicFallback = !viewsRaw;
  if (!viewsRaw) {
    // Les fournisseurs peuvent être en quota ou répondre en texte libre. Les vues
    // métier déterministes du contrat constituent alors un vrai plan de secours.
    console.warn(JSON.stringify({ subsystem: "aigent.contract", stage: "views.deterministic_fallback", pages: viewsPayload.pages.map((page) => page.id) }));
    viewsRaw = { pages: {} };
  }
  let built = buildPages(plan, entities, viewsRaw);
  if (built.defaulted.length && !viewsNeededDeterministicFallback) {
    const missingIds = new Set(built.defaulted);
    const repaired = await askJSON(
      `${TASK_VIEWS}\n\nCORRECTION CIBLÉE : la première sortie n'a pas permis de valider ces pages : ${built.defaulted.join(", ")}. Réponds avec une conception complète et valide pour chacune. Utilise uniquement les entités et clés fournies. Ne modifie pas les autres pages.`,
      { ...viewsPayload, pages: viewsPayload.pages.filter((page) => missingIds.has(page.id)) },
      { maxTokens: 3500 },
    );
    if (repaired?.pages) {
      viewsRaw = { ...viewsRaw, pages: { ...(viewsRaw.pages || {}), ...repaired.pages } };
      built = buildPages(plan, entities, viewsRaw);
    }
  }
  console.info(
    JSON.stringify({
      subsystem: "aigent.contract",
      stage: "views.built",
      pages: built.pages.length,
      defaulted: built.defaulted,
    }),
  );
  if (built.defaulted.length) console.info(JSON.stringify({ subsystem: "aigent.contract", stage: "views.fallback_ready", pages: built.defaulted }));
  emit({
    type: "codegen_done",
    role: "views",
    checks: [`${built.pages.length} page(s)`],
  });

  /* 3. Données de démonstration (une entité à la fois, dans l'ordre des relations) */
  emit({
    type: "codegen_start",
    role: "seed",
    files: ["builder/demo-data.json"],
  });
  const refs = {};
  const seeds = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const e of seedOrder(entities)) {
    let rows = [];
    for (let attempt = 0; attempt < 2 && rows.length < 3; attempt++) {
      const raw = await askJSON(
        TASK_SEED,
        {
          aujourdhui: today,
          projet: brief,
          entite: describeEntity(e),
          refsDisponibles: Object.fromEntries(
            e.fields
              .filter((f) => f.kind === "relation")
              .map((f) => [f.target, refs[f.target] || []]),
          ),
        },
        { maxTokens: 2800 },
      );
      rows = raw ? cleanSeed(e, raw, refs) : [];
    }
    if (rows.length < 3) {
      const fallback = cleanSeed(e, { items: fallbackSeedItems(e, refs, today) }, refs);
      rows = cleanSeed(e, { items: [...rows, ...fallback] }, refs).slice(0, 5);
      console.warn(JSON.stringify({ subsystem: "aigent.contract", stage: "seed.deterministic_fallback", entity: e.id, rows: rows.length }));
    }
    refs[e.id] = rows.map((r) => r.ref);
    seeds.push({ id: e.id, items: rows });
    if (rows.length < 3) {
      console.warn(
        JSON.stringify({
          subsystem: "aigent.contract",
          stage: "seed.thin",
          entity: e.id,
          rows: rows.length,
        }),
      );
    }
  }
  emit({ type: "codegen_done", role: "seed" });

  /* 4. Assemblage et vérification */
  emit({
    type: "codegen_start",
    role: "verify",
    files: ["frontend/app.js", "builder/site-contract.json"],
  });
  const contract = {
    version: 2,
    brand: { name: spec.name || "Mon AiGENT", tagline: spec.tagline || "" },
    entities,
    pages: built.pages,
    nav: built.nav,
    auth: built.auth,
  };
  assertContract(contract);
  const app = `window.__CONTRACT__=${serializeForScript(contract)};\n${RUNTIME_JS}`;
  try {
    new vm.Script(app, { filename: "frontend/app.js" });
  } catch (err) {
    // compile seulement, n'exécute rien
    throw new Error(`Le runtime généré est invalide : ${err.message}`);
  }

  // Le serveur généré (routes /api/entities, schéma SQL, seed) lit sitePlan.entities :
  // on y écrit les entités typées du contrat, pour que front et back parlent des mêmes champs.
  plan.entities = toStorageEntities(entities);

  emit({
    type: "codegen_done",
    role: "verify",
    checks: [
      "contrat validé",
      "runtime compilé",
      "relations résolues",
      "données de démonstration",
    ],
  });

  const degraded = qualityFallbacks.length > 0;
  return {
    sources: {
      "frontend/index.html": INDEX_HTML(
        contract.brand.name,
        spec.language || "fr",
      ),
      "frontend/styles.generated.css": RUNTIME_CSS,
      "frontend/app.js": app,
      "builder/site-contract.json": JSON.stringify(contract, null, 2),
      "builder/demo-data.json": JSON.stringify({ entities: seeds }, null, 2),
    },
    contract,
    degraded,
    recovered: qualityFallbacks.length > 0,
    qualityFallbacks: [...new Set(qualityFallbacks)],
  };
}
