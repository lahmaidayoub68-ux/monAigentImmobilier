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
    "une représentation 3D interactive dont les objets et relations correspondent exactement au sujet demandé (type scene3d)",
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

export const builtInIllustration = () => null;

const MARK = /\[\[\s*AIGENT[\s_-]?DATA\s*\]\]/i;
const MARK_END = /\[\[\s*\/\s*AIGENT[\s_-]?DATA\s*\]\]/i;
const LEFTOVER =
  /\[\[\s*\/?\s*AIGENT[\s_-]?DATA\s*\]\]|\[object (?:Text|Object|Undefined|Node)\]/gi;
const isPlainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

/** Parse les sorties structurées sans laisser le JSON ou les marqueurs dans la réponse affichée. */
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
    if (block)
      try {
        payload = parseJson(block);
      } catch {
        payload = null;
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

const CODE_FILE = {
  js: "script.js",
  javascript: "script.js",
  jsx: "App.jsx",
  ts: "index.ts",
  typescript: "index.ts",
  tsx: "App.tsx",
  py: "script.py",
  python: "script.py",
  html: "index.html",
  css: "styles.css",
  sql: "query.sql",
  bash: "script.sh",
  sh: "script.sh",
  shell: "script.sh",
  json: "data.json",
  java: "Main.java",
  c: "main.c",
  cpp: "main.cpp",
  go: "main.go",
  rust: "main.rs",
  php: "index.php",
  yaml: "config.yaml",
  yml: "config.yml",
};
/** Extrait les gros blocs de code d'une réponse : ils vont dans le panneau droit, pas dans le fil. */
export function extractCodeArtifact(answer, message = "") {
  const files = [],
    used = new Set();
  const text = String(answer || "")
    .replace(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g, (whole, lang, body) => {
      const content = body.replace(/\s+$/, ""),
        l = String(lang || "").toLowerCase();
      if (
        content.split("\n").length < 6 ||
        ["text", "txt", "markdown", "md", "ascii", "mermaid"].includes(l)
      )
        return whole;
      const hint =
        /^(?:\/\/|#|<!--|--)\s*(?:file(?:name)?|fichier)\s*:\s*([\w./-]+)/i.exec(
          content.split("\n")[0],
        );
      let path = hint?.[1] || CODE_FILE[l] || `fichier.${l || "txt"}`;
      while (used.has(path))
        path = path.replace(
          /(\.[^./]+)?$/,
          (e) => `-${used.size + 1}${e || ""}`,
        );
      used.add(path);
      files.push({ path, lang: l, content });
      return `\n\n> Fichier **${path}** : voir le panneau de droite.\n\n`;
    })
    .trim();
  if (!files.length) return null;
  const title = `Code : ${String(message).replace(/\s+/g, " ").trim().slice(0, 52) || files[0].path}`;
  return {
    text,
    artifact: {
      type: "code",
      title,
      summary: `${files.length} fichier${files.length > 1 ? "s" : ""} · ${files.reduce((s, f) => s + f.content.split("\n").length, 0)} lignes`,
      files,
    },
  };
}
