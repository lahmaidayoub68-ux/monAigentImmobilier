/* AiGENT — familles de schémas : une grammaire visuelle par famille (aucun organigramme déguisé). */

export const DATA_FAMILIES = new Set([
  "sequence_diagram",
  "state_diagram",
  "er_diagram",
  "class_diagram",
  "quadrant",
  "venn",
]);

const tx = (H, g, x, y, s, cls, anchor = "start") => {
  const t = H.svgn("text", { x, y, class: cls, "text-anchor": anchor }, g);
  t.textContent = s;
  return t;
};
const initials = (s) =>
  String(s)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function buildTree(a) {
  const byId = new Map(a.nodes.map((n) => [n.id, { ...n, kids: [] }])),
    par = new Map();
  a.nodes.forEach((n) => {
    if (n.parent && byId.has(n.parent) && n.parent !== n.id)
      par.set(n.id, n.parent);
  });
  (a.edges || []).forEach((e) => {
    if (!par.has(e.to) && byId.has(e.from) && byId.has(e.to) && e.from !== e.to)
      par.set(e.to, e.from);
  });
  byId.forEach((n, id) => {
    let cur = id,
      k = 0;
    while (par.has(cur) && k++ < 200) cur = par.get(cur);
    if (k >= 200) par.delete(id);
  });
  par.forEach((p, c) => byId.get(p).kids.push(byId.get(c)));
  const roots = [...byId.values()].filter((n) => !par.has(n.id));
  const root =
    (a.rootId && roots.find((r) => r.id === a.rootId)) ||
    roots[0] ||
    [...byId.values()][0];
  roots.forEach((r) => {
    if (r !== root) {
      root.kids.push(r);
      par.set(r.id, root.id);
    }
  });
  return { root, par, byId };
}

