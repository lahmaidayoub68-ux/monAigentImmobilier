/* AiGENT — Shape Kit : langage de formes + matériaux PBR + 35 pièces courantes + recalage au sol. */
const nn = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const strip = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const v3 = (T, a, d = [0, 0, 0]) =>
  new T.Vector3(nn(a?.[0], d[0]), nn(a?.[1], d[1]), nn(a?.[2], d[2]));

export const MATS = {
  steel: { c: 0x9aa4b2, m: 0.9, r: 0.38 },
  aluminium: { c: 0xc3cad3, m: 0.85, r: 0.3 },
  iron: { c: 0x4b5058, m: 0.7, r: 0.6 },
  concrete: { c: 0xa9adb1, m: 0, r: 0.95 },
  brick: { c: 0xa4553d, m: 0, r: 0.9 },
  glass: { c: 0x9fd0e8, m: 0.1, r: 0.05, o: 0.28 },
  rubber: { c: 0x23262b, m: 0, r: 0.85 },
  plastic: { c: 0xdfe3e8, m: 0, r: 0.45 },
  wood: { c: 0x9b6b43, m: 0, r: 0.75 },
  copper: { c: 0xb87333, m: 0.9, r: 0.35 },
  gold: { c: 0xd4af37, m: 1, r: 0.25 },
  water: { c: 0x3f87c0, m: 0, r: 0.1, o: 0.55 },
  fabric: { c: 0x6b7a99, m: 0, r: 1 },
  ceramic: { c: 0xf2efe8, m: 0, r: 0.2 },
  paint: { c: 0xe9edf1, m: 0.1, r: 0.4 },
  grass: { c: 0x5d9a4a, m: 0, r: 1 },
  soil: { c: 0x7a5c3e, m: 0, r: 1 },
  rock: { c: 0x7e7766, m: 0, r: 0.95 },
  light: { c: 0xfff3d6, m: 0, r: 0.5, e: 1 },
};
export function parseMat(spec) {
  const s = String(spec || "paint").trim(),
    i = s.indexOf(":"),
    name = i < 0 ? s : s.slice(0, i),
    col = i < 0 ? "" : s.slice(i + 1);
  const base =
    MATS[name] ||
    (/^#[0-9a-f]{6}$/i.test(s)
      ? { ...MATS.paint, c: parseInt(s.slice(1), 16) }
      : MATS.paint);
  return {
    color: /^#[0-9a-f]{6}$/i.test(col) ? parseInt(col.slice(1), 16) : base.c,
    metalness: base.m,
    roughness: base.r,
    opacity: base.o ?? 1,
    emissive: !!base.e,
  };
}

