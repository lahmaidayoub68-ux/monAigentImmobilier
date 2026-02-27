// utils/fallback.js

// Réponses par défaut quand le serveur ne répond pas
export function fallbackReply(userMessage) {
  const genericReplies = [
    "Je n'ai pas compris, peux-tu reformuler ? 🤔",
    "Désolé, je rencontre un petit problème. Peux-tu réessayer ?",
    "Hmm… je n'ai pas de réponse pour ça pour l'instant.",
    "Je suis encore en train d'apprendre, peux-tu préciser ?"
  ];


  // Sinon, réponse générique aléatoire
  return genericReplies[Math.floor(Math.random() * genericReplies.length)];
}
