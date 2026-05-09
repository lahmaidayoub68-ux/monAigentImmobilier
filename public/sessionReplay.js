/**
 * sessionReplay.js — AiGENT · Résumé de session PDF
 * ─────────────────────────────────────────────────────
 * Génère un rapport PDF structuré depuis l'historique de session :
 *   - Critères collectés
 *   - Matchs trouvés avec scores
 *   - Décisions prises
 *   - Timeline de la conversation
 *
 * Usage :
 *   import { initSessionReplay } from './sessionReplay.js';
 *   initSessionReplay(state); // appelé une fois dans initChatbot()
 *
 * Dépendance : jsPDF (chargé via CDN dans le HTML)
 * ─────────────────────────────────────────────────────
 */

/* ─── HELPERS INTERNES ─────────────────────────────── */
const fmtNum = (n) =>
  n != null && !isNaN(n)
    ? Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 })
    : "—";

const fmtPrice = (n) => {
  if (!n) return "—";
  return n >= 1_000_000 ? fmtNum(n / 1_000_000) + " M€" : fmtNum(n) + " €";
};

const today = () =>
  new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const nowTime = () =>
  new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/* ─── EXTRACTION CRITÈRES LISIBLES ────────────────── */
function extractCriteriaLines(criteria, role) {
  if (!criteria) return [];
  const lines = [];
  if (criteria.ville) lines.push(["Localisation", criteria.ville]);
  if (criteria.type) lines.push(["Type de bien", criteria.type]);
  if (role === "buyer") {
    if (criteria.budgetMax)
      lines.push(["Budget maximum", fmtPrice(criteria.budgetMax)]);
    if (criteria.budgetMin && criteria.budgetMin !== criteria.budgetMax)
      lines.push(["Budget minimum", fmtPrice(criteria.budgetMin)]);
  } else {
    if (criteria.budgetMin)
      lines.push(["Prix de vente", fmtPrice(criteria.budgetMin)]);
  }
  if (criteria.surfaceMin)
    lines.push(["Surface minimum", fmtNum(criteria.surfaceMin) + " m²"]);
  if (criteria.piecesMin)
    lines.push(["Pièces minimum", criteria.piecesMin + " pièce(s)"]);
  if (criteria.toleranceKm && criteria.toleranceKm > 0)
    lines.push(["Rayon de recherche", criteria.toleranceKm + " km"]);
  if (criteria.etatBien) lines.push(["État du bien", criteria.etatBien]);
  if (criteria.niveauEnergetique)
    lines.push(["DPE", criteria.niveauEnergetique]);
  if (Array.isArray(criteria.proximite) && criteria.proximite.length)
    lines.push(["Commodités", criteria.proximite.length + " sélectionnée(s)"]);
  return lines;
}

/* ─── EXTRACTION MESSAGES TEXTE DEPUIS HISTORY ─────── */
function extractConversationSummary(history) {
  if (!history || !history.length) return [];
  return history
    .filter((m) => !m.structured && m.content && m.content.length < 400)
    .slice(-20)
    .map((m) => ({
      role: m.role === "user" ? "Vous" : "AiGENT",
      text: m.content
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 200),
    }));
}

