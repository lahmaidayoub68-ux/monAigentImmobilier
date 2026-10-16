/* AiGENT — shell partagé Chat + Work */
const LS = localStorage,
  root = document.documentElement,
  token = () => LS.getItem("aigent_token");
const ACCENTS = {
  violet: ["#8d79ff", "#6a55e6"],
  bleu: ["#4f8fe0", "#2f6fc4"],
  vert: ["#2fa38a", "#1f8570"],
  orange: ["#e0884a", "#c46a2c"],
  rose: ["#d4587a", "#b8405f"],
  graphite: ["#9aa4b2", "#5b6477"],
};
const PREFS = {
  accent: LS.getItem("aigent_accent") || "violet",
  size: Number(LS.getItem("aigent_size")) || 100,
  density: LS.getItem("aigent_density") || "comfortable",
  focus: LS.getItem("aigent_focus") === "1",
};
const el = (t, c, x) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (x != null) n.textContent = x;
  return n;
};
const fold = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const rel = (v) => {
  const d = (Date.now() - new Date(v)) / 1000;
  return d < 60
    ? "à l’instant"
    : d < 3600
      ? `il y a ${Math.floor(d / 60)} min`
      : d < 86400
        ? `il y a ${Math.floor(d / 3600)} h`
        : d < 604800
          ? `il y a ${Math.floor(d / 86400)} j`
          : new Date(v).toLocaleDateString("fr-FR");
};
const go = (u) => (location.href = u),
  click = (s) => document.querySelector(s)?.click(),
  onChat = () => !!document.querySelector("#thinkingInput");
const typing = () =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) ||
  document.activeElement?.isContentEditable;

