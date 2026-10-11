const numberFromCell = (value) => {
  const cleaned = String(value ?? "").trim().replace(/(?<=\d)\s+(?=\d)/g, "").replace(/,/g, ".");
  const match = cleaned.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/);
  return match ? Number(match[0]) : NaN;
};
const unitFromHeader = (header) => String(header).match(/\(([^)]+)\)/)?.[1] || "";

/** Extract numeric series only from explicit Markdown tables in the current user message. */
export function extractMarkdownDatasets(message) {
  const lines = String(message || "").split(/\r?\n/);
  const datasets = [];
  for (let i = 0; i < lines.length - 2; i++) {
    if (!lines[i].includes("|") || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const split = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    const headers = split(lines[i]);
    if (headers.length < 2 || split(lines[i + 1]).length !== headers.length) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && lines[j].includes("|"); j++) {
      const cells = split(lines[j]);
      if (cells.length !== headers.length) break;
      rows.push(cells);
    }
    if (rows.length < 2) continue;
    const xIndex = headers.findIndex((header) => /temps|date|ann[eé]e|jour|heure/i.test(header));
    if (xIndex < 0) continue;
    const x = rows.map((row) => numberFromCell(row[xIndex]));
    if (x.some((value) => !Number.isFinite(value))) continue;
    const series = headers.map((header, column) => ({
      label: header.replace(/\s*\([^)]*\)\s*/g, "").trim() || header,
      unit: unitFromHeader(header),
      points: rows.map((row, index) => [x[index], numberFromCell(row[column])]),
    })).filter((entry, column) => column !== xIndex && entry.points.every((point) => Number.isFinite(point[1])));
    if (series.length) datasets.push({ xLabel: headers[xIndex], xUnit: unitFromHeader(headers[xIndex]), rows, series });
    i += rows.length + 1;
  }
  // Tab-separated comparison tables (common in pasted engineering briefs).
  // Keep each metric separate: combining latency, percentages and throughput
  // on one numeric axis would make the comparison misleading.
  if (!datasets.length) {
    const lines = String(message || "").split(/\r?\n/);
    const splitTsv = (line) => line.trim().split("\t").map((cell) => cell.trim());
    for (let i = 0; i < lines.length - 2; i++) {
      if (!lines[i].includes("\t")) continue;
      const headers = splitTsv(lines[i]);
      const beforeIndex = headers.findIndex((header) => /avant/i.test(header));
      const afterIndex = headers.findIndex((header) => /apr[eè]s/i.test(header));
      if (beforeIndex < 1 || afterIndex < 1 || beforeIndex === afterIndex) continue;
      const rows = [];
      for (let j = i + 1; j < lines.length && lines[j].includes("\t"); j++) {
        const cells = splitTsv(lines[j]);
        if (cells.length < headers.length) break;
        rows.push(cells);
      }
      const series = rows.map((row) => {
        const label = row[0];
        const before = numberFromCell(row[beforeIndex]);
        const after = numberFromCell(row[afterIndex]);
        const unit = `${row[beforeIndex]} ${row[afterIndex]}`.match(/ms|°C|%|€|\b(?:s|L\/s|bar)\b/i)?.[0] || "";
        return { label, unit, points: [[0, before], [1, after]] };
      }).filter((entry) => entry.label && entry.points.every((point) => Number.isFinite(point[1])));
      if (series.length) datasets.push({ categorical: true, categories: [headers[beforeIndex], headers[afterIndex]], xLabel: "Période", series });
      i += rows.length;
    }
  }
  return datasets;
}

export function buildDatasetPlotSections(datasets, maxSections = 16) {
  return datasets.flatMap((dataset, datasetIndex) => dataset.series.map((series, seriesIndex) => dataset.categorical
    ? ({
    type: "chart",
    title: `${series.label} · ${dataset.categories.join(" / ")}`,
    summary: "Comparaison des deux mesures fournies, sans extrapolation.",
    chartType: "bar",
    unit: series.unit,
    xLabel: dataset.xLabel,
    yLabel: series.unit ? `${series.label} (${series.unit})` : series.label,
    legend: series.label,
    points: series.points.map(([index, value]) => ({ label: dataset.categories[index], value })),
  })
    : ({
    type: "plot",
    title: `${series.label} en fonction de ${dataset.xLabel.replace(/\s*\([^)]*\)\s*/g, "").trim()}`,
    xLabel: dataset.xLabel,
    yLabel: `${series.label}${series.unit ? ` (${series.unit})` : ""}`,
    grid: true,
    gridType: "grid",
    series: [{ id: `mesure-${datasetIndex + 1}-${seriesIndex + 1}`, label: series.label, mode: "line", points: series.points }],
    points: [], functions: [],
  }))).slice(0, maxSections);
}

export function datasetAuditNote(datasets) {
  const geothermal = datasets.some((dataset) => dataset.series.some((series) => /pression injection|température production|débit/i.test(series.label)));
  return geothermal
    ? "Les graphiques reprennent les points du tableau fourni. Ils décrivent la campagne observée et ne suffisent pas à eux seuls pour conclure à la viabilité industrielle ni à fixer un seuil de fracturation, de corrosion ou de sécurité."
    : "Les graphiques reprennent les valeurs du tableau fourni, sans ajustement de courbe ni extrapolation."
}

const labelledValue = (message, label) => {
  const match = String(message || "").match(new RegExp(`${label}[^\\n:]{0,100}:?[ \\t]*([\\d\\s]+(?:[.,]\\d+)?)\\s*°?C?`, "i"));
  return match ? numberFromCell(match[1]) : NaN;
};

/** Calculates only a thermal power when the required flow and two temperatures are explicit. */
export function estimateThermalPower(message) {
  const source = String(message || "");
  const flowMatch = source.match(/débit de production[^\n:]{0,80}:?\s*([\d\s]+(?:[.,]\d+)?)\s*L\s*\/\s*s/i);
  const flow = flowMatch ? numberFromCell(flowMatch[1]) : NaN;
  const inlet = labelledValue(source, "température de retour(?: du réseau urbain)?");
  const outlet = labelledValue(source, "température cible en sortie de production");
  if (![flow, inlet, outlet].every(Number.isFinite) || flow <= 0 || outlet <= inlet) return null;
  const delta = outlet - inlet;
  const megawatts = flow * 4.18 * delta / 1000;
  return { flowLps: flow, inletC: inlet, outletC: outlet, deltaK: delta, densityKgM3: 1000, heatCapacityKjKgK: 4.18, thermalPowerMW: megawatts };
}
