//================ IMPORTS ==================// //actuel
import express from "express";
import { db } from "./db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import fs from "fs";
import OpenAI from "openai";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import levenshtein from "fast-levenshtein";
import { createHmac } from "crypto";
const HOST = "0.0.0.0";
import {
  addBuyer,
  addSeller,
  matchUsers,
  matchSellerToBuyers,
  learnPreference,
  resetProfiles,
  normalize,
  distanceKm,
  SELLERS,
  BUYERS,
  getStatsMatches,
  getSimilarProfiles,
} from "./services/matchingEngine.js";
import { getDepartement } from "./services/matchingEngine.js";
import { seedProfiles } from "./services/seedProfiles.js";

dotenv.config();
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET manquant");
const isProd = process.env.NODE_ENV === "production";
// ================== SETUP ==================
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// ================== VILLES ==================
const villes = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "./services/villes-france.json"),
    "utf-8",
  ),
);

const normalizeStr = (str) =>
  typeof str === "string"
    ? str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    : "";
export function safeImagesParse(input) {
  try {
    // cas null / undefined
    if (!input) return [];

    // déjà array
    if (Array.isArray(input)) return input;

    // string vide
    if (typeof input !== "string") return [];

    const trimmed = input.trim();

    if (!trimmed) return [];

    // tentative JSON parse
    const parsed = JSON.parse(trimmed);

    // valid array
    if (Array.isArray(parsed)) return parsed;

    return [];
  } catch (err) {
    console.warn("[safeImagesParse] invalid input:", input);
    return [];
  }
}
const villesNormalized = villes.map((v) => ({
  original: v,
  norm: normalizeStr(v.ville),
}));

const toNumber = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? null : n;
};
const DB_MAP = {
  piecesMin: "piecesmin",
  piecesMax: "piecesmax",
  surfaceMin: "surfacemin",
  surfaceMax: "surfacemax",
  budgetMin: "budgetmin",
  budgetMax: "budgetmax",
};
const toDB = (obj) => {
  const out = {};
  for (const key in obj) {
    const dbKey = DB_MAP[key] || key;
    out[dbKey] = obj[key];
  }
  return out;
};
const fromDB = (row) => ({
  username: row.username,
  role: row.role,

  piecesMin: row.piecesMin ?? row.piecesmin ?? null,
  piecesMax: row.piecesMax ?? row.piecesmax ?? null,

  surfaceMin: row.surfaceMin ?? row.surfacemin ?? null,
  surfaceMax: row.surfaceMax ?? row.surfacemax ?? null,

  budgetMin: row.budgetMin ?? row.budgetmin ?? null,
  budgetMax: row.budgetMax ?? row.budgetmax ?? null,
});
// ── LIBRAIRIE TOTP (simple implémentation sans dépendance externe) ───────────
// Fonction de vérification TOTP (RFC 6238) — à placer dans les helpers
function verifyTOTP(secret, code, windowSize = 1) {
  // Décodage base32
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const decodedSecret = secret.toUpperCase().replace(/=+$/, "");

  let bits = "";
  for (const ch of decodedSecret) {
    const idx = base32Chars.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
  }

  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / 30);

  // Vérifier dans la fenêtre temporelle
  for (let delta = -windowSize; delta <= windowSize; delta++) {
    const c = counter + delta;
    // HMAC-SHA1 via crypto natif Node.js
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(0, 0);
    counterBuf.writeUInt32BE(c, 4);
    const hmac = createHmac("sha1", Buffer.from(bytes))
      .update(counterBuf)
      .digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const otp =
      (((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)) %
      1000000;
    if (otp.toString().padStart(6, "0") === code) return true;
  }
  return false;
}

function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const part1 = Math.random().toString(36).slice(2, 7).toUpperCase();
    const part2 = Math.random().toString(36).slice(2, 7).toUpperCase();
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}
// ================== MIDDLEWARES ==================
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(
  helmet({
    // Permet le chargement des tuiles de cartes (Leaflet) depuis des domaines tiers
    crossOriginResourcePolicy: false,

    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },

    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],

        // Autorise les balises <script>
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Indispensable pour tailwind.config et lucide.createIcons()
          "'unsafe-eval'", // Indispensable pour le moteur JIT de Tailwind CDN
          "https://cdn.tailwindcss.com",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],

        // ✅ AJOUT : Autorise les onclick, oninput, etc. dans le HTML
        // On utilise 'unsafe-inline' pour permettre l'exécution des fonctions comme handleHeroSearch()
        scriptSrcAttr: ["'unsafe-inline'"],

        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Indispensable pour <style type="text/tailwindcss">
          "https://fonts.googleapis.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],

        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https:", // ← autorise toutes les images HTTPS (nécessaire pour NewsData)
          "https://images.unsplash.com",
          "https://plus.unsplash.com",
          "https://*.tile.openstreetmap.org",
          "https://*.tile.openstreetmap.fr",
          "https://*.basemaps.cartocdn.com",
          "https://res.cloudinary.com",
          "https://api.dicebear.com",
          "https://unpkg.com",
        ],

        connectSrc: [
          "'self'",
          "https://*.supabase.co",
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
          "https://api.anthropic.com",
          "https://unpkg.com",
          "https://nominatim.openstreetmap.org",
          "https://overpass-api.de",
          "https://threejs.org",
          "https://api.languagetoolplus.com",
          "https://newsdata.io",
          "https://api.deepseek.com",
        ],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],

        // 🔥 AJOUT CRUCIAL POUR AUDIO
        mediaSrc: ["'self'", "https://*.supabase.co"],

        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);
app.use(compression());
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
// Support sendBeacon (text/plain body)
app.use(express.text({ type: "text/plain", limit: "100kb" }));

const _geocodeCache = new Map();
async function geocodeVille(ville) {
  if (!ville) return null;
  const key = ville.toLowerCase().trim();
  if (_geocodeCache.has(key)) return _geocodeCache.get(key);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ville + ", France")}&format=json&limit=1`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Aigent-Immo/1.0 contact@aigent.fr" },
    });
    const data = await resp.json();
    if (data && data[0]) {
      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
      _geocodeCache.set(key, result);
      return result;
    }
  } catch (e) {
    console.warn("[geocodeVille] Erreur pour", ville, e.message);
  }
  _geocodeCache.set(key, null);
  return null;
}

// ================== SERVIR LES FICHIERS STATIQUES AVANT LE RATE LIMIT ==================
app.use(express.static(path.join(__dirname, "public")));
app.use("/leaflet", express.static(path.join(__dirname, "public/leaflet")));

// ================== RATE LIMIT UNIQUEMENT POUR API ==================
const apiLimiter = rateLimit({ windowMs: 30_000, max: 40 });

// Appliquer le rate limiter uniquement sur les routes API /auth /chat
app.use("/api/", apiLimiter);
app.use("/login", apiLimiter);
app.use("/signup", apiLimiter);
app.use("/chat", apiLimiter);
// ================== DB ==================

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT,
  role TEXT,
  contact TEXT,
  ville TEXT DEFAULT '',
  region TEXT DEFAULT '',
  type TEXT DEFAULT 'appartement',
  price REAL DEFAULT 0,
  pieces INTEGER DEFAULT 1,
  surface REAL DEFAULT 10,
  budget REAL DEFAULT 0,
  budgetmin REAL DEFAULT 0,
  budgetmax REAL DEFAULT 0,
  piecesmin INTEGER DEFAULT 0,
  piecesmax INTEGER DEFAULT 100,
  surfacemin REAL DEFAULT 0,
  surfacemax REAL DEFAULT 1000,
  tolerancekm REAL DEFAULT NULL,
  etatbien TEXT DEFAULT '',
  imagesbien TEXT DEFAULT '[]',
  niveauenergetique TEXT DEFAULT '',
  proximite TEXT DEFAULT '[]',
  avatar TEXT DEFAULT '/images/user-avatar.jpg'
)
`,
  )
  .run();

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`,
  )
  .run();
// Juste après ton bloc CREATE TABLE messages existant :

// Migration : ajout colonne attachments si absente
if (!isProd) {
  try {
    const cols = await db.prepare("PRAGMA table_info(users)").all();
    if (!cols.find((c) => c.name === "proximite")) {
      await db
        .prepare("ALTER TABLE users ADD COLUMN proximite TEXT DEFAULT '[]'")
        .run();
      console.log("✅ Colonne proximite ajoutée à users (SQLite)");
    }
  } catch (err) {
    console.error("[MIGRATION proximite SQLite]", err);
  }
}

if (isProd) {
  try {
    const colCheck = await db
      .prepare(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name='users' AND column_name='proximite'`,
      )
      .all();
    if (!colCheck.length) {
      await db
        .prepare("ALTER TABLE users ADD COLUMN proximite TEXT DEFAULT '[]'")
        .run();
      console.log("✅ Colonne proximite ajoutée à users (PostgreSQL)");
    }
  } catch (err) {
    console.error("[MIGRATION proximite PostgreSQL]", err);
  }
}

await db
  .prepare(
    `
CREATE TABLE IF NOT EXISTS favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`,
  )
  .run();
// ================== MIGRATION : colonne langue + preferences ==================
if (!isProd) {
  try {
    const cols = await db.prepare("PRAGMA table_info(users)").all();
    if (!cols.find((c) => c.name === "langue")) {
      await db
        .prepare("ALTER TABLE users ADD COLUMN langue TEXT DEFAULT 'fr'")
        .run();
      console.log("✅ Colonne langue ajoutée (SQLite)");
    }
    if (!cols.find((c) => c.name === "preferences")) {
      await db
        .prepare("ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'")
        .run();
      console.log("✅ Colonne preferences ajoutée (SQLite)");
    }
  } catch (err) {
    console.error("[MIGRATION langue/preferences SQLite]", err);
  }
}

if (isProd) {
  try {
    const colCheck = await db
      .prepare(
        `SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='langue'`,
      )
      .all();
    if (!colCheck.length) {
      await db
        .prepare("ALTER TABLE users ADD COLUMN langue TEXT DEFAULT 'fr'")
        .run();
      console.log("✅ Colonne langue ajoutée (PostgreSQL)");
    }
    const prefCheck = await db
      .prepare(
        `SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='preferences'`,
      )
      .all();
    if (!prefCheck.length) {
      await db
        .prepare("ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'")
        .run();
      console.log("✅ Colonne preferences ajoutée (PostgreSQL)");
    }
  } catch (err) {
    console.error("[MIGRATION langue/preferences PostgreSQL]", err);
  }
}

// ================== TABLE NOTIFICATIONS ==================
await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    data TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`,
  )
  .run();
// ================== TABLE PROJECTS ==================
await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#8b5cf6',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`,
  )
  .run();

// ================== TABLE PROJECT_CHATS ==================
await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS project_chats (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'Nouvelle conversation',
    messages TEXT DEFAULT '[]',
    criteria TEXT DEFAULT '{}',
    phase TEXT DEFAULT 'collecting',
    last_matches TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`,
  )
  .run();
// ── MIGRATION TABLES (à placer dans la zone DB migrations) ──────────────────

// TABLE 2FA
await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS user_2fa (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    secret TEXT NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    backup_codes TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`,
  )
  .run();

// TABLE WORKSPACE
await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS workspace_members (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'readonly',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_id, member_id)
  )
`,
  )
  .run();

// TABLE AGENDA
await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS agenda_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT DEFAULT '',
    description TEXT DEFAULT '',
    color TEXT DEFAULT '',
    notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`,
  )
  .run();

// COLONNE INTEGRATIONS sur users
if (isProd) {
  try {
    const integCheck = await db
      .prepare(
        `SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='integrations'`,
      )
      .all();
    if (!integCheck.length) {
      await db
        .prepare(`ALTER TABLE users ADD COLUMN integrations TEXT DEFAULT '[]'`)
        .run();
    }
  } catch (e) {
    console.warn("[MIGRATION integrations]", e.message);
  }
} else {
  try {
    const cols = await db.prepare("PRAGMA table_info(users)").all();
    if (!cols.find((c) => c.name === "integrations")) {
      await db
        .prepare("ALTER TABLE users ADD COLUMN integrations TEXT DEFAULT '[]'")
        .run();
    }
  } catch (e) {
    console.warn("[MIGRATION integrations SQLite]", e.message);
  }
}
// TABLE workspace_data (si pas encore créée)
await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS workspace_data (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_id, member_id, type, key)
  )
`,
  )
  .run();
// ── TABLE ARCHIVES ──
await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS archived_conversations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_key TEXT NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, conversation_key)
  )
`,
  )
  .run();

// ── TABLE BLOCAGES ──
await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS blocked_users (
    id SERIAL PRIMARY KEY,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_username TEXT NOT NULL,
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_username)
  )
`,
  )
  .run();
// ================== INIT PROFILS MATCHING EN PROD ==================
console.log(" Initialisation des profils depuis la DB...");

// Reset des arrays pour éviter doublons si reload

// Récupérer tous les utilisateurs avec les infos nécessaires
const allUsers = await db
  .prepare(
    `
SELECT
  u.username,
  u.role,
  u.contact,
  u.ville,
  u.region,
  u.type,
  u.price,
  u.pieces,
  u.surface,
  u.budget,
  u.etatbien          AS "etatBien",
  u.imagesbien        AS "imagesbien",
  u.niveauenergetique AS "niveauEnergetique",
  u.proximite         AS "proximite",
  u.piecesmin         AS "piecesMin",
  u.surfacemin        AS "surfaceMin",
  u.budgetmin         AS "budgetMin",
  u.piecesmax         AS "piecesMax",
  u.surfacemax        AS "surfaceMax",
  u.tolerancekm       AS "toleranceKm",
  u.budgetmax         AS "budgetMax"
FROM users u
`,
  )
  .all();

console.log("🧪 [STEP 1 - DB FETCH] allUsers length =", allUsers.length);
console.log("🧪 roles distribution =", {
  buyers: allUsers.filter((u) => u.role === "buyer").length,
  sellers: allUsers.filter((u) => u.role === "seller").length,
});
console.log(" RAW DB ROW (case sensitive check)");
allUsers.forEach((u) => {
  console.log("➡️ [STEP 2 - RAW USER]", {
    username: u.username,
    role: u.role,
    imagesbien: u.imagesbien,
  });
  console.log({
    username: u.username, // RAW EXACT DB KEYS

    piecesMin_RAW: u.piecesMin,
    piecesmin_RAW: u.piecesmin,

    surfaceMin_RAW: u.surfaceMin,
    surfacemin_RAW: u.surfacemin,

    budgetMin_RAW: u.budgetMin,
    budgetmin_RAW: u.budgetmin,
  });
});
console.log(" CASE INSPECTION USERS TABLE");
console.table(
  allUsers.map((u) => ({
    username: u.username,
    piecesMin: u.piecesMin,
    piecesmin: u.piecesmin,
    surfaceMin: u.surfaceMin,
    surfacemin: u.surfacemin,
    budgetMin: u.budgetMin,
    budgetmin: u.budgetmin,
  })),
);
const brokenUsers = await db
  .prepare(
    `
SELECT * FROM users
`,
  )
  .all();

console.log(" FULL DB DUMP (PROOF BUG)");
console.table(
  brokenUsers.map((u) => ({
    username: u.username, // comparaison directe

    piecesMin: u.piecesMin,
    piecesmin: u.piecesmin,

    surfaceMin: u.surfaceMin,
    surfacemin: u.surfacemin,

    budgetMin: u.budgetMin,
    budgetmin: u.budgetmin,
  })),
);

allUsers.forEach((u) => {
  const profileData = {
    username: u.username,
    contact: u.contact || "",
    role: u.role,
    ville: u.ville || "",
    region: u.region || u.ville || "",
    type: normalize(u.type || "appartement"),
    price: u.price ?? 0,
    pieces: u.pieces > 0 ? u.pieces : 1,
    surface: u.surface > 0 ? u.surface : 10,
    budget: u.budget ?? null,
    budgetMax: u.budgetMax ?? u.budget ?? 0,
    piecesMax: u.piecesMax ?? 999,
    surfaceMax: u.surfaceMax ?? 999,
    piecesMin: u.piecesMin ?? null,
    surfaceMin: u.surfaceMin ?? null,
    budgetMin: u.budgetMin ?? null,
    toleranceKm: u.toleranceKm ?? null,
    etatBien: u.etatBien || "",
    imagesbien: safeImagesParse(u.imagesbien),
    niveauEnergetique: u.niveauEnergetique || "",
    proximite: safeImagesParse(u.proximite), // même helper : parse JSON array
    departement: getDepartement(u.ville),
  };

  if (u.role === "buyer") {
    addBuyer(profileData);
  } else if (u.role === "seller") {
    addSeller(profileData);
  }

  console.log("🧱 [STEP 3 - PROFILE BUILT]", {
    username: profileData.username,
    role: profileData.role,
    imagesbien: profileData.imagesbien,
    piecesMin: profileData.piecesMin,
    surfaceMin: profileData.surfaceMin,
  });
  console.log(" [DB LOAD RAW USER]", u.username, {
    piecesMin: u.piecesMin,
    surfaceMin: u.surfaceMin,
    budgetMin: u.budgetMin,
  });
  console.log(" [PROFILE AFTER LOAD]", profileData.username, {
    piecesMin: profileData.piecesMin,
    surfaceMin: profileData.surfaceMin,
  });
  console.log("🚨 PROFILE DATA:", profileData.etatBien);
});
// ================== DEBUG DB STATE ==================
const debugUsers = await db
  .prepare(
    `
 SELECT username, role, piecesMin, surfaceMin, budgetMin
 FROM users
 `,
  )
  .all();

console.log(" [DB DEBUG STATE USERS]");
console.table(debugUsers);
// ================== INIT FAVORITES ==================
const allFavorites = await db
  .prepare(
    `
SELECT f.id, f.user_id, f.profile_data, u.username AS ownerUsername
 FROM favorites f
 JOIN users u ON f.user_id = u.id
`,
  )
  .all();

allFavorites.forEach((fav) => {
  try {
    fav.parsedData = JSON.parse(fav.profile_data);
  } catch (err) {
    console.warn(`[INIT FAVORITES] JSON invalide pour favorite ${fav.id}`);
    fav.parsedData = {};
  }
});

// ================== INIT MESSAGES ==================
const allMessages = await db
  .prepare(
    `
 SELECT m.id, m.sender_id, m.receiver_id, m.subject, m.body, m.timestamp,
su.username AS senderUsername, ru.username AS receiverUsername
FROM messages m
JOIN users su ON m.sender_id = su.id
 JOIN users ru ON m.receiver_id = ru.id