/* ═══ CARTE MENTALE : rayonnante, branches courbes effilées, pastilles / soulignés ═══ */
function mindMap(a, g, H) {
  const { root } = buildTree(a);
  const leaves = (n) =>
    (n._l ??= n.kids.length ? n.kids.reduce((s, k) => s + leaves(k), 0) : 1);
  const total = leaves(root),
    r1 = Math.max(210, (total * 34) / (2 * Math.PI) + 120);
  const ring = (d) => (d === 0 ? 0 : r1 + (d - 1) * 250);
  const all = [];
  const lay = (n, a0, a1, d, col) => {
    n.ang = (a0 + a1) / 2;
    n.d = d;
    n.col = col;
    n.x = Math.cos(n.ang) * ring(d);
    n.y = Math.sin(n.ang) * ring(d) * 0.8;
    all.push(n);
    let cur = a0;
    n.kids.forEach((k, i) => {
      const sp = ((a1 - a0) * leaves(k)) / leaves(n);
      lay(
        k,
        cur,
        cur + sp,
        d + 1,
        d === 0 ? H.PALETTE[i % H.PALETTE.length] : col,
      );
      cur += sp;
    });
  };
  lay(root, -Math.PI / 2, Math.PI * 1.5, 0, "#8d79ff");
  const polar = (ang, r) => [Math.cos(ang) * r, Math.sin(ang) * r * 0.8];
  const gB = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g);
  all.forEach((n) =>
    n.kids.forEach((c) => {
      const rm = (ring(n.d) + ring(c.d)) / 2,
        [x1, y1] = n.d === 0 ? [0, 0] : [n.x, n.y];
      const c1 = n.d === 0 ? polar(c.ang, rm * 0.75) : polar(n.ang, rm),
        c2 = polar(c.ang, rm);
      H.svgn(
        "path",
        {
          d: `M${x1} ${y1}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${c.x} ${c.y}`,
          class: "fx-branch",
          stroke: c.col,
          "stroke-width": Math.max(1.8, 9 - c.d * 2.4),
        },
        gB,
      );
    }),
  );
  let x0 = 0,
    x1 = 0,
    y0 = 0,
    y1 = 0;
  const ext = (xa, xb, ya, yb) => {
    x0 = Math.min(x0, xa);
    x1 = Math.max(x1, xb);
    y0 = Math.min(y0, ya);
    y1 = Math.max(y1, yb);
  };
  all.forEach((n) => {
    if (n.d === 0) {
      const ls = H.wrap(n.label, 150, H.LBL),
        w = Math.max(...ls.map((l) => H.measure(l, H.LBL))),
        r = Math.max(58, w / 2 + 22);
      H.svgn("circle", { cx: 0, cy: 0, r, class: "fx-mm-root" }, gN);
      H.svgn("circle", { cx: 0, cy: 0, r: r - 7, class: "fx-mm-root-in" }, gN);
      ls.forEach((l, i) =>
        tx(H, gN, 0, (i - (ls.length - 1) / 2) * 18 + 5, l, "ax-nl", "middle"),
      );
      ext(-r, r, -r, r);
      return;
    }
    const ls = H.wrap(n.label, n.d === 1 ? 170 : 190, H.LBL),
      w = Math.max(...ls.map((l) => H.measure(l, H.LBL)));
    if (n.d === 1) {
      const pw = w + 30,
        ph = ls.length * 18 + 16;
      H.svgn(
        "rect",
        {
          x: n.x - pw / 2,
          y: n.y - ph / 2,
          width: pw,
          height: ph,
          rx: ph / 2,
          fill: n.col,
          class: "fx-mm-top",
        },
        gN,
      );
      ls.forEach((l, i) =>
        tx(
          H,
          gN,
          n.x,
          n.y - ph / 2 + 22 + i * 18 - 4,
          l,
          "fx-mm-top-t",
          "middle",
        ),
      );
      ext(n.x - pw / 2, n.x + pw / 2, n.y - ph / 2, n.y + ph / 2);
    } else {
      const dir = Math.cos(n.ang) >= 0 ? 1 : -1,
        len = w + 18;
      H.svgn(
        "path",
        {
          d: `M${n.x} ${n.y + 3}H${n.x + dir * len}`,
          stroke: n.col,
          class: "fx-mm-line",
        },
        gN,
      );
      ls.forEach((l, i) =>
        tx(
          H,
          gN,
          n.x + dir * 8,
          n.y - 6 - (ls.length - 1 - i) * 17,
          l,
          "ax-nl",
          dir > 0 ? "start" : "end",
        ),
      );
      ext(
        Math.min(n.x, n.x + dir * len),
        Math.max(n.x, n.x + dir * len),
        n.y - ls.length * 17 - 4,
        n.y + 6,
      );
    }
  });
  return { x: x0 - 30, y: y0 - 30, w: x1 - x0 + 60, h: y1 - y0 + 60 };
}