function roundedBox(T, w, h, d, r) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  if (!(r > 0.002)) return new T.BoxGeometry(w, h, d);
  const s = new T.Shape(),
    x = w / 2,
    y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  const bev = Math.min(r * 0.8, d / 2 - 1e-3),
    g = new T.ExtrudeGeometry(s, {
      depth: Math.max(1e-3, d - 2 * bev),
      bevelEnabled: true,
      bevelThickness: bev,
      bevelSize: 1e-4,
      bevelSegments: 2,
      curveSegments: 6,
    });
  g.translate(0, 0, -(d - 2 * bev) / 2);
  return g;
}
function rod(T, g, mat, a, b, r) {
  const d = b.clone().sub(a),
    L = d.length();
  if (L < 1e-6) return;
  const m = new T.Mesh(new T.CylinderGeometry(r, r, L, 8), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  g.add(m);
}
function resample(poly, N) {
  const L = [0];
  for (let i = 1; i <= poly.length; i++) {
    const a = poly[i - 1],
      b = poly[i % poly.length];
    L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const tot = L[poly.length] || 1,
    out = [];
  for (let k = 0; k < N; k++) {
    const t = (k / N) * tot;
    let i = 1;
    while (i < poly.length && L[i] < t) i++;
    const a = poly[i - 1],
      b = poly[i % poly.length],
      f = (t - L[i - 1]) / (L[i] - L[i - 1] || 1);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
function loftGeo(T, secs) {
  const N = Math.min(48, Math.max(6, ...secs.map((s) => s.poly.length))),
    rings = secs.map((s) => resample(s.poly, N).map(([x, z]) => [x, s.y, z])),
    pos = [],
    idx = [];
  rings.forEach((r) => r.forEach((p) => pos.push(...p)));
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < N; j++) {
      const a = i * N + j,
        b = i * N + ((j + 1) % N),
        c = (i + 1) * N + j,
        d = (i + 1) * N + ((j + 1) % N);
      idx.push(a, b, c, b, d, c);
    }
  for (const [ri, base] of [
    [0, 0],
    [rings.length - 1, (rings.length - 1) * N],
  ]) {
    const cx = rings[ri].reduce((s, p) => s + p[0], 0) / N,
      cz = rings[ri].reduce((s, p) => s + p[2], 0) / N,
      ci = pos.length / 3;
    pos.push(cx, rings[ri][0][1], cz);
    for (let j = 0; j < N; j++) idx.push(ci, base + j, base + ((j + 1) % N));
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Interprète un nœud du langage de formes. X = { matp(spec), seg }. */
export function buildShape(
  T,
  node,
  X,
  depth = 0,
  budget = { n: 0 },
  mname = "paint",
) {
  const g = new T.Group();
  if (!node || typeof node !== "object" || depth > 5 || budget.n++ > 500)
    return g;
  const m = node.mat || mname,
    M = () => X.matp(parseMat(m)),
    P = node.size || [1, 1, 1],
    seg = X.seg,
    half = Math.max(8, (seg / 2) | 0);
  const add = (geo, pos) => {
    const mesh = new T.Mesh(geo, M());
    if (pos) mesh.position.set(...pos);
    g.add(mesh);
    return mesh;
  };
  switch (node.op) {
    case "box":
      add(roundedBox(T, P[0], P[1], P[2], node.r || 0));
      break;
    case "cyl":
      add(
        new T.CylinderGeometry(
          node.rt ?? node.r,
          node.rb ?? node.r,
          node.h,
          seg,
        ),
      );
      break;
    case "sphere":
      add(new T.SphereGeometry(node.r, seg, half));
      break;
    case "dome":
      add(
        new T.SphereGeometry(node.r, seg, half, 0, Math.PI * 2, 0, Math.PI / 2),
      );
      break;
    case "cone":
      add(new T.ConeGeometry(node.r, node.h, seg));
      break;
    case "capsule":
      add(new T.CapsuleGeometry(node.r, node.h, 6, seg));
      break;
    case "torus":
      add(new T.TorusGeometry(node.R, node.r, 12, (seg * 1.5) | 0));
      break;
    case "prism":
      add(
        new T.CylinderGeometry(node.r, node.r, node.h, Math.max(3, node.n | 0)),
      );
      break;
    case "wedge": {
      const s = new T.Shape();
      s.moveTo(-P[0] / 2, -P[1] / 2);
      s.lineTo(P[0] / 2, -P[1] / 2);
      s.lineTo(-P[0] / 2, P[1] / 2);
      s.closePath();
      const geo = new T.ExtrudeGeometry(s, {
        depth: P[2],
        bevelEnabled: false,
      });
      geo.translate(0, 0, -P[2] / 2);
      add(geo);
      break;
    }
    case "lathe":
      add(
        new T.LatheGeometry(
          node.profile.map(([r, y]) => new T.Vector2(Math.max(0.001, r), y)),
          seg,
        ),
      );
      break;
    case "extrude": {
      const s = new T.Shape(node.poly.map(([x, z]) => new T.Vector2(x, -z))),
        b = node.bevel || 0,
        geo = new T.ExtrudeGeometry(s, {
          depth: node.h,
          bevelEnabled: !!b,
          bevelSize: b,
          bevelThickness: b,
          bevelSegments: 2,
        });
      geo.rotateX(-Math.PI / 2);
      add(geo);
      break;
    }
    case "loft":
      add(loftGeo(T, node.sections));
      break;
    case "tube":
      add(
        new T.TubeGeometry(
          new T.CatmullRomCurve3(node.path.map((p) => v3(T, p))),
          Math.max(24, node.path.length * 12),
          node.r,
          10,
          false,
        ),
      );
      break;
    case "hollow": {
      const [w, h, d] = P,
        t = node.t || 0.1,
        open = node.open || "top",
        wall = (sz, p) =>
          add(roundedBox(T, sz[0], sz[1], sz[2], node.r || 0), p);
      if (open !== "bottom") wall([w, t, d], [0, -h / 2 + t / 2, 0]);
      if (open !== "top") wall([w, t, d], [0, h / 2 - t / 2, 0]);
      if (open !== "front") wall([w, h, t], [0, 0, d / 2 - t / 2]);
      if (open !== "back") wall([w, h, t], [0, 0, -d / 2 + t / 2]);
      wall([t, h, d], [-w / 2 + t / 2, 0, 0]);
      wall([t, h, d], [w / 2 - t / 2, 0, 0]);
      break;
    }
    case "plate": {
      const [w, d] = P,
        s = new T.Shape();
      s.moveTo(-w / 2, -d / 2);
      s.lineTo(w / 2, -d / 2);
      s.lineTo(w / 2, d / 2);
      s.lineTo(-w / 2, d / 2);
      s.closePath();
      (node.holes || []).forEach(([x, z, r]) => {
        const h = new T.Path();
        h.absarc(x, -z, r, 0, Math.PI * 2, true);
        s.holes.push(h);
      });
      const geo = new T.ExtrudeGeometry(s, {
        depth: node.t || 0.05,
        bevelEnabled: false,
      });
      geo.rotateX(-Math.PI / 2);
      add(geo);
      break;
    }
    case "stairs":
      for (let i = 0; i < (node.n || 10); i++)
        add(
          new T.BoxGeometry(
            node.w || 1,
            (i + 1) * (node.rise || 0.18),
            node.run || 0.28,
          ),
          [
            0,
            ((i + 1) * (node.rise || 0.18)) / 2,
            i * (node.run || 0.28) + (node.run || 0.28) / 2,
          ],
        );
      break;
    case "rail": {
      const path = node.path.map((p) => v3(T, p)),
        h = node.h || 1;
      path.forEach((p, i) => {
        add(new T.CylinderGeometry(0.02, 0.02, h, 8), [p.x, p.y + h / 2, p.z]);
        if (i)
          for (const k of [1, 0.55])
            rod(
              T,
              g,
              M(),
              new T.Vector3(
                path[i - 1].x,
                path[i - 1].y + h * k,
                path[i - 1].z,
              ),
              new T.Vector3(p.x, p.y + h * k, p.z),
              0.018,
            );
      });
      break;
    }
    case "truss": {
      const A = v3(T, node.from),
        B = v3(T, node.to),
        w = node.w || 0.4,
        bays = node.bays || 6,
        dir = B.clone().sub(A),
        L = dir.length(),
        loc = new T.Group(),
        mt = M();
      for (const [y, z] of [
        [w / 2, w / 2],
        [-w / 2, w / 2],
        [-w / 2, -w / 2],
        [w / 2, -w / 2],
      ])
        rod(T, loc, mt, new T.Vector3(0, y, z), new T.Vector3(L, y, z), 0.02);
      for (let i = 0; i < bays; i++)
        for (const zz of [w / 2, -w / 2]) {
          const ya = i % 2 ? w / 2 : -w / 2;
          rod(
            T,
            loc,
            mt,
            new T.Vector3((i / bays) * L, ya, zz),
            new T.Vector3(((i + 1) / bays) * L, -ya, zz),
            0.012,
          );
        }
      loc.position.copy(A);
      loc.quaternion.setFromUnitVectors(
        new T.Vector3(1, 0, 0),
        dir.normalize(),
      );
      g.add(loc);
      break;
    }
    case "group":
      (node.children || []).forEach((c) =>
        g.add(buildShape(T, c, X, depth + 1, budget, m)),
      );
      break;
    case "array": {
      const n = Math.min(200, node.n || 1),
        proto = buildShape(T, node.of, X, depth + 1, budget, m),
        st = node.step || [1, 0, 0],
        nx = node.nx || Math.ceil(Math.sqrt(n));
      for (let i = 0; i < n; i++) {
        const c = i ? proto.clone(true) : proto;
        if (node.kind === "grid")
          c.position.add(
            new T.Vector3(
              (i % nx) * (node.sx || 1),
              0,
              Math.floor(i / nx) * (node.sz || 1),
            ),
          );
        else if (node.kind === "radial") {
          const a = (i / n) * Math.PI * 2;
          c.position.add(
            new T.Vector3(
              Math.cos(a) * (node.r || 0),
              0,
              Math.sin(a) * (node.r || 0),
            ),
          );
          c.rotation.y = -a;
        } else c.position.add(new T.Vector3(st[0] * i, st[1] * i, st[2] * i));
        g.add(c);
      }
      break;
    }
    case "mirror": {
      const proto = buildShape(T, node.of, X, depth + 1, budget, m),
        twin = proto.clone(true);
      twin.scale[node.axis || "x"] *= -1;
      g.add(proto, twin);
      break;
    }
    case "lib":
      if (LIB[node.name])
        g.add(
          buildShape(
            T,
            LIB[node.name](node.params || {}),
            X,
            depth + 1,
            budget,
            m,
          ),
        );
      break;
  }
  if (node.at)
    g.position.set(nn(node.at[0], 0), nn(node.at[1], 0), nn(node.at[2], 0));
  if (node.rot)
    g.rotation.set(...node.rot.map((d) => (nn(d, 0) * Math.PI) / 180));
  if (node.scale != null)
    Array.isArray(node.scale)
      ? g.scale.set(...node.scale)
      : g.scale.setScalar(nn(node.scale, 1));
  return g;
}

/* ═══ 35 pièces courantes (mètres) : mêmes formes que celles de l'IA ═══ */
const S = (op, o = {}) => ({ op, ...o }),
  G = (children, o = {}) => S("group", { children, ...o });
const B = (size, o) => S("box", { size, ...o }),
  C = (r, h, o) => S("cyl", { r, h, ...o }),
  Sp = (r, o) => S("sphere", { r, ...o }),
  Tor = (R, r, o) => S("torus", { R, r, ...o });
const dome = (r, o) => S("dome", { r, scale: [1, 0.42, 1], ...o }),
  ring = (n, f) => Array.from({ length: n }, (_, i) => f(i)),
  AR = (n, step, of) => S("array", { kind: "linear", n, step, of });
export const LIB = {
  pipe_run: (p) => {
    const r = p.r || 0.08,
      L = p.len || 3;
    return G([
      C(r, L, { mat: p.mat || "steel", rot: [0, 0, 90] }),
      ...[-0.48, 0, 0.48].map((k) =>
        C(r * 1.6, r * 0.6, {
          mat: "iron",
          rot: [0, 0, 90],
          at: [k * L, 0, 0],
        }),
      ),
    ]);
  },
  valve: (p) =>
    G([
      Sp(0.2, { mat: p.mat || "paint:#c0392b" }),
      C(0.11, 0.9, { mat: "steel", rot: [0, 0, 90] }),
      C(0.025, 0.4, { mat: "steel", at: [0, 0.35, 0] }),
      Tor(0.17, 0.02, {
        mat: "paint:#d9534f",
        rot: [90, 0, 0],
        at: [0, 0.58, 0],
      }),
    ]),
  tank_vertical: (p) => {
    const r = p.r || 0.9,
      h = p.h || 2.6,
      m = p.mat || "steel";
    return G([
      C(r, h, { mat: m, at: [0, h / 2 + 0.4, 0] }),
      dome(r, { mat: m, at: [0, h + 0.4, 0] }),
      ...[
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ].map(([x, z]) =>
        C(0.05, 0.4, { mat: "iron", at: [x * r * 0.7, 0.2, z * r * 0.7] }),
      ),
    ]);
  },
  tank_horizontal: (p) => {
    const r = p.r || 0.8,
      L = p.len || 3.2,
      m = p.mat || "steel";
    return G([
      C(r, L, { mat: m, rot: [0, 0, 90], at: [0, r + 0.35, 0] }),
      ...[-1, 1].map((s) =>
        dome(r, {
          mat: m,
          rot: [0, 0, -s * 90],
          at: [(s * L) / 2, r + 0.35, 0],
        }),
      ),
      ...[-0.3, 0.3].map((k) =>
        B([0.2, 0.35, r * 1.4], { mat: "concrete", at: [k * L, 0.17, 0] }),
      ),
    ]);
  },
  pump: () =>
    G([
      C(0.28, 0.5, { mat: "paint:#2f6fb0", rot: [90, 0, 0], at: [0, 0.45, 0] }),
      C(0.22, 0.7, {
        mat: "paint:#2f6fb0",
        rot: [0, 0, 90],
        at: [0.55, 0.45, 0],
      }),
      C(0.07, 0.5, { mat: "steel", at: [0, 0.9, 0] }),
      B([1.6, 0.12, 0.7], { mat: "iron", r: 0.02, at: [0.2, 0.06, 0] }),
    ]),
  motor: (p) =>
    G([
      C(0.3, 0.8, { mat: p.mat || "paint:#3b5d8c", rot: [0, 0, 90] }),
      ...ring(7, (i) =>
        Tor(0.31, 0.02, {
          mat: p.mat || "paint:#3b5d8c",
          rot: [0, 90, 0],
          at: [-0.3 + i * 0.1, 0, 0],
        }),
      ),
      dome(0.3, { mat: "iron", rot: [0, 0, -90], at: [0.4, 0, 0] }),
      B([0.22, 0.14, 0.22], { mat: "iron", at: [0, 0.38, 0] }),
      B([0.9, 0.06, 0.5], { mat: "iron", at: [0, -0.33, 0] }),
    ]),
  gearbox: () =>
    G([
      B([0.8, 0.6, 0.6], { r: 0.06, mat: "paint:#8a96a6" }),
      C(0.07, 0.5, { rot: [0, 0, 90], at: [-0.55, 0.1, 0], mat: "steel" }),
      C(0.07, 0.5, { rot: [0, 0, 90], at: [0.55, -0.1, 0], mat: "steel" }),
    ]),
  fan: () =>
    G([
      Tor(0.5, 0.04, { mat: "steel", rot: [90, 0, 0] }),
      C(0.1, 0.12, { mat: "iron" }),
      S("array", {
        kind: "radial",
        n: 5,
        r: 0,
        of: B([0.34, 0.02, 0.12], { mat: "paint:#b0b8c4", at: [0.22, 0, 0] }),
      }),
    ]),
  ladder: () =>
    G([
      B([0.04, 2.4, 0.04], { at: [-0.2, 1.2, 0], mat: "aluminium" }),
      B([0.04, 2.4, 0.04], { at: [0.2, 1.2, 0], mat: "aluminium" }),
      AR(
        8,
        [0, 0.3, 0],
        C(0.015, 0.4, { rot: [0, 0, 90], at: [0, 0.2, 0], mat: "aluminium" }),
      ),
    ]),
  guardrail: (p) =>
    S("rail", {
      path: p.path || [
        [0, 0, 0],
        [3, 0, 0],
      ],
      h: 1,
      mat: p.mat || "paint:#f2c230",
    }),
  stairs_flight: (p) =>
    G([
      S("stairs", { n: p.n || 12, w: p.w || 1.1, mat: "concrete" }),
      S("rail", {
        path: [
          [0.55, 0.18, 0],
          [0.55, 2.2, 3.4],
        ],
        h: 0.9,
        mat: "steel",
      }),
    ]),
  door: () =>
    G([
      S("hollow", {
        size: [1, 2.1, 0.12],
        t: 0.06,
        open: "none",
        mat: "aluminium",
      }),
      B([0.86, 2, 0.04], { mat: "wood" }),
      B([0.12, 0.03, 0.05], { mat: "steel", at: [0.35, 0, 0.07] }),
    ]),
  window_frame: () =>
    G([
      S("hollow", {
        size: [1.2, 1.2, 0.1],
        t: 0.05,
        open: "none",
        mat: "aluminium",
      }),
      B([1.1, 1.1, 0.012], { mat: "glass" }),
      B([0.03, 1.1, 0.03], { mat: "aluminium" }),
    ]),
  i_beam: (p) =>
    S("extrude", {
      poly: [
        [-0.1, -0.2],
        [0.1, -0.2],
        [0.1, -0.17],
        [0.02, -0.17],
        [0.02, 0.17],
        [0.1, 0.17],
        [0.1, 0.2],
        [-0.1, 0.2],
        [-0.1, 0.17],
        [-0.02, 0.17],
        [-0.02, -0.17],
        [-0.1, -0.17],
      ],
      h: p.len || 4,
      rot: [0, 0, 90],
      mat: "steel",
    }),
  truss_span: (p) =>
    S("truss", {
      from: [0, 0, 0],
      to: [p.len || 6, 0, 0],
      w: 0.5,
      bays: 8,
      mat: p.mat || "paint:#c0392b",
    }),
  container: (p) =>
    G([
      B([6.06, 2.6, 2.44], { r: 0.03, mat: p.mat || "paint:#2f6fb0" }),
      AR(
        24,
        [0.25, 0, 0],
        B([0.04, 2.3, 0.03], { mat: "paint:#285c94", at: [-2.9, 0, 1.23] }),
      ),
      AR(
        24,
        [0.25, 0, 0],
        B([0.04, 2.3, 0.03], { mat: "paint:#285c94", at: [-2.9, 0, -1.23] }),
      ),
    ]),
  antenna_mast: () =>
    G([
      C(0.05, 6, { mat: "steel", at: [0, 3, 0] }),
      AR(
        4,
        [0, 1.1, 0],
        B([1.2, 0.04, 0.04], { mat: "aluminium", at: [0, 1.3, 0] }),
      ),
      dome(0.4, { mat: "paint:#e9edf1", rot: [90, 0, 0], at: [0.2, 5.5, 0.3] }),
    ]),
  solar_panel: () =>
    G([
      B([1.7, 0.04, 1], {
        mat: "paint:#1b3a6b",
        rot: [-30, 0, 0],
        at: [0, 0.7, 0],
      }),
      C(0.03, 0.7, { mat: "steel", at: [0, 0.35, 0.15] }),
      B([1.74, 0.03, 0.04], {
        mat: "aluminium",
        rot: [-30, 0, 0],
        at: [0, 0.7, 0],
      }),
    ]),
  battery_pack: () =>
    G([
      B([0.6, 0.35, 0.4], { r: 0.03, mat: "paint:#2c3440" }),
      C(0.04, 0.05, { mat: "copper", at: [-0.15, 0.2, 0] }),
      C(0.04, 0.05, { mat: "copper", at: [0.15, 0.2, 0] }),
    ]),
  control_cabinet: () =>
    G([
      B([0.8, 2, 0.5], { r: 0.02, mat: "paint:#aeb6c1" }),
      AR(
        8,
        [0, 0.05, 0],
        B([0.4, 0.015, 0.01], { mat: "iron", at: [0, 0.2, 0.26] }),
      ),
      B([0.03, 0.2, 0.03], { mat: "steel", at: [0.3, 0, 0.27] }),
    ]),
  monitor: () =>
    G([
      B([0.7, 0.42, 0.03], { r: 0.01, mat: "paint:#15181d", at: [0, 0.5, 0] }),
      B([0.64, 0.36, 0.005], { mat: "light", at: [0, 0.5, 0.018] }),
      C(0.02, 0.25, { mat: "steel", at: [0, 0.22, 0] }),
      C(0.12, 0.015, { mat: "steel", at: [0, 0.01, 0] }),
    ]),
  cctv: () =>
    G([
      C(0.06, 0.25, { rot: [0, 0, 90], mat: "paint:#e9edf1" }),
      Sp(0.07, { mat: "glass", at: [0.14, 0, 0] }),
      B([0.04, 0.2, 0.04], { mat: "steel", at: [-0.1, 0.1, 0] }),
    ]),
  lamp_post: () =>
    G([
      S("cyl", {
        rt: 0.04,
        rb: 0.08,
        h: 5,
        mat: "paint:#4a5360",
        at: [0, 2.5, 0],
      }),
      S("tube", {
        path: [
          [0, 5, 0],
          [0, 5.4, 0],
          [0.5, 5.6, 0],
          [1, 5.6, 0],
        ],
        r: 0.035,
        mat: "paint:#4a5360",
      }),
      B([0.4, 0.08, 0.18], { mat: "light", at: [1, 5.55, 0] }),
    ]),
  wheel: () =>
    G([
      C(0.35, 0.2, { rot: [90, 0, 0], mat: "rubber" }),
      C(0.22, 0.22, { rot: [90, 0, 0], mat: "aluminium" }),
      Tor(0.22, 0.02, { mat: "steel", at: [0, 0, 0.12] }),
      C(0.06, 0.26, { rot: [90, 0, 0], mat: "steel" }),
    ]),
  flange_bolts: () =>
    G([
      C(0.4, 0.06, { mat: "iron" }),
      S("array", {
        kind: "radial",
        n: 8,
        r: 0.3,
        of: C(0.03, 0.09, { mat: "steel" }),
      }),
    ]),
  cable_tray: () =>
    G([
      S("hollow", { size: [3, 0.1, 0.3], t: 0.015, open: "top", mat: "steel" }),
      AR(
        12,
        [0.25, 0, 0],
        B([0.01, 0.01, 0.3], { mat: "steel", at: [-1.4, 0.045, 0] }),
      ),
    ]),
  chimney: (p) =>
    S("lathe", {
      profile: [
        [0.5, 0],
        [0.45, 3],
        [0.38, 6],
        [0.36, 8],
        [0.4, 8.2],
      ],
      mat: p.mat || "paint:#b45a45",
    }),
  wall_panel: () =>
    G([
      B([3, 2.6, 0.12], { mat: "concrete" }),
      AR(
        2,
        [0, 1.1, 0],
        AR(
          3,
          [0.9, 0, 0],
          B([0.5, 0.7, 0.02], { mat: "glass", at: [-0.9, -0.5, 0.07] }),
        ),
      ),
    ]),
  desk: () =>
    G([
      B([1.4, 0.04, 0.7], { mat: "wood", at: [0, 0.74, 0] }),
      S("array", {
        kind: "grid",
        n: 4,
        nx: 2,
        sx: 1.3,
        sz: 0.6,
        of: B([0.04, 0.72, 0.04], { mat: "steel", at: [-0.65, 0.36, -0.3] }),
      }),
      B([0.4, 0.5, 0.6], { mat: "wood", at: [0.4, 0.45, 0] }),
    ]),
  tree: () =>
    G([
      C(0.12, 1.6, { mat: "wood", at: [0, 0.8, 0] }),
      Sp(0.9, { mat: "grass", at: [0, 2.2, 0] }),
      Sp(0.65, { mat: "grass", at: [0.4, 2.8, 0.2] }),
      Sp(0.55, { mat: "grass", at: [-0.4, 2.7, -0.2] }),
    ]),
  rock: () =>
    G([
      Sp(0.6, { mat: "rock", scale: [1.3, 0.7, 1], at: [0, 0.35, 0] }),
      Sp(0.4, { mat: "rock", scale: [1, 0.8, 1.2], at: [0.5, 0.25, 0.2] }),
    ]),
  conveyor: () =>
    G([
      B([4, 0.08, 0.7], { mat: "iron", at: [0, 0.8, 0] }),
      B([4.02, 0.03, 0.6], { mat: "rubber", at: [0, 0.86, 0] }),
      AR(
        6,
        [0.7, 0, 0],
        C(0.05, 0.66, { rot: [90, 0, 0], mat: "steel", at: [-1.75, 0.8, 0] }),
      ),
      ...[-1.9, 1.9].map((x) =>
        C(0.04, 0.8, { mat: "iron", at: [x, 0.4, 0.3] }),
      ),
    ]),
  crane_arm: () =>
    G([
      S("truss", {
        from: [0, 0, 0],
        to: [0, 6, 0],
        w: 0.5,
        bays: 8,
        mat: "paint:#f2c230",
      }),
      S("truss", {
        from: [0, 6, 0],
        to: [5, 6.6, 0],
        w: 0.4,
        bays: 7,
        mat: "paint:#f2c230",
      }),
      B([0.7, 0.6, 0.7], { mat: "paint:#f2c230", at: [0, 0.3, 0] }),
    ]),
  hvac_unit: () =>
    G([
      B([1.6, 0.8, 0.9], { r: 0.03, mat: "paint:#aeb6c1" }),
      C(0.35, 0.03, { mat: "iron", at: [0, 0.42, 0] }),
      AR(
        6,
        [0, 0, 0.12],
        B([0.04, 0.5, 0.01], { mat: "iron", at: [0.78, 0, -0.3] }),
      ),
    ]),
  heat_exchanger: () =>
    G([
      C(0.4, 2.4, { mat: "steel", rot: [0, 0, 90], at: [0, 0.9, 0] }),
      ...[-1, 1].map((s) =>
        dome(0.4, {
          mat: "steel",
          rot: [0, 0, -s * 90],
          at: [s * 1.2, 0.9, 0],
        }),
      ),
      ...[-0.6, 0.6].map((x) =>
        B([0.25, 0.4, 0.6], { mat: "concrete", at: [x, 0.2, 0] }),
      ),
    ]),
};
export const LIB_NAMES = Object.keys(LIB);

/* ═══ Volume propre pour une pièce sans forme : déduit de son texte, jamais une boule générique ═══ */
const SHAPE_KEYS = [
  [
    /cylindr|tube|tuyau|cuve|reservoir|mat\b|poteau|colonne|conduite|silo|cable|pilier/,
    "cyl",
  ],
  [/sphere|boule|ballon|globe/, "sph"],
  [/dome|coupole/, "dome"],
  [/cone|entonnoir/, "cone"],
  [
    /plaque|panneau|dalle|toit|plateforme|pont\b|sol\b|plancher|tablier|plateau|quai|terrain/,
    "plate",
  ],
];
const MAT_KEYS = [
  [/acier|metal|\bfer\b|inox/, "steel"],
  [/alu/, "aluminium"],
  [/verre|vitre|vitrage/, "glass"],
  [/beton|ciment/, "concrete"],
  [/bois/, "wood"],
  [/\beau\b|mer\b|liquide/, "water"],
  [/caoutchouc|pneu/, "rubber"],
  [/cuivre|cable/, "copper"],
  [/brique/, "brick"],
  [/herbe|pelouse/, "grass"],
  [/terre|\bsol\b/, "soil"],
  [/roche|pierre|rocher/, "rock"],
];
const HUES = ["#8aa4c8", "#c8a78a", "#8ac8a7", "#c88a9f", "#a98ac8", "#c8c28a"];
export function fallbackVolume(T, part, X) {
  const txt = strip(`${part.label} ${part.kind} ${part.detail}`),
    key = SHAPE_KEYS.find(([re]) => re.test(txt))?.[1] || "box";
  const sc = (part.scale || [1, 1, 1]).map((v) =>
      Math.min(6, Math.max(0.25, nn(v, 1))),
    ),
    w = X.d("width", 1.4 * sc[0]),
    h = X.d("height", sc[1]),
    dp = X.d("depth", sc[2]),
    mn = Math.min(w, dp);
  const hue =
    HUES[
      [...String(part.id)].reduce((s, c) => s + c.charCodeAt(0), 0) %
        HUES.length
    ];
  const mat =
    part.material ||
    MAT_KEYS.find(([re]) => re.test(txt))?.[1] ||
    (part.color ? `paint:${part.color}` : `paint:${hue}`);
  const node =
    key === "cyl"
      ? C(mn / 2, h)
      : key === "sph"
        ? Sp(mn / 2)
        : key === "dome"
          ? dome(mn / 2)
          : key === "cone"
            ? S("cone", { r: mn / 2, h })
            : key === "plate"
              ? B([w, Math.min(h, 0.22 * w, 0.4), dp], { r: 0.02 })
              : B([w, h, dp], { r: Math.min(w, h, dp) * 0.07 });
  return buildShape(T, node, X, 0, { n: 0 }, mat);
}

/** Les pièces isolées retombent sur la pièce en dessous, sinon sur le sol (jamais de pièce en lévitation). */
export function snapFloating(T, entries) {
  entries.forEach((e) => e.object.updateMatrixWorld(true));
  const boxes = entries.map((e) => new T.Box3().setFromObject(e.object)),
    floor = Math.min(...boxes.map((b) => b.min.y)),
    sz = new T.Vector3();
  entries.forEach((e, i) => {
    if (e.part.placement === "manual" || e.part.floating === true) return;
    const b = boxes[i],
      tol = Math.max(0.03, b.getSize(sz).length() * 0.02);
    if (
      b.min.y <= floor + tol ||
      boxes.some(
        (o, j) => j !== i && b.clone().expandByScalar(tol).intersectsBox(o),
      )
    )
      return;
    let drop = b.min.y - floor;
    boxes.forEach((o, j) => {
      if (
        j === i ||
        o.max.x < b.min.x ||
        o.min.x > b.max.x ||
        o.max.z < b.min.z ||
        o.min.z > b.max.z
      )
        return;
      const d = b.min.y - o.max.y;
      if (d >= -tol && d < drop) drop = d;
    });
    e.object.position.y -= drop;
    boxes[i].translate(new T.Vector3(0, -drop, 0));
  });
}
