/* guide.js — AiGENT Onboarding · Premium 2026 · violet edition */
(function () {
  "use strict";

  const SEEN_KEY = "aigent_guide_seen";
  const NEW_USER_KEY = "aigent_new_user";

  if (localStorage.getItem(SEEN_KEY) === "1") return;
  if (localStorage.getItem(NEW_USER_KEY) !== "1") return;

  /* Injecter guide.css */
  (function () {
    if (document.getElementById("ob-css")) return;
    const l = document.createElement("link");
    l.id = "ob-css";
    l.rel = "stylesheet";
    l.href = "/guide.css";
    document.head.appendChild(l);
  })();

  /* ══════════════════════════════════════════════════════════
     CONFIG DES SLIDES
  ══════════════════════════════════════════════════════════ */
  const SLIDES = [
    {
      label: "Bienvenue",
      step: "01 / 06",
      title: "Votre <em>assistant</em> immobilier intelligent.",
      desc: "AiGENT analyse votre projet en langage naturel et vous connecte directement aux profils les plus compatibles — sans frais d'agence, en temps réel.",
      visual: "welcome",
      features: [
        {
          icon: "chat",
          title: "Dialogue naturel",
          text: "Décrivez librement votre projet, l'IA comprend et qualifie automatiquement.",
        },
        {
          icon: "zap",
          title: "Matching multidimensionnel",
          text: "Scoring sur 5 critères pondérés — ville, budget, surface, pièces, DPE.",
        },
        {
          icon: "clock",
          title: "Résultats en secondes",
          text: "Aucun formulaire, aucun filtre manuel — juste votre demande, en clair.",
        },
      ],
    },
    {
      label: "Chat IA",
      step: "02 / 06",
      title: "Formulez. L'IA <em>interprète</em> et qualifie.",
      desc: "Notre moteur NLP extrait vos critères clés — ville, budget, surface, pièces, DPE — et pose des questions complémentaires si nécessaire.",
      visual: "chat",
      features: [
        {
          icon: "text",
          title: "Aucun filtre manuel",
          text: "Langage naturel uniquement : pas de formulaire, pas d'étapes rébarbatives.",
        },
        {
          icon: "brain",
          title: "Mémoire contextuelle",
          text: "Le panneau Cerveau IA mémorise et affine vos critères à chaque échange.",
        },
        {
          icon: "map",
          title: "Carte interactive",
          text: "Chaque profil géolocalisé et filtrable sur une vue cartographique dynamique.",
        },
      ],
    },
    {
      label: "Matching",
      step: "03 / 06",
      title: "Des <em>scores</em> de compatibilité, pas des annonces.",
      desc: "Chaque profil est scoré sur cinq dimensions clés. Le pourcentage reflète la précision du croisement entre votre recherche et le marché réel.",
      visual: "match",
      features: [
        {
          icon: "heart",
          title: "Favoris & suivi",
          text: "Sauvegardez les profils pertinents, comparez-les côte à côte en un clic.",
        },
        {
          icon: "message",
          title: "Messagerie intégrée",
          text: "Contactez directement les vendeurs via la messagerie sécurisée AiGENT.",
        },
        {
          icon: "cpu",
          title: "Négociation assistée",
          text: "Simulez une négociation IA avant tout premier contact — soyez prêt.",
        },
      ],
    },
    {
      label: "Deal Radar",
      step: "04 / 06",
      title: "Détection <em>proactive</em> des opportunités.",
      desc: "Le Deal Radar surveille le marché en continu. Dès qu'un profil hautement compatible apparaît, une alerte prioritaire est émise avec une fenêtre d'action estimée.",
      visual: "radar",
      features: [
        {
          icon: "alert",
          title: "Score d'urgence",
          text: "Calculé sur la concurrence acheteurs active, mis à jour en temps réel.",
        },
        {
          icon: "bell",
          title: "Alertes configurables",
          text: "Notifications selon vos seuils de compatibilité personnalisés.",
        },
        {
          icon: "timer",
          title: "Fenêtre d'action",
          text: "Durée d'opportunité estimée en heures selon la tension du marché.",
        },
      ],
    },
    {
      label: "Marché",
      step: "05 / 06",
      title: "L'intelligence du <em>marché</em>, accessible.",
      desc: "Accédez aux tendances de prix au m², à la distribution des compatibilités par zone et à vos statistiques personnelles — issus directement des profils actifs.",
      visual: "market",
      features: [
        {
          icon: "trending",
          title: "Prix médian au m²",
          text: "Par ville, actualisé en continu depuis les profils vendeurs actifs sur la plateforme.",
        },
        {
          icon: "layers",
          title: "Heatmap d'activité",
          text: "Visualisez les zones les plus dynamiques du marché en un regard.",
        },
        {
          icon: "bar-chart",
          title: "Vos KPIs personnels",
          text: "Compatibilité moyenne, nombre de matchs, favoris — votre tableau de bord.",
        },
      ],
    },
    {
      label: "Confidentialité",
      step: "06 / 06",
      title: "Vos données vous appartiennent.",
      desc: "AiGENT est conçu selon les principes du Privacy by Design, conformément au RGPD — UE 2016/679.",
      visual: "privacy",
      privacy: true,
      features: [],
    },
  ];

  const TOTAL = SLIDES.length;
  let current = 0;
  let direction = 1;
  let rafMap = {};
  let timers = [];

  /* ══════════════════════════════════════════════════════════
     ICÔNES SVG inline
  ══════════════════════════════════════════════════════════ */
  const ICONS = {
    chat: `<polyline points="21 15 21 21 15 21"/><path d="M21 21L15 15m6 0A9 9 0 1 1 3 12a9 9 0 0 1 18 0z"/>`,
    zap: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
    clock: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
    text: `<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>`,
    brain: `<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2z"/>`,
    map: `<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>`,
    heart: `<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>`,
    message: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
    cpu: `<rect x="9" y="9" width="6" height="6"/><rect x="2" y="2" width="20" height="20" rx="2" ry="2"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="14" x2="22" y2="14"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="14" x2="4" y2="14"/>`,
    alert: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
    bell: `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`,
    timer: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
    trending: `<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>`,
    layers: `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`,
    "bar-chart": `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>`,
  };

  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  }

  /* ══════════════════════════════════════════════════════════
     CONSTRUCTION DU MODAL
  ══════════════════════════════════════════════════════════ */
  function buildModal() {
    const overlay = document.createElement("div");
    overlay.id = "obOverlay";
    overlay.className = "ob-hidden";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Guide de démarrage AiGENT");

    overlay.innerHTML = `
      <div id="obModal">
        <header class="ob-header">
          <div class="ob-brand">
            <div class="ob-brand-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div class="ob-brand-block">
              <span class="ob-brand-name">AiGENT Immobilier</span>
              <span class="ob-brand-tag">Guide de démarrage</span>
            </div>
          </div>
          <div class="ob-header-right">
            <span class="ob-step-label" id="obCounter">1 / ${TOTAL}</span>
            <button class="ob-skip-btn" id="obSkip">Passer le guide</button>
          </div>
        </header>

        <div class="ob-progress-track">
          <div class="ob-progress-fill" id="obTrack" style="width:${(100 / TOTAL).toFixed(1)}%"></div>
        </div>

        <div class="ob-body" id="obBody"></div>

        <footer class="ob-footer">
          <button class="ob-btn ob-btn-prev" id="obPrev" style="visibility:hidden">
            ${icon("chevron-left") || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`}
            Précédent
          </button>
          <div class="ob-dots-wrap" id="obDots"></div>
          <button class="ob-btn ob-btn-next" id="obNext">
            Suivant
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </footer>
      </div>`;

    document.body.appendChild(overlay);

    const dotsEl = overlay.querySelector("#obDots");
    for (let i = 0; i < TOTAL; i++) {
      const d = document.createElement("div");
      d.className = "ob-dot";
      d.setAttribute("role", "button");
      d.setAttribute("tabindex", "0");
      d.setAttribute("aria-label", `Étape ${i + 1}`);
      d.addEventListener("click", () => goTo(i));
      dotsEl.appendChild(d);
    }
    return overlay;
  }

  /* ══════════════════════════════════════════════════════════
     RENDU DES SLIDES
  ══════════════════════════════════════════════════════════ */
  function renderSlide(idx) {
    stopAll();
    const slide = SLIDES[idx];
    const body = document.getElementById("obBody");

    const old = body.querySelector(".ob-slide-active");
    if (old) {
      old.classList.remove("ob-slide-active");
      old.classList.add("ob-slide-exit-left");
      setTimeout(() => old.remove(), 420);
    }

    const el = document.createElement("div");
    el.className = "ob-slide" + (direction < 0 ? " ob-slide-from-left" : "");
    el.innerHTML = slide.privacy ? buildPrivacyHTML() : buildSlideHTML(slide);
    body.appendChild(el);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add("ob-slide-active");
        if (!slide.privacy) {
          const canvas = el.querySelector("canvas");
          if (canvas) {
            const t = setTimeout(() => startVisual(slide.visual, canvas), 60);
            timers.push(t);
          }
        }
      });
    });

    updateChrome(idx);
  }

  /* ── HTML des slides standards ──────────────────────────── */
  function buildSlideHTML(slide) {
    const feats = slide.features
      .map(
        (f) => `
      <div class="ob-feat">
        <div class="ob-feat-icon">${icon(f.icon)}</div>
        <div class="ob-feat-body">
          <div class="ob-feat-title">${f.title}</div>
          <div class="ob-feat-text">${f.text}</div>
        </div>
      </div>`,
      )
      .join("");

    return `
      <div class="ob-slide-text">
        <div class="ob-slide-label">
          <span class="ob-label-dot"></span>
          ${slide.label}
        </div>
        <div class="ob-slide-step">${slide.step}</div>
        <h2 class="ob-slide-title">${slide.title}</h2>
        <p class="ob-slide-desc">${slide.desc}</p>
        ${slide.features.length ? `<div class="ob-features">${feats}</div>` : ""}
      </div>
      <div class="ob-slide-visual">
        <div class="ob-canvas-wrap">
          <canvas id="obCanvas_${slide.visual}" width="480" height="500"></canvas>
        </div>
      </div>`;
  }

  /* ── HTML slide confidentialité ────────────────────────── */
  function buildPrivacyHTML() {
    const blocks = [
      {
        icon: "lock",
        title: "Chiffrement bout en bout",
        text: "TLS 1.3 sur toutes les communications. Authentification hachée bcrypt. Aucune donnée sensible en clair.",
      },
      {
        icon: "user-check",
        title: "Droits RGPD garantis",
        text: "Accès, rectification, portabilité et suppression depuis Paramètres. Export JSON disponible (Art. 20 RGPD).",
      },
      {
        icon: "shield",
        title: "Aucune cession de données",
        text: "AiGENT ne vend ni ne transmet vos données à des tiers. Mises en relation entre utilisateurs consentants uniquement.",
      },
      {
        icon: "eye-off",
        title: "Cookies & traceurs",
        text: "Un seul cookie de session JWT. Zéro cookie publicitaire, zéro fingerprinting, zéro tracking tiers.",
      },
      {
        icon: "calendar",
        title: "Durée de conservation",
        text: "Données conservées pendant la durée d'activité du compte. Effacement irréversible sous 72h après suppression.",
      },
      {
        icon: "globe",
        title: "Hébergement souverain",
        text: "Infrastructures conformes RGPD. Aucun transfert hors EEE sans garanties contractuelles.",
      },
    ];

    const blockIcons = {
      lock: `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
      "user-check": `<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>`,
      shield: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>`,
      "eye-off": `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`,
      calendar: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
      globe: `<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`,
    };

    const bHTML = blocks
      .map(
        (b) => `
      <div class="ob-privacy-block">
        <div class="ob-privacy-block-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${blockIcons[b.icon]}</svg>
        </div>
        <div class="ob-privacy-block-title">${b.title}</div>
        <p class="ob-privacy-block-text">${b.text}</p>
      </div>`,
      )
      .join("");

    return `
      <div class="ob-slide-privacy">
        <div class="ob-privacy-left">
          <div class="ob-privacy-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </div>
          <div class="ob-slide-label"><span class="ob-label-dot"></span>Confidentialité · 06 / 06</div>
          <h2 class="ob-privacy-title">Vos données vous appartiennent.</h2>
          <p class="ob-privacy-desc">AiGENT est conçu selon les principes du Privacy by Design et du Privacy by Default, conformément au Règlement Général sur la Protection des Données (RGPD — UE 2016/679).</p>
          <div class="ob-gdpr-pill"><span class="ob-gdpr-dot"></span>Conforme RGPD · EU 2016/679</div>
        </div>
        <div class="ob-privacy-right">${bHTML}</div>
      </div>`;
  }

  /* ── Mise à jour du chrome ──────────────────────────────── */
  function updateChrome(idx) {
    document.getElementById("obCounter").textContent = `${idx + 1} / ${TOTAL}`;
    document.getElementById("obTrack").style.width =
      `${(((idx + 1) / TOTAL) * 100).toFixed(1)}%`;

    document.querySelectorAll(".ob-dot").forEach((d, i) => {
      d.className = "ob-dot";
      if (i === idx) d.classList.add("ob-dot-active");
      else if (i < idx) d.classList.add("ob-dot-done");
    });

    const prev = document.getElementById("obPrev");
    prev.style.visibility = idx === 0 ? "hidden" : "visible";

    const next = document.getElementById("obNext");
    const isLast = idx === TOTAL - 1;
    next.className = "ob-btn " + (isLast ? "ob-btn-finish" : "ob-btn-next");
    next.innerHTML = isLast
      ? `Commencer <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
      : `Suivant <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  }

  /* ── Navigation ─────────────────────────────────────────── */
  function goTo(idx) {
    if (idx === current) return;
    direction = idx > current ? 1 : -1;
    current = Math.max(0, Math.min(TOTAL - 1, idx));
    renderSlide(current);
  }
  function nextStep() {
    current < TOTAL - 1 ? goTo(current + 1) : closeGuide();
  }
  function prevStep() {
    if (current > 0) goTo(current - 1);
  }
  function closeGuide() {
    stopAll();
    localStorage.setItem(SEEN_KEY, "1");
    localStorage.removeItem(NEW_USER_KEY);
    const ov = document.getElementById("obOverlay");
    if (!ov) return;
    ov.style.transition = "opacity 0.35s ease";
    ov.style.opacity = "0";
    setTimeout(() => ov.remove(), 360);
  }

  function stopAll() {
    Object.values(rafMap).forEach((id) => cancelAnimationFrame(id));
    timers.forEach((id) => clearTimeout(id));
    rafMap = {};
    timers = [];
  }

  /* ══════════════════════════════════════════════════════════
     CANVAS VISUALS — violet palette, clean & stable
  ══════════════════════════════════════════════════════════ */
  function startVisual(type, canvas) {
    const wrap = canvas.parentElement;
    const W = wrap.clientWidth || 480;
    const H = wrap.clientHeight || 500;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const map = { welcome, chat, match, radar, market };
    if (map[type]) map[type](ctx, W, H, type);
  }

  /* Utilitaire roundRect */
  function rr(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ── 1. WELCOME : tableau de bord animé ─────────────────── */
  function welcome(ctx, W, H, key) {
    const V = "#7c3aed",
      VS = "rgba(124,58,237,",
      TX = "#0d0a1e",
      MT = "#8b82a8",
      BG = "#f6f5f9",
      WH = "#ffffff";
    const cards = [
      {
        x: 0.06,
        y: 0.08,
        w: 0.41,
        h: 0.22,
        label: "Prix médian",
        val: "4 850 €/m²",
        accent: true,
      },
      {
        x: 0.53,
        y: 0.08,
        w: 0.41,
        h: 0.22,
        label: "Matchs actifs",
        val: "147",
        accent: false,
      },
      {
        x: 0.06,
        y: 0.36,
        w: 0.88,
        h: 0.2,
        label: "Compatibilité moyenne",
        val: "84 %",
        wide: true,
        accent: false,
      },
      {
        x: 0.06,
        y: 0.62,
        w: 0.41,
        h: 0.22,
        label: "Favoris enregistrés",
        val: "12",
        accent: false,
      },
      {
        x: 0.53,
        y: 0.62,
        w: 0.41,
        h: 0.22,
        label: "Villes couvertes",
        val: "23",
        accent: false,
      },
    ];
    let t = 0,
      p = 0;
    function frame() {
      ctx.clearRect(0, 0, W, H);
      t += 0.015;
      p = Math.min(1, p + 0.016);
      cards.forEach((c, i) => {
        const d = i * 0.13;
        const a = Math.max(0, Math.min(1, (p - d) * 5));
        if (a <= 0) return;
        const x = W * c.x,
          y = H * c.y + (1 - a) * 16,
          w = W * c.w,
          h = H * c.h;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = c.accent ? V : WH;
        ctx.strokeStyle = c.accent ? "transparent" : "rgba(13,10,30,0.07)";
        ctx.lineWidth = 1;
        rr(ctx, x, y, w, h, 12);
        ctx.fill();
        if (!c.accent) ctx.stroke();
        ctx.font = `400 11px "Sora", system-ui`;
        ctx.fillStyle = c.accent ? "rgba(255,255,255,0.65)" : MT;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(c.label, x + 16, y + 14, w - 28);
        ctx.font = `700 ${c.wide ? 26 : 22}px "Sora", system-ui`;
        ctx.fillStyle = c.accent ? WH : TX;
        ctx.textBaseline = "bottom";
        ctx.fillText(c.val, x + 16, y + h - 14);
        if (!c.accent && p > 0.5) {
          const bar_w = 48,
            bar_h = 3,
            bx = x + w - bar_w - 14,
            by = y + h - 20;
          ctx.fillStyle = VS + "0.12)";
          rr(ctx, bx, by, bar_w, bar_h, 2);
          ctx.fill();
          ctx.fillStyle = VS + "0.6)";
          rr(ctx, bx, by, bar_w * (0.5 + Math.sin(t + i) * 0.15), bar_h, 2);
          ctx.fill();
        }
        ctx.restore();
      });
      if (p >= 1) {
        ctx.save();
        ctx.globalAlpha = 0.03 + Math.sin(t * 2) * 0.02;
        ctx.fillStyle = V;
        rr(ctx, W * 0.06 - 3, H * 0.08 - 3, W * 0.41 + 6, H * 0.22 + 6, 14);
        ctx.fill();
        ctx.restore();
      }
      rafMap[key] = requestAnimationFrame(frame);
    }
    frame();
  }

  /* ── 2. CHAT : bulles typewriter ────────────────────────── */
  function chat(ctx, W, H, key) {
    const V = "#7c3aed",
      WH = "#ffffff",
      TX = "#3b3553",
      BG = "#f6f5f9";
    const msgs = [
      { from: "user", text: "Je cherche un T3 à Lyon, budget 280 000 €" },
      { from: "bot", text: "Critères détectés · Lyon · T3 · 280k €" },
      { from: "bot", text: "4 profils compatibles — compat. moy. 84 %" },
      { from: "user", text: "Montre-moi les résultats" },
      { from: "bot", text: "Voici vos 4 profils correspondants ✓" },
    ];
    const LINE = 58,
      PAD = 24;
    let bubbles = [],
      mi = 0,
      ci = 0;

    function drawTop() {
      ctx.fillStyle = BG;
      ctx.strokeStyle = "rgba(13,10,30,0.07)";
      ctx.lineWidth = 1;
      rr(ctx, PAD, PAD, W - PAD * 2, 46, 12);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(PAD + 20, PAD + 23, 9, 0, Math.PI * 2);
      ctx.fillStyle = V;
      ctx.fill();
      ctx.font = `600 12px "Sora", system-ui`;
      ctx.fillStyle = "#0d0a1e";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("AiGENT Immobilier", PAD + 36, PAD + 23);
      ctx.beginPath();
      ctx.arc(W - PAD - 14, PAD + 23, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#059669";
      ctx.fill();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawTop();
      const sy = PAD + 62,
        visH = H - sy - PAD;
      let rendered = [],
        tot = 0;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        tot += LINE;
        if (tot > visH + LINE) break;
        rendered.unshift(bubbles[i]);
      }
      rendered.forEach((b, i) => {
        const isU = b.from === "user";
        const y = sy + i * LINE;
        ctx.font = `500 12px "Sora", system-ui`;
        const tw = ctx.measureText(b.text).width;
        const bW = Math.min(tw + 26, W * 0.7),
          bH = 36;
        if (isU) {
          const x = W - PAD - bW;
          ctx.fillStyle = V;
          rr(ctx, x, y, bW, bH, 10);
          ctx.fill();
          ctx.fillStyle = WH;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(b.text, x + 13, y + bH / 2, bW - 22);
        } else {
          const x = PAD;
          ctx.fillStyle = WH;
          ctx.strokeStyle = "rgba(13,10,30,0.08)";
          ctx.lineWidth = 1;
          rr(ctx, x, y, bW, bH, 10);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = TX;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(b.text, x + 13, y + bH / 2, bW - 22);
        }
      });
    }

    let timer;
    function type() {
      if (mi >= msgs.length) {
        mi = 0;
        ci = 0;
        bubbles = [];
        timer = setTimeout(type, 1800);
        return;
      }
      if (ci === 0) bubbles.push({ from: msgs[mi].from, text: "" });
      bubbles[bubbles.length - 1].text = msgs[mi].text.slice(0, ci + 1);
      draw();
      ci++;
      if (ci >= msgs[mi].text.length) {
        mi++;
        ci = 0;
        timer = setTimeout(type, mi >= msgs.length ? 1800 : 550);
      } else {
        timer = setTimeout(type, 22);
      }
    }
    type();
    rafMap[key] = null;
    const origStop = stopAll;
    timers.push({ _clear: () => clearTimeout(timer) });
  }

  /* ── 3. MATCH : cartes de propriétés avec score ─────────── */
  function match(ctx, W, H, key) {
    const V = "#7c3aed",
      VS = "rgba(124,58,237,",
      WH = "#ffffff",
      TX = "#0d0a1e",
      MT = "#8b82a8",
      BG = "#f6f5f9";
    const cards = [
      {
        compat: 94,
        city: "Lyon 6e",
        price: "268 000 €",
        surf: "72 m²",
        dpe: "B",
        dpeC: "#059669",
      },
      {
        compat: 87,
        city: "Lyon 3e",
        price: "251 000 €",
        surf: "68 m²",
        dpe: "C",
        dpeC: "#16a34a",
      },
      {
        compat: 79,
        city: "Villeurbanne",
        price: "235 000 €",
        surf: "65 m²",
        dpe: "D",
        dpeC: "#ca8a04",
      },
    ];
    let t = 0,
      p = 0,
      active = 0;

    function frame() {
      ctx.clearRect(0, 0, W, H);
      t += 0.014;
      p = Math.min(1, p + 0.02);
      if (Math.floor(t / 2.8) !== Math.floor((t - 0.014) / 2.8))
        active = (active + 1) % cards.length;

      ctx.font = `600 10px "JetBrains Mono", monospace`;
      ctx.fillStyle = MT;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("PROFILS COMPATIBLES", 22, 18);
      ctx.fillStyle = V;
      ctx.fillText(
        `${cards.length} résultats`,
        W - 22 - ctx.measureText(`${cards.length} résultats`).width,
        18,
      );

      const cH = 82,
        gap = 12,
        tot = cards.length * cH + (cards.length - 1) * gap;
      const sy = (H - tot) / 2 + 14;

      cards.forEach((c, i) => {
        const d = i * 0.08,
          a = Math.max(0, Math.min(1, (p - d) * 6));
        if (a <= 0) return;
        const isA = i === active;
        const y = sy + i * (cH + gap) + (1 - a) * 12,
          x = 22,
          w = W - 44;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = isA ? "rgba(124,58,237,0.05)" : WH;
        ctx.strokeStyle = isA ? VS + "0.3)" : "rgba(13,10,30,0.07)";
        ctx.lineWidth = isA ? 1.5 : 1;
        rr(ctx, x, y, w, cH, 12);
        ctx.fill();
        ctx.stroke();

        /* Score arc */
        const cx2 = x + 38,
          cy2 = y + cH / 2,
          r = 22;
        ctx.beginPath();
        ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(13,10,30,0.06)";
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(
          cx2,
          cy2,
          r,
          -Math.PI / 2,
          -Math.PI / 2 + (c.compat / 100) * Math.PI * 2,
        );
        ctx.strokeStyle = isA ? V : VS + "0.4)";
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.font = `700 12.5px "Sora", system-ui`;
        ctx.fillStyle = isA ? V : MT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.compat + "%", cx2, cy2);

        /* Infos */
        const ix = cx2 + 32;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.font = `700 13.5px "Sora", system-ui`;
        ctx.fillStyle = isA ? TX : "#3b3553";
        ctx.fillText(c.city, ix, y + 16);
        ctx.font = `400 12px "Sora", system-ui`;
        ctx.fillStyle = MT;
        ctx.fillText(`${c.price}  ·  ${c.surf}`, ix, y + 35);

        /* DPE */
        const bx = ix,
          by = y + 55;
        ctx.fillStyle = c.dpeC + "1a";
        rr(ctx, bx, by, 36, 17, 5);
        ctx.fill();
        ctx.font = `600 9.5px "JetBrains Mono", monospace`;
        ctx.fillStyle = c.dpeC;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("DPE " + c.dpe, bx + 18, by + 8.5);

        /* Barre de progression */
        const barX = w - 100,
          barY = y + cH / 2 - 2;
        ctx.fillStyle = "rgba(13,10,30,0.05)";
        rr(ctx, x + barX, barY, 80, 4, 2);
        ctx.fill();
        ctx.fillStyle = isA ? V : VS + "0.35)";
        rr(ctx, x + barX, barY, 80 * (c.compat / 100), 4, 2);
        ctx.fill();

        ctx.restore();
      });
      rafMap[key] = requestAnimationFrame(frame);
    }
    frame();
  }

  /* ── 4. RADAR : fintech radar violet ────────────────────── */
  function radar(ctx, W, H, key) {
    const V = "#7c3aed",
      VS = "rgba(124,58,237,",
      MT = "#8b82a8",
      TX = "#0d0a1e",
      WH = "#ffffff",
      BG = "#f6f5f9";
    const cx = W / 2,
      cy = H / 2 + 4,
      R = Math.min(W, H) * 0.34;
    let angle = 0;
    const blips = [
      { a: 0.55, r: 0.55, s: 5.5, al: 0, label: "94%" },
      { a: 2.1, r: 0.72, s: 7, al: 0, label: "87%" },
      { a: 3.8, r: 0.44, s: 4.5, al: 0, label: "79%" },
      { a: 5.1, r: 0.62, s: 5.5, al: 0, label: "82%" },
    ];

    function frame() {
      ctx.clearRect(0, 0, W, H);

      ctx.font = `600 9.5px "JetBrains Mono", monospace`;
      ctx.fillStyle = V;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("DEAL RADAR · EN DIRECT", 22, 18);
      ctx.fillStyle = "#059669";
      ctx.fillText("● ACTIF", W - 68, 18);

      [0.28, 0.55, 1].forEach((f, fi) => {
        ctx.beginPath();
        ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
        ctx.strokeStyle = VS + (0.07 + fi * 0.04) + ")";
        ctx.lineWidth = 1;
        ctx.setLineDash(fi < 2 ? [4, 5] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * (Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.strokeStyle = VS + "0.07)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      /* Sweep */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, angle - 0.6, angle);
      ctx.closePath();
      ctx.fillStyle = VS + "0.08)";
      ctx.fill();
      const grd = ctx.createLinearGradient(
        cx,
        cy,
        cx + Math.cos(angle) * R,
        cy + Math.sin(angle) * R,
      );
      grd.addColorStop(0, VS + "0)");
      grd.addColorStop(1, VS + "0.5)");
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
      ctx.strokeStyle = grd;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      /* Centre */
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = V;
      ctx.fill();

      blips.forEach((b) => {
        const da =
          (((b.a - angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (da < 0.22) b.al = 1;
        b.al = Math.max(0, b.al - 0.007);
        if (b.al < 0.02) return;
        const bx = cx + Math.cos(b.a) * R * b.r;
        const by = cy + Math.sin(b.a) * R * b.r;
        ctx.beginPath();
        ctx.arc(bx, by, b.s * b.al + 7, 0, Math.PI * 2);
        ctx.fillStyle = VS + b.al * 0.08 + ")";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, by, b.s * b.al, 0, Math.PI * 2);
        ctx.fillStyle = VS + b.al * 0.95 + ")";
        ctx.fill();
        if (b.al > 0.6) {
          ctx.save();
          ctx.globalAlpha = b.al;
          ctx.font = `600 9.5px "JetBrains Mono", monospace`;
          ctx.fillStyle = V;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(b.label, bx, by - b.s * b.al - 5);
          ctx.restore();
        }
      });

      /* Stats */
      const stats = [
        { l: "Score urgence", v: "87/100" },
        { l: "Fenêtre", v: "~18 h" },
        { l: "Matchs actifs", v: "4 profils" },
      ];
      const bW = (W - 48) / 3;
      stats.forEach((s, i) => {
        const bx = 24 + i * (bW + 8),
          by = H - 62;
        ctx.fillStyle = WH;
        ctx.strokeStyle = "rgba(13,10,30,0.07)";
        ctx.lineWidth = 1;
        rr(ctx, bx, by, bW, 44, 8);
        ctx.fill();
        ctx.stroke();
        ctx.font = `400 9.5px "JetBrains Mono", monospace`;
        ctx.fillStyle = MT;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(s.l, bx + bW / 2, by + 7);
        ctx.font = `700 13px "Sora", system-ui`;
        ctx.fillStyle = TX;
        ctx.textBaseline = "bottom";
        ctx.fillText(s.v, bx + bW / 2, by + 37);
      });

      angle += 0.02;
      if (angle > Math.PI * 2) angle -= Math.PI * 2;
      rafMap[key] = requestAnimationFrame(frame);
    }
    frame();
  }

  /* ── 5. MARKET : barres animées + courbe de tendance ────── */
  function market(ctx, W, H, key) {
    const V = "#7c3aed",
      VS = "rgba(124,58,237,",
      MT = "#8b82a8",
      TX = "#0d0a1e",
      WH = "#ffffff";
    const data = [
      { city: "Paris", base: 11200 },
      { city: "Lyon", base: 5400 },
      { city: "Bordeaux", base: 4900 },
      { city: "Nantes", base: 4200 },
      { city: "Marseille", base: 3800 },
    ];
    const palette = ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];
    const MAX = 12800;
    let t = 0,
      p = 0;

    function frame() {
      ctx.clearRect(0, 0, W, H);
      t += 0.02;
      p = Math.min(1, p + 0.022);

      ctx.font = `500 9.5px "JetBrains Mono", monospace`;
      ctx.fillStyle = MT;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("PRIX MÉDIAN €/m² · MARCHÉ ACTIF", 24, 18);

      const PL = 24,
        PR = 24,
        PT = 42,
        PB = 56;
      const cW = W - PL - PR,
        cH = H - PT - PB;
      const floor = PT + cH;
      const step = cW / data.length;
      const bW = Math.floor(step * 0.42);

      const vals = data.map(
        (d, i) =>
          d.base + Math.sin(t + i * 1.4) * 150 + Math.cos(t * 0.65 + i) * 70,
      );

      [0.25, 0.5, 0.75, 1].forEach((f) => {
        const y = floor - cH * f;
        ctx.beginPath();
        ctx.moveTo(PL, y);
        ctx.lineTo(W - PR, y);
        ctx.strokeStyle = "rgba(13,10,30,0.05)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `400 9px "JetBrains Mono", monospace`;
        ctx.fillStyle = "#c4bddd";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(Math.round((MAX * f) / 1000) + "k", PL - 6, y);
      });

      vals.forEach((v, i) => {
        const bH = Math.round((v / MAX) * cH * p);
        const x = PL + i * step + (step - bW) / 2,
          y = floor - bH;
        ctx.save();
        const grd = ctx.createLinearGradient(x, y, x, floor);
        grd.addColorStop(0, palette[i]);
        grd.addColorStop(1, palette[i] + "88");
        ctx.fillStyle = grd;
        ctx.globalAlpha = 0.88 + Math.sin(t + i) * 0.06;
        rr(ctx, x, y, bW, bH, 5);
        ctx.fill();
        ctx.restore();
        if (p > 0.82) {
          ctx.font = `600 10px "Sora", system-ui`;
          ctx.fillStyle = palette[i];
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(
            Math.round(v).toLocaleString("fr-FR"),
            x + bW / 2,
            y - 5,
          );
        }
        ctx.font = `500 11px "Sora", system-ui`;
        ctx.fillStyle = "#6d28d9";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(data[i].city, x + bW / 2, floor + 9);
      });

      if (p > 0.55) {
        ctx.beginPath();
        vals.forEach((v, i) => {
          const bH = Math.round((v / MAX) * cH * p);
          const x = PL + i * step + step / 2,
            y = floor - bH - 18;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = VS + "0.3)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = Math.min(1, (p - 0.55) * 3);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        vals.forEach((v, i) => {
          const bH = Math.round((v / MAX) * cH * p);
          const x = PL + i * step + step / 2,
            y = floor - bH - 18;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = V;
          ctx.fill();
        });
      }

      rafMap[key] = requestAnimationFrame(frame);
    }
    frame();
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  function init() {
    const overlay = buildModal();

    requestAnimationFrame(() => {
      const next = document.getElementById("obNext");
      const prev = document.getElementById("obPrev");
      const skip = document.getElementById("obSkip");
      if (!next) return;
      next.addEventListener("click", nextStep);
      prev.addEventListener("click", prevStep);
      skip.addEventListener("click", closeGuide);
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeGuide();
    });

    setTimeout(() => {
      overlay.classList.remove("ob-hidden");
      overlay.classList.add("ob-visible");
      document.getElementById("obModal").classList.add("ob-modal-in");
      renderSlide(0);
    }, 300);
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
