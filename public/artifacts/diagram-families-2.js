/* AiGENT — familles de schémas v2 : flux, concept, réseau, cycle, strates, Gantt, Sankey, circuits, thermique, forces, lignes. */
import { buildTree } from "./diagram-families.js";

export const DATA_FAMILIES_2 = new Set([
  "gantt",
  "sankey_diagram",
  "electrical_circuit",
  "hydraulic_circuit",
  "heatmap",
  "forces_diagram",
  "transit_map",
]);
export const FAMILY_OPTIONS = [
  ["system_diagram", "Graphe en couches"],
  ["mind_map", "Carte mentale"],
  ["concept_map", "Carte conceptuelle"],
  ["org_chart", "Organigramme"],
  ["flowchart", "Diagramme de flux"],
  ["network", "Réseau"],
  ["cycle_diagram", "Cycle"],
  ["layers_diagram", "Strates / architecture"],
];

const tx = (H, g, x, y, s, cls, anchor = "start") => {
  const t = H.svgn("text", { x, y, class: cls, "text-anchor": anchor }, g);
  t.textContent = s;
  return t;
};
const graphOf = (a) => ({
  nodes: (a.nodes || []).map((n) => ({ ...n })),
  edges: (a.edges || []).map((e) => ({ ...e })),
});
const nice = (id, labels) =>
  labels?.[id] || String(id).replace(/_/g, " ").trim();

/** Choisit une famille d'après la STRUCTURE des données (jamais « organigramme par défaut »). */
export function inferFamily(a) {
  const n = a.nodes || [],
    e = a.edges || [];
  if (n.length < 2) return "";
  const out = new Map(),
    inn = new Map();
  e.forEach((x) => {
    out.set(x.from, (out.get(x.from) || 0) + 1);
    inn.set(x.to, (inn.get(x.to) || 0) + 1);
  });
  if (
    e.length >= n.length &&
    n.every((x) => out.get(x.id) === 1 && inn.get(x.id) === 1)
  )
    return "cycle_diagram";
  if (n.some((x) => x.kind === "decision" || /\?\s*$/.test(x.label)))
    return "flowchart";
  if (n.filter((x) => x.parent).length >= n.length - 2 && n.length >= 5)
    return n.some((x) =>
      /directeur|directrice|responsable|manager|chef|équipe|service|pôle|président|dg\b/i.test(
        `${x.label} ${x.detail || ""}`,
      ),
    )
      ? "org_chart"
      : "mind_map";
  if (e.filter((x) => x.label).length >= Math.max(2, e.length * 0.5))
    return "concept_map";
  if (
    new Set(n.map((x) => x.group).filter(Boolean)).size >= 2 &&
    e.length < n.length * 2
  )
    return "layers_diagram";
  if (e.length >= n.length * 1.4) return "network";
  return "";
}

