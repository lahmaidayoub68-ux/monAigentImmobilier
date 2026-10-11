const axes = [
  "x",
  "y",
  "origin",
  "minimum",
  "maximum",
  "tick_step",
  "subdivisions",
  "unit",
  "scale",
  "offset",
];
const coords = [
  "grid_type",
  "grid_spacing",
  "ratio",
  "functions",
  "points",
  "vectors",
  "segments",
  "lines",
  "zones",
  "annotations",
  "legend",
  "auto_frame",
];
const events = [
  "events",
  "periods",
  "groups",
  "relations",
  "time_scale",
  "annotations",
  "orientation",
  "density",
];
const tree = [
  "root",
  "events",
  "conditional",
  "weights",
  "outcomes",
  "levels",
  "calculations",
];
const nodes = [
  "components",
  "connections",
  "groups",
  "direction",
  "layout",
  "semantic_roles",
  "labels",
  "edge_kinds",
];
const objects3d = [
  "objects",
  "relationships",
  "camera",
  "exploded",
  "sections",
  "materials",
  "dimensions",
  "annotations",
  "interaction",
];

function automaticInterval(min, max, count = 8) {
  const raw = Math.abs(max - min || 1) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const factor = raw / power;
  return (factor < 1.5 ? 1 : factor < 3 ? 2 : factor < 7 ? 5 : 10) * power;
}
export function readableTickStep(min, max, requested, targetCount = 8) {
  const autoStep = automaticInterval(min, max, targetCount);
  const step = Number(requested);
  if (!Number.isFinite(step) || step <= 0) return autoStep;
  const span = Math.abs(max - min) || 1;
  const count = span / step;
  return count > Math.max(targetCount * 2.5, 18) ||
    count < Math.max(2, targetCount * 0.45)
    ? autoStep
    : step;
}

const fieldType = (key) =>
  /^(objects|components|connections|nodes|edges|events|atoms|bonds|functions|points|vectors|segments|lines|zones|annotations|groups|periods|layers|routes|markers|sections|relationships|children|outcomes|calculations|levels|criteria|pros_cons|depth_range|temperature_range|well_trajectory|geological_layers)$/.test(
    key,
  )
    ? "array"
    : /^(origin|camera|layout|style|geometry|dimensions|interaction|domain|axes|root|legend|projection)$/.test(
          key,
        )
      ? "object"
      : /^(minimum|maximum|tick_step|grid_spacing|subdivisions|ratio|scale|offset|voltage|current|zoom|weight|time_scale|flow_rate|pressure)$/.test(
            key,
          )
        ? "number"
        : "string";
const entry = (type, label, renderer, params, description) => ({
  label,
  renderer,
  parameters: [...new Set(params)],
  description,
  schema: Object.freeze({
    $id: `aigent.visual.${type}.v2`,
    type: "object",
    required: [
      "schema_version",
      "type",
      ...(renderer === "plot"
        ? ["functions"]
        : renderer === "timeline"
          ? ["events"]
          : renderer === "probtree"
            ? ["root"]
            : renderer === "assembly3d"
              ? ["objects"]
              : ["components"]),
    ],
    properties: Object.fromEntries([
      ["schema_version", { const: "2.0" }],
      ["type", { const: type }],
      ...[...new Set(params)].map((key) => [key, { type: fieldType(key) }]),
    ]),
    additionalProperties: true,
  }),
});

