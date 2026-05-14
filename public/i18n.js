// public/i18n.js  — chargé sur TOUTES les pages via <script src="/i18n.js">
(function () {
  const TRANSLATIONS = {
    fr: {},
    en: {
      // Navigation
      "Profil & Compte": "Profile & Account",
      Messagerie: "Messaging",
      "Profils favoris": "Saved profiles",
      Statistiques: "Statistics",
      Marché: "Market",
      "Deal Radar": "Deal Radar",
      Notifications: "Notifications",
      // Header
      "Mon AiGENT Immobilier": "My AiGENT Real Estate",
      Déconnexion: "Log out",
      // Chat
      "Je veux acheter une maison": "I want to buy a house",
      "Estimer mon bien pour vendre": "Estimate my property to sell",
      "Recherche sur Paris avec 3 pièces": "Search in Paris with 3 rooms",
      "Analyse du marché actuel": "Current market analysis",
      "Décris ton projet immobilier...": "Describe your real estate project...",
      // Sidebar
      Menu: "Menu",
      // Panel IA
      "Cerveau IA": "AI Brain",
      "Analyse cognitive en temps réel": "Real-time cognitive analysis",
      "Critères actifs": "Active criteria",
      "En attente": "Waiting",
      "Statut de la recherche": "Search status",
      "Analyse du marché": "Market analysis",
      "En attente de données du marché...": "Waiting for market data...",
      "Être mis en relation": "Get connected",
      "Analyser le marché": "Analyse market",
      "Modifier mes critères": "Edit my criteria",
      "Initialisation...": "Initializing...",
      // Profil page
      Paramètres: "Settings",
      Identité: "Identity",
      Sécurité: "Security",
      Préférences: "Preferences",
      Activité: "Activity",
      Support: "Support",
      "Zone critique": "Danger zone",
      "Informations personnelles": "Personal information",
      "Vos informations de compte": "Your account information",
      "Mot de passe": "Password",
      Enregistrer: "Save",
      "Déconnecter toutes les sessions": "Sign out all sessions",
      "Exporter mes données": "Export my data",
      "Préférences d'alerte": "Alert preferences",
      "Nouveaux matchs": "New matches",
      "Messages reçus": "Messages received",
      "Newsletter marché": "Market newsletter",
      "Thème sombre": "Dark theme",
      "Animations réduites": "Reduced motion",
      "Résultats compacts": "Compact results",
      "Mon Activité": "My Activity",
      "Centre d'assistance": "Help centre",
      // Footer
      "© Mon AiGENT Immobilier - Tous droits réservés":
        "© My AiGENT Real Estate - All rights reserved",
    },
    es: {
      "Profil & Compte": "Perfil y cuenta",
      Messagerie: "Mensajería",
      "Profils favoris": "Perfiles favoritos",
      Statistiques: "Estadísticas",
      Marché: "Mercado",
      Notifications: "Notificaciones",
      "Mon AiGENT Immobilier": "Mi AiGENT Inmobiliaria",
      Déconnexion: "Cerrar sesión",
      Paramètres: "Configuración",
      Enregistrer: "Guardar",
      "Thème sombre": "Tema oscuro",
      Préférences: "Preferencias",
      "Zone critique": "Zona crítica",
    },
  };

  function applyI18n(lang) {
    const dict = TRANSLATIONS[lang];
    if (!dict || !Object.keys(dict).length) return;
    document.documentElement.lang = lang;

    // 1. Texte des nœuds texte simples
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      const trimmed = node.textContent.trim();
      if (dict[trimmed])
        node.textContent = node.textContent.replace(trimmed, dict[trimmed]);
    });

    // 2. Placeholders
    document.querySelectorAll("[placeholder]").forEach((el) => {
      if (dict[el.placeholder]) el.placeholder = dict[el.placeholder];
    });

    // 3. data-i18n explicites
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (dict[key]) el.textContent = dict[key];
    });
  }

  function loadAndApply() {
    const stored = localStorage.getItem("aigent_langue");
    if (stored && stored !== "fr") applyI18n(stored);
  }

  // Appliquer après DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndApply);
  } else {
    loadAndApply();
  }

  // Exposer pour mise à jour dynamique depuis profil.js
  window.AigentI18n = { apply: applyI18n };
})();
