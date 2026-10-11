/* AiGENT — Scene Recipes v1 : scènes techniques complètes, 100 % déterministes (aucune IA pour la géométrie). */
const strip = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const MATCH = [
  [
    "aircraft",
    /avion|aeronef|aerien|fuselage|airliner|aircraft|airplane|aerosphere/,
  ],
  ["metro", /metro\b|subway|station souterraine|rame de metro/],
  [
    "hydro",
    /hydroelectr|barrage|turbine francis|centrale hydraulique|conduite forcee/,
  ],
  [
    "datacenter",
    /data ?cent|centre de donnees|salle serveur|baie serveur|allee (froide|chaude)/,
  ],
  [
    "ocean",
    /ocean|offshore|bouee|hydrophone|sous-marin|mouillage|plateforme en mer/,
  ],
  [
    "pcb",
    /carte electronique|\bpcb\b|arduino|raspberry|microcontr|circuit imprime|systeme electronique|carte mere/,
  ],
  ["cell", /cellule (animale|eucaryote|vegetale)|mitochond|organite/],
  [
    "building",
    /batiment|immeuble|maison|residence|gratte-ciel|tour de bureaux|villa|hopital/,
  ],
];
export const findRecipe = (text) =>
  MATCH.find(([, re]) => re.test(strip(text)))?.[0] || null;
export const RECIPE_LABEL = {
  aircraft: "Avion de ligne",
  metro: "Station de métro (coupe)",
  hydro: "Centrale hydroélectrique",
  datacenter: "Salle serveurs",
  ocean: "Station océanographique autonome",
  pcb: "Carte électronique",
  cell: "Cellule eucaryote",
  building: "Bâtiment",
};

function kit(T, mat) {
  const V = (p) => new T.Vector3(...p);
  const mesh = (g, geo, c, p = [0, 0, 0], o = 1, mt = 0.3, rot) => {
    const m = new T.Mesh(geo, mat(c, o, mt));
    m.position.set(...p);
    if (rot) m.rotation.set(...rot);
    g.add(m);
    return m;
  };
  return {
    mat,
    mesh,
    basic: (g, geo, c, p = [0, 0, 0], rot) => {
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: c }));
      m.position.set(...p);
      if (rot) m.rotation.set(...rot);
      g.add(m);
      return m;
    },
    box: (g, d, c, p, o, mt, rot) =>
      mesh(g, new T.BoxGeometry(...d), c, p, o, mt, rot),
    cyl: (g, d, c, p, o, mt, rot, seg = 28) =>
      mesh(g, new T.CylinderGeometry(d[0], d[1], d[2], seg), c, p, o, mt, rot),
    sph: (g, r, c, p, o, mt, sc) => {
      const m = mesh(g, new T.SphereGeometry(r, 28, 18), c, p, o, mt);
      if (sc) m.scale.set(...sc);
      return m;
    },
    tor: (g, d, c, p, o, mt, rot) =>
      mesh(g, new T.TorusGeometry(d[0], d[1], 12, 44), c, p, o, mt, rot),
    flat: (g, [w, d], c, p, o = 1, mt = 0.05) => {
      const geo = new T.PlaneGeometry(w, d);
      geo.rotateX(-Math.PI / 2);
      return mesh(g, geo, c, p, o, mt);
    },
    tube: (g, pts, r, c, o, mt) =>
      mesh(
        g,
        new T.TubeGeometry(
          new T.CatmullRomCurve3(pts.map(V)),
          Math.max(24, pts.length * 14),
          r,
          8,
          false,
        ),
        c,
        [0, 0, 0],
        o,
        mt,
      ),
    beam: (g, a, b, w, c, o, mt, wz) => {
      const A = V(a),
        B = V(b),
        d = B.clone().sub(A),
        L = d.length(),
        m = mesh(g, new T.BoxGeometry(L, w, wz ?? w), c, [0, 0, 0], o, mt);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), d.normalize());
      return m;
    },
    rod: (g, a, b, r, c, o, mt) => {
      const A = V(a),
        B = V(b),
        d = B.clone().sub(A),
        L = d.length(),
        m = mesh(g, new T.CylinderGeometry(r, r, L, 10), c, [0, 0, 0], o, mt);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
      return m;
    },
    inst: (g, geo, c, list, o = 1, mt = 0.3, basic = false) => {
      const im = new T.InstancedMesh(
          geo,
          basic ? new T.MeshBasicMaterial({ color: c }) : mat(c, o, mt),
          list.length,
        ),
        m = new T.Matrix4(),
        q = new T.Quaternion(),
        e = new T.Euler(),
        v = new T.Vector3(),
        s = new T.Vector3();
      list.forEach(([x, y, z, ry = 0, sx = 1, sy = 1, sz = 1], i) => {
        e.set(0, ry, 0);
        q.setFromEuler(e);
        v.set(x, y, z);
        s.set(sx, sy, sz);
        m.compose(v, q, s);
        im.setMatrixAt(i, m);
      });
      g.add(im);
      return im;
    },
    terrain: (w, d, seg, h, c, o = 1) => {
      const geo = new T.PlaneGeometry(w, d, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, h(p.getX(i), p.getZ(i)));
      geo.computeVertexNormals();
      return new T.Mesh(geo, mat(c, o, 0.05));
    },
  };
}
function sceneKit(T) {
  const S = { parts: [], env: [] };
  S.part = (id, label, detail, group, major, fn) => {
    const g = new T.Group();
    fn(g);
    S.parts.push({ id, label, detail, group, major: !!major, object: g });
  };
  S.environment = (fn) => {
    const g = new T.Group();
    g.userData.env = true;
    fn(g);
    S.env.push(g);
  };
  return S;
}

