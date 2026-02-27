document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");
  const overlay = document.getElementById("sidebarOverlay");

  openBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
    overlay.classList.add("active");
    openBtn.style.display = "none"; // cacher le bouton hamburger
  });

  closeBtn.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    openBtn.style.display = "flex"; // réafficher le bouton hamburger
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    openBtn.style.display = "flex"; // réafficher le bouton hamburger
  });
});

