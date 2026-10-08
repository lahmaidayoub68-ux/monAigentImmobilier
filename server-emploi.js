//================ MON AIGENT EMPLOI — ROUTER COMPLET (v4, + PROFIL) ==========//
// Auth (inscription / connexion 2FA-aware / déconnexion / session)
// + Tunnel IA déterministe candidat/recruteur (extraction IA + phrasing IA)
// + Pop-ups : domaine>sous-domaine>métier, zone, diplôme, compétences, CV/lettre
// + Récapitulatif avant publication + matching + mise en relation
// + Chat phase "résultats" (conseil, comparaison, analyse marché, contact)
// + PAGE PROFIL COMPLÈTE : identité, mes annonces (historique), agenda,
//   activité (temps d'écran), coffre CV/lettres, diagnostic marché (feature
//   propre à Emploi), préférences, sécurité (mdp + 2FA à 3 codes), support,
//   zone critique (reset / suppression données / suppression compte).
// + MESSAGERIE COMPLÈTE : messages 1-à-1, groupes, pièces jointes, réactions,
//   présence en ligne, archivage, blocage (v5).
//
// PRINCIPE (identique à server-occas.js) :
//   - À CHAQUE connexion (login), la session de travail (critères en cours de
//     saisie dans le tunnel) est remise à zéro. Le chat repart de 0.
//   - Une annonce publiée (après confirmation du récapitulatif) est stockée à
//     part (published_criteria / published_documents) ET dans un historique
//     dédié (annonces_emploi) consultable depuis la page Profil.
//
// ⚠️ Ce fichier N'EST PAS une app Express autonome. C'est un express.Router()
// exporté par défaut, monté dans server.js via `app.use(emploiRoutes)`.
//===============================================================//

import express from "express";
import { db } from "./db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import {
  DOMAINES,
  extractCriteria,
  generatePhrasing,
  generateContactMessage,
  aiResultsChat,
  detectResultsIntent,
  parseNoExperienceAnswer,
} from "./services/aiParseeEmploi.js";
import { getMatchesForProfile } from "./services/matchingEngineEmploi.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMPLOI_JWT_SECRET =
  process.env.EMPLOI_JWT_SECRET || process.env.JWT_SECRET;
if (!EMPLOI_JWT_SECRET)
  throw new Error("EMPLOI_JWT_SECRET (ou JWT_SECRET) manquant dans .env");
// Secret court terme pour l'étape intermédiaire du login 2FA
const EMPLOI_2FA_PENDING_SECRET = EMPLOI_JWT_SECRET + "::2fa-pending";

const SUPPORT_EMAIL_TO_EMPLOI =
  process.env.SUPPORT_EMAIL_EMPLOI || "supportmonaigentemploi@gmail.com";

// ── Router Emploi — sera monté dans server.js via app.use(emploiRoutes) ──
const router = express.Router();

// ================== RATE LIMIT ==================
const authLimiter = rateLimit({ windowMs: 60_000, max: 30 });
router.use("/api/emploi/register", authLimiter);
router.use("/api/emploi/login", authLimiter);
router.use("/api/emploi/login/verify-2fa", authLimiter);
const msgLimiter = rateLimit({ windowMs: 60_000, max: 180 });
router.use("/emploi/api/messages", msgLimiter);

/* ════════════════════════════════════════════════════════════════════════
   DB — TABLES DE BASE (auth, profils, messages)
   ════════════════════════════════════════════════════════════════════════ */

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS users_emploi (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('candidat', 'recruteur')),
  contact TEXT UNIQUE NOT NULL,
  avatar TEXT DEFAULT '/images/user-avatar.jpg',
  ville TEXT DEFAULT '',
  preferences TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

try {
  await db
    .prepare(
      `ALTER TABLE users_emploi ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '/images/user-avatar.jpg'`,
    )
    .run();
} catch {}
try {
  await db
    .prepare(
      `ALTER TABLE users_emploi ADD COLUMN IF NOT EXISTS ville TEXT DEFAULT ''`,
    )
    .run();
} catch {}
try {
  await db
    .prepare(
      `ALTER TABLE users_emploi ADD COLUMN IF NOT EXISTS preferences TEXT DEFAULT '{}'`,
    )
    .run();
} catch {}

// profils_emploi :
//   - criteria / documents        → état de TRAVAIL du tunnel en cours,
//                                    remis à zéro à chaque login/logout.
//   - published_criteria / published_documents → annonce RÉELLEMENT publiée
//                                    (la plus récente), visible des autres.
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS profils_emploi (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL REFERENCES users_emploi(username) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('candidat', 'recruteur')),
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  documents JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_documents JSONB NOT NULL DEFAULT '{}'::jsonb,
  phase TEXT NOT NULL DEFAULT 'tunnel',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

try {
  await db
    .prepare(
      `ALTER TABLE profils_emploi ADD COLUMN IF NOT EXISTS published_criteria JSONB NOT NULL DEFAULT '{}'::jsonb`,
    )
    .run();
  await db
    .prepare(
      `ALTER TABLE profils_emploi ADD COLUMN IF NOT EXISTS published_documents JSONB NOT NULL DEFAULT '{}'::jsonb`,
    )
    .run();
} catch {}

try {
  await db
    .prepare(
      `ALTER TABLE profils_emploi ADD COLUMN IF NOT EXISTS pourvu BOOLEAN NOT NULL DEFAULT FALSE`,
    )
    .run();
} catch {}
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS messages_emploi (
  id SERIAL PRIMARY KEY,
  from_username TEXT NOT NULL,
  to_username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

/* ════════════════════════════════════════════════════════════════════════
   DB — TABLES PROFIL (historique annonces, agenda, activité, coffre CV,
   notifications, support, favoris, 2FA)
   ════════════════════════════════════════════════════════════════════════ */

// Historique des publications : chaque confirmation de récapitulatif crée
// une ligne. published_criteria (dans profils_emploi) ne garde que la
// dernière — ici on garde tout, pour l'onglet "Mes annonces".
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS annonces_emploi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  documents JSONB NOT NULL DEFAULT '{}'::jsonb,
  published BOOLEAN DEFAULT TRUE,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

try {
  await db
    .prepare(
      `ALTER TABLE annonces_emploi ADD COLUMN IF NOT EXISTS pourvu BOOLEAN NOT NULL DEFAULT FALSE`,
    )
    .run();
} catch {}

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS agenda_emploi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT DEFAULT '',
  kind TEXT DEFAULT 'autre',
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#7CFC3C',
  reminded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS activity_emploi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  seconds INTEGER DEFAULT 0,
  events INTEGER DEFAULT 0,
  UNIQUE (user_id, day)
)`,
  )
  .run();

// Coffre : CV et lettres de motivation, réutilisables entre annonces.
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS vault_emploi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  annonce_id INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('cv', 'lettre')),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS notifications_emploi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  data TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS support_emploi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS favorites_emploi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  profile_data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS user_2fa_emploi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users_emploi(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  backup_codes TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

// Suivi des correspondances déjà notifiées (alerte "nouveau match")
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS known_matches_emploi (
  user_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  match_username TEXT NOT NULL,
  seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, match_username)
)`,
  )
  .run();

console.log("💼 Mon AiGENT Emploi — tables prêtes (même port que server.js)");

/* ════════════════════════════════════════════════════════════════════════
   HELPERS AUTH
   ════════════════════════════════════════════════════════════════════════ */

function publicUser(row) {
  if (!row) return null;
  const { password, ...safe } = row;
  return safe;
}

function sendError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

const generateEmploiToken = (user) =>
  jwt.sign(
    { username: user.username, role: user.role, contact: user.contact || "" },
    EMPLOI_JWT_SECRET,
    { expiresIn: "6h" },
  );

const authenticateEmploiToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return sendError(res, 401, "Authentification requise");
  jwt.verify(token, EMPLOI_JWT_SECRET, (err, user) => {
    if (err) return sendError(res, 403, "Session expirée, reconnectez-vous");
    req.user = user;
    next();
  });
};

/** Remet à zéro l'état de TRAVAIL du tunnel (criteria/documents/phase),
 *  sans jamais toucher à l'annonce publiée (published_criteria/documents). */
