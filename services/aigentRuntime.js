//======================================================================//
//  AiGENT — runtime applicatif (livré dans chaque projet généré).
//  Piloté par window.__CONTRACT__ ; aucune dépendance, aucun innerHTML.
//======================================================================//

export const INDEX_HTML = (name, lang = "fr") => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#ffffff">
<title>${String(name).replace(/[<>&"]/g, "")}</title>
<link rel="stylesheet" href="./styles.css">
</head>
<body>
<div id="app"></div>
<script src="./app.js"></script>
</body>
</html>`;

export const RUNTIME_CSS = String.raw`
.ax{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh;background:var(--bg);color:var(--text);font:14px/1.5 var(--font)}
.ax *,.ax-solo *,.ax-back *{box-sizing:border-box}
.ax-side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:14px;padding:14px 10px;background:var(--surface);border-right:1px solid var(--border);overflow-y:auto}
.ax-brand{display:flex;align-items:center;gap:10px;padding:2px 8px;font-weight:600;letter-spacing:-.01em;color:var(--text)}
.ax-mark{width:24px;height:24px;border-radius:6px;background:var(--accent);color:var(--on-accent,#fff);display:grid;place-items:center;font-size:12px;font-weight:700;flex:none}
.ax-search{display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--muted);cursor:pointer;font:inherit}
.ax-search span{flex:1;text-align:left}
.ax-search kbd{font:11px var(--font);padding:1px 6px;border:1px solid var(--border);border-radius:5px}
.ax-nav{display:grid;gap:14px;flex:1}
.ax-sec{display:grid;gap:2px}
.ax-sec-t{margin:0 8px 4px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.ax-link{display:flex;align-items:center;gap:10px;height:32px;padding:0 8px;border-radius:7px;color:var(--muted);text-decoration:none}
.ax-link:hover{background:var(--alt);color:var(--text)}
.ax-link.on{background:var(--alt);color:var(--text);font-weight:550}
.ax-user{display:flex;align-items:center;gap:8px;padding:8px;border-top:1px solid var(--border)}
.ax-user .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ax-avatar{width:24px;height:24px;border-radius:50%;background:var(--soft);color:var(--accent);display:grid;place-items:center;font-size:12px;font-weight:650;flex:none}
.ax-main{min-width:0;padding:0 32px 64px}
.ax-top{display:flex;align-items:center;gap:12px;padding:22px 0 18px;border-bottom:1px solid var(--border);margin-bottom:22px}
.ax-top h1{margin:0;font-size:20px;letter-spacing:-.02em;font-weight:var(--fw,600)}
.ax-top p{margin:2px 0 0}
.ax-content{display:grid;gap:22px;max-width:1180px}
.ax-burger{display:none}
.ax-mute{color:var(--muted)}
.ax-pad{padding:12px}
.ax-card{background:var(--bg);border:1px solid var(--border);border-radius:var(--r,10px);overflow:hidden}
.ax-h{margin:0;padding:14px 16px 0;font-size:14px;font-weight:600;letter-spacing:-.01em}
.ax-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--border)}
.ax-bar .grow{flex:1;min-width:120px}
.ax-bar h2{margin:0;font-size:14px;font-weight:600}
.ax-chips{display:flex;gap:6px;flex-wrap:wrap;padding:10px 16px 0}
.ax-chip{height:26px;padding:0 10px;border:1px solid var(--border);border-radius:999px;background:var(--bg);color:var(--muted);font:12px var(--font);cursor:pointer}
.ax-chip.on{background:var(--accent);border-color:var(--accent);color:var(--on-accent,#fff)}
.ax-in{width:100%;height:34px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font:inherit;outline:none}
textarea.ax-in{height:auto;padding:8px 10px;resize:vertical}
.ax-in:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 20%,transparent)}
.ax-bar .ax-in{width:220px}
.ax-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font:550 13px var(--font);cursor:pointer;white-space:nowrap}
.ax-btn:hover{background:var(--alt)}
.ax-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent,#fff)}
.ax-btn.primary:hover{filter:brightness(1.1)}
.ax-btn.danger{color:#d24545}
.ax-btn:disabled{opacity:.5;cursor:default}
.ax-btn:focus-visible,.ax-icon:focus-visible,.ax-link:focus-visible,.ax-chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ax-icon{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:7px;background:transparent;color:var(--muted);cursor:pointer}
.ax-icon:hover{background:var(--alt);color:var(--text)}
.ax-tw{overflow-x:auto}
.ax-table{width:100%;border-collapse:collapse}
.ax-table th{padding:9px 16px;text-align:left;font-size:12px;font-weight:600;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap;cursor:pointer;user-select:none}
.ax-table td{padding:10px 16px;border-bottom:1px solid var(--border);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ax-table tbody tr{cursor:pointer}
.ax-table tbody tr:hover{background:var(--surface)}
.ax-table tbody tr:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.ax-table tr:last-child td{border-bottom:0}
.ax-empty{padding:28px 16px!important;text-align:center;color:var(--muted);white-space:normal!important}
.ax-badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:550;background:var(--alt);color:var(--muted)}
.ax-t1{background:color-mix(in srgb,var(--accent) 14%,var(--bg));color:var(--accent)}
.ax-t2{background:color-mix(in srgb,#1c9a62 14%,var(--bg));color:#1c9a62}
.ax-t3{background:color-mix(in srgb,#b4740f 14%,var(--bg));color:#b4740f}
.ax-t4{background:color-mix(in srgb,#d24545 14%,var(--bg));color:#d24545}
.ax-t5{background:color-mix(in srgb,#2c6fdc 14%,var(--bg));color:#2c6fdc}
.ax-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(250px,1fr);gap:12px;overflow-x:auto;padding:14px 16px 16px}
.ax-col{display:flex;flex-direction:column;gap:8px;min-height:140px;padding:8px;border-radius:10px;background:var(--surface)}
.ax-col.over{outline:2px dashed var(--accent)}
.ax-col-h{display:flex;justify-content:space-between;padding:2px 4px 6px;font-size:12px;font-weight:600;color:var(--muted)}
.ax-kcard{padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);cursor:grab;display:grid;gap:6px;text-align:left;font:inherit;color:inherit}
.ax-kcard:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--border))}
.ax-kcard small{color:var(--muted)}
.ax-list>button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:11px 16px;border:0;border-bottom:1px solid var(--border);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.ax-list>button:hover{background:var(--surface)}
.ax-list small{color:var(--muted)}
.ax-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.ax-stat{padding:14px 16px}
.ax-stat span{color:var(--muted);font-size:12.5px}
.ax-stat b{display:block;margin-top:2px;font-size:26px;letter-spacing:-.03em;font-weight:var(--fw,600)}
.ax-bars{display:grid;gap:10px;padding:14px 16px 16px}
.ax-barrow{display:grid;grid-template-columns:130px 1fr 36px;align-items:center;gap:10px;font-size:13px}
.ax-barrow i{display:block;height:8px;border-radius:99px;background:var(--accent)}
.ax-barrow div{background:var(--alt);border-radius:99px;overflow:hidden}
.ax-form{display:grid;gap:12px;padding:16px}
.ax-field{display:grid;gap:5px;font-size:12.5px;font-weight:550;color:var(--muted)}
.ax-check{display:flex;align-items:center;gap:8px;height:34px}
.ax-check input{width:16px;height:16px;accent-color:var(--accent)}
.ax-row-end{display:flex;justify-content:flex-end;gap:8px;align-items:center}
.ax-err{margin:0;color:#d24545;font-size:13px}
.ax-state{display:grid;gap:6px;justify-items:start;padding:20px 16px}
.ax-state p{margin:0}
.ax-text{padding:16px}
.ax-text p{margin:8px 0 0;max-width:68ch;color:var(--muted)}
.ax-skel{display:grid;gap:8px;padding:16px}
.ax-skel i{display:block;height:14px;border-radius:6px;background:linear-gradient(90deg,var(--alt),var(--surface),var(--alt));background-size:200% 100%;animation:ax-sk 1.2s linear infinite}
.ax-skel i:nth-child(2){width:80%}.ax-skel i:nth-child(3){width:60%}
@keyframes ax-sk{to{background-position:-200% 0}}
.ax-back{position:fixed;inset:0;z-index:100;background:rgba(16,17,20,.36);display:flex;justify-content:flex-end}
.ax-back.ax-center{justify-content:center;align-items:center}
.ax-drawer{width:min(460px,100vw);height:100%;background:var(--bg);border-left:1px solid var(--border);overflow-y:auto;box-shadow:-20px 0 60px -30px rgba(0,0,0,.4)}
.ax-drawer-h{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 0}
.ax-drawer-h h2{margin:0;font-size:16px;letter-spacing:-.01em}
.ax-dialog{width:min(380px,92vw);padding:20px;border-radius:12px;background:var(--bg);border:1px solid var(--border);display:grid;gap:16px}
.ax-dialog p{margin:0}
.ax-pal-back{justify-content:center;align-items:flex-start;padding-top:14vh}
.ax-pal{width:min(560px,94vw);border-radius:12px;background:var(--bg);border:1px solid var(--border);overflow:hidden;box-shadow:0 30px 80px -24px rgba(0,0,0,.45)}
.ax-pal-in{width:100%;height:48px;padding:0 16px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);font:15px var(--font);outline:none}
.ax-pal-list{max-height:340px;overflow-y:auto;padding:6px}
.ax-pal-it{display:flex;justify-content:space-between;width:100%;padding:9px 10px;border:0;border-radius:7px;background:none;color:var(--text);font:inherit;cursor:pointer;text-align:left}
.ax-pal-it.on,.ax-pal-it:hover{background:var(--alt)}
.ax-pal-it small{color:var(--muted)}
.ax-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,12px);opacity:0;pointer-events:none;z-index:300;padding:9px 14px;border-radius:9px;background:var(--text);color:var(--bg);font-size:13px;transition:.18s}
.ax-toast.on{opacity:1;transform:translate(-50%,0)}
.ax-solo{min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font:14px/1.5 var(--font)}
.ax-authcard{width:min(380px,100%);display:grid;gap:18px}
.ax-authcard h1{margin:0;font-size:24px;letter-spacing:-.03em}
.ax-solo{position:relative;isolation:isolate;overflow:hidden;background:radial-gradient(ellipse at 18% 12%,color-mix(in srgb,var(--accent) 13%,var(--bg)),transparent 42%),var(--bg)}
.ax-solo:before,.ax-solo:after{position:fixed;z-index:-1;width:360px;height:360px;border:1px solid color-mix(in srgb,var(--accent) 12%,transparent);border-radius:50%;content:"";pointer-events:none}
.ax-solo:before{top:-190px;right:-130px;box-shadow:0 0 0 36px color-mix(in srgb,var(--accent) 3%,transparent),0 0 0 72px color-mix(in srgb,var(--accent) 2%,transparent)}
.ax-solo:after{bottom:-260px;left:-190px;width:440px;height:440px}
.ax-authcard{position:relative;width:min(440px,100%);gap:20px;padding:34px;border:1px solid var(--border);border-radius:20px;background:color-mix(in srgb,var(--surface) 88%,transparent);box-shadow:0 30px 90px -52px rgba(0,0,0,.44);backdrop-filter:blur(18px)}
.ax-authcard h1{font-size:27px;line-height:1.15}
.ax-authcard>.ax-brand{color:var(--accent);font-size:14px}
.ax-authcard .ax-form{gap:14px}
.ax-authcard .ax-in{height:42px}
.ax-authcard .ax-btn.primary{height:42px!important;margin-top:3px;font-weight:650}
.ax-authcard .ax-tabs{padding:4px}
.ax-authcard .ax-tabs button{height:34px}
.ax-nav:empty:after{content:"Aucune page de navigation";display:block;margin:8px;color:var(--muted);font-size:12px}
.ax-stat{position:relative;min-height:108px;padding:18px 20px;border-radius:13px;box-shadow:0 8px 26px -24px rgba(0,0,0,.35);transition:transform .16s ease,border-color .16s ease}
.ax-stat:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--accent) 35%,var(--border))}
.ax-stat span{display:block;line-height:1.45}
.ax-stat b{margin-top:9px;font-size:30px}
.ax-content>.ax-card{box-shadow:0 8px 28px -26px rgba(0,0,0,.45)}
.ax-top{align-items:flex-start;padding:27px 0 20px}
.ax-top h1{font-size:23px}
.ax-link{height:36px;transition:background .14s ease,color .14s ease}
.ax-link.on{box-shadow:inset 2px 0 var(--accent)}
.ax-tabs{display:flex;gap:4px;padding:3px;border-radius:9px;background:var(--alt)}
.ax-tabs button{flex:1;height:30px;border:0;border-radius:7px;background:transparent;color:var(--muted);font:550 13px var(--font);cursor:pointer}
.ax-tabs button.on{background:var(--bg);color:var(--text)}
@media(max-width:860px){
.ax{grid-template-columns:1fr}
.ax-side{position:fixed;z-index:60;left:0;top:0;width:260px;transform:translateX(-100%);transition:transform .2s}
.ax-side.open{transform:none}
.ax-burger{display:grid}
.ax-main{padding:0 16px 48px}
.ax-barrow{grid-template-columns:90px 1fr 30px}
}
@media(prefers-reduced-motion:reduce){.ax *{transition:none!important;animation:none!important}}
`;

export const RUNTIME_JS = String.raw`(() => {
"use strict";
const C = window.__CONTRACT__ || { brand: { name: "AiGENT" }, entities: [], pages: [], nav: [], auth: {} };
const A = window.__APP__ || {};
const SHOT = /[?&]__shot=(guest|user)/.test(location.search);
const TOKEN_KEY = "tok:" + (SHOT ? "shot:" : "") + (A.slug || "site");
const root = document.getElementById("app");
const S = { token: null, user: null, data: {} };
try { S.token = localStorage.getItem(TOKEN_KEY); } catch (_) {}
const ENT = {}; C.entities.forEach((e) => { ENT[e.id] = e; });
const PAGES = C.pages;
const AUTH_ON = !!(C.auth && C.auth.enabled);
const LOGIN = (C.auth && C.auth.path) || "/login";
const firstPage = PAGES.find((p) => C.nav[0] && C.nav[0].pages[0] === p.id) || PAGES[0];
const home = firstPage ? firstPage.path : "/";

/* ── DOM ── */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  (function add(list) {
    for (const c of list) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) add(c);
      else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
  })(kids);
  return el;
}
const ICONS = {
  home: ["M3 11 12 3l9 8", "M5 10v10h14V10"], list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  check: ["M5 12l5 5 9-10"], users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M22 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
  file: ["M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z", "M14 3v6h6"], calendar: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-8", "M22 20H2"], inbox: ["M22 12h-6l-2 3h-4l-2-3H2", "M5 5h14l3 7v7H2v-7z"],
  message: ["M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"], folder: ["M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M12 2v3", "M12 19v3", "M2 12h3", "M19 12h3"], user: ["M20 21a8 8 0 0 0-16 0", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M21 21l-5-5"], tag: ["M20 12l-8 8-9-9V3h8z", "M7.5 7.5h.01"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"], star: ["M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z"],
  shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"], book: ["M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"],
  wallet: ["M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M3 7l12-3v3", "M16 14h.01"], map: ["M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z", "M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  plus: ["M12 5v14", "M5 12h14"], x: ["M6 6l12 12", "M18 6L6 18"], menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"], trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
};
function ico(name, size) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size || 16); s.setAttribute("height", size || 16);
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8");
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
  (ICONS[name] || ICONS.folder).forEach((d) => { const p = document.createElementNS(ns, "path"); p.setAttribute("d", d); s.appendChild(p); });
  return s;
}
const initial = (s) => (String(s || "?").trim().charAt(0) || "?").toUpperCase();
const slug = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
const makeRef = (t) => (slug(t) || "item") + "-" + Math.random().toString(36).slice(2, 6);
const cmp = (a, b) => { const x = Number(a), y = Number(b); if (a !== "" && b !== "" && a != null && b != null && !isNaN(x) && !isNaN(y)) return x - y; return String(a == null ? "" : a).localeCompare(String(b == null ? "" : b), "fr"); };

