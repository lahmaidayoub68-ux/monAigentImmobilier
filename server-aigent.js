//======================================================================//
//  AiGENT MASTER — ROUTER « CRÉEZ VOTRE AiGENT »
//----------------------------------------------------------------------//
//  express.Router() monté dans server.js :  app.use(aigentRoutes)
//
//  Contenu :
//   • Authentification transverse : on ne se connecte à AiGENT QUE si
//     l'on possède déjà un compte Immo, Occas ou Emploi. Le mot de passe
//     est vérifié contre la base d'origine ; aucune donnée n'est dupliquée
//     hors du strict nécessaire (lien de compte).
//   • Builder conversationnel : machine d'états déterministe + IA pour la
//     compréhension, les propositions et la formulation. Le chat ne génère
//     jamais de code immédiatement ; il comprend, explore, conçoit, valide.
//   • État persistant versionné (spec + historique) → retour arrière réel.
//   • Construction d'un vrai projet logiciel, aperçu navigateur, export ZIP.
//
//  ISOLATION : aucune clé AiGENT ne sort d'ici. Le bac à sable de test
//  tourne côté serveur avec NOS providers ; le projet exporté, lui, ne
//  contient que des variables d'environnement vides.
//======================================================================//

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "./db.js";
import { normalizeDesign } from "./public/aigent-design.js"; // ajuste le chemin selon ton arborescence

import AI, {
  emptySpec,
  applyPatch,
  slugify,
  understandIdea,
  extractSpecPatch,
  proposeIdentity,
  proposeArchitecture,
  proposeWorkflows,
  proposeStyles,
  analyzeFeasibility,
  buildRecap,
  thinkingSteps,
  answerFreeform,
  generateAgentSystemPrompt,
  generateKnowledgeSkeleton,
  runAgentSandbox,
  phrase,
  computeIntegrations,
  completeness,
  probeProviders,
  TOOL_CATALOG,
  SERVICE_CATALOG,
  STYLE_PRESETS,
  INTERFACE_KINDS,
  KNOWLEDGE_TYPES,
} from "./services/aiParsee-aigent.js";

import {
  generateProject,
  generateProjectWithAgents,
  finalizeBlueprint,
  deriveBlueprint,
  buildZip,
  buildPreviewHtml,
  sanitizeSpec,
} from "./services/aigentGenerator.js";
// APRÈS — ajouter cette ligne d'import à côté des autres imports de services
import {
  runMultiAgentBuild,
  suggestCapabilities,
} from "./services/aigentAgents.js";
dotenv.config();

const router = express.Router();

const AIGENT_JWT_SECRET =
  process.env.AIGENT_JWT_SECRET || process.env.JWT_SECRET;
if (!AIGENT_JWT_SECRET)
  throw new Error("AIGENT_JWT_SECRET (ou JWT_SECRET) manquant");

const LOGO = "./images/aigent.png";

/* ════════════════════════════════════════════════════════════════════
   RATE LIMITS
   ════════════════════════════════════════════════════════════════════ */
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
const chatLimiter = rateLimit({ windowMs: 60_000, max: 40 });
const buildLimiter = rateLimit({ windowMs: 5 * 60_000, max: 10 });
const previewLimiter = rateLimit({ windowMs: 60_000, max: 25 });

router.use("/api/aigent/login", authLimiter);
router.use("/api/aigent/register", authLimiter);
router.use("/api/aigent/check-account", authLimiter);

/* ════════════════════════════════════════════════════════════════════
   TABLES
   ════════════════════════════════════════════════════════════════════ */

await db
  .prepare(
    `CREATE TABLE IF NOT EXISTS aigent_accounts (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,                 -- immo | occas | emploi
      source_user_id INTEGER,
      username TEXT NOT NULL,
      contact TEXT DEFAULT '',
      avatar TEXT DEFAULT '/images/user-avatar.jpg',
      plan TEXT DEFAULT 'free',
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source, username)
    )`,
  )
  .run();

