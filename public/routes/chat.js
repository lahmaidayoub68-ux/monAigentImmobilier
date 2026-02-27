// routes/chat.js
import express from "express";
const router = express.Router();

/**
 * POST /
 * body: { message, history, intent, role }
 * 
 * Retourne toujours un JSON compatible chatbot.js :
 * { reply, role, criteria, matches }
 */
router.post("/", (req, res) => {
  const { message = "", history = [], intent = "general", role = null } = req.body;

  // Réponses fallback
  const RESPONSES = {
    immobilier: [
      "Parfait — voulez-vous préciser si vous êtes acheteur ou vendeur ?",
      "On peut commencer par le budget, la région, et le type de bien."
    ],
    listing: ["Je peux vous montrer des listings correspondant à vos critères."],
    need: ["D’accord, je note ça. Peux-tu me donner le budget approximatif ?"],
    match: ["Je lance une recherche correspondant à vos critères…"],
    help: ["Je peux t’aider à chercher un bien ou à publier une annonce."],
    general: ["Peux-tu préciser ? Budget, région ou type de bien par exemple."],
  };

  // Sélection d'une réponse aléatoire selon l'intent
  const opts = RESPONSES[intent] || RESPONSES.general;
  const reply = opts[Math.floor(Math.random() * opts.length)];

  // Renvoi JSON compatible chatbot.js
  return res.json({
    reply, // message à afficher
    role: role || "inconnu", // rôle de l'utilisateur
    criteria: {}, // critères vides pour fallback
    matches: [] // aucun match pour fallback
  });
});

export default router;
	
