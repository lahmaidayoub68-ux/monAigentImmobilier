/**
 * statistiques.js - Hub Analytique AiGENT
 */

document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("agent_user"));
  if (!user) return (window.location.href = "index.html");

  initTheme();
  initSidebar();
  await loadStats(user.token);

  // Logout
  document
    .getElementById("btn-logout-header")
    ?.addEventListener("click", () => {
      localStorage.clear();
      window.location.href = "index.html";
    });
});

function initTheme() {
  const btn = document.getElementById("btn-theme");
  const html = document.documentElement;
  const update = (t) => {
    html.setAttribute("data-theme", t);
  };

  btn.addEventListener("click", () => {
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    update(next);
    localStorage.setItem("aigent_theme", next);
  });
  update(localStorage.getItem("aigent_theme") || "dark");
}

async function loadStats(token) {
  try {
    const res = await fetch("/api/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("API Indisponible");
    const data = await res.json();

    // Mise à jour visuelle des compteurs
    animateValue("totalMatches", data.totalMatches || 0);
    animateValue("totalFavoris", data.totalFavoris || 0);
    animateValue("averageCompat", data.averageCompatibility || 0, "%");
    animateValue("activeConversations", data.activeConversations || 0);
  } catch (error) {
    console.error("Erreur stats:", error);
    // Valeurs fallback
    document
      .querySelectorAll(".stat-val")
      .forEach((el) => (el.textContent = "0"));
  }
}

// Fonction pour animer les chiffres (effet premium)
function animateValue(id, value, suffix = "") {
  const el = document.getElementById(id);
  if (!el) return;
  let start = 0;
  const duration = 1000;
  const increment = value / (duration / 16);

  const updateCount = () => {
    start += increment;
    if (start < value) {
      el.textContent = Math.floor(start) + suffix;
      requestAnimationFrame(updateCount);
    } else {
      el.textContent = value + suffix;
    }
  };
  updateCount();
}

function initSidebar() {
  const side = document.getElementById("sidebar");
  const open = document.getElementById("openSidebar");
  const close = document.getElementById("closeSidebar");
  const over = document.getElementById("sidebarOverlay");

  const toggle = (isOpen) => {
    side.classList.toggle("open", isOpen);
    over.classList.toggle("active", isOpen);
    if (open) open.style.opacity = isOpen ? "0" : "1";
  };

  open?.addEventListener("click", () => toggle(true));
  close?.addEventListener("click", () => toggle(false));
  over?.addEventListener("click", () => toggle(false));
}