/* ───────────── STATION OCÉANOGRAPHIQUE AUTONOME (plateforme semi-submersible) ───────────── */
function ocean(T, K, S) {
  const { box, cyl, sph, tor, tube, beam, rod, inst, basic, flat } = K,
    OR = 0xd9622b,
    WH = 0xe9edf1,
    ST = 0x6c7a8d,
    YL = 0xf2c230,
    DK = 0x2c3e55;
  S.environment((g) => {
    const water = new T.Mesh(
      new T.BoxGeometry(50, 25, 50),
      K.mat(0x2a78b0, 0.13, 0),
    );
    water.position.y = -12.5;
    water.material.depthWrite = false;
    g.add(water);
    g.add(
      K.terrain(
        50,
        50,
        56,
        (x, z) =>
          0.16 * Math.sin(x * 0.55) * Math.cos(z * 0.5) +
          0.1 * Math.sin(z * 1.3 + x * 0.4),
        0x4aa3d6,
        0.5,
      ),
    );
    const bed = K.terrain(
      50,
      50,
      50,
      (x, z) =>
        -24 +
        0.9 * Math.sin(x * 0.3) * Math.cos(z * 0.25) +
        0.5 * Math.sin(x * 0.9 + z * 0.7),
      0xb59d72,
    );
    g.add(bed);
    const rocks = [];
    for (let i = 0; i < 16; i++)
      rocks.push([
        Math.sin(i * 12.9) * 21,
        -23.7,
        Math.cos(i * 7.3) * 21,
        i,
        0.5 + (i % 4) * 0.35,
        0.4 + (i % 3) * 0.2,
        0.6 + (i % 5) * 0.2,
      ]);
    inst(g, new T.SphereGeometry(1, 10, 8), 0x7e7766, rocks);
    rod(g, [24, 0, -24], [24, -24, -24], 0.06, 0xffffff);
    for (let k = 0; k <= 6; k++)
      box(g, [0.8, 0.05, 0.05], 0xffffff, [24, -k * 4, -24]);
  });
  S.part(
    "pontoons",
    "Pontons immergés",
    "Deux flotteurs cylindriques : flottabilité et stabilité de la station",
    "structure",
    true,
    (g) => {
      for (const z of [-5, 5]) {
        cyl(g, [1.3, 1.3, 17], OR, [0, -3.4, z], 1, 0.4, [0, 0, Math.PI / 2]);
        for (const x of [-8.5, 8.5]) sph(g, 1.3, OR, [x, -3.4, z], 1, 0.4);
      }
      rod(g, [-5.5, -3.4, -5], [-5.5, -3.4, 5], 0.28, ST);
      rod(g, [5.5, -3.4, -5], [5.5, -3.4, 5], 0.28, ST);
    },
  );
  S.part(
    "columns",
    "Colonnes de stabilité",
    "Quatre colonnes reliant pontons et pont (ligne de flottaison orange)",
    "structure",
    false,
    (g) => {
      for (const x of [-5.5, 5.5])
        for (const z of [-5, 5]) {
          cyl(g, [1.1, 1.1, 7.2], WH, [x, 0.2, z]);
          cyl(g, [1.14, 1.14, 0.7], OR, [x, -0.4, z]);
        }
    },
  );
  S.part(
    "deck",
    "Pont principal",
    "Plateforme à 4,4 m au-dessus de la mer, garde-corps périphériques",
    "structure",
    true,
    (g) => {
      box(g, [17.5, 1.2, 14.6], ST, [0, 4.4, 0], 1, 0.5);
      box(g, [17.5, 0.12, 14.6], 0x93a1b3, [0, 5.02, 0], 1, 0.4);
      const posts = [];
      for (let i = 0; i <= 11; i++) {
        const x = -8.2 + i * 1.49;
        posts.push([x, 5.6, -7.2], [x, 5.6, 7.2]);
      }
      for (let i = 1; i < 9; i++) {
        const z = -7.2 + i * 1.8;
        posts.push([-8.7, 5.6, z], [8.7, 5.6, z]);
      }
      inst(g, new T.BoxGeometry(0.08, 1.1, 0.08), YL, posts);
      for (const [a, b] of [
        [
          [-8.7, 6.1, -7.2],
          [8.7, 6.1, -7.2],
        ],
        [
          [-8.7, 6.1, 7.2],
          [8.7, 6.1, 7.2],
        ],
        [
          [-8.7, 6.1, -7.2],
          [-8.7, 6.1, 7.2],
        ],
        [
          [8.7, 6.1, -7.2],
          [8.7, 6.1, 7.2],
        ],
      ])
        rod(g, a, b, 0.04, YL);
    },
  );
  S.part(
    "hab",
    "Module d'habitation (HAB)",
    "Cabines et espaces de vie : hublots, porte d'accès, climatisation en toiture",
    "living",
    true,
    (g) => {
      box(g, [6.2, 3, 4], 0xe8e2d4, [-4.4, 6.58, -3.6], 1, 0.1);
      const w = [];
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < 6; i++)
          w.push(
            [-6.9 + i * 0.95, 6.1 + r * 1.05, -1.55],
            [-6.9 + i * 0.95, 6.1 + r * 1.05, -5.65],
          );
      inst(g, new T.BoxGeometry(0.6, 0.55, 0.1), DK, w, 1, 0.2);
      box(g, [1, 2.1, 0.1], 0x7a8794, [-1.7, 6.2, -1.52]);
      box(g, [6.4, 0.18, 4.2], 0xcfd6de, [-4.4, 8.2, -3.6]);
      box(g, [1.1, 0.6, 0.9], 0x9aa5b1, [-3, 8.6, -3.4]);
    },
  );
  S.part(
    "lab",
    "Laboratoire (LAB)",
    "Paillasses, analyse d'échantillons ; baie vitrée continue et extraction en toiture",
    "living",
    true,
    (g) => {
      box(g, [5.4, 2.6, 4], 0xcfd8e2, [2.4, 6.38, -3.6], 1, 0.1);
      box(g, [4.6, 0.7, 0.08], DK, [2.4, 6.6, -1.58], 1, 0.2);
      box(g, [4.6, 0.7, 0.08], DK, [2.4, 6.6, -5.62], 1, 0.2);
      box(g, [5.4, 0.18, 0.1], 0x2f9d93, [2.4, 5.5, -1.56]);
      for (const x of [1, 2.4, 3.8])
        cyl(g, [0.22, 0.22, 0.8], 0x9aa5b1, [x, 8.1, -3.6]);
    },
  );
  S.part(
    "energy",
    "Unité énergétique (ENE)",
    "Conteneur groupe électrogène de secours et batteries ; cheminée d'échappement",
    "power",
    true,
    (g) => {
      box(g, [4.4, 2.4, 3.2], 0xe2a22c, [-5.2, 6.28, 3.9], 1, 0.2);
      const ribs = [];
      for (let i = 0; i < 14; i++) ribs.push([-7.2 + i * 0.3, 6.28, 5.52]);
      inst(g, new T.BoxGeometry(0.06, 2.2, 0.06), 0xb3801d, ribs);
      cyl(g, [0.2, 0.2, 2], 0x30343b, [-6.6, 8.6, 4.6]);
    },
  );
  S.part(
    "solar",
    "Champ solaire",
    "Quatre panneaux photovoltaïques inclinés sur supports",
    "power",
    false,
    (g) => {
      for (const x of [3.4, 5.9])
        for (const z of [3.2, 5.4]) {
          box(g, [2.2, 0.08, 1.4], 0x1b3a6b, [x, 5.9, z], 1, 0.6, [-0.4, 0, 0]);
          box(
            g,
            [2.0, 0.09, 0.03],
            0x6f8fc0,
            [x, 5.9, z],
            1,
            0.6,
            [-0.4, 0, 0],
          );
          rod(g, [x, 5.1, z + 0.4], [x, 5.8, z + 0.2], 0.05, ST);
        }
    },
  );
  S.part(
    "wind",
    "Éolienne d'appoint",
    "Mât, nacelle et rotor tripale",
    "power",
    false,
    (g) => {
      cyl(g, [0.16, 0.26, 6], WH, [8.1, 8.1, 6.3]);
      box(g, [0.5, 0.5, 0.9], WH, [8.1, 11.2, 6.3]);
      sph(g, 0.22, ST, [8.1, 11.2, 6.85]);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.094 + 0.4;
        box(
          g,
          [0.14, 2.6, 0.05],
          WH,
          [8.1 - Math.sin(a) * 1.4, 11.2 + Math.cos(a) * 1.4, 6.9],
          1,
          0.2,
          [0, 0, a],
        );
      }
    },
  );
  S.part(
    "comms",
    "Mât de communication (COM)",
    "Mât treillis, parabole satellite, antennes fouet et balise de signalisation",
    "comms",
    true,
    (g) => {
      const base = [7.2, 5.1, -5.4],
        leg = (k, r, h) => [
          base[0] + Math.cos(k * 2.094) * r,
          base[1] + h,
          base[2] + Math.sin(k * 2.094) * r,
        ];
      for (let k = 0; k < 3; k++)
        rod(g, leg(k, 0.45, 0), leg(k, 0.06, 11), 0.05, ST);
      for (let h = 0.8; h < 10.5; h += 1.6) {
        const r = 0.45 - ((0.45 - 0.06) * h) / 11;
        for (let k = 0; k < 3; k++)
          rod(g, leg(k, r, h), leg((k + 1) % 3, r, h), 0.03, ST);
      }
      sph(g, 0.1, 0xff4d4d, [7.2, 16.3, -5.4]);
      const dish = K.mesh(
        g,
        new T.SphereGeometry(0.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        WH,
        [7.2, 13, -4.9],
        1,
        0.3,
        [Math.PI / 2, 0, 0],
      );
      rod(g, [7.2, 13, -5.3], [7.2, 13, -4.3], 0.03, ST);
      rod(g, [7.2, 15, -5.4], [7.2, 17.4, -5.4], 0.03, ST);
      void dish;
    },
  );
  S.part(
    "crane",
    "Grue de service",
    "Mât pivotant, flèche en treillis et ligne de levage pour les opérations de mise à l'eau",
    "ops",
    false,
    (g) => {
      cyl(g, [0.55, 0.7, 1.2], YL, [-7.6, 5.7, -6.2]);
      box(g, [1.2, 1, 1.2], YL, [-7.6, 6.8, -6.2]);
      const tip = [-13.2, 10.6, -6.2];
      rod(g, [-7.6, 7.2, -6.2], tip, 0.12, YL);
      rod(g, [-7.6, 6.6, -6.2], tip, 0.07, YL);
      rod(g, [-7.6, 7.2, -6.2], [-7.6, 6.6, -6.2], 0.07, YL);
      rod(g, tip, [-13.2, 4, -6.2], 0.03, 0x222222);
      sph(g, 0.18, 0x222222, [-13.2, 3.9, -6.2]);
      box(g, [1.2, 0.5, 0.9], ST, [-6.4, 6.4, -6.2]);
    },
  );
  S.part(
    "helideck",
    "Hélistation",
    "Plateforme en porte-à-faux, cercle d'approche et marquage « H »",
    "ops",
    false,
    (g) => {
      cyl(g, [3.3, 3.3, 0.25], 0x3d4a5a, [11.6, 5.0, 0]);
      for (const z of [-2.2, 2.2])
        beam(g, [8.7, 3.9, z], [11, 4.8, z * 0.9], 0.3, ST);
      tor(g, [2.6, 0.07], WH, [11.6, 5.15, 0], 1, 0.2, [Math.PI / 2, 0, 0]);
      box(g, [0.25, 0.02, 1.6], WH, [11.1, 5.16, 0]);
      box(g, [0.25, 0.02, 1.6], WH, [12.1, 5.16, 0]);
      box(g, [1.1, 0.02, 0.25], WH, [11.6, 5.16, 0]);
    },
  );
  S.part(
    "rov_bay",
    "Hangar ROV",
    "Hangar du véhicule sous-marin téléopéré, porte coulissante",
    "ops",
    true,
    (g) => {
      box(g, [3.4, 2.6, 3], 0x2e7d6b, [-0.5, 6.38, 4.2], 1, 0.2);
      box(g, [2.4, 1.9, 0.08], 0x1f5a4c, [-0.5, 6.1, 2.68]);
      box(g, [3.5, 0.15, 3.1], 0xcfd6de, [-0.5, 7.75, 4.2]);
    },
  );
  S.part(
    "rov",
    "ROV (robot sous-marin)",
    "Véhicule téléopéré : cadre, flotteur, propulseurs, bras manipulateur, caméra, ombilical",
    "ops",
    true,
    (g) => {
      box(g, [1.6, 0.7, 1.1], YL, [-0.5, -6.8, 8.2], 1, 0.3);
      box(g, [1.5, 0.35, 1], WH, [-0.5, -6.3, 8.2]);
      for (const [x, z] of [
        [-1.25, -0.45],
        [-1.25, 0.45],
        [0.25, -0.45],
        [0.25, 0.45],
      ])
        cyl(g, [0.14, 0.14, 0.5], 0x30343b, [x, -6.8, 8.2 + z * 1.4], 1, 0.4, [
          0,
          0,
          Math.PI / 2,
        ]);
      rod(g, [-1.3, -7.0, 8.2], [-1.9, -7.4, 8.2], 0.05, 0xd9622b);
      rod(g, [-1.9, -7.4, 8.2], [-2.2, -7.1, 8.2], 0.04, 0xd9622b);
      sph(g, 0.16, 0x16202c, [0.4, -6.7, 8.2]);
      tube(
        g,
        [
          [-0.5, 6.2, 5.7],
          [-0.5, 5.6, 7.5],
          [-0.5, 2, 8.2],
          [-0.5, -6.2, 8.2],
        ],
        0.05,
        0xffb020,
      );
    },
  );
  S.part(
    "sensors",
    "Chaîne d'instruments",
    "Câble instrumenté : sonde CTD, ADCP à 4 transducteurs, piège à sédiments, hydrophones",
    "instrumentation",
    true,
    (g) => {
      rod(g, [0, 3.8, 0], [0, -15.5, 0], 0.07, 0x444a52);
      cyl(g, [0.22, 0.22, 0.9], 0x2a78b0, [0, -6, 0], 1, 0.4);
      cyl(g, [0.45, 0.35, 0.6], 0x3d4a5a, [0, -9, 0], 1, 0.4);
      for (let k = 0; k < 4; k++) {
        const a = k * 1.571;
        K.mesh(
          g,
          new T.ConeGeometry(0.1, 0.25, 12),
          0xd9622b,
          [Math.cos(a) * 0.36, -9.4, Math.sin(a) * 0.36],
          1,
          0.3,
          [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4],
        );
      }
      K.mesh(
        g,
        new T.ConeGeometry(0.4, 0.7, 16, 1, true),
        0xcfd6de,
        [0, -12, 0],
      );
      for (const y of [-13.2, -14.1, -15]) sph(g, 0.16, 0x2f9d93, [0, y, 0]);
      const f = [
        [-1, -0.8, -1],
        [1, -0.8, -1],
        [1, -0.8, 1],
        [-1, -0.8, 1],
      ];
      f.forEach((p, i) => {
        const q = f[(i + 1) % 4];
        rod(
          g,
          [p[0], -9 + p[1], p[2]],
          [q[0], -9 + q[1], q[2]],
          0.04,
          0x8a96a6,
        );
        rod(g, [p[0], -9 + 0.8, p[2]], [q[0], -9 + 0.8, q[2]], 0.04, 0x8a96a6);
        rod(g, [p[0], -9.8, p[2]], [p[0], -8.2, p[2]], 0.04, 0x8a96a6);
      });
    },
  );
  S.part(
    "moorings",
    "Lignes de mouillage",
    "Quatre lignes tendues vers le fond (profondeur non à l'échelle)",
    "mooring",
    false,
    (g) => {
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const A = [sx * 5.5, -3.4, sz * 5],
            B = [sx * 15, -23.2, sz * 13],
            pts = [];
          for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1])
            pts.push([
              A[0] + (B[0] - A[0]) * t,
              A[1] + (B[1] - A[1]) * t - 2.4 * Math.sin(Math.PI * t),
              A[2] + (B[2] - A[2]) * t,
            ]);
          tube(g, pts, 0.11, 0x40454c);
        }
    },
  );
  S.part(
    "anchors",
    "Ancres de fond",
    "Massifs béton et ancres à pattes : maintien en position sur le fond marin",
    "mooring",
    false,
    (g) => {
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          box(g, [2.2, 0.9, 2.2], 0x7e848a, [sx * 15, -23.3, sz * 13], 1, 0.1);
          K.mesh(g, new T.ConeGeometry(0.7, 1.2, 4), 0x5d646b, [
            sx * 15,
            -22.4,
            sz * 13,
          ]);
        }
    },
  );
  return {
    camera: { dir: [1, 0.55, 1.25] },
    keep: ["structure", "mooring"],
    notes: ["Profondeur non à l'échelle"],
    groups: [
      { id: "structure", label: "Structure" },
      { id: "living", label: "Vie / science" },
      { id: "power", label: "Énergie" },
      { id: "comms", label: "Communication" },
      { id: "ops", label: "Opérations" },
      { id: "instrumentation", label: "Instruments" },
      { id: "mooring", label: "Mouillage" },
    ],
  };
}