export const VISUAL_LIBRARY = Object.freeze({
  coordinate_system: entry(
    "coordinate_system",
    "Repère / courbe",
    "plot",
    [...axes, ...coords],
    "Axes vectoriels, graduations, grille, fonctions, zones et cadrage.",
  ),
  graph: entry(
    "graph",
    "Graphe mathématique",
    "plot",
    [...axes, ...coords],
    "Courbes et objets géométriques sur un système de coordonnées.",
  ),
  geometry: entry(
    "geometry",
    "Géométrie",
    "plot",
    [...axes, "equal_scale", ...coords],
    "Figures, constructions, angles, segments et annotations.",
  ),
  timeline: entry(
    "timeline",
    "Frise chronologique",
    "timeline",
    events,
    "Événements, périodes, groupes et échelle temporelle.",
  ),
  probability_tree: entry(
    "probability_tree",
    "Arbre de probabilités",
    "probtree",
    tree,
    "Branches conditionnelles, poids, issues et calculs de probabilités.",
  ),
  system_diagram: entry(
    "system_diagram",
    "Schéma de système",
    "diagram",
    nodes,
    "Composants métier, flux de données et dépendances.",
  ),
  process_diagram: entry(
    "process_diagram",
    "Diagramme de processus",
    "diagram",
    [...nodes, "swimlanes", "branch_conditions", "start_end"],
    "Étapes ordonnées, conditions et sorties.",
  ),
  flowchart: entry(
    "flowchart",
    "Organigramme",
    "diagram",
    [...nodes, "branch_conditions", "start_end", "direction"],
    "Flux orienté avec décisions, branches et fins.",
  ),
  architecture_diagram: entry(
    "architecture_diagram",
    "Architecture",
    "diagram",
    [...nodes, "layers", "boundaries", "protocols", "direction"],
    "Couches, services, frontières et protocoles.",
  ),
  scientific_diagram: entry(
    "scientific_diagram",
    "Schéma scientifique",
    "diagram",
    [
      ...nodes,
      "axes",
      "units",
      "forces",
      "flows",
      "dimensions",
      "legend",
      "annotations",
      "groups",
    ],
    "Schéma de phénomène avec conventions, grandeurs et annotations scientifiques.",
  ),
  scientific_cross_section: entry(
    "scientific_cross_section",
    "Coupe scientifique",
    "diagram",
    [
      ...nodes,
      "layers",
      "depth_range",
      "temperature_range",
      "scale",
      "boundaries",
      "annotations",
    ],
    "Coupe stratifiée avec profondeur, interfaces et repères mesurés.",
  ),
  technical_plan: entry(
    "technical_plan",
    "Plan technique",
    "diagram",
    [
      ...nodes,
      "dimensions",
      "scale",
      "orientation",
      "equipment_rows",
      "aisles",
      "legend",
      "title_block",
    ],
    "Plan orthogonal coté avec équipements, repères, échelle et cartouche.",
  ),
  site_plan: entry(
    "site_plan",
    "Plan d'implantation",
    "diagram",
    [
      ...nodes,
      "coordinates",
      "boundaries",
      "routes",
      "orientation",
      "scale",
      "legend",
    ],
    "Implantation des zones et équipements à partir de positions fournies.",
  ),
  piping_instrumentation: entry(
    "piping_instrumentation",
    "Tuyauterie et instrumentation",
    "diagram",
    [
      ...nodes,
      "pipes",
      "valves",
      "instruments",
      "flow_direction",
      "pressure_tags",
      "temperature_tags",
      "legend",
    ],
    "P&ID pédagogique avec conduites, vannes, instruments et circuits distincts.",
  ),
  electrical_single_line: entry(
    "electrical_single_line",
    "Schéma électrique unifilaire",
    "diagram",
    [
      ...nodes,
      "voltage_levels",
      "breakers",
      "transformers",
      "protection",
      "busbars",
      "legend",
    ],
    "Liaisons électriques et protections avec symboles normalisés simplifiés.",
  ),
  heat_flow_diagram: entry(
    "heat_flow_diagram",
    "Flux thermique",
    "diagram",
    [
      ...nodes,
      "heat_sources",
      "exchangers",
      "temperature_tags",
      "flow_direction",
      "heat_losses",
      "legend",
    ],
    "Transferts thermiques orientés entre sources, échangeurs et récepteurs.",
  ),
  energy_sankey: entry(
    "energy_sankey",
    "Bilan énergétique Sankey",
    "diagram",
    [
      ...nodes,
      "energy_inputs",
      "energy_outputs",
      "losses",
      "units",
      "balance",
      "flows",
    ],
    "Flux proportionnels aux puissances fournies, pertes et bilan vérifiable.",
  ),
  geographic_map: entry(
    "geographic_map",
    "Carte géographique",
    "map",
    [
      "projection",
      "extent",
      "layers",
      "markers",
      "routes",
      "legend",
      "scale",
      "provenance",
    ],
    "Carte vectorielle qui n'affiche que des coordonnées et couches présentes dans les données.",
  ),
  comparison_matrix: entry(
    "comparison_matrix",
    "Matrice comparative",
    "doc",
    ["options", "criteria", "scores", "weights", "evidence", "uncertainties"],
    "Comparaison structurée avec critères, preuves, poids et limites.",
  ),
  circuit_diagram: entry(
    "circuit_diagram",
    "Circuit électrique",
    "diagram",
    [...nodes, "voltage", "current", "polarity", "ground", "wire_style"],
    "Sources, composants, polarité et connexions électriques.",
  ),
  biological_diagram: entry(
    "biological_diagram",
    "Schéma biologique",
    "diagram",
    [...nodes, "organelles", "membranes", "flows", "scale"],
    "Structures biologiques et processus associés.",
  ),
  anatomy_diagram: entry(
    "anatomy_diagram",
    "Anatomie",
    "diagram",
    [...nodes, "body_region", "orientation", "layers", "callouts"],
    "Repères anatomiques, systèmes et annotations.",
  ),
  chemistry_structure: entry(
    "chemistry_structure",
    "Structure chimique",
    "molecule",
    [
      "atoms",
      "bonds",
      "geometry",
      "angles",
      "charges",
      "isotopes",
      "dimension",
      "labels",
      "conformation",
    ],
    "Atomes, liaisons, charges et géométrie moléculaire.",
  ),
  molecular_3d: entry(
    "molecular_3d",
    "Molécule 3D",
    "molecule3d",
    [
      "atoms",
      "bonds",
      "geometry",
      "angles",
      "charges",
      "isotopes",
      "dimension",
      "camera",
      "labels",
    ],
    "Structure moléculaire spatiale en boules et bâtonnets.",
  ),
  mechanical_diagram: entry(
    "mechanical_diagram",
    "Mécanique",
    "diagram",
    [...nodes, "forces", "motion", "constraints", "dimensions"],
    "Pièces, liaisons mécaniques, forces et mouvement.",
  ),
  exploded_view: entry(
    "exploded_view",
    "Vue éclatée",
    "assembly3d",
    objects3d,
    "Pièces séparées suivant un axe, avec relations et annotations.",
  ),
  mechanical_3d: entry(
    "mechanical_3d",
    "Objet mécanique 3D",
    "assembly3d",
    objects3d,
    "Assemblage 3D fondé sur les pièces et leur rôle physique.",
  ),
  technical_3d: {
    ...entry(
      "technical_3d",
      "Scène technique 3D",
      "assembly3d",
      [
        ...objects3d,
        "semantic_parts",
        "equipment_rows",
        "aisles",
        "cable_routes",
        "airflow",
        "cooling_zones",
        "component_ids",
        "subassemblies",
        "service_clearance",
      ],
      "Scène 3D construite à partir de pièces sémantiques avec géométries dédiées par domaine.",
    ),
    vocabulary: {
      objectKinds: [
        "rack",
        "server",
        "network_switch",
        "cooling_unit",
        "data_center_floor",
        "containment",
        "reactor_vessel",
        "reactor_core",
        "fuel_assembly",
        "steam_generator",
        "pressurizer",
        "primary_pump",
        "turbine",
        "alternator",
        "condenser",
        "cooling_tower",
        "transformer",
        "aircraft_fuselage",
        "aircraft_wing",
        "tail_fin",
        "jet_engine",
        "drone_frame",
        "building_shell",
        "heart",
        "atom",
      ],
    },
  },
  geothermal_subsurface: {
    ...entry(
      "geothermal_subsurface",
      "Sous-sol géothermique",
      "assembly3d",
      [
        ...objects3d,
        "depth_range",
        "temperature_range",
        "flow_rate",
        "pressure",
        "geological_layers",
        "well_trajectory",
        "scale_note",
      ],
      "Terrain, couches, réservoir, puits et circulation uniquement lorsqu'ils sont décrits par le document.",
    ),
    vocabulary: {
      objectKinds: [
        "ground_surface",
        "geological_layer",
        "reservoir",
        "injection_well",
        "production_well",
        "thermal_flow",
        "surface_plant",
        "heat_network",
      ],
      relationships: [
        "injects_into",
        "produces_from",
        "flows_through",
        "heats",
        "connects_to",
      ],
    },
  },
  mind_map: entry(
    "mind_map",
    "Carte mentale",
    "diagram",
    [...nodes, "root", "branches", "radial_layout", "colors"],
    "Idée centrale et branches sémantiques.",
  ),
  concept_map: entry(
    "concept_map",
    "Carte conceptuelle",
    "diagram",
    [...nodes, "propositions", "relations", "groups"],
    "Concepts reliés par des relations nommées.",
  ),
  hierarchy: entry(
    "hierarchy",
    "Hiérarchie",
    "diagram",
    [...nodes, "root", "levels", "direction"],
    "Niveaux parent-enfant et regroupements.",
  ),
  network: entry(
    "network",
    "Réseau",
    "diagram",
    [...nodes, "connections", "weights", "clusters", "layout"],
    "Nœuds, relations, poids et communautés.",
  ),
  comparison_diagram: entry(
    "comparison_diagram",
    "Comparaison visuelle",
    "diagram",
    [...nodes, "criteria", "dimensions", "pros_cons", "layout"],
    "Options organisées selon les critères comparés.",
  ),
  map: entry(
    "map",
    "Carte",
    "map",
    ["projection", "extent", "layers", "markers", "routes", "legend", "scale"],
    "Carte spatiale avec couches, marqueurs et itinéraires.",
  ),
  infographic: entry(
    "infographic",
    "Infographie",
    "doc",
    ["sections", "metrics", "charts", "callouts", "palette", "layout"],
    "Synthèse visuelle structurée en blocs sémantiques.",
  ),
});

