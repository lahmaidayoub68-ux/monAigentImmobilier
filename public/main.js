import "./auth.js";
import "./animation.js";
import { initChatbot } from "./chatbot.js";

// Initialisation unique
window.addEventListener("DOMContentLoaded", () => {
  console.log("[main] Initialisation complète");

  const chatForm = document.getElementById("chat-form");
  if (chatForm) {
    initChatbot();
  }
});



