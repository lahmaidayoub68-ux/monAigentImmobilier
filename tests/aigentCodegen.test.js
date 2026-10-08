import test from "node:test";
import assert from "node:assert/strict";
import { __aigentCodegenTestHooks as codegen } from "../services/aigentCodegen.js";
import { __aigentAgentsTestHooks as agents } from "../services/aigentAgents.js";
import { buildPreviewHtml, ensurePreviewStyles, ensurePreviewRuntimeGuard } from "../services/aigentGenerator.js";
import { __aiModelTestHooks as models, proposeArchitecture } from "../services/aiParsee-aigent.js";

const spec = {
  name: "Aide aux devoirs",
  purpose: "Aider les collégiens à réviser leurs leçons avec des quiz et un suivi des progrès.",
  tagline: "Réviser à son rythme",
  sector: "Éducation",
  audience: "Élèves de collège",
  language: "fr",
  missions: ["Organiser des leçons courtes", "Proposer des quiz corrigés", "Suivre les progrès"],
  interface: { design: { colors: { accent: "#7457ff" }, font: "inter", tone: "friendly" } },
};

const bp = {
  domain: "service",
  modules: { auth: true, orders: false, returns: false, catalog: false, booking: false, help: false },
  sitePlan: {
    domainLabel: "Apprentissage scolaire",
    archetype: "learning",
    assistant: { enabled: true, mode: "contextual", pageId: "exercices" },
    pages: [
      { id: "lecons", label: "Mes leçons", path: "/lecons", kind: "lesson", entity: "lessons", auth: true },
      { id: "quiz", label: "Quiz", path: "/quiz", kind: "quiz", entity: "quizzes", auth: true },
      { id: "progression", label: "Progression", path: "/progression", kind: "progress", entity: "progress", auth: true },
      { id: "exercices", label: "Exercices", path: "/exercices", kind: "workspace", entity: null, auth: true },
      { id: "compte", label: "Mon compte", path: "/compte", kind: "settings", entity: null, auth: true },
    ],
    nav: ["lecons", "quiz", "progression", "exercices", "compte"],
    entities: [
      { id: "lessons", label: "Leçons", fields: [{ key: "title", label: "Titre", type: "text" }, { key: "subject", label: "Matière", type: "text" }] },
      { id: "quizzes", label: "Quiz", fields: [{ key: "title", label: "Titre", type: "text" }, { key: "questions", label: "Questions", type: "richtext" }] },
      { id: "progress", label: "Progression", fields: [{ key: "score", label: "Score", type: "number" }, { key: "date", label: "Date", type: "date" }] },
    ],
  },
};

const contract = codegen.compactContract(spec, bp);
const html = '<!doctype html><html lang="fr"><head><title>Aide aux devoirs</title><link rel="stylesheet" href="./styles.css"></head><body><div id="app"></div><script src="./app.js"></script></body></html>';
const css = ':root{--x:var(--bg);color:var(--text);background:var(--bg);font-family:var(--font)}.card{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--r)}.quiet{color:var(--muted)}.action{color:var(--accent)}';
const app = `const APP=window.__APP__; const title="Aide aux devoirs"; const lessons="/api/entities/lessons"; const quizzes="/api/entities/quizzes"; const progress="/api/entities/progress"; fetch(lessons); fetch(quizzes); fetch(progress); fetch("/api/domain/evaluate",{method:"POST"}); fetch("/api/auth/register"); fetch("/api/auth/me"); const login="Connexion"; const profile="Mon profil"; const icon='<svg viewBox="0 0 24 24"></svg>'; const root=document.querySelector("#app"); const form=document.createElement("form"); const password=document.createElement("input"); password.type="password"; form.append(password); form.addEventListener("submit",event=>{event.preventDefault();fetch("/api/auth/login")}); root.append(document.createElement("main"),form);`;
const logic = 'export function evaluate(input){const total=Math.max(0,Number(input.total)||0);const correct=Math.min(total,Math.max(0,Number(input.correct)||0));return {total,correct,percentage:total?Math.round(correct*100/total):0};}';