/* ═══ ORGANIGRAMME : arbre à cartes, coudes, départements colorés, liens transverses pointillés ═══ */
function orgChart(a, g, H) {
  const { root, par, byId } = buildTree(a),
    W = 200,
    HC = 66,
    GX = 28,
    GY = 72;
  let leaf = 0;
  const place = (n, d, col) => {
    n.d = d;
    n.col = n.color || col;
    n.w = W;
    n.h = HC;
    const stack = n.kids.length > 3 && n.kids.every((k) => !k.kids.length);
    if (stack) {
      n.cx = leaf * (W + GX) + W / 2;
      leaf++;
      n.cy = d * (HC + GY) + HC / 2;
      n.kids.forEach((k, i) => {
        k.d = d + 1;
        k.col = k.color || n.col;
        k.w = W - 34;
        k.h = 44;
        k.stacked = true;
        k.cx = n.cx + 17;
        k.cy = n.cy + HC / 2 + 22 + i * 54 + 22;
      });
      return;
    }
    if (!n.kids.length) {
      n.cx = leaf * (W + GX) + W / 2;
      leaf++;
    } else {
      n.kids.forEach((k, i) =>
        place(k, d + 1, d === 0 ? H.PALETTE[i % H.PALETTE.length] : n.col),
      );
      n.cx = (n.kids[0].cx + n.kids[n.kids.length - 1].cx) / 2;
    }
    n.cy = d * (HC + GY) + HC / 2;
  };
  place(root, 0, "#5b6477");
  const gE = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g),
    nodes = [...byId.values()].filter((n) => n.cx != null);
  nodes.forEach((n) => {
    if (n.stacked) {
      const px = byId.get(par.get(n.id));
      const rx = px.cx - W / 2 + 14;
      H.svgn(
        "path",
        {
          d: `M${rx} ${px.cy + HC / 2}V${n.cy}H${n.cx - n.w / 2}`,
          class: "fx-rail",
          stroke: n.col,
        },
        gE,
      );
      return;
    }
    n.kids.forEach((k) => {
      if (k.stacked) return;
      const my = n.cy + HC / 2 + GY / 2;
      H.svgn(
        "path",
        {
          d: `M${n.cx} ${n.cy + HC / 2}V${my}H${k.cx}V${k.cy - HC / 2}`,
          class: "fx-rail",
          stroke: k.col,
        },
        gE,
      );
    });
  });
  (a.edges || []).forEach((e) => {
    const A = byId.get(e.from),
      B = byId.get(e.to);
    if (!A || !B || par.get(e.to) === e.from || A.cx == null || B.cx == null)
      return;
    const sx = A.cx + (B.cx > A.cx ? A.w / 2 : -A.w / 2),
      ex = B.cx + (B.cx > A.cx ? -B.w / 2 : B.w / 2);
    H.svgn(
      "path",
      {
        d: `M${sx} ${A.cy}C${(sx + ex) / 2} ${A.cy - 40},${(sx + ex) / 2} ${B.cy - 40},${ex} ${B.cy}`,
        class: "fx-cross",
      },
      gE,
    );
    if (e.label)
      tx(
        H,
        gE,
        (sx + ex) / 2,
        (A.cy + B.cy) / 2 - 34,
        e.label,
        "fx-halo",
        "middle",
      );
  });
  let x0 = 1e9,
    x1 = -1e9,
    y1 = 0;
  nodes.forEach((n) => {
    const x = n.cx - n.w / 2,
      y = n.cy - n.h / 2,
      c = H.svgn("g", { class: "fx-card" }, gN);
    c.style.setProperty("--k", n.col);
    H.svgn(
      "rect",
      { x, y, width: n.w, height: n.h, rx: 10, class: "fx-card-bg" },
      c,
    );
    H.svgn(
      "rect",
      { x, y: y + 8, width: 4, height: n.h - 16, rx: 2, class: "fx-card-bar" },
      c,
    );
    H.svgn(
      "circle",
      { cx: x + 26, cy: n.cy, r: n.stacked ? 12 : 16, class: "fx-avatar" },
      c,
    );
    tx(
      H,
      c,
      x + 26,
      n.cy + (n.stacked ? 4 : 5),
      initials(n.label),
      "fx-avatar-t",
      "middle",
    );
    const lw = n.w - (n.stacked ? 56 : 64),
      ls = H.wrap(n.label, lw, H.LBL).slice(0, 2),
      ds =
        n.detail && !n.stacked ? H.wrap(n.detail, lw, H.DET).slice(0, 1) : [];
    const top = n.cy - ((ls.length + ds.length) * 16) / 2 + 12;
    ls.forEach((l, i) =>
      tx(H, c, x + (n.stacked ? 46 : 52), top + i * 17, l, "ax-nl"),
    );
    ds.forEach((l, i) =>
      tx(H, c, x + 52, top + ls.length * 17 + i * 15, l, "ax-ndetail"),
    );
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x + n.w);
    y1 = Math.max(y1, y + n.h);
  });
  return { x: x0 - 30, y: -30, w: x1 - x0 + 60, h: y1 + 60 };
}