/* ═══ FLUX : décisions en losange, branches Oui/Non, boucles de retour sur le côté ═══ */
function flowchart(a, g, H) {
  const { nodes, edges } = graphOf(a),
    by = new Map(nodes.map((n) => [n.id, n]));
  nodes.forEach((n) => {
    n.k =
      n.kind === "decision" || /\?\s*$/.test(n.label)
        ? "decision"
        : n.kind === "capsule" ||
            /^(d[ée]but|start|fin|end|d[ée]marrage)\b/i.test(n.label)
          ? "term"
          : n.kind === "data" || n.kind === "document"
            ? "io"
            : "proc";
    n.ls = H.wrap(n.label, n.k === "decision" ? 120 : 190, H.LBL);
    const tw = Math.max(64, ...n.ls.map((l) => H.measure(l, H.LBL)));
    n.w = n.k === "decision" ? tw * 1.5 + 36 : tw + 44;
    n.h = n.k === "decision" ? n.ls.length * 18 + 50 : n.ls.length * 18 + 26;
  });
  const out = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach(
    (e) => by.has(e.from) && by.has(e.to) && out.get(e.from).push(e),
  );
  const st = new Map(),
    back = new Set();
  const dfs = (u) => {
    st.set(u.id, 1);
    out.get(u.id).forEach((e) => {
      const v = by.get(e.to),
        s = st.get(v.id);
      if (s === 1) back.add(e);
      else if (!s) dfs(v);
    });
    st.set(u.id, 2);
  };
  const roots = nodes.filter((n) => !edges.some((e) => e.to === n.id));
  (roots.length ? roots : [nodes[0]]).forEach((r) => !st.get(r.id) && dfs(r));
  nodes.forEach((n) => !st.get(n.id) && dfs(n));
  const fwd = edges.filter(
      (e) => by.has(e.from) && by.has(e.to) && !back.has(e) && e.from !== e.to,
    ),
    layer = new Map(nodes.map((n) => [n.id, 0]));
  for (let i = 0; i < nodes.length; i++) {
    let ch = false;
    fwd.forEach((e) => {
      if (layer.get(e.to) < layer.get(e.from) + 1) {
        layer.set(e.to, layer.get(e.from) + 1);
        ch = true;
      }
    });
    if (!ch) break;
  }
  const rows = new Map();
  nodes.forEach((n) => {
    const l = layer.get(n.id);
    (rows.get(l) || rows.set(l, []).get(l)).push(n);
  });
  const Ls = [...rows.keys()].sort((p, q) => p - q),
    GX = 60,
    GY = 64;
  let y = 0;
  Ls.forEach((l) => {
    const r = rows.get(l),
      bar = (n) => {
        const p = fwd
          .filter((e) => e.to === n.id)
          .map((e) => by.get(e.from).ord)
          .filter((v) => v != null);
        return p.length ? p.reduce((s, v) => s + v, 0) / p.length : 0;
      };
    r.sort((p, q) => bar(p) - bar(q));
    r.forEach((n, i) => (n.ord = i));
    const tot = r.reduce((s, n) => s + n.w, 0) + GX * (r.length - 1),
      mh = Math.max(...r.map((n) => n.h));
    let x = -tot / 2;
    r.forEach((n) => {
      n.x = x + n.w / 2;
      n.y = y + mh / 2;
      x += n.w + GX;
    });
    y += mh + GY;
  });
  const right = Math.max(...nodes.map((n) => n.x + n.w / 2)),
    gE = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g);
  let bi = 0;
  edges.forEach((e) => {
    const A = by.get(e.from),
      B = by.get(e.to);
    if (!A || !B || A === B) return;
    let d, lx, ly;
    if (back.has(e)) {
      const bx = right + 50 + bi++ * 22;
      d = `M${A.x + A.w / 2} ${A.y}H${bx}V${B.y}H${B.x + B.w / 2}`;
      lx = bx;
      ly = (A.y + B.y) / 2;
    } else if (A.k === "decision" && B.x !== A.x) {
      const sx = A.x + (Math.sign(B.x - A.x) * A.w) / 2;
      d = `M${sx} ${A.y}H${B.x}V${B.y - B.h / 2}`;
      lx = (sx + B.x) / 2;
      ly = A.y - 9;
    } else {
      const y0 = A.y + A.h / 2,
        y1 = B.y - B.h / 2,
        my = y0 + (y1 - y0) / 2;
      d = `M${A.x} ${y0}V${my}H${B.x}V${y1}`;
      lx = A.x + 16;
      ly = y0 + 16;
    }
    H.svgn(
      "path",
      { d, class: "fx-fl-edge", "marker-end": `url(#${H.id}-arr)` },
      gE,
    );
    if (e.label) {
      const w = H.measure(e.label, H.DET) + 12;
      H.svgn(
        "rect",
        {
          x: lx - w / 2,
          y: ly - 11,
          width: w,
          height: 20,
          rx: 10,
          class: "fx-tl-bg",
        },
        gE,
      );
      tx(H, gE, lx, ly + 3, e.label, "ax-ndetail", "middle");
    }
  });
  nodes.forEach((n) => {
    const c = H.svgn("g", { class: `fx-fl fx-fl-${n.k}` }, gN),
      hw = n.w / 2,
      hh = n.h / 2;
    if (n.k === "decision")
      H.svgn(
        "path",
        {
          d: `M${n.x} ${n.y - hh}L${n.x + hw} ${n.y}L${n.x} ${n.y + hh}L${n.x - hw} ${n.y}Z`,
        },
        c,
      );
    else if (n.k === "term")
      H.svgn(
        "rect",
        { x: n.x - hw, y: n.y - hh, width: n.w, height: n.h, rx: hh },
        c,
      );
    else if (n.k === "io")
      H.svgn(
        "path",
        {
          d: `M${n.x - hw + 14} ${n.y - hh}H${n.x + hw}L${n.x + hw - 14} ${n.y + hh}H${n.x - hw}Z`,
        },
        c,
      );
    else
      H.svgn(
        "rect",
        { x: n.x - hw, y: n.y - hh, width: n.w, height: n.h, rx: 6 },
        c,
      );
    n.ls.forEach((l, i) =>
      tx(
        H,
        c,
        n.x,
        n.y - ((n.ls.length - 1) * 18) / 2 + i * 18 + 5,
        l,
        "ax-nl",
        "middle",
      ),
    );
  });
  return { x: -(right + 90), y: -30, w: right * 2 + 200, h: y + 20 };
}

/* ═══ CARTE CONCEPTUELLE : arbre d'ellipses, verbes sur les liens, liens croisés pointillés ═══ */
function conceptMap(a, g, H) {
  const { root, par, byId } = buildTree({
      nodes: a.nodes,
      edges: a.edges,
      rootId: a.rootId,
    }),
    all = [...byId.values()];
  all.forEach((n) => {
    n.ls = H.wrap(n.label, 150, H.LBL);
    n.w = Math.max(...n.ls.map((l) => H.measure(l, H.LBL))) + 36;
    n.h = n.ls.length * 18 + 20;
  });
  const maxW = Math.max(...all.map((n) => n.w)),
    GX = 40,
    GY = 130;
  let leaf = 0;
  const place = (n, d, col) => {
    n.d = d;
    n.col = col;
    if (!n.kids.length) {
      n.cx = leaf * (maxW + GX) + maxW / 2;
      leaf++;
    } else {
      n.kids.forEach((k, i) =>
        place(k, d + 1, d === 0 ? H.PALETTE[i % 6] : col),
      );
      n.cx = (n.kids[0].cx + n.kids[n.kids.length - 1].cx) / 2;
    }
    n.cy = d * GY;
  };
  place(root, 0, "#8d79ff");
  const gE = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g),
    pill = (x, y, s, cls = "fx-tl-bg") => {
      const w = H.measure(s, H.DET) + 14;
      H.svgn(
        "rect",
        { x: x - w / 2, y: y - 11, width: w, height: 21, rx: 10, class: cls },
        gE,
      );
      tx(H, gE, x, y + 4, s, "ax-ndetail", "middle");
    };
  all.forEach((c) => {
    const pid = par.get(c.id),
      p = pid && byId.get(pid);
    if (!p) return;
    const lab = (a.edges || []).find(
        (e) => e.from === pid && e.to === c.id,
      )?.label,
      y0 = p.cy + p.h / 2,
      y1 = c.cy - c.h / 2,
      my = (y0 + y1) / 2;
    H.svgn(
      "path",
      {
        d: `M${p.cx} ${y0}C${p.cx} ${my},${c.cx} ${my},${c.cx} ${y1}`,
        class: "fx-cm-edge",
        stroke: c.col,
        "marker-end": `url(#${H.id}-arr)`,
      },
      gE,
    );
    if (lab) pill((p.cx + c.cx) / 2, my);
  });
  (a.edges || []).forEach((e) => {
    const A = byId.get(e.from),
      B = byId.get(e.to);
    if (!A || !B || par.get(e.to) === e.from) return;
    const dir = B.cx >= A.cx ? 1 : -1,
      x0 = A.cx + (dir * A.w) / 2,
      x1 = B.cx - (dir * B.w) / 2,
      bulge = 50 + Math.abs(A.cy - B.cy) * 0.15;
    H.svgn(
      "path",
      {
        d: `M${x0} ${A.cy}C${x0 + dir * bulge} ${A.cy - bulge},${x1 - dir * bulge} ${B.cy - bulge},${x1} ${B.cy}`,
        class: "fx-cm-cross",
        "marker-end": `url(#${H.id}-arr)`,
      },
      gE,
    );
    if (e.label) pill((x0 + x1) / 2, Math.min(A.cy, B.cy) - bulge * 0.75);
  });
  all.forEach((n) => {
    const c = H.svgn("g", { class: "fx-cm-node" }, gN);
    c.style.setProperty("--k", n.col);
    H.svgn(
      "rect",
      {
        x: n.cx - n.w / 2,
        y: n.cy - n.h / 2,
        width: n.w,
        height: n.h,
        rx: n.h / 2,
      },
      c,
    );
    n.ls.forEach((l, i) =>
      tx(
        H,
        c,
        n.cx,
        n.cy - ((n.ls.length - 1) * 18) / 2 + i * 18 + 5,
        l,
        "ax-nl",
        "middle",
      ),
    );
  });
  return {
    x: -70,
    y: -90,
    w: leaf * (maxW + GX) + 140,
    h: (Math.max(...all.map((n) => n.d)) + 1) * GY + 110,
  };
}

