/* AiGENT — Assembly Engine v2
   rôle sémantique → géométrie paramétrique → placement → motifs/miroirs → éclatement.
   Seules les pièces déclarées dans le JSON sont construites. */

import { findRecipe, buildRecipe } from "./scene-recipes.js";
import {
  buildShape,
  LIB,
  parseMat,
  fallbackVolume,
  snapFloating,
} from "./shape-kit.js";
const strip = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const nn = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const LEN = new Set([
  "length",
  "span",
  "width",
  "height",
  "diameter",
  "depth",
  "thickness",
  "chord",
  "radius",
]);

const RULES = [
  ["fuselage", /fuselage|aircraft.?body|airplane.?body|corps.?avion|cabine/],
  ["wing", /\bwing|\baile\b|\bailes\b|voilure/],
  [
    "hstab",
    /horizontal.?stab|stabilisateur|empennage.?horiz|elevator|plan.?horizontal/,
  ],
  [
    "fin",
    /tail.?fin|vertical.?stab|\bderive\b|\bfin\b|rudder|plan.?vertical|empennage.?vertical/,
  ],
  ["flap", /flap|volet|aileron|spoiler|slat/],
  ["cockpit", /cockpit|canopy|verriere|poste.?de.?pilotage/],
  ["gear", /landing.?gear|train.?d.?atterrissage|undercarriage|\btrain\b/],
  ["housing", /housing|carter|casing|boitier/],
  [
    "engine",
    /jet.?engine|turbofan|nacelle|\bengine|\bmoteur|reacteur|bloc.?moteur/,
  ],
  ["cog", /engrenage|\bgear\b|pignon|\bcog\b|couronne/],
  ["spring", /spring|ressort/],
  ["pcb", /\bpcb|circuit.?imprime|carte.?electronique|motherboard|\bboard\b/],
  ["chip", /\bchip|puce|microcontr|processeur|\bcpu\b|\bsoc\b/],
  ["capacitor", /capacit|condensateur/],
  ["connector", /connect|usb|header|prise/],
  ["slab", /\bslab|dalle|plancher|floor|radier|etage/],
  ["column", /column|poteau|pilier|colonne/],
  ["wall", /\bmur\b|wall|facade|cloison|vitrage/],
  ["roof", /roof|toit|toiture|charpente/],
  ["stairs", /stair|escalier/],
  ["foundation", /foundation|fondation|semelle|pieu/],
  ["membrane", /membrane|cell.?wall|paroi.?cell/],
  ["nucleus", /nucle|noyau/],
  ["mito", /mitochond|chloroplast/],
  ["golgi", /golgi/],
  ["tank", /\btank|cuve|reservoir|ballon|silo/],
  ["pipe", /\bpipe|tuyau|conduite|canalisation/],
  ["valve", /valve|vanne|robinet/],
];
const ANCHORED = new Set([
  "fuselage",
  "wing",
  "hstab",
  "fin",
  "cockpit",
  "engine",
  "gear",
  "flap",
]);

export function classify(part) {
  const named = strip(`${part.label} ${part.kind} ${part.id}`);
  let role = RULES.some(([r]) => r === part.role) ? part.role : null;
  if (!role)
    for (const [r, re] of RULES)
      if (re.test(named)) {
        role = r;
        break;
      }
  const st = strip(`${part.side || ""} ${part.label} ${part.id}`);
  const side = /left|gauche|_l\b/.test(st)
    ? -1
    : /right|droit|tribord|starboard|_r\b/.test(st)
      ? 1
      : 0;
  return { role, side };
}

/* ── géométrie utilitaire ── */
function foilRing(T, chord, thick, xLE, y0, z, n = 12) {
  const yt = (x) =>
    5 *
    thick *
    (0.2969 * Math.sqrt(x) -
      0.126 * x -
      0.3516 * x * x +
      0.2843 * x ** 3 -
      0.1015 * x ** 4) *
    chord;
  const cx = (i) => (1 - Math.cos((Math.PI * i) / n)) / 2,
    ring = [];
  for (let i = 0; i <= n; i++) {
    const c = cx(i);
    ring.push(new T.Vector3(xLE - c * chord, y0 + yt(c), z));
  }
  for (let i = n - 1; i > 0; i--) {
    const c = cx(i);
    ring.push(new T.Vector3(xLE - c * chord, y0 - yt(c), z));
  }
  return ring;
}
function loft(T, rings, mat) {
  const m = rings[0].length,
    pos = [],
    idx = [];
  rings.forEach((r) => r.forEach((v) => pos.push(v.x, v.y, v.z)));
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < m; j++) {
      const a = i * m + j,
        b = i * m + ((j + 1) % m),
        c = (i + 1) * m + j,
        d = (i + 1) * m + ((j + 1) % m);
      idx.push(a, b, c, b, d, c);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new T.Mesh(g, mat);
}
function wingLike(T, X, { half, rc, tc, sweep, dih, thick, side }) {
  const rings = [];
  for (let k = 0; k <= 5; k++) {
    const s = k / 5,
      c = rc + (tc - rc) * s;
    rings.push(
      foilRing(
        T,
        c,
        thick * (1 - 0.35 * s),
        -sweep * s,
        dih * s,
        side * half * s,
      ),
    );
  }
  return loft(T, rings, X.mat(0xdde4ee, 1, 0.4));
}