export const VISUAL_TYPE_ALIASES = Object.freeze({
  plot: "coordinate_system",
  function: "coordinate_system",
  coordinate: "coordinate_system",
  probtree: "probability_tree",
  tree: "probability_tree",
  timeline: "timeline",
  diagram: "system_diagram",
  system: "system_diagram",
  flowchart: "flowchart",
  mindmap: "mind_map",
  "mind-map": "mind_map",
  chemistry: "chemistry_structure",
  molecule: "chemistry_structure",
  "molecular-3d": "molecular_3d",
  "3d": "technical_3d",
  scene_3d: "technical_3d",
  assembly: "exploded_view",
  mechanical: "mechanical_3d",
  "p&id": "piping_instrumentation",
  pid: "piping_instrumentation",
  sankey: "energy_sankey",
  cross_section: "scientific_cross_section",
  plan: "technical_plan",
  site_map: "site_plan",
  electrical: "electrical_single_line",
  heat_flow: "heat_flow_diagram",
});

const TYPE_SET = new Set(Object.keys(VISUAL_LIBRARY));
const ID = /^[\p{L}\p{N}_-]{1,48}$/u;
const safeNumber = (v, fallback, min = -1e6, max = 1e6) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const text = (v, max = 240) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const ref = (v) => (typeof v === "string" && ID.test(v) ? v : "");

