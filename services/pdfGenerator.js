import PDFDocument from "pdfkit";

// ─── PALETTE PROFESSIONNELLE ─────────────────────────────────────────────────
const C = {
  // Violets signature
  violet: "#6d28d9",
  violetLight: "#ede9fe",
  violetMid: "#8b5cf6",
  violetDim: "#a78bfa",
  violetDeep: "#4c1d95",
  // Neutres
  white: "#ffffff",
  offWhite: "#fafafa",
  gray50: "#f8f9fa",
  gray100: "#f1f3f5",
  gray200: "#e9ecef",
  gray300: "#dee2e6",
  gray400: "#ced4da",
  gray500: "#adb5bd",
  gray600: "#6c757d",
  gray700: "#495057",
  gray800: "#343a40",
  gray900: "#212529",
  ink: "#0f172a",
  // Signaux
  green: "#16a34a",
  greenLight: "#dcfce7",
  greenMid: "#4ade80",
  amber: "#b45309",
  amberLight: "#fef3c7",
  red: "#dc2626",
  redLight: "#fee2e2",
  blue: "#1d4ed8",
  blueLight: "#dbeafe",
};

// ─── FORMATTERS ──────────────────────────────────────────────────────────────
const FMT_EUR = (n) =>
  n == null || isNaN(n)
    ? "—"
    : Number(n).toLocaleString("fr-FR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      });
const FMT_M2 = (n) => (n ? `${Number(n).toLocaleString("fr-FR")} m²` : "—");
const FMT_PCT = (n) => (n != null && n !== "" ? `${n} %` : "—");
const DATE_LONG = () =>
  new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const DATE_SHORT = () =>
  new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
const YEAR = () => new Date().getFullYear();

// ─── CONSTANTES MISE EN PAGE ─────────────────────────────────────────────────
const PAGE_W = 595.28; // A4 points
const PAGE_H = 841.89;
const ML = 52; // marge gauche
const MR = 52; // marge droite
const CW = PAGE_W - ML - MR; // largeur utile = 491.28

// ─── HELPERS BAS NIVEAU ──────────────────────────────────────────────────────
function y_check(doc, y, needed = 60) {
  if (y + needed > PAGE_H - 60) {
    doc.addPage();
    return 52;
  }
  return y;
}

function hline(doc, y, x1 = ML, x2 = PAGE_W - MR, color = C.gray200, lw = 0.5) {
  doc
    .save()
    .moveTo(x1, y)
    .lineTo(x2, y)
    .lineWidth(lw)
    .strokeColor(color)
    .stroke()
    .restore();
}

function rect_fill(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function rounded_fill(doc, x, y, w, h, r, color) {
  doc.save().roundedRect(x, y, w, h, r).fill(color).restore();
}

function text_line(doc, txt, x, y, opts = {}) {
  doc
    .save()
    .fontSize(opts.size || 9)
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fillColor(opts.color || C.gray800)
    .text(txt, x, y, {
      width: opts.width || CW,
      align: opts.align || "left",
      lineGap: opts.lineGap || 0,
      characterSpacing: opts.cs || 0,
    })
    .restore();
}

// ─── HEADER / FOOTER ─────────────────────────────────────────────────────────
function draw_header(doc, pageNum, section = "") {
  // Bande supérieure subtile
  rect_fill(doc, 0, 0, PAGE_W, 36, C.gray50);
  hline(doc, 36, 0, PAGE_W, C.gray200, 0.5);

  // Marque gauche
  doc
    .save()
    .fontSize(8)
    .font("Helvetica-Bold")
    .fillColor(C.violet)
    .text("AIGENT IMMOBILIER", ML, 14, { characterSpacing: 1.5 })
    .restore();

  // Section milieu
  if (section) {
    doc
      .save()
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor(C.gray500)
      .text(section.toUpperCase(), ML + 130, 14.5, { characterSpacing: 0.8 })
      .restore();
  }

  // Page droite
  doc
    .save()
    .fontSize(7.5)
    .font("Helvetica")
    .fillColor(C.gray400)
    .text(`${pageNum}`, PAGE_W - MR, 14, { width: MR, align: "right" })
    .restore();
}

function draw_footer(doc) {
  hline(doc, PAGE_H - 30, 0, PAGE_W, C.gray200, 0.5);
  doc
    .save()
    .fontSize(7)
    .font("Helvetica")
    .fillColor(C.gray400)
    .text(
      `Document généré le ${DATE_LONG()} · AiGENT Immobilier · Confidentiel`,
      ML,
      PAGE_H - 22,
      {
        width: CW,
        align: "left",
      },
    )
    .restore();
  doc
    .save()
    .fontSize(7)
    .font("Helvetica")
    .fillColor(C.gray400)
    .text("monaigentimmobilier.fr", PAGE_W - MR, PAGE_H - 22, {
      width: MR,
      align: "right",
    })
    .restore();
}

// ─── NOUVELLE PAGE ────────────────────────────────────────────────────────────
function new_page(doc, pageNum, section = "") {
  doc.addPage({
    size: "A4",
    margins: { top: 52, bottom: 52, left: ML, right: MR },
  });
  draw_header(doc, pageNum, section);
  draw_footer(doc);
  return 56; // y de départ
}

// ─── TITRE DE SECTION ────────────────────────────────────────────────────────
function section_title(doc, y, label, sub = null) {
  // Trait violet gauche + texte
  rect_fill(doc, ML, y, 3, sub ? 34 : 24, C.violet);

  doc
    .save()
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(C.ink)
    .text(label, ML + 12, y + 3, { characterSpacing: 0.2 })
    .restore();

  if (sub) {
    doc
      .save()
      .fontSize(8)
      .font("Helvetica")
      .fillColor(C.gray500)
      .text(sub, ML + 12, y + 17)
      .restore();
  }

  const h = sub ? 34 : 24;
  hline(doc, y + h + 2, ML, PAGE_W - MR, C.gray200);
  return y + h + 12;
}

// ─── KPI INLINE ──────────────────────────────────────────────────────────────
function kpi_row(doc, y, items) {
  // items = [{label, value, color}]
  const colW = CW / items.length;
  items.forEach((item, i) => {
    const x = ML + i * colW;
    const col = item.color || C.violet;

    // Fond léger
    rounded_fill(doc, x + 2, y, colW - 8, 52, 4, C.gray50);
    // Valeur
    doc
      .save()
      .fontSize(18)
      .font("Helvetica-Bold")
      .fillColor(col)
      .text(item.value, x + 2, y + 8, { width: colW - 8, align: "center" })
      .restore();
    // Label
    doc
      .save()
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor(C.gray500)
      .text(item.label.toUpperCase(), x + 2, y + 34, {
        width: colW - 8,
        align: "center",
        characterSpacing: 0.5,
      })
      .restore();
  });
  return y + 62;
}

// ─── BARRE DE PROGRESSION ────────────────────────────────────────────────────
function progress_bar(doc, x, y, w, pct, color = C.violet) {
  const h = 5;
  rounded_fill(doc, x, y, w, h, h / 2, C.gray200);
  if (pct > 0) {
    const filled = Math.max(h, (pct / 100) * w);
    rounded_fill(doc, x, y, filled, h, h / 2, color);
  }
}

function score_color(v) {
  if (v >= 75) return C.green;
  if (v >= 50) return C.violet;
  if (v >= 30) return C.amber;
  return C.red;
}

function score_label(v) {
  if (v >= 75) return "Excellent";
  if (v >= 55) return "Satisfaisant";
  if (v >= 35) return "À optimiser";
  return "Critique";
}

// ─── TABLEAU DONNÉES ─────────────────────────────────────────────────────────
function data_table(doc, y, headers, rows, colWidths, opts = {}) {
  const ROW_H = 22;
  const HEAD_H = 24;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const x0 = ML;

  // En-tête — fond anthracite sobre
  rect_fill(doc, x0, y, totalW, HEAD_H, C.gray800);

  let cx = x0;
  headers.forEach((h, i) => {
    doc
      .save()
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .fillColor(C.white)
      .text(h.toUpperCase(), cx + 8, y + 8, {
        width: colWidths[i] - 10,
        characterSpacing: 0.6,
      })
      .restore();
    cx += colWidths[i];
  });

  // Lignes
  rows.forEach((row, ri) => {
    const ry = y + HEAD_H + ri * ROW_H;
    if (ri % 2 === 0) rect_fill(doc, x0, ry, totalW, ROW_H, C.gray50);

    cx = x0;
    row.forEach((cell, ci) => {
      const val = cell == null ? "—" : String(cell);
      const isNumeric = !isNaN(parseFloat(val.replace(/ €|%| m²/g, "")));
      const col = ci === 0 ? C.gray800 : isNumeric ? C.gray700 : C.gray600;

      doc
        .save()
        .fontSize(8)
        .font(ci === 0 ? "Helvetica-Bold" : "Helvetica")
        .fillColor(col)
        .text(val, cx + 8, ry + 7, { width: colWidths[ci] - 12 })
        .restore();
      cx += colWidths[ci];
    });

    // Séparateur léger
    hline(doc, ry + ROW_H, x0, x0 + totalW, C.gray200, 0.3);
  });

  return y + HEAD_H + rows.length * ROW_H + 6;
}

// ─── BLOC TEXTE ENCADRÉ ──────────────────────────────────────────────────────
function text_block(doc, y, text, title = null, opts = {}) {
  const w = opts.width || CW;
  const x = opts.x || ML;
  const pad = 12;
  const tw = w - pad * 2 - 4;

  // Estimer hauteur
  doc.fontSize(8.5).font("Helvetica");
  const textH = doc.heightOfString(text, { width: tw, lineGap: 2 });
  const titleH = title ? 18 : 0;
  const boxH = Math.max(40, textH + pad * 2 + titleH);

  // Fond
  rounded_fill(doc, x, y, w, boxH, 4, opts.bg || C.gray50);
  // Bord gauche coloré
  rect_fill(doc, x, y, 3, boxH, opts.accent || C.violet);
  // Bord extérieur
  doc
    .save()
    .roundedRect(x, y, w, boxH, 4)
    .lineWidth(0.5)
    .strokeColor(C.gray200)
    .stroke()
    .restore();

  if (title) {
    doc
      .save()
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .fillColor(opts.accent || C.violet)
      .text(title.toUpperCase(), x + pad, y + 9, { characterSpacing: 0.6 })
      .restore();
  }

  doc
    .save()
    .fontSize(8.5)
    .font("Helvetica")
    .fillColor(C.gray700)
    .text(text, x + pad, y + pad + titleH, { width: tw, lineGap: 2 })
    .restore();

  return y + boxH + 10;
}

// ─── BADGE STATUT ────────────────────────────────────────────────────────────
function badge(doc, x, y, label, bg, fg) {
  const tw = doc.fontSize(7).font("Helvetica-Bold").widthOfString(label);
  const bw = tw + 14;
  rounded_fill(doc, x, y, bw, 14, 7, bg);
  doc
    .save()
    .fontSize(7)
    .font("Helvetica-Bold")
    .fillColor(fg)
    .text(label, x + 7, y + 3.5)
    .restore();
  return x + bw + 8;
}

// ─── CERCLE SCORE ────────────────────────────────────────────────────────────
function score_circle(doc, cx, cy, score) {
  const R = 32;
  const col = score_color(score);
  const lbl = score_label(score);
  const circ = 2 * Math.PI * R;
  const steps = Math.round((score / 100) * 36);

  // Fond anneau
  doc
    .save()
    .circle(cx, cy, R)
    .lineWidth(5)
    .strokeColor(C.gray200)
    .stroke()
    .restore();

  // Arc progression
  for (let s = 0; s < steps; s++) {
    const a1 = (s / 36) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((s + 1) / 36) * Math.PI * 2 - Math.PI / 2;
    doc
      .save()
      .moveTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R)
      .lineTo(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R)
      .lineWidth(5)
      .strokeColor(col)
      .lineCap("round")
      .stroke()
      .restore();
  }

  // Score
  doc
    .save()
    .fontSize(15)
    .font("Helvetica-Bold")
    .fillColor(col)
    .text(String(score), cx - R, cy - 12, { width: R * 2, align: "center" })
    .restore();
  doc
    .save()
    .fontSize(7)
    .font("Helvetica")
    .fillColor(C.gray500)
    .text("/100", cx - R, cy + 4, { width: R * 2, align: "center" })
    .restore();
  doc
    .save()
    .fontSize(7.5)
    .font("Helvetica-Bold")
    .fillColor(col)
    .text(lbl.toUpperCase(), cx - R, cy + 16, {
      width: R * 2,
      align: "center",
      characterSpacing: 0.3,
    })
    .restore();
}

// ─── GRAPHIQUE BARRES HORIZONTALES ───────────────────────────────────────────
function bar_chart_h(doc, y, items, maxW = CW - 100) {
  const ROW_H = 24;
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  items.forEach((item, idx) => {
    const by = y + idx * ROW_H;
    const pct = item.value;
    const col = score_color(pct);
    const bw = Math.max(2, (pct / 100) * maxW);

    // Label gauche
    doc
      .save()
      .fontSize(8)
      .font("Helvetica")
      .fillColor(C.gray700)
      .text(item.label, ML, by + 6, { width: 95 })
      .restore();

    // Track
    rounded_fill(doc, ML + 100, by + 8, maxW, 6, 3, C.gray200);
    if (bw > 2) rounded_fill(doc, ML + 100, by + 8, bw, 6, 3, col);

    // Valeur
    doc
      .save()
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(col)
      .text(`${pct}%`, ML + 100 + maxW + 8, by + 6)
      .restore();
  });

  return y + items.length * ROW_H + 8;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE DE COUVERTURE
// ═══════════════════════════════════════════════════════════════════════════════
function draw_cover(doc, { title, subtitle, username, role, stats, type }) {
  // Bande violette haute (5px)
  rect_fill(doc, 0, 0, PAGE_W, 5, C.violet);

  // En-tête confidentiel
  doc
    .save()
    .fontSize(7)
    .font("Helvetica")
    .fillColor(C.gray400)
    .text("DOCUMENT CONFIDENTIEL — USAGE PERSONNEL", ML, 22, {
      characterSpacing: 1,
    })
    .restore();
  doc
    .save()
    .fontSize(7)
    .font("Helvetica")
    .fillColor(C.gray400)
    .text(DATE_LONG(), PAGE_W - MR - 130, 22, { width: 130, align: "right" })
    .restore();

  // Logo AiGENT
  doc
    .save()
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(C.violet)
    .text("AIGENT IMMOBILIER", ML, 55, { characterSpacing: 2 })
    .restore();
  hline(doc, 70, ML, ML + 110, C.violet, 0.8);

  // Type badge
  const typeLabels = {
    recommendations: "RAPPORT · RECOMMANDATIONS",
    scenarios: "RAPPORT · ANALYSE SCÉNARIOS",
    criteria: "RAPPORT · ANALYSE CRITÈRES",
  };
  doc
    .save()
    .fontSize(7.5)
    .font("Helvetica-Bold")
    .fillColor(C.gray500)
    .text(typeLabels[type] || "RAPPORT ANALYTIQUE", ML, 82, {
      characterSpacing: 1.2,
    })
    .restore();

  // Titre principal — grande typographie sobre
  doc
    .save()
    .fontSize(30)
    .font("Helvetica-Bold")
    .fillColor(C.ink)
    .text(title, ML, 100, { width: PAGE_W - ML - MR - 80, lineGap: 3 })
    .restore();

  // Sous-titre
  const titleH = doc
    .fontSize(30)
    .font("Helvetica-Bold")
    .heightOfString(title, { width: PAGE_W - ML - MR - 80 });
  doc
    .save()
    .fontSize(11)
    .font("Helvetica")
    .fillColor(C.gray600)
    .text(subtitle, ML, 100 + titleH + 8, { width: PAGE_W - ML - MR - 80 })
    .restore();

  // Ligne séparatrice
  const sepY = 230;
  hline(doc, sepY, ML, PAGE_W - MR, C.gray300, 0.5);

  // Destinataire
  doc
    .save()
    .fontSize(7.5)
    .font("Helvetica")
    .fillColor(C.gray500)
    .text("PRÉPARÉ POUR", ML, sepY + 16, { characterSpacing: 0.8 })
    .restore();
  doc
    .save()
    .fontSize(15)
    .font("Helvetica-Bold")
    .fillColor(C.ink)
    .text(username, ML, sepY + 28)
    .restore();
  doc
    .save()
    .fontSize(9)
    .font("Helvetica")
    .fillColor(C.gray500)
    .text(
      role === "buyer" ? "Profil Acheteur" : "Profil Vendeur",
      ML,
      sepY + 48,
    )
    .restore();

  // KPIs couverture — grille sobre
  const kpiY = sepY + 80;
  const kpiItems = [
    {
      label: "Profils analysés",
      value: String(stats.totalMatches ?? 0),
      color: C.violet,
    },
    {
      label: "Compatibilité moy.",
      value: FMT_PCT(stats.averageCompatibility),
      color:
        (stats.averageCompatibility ?? 0) >= 60
          ? C.green
          : (stats.averageCompatibility ?? 0) >= 40
            ? C.amber
            : C.red,
    },
    {
      label: "Favoris",
      value: String(stats.totalFavoris ?? 0),
      color: C.gray700,
    },
    {
      label: "Conversations",
      value: String(stats.activeConversations ?? 0),
      color: C.gray700,
    },
  ];

  kpiItems.forEach((k, i) => {
    const kx = ML + i * (CW / 4) + CW / 4 / 2 - 40;
    // Valeur
    doc
      .save()
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor(k.color)
      .text(k.value, kx, kpiY, { width: 80, align: "center" })
      .restore();
    // Label
    doc
      .save()
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor(C.gray500)
      .text(k.label.toUpperCase(), kx, kpiY + 28, {
        width: 80,
        align: "center",
        characterSpacing: 0.4,
      })
      .restore();
  });

  // Ligne séparatrice basse
  hline(doc, kpiY + 54, ML, PAGE_W - MR, C.gray200, 0.5);

  // Pied de couverture
  doc
    .save()
    .fontSize(7.5)
    .font("Helvetica")
    .fillColor(C.gray400)
    .text(
      `Ce rapport a été généré automatiquement par AiGENT Immobilier le ${DATE_LONG()}. Les données sont issues du moteur de matching en temps réel. Usage personnel et confidentiel.`,
      ML,
      PAGE_H - 70,
      { width: CW - 120, lineGap: 2 },
    )
    .restore();

  doc
    .save()
    .fontSize(7.5)
    .font("Helvetica-Bold")
    .fillColor(C.violetDim)
    .text("monaigentimmobilier.fr", ML, PAGE_H - 42)
    .restore();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF 1 — RECOMMANDATIONS
// ═══════════════════════════════════════════════════════════════════════════════
export function generateRecommandationsPDF(
  res,
  { username, role, matches, statsData, scores, aiContent },
) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 52,
    autoFirstPage: true,
    info: {
      Title: `Rapport de Recommandations · ${username}`,
      Author: "AiGENT Immobilier",
      Subject: "Analyse stratégique de positionnement immobilier",
      Creator: "AiGENT Platform",
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="aigent-recommandations-${Date.now()}.pdf"`,
  );
  doc.pipe(res);

  const CRIT_LABELS = {
    budget: "Budget",
    surface: "Surface",
    pieces: "Pièces",
    ville: "Localisation",
    type: "Type de bien",
  };
  const WEIGHTS = { budget: 3, surface: 2, pieces: 1, ville: 2, type: 1 };
  const CRIT_ORDER = ["budget", "surface", "pieces", "ville", "type"];

  const gs = Math.round(
    Object.entries(scores).reduce((t, [k, v]) => t + v * (WEIGHTS[k] || 1), 0) /
      Object.values(WEIGHTS).reduce((a, b) => a + b, 0),
  );
  const totalMatches = matches?.length ?? 0;
  const avgCompat = statsData?.averageCompatibility ?? 0;
  const totalFavoris = statsData?.totalFavoris ?? 0;
  const worstCrit = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
  const bestCrit = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  let pageNum = 1;

  // ── PAGE 1 : COUVERTURE ───────────────────────────────────────────────────
  draw_cover(doc, {
    title: "Rapport de\nRecommandations",
    subtitle: "Analyse stratégique de positionnement sur le marché immobilier",
    username,
    role,
    type: "recommendations",
    stats: {
      totalMatches,
      averageCompatibility: avgCompat,
      totalFavoris,
      activeConversations: statsData?.activeConversations ?? 0,
    },
  });
  draw_footer(doc);

  // ── PAGE 2 : RÉSUMÉ EXÉCUTIF ──────────────────────────────────────────────
  pageNum++;
  let y = new_page(doc, pageNum, "Résumé exécutif");

  // Score + infos côte à côte
  y = section_title(
    doc,
    y,
    "Résumé exécutif",
    `Score global de positionnement · ${DATE_SHORT()}`,
  );

  const scoreX = ML + 8,
    scoreY = y + 4;
  score_circle(doc, scoreX + 36, scoreY + 44, gs);

  // Texte à droite du cercle
  const txX = scoreX + 90,
    txW = CW - 90;
  const execText =
    aiContent?.executive ??
    `Analyse de ${totalMatches} profils pour votre projet ${role === "buyer" ? "d'acquisition" : "de vente"} — compatibilité moyenne de ${avgCompat} %. Score global ${gs}/100 : positionnement ${gs >= 70 ? "solide" : gs >= 45 ? "modéré avec des marges d'optimisation" : "fragile nécessitant des ajustements"}.${bestCrit ? ` Point fort : ${CRIT_LABELS[bestCrit[0]]} (${bestCrit[1]} %).` : ""}${worstCrit ? ` Frein principal : ${CRIT_LABELS[worstCrit[0]]} (${worstCrit[1]} %).` : ""}`;

  doc
    .save()
    .fontSize(8.5)
    .font("Helvetica")
    .fillColor(C.gray700)
    .text(execText, txX, scoreY, { width: txW - 10, lineGap: 3 })
    .restore();

  y = Math.max(scoreY + 105, y + 105);
  hline(doc, y, ML, PAGE_W - MR, C.gray200);
  y += 14;

  // KPIs ligne
  y = kpi_row(doc, y, [
    { label: "Profils analysés", value: String(totalMatches), color: C.violet },
    {
      label: "Compat. moyenne",
      value: FMT_PCT(avgCompat),
      color: avgCompat >= 65 ? C.green : avgCompat >= 40 ? C.amber : C.red,
    },
    { label: "Favoris", value: String(totalFavoris), color: C.gray700 },
    {
      label: "Conversations",
      value: String(statsData?.activeConversations ?? 0),
      color: C.gray700,
    },
  ]);
  y += 8;

  // ── PAGE 3 : PERFORMANCE CRITÈRES ────────────────────────────────────────
  pageNum++;
  y = new_page(doc, pageNum, "Analyse des critères");
  y = section_title(
    doc,
    y,
    "Performance par critère",
    "Score pondéré de chaque dimension de recherche",
  );

  // Graphique barres
  const critItems = CRIT_ORDER.map((k) => ({
    label: `${CRIT_LABELS[k]} (×${WEIGHTS[k]})`,
    value: scores[k] ?? 0,
  }));
  y = bar_chart_h(doc, y, critItems, CW - 110);
  y += 16;
  hline(doc, y, ML, PAGE_W - MR, C.gray200);
  y += 14;

  // Tableau détaillé critères
  y = section_title(doc, y, "Détail et recommandations par critère");
  const critRows = CRIT_ORDER.map((k) => {
    const v = scores[k] ?? 0;
    const status = score_label(v);
    const action =
      v < 55
        ? "Assouplir de 10–20 % pour débloquer des opportunités supplémentaires"
        : "Bien calibré — maintenir ce critère en priorité";
    return [CRIT_LABELS[k], `${v} %`, status, action];
  });
  y = data_table(
    doc,
    y,
    ["Critère", "Score", "Statut", "Recommandation"],
    critRows,
    [90, 55, 90, CW - 90 - 55 - 90],
  );
  y += 10;

  // Bloc diagnostic IA
  if (aiContent?.diagnostic) {
    y = y_check(doc, y, 80);
    y = text_block(doc, y, aiContent.diagnostic, "Analyse diagnostique");
  }

  // ── PAGE 4 : TOP CORRESPONDANCES ─────────────────────────────────────────
  pageNum++;
  y = new_page(doc, pageNum, "Top correspondances");
  y = section_title(
    doc,
    y,
    "Top correspondances",
    `Profils les mieux alignés · ${DATE_SHORT()}`,
  );

  const topRows = matches
    .slice(0, 8)
    .map((m, i) => [
      i + 1,
      m.ville ?? "—",
      m.type ?? "—",
      FMT_M2(m.surface ?? m.surfaceMin),
      FMT_EUR(m.price ?? m.budgetMax),
      m.compatibility != null ? `${m.compatibility} %` : "—",
      m.etatBien ?? "—",
    ]);

  y = data_table(
    doc,
    y,
    ["#", "Ville", "Type", "Surface", "Prix", "Compat.", "État"],
    topRows,
    [24, 90, 70, 60, 85, 60, CW - 24 - 90 - 70 - 60 - 85 - 60],
  );
  y += 16;

  // Distribution compatibilité
  y = y_check(doc, y, 80);
  y = section_title(doc, y, "Distribution des scores de compatibilité");

  const ranges = [
    {
      label: "Très fort (≥ 80 %)",
      count: matches.filter((m) => m.compatibility >= 80).length,
    },
    {
      label: "Fort (65–79 %)",
      count: matches.filter(
        (m) => m.compatibility >= 65 && m.compatibility < 80,
      ).length,
    },
    {
      label: "Moyen (45–64 %)",
      count: matches.filter(
        (m) => m.compatibility >= 45 && m.compatibility < 65,
      ).length,
    },
    {
      label: "Faible (< 45 %)",
      count: matches.filter((m) => m.compatibility < 45).length,
    },
  ];
  const total = Math.max(matches.length, 1);
  y = bar_chart_h(
    doc,
    y,
    ranges.map((r) => ({
      label: r.label,
      value: Math.round((r.count / total) * 100),
    })),
    CW - 110,
  );

  // ── PAGE 5 : RECOMMANDATIONS STRATÉGIQUES ─────────────────────────────────
  pageNum++;
  y = new_page(doc, pageNum, "Recommandations");
  y = section_title(
    doc,
    y,
    "Recommandations stratégiques",
    "Plan d'action personnalisé par ordre de priorité",
  );

  const recoText =
    aiContent?.recommendations ??
    `1. Ajuster le critère ${worstCrit ? CRIT_LABELS[worstCrit[0]] : "budget"} — un relâchement de 10 à 15 % pourrait débloquer entre 20 et 80 profils supplémentaires.\n\n2. Activer les alertes Deal Radar pour être notifié dès qu'un profil dépasse 80 % de compatibilité.\n\n3. Contacter les ${Math.min(3, totalMatches)} profils à plus de 75 % de compatibilité dans les 48 heures.\n\n4. Élargir le rayon géographique de 20 à 30 km pour accéder à un bassin de profils plus dense.`;

  const recos = recoText.split("\n\n").filter(Boolean);
  recos.forEach((reco, i) => {
    y = y_check(doc, y, 50);

    // Numéro
    rounded_fill(doc, ML, y + 2, 20, 20, 10, C.violetLight);
    doc
      .save()
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(C.violet)
      .text(String(i + 1), ML, y + 7, { width: 20, align: "center" })
      .restore();

    // Texte
    doc
      .save()
      .fontSize(8.5)
      .font("Helvetica")
      .fillColor(C.gray700)
      .text(reco.replace(/^\d+\.\s*/, ""), ML + 28, y + 4, {
        width: CW - 28,
        lineGap: 2,
      })
      .restore();
    y +=
      doc
        .fontSize(8.5)
        .font("Helvetica")
        .heightOfString(reco.replace(/^\d+\.\s*/, ""), { width: CW - 28 }) + 18;
    hline(doc, y - 6, ML + 28, PAGE_W - MR, C.gray100, 0.4);
  });

  // ── PAGE 6 : SYNTHÈSE FINALE ──────────────────────────────────────────────
  pageNum++;
  y = new_page(doc, pageNum, "Synthèse");
  y = section_title(doc, y, "Synthèse et récapitulatif", `Au ${DATE_LONG()}`);

  const conclusionText =
    aiContent?.conclusion ??
    `Ce rapport constitue une photographie précise de votre positionnement immobilier. Avec un score global de ${gs}/100 et ${totalMatches} profils compatibles, ${gs >= 60 ? "votre projet présente un bon potentiel de concrétisation à court terme" : "des ajustements stratégiques permettront d'améliorer significativement votre vivier d'opportunités"}.\n\nNous vous recommandons de revisiter ce rapport toutes les deux semaines afin de tenir compte de l'évolution du marché. Pour toute question, notre équipe est disponible via la messagerie intégrée.`;

  y = text_block(doc, y, conclusionText, "Note de synthèse");
  y += 10;

  // Tableau récapitulatif
  const synthRows = [
    [
      "Score global",
      `${gs}/100`,
      gs >= 60 ? "Positif" : gs >= 35 ? "Neutre" : "Attention",
    ],
    [
      "Profils compatibles",
      String(totalMatches),
      totalMatches >= 10
        ? "Satisfaisant"
        : totalMatches >= 3
          ? "Modéré"
          : "Faible",
    ],
    [
      "Compatibilité moyenne",
      FMT_PCT(avgCompat),
      avgCompat >= 70
        ? "Excellent"
        : avgCompat >= 50
          ? "Correct"
          : "À améliorer",
    ],
    [
      "Critère le plus fort",
      bestCrit ? `${CRIT_LABELS[bestCrit[0]]} — ${bestCrit[1]} %` : "—",
      "Atout",
    ],
    [
      "Critère à optimiser",
      worstCrit ? `${CRIT_LABELS[worstCrit[0]]} — ${worstCrit[1]} %` : "—",
      "Priorité",
    ],
  ];
  data_table(doc, y, ["Indicateur", "Valeur", "Interprétation"], synthRows, [
    170,
    145,
    CW - 170 - 145,
  ]);

  doc.end();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF 2 — SCÉNARIOS
// ═══════════════════════════════════════════════════════════════════════════════
export function generateScenariosPDF(
  res,
  { username, role, baseMatches, enlargedMatches, statsData, aiContent },
) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 52,
    autoFirstPage: true,
    info: {
      Title: `Analyse Comparative Scénarios · ${username}`,
      Author: "AiGENT Immobilier",
    },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="aigent-scenarios-${Date.now()}.pdf"`,
  );
  doc.pipe(res);

  const baseCount = baseMatches?.length ?? 0;
  const enlargedCount = enlargedMatches?.length ?? 0;
  const baseCompat = baseCount
    ? Math.round(
        baseMatches.reduce((s, m) => s + (m.compatibility ?? 0), 0) / baseCount,
      )
    : 0;
  const enlargedCompat = enlargedCount
    ? Math.round(
        enlargedMatches.reduce((s, m) => s + (m.compatibility ?? 0), 0) /
          enlargedCount,
      )
    : 0;
  let pageNum = 1;

  // ── COUVERTURE ────────────────────────────────────────────────────────────
  draw_cover(doc, {
    title: "Analyse Comparative\nde Scénarios",
    subtitle: "Évaluation de deux approches de recherche immobilière",
    username,
    role,
    type: "scenarios",
    stats: {
      totalMatches: baseCount,
      averageCompatibility: baseCompat,
      totalFavoris: statsData?.totalFavoris ?? 0,
      activeConversations: statsData?.activeConversations ?? 0,
    },
  });
  draw_footer(doc);

  // ── PAGE 2 : VUE COMPARÉE ────────────────────────────────────────────────
  pageNum++;
  let y = new_page(doc, pageNum, "Comparaison rapide");
  y = section_title(
    doc,
    y,
    "Vue d'ensemble",
    "Indicateurs clés des deux scénarios",
  );

  // Tableau comparatif
  const deltaMatches = enlargedCount - baseCount;
  const deltaLabel =
    deltaMatches >= 0 ? `+${deltaMatches}` : String(deltaMatches);
  const compRows = [
    ["Profils compatibles", String(baseCount), String(enlargedCount)],
    ["Compatibilité moyenne", FMT_PCT(baseCompat), FMT_PCT(enlargedCompat)],
    [
      "Profils ≥ 75 %",
      String(
        baseMatches?.filter((m) => (m.compatibility ?? 0) >= 75).length ?? 0,
      ),
      String(
        enlargedMatches?.filter((m) => (m.compatibility ?? 0) >= 75).length ??
          0,
      ),
    ],
    [
      "Delta profils vs scénario A",
      "Référence",
      `${deltaLabel} (${enlargedCount > 0 ? Math.round((deltaMatches / Math.max(baseCount, 1)) * 100) : 0} %)`,
    ],
  ];

  y = data_table(
    doc,
    y,
    ["Indicateur", "Scénario A — Confort", "Scénario B — Volume"],
    compRows,
    [160, (CW - 160) / 2, (CW - 160) / 2],
  );
  y += 16;

  // Introduction
  const introText =
    aiContent?.executive ??
    `Cette analyse compare deux stratégies de recherche immobilière disponibles au ${DATE_LONG()}. Le Scénario A privilégie la précision des critères pour des profils de haute qualité. Le Scénario B élargit les critères de façon contrôlée pour maximiser le volume d'opportunités et réduire la durée de recherche.`;
  y = text_block(doc, y, introText, "Contexte de l'analyse");

  // ── PAGE 3 : SCÉNARIO A ───────────────────────────────────────────────────
  pageNum++;
  y = new_page(doc, pageNum, "Scénario A — Confort & Qualité");
  y = section_title(
    doc,
    y,
    "Scénario A — Confort & Qualité",
    "Critères stricts · Profils de haute compatibilité",
  );

  // Score A à gauche, texte à droite
  const sAy = y + 8;
  score_circle(doc, ML + 36, sAy + 44, baseCompat);

  const scAText =
    aiContent?.scenarioA ??
    `Le Scénario A maintient vos critères actuels dans leur intégralité. Cette approche génère ${baseCount} profils compatibles avec une compatibilité moyenne de ${baseCompat} %. Elle privilégie la qualité sur le volume, maximisant la probabilité de satisfaction post-transaction. La durée estimée s'étend sur 3 à 6 mois selon la réactivité des contreparties.`;

  doc
    .save()
    .fontSize(8.5)
    .font("Helvetica")
    .fillColor(C.gray700)
    .text(scAText, ML + 90, sAy, { width: CW - 90, lineGap: 3 })
    .restore();
  y = Math.max(sAy + 110, sAy + 50);
  hline(doc, y, ML, PAGE_W - MR, C.gray200);
  y += 14;

  // Top 5 Scénario A
  y = section_title(doc, y, "Top 5 profils — Scénario A");
  const scARows = baseMatches
    .slice(0, 5)
    .map((m, i) => [
      i + 1,
      m.ville ?? "—",
      m.type ?? "—",
      FMT_M2(m.surface ?? m.surfaceMin),
      FMT_EUR(m.price ?? m.budgetMax),
      m.compatibility != null ? `${m.compatibility} %` : "—",
    ]);
  y = data_table(
    doc,
    y,
    ["#", "Ville", "Type", "Surface", "Prix", "Compat."],
    scARows,
    [24, 100, 80, 70, 100, 70],
  );
  y += 14;

  // Distribution Scénario A
  if (baseMatches.length) {
    y = y_check(doc, y, 80);
    y = section_title(doc, y, "Distribution des compatibilités — Scénario A");
    const totalA = Math.max(baseMatches.length, 1);
    y = bar_chart_h(
      doc,
      y,
      [
        {
          label: "Très fort (≥ 80 %)",
          value: Math.round(
            (baseMatches.filter((m) => m.compatibility >= 80).length / totalA) *
              100,
          ),
        },
        {
          label: "Fort (65–79 %)",
          value: Math.round(
            (baseMatches.filter(
              (m) => m.compatibility >= 65 && m.compatibility < 80,
            ).length /
              totalA) *
              100,
          ),
        },
        {
          label: "Moyen (45–64 %)",
          value: Math.round(
            (baseMatches.filter(
              (m) => m.compatibility >= 45 && m.compatibility < 65,
            ).length /
              totalA) *
              100,
          ),
        },
        {
          label: "Faible (< 45 %)",
          value: Math.round(
            (baseMatches.filter((m) => m.compatibility < 45).length / totalA) *
              100,
          ),
        },
      ],
      CW - 110,
    );
  }

  // ── PAGE 4 : SCÉNARIO B ───────────────────────────────────────────────────
  pageNum++;
  y = new_page(doc, pageNum, "Scénario B — Rapidité & Volume");
  y = section_title(
    doc,
    y,
    "Scénario B — Rapidité & Volume",
    "Critères élargis · +10 % budget · +30 km rayon",
  );

  const sBy = y + 8;
  score_circle(doc, ML + 36, sBy + 44, enlargedCompat);

  const scBText =
    aiContent?.scenarioB ??
    `Le Scénario B élargit vos critères : budget augmenté de 10 %, surface minimale réduite de 15 %, rayon étendu de 30 km. Cette configuration génère ${enlargedCount} profils compatibles (${deltaLabel} vs Scénario A) avec une compatibilité moyenne de ${enlargedCompat} %. La durée de recherche se réduit significativement à 4–8 semaines.`;

  doc
    .save()
    .fontSize(8.5)
    .font("Helvetica")
    .fillColor(C.gray700)
    .text(scBText, ML + 90, sBy, { width: CW - 90, lineGap: 3 })
    .restore();
  y = Math.max(sBy + 110, sBy + 50);
  hline(doc, y, ML, PAGE_W - MR, C.gray200);
  y += 14;

  // Top 5 Scénario B
  y = section_title(doc, y, "Top 5 profils — Scénario B");
  const scBRows = (enlargedMatches ?? baseMatches)
    .slice(0, 5)
    .map((m, i) => [
      i + 1,
      m.ville ?? "—",
      m.type ?? "—",
      FMT_M2(m.surface ?? m.surfaceMin),
      FMT_EUR(m.price ?? m.budgetMax),
      m.compatibility != null ? `${m.compatibility} %` : "—",
    ]);
  y = data_table(
    doc,
    y,
    ["#", "Ville", "Type", "Surface", "Prix", "Compat."],
    scBRows,
    [24, 100, 80, 70, 100, 70],
  );

  // ── PAGE 5 : RECOMMANDATION FINALE ───────────────────────────────────────
  pageNum++;
  y = new_page(doc, pageNum, "Recommandation finale");
  y = section_title(doc, y, "Recommandation & Plan d'action");

  const conclusionText =
    aiContent?.conclusion ??
    `Recommandation : approche hybride en deux phases. Démarrez avec le Scénario A (critères stricts) pendant 4 semaines pour cibler les profils de très haute compatibilité. En l'absence de correspondance satisfaisante, basculez progressivement vers le Scénario B en commençant par l'ajustement géographique (+30 km). Cette stratégie préserve la qualité tout en maintenant une capacité d'adaptation.`;

  y = text_block(doc, y, conclusionText, "Stratégie recommandée");
  y += 16;

  // Tableau de décision
  const decisionRows = [
    ["Disponibilité temps", "Long terme (> 6 mois)", "Court terme (< 3 mois)"],
    ["Priorité", "Qualité du bien", "Rapidité de la transaction"],
    ["Tolérance budget", "Critères stricts", "Modérée (+10 % accepté)"],
    ["Marché local", "Équilibré ou acheteur", "Tendu ou vendeur"],
    ["Recommandation", "→ Scénario A", "→ Scénario B"],
  ];
  data_table(
    doc,
    y,
    ["Critère de décision", "Scénario A", "Scénario B"],
    decisionRows,
    [155, (CW - 155) / 2, (CW - 155) / 2],
  );

  doc.end();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF 3 — CRITÈRES
// ═══════════════════════════════════════════════════════════════════════════════
export function generateCriteriaPDF(
  res,
  { username, role, matches, statsData, scores, aiContent },
) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 52,
    autoFirstPage: true,
    info: {
      Title: `Analyse des Critères · ${username}`,
      Author: "AiGENT Immobilier",
    },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="aigent-criteres-${Date.now()}.pdf"`,
  );
  doc.pipe(res);

  const CRIT_LABELS = {
    budget: "Budget",
    surface: "Surface",
    pieces: "Nombre de pièces",
    ville: "Localisation",
    type: "Type de bien",
  };
  const WEIGHTS = { budget: 3, surface: 2, pieces: 1, ville: 2, type: 1 };
  const CRIT_ORDER = ["budget", "surface", "pieces", "ville", "type"];
  const gs = Math.round(
    Object.entries(scores).reduce((t, [k, v]) => t + v * (WEIGHTS[k] || 1), 0) /
      Object.values(WEIGHTS).reduce((a, b) => a + b, 0),
  );
  const totalMatches = matches?.length ?? 0;
  const avgCompat = statsData?.averageCompatibility ?? 0;
  let pageNum = 1;

  // ── COUVERTURE ────────────────────────────────────────────────────────────
  draw_cover(doc, {
    title: "Analyse Détaillée\ndes Critères",
    subtitle: "Optimisation du positionnement par critère de recherche",
    username,
    role,
    type: "criteria",
    stats: {
      totalMatches,
      averageCompatibility: avgCompat,
      totalFavoris: statsData?.totalFavoris ?? 0,
      activeConversations: statsData?.activeConversations ?? 0,
    },
  });
  draw_footer(doc);

  // ── PAGE 2 : SCORE GLOBAL ─────────────────────────────────────────────────
  pageNum++;
  let y = new_page(doc, pageNum, "Score global");
  y = section_title(
    doc,
    y,
    "Score global de performance",
    `Pondération multi-critères — ${DATE_SHORT()}`,
  );

  // Cercle centré
  score_circle(doc, PAGE_W / 2, y + 60, gs);
  y += 130;
  hline(doc, y, ML, PAGE_W - MR, C.gray200);
  y += 14;

  // Intro
  const introText =
    aiContent?.executive ??
    `Ce rapport détaille l'analyse de vos critères au ${DATE_LONG()}. Le score de ${gs}/100 est calculé par pondération : budget (×3), surface (×2), localisation (×2), pièces (×1), type de bien (×1).`;
  y = text_block(doc, y, introText, "Méthodologie");
  y += 14;

  // Graphique pondéré
  y = section_title(doc, y, "Performance pondérée par critère");
  y = bar_chart_h(
    doc,
    y,
    CRIT_ORDER.map((k) => ({
      label: `${CRIT_LABELS[k]} (×${WEIGHTS[k]})`,
      value: scores[k] ?? 0,
    })),
    CW - 110,
  );

  // ── PAGES CRITÈRES — un critère par bloc ──────────────────────────────────
  CRIT_ORDER.forEach((k, idx) => {
    const score = scores[k] ?? 0;
    const col = score_color(score);
    const lbl = score_label(score);
    const bgBadge =
      score >= 75
        ? C.greenLight
        : score >= 55
          ? C.violetLight
          : score >= 35
            ? C.amberLight
            : C.redLight;

    // Nouvelle page pour chaque critère
    pageNum++;
    y = new_page(doc, pageNum, `Critère : ${CRIT_LABELS[k]}`);

    // En-tête critère
    rounded_fill(doc, ML, y, CW, 50, 4, C.gray50);
    doc
      .save()
      .roundedRect(ML, y, CW, 50, 4)
      .lineWidth(0.5)
      .strokeColor(C.gray200)
      .stroke()
      .restore();
    rect_fill(doc, ML, y, 3, 50, col);

    doc
      .save()
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor(C.ink)
      .text(CRIT_LABELS[k], ML + 16, y + 10)
      .restore();
    doc
      .save()
      .fontSize(8)
      .font("Helvetica")
      .fillColor(C.gray500)
      .text(
        `Poids dans le calcul global : ×${WEIGHTS[k]} · Rang : ${idx + 1}/5`,
        ML + 16,
        y + 30,
      )
      .restore();
    badge(doc, PAGE_W - MR - 80, y + 18, lbl, bgBadge, col);

    y += 64;

    // Barre XXL
    doc
      .save()
      .fontSize(8)
      .font("Helvetica")
      .fillColor(C.gray500)
      .text("Score", ML, y)
      .restore();
    doc
      .save()
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor(col)
      .text(`${score} %`, ML + 40, y - 5)
      .restore();
    y += 18;
    progress_bar(doc, ML, y, CW, score, col);
    y += 18;
    hline(doc, y, ML, PAGE_W - MR, C.gray200, 0.4);
    y += 14;

    // Analyse
    const critText =
      aiContent?.details?.[k] ??
      `Ce critère présente un score de ${score} % — statut : ${lbl}. ${
        score < 55
          ? `Un ajustement de 10 à 20 % permettrait de débloquer un nombre significatif de profils supplémentaires. Priorité d'action : ${score < 35 ? "immédiate" : "dans les 2 semaines"}.`
          : `Ce critère est bien calibré par rapport au marché actuel. Aucun ajustement urgent n'est nécessaire.`
      }`;
    y = text_block(doc, y, critText, "Analyse");
    y += 10;

    // Profils illustratifs pour ce critère
    const relevantMatches = matches
      .filter((m) => m.criteriaMatch?.detail?.[k])
      .slice(0, 4);

    if (relevantMatches.length) {
      y = y_check(doc, y, 80);
      y = section_title(
        doc,
        y,
        `Exemples de profils — critère ${CRIT_LABELS[k]}`,
      );
      const exRows = relevantMatches.map((m) => {
        const raw = m.criteriaMatch?.detail?.[k];
        const sc =
          raw?.score != null
            ? raw.score
            : ({ perfect: 100, close: 75, tolerated: 50, weak: 25, out: 0 }[
                raw?.level
              ] ?? "—");
        return [
          m.ville ?? "—",
          m.type ?? "—",
          FMT_EUR(m.price ?? m.budgetMax),
          `${m.compatibility ?? "—"} %`,
          `${sc} %`,
        ];
      });
      y = data_table(
        doc,
        y,
        ["Ville", "Type", "Prix", "Compat. glob.", `Score ${CRIT_LABELS[k]}`],
        exRows,
        [95, 80, 100, 90, CW - 95 - 80 - 100 - 90],
      );
    }
  });

  // ── DERNIÈRE PAGE : PLAN D'ACTION ─────────────────────────────────────────
  pageNum++;
  y = new_page(doc, pageNum, "Plan d'action prioritaire");
  y = section_title(
    doc,
    y,
    "Plan d'action prioritaire",
    "Actions classées par impact décroissant",
  );

  const sorted = CRIT_ORDER.map((k) => ({ k, score: scores[k] ?? 0 })).sort(
    (a, b) => a.score - b.score,
  );

  sorted.forEach((item, i) => {
    y = y_check(doc, y, 50);
    const impact =
      item.score < 35
        ? "Impact élevé"
        : item.score < 55
          ? "Impact modéré"
          : "Optimal";
    const impactCol =
      item.score < 35 ? C.red : item.score < 55 ? C.amber : C.green;
    const impactBg =
      item.score < 35
        ? C.redLight
        : item.score < 55
          ? C.amberLight
          : C.greenLight;
    const action =
      item.score < 35
        ? `Ajustement urgent recommandé — ce critère exclut mécaniquement ${Math.round((100 - item.score) / 10)} profils sur 10.`
        : item.score < 55
          ? `Optimisation possible — un relâchement ciblé de 10–15 % débloque des opportunités significatives.`
          : `Critère bien positionné — aucune action nécessaire.`;

    // Rang
    rounded_fill(doc, ML, y + 2, 18, 18, 9, C.violetLight);
    doc
      .save()
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(C.violet)
      .text(String(i + 1), ML, y + 7, { width: 18, align: "center" })
      .restore();

    // Nom critère
    doc
      .save()
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(C.ink)
      .text(`${CRIT_LABELS[item.k]} — ${item.score} %`, ML + 25, y + 4)
      .restore();
    badge(doc, PAGE_W - MR - 90, y + 2, impact, impactBg, impactCol);

    y += 18;
    doc
      .save()
      .fontSize(8)
      .font("Helvetica")
      .fillColor(C.gray600)
      .text(action, ML + 25, y, { width: CW - 25 - 100, lineGap: 2 })
      .restore();
    y += 20;
    hline(doc, y - 4, ML + 25, PAGE_W - MR, C.gray100, 0.4);
  });

  y += 10;
  const finalText =
    aiContent?.recommendations ??
    `Commencez par ajuster le critère le moins performant, mesurez l'impact sur le nombre de profils compatibles, puis itérez. L'objectif est d'atteindre un score global de 70/100 ou plus pour entrer dans la zone de haute probabilité de concrétisation.`;
  text_block(doc, y, finalText, "Stratégie d'optimisation séquentielle");

  doc.end();
}