await db
  .prepare(
    `CREATE TABLE IF NOT EXISTS aigent_projects (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES aigent_accounts(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      name TEXT DEFAULT 'Nouveau AiGENT',
      phase TEXT NOT NULL DEFAULT 'idea',
      status TEXT NOT NULL DEFAULT 'draft',   -- draft | built | exported
      spec JSONB NOT NULL DEFAULT '{}'::jsonb,
      history JSONB NOT NULL DEFAULT '[]'::jsonb,  -- pile de specs précédentes (undo)
      pending JSONB NOT NULL DEFAULT '{}'::jsonb,  -- questions en attente, propositions
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  )
  .run();

await db
  .prepare(
    `CREATE TABLE IF NOT EXISTS aigent_messages (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES aigent_projects(id) ON DELETE CASCADE,
      role TEXT NOT NULL,              -- user | assistant | system
      content TEXT NOT NULL DEFAULT '',
      panel JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  )
  .run();

await db
  .prepare(
    `CREATE TABLE IF NOT EXISTS aigent_builds (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES aigent_projects(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
      files JSONB NOT NULL DEFAULT '{}'::jsonb,
      preview_html TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  )
  .run();

await db
  .prepare(
    `CREATE TABLE IF NOT EXISTS aigent_sandbox (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES aigent_projects(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  )
  .run();
await db
  .prepare(
    `CREATE TABLE IF NOT EXISTS aigent_previews (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES aigent_projects(id) ON DELETE CASCADE,
      build_id INTEGER NOT NULL REFERENCES aigent_builds(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT 'image/webp',
      data BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (build_id, idx)
    )`,
  )
  .run();

await db
  .prepare(
    `ALTER TABLE aigent_accounts ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  )
  .run();
await db
  .prepare(
    `CREATE TABLE IF NOT EXISTS aigent_identities (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES aigent_accounts(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,                -- google | github
      provider_user_id TEXT NOT NULL,
      email TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (provider, provider_user_id)
    )`,
  )
  .run();

console.log("✦ AiGENT Master — tables prêtes");

/* ════════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════════ */

function fail(res, status, error, extra = {}) {
  return res.status(status).json({ success: false, error, ...extra });
}

function safeJson(v, fallback = {}) {
  try {
    if (v == null) return fallback;
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return fallback;
  }
}

const generateAigentToken = (account) =>
  jwt.sign(
    {
      accountId: account.id,
      username: account.username,
      source: account.source,
      contact: account.contact || "",
    },
    AIGENT_JWT_SECRET,
    { expiresIn: "12h" },
  );

const authenticateAigent = (req, res, next) => {
  const token =
    req.headers.authorization?.split(" ")[1] || req.query.token || null;
  if (!token) return fail(res, 401, "Authentification requise");
  jwt.verify(token, AIGENT_JWT_SECRET, (err, payload) => {
    if (err) return fail(res, 403, "Session expirée, reconnectez-vous");
    req.user = payload;
    next();
  });
};

/* ── Sources de comptes ─────────────────────────────────────────────
   AiGENT n'a pas de base d'utilisateurs propre : il s'appuie sur les
   comptes déjà créés dans les AiGENT spécialisés.                    */
const SOURCES = [
  {
    key: "immo",
    label: "AiGENT Immo",
    table: "users",
    idCol: "id",
    userCol: "username",
    passCol: "password",
    mailCol: "contact",
    avatarCol: "avatar",
  },
  {
    key: "occas",
    label: "AiGENT Occas",
    table: "users_occas",
    idCol: "id",
    userCol: "username",
    passCol: "password",
    mailCol: "contact",
    avatarCol: "avatar",
  },
  {
    key: "emploi",
    label: "AiGENT Emploi",
    table: "users_emploi",
    idCol: "id",
    userCol: "username",
    passCol: "password",
    mailCol: "contact",
    avatarCol: "avatar",
  },
];

const tableExistsCache = new Map();
async function tableExists(name) {
  if (tableExistsCache.has(name)) return tableExistsCache.get(name);
  let exists = false;
  try {
    const rows = await db
      .prepare(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
      )
      .all(name);
    exists = !!rows?.length;
  } catch {
    exists = false;
  }
  tableExistsCache.set(name, exists);
  return exists;
}

/** Cherche un compte par pseudo OU email dans une source donnée. */
async function findInSource(src, identifier) {
  if (!(await tableExists(src.table))) return null;
  const id = String(identifier || "")
    .trim()
    .toLowerCase();
  if (!id) return null;
  try {
    return await db
      .prepare(
        `SELECT ${src.idCol} AS id, ${src.userCol} AS username, ${src.passCol} AS password,
                ${src.mailCol} AS contact, ${src.avatarCol} AS avatar
         FROM ${src.table}
         WHERE LOWER(TRIM(${src.userCol})) = $1 OR LOWER(TRIM(${src.mailCol})) = $1
         LIMIT 1`,
      )
      .get(id);
  } catch (e) {
    console.warn(`[AiGENT auth] lecture ${src.table} impossible:`, e.message);
    return null;
  }
}

/** Crée (ou récupère) le lien de compte AiGENT. */
async function linkAccount(sourceKey, sourceUser) {
  const existing = await db
    .prepare(
      `SELECT * FROM aigent_accounts WHERE source = $1 AND LOWER(username) = LOWER($2)`,
    )
    .get(sourceKey, sourceUser.username);

  if (existing) {
    await db
      .prepare(
        `UPDATE aigent_accounts SET last_login = CURRENT_TIMESTAMP, contact = $1, avatar = $2 WHERE id = $3`,
      )
      .run(
        sourceUser.contact || existing.contact || "",
        sourceUser.avatar || existing.avatar,
        existing.id,
      );
    return { ...existing, contact: sourceUser.contact || existing.contact };
  }

  return db
    .prepare(
      `INSERT INTO aigent_accounts (source, source_user_id, username, contact, avatar)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    )
    .get(
      sourceKey,
      sourceUser.id || null,
      sourceUser.username,
      sourceUser.contact || "",
      sourceUser.avatar || "/images/user-avatar.jpg",
    );
}

async function accountOf(req) {
  return db
    .prepare(`SELECT * FROM aigent_accounts WHERE id = $1`)
    .get(req.user.accountId);
}

async function projectOf(req, projectId) {
  const row = await db
    .prepare(`SELECT * FROM aigent_projects WHERE id = $1 AND account_id = $2`)
    .get(Number(projectId), req.user.accountId);
  if (!row) return null;
  return {
    ...row,
    spec: { ...emptySpec(), ...safeJson(row.spec, {}) },
    history: safeJson(row.history, []),
    pending: safeJson(row.pending, {}),
  };
}

async function saveProject(
  id,
  { spec, phase, status, pending, history, name },
) {
  const sets = [];
  const values = [];
  let i = 1;
  const push = (sql, val) => {
    sets.push(sql.replace("$?", `$${i++}`));
    values.push(val);
  };
  if (spec !== undefined) push("spec = $?::jsonb", JSON.stringify(spec));
  if (history !== undefined) {
    // l'historique (undo) ne stocke pas les images en base64 : 20 copies de logos alourdiraient la base
    const strip = (s) =>
      JSON.parse(
        JSON.stringify(s, (k, v) =>
          typeof v === "string" && v.startsWith("data:image") ? null : v,
        ),
      );
    push("history = $?::jsonb", JSON.stringify(history.slice(-20).map(strip)));
  }
  if (pending !== undefined)
    push("pending = $?::jsonb", JSON.stringify(pending));
  if (phase !== undefined) push("phase = $?", phase);
  if (status !== undefined) push("status = $?", status);
  if (name !== undefined) push("name = $?", name);
  sets.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  return db
    .prepare(
      `UPDATE aigent_projects SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    )
    .get(...values);
}

async function logMessage(projectId, role, content, panel = null) {
  await db
    .prepare(
      `INSERT INTO aigent_messages (project_id, role, content, panel)
       VALUES ($1,$2,$3,$4::jsonb)`,
    )
    .run(projectId, role, content || "", JSON.stringify(panel));
}

async function recentHistory(projectId, limit = 8) {
  const rows = await db
    .prepare(
      `SELECT role, content FROM aigent_messages WHERE project_id = $1 ORDER BY id DESC LIMIT $2`,
    )
    .all(projectId, limit);
  return (rows || []).reverse();
}

const LOGIN_PATH = process.env.AIGENT_LOGIN_PATH || "/aigent-login.html";

const sessionPayload = (a, label) => ({
  success: true,
  token: generateAigentToken(a),
  account: {
    id: a.id,
    username: a.username,
    contact: a.contact,
    avatar: a.avatar,
    source: a.source,
    plan: a.plan,
    sourceLabel:
      label || SOURCES.find((s) => s.key === a.source)?.label || "Mon AiGENT",
  },
  needsPassword: a.source === "master" && !a.password_hash,
  logo: LOGO,
});

/** Compte natif Mon AiGENT (source = 'master'), par pseudo OU email. */
async function findMaster(identifier) {
  const id = String(identifier || "")
    .trim()
    .toLowerCase();
  if (!id) return null;
  return db
    .prepare(
      `SELECT * FROM aigent_accounts WHERE source = 'master'
       AND (LOWER(username) = $1 OR LOWER(contact) = $1) LIMIT 1`,
    )
    .get(id);
}

async function usernameTaken(u) {
  if (await findMaster(u)) return true;
  for (const s of SOURCES) if (await findInSource(s, u)) return true;
  return false;
}

/* ════════════════════════════════════════════════════════════════════
   1. AUTHENTIFICATION
   ════════════════════════════════════════════════════════════════════ */

/** Le front peut savoir, avant même le mot de passe, dans quels AiGENT
 *  l'identifiant existe (pour afficher « Compte Immo · Occas · Emploi »). */
router.post("/api/aigent/check-account", async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || "").trim();
    if (!identifier) return fail(res, 400, "Identifiant requis");
    const found = [];
    for (const src of SOURCES) {
      const user = await findInSource(src, identifier);
      if (user)
        found.push({
          source: src.key,
          label: src.label,
          username: user.username,
        });
    }
    const master = await findMaster(identifier);
    if (master)
      found.push({
        source: "master",
        label: "Mon AiGENT",
        username: master.username,
      });
    res.json({ success: true, exists: found.length > 0, accounts: found });
  } catch (err) {
    console.error("[AiGENT check-account]", err);
    fail(res, 500, "Erreur serveur");
  }
});

/**
 * Connexion. `source` est facultative : sans elle on balaye Immo → Occas → Emploi
 * et on retient la première correspondance dont le mot de passe est valide.
 */
router.post("/api/aigent/login", async (req, res) => {
  try {
    const schema = z.object({
      identifier: z.string().trim().min(1),
      password: z.string().min(1),
      source: z.enum(["immo", "occas", "emploi"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return fail(res, 400, "Identifiant et mot de passe requis");
    const { identifier, password, source } = parsed.data;

    const candidates = source
      ? SOURCES.filter((s) => s.key === source)
      : SOURCES;
    let matched = null;
    let foundButWrongPassword = false;

    for (const src of candidates) {
      const user = await findInSource(src, identifier);
      if (!user?.password) continue;
      const ok = await bcrypt
        .compare(password, user.password)
        .catch(() => false);
      if (ok) {
        matched = { src, user };
        break;
      }
      foundButWrongPassword = true;
    }

    if (!matched && !source) {
      const m = await findMaster(identifier);
      if (m?.password_hash) {
        if (await bcrypt.compare(password, m.password_hash).catch(() => false))
          return res.json(sessionPayload(m, "Mon AiGENT"));
        foundButWrongPassword = true;
      }
    }

    if (!matched) {
      return fail(
        res,
        401,
        foundButWrongPassword
          ? "Mot de passe incorrect"
          : "Aucun compte AiGENT trouvé. Créez d'abord un compte sur AiGENT Immo, Occas ou Emploi.",
        { needsAccount: !foundButWrongPassword },
      );
    }

    const account = await linkAccount(matched.src.key, matched.user);
    const token = generateAigentToken(account);

    res.json({
      success: true,
      token,
      account: {
        id: account.id,
        username: account.username,
        contact: account.contact,
        avatar: account.avatar,
        source: account.source,
        sourceLabel: matched.src.label,
        plan: account.plan,
      },
      logo: LOGO,
    });
  } catch (err) {
    console.error("[AiGENT login]", err);
    fail(res, 500, "Erreur serveur");
  }
});

/**
 * Inscription. AiGENT n'ouvre pas de compte « maître » isolé : on crée le
 * compte dans l'AiGENT spécialisé choisi, puis on l'associe. Cela garantit
 * qu'un compte AiGENT correspond toujours à un compte réel d'un des sites.
 */
router.post("/api/aigent/register", async (req, res) => {
  try {
    const schema = z.object({
      source: z.enum(["immo", "occas", "emploi"]).optional(),
      username: z
        .string()
        .trim()
        .min(3)
        .max(30)
        .regex(/^[a-zA-Z0-9_.\-]+$/),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(6).max(72),
      role: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return fail(
        res,
        400,
        parsed.error.errors[0]?.message || "Données invalides",
      );

    const { source, username, email, password, role } = parsed.data;
    // Sans `source` : compte natif Mon AiGENT (formulaire « Inscription » du site mère).
    if (!source) {
      if ((await usernameTaken(username)) || (await findMaster(email)))
        return fail(res, 409, "Ce compte existe déjà");
      for (const s of SOURCES)
        if (await findInSource(s, email))
          return fail(res, 409, "Ce compte existe déjà");
      const created = await db
        .prepare(
          `INSERT INTO aigent_accounts (source, username, contact, password_hash)
       VALUES ('master',$1,$2,$3) RETURNING *`,
        )
        .get(username, email, await bcrypt.hash(password, 10));
      return res.json(sessionPayload(created, "Mon AiGENT"));
    }
    const src = SOURCES.find((s) => s.key === source);
    if (!(await tableExists(src.table)))
      return fail(res, 503, `${src.label} n'est pas disponible pour l'instant`);

    // Unicité globale : le pseudo ne doit exister nulle part avec un autre mot de passe.
    for (const s of SOURCES) {
      const taken = await findInSource(s, username);
      if (taken)
        return fail(res, 409, `Ce pseudo est déjà utilisé sur ${s.label}`);
    }

    const hash = await bcrypt.hash(password, 10);
    let created = null;

    try {
      if (source === "emploi") {
        created = await db
          .prepare(
            `INSERT INTO users_emploi (username, password, role, contact)
             VALUES ($1,$2,$3,$4) RETURNING id, username, contact, avatar`,
          )
          .get(
            username,
            hash,
            role === "recruteur" ? "recruteur" : "candidat",
            email,
          );
      } else if (source === "occas") {
        created = await db
          .prepare(
            `INSERT INTO users_occas (username, password, role, contact)
             VALUES ($1,$2,$3,$4) RETURNING id, username, contact, avatar`,
          )
          .get(username, hash, role || "acheteur", email);
      } else {
        created = await db
          .prepare(
            `INSERT INTO users (username, password, role, contact)
             VALUES ($1,$2,$3,$4) RETURNING id, username, contact, avatar`,
          )
          .get(username, hash, role === "seller" ? "seller" : "buyer", email);
      }
    } catch (e) {
      console.error("[AiGENT register] insertion source", e.message);
      return fail(
        res,
        500,
        `Impossible de créer le compte sur ${src.label}. Créez-le depuis le site concerné puis reconnectez-vous ici.`,
      );
    }

    const account = await linkAccount(source, created);
    res.json({
      success: true,
      token: generateAigentToken(account),
      account: {
        id: account.id,
        username: account.username,
        contact: account.contact,
        avatar: account.avatar,
        source: account.source,
        sourceLabel: src.label,
      },
    });
  } catch (err) {
    console.error("[AiGENT register]", err);
    fail(res, 500, "Erreur serveur");
  }
});

router.get("/api/aigent/me", authenticateAigent, async (req, res) => {
  const account = await accountOf(req);
  if (!account) return fail(res, 404, "Compte introuvable");
  const projects = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM aigent_projects WHERE account_id = $1`,
    )
    .get(account.id);
  res.json({
    success: true,
    account: {
      id: account.id,
      username: account.username,
      contact: account.contact,
      avatar: account.avatar,
      source: account.source,
      sourceLabel:
        SOURCES.find((s) => s.key === account.source)?.label || "Mon AiGENT",
      plan: account.plan,
      projectCount: Number(projects?.count || 0),
    },
    logo: LOGO,
  });
});

router.post("/api/aigent/logout", authenticateAigent, (req, res) => {
  // Le token est stateless : le front l'oublie. On trace juste la sortie.
  res.json({ success: true });
});

/* ── OAuth : Google (OpenID Connect) + GitHub (REST, pas d'id_token) ── */
const PROVIDERS = {
  google: {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    jwks: createRemoteJWKSet(
      new URL("https://www.googleapis.com/oauth2/v3/certs"),
    ),
    scope: "openid email profile",
    extra: { prompt: "select_account" },
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    kind: "oidc",
  },
  github: {
    id: process.env.GITHUB_CLIENT_ID,
    secret: process.env.GITHUB_CLIENT_SECRET,
    auth: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    extra: { allow_signup: "true" },
    kind: "rest", // pas d'id_token : profil récupéré via l'API REST
    pkce: true, // supporté par GitHub, on le garde par sécurité
  },
};

/** GitHub n'a pas d'id_token : on va chercher le profil via son API REST. */
async function fetchGithubProfile(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "AiGENT",
    Accept: "application/vnd.github+json",
  };
  const [user, emails] = await Promise.all([
    fetch("https://api.github.com/user", { headers }).then((r) => r.json()),
    fetch("https://api.github.com/user/emails", { headers })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
  ]);
  const primary =
    (Array.isArray(emails) && emails.find((e) => e.primary)) ||
    (Array.isArray(emails) ? emails[0] : null);
  const name = String(user.name || "").trim();
  return {
    provider: "github",
    providerUserId: String(user.id),
    email: String(primary?.email || user.email || "")
      .trim()
      .toLowerCase(),
    emailVerified: primary ? !!primary.verified : false,
    name,
    givenName: name.split(" ")[0] || user.login || "",
    familyName: name.split(" ").slice(1).join(" ") || "",
    usernameHint: user.login || "",
  };
}

const b64u = (b) => b.toString("base64url");
const redirectUri = (p) =>
  `${process.env.AIGENT_PUBLIC_URL}/api/aigent/oauth/${p}/callback`;
const oauthCookie = (req) =>
  (req.headers.cookie || "").match(/(?:^|;\s*)aigent_oauth=([^;]+)/)?.[1] ||
  null;

function backToLogin(res, params) {
  res.clearCookie("aigent_oauth", { path: "/api/aigent/oauth" });
  res.redirect(`${LOGIN_PATH}#${new URLSearchParams(params)}`);
}

/** Retrouve, associe ou crée LE compte Mon AiGENT. Jamais de doublon. */
async function resolveOAuthAccount(p, { mode, linkAccountId }) {
  const byId = (id) =>
    db.prepare(`SELECT * FROM aigent_accounts WHERE id = $1`).get(id);
  const bind = (accountId) =>
    db
      .prepare(
        `INSERT INTO aigent_identities (account_id, provider, provider_user_id, email)
         VALUES ($1,$2,$3,$4) ON CONFLICT (provider, provider_user_id) DO NOTHING`,
      )
      .run(accountId, p.provider, p.providerUserId, p.email);

  // 1. Identité déjà associée → même compte.
  const known = await db
    .prepare(
      `SELECT account_id FROM aigent_identities WHERE provider = $1 AND provider_user_id = $2`,
    )
    .get(p.provider, p.providerUserId);
  if (known) return { account: await byId(known.account_id) };

  // 2. Association explicite depuis un compte déjà connecté.
  if (mode === "link" && linkAccountId) {
    await bind(linkAccountId);
    return { account: await byId(linkAccountId) };
  }

  // 3. Même email qu'un compte existant (Immo / Occas / Emploi / natif).
  if (p.email) {
    let hit = null;
    for (const src of SOURCES) {
      const u = await findInSource(src, p.email);
      if (u) {
        hit = { src, u };
        break;
      }
    }
    const master = hit ? null : await findMaster(p.email);
    if (hit || master) {
      // Email non vérifié par le fournisseur : fusion interdite.
      if (!p.emailVerified) return { error: "link_required" };
      const account = hit ? await linkAccount(hit.src.key, hit.u) : master;
      await bind(account.id);
      return { account };
    }
  }

  // 4. Nouveau compte natif : mêmes infos qu'une inscription manuelle.
  //    GitHub peut ne fournir aucun email (toutes ses adresses masquées) :
  //    on retombe alors sur le login GitHub comme base du pseudo.
  const base =
    String(
      p.givenName ||
        p.name ||
        p.usernameHint ||
        p.email?.split("@")[0] ||
        "user",
    )
      .replace(/[^a-zA-Z0-9_.-]/g, "")
      .slice(0, 24) || "user";
  let username = base;
  for (let i = 0; i < 8 && (await usernameTaken(username)); i++)
    username = `${base}${Math.floor(100 + Math.random() * 900)}`;
  const account = await db
    .prepare(
      `INSERT INTO aigent_accounts (source, username, contact) VALUES ('master',$1,$2) RETURNING *`,
    )
    .get(username, p.email);
  await bind(account.id);
  return { account, created: true };
}

router.get("/api/aigent/oauth/:provider/start", authLimiter, (req, res) => {
  const name = req.params.provider,
    cfg = PROVIDERS[name];
  if (!cfg?.id || !cfg.secret)
    return backToLogin(res, { oauth_error: "unavailable", provider: name });

  const mode = ["login", "signup", "link"].includes(req.query.mode)
    ? req.query.mode
    : "login";
  let linkAccountId = null;
  if (mode === "link") {
    try {
      linkAccountId = jwt.verify(
        String(req.query.token || ""),
        AIGENT_JWT_SECRET,
      ).accountId;
    } catch {
      return backToLogin(res, { oauth_error: "failed", provider: name });
    }
  }

  const state = b64u(crypto.randomBytes(24));
  const nonce = b64u(crypto.randomBytes(24));
  const verifier = b64u(crypto.randomBytes(48));
  const challenge = b64u(crypto.createHash("sha256").update(verifier).digest());

  res.cookie(
    "aigent_oauth",
    jwt.sign(
      { state, nonce, verifier, mode, linkAccountId, provider: name },
      AIGENT_JWT_SECRET,
      { expiresIn: "10m" },
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/aigent/oauth",
      maxAge: 600_000,
    },
  );
  res.redirect(
    `${cfg.auth}?${new URLSearchParams({
      client_id: cfg.id,
      redirect_uri: redirectUri(name),
      response_type: "code",
      scope: cfg.scope,
      state,
      nonce,
      ...(cfg.pkce === false
        ? {}
        : { code_challenge: challenge, code_challenge_method: "S256" }),
      ...cfg.extra,
    })}`,
  );
});

router.get(
  "/api/aigent/oauth/:provider/callback",
  authLimiter,
  async (req, res) => {
    const name = req.params.provider,
      cfg = PROVIDERS[name];
    let ctx = null;
    try {
      const raw = oauthCookie(req);
      if (!cfg || !raw)
        return backToLogin(res, { oauth_error: "failed", provider: name });
      ctx = jwt.verify(raw, AIGENT_JWT_SECRET);
      const back = { provider: name, mode: ctx.mode };

      if (req.query.error)
        return backToLogin(res, { oauth_error: "cancelled", ...back });
      if (
        ctx.provider !== name ||
        req.query.state !== ctx.state ||
        !req.query.code
      )
        return backToLogin(res, { oauth_error: "failed", ...back });

      // Échange du code (secret et PKCE côté serveur uniquement).
      const tk = await fetch(cfg.token, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json", // GitHub renvoie du form-urlencoded sinon
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: String(req.query.code),
          redirect_uri: redirectUri(name),
          client_id: cfg.id,
          client_secret: cfg.secret,
          ...(cfg.pkce === false ? {} : { code_verifier: ctx.verifier }),
        }),
      }).then((r) => r.json());

      let profile;

      if (cfg.kind === "oidc") {
        // ── Google : profil dans un id_token signé, vérifié par JWKS ──
        if (!tk.id_token)
          throw new Error(
            tk.error_description || tk.error || "id_token manquant",
          );
        const { payload } = await jwtVerify(tk.id_token, cfg.jwks, {
          audience: cfg.id,
          ...(cfg.issuer ? { issuer: cfg.issuer } : {}),
        });
        if (payload.nonce !== ctx.nonce) throw new Error("nonce invalide");
        if (cfg.checkIssuer && !cfg.checkIssuer(payload))
          throw new Error("issuer invalide");

        const pref = String(payload.preferred_username || "");
        profile = {
          provider: name,
          providerUserId: String(payload.sub),
          email: String(payload.email || (pref.includes("@") ? pref : ""))
            .trim()
            .toLowerCase(),
          emailVerified: payload.email_verified === true,
          name: payload.name || "",
          givenName: payload.given_name || "",
          familyName: payload.family_name || "",
        };
      } else {
        // ── GitHub : pas d'id_token, profil récupéré via l'API REST ──
        if (!tk.access_token)
          throw new Error(
            tk.error_description || tk.error || "access_token manquant",
          );
        profile = await fetchGithubProfile(tk.access_token);
      }

      const out = await resolveOAuthAccount(profile, ctx);
      if (out.error)
        return backToLogin(res, { oauth_error: out.error, ...back });

      // Ticket de 60 s, échangé par le front contre la vraie session.
      const ticket = jwt.sign(
        { typ: "oauth_ticket", accountId: out.account.id },
        AIGENT_JWT_SECRET,
        { expiresIn: "60s" },
      );
      backToLogin(res, { oauth_ticket: ticket });
    } catch (err) {
      console.error(`[AiGENT oauth ${name}]`, err.message);
      backToLogin(res, {
        oauth_error: "failed",
        provider: name,
        mode: ctx?.mode || "login",
      });
    }
  },
);

