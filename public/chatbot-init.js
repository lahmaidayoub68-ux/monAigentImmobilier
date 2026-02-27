// ================== INIT CHATBOT ==================
import { initChatbot } from "./chatbot.js";

// Initialisation du chatbot
initChatbot();

// ================== MATCHING VIA API ==================
const btnSendMatch = document.getElementById('btn-send-match');
if (btnSendMatch) {
  btnSendMatch.setAttribute("type", "button"); // empêche le submit si dans un formulaire

  btnSendMatch.addEventListener('click', async e => {
    e.preventDefault();

    // Récupération des critères depuis le formulaire
    const newCriteria = {
      ville: document.getElementById('ville')?.value || null,
      budget: Number(document.getElementById('price')?.value) || null,
      type: document.getElementById('type')?.value || null,
    };

    try {
      const userData = JSON.parse(localStorage.getItem("agent_user"));
      if (!userData?.token) throw new Error("Utilisateur non connecté");

      const response = await fetch("/api/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userData.token}`
        },
        body: JSON.stringify(newCriteria)
      });

      if (!response.ok) throw new Error("Erreur API /api/match");

      const data = await response.json();

      // Affichage des résultats dans #matches
      const matchesDiv = document.getElementById("matches");
      if (!matchesDiv) return;
      matchesDiv.innerHTML = "";

      if (data.matches && data.matches.length > 0) {
        data.matches.forEach(match => {
          const div = document.createElement("div");
          div.className = "match-item";
          div.innerHTML = `
            <strong>${match.type || "Bien"}</strong> à ${match.ville || "?"} - ${match.budget || "?"} €
            <br>Surface: ${match.surface || "?"} m² - ${match.pieces || "?"} pièces
            <br>Score: ${match.score || "?"}
          `;
          matchesDiv.appendChild(div);
        });
      } else {
        matchesDiv.innerHTML = "<p>Aucun bien correspondant pour le moment.</p>";
      }

    } catch (err) {
      console.error("Erreur fetch /api/match :", err);
      const matchesDiv = document.getElementById("matches");
      if (matchesDiv) matchesDiv.innerHTML = "<p>Erreur lors de la récupération des biens.</p>";
    }
  });
}

// ================== SCROLL AUTOMATIQUE CHAT ==================
const chatBox = document.getElementById('chat-box');
if (chatBox) {
  const observer = new MutationObserver(() => {
    chatBox.scrollTop = chatBox.scrollHeight;
  });
  observer.observe(chatBox, { childList: true });
}