function normalizeCoordinates(raw) {
  const p = raw.axes || raw.coordinates || {};
  const rawPoints = Array.isArray(raw.points) ? raw.points : [];
  const suppliedX =
    Array.isArray(raw.domain?.x) ||
    Number.isFinite(Number(p.minimum)) ||
    Number.isFinite(Number(p.maximum));
  const finiteX = rawPoints
    .map((point) => safeNumber(point?.x, NaN))
    .filter(Number.isFinite);
  const derivedX = finiteX.length
    ? [Math.min(...finiteX), Math.max(...finiteX)]
    : [-10, 10];
  const xSpan =
    derivedX[1] - derivedX[0] || Math.max(Math.abs(derivedX[0]) * 0.2, 1);
  const domainX = Array.isArray(raw.domain?.x)
    ? raw.domain.x
    : suppliedX
      ? [p.minimum ?? -5, p.maximum ?? 5]
      : [derivedX[0] - xSpan * 0.08, derivedX[1] + xSpan * 0.08];
  const domainY = Array.isArray(raw.domain?.y) ? raw.domain.y : undefined;
  const x = [safeNumber(domainX[0], -5), safeNumber(domainX[1], 5)];
  const y = domainY
    ? [safeNumber(domainY[0], -5), safeNumber(domainY[1], 5)]
    : undefined;
  if (!(x[0] < x[1]) || (y && !(y[0] < y[1])))
    return {
      ok: false,
      errors: ["Les bornes du repère doivent être croissantes."],
      warnings: [],
    };
  const type = ["grid", "none", "simple", "graduated", "subdivided"].includes(
    raw.grid_type,
  )
    ? raw.grid_type
    : "grid";
  const functions = (Array.isArray(raw.functions) ? raw.functions : [])
    .slice(0, 8)
    .map((f, i) => ({
      id: ref(f?.id) || `f${i + 1}`,
      expr: text(f?.expr, 240),
      label: text(f?.label, 60) || `f${i + 1}(x)`,
      color: f?.color,
    }));
  const points = rawPoints
    .slice(0, 100)
    .map((v, i) => ({
      id: ref(v?.id) || `P${i + 1}`,
      label: text(v?.label, 60),
      x: safeNumber(v?.x, NaN),
      y: safeNumber(v?.y, NaN),
      color: v?.color,
    }))
    .filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
  const finiteY = points.map((point) => point.y);
  const derivedY = finiteY.length
    ? [Math.min(...finiteY), Math.max(...finiteY)]
    : [-10, 10];
  const ySpan =
    derivedY[1] - derivedY[0] || Math.max(Math.abs(derivedY[0]) * 0.2, 1);
  const inferredY = [derivedY[0] - ySpan * 0.12, derivedY[1] + ySpan * 0.12];
  return {
    ok: true,
    warnings: [],
    artifact: {
      ...raw,
      __normalizedVisual: true,
      type: "plot",
      xLabel: text(p.x?.label || raw.xLabel, 60) || "x",
      yLabel: text(p.y?.label || raw.yLabel, 60) || "y",
      domain: {
        x,
        ...(y
          ? { y }
          : points.length && !raw.functions?.length
            ? { y: inferredY }
            : {}),
      },
      axes: raw.axes?.visible !== false && raw.axes !== false,
      grid: type !== "none" && raw.grid !== false,
      gridType: type,
      gridSpacing: safeNumber(raw.grid_spacing, 1, 0.0001, 1e6),
      subdivisions: Math.round(safeNumber(raw.subdivisions, 0, 0, 20)),
      equal:
        raw.ratio === "equal" || raw.equal_scale === true || raw.equal === true,
      origin: { x: safeNumber(p.origin?.x, 0), y: safeNumber(p.origin?.y, 0) },
      functions,
      points,
      lines: Array.isArray(raw.lines) ? raw.lines.slice(0, 24) : [],
      vectors: Array.isArray(raw.vectors) ? raw.vectors.slice(0, 24) : [],
      annotations: Array.isArray(raw.annotations)
        ? raw.annotations.slice(0, 40)
        : [],
    },
  };
}

