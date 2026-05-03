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
}); // ================== MIDDLEWARES ==================
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
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
          "https://api.anthropic.com",
          "https://unpkg.com",
          "https://nominatim.openstreetmap.org",
          "https://overpass-api.de",
          "https://threejs.org",
          "https://api.languagetoolplus.com",
        ],

        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],

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

    // BUG FIX 2 : persister les attachments en JSON dans la colonne attachments
    const attachmentsJson = JSON.stringify(attachments || []);

    const insert = await db
      .prepare(
        `INSERT INTO messages (sender_id, receiver_id, subject, body, attachments)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      )
      .get(sender.id, receiver.id, subject, body, attachmentsJson);

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