/* ═══ SÉQUENCE : lignes de vie, activations, messages typés ═══ */
function sequence(a, g, H) {
  const P = a.lifelines,
    M = a.messages,
    GAP = 230,
    HW = 150,
    HH = 46,
    STEP = 58,
    top = HH + 56,
    bottom = top + M.length * STEP + 36;
  const xs = new Map(P.map((p, i) => [p.id, i * GAP + HW / 2]));
  const gL = H.svgn("g", {}, g),
    gA = H.svgn("g", {}, g),
    gM = H.svgn("g", {}, g),
    gH = H.svgn("g", {}, g);
  P.forEach((p) => {
    const x = xs.get(p.id);
    H.svgn("path", { d: `M${x} ${HH}V${bottom}`, class: "fx-lifeline" }, gL);
    const h = H.svgn("g", { class: "fx-head" }, gH);
    if (p.kind === "actor") {
      H.svgn("circle", { cx: x, cy: 10, r: 9 }, h);
      H.svgn(
        "path",
        { d: `M${x - 16} 42Q${x - 16} 24 ${x} 24Q${x + 16} 24 ${x + 16} 42` },
        h,
      );
      tx(H, gH, x, HH + 14, p.label, "ax-nl", "middle");
    } else {
      H.svgn("rect", { x: x - HW / 2, y: 0, width: HW, height: HH, rx: 8 }, h);
      H.wrap(p.label, HW - 16, H.LBL)
        .slice(0, 2)
        .forEach((l, i, arr) =>
          tx(
            H,
            gH,
            x,
            HH / 2 + 5 + (i - (arr.length - 1) / 2) * 17,
            l,
            "ax-nl",
            "middle",
          ),
        );
    }
  });
  M.forEach((m, i) => {
    if (m.type === "return" || m.from === m.to) return;
    const y = top + i * STEP;
    let end = y + 34;
    for (let j = i + 1; j < M.length; j++)
      if (M[j].from === m.to && M[j].type === "return") {
        end = top + j * STEP;
        break;
      }
    H.svgn(
      "rect",
      {
        x: xs.get(m.to) - 6,
        y,
        width: 12,
        height: Math.max(24, end - y),
        rx: 2,
        class: "fx-act",
      },
      gA,
    );
  });
  M.forEach((m, i) => {
    const y = top + i * STEP,
      x1 = xs.get(m.from),
      x2 = xs.get(m.to),
      lab = `${i + 1}. ${m.label}`;
    if (m.from === m.to) {
      H.svgn(
        "path",
        {
          d: `M${x1 + 6} ${y}h44v26h-44`,
          class: "fx-msg",
          "marker-end": `url(#${H.id}-arr)`,
        },
        gM,
      );
      tx(H, gM, x1 + 58, y + 6, lab, "fx-halo");
      return;
    }
    const d = Math.sign(x2 - x1);
    H.svgn(
      "path",
      {
        d: `M${x1 + d * 6} ${y}H${x2 - d * 6}`,
        class: `fx-msg${m.type === "return" ? " is-return" : m.type === "async" ? " is-async" : ""}`,
        "marker-end": `url(#${H.id}-arr)`,
      },
      gM,
    );
    tx(H, gM, (x1 + x2) / 2, y - 8, lab, "fx-halo", "middle");
    if (m.note) {
      const nx = Math.max(x1, x2) + 14;
      H.svgn(
        "rect",
        {
          x: nx,
          y: y - 12,
          width: H.measure(m.note, H.DET) + 16,
          height: 24,
          rx: 4,
          class: "fx-note",
        },
        gM,
      );
      tx(H, gM, nx + 8, y + 4, m.note, "ax-ndetail");
    }
  });
  return { x: -30, y: -20, w: (P.length - 1) * GAP + HW + 160, h: bottom + 50 };
}

