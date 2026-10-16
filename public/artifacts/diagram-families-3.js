/* AiGENT — familles v3 : blocs, séquentiel, arborescence, pyramide, étoile, communication, Ishikawa, SWOT, graphiques + cadres. */
import { buildTree } from "./diagram-families.js";
export const DATA_FAMILIES_3 = new Set(["charts"]);
const tx = (H, g, x, y, s, cls, anchor = "start") => {
  const t = H.svgn("text", { x, y, class: cls, "text-anchor": anchor }, g);
  t.textContent = s;
  return t;
};
const graphOf = (a) => ({
  nodes: (a.nodes || []).map((n) => ({ ...n })),
  edges: (a.edges || []).map((e) => ({ ...e })),
});
const lines = (
  H,
  g,
  x,
  y,
  text,
  w,
  cls,
  step = 16,
  max = 4,
  anchor = "start",
) =>
  H.wrap(text, w, cls === "ax-nl" ? H.LBL : H.DET)
    .slice(0, max)
    .forEach((l, i) => tx(H, g, x, y + i * step, l, cls, anchor));

function blocks(a, g, H) {
  const { nodes } = graphOf(a),
    kind = (n) =>
      /entr|input|source/i.test(n.group || "")
        ? "in"
        : /sort|output|r[ée]sultat/i.test(n.group || "")
          ? "out"
          : "fn";
  let ins = nodes.filter((n) => kind(n) === "in"),
    outs = nodes.filter((n) => kind(n) === "out"),
    fns = nodes.filter((n) => kind(n) === "fn");
  if (!ins.length && !outs.length && fns.length >= 4) {
    ins = [fns.shift()];
    outs = [fns.pop()];
  }
  const BW = 170,
    BH = 56,
    GP = 20,
    cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(fns.length)))),
    rows = Math.max(1, Math.ceil(fns.length / cols)),
    SW = cols * (BW + GP) + GP,
    SH = Math.max(
      rows * (BH + GP) + GP + 36,
      Math.max(ins.length, outs.length) * (BH + GP) + GP,
    ),
    X0 = 240;
  H.svgn(
    "rect",
    { x: X0, y: 0, width: SW, height: SH, rx: 14, class: "fx-bk-sys" },
    g,
  );
  tx(H, g, X0 + 16, 24, a.title || "Système", "ax-nl");
  const chip = (n, x, y, cls) => {
    H.svgn("rect", { x, y, width: BW, height: BH, rx: 10, class: cls }, g);
    H.wrap(n.label, BW - 20, H.LBL)
      .slice(0, 2)
      .forEach((l, i, arr) =>
        tx(
          H,
          g,
          x + BW / 2,
          y + BH / 2 + 5 + (i - (arr.length - 1) / 2) * 17,
          l,
          "ax-nl",
          "middle",
        ),
      );
  };
  fns.forEach((n, i) =>
    chip(
      n,
      X0 + GP + (i % cols) * (BW + GP),
      36 + GP + Math.floor(i / cols) * (BH + GP),
      "fx-bk-fn",
    ),
  );
  const col = (list, x, x1, x2, cls) =>
    list.forEach((n, i) => {
      const y = (SH - list.length * (BH + GP) + GP) / 2 + i * (BH + GP);
      chip(n, x, y, cls);
      H.svgn(
        "path",
        {
          d: `M${x1} ${y + BH / 2}H${x2}`,
          class: "fx-fl-edge",
          "marker-end": `url(#${H.id}-arr)`,
        },
        g,
      );
    });
  col(ins, 0, BW, X0, "fx-bk-io is-in");
  col(outs, X0 + SW + 70, X0 + SW, X0 + SW + 68, "fx-bk-io is-out");
  return { x: -20, y: -20, w: X0 + SW + 70 + BW + 40, h: SH + 40 };
}
function steps(a, g, H) {
  const { nodes } = graphOf(a),
    per = nodes.length > 5 ? Math.ceil(nodes.length / 2) : nodes.length,
    W = 196,
    HH = 76;
  nodes.forEach((n, i) => {
    const x = (i % per) * (W - 6),
      y = Math.floor(i / per) * (HH + 74);
    H.svgn(
      "path",
      {
        d: `M${x} ${y}H${x + W - 22}L${x + W} ${y + HH / 2}L${x + W - 22} ${y + HH}H${x}L${x + 22} ${y + HH / 2}Z`,
        class: "fx-st-chev",
        fill: H.PALETTE[i % 6],
      },
      g,
    );
    tx(H, g, x + 38, y + 26, String(i + 1).padStart(2, "0"), "fx-st-no");
    lines(H, g, x + 38, y + 46, n.label, W - 78, "fx-st-t", 16, 2);
    if (n.detail)
      lines(H, g, x + 10, y + HH + 20, n.detail, W - 20, "ax-ndetail", 15, 3);
  });
  return {
    x: -20,
    y: -20,
    w: per * (W - 6) + 60,
    h: Math.ceil(nodes.length / per) * (HH + 74) + 30,
  };
}
function treeLR(a, g, H) {
  const { root, byId } = buildTree({
    nodes: a.nodes,
    edges: a.edges,
    rootId: a.rootId,
  });
  let row = 0,
    maxD = 0;
  const lay = (n, d) => {
    n.d = d;
    maxD = Math.max(maxD, d);
    if (!n.kids.length) n.y = row++ * 36;
    else {
      n.kids.forEach((k) => lay(k, d + 1));
      n.y = (n.kids[0].y + n.kids.at(-1).y) / 2;
    }
    n.x = d * 250;
  };
  lay(root, 0);
  const all = [...byId.values()].filter((n) => n.x != null),
    gE = H.svgn("g", {}, g);
  all.forEach((n) =>
    n.kids.forEach((k) =>
      H.svgn(
        "path",
        {
          d: `M${n.x + 204} ${n.y}H${n.x + 227}V${k.y}H${k.x}`,
          class: "fx-tr-elbow",
        },
        gE,
      ),
    ),
  );
  all.forEach((n) => {
    const c = H.svgn("g", { class: "fx-tl-node" }, g);
    c.style.setProperty("--k", H.PALETTE[n.d % 6]);
    H.svgn("rect", { x: n.x, y: n.y - 15, width: 204, height: 30, rx: 8 }, c);
    H.svgn("circle", { cx: n.x + 15, cy: n.y, r: 4.5 }, c);
    tx(
      H,
      c,
      n.x + 29,
      n.y + 5,
      n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label,
      n.d === 0 ? "ax-nl" : "ax-nl is-field",
    );
  });
  return { x: -20, y: -30, w: maxD * 250 + 270, h: row * 36 + 40 };
}
function pyramid(a, g, H) {
  const N = a.nodes,
    W = 560,
    LH = 78;
  N.forEach((n, i) => {
    const w0 = (W * i) / N.length,
      w1 = (W * (i + 1)) / N.length,
      y = i * LH,
      cx = W / 2;
    H.svgn(
      "path",
      {
        d: `M${cx - w0 / 2} ${y}H${cx + w0 / 2}L${cx + w1 / 2} ${y + LH - 4}H${cx - w1 / 2}Z`,
        class: "fx-py",
        fill: H.PALETTE[i % 6],
      },
      g,
    );
    lines(
      H,
      g,
      cx,
      y +
        LH / 2 -
        (Math.min(2, H.wrap(n.label, w1 * 0.62, H.LBL).length) - 1) * 8,
      n.label,
      Math.max(60, w1 * 0.62),
      "fx-st-t",
      16,
      2,
      "middle",
    );
    if (n.detail) {
      H.svgn(
        "path",
        {
          d: `M${cx + (w0 + w1) / 4} ${y + LH / 2}H${W + 24}`,
          class: "fx-py-lead",
        },
        g,
      );
      lines(H, g, W + 30, y + LH / 2 - 4, n.detail, 230, "ax-ndetail", 15, 3);
    }
  });
  return { x: -20, y: -20, w: W + 330, h: N.length * LH + 30 };
}
function star(a, g, H) {
  const { nodes, edges } = graphOf(a),
    deg = new Map();
  edges.forEach((e) => {
    deg.set(e.from, (deg.get(e.from) || 0) + 1);
    deg.set(e.to, (deg.get(e.to) || 0) + 1);
  });
  const hub =
      nodes.find((n) => n.id === a.rootId) ||
      [...nodes].sort((p, q) => (deg.get(q.id) || 0) - (deg.get(p.id) || 0))[0],
    rest = nodes.filter((n) => n !== hub),
    R = Math.max(220, rest.length * 36),
    gE = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g);
  rest.forEach((n, i) => {
    const ang = -Math.PI / 2 + (i / rest.length) * Math.PI * 2,
      x = Math.cos(ang) * R,
      y = Math.sin(ang) * R * 0.72,
      col = H.PALETTE[i % 6],
      ls = H.wrap(n.label, 140, H.LBL),
      w = Math.max(...ls.map((l) => H.measure(l, H.LBL))) + 28,
      h = ls.length * 18 + 18;
    H.svgn(
      "path",
      { d: `M0 0L${x} ${y}`, class: "fx-star-spoke", stroke: col },
      gE,
    );
    const e = edges.find(
      (q) =>
        (q.from === hub.id && q.to === n.id) ||
        (q.to === hub.id && q.from === n.id),
    );
    if (e?.label) tx(H, gE, x / 2, y / 2 - 6, e.label, "fx-halo", "middle");
    const c = H.svgn("g", { class: "fx-star-node" }, gN);
    c.style.setProperty("--k", col);
    H.svgn(
      "rect",
      { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 12 },
      c,
    );
    ls.forEach((l, k) =>
      tx(
        H,
        c,
        x,
        y - ((ls.length - 1) * 18) / 2 + k * 18 + 5,
        l,
        "ax-nl",
        "middle",
      ),
    );
  });
  const hr = Math.max(54, H.measure(hub.label, H.LBL) / 2 + 20);
  H.svgn("circle", { cx: 0, cy: 0, r: hr, class: "fx-star-hub" }, gN);
  lines(
    H,
    gN,
    0,
    5 - (H.wrap(hub.label, hr * 1.5, H.LBL).length - 1) * 9,
    hub.label,
    hr * 1.5,
    "ax-nl",
    18,
    3,
    "middle",
  );
  return { x: -R - 130, y: -R * 0.72 - 70, w: R * 2 + 260, h: R * 1.44 + 140 };
}
function commModel(a, g, H) {
  const pick = (re, d) =>
      (a.nodes || []).find((n) =>
        re.test(`${n.group || ""} ${n.id} ${n.label}`),
      ) || { label: d },
    P = [
      pick(/[ée]metteur|source|sender/i, "Émetteur"),
      pick(/\bcod/i, "Codage"),
      pick(/canal|channel|m[ée]dium/i, "Canal"),
      pick(/d[ée]cod/i, "Décodage"),
      pick(/r[ée]cepteur|destinataire|receiver/i, "Récepteur"),
    ],
    BW = 150,
    BH = 74,
    GP = 52;
  P.forEach((n, i) => {
    const x = i * (BW + GP);
    H.svgn(
      "rect",
      {
        x,
        y: 0,
        width: BW,
        height: BH,
        rx: 14,
        class: i === 2 ? "fx-cm-chan" : "fx-bk-fn",
      },
      g,
    );
    lines(
      H,
      g,
      x + BW / 2,
      32 - (H.wrap(n.label, BW - 20, H.LBL).slice(0, 2).length - 1) * 8,
      n.label,
      BW - 20,
      "ax-nl",
      18,
      2,
      "middle",
    );
    if (n.detail)
      lines(
        H,
        g,
        x + BW / 2,
        58,
        n.detail,
        BW - 16,
        "ax-ndetail",
        13,
        1,
        "middle",
      );
    if (i)
      H.svgn(
        "path",
        {
          d: `M${x - GP + BW} ${BH / 2}H${x - 2}`,
          class: "fx-fl-edge",
          "marker-end": `url(#${H.id}-arr)`,
        },
        g,
      );
  });
  const noise = pick(/bruit|noise|perturb/i, "Bruit"),
    cx = 2 * (BW + GP) + BW / 2;
  H.svgn("ellipse", { cx, cy: -76, rx: 62, ry: 26, class: "fx-cm-noise" }, g);
  tx(H, g, cx, -71, noise.label, "ax-nl is-field", "middle");
  H.svgn(
    "path",
    {
      d: `M${cx} -50V-6`,
      class: "fx-fl-edge",
      "marker-end": `url(#${H.id}-arr)`,
    },
    g,
  );
  const fb = pick(/r[ée]troaction|feedback/i, "Rétroaction"),
    last = 4 * (BW + GP) + BW / 2;
  H.svgn(
    "path",
    {
      d: `M${last} ${BH}V${BH + 56}H${BW / 2}V${BH + 2}`,
      class: "fx-fl-edge is-dash",
      "marker-end": `url(#${H.id}-arr)`,
    },
    g,
  );
  tx(H, g, (last + BW / 2) / 2, BH + 48, fb.label, "fx-halo", "middle");
  return { x: -30, y: -130, w: 5 * (BW + GP) + 20, h: BH + 210 };
}
function fishbone(a, g, H) {
  const { root } = buildTree({
      nodes: a.nodes,
      edges: a.edges,
      rootId: a.rootId,
    }),
    cats = root.kids,
    SP = 200,
    L = Math.max(720, Math.ceil(cats.length / 2) * SP + 160);
  H.svgn(
    "path",
    { d: `M0 0H${L}`, class: "fx-fb-spine", "marker-end": `url(#${H.id}-arr)` },
    g,
  );
  const hl = H.wrap(root.label, 150, H.LBL).slice(0, 3);
  H.svgn(
    "rect",
    { x: L + 6, y: -34, width: 176, height: 68, rx: 14, class: "fx-fb-head" },
    g,
  );
  hl.forEach((l, i) =>
    tx(H, g, L + 94, -((hl.length - 1) * 9) + i * 18 + 5, l, "ax-nl", "middle"),
  );
  cats.forEach((c, i) => {
    const up = i % 2 === 0,
      k = Math.floor(i / 2),
      bx = L - 100 - k * SP,
      dy = up ? -1 : 1,
      len = 190,
      tx0 = bx - len * 0.55,
      ty0 = dy * len,
      col = H.PALETTE[i % 6];
    H.svgn(
      "path",
      { d: `M${tx0} ${ty0}L${bx} 0`, class: "fx-fb-bone", stroke: col },
      g,
    );
    const cw = H.measure(c.label, H.LBL) + 24;
    H.svgn(
      "rect",
      {
        x: tx0 - cw / 2,
        y: ty0 - (up ? 26 : 0),
        width: cw,
        height: 26,
        rx: 8,
        fill: col,
        class: "fx-fb-cat",
      },
      g,
    );
    tx(H, g, tx0, ty0 + (up ? -8 : 18), c.label, "fx-st-t", "middle");
    c.kids.forEach((s, j) => {
      const t = (j + 1) / (c.kids.length + 1),
        px = tx0 + (bx - tx0) * t,
        py = ty0 * (1 - t);
      H.svgn(
        "path",
        { d: `M${px - 96} ${py}H${px}`, class: "fx-fb-cause", stroke: col },
        g,
      );
      tx(
        H,
        g,
        px - 92,
        py - 5,
        s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label,
        "ax-ndetail",
      );
      s.kids
        .slice(0, 2)
        .forEach((q, m) =>
          tx(
            H,
            g,
            px - 88,
            py + 13 + m * 13,
            `· ${q.label.slice(0, 20)}`,
            "fx-fb-sub",
          ),
        );
    });
  });
  return { x: -40, y: -270, w: L + 260, h: 540 };
}
function swot(a, g, H) {
  const key = (n, i) => {
    const t = `${n.group || ""}`;
    return /forc|strength|^s$/i.test(t)
      ? 0
      : /faibl|weak|^w$/i.test(t)
        ? 1
        : /opportun|^o$/i.test(t)
          ? 2
          : /menac|threat|^t$/i.test(t)
            ? 3
            : i % 4;
  };
  const Q = [
      ["S", "Forces", "#2fa38a"],
      ["W", "Faiblesses", "#e0884a"],
      ["O", "Opportunités", "#4388d7"],
      ["T", "Menaces", "#d4587a"],
    ],
    PW = 330,
    PH = 250;
  Q.forEach(([letter, name, col], q) => {
    const x = (q % 2) * (PW + 14),
      y = Math.floor(q / 2) * (PH + 14),
      items = a.nodes.filter((n, i) => key(n, i) === q);
    const p = H.svgn("g", { class: "fx-sw" }, g);
    p.style.setProperty("--k", col);
    H.svgn(
      "rect",
      { x, y, width: PW, height: PH, rx: 14, class: "fx-sw-bg" },
      p,
    );
    tx(H, p, x + 18, y + 52, letter, "fx-sw-l");
    tx(H, p, x + 62, y + 40, name, "ax-nl");
    tx(H, p, x + 62, y + 56, q < 2 ? "Interne" : "Externe", "ax-ndetail");
    items.slice(0, 6).forEach((n, i) => {
      H.svgn(
        "circle",
        { cx: x + 22, cy: y + 88 + i * 26, r: 3.5, class: "fx-sw-dot" },
        p,
      );
      tx(
        H,
        p,
        x + 34,
        y + 92 + i * 26,
        n.label.length > 40 ? `${n.label.slice(0, 39)}…` : n.label,
        "ax-nl is-field",
      );
    });
  });
  return { x: -10, y: -10, w: PW * 2 + 34, h: PH * 2 + 34 };
}
function charts(a, g, H) {
  const S = a.series,
    Lb = a.labels,
    unit = a.unit ? ` ${a.unit}` : "";
  if (a.chart === "pie") {
    const vals = S[0].values.map((v) => Math.max(0, v)),
      tot = vals.reduce((s, v) => s + v, 0) || 1,
      R = 150;
    let ang = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = ang + (v / tot) * Math.PI * 2,
        big = a1 - ang > Math.PI ? 1 : 0;
      H.svgn(
        "path",
        {
          d: `M0 0L${Math.cos(ang) * R} ${Math.sin(ang) * R}A${R} ${R} 0 ${big} 1 ${Math.cos(a1) * R} ${Math.sin(a1) * R}Z`,
          fill: H.PALETTE[i % 6],
          class: "fx-pie",
        },
        g,
      );
      H.svgn(
        "rect",
        {
          x: R + 50,
          y: -R + i * 26,
          width: 14,
          height: 14,
          rx: 4,
          fill: H.PALETTE[i % 6],
        },
        g,
      );
      tx(
        H,
        g,
        R + 72,
        -R + i * 26 + 12,
        `${Lb[i] || `#${i + 1}`} · ${H.fmt(v, 2)}${unit} (${H.fmt((v / tot) * 100, 1)} %)`,
        "ax-nl is-field",
      );
      ang = a1;
    });
    return {
      x: -R - 20,
      y: -R - 20,
      w: R * 2 + 520,
      h: Math.max(R * 2 + 40, vals.length * 26 + 60),
    };
  }
  const W = 640,
    Hh = 320,
    all = S.flatMap((s) => s.values),
    hi = Math.max(0, ...all),
    lo = Math.min(0, ...all),
    span = hi - lo || 1,
    sy = (v) => Hh - ((v - lo) / span) * (Hh - 24),
    n = Math.max(...S.map((s) => s.values.length)),
    step = W / n;
  for (let t = 0; t <= 5; t++) {
    const v = lo + (span * t) / 5,
      y = sy(v);
    H.svgn("path", { d: `M0 ${y}H${W}`, class: "fx-gt-grid" }, g);
    tx(H, g, -10, y + 4, H.fmt(v, 2), "ax-ndetail", "end");
  }
  H.svgn("path", { d: `M0 ${sy(0)}H${W}M0 0V${Hh}`, class: "ax-axis" }, g);
  Lb.slice(0, n).forEach((l, i) =>
    tx(
      H,
      g,
      step * i + step / 2,
      Hh + 20,
      l.length > 12 ? `${l.slice(0, 11)}…` : l,
      "ax-ndetail",
      "middle",
    ),
  );
  if (a.chart === "bar")
    S.forEach((s, k) =>
      s.values.forEach((v, i) => {
        const bw = (step * 0.7) / S.length,
          x = step * i + step * 0.15 + k * bw;
        H.svgn(
          "rect",
          {
            x,
            y: Math.min(sy(v), sy(0)),
            width: bw - 2,
            height: Math.abs(sy(v) - sy(0)),
            rx: 3,
            fill: H.PALETTE[k % 6],
            class: "fx-bar",
          },
          g,
        );
        if (n <= 14)
          tx(H, g, x + bw / 2, sy(v) - 5, H.fmt(v, 1), "ax-ndetail", "middle");
      }),
    );
  else
    S.forEach((s, k) => {
      H.svgn(
        "path",
        {
          d: s.values
            .map((v, i) => `${i ? "L" : "M"}${step * i + step / 2} ${sy(v)}`)
            .join(""),
          class: "fx-ln",
          stroke: H.PALETTE[k % 6],
        },
        g,
      );
      s.values.forEach((v, i) =>
        H.svgn(
          "circle",
          {
            cx: step * i + step / 2,
            cy: sy(v),
            r: 3.8,
            class: "fx-ln-dot",
            stroke: H.PALETTE[k % 6],
          },
          g,
        ),
      );
    });
  S.forEach((s, k) => {
    H.svgn(
      "rect",
      {
        x: k * 150,
        y: -34,
        width: 12,
        height: 12,
        rx: 3,
        fill: H.PALETTE[k % 6],
      },
      g,
    );
    tx(H, g, k * 150 + 18, -23, s.label || `Série ${k + 1}`, "ax-nl is-field");
  });
  if (a.unit) tx(H, g, -50, -40, a.unit, "ax-ndetail");
  return { x: -70, y: -50, w: W + 100, h: Hh + 80 };
}
export const FAMILIES_3 = {
  blocks,
  steps,
  tree_lr: treeLR,
  pyramid,
  star,
  comm_model: commModel,
  fishbone,
  swot,
  charts,
};