/* ═══ RÉSEAU : anneau groupé par communauté, arcs courbes, épaisseur ∝ poids ═══ */
function network(a, g, H) {
  const { nodes, edges } = graphOf(a),
    deg = new Map(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => {
    deg.set(e.from, (deg.get(e.from) || 0) + 1);
    deg.set(e.to, (deg.get(e.to) || 0) + 1);
  });
  const groups = [...new Set(nodes.map((n) => n.group || ""))];
  nodes.sort(
    (p, q) =>
      groups.indexOf(p.group || "") - groups.indexOf(q.group || "") ||
      deg.get(q.id) - deg.get(p.id),
  );
  const R = Math.max(200, nodes.length * 24),
    by = new Map();
  nodes.forEach((n, i) => {
    const ang = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2;
    n.ang = ang;
    n.x = Math.cos(ang) * R;
    n.y = Math.sin(ang) * R;
    n.col = H.PALETTE[groups.indexOf(n.group || "") % 6];
    n.r = 8 + Math.sqrt(deg.get(n.id)) * 4;
    by.set(n.id, n);
  });
  const mw = Math.max(1, ...edges.map((e) => Number(e.weight) || 1)),
    gE = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g);
  edges.forEach((e) => {
    const A = by.get(e.from),
      B = by.get(e.to);
    if (!A || !B) return;
    const p = H.svgn(
      "path",
      {
        d: `M${A.x} ${A.y}Q${(A.x + B.x) * 0.12} ${(A.y + B.y) * 0.12} ${B.x} ${B.y}`,
        class: "fx-net-edge",
        stroke: A.col,
        "stroke-width": 1 + 5 * Math.sqrt((Number(e.weight) || 1) / mw),
      },
      gE,
    );
    H.svgn("title", {}, p).textContent =
      `${A.label} → ${B.label}${e.label ? ` · ${e.label}` : ""}${e.weight ? ` · ${e.weight}` : ""}`;
  });
  nodes.forEach((n) => {
    const c = H.svgn("g", { class: "fx-net-node" }, gN);
    H.svgn("circle", { cx: n.x, cy: n.y, r: n.r, fill: n.col }, c);
    const cos = Math.cos(n.ang),
      ox = n.x + cos * (n.r + 10);
    tx(
      H,
      c,
      ox,
      n.y + Math.sin(n.ang) * (n.r + 10) + 4,
      n.label,
      "ax-nl",
      cos > 0.2 ? "start" : cos < -0.2 ? "end" : "middle",
    );
  });
  return { x: -R - 220, y: -R - 60, w: R * 2 + 440, h: R * 2 + 120 };
}

/* ═══ CYCLE : étapes sur un cercle, flèches courbes, centre titré ═══ */
function cycle(a, g, H) {
  const { nodes, edges } = graphOf(a),
    by = new Map(nodes.map((n) => [n.id, n]));
  let order = nodes;
  if (edges.length) {
    const seq = [],
      seen = new Set();
    let cur = nodes.find((n) => !edges.some((e) => e.to === n.id)) || nodes[0];
    while (cur && !seen.has(cur.id)) {
      seq.push(cur);
      seen.add(cur.id);
      cur = by.get(edges.find((e) => e.from === cur.id)?.to);
    }
    if (seq.length === nodes.length) order = seq;
  }
  const n = order.length,
    R = Math.max(150, n * 38),
    gE = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g);
  order.forEach((s, i) => {
    s.ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
    s.x = Math.cos(s.ang) * R;
    s.y = Math.sin(s.ang) * R;
    s.col = H.PALETTE[i % 6];
    s.ls = H.wrap(s.label, 130, H.LBL);
    s.w = Math.max(...s.ls.map((l) => H.measure(l, H.LBL))) + 30;
    s.h = s.ls.length * 18 + (s.detail ? 20 : 0) + 22;
  });
  const da = 0.1 + 0.55 / n;
  order.forEach((s, i) => {
    const t = order[(i + 1) % n],
      a0 = s.ang + da,
      a1 = t.ang - da;
    H.svgn(
      "path",
      {
        d: `M${Math.cos(a0) * R} ${Math.sin(a0) * R}A${R} ${R} 0 0 1 ${Math.cos(a1) * R} ${Math.sin(a1) * R}`,
        class: "fx-cy-arc",
        stroke: s.col,
        "marker-end": `url(#${H.id}-arr)`,
      },
      gE,
    );
  });
  tx(H, gE, 0, -4, a.title || "", "ax-nl is-big", "middle");
  tx(H, gE, 0, 16, "cycle", "ax-ndetail", "middle");
  order.forEach((s, i) => {
    const c = H.svgn("g", { class: "fx-cy-node" }, gN);
    c.style.setProperty("--k", s.col);
    H.svgn(
      "rect",
      { x: s.x - s.w / 2, y: s.y - s.h / 2, width: s.w, height: s.h, rx: 12 },
      c,
    );
    H.svgn(
      "circle",
      { cx: s.x - s.w / 2, cy: s.y - s.h / 2, r: 11, class: "fx-cy-num" },
      c,
    );
    tx(
      H,
      c,
      s.x - s.w / 2,
      s.y - s.h / 2 + 4,
      String(i + 1),
      "fx-cy-numt",
      "middle",
    );
    s.ls.forEach((l, k) =>
      tx(H, c, s.x, s.y - s.h / 2 + 22 + k * 18, l, "ax-nl", "middle"),
    );
    if (s.detail)
      tx(
        H,
        c,
        s.x,
        s.y + s.h / 2 - 8,
        s.detail.slice(0, 26),
        "ax-ndetail",
        "middle",
      );
  });
  return { x: -R - 120, y: -R - 70, w: R * 2 + 240, h: R * 2 + 140 };
}

