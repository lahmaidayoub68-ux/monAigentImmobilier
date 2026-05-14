/**
 * ╔═══════════════════════════════════════════════════════╗
 * ║  AIGENT — sidebar.js  (sans gestion thème)            ║
 * ║  Gère : mini-nav desktop · sidebar · mobile           ║
 * ╚═══════════════════════════════════════════════════════╝
 */

(function () {
  "use strict";

  // ── Éléments du DOM ──────────────────────────────────────
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const openDesktop = document.getElementById("openSidebar");
  const openMobile = document.getElementById("openSidebarMobile");
  const closeBtn = document.getElementById("closeSidebar");

  // ── Ouvrir ───────────────────────────────────────────────
  function openMenu() {
    sidebar?.classList.add("open");
    overlay?.classList.add("active");
    openMobile?.classList.add("open");

    document.body.style.overflow = "hidden";
  }

  // ── Fermer ───────────────────────────────────────────────
  function closeMenu() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("active");
    openMobile?.classList.remove("open");

    document.body.style.overflow = "";
  }

  // ── Listeners ────────────────────────────────────────────
  openDesktop?.addEventListener("click", openMenu);
  openMobile?.addEventListener("click", openMenu);
  closeBtn?.addEventListener("click", closeMenu);
  overlay?.addEventListener("click", closeMenu);

  // ── Fermeture clavier ────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar?.classList.contains("open")) {
      closeMenu();
    }
  });

  // ── Lien actif ───────────────────────────────────────────
  function markActiveLink() {
    const currentPage =
      window.location.pathname.split("/").pop() || "index.html";

    const allLinks = [
      ...document.querySelectorAll(".sidebar-nav-item"),
      ...document.querySelectorAll(".mini-nav-icon-btn"),
    ];

    allLinks.forEach((link) => {
      const href = (link.getAttribute("href") || "").split("/").pop();

      if (href && href === currentPage) {
        link.classList.add("active");
      }
    });
  }

  // ── Badge notifications ──────────────────────────────────
  window.SidebarBadge = {
    set(key, count) {
      const badge = document.getElementById(`sb-${key}-badge`);
      if (!badge) return;

      badge.textContent = count > 99 ? "99+" : String(count);
      badge.style.display = count > 0 ? "inline-block" : "none";
    },

    clear(key) {
      this.set(key, 0);
    },
  };

  // ── Init ─────────────────────────────────────────────────
  function init() {
    markActiveLink();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// ── Header height CSS var ─────────────────────────────────
function setHeaderHeight() {
  const header = document.querySelector(".top-banner");

  if (!header) return;

  const height = header.offsetHeight;

  document.documentElement.style.setProperty("--sb-header-h", `${height}px`);
}

window.addEventListener("load", setHeaderHeight);
window.addEventListener("resize", setHeaderHeight);
