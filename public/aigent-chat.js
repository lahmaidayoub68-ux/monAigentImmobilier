// APRÈS
import {
  mountArtifact,
  isEngineArtifact,
  disposeDetached,
  sanitizeText,
  extractLeakedArtifacts,
  toArtifact,
  isFormulaLine,
  looksAsciiChart,
  loadKatex,
} from "./artifacts/aigent-artifacts.js";
const TOKEN_KEY = "aigent_token";
const LOGIN_PAGE = "./aigent-login.html";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const modes = [
  {
    id: "think",
    label: "Think",
    hint: "Structurer une idée et explorer les angles utiles.",
    icon: "i-spark",
  },
  {
    id: "advisor",
    label: "Advisor",
    hint: "Obtenir un avis argumenté et ses points de doute.",
    icon: "i-spark",
  },
  {
    id: "decide",
    label: "Decide",
    hint: "Comparer les options avec des critères explicites.",
    icon: "i-grid",
  },
  {
    id: "debate",
    label: "Debate",
    hint: "Construire le meilleur argument pour et contre.",
    icon: "i-more",
  },
  {
    id: "perspectives",
    label: "Perspectives",
    hint: "Changer de point de vue pour voir les angles morts.",
    icon: "i-home",
  },
  {
    id: "create",
    label: "Create",
    hint: "Transformer vos idées en livrable concret.",
    icon: "i-file",
  },
];
const state = {
  account: null,
  conversations: [],
  conversationId: null,
  conversation: null,
  messages: [],
  mode: "think",
  effort: "standard",
  busy: false,
  artifact: null,
  artifactMessageId: null,
  artifactView: "main",
  artifactEditDraft: null,
  panelOpen: false,
  toastTimer: 0,
};
const icon = (name) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${name}`);
  svg.append(use);
  return svg;
};
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const drawAgentMark = () => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 40 32");
  svg.setAttribute("class", "mark-draw");
  svg.setAttribute("aria-hidden", "true");
  [
    "M20.6 11.1L23.9 14.4Q25.5 16 23.9 17.6L17.1 24.4Q15.5 26 13.9 24.4L7.1 17.6Q5.5 16 7.1 14.4L13.9 7.6Q15.5 6 17.1 7.6L18.9 9.4",
    "M18.9 20.9L15.6 17.6Q14 16 15.6 14.4L22.4 7.6Q24 6 25.6 7.6L32.4 14.4Q34 16 32.4 17.6L25.6 24.4Q24 26 22.4 24.4L20.6 22.6",
  ].forEach((d) => {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("pathLength", "1");
    svg.append(path);
  });
  return svg;
};
const token = () => localStorage.getItem(TOKEN_KEY);

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if ([401, 403].includes(response.status)) {
    localStorage.removeItem(TOKEN_KEY);
    location.href = LOGIN_PAGE;
    throw new Error("Session expirée");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "La demande n’a pas abouti.");
  return data;
}
function toast(message) {
  const node = $("#chatToast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 2800);
}
function avatarLetters() {
  return (state.account?.username || "A").trim().slice(0, 2).toUpperCase();
}
function setMode(mode) {
  if (!modes.some((item) => item.id === mode)) return;
  state.mode = mode;
  $$(".thinking-mode").forEach((button) =>
    button.setAttribute("aria-selected", String(button.dataset.mode === mode)),
  );
  $("#modeHint").textContent =
    modes.find((item) => item.id === mode)?.hint || "";
  setConversationHeading();
}

function renderModeBar() {
  const bar = $("#modeBar");
  bar.replaceChildren();
  modes.forEach((mode) => {
    const button = el("button", "thinking-mode");
    button.type = "button";
    button.dataset.mode = mode.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(state.mode === mode.id));
    button.append(icon(mode.icon), document.createTextNode(mode.label));
    button.addEventListener("click", () => {
      if (state.mode !== mode.id && state.messages.length && !state.busy)
        clearConversation();
      setMode(mode.id);
    });
    bar.append(button);
  });
  setMode(state.mode);
}

function renderConversations() {
  const list = $("#conversationList");
  list.replaceChildren();
  if (!state.conversations.length) {
    list.append(
      el("p", "conversation-empty", "Vos échanges apparaîtront ici."),
    );
    return;
  }
  for (const conversation of state.conversations) {
    const row = el(
      "div",
      `conversation-item${conversation.id === state.conversationId ? " is-active" : ""}`,
    );
    const open = el("button", "conversation-open", conversation.title);
    open.type = "button";
    open.dataset.tooltip = conversation.title;
    open.setAttribute("aria-label", conversation.title);
    const placeTitleTip = () => {
      const rect = open.getBoundingClientRect();
      open.style.setProperty(
        "--tooltip-left",
        `${Math.max(12, Math.min(rect.left, window.innerWidth - 336))}px`,
      );
      open.style.setProperty(
        "--tooltip-top",
        `${Math.max(8, Math.min(rect.bottom + 7, window.innerHeight - 68))}px`,
      );
    };
    open.addEventListener("mouseenter", placeTitleTip);
    open.addEventListener("focus", placeTitleTip);
    open.addEventListener("click", () => loadConversation(conversation.id));
    const remove = el("button", "conversation-delete");
    remove.type = "button";
    remove.title = "Supprimer la conversation";
    remove.setAttribute("aria-label", `Supprimer ${conversation.title}`);
    remove.append(icon("i-close"));
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteConversation(conversation);
    });
    row.append(open, remove);
    list.append(row);
  }
}
function setConversationHeading() {
  $("#conversationTitle").textContent =
    state.conversation?.title || "Nouvelle conversation";
  $("#conversationSubtitle").textContent =
    `${modes.find((item) => item.id === state.mode)?.label || "Think"} · Thinking Room`;
}
function renderWelcome() {
  $("#chatWelcome").hidden = state.messages.length > 0;
  $("#chatMessages").replaceChildren();
}
function messageTime(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.valueOf())
    ? ""
    : date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function renderMessage(message) {
  const article = el("article", `chat-message ${message.role}`);
  article.dataset.messageId = message.id || "";
  const badge = el("span", "chat-message-avatar");
  if (message.role === "user") badge.textContent = avatarLetters();
  else {
    const logo = el("img", "chat-brand-mark");
    logo.src = "./images/aigent.ico";
    logo.alt = "AiGENT";
    badge.append(logo);
  }
  const main = el("div", "chat-message-main");
  const meta = el("div", "chat-message-meta");
  meta.append(
    el(
      "strong",
      null,
      message.role === "user" ? state.account?.username || "Vous" : "AiGENT",
    ),
    document.createTextNode(messageTime(message.created_at)),
  );
  const leak =
    message.role === "assistant"
      ? extractLeakedArtifacts(message.content)
      : { text: message.content, found: [] };
  const artifact =
    message.role === "assistant"
      ? message.artifact || toArtifact(leak.found[0])
      : null;
  if (artifact && !message.artifact) message.artifact = artifact; // conservé pour « Voir en grand »
  const content = el("div", "chat-message-text");
  renderMarkdown(content, leak.text);
  main.append(meta, content);
  if (artifact) {
    const preview = el("section", "chat-inline-artifact");
    preview.append(
      el(
        "div",
        "chat-inline-artifact-heading",
        artifact.title || "Illustration",
      ),
    );
    if (artifact.summary)
      preview.append(el("p", "artifact-summary", artifact.summary));
    // APRÈS
    renderArtifactMain(artifact, preview, {
      inline: true,
      messageId: message.id,
    });
    if (!isEngineArtifact(artifact)) {
      const enlarge = el("button", "chat-artifact-expand", "Voir en grand");
      enlarge.type = "button";
      enlarge.addEventListener("click", () => {
        state.artifact = artifact;
        state.artifactMessageId = message.id;
        state.artifactView = "main";
        showArtifact();
      });
      preview.append(enlarge);
    }
    main.append(preview);
  }
  const copy = el("button", "message-copy");
  copy.type = "button";
  copy.setAttribute(
    "aria-label",
    message.role === "user" ? "Copier votre message" : "Copier la réponse",
  );
  const copySvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  copySvg.setAttribute("viewBox", "0 0 24 24");
  copySvg.setAttribute("aria-hidden", "true");
  const copyPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  copyPath.setAttribute(
    "d",
    "M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16M5.5 8h9A1.5 1.5 0 0 1 16 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5v-9A1.5 1.5 0 0 1 5.5 8Z",
  );
  copySvg.append(copyPath);
  copy.append(copySvg);
  copy.addEventListener("click", () => copyText(cleanMarkdown(leak.text)));
  main.append(copy);
  const suggestions =
    message.role === "assistant"
      ? message.suggestions || (message.suggestion ? [message.suggestion] : [])
      : [];
  if (suggestions.length) {
    const group = el("div", "message-suggestions");
    suggestions.slice(0, 3).forEach((text) => {
      const action = el("button", "message-suggestion", text);
      action.type = "button";
      action.addEventListener("click", () => sendMessage(text));
      group.append(action);
    });
    main.append(group);
  }
  if (
    message.role === "assistant" &&
    message.recommendedMode &&
    message.recommendedMode !== message.mode &&
    modes.some((mode) => mode.id === message.recommendedMode)
  ) {
    const mode = modes.find((item) => item.id === message.recommendedMode);
    const action = el(
      "button",
      "message-suggestion",
      `Poursuivre en mode ${mode.label}`,
    );
    action.type = "button";
    action.addEventListener("click", () => setMode(mode.id));
    main.append(action);
  }
  article.append(badge, main);
  $("#chatMessages").append(article);
}
function cleanMarkdown(value) {
  const t = String(value || "")
    .replace(/\\([#*|<>])/g, "$1")
    .replace(/\\?&lt;br\s*\/?&gt;/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, f) => `$${f.trim()}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, f) => `\n$$\n${f.trim()}\n$$\n`);
  return sanitizeText(t).trim();
}
function readableMath(source) {
  let value = String(source || "").replace(
    /\\(?:left|right|displaystyle|mathrm|mathbf)\b/g,
    "",
  );
  for (let pass = 0; pass < 5; pass += 1)
    value = value
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1⁄$2")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  const symbols = {
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    epsilon: "ε",
    theta: "θ",
    lambda: "λ",
    mu: "μ",
    rho: "ρ",
    sigma: "σ",
    tau: "τ",
    phi: "φ",
    omega: "ω",
    Delta: "Δ",
    Gamma: "Γ",
    Lambda: "Λ",
    Sigma: "Σ",
    Omega: "Ω",
    partial: "∂",
    nabla: "∇",
    cdot: "·",
    times: "×",
    pm: "±",
    infty: "∞",
    approx: "≈",
    neq: "≠",
    leq: "≤",
    geq: "≥",
    to: "→",
    rightarrow: "→",
    text: "",
  };
  value = value.replace(
    /\\([A-Za-z]+)(?:\{([^{}]*)\})?/g,
    (whole, command, text) =>
      command === "text" ? text || "" : (symbols[command] ?? whole),
  );
  value = value
    .replace(/\\vec\s*\{?([A-Za-z])\}?/g, "$1⃗")
    .replace(
      /([A-Za-zρμτvP])_\{?([A-Za-z0-9+-]+)\}?/g,
      (_, base, sub) =>
        `${base}${[...sub].map((c) => ({ 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "⁺", "-": "₋", i: "ᵢ", n: "ₙ" })[c] || c).join("")}`,
    )
    .replace(
      /([A-Za-z0-9])\^\{?([0-9+-]+)\}?/g,
      (_, base, sup) =>
        `${base}${[...sup].map((c) => ({ 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻" })[c] || c).join("")}`,
    );
  return value
    .replace(/[{}]/g, "")
    .replace(/\\[,;!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const MATH_NS = "http://www.w3.org/1998/Math/MathML";
const MATH_COMMANDS = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ϵ",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  varsigma: "ς",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "ϕ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  neq: "≠",
  ne: "≠",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  approx: "≈",
  equiv: "≡",
  propto: "∝",
  pm: "±",
  mp: "∓",
  times: "×",
  cdot: "·",
  ast: "∗",
  div: "÷",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  implies: "⇒",
  mapsto: "↦",
  infty: "∞",
  degree: "°",
  sum: "∑",
  prod: "∏",
  int: "∫",
  iint: "∬",
  iiint: "∭",
  oint: "∮",
  partial: "∂",
  nabla: "∇",
  forall: "∀",
  exists: "∃",
  neg: "¬",
  land: "∧",
  lor: "∨",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  parallel: "∥",
  perp: "⊥",
  angle: "∠",
  ell: "ℓ",
  hbar: "ℏ",
  Re: "ℜ",
  Im: "ℑ",
  ldots: "…",
  cdots: "⋯",
  quad: " ",
  qquad: " ",
  mathbb: { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ" },
};
function mathElement(tag, children = []) {
  const node = document.createElementNS(MATH_NS, tag);
  children.forEach((child) => node.append(child));
  return node;
}
function renderMathML(source, block = false) {
  const input = String(source || "")
    .replace(/\\(?:left|right|displaystyle|limits|quad|qquad)\b/g, " ")
    .replace(/\\[,;!:]/g, " ")
    .trim();
  let i = 0;
  const textNode = (value) => document.createTextNode(value);
  const readGroup = () => {
    while (/\s/.test(input[i] || "")) i++;
    if (input[i] !== "{") {
      const atom = readAtom();
      return [typeof atom === "string" ? textNode(atom) : atom];
    }
    i++;
    const nodes = [];
    while (i < input.length && input[i] !== "}")
      nodes.push(...readSequence("}"));
    if (input[i] === "}") i++;
    return nodes;
  };
  const readAtom = () => {
    if (input[i] === "\\") {
      i++;
      const match = /^[A-Za-z]+/.exec(input.slice(i));
      if (!match) return input[i++] || "";
      const command = match[0];
      i += command.length;
      if (command === "frac" || command === "dfrac" || command === "tfrac")
        return mathElement("mfrac", [
          mathElement("mrow", readGroup()),
          mathElement("mrow", readGroup()),
        ]);
      if (command === "sqrt") {
        while (/\s/.test(input[i] || "")) i++;
        if (input[i] === "[") {
          i++;
          const start = i;
          while (i < input.length && input[i] !== "]") i++;
          const index = input.slice(start, i);
          if (input[i] === "]") i++;
          return mathElement("mroot", [
            mathElement("mrow", readGroup()),
            mathElement("mn", [textNode(index)]),
          ]);
        }
        return mathElement("msqrt", [mathElement("mrow", readGroup())]);
      }
      if (
        [
          "text",
          "mathrm",
          "mathbf",
          "mathit",
          "operatorname",
          "mathsf",
          "mathtt",
          "mathcal",
          "mathbb",
        ].includes(command)
      ) {
        const content = readGroup();
        if (command === "mathbb") {
          const t = content.map((n) => n.textContent).join("");
          return mathElement("mi", [textNode(MATH_COMMANDS.mathbb[t] || t)]);
        }
        const tag =
          command === "text" || command === "operatorname" ? "mtext" : "mi";
        const node = mathElement(tag, content);
        if (command === "mathbf") node.setAttribute("mathvariant", "bold");
        if (command === "mathrm") node.setAttribute("mathvariant", "normal");
        return node;
      }
      const value = MATH_COMMANDS[command];
      if (
        ["vec", "overline", "bar", "hat", "tilde", "dot", "ddot"].includes(
          command,
        )
      ) {
        const body = mathElement("mrow", readGroup());
        const accent = {
          vec: "→",
          overline: "¯",
          bar: "¯",
          hat: "^",
          tilde: "~",
          dot: "˙",
          ddot: "¨",
        }[command];
        return mathElement("mover", [
          body,
          mathElement("mo", [textNode(accent)]),
        ]);
      }
      if (
        [
          "sin",
          "cos",
          "tan",
          "ln",
          "log",
          "exp",
          "lim",
          "max",
          "min",
          "det",
          "dim",
          "Pr",
        ].includes(command)
      )
        return mathElement("mi", [textNode(command)]);
      return textNode(typeof value === "string" ? value : `\\${command}`);
    }
    if (input[i] === "{") return mathElement("mrow", readGroup());
    if (input[i] === "(") {
      i++;
      const inner = readSequence(")");
      if (input[i] === ")") i++;
      return mathElement("mrow", [textNode("("), ...inner, textNode(")")]);
    }
    if (input[i] === "[") {
      i++;
      const inner = readSequence("]");
      if (input[i] === "]") i++;
      return mathElement("mrow", [textNode("["), ...inner, textNode("]")]);
    }
    const char = input[i++];
    return textNode(
      { "≤": "≤", "≥": "≥", "≠": "≠", "∞": "∞", "∫": "∫", "∑": "∑" }[char] ||
        char,
    );
  };
  const readSequence = (stop = "") => {
    const nodes = [];
    while (i < input.length && input[i] !== stop) {
      if (/\s/.test(input[i])) {
        i++;
        continue;
      }
      let atom = readAtom();
      let sub = null,
        sup = null;
      while (input[i] === "_" || input[i] === "^") {
        const kind = input[i++],
          value = mathElement("mrow", readGroup());
        if (kind === "_") sub = value;
        else sup = value;
      }
      if (sub && sup) atom = mathElement("msubsup", [atom, sub, sup]);
      else if (sub) atom = mathElement("msub", [atom, sub]);
      else if (sup) atom = mathElement("msup", [atom, sup]);
      nodes.push(atom);
    }
    return nodes;
  };
  const math = mathElement("math", [mathElement("mrow", readSequence())]);
  math.setAttribute("xmlns", MATH_NS);
  math.setAttribute("aria-label", String(source));
  if (block) math.setAttribute("display", "block");
  const span = document.createElement(block ? "div" : "span");
  span.className = block ? "chat-math-block" : "chat-inline-math";
  span.append(math);
  return span;
}

function renderMath(source, block = false) {
  const fallback = renderMathML(source, block); // rendu immédiat (repli)
  loadKatex()
    .then((mod) => {
      // puis upgrade KaTeX
      const katex = mod.default || mod;
      try {
        const out = el(
          block ? "div" : "span",
          block ? "chat-math-block katex-host" : "chat-inline-math katex-host",
        );
        katex.render(String(source).trim(), out, {
          displayMode: block,
          throwOnError: true,
          strict: "ignore",
          trust: false,
        });
        fallback.replaceWith(out);
      } catch {
        /* on garde le repli MathML */
      }
    })
    .catch(() => {});
  return fallback;
}
function appendInline(parent, value) {
  const pattern =
    /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|(?<![\w$])_[^_\n]+_(?![\w])|`[^`]+`|\$\$[^$]+\$\$|\$(?![\s$])[^$\n]+?(?<![\s$])\$|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor)
      parent.append(document.createTextNode(value.slice(cursor, match.index)));
    const token = match[0];
    let node;
    if (token.startsWith("**") || token.startsWith("__")) {
      node = el("strong");
      appendInline(node, token.slice(2, -2));
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      node = el("em");
      appendInline(node, token.slice(1, -1));
    } else if (token.startsWith("`"))
      node = el("code", "chat-inline-code", token.slice(1, -1));
    else if (token.startsWith("$"))
      node = renderMath(
        token.replace(/^\$\$?|\$\$?$/g, ""),
        token.startsWith("$$"),
      );
    else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      node = el("a", "chat-link", link[1]);
      node.href = link[2];
      node.target = "_blank";
      node.rel = "noopener noreferrer";
    }
    parent.append(node);
    cursor = match.index + token.length;
  }
  if (cursor < value.length)
    parent.append(document.createTextNode(value.slice(cursor)));
}