/* ═══ ÉTATS / TRANSITIONS ═══ */
function stateDiagram(a, g, H) {
  const S = a.states.map((s) => ({ ...s })),
    by = new Map(S.map((s) => [s.id, s]));
  S.forEach((s) => {
    s.lines = H.wrap(s.label, 150, H.LBL);
    const tw = Math.max(80, ...s.lines.map((l) => H.measure(l, H.LBL)));
    if (s.kind === "start") s.w = s.h = 22;
    else if (s.kind === "end") s.w = s.h = 30;
    else if (s.kind === "choice") s.w = s.h = 46;
    else {
      s.w = tw + 38;
      s.h = s.lines.length * 18 + (s.detail ? 20 : 0) + 22;
    }
  });
  const start = S.find((s) => s.kind === "start") || S[0],
    layer = new Map([[start.id, 0]]),
    q = [start];
  while (q.length) {
    const u = q.shift();
    a.transitions.forEach((t) => {
      if (t.from === u.id && !layer.has(t.to) && by.has(t.to)) {
        layer.set(t.to, layer.get(u.id) + 1);
        q.push(by.get(t.to));
      }
    });
  }
  S.forEach((s) => {
    if (!layer.has(s.id)) layer.set(s.id, Math.max(...layer.values()) + 1);
  });
  const cols = new Map();
  S.forEach((s) => {
    const l = layer.get(s.id);
    if (!cols.has(l)) cols.set(l, []);
    cols.get(l).push(s);
  });
  let x = 0,
    maxY = 0;
  [...cols.keys()]
    .sort((p, q2) => p - q2)
    .forEach((l) => {
      const col = cols.get(l),
        w = Math.max(...col.map((s) => s.w));
      col.forEach((s, i) => {
        s.x = x + w / 2;
        s.y = (i - (col.length - 1) / 2) * 130;
        maxY = Math.max(maxY, Math.abs(s.y) + s.h);
      });
      x += w + 120;
    });
  const gE = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g);
  const rim = (A, B) => {
    const dx = B.x - A.x,
      dy = B.y - A.y;
    if (!dx && !dy) return { x: A.x, y: A.y };
    const k =
      A.kind === "choice"
        ? 1 / (Math.abs(dx) / (A.w / 2) + Math.abs(dy) / (A.h / 2))
        : Math.min(
            dx ? A.w / 2 / Math.abs(dx) : 1e9,
            dy ? A.h / 2 / Math.abs(dy) : 1e9,
          );
    return { x: A.x + dx * k, y: A.y + dy * k };
  };
  a.transitions.forEach((t) => {
    const A = by.get(t.from),
      B = by.get(t.to);
    if (!A || !B) return;
    let d, lx, ly;
    if (A === B) {
      const x1 = A.x - 18,
        x2 = A.x + 18,
        yy = A.y - A.h / 2;
      d = `M${x1} ${yy}C${x1 - 14} ${yy - 52},${x2 + 14} ${yy - 52},${x2} ${yy}`;
      lx = A.x;
      ly = yy - 46;
    } else {
      const p0 = rim(A, B),
        p1 = rim(B, A),
        back = a.transitions.some((u) => u.from === t.to && u.to === t.from),
        dx = p1.x - p0.x,
        dy = p1.y - p0.y,
        len = Math.hypot(dx, dy) || 1,
        off = back ? 34 : Math.abs(dy) < 2 ? 0 : 18;
      const cx = (p0.x + p1.x) / 2 - (dy / len) * off,
        cy = (p0.y + p1.y) / 2 + (dx / len) * off;
      d = `M${p0.x} ${p0.y}Q${cx} ${cy} ${p1.x} ${p1.y}`;
      lx = (p0.x + 2 * cx + p1.x) / 4;
      ly = (p0.y + 2 * cy + p1.y) / 4;
    }
    H.svgn(
      "path",
      { d, class: "fx-trans", "marker-end": `url(#${H.id}-arr)` },
      gE,
    );
    if (t.label) {
      const tw = H.measure(t.label, H.DET) + 14;
      H.svgn(
        "rect",
        {
          x: lx - tw / 2,
          y: ly - 11,
          width: tw,
          height: 22,
          rx: 11,
          class: "fx-tl-bg",
        },
        gE,
      );
      tx(H, gE, lx, ly + 4, t.label, "ax-ndetail", "middle");
    }
  });
  S.forEach((s) => {
    const c = H.svgn("g", { class: "fx-state" }, gN);
    if (s.kind === "start")
      H.svgn("circle", { cx: s.x, cy: s.y, r: 11, class: "fx-start" }, c);
    else if (s.kind === "end") {
      H.svgn("circle", { cx: s.x, cy: s.y, r: 15, class: "fx-end" }, c);
      H.svgn("circle", { cx: s.x, cy: s.y, r: 8, class: "fx-start" }, c);
    } else if (s.kind === "choice") {
      H.svgn(
        "path",
        {
          d: `M${s.x} ${s.y - 23}L${s.x + 23} ${s.y}L${s.x} ${s.y + 23}L${s.x - 23} ${s.y}Z`,
          class: "fx-choice",
        },
        c,
      );
    } else {
      H.svgn(
        "rect",
        {
          x: s.x - s.w / 2,
          y: s.y - s.h / 2,
          width: s.w,
          height: s.h,
          rx: 14,
          class: "fx-st-box",
        },
        c,
      );
      const top = s.y - s.h / 2 + 22;
      s.lines.forEach((l, i) =>
        tx(H, c, s.x, top + i * 18, l, "ax-nl", "middle"),
      );
      if (s.detail)
        tx(
          H,
          c,
          s.x,
          top + s.lines.length * 18 + 2,
          s.detail.slice(0, 34),
          "ax-ndetail",
          "middle",
        );
    }
  });
  return { x: -90, y: -maxY - 90, w: x + 60, h: maxY * 2 + 180 };
}

