//================ IMPORTS ==================//
import express from "express";
import Database from "better-sqlite3";
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
import fs from "fs";
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

import { seedProfiles } from "./services/seedProfiles.js";

dotenv.config();
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET manquant");

// ================== SETUP ==================
const app = express();
const db = new Database("data.db");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// ================== VILLES ==================
const villes = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "./services/villes_simplifie.json"),
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

// ================== MIDDLEWARES ==================
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],

        styleSrc: ["'self'", "'unsafe-inline'"],

        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.tile.openstreetmap.org",
        ],

        connectSrc: ["'self'"],

        fontSrc: ["'self'", "data:"],
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
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
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
    budgetMin REAL DEFAULT 0,
    budgetMax REAL DEFAULT 0,
    piecesMin INTEGER DEFAULT 0,
    piecesMax INTEGER DEFAULT 100,
    surfaceMin REAL DEFAULT 0,
    surfaceMax REAL DEFAULT 1000
  )
`,
).run();
// ================== TABLE MESSAGES ==================
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  )
`,
).run();

// ================== TABLE FAVORITES ==================
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    profile_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`,
).run();

// ================== INIT PROFILS MATCHING EN PROD ==================
console.log("🔄 Initialisation des profils depuis la DB...");

// Reset des arrays pour éviter doublons si reload
resetProfiles();

// Récupérer tous les utilisateurs avec les infos nécessaires
const allUsers = db
  .prepare(
    `
  SELECT u.id, u.username, u.role, u.contact,
         u.ville, u.region, u.type, u.price, u.pieces, u.surface,
         u.budget, u.budgetMin, u.budgetMax,
         u.piecesMin, u.piecesMax,
         u.surfaceMin, u.surfaceMax
  FROM users u
