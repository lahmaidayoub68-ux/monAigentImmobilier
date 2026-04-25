//================ IMPORTS ==================//
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
const normalizeSurface = (criteria = {}) => {
  const raw = criteria.surfaceMin ?? criteria.espaceMin ?? null;
  const val = raw == null ? null : Number(String(raw).replace(/[^\d.-]/g, ""));
  return isNaN(val) ? null : val;
};
const toNumber = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? null : n;
};
const normalizePieces = (criteria = {}, mode = "min") => {
  const raw =
    mode === "max"
      ? (criteria.piecesMax ?? criteria.pieces ?? criteria.rooms)
      : (criteria.piecesMin ?? criteria.pieces ?? criteria.rooms);

  const val = raw == null ? null : Number(String(raw).replace(/[^\d.-]/g, ""));

  return Number.isFinite(val) ? val : null;
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
    // 🔥 IMPORTANT pour Leaflet + tiles externes
    crossOriginResourcePolicy: false,

    // 🔥 FIX principal → gestion du referer
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },

    contentSecurityPolicy: {
      useDefaults: true,

      directives: {
        // ==========================
        // BASE
        // ==========================
        defaultSrc: ["'self'"],

        // ==========================
        // SCRIPTS
        // ==========================
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://unpkg.com",
        ],

        // ==========================
        // STYLES
        // ==========================
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com", // ✨ AJOUTÉ : Autorise le CSS de Google Fonts
        ],

        // ==========================
        // IMAGES
        // ==========================
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.tile.openstreetmap.org",
          "https://*.tile.openstreetmap.fr", // ← AJOUTÉ
          "https://*.basemaps.cartocdn.com",
          "https://api.dicebear.com",
          "https://unpkg.com",
          "https://res.cloudinary.com",
          "https://images.unsplash.com",
          "https://plus.unsplash.com",
        ],

        // ==========================
        // FETCH / API / SOCKETS
        // ==========================
        connectSrc: [
          "'self'",
          "https://threejs.org",
          "https://api.languagetoolplus.com",
          "https://unpkg.com",
        ],

        // ==========================
        // FONTS
        // ==========================
        fontSrc: [
          "'self'",
          "data:",
          "https://fonts.gstatic.com", // ✨ AJOUTÉ : Autorise les fichiers .woff2 de Google
        ],

        // ==========================
        // AUTRES
        // ==========================
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],

        // 🔥 sécurité moderne
        upgradeInsecureRequests: [],
      },
    },
  }),
);
app.use(compression());
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
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
 u.etatbien AS "etatBien",
u.imagesbien AS "imagesbien",
u.niveauenergetique AS "niveauEnergetique",
 u.piecesmin  AS "piecesMin",
 u.surfacemin AS "surfaceMin",
 u.budgetmin  AS "budgetMin",
 u.piecesmax  AS "piecesMax",
  u.surfacemax AS "surfaceMax",
