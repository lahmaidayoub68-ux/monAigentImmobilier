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
});
// ================== MIDDLEWARES ==================
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(
  helmet({
    // 🔥 IMPORTANT pour Leaflet + tiles externes
    crossOriginResourcePolicy: false,

    // 🔥 FIX PRINCIPAL → autorise l'envoi du Referer à OSM
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
          "'unsafe-inline'", // ⚠️ nécessaire si tu as du JS inline
          "'unsafe-eval'", // ⚠️ à retirer si possible en prod
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://unpkg.com",
        ],

        // ==========================
        // STYLES
        // ==========================
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Leaflet en a besoin
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],

        // ==========================
        // IMAGES (CRITIQUE POUR OSM)
        // ==========================
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.tile.openstreetmap.org",
          "https://api.dicebear.com",
          "https://unpkg.com",
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
        fontSrc: ["'self'", "data:"],

        // ==========================
        // AUTRES
        // ==========================
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],

        // 🔥 BONUS sécurité moderne
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
etatbien TEXT DEFAULT '',
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
 u.piecesmin  AS "piecesMin",
 u.surfacemin AS "surfaceMin",
 u.budgetmin  AS "budgetMin",
 u.piecesmax  AS "piecesMax",
  u.surfacemax AS "surfaceMax",
 u.budgetmax  AS "budgetMax"