/* ═══ STRATES : bandes empilées, composants en pastilles, interfaces entre couches ═══ */
function layers(a, g, H) {
  const { nodes, edges } = graphOf(a);
  let names = [...new Set(nodes.map((n) => n.group).filter(Boolean))];
  if (names.length < 2) {
    const lv = new Map(nodes.map((n) => [n.id, 0]));
    for (let i = 0; i < nodes.length; i++)
      edges.forEach((e) => {
        if (
          lv.has(e.to) &&
          lv.get(e.to) < lv.get(e.from) + 1 &&
          lv.get(e.from) < nodes.length
        )
          lv.set(e.to, lv.get(e.from) + 1);
      });
    nodes.forEach((n) => (n.group = `Niveau ${lv.get(n.id) + 1}`));
    names = [...new Set(nodes.map((n) => n.group))].sort();
  }
  const W = 800,
    LW = 170,
    inner = W - LW - 28,
    gE = H.svgn("g", {}, g);
  let y = 0;
  names.forEach((name, li) => {
    const items = nodes.filter((n) => n.group === name),
      col = H.PALETTE[li % 6],
      rows = [[]];
    let cur = 0;
    items.forEach((n) => {
      n.cw = Math.min(inner, H.measure(n.label, H.LBL) + 30);
      if (cur + n.cw > inner && rows.at(-1).length) {
        rows.push([]);
        cur = 0;
      }
      rows.at(-1).push(n);
      cur += n.cw + 10;
    });
    const bh = 24 + rows.length * 44,
      band = H.svgn("g", { class: "fx-ly" }, gE);
    band.style.setProperty("--k", col);
    H.svgn(
      "rect",
      { x: 0, y, width: W, height: bh, rx: 12, class: "fx-ly-bg" },
      band,
    );
    H.svgn(
      "rect",
      { x: 0, y: y + 8, width: 4, height: bh - 16, rx: 2, class: "fx-ly-bar" },
      band,
    );
    H.wrap(name, LW - 30, H.LBL)
      .slice(0, 3)
      .forEach((l, i) => tx(H, band, 20, y + bh / 2 - 6 + i * 18, l, "ax-nl"));
    rows.forEach((r, ri) => {
      let x = LW + 6;
      r.forEach((n) => {
        H.svgn(
          "rect",
          {
            x,
            y: y + 12 + ri * 44,
            width: n.cw,
            height: 34,
            rx: 8,
            class: "fx-ly-chip",
          },
          band,
        );
        tx(
          H,
          band,
          x + n.cw / 2,
          y + 34 + ri * 44,
          n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label,
          "ax-nl is-field",
          "middle",
        );
        x += n.cw + 10;
      });
    });
    if (li < names.length - 1) {
      const nx = names[li + 1],
        lab = [
          ...new Set(
            edges
              .filter((e) => {
                const A = nodes.find((n) => n.id === e.from),
                  B = nodes.find((n) => n.id === e.to);
                return (
                  A &&
                  B &&
                  ((A.group === name && B.group === nx) ||
                    (A.group === nx && B.group === name)) &&
                  e.label
                );
              })
              .map((e) => e.label),
          ),
        ]
          .slice(0, 3)
          .join(" · ");
      H.svgn(
        "path",
        {
          d: `M${W / 2 - 8} ${y + bh + 4}V${y + bh + 30}M${W / 2 + 8} ${y + bh + 30}V${y + bh + 4}`,
          class: "fx-ly-arrow",
          "marker-end": `url(#${H.id}-arr)`,
        },
        gE,
      );
      if (lab) tx(H, gE, W / 2 + 22, y + bh + 22, lab, "fx-halo");
    }
    y += bh + 34;
  });
  return { x: -20, y: -20, w: W + 40, h: y + 10 };
}

