// ============================================================
// AiGENT — Favicon Manager
// ------------------------------------------------------------
// Détection via <body data-favicon="...">
// Génération réelle des favicons carrés
// Conservation absolue des proportions
// Optimisation de visibilité pour OCCAS / EMPLOI
// ============================================================

(() => {
  "use strict";

  // ------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------

  const FAVICONS = {
    aigent: "./images/aigent.ico",
    immo: "./images/aigent-immo.ico",
    occas: "./images/aigent-occas.ico",
    emploi: "./images/aigent-emploi.ico",
    voyage: "./images/aigent-voyage.png",
  };

  // Tailles réellement générées
  const SIZES = [16, 32, 48, 120, 152, 180, 192, 512];

  // ------------------------------------------------------------
  // Marge générale
  //
  // Plus petit = logo plus gros.
  // ------------------------------------------------------------

  const PADDING = 0.025;

  // ------------------------------------------------------------
  // Réglages spécifiques par type
  // ------------------------------------------------------------

  const TYPE_SETTINGS = {
    aigent: {
      padding: PADDING,
      outline: false,
    },

    immo: {
      padding: 0.01,
      outline: true,
    },

    occas: {
      padding: 0.01,
      outline: true,
    },

    emploi: {
      padding: 0.01,
      outline: true,
    },

    voyage: {
      padding: 0,
      outline: false,
    },
  };

  // ------------------------------------------------------------
  // Détection du favicon à utiliser
  // ------------------------------------------------------------

  const getFaviconType = () => {
    const value = document.body?.dataset?.favicon;

    if (!value) {
      return "aigent";
    }

    const type = value.trim().toLowerCase();

    if (Object.prototype.hasOwnProperty.call(FAVICONS, type)) {
      return type;
    }

    return "aigent";
  };

  // ------------------------------------------------------------
  // Source du favicon
  // ------------------------------------------------------------

  const getFaviconSource = (type) => {
    const source = FAVICONS[type] || FAVICONS.aigent;

    // Évite les problèmes de cache du navigateur
    const separator = source.includes("?") ? "&" : "?";

    return `${source}${separator}v=20260905`;
  };

  // ------------------------------------------------------------
  // Suppression des anciens favicons
  // ------------------------------------------------------------

  const removeOldFavicons = () => {
    document
      .querySelectorAll(
        'link[rel="icon"], ' +
          'link[rel="shortcut icon"], ' +
          'link[rel="apple-touch-icon"], ' +
          'link[rel="apple-touch-icon-precomposed"]',
      )
      .forEach((element) => {
        element.remove();
      });
  };

  // ------------------------------------------------------------
  // Ajout d'un <link> favicon
  // ------------------------------------------------------------

  const addLink = (rel, href, attributes = {}) => {
    const link = document.createElement("link");

    link.rel = rel;
    link.href = href;

    Object.entries(attributes).forEach(([key, value]) => {
      link.setAttribute(key, value);
    });

    document.head.appendChild(link);

    return link;
  };

  // ------------------------------------------------------------
  // Chargement de l'image originale
  // ------------------------------------------------------------

  const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);

      image.onerror = () => {
        reject(new Error(`Impossible de charger le favicon : ${src}`));
      };

      image.src = src;
    });
  };

  // ------------------------------------------------------------
  // Détection de la zone réellement visible
  //
  // Les marges transparentes du fichier source sont supprimées.
  // ------------------------------------------------------------

  const getContentBounds = (image) => {
    const canvas = document.createElement("canvas");

    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      throw new Error("Canvas 2D non disponible.");
    }

    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    const data = imageData.data;

    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    const ALPHA_THRESHOLD = 1;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        const alpha = data[index + 3];

        if (alpha >= ALPHA_THRESHOLD) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Image complètement transparente
    if (maxX === -1) {
      return {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
      };
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  };

  // ------------------------------------------------------------
  // Création d'un favicon carré
  // ------------------------------------------------------------

  const createSquareFavicon = (image, size, bounds, type) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D non disponible.");
    }

    canvas.width = size;
    canvas.height = size;

    // ----------------------------------------------------------
    // Configuration du type
    // ----------------------------------------------------------

    const settings = TYPE_SETTINGS[type] || TYPE_SETTINGS.aigent;

    const padding = Math.round(size * settings.padding);

    const availableWidth = size - padding * 2;

    const availableHeight = size - padding * 2;

    // ----------------------------------------------------------
    // Conservation absolue du ratio
    // ----------------------------------------------------------

    const scale = Math.min(
      availableWidth / bounds.width,
      availableHeight / bounds.height,
    );

    const drawWidth = bounds.width * scale;
    const drawHeight = bounds.height * scale;

    const drawX = (size - drawWidth) / 2;
    const drawY = (size - drawHeight) / 2;

    // ----------------------------------------------------------
    // Nettoyage
    // ----------------------------------------------------------

    context.clearRect(0, 0, size, size);

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    // ----------------------------------------------------------
    // OCCAS / EMPLOI
    //
    // On conserve les couleurs originales.
    // On ajoute seulement un halo sombre pour améliorer
    // la lisibilité des couleurs fluorescentes.
    // ----------------------------------------------------------

    if (settings.outline) {
      context.save();

      context.shadowColor = "rgba(0, 0, 0, 0.95)";
      context.shadowBlur = Math.max(1, size * 0.035);

      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;

      context.drawImage(
        image,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );

      context.restore();

      // Remet le logo original par-dessus.
      context.drawImage(
        image,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );
    } else {
      // --------------------------------------------------------
      // Logos normaux
      // --------------------------------------------------------

      context.drawImage(
        image,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );
    }

    // ----------------------------------------------------------
    // Conversion en PNG base64
    // ----------------------------------------------------------

    return canvas.toDataURL("image/png");
  };

  // ------------------------------------------------------------
  // Génération de toutes les tailles
  // ------------------------------------------------------------

  const generateFavicons = async (source, type) => {
    const image = await loadImage(source);

    const bounds = getContentBounds(image);

    const generated = {};

    for (const size of SIZES) {
      generated[size] = createSquareFavicon(image, size, bounds, type);
    }

    return generated;
  };

  // ------------------------------------------------------------
  // Installation des favicons
  // ------------------------------------------------------------

  const installFavicons = (favicons) => {
    // ----------------------------------------------------------
    // Navigateurs
    // ----------------------------------------------------------

    addLink("icon", favicons[16], {
      type: "image/png",
      sizes: "16x16",
    });

    addLink("icon", favicons[32], {
      type: "image/png",
      sizes: "32x32",
    });

    addLink("icon", favicons[48], {
      type: "image/png",
      sizes: "48x48",
    });

    // ----------------------------------------------------------
    // Apple
    // ----------------------------------------------------------

    addLink("apple-touch-icon", favicons[120], {
      sizes: "120x120",
    });

    addLink("apple-touch-icon", favicons[152], {
      sizes: "152x152",
    });

    addLink("apple-touch-icon", favicons[180], {
      sizes: "180x180",
    });

    // ----------------------------------------------------------
    // Android / navigateurs modernes
    // ----------------------------------------------------------

    addLink("icon", favicons[192], {
      type: "image/png",
      sizes: "192x192",
    });

    addLink("icon", favicons[512], {
      type: "image/png",
      sizes: "512x512",
    });
  };

  // ------------------------------------------------------------
  // Initialisation
  // ------------------------------------------------------------

  const initFavicon = async () => {
    try {
      const type = getFaviconType();
      const source = getFaviconSource(type);

      console.log(`[AiGENT Favicon] Type détecté : ${type}`);

      console.log(`[AiGENT Favicon] Source : ${source}`);

      // Supprime les anciens favicons
      removeOldFavicons();

      // Génère les PNG
      const favicons = await generateFavicons(source, type);

      // Installe les nouvelles versions
      installFavicons(favicons);

      console.log(`[AiGENT Favicon] Favicon chargé : ${type}`);
    } catch (error) {
      console.error("[AiGENT Favicon] Erreur :", error);
    }
  };

  // ------------------------------------------------------------
  // Lancement
  // ------------------------------------------------------------

  if (document.body) {
    initFavicon();
  } else {
    document.addEventListener("DOMContentLoaded", initFavicon, { once: true });
  }
})();