function codeBlock(source, lang = "") {
  const wrap = el("figure", "chat-code"),
    bar = el("figcaption", "chat-code-bar"),
    pre = el("pre", "chat-code-block");
  const copy = el("button", "chat-code-copy", "Copier");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    await copyText(source);
    copy.textContent = "Copié";
    setTimeout(() => {
      copy.textContent = "Copier";
    }, 1400);
  });
  bar.append(el("span", null, lang || "code"), copy);
  pre.append(el("code", null, source));
  wrap.append(bar, pre);
  return wrap;
}
function exportConversation() {
  if (!state.messages.length) {
    toast("Aucune conversation à exporter.");
    return;
  }
  const title = state.conversation?.title || "Conversation AiGENT";
  const md = [
    `# ${title}`,
    ...state.messages.map(
      (m) =>
        `## ${m.role === "user" ? "Vous" : "AiGENT"}\n\n${extractLeakedArtifacts(m.content).text}${m.artifact ? `\n\n> Figure : ${m.artifact.title}` : ""}`,
    ),
  ].join("\n\n");
  downloadFile(`${slug(title)}.md`, md, "text/markdown;charset=utf-8");
}
function renderMarkdown(root, source) {
  // APRÈS
  const lines = cleanMarkdown(source).split(/\r?\n/);
  let paragraph = [],
    list = null,
    code = [],
    inCode = false,
    index = 0,
    lang = "";
  const flushParagraph = () => {
    if (paragraph.length) {
      const p = el("p", "chat-paragraph");
      appendInline(p, paragraph.join(" "));
      root.append(p);
      paragraph = [];
    }
  };
  const flushList = () => {
    list = null;
  };
  for (; index < lines.length; index += 1) {
    const raw = lines[index],
      line = raw.trim();
    // APRÈS
    if (/^```/.test(line)) {
      flushParagraph();
      flushList();
      if (inCode) {
        if (!looksAsciiChart(code.join("\n")))
          root.append(codeBlock(code.join("\n"), lang));
        code = [];
      } else
        lang = line
          .replace(/^```\s*/, "")
          .split(/\s+/)[0]
          .toLowerCase();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(raw);
      continue;
    }
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const h = el(`h${Math.min(4, heading[1].length)}`, "chat-heading");
      appendInline(h, heading[2].replace(/\s+#+$/, ""));
      root.append(h);
      continue;
    }
    if (line === "$$") {
      flushParagraph();
      flushList();
      const formula = [];
      while (index + 1 < lines.length && lines[index + 1].trim() !== "$$")
        formula.push(lines[++index]);
      if (index + 1 < lines.length) index++;
      if (formula.length) root.append(renderMath(formula.join(" "), true));
      continue;
    }
    if (/^\$\$.*\$\$$/.test(line)) {
      flushParagraph();
      flushList();
      root.append(renderMath(line.replace(/^\$\$|\$\$$/g, ""), true));
      continue;
    }
    if (isFormulaLine(line)) {
      flushParagraph();
      flushList();
      root.append(renderMath(line.replace(/^\$+|\$+$/g, ""), true));
      continue;
    }
    if (/^<table\b/i.test(line)) {
      flushParagraph();
      flushList();
      const sourceTable = [raw];
      while (
        index + 1 < lines.length &&
        !/<\/table\s*>/i.test(sourceTable.join("\n")) &&
        sourceTable.length < 100
      )
        sourceTable.push(lines[++index]);
      const parsed = new DOMParser().parseFromString(
          sourceTable.join("\n"),
          "text/html",
        ),
        sourceRows = [...parsed.querySelectorAll("table tr")].slice(0, 80);
      if (sourceRows.length) {
        const values = sourceRows.map((row) =>
          [...row.querySelectorAll("th,td")]
            .slice(0, 12)
            .map((cell) => cell.textContent.trim()),
        );
        const width = Math.max(0, ...values.map((row) => row.length));
        const table = el("div", "chat-table-wrap"),
          tableNode = el("table", "chat-markdown-table"),
          head = el("thead"),
          body = el("tbody"),
          first = el("tr");
        (values[0] || []).forEach((cell) => first.append(el("th", null, cell)));
        head.append(first);
        values.slice(1).forEach((cells) => {
          const tr = el("tr");
          for (let i = 0; i < width; i += 1)
            tr.append(el("td", null, cells[i] || ""));
          body.append(tr);
        });
        tableNode.append(head, body);
        table.append(tableNode);
        root.append(table);
      }
      continue;
    }
    if (/^\|.*\|$/.test(line)) {
      flushParagraph();
      flushList();
      const block = [line];
      while (
        index + 1 < lines.length &&
        /^\s*\|.*\|\s*$/.test(lines[index + 1]) &&
        block.length < 32
      )
        block.push(lines[++index].trim());
      const rows = block.map((row) =>
        row
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim()),
      );
      const hasSeparator =
        rows.length > 1 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell));
      const table = el("div", "chat-table-wrap"),
        tableNode = el("table", "chat-markdown-table"),
        head = el("thead"),
        body = el("tbody"),
        tr = el("tr");
      const header = rows.shift();
      header.forEach((cell) => {
        const th = el("th");
        appendInline(th, cell);
        tr.append(th);
      });
      head.append(tr);
      if (hasSeparator) rows.shift();
      rows.forEach((cells) => {
        const row = el("tr");
        header.forEach((_, i) => {
          const td = el("td");
          appendInline(td, cells[i] || "");
          row.append(td);
        });
        body.append(row);
      });
      tableNode.append(head, body);
      table.append(tableNode);
      root.append(table);
      continue;
    }
    const item = /^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/.exec(line);
    if (item) {
      flushParagraph();
      const ordered = /^\d/.test(line);
      if (!list || list.tagName !== (ordered ? "OL" : "UL")) {
        flushList();
        list = el(ordered ? "ol" : "ul", "chat-list");
        root.append(list);
      }
      const li = el("li");
      appendInline(li, item[1]);
      list.append(li);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      const block = el("blockquote", "chat-quote");
      appendInline(block, quote[1]);
      root.append(block);
      continue;
    }
    flushList();
    if (/^(---+|___+|\*\*\*+)$/.test(line)) {
      flushParagraph();
      root.append(el("hr", "chat-divider"));
      continue;
    }
    paragraph.push(line);
  }
  // APRÈS
  flushParagraph();
  if (inCode && !looksAsciiChart(code.join("\n")))
    root.append(codeBlock(code.join("\n"), lang));
}
function scrollMessages() {
  requestAnimationFrame(() => {
    const messages = $("#chatMessages");
    messages.scrollTop = messages.scrollHeight;
  });
}
function showThinking(searching = false) {
  const article = el("article", "chat-message assistant");
  article.id = "thinkingIndicator";
  const badge = el("span", "chat-message-avatar");
  badge.append(drawAgentMark());
  article.append(badge);
  const main = el("div", "chat-message-main");
  const indicator = el(
    "div",
    `thinking-indicator${searching ? " is-searching" : ""}`,
  );
  if (searching) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M10.8 3.5a7.3 7.3 0 1 0 4.57 13l4.1 4.1 1.06-1.06-4.1-4.1a7.3 7.3 0 0 0-5.63-11.94Zm0 1.5a5.8 5.8 0 1 1 0 11.6 5.8 5.8 0 0 1 0-11.6Z",
    );
    svg.append(path);
    indicator.append(svg);
  }
  indicator.append(
    el(
      "span",
      "thinking-shimmer",
      searching
        ? "Recherche sur le web…"
        : state.mode === "decide"
          ? "AiGENT met les options en balance…"
          : state.mode === "create"
            ? "AiGENT prépare un livrable…"
            : "AiGENT organise sa réflexion…",
    ),
  );
  main.append(indicator);
  article.append(main);
  $("#chatMessages").append(article);
  scrollMessages();
  return article;
}