/* ───────────── STATION DE MÉTRO (coupe longitudinale) ───────────── */
function metro(T, K, S) {
  const { box, cyl, sph, rod, beam, inst, basic, mat, flat } = K,
    R = 7.6,
    CY = -8.2,
    LX = 36;
  S.environment((g) => {
    box(g, [90, 0.7, 28.5], 0x7b8f5a, [-8, -0.35, -5.75], 1, 0.02);
    box(g, [90, 17, 12], 0x6e5a46, [-8, -8.5, -14.2], 1, 0.02);
    box(g, [90, 1.7, 28.5], 0x4a3f33, [-8, -16.4, -5.75], 1, 0.02);
    flat(g, [90, 5], 0x35383d, [-8, 0.02, 6.2]);
    const tr = [];
    for (let i = 0; i < 6; i++) tr.push([-30 + i * 9, 0, 9]);
    inst(
      g,
      new T.CylinderGeometry(0.15, 0.2, 1.8, 8),
      0x5b3b24,
      tr.map(([x, , z]) => [x, 0.9, z]),
    );
    inst(
      g,
      new T.SphereGeometry(1.1, 12, 10),
      0x3f7d3c,
      tr.map(([x, , z]) => [x, 2.3, z]),
    );
  });
  S.part(
    "shell",
    "Voûte du tunnel",
    "Revêtement en béton armé, coupe longitudinale par l'axe de la station",
    "structure",
    true,
    (g) => {
      for (const [r, c] of [
        [R, 0x9aa1a8],
        [R + 0.5, 0x6d7378],
      ]) {
        const geo = new T.CylinderGeometry(
          r,
          r,
          LX,
          64,
          1,
          true,
          0.62,
          Math.PI * 2 - 1.24,
        );
        geo.rotateZ(Math.PI / 2);
        const m = new T.Mesh(geo, mat(c, 1, 0.1));
        m.position.y = CY;
        g.add(m);
      }
    },
  );
  S.part(
    "concourse",
    "Mezzanine (salle des billets)",
    "Dalle de circulation, portillons, écrans d'information",
    "structure",
    true,
    (g) => {
      box(g, [LX - 1, 0.6, 14.6], 0xb8bdc2, [0, -7, 0], 1, 0.1);
      const gates = [];
      for (let i = 0; i < 4; i++) gates.push([-9 + i * 1.2, -6.2, -2.8]);
      inst(g, new T.BoxGeometry(0.28, 1, 0.8), 0x4a5c72, gates, 1, 0.4);
      for (const x of [-9, 8])
        box(g, [0.12, 0.9, 1.4], 0x2f6fd0, [x, -5.2, -1.5], 1, 0.2);
      const lt = [];
      for (let i = -4; i <= 4; i++) lt.push([i * 4, -1.7, -2]);
      inst(g, new T.BoxGeometry(1.8, 0.06, 0.4), 0xfff3d6, lt, 1, 0, true);
    },
  );
  S.part(
    "platform",
    "Quai",
    "Quai de 28 m, bande jaune d'éveil de vigilance, bancs",
    "structure",
    true,
    (g) => {
      box(g, [LX - 2, 0.5, 6.8], 0xaeb3b8, [0, -13.15, -2.5], 1, 0.1);
      box(g, [LX - 2, 0.04, 0.5], 0xf2c230, [0, -12.88, 0.65]);
      const b = [];
      for (let i = 0; i < 5; i++) b.push([-12 + i * 6, -12.65, -5.1]);
      inst(g, new T.BoxGeometry(1.6, 0.45, 0.5), 0x66707c, b);
      const pil = [];
      for (let i = -2; i <= 2; i++) pil.push([i * 6, -10.1, -1.6]);
      inst(
        g,
        new T.CylinderGeometry(0.35, 0.35, 5.6, 20),
        0xc7ccd1,
        pil,
        1,
        0.1,
      );
    },
  );
  S.part(
    "track",
    "Voies",
    "Rails, traverses, ballast et troisième rail d'alimentation",
    "track",
    true,
    (g) => {
      box(g, [LX, 0.3, 5], 0x4a4d52, [0, -13.75, 2.9], 1, 0.1);
      const sl = [];
      for (let i = 0; i < 29; i++) sl.push([-17 + i * 1.2, -13.55, 2.75]);
      inst(g, new T.BoxGeometry(0.3, 0.15, 2.6), 0x8a8f95, sl);
      for (const z of [2.0, 3.45])
        box(g, [LX, 0.16, 0.12], 0xb8c1cc, [0, -13.4, z], 1, 0.8);
      box(g, [LX, 0.12, 0.14], 0xf2c230, [0, -13.45, 4.4], 1, 0.6);
    },
  );
  S.part(
    "train",
    "Rame (5 voitures)",
    "Rame automatique : caisses, baies vitrées, portes, bogies, cabine de conduite profilée",
    "rolling",
    true,
    (g) => {
      const wheel = new T.CylinderGeometry(0.45, 0.45, 0.18, 20);
      wheel.rotateX(Math.PI / 2);
      const win = [],
        door = [],
        wh = [],
        RED = 0xc7352b;
      for (let i = 0; i < 5; i++) {
        const x = -11.5 + i * 5.7,
          cx = x + 2.7;
        if (i === 4) {
          const s = new T.Shape();
          s.moveTo(0, 0);
          s.lineTo(5.4, 0);
          s.lineTo(5.4, 1.9);
          s.lineTo(4.5, 3.3);
          s.lineTo(0, 3.3);
          s.closePath();
          const geo = new T.ExtrudeGeometry(s, {
            depth: 2.7,
            bevelEnabled: false,
          });
          geo.translate(x, -13.1, 1.4);
          g.add(new T.Mesh(geo, mat(0xe6e8ea, 1, 0.3)));
          box(
            g,
            [0.06, 1.5, 1.9],
            0x14181d,
            [x + 4.95, -10.5, 2.75],
            1,
            0.2,
            [0, 0, -0.57],
          );
          basic(g, new T.SphereGeometry(0.14, 10, 8), 0xfff3b0, [
            x + 5.42,
            -12.4,
            1.9,
          ]);
          basic(g, new T.SphereGeometry(0.14, 10, 8), 0xfff3b0, [
            x + 5.42,
            -12.4,
            3.6,
          ]);
        } else box(g, [5.4, 3.3, 2.7], 0xe6e8ea, [cx, -11.45, 2.75], 1, 0.3);
        box(g, [5.42, 0.55, 2.72], RED, [cx, -12.75, 2.75]);
        box(g, [5.3, 0.18, 1.6], 0xa9b0b8, [cx, -9.7, 2.75]);
        for (const dx of [-2.2, 0, 2.2])
          for (const z of [1.38, 4.12]) win.push([cx + dx, -10.9, z]);
        for (const dx of [-1.2, 1.2])
          for (const z of [1.37, 4.13]) door.push([cx + dx, -11.9, z]);
        for (const dx of [-1.8, 1.8]) {
          box(g, [1.8, 0.4, 2.2], 0x2b2f35, [cx + dx, -13.1, 2.75]);
          for (const z of [1.75, 3.75])
            wh.push([cx + dx - 0.5, -13.0, z], [cx + dx + 0.5, -13.0, z]);
        }
      }
      inst(g, new T.BoxGeometry(0.9, 0.85, 0.04), 0x1c2a3a, win, 1, 0.2);
      inst(g, new T.BoxGeometry(1.0, 2.3, 0.05), 0x2b6f7c, door, 1, 0.2);
      inst(g, wheel, 0x30343b, wh, 1, 0.6);
    },
  );
  S.part(
    "doors",
    "Portes palières",
    "Cloison vitrée de quai synchronisée avec les portes de la rame",
    "equipment",
    false,
    (g) => {
      box(g, [28, 2.6, 0.05], 0x9fd0e8, [0.5, -11.6, 1.0], 0.2, 0.1);
      const p = [];
      for (let i = 0; i < 5; i++)
        for (const dx of [-1.75, -0.65, 0.65, 1.75])
          p.push([-8.8 + i * 5.7 + dx, -11.6, 1.0]);
      inst(g, new T.BoxGeometry(0.08, 2.7, 0.1), 0x4b5663, p);
    },
  );
  S.part(
    "signage",
    "Signalétique & éclairage",
    "Panneaux lumineux suspendus orange, rampe d'éclairage de quai",
    "equipment",
    false,
    (g) => {
      for (const x of [-10, 10]) {
        box(g, [3.2, 0.7, 0.12], 0xf08a24, [x, -9.2, -3.2], 1, 0.1);
        rod(g, [x - 1.2, -9.2, -3.2], [x - 1.2, -7.3, -3.2], 0.03, 0x555);
        rod(g, [x + 1.2, -9.2, -3.2], [x + 1.2, -7.3, -3.2], 0.03, 0x555);
      }
      const lt = [];
      for (let i = -4; i <= 4; i++)
        lt.push([i * 4, -7.4, -2], [i * 4, -7.4, 3]);
      inst(g, new T.BoxGeometry(2, 0.06, 0.5), 0xfff3d6, lt, 1, 0, true);
    },
  );
  S.part(
    "passengers",
    "Voyageurs",
    "Silhouettes à l'échelle humaine sur quai et mezzanine",
    "passengers",
    false,
    (g) => {
      const P = [
        [-9, -12.9, -3.6],
        [-8.4, -12.9, -3.2],
        [-2, -12.9, -2.2],
        [3, -12.9, -4.1],
        [3.6, -12.9, -3.8],
        [9, -12.9, -2.5],
        [-5, -12.9, -1.5],
        [-6, -6.7, -3],
        [-5.2, -6.7, -1.2],
        [2, -6.7, -3.5],
        [5, -6.7, 0.5],
        [8, -6.7, -2],
        [-11, -6.7, -2.5],
      ];
      inst(
        g,
        new T.CapsuleGeometry(0.2, 0.8, 4, 8),
        0x3b5b92,
        P.filter((_, i) => i % 3 === 0).map(([x, y, z]) => [x, y + 0.6, z]),
      );
      inst(
        g,
        new T.CapsuleGeometry(0.2, 0.8, 4, 8),
        0xb04a4a,
        P.filter((_, i) => i % 3 === 1).map(([x, y, z]) => [x, y + 0.6, z]),
      );
      inst(
        g,
        new T.CapsuleGeometry(0.2, 0.8, 4, 8),
        0x4a8a5e,
        P.filter((_, i) => i % 3 === 2).map(([x, y, z]) => [x, y + 0.6, z]),
      );
      inst(
        g,
        new T.SphereGeometry(0.17, 12, 10),
        0xe0b99a,
        P.map(([x, y, z]) => [x, y + 1.35, z]),
      );
    },
  );
  S.part(
    "mep",
    "Réseaux techniques",
    "Gaine de ventilation, chemins de câbles courants forts / faibles",
    "equipment",
    false,
    (g) => {
      cyl(g, [0.55, 0.55, LX - 2], 0x8c959e, [0, -2.6, -3.4], 1, 0.4, [
        0,
        0,
        Math.PI / 2,
      ]);
      for (const [y, c] of [
        [-9.6, 0x8a8f95],
        [-10.4, 0x6f7880],
      ])
        box(g, [LX - 3, 0.1, 0.35], c, [0, y, -7.2], 1, 0.4);
      const r = [];
      for (let i = 0; i < 24; i++) r.push([-16 + i * 1.4, -9.6, -7.2]);
      inst(g, new T.BoxGeometry(0.05, 0.05, 0.35), 0x5b616a, r);
    },
  );
  S.part(
    "vertical",
    "Circulations verticales",
    "Escalator quai ↔ mezzanine et ascenseur vitré",
    "access",
    true,
    (g) => {
      beam(g, [6, -6.7, -3], [11, -12.8, -3], 0.35, 0x59606a, 1, 0.4, 1.4);
      beam(g, [6, -5.6, -3.65], [11, -11.7, -3.65], 0.05, 0xc4cad2);
      beam(g, [6, -5.6, -2.35], [11, -11.7, -2.35], 0.05, 0xc4cad2);
      box(g, [1.8, 6.4, 1.8], 0x9fd0e8, [14, -9.9, -4.8], 0.22, 0.1);
      box(g, [1.4, 2.2, 1.4], 0x8a96a6, [14, -12.0, -4.8]);
    },
  );
  S.part(
    "stairs",
    "Accès et escalier vers la surface",
    "Escalier encloisonné reliant la mezzanine à la rue",
    "access",
    true,
    (g) => {
      beam(
        g,
        [-17.8, -6.7, -2.2],
        [-26, 0.1, -2.2],
        0.3,
        0x8f959c,
        1,
        0.1,
        1.8,
      );
      for (const z of [-3.2, -1.2]) {
        beam(g, [-17.8, -5.6, z], [-26, 1.2, z], 0.05, 0xc4cad2);
        box(
          g,
          [10, 8, 0.08],
          0x9fd0e8,
          [-22, -3.3, z - Math.sign(z + 2.2) * 0.1],
          0.16,
          0.1,
        );
      }
    },
  );
  S.part(
    "entrance",
    "Bouche de métro (surface)",
    "Auvent vitré, signal lumineux orange, accès depuis la rue",
    "surface",
    true,
    (g) => {
      box(g, [6, 3.2, 5], 0x9fd0e8, [-27.5, 1.6, -1.5], 0.22, 0.1);
      box(g, [6.4, 0.25, 5.4], 0x30343b, [-27.5, 3.35, -1.5], 1, 0.3);
      for (const [x, z] of [
        [-30.4, -3.9],
        [-24.6, -3.9],
        [-30.4, 0.9],
        [-24.6, 0.9],
      ])
        rod(g, [x, 0, z], [x, 3.3, z], 0.07, 0x30343b);
      rod(g, [-24.4, 0, 1.2], [-24.4, 4.2, 1.2], 0.05, 0x555);
      K.mesh(
        g,
        new T.CylinderGeometry(0.9, 0.9, 0.12, 32),
        0xf08a24,
        [-24.4, 4.6, 1.2],
        1,
        0.1,
        [Math.PI / 2, 0, 0],
      );
    },
  );
  return {
    camera: { dir: [0.55, 0.38, 1], dist: 0.82 },
    keep: ["structure", "track"],
    groups: [
      { id: "structure", label: "Structure" },
      { id: "track", label: "Voies" },
      { id: "rolling", label: "Matériel roulant" },
      { id: "equipment", label: "Équipements" },
      { id: "access", label: "Accès" },
      { id: "passengers", label: "Voyageurs" },
      { id: "surface", label: "Surface" },
    ],
    notes: ["Coupe longitudinale"],
  };
}

