/**
 * ============================================================
 * VEHICLE AD CARDS — module autonome (v2)
 * ============================================================
 * Remplace les anciennes fonctions openRecapPopup() / renderMatches()
 * du fichier chat-occas.js. Ne dépend que de $ / addMessage / scrollBottom
 * / sendSpecialUpdate / API_BASE déjà définis dans chat-occas.js.
 *
 * INTÉGRATION dans chat-occas.js :
 *   1. Ajouter en haut du fichier :
 *        import { renderRecapCard, renderMatchResults } from "./vehicle-ad-cards.js";
 *   2. Dans handleServerResponse(), remplacer :
 *        setTimeout(() => openRecapPopup(data.recapData || state.criteria), 700);
 *      par :
 *        setTimeout(() => renderRecapCard(data.recapData || state.criteria), 700);
 *   3. Remplacer l'appel `renderMatches(data.matches, data.postReply)` par
 *        `renderMatchResults(data.matches, data.postReply)`
 *   4. Supprimer (ou laisser inutilisées) les anciennes fonctions
 *      openRecapPopup / renderMatches / openGalleryModal si tu préfères
 *      un fichier propre — ce module ne les appelle pas.
 *   5. Ajouter dans chat-occas.html : <link rel="stylesheet" href="vehicle-ad-cards.css">
 *   6. Ce module ne réimplémente pas addMessage()/sendSpecialUpdate() pour
 *      éviter les dépendances circulaires : il passe par 3 hooks globaux.
 *      Colle ces 3 lignes une seule fois, juste après la définition de
 *      addMessage() et sendSpecialUpdate() dans chat-occas.js :
 *
 *        window.__vaAddUserMsg = (text) => addMessage({ text, from: "user" });
 *        window.__vaAddBotMsg = (text, typing = false) => addMessage({ text, from: "bot", typing });
 *        window.__vaSendSpecialUpdate = (payload) => sendSpecialUpdate(payload);
 * ============================================================
 */

// Les mêmes zones/états que le pop-up de saisie (chat-occas.js), dupliqués
// ici pour que ce module reste autonome et copiable tel quel.
const VA_CAR_ZONES = [
  { id: "avant", label: "Avant / Pare-chocs", x: 15, y: 105, w: 60, h: 50 },
  { id: "capot", label: "Capot", x: 70, y: 70, w: 90, h: 45 },
  { id: "toit", label: "Toit", x: 165, y: 55, w: 140, h: 35 },
  { id: "pareBriseAvant", label: "Pare-brise", x: 160, y: 92, w: 60, h: 35 },
  {
    id: "portiereGauche",
    label: "Portières / Flancs",
    x: 165,
    y: 128,
    w: 220,
    h: 45,
  },
  { id: "vitres", label: "Vitres", x: 220, y: 90, w: 130, h: 35 },
  { id: "coffre", label: "Coffre / Malle", x: 390, y: 70, w: 70, h: 60 },
  {
    id: "arriere",
    label: "Arrière / Pare-chocs",
    x: 460,
    y: 100,
    w: 55,
    h: 55,
  },
  { id: "roues", label: "Jantes / Pneus", x: 90, y: 175, w: 380, h: 30 },
  {
    id: "interieur",
    label: "Intérieur / Habitacle",
    x: 220,
    y: 128,
    w: 90,
    h: 45,
  },
  { id: "mecanique", label: "Mécanique / Moteur", x: 60, y: 155, w: 60, h: 20 },
];

const VA_ZONE_STATUS = [
  { value: "parfait", label: "Parfait", color: "#10b981" },
  { value: "bon", label: "Bon état", color: "#34d399" },
  { value: "usure", label: "Usure normale", color: "#ffb066" },
  { value: "rayure", label: "Rayure(s)", color: "#f59e0b" },
  { value: "choc", label: "Choc / Impact", color: "#ff6a3d" },
  { value: "a_reparer", label: "À réparer", color: "#ff3d3d" },
];

const VA_BUYER_PLACEHOLDER = "images/image-acheteur.jpg";

function vaFmtEuro(n) {
  return n != null && n !== "" ? `${Number(n).toLocaleString("fr-FR")} €` : "—";
}
function vaFmtKm(n) {
  return n != null && n !== ""
    ? `${Number(n).toLocaleString("fr-FR")} km`
    : "—";
}
function vaEsc(s) {
  return String(s ?? "").replace(/</g, "&lt;");
}
function vaBox() {
  return document.getElementById("chat-box");
}
function vaScrollBottom() {
  const box = vaBox();
  box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
}