u.tolerancekm AS "toleranceKm",
 u.budgetmax  AS "budgetMax"
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
    budget: u.budget ?? null, //budgetMin: u.budgetMin ?? u.budget ?? 0, avant
    budgetMax: u.budgetMax ?? u.budget ?? 0, //piecesMin: u.piecesMin ?? null, avant pour bug : lowerCase
    piecesMax: u.piecesMax ?? 999, //surfaceMin: u.surfaceMin ?? null,//avant
    surfaceMax: u.surfaceMax ?? 999,
    piecesMin: u.piecesMin ?? null,
    surfaceMin: u.surfaceMin ?? null,
    budgetMin: u.budgetMin ?? null,
    toleranceKm: u.toleranceKm ?? null,
    etatBien: u.etatBien || "",
    imagesbien: safeImagesParse(u.imagesbien),
    niveauEnergetique: u.niveauEnergetique || "",
    departement: getDepartement(u.ville),
  };
  console.log("⚠️ [STEP 6 - ROUTING CHECK]", {
    username: u.username,
    role: u.role,
    willCall: u.role === "seller" ? "addSeller" : "addBuyer",
  });

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
    " [WRITE PRE-DB] normalized EXACT snapshot:",
    JSON.stringify(normalized, null, 2),
  );
  const { username, contact = "", role } = user;

  const profileData = {
    username,
    contact,
    role,
    type: normalized.type || "",
    ville: normalized.ville || "",
    region: normalized.region || normalized.ville || "", // SELLER STRICT

    price: role === "seller" ? (normalized.price ?? 0) : 0,
    pieces: role === "seller" ? (normalized.pieces ?? null) : 0,
    surface: role === "seller" ? (normalized.surface ?? null) : 0,
    etatBien: normalized.etatBien ?? null,
    imagesbien: normalized.imagesbien ?? null,
    niveauEnergetique:
      role === "seller" ? (normalized.niveauEnergetique ?? null) : null,
    // BUYER STRICT

    budget: role === "buyer" ? (normalized.budgetMin ?? null) : 0,
    budgetMin: role === "buyer" ? (normalized.budgetMin ?? null) : 0,
    budgetMax: role === "buyer" ? (normalized.budgetMax ?? null) : 0,
    piecesMax: role === "buyer" ? (normalized.piecesMax ?? 999) : 0,
    piecesMin: role === "buyer" ? (normalized.piecesMin ?? null) : null,
    surfaceMin: role === "buyer" ? (normalized.surfaceMin ?? null) : null,
    surfaceMax: role === "buyer" ? (normalized.surfaceMax ?? 999) : 0,
    toleranceKm: role === "buyer" ? (normalized.toleranceKm ?? null) : null,
  };
  console.log(" UPSERT FINAL etatbien:", profileData.etatBien); // ================== MEMORY UPSERT ==================
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

    if (existingIndex >= 0) {
      BUYERS[existingIndex] = fullBuyer;
    } else {
      BUYERS.push(fullBuyer);
    }
  }

  if (role === "seller") {
    const existingIndex = SELLERS.findIndex((s) => s.username === username);
    const fullSeller = {
      id: existingIndex >= 0 ? SELLERS[existingIndex].id : Date.now(),
      ...profileData,
    };

    if (existingIndex >= 0) {
      SELLERS[existingIndex] = fullSeller;
    } else {
      SELLERS.push(fullSeller);
    }
  }
  await db
    .prepare(
      `
    UPDATE users
    SET etatbien = ?, imagesbien = ?, niveauenergetique = ?
    WHERE username = ?
  `,
    )
    .run(
      profileData.etatBien,
      JSON.stringify(profileData.imagesbien || []),
      profileData.niveauEnergetique ?? null,
      username,
    );
  console.log(" DIRECT UPDATE etatbien DONE");
  // ================== DB UPSERT ==================

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
      ],
    );
  }
  console.log(" FINAL DB WRITE:", {
    etatbien: profileData.etatBien,
    piecesmin: profileData.piecesMin,
    surfacemin: profileData.surfaceMin,
  }); // ================== LOGGING ==================

  console.log("=== PROFIL AJOUTÉ ===");
  console.log({
    username: profileData.username,
    role: profileData.role,
    villeOriginal: normalized.ville,
    villeNormalized: normalize(normalized.ville),
    departement: getDepartement(normalized.ville),
    price: role === "buyer" ? normalized.budgetMax : normalized.price,
    budgetMin: normalized.budgetMin,
    budgetMax: normalized.budgetMax,
    pieces: normalized.piecesMax,
    surface: normalized.surfaceMax,
    etatBien: normalized.etatBien,
    contact: profileData.contact,
  });
  console.log("NORMALIZED:", normalized);

  return profileData;
}
// ================== IMPORT AI CHAT ==================
import { aiChatWithCriteria } from "./services/aiParsee.js";
// ================== CHAT SYSTEM ==================
const sessions = {};
const ORDER = ["type", "ville", "pieces", "espace"];

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
    const { req, res, next } = QUEUE.shift();
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

