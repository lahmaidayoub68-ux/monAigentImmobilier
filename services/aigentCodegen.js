import { callCode, callLLM, extractJSON } from "./aiParsee-aigent.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qualityRulesFor } from "./aigentPromptRules.js";

const ROLE_LABELS = {
  design: "Direction visuelle",
  frontend: "Application et pages",
  backend: "Logique métier serveur",
  verify: "Vérification indépendante",
};

const MAX_SOURCE_CHARS = 80_000;
const CODE_DENYLIST = [
  [/(?:\beval\s*\(|\bnew\s+Function\s*\()/i, "évaluation dynamique"],
  [
    /(?:child_process|node:child_process|\bexecSync\s*\(|\bspawnSync\s*\()/i,
    "exécution de processus",
  ],
  [
    /(?:node:fs|\bfrom\s+["']fs["']|\brequire\s*\(\s*["']fs)/i,
    "accès direct au système de fichiers",
  ],
  [
    /(?:sk-[a-zA-Z0-9]{16,}|gh[pousr]_[a-zA-Z0-9]{20,}|AIza[\w-]{30,})/,
    "secret apparent",
  ],
];

function cleanSource(raw, file) {
  if (typeof raw !== "string")
    throw new Error(`Le rôle ${file} n'a renvoyé aucun code.`);
  let source = raw.trim();
  const fence = source.match(
    /^```(?:javascript|js|css|html)?\s*\r?\n([\s\S]*?)\r?\n```$/i,
  );
  if (fence) source = fence[1].trim();
  if (!source || source.length > MAX_SOURCE_CHARS) {
    throw new Error(
      `La sortie ${file} est vide ou dépasse la limite autorisée.`,
    );
  }
  for (const [pattern, label] of CODE_DENYLIST) {
    if (pattern.test(source))
      throw new Error(`${file} rejeté : ${label} interdit.`);
  }
  return source;
}

function compactContract(spec, bp) {
  const design = spec.interface?.design || {};
  return {
    project: {
      name: spec.name || "Mon AiGENT",
      purpose: spec.purpose || "",
      tagline: spec.tagline || "",
      sector: spec.sector || "",
      audience: spec.audience || "",
      language: spec.language || "fr",
    },
    design: {
      palette: design.colors || null,
      font: design.font || null,
      tone: design.tone || null,
      density: design.density || null,
    },
    architecture: {
      domain: bp.sitePlan?.domainLabel || bp.domain,
      modules: bp.modules,
      modules: bp.modules,
      pages: (bp.sitePlan?.pages || []).map((page) => ({
        id: page.id,
        label: page.label,
        path: page.path,
        kind: page.kind,
        entity: page.entity || null,
        auth: Boolean(page.auth),
        features: page.features || [],
        components: page.components || [],
        actions: page.actions || [],
      })),
      navigation: (bp.sitePlan?.nav || [])
        .map((id) => {
          const page = bp.sitePlan?.pages?.find((item) => item.id === id);
          return page
            ? { id: page.id, label: page.label, path: page.path }
            : null;
        })
        .filter(Boolean),
      entities: (bp.sitePlan?.entities || []).map((entity) => ({
        id: entity.id,
        label: entity.label,
        fields: entity.fields,
      })),
    },
    api: {
      entities:
        "GET /api/entities/{id}; GET /api/entities/{id}/{itemId}; POST /api/entities/{id}; PATCH /api/entities/{id}/{itemId}; DELETE /api/entities/{id}/{itemId}",
      domain:
        "POST /api/domain/evaluate with a JSON object; returns { ok: true, result }",
      auth: "POST /api/auth/register, POST /api/auth/login, GET /api/auth/me, PATCH /api/auth/me",
    },
    constraints: [
      "Cette application est conçue pour le besoin et le public décrits, pas pour une boutique générique.",
      "Les pages et la navigation viennent du contrat. Ne pas ajouter de pages hors sujet.",
      "L'assistant est facultatif et ne doit apparaître que si une page ou une mission le justifie.",
      "L'aperçu fournit des réponses simulées à l'API; le backend exporté utilise les vraies routes.",
      "Ne prétends pas qu'une intégration externe fonctionne si elle n'est pas déclarée.",
    ],
  };
}

function createDocumentShell(contract) {
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  return `<!doctype html>\n<html lang="${esc(contract.project.language)}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="theme-color" content="#ffffff">\n<title>${esc(contract.project.name)}</title>\n<link rel="stylesheet" href="./styles.css">\n</head>\n<body>\n<div id="app"></div>\n<script src="./app.js"></script>\n</body>\n</html>`;
}

function serializeForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function ensureRuntimeConfig(app, contract) {
  const config = {
    name: contract.project.name,
    slug:
      contract.project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "mon-aigent",
    purpose: contract.project.purpose,
    tagline: contract.project.tagline,
    sector: contract.project.sector,
    language: contract.project.language,
    design: contract.design,
    domain: contract.architecture.domain,
    modules: contract.architecture.modules || {},
    nav: contract.architecture.navigation,
    sitePlan: {
      domainLabel: contract.architecture.domain,
      pages: contract.architecture.pages,
      nav: contract.architecture.navigation.map((page) => page.id),
      entities: contract.architecture.entities,
    },
  };
  return `;(()=>{const defaults=${serializeForScript(config)};const supplied=window.__APP__||{};window.__APP__=Object.assign({},defaults,supplied);window.__APP__.modules=Object.assign({},defaults.modules,supplied.modules||{});window.__APP__.sitePlan=Object.assign({},defaults.sitePlan,supplied.sitePlan||{});if(!Array.isArray(window.__APP__.sitePlan.entities)||!window.__APP__.sitePlan.entities.length)window.__APP__.sitePlan.entities=defaults.sitePlan.entities;})();\n${app}`;
}

function appendDeterministicEntityWorkspace(app, contract) {
  if (!contract.architecture.entities.length) return app;
  const descriptors = contract.architecture.entities.map((entity) => ({
    id: entity.id,
    label: entity.label,
    fields: entity.fields,
    path: `/api/entities/${entity.id}`,
  }));
  const embedded = serializeForScript(descriptors);
  return (
    `${app}\n;(()=>{\n` +
    `const appRoot=document.getElementById("app");if(!appRoot||appRoot.querySelector("[data-aigent-entity-workspace]"))return;\n` +
    `const entities=${embedded};const tokenKey="tok:"+(window.__APP__&&window.__APP__.slug||"site");let token=null;try{token=localStorage.getItem(tokenKey)}catch(_){}\n` +
    `const section=document.createElement("section");section.className="aigent-entity-workspace";section.dataset.aigentEntityWorkspace="true";\n` +
    `const heading=document.createElement("div");heading.className="aigent-entity-heading";const title=document.createElement("h2");title.textContent="Données de votre espace";const intro=document.createElement("p");intro.textContent="Vos contenus sont chargés depuis les rubriques configurées pour ce projet.";heading.append(title,intro);section.append(heading);\n` +
    `const request=async(path,options={})=>{const headers={"Content-Type":"application/json",...(options.headers||{})};if(token)headers.Authorization="Bearer "+token;const response=await fetch(path,{...options,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"Service de données indisponible.");return data};\n` +
    `const list=async(entity,host)=>{host.replaceChildren();const status=document.createElement("p");status.className="aigent-entity-status";status.textContent="Chargement…";host.append(status);try{const data=await request(entity.path);const items=Array.isArray(data.items)?data.items:[];host.replaceChildren();if(!items.length){const empty=document.createElement("p");empty.className="aigent-entity-status";empty.textContent="Aucun élément enregistré.";host.append(empty);return}for(const item of items){const row=document.createElement("article");row.className="aigent-entity-record";for(const field of entity.fields){if(item[field.key]==null||item[field.key]==="")continue;const line=document.createElement("p");const label=document.createElement("strong");label.textContent=field.label+" : ";line.append(label,document.createTextNode(String(item[field.key])));row.append(line)}host.append(row)}}catch(error){status.textContent=error.message;status.classList.add("is-error")}};\n` +
    `entities.forEach(entity=>{const card=document.createElement("article");card.className="aigent-entity-card";const cardTitle=document.createElement("h3");cardTitle.textContent=entity.label;const records=document.createElement("div");records.className="aigent-entity-records";card.append(cardTitle,records);const form=document.createElement("form");form.className="aigent-entity-form";for(const field of entity.fields){const label=document.createElement("label");label.textContent=field.label;let input;if(field.type==="richtext")input=document.createElement("textarea");else{input=document.createElement("input");input.type=field.type==="number"?"number":field.type==="date"?"date":"text"}input.name=field.key;input.required=true;label.append(input);form.append(label)}const submit=document.createElement("button");submit.type="submit";submit.textContent="Ajouter";form.append(submit);form.addEventListener("submit",async event=>{event.preventDefault();submit.disabled=true;try{const payload={};new FormData(form).forEach((value,key)=>{const field=entity.fields.find(item=>item.key===key);payload[key]=field&&field.type==="number"?Number(value):String(value)});await request(entity.path,{method:"POST",body:JSON.stringify(payload)});form.reset();await list(entity,records)}catch(error){submit.textContent=error.message}finally{submit.disabled=false}});card.append(form);section.append(card);void list(entity,records)});\n` +
    `const style=document.createElement("style");style.textContent=".aigent-entity-workspace{margin:32px auto;padding:24px;max-width:1100px;border:1px solid var(--border,#e5e7eb);border-radius:16px;background:var(--surface,#fff);color:var(--text,#202124);font:14px/1.5 var(--font,system-ui,sans-serif)}.aigent-entity-heading h2,.aigent-entity-card h3{margin:0 0 6px}.aigent-entity-heading p,.aigent-entity-status{margin:0 0 16px;color:var(--muted,#6b7280)}.aigent-entity-card{margin-top:20px;padding:18px;border:1px solid var(--border,#e5e7eb);border-radius:12px}.aigent-entity-record{margin:8px 0;padding:10px 12px;border-radius:8px;background:var(--bg,#f8fafc)}.aigent-entity-record p{margin:2px 0}.aigent-entity-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px}.aigent-entity-form label{display:grid;gap:5px;color:var(--muted,#6b7280);font-size:12px}.aigent-entity-form input,.aigent-entity-form textarea{width:100%;min-height:38px;padding:8px;border:1px solid var(--border,#d1d5db);border-radius:8px;background:var(--bg,#fff);color:var(--text,#202124);font:inherit}.aigent-entity-form button{align-self:end;min-height:38px;padding:8px 14px;border:0;border-radius:8px;background:var(--accent,#625bdb);color:#fff;font:inherit;cursor:pointer}.aigent-entity-form button:disabled{opacity:.6}.aigent-entity-status.is-error{color:#b42318}@media(max-width:600px){.aigent-entity-workspace{margin:18px 10px;padding:16px}}";section.prepend(style);appRoot.append(section);\n})();`
  );
}

const SYSTEM = `Tu écris des fichiers de production pour un site personnalisé. Tu reçois un contrat partagé et tu dois le suivre exactement.
Qualité attendue : interface soignée et cohérente, responsive, accessible au clavier, états vides/chargement/erreur traités, contenu métier concret. Le code est la sortie finale.
N'ajoute aucune dépendance, aucun CDN, aucune bibliothèque distante, aucune clé ni donnée personnelle réelle. N'utilise jamais eval, Function, import dynamique, innerHTML, outerHTML, document.write, accès fichiers/processus, ni script externe. Construis le DOM avec createElement et textContent.
Réponds uniquement avec le contenu complet du fichier demandé, sans Markdown ni commentaire autour.`;

const ALLOW_FALLBACK = process.env.AIGENT_ALLOW_FALLBACK === "1";
function fallbackOrThrow(role, error, make) {
  console.error(
    JSON.stringify({
      subsystem: "aigent.codegen",
      stage: `${role}.failed`,
      reason: String(error?.message || error).slice(0, 600),
    }),
  );
  if (!ALLOW_FALLBACK)
    throw new Error(`${ROLE_LABELS[role]} : ${error?.message || error}`);
  return make();
}
async function generate(
  role,
  file,
  contract,
  task,
  { maxTokens = 6500, repair = "" } = {},
) {
  const result = await callCode(
    [
      {
        role: "system",
        content: `${SYSTEM}\n\n${qualityRulesFor(role)}\n\nRÔLE : ${ROLE_LABELS[role]}.\nFICHIER : ${file}.`,
      },
      {
        role: "user",
        content: `CONTRAT:\n${JSON.stringify(contract)}\n\n${task}${repair ? `\n\nCORRECTIONS EXIGÉES APRÈS VALIDATION :\n${repair}` : ""}`,
      },
    ],
    { role, maxTokens },
  );
  return cleanSource(result, file);
}

function validateHtml(html) {
  if (!/^<!doctype html>/i.test(html))
    throw new Error("frontend/index.html doit commencer par un doctype HTML5.");
  if (!/<div\b[^>]*\bid=["']app["']/i.test(html))
    throw new Error("frontend/index.html doit exposer #app.");
  if (!/<link\b[^>]*href=["']\.\/styles\.css["']/i.test(html))
    throw new Error("La page doit charger son fichier styles.css local.");
  if (!/<script\s+src=["']\.\/app\.js["']\s*><\/script>/i.test(html))
    throw new Error(
      "La page doit charger son fichier app.js local avec le point d'injection AiGENT.",
    );
  if (/<(?:script|link)\b[^>]*(?:https?:)?\/\//i.test(html))
    throw new Error("Les ressources distantes sont interdites.");
  if (/<script\b[^>]*>\s*[\s\S]+?<\/script>/i.test(html))
    throw new Error("Le code JavaScript doit rester dans app.js.");
}

function validateCss(css) {
  const open = (css.match(/{/g) || []).length;
  const close = (css.match(/}/g) || []).length;
  if (!open || open !== close)
    throw new Error("frontend/styles.css contient des blocs CSS incomplets.");
  for (const token of [
    "--bg",
    "--surface",
    "--text",
    "--muted",
    "--accent",
    "--border",
    "--font",
  ]) {
    if (!css.includes(`var(${token}`))
      throw new Error(`Le style généré doit consommer le jeton var(${token}).`);
  }
  if (/@import\s+url|https?:\/\//i.test(css))
    throw new Error("Les feuilles de style externes sont interdites.");
}

// Missing theme-token references are normalized without changing the design.
// A cosmetic omission must not trigger two expensive model repair rounds.
function normalizeCssTokens(css) {
  const required = [
    "--bg",
    "--surface",
    "--text",
    "--muted",
    "--accent",
    "--border",
    "--font",
  ];
  const missing = required.filter((token) => !css.includes(`var(${token}`));
  if (!missing.length) return css;
  const aliases = missing
    .map((token) => `--_aigent_contract_${token.slice(2)}:var(${token})`)
    .join(";");
  return `${css}\n:root{${aliases}}\n`;
}

function validateSecurity(app, logic, html) {
  const rules = [
    [/(?:\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\()/i, "code dynamique"],
    [
      /(?:document\.write\s*\(|\binnerHTML\s*=|\bouterHTML\s*=)/i,
      "insertion HTML non sûre",
    ],
    [
      /(?:fetch\s*\(\s*["']https?:|\bWebSocket\s*\(|\bXMLHttpRequest\b)/i,
      "appel réseau externe",
    ],
    [
      /(?:<script\b[^>]*src=["']https?:|<iframe\b|javascript\s*:)/i,
      "contenu externe ou script embarqué",
    ],
  ];
  for (const [source, name] of [
    [app, "app.js"],
    [logic, "domain-logic.js"],
    [html, "index.html"],
  ]) {
    for (const [pattern, label] of rules) {
      if (pattern.test(source))
        throw new Error(`${name} rejeté : ${label} interdit.`);
    }
  }
  const backendRules = [
    [
      /\b(?:process|globalThis|global|require|module|exports)\b/,
      "accès au processus serveur",
    ],
    [/\b(?:window|document|navigator|localStorage)\b/, "accès au navigateur"],
    [
      /\b(?:fetch|XMLHttpRequest|WebSocket)\b/,
      "accès réseau depuis la logique métier",
    ],
    [/\b(?:eval|Function)\s*\(/, "évaluation dynamique"],
    [/\b(?:readFile|writeFile|exec|spawn)\w*\s*\(/, "E/S ou exécution"],
  ];
  for (const [pattern, label] of backendRules) {
    if (pattern.test(logic))
      throw new Error(
        `backend/src/domain-logic.js rejeté : ${label} interdit.`,
      );
  }
}

function syntaxCheck(source, filename) {
  const dir = mkdtempSync(join(tmpdir(), "aigent-source-"));
  const path = join(dir, filename.endsWith(".js") ? "check.mjs" : "check.js");
  try {
    writeFileSync(path, source, "utf8");
    execFileSync(process.execPath, ["--check", path], {
      timeout: 15000,
      stdio: "pipe",
    });
  } catch (error) {
    const details = Buffer.isBuffer(error.stderr)
      ? error.stderr.toString("utf8")
      : error.message;
    throw new Error(
      `${filename} invalide : ${details.trim().split("\n").slice(0, 3).join(" ")}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function validateDemoSeed(raw, contract) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.entities))
    throw new Error("Les données d'aperçu générées sont illisibles.");
  const wanted = new Map(
    contract.architecture.entities.map((entity) => [entity.id, entity]),
  );
  const clean = [];
  for (const group of raw.entities.slice(0, wanted.size)) {
    const entity = wanted.get(group?.id);
    if (!entity || !Array.isArray(group.items)) continue;
    const fieldMap = new Map(
      (entity.fields || []).map((field) => [field.key, field]),
    );
    const items = group.items
      .slice(0, 4)
      .map((item) => {
        const result = {};
        for (const [key, value] of Object.entries(item || {})) {
          const field = fieldMap.get(key);
          if (!field) continue;
          if (field.type === "number" && Number.isFinite(Number(value)))
            result[key] = Number(value);
          else if (typeof value === "string") result[key] = value.slice(0, 500);
        }
        return result;
      })
      .filter((item) => Object.keys(item).length);
    clean.push({ id: entity.id, items });
  }
  return { entities: clean };
}

async function requestDemoSeed(contract, correction = "") {
  return callLLM(
    [
      {
        role: "system",
        content: `Tu produis uniquement un objet JSON valide avec des exemples fictifs, clairement de démonstration, actuels et cohérents entre eux, en français. Aucun commentaire ni Markdown.\n\n${qualityRulesFor("seed")}`,
      },
      {
        role: "user",
        content: `Crée des exemples crédibles pour chaque entité de CE projet. Respecte exactement les identifiants, champs et types du contrat. Maximum 3 éléments par entité.\nCONTRAT: ${JSON.stringify(contract)}\nFORMAT: {"entities":[{"id":"identifiant","items":[{"champ":"valeur"}]}]}${correction ? `\n\nLa sortie précédente a échoué: ${correction}. Corrige et renvoie le JSON complet.` : ""}`,
      },
    ],
    {
      profile: "deep",
      maxTokens: 6000,
      expectJson: true,
      temperature: 0.25,
      order: [
        "github",
        "gemini",
        "groq",
        "cerebras",
        "nvidia",
        "mistral",
        "cohere",
        "pollinations",
        "openrouter",
        "cloudflare",
      ],
      maxModelTries: 1,
    },
  );
}

function validateCompleteDemoSeed(raw, contract) {
  const data = validateDemoSeed(raw, contract);
  const seeded = new Set(
    data.entities
      .filter((group) => group.items.length)
      .map((group) => group.id),
  );
  const missing = contract.architecture.entities
    .filter((entity) => (entity.fields || []).length && !seeded.has(entity.id))
    .map((entity) => entity.id);
  if (missing.length)
    throw new Error(`aucun élément valide pour ${missing.join(", ")}`);
  return data;
}

function verifyApiContract(app, contract) {
  const allowed = new Set([
    "/api/health",
    "/api/chat",
    "/api/knowledge",
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/me",
    "/api/domain/evaluate",
  ]);
  if (contract.architecture.entities.length) allowed.add("/api/entities/");
  for (const entity of contract.architecture.entities) {
    allowed.add(`/api/entities/${entity.id}`);
  }
  allowed.add("/api/entities");
  const literalPaths = [
    ...app.matchAll(/["'`]((?:\/api)\/[^"'`$]*)["'`]/g),
  ].map((m) => m[1]);
  const unsupported = literalPaths.filter(
    (path) =>
      !allowed.has(path) && !/^\/api\/entities\/[^/]+(?:\/[^/]+)?$/.test(path),
  );
  if (unsupported.length)
    throw new Error(
      `frontend/app.js: appels API absents du contrat : ${[...new Set(unsupported)].join(", ")}`,
    );
  const entityEndpointSource =
    /\/api\/entities(?:\/|\b)/i.test(app) ||
    /["'`]\/api["'`][\s\S]{0,100}["'`]entities(?:\/|["'`])/i.test(app);
  const dynamicEntityLoader =
    entityEndpointSource &&
    /\b(?:fetch|request|apiRequest|apiGet|apiCall)\s*\(|\bapi\s*\.\s*(?:get|request|fetch)\s*\(/i.test(
      app,
    ) &&
    /(?:sitePlan\s*\.\s*entities|architecture\s*\.\s*entities|entities\s*\.\s*(?:map|forEach|flatMap|reduce)|entity\s*\.\s*id|entityPaths|entityRoutes)/i.test(
      app,
    );
  if (
    contract.architecture.entities.length &&
    !entityEndpointSource &&
    !dynamicEntityLoader
  ) {
    throw new Error(
      "frontend/app.js: l'interface ne consomme aucune des données déclarées dans le contrat.",
    );
  }
  for (const entity of contract.architecture.entities) {
    if (!app.includes(`/api/entities/${entity.id}`) && !dynamicEntityLoader) {
      throw new Error(
        `frontend/app.js: aucune lecture de l'entité ${entity.id} déclarée dans le contrat.`,
      );
    }
  }
}

function verifyAppContent(app, contract) {
  if (!/window\.__APP__/.test(app)) {
    throw new Error(
      "frontend/app.js: l'application doit lire window.__APP__ (marque, pages, entités).",
    );
  }
  if (/(sneakers|colissimo|burrata|sac nomade|cmd-\d+)/i.test(app)) {
    throw new Error(
      "Des données de démonstration de boutique ont contaminé l'application.",
    );
  }
}

function verifyAppMount(app) {
  const rootLookup =
    /(?:getElementById\s*\(\s*["']app["']\s*\)|querySelector\s*\(\s*["']#app["']\s*\))/i;
  const domRender = /\.(?:append|appendChild|replaceChildren|prepend)\s*\(/i;
  if (!rootLookup.test(app) || !domRender.test(app)) {
    throw new Error(
      "frontend/app.js: aucun rendu DOM valide n'est monté dans #app.",
    );
  }
}

function verifyAppAuth(app, contract) {
  if (
    !contract.architecture.modules?.auth &&
    !contract.architecture.pages.some(
      (page) => page.auth || page.kind === "auth" || page.kind === "profile",
    )
  )
    return;
  for (const route of [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/me",
  ]) {
    if (!app.includes(route))
      throw new Error(
        `frontend/app.js: l'authentification requise ne consomme pas ${route}.`,
      );
  }
  const hasLoginUi =
    /(?:connexion|se connecter|mot de passe|password)/i.test(app) &&
    /(?:addEventListener\s*\(\s*["']submit|\.submit\s*\(|type\s*[:=]\s*["']password)/i.test(
      app,
    );
  const hasProfileUi =
    /(?:profil|mon compte|compte utilisateur)/i.test(app) &&
    /(?:\/api\/auth\/me["'`]|\/api\/auth\/me\s*\+)/i.test(app);
  if (!hasLoginUi || !hasProfileUi)
    throw new Error(
      "frontend/app.js: les écrans de connexion et de profil doivent être présents.",
    );
}

function verifyNoEmoji(app) {
  if (/\p{Extended_Pictographic}/u.test(app))
    throw new Error(
      "frontend/app.js contient un emoji. Utilise des icônes SVG intégrées.",
    );
}

function verifySvgIcons(app) {
  if (
    !/<svg\b/i.test(app) &&
    !/createElementNS\s*\(\s*["']http:\/\/www\.w3\.org\/2000\/svg/i.test(app)
  )
    throw new Error("frontend/app.js doit inclure des icônes SVG intégrées.");
  if (/\p{Extended_Pictographic}/u.test(app))
    throw new Error(
      "frontend/app.js doit utiliser des icônes SVG intégrées, jamais des emojis.",
    );
}

function verifyGeneratedSources(sources, contract) {
  try {
    validateHtml(sources["frontend/index.html"]);
  } catch (error) {
    throw new Error(`frontend/index.html: ${error.message}`);
  }
  sources["frontend/styles.generated.css"] = normalizeCssTokens(
    sources["frontend/styles.generated.css"],
  );
  try {
    validateCss(sources["frontend/styles.generated.css"]);
  } catch (error) {
    throw new Error(`frontend/styles.css: ${error.message}`);
  }
  verifyApiContract(sources["frontend/app.js"], contract);
  verifyAppContent(sources["frontend/app.js"], contract);
  verifyAppMount(sources["frontend/app.js"]);
  verifyAppAuth(sources["frontend/app.js"], contract);
  verifyNoEmoji(sources["frontend/app.js"]);
  verifySvgIcons(sources["frontend/app.js"]);
  if (
    !/export\s+(?:async\s+)?function\s+evaluate\s*\(/.test(
      sources["backend/src/domain-logic.js"],
    )
  ) {
    throw new Error(
      "backend/src/domain-logic.js: la fonction evaluate(input) requise est absente.",
    );
  }
  if (
    (sources["backend/src/domain-logic.js"].match(/\bexport\b/g) || [])
      .length !== 1
  ) {
    throw new Error(
      "backend/src/domain-logic.js: seul evaluate(input) doit être exporté.",
    );
  }
  validateSecurity(
    sources["frontend/app.js"],
    sources["backend/src/domain-logic.js"],
    sources["frontend/index.html"],
  );
  syntaxCheck(sources["frontend/app.js"], "frontend/app.js");
  syntaxCheck(
    sources["backend/src/domain-logic.js"],
    "backend/src/domain-logic.js",
  );
}

// La logique métier est l'unique fichier généré dont l'absence ne doit pas
// bloquer le livrable : elle reste isolée et peut toujours être remplacée.
// Ce repli pur garantit un backend exécutable même si le fournisseur renvoie
// un fichier vide ou du texte hors contrat.
function deterministicDomainLogic(contract) {
  const domain =
    `${contract.project?.sector || ""} ${contract.project?.purpose || ""}`.toLowerCase();
  const mode = /éduc|scol|cours|apprentiss|révision/.test(domain)
    ? "education"
    : /immobilier|logement|maison/.test(domain)
      ? "housing"
      : /emploi|carrière|recrut/.test(domain)
        ? "career"
        : "general";
  return (
    `export function evaluate(input) {\n` +
    `  const value = input && typeof input === "object" ? input : { value: input };\n` +
    `  const text = String(value.answer ?? value.text ?? value.value ?? "").trim();\n` +
    `  if (!text) return { ok: false, score: 0, feedback: "Ajoutez une réponse ou une donnée à analyser." };\n` +
    `  const words = text.split(/\\s+/).filter(Boolean);\n` +
    `  const score = Math.min(100, Math.round((words.length / Math.max(1, Number(value.expectedWords) || 20)) * 100));\n` +
    `  const feedback = ${JSON.stringify(mode)} === "education" ? (score >= 70 ? "Réponse suffisamment développée pour être relue." : "Ajoutez des explications ou des exemples pour compléter la réponse.") : "Donnée reçue et normalisée.";\n` +
    `  return { ok: true, score, wordCount: words.length, feedback, value: text };\n` +
    `}\n`
  );
}

function deterministicDemoSeed(contract) {
  return {
    entities: contract.architecture.entities.map((entity) => ({
      id: entity.id,
      items: [
        Object.fromEntries(
          (entity.fields || []).map((field) => [
            field.key,
            field.type === "number"
              ? 1
              : field.type === "boolean"
                ? false
                : field.type === "email"
                  ? "exemple@example.test"
                  : field.type === "date"
                    ? new Date().toISOString().slice(0, 10)
                    : field.type === "richtext"
                      ? `Exemple de ${field.label || entity.label}, à remplacer par vos données.`
                      : `Exemple de ${field.label || entity.label}`,
          ]),
        ),
      ].filter((item) => Object.keys(item).length),
    })),
  };
}

function deterministicStyles(contract) {
  const accent = /^#[\da-f]{6}$/i.test(contract.design?.palette?.accent || "")
    ? contract.design.palette.accent
    : "#655bd8";
  return `:root{--bg:#f7f8fa;--surface:#fff;--text:#202127;--muted:#747782;--accent:${accent};--border:#e7e8ed;--r:12px;--font:Inter,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 var(--font)}button,input{font:inherit}button{cursor:pointer}#app{min-height:100vh}.app-shell{max-width:1160px;margin:auto;padding:28px}.app-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 0 22px;border-bottom:1px solid var(--border)}.app-brand{font-size:20px;font-weight:700;letter-spacing:-.04em}.app-nav{display:flex;gap:6px;flex-wrap:wrap}.app-nav button,.app-action{border:1px solid var(--border);border-radius:8px;padding:8px 11px;background:var(--surface);color:var(--text)}.app-nav button:hover,.app-action:hover{filter:brightness(.96);color:var(--text)}.app-nav button[aria-current=true]{border-color:var(--accent);color:var(--accent)}main{padding:32px 0}.app-hero{max-width:720px;margin-bottom:26px}.app-hero h1{margin:0 0 8px;font-size:clamp(28px,4vw,42px);line-height:1.1;letter-spacing:-.05em}.app-hero p{color:var(--muted)}.app-content{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.app-card{min-width:0;padding:18px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface)}.app-card h2{margin:0 0 8px;font-size:16px}.app-list{padding-left:20px;color:var(--muted)}.app-table-wrap{max-width:100%;overflow:auto}.app-table{width:100%;border-collapse:collapse}.app-table th,.app-table td{text-align:left;padding:9px;border-bottom:1px solid var(--border);overflow-wrap:anywhere}.app-empty,.app-muted{color:var(--muted)}.app-form{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.app-form input{min-width:120px;flex:1;padding:8px;border:1px solid var(--border);border-radius:8px}.app-action{background:var(--accent);border-color:var(--accent);color:white}.app-action:hover{background:color-mix(in srgb,var(--accent) 88%,#000);color:#fff}.app-error{padding:10px;border-radius:8px;background:#f3f4f6;color:#535862}.app-loading{color:var(--muted)}.app-auth{max-width:440px;margin:50px auto}.app-auth form{display:grid;gap:12px}.app-auth input{padding:10px;border:1px solid var(--border);border-radius:8px}@media(max-width:640px){.app-shell{padding:16px}.app-head{align-items:flex-start;flex-direction:column}.app-nav{width:100%}.app-nav button{flex:1}.app-form input{min-width:100%}}`;
}

function deterministicFrontend(contract) {
  const pages = JSON.stringify(
    contract.architecture.pages.map(
      ({ id, label, path, kind, entity, features }) => ({
        id,
        label,
        path,
        kind,
        entity,
        features,
      }),
    ),
  );
  const entities = JSON.stringify(
    contract.architecture.entities.map(({ id, label, fields }) => ({
      id,
      label,
      fields: fields || [],
    })),
  );
  const name = JSON.stringify(contract.project.name);
  const purpose = JSON.stringify(
    contract.project.purpose ||
      contract.project.tagline ||
      contract.project.name,
  );
  const entityFetches = contract.architecture.entities
    .map((entity) => `api("/api/entities/${entity.id}")`)
    .join(",");
  const auth =
    contract.architecture.modules?.auth ||
    contract.architecture.pages.some(
      (p) => p.auth || p.kind === "auth" || p.kind === "profile",
    );
  return `/* Inline SVG is created with the native DOM API. */\nconst APP=window.__APP__||{};const pages=${pages};const entities=${entities};const declaredEntityRoutes=${JSON.stringify(contract.architecture.entities.map((entity) => `/api/entities/${entity.id}`))};const root=document.getElementById("app");const tokenKey="tok:"+(APP.slug||"app");const api=async(path,options={})=>{const token=localStorage.getItem(tokenKey);const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}) ,...(options.headers||{})}});if(!response.ok){const error=new Error(response.status===401||response.status===403?"Votre session a expiré. Reconnectez-vous pour continuer.":"Ce service est momentanément indisponible. Vos données sont conservées, réessayez dans un instant.");error.status=response.status;throw error}return response.json()};const node=(tag,cls,text)=>{const item=document.createElement(tag);if(cls)item.className=cls;if(text!=null)item.textContent=text;return item};const isPreview=Boolean(APP.previewMode||window.__AIGENT_PREVIEW__||new URLSearchParams(location.search).has("__shot"));let active=(pages.find(p=>p.kind!=="auth")||pages[0])?.id||"home";const cache=new Map();void declaredEntityRoutes;function editAction(entity,item,load,list){const button=node("button","app-action","Modifier");button.type="button";button.addEventListener("click",async()=>{const payload={};for(const field of entity.fields.slice(0,4)){const value=prompt(field.label,String(item[field.key]??""));if(value===null)return;payload[field.key]=value}try{await api("/api/entities/"+entity.id+"/"+encodeURIComponent(item.id),{method:"PATCH",body:JSON.stringify(payload)});load()}catch(error){showError(list,error)}});return button}function showError(target,error){target.replaceChildren(node("p","app-error",error?.message||"Une erreur temporaire empêche le chargement. Réessayez."));const retry=node("button","app-action","Réessayer");retry.type="button";retry.addEventListener("click",render);target.append(retry)}function render(){root.replaceChildren();const shell=node("div","app-shell");const header=node("header","app-head");const brand=node("div","app-brand",${name});const mark=document.createElementNS("http://www.w3.org/2000/svg","svg");mark.setAttribute("viewBox","0 0 24 24");mark.setAttribute("aria-hidden","true");const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d","M4 12 12 4l8 8-8 8-8-8Zm4 0 4-4 4 4-4 4-4-4Z");mark.append(path);brand.prepend(mark);const nav=node("nav","app-nav");for(const p of pages){const b=node("button","",p.label);b.type="button";b.setAttribute("aria-current",String(active===p.id));b.addEventListener("click",()=>{active=p.id;render()});nav.append(b)}header.append(brand,nav);shell.append(header);const main=node("main");const page=pages.find(p=>p.id===active)||pages[0];const hero=node("section","app-hero");hero.append(node("h1","",page?.label||${name}),node("p","",${purpose}));main.append(hero);const content=node("section","app-content");const relevant=entities.filter(e=>!page?.entity||e.id===page.entity);const shown=relevant.length?relevant:entities;if(shown.length){for(const entity of shown){const card=node("article","app-card");card.append(node("h2","",entity.label));const list=node("div","app-loading","Chargement des données…");card.append(list);const load=async()=>{try{const result=await api("/api/entities/"+entity.id);const items=result.items||result.data||result.entities||[];cache.set(entity.id,items);list.replaceChildren();if(!items.length){list.append(node("p","app-empty","Aucune donnée pour le moment."))}else{const wrap=node("div","app-table-wrap"),table=node("table","app-table"),head=node("tr");for(const field of entity.fields)head.append(node("th","",field.label));const thead=node("thead");thead.append(head);table.append(thead);const tbody=node("tbody");for(const item of items){const row=node("tr");for(const field of entity.fields)row.append(node("td","",String(item[field.key]??"—")));const actions=node("td");const del=node("button","app-action","Supprimer");del.type="button";del.addEventListener("click",async()=>{if(!confirm("Supprimer cet élément ?"))return;try{await api("/api/entities/"+entity.id+"/"+encodeURIComponent(item.id),{method:"DELETE"});load()}catch(error){showError(list,error)}});actions.append(editAction(entity,item,load,list),del);row.append(actions);tbody.append(row)}table.append(tbody);wrap.append(table);list.append(wrap)} }catch(error){showError(list,error)}};void load();const form=node("form","app-form");for(const field of entity.fields.slice(0,4)){const input=node("input");input.name=field.key;input.placeholder=field.label;input.setAttribute("aria-label",field.label);form.append(input)}if(entity.fields.length){const submit=node("button","app-action","Ajouter");submit.type="submit";form.append(submit);form.addEventListener("submit",async event=>{event.preventDefault();const payload=Object.fromEntries(new FormData(form));try{await api("/api/entities/"+entity.id,{method:"POST",body:JSON.stringify(payload)});form.reset();load()}catch(error){showError(list,error)}});card.append(form)}content.append(card)}}else{const card=node("article","app-card");card.append(node("h2","",page?.label||${name}),node("p","app-empty","Aucun module de données n’est requis ici. Votre espace est prêt."));content.append(card)}shell.append(main,content);root.append(shell)}function authScreen(){root.replaceChildren();const panel=node("section","app-card app-auth");panel.append(node("h1","",${JSON.stringify(contract.project.name)}),node("p","app-muted","Connectez-vous pour retrouver votre espace personnel."));const form=node("form");let registering=false;const name=node("input");name.name="username";name.placeholder="Nom affiché";name.hidden=true;const email=node("input"),password=node("input");email.type="email";email.name="email";email.required=true;email.autocomplete="username";email.placeholder="Adresse e-mail";password.type="password";password.name="password";password.required=true;password.autocomplete="current-password";password.placeholder="Mot de passe";const status=node("p","app-muted");const submit=node("button","app-action","Se connecter");submit.type="submit";const toggle=node("button","app-action","Créer un compte");toggle.type="button";toggle.addEventListener("click",()=>{registering=!registering;name.hidden=!registering;name.required=registering;submit.textContent=registering?"Créer mon compte":"Se connecter";toggle.textContent=registering?"Utiliser un compte existant":"Créer un compte"});form.append(name,email,password,submit,toggle);form.addEventListener("submit",async event=>{event.preventDefault();submit.disabled=true;try{const result=await api(registering?"/api/auth/register":"/api/auth/login",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(form)))});if(result.token)localStorage.setItem(tokenKey,result.token);await api("/api/auth/me");render()}catch(error){status.textContent=error.message;submit.disabled=false}});panel.append(form,status);root.append(panel)}render();${auth ? `const authRoutes=["/api/auth/login","/api/auth/register","/api/auth/me"];if(!isPreview){if(!localStorage.getItem(tokenKey))authScreen();else api("/api/auth/me").catch(()=>{localStorage.removeItem(tokenKey);authScreen()})}` : `void ${JSON.stringify(entityFetches)};`}`;
}

async function repairOneSource(sources, contract, error) {
  const message = String(error?.message || error);
  const entityPaths = contract.architecture.entities.map(
    (entity) => `/api/entities/${entity.id}`,
  );
  const entityRepair =
    /données déclarées|lecture de l'entité/i.test(message) && entityPaths.length
      ? `\nRéparation prioritaire du chargement réel : l'application doit appeler le backend pour chaque entité. Ajoute une table de chemins contenant exactement ${JSON.stringify(entityPaths)}, puis charge chaque chemin avec fetch (ou un chargeur qui appelle réellement fetch). Le rendu des pages doit utiliser ces réponses, jamais seulement les données de démonstration.`
      : "";
  const correction = `${message}${entityRepair}\nRéécris seulement ce fichier complet. Respecte de nouveau toutes les contraintes du contrat, en particulier l'usage du DOM natif sûr.`;
  if (message.startsWith("frontend/styles.css:")) {
    sources["frontend/styles.generated.css"] = await generate(
      "design",
      "frontend/styles.css",
      contract,
      "Répare la feuille CSS générée.",
      { maxTokens: 5000, repair: correction },
    );
  } else if (message.startsWith("frontend/index.html:")) {
    throw new Error("Le squelette HTML interne a échoué à la validation.");
  } else if (message.startsWith("backend/src/domain-logic.js:")) {
    sources["backend/src/domain-logic.js"] = await generate(
      "backend",
      "backend/src/domain-logic.js",
      contract,
      "Répare la logique métier générée.",
      { maxTokens: 3500, repair: correction },
    );
  } else {
    sources["frontend/app.js"] = ensureRuntimeConfig(
      await generate(
        "frontend",
        "frontend/app.js",
        contract,
        "Répare l'application générée.",
        { maxTokens: 9000, repair: correction },
      ),
      contract,
    );
  }
}

/** Génère de vrais fichiers front et une logique métier serveur indépendante
 *  du kit auth/base de données. Aucun repli vers le shell historique : si un
 *  rôle ou une vérification échoue, le build s'arrête avec ses diagnostics. */
export async function generateApplicationCode(
  spec,
  bp,
  { onEvent = () => {} } = {},
) {
  const qualityFallbacks = new Set();
  const contract = compactContract(spec, bp);
  console.info(
    JSON.stringify({
      subsystem: "aigent.planner",
      stage: "generateApplicationCode.enter",
      pagesCount: contract.architecture.pages.length,
      entitiesCount: contract.architecture.entities.length,
      rejectedBecause: contract.architecture.pages.length
        ? null
        : "contract.architecture.pages est vide après compactContract(bp)",
    }),
  );
  if (!contract.architecture.pages.length) {
    throw new Error(
      "Aucun plan de pages validé : impossible de construire une application propre au besoin.",
    );
  }
  const emit = (event) => {
    try {
      onEvent(event);
    } catch {}
  };
  emit({
    type: "codegen_start",
    role: "design",
    files: ["frontend/styles.css"],
  });
  const cssPromise = generate(
    "design",
    "frontend/styles.css",
    contract,
    `Écris une feuille CSS complète et distinctive pour CE secteur et ces pages. Utilise les variables de thème var(--bg), --surface, --text, --muted, --accent, --border, --r et --font. Définis une vraie grille de mise en page, une navigation adaptée au nombre de pages, des composants métier utiles et des adaptations mobile. Pas de règle qui impose partout le même hero, footer ou bouton assistant.`,
    { maxTokens: 5000 },
  ).catch((error) => {
    qualityFallbacks.add("design");
    return fallbackOrThrow("design", error, () =>
      deterministicStyles(contract),
    );
  });
  emit({
    type: "codegen_start",
    role: "frontend",
    files: ["frontend/index.html", "frontend/app.js"],
  });
  const html = createDocumentShell(contract);
  const entityPaths = contract.architecture.entities.map(
    (entity) => `/api/entities/${entity.id}`,
  );
  const entityReads = entityPaths.join(", ") || "aucune entité";
  const frontendPromise = generate(
    "frontend",
    "frontend/app.js",
    contract,
    `Écris toute l'application navigateur personnalisée. Le fichier index ne contient que <div id="app"></div> comme point d'entrée. OBLIGATION: récupère ce conteneur avec document.getElementById("app") ou document.querySelector("#app") et monte dedans la navigation et le contenu avec append/appendChild/replaceChildren. Ne cible aucun autre identifiant de montage. Conçois navigation et chaque page du contrat avec des composants propres à leur fonction; chaque page doit avoir son propre contenu et comportement, pas un placeholder. Utilise window.__APP__ et window.__APP__.sitePlan pour les données de marque, pages, entités et auth. Fournis un routeur hash, navigable au clavier, un état de chargement et des erreurs lisibles. L'application DOIT charger, afficher et modifier les données réelles de chaque entité déclarée. Inclus et UTILISE ces chemins d'API exacts dans des appels réseau, un par entité : ${JSON.stringify(entityPaths)}. Même si tu crées un chargeur générique, sa table de routes doit contenir ces chemins littéraux exacts et le rendu des pages doit consommer les réponses. Elle doit utiliser POST /api/entities/<id> pour créer, PATCH /api/entities/<id>/<itemId> pour modifier et DELETE /api/entities/<id>/<itemId> pour supprimer, avec confirmation avant suppression. Si une page de profil est demandée, charger /api/auth/me et présenter un vrai formulaire sauvegardable. Si l'auth est active, créer de vrais écrans connexion/inscription, gérer les réponses serveur, protéger les pages privées et afficher une action de déconnexion; appels auth: POST /api/auth/login, POST /api/auth/register, GET /api/auth/me. L'assistant peut appeler POST /api/chat seulement s'il est pertinent. Aucun fetch vers une route absente du contrat. Pour les calculs métier, appelle POST /api/domain/evaluate avec {input:...}; affiche proprement le résultat. Stocke le jeton de session sous tok:<slug> et envoie Authorization: Bearer <jeton>. Construis le DOM avec les API natives du navigateur, sans innerHTML ni données fictives de boutique. Utilise des SVG inline accessibles pour les icônes, jamais d'emoji. Le résultat doit être une application complète, sans import ni dépendance.`,
    { maxTokens: 12000 },
  ).catch((error) => {
    qualityFallbacks.add("frontend");
    console.warn(
      JSON.stringify({
        subsystem: "aigent.codegen",
        stage: "frontend.generation_fallback",
        reason: String(error?.message || error),
      }),
    );
    return deterministicFrontend(contract);
  });
  emit({
    type: "codegen_start",
    role: "backend",
    files: ["backend/src/domain-logic.js"],
  });
  const backendPromise = generate(
    "backend",
    "backend/src/domain-logic.js",
    contract,
    `Écris une fonction de logique métier pure appelée evaluate(input). Elle doit calculer ou transformer quelque chose de réellement utile au secteur et aux missions du projet; pour une application d'apprentissage, par exemple corriger une réponse ou calculer une progression. Elle ne fait aucune E/S, ne lit aucune variable d'environnement et n'importe rien. Le fichier contient exactement UN export: export function evaluate(input) ou export async function evaluate(input). Aucun autre export, import, constante exportée ou commentaire avant/après. Valide l'entrée et renvoie une valeur JSON sérialisable. N'invente pas de service externe.`,
    { maxTokens: 3500 },
  ).catch((error) => {
    qualityFallbacks.add("backend");
    console.warn(
      JSON.stringify({
        subsystem: "aigent.codegen",
        stage: "domain_logic.generation_fallback",
        reason: String(error?.message || error),
        result: "deterministic",
      }),
    );
    return deterministicDomainLogic(contract);
  });
  emit({
    type: "codegen_start",
    role: "seed",
    files: ["builder/demo-data.json"],
  });
  const seedPromise = contract.architecture.entities.length
    ? requestDemoSeed(contract)
    : Promise.resolve(null);
  seedPromise.catch(() => null);

  const [cssRaw, generatedApp, logic] = await Promise.all([
    cssPromise,
    frontendPromise,
    backendPromise,
  ]);
  const app = ensureRuntimeConfig(generatedApp, contract);
  let sources = {
    "frontend/index.html": html,
    "frontend/styles.generated.css": cssRaw,
    "frontend/app.js": app,
    "backend/src/domain-logic.js": logic,
    "builder/site-contract.json": JSON.stringify(contract, null, 2),
  };
  let verified = false;
  try {
    verifyGeneratedSources(sources, contract);
    verified = true;
  } catch (firstError) {
    let repairError = firstError;
    if (/backend\/src\/domain-logic\.js:/.test(firstError.message)) {
      qualityFallbacks.add("backend");
      sources["backend/src/domain-logic.js"] =
        deterministicDomainLogic(contract);
      try {
        verifyGeneratedSources(sources, contract);
        verified = true;
        console.warn(
          JSON.stringify({
            subsystem: "aigent.codegen",
            stage: "domain_logic.fallback",
            reason: firstError.message,
            result: "accepted",
          }),
        );
      } catch (fallbackError) {
        repairError = fallbackError;
        console.error(
          JSON.stringify({
            subsystem: "aigent.codegen",
            stage: "domain_logic.fallback",
            reason: fallbackError.message,
            result: "rejected",
          }),
        );
      }
    }
    if (
      contract.architecture.entities.length &&
      /aucune lecture de l'entité|ne consomme aucune des données déclarées/i.test(
        firstError.message,
      )
    ) {
      sources["frontend/app.js"] = appendDeterministicEntityWorkspace(
        sources["frontend/app.js"],
        contract,
      );
      try {
        verifyGeneratedSources(sources, contract);
        verified = true;
        console.info(
          JSON.stringify({
            subsystem: "aigent.codegen",
            stage: "entity_workspace.fallback",
            entities: contract.architecture.entities.map((entity) => entity.id),
            result: "accepted",
          }),
        );
      } catch (fallbackError) {
        repairError = fallbackError;
        console.warn(
          JSON.stringify({
            subsystem: "aigent.codegen",
            stage: "entity_workspace.fallback",
            result: "rejected",
            reason: fallbackError.message,
          }),
        );
      }
    }
    if (!verified) {
      emit({ type: "codegen_repair", error: repairError.message });
      await repairOneSource(sources, contract, repairError);
      try {
        verifyGeneratedSources(sources, contract);
        verified = true;
      } catch (secondError) {
        emit({ type: "codegen_repair", error: secondError.message });
        await repairOneSource(sources, contract, secondError);
        try {
          verifyGeneratedSources(sources, contract);
          verified = true;
        } catch (finalError) {
          if (!ALLOW_FALLBACK) throw finalError;
          // Dernier filet local : remplacer le fragment qui échoue par une
          // Dernier filet local : remplacer le fragment qui échoue par une
          // application déterministe branchée sur le même contrat/API.
          sources["frontend/app.js"] = deterministicFrontend(contract);
          sources["frontend/styles.generated.css"] =
            deterministicStyles(contract);
          sources["backend/src/domain-logic.js"] =
            deterministicDomainLogic(contract);
          ["frontend", "design", "backend"].forEach((role) =>
            qualityFallbacks.add(role),
          );
          try {
            verifyGeneratedSources(sources, contract);
            verified = true;
            console.warn(
              JSON.stringify({
                subsystem: "aigent.codegen",
                stage: "complete_site.fallback",
                reason: finalError.message,
                result: "accepted",
              }),
            );
          } catch (fallbackError) {
            throw new Error(
              `Le contrôle final du site de repli a échoué : ${fallbackError.message}`,
            );
          }
        }
      }
    }
  }
  let demoData = { entities: [] };
  if (contract.architecture.entities.length) {
    try {
      demoData = validateCompleteDemoSeed(
        extractJSON(await seedPromise),
        contract,
      );
    } catch (error) {
      try {
        demoData = validateCompleteDemoSeed(
          extractJSON(await requestDemoSeed(contract, error.message)),
          contract,
        );
      } catch (repairError) {
        demoData = validateCompleteDemoSeed(
          deterministicDemoSeed(contract),
          contract,
        );
        qualityFallbacks.add("seed");
        console.warn(
          JSON.stringify({
            subsystem: "aigent.codegen",
            stage: "demo_seed.fallback",
            reason: repairError.message,
            result: "accepted",
          }),
        );
      }
    }
  }
  sources["builder/demo-data.json"] = JSON.stringify(demoData, null, 2);
  for (const name of ["design", "frontend", "backend"])
    emit({ type: "codegen_done", role: name });
  emit({ type: "codegen_done", role: "seed" });
  emit({ type: "codegen_start", role: "verify", files: Object.keys(sources) });
  emit({
    type: "codegen_done",
    role: "verify",
    checks: [
      "contrat API",
      "HTML local",
      "syntaxe JS",
      "tokens CSS",
      "sécurité de base",
      "seed métier",
    ],
  });
  // Contract validity proves that files can run and use declared APIs; it does
  // not prove that the generated experience is project-specific. A deterministic
  // frontend/backend/design replacement must therefore be disclosed before the
  // build is published, even though it passed technical validation.
  const degraded = ["frontend", "backend", "design"].some((role) =>
    qualityFallbacks.has(role),
  );
  return {
    sources,
    contract,
    degraded,
    recovered: qualityFallbacks.size > 0,
    qualityFallbacks: [...qualityFallbacks],
  };
}

export const __aigentCodegenTestHooks = {
  deterministicDomainLogic,
  deterministicDemoSeed,
  deterministicStyles,
  deterministicFrontend,
  cleanSource,
  validateHtml,
  validateCss,
  normalizeCssTokens,
  validateSecurity,
  verifyApiContract,
  verifyAppContent,
  verifyAppMount,
  verifyAppAuth,
  verifyNoEmoji,
  verifyGeneratedSources,
  validateDemoSeed,
  validateCompleteDemoSeed,
  compactContract,
  ensureRuntimeConfig,
  appendDeterministicEntityWorkspace,
};
