import test from "node:test";
import assert from "node:assert/strict";
import { analyzeVisualNeed, enforceVisualSubject, selectRelevantConversationTurns } from "../services/aigentVisualDecision.js";
import { VISUAL_LIBRARY, normalizeVisualDocument, readableTickStep } from "../public/artifacts/visual-registry.js";
import { normalizeScientificText, tokenizeScientificText } from "../public/artifacts/scientific-text.js";
import { scrubAnswer, sanitizeEngineArtifact, parseAigentBlock, ENGINE_CONTRACT, ENGINE_TYPES_GUIDE } from "../services/aigentArtifactServer.js";
import { extractMarkdownDatasets, buildDatasetPlotSections, estimateThermalPower } from "../services/aigentDataIntegrity.js";

test("decision engine skips greetings and selects visual modes by topic", () => {
  assert.equal(analyzeVisualNeed("Bonjour !").visual_need, "none");
  assert.equal(analyzeVisualNeed("Explique le second degré : signes et variations").recommended_types[0], "coordinate_system");
  assert.equal(analyzeVisualNeed("Fais un schéma 3D d'un moteur électrique").open_panel, true);
  assert.equal(analyzeVisualNeed("Architecture d'un drone autonome").recommended_types[0], "system_diagram");
});

test("visual library exposes per-type schemas and domain-specific controls", () => {
  assert.ok(Object.keys(VISUAL_LIBRARY).length >= 20);
  assert.equal(VISUAL_LIBRARY.mechanical_3d.schema.$id, "aigent.visual.mechanical_3d.v2");
  assert.ok(VISUAL_LIBRARY.coordinate_system.parameters.includes("grid_type"));
  assert.ok(VISUAL_LIBRARY.probability_tree.parameters.includes("conditional"));
  assert.ok(VISUAL_LIBRARY.geothermal_subsurface.parameters.includes("well_trajectory"));
  assert.equal(analyzeVisualNeed("Étude d'un réservoir géothermique avec deux puits").recommended_types[0], "geothermal_subsurface");
  for (const type of ["scientific_diagram", "scientific_cross_section", "technical_plan", "site_plan", "piping_instrumentation", "electrical_single_line", "heat_flow_diagram", "energy_sankey", "geographic_map", "comparison_matrix"]) assert.ok(VISUAL_LIBRARY[type]?.schema?.$id, `schema missing: ${type}`);
});

test("diagram sanitizer keeps specialized visual semantics and proportional flow weights", () => {
  const diagram = sanitizeEngineArtifact("diagram", { semanticType: "energy_sankey", nodes: [{ id: "source", label: "Énergie" }, { id: "loss", label: "Pertes" }], edges: [{ from: "source", to: "loss", weight: 42 }] });
  assert.equal(diagram.semanticType, "energy_sankey");
  assert.equal(diagram.edges[0].weight, 42);
});

test("geographic map and comparison matrix have their own validated adapters", () => {
  const map = normalizeVisualDocument({ schema_version: "2.0", type: "geographic_map", markers: [{ id: "a", label: "Site A", latitude: 48.8, longitude: 2.3 }] });
  assert.equal(map.ok, true);
  assert.equal(map.artifact.type, "map");
  assert.equal(normalizeVisualDocument({ schema_version: "2.0", type: "geographic_map", markers: [{ label: "Sans coordonnées" }] }).ok, false);
  const matrix = normalizeVisualDocument({ schema_version: "2.0", type: "comparison_matrix", options: ["A", "B"], criteria: ["Coût", "Délai"], values: { Coût: { A: "bas", B: "haut" } } });
  assert.equal(matrix.artifact.type, "sheet");
  assert.deepEqual(matrix.artifact.rows[0], ["Coût", "bas", "haut"]);
});


test("geothermal 3D document keeps provided objects and rejects absent semantics", () => {
  const normalized = normalizeVisualDocument({ schema_version: "2.0", type: "geothermal_subsurface", document: { title: "Coupe du réservoir" }, objects: [
    { id: "reservoir", label: "Réservoir", kind: "reservoir", geometry: { primitive: "box", scale: [4, 1, 2] }, position: { x: 0, y: -3, z: 0 }, depthRange: [2800, 3600] },
    { id: "injection", label: "Puits d'injection", kind: "injection_well", geometry: { primitive: "cylinder", scale: [0.2, 3, 0.2] }, position: { x: -1, y: -2, z: 0 }, depthRange: [0, 3600] },
  ], relationships: [{ from: "injection", to: "reservoir", type: "injects_into" }] });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.artifact.preset, "geothermal");
  assert.equal(normalized.artifact.objects.length, 2);
  assert.equal(normalizeVisualDocument({ schema_version: "2.0", type: "geothermal_subsurface", objects: [] }).ok, false);
});