function normalizeDiagram(raw, kind) {
  const semanticType = TYPE_SET.has(raw.semanticType) ? raw.semanticType : kind;
  const rawNodes = Array.isArray(raw.components)
    ? raw.components
    : Array.isArray(raw.nodes)
      ? raw.nodes
      : [];
  const seen = new Set();
  const warnings = [];
  const nodes = rawNodes
    .slice(0, 80)
    .map((n, i) => {
      const id = ref(n?.id) || `n${i + 1}`;
      if (seen.has(id)) return null;
      seen.add(id);
      const semanticKind = text(n?.kind || n?.type, 40);
      const kind = /decision|condition|choice/i.test(semanticKind)
        ? "decision"
        : /sensor|measurement|signal|data|atom|molecule/i.test(semanticKind)
          ? "data"
          : /motor|actuator|person|actor/i.test(semanticKind)
            ? "actor"
            : /service|server|api|controller|software|fusion/i.test(
                  semanticKind,
                )
              ? "service"
              : /start|finish|end/i.test(semanticKind)
                ? "capsule"
                : "process";
      return {
        id,
        label: text(n?.label || n?.name, 100) || `Élément ${i + 1}`,
        detail: text(n?.detail || n?.description, 300),
        group: text(n?.group || n?.layer, 48),
        kind,
        semanticKind,
        parent: ref(n?.parent) || null,
      };
    })
    .filter(Boolean);
  nodes.forEach((node) => {
    if (node.parent && (!seen.has(node.parent) || node.parent === node.id)) {
      warnings.push(
        `Parent ignoré pour ${node.id} : référence inconnue ou circulaire.`,
      );
      node.parent = null;
    }
  });
  const rawEdges = Array.isArray(raw.connections)
    ? raw.connections
    : Array.isArray(raw.edges)
      ? raw.edges
      : [];
  if (semanticType === "hierarchy") {
    for (const node of nodes)
      if (
        node.parent &&
        !rawEdges.some(
          (edge) =>
            ref(edge?.from) === node.parent && ref(edge?.to) === node.id,
        )
      )
        rawEdges.push({ from: node.parent, to: node.id, kind: "parent_of" });
  }
  const edges = rawEdges
    .slice(0, 160)
    .map((edge) => ({
      from: ref(edge?.from),
      to: ref(edge?.to),
      label: text(edge?.label || edge?.kind, 80),
      relation: text(edge?.relation || edge?.type || edge?.kind, 48),
      weight: Number.isFinite(Number(edge?.weight ?? edge?.value))
        ? Math.max(0, safeNumber(edge?.weight ?? edge?.value, 0, 0, 1e12))
        : undefined,
    }))
    .filter((edge) => {
      if (seen.has(edge.from) && seen.has(edge.to) && edge.from !== edge.to)
        return true;
      warnings.push(
        `Connexion ignorée : ${edge.from || "?"} → ${edge.to || "?"}.`,
      );
      return false;
    });
  if (nodes.length < 2)
    return {
      ok: false,
      errors: ["Un schéma relationnel nécessite au moins deux éléments."],
      warnings,
    };
  const direction = raw.layout?.direction || raw.direction;
  const domain = raw.domain || raw.document?.domain;
  return {
    ok: true,
    warnings,
    artifact: {
      ...raw,
      __normalizedVisual: true,
      type: "diagram",
      semanticType,
      title:
        text(raw.document?.title || raw.title, 120) ||
        VISUAL_LIBRARY[kind].label,
      summary: text(raw.document?.purpose || raw.summary, 500),
      rootId:
        ref(
          raw.rootId ||
            (typeof raw.root === "string" ? raw.root : raw.root?.id),
        ) ||
        nodes.find((node) => !node.parent)?.id ||
        "",
      direction: direction === "TB" || direction === "vertical" ? "TB" : "LR",
      layout:
        raw.layout?.composition === "radial" ||
        semanticType === "mind_map" ||
        semanticType === "network"
          ? "force"
          : "layered",
      visualStyle: raw.style?.family || "technical_linear",
      domain,
      density: raw.layout?.density || "medium",
      nodes,
      edges,
    },
  };
}