/* ═══ GANTT : vraie échelle, groupes, dépendances, jalons, avancement ═══ */
function gantt(a, g, H) {
  const T = a.tasks,
    LBW = 240,
    RH = 34,
    TOP = 50,
    end = Math.max(...T.map((t) => t.start + t.duration)),
    ppu = H.clamp(900 / Math.max(1, end), 12, 64);
  const step = [1, 2, 5, 10, 20, 50, 100].find((s) => end / s <= 18) || 100,
    groups = [...new Set(T.map((t) => t.group || ""))],
    grouped = groups.length > 1 || groups[0] !== "",
    rowsList = [];
  groups.forEach((gr) => {
    if (grouped) rowsList.push({ head: gr || "Autres" });
    T.filter((t) => (t.group || "") === gr).forEach((t) =>
      rowsList.push({ t }),
    );
  });
  const W = LBW + end * ppu + 40,
    Hh = TOP + rowsList.length * RH + 16,
    X = (v) => LBW + v * ppu;
  for (let v = 0; v <= end + step; v += step) {
    H.svgn(
      "path",
      { d: `M${X(v)} ${TOP - 8}V${Hh - 8}`, class: "fx-gt-grid" },
      g,
    );
    tx(
      H,
      g,
      X(v),
      TOP - 16,
      `${a.unit ? a.unit.slice(0, 1).toUpperCase() : "T"}${v}`,
      "ax-ndetail",
      "middle",
    );
  }
  const ypos = new Map();
  rowsList.forEach((r, i) => {
    const y = TOP + i * RH;
    if (r.t) ypos.set(r.t.id, y);
  });
  rowsList.forEach((r, i) => {
    const y = TOP + i * RH;
    if (r.head) {
      H.svgn(
        "rect",
        { x: 0, y: y + 4, width: W, height: RH - 8, class: "fx-gt-head" },
        g,
      );
      tx(H, g, 10, y + RH / 2 + 4, r.head, "ax-nl");
    } else if (i % 2)
      H.svgn(
        "rect",
        { x: 0, y, width: W, height: RH, class: "fx-gt-zebra" },
        g,
      );
  });
  T.forEach((t) => {
    const y = ypos.get(t.id),
      col = H.PALETTE[groups.indexOf(t.group || "") % 6];
    tx(
      H,
      g,
      22,
      y + RH / 2 + 4,
      t.label.length > 30 ? `${t.label.slice(0, 29)}…` : t.label,
      "ax-nl is-field",
    );
    if (t.milestone)
      H.svgn(
        "path",
        {
          d: `M${X(t.start)} ${y + 6}l9 ${RH / 2 - 6}l-9 ${RH / 2 - 6}l-9 -${RH / 2 - 6}Z`,
          fill: col,
          class: "fx-gt-ms",
        },
        g,
      );
    else {
      H.svgn(
        "rect",
        {
          x: X(t.start),
          y: y + 7,
          width: Math.max(4, t.duration * ppu),
          height: RH - 14,
          rx: 5,
          fill: col,
          class: "fx-gt-bar",
        },
        g,
      );
      if (t.progress > 0)
        H.svgn(
          "rect",
          {
            x: X(t.start),
            y: y + 7,
            width: Math.max(4, t.duration * ppu) * t.progress,
            height: RH - 14,
            rx: 5,
            class: "fx-gt-prog",
          },
          g,
        );
    }
    (t.deps || []).forEach((id) => {
      const d = T.find((u) => u.id === id);
      if (!d) return;
      const ex = X(d.start + d.duration),
        ey = ypos.get(d.id) + RH / 2,
        sx = X(t.start),
        sy = y + RH / 2;
      H.svgn(
        "path",
        {
          d:
            sx >= ex + 10
              ? `M${ex} ${ey}H${ex + 8}V${sy}H${sx - 2}`
              : `M${ex} ${ey}H${ex + 8}V${(ey + sy) / 2}H${sx - 10}V${sy}H${sx - 2}`,
          class: "fx-gt-dep",
          "marker-end": `url(#${H.id}-arr)`,
        },
        g,
      );
    });
  });
  return { x: -10, y: 0, w: W + 20, h: Hh };
}

/* ═══ SANKEY : largeur des rubans ∝ valeur, bilan entrée/sortie vérifié ═══ */
function sankey(a, g, H) {
  const F = a.flows,
    ids = [...new Set(F.flatMap((f) => [f.from, f.to]))],
    N = new Map(ids.map((id) => [id, { id, in: 0, out: 0, layer: 0 }]));
  F.forEach((f) => {
    N.get(f.from).out += f.value;
    N.get(f.to).in += f.value;
  });
  for (let i = 0; i < ids.length; i++) {
    let ch = false;
    F.forEach((f) => {
      const A = N.get(f.from),
        B = N.get(f.to);
      if (B.layer < A.layer + 1) {
        B.layer = A.layer + 1;
        ch = true;
      }
    });
    if (!ch) break;
  }
  N.forEach((n) => (n.v = Math.max(n.in, n.out)));
  const cols = new Map();
  N.forEach((n) =>
    (cols.get(n.layer) || cols.set(n.layer, []).get(n.layer)).push(n),
  );
  const HG = 420,
    GAP = 22,
    NW = 16,
    DX = 250,
    ky = Math.min(
      ...[...cols.values()].map(
        (c) => (HG - GAP * (c.length - 1)) / c.reduce((s, n) => s + n.v, 0),
      ),
    );
  cols.forEach((c, l) => {
    c.sort((p, q) => q.v - p.v);
    const tot = c.reduce((s, n) => s + n.v * ky, 0) + GAP * (c.length - 1);
    let y = (HG - tot) / 2;
    c.forEach((n) => {
      n.x = l * DX;
      n.y = y;
      n.h = n.v * ky;
      y += n.h + GAP;
    });
  });
  N.forEach((n) => {
    let o = 0;
    F.filter((f) => f.from === n.id)
      .sort((p, q) => N.get(p.to).y - N.get(q.to).y)
      .forEach((f) => {
        f.sy = n.y + o;
        o += f.value * ky;
      });
    o = 0;
    F.filter((f) => f.to === n.id)
      .sort((p, q) => N.get(p.from).y - N.get(q.from).y)
      .forEach((f) => {
        f.ty = n.y + o;
        o += f.value * ky;
      });
  });
  const isLoss = (id) => /perte|loss|dissip/i.test(nice(id, a.labels)),
    gL = H.svgn("g", {}, g),
    gN = H.svgn("g", {}, g),
    unit = a.unit ? ` ${a.unit}` : "";
  F.forEach((f) => {
    const A = N.get(f.from),
      B = N.get(f.to),
      x0 = A.x + NW,
      x1 = B.x,
      h = f.value * ky,
      mx = (x0 + x1) / 2;
    const p = H.svgn(
      "path",
      {
        d: `M${x0} ${f.sy}C${mx} ${f.sy},${mx} ${f.ty},${x1} ${f.ty}V${f.ty + h}C${mx} ${f.ty + h},${mx} ${f.sy + h},${x0} ${f.sy + h}Z`,
        class: "fx-sk-link",
        fill: isLoss(f.to) ? "#c9654f" : H.PALETTE[ids.indexOf(f.from) % 6],
      },
      gL,
    );
    H.svgn("title", {}, p).textContent =
      `${nice(f.from, a.labels)} → ${nice(f.to, a.labels)} : ${H.fmt(f.value, 2)}${unit}`;
  });
  const last = Math.max(...[...N.values()].map((n) => n.layer));
  N.forEach((n) => {
    H.svgn(
      "rect",
      {
        x: n.x,
        y: n.y,
        width: NW,
        height: Math.max(2, n.h),
        rx: 3,
        class: "fx-sk-node",
        fill: isLoss(n.id) ? "#c9654f" : H.PALETTE[ids.indexOf(n.id) % 6],
      },
      gN,
    );
    const left = n.layer === last && n.layer > 0;
    const t = tx(
      H,
      gN,
      left ? n.x - 8 : n.x + NW + 8,
      n.y + Math.max(2, n.h) / 2 + 4,
      `${nice(n.id, a.labels)} · ${H.fmt(n.v, 1)}${unit}`,
      "fx-halo is-bold",
      left ? "end" : "start",
    );
    if (
      n.in > 0 &&
      n.out > 0 &&
      Math.abs(n.in - n.out) / Math.max(n.in, n.out) > 0.01
    ) {
      t.textContent += "  ⚠ bilan ≠";
      H.svgn("title", {}, t).textContent =
        `Σ entrée ${H.fmt(n.in, 2)} ≠ Σ sortie ${H.fmt(n.out, 2)}`;
    }
  });
  return { x: -30, y: -30, w: last * DX + NW + 360, h: HG + 80 };
}

