const WORD = (pattern) =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${pattern})(?=$|[^\\p{L}\\p{N}])`, "iu");

const RULES = [
  {
    id: "explicit",
    score: 1,
    re: WORD(
      "sch[ée]ma|repr[ée]sentation|visualisation|vue 3d|3d|frise|arbre de probabilit[eé]|organigramme|rep[eè]re|courbe|plan|diagramme|carte mentale|infographie|mol[eé]cule|anatomie",
    ),
  },
  {
    id: "spatial",
    score: 0.25,
    re: WORD(
      "structure|g[eé]om[eé]trie|espace|position|forme|m[eé]canique|anatomie|architecture|mol[eé]cule|circuit",
    ),
  },
  {
    id: "relationships",
    score: 0.2,
    re: WORD(
      "syst[eè]me|architecture|composants?|d[eé]pendances?|relations?|r[eé]seau|interactions?|cause|cons[eé]quence",
    ),
  },
  {
    id: "process",
    score: 0.2,
    re: WORD(
      "[eé]tapes?|processus|fonctionnement|flux|pipeline|algorithme|proc[eé]dure|cycle",
    ),
  },
  {
    id: "hierarchy",
    score: 0.18,
    re: WORD(
      "arbre|hi[eé]rarchie|classification|organigramme|cat[eé]gories|niveaux",
    ),
  },
  {
    id: "time",
    score: 0.2,
    re: WORD(
      "chronologie|historique|[eé]volution|frise|au fil du temps|p[eé]riodes|dates",
    ),
  },
  {
    id: "probability",
    score: 0.25,
    re: WORD("probabilit[eé]s?|risque|sc[eé]narios|incertitude|d[eé]faillance"),
  },
  {
    id: "science",
    score: 0.16,
    re: WORD(
      "physique|chimie|biologie|math[eé]matiques?|g[eé]ologie|ing[eé]nierie|scientifique|m[eé]canique|second degr[eé]|quadratique|parabole|mol[eé]cule|anatomie",
    ),
  },
  {
    id: "visually_dense_domain",
    score: 0.52,
    re: WORD(
      "g[eé]othermie|g[eé]othermique|puits d'injection|r[eé]servoir g[eé]othermique|moteur|rotor|stator|drone|robot|anatomie|organe|mol[eé]cule|atome|circuit|architecture|g[eé]ologie|probabilit[eé]s conditionnelles|second degr[eé]|quadratique|parabole",
    ),
  },
  {
    id: "math_visual",
    score: 0.34,
    re: WORD(
      "signes? de f|variations|racines?|sommet|discriminant|fonction du second degr[eé]",
    ),
  },
  {
    id: "comparison",
    score: 0.16,
    re: WORD(
      "comparer|comparaison|diff[eé]rences?|avantages|inconv[eé]nients|options",
    ),
  },
];

const EXPLICIT = WORD(
  "fais|faites|cr[eé]e|cr[eé]er|dessine|dessiner|trace|tracer|repr[eé]sente|repr[eé]senter|construis|construire|g[eé]n[eè]re|g[eé]n[eè]rer|produis|produire|pr[eé]pare|pr[eé]parer|je veux|je voudrais|j'aimerais|j’aimerais|montre-moi|fournis|fournir",
);
const SIMPLE = WORD("bonjour|salut|merci|ok|d'accord|au revoir|hello|hi");

function selectTypes(text) {
  if (WORD("gantt|planning de projet|calendrier de projet").test(text))
    return ["gantt"];
  if (
    WORD(
      "sankey|bilan [eé]nerg[eé]tique|flux [eé]nerg[eé]tiques?|flux de mati[eè]re",
    ).test(text)
  )
    return ["sankey_diagram"];
  if (WORD("carte thermique|heat ?map|matrice de corr[eé]lation").test(text))
    return ["heatmap"];
  if (
    WORD(
      "circuit hydraulique|circuit pneumatique|v[eé]rin|distributeur hydraulique",
    ).test(text)
  )
    return ["hydraulic_circuit"];
  if (
    WORD(
      "circuit [eé]lectrique|r[eé]sistances?|condensateur|ampoule|loi d'ohm",
    ).test(text)
  )
    return ["electrical_circuit"];
  if (
    WORD(
      "forces? (?:appliqu[eé]es?|exerc[eé]es?)|diagramme de forces|bilan des forces|plan inclin[eé]",
    ).test(text)
  )
    return ["forces_diagram"];
  if (
    WORD(
      "lignes? de m[eé]tro|correspondances?|plan du r[eé]seau de transport",
    ).test(text)
  )
    return ["transit_map"];
  if (
    WORD(
      "diagramme de s[eé]quence|[eé]changes? entre (?:capteurs?|services?|acteurs?)",
    ).test(text)
  )
    return ["sequence_diagram"];
  if (WORD("diagramme d'[eé]tats?|machine [aà] [eé]tats").test(text))
    return ["state_diagram"];
  if (WORD("cycle (?:de|du|des)|boucle de r[eé]troaction").test(text))
    return ["cycle_diagram"];
  if (
    WORD(
      "mod[eè]le de donn[eé]es|base de donn[eé]es|entit[eé]s?[- ]associations?",
    ).test(text)
  )
    return ["er_diagram"];
  if (WORD("carte mentale|id[eé]es principales").test(text))
    return ["mind_map"];
  if (WORD("organigramme|hi[eé]rarchie de l'entreprise").test(text))
    return ["org_chart"];
  if (
    WORD(
      "g[eé]othermie|g[eé]othermique|puits d'injection|puits de production|r[eé]servoir g[eé]othermique",
    ).test(text)
  )
    return ["geothermal_subsurface", "coordinate_system", "process_diagram"];
  if (WORD("drone|navigation autonome|quadrirotor|uav").test(text))
    return ["system_diagram", "mechanical_3d"];
  if (
    WORD(
      "moteur|rotor|stator|roulement|engrenage|drone|robot|machine|m[eé]canique",
    ).test(text)
  )
    return ["mechanical_3d", "exploded_view", "system_diagram"];
  if (
    WORD(
      "mol[eé]cule|atome|liaison chimique|structure chimique|chimie organique",
    ).test(text)
  )
    return ["chemistry_structure", "molecular_3d"];
  if (
    WORD("anatomie|organe|squelette|muscle|corps humain|cellule|biologie").test(
      text,
    )
  )
    return ["anatomy_diagram", "biological_diagram"];
  if (
    WORD(
      "arbre de probabilit[eé]|probabilit[eé]s conditionnelles|sc[eé]nario de d[eé]faillance",
    ).test(text)
  )
    return ["probability_tree"];
  if (
    WORD("frise|chronologie|historique|[eé]volution dans le temps").test(text)
  )
    return ["timeline"];
  if (
    WORD(
      "f.*x.*|parabole|fonction|second degr[eé]|quadratique|rep[eè]re|courbe|vecteur|g[eé]om[eé]trie",
    ).test(text)
  )
    return ["coordinate_system", "geometry"];
  if (WORD("circuit|[eé]lectrique|sch[eé]ma [eé]lectrique").test(text))
    return ["circuit_diagram"];
  if (
    WORD("[eé]tapes?|processus|proc[eé]dure|workflow|algorithme|flux").test(
      text,
    )
  )
    return ["process_diagram", "flowchart"];
  if (WORD("b[aâ]timent|architecture|construction|plan de maison").test(text))
    return ["architecture_diagram", "technical_3d"];
  if (
    WORD(
      "syst[eè]me|architecture|capteurs?|navigation|r[eé]seau|composants?",
    ).test(text)
  )
    return ["system_diagram", "architecture_diagram"];
  if (WORD("comparer|comparaison|diff[eé]rences?|options").test(text))
    return ["comparison_diagram"];
  return ["system_diagram"];
}
/** Scores visual relevance without treating greetings or routine questions as deliverables. */
export function analyzeVisualNeed(message, mode = "think") {
  const text = String(message ?? "")
    .trim()
    .toLocaleLowerCase("fr");
  if (!text || SIMPLE.test(text))
    return {
      visual_need: "none",
      score: 0,
      confidence: 0.99,
      explicit: false,
      recommended_types: [],
      minimum_visuals: 0,
      open_panel: false,
      signals: [],
    };

  const signals = RULES.filter((rule) => rule.re.test(text));
  const explicit =
    EXPLICIT.test(text) && signals.some((rule) => rule.id === "explicit");
  const score = Math.min(
    1,
    signals.reduce((sum, rule) => sum + rule.score, 0) +
      (explicit ? 0.4 : 0) +
      (mode === "create" ? 0.2 : 0),
  );
  const recommended_types = selectTypes(text);
  const need = explicit || score >= 0.45;
  const visual_need =
    explicit || score >= 0.72 ? "high" : need ? "medium" : "low";
  const complex = WORD(
    "complet|compl[eè]te|d[eé]taill[eé]|approfondi|architecture|ensemble|multi[- ]capteurs|plusieurs|analyse visuelle",
  ).test(text);
  return {
    visual_need,
    score: Number(score.toFixed(2)),
    confidence: Number(Math.min(0.99, 0.56 + score * 0.42).toFixed(2)),
    explicit,
    recommended_types: need ? recommended_types : [],
    minimum_visuals: need ? 1 : 0,
    open_panel: explicit || (visual_need === "high" && complex),
    signals: signals.map((rule) => rule.id),
  };
}

const DOMAIN_MARKERS = {
  geothermal:
    /géotherm|geotherm|puits|réservoir|sous-sol|formation rocheuse|réseau de chaleur/i,
  vehicle: /voiture|véhicule|moteur|rotor|stator|drone|automobile/i,
  spacetime: /espace[- ]?temps|relativité|trou noir|géodésique/i,
  food: /cuisine|recette|ingrédient|cuisson|aliment/i,
  biology: /anatomie|organe|cellule|biologie|squelette/i,
  chemistry: /molécule|atome|liaison chimique|chimie|solution/i,
};

export function enforceVisualSubject(message, artifact) {
  if (!artifact) return null;
  const subject = String(message ?? "")
    .split(/(?:réponse de l.?ia|sa réponse|réponse :|ce qu.?a répondu)/i)[0]
    .slice(0, 5000);
  const content = [
    artifact.title,
    artifact.summary,
    artifact.preset,
    ...(artifact.nodes || []).flatMap((node) => [node.label, node.detail]),
    ...(artifact.objects || []).flatMap((object) => [
      object.label,
      object.detail,
      object.kind,
    ]),
    ...(artifact.sections || []).flatMap((section) => [
      section.title,
      section.summary,
      section.preset,
      ...(section.nodes || []).flatMap((node) => [node.label, node.detail]),
      ...(section.objects || []).flatMap((object) => [
        object.label,
        object.detail,
        object.kind,
      ]),
    ]),
  ]
    .filter(Boolean)
    .join(" ");
  const requestedDomains = Object.entries(DOMAIN_MARKERS)
    .filter(([, pattern]) => pattern.test(subject))
    .map(([domain]) => domain);
  const artifactDomains = Object.entries(DOMAIN_MARKERS)
    .filter(([, pattern]) => pattern.test(content))
    .map(([domain]) => domain);
  if (
    requestedDomains.length === 1 &&
    artifactDomains.length &&
    !artifactDomains.includes(requestedDomains[0])
  )
    return null;
  if (
    artifact.type === "scene3d" &&
    !["assembly", "geothermal"].includes(artifact.preset)
  )
    return null;
  if (
    artifact.type === "scene3d" &&
    artifact.preset === "spacetime" &&
    !DOMAIN_MARKERS.spacetime.test(subject)
  )
    return null;
  return artifact;
}

const STOP = new Set(
  "avec dans pour cette sont être avoir faire cela ceci comme alors donc mais qui que quoi une des les aux par sur entre depuis pendant aussi très étude analyse données demande peux doit veux donne nous vous elle cette celui".split(
    /\s+/,
  ),
);
const terms = (value) =>
  new Set(
    String(value || "")
      .toLocaleLowerCase("fr")
      .match(/[\p{L}\p{N}]{4,}/gu)
      ?.filter((word) => !STOP.has(word)) || [],
  );
export function selectRelevantConversationTurns(turns, message) {
  const current = terms(message);
  const followUp =
    /\b(ça|cela|ce résultat|continue|précise|développe|reprends|corrige|la suite|ce schéma|ce graphique)\b/i.test(
      message || "",
    );
  const chosen = [];
  for (
    let index = Math.max(0, (turns || []).length - 18);
    index < (turns || []).length;
    index++
  ) {
    const turn = turns[index];
    if (
      turn.role === "user" &&
      (followUp ||
        [...terms(turn.content)].filter((word) => current.has(word)).length >=
          2)
    ) {
      chosen.push(turn);
      const reply = turns[index + 1];
      if (reply?.role === "assistant") chosen.push(reply);
    }
  }
  return [
    ...chosen.slice(-8),
    ...(turns || [])
      .filter((turn) => turn.role === "user" && turn.isCurrent)
      .slice(-1),
  ];
}