/* ───────────── CENTRALE HYDROÉLECTRIQUE ───────────── */
function hydro(T, K, S) {
  const { box, cyl, sph, tor, tube, rod, inst, basic, mat, flat } = K,
    X0 = 1.2,
    STEEL = 0x7d8da3,
    CON = 0xb9bec4;
  S.environment((g) => {
    flat(g, [130, 70], 0x6f8a4f, [0, -0.02, 0]);
    box(g, [90, 14, 16], 0x7a6a52, [-10, 5, 22], 1, 0.02, [-0.38, 0, 0]);
    box(g, [90, 14, 16], 0x7a6a52, [-10, 5, -22], 1, 0.02, [0.38, 0, 0]);
    box(g, [30, 8.2, 18], 0x3f87c0, [-24, 4.1, 0], 0.72, 0.05);
    flat(g, [42, 10], 0x3f87c0, [27, 0.2, 0], 0.85);
  });
  S.part(
    "dam",
    "Barrage-poids",
    "Corps de barrage en béton (représenté semi-transparent pour montrer la conduite forcée)",
    "dam",
    true,
    (g) => {
      const sh = new T.Shape();
      sh.moveTo(-10, 0);
      sh.lineTo(-3.5, 0);
      sh.lineTo(-6.4, 8.6);
      sh.lineTo(-8.1, 8.6);
      sh.closePath();
      const geo = new T.ExtrudeGeometry(sh, { depth: 18, bevelEnabled: false });
      geo.translate(0, 0, -9);
      g.add(new T.Mesh(geo, mat(CON, 0.55, 0.05)));
      for (const z of [-6, -2, 2, 6])
        box(g, [1.8, 3, 0.6], CON, [-7.25, 10.1, z]);
      for (const z of [-4, 0, 4])
        box(g, [0.5, 2.4, 3.2], STEEL, [-7.25, 9.8, z], 1, 0.6);
    },
  );
  S.part(
    "intake",
    "Prise d'eau & grille",
    "Tour de prise, grille de protection et vanne de garde",
    "dam",
    false,
    (g) => {
      box(g, [1.6, 7, 3.2], CON, [-9.8, 4.6, 0]);
      const bars = [];
      for (let i = 0; i < 9; i++) bars.push([-10.65, 4.5, -1.4 + i * 0.35]);
      inst(g, new T.BoxGeometry(0.05, 5, 0.05), 0x555b63, bars);
    },
  );
  S.part(
    "penstock",
    "Conduite forcée",
    "Conduite d'acier amenant l'eau du réservoir à la bâche spirale",
    "waterway",
    true,
    (g) => {
      tube(
        g,
        [
          [-9.3, 4.6, 0],
          [-6, 4.0, 0],
          [-2.6, 3.5, 0],
          [X0 - 1.9, 3.4, 0],
        ],
        0.7,
        STEEL,
        1,
        0.6,
      );
      tor(g, [1.9, 0.7], STEEL, [X0, 3.4, 0], 1, 0.6, [Math.PI / 2, 0, 0]);
    },
  );
  S.part(
    "turbine",
    "Turbine Francis",
    "Roue à aubes (13), distributeur à directrices, arbre vertical",
    "machinery",
    true,
    (g) => {
      const prof = [
        [0.25, 0],
        [1.3, 0.15],
        [1.55, 0.7],
        [1.1, 1.2],
        [0.5, 1.1],
      ].map(([r, y]) => new T.Vector2(r, y));
      const m = new T.Mesh(
        new T.LatheGeometry(prof, 36),
        mat(0xb8a98a, 1, 0.8),
      );
      m.position.set(X0, 2.6, 0);
      g.add(m);
      const bl = [];
      for (let i = 0; i < 13; i++) {
        const a = (i / 13) * Math.PI * 2;
        bl.push([X0 + Math.cos(a) * 1.0, 3.2, Math.sin(a) * 1.0, -a, 1, 1, 1]);
      }
      inst(g, new T.BoxGeometry(0.75, 0.9, 0.06), 0xd0c4a4, bl, 1, 0.8);
      const gv = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        gv.push([X0 + Math.cos(a) * 2.0, 3.4, Math.sin(a) * 2.0, -a + 0.5]);
      }
      inst(g, new T.BoxGeometry(0.5, 0.7, 0.05), 0x5d6672, gv, 1, 0.7);
      cyl(g, [0.3, 0.3, 3.2], 0xb8c1cc, [X0, 4.4, 0], 1, 0.8);
      tube(
        g,
        [
          [X0, 2.4, 0],
          [X0, 1.3, 0],
          [X0 + 2, 0.9, 0],
          [X0 + 5, 1.0, 0],
        ],
        0.85,
        0x6b7a8f,
        1,
        0.5,
      );
    },
  );
  S.part(
    "generator",
    "Alternateur",
    "Carter, stator bobiné, rotor à pôles saillants, excitatrice",
    "machinery",
    true,
    (g) => {
      cyl(g, [1.7, 1.7, 1.9], 0x4f7fb5, [X0, 6.0, 0], 0.4, 0.4);
      cyl(g, [1.2, 1.2, 1.4], 0xb87333, [X0, 6.0, 0], 1, 0.6);
      tor(g, [1.55, 0.12], 0xd49a5a, [X0, 5.4, 0], 1, 0.6, [Math.PI / 2, 0, 0]);
      tor(g, [1.55, 0.12], 0xd49a5a, [X0, 6.6, 0], 1, 0.6, [Math.PI / 2, 0, 0]);
      const poles = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        poles.push([X0 + Math.cos(a) * 1.25, 6.0, Math.sin(a) * 1.25, -a]);
      }
      inst(g, new T.BoxGeometry(0.22, 1.2, 0.3), 0x3b4452, poles);
      cyl(g, [0.55, 0.55, 0.5], 0x4f7fb5, [X0, 7.2, 0]);
    },
  );
  S.part(
    "powerhouse",
    "Salle des machines",
    "Bâtiment (parois translucides), pont roulant, passerelles",
    "machinery",
    false,
    (g) => {
      box(g, [9, 7.6, 8.6], 0xcdd5dd, [3.2, 3.8, 0], 0.2, 0.05);
      box(g, [9, 0.5, 8.6], 0x8c939a, [3.2, 0.25, 0]);
      box(g, [9.2, 0.25, 8.8], 0x30343b, [3.2, 7.7, 0], 0.5, 0.2);
      for (const z of [-3.8, 3.8])
        rod(g, [-1.2, 6.9, z], [7.6, 6.9, z], 0.09, 0xf2c230);
      beam(g, [X0, 6.9, -3.8], [X0, 6.9, 3.8], 0.3, 0xf2c230, 1, 0.3);
      rod(g, [X0 + 1.8, 6.8, 0], [X0 + 1.8, 5.6, 0], 0.03, 0x222);
      sph(g, 0.15, 0x222, [X0 + 1.8, 5.5, 0]);
    },
  );
  S.part(
    "grid",
    "Poste de transformation & ligne",
    "Transformateur à ailettes, pylônes treillis et lignes haute tension",
    "grid",
    true,
    (g) => {
      box(g, [2.2, 2.4, 1.8], 0x6f7f68, [9.8, 1.2, -4.8], 1, 0.3);
      const f = [];
      for (let i = 0; i < 8; i++) f.push([9.8 + 1.25, 1.2, -5.5 + i * 0.2]);
      inst(g, new T.BoxGeometry(0.08, 1.8, 0.1), 0x59635a, f);
      for (const x of [9.1, 9.8, 10.5])
        cyl(g, [0.08, 0.1, 0.9], 0xf2f2f2, [x, 2.85, -4.8]);
      const tw = (x, z) => {
        for (const [a, b] of [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [-0.5, 0.5],
        ])
          rod(
            g,
            [x + a, 0, z + b],
            [x + a * 0.25, 9, z + b * 0.25],
            0.05,
            0x7a828c,
          );
        for (const y of [2, 4, 6, 8]) {
          rod(
            g,
            [x - 0.5 + y * 0.03, y, z - 0.5],
            [x + 0.5 - y * 0.03, y, z + 0.5],
            0.03,
            0x7a828c,
          );
        }
        beam(g, [x - 3.2, 8.4, z], [x + 3.2, 8.4, z], 0.12, 0x7a828c);
      };
      tw(16, 0);
      tw(26, 0);
      for (const dz of [-3, 0, 3]) {
        const pts = [];
        for (const t of [0, 0.25, 0.5, 0.75, 1])
          pts.push([16 + 10 * t, 8.4 - 1.6 * Math.sin(Math.PI * t), dz]);
        tube(g, pts, 0.04, 0x222);
      }
    },
  );
  return {
    camera: { dir: [0.35, 0.5, 1] },
    keep: ["dam"],
    groups: [
      { id: "dam", label: "Barrage" },
      { id: "waterway", label: "Circuit d'eau" },
      { id: "machinery", label: "Machines" },
      { id: "grid", label: "Réseau électrique" },
    ],
    notes: ["Barrage semi-transparent"],
  };
}