test("l'architecture du site scolaire reste métier et écarte le catalogue commercial", () => {
  assert.equal(contract.architecture.domain, "Apprentissage scolaire");
  assert.equal(contract.architecture.pages.length, 5);
  assert.equal(contract.architecture.entities.length, 3);
  assert.equal(contract.architecture.modules.catalog, false);
  assert.equal(contract.architecture.pages[2].kind, "progress");
});

test("rejette un plan d'archives pour un projet explicitement consacré à la restauration", () => {
  const unrelated = agents.qaFilterSitePlan({
    domainLabel: "Archives patrimoniales", archetype: "editorial", entities: [], nav: ["documents"],
    pages: [{ id: "documents", label: "Documents", path: "/documents", kind: "list", features: [], components: [], actions: [] }],
  });
  assert.match(agents.sitePlanRelevanceErrors(unrelated, { sector: "Restauration", purpose: "Créer un site de restaurant avec menu et réservations" })[0], /domaine explicitement demandé/);
  const relevant = { ...unrelated, domainLabel: "Restaurant et cuisine", pages: [{ ...unrelated.pages[0], label: "Menu du restaurant" }] };
  assert.deepEqual(agents.sitePlanRelevanceErrors(relevant, { sector: "Restauration", purpose: "Créer un site de restaurant avec menu" }), []);
});

test("une fiche Work ne conserve jamais les exemples du schéma comme données métier", () => {
  const clean = models.normalizeUnderstanding({ understanding: {
    objective: "une phrase", audience: "une phrase", sector: "…",
    missions: [{ id: "x", label: "…", enabled: true }], summary: "2 phrases max, ce que tu as compris",
  }, suggestedTools: "invalid" }, "Créer un site de restaurant avec un menu et des réservations.");
  assert.match(clean.understanding.objective, /restaurant/);
  assert.notEqual(clean.understanding.audience, "une phrase");
  assert.notEqual(clean.understanding.sector, "…");
  assert.ok(clean.understanding.missions.length > 0);
  assert.ok(Array.isArray(clean.suggestedTools));
});

test("un token CSS omis est complété sans demander une nouvelle génération", () => {
  const incomplete = css.replace("var(--muted)", "#777");
  assert.throws(() => codegen.validateCss(incomplete), /var\(--muted\)/);
  const normalized = codegen.normalizeCssTokens(incomplete);
  assert.match(normalized, /--_aigent_contract_muted:var\(--muted\)/);
  assert.doesNotThrow(() => codegen.validateCss(normalized));
  assert.equal(codegen.normalizeCssTokens(css), css);
});

test("un module de révision dans une page couvre les fonctionnalités sans imposer une route par outil", () => {
  const brief = { purpose: "Aider à réviser avec quiz, exercices, tests, simulation de DS, correction IA et progression." };
  const base = {
    archetype: "learning", pages: [{ id: "revision-ia", label: "Réviser avec l'IA", path: "/revision-ia", kind: "workspace", features: [
      { id: "quiz", label: "Quiz interactifs" }, { id: "exercices", label: "Exercices" }, { id: "tests", label: "Tests de connaissances" },
      { id: "simulation-ds", label: "Simulation de DS" }, { id: "correction-ia", label: "Correction IA" }, { id: "progression", label: "Suivi de progression" },
    ] }], entities: [], nav: ["revision-ia"],
  };
  const filtered = agents.qaFilterSitePlan(base);
  assert.deepEqual(agents.sitePlanCoverageErrors(filtered, brief), []);
  assert.ok(filtered.pages.some((page) => page.path === "/revision-ia"));
  const missing = agents.sitePlanCoverageErrors({ ...filtered, pages: [{ ...filtered.pages[0], features: filtered.pages[0].features.filter((item) => item.id !== "simulation-ds") }] }, brief);
  assert.ok(missing.some((item) => /simulation de DS/i.test(item)));
});