/* ═══ ER / CLASSES : tables à champs typés, clés, cardinalités ═══ */
function erDiagram(a, g, H) {
  const isClass = a.semanticType === "class_diagram";
  const E = a.entities.map((e) => {
    const f = e.fields || [],
      m = isClass ? e.methods || [] : [];
    const w = Math.min(
      320,
      Math.max(
        170,
        H.measure(e.name, H.LBL) + 50,
        ...f.map(
          (x) => H.measure(x.name, H.DET) + H.measure(x.type || "", H.DET) + 74,
        ),
      ),
    );
    return {
      ...e,
      fields: f,
      methods: m,
      w,
      h: 42 + f.length * 24 + (m.length ? 14 + m.length * 22 : 0),
    };
  });
  const by = new Map(E.map((e) => [e.id, e])),
    deg = new Map(E.map((e) => [e.id, 0]));
  (a.relations || []).forEach((r) => {
    deg.set(r.from, (deg.get(r.from) || 0) + 1);
    deg.set(r.to, (deg.get(r.to) || 0) + 1);
  });
  const order = [...E].sort((p, q) => deg.get(q.id) - deg.get(p.id)),
    cols = Math.max(2, Math.ceil(Math.sqrt(E.length * 1.3)));
  const colW = [],
    rowH = [];
  order.forEach((e, i) => {
    const c = i % cols,
      r = Math.floor(i / cols);
    colW[c] = Math.max(colW[c] || 0, e.w);
    rowH[r] = Math.max(rowH[r] || 0, e.h);
  });
  order.forEach((e, i) => {
    const c = i % cols,
      r = Math.floor(i / cols);
    e.x = colW.slice(0, c).reduce((s, w) => s + w + 120, 0);
    e.y = rowH.slice(0, r).reduce((s, h) => s + h + 100, 0);
    e.cx = e.x + e.w / 2;
    e.cy = e.y + e.h / 2;
  });
  const gE = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g);
  const side = (A, B) => {
    const dx = B.cx - A.cx,
      dy = B.cy - A.cy;
    return Math.abs(dx) * A.h > Math.abs(dy) * A.w
      ? dx > 0
        ? { x: A.x + A.w, y: A.cy, s: "r" }
        : { x: A.x, y: A.cy, s: "l" }
      : dy > 0
        ? { x: A.cx, y: A.y + A.h, s: "b" }
        : { x: A.cx, y: A.y, s: "t" };
  };
  (a.relations || []).forEach((r) => {
    const A = by.get(r.from),
      B = by.get(r.to);
    if (!A || !B) return;
    const p = side(A, B),
      q = side(B, A),
      hz = (s) => s === "l" || s === "r";
    let d;
    if (hz(p.s) && hz(q.s)) {
      const mx = (p.x + q.x) / 2;
      d = `M${p.x} ${p.y}H${mx}V${q.y}H${q.x}`;
    } else if (!hz(p.s) && !hz(q.s)) {
      const my = (p.y + q.y) / 2;
      d = `M${p.x} ${p.y}V${my}H${q.x}V${q.y}`;
    } else if (hz(p.s)) d = `M${p.x} ${p.y}H${q.x}V${q.y}`;
    else d = `M${p.x} ${p.y}V${q.y}H${q.x}`;
    H.svgn(
      "path",
      {
        d,
        class: "fx-rel",
        ...(r.kind === "inherit"
          ? { "stroke-dasharray": "6 4", "marker-end": `url(#${H.id}-arr)` }
          : {}),
      },
      gE,
    );
    const badge = (pt, txt) => {
      if (!txt) return;
      const dx = pt.s === "r" ? 12 : pt.s === "l" ? -12 : 10,
        dy = pt.s === "b" ? 14 : pt.s === "t" ? -8 : -8;
      tx(H, gE, pt.x + dx, pt.y + dy, txt, "fx-card-no", "middle");
    };
    badge(p, r.card?.[0]);
    badge(q, r.card?.[1]);
    if (r.label)
      tx(
        H,
        gE,
        (p.x + q.x) / 2,
        (p.y + q.y) / 2 - 7,
        r.label,
        "fx-halo",
        "middle",
      );
  });
  E.forEach((e) => {
    const c = H.svgn("g", { class: "fx-ent" }, gN);
    H.svgn(
      "rect",
      { x: e.x, y: e.y, width: e.w, height: e.h, rx: 8, class: "fx-ent-bg" },
      c,
    );
    H.svgn(
      "path",
      { d: `M${e.x} ${e.y + 42}H${e.x + e.w}`, class: "fx-ent-sep" },
      c,
    );
    H.svgn(
      "path",
      {
        d: `M${e.x} ${e.y + 8}Q${e.x} ${e.y} ${e.x + 8} ${e.y}H${e.x + e.w - 8}Q${e.x + e.w} ${e.y} ${e.x + e.w} ${e.y + 8}V${e.y + 42}H${e.x}Z`,
        class: "fx-ent-head",
      },
      c,
    );
    if (e.stereotype)
      tx(H, c, e.cx, e.y + 14, `«${e.stereotype}»`, "ax-ndetail", "middle");
    tx(H, c, e.cx, e.y + (e.stereotype ? 33 : 27), e.name, "ax-nl", "middle");
    e.fields.forEach((f, i) => {
      const y = e.y + 42 + 17 + i * 24;
      if (f.key)
        tx(
          H,
          c,
          e.x + 12,
          y,
          f.key === "pk" ? "PK" : "FK",
          `fx-key is-${f.key}`,
        );
      tx(H, c, e.x + (f.key ? 38 : 14), y, f.name, "ax-nl is-field");
      if (f.type) tx(H, c, e.x + e.w - 12, y, f.type, "ax-ndetail", "end");
    });
    if (e.methods.length) {
      const my = e.y + 42 + e.fields.length * 24 + 6;
      H.svgn(
        "path",
        { d: `M${e.x} ${my}H${e.x + e.w}`, class: "fx-ent-sep" },
        c,
      );
      e.methods.forEach((m, i) =>
        tx(H, c, e.x + 14, my + 17 + i * 22, m, "ax-ndetail"),
      );
    }
  });
  const W = Math.max(...E.map((e) => e.x + e.w)),
    Hh = Math.max(...E.map((e) => e.y + e.h));
  return { x: -40, y: -40, w: W + 80, h: Hh + 80 };
}

