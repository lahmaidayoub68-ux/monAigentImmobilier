/* AiGENT — styles de rendu, maillages, vues, éclairage, cotes. */
export const STYLES = [
  ["realistic", "Réaliste", "Matériaux PBR, reflets, ombres douces"],
  ["semi", "Semi-réaliste", "Reflets atténués, lecture plus douce"],
  ["clay", "Argile", "Volumes sans matière : juger la forme"],
  ["toon", "Cartoon / Toon", "Aplats à paliers et contour épais"],
  ["flat", "Low poly / Flat", "Facettes visibles, ombrage plat"],
  ["matcap", "Matcap", "Sculpture éclairée, sans lumière de scène"],
  ["wire", "Filaire", "Arêtes avec faces cachées"],
  ["blueprint", "Blueprint", "Plan bleu, traits clairs, cotes"],
  ["holo", "Hologramme", "Lueur cyan, lecture d'ensemble"],
  ["npr", "Illustration (NPR)", "Encrage noir, 2 niveaux d'ombre"],
];
export const REPS = [
  ["solid", "Solide lisse", "Surface continue"],
  [
    "lowpoly",
    "Polygonal (low poly)",
    "Sommets quantifiés, silhouette facettée",
  ],
  ["quad", "Maillage quad", "Arêtes principales, sans diagonales"],
  ["tri", "Maillage triangulaire", "Triangulation complète"],
  ["voxel", "Voxels", "Volume discrétisé en cubes"],
  ["scan", "Scan 3D (points)", "Nuage de points, dégradé de profondeur"],
  ["splat", "Splats", "Points flous, rendu type gaussien"],
  ["sculpt", "Sculpture numérique", "Déformation organique des surfaces"],
];
export const VIEWS = [
  ["free", "Perspective libre", "Rotation à la souris"],
  ["iso", "Isométrique", "Axes à 120°, sans fuite"],
  ["axo", "Axonométrique", "Dimétrique, lecture technique"],
  ["p1", "Perspective 1 point", "Fuite centrale, vue de face"],
  ["p2", "Perspective 2 points", "Verticales conservées"],
  ["p3", "Perspective 3 points", "Plongée marquée"],
  ["ortho_front", "Ortho · face", "Projection sans déformation"],
  ["ortho_top", "Ortho · dessus", "Plan vu du dessus"],
  ["ortho_side", "Ortho · profil", "Élévation latérale"],
];
export const LIGHTS = [
  ["studio", "Studio (reflets HDRI)", "Réflexions d'un studio simulé"],
  ["sun", "Soleil + ombres", "Une source dure, ombres nettes"],
  ["ao", "Occlusion ambiante", "Ombrage doux dans les creux"],
  ["fog", "Brume volumétrique", "Profondeur atmosphérique"],
  ["flat", "Sans ombres", "Éclairage uniforme"],
];
STYLES.push; /* (aucun effet : les entrées ci-dessus sont déjà complètes) */

const TEX = {};
function toonTex(T, steps) {
  const k = `t${steps}`;
  if (TEX[k]) return TEX[k];
  const d = new Uint8Array(
      Array.from({ length: steps }, (_, i) =>
        Math.round(70 + (185 * i) / (steps - 1)),
      ),
    ),
    t = new T.DataTexture(d, steps, 1, T.RedFormat);
  t.minFilter = t.magFilter = T.NearestFilter;
  t.needsUpdate = true;
  return (TEX[k] = t);
}
function matcapTex(T) {
  if (TEX.mc) return TEX.mc;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d"),
    g = x.createRadialGradient(46, 40, 6, 64, 64, 66);
  [
    [0, "#fff"],
    [0.45, "#b9bfd0"],
    [0.85, "#4b5266"],
    [1, "#1d2230"],
  ].forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return (TEX.mc = new T.CanvasTexture(c));
}
function spriteTex(T) {
  if (TEX.sp) return TEX.sp;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d"),
    g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return (TEX.sp = new T.CanvasTexture(c));
}