/* ═══ CIRCUITS (électrique + hydraulique) : symboles normalisés simplifiés, rails, branches parallèles ═══ */
const SYM = {
  resistor: "M-28 0H-16L-12 -8L-4 8L4 -8L12 8L16 0H28",
  battery: "M-28 0H-5M-5 -14V14M5 -7V7M5 0H28",
  capacitor: "M-28 0H-4M-4 -12V12M4 -12V12M4 0H28",
  inductor:
    "M-28 0H-20a5 5 0 0 1 10 0a5 5 0 0 1 10 0a5 5 0 0 1 10 0a5 5 0 0 1 10 0H28",
  switch: "M-28 0H-12M-12 0L10 -14M12 0H28",
  diode: "M-28 0H-8M-8 -10V10L8 0ZM8 -10V10M8 0H28",
  led: "M-28 0H-8M-8 -10V10L8 0ZM8 -10V10M8 0H28M0 -14l6 -7M6 -14l6 -7",
  lamp: "M-28 0H-11M11 0H28M-8 -8L8 8M-8 8L8 -8",
  fuse: "M-28 0H-14M14 0H28M-14 -6H14V6H-14ZM-14 0H14",
  pump: "M-28 0H-13M13 0H28M-5 -9L9 0L-5 9Z",
  valve: "M-28 0H-12M12 0H28M-12 -12H12V12H-12ZM-7 7L7 -7M7 -7H2M7 -7V-2",
  check: "M-28 0H-8M8 0H28M-8 -10V10M8 -10V10",
  throttle: "M-28 0H-8M8 0H28M-8 -10Q0 0 -8 10M8 -10Q0 0 8 10",
  tank: "M-28 0H-14M14 0H28M-14 -14V14H14V-14M-14 -2Q-7 -6 0 -2T14 -2",
  cylinder: "M-28 0H-18M18 0H34M-18 -11H18V11H-18ZM0 -11V11",
  filter: "M-28 0H-12M12 0H28M-12 0L0 -12L12 0L0 12ZM-6 0H6",
};
const ROUND = {
    lamp: 11,
    ammeter: 12,
    voltmeter: 12,
    motor: 13,
    pump: 13,
    ac: 13,
    gauge: 12,
  },
  LETTER = { ammeter: "A", voltmeter: "V", motor: "M", ac: "~", gauge: "P" };