test("3D semantic detail and style selector contract remain topic-specific and narrative-rich", () => {
  const scene = sanitizeEngineArtifact("scene3d", {
    preset: "assembly", assemblyType: "pressurized_water_reactor",
    objects: [
      { id: "vessel", kind: "reactor_vessel", label: "Cuve", material: "acier" },
      { id: "core", kind: "reactor_core", label: "Cœur" },
    ],
    relationships: [{ from: "core", to: "vessel", type: "contained_within" }],
    layers: [{ id: "primary", label: "Circuit primaire", objectIds: ["vessel", "core"] }],
  });
  assert.equal(scene.objects[0].kind, "reactor_vessel");
  assert.equal(scene.objects[0].material, "acier");
  assert.equal(scene.relationships[0].type, "contained_within");
  assert.match(ENGINE_CONTRACT, /Chaque question reçoit une réponse textuelle/);
  assert.match(ENGINE_CONTRACT, /sans plafond arbitraire de deux figures/);
});

test("generation contract contains no fixed spacetime or quadratic subject examples", () => {
  assert.doesNotMatch(`${ENGINE_CONTRACT}\n${ENGINE_TYPES_GUIDE}`, /spacetime|espace-temps|parabole|second degr[eé]|moteur électrique|drone/i);
});

test("coordinate contract preserves axes, grid, origin, and rejects invalid domains", () => {
  const normalized = normalizeVisualDocument({ schema_version: "2.0", type: "coordinate_system", domain: { x: [-4, 7], y: [-3, 8] }, axes: { origin: { x: 1, y: -1 } }, grid_type: "subdivided", grid_spacing: 0.5, subdivisions: 4, functions: [{ expr: "x^2" }] });
  assert.equal(normalized.artifact.type, "plot");
  assert.equal(normalized.artifact.gridType, "subdivided");
  assert.equal(normalized.artifact.origin.x, 1);
  assert.equal(normalizeVisualDocument({ schema_version: "2.0", type: "coordinate_system", domain: { x: [4, -4] }, functions: [{ expr: "x" }] }).ok, false);
});

test("coordinate documents infer readable bounds from measured data instead of defaulting to a quadratic range", () => {
  const result = normalizeVisualDocument({ schema_version: "2.0", type: "coordinate_system", axes: { x: { label: "Avant la mise à jour" }, y: { label: "Après" } }, points: [
    { label: "Avant", x: 0, y: 24 }, { label: "Après", x: 4, y: 25 },
  ] });
  assert.equal(result.ok, true);
  assert.ok(result.artifact.domain.x[0] < 0);
  assert.ok(result.artifact.domain.x[1] > 4);
  assert.ok(result.artifact.domain.y[0] < 24);
  assert.ok(result.artifact.domain.y[1] > 25);
});

test("large graph domains reject crowded requested tick intervals", () => {
  assert.ok(readableTickStep(0, 4000, 5) >= 100);
  assert.equal(readableTickStep(0, 10, 1), 1);
  assert.ok(readableTickStep(-250, 250, 1) >= 50);
});

test("renderer rejects a 3D artifact whose semantics contradict the current topic", () => {
  assert.equal(enforceVisualSubject("Modèle 3D du sous-sol géothermique", { type: "scene3d", title: "Masse centrale", preset: "spacetime" }), null);
  assert.equal(sanitizeEngineArtifact("scene3d", { preset: "spacetime" }), null);
  assert.equal(enforceVisualSubject("Fais une scène 3D de géothermie", { type: "scene3d", title: "Puits d'injection", preset: "geothermal", objects: [{ label: "Réservoir géothermique" }] }).preset, "geothermal");
  assert.equal(enforceVisualSubject("Courbure de l'espace-temps", { type: "scene3d", preset: "spacetime" }), null);
});

test("geothermal measurement tables become exact per-variable plot series", () => {
  const message = `Campagne de test\n| Temps | Débit (L/s) | Pression injection (bar) | Température production (°C) |\n|---:|---:|---:|---:|\n| 0 h | 40 | 120 | 91 |\n| 2 h | 52 | 132 | 97 |\n| 4 h | 63 | 141 | 103 |\n| 6 h | 71 | 149 | 108 |\n| 8 h | 77 | 156 | 112 |\n| 1 0 h | 82 | 161 | 115 |\n| 1 2 h | 85 | 165 | 118 |`;
  const datasets = extractMarkdownDatasets(message);
  const plots = buildDatasetPlotSections(datasets);
  assert.equal(plots.length, 3);
  assert.deepEqual(plots[0].series[0].points, [[0, 40], [2, 52], [4, 63], [6, 71], [8, 77], [10, 82], [12, 85]]);
  assert.deepEqual(plots[1].series[0].points.at(-1), [12, 165]);
  assert.deepEqual(plots[2].series[0].points.at(-1), [12, 118]);
  assert.equal(plots.some((plot) => plot.functions.some((fn) => /x\^2|quadratic/i.test(fn.expr))), false);
});