/* ───────────── SALLE SERVEURS ───────────── */
function datacenter(T, K, S) {
  const { box, cyl, inst, rod, beam, basic } = K;
  S.environment((g) => {
    box(g, [34, 0.4, 24], 0x2a3140, [0, -0.2, 0], 1, 0.1);
    const t = [];
    for (let i = -16; i <= 16; i++) t.push([i, 0.01, 0, 0, 0.02, 0.02, 24]);
    for (let j = -11; j <= 11; j++) t.push([0, 0.012, j, 0, 34, 0.02, 0.02]);
    inst(g, new T.BoxGeometry(1, 1, 1), 0x3d4658, t);
  });
  S.part(
    "racks",
    "Baies serveurs (2 rangées)",
    "20 baies 42U face à face autour de l'allée froide confinée",
    "it",
    true,
    (g) => {
      const frame = [],
        units = [],
        leds = [];
      for (const [zr, side] of [
        [-3.4, 1],
        [3.4, -1],
      ])
        for (let i = 0; i < 10; i++) {
          const x = (i - 4.5) * 0.78;
          frame.push([x, 1.1, zr]);
          for (let u = 0; u < 14; u++) {
            units.push([x, 0.3 + u * 0.145, zr + side * 0.56]);
            if ((u + i) % 3 === 0)
              leds.push([x + 0.22, 0.3 + u * 0.145, zr + side * 0.58]);
          }
        }
      inst(g, new T.BoxGeometry(0.72, 2.2, 1.1), 0x1b2230, frame, 1, 0.5);
      inst(g, new T.BoxGeometry(0.62, 0.11, 0.04), 0x3a4a63, units, 1, 0.6);
      inst(
        g,
        new T.BoxGeometry(0.05, 0.05, 0.03),
        0x58e0a4,
        leds,
        1,
        0.1,
        true,
      );
    },
  );
  S.part(
    "aisle",
    "Allée froide confinée",
    "Toiture et portes translucides, dalles perforées d'insufflation",
    "cooling",
    true,
    (g) => {
      box(g, [7.9, 0.05, 2.7], 0x7fb4e8, [0, 2.35, 0], 0.25, 0.1);
      for (const x of [-3.95, 3.95])
        box(g, [0.05, 2.2, 2.6], 0x7fb4e8, [x, 1.1, 0], 0.22, 0.1);
      box(g, [7.8, 0.03, 2.6], 0x3b6fb6, [0, 0.03, 0], 1, 0.1);
      const cs = [];
      for (let i = 0; i < 9; i++) cs.push([-3.2 + i * 0.8, 0.9, 0]);
      inst(g, new T.ConeGeometry(0.12, 0.45, 12), 0x4aa8ff, cs, 1, 0.1, true);
      for (let i = 0; i < 6; i++)
        K.basic(
          g,
          new T.ConeGeometry(0.14, 0.5, 12),
          0xff6a4a,
          [-3 + i * 1.2, 2.9, 0.0],
          [0, 0, Math.PI / 2],
        );
    },
  );
  S.part(
    "crac",
    "Unités de refroidissement (CRAC)",
    "Trois armoires à eau glacée, soufflage sous faux-plancher, reprise d'air chaud en plafond",
    "cooling",
    true,
    (g) => {
      for (const z of [-6, 0, 6]) {
        box(g, [1.6, 2.4, 1], 0x9aa8ba, [-14, 1.2, z], 1, 0.4);
        box(g, [0.08, 2, 0.8], 0x2b3442, [-13.15, 1.2, z]);
      }
    },
  );
  S.part(
    "power",
    "Distribution électrique",
    "PDU de rangée, onduleurs (UPS) et batteries",
    "power",
    false,
    (g) => {
      for (const z of [-3.4, 3.4])
        box(g, [0.6, 2.2, 0.9], 0xd9a52b, [4.6, 1.1, z], 1, 0.3);
      for (const z of [-6, -3, 0, 3, 6])
        box(g, [1.2, 2.2, 1.0], 0x3d6d57, [14, 1.1, z], 1, 0.3);
    },
  );
  S.part(
    "trays",
    "Chemins de câbles & détection incendie",
    "Chemins de câbles aériens, réseau de gaz d'extinction",
    "infrastructure",
    false,
    (g) => {
      for (const z of [-1.6, 1.6]) {
        box(g, [18, 0.06, 0.4], 0x8a8f95, [0, 2.75, z], 1, 0.5);
        const r = [];
        for (let i = 0; i < 36; i++) r.push([-8.8 + i * 0.5, 2.75, z]);
        inst(g, new T.BoxGeometry(0.04, 0.05, 0.4), 0x5b616a, r);
      }
      for (const z of [-5.5, 5.5])
        rod(g, [-12, 3.2, z], [12, 3.2, z], 0.05, 0xd9534f);
      const l = [];
      for (let i = -4; i <= 4; i++) l.push([i * 3, 3.35, 0]);
      inst(g, new T.BoxGeometry(1.6, 0.05, 0.3), 0xfff3d6, l, 1, 0, true);
    },
  );
  return {
    camera: { dir: [0.8, 0.7, 1] },
    keep: ["infrastructure"],
    groups: [
      { id: "it", label: "Informatique" },
      { id: "cooling", label: "Refroidissement" },
      { id: "power", label: "Énergie" },
      { id: "infrastructure", label: "Infrastructure" },
    ],
  };
}