/** Silhouette voiture (identique au pop-up de saisie état). */
function vaCarSilhouetteSVG() {
  return `
    <path d="M12 128 Q8 100 42 96 L64 96 Q78 66 118 60 L318 60 Q368 58 405 84 L440 100
             Q478 104 500 122 Q512 130 505 148 L478 153 Q474 176 452 176 Q431 176 425 153
             L145 153 Q139 176 118 176 Q97 176 91 153 L28 149 Q6 145 12 128 Z"
      fill="rgba(255,106,61,0.06)" stroke="rgba(255,255,255,0.28)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M64 96 Q78 66 118 60 L165 60 L160 96 Z" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.16)" stroke-width="1.3"/>
    <path d="M318 60 Q368 58 405 84 L390 100 L318 100 Z" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.16)" stroke-width="1.3"/>
    <circle cx="118" cy="178" r="19" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.32)" stroke-width="2.2"/>
    <circle cx="118" cy="178" r="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" stroke-width="1.2"/>
    <circle cx="432" cy="178" r="19" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.32)" stroke-width="2.2"/>
    <circle cx="432" cy="178" r="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" stroke-width="1.2"/>`;
}

/** Diagramme d'état en lecture seule avec tooltip au survol (utilisé dans la modale). */
function vaBuildEtatDiagram(etatZones) {
  const colorMap = Object.fromEntries(
    VA_ZONE_STATUS.map((s) => [s.value, s.color]),
  );
  const wrap = document.createElement("div");
  wrap.className = "va-etat-diagram-wrap";
  wrap.innerHTML = `
    <svg viewBox="0 0 520 220" class="va-etat-svg">
      ${vaCarSilhouetteSVG()}
      ${VA_CAR_ZONES.map((z) => {
        const st = etatZones?.[z.id]?.status;
        const c = st ? colorMap[st] : "rgba(255,255,255,0.12)";
        return `<rect class="va-etat-zone-hover" data-zone="${z.id}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="6"
          fill="${st ? c + "33" : "rgba(255,255,255,0.02)"}" stroke="${c}" stroke-width="1.5"/>`;
      }).join("")}
    </svg>
    <div class="va-etat-tooltip" id="va-etat-tooltip"></div>
    <div class="va-etat-legend">
      ${Object.entries(etatZones || {})
        .map(([zid, z]) => {
          const zoneDef = VA_CAR_ZONES.find((zz) => zz.id === zid);
          const st = VA_ZONE_STATUS.find((s) => s.value === z.status);
          return `<span class="va-etat-chip" style="--zc:${st?.color || "#888"}">${vaEsc(zoneDef?.label || zid)} · ${vaEsc(st?.label || "")}</span>`;
        })
        .join("")}
    </div>`;

  const tooltip = wrap.querySelector("#va-etat-tooltip");
  wrap.querySelectorAll(".va-etat-zone-hover").forEach((rect) => {
    const zid = rect.dataset.zone;
    const zoneDef = VA_CAR_ZONES.find((z) => z.id === zid);
    const st = etatZones?.[zid]?.status;
    const stDef = VA_ZONE_STATUS.find((s) => s.value === st);
    rect.addEventListener("mousemove", (e) => {
      const rectBox = wrap.getBoundingClientRect();
      tooltip.style.left = e.clientX - rectBox.left + 14 + "px";
      tooltip.style.top = e.clientY - rectBox.top - 10 + "px";
      tooltip.style.setProperty("--zc", stDef?.color || "#888");
      tooltip.innerHTML = `<span class="dot" style="background:${stDef?.color || "#888"}"></span>${vaEsc(zoneDef?.label || zid)} — ${vaEsc(stDef?.label || "Non renseigné")}`;
      tooltip.classList.add("visible");
    });
    rect.addEventListener("mouseleave", () =>
      tooltip.classList.remove("visible"),
    );
  });

  return wrap;
}

