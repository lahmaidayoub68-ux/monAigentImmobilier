/* ═══ AiGENT — intentions, illustrations de secours, normalisation des sorties du Chat ═══
   Importé par server-aigent.js. Aucune dépendance externe, aucun secret. */
import { isDeliverableRequest } from "./aigentArtifactServer.js";

/** Bordures de mots compatibles avec les accents (\b d'ASCII casse sur « é »). */
const word = (src) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`, "iu");
const norm = (message) =>
  String(message ?? "")
    .toLocaleLowerCase("fr")
    .replace(/[’`]/g, "'");

const RE = {
  threeD: word(
    "3\\s?d|trois dimensions|3 dimensions|en perspective|immersi(?:f|ve)",
  ),
  space: word(
    "espace[- ]?temps|courbure(?: de l'espace)?|trou noir|relativit[eé] g[eé]n[eé]rale|g[eé]od[eé]siques?",
  ),
  visual: word(
    "montre\\w*|visualis\\w*|repr[eé]sent\\w*|sch[eé]ma\\w*|dessin\\w*|illustr\\w*|affich\\w*|mod[eé]lis\\w*",
  ),
  fnForm: /(?<![\p{L}])[fghuv]\s*\(\s*[xt]\s*\)\s*=/iu,
  fnWord: word(
    "fonctions?|parabole|hyperbole|sinuso[iï]de|exponentielle|logarithme|trin[oô]me|polyn[oô]me|[eé]quation du second degr[eé]|droite \\(?[a-z]{2}\\)?|vecteurs?|rep[eè]re",
  ),
  graphVerb:
    /(trac|courbe|graph|repr[eé]sent|dessin|visualis|montre|affich|rep[eè]re)/i,
  timeline: word("frises?|chronologi\\w*|timeline|ligne du temps"),
  probtree: word(
    "arbres? (?:de |des )?(?:probabilit[eé]s?|pond[eé]r[eé]s?)|diagramme en arbre",
  ),
  sheet: word("tableur|excel|feuille de calcul|spreadsheet|classeur"),
  table: word("tableaux?|table|csv"),
  chart: word(
    "graphiques?|graphes?|histogramme|camembert|diagramme (?:en barres|circulaire|de dispersion)|visualisation de donn[eé]es",
  ),
  diagram: word(
    "sch[eé]mas?|organigramme|carte mentale|mind.?map|workflow|logigramme|flowchart|diagramme",
  ),
  presentation: word("pr[eé]sentation|diaporama|slides?|powerpoint|pitch deck"),
  decision: word("d[eé]cision|matrice de choix|scoring|classement d'options"),
  plan: word(
    "plan d'action|planning|feuille de route|roadmap|planifi\\w*|checklist|liste de contr[oô]le",
  ),
  document: word(
    "document|rapport|compte[- ]rendu|synth[eè]se|fiche(?: pratique| de r[eé]vision)?|note de cadrage|brief|proc[eé]dure|cours (?:complet|approfondi)|mini-cours|corrig[eé]|dossier",
  ),
};

/** Libellés injectés dans la 2ᵉ passe de génération (server-aigent.js). */
export const ARTIFACT_EXPECTATIONS = {
  fonction:
    "un repère mathématique interactif (type plot : courbes, points, droites, vecteurs), en laissant le moteur calculer racines, sommet et intersections",
  frise:
    "une frise chronologique (type timeline) avec dates, libellés et détails",
  arbre:
    "un arbre de probabilités (type probtree) dont les branches portent leurs probabilités",
  tableur: "un tableur (type sheet) avec colonnes, lignes et formules utiles",
  "scène 3D":
    "une scène 3D interactive de la courbure de l'espace-temps (type scene3d, preset spacetime)",
};

export function detectChatArtifactRequest(message) {
  const t = norm(message);
  if (!t.trim()) return "";
  const space = RE.space.test(t);
  if (RE.threeD.test(t)) return space ? "scène 3D" : "schéma 3D";
  if (space && RE.visual.test(t)) return "scène 3D";
  if (RE.fnForm.test(t) || (RE.fnWord.test(t) && RE.graphVerb.test(t)))
    return "fonction";
  if (RE.timeline.test(t)) return "frise";
  if (RE.probtree.test(t)) return "arbre";
  if (RE.sheet.test(t))
    return RE.chart.test(t) ? "tableau et graphique" : "tableur";
  const table = RE.table.test(t),
    chart = RE.chart.test(t);
  if (table && chart) return "tableau et graphique";
  if (table) return "tableau";
  if (chart) return "graphique";
  if (RE.diagram.test(t)) return "schéma ou carte";
  if (RE.presentation.test(t)) return "présentation";
  if (RE.decision.test(t)) return "décision";
  if (RE.plan.test(t)) return "plan";
  if (RE.document.test(t)) return "document";
  return "";
}

/** Une seule règle pour le panneau droit : celle du serveur. */
export function shouldOpenArtifactPanel(message, mode = "think") {
  return isDeliverableRequest(message, mode);
}

const FLUID =
  /(?:fluid|fluide|écoulement|ecoulement|viscosit|hydrodynam|hydraulique|aérodynam|aerodynam|bernoulli|navier.?stokes|couche limite)/i;
const SPACETIME =
  /(?:espace[- ]?temps|courbure de l|relativit[eé] g[eé]n[eé]rale|trou noir)/i;