/* ───────────── BÂTIMENT ───────────── */
function building(T, K, S, txt) {
  const { box, cyl, inst, mat, flat } = K,
    F = Math.min(
      12,
      Math.max(
        2,
        Number(/(\d+)\s*(?:etages?|niveaux|floors?)/.exec(txt)?.[1]) || 4,
      ),
    ),
    W = 12,
    D = 8.4,
    H = 3.1;
  S.environment((g) => {
    flat(g, [60, 50], 0x6f8a4f, [0, -0.02, 0]);
    flat(g, [4, 22], 0xb9b5aa, [0, 0.01, 14]);
    box(g, [24, 0.04, 6], 0x35383d, [0, 0.03, 20]);
  });
  S.part(
    "foundation",
    "Fondations",
    "Semelle filante et pieux",
    "structure",
    false,
    (g) => {
      box(g, [W + 1, 0.8, D + 1], 0x6e7480, [0, -0.4, 0], 1, 0.05);
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
        [0, 0],
      ])
        cyl(g, [0.25, 0.25, 2], 0x595f69, [x * W * 0.4, -1.8, z * D * 0.4]);
    },
  );
  S.part(
    "frame",
    "Ossature béton",
    `${F} planchers et poteaux en trame régulière`,
    "structure",
    true,
    (g) => {
      const sl = [],
        col = [];
      for (let f = 0; f <= F; f++) sl.push([0, f * H, 0]);
      for (let f = 0; f < F; f++)
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 3; j++)
            col.push([
              -W / 2 + 0.4 + (i * (W - 0.8)) / 3,
              f * H + H / 2,
              -D / 2 + 0.4 + (j * (D - 0.8)) / 2,
            ]);
      inst(g, new T.BoxGeometry(W, 0.28, D), 0xb3b8be, sl, 1, 0.1);
      inst(g, new T.BoxGeometry(0.35, H - 0.28, 0.35), 0xd2d6da, col, 1, 0.1);
    },
  );
  S.part(
    "envelope",
    "Façades vitrées",
    "Murs-rideaux avec meneaux, vitrage translucide",
    "envelope",
    true,
    (g) => {
      const h = F * H;
      for (const z of [-D / 2, D / 2])
        box(g, [W, h, 0.08], 0x7fb4e8, [0, h / 2, z], 0.2, 0.2);
      for (const x of [-W / 2, W / 2])
        box(g, [0.08, h, D], 0x7fb4e8, [x, h / 2, 0], 0.2, 0.2);
      const mu = [];
      for (let i = 0; i <= 8; i++)
        for (const z of [-D / 2, D / 2])
          mu.push([-W / 2 + (i * W) / 8, h / 2, z]);
      inst(g, new T.BoxGeometry(0.07, h, 0.1), 0x4b5663, mu);
    },
  );
  S.part(
    "core",
    "Noyau (escalier & ascenseur)",
    "Cage d'escalier et gaine d'ascenseur",
    "core",
    true,
    (g) => {
      box(
        g,
        [2.6, F * H, 2.8],
        0xcfd4d9,
        [W / 2 - 2, (F * H) / 2, -D / 2 + 1.8],
        0.55,
        0.1,
      );
      for (let f = 0; f < F; f++) {
        const s = f * H;
        for (let i = 0; i < 8; i++)
          box(g, [0.9, 0.06, 0.3], 0x8d9399, [
            W / 2 - 2.7,
            s + 0.4 + i * 0.33,
            -D / 2 + 1 + i * 0.3,
          ]);
      }
      box(g, [1.2, 2.2, 1.2], 0x8a96a6, [W / 2 - 1.2, 1.2, -D / 2 + 1.8]);
    },
  );
  S.part(
    "roof",
    "Toiture-terrasse",
    "Acrotère, groupes de ventilation, bac d'eau",
    "roof",
    false,
    (g) => {
      const y = F * H;
      box(g, [W + 0.4, 0.4, D + 0.4], 0x8a8f95, [0, y + 0.2, 0]);
      box(g, [W + 0.4, 0.6, 0.2], 0xb3b8be, [0, y + 0.6, D / 2 + 0.1]);
      box(g, [W + 0.4, 0.6, 0.2], 0xb3b8be, [0, y + 0.6, -D / 2 - 0.1]);
      for (const x of [-3, 0.5])
        box(g, [2, 1.1, 1.6], 0x9aa8ba, [x, y + 0.95, 0.5], 1, 0.4);
      cyl(g, [0.9, 0.9, 1.6], 0x8c959e, [3.5, y + 1.2, 2]);
    },
  );
  S.part(
    "entrance",
    "Entrée & auvent",
    "Porte vitrée, auvent et cheminement",
    "envelope",
    false,
    (g) => {
      box(g, [3, 0.18, 2], 0x30343b, [0, 3.0, D / 2 + 1], 1, 0.3);
      for (const x of [-1.4, 1.4])
        cyl(g, [0.07, 0.07, 3], 0x30343b, [x, 1.5, D / 2 + 1.9]);
    },
  );
  return {
    camera: { dir: [0.9, 0.6, 1.1] },
    keep: ["structure"],
    groups: [
      { id: "structure", label: "Structure" },
      { id: "envelope", label: "Enveloppe" },
      { id: "core", label: "Noyau" },
      { id: "roof", label: "Toiture" },
    ],
  };
}