/* ═══ QUADRANT ═══ */
function quadrant(a, g, H) {
  const W = 680,
    Hh = 520,
    ax = a.axes || {},
    qs = a.quadrants || [];
  const pos = [
    [0, 0],
    [W / 2, 0],
    [0, Hh / 2],
    [W / 2, Hh / 2],
  ];
  pos.forEach(([x, y], i) => {
    H.svgn(
      "rect",
      {
        x,
        y,
        width: W / 2,
        height: Hh / 2,
        class: "fx-quad",
        fill: H.PALETTE[[1, 3, 4, 0][i]],
      },
      g,
    );
    if (qs[i])
      tx(
        H,
        g,
        x + (i % 2 ? W / 2 - 14 : 14),
        y + 26,
        qs[i],
        "fx-qtitle",
        i % 2 ? "end" : "start",
      );
  });
  H.svgn(
    "path",
    {
      d: `M0 ${Hh}H${W}M0 0V${Hh}`,
      class: "ax-axis",
      "marker-end": `url(#${H.id}-arr)`,
    },
    g,
  );
  H.svgn(
    "path",
    { d: `M${W / 2} 0V${Hh}M0 ${Hh / 2}H${W}`, class: "fx-qmid" },
    g,
  );
  tx(H, g, W / 2, Hh + 34, ax.xLabel || "", "ax-axis-title", "middle");
  tx(H, g, 0, Hh + 18, ax.x?.[0] || "", "ax-ndetail");
  tx(H, g, W, Hh + 18, ax.x?.[1] || "", "ax-ndetail", "end");
  const yl = tx(H, g, -34, Hh / 2, ax.yLabel || "", "ax-axis-title", "middle");
  yl.setAttribute("transform", `rotate(-90 -34 ${Hh / 2})`);
  tx(H, g, -8, Hh, ax.y?.[0] || "", "ax-ndetail", "end");
  tx(H, g, -8, 12, ax.y?.[1] || "", "ax-ndetail", "end");
  const groups = [...new Set(a.items.map((i) => i.group || ""))],
    placed = [];
  a.items.forEach((it) => {
    const x = Math.min(1, Math.max(0, it.x)) * W,
      y = (1 - Math.min(1, Math.max(0, it.y))) * Hh,
      col = H.PALETTE[groups.indexOf(it.group || "") % H.PALETTE.length];
    H.svgn("circle", { cx: x, cy: y, r: 8, fill: col, class: "fx-q-dot" }, g);
    const left = x > W * 0.78,
      w = H.measure(it.label, H.LBL);
    let ly = y + 4;
    while (
      placed.some((p) => Math.abs(p.y - ly) < 16 && Math.abs(p.x - x) < w + 40)
    )
      ly += 17;
    placed.push({ x, y: ly });
    tx(
      H,
      g,
      left ? x - 14 : x + 14,
      ly,
      it.label,
      "fx-halo is-bold",
      left ? "end" : "start",
    );
  });
  return { x: -90, y: -20, w: W + 160, h: Hh + 80 };
}