FROM users u
`,
  )
  .all();
console.log(" RAW DB ROW (case sensitive check)");
allUsers.forEach((u) => {
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
    etatBien: u.etatBien || "",
    departement: getDepartement(u.ville),
  };

  if (u.role === "buyer") {
    addBuyer(profileData);
  } else if (u.role === "seller") {
    addSeller(profileData);
  }
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
    etatBien: normalized.etatBien ?? null, // BUYER STRICT

    budget: role === "buyer" ? (normalized.budgetMin ?? null) : 0,
    budgetMin: role === "buyer" ? (normalized.budgetMin ?? null) : 0,
    budgetMax: role === "buyer" ? (normalized.budgetMax ?? null) : 0,
    piecesMax: role === "buyer" ? (normalized.piecesMax ?? 999) : 0,
    piecesMin: role === "buyer" ? (normalized.piecesMin ?? null) : null,
    surfaceMin: role === "buyer" ? (normalized.surfaceMin ?? null) : null,
    surfaceMax: role === "buyer" ? (normalized.surfaceMax ?? 999) : 0,
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
  SET etatbien = ?
  WHERE username = ?
`,
    )
    .run(profileData.etatBien, username);

  console.log(" DIRECT UPDATE etatbien DONE"); // ================== DB UPSERT ==================

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
        etatbien: profileData.etatBien,
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
        "etatbien",
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

    if (req.body.etatBien !== undefined) {
      session.criteria.etatBien = req.body.etatBien;
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

    session.criteria = {
      ...session.criteria,
      ...safeCriteria, // plus de null qui écrase

      surfaceMin:
        aiResponse.criteria?.surfaceMin ??
        aiResponse.criteria?.espaceMin ??
        session.criteria.surfaceMin,

      piecesMin: aiResponse.criteria?.piecesMin ?? session.criteria.piecesMin,

      etatBien: aiResponse.criteria?.etatBien ?? session.criteria.etatBien,
    };

    console.log(" [SESSION AFTER MERGE]", session.criteria);

    console.log("CRITERIA MERGED:", session.criteria); // ===== Préparation reply =====

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

    const surfaceMin = normalizeSurface(session.criteria) ?? null;
    const surfaceMax =
      session.criteria.surfaceMax != null
        ? Number(session.criteria.surfaceMax)
        : 9999;

    const budgetMin = Number(session.criteria.budgetMin ?? 0);
    let budgetMax = Number(session.criteria.budgetMax ?? budgetMin);
    if (budgetMax < budgetMin) budgetMax = budgetMin; // ===== NORMALIZED FINAL =====
    const normalized = {
      type: session.criteria.type ? normalize(session.criteria.type) : "",
      ville: session.criteria.ville ? normalize(session.criteria.ville) : "",

      budgetMin,
      budgetMax,
      piecesMin,
      piecesMax,
      surfaceMin,
      surfaceMax, // AJOUT ICI

      etatBien:
        req.body.etatBien ??
        aiResponse.criteria?.etatBien ??
        session.criteria.etatBien, // SELLER ONLY

      ...(session.role === "seller" && {
        price: budgetMin,
        pieces: piecesMin,
        surface: surfaceMin,
        etatBien:
          req.body.etatBien ??
          aiResponse.criteria?.etatBien ??
          session.criteria.etatBien,
      }),
    };
    console.log(" [NORMALIZED FINAL]", JSON.stringify(normalized, null, 2)); // ===== Vérification critères complets =====

    const missingCriteria = ORDER.filter((k) => {
      if (k === "pieces") return session.criteria.piecesMin === undefined;
      if (k === "espace") return session.criteria.espaceMin === undefined; // toleranceKm géré à part (buyer only)

      if (k === "toleranceKm") return false;

      return session.criteria[k] === undefined;
    }); // règle métier séparée (plus safe)
    const etatBienMissing =
      session.role === "seller" && session.criteria.etatBien === undefined;

    const toleranceMissing =
      session.role === "buyer" &&
      session.criteria.ville !== undefined &&
      session.criteria.toleranceKm === undefined;

    const budgetIncomplete = session.criteria.budgetMin === undefined;
    const isFinalTrigger = req.body.etatBien !== undefined;
    // ===== Phase collecting =====

    if (session.phase === "collecting") {
      // si critères incomplets => juste réponse IA
      if (
        !isFinalTrigger &&
        (budgetIncomplete ||
          missingCriteria.length > 0 ||
          toleranceMissing ||
          etatBienMissing)
      ) {
        return res.json({ reply, criteria: session.criteria });
      }
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
          contact: req.user.contact || "",
        });
        console.log("DEBUG existingSeller:", existingSeller);
        console.log("DEBUG profile after addSeller:", profile);
      }
      console.log("🚨 JUST BEFORE UPSERT:", normalized.etatBien);

      await upsertProfile(
        { username, role: session.role, contact: req.user.contact },
        normalized,
      ); // ===== UPSERT PROFIL EN DB =====

      try {
        await upsertProfile(
          { username, role: session.role, contact: req.user.contact },
          normalized,
        );
      } catch (err) {
        console.error("[DB UPSERT PROFILE ERROR]:", err);
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
// ================== STATS ==================
app.get("/api/stats", authenticateToken, async (req, res) => {
  try {
    const usernameNormalized = req.user.username.trim().toLowerCase();

    // ================== RÉCUPÉRATION USER DB ==================
    const user = await db
      .prepare("SELECT id, username FROM users WHERE LOWER(TRIM(username)) = ?")
      .get(usernameNormalized);

    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    // ================== FAVORIS ==================
    const favResult = await db
      .prepare("SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?")
      .get(user.id);
    const totalFavoris = favResult?.count || 0;

    // ================== CONVERSATIONS ACTIVES ==================
    const convoResult = await db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) AS count
         FROM messages
         WHERE sender_id = ? OR receiver_id = ?`,
      )
      .get(user.id, user.id, user.id);
    const activeConversations = convoResult?.count || 0;

    // ================== MATCHING (LOGIQUE EXISTANTE) ==================
    // Buyer
    const buyerProfiles = BUYERS.filter(
      (b) => b.username === req.user.username,
    );
    const buyerProfile =
      buyerProfiles.length > 0 ? buyerProfiles[buyerProfiles.length - 1] : null;

    // Seller
    const sellerProfiles = SELLERS.filter(
      (s) => s.username === req.user.username,
    );
    const sellerProfile =
      sellerProfiles.length > 0
        ? sellerProfiles[sellerProfiles.length - 1]
        : null;

    let allMatches = [];
    if (buyerProfile) {
      allMatches = matchUsers(buyerProfile, Number.MAX_SAFE_INTEGER);
    } else if (sellerProfile) {
      allMatches = matchSellerToBuyers(sellerProfile, Number.MAX_SAFE_INTEGER);
    }

    // ================== SI AUCUN MATCH ==================
    if (!allMatches || allMatches.length === 0) {
      return res.json({
        totalMatches: 0,
        averageCompatibility: 0,
        totalFavoris,
        activeConversations,
        distribution: { forte: 0, bonne: 0, moyenne: 0, faible: 0 },
        matches: [],
        topMatch: null,
      });
    }

    // ================== STATS MATCHS ==================
    const totalMatches = allMatches.length;
    const averageCompatibility = Math.round(
      allMatches.reduce((sum, m) => sum + (m.compatibility || 0), 0) /
        totalMatches,
    );

    const distribution = { forte: 0, bonne: 0, moyenne: 0, faible: 0 };
    allMatches.forEach((m) => {
      const c = m.compatibility || 0;
      if (c >= 80) distribution.forte++;
      else if (c >= 60) distribution.bonne++;
      else if (c >= 40) distribution.moyenne++;
      else distribution.faible++;
    });

    const topMatch = allMatches.reduce((prev, curr) =>
      (curr.compatibility || 0) > (prev.compatibility || 0) ? curr : prev,
    );

    // ================== RÉPONSE FINALE ==================
    res.json({
      totalMatches,
      averageCompatibility,
      totalFavoris,
      activeConversations,
      distribution,
      matches: allMatches.map((m) => ({
        username: m.username,
        compatibility: m.compatibility,
        score: m.score,
        common: m.common,
        different: m.different,
        villeScoreVal: m.villeScoreVal,
        lat: m.lat,
        lng: m.lng,
        buyerLat: m.buyerLat ?? null,
        buyerLng: m.buyerLng ?? null,
        price: m.price ?? m.budget ?? 0,
        pieces: m.pieces ?? m.piecesMin ?? 0,
        surface: m.surface ?? m.surfaceMin ?? 0,
        type: m.type,
        ville: m.ville,
        criteriaMatch: m.criteriaMatch ?? {
          ville: false,
          budget: false,
          pieces: false,
          surface: false,
        },
      })),
      topMatch,
    });
  } catch (err) {
    console.error("[API /stats] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
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
app.post("/api/ai-analysis", authenticateToken, async (req, res) => {
  try {
    let { data } = req.body;
    if (!data || !Array.isArray(data) || data.length === 0)
      return res.status(400).json({ error: "Données manquantes ou invalides" });

    const username = req.user.username;

    // Crée la session si besoin (optionnel)
    if (!sessions[username]) sessions[username] = {};

    // ======== Construction du prompt ========
    const buildAIPrompt = (
      data,
      criteriaOrder = ["budget", "surface", "pieces", "ville", "type"],
    ) => {
      let prompt =
        "Analyse des 30 meilleurs biens immobiliers selon les critères suivants :\n\n";
      criteriaOrder.forEach((crit) => {
        prompt += `Critère: ${crit}\n`;
        prompt += `Données: ${JSON.stringify(data)}\n`;
        prompt +=
          "Indique un paragraphe clair, structuré avec analyse et recommandations pour ce critère.\n\n";
      });
      prompt +=
        "Le texte final doit être en français, lisible, professionnel et concis.\n";
      return prompt;
    };

    const fullPrompt = buildAIPrompt(data);

    // ======== Appel OpenRouter ========
    const aiClient = new OpenAI({
      apiKey: process.env.ROUTER,
      baseURL: "https://openrouter.ai/api/v1", // URL corrigée
    });

    const aiResponse = await aiClient.chat.completions.create({
      model: "openai/gpt-4o-mini", // modèle valide et gratuit
      messages: [
        {
          role: "system",
          content:
            "Tu es un expert analyste immobilier. Tu rédiges un paragraphe structuré pour chaque critère, avec analyse + recommandations.",
        },
        { role: "user", content: fullPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2500,
    });

    const aiText = aiResponse?.choices?.[0]?.message?.content?.trim();

    // ======== Fallback NLP si IA ne répond pas ========
    if (!aiText) {
      console.warn("[AI] IA ne renvoie pas de texte, fallback activé");

      const fallback = generateDiagnostic(
        data,
        {
          budgetMax: 0,
          surfaceMax: 0,
          piecesMax: 0,
        },
        "buyer",
      );

      const corrected = await Promise.all(
        fallback.map(
          async (html) => await correctWithLanguageToolPreserveHTML(html),
        ),
      );

      return res.json({ analysis: corrected.join("") });
    }

    // ======== Réponse finale ========
    res.json({ analysis: aiText });
  } catch (err) {
    console.error("[/api/ai-analysis] Error:", err);

    // Fallback sur LanguageTool pour sécurité
    if (req.body.data) {
      const fallback = generateDiagnostic(
        req.body.data,
        {
          budgetMax: 0,
          surfaceMax: 0,
          piecesMax: 0,
        },
        "buyer",
      );

      const corrected = await Promise.all(
        fallback.map(
          async (html) => await correctWithLanguageToolPreserveHTML(html),
        ),
      );

      return res.json({ analysis: corrected.join("") });
    }

    res
      .status(500)
      .json({ error: "Erreur serveur lors de l'appel à l'IA d'analyse" });
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