/* ─── GÉNÉRATION PDF ───────────────────────────────── */
function generateSessionPDF(state) {
  // Vérification jsPDF disponible
  if (
    typeof window.jspdf === "undefined" &&
    typeof window.jsPDF === "undefined"
  ) {
    console.error("[SessionReplay] jsPDF non chargé");
    showReplayToast("Erreur : jsPDF non disponible", true);
    return;
  }

  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const COLORS = {
    violet: [99, 102, 241],
    rose: [244, 114, 182],
    dark: [15, 15, 35],
    grey: [100, 100, 120],
    lightGrey: [230, 230, 240],
    white: [255, 255, 255],
    green: [52, 211, 153],
    amber: [251, 191, 36],
    red: [248, 113, 113],
  };

  const W = 210;
  const MARGIN = 18;
  const COL = W - MARGIN * 2;
  let y = 0;

  /* ── FONCTIONS LAYOUT ── */
  function setFont(size = 10, style = "normal", color = COLORS.dark) {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
  }

  function drawRect(x, yPos, w, h, color, radius = 2) {
    doc.setFillColor(...color);
    doc.roundedRect(x, yPos, w, h, radius, radius, "F");
  }

  function addPageIfNeeded(needed = 20) {
    if (y + needed > 275) {
      doc.addPage();
      y = 20;
      renderPageFooter();
    }
  }

  function renderPageFooter() {
    const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.grey);
    doc.text(
      `AiGENT Immobilier · Rapport de session · Page ${pageNum}`,
      MARGIN,
      288,
    );
    doc.text(today(), W - MARGIN, 288, { align: "right" });
    // Ligne footer
    doc.setDrawColor(...COLORS.lightGrey);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 284, W - MARGIN, 284);
  }

  /* ── PAGE 1 : HEADER ── */

  // Bande violette supérieure
  drawRect(0, 0, W, 52, COLORS.violet, 0);

  // Gradient rose sur la droite (simulé)
  doc.setFillColor(244, 114, 182, 0.4);
  doc.rect(W - 60, 0, 60, 52, "F");

  // Logo texte
  setFont(22, "bold", COLORS.white);
  doc.text("AiGENT", MARGIN, 22);
  setFont(9, "normal", [220, 210, 255]);
  doc.text("Intelligence Immobilière", MARGIN, 30);

  // Titre rapport
  setFont(11, "bold", COLORS.white);
  doc.text("RAPPORT DE SESSION", W - MARGIN, 22, { align: "right" });
  setFont(9, "normal", [220, 210, 255]);
  doc.text(`${today()} · ${nowTime()}`, W - MARGIN, 30, { align: "right" });

  // Chips rôle / user
  const role = state.role === "buyer" ? "Acheteur" : "Vendeur";
  const username = state.user?.username || "—";
  drawRect(MARGIN, 37, 38, 9, [255, 255, 255, 30], 4);
  setFont(8, "bold", COLORS.white);
  doc.text(role.toUpperCase(), MARGIN + 19, 43, { align: "center" });

  drawRect(MARGIN + 42, 37, 55, 9, [255, 255, 255, 30], 4);
  setFont(8, "normal", COLORS.white);
  doc.text(username, MARGIN + 42 + 27.5, 43, { align: "center" });

  y = 62;

  /* ── SECTION : SYNTHÈSE ── */
  const matches = state.lastMatches || [];
  const avgCompat = matches.length
    ? Math.round(
        matches.reduce((s, m) => s + (m.compatibility || 0), 0) /
          matches.length,
      )
    : 0;

  // 3 KPI cards en ligne
  const kpiItems = [
    {
      label: "Profils analysés",
      value: String(matches.length),
      color: COLORS.violet,
    },
    {
      label: "Compatibilité moy.",
      value: avgCompat + " %",
      color: COLORS.rose,
    },
    {
      label: "Critères renseignés",
      value: String(extractCriteriaLines(state.criteria, state.role).length),
      color: COLORS.green,
    },
  ];

  const kpiW = COL / 3 - 3;
  kpiItems.forEach((k, i) => {
    const kx = MARGIN + i * (kpiW + 4.5);
    drawRect(kx, y, kpiW, 22, k.color, 3);
    setFont(16, "bold", COLORS.white);
    doc.text(k.value, kx + kpiW / 2, y + 13, { align: "center" });
    setFont(7.5, "normal", [230, 230, 255]);
    doc.text(k.label.toUpperCase(), kx + kpiW / 2, y + 20, { align: "center" });
  });

  y += 30;

  /* ── SECTION : CRITÈRES ── */
  addPageIfNeeded(50);

  // Titre section
  setFont(11, "bold", COLORS.violet);
  doc.text("Critères de recherche", MARGIN, y);
  doc.setDrawColor(...COLORS.violet);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y + 2, MARGIN + 50, y + 2);
  y += 8;

  const criteriaLines = extractCriteriaLines(state.criteria, state.role);

  if (!criteriaLines.length) {
    setFont(9, "italic", COLORS.grey);
    doc.text("Aucun critère enregistré dans cette session.", MARGIN, y);
    y += 8;
  } else {
    criteriaLines.forEach(([label, value], idx) => {
      addPageIfNeeded(10);
      const bg = idx % 2 === 0 ? [248, 248, 252] : COLORS.white;
      drawRect(MARGIN, y - 3.5, COL, 8, bg, 1.5);

      setFont(8.5, "normal", COLORS.grey);
      doc.text(label, MARGIN + 4, y + 1.5);
      setFont(8.5, "bold", COLORS.dark);
      doc.text(value, W - MARGIN - 4, y + 1.5, { align: "right" });
      y += 9;
    });
  }

  y += 6;

  /* ── SECTION : MATCHS ── */
  addPageIfNeeded(30);

  setFont(11, "bold", COLORS.violet);
  doc.text("Profils matchés", MARGIN, y);
  doc.setDrawColor(...COLORS.violet);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y + 2, MARGIN + 42, y + 2);
  y += 8;

  if (!matches.length) {
    setFont(9, "italic", COLORS.grey);
    doc.text("Aucun match trouvé lors de cette session.", MARGIN, y);
    y += 8;
  } else {
    matches.slice(0, 8).forEach((m, idx) => {
      addPageIfNeeded(22);

      // Card match
      drawRect(MARGIN, y, COL, 18, [248, 248, 252], 2);

      // Numéro
      const compatColor =
        (m.compatibility || 0) >= 75
          ? COLORS.green
          : (m.compatibility || 0) >= 50
            ? COLORS.violet
            : COLORS.amber;

      drawRect(MARGIN + 2, y + 2, 14, 14, compatColor, 2);
      setFont(9, "bold", COLORS.white);
      doc.text(String(idx + 1), MARGIN + 9, y + 11, { align: "center" });

      // Infos
      const price = m.price || m.budgetMax;
      const surface = m.surface || m.surfaceMin;
      const pieces = m.pieces || m.piecesMin;

      setFont(9, "bold", COLORS.dark);
      doc.text(`${m.type || "Bien"} · ${m.ville || "—"}`, MARGIN + 20, y + 7);
      setFont(8, "normal", COLORS.grey);
      doc.text(
        [
          price ? fmtPrice(price) : null,
          surface ? fmtNum(surface) + " m²" : null,
          pieces ? pieces + " p." : null,
        ]
          .filter(Boolean)
          .join("  ·  "),
        MARGIN + 20,
        y + 13,
      );

      // Badge compatibilité
      drawRect(W - MARGIN - 28, y + 4, 26, 10, compatColor, 2);
      setFont(9, "bold", COLORS.white);
      doc.text((m.compatibility || 0) + " %", W - MARGIN - 15, y + 11, {
        align: "center",
      });

      y += 21;
    });

    if (matches.length > 8) {
      setFont(8, "italic", COLORS.grey);
      doc.text(
        `+ ${matches.length - 8} profil(s) supplémentaire(s) non affichés`,
        MARGIN,
        y,
      );
      y += 6;
    }
  }

  y += 6;

  /* ── SECTION : CONVERSATION ── */
  addPageIfNeeded(30);

  setFont(11, "bold", COLORS.violet);
  doc.text("Résumé de la conversation", MARGIN, y);
  doc.setDrawColor(...COLORS.violet);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y + 2, MARGIN + 62, y + 2);
  y += 8;

  const convMessages = extractConversationSummary(state.history);

  if (!convMessages.length) {
    setFont(9, "italic", COLORS.grey);
    doc.text("Aucune conversation enregistrée.", MARGIN, y);
    y += 8;
  } else {
    convMessages.forEach((msg) => {
      const isUser = msg.role === "Vous";
      addPageIfNeeded(16);

      const lineColor = isUser ? COLORS.violet : COLORS.rose;
      // Barre latérale colorée
      doc.setFillColor(...lineColor);
      doc.rect(MARGIN, y - 1, 2.5, 10, "F");

      setFont(7.5, "bold", lineColor);
      doc.text(msg.role, MARGIN + 5, y + 2);

      setFont(8, "normal", COLORS.dark);
      const wrapped = doc.splitTextToSize(msg.text, COL - 12);
      doc.text(wrapped, MARGIN + 5, y + 7);

      y += Math.max(12, wrapped.length * 4.5 + 8);
      addPageIfNeeded(5);
    });
  }

  y += 6;

  /* ── SECTION : DÉCISIONS & PROCHAINES ÉTAPES ── */
  addPageIfNeeded(45);

  setFont(11, "bold", COLORS.violet);
  doc.text("Prochaines étapes recommandées", MARGIN, y);
  doc.setDrawColor(...COLORS.violet);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y + 2, MARGIN + 72, y + 2);
  y += 10;

  const steps =
    state.role === "buyer"
      ? [
          "Contacter les profils à compatibilité ≥ 75% en priorité",
          "Configurer une alerte en temps réel pour les nouvelles annonces",
          "Vérifier la cohérence du budget avec les prix du marché local",
          "Envisager un élargissement géographique de ±10 km si le vivier est faible",
          "Consulter la page Recommandations pour un diagnostic complet",
        ]
      : [
          "Répondre rapidement aux acheteurs identifiés (< 24h)",
          "Compléter les photos du bien si non renseignées",
          "Vérifier que le DPE est à jour et conforme",
          "Proposer une visite aux profils à forte compatibilité",
          "Suivre l'évolution des prix de votre secteur sur la page Marché",
        ];

  steps.forEach((step, i) => {
    addPageIfNeeded(10);
    // Numéro cercle
    doc.setFillColor(...COLORS.violet);
    doc.circle(MARGIN + 3.5, y + 1.5, 3, "F");
    setFont(7.5, "bold", COLORS.white);
    doc.text(String(i + 1), MARGIN + 3.5, y + 3, { align: "center" });

    setFont(8.5, "normal", COLORS.dark);
    doc.text(step, MARGIN + 10, y + 3);
    y += 8;
  });

  /* ── FOOTER TOUTES PAGES ── */
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    renderPageFooter();
  }

  /* ── TÉLÉCHARGEMENT ── */
  const filename = `aigent-session-${new Date().toISOString().slice(0, 10)}-${username}.pdf`;
  doc.save(filename);
  showReplayToast("Rapport PDF téléchargé");
}