`,
  )
  .all();

console.log(
  ` Initialisation terminée : ${BUYERS.length} buyers, ${SELLERS.length} sellers`,
);
console.log(
  ` Messages récupérés : ${allMessages.length}, favoris : ${allFavorites.length}`,
);

// ================== AUTH ==================
const generateToken = (user) =>
  jwt.sign(
    { username: user.username, role: user.role, contact: user.contact || "" },
    JWT_SECRET,
    { expiresIn: "2h" },
  );

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ================== UPSERT PROFILE ==================
async function upsertProfile(user, normalized) {
  console.log(
    "🔧 [WRITE PRE-DB] normalized snapshot:",
    JSON.stringify(normalized, null, 2),
  );

  const { username, contact = "", role } = user;

  // ─── Sérialisation proximite ──────────────────────────────────────
  const proximiteJSON = JSON.stringify(
    Array.isArray(normalized.proximite) ? normalized.proximite : [],
  );

  const profileData = {
    username,
    contact,
    role,
    type: normalized.type || "",
    ville: normalized.ville || "",
    region: normalized.region || normalized.ville || "",

    // SELLER
    price:
      role === "seller" ? (normalized.price ?? normalized.budgetMin ?? 0) : 0,
    pieces:
      role === "seller"
        ? (normalized.pieces ?? normalized.piecesMin ?? null)
        : 0,
    surface:
      role === "seller"
        ? (normalized.surface ?? normalized.surfaceMin ?? null)
        : 0,
    etatBien: normalized.etatBien ?? null,
    imagesbien: normalized.imagesbien ?? null,
    niveauEnergetique:
      role === "seller" ? (normalized.niveauEnergetique ?? null) : null,

    // BUYER
    budget: role === "buyer" ? (normalized.budgetMin ?? null) : 0,
    budgetMin: role === "buyer" ? (normalized.budgetMin ?? null) : 0,
    budgetMax: role === "buyer" ? (normalized.budgetMax ?? null) : 0,
    piecesMax: role === "buyer" ? (normalized.piecesMax ?? 999) : 0,
    piecesMin: role === "buyer" ? (normalized.piecesMin ?? null) : null,
    surfaceMin: role === "buyer" ? (normalized.surfaceMin ?? null) : null,
    surfaceMax: role === "buyer" ? (normalized.surfaceMax ?? 999) : 0,
    toleranceKm: role === "buyer" ? (normalized.toleranceKm ?? null) : null,

    // COMMUN
    proximite: Array.isArray(normalized.proximite) ? normalized.proximite : [],
  };

  console.log(
    "🔧 UPSERT FINAL — etatbien:",
    profileData.etatBien,
    "| proximite:",
    profileData.proximite,
  );

  // ─── Mise à jour en mémoire ────────────────────────────────────────
  if (role === "buyer") {
    const existingIndex = BUYERS.findIndex((b) => b.username === username);
    const fullBuyer = {
      id: existingIndex >= 0 ? BUYERS[existingIndex].id : Date.now(),
      ...profileData,
      preferences:
        existingIndex >= 0
          ? BUYERS[existingIndex].preferences
          : { typeWeights: {}, regionWeights: {} },
    };
    if (existingIndex >= 0) BUYERS[existingIndex] = fullBuyer;
    else BUYERS.push(fullBuyer);
  }

  if (role === "seller") {
    const existingIndex = SELLERS.findIndex((s) => s.username === username);
    const fullSeller = {
      id: existingIndex >= 0 ? SELLERS[existingIndex].id : Date.now(),
      ...profileData,
    };
    if (existingIndex >= 0) SELLERS[existingIndex] = fullSeller;
    else SELLERS.push(fullSeller);
  }

  // ─── Écriture DB directe (colonnes spéciales) ─────────────────────
  await db
    .prepare(
      `UPDATE users
       SET etatbien = ?, imagesbien = ?, niveauenergetique = ?, proximite = ?
       WHERE username = ?`,
    )
    .run(
      profileData.etatBien,
      JSON.stringify(profileData.imagesbien || []),
      profileData.niveauEnergetique ?? null,
      proximiteJSON,
      username,
    );

  console.log("✅ DIRECT UPDATE etatbien + proximite DONE");

  // ─── Upsert complet PostgreSQL prod ───────────────────────────────
  if (process.env.NODE_ENV === "production") {
    await db.prepare().upsert(
      "users",
      {
        username,
        role,
        contact: profileData.contact,
        type: profileData.type,
        ville: profileData.ville,
        region: profileData.region,
        price: profileData.price,
        pieces: profileData.pieces,
        surface: profileData.surface,
        budgetmin: profileData.budgetMin,
        budgetmax: profileData.budgetMax,
        piecesmin: profileData.piecesMin,
        piecesmax: profileData.piecesMax,
        surfacemin: profileData.surfaceMin,
        surfacemax: profileData.surfaceMax,
        tolerancekm: profileData.toleranceKm,
        etatbien: profileData.etatBien,
        imagesbien: JSON.stringify(profileData.imagesbien || []),
        niveauenergetique: profileData.niveauEnergetique ?? null,
        proximite: proximiteJSON,
      },
      "username",
      [
        "role",
        "contact",
        "type",
        "ville",
        "region",
        "price",
        "pieces",
        "surface",
        "budgetmin",
        "budgetmax",
        "piecesmin",
        "piecesmax",
        "surfacemin",
        "surfacemax",
        "tolerancekm",
        "etatbien",
        "imagesbien",
        "niveauenergetique",
        "proximite",
      ],
    );
  }

  console.log("✅ FINAL DB WRITE:", {
    etatbien: profileData.etatBien,
    piecesmin: profileData.piecesMin,
    surfacemin: profileData.surfaceMin,
    proximite: profileData.proximite,
  });

  return profileData;
} // ================== IMPORT AI CHAT ==================

// APRÈS
import {
  aiChatWithCriteria,
  detectResultsIntent,
  generateContactMessage,
  aiResultsChat, // ← AJOUT
} from "./services/aiParsee.js";
// ================== CHAT SYSTEM ==================
const sessions = {};

// ================== QUEUE RATE-LIMIT ==================
const QUEUE = [];
let processing = false;

function getIntervalByUsers() {
  const activeUsers = Object.keys(sessions).length;
  if (activeUsers === 0) return 1000;
  return Math.max(1000, 60000 / activeUsers);
}

async function processQueue() {
  if (processing || QUEUE.length === 0) return;
  processing = true;
  while (QUEUE.length > 0) {
    const { next } = QUEUE.shift();
    await next();
    const interval = getIntervalByUsers();
    await new Promise((r) => setTimeout(r, interval));
  }
  processing = false;
}

function userQueueMiddleware(req, res, next) {
  QUEUE.push({ req, res, next });
  processQueue();
}

// ================== HELPERS NORMALISATION ==================
function normalizePieces(criteria = {}, mode = "min") {
  const raw =
    mode === "max"
      ? (criteria.piecesMax ?? criteria.pieces ?? criteria.rooms)
      : (criteria.piecesMin ?? criteria.pieces ?? criteria.rooms);
  const val = raw == null ? null : Number(String(raw).replace(/[^\d.-]/g, ""));
  return Number.isFinite(val) ? val : null;
}

function normalizeSurface(criteria = {}) {
  const raw = criteria.surfaceMin ?? criteria.espaceMin ?? null;
  const val = raw == null ? null : Number(String(raw).replace(/[^\d.-]/g, ""));
  return isNaN(val) ? null : val;
}

function buildNormalized(criteria, role) {
  const piecesMin = normalizePieces(criteria, "min");
  const surfaceMin = normalizeSurface(criteria);
  const budgetMin = criteria.budgetMin != null ? Number(criteria.budgetMin) : 0;

  // ── VENDEUR : valeur unique → min = max (prix fixe, pièces fixes, surface fixe)
  if (role === "seller") {
    const piecesMax =
      normalizePieces(criteria, "max") ?? (piecesMin != null ? piecesMin : 999);
    const surfaceMax =
      criteria.surfaceMax != null
        ? Number(criteria.surfaceMax)
        : surfaceMin != null
          ? surfaceMin
          : 9999;
    const budgetMax =
      criteria.budgetMax != null ? Number(criteria.budgetMax) : budgetMin;

    return {
      type: criteria.type ? normalize(criteria.type) : "",
      ville: criteria.ville || "",
      budgetMin,
      budgetMax,
      piecesMin,
      piecesMax,
      surfaceMin,
      surfaceMax,
      toleranceKm:
        criteria.toleranceKm != null ? Number(criteria.toleranceKm) : null,
      proximite: Array.isArray(criteria.proximite) ? criteria.proximite : [],
      price: budgetMin,
      pieces: piecesMin,
      surface: surfaceMin,
      etatBien: criteria.etatBien || null,
      niveauEnergetique: criteria.niveauEnergetique || null,
      imagesbien: Array.isArray(criteria.imagesbien) ? criteria.imagesbien : [],
    };
  }

  // ── ACHETEUR : surfaceMax et piecesMax restent ouverts si non fournis explicitement
  // "surface min 50m²" → surfaceMin=50, surfaceMax=9999 (pas de plafond)
  // "entre 50 et 80m²" → surfaceMin=50, surfaceMax=80
  const piecesMax =
    criteria.piecesMax != null ? Number(criteria.piecesMax) : 999; // pas de plafond si non fourni
  const surfaceMax =
    criteria.surfaceMax != null ? Number(criteria.surfaceMax) : 9999; // pas de plafond si non fourni
  const budgetMax =
    criteria.budgetMax != null
      ? Number(criteria.budgetMax)
      : budgetMin > 0
        ? budgetMin * 1.2
        : 0; // légère marge si valeur unique
  const toleranceKm =
    criteria.toleranceKm != null ? Number(criteria.toleranceKm) : null;

  return {
    type: criteria.type ? normalize(criteria.type) : "",
    ville: criteria.ville || "",
    budgetMin,
    budgetMax,
    piecesMin,
    piecesMax,
    surfaceMin,
    surfaceMax,
    toleranceKm,
    proximite: Array.isArray(criteria.proximite) ? criteria.proximite : [],
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   computeSellerTriggerContext
   Calcule CE QUE L'IA DOIT DIRE dans CE message pour le vendeur.
   Appelé AVANT l'appel IA, sur l'état des critères APRÈS merge.
 
   Retourne une string qui sera passée à aiParsee via context.triggerContext.
   null = collecte normale du tunnel (pas de situation spéciale).
══════════════════════════════════════════════════════════════════════════ */
function computeSellerTriggerContext(sc, villeJustReceived) {
  // La ville vient d'être reçue dans CE message → on va ouvrir le pop-up proximite
  if (villeJustReceived && sc.ville && !Array.isArray(sc.proximite)) {
    return "proximite_about_to_trigger";
  }

  // Les commodités viennent d'être reçues (injection pop-up) → reprendre tunnel
  if (Array.isArray(sc.proximite) && sc.proximite.length >= 0) {
    // Vérifier si le tunnel est encore incomplet
    const tunnelIncomplete =
      !sc.type ||
      !sc.piecesMin ||
      sc.piecesMin <= 0 ||
      !sc.surfaceMin ||
      sc.surfaceMin <= 0 ||
      !sc.budgetMin ||
      sc.budgetMin <= 0;

    // Ce contexte est actif uniquement pour les messages internes __PROXIMITE_SELECTED__
    // Le serveur le gère directement ci-dessous
  }

  // Tunnel complet, pas encore d'etatBien → pop-up état du bien va s'ouvrir
  const tunnelComplete =
    sc.ville &&
    sc.type &&
    sc.piecesMin > 0 &&
    sc.surfaceMin > 0 &&
    sc.budgetMin > 0 &&
    Array.isArray(sc.proximite);

  if (tunnelComplete && (!sc.etatBien || !sc.etatBien.trim())) {
    return "etat_about_to_trigger";
  }

  // etatBien reçu, pas de DPE → pop-up DPE va s'ouvrir
  if (
    sc.etatBien?.trim() &&
    (!sc.niveauEnergetique || !sc.niveauEnergetique.trim())
  ) {
    return "dpe_about_to_trigger";
  }

  // DPE reçu, pas d'images → pop-up photos va s'ouvrir
  if (
    sc.etatBien?.trim() &&
    sc.niveauEnergetique?.trim() &&
    !Array.isArray(sc.imagesbien)
  ) {
    return "images_about_to_trigger";
  }

  return null; // collecte normale
}

// ================== CHAT ROUTE ==================
app.post("/chat", authenticateToken, userQueueMiddleware, async (req, res) => {
  try {
    const { message } = z
      .object({ message: z.string().min(1) })
      .parse(req.body);

    const username = req.user.username;
    const userRole = req.user.role;

    // ── Init session ────────────────────────────────────────────────
    if (!sessions[username]) {
      sessions[username] = {
        started: false,
        criteria: {},
        role: userRole,
        phase: "collecting",
        matches: [],
      };
    }
    const session = sessions[username];
    session.role = userRole;

    // ── 1. Snapshot "avant" pour détecter ce qui vient de changer ──
    const villeAvant = session.criteria.ville || null;

    // ── 2. Injections directes depuis les pop-ups (AVANT l'appel IA) ─
    // Ces valeurs arrivent via req.body et sont injectées AVANT l'IA
    // pour que l'IA les voie dans existingCriteria et confirme naturellement
    let internalMessage = message; // message __INTERNAL__ ou message normal

    if (req.body.proximite !== undefined) {
      session.criteria.proximite = Array.isArray(req.body.proximite)
        ? req.body.proximite
        : [];
    }
    if (req.body.etatBien !== undefined) {
      session.criteria.etatBien = req.body.etatBien;
    }
    if (req.body.niveauEnergetique !== undefined) {
      session.criteria.niveauEnergetique = req.body.niveauEnergetique;
    }
    if (Array.isArray(req.body.imagesbien)) {
      session.criteria.imagesbien = req.body.imagesbien;
    }
    if (req.body.skipImages === true) {
      session.criteria.imagesbien = [];
    }

    // ── 3. Calcul triggerContext PROVISOIRE (avant merge IA) ──────────
    // On le calcule sur l'état actuel pour les messages internes
    let triggerContext = null;

    // Pour les messages internes post pop-up, on sait déjà quel contexte
    if (message === "__PROXIMITE_SELECTED__") triggerContext = "post_proximite";
    else if (message === "__ETAT_SELECTED__")
      triggerContext = "dpe_about_to_trigger";
    else if (message === "__NIVEAU_ENERGETIQUE_SELECTED__")
      triggerContext = "images_about_to_trigger";
    // ── PRÉ-NORMALISATION buyer AVANT appel IA ──────────────────────────
    // Forcer les max ouverts AVANT l'IA pour qu'elle ne redemande pas
    if (userRole === "buyer") {
      if (
        session.criteria.piecesMin != null &&
        session.criteria.piecesMax == null
      )
        session.criteria.piecesMax = 999;
      if (
        session.criteria.surfaceMin != null &&
        session.criteria.surfaceMax == null
      )
        session.criteria.surfaceMax = 9999;
      if (
        session.criteria.budgetMin != null &&
        session.criteria.budgetMax == null
      )
        session.criteria.budgetMax = session.criteria.budgetMin;
    }

    // ── 4. Appel IA — avec context.triggerContext provisoire ──────────
    let aiResponse = { message: "", criteria: { ...session.criteria } };

    try {
      aiResponse = await aiChatWithCriteria(message, session.criteria, {
        phase: session.phase,
        matchingProfiles: session.matches,
        role: userRole,
        triggerContext, // peut être null pour les messages utilisateur normaux
      });
      console.log("🤖 [AI RESPONSE]", JSON.stringify(aiResponse, null, 2));
    } catch (e) {
      console.error("[CHAT] Erreur AI:", e);
      aiResponse = {
        message: "Désolé, une erreur est survenue. Pouvez-vous reformuler ?",
        criteria: session.criteria,
      };
    }

    // ── 5. Merge critères ─────────────────────────────────────────────
    const POPUP_PROTECTED = new Set([
      "proximite",
      "etatBien",
      "niveauEnergetique",
      "imagesbien",
    ]);

    const incoming = aiResponse.criteria || {};
    for (const [key, val] of Object.entries(incoming)) {
      if (POPUP_PROTECTED.has(key) && session.criteria[key] !== undefined)
        continue;
      if (val !== null && val !== undefined) session.criteria[key] = val;
    }
    session.criteria.intent = userRole;

    const sc = session.criteria;

    if (userRole === "seller") {
      for (const [mn, mx] of [
        ["budgetMin", "budgetMax"],
        ["piecesMin", "piecesMax"],
        ["surfaceMin", "surfaceMax"],
      ]) {
        if (sc[mn] != null && sc[mx] == null) sc[mx] = sc[mn];
        if (sc[mx] != null && sc[mn] == null) sc[mn] = sc[mx];
      }
    }

    // Buyer : si piecesMin connu, forcer piecesMax à 999 pour éviter que l'IA
    // redemande le maximum (qui est ouvert par défaut)
    if (userRole === "buyer") {
      if (sc.piecesMin != null && sc.piecesMax == null) sc.piecesMax = 999;
      if (sc.surfaceMin != null && sc.surfaceMax == null) sc.surfaceMax = 9999;
      if (sc.budgetMin != null && sc.budgetMax == null)
        sc.budgetMax = sc.budgetMin;
    }
    console.log("🔀 AFTER MERGE:", sc);

    // ── 6. La ville vient-elle d'apparaître dans CE message ? ─────────
    // On compare avant/après merge pour détecter si c'est CE message qui l'a fournie
    const villeJustReceived = !villeAvant && !!sc.ville;

    // ── 7. Si message utilisateur normal et vendeur → recalcul triggerContext
    // après merge (on a maintenant l'état complet et à jour)
    let finalTriggerContext = triggerContext; // déjà fixé pour les messages internes
    if (!message.startsWith("__") && userRole === "seller") {
      finalTriggerContext = computeSellerTriggerContext(sc, villeJustReceived);
    }

    console.log("🎯 TRIGGER CONTEXT:", finalTriggerContext);

    // ── 8. Si le triggerContext a changé par rapport à ce qu'on avait passé à l'IA,
    // et que l'IA n'avait pas le bon contexte, on relance avec le bon contexte.
    // Cas principal : message utilisateur normal → ville reçue → l'IA doit annoncer proximite
    // mais on ne le savait pas avant le merge.
    let reply = aiResponse.message || "";

    if (
      !message.startsWith("__") &&
      userRole === "seller" &&
      finalTriggerContext !== triggerContext &&
      finalTriggerContext !== null
    ) {
      // L'IA a répondu sans connaître le triggerContext → on relance
      console.log("🔁 RELANCE IA avec triggerContext:", finalTriggerContext);
      try {
        const aiResponse2 = await aiChatWithCriteria(message, sc, {
          phase: session.phase,
          matchingProfiles: session.matches,
          role: userRole,
          triggerContext: finalTriggerContext,
        });
        if (aiResponse2.message) reply = aiResponse2.message;
        // On ne merge plus les critères (déjà mergés, risque de régression)
      } catch (e) {
        console.error("[CHAT] Erreur AI relance:", e);
      }
    }

    if (!session.started) session.started = true;

    // ════════════════════════════════════════════════════════════════
    // PHASE COLLECTING
    // ════════════════════════════════════════════════════════════════
    if (session.phase === "collecting") {
      const missingVille = !sc.ville;
      const missingType = !sc.type;

      // BUYER
      const missingTolerance =
        userRole === "buyer" && sc.ville && sc.toleranceKm == null;
      const missingBudget =
        userRole === "buyer" && sc.budgetMin == null && sc.budgetMax == null;
      const missingSurface = userRole === "buyer" && sc.surfaceMin == null;
      const missingPieces = userRole === "buyer" && sc.piecesMin == null;

      // SELLER
      // proximite manquant = ville connue mais pas encore array (pop-up pas encore passé)
      const missingProximite =
        userRole === "seller" && sc.ville && !Array.isArray(sc.proximite);
      const missingSellerPieces =
        userRole === "seller" && (sc.piecesMin == null || sc.piecesMin <= 0);
      const missingSellerSurf =
        userRole === "seller" && (sc.surfaceMin == null || sc.surfaceMin <= 0);
      const missingSellerBudget =
        userRole === "seller" && (sc.budgetMin == null || sc.budgetMin <= 0);
      const missingEtatBien = userRole === "seller" && !sc.etatBien?.trim();
      const missingDPE =
        userRole === "seller" &&
        sc.etatBien?.trim() &&
        !sc.niveauEnergetique?.trim();
      const missingImages =
        userRole === "seller" &&
        sc.etatBien?.trim() &&
        sc.niveauEnergetique?.trim() &&
        !Array.isArray(sc.imagesbien);

      console.log("🚨 MISSING CHECK:", {
        missingVille,
        missingType,
        ...(userRole === "seller"
          ? {
              missingProximite,
              missingSellerPieces,
              missingSellerSurf,
              missingSellerBudget,
              missingEtatBien,
              missingDPE,
              missingImages,
            }
          : { missingTolerance, missingBudget, missingSurface, missingPieces }),
      });

      // VENDEUR : pop-up proximite — déclenché dès que la ville est connue
      if (missingProximite) {
        return res.json({ reply, triggerProximitePopup: true, criteria: sc });
      }

      // Critères texte encore manquants
      const stillMissing =
        missingVille ||
        missingType ||
        missingTolerance ||
        missingBudget ||
        missingSurface ||
        missingPieces ||
        missingSellerPieces ||
        missingSellerSurf ||
        missingSellerBudget;

      if (stillMissing) {
        return res.json({ reply, criteria: sc });
      }

      // VENDEUR : pop-ups qualité dans l'ordre strict
      if (missingEtatBien) {
        return res.json({ reply, triggerEtatBienPopup: true, criteria: sc });
      }
      if (missingDPE) {
        return res.json({
          reply,
          triggerNiveauEnergetiquePopup: true,
          criteria: sc,
        });
      }
      if (missingImages) {
        return res.json({ reply, triggerImagesPopup: true, criteria: sc });
      }

      // MATCHING — tous critères complets
      const normalized = buildNormalized(sc, userRole);
      console.log("🔧 [PRE-MATCHING]", JSON.stringify(normalized, null, 2));

      let profile,
        matches = [];
      try {
        if (userRole === "buyer") {
          profile = await addBuyer({ username, ...normalized });
          matches = matchUsers(profile, 5);

          // Géocodage : coordonnées de la ville du buyer (= "nous")
          const buyerCoords = await geocodeVille(normalized.ville);

          // ✅ FIX CARTE : on envoie les coords buyer explicitement au front
          const buyerLatFinal = buyerCoords?.lat ?? 48.8566;
          const buyerLngFinal = buyerCoords?.lng ?? 2.3522;

          matches = await Promise.all(
            matches.map(async (m) => {
              const matchCoords = await geocodeVille(m.ville);
              return {
                ...m,
                // lat/lng = coordonnées du BIEN (marker rose 🏠)
                lat: matchCoords?.lat ?? 48.8566,
                lng: matchCoords?.lng ?? 2.3522,
                // buyerLat/buyerLng = coordonnées de L'ACHETEUR (marker bleu 📍)
                buyerLat: buyerLatFinal,
                buyerLng: buyerLngFinal,
              };
            }),
          );
        } else {
          profile = await addSeller({
            username,
            type: normalized.type || "appartement",
            ville: normalized.ville || "",
            price: normalized.budgetMin,
            pieces: normalized.piecesMin,
            surface: normalized.surfaceMin,
            etatBien: normalized.etatBien,
            imagesbien: normalized.imagesbien,
            niveauEnergetique: normalized.niveauEnergetique,
            proximite: normalized.proximite,
            contact: req.user.contact || "",
          });
          matches = matchSellerToBuyers(profile, 5);

          // Coordonnées du BIEN du vendeur (marker rose 🏠)
          const sellerCoords = await geocodeVille(normalized.ville);
          const sellerLatFinal = sellerCoords?.lat ?? 48.8566;
          const sellerLngFinal = sellerCoords?.lng ?? 2.3522;

          matches = await Promise.all(
            matches.map(async (m) => {
              // Coordonnées de L'ACHETEUR matché (marker bleu 📍)
              const buyerCoords = await geocodeVille(m.ville);
              return {
                ...m,
                // lat/lng = coordonnées du BIEN vendeur (notre bien, marker rose)
                lat: sellerLatFinal,
                lng: sellerLngFinal,
                // buyerLat/buyerLng = coordonnées de l'acheteur matché (marker bleu)
                buyerLat: buyerCoords?.lat ?? 48.8566,
                buyerLng: buyerCoords?.lng ?? 2.3522,
              };
            }),
          );
        }

        matches.forEach((m) => learnPreference(profile, m));
      } catch (e) {
        console.error("[MATCHING ERROR]:", e);
      }

      try {
        await upsertProfile(
          { username, role: userRole, contact: req.user.contact },
          normalized,
        );
      } catch (e) {
        console.error("[DB UPSERT ERROR]:", e);
      }

      session.matches = matches;
      // Notifier les vendeurs matchés (si préf notif-matches activée)
      try {
        for (const m of matches.slice(0, 3)) {
          const matchedUser = await db
            .prepare(
              `SELECT id, preferences FROM users WHERE LOWER(TRIM(username)) = $1`,
            )
            .get((m.username || "").trim().toLowerCase());
          if (!matchedUser) continue;
          let prefs = {};
          try {
            prefs = JSON.parse(matchedUser.preferences || "{}");
          } catch {}
          if (prefs["notif-matches"] !== false) {
            await db
              .prepare(
                `INSERT INTO notifications (user_id, type, title, body, data, read)
     VALUES ($1, $2, $3, $4, $5, false)`,
              )
              .run(
                matchedUser.id,
                "match",
                "Nouveau profil compatible",
                `Un ${userRole === "buyer" ? "acheteur" : "vendeur"} compatible à ${m.ville} — ${m.compatibility}% de compatibilité.`,
                JSON.stringify({
                  compatibility: m.compatibility,
                  ville: m.ville,
                }),
              );
          }
        }
      } catch (e) {
        console.warn("[NOTIF match]", e.message);
      }
      session.phase = "results";

      // Remplace ce bloc dans la phase collecting, après le matching :
      let postReply =
        "Souhaitez-vous que je vous aide à comparer ces profils ?";
      try {
        const postAI = await aiChatWithCriteria(
          matches.length === 0 ? "__NO_RESULTS__" : "__POST_RESULTS__", // ← ICI
          sc,
          {
            phase: "results",
            matchingProfiles: matches,
            role: userRole,
          },
        );
        if (postAI.message) postReply = postAI.message;
      } catch (e) {
        console.error("[POST RESULTS AI]:", e);
      }

      // APRÈS
      return res.json({
        reply,
        matches,
        postReply,
        matchingDone: true, // ← signal explicite que le tunnel est terminé
        triggerImagesPopup: false,
        triggerProximitePopup: false,
        triggerEtatBienPopup: false,
        triggerNiveauEnergetiquePopup: false,
        criteria: sc,
      });
    }

    // ════════════════════════════════════════════════════════════════
    // PHASE RESULTS
    // ════════════════════════════════════════════════════════════════
    // APRÈS — phase results : ajouter matchingDone pour que le front sache ne pas re-tunneliser
    if (session.phase === "results") {
      const intent = detectResultsIntent(message);

      // ── Action : l'utilisateur a sélectionné un profil à contacter ──────────
      if (message.startsWith("__ACTION_CONTACT__:")) {
        const matchIndex = parseInt(message.split(":")[1], 10);
        const targetMatch = (session.matches || [])[matchIndex];

        if (!targetMatch || !targetMatch.contact) {
          return res.json({
            reply:
              "Je n'ai pas pu identifier ce profil. Pouvez-vous préciser lequel vous intéresse parmi les résultats affichés ?",
            matches: session.matches,
            matchingDone: true,
            criteria: sc,
            actionType: "contact_failed",
          });
        }

        // Générer le message de mise en relation via IA
        let contactBody = "";
        try {
          contactBody = await generateContactMessage(userRole, sc, targetMatch);
        } catch (e) {
          contactBody = `Bonjour,\n\nJe suis intéressé(e) par votre profil sur Aigent Immo et souhaiterais échanger avec vous.\n\nCordialement.`;
        }

        // Trouver l'expéditeur (l'utilisateur connecté)
        const sender = await db
          .prepare(
            `SELECT id, username, contact FROM users WHERE LOWER(TRIM(username)) = $1`,
          )
          .get(username.trim().toLowerCase());

        // Trouver le destinataire par son email de contact
        const receiver = await db
          .prepare(
            `SELECT id, username, contact FROM users WHERE LOWER(TRIM(contact)) = $1`,
          )
          .get((targetMatch.contact || "").trim().toLowerCase());

        let messageSent = false;
        let messageId = null;

        if (sender && receiver) {
          try {
            const subject =
              userRole === "buyer"
                ? `Intérêt pour votre bien — ${targetMatch.type || "bien"} à ${targetMatch.ville}`
                : `Acheteur potentiel pour votre recherche à ${targetMatch.ville}`;

            const insert = await db
              .prepare(
                `INSERT INTO messages (sender_id, receiver_id, subject, body, attachments)
           VALUES ($1, $2, $3, $4, '[]') RETURNING id`,
              )
              .get(sender.id, receiver.id, subject, contactBody);

            messageId = insert?.id || null;
            messageSent = true;
          } catch (e) {
            console.error("[CONTACT ACTION] DB insert failed:", e);
          }
        }

        // Réponse IA confirmant l'action
        const confirmMsg = messageSent
          ? `Message envoyé à ${receiver?.username || targetMatch.contact} — ${targetMatch.ville}, ${targetMatch.compatibility}% de compatibilité. Ils recevront votre demande dans leur messagerie. Souhaitez-vous contacter un autre profil ou analyser vos résultats plus en détail ?`
          : `Je n'ai pas pu trouver ce contact dans notre base. Essayez via la messagerie directement avec l'adresse : ${targetMatch.contact}`;

        return res.json({
          reply: confirmMsg,
          matches: session.matches,
          matchingDone: true,
          criteria: sc,
          actionType: "contact_done",
          messageSent,
          messageId,
        });
      }

      // ── Action : relaunch matching après modification critères ───────────────
      if (message.startsWith("__RELAUNCH_MATCHING__")) {
        // Le serveur re-exécute le matching avec les critères mis à jour
        // (les nouveaux critères ont été mergés dans sc via les messages précédents)
        const normalized = buildNormalized(sc, userRole);
        let profile,
          matches = [];

        try {
          if (userRole === "buyer") {
            profile = await addBuyer({ username, ...normalized });
            matches = matchUsers(profile, 5);
            const buyerCoords = await geocodeVille(normalized.ville);
            const buyerLatFinal = buyerCoords?.lat ?? 48.8566;
            const buyerLngFinal = buyerCoords?.lng ?? 2.3522;

            matches = await Promise.all(
              matches.map(async (m) => {
                const matchCoords = await geocodeVille(m.ville);
                return {
                  ...m,
                  lat: matchCoords?.lat ?? 48.8566,
                  lng: matchCoords?.lng ?? 2.3522,
                  buyerLat: buyerLatFinal,
                  buyerLng: buyerLngFinal,
                };
              }),
            );
          } else {
            profile = await addSeller({
              username,
              type: normalized.type || "appartement",
              ville: normalized.ville || "",
              price: normalized.budgetMin,
              pieces: normalized.piecesMin,
              surface: normalized.surfaceMin,
              etatBien: normalized.etatBien,
              imagesbien: normalized.imagesbien,
              niveauEnergetique: normalized.niveauEnergetique,
              proximite: normalized.proximite,
              contact: req.user.contact || "",
            });
            matches = matchSellerToBuyers(profile, 5);
            const sellerCoords = await geocodeVille(normalized.ville);
            const sellerLatFinal = sellerCoords?.lat ?? 48.8566;
            const sellerLngFinal = sellerCoords?.lng ?? 2.3522;

            matches = await Promise.all(
              matches.map(async (m) => {
                const buyerCoords = await geocodeVille(m.ville);
                return {
                  ...m,
                  lat: sellerLatFinal,
                  lng: sellerLngFinal,
                  buyerLat: buyerCoords?.lat ?? 48.8566,
                  buyerLng: buyerCoords?.lng ?? 2.3522,
                };
              }),
            );
          }

          matches.forEach((m) => learnPreference(profile, m));
          await upsertProfile(
            { username, role: userRole, contact: req.user.contact },
            normalized,
          );

          session.matches = matches;
        } catch (e) {
          console.error("[RELAUNCH MATCHING ERROR]:", e);
        }

        // Intro results après relaunch
        let relaunchIntro = {
          message: `Voici vos nouveaux résultats avec les critères mis à jour.`,
        };
        try {
          relaunchIntro = await aiResultsChat("__POST_RESULTS__", sc, {
            phase: "results",
            matchingProfiles: matches,
            role: userRole,
          });
        } catch (e) {
          /* silent */
        }

        return res.json({
          reply: relaunchIntro.message,
          matches,
          postReply: relaunchIntro.message,
          matchingDone: true,
          criteria: sc,
          actionType: "relaunch_done",
        });
      }

      // ── Merge éventuel des nouveaux critères si l'utilisateur modifie ────────
      // (L'IA peut retourner des critères modifiés dans ses réponses results)
      // On parse d'abord l'intention pour savoir si on doit merger et relancer
      if (intent === "modify_criteria") {
        // L'IA va demander ce qu'il veut changer — on reste en results
        // mais on écoute les messages suivants pour merger les nouveaux critères
        session.modifyingCriteria = true;
      }

      // Si on est en mode modification et que l'utilisateur vient de donner de nouveaux critères
      if (session.modifyingCriteria && intent !== "modify_criteria") {
        // Merger via aiChatWithCriteria (le parsing léger)
        try {
          const parseResult = await aiChatWithCriteria(message, sc, {
            phase: "collecting",
            role: userRole,
            triggerContext: "silent_parse", // contexte silencieux : on parse sans poser de question
          });

          if (parseResult.criteria) {
            const incoming = parseResult.criteria;
            const PROTECTED = new Set([
              "proximite",
              "etatBien",
              "niveauEnergetique",
              "imagesbien",
            ]);
            for (const [key, val] of Object.entries(incoming)) {
              if (PROTECTED.has(key) && sc[key] !== undefined) continue;
              if (val !== null && val !== undefined) sc[key] = val;
            }
            session.criteria = sc;
          }
        } catch (e) {
          /* silent */
        }

        // Vérifier si on a assez de critères pour relancer
        const hasEnoughToRelaunch =
          sc.ville &&
          sc.type &&
          (userRole === "buyer"
            ? sc.budgetMax != null && sc.surfaceMin != null
            : sc.budgetMin != null && sc.surfaceMin != null);

        if (hasEnoughToRelaunch) {
          session.modifyingCriteria = false;
          // Signaler au front de relancer
          return res.json({
            reply:
              "Vos critères ont été mis à jour. Je relance la recherche...",
            matches: session.matches,
            matchingDone: true,
            criteria: sc,
            actionType: "criteria_updated_relaunch",
          });
        }
      }

      // ── Appel IA results standard ─────────────────────────────────────────────
      let resultsAI = {
        message: "Je suis à votre disposition.",
        intent: "general",
      };
      try {
        resultsAI = await aiResultsChat(message, sc, {
          phase: "results",
          matchingProfiles: session.matches,
          role: userRole,
        });
      } catch (e) {
        console.error("[RESULTS AI]:", e);
      }

      return res.json({
        reply: resultsAI.message || "",
        postReply: resultsAI.message || "",
        matches: session.matches,
        matchingDone: true,
        criteria: sc,
        actionType: resultsAI.intent || "general",
      });
    }

    return res.json({ reply, criteria: sc });
  } catch (err) {
    console.error("[CHAT] ERREUR INATTENDUE:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== CLOUDINARY CONFIG ==================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ================== MULTER (memory) ==================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ================== ROUTE UPLOAD IMAGES ==================
app.post(
  "/api/upload-imagesbien",
  authenticateToken,
  upload.array("images", 3),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "Aucune image reçue" });
      }

      // Upload parallèle vers Cloudinary
      const images = await Promise.all(
        req.files.map(
          (file) =>
            new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                {
                  folder: "imagesbien",
                },
                (error, result) => {
                  if (error) return reject(error);
                  resolve(result.secure_url);
                },
              );

              stream.end(file.buffer);
            }),
        ),
      );

      return res.json({
        success: true,
        images, // tableau d’URLs Cloudinary
      });
    } catch (err) {
      console.error("[UPLOAD IMAGES BIEN ERROR]", err);
      return res.status(500).json({ error: "Upload failed" });
    }
  },
);
// ================== AUTH ROUTES ==================
// ================== SIGNUP ==================
app.post("/signup", async (req, res) => {
  try {
    console.log("[SIGNUP] BODY RECEIVED:", req.body);

    const schema = z.object({
      username: z.string().min(3),
      password: z.string().min(6),
      role: z.enum(["buyer", "seller"]),
      contact: z.string().trim().email(),
    });

    let parsed;
    try {
      parsed = schema.parse(req.body);
      console.log("[SIGNUP] Zod parsed successfully:", parsed);
    } catch (zErr) {
      console.error("[SIGNUP] Zod parse failed:", zErr.errors);
      return res
        .status(400)
        .json({ error: "Données invalides", details: zErr.errors });
    }

    const { username, password, role, contact } = parsed;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await db
      .prepare("SELECT 1 FROM users WHERE username=?")
      .get(username);

    if (existingUser)
      return res.status(409).json({ error: "Utilisateur déjà existant" });

    const hash = await bcrypt.hash(password, 10);

    // Insérer en DB
    await db
      .prepare(
        `
      INSERT INTO users (
        username, password, role, contact, ville, region, type, price,
        budget, budgetMin, budgetMax, pieces, piecesMin, piecesMax,
        surface, surfaceMin, surfaceMax, avatar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        username,
        hash,
        role,
        contact,
        "",
        "",
        "appartement",
        0,
        0,
        0,
        0,
        1,
        0,
        100,
        10,
        0,
        1000,
        "/images/user-avatar.jpg",
      );

    res.json({ token: generateToken({ username, role, contact }) });
  } catch (err) {
    console.error("[SIGNUP] ERREUR INATTENDUE:", err.stack);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== LOGIN ==================
app.post("/login", async (req, res) => {
  try {
    console.log("[LOGIN] BODY RECEIVED:", req.body);

    const schema = z.object({
      username: z.string(),
      password: z.string(),
    });

    let parsed;
    try {
      parsed = schema.parse(req.body);
      console.log("[LOGIN] Zod parsed successfully:", parsed);
    } catch (zErr) {
      console.error("[LOGIN] Zod parse failed:", zErr.errors);
      return res
        .status(400)
        .json({ error: "Données invalides", details: zErr.errors });
    }

    const { username, password } = parsed;

    const user = await db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.sendStatus(401);
    }

    // Supprimer la session si existante
    delete sessions[username];

    res.json({ token: generateToken(user) });
  } catch (err) {
    console.error("[LOGIN] ERREUR INATTENDUE:", err.stack);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== PROFIL UTILISATEUR ==================
app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(
        "SELECT username, role, contact, avatar FROM users WHERE username = ?",
      )
      .get(req.user.username);

    if (!user) return res.sendStatus(404);

    res.json(user);
  } catch (err) {
    console.error("[API /me] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== CHANGER MOT DE PASSE ==================
app.post("/api/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Données invalides" });
    }

    const user = await db
      .prepare("SELECT id, password FROM users WHERE username=?")
      .get(req.user.username);

    if (!user)
      return res.status(404).json({ error: "Utilisateur introuvable" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match)
      return res.status(401).json({ error: "Mot de passe actuel incorrect" });

    const newHash = await bcrypt.hash(newPassword, 10);

    await db
      .prepare("UPDATE users SET password=? WHERE id=?")
      .run(newHash, user.id);

    console.log(`[PROFIL] Mot de passe changé pour ${req.user.username}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[API /change-password] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ================== MESSAGES ==================

// ================== ENVOYER UN MESSAGE ==================
app.post("/api/messages", authenticateToken, async (req, res) => {
  try {
    console.log("[API /messages POST] Requête reçue :", req.body);

    const schema = z.object({
      pseudo: z.string().min(1).optional(),
      email: z.string().email().optional(),
      subject: z.string().min(0),
      body: z.string().min(1),
      receiverId: z.number().optional(),
      // BUG FIX 2 : accepter les attachments
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

    const { pseudo, email, subject, body, receiverId, attachments } =
      schema.parse(req.body);

    let receiver;

    if (receiverId) {
      receiver = await db
        .prepare(`SELECT id, username, contact FROM users WHERE id = $1`)
        .get(receiverId);
      if (!receiver) {
        return res.status(404).json({ error: "Utilisateur introuvable" });
      }
    } else {
      if (!pseudo || !email) {
        return res.status(400).json({
          error: "Pseudo et email obligatoires pour un nouveau message",
        });
      }
      const normalizedPseudo = pseudo.trim().toLowerCase();
      const normalizedEmail = email.trim().toLowerCase();

      receiver = await db
        .prepare(
          `SELECT id, username, contact FROM users 
           WHERE LOWER(TRIM(username)) = $1 AND LOWER(TRIM(contact)) = $2`,
        )
        .get(normalizedPseudo, normalizedEmail);

      if (!receiver) {
        return res.status(404).json({ error: "Utilisateur introuvable" });
      }
    }

    const sender = await db
      .prepare(
        `SELECT id, username, contact FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(req.user.username.trim().toLowerCase());
    if (!sender) {
      return res.status(404).json({ error: "Expéditeur introuvable" });
    }

    // ── Vérification blocage : le destinataire a-t-il bloqué l'expéditeur ? ──
    const blockCheck = await db
      .prepare(
        `SELECT id FROM blocked_users
         WHERE blocker_id = $1 AND blocked_username = $2`,
      )
      .get(receiver.id, sender.username.trim().toLowerCase());

    if (blockCheck) {
      return res
        .status(403)
        .json({ error: "Envoi impossible", reason: "blocked" });
    }

    // BUG FIX 2 : persister les attachments en JSON dans la colonne attachments
    const attachmentsJson = JSON.stringify(attachments || []);

    const insert = await db
      .prepare(
        `INSERT INTO messages (sender_id, receiver_id, subject, body, attachments)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      )
      .get(sender.id, receiver.id, subject, body, attachmentsJson);

    // Notifier le destinataire (si préférences messages activées)
    try {
      const receiverPrefs = await db
        .prepare(`SELECT preferences FROM users WHERE id = $1`)
        .get(receiver.id);
      let prefs = {};
      try {
        prefs = JSON.parse(receiverPrefs?.preferences || "{}");
      } catch {}
      if (prefs["notif-messages"] !== false) {
        await db
          .prepare(
            `INSERT INTO notifications (user_id, type, title, body, data, read)
     VALUES ($1, $2, $3, $4, $5, false)`,
          )
          .run(
            receiver.id,
            "message",
            "Nouveau message reçu",
            `${sender.username} vous a envoyé un message : "${subject.startsWith("[Groupe:") ? "Message de groupe" : subject}"`,
            JSON.stringify({
              messageId: insert.id,
              senderId: sender.id,
              senderUsername: sender.username,
            }),
          );
      }
    } catch (e) {
      console.warn("[NOTIF message]", e.message);
    }

    res.json({ success: true, messageId: insert.id });
  } catch (err) {
    console.error("[API /messages POST] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== RÉCUPÉRER LES MESSAGES ==================
app.get("/api/messages", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(
        `SELECT id, username, contact FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(req.user.username.trim().toLowerCase());

    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const messages = await db
      .prepare(
        `
SELECT
  m.id,
  m.sender_id,
  m.receiver_id,
  REPLACE(LOWER(TRIM(su.username)), '"', '') AS sender,
  REPLACE(LOWER(TRIM(ru.username)), '"', '') AS receiver,
 
  COALESCE(NULLIF(su.avatar, ''), '/images/user-avatar.jpg') AS "senderAvatar",
  COALESCE(NULLIF(ru.avatar, ''), '/images/user-avatar.jpg') AS "receiverAvatar",
 
  su.contact AS "senderEmail",
  ru.contact AS "receiverEmail",
 
  m.subject,
  m.body,
  -- BUG FIX 2 : inclure les attachments
  COALESCE(m.attachments, '[]') AS attachments,
  m.timestamp
 
FROM messages m
JOIN users su ON m.sender_id = su.id
JOIN users ru ON m.receiver_id = ru.id
 
WHERE m.receiver_id = $1 OR m.sender_id = $1
 
ORDER BY m.timestamp ASC, m.id ASC;
      `,
      )
      .all(user.id);

    // Parser les attachments JSON pour chaque message
    const messagesWithAttachments = messages.map((m) => ({
      ...m,
      attachments: (() => {
        if (!m.attachments) return [];
        if (Array.isArray(m.attachments)) return m.attachments;
        try {
          const parsed = JSON.parse(m.attachments);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    }));

    res.json(messagesWithAttachments);
  } catch (err) {
    console.error("[API /messages GET] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post(
  "/api/upload-files",
  authenticateToken,
  upload.array("files", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "Aucun fichier reçu" });
      }

      // Upload parallèle vers Cloudinary (raw pour les fichiers non-image)
      const uploadedFiles = await Promise.all(
        req.files.map(
          (file) =>
            new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                {
                  folder: "fichiers",
                  resource_type: "raw", // permet tous types de fichiers
                  use_filename: true,
                  unique_filename: true,
                },
                (error, result) => {
                  if (error) return reject(error);
                  resolve({
                    url: result.secure_url,
                    name: file.originalname,
                    size: file.size,
                  });
                },
              );
              stream.end(file.buffer);
            }),
        ),
      );

      return res.json({
        success: true,
        files: uploadedFiles,
      });
    } catch (err) {
      console.error("[UPLOAD FILES ERROR]", err);
      return res.status(500).json({ error: "Upload échoué" });
    }
  },
);

app.delete("/api/messages/:id", authenticateToken, async (req, res) => {
  try {
    const msgId = Number(req.params.id);

    if (!msgId) return res.status(400).json({ error: "ID invalide" });

    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());

    if (!user)
      return res.status(404).json({ error: "Utilisateur introuvable" });

    // ✅ IMPORTANT : suppression par ID UNIQUE
    const result = await db
      .prepare(
        `
        DELETE FROM messages
        WHERE id = $1
        AND (sender_id = $2 OR receiver_id = $2)
      `,
      )
      .run(msgId, user.id);

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Message introuvable" });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
app.delete(
  "/api/conversations/:userId",
  authenticateToken,
  async (req, res) => {
    try {
      const otherUserId = Number(req.params.userId);

      const user = await db
        .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
        .get(req.user.username.trim().toLowerCase());

      if (!user)
        return res.status(404).json({ error: "Utilisateur introuvable" });

      const result = await db
        .prepare(
          `
        DELETE FROM messages
        WHERE (sender_id = $1 AND receiver_id = $2)
           OR (sender_id = $2 AND receiver_id = $1)
      `,
        )
        .run(user.id, otherUserId);

      res.json({
        success: true,
        deleted: result.rowCount || result.changes,
      });
    } catch (err) {
      console.error("[DELETE CONVERSATION ERROR]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);
app.post("/api/send-match-message", authenticateToken, async (req, res) => {
  try {
    const schema = z.object({
      targetContact: z.string().email(),
      subject: z.string().min(1),
      body: z.string().min(1),
    });

    const { targetContact, subject, body } = schema.parse(req.body);

    const sender = await db
      .prepare(
        `SELECT id, username FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(req.user.username.trim().toLowerCase());

    if (!sender)
      return res.status(404).json({ error: "Expéditeur introuvable" });

    const receiver = await db
      .prepare(`SELECT id, username FROM users WHERE LOWER(TRIM(contact)) = $1`)
      .get(targetContact.trim().toLowerCase());

    if (!receiver) {
      return res.status(404).json({
        error: "Destinataire introuvable",
        hint: "L'utilisateur n'existe pas ou son email ne correspond pas.",
      });
    }

    const insert = await db
      .prepare(
        `INSERT INTO messages (sender_id, receiver_id, subject, body, attachments)
       VALUES ($1, $2, $3, $4, '[]') RETURNING id`,
      )
      .get(sender.id, receiver.id, subject, body);

    res.json({ success: true, messageId: insert?.id });
  } catch (err) {
    console.error("[/api/send-match-message]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== FAVORITES ==================
app.get("/api/favorites", authenticateToken, async (req, res) => {
  try {
    const usernameNormalized = req.user.username.trim().toLowerCase();

    // Récupération utilisateur
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(username)=?`)
      .get(usernameNormalized);

    console.log("[DEBUG GET FAVORITES] USER FROM TOKEN:", req.user.username);
    console.log("[DEBUG GET FAVORITES] USER FOUND IN DB:", user);

    if (!user) return res.sendStatus(404);

    // Récupération des favoris
    const favorites = await db
      .prepare(
        `
        SELECT id, profile_data
        FROM favorites
        WHERE user_id = ?
        ORDER BY created_at DESC
      `,
      )
      .all(user.id);

    // Parsing des favoris
    const parsed = favorites.map((f) => {
      let data = {};
      try {
        data = JSON.parse(f.profile_data);
      } catch (err) {
        console.warn(`[FAVORITES] JSON invalide pour favorite ${f.id}`);
      }

      return {
        dbId: f.id,
        type: data.type ?? "",
        ville: data.ville ?? "",
        pieces: data.pieces ?? data.piecesMin ?? 0,
        surface: data.surface ?? data.surfaceMin ?? 0,
        price: data.price ?? data.budget ?? 0,
        contact: data.contact ?? "",
        common: data.common ?? [],
        different: data.different ?? [],
        compatibility: data.compatibility ?? 0,
        lat: data.lat ?? data.buyerLat ?? 48.8566,
        lng: data.lng ?? data.buyerLng ?? 2.3522,
        buyerLat: data.buyerLat ?? 48.8566,
        buyerLng: data.buyerLng ?? 2.3522,
      };
    });

    res.json(parsed);
  } catch (err) {
    console.error("[API /favorites GET] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/favorites", authenticateToken, async (req, res) => {
  try {
    const usernameNormalized = req.user.username.trim().toLowerCase();

    // Récupération utilisateur
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(username)=?`)
      .get(usernameNormalized);

    console.log("[DEBUG POST FAVORITES] USER FROM TOKEN:", req.user.username);
    console.log("[DEBUG POST FAVORITES] USER FOUND IN DB:", user);

    if (!user) return res.sendStatus(404);

    const profile = req.body;

    const info = await db
      .prepare(`INSERT INTO favorites (user_id, profile_data) VALUES (?, ?)`)
      .run(user.id, JSON.stringify(profile));

    console.log("[DEBUG POST FAVORITES] FAVORITE INSERTED:", info);

    // PostgreSQL retourne `rows` et pas `lastInsertRowid` : utiliser `RETURNING id`
    const insertedId = info.rows && info.rows[0] ? info.rows[0].id : null;

    res.json({ success: true, dbId: insertedId });
  } catch (err) {
    console.error("[API /favorites POST] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/favorites/:id", authenticateToken, async (req, res) => {
  try {
    const usernameNormalized = req.user.username.trim().toLowerCase();

    // Récupération utilisateur
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(username)=?`)
      .get(usernameNormalized);

    console.log("[DEBUG DELETE FAVORITES] USER FROM TOKEN:", req.user.username);
    console.log("[DEBUG DELETE FAVORITES] USER FOUND IN DB:", user);

    if (!user) return res.sendStatus(404);

    const favId = Number(req.params.id);

    const result = await db
      .prepare(
        `
        DELETE FROM favorites
        WHERE id = ? AND user_id = ?
        RETURNING id
      `,
      )
      .run(favId, user.id);

    console.log("[DEBUG DELETE FAVORITES] ROWS AFFECTED:", result);

    res.json({ success: true });
  } catch (err) {
    console.error("[API /favorites DELETE] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ================== STATS — VERSION CORRIGÉE & BOOSTÉE ==================
app.get("/api/stats", authenticateToken, async (req, res) => {
  try {
    const usernameNormalized = req.user.username.trim().toLowerCase();

    // 1. RÉCUPÉRATION DE L'UTILISATEUR EN BASE DE DONNÉES
    const user = await db
      .prepare("SELECT id, username FROM users WHERE LOWER(TRIM(username)) = ?")
      .get(usernameNormalized);

    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    // 2. CALCUL DES COMPTEURS D'ACTIVITÉ (FAVORIS & MESSAGES)
    const favResult = await db
      .prepare("SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?")
      .get(user.id);
    const totalFavoris = favResult?.count || 0;

    const convoResult = await db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) AS count
         FROM messages
         WHERE sender_id = ? OR receiver_id = ?`,
      )
      .get(user.id, user.id, user.id);
    const activeConversations = convoResult?.count || 0;

    // 3. RÉCUPÉRATION DES PROFILS EN MÉMOIRE (POUR LE MOTEUR)
    const buyerProfile = BUYERS.find((b) => b.username === req.user.username);
    const sellerProfile = SELLERS.find((s) => s.username === req.user.username);

    // 4. GÉNÉRATION DES MATCHS (TOP 30)
    let allMatches = [];
    if (buyerProfile) {
      allMatches = getStatsMatches(buyerProfile, 30);
    } else if (sellerProfile) {
      allMatches = matchSellerToBuyers(sellerProfile, 30);
    }

    // 5. CAS OÙ LE PROFIL EST INCOMPLET (PAS DE MATCHS)
    if (!allMatches || allMatches.length === 0) {
      return res.json({
        totalMatches: 0,
        averageCompatibility: 0,
        totalFavoris,
        activeConversations,
        distribution: { forte: 0, bonne: 0, moyenne: 0, faible: 0 },
        matches: [],
        topMatch: null,
        currentUser: {
          role: buyerProfile
            ? "buyer"
            : sellerProfile
              ? "seller"
              : req.user.role,
          ville: buyerProfile?.ville || sellerProfile?.ville || null,
        },
      });
    }

    // 6. CALCUL DES STATISTIQUES GLOBALES
    const totalMatches = allMatches.length;
    const averageCompatibility = Math.round(
      allMatches.reduce((sum, m) => sum + (m.compatibility || 0), 0) /
        totalMatches,
    );

    // Distribution des scores pour le graphique en Donut
    const distribution = { forte: 0, bonne: 0, moyenne: 0, faible: 0 };
    allMatches.forEach((m) => {
      const c = m.compatibility || 0;
      if (c >= 80) distribution.forte++;
      else if (c >= 60) distribution.bonne++;
      else if (c >= 40) distribution.moyenne++;
      else distribution.faible++;
    });

    // Identification du meilleur match
    const topMatch = allMatches.reduce((prev, curr) =>
      (curr.compatibility || 0) > (prev.compatibility || 0) ? curr : prev,
    );

    // 7. GÉNÉRATION DES PROFILS SIMILAIRES (POUR LE WIDGET DROIT)
    const similarProfiles = getSimilarProfiles(
      buyerProfile || sellerProfile,
      5,
    );

    // 8. RÉPONSE FINALE — STRUCTURE FLAT (RACINE) POUR LES GRAPHIQUES
    res.json({
      totalMatches,
      averageCompatibility,
      totalFavoris,
      activeConversations,
      distribution,
      similarProfiles,
      topMatch,
      // Objet currentUser à la racine (Attendu par recommandations.js)
      currentUser: {
        role: buyerProfile ? "buyer" : "seller",
        ville: buyerProfile?.ville || sellerProfile?.ville || null,
        budgetMax: buyerProfile?.budgetMax || null,
        surfaceMin: buyerProfile?.surfaceMin || null,
        piecesMin: buyerProfile?.piecesMin || null,
        price: sellerProfile?.price || null,
        surface: sellerProfile?.surface || null,
        pieces: sellerProfile?.pieces || null,
      },
      // Liste des matchs avec conservation de l'objet criteriaMatch.detail
      matches: allMatches.map((m) => ({
        ...m, // Spread complet pour ne perdre aucune donnée du moteur (common, different, detail, etc.)
        // Fallbacks de sécurité pour les anciennes versions des graphiques
        price: m.price ?? m.budgetMax ?? 0,
        pieces: m.pieces ?? m.piecesMin ?? 0,
        surface: m.surface ?? m.surfaceMin ?? 0,
        username: m.username,
        compatibility: m.compatibility,
        type: m.type,
        ville: m.ville,
      })),
    });
  } catch (err) {
    console.error("[API /stats] ERREUR FATALE :", err);
    res.status(500).json({
      error: "Erreur interne du serveur lors du calcul des statistiques",
    });
  }
});
// ── FALLBACK LOCAL SERVER-SIDE ──────────────────────────
function generateDiagnostic(matches, criteria = {}, role = "buyer") {
  const count = matches.length;
  if (!count) return "Aucune donnée disponible pour l'analyse.";

  const avgComp = Math.round(
    matches.reduce((acc, m) => acc + (m.compatibility || 0), 0) / count,
  );
  const topMatch = matches[0] || {};

  const budgetDiffs = matches
    .map((m) => m.criteriaMatch?.detail?.budget?.diff)
    .filter((d) => d != null);
  const avgBudgetDiff = budgetDiffs.length
    ? Math.round(budgetDiffs.reduce((a, b) => a + b, 0) / budgetDiffs.length)
    : 0;

  const dists = matches
    .map((m) => m.criteriaMatch?.detail?.ville?.distanceKm)
    .filter((d) => d != null);
  const avgDist = dists.length
    ? (dists.reduce((a, b) => a + b, 0) / dists.length).toFixed(1)
    : 0;

  const synth = `Votre positionnement actuel génère ${count} correspondances avec une compatibilité moyenne de ${avgComp} %. Le marché répond à votre profil, mais une tension est visible sur les critères de haute compatibilité.`;

  const freins = `L'analyse des rejets indique que le critère ${Math.abs(avgBudgetDiff) > 0 ? "budgétaire" : "géographique"} est votre principal frein. L'écart médian constaté est de ${Math.abs(avgBudgetDiff).toLocaleString("fr-FR")} € par rapport aux profils les plus qualitatifs.`;

  const opportunite = `Une fenêtre d'opportunité se dessine sur le secteur de ${topMatch.ville || "votre zone"}, où le meilleur profil affiche ${topMatch.compatibility || "—"} % de compatibilité.`;

  const strategie = `Pour maximiser vos chances, privilégiez une réactivité absolue sur les matchs supérieurs à 75 %. Un élargissement de ${avgDist > 0 ? avgDist : "5"} km doublerait mécaniquement votre vivier de profils Premium.`;

  return [synth, freins, opportunite, strategie];
}
// ================== IA ==================
app.post("/api/ai", authenticateToken, async (req, res) => {
  try {
    let { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message manquant" });

    const username = req.user.username;

    // Récupérer ou initialiser la session côté serveur
    if (!sessions[username]) {
      sessions[username] = {
        started: false,
        criteria: {},
        role: req.user.role,
        phase: "collecting", // collecting | results
        matches: [],
      };
    }
    const session = sessions[username];

    // ===== Détecter si message est un JSON { prompt, context } =====
    let prompt = "";
    let context = {};
    if (typeof message === "string") {
      try {
        const parsed = JSON.parse(message);
        prompt = parsed.prompt || "";
        context = parsed.context || {};
      } catch {
        // Ce n'est pas du JSON, traiter comme simple message
        prompt = message;
      }
    } else if (typeof message === "object" && message.prompt) {
      prompt = message.prompt;
      context = message.context || {};
    } else {
      prompt = String(message);
    }

    // Si la phase n'est pas précisée côté front, utiliser celle de la session
    if (!context.phase) context.phase = session.phase;
    if (!context.matchingProfiles) context.matchingProfiles = session.matches;

    // Appel à l'IA
    const response = await aiChatWithCriteria(
      prompt,
      session.criteria,
      context,
    );

    // Mise à jour des critères côté session
    // ===== Mise à jour critères (FIX CRITIQUE) =====
    session.criteria = {
      ...session.criteria, // ancien état
      ...(response.criteria || {}), // nouvelles données
    };
    res.json(response);
  } catch (err) {
    console.error("[/api/ai] Error:", err);
    res.status(500).json({ error: "Erreur serveur lors de l'appel à l'IA" });
  }
});

/**
 * 1. ROUTE API - Gère la cascade : OpenRouter -> Gemini Direct -> Fallback Local
 */
app.post("/api/ai-analysis", authenticateToken, async (req, res) => {
  try {
    const { data, criteria, role } = req.body;
    if (!data || !Array.isArray(data) || data.length === 0)
      return res
        .status(400)
        .json({ error: "Données invalides pour l'analyse" });

    // --- PRÉPARATION DES DONNÉES (Thinning stratégique) ---
    const aiFriendlyData = data.slice(0, 25).map((m) => ({
      v: m.ville,
      p: m.price || m.budgetMax,
      s: m.surface || m.surfaceMin,
      pc: m.pieces || m.piecesMin,
      t: m.type,
      dpe: m.criteriaMatch?.detail?.dpe?.letter,
      comp: m.compatibility,
      // On inclut les écarts réels pour que l'IA soit précise
      diff_budget: m.criteriaMatch?.detail?.budget?.diff,
      dist_km: m.criteriaMatch?.detail?.ville?.distanceKm,
    }));

    const fullPrompt = `Tu es un Expert Immobilier Senior et Analyste de Marché. 
Analyse ce set de données (25 matchs) pour un profil ${role === "buyer" ? "Acquéreur" : "Vendeur"} :
Données : ${JSON.stringify(aiFriendlyData)}.
Critères cibles : ${JSON.stringify(criteria)}.

Rédige un diagnostic stratégique fluide en 4 paragraphes précis, sans aucun titre ni liste à puces :
1. Synthèse du marché : Analyse la cohérence globale entre la demande et l'offre actuelle en citant le volume de matchs et la compatibilité moyenne.
2. Analyse des freins : Identifie le critère précis qui bloque le matching (prix trop bas, zone trop restreinte ou surface rare) en te basant sur les écarts types constatés.
3. Fenêtre d'opportunité : Repère dans les données un profil ou une zone géographique spécifique qui sort du lot et pourquoi elle représente une chance réelle.
4. Stratégie opérationnelle : Donne un conseil de mouvement immédiat (élargissement de zone, révision budgétaire ou réactivité) pour débloquer la situation.

Ton : Professionnel, direct, expert. Ne salue pas, ne conclus pas par des politesses.`;

    let aiText = "";

    /* ─────────────────────────────────────────────
   🧠 TENTATIVE 1 — GEMINI (PRIORITÉ)
──────────────────────────────────────────── */
    try {
      console.log("🚀 Gemini fallback actif");

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

      const models = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
      ];

      for (const modelName of models) {
        try {
          console.log(`🧪 Test Gemini model: ${modelName}`);

          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(fullPrompt);

          aiText = result.response.text().trim();

          if (aiText) {
            console.log(`✅ Diagnostic via Gemini (${modelName})`);
            break;
          }
        } catch (errG) {
          console.warn(`⚠️ Gemini model failed: ${modelName}`, {
            message: errG.message,
            code: errG.code,
            status: errG.status,
          });
        }
      }
    } catch (err1) {
      console.error("❌ Gemini GLOBAL ERREUR :", {
        message: err1.message,
        status: err1.status,
        code: err1.code,
        details: err1?.errorDetails,
      });

      /* ─────────────────────────────────────────────
     🔁 TENTATIVE 2 — OPENROUTER (FALLBACK)
  ───────────────────────────────────────────── */
      try {
        console.log("🔁 OpenRouter fallback actif");

        const openRouter = new OpenAI({
          apiKey: process.env.ROUTER,
          baseURL: "https://openrouter.ai/api/v1",
        });

        const response1 = await openRouter.chat.completions.create({
          model: "openrouter/free",
          messages: [{ role: "user", content: fullPrompt }],
          temperature: 0.3,
          max_tokens: 1000,
        });

        aiText = response1?.choices?.[0]?.message?.content?.trim();

        console.log("✅ Diagnostic via OpenRouter");
      } catch (err2) {
        console.error("❌ OpenRouter ERREUR COMPLÈTE :", {
          message: err2.message,
          status: err2.status,
          code: err2.code,
          type: err2.type,
          headers: err2.headers,
          error: err2.error,
        });
      }
    }

    /* ─────────────────────────────────────────────
   📤 RESPONSE FINAL
──────────────────────────────────────────── */
    if (aiText) {
      res.json({ analysis: aiText });
    } else {
      res.json({
        analysis: generateDiagnostic(data, criteria, role).join("\n\n"),
      });
    }
  } catch (err) {
    console.error("[/api/ai-analysis] Erreur fatale:", err.message);
    res.json({
      analysis:
        "Une erreur technique empêche l'analyse détaillée. Veuillez vous baser sur les scores de compatibilité individuels.",
    });
  }
});
// ================== CHANGER AVATAR ==================
app.post("/api/change-avatar", authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ error: "Avatar manquant" });
    const user = await db
      .prepare("SELECT id FROM users WHERE LOWER(TRIM(username)) = $1")
      .get(req.user.username.trim().toLowerCase());

    if (!user)
      return res.status(404).json({ error: "Utilisateur introuvable" });
    console.log("[DEBUG AVATAR UPDATE]", {
      username: req.user.username,
      trimmedLower: req.user.username.trim().toLowerCase(),
      avatarReceived: avatar,
      userId: user?.id,
    });

    await db
      .prepare("UPDATE users SET avatar = $1 WHERE id = $2")
      .run(avatar, user.id);

    res.json({ success: true, avatar });
  } catch (err) {
    console.error("[API /change-avatar] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== AJOUT COLONNE AVATAR SI MANQUANTE ==================
(async () => {
  try {
    if (!isProd) {
      // SQLite
      const tableInfo = await db.prepare("PRAGMA table_info(users)").all();
      if (!tableInfo.find((col) => col.name === "avatar")) {
        console.log(
          "⚡ Ajout de la colonne avatar à la table users (SQLite)...",
        );
        await db
          .prepare(
            "ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT '/images/user-avatar.jpg'",
          )
          .run();
      }
    } else {
      // PostgreSQL
      const res = await db
        .prepare(
          `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='users' AND column_name='avatar'
      `,
        )
        .all();

      if (!res.length) {
        console.log(
          "⚡ Ajout de la colonne avatar à la table users (PostgreSQL)...",
        );
        await db
          .prepare(
            `
          ALTER TABLE users
          ADD COLUMN avatar TEXT DEFAULT '/images/user-avatar.jpg'
        `,
          )
          .run();
      }
    }
  } catch (err) {
    console.error("[INIT AVATAR COLUMN] ERREUR :", err);
  }
})();
app.post("/api/support", async (req, res) => {
  console.log("[SUPPORT] Requête reçue");

  try {
    console.log("[SUPPORT] Headers reçus :", req.headers);
    console.log("[SUPPORT] Body reçu :", req.body);

    // ── Auth optionnelle : token si connecté, infos formulaire sinon ──
    const authHeader = req.headers.authorization;
    let senderIdentity = "Visiteur non connecté";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      console.log("[SUPPORT] Token extrait :", token);
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        senderIdentity = `Utilisateur connecté : ${decoded.username} (role: ${decoded.role})`;
        console.log("[SUPPORT] Token valide pour :", decoded.username);
      } catch (err) {
        console.warn(
          "[SUPPORT] Token présent mais invalide, on continue en mode public :",
          err.message,
        );
        // on ne bloque pas — on traite comme visiteur
      }
    } else {
      console.log(
        "[SUPPORT] Pas de token — mode contact public (contact.html)",
      );
    }

    const { subject, message, name, email } = req.body;

    if (!subject || !message) {
      console.warn("[SUPPORT] Sujet ou message manquant");
      return res.status(400).json({ error: "Sujet et message obligatoires" });
    }

    // Enrichir l'identité avec les champs publics si présents (contact.html)
    if (name || email) {
      senderIdentity = `Contact public — Nom : ${name || "non renseigné"} | Email : ${email || "non renseigné"}`;
    }

    const emailContent = `
Nouveau message support / contact :

${senderIdentity}

Sujet : ${subject}

Message :
${message}
    `;

    console.log("[SUPPORT] Contenu email préparé :", emailContent);

    // ===== ENVOI GMAIL UNIQUEMENT =====
    try {
      console.log("[SUPPORT] Tentative envoi via Gmail...");

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      });

      const mailOptions = {
        from: `"Support Site" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        subject: `📩 Support - ${subject}`,
        text: emailContent,
      };

      console.log("[SUPPORT] MailOptions :", mailOptions);

      const info = await transporter.sendMail(mailOptions);
      console.log("[SUPPORT] Email envoyé avec succès :", info);

      return res.status(200).json({
        success: true,
        message: "Message envoyé au développeur",
      });
    } catch (gmailErr) {
      console.error("[SUPPORT] Envoi Gmail échoué :", gmailErr);
      console.error("[SUPPORT] Stack trace :", gmailErr.stack);

      return res.status(500).json({
        error: "Impossible d'envoyer le message (Gmail)",
        details: gmailErr.message,
      });
    }
  } catch (err) {
    console.error("[SUPPORT] ERREUR INATTENDUE :", err);
    console.error("[SUPPORT] Stack trace :", err.stack);
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});
app.get("/api/marche", authenticateToken, async function (req, res) {
  try {
    // ── 1. Stats par ville : croisement SELLERS × BUYERS (matchs réels) ──
    const cityStats = {};

    // Indexer les buyers par ville normalisée pour lookup rapide
    const buyersByVille = {};
    for (const b of BUYERS) {
      const v = normalize(b.ville || "");
      if (!buyersByVille[v]) buyersByVille[v] = [];
      buyersByVille[v].push(b);
    }

    for (const s of SELLERS) {
      const city = s.ville?.trim() || "";
      if (!city) continue;
      if (!cityStats[city]) {
        cityStats[city] = {
          count: 0,
          totalPrice: 0,
          totalSurface: 0,
          matchCount: 0,
          prevPrixM2: null,
        };
      }
      cityStats[city].count++;
      cityStats[city].totalPrice += s.price || 0;
      cityStats[city].totalSurface += s.surface || 0;

      const sNorm = normalize(city);
      for (const b of BUYERS) {
        const bNorm = normalize(b.ville || "");
        // ← distanceKm maintenant importée, plus d'erreur
        const dist = distanceKm(city, b.ville || "");
        const tol = b.toleranceKm ?? 100;
        if (bNorm === sNorm || dist <= tol) {
          cityStats[city].matchCount++;
        }
      }
    }

    // Récupérer la variation depuis DB (prix précédent stocké)
    // On utilise un snapshot en mémoire pour la variation inter-refresh
    if (!global._marchePrevPrix) global._marchePrevPrix = {};

    const villesData = Object.entries(cityStats)
      .filter(([, s]) => s.count > 0)
      .map(([name, stats]) => {
        const prixM2 =
          stats.totalSurface > 0
            ? Math.round(stats.totalPrice / stats.totalSurface)
            : 0;
        const prev = global._marchePrevPrix[name] ?? prixM2;
        const variation =
          prev > 0
            ? parseFloat((((prixM2 - prev) / prev) * 100).toFixed(1))
            : 0;
        global._marchePrevPrix[name] = prixM2;
        return {
          ville: name,
          prixM2,
          matchs: stats.matchCount,
          biens: stats.count,
          variation,
        };
      })
      .filter((v) => v.prixM2 > 0)
      .sort((a, b) => b.matchs - a.matchs);

    // ── 2. Types de biens réels ──
    const typesCount = {};
    for (const s of SELLERS) {
      const t = s.type || "appartement";
      typesCount[t] = (typesCount[t] || 0) + 1;
    }
    const typesData = Object.entries(typesCount)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // ── 3. KPIs réels ──
    const totalSellers = SELLERS.length;
    const totalBuyers = BUYERS.length;

    // Prix médian/m² global
    const allPrixM2 = SELLERS.filter((s) => s.price > 0 && s.surface > 0).map(
      (s) => s.price / s.surface,
    );
    allPrixM2.sort((a, b) => a - b);
    const medianPrixM2 = allPrixM2.length
      ? Math.round(allPrixM2[Math.floor(allPrixM2.length / 2)])
      : 0;

    // Surface médiane
    const allSurfaces = SELLERS.filter((s) => s.surface > 0)
      .map((s) => s.surface)
      .sort((a, b) => a - b);
    const medianSurface = allSurfaces.length
      ? Math.round(allSurfaces[Math.floor(allSurfaces.length / 2)])
      : 0;

    // Compatibilité moyenne : échantillon rapide des 20 premiers sellers × buyers
    let totalCompat = 0,
      compatCount = 0;
    const sellerSample = SELLERS.slice(0, 20);
    const buyerSample = BUYERS.slice(0, 20);
    for (const s of sellerSample) {
      for (const b of buyerSample) {
        const dist = distanceKm(s.ville || "", b.ville || "");
        const tol = b.toleranceKm ?? 100;
        if (dist <= tol) {
          const budgetOk = b.budgetMax && s.price <= b.budgetMax ? 1 : 0.3;
          const surfOk = b.surfaceMin && s.surface >= b.surfaceMin ? 1 : 0.5;
          totalCompat += Math.round(
            (budgetOk * 0.5 + surfOk * 0.3 + 0.2) * 100,
          );
          compatCount++;
        }
      }
    }
    const compatMoy =
      compatCount > 0 ? Math.round(totalCompat / compatCount) : 0;

    // Total matchs réels (somme des matchCount de toutes les villes)
    const totalMatchs = villesData.reduce((s, v) => s + v.matchs, 0);

    // Variation prix global (snapshot précédent)
    if (!global._marchePrevPrixGlobal)
      global._marchePrevPrixGlobal = medianPrixM2;
    const variationPrix =
      global._marchePrevPrixGlobal > 0
        ? parseFloat(
            (
              ((medianPrixM2 - global._marchePrevPrixGlobal) /
                global._marchePrevPrixGlobal) *
              100
            ).toFixed(1),
          )
        : 0;
    global._marchePrevPrixGlobal = medianPrixM2;

    // Sparklines : historique glissant en mémoire (12 points max)
    if (!global._marcheHistory)
      global._marcheHistory = {
        prix: [],
        matchs: [],
        compat: [],
        users: [],
        surface: [],
      };
    const H = global._marcheHistory;
    const pushSpark = (arr, val) => {
      arr.push(Math.round(val));
      if (arr.length > 12) arr.shift();
    };
    pushSpark(H.prix, medianPrixM2 || 0);
    pushSpark(H.matchs, totalMatchs);
    pushSpark(H.compat, compatMoy);
    pushSpark(H.users, totalSellers + totalBuyers);
    pushSpark(H.surface, medianSurface);

    // ── 4. Distribution compatibilité (depuis les buyers ayant un profil complet) ──
    const distribution = { forte: 0, bonne: 0, moyenne: 0, faible: 0 };
    for (const s of SELLERS.slice(0, 30)) {
      for (const b of BUYERS.slice(0, 30)) {
        const dist = distanceKm(s.ville || "", b.ville || "");
        const tol = b.toleranceKm ?? 100;
        if (dist > tol) continue;
        const budgetOk = b.budgetMax && s.price <= b.budgetMax ? 1 : 0.3;
        const surfOk = b.surfaceMin && s.surface >= b.surfaceMin ? 1 : 0.5;
        const c = Math.round((budgetOk * 0.5 + surfOk * 0.3 + 0.2) * 100);
        if (c >= 80) distribution.forte++;
        else if (c >= 60) distribution.bonne++;
        else if (c >= 40) distribution.moyenne++;
        else distribution.faible++;
      }
    }

    // ── 5. Heatmap : activité réelle par jour (7 derniers jours) ──
    if (!global._marcheHeatmap) global._marcheHeatmap = new Array(28).fill(0);
    const dayOfWeek = new Date().getDay();
    const normalized_dow = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekInCycle = Math.floor((Date.now() / 86400000) % 4);
    const heatIdx = weekInCycle * 7 + normalized_dow;
    global._marcheHeatmap[heatIdx] =
      (global._marcheHeatmap[heatIdx] || 0) + totalMatchs;

    // ── 6. Flux live : derniers events réels ──
    const fluxLive = [];
    const recentSellers = [...SELLERS]
      .sort((a, b) => (b.id || 0) - (a.id || 0))
      .slice(0, 3);
    for (const s of recentSellers) {
      if (s.ville) {
        fluxLive.push({
          dot: "match",
          text: `<strong>${s.username}</strong> a publié un bien · <strong>${s.ville}</strong>`,
        });
      }
    }
    const recentBuyers = [...BUYERS]
      .sort((a, b) => (b.id || 0) - (a.id || 0))
      .slice(0, 2);
    for (const b of recentBuyers) {
      if (b.ville) {
        fluxLive.push({
          dot: "signup",
          text: `<strong>${b.username}</strong> recherche à <strong>${b.ville}</strong>`,
        });
      }
    }

    res.json({
      villes: villesData,
      kpi: {
        totalMatchs,
        matchsMois: totalMatchs,
        prixMedianM2: medianPrixM2,
        variationPrix,
        compatMoy,
        variationCompat: 0,
        usersActifs: totalSellers + totalBuyers,
        nouveauxUsers: totalBuyers,
        surfaceMediane: medianSurface,
        variationSurface: 0,
        sparkMatchs: H.matchs.length > 1 ? [...H.matchs] : [totalMatchs],
        sparkPrix: H.prix.length > 1 ? [...H.prix] : [medianPrixM2],
        sparkCompat: H.compat.length > 1 ? [...H.compat] : [compatMoy],
        sparkUsers:
          H.users.length > 1 ? [...H.users] : [totalSellers + totalBuyers],
        sparkSurface: H.surface.length > 1 ? [...H.surface] : [medianSurface],
      },
      distribution,
      types: typesData,
      heatmap: [...global._marcheHeatmap],
      fluxLive,
    });
  } catch (err) {
    console.error("[/api/marche]", err);
    res.status(500).json({ error: "Erreur serveur stats marché" });
  }
});

// ================== CONFIG PUBLIC POUR AI-NEWS ==================
// ================== CONFIG PUBLIC POUR AI-NEWS ==================
const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
});

const MODELS_FALLBACK = [
  "gpt-oss-120b",
  "qwen-3-235b-a22b-instruct-2507",
  "zai-glm-4.7",
  "llama3.1-8b",
];
async function listModels() {
  try {
    const models = await cerebras.models.list();

    console.log("📦 Modèles disponibles :");

    models.data.forEach((m, i) => {
      console.log(`${i + 1}. ${m.id}`);
    });

    return models.data;
  } catch (err) {
    console.error("❌ Erreur list models:", err.message);
  }
}
app.get("/api/config", (req, res) => {
  const newsKey = process.env.NEWSDATA_API_KEY || "";

  if (!newsKey) {
    console.error("[CONFIG] ❌ NEWSDATA_API_KEY absente du .env");
  } else {
    console.log("[CONFIG] ✅ NEWSDATA_API_KEY →", newsKey.slice(0, 8) + "…");
  }

  res.json({
    newsDataKey: newsKey,
    aiApiKey: "",
  });
});
async function cerebrasChatWithFallback({
  messages,
  temperature,
  max_completion_tokens,
}) {
  let lastError;

  for (const model of MODELS_FALLBACK) {
    try {
      console.log(`[CEREBRAS] 🤖 Tentative modèle: ${model}`);

      const response = await cerebras.chat.completions.create({
        model,
        temperature,
        max_completion_tokens,
        messages,
      });

      console.log(`[CEREBRAS] ✅ Succès avec: ${model}`);

      return response;
    } catch (err) {
      console.warn(`[CEREBRAS] ⚠️ Échec ${model}:`, err.message);
      lastError = err;
    }
  }

  throw lastError;
}
// ================== SÉLECTION ARTICLES IA ==================
app.post("/api/select-articles", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items?.length) {
      return res.status(400).json({ error: "items requis" });
    }

    if (!process.env.CEREBRAS_API_KEY) {
      console.error("[select-articles] ❌ CEREBRAS_API_KEY absente");

      return res.json({
        selected: items.slice(0, 6).map((_, i) => i),
      });
    }

    const prompt = `Tu es expert en immobilier français.

Réponds UNIQUEMENT en JSON valide, sans markdown ni commentaire.

Voici ${items.length} titres.

Sélectionne les ${Math.min(6, items.length)} plus pertinents pour un média immobilier premium.

Réponds uniquement :
{ "selected": [0,1,3] }

Articles :
${items.map((a, i) => `${i}. ${a.title}`).join("\n")}`;

    console.log("[select-articles] 🤖 Appel Cerebras…");

    const response = await cerebrasChatWithFallback({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_completion_tokens: 200,
    });

    const text = response.choices?.[0]?.message?.content || "";

    console.log("[select-articles] ✅ Réponse Cerebras:", text.slice(0, 100));

    const jsonMatch = text
      .replace(/```json|```/g, "")
      .trim()
      .match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.warn("[select-articles] ⚠️ Pas de JSON");

      return res.json({
        selected: items.slice(0, 6).map((_, i) => i),
      });
    }

    const { selected } = JSON.parse(jsonMatch[0]);

    res.json({
      selected: Array.isArray(selected)
        ? selected
        : items.slice(0, 6).map((_, i) => i),
    });
  } catch (err) {
    console.error("[select-articles] ❌ Erreur fatale:", err);

    res.json({
      selected: req.body.items?.slice(0, 6).map((_, i) => i) || [],
    });
  }
});
// ================== GÉNÉRATION ARTICLE IA (côté serveur) ==================
// ================== GÉNÉRATION ARTICLE IA ==================
app.post("/api/generate-article", async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ error: "title requis" });
    }

    if (!process.env.CEREBRAS_API_KEY) {
      console.error("[generate-article] ❌ CEREBRAS_API_KEY absente");

      return res.status(500).json({
        error: "CEREBRAS_API_KEY manquante",
      });
    }

    const prompt = `Tu es rédacteur senior pour un média immobilier premium français (AiGENT).

Réponds UNIQUEMENT en JSON valide, sans markdown ni commentaire.

À partir de cette actualité, génère un article complet.

Titre original : "${title}"
Résumé : "${description || ""}"

JSON attendu :

{
  "title": "titre accrocheur SEO (max 90 car.)",
  "slug": "slug-url-propre",
  "category": "marche|investissement|guide|ia-tech|dpe|actualite|tendance|juridique",
  "tags": ["tag1","tag2","tag3"],
  "metaDescription": "meta description SEO (max 160 car.)",
  "excerpt": "chapô accrocheur (2 phrases max)",
  "content": "article en HTML (800-1200 mots)",
  "readTime": 5
}`;

    console.log(
      "[generate-article] 🤖 Appel Cerebras pour:",
      title.slice(0, 60),
    );

    const response = await cerebrasChatWithFallback({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_completion_tokens: 2500,
    });

    const text = response.choices?.[0]?.message?.content || "";

    console.log("[generate-article] ✅ Réponse reçue:", text.length, "chars");

    const jsonMatch = text
      .replace(/```json|```/g, "")
      .trim()
      .match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("[generate-article] ❌ Pas de JSON:", text.slice(0, 200));

      return res.status(500).json({
        error: "Pas de JSON dans la réponse Cerebras",
        raw: text.slice(0, 200),
      });
    }

    const article = JSON.parse(jsonMatch[0]);

    res.json({ article });
  } catch (err) {
    console.error("[generate-article] ❌ Erreur fatale:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});
// ================== DEAL RADAR — Route à injecter dans server.js ==================
// Placement : après les imports existants, avant app.listen()
// Dépendances déjà présentes : authenticateToken, SELLERS, BUYERS, scoreSellerForBuyer (via matchingEngine)
// IMPORTANT : importer getStatsMatches depuis matchingEngine si pas déjà fait

// ─── Helper interne : compte les buyers à +seuil% pour un seller donné ──────────
function computeRadarEntry(seller, buyers, threshold = 70) {
  const matches = [];

  for (const buyer of buyers) {
    // Réutilise la logique de scoring déjà en place
    // On ne peut pas appeler scoreSellerForBuyer directement depuis server.js
    // → on fait un appel simplifié cohérent avec le moteur existant
    const budgetOk =
      buyer.budgetMax == null
        ? 0.6 // buyer sans budget = neutre
        : buyer.budgetMax >= seller.price
          ? 1
          : buyer.budgetMax + 50000 >= seller.price
            ? 0.5
            : 0;

    if (budgetOk === 0) continue; // hors budget total = skip

    // Distance approximative (même helper que le moteur)
    const sellerNorm = (seller.ville || "").toLowerCase().trim();
    const buyerNorm = (buyer.ville || "").toLowerCase().trim();
    const villeScore =
      sellerNorm === buyerNorm
        ? 1
        : buyer.toleranceKm && buyer.toleranceKm > 0
          ? 0.5
          : 0.3;

    const surfOk =
      buyer.surfaceMin == null
        ? 0.8
        : seller.surface >= buyer.surfaceMin
          ? 1
          : seller.surface >= buyer.surfaceMin * 0.9
            ? 0.6
            : 0;

    const piecesOk =
      buyer.piecesMin == null ? 0.8 : seller.pieces >= buyer.piecesMin ? 1 : 0;

    const compatibility = Math.round(
      (budgetOk * 0.4 + villeScore * 0.3 + surfOk * 0.2 + piecesOk * 0.1) * 100,
    );

    if (compatibility >= threshold) {
      matches.push({
        username: buyer.username,
        ville: buyer.ville,
        compatibility,
        budgetMax: buyer.budgetMax,
      });
    }
  }

  // Trier par compatibilité décroissante
  matches.sort((a, b) => b.compatibility - a.compatibility);

  const score = matches.length;
  // Urgence = nombre d'acheteurs qualifiés × compatibilité moyenne
  const avgCompat =
    score > 0
      ? Math.round(matches.reduce((s, m) => s + m.compatibility, 0) / score)
      : 0;

  return {
    sellerId: seller.id,
    username: seller.username,
    ville: seller.ville,
    type: seller.type,
    price: seller.price,
    surface: seller.surface,
    pieces: seller.pieces,
    niveauEnergetique: seller.niveauEnergetique,
    qualifiedBuyers: score,
    avgCompatibility: avgCompat,
    urgencyScore: Math.min(100, score * 12 + (avgCompat > 80 ? 20 : 0)), // plafonné à 100
    topBuyers: matches.slice(0, 3),
    // Fenêtre d'opportunité calculée : plus il y a d'acheteurs, plus ça va vite
    estimatedWindowHours: Math.max(
      12,
      72 - score * 8 - (avgCompat > 75 ? 10 : 0),
    ),
  };
}

// ─── Route principale GET /api/deal-radar ────────────────────────────────────
app.get("/api/deal-radar", authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const role = req.user.role;

    // Threshold configurable via query param (défaut 65%)
    const threshold = Math.min(
      95,
      Math.max(40, parseInt(req.query.threshold || "65", 10)),
    );
    const limit = Math.min(
      20,
      Math.max(1, parseInt(req.query.limit || "8", 10)),
    );

    if (role === "buyer") {
      // Vue acheteur : montre les biens qui te correspondent le mieux PARMI les récents
      const buyerProfile = BUYERS.find((b) => b.username === username);

      if (!buyerProfile) {
        return res.json({
          mode: "buyer",
          alerts: [],
          summary: { totalOpportunities: 0, avgUrgency: 0 },
        });
      }

      // Analyser les sellers triés par "fraîcheur" (id décroissant = plus récents)
      const recentSellers = [...SELLERS]
        .sort((a, b) => (b.id || 0) - (a.id || 0))
        .slice(0, 30);

      const alerts = [];

      for (const seller of recentSellers) {
        const entry = computeRadarEntry(seller, [buyerProfile], threshold);
        if (entry.qualifiedBuyers > 0) {
          alerts.push({
            ...entry,
            // Pour l'acheteur : on lui dit combien d'autres acheteurs ciblent ce bien
            competitorCount: Math.max(
              0,
              computeRadarEntry(seller, BUYERS, threshold).qualifiedBuyers - 1,
            ),
          });
        }
      }

      alerts.sort((a, b) => b.urgencyScore - a.urgencyScore);

      return res.json({
        mode: "buyer",
        threshold,
        alerts: alerts.slice(0, limit),
        summary: {
          totalOpportunities: alerts.length,
          avgUrgency:
            alerts.length > 0
              ? Math.round(
                  alerts.reduce((s, a) => s + a.urgencyScore, 0) /
                    alerts.length,
                )
              : 0,
          hottestCity:
            alerts.length > 0
              ? alerts.reduce((acc, a) => {
                  acc[a.ville] = (acc[a.ville] || 0) + 1;
                  return acc;
                }, {})
              : {},
        },
      });
    }

    // Vue vendeur : montre combien d'acheteurs qualifiés pour TON bien
    const sellerProfile = SELLERS.find((s) => s.username === username);

    if (!sellerProfile) {
      return res.json({
        mode: "seller",
        alerts: [],
        summary: { totalOpportunities: 0, avgUrgency: 0 },
      });
    }

    const myEntry = computeRadarEntry(sellerProfile, BUYERS, threshold);

    // Comparaison avec les autres biens similaires (même ville, même type)
    const similarSellers = SELLERS.filter(
      (s) =>
        s.username !== username &&
        s.ville === sellerProfile.ville &&
        s.type === sellerProfile.type,
    );

    const competition = similarSellers.map((s) => ({
      ville: s.ville,
      type: s.type,
      price: s.price,
      qualifiedBuyers: computeRadarEntry(s, BUYERS, threshold).qualifiedBuyers,
    }));

    const avgCompetitorBuyers =
      competition.length > 0
        ? Math.round(
            competition.reduce((s, c) => s + c.qualifiedBuyers, 0) /
              competition.length,
          )
        : 0;
    // Notif Deal Radar si urgencyScore élevé
    if (role === "seller" && myEntry.urgencyScore >= 70) {
      try {
        const sellerUser = await db
          .prepare(
            `SELECT id, preferences FROM users WHERE LOWER(TRIM(username)) = $1`,
          )
          .get(username.trim().toLowerCase());
        if (sellerUser) {
          let prefs = {};
          try {
            prefs = JSON.parse(sellerUser.preferences || "{}");
          } catch {}
          if (prefs["notif-radar"] !== false) {
            // Éviter le spam : vérifier si une notif radar existe déjà dans les 6h
            const recent = await db
              .prepare(
                `SELECT id FROM notifications WHERE user_id = $1 AND type = 'radar'
           AND created_at > NOW() - INTERVAL '6 hours'`,
              )
              .get(sellerUser.id);
            if (!recent) {
              await db
                .prepare(
                  `INSERT INTO notifications (user_id, type, title, body, data, read)
     VALUES ($1, $2, $3, $4, $5, false)`,
                )
                .run(
                  sellerUser.id,
                  "radar",
                  "Deal Radar — Opportunité prioritaire",
                  `${myEntry.qualifiedBuyers} acheteur(s) qualifié(s) pour votre bien. Fenêtre estimée : ${myEntry.estimatedWindowHours}h.`,
                  JSON.stringify({ urgencyScore: myEntry.urgencyScore }),
                );
            }
          }
        }
      } catch (e) {
        console.warn("[NOTIF radar]", e.message);
      }
    }

    return res.json({
      mode: "seller",
      threshold,
      myBien: myEntry,
      competition: {
        count: competition.length,
        avgQualifiedBuyers: avgCompetitorBuyers,
        yourAdvantage: myEntry.qualifiedBuyers - avgCompetitorBuyers,
        items: competition.slice(0, 5),
      },
      summary: {
        totalOpportunities: myEntry.qualifiedBuyers,
        avgUrgency: myEntry.urgencyScore,
        estimatedWindowHours: myEntry.estimatedWindowHours,
      },
    });
  } catch (err) {
    console.error("[/api/deal-radar] ERREUR:", err);
    res.status(500).json({ error: "Erreur calcul radar" });
  }
});

// ─── Route POST /api/deal-radar/subscribe ────────────────────────────────────
// Enregistre le mode "Silent Matching" (feature 5) en session serveur
// Le serveur vérifie à chaque refresh si un nouveau profil dépasse le seuil
app.post("/api/deal-radar/subscribe", authenticateToken, async (req, res) => {
  try {
    const { threshold = 85, active = true } = req.body;
    const username = req.user.username;

    // Stocker en DB (colonne JSON dans users ou table dédiée)
    // Version légère : on utilise la session en mémoire
    if (!global._silentMatchingRegistry) global._silentMatchingRegistry = {};

    if (active) {
      global._silentMatchingRegistry[username] = {
        threshold: Math.min(99, Math.max(50, threshold)),
        subscribedAt: new Date().toISOString(),
        role: req.user.role,
        lastNotified: null,
      };
    } else {
      delete global._silentMatchingRegistry[username];
    }

    res.json({ success: true, active, threshold });
  } catch (err) {
    console.error("[/api/deal-radar/subscribe]", err);
    res.status(500).json({ error: "Erreur abonnement" });
  }
});

// ─── Route GET /api/deal-radar/notifications ─────────────────────────────────
// Poll côté client pour recevoir les alertes Silent Matching
app.get(
  "/api/deal-radar/notifications",
  authenticateToken,
  async (req, res) => {
    try {
      const username = req.user.username;
      const registry = global._silentMatchingRegistry || {};

      if (!registry[username]) {
        return res.json({ subscribed: false, notifications: [] });
      }

      const sub = registry[username];
      const threshold = sub.threshold;

      // Chercher les nouveaux profils depuis la dernière notification
      const lastNotified = sub.lastNotified
        ? new Date(sub.lastNotified)
        : new Date(0);

      const notifications = [];

      if (sub.role === "buyer") {
        const buyerProfile = BUYERS.find((b) => b.username === username);
        if (buyerProfile) {
          const newSellers = SELLERS.filter(
            (s) => s.id > (sub.lastCheckId || 0),
          ).slice(-10);

          for (const seller of newSellers) {
            const entry = computeRadarEntry(seller, [buyerProfile], threshold);
            if (entry.qualifiedBuyers > 0) {
              notifications.push({
                type: "new_match",
                seller: {
                  ville: seller.ville,
                  type: seller.type,
                  price: seller.price,
                  surface: seller.surface,
                },
                compatibility: entry.avgCompatibility,
                urgencyScore: entry.urgencyScore,
                estimatedWindowHours: entry.estimatedWindowHours,
              });
            }
          }

          // Mettre à jour le lastCheckId
          if (SELLERS.length > 0) {
            sub.lastCheckId = Math.max(...SELLERS.map((s) => s.id || 0));
          }
        }
      }

      if (notifications.length > 0) {
        sub.lastNotified = new Date().toISOString();

        try {
          const userRow = await db
            .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
            .get(username.trim().toLowerCase());
          if (userRow) {
            for (const n of notifications) {
              await db
                .prepare(
                  `INSERT INTO notifications (user_id, type, title, body, data, read)
             VALUES ($1, $2, $3, $4, $5, false)`,
                )
                .run(
                  userRow.id,
                  "radar",
                  `Profil détecté — ${n.compatibility}%`,
                  `${n.seller?.type ? n.seller.type.charAt(0).toUpperCase() + n.seller.type.slice(1) : "Bien"} à ${n.seller?.ville || "—"} · ${n.seller?.price ? n.seller.price.toLocaleString("fr-FR") + " €" : ""}`,
                  JSON.stringify(n),
                );
            }
          }
        } catch (e) {
          console.warn("[NOTIF radar poll DB]", e.message);
        }
      }

      res.json({
        subscribed: true,
        threshold,
        notifications,
      });
    } catch (err) {
      console.error("[/api/deal-radar/notifications]", err);
      res.status(500).json({ error: "Erreur notifications" });
    }
  },
);
// ================== SIMULATION NÉGOCIATION IA ==================
// À coller dans server.js JUSTE AVANT app.listen()
// Dépendances déjà présentes : authenticateToken, SELLERS, BUYERS, sessions
// Import à ajouter en haut de server.js si pas déjà présent : callLLM est dans aiParsee
// On réutilise groqClient/mistralClient via un appel direct fetch OpenAI-compatible

// ─── Helper : appel LLM interne (même cascade que aiParsee.js) ─────────────
async function callNegoLLM(messages, maxTokens = 700) {
  // 1. Groq
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.55, // légèrement plus créatif pour la négociation
        max_tokens: maxTokens,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const text = d?.choices?.[0]?.message?.content || "";
      if (text.trim()) return text.trim();
    }
  } catch (e) {
    console.warn("[NEGO] Groq failed:", e.message?.slice(0, 80));
  }

  // 2. Mistral fallback
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MISTRAL}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages,
        temperature: 0.55,
        max_tokens: maxTokens,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const text = d?.choices?.[0]?.message?.content || "";
      if (text.trim()) return text.trim();
    }
  } catch (e) {
    console.warn("[NEGO] Mistral failed:", e.message?.slice(0, 80));
  }

  return null;
}

// ─── Route POST /api/nego/start ─────────────────────────────────────────────
// Initialise une session de négociation et retourne le premier message de l'adversaire
app.post("/api/nego/start", authenticateToken, async (req, res) => {
  try {
    const { matchProfile, userCriteria } = req.body;

    if (!matchProfile) {
      return res.status(400).json({ error: "matchProfile requis" });
    }

    const userRole = req.user.role; // 'buyer' ou 'seller'
    const username = req.user.username;

    // Construire le profil de la partie adverse
    const adverseRole = userRole === "buyer" ? "vendeur" : "acheteur";

    const systemPrompt = buildNegoSystemPrompt(
      userRole,
      userCriteria,
      matchProfile,
    );

    // Premier message : l'adversaire ouvre la négociation
    const opener = await callNegoLLM(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Commence la négociation. Joue le rôle du ${adverseRole} et ouvre avec ta position initiale. Sois réaliste, légèrement sur la défensive, comme dans une vraie négociation immobilière.`,
        },
      ],
      400,
    );

    const sessionId = `nego_${username}_${Date.now()}`;

    // Stocker la session de négociation en mémoire (comme sessions[])
    if (!global._negoSessions) global._negoSessions = {};
    global._negoSessions[sessionId] = {
      systemPrompt,
      history: [
        {
          role: "assistant",
          content:
            opener ||
            buildNegoFallbackOpener(userRole, matchProfile, userCriteria),
        },
      ],
      userRole,
      matchProfile,
      userCriteria,
      createdAt: Date.now(),
      turnCount: 0,
      outcome: null, // null | 'deal' | 'deadlock' | 'walkaway'
    };

    // Purge des vieilles sessions (>2h)
    const now = Date.now();
    Object.keys(global._negoSessions).forEach((k) => {
      if (now - global._negoSessions[k].createdAt > 7200000) {
        delete global._negoSessions[k];
      }
    });

    res.json({
      sessionId,
      message:
        opener || buildNegoFallbackOpener(userRole, matchProfile, userCriteria),
      adverseRole,
      profile: {
        ville: matchProfile.ville,
        type: matchProfile.type,
        price: matchProfile.price || matchProfile.budgetMax,
        surface: matchProfile.surface || matchProfile.surfaceMin,
        pieces: matchProfile.pieces || matchProfile.piecesMin,
        compatibility: matchProfile.compatibility,
      },
    });
  } catch (err) {
    console.error("[/api/nego/start]", err);
    res.status(500).json({ error: "Erreur démarrage négociation" });
  }
});

// ─── Route POST /api/nego/turn ──────────────────────────────────────────────
// Envoie un tour de négociation et retourne la réponse de l'adversaire
app.post("/api/nego/turn", authenticateToken, async (req, res) => {
  try {
    const { sessionId, userMessage } = req.body;

    if (!sessionId || !userMessage) {
      return res.status(400).json({ error: "sessionId et userMessage requis" });
    }

    const session = global._negoSessions?.[sessionId];
    if (!session) {
      return res
        .status(404)
        .json({ error: "Session expirée — relancez la négociation" });
    }

    session.turnCount++;

    // Construire le contexte complet
    const messages = [
      { role: "system", content: session.systemPrompt },
      ...session.history,
      { role: "user", content: userMessage },
    ];

    const adverseReply = await callNegoLLM(messages, 500);

    if (!adverseReply) {
      return res.json({
        message: "Je dois réfléchir à votre proposition. Donnez-moi un moment.",
        outcome: null,
        analysis: null,
      });
    }

    // Mise à jour historique
    session.history.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: adverseReply },
    );

    // Détecter si accord, blocage ou abandon
    const outcome = detectNegoOutcome(adverseReply, userMessage, session);
    if (outcome) session.outcome = outcome;

    // Analyse post-tour (feedback coach)
    let analysis = null;
    if (session.turnCount % 3 === 0 || outcome) {
      analysis = await buildNegoAnalysis(
        session,
        userMessage,
        adverseReply,
        outcome,
      );
    }

    res.json({
      message: adverseReply,
      outcome,
      analysis,
      turnCount: session.turnCount,
      historyLength: session.history.length,
    });
  } catch (err) {
    console.error("[/api/nego/turn]", err);
    res.status(500).json({ error: "Erreur tour de négociation" });
  }
});

// ─── Route GET /api/nego/summary ────────────────────────────────────────────
// Retourne un résumé de la session de négociation avec conseils
app.get("/api/nego/summary/:sessionId", authenticateToken, async (req, res) => {
  try {
    const session = global._negoSessions?.[req.params.sessionId];
    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }

    const summaryPrompt = `Tu es un coach en négociation immobilière expert.
    
Voici la transcription d'une simulation de négociation :
Rôle de l'utilisateur : ${session.userRole === "buyer" ? "acheteur" : "vendeur"}
Profil du match : ${JSON.stringify(session.matchProfile)}
Nombre de tours : ${session.turnCount}
Résultat : ${session.outcome || "en cours"}

Historique :
${session.history.map((h) => `[${h.role === "user" ? "Utilisateur" : "Adversaire"}] ${h.content}`).join("\n\n")}

Fournis une analyse structurée en JSON :
{
  "globalNote": (note /10),
  "verdict": "court verdict en une phrase",
  "pointsForts": ["point 1", "point 2", "point 3"],
  "pointsFaibles": ["point 1", "point 2"],
  "objectionsRatees": ["objection qu'il aurait dû gérer"],
  "conseilPrioritaire": "un conseil actionnable précis",
  "prochaineFois": "ce qu'il faut faire différemment"
}

Réponds UNIQUEMENT avec le JSON, aucun texte en dehors.`;

    const summaryText = await callNegoLLM(
      [{ role: "user", content: summaryPrompt }],
      600,
    );

    let summary = null;
    if (summaryText) {
      try {
        const cleaned = summaryText
          .replace(/```json|```/g, "")
          .trim()
          .match(/\{[\s\S]*\}/)?.[0];
        if (cleaned) summary = JSON.parse(cleaned);
      } catch (e) {
        summary = { verdict: summaryText, globalNote: null };
      }
    }

    res.json({
      summary,
      turnCount: session.turnCount,
      outcome: session.outcome,
      historyLength: session.history.length,
    });
  } catch (err) {
    console.error("[/api/nego/summary]", err);
    res.status(500).json({ error: "Erreur résumé" });
  }
});

// ─── Helpers internes ────────────────────────────────────────────────────────
function buildNegoSystemPrompt(userRole, userCriteria, matchProfile) {
  const isBuyer = userRole === "buyer";

  // L'IA joue le rôle ADVERSE
  if (isBuyer) {
    // L'IA = vendeur, l'utilisateur = acheteur
    const price = matchProfile.price || matchProfile.budgetMax || 0;
    const surface = matchProfile.surface || matchProfile.surfaceMin || 0;
    const ville = matchProfile.ville || "France";
    const type = matchProfile.type || "bien";

    return `Tu es un vendeur immobilier expérimenté et légèrement difficile. 
Tu vends : ${type} à ${ville}, ${surface} m², prix demandé ${price.toLocaleString("fr-FR")} €.
État : ${matchProfile.etatBien || "bon état"}. DPE : ${matchProfile.niveauEnergetique || "D"}.

L'acheteur en face a un budget max de ${(userCriteria.budgetMax || userCriteria.budgetMin || "inconnu").toLocaleString?.("fr-FR") ?? "inconnu"} €.
Compatibilité calculée : ${matchProfile.compatibility}%.

TON RÔLE ET TA PSYCHOLOGIE :
- Tu tiens à ton prix mais tu peux bouger de 3% maximum au total
- Tu as une offre concurrente (fictive mais crédible) que tu peux mentionner
- Tu résistes aux baisses de prix agressives (plus de 5% d'un coup = tu t'énerves)
- Tu es sensible aux arguments sur l'état du bien, le DPE, ou la rapidité de la transaction
- Tu peux faire des concessions sur les équipements laissés (cuisine équipée, store, etc.)
- Tu utilises des techniques de vente réelles : urgence, ancrage haut, concession limitée
- Accent : professionnel mais ferme, quelques formules de vendeur aguerri

OBJECTIONS TYPES QUE TU VAS UTILISER (adapte-les naturellement) :
1. "J'ai une autre visite jeudi, je dois vous donner une réponse d'ici là"
2. "Le marché à ${ville} est en tension, les prix ne baissent pas"  
3. "Ce prix inclut la cuisine équipée qui vaut 15 000 €"
4. "Pour une transaction rapide, je peux faire un petit geste, mais pas plus de X €"
5. Sur le DPE : "Le DPE sera refait après travaux par le nouveau propriétaire, c'est dans le prix"

RÈGLES ABSOLUES :
- Ne cède JAMAIS plus de 3% du prix total sur l'ensemble de la négociation
- Si l'acheteur propose moins de ${Math.round(price * 0.9).toLocaleString("fr-FR")} €, tu romps les pourparlers
- Reste dans le personnage en permanence, même quand l'utilisateur parle de la simulation
- Réponds en 2-4 phrases maximum, ton de négociation réelle, pas de cours magistral
- Français naturel de professionnel de l'immobilier`;
  } else {
    // L'IA = acheteur, l'utilisateur = vendeur
    const budgetMax = matchProfile.budgetMax || matchProfile.budget || 0;
    const surface = matchProfile.surfaceMin || matchProfile.surface || 0;
    const ville = matchProfile.ville || "France";

    return `Tu es un acheteur sérieux mais exigeant et bien informé.
Tu cherches : ${matchProfile.type || "bien"} à ${ville}, min ${surface} m².
Ton budget maximum absolu : ${budgetMax.toLocaleString("fr-FR")} €.
Compatibilité avec ce bien : ${matchProfile.compatibility}%.

Le vendeur en face propose son bien. Prix de vente actuel : ${(userCriteria.budgetMin || userCriteria.price || "inconnu").toLocaleString?.("fr-FR") ?? "inconnu"} €.

TON RÔLE ET TA PSYCHOLOGIE :
- Tu aimes le bien mais tu ne le montres pas trop
- Tu as fait tes recherches sur les prix du marché à ${ville}
- Tu cherches à négocier une baisse de 5-8% en brandissant des arguments techniques
- Tu peux invoquer : le DPE, l'état général, les travaux à prévoir, la durée du bien sur le marché
- Tu as un "autre bien en cours" que tu peux mentionner pour créer de la pression
- Tu es prêt à conclure vite si le prix est juste

TACTIQUES QUE TU VAS UTILISER :
1. Pointer les défauts réels ou supposés (DPE, travaux, exposition, charges)
2. "J'ai vu un bien similaire à ${ville} à X € de moins il y a 15 jours"
3. "On a déjà un autre compromis en cours, mais votre bien nous plaît davantage"
4. Faire une première offre basse (-8%) puis remonter par paliers de 1%
5. Demander des contreparties : parking, cave, cuisine équipée, réduction des frais d'agence

RÈGLES ABSOLUES :
- Ne monte JAMAIS au-dessus de ton budget max ${budgetMax.toLocaleString("fr-FR")} €
- Si le vendeur ne bouge pas de plus de 2%, tu menaces de partir
- Reste dans le personnage
- 2-4 phrases max, ton naturel d'acheteur bien préparé`;
  }
}

function buildNegoFallbackOpener(userRole, matchProfile, userCriteria) {
  const isBuyer = userRole === "buyer";
  const price = matchProfile.price || matchProfile.budgetMax || 0;
  const ville = matchProfile.ville || "votre ville";

  if (isBuyer) {
    return `Bonjour. Comme convenu, je vous recontacte pour le bien à ${ville}. Le prix affiché est de ${price.toLocaleString("fr-FR")} €, et je dois vous dire que j'ai une autre visite de programmée cette semaine. Quelle est votre position aujourd'hui ?`;
  } else {
    return `Bonjour, j'ai bien visité votre bien à ${ville}. Il correspond globalement à ce que je cherche, mais j'ai quelques points à aborder avant de vous faire une offre. Est-ce qu'on peut parler du prix ?`;
  }
}

function detectNegoOutcome(adverseReply, userMessage, session) {
  const combined = (adverseReply + " " + userMessage).toLowerCase();

  // Accord
  if (
    /accord|deal|on signe|on est d'accord|topé|affaire conclue|compromis|notaire|félicitations/.test(
      combined,
    )
  ) {
    return "deal";
  }

  // Rupture
  if (
    /c'est non|je retire|offre refusée|cherchez ailleurs|on arrête|je ne vends pas à ce prix|vous plaisantez/.test(
      combined,
    )
  ) {
    return "walkaway";
  }

  // Blocage (après beaucoup de tours sans mouvement)
  if (session.turnCount >= 12) return "deadlock";

  return null;
}

async function buildNegoAnalysis(session, userMessage, adverseReply, outcome) {
  const analysisPrompt = `Coach de négociation immobilière. Analyse ce dernier échange en 2 phrases max.

Rôle utilisateur : ${session.userRole === "buyer" ? "acheteur" : "vendeur"}
Message utilisateur : "${userMessage}"
Réponse adversaire : "${adverseReply}"
${outcome ? `Résultat : ${outcome}` : ""}

Donne un feedback coach direct et actionnable. Commence par un emoji (✅ 💡 ⚠️ 🔴).
Texte brut uniquement, pas de JSON.`;

  try {
    return await callNegoLLM([{ role: "user", content: analysisPrompt }], 150);
  } catch {
    return null;
  }
}
// ================== PATCH /api/me (ville + contact) ==================
app.patch("/api/me", authenticateToken, async (req, res) => {
  try {
    const allowed = ["contact", "ville", "langue"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (!Object.keys(updates).length)
      return res.status(400).json({ error: "Aucun champ valide" });

    const setClauses = Object.keys(updates)
      .map((k, i) => `${k} = $${i + 1}`)
      .join(", ");
    const values = [...Object.values(updates), req.user.username];

    await db
      .prepare(
        `UPDATE users SET ${setClauses} WHERE username = $${values.length}`,
      )
      .run(...values);

    res.json({ success: true, updated: updates });
  } catch (err) {
    console.error("[PATCH /api/me]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== DELETE /api/delete-data ==================
app.delete("/api/delete-data", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.status(404).json({ error: "Introuvable" });

    await db.prepare(`DELETE FROM favorites WHERE user_id = $1`).run(user.id);
    await db
      .prepare(`DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $1`)
      .run(user.id);

    // Reset critères matching en mémoire
    const buyerIdx = BUYERS.findIndex((b) => b.username === req.user.username);
    if (buyerIdx >= 0) BUYERS.splice(buyerIdx, 1);
    const sellerIdx = SELLERS.findIndex(
      (s) => s.username === req.user.username,
    );
    if (sellerIdx >= 0) SELLERS.splice(sellerIdx, 1);

    // Reset critères en DB
    await db
      .prepare(
        `UPDATE users SET ville='', type='appartement', price=0, pieces=1, surface=10,
         budget=0, budgetmin=0, budgetmax=0, piecesmin=0, piecesmax=100,
         surfacemin=0, surfacemax=1000, tolerancekm=NULL, etatbien='',
         imagesbien='[]', niveauenergetique='', proximite='[]'
         WHERE id = $1`,
      )
      .run(user.id);

    res.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/delete-data]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== DELETE /api/delete-account ==================
app.delete("/api/delete-account", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.status(404).json({ error: "Introuvable" });

    // Cascade : favoris, messages, puis user
    await db.prepare(`DELETE FROM favorites WHERE user_id = $1`).run(user.id);
    await db
      .prepare(`DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $1`)
      .run(user.id);
    await db.prepare(`DELETE FROM users WHERE id = $1`).run(user.id);

    // Retirer des pools en mémoire
    const bi = BUYERS.findIndex((b) => b.username === req.user.username);
    if (bi >= 0) BUYERS.splice(bi, 1);
    const si = SELLERS.findIndex((s) => s.username === req.user.username);
    if (si >= 0) SELLERS.splice(si, 1);

    // Détruire la session chat
    delete sessions[req.user.username];

    res.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/delete-account]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== GET /api/notifications ==================
app.get("/api/notifications", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.status(404).json({ error: "Introuvable" });

    const notifs = await db
      .prepare(
        `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      )
      .all(user.id);

    res.json(notifs);
  } catch (err) {
    console.error("[GET /api/notifications]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== POST /api/notifications/read ==================
app.post("/api/notifications/read", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.status(404).json({ error: "Introuvable" });

    const { id } = req.body; // si id = null → marquer tout comme lu
    if (id) {
      await db
        .prepare(
          `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
        )
        .run(id, user.id);
    } else {
      await db
        .prepare(`UPDATE notifications SET read = true WHERE user_id = $1`)
        .run(user.id);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[POST /api/notifications/read]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== DELETE /api/notifications/:id ==================
app.delete("/api/notifications/:id", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.status(404).json({ error: "Introuvable" });

    await db
      .prepare(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`)
      .run(Number(req.params.id), user.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== GET /api/me/preferences ==================
app.get("/api/me/preferences", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT preferences FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.status(404).json({ error: "Introuvable" });
    let prefs = {};
    try {
      prefs = JSON.parse(user.preferences || "{}");
    } catch {}
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== PATCH /api/me/preferences ==================
app.patch("/api/me/preferences", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(
        `SELECT id, preferences FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.status(404).json({ error: "Introuvable" });

    let current = {};
    try {
      current = JSON.parse(user.preferences || "{}");
    } catch {}

    const merged = { ...current, ...req.body };

    await db
      .prepare(`UPDATE users SET preferences = $1 WHERE id = $2`)
      .run(JSON.stringify(merged), user.id);

    res.json({ success: true, preferences: merged });
  } catch (err) {
    console.error("[PATCH /api/me/preferences]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ================== PROJECTS API ==================

// GET tous les projets
app.get("/api/projects", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const projects = await db
      .prepare(
        `
      SELECT p.*,
        (SELECT COUNT(*) FROM project_chats pc WHERE pc.project_id = p.id) AS chat_count,
        (SELECT MAX(pc.updated_at) FROM project_chats pc WHERE pc.project_id = p.id) AS last_activity
      FROM projects p
      WHERE p.user_id = $1
      ORDER BY p.updated_at DESC
    `,
      )
      .all(user.id);

    res.json(projects);
  } catch (err) {
    console.error("[GET /api/projects]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST créer un projet
app.post("/api/projects", authenticateToken, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Nom requis" });

    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const result = await db
      .prepare(
        `
      INSERT INTO projects (user_id, name, description, color)
      VALUES ($1, $2, $3, $4) RETURNING id
    `,
      )
      .get(user.id, name.trim(), description || "", color || "#8b5cf6");

    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error("[POST /api/projects]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH renommer/mettre à jour un projet
app.patch("/api/projects/:id", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const { name, description, color } = req.body;
    await db
      .prepare(
        `
      UPDATE projects SET name=$1, description=$2, color=$3, updated_at=NOW()
      WHERE id=$4 AND user_id=$5
    `,
      )
      .run(
        name,
        description || "",
        color || "#8b5cf6",
        Number(req.params.id),
        user.id,
      );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE supprimer un projet
app.delete("/api/projects/:id", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    await db
      .prepare(`DELETE FROM projects WHERE id=$1 AND user_id=$2`)
      .run(Number(req.params.id), user.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET chats d'un projet
app.get("/api/projects/:id/chats", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const chats = await db
      .prepare(
        `
      SELECT id, title, created_at, updated_at,
        json_array_length(messages::json) AS message_count
      FROM project_chats
      WHERE project_id=$1 AND user_id=$2
      ORDER BY updated_at DESC
    `,
      )
      .all(Number(req.params.id), user.id);

    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST sauvegarder un chat dans un projet
app.post("/api/projects/:id/chats", authenticateToken, async (req, res) => {
  try {
    const { title, messages, criteria, phase, lastMatches } = req.body;
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    // Vérifier que le projet appartient à l'utilisateur
    const project = await db
      .prepare(`SELECT id FROM projects WHERE id=$1 AND user_id=$2`)
      .get(Number(req.params.id), user.id);
    if (!project) return res.status(403).json({ error: "Accès refusé" });

    const result = await db
      .prepare(
        `
      INSERT INTO project_chats (project_id, user_id, title, messages, criteria, phase, last_matches)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `,
      )
      .get(
        project.id,
        user.id,
        title || "Conversation sans titre",
        JSON.stringify(messages || []),
        JSON.stringify(criteria || {}),
        phase || "collecting",
        JSON.stringify(lastMatches || []),
      );

    res.json({ success: true, chatId: result.id });
  } catch (err) {
    console.error("[POST /api/projects/:id/chats]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET un chat spécifique
app.get("/api/projects/chats/:chatId", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const chat = await db
      .prepare(
        `
      SELECT pc.*, p.name AS project_name, p.color AS project_color
      FROM project_chats pc
      JOIN projects p ON pc.project_id = p.id
      WHERE pc.id=$1 AND pc.user_id=$2
    `,
      )
      .get(Number(req.params.chatId), user.id);

    if (!chat) return res.status(404).json({ error: "Chat introuvable" });

    res.json({
      ...chat,
      messages: JSON.parse(chat.messages || "[]"),
      criteria: JSON.parse(chat.criteria || "{}"),
      lastMatches: JSON.parse(chat.last_matches || "[]"),
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ════════════════════════════════════════════════════════════
// 2FA ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/2fa/status
app.get("/api/2fa/status", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);
    const tfa = await db
      .prepare(`SELECT enabled FROM user_2fa WHERE user_id = $1`)
      .get(user.id);
    res.json({ enabled: tfa?.enabled || false });
  } catch (err) {
    console.error("[2FA status]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/2fa/enable — valide le code TOTP et active la 2FA
app.post("/api/2fa/enable", authenticateToken, async (req, res) => {
  try {
    const { secret, code } = req.body;
    if (!secret || !code)
      return res.status(400).json({ error: "secret et code requis" });

    // Vérification TOTP
    // Note : pour une vérif simple sans lib, on accepte tout code à 6 chiffres valide
    // En production, utiliser speakeasy ou otplib
    // Ici on valide le format et on fait confiance au client (amélioration : valider côté serveur avec la lib)
    if (!/^\d{6}$/.test(code))
      return res.status(400).json({ error: "Code invalide" });

    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const backupCodes = generateBackupCodes(8);
    const hashedCodes = backupCodes; // En prod : hasher chaque code avec bcrypt

    // Upsert 2FA record
    const existing = await db
      .prepare(`SELECT id FROM user_2fa WHERE user_id = $1`)
      .get(user.id);
    if (existing) {
      await db
        .prepare(
          `UPDATE user_2fa SET secret = $1, enabled = true, backup_codes = $2 WHERE user_id = $3`,
        )
        .run(secret, JSON.stringify(hashedCodes), user.id);
    } else {
      await db
        .prepare(
          `INSERT INTO user_2fa (user_id, secret, enabled, backup_codes) VALUES ($1, $2, true, $3)`,
        )
        .run(user.id, secret, JSON.stringify(hashedCodes));
    }

    // Notifier l'utilisateur
    await db
      .prepare(
        `INSERT INTO notifications (user_id, type, title, body, data, read) VALUES ($1, $2, $3, $4, $5, false)`,
      )
      .run(
        user.id,
        "match",
        "2FA activé",
        "La double authentification a été activée sur votre compte.",
        "{}",
      );

    res.json({ success: true, backupCodes });
  } catch (err) {
    console.error("[2FA enable]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/2fa/disable
app.post("/api/2fa/disable", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);
    await db
      .prepare(`UPDATE user_2fa SET enabled = false WHERE user_id = $1`)
      .run(user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/2fa/recover — login avec code de récupération (utilisé depuis login.html)
// NOUVEAU : permet de se connecter sans mot de passe avec un code de récup
app.post("/api/2fa/recover", async (req, res) => {
  try {
    const { recoveryCode } = req.body;
    if (!recoveryCode) return res.status(400).json({ error: "Code requis" });

    // Chercher dans tous les user_2fa quel utilisateur a ce code
    const allTfa = await db
      .prepare(
        `SELECT user_id, backup_codes FROM user_2fa WHERE enabled = true`,
      )
      .all();

    let foundUserId = null;
    let foundTfaRecord = null;

    for (const tfaRecord of allTfa) {
      let codes = [];
      try {
        codes = JSON.parse(tfaRecord.backup_codes || "[]");
      } catch {}
      const codeIndex = codes.findIndex(
        (c) => c === recoveryCode.trim().toUpperCase(),
      );
      if (codeIndex !== -1) {
        foundUserId = tfaRecord.user_id;
        foundTfaRecord = { ...tfaRecord, codes, codeIndex };
        break;
      }
    }

    if (!foundUserId)
      return res.status(401).json({ error: "Code de récupération invalide" });

    // Invalider le code utilisé (one-time use)
    foundTfaRecord.codes.splice(foundTfaRecord.codeIndex, 1);
    await db
      .prepare(`UPDATE user_2fa SET backup_codes = $1 WHERE user_id = $2`)
      .run(JSON.stringify(foundTfaRecord.codes), foundUserId);

    // Récupérer l'utilisateur et générer un token
    const user = await db
      .prepare(`SELECT * FROM users WHERE id = $1`)
      .get(foundUserId);
    if (!user)
      return res.status(404).json({ error: "Utilisateur introuvable" });

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      username: user.username,
      role: user.role,
    });
  } catch (err) {
    console.error("[2FA recover]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ════════════════════════════════════════════════════════════
// WORKSPACE ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/workspace/members — liste mes membres (invités + actifs)
// GET /api/workspace/members — liste mes membres ET les owners dont je suis membre
app.get("/api/workspace/members", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    // 1. Membres que J'AI invités (je suis owner)
    const myInvited = await db
      .prepare(
        `SELECT wm.role, wm.status, u.username, 'invited' AS direction
         FROM workspace_members wm
         JOIN users u ON wm.member_id = u.id
         WHERE wm.owner_id = $1
         ORDER BY wm.created_at DESC`,
      )
      .all(user.id);

    // 2. Owners dont JE SUIS membre (vue symétrique — BUG 8 FIX)
    const iAmMemberOf = await db
      .prepare(
        `SELECT wm.role, wm.status, u.username, 'member_of' AS direction
         FROM workspace_members wm
         JOIN users u ON wm.owner_id = u.id
         WHERE wm.member_id = $1 AND wm.status = 'active'
         ORDER BY wm.created_at DESC`,
      )
      .all(user.id);

    // Fusionner : d'abord mes invités, puis les owners actifs
    const all = [...myInvited, ...iAmMemberOf];
    res.json(all);
  } catch (err) {
    console.error("[workspace members]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// POST /api/workspace/invite — envoyer une invitation
app.post("/api/workspace/invite", authenticateToken, async (req, res) => {
  try {
    const { targetUsername, targetEmail, role = "readonly" } = req.body;

    if (!targetUsername) {
      return res.status(400).json({ error: "Pseudo requis" });
    }

    const owner = await db
      .prepare(
        "SELECT id, username FROM users WHERE LOWER(TRIM(username)) = $1",
      )
      .get(req.user.username.trim().toLowerCase());

    if (!owner) {
      return res.sendStatus(404);
    }

    // Si email fourni, vérifier que pseudo + email correspondent au même compte
    let target;

    if (targetEmail && targetEmail.trim()) {
      target = await db
        .prepare(
          "SELECT id, username FROM users WHERE LOWER(TRIM(username)) = $1 AND LOWER(TRIM(contact)) = $2",
        )
        .get(
          targetUsername.trim().toLowerCase(),
          targetEmail.trim().toLowerCase(),
        );

      if (!target) {
        return res.status(404).json({
          error: "Pseudo et e-mail ne correspondent pas au même compte",
        });
      }
    } else {
      target = await db
        .prepare(
          "SELECT id, username FROM users WHERE LOWER(TRIM(username)) = $1",
        )
        .get(targetUsername.trim().toLowerCase());

      if (!target) {
        return res.status(404).json({
          error: "Utilisateur introuvable",
        });
      }
    }

    if (target.id === owner.id) {
      return res.status(400).json({
        error: "Vous ne pouvez pas vous inviter vous-même",
      });
    }

    const existing = await db
      .prepare(
        "SELECT id, status FROM workspace_members WHERE owner_id = $1 AND member_id = $2",
      )
      .get(owner.id, target.id);

    if (existing) {
      return res.status(409).json({
        error:
          existing.status === "pending"
            ? "Invitation déjà envoyée"
            : "Utilisateur déjà membre",
      });
    }

    await db
      .prepare(
        "INSERT INTO workspace_members (owner_id, member_id, role, status) VALUES ($1, $2, $3, 'pending')",
      )
      .run(owner.id, target.id, role);

    await db
      .prepare(
        "INSERT INTO notifications (user_id, type, title, body, data, read) VALUES ($1, $2, $3, $4, $5, false)",
      )
      .run(
        target.id,
        "match",
        "Invitation espace de travail",
        `${owner.username} vous invite à rejoindre son espace de travail en tant que ${
          role === "collab" ? "co-acheteur" : "lecteur"
        }. Acceptez ou refusez depuis cette notification.`,
        JSON.stringify({
          type: "workspace_invite",
          ownerId: owner.id,
          ownerUsername: owner.username,
          role,
        }),
      );

    res.json({
      success: true,
      message: `Invitation envoyée à ${target.username}`,
    });
  } catch (err) {
    console.error("[workspace invite]", err);

    res.status(500).json({
      error: "Erreur serveur",
    });
  }
});

// POST /api/workspace/accept — accepter une invitation
app.post("/api/workspace/accept", authenticateToken, async (req, res) => {
  try {
    const { ownerUsername } = req.body;
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    const owner = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get((ownerUsername || "").trim().toLowerCase());
    if (!user || !owner) return res.sendStatus(404);

    await db
      .prepare(
        `UPDATE workspace_members SET status = 'active' WHERE owner_id = $1 AND member_id = $2`,
      )
      .run(owner.id, user.id);

    // Notifier le propriétaire
    await db
      .prepare(
        `INSERT INTO notifications (user_id, type, title, body, data, read) VALUES ($1, $2, $3, $4, $5, false)`,
      )
      .run(
        owner.id,
        "match",
        "Invitation acceptée",
        `${req.user.username} a rejoint votre espace de travail.`,
        "{}",
      );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/workspace/decline — refuser une invitation
app.post("/api/workspace/decline", authenticateToken, async (req, res) => {
  try {
    const { ownerUsername } = req.body;
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    const owner = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get((ownerUsername || "").trim().toLowerCase());
    if (!user || !owner) return res.sendStatus(404);

    await db
      .prepare(
        `DELETE FROM workspace_members WHERE owner_id = $1 AND member_id = $2`,
      )
      .run(owner.id, user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/workspace/members/:username — retirer un membre
app.delete(
  "/api/workspace/members/:username",
  authenticateToken,
  async (req, res) => {
    try {
      const owner = await db
        .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
        .get(req.user.username.trim().toLowerCase());
      const member = await db
        .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
        .get(req.params.username.trim().toLowerCase());
      if (!owner || !member) return res.sendStatus(404);

      await db
        .prepare(
          `DELETE FROM workspace_members WHERE owner_id = $1 AND member_id = $2`,
        )
        .run(owner.id, member.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ════════════════════════════════════════════════════════════
// AGENDA ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/agenda — liste les événements de l'utilisateur
app.get("/api/agenda", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const events = await db
      .prepare(
        `
      SELECT id, name, date, time, description, color, notified
      FROM agenda_events
      WHERE user_id = $1
      ORDER BY date ASC, time ASC
    `,
      )
      .all(user.id);

    res.json(events);
  } catch (err) {
    console.error("[agenda get]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/agenda — créer un événement
app.post("/api/agenda", authenticateToken, async (req, res) => {
  try {
    const { name, date, time, description, color } = req.body;
    if (!name || !date)
      return res.status(400).json({ error: "name et date requis" });

    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const result = await db
      .prepare(
        `
      INSERT INTO agenda_events (user_id, name, date, time, description, color)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `,
      )
      .get(user.id, name, date, time || "", description || "", color || "");

    res.json({ success: true, id: result?.id });
  } catch (err) {
    console.error("[agenda post]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/agenda/:id
app.delete("/api/agenda/:id", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    await db
      .prepare(`DELETE FROM agenda_events WHERE id = $1 AND user_id = $2`)
      .run(Number(req.params.id), user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/agenda/:id — marquer comme notifié
// PATCH /api/agenda/:id — mise à jour partielle (notifié, ou autres champs)
app.patch("/api/agenda/:id", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const { notified, name, date, time, description, color } = req.body;
    const fields = [];
    const values = [];

    if (notified !== undefined) {
      fields.push("notified = $" + (values.length + 1));
      values.push(notified);
    }
    if (name !== undefined) {
      fields.push("name = $" + (values.length + 1));
      values.push(name);
    }
    if (date !== undefined) {
      fields.push("date = $" + (values.length + 1));
      values.push(date);
    }
    if (time !== undefined) {
      fields.push("time = $" + (values.length + 1));
      values.push(time);
    }
    if (description !== undefined) {
      fields.push("description = $" + (values.length + 1));
      values.push(description);
    }
    if (color !== undefined) {
      fields.push("color = $" + (values.length + 1));
      values.push(color);
    }

    if (!fields.length)
      return res.status(400).json({ error: "Aucun champ à mettre à jour" });

    values.push(Number(req.params.id), user.id);
    await db
      .prepare(
        `UPDATE agenda_events SET ${fields.join(", ")} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
      )
      .run(...values);

    res.json({ success: true });
  } catch (err) {
    console.error("[agenda patch]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ════════════════════════════════════════════════════════════
// INTEGRATIONS ROUTES
// ════════════════════════════════════════════════════════════

// GET /api/integrations
app.get("/api/integrations", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(
        `SELECT integrations FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(req.user.username.trim().toLowerCase());
    let connected = [];
    try {
      connected = JSON.parse(user?.integrations || "[]");
    } catch {}
    res.json({ connected });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/integrations/connect
app.post("/api/integrations/connect", authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const user = await db
      .prepare(
        `SELECT id, integrations FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);
    let list = [];
    try {
      list = JSON.parse(user.integrations || "[]");
    } catch {}
    const alreadyConnected = list.includes(name);
    if (!list.includes(name)) list.push(name);
    await db
      .prepare(`UPDATE users SET integrations = $1 WHERE id = $2`)
      .run(JSON.stringify(list), user.id);

    // Envoyer le message de bienvenue si première connexion
    if (!alreadyConnected) {
      sendWelcomeMessage(user.id, req.user.username, name).catch((e) =>
        console.warn("[welcome msg]", e.message),
      );
    }

    res.json({ success: true, connected: list });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/integrations/disconnect
app.post(
  "/api/integrations/disconnect",
  authenticateToken,
  async (req, res) => {
    try {
      const { name } = req.body;
      const user = await db
        .prepare(
          `SELECT id, integrations FROM users WHERE LOWER(TRIM(username)) = $1`,
        )
        .get(req.user.username.trim().toLowerCase());
      if (!user) return res.sendStatus(404);
      let list = [];
      try {
        list = JSON.parse(user.integrations || "[]");
      } catch {}
      list = list.filter((n) => n !== name);
      await db
        .prepare(`UPDATE users SET integrations = $1 WHERE id = $2`)
        .run(JSON.stringify(list), user.id);
      res.json({ success: true, connected: list });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// POST /api/integrations/whatsapp — enregistrer le numéro WhatsApp
app.post("/api/integrations/whatsapp", authenticateToken, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Numéro requis" });
    // Stocker dans les préférences
    const user = await db
      .prepare(
        `SELECT id, preferences FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);
    let prefs = {};
    try {
      prefs = JSON.parse(user.preferences || "{}");
    } catch {}
    prefs.whatsappPhone = phone;
    await db
      .prepare(`UPDATE users SET preferences = $1 WHERE id = $2`)
      .run(JSON.stringify(prefs), user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ════════════════════════════════════════════════════════════
// WORKSPACE NOTIFICATION ACTIONS
// Ces routes permettent d'accepter/refuser depuis le centre de notifs
// (appelé par le centre de notifications quand l'user clique sur la notif)
// ════════════════════════════════════════════════════════════

// POST /api/workspace/respond — répondre à une invitation depuis les notifs
app.post("/api/workspace/respond", authenticateToken, async (req, res) => {
  try {
    const { ownerUsername, accept } = req.body;
    const route = accept ? "/api/workspace/accept" : "/api/workspace/decline";
    // Rediriger vers la bonne route interne
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    const owner = await db
      .prepare(
        `SELECT id, username FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get((ownerUsername || "").trim().toLowerCase());
    if (!user || !owner) return res.sendStatus(404);

    if (accept) {
      await db
        .prepare(
          `UPDATE workspace_members SET status = 'active' WHERE owner_id = $1 AND member_id = $2`,
        )
        .run(owner.id, user.id);
      await db
        .prepare(
          `INSERT INTO notifications (user_id, type, title, body, data, read) VALUES ($1, $2, $3, $4, $5, false)`,
        )
        .run(
          owner.id,
          "match",
          "Invitation acceptée",
          `${req.user.username} a rejoint votre espace de travail.`,
          "{}",
        );
    } else {
      await db
        .prepare(
          `DELETE FROM workspace_members WHERE owner_id = $1 AND member_id = $2`,
        )
        .run(owner.id, user.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// POST /api/notifications/agenda — créé par le checker côté client
app.post("/api/notifications/agenda", authenticateToken, async (req, res) => {
  try {
    const { title, body, eventId } = req.body;

    const user = await db
      .prepare("SELECT id FROM users WHERE LOWER(TRIM(username)) = $1")
      .get(req.user.username.trim().toLowerCase());

    if (!user) return res.sendStatus(404);

    // Éviter les doublons (une seule notif par event par jour)
    const existing = await db
      .prepare(
        "SELECT id FROM notifications WHERE user_id = $1 AND data::text LIKE $2 AND created_at > NOW() - INTERVAL '24 hours'",
      )
      .get(user.id, `%"eventId":${eventId}%`)
      .catch(() => null);

    if (!existing) {
      await db
        .prepare(
          "INSERT INTO notifications (user_id, type, title, body, data, read) VALUES ($1, $2, $3, $4, $5, false)",
        )
        .run(
          user.id,
          "match",
          title || "Événement agenda",
          body || "",
          JSON.stringify({ eventId, type: "agenda" }),
        );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[agenda notif]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ── BEACON endpoint pour persistance temps d'écran à la fermeture de page ──
app.post("/api/me/preferences-beacon", async (req, res) => {
  try {
    // sendBeacon envoie du text/plain (pas de JSON content-type standard)
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {}
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.sendStatus(204);
    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.sendStatus(204);
    }

    const user = await db
      .prepare(
        `SELECT id, preferences FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(decoded.username.trim().toLowerCase());
    if (!user) return res.sendStatus(204);

    let current = {};
    try {
      current = JSON.parse(user.preferences || "{}");
    } catch {}

    const merged = { ...current, ...body };
    await db
      .prepare(`UPDATE users SET preferences = $1 WHERE id = $2`)
      .run(JSON.stringify(merged), user.id);

    res.sendStatus(204);
  } catch (err) {
    console.error("[beacon preferences]", err);
    res.sendStatus(204); // beacon ne lit pas la réponse, toujours 204
  }
});

// GET /api/workspace/data/:type — récupérer données partagées
app.get("/api/workspace/data/:type", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const { type } = req.params;

    // Récupérer TOUTES les relations actives de cet utilisateur (owner OU member)
    const asOwner = await db
      .prepare(
        `SELECT owner_id, member_id FROM workspace_members WHERE owner_id = $1 AND status = 'active'`,
      )
      .all(user.id);
    const asMember = await db
      .prepare(
        `SELECT owner_id, member_id FROM workspace_members WHERE member_id = $1 AND status = 'active'`,
      )
      .all(user.id);

    // Fusionner toutes les relations sans doublon
    const relMap = new Map();
    for (const r of [...asOwner, ...asMember]) {
      const key = `${Math.min(r.owner_id, r.member_id)}_${Math.max(r.owner_id, r.member_id)}`;
      if (!relMap.has(key)) relMap.set(key, r);
    }
    const relations = [...relMap.values()];

    if (!relations.length) return res.json([]);

    // Pour chaque relation, récupérer les données dans LES DEUX SENS
    // (owner_id/member_id peuvent être inversés selon qui a créé la donnée)
    const allRows = [];
    for (const rel of relations) {
      const ownerId = rel.owner_id;
      const memberId = rel.member_id;

      // Données créées par owner (owner_id=ownerId, member_id=memberId)
      const rows1 = await db
        .prepare(
          `SELECT * FROM workspace_data WHERE owner_id = $1 AND member_id = $2 AND type = $3 ORDER BY updated_at DESC`,
        )
        .all(ownerId, memberId, type);

      // Données créées par member (owner_id=memberId, member_id=ownerId — cas où le member a posté en premier)
      const rows2 = await db
        .prepare(
          `SELECT * FROM workspace_data WHERE owner_id = $1 AND member_id = $2 AND type = $3 ORDER BY updated_at DESC`,
        )
        .all(memberId, ownerId, type);

      allRows.push(...rows1, ...rows2);
    }

    // Dédupliquer par id
    const seen = new Map();
    for (const r of allRows) {
      if (!seen.has(r.id)) seen.set(r.id, r);
    }

    const result = [...seen.values()]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .map((r) => {
        let value = r.value;
        try {
          value = JSON.parse(r.value);
        } catch {}
        return { ...r, value };
      });

    res.json(result);
  } catch (err) {
    console.error("[workspace data get]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/workspace/data/:type — sauvegarder données partagées
app.post("/api/workspace/data/:type", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const { type } = req.params;
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "key requis" });

    const asOwner = await db
      .prepare(
        `SELECT owner_id, member_id FROM workspace_members WHERE owner_id = $1 AND status = 'active' LIMIT 1`,
      )
      .get(user.id);
    const asMember = await db
      .prepare(
        `SELECT owner_id, member_id FROM workspace_members WHERE member_id = $1 AND status = 'active' LIMIT 1`,
      )
      .get(user.id);

    const rel = asOwner || asMember;
    if (!rel)
      return res
        .status(403)
        .json({ error: "Aucune relation workspace active" });

    // Ordre canonique : toujours le plus petit id en owner pour éviter les doublons owner↔member
    const ownerId = Math.min(rel.owner_id, rel.member_id);
    const memberId = Math.max(rel.owner_id, rel.member_id);
    const valueStr = JSON.stringify(value);

    if (isProd) {
      await db
        .prepare(
          `
        INSERT INTO workspace_data (owner_id, member_id, type, key, value, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (owner_id, member_id, type, key)
        DO UPDATE SET value = $5, updated_at = NOW()
      `,
        )
        .run(ownerId, memberId, type, key, valueStr, user.id);
    } else {
      const existing = await db
        .prepare(
          `SELECT id FROM workspace_data WHERE owner_id = ? AND member_id = ? AND type = ? AND key = ?`,
        )
        .get(ownerId, memberId, type, key);
      if (existing) {
        await db
          .prepare(
            `UPDATE workspace_data SET value = ?, updated_at = datetime('now') WHERE id = ?`,
          )
          .run(valueStr, existing.id);
      } else {
        await db
          .prepare(
            `INSERT INTO workspace_data (owner_id, member_id, type, key, value, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(ownerId, memberId, type, key, valueStr, user.id);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[workspace data post]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/workspace/data/:type/:key
app.delete(
  "/api/workspace/data/:type/:key",
  authenticateToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
        .get(req.user.username.trim().toLowerCase());
      if (!user) return res.sendStatus(404);

      const { type, key } = req.params;

      const asOwner = await db
        .prepare(
          `SELECT owner_id, member_id FROM workspace_members WHERE owner_id = $1 AND status = 'active' LIMIT 1`,
        )
        .get(user.id);
      const asMember = await db
        .prepare(
          `SELECT owner_id, member_id FROM workspace_members WHERE member_id = $1 AND status = 'active' LIMIT 1`,
        )
        .get(user.id);
      const rel = asOwner || asMember;
      if (!rel)
        return res.status(403).json({ error: "Aucune relation active" });
      const ownerId = Math.min(rel.owner_id, rel.member_id);
      const memberId = Math.max(rel.owner_id, rel.member_id);
      await db
        .prepare(
          `DELETE FROM workspace_data WHERE owner_id = $1 AND member_id = $2 AND type = $3 AND key = $4`,
        )
        .run(ownerId, memberId, type, key);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// POST /api/workspace/upload — partager un document (metadata, fichier déjà uploadé via Cloudinary)
app.post("/api/workspace/upload", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const { name, url, size, fileType } = req.body;
    if (!name || !url)
      return res.status(400).json({ error: "name et url requis" });

    const asOwner = await db
      .prepare(
        `SELECT owner_id, member_id FROM workspace_members WHERE owner_id = $1 AND status = 'active' LIMIT 1`,
      )
      .get(user.id);
    const asMember = await db
      .prepare(
        `SELECT owner_id, member_id FROM workspace_members WHERE member_id = $1 AND status = 'active' LIMIT 1`,
      )
      .get(user.id);
    const rel = asOwner || asMember;
    if (!rel) return res.status(403).json({ error: "Aucune relation active" });

    const key = `doc_${Date.now()}`;
    const value = JSON.stringify({
      name,
      url,
      size,
      fileType,
      uploadedBy: req.user.username,
      uploadedAt: new Date().toISOString(),
    });

    const ownerId = Math.min(rel.owner_id, rel.member_id);
    const memberId = Math.max(rel.owner_id, rel.member_id);
    if (isProd) {
      await db
        .prepare(
          `
        INSERT INTO workspace_data (owner_id, member_id, type, key, value, created_by, updated_at)
        VALUES ($1, $2, 'documents', $3, $4, $5, NOW())
      `,
        )
        .run(ownerId, memberId, key, value, user.id);
    } else {
      await db
        .prepare(
          `INSERT INTO workspace_data (owner_id, member_id, type, key, value, created_by) VALUES (?, ?, 'documents', ?, ?, ?)`,
        )
        .run(ownerId, memberId, key, value, user.id);
    }
    res.json({ success: true, key });
  } catch (err) {
    console.error("[workspace upload]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ═══════════════════════════════════════════════════
// RESET MOT DE PASSE VIA CODE DE RÉCUPÉRATION 2FA
// ═══════════════════════════════════════════════════

// POST /api/2fa/verify-recovery — étape 1 : valider pseudo + code récup
app.post("/api/2fa/verify-recovery", async (req, res) => {
  try {
    const { username, recoveryCode } = req.body;
    if (!username || !recoveryCode)
      return res.status(400).json({ error: "Pseudo et code requis" });

    const user = await db
      .prepare(
        `SELECT id, username FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(username.trim().toLowerCase());
    if (!user)
      return res.status(404).json({ error: "Utilisateur introuvable" });

    const tfaRecord = await db
      .prepare(
        `SELECT backup_codes FROM user_2fa WHERE user_id = $1 AND enabled = true`,
      )
      .get(user.id);
    if (!tfaRecord)
      return res.status(404).json({ error: "Aucune 2FA active sur ce compte" });

    let codes = [];
    try {
      codes = JSON.parse(tfaRecord.backup_codes || "[]");
    } catch {}

    const codeNorm = recoveryCode.trim().toUpperCase();
    const codeIndex = codes.findIndex((c) => c === codeNorm);
    if (codeIndex === -1)
      return res.status(401).json({ error: "Code de récupération invalide" });

    // Générer un token temporaire de reset (valable 10 min)
    const resetToken = jwt.sign(
      { userId: user.id, username: user.username, purpose: "password_reset" },
      JWT_SECRET,
      { expiresIn: "10m" },
    );

    res.json({ success: true, resetToken, username: user.username });
  } catch (err) {
    console.error("[2FA verify-recovery]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/2fa/reset-password — étape 2 : changer le mot de passe avec le token temporaire
app.post("/api/2fa/reset-password", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword)
      return res
        .status(400)
        .json({ error: "Token et nouveau mot de passe requis" });
    if (newPassword.length < 8)
      return res
        .status(400)
        .json({ error: "Le mot de passe doit contenir au moins 8 caractères" });

    let decoded;
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET);
    } catch {
      return res
        .status(401)
        .json({ error: "Token expiré ou invalide. Recommencez." });
    }

    if (decoded.purpose !== "password_reset")
      return res.status(401).json({ error: "Token invalide" });

    const newHash = await bcrypt.hash(newPassword, 10);
    await db
      .prepare(`UPDATE users SET password = $1 WHERE id = $2`)
      .run(newHash, decoded.userId);

    // Notifier l'utilisateur
    await db
      .prepare(
        `INSERT INTO notifications (user_id, type, title, body, data, read) VALUES ($1, $2, $3, $4, $5, false)`,
      )
      .run(
        decoded.userId,
        "match",
        "Mot de passe modifié",
        "Votre mot de passe a été réinitialisé via un code de récupération.",
        "{}",
      );

    res.json({ success: true });
  } catch (err) {
    console.error("[2FA reset-password]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ════════════════════════════════════════════════════════════
// INTÉGRATIONS RÉELLES — WhatsApp (Twilio) · Telegram · Slack · Google Calendar
// ════════════════════════════════════════════════════════════

import twilio from "twilio";
import { google } from "googleapis";

// ── Twilio WhatsApp ──────────────────────────────────────────
const twilioClient = process.env.TWILIO_ACCOUNT_SID
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

async function sendWhatsAppMessage(to, body) {
  if (!twilioClient) throw new Error("Twilio non configuré");
  return twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${to}`,
    body,
  });
}

// ── Telegram Bot ─────────────────────────────────────────────
async function sendTelegramMessage(chatId, text, parseMode = "HTML") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram non configuré");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.description || "Telegram error");
  }
  return res.json();
}

async function sendTelegramDocument(chatId, pdfBuffer, filename, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram non configuré");
  const { default: FormData } = await import("form-data");
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", pdfBuffer, {
    filename,
    contentType: "application/pdf",
  });
  if (caption) form.append("caption", caption);
  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error("Telegram doc error");
  return res.json();
}

// ── Slack Webhook ─────────────────────────────────────────────
async function sendSlackMessage(webhookUrl, blocks, text = "") {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, blocks }),
  });
  if (!res.ok) throw new Error("Slack webhook error");
}

// ── Google OAuth2 ─────────────────────────────────────────────
function getGoogleOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

// ── Helper : charger les prefs utilisateur ─────────────────────
async function getUserPrefs(userId) {
  const user = await db
    .prepare(`SELECT preferences FROM users WHERE id = $1`)
    .get(userId);
  try {
    return JSON.parse(user?.preferences || "{}");
  } catch {
    return {};
  }
}

// ── Helper : charger les stats utilisateur pour rapports ──────
async function buildUserReport(userId, username) {
  const favResult = await db
    .prepare(`SELECT COUNT(*) AS count FROM favorites WHERE user_id = $1`)
    .get(userId);
  const msgResult = await db
    .prepare(
      `SELECT COUNT(DISTINCT CASE WHEN sender_id=$1 THEN receiver_id ELSE sender_id END) AS count FROM messages WHERE sender_id=$1 OR receiver_id=$1`,
    )
    .get(userId);
  const notifResult = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND read = false`,
    )
    .get(userId);
  const agendaResult = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM agenda_events WHERE user_id = $1 AND date >= CURRENT_DATE`,
    )
    .get(userId);

  const buyerProfile = BUYERS.find((b) => b.username === username);
  const sellerProfile = SELLERS.find((s) => s.username === username);
  const matches = buyerProfile
    ? getStatsMatches(buyerProfile, 5)
    : sellerProfile
      ? matchSellerToBuyers(sellerProfile, 5)
      : [];

  return {
    username,
    role: buyerProfile ? "Acheteur" : sellerProfile ? "Vendeur" : "Utilisateur",
    totalFavoris: favResult?.count || 0,
    activeConversations: msgResult?.count || 0,
    unreadNotifs: notifResult?.count || 0,
    upcomingEvents: agendaResult?.count || 0,
    topMatches: matches.slice(0, 3),
    avgCompatibility: matches.length
      ? Math.round(
          matches.reduce((s, m) => s + m.compatibility, 0) / matches.length,
        )
      : 0,
    criteria: buyerProfile || sellerProfile || {},
    generatedAt: new Date().toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

// ════════════════════════════════════════════════════════════
// ROUTE : Message de bienvenue à la connexion d'une intégration
// Appelée depuis /api/integrations/connect (modification à faire)
// ════════════════════════════════════════════════════════════
async function sendWelcomeMessage(userId, username, integrationType) {
  const prefs = await getUserPrefs(userId);
  const report = await buildUserReport(userId, username);

  switch (integrationType) {
    case "whatsapp": {
      const phone = prefs.whatsappPhone;
      if (!phone) return;
      const welcome = `🏠 *Bienvenue sur AiGENT Immobilier !*\n\nVotre compte *${username}* est maintenant connecté à WhatsApp.\n\n📊 *Votre profil en un coup d'œil :*\n• Rôle : ${report.role}\n• Favoris : ${report.totalFavoris}\n• Conversations actives : ${report.activeConversations}\n• Compatibilité moyenne : ${report.avgCompatibility}%\n\n✅ Vous recevrez ici :\n→ Alertes Deal Radar en temps réel\n→ Rapport hebdomadaire de vos matchs\n→ Notifications importantes\n\n_Propulsé par AiGENT — monaigentimmobilier.fr_`;
      await sendWhatsAppMessage(phone, welcome).catch((e) =>
        console.warn("[WhatsApp welcome]", e.message),
      );
      break;
    }
    case "telegram": {
      const chatId = prefs.telegramChatId;
      if (!chatId) return;
      const welcome = `🏠 <b>Bienvenue sur AiGENT Immobilier !</b>\n\nVotre compte <b>${username}</b> est connecté à Telegram.\n\n📊 <b>Profil :</b>\n• Rôle : ${report.role}\n• Favoris sauvegardés : ${report.totalFavoris}\n• Conversations : ${report.activeConversations}\n• Compatibilité moy. : ${report.avgCompatibility}%\n• Événements à venir : ${report.upcomingEvents}\n\n✅ <b>Vous recevrez ici :</b>\n→ Alertes Deal Radar prioritaires\n→ Rapport hebdomadaire PDF de vos recherches\n→ Nouvelles correspondances détectées\n→ Rappels agenda immobilier\n\n<i>Propulsé par AiGENT</i>`;
      await sendTelegramMessage(chatId, welcome).catch((e) =>
        console.warn("[Telegram welcome]", e.message),
      );
      break;
    }
    case "slack": {
      const webhook = prefs.slackWebhook;
      if (!webhook) return;
      const blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🏠 *AiGENT Immobilier* — Connexion confirmée\n*${username}* (${report.role}) vient de connecter son compte Slack.`,
          },
        },
        { type: "divider" },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Favoris*\n${report.totalFavoris}` },
            {
              type: "mrkdwn",
              text: `*Conversations actives*\n${report.activeConversations}`,
            },
            {
              type: "mrkdwn",
              text: `*Compatibilité moyenne*\n${report.avgCompatibility}%`,
            },
            {
              type: "mrkdwn",
              text: `*Événements agenda*\n${report.upcomingEvents}`,
            },
          ],
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✅ *Ce canal recevra :*\n→ Alertes Deal Radar\n→ Résumés hebdomadaires de matchs\n→ Nouvelles correspondances\n→ Rapports d'activité`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Connecté le ${report.generatedAt} · monaigentimmobilier.fr_`,
            },
          ],
        },
      ];
      await sendSlackMessage(
        webhook,
        blocks,
        `AiGENT — ${username} connecté`,
      ).catch((e) => console.warn("[Slack welcome]", e.message));
      break;
    }
    case "google-agenda": {
      // La notif de bienvenue se fait via l'event Google Calendar (voir route callback OAuth)
      break;
    }
    case "gmail": {
      const email = prefs.gmailEmail;
      if (!email) return;
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
      });
      await transporter
        .sendMail({
          from: `"AiGENT Immobilier" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: `🏠 Bienvenue ${username} — Votre compte AiGENT est connecté`,
          html: buildWelcomeEmailHTML(report),
        })
        .catch((e) => console.warn("[Gmail welcome]", e.message));
      break;
    }
  }
}

function buildWelcomeEmailHTML(report) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#6d28d9;padding:28px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700">🏠 AiGENT Immobilier</h1>
    <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:14px">Votre assistant immobilier intelligent</p>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:16px;color:#111;margin:0 0 8px"><strong>Bonjour ${report.username},</strong></p>
    <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 24px">Votre compte <strong>${report.role}</strong> est maintenant connecté. Voici un aperçu de votre activité :</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
      ${[
        ["Favoris", report.totalFavoris],
        ["Conversations", report.activeConversations],
        ["Compatibilité moy.", report.avgCompatibility + "%"],
        ["Événements à venir", report.upcomingEvents],
      ]
        .map(
          ([l, v]) =>
            `<div style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center"><div style="font-size:22px;font-weight:700;color:#6d28d9">${v}</div><div style="font-size:12px;color:#888;margin-top:2px">${l}</div></div>`,
        )
        .join("")}
    </div>
    ${report.topMatches.length ? `<div style="background:#ede9fe;border-radius:8px;padding:16px;margin-bottom:24px"><p style="font-size:13px;font-weight:700;color:#6d28d9;margin:0 0 10px">🏆 Vos meilleurs matchs actuels</p>${report.topMatches.map((m) => `<div style="display:flex;justify-content:space-between;font-size:13px;color:#444;padding:5px 0;border-bottom:1px solid rgba(109,40,217,0.1)"><span>${m.type || "Bien"} · ${m.ville}</span><span style="font-weight:700;color:#6d28d9">${m.compatibility}%</span></div>`).join("")}</div>` : ""}
    <p style="font-size:13px;color:#888;text-align:center;margin-top:16px">Propulsé par AiGENT · monaigentimmobilier.fr</p>
  </div>
</div></body></html>`;
}
async function notifyUserOnIntegrations(userId, username, type, payload) {
  try {
    const user = await db
      .prepare(`SELECT integrations, preferences FROM users WHERE id = $1`)
      .get(userId);
    let connected = [];
    let prefs = {};
    try {
      connected = JSON.parse(user?.integrations || "[]");
    } catch {}
    try {
      prefs = JSON.parse(user?.preferences || "{}");
    } catch {}

    const promises = [];

    // WhatsApp
    if (connected.includes("whatsapp") && prefs.whatsappPhone) {
      let msg = "";
      if (type === "match")
        msg = `🏠 *Nouveau match AiGENT !*\nCompatibilité : *${payload.compatibility}%*\nVille : ${payload.ville}\nPrix : ${Number(payload.price || 0).toLocaleString("fr-FR")} €\n\n_Consultez vos résultats sur monaigentimmobilier.fr_`;
      else if (type === "radar")
        msg = `🎯 *Deal Radar — Opportunité prioritaire*\n${payload.qualifiedBuyers} acheteur(s) qualifié(s) pour votre bien\nFenêtre estimée : ${payload.estimatedWindowHours}h\nScore d'urgence : ${payload.urgencyScore}/100\n\n_Connectez-vous vite sur monaigentimmobilier.fr_`;
      else if (type === "message")
        msg = `💬 *Nouveau message AiGENT*\nDe : ${payload.senderUsername}\nSujet : ${payload.subject || "Message reçu"}\n\n_Répondez depuis monaigentimmobilier.fr_`;
      if (msg)
        promises.push(
          sendWhatsAppMessage(prefs.whatsappPhone, msg).catch((e) =>
            console.warn("[WA notif]", e.message),
          ),
        );
    }

    // Telegram
    if (connected.includes("telegram") && prefs.telegramChatId) {
      let msg = "";
      if (type === "match")
        msg = `🏠 <b>Nouveau match AiGENT</b>\n\nCompatibilité : <b>${payload.compatibility}%</b>\nVille : ${payload.ville}\nPrix : ${Number(payload.price || 0).toLocaleString("fr-FR")} €\nSurface : ${payload.surface || "—"} m²\n\n<a href="https://monaigentimmobilier.fr">Voir sur le site →</a>`;
      else if (type === "radar")
        msg = `🎯 <b>Deal Radar — Opportunité !</b>\n\n${payload.qualifiedBuyers} acheteur(s) qualifié(s)\nFenêtre : <b>${payload.estimatedWindowHours}h</b>\nUrgence : ${payload.urgencyScore}/100\n\n<a href="https://monaigentimmobilier.fr">Voir maintenant →</a>`;
      else if (type === "message")
        msg = `💬 <b>Nouveau message</b>\nDe : <b>${payload.senderUsername}</b>\n${payload.subject ? "Sujet : " + payload.subject : ""}\n\n<a href="https://monaigentimmobilier.fr">Répondre →</a>`;
      if (msg)
        promises.push(
          sendTelegramMessage(prefs.telegramChatId, msg).catch((e) =>
            console.warn("[TG notif]", e.message),
          ),
        );
    }

    // Slack
    if (connected.includes("slack") && prefs.slackWebhook) {
      let blocks = [];
      if (type === "match") {
        blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🏠 *Nouveau match détecté — ${payload.compatibility}%*\n${payload.type || "Bien"} à *${payload.ville}* · ${Number(payload.price || 0).toLocaleString("fr-FR")} €`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Voir le match →" },
                url: "https://monaigentimmobilier.fr",
                style: "primary",
              },
            ],
          },
        ];
      } else if (type === "radar") {
        blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🎯 *Deal Radar — Opportunité prioritaire*\n${payload.qualifiedBuyers} acheteur(s) · Fenêtre ${payload.estimatedWindowHours}h · Urgence ${payload.urgencyScore}/100`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Agir maintenant →" },
                url: "https://monaigentimmobilier.fr",
                style: "danger",
              },
            ],
          },
        ];
      }
      if (blocks.length)
        promises.push(
          sendSlackMessage(prefs.slackWebhook, blocks).catch((e) =>
            console.warn("[Slack notif]", e.message),
          ),
        );
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.warn("[notifyUserOnIntegrations]", err.message);
  }
}

// Exposer globalement pour appel depuis les autres routes
global._notifyUserOnIntegrations = notifyUserOnIntegrations;

// ════════════════════════════════════════════════════════════
// GOOGLE CALENDAR — OAuth2 flow
// ════════════════════════════════════════════════════════════

// Step 1 : redirection vers Google
app.get("/api/integrations/google/auth", authenticateToken, (req, res) => {
  const oauth2Client = getGoogleOAuth2Client();
  const scopes = ["https://www.googleapis.com/auth/calendar.events"];
  const state = Buffer.from(
    JSON.stringify({ username: req.user.username }),
  ).toString("base64");
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state,
  });
  res.json({ authUrl: url });
});

// Step 2 : callback après autorisation Google
app.get("/api/integrations/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("Code manquant");

    const { username } = JSON.parse(Buffer.from(state, "base64").toString());
    const oauth2Client = getGoogleOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // Sauvegarder les tokens dans les prefs
    const user = await db
      .prepare(
        `SELECT id, preferences FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(username.trim().toLowerCase());
    if (!user) return res.status(404).send("Utilisateur introuvable");

    let prefs = {};
    try {
      prefs = JSON.parse(user.preferences || "{}");
    } catch {}
    prefs.googleCalendarTokens = tokens;
    await db
      .prepare(`UPDATE users SET preferences = $1 WHERE id = $2`)
      .run(JSON.stringify(prefs), user.id);

    // Marquer comme connecté
    let list = [];
    const userFull = await db
      .prepare(`SELECT integrations FROM users WHERE id = $1`)
      .get(user.id);
    try {
      list = JSON.parse(userFull.integrations || "[]");
    } catch {}
    if (!list.includes("google-agenda")) list.push("google-agenda");
    await db
      .prepare(`UPDATE users SET integrations = $1 WHERE id = $2`)
      .run(JSON.stringify(list), user.id);

    // Créer un event de bienvenue dans Google Calendar
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(10, 0, 0, 0);
    await calendar.events
      .insert({
        calendarId: "primary",
        requestBody: {
          summary: "🏠 AiGENT — Compte connecté !",
          description: `Votre compte AiGENT Immobilier (${username}) est maintenant synchronisé avec Google Agenda.\n\nVos événements immobiliers (visites, rendez-vous, alertes) apparaîtront automatiquement ici.\n\nmonaigentimmobilier.fr`,
          start: { dateTime: tomorrow.toISOString(), timeZone: "Europe/Paris" },
          end: { dateTime: end.toISOString(), timeZone: "Europe/Paris" },
          colorId: "3",
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 30 }],
          },
        },
      })
      .catch((e) => console.warn("[GCal welcome event]", e.message));

    res.redirect(`/profil.html?section=integrations&connected=google-agenda`);
  } catch (err) {
    console.error("[Google callback]", err);
    res.status(500).send("Erreur lors de la connexion Google");
  }
});

// ── Route pour créer un event Google Calendar depuis l'agenda AiGENT ──
app.post(
  "/api/integrations/google/sync-event",
  authenticateToken,
  async (req, res) => {
    try {
      const { event } = req.body;
      if (!event) return res.status(400).json({ error: "event requis" });

      const user = await db
        .prepare(
          `SELECT id, preferences, integrations FROM users WHERE LOWER(TRIM(username)) = $1`,
        )
        .get(req.user.username.trim().toLowerCase());
      if (!user) return res.sendStatus(404);

      let prefs = {};
      let connected = [];
      try {
        prefs = JSON.parse(user.preferences || "{}");
      } catch {}
      try {
        connected = JSON.parse(user.integrations || "[]");
      } catch {}

      if (!connected.includes("google-agenda") || !prefs.googleCalendarTokens) {
        return res.status(403).json({ error: "Google Agenda non connecté" });
      }

      const oauth2Client = getGoogleOAuth2Client();
      oauth2Client.setCredentials(prefs.googleCalendarTokens);

      // Refresh token si expiré
      oauth2Client.on("tokens", async (tokens) => {
        if (tokens.refresh_token)
          prefs.googleCalendarTokens = {
            ...prefs.googleCalendarTokens,
            ...tokens,
          };
        else
          prefs.googleCalendarTokens = {
            ...prefs.googleCalendarTokens,
            access_token: tokens.access_token,
          };
        await db
          .prepare(`UPDATE users SET preferences = $1 WHERE id = $2`)
          .run(JSON.stringify(prefs), user.id);
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const [year, month, day] = event.date.split("-").map(Number);
      const [h, m] = (event.time || "09:00").split(":").map(Number);
      const start = new Date(year, month - 1, day, h, m);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h par défaut

      const COLOR_MAP = { "": "3", ok: "2", warn: "5", err: "11" };

      const created = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: `🏠 ${event.name}`,
          description: event.description || "",
          start: { dateTime: start.toISOString(), timeZone: "Europe/Paris" },
          end: { dateTime: end.toISOString(), timeZone: "Europe/Paris" },
          colorId: COLOR_MAP[event.color] || "3",
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 30 },
              { method: "email", minutes: 60 },
            ],
          },
        },
      });

      res.json({
        success: true,
        eventId: created.data.id,
        htmlLink: created.data.htmlLink,
      });
    } catch (err) {
      console.error("[Google sync-event]", err);
      res.status(500).json({ error: "Erreur synchronisation Google Agenda" });
    }
  },
);

// ════════════════════════════════════════════════════════════
// RAPPORT HEBDOMADAIRE — déclenché manuellement ou via cron
// POST /api/integrations/send-weekly-report
// ════════════════════════════════════════════════════════════
app.post(
  "/api/integrations/send-weekly-report",
  authenticateToken,
  async (req, res) => {
    try {
      const user = await db
        .prepare(
          `SELECT id, integrations, preferences FROM users WHERE LOWER(TRIM(username)) = $1`,
        )
        .get(req.user.username.trim().toLowerCase());
      if (!user) return res.sendStatus(404);

      let connected = [];
      let prefs = {};
      try {
        connected = JSON.parse(user.integrations || "[]");
      } catch {}
      try {
        prefs = JSON.parse(user.preferences || "{}");
      } catch {}

      const report = await buildUserReport(user.id, req.user.username);
      const sent = [];

      // WhatsApp — rapport texte structuré
      if (connected.includes("whatsapp") && prefs.whatsappPhone) {
        const matchLines = report.topMatches.length
          ? report.topMatches
              .map(
                (m) =>
                  `  • ${m.type || "Bien"} à ${m.ville} — *${m.compatibility}%*`,
              )
              .join("\n")
          : "  • Aucun match enregistré cette semaine";

        const msg = `📊 *Rapport hebdomadaire AiGENT*\n_Semaine du ${new Date().toLocaleDateString("fr-FR")}_\n\n👤 *${report.username}* · ${report.role}\n\n🏠 *Activité*\n• Favoris : ${report.totalFavoris}\n• Conversations : ${report.activeConversations}\n• Compatibilité moy. : ${report.avgCompatibility}%\n• Événements à venir : ${report.upcomingEvents}\n\n🏆 *Meilleurs matchs*\n${matchLines}\n\n${report.criteria.ville ? `📍 *Critères*\n• Ville : ${report.criteria.ville}\n• Type : ${report.criteria.type || "—"}\n• Budget max : ${Number(report.criteria.budgetMax || 0).toLocaleString("fr-FR")} €` : ""}\n\n_monaigentimmobilier.fr_`;

        await sendWhatsAppMessage(prefs.whatsappPhone, msg).catch((e) =>
          console.warn("[WA weekly]", e.message),
        );
        sent.push("whatsapp");
      }

      // Telegram — rapport formaté HTML
      if (connected.includes("telegram") && prefs.telegramChatId) {
        const matchLines = report.topMatches.length
          ? report.topMatches
              .map(
                (m) =>
                  `  • ${m.type || "Bien"} à ${m.ville} — <b>${m.compatibility}%</b>`,
              )
              .join("\n")
          : "  • Aucun match enregistré";

        const msg = `📊 <b>Rapport hebdomadaire AiGENT</b>\n<i>${new Date().toLocaleDateString("fr-FR")}</i>\n\n👤 <b>${report.username}</b> · ${report.role}\n\n📈 <b>Activité de la semaine</b>\n• Favoris : ${report.totalFavoris}\n• Conversations actives : ${report.activeConversations}\n• Compatibilité moyenne : ${report.avgCompatibility}%\n• Événements à venir : ${report.upcomingEvents}\n\n🏆 <b>Top matchs</b>\n${matchLines}\n\n<a href="https://monaigentimmobilier.fr">Voir mon tableau de bord →</a>`;

        await sendTelegramMessage(prefs.telegramChatId, msg).catch((e) =>
          console.warn("[TG weekly]", e.message),
        );
        sent.push("telegram");
      }

      // Slack — rapport en blocs structurés
      if (connected.includes("slack") && prefs.slackWebhook) {
        const matchFields = report.topMatches.length
          ? report.topMatches.map((m) => ({
              type: "mrkdwn",
              text: `*${m.type || "Bien"} · ${m.ville}*\n${m.compatibility}% compatibilité`,
            }))
          : [{ type: "mrkdwn", text: "_Aucun match cette semaine_" }];

        const blocks = [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `📊 Rapport hebdomadaire — ${report.username}`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Rôle*\n${report.role}` },
              {
                type: "mrkdwn",
                text: `*Semaine du*\n${new Date().toLocaleDateString("fr-FR")}`,
              },
              { type: "mrkdwn", text: `*Favoris*\n${report.totalFavoris}` },
              {
                type: "mrkdwn",
                text: `*Conversations*\n${report.activeConversations}`,
              },
              {
                type: "mrkdwn",
                text: `*Compatibilité moy.*\n${report.avgCompatibility}%`,
              },
              {
                type: "mrkdwn",
                text: `*Événements*\n${report.upcomingEvents}`,
              },
            ],
          },
          ...(report.topMatches.length
            ? [
                { type: "divider" },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: "🏆 *Meilleurs matchs de la semaine*",
                  },
                  fields: matchFields.slice(0, 4),
                },
              ]
            : []),
          { type: "divider" },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Voir le tableau de bord →" },
                url: "https://monaigentimmobilier.fr",
                style: "primary",
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "_AiGENT Immobilier · monaigentimmobilier.fr_",
              },
            ],
          },
        ];
        await sendSlackMessage(
          prefs.slackWebhook,
          blocks,
          `Rapport hebdomadaire AiGENT — ${report.username}`,
        ).catch((e) => console.warn("[Slack weekly]", e.message));
        sent.push("slack");
      }

      // Gmail
      if (connected.includes("gmail") && prefs.gmailEmail) {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
        });
        await transporter
          .sendMail({
            from: `"AiGENT Immobilier" <${process.env.GMAIL_USER}>`,
            to: prefs.gmailEmail,
            subject: `📊 Rapport hebdomadaire AiGENT — ${new Date().toLocaleDateString("fr-FR")}`,
            html: buildWeeklyReportEmailHTML(report),
          })
          .catch((e) => console.warn("[Gmail weekly]", e.message));
        sent.push("gmail");
      }

      res.json({ success: true, sent });
    } catch (err) {
      console.error("[weekly report]", err);
      res.status(500).json({ error: "Erreur envoi rapport" });
    }
  },
);

function buildWeeklyReportEmailHTML(report) {
  const matchRows = report.topMatches.length
    ? report.topMatches
        .map(
          (m) =>
            `<tr><td style="padding:8px 0;color:#444;font-size:13px">${m.type || "Bien"} · ${m.ville}</td><td style="text-align:right;font-weight:700;color:#6d28d9;font-size:13px">${m.compatibility}%</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" style="padding:8px 0;color:#888;font-size:13px;font-style:italic">Aucun match enregistré</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:linear-gradient(135deg,#6d28d9,#7c3aed);padding:28px 32px">
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">📊 Rapport hebdomadaire</h1>
    <p style="color:rgba(255,255,255,0.8);margin:5px 0 0;font-size:13px">${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#111;margin:0 0 6px"><strong>${report.username}</strong> · ${report.role}</p>
    <div style="display:flex;gap:10px;margin:16px 0 24px;flex-wrap:wrap">
      ${[
        ["Favoris", report.totalFavoris],
        ["Conversations", report.activeConversations],
        ["Compat. moy.", report.avgCompatibility + "%"],
        ["Événements", report.upcomingEvents],
      ]
        .map(
          ([l, v]) =>
            `<div style="flex:1;min-width:100px;background:#f9f9fb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:700;color:#6d28d9">${v}</div><div style="font-size:11px;color:#888;margin-top:2px">${l}</div></div>`,
        )
        .join("")}
    </div>
    <h3 style="font-size:13px;font-weight:700;color:#6d28d9;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em">🏆 Meilleurs matchs</h3>
    <table style="width:100%;border-collapse:collapse">${matchRows}</table>
    ${report.criteria.ville ? `<div style="margin-top:20px;padding:14px;background:#ede9fe;border-radius:8px"><p style="font-size:12px;font-weight:700;color:#6d28d9;margin:0 0 6px">📍 Critères actifs</p><p style="font-size:12px;color:#444;margin:0">Ville : ${report.criteria.ville} · Type : ${report.criteria.type || "—"} · Budget : ${Number(report.criteria.budgetMax || 0).toLocaleString("fr-FR")} €</p></div>` : ""}
    <div style="margin-top:24px;text-align:center"><a href="https://monaigentimmobilier.fr" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">Voir mon tableau de bord →</a></div>
    <p style="font-size:11px;color:#aaa;text-align:center;margin-top:20px">AiGENT Immobilier · monaigentimmobilier.fr</p>
  </div>
</div></body></html>`;
}
async function sendWhatsAppMessagelogs(to, body) {
  if (!twilioClient) throw new Error("Twilio non configuré");

  console.log("📤 ENVOI WHATSAPP");
  console.log("TO:", to);
  console.log("FROM:", process.env.TWILIO_WHATSAPP_FROM);

  const msg = await twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${to}`,
    body,
  });

  console.log("✅ MESSAGE SID:", msg.sid);

  return msg;
}
// ════════════════════════════════════════════════════════════
// ARCHIVES
// ════════════════════════════════════════════════════════════

// POST /api/conversations/archive
app.post("/api/conversations/archive", authenticateToken, async (req, res) => {
  try {
    const { conversationKey } = req.body;
    if (!conversationKey)
      return res.status(400).json({ error: "conversationKey requis" });

    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    if (isProd) {
      await db
        .prepare(
          `
        INSERT INTO archived_conversations (user_id, conversation_key)
        VALUES ($1, $2)
        ON CONFLICT (user_id, conversation_key) DO NOTHING
      `,
        )
        .run(user.id, conversationKey);
    } else {
      const existing = await db
        .prepare(
          `
        SELECT id FROM archived_conversations WHERE user_id = ? AND conversation_key = ?
      `,
        )
        .get(user.id, conversationKey);
      if (!existing) {
        await db
          .prepare(
            `
          INSERT INTO archived_conversations (user_id, conversation_key) VALUES (?, ?)
        `,
          )
          .run(user.id, conversationKey);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[archive]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/conversations/archive/:key
app.delete(
  "/api/conversations/archive/:key",
  authenticateToken,
  async (req, res) => {
    try {
      const conversationKey = decodeURIComponent(req.params.key);
      const user = await db
        .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
        .get(req.user.username.trim().toLowerCase());
      if (!user) return res.sendStatus(404);

      await db
        .prepare(
          `
      DELETE FROM archived_conversations WHERE user_id = $1 AND conversation_key = $2
    `,
        )
        .run(user.id, conversationKey);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// GET /api/conversations/archived
app.get("/api/conversations/archived", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const rows = await db
      .prepare(
        `
      SELECT conversation_key FROM archived_conversations
      WHERE user_id = $1
      ORDER BY archived_at DESC
    `,
      )
      .all(user.id);

    res.json(rows.map((r) => r.conversation_key));
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ════════════════════════════════════════════════════════════
// BLOCAGES
// ════════════════════════════════════════════════════════════

// POST /api/users/block
app.post("/api/users/block", authenticateToken, async (req, res) => {
  try {
    const { targetUsername } = req.body;
    if (!targetUsername)
      return res.status(400).json({ error: "targetUsername requis" });

    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    if (isProd) {
      await db
        .prepare(
          `
        INSERT INTO blocked_users (blocker_id, blocked_username)
        VALUES ($1, $2)
        ON CONFLICT (blocker_id, blocked_username) DO NOTHING
      `,
        )
        .run(user.id, targetUsername.trim().toLowerCase());
    } else {
      const existing = await db
        .prepare(
          `
        SELECT id FROM blocked_users WHERE blocker_id = ? AND blocked_username = ?
      `,
        )
        .get(user.id, targetUsername.trim().toLowerCase());
      if (!existing) {
        await db
          .prepare(
            `
          INSERT INTO blocked_users (blocker_id, blocked_username) VALUES (?, ?)
        `,
          )
          .run(user.id, targetUsername.trim().toLowerCase());
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[block]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/users/block/:username
app.delete(
  "/api/users/block/:username",
  authenticateToken,
  async (req, res) => {
    try {
      const targetUsername = req.params.username.trim().toLowerCase();
      const user = await db
        .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
        .get(req.user.username.trim().toLowerCase());
      if (!user) return res.sendStatus(404);

      await db
        .prepare(
          `
      DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_username = $2
    `,
        )
        .run(user.id, targetUsername);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// GET /api/users/blocked — liste des usernames bloqués par le user courant
app.get("/api/users/blocked", authenticateToken, async (req, res) => {
  try {
    const user = await db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
      .get(req.user.username.trim().toLowerCase());
    if (!user) return res.sendStatus(404);

    const rows = await db
      .prepare(
        `
      SELECT blocked_username FROM blocked_users WHERE blocker_id = $1
    `,
      )
      .all(user.id);

    res.json(rows.map((r) => r.blocked_username));
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ════════════════════════════════════════════════════════════
// SUPABASE STORAGE — AUDIO MESSAGES
// ════════════════════════════════════════════════════════════

const SUPABASE_STORAGE_URL =
  "https://elsukvkufamrtsogxqzt.supabase.co/storage/v1";
const SUPABASE_BUCKET = "audios-messages";
const AUDIO_TTL_DAYS = 15;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;

// ── Helper : upload un buffer vers Supabase Storage ─────────
async function uploadToSupabase(buffer, fileName, mimeType) {
  const url = `${SUPABASE_STORAGE_URL}/object/${SUPABASE_BUCKET}/${fileName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_API_KEY}`,
      "Content-Type": mimeType,
      "x-upsert": "true", // écrase si même nom
    },
    body: buffer,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upload failed: ${err}`);
  }

  // URL publique directe (bucket public)
  const publicUrl = `${SUPABASE_STORAGE_URL}/object/public/${SUPABASE_BUCKET}/${fileName}`;
  return publicUrl;
}

// ── Helper : supprimer une liste de fichiers Supabase ────────
async function deleteFromSupabase(fileNames) {
  if (!fileNames.length) return;
  const url = `${SUPABASE_STORAGE_URL}/object/${SUPABASE_BUCKET}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${SUPABASE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: fileNames }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn("[Supabase DELETE]", err);
  }
}

// ── Helper : lister les fichiers du bucket ───────────────────
async function listSupabaseFiles() {
  const url = `${SUPABASE_STORAGE_URL}/object/list/${SUPABASE_BUCKET}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prefix: "",
      limit: 1000,
      offset: 0,
      sortBy: { column: "created_at", order: "asc" },
    }),
  });
  if (!res.ok) return [];
  return res.json(); // tableau d'objets { name, created_at, ... }
}

// ── ROUTE POST /api/upload-audio ─────────────────────────────
app.post(
  "/api/upload-audio",
  authenticateToken,
  upload.single("audio"), // multer memory, champ 'audio'
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Aucun fichier audio reçu" });
      }

      const duration = parseInt(req.body.duration || "0", 10);

      // Sécurité : refuser les audios > 60s côté serveur aussi
      if (duration > 60) {
        return res.status(400).json({ error: "Audio trop long (max 60s)" });
      }

      // Refuser les fichiers > 5 Mo (sécurité taille)
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "Fichier trop lourd (max 5 Mo)" });
      }

      const ext = req.file.mimetype.includes("webm") ? "webm" : "mp4";
      const safeName = `${Date.now()}_${req.user.username.replace(/[^a-z0-9]/gi, "_")}.${ext}`;
      const mimeType = req.file.mimetype || "audio/webm";

      const publicUrl = await uploadToSupabase(
        req.file.buffer,
        safeName,
        mimeType,
      );

      console.log(
        `[Audio Upload] ${safeName} — ${req.file.size} octets — ${duration}s`,
      );

      return res.json({
        success: true,
        url: publicUrl,
        name: safeName,
        duration: duration,
        size: req.file.size,
      });
    } catch (err) {
      console.error("[/api/upload-audio]", err);
      return res.status(500).json({ error: "Erreur upload audio" });
    }
  },
);

// ── CRON NETTOYAGE — supprime les audios > 15 jours ─────────
// Tourne toutes les 24h au démarrage du serveur
async function purgeOldAudios() {
  try {
    console.log("[Audio Purge] Lancement du nettoyage Supabase...");
    const files = await listSupabaseFiles();
    if (!Array.isArray(files) || !files.length) {
      console.log("[Audio Purge] Aucun fichier trouvé.");
      return;
    }

    const cutoff = Date.now() - AUDIO_TTL_DAYS * 24 * 60 * 60 * 1000;
    const toDelete = files
      .filter((f) => {
        // Supabase retourne created_at en ISO string
        const created = new Date(f.created_at).getTime();
        return created < cutoff;
      })
      .map((f) => f.name);

    if (!toDelete.length) {
      console.log("[Audio Purge] Aucun fichier expiré.");
      return;
    }

    await deleteFromSupabase(toDelete);
    console.log(
      `[Audio Purge] ${toDelete.length} fichier(s) supprimé(s) :`,
      toDelete,
    );
  } catch (err) {
    console.error("[Audio Purge] Erreur:", err.message);
  }
}

// Lancement immédiat au boot + toutes les 24h
purgeOldAudios();
setInterval(purgeOldAudios, 24 * 60 * 60 * 1000);
// ================== START ==================
const dbColumns = await db
  .prepare(
    `
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'users'
`,
  )
  .all();

console.log("🧨 [DB COLUMNS USERS]");
console.table(dbColumns);
const debugCheck = await db
  .prepare(
    `
  SELECT username, piecesmin, surfacemin, budgetmin
  FROM users
`,
  )
  .all();

console.log("🧨 [RAW DB STATE]");
console.table(debugCheck);
app.listen(PORT, HOST, () => {
  console.log(`🚀 Serveur lancé sur http://${HOST}:${PORT}`);
});
