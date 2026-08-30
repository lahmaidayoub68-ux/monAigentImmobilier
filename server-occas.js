//================ MON AIGENT OCCASION — SERVEUR DÉDIÉ (v4) =====//
// Auth + Tunnel déterministe (extraction IA + flux en code + phrasing IA)
// + Récapitulatif d'annonce + Matching voitures + Alertes réelles
// + MESSAGERIE COMPLÈTE (messages 1-à-1, groupes, pièces jointes,
//   mentions, archivage, blocage, notifications).
//
// v4 ajoute uniquement la messagerie par rapport à la v3 — tout le reste
// (tunnel chat, agenda, coffre, préférences, alertes...) est inchangé.
//=========================================================================

import express from "express";
import { db } from "./db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import nodemailer from "nodemailer";

import {
  addBuyerOccas,
  addSellerOccas,
  matchSellersForBuyer,
  matchBuyersForSeller,
  computeEtatScore,
} from "./services/matchingEngineOccas.js";

import {
  extractCriteria,
  computeNextStep,
  generatePhrasing,
  detectResultsIntent,
  generateContactMessage,
  aiResultsChat,
} from "./services/aiParseeOccas.js";

dotenv.config();

const OCCAS_JWT_SECRET = process.env.OCCAS_JWT_SECRET || process.env.JWT_SECRET;
if (!OCCAS_JWT_SECRET)
  throw new Error("OCCAS_JWT_SECRET (ou JWT_SECRET) manquant dans .env");
// Secret court terme pour l'étape intermédiaire du login 2FA (avant délivrance du vrai token)
const OCCAS_2FA_PENDING_SECRET = OCCAS_JWT_SECRET + "::2fa-pending";

const isProd = process.env.NODE_ENV === "production";
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.OCCAS_PORT || 3100;
const HOST = "0.0.0.0";
const SUPPORT_EMAIL_TO = "supportmonaigentimmobilier@gmail.com";

// ================== MIDDLEWARES ==================
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
      },
    },
  }),
);
app.use(compression());
app.use(morgan("dev"));
app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ================== RATE LIMIT ==================
const authLimiter = rateLimit({ windowMs: 60_000, max: 30 });
app.use("/occas/signup", authLimiter);
app.use("/occas/login", authLimiter);
app.use("/occas/login/verify-2fa", authLimiter);
const apiLimiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use("/occas/chat", apiLimiter);
const msgLimiter = rateLimit({ windowMs: 60_000, max: 180 });
app.use("/occas/api/messages", msgLimiter);

// ================== DB — TABLES OCCASION ==================
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS users_occas (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  contact TEXT NOT NULL,
  avatar TEXT DEFAULT '/images/user-avatar.jpg',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS annonces_occas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  ville TEXT DEFAULT '',
  tolerancekm REAL DEFAULT 60,
  marque TEXT DEFAULT '',
  modele TEXT DEFAULT '',
  annee INTEGER DEFAULT NULL,
  anneemin INTEGER DEFAULT NULL,
  carburant TEXT DEFAULT '',
  boite TEXT DEFAULT '',
  kilometrage INTEGER DEFAULT NULL,
  kilometragemax INTEGER DEFAULT NULL,
  budgetmin REAL DEFAULT NULL,
  budgetmax REAL DEFAULT NULL,
  prix REAL DEFAULT NULL,
  etatzones TEXT DEFAULT '{}',
  imagesbien TEXT DEFAULT '[]',
  carverticalurl TEXT DEFAULT NULL,
  carverticalnote REAL DEFAULT NULL,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS messages_occas (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  attachments TEXT DEFAULT '[]',
  read BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS favorites_occas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  profile_data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

try {
  await db
    .prepare(`ALTER TABLE users_occas ADD COLUMN preferences TEXT DEFAULT '{}'`)
    .run();
} catch {}
try {
  await db
    .prepare(`ALTER TABLE users_occas ADD COLUMN ville TEXT DEFAULT ''`)
    .run();
} catch {}

// ── MIGRATION messagerie : colonnes attachments/read si la table existait déjà ──
try {
  await db
    .prepare(
      `ALTER TABLE messages_occas ADD COLUMN attachments TEXT DEFAULT '[]'`,
    )
    .run();
} catch {}
try {
  await db
    .prepare(`ALTER TABLE messages_occas ADD COLUMN read BOOLEAN DEFAULT FALSE`)
    .run();
} catch {}

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS notifications_occas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS agenda_occas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT DEFAULT '',
  kind TEXT DEFAULT 'autre',
  description TEXT DEFAULT '',
  reminded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS user_2fa_occas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users_occas(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS activity_occas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  seconds INTEGER DEFAULT 0,
  events INTEGER DEFAULT 0,
  UNIQUE (user_id, day)
)`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS support_occas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS vault_occas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  annonce_id INTEGER,
  label TEXT NOT NULL,
  plate TEXT DEFAULT '',
  vin TEXT DEFAULT '',
  url TEXT NOT NULL,
  note REAL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  )
  .run();

try {
  await db
    .prepare(`ALTER TABLE agenda_occas ADD COLUMN color TEXT DEFAULT '#ff6a2b'`)
    .run();
} catch {}
try {
  await db
    .prepare(
      `ALTER TABLE agenda_occas ADD COLUMN reminded BOOLEAN DEFAULT FALSE`,
    )
    .run();
} catch {}

// ── Suivi des prix (pour l'alerte "baisse de prix") ────────────────────
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS price_watch_occas (
  annonce_id INTEGER PRIMARY KEY REFERENCES annonces_occas(id) ON DELETE CASCADE,
  last_price REAL
)`,
  )
  .run();

// ── Derniers matchs connus par utilisateur (pour l'alerte "nouveau match") ─
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS known_matches_occas (
  user_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  match_username TEXT NOT NULL,
  seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, match_username)
)`,
  )
  .run();

// ── MESSAGERIE — conversations archivées ────────────────────────────────
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS archived_conversations_occas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  conversation_key TEXT NOT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, conversation_key)
)`,
  )
  .run();

// ── MESSAGERIE — utilisateurs bloqués ───────────────────────────────────
await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS blocked_users_occas (
  id SERIAL PRIMARY KEY,
  blocker_id INTEGER NOT NULL REFERENCES users_occas(id) ON DELETE CASCADE,
  blocked_username TEXT NOT NULL,
  blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blocker_id, blocked_username)
)`,
  )
  .run();

// ================== CLOUDINARY (images + CarVertical + pièces jointes) ==================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const upload = multer({ storage: multer.memoryStorage() });

function uploadBuffer(buffer, folder, resourceType = "image") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

function safeObjParse(input) {
  try {
    if (!input) return {};
    if (typeof input === "object") return input;
    return JSON.parse(input) || {};
  } catch {
    return {};
  }
}

// ================== MAIL (Gmail — support) ==================
function getMailTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
  });
}

async function sendSupportEmail({
  username,
  contact,
  subject,
  category,
  message,
  ticketId,
}) {
  const transporter = getMailTransporter();
  if (!transporter) {
    console.warn("[SUPPORT] GMAIL_USER/GMAIL_PASS absents — email non envoyé");
    return false;
  }
  const emailContent = `Nouveau message support · Mon AiGENT Occasion

Utilisateur connecté : ${username} (${contact || "contact inconnu"})
Ticket #${ticketId}
Catégorie : ${category}

Sujet : ${subject}

Message :
${message}`;
  try {
    await transporter.sendMail({
      from: `"Support Mon AiGENT Occasion" <${process.env.GMAIL_USER}>`,
      to: SUPPORT_EMAIL_TO,
      subject: `📩 [Occasion #${ticketId}] ${subject}`,
      text: emailContent,
    });
    return true;
  } catch (err) {
    console.error("[SUPPORT] Envoi Gmail échoué:", err.message);
    return false;
  }
}

// ================== AUTH ==================
const generateOccasToken = (user) =>
  jwt.sign(
    { username: user.username, role: user.role, contact: user.contact || "" },
    OCCAS_JWT_SECRET,
    { expiresIn: "6h" },
  );

const authenticateOccasToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, OCCAS_JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ================== SIGNUP / LOGIN (2FA-aware) ==================
app.post("/occas/signup", async (req, res) => {
  try {
    const schema = z.object({
      username: z.string().min(3),
      password: z.string().min(6),
      role: z.enum(["buyer", "seller"]),
      contact: z.string().trim().email(),
    });
    const { username, password, role, contact } = schema.parse(req.body);

    const existing = await db
      .prepare("SELECT 1 FROM users_occas WHERE username = ?")
      .get(username);
    if (existing)
      return res.status(409).json({ error: "Ce pseudo est déjà utilisé" });

    const hash = await bcrypt.hash(password, 10);
    const inserted = await db
      .prepare(
        `INSERT INTO users_occas (username, password, role, contact) VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(username, hash, role, contact);

    const token = generateOccasToken({ username, role, contact });
    res.json({ token, username, role, contact, userId: inserted?.id });
  } catch (err) {
    if (err?.errors)
      return res
        .status(400)
        .json({ error: "Données invalides", details: err.errors });
    console.error("[OCCAS SIGNUP]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * Connexion en 1 ou 2 étapes :
 *  - Identifiants corrects + pas de 2FA → token complet directement.
 *  - Identifiants corrects + 2FA active → renvoie need2fa:true + pendingToken
 *    (courte durée), le front doit rappeler /occas/login/verify-2fa.
 */
app.post("/occas/login", async (req, res) => {
  try {
    const schema = z.object({ username: z.string(), password: z.string() });
    const { username, password } = schema.parse(req.body);

    const user = await db
      .prepare("SELECT * FROM users_occas WHERE username = ?")
      .get(username);
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: "Identifiants incorrects" });

    const tfa = await db
      .prepare(`SELECT enabled FROM user_2fa_occas WHERE user_id = $1`)
      .get(user.id);

    delete sessions[username];

    if (tfa?.enabled) {
      const pendingToken = jwt.sign(
        { uid: user.id, username: user.username, purpose: "2fa_pending" },
        OCCAS_2FA_PENDING_SECRET,
        { expiresIn: "5m" },
      );
      return res.json({ need2fa: true, pendingToken });
    }

    const token = generateOccasToken(user);
    res.json({
      token,
      username: user.username,
      role: user.role,
      contact: user.contact,
    });
  } catch (err) {
    if (err?.errors)
      return res.status(400).json({ error: "Données invalides" });
    console.error("[OCCAS LOGIN]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/** Étape 2 : vérifie un des 3 codes de sécurité et délivre le vrai token. */
app.post("/occas/login/verify-2fa", async (req, res) => {
  try {
    const { pendingToken, code } = req.body || {};
    if (!pendingToken || !code)
      return res.status(400).json({ error: "Code requis" });

    let decoded;
    try {
      decoded = jwt.verify(pendingToken, OCCAS_2FA_PENDING_SECRET);
    } catch {
      return res
        .status(401)
        .json({ error: "Session de connexion expirée, recommencez." });
    }
    if (decoded.purpose !== "2fa_pending")
      return res.status(401).json({ error: "Jeton invalide" });

    const tfa = await db
      .prepare(
        `SELECT backup_codes FROM user_2fa_occas WHERE user_id = $1 AND enabled = true`,
      )
      .get(decoded.uid);
    if (!tfa) return res.status(404).json({ error: "2FA introuvable" });

    let codes = [];
    try {
      codes = JSON.parse(tfa.backup_codes || "[]");
    } catch {}
    const codeNorm = String(code).trim().toUpperCase();
    if (!codes.includes(codeNorm))
      return res.status(401).json({ error: "Code de sécurité incorrect" });

    const user = await db
      .prepare(`SELECT * FROM users_occas WHERE id = $1`)
      .get(decoded.uid);
    if (!user) return res.sendStatus(404);

    const token = generateOccasToken(user);
    res.json({
      token,
      username: user.username,
      role: user.role,
      contact: user.contact,
    });
  } catch (err) {
    console.error("[OCCAS 2FA VERIFY]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/occas/api/me", authenticateOccasToken, async (req, res) => {
  const user = await db
    .prepare(
      "SELECT username, role, contact, avatar FROM users_occas WHERE username = ?",
    )
    .get(req.user.username);
  if (!user) return res.sendStatus(404);
  res.json(user);
});

// ================== UPLOADS (annonces) ==================
app.post(
  "/occas/api/upload-images",
  authenticateOccasToken,
  upload.array("images", 6),
  async (req, res) => {
    try {
      if (!req.files?.length)
        return res.status(400).json({ error: "Aucune image reçue" });
      const images = await Promise.all(
        req.files.map((f) =>
          uploadBuffer(f.buffer, "occas/vehicules", "image"),
        ),
      );
      res.json({ success: true, images });
    } catch (err) {
      console.error("[OCCAS UPLOAD IMAGES]", err);
      res.status(500).json({ error: "Upload échoué" });
    }
  },
);

app.post(
  "/occas/api/upload-carvertical",
  authenticateOccasToken,
  upload.single("report"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "Aucun fichier reçu" });
      const isPdf = req.file.mimetype === "application/pdf";
      const url = await uploadBuffer(
        req.file.buffer,
        "occas/carvertical",
        isPdf ? "raw" : "image",
      );
      const note = req.body.note ? Number(req.body.note) : null;
      res.json({ success: true, url, note });
    } catch (err) {
      console.error("[OCCAS UPLOAD CARVERTICAL]", err);
      res.status(500).json({ error: "Upload échoué" });
    }
  },
);

// ================== UPLOADS (messagerie — images & fichiers) ==================
app.post(
  "/occas/api/upload-chat-images",
  authenticateOccasToken,
  upload.array("images", 6),
  async (req, res) => {
    try {
      if (!req.files?.length)
        return res.status(400).json({ error: "Aucune image reçue" });
      const images = await Promise.all(
        req.files.map((f) => uploadBuffer(f.buffer, "occas/chat", "image")),
      );
      res.json({ success: true, images });
    } catch (err) {
      console.error("[OCCAS UPLOAD CHAT IMAGES]", err);
      res.status(500).json({ error: "Upload échoué" });
    }
  },
);

app.post(
  "/occas/api/upload-chat-files",
  authenticateOccasToken,
  upload.array("files", 10),
  async (req, res) => {
    try {
      if (!req.files?.length)
        return res.status(400).json({ error: "Aucun fichier reçu" });
      const files = await Promise.all(
        req.files.map(async (f) => ({
          url: await uploadBuffer(f.buffer, "occas/chat-files", "raw"),
          name: f.originalname,
          size: f.size,
        })),
      );
      res.json({ success: true, files });
    } catch (err) {
      console.error("[OCCAS UPLOAD CHAT FILES]", err);
      res.status(500).json({ error: "Upload échoué" });
    }
  },
);

// ================== CHAT SESSIONS (mémoire — tunnel IA) ==================
const sessions = {};

function popupFlagKey(popup) {
  return `trigger${popup.charAt(0).toUpperCase()}${popup.slice(1)}Popup`;
}

function buildRecapData(role, sc) {
  if (role === "seller") {
    return {
      role: "seller",
      ville: sc.ville || null,
      marque: sc.marque || null,
      modele: sc.modele || null,
      annee: sc.annee ?? null,
      carburant: sc.carburant || null,
      boite: sc.boite || null,
      kilometrage: sc.kilometrage ?? null,
      prix: sc.budgetMin ?? sc.budgetMax ?? null,
      etatZones: sc.etatZones || {},
      etatScore: computeEtatScore(sc.etatZones),
      imagesbien: Array.isArray(sc.imagesbien) ? sc.imagesbien : [],
      carverticalUrl: sc.carverticalUrl || null,
      carverticalNote: sc.carverticalNote ?? null,
    };
  }
  return {
    role: "buyer",
    ville: sc.ville || null,
    budgetMax: sc.budgetMax ?? sc.budgetMin ?? null,
    kilometrageMax: sc.kilometrageMax ?? null,
    carburant: sc.carburant || null,
    boite: sc.boite || null,
    marque: sc.marque || null,
    modele: sc.modele || null,
    marqueModeleSkipped: !!sc.marqueModeleSkipped,
  };
}

/** Persiste immédiatement la ville du profil dès qu'elle apparaît dans le chat,
 *  sans attendre la fin du tunnel de collecte. */
async function syncProfileVilleFromChat(username, ville) {
  if (!ville) return;
  try {
    const row = await db
      .prepare(`SELECT ville FROM users_occas WHERE username = $1`)
      .get(username);
    if (row && !row.ville) {
      await db
        .prepare(`UPDATE users_occas SET ville = $1 WHERE username = $2`)
        .run(ville, username);
    }
  } catch (e) {
    console.warn("[syncProfileVilleFromChat]", e.message);
  }
}
async function runMatchingAndPersist(username, role, contact, sc) {
  let profile,
    matches = [];

  const user = await db
    .prepare(`SELECT id FROM users_occas WHERE username=$1`)
    .get(username);
  const prefs = user ? await getUserPrefs(user.id) : withPrefDefaults({});

  if (role === "buyer") {
    profile = addBuyerOccas({
      username,
      contact,
      role: "buyer",
      ville: sc.ville || "",
      toleranceKm: sc.toleranceKm ?? 60,
      budgetMax: sc.budgetMax ?? sc.budgetMin ?? 0,
      carburant: sc.carburant || "",
      kilometrageMax: sc.kilometrageMax ?? null,
      anneeMin: sc.anneeMin ?? null,
      marque: sc.marque || "",
      modele: sc.modele || "",
      boite: sc.boite || "",
      updatedAt: Date.now(),
    });
    matches = matchSellersForBuyer(profile, 5, prefs);
  } else {
    profile = addSellerOccas({
      username,
      contact,
      role: "seller",
      ville: sc.ville || "",
      marque: sc.marque || "",
      modele: sc.modele || "",
      annee: sc.annee ?? null,
      carburant: sc.carburant || "",
      boite: sc.boite || "",
      kilometrage: sc.kilometrage ?? null,
      prix: sc.budgetMin ?? sc.budgetMax ?? 0,
      etatZones: sc.etatZones || {},
      imagesbien: Array.isArray(sc.imagesbien) ? sc.imagesbien : [],
      carverticalUrl: sc.carverticalUrl || null,
      carverticalNote: sc.carverticalNote ?? null,
      updatedAt: Date.now(),
    });
    matches = matchBuyersForSeller(profile, 5, prefs);
  }
  try {
    const existingRow = await db
      .prepare(
        `SELECT id FROM annonces_occas WHERE username = $1 AND role = $2`,
      )
      .get(username, role);

    const payload = [
      sc.ville || "",
      sc.toleranceKm ?? 60,
      sc.marque || "",
      sc.modele || "",
      sc.annee ?? null,
      sc.anneeMin ?? null,
      sc.carburant || "",
      sc.boite || "",
      sc.kilometrage ?? null,
      sc.kilometrageMax ?? null,
      sc.budgetMin ?? null,
      sc.budgetMax ?? null,
      sc.budgetMin ?? sc.budgetMax ?? null,
      JSON.stringify(sc.etatZones || {}),
      JSON.stringify(sc.imagesbien || []),
      sc.carverticalUrl || null,
      sc.carverticalNote ?? null,
      true,
    ];

    if (existingRow) {
      await db
        .prepare(
          `
        UPDATE annonces_occas SET
          ville=$1, tolerancekm=$2, marque=$3, modele=$4, annee=$5, anneemin=$6,
          carburant=$7, boite=$8, kilometrage=$9, kilometragemax=$10,
          budgetmin=$11, budgetmax=$12, prix=$13, etatzones=$14, imagesbien=$15,
          carverticalurl=$16, carverticalnote=$17, published=$18, updated_at=NOW()
        WHERE id=$19`,
        )
        .run(...payload, existingRow.id);
    } else {
      const userRow = await db
        .prepare(`SELECT id FROM users_occas WHERE username=$1`)
        .get(username);
      await db
        .prepare(
          `
        INSERT INTO annonces_occas
          (user_id, username, role, ville, tolerancekm, marque, modele, annee, anneemin,
           carburant, boite, kilometrage, kilometragemax, budgetmin, budgetmax, prix,
           etatzones, imagesbien, carverticalurl, carverticalnote, published)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        )
        .run(userRow?.id, username, role, ...payload);
    }
  } catch (e) {
    console.error("[OCCAS PERSIST ANNONCE]", e.message);
  }

  await syncProfileVilleFromChat(username, sc.ville);

  return matches;
}

