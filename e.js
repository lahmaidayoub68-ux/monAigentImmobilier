import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================
// AiGENT — Injection automatique de favicon.js
// Parcourt tous les fichiers HTML directement dans /public
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, "public");
const SCRIPT_TAG = '<script src="./favicon.js"></script>';

let modified = 0;
let skipped = 0;

const files = fs
  .readdirSync(PUBLIC_DIR)
  .filter((file) => file.toLowerCase().endsWith(".html"));

for (const file of files) {
  const filePath = path.join(PUBLIC_DIR, file);
  let html = fs.readFileSync(filePath, "utf8");

  // ----------------------------------------------------------
  // Évite les doublons
  // ----------------------------------------------------------

  if (
    html.includes('src="./favicon.js"') ||
    html.includes("src='./favicon.js'")
  ) {
    console.log(`✓ Déjà présent : ${file}`);
    skipped++;
    continue;
  }

  // ----------------------------------------------------------
  // Injection juste avant </body>
  // ----------------------------------------------------------

  if (html.includes("</body>")) {
    html = html.replace("</body>", `  ${SCRIPT_TAG}\n</body>`);
  } else {
    console.warn(`⚠️ Pas de </body> : ${file}`);
    html += `\n${SCRIPT_TAG}\n`;
  }

  fs.writeFileSync(filePath, html, "utf8");

  console.log(`✓ Ajouté : ${file}`);
  modified++;
}

// ============================================================
// Résumé
// ============================================================

console.log("\n--------------------------------");
console.log(`HTML modifiés   : ${modified}`);
console.log(`Déjà configurés : ${skipped}`);
console.log("--------------------------------");