/** Figures de secours déterministes, uniquement pour des sujets maîtrisés. */
export function builtInIllustration(message) {
  const text = String(message || "");
  if (SPACETIME.test(text))
    return {
      type: "scene3d",
      title: "Courbure de l'espace-temps",
      summary:
        "Une masse déforme la grille d'espace-temps : l'orbite et le rayon lumineux suivent des géodésiques. Les valeurs sont illustratives.",
      preset: "spacetime",
      params: {
        mass: 1.2,
        curvature: 1,
        extent: 12,
        lines: 26,
        orbit: true,
        light: true,
      },
    };
  if (!FLUID.test(text)) return null;
  return {
    type: "doc",
    title: "Repères visuels — mécanique des fluides",
    summary:
      "Conservation, pression et effets visqueux en trois vues complémentaires. Les seuils de Reynolds sont des repères usuels en conduite circulaire.",
    sections: [
      {
        id: "venturi",
        title: "Effet Venturi : vitesse et pression",
        level: 2,
        blocks: [
          {
            type: "text",
            md: "À hauteur égale, un rétrécissement **accélère** l'écoulement et **abaisse** la pression statique.",
          },
          {
            type: "formula",
            tex: "S_1 v_1 = S_2 v_2",
            label: "Conservation du débit",
          },
          {
            type: "formula",
            tex: "P + \\tfrac{1}{2}\\rho v^2 = \\text{cte}",
            label: "Bernoulli (horizontal, fluide parfait)",
          },
          {
            type: "artifact",
            artifact: {
              type: "diagram",
              variant: "venturi",
              title: "Venturi · vitesse et pression",
              nodes: [],
              edges: [],
            },
          },
        ],
      },
      {
        id: "regimes",
        title: "Régimes en conduite",
        level: 2,
        blocks: [
          {
            type: "formula",
            tex: "Re = \\dfrac{\\rho\\, v\\, D}{\\mu}",
            label: "Nombre de Reynolds",
          },
          {
            type: "table",
            title: "Repères de Reynolds · conduite circulaire lisse",
            columns: ["Reynolds", "Régime", "Lecture physique"],
            rows: [
              [
                "Re < 2 300",
                "Laminaire",
                "Viscosité dominante · mouvement ordonné",
              ],
              ["2 300–4 000", "Transition", "Sensibilité aux perturbations"],
              ["Re > 4 000", "Turbulent", "Fluctuations et mélange accrus"],
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "À retenir",
            md: "Ces seuils dépendent des conditions d'entrée et de la rugosité : ce sont des ordres de grandeur.",
          },
        ],
      },
      {
        id: "couche-limite",
        title: "Couche limite et profil de vitesse",
        level: 2,
        blocks: [
          {
            type: "text",
            md: "Au contact de la paroi, $u = 0$ ; la vitesse rejoint celle du fluide extérieur sur une épaisseur $\\delta$.",
          },
          {
            type: "artifact",
            artifact: {
              type: "diagram",
              variant: "boundary-layer",
              title: "Couche limite · profil de vitesse",
              nodes: [],
              edges: [],
            },
          },
          {
            type: "artifact",
            caption:
              "Profil laminaire schématique (parabolique), pédagogique et non issu d'une mesure.",
            artifact: {
              type: "plot",
              title: "Profil laminaire schématique",
              xLabel: "Distance à la paroi y/δ",
              yLabel: "Vitesse u/U∞",
              domain: { x: [0, 1.05], y: [0, 1.1] },
              functions: [
                { id: "u", expr: "2*x-x^2", label: "u/U∞", domain: [0, 1] },
              ],
              auto: {
                roots: false,
                extrema: false,
                yIntercept: false,
                intersections: false,
              },
            },
          },
        ],
      },
    ],
  };
}

const MARK = /\[\[\s*AIGENT[\s_-]?DATA\s*\]\]/i;
const MARK_END = /\[\[\s*\/\s*AIGENT[\s_-]?DATA\s*\]\]/i;
const LEFTOVER =
  /\[\[\s*\/?\s*AIGENT[\s_-]?DATA\s*\]\]|\[object (?:Text|Object|Undefined|Node)\]/gi;
const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Normalise la sortie d'un fournisseur : un JSON mal formé ne s'affiche jamais tel quel. */
export function normalizeChatOutput(raw, parseJson) {
  const text = String(raw ?? "").trim();
  if (!text) return { reply: "", payload: null };

  const open = MARK.exec(text);
  if (open) {
    const after = text.slice(open.index + open[0].length);
    const close = MARK_END.exec(after);
    const block = (close ? after.slice(0, close.index) : after).trim();
    const reply = (
      text.slice(0, open.index) +
      (close ? after.slice(close.index + close[0].length) : "")
    )
      .replace(LEFTOVER, "")
      .trim();
    let payload = null;
    if (block) {
      try {
        payload = parseJson(block);
      } catch {
        payload = null;
      }
    }
    if (isPlainObject(payload))
      return {
        reply: String(payload.reply ?? reply)
          .replace(LEFTOVER, "")
          .trim(),
        payload,
      };
    return { reply, payload: null };
  }

  let payload = null;
  try {
    payload = parseJson(text);
  } catch {
    payload = null;
  }
  if (isPlainObject(payload))
    return {
      reply: String(payload.reply ?? "")
        .replace(LEFTOVER, "")
        .trim(),
      payload,
    };

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(LEFTOVER, "")
    .trim();
  if (/^(?:\{|\[)/.test(cleaned)) return { reply: "", payload: null };
  return { reply: cleaned, payload: null };
}