router.post("/api/aigent/oauth/exchange", authLimiter, async (req, res) => {
  try {
    const t = jwt.verify(String(req.body?.ticket || ""), AIGENT_JWT_SECRET);
    if (t.typ !== "oauth_ticket") throw new Error("type");
    const account = await db
      .prepare(`SELECT * FROM aigent_accounts WHERE id = $1`)
      .get(t.accountId);
    if (!account) throw new Error("compte");
    res.json(sessionPayload(account));
  } catch {
    fail(res, 401, "Connexion expirée, recommencez.");
  }
});

/** Mot de passe Mon AiGENT d'un compte natif créé via OAuth (facultatif). */
router.post(
  "/api/aigent/set-password",
  authenticateAigent,
  authLimiter,
  async (req, res) => {
    const pw = String(req.body?.password || "");
    if (pw.length < 6 || pw.length > 72)
      return fail(
        res,
        400,
        "Le mot de passe doit contenir entre 6 et 72 caractères.",
      );
    const account = await accountOf(req);
    if (!account || account.source !== "master" || account.password_hash)
      return fail(res, 409, "Mot de passe déjà défini ou compte non concerné");
    await db
      .prepare(`UPDATE aigent_accounts SET password_hash = $1 WHERE id = $2`)
      .run(await bcrypt.hash(pw, 10), account.id);
    res.json({ success: true });
  },
);
/* ════════════════════════════════════════════════════════════════════
   2. CATALOGUES & SANTÉ
   ════════════════════════════════════════════════════════════════════ */

