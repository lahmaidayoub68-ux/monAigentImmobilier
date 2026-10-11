/* AiGENT — visionneuse de code : coloration syntaxique légère, onglets, numéros de ligne. */
const R = String.raw;
const KW = {
  js: "const let var function return if else for while do switch case break continue new class extends import from export default async await try catch finally throw typeof instanceof in of null undefined true false this super yield static get set void delete interface type enum implements readonly public private protected",
  py: "def class return if elif else for while in not and or is import from as with try except finally raise lambda None True False pass break continue yield global nonlocal async await self",
  sql: "select from where group by order having insert into values update set delete create table alter drop join left right inner outer on as and or not null primary key foreign references limit distinct union all case when then else end index view",
  bash: "if then else elif fi for do done while case esac function echo export cd ls cat grep sed awk sudo apt npm node python pip git curl",
  c: "public private protected static void int long float double char bool boolean string class struct enum interface return if else for while do switch case break continue new null true false this import package using namespace fn let mut pub impl use match func go defer chan type var const final extends implements try catch throw throws",
  yaml: "true false null yes no",
};
const ALIAS = {
  javascript: "js",
  jsx: "js",
  ts: "js",
  typescript: "js",
  tsx: "js",
  node: "js",
  mjs: "js",
  python: "py",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  xml: "html",
  svg: "html",
  vue: "html",
  scss: "css",
  java: "c",
  cpp: "c",
  "c++": "c",
  cs: "c",
  csharp: "c",
  go: "c",
  rust: "c",
  rs: "c",
  php: "c",
  kotlin: "c",
  swift: "c",
  yml: "yaml",
};
export const langOf = (l, path = "") => {
  const k = String(l || path.split(".").pop() || "").toLowerCase();
  return ALIAS[k] || (KW[k] || ["html", "css", "json"].includes(k) ? k : "txt");
};
const CACHE = {};
function rx(lang) {
  if (CACHE[lang]) return CACHE[lang];
  const kw = (KW[lang] || "").split(/\s+/).filter(Boolean).join("|");
  const cm = ["py", "bash", "yaml"].includes(lang)
    ? R`#[^\n]*`
    : lang === "sql"
      ? R`--[^\n]*|/\*[\s\S]*?\*/`
      : lang === "css"
        ? R`/\*[\s\S]*?\*/`
        : R`//[^\n]*|/\*[\s\S]*?\*/`;
  const st =
    (lang === "py" ? R`"""[\s\S]*?"""|'''[\s\S]*?'''|` : "") +
    R`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'` +
    (lang === "js" ? "|`(?:\\\\.|[^`\\\\])*`" : "");
  const parts = [`(?<cm>${cm})`, `(?<st>${st})`];
  if (lang === "css") parts.push(R`(?<pr>[a-zA-Z-]+(?=\s*:))`);
  parts.push(
    R`(?<nu>\b0x[0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b)`,
  );
  if (kw) parts.push(`(?<kw>\\b(?:${kw})\\b)`);
  parts.push(
    R`(?<fn>\b[A-Za-z_$][\w$]*(?=\s*\())`,
    R`(?<ty>\b[A-Z][A-Za-z0-9_]*\b)`,
    R`(?<op>[=+\-*/%<>!&|^~?:]+)`,
  );
  return (CACHE[lang] = new RegExp(
    parts.join("|"),
    lang === "sql" ? "gi" : "g",
  ));
}
function tokHtml(code) {
  const out = [],
    re = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g;
  let last = 0,
    m;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(["", code.slice(last, m.index)]);
    if (m[0].startsWith("<!--")) out.push(["cm", m[0]]);
    else {
      const t = /^(<\/?)([\w:-]+)([\s\S]*?)(\/?>)$/.exec(m[0]);
      if (!t) out.push(["", m[0]]);
      else {
        out.push(["op", t[1]], ["kw", t[2]]);
        const ar = /([\w:@.-]+)(=)?("[^"]*"|'[^']*')?|\s+/g;
        let a,
          l2 = 0;
        while ((a = ar.exec(t[3])) && a[0] !== "") {
          if (a.index > l2) out.push(["", t[3].slice(l2, a.index)]);
          if (a[1]) {
            out.push(["pr", a[1]]);
            if (a[2]) out.push(["op", a[2]]);
            if (a[3]) out.push(["st", a[3]]);
          } else out.push(["", a[0]]);
          l2 = ar.lastIndex;
        }
        out.push(["op", t[4]]);
      }
    }
    last = re.lastIndex;
  }
  if (last < code.length) out.push(["", code.slice(last)]);
  return out;
}
function tokenize(code, lang) {
  if (lang === "html") return tokHtml(code);
  if (lang === "txt") return [["", code]];
  const re = rx(lang),
    out = [];
  re.lastIndex = 0;
  let last = 0,
    m;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(["", code.slice(last, m.index)]);
    let cls = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
    if (
      cls === "st" &&
      (lang === "json" || lang === "yaml") &&
      /^\s*:/.test(code.slice(re.lastIndex, re.lastIndex + 4))
    )
      cls = "pr";
    out.push([cls, m[0]]);
    last = re.lastIndex;
    if (m[0] === "") re.lastIndex++;
  }
  if (last < code.length) out.push(["", code.slice(last)]);
  return out;
}
export function highlightCode(code, lang = "") {
  const frag = document.createDocumentFragment(),
    l = langOf(lang);
  for (const [cls, text] of tokenize(String(code), l)) {
    if (!cls) {
      frag.append(document.createTextNode(text));
      continue;
    }
    const s = document.createElement("span");
    s.className = `tk-${cls}`;
    s.textContent = text;
    frag.append(s);
  }
  return frag;
}
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const NAME = {
  js: "JavaScript / TypeScript",
  py: "Python",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  sql: "SQL",
  bash: "Shell",
  c: "C / Java / Go / Rust…",
  yaml: "YAML",
  txt: "Texte",
};
export async function mountCodeView(a, host, ctx = {}) {
  const files = (a.files || []).filter((f) => f && f.content != null);
  const root = h(
    "section",
    `ax ax-code${ctx.inline ? " is-inline" : ""}${ctx.panel ? " is-panel" : ""}`,
  );
  const bar = h("div", "ax-code-bar"),
    tabs = h("div", "ax-code-tabs"),
    act = h("div", "ax-code-actions"),
    meta = h("div", "ax-code-meta"),
    view = h("div", "ax-code-view");
  let cur = 0,
    wrap = false;
  const btn = (label, title, fn) => {
    const b = h("button", "ax-code-btn", label);
    b.type = "button";
    b.title = title;
    b.addEventListener("click", fn);
    return b;
  };
  const render = () => {
    const f = files[cur],
      text = String(f.content).replace(/\n$/, ""),
      lines = text.split("\n"),
      lang = langOf(f.lang, f.path);
    view.replaceChildren();
    view.classList.toggle("is-wrap", wrap);
    const pre = h("pre", "ax-code-pre"),
      code = h("code");
    code.append(highlightCode(text, f.lang || lang));
    pre.append(code);
    view.append(
      h("div", "ax-code-gutter", lines.map((_, i) => i + 1).join("\n")),
      pre,
    );
    meta.textContent = `${f.path} · ${lines.length} ligne${lines.length > 1 ? "s" : ""} · ${NAME[lang] || "Texte"}`;
    tabs
      .querySelectorAll("button")
      .forEach((b, i) => b.classList.toggle("is-on", i === cur));
  };
  files.forEach((f, i) => {
    const b = h("button", "ax-code-tab", f.path.split("/").pop());
    b.type = "button";
    b.title = f.path;
    b.addEventListener("click", () => {
      cur = i;
      render();
    });
    tabs.append(b);
  });
  const copy = btn("Copier", "Copier le fichier", async () => {
    try {
      await navigator.clipboard.writeText(files[cur].content);
      copy.textContent = "Copié ✓";
      setTimeout(() => (copy.textContent = "Copier"), 1400);
    } catch {
      copy.textContent = "Impossible";
    }
  });
  const dl = btn("Télécharger", "Télécharger le fichier", () => {
    const f = files[cur],
      url = URL.createObjectURL(
        new Blob([f.content], { type: "text/plain;charset=utf-8" }),
      ),
      a2 = h("a");
    a2.href = url;
    a2.download = f.path.split("/").pop();
    a2.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const wr = btn(
    "Retour ligne",
    "Activer / désactiver le retour à la ligne",
    () => {
      wrap = !wrap;
      wr.classList.toggle("is-on", wrap);
      render();
    },
  );
  act.append(copy, dl, wr);
  bar.append(tabs, act);
  root.append(bar, view, meta);
  if (a.run) {
    const run = h("div", "ax-code-run");
    run.append(h("span", null, "Exécution"), h("code", null, a.run));
    const c2 = btn("Copier", "Copier la commande", () =>
      navigator.clipboard?.writeText(a.run),
    );
    run.append(c2);
    root.append(run);
  }
  host.append(root);
  render();
}
