document.addEventListener("DOMContentLoaded", () => {
  if (window.aigentAnimationStarted) return;
  window.aigentAnimationStarted = true;

  const TITLE_TEXT = "Mon AiGENT Immobilier";
  const TYPE_SPEED = 45;

  const titleElement = document.getElementById("animated-title");
  const chatSection = document.getElementById("chat-section");

  if (!titleElement || !chatSection) return;

  /* reset */
  titleElement.textContent = "";
  chatSection.style.opacity = 0;

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

      /* petite variation naturelle */
      const delay = TYPE_SPEED + Math.random() * 25;
      setTimeout(typeLetter, delay);
    } else {
      /* animation finie */
      cursor.remove();

      chatSection.style.transition = "opacity 0.8s ease";
      chatSection.style.opacity = 1;

      window.dispatchEvent(new Event("aigent_animation_done"));
    }
  }

  /* ajoute curseur */
  titleElement.appendChild(cursor);

  /* démarre animation */
  setTimeout(typeLetter, 200);
});