function normalizeAssembly(raw, kind) {
  const rawObjects = Array.isArray(raw.objects)
    ? raw.objects
    : Array.isArray(raw.components)
      ? raw.components
      : kind === "molecular_3d" && Array.isArray(raw.atoms)
        ? raw.atoms.map((atom) => ({
            ...atom,
            kind: "atom",
            primitive: "atom",
            label: atom.element || atom.label,
          }))
        : [];
  const ids = new Set();
  const objects = rawObjects
    .slice(0, 80)
    .map((object, i) => {
      const id = ref(object?.id) || `part${i + 1}`;
      if (ids.has(id)) return null;
      ids.add(id);
      const geometry = object?.geometry || {};
      const position = object?.position || object || {};
      const scale = Array.isArray(geometry.scale) ? geometry.scale : [1, 1, 1];
      return {
        id,
        label: text(object?.label || object?.name, 90) || `Pièce ${i + 1}`,
        detail: text(object?.detail || object?.semantic_role, 220),
        kind: text(object?.kind || object?.type, 48),
        primitive: text(geometry.primitive || object?.primitive, 32) || "box",
        ...Object.fromEntries(
          [
            "role",
            "parent",
            "side",
            "placement",
            "major",
            "rotation",
            "pattern",
            "mirror",
            "params",
          ]
            .filter((k) => object?.[k] !== undefined)
            .map((k) => [k, object[k]]),
        ),
        scale: [0, 1, 2].map((index) => safeNumber(scale[index], 1, 0.05, 20)),
        position: {
          x: safeNumber(position.x, 0, -100, 100),
          y: safeNumber(position.y, 0, -100, 100),
          z: safeNumber(position.z, 0, -100, 100),
        },
        positionProvided:
          typeof object?.positionProvided === "boolean"
            ? object.positionProvided
            : !!object?.position ||
              [object?.x, object?.y, object?.z].some((value) =>
                Number.isFinite(Number(value)),
              ),
        color: /^#[0-9a-f]{6}$/i.test(object?.color || "")
          ? object.color
          : undefined,
        depthRange: Array.isArray(object?.depthRange)
          ? object.depthRange.slice(0, 2).map((value) => safeNumber(value, 0))
          : undefined,
        temperatureRange: Array.isArray(object?.temperatureRange)
          ? object.temperatureRange
              .slice(0, 2)
              .map((value) => safeNumber(value, 0))
          : undefined,
        dimensions:
          object?.dimensions && typeof object.dimensions === "object"
            ? object.dimensions
            : undefined,
        material: text(object?.material, 48) || undefined,
        metadata:
          object?.metadata && typeof object.metadata === "object"
            ? object.metadata
            : undefined,
      };
    })
    .filter(Boolean);
  if (objects.length < 2)
    return {
      ok: false,
      errors: ["Une scène technique doit contenir au moins deux objets."],
      warnings: [],
    };
  const warnings = [];
  const rawRelations = Array.isArray(raw.relationships)
    ? raw.relationships
    : Array.isArray(raw.connections)
      ? raw.connections
      : kind === "molecular_3d"
        ? raw.bonds
        : [];
  const relationships = (Array.isArray(rawRelations) ? rawRelations : [])
    .slice(0, 160)
    .map((item) => ({
      from: ref(item?.from || item?.a),
      to: ref(item?.to || item?.b),
      type: text(item?.type || item?.kind || item?.order, 48),
      label: text(item?.label, 80),
    }))
    .filter((item) => {
      if (ids.has(item.from) && ids.has(item.to) && item.from !== item.to)
        return true;
      warnings.push(
        `Relation 3D ignorée : ${item.from || "?"} → ${item.to || "?"}.`,
      );
      return false;
    });
  const unresolved = objects.filter((object) => !object.positionProvided);
  if (unresolved.length) {
    const byId = new Map(objects.map((object) => [object.id, object]));
    const depth = new Map(),
      children = new Map();
    relationships.forEach((link) => {
      if (!byId.has(link.from) || !byId.has(link.to)) return;
      if (!children.has(link.from)) children.set(link.from, []);
      children.get(link.from).push(link.to);
    });
    const roots = objects.filter(
      (object) =>
        !relationships.some(
          (link) => link.to === object.id && link.from !== object.id,
        ),
    );
    const queue = roots.map((object) => [object.id, 0]);
    while (queue.length) {
      const [id, level] = queue.shift();
      if (depth.has(id)) continue;
      depth.set(id, level);
      (children.get(id) || []).forEach((child) =>
        queue.push([child, level + 1]),
      );
    }
    objects.forEach((object, index) => {
      if (object.positionProvided) return;
      const level = depth.get(object.id) ?? Math.floor(index / 4),
        siblings = objects.filter(
          (candidate) =>
            (depth.get(candidate.id) ??
              Math.floor(objects.indexOf(candidate) / 4)) === level,
        ),
        row = siblings.indexOf(object);
      object.position = {
        x: level * 2.8,
        y: 0,
        z: (row - (siblings.length - 1) / 2) * 2.2,
      };
    });
  }
  const layers = (Array.isArray(raw.layers) ? raw.layers : [])
    .slice(0, 12)
    .map((layer, index) => ({
      id: ref(layer?.id) || `layer${index + 1}`,
      label: text(layer?.label, 60) || `Couche ${index + 1}`,
      objectIds: (Array.isArray(layer?.objectIds) ? layer.objectIds : [])
        .map(ref)
        .filter((id) => ids.has(id))
        .slice(0, 80),
      visible: layer?.visible !== false,
      opacity: safeNumber(layer?.opacity, 1, 0, 1),
    }))
    .filter((layer) => layer.objectIds.length);
  return {
    ok: true,
    warnings,
    artifact: {
      __normalizedVisual: true,
      type: "scene3d",
      title:
        text(raw.document?.title || raw.title, 120) ||
        VISUAL_LIBRARY[kind].label,
      summary: text(raw.document?.purpose || raw.summary, 500),
      preset: kind === "geothermal_subsurface" ? "geothermal" : "assembly",
      assemblyType: kind,
      detailLevel: raw.detailLevel,
      domain: raw.domain,
      scaleNote: text(raw.scale_note || raw.scaleNote, 180),
      objects,
      relationships,
      layers,
      exploded:
        raw.layout?.composition === "centered_exploded_view" ||
        raw.exploded === true,
      camera: raw.camera || {},
      annotations: raw.annotations || [],
      interaction: raw.interaction || {},
    },
  };
}