function circuit(a, g, H) {
  const HG = 170,
    SP = 130,
    X0 = 70,
    PAR = 84,
    items = [],
    wires = [],
    dots = [];
  let x = X0;
  items.push({ c: a.source, x: 0, y: HG / 2, rot: 90 });
  wires.push(`M0 0V${HG / 2 - 28}M0 ${HG / 2 + 28}V${HG}`);
  a.stages.forEach((s) => {
    if (s.parallel) {
      const x0 = x + SP * 0.35;
      s.parallel.forEach((c, i) => {
        const cx = x0 + i * PAR;
        items.push({ c, x: cx, y: HG / 2, rot: 90 });
        wires.push(`M${cx} 0V${HG / 2 - 28}M${cx} ${HG / 2 + 28}V${HG}`);
        dots.push([cx, 0], [cx, HG]);
      });
      x = x0 + (s.parallel.length - 1) * PAR + SP * 0.35;
    } else {
      items.push({ c: s, x: x + SP / 2, y: 0, rot: 0 });
      x += SP;
    }
  });
  wires.push(`M0 0H${x}`, `M0 ${HG}H${x}`, `M${x} 0V${HG}`);
  H.svgn("path", { d: wires.join(""), class: "fx-wire" }, g);
  dots.forEach(([dx, dy]) =>
    H.svgn("circle", { cx: dx, cy: dy, r: 3.6, class: "fx-dot" }, g),
  );
  if (a.semanticType === "electrical_circuit")
    H.svgn(
      "path",
      {
        d: `M0 ${HG}V${HG + 10}M-12 ${HG + 10}H12M-7 ${HG + 16}H7M-2.5 ${HG + 22}H2.5`,
        class: "fx-wire",
      },
      g,
    );
  else tx(H, g, x / 2, -56, "Sens du flux →", "ax-ndetail", "middle");
  items.forEach(({ c, x: cx, y: cy, rot }) => {
    const grp = H.svgn(
      "g",
      { transform: `translate(${cx} ${cy}) rotate(${rot})`, class: "fx-sym" },
      g,
    );
    H.svgn(
      "rect",
      { x: -28, y: -17, width: 56, height: 34, class: "fx-sym-bg" },
      grp,
    );
    H.svgn(
      "path",
      {
        d:
          SYM[c.type] ??
          (ROUND[c.type]
            ? "M-28 0H-12M12 0H28"
            : "M-28 0H-14M14 0H28M-14 -9H14V9H-14Z"),
      },
      grp,
    );
    if (ROUND[c.type])
      H.svgn(
        "circle",
        { cx: 0, cy: 0, r: ROUND[c.type], class: "fx-sym-fill" },
        grp,
      );
    if (LETTER[c.type]) {
      const t = tx(H, grp, 0, 4, LETTER[c.type], "fx-sym-t", "middle");
      t.setAttribute("transform", `rotate(${-rot})`);
    }
    if (rot === 0) {
      tx(H, g, cx, cy - 26, c.label, "ax-nl", "middle");
      if (c.value) tx(H, g, cx, cy + 34, c.value, "ax-ndetail", "middle");
    } else {
      tx(H, g, cx + 24, cy - 2, c.label, "ax-nl");
      if (c.value) tx(H, g, cx + 24, cy + 15, c.value, "ax-ndetail");
    }
  });
  return { x: -80, y: -80, w: x + 190, h: HG + 150 };
}

/* ═══ CARTE THERMIQUE : échelle sobre adaptée au thème, valeurs lisibles ═══ */
function heatmap(a, g, H) {
  const R = a.rows,
    C = a.cols,
    V = a.values,
    flat = V.flat().filter(Number.isFinite),
    lo = Number.isFinite(a.min) ? a.min : Math.min(...flat),
    hi = Number.isFinite(a.max) ? a.max : Math.max(...flat),
    CW = 74,
    CH = 38,
    LW = 180,
    TOP = 80;
  C.forEach((c, j) =>
    tx(
      H,
      g,
      LW + j * CW + CW / 2,
      TOP - 12,
      c.length > 11 ? `${c.slice(0, 10)}…` : c,
      "ax-ndetail",
      "middle",
    ),
  );
  R.forEach((r, i) => {
    tx(
      H,
      g,
      LW - 12,
      TOP + i * CH + CH / 2 + 4,
      r.length > 24 ? `${r.slice(0, 23)}…` : r,
      "ax-nl is-field",
      "end",
    );
    C.forEach((_, j) => {
      const v = V[i]?.[j],
        t = Number.isFinite(v) ? (v - lo) / (hi - lo || 1) : null,
        rc = H.svgn(
          "rect",
          {
            x: LW + j * CW + 1,
            y: TOP + i * CH + 1,
            width: CW - 2,
            height: CH - 2,
            rx: 4,
          },
          g,
        );
      if (t == null) rc.setAttribute("class", "fx-hm-empty");
      else {
        rc.style.fill = `color-mix(in srgb, #8d79ff ${Math.round(8 + t * 92)}%, var(--surface-2))`;
        tx(
          H,
          g,
          LW + j * CW + CW / 2,
          TOP + i * CH + CH / 2 + 4,
          H.fmt(v, 1),
          t > 0.55 ? "fx-hm-t is-light" : "fx-hm-t",
          "middle",
        );
        H.svgn("title", {}, rc).textContent =
          `${r} × ${C[j]} : ${H.fmt(v, 2)}${a.unit ? ` ${a.unit}` : ""}`;
      }
    });
  });
  const ly = TOP + R.length * CH + 26;
  for (let k = 0; k < 24; k++) {
    const r = H.svgn("rect", { x: LW + k * 9, y: ly, width: 9, height: 12 }, g);
    r.style.fill = `color-mix(in srgb, #8d79ff ${Math.round(8 + (k / 23) * 92)}%, var(--surface-2))`;
  }
  tx(H, g, LW, ly + 28, H.fmt(lo, 1), "ax-ndetail");
  tx(
    H,
    g,
    LW + 216,
    ly + 28,
    `${H.fmt(hi, 1)}${a.unit ? ` ${a.unit}` : ""}`,
    "ax-ndetail",
    "end",
  );
  return { x: 0, y: 0, w: LW + C.length * CW + 30, h: ly + 50 };
}