router.get("/api/aigent/catalog", authenticateAigent, (req, res) => {
  res.json({
    success: true,
    tools: TOOL_CATALOG,
    services: SERVICE_CATALOG,
    styles: STYLE_PRESETS,
    interfaces: INTERFACE_KINDS,
    knowledgeTypes: KNOWLEDGE_TYPES,
    exports: [
      {
        id: "web",
        label: "AiGENT Web",
        description: "Utilisation directe",
        icon: LOGO,
      },
      {
        id: "widget",
        label: "Widget",
        description: "Intégration sur votre site",
        icon: LOGO,
      },
      {
        id: "api",
        label: "API",
        description: "Intégration personnalisée",
        icon: LOGO,
      },
      {
        id: "node",
        label: "Projet Node.js",
        description: "Code source complet",
        icon: LOGO,
      },
      {
        id: "json",
        label: "JSON",
        description: "Configuration complète",
        icon: LOGO,
      },
    ],
  });
});

router.get("/api/aigent/health", authenticateAigent, async (req, res) => {
  res.json({ success: true, ...(await probeProviders()) });
});

/* ════════════════════════════════════════════════════════════════════
   3. PROJETS
   ════════════════════════════════════════════════════════════════════ */

router.get("/api/aigent/projects", authenticateAigent, async (req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT p.id, p.slug, p.name, p.phase, p.status, p.spec, p.updated_at,
                (SELECT COUNT(*) FROM aigent_builds b WHERE b.project_id = p.id) AS builds
         FROM aigent_projects p WHERE p.account_id = $1 ORDER BY p.updated_at DESC`,
      )
      .all(req.user.accountId);

    res.json({
      success: true,
      projects: (rows || []).map((r) => {
        const spec = safeJson(r.spec, {});
        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          tagline: spec.tagline || null,
          phase: r.phase,
          status: r.status,
          builds: Number(r.builds || 0),
          progress: completeness({ ...emptySpec(), ...spec }),
          updatedAt: r.updated_at,
          icon: LOGO,
        };
      }),
    });
  } catch (err) {
    console.error("[AiGENT projects]", err);
    fail(res, 500, "Erreur serveur");
  }
});

router.post("/api/aigent/projects", authenticateAigent, async (req, res) => {
  try {
    const name = String(req.body?.name || "Nouveau AiGENT").slice(0, 60);
    const spec = emptySpec();
    const row = await db
      .prepare(
        `INSERT INTO aigent_projects (account_id, slug, name, spec)
         VALUES ($1,$2,$3,$4::jsonb) RETURNING *`,
      )
      .get(
        req.user.accountId,
        `${slugify(name)}-${Date.now().toString(36)}`,
        name,
        JSON.stringify(spec),
      );
    res.json({
      success: true,
      project: { id: row.id, slug: row.slug, name: row.name, phase: row.phase },
    });
  } catch (err) {
    console.error("[AiGENT create project]", err);
    fail(res, 500, "Erreur serveur");
  }
});

router.get("/api/aigent/projects/:id", authenticateAigent, async (req, res) => {
  const project = await projectOf(req, req.params.id);
  if (!project) return fail(res, 404, "Projet introuvable");
  const messages = await db
    .prepare(
      `SELECT id, role, content, panel, created_at FROM aigent_messages
       WHERE project_id = $1 ORDER BY id ASC LIMIT 200`,
    )
    .all(project.id);
  const build = await db
    .prepare(
      `SELECT id, version, manifest, created_at FROM aigent_builds
       WHERE project_id = $1 ORDER BY version DESC LIMIT 1`,
    )
    .get(project.id);
  const shots = build
    ? await db
        .prepare(
          `SELECT idx, label FROM aigent_previews WHERE build_id = $1 ORDER BY idx`,
        )
        .all(build.id)
    : [];
  res.json({
    success: true,
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      phase: project.phase,
      status: project.status,
      spec: project.spec,
      pending: project.pending,
      canUndo: project.history.length > 0,
      progress: completeness(project.spec),
      integrations: computeIntegrations(project.spec),
    },
    messages: (messages || []).map((m) => ({
      ...m,
      panel: safeJson(m.panel, null),
    })),
    build: build
      ? {
          id: build.id,
          version: build.version,
          manifest: safeJson(build.manifest, {}),
        }
      : null,
    previews: (shots || []).map((r) => ({
      label: r.label,
      url: previewUrl(project.id, build.id, r.idx),
    })),
  });
});

router.patch(
  "/api/aigent/projects/:id",
  authenticateAigent,
  async (req, res) => {
    const project = await projectOf(req, req.params.id);
    if (!project) return fail(res, 404, "Projet introuvable");
    const name = req.body?.name
      ? String(req.body.name).slice(0, 60)
      : undefined;
    const updated = await saveProject(project.id, { name });
    res.json({ success: true, name: updated.name });
  },
);

router.delete(
  "/api/aigent/projects/:id",
  authenticateAigent,
  async (req, res) => {
    await db
      .prepare(`DELETE FROM aigent_projects WHERE id = $1 AND account_id = $2`)
      .run(Number(req.params.id), req.user.accountId);
    res.json({ success: true });
  },
);

/* ── Modification directe depuis les panneaux (cartes éditables) ──── */
router.post(
  "/api/aigent/projects/:id/patch",
  authenticateAigent,
  async (req, res) => {
    try {
      const project = await projectOf(req, req.params.id);
      if (!project) return fail(res, 404, "Projet introuvable");

      const patch = req.body?.patch || {};
      if (patch.interface?.design)
        patch.interface.design = normalizeDesign(patch.interface.design);
      const nextSpec = applyPatch(project.spec, patch);
      const history = [...project.history, project.spec];

      await saveProject(project.id, {
        spec: nextSpec,
        history,
        name: nextSpec.name || project.name,
      });

      res.json({
        success: true,
        spec: nextSpec,
        progress: completeness(nextSpec),
        integrations: computeIntegrations(nextSpec),
        canUndo: true,
      });
    } catch (err) {
      console.error("[AiGENT patch]", err);
      fail(res, 500, "Erreur serveur");
    }
  },
);

/* ── Retour arrière réel : on dépile l'état précédent ─────────────── */
router.post(
  "/api/aigent/projects/:id/undo",
  authenticateAigent,
  async (req, res) => {
    const project = await projectOf(req, req.params.id);
    if (!project) return fail(res, 404, "Projet introuvable");
    if (!project.history.length)
      return fail(res, 400, "Aucune modification à annuler");

    const history = [...project.history];
    const previous = history.pop();
    await saveProject(project.id, { spec: previous, history });
    res.json({
      success: true,
      spec: previous,
      progress: completeness(previous),
      canUndo: history.length > 0,
    });
  },
);

/* ════════════════════════════════════════════════════════════════════
   4. LE BUILDER CONVERSATIONNEL
   ════════════════════════════════════════════════════════════════════ */

/** Réponse normalisée envoyée au front. */
function turn({
  project,
  spec,
  reply,
  panel = null,
  phase,
  thinking = null,
  actions = [],
}) {
  return {
    success: true,
    projectId: project.id,
    phase: phase || project.phase,
    reply,
    panel,
    thinking,
    actions,
    spec,
    progress: completeness(spec),
    integrations: computeIntegrations(spec),
    canUndo: true,
  };
}

/** Traduit l'option choisie sur une question en patch de spec. */
function patchFromOption(questionId, option, spec) {
  const hint = option?.patchHint || option?.id || "";
  const patch = {};

  if (questionId === "booking_mode") {
    if (hint.includes("booking.confirm")) {
      patch.tools = [
        { id: "availability.check" },
        { id: "booking.confirm" },
        { id: "booking.request", _remove: true },
      ];
      patch.permissions = { autonomy: "act_with_confirmation" };
      patch.assumptions = [
        "Réservation réelle : une source de disponibilités devra être connectée.",
      ];
    } else {
      patch.tools = [
        { id: "booking.request" },
        { id: "booking.confirm", _remove: true },
        { id: "availability.check", _remove: true },
      ];
      patch.permissions = { autonomy: "assist" };
    }
    return patch;
  }

  if (questionId === "scope") {
    if (hint === "act")
      patch.tools = [{ id: "lead.capture" }, { id: "handoff.human" }];
    return patch;
  }

  // Option générique : on la note comme décision à intégrer.
  patch.notes = [`${questionId}: ${option?.label || hint}`];
  return patch;
}

/** Prépare la prochaine question en attente, si elle existe. */
function nextPendingQuestion(pending) {
  const queue = pending?.questions || [];
  return queue.length ? queue[0] : null;
}

router.post(
  "/api/aigent/projects/:id/chat",
  authenticateAigent,
  chatLimiter,
  async (req, res) => {
    try {
      const project = await projectOf(req, req.params.id);
      if (!project) return fail(res, 404, "Projet introuvable");

      const message = String(req.body?.message || "").trim();
      if (!message) return fail(res, 400, "Message requis");

      let spec = project.spec;
      const historyStack = [...project.history, spec];
      let pending = project.pending || {};
      let phase = project.phase;
      const history = await recentHistory(project.id);

      if (!message.startsWith("__"))
        await logMessage(project.id, "user", message);

      /* ── A. Actions internes déclenchées par les panneaux ─────────── */

      // A1. Validation de la fiche de compréhension
      if (message === "__UNDERSTANDING_VALIDATED__") {
        if (req.body.edits) spec = applyPatch(spec, req.body.edits);
        const feasibility = await analyzeFeasibility(spec);
        pending = {
          questions: feasibility.questions || [],
          feasibility,
          resumeTo: "architecture",
        };
        phase = "exploration";

        const question = nextPendingQuestion(pending);
        if (question) {
          const reply = await phrase("question", spec, {
            question: question.question,
          });
          await saveProject(project.id, {
            spec,
            phase,
            pending,
            history: historyStack,
          });
          const panel = { type: "question", question };
          await logMessage(project.id, "assistant", reply, panel);
          return res.json(turn({ project, spec, reply, panel, phase }));
        }
        return await emitArchitecture(
          res,
          project,
          spec,
          historyStack,
          pending,
        );
      }

      // A2. Réponse à une question de conception (via les boutons du panneau)
      if (message === "__QUESTION_ANSWERED__") {
        const { questionId, optionId, text } = req.body || {};
        return await answerPendingQuestion(
          res,
          project,
          spec,
          pending,
          historyStack,
          history,
          { questionId, optionId, text },
        );
      }

      // A3. Architecture validée → identité
      if (message === "__ARCHITECTURE_VALIDATED__") {
        return await emitIdentity(res, project, spec, historyStack, pending);
      }

      // A4. Identité choisie → styles
      if (message === "__IDENTITY_SELECTED__") {
        const chosen = req.body?.identity || {};
        spec = applyPatch(spec, {
          name: chosen.name || spec.name,
          tagline: chosen.tagline || spec.tagline,
          tone: chosen.tone || spec.tone,
          persona: chosen.persona || spec.persona,
          interface: {
            greeting: pending.identity?.greeting || spec.interface?.greeting,
            suggestions:
              pending.identity?.suggestions || spec.interface?.suggestions,
          },
        });
        if (chosen.name) spec.slug = slugify(chosen.name);
        return await emitStyles(res, project, spec, historyStack, pending);
      }

      // A5. Style choisi → capacités
      // APRÈS — accepte name/tagline/iconDataUrl en plus. L'icône est validée
      // (type MIME, taille) avant d'être écrite dans la spec, pour ne jamais
      // stocker n'importe quoi comme "image" dans le projet.
      // A5. Style choisi → capacités
      // APRÈS — accepte customColors (roue) et styleNotes (expression libre).
      // Un hex invalide est simplement ignoré, jamais propagé.
      if (message === "__STYLE_SELECTED__") {
        // Tout ce qui vient du navigateur passe par normalizeDesign : couleurs hex,
        // énumérations fermées, images data: bornées, textes tronqués. Rien n'est
        // stocké tel quel.
        const design = normalizeDesign(req.body?.design);
        const c = design.colors;
        const kind = ["web", "widget", "api"].includes(req.body?.interfaceKind)
          ? req.body.interfaceKind
          : spec.interface?.kind || "web";

        spec = applyPatch(spec, {
          name: req.body?.name?.trim().slice(0, 60) || spec.name,
          tagline: req.body?.tagline?.trim().slice(0, 120) || spec.tagline,
          interface: {
            kind,
            icon: design.brand.favicon || spec.interface?.icon || null,
            greeting: design.agent.greeting || spec.interface?.greeting || null,
            // compat : lightTokensFor() lit encore ces clés historiques
            theme: {
              accent: c.accent,
              ...(c.gradient && c.accentTo ? { accentTo: c.accentTo } : {}),
              bg: c.bg,
              text: c.text,
              ...(c.header ? { headerColor: c.header } : {}),
            },
            design,
          },
        });
        return await emitFeatures(res, project, spec, historyStack, pending);
      }
      // A6. Capacités ajustées → récapitulatif
      if (message === "__FEATURES_UPDATED__") {
        if (req.body?.patch) spec = applyPatch(spec, req.body.patch);
        return await emitRecap(res, project, spec, historyStack, pending);
      }

      // A7. Récapitulatif
      if (message === "__RECAP_CONFIRMED__") {
        await saveProject(project.id, {
          spec,
          phase: "build",
          history: historyStack,
        });
        const reply = await phrase("build_start", spec);
        const panel = {
          type: "build_ready",
          endpoint: `/api/aigent/projects/${project.id}/build`,
        };
        await logMessage(project.id, "assistant", reply, panel);
        return res.json(
          turn({
            project,
            spec,
            reply,
            panel,
            phase: "build",
            thinking: thinkingSteps("build"),
            actions: [{ id: "build", label: "Construire mon AiGENT" }],
          }),
        );
      }

      if (message === "__RECAP_MODIFY__") {
        pending = { ...pending, awaitingRecapConfirm: true };
        await saveProject(project.id, { phase: "design", pending });
        const reply =
          "Dites-moi ce que vous voulez changer : le périmètre, les capacités, l'identité ou l'apparence. " +
          "Dites « c'est bon » quand vous voulez revenir au récapitulatif.";
        await logMessage(project.id, "assistant", reply);
        return res.json(turn({ project, spec, reply, phase: "design" }));
      }

      /* ── B. Message libre ────────────────────────────────────────── */

      // B0. Une question de conception est en attente et n'a pas de bouton
      //     (ou l'utilisateur a préféré répondre au clavier) : ce message
      //     EST la réponse. Sans ce court-circuit, le message tombait dans
      //     le traitement générique ci-dessous, qui ne vide jamais la file
      //     d'attente : le parcours restait bloqué indéfiniment.
      if ((pending.questions || []).length) {
        return await answerPendingQuestion(
          res,
          project,
          spec,
          pending,
          historyStack,
          history,
          { text: message },
        );
      }

      // B1. Premier tour : on comprend, on ne code pas.
      const isFirstIdea = phase === "idea" || !spec.purpose;
      if (isFirstIdea) {
        const analysis = await understandIdea(message, spec, history);
        const u = analysis.understanding || {};

        spec = applyPatch(spec, {
          purpose: u.objective,
          audience: u.audience,
          sector: u.sector,
          missions: (u.missions || []).map((m) => ({
            id: m.id || slugify(m.label),
            label: m.label,
            enabled: m.enabled !== false,
          })),
          tools: (analysis.suggestedTools || [])
            .filter((id) => TOOL_CATALOG.some((t) => t.id === id))
            .map((id) => ({ id })),
          knowledge: (analysis.suggestedKnowledge || []).map((k) => ({
            id: k.id || slugify(k.label),
            type: KNOWLEDGE_TYPES.includes(k.type) ? k.type : "text",
            label: k.label,
            status: "empty",
          })),
        });

        pending = {
          questions: analysis.questions || [],
          risks: analysis.risks || [],
        };
        phase = "understanding";

        const reply = await phrase("understanding_ready", spec);
        const panel = {
          type: "understanding",
          title: "AiGENT comprend votre idée",
          objective: spec.purpose,
          audience: spec.audience,
          missions: spec.missions,
          capabilities: (spec.tools || []).map((t) => ({
            id: t.id,
            label: TOOL_CATALOG.find((c) => c.id === t.id)?.label || t.id,
          })),
          knowledge: spec.knowledge,
          risks: analysis.risks || [],
          confidence: analysis.confidence ?? null,
          actions: [
            { id: "modify", label: "Modifier", kind: "secondary" },
            {
              id: "validate",
              label: "Valider",
              kind: "primary",
              message: "__UNDERSTANDING_VALIDATED__",
            },
          ],
        };

        await saveProject(project.id, {
          spec,
          phase,
          pending,
          history: historyStack,
          name: spec.name || project.name,
        });
        await logMessage(project.id, "assistant", reply, panel);
        return res.json(
          turn({
            project,
            spec,
            reply,
            panel,
            phase,
            thinking: thinkingSteps("understanding"),
          }),
        );
      }

      // B2. Message libre en cours de conception : on extrait un patch,
      //     on répond, et on relance le panneau pertinent si nécessaire.
      const { patch, userIntent, acknowledgement } = await extractSpecPatch(
        message,
        spec,
        history,
      );
      const hasPatch = patch && Object.keys(patch).length > 0;
      if (hasPatch) spec = applyPatch(spec, patch);

      // Retour explicite au récapitulatif après "Modifier" : sans ce test,
      // "nn c'est bon reprends" partait dans une simple réponse de chat et
      // le parcours ne reprenait jamais — le bouton "Construire" restait hors d'atteinte.
      const wantsToResumeRecap =
        pending.awaitingRecapConfirm &&
        (userIntent === "confirm" ||
          /(c'est bon|c bon|\bok\b|continue|\bgo\b|reprend|valide|d'accord|nickel|parfait)/i.test(
            message,
          ));

      if (wantsToResumeRecap) {
        const cleared = { ...pending, awaitingRecapConfirm: false };
        await saveProject(project.id, {
          spec,
          name: spec.name || project.name,
        });
        return await emitRecap(res, project, spec, historyStack, cleared);
      }

      let reply;
      if (hasPatch && userIntent === "remove") {
        reply = await phrase("removed", spec, {
          change: acknowledgement || message,
        });
      } else if (hasPatch) {
        reply = await phrase("patch_applied", spec, {
          change: acknowledgement || message,
        });
      } else {
        reply = await answerFreeform(message, spec, history);
      }

      // Une modification peut créer une incohérence : on la remonte tout de suite.
      let panel = null;
      if (hasPatch) {
        const feasibility = await analyzeFeasibility(spec);
        const blocking = (feasibility.issues || []).filter(
          (i) => i.severity === "blocking" && i.question,
        );
        if (blocking.length) {
          pending = {
            ...pending,
            questions: blocking.map((b) => b.question),
            resumeTo: pending.awaitingRecapConfirm ? "recap" : null,
          };
          panel = { type: "question", question: blocking[0].question };
          reply += ` ${await phrase("question", spec, { question: blocking[0].question })}`;
        }
      }

      await saveProject(project.id, {
        spec,
        pending,
        history: historyStack,
        name: spec.name || project.name,
      });
      await logMessage(project.id, "assistant", reply, panel);
      return res.json(turn({ project, spec, reply, panel }));
    } catch (err) {
      console.error("[AiGENT chat]", err);
      fail(res, 500, "Erreur serveur");
    }
  },
);

/* ── Réponse à une question en attente (bouton ou texte libre) ──────
   Utilisée à la fois par __QUESTION_ANSWERED__ (clic sur une option) et
   par le message libre B0 (réponse tapée au clavier). Les deux chemins
   doivent vider pending.questions de la même façon, sinon le parcours
   se bloque : c'est exactement le bug observé. */
async function answerPendingQuestion(
  res,
  project,
  spec,
  pending,
  historyStack,
  history,
  { questionId, optionId, text },
) {
  const queue = pending.questions || [];
  const current = queue.find((q) => q.id === questionId) || queue[0];

  if (!current)
    return await resumePending(res, project, spec, pending, historyStack);

  const option = current.options?.find((o) => o.id === optionId);
  if (option) {
    spec = applyPatch(spec, patchFromOption(current.id, option, spec));
  } else if (text) {
    const { patch } = await extractSpecPatch(text, spec, history);
    spec = applyPatch(spec, patch);
    spec = applyPatch(spec, { notes: [`${current.id}: ${text}`] });
  }

  const nextPending = {
    ...pending,
    questions: queue.filter((q) => q.id !== current.id),
  };
  const nextQ = nextPendingQuestion(nextPending);

  if (nextQ) {
    const reply = await phrase("question", spec, { question: nextQ.question });
    await saveProject(project.id, {
      spec,
      pending: nextPending,
      history: historyStack,
    });
    const panel = { type: "question", question: nextQ };
    await logMessage(project.id, "assistant", reply, panel);
    return res.json(
      turn({ project, spec, reply, panel, phase: "exploration" }),
    );
  }
  return await resumePending(res, project, spec, nextPending, historyStack);
}

/** Une fois toutes les questions en attente résolues, reprend le parcours
 *  exactement là où il avait été suspendu (architecture, récapitulatif…),
 *  au lieu de systématiquement forcer l'architecture comme avant. */
async function resumePending(res, project, spec, pending, historyStack) {
  const resumeTo = pending.resumeTo;
  const cleared = { ...pending, resumeTo: null };
  if (resumeTo === "recap")
    return await emitRecap(res, project, spec, historyStack, cleared);
  if (resumeTo === "architecture")
    return await emitArchitecture(res, project, spec, historyStack, cleared);

  const reply = "C'est noté, la conception est à jour.";
  await saveProject(project.id, {
    spec,
    pending: cleared,
    history: historyStack,
  });
  await logMessage(project.id, "assistant", reply);
  return res.json(turn({ project, spec, reply, panel: null }));
}

/* ── Émetteurs de panneaux ─────────────────────────────────────────── */

async function emitArchitecture(res, project, spec, historyStack, pending) {
  const [architecture, workflows] = await Promise.all([
    proposeArchitecture(spec),
    proposeWorkflows(spec),
  ]);
  if (workflows.length && !(spec.workflows || []).length) {
    spec = applyPatch(spec, { workflows });
  }
  const reply = await phrase("architecture", spec);
  const panel = {
    type: "architecture",
    title: "Architecture proposée",
    architecture,
    workflows: spec.workflows,
    integrations: computeIntegrations(spec),
    actions: [
      { id: "modify", label: "Ajuster", kind: "secondary" },
      {
        id: "validate",
        label: "Continuer",
        kind: "primary",
        message: "__ARCHITECTURE_VALIDATED__",
      },
    ],
  };
  await saveProject(project.id, {
    spec,
    phase: "exploration",
    pending,
    history: historyStack,
  });
  await logMessage(project.id, "assistant", reply, panel);
  return res.json(
    turn({
      project,
      spec,
      reply,
      panel,
      phase: "exploration",
      thinking: thinkingSteps("exploration"),
    }),
  );
}

async function emitIdentity(res, project, spec, historyStack, pending) {
  const identity = await proposeIdentity(spec);
  const reply = await phrase("identity", spec);
  const panel = {
    type: "identity",
    title: "Identité de votre AiGENT",
    options: identity.options,
    greeting: identity.greeting,
    suggestions: identity.suggestions,
    icon: LOGO,
    actions: [
      {
        id: "select",
        label: "Choisir",
        kind: "primary",
        message: "__IDENTITY_SELECTED__",
      },
    ],
  };
  await saveProject(project.id, {
    spec,
    phase: "design",
    pending: { ...pending, identity },
    history: historyStack,
  });
  await logMessage(project.id, "assistant", reply, panel);
  return res.json(
    turn({
      project,
      spec,
      reply,
      panel,
      phase: "design",
      thinking: thinkingSteps("design"),
    }),
  );
}

async function emitStyles(res, project, spec, historyStack, pending) {
  const styles = await proposeStyles(spec);
  const reply = await phrase("styles", spec);
  const panel = {
    type: "styles",
    title: "Direction visuelle",
    styles,
    interfaces: INTERFACE_KINDS,
    selected: spec.interface?.styleId || null,
    actions: [
      {
        id: "select",
        label: "Choisir ce style",
        kind: "primary",
        message: "__STYLE_SELECTED__",
      },
    ],
  };
  await saveProject(project.id, {
    spec,
    phase: "design",
    pending,
    history: historyStack,
  });
  await logMessage(project.id, "assistant", reply, panel);
  return res.json(turn({ project, spec, reply, panel, phase: "design" }));
}

async function emitFeatures(res, project, spec, historyStack, pending) {
  const reply = await phrase("features", spec);
  const selected = new Set((spec.tools || []).map((t) => t.id));

  // NOUVEAU — suggestion contextualisée : le panneau affiche par défaut les
  // capacités plausibles pour CE projet plutôt que les 13 outils du
  // catalogue en vrac. Échec IA → repli silencieux sur le catalogue
  // complet (comportement actuel), jamais bloquant.
  let suggestion = null;
  try {
    suggestion = await suggestCapabilities(spec);
  } catch (err) {
    console.warn("[AiGENT] suggestion de capacités indisponible:", err.message);
  }
  const relevantIds = suggestion?.length
    ? new Set(suggestion.map((s) => s.id))
    : null;
  const overridesById = suggestion?.length
    ? new Map(suggestion.map((s) => [s.id, s]))
    : null;
  // On ne cache jamais totalement les autres outils : on montre les
  // pertinents en avant, et on garde un accès au reste (voir aigent.js).
  const baseCards = relevantIds
    ? TOOL_CATALOG.filter((t) => relevantIds.has(t.id) || selected.has(t.id))
    : TOOL_CATALOG;

  const panel = {
    type: "features",
    title: "Capacités de votre AiGENT",
    cards: baseCards.map((t) => {
      const o = overridesById?.get(t.id);
      return {
        id: t.id,
        label: o?.label || t.label,
        category: t.category,
        description: o?.description || t.description,
        enabled: selected.has(t.id) || !!(relevantIds && relevantIds.has(t.id)),
        service: t.service,
        needsService: !!t.service,
        suggested: !!(relevantIds && relevantIds.has(t.id)),
      };
    }),
    allTools: TOOL_CATALOG.map((t) => t.id),
    knowledge: spec.knowledge,
    autonomy: spec.permissions?.autonomy,
    actions: [
      {
        id: "continue",
        label: "Continuer",
        kind: "primary",
        message: "__FEATURES_UPDATED__",
      },
    ],
  };
  await saveProject(project.id, {
    spec,
    phase: "design",
    pending: { ...pending, capabilitiesDraft: suggestion || null },
    history: historyStack,
  });
  await logMessage(project.id, "assistant", reply, panel);
  return res.json(turn({ project, spec, reply, panel, phase: "design" }));
}

async function emitRecap(res, project, spec, historyStack, pending) {
  const recap = await buildRecap(spec);
  const feasibility = await analyzeFeasibility(spec);
  const reply = await phrase("recap", spec);
  const panel = {
    type: "recap",
    title: `Voici ce que j'ai compris de votre AiGENT`,
    recap,
    warnings: feasibility.warnings,
    issues: feasibility.issues.filter((i) => i.severity !== "info"),
    // Le champ "verdict" vient de l'IA et peut se tromper ("needs_input" sans
    // aucun blocage réel), ce qui rendait le bouton durablement inutilisable.
    // Seuls les blocages détectés localement (checkCoherence) comptent ici.
    ready: !feasibility.issues.some((i) => i.severity === "blocking"),
    icon: LOGO,
    actions: [
      {
        id: "modify",
        label: "Modifier",
        kind: "secondary",
        message: "__RECAP_MODIFY__",
      },
      {
        id: "build",
        label: "Construire mon AiGENT",
        kind: "primary",
        message: "__RECAP_CONFIRMED__",
        disabled: feasibility.issues.some((i) => i.severity === "blocking"),
      },
    ],
  };
  await saveProject(project.id, {
    spec,
    phase: "validation",
    pending,
    history: historyStack,
  });
  await logMessage(project.id, "assistant", reply, panel);
  return res.json(
    turn({
      project,
      spec,
      reply,
      panel,
      phase: "validation",
      thinking: thinkingSteps("validation"),
    }),
  );
}