/* ── Calques (tiroir, dialogue, palette) ── */
const LAYERS = [];
function pushLayer(el, onClose) {
  document.body.appendChild(el);
  const l = { el, close() { el.remove(); const i = LAYERS.indexOf(l); if (i >= 0) LAYERS.splice(i, 1); if (onClose) onClose(); } };
  LAYERS.push(l);
  return l.close;
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && LAYERS.length) LAYERS[LAYERS.length - 1].close();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
});
let toastTimer;
function toast(m) {
  let t = document.getElementById("ax-toast");
  if (!t) { t = h("div", { id: "ax-toast", class: "ax-toast", role: "status", "aria-live": "polite" }); document.body.appendChild(t); }
  t.textContent = m; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 3200);
}
function drawer(title, content) {
  let close;
  const back = h("div", { class: "ax-back" });
  const panel = h("aside", { class: "ax-drawer", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("header", { class: "ax-drawer-h" }, h("h2", null, title), h("button", { class: "ax-icon", type: "button", "aria-label": "Fermer", onclick: () => close() }, ico("x", 16))), content);
  back.appendChild(panel);
  back.addEventListener("mousedown", (ev) => { if (ev.target === back) close(); });
  close = pushLayer(back);
  const first = panel.querySelector("input,select,textarea");
  if (first) setTimeout(() => first.focus(), 30);
  return close;
}
function confirmDialog(text, action) {
  return new Promise((res) => {
    let close;
    const done = (v) => { res(v); close(); };
    const back = h("div", { class: "ax-back ax-center" }, h("div", { class: "ax-dialog", role: "alertdialog", "aria-modal": "true" },
      h("p", null, text),
      h("div", { class: "ax-row-end" }, h("button", { class: "ax-btn", type: "button", onclick: () => done(false) }, "Annuler"), h("button", { class: "ax-btn danger", type: "button", onclick: () => done(true) }, action || "Supprimer"))));
    close = pushLayer(back, () => res(false));
  });
}

/* ── Données ── */
async function api(path, o) {
  o = o || {};
  const headers = { "Content-Type": "application/json" };
  if (S.token) headers.Authorization = "Bearer " + S.token;
  let res;
  try { res = await fetch("/api" + path, { method: o.method || "GET", headers, body: o.body ? JSON.stringify(o.body) : undefined }); }
  catch (_) { return { ok: false, status: 0, message: "Connexion impossible. Vérifiez votre réseau." }; }
  let d = {};
  try { d = await res.json(); } catch (_) {}
  d.status = res.status;
  if (d.ok === undefined) d.ok = res.ok;
  return d;
}
async function load(eid, force) {
  if (!force && S.data[eid]) return S.data[eid];
  const r = await api("/entities/" + eid);
  if (r.status === 401) { const e = new Error("auth"); e.auth = true; throw e; }
  if (!r.ok) throw new Error(r.message || "Les données sont momentanément indisponibles.");
  S.data[eid] = (r.items || []).slice();
  return S.data[eid];
}
const depsOf = (e) => [...new Set([e.id].concat(e.fields.filter((f) => f.kind === "relation" && ENT[f.target]).map((f) => f.target)))];
const loadAll = (e) => Promise.all(depsOf(e).map((id) => load(id)));
const titleOf = (e, r) => String(r[e.titleField] != null && r[e.titleField] !== "" ? r[e.titleField] : r.ref || "#" + r.id);
function refLabel(target, ref) {
  const te = ENT[target];
  const row = (S.data[target] || []).find((x) => x.ref === ref);
  return te && row ? titleOf(te, row) : ref;
}
const fmtDate = (v) => { const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); };
function cell(f, row) {
  const v = row[f.key];
  if (v == null || v === "") return h("span", { class: "ax-mute" }, "—");
  if (f.kind === "enum") { const i = (f.options || []).indexOf(v); return h("span", { class: "ax-badge ax-t" + (i < 0 ? 0 : i % 6) }, v); }
  if (f.kind === "date") return fmtDate(v);
  if (f.kind === "relation") return refLabel(f.target, v);
  if (f.kind === "boolean") return v === "true" ? "Oui" : "Non";
  if (f.kind === "number") return Number(v).toLocaleString("fr-FR");
  const s = String(v);
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
}