/** Validates v2 semantic documents and adapts them to the existing renderer contract. */
export function normalizeVisualDocument(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const doc =
    input.artifact && typeof input.artifact === "object"
      ? input.artifact
      : input;
  if (
    [
      "sequence_diagram",
      "state_diagram",
      "er_diagram",
      "class_diagram",
      "quadrant",
      "venn",
      "gantt",
      "sankey_diagram",
      "electrical_circuit",
      "hydraulic_circuit",
      "heatmap",
      "forces_diagram",
      "transit_map",
    ].includes(doc.semanticType)
  )
    return null;
  if (doc.__normalizedVisual === true) return null;
  const rawType = String(
    doc.type || doc.document?.type || "",
  ).toLocaleLowerCase("fr");
  const type = VISUAL_TYPE_ALIASES[rawType] || rawType;
  if (
    !TYPE_SET.has(type) ||
    !(
      doc.schema_version ||
      doc.document ||
      rawType in VISUAL_TYPE_ALIASES ||
      type !== rawType
    )
  )
    return null;
  if (type === "coordinate_system" || type === "graph" || type === "geometry")
    return normalizeCoordinates(doc);
  if (type === "timeline") {
    const events = (Array.isArray(doc.events) ? doc.events : [])
      .slice(0, 100)
      .map((event) => ({
        ...event,
        label: text(event?.label, 120),
        date: text(event?.date, 48),
        detail: text(event?.detail, 240),
      }))
      .filter((event) => event.label);
    if (events.length < 2)
      return {
        ok: false,
        errors: ["Une frise doit contenir au moins deux événements nommés."],
        warnings: [],
      };
    return {
      ok: true,
      warnings: [],
      artifact: {
        ...doc,
        __normalizedVisual: true,
        type: "timeline",
        title:
          text(doc.document?.title || doc.title, 120) ||
          VISUAL_LIBRARY.timeline.label,
        events,
      },
    };
  }
  if (type === "geographic_map" || type === "map")
    return normalizeGeographicMap(doc);
  if (type === "comparison_matrix") {
    const options = (Array.isArray(doc.options) ? doc.options : [])
      .slice(0, 12)
      .map((option) =>
        typeof option === "string" ? option : text(option?.label, 80),
      )
      .filter(Boolean);
    const criteria = (Array.isArray(doc.criteria) ? doc.criteria : [])
      .slice(0, 30)
      .map((criterion) =>
        typeof criterion === "string"
          ? criterion
          : text(criterion?.label || criterion?.name, 100),
      )
      .filter(Boolean);
    if (!options.length || !criteria.length)
      return {
        ok: false,
        errors: [
          "Une matrice comparative doit définir des options et des critères.",
        ],
        warnings: [],
      };
    const values =
      doc.values && typeof doc.values === "object" ? doc.values : {};
    return {
      ok: true,
      warnings: [],
      artifact: {
        __normalizedVisual: true,
        type: "sheet",
        title:
          text(doc.document?.title || doc.title, 120) ||
          VISUAL_LIBRARY.comparison_matrix.label,
        columns: ["Critère", ...options],
        rows: criteria.map((criterion) => [
          criterion,
          ...options.map((option) =>
            text(values?.[criterion]?.[option] ?? "—", 160),
          ),
        ]),
      },
    };
  }
  if (type === "probability_tree") {
    const cleanNode = (node, depth = 0) => ({
      label: text(node?.label, 80) || "Issue",
      p:
        typeof node?.p === "number" || typeof node?.p === "string"
          ? node.p
          : undefined,
      children:
        depth < 5 && Array.isArray(node?.children)
          ? node.children
              .slice(0, 8)
              .map((child) => cleanNode(child, depth + 1))
          : [],
    });
    const root = cleanNode(doc.root || {});
    if (!root.children.length)
      return {
        ok: false,
        errors: [
          "Un arbre de probabilités doit comporter au moins une branche.",
        ],
        warnings: [],
      };
    return {
      ok: true,
      warnings: [],
      artifact: {
        ...doc,
        __normalizedVisual: true,
        type: "probtree",
        title:
          text(doc.document?.title || doc.title, 120) ||
          VISUAL_LIBRARY.probability_tree.label,
        root,
      },
    };
  }
  if (
    [
      "exploded_view",
      "mechanical_3d",
      "technical_3d",
      "molecular_3d",
      "geothermal_subsurface",
    ].includes(type)
  )
    return normalizeAssembly(doc, type);
  if (type === "chemistry_structure") return normalizeMolecule(doc);
  return normalizeDiagram(doc, type);
}