/* ════════════════════════════════════════════════════════════════════
   5. CONSTRUCTION
   ════════════════════════════════════════════════════════════════════ */

// APRÈS — remplace intégralement la fonction ci-dessus
const BUILD_STEPS = [
  { id: "lead", agent: "Lead", label: "Analyse de la conception" },
  {
    id: "site_plan",
    agent: "Architecte",
    label: "Analyse réelle du projet : pages, données, vocabulaire",
  },
  { id: "brand", agent: "Rédaction", label: "Ton et identité de marque" },
  { id: "design", agent: "UI/UX", label: "Direction visuelle" },
  {
    id: "copy",
    agent: "Rédaction",
    label: "Rédaction du contenu réel du site",
  },
  { id: "backend_tool", agent: "Backend", label: "Logique métier spécifique" },
  {
    id: "capabilities",
    agent: "Rédaction",
    label: "Sélection des capacités adaptées au projet",
  },
  {
    id: "security",
    agent: "Sécurité",
    label: "Contrôle de sécurité du code produit",
  },
  { id: "qa", agent: "QA", label: "Contrôle qualité et cohérence" },
  {
    id: "verify",
    agent: "QA",
    label: "Le contenu correspond-il au bon sujet ?",
  },
  { id: "integrate", agent: "Intégration", label: "Assemblage de l'équipe" },
  { id: "knowledge", agent: "Backend", label: "Préparation des connaissances" },
  {
    id: "files",
    agent: "Génération",
    label: "Écriture des fichiers du projet",
  },
  { id: "secrets", agent: "Sécurité", label: "Vérification des secrets" },
  { id: "preview", agent: "Génération", label: "Préparation de l'aperçu" },
];

