//================ MON AIGENT VOYAGE — ROUTER COMPLET (v1) ====================//
// Point de liaison unique entre :
//   FRONT (chat-voyage.html / chat-voyage.js)
//     ↕
//   SERVER (ce fichier) — auth, profils, historique, messagerie
//     ↕
//   DATABASE (db.js — même instance que Emploi / Occas / Immobilier)
//     ↕
//   MOTEUR DÉTERMINISTE (./services/matchingEngineVoyage.js) — scores,
//     classement, exclusions, urgence, pricing. RIEN n'est deviné ici.
//     ↕
//   IA (./services/aiParseeVoyage.js) — extraction langage naturel,
//     formulation, idées de voyage, explication du pricing, chat résultats.
//     L'IA ne calcule JAMAIS un score ou un prix : elle les reçoit du moteur
//     et les commente/explique.
//
// Flux type (voyageur) :
//   message libre → extractCriteria (IA) → critères fusionnés → sauvegarde
//   → pool d'offres publiées (DB) → getMatchesForDemand (moteur) → matches
//   → generateConfirmation / aiResultsChat (IA, commente les VRAIS résultats)
//   → réponse structurée → front (panel Travel Intelligence mis à jour)
//
// Flux type (prestataire) :
//   message libre → extractCriteria → critères → computePricingForOffer
//   (moteur) → explainPricing (IA explique le prix déjà calculé) → pool de
//   demandes voyageurs publiées → getMatchesForOffer (moteur) → matches
//
// ⚠️ Ce fichier N'EST PAS une app Express autonome : c'est un
// express.Router() exporté par défaut, monté dans server.js via
// `app.use(voyageRoutes)`, exactement comme server-emploi.js.
//===============================================================//

import express from "express";
import { db } from "./db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import {
  getMatchesForDemand,
  getMatchesForOffer,
  computePricingForOffer,
  computeUrgency,
} from "./services/matchingEngineVoyage.js";

import {
  extractCriteria,
  generateConfirmation,
  explainPricing,
  detectResultsIntent,
  aiResultsChat,
  generateReservationMessage,
  aiExploreIntro,
  aiExplorePick,
  CATEGORIES_EXPERIENCE,
} from "./services/aiParseeVoyage.js";
dotenv.config();

const VOYAGE_JWT_SECRET =
  process.env.VOYAGE_JWT_SECRET || process.env.JWT_SECRET;
if (!VOYAGE_JWT_SECRET)
  throw new Error("VOYAGE_JWT_SECRET (ou JWT_SECRET) manquant dans .env");
const VOYAGE_2FA_PENDING_SECRET = VOYAGE_JWT_SECRET + "::2fa-pending";

const ROLES = ["voyageur", "prestataire"];

const router = express.Router();

// ================== RATE LIMIT ==================
const authLimiter = rateLimit({ windowMs: 60_000, max: 30 });
router.use("/api/voyage/register", authLimiter);
router.use("/api/voyage/login", authLimiter);
router.use("/api/voyage/login/verify-2fa", authLimiter);
const chatLimiter = rateLimit({ windowMs: 60_000, max: 60 });
router.use("/api/voyage/chat", chatLimiter);