test("la couverture déterministe conserve un plan valide et ajoute les capacités explicitement demandées", () => {
  const configurations = [
    { purpose: "Créer une plateforme scolaire avec quiz et QCM." },
    { purpose: "Révision avec exercices, tests, simulation de DS et correction automatique." },
    { purpose: "Pronote avec notes, devoirs, progression et quiz corrigés.", missions: ["Leçons et évaluations"] },
  ];
  for (const brief of configurations) {
    const plan = agents.qaFilterSitePlan({ archetype: "learning", pages: [{ id: "workspace", label: "Espace de révision", path: "/revision", kind: "workspace" }], entities: [], nav: ["workspace"] });
    const completed = agents.addDeterministicCoverage(plan, brief);
    assert.ok(completed.pages.length > 0);
    assert.deepEqual(agents.sitePlanCoverageErrors(completed, brief), []);
    assert.ok(completed.pages[0].features.length > 0);
  }
  const fallback = agents.buildDeterministicSitePlan({
    name: "Pronote Prof / Élève",
    purpose: "Tableau de bord scolaire pour les notes, devoirs, emploi du temps, messagerie, progression et révision avec quiz, exercices, tests, simulation de DS et correction IA.",
    missions: ["Cours et leçons pour les élèves"],
  });
  assert.ok(fallback.pages.length > 0);
  assert.deepEqual(agents.sitePlanCoverageErrors(fallback, { purpose: "Tableau de bord scolaire pour les notes, devoirs, emploi du temps, messagerie, progression et révision avec quiz, exercices, tests, simulation de DS et correction IA. Cours et leçons pour les élèves." }), []);
});

test("architecture et parcours sont déterministes et reliés aux configurations réelles", async () => {
  const configured = await proposeArchitecture({
    name: "Assistant pédagogique", audience: "Élèves", purpose: "Réviser les cours",
    interface: { kind: "web" },
    knowledge: [{ id: "kb-cours", type: "document", label: "Cours importés" }],
    tools: [{ id: "search", config: {}, status: "active", service: "search" }],
    integrations: [], permissions: { autonomy: "assist" },
  });
  const ids = new Set(configured.nodes.map((node) => node.id));
  assert.ok(ids.has("agent"));
  assert.ok(ids.has("knowledge_kb-cours"));
  assert.ok(ids.has("tool_search"));
  assert.ok(configured.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to)));
  assert.ok(configured.flow.length >= 3);
  assert.match(configured.caption, /1 outil/);
  assert.equal(configured.theme.accent, "#6459d9");
  assert.ok(configured.nodes.length >= 10, "le modèle scolaire doit exposer ses domaines métier");
  for (const id of ["school_courses", "school_assignments", "school_assessments", "school_grades", "school_progress", "school_students"]) assert.ok(ids.has(id) || configured.nodes.some((node) => node.id === id));
  assert.ok(configured.flow.length >= 8, "le parcours métier doit détailler les étapes scolaires");
  const immobilier = await proposeArchitecture({ name: "Immo", sector: "Immobilier", interface: { kind: "web" }, tools: [], knowledge: [], integrations: [] });
  assert.notEqual(immobilier.theme.accent, configured.theme.accent);
});

test("le repli métier déterministe satisfait evaluate quand une génération IA l'omet", () => {
  const fallback = codegen.deterministicDomainLogic({ project: { sector: "Éducation", purpose: "Aide aux cours" } });
  assert.match(fallback, /export function evaluate\(input\)/);
  assert.equal((fallback.match(/\bexport\b/g) || []).length, 1);
  assert.doesNotThrow(() => codegen.verifyGeneratedSources({
    "frontend/index.html": html,
    "frontend/styles.generated.css": css,
    "frontend/app.js": app,
    "backend/src/domain-logic.js": fallback,
  }, contract));
});