async function refreshConversationList() {
  const data = await api("/api/aigent/chat/conversations");
  state.conversations = data.conversations || [];
  renderConversations();
}
function clearConversation() {
  state.conversationId = null;
  state.conversation = null;
  state.messages = [];
  state.artifact = null;
  state.artifactMessageId = null;
  state.artifactEditDraft = null;
  state.panelOpen = false;
  $("#thinkingLayout").classList.remove("has-space");
  $("#thinkingSpace").hidden = true;
  $("#chatMessages").replaceChildren();
  $("#chatWelcome").hidden = false;
  setConversationHeading();
  renderConversations();
}
async function newConversation() {
  if (state.busy) return;
  clearConversation();
  state.mode = "think";
  setMode("think");
  $("#thinkingInput").focus();
}
async function loadConversation(id) {
  if (state.busy) return;
  try {
    const data = await api(`/api/aigent/chat/conversations/${id}`);
    state.conversationId = data.conversation.id;
    state.conversation = data.conversation;
    state.messages = data.messages || [];
    state.artifact =
      [...state.messages].reverse().find((message) => message.artifact)
        ?.artifact || null;
    state.artifactMessageId =
      [...state.messages].reverse().find((message) => message.artifact)?.id ||
      null;
    state.artifactView = "main";
    state.artifactEditDraft = null;
    state.panelOpen = Boolean(
      state.artifact?.openInPanel && state.artifact?.intent === "deliverable",
    );
    setMode(state.conversation.mode || "think");
    setConversationHeading();
    renderConversations();
    $("#chatMessages").replaceChildren();
    $("#chatWelcome").hidden = state.messages.length > 0;
    state.messages.forEach(renderMessage);
    if (state.panelOpen) showArtifact();
    else hideArtifact();
    scrollMessages();
  } catch (error) {
    toast(error.message);
  }
}
async function deleteConversation(conversation) {
  if (
    !confirm(
      `Supprimer définitivement « ${conversation.title} » et ses livrables ?`,
    )
  )
    return;
  try {
    await api(`/api/aigent/chat/conversations/${conversation.id}`, {
      method: "DELETE",
    });
    state.conversations = state.conversations.filter(
      (item) => item.id !== conversation.id,
    );
    if (state.conversationId === conversation.id) clearConversation();
    renderConversations();
    toast("Conversation supprimée");
  } catch (error) {
    toast(error.message);
  }
}