test("report plot builder retains every measured variable through the bundle cap", () => {
  const dataset = { xLabel: "Temps (h)", series: Array.from({ length: 8 }, (_, index) => ({ label: `Variable ${index + 1}`, unit: "u", points: [[0, index], [1, index + 1]] })) };
  assert.equal(buildDatasetPlotSections([dataset]).length, 8);
});

test("tabular before/after engineering metrics become one correct comparison per variable", () => {
  const message = `Indicateur\tAvant la mise à jour\tAprès\nTemps de réponse moyen\t180 ms\t2 400 ms\nErreurs HTTP\t0,3 %\t8,7 %\nCommandes/minute\t420\t160\nUtilisation CPU\t48 %\t96 %\nÉchecs de paiement\t0,2 %\t4,8 %\nConnexions DB actives\t120\t980`;
  const datasets = extractMarkdownDatasets(message);
  const charts = buildDatasetPlotSections(datasets);
  assert.equal(charts.length, 6);
  assert.equal(charts[0].type, "chart");
  assert.equal(charts[0].points[0].label, "Avant la mise à jour");
  assert.deepEqual(charts[0].points.map(({ value }) => value), [180, 2400]);
  assert.equal(charts[0].unit, "ms");
  assert.equal(charts[1].unit, "%");
});

test("thermal power calculation keeps units and uses the explicit production flow", () => {
  const estimate = estimateThermalPower("Débit de production : 8 2 L/s\nTempérature de retour du réseau urbain : 6 2 °C\nTempérature cible en sortie de production : 11 8 °C");
  assert.equal(estimate.flowLps, 82);
  assert.equal(estimate.deltaK, 56);
  assert.equal(Number(estimate.thermalPowerMW.toFixed(2)), 19.19);
  assert.equal(estimateThermalPower("Débit 82 L/s, températures non précisées"), null);
});

test("unrelated history is excluded while same-topic context is retained", () => {
  const turns = selectRelevantConversationTurns([
    { role: "user", content: "Explique un moteur électrique et son rotor" },
    { role: "assistant", content: "Le rotor tourne dans le stator." },
    { role: "user", content: "Analyse la campagne géothermique et la température du réservoir" },
  ], "Analyse la campagne géothermique et la température du réservoir");
  assert.equal(turns.length, 1);
  assert.match(turns[0].content, /géothermique/);
});

test("diagram relationships are validated and dangling references are dropped", () => {
  const result = normalizeVisualDocument({ schema_version: "2.0", type: "system_diagram", components: [{ id: "a", label: "Capteur", kind: "sensor" }, { id: "b", label: "Contrôleur", kind: "controller" }], connections: [{ from: "a", to: "b" }, { from: "a", to: "missing" }] });
  assert.equal(result.artifact.edges.length, 1);
  assert.equal(result.warnings.length, 1);
  const parent = normalizeVisualDocument({ schema_version: "2.0", type: "hierarchy", components: [{ id: "a", label: "A", parent: "missing" }, { id: "b", label: "B" }] });
  assert.equal(parent.artifact.nodes[0].parent, null);
  assert.equal(parent.warnings[0].includes("Parent ignoré"), true);
});

test("timeline and probability tree require real structure", () => {
  assert.equal(normalizeVisualDocument({ schema_version: "2.0", type: "timeline", events: [{ label: "A" }] }).ok, false);
  assert.equal(normalizeVisualDocument({ schema_version: "2.0", type: "probability_tree", root: { label: "Départ" } }).ok, false);
});

test("scientific cleanup fixes joined prose while preserving code and formula token boundaries", () => {
  const source = "Lafonctionest$f(x)=ax2+bx+c$avec$a≠0$. Lediscriminantest$Δ=b2-4ac$. Vitesse: 5m/s. `x2`";
  const output = normalizeScientificText(source);
  assert.match(output, /La fonction est \$f\(x\)=ax²\+bx\+c\$ avec \$a≠0\$/);
  assert.match(output, /Le discriminant est \$Δ=b²-4ac\$/);
  assert.match(output, /5 m\/s/);
  assert.match(output, /`x2`/);
  assert.ok(tokenizeScientificText(source).some((token) => token.type === "math_inline"));
  assert.ok(tokenizeScientificText(source).some((token) => token.type === "unit"));
  assert.match(scrubAnswer(source), /La fonction est/);
});

test("server sanitizers preserve grid controls and accept structured JSON blocks", () => {
  const plot = sanitizeEngineArtifact("plot", { functions: [{ id: "f", expr: "x^2" }], gridType: "subdivided", gridSpacing: 0.5, subdivisions: 4, origin: { x: 1, y: 2 } });
  assert.equal(plot.gridType, "subdivided");
  assert.equal(plot.origin.y, 2);
  assert.equal(parseAigentBlock("[[AIGENT_DATA]]{\"type\":\"timeline\"}[[/AIGENT_DATA]]").payload.type, "timeline");
});