const STYLE_BG = (dark) => ({
  blueprint: dark ? 0x0b2547 : 0x1a4a85,
  wire: dark ? 0x0b0d12 : 0xfafbfd,
  clay: dark ? 0x17181c : 0xece7df,
  toon: dark ? 0x131a29 : 0xe3edfb,
  npr: dark ? 0x14151a : 0xf5f3ee,
  matcap: dark ? 0x101218 : 0xeef1f6,
  flat: dark ? 0x10141d : 0xf1f4f9,
  holo: 0x050b14,
});
export function styleMaterial(T, spec, style, dark) {
  const o = spec.opacity ?? 1,
    base = {
      color: spec.color,
      transparent: o < 1,
      opacity: o,
      side: T.DoubleSide,
    };
  switch (style) {
    case "clay":
      return new T.MeshStandardMaterial({
        ...base,
        color: new T.Color(dark ? 0xb9ab98 : 0xcfbfa9).lerp(
          new T.Color(spec.color),
          0.16,
        ),
        roughness: 1,
        metalness: 0,
      });
    case "toon":
      return new T.MeshToonMaterial({ ...base, gradientMap: toonTex(T, 4) });
    case "npr":
      return new T.MeshToonMaterial({ ...base, gradientMap: toonTex(T, 2) });
    case "flat":
      return new T.MeshStandardMaterial({
        ...base,
        flatShading: true,
        roughness: 0.8,
        metalness: 0.05,
      });
    case "matcap":
      return new T.MeshMatcapMaterial({ ...base, matcap: matcapTex(T) });
    case "wire":
      return new T.MeshBasicMaterial({
        color: dark ? 0x0b0d12 : 0xfafbfd,
        side: T.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
    case "blueprint":
      return new T.MeshBasicMaterial({
        color: 0x2b6cb0,
        transparent: true,
        opacity: 0.28,
        side: T.DoubleSide,
        depthWrite: false,
      });
    case "holo":
      return new T.MeshBasicMaterial({
        color: 0x35d8ff,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
      });
    case "semi":
      return new T.MeshStandardMaterial({
        ...base,
        roughness: Math.max(0.45, spec.roughness),
        metalness: spec.metalness * 0.6,
        envMapIntensity: 0.6,
      });
    default:
      return new T.MeshPhysicalMaterial({
        ...base,
        roughness: spec.roughness,
        metalness: spec.metalness,
        clearcoat: spec.metalness < 0.3 && o === 1 ? 0.35 : 0,
        clearcoatRoughness: 0.25,
        envMapIntensity: 1.25,
        emissive: spec.emissive ? spec.color : 0x000000,
        emissiveIntensity: spec.emissive ? 1.2 : 0,
      });
  }
}
function hullOf(T, geo, w) {
  const g = geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  g.computeBoundingSphere();
  const k = g.boundingSphere.radius * w,
    p = g.attributes.position,
    n = g.attributes.normal;
  for (let i = 0; i < p.count; i++)
    p.setXYZ(
      i,
      p.getX(i) + n.getX(i) * k,
      p.getY(i) + n.getY(i) * k,
      p.getZ(i) + n.getZ(i) * k,
    );
  return g;
}
export function applyStyle(T, model, style, dark) {
  const cache = new Map();
  model.traverse((n) => {
    if (!(n.isMesh || n.isInstancedMesh) || n.userData.noRestyle) return;
    n.userData.origMat = n.userData.origMat || n.material;
    const spec = n.userData.origMat.userData?.spec;
    if (!spec) return;
    const key = `${style}|${dark}|${JSON.stringify(spec)}`;
    if (!cache.has(key)) cache.set(key, styleMaterial(T, spec, style, dark));
    n.material = cache.get(key);
    if (n.userData.edgeLine) {
      n.remove(n.userData.edgeLine);
      n.userData.edgeLine.geometry.dispose();
      n.userData.edgeLine = null;
    }
    if (n.isInstancedMesh || n.geometry.attributes.position.count > 9000)
      return;
    let extra = null;
    if (style === "toon" || style === "npr")
      extra = new T.Mesh(
        hullOf(T, n.geometry, 0.011),
        new T.MeshBasicMaterial({ color: 0x0b0d12, side: T.BackSide }),
      );
    else if (["blueprint", "wire", "holo"].includes(style))
      extra = new T.LineSegments(
        new T.EdgesGeometry(n.geometry, 28),
        new T.LineBasicMaterial({
          color:
            style === "blueprint"
              ? 0xcfe6ff
              : style === "holo"
                ? 0x6fe9ff
                : dark
                  ? 0xdfe6f3
                  : 0x1b2332,
          transparent: true,
          opacity: 0.9,
        }),
      );
    if (extra) {
      extra.userData.noRestyle = extra.userData.isOverlay = true;
      n.add(extra);
      n.userData.edgeLine = extra;
    }
  });
  return STYLE_BG(dark)[style] ?? null;
}

/* ── maillages ── */
const rnd =
  (s = 7) =>
  () =>
    (s = (s * 16807) % 2147483647) / 2147483647;
function quantize(T, geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.computeBoundingBox();
  const s = g.boundingBox.getSize(new T.Vector3()),
    cell = Math.max(s.x, s.y, s.z, 0.05) / 9,
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setXYZ(
      i,
      Math.round(p.getX(i) / cell) * cell,
      Math.round(p.getY(i) / cell) * cell,
      Math.round(p.getZ(i) / cell) * cell,
    );
  g.computeVertexNormals();
  return g;
}
function sculpt(T, geo) {
  const g = geo.clone(),
    p = g.attributes.position;
  g.computeVertexNormals();
  const n = g.attributes.normal;
  g.computeBoundingSphere();
  const amp = g.boundingSphere.radius * 0.035;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      d =
        amp *
        (Math.sin(x * 3.1 + z * 2.3) * Math.cos(y * 2.7) +
          0.5 * Math.sin((x + y + z) * 6.2));
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}
function sample(T, model, meshes, target) {
  model.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(model.matrixWorld).invert(),
    tris = [],
    A = new T.Vector3(),
    B = new T.Vector3(),
    C = new T.Vector3(),
    I = new T.Matrix4(),
    M = new T.Matrix4();
  let total = 0;
  const add = (m, mat) => {
    const g = m.geometry,
      p = g.attributes.position,
      ix = g.index,
      n = ix ? ix.count : p.count,
      color = new T.Color(
        m.userData.origMat?.userData?.spec?.color ?? 0x9aa4b2,
      );
    for (let i = 0; i + 2 < n; i += 3) {
      const a = ix ? ix.getX(i) : i,
        b = ix ? ix.getX(i + 1) : i + 1,
        c = ix ? ix.getX(i + 2) : i + 2;
      A.fromBufferAttribute(p, a).applyMatrix4(mat);
      B.fromBufferAttribute(p, b).applyMatrix4(mat);
      C.fromBufferAttribute(p, c).applyMatrix4(mat);
      const area =
        new T.Vector3()
          .subVectors(B, A)
          .cross(new T.Vector3().subVectors(C, A))
          .length() / 2;
      if (area > 1e-9) {
        tris.push([A.clone(), B.clone(), C.clone(), area, color]);
        total += area;
      }
    }
  };
  meshes.forEach((m) => {
    if (m.isInstancedMesh)
      for (let k = 0; k < Math.min(m.count, 400); k++) {
        m.getMatrixAt(k, I);
        add(m, M.multiplyMatrices(inv, m.matrixWorld).multiply(I).clone());
      }
    else add(m, new T.Matrix4().multiplyMatrices(inv, m.matrixWorld));
  });
  const r = rnd(),
    dens = target / (total || 1),
    pos = [],
    col = [];
  tris.forEach(([a, b, c, area, color]) => {
    const k = area * dens;
    let cnt = Math.floor(k) + (r() < k % 1 ? 1 : 0);
    while (cnt-- > 0) {
      const r1 = Math.sqrt(r()),
        r2 = r(),
        u = 1 - r1,
        v = r2 * r1,
        w = 1 - u - v;
      pos.push(
        a.x * w + b.x * u + c.x * v,
        a.y * w + b.y * u + c.y * v,
        a.z * w + b.z * u + c.z * v,
      );
      col.push(color.r, color.g, color.b);
    }
  });
  return { pos, col };
}
const inEnv = (n) => {
  for (let p = n; p; p = p.parent) if (p.userData?.env) return true;
  return false;
};
export function applyRep(T, model, rep, state) {
  state.overlays.splice(0).forEach((o) => {
    o.parent?.remove(o);
    o.geometry?.dispose?.();
  });
  const meshes = [];
  model.traverse((n) => {
    if (
      (n.isMesh || n.isInstancedMesh) &&
      !n.userData.noRestyle &&
      !n.userData.isOverlay &&
      !inEnv(n)
    )
      meshes.push(n);
  });
  meshes.forEach((m) => {
    if (m.userData.repHidden) {
      m.visible = true;
      m.userData.repHidden = false;
    }
    if (m.userData.geo0) {
      m.geometry = m.userData.geo0;
      m.userData.geo0 = null;
    }
  });
  const overlay = (o) => {
    o.userData.noRestyle = o.userData.isOverlay = true;
    model.add(o);
    state.overlays.push(o);
    return o;
  };
  const solids = meshes.filter((m) => !m.isInstancedMesh);
  if (rep === "lowpoly")
    solids.forEach((m) => {
      m.userData.geo0 = m.geometry;
      m.geometry = quantize(T, m.geometry);
    });
  else if (rep === "sculpt")
    solids.forEach((m) => {
      m.userData.geo0 = m.geometry;
      m.geometry = sculpt(T, m.geometry);
    });
  else if (rep === "quad" || rep === "tri")
    solids.forEach((m) => {
      const l = new T.LineSegments(
        rep === "quad"
          ? new T.EdgesGeometry(m.geometry, 2)
          : new T.WireframeGeometry(m.geometry),
        new T.LineBasicMaterial({
          color: 0x0b0e14,
          transparent: true,
          opacity: 0.55,
        }),
      );
      l.userData.noRestyle = l.userData.isOverlay = true;
      m.add(l);
      state.overlays.push(l);
    });
  else if (["voxel", "scan", "splat"].includes(rep)) {
    const { pos, col } = sample(
      T,
      model,
      meshes,
      rep === "voxel" ? 90000 : rep === "scan" ? 70000 : 26000,
    );
    if (!pos.length) return;
    meshes.forEach((m) => {
      m.visible = false;
      m.userData.repHidden = true;
    });
    const mn = new T.Vector3(1e9, 1e9, 1e9),
      mx = new T.Vector3(-1e9, -1e9, -1e9);
    for (let i = 0; i < pos.length; i += 3) {
      mn.x = Math.min(mn.x, pos[i]);
      mx.x = Math.max(mx.x, pos[i]);
      mn.y = Math.min(mn.y, pos[i + 1]);
      mx.y = Math.max(mx.y, pos[i + 1]);
      mn.z = Math.min(mn.z, pos[i + 2]);
      mx.z = Math.max(mx.z, pos[i + 2]);
    }
    const big = Math.max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z, 0.1);
    if (rep === "voxel") {
      const cell = big / 34,
        cells = new Map();
      for (let i = 0; i < pos.length; i += 3) {
        const k = `${Math.round(pos[i] / cell)},${Math.round(pos[i + 1] / cell)},${Math.round(pos[i + 2] / cell)}`;
        if (!cells.has(k) && cells.size < 26000) cells.set(k, [i, k]);
      }
      const im = new T.InstancedMesh(
          new T.BoxGeometry(cell * 0.94, cell * 0.94, cell * 0.94),
          new T.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 }),
          cells.size,
        ),
        M = new T.Matrix4(),
        c = new T.Color();
      let n = 0;
      cells.forEach(([i, k]) => {
        const [x, y, z] = k.split(",").map(Number);
        M.makeTranslation(x * cell, y * cell, z * cell);
        im.setMatrixAt(n, M);
        c.setRGB(col[i], col[i + 1], col[i + 2]);
        c.offsetHSL(0, 0, (((x * 7 + y * 13 + z * 17) % 11) / 11 - 0.5) * 0.07);
        im.setColorAt(n++, c);
      });
      overlay(im);
    } else {
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      {
        const c2 = col.slice();
        for (let i = 0; i < pos.length; i += 3) {
          const t = Math.min(
            1,
            Math.max(0, (pos[i + 1] - mn.y) / (mx.y - mn.y || 1)),
          );
          c2[i] = c2[i] * 0.55 + (0.2 + 0.7 * t) * 0.45;
          c2[i + 1] = c2[i + 1] * 0.55 + (0.35 + 0.4 * t) * 0.45;
          c2[i + 2] = c2[i + 2] * 0.55 + (0.9 - 0.5 * t) * 0.45;
        }
        geo.setAttribute("color", new T.Float32BufferAttribute(c2, 3));
      }
      overlay(
        new T.Points(
          geo,
          new T.PointsMaterial(
            rep === "scan"
              ? { size: big / 190, vertexColors: true, sizeAttenuation: true }
              : {
                  size: big / 40,
                  vertexColors: true,
                  sizeAttenuation: true,
                  map: spriteTex(T),
                  transparent: true,
                  opacity: 0.7,
                  depthWrite: false,
                  alphaTest: 0.02,
                },
          ),
        ),
      );
    }
  }
}