`,
  )
  .all();

allUsers.forEach((u) => {
  const profileData = {
    username: u.username,
    contact: u.contact || "",
    role: u.role,
    ville: u.ville || "",
    region: u.region || u.ville || "",
    type: normalize(u.type || "appartement"),
    price: u.price ?? 0,
    pieces: u.pieces ?? 1,
    surface: u.surface ?? 10,
    budget: u.budget ?? null,
    budgetMin: u.budgetMin ?? u.budget ?? 0,
    budgetMax: u.budgetMax ?? u.budget ?? 0,
    piecesMin: u.piecesMin ?? 0,
    piecesMax: u.piecesMax ?? Infinity,
    surfaceMin: u.surfaceMin ?? 0,
    surfaceMax: u.surfaceMax ?? Infinity,
  };

  if (u.role === "buyer") {
    addBuyer(profileData);
  } else if (u.role === "seller") {
    addSeller(profileData);
  }
});

// ================== INIT FAVORITES ==================
const allFavorites = db
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
const allMessages = db
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
  `✅ Initialisation terminée : ${BUYERS.length} buyers, ${SELLERS.length} sellers`,
);
console.log(
  `✅ Messages récupérés : ${allMessages.length}, favoris : ${allFavorites.length}`,
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
function upsertProfile(user, normalized) {
  const { username, contact, role } = user;

  // Préparer le profil complet
  const profileData = {
    username,
    contact: contact || "",
    role, // 🔥 AJOUTE ÇA
    type: normalized.type || "",
    ville: normalized.ville || "",
    region: normalized.ville || "",
    price: role === "seller" ? normalized.price || 0 : 0,
    budgetMin: role === "buyer" ? normalized.budgetMin || 0 : 0,
    budgetMax: role === "buyer" ? normalized.budgetMax || 0 : 0,
    pieces: role === "seller" ? normalized.piecesMin || 0 : 0,
    piecesMin: role === "buyer" ? normalized.piecesMin || 0 : 0,
    surface: role === "seller" ? normalized.surfaceMin || 0 : 0,
    surfaceMin: role === "buyer" ? normalized.surfaceMin || 0 : 0,
  };

  // ================== MEMORY UPSERT ==================
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
  // ================== DB UPSERT ==================
  try {
    db.prepare(
      `
      INSERT INTO users (
        username, password, role, contact, type, ville, region, price, budgetMin, budgetMax,
        piecesMin, piecesMax, surfaceMin, surfaceMax, pieces, budget, surface
      ) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        role = excluded.role,
        contact = excluded.contact,
        type = excluded.type,
        ville = excluded.ville, 
        region = excluded.region,
        price = excluded.price,
        pieces = excluded.pieces,
        surface = excluded.surface,
        budget = excluded.budget,
        budgetMin = excluded.budgetMin,
        budgetMax = excluded.budgetMax,
        piecesMin = excluded.piecesMin,
        piecesMax = excluded.piecesMax,
        surfaceMin = excluded.surfaceMin,
        surfaceMax = excluded.surfaceMax
      `,
    ).run(
      username,
      role,
      contact || "",
      profileData.type,
      profileData.ville,
      profileData.region,
      profileData.price,
      profileData.budgetMin,
      profileData.budgetMax,
      profileData.piecesMin,
      profileData.piecesMax,
      profileData.surfaceMin,
      profileData.surfaceMax,
    );
  } catch (err) {
    console.error("[UPSERT PROFILE DB ERROR] :", err);
  }

  return profileData;
}
// ================== CHAT SYSTEM ==================
const sessions = {};
const ORDER = ["type", "ville", "pieces", "espace"];

// ================== IMPORT AI CHAT ==================
import { aiChatWithCriteria } from "./services/aiParsee.js";
// ================== CHAT ROUTE ==================
app.post("/chat", authenticateToken, async (req, res) => {
  try {
    // ========== VALIDATION DU MESSAGE ==========
    const { message } = z
      .object({ message: z.string().min(1) })
      .parse(req.body);

    const username = req.user.username;
    const userRole = req.user.role;

    // ========== INITIALISATION SESSION ==========
    if (!sessions[username]) {
      sessions[username] = {
        started: false,
        criteria: {},
        role: userRole,
        phase: "collecting", // collecting | results
        matches: [],
      };
    }
    const session = sessions[username];
    session.role = userRole;

    // ========== APPEL AI ==========
    let aiResponse = {};
    try {
      aiResponse = await aiChatWithCriteria(message, session.criteria, {
        phase: session.phase,
        matchingProfiles: session.matches,
      });
    } catch (err) {
      console.error("[CHAT] Erreur AI :", err);
      aiResponse = {
        message: "Désolé, je n'ai pas compris. Pouvez-vous reformuler ?",
        criteria: session.criteria,
      };
    }

    // ========== LOG CRITÈRES BRUTS ==========
    console.log(`[AI RAW CRITERIA] User ${username}:`, aiResponse.criteria);

    // ========== MISE À JOUR DES CRITÈRES ==========
    session.criteria = aiResponse.criteria || session.criteria;

    // ========== INTRODUCTION ==========
    let reply = "";
    if (!session.started) {
      reply +=
        aiResponse.message || "Bonjour ! Je suis votre assistant immobilier. ";
      session.started = true;
    } else if (aiResponse.message) {
      reply += aiResponse.message;
    }

    // ========== PARSING / NORMALISATION ==========
    const parseNumber = (value, fallback = 0) => {
      if (value == null) return fallback;
      const num = Number(String(value).replace(/[^\d.-]/g, ""));
      return isNaN(num) ? fallback : num;
    };

    const budgetMin = parseNumber(session.criteria.budgetMin, 0);
    let budgetMax = parseNumber(session.criteria.budgetMax, budgetMin);
    if (budgetMax < budgetMin) budgetMax = budgetMin;

    const normalized = {
      type: session.criteria.type ? normalize(session.criteria.type) : "",
      ville: session.criteria.ville ? normalize(session.criteria.ville) : "",
      piecesMin: parseNumber(session.criteria.piecesMin, 0),
      piecesMax: parseNumber(session.criteria.piecesMax, Infinity),
      surfaceMin: parseNumber(session.criteria.espaceMin, 0),
      surfaceMax: parseNumber(session.criteria.espaceMax, Infinity),
      budgetMin: budgetMin,
      budgetMax: budgetMax,
      price: budgetMin,
    };

    console.log(`[AI NORMALIZED CRITERIA] User ${username}:`, normalized);

    // ========== CHECK CRITERIA COMPLETION ==========
    const missingCriteria = ORDER.filter((k) => {
      if (k === "pieces") return session.criteria.piecesMin === undefined;
      if (k === "espace") return session.criteria.espaceMin === undefined;
      return session.criteria[k] === undefined;
    });
    const budgetIncomplete = session.criteria.budgetMin === undefined;

    if (session.phase === "collecting") {
      // Tant que tous les critères ne sont pas remplis
      if (budgetIncomplete || missingCriteria.length > 0) {
        return res.json({
          reply,
          criteria: session.criteria,
        });
      }

      // ========== CRITÈRES COMPLETS => UPSERT PROFILE ==========
      const profile = upsertProfile(req.user, normalized);

      // ========== MATCHING ==========
      const matches =
        session.role === "buyer"
          ? matchUsers(profile, 5)
          : matchSellerToBuyers(profile, 5);

      matches.forEach((m) => learnPreference(profile, m));

      session.matches = matches;
      session.phase = "results";

      // 🔥 APPEL IA AUTOMATIQUE JUSTE APRÈS AFFICHAGE DES MATCHES
      let postResultAI = {};
      try {
        postResultAI = await aiChatWithCriteria(
          "__POST_RESULTS__", // message interne déclencheur
          session.criteria,
          {
            phase: "results",
            matchingProfiles: session.matches,
          },
        );
      } catch (err) {
        console.error("[POST RESULTS AI ERROR]:", err);
        postResultAI = {
          message:
            "Souhaitez-vous que je vous aide à choisir le profil le plus adapté ou approfondir un point particulier ?",
        };
      }

      return res.json({
        reply,
        matches,
        postReply: postResultAI.message,
        criteria: session.criteria,
      });
    }

    // ========== PHASE RESULTS ==========
    if (session.phase === "results") {
      // session.matches EXISTE DÉJÀ

      let postResultAI = {};
      try {
        postResultAI = await aiChatWithCriteria(
          message, // 👈 VRAI MESSAGE UTILISATEUR
          session.criteria,
          {
            phase: "results",
            matchingProfiles: session.matches,
          },
        );
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
    }

    // ========== CAS PAR DÉFAUT ==========
    return res.json({
      reply,
      criteria: session.criteria,
    });
  } catch (err) {
    console.error("[CHAT] ERREUR INATTENDUE :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}); // <-- fermer app.post /chat ici

// ================== AUTH ROUTES ==================
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

    if (db.prepare("SELECT 1 FROM users WHERE username=?").get(username))
      return res.status(409).json({ error: "Utilisateur déjà existant" });
    const hash = await bcrypt.hash(password, 10);
    db.prepare(
      `