/* ───────────── CARTE ÉLECTRONIQUE ───────────── */
function pcb(T, K, S) {
  const { box, cyl, inst } = K;
  S.part(
    "board",
    "Circuit imprimé",
    "Carte 4 couches FR-4, plans de masse, pistes cuivre, trous de fixation",
    "board",
    true,
    (g) => {
      box(g, [9, 0.12, 6], 0x1d6b4a, [0, 0, 0], 1, 0.2);
      let s = 11;
      const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      const t = [];
      for (let i = 0; i < 60; i++) {
        const h = rnd() > 0.5,
          len = 0.5 + rnd() * 1.4;
        t.push([
          (rnd() - 0.5) * 8.4,
          0.065,
          (rnd() - 0.5) * 5.4,
          0,
          h ? len : 0.04,
          0.01,
          h ? 0.04 : len,
        ]);
      }
      inst(g, new T.BoxGeometry(1, 1, 1), 0xd3b45c, t, 1, 0.8);
      for (const [x, z] of [
        [-4.2, -2.7],
        [4.2, -2.7],
        [-4.2, 2.7],
        [4.2, 2.7],
      ])
        cyl(g, [0.14, 0.14, 0.14], 0xc7a24a, [x, 0, z], 1, 0.8);
    },
  );
  S.part(
    "mcu",
    "Microcontrôleur",
    "Boîtier QFP 64 broches",
    "ic",
    true,
    (g) => {
      box(g, [1.3, 0.16, 1.3], 0x1a1d24, [-0.4, 0.14, 0], 1, 0.3);
      const p = [];
      for (let side = 0; side < 4; side++)
        for (let i = 0; i < 16; i++) {
          const t = ((i + 0.5) / 16 - 0.5) * 1.15,
            e = 0.72;
          if (side < 2) p.push([-0.4 + t, 0.08, (side ? 1 : -1) * e]);
          else p.push([-0.4 + (side === 3 ? 1 : -1) * e, 0.08, t, Math.PI / 2]);
        }
      inst(g, new T.BoxGeometry(0.05, 0.03, 0.2), 0xc9ccd2, p, 1, 0.9);
      cyl(g, [0.05, 0.05, 0.02], 0x888, [-0.9, 0.23, -0.5]);
    },
  );
  S.part(
    "usb",
    "Connecteur USB-C",
    "Alimentation et programmation",
    "io",
    true,
    (g) => {
      box(g, [0.9, 0.38, 0.8], 0xc6ccd5, [-4.2, 0.25, 0], 1, 0.8);
      box(g, [0.6, 0.2, 0.05], 0x15181d, [-4.68, 0.25, 0]);
    },
  );
  S.part(
    "header",
    "Embases GPIO",
    "Deux rangées de broches 2,54 mm",
    "io",
    false,
    (g) => {
      for (const z of [-2.5, 2.5]) {
        box(g, [6, 0.25, 0.28], 0x20232a, [1.2, 0.18, z]);
        const pins = [];
        for (let i = 0; i < 20; i++) pins.push([-1.65 + i * 0.3, 0.45, z]);
        inst(g, new T.BoxGeometry(0.06, 0.4, 0.06), 0xd9b865, pins, 1, 0.9);
      }
    },
  );
  S.part(
    "regulator",
    "Régulateur 3,3 V",
    "Boîtier SOT-223 et condensateurs de découplage",
    "power",
    false,
    (g) => {
      box(g, [0.7, 0.14, 0.45], 0x1a1d24, [-2.6, 0.13, 1.8]);
      box(g, [0.5, 0.05, 0.3], 0xc9ccd2, [-2.6, 0.09, 2.18], 1, 0.9);
      for (const x of [-3.3, -1.9])
        cyl(g, [0.2, 0.2, 0.4], 0x2c4f8f, [x, 0.3, 1.8]);
    },
  );
  S.part(
    "crystal",
    "Quartz 16 MHz",
    "Oscillateur métallique",
    "ic",
    false,
    (g) => {
      box(g, [0.7, 0.2, 0.3], 0xc9ccd2, [1.4, 0.16, 1.1], 1, 0.9);
    },
  );
  S.part(
    "passives",
    "Composants passifs",
    "Résistances et condensateurs CMS 0603",
    "passive",
    false,
    (g) => {
      const r = [],
        c = [];
      for (let i = 0; i < 14; i++) {
        r.push([-0.2 + i * 0.28, 0.1, -1.7]);
        c.push([-0.2 + i * 0.28, 0.1, -2.1]);
      }
      inst(g, new T.BoxGeometry(0.2, 0.07, 0.1), 0x20232a, r);
      inst(g, new T.BoxGeometry(0.2, 0.07, 0.1), 0xa88c5a, c);
    },
  );
  S.part(
    "leds",
    "LED d'état",
    "Quatre LED CMS (alim., TX, RX, utilisateur)",
    "passive",
    false,
    (g) => {
      const l = [];
      for (let i = 0; i < 4; i++) l.push([2.2 + i * 0.35, 0.1, 1.9]);
      const cols = [0x58e0a4, 0xf2c230, 0xf2c230, 0xff6a4a];
      l.forEach((p, i) =>
        K.basic(g, new T.BoxGeometry(0.2, 0.06, 0.12), cols[i], p),
      );
    },
  );
  return {
    camera: { dir: [0.4, 1, 0.8] },
    keep: ["board"],
    groups: [
      { id: "board", label: "Carte" },
      { id: "ic", label: "Circuits intégrés" },
      { id: "io", label: "Connectique" },
      { id: "power", label: "Alimentation" },
      { id: "passive", label: "Passifs" },
    ],
  };
}

