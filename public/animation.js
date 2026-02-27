document.addEventListener("DOMContentLoaded", () => {
  if (window.animationStarted) return; // Empêche de relancer l'animation
  window.animationStarted = true;

  const titleText = "Mon AiGENT Immobilier";
  const titleElement = document.getElementById("animated-title");
  const chatSection = document.getElementById("chat-section");

  if (!titleElement || !chatSection) return;

  // 1️⃣ Vide le texte original
  titleElement.textContent = "";

  // 2️⃣ Cache le chat au départ
  chatSection.style.opacity = 0;

  let i = 0;

  function typeLetter() {
    if (i < titleText.length) {
      const span = document.createElement("span");
      span.textContent = titleText[i];

      // Gradient + texte transparent
      span.style.background = "linear-gradient(90deg, #87cefa, #ffb6c1)";
      span.style.backgroundSize = "200% 200%";
      span.style.backgroundClip = "text";
      span.style.webkitBackgroundClip = "text";
      span.style.color = "transparent";

      // Animation d’apparition
      span.style.opacity = 0;
      span.style.transition = "opacity 0.15s";
      titleElement.appendChild(span);

      setTimeout(() => (span.style.opacity = 1), 20);

      i++;
      setTimeout(typeLetter, 50);
    } else {
      // 3️⃣ Affiche le chat après l’animation
      chatSection.style.transition = "opacity 1s";
      chatSection.style.opacity = 1;

      // Événement custom si besoin
      window.dispatchEvent(new Event("aigent_animation_done"));
    }
  }

  typeLetter();
});