async function performBuild(project, spec, onEvent = () => {}) {
  onEvent({ type: "plan", steps: BUILD_STEPS });
  const mark = (id, status, extra = {}) =>
    onEvent({ type: "step", id, status, ...extra });

  mark("lead", "active");
  const systemPrompt = await generateAgentSystemPrompt(spec);
  mark("lead", "done");

  const draftBp = deriveBlueprint(spec);
  let overrides = null;
  try {
    overrides = await runMultiAgentBuild(spec, draftBp, {
      onEvent: (e) => {
        if (e.type === "agent_start") mark(e.task, "active");
        else if (e.type === "agent_done") mark(e.task, "done");
        else if (e.type === "agent_error")
          mark(e.task, "error", { message: e.message });
      },
    });
  } catch (err) {
    console.warn(
      "[AiGENT] équipe multi-IA indisponible, repli standard:",
      err.message,
    );
  }
  const finalBp = finalizeBlueprint(spec, draftBp, overrides);
  mark("knowledge", "active");
  const knowledgeEntries = await generateKnowledgeSkeleton(spec);
  mark("knowledge", "done");

  mark("files", "active");
  const specWithRuntime = { ...spec, runtime: { systemPrompt } };
  const { files, manifest } = generateProject(
    specWithRuntime,
    { systemPrompt, knowledgeEntries },
    finalBp,
  );
  mark("files", "done");
  mark("secrets", "done"); // assertNoSecrets() a déjà tourné dans generateProject

  mark("preview", "active");
  const previewHtml = buildPreviewHtml(
    specWithRuntime,
    files,
    `/api/aigent/preview/${project.slug}/chat`,
  );
  mark("preview", "done");

  const last = await db
    .prepare(
      `SELECT MAX(version) AS v FROM aigent_builds WHERE project_id = $1`,
    )
    .get(project.id);
  const version = Number(last?.v || 0) + 1;

  const build = await db
    .prepare(
      `INSERT INTO aigent_builds (project_id, version, manifest, files, preview_html)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5) RETURNING id, version, created_at`,
    )
    .get(
      project.id,
      version,
      JSON.stringify(manifest),
      JSON.stringify(files),
      previewHtml,
    );

  await saveProject(project.id, {
    spec: specWithRuntime,
    phase: "test",
    status: "built",
  });
  return { build, manifest, files };
}