/* ───────────── CELLULE EUCARYOTE ───────────── */
function cell(T, K, S) {
  const { sph, tube, inst, tor, mesh } = K;
  S.part(
    "membrane",
    "Membrane plasmique",
    "Bicouche lipidique, enveloppe de la cellule",
    "envelope",
    true,
    (g) => {
      for (const [k, o] of [
        [1, 0.16],
        [0.94, 0.1],
      ])
        sph(g, 3.2 * k, 0x7fd0b8, [0, 0, 0], o, 0.05, [1.3, 1, 1]);
    },
  );
  S.part(
    "nucleus",
    "Noyau",
    "Enveloppe nucléaire, chromatine, nucléole",
    "organelles",
    true,
    (g) => {
      sph(g, 1.05, 0xb7a8fa, [-0.6, 0.2, 0], 0.28, 0.05);
      sph(g, 0.92, 0x8069dd, [-0.6, 0.2, 0], 0.95, 0.05);
      sph(g, 0.3, 0x3d2f86, [-0.4, 0.4, 0.3]);
    },
  );
  S.part(
    "mito",
    "Mitochondries",
    "Double membrane, crêtes — production d'ATP",
    "organelles",
    true,
    (g) => {
      [
        [2, -1, 0.5, 0.4],
        [1.6, 1.4, -0.8, -0.5],
        [-2.4, -1.3, 0.8, 1.1],
        [0.2, -1.9, -0.6, 0],
      ].forEach(([x, y, z, r]) => {
        const m = mesh(
          g,
          new T.CapsuleGeometry(0.3, 0.9, 8, 18),
          0xf09a45,
          [x, y, z],
          0.6,
          0.05,
          [0, 0, r + Math.PI / 2],
        );
        for (let i = 0; i < 5; i++)
          K.box(
            g,
            [0.03, 0.4, 0.26 + (i % 2) * 0.1],
            0xffd09a,
            [
              x + Math.cos(r) * (i - 2) * 0.22,
              y + Math.sin(r) * (i - 2) * 0.22,
              z,
            ],
            1,
            0.05,
            [0, 0, r],
          );
        void m;
      });
    },
  );
  S.part(
    "golgi",
    "Appareil de Golgi",
    "Saccules empilés — maturation et tri des protéines",
    "organelles",
    false,
    (g) => {
      for (let i = 0; i < 6; i++) {
        const s = sph(g, 1, 0xe6b34e, [1.6, 0.5 + i * 0.16, 1.4], 0.95, 0.05, [
          0.7 - i * 0.03,
          0.06,
          0.4,
        ]);
        s.rotation.z = 0.15;
      }
    },
  );
  S.part(
    "er",
    "Réticulum endoplasmique",
    "Citernes repliées reliées à l'enveloppe nucléaire",
    "organelles",
    false,
    (g) => {
      for (let k = 0; k < 3; k++) {
        const pts = [];
        for (let i = 0; i < 14; i++)
          pts.push([
            -1.6 + Math.sin(i * 1.3 + k) * 0.5,
            -0.4 + k * 0.45 + Math.cos(i * 0.9) * 0.12,
            -1.3 + i * 0.2 + k * 0.2,
          ]);
        tube(g, pts, 0.1, 0x9ec3e6, 0.9, 0.05);
      }
    },
  );
  S.part(
    "ribosomes",
    "Ribosomes & vésicules",
    "Synthèse protéique, transport vésiculaire",
    "organelles",
    false,
    (g) => {
      const r = [];
      for (let i = 0; i < 70; i++)
        r.push([
          Math.sin(i * 12.9) * 2.6,
          Math.cos(i * 7.3) * 1.8,
          Math.sin(i * 3.1 + 1) * 1.6,
          0,
          0.06,
          0.06,
          0.06,
        ]);
      inst(g, new T.SphereGeometry(1, 8, 6), 0x4a6fa5, r);
      for (const [x, y, z] of [
        [-2.2, 1.2, 0.5],
        [0.9, 1.7, 0.9],
        [2.4, -0.2, -1.1],
      ])
        sph(g, 0.2, 0xff8a8a, [x, y, z], 0.8, 0.05);
    },
  );
  return {
    camera: { dir: [0.5, 0.5, 1] },
    keep: [],
    groups: [
      { id: "envelope", label: "Membrane" },
      { id: "organelles", label: "Organites" },
    ],
  };
}

/* ───────────── AVION (assemblage paramétrique, pièces fournies au planificateur) ───────────── */
const aircraft = () => ({
  objects: [
    {
      id: "fuselage",
      label: "Fuselage",
      role: "fuselage",
      major: true,
      detail: "Cellule pressurisée : cabine, baies, cockpit vitré",
    },
    {
      id: "wing_l",
      label: "Aile gauche",
      role: "wing",
      side: "left",
      major: true,
      detail: "Voilure en flèche, profil NACA, winglet",
    },
    {
      id: "wing_r",
      label: "Aile droite",
      role: "wing",
      side: "right",
      major: true,
      detail: "Voilure en flèche, profil NACA, winglet",
    },
    {
      id: "hstab",
      label: "Stabilisateur horizontal",
      role: "hstab",
      detail: "Plans fixes d'empennage",
    },
    {
      id: "fin",
      label: "Dérive",
      role: "fin",
      major: true,
      detail: "Empennage vertical",
    },
    {
      id: "eng_l",
      label: "Réacteur gauche",
      role: "engine",
      side: "left",
      major: true,
      detail: "Turbofan : nacelle, soufflante, cône d'éjection, pylône",
    },
    {
      id: "eng_r",
      label: "Réacteur droit",
      role: "engine",
      side: "right",
      major: true,
      detail: "Turbofan : nacelle, soufflante, cône d'éjection, pylône",
    },
    {
      id: "gear_nose",
      label: "Train avant",
      role: "gear",
      detail: "Jambe, amortisseur, roues jumelées",
    },
    {
      id: "gear_l",
      label: "Train principal gauche",
      role: "gear",
      side: "left",
      detail: "Jambe, amortisseur, roues",
    },
    {
      id: "gear_r",
      label: "Train principal droit",
      role: "gear",
      side: "right",
      detail: "Jambe, amortisseur, roues",
    },
    {
      id: "flap_l",
      label: "Volets gauches",
      role: "flap",
      side: "left",
      detail: "Surfaces hypersustentatrices",
    },
    {
      id: "flap_r",
      label: "Volets droits",
      role: "flap",
      side: "right",
      detail: "Surfaces hypersustentatrices",
    },
  ],
});

const RECIPES = {
  ocean,
  metro,
  hydro,
  datacenter,
  building,
  pcb,
  cell,
  aircraft,
};
export function buildRecipe(T, id, material, a) {
  const K = kit(T, material),
    S = sceneKit(T),
    txt = strip(`${a.subject || ""} ${a.title || ""}`),
    out = RECIPES[id](T, K, S, txt);
  return out.objects
    ? out
    : {
        id,
        label: RECIPE_LABEL[id],
        parts: S.parts,
        env: S.env,
        camera: out.camera,
        groups: out.groups,
        keep: out.keep,
        notes: out.notes,
      };
}