function applyPrefs() {
  const [dk, lt] = ACCENTS[PREFS.accent] || ACCENTS.violet,
    c = root.dataset.theme === "light" ? lt : dk;
  root.style.setProperty("--acc", c);
  root.style.setProperty("--thinking-accent", c);
  root.style.setProperty("--ui-scale", PREFS.size / 100);
  root.dataset.density = PREFS.density;
  root.classList.toggle("is-focus", PREFS.focus);
  let chip = document.querySelector(".sh-focus-chip");
  if (PREFS.focus && !chip) {
    chip = el("button", "sh-focus-chip", "Quitter le mode focus (F)");
    chip.type = "button";
    chip.onclick = () => setPref("focus", false);
    document.body.append(chip);
  } else if (!PREFS.focus) chip?.remove();
}
function setPref(k, v) {
  PREFS[k] = v;
  LS.setItem(`aigent_${k}`, k === "focus" ? (v ? "1" : "0") : v);
  applyPrefs();
}
new MutationObserver(applyPrefs).observe(root, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
applyPrefs();

/* palette de commandes */
let remote = { at: 0, conv: [], proj: [] };
async function loadRemote() {
  if (Date.now() - remote.at < 60000) return;
  const get = (p) =>
    fetch(p, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  const [c, p] = await Promise.all([
    get("/api/aigent/chat/conversations"),
    get("/api/aigent/projects"),
  ]);
  remote = {
    at: Date.now(),
    conv: c?.conversations || [],
    proj: p?.projects || [],
  };
}
const commands = () => [
  { g: "Navigation", l: "Chat AiGENT", run: () => go("./aigent-chat.html") },
  {
    g: "Navigation",
    l: "Work · créer un AiGENT",
    run: () => go("./aigent.html"),
  },
  {
    g: "Navigation",
    l: "Mes AiGENT",
    run: () => go("./aigent.html?view=mine"),
  },
  {
    g: "Navigation",
    l: "Paramètres",
    run: () => go("./aigent.html?view=settings"),
  },
  {
    g: "Actions",
    l: "Nouvelle conversation",
    k: "N",
    run: () =>
      onChat() ? click("#newConversation") : go("./aigent-chat.html"),
  },
  {
    g: "Actions",
    l: "Basculer le thème clair / sombre",
    run: () => click("#chatTheme") || click("#themeBtn"),
  },
  {
    g: "Actions",
    l: "Mode focus",
    k: "F",
    run: () => setPref("focus", !PREFS.focus),
  },
  {
    g: "Actions",
    l: "Exporter la conversation (Markdown)",
    when: onChat,
    run: () => click("#exportConversation"),
  },
  {
    g: "Actions",
    l: "Afficher / masquer le panneau de droite",
    when: onChat,
    run: () => click("#chatPanelToggle"),
  },
  ...["think", "advisor", "decide", "debate", "perspectives", "create"].map(
    (m) => ({
      g: "Modes",
      l: `Mode ${m[0].toUpperCase()}${m.slice(1)}`,
      when: onChat,
      run: () => click(`.thinking-mode[data-mode="${m}"]`),
    }),
  ),
  ...Object.keys(ACCENTS).map((a) => ({
    g: "Apparence",
    l: `Accent · ${a}`,
    run: () => setPref("accent", a),
  })),
  {
    g: "Apparence",
    l: "Texte plus grand",
    run: () => setPref("size", Math.min(125, PREFS.size + 5)),
  },
  {
    g: "Apparence",
    l: "Texte plus petit",
    run: () => setPref("size", Math.max(85, PREFS.size - 5)),
  },
  {
    g: "Apparence",
    l: "Taille du texte par défaut",
    run: () => setPref("size", 100),
  },
  {
    g: "Apparence",
    l: PREFS.density === "compact" ? "Densité confortable" : "Densité compacte",
    run: () =>
      setPref(
        "density",
        PREFS.density === "compact" ? "comfortable" : "compact",
      ),
  },
  { g: "Aide", l: "Raccourcis clavier", k: "?", run: showHelp },
];
const score = (q, t) => {
  if (!q) return 1;
  t = fold(t);
  q = fold(q);
  const i = t.indexOf(q);
  if (i >= 0) return 100 - i;
  let k = 0;
  for (const c of t) if (c === q[k]) k++;
  return k === q.length ? 10 : 0;
};
function openPalette() {
  if (document.querySelector(".sh-pal")) return;
  const ov = el("div", "sh-pal"),
    box = el("div", "sh-pal-box"),
    inp = el("input", "sh-pal-in"),
    list = el("div", "sh-pal-list");
  inp.placeholder = "Rechercher une action, une conversation, un projet…";
  box.append(
    inp,
    list,
    el("div", "sh-pal-foot", "↑↓ naviguer · ↵ ouvrir · Échap fermer"),
  );
  ov.append(box);
  document.body.append(ov);
  inp.focus();
  let items = [],
    sel = 0;
  const close = () => ov.remove();
  const paint = () => {
    const q = inp.value.trim(),
      all = [
        ...commands().filter((c) => !c.when || c.when()),
        ...remote.conv.map((c) => ({
          g: "Conversations",
          l: c.title,
          h: rel(c.updated_at),
          run: () => go(`./aigent-chat.html?conversation=${c.id}`),
        })),
        ...remote.proj.map((p) => ({
          g: "Projets",
          l: p.name,
          h: p.category || "Projet",
          run: () => go(`./aigent.html?project=${p.id}`),
        })),
      ];
    items = q
      ? all
          .map((c) => [c, score(q, c.l)])
          .filter((x) => x[1])
          .sort((a, b) => b[1] - a[1])
          .map((x) => x[0])
          .slice(0, 40)
      : [
          ...all.filter((c) => c.g !== "Conversations" && c.g !== "Projets"),
          ...all.filter((c) => c.g === "Conversations").slice(0, 5),
        ];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.replaceChildren();
    if (!items.length)
      return list.append(el("div", "sh-pal-empty", "Aucun résultat."));
    let g = "";
    items.forEach((c, i) => {
      if (c.g !== g) {
        g = c.g;
        list.append(el("div", "sh-pal-group", g));
      }
      const b = el("button", `sh-pal-item${i === sel ? " is-sel" : ""}`, c.l);
      b.type = "button";
      if (c.k) b.append(el("kbd", null, c.k));
      else if (c.h) b.append(el("small", null, c.h));
      b.onmouseenter = () => {
        sel = i;
        list
          .querySelectorAll(".sh-pal-item")
          .forEach((n, k) => n.classList.toggle("is-sel", k === i));
      };
      b.onclick = () => {
        close();
        c.run();
      };
      list.append(b);
    });
    list.querySelector(".is-sel")?.scrollIntoView({ block: "nearest" });
  };
  inp.oninput = () => {
    sel = 0;
    paint();
  };
  ov.onclick = (e) => e.target === ov && close();
  ov.onkeydown = (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      sel = Math.min(items.length - 1, sel + 1);
      paint();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      sel = Math.max(0, sel - 1);
      paint();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = items[sel];
      if (c) {
        close();
        c.run();
      }
    }
  };
  paint();
  loadRemote().then(() => ov.isConnected && paint());
}
function showHelp() {
  if (document.querySelector(".sh-pal")) return;
  const ov = el("div", "sh-pal"),
    box = el("div", "sh-pal-box sh-help");
  box.append(el("h3", null, "Raccourcis clavier"));
  const dl = el("dl");
  [
    ["Ctrl/⌘ + K", "Palette de commandes"],
    ["F", "Mode focus"],
    ["/", "Aller au champ de saisie"],
    ["Échap", "Fermer le panneau ou la fenêtre"],
    ["[  ]", "Section précédente / suivante d'un document"],
    ["?", "Cette aide"],
  ].forEach(([k, d]) => {
    dl.append(el("dt"));
    dl.lastChild.append(el("kbd", null, k));
    dl.append(el("dd", null, d));
  });
  box.append(dl);
  ov.append(box);
  ov.onclick = (e) => e.target === ov && ov.remove();
  document.body.append(ov);
  ov.tabIndex = -1;
  ov.focus();
  ov.onkeydown = (e) => e.key === "Escape" && ov.remove();
}
addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openPalette();
  } else if (!typing() && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      setPref("focus", !PREFS.focus);
    } else if (e.key === "?") {
      e.preventDefault();
      showHelp();
    }
  }
});