router.post(
  "/api/aigent/projects/:id/build",
  authenticateAigent,
  buildLimiter,
  async (req, res) => {
    try {
      const project = await projectOf(req, req.params.id);
      if (!project) return fail(res, 404, "Projet introuvable");

      const { build, manifest } = await performBuild(project, project.spec);
      const integrations = manifest.integrations || [];
      const reply = await phrase("build_done", project.spec, {
        missingCount: integrations.length,
      });

      const panel = {
        type: "built",
        title: "Votre AiGENT est prêt",
        checks: [
          { label: "Architecture construite", ok: true },
          { label: "Interface créée", ok: true },
          { label: "Backend préparé", ok: true },
          { label: "Configuration générée", ok: true },
          { label: "Dépendances identifiées", ok: true },
          { label: "Projet testable", ok: true },
          manifest.qaFlag && !manifest.qaFlag.pass
            ? {
                label: `À relire : ${manifest.qaFlag.reason || "contenu potentiellement hors-sujet"}`,
                ok: false,
              }
            : {
                label: "Contenu vérifié par rapport au projet",
                ok: true,
              },
        ],
        missingServices: integrations.map((i) => ({
          service: i.service,
          label: i.label,
          env: i.env,
          reason: i.reason,
          help: SERVICE_CATALOG[i.service]?.help,
        })),
        manifest,
        previewUrl: `/a/${project.slug}`,
        downloadUrl: `/api/aigent/projects/${project.id}/export?format=zip`,
        actions: [
          {
            id: "open",
            label: "Ouvrir mon AiGENT",
            kind: "primary",
            href: `/a/${project.slug}`,
          },
          { id: "zip", label: "Télécharger le ZIP", kind: "secondary" },
          { id: "code", label: "Voir le code", kind: "secondary" },
          {
            id: "services",
            label: "Configurer les services",
            kind: "secondary",
          },
        ],
      };

      await logMessage(project.id, "assistant", reply, panel);
      res.json({
        success: true,
        phase: "test",
        reply,
        panel,
        build: { id: build.id, version: build.version },
        manifest,
      });
    } catch (err) {
      console.error("[AiGENT build]", err);
      fail(
        res,
        500,
        err.message?.includes("Fuite de secret")
          ? err.message
          : "Échec de la construction",
      );
    }
  },
);

/** Construction en direct (SSE) : alimente l'état « AiGENT réfléchit ». */
router.get(
  "/api/aigent/projects/:id/build/stream",
  authenticateAigent,
  buildLimiter,
  async (req, res) => {
    const project = await projectOf(req, req.params.id);
    if (!project) return fail(res, 404, "Projet introuvable");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
    send({ type: "steps", steps: thinkingSteps("build") });

    try {
      // APRÈS — on transmet directement les événements riches (plan + step)
      const { manifest } = await performBuild(project, project.spec, (evt) =>
        send(evt),
      );
      send({
        type: "done",
        manifest,
        previewUrl: `/a/${project.slug}`,
        downloadUrl: `/api/aigent/projects/${project.id}/export?format=zip`,
      });
    } catch (err) {
      console.error("[AiGENT build stream]", err);
      send({ type: "error", message: "Échec de la construction" });
    }
    res.write("data: [DONE]\n\n");
    res.end();
  },
);

/* ════════════════════════════════════════════════════════════════════
   6. CODE, APERÇU, TEST
   ════════════════════════════════════════════════════════════════════ */

async function latestBuild(projectId) {
  const row = await db
    .prepare(
      `SELECT * FROM aigent_builds WHERE project_id = $1 ORDER BY version DESC LIMIT 1`,
    )
    .get(projectId);
  if (!row) return null;
  return {
    ...row,
    manifest: safeJson(row.manifest, {}),
    files: safeJson(row.files, {}),
  };
}

/** Arborescence + contenu d'un fichier (« Voir le code »). */
router.get(
  "/api/aigent/projects/:id/files",
  authenticateAigent,
  async (req, res) => {
    const project = await projectOf(req, req.params.id);
    if (!project) return fail(res, 404, "Projet introuvable");
    const build = await latestBuild(project.id);
    if (!build) return fail(res, 404, "Aucune construction disponible");

    const path = req.query.path;
    if (path) {
      const content = build.files[path];
      if (content === undefined) return fail(res, 404, "Fichier introuvable");
      return res.json({ success: true, path, content });
    }
    res.json({
      success: true,
      version: build.version,
      manifest: build.manifest,
      files: Object.keys(build.files).sort(),
    });
  },
);