/* ── vues ── */
export function makeCamera(T, view, aspect, radius, center, dirFree) {
  const dirs = {
    free: dirFree || [1, 0.78, 1.25],
    iso: [1, 1, 1],
    axo: [0.9, 0.55, 1.25],
    p1: [0, 0.06, 1],
    p2: [1, 0, 1],
    p3: [1, 0.95, 1],
    ortho_front: [0, 0, 1],
    ortho_top: [0, 1, 0.0001],
    ortho_side: [1, 0, 0],
  };
  const d = new T.Vector3(...(dirs[view] || dirs.free)).normalize(),
    ortho = ["iso", "axo", "ortho_front", "ortho_top", "ortho_side"].includes(
      view,
    );
  let cam;
  if (ortho) {
    const h = radius * 1.25;
    cam = new T.OrthographicCamera(
      -h * aspect,
      h * aspect,
      h,
      -h,
      0.1,
      radius * 60,
    );
    cam.position.copy(center).addScaledVector(d, radius * 8);
  } else {
    cam = new T.PerspectiveCamera(
      view === "p3" ? 62 : view === "p1" ? 32 : 38,
      aspect,
      0.1,
      radius * 60,
    );
    cam.position
      .copy(center)
      .addScaledVector(d, radius * (view === "p3" ? 1.9 : 2.9));
    if (view === "p2") cam.position.y = center.y;
    if (view === "p3") cam.position.y = center.y + radius * 1.4;
  }
  cam.lookAt(center);
  return cam;
}