// ================== CHAT ROUTE ==================
app.post("/chat", authenticateToken, userQueueMiddleware, async (req, res) => {
  try {
    // ===== Validation =====
    const { message } = z
      .object({ message: z.string().min(1) })
      .parse(req.body);
    const username = req.user.username;
    const userRole = req.user.role; // ===== Initialisation session =====

    if (!sessions[username]) {
      sessions[username] = {
        started: false,
        criteria: {},
        role: userRole,
        phase: "collecting",
        matches: [],
        postReply: null,
      };
    }
    const session = sessions[username];
    session.role = userRole; // ICI (et pas avant)
    if (req.body.skipImages) {
      session.criteria.imagesbien = [];
    }

    if (req.body.etatBien !== undefined) {
      session.criteria.etatBien = req.body.etatBien;
    }
    if (req.body.niveauEnergetique !== undefined) {
      session.criteria.niveauEnergetique = req.body.niveauEnergetique;
    } // ===== Appel IA pour parser les critères =====
    let aiResponse = {};
    try {
      aiResponse = await aiChatWithCriteria(message, session.criteria, {
        phase: session.phase,
        matchingProfiles: session.matches,
      });
      console.log(" [AI RESPONSE RAW]", JSON.stringify(aiResponse, null, 2));
    } catch (err) {
      console.error("[CHAT] Erreur AI :", err);
      aiResponse = {
        message: "Désolé, je n'ai pas compris. Pouvez-vous reformuler ?",
        criteria: session.criteria,
      };
    }

    console.log(" [SESSION BEFORE MERGE]", session.criteria);
    console.log(" [AI CRITERIA]", aiResponse.criteria); //critères mis à jour//
    const safeCriteria = Object.fromEntries(
      Object.entries(aiResponse.criteria || {}).filter(
        ([_, v]) => v !== null && v !== undefined,
      ),
    );
    console.log("🤖 AI MESSAGE:", aiResponse.message);
    console.log("🤖 AI CRITERIA RAW:", aiResponse.criteria);
    console.log("🤖 SESSION BEFORE MERGE:", session.criteria);

    session.criteria = {
      ...session.criteria,
      ...safeCriteria, // plus de null qui écrase

      surfaceMin:
        aiResponse.criteria?.surfaceMin ??
        aiResponse.criteria?.espaceMin ??
        session.criteria.surfaceMin,

      piecesMin: aiResponse.criteria?.piecesMin ?? session.criteria.piecesMin,

      etatBien: aiResponse.criteria?.etatBien ?? session.criteria.etatBien,
      imagesbien: Array.isArray(req.body.imagesbien)
        ? req.body.imagesbien
        : (session.criteria.imagesbien ?? null),
      niveauEnergetique:
        req.body.niveauEnergetique ??
        aiResponse.criteria?.niveauEnergetique ??
        session.criteria.niveauEnergetique,
    };
    console.log("🔀 AFTER MERGE:", session.criteria);

    console.log("CRITERIA MERGED:", session.criteria);
    // ===== Préparation reply =====

    let reply = "";
    if (!session.started) {
      reply +=
        aiResponse.message || "Bonjour ! Je suis votre assistant immobilier.";
      session.started = true;
    } else if (aiResponse.message) {
      reply += aiResponse.message;
    } // ===== Normalisation =====

    const parseNumber = (value) => {
      if (value == null) return undefined;
      const num = Number(String(value).replace(/[^\d.-]/g, ""));
      return isNaN(num) ? undefined : num;
    }; // ===== EXTRACTION BRUTE =====

    console.log(" [RAW FOR NORMALIZATION]", session.criteria);

    console.log(" piecesMin RAW INPUT:", session.criteria.piecesMin);
    console.log(" surfaceMin RAW INPUT:", session.criteria.surfaceMin);
    console.log(" espaceMin RAW INPUT:", session.criteria.espaceMin);
    console.log(" etatBien RAW INPUT:", session.criteria.etatBien); // ===== PARSE =====
    const etatBien = session.criteria.etatBien || undefined;

    const piecesMin = normalizePieces(session.criteria, "min") ?? null;
    const piecesMax = normalizePieces(session.criteria, "max") ?? 999;
    const toleranceKm =
      session.role === "buyer"
        ? Number(session.criteria.toleranceKm ?? 0)
        : null;

    const surfaceMin = normalizeSurface(session.criteria) ?? null;
    const surfaceMax =
      session.criteria.surfaceMax != null
        ? Number(session.criteria.surfaceMax)
        : 9999;

    const budgetMin = Number(session.criteria.budgetMin ?? 0);
    let budgetMax = Number(session.criteria.budgetMax ?? budgetMin);
    if (budgetMax < budgetMin) budgetMax = budgetMin;
    // ===== NORMALIZED FINAL =====
    const normalized = {
      type: session.criteria.type ? normalize(session.criteria.type) : "",
      ville: session.criteria.ville || "",

      budgetMin,
      budgetMax,
      piecesMin,
      piecesMax,
      surfaceMin,
      surfaceMax,
      toleranceKm, // AJOUT ICI

      // SELLER ONLY

      ...(session.role === "seller" && {
        price: budgetMin,
        pieces: piecesMin,
        surface: surfaceMin,
        etatBien:
          req.body.etatBien ??
          aiResponse.criteria?.etatBien ??
          session.criteria.etatBien,
        niveauEnergetique:
          req.body.niveauEnergetique ??
          aiResponse.criteria?.niveauEnergetique ??
          session.criteria.niveauEnergetique ??
          null,
        imagesbien: Array.isArray(session.criteria.imagesbien)
          ? session.criteria.imagesbien
          : [],
      }),
    };
    if (Array.isArray(normalized.imagesbien)) {
      // déjà bon
    } else if (typeof normalized.imagesbien === "string") {
      try {
        const parsed = JSON.parse(normalized.imagesbien);
        normalized.imagesbien = Array.isArray(parsed) ? parsed : [];
      } catch {
        normalized.imagesbien = [];
      }
    } else {
      normalized.imagesbien = [];
    }
    console.log(" [NORMALIZED FINAL]", JSON.stringify(normalized, null, 2)); // ===== Vérification critères complets =====

    // ================== MISSING GLOBAL CRITERIA ==================
    const missingCriteria = ORDER.filter((k) => {
      if (k === "pieces") return session.criteria.piecesMin == null;
      if (k === "espace") return session.criteria.surfaceMin == null;

      return session.criteria[k] == null;
    });

    // ================== SELLER CHECKS ==================
    const etatBienMissing =
      session.role === "seller" &&
      (session.criteria.etatBien == null || session.criteria.etatBien === "");

    const niveauEnergetiqueMissing =
      session.role === "seller" &&
      session.criteria.etatBien &&
      (session.criteria.niveauEnergetique == null ||
        session.criteria.niveauEnergetique === "");

    const imagesMissing =
      session.role === "seller" &&
      (!Array.isArray(session.criteria.imagesbien) ||
        session.criteria.imagesbien.length === 0);

    // ================== BUYER CHECKS ==================
    const toleranceMissing =
      session.role === "buyer" &&
      session.criteria.ville &&
      session.criteria.toleranceKm == null;

    const budgetIncomplete = session.criteria.budgetMin == null;

    // ================== FINAL TRIGGER CONTROL ==================
    const isFinalTrigger = req.body.etatBien != null;

    // ================== PHASE COLLECTING ==================
    if (session.phase === "collecting") {
      console.log("🚨 CHECK BLOCK:", {
        missingCriteria,
        budgetIncomplete,
        toleranceMissing,
        etatBienMissing,
        niveauEnergetiqueMissing,
        imagesMissing,
      });

      // =========================================================
      // 1. GLOBAL CRITERIA (TOUJOURS PRIORITÉ ABSOLUE)
      // =========================================================
      const hasMissingGlobals =
        missingCriteria.length > 0 ||
        (session.role === "buyer" && budgetIncomplete) ||
        toleranceMissing;

      if (hasMissingGlobals) {
        return res.json({
          reply,
          criteria: session.criteria,
        });
      }

      // =========================================================
      // 2. SELLER FLOW ORDER STRICT
      // =========================================================

      // 2.1 état du bien
      if (etatBienMissing) {
        return res.json({
          reply,
          triggerEtatBienPopup: true,
          criteria: session.criteria,
        });
      }

      // 2.2 niveau énergétique
      if (niveauEnergetiqueMissing) {
        return res.json({
          reply,
          triggerNiveauEnergetiquePopup: true,
          criteria: session.criteria,
        });
      }

      // 2.3 images
      if (imagesMissing && !req.body.skipImages) {
        return res.json({
          reply,
          triggerImagesPopup: true,
          criteria: session.criteria,
        });
      }

      // =========================================================
      // 3. MATCHING READY (TOUT EST COMPLET)
      // =========================================================

      // ===== Critères complets => création du profil en mémoire & DB =====
      let profile;
      if (session.role === "buyer") {
        profile = await addBuyer({
          username,
          type: normalized.type,
          ville: normalized.ville,
          budgetMin: normalized.budgetMin,
          budgetMax: normalized.budgetMax,
          piecesMin: normalized.piecesMin,
          piecesMax: normalized.piecesMax,
          surfaceMin: normalized.surfaceMin,
          surfaceMax: normalized.surfaceMax,
          toleranceKm: normalized.toleranceKm,
        });
      } else {
        // Utiliser les vraies données du seller
        const existingSeller = SELLERS.find((s) => s.username === username);
        profile = await addSeller({
          username,
          type: normalized.type || "appartement",
          ville: normalized.ville || "",
          price: normalized.budgetMin, // prix fourni par le seller
          pieces: normalized.piecesMin, // nombre de pièces
          surface: normalized.surfaceMin, // surface du bien
          etatBien: normalized.etatBien,
          imagesbien: normalized.imagesbien,
          niveauEnergetique: normalized.niveauEnergetique,
          contact: req.user.contact || "",
        });
        console.log("🔥 [STEP 4 - addSeller CALLED]", {
          username: normalized.username,
          imagesbien: normalized.imagesbien,
          SELLERS_BEFORE: SELLERS.length,
        });
        console.log("DEBUG existingSeller:", existingSeller);
        console.log("DEBUG profile after addSeller:", profile);
        console.log("🔥 SELLERS BEFORE PUSH:", SELLERS.length);

        console.log("🔥 SELLERS AFTER PUSH:", SELLERS.length);
      }

      console.log("🚨 JUST BEFORE UPSERT:", normalized.etatBien);

      // ===== UPSERT PROFIL EN DB =====

      try {
        await upsertProfile(
          { username, role: session.role, contact: req.user.contact },
          normalized,
        );
      } catch (err) {
        console.error("[DB UPSERT PROFILE ERROR]:", err);
      }
      if (
        session.role === "seller" &&
        !req.body.skipImages &&
        (!Array.isArray(session.criteria.imagesbien) ||
          session.criteria.imagesbien.length === 0)
      ) {
        console.log("📸 TRIGGER IMAGES POPUP CHECK:", {
          role: session.role,
          etatBien: session.criteria.etatBien,
          imagesbien: session.criteria.imagesbien,
        });

        return res.json({
          reply,
          triggerImagesPopup: true,
          criteria: session.criteria,
        });
      }
      if (
        session.role === "seller" &&
        !req.body.skipImages &&
        (!Array.isArray(session.criteria.imagesbien) ||
          session.criteria.imagesbien.length === 0)
      ) {
        console.log("⛔ BLOCK MATCHING - waiting for images");

        return res.json({
          reply,
          triggerImagesPopup: true,
          criteria: session.criteria,
        });
      } // ===== Matching =====

      const matches =
        session.role === "buyer"
          ? matchUsers(profile, 5)
          : matchSellerToBuyers(profile, 5);

      matches.forEach((m) => learnPreference(profile, m));
      session.matches = matches;
      session.phase = "results"; // ===== Appel IA postResult AVANT réponse =====

      let postReply = null;
      try {
        const postResultAI = await aiChatWithCriteria(
          "__POST_RESULTS__",
          session.criteria,
          { phase: "results", matchingProfiles: session.matches },
        );
        postReply =
          postResultAI.message ||
          "Souhaitez-vous que je vous aide à comparer ces profils ?";
      } catch (err) {
        console.error("[POST RESULTS AI ERROR]:", err);
        postReply =
          "Souhaitez-vous que je vous aide à choisir le profil le plus adapté ?";
      }

      return res.json({
        reply,
        matches,
        postReply,
        triggerImagesPopup: false,
        criteria: {
          ...session.criteria,
          surfaceMin: session.criteria.espaceMin,
          surfaceMax: session.criteria.espaceMax,
          surface: session.criteria.espaceMin,
        },
      });
    } // ===== Phase results =====
    if (session.phase === "results") {
      let postResultAI = {};
      try {
        postResultAI = await aiChatWithCriteria(message, session.criteria, {
          phase: "results",
          matchingProfiles: session.matches,
        });
      } catch (err) {
        console.error("[RESULTS PHASE AI ERROR]:", err);
        postResultAI = {
          message:
            "Je rencontre une difficulté à analyser votre demande. Pouvez-vous reformuler ?",
        };
      }

      return res.json({
        reply,
        postReply: postResultAI.message,
        criteria: session.criteria,
      });
    } // ===== Cas par défaut =====

    return res.json({ reply, criteria: session.criteria });
  } catch (err) {
    console.error("[CHAT] ERREUR INATTENDUE :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

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
    });

    const { pseudo, email, subject, body, receiverId } = schema.parse(req.body);

    console.log("[API /messages POST] Données après validation Zod :", {
      pseudo,
      email,
      subject,
      body,
      receiverId,
    });

    let receiver;

    if (receiverId) {
      // Cas réponse
      receiver = await db
        .prepare(`SELECT id, username, contact FROM users WHERE id = $1`)
        .get(receiverId);

      if (!receiver) {
        console.warn(
          "[API /messages POST] Destinataire introuvable (réponse) :",
          receiverId,
        );
        return res.status(404).json({ error: "Utilisateur introuvable" });
      }
    } else {
      // Cas nouveau message
      if (!pseudo || !email) {
        return res.status(400).json({
          error: "Pseudo et email obligatoires pour un nouveau message",
        });
      }

      const normalizedPseudo = pseudo.trim().toLowerCase();
      const normalizedEmail = email.trim().toLowerCase();

      console.log("[API /messages POST] Normalisé :", {
        normalizedPseudo,
        normalizedEmail,
      });

      receiver = await db
        .prepare(
          `SELECT id, username, contact FROM users 
           WHERE LOWER(TRIM(username)) = $1 AND LOWER(TRIM(contact)) = $2`,
        )
        .get(normalizedPseudo, normalizedEmail);

      if (!receiver) {
        console.warn(
          "[API /messages POST] Destinataire introuvable (nouveau) :",
          { normalizedPseudo, normalizedEmail },
        );
        return res.status(404).json({ error: "Utilisateur introuvable" });
      }
    }

    console.log("[API /messages POST] Destinataire trouvé :", receiver);

    const sender = await db
      .prepare(
        `SELECT id, username, contact FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(req.user.username.trim().toLowerCase());

    if (!sender) {
      console.error(
        "[API /messages POST] Expéditeur introuvable :",
        req.user.username,
      );
      return res.status(404).json({ error: "Expéditeur introuvable" });
    }

    console.log("[API /messages POST] Expéditeur trouvé :", sender);

    // Insérer le message
    const insert = await db
      .prepare(
        `INSERT INTO messages (sender_id, receiver_id, subject, body) VALUES ($1, $2, $3, $4) RETURNING id`,
      )
      .get(sender.id, receiver.id, subject, body);

    console.log("[API /messages POST] Message inséré :", insert);

    res.json({ success: true, messageId: insert.id });
  } catch (err) {
    console.error("[API /messages POST] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== RÉCUPÉRER LES MESSAGES ==================
app.get("/api/messages", authenticateToken, async (req, res) => {
  try {
    console.log("[API /messages GET] Requête pour :", req.user.username);

    const user = await db
      .prepare(
        `SELECT id, username, contact FROM users WHERE LOWER(TRIM(username)) = $1`,
      )
      .get(req.user.username.trim().toLowerCase());

    if (!user) {
      console.error(
        "[API /messages GET] Utilisateur introuvable :",
        req.user.username,
      );
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    console.log("[API /messages GET] Utilisateur trouvé :", user);

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
  m.timestamp

FROM messages m
JOIN users su ON m.sender_id = su.id
JOIN users ru ON m.receiver_id = ru.id

WHERE m.receiver_id = $1 OR m.sender_id = $1

ORDER BY m.timestamp ASC, m.id ASC;
      `,
      )
      .all(user.id);

    console.log(
      `[API /messages GET] Messages récupérés pour ${user.username} :`,
      messages.length,
    );

    res.json(messages);
  } catch (err) {
    console.error("[API /messages GET] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
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

    // Tentative 1 — OpenRouter
    try {
      const openRouter = new OpenAI({
        apiKey: process.env.ROUTER,
        baseURL: "https://openrouter.ai/api/v1",
      });
      const response1 = await openRouter.chat.completions.create({
        model: "openrouter/free",
        messages: [{ role: "user", content: fullPrompt }],
        temperature: 0.3,
        max_tokens: 1000, // ← AJOUTE ÇA, SDK mettait 16384 par défaut
      });
      aiText = response1?.choices?.[0]?.message?.content?.trim();
      console.log("✅ Diagnostic via OpenRouter");
    } catch (err1) {
      // REMPLACE TON WARN ACTUEL PAR ÇA :
      console.error("❌ OpenRouter ERREUR COMPLÈTE :", {
        message: err1.message,
        status: err1.status,
        code: err1.code,
        type: err1.type,
        headers: err1.headers,
        error: err1.error, // objet d'erreur OpenAI SDK
      });

      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(fullPrompt);
        aiText = result.response.text().trim();
        console.log("✅ Diagnostic via Gemini");
      } catch (err2) {
        // REMPLACE TON ERROR ACTUEL PAR ÇA :
        console.error("❌ Gemini ERREUR COMPLÈTE :", {
          message: err2.message,
          status: err2.status,
          code: err2.code,
          details: err2?.errorDetails,
          stack: err2.stack?.split("\n").slice(0, 4),
        });
      }
    }
    // --- RÉPONSE : IA OU SCRIPT LOCAL ---
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

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[SUPPORT] Token manquant");
      return res.status(401).json({ error: "Token manquant" });
    }

    console.log("[SUPPORT] Authorization header :", authHeader);

    const token = authHeader.split(" ")[1];
    console.log("[SUPPORT] Token extrait :", token);

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log(
        "[SUPPORT] Token valide pour :",
        decoded.username,
        "Role :",
        decoded.role,
      );
    } catch (err) {
      console.error("[SUPPORT] Token invalide :", err);
      return res.status(401).json({ error: "Token invalide" });
    }

    console.log("[SUPPORT] Body reçu :", req.body);

    const { subject, message } = req.body;
    if (!subject || !message) {
      console.warn("[SUPPORT] Sujet ou message manquant");
      return res.status(400).json({ error: "Sujet et message obligatoires" });
    }

    const emailContent = `
Nouveau message support :

Utilisateur : ${decoded.username}
Role : ${decoded.role}

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