/* glisser-déposer de fichiers */
let depth = 0;
const dz = el("div", "sh-drop", "Déposez vos fichiers pour les joindre"),
  isFiles = (e) => e.dataTransfer?.types?.includes("Files");
addEventListener("dragenter", (e) => {
  if (isFiles(e)) {
    depth++;
    document.body.append(dz);
  }
});
addEventListener("dragleave", (e) => {
  if (isFiles(e) && --depth <= 0) {
    depth = 0;
    dz.remove();
  }
});
addEventListener("dragover", (e) => isFiles(e) && e.preventDefault());
addEventListener("drop", (e) => {
  if (!isFiles(e)) return;
  e.preventDefault();
  depth = 0;
  dz.remove();
  const input = document.querySelector("#chatFileInput, #attachmentInput");
  if (!input || !e.dataTransfer.files.length) return;
  const dt = new DataTransfer();
  [...e.dataTransfer.files].forEach((f) => dt.items.add(f));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
});

/* brouillon auto-sauvegardé */
const ta = document.querySelector("#thinkingInput, #input");
if (ta) {
  const key = `aigent_draft:${location.pathname.split("/").pop()}`;
  let t;
  if (!ta.value) {
    const d = LS.getItem(key);
    if (d) {
      ta.value = d;
      ta.dispatchEvent(new Event("input"));
    }
  }
  ta.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(
      () => (ta.value.trim() ? LS.setItem(key, ta.value) : LS.removeItem(key)),
      400,
    );
  });
  ta.closest("form")?.addEventListener(
    "submit",
    () => setTimeout(() => !ta.value.trim() && LS.removeItem(key), 60),
    true,
  );
}
/* connexion */
const net = el(
  "div",
  "sh-net",
  "Connexion perdue : votre saisie est conservée localement.",
);
addEventListener("offline", () => document.body.append(net));
addEventListener("online", () => net.remove());
window.AiGENT = { prefs: PREFS, ACCENTS, setPref, rel, openPalette, showHelp };
