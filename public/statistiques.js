document.addEventListener("DOMContentLoaded", () => {
  // MENU LATÉRAL
  const sidebar = document.getElementById("sidebar");
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");
  const overlay = document.getElementById("sidebarOverlay");

  if (openBtn && sidebar && overlay) {
    openBtn.addEventListener("click", () => {
      sidebar.classList.add("open");
      overlay.classList.add("active");
      openBtn.style.display = "none";
    });
  }

  if (closeBtn && sidebar && overlay) {
    closeBtn.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
      openBtn.style.display = "flex";
    });
  }

  if (overlay && sidebar) {
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
      openBtn.style.display = "flex";
    });
  }

  // CHARGEMENT DES STATISTIQUES
  async function loadStats() {
    try {
      const raw = localStorage.getItem("agent_user");
      if (!raw) throw new Error("Token manquant dans le localStorage");

      let token;
      try {
        const user = JSON.parse(raw);
        token = user.token;
        if (!token) throw new Error("Token JWT manquant dans localStorage");
      } catch (parseErr) {
        throw new Error("Erreur parsing token: " + parseErr.message);
      }

      const res = await fetch("/api/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
      const data = await res.json();

      // 🔹 Mettre à jour le DOM
      document.getElementById("totalMatches").textContent =
        data.totalMatches ?? 0;
      document.getElementById("totalFavoris").textContent =
        data.totalFavoris ?? 0;
      document.getElementById("averageCompat").textContent =
        (data.averageCompatibility ?? 0) + "%";
      document.getElementById("activeConversations").textContent =
        data.activeConversations ?? 0;

      console.log("Statistiques chargées:", data);
    } catch (error) {
      console.error("Erreur chargement stats :", error);

      // Valeurs par défaut en cas d'erreur
      document.getElementById("totalMatches").textContent = 0;
      document.getElementById("totalFavoris").textContent = 0;
      document.getElementById("averageCompat").textContent = "0%";
      document.getElementById("activeConversations").textContent = 0;
    }
  }

  loadStats();
});