/* ════════════════════════════════════════════════════════════════════════
   DB — TABLES (auth + profils de travail/publiés + historique + messages)
   ════════════════════════════════════════════════════════════════════════ */

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS users_voyage (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  contact TEXT NOT NULL,
  ville TEXT DEFAULT '',
  avatar TEXT DEFAULT '/images/avatar-default.jpg',
  preferences TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS user_2fa_voyage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users_voyage(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  backup_codes TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS notifications_voyage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_voyage(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  data TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

// profils_voyage : état de TRAVAIL (criteria, en cours d'accumulation par le
// chat) + dernière publication (published_criteria), qui est ce que lit le
// pool de matching de l'autre côté du marché.
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS profils_voyage (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL REFERENCES users_voyage(username) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('voyageur','prestataire')),
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  phase TEXT NOT NULL DEFAULT 'gathering',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

// Historique des publications (onglet futur "Mes annonces" / "Mes demandes").
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS annonces_voyage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_voyage(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

// Mise en relation (réservation) — messages échangés entre voyageur et
// prestataire, avec un instantané figé de l'offre au moment du contact.
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS messages_voyage (
  id SERIAL PRIMARY KEY,
  from_username TEXT NOT NULL,
  to_username TEXT NOT NULL,
  content TEXT NOT NULL,
  offer_snapshot JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

console.log("✈️  Mon AiGENT Voyage — tables prêtes (même port que server.js)");

/* ════════════════════════════════════════════════════════════════════════
   HELPERS AUTH
   ════════════════════════════════════════════════════════════════════════ */

function sendError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    contact: row.contact,
    ville: row.ville || "",
    avatar: row.avatar || "/images/avatar-default.jpg",
  };
}

const generateVoyageToken = (user) =>
  jwt.sign(
    { uid: user.id, username: user.username, role: user.role },
    VOYAGE_JWT_SECRET,
    { expiresIn: "6h" },
  );

const authenticateVoyageToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ success: false, error: "Non authentifié" });
  jwt.verify(token, VOYAGE_JWT_SECRET, (err, payload) => {
    if (err)
      return res
        .status(403)
        .json({ success: false, error: "Session invalide ou expirée" });
    req.user = payload;
    next();
  });
};

/** Remet à zéro l'état de TRAVAIL du chat à chaque connexion, sans jamais
 *  toucher à la dernière annonce/demande publiée. */