/* ── bibliothèque de pièces (origine = point d'attache naturel) ── */
const BUILD = {
  fuselage(T, p, X) {
    const L = X.ctx.L,
      R = X.d("diameter", L * 0.106) / 2,
      g = new T.Group(),
      n = X.seg * 2,
      prof = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let r = R;
      if (t > 0.82) {
        const k = (t - 0.82) / 0.18;
        r = R * Math.sqrt(Math.max(0, 1 - k * k));
      } else if (t < 0.22) {
        const k = 1 - t / 0.22;
        r = R * (1 - 0.8 * k * k);
      }
      prof.push(new T.Vector2(Math.max(r, 0.004), (t - 0.5) * L));
    }
    const geo = new T.LatheGeometry(prof, X.seg);
    geo.rotateZ(-Math.PI / 2);
    X.add(g, geo, p.color || 0xe3e9f1, 1, 0.3);
    const N = Math.min(30, Math.round(L * 2.4)),
      m4 = new T.Matrix4();
    const win = new T.InstancedMesh(
      new T.BoxGeometry(L * 0.011, R * 0.12, R * 0.05),
      X.mat(0x1b2736, 1, 0.1),
      N * 2,
    );
    for (let i = 0; i < N; i++)
      for (const s of [-1, 1]) {
        m4.makeTranslation(L * (-0.26 + (0.5 * i) / N), R * 0.3, s * R * 0.955);
        win.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m4);
      }
    g.add(win);
    const glass = X.add(
      g,
      new T.SphereGeometry(R * 0.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      0x16202c,
      0.95,
      0.1,
    );
    glass.scale.set(1.5, 0.55, 0.95);
    glass.position.set(L * 0.35, R * 0.33, 0);
    glass.rotation.z = -0.35;
    const belly = X.add(g, new T.SphereGeometry(1, 28, 14), 0xd5dce6, 1, 0.3);
    belly.scale.set(L * 0.14, R * 0.38, R * 0.75);
    belly.position.set(L * 0.06, -R * 0.78, 0);
    return g;
  },
  wing(T, p, X) {
    const L = X.ctx.L,
      half = X.d("span", L * 0.95) / 2,
      rc = X.d("chord", L * 0.17),
      g = new T.Group();
    const spec = {
      half,
      rc,
      tc: rc * 0.27,
      sweep: half * 0.42,
      dih: half * 0.05,
    };
    X.ctx.wing = spec;
    for (const s of X.side ? [X.side] : [-1, 1]) {
      g.add(wingLike(T, X, { ...spec, thick: 0.12, side: s }));
      const wl = X.add(
        g,
        new T.BoxGeometry(spec.tc * 0.8, half * 0.08, L * 0.004),
        0xc4cfdd,
      );
      wl.position.set(
        -spec.sweep - spec.tc * 0.4,
        spec.dih + half * 0.04,
        s * half,
      );
    }
    return g;
  },
  hstab(T, p, X) {
    const L = X.ctx.L,
      half = X.d("span", L * 0.34) / 2,
      rc = X.d("chord", L * 0.1),
      g = new T.Group();
    for (const s of X.side ? [X.side] : [-1, 1])
      g.add(
        wingLike(T, X, {
          half,
          rc,
          tc: rc * 0.3,
          sweep: half * 0.55,
          dih: half * 0.04,
          thick: 0.09,
          side: s,
        }),
      );
    return g;
  },
  fin(T, p, X) {
    const L = X.ctx.L,
      h = X.d("height", L * 0.17),
      rc = X.d("chord", L * 0.15),
      g = new T.Group();
    const w = wingLike(T, X, {
      half: h,
      rc,
      tc: rc * 0.35,
      sweep: h * 0.6,
      dih: 0,
      thick: 0.1,
      side: 1,
    });
    w.rotation.x = -Math.PI / 2;
    g.add(w);
    return g;
  },
  cockpit(T, p, X) {
    const g = new T.Group(),
      s = X.d("length", X.ctx.L * 0.07);
    X.add(
      g,
      new T.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      0x16202c,
      0.95,
      0.1,
    ).scale.set(s, s * 0.45, s * 0.6);
    return g;
  },
  flap(T, p, X) {
    const w = X.ctx.wing,
      L = X.ctx.L,
      g = new T.Group();
    const c = w ? (w.rc + (w.tc - w.rc) * 0.45) * 0.22 : L * 0.035,
      l = w ? w.half * 0.38 : L * 0.14;
    X.add(g, new T.BoxGeometry(c, L * 0.006, l), p.color || 0xaab8cc, 1, 0.4);
    return g;
  },
  engine(T, p, X) {
    if (!X.ctx.aircraft) return BUILD.engineBlock(T, p, X);
    const L = X.ctx.L,
      Ln = X.d("length", L * 0.13),
      r = X.d("diameter", L * 0.075) / 2,
      g = new T.Group();
    const prof = [
      [0.8, 0.5],
      [0.95, 0.46],
      [1, 0.3],
      [0.98, 0],
      [0.86, -0.35],
      [0.6, -0.5],
    ].map(([k, y]) => new T.Vector2(r * k, Ln * y));
    const shell = new T.LatheGeometry(prof, X.seg);
    shell.rotateZ(-Math.PI / 2);
    X.add(g, shell, p.color || 0xcfd8e4, 1, 0.5);
    const fan = X.add(g, new T.CircleGeometry(r * 0.78, 32), 0x1a2433, 1, 0.2);
    fan.rotation.y = Math.PI / 2;
    fan.position.x = Ln * 0.3;
    const blades = new T.InstancedMesh(
      new T.BoxGeometry(0.01 * L, r * 0.62, r * 0.09),
      X.mat(0xaebccd, 1, 0.7),
      18,
    );
    const m = new T.Matrix4(),
      q = new T.Quaternion(),
      e = new T.Euler(),
      v = new T.Vector3(),
      one = new T.Vector3(1, 1, 1);
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2;
      e.set(ang, 0, 0);
      q.setFromEuler(e);
      v.set(Ln * 0.31, Math.cos(ang) * r * 0.42, Math.sin(ang) * r * 0.42);
      m.compose(v, q, one);
      blades.setMatrixAt(i, m);
    }
    g.add(blades);
    const hub = X.add(
      g,
      new T.ConeGeometry(r * 0.17, Ln * 0.3, 20),
      0xd9e0ea,
      1,
      0.6,
    );
    hub.rotation.z = -Math.PI / 2;
    hub.position.x = Ln * 0.42;
    const plug = X.add(
      g,
      new T.ConeGeometry(r * 0.3, Ln * 0.4, 20),
      0x6d7a8c,
      1,
      0.6,
    );
    plug.rotation.z = Math.PI / 2;
    plug.position.x = -Ln * 0.5;
    X.add(
      g,
      new T.BoxGeometry(Ln * 0.55, r * 0.9, r * 0.12),
      0xb9c4d2,
      1,
      0.4,
    ).position.set(-Ln * 0.05, r * 1.1, 0);
    return g;
  },
  gear(T, p, X) {
    const h = X.d("height", X.ctx.L * 0.09),
      r = h * 0.03,
      g = new T.Group();
    X.add(
      g,
      new T.CylinderGeometry(r * 1.3, r, h * 0.6, 14),
      0xbfc8d4,
      1,
      0.7,
    ).position.y = -h * 0.3;
    X.add(
      g,
      new T.CylinderGeometry(r * 0.8, r * 0.8, h * 0.4, 14),
      0x8a96a6,
      1,
      0.8,
    ).position.y = -h * 0.7;
    for (const z of [-1, 1]) {
      const tire = X.add(
        g,
        new T.CylinderGeometry(h * 0.2, h * 0.2, h * 0.14, 28),
        0x20252d,
        1,
        0.1,
      );
      tire.rotation.x = Math.PI / 2;
      tire.position.set(0, -h * 0.85, z * h * 0.12);
      const hub = X.add(
        g,
        new T.CylinderGeometry(h * 0.1, h * 0.1, h * 0.16, 20),
        0xb4bcc8,
        1,
        0.8,
      );
      hub.rotation.x = Math.PI / 2;
      hub.position.copy(tire.position);
    }
    return g;
  },
  cog(T, p, X) {
    const r = X.d("diameter", 1.6) / 2,
      teeth = Math.round(X.d("teeth", Math.max(12, Math.round(r * 18)))),
      th = X.d("thickness", r * 0.35);
    const R = r * 1.14,
      st = (Math.PI * 2) / teeth,
      sh = new T.Shape(),
      g = new T.Group(),
      pts = [];
    for (let k = 0; k < teeth; k++)
      [
        [r, 0],
        [R, 0.12],
        [R, 0.42],
        [r, 0.54],
      ].forEach(([rad, f]) =>
        pts.push([
          Math.cos(k * st + st * f) * rad,
          Math.sin(k * st + st * f) * rad,
        ]),
      );
    pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    sh.closePath();
    const hole = new T.Path();
    hole.absarc(0, 0, r * 0.26, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2,
        c = new T.Path();
      c.absarc(
        Math.cos(a) * r * 0.62,
        Math.sin(a) * r * 0.62,
        r * 0.14,
        0,
        Math.PI * 2,
        true,
      );
      sh.holes.push(c);
    }
    const geo = new T.ExtrudeGeometry(sh, {
      depth: th,
      bevelEnabled: true,
      bevelSize: r * 0.015,
      bevelThickness: r * 0.015,
      bevelSegments: 1,
      curveSegments: 10,
    });
    geo.translate(0, 0, -th / 2);
    X.add(g, geo, p.color || 0x9aa7b8, 1, 0.75);
    return g;
  },
  engineBlock(T, p, X) {
    const n = Math.round(X.d("cylinders", 4)),
      pitch = 0.95,
      w = n * pitch + 0.5,
      g = new T.Group();
    X.add(g, new T.BoxGeometry(w, 0.9, 1.1), 0x6b7a8f, 0.55, 0.5);
    const crank = X.add(
      g,
      new T.CylinderGeometry(0.1, 0.1, w * 1.08, 20),
      0xc0c8d4,
      1,
      0.8,
    );
    crank.rotation.z = Math.PI / 2;
    crank.position.y = -0.28;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * pitch,
        o = i % 2;
      X.add(
        g,
        new T.CylinderGeometry(0.34, 0.34, 0.8, 24),
        0x8b97a8,
        0.85,
        0.6,
      ).position.set(x, 0.8, 0);
      X.add(
        g,
        new T.CylinderGeometry(0.29, 0.29, 0.22, 24),
        0xd0d6df,
        1,
        0.8,
      ).position.set(x, 0.55 + o * 0.25, 0);
      X.add(
        g,
        new T.CylinderGeometry(0.035, 0.035, 0.6, 8),
        0xaab4c2,
        1,
        0.8,
      ).position.set(x, 0.15 + o * 0.12, 0);
      const cw = X.add(
        g,
        new T.CylinderGeometry(0.28, 0.28, 0.06, 24),
        0xb0792e,
        1,
        0.6,
      );
      cw.rotation.z = Math.PI / 2;
      cw.position.set(x, -0.28, 0);
    }
    X.add(g, new T.BoxGeometry(w, 0.18, 1.0), 0x4a5a70, 1, 0.5).position.y =
      1.28;
    X.add(
      g,
      new T.BoxGeometry(w * 0.9, 0.3, 1.0),
      0x39465a,
      1,
      0.4,
    ).position.y = -0.6;
    return g;
  },
  spring(T, p, X) {
    const r = X.d("diameter", 0.5) / 2,
      h = X.d("length", 1.2),
      turns = Math.round(X.d("turns", 7)),
      pts = [],
      g = new T.Group();
    for (let i = 0; i <= turns * 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      pts.push(
        new T.Vector3(
          Math.cos(a) * r,
          (i / (turns * 18)) * h - h / 2,
          Math.sin(a) * r,
        ),
      );
    }
    X.add(
      g,
      new T.TubeGeometry(
        new T.CatmullRomCurve3(pts),
        pts.length * 2,
        r * 0.12,
        8,
      ),
      p.color || 0xb9c2cf,
      1,
      0.8,
    );
    return g;
  },
  slab(T, p, X) {
    const g = new T.Group();
    X.add(
      g,
      new T.BoxGeometry(
        X.d("width", 6),
        X.d("thickness", 0.18),
        X.d("depth", 4.5),
      ),
      p.color || 0xaab2bd,
      1,
      0.1,
    );
    return g;
  },
  column(T, p, X) {
    const g = new T.Group(),
      h = X.d("height", 1.6);
    X.add(
      g,
      new T.BoxGeometry(X.d("width", 0.16), h, X.d("depth", 0.16)),
      p.color || 0xc3c9d1,
      1,
      0.1,
    ).position.y = h / 2;
    return g;
  },
  wall(T, p, X) {
    const w = X.d("width", 5),
      h = X.d("height", 1.6),
      g = new T.Group();
    X.add(g, new T.BoxGeometry(w, h, 0.1), p.color || 0xb7bec8, 1, 0.1);
    const cols = Math.max(2, Math.round(w / 0.9)),
      rows = Math.max(1, Math.round(h / 0.7)),
      m = new T.Matrix4();
    const win = new T.InstancedMesh(
      new T.BoxGeometry(0.5, 0.38, 0.04),
      X.mat(0x5fa0c4, 0.8, 0.2),
      cols * rows,
    );
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        m.makeTranslation(
          -w / 2 + (c + 0.5) * (w / cols),
          -h / 2 + (r + 0.5) * (h / rows),
          0.06,
        );
        win.setMatrixAt(r * cols + c, m);
      }
    g.add(win);
    return g;
  },
  roof(T, p, X) {
    const w = X.d("width", 6),
      h = X.d("height", 1.1),
      dp = X.d("depth", 4.6),
      s = new T.Shape(),
      g = new T.Group();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    const geo = new T.ExtrudeGeometry(s, { depth: dp, bevelEnabled: false });
    geo.translate(0, 0, -dp / 2);
    X.add(g, geo, p.color || 0x9a5a48, 1, 0.1);
    return g;
  },
  stairs(T, p, X) {
    const n = Math.round(X.d("steps", 12)),
      g = new T.Group();
    for (let i = 0; i < n; i++)
      X.add(
        g,
        new T.BoxGeometry(0.9, 0.06, 0.28),
        0xb4bbc5,
        1,
        0.1,
      ).position.set(0, i * 0.14, i * 0.26);
    return g;
  },
  foundation(T, p, X) {
    const w = X.d("width", 6.4),
      dp = X.d("depth", 5),
      g = new T.Group();
    X.add(g, new T.BoxGeometry(w, 0.3, dp), 0x6e7480, 1, 0.05);
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [0, 0],
    ])
      X.add(
        g,
        new T.CylinderGeometry(0.12, 0.12, 1.1, 14),
        0x595f69,
        1,
        0.05,
      ).position.set(x * w * 0.4, -0.7, z * dp * 0.4);
    return g;
  },
  pcb(T, p, X) {
    const w = X.d("width", 3.4),
      d = X.d("depth", 2.4),
      g = new T.Group();
    X.add(g, new T.BoxGeometry(w, 0.06, d), p.color || 0x1d6b4a, 1, 0.2);
    let s = [...String(p.id)].reduce((a, c) => a + c.charCodeAt(0), 7);
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 26; i++) {
      const hz = rnd() > 0.5,
        len = 0.3 + rnd() * 0.9;
      X.add(
        g,
        new T.BoxGeometry(hz ? len : 0.02, 0.004, hz ? 0.02 : len),
        0xd3b45c,
        1,
        0.8,
      ).position.set((rnd() - 0.5) * w * 0.85, 0.034, (rnd() - 0.5) * d * 0.85);
    }
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      X.add(
        g,
        new T.CylinderGeometry(0.05, 0.05, 0.08, 14),
        0xc7a24a,
        1,
        0.8,
      ).position.set(x * (w / 2 - 0.12), 0.01, z * (d / 2 - 0.12));
    return g;
  },
  chip(T, p, X) {
    const w = X.d("width", 0.7),
      g = new T.Group(),
      n = Math.max(6, Math.round(w * 14));
    X.add(g, new T.BoxGeometry(w, 0.1, w), 0x1a1d24, 1, 0.3).position.y = 0.07;
    const pins = new T.InstancedMesh(
      new T.BoxGeometry(0.035, 0.018, 0.09),
      X.mat(0xc9ccd2, 1, 0.9),
      n * 4,
    );
    const m = new T.Matrix4(),
      q = new T.Quaternion(),
      e = new T.Euler(),
      v = new T.Vector3(),
      one = new T.Vector3(1, 1, 1);
    let k = 0;
    for (let side = 0; side < 4; side++)
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) / n - 0.5) * w * 0.9,
          edge = w / 2 + 0.03;
        e.set(0, side < 2 ? 0 : Math.PI / 2, 0);
        q.setFromEuler(e);
        if (side < 2) v.set(t, 0.03, (side ? 1 : -1) * edge);
        else v.set((side === 3 ? 1 : -1) * edge, 0.03, t);
        m.compose(v, q, one);
        pins.setMatrixAt(k++, m);
      }
    g.add(pins);
    return g;
  },
  capacitor(T, p, X) {
    const r = X.d("diameter", 0.22) / 2,
      h = X.d("height", 0.4),
      g = new T.Group();
    X.add(g, new T.CylinderGeometry(r, r, h, 24), 0x2c4f8f, 1, 0.3).position.y =
      h / 2;
    X.add(
      g,
      new T.CylinderGeometry(r * 0.98, r * 0.98, h * 0.05, 24),
      0xc7ccd4,
      1,
      0.8,
    ).position.y = h;
    return g;
  },
  connector(T, p, X) {
    const w = X.d("width", 0.9),
      d = X.d("depth", 0.7),
      g = new T.Group();
    X.add(g, new T.BoxGeometry(w, 0.38, d), 0xc6ccd5, 1, 0.8).position.y = 0.19;
    X.add(
      g,
      new T.BoxGeometry(w * 0.7, 0.2, 0.05),
      0x15181d,
      1,
      0.1,
    ).position.set(0, 0.19, d / 2 + 0.01);
    return g;
  },
  membrane(T, p, X) {
    const r = X.d("diameter", 5) / 2,
      g = new T.Group();
    for (const [k, o] of [
      [1, 0.16],
      [0.93, 0.1],
    ])
      X.add(
        g,
        new T.SphereGeometry(r * k, 48, 32),
        p.color || 0x7fd0b8,
        o,
        0.05,
      ).scale.set(1.3, 1, 1);
    return g;
  },
  nucleus(T, p, X) {
    const r = X.d("diameter", 1.4) / 2,
      g = new T.Group();
    X.add(g, new T.SphereGeometry(r * 1.12, 32, 24), 0xb7a8fa, 0.28, 0.05);
    X.add(g, new T.SphereGeometry(r, 32, 24), p.color || 0x8069dd, 0.95, 0.05);
    X.add(
      g,
      new T.SphereGeometry(r * 0.32, 20, 16),
      0x3d2f86,
      1,
      0.05,
    ).position.set(r * 0.2, 0.1, r * 0.3);
    return g;
  },
  mito(T, p, X) {
    const r = X.d("diameter", 0.5) / 2,
      l = X.d("length", 1.3),
      g = new T.Group();
    X.add(
      g,
      new T.CapsuleGeometry(r, l, 8, 20),
      p.color || 0xf09a45,
      0.55,
      0.05,
    ).rotation.z = Math.PI / 2;
    for (let i = 0; i < 6; i++)
      X.add(
        g,
        new T.BoxGeometry(0.03, r * 1.3, r * (i % 2 ? 1.1 : 0.7)),
        0xffd09a,
        1,
        0.05,
      ).position.set((i - 2.5) * l * 0.17, (i % 2 ? 1 : -1) * r * 0.1, 0);
    return g;
  },
  golgi(T, p, X) {
    const g = new T.Group();
    for (let i = 0; i < 6; i++) {
      const s = X.add(
        g,
        new T.SphereGeometry(1, 28, 12),
        p.color || 0xe6b34e,
        0.95,
        0.05,
      );
      s.scale.set(0.9 - i * 0.04, 0.07, 0.5);
      s.position.y = i * 0.2;
      s.rotation.z = i * 0.05;
    }
    return g;
  },
  tank(T, p, X) {
    const r = X.d("diameter", 1.6) / 2,
      h = X.d("height", 2.6),
      g = new T.Group(),
      c = p.color || 0xaab6c4;
    X.add(g, new T.CylinderGeometry(r, r, h, X.seg), c, 1, 0.65);
    for (const s of [-1, 1]) {
      const cap = X.add(
        g,
        new T.SphereGeometry(
          r,
          X.seg,
          14,
          0,
          Math.PI * 2,
          s > 0 ? 0 : Math.PI / 2,
          Math.PI / 2,
        ),
        c,
        1,
        0.65,
      );
      cap.position.y = (s * h) / 2;
      cap.scale.y = 0.45;
    }
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      X.add(
        g,
        new T.CylinderGeometry(0.05, 0.05, h * 0.3, 8),
        0x6f7b8b,
        1,
        0.5,
      ).position.set(x * r * 0.7, -h * 0.65, z * r * 0.7);
    return g;
  },
  pipe(T, p, X) {
    const r = X.d("diameter", 0.16) / 2,
      l = X.d("length", 3),
      g = new T.Group();
    X.add(
      g,
      new T.CylinderGeometry(r, r, l, 20),
      p.color || 0x8fa0b4,
      1,
      0.7,
    ).rotation.z = Math.PI / 2;
    for (const x of [-0.5, 0, 0.5]) {
      const f = X.add(
        g,
        new T.CylinderGeometry(r * 1.45, r * 1.45, r * 0.35, 20),
        0x6e7d90,
        1,
        0.7,
      );
      f.rotation.z = Math.PI / 2;
      f.position.x = x * l * 0.96;
    }
    return g;
  },
  valve(T, p, X) {
    const r = X.d("diameter", 0.34) / 2,
      g = new T.Group();
    X.add(g, new T.SphereGeometry(r * 1.5, 24, 16), 0xb45a4d, 1, 0.5);
    X.add(
      g,
      new T.CylinderGeometry(r * 0.7, r * 0.7, r * 5, 16),
      0x8fa0b4,
      1,
      0.7,
    ).rotation.z = Math.PI / 2;
    X.add(
      g,
      new T.CylinderGeometry(r * 0.12, r * 0.12, r * 2.2, 10),
      0xc0c8d4,
      1,
      0.8,
    ).position.y = r * 2;
    const w = X.add(
      g,
      new T.TorusGeometry(r * 0.9, r * 0.1, 8, 24),
      0xd9534f,
      1,
      0.3,
    );
    w.rotation.x = Math.PI / 2;
    w.position.y = r * 3.1;
    return g;
  },
};

