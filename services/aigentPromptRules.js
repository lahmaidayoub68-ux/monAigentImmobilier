import { readFileSync } from "node:fs";

const FILES = {
  core: "AIGENT_QUALITY_CORE.txt",
  architecture: "AIGENT_QUALITY_ARCHITECTURE.txt",
  design: "AIGENT_QUALITY_DESIGN.txt",
  frontend: "AIGENT_QUALITY_FRONTEND.txt",
  backend: "AIGENT_QUALITY_BACKEND.txt",
  review: "AIGENT_QUALITY_REVIEW.txt",
};

const cache = new Map();

function readRule(name) {
  if (!FILES[name]) throw new Error(`Règles de qualité inconnues : ${name}`);
  if (!cache.has(name)) {
    cache.set(name, readFileSync(new URL(`./prompts/${FILES[name]}`, import.meta.url), "utf8").trim());
  }
  return cache.get(name);
}

const ROLE_RULE = {
  architect: "architecture",
  integrator: "architecture",
  design: "design",
  uiux: "design",
  frontend: "frontend",
  composer: "frontend",
  backend: "backend",
  seed: "backend",
  security: "review",
  qa: "review",
  verify: "review",
};

/** Le socle s'applique à chaque appel; la seconde charte spécialise le rôle. */
export function qualityRulesFor(role = "product") {
  const extra = ROLE_RULE[role];
  return extra ? `${readRule("core")}\n\n${readRule(extra)}` : readRule("core");
}

export function __qualityRuleTestHooks() {
  return { files: Object.keys(FILES), roles: { ...ROLE_RULE }, clearCache: () => cache.clear() };
}