const shotLimiter = rateLimit({ windowMs: 60_000, max: 30 });

async function latestBuildId(projectId) {
  const row = await db
    .prepare(
      `SELECT id FROM aigent_builds WHERE project_id = $1 ORDER BY version DESC LIMIT 1`,
    )
    .get(projectId);
  return row?.id || null;
}
const previewUrl = (projectId, buildId, idx) =>
  `/api/aigent/projects/${projectId}/previews/${idx}?b=${buildId}`;

/** Réception d'une capture (image brute : pas de base64, pas de limite à 100 ko). */
router.post(
  "/api/aigent/projects/:id/previews",
  authenticateAigent,
  shotLimiter,
  express.raw({
    type: ["image/webp", "image/png", "image/jpeg"],
    limit: "3mb",
  }),
  async (req, res) => {
    try {
      const project = await projectOf(req, req.params.id);
      if (!project) return fail(res, 404, "Projet introuvable");
      const buildId = await latestBuildId(project.id);
      if (!buildId) return fail(res, 409, "Construisez d'abord votre AiGENT");
      const idx = Number(req.query.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx > 5)
        return fail(res, 400, "Index invalide");
      if (!Buffer.isBuffer(req.body) || req.body.length < 512)
        return fail(res, 400, "Image manquante");
      const mime = String(req.headers["content-type"] || "image/webp").split(
        ";",
      )[0];
      const label = String(req.query.label || "").slice(0, 60);

      await db
        .prepare(
          `INSERT INTO aigent_previews (project_id, build_id, idx, label, mime, data)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (build_id, idx)
           DO UPDATE SET label = EXCLUDED.label, mime = EXCLUDED.mime, data = EXCLUDED.data`,
        )
        .run(project.id, buildId, idx, label, mime, req.body);

      // On ne garde que les aperçus des 3 dernières constructions.
      await db
        .prepare(
          `DELETE FROM aigent_previews WHERE project_id = $1 AND build_id NOT IN
             (SELECT id FROM aigent_builds WHERE project_id = $1 ORDER BY version DESC LIMIT 3)`,
        )
        .run(project.id);

      // Dernière capture : la galerie entre dans l'historique (elle survit au rechargement).
      if (req.query.done === "1") {
        const rows = await db
          .prepare(
            `SELECT idx, label FROM aigent_previews WHERE build_id = $1 ORDER BY idx`,
          )
          .all(buildId);
        await logMessage(
          project.id,
          "assistant",
          "Voici l'aperçu de votre site.",
          {
            type: "previews",
            shots: rows.map((r) => ({
              label: r.label,
              url: previewUrl(project.id, buildId, r.idx),
            })),
          },
        );
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[AiGENT previews]", err);
      fail(res, 500, "Erreur serveur");
    }
  },
);

/** Lecture (jeton en paramètre : les <img> n'envoient pas d'en-tête Authorization). */
router.get(
  "/api/aigent/projects/:id/previews/:idx",
  authenticateAigent,
  async (req, res) => {
    try {
      const project = await projectOf(req, req.params.id);
      if (!project) return fail(res, 404, "Projet introuvable");
      const buildId = Number(req.query.b) || (await latestBuildId(project.id));
      const row = await db
        .prepare(
          `SELECT mime, data FROM aigent_previews WHERE project_id = $1 AND build_id = $2 AND idx = $3`,
        )
        .get(project.id, buildId, Number(req.params.idx));
      if (!row) return fail(res, 404, "Aperçu introuvable");
      res.setHeader("Content-Type", row.mime);
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.send(row.data);
    } catch (err) {
      console.error("[AiGENT previews get]", err);
      fail(res, 500, "Erreur serveur");
    }
  },
);
/** Aperçu hébergé : l'AiGENT créé, fonctionnel, sans aucune clé côté client. */
router.get("/a/:slug", async (req, res) => {
  try {
    const project = await db
      .prepare(`SELECT id FROM aigent_projects WHERE slug = $1`)
      .get(req.params.slug);
    if (!project) return res.status(404).send("AiGENT introuvable");
    const build = await latestBuild(project.id);
    if (!build?.preview_html)
      return res.status(404).send("Cet AiGENT n'a pas encore été construit.");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(build.preview_html);
  } catch (err) {
    console.error("[AiGENT preview]", err);
    res.status(500).send("Erreur serveur");
  }
});

/** Bac à sable de l'aperçu : nos providers, côté serveur, jamais exposés. */
router.post(
  "/api/aigent/preview/:slug/chat",
  previewLimiter,
  async (req, res) => {
    try {
      const project = await db
        .prepare(`SELECT id, spec FROM aigent_projects WHERE slug = $1`)
        .get(req.params.slug);
      if (!project) return fail(res, 404, "AiGENT introuvable");

      const spec = { ...emptySpec(), ...safeJson(project.spec, {}) };
      const message = String(req.body?.message || "").slice(0, 2000);
      if (!message) return fail(res, 400, "Message requis");

      const build = await latestBuild(project.id);
      const knowledgeText = Object.entries(build?.files || {})
        .filter(([p]) => p.startsWith("knowledge/"))
        .map(([, c]) => c)
        .join("\n\n");

      const reply = await runAgentSandbox(
        spec,
        message,
        Array.isArray(req.body?.history) ? req.body.history : [],
        knowledgeText,
      );

      res.json({ reply, sources: [], sandbox: true });
    } catch (err) {
      console.error("[AiGENT preview chat]", err);
      fail(res, 500, "Erreur serveur");
    }
  },
);

/** Test depuis le panneau droit (authentifié, historique conservé). */
router.post(
  "/api/aigent/projects/:id/test",
  authenticateAigent,
  chatLimiter,
  async (req, res) => {
    try {
      const project = await projectOf(req, req.params.id);
      if (!project) return fail(res, 404, "Projet introuvable");

      const message = String(req.body?.message || "").slice(0, 2000);
      if (!message) return fail(res, 400, "Message requis");

      const rows = await db
        .prepare(
          `SELECT role, content FROM aigent_sandbox WHERE project_id = $1 ORDER BY id DESC LIMIT 8`,
        )
        .all(project.id);
      const history = (rows || []).reverse();

      const build = await latestBuild(project.id);
      const knowledgeText = Object.entries(build?.files || {})
        .filter(([p]) => p.startsWith("knowledge/"))
        .map(([, c]) => c)
        .join("\n\n");

      const reply = await runAgentSandbox(
        project.spec,
        message,
        history,
        knowledgeText,
      );

      await db
        .prepare(
          `INSERT INTO aigent_sandbox (project_id, role, content) VALUES ($1,'user',$2)`,
        )
        .run(project.id, message);
      await db
        .prepare(
          `INSERT INTO aigent_sandbox (project_id, role, content) VALUES ($1,'assistant',$2)`,
        )
        .run(project.id, reply);

      res.json({ success: true, reply, sandbox: true });
    } catch (err) {
      console.error("[AiGENT test]", err);
      fail(res, 500, "Erreur serveur");
    }
  },
);

router.delete(
  "/api/aigent/projects/:id/test",
  authenticateAigent,
  async (req, res) => {
    await db
      .prepare(`DELETE FROM aigent_sandbox WHERE project_id = $1`)
      .run(Number(req.params.id));
    res.json({ success: true });
  },
);

/* ════════════════════════════════════════════════════════════════════
   7. EXPORT
   ════════════════════════════════════════════════════════════════════ */

router.get(
  "/api/aigent/projects/:id/export",
  authenticateAigent,
  async (req, res) => {
    try {
      const project = await projectOf(req, req.params.id);
      if (!project) return fail(res, 404, "Projet introuvable");

      const format = String(req.query.format || "zip");

      if (format === "json") {
        const clean = sanitizeSpec(project.spec);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${project.slug}.config.json"`,
        );
        return res.send(JSON.stringify(clean, null, 2));
      }

      let build = await latestBuild(project.id);
      if (!build) {
        const result = await performBuild(project, project.spec);
        build = {
          files: result.files,
          manifest: result.manifest,
          version: result.build.version,
        };
      }

      if (format === "widget") {
        const widget = build.files["frontend/widget.js"];
        if (!widget) return fail(res, 404, "Ce projet n'inclut pas de widget");
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${project.slug}-widget.js"`,
        );
        return res.send(widget);
      }

      const zip = buildZip(build.files, project.slug);
      await saveProject(project.id, { status: "exported" });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${project.slug}.zip"`,
      );
      res.setHeader("Content-Length", zip.length);
      res.send(zip);
    } catch (err) {
      console.error("[AiGENT export]", err);
      if (!res.headersSent) fail(res, 500, "Échec de l'export");
    }
  },
);

/** Ce qu'il reste à brancher — alimente l'écran « Configurer les services ». */
router.get(
  "/api/aigent/projects/:id/services",
  authenticateAigent,
  async (req, res) => {
    const project = await projectOf(req, req.params.id);
    if (!project) return fail(res, 404, "Projet introuvable");
    const integrations = computeIntegrations(project.spec);
    res.json({
      success: true,
      services: integrations.map((i) => ({
        ...i,
        help: SERVICE_CATALOG[i.service]?.help,
      })),
      note: "AiGENT ne fournit aucune clé : le projet exporté fonctionne avec vos propres comptes, renseignés dans le fichier .env.",
    });
  },
);

console.log(
  "✦ AiGENT Master — Builder prêt (auth transverse · conception · build · export)",
);

export default router;