async function resetWorkingProfile(username) {
  try {
    await db
      .prepare(
        `UPDATE profils_voyage
         SET criteria = '{}'::jsonb, phase = 'gathering', updated_at = CURRENT_TIMESTAMP
         WHERE username = $1`,
      )
      .run(username);
  } catch (e) {
    console.error("[VOYAGE RESET WORKING PROFILE]", e.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   ROUTES AUTH
   ════════════════════════════════════════════════════════════════════════ */

router.post("/api/voyage/register", async (req, res) => {
  try {
    const schema = z.object({
      username: z
        .string()
        .trim()
        .min(3)
        .max(30)
        .regex(/^[a-zA-Z0-9_.\-]+$/),
      email: z.string().trim().email(),
      password: z.string().min(6),
      confirmPassword: z.string().optional(),
      role: z.enum(ROLES),
    });
    const { username, email, password, role } = schema.parse(req.body);

    const existingUsername = await db
      .prepare(`SELECT 1 FROM users_voyage WHERE LOWER(username) = LOWER($1)`)
      .get(username);
    if (existingUsername)
      return sendError(res, 409, "Ce pseudo est déjà utilisé");

    const existingEmail = await db
      .prepare(`SELECT 1 FROM users_voyage WHERE LOWER(contact) = LOWER($1)`)
      .get(email);
    if (existingEmail)
      return sendError(res, 409, "Cette adresse email est déjà utilisée");

    const hash = await bcrypt.hash(password, 10);
    const inserted = await db
      .prepare(
        `INSERT INTO users_voyage (username, password, role, contact)
         VALUES ($1,$2,$3,$4) RETURNING id, username, role, contact, ville, avatar`,
      )
      .get(username, hash, role, email);

    await getOrCreateProfile(inserted.username, inserted.role);

    const token = generateVoyageToken(inserted);
    res.json({ success: true, token, user: publicUser(inserted) });
  } catch (err) {
    if (err?.errors) return sendError(res, 400, "Données invalides");
    console.error("[VOYAGE REGISTER]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.post("/api/voyage/login", async (req, res) => {
  try {
    const schema = z.object({
      username: z.string().trim().min(1),
      password: z.string().min(1),
    });
    const { username, password } = schema.parse(req.body);

    const user = await db
      .prepare(`SELECT * FROM users_voyage WHERE LOWER(username) = LOWER($1)`)
      .get(username);
    if (!user || !(await bcrypt.compare(password, user.password)))
      return sendError(res, 401, "Pseudo ou mot de passe incorrect");

    const tfa = await db
      .prepare(`SELECT enabled FROM user_2fa_voyage WHERE user_id = $1`)
      .get(user.id);

    if (tfa?.enabled) {
      const pendingToken = jwt.sign(
        { uid: user.id, username: user.username, purpose: "2fa_pending" },
        VOYAGE_2FA_PENDING_SECRET,
        { expiresIn: "5m" },
      );
      return res.json({ success: true, need2fa: true, pendingToken });
    }

    await getOrCreateProfile(user.username, user.role);
    await resetWorkingProfile(user.username);

    const token = generateVoyageToken(user);
    res.json({ success: true, token, user: publicUser(user) });
  } catch (err) {
    if (err?.errors) return sendError(res, 400, "Données invalides");
    console.error("[VOYAGE LOGIN]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.post("/api/voyage/login/verify-2fa", async (req, res) => {
  try {
    const { pendingToken, code } = req.body || {};
    if (!pendingToken || !code) return sendError(res, 400, "Code requis");

    let decoded;
    try {
      decoded = jwt.verify(pendingToken, VOYAGE_2FA_PENDING_SECRET);
    } catch {
      return sendError(res, 401, "Session de connexion expirée, recommencez.");
    }
    if (decoded.purpose !== "2fa_pending")
      return sendError(res, 401, "Jeton invalide");

    const tfa = await db
      .prepare(
        `SELECT backup_codes FROM user_2fa_voyage WHERE user_id = $1 AND enabled = true`,
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
      .prepare(`SELECT * FROM users_voyage WHERE id = $1`)
      .get(decoded.uid);
    if (!user) return sendError(res, 404, "Introuvable");

    await getOrCreateProfile(user.username, user.role);
    await resetWorkingProfile(user.username);

    const token = generateVoyageToken(user);
    res.json({ success: true, token, user: publicUser(user) });
  } catch (err) {
    console.error("[VOYAGE 2FA VERIFY]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.post("/api/voyage/logout", authenticateVoyageToken, async (req, res) => {
  await resetWorkingProfile(req.user.username);
  res.json({ success: true });
});

router.get("/api/voyage/me", authenticateVoyageToken, async (req, res) => {
  try {
    const user = await db
      .prepare(
        `SELECT id, username, role, contact, ville, avatar FROM users_voyage WHERE id = $1`,
      )
      .get(req.user.uid);
    if (!user) return sendError(res, 404, "Introuvable");
    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error("[VOYAGE ME]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.patch("/api/voyage/me", authenticateVoyageToken, async (req, res) => {
  try {
    const schema = z.object({
      contact: z.string().trim().email().optional(),
      ville: z.string().trim().max(120).optional(),
    });
    const updates = schema.parse(req.body);
    if (!Object.keys(updates).length)
      return sendError(res, 400, "Aucun champ valide");

    const set = Object.keys(updates)
      .map((k, i) => `${k}=$${i + 1}`)
      .join(", ");
    const vals = [...Object.values(updates), req.user.uid];
    await db
      .prepare(`UPDATE users_voyage SET ${set} WHERE id=$${vals.length}`)
      .run(...vals);
    res.json({ success: true, updated: updates });
  } catch (err) {
    if (err?.errors) return sendError(res, 400, "Données invalides");
    sendError(res, 500, "Erreur serveur");
  }
});

router.post(
  "/api/voyage/change-avatar",
  authenticateVoyageToken,
  async (req, res) => {
    try {
      const { avatar } = req.body || {};
      if (!avatar) return sendError(res, 400, "Avatar manquant");
      await db
        .prepare(`UPDATE users_voyage SET avatar=$1 WHERE id=$2`)
        .run(avatar, req.user.uid);
      res.json({ success: true, avatar });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.post(
  "/api/voyage/change-password",
  authenticateVoyageToken,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword || newPassword.length < 6)
        return sendError(
          res,
          400,
          "Mot de passe actuel requis, nouveau de 6 caractères min.",
        );
      const user = await db
        .prepare(`SELECT id, password FROM users_voyage WHERE id=$1`)
        .get(req.user.uid);
      if (!user) return sendError(res, 404, "Introuvable");

      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) return sendError(res, 401, "Mot de passe actuel incorrect");

      const hash = await bcrypt.hash(newPassword, 10);
      await db
        .prepare(`UPDATE users_voyage SET password=$1 WHERE id=$2`)
        .run(hash, user.id);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

// ================== 2FA ==================
router.get(
  "/api/voyage/2fa/status",
  authenticateVoyageToken,
  async (req, res) => {
    const tfa = await db
      .prepare(`SELECT enabled FROM user_2fa_voyage WHERE user_id=$1`)
      .get(req.user.uid);
    res.json({ success: true, enabled: tfa?.enabled || false });
  },
);

router.post(
  "/api/voyage/2fa/enable",
  authenticateVoyageToken,
  async (req, res) => {
    try {
      const { secret, code } = req.body || {};
      if (!secret || !/^\d{6}$/.test(code || ""))
        return sendError(res, 400, "Code invalide");

      const backupCodes = Array.from(
        { length: 3 },
        () =>
          `${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Math.random()
            .toString(36)
            .slice(2, 7)
            .toUpperCase()}`,
      );
      const existing = await db
        .prepare(`SELECT id FROM user_2fa_voyage WHERE user_id=$1`)
        .get(req.user.uid);
      if (existing) {
        await db
          .prepare(
            `UPDATE user_2fa_voyage SET secret=$1, enabled=true, backup_codes=$2 WHERE user_id=$3`,
          )
          .run(secret, JSON.stringify(backupCodes), req.user.uid);
      } else {
        await db
          .prepare(
            `INSERT INTO user_2fa_voyage (user_id, secret, enabled, backup_codes) VALUES ($1,$2,true,$3)`,
          )
          .run(req.user.uid, secret, JSON.stringify(backupCodes));
      }
      res.json({ success: true, backupCodes });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.post(
  "/api/voyage/2fa/disable",
  authenticateVoyageToken,
  async (req, res) => {
    await db
      .prepare(`UPDATE user_2fa_voyage SET enabled=false WHERE user_id=$1`)
      .run(req.user.uid);
    res.json({ success: true });
  },
);

router.delete(
  "/api/voyage/delete-account",
  authenticateVoyageToken,
  async (req, res) => {
    try {
      await db
        .prepare(`DELETE FROM users_voyage WHERE id=$1`)
        .run(req.user.uid);
      res.json({ success: true });
    } catch (err) {
      sendError(res, 500, "Erreur serveur");
    }
  },
);

/* ════════════════════════════════════════════════════════════════════════
   PROFIL — état de travail (chat) + publication
   ════════════════════════════════════════════════════════════════════════ */

async function getOrCreateProfile(username, role) {
  let profile = await db
    .prepare(`SELECT * FROM profils_voyage WHERE username = $1`)
    .get(username);
  if (!profile) {
    profile = await db
      .prepare(
        `INSERT INTO profils_voyage (username, role, criteria, published_criteria, phase, published)
         VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,'gathering',FALSE)
         RETURNING *`,
      )
      .get(username, role);
  }
  return profile;
}

async function saveProfile(
  username,
  { criteria, phase, published, publishedCriteria },
) {
  const sets = [];
  const values = [];
  let i = 1;
  if (criteria !== undefined) {
    sets.push(`criteria = $${i++}::jsonb`);
    values.push(JSON.stringify(criteria));
  }
  if (publishedCriteria !== undefined) {
    sets.push(`published_criteria = $${i++}::jsonb`);
    values.push(JSON.stringify(publishedCriteria));
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
      `UPDATE profils_voyage SET ${sets.join(", ")} WHERE username = $${i} RETURNING *`,
    )
    .get(...values);
}

function safeJson(v, fallback = {}) {
  try {
    if (v == null) return fallback;
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return fallback;
  }
}

/** Pool d'offres publiées par les prestataires — lu par getMatchesForDemand. */
async function getOffersPool(excludeUsername) {
  const rows = await db
    .prepare(
      `SELECT username, published_criteria FROM profils_voyage
       WHERE role='prestataire' AND published=TRUE AND active=TRUE AND username != $1`,
    )
    .all(excludeUsername);
  return (rows || []).map((r) => ({
    username: r.username,
    criteria: safeJson(r.published_criteria),
  }));
}

/** Pool de demandes publiées par les voyageurs — lu par getMatchesForOffer. */
async function getDemandesPool(excludeUsername) {
  const rows = await db
    .prepare(
      `SELECT username, published_criteria FROM profils_voyage
       WHERE role='voyageur' AND published=TRUE AND active=TRUE AND username != $1`,
    )
    .all(excludeUsername);
  return (rows || []).map((r) => ({
    username: r.username,
    criteria: safeJson(r.published_criteria),
  }));
}

/** Empêche categorie/preferences d'être validés par du texte libre. Toute
 *  mention dans un message libre reste un simple indice (*Hint), affiché
 *  dans le pop-up, jamais une valeur officielle tant que le pop-up
 *  correspondant n'a pas été rempli. */
function reconcileGuardedFields(scBefore, scAfter) {
  const sc = { ...scAfter };

  if (!scBefore.categorieConfirmed) {
    if (sc.categorie) sc.categorieHint = sc.categorie;
    delete sc.categorie;
    sc.categorieConfirmed = false;
  }
  if (!scBefore.preferencesConfirmed) {
    if (sc.preferences) sc.preferencesHint = sc.preferences;
    delete sc.preferences;
    sc.preferencesConfirmed = false;
  }
  return sc;
}

/** Construit la réponse séquentielle standard : une seule question/pop-up
 *  à la fois, matching en direct sur ce qui est déjà connu, et bascule
 *  automatique vers le récapitulatif de publication une fois la séquence
 *  terminée (nextField === null). C'est l'UNIQUE endroit qui décide si la
 *  collecte est "prête" — l'IA ne se prononce jamais elle-même là-dessus. */
async function buildSequentialPayload(role, sc, username, alreadyPublished) {
  const {
    message: reply,
    missing,
    nextField,
    popup,
  } = await generateConfirmation(role, sc);

  const matches = await computeLiveMatches(role, sc, username);
  let pricing = null;
  if (role === "prestataire" && sc.prixHabituel != null) {
    pricing = computePricingForOffer(sc);
  }

  return {
    phase: alreadyPublished ? "results" : "gathering",
    criteria: sc,
    missing,
    reply,
    matches,
    pricing,
    matchingDone: matches.length > 0,
    triggerCategoriePopup: popup === "categorie",
    triggerPreferencesPopup: popup === "preferences",
    categorieHint: sc.categorieHint || null,
    // Le sous-thème choisi dans le pop-up catégorie sert de suggestion
    // pré-cochée dans le pop-up préférences suivant — jamais une valeur
    // confirmée automatiquement.
    preferencesHint: sc.preferencesHint || sc.categorieSousTheme || null,
    triggerPublishPopup: !alreadyPublished && !nextField,
  };
}

router.get("/api/voyage/profile", authenticateVoyageToken, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.username, req.user.role);
    res.json({
      success: true,
      criteria: profile.criteria || {},
      publishedCriteria: profile.published_criteria || {},
      phase: profile.phase,
      published: profile.published,
      role: profile.role,
    });
  } catch (err) {
    console.error("[VOYAGE PROFILE]", err);
    sendError(res, 500, "Erreur serveur");
  }
});

router.get("/api/voyage/categories", authenticateVoyageToken, (req, res) => {
  res.json({ success: true, categories: CATEGORIES_EXPERIENCE });
});

/* ════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS
   ════════════════════════════════════════════════════════════════════════ */

async function pushNotificationVoyage(userId, type, title, body, data = {}) {
  await db
    .prepare(
      `INSERT INTO notifications_voyage (user_id, type, title, body, data) VALUES ($1,$2,$3,$4,$5)`,
    )
    .run(userId, type, title, body, JSON.stringify(data));
}

router.get(
  "/api/voyage/notifications",
  authenticateVoyageToken,
  async (req, res) => {
    const rows = await db
      .prepare(
        `SELECT * FROM notifications_voyage WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      )
      .all(req.user.uid);
    res.json({ success: true, notifications: rows });
  },
);

router.post(
  "/api/voyage/notifications/read",
  authenticateVoyageToken,
  async (req, res) => {
    const { id } = req.body || {};
    if (id) {
      await db
        .prepare(
          `UPDATE notifications_voyage SET read=true WHERE id=$1 AND user_id=$2`,
        )
        .run(id, req.user.uid);
    } else {
      await db
        .prepare(`UPDATE notifications_voyage SET read=true WHERE user_id=$1`)
        .run(req.user.uid);
    }
    res.json({ success: true });
  },
);

/* ════════════════════════════════════════════════════════════════════════
   ══════════════════   CŒUR DU PRODUIT — /api/voyage/chat   ═══════════════
   Un seul message libre → extraction totale (IA) → sauvegarde → moteur de
   matching en TEMPS RÉEL sur ce qui est déjà connu → réponse structurée.
   Pas de tunnel séquentiel : le panel se met à jour dès qu'un critère de
   plus est compris, même incomplet.
   ════════════════════════════════════════════════════════════════════════ */

/** Calcule les opportunités actuelles à partir des critères connus (même
 *  partiels) — c'est ce qui alimente le Travel Intelligence Panel en direct. */
async function computeLiveMatches(role, sc, username) {
  if (role === "voyageur") {
    const pool = await getOffersPool(username);
    return getMatchesForDemand(sc, pool, { limit: 8 });
  }
  const pool = await getDemandesPool(username);
  return getMatchesForOffer(sc, pool, { limit: 8 });
}

/** Distribution RÉELLE des offres/demandes du marché par catégorie, en
 *  ignorant temporairement le critère catégorie (pas encore connu) mais en
 *  respectant tout le reste (ville, date, budget...). Aucune valeur n'est
 *  inventée : chaque chiffre vient du moteur déterministe. */
async function computeCategoryDistribution(role, sc, username) {
  const scWithoutCategorie = { ...sc };
  delete scWithoutCategorie.categorie;

  const allMatches =
    role === "voyageur"
      ? getMatchesForDemand(scWithoutCategorie, await getOffersPool(username), {
          limit: 200,
        })
      : getMatchesForOffer(
          scWithoutCategorie,
          await getDemandesPool(username),
          { limit: 200 },
        );

  const byCategorie = {};
  for (const m of allMatches) {
    const cat = m.categorie || "autre";
    if (!byCategorie[cat]) byCategorie[cat] = { count: 0, minPrice: null };
    byCategorie[cat].count += 1;
    const price = m.prixRecommande ?? m.prixHabituel ?? m.budgetTotal ?? null;
    if (
      price != null &&
      (byCategorie[cat].minPrice == null || price < byCategorie[cat].minPrice)
    ) {
      byCategorie[cat].minPrice = price;
    }
  }
  return byCategorie;
}

router.post("/api/voyage/chat", authenticateVoyageToken, async (req, res) => {
  try {
    const username = req.user.username;
    const role = req.user.role;
    const body = req.body || {};
    const message = (body.message || "").toString().trim();

    let profile = await getOrCreateProfile(username, role);
    let sc = { ...(profile.criteria || {}) };
    let phase = profile.phase || "gathering";

    /* ---------- Commandes spéciales (issues des pop-ups du front) ---------- */

    if (message === "__PUBLISH_CONFIRMED__") {
      // Garde-fou déterministe : on NE PUBLIE JAMAIS sans confirmation
      // explicite des deux champs gardés, même si le front pense pouvoir
      // sauter l'étape.
      if (!sc.categorieConfirmed || !sc.preferencesConfirmed) {
        return res.json({
          success: true,
          ...(await buildSequentialPayload(role, sc, username, false)),
        });
      }

      const { categorieHint, preferencesHint, ...cleanSc } = sc;
      sc = cleanSc;

      profile = await saveProfile(username, {
        criteria: sc,
        publishedCriteria: sc,
        phase: "results",
        published: true,
      });

      try {
        const userRow = await db
          .prepare(`SELECT id FROM users_voyage WHERE username=$1`)
          .get(username);

        if (userRow) {
          await db
            .prepare(
              `INSERT INTO annonces_voyage (user_id, username, role, criteria) VALUES ($1,$2,$3,$4::jsonb)`,
            )
            .run(userRow.id, username, role, JSON.stringify(sc));
        }
      } catch (e) {
        console.error("[VOYAGE PERSIST ANNONCE]", e.message);
      }

      const matches = await computeLiveMatches(role, sc, username);

      let pricing = null;
      let pricingExplanation = null;
      if (role === "prestataire") {
        pricing = computePricingForOffer(sc);
        if (pricing?.prixRecommande != null) {
          pricingExplanation = await explainPricing(sc, pricing);
        }
      }

      const { message: introText } = await aiResultsChat(
        "Présente le résultat de cette publication.",
        sc,
        { role, matchingOffers: matches },
      );

      return res.json({
        success: true,
        phase: "results",
        criteria: sc,
        matches,
        pricing,
        pricingExplanation,
        ideas,
        reply: null,
        postReply: introText,
        matchingDone: true,
      });
    }

    if (message === "__EDIT_CRITERIA__") {
      profile = await saveProfile(username, { phase: "gathering" });
      return res.json({
        success: true,
        phase: "gathering",
        criteria: sc,
        reply:
          role === "prestataire"
            ? "Très bien, dites-moi ce qui doit changer dans votre offre."
            : "Bien sûr, dites-moi ce qui doit changer dans votre recherche.",
      });
    }

    if (message === "__CRITERIA_UPDATE__" && body.updatedCriteria) {
      const upd = { ...body.updatedCriteria };

      // Seule source de vérité pour ces deux champs : leur pop-up dédié.
      if (Object.prototype.hasOwnProperty.call(upd, "categorie")) {
        sc.categorie = upd.categorie;
        sc.categorieConfirmed = true;
        delete sc.categorieHint;
        delete upd.categorie;
      }
      if (Object.prototype.hasOwnProperty.call(upd, "preferences")) {
        sc.preferences = upd.preferences || "";
        sc.preferencesConfirmed = true;
        delete sc.preferencesHint;
        delete upd.preferences;
      }
      sc = { ...sc, ...upd };

      const alreadyPublished = !!profile.published;
      profile = await saveProfile(username, {
        criteria: sc,
        ...(alreadyPublished ? { publishedCriteria: sc } : {}),
      });

      if (!alreadyPublished) {
        // Toujours en phase de collecte : on reprend la séquence exactement
        // là où elle en était (question suivante, pop-up suivant, ou récap).
        return res.json({
          success: true,
          ...(await buildSequentialPayload(role, sc, username, false)),
        });
      }

      // Modification après publication (via le crayon du panel) : commentaire
      // libre de l'IA sur les nouveaux résultats, pas de tunnel.
      const matches = await computeLiveMatches(role, sc, username);
      const { message: updText } = await aiResultsChat(
        "Les critères viennent d'être modifiés, commente les nouveaux résultats.",
        sc,
        { role, matchingOffers: matches },
      );
      let pricing = null;
      if (role === "prestataire") pricing = computePricingForOffer(sc);
      return res.json({
        success: true,
        phase: "results",
        criteria: sc,
        matches,
        pricing,
        reply: updText,
        matchingDone: true,
        actionType: "criteria_updated",
      });
    }

    if (message.startsWith("__ACTION_EXPLORE__")) {
      const distribution = await computeCategoryDistribution(
        role,
        sc,
        username,
      );
      const { message: guideText } = await aiExploreIntro(
        role,
        sc,
        distribution,
      );
      return res.json({
        success: true,
        phase,
        criteria: sc,
        reply: null,
        postReply: guideText,
        exploreDistribution: distribution,
        actionType: "explore",
      });
    }

    if (message.startsWith("__ACTION_EXPLORE_PICK__:")) {
      const cat = message.split(":")[1];
      const previewSc = { ...sc, categorie: cat };
      const matches = await computeLiveMatches(role, previewSc, username);
      const { message: pickText } = await aiExplorePick(role, sc, cat, matches);
      return res.json({
        success: true,
        phase,
        criteria: sc,
        matches,
        reply: null,
        postReply: pickText,
        actionType: "explore_pick",
        previewCategorie: cat,
      });
    }

    if (message.startsWith("__ACTION_RESERVE__:")) {
      const idx = parseInt(message.split(":")[1], 10);
      const matches = await computeLiveMatches(role, sc, username);
      const target = matches[idx];
      if (!target) {
        return res.json({
          success: true,
          phase,
          reply:
            "Cette opportunité n'est plus disponible, relancez la recherche.",
        });
      }

      const targetUser = await db
        .prepare(`SELECT username, contact FROM users_voyage WHERE username=$1`)
        .get(target.username);

      const contactMsg = await generateReservationMessage(role, sc, target);
      let messageSent = false;
      try {
        await db
          .prepare(
            `INSERT INTO messages_voyage (from_username, to_username, content, offer_snapshot)
             VALUES ($1,$2,$3,$4::jsonb)`,
          )
          .run(username, target.username, contactMsg, JSON.stringify(target));
        messageSent = true;

        const receiver = await db
          .prepare(`SELECT id FROM users_voyage WHERE username=$1`)
          .get(target.username);
        if (receiver) {
          await pushNotificationVoyage(
            receiver.id,
            "reservation",
            "Nouvelle demande de mise en relation",
            `${username} souhaite réserver "${target.activite || target.categorie || "une expérience"}".`,
            { type: "reservation", link: "messagerie", username },
          );
        }
      } catch (e) {
        console.error("[VOYAGE RESERVE INSERT]", e.message);
      }

      const contactInfo = {
        name: targetUser?.username || target.username,
        email: targetUser?.contact || "",
      };

      return res.json({
        success: true,
        phase,
        reply: messageSent
          ? `Demande envoyée à ${contactInfo.name}. Vous pouvez suivre l'échange dans votre messagerie.`
          : "La demande n'a pas pu être envoyée — réessayez.",
        actionType: "reserve_done",
        messageSent,
        contactInfo,
      });
    }

    /* ---------------------- Message libre (cas général) ---------------------- */

    if (message && !message.startsWith("__")) {
      const extracted = await extractCriteria(message, role, sc);
      // categorie/preferences détectés dans le texte libre ne deviennent
      // JAMAIS officiels ici — ils passent en *Hint pour le pop-up suivant.
      sc = reconcileGuardedFields(sc, extracted);
    }

    const alreadyPublished = !!profile.published;
    profile = await saveProfile(username, {
      criteria: sc,
      ...(alreadyPublished ? { publishedCriteria: sc } : {}),
    });

    // Une seule question / un seul pop-up à la fois — jamais de rafale.
    return res.json({
      success: true,
      ...(await buildSequentialPayload(role, sc, username, alreadyPublished)),
    });
  } catch (err) {
    console.error("[VOYAGE CHAT]", err);
    sendError(res, 500, "Erreur serveur — veuillez réessayer");
  }
});

/* ════════════════════════════════════════════════════════════════════════
   MESSAGERIE (mise en relation)
   ════════════════════════════════════════════════════════════════════════ */

router.get(
  "/api/voyage/messages",
  authenticateVoyageToken,
  async (req, res) => {
    try {
      const username = req.user.username;
      const rows = await db
        .prepare(
          `
      SELECT m.id, m.from_username AS sender, m.to_username AS receiver,
             m.content AS body, m.offer_snapshot AS "offerSnapshot",
             m.read, m.created_at AS timestamp
      FROM messages_voyage m
      WHERE LOWER(m.from_username) = LOWER($1) OR LOWER(m.to_username) = LOWER($1)
      ORDER BY m.created_at ASC, m.id ASC
      `,
        )
        .all(username);
      res.json({
        success: true,
        messages: rows.map((m) => ({
          ...m,
          offerSnapshot: safeJson(m.offerSnapshot, {}),
        })),
      });
    } catch (err) {
      console.error("[VOYAGE MESSAGES]", err);
      sendError(res, 500, "Erreur serveur");
    }
  },
);

router.post(
  "/api/voyage/messages/mark-read",
  authenticateVoyageToken,
  async (req, res) => {
    const me = req.user.username;
    const { otherUsername } = req.body || {};
    if (!otherUsername) return sendError(res, 400, "otherUsername requis");
    await db
      .prepare(
        `UPDATE messages_voyage SET read=true
         WHERE LOWER(to_username)=LOWER($1) AND LOWER(from_username)=LOWER($2)`,
      )
      .run(me, otherUsername);
    res.json({ success: true });
  },
);

console.log(
  "🧠 Mon AiGENT Voyage — routes auth / chat / matching / messagerie prêtes (même port que server.js)",
);

// ================== EXPORT DU ROUTER (monté dans server.js) ==================
export default router;