function renderChatAttachments() {
  const wrap = $("#chatAttachmentList");
  wrap.replaceChildren();
  wrap.hidden = !state.attachments?.length;
  (state.attachments || []).forEach((file, index) => {
    const chip = el("span", "chat-attachment", file.name);
    const remove = el("button", null, "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Retirer ${file.name}`);
    remove.addEventListener("click", () => {
      state.attachments.splice(index, 1);
      renderChatAttachments();
    });
    chip.append(remove);
    wrap.append(chip);
  });
}
function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error(`Lecture impossible : ${file.name}`));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.readAsDataURL(file);
  });
}
function expectsWebSearch(text) {
  return (
    String(text || "").trim().length >= 12 &&
    /\b(aujourd'hui|aujourd’hui|actuellement|en ce moment|cette semaine|ce mois-ci|cette année|dernier(?:e)?s?\s+(?:nouvelles?|actualités?|mises? à jour|résultats?)|récent(?:e)?s?|à jour|en\s+\d{4}|hier|demain|maintenant|qui a gagné|score du|résultat du|prix actuel|météo|actualité|actualités|news|latest|current|today|yesterday|this week|this month|who won|weather|stock price|recherche_web|recherche\s+(?:sur|en)\s+(?:le\s+)?web|cherche\s+(?:sur\s+)?internet|vérifie|confirme|cite|(?:avec|donne|ajoute|fournis)\s+(?:les?\s+)?sources?|sur le web|sur internet|look up|search the web|search online|verify online|je ne sais pas|tu ne sais pas|si tu ne connais pas|je ne connais pas)\b/i.test(
      text,
    )
  );
}
async function sendMessage(text, attachments = []) {
  text = text.trim();
  if (state.busy || (!text && !attachments.length)) return;
  if (!text && attachments.length)
    text = "Analyse les fichiers joints et explique les éléments utiles.";
  const displayText = attachments.length
    ? `${text}\n\nFichiers joints : ${attachments.map((file) => file.name).join(", ")}`
    : text;
  state.busy = true;
  $("#thinkingSend").disabled = true;
  $("#chatWelcome").hidden = true;
  try {
    if (!state.conversationId) {
      const created = await api("/api/aigent/chat/conversations", {
        method: "POST",
        body: { mode: state.mode },
      });
      state.conversation = created.conversation;
      state.conversationId = created.conversation.id;
      setConversationHeading();
    }
    const userMessage = {
      role: "user",
      mode: state.mode,
      content: displayText,
      created_at: new Date().toISOString(),
    };
    state.messages.push(userMessage);
    renderMessage(userMessage);
    scrollMessages();
    const indicator = showThinking(expectsWebSearch(text));
    const result = await api(
      `/api/aigent/chat/conversations/${state.conversationId}/messages`,
      {
        method: "POST",
        body: {
          message: text,
          attachments,
          mode: state.mode,
          effort: $("#effortSelect").value,
        },
      },
    );
    indicator.remove();
    const assistant = {
      ...result.message,
      suggestions:
        result.message?.suggestions ||
        result.suggestions ||
        (result.suggestion ? [result.suggestion] : []),
      recommendedMode: result.recommendedMode,
    };
    state.messages.push(assistant);
    state.conversation = result.conversation || state.conversation;
    renderMessage(assistant);
    if (assistant.artifact) {
      state.artifact = assistant.artifact;
      state.artifactMessageId = assistant.id;
      state.artifactView = "main";
      state.artifactEditDraft = null;
      // APRÈS
      if (assistant.artifact.openInPanel) showArtifact();
      else if (state.panelOpen) renderArtifact();
    }
    if (result.fallback)
      toast(
        "Votre message a été conservé. Réessayez quand un modèle sera disponible.",
      );
    await refreshConversationList();
    setConversationHeading();
    scrollMessages();
  } catch (error) {
    $("#thinkingIndicator")?.remove();
    toast(error.message);
  } finally {
    state.busy = false;
    $("#thinkingSend").disabled = false;
  }
}

function toggleArtifact(open = !state.panelOpen) {
  state.panelOpen = Boolean(open && state.artifact);
  $("#thinkingLayout").classList.toggle("has-space", state.panelOpen);
  $("#thinkingSpace").hidden = !state.panelOpen;
  $("#chatPanelToggle").setAttribute("aria-pressed", String(state.panelOpen));
}
function showArtifact() {
  if (!state.artifact) return;
  toggleArtifact(true);
  renderArtifact();
}
function hideArtifact() {
  toggleArtifact(false);
}
function renderArtifact() {
  const artifact = state.artifact;
  if (!artifact) return;
  disposeDetached();
  $("#artifactTitle").textContent = artifact.title || "Espace de réflexion";
  const tabs = $("#spaceTabs");
  tabs.replaceChildren();
  const options = [
    "main",
    ...(artifact.type === "table" || artifact.type === "chart" ? ["data"] : []),
  ];
  options.forEach((key) => {
    const button = el(
      "button",
      "space-tab",
      key === "main" ? "Vue" : "Données",
    );
    button.type = "button";
    button.setAttribute("aria-selected", String(state.artifactView === key));
    button.addEventListener("click", () => {
      state.artifactView = key;
      renderArtifact();
    });
    tabs.append(button);
  });
  const body = $("#artifactContent");
  body.replaceChildren();
  if (artifact.summary)
    body.append(el("p", "artifact-summary", artifact.summary));
  if (state.artifactEditDraft !== null && artifact.type === "document") {
    const editor = el("textarea", "artifact-editor");
    editor.value = state.artifactEditDraft;
    editor.setAttribute("aria-label", "Contenu du document à modifier");
    editor.addEventListener("input", () => {
      state.artifactEditDraft = editor.value;
    });
    body.append(editor);
  } else if (state.artifactView === "data" && artifact.type === "table")
    renderTable(artifact, body);
  else if (state.artifactView === "data" && artifact.type === "chart")
    renderChartData(artifact, body);
  // APRÈS
  else
    renderArtifactMain(artifact, body, {
      panel: true,
      messageId: state.artifactMessageId,
    });
  const footer = $("#artifactFooter");
  footer.replaceChildren();
  if (artifact.type === "document" && state.artifactEditDraft !== null) {
    footer.append(
      actionButton(
        "Enregistrer les modifications",
        saveArtifactEdit,
        "artifact-save",
      ),
      actionButton("Annuler", () => {
        state.artifactEditDraft = null;
        renderArtifact();
      }),
    );
  } else if (artifact.type === "document")
    footer.append(
      actionButton("Modifier le document", () => {
        state.artifactEditDraft = artifact.body || "";
        renderArtifact();
      }),
    );
  if (artifact.type === "table")
    footer.append(
      actionButton("Exporter CSV", () => downloadCsv(artifact)),
      actionButton("Ouvrir dans Excel", () => downloadTsv(artifact)),
    );
  if (artifact.type === "report") {
    artifact.sections
      ?.filter((section) => section.type === "table")
      .forEach((table) =>
        footer.append(
          actionButton(`Exporter ${table.title || "le tableau"} en CSV`, () =>
            downloadCsv(table),
          ),
        ),
      );
    footer.append(
      actionButton("Télécharger le rapport", () =>
        downloadFile(
          `${slug(artifact.title)}.md`,
          artifactToText(artifact),
          "text/markdown;charset=utf-8",
        ),
      ),
      actionButton("Imprimer / PDF", () => window.print()),
    );
  }
  if (artifact.type === "document")
    footer.append(
      actionButton("Télécharger .md", () =>
        downloadFile(
          `${slug(artifact.title)}.md`,
          artifact.body || "",
          "text/markdown;charset=utf-8",
        ),
      ),
      actionButton("Imprimer / PDF", () => window.print()),
    );
  if (artifact.type === "presentation")
    footer.append(
      actionButton("Télécharger .md", () =>
        downloadFile(
          `${slug(artifact.title)}.md`,
          artifactToText(artifact),
          "text/markdown;charset=utf-8",
        ),
      ),
      actionButton("Imprimer / PDF", () => window.print()),
    );
  if (artifact.type === "plan")
    footer.append(
      actionButton("Copier le plan", () =>
        copyText(
          (artifact.items || [])
            .map(
              (item, index) =>
                `${index + 1}. ${item.title}${item.detail ? ` — ${item.detail}` : ""}`,
            )
            .join("\n"),
        ),
      ),
    );
  // APRÈS
  if (artifact.type === "doc")
    footer.append(
      actionButton("Télécharger .md", () =>
        downloadFile(
          `${slug(artifact.title)}.md`,
          artifactToText(artifact),
          "text/markdown;charset=utf-8",
        ),
      ),
    );
  footer.append(
    actionButton("Copier le livrable", () =>
      copyText(artifactToText(artifact)),
    ),
  );
  footer.append(transformPicker(artifact));
  footer.append(
    actionButton("Continuer dans Work", convertToWork, "artifact-work"),
  );
}
async function saveArtifactEdit() {
  if (!state.artifactMessageId || !state.conversationId) {
    toast("Ce document n’est pas encore enregistré dans une conversation.");
    return;
  }
  const next = { ...state.artifact, body: state.artifactEditDraft };
  try {
    const result = await api(
      `/api/aigent/chat/conversations/${state.conversationId}/messages/${state.artifactMessageId}/artifact`,
      { method: "PATCH", body: { artifact: next } },
    );
    state.artifact = result.artifact;
    const message = state.messages.find(
      (item) => String(item.id) === String(state.artifactMessageId),
    );
    if (message) message.artifact = result.artifact;
    state.artifactEditDraft = null;
    renderArtifact();
    toast("Document mis à jour");
  } catch (error) {
    toast(error.message);
  }
}
function actionButton(label, callback, className = "") {
  const button = el("button", `artifact-action ${className}`.trim(), label);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}