function normalizeMolecule(raw) {
  const atoms = Array.isArray(raw.atoms) ? raw.atoms.slice(0, 100) : [];
  const ids = new Set(),
    warnings = [];
  const nodes = atoms
    .map((atom, index) => {
      const id = ref(atom?.id) || `a${index + 1}`;
      if (ids.has(id)) {
        warnings.push(`Atome dupliqué ignoré : ${id}.`);
        return null;
      }
      ids.add(id);
      const charge = safeNumber(atom?.charge, 0, -8, 8);
      return {
        id,
        label: `${text(atom?.element, 3) || "C"}${charge ? ` ${charge > 0 ? "+" : "−"}${Math.abs(charge)}` : ""}`,
        detail: text(atom?.label, 60),
        kind: "data",
        group: text(atom?.element, 3),
      };
    })
    .filter(Boolean);
  if (nodes.length < 2)
    return {
      ok: false,
      errors: ["Une structure chimique nécessite au moins deux atomes."],
      warnings,
    };
  const edges = (Array.isArray(raw.bonds) ? raw.bonds : [])
    .slice(0, 160)
    .map((bond) => ({
      from: ref(bond?.from || bond?.a),
      to: ref(bond?.to || bond?.b),
      label: String(bond?.order || bond?.type || "").slice(0, 16),
      relation: "contains",
    }))
    .filter((bond) => {
      if (ids.has(bond.from) && ids.has(bond.to) && bond.from !== bond.to)
        return true;
      warnings.push(
        `Liaison ignorée : ${bond.from || "?"} → ${bond.to || "?"}.`,
      );
      return false;
    });
  return {
    ok: true,
    warnings,
    artifact: {
      __normalizedVisual: true,
      type: "diagram",
      semanticType: "chemistry_structure",
      title:
        text(raw.document?.title || raw.title, 120) || "Structure chimique",
      summary: text(raw.summary || raw.document?.purpose, 500),
      direction: "LR",
      layout: "force",
      nodes,
      edges,
      molecule: {
        dimension: raw.dimension === "3d" ? "3d" : "2d",
        geometry: raw.geometry || "",
        angles: raw.angles || [],
      },
    },
  };
}

function normalizeGeographicMap(raw) {
  const source = raw.data || raw;
  const markers = (Array.isArray(source.markers) ? source.markers : [])
    .slice(0, 300)
    .map((marker, index) => {
      const longitude = safeNumber(
        marker?.longitude ?? marker?.lon ?? marker?.x,
        NaN,
        -180,
        180,
      );
      const latitude = safeNumber(
        marker?.latitude ?? marker?.lat ?? marker?.y,
        NaN,
        -90,
        90,
      );
      return {
        id: ref(marker?.id) || `place${index + 1}`,
        label: text(marker?.label || marker?.name, 100),
        detail: text(marker?.detail || marker?.description, 240),
        longitude,
        latitude,
        group: text(marker?.group || marker?.category, 48),
      };
    })
    .filter(
      (marker) =>
        marker.label &&
        Number.isFinite(marker.longitude) &&
        Number.isFinite(marker.latitude),
    );
  if (!markers.length)
    return {
      ok: false,
      errors: [
        "Une carte nécessite au moins un marqueur avec des coordonnées valides.",
      ],
      warnings: [],
    };
  const routes = (Array.isArray(source.routes) ? source.routes : [])
    .slice(0, 100)
    .map((route) => ({
      id: ref(route?.id) || "route",
      label: text(route?.label, 100),
      points: (Array.isArray(route?.points) ? route.points : [])
        .slice(0, 100)
        .map((point) => [
          safeNumber(
            point?.longitude ?? point?.lon ?? point?.[0],
            NaN,
            -180,
            180,
          ),
          safeNumber(point?.latitude ?? point?.lat ?? point?.[1], NaN, -90, 90),
        ])
        .filter((point) => point.every(Number.isFinite)),
    }))
    .filter((route) => route.points.length >= 2);
  return {
    ok: true,
    warnings: [],
    artifact: {
      __normalizedVisual: true,
      type: "map",
      title:
        text(raw.document?.title || raw.title, 120) ||
        VISUAL_LIBRARY.geographic_map.label,
      summary: text(raw.summary || raw.document?.purpose, 400),
      projection:
        source.projection === "mercator" ? "mercator" : "equirectangular",
      markers,
      routes,
      legend: Array.isArray(source.legend) ? source.legend.slice(0, 20) : [],
      scale: text(source.scale, 80),
      provenance: text(
        raw.provenance?.sourceDescription || raw.provenance,
        220,
      ),
    },
  };
}

export function isVisualType(type) {
  return TYPE_SET.has(VISUAL_TYPE_ALIASES[type] || type);
}