/* ═══ VENN (2–3 ensembles) ═══ */
function venn(a, g, H) {
  const S = a.sets.slice(0, 3),
    r = 170;
  const C =
    S.length === 2
      ? [
          [-r * 0.55, 0],
          [r * 0.55, 0],
        ]
      : [
          [0, -r * 0.55],
          [-r * 0.62, r * 0.4],
          [r * 0.62, r * 0.4],
        ];
  S.forEach((s, i) =>
    H.svgn(
      "circle",
      { cx: C[i][0], cy: C[i][1], r, fill: H.PALETTE[i], class: "fx-venn" },
      g,
    ),
  );
  S.forEach((s, i) => {
    const [cx, cy] = C[i],
      n = Math.hypot(cx, cy) || 1,
      ox = S.length === 2 ? (i ? 1 : -1) : cx / n,
      oy = S.length === 2 ? 0 : cy / n;
    tx(
      H,
      g,
      cx + ox * (r + 24),
      cy + oy * (r + 24) + (oy < 0 ? -6 : 14),
      s.label,
      "ax-nl is-big",
      ox > 0.3 ? "start" : ox < -0.3 ? "end" : "middle",
    );
    (s.items || [])
      .slice(0, 5)
      .forEach((t, k) =>
        tx(
          H,
          g,
          cx + ox * r * 0.5,
          cy + oy * r * 0.5 + (k - 2) * 17,
          t.slice(0, 26),
          "ax-ndetail",
          "middle",
        ),
      );
  });
  (a.overlaps || []).forEach((o) => {
    const idx = o.sets
      .map((id) => S.findIndex((s) => s.id === id))
      .filter((i) => i >= 0);
    if (idx.length < 2) return;
    const x =
        (idx.reduce((s, i) => s + C[i][0], 0) / idx.length) *
        (idx.length === 3 ? 0 : 1),
      y =
        (idx.reduce((s, i) => s + C[i][1], 0) / idx.length) *
          (idx.length === 3 ? 0 : 1) +
        (idx.length === 3 ? 12 : 0);
    H.wrap(o.label, 100, H.DET)
      .slice(0, 3)
      .forEach((l, k) =>
        tx(H, g, x, y + k * 15, l, "fx-halo is-bold", "middle"),
      );
  });
  return { x: -r * 2.1, y: -r * 1.7, w: r * 4.2, h: r * 3.6 };
}

export const FAMILIES = {
  mind_map: mindMap,
  org_chart: orgChart,
  sequence_diagram: sequence,
  state_diagram: stateDiagram,
  er_diagram: erDiagram,
  class_diagram: erDiagram,
  quadrant,
  venn,
};
