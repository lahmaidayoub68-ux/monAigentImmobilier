document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const openBtn = document.getElementById("openSidebar"); // desktop
  const mobileBurger = document.getElementById("openSidebarMobile"); // mobile
  const closeBtn = document.getElementById("closeSidebar");
  const overlay = document.getElementById("sidebarOverlay");

  function openMenu() {
    sidebar.classList.add("open");
    overlay.classList.add("active");
    mobileBurger?.classList.add("open");
  }

  function closeMenu() {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    mobileBurger?.classList.remove("open");
  }

  // Desktop
  openBtn?.addEventListener("click", openMenu);

  // Mobile
  mobileBurger?.addEventListener("click", openMenu);

  // Fermeture
  closeBtn?.addEventListener("click", closeMenu);
  overlay?.addEventListener("click", closeMenu);
});