/* ── Formulaires ── */
function fieldInput(f, val) {
  if (f.kind === "longtext") { const t = h("textarea", { class: "ax-in", rows: "4" }); t.value = val || ""; return { el: t, get: () => t.value.trim() }; }
  if (f.kind === "enum") { const s = h("select", { class: "ax-in" }, (f.options || []).map((o) => h("option", { value: o }, o))); s.value = val && f.options.indexOf(val) >= 0 ? val : f.options[0]; return { el: s, get: () => s.value }; }
  if (f.kind === "relation") {
    const te = ENT[f.target];
    const s = h("select", { class: "ax-in" }, h("option", { value: "" }, "—"), (S.data[f.target] || []).map((r) => h("option", { value: r.ref }, titleOf(te, r))));
    s.value = val || ""; return { el: s, get: () => s.value };
  }
  if (f.kind === "boolean") { const c = h("input", { type: "checkbox" }); c.checked = val === "true"; return { el: h("div", { class: "ax-check" }, c, h("span", null, "Oui")), get: () => (c.checked ? "true" : "false") }; }
  if (f.kind === "number") { const i = h("input", { class: "ax-in", type: "number", step: "any" }); i.value = val == null ? "" : val; return { el: i, get: () => (i.value === "" ? undefined : Number(i.value)) }; }
  if (f.kind === "date") { const i = h("input", { class: "ax-in", type: "date" }); i.value = val ? String(val).slice(0, 10) : ""; return { el: i, get: () => i.value || undefined }; }
  const i = h("input", { class: "ax-in", type: f.kind === "email" ? "email" : "text", maxlength: "300" });
  i.value = val || ""; return { el: i, get: () => i.value.trim() };
}
function recordForm(e, row, opts) {
  const creating = !row;
  const items = e.fields.filter((f) => f.kind !== "ref").map((f) => ({ f, c: fieldInput(f, row ? row[f.key] : undefined) }));
  const err = h("p", { class: "ax-err", role: "alert", hidden: true });
  const btn = h("button", { class: "ax-btn primary", type: "submit" }, creating ? opts.submitLabel || "Créer" : "Enregistrer");
  return h("form", { class: "ax-form", novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault(); err.hidden = true;
    const data = {};
    for (const it of items) {
      const v = it.c.get(); const empty = v === undefined || v === "";
      if (empty && it.f.required) { err.textContent = "Le champ « " + it.f.label + " » est requis."; err.hidden = false; return; }
      if (empty && creating) continue;
      if (v === undefined) continue;
      data[it.f.key] = v;
    }
    btn.disabled = true;
    let r;
    if (creating) { data.ref = makeRef(data[e.titleField]); r = await api("/entities/" + e.id, { method: "POST", body: data }); }
    else r = await api("/entities/" + e.id + "/" + row.id, { method: "PATCH", body: data });
    btn.disabled = false;
    if (r.status === 401) { gate(); return; }
    if (!r.ok) { err.textContent = r.message || "L'enregistrement a échoué. Vérifiez les champs et réessayez."; err.hidden = false; return; }
    S.data[e.id] = null;
    toast(creating ? "Élément créé." : "Modifications enregistrées.");
    if (opts.onSaved) opts.onSaved();
  } }, items.map((it) => h("label", { class: "ax-field" }, h("span", null, it.f.label + (it.f.required ? " *" : "")), it.c.el)), err, h("div", { class: "ax-row-end" }, opts.extra || null, btn));
}
async function openRecord(e, row) {
  try { await loadAll(e); } catch (er) { if (er.auth) { gate(); return; } }
  let close;
  const del = row ? h("button", { class: "ax-btn danger", type: "button", onclick: async () => {
    if (!(await confirmDialog("Supprimer « " + titleOf(e, row) + " » ? Cette action est définitive."))) return;
    const r = await api("/entities/" + e.id + "/" + row.id, { method: "DELETE" });
    if (!r.ok) { toast(r.message || "La suppression a échoué."); return; }
    S.data[e.id] = null; close(); toast("Élément supprimé."); render();
  } }, ico("trash", 14), "Supprimer") : null;
  const form = recordForm(e, row, { extra: del, onSaved: () => { close(); render(); } });
  close = drawer(row ? titleOf(e, row) : "Nouveau : " + e.label, form);
}