function transformPicker(artifact) {
  const label = el("label", "artifact-transform");
  label.append(el("span", null, "Transformer en"));
  const select = el("select");
  select.append(new Option("Choisir un format…", ""));
  [
    ["table", "Tableau"],
    ["chart", "Graphique"],
    ["document", "Document"],
    ["presentation", "Présentation"],
    ["plan", "Feuille de route"],
    ["decision", "Décision"],
  ].forEach(([value, title]) => select.append(new Option(title, value)));
  select.addEventListener("change", () => {
    const target = select.value;
    select.value = "";
    if (!target || state.busy) return;
    const names = {
      table: "un tableau",
      chart: "un graphique",
      document: "un document exportable",
      presentation: "une présentation",
      plan: "une feuille de route",
      decision: "une matrice de décision",
    };
    sendMessage(
      `Transforme le livrable ci-dessous en ${names[target]}. Conserve les informations exactes, organise le résultat pour qu'il soit directement exploitable, et explique brièvement les choix de structure.\n\nLivrable source (${artifact.title}, ${artifact.type}) :\n${artifactToText(artifact).slice(0, 12000)}`,
    );
  });
  label.append(select);
  return label;
}
// APRÈS
const persistTimers = new Map();
function persistArtifact(messageId, artifact) {
  if (!messageId || !state.conversationId) return;
  clearTimeout(persistTimers.get(messageId));
  persistTimers.set(
    messageId,
    setTimeout(async () => {
      try {
        const result = await api(
          `/api/aigent/chat/conversations/${state.conversationId}/messages/${messageId}/artifact`,
          { method: "PATCH", body: { artifact } },
        );
        const message = state.messages.find(
          (item) => String(item.id) === String(messageId),
        );
        if (message) message.artifact = result.artifact;
        toast("Modifications enregistrées");
      } catch (error) {
        toast(error.message);
      }
    }, 900),
  );
}
/** Contexte commun passé au moteur : rendu Markdown/maths du Chat, repli vers les anciens renderers, sauvegarde. */
function engineCtx(extra = {}) {
  return {
    downloadCsv,
    renderMarkdown,
    renderMath,
    renderLegacy: (a, host) => renderArtifactMain(a, host, { inline: true }),
    openArtifact: (a) => openEngineOverlay(a),
    onChange: extra.messageId
      ? (doc) => persistArtifact(extra.messageId, doc)
      : undefined,
    ...extra,
  };
}
function renderArtifactMain(artifact, root, ctx = {}) {
  if (isEngineArtifact(artifact)) {
    const slot = el("section", "artifact-card artifact-engine");
    root.append(slot);
    mountArtifact(
      artifact,
      slot,
      engineCtx({
        inline: !!ctx.inline,
        panel: !!ctx.panel,
        messageId: ctx.messageId,
        onExpand: () => openEngineOverlay(artifact),
      }),
    );
    return;
  }
  const card = el("section", "artifact-card");
  switch (artifact.type) {
    case "table":
      renderTable(artifact, card);
      break;
    case "mindmap":
      renderMap(artifact, card);
      break;
    case "diagram":
      if (!renderFluidDiagram(artifact, card)) renderMap(artifact, card);
      break;
    case "diagram3d":
      renderIsometricDiagram(artifact, card);
      break;
    case "chart":
      renderChart(artifact, card);
      break;
    case "decision":
      renderDecision(artifact, card);
      break;
    case "debate":
      renderDebate(artifact, card);
      break;
    case "perspectives":
      renderPerspectives(artifact, card);
      break;
    case "plan":
      renderPlan(artifact, card);
      break;
    case "document":
      renderDocument(artifact, card);
      break;
    case "presentation":
      renderPresentation(artifact, card);
      break;
    case "report":
      (artifact.sections || []).forEach((section) => {
        const sectionCard = el("section", "artifact-report-section");
        sectionCard.append(
          el("h3", "artifact-report-title", section.title || "Livrable"),
        );
        if (section.summary)
          sectionCard.append(el("p", "artifact-summary", section.summary));
        renderArtifactMain(section, sectionCard);
        card.append(sectionCard);
      });
      break;
    default:
      card.append(
        el("p", "artifact-summary", "Le livrable n’a pas pu être affiché."),
      );
  }
  root.append(card);
  const visual = card.querySelector("svg.artifact-map, svg.artifact-chart");
  if (
    visual &&
    ["diagram", "diagram3d", "mindmap", "chart"].includes(artifact.type)
  ) {
    const zoom = el("button", "artifact-zoom-button", "Ouvrir en grand");
    zoom.type = "button";
    zoom.addEventListener("click", () =>
      openVisualZoom(visual, artifact.title || "Visualisation"),
    );
    card.append(zoom);
  }
}
function openVisualZoom(source, title) {
  const overlay = el("div", "artifact-zoom-overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", title);
  const shell = el("section", "artifact-zoom-shell"),
    header = el("header", "artifact-zoom-header"),
    canvas = el("div", "artifact-zoom-canvas");
  header.append(el("strong", null, title));
  const controls = el("div", "artifact-zoom-controls");
  let scale = 1;
  const visual = source.cloneNode(true);
  const width = visual.viewBox?.baseVal?.width || 900;
  visual.style.setProperty("width", `${width}px`, "important");
  visual.style.setProperty("max-width", "none", "important");
  visual.style.setProperty("min-width", "0", "important");
  const applyScale = () => {
    visual.style.setProperty("width", `${width * scale}px`, "important");
  };
  const minus = el("button", null, "−"),
    plus = el("button", null, "+"),
    close = el("button", "artifact-zoom-close", "Fermer");
  [minus, plus, close].forEach((button) => {
    button.type = "button";
  });
  minus.setAttribute("aria-label", "Réduire le zoom");
  plus.setAttribute("aria-label", "Augmenter le zoom");
  minus.addEventListener("click", () => {
    scale = Math.max(0.6, scale - 0.2);
    applyScale();
  });
  plus.addEventListener("click", () => {
    scale = Math.min(2.6, scale + 0.2);
    applyScale();
  });
  close.addEventListener("click", () => overlay.remove());
  controls.append(
    minus,
    el("span", "artifact-zoom-hint", "Zoom · défilement pour naviguer"),
    plus,
    close,
  );
  header.append(controls);
  canvas.append(visual);
  shell.append(header, canvas);
  overlay.append(shell);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  document.body.append(overlay);
  close.focus();
  const onKey = (event) => {
    if (event.key === "Escape" && overlay.isConnected) {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);
}

function openEngineOverlay(artifact) {
  const overlay = el("div", "artifact-zoom-overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const shell = el("section", "artifact-zoom-shell"),
    header = el("header", "artifact-zoom-header"),
    body = el("div", "artifact-zoom-canvas");
  body.style.cssText =
    "display:block;flex:1;min-height:0;padding:0;overflow:hidden";
  const close = el("button", "artifact-zoom-close", "Fermer");
  close.type = "button";
  header.append(el("strong", null, artifact.title || "Visualisation"), close);
  shell.append(header, body);
  overlay.append(shell);
  document.body.append(overlay);
  // APRÈS
  mountArtifact(artifact, body, engineCtx({ full: true }));
  const done = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    disposeDetached();
  };
  const onKey = (e) => {
    if (e.key === "Escape") done();
  };
  close.addEventListener("click", done);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) done();
  });
  document.addEventListener("keydown", onKey);
  close.focus();
}
function renderIsometricDiagram(data, root) {
  const nodes = data.nodes || [];
  if (!nodes.length) {
    root.append(
      el(
        "p",
        "artifact-summary",
        "Ajoutez des éléments au modèle pour afficher le schéma.",
      ),
    );
    return;
  }
  const ns = "http://www.w3.org/2000/svg",
    width = 920,
    height = Math.max(300, Math.ceil(nodes.length / 3) * 145 + 80),
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "artifact-map artifact-map-3d");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", data.title || "Schéma en perspective");
  const position = new Map(
    nodes.map((node, index) => [
      node.id,
      {
        x: 55 + (index % 3) * 275 + Math.floor(index / 3) * 12,
        y: 55 + Math.floor(index / 3) * 135,
      },
    ]),
  );
  const add = (tag, attrs = {}, text = "") => {
    const item = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) =>
      item.setAttribute(key, String(value)),
    );
    if (text) item.textContent = text;
    svg.append(item);
    return item;
  };
  (data.edges || []).forEach((edge) => {
    const a = position.get(edge.from),
      b = position.get(edge.to);
    if (!a || !b) return;
    add("path", {
      d: `M${a.x + 205} ${a.y + 32} C${a.x + 245} ${a.y + 32},${b.x - 35} ${b.y + 32},${b.x} ${b.y + 32}`,
      class: "iso-edge",
    });
  });
  nodes.forEach((node) => {
    const at = position.get(node.id),
      group = document.createElementNS(ns, "g"),
      front = document.createElementNS(ns, "path"),
      side = document.createElementNS(ns, "path"),
      top = document.createElementNS(ns, "path");
    group.setAttribute(
      "class",
      `iso-node palette-${Math.abs([...String(node.group || node.id)].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 6}`,
    );
    top.setAttribute(
      "d",
      `M${at.x} ${at.y} L${at.x + 22} ${at.y - 14} H${at.x + 222} L${at.x + 200} ${at.y} Z`,
    );
    top.setAttribute("class", "iso-top");
    front.setAttribute(
      "d",
      `M${at.x} ${at.y} H${at.x + 200} V${at.y + 72} H${at.x} Z`,
    );
    front.setAttribute("class", "iso-front");
    side.setAttribute(
      "d",
      `M${at.x + 200} ${at.y} L${at.x + 222} ${at.y - 14} V${at.y + 58} L${at.x + 200} ${at.y + 72} Z`,
    );
    side.setAttribute("class", "iso-side");
    group.append(front, side, top);
    const title = document.createElementNS(ns, "text");
    title.setAttribute("x", at.x + 12);
    title.setAttribute("y", at.y + 27);
    title.setAttribute("class", "iso-title");
    title.setAttribute("textLength", "174");
    title.setAttribute("lengthAdjust", "spacingAndGlyphs");
    title.textContent = node.label.slice(0, 28);
    group.append(title);
    if (node.detail) {
      const detail = document.createElementNS(ns, "text");
      detail.setAttribute("x", at.x + 12);
      detail.setAttribute("y", at.y + 49);
      detail.setAttribute("class", "iso-detail");
      detail.setAttribute("textLength", "174");
      detail.setAttribute("lengthAdjust", "spacingAndGlyphs");
      detail.textContent = node.detail.slice(0, 34);
      group.append(detail);
    }
    svg.append(group);
  });
  root.append(svg);
}
function renderTable(data, root) {
  const wrap = el("div", "artifact-table-wrap");
  const table = el("table", "artifact-table");
  const thead = el("thead");
  const header = el("tr");
  (data.columns || []).forEach((column) =>
    header.append(el("th", null, column)),
  );
  thead.append(header);
  table.append(thead);
  const tbody = el("tbody");
  (data.rows || []).forEach((row) => {
    const tr = el("tr");
    (data.columns || []).forEach((_, index) =>
      tr.append(el("td", null, row[index] ?? "")),
    );
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  root.append(wrap);
}
function renderChartData(data, root) {
  const list = el("ul", "artifact-list");
  (data.points || []).forEach((point) => {
    const item = el("li");
    item.append(
      el("strong", null, point.label),
      document.createTextNode(
        `${point.value}${data.unit ? ` ${data.unit}` : ""}`,
      ),
    );
    list.append(item);
  });
  root.append(list);
}
function renderFluidDiagram(data, root) {
  if (
    ![
      "venturi",
      "boundary-layer",
      "forces",
      "cascade",
      "shock",
      "cfd-grid",
    ].includes(data.variant)
  )
    return false;
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 900 340");
  svg.setAttribute(
    "class",
    `artifact-map physics-diagram physics-${data.variant}`,
  );
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", data.title || "Schéma scientifique");
  const add = (tag, attrs = {}, text = "") => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) =>
      node.setAttribute(key, String(value)),
    );
    if (text) node.textContent = text;
    svg.append(node);
    return node;
  };
  const defs = document.createElementNS(ns, "defs"),
    marker = document.createElementNS(ns, "marker");
  marker.setAttribute("id", `arrow-${data.variant}`);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const tip = document.createElementNS(ns, "path");
  tip.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  tip.setAttribute("class", "physics-arrowhead");
  marker.append(tip);
  defs.append(marker);
  svg.append(defs);
  const label = (x, y, text, cls = "physics-label") =>
    add("text", { x, y, class: cls }, text);
  const arrow = (x1, y1, x2, y2, cls = "physics-flow") =>
    add("path", {
      d: `M${x1} ${y1} L${x2} ${y2}`,
      class: cls,
      "marker-end": `url(#arrow-${data.variant})`,
    });
  if (data.variant === "venturi") {
    const wall =
      "M35 70 H285 C360 70 380 132 450 132 C520 132 540 70 615 70 H865 V270 H615 C540 270 520 208 450 208 C380 208 360 270 285 270 H35 Z";
    add("path", { d: wall, class: "physics-channel" });
    add("path", {
      d: "M35 70 H285 C360 70 380 132 450 132 C520 132 540 70 615 70 H865",
      class: "physics-wall",
    });
    add("path", {
      d: "M35 270 H285 C360 270 380 208 450 208 C520 208 540 270 615 270 H865",
      class: "physics-wall",
    });
    [105, 170, 235].forEach((y) => arrow(55, y, 235, y));
    [155, 205].forEach((y) => arrow(330, y, 435, y, "physics-flow fast"));
    [102, 170, 238].forEach((y) => arrow(510, y, 690, y));
    label(135, 48, "Section large · v₁ faible", "physics-callout");
    label(380, 110, "Col · v₂ élevée", "physics-callout");
    label(379, 245, "P₂ plus faible", "physics-pressure-low");
    label(82, 306, "P₁", "physics-pressure-high");
    label(790, 306, "Écoulement →", "physics-caption");
  } else if (data.variant === "boundary-layer") {
    add("path", {
      d: "M70 270 H850 V80 C650 115 500 158 320 205 C220 232 140 252 70 270 Z",
      class: "physics-boundary-fill",
    });
    add("path", { d: "M70 270 H850", class: "physics-wall" });
    add("path", {
      d: "M70 270 C200 252 280 225 390 194 C540 153 690 117 850 94",
      class: "physics-boundary-edge",
    });
    [125, 270, 430, 600, 760].forEach((x, i) => {
      const endY = 260 - i * 31;
      add("path", {
        d: `M${x} 255 C${x + 55} 220 ${x + 85} ${endY + 20} ${x + 145} ${endY}`,
        class: "physics-streamline",
      });
    });
    [300, 590].forEach((x, i) => {
      const delta = i ? 105 : 64;
      add("path", { d: `M${x} 263 V${263 - delta}`, class: "physics-measure" });
      arrow(x + 10, 258, x + 85, 258, "physics-velocity");
      arrow(x + 10, 258 - delta, x + 134, 258 - delta, "physics-velocity");
    });
    label(84, 58, "Fluide extérieur · U∞", "physics-callout");
    label(605, 190, "Épaisseur δ(x)", "physics-callout");
    label(82, 298, "Paroi · u = 0", "physics-caption");
    label(
      635,
      298,
      "La couche limite s’épaissit vers l’aval",
      "physics-caption",
    );
  } else if (data.variant === "forces") {
    add("path", {
      d: "M350 110 L540 110 L610 160 L420 160 Z M350 110 V245 L420 295 V160 M420 160 H610 V245 L420 295",
      class: "physics-cube",
    });
    arrow(140, 175, 325, 175, "physics-pressure");
    label(150, 150, "Gradient de pression", "physics-callout");
    arrow(445, 45, 445, 100, "physics-force");
    label(458, 58, "Contrainte τ", "physics-callout");
    arrow(690, 160, 690, 260, "physics-gravity");
    label(705, 215, "Poids ρg", "physics-callout");
    label(365, 325, "Élément de fluide", "physics-caption");
  } else if (data.variant === "cascade") {
    [125, 320, 515, 710].forEach((x, i) => {
      const r = 58 - i * 12;
      add("circle", {
        cx: x,
        cy: 165,
        r,
        class: `physics-vortex palette-${i % 4}`,
      });
      add("path", {
        d: `M${x - r * 0.55} 165 C${x - r * 0.4} ${165 - r * 0.7} ${x + r * 0.5} ${165 - r * 0.5} ${x + r * 0.4} 165`,
        class: "physics-swirl",
      });
      if (i < 3)
        arrow(x + r + 10, 165, x + 195 - (i + 1) * 12, 165, "physics-transfer");
      label(
        x - 70,
        260,
        [
          "Grandes échelles",
          "Échelles intermédiaires",
          "Petites échelles",
          "Dissipation visqueuse",
        ][i],
        "physics-caption",
      );
    });
    label(280, 75, "Transfert d’énergie", "physics-callout");
  } else if (data.variant === "shock") {
    arrow(70, 110, 850, 110);
    arrow(70, 170, 850, 170);
    arrow(70, 230, 850, 230);
    add("path", { d: "M390 75 L560 170 L390 265 Z", class: "physics-shock" });
    add("path", { d: "M535 150 L690 170 L535 190", class: "physics-body" });
    label(365, 55, "Onde de choc", "physics-callout");
    label(105, 300, "Amont · supersonique", "physics-caption");
    label(650, 300, "Aval · état modifié", "physics-caption");
  } else {
    for (let x = 100; x <= 800; x += 55)
      add("path", { d: `M${x} 40 V300`, class: "physics-grid" });
    for (let y = 55; y <= 295; y += 40)
      add("path", { d: `M80 ${y} H835`, class: "physics-grid" });
    add("path", {
      d: "M350 105 L500 105 L570 170 L500 235 L350 235 L280 170 Z",
      class: "physics-body",
    });
    label(365, 180, "Domaine maillé", "physics-callout");
  }
  root.append(svg);
  return true;
}
function renderChart(data, root) {
  const points = data.points || [];
  if (!points.length) {
    root.append(
      el(
        "p",
        "artifact-summary",
        "Aucune donnée chiffrée ne permet de tracer ce graphique.",
      ),
    );
    return;
  }
  const ns = "http://www.w3.org/2000/svg",
    width = Math.max(720, points.length * 88 + 150),
    height = 310,
    pad = 76,
    plotHeight = 210,
    max = Math.max(1, ...points.map((point) => Math.max(0, point.value))),
    slot = (width - pad * 2) / points.length;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "artifact-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    data.title || "Graphique généré à partir des données de la conversation",
  );
  if (data.chartType === "line") {
    const left = pad + 20,
      right = width - 30,
      top = 46,
      bottom = 232,
      values = points.map((point) => point.value),
      min = Math.min(...values),
      high = Math.max(...values),
      span = high - min || 1;
    const coord = (index, value) => ({
      x: left + (index * (right - left)) / Math.max(1, points.length - 1),
      y: top + ((high - value) / span) * (bottom - top),
    });
    for (let tick = 0; tick <= 4; tick += 1) {
      const y = top + (tick * (bottom - top)) / 4;
      const grid = document.createElementNS(ns, "path");
      grid.setAttribute("d", `M${left} ${y}H${right}`);
      grid.setAttribute("class", "chart-grid");
      svg.append(grid);
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", left - 7);
      label.setAttribute("y", y + 3);
      label.setAttribute("text-anchor", "end");
      label.setAttribute("class", "chart-tick");
      label.textContent = String(
        Number((high - (tick * span) / 4).toPrecision(3)),
      );
      svg.append(label);
    }
    const axis = document.createElementNS(ns, "path");
    axis.setAttribute("d", `M${left} ${top}V${bottom}H${right}`);
    axis.setAttribute("class", "chart-axis");
    svg.append(axis);
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute("class", "chart-line");
    line.setAttribute(
      "points",
      points
        .map((point, index) => {
          const at = coord(index, point.value);
          return `${at.x},${at.y}`;
        })
        .join(" "),
    );
    svg.append(line);
    const labelStride = Math.max(1, Math.ceil(points.length / 9));
    points.forEach((point, index) => {
      const at = coord(index, point.value);
      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", at.x);
      dot.setAttribute("cy", at.y);
      dot.setAttribute("r", "4");
      dot.setAttribute("class", "chart-point");
      svg.append(dot);
      if (index % labelStride === 0 || index === points.length - 1) {
        const label = document.createElementNS(ns, "text");
        label.setAttribute("x", at.x);
        label.setAttribute("y", bottom + 20);
        label.setAttribute("text-anchor", points.length > 7 ? "end" : "middle");
        if (points.length > 7)
          label.setAttribute("transform", `rotate(-35 ${at.x} ${bottom + 20})`);
        label.setAttribute("class", "chart-tick");
        label.textContent = point.label.slice(0, 16);
        svg.append(label);
      }
    });
    if (data.xLabel) {
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", (left + right) / 2);
      label.setAttribute("y", 302);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "chart-axis-label");
      label.textContent = data.xLabel;
      svg.append(label);
    }
    if (data.legend) {
      const mark = document.createElementNS(ns, "path");
      mark.setAttribute("d", `M${left} 10h18`);
      mark.setAttribute("class", "chart-line");
      svg.append(mark);
      const legend = document.createElementNS(ns, "text");
      legend.setAttribute("x", left + 24);
      legend.setAttribute("y", 13);
      legend.setAttribute("class", "chart-axis-label");
      legend.textContent = data.legend;
      svg.append(legend);
    }
    if (data.yLabel || data.unit) {
      const middle = (top + bottom) / 2,
        label = document.createElementNS(ns, "text");
      label.setAttribute("x", 11);
      label.setAttribute("y", middle);
      label.setAttribute("transform", `rotate(-90 11 ${middle})`);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "chart-axis-label");
      label.textContent = data.yLabel || data.unit;
      svg.append(label);
    }
    root.append(svg);
    return;
  }
  const axis = document.createElementNS(ns, "path");
  axis.setAttribute("d", `M${pad} 12V${plotHeight + 14}H${width - 8}`);
  axis.setAttribute("class", "chart-axis");
  svg.append(axis);
  points.forEach((point, index) => {
    const barHeight = Math.max(2, (point.value / max) * (plotHeight - 12));
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", pad + index * slot + slot * 0.22);
    rect.setAttribute("y", plotHeight + 12 - barHeight);
    rect.setAttribute("width", Math.max(5, slot * 0.56));
    rect.setAttribute("height", barHeight);
    rect.setAttribute("rx", "3");
    rect.setAttribute("class", `chart-bar palette-${index % 6}`);
    svg.append(rect);
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", pad + index * slot + slot / 2);
    label.setAttribute("y", plotHeight + 31);
    label.setAttribute("text-anchor", "middle");
    label.textContent = point.label.slice(0, 18);
    svg.append(label);
    const value = document.createElementNS(ns, "text");
    value.setAttribute("x", pad + index * slot + slot / 2);
    value.setAttribute("y", plotHeight + 2 - barHeight);
    value.setAttribute("text-anchor", "middle");
    value.textContent = String(point.value);
    svg.append(value);
  });
  root.append(svg);
}
function renderMap(data, root) {
  const nodes = data.nodes || [];
  if (!nodes.length) {
    root.append(
      el("p", "artifact-summary", "La carte ne contient pas encore de nœuds."),
    );
    return;
  }
  const ns = "http://www.w3.org/2000/svg",
    byId = new Map(nodes.map((node, index) => [node.id, { ...node, index }]));
  const depthOf = (node, seen = new Set()) => {
    if (!node.parent || !byId.has(node.parent) || seen.has(node.id)) return 0;
    seen.add(node.id);
    return Math.min(4, 1 + depthOf(byId.get(node.parent), seen));
  };
  const groups = new Map();
  nodes.forEach((node) => {
    const depth = depthOf(byId.get(node.id));
    if (!groups.has(depth)) groups.set(depth, []);
    groups.get(depth).push(node);
  });
  const nodeW = 190,
    nodeH = 68,
    gapX = 38,
    gapY = 26,
    maxRows = Math.max(...[...groups.values()].map((items) => items.length));
  const width = Math.max(620, maxRows * (nodeW + gapX) + 48),
    height = Math.max(210, groups.size * (nodeH + gapY) + 30);
  const position = new Map();
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "artifact-map");
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", data.title || "Carte de réflexion");
  groups.forEach((items, depth) =>
    items.forEach((node, index) => {
      position.set(node.id, {
        x: 20 + index * ((width - nodeW - 40) / Math.max(1, items.length - 1)),
        y: 15 + depth * (nodeH + gapY),
      });
    }),
  );
  const drawn = new Set();
  nodes.forEach((node) => {
    const parent = position.get(node.parent),
      child = position.get(node.id);
    if (!parent || !node.parent) return;
    drawn.add(`${node.parent}>${node.id}`);
    const path = document.createElementNS(ns, "path");
    path.setAttribute("class", "map-edge");
    path.setAttribute(
      "d",
      `M${parent.x + nodeW / 2} ${parent.y + nodeH} C${parent.x + nodeW / 2} ${parent.y + nodeH + 22},${child.x + nodeW / 2} ${child.y - 22},${child.x + nodeW / 2} ${child.y}`,
    );
    svg.append(path);
  });
  (data.edges || []).forEach((edge) => {
    if (
      !position.has(edge.from) ||
      !position.has(edge.to) ||
      drawn.has(`${edge.from}>${edge.to}`)
    )
      return;
    const a = position.get(edge.from),
      b = position.get(edge.to),
      path = document.createElementNS(ns, "path");
    path.setAttribute("class", "map-edge");
    path.setAttribute(
      "d",
      `M${a.x + nodeW} ${a.y + nodeH / 2} C${a.x + nodeW + 34} ${a.y + nodeH / 2},${b.x - 34} ${b.y + nodeH / 2},${b.x} ${b.y + nodeH / 2}`,
    );
    svg.append(path);
  });
  nodes.forEach((node) => {
    const at = position.get(node.id);
    const group = document.createElementNS(ns, "g");
    group.setAttribute(
      "class",
      `map-group palette-${Math.abs([...String(node.group || node.id)].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 6}`,
    );
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", at.x);
    rect.setAttribute("y", at.y);
    rect.setAttribute("width", String(nodeW));
    rect.setAttribute("height", String(nodeH));
    rect.setAttribute("rx", "10");
    rect.setAttribute("class", `map-node${node.parent ? "" : " root"}`);
    group.append(rect);
    const title = document.createElementNS(ns, "text");
    title.setAttribute("x", at.x + 12);
    title.setAttribute("y", at.y + 25);
    title.textContent = node.label.slice(0, 32);
    group.append(title);
    if (node.detail) {
      const detail = document.createElementNS(ns, "text");
      detail.setAttribute("x", at.x + 12);
      detail.setAttribute("y", at.y + 48);
      detail.setAttribute("class", "map-detail");
      detail.textContent = node.detail.slice(0, 40);
      group.append(detail);
    }
    svg.append(group);
  });
  root.append(svg);
}
function renderDecision(data, root) {
  if (data.recommendation) root.append(el("h3", null, data.recommendation));
  if (data.rationale) root.append(el("p", "artifact-summary", data.rationale));
  const confidence = el("div", "artifact-confidence");
  confidence.append(
    el("span", null, "Confiance estimée"),
    el("strong", null, `${data.confidence || 0}%`),
  );
  root.append(confidence);
  const track = el("div", "confidence-track");
  const fill = el("i");
  fill.style.width = `${data.confidence || 0}%`;
  track.append(fill);
  root.append(track);
  for (const [title, values, key] of [
    ["Critères", data.criteria, "label"],
    ["Options", data.options, "label"],
    ["Prochaines étapes", data.nextSteps, "title"],
  ])
    if (values?.length) {
      root.append(el("h3", null, title));
      const list = el("ul", "artifact-list");
      values.forEach((item) => {
        const li = el("li");
        li.append(
          el(
            "strong",
            null,
            typeof item === "string" ? item : item[key] || "Élément",
          ),
        );
        if (typeof item === "object")
          li.append(
            document.createTextNode(
              item.detail || item.benefit || item.risk || "",
            ),
          );
        list.append(li);
      });
      root.append(list);
    }
}
function renderDebate(data, root) {
  const cols = el("div", "artifact-columns");
  [
    ["Pour", data.for],
    ["À considérer", data.against],
  ].forEach(([title, items]) => {
    const section = el("section", "artifact-column");
    section.append(el("h3", null, title));
    const list = el("ul");
    (items || []).forEach((item) => list.append(el("li", null, item)));
    section.append(list);
    cols.append(section);
  });
  root.append(cols);
  if (data.verdict) {
    root.append(
      el("h3", null, "Verdict provisoire"),
      el("p", "artifact-summary", data.verdict),
    );
  }
}
function renderPerspectives(data, root) {
  const list = el("ul", "artifact-list");
  (data.views || []).forEach((view) => {
    const item = el("li");
    item.append(
      el("strong", null, view.role),
      document.createTextNode(view.position || ""),
    );
    if (view.risk)
      item.append(
        el("p", "artifact-summary", `Point de vigilance : ${view.risk}`),
      );
    list.append(item);
  });
  root.append(list);
  if (data.consensus)
    root.append(
      el("h3", null, "Synthèse"),
      el("p", "artifact-summary", data.consensus),
    );
}
function renderPlan(data, root) {
  const list = el("ul", "artifact-list");
  (data.items || []).forEach((step, index) => {
    const item = el("li", "artifact-task");
    const check = el("input");
    check.type = "checkbox";
    check.checked =
      localStorage.getItem(
        `aigent-task:${state.artifactMessageId}:${index}`,
      ) === "done";
    check.addEventListener("change", () =>
      localStorage.setItem(
        `aigent-task:${state.artifactMessageId}:${index}`,
        check.checked ? "done" : "todo",
      ),
    );
    const copy = el("span");
    copy.append(
      el("strong", null, step.title),
      document.createTextNode(step.detail || ""),
    );
    if (step.due) copy.append(el("small", "artifact-summary", step.due));
    item.append(check, copy);
    list.append(item);
  });
  root.append(list);
}
function renderDocument(data, root) {
  const doc = el("article", "artifact-document");
  const lines = String(data.body || "").split(/\r?\n/);
  let list = null;
  for (const line of lines) {
    const value = line.trim();
    if (!value) {
      list = null;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(value);
    if (heading) {
      list = null;
      doc.append(el(`h${Math.min(3, heading[1].length)}`, null, heading[2]));
      continue;
    }
    const bullet = /^(?:[-*]|\d+[.)])\s+(.+)$/.exec(value);
    if (bullet) {
      if (!list) {
        list = el("ul", "artifact-document-list");
        doc.append(list);
      }
      list.append(el("li", null, bullet[1]));
      continue;
    }
    list = null;
    doc.append(el("p", null, value));
  }
  root.append(doc);
}
function renderPresentation(data, root) {
  const deck = el("div", "artifact-slides");
  (data.slides || []).forEach((slide, index) => {
    const card = el("section", "artifact-slide");
    card.append(
      el("span", "artifact-slide-number", `0${index + 1}`.slice(-2)),
      el(
        "h3",
        "artifact-slide-title",
        slide.title || `Diapositive ${index + 1}`,
      ),
    );
    if (slide.body) card.append(el("p", "artifact-summary", slide.body));
    if (slide.bullets?.length) {
      const list = el("ul", "artifact-list");
      slide.bullets.forEach((bullet) => list.append(el("li", null, bullet)));
      card.append(list);
    }
    deck.append(card);
  });
  if (!data.slides?.length)
    deck.append(
      el(
        "p",
        "artifact-summary",
        "La présentation ne contient pas encore de diapositives.",
      ),
    );
  root.append(deck);
}
// APRÈS
function docToText(doc) {
  return [
    `# ${doc.title || "Document"}`,
    ...(doc.sections || []).map((section) =>
      [
        `${section.level === 3 ? "###" : "##"} ${section.title}`,
        ...(section.blocks || []).map((block) => {
          if (block.type === "list")
            return (block.items || [])
              .map((item, i) => `${block.ordered ? `${i + 1}.` : "-"} ${item}`)
              .join("\n");
          if (block.type === "table")
            return [
              (block.columns || []).join("\t"),
              ...(block.rows || []).map((row) => row.join("\t")),
            ].join("\n");
          if (block.type === "formula") return `$$${block.tex}$$`;
          if (block.type === "code") return block.code;
          if (block.type === "artifact")
            return `[Figure : ${block.artifact?.title || block.artifact?.type}]`;
          return block.md || "";
        }),
      ].join("\n\n"),
    ),
  ].join("\n\n");
}
function probTreeToText(node, depth = 0) {
  return [
    `${"  ".repeat(depth)}${depth ? `(${node.p}) ` : ""}${node.label}`,
    ...(node.children || []).map((child) => probTreeToText(child, depth + 1)),
  ].join("\n");
}
function artifactToText(artifact) {
  switch (artifact.type) {
    case "doc":
      return docToText(artifact);
    case "plot":
      return [
        artifact.title,
        ...(artifact.functions || []).map((f) => `${f.label} = ${f.expr}`),
        ...(artifact.points || []).map(
          (p) => `${p.label} (${p.x} ; ${p.y ?? "?"})`,
        ),
      ].join("\n");
    case "timeline":
      return (artifact.events || [])
        .map(
          (e) =>
            `${e.date ? `${e.date} — ` : ""}${e.label}${e.detail ? ` : ${e.detail}` : ""}`,
        )
        .join("\n");
    case "probtree":
      return probTreeToText(artifact.root || { label: artifact.title });
    case "sheet":
      return [
        (artifact.columns || []).join("\t"),
        ...(artifact.rows || []).map((row) => row.join("\t")),
      ].join("\n");
    case "scene3d":
      return `${artifact.title} — scène 3D (${JSON.stringify(artifact.params || {})})`;
  }
  if (artifact.type === "report")
    return (artifact.sections || [])
      .map((section) => `${section.title}\n${artifactToText(section)}`)
      .join("\n\n");
  if (artifact.type === "table")
    return [
      artifact.columns.join("\t"),
      ...(artifact.rows || []).map((row) => row.join("\t")),
    ].join("\n");
  if (["mindmap", "diagram", "diagram3d"].includes(artifact.type))
    return (artifact.nodes || [])
      .map(
        (node) =>
          `${node.parent ? "  ↳ " : ""}${node.label}${node.detail ? ` — ${node.detail}` : ""}`,
      )
      .join("\n");
  if (artifact.type === "document") return artifact.body || "";
  if (artifact.type === "presentation")
    return (artifact.slides || [])
      .map(
        (slide, index) =>
          `## ${index + 1}. ${slide.title}\n\n${slide.body || ""}${slide.bullets?.length ? `\n\n${slide.bullets.map((bullet) => `- ${bullet}`).join("\n")}` : ""}`,
      )
      .join("\n\n---\n\n");
  if (artifact.type === "plan")
    return (artifact.items || [])
      .map((item, index) =>
        `${index + 1}. ${item.title} ${item.detail || ""}`.trim(),
      )
      .join("\n");
  return JSON.stringify(artifact, null, 2);
}
function slug(value) {
  return (
    String(value || "livrable")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "livrable"
  );
}
function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = el("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadCsv(artifact) {
  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const content = [artifact.columns, ...(artifact.rows || [])]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
  downloadFile(
    `${slug(artifact.title)}.csv`,
    `\ufeff${content}`,
    "text/csv;charset=utf-8",
  );
}
function downloadTsv(artifact) {
  const cell = (value) => String(value ?? "").replace(/[\t\r\n]+/g, " ");
  const content = [artifact.columns, ...(artifact.rows || [])]
    .map((row) => row.map(cell).join("\t"))
    .join("\r\n");
  downloadFile(
    `${slug(artifact.title)}.tsv`,
    `\ufeff${content}`,
    "text/tab-separated-values;charset=utf-8",
  );
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copié dans le presse-papiers");
  } catch {
    toast("Copie impossible depuis ce navigateur");
  }
}