/* ── environnement (reflets) et éclairage ── */
export function makeEnv(T, renderer, dark) {
  const s = new T.Scene(),
    sky = new T.Mesh(
      new T.SphereGeometry(50, 32, 16),
      new T.MeshBasicMaterial({ side: T.BackSide, vertexColors: true }),
    ),
    pos = sky.geometry.attributes.position,
    col = new Float32Array(pos.count * 3);
  const top = new T.Color(dark ? 0x3a4a66 : 0xcfe0f5),
    mid = new T.Color(dark ? 0x1b2230 : 0xf0f3f7),
    bot = new T.Color(dark ? 0x10131a : 0xa9aeb5);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50,
      c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, -y);
    col.set([c.r, c.g, c.b], i * 3);
  }
  sky.geometry.setAttribute("color", new T.BufferAttribute(col, 3));
  s.add(sky);
  for (const [x, y, z, w, h] of [
    [20, 30, 15, 24, 10],
    [-25, 18, -10, 16, 8],
    [0, 40, -25, 30, 6],
  ]) {
    const p = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshBasicMaterial({
        color: new T.Color(1, 1, 1).multiplyScalar(dark ? 5 : 7),
        side: T.DoubleSide,
      }),
    );
    p.position.set(x, y, z);
    p.lookAt(0, 0, 0);
    s.add(p);
  }
  const pm = new T.PMREMGenerator(renderer),
    tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return tex;
}
export function applyLighting(T, c, mode) {
  const { scene, renderer, lights: L, ao } = c;
  ao.forEach((l) => (l.visible = false));
  scene.fog = null;
  renderer.shadowMap.enabled = true;
  L.key.visible = L.key.castShadow = true;
  L.key.intensity = 3.2;
  L.hemi.intensity = 2.1;
  scene.environment = c.env;
  if (mode === "sun") {
    scene.environment = null;
    L.key.intensity = 5;
    L.hemi.intensity = 1.1;
  } else if (mode === "ao") {
    L.key.intensity = 1.8;
    L.hemi.intensity = 1.6;
    ao.forEach((l) => {
      l.visible = true;
      l.intensity = 0.9;
    });
  } else if (mode === "fog")
    scene.fog = new T.FogExp2(c.bg(), 0.9 / (c.radius * 8));
  else if (mode === "flat") {
    scene.environment = null;
    L.key.visible = L.key.castShadow = false;
    L.hemi.intensity = 3.4;
  }
  scene.traverse((n) => {
    if (n.material)
      (Array.isArray(n.material) ? n.material : [n.material]).forEach(
        (m) => (m.needsUpdate = true),
      );
  });
}