/** Lightbox galerie plein écran avec navigation. */
export function openGalleryLightbox(images, startIdx = 0) {
  if (!images?.length) return;
  let idx = startIdx;
  const overlay = document.createElement("div");
  overlay.className = "va-lightbox-overlay";

  function draw() {
    overlay.innerHTML = `
      <div class="va-lightbox-inner">
        <img src="${images[idx]}" alt="photo ${idx + 1}"/>
        <button class="va-lightbox-close" id="va-lb-close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        ${
          images.length > 1
            ? `
          <button class="va-lightbox-nav va-lightbox-prev" id="va-lb-prev">‹</button>
          <button class="va-lightbox-nav va-lightbox-next" id="va-lb-next">›</button>
          <div class="va-lightbox-counter">${idx + 1} / ${images.length}</div>
        `
            : ""
        }
      </div>`;
    overlay.querySelector("#va-lb-close").onclick = () => overlay.remove();
    overlay.querySelector("#va-lb-prev")?.addEventListener("click", () => {
      idx = (idx - 1 + images.length) % images.length;
      draw();
    });
    overlay.querySelector("#va-lb-next")?.addEventListener("click", () => {
      idx = (idx + 1) % images.length;
      draw();
    });
  }
  draw();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

/** Modale CarVertical (feuille verticale, image ou PDF, avec téléchargement). */
export function openCarVerticalModal(url) {
  if (!url) return;
  const isPdf = /\.pdf(\?|$)/i.test(url);
  const overlay = document.createElement("div");
  overlay.className = "va-modal-overlay";
  overlay.innerHTML = `
    <div class="va-cv-modal-sheet">
      <div class="va-modal-header">
        <div>
          <div class="va-modal-header-title">Rapport CarVertical</div>
          <div class="va-modal-header-sub">Historique &amp; vérification du véhicule</div>
        </div>
        <button class="va-modal-close" id="va-cv-close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="va-cv-frame-wrap">
        ${isPdf ? `<iframe src="${url}"></iframe>` : `<img src="${url}" alt="Rapport CarVertical"/>`}
      </div>
      <div class="va-cv-download-bar">
        <a href="${url}" download target="_blank" rel="noopener" class="va-btn va-btn-primary" style="text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Télécharger le rapport
        </a>
      </div>
    </div>`;
  overlay.querySelector("#va-cv-close").onclick = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

/**
 * Modale de détails "page verticale" avec sections I / II / III.
 * data : objet normalisé (voir vaNormalizeVehicle)
 */
export function openDetailsModal(data) {
  const hasGallery = Array.isArray(data.images) && data.images.length > 1;
  const hasEtat = data.etatZones && Object.keys(data.etatZones).length > 0;

  const overlay = document.createElement("div");
  overlay.className = "va-modal-overlay";

  const sections = [];
  // Section I — infos de base
  sections.push({
    title: "Informations générales",
    build: (el) => {
      const cells = [
        [
          "Marque / Modèle",
          [data.marque, data.modele].filter(Boolean).join(" ") || "—",
        ],
        ["Année", data.annee || "—"],
        ["Prix", vaFmtEuro(data.prix), true],
        ["Kilométrage", vaFmtKm(data.kilometrage)],
        ["Carburant", data.carburant || "—"],
        ["Boîte", data.boite ? cap1(data.boite) : "—"],
        ["Ville", data.ville || "—"],
        ["CarVertical", data.carverticalUrl ? "Rapport joint ✓" : "Non fourni"],
      ];
      el.innerHTML = `<div class="va-info-grid">${cells
        .map(
          ([l, v, price]) => `
        <div class="va-info-cell">
          <div class="va-info-cell-label">${vaEsc(l)}</div>
          <div class="va-info-cell-val ${price ? "price" : ""}">${vaEsc(v)}</div>
        </div>`,
        )
        .join("")}</div>`;
    },
  });

  // Section II / III selon disponibilité de la galerie
  if (hasGallery) {
    sections.push({
      title: "Photos du véhicule",
      build: (el) => {
        el.innerHTML = `<div class="va-gallery-grid">${data.images
          .map(
            (img, i) =>
              `<img src="${img}" data-idx="${i}" alt="photo ${i + 1}"/>`,
          )
          .join("")}</div>`;
        el.querySelectorAll("img").forEach((img) => {
          img.addEventListener("click", () =>
            openGalleryLightbox(data.images, Number(img.dataset.idx)),
          );
        });
      },
    });
  }

  sections.push({
    title: "État du véhicule",
    build: (el) => {
      if (hasEtat) {
        el.appendChild(vaBuildEtatDiagram(data.etatZones));
      } else {
        el.innerHTML = `<div class="va-empty-note">Aucun état détaillé renseigné pour ce véhicule.</div>`;
      }
    },
  });

  const romans = ["I", "II", "III", "IV"];
  overlay.innerHTML = `
    <div class="va-modal-sheet">
      <div class="va-modal-header">
        <div>
          <div class="va-modal-header-title">${vaEsc([data.marque, data.modele].filter(Boolean).join(" ") || "Détails du véhicule")}</div>
          <div class="va-modal-header-sub">${vaEsc(data.ville || "")}${data.annee ? " · " + data.annee : ""}</div>
        </div>
        <button class="va-modal-close" id="va-details-close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="va-modal-body" id="va-details-body"></div>
    </div>`;

  const body = overlay.querySelector("#va-details-body");
  sections.forEach((sec, i) => {
    const secEl = document.createElement("div");
    secEl.className = "va-section";
    secEl.innerHTML = `
      <div class="va-section-head">
        <span class="va-section-num">${romans[i]}</span>
        <span class="va-section-title">${vaEsc(sec.title)}</span>
      </div>
      <div class="va-section-content"></div>`;
    sec.build(secEl.querySelector(".va-section-content"));
    body.appendChild(secEl);
  });

  overlay.querySelector("#va-details-close").onclick = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

function cap1(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Normalise les champs quel que soit l'objet source (recapData ou match). */
function vaNormalizeVehicle(raw) {
  return {
    marque: raw.marque || "",
    modele: raw.modele || "",
    annee: raw.annee ?? null,
    prix: raw.prix ?? raw.budgetMax ?? raw.budgetMin ?? null,
    kilometrage: raw.kilometrage ?? null,
    carburant: raw.carburant || "",
    boite: raw.boite || "",
    ville: raw.ville || "",
    images: Array.isArray(raw.imagesbien) ? raw.imagesbien : [],
    etatZones: raw.etatZones || raw.etatzones || {},
    carverticalUrl: raw.carverticalUrl || raw.carverticalurl || null,
    carverticalNote: raw.carverticalNote ?? raw.carverticalnote ?? null,
    contact: raw.contact || null,
    compatibility: raw.compatibility ?? null,
  };
}

/** Construit le HTML de la carte véhicule (vendeur : avec photo + CarVertical). */
function vaBuildSellerCardHTML(v) {
  const img = v.images[0];
  const hasGallery = v.images.length > 1;
  const hasEtat = v.etatZones && Object.keys(v.etatZones).length > 0;
  return `
    <div class="va-photo-wrap">
      ${
        img
          ? `<img src="${img}" alt="véhicule"/>`
          : `<div class="va-photo-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3 17V9l2-5h10l4 5v8"/><path d="M3 12h18"/></svg>
            </div>`
      }
      <div class="va-badges">
        ${v.carverticalUrl ? `<button class="va-badge-cv" data-act="cv"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> CV</button>` : ""}
      </div>
      ${hasGallery ? `<button class="va-badge-gallery" data-act="gallery"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> ${v.images.length}</button>` : ""}
      ${hasEtat ? `<button class="va-etat-btn" data-act="etat" title="État du véhicule"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM3 17V9l2-5h10l4 5v8"/></svg></button>` : ""}
    </div>
    <div class="va-body">
      <div class="va-title-row">
        <div class="va-title">${vaEsc([v.marque, v.modele].filter(Boolean).join(" ") || "Véhicule")}</div>
        <div class="va-price">${vaFmtEuro(v.prix)}</div>
      </div>
      <div class="va-meta-row">
        <span>${vaEsc(v.annee || "—")}</span>
        <span>${vaEsc(vaFmtKm(v.kilometrage))}</span>
        <span>${vaEsc(v.carburant || "—")}</span>
        <span>${vaEsc(v.boite ? cap1(v.boite) : "—")}</span>
      </div>
      <button class="va-more-link" data-act="details">
        Voir plus de détails
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="9 6 15 12 9 18"/></svg>
      </button>
    </div>`;
}

/** Construit le HTML de la carte "recherche" acheteur (pas de photo réelle). */
function vaBuildBuyerCardHTML(v, extra) {
  return `
    <div class="va-photo-wrap">
      <img src="${VA_BUYER_PLACEHOLDER}" alt="recherche acheteur" onerror="this.style.display='none'"/>
    </div>
    <div class="va-body">
      <div class="va-title-row">
        <div class="va-title">${vaEsc(extra?.marqueModeleSkipped ? "Recherche ouverte" : [v.marque, v.modele].filter(Boolean).join(" ") || "Recherche véhicule")}</div>
        <div class="va-price">${v.prix != null ? "≤ " + vaFmtEuro(v.prix) : "—"}</div>
      </div>
      <div class="va-meta-row">
        <span>${vaEsc(v.ville || "—")}</span>
        <span>${vaEsc(v.kilometrage != null ? vaFmtKm(v.kilometrage) + " max" : "—")}</span>
        <span>${vaEsc(v.carburant || "—")}</span>
        <span>${vaEsc(v.boite ? cap1(v.boite) : "—")}</span>
      </div>
    </div>`;
}

function vaWireCardActions(cardEl, v) {
  cardEl
    .querySelector('[data-act="gallery"]')
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      openGalleryLightbox(v.images, 0);
    });
  cardEl.querySelector('[data-act="etat"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    openDetailsModal(v);
  });
  cardEl.querySelector('[data-act="cv"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    openCarVerticalModal(v.carverticalUrl);
  });
  cardEl
    .querySelector('[data-act="details"]')
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      openDetailsModal(v);
    });
}

/**
 * RÉCAPITULATIF D'ANNONCE (avant publication / lancement recherche)
 * Remplace openRecapPopup(data).
 */
export function renderRecapCard(rawData) {
  const isSeller = rawData.role === "seller";
  const v = vaNormalizeVehicle(rawData);

  const row = document.createElement("div");
  row.className = "msg bot structured";

  const cardHTML = isSeller
    ? vaBuildSellerCardHTML(v)
    : vaBuildBuyerCardHTML(v, rawData);

  row.innerHTML = `
    <div class="va-card" id="va-recap-card">
      ${cardHTML}
      <div class="va-body" style="padding-top:0">
        <div class="va-actions">
          <button class="va-btn va-btn-ghost" id="va-recap-modify">Modifier</button>
          <button class="va-btn va-btn-primary" id="va-recap-confirm">
            ${isSeller ? "Publier l'annonce" : "Lancer la recherche"}
          </button>
        </div>
      </div>
    </div>`;

  vaBox().appendChild(row);
  vaScrollBottom();

  vaWireCardActions(row, v);

  row.querySelector("#va-recap-confirm").onclick = () => {
    window.__vaAddUserMsg?.(
      isSeller
        ? "Je confirme, publiez l'annonce."
        : "C'est parfait, lancez la recherche.",
    );
    row.remove();
    window.__vaSendSpecialUpdate?.({
      recapConfirmed: true,
      message: "__RECAP_CONFIRMED__",
    });
  };
  row.querySelector("#va-recap-modify").onclick = () => {
    window.__vaAddUserMsg?.("Je souhaite modifier des informations.");
    row.remove();
    window.__vaSendSpecialUpdate?.({ message: "__RECAP_MODIFY__" });
  };
}

/**
 * RÉSULTATS DE MATCHING (annonces trouvées)
 * Remplace renderMatches(matches, postReply).
 */
export function renderMatchResults(matches, postReply) {
  window.__vaAddBotMsg?.(
    `<strong>${matches.length} annonce(s)</strong> identifiée(s) par le Cerveau IA :`,
  );

  matches.forEach((m, i) => {
    const v = vaNormalizeVehicle(m);
    const compatColor =
      v.compatibility >= 80
        ? "#10b981"
        : v.compatibility >= 60
          ? "#818cf8"
          : v.compatibility >= 40
            ? "#f59e0b"
            : "#ef4444";

    const row = document.createElement("div");
    row.className = "msg bot structured";
    row.innerHTML = `
      <div class="va-card">
        <div style="position:relative">
          ${vaBuildSellerCardHTML(v)}
          ${
            v.compatibility != null
              ? `<div style="position:absolute;top:10px;left:10px;background:rgba(10,7,6,.72);backdrop-filter:blur(6px);border:1px solid ${compatColor}66;color:${compatColor};font-size:12px;font-weight:800;padding:5px 11px;border-radius:20px">${v.compatibility}%</div>`
              : ""
          }
        </div>
        <div class="va-body" style="padding-top:0">
          <div class="va-actions">
            <button class="va-btn va-btn-primary" data-act="contact">Mettre en relation</button>
          </div>
        </div>
      </div>`;

    vaBox().appendChild(row);
    vaWireCardActions(row, v);
    row.querySelector('[data-act="contact"]').onclick = () => {
      window.__vaAddUserMsg?.(
        `Mise en relation avec ${v.marque || ""} ${v.modele || ""} — ${v.ville}`.trim(),
      );
      window.__vaSendSpecialUpdate?.({ message: `__ACTION_CONTACT__:${i}` });
    };
  });

  vaScrollBottom();
  if (postReply) window.__vaAddBotMsg?.(postReply, true);
}