async function convertToWork() {
  if (state.busy) return;
  if (!state.messages.length) {
    toast("Commencez une réflexion avant de la continuer dans Work.");
    return;
  }
  const button = $("#convertToWork");
  button.disabled = true;
  try {
    const title = state.conversation?.title || "Suite de réflexion AiGENT";
    const { project } = await api("/api/aigent/projects", {
      method: "POST",
      body: { name: title.slice(0, 58) },
    });
    const transcript = state.messages
      .slice(-24)
      .map(
        (message) =>
          `${message.role === "user" ? "Utilisateur" : "AiGENT Chat"} (${message.mode || "think"}) :\n${message.content}${message.artifact ? `\nLivrable : ${message.artifact.title}\n${artifactToText(message.artifact)}` : ""}`,
      )
      .join("\n\n")
      .slice(-11000);
    const brief = `Je poursuis dans Work la réflexion « ${title} ». Utilise le contexte ci-dessous comme brief de départ. Identifie l’objectif, les décisions, les contraintes et les résultats déjà obtenus; ne redemande pas ce qui est déjà précisé.\n\n${transcript}`;
    await api(`/api/aigent/projects/${project.id}/chat`, {
      method: "POST",
      body: { message: brief },
    });
    location.href = `./aigent.html?project=${encodeURIComponent(project.id)}`;
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
}

function initInteractions() {
  const composerWrap = $(".chat-composer-wrap");
  const syncComposerHeight = () =>
    $(".chat-column").style.setProperty(
      "--chat-composer-height",
      `${Math.ceil(composerWrap.getBoundingClientRect().height)}px`,
    );
  if ("ResizeObserver" in window)
    new ResizeObserver(syncComposerHeight).observe(composerWrap);
  else window.addEventListener("resize", syncComposerHeight);
  syncComposerHeight();
  $("#newConversation").addEventListener("click", newConversation);
  state.attachments = [];
  $("#chatAttach").addEventListener("click", () => $("#chatFileInput").click());
  $("#chatFileInput").addEventListener("change", async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    for (const file of files) {
      if (state.attachments.length >= 5) {
        toast("Cinq fichiers maximum par message.");
        break;
      }
      if (file.size > 1400000) {
        toast(`${file.name} dépasse la limite de 1,4 Mo.`);
        continue;
      }
      const type = file.type || "application/octet-stream";
      const textLike =
        /^(text\/(plain|markdown|csv|xml)|application\/(json|xml))$/.test(
          type,
        ) || /\.(txt|md|csv|json|log|xml)$/i.test(file.name);
      if (
        !textLike &&
        type !== "application/pdf" &&
        !type.startsWith("image/")
      ) {
        toast(`Format non pris en charge : ${file.name}`);
        continue;
      }
      try {
        const attachment = {
          name: file.name.slice(0, 160),
          type,
          ...(textLike
            ? { text: (await file.text()).slice(0, 80000) }
            : { data: await fileAsBase64(file) }),
        };
        state.attachments.push(attachment);
      } catch (error) {
        toast(error.message);
      }
    }
    renderChatAttachments();
    $("#thinkingInput").focus();
  });
  $("#thinkingComposer").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#thinkingInput");
    const value = input.value.trim();
    if (!value && !state.attachments.length) return;
    const attachments = state.attachments.slice();
    state.attachments = [];
    renderChatAttachments();
    input.value = "";
    input.style.height = "auto";
    sendMessage(value, attachments);
  });
  $("#thinkingInput").addEventListener("input", (event) => {
    event.currentTarget.style.height = "auto";
    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`;
  });
  $("#thinkingInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      $("#thinkingComposer").requestSubmit();
    }
  });
  $$(".chat-starters button").forEach((button) =>
    button.addEventListener("click", () => {
      $("#thinkingInput").value = button.dataset.prompt;
      $("#thinkingInput").focus();
      $("#thinkingInput").dispatchEvent(new Event("input"));
    }),
  );
  $("#thinkingInput")
    .closest("form")
    .addEventListener("click", () => {});
  // APRÈS
  $("#convertToWork").addEventListener("click", convertToWork);
  $("#exportConversation").addEventListener("click", exportConversation);
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      $("#thinkingInput").focus();
    }
  });
  $("#chatPanelToggle").addEventListener("click", () =>
    toggleArtifact(!state.panelOpen),
  );
  $("#closeThinkingSpace").addEventListener("click", () => hideArtifact());
  $("#chatTheme").addEventListener("click", async () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("aigent_theme", next);
    if (state.account) {
      try {
        await api("/api/aigent/me", {
          method: "PATCH",
          body: {
            username: state.account.username,
            contact: state.account.contact,
            preferences: { theme: next },
          },
        });
        state.account.preferences = {
          ...(state.account.preferences || {}),
          theme: next,
        };
      } catch {}
    }
  });
  $("#chatAccount").addEventListener("click", () => {
    location.href = "./aigent.html?view=settings";
  });
  $("#effortSelect").addEventListener("change", async (event) => {
    state.effort = event.target.value;
    if (state.account) {
      try {
        const result = await api("/api/aigent/me", {
          method: "PATCH",
          body: {
            username: state.account.username,
            contact: state.account.contact,
            preferences: { chatEffort: state.effort },
          },
        });
        state.account.preferences = result.preferences;
      } catch {
        toast(
          "Le réglage est appliqué à cette conversation, mais n’a pas été mémorisé.",
        );
      }
    }
  });
}

async function boot() {
  document.documentElement.dataset.theme =
    localStorage.getItem("aigent_theme") || "dark";
  renderModeBar();
  initInteractions();
  if (!token()) {
    location.href = LOGIN_PAGE;
    return;
  }
  try {
    const me = await api("/api/aigent/me");
    state.account = me.account;
    const preferredTheme = me.account.preferences?.theme;
    if (["light", "dark"].includes(preferredTheme)) {
      document.documentElement.dataset.theme = preferredTheme;
      localStorage.setItem("aigent_theme", preferredTheme);
    }
    $("#effortSelect").value = ["quick", "standard", "deep"].includes(
      me.account.preferences?.chatEffort,
    )
      ? me.account.preferences.chatEffort
      : "standard";
    $("#chatAccountName").textContent = me.account.username;
    $("#chatAccountSource").textContent =
      me.account.sourceLabel || me.account.source;
    $("#chatAvatar").textContent = avatarLetters();
    await refreshConversationList();
    const requestedId = new URLSearchParams(location.search).get(
      "conversation",
    );
    if (
      requestedId &&
      state.conversations.some((item) => String(item.id) === requestedId)
    )
      await loadConversation(requestedId);
  } catch (error) {
    if (error.message !== "Session expirée")
      toast(error.message || "Connexion au serveur impossible");
  }
}
boot();