/* ═══ CADRE : fond, pastille de type, norme, cartouche, style de flèche ═══ */
export function decorate(H, g, box, entry, frame) {
  const bg = H.svgn("g", { class: `fx-frame is-${frame.bg}` });
  bg.style.setProperty("--fr", frame.accent);
  g.insertBefore(bg, g.firstChild);
  const pad = 40,
    x = box.x - pad,
    y = box.y - pad - 34,
    w = box.w + pad * 2,
    h = box.h + pad * 2 + 74,
    rx = ["graph", "hatch"].includes(frame.bg) ? 4 : 16,
    defs = H.svgn("defs", {}, bg),
    pid = `${H.id}-bg`;
  H.svgn("rect", { x, y, width: w, height: h, rx, class: "fx-sheet" }, bg);
  const pat = (sz, draw) => {
    const p = H.svgn(
      "pattern",
      { id: pid, width: sz, height: sz, patternUnits: "userSpaceOnUse", x, y },
      defs,
    );
    draw(p);
    H.svgn("rect", { x, y, width: w, height: h, rx, fill: `url(#${pid})` }, bg);
  };
  if (frame.bg === "dots")
    pat(22, (p) =>
      H.svgn("circle", { cx: 2, cy: 2, r: 1.1, class: "fx-pat" }, p),
    );
  else if (frame.bg === "graph")
    pat(100, (p) => {
      for (let i = 0; i < 100; i += 20)
        H.svgn(
          "path",
          { d: `M${i} 0V100M0 ${i}H100`, class: i ? "fx-pat-s" : "fx-pat" },
          p,
        );
    });
  else if (frame.bg === "hatch")
    pat(14, (p) => H.svgn("path", { d: "M0 14L14 0", class: "fx-pat-s" }, p));
  else if (frame.bg === "ruled")
    pat(28, (p) => H.svgn("path", { d: "M0 27.5H28", class: "fx-pat-s" }, p));
  else if (frame.bg === "chevrons")
    for (let i = 0; i * 34 < w; i++)
      H.svgn(
        "path",
        { d: `M${x + i * 34} ${y + 44}l12 -9l-12 -9`, class: "fx-chev" },
        bg,
      );
  else if (frame.bg === "pcb") {
    let s = 7;
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 28; i++) {
      const x0 = x + r() * w,
        y0 = y + 50 + r() * (h - 80),
        len = 40 + r() * 90;
      H.svgn(
        "path",
        {
          d:
            r() > 0.5
              ? `M${x0} ${y0}h${len}l14 14h30`
              : `M${x0} ${y0}v${len}l14 14v30`,
          class: "fx-pcb",
        },
        bg,
      );
      H.svgn("circle", { cx: x0, cy: y0, r: 3, class: "fx-pcb-via" }, bg);
    }
  } else if (frame.bg === "contour")
    for (let k = 1; k < 9; k++)
      H.svgn(
        "ellipse",
        {
          cx: x + w * 0.62,
          cy: y + h * 0.42,
          rx: k * w * 0.075,
          ry: k * h * 0.06,
          class: "fx-contour",
        },
        bg,
      );
  else if (frame.bg === "rings")
    for (let k = 1; k < 7; k++)
      H.svgn(
        "circle",
        {
          cx: x + w / 2,
          cy: y + h / 2,
          r: k * Math.min(w, h) * 0.085,
          class: "fx-contour",
        },
        bg,
      );
  const label = entry.label.toUpperCase(),
    bw = H.measure(label, "700 11px Inter") + 24;
  H.svgn(
    "rect",
    { x: x + 14, y: y + 12, width: bw, height: 22, rx: 11, class: "fx-badge" },
    bg,
  );
  tx(H, bg, x + 14 + bw / 2, y + 27, label, "fx-badge-t", "middle");
  tx(
    H,
    bg,
    x + w - 16,
    y + 27,
    entry.norm.length > 62 ? `${entry.norm.slice(0, 61)}…` : entry.norm,
    "fx-norm",
    "end",
  );
  const cx = x + w - 252,
    cy = y + h - 36;
  H.svgn(
    "rect",
    { x: cx, y: cy, width: 238, height: 24, rx: 4, class: "fx-cart" },
    bg,
  );
  tx(
    H,
    bg,
    cx + 8,
    cy + 16,
    `Fig. · ${entry.label} · ${new Date().toLocaleDateString("fr-FR")}`.slice(
      0,
      40,
    ),
    "fx-cart-t",
  );
  return { x, y, w, h };
}
export function applyArrow(svg, id, style) {
  const p = svg.querySelector(`#${id}-arr path`);
  if (p && style === "open") {
    p.setAttribute("d", "M1 1L9 5L1 9");
    p.setAttribute("class", "ax-mk is-open");
  }
}