/* ── Vues ── */
const skeleton = () => h("div", { class: "ax-skel" }, h("i"), h("i"), h("i"));
function section(fn) {
  const box = h("div", null, skeleton());
  const run = async () => {
    box.replaceChildren(skeleton());
    try { box.replaceChildren(await fn()); }
    catch (err) {
      if (err.auth) { gate(); return; }
      box.replaceChildren(h("div", { class: "ax-card ax-state" }, h("strong", null, "Chargement impossible"), h("p", { class: "ax-mute" }, err.message), h("button", { class: "ax-btn", type: "button", onclick: run }, "Réessayer")));
    }
  };
  run();
  return box;
}
async function viewTable(v) {
  const e = ENT[v.entity]; await loadAll(e);
  const cols = (v.columns || []).map((k) => e.fields.find((f) => f.key === k)).filter(Boolean);
  const columns = cols.length ? cols : e.fields.filter((f) => f.kind !== "longtext" && f.kind !== "ref").slice(0, 5);
  const sf = e.statusField ? e.fields.find((f) => f.key === e.statusField) : null;
  const st = { q: "", key: null, dir: 1, chip: null };
  const body = h("tbody"); const count = h("span", { class: "ax-mute" });
  const chips = h("div", { class: "ax-chips" });
  const paint = () => {
    let rows = (S.data[e.id] || []).slice();
    if (st.chip && sf) rows = rows.filter((r) => r[sf.key] === st.chip);
    const q = st.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) => e.fields.some((f) => String(r[f.key] == null ? "" : r[f.key]).toLowerCase().indexOf(q) >= 0));
    if (st.key) rows.sort((a, b) => cmp(a[st.key], b[st.key]) * st.dir);
    count.textContent = rows.length + (rows.length > 1 ? " éléments" : " élément");
    body.replaceChildren(...(rows.length ? rows.map((r) => h("tr", { tabindex: "0", onclick: () => openRecord(e, r), onkeydown: (ev) => { if (ev.key === "Enter") openRecord(e, r); } }, columns.map((f) => h("td", null, cell(f, r)))))
      : [h("tr", null, h("td", { colspan: columns.length, class: "ax-empty" }, (S.data[e.id] || []).length ? "Aucun résultat pour ce filtre." : "Aucun élément pour le moment. Utilisez « Ajouter » pour créer le premier."))]));
    if (sf) chips.replaceChildren(...[null].concat(sf.options).map((o) => h("button", { type: "button", class: "ax-chip" + (st.chip === o ? " on" : ""), onclick: () => { st.chip = o; paint(); } }, o || "Tous")));
  };
  const search = h("input", { class: "ax-in", type: "search", placeholder: "Filtrer…", "aria-label": "Filtrer " + e.plural, oninput: () => { st.q = search.value; paint(); } });
  const head = h("tr", null, columns.map((f) => h("th", { onclick: () => { st.dir = st.key === f.key ? -st.dir : 1; st.key = f.key; paint(); } }, f.label)));
  paint();
  return h("section", { class: "ax-card" },
    h("div", { class: "ax-bar" }, h("h2", null, v.title || e.plural), count, h("span", { class: "grow" }), search, h("button", { class: "ax-btn primary", type: "button", onclick: () => openRecord(e, null) }, ico("plus", 14), "Ajouter")),
    sf ? chips : null, h("div", { class: "ax-tw" }, h("table", { class: "ax-table" }, h("thead", null, head), body)));
}
async function viewBoard(v) {
  const e = ENT[v.entity]; await loadAll(e);
  const sf = e.fields.find((f) => f.key === (v.groupBy || e.statusField));
  const meta = e.fields.filter((f) => f.key !== e.titleField && f.key !== sf.key && f.kind !== "longtext" && f.kind !== "ref").slice(0, 2);
  const wrap = h("div", { class: "ax-board" });
  const paint = () => {
    wrap.replaceChildren(...sf.options.map((opt) => {
      const rows = (S.data[e.id] || []).filter((r) => r[sf.key] === opt);
      const col = h("div", { class: "ax-col",
        ondragover: (ev) => { ev.preventDefault(); col.classList.add("over"); }, ondragleave: () => col.classList.remove("over"),
        ondrop: async (ev) => {
          ev.preventDefault(); col.classList.remove("over");
          const row = (S.data[e.id] || []).find((r) => String(r.id) === ev.dataTransfer.getData("text/plain"));
          if (!row || row[sf.key] === opt) return;
          const prev = row[sf.key]; row[sf.key] = opt; paint();
          const r = await api("/entities/" + e.id + "/" + row.id, { method: "PATCH", body: { [sf.key]: opt } });
          if (!r.ok) { row[sf.key] = prev; paint(); toast("Le déplacement n'a pas été enregistré."); }
        } },
        h("div", { class: "ax-col-h" }, h("span", null, opt), h("span", null, rows.length)),
        rows.map((r) => h("button", { type: "button", class: "ax-kcard", draggable: "true", onclick: () => openRecord(e, r),
          ondragstart: (ev) => ev.dataTransfer.setData("text/plain", String(r.id)) },
          h("strong", null, titleOf(e, r)), meta.map((f) => h("small", null, f.label + " : ", cell(f, r))))));
      return col;
    }));
  };
  paint();
  return h("section", { class: "ax-card" }, h("div", { class: "ax-bar" }, h("h2", null, v.title || e.plural), h("span", { class: "grow" }),
    h("button", { class: "ax-btn primary", type: "button", onclick: () => openRecord(e, null) }, ico("plus", 14), "Ajouter")), wrap);
}
async function viewList(v) {
  const e = ENT[v.entity]; await loadAll(e);
  const sub = e.fields.find((f) => f.key !== e.titleField && f.kind !== "longtext" && f.kind !== "ref");
  const rows = S.data[e.id] || [];
  return h("section", { class: "ax-card" }, h("div", { class: "ax-bar" }, h("h2", null, v.title || e.plural), h("span", { class: "grow" }),
    h("button", { class: "ax-btn primary", type: "button", onclick: () => openRecord(e, null) }, ico("plus", 14), "Ajouter")),
    h("div", { class: "ax-list" }, rows.length ? rows.map((r) => h("button", { type: "button", onclick: () => openRecord(e, r) }, h("span", null, titleOf(e, r)), sub ? h("small", null, cell(sub, r)) : null))
      : h("p", { class: "ax-empty ax-mute" }, "Aucun élément pour le moment.")));
}
async function viewStats(v) {
  await Promise.all([...new Set(v.cards.map((c) => c.entity))].map((id) => load(id)));
  return h("div", { class: "ax-stats" }, v.cards.map((c) => {
    let rows = S.data[c.entity] || [];
    if (c.where) rows = rows.filter((r) => String(r[c.where.field]) === String(c.where.equals));
    let val = rows.length;
    if (c.agg !== "count") { const sum = rows.reduce((s, r) => s + (Number(r[c.field]) || 0), 0); val = c.agg === "sum" ? sum : rows.length ? sum / rows.length : 0; }
    return h("div", { class: "ax-card ax-stat" }, h("span", null, c.label), h("b", null, Math.round(val * 100) / 100 + (c.unit ? " " + c.unit : "")));
  }));
}
async function viewChart(v) {
  const e = ENT[v.entity]; await load(e.id);
  const f = e.fields.find((x) => x.key === v.groupBy);
  const counts = f.options.map((o) => ({ o, n: (S.data[e.id] || []).filter((r) => r[f.key] === o).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  return h("section", { class: "ax-card" }, h("h2", { class: "ax-h" }, v.title || e.plural + " par " + f.label.toLowerCase()),
    h("div", { class: "ax-bars" }, counts.map((c) => h("div", { class: "ax-barrow" }, h("span", null, c.o), h("div", null, h("i", { style: "width:" + Math.round((c.n / max) * 100) + "%" })), h("b", null, c.n)))));
}
async function viewForm(v) {
  const e = ENT[v.entity]; await loadAll(e);
  const card = h("section", { class: "ax-card" });
  const mount = () => card.replaceChildren(v.title ? h("h2", { class: "ax-h" }, v.title) : null,
    recordForm(e, null, { submitLabel: v.submitLabel || "Envoyer", onSaved: () => card.replaceChildren(h("div", { class: "ax-state" }, h("strong", null, "Envoyé"), h("p", { class: "ax-mute" }, "Votre saisie a bien été enregistrée."), h("button", { class: "ax-btn", type: "button", onclick: mount }, "Nouvelle saisie"))) }));
  mount(); return card;
}
const viewText = (v) => h("section", { class: "ax-card ax-text" }, v.title ? h("h2", { class: "ax-h", style: "padding:0" }, v.title) : null, String(v.body).split("\n").filter(Boolean).map((p) => h("p", null, p)));
function viewProfile() {
  if (!S.user) return h("section", { class: "ax-card ax-state" }, h("strong", null, "Aucun compte connecté"), h("a", { class: "ax-btn", href: "#" + LOGIN }, "Se connecter"));
  const name = h("input", { class: "ax-in", value: S.user.name || "", maxlength: "80" });
  const err = h("p", { class: "ax-err", hidden: true });
  return h("section", { class: "ax-card" }, h("form", { class: "ax-form", onsubmit: async (ev) => {
    ev.preventDefault(); err.hidden = true;
    const r = await api("/auth/me", { method: "PATCH", body: { name: name.value } });
    if (!r.ok) { err.textContent = r.message || "Le profil n'a pas pu être enregistré."; err.hidden = false; return; }
    S.user = r.customer; toast("Profil enregistré."); render();
  } }, h("label", { class: "ax-field" }, h("span", null, "Nom affiché"), name), h("label", { class: "ax-field" }, h("span", null, "Adresse e-mail"), h("input", { class: "ax-in", value: S.user.email || "", disabled: true })),
    err, h("div", { class: "ax-row-end" }, h("button", { class: "ax-btn", type: "button", onclick: logout }, ico("logout", 14), "Se déconnecter"), h("button", { class: "ax-btn primary", type: "submit" }, "Enregistrer"))));
}
function viewNode(v) {
  switch (v.type) {
    case "table": return section(() => viewTable(v));
    case "board": return section(() => viewBoard(v));
    case "list": return section(() => viewList(v));
    case "stats": return section(() => viewStats(v));
    case "chart": return section(() => viewChart(v));
    case "form": return section(() => viewForm(v));
    case "text": return viewText(v);
    case "profile": return viewProfile();
    default: return null;
  }
}

/* ── Session ── */
function setSession(token, user) { S.token = token; S.user = user; try { localStorage.setItem(TOKEN_KEY, token); } catch (_) {} }
function logout() { S.token = null; S.user = null; S.data = {}; try { localStorage.removeItem(TOKEN_KEY); } catch (_) {} go(LOGIN); render(); }
function authScreen(query) {
  let mode = "login";
  const box = h("div", { class: "ax-authcard" });
  const paint = () => {
    const reg = mode === "register";
    const name = h("input", { class: "ax-in", autocomplete: "name", maxlength: "80" });
    const email = h("input", { class: "ax-in", type: "email", autocomplete: "email", required: true });
    const pass = h("input", { class: "ax-in", type: "password", autocomplete: reg ? "new-password" : "current-password", required: true, minlength: "8" });
    const err = h("p", { class: "ax-err", role: "alert", hidden: true });
    const btn = h("button", { class: "ax-btn primary", type: "submit", style: "height:38px" }, reg ? "Créer mon compte" : "Se connecter");
    box.replaceChildren(
      h("div", { class: "ax-brand", style: "padding:0" }, h("span", { class: "ax-mark" }, initial(C.brand.name)), h("span", null, C.brand.name)),
      h("h1", null, reg ? "Créer votre compte" : "Content de vous revoir"),
      h("div", { class: "ax-tabs", role: "tablist" }, h("button", { type: "button", class: mode === "login" ? "on" : "", onclick: () => { mode = "login"; paint(); } }, "Connexion"), h("button", { type: "button", class: reg ? "on" : "", onclick: () => { mode = "register"; paint(); } }, "Inscription")),
      h("form", { class: "ax-form", style: "padding:0", onsubmit: async (ev) => {
        ev.preventDefault(); err.hidden = true; btn.disabled = true;
        const r = await api(reg ? "/auth/register" : "/auth/login", { method: "POST", body: reg ? { name: name.value, email: email.value, password: pass.value } : { email: email.value, password: pass.value } });
        btn.disabled = false;
        if (!r.ok) { err.textContent = r.message || "Connexion impossible. Réessayez."; err.hidden = false; return; }
        setSession(r.token, r.customer); S.data = {}; go(query.next || home);
      } }, reg ? h("label", { class: "ax-field" }, h("span", null, "Nom complet"), name) : null, h("label", { class: "ax-field" }, h("span", null, "Adresse e-mail"), email), h("label", { class: "ax-field" }, h("span", null, "Mot de passe"), pass), err, btn));
  };
  paint();
  return h("main", { class: "ax-solo" }, box);
}
function gate() { if (AUTH_ON) go(LOGIN + "?next=" + encodeURIComponent(parse().path)); else toast("Cette rubrique n'est pas accessible."); }

/* ── Palette de commandes ── */
function openPalette() {
  if (LAYERS.some((l) => l.el.classList.contains("ax-pal-back"))) return;
  const items = [];
  PAGES.forEach((p) => items.push({ t: p.label, hint: "Page", run: () => go(p.path) }));
  C.entities.forEach((e) => items.push({ t: "Créer : " + e.label, hint: "Action", run: () => openRecord(e, null) }));
  C.entities.forEach((e) => (S.data[e.id] || []).slice(0, 40).forEach((r) => items.push({ t: titleOf(e, r), hint: e.label, run: () => openRecord(e, r) })));
  let idx = 0, shown = [], close;
  const input = h("input", { class: "ax-pal-in", placeholder: "Rechercher une page, un élément, une action…", "aria-label": "Palette de commandes" });
  const list = h("div", { class: "ax-pal-list", role: "listbox" });
  const pick = (k) => { const it = shown[k]; if (!it) return; close(); it.run(); };
  const paint = () => {
    const q = input.value.trim().toLowerCase();
    shown = items.filter((i) => !q || i.t.toLowerCase().indexOf(q) >= 0).slice(0, 12);
    idx = Math.min(idx, Math.max(0, shown.length - 1));
    list.replaceChildren(...(shown.length ? shown.map((i, k) => h("button", { type: "button", role: "option", class: "ax-pal-it" + (k === idx ? " on" : ""), onclick: () => pick(k) }, h("span", null, i.t), h("small", null, i.hint))) : [h("p", { class: "ax-mute ax-pad" }, "Aucun résultat")]));
  };
  const back = h("div", { class: "ax-back ax-pal-back" }, h("div", { class: "ax-pal", role: "dialog", "aria-modal": "true" }, input, list));
  close = pushLayer(back);
  input.addEventListener("input", () => { idx = 0; paint(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, shown.length - 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(idx); }
  });
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  paint(); setTimeout(() => input.focus(), 20);
}

/* ── Coque et routeur ── */
function shell(page, content) {
  const navSections = Array.isArray(C.nav) ? C.nav.filter((sec) => Array.isArray(sec.pages) && sec.pages.some((id) => PAGES.some((p) => p.id === id))) : [];
  if (!navSections.length && PAGES.length) navSections.push({ title: "Navigation", pages: PAGES.map((p) => p.id) });
  const side = h("aside", { class: "ax-side" },
    h("a", { class: "ax-brand", href: "#" + home }, h("span", { class: "ax-mark" }, initial(C.brand.name)), h("span", null, C.brand.name)),
    h("button", { class: "ax-search", type: "button", onclick: openPalette }, ico("search", 14), h("span", null, "Rechercher"), h("kbd", null, "Ctrl K")),
    h("nav", { class: "ax-nav", "aria-label": "Navigation principale" }, navSections.map((sec) => h("div", { class: "ax-sec" }, sec.title ? h("p", { class: "ax-sec-t" }, sec.title) : null,
      sec.pages.map((id) => { const p = PAGES.find((x) => x.id === id); return p ? h("a", { class: "ax-link" + (p.id === page.id ? " on" : ""), href: "#" + p.path, "aria-current": p.id === page.id ? "page" : null }, ico(p.icon, 16), h("span", null, p.label)) : null; })))),
    S.user ? h("div", { class: "ax-user" }, h("span", { class: "ax-avatar" }, initial(S.user.name)), h("span", { class: "grow" }, S.user.name), h("button", { class: "ax-icon", type: "button", "aria-label": "Se déconnecter", onclick: logout }, ico("logout", 16)))
      : AUTH_ON ? h("div", { class: "ax-user" }, h("a", { class: "ax-btn", style: "flex:1", href: "#" + LOGIN }, "Se connecter")) : null);
  const main = h("main", { class: "ax-main", id: "ax-main" },
    h("header", { class: "ax-top" }, h("button", { class: "ax-icon ax-burger", type: "button", "aria-label": "Menu", onclick: () => side.classList.toggle("open") }, ico("menu", 18)),
      h("div", null, h("h1", null, page.title), page.description ? h("p", { class: "ax-mute" }, page.description) : null)), content);
  return [side, main];
}
function parse() {
  const raw = location.hash.replace(/^#/, "");
  const i = raw.indexOf("?");
  const path = (i < 0 ? raw : raw.slice(0, i)) || home;
  const query = {};
  new URLSearchParams(i < 0 ? "" : raw.slice(i + 1)).forEach((v, k) => { query[k] = v; });
  return { path, query };
}
const go = (p) => { location.hash = "#" + p; };
function render() {
  const { path, query } = parse();
  if (AUTH_ON && path === LOGIN) {
    if (S.user) { go(query.next || home); return; }
    root.className = ""; root.replaceChildren(authScreen(query)); document.title = "Connexion · " + C.brand.name; return;
  }
  const page = PAGES.find((p) => p.path === path);
  if (!page) { if (path !== home) go(home); return; }
  if (page.auth && !S.user) { gate(); return; }
  root.className = "ax";
  root.replaceChildren(...shell(page, h("div", { class: "ax-content" }, page.views.map(viewNode))));
  document.title = page.title + " · " + C.brand.name;
  window.scrollTo(0, 0);
}
(async function boot() {
  if (S.token && AUTH_ON) {
    const r = await api("/auth/me");
    if (r.ok && r.customer) S.user = r.customer;
    else if (r.status === 401) { S.token = null; try { localStorage.removeItem(TOKEN_KEY); } catch (_) {} }
  }
  window.addEventListener("hashchange", render);
  render();
})();
})();`;
