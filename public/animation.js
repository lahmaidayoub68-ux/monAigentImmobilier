document.addEventListener("DOMContentLoaded", () => {
  if (window.aigentAnimationStarted) return;
  window.aigentAnimationStarted = true;

  const TITLE_TEXT = "Mon AiGENT Immobilier";
  const TYPE_SPEED = 45;

  const titleElement = document.getElementById("animated-title");
  const chatSection = document.getElementById("chat-section");

  if (!titleElement) return;

  const isMobile = window.innerWidth <= 600;

  /* =========================
     🛡️ FALLBACK GLOBAL (ANTI BUG)
  ========================= */
  function forceVisibleTitle() {
    titleElement.textContent = TITLE_TEXT;
  }

  /* =========================
     📱 MOBILE = PAS D’ANIMATION
  ========================= */
  if (isMobile) {
    forceVisibleTitle();
    if (chatSection) chatSection.style.opacity = 1;
    return;
  }

  /* =========================
     💻 DESKTOP ANIMATION
  ========================= */

  // reset safe
  titleElement.textContent = "";
  if (chatSection) chatSection.style.opacity = 0;

  // curseur
  const cursor = document.createElement("span");
  cursor.className = "typing-cursor";
  cursor.textContent = "|";
  titleElement.appendChild(cursor);

  let index = 0;
  let animationFailed = false;

  function typeLetter() {
    try {
      if (index < TITLE_TEXT.length) {
        const span = document.createElement("span");

        // 🔹 gérer correctement les espaces
        span.textContent =
          TITLE_TEXT[index] === " " ? "\u00A0" : TITLE_TEXT[index];
        span.className = "title-letter";

        titleElement.appendChild(span);
        index++;

        const delay = TYPE_SPEED + Math.random() * 25;
        setTimeout(typeLetter, delay);
      } else {
        cursor.remove();

        if (chatSection) {
          chatSection.style.transition = "opacity 0.8s ease";
          chatSection.style.opacity = 1;
        }

        window.dispatchEvent(new Event("aigent_animation_done"));
      }
    } catch (e) {
      animationFailed = true;
      forceVisibleTitle();
    }
  }

  // lancer l’animation
  setTimeout(typeLetter, 200);

  /* =========================
     ⏱️ FALLBACK SI RIEN S’AFFICHE
  ========================= */
  setTimeout(() => {
    if (titleElement.textContent.trim() === "" || animationFailed) {
      forceVisibleTitle();
      if (chatSection) chatSection.style.opacity = 1;
    }
  }, 1500); // sécurité
});