test("le site de repli autonome respecte le contrat et utilise les vraies routes métier", () => {
  const fallbackApp = codegen.ensureRuntimeConfig(codegen.deterministicFrontend(contract), contract);
  const fallbackCss = codegen.deterministicStyles(contract);
  const fallbackLogic = codegen.deterministicDomainLogic(contract);
  assert.doesNotThrow(() => codegen.verifyGeneratedSources({
    "frontend/index.html": html,
    "frontend/styles.generated.css": fallbackCss,
    "frontend/app.js": fallbackApp,
    "backend/src/domain-logic.js": fallbackLogic,
  }, contract));
  assert.match(fallbackApp, /\/api\/entities\/lessons/);
  assert.match(fallbackApp, /method:"POST"/);
  assert.match(fallbackApp, /method:"PATCH"/);
  assert.match(fallbackApp, /method:"DELETE"/);
  assert.match(fallbackApp, /momentanément indisponible/);
  assert.doesNotMatch(fallbackApp, /requête n’a pas abouti \("\+response\.status/);
});

test("le plan Pronote Prof/Élève couvre le parcours scolaire demandé", () => {
  const pronote = { purpose: "Pronote 2.0 pour professeurs et élèves : tableau de bord, notes, devoirs, emploi du temps, messagerie, progression et révision avec quiz, exercices, tests, simulation de DS et correction IA." };
  const plan = agents.qaFilterSitePlan({ archetype: "learning", pages: [
    { id: "dashboard", label: "Accueil Prof / Élève", path: "/dashboard", kind: "dashboard", features: ["notes", "devoirs", "emploi du temps", "progression", "cours"] },
    { id: "messagerie", label: "Messagerie", path: "/messages", kind: "workspace", features: ["messages prof-élève"] },
    { id: "revision-ia", label: "Réviser avec l'IA", path: "/revision-ia", kind: "workspace", features: ["quiz", "exercices", "tests", "simulation de DS", "correction IA"] },
  ], nav: ["dashboard", "messagerie", "revision-ia"], entities: [] });
  assert.ok(plan, "plan structurel conservé");
  assert.deepEqual(agents.sitePlanCoverageErrors(plan, pronote), []);
  const contract = codegen.compactContract(pronote, { ...bp, sitePlan: plan });
  assert.equal(contract.architecture.pages.length, 3);
});
test("AiGENT Startup OS obtient ses espaces métier et une vraie barrière de connexion", () => {
  const brief = {
    name: "AiGENT Startup OS",
    purpose: "Plateforme collaborative pour centraliser projets, tâches, documents, équipes, réunions, décisions, messagerie, recherche globale, agents spécialisés et analytics d'une startup. Tableau de bord avec priorités.",
    missions: ["Inbox, fichiers clients, profil, permissions et mémoire organisationnelle"],
  };
  const plan = agents.completePlanFromBrief(agents.qaFilterSitePlan({
    domainLabel: "Startup OS", archetype: "dashboard", pages: [{ id: "home", label: "Accueil", path: "/home", kind: "home" }], nav: ["home"], entities: [],
  }), brief);
  const ids = new Set(plan.pages.map((page) => page.id));
  for (const id of ["overview", "inbox", "projects", "tasks", "documents", "team", "messages", "meetings", "decisions", "search", "agents", "analytics", "settings", "profile", "sign-in"]) assert.ok(ids.has(id), `page ${id}`);
  assert.equal(plan.authRequired, true);
  assert.ok(plan.pages.filter((page) => page.id !== "sign-in").every((page) => page.auth));
  assert.ok(plan.entities.some((entity) => entity.id === "projects"));
});

test("les règles qualité texte sont chargées et injectées par rôle", async () => {
  const { qualityRulesFor } = await import("../services/aigentPromptRules.js");
  assert.match(qualityRulesFor("frontend"), /emoji/i);
  assert.match(qualityRulesFor("backend"), /authentification/i);
});

test("Pollinations découvre les candidats du catalogue, écarte le payant et trie la capacité", () => {
  const selected = models.selectPollinationsModels([
    { id: "tiny-model-free", pricing: { promptTextTokens: 0.0000001, completionTextTokens: 0.0000001 } },
    { id: "deepseek-v3", pricing: { promptTextTokens: 0, completionTextTokens: 0 } },
    { id: "image-flux-free", pricing: { promptTextTokens: 0, completionTextTokens: 0 } },
    { id: "paid-large", pricing: { promptTextTokens: 0.001, completionTextTokens: 0.001 } },
    { id: "gpt-oss-20b", pricing: { promptTextTokens: 0, completionTextTokens: 0 } },
  ]);
  assert.deepEqual(selected.map((model) => model.id), ["gpt-oss-20b", "deepseek-v3", "tiny-model-free"]);
  assert.ok(models.codeProviderOrders.design.includes("pollinations"));
  assert.ok(models.codeProviderOrders.frontend.includes("nvidia"));
  assert.ok(models.codeProviderOrders.backend.includes("cerebras"));
  assert.ok(models.codeProviderOrders.qa.includes("cohere"));
  assert.ok(models.cloudflarePriority({ name: "@cf/openai/gpt-oss-120b", task: { name: "Text Generation" } }) > 0);
  assert.equal(models.cloudflarePriority({ name: "@cf/baai/bge-m3", task: { name: "Text Embeddings" } }), -1);
});

test("les fichiers d'application respectent leur contrat de base", () => {
  assert.doesNotThrow(() => codegen.validateHtml(html));
  assert.doesNotThrow(() => codegen.validateCss(css));
  assert.doesNotThrow(() => codegen.verifyApiContract(app, contract));
  assert.doesNotThrow(() => codegen.verifyAppContent(app, contract));
  assert.doesNotThrow(() => codegen.verifyAppMount(app));
  assert.doesNotThrow(() => codegen.verifyGeneratedSources({
    "frontend/index.html": html,
    "frontend/styles.generated.css": css,
    "frontend/app.js": app,
    "backend/src/domain-logic.js": logic,
  }, contract));
});

test("la validation rejette les routes inconnues et les insertions HTML risquées", () => {
  assert.throws(() => codegen.verifyApiContract('fetch("/api/orders")', contract), /absents du contrat/);
  assert.throws(() => codegen.validateSecurity('document.body.innerHTML = input;', logic, html), /insertion HTML non sûre/);
  assert.throws(() => codegen.validateSecurity(app, 'export function evaluate(input){return process.env;}', html), /accès au processus serveur/);
});

test("le contrôle API accepte un chargeur générique branché sur les entités du contrat", () => {
  const dynamicApp = `const entities=window.__APP__.sitePlan.entities; async function load(entity){return fetch("/api/entities/"+entity.id);}`;
  assert.doesNotThrow(() => codegen.verifyApiContract(dynamicApp, contract));
});

test("le repli déterministe fournit un vrai espace de lecture et d'ajout pour chaque entité", () => {
  const configured = codegen.ensureRuntimeConfig(app, contract);
  const repaired = codegen.appendDeterministicEntityWorkspace(configured, contract);
  assert.doesNotThrow(() => codegen.verifyApiContract(repaired, contract));
  assert.match(repaired, /Données de votre espace/);
  for (const entity of contract.architecture.entities) assert.ok(repaired.includes(`/api/entities/${entity.id}`));
  assert.match(repaired, /method:"POST"/);
  assert.doesNotThrow(() => codegen.validateSecurity(repaired, logic, html));
  assert.doesNotThrow(() => codegen.verifyGeneratedSources({
    "frontend/index.html": html,
    "frontend/styles.generated.css": css,
    "frontend/app.js": repaired,
    "backend/src/domain-logic.js": logic,
  }, contract));
});

test("un script valide mais qui ne remplit pas #app est refusé", () => {
  assert.throws(() => codegen.verifyAppMount('const root=document.querySelector("#root"); root.appendChild(document.createElement("main"));'), /monté dans #app/);
});

test("les données de démonstration ne peuvent renseigner que les entités et champs du contrat", () => {
  const safe = codegen.validateDemoSeed({ entities: [
    { id: "lessons", items: [{ title: "Les fractions", subject: "Mathématiques", admin: true }] },
    { id: "unknown", items: [{ title: "Ignore" }] },
  ] }, contract);
  assert.deepEqual(safe.entities, [{ id: "lessons", items: [{ title: "Les fractions", subject: "Mathématiques" }] }]);
});

test("les ressources distantes et les gabarits HTML incomplets sont refusés", () => {
  assert.throws(() => codegen.validateHtml(html.replace("./styles.css", "https://example.com/x.css")), /local|ressources/);
  assert.throws(() => codegen.validateCss(".broken { color: var(--text);"), /incomplets/);
});

test("l'aperçu intègre les styles et scripts locaux avant de le servir", () => {
  const preview = buildPreviewHtml(spec, {
    "frontend/index.html": '<!doctype html><html lang="fr"><head><link rel="stylesheet" href="./styles.css"></head><body><div id="app"></div><script src="./app.js"></script></body></html>',
    "frontend/styles.css": ":root{--preview-regression-marker:yes}body{font-family:Arial,sans-serif}",
    "frontend/app.js": 'document.querySelector("#app").textContent="APP-REGRESSION-MARKER";',
    "builder/demo-data.json": JSON.stringify({ entities: [] }),
  }, "/preview/chat", bp);
  assert.match(preview, /<style data-aigent-preview-styles>/);
  assert.match(preview, /--preview-regression-marker/);
  assert.match(preview, /data-aigent-preview-app/);
  assert.match(preview, /window\.__AIGENT_PREVIEW__=true/);
  assert.match(preview, /data-aigent-preview-guard/);
  const guard = preview.match(/<script data-aigent-preview-guard>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(guard);
  assert.doesNotThrow(() => new Function(guard));
  assert.match(preview, /APP-REGRESSION-MARKER/);
  assert.doesNotMatch(preview, /href=["']\.\/styles\.css["']/);
  assert.doesNotMatch(preview, /src=["']\.\/app\.js["']/);
});

test("le client déterministe ignore l'écran de connexion uniquement dans l'aperçu et ouvre une page métier", () => {
  const app = codegen.deterministicFrontend(contract);
  assert.match(app, /const isPreview=Boolean\(APP\.previewMode\|\|window\.__AIGENT_PREVIEW__/);
  assert.match(app, /pages\.find\(p=>p\.kind!=="auth"\)/);
  assert.match(app, /if\(!isPreview\)\{if\(!localStorage\.getItem\(tokenKey\)\)authScreen\(\)/);
  assert.match(app, /\/api\/entities\/lessons/);
});

test("l'aperçu échoue explicitement si son shell ne permet pas d'intégrer le CSS", () => {
  assert.throws(() => buildPreviewHtml(spec, {
    "frontend/index.html": '<!doctype html><html><head></head><body><div id="app"></div><script src="./app.js"></script></body></html>',
    "frontend/styles.css": "body{font-family:Arial}",
    "frontend/app.js": "document.body.textContent='ok';",
    "builder/demo-data.json": JSON.stringify({ entities: [] }),
  }, "/preview/chat", bp), /lien vers styles\.css est absent/);
});

test("un aperçu déjà enregistré sans CSS est réparé à partir des fichiers de son build", () => {
  const stale = '<!doctype html><html><head><link rel="stylesheet" href="./styles.css" /></head><body></body></html>';
  const fixed = ensurePreviewStyles(stale, { "frontend/styles.css": "body{font-family:Arial,sans-serif}" });
  assert.match(fixed, /data-aigent-preview-styles/);
  assert.match(fixed, /font-family:Arial,sans-serif/);
  assert.doesNotMatch(fixed, /href=["']\.\/styles\.css["']/);
});

test("un ancien aperçu vide reçoit un diagnostic au lieu de rester blanc", () => {
  const appSource = 'throw new Error("montage impossible");';
  const oldPreview = `<!doctype html><html><body><div id="app"></div><script>${appSource}</script></body></html>`;
  const fixed = ensurePreviewRuntimeGuard(oldPreview, { "frontend/app.js": appSource });
  assert.match(fixed, /data-aigent-preview-guard/);
  assert.match(fixed, /L’aperçu n’a pas pu s’afficher/);
  assert.ok(fixed.indexOf("data-aigent-preview-guard") < fixed.indexOf(`<script>${appSource}`));
});
