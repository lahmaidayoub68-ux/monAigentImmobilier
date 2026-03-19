document.addEventListener("DOMContentLoaded", () => {
  if (window.aigentAnimationStarted) return;
  window.aigentAnimationStarted = true;

  const TITLE_TEXT = "Mon AiGENT Immobilier";
  const TYPE_SPEED = 45;

  const titleElement = document.getElementById("animated-title");
  const chatSection = document.getElementById("chat-section");

  if (!titleElement || !chatSection) return;

  const isMobile = window.innerWidth <= 600;

  /* reset */
  titleElement.textContent = "";

  // ❗ cacher le chat seulement sur desktop
  if (!isMobile) {
    chatSection.style.opacity = 0;
  }

  /* curseur */
  const cursor = document.createElement("span");
  cursor.className = "typing-cursor";
  cursor.textContent = "|";

  let index = 0;

  function typeLetter() {
    if (index < TITLE_TEXT.length) {
      const span = document.createElement("span");
      span.textContent = TITLE_TEXT[index];
      span.className = "title-letter";

      titleElement.appendChild(span);

      index++;

      const delay = TYPE_SPEED + Math.random() * 25;
      setTimeout(typeLetter, delay);
    } else {
      cursor.remove();

      // ❗ réafficher seulement sur desktop
      if (!isMobile) {
        chatSection.style.transition = "opacity 0.8s ease";
        chatSection.style.opacity = 1;
      }

      window.dispatchEvent(new Event("aigent_animation_done"));
    }
  }

  titleElement.appendChild(cursor);
  setTimeout(typeLetter, 200);
});
