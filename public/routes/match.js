// routes/match.js
import express from "express";
import jwt from "jsonwebtoken";
import { addSeller, addBuyer, matchForBuyer } from "../services/matchingEngine.js";

const router = express.Router();

// ================== MIDDLEWARE JWT ==================
router.use((req, res, next) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader) {
    console.warn("[match] requête sans Authorization");
    return res.status(401).json({ error: "Token manquant" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    console.warn("[match] token mal formé");
    return res.status(401).json({ error: "Token manquant" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "change_this_secret");
    req.user = payload; // disponible dans req.user
    next();
  } catch (err) {
    console.error("[match] token invalide", err.message);
    return res.status(403).json({ error: "Token invalide" });
  }
});

// ================== POST /match ==================
router.post("/", (req, res) => {
  try {
    const { role, criteria } = req.body;
    if (!role || !criteria) {
      return res.status(400).json({ error: "role and criteria required" });
    }

    // ================== VENDEUR ==================
    if (role === "vendeur") {
      const seller = addSeller(criteria);
      return res.json({
        reply: "Vendeur enregistré ✅",
        role: "vendeur",
        criteria: seller,
        matches: []
      });
    }

    // ================== ACHETEUR ==================
    if (role === "acheteur") {
      const buyer = addBuyer(criteria);
      const matches = matchForBuyer(buyer);

      return res.json({
        reply: matches.length
          ? `${matches.length} résultat(s) trouvé(s) 🔎`
          : "Aucun bien correspondant pour le moment.",
        role: "acheteur",
        criteria: criteria,
        matches
      });
    }

    return res.status(400).json({ error: "role must be 'acheteur' or 'vendeur'" });
  } catch (err) {
    console.error("[match] erreur serveur:", err);
    return res.status(500).json({ error: "Erreur serveur lors du matching" });
  }
});

export default router;
	