/* ── rendu technique coté : dimensions réelles de la géométrie ── */
export function addDimensions(T, bounds, cfg) {
  const g = new T.Group(),
    mn = bounds.min,
    mx = bounds.max,
    s = bounds.getSize(new T.Vector3()),
    off = Math.max(s.x, s.y, s.z) * 0.07,
    mat = new T.LineBasicMaterial({ color: 0x59b6ff }),
    labels = [];
  g.userData.noRestyle = true;
  const line = (a, b) => {
    const l = new T.Line(
      new T.BufferGeometry().setFromPoints([
        new T.Vector3(...a),
        new T.Vector3(...b),
      ]),
      mat,
    );
    l.userData.noRestyle = true;
    g.add(l);
  };
  const f = (v) =>
    `${(v * cfg.scale).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${cfg.unit}`;
  const dim = (a, b, t, text) => {
    line(a, b);
    [a, b].forEach((p) =>
      line(
        [p[0] - t[0], p[1] - t[1], p[2] - t[2]],
        [p[0] + t[0], p[1] + t[1], p[2] + t[2]],
      ),
    );
    labels.push({
      point: new T.Vector3(
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
        (a[2] + b[2]) / 2,
      ),
      text,
    });
  };
  dim(
    [mn.x, mn.y, mx.z + off],
    [mx.x, mn.y, mx.z + off],
    [0, off * 0.3, 0],
    `L = ${f(s.x)}`,
  );
  dim(
    [mx.x + off, mn.y, mx.z + off],
    [mx.x + off, mx.y, mx.z + off],
    [off * 0.3, 0, 0],
    `H = ${f(s.y)}`,
  );
  dim(
    [mx.x + off, mn.y, mn.z],
    [mx.x + off, mn.y, mx.z],
    [off * 0.3, 0, 0],
    `P = ${f(s.z)}`,
  );
  return { group: g, labels };
}