/* ─── TOAST DÉDIÉ ─────────────────────────────────── */
function showReplayToast(msg, isError = false) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  if (isError) el.style.borderColor = "rgba(248,113,113,0.4)";
  clearTimeout(el._rpt);
  el._rpt = setTimeout(() => {
    el.classList.remove("show");
    el.style.borderColor = "";
  }, 3000);
}

/* ─── BOUTON UI — injecté dans le panel IA ─────────── */
function injectReplayButton(state) {
  // Cherche le conteneur des boutons IA existants
  const panel = document.querySelector(".ai-actions");
  if (!panel) return;

  // Évite le doublon si appelé plusieurs fois
  if (document.getElementById("btn-session-replay")) return;

  const btn = document.createElement("button");
  btn.id = "btn-session-replay";
  btn.className = "ai-btn replay-btn";
  btn.setAttribute("aria-label", "Exporter le résumé de session en PDF");
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <polyline points="9 15 12 18 15 15"/>
    </svg>
    Rapport PDF
  `;

  btn.addEventListener("click", () => {
    if (!state.history || state.history.length === 0) {
      showReplayToast("Démarrez une conversation d'abord");
      return;
    }
    generateSessionPDF(state);
  });

  panel.appendChild(btn);

  // Style inline pour ne pas modifier le CSS existant
  // (on ajoute une règle dans <head> une seule fois)
  if (!document.getElementById("replay-btn-style")) {
    const style = document.createElement("style");
    style.id = "replay-btn-style";
    style.textContent = `
      #btn-session-replay {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-top: 8px;
        width: 100%;
        padding: 10px 14px;
        background: transparent;
        border: 1px solid rgba(99, 102, 241, 0.25);
        border-radius: 8px;
        color: var(--text-secondary, #a89ec9);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.18s, border-color 0.18s, color 0.18s;
        letter-spacing: 0.02em;
      }
      #btn-session-replay:hover {
        background: rgba(99, 102, 241, 0.08);
        border-color: rgba(99, 102, 241, 0.5);
        color: #818cf8;
      }
      #btn-session-replay svg {
        flex-shrink: 0;
        opacity: 0.75;
      }
      #btn-session-replay:hover svg {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }
}

/* ─── EXPORT PUBLIC ────────────────────────────────── */
export function initSessionReplay(state) {
  // Attendre que le DOM soit prêt
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      injectReplayButton(state),
    );
  } else {
    injectReplayButton(state);
  }
}

export { generateSessionPDF };