async function handleCollectingPhase(session, sc, role) {
  const nextStep = computeNextStep(role, sc);

  if (!nextStep) {
    session.phase = "recap";
    const reply = await generatePhrasing(role, sc, { type: "recap" });
    return {
      reply,
      criteria: sc,
      triggerRecapPopup: true,
      recapData: buildRecapData(role, sc),
    };
  }

  if (nextStep.kind === "popup") {
    const reply = await generatePhrasing(role, sc, {
      type: "popup",
      popup: nextStep.popup,
    });
    return { reply, criteria: sc, [popupFlagKey(nextStep.popup)]: true };
  }

  const reply = await generatePhrasing(role, sc, {
    type: "question",
    field: nextStep.field,
  });
  return { reply, criteria: sc };
}

// ================== CHAT ROUTE — TUNNEL DÉTERMINISTE (agent IA) ==================
app.post("/occas/chat", authenticateOccasToken, async (req, res) => {
  try {
    const { message } = z
      .object({ message: z.string().min(1) })
      .parse(req.body);
    const username = req.user.username;
    const role = req.user.role;
    const contact = req.user.contact;

    if (!sessions[username]) {
      sessions[username] = {
        criteria: { intent: role },
        role,
        phase: "collecting",
        matches: [],
      };
    }
    const session = sessions[username];
    session.role = role;
    const sc = session.criteria;
    sc.intent = role;
    const villeAvant = sc.ville || null;

    if (req.body.etatZones !== undefined) sc.etatZones = req.body.etatZones;
    if (Array.isArray(req.body.imagesbien)) sc.imagesbien = req.body.imagesbien;
    if (req.body.skipImages === true) sc.imagesbien = [];
    if (req.body.carverticalUrl !== undefined) {
      sc.carverticalUrl = req.body.carverticalUrl;
      sc.carverticalNote = req.body.carverticalNote ?? null;
      sc.carverticalDecided = true;
    }
    if (req.body.skipCarvertical === true) sc.carverticalDecided = true;
    if (req.body.carburant !== undefined) sc.carburant = req.body.carburant;
    if (req.body.boite !== undefined) sc.boite = req.body.boite;

    const isInternal = message.startsWith("__");

    if (session.phase === "collecting") {
      if (!isInternal) {
        const merged = await extractCriteria(message, role, sc);
        Object.assign(sc, merged);
        sc.intent = role;
      }
      if (!villeAvant && sc.ville)
        await syncProfileVilleFromChat(username, sc.ville);

      const out = await handleCollectingPhase(session, sc, role);
      return res.json(out);
    }

    if (session.phase === "recap") {
      if (message === "__RECAP_CONFIRMED__") {
        const matches = await runMatchingAndPersist(
          username,
          role,
          contact,
          sc,
        );
        session.matches = matches;
        session.phase = "results";
        const postReply = await generatePhrasing(role, sc, {
          type: "match_intro",
          hasMatches: matches.length > 0,
        });
        return res.json({
          reply: postReply,
          matches,
          postReply,
          matchingDone: true,
          criteria: sc,
        });
      }

      if (message === "__RECAP_MODIFY__") {
        session.phase = "collecting";
        const reply = await generatePhrasing(role, sc, {
          type: "modify_prompt",
        });
        return res.json({ reply, criteria: sc });
      }

      session.phase = "collecting";
      const merged = await extractCriteria(message, role, sc);
      Object.assign(sc, merged);
      sc.intent = role;
      if (!villeAvant && sc.ville)
        await syncProfileVilleFromChat(username, sc.ville);
      const out = await handleCollectingPhase(session, sc, role);
      return res.json(out);
    }

    if (session.phase === "results") {
      const intent = detectResultsIntent(message);

      if (message.startsWith("__ACTION_CONTACT__:")) {
        const idx = parseInt(message.split(":")[1], 10);
        const target = (session.matches || [])[idx];
        if (!target?.contact) {
          return res.json({
            reply: "Je n'ai pas identifié ce profil, précisez lequel.",
            matches: session.matches,
            matchingDone: true,
            criteria: sc,
          });
        }
        let body;
        try {
          body = await generateContactMessage(role, sc, target);
        } catch {
          body = `Bonjour,\n\nVotre profil m'intéresse. Échangeons-nous ?\n\nCordialement.`;
        }
        const sender = await db
          .prepare(`SELECT id, username FROM users_occas WHERE username=$1`)
          .get(username);
        const receiver = await db
          .prepare(
            `SELECT id, username FROM users_occas WHERE LOWER(TRIM(contact))=$1`,
          )
          .get((target.contact || "").trim().toLowerCase());

        let messageSent = false;
        if (sender && receiver) {
          try {
            const subject =
              role === "buyer"
                ? `Intérêt pour votre ${target.marque || "véhicule"} — ${target.ville}`
                : `Acheteur potentiel — ${target.ville}`;
            await db
              .prepare(
                `INSERT INTO messages_occas (sender_id, receiver_id, subject, body) VALUES ($1,$2,$3,$4)`,
              )
              .run(sender.id, receiver.id, subject, body);
            messageSent = true;
            await maybeNotifyNewMessage(receiver.id, sender.username, subject);
          } catch (e) {
            console.error("[OCCAS CONTACT]", e.message);
          }
        }

        return res.json({
          reply: messageSent
            ? `Message envoyé à ${receiver?.username || target.contact}.`
            : `Contact introuvable en base : ${target.contact}`,
          matches: session.matches,
          matchingDone: true,
          criteria: sc,
          actionType: "contact_done",
          messageSent,
        });
      }

      let resultsAI = {
        message: "Je suis à votre disposition.",
        intent: "general",
      };
      try {
        resultsAI = await aiResultsChat(message, sc, {
          phase: "results",
          matchingProfiles: session.matches,
          role,
        });
      } catch (e) {
        console.error("[OCCAS RESULTS AI]", e);
      }

      return res.json({
        reply: resultsAI.message,
        postReply: resultsAI.message,
        matches: session.matches,
        matchingDone: true,
        criteria: sc,
        actionType: resultsAI.intent,
      });
    }

    return res.json({ reply: "Je vous écoute.", criteria: sc });
  } catch (err) {
    console.error("[OCCAS CHAT] ERREUR:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== FAVORIS ==================
app.post("/occas/api/favorites", authenticateOccasToken, async (req, res) => {
  const user = await db
    .prepare(`SELECT id FROM users_occas WHERE username=$1`)
    .get(req.user.username);
  if (!user) return res.sendStatus(404);
  const info = await db
    .prepare(
      `INSERT INTO favorites_occas (user_id, profile_data) VALUES ($1,$2) RETURNING id`,
    )
    .get(user.id, JSON.stringify(req.body));
  res.json({ success: true, dbId: info?.id });
});

app.get("/occas/api/favorites", authenticateOccasToken, async (req, res) => {
  const user = await db
    .prepare(`SELECT id FROM users_occas WHERE username=$1`)
    .get(req.user.username);
  if (!user) return res.sendStatus(404);
  const rows = await db
    .prepare(
      `SELECT id, profile_data FROM favorites_occas WHERE user_id=$1 ORDER BY created_at DESC`,
    )
    .all(user.id);
  res.json(rows.map((r) => ({ dbId: r.id, ...safeObjParse(r.profile_data) })));
});

// ══════════════════════════════════════════════════════════
// MESSAGERIE — 1-à-1, groupes (encodés dans le subject comme sur AiGENT
// Immo : [Groupe:Nom|ID:groupeId|MEMBERS:pseudo:email,...]), pièces
// jointes, mentions (front), archivage, blocage, notifications.
// ══════════════════════════════════════════════════════════

async function occasUserRow(username) {
  return db
    .prepare(
      `SELECT id, username, contact FROM users_occas WHERE LOWER(TRIM(username))=$1`,
    )
    .get((username || "").trim().toLowerCase());
}

/** Envoi d'un message : accepte soit receiverId, soit pseudo+email. */
app.post("/occas/api/messages", authenticateOccasToken, async (req, res) => {
  try {
    const schema = z.object({
      pseudo: z.string().min(1).optional(),
      email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
      subject: z.string().min(0).default(""),
      body: z.string().min(1),
      receiverId: z.number().optional(),
      attachments: z
        .array(
          z.object({
            type: z.string(),
            url: z.string(),
            name: z.string().optional(),
            size: z.number().optional(),
            duration: z.union([z.string(), z.number()]).optional(),
          }),
        )
        .optional()
        .default([]),
    });
    const { pseudo, email, subject, body, receiverId, attachments } =
      schema.parse(req.body);

    const sender = await occasUserRow(req.user.username);
    if (!sender)
      return res.status(404).json({ error: "Expéditeur introuvable" });

    let receiver;
    if (receiverId) {
      receiver = await db
        .prepare(`SELECT id, username, contact FROM users_occas WHERE id=$1`)
        .get(receiverId);
    } else {
      if (!pseudo)
        return res
          .status(400)
          .json({ error: "Pseudo requis pour un nouveau message" });
      const pNorm = pseudo.trim().toLowerCase();
      if (email && email.trim()) {
        receiver = await db
          .prepare(
            `SELECT id, username, contact FROM users_occas
             WHERE LOWER(TRIM(username))=$1 AND LOWER(TRIM(contact))=$2`,
          )
          .get(pNorm, email.trim().toLowerCase());
      } else {
        receiver = await db
          .prepare(
            `SELECT id, username, contact FROM users_occas WHERE LOWER(TRIM(username))=$1`,
          )
          .get(pNorm);
      }
    }
    if (!receiver)
      return res.status(404).json({ error: "Destinataire introuvable" });

    // Blocage : le destinataire a-t-il bloqué l'expéditeur ?
    const blockCheck = await db
      .prepare(
        `SELECT id FROM blocked_users_occas WHERE blocker_id=$1 AND blocked_username=$2`,
      )
      .get(receiver.id, sender.username.trim().toLowerCase());
    if (blockCheck)
      return res
        .status(403)
        .json({ error: "Envoi impossible", reason: "blocked" });

    const attachmentsJson = JSON.stringify(attachments || []);
    const insert = await db
      .prepare(
        `INSERT INTO messages_occas (sender_id, receiver_id, subject, body, attachments)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      )
      .get(sender.id, receiver.id, subject || "", body, attachmentsJson);

    await maybeNotifyNewMessage(
      receiver.id,
      sender.username,
      subject && !subject.startsWith("[Groupe:") ? subject : "Nouveau message",
    );

    res.json({ success: true, messageId: insert?.id });
  } catch (err) {
    if (err?.errors)
      return res.status(400).json({ error: "Données invalides" });
    console.error("[OCCAS messages POST]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/** Historique complet des messages de l'utilisateur connecté. */
app.get("/occas/api/messages", authenticateOccasToken, async (req, res) => {
  try {
    const user = await occasUserRow(req.user.username);
    if (!user)
      return res.status(404).json({ error: "Utilisateur introuvable" });

    const rows = await db
      .prepare(
        `
        SELECT
          m.id, m.sender_id, m.receiver_id,
          REPLACE(LOWER(TRIM(su.username)), '"', '') AS sender,
          REPLACE(LOWER(TRIM(ru.username)), '"', '') AS receiver,
          COALESCE(NULLIF(su.avatar,''), '/images/avatar-default.jpg') AS "senderAvatar",
          COALESCE(NULLIF(ru.avatar,''), '/images/avatar-default.jpg') AS "receiverAvatar",
          su.contact AS "senderEmail",
          ru.contact AS "receiverEmail",
          m.subject, m.body,
          COALESCE(m.attachments, '[]') AS attachments,
          m.read, m.timestamp
        FROM messages_occas m
        JOIN users_occas su ON m.sender_id = su.id
        JOIN users_occas ru ON m.receiver_id = ru.id
        WHERE m.receiver_id = $1 OR m.sender_id = $1
        ORDER BY m.timestamp ASC, m.id ASC
        `,
      )
      .all(user.id);

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
    console.error("[OCCAS messages GET]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/** Marque tous les messages reçus d'un interlocuteur comme lus. */
app.post(
  "/occas/api/messages/mark-read",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await occasUserRow(req.user.username);
      if (!user) return res.sendStatus(404);
      const { otherUserId } = req.body || {};
      if (!otherUserId) return res.json({ success: true });
      await db
        .prepare(
          `UPDATE messages_occas SET read=true WHERE receiver_id=$1 AND sender_id=$2`,
        )
        .run(user.id, Number(otherUserId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.delete(
  "/occas/api/messages/:id",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await occasUserRow(req.user.username);
      if (!user) return res.sendStatus(404);
      const msgId = Number(req.params.id);
      if (!msgId) return res.status(400).json({ error: "ID invalide" });
      const result = await db
        .prepare(
          `DELETE FROM messages_occas WHERE id=$1 AND (sender_id=$2 OR receiver_id=$2)`,
        )
        .run(msgId, user.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[OCCAS messages DELETE]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.delete(
  "/occas/api/conversations/:userId",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await occasUserRow(req.user.username);
      if (!user) return res.sendStatus(404);
      const otherUserId = Number(req.params.userId);
      await db
        .prepare(
          `DELETE FROM messages_occas
           WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)`,
        )
        .run(user.id, otherUserId);
      res.json({ success: true });
    } catch (err) {
      console.error("[OCCAS conversations DELETE]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ── Envoi groupé fiable : résolution des destinataires 100% côté serveur ──
app.post(
  "/occas/api/messages/group",
  authenticateOccasToken,
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
        attachments: z
          .array(
            z.object({
              type: z.string(),
              url: z.string(),
              name: z.string().optional(),
              size: z.number().optional(),
              duration: z.union([z.string(), z.number()]).optional(),
            }),
          )
          .optional()
          .default([]),
      });
      const { groupId, groupName, participants, body, objet, attachments } =
        schema.parse(req.body);

      const sender = await occasUserRow(req.user.username);
      if (!sender)
        return res.status(404).json({ error: "Expéditeur introuvable" });
      const senderNorm = sender.username.trim().toLowerCase();

      const resolved = [];
      const failed = [];
      for (const p of participants) {
        const pNorm = p.pseudo.trim().toLowerCase();
        if (pNorm === senderNorm) continue;

        let row;
        if (p.email && p.email.trim()) {
          row = await db
            .prepare(
              `SELECT id, username, contact FROM users_occas
             WHERE LOWER(TRIM(username))=$1 AND LOWER(TRIM(contact))=$2`,
            )
            .get(pNorm, p.email.trim().toLowerCase());
        } else {
          row = await db
            .prepare(
              `SELECT id, username, contact FROM users_occas WHERE LOWER(TRIM(username))=$1`,
            )
            .get(pNorm);
        }
        if (row) resolved.push(row);
        else failed.push(p.pseudo);
      }

      if (!resolved.length) {
        return res
          .status(404)
          .json({ error: "Aucun destinataire valide trouvé", failed });
      }

      const membersEncoded = resolved.map((r) => ({
        pseudo: r.username,
        email: r.contact,
      }));
      const subject =
        `[Groupe:${groupName}|ID:${groupId}` +
        `|MEMBERS:${membersEncoded.map((m) => `${m.pseudo}:${m.email}`).join(",")}]` +
        (objet ? ` ${objet}` : "");

      const attachmentsJson = JSON.stringify(attachments || []);
      let sentCount = 0;
      for (const r of resolved) {
        const blockCheck = await db
          .prepare(
            `SELECT id FROM blocked_users_occas WHERE blocker_id=$1 AND blocked_username=$2`,
          )
          .get(r.id, senderNorm);
        if (blockCheck) continue;

        await db
          .prepare(
            `INSERT INTO messages_occas (sender_id, receiver_id, subject, body, attachments)
           VALUES ($1,$2,$3,$4,$5)`,
          )
          .run(sender.id, r.id, subject, body, attachmentsJson);
        sentCount++;
        await maybeNotifyNewMessage(r.id, sender.username, "Message de groupe");
      }

      res.json({
        success: true,
        sentCount,
        totalRequested: participants.length,
        failed,
        subject,
      });
    } catch (err) {
      if (err?.errors)
        return res.status(400).json({ error: "Données invalides" });
      console.error("[OCCAS messages/group POST]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);
// ── Archivage ────────────────────────────────────────────────────────────
app.post(
  "/occas/api/conversations/archive",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await occasUserRow(req.user.username);
      if (!user) return res.sendStatus(404);
      const { conversationKey } = req.body || {};
      if (!conversationKey)
        return res.status(400).json({ error: "conversationKey requis" });
      const existing = await db
        .prepare(
          `SELECT id FROM archived_conversations_occas WHERE user_id=$1 AND conversation_key=$2`,
        )
        .get(user.id, conversationKey);
      if (!existing) {
        await db
          .prepare(
            `INSERT INTO archived_conversations_occas (user_id, conversation_key) VALUES ($1,$2)`,
          )
          .run(user.id, conversationKey);
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[OCCAS archive POST]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.delete(
  "/occas/api/conversations/archive/:key",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await occasUserRow(req.user.username);
      if (!user) return res.sendStatus(404);
      const conversationKey = decodeURIComponent(req.params.key);
      await db
        .prepare(
          `DELETE FROM archived_conversations_occas WHERE user_id=$1 AND conversation_key=$2`,
        )
        .run(user.id, conversationKey);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.get(
  "/occas/api/conversations/archived",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await occasUserRow(req.user.username);
      if (!user) return res.sendStatus(404);
      const rows = await db
        .prepare(
          `SELECT conversation_key FROM archived_conversations_occas WHERE user_id=$1 ORDER BY archived_at DESC`,
        )
        .all(user.id);
      res.json(rows.map((r) => r.conversation_key));
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ── Blocage ──────────────────────────────────────────────────────────────
app.post("/occas/api/users/block", authenticateOccasToken, async (req, res) => {
  try {
    const user = await occasUserRow(req.user.username);
    if (!user) return res.sendStatus(404);
    const { targetUsername } = req.body || {};
    if (!targetUsername)
      return res.status(400).json({ error: "targetUsername requis" });
    const targetNorm = targetUsername.trim().toLowerCase();
    const existing = await db
      .prepare(
        `SELECT id FROM blocked_users_occas WHERE blocker_id=$1 AND blocked_username=$2`,
      )
      .get(user.id, targetNorm);
    if (!existing) {
      await db
        .prepare(
          `INSERT INTO blocked_users_occas (blocker_id, blocked_username) VALUES ($1,$2)`,
        )
        .run(user.id, targetNorm);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[OCCAS block POST]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete(
  "/occas/api/users/block/:username",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await occasUserRow(req.user.username);
      if (!user) return res.sendStatus(404);
      const targetNorm = req.params.username.trim().toLowerCase();
      await db
        .prepare(
          `DELETE FROM blocked_users_occas WHERE blocker_id=$1 AND blocked_username=$2`,
        )
        .run(user.id, targetNorm);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.get(
  "/occas/api/users/blocked",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await occasUserRow(req.user.username);
      if (!user) return res.sendStatus(404);
      const rows = await db
        .prepare(
          `SELECT blocked_username FROM blocked_users_occas WHERE blocker_id=$1`,
        )
        .all(user.id);
      res.json(rows.map((r) => r.blocked_username));
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ══════════════════════════════════════════════════════════
// ROUTES PROFIL
// ══════════════════════════════════════════════════════════

app.get("/occas/api/me/full", authenticateOccasToken, async (req, res) => {
  try {
    const user = await db
      .prepare(
        `SELECT id, username, role, contact, avatar, ville, created_at FROM users_occas WHERE username=$1`,
      )
      .get(req.user.username);
    if (!user) return res.sendStatus(404);

    if (!user.ville) {
      const lastAnnonce = await db
        .prepare(
          `SELECT ville FROM annonces_occas
           WHERE user_id=$1 AND ville IS NOT NULL AND ville <> ''
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(user.id);
      if (lastAnnonce?.ville) user.villeFromAnnonce = lastAnnonce.ville;
    }

    res.json(user);
  } catch (err) {
    console.error("[me/full]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.patch("/occas/api/me", authenticateOccasToken, async (req, res) => {
  try {
    const allowed = ["contact", "ville"];
    const updates = {};
    for (const k of allowed)
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    if (!Object.keys(updates).length)
      return res.status(400).json({ error: "Aucun champ valide" });
    const set = Object.keys(updates)
      .map((k, i) => `${k}=$${i + 1}`)
      .join(", ");
    const vals = [...Object.values(updates), req.user.username];
    await db
      .prepare(`UPDATE users_occas SET ${set} WHERE username=$${vals.length}`)
      .run(...vals);
    res.json({ success: true, updated: updates });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post(
  "/occas/api/change-avatar",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const { avatar } = req.body;
      if (!avatar) return res.status(400).json({ error: "Avatar manquant" });
      await db
        .prepare(`UPDATE users_occas SET avatar=$1 WHERE username=$2`)
        .run(avatar, req.user.username);
      res.json({ success: true, avatar });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.get("/occas/api/stats", authenticateOccasToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);

    const favResult = await db
      .prepare(`SELECT COUNT(*) AS count FROM favorites_occas WHERE user_id=$1`)
      .get(user.id);
    const convoResult = await db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN sender_id=$1 THEN receiver_id ELSE sender_id END) AS count
         FROM messages_occas WHERE sender_id=$1 OR receiver_id=$1`,
      )
      .get(user.id);
    const annoncesResult = await db
      .prepare(`SELECT COUNT(*) AS count FROM annonces_occas WHERE user_id=$1`)
      .get(user.id);

    res.json({
      totalFavoris: favResult?.count || 0,
      activeConversations: convoResult?.count || 0,
      totalAnnonces: annoncesResult?.count || 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---- SÉCURITÉ ----
app.post(
  "/occas/api/change-password",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword || newPassword.length < 8)
        return res.status(400).json({
          error: "Mot de passe actuel requis, nouveau de 8 caractères min.",
        });
      const user = await db
        .prepare(`SELECT id, password FROM users_occas WHERE username=$1`)
        .get(req.user.username);
      if (!user) return res.status(404).json({ error: "Introuvable" });

      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match)
        return res.status(401).json({ error: "Mot de passe actuel incorrect" });

      const hash = await bcrypt.hash(newPassword, 10);
      await db
        .prepare(`UPDATE users_occas SET password=$1 WHERE id=$2`)
        .run(hash, user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.get("/occas/api/2fa/status", authenticateOccasToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);
    const tfa = await db
      .prepare(`SELECT enabled FROM user_2fa_occas WHERE user_id=$1`)
      .get(user.id);
    res.json({ enabled: tfa?.enabled || false });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/occas/api/2fa/enable", authenticateOccasToken, async (req, res) => {
  try {
    const { secret, code } = req.body;
    if (!secret || !/^\d{6}$/.test(code || ""))
      return res.status(400).json({ error: "Code invalide" });
    const user = await db
      .prepare(`SELECT id FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);

    const backupCodes = Array.from(
      { length: 3 },
      () =>
        `${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    );
    const existing = await db
      .prepare(`SELECT id FROM user_2fa_occas WHERE user_id=$1`)
      .get(user.id);
    if (existing) {
      await db
        .prepare(
          `UPDATE user_2fa_occas SET secret=$1, enabled=true, backup_codes=$2 WHERE user_id=$3`,
        )
        .run(secret, JSON.stringify(backupCodes), user.id);
    } else {
      await db
        .prepare(
          `INSERT INTO user_2fa_occas (user_id, secret, enabled, backup_codes) VALUES ($1,$2,true,$3)`,
        )
        .run(user.id, secret, JSON.stringify(backupCodes));
    }
    res.json({ success: true, backupCodes });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/occas/api/2fa/disable", authenticateOccasToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);
    await db
      .prepare(`UPDATE user_2fa_occas SET enabled=false WHERE user_id=$1`)
      .run(user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/occas/api/export-data", authenticateOccasToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT * FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);
    delete user.password;
    const annonces = await db
      .prepare(`SELECT * FROM annonces_occas WHERE user_id=$1`)
      .all(user.id);
    const favoris = await db
      .prepare(`SELECT * FROM favorites_occas WHERE user_id=$1`)
      .all(user.id);
    res.json({ user, annonces, favoris, exportedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---- PRÉFÉRENCES ----
app.get("/occas/api/preferences", authenticateOccasToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT preferences FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);
    let prefs = {};
    try {
      prefs = JSON.parse(user.preferences || "{}");
    } catch {}
    res.json(withPrefDefaults(prefs));
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.patch(
  "/occas/api/preferences",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id, preferences FROM users_occas WHERE username=$1`)
        .get(req.user.username);
      if (!user) return res.sendStatus(404);
      let current = {};
      try {
        current = JSON.parse(user.preferences || "{}");
      } catch {}
      const merged = withPrefDefaults({ ...current, ...req.body });
      await db
        .prepare(`UPDATE users_occas SET preferences=$1 WHERE id=$2`)
        .run(JSON.stringify(merged), user.id);
      res.json({ success: true, preferences: merged });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);
// ---- MES ANNONCES ----
app.get("/occas/api/my-annonces", authenticateOccasToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);
    const rows = await db
      .prepare(
        `SELECT * FROM annonces_occas WHERE user_id=$1 ORDER BY updated_at DESC`,
      )
      .all(user.id);
    res.json(
      rows.map((r) => ({
        ...r,
        etatzones: safeJson(r.etatzones),
        imagesbien: safeJson(r.imagesbien),
      })),
    );
  } catch (err) {
    console.error("[my-annonces]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete(
  "/occas/api/my-annonces/:id",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id FROM users_occas WHERE username=$1`)
        .get(req.user.username);
      if (!user) return res.sendStatus(404);
      await db
        .prepare(`DELETE FROM annonces_occas WHERE id=$1 AND user_id=$2`)
        .run(Number(req.params.id), user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

function safeJson(v) {
  try {
    return typeof v === "string" ? JSON.parse(v) : v || {};
  } catch {
    return {};
  }
}

// ---- NOTIFICATIONS génériques ----
app.get(
  "/occas/api/notifications",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id FROM users_occas WHERE username=$1`)
        .get(req.user.username);
      if (!user) return res.sendStatus(404);
      const rows = await db
        .prepare(
          `SELECT * FROM notifications_occas WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        )
        .all(user.id);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.post(
  "/occas/api/notifications/read",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id FROM users_occas WHERE username=$1`)
        .get(req.user.username);
      if (!user) return res.sendStatus(404);
      const { id } = req.body;
      if (id) {
        await db
          .prepare(
            `UPDATE notifications_occas SET read=true WHERE id=$1 AND user_id=$2`,
          )
          .run(id, user.id);
      } else {
        await db
          .prepare(`UPDATE notifications_occas SET read=true WHERE user_id=$1`)
          .run(user.id);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ---- COTE & ESTIMATION (robuste : trim, repli sans modèle, insensible à la casse) ----
app.post("/occas/api/estimation", authenticateOccasToken, async (req, res) => {
  try {
    const marque = String(req.body.marque || "").trim();
    const modele = String(req.body.modele || "").trim();
    const annee = req.body.annee ? Number(req.body.annee) : null;
    const kilometrage = req.body.kilometrage
      ? Number(req.body.kilometrage)
      : null;
    if (!marque) return res.status(400).json({ error: "Marque requise" });

    async function fetchRows(withModele) {
      if (withModele && modele) {
        return db
          .prepare(
            `SELECT prix, annee, kilometrage FROM annonces_occas
             WHERE role='seller' AND prix > 0
               AND LOWER(TRIM(marque)) = LOWER($1)
               AND LOWER(TRIM(modele)) = LOWER($2)`,
          )
          .all(marque, modele);
      }
      return db
        .prepare(
          `SELECT prix, annee, kilometrage FROM annonces_occas
           WHERE role='seller' AND prix > 0
             AND LOWER(TRIM(marque)) = LOWER($1)`,
        )
        .all(marque);
    }

    let rows = await fetchRows(true);
    let usedFallback = false;
    if (!rows.length && modele) {
      rows = await fetchRows(false);
      usedFallback = true;
    }

    if (!rows.length) {
      return res.json({
        found: 0,
        message:
          "Aucune annonce vendeur comparable pour cette marque sur la plateforme pour le moment.",
      });
    }

    const prices = rows
      .map((r) => Number(r.prix))
      .filter((p) => p > 0)
      .sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

    let adj = 1;
    const withAnnee = rows.filter((r) => r.annee);
    const avgAnnee = withAnnee.length
      ? withAnnee.reduce((s, r) => s + r.annee, 0) / withAnnee.length
      : null;
    if (annee && avgAnnee) adj += (annee - avgAnnee) * 0.015;

    const withKm = rows.filter((r) => r.kilometrage);
    const avgKm = withKm.length
      ? withKm.reduce((s, r) => s + r.kilometrage, 0) / withKm.length
      : null;
    if (kilometrage && avgKm)
      adj -= ((kilometrage - avgKm) / Math.max(avgKm, 1)) * 0.08;
    adj = Math.max(0.6, Math.min(1.4, adj));

    const estimated = Math.round(median * adj);

    res.json({
      found: rows.length,
      median,
      average: avg,
      estimated,
      rangeLow: Math.round(estimated * 0.92),
      rangeHigh: Math.round(estimated * 1.08),
      basedOn: usedFallback ? "marque" : "marque+modele",
    });
  } catch (err) {
    console.error("[estimation]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---- AGENDA (RDV visites, contrôle technique, révisions...) ----
app.get("/occas/api/agenda", authenticateOccasToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);
    const rows = await db
      .prepare(
        `SELECT * FROM agenda_occas WHERE user_id=$1 ORDER BY date ASC, time ASC`,
      )
      .all(user.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/occas/api/agenda", authenticateOccasToken, async (req, res) => {
  try {
    const { name, date, time, kind, description, color } = req.body;
    if (!name || !date)
      return res.status(400).json({ error: "name et date requis" });
    const user = await db
      .prepare(`SELECT id FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);
    const r = await db
      .prepare(
        `INSERT INTO agenda_occas (user_id, name, date, time, kind, description, color) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      )
      .get(
        user.id,
        name,
        String(date).slice(0, 10),
        time || "",
        kind || "autre",
        description || "",
        color || "#ff6a2b",
      );
    res.json({ success: true, id: r?.id });
  } catch (err) {
    console.error("[agenda:post]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.patch("/occas/api/agenda/:id", authenticateOccasToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users_occas WHERE username=$1`)
      .get(req.user.username);
    if (!user) return res.sendStatus(404);
    const allowed = ["name", "date", "time", "kind", "description", "color"];
    const updates = {};
    for (const k of allowed) {
      if (req.body?.[k] === undefined) continue;
      updates[k] =
        k === "date" ? String(req.body[k]).slice(0, 10) : req.body[k];
    }
    if (!Object.keys(updates).length)
      return res.status(400).json({ error: "Aucun champ valide" });
    updates.reminded = false;
    const set = Object.keys(updates)
      .map((k, i) => `${k}=$${i + 1}`)
      .join(", ");
    const vals = [...Object.values(updates), Number(req.params.id), user.id];
    await db
      .prepare(
        `UPDATE agenda_occas SET ${set} WHERE id=$${vals.length - 1} AND user_id=$${vals.length}`,
      )
      .run(...vals);
    res.json({ success: true, updated: updates });
  } catch (err) {
    console.error("[agenda:patch]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete(
  "/occas/api/agenda/:id",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id FROM users_occas WHERE username=$1`)
        .get(req.user.username);
      if (!user) return res.sendStatus(404);
      await db
        .prepare(`DELETE FROM agenda_occas WHERE id=$1 AND user_id=$2`)
        .run(Number(req.params.id), user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ---- ZONE CRITIQUE ----
app.post(
  "/occas/api/reset-profile",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id FROM users_occas WHERE username=$1`)
        .get(req.user.username);
      if (!user) return res.sendStatus(404);
      await db
        .prepare(`DELETE FROM annonces_occas WHERE user_id=$1`)
        .run(user.id);
      delete sessions[req.user.username];
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.delete(
  "/occas/api/delete-data",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id FROM users_occas WHERE username=$1`)
        .get(req.user.username);
      if (!user) return res.sendStatus(404);
      await db
        .prepare(`DELETE FROM favorites_occas WHERE user_id=$1`)
        .run(user.id);
      await db
        .prepare(
          `DELETE FROM messages_occas WHERE sender_id=$1 OR receiver_id=$1`,
        )
        .run(user.id);
      await db
        .prepare(`DELETE FROM annonces_occas WHERE user_id=$1`)
        .run(user.id);
      delete sessions[req.user.username];
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.delete(
  "/occas/api/delete-account",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id FROM users_occas WHERE username=$1`)
        .get(req.user.username);
      if (!user) return res.sendStatus(404);
      await db
        .prepare(`DELETE FROM favorites_occas WHERE user_id=$1`)
        .run(user.id);
      await db
        .prepare(
          `DELETE FROM messages_occas WHERE sender_id=$1 OR receiver_id=$1`,
        )
        .run(user.id);
      await db
        .prepare(`DELETE FROM annonces_occas WHERE user_id=$1`)
        .run(user.id);
      await db.prepare(`DELETE FROM users_occas WHERE id=$1`).run(user.id);
      delete sessions[req.user.username];
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ══════════════════════════════════════════════════════════
// AVATARS
// ══════════════════════════════════════════════════════════
const OCCAS_AVATARS = Array.from(
  { length: 15 },
  (_, i) => `/images/avatar-${i + 1}.jpg`,
);
const OCCAS_AVATAR_DEFAULT = "/images/avatar-default.jpg";

app.get("/occas/api/avatars", authenticateOccasToken, (req, res) => {
  res.json({ avatars: OCCAS_AVATARS, default: OCCAS_AVATAR_DEFAULT });
});

// ══════════════════════════════════════════════════════════
// ACTIVITÉ
// ══════════════════════════════════════════════════════════
async function occasUserId(username) {
  const u = await db
    .prepare(`SELECT id FROM users_occas WHERE username=$1`)
    .get(username);
  return u?.id || null;
}

app.post(
  "/occas/api/activity/ping",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const uid = await occasUserId(req.user.username);
      if (!uid) return res.sendStatus(404);
      const seconds = Math.max(
        0,
        Math.min(3600, Number(req.body?.seconds) || 60),
      );
      const events = Math.max(0, Math.min(500, Number(req.body?.events) || 0));
      const day = new Date().toISOString().slice(0, 10);
      await db
        .prepare(
          `INSERT INTO activity_occas (user_id, day, seconds, events)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, day)
           DO UPDATE SET seconds = activity_occas.seconds + $3,
                         events  = activity_occas.events + $4`,
        )
        .run(uid, day, seconds, events);
      res.json({ success: true });
    } catch (err) {
      console.error("[activity/ping]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.get("/occas/api/activity", authenticateOccasToken, async (req, res) => {
  try {
    const uid = await occasUserId(req.user.username);
    if (!uid) return res.sendStatus(404);
    const days = Math.max(3, Math.min(90, Number(req.query.days) || 30));
    const rows = await db
      .prepare(
        `SELECT day, seconds, events FROM activity_occas
         WHERE user_id=$1 ORDER BY day ASC`,
      )
      .all(uid);
    const map = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
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
    console.error("[activity]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ══════════════════════════════════════════════════════════
// COFFRE CARVERTICAL
// ══════════════════════════════════════════════════════════
app.get("/occas/api/vault", authenticateOccasToken, async (req, res) => {
  try {
    const uid = await occasUserId(req.user.username);
    if (!uid) return res.sendStatus(404);
    const docs = await db
      .prepare(
        `SELECT * FROM vault_occas WHERE user_id=$1 ORDER BY created_at DESC`,
      )
      .all(uid);
    const fromAnnonces = await db
      .prepare(
        `SELECT id AS annonce_id, marque, modele, annee, carverticalurl AS url,
                carverticalnote AS note, updated_at
         FROM annonces_occas
         WHERE user_id=$1 AND carverticalurl IS NOT NULL
         ORDER BY updated_at DESC`,
      )
      .all(uid);
    res.json({ docs, fromAnnonces });
  } catch (err) {
    console.error("[vault]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post(
  "/occas/api/vault",
  authenticateOccasToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const uid = await occasUserId(req.user.username);
      if (!uid) return res.sendStatus(404);
      const { label, plate, vin, note, annonce_id } = req.body || {};
      let url = req.body?.url || null;
      if (req.file) {
        url = await uploadBuffer(req.file.buffer, "occas/vault", "auto");
      }
      if (!url || !label)
        return res.status(400).json({ error: "label et fichier/url requis" });
      const r = await db
        .prepare(
          `INSERT INTO vault_occas (user_id, annonce_id, label, plate, vin, url, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        )
        .get(
          uid,
          annonce_id ? Number(annonce_id) : null,
          label,
          plate || "",
          (vin || "").toUpperCase(),
          url,
          note ? Number(note) : null,
        );
      res.json({ success: true, id: r?.id, url });
    } catch (err) {
      console.error("[vault:post]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.delete("/occas/api/vault/:id", authenticateOccasToken, async (req, res) => {
  try {
    const uid = await occasUserId(req.user.username);
    if (!uid) return res.sendStatus(404);
    await db
      .prepare(`DELETE FROM vault_occas WHERE id=$1 AND user_id=$2`)
      .run(Number(req.params.id), uid);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ══════════════════════════════════════════════════════════
// SUPPORT & CENTRE D'AIDE — ticket en base + e-mail Gmail réel
// ══════════════════════════════════════════════════════════
app.post("/occas/api/support", authenticateOccasToken, async (req, res) => {
  try {
    const uid = await occasUserId(req.user.username);
    if (!uid) return res.sendStatus(404);
    const { subject, message, category } = req.body || {};
    if (!subject || !message || String(message).trim().length < 10)
      return res
        .status(400)
        .json({ error: "Sujet et message (10 caractères min.) requis" });

    const ticket = await db
      .prepare(
        `INSERT INTO support_occas (user_id, subject, category, message)
         VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
      )
      .get(uid, subject, category || "general", message);

    const mailed = await sendSupportEmail({
      username: req.user.username,
      contact: req.user.contact,
      subject,
      category: category || "general",
      message,
      ticketId: ticket.id,
    });

    await db
      .prepare(
        `INSERT INTO notifications_occas (user_id, type, title, body)
         VALUES ($1,'support',$2,$3)`,
      )
      .run(
        uid,
        `Ticket #${ticket.id} reçu`,
        "Notre équipe vous répond sous 24h ouvrées.",
      );

    res.json({ success: true, ticketId: ticket.id, mailed });
  } catch (err) {
    console.error("[support]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ── Vérification d'existence d'un compte (pseudo + email) ─────────────────
app.post(
  "/occas/api/users/verify",
  authenticateOccasToken,
  async (req, res) => {
    try {
      const { pseudo, email } = req.body || {};
      if (!pseudo) return res.status(400).json({ error: "Pseudo requis" });
      const pNorm = pseudo.trim().toLowerCase();

      let user;
      if (email && email.trim()) {
        user = await db
          .prepare(
            `SELECT username, contact FROM users_occas
           WHERE LOWER(TRIM(username))=$1 AND LOWER(TRIM(contact))=$2`,
          )
          .get(pNorm, email.trim().toLowerCase());
      } else {
        user = await db
          .prepare(
            `SELECT username, contact FROM users_occas WHERE LOWER(TRIM(username))=$1`,
          )
          .get(pNorm);
      }

      if (!user)
        return res
          .status(404)
          .json({ exists: false, error: "Utilisateur introuvable" });
      res.json({
        exists: true,
        username: user.username,
        contact: user.contact,
      });
    } catch (err) {
      console.error("[OCCAS users/verify]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

app.get("/occas/api/support", authenticateOccasToken, async (req, res) => {
  try {
    const uid = await occasUserId(req.user.username);
    if (!uid) return res.sendStatus(404);
    const rows = await db
      .prepare(
        `SELECT id, subject, category, status, created_at FROM support_occas
         WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
      )
      .all(uid);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/** Applique les défauts non-négociables : le matching auto est toujours actif,
 *  et le tri par compatibilité / la priorité CarVertical sont activés par
 *  défaut sauf refus explicite de l'utilisateur (val === false). */
function withPrefDefaults(p = {}) {
  return {
    ...p,
    autoMatch: true,
    prioriteCarV: p.prioriteCarV !== false,
    triPertinence: p.triPertinence !== false,
  };
}
// ══════════════════════════════════════════════════════════
// MOTEUR D'ALERTES — scan périodique respectant les préférences de chacun
// ══════════════════════════════════════════════════════════
async function getUserPrefs(userId) {
  const u = await db
    .prepare(`SELECT preferences FROM users_occas WHERE id=$1`)
    .get(userId);
  try {
    return withPrefDefaults(JSON.parse(u?.preferences || "{}"));
  } catch {
    return withPrefDefaults({});
  }
}

async function pushNotification(userId, type, title, body, data = {}) {
  await db
    .prepare(
      `INSERT INTO notifications_occas (user_id, type, title, body, data) VALUES ($1,$2,$3,$4,$5)`,
    )
    .run(userId, type, title, body, JSON.stringify(data));
}

/** Utile côté chat/messagerie : notifie l'auteur d'un nouveau message reçu (si pref active). */
async function maybeNotifyNewMessage(receiverId, senderUsername, subject) {
  const prefs = await getUserPrefs(receiverId);
  if (prefs.alertMessage === false) return;
  await pushNotification(
    receiverId,
    "message",
    "Nouveau message reçu",
    `${senderUsername} vous a écrit : "${subject}"`,
    { type: "message", link: "messagerie" },
  );
}

/** Rappel agenda 24h avant chaque rendez-vous, pour les users avec alertAgenda activé. */
async function scanAgendaReminders() {
  try {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    const targetDate = `${y}-${m}-${d}`;

    const rows = await db
      .prepare(
        `SELECT a.*, u.id AS uid, u.preferences FROM agenda_occas a
         JOIN users_occas u ON u.id = a.user_id
         WHERE a.date = $1 AND a.reminded = false`,
      )
      .all(targetDate);

    for (const row of rows) {
      let prefs = {};
      try {
        prefs = JSON.parse(row.preferences || "{}");
      } catch {}
      if (prefs.alertAgenda === false) continue;
      await pushNotification(
        row.uid,
        "agenda",
        "Rappel — rendez-vous demain",
        `${row.name}${row.time ? " à " + row.time.slice(0, 5) : ""} — dans 24h.`,
        { type: "agenda", link: "agenda" },
      );
      await db
        .prepare(`UPDATE agenda_occas SET reminded = true WHERE id=$1`)
        .run(row.id);
    }
  } catch (e) {
    console.warn("[scanAgendaReminders]", e.message);
  }
}

/** Baisse de prix : compare le prix courant des annonces vendeur au dernier prix connu. */
async function scanPriceDrops() {
  try {
    const rows = await db
      .prepare(
        `SELECT id, user_id, marque, modele, prix FROM annonces_occas
         WHERE role='seller' AND prix > 0`,
      )
      .all();
    for (const a of rows) {
      const watch = await db
        .prepare(`SELECT last_price FROM price_watch_occas WHERE annonce_id=$1`)
        .get(a.id);
      if (!watch) {
        await db
          .prepare(
            `INSERT INTO price_watch_occas (annonce_id, last_price) VALUES ($1,$2)`,
          )
          .run(a.id, a.prix);
        continue;
      }
      if (Number(watch.last_price) > Number(a.prix)) {
        const buyers = await db
          .prepare(`SELECT id, preferences FROM users_occas WHERE role='buyer'`)
          .all();
        for (const b of buyers) {
          let bp = {};
          try {
            bp = JSON.parse(b.preferences || "{}");
          } catch {}
          if (bp.alertPrice === false) continue;
          await pushNotification(
            b.id,
            "price",
            "Baisse de prix détectée",
            `${a.marque || "Véhicule"} ${a.modele || ""} : prix passé de ${Math.round(watch.last_price).toLocaleString("fr-FR")} € à ${Math.round(a.prix).toLocaleString("fr-FR")} €.`,
            { type: "price", link: "cote" },
          );
        }
      }
      await db
        .prepare(
          `UPDATE price_watch_occas SET last_price=$1 WHERE annonce_id=$2`,
        )
        .run(a.prix, a.id);
    }
  } catch (e) {
    console.warn("[scanPriceDrops]", e.message);
  }
}

/** Nouveau match : relance le matching pour chaque profil publié et notifie
 *  les nouveaux profils compatibles avec pseudo + e-mail pour contact direct. */
async function scanNewMatches() {
  try {
    const annonces = await db
      .prepare(`SELECT * FROM annonces_occas WHERE published = true`)
      .all();
    for (const a of annonces) {
      const prefs = await getUserPrefs(a.user_id);
      if (prefs.alertMatch === false) continue;

      const updatedAt = a.updated_at
        ? new Date(a.updated_at).getTime()
        : Date.now();
      const sc = {
        ville: a.ville,
        toleranceKm: a.tolerancekm,
        marque: a.marque,
        modele: a.modele,
        annee: a.annee,
        anneeMin: a.anneemin,
        carburant: a.carburant,
        boite: a.boite,
        kilometrage: a.kilometrage,
        kilometrageMax: a.kilometragemax,
        budgetMax: a.budgetmax,
        etatZones: safeJson(a.etatzones),
      };

      let matches = [];
      try {
        if (a.role === "buyer") {
          const profile = addBuyerOccas({
            username: a.username,
            contact: "",
            role: "buyer",
            ville: sc.ville || "",
            toleranceKm: sc.toleranceKm ?? 60,
            budgetMax: sc.budgetMax ?? 0,
            carburant: sc.carburant || "",
            kilometrageMax: sc.kilometrageMax ?? null,
            anneeMin: sc.anneeMin ?? null,
            marque: sc.marque || "",
            modele: sc.modele || "",
            boite: sc.boite || "",
            updatedAt,
          });
          matches = matchSellersForBuyer(profile, 5, prefs);
        } else {
          const profile = addSellerOccas({
            username: a.username,
            contact: "",
            role: "seller",
            ville: sc.ville || "",
            marque: sc.marque || "",
            modele: sc.modele || "",
            annee: sc.annee ?? null,
            carburant: sc.carburant || "",
            boite: sc.boite || "",
            kilometrage: sc.kilometrage ?? null,
            prix: a.prix ?? 0,
            etatZones: sc.etatZones || {},
            updatedAt,
          });
          matches = matchBuyersForSeller(profile, 5, prefs);
        }
      } catch {
        continue;
      }
      for (const m of matches) {
        if (!m?.username) continue;
        const known = await db
          .prepare(
            `SELECT 1 FROM known_matches_occas WHERE user_id=$1 AND match_username=$2`,
          )
          .get(a.user_id, m.username);
        if (known) continue;

        await db
          .prepare(
            `INSERT INTO known_matches_occas (user_id, match_username) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
          )
          .run(a.user_id, m.username);

        await pushNotification(
          a.user_id,
          "match",
          "Nouveau profil compatible",
          `${m.marque || "Véhicule"} ${m.modele || ""} à ${m.ville || "—"} — contactez directement le profil ci-dessous.`,
          {
            type: "match",
            username: m.username,
            contact: m.contact || "",
            link: "annonces",
          },
        );
      }
    }
  } catch (e) {
    console.warn("[scanNewMatches]", e.message);
  }
}

/** Actualité marché : résumé hebdomadaire léger, pointant vers Cote & estimation. */
async function scanMarketNews() {
  try {
    const users = await db
      .prepare(`SELECT id, preferences FROM users_occas`)
      .all();
    const stats = await db
      .prepare(
        `SELECT COUNT(*)::int AS n, AVG(prix) AS avgprix FROM annonces_occas WHERE role='seller' AND prix > 0`,
      )
      .get();
    for (const u of users) {
      let prefs = {};
      try {
        prefs = JSON.parse(u.preferences || "{}");
      } catch {}
      if (prefs.alertNews === false) continue;
      const already = await db
        .prepare(
          `SELECT 1 FROM notifications_occas WHERE user_id=$1 AND type='news' AND created_at > NOW() - INTERVAL '6 days'`,
        )
        .get(u.id)
        .catch(() => null);
      if (already) continue;
      await pushNotification(
        u.id,
        "news",
        "Actualité du marché",
        `${stats?.n || 0} véhicules actifs sur la plateforme, prix moyen constaté ${Math.round(stats?.avgprix || 0).toLocaleString("fr-FR")} €.`,
        { type: "news", link: "cote" },
      );
    }
  } catch (e) {
    console.warn("[scanMarketNews]", e.message);
  }
}

// Cadence : agenda + prix + match toutes les 10 min, actu marché toutes les 6h
setInterval(
  () => {
    scanAgendaReminders();
    scanPriceDrops();
    scanNewMatches();
  },
  10 * 60 * 1000,
);
setInterval(scanMarketNews, 6 * 3600 * 1000);
// Premier passage peu après le démarrage
setTimeout(() => {
  scanAgendaReminders();
  scanPriceDrops();
  scanNewMatches();
  scanMarketNews();
}, 15000);

// ================== START ==================
app.listen(PORT, HOST, () => {
  console.log(
    `🚗 Mon AiGENT Occasion v4 (+ messagerie) — serveur lancé sur http://${HOST}:${PORT}`,
  );
});
