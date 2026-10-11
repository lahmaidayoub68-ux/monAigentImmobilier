/* Conservative cleanup for scientific prose. Delimited math and code stay isolated. */
const REPAIRS = new Map([
  ["lafonctionest", "La fonction est"],
  ["lediscriminantest", "Le discriminant est"],
  ["lasolutionest", "La solution est"],
  ["lessolutionssont", "Les solutions sont"],
  ["lavitesseest", "La vitesse est"],
  ["ladistanceest", "La distance est"],
  ["lamasseest", "La masse est"],
  ["laforceest", "La force est"],
  ["laenergieest", "L'énergie est"],
  ["lenergieest", "L'énergie est"],
  ["laformuleest", "La formule est"],
  ["leresultatest", "Le résultat est"],
  ["lareactionest", "La réaction est"],
  ["lamoleculeest", "La molécule est"],
  ["lesatomessont", "Les atomes sont"],
  ["lacelluleest", "La cellule est"],
  ["laprobabiliteest", "La probabilité est"],
  ["laderiveeest", "La dérivée est"],
]);

export function tokenizeScientificText(input) {
  const source = String(input ?? ""),
    tokens = [];
  const pattern =
    /(\[\[\s*AIGENT[_ -]?DATA\s*\]\][\s\S]*?(?:\[\[\s*\/\s*AIGENT[_ -]?DATA\s*\]\]|$)|```[\s\S]*?```|`[^`\n]*`|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$)/g;
  let cursor = 0,
    match;
  while ((match = pattern.exec(source))) {
    if (match.index > cursor)
      tokens.push({ type: "text", value: source.slice(cursor, match.index) });
    const value = match[0];
    tokens.push({
      type: value.startsWith("[[")
        ? "visual_payload"
        : value.startsWith("```") || value.startsWith("`")
          ? "code"
          : value.startsWith("$$") || value.startsWith("\\[")
            ? "math_display"
            : "math_inline",
      value,
    });
    cursor = pattern.lastIndex;
  }
  if (cursor < source.length)
    tokens.push({ type: "text", value: source.slice(cursor) });
  const units =
    /\b(?:\d+(?:[.,]\d+)?\s?(?:m\/s|km\/h|m²|m³|cm|mm|km|kg|mg|g|mol|mol\/L|mL|mL\/s|Hz|kHz|MHz|N|J|W|kW|V|mV|A|mA|K|°C|s|min|h|L))\b/gi;
  const symbols = /[ΔδλμΩαβγπρσφω∞≈≠≤≥±→←↔×÷∑√]/gu;
  return tokens.flatMap((token) => {
    if (token.type !== "text") return [token];
    const parts = [],
      pattern = new RegExp(`${units.source}|${symbols.source}`, "giu");
    let start = 0,
      found;
    while ((found = pattern.exec(token.value))) {
      if (found.index > start)
        parts.push({
          type: "text",
          value: token.value.slice(start, found.index),
        });
      parts.push({
        type: /^\d/.test(found[0]) ? "unit" : "symbol",
        value: found[0].replace(/^(\d+(?:[.,]\d+)?)(?=\S)/, "$1 "),
      });
      start = pattern.lastIndex;
    }
    if (start < token.value.length)
      parts.push({ type: "text", value: token.value.slice(start) });
    return parts;
  });
}

export function normalizeScientificText(input) {
  const tokens = tokenizeScientificText(input);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "text") continue;
    let value = token.value;
    const mathAdjacent =
      tokens[index - 1]?.type?.startsWith("math_") ||
      tokens[index + 1]?.type?.startsWith("math_");
    if (mathAdjacent)
      value = value.replace(
        /[A-Za-zÀ-ÿ]{9,}/gu,
        (word) =>
          REPAIRS.get(
            word
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase(),
          ) || word,
      );
    value = value
      .replace(/\\\((.*?)\\\)/g, (_, formula) => `$${formula}$`)
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => `$$${formula}$$`)
      .replace(
        /\b(\d+(?:[.,]\d+)?)(m|cm|mm|km|kg|g|mg|s|ms|min|h|Hz|kHz|MHz|N|J|W|kW|MW|GW|V|A|mol|L|mL|bar|Pa|kWh|MWh|K)\b/g,
        "$1\u00a0$2",
      )
      .replace(/(\d)\s?(°C|°F|%|‰)/g, "$1\u00a0$2")
      .replace(/\s+([,.;!?])/g, "$1");
    token.value = value;
  }
  const output = [];
  tokens.forEach((token) => {
    if (token.type.startsWith("math_")) {
      if (output.length && output.at(-1) && !/\s$/.test(output.at(-1)))
        output.push(" ");
      let formula = token.value;
      if (formula.startsWith("$") && !formula.startsWith("$$")) {
        formula = formula
          .replace(/([a-z])\^?2(?=[+\-)=]|$)/gi, "$1²")
          .replace(/([a-z])\^?3(?=[+\-)=]|$)/gi, "$1³");
      }
      output.push(formula, " ");
    } else output.push(token.value);
  });
  return output
    .join("")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/ {2,}/g, " ");
}