/* ── motifs ── */
function expandPattern(T, obj, pat, unit) {
  const g = new T.Group(),
    n = Math.min(600, Math.max(1, pat.count || 1)),
    st = (pat.step || [1, 0, 0]).map((v) => v * unit);
  const nx = pat.countX || Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const c = i ? obj.clone(true) : obj;
    if (pat.type === "grid")
      c.position.set(
        (i % nx) * pat.stepX * unit,
        0,
        Math.floor(i / nx) * pat.stepZ * unit,
      );
    else if (pat.type === "radial") {
      const a = (i / n) * Math.PI * 2;
      c.position.set(
        Math.cos(a) * pat.radius * unit,
        0,
        Math.sin(a) * pat.radius * unit,
      );
      c.rotation.y = -a;
    } else c.position.set(st[0] * i, st[1] * i, st[2] * i);
    g.add(c);
  }
  return g;
}

/* ── placement automatique (profondeur par relations, colonnes) ── */
function autoLayout(list, rels) {
  const idx = new Map(list.map((e, i) => [e.part.id, i])),
    depth = new Array(list.length).fill(0);
  for (let it = 0; it < list.length; it++) {
    let ch = false;
    rels.forEach((r) => {
      const a = idx.get(r.from),
        b = idx.get(r.to);
      if (
        a != null &&
        b != null &&
        a !== b &&
        depth[b] < depth[a] + 1 &&
        depth[a] < list.length
      ) {
        depth[b] = depth[a] + 1;
        ch = true;
      }
    });
    if (!ch) break;
  }
  const cols = new Map();
  list.forEach((e, i) => {
    if (!cols.has(depth[i])) cols.set(depth[i], []);
    cols.get(depth[i]).push(e);
  });
  let x = 0;
  const gap = 0.9;
  [...cols.keys()]
    .sort((a, b) => a - b)
    .forEach((d) => {
      const col = cols.get(d),
        w = Math.max(...col.map((e) => e.size.x));
      let z = -(col.reduce((s, e) => s + e.size.z + gap, 0) - gap) / 2;
      col.forEach((e) => {
        e.pos = [
          x + w / 2 - e.off.x,
          e.size.y / 2 - e.off.y,
          z + e.size.z / 2 - e.off.z,
        ];
        z += e.size.z + gap;
      });
      x += w + gap * 1.4;
    });
  const cx = (x - gap * 1.4) / 2;
  list.forEach((e) => (e.pos[0] -= cx));
}