INSERT INTO users (
  id, username, password, role, contact, ville, region, type, price,
  budget, budgetMin, budgetMax, pieces, piecesMin, piecesMax,
  surface, surfaceMin, surfaceMax
) VALUES (
  NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
)
`,
    ).run(
      username, // username
      hash, // password
      role, // role
      contact, // contact
      "", // ville
      "", // region
      "appartement", // type
      0, // price
      0, // budget
      0, // budgetMin
      0, // budgetMax
      1, // pieces
      0, // piecesMin
      100, // piecesMax
      10, // surface
      0, // surfaceMin
      1000, // surfaceMax
    );

    res.json({ token: generateToken({ username, role, contact }) });
  } catch (err) {
    console.error("[SIGNUP] ERREUR INATTENDUE:", err.stack);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

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

    const user = db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username);
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.sendStatus(401);

    delete sessions[username];
    res.json({ token: generateToken(user) });
  } catch (err) {
    console.error("[LOGIN] ERREUR INATTENDUE:", err.stack);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== PROFIL UTILISATEUR ==================
app.get("/api/me", authenticateToken, (req, res) => {
  try {
    const user = db
      .prepare("SELECT username, role, contact FROM users WHERE username = ?")
      .get(req.user.username);

    if (!user) {
      return res.sendStatus(404);
    }

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

    // Récupération utilisateur depuis DB
    const user = db
      .prepare("SELECT id, password FROM users WHERE username=?")
      .get(req.user.username);

    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    // Vérifier mot de passe actuel
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ error: "Mot de passe actuel incorrect" });
    }

    // Hacher le nouveau mot de passe
    const newHash = await bcrypt.hash(newPassword, 10);

    // Mettre à jour la DB
    db.prepare("UPDATE users SET password=? WHERE id=?").run(newHash, user.id);

    console.log(`[PROFIL] Mot de passe changé pour ${req.user.username}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[API /change-password] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ================== MESSAGES ==================