async function resetWorkingProfile(username) {
  try {
    await db
      .prepare(
        `UPDATE profils_emploi
         SET criteria = '{}'::jsonb, documents = '{}'::jsonb, phase = 'tunnel', updated_at = CURRENT_TIMESTAMP
         WHERE username = $1`,
      )
      .run(username);
  } catch (e) {
    console.error("[EMPLOI RESET WORKING PROFILE]", e);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   PROFIL — helpers
   ════════════════════════════════════════════════════════════════════════ */

async function getOrCreateProfile(username, role) {
  let profile = await db
    .prepare(`SELECT * FROM profils_emploi WHERE username = $1`)
    .get(username);
  if (!profile) {
    profile = await db
      .prepare(
        `INSERT INTO profils_emploi (username, role, criteria, documents, phase, published)
         VALUES ($1, $2, '{}'::jsonb, '{}'::jsonb, 'tunnel', FALSE)
         RETURNING *`,
      )
      .get(username, role);
  }
  return profile;
}

async function saveProfile(
  username,
  {
    criteria,
    documents,
    phase,
    published,
    publishedCriteria,
    publishedDocuments,
  },
) {
  const sets = [];
  const values = [];
  let i = 1;

  if (criteria !== undefined) {
    sets.push(`criteria = $${i++}::jsonb`);
    values.push(JSON.stringify(criteria));
  }
  if (documents !== undefined) {
    sets.push(`documents = $${i++}::jsonb`);
    values.push(JSON.stringify(documents));
  }
  if (publishedCriteria !== undefined) {
    sets.push(`published_criteria = $${i++}::jsonb`);
    values.push(JSON.stringify(publishedCriteria));
  }
  if (publishedDocuments !== undefined) {
    sets.push(`published_documents = $${i++}::jsonb`);
    values.push(JSON.stringify(publishedDocuments));
  }
  if (phase !== undefined) {
    sets.push(`phase = $${i++}`);
    values.push(phase);
  }
  if (published !== undefined) {
    sets.push(`published = $${i++}`);
    values.push(published);
  }
  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(username);

  return db
    .prepare(
      `UPDATE profils_emploi SET ${sets.join(", ")} WHERE username = $${i} RETURNING *`,
    )
    .get(...values);
}

async function getOppositePool(role, excludeUsername) {
  const oppositeRole = role === "candidat" ? "recruteur" : "candidat";
  const rows = await db
    .prepare(
      `SELECT username, published_criteria, published_documents, pourvu, updated_at
       FROM profils_emploi
       WHERE role = $1 AND published = TRUE AND username != $2`,
    )
    .all(oppositeRole, excludeUsername);
  return (rows || []).map((r) => ({
    username: r.username,
    criteria:
      typeof r.published_criteria === "string"
        ? JSON.parse(r.published_criteria)
        : r.published_criteria,
    documents:
      typeof r.published_documents === "string"
        ? JSON.parse(r.published_documents || "{}")
        : r.published_documents || {},
    pourvu: !!r.pourvu,
    updatedAt: r.updated_at,
  }));
}

async function getUserPrefsForMatching(username) {
  try {
    const row = await db
      .prepare(`SELECT preferences FROM users_emploi WHERE username=$1`)
      .get(username);
    return safeJson(row?.preferences, {});
  } catch {
    return {};
  }
}

/** Persiste immédiatement la ville dès qu'elle apparaît dans le chat. */
async function syncProfileVilleFromChat(username, zone) {
  if (!zone) return;
  try {
    const row = await db
      .prepare(`SELECT ville FROM users_emploi WHERE username = $1`)
      .get(username);
    if (row && !row.ville) {
      await db
        .prepare(`UPDATE users_emploi SET ville = $1 WHERE username = $2`)
        .run(zone, username);
    }
  } catch (e) {
    console.warn("[syncProfileVilleFromChat emploi]", e.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   ROUTES AUTH (register / login 2FA-aware / verify-2fa / logout / me)
   ════════════════════════════════════════════════════════════════════════ */

router.post("/api/emploi/register", async (req, res) => {
  try {
    const schema = z
      .object({
        username: z
          .string()
          .trim()
          .min(3, "Le pseudo doit contenir au moins 3 caractères")
          .max(30, "Le pseudo est trop long")
          .regex(
            /^[a-zA-Z0-9_.\-]+$/,
            "Le pseudo ne peut contenir que lettres, chiffres, _ . -",
          ),
        email: z.string().trim().toLowerCase().email("Adresse email invalide"),
        password: z
          .string()
          .min(6, "Le mot de passe doit contenir au moins 6 caractères")
          .max(72, "Le mot de passe est trop long"),
        confirmPassword: z.string(),
        role: z.enum(["candidat", "recruteur"], {
          errorMap: () => ({ message: "Rôle invalide" }),
        }),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Les mots de passe ne correspondent pas",
        path: ["confirmPassword"],
      });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Données invalides";
      return sendError(res, 400, firstError);
    }
    const { username, email, password, role } = parsed.data;

    const existingUsername = await db
      .prepare(`SELECT 1 FROM users_emploi WHERE LOWER(username) = LOWER($1)`)
      .get(username);
    if (existingUsername)
      return sendError(res, 409, "Ce pseudo est déjà utilisé");

    const existingEmail = await db
      .prepare(`SELECT 1 FROM users_emploi WHERE LOWER(contact) = LOWER($1)`)
      .get(email);
    if (existingEmail)
      return sendError(res, 409, "Cette adresse email est déjà utilisée");

    const hash = await bcrypt.hash(password, 10);

    const inserted = await db
      .prepare(
        `INSERT INTO users_emploi (username, password, role, contact)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, role, contact, avatar, created_at`,
      )
      .get(username, hash, role, email);

    await getOrCreateProfile(inserted.username, inserted.role);

    const token = generateEmploiToken(inserted);

    res.json({ success: true, token, user: publicUser(inserted) });
  } catch (err) {
    console.error("[EMPLOI REGISTER]", err);
    sendError(res, 500, "Erreur serveur — veuillez réessayer");
  }
});

/**
 * Connexion en 1 ou 2 étapes, comme AiGENT Occasion :
 *  - Pas de 2FA → token complet directement.
 *  - 2FA active → { need2fa: true, pendingToken } ; le front rappelle
 *    /api/emploi/login/verify-2fa avec un des 3 codes de sécurité.
 */
router.post("/api/emploi/login", async (req, res) => {
  try {
    const schema = z.object({
      username: z.string().trim().min(1, "Pseudo requis"),
      password: z.string().min(1, "Mot de passe requis"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "Identifiants requis");

    const { username, password } = parsed.data;

    const user = await db
      .prepare(`SELECT * FROM users_emploi WHERE LOWER(username) = LOWER($1)`)
      .get(username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return sendError(res, 401, "Pseudo ou mot de passe incorrect");
    }

    const tfa = await db
      .prepare(`SELECT enabled FROM user_2fa_emploi WHERE user_id = $1`)
      .get(user.id);

    if (tfa?.enabled) {
      const pendingToken = jwt.sign(
        { uid: user.id, username: user.username, purpose: "2fa_pending" },
        EMPLOI_2FA_PENDING_SECRET,
        { expiresIn: "5m" },
      );
      return res.json({ success: true, need2fa: true, pendingToken });
    }

    // Nouvelle connexion = nouvelle session de chat.
    await getOrCreateProfile(user.username, user.role);
    await resetWorkingProfile(user.username);

    const token = generateEmploiToken(user);
    res.json({ success: true, token, user: publicUser(user) });
  } catch (err) {
    console.error("[EMPLOI LOGIN]", err);
    sendError(res, 500, "Erreur serveur — veuillez réessayer");
  }
});

router.post("/api/emploi/login/verify-2fa", async (req, res) => {
  try {
    const { pendingToken, code } = req.body || {};
    if (!pendingToken || !code) return sendError(res, 400, "Code requis");

    let decoded;
    try {
      decoded = jwt.verify(pendingToken, EMPLOI_2FA_PENDING_SECRET);
    } catch {
      return sendError(res, 401, "Session de connexion expirée, recommencez.");
    }
    if (decoded.purpose !== "2fa_pending")
      return sendError(res, 401, "Jeton invalide");

    const tfa = await db
      .prepare(
        `SELECT backup_codes FROM user_2fa_emploi WHERE user_id = $1 AND enabled = true`,
      )
      .get(decoded.uid);
    if (!tfa) return sendError(res, 404, "2FA introuvable");

    let codes = [];
    try {
      codes = JSON.parse(tfa.backup_codes || "[]");
    } catch {}
    const codeNorm = String(code).trim().toUpperCase();
    if (!codes.includes(codeNorm))
      return sendError(res, 401, "Code de sécurité incorrect");

    const user = await db
      .prepare(`SELECT * FROM users_emploi WHERE id = $1`)
      .get(decoded.uid);
    if (!user) return sendError(res, 404, "Utilisateur introuvable");

    await getOrCreateProfile(user.username, user.role);
    await resetWorkingProfile(user.username);

    const token = generateEmploiToken(user);
    res.json({ success: true, token, user: publicUser(user) });
  } catch (err) {
    console.error("[EMPLOI 2FA VERIFY]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.post("/api/emploi/logout", authenticateEmploiToken, async (req, res) => {
  await resetWorkingProfile(req.user.username);
  res.json({ success: true });
});

router.get("/api/emploi/me", authenticateEmploiToken, async (req, res) => {
  try {
    const user = await db
      .prepare(
        `SELECT id, username, role, contact, avatar, created_at
         FROM users_emploi WHERE username = $1`,
      )
      .get(req.user.username);
    if (!user) return sendError(res, 404, "Utilisateur introuvable");
    res.json({ success: true, user });
  } catch (err) {
    console.error("[EMPLOI ME]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

/* ════════════════════════════════════════════════════════════════════════
   UPLOADS (CV, lettre, diplômes/justificatifs) — + intégration coffre
   ════════════════════════════════════════════════════════════════════════ */

const UPLOAD_ROOT = path.join(__dirname, "public", "uploads", "emploi");
fs.mkdirSync(path.join(UPLOAD_ROOT, "documents"), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_ROOT, "cvlettre"), { recursive: true });

function safeName(originalname) {
  const ext = path.extname(originalname).slice(0, 10);
  const base = Date.now() + "-" + Math.round(Math.random() * 1e9);
  return `${base}${ext}`;
}

const documentsUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) =>
      cb(null, path.join(UPLOAD_ROOT, "documents")),
    filename: (req, file, cb) => cb(null, safeName(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
});

const cvLettreUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) =>
      cb(null, path.join(UPLOAD_ROOT, "cvlettre")),
    filename: (req, file, cb) => cb(null, safeName(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
});

const vaultUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) =>
      cb(null, path.join(UPLOAD_ROOT, "cvlettre")),
    filename: (req, file, cb) => cb(null, safeName(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

router.use("/uploads/emploi", express.static(UPLOAD_ROOT));

router.post(
  "/emploi/api/upload-documents",
  authenticateEmploiToken,
  documentsUpload.array("documents", 6),
  async (req, res) => {
    try {
      const files = (req.files || []).map(
        (f) => `/uploads/emploi/documents/${f.filename}`,
      );
      res.json({ success: true, documents: files });
    } catch (err) {
      console.error("[EMPLOI UPLOAD DOCUMENTS]", err);
      sendError(res, 500, "Échec de l'envoi des documents");
    }
  },
);

/** Upload CV / lettre pendant le tunnel : alimente aussi le coffre (vault_emploi)
 *  pour que le document soit réutilisable depuis la page Profil. */
router.post(
  "/emploi/api/upload-cvlettre",
  authenticateEmploiToken,
  cvLettreUpload.fields([
    { name: "cv", maxCount: 1 },
    { name: "lettre", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id FROM users_emploi WHERE username=$1`)
        .get(req.user.username);

      const cv = req.files?.cv?.[0]
        ? `/uploads/emploi/cvlettre/${req.files.cv[0].filename}`
        : null;
      const lettre = req.files?.lettre?.[0]
        ? `/uploads/emploi/cvlettre/${req.files.lettre[0].filename}`
        : null;

      if (user) {
        if (cv) {
          await db
            .prepare(
              `INSERT INTO vault_emploi (user_id, kind, label, url) VALUES ($1,'cv',$2,$3)`,
            )
            .run(user.id, req.files.cv[0].originalname || "CV", cv);
        }
        if (lettre) {
          await db
            .prepare(
              `INSERT INTO vault_emploi (user_id, kind, label, url) VALUES ($1,'lettre',$2,$3)`,
            )
            .run(
              user.id,
              req.files.lettre[0].originalname || "Lettre de motivation",
              lettre,
            );
        }
      }

      res.json({ success: true, cv, lettre });
    } catch (err) {
      console.error("[EMPLOI UPLOAD CVLETTRE]", err);
      sendError(res, 500, "Échec de l'envoi du CV / de la lettre");
    }
  },
);

/* ════════════════════════════════════════════════════════════════════════
   TUNNEL DÉTERMINISTE — étapes par rôle
   ════════════════════════════════════════════════════════════════════════ */

const CANDIDAT_STEPS = [
  { field: "domainePath", kind: "popup", popup: "domaine" },
  { field: "zone", kind: "popup", popup: "zone" },
  { field: "salaireMax", kind: "question" },
  { field: "experienceAnnees", kind: "question" },
  { field: "niveauEtude", kind: "popup", popup: "diplome" },
  { field: "competences", kind: "popup", popup: "competences" },
  { field: "cvlettre", kind: "popup", popup: "cvlettre" },
];

const RECRUTEUR_STEPS = [
  { field: "domainePath", kind: "popup", popup: "domaine" },
  { field: "zone", kind: "popup", popup: "zone" },
  { field: "salaireMax", kind: "question" },
  { field: "experienceRequiseAnnees", kind: "question" },
  { field: "niveauEtudeRequis", kind: "popup", popup: "diplome" },
  { field: "competencesRequises", kind: "popup", popup: "competences" },
  { field: "typeContrat", kind: "question" },
];

function isFieldSet(field, sc, role, documents) {
  switch (field) {
    case "domainePath":
      return Array.isArray(sc.domainePath) && sc.domainePath.length > 0;
    case "zone":
      return !!sc.zone;
    case "salaireMax":
      return sc.salaireMax != null || sc.salaireMin != null;
    case "experienceAnnees":
      return sc.experienceAnnees != null;
    case "experienceRequiseAnnees":
      return sc.experienceRequiseAnnees != null;
    case "niveauEtude":
      return !!sc.niveauEtude;
    case "niveauEtudeRequis":
      return !!sc.niveauEtudeRequis;
    case "competences":
      return Array.isArray(sc.competences) && sc.competences.length > 0;
    case "competencesRequises":
      return (
        Array.isArray(sc.competencesRequises) &&
        sc.competencesRequises.length > 0
      );
    case "typeContrat":
      return !!sc.typeContrat;
    case "cvlettre":
      return !!(documents && documents.cvLettreDecided === true);
    default:
      return true;
  }
}

function computeNextStep(role, sc, documents) {
  const steps = role === "recruteur" ? RECRUTEUR_STEPS : CANDIDAT_STEPS;
  for (const step of steps) {
    if (!isFieldSet(step.field, sc, role, documents)) return step;
  }
  return null; // tunnel terminé -> récap
}

const TYPE_CONTRAT_QUESTION =
  "Quel type de contrat proposez-vous pour ce poste ? (CDI, CDD, Alternance, Stage, Freelance...)";

router.get("/emploi/api/domaines", authenticateEmploiToken, (req, res) => {
  res.json({ success: true, domaines: DOMAINES });
});

router.get("/emploi/api/profile", authenticateEmploiToken, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.username, req.user.role);
    res.json({
      success: true,
      criteria: profile.criteria || {},
      documents: profile.documents || {},
      phase: profile.phase,
      published: profile.published,
      role: profile.role,
    });
  } catch (err) {
    console.error("[EMPLOI PROFILE]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

/* ════════════════════════════════════════════════════════════════════════
   CŒUR DU TUNNEL — POST /emploi/chat
   ════════════════════════════════════════════════════════════════════════ */
router.post("/emploi/chat", authenticateEmploiToken, async (req, res) => {
  try {
    const username = req.user.username;
    const role = req.user.role;
    const body = req.body || {};
    const userMessage = (body.message || "").toString();
    const chatFiles = Array.isArray(body.attachments) ? body.attachments.slice(0, 6) : [];
    const attachmentText = chatFiles.map((file) => {
      const name = String(file?.name || "document").replace(/[\\/\r\n]/g, "_").slice(0, 120);
      const content = String(file?.content || "").slice(0, 30_000);
      return content
        ? `\n\n[Texte du fichier joint : ${name}]\n${content}`
        : `\n\n[Fichier joint : ${name} (${String(file?.mime || "type inconnu")})]`;
    }).join("").slice(0, 90_000);
    const message = `${userMessage}${attachmentText}`;

    let profile = await getOrCreateProfile(username, role);
    let sc = { ...(profile.criteria || {}), intent: role };
    let documents = { ...(profile.documents || {}) };
    let phase = profile.phase || "tunnel";

    if (phase === "results") {
      return await handleResultsPhase({
        req,
        res,
        username,
        role,
        sc,
        message,
        body,
      });
    }

    if (message === "__DOMAINE_SELECTED__" && Array.isArray(body.domainePath)) {
      sc.domainePath = body.domainePath.filter(Boolean);
      sc.metier =
        sc.domainePath[sc.domainePath.length - 1] || sc.metier || null;
    } else if (message === "__ZONE_SELECTED__" && body.zone) {
      sc.zone = String(body.zone).trim();
      if (body.remote) sc.remote = body.remote;
    } else if (message === "__DIPLOME_SELECTED__" && body.niveau) {
      if (role === "recruteur") sc.niveauEtudeRequis = body.niveau;
      else sc.niveauEtude = body.niveau;
    } else if (
      message === "__COMPETENCES_SELECTED__" &&
      Array.isArray(body.competences)
    ) {
      if (role === "recruteur") sc.competencesRequises = body.competences;
      else sc.competences = body.competences;
    } else if (message === "__CVLETTRE_UPLOADED__") {
      documents.cv = body.cv || documents.cv || null;
      documents.lettre = body.lettre || documents.lettre || null;
      documents.cvLettreDecided = true;
    } else if (message === "__CVLETTRE_SKIPPED__") {
      documents.cvLettreDecided = true;
    } else if (
      message === "__DOCUMENTS_UPLOADED__" &&
      Array.isArray(body.documents)
    ) {
      documents.justificatifs = [
        ...(documents.justificatifs || []),
        ...body.documents,
      ];
    } else if (message === "__RECAP_CONFIRMED__") {
      profile = await saveProfile(username, {
        criteria: sc,
        documents,
        publishedCriteria: sc,
        publishedDocuments: documents,
        phase: "results",
        published: true,
      });

      // Historique — chaque publication crée une entrée consultable
      // depuis "Mes annonces" dans le Profil.
      try {
        const userRow = await db
          .prepare(`SELECT id FROM users_emploi WHERE username=$1`)
          .get(username);
        if (userRow) {
          await db
            .prepare(
              `INSERT INTO annonces_emploi (user_id, username, role, criteria, documents, published)
               VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,TRUE)`,
            )
            .run(
              userRow.id,
              username,
              role,
              JSON.stringify(sc),
              JSON.stringify(documents),
            );
        }
        await syncProfileVilleFromChat(username, sc.zone);
      } catch (e) {
        console.error("[EMPLOI PERSIST ANNONCE]", e.message);
      }

      const pool = await getOppositePool(role, username);
      const prefsForMatch = await getUserPrefsForMatching(username);
      const matches = getMatchesForProfile(sc, role, pool);

      const introText = await generatePhrasing(role, sc, {
        type: "match_intro",
        hasMatches: matches.length > 0,
      });

      return res.json({
        success: true,
        phase: "results",
        criteria: sc,
        reply: null,
        matchingDone: true,
        matches,
        postReply: introText,
      });
    } else if (message === "__RECAP_MODIFY__") {
      const modifyText = await generatePhrasing(role, sc, {
        type: "modify_prompt",
      });
      return res.json({
        success: true,
        phase: "tunnel",
        criteria: sc,
        reply: modifyText,
      });
    } else if (message && !message.startsWith("__")) {
      const stepBefore = computeNextStep(role, sc, documents);
      const noExp = parseNoExperienceAnswer(message);
      if (
        role === "candidat" &&
        stepBefore?.field === "experienceAnnees" &&
        noExp !== null
      ) {
        sc.experienceAnnees = noExp;
      } else {
        sc = await extractCriteria(message, role, sc);
      }
    }

    profile = await saveProfile(username, { criteria: sc, documents });

    const nextStep = computeNextStep(role, sc, documents);

    if (!nextStep) {
      const recapText = await generatePhrasing(role, sc, { type: "recap" });
      return res.json({
        success: true,
        phase: "tunnel",
        criteria: sc,
        reply: recapText,
        triggerRecapPopup: true,
        recapData: { ...sc, role, documents },
      });
    }

    if (nextStep.kind === "popup") {
      const popupText = await generatePhrasing(role, sc, {
        type: "popup",
        popup: nextStep.popup,
      });
      const triggerKey = {
        domaine: "triggerDomainePopup",
        zone: "triggerZonePopup",
        diplome: "triggerDiplomePopup",
        competences: "triggerCompetencesPopup",
        cvlettre: "triggerCvlettrePopup",
      }[nextStep.popup];

      return res.json({
        success: true,
        phase: "tunnel",
        criteria: sc,
        reply: popupText,
        ...(triggerKey ? { [triggerKey]: true } : {}),
      });
    }

    let questionText;
    if (nextStep.field === "typeContrat") {
      questionText = TYPE_CONTRAT_QUESTION;
    } else {
      questionText = await generatePhrasing(role, sc, {
        type: "question",
        field: nextStep.field,
      });
    }

    return res.json({
      success: true,
      phase: "tunnel",
      criteria: sc,
      reply: questionText,
    });
  } catch (err) {
    console.error("[EMPLOI CHAT]", err);
    sendError(res, 500, "Erreur serveur — veuillez réessayer");
  }
});

/* ════════════════════════════════════════════════════════════════════════
   PHASE RÉSULTATS — contact / modification / conseil
   ════════════════════════════════════════════════════════════════════════ */

async function handleResultsPhase({
  req,
  res,
  username,
  role,
  sc,
  message,
  body,
}) {
  if (message === "__CRITERIA_UPDATE__" && body.updatedCriteria) {
    const updated = { ...sc, ...body.updatedCriteria };
    await saveProfile(username, {
      criteria: updated,
      publishedCriteria: updated,
    });
    const pool = await getOppositePool(role, username);
    const prefsForMatch = await getUserPrefsForMatching(username);
    const matches = getMatchesForProfile(updated, role, pool);
    const text = await generatePhrasing(role, updated, {
      type: "criteria_updated",
      hasMatches: matches.length > 0,
    });
    return res.json({
      success: true,
      phase: "results",
      criteria: updated,
      reply: text,
      matchingDone: true,
      matches,
      actionType: "criteria_updated",
    });
  }

  if (message.startsWith("__ACTION_CONTACT__:")) {
    const idx = parseInt(message.split(":")[1], 10);
    const pool = await getOppositePool(role, username);
    const matches = getMatchesForProfile(sc, role, pool);
    const target = matches[idx];
    if (!target) {
      return res.json({
        success: true,
        phase: "results",
        reply: "Ce profil n'est plus disponible, veuillez réessayer.",
      });
    }

    const targetUser = await db
      .prepare(`SELECT username, contact FROM users_emploi WHERE username = $1`)
      .get(target.username);

    const contactMsg = await generateContactMessage(role, sc, target);
    let messageSent = false;
    try {
      await db
        .prepare(
          `INSERT INTO messages_emploi (from_username, to_username, content) VALUES ($1, $2, $3)`,
        )
        .run(username, target.username, contactMsg);
      messageSent = true;

      const receiver = await db
        .prepare(`SELECT id FROM users_emploi WHERE username=$1`)
        .get(target.username);
      if (receiver) {
        await pushNotificationEmploi(
          receiver.id,
          "message",
          "Nouveau message reçu",
          `${username} vous a contacté au sujet de votre profil.`,
          { type: "message", link: "messagerie" },
        );
      }
    } catch (e) {
      console.error("[EMPLOI CONTACT INSERT]", e);
    }

    const contactInfo = {
      name: targetUser?.username || target.username,
      email: targetUser?.contact || "",
    };

    const confirmationText = messageSent
      ? `Message envoyé à ${contactInfo.name} (${contactInfo.email}). Vous pouvez suivre l'échange dans votre messagerie.`
      : "Le message n'a pas pu être envoyé — réessayez.";

    return res.json({
      success: true,
      phase: "results",
      reply: confirmationText,
      actionType: "contact_done",
      messageSent,
      contactInfo,
    });
  }

  const pool = await getOppositePool(role, username);
  const prefsForMatch = await getUserPrefsForMatching(username);
  const matches = getMatchesForProfile(sc, role, pool);
  const intent = detectResultsIntent(message);

  const { message: aiMessage } = await aiResultsChat(message, sc, {
    role,
    matchingProfiles: matches,
  });

  return res.json({
    success: true,
    phase: "results",
    reply: aiMessage,
    matchingDone: intent === "compare" || intent === "detail" ? false : false,
    actionType: undefined,
  });
}

/* ════════════════════════════════════════════════════════════════════════
   ══════════════════════   PAGE PROFIL — API   ═════════════════════════
   ════════════════════════════════════════════════════════════════════════ */

async function emploiUserRow(username) {
  return db
    .prepare(
      `SELECT id, username, role, contact, avatar, ville, created_at, preferences
       FROM users_emploi WHERE LOWER(TRIM(username))=$1`,
    )
    .get((username || "").trim().toLowerCase());
}
async function emploiUserId(username) {
  const u = await db
    .prepare(`SELECT id FROM users_emploi WHERE username=$1`)
    .get(username);
  return u?.id || null;
}
function safeJson(v, fallback = {}) {
  try {
    if (v == null) return fallback;
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return fallback;
  }
}

/* ── IDENTITÉ ─────────────────────────────────────────────────────────── */

router.get("/emploi/api/me/full", authenticateEmploiToken, async (req, res) => {
  try {
    const user = await emploiUserRow(req.user.username);
    if (!user) return sendError(res, 404, "Utilisateur introuvable");
    res.json({ success: true, ...user });
  } catch (err) {
    console.error("[emploi me/full]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.patch("/emploi/api/me", authenticateEmploiToken, async (req, res) => {
  try {
    const allowed = ["contact", "ville"];
    const updates = {};
    for (const k of allowed)
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    if (!Object.keys(updates).length)
      return sendError(res, 400, "Aucun champ valide");
    const set = Object.keys(updates)
      .map((k, i) => `${k}=$${i + 1}`)
      .join(", ");
    const vals = [...Object.values(updates), req.user.username];
    await db
      .prepare(`UPDATE users_emploi SET ${set} WHERE username=$${vals.length}`)
      .run(...vals);
    res.json({ success: true, updated: updates });
  } catch (err) {
    console.error("[emploi PATCH me]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.post(
  "/emploi/api/change-avatar",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const { avatar } = req.body;
      if (!avatar) return sendError(res, 400, "Avatar manquant");
      await db
        .prepare(`UPDATE users_emploi SET avatar=$1 WHERE username=$2`)
        .run(avatar, req.user.username);
      res.json({ success: true, avatar });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

const EMPLOI_AVATARS = Array.from(
  { length: 15 },
  (_, i) => `/images/avatar-${i + 1}.jpg`,
);
const EMPLOI_AVATAR_DEFAULT = "/images/avatar-default.jpg";

router.get("/emploi/api/avatars", authenticateEmploiToken, (req, res) => {
  res.json({ avatars: EMPLOI_AVATARS, default: EMPLOI_AVATAR_DEFAULT });
});

router.get("/emploi/api/stats", authenticateEmploiToken, async (req, res) => {
  try {
    const uid = await emploiUserId(req.user.username);
    if (!uid) return sendError(res, 404, "Introuvable");

    const favResult = await db
      .prepare(
        `SELECT COUNT(*) AS count FROM favorites_emploi WHERE user_id=$1`,
      )
      .get(uid);
    const annoncesResult = await db
      .prepare(`SELECT COUNT(*) AS count FROM annonces_emploi WHERE user_id=$1`)
      .get(uid);
    const convoResult = await db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN from_username=$1 THEN to_username ELSE from_username END) AS count
         FROM messages_emploi WHERE from_username=$1 OR to_username=$1`,
      )
      .get(req.user.username);

    res.json({
      totalFavoris: favResult?.count || 0,
      totalAnnonces: annoncesResult?.count || 0,
      activeConversations: convoResult?.count || 0,
    });
  } catch (err) {
    console.error("[emploi stats]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

/* ── FAVORIS ──────────────────────────────────────────────────────────── */

router.post(
  "/emploi/api/favorites",
  authenticateEmploiToken,
  async (req, res) => {
    const uid = await emploiUserId(req.user.username);
    if (!uid) return sendError(res, 404, "Introuvable");
    const info = await db
      .prepare(
        `INSERT INTO favorites_emploi (user_id, profile_data) VALUES ($1,$2) RETURNING id`,
      )
      .get(uid, JSON.stringify(req.body));
    res.json({ success: true, dbId: info?.id });
  },
);

router.get(
  "/emploi/api/favorites",
  authenticateEmploiToken,
  async (req, res) => {
    const uid = await emploiUserId(req.user.username);
    if (!uid) return sendError(res, 404, "Introuvable");
    const rows = await db
      .prepare(
        `SELECT id, profile_data FROM favorites_emploi WHERE user_id=$1 ORDER BY created_at DESC`,
      )
      .all(uid);
    res.json(rows.map((r) => ({ dbId: r.id, ...safeJson(r.profile_data) })));
  },
);

/* ── MES ANNONCES (historique) ───────────────────────────────────────── */

router.get(
  "/emploi/api/my-annonces",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const rows = await db
        .prepare(
          `SELECT * FROM annonces_emploi WHERE user_id=$1 AND archived=FALSE ORDER BY updated_at DESC`,
        )
        .all(uid);
      res.json(
        rows.map((r) => ({
          ...r,
          criteria: safeJson(r.criteria),
          documents: safeJson(r.documents),
        })),
      );
    } catch (err) {
      console.error("[emploi my-annonces]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.delete(
  "/emploi/api/my-annonces/:id",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      await db
        .prepare(`DELETE FROM annonces_emploi WHERE id=$1 AND user_id=$2`)
        .run(Number(req.params.id), uid);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.post(
  "/emploi/api/my-annonces/:id/pourvu",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const pourvu = !!req.body?.pourvu;

      const annonce = await db
        .prepare(
          `UPDATE annonces_emploi SET pourvu=$1, updated_at=CURRENT_TIMESTAMP
           WHERE id=$2 AND user_id=$3 RETURNING id`,
        )
        .get(pourvu, Number(req.params.id), uid);
      if (!annonce) return sendError(res, 404, "Annonce introuvable");

      // Répercute sur le profil publié (c'est cette table que lit le pool
      // de matching) uniquement si c'est la dernière annonce publiée.
      await db
        .prepare(`UPDATE profils_emploi SET pourvu=$1 WHERE username=$2`)
        .run(pourvu, req.user.username);

      res.json({ success: true, pourvu });
    } catch (err) {
      console.error("[emploi my-annonces pourvu]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);
/* ── AGENDA ───────────────────────────────────────────────────────────── */

router.get("/emploi/api/agenda", authenticateEmploiToken, async (req, res) => {
  try {
    const uid = await emploiUserId(req.user.username);
    if (!uid) return sendError(res, 404, "Introuvable");
    const rows = await db
      .prepare(
        `SELECT * FROM agenda_emploi WHERE user_id=$1 ORDER BY date ASC, time ASC`,
      )
      .all(uid);
    res.json(rows);
  } catch (err) {
    sendError(res, 500, "Erreur serveur");
  }
});

router.post("/emploi/api/agenda", authenticateEmploiToken, async (req, res) => {
  try {
    const { name, date, time, kind, description, color } = req.body;
    if (!name || !date) return sendError(res, 400, "name et date requis");
    const uid = await emploiUserId(req.user.username);
    if (!uid) return sendError(res, 404, "Introuvable");
    const r = await db
      .prepare(
        `INSERT INTO agenda_emploi (user_id, name, date, time, kind, description, color)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      )
      .get(
        uid,
        name,
        String(date).slice(0, 10),
        time || "",
        kind || "autre",
        description || "",
        color || "#7CFC3C",
      );
    res.json({ success: true, id: r?.id });
  } catch (err) {
    console.error("[emploi agenda post]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.patch(
  "/emploi/api/agenda/:id",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const allowed = ["name", "date", "time", "kind", "description", "color"];
      const updates = {};
      for (const k of allowed) {
        if (req.body?.[k] === undefined) continue;
        updates[k] =
          k === "date" ? String(req.body[k]).slice(0, 10) : req.body[k];
      }
      if (!Object.keys(updates).length)
        return sendError(res, 400, "Aucun champ valide");
      updates.reminded = false;
      const set = Object.keys(updates)
        .map((k, i) => `${k}=$${i + 1}`)
        .join(", ");
      const vals = [...Object.values(updates), Number(req.params.id), uid];
      await db
        .prepare(
          `UPDATE agenda_emploi SET ${set} WHERE id=$${vals.length - 1} AND user_id=$${vals.length}`,
        )
        .run(...vals);
      res.json({ success: true, updated: updates });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.delete(
  "/emploi/api/agenda/:id",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      await db
        .prepare(`DELETE FROM agenda_emploi WHERE id=$1 AND user_id=$2`)
        .run(Number(req.params.id), uid);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── ACTIVITÉ (temps d'écran) ────────────────────────────────────────── */

router.post(
  "/emploi/api/activity/ping",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const seconds = Math.max(
        0,
        Math.min(3600, Number(req.body?.seconds) || 60),
      );
      const events = Math.max(0, Math.min(500, Number(req.body?.events) || 0));
      const day = new Date().toISOString().slice(0, 10);
      await db
        .prepare(
          `INSERT INTO activity_emploi (user_id, day, seconds, events)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, day)
           DO UPDATE SET seconds = activity_emploi.seconds + $3,
                         events  = activity_emploi.events + $4`,
        )
        .run(uid, day, seconds, events);
      res.json({ success: true });
    } catch (err) {
      console.error("[emploi activity ping]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.get(
  "/emploi/api/activity",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const days = Math.max(3, Math.min(90, Number(req.query.days) || 30));
      const rows = await db
        .prepare(
          `SELECT day, seconds, events FROM activity_emploi WHERE user_id=$1 ORDER BY day ASC`,
        )
        .all(uid);
      const map = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
      const series = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
          .toISOString()
          .slice(0, 10);
        const r = map.get(d);
        series.push({
          day: d,
          minutes: Math.round((r?.seconds || 0) / 60),
          events: r?.events || 0,
        });
      }
      const totalMinutes = series.reduce((s, p) => s + p.minutes, 0);
      const activeDays = series.filter((p) => p.minutes > 0).length;
      res.json({
        series,
        totalMinutes,
        activeDays,
        avgMinutes: Math.round(totalMinutes / Math.max(activeDays, 1)),
        bestDay: series.reduce(
          (b, p) => (p.minutes > (b?.minutes || 0) ? p : b),
          null,
        ),
      });
    } catch (err) {
      console.error("[emploi activity]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── COFFRE CV / LETTRES ─────────────────────────────────────────────── */

router.get("/emploi/api/vault", authenticateEmploiToken, async (req, res) => {
  try {
    const uid = await emploiUserId(req.user.username);
    if (!uid) return sendError(res, 404, "Introuvable");
    const rows = await db
      .prepare(
        `SELECT * FROM vault_emploi WHERE user_id=$1 ORDER BY created_at DESC`,
      )
      .all(uid);
    res.json({
      cv: rows.filter((r) => r.kind === "cv"),
      lettres: rows.filter((r) => r.kind === "lettre"),
    });
  } catch (err) {
    console.error("[emploi vault]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.post(
  "/emploi/api/vault",
  authenticateEmploiToken,
  vaultUpload.single("file"),
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const { label, kind } = req.body || {};
      if (!req.file || !label || !["cv", "lettre"].includes(kind))
        return sendError(res, 400, "label, kind (cv|lettre) et fichier requis");
      const url = `/uploads/emploi/cvlettre/${req.file.filename}`;
      const r = await db
        .prepare(
          `INSERT INTO vault_emploi (user_id, kind, label, url) VALUES ($1,$2,$3,$4) RETURNING id`,
        )
        .get(uid, kind, label, url);
      res.json({ success: true, id: r?.id, url });
    } catch (err) {
      console.error("[emploi vault post]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.delete(
  "/emploi/api/vault/:id",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      await db
        .prepare(`DELETE FROM vault_emploi WHERE id=$1 AND user_id=$2`)
        .run(Number(req.params.id), uid);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── DIAGNOSTIC MARCHÉ (fonctionnalité propre à Emploi) ──────────────────
   Compare le profil (candidat ou recruteur) au marché réel de la plateforme :
   - Candidat : positionnement salarial (percentile), écart de compétences
     par rapport à ce que les recruteurs demandent le plus dans son domaine,
     score d'attractivité.
   - Recruteur : compétitivité de l'offre (salaire vs attentes candidats),
     couverture des compétences demandées dans le vivier disponible,
     score d'attractivité de l'offre.
   ────────────────────────────────────────────────────────────────────── */

function domaineRoot(criteria) {
  return Array.isArray(criteria?.domainePath) && criteria.domainePath.length
    ? criteria.domainePath[0]
    : null;
}

function percentileOf(value, sortedArr) {
  if (!sortedArr.length || value == null) return null;
  let below = 0;
  for (const v of sortedArr) if (v <= value) below++;
  return Math.round((below / sortedArr.length) * 100);
}

router.post(
  "/emploi/api/diagnostic",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const username = req.user.username;
      const role = req.user.role;

      const me = await getOrCreateProfile(username, role);
      const sc = safeJson(me.published_criteria, {});
      if (!sc || !Object.keys(sc).length) {
        return res.json({
          success: true,
          available: false,
          message:
            "Publiez d'abord une annonce (candidature ou offre) pour obtenir votre diagnostic marché.",
        });
      }

      const domaine = domaineRoot(sc);

      // Pool de référence : même rôle, même domaine si possible.
      const sameRolePool = await db
        .prepare(
          `SELECT criteria FROM profils_emploi
           WHERE role=$1 AND published=TRUE AND username != $2`,
        )
        .all(role, username);
      let refCriteria = sameRolePool.map((r) =>
        safeJson(r.published_criteria || r.criteria),
      );
      let scopedToDomaine = false;
      if (domaine) {
        const scoped = refCriteria.filter((c) => domaineRoot(c) === domaine);
        if (scoped.length >= 3) {
          refCriteria = scoped;
          scopedToDomaine = true;
        }
      }

      // Pool opposé : ce que "l'autre côté du marché" demande / propose.
      const oppositeRole = role === "candidat" ? "recruteur" : "candidat";
      const oppositePool = await db
        .prepare(
          `SELECT published_criteria FROM profils_emploi
           WHERE role=$1 AND published=TRUE`,
        )
        .all(oppositeRole);
      let oppCriteria = oppositePool.map((r) => safeJson(r.published_criteria));
      if (domaine) {
        const scoped = oppCriteria.filter((c) => domaineRoot(c) === domaine);
        if (scoped.length >= 3) oppCriteria = scoped;
      }

      const salaries = refCriteria
        .map((c) => c.salaireMax ?? c.salaireMin)
        .filter((v) => typeof v === "number" && v > 0)
        .sort((a, b) => a - b);

      const mySalary = sc.salaireMax ?? sc.salaireMin ?? null;
      const salaryPercentile = percentileOf(mySalary, salaries);
      const avgSalary = salaries.length
        ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length)
        : null;

      // Compétences demandées côté opposé (fréquence).
      const demandKey =
        oppositeRole === "recruteur" ? "competencesRequises" : "competences";
      const freq = new Map();
      for (const c of oppCriteria) {
        const arr = Array.isArray(c[demandKey]) ? c[demandKey] : [];
        for (const skill of arr) {
          const k = String(skill).trim().toLowerCase();
          if (!k) continue;
          freq.set(k, (freq.get(k) || 0) + 1);
        }
      }
      const topDemanded = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([skill, count]) => ({
          skill,
          count,
          pct: oppCriteria.length
            ? Math.round((count / oppCriteria.length) * 100)
            : 0,
        }));

      const mineKey =
        role === "recruteur" ? "competencesRequises" : "competences";
      const mySkills = new Set(
        (Array.isArray(sc[mineKey]) ? sc[mineKey] : []).map((s) =>
          String(s).trim().toLowerCase(),
        ),
      );
      const gaps = topDemanded
        .filter((d) => !mySkills.has(d.skill))
        .slice(0, 5);
      const covered = topDemanded.filter((d) => mySkills.has(d.skill));

      // Score d'attractivité : mix positionnement salarial + couverture compétences.
      const skillCoverageScore = topDemanded.length
        ? Math.round((covered.length / topDemanded.length) * 100)
        : 50;
      const salaryScore =
        role === "candidat"
          ? salaryPercentile == null
            ? 50
            : 100 - Math.min(90, Math.abs(salaryPercentile - 40)) // proche du marché = mieux
          : salaryPercentile == null
            ? 50
            : salaryPercentile; // recruteur : payer au-dessus du marché = attractif
      const attractiveness = Math.round(
        skillCoverageScore * 0.55 + salaryScore * 0.45,
      );

      const recommendations = [];
      if (gaps.length) {
        recommendations.push(
          role === "candidat"
            ? `Les recruteurs de votre domaine demandent souvent : ${gaps.map((g) => g.skill).join(", ")}. Les mentionner (si acquises) renforcerait votre profil.`
            : `Les candidats disponibles maîtrisent souvent : ${gaps.map((g) => g.skill).join(", ")}. Ajouter ces critères élargirait votre vivier.`,
        );
      }
      if (mySalary != null && avgSalary != null) {
        const diffPct = Math.round(((mySalary - avgSalary) / avgSalary) * 100);
        if (role === "candidat" && diffPct > 15) {
          recommendations.push(
            `Votre prétention salariale est ${diffPct}% au-dessus de la moyenne observée (${avgSalary.toLocaleString("fr-FR")} €). Cela peut réduire le nombre de recruteurs compatibles.`,
          );
        } else if (role === "recruteur" && diffPct < -10) {
          recommendations.push(
            `Votre offre est ${Math.abs(diffPct)}% en-dessous de la moyenne du marché (${avgSalary.toLocaleString("fr-FR")} €). L'augmenter améliorerait votre attractivité.`,
          );
        }
      }
      if (!recommendations.length) {
        recommendations.push(
          "Votre profil est bien aligné avec le marché observé sur la plateforme.",
        );
      }

      res.json({
        success: true,
        available: true,
        domaine,
        scopedToDomaine,
        sampleSize: refCriteria.length,
        oppositeSampleSize: oppCriteria.length,
        attractiveness,
        salary: {
          mine: mySalary,
          average: avgSalary,
          percentile: salaryPercentile,
        },
        skills: { demanded: topDemanded, gaps, covered },
        recommendations,
      });
    } catch (err) {
      console.error("[emploi diagnostic]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── PRÉFÉRENCES ──────────────────────────────────────────────────────── */

/** Défauts non-négociables : matching auto toujours actif. */
function withEmploiPrefDefaults(p = {}) {
  return {
    ...p,
    autoMatch: true,
    prioriteCV: p.prioriteCV !== false,
    triPertinence: p.triPertinence !== false,
  };
}

router.get(
  "/emploi/api/preferences",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT preferences FROM users_emploi WHERE username=$1`)
        .get(req.user.username);
      if (!user) return sendError(res, 404, "Introuvable");
      res.json(withEmploiPrefDefaults(safeJson(user.preferences, {})));
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.patch(
  "/emploi/api/preferences",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id, preferences FROM users_emploi WHERE username=$1`)
        .get(req.user.username);
      if (!user) return sendError(res, 404, "Introuvable");
      const current = safeJson(user.preferences, {});
      const merged = withEmploiPrefDefaults({ ...current, ...req.body });
      await db
        .prepare(`UPDATE users_emploi SET preferences=$1 WHERE id=$2`)
        .run(JSON.stringify(merged), user.id);
      res.json({ success: true, preferences: merged });
    } catch (err) {
      console.error("[emploi prefs patch]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── SÉCURITÉ (mot de passe, 2FA, export) ────────────────────────────── */

router.post(
  "/emploi/api/change-password",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword || newPassword.length < 8)
        return sendError(
          res,
          400,
          "Mot de passe actuel requis, nouveau de 8 caractères min.",
        );
      const user = await db
        .prepare(`SELECT id, password FROM users_emploi WHERE username=$1`)
        .get(req.user.username);
      if (!user) return sendError(res, 404, "Introuvable");

      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) return sendError(res, 401, "Mot de passe actuel incorrect");

      const hash = await bcrypt.hash(newPassword, 10);
      await db
        .prepare(`UPDATE users_emploi SET password=$1 WHERE id=$2`)
        .run(hash, user.id);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.get(
  "/emploi/api/2fa/status",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const tfa = await db
        .prepare(`SELECT enabled FROM user_2fa_emploi WHERE user_id=$1`)
        .get(uid);
      res.json({ enabled: tfa?.enabled || false });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.post(
  "/emploi/api/2fa/enable",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const { secret, code } = req.body;
      if (!secret || !/^\d{6}$/.test(code || ""))
        return sendError(res, 400, "Code invalide");
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");

      const backupCodes = Array.from(
        { length: 3 },
        () =>
          `${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      );
      const existing = await db
        .prepare(`SELECT id FROM user_2fa_emploi WHERE user_id=$1`)
        .get(uid);
      if (existing) {
        await db
          .prepare(
            `UPDATE user_2fa_emploi SET secret=$1, enabled=true, backup_codes=$2 WHERE user_id=$3`,
          )
          .run(secret, JSON.stringify(backupCodes), uid);
      } else {
        await db
          .prepare(
            `INSERT INTO user_2fa_emploi (user_id, secret, enabled, backup_codes) VALUES ($1,$2,true,$3)`,
          )
          .run(uid, secret, JSON.stringify(backupCodes));
      }
      res.json({ success: true, backupCodes });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.post(
  "/emploi/api/2fa/disable",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      await db
        .prepare(`UPDATE user_2fa_emploi SET enabled=false WHERE user_id=$1`)
        .run(uid);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.get(
  "/emploi/api/export-data",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT * FROM users_emploi WHERE username=$1`)
        .get(req.user.username);
      if (!user) return sendError(res, 404, "Introuvable");
      delete user.password;
      const uid = user.id;
      const annonces = await db
        .prepare(`SELECT * FROM annonces_emploi WHERE user_id=$1`)
        .all(uid);
      const favoris = await db
        .prepare(`SELECT * FROM favorites_emploi WHERE user_id=$1`)
        .all(uid);
      const agenda = await db
        .prepare(`SELECT * FROM agenda_emploi WHERE user_id=$1`)
        .all(uid);
      const vault = await db
        .prepare(`SELECT * FROM vault_emploi WHERE user_id=$1`)
        .all(uid);
      res.json({
        user,
        annonces,
        favoris,
        agenda,
        vault,
        exportedAt: new Date().toISOString(),
      });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── SUPPORT & CENTRE D'AIDE ──────────────────────────────────────────── */

function getMailTransporterEmploi() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) return null;
  // nodemailer est déjà une dépendance du projet (utilisée par AiGENT Occasion) ;
  // import dynamique pour ne pas alourdir ce module si l'email n'est pas configuré.
  return import("nodemailer").then(({ default: nodemailer }) =>
    nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    }),
  );
}

async function sendSupportEmailEmploi({
  username,
  contact,
  subject,
  category,
  message,
  ticketId,
}) {
  try {
    const transporter = await getMailTransporterEmploi();
    if (!transporter) {
      console.warn(
        "[SUPPORT EMPLOI] GMAIL_USER/GMAIL_PASS absents — email non envoyé",
      );
      return false;
    }
    const emailContent = `Nouveau message support · Mon AiGENT Emploi

Utilisateur connecté : ${username} (${contact || "contact inconnu"})
Ticket #${ticketId}
Catégorie : ${category}

Sujet : ${subject}

Message :
${message}`;
    await transporter.sendMail({
      from: `"Support Mon AiGENT Emploi" <${process.env.GMAIL_USER}>`,
      to: SUPPORT_EMAIL_TO_EMPLOI,
      subject: `📩 [Emploi #${ticketId}] ${subject}`,
      text: emailContent,
    });
    return true;
  } catch (err) {
    console.error("[SUPPORT EMPLOI] Envoi Gmail échoué:", err.message);
    return false;
  }
}

router.post(
  "/emploi/api/support",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const { subject, message, category } = req.body || {};
      if (!subject || !message || String(message).trim().length < 10)
        return sendError(
          res,
          400,
          "Sujet et message (10 caractères min.) requis",
        );

      const ticket = await db
        .prepare(
          `INSERT INTO support_emploi (user_id, subject, category, message)
         VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
        )
        .get(uid, subject, category || "general", message);

      const mailed = await sendSupportEmailEmploi({
        username: req.user.username,
        contact: req.user.contact,
        subject,
        category: category || "general",
        message,
        ticketId: ticket.id,
      });

      await pushNotificationEmploi(
        uid,
        "support",
        `Ticket #${ticket.id} reçu`,
        "Notre équipe vous répond sous 24h ouvrées.",
      );

      res.json({ success: true, ticketId: ticket.id, mailed });
    } catch (err) {
      console.error("[emploi support]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.get("/emploi/api/support", authenticateEmploiToken, async (req, res) => {
  try {
    const uid = await emploiUserId(req.user.username);
    if (!uid) return sendError(res, 404, "Introuvable");
    const rows = await db
      .prepare(
        `SELECT id, subject, category, status, created_at FROM support_emploi
         WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
      )
      .all(uid);
    res.json(rows);
  } catch (err) {
    sendError(res, 500, "Erreur serveur");
  }
});

/* ── NOTIFICATIONS ────────────────────────────────────────────────────── */

async function pushNotificationEmploi(userId, type, title, body, data = {}) {
  await db
    .prepare(
      `INSERT INTO notifications_emploi (user_id, type, title, body, data) VALUES ($1,$2,$3,$4,$5)`,
    )
    .run(userId, type, title, body, JSON.stringify(data));
}

router.get(
  "/emploi/api/notifications",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const rows = await db
        .prepare(
          `SELECT * FROM notifications_emploi WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        )
        .all(uid);
      res.json(rows);
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.post(
  "/emploi/api/notifications/read",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const { id } = req.body;
      if (id) {
        await db
          .prepare(
            `UPDATE notifications_emploi SET read=true WHERE id=$1 AND user_id=$2`,
          )
          .run(id, uid);
      } else {
        await db
          .prepare(`UPDATE notifications_emploi SET read=true WHERE user_id=$1`)
          .run(uid);
      }
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── ZONE CRITIQUE ─────────────────────────────────────────────────────── */

router.post(
  "/emploi/api/reset-profile",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const username = req.user.username;
      await db
        .prepare(
          `UPDATE profils_emploi SET criteria='{}'::jsonb, documents='{}'::jsonb,
           published_criteria='{}'::jsonb, published_documents='{}'::jsonb,
           phase='tunnel', published=FALSE, updated_at=CURRENT_TIMESTAMP
           WHERE username=$1`,
        )
        .run(username);
      const uid = await emploiUserId(username);
      if (uid) {
        await db
          .prepare(`DELETE FROM annonces_emploi WHERE user_id=$1`)
          .run(uid);
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[emploi reset-profile]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.delete(
  "/emploi/api/delete-data",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const username = req.user.username;
      const uid = await emploiUserId(username);
      if (!uid) return sendError(res, 404, "Introuvable");
      await db
        .prepare(`DELETE FROM favorites_emploi WHERE user_id=$1`)
        .run(uid);
      await db
        .prepare(
          `DELETE FROM messages_emploi WHERE from_username=$1 OR to_username=$1`,
        )
        .run(username);
      await db.prepare(`DELETE FROM annonces_emploi WHERE user_id=$1`).run(uid);
      await db.prepare(`DELETE FROM agenda_emploi WHERE user_id=$1`).run(uid);
      await db.prepare(`DELETE FROM vault_emploi WHERE user_id=$1`).run(uid);
      await db
        .prepare(
          `UPDATE profils_emploi SET criteria='{}'::jsonb, documents='{}'::jsonb,
           published_criteria='{}'::jsonb, published_documents='{}'::jsonb,
           phase='tunnel', published=FALSE WHERE username=$1`,
        )
        .run(username);
      res.json({ success: true });
    } catch (err) {
      console.error("[emploi delete-data]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.delete(
  "/emploi/api/delete-account",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const username = req.user.username;
      const uid = await emploiUserId(username);
      if (!uid) return sendError(res, 404, "Introuvable");
      await db
        .prepare(`DELETE FROM favorites_emploi WHERE user_id=$1`)
        .run(uid);
      await db
        .prepare(
          `DELETE FROM messages_emploi WHERE from_username=$1 OR to_username=$1`,
        )
        .run(username);
      await db.prepare(`DELETE FROM annonces_emploi WHERE user_id=$1`).run(uid);
      await db.prepare(`DELETE FROM agenda_emploi WHERE user_id=$1`).run(uid);
      await db.prepare(`DELETE FROM vault_emploi WHERE user_id=$1`).run(uid);
      await db
        .prepare(`DELETE FROM notifications_emploi WHERE user_id=$1`)
        .run(uid);
      await db.prepare(`DELETE FROM support_emploi WHERE user_id=$1`).run(uid);
      await db.prepare(`DELETE FROM user_2fa_emploi WHERE user_id=$1`).run(uid);
      await db
        .prepare(`DELETE FROM profils_emploi WHERE username=$1`)
        .run(username);
      await db.prepare(`DELETE FROM users_emploi WHERE id=$1`).run(uid);
      res.json({ success: true });
    } catch (err) {
      console.error("[emploi delete-account]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ════════════════════════════════════════════════════════════════════════
   AJOUT — MESSAGERIE COMPLÈTE POUR MON AIGENT EMPLOI
   (1-à-1, groupes, pièces jointes, présence, archivage, blocage)

   À COLLER DANS server-emploi.js, juste AVANT la ligne :
       export default router;
   (par exemple juste après le bloc "MOTEUR D'ALERTES" existant).

   Ne modifie et ne supprime RIEN de l'existant :
   - les ALTER TABLE utilisent IF NOT EXISTS → sans danger si déjà présent
   - les nouvelles tables sont indépendantes
   - les nouvelles routes utilisent des chemins qui n'existent pas encore
   - authenticateEmploiToken, sendError, db, path, fs, multer, safeName,
     UPLOAD_ROOT, pushNotificationEmploi, safeJson sont déjà déclarés plus
     haut dans server-emploi.js : on les réutilise tels quels.
   ════════════════════════════════════════════════════════════════════════ */

// ── Migration table messages_emploi : sujet / pièces jointes / lu ────────
try {
  await db
    .prepare(
      `ALTER TABLE messages_emploi ADD COLUMN IF NOT EXISTS subject TEXT DEFAULT ''`,
    )
    .run();
} catch {}
try {
  await db
    .prepare(
      `ALTER TABLE messages_emploi ADD COLUMN IF NOT EXISTS attachments TEXT DEFAULT '[]'`,
    )
    .run();
} catch {}
try {
  await db
    .prepare(
      `ALTER TABLE messages_emploi ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE`,
    )
    .run();
} catch {}
try {
  await db
    .prepare(
      `ALTER TABLE messages_emploi ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE`,
    )
    .run();
} catch {}
try {
  await db
    .prepare(
      `ALTER TABLE messages_emploi ADD COLUMN IF NOT EXISTS reply_to_id INTEGER DEFAULT NULL`,
    )
    .run();
} catch {}

// ── Présence en ligne : horodatage du dernier "vu" ───────────────────────
try {
  await db
    .prepare(
      `ALTER TABLE users_emploi ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NULL`,
    )
    .run();
} catch {}

// ── Archivage de conversation (clé générique "direct:<user>" / "group:<id>") ──
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS archived_conversations_emploi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  conversation_key TEXT NOT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, conversation_key)
)`,
  )
  .run();

// ── Blocage d'utilisateurs ────────────────────────────────────────────────
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS blocked_users_emploi (
  id SERIAL PRIMARY KEY,
  blocker_id INTEGER NOT NULL REFERENCES users_emploi(id) ON DELETE CASCADE,
  blocked_username TEXT NOT NULL,
  blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blocker_id, blocked_username)
)`,
  )
  .run();

console.log(
  "💬 Mon AiGENT Emploi — tables messagerie (présence/archivage/blocage) prêtes",
);

/* ── Uploads pièces jointes de messagerie (images + fichiers, disque local) ── */
const CHAT_UPLOAD_ROOT = path.join(UPLOAD_ROOT, "chat");
fs.mkdirSync(CHAT_UPLOAD_ROOT, { recursive: true });

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CHAT_UPLOAD_ROOT),
    filename: (req, file, cb) => cb(null, safeName(file.originalname)),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

router.post(
  "/emploi/api/upload-chat-images",
  authenticateEmploiToken,
  chatUpload.array("images", 6),
  async (req, res) => {
    try {
      if (!req.files?.length) return sendError(res, 400, "Aucune image reçue");
      const images = req.files.map((f) => `/uploads/emploi/chat/${f.filename}`);
      res.json({ success: true, images });
    } catch (err) {
      console.error("[EMPLOI UPLOAD CHAT IMAGES]", err);
      sendError(res, 500, "Upload échoué");
    }
  },
);

router.post(
  "/emploi/api/upload-chat-files",
  authenticateEmploiToken,
  chatUpload.array("files", 10),
  async (req, res) => {
    try {
      if (!req.files?.length) return sendError(res, 400, "Aucun fichier reçu");
      const files = req.files.map((f) => ({
        url: `/uploads/emploi/chat/${f.filename}`,
        name: f.originalname,
        size: f.size,
      }));
      res.json({ success: true, files });
    } catch (err) {
      console.error("[EMPLOI UPLOAD CHAT FILES]", err);
      sendError(res, 500, "Upload échoué");
    }
  },
);

/* ── Présence : ping (heartbeat) + lecture groupée ───────────────────────
   Pas de websocket dans cette stack : la présence est approximée par un
   "dernier vu" mis à jour par ping régulier depuis le front (toutes les
   ~20s tant que l'onglet Messagerie est ouvert), et considérée "en ligne"
   si le dernier ping date de moins de PRESENCE_WINDOW_MS.                */
const PRESENCE_WINDOW_MS = 45 * 1000;

router.post(
  "/emploi/api/presence/ping",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      await db
        .prepare(
          `UPDATE users_emploi SET last_seen = CURRENT_TIMESTAMP WHERE username=$1`,
        )
        .run(req.user.username);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.get(
  "/emploi/api/presence",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const usernames = String(req.query.usernames || "")
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
      if (!usernames.length) return res.json({});
      const rows = await db
        .prepare(
          `SELECT username, last_seen FROM users_emploi WHERE username = ANY($1::text[])`,
        )
        .all(usernames);
      const now = Date.now();
      const out = {};
      for (const r of rows) {
        const ts = r.last_seen ? new Date(r.last_seen).getTime() : 0;
        out[r.username] = {
          online: now - ts < PRESENCE_WINDOW_MS,
          lastSeen: r.last_seen,
        };
      }
      res.json(out);
    } catch (err) {
      console.error("[EMPLOI presence]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Vérification pseudo + email (nouveau message / ajout à un groupe) ── */
router.post(
  "/emploi/api/users/verify",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const { pseudo, email } = req.body || {};
      if (!pseudo) return sendError(res, 400, "Pseudo requis");
      const pNorm = String(pseudo).trim().toLowerCase();
      let user;
      if (email && String(email).trim()) {
        user = await db
          .prepare(
            `SELECT username, contact, avatar FROM users_emploi
           WHERE LOWER(TRIM(username))=$1 AND LOWER(TRIM(contact))=$2`,
          )
          .get(pNorm, String(email).trim().toLowerCase());
      } else {
        user = await db
          .prepare(
            `SELECT username, contact, avatar FROM users_emploi WHERE LOWER(TRIM(username))=$1`,
          )
          .get(pNorm);
      }
      if (!user)
        return res
          .status(404)
          .json({ exists: false, error: "Utilisateur introuvable" });
      if (user.username.toLowerCase() === req.user.username.toLowerCase()) {
        return res.status(400).json({
          exists: false,
          error: "Impossible de vous ajouter vous-même",
        });
      }
      res.json({
        exists: true,
        username: user.username,
        contact: user.contact,
        avatar: user.avatar,
      });
    } catch (err) {
      console.error("[EMPLOI users/verify]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Envoi d'un message direct ────────────────────────────────────────── */
router.post(
  "/emploi/api/messages",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const schema = z.object({
        toUsername: z.string().min(1).optional(),
        pseudo: z.string().min(1).optional(),
        email: z
          .union([z.string().email(), z.literal(""), z.null()])
          .optional(),
        subject: z.string().default(""),
        body: z.string().min(1),
        replyToId: z.number().nullable().optional(),
        attachments: z
          .array(
            z.object({
              type: z.string(),
              url: z.string(),
              name: z.string().optional(),
              size: z.number().optional(),
            }),
          )
          .optional()
          .default([]),
      });
      const {
        toUsername,
        pseudo,
        email,
        subject,
        body,
        replyToId,
        attachments,
      } = schema.parse(req.body);

      const sender = req.user.username;
      let receiverUsername = toUsername;

      if (!receiverUsername) {
        if (!pseudo)
          return sendError(res, 400, "Pseudo requis pour un nouveau message");
        const pNorm = pseudo.trim().toLowerCase();
        let row;
        if (email && email.trim()) {
          row = await db
            .prepare(
              `SELECT username FROM users_emploi WHERE LOWER(TRIM(username))=$1 AND LOWER(TRIM(contact))=$2`,
            )
            .get(pNorm, email.trim().toLowerCase());
        } else {
          row = await db
            .prepare(
              `SELECT username FROM users_emploi WHERE LOWER(TRIM(username))=$1`,
            )
            .get(pNorm);
        }
        if (!row) return sendError(res, 404, "Destinataire introuvable");
        receiverUsername = row.username;
      }

      if (receiverUsername.toLowerCase() === sender.toLowerCase())
        return sendError(
          res,
          400,
          "Impossible de s'envoyer un message à soi-même",
        );

      const receiver = await db
        .prepare(
          `SELECT id, username FROM users_emploi WHERE LOWER(TRIM(username))=$1`,
        )
        .get(receiverUsername.trim().toLowerCase());
      if (!receiver) return sendError(res, 404, "Destinataire introuvable");

      const blocked = await db
        .prepare(
          `SELECT id FROM blocked_users_emploi WHERE blocker_id=$1 AND blocked_username=$2`,
        )
        .get(receiver.id, sender.trim().toLowerCase());
      // 409 (Conflict) et non 403 : le 403 est réservé par authenticateEmploiToken
      // à l'expiration de session — les confondre provoquait une déconnexion
      // intempestive du front dès qu'un envoi touchait un utilisateur bloquant.
      if (blocked)
        return res.status(409).json({
          success: false,
          error: "Envoi impossible : ce destinataire vous a bloqué.",
          reason: "blocked",
        });

      const insert = await db
        .prepare(
          `INSERT INTO messages_emploi (from_username, to_username, content, subject, attachments, reply_to_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
        )
        .get(
          sender,
          receiver.username,
          body,
          subject || "",
          JSON.stringify(attachments || []),
          replyToId || null,
        );

      if (!(subject || "").startsWith("[Groupe:")) {
        await pushNotificationEmploi(
          receiver.id,
          "message",
          "Nouveau message reçu",
          `${sender} vous a écrit${subject ? ` : "${subject}"` : ""}.`,
          { type: "message", link: "messagerie", username: sender },
        );
      }

      res.json({
        success: true,
        messageId: insert?.id,
        createdAt: insert?.created_at,
      });
    } catch (err) {
      if (err?.errors) return sendError(res, 400, "Données invalides");
      console.error("[EMPLOI messages POST]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Historique complet des messages de l'utilisateur connecté ─────────── */
router.get(
  "/emploi/api/messages",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const username = req.user.username;
      const rows = await db
        .prepare(
          `
        SELECT
          m.id, m.from_username AS sender, m.to_username AS receiver,
          COALESCE(NULLIF(su.avatar,''), '/images/avatar-default.jpg') AS "senderAvatar",
          COALESCE(NULLIF(ru.avatar,''), '/images/avatar-default.jpg') AS "receiverAvatar",
          su.contact AS "senderEmail", ru.contact AS "receiverEmail",
          m.subject, m.content AS body,
          COALESCE(m.attachments, '[]') AS attachments,
          m.read, COALESCE(m.edited,false) AS edited, m.reply_to_id AS "replyToId",
          m.created_at AS timestamp
        FROM messages_emploi m
        JOIN users_emploi su ON LOWER(su.username) = LOWER(m.from_username)
        JOIN users_emploi ru ON LOWER(ru.username) = LOWER(m.to_username)
        WHERE LOWER(m.from_username) = LOWER($1) OR LOWER(m.to_username) = LOWER($1)
        ORDER BY m.created_at ASC, m.id ASC
        `,
        )
        .all(username);

      const out = rows.map((m) => ({
        ...m,
        attachments: (() => {
          if (!m.attachments) return [];
          if (Array.isArray(m.attachments)) return m.attachments;
          try {
            const p = JSON.parse(m.attachments);
            return Array.isArray(p) ? p : [];
          } catch {
            return [];
          }
        })(),
      }));
      res.json(out);
    } catch (err) {
      console.error("[EMPLOI messages GET]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Marquer comme lu (conversation directe OU groupe) ──────────────────── */
router.post(
  "/emploi/api/messages/mark-read",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const me = req.user.username;
      const { otherUsername, groupId } = req.body || {};
      if (otherUsername) {
        await db
          .prepare(
            `UPDATE messages_emploi SET read=true
           WHERE LOWER(to_username)=LOWER($1) AND LOWER(from_username)=LOWER($2)`,
          )
          .run(me, otherUsername);
      } else if (groupId) {
        await db
          .prepare(
            `UPDATE messages_emploi SET read=true
           WHERE LOWER(to_username)=LOWER($1) AND subject LIKE $2`,
          )
          .run(me, `%|ID:${groupId}|%`);
      }
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Modification d'un message (auteur uniquement) ──────────────────────── */
router.patch(
  "/emploi/api/messages/:id",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const me = req.user.username;
      const msgId = Number(req.params.id);
      const { body } = req.body || {};
      if (!msgId || !body || !String(body).trim())
        return sendError(res, 400, "Contenu requis");
      const updated = await db
        .prepare(
          `UPDATE messages_emploi SET content=$1, edited=true
         WHERE id=$2 AND LOWER(from_username)=LOWER($3) RETURNING id`,
        )
        .get(body, msgId, me);
      if (!updated)
        return sendError(res, 404, "Message introuvable ou non modifiable");
      res.json({ success: true });
    } catch (err) {
      console.error("[EMPLOI messages PATCH]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Suppression d'un message (sa propre copie) ─────────────────────────── */
router.delete(
  "/emploi/api/messages/:id",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const me = req.user.username;
      const msgId = Number(req.params.id);
      if (!msgId) return sendError(res, 400, "ID invalide");
      await db
        .prepare(
          `DELETE FROM messages_emploi WHERE id=$1 AND (LOWER(from_username)=LOWER($2) OR LOWER(to_username)=LOWER($2))`,
        )
        .run(msgId, me);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Suppression d'une conversation entière (directe ou groupe) ────────── */
router.post(
  "/emploi/api/conversations/delete",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const me = req.user.username;
      const { type, key } = req.body || {};
      if (type === "direct" && key) {
        await db
          .prepare(
            `DELETE FROM messages_emploi
           WHERE (LOWER(from_username)=LOWER($1) AND LOWER(to_username)=LOWER($2))
              OR (LOWER(from_username)=LOWER($2) AND LOWER(to_username)=LOWER($1))`,
          )
          .run(me, key);
      } else if (type === "group" && key) {
        await db
          .prepare(
            `DELETE FROM messages_emploi
           WHERE subject LIKE $1 AND (LOWER(from_username)=LOWER($2) OR LOWER(to_username)=LOWER($2))`,
          )
          .run(`%|ID:${key}|%`, me);
      } else {
        return sendError(res, 400, "type et key requis");
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[EMPLOI conversations delete]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Envoi groupé (résolution des destinataires côté serveur) ───────────── */
router.post(
  "/emploi/api/messages/group",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const schema = z.object({
        groupId: z.string().min(1),
        groupName: z.string().min(1),
        participants: z
          .array(
            z.object({
              pseudo: z.string().min(1),
              email: z.string().optional().default(""),
            }),
          )
          .min(1),
        body: z.string().min(1),
        objet: z.string().optional().default(""),
        replyToId: z.number().nullable().optional(),
        attachments: z
          .array(
            z.object({
              type: z.string(),
              url: z.string(),
              name: z.string().optional(),
              size: z.number().optional(),
            }),
          )
          .optional()
          .default([]),
      });
      const {
        groupId,
        groupName,
        participants,
        body,
        objet,
        replyToId,
        attachments,
      } = schema.parse(req.body);

      const sender = req.user.username;
      const senderNorm = sender.trim().toLowerCase();

      const resolved = [];
      const failed = [];
      for (const p of participants) {
        const pNorm = p.pseudo.trim().toLowerCase();
        if (pNorm === senderNorm) continue;
        let row;
        if (p.email && p.email.trim()) {
          row = await db
            .prepare(
              `SELECT username, contact FROM users_emploi WHERE LOWER(TRIM(username))=$1 AND LOWER(TRIM(contact))=$2`,
            )
            .get(pNorm, p.email.trim().toLowerCase());
        } else {
          row = await db
            .prepare(
              `SELECT username, contact FROM users_emploi WHERE LOWER(TRIM(username))=$1`,
            )
            .get(pNorm);
        }
        if (row) resolved.push(row);
        else failed.push(p.pseudo);
      }

      if (!resolved.length)
        return res.status(404).json({
          success: false,
          error: "Aucun destinataire valide trouvé",
          failed,
        });

      const membersEncoded = [
        { pseudo: sender },
        ...resolved.map((r) => ({ pseudo: r.username, email: r.contact })),
      ];
      const subject =
        `[Groupe:${groupName}|ID:${groupId}` +
        `|MEMBERS:${membersEncoded.map((m) => `${m.pseudo}:${m.email || ""}`).join(",")}]` +
        (objet ? ` ${objet}` : "");

      let sentCount = 0;
      for (const r of resolved) {
        const blocked = await db
          .prepare(
            `SELECT id FROM blocked_users_emploi WHERE blocker_id=$1 AND blocked_username=$2`,
          )
          .get(
            (
              await db
                .prepare(`SELECT id FROM users_emploi WHERE username=$1`)
                .get(r.username)
            )?.id,
            senderNorm,
          );
        if (blocked) continue;
        await db
          .prepare(
            `INSERT INTO messages_emploi (from_username, to_username, content, subject, attachments, reply_to_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          )
          .run(
            sender,
            r.username,
            body,
            subject,
            JSON.stringify(attachments || []),
            replyToId || null,
          );
        sentCount++;
        const receiverRow = await db
          .prepare(`SELECT id FROM users_emploi WHERE username=$1`)
          .get(r.username);
        if (receiverRow) {
          await pushNotificationEmploi(
            receiverRow.id,
            "message",
            "Message de groupe",
            `${sender} a écrit dans « ${groupName} ».`,
            { type: "message", link: "messagerie" },
          );
        }
      }

      res.json({
        success: true,
        sentCount,
        totalRequested: participants.length,
        failed,
        subject,
      });
    } catch (err) {
      if (err?.errors) return sendError(res, 400, "Données invalides");
      console.error("[EMPLOI messages/group POST]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Archivage ────────────────────────────────────────────────────────── */
router.post(
  "/emploi/api/conversations/archive",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const { conversationKey } = req.body || {};
      if (!conversationKey)
        return sendError(res, 400, "conversationKey requis");
      await db
        .prepare(
          `INSERT INTO archived_conversations_emploi (user_id, conversation_key) VALUES ($1,$2)
         ON CONFLICT (user_id, conversation_key) DO NOTHING`,
        )
        .run(uid, conversationKey);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.delete(
  "/emploi/api/conversations/archive/:key",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const key = decodeURIComponent(req.params.key);
      await db
        .prepare(
          `DELETE FROM archived_conversations_emploi WHERE user_id=$1 AND conversation_key=$2`,
        )
        .run(uid, key);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.get(
  "/emploi/api/conversations/archived",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const rows = await db
        .prepare(
          `SELECT conversation_key FROM archived_conversations_emploi WHERE user_id=$1 ORDER BY archived_at DESC`,
        )
        .all(uid);
      res.json(rows.map((r) => r.conversation_key));
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ── Blocage ──────────────────────────────────────────────────────────── */
router.post(
  "/emploi/api/users/block",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const { targetUsername } = req.body || {};
      if (!targetUsername) return sendError(res, 400, "targetUsername requis");
      await db
        .prepare(
          `INSERT INTO blocked_users_emploi (blocker_id, blocked_username) VALUES ($1,$2)
         ON CONFLICT (blocker_id, blocked_username) DO NOTHING`,
        )
        .run(uid, targetUsername.trim().toLowerCase());
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.delete(
  "/emploi/api/users/block/:username",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      await db
        .prepare(
          `DELETE FROM blocked_users_emploi WHERE blocker_id=$1 AND blocked_username=$2`,
        )
        .run(uid, req.params.username.trim().toLowerCase());
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.get(
  "/emploi/api/users/blocked",
  authenticateEmploiToken,
  async (req, res) => {
    try {
      const uid = await emploiUserId(req.user.username);
      if (!uid) return sendError(res, 404, "Introuvable");
      const rows = await db
        .prepare(
          `SELECT blocked_username FROM blocked_users_emploi WHERE blocker_id=$1`,
        )
        .all(uid);
      res.json(rows.map((r) => r.blocked_username));
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ════════════════════════════════════════════════════════════════════════
   FIN DU BLOC — coller juste avant `export default router;`
   ════════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════════
   MOTEUR D'ALERTES — agenda + nouveaux matchs
   ════════════════════════════════════════════════════════════════════════ */

async function scanAgendaRemindersEmploi() {
  try {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    const targetDate = `${y}-${m}-${d}`;

    const rows = await db
      .prepare(
        `SELECT a.*, u.id AS uid, u.preferences FROM agenda_emploi a
         JOIN users_emploi u ON u.id = a.user_id
         WHERE a.date = $1 AND a.reminded = false`,
      )
      .all(targetDate);

    for (const row of rows) {
      const prefs = safeJson(row.preferences, {});
      if (prefs.alertAgenda === false) continue;
      await pushNotificationEmploi(
        row.uid,
        "agenda",
        "Rappel — rendez-vous demain",
        `${row.name}${row.time ? " à " + row.time.slice(0, 5) : ""} — dans 24h.`,
        { type: "agenda", link: "agenda" },
      );
      await db
        .prepare(`UPDATE agenda_emploi SET reminded = true WHERE id=$1`)
        .run(row.id);
    }
  } catch (e) {
    console.warn("[scanAgendaRemindersEmploi]", e.message);
  }
}

async function scanNewMatchesEmploi() {
  try {
    const profiles = await db
      .prepare(`SELECT * FROM profils_emploi WHERE published = true`)
      .all();
    for (const p of profiles) {
      const userRow = await db
        .prepare(`SELECT id, preferences FROM users_emploi WHERE username=$1`)
        .get(p.username);
      if (!userRow) continue;
      const prefs = safeJson(userRow.preferences, {});
      if (prefs.alertMatch === false) continue;

      const sc = safeJson(p.published_criteria, {});
      const pool = await getOppositePool(p.role, p.username);
      let matches = [];
      try {
        matches = getMatchesForProfile(sc, p.role, pool, prefs);
      } catch {
        continue;
      }
      for (const m of matches) {
        if (!m?.username) continue;
        const known = await db
          .prepare(
            `SELECT 1 FROM known_matches_emploi WHERE user_id=$1 AND match_username=$2`,
          )
          .get(userRow.id, m.username);
        if (known) continue;
        await db
          .prepare(
            `INSERT INTO known_matches_emploi (user_id, match_username) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
          )
          .run(userRow.id, m.username);
        await pushNotificationEmploi(
          userRow.id,
          "match",
          "Nouveau profil compatible",
          `${m.metier || m.domainePath?.[m.domainePath?.length - 1] || "Profil"} — ${m.zone || "—"} — contactez directement le profil ci-dessous.`,
          { type: "match", username: m.username, link: "annonces" },
        );
      }
    }
  } catch (e) {
    console.warn("[scanNewMatchesEmploi]", e.message);
  }
}

setInterval(
  () => {
    scanAgendaRemindersEmploi();
    scanNewMatchesEmploi();
  },
  10 * 60 * 1000,
);
setTimeout(() => {
  scanAgendaRemindersEmploi();
  scanNewMatchesEmploi();
}, 15000);

console.log(
  "🧠 Mon AiGENT Emploi — routes chat / critères / matching / profil prêtes (même port que server.js)",
);

// ================== EXPORT DU ROUTER (monté dans server.js) ==================
export default router;