export function planAssembly(
  T,
  objects,
  a,
  { material, meshFor, model, subject },
) {
  const recipeId = findRecipe(
    [subject, a.subject, a.title, a.summary, a.domain]
      .filter(Boolean)
      .join(" "),
  );
  if (recipeId) {
    const out = buildRecipe(T, recipeId, material, {
      ...a,
      subject: subject || a.subject,
    });
    if (out.parts) return planRecipe(T, out, model, objects);
    objects = out.objects.map((o) => ({
      kind: "",
      primitive: "box",
      scale: [1, 1, 1],
      position: { x: 0, y: 0, z: 0 },
      positionProvided: false,
      ...o,
    }));
  }
  const items = objects.map((part, index) => ({
    part,
    index,
    ...classify(part),
  }));
  const aircraft = items.some(
    (i) => i.role === "fuselage" || i.role === "wing",
  );
  const dimNum = (p, k) => {
    const raw = p.dimensions?.[k],
      v =
        typeof raw === "number"
          ? raw
          : parseFloat(String(raw ?? "").replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const maxDim = Math.max(
    0,
    ...objects.flatMap((p) => [...LEN].map((k) => dimNum(p, k))),
  );
  const authored = objects.some((p) => p.shape || p.lib);
  const unit = authored
    ? 1
    : Math.min(1000, Math.max(0.001, maxDim > 0 ? 9 / maxDim : 1));
  const fus = items.find((i) => i.role === "fuselage");
  const ctx = {
    aircraft,
    L:
      aircraft && fus && dimNum(fus.part, "length")
        ? dimNum(fus.part, "length") * unit
        : 9,
  };
  const seg =
    a.detailLevel === "overview" ? 20 : a.detailLevel === "detailed" ? 56 : 36;
  const makeX = (part, side) => ({
    part,
    side,
    ctx,
    seg,
    u: unit,
    mat: (color, op = 1, met = 0.35) => material(color, op, met),

    matp: (spec) => {
      const m = new T.MeshStandardMaterial({
        color: spec.color,
        metalness: spec.metalness,
        roughness: spec.roughness,
        opacity: spec.opacity,
        transparent: spec.opacity < 1,
        emissive: spec.emissive ? spec.color : 0x000000,
      });
      return m;
    },
    d: (k, def) => {
      const raw = part.params?.[k] ?? part.dimensions?.[k],
        v =
          typeof raw === "number"
            ? raw
            : parseFloat(String(raw ?? "").replace(",", "."));
      return Number.isFinite(v) && v > 0 ? (LEN.has(k) ? v * unit : v) : def;
    },
    add: (g, geo, color, op = 1, met = 0.35) => {
      const m = new T.Mesh(geo, material(color, op, met));
      g.add(m);
      return m;
    },
  });

  const order = { fuselage: 0, wing: 1 },
    built = new Map();
  [...items]
    .sort(
      (x, y) =>
        (order[x.role] ?? 3) - (order[y.role] ?? 3) || x.index - y.index,
    )
    .forEach((it) => {
      const { part, role, side } = it;
      const X = makeX(part, side);
      let object = null,
        fromRole = false;
      if (part.shape)
        object = buildShape(T, part.shape, X, 0, { n: 0 }, part.material);
      else if (part.lib && LIB[part.lib])
        object = buildShape(
          T,
          LIB[part.lib](part.params || {}),
          X,
          0,
          { n: 0 },
          part.material,
        );
      else if (role && BUILD[role]) {
        object = BUILD[role](T, part, X);
        fromRole = true;
      }
      if (object && fromRole && !part.dimensions) {
        const s = (part.scale || [1, 1, 1]).map((v) =>
          Math.min(3, Math.max(0.3, nn(v, 1))),
        );
        object.scale.set(...s);
      }
      if (!object || !object.children.length)
        object = fallbackVolume(T, part, X);
      if (part.pattern) object = expandPattern(T, object, part.pattern, unit);
      if (part.rotation)
        object.rotation.set(...part.rotation.map((d) => (d * Math.PI) / 180));
      object.userData.visualPart = part.id;
      object.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      object.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(object);
      built.set(part.id, {
        ...it,
        object,
        size: box.getSize(new T.Vector3()),
        off: box.getCenter(new T.Vector3()),
      });
    });

  /* ancres anatomiques (avion) */
  const anchor = (e) => {
    const { role, part } = e,
      L = ctx.L,
      R = L * 0.053,
      w = ctx.wing,
      s = e.side || 1;
    switch (role) {
      case "fuselage":
        return [0, 0, 0];
      case "wing":
        return [L * 0.06, -R * 0.55, 0];
      case "hstab":
        return [-L * 0.43, R * 0.55, 0];
      case "fin":
        return [-L * 0.4, R * 0.8, 0];
      case "cockpit":
        return [L * 0.37, R * 0.3, 0];
      case "engine":
        return [
          L * 0.07 - (w ? w.sweep * 0.36 : 0),
          -R * 0.55 + (w ? w.dih * 0.36 : 0) - R * 0.75,
          s * (w ? w.half * 0.36 : R * 3),
        ];
      case "gear":
        return /nose|avant|front/.test(strip(`${part.label} ${part.id}`))
          ? [L * 0.36, -R * 0.85, 0]
          : [L * 0.04, -R * 0.85, s * R * 0.7];
      case "flap": {
        const sm = 0.45,
          c = w ? w.rc + (w.tc - w.rc) * sm : L * 0.1;
        return w
          ? [
              L * 0.06 - w.sweep * sm - c * 0.92,
              -R * 0.55 + w.dih * sm,
              s * w.half * sm,
            ]
          : [-L * 0.1, -R * 0.5, s * L * 0.3];
      }
      default:
        return [0, 0, 0];
    }
  };
  const provided = items.filter((i) => i.part.positionProvided);
  const spread = Math.max(
    0,
    ...provided.flatMap((i) =>
      [i.part.position.x, i.part.position.y, i.part.position.z].map(Math.abs),
    ),
  );
  const usable =
    provided.length >= Math.max(2, items.length * 0.6) && spread > 0.5;
  const hasLoop = (e) => {
    let cur = e,
      n = 0;
    while (cur?.part.parent && n++ < 20) {
      if (cur.part.parent === e.part.id) return true;
      cur = built.get(cur.part.parent);
    }
    return n >= 20;
  };
  const free = [];
  built.forEach((e) => {
    const { part, role } = e,
      P = part.position;
    if (
      part.parent &&
      part.parent !== part.id &&
      built.has(part.parent) &&
      !hasLoop(e)
    ) {
      e.parentEntry = built.get(part.parent);
      e.local = part.positionProvided ? [P.x, P.y, P.z] : [0, 0, 0];
      return;
    }
    if (aircraft && ANCHORED.has(role) && part.placement !== "manual") {
      e.pos = anchor(e);
      e.pair =
        e.side === 0 &&
        (role === "engine" ||
          role === "flap" ||
          (role === "gear" &&
            !/nose|avant|front/.test(strip(`${part.label} ${part.id}`))));
      return;
    }
    if (part.positionProvided && usable) {
      e.pos = [P.x, P.y, P.z];
      return;
    }
    free.push(e);
  });
  if (free.length) {
    autoLayout(free, a.relationships || []);
    if (aircraft) {
      const zOff = (ctx.wing?.half || ctx.L * 0.5) + 2.5;
      free.forEach((e) => (e.pos[2] += zOff));
    }
  }

  /* montage */
  const twin = (e, axis) => {
    const c = e.object.clone(true);
    c.position.copy(e.object.position);
    c.position[axis] *= -1;
    c.scale[axis] *= -1;
    model.add(c);
    e.twin = c;
    e.twinHome = c.position.clone();
  };
  built.forEach((e) => {
    if (e.parentEntry) return;
    e.object.position.set(...e.pos);
    model.add(e.object);
    if (e.pair) twin(e, "z");
    else if (e.part.mirror) twin(e, e.part.mirror);
  });
  built.forEach((e) => {
    if (!e.parentEntry) return;
    e.object.position.set(...e.local);
    e.parentEntry.object.add(e.object);
  });
  model.updateMatrixWorld(true);
  if (!aircraft)
    snapFloating(
      T,
      [...built.values()].filter((e) => !e.parentEntry),
    );
  model.updateMatrixWorld(true);

  const entries = [],
    all = new T.Box3();
  [...built.values()]
    .sort((x, y) => x.index - y.index)
    .forEach((e) => {
      const box = new T.Box3().setFromObject(e.object),
        c = box.getCenter(new T.Vector3());
      all.union(box);
      entries.push({
        part: e.part,
        object: e.object,
        entry: e,
        anchor: new T.Vector3(c.x, box.max.y, c.z),
        center: c,
      });
    });
  const ctr = all.getCenter(new T.Vector3()),
    reach = all.getSize(new T.Vector3()).length();
  const tops = entries.filter((en) => en.object.parent === model);
  tops.forEach((en) => {
    en.home = en.object.position.clone();
    const d = en.center.clone().sub(ctr);
    if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
    en.off = d.normalize().multiplyScalar(reach * 0.32);
  });
  const explode = (on) =>
    tops.forEach((en) => {
      en.object.position.copy(on ? en.home.clone().add(en.off) : en.home);
      const t = en.entry.twin;
      if (t)
        t.position.copy(
          on
            ? en.entry.twinHome.clone().add(en.off.clone().setZ(-en.off.z))
            : en.entry.twinHome,
        );
    });
  return {
    entries,
    explode,
    unit,
    recipe: recipeId || null,
    recipeLabel: recipeId ? "Avion de ligne" : null,
    groups: [],
    notes: [],
  };
}

function planRecipe(T, out, model, aiObjects) {
  out.env.forEach((g) => model.add(g));
  const all = new T.Box3();
  out.parts.forEach((p) => {
    p.object.userData.visualPart = p.id;
    p.object.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    model.add(p.object);
  });
  model.updateMatrixWorld(true);
  const labelOf = Object.fromEntries(
    (out.groups || []).map((g) => [g.id, g.label]),
  );
  const entries = out.parts.map((p) => {
    const box = new T.Box3().setFromObject(p.object),
      c = box.getCenter(new T.Vector3());
    all.union(box);
    return {
      part: {
        id: p.id,
        label: p.label,
        detail: p.detail,
        kind: labelOf[p.group] || p.group,
        major: p.major,
        position: { x: 0, y: 0, z: 0 },
      },
      object: p.object,
      anchor: new T.Vector3(c.x, box.max.y, c.z),
      center: c,
      group: p.group,
    };
  });
  const ctr = all.getCenter(new T.Vector3()),
    reach = all.getSize(new T.Vector3()).length(),
    keep = new Set(out.keep || []);
  entries.forEach((en) => {
    en.home = en.object.position.clone();
    const d = en.center.clone().sub(ctr);
    if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
    en.off = keep.has(en.group)
      ? new T.Vector3()
      : d.normalize().multiplyScalar(reach * 0.28);
  });
  const explode = (on) =>
    entries.forEach((en) =>
      en.object.position.copy(on ? en.home.clone().add(en.off) : en.home),
    );
  return {
    entries,
    explode,
    bounds: all,
    unit: 1,
    recipe: out.id,
    recipeLabel: out.label,
    camera: out.camera,
    groups: out.groups || [],
    notes: out.notes || [],
    unmatched: (aiObjects || [])
      .map((o) => o.label)
      .filter(Boolean)
      .slice(0, 12),
  };
}