// Envoyer un message
app.post("/api/messages", authenticateToken, (req, res) => {
  try {
    console.log("[API /messages POST] Requête reçue :", req.body);

    // On accepte pseudo/email pour nouveau message, ou receiverId pour réponse
    const schema = z.object({
      pseudo: z.string().min(1).optional(),
      email: z.string().email().optional(),
      subject: z.string().min(1),
      body: z.string().min(1),
      receiverId: z.number().optional(), // ID du destinataire si c'est une réponse
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
      // Cas réponse : on connaît déjà le destinataire
      receiver = db
        .prepare(
          `  
    SELECT id, username, contact  
    FROM users  
    WHERE id=?  
  `,
        )
        .get(receiverId);

      if (!receiver) {
        console.warn(
          "[API /messages POST] Destinataire introuvable (réponse) :",
          receiverId,
        );
        return res.status(404).json({ error: "Utilisateur introuvable" });
      }
    } else {
      // Cas nouveau message : pseudo + email obligatoires
      if (!pseudo || !email) {
        return res.status(400).json({
          error: "Pseudo et email obligatoires pour un nouveau message",
        });
      }

      // Normalisation : trim et lowercase
      const normalizedPseudo = pseudo.trim().toLowerCase();
      const normalizedEmail = email.trim().toLowerCase();

      console.log("[API /messages POST] Normalisé :", {
        normalizedPseudo,
        normalizedEmail,
      });

      // Vérifier destinataire
      receiver = db
        .prepare(
          `  
    SELECT id, username, contact  
    FROM users  
    WHERE LOWER(TRIM(username))=?  
      AND LOWER(TRIM(contact))=?  
  `,
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

    // Vérifier l'expéditeur
    const sender = db
      .prepare(
        `  
  SELECT id, username, contact  
  FROM users  
  WHERE LOWER(TRIM(username))=?  
`,
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
    const insert = db
      .prepare(
        `  
  INSERT INTO messages (sender_id, receiver_id, subject, body)  
  VALUES (?, ?, ?, ?)  
`,
      )
      .run(sender.id, receiver.id, subject, body);

    console.log("[API /messages POST] Message inséré :", insert);

    res.json({ success: true });
  } catch (err) {
    console.error("[API /messages POST] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Récupérer les messages
app.get("/api/messages", authenticateToken, (req, res) => {
  try {
    console.log("[API /messages GET] Requête pour :", req.user.username);

    const user = db
      .prepare(
        `  
  SELECT id, username, contact  
  FROM users  
  WHERE LOWER(TRIM(username))=?  
`,
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

    // ✅ Modification : renvoyer senderId et senderEmail pour que le front puisse stocker receiverIdStore correctement
    const messages = db
      .prepare(
        `

SELECT
m.id,
m.sender_id,
m.receiver_id,
su.username AS sender,
su.contact AS senderEmail,
ru.username AS receiver,
ru.contact AS receiverEmail,
m.subject,
m.body,
m.timestamp
FROM messages m
JOIN users su ON m.sender_id = su.id
JOIN users ru ON m.receiver_id = ru.id
WHERE m.receiver_id = ? OR m.sender_id = ?
ORDER BY m.timestamp ASC
`,
      )
      .all(user.id, user.id);

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
// ================== SUPPRESSION MESSAGE ==================
app.delete("/api/messages/:id", authenticateToken, (req, res) => {
  try {
    const msgId = Number(req.params.id);
    if (!msgId)
      return res.status(400).json({ error: "ID du message invalide" });

    // Vérifier que le message existe et que l'utilisateur y est impliqué
    const user = db
      .prepare(
        `  
  SELECT id FROM users WHERE LOWER(TRIM(username))=?  
`,
      )
      .get(req.user.username.trim().toLowerCase());

    if (!user)
      return res.status(404).json({ error: "Utilisateur introuvable" });

    const message = db
      .prepare(
        `  
  SELECT * FROM messages WHERE id=? AND (sender_id=? OR receiver_id=?)  
`,
      )
      .get(msgId, user.id, user.id);

    if (!message)
      return res
        .status(404)
        .json({ error: "Message introuvable ou accès refusé" });

    // Supprimer le message
    db.prepare("DELETE FROM messages WHERE id=?").run(msgId);

    res.json({ success: true, message: "Message supprimé" });
  } catch (err) {
    console.error("[API /messages DELETE] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ================== FAVORITES ==================
app.get("/api/favorites", authenticateToken, (req, res) => {
  try {
    const usernameNormalized = req.user.username.trim().toLowerCase();

    // Récupération utilisateur
    const user = db
      .prepare(`SELECT id FROM users WHERE LOWER(username)=?`)
      .get(usernameNormalized);

    console.log("[DEBUG GET FAVORITES] USER FROM TOKEN:", req.user.username);
    console.log("[DEBUG GET FAVORITES] USER FOUND IN DB:", user);

    if (!user) return res.sendStatus(404);

    // Récupération des favoris
    const favorites = db
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
      const data = JSON.parse(f.profile_data);
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

app.post("/api/favorites", authenticateToken, (req, res) => {
  try {
    const usernameNormalized = req.user.username.trim().toLowerCase();

    // Récupération utilisateur
    const user = db
      .prepare(`SELECT id FROM users WHERE LOWER(username)=?`)
      .get(usernameNormalized);

    console.log("[DEBUG POST FAVORITES] USER FROM TOKEN:", req.user.username);
    console.log("[DEBUG POST FAVORITES] USER FOUND IN DB:", user);

    if (!user) return res.sendStatus(404);

    const profile = req.body;

    const info = db
      .prepare(`INSERT INTO favorites (user_id, profile_data) VALUES (?, ?)`)
      .run(user.id, JSON.stringify(profile));

    console.log("[DEBUG POST FAVORITES] FAVORITE INSERTED:", info);

    res.json({ success: true, dbId: info.lastInsertRowid });
  } catch (err) {
    console.error("[API /favorites POST] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/favorites/:id", authenticateToken, (req, res) => {
  try {
    const usernameNormalized = req.user.username.trim().toLowerCase();

    // Récupération utilisateur
    const user = db
      .prepare(`SELECT id FROM users WHERE LOWER(username)=?`)
      .get(usernameNormalized);

    console.log("[DEBUG DELETE FAVORITES] USER FROM TOKEN:", req.user.username);
    console.log("[DEBUG DELETE FAVORITES] USER FOUND IN DB:", user);

    if (!user) return res.sendStatus(404);

    const favId = Number(req.params.id);

    const result = db
      .prepare(
        `
        DELETE FROM favorites
        WHERE id = ? AND user_id = ?
      `,
      )
      .run(favId, user.id);

    console.log("[DEBUG DELETE FAVORITES] ROWS AFFECTED:", result.changes);

    res.json({ success: true });
  } catch (err) {
    console.error("[API /favorites DELETE] ERREUR :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/stats", authenticateToken, (req, res) => {
  try {
    const usernameNormalized = req.user.username.trim().toLowerCase();

    // ================== RÉCUPÉRATION USER DB ==================
    const user = db
      .prepare("SELECT id, username FROM users WHERE LOWER(TRIM(username))=?")
      .get(usernameNormalized);

    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    // ================== FAVORIS ==================
    const favResult = db
      .prepare("SELECT COUNT(*) as count FROM favorites WHERE user_id = ?")
      .get(user.id);
    const totalFavoris = favResult?.count || 0;

    // ================== CONVERSATIONS ACTIVES ==================
    const convoResult = db
      .prepare(
        "SELECT COUNT(DISTINCT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) as count FROM messages WHERE sender_id = ? OR receiver_id = ?",
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

    // Seller (version corrigée et sécurisée)
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
        buyerLat: m.buyerLat != null ? m.buyerLat : null,
        buyerLng: m.buyerLng != null ? m.buyerLng : null,
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
    session.criteria = response.criteria || session.criteria;

    res.json(response);
  } catch (err) {
    console.error("[/api/ai] Error:", err);
    res.status(500).json({ error: "Erreur serveur lors de l'appel à l'IA" });
  }
});

// ================== START ==================
app.listen(PORT, HOST, () => {
  console.log(`🚀 Serveur lancé sur http://${HOST}:${PORT}`);
});