/* ═══ FORCES : vecteurs ∝ intensité, résultante CALCULÉE (jamais inventée) ═══ */
function forcesDiagram(a, g, H) {
  const b = a.body || {},
    F = a.forces,
    maxM = Math.max(...F.map((f) => f.magnitude || 1)),
    gB = H.svgn("g", {}, g),
    gF = H.svgn("g", {}, g);
  let Rx = 0,
    Ry = 0;
  const shape =
    b.shape === "sphere"
      ? () => H.svgn("circle", { cx: 0, cy: 0, r: 42, class: "fx-fb-body" }, gB)
      : b.shape === "beam"
        ? () =>
            H.svgn(
              "rect",
              {
                x: -150,
                y: -14,
                width: 300,
                height: 28,
                rx: 3,
                class: "fx-fb-body",
              },
              gB,
            )
        : () =>
            H.svgn(
              "rect",
              {
                x: -62,
                y: -40,
                width: 124,
                height: 80,
                rx: 6,
                class: "fx-fb-body",
              },
              gB,
            );
  shape();
  tx(H, gB, 0, 5, b.label || "", "ax-nl", "middle");
  const hw = b.shape === "beam" ? 150 : b.shape === "sphere" ? 42 : 62,
    hh = b.shape === "beam" ? 14 : b.shape === "sphere" ? 42 : 40;
  F.forEach((f, i) => {
    const th = (f.angle * Math.PI) / 180,
      ux = Math.cos(th),
      uy = -Math.sin(th),
      L = 70 + 150 * ((f.magnitude || 1) / maxM),
      col = H.PALETTE[i % 6];
    const sx = f.point === "center" || !f.point ? 0 : ux * hw * 0.98,
      sy = f.point === "center" || !f.point ? 0 : uy * hh * 0.98,
      ex = sx + ux * L,
      ey = sy + uy * L;
    H.svgn(
      "path",
      {
        d: `M${sx} ${sy}L${ex} ${ey}`,
        class: "fx-fb-vec",
        stroke: col,
        "marker-end": `url(#${H.id}-arr)`,
      },
      gF,
    );
    tx(
      H,
      gF,
      ex + ux * 14,
      ey + uy * 14 + 4,
      `${f.label}${f.magnitude ? ` = ${H.fmt(f.magnitude, 2)} ${f.unit || ""}` : ""}`,
      "fx-halo is-bold",
      ux > 0.3 ? "start" : ux < -0.3 ? "end" : "middle",
    );
    Rx += (f.magnitude || 0) * Math.cos(th);
    Ry += (f.magnitude || 0) * Math.sin(th);
  });
  const Rm = Math.hypot(Rx, Ry),
    unit = F.find((f) => f.unit)?.unit || "";
  tx(
    H,
    g,
    0,
    130,
    Rm < 1e-9
      ? "ΣF = 0 (équilibre, calculé)"
      : `ΣF = ${H.fmt(Rm, 2)} ${unit} à ${H.fmt((Math.atan2(Ry, Rx) * 180) / Math.PI, 1)}° (calculé)`,
    "ax-ndetail",
    "middle",
  );
  H.svgn(
    "path",
    {
      d: "M-250 120V70M-250 120H-200",
      class: "ax-axis",
      "marker-end": `url(#${H.id}-arr)`,
    },
    g,
  );
  tx(H, g, -196, 124, "x", "ax-ndetail");
  tx(H, g, -254, 64, "y", "ax-ndetail", "end");
  return { x: -330, y: -230, w: 660, h: 480 };
}

/* ═══ LIGNES (métro / transport) : tracés horizontaux et diagonaux, correspondances en cercles épais ═══ */
function transit(a, g, H) {
  const S = new Map(a.stations.map((s) => [s.id, s])),
    P = new Map(),
    STEP = 112,
    ANG = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];
  let free = 0;
  a.lines.forEach((ln, li) => {
    const st = ln.stations.filter((id) => S.has(id)),
      ai = st.findIndex((id) => P.has(id));
    if (ai < 0) {
      st.forEach((id, i) => P.set(id, { x: i * STEP, y: free * 260 }));
      free++;
      return;
    }
    const th = ANG[(li - 1) % 4],
      c = P.get(st[ai]);
    st.forEach((id, i) => {
      if (!P.has(id))
        P.set(id, {
          x: c.x + (i - ai) * STEP * Math.cos(th),
          y: c.y + (i - ai) * STEP * Math.sin(th),
        });
    });
  });
  const cnt = new Map();
  a.lines.forEach((ln) =>
    ln.stations.forEach((id) => cnt.set(id, (cnt.get(id) || 0) + 1)),
  );
  a.lines.forEach((ln, li) => {
    const pts = ln.stations.filter((id) => P.has(id)).map((id) => P.get(id));
    H.svgn(
      "path",
      {
        d: pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(""),
        class: "fx-tr-line",
        stroke: ln.color || H.PALETTE[li % 6],
      },
      g,
    );
  });
  S.forEach((s, id) => {
    const p = P.get(id);
    if (!p) return;
    const x = cnt.get(id) > 1;
    H.svgn(
      "circle",
      { cx: p.x, cy: p.y, r: x ? 11 : 6.5, class: x ? "fx-tr-ix" : "fx-tr-st" },
      g,
    );
    const t = tx(
      H,
      g,
      p.x + (x ? 16 : 10),
      p.y - (x ? 14 : 12),
      s.label,
      x ? "fx-halo is-bold" : "fx-halo",
    );
    if (!x) t.setAttribute("transform", `rotate(-32 ${p.x + 10} ${p.y - 12})`);
  });
  a.lines.forEach((ln, li) => {
    H.svgn(
      "rect",
      {
        x: -60,
        y: -150 - li * 0 + li * 24 - 40,
        width: 26,
        height: 10,
        rx: 5,
        fill: ln.color || H.PALETTE[li % 6],
      },
      g,
    );
    tx(H, g, -28, -150 + li * 24 - 31, ln.label, "ax-nl is-field");
  });
  const xs = [...P.values()].map((p) => p.x),
    ys = [...P.values()].map((p) => p.y),
    x0 = Math.min(...xs, -60),
    y0 = Math.min(...ys, -200);
  return {
    x: x0 - 80,
    y: y0 - 70,
    w: Math.max(...xs) - x0 + 300,
    h: Math.max(...ys) - y0 + 220,
  };
}

export const FAMILIES_2 = {
  flowchart,
  concept_map: conceptMap,
  network,
  cycle_diagram: cycle,
  layers_diagram: layers,
  gantt,
  sankey_diagram: sankey,
  electrical_circuit: circuit,
  hydraulic_circuit: circuit,
  heatmap,
  forces_diagram: forcesDiagram,
  transit_map: transit,
};
