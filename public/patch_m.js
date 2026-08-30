import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🎯 Nom de votre fichier HTML cible (situé dans le même dossier que le script)
const TARGET_FILE = "messagerie-occas.html";

const filePath = path.resolve(__dirname, TARGET_FILE);

if (!fs.existsSync(filePath)) {
  console.error(`❌ Fichier non trouvé : ${filePath}`);
  console.log(
    `Vérifiez le nom du fichier dans TARGET_FILE ou son emplacement.`,
  );
  process.exit(1);
}

// 1. Sauvegarde de sécurité
let content = fs.readFileSync(filePath, "utf8");
fs.writeFileSync(`${filePath}.backup`, content, "utf8");
console.log(`🛡️ Sauvegarde créée : ${TARGET_FILE}.backup`);

// 2. Définition des blocs de remplacement ciblés et ordonnés
const replacements = [
  {
    targetSelector: ".overlay",
    code: `.overlay {
        position: fixed;
        inset: 0;
        z-index: 300;
        background: rgba(4, 3, 2, 0.75);
        backdrop-filter: blur(12px);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }`,
  },
  {
    targetSelector: ".overlay.active",
    code: `.overlay.active {
        display: flex;
        animation: fade 0.2s var(--ease);
      }`,
  },
  {
    targetSelector: ".modal",
    code: `.modal {
        width: 100%;
        max-width: 480px;
        background: #15120d;
        border: 1px solid rgba(255, 230, 200, 0.1);
        border-radius: 20px;
        box-shadow: 0 30px 70px -15px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
        overflow: hidden;
        animation: pop2 0.22s var(--ease);
        max-height: 88vh;
        display: flex;
        flex-direction: column;
        position: relative;
      }`,
  },
  {
    targetSelector: ".modal::before",
    code: `.modal::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, #e0ad68, transparent);
        box-shadow: 0 0 12px #e0ad68;
      }`,
  },
  {
    targetSelector: ".modal.modal--group::before",
    code: `.modal.modal--group::before {
        background: linear-gradient(90deg, transparent, #ff5c49, transparent);
        box-shadow: 0 0 14px #ff5c49;
      }`,
  },
  {
    targetSelector: ".modal-head",
    code: `.modal-head {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 20px 22px 16px;
        border-bottom: 1px solid rgba(255, 240, 220, 0.06);
      }`,
  },
  {
    targetSelector: ".modal-ic",
    code: `.modal-ic {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: #fff;
        flex: none;
      }`,
  },
  {
    targetSelector: ".modal-ic.orange",
    code: `.modal-ic.orange {
        background: linear-gradient(135deg, #f0c489, #d19a4c);
        box-shadow: 0 0 18px rgba(224, 173, 104, 0.4);
        color: #17140f;
      }`,
  },
  {
    targetSelector: ".modal-ic.red",
    code: `.modal-ic.red {
        background: linear-gradient(135deg, #ff7b6b, #e04434);
        box-shadow: 0 0 18px rgba(255, 92, 73, 0.45);
      }`,
  },
  {
    targetSelector: ".modal-head h3",
    code: `.modal-head h3 {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }`,
  },
  {
    targetSelector: ".modal-head span",
    code: `.modal-head span {
        font-size: 11.5px;
        color: var(--txt-3);
        display: block;
        margin-top: 2px;
      }`,
  },
  {
    targetSelector: ".modal-close",
    code: `.modal-close {
        margin-left: auto;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        color: var(--txt-3);
        display: grid;
        place-items: center;
        transition: all 0.15s ease;
      }
      .modal-close:hover {
        background: rgba(255, 255, 255, 0.07);
        color: var(--txt);
      }`,
  },
  {
    targetSelector: ".modal-body",
    code: `.modal-body {
        padding: 20px 22px;
        overflow-y: auto;
      }`,
  },
  {
    targetSelector: ".field",
    code: `.field {
        margin-bottom: 15px;
      }`,
  },
  {
    targetSelector: ".field label",
    code: `.field label {
        display: block;
        font-size: 10.5px;
        font-weight: 700;
        color: var(--txt-3);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 7px;
      }`,
  },
  {
    targetSelector: ".field input,",
    code: `.field input,
      .field textarea {
        width: 100%;
        padding: 10px 14px;
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 240, 220, 0.09);
        font-size: 13px;
        color: var(--txt);
        transition: all 0.18s ease;
      }`,
  },
  {
    targetSelector: ".field input:focus,",
    code: `.field input:focus,
      .field textarea:focus {
        background: rgba(0, 0, 0, 0.4);
        border-color: rgba(224, 173, 104, 0.6);
        box-shadow: 0 0 0 3px rgba(224, 173, 104, 0.15), 0 0 12px rgba(224, 173, 104, 0.1);
      }
      .modal.modal--group .field input:focus,
      .modal.modal--group .field textarea:focus {
        border-color: rgba(255, 92, 73, 0.65);
        box-shadow: 0 0 0 3px rgba(255, 92, 73, 0.16), 0 0 12px rgba(255, 92, 73, 0.15);
      }`,
  },
  {
    targetSelector: ".field textarea",
    code: `.field textarea {
        min-height: 90px;
        resize: vertical;
      }`,
  },
  {
    targetSelector: ".add-row",
    code: `.add-row {
        display: flex;
        gap: 8px;
      }`,
  },
  {
    targetSelector: ".add-btn",
    code: `.add-btn {
        padding: 0 16px;
        border-radius: 12px;
        background: linear-gradient(135deg, #ff7b6b, #e04434);
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        box-shadow: 0 0 16px rgba(255, 92, 73, 0.35);
        transition: all 0.15s ease;
      }
      .add-btn:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }`,
  },
  {
    targetSelector: ".modal-foot",
    code: `.modal-foot {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        padding: 16px 22px;
        border-top: 1px solid rgba(255, 240, 220, 0.06);
        background: #110f0c;
      }`,
  },
  {
    targetSelector: ".btn",
    code: `.btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 18px;
        border-radius: 12px;
        font-size: 12.8px;
        font-weight: 650;
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--txt-2);
        background: rgba(255, 255, 255, 0.03);
        transition: all 0.15s ease;
      }
      .btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--txt);
      }`,
  },
  {
    targetSelector: ".btn-primary",
    code: `.btn-primary {
        background: linear-gradient(135deg, #f0c489, #d19a4c);
        color: #17140f !important;
        border: none;
        box-shadow: 0 0 20px rgba(224, 173, 104, 0.4);
      }
      .btn-primary svg {
        stroke: #17140f !important;
      }
      .btn-primary:hover {
        filter: brightness(1.08);
        box-shadow: 0 0 24px rgba(224, 173, 104, 0.6);
        transform: translateY(-1px);
      }
      .modal.modal--group .btn-primary {
        background: linear-gradient(135deg, #ff7b6b, #e04434);
        color: #ffffff !important;
        border: none;
        box-shadow: 0 0 20px rgba(255, 92, 73, 0.45);
      }
      .modal.modal--group .btn-primary svg {
        stroke: #ffffff !important;
      }
      .modal.modal--group .btn-primary:hover {
        filter: brightness(1.1);
        box-shadow: 0 0 26px rgba(255, 92, 73, 0.65);
      }`,
  },
];

function replaceCSSBlock(source, selectorPrefix, newCode) {
  const index = source.indexOf(selectorPrefix);
  if (index === -1) {
    return { success: false, source };
  }

  const openBrace = source.indexOf("{", index);
  if (openBrace === -1) return { success: false, source };

  let depth = 1;
  let cursor = openBrace + 1;

  while (depth > 0 && cursor < source.length) {
    if (source[cursor] === "{") depth++;
    else if (source[cursor] === "}") depth--;
    cursor++;
  }

  const before = source.slice(0, index);
  const after = source.slice(cursor);
  return {
    success: true,
    source: before + newCode + after,
  };
}

// 4. Nettoyage des anciens blocs orphelins
const obsoleteBlocks = [
  ".modal.modal--group .modal-head",
  ".modal.modal--group .add-btn",
  ".modal.modal--group .btn-primary",
  ".modal-close:hover",
  ".btn:hover",
  ".btn-primary:hover",
  ".btn-primary.red",
];

obsoleteBlocks.forEach((selector) => {
  const res = replaceCSSBlock(content, selector, "");
  if (res.success) content = res.source;
});

// 5. Exécution des remplacements in-place
let replacedCount = 0;
replacements.forEach((item) => {
  const res = replaceCSSBlock(content, item.targetSelector, item.code);
  if (res.success) {
    content = res.source;
    replacedCount++;
  } else {
    console.warn(
      `⚠️ Bloc non trouvé pour le sélecteur : ${item.targetSelector}`,
    );
  }
});

// 6. Correction automatique du bug HTML sur le bouton groupSend
content = content.replace(
  '<button class="btn btn-primary" id="groupSend"></button>',
  '<button class="btn btn-primary" id="groupSend">',
);

// 7. Écriture du fichier final
fs.writeFileSync(filePath, content, "utf8");

console.log(
  `\n✨ Succès ! ${replacedCount} blocs CSS ont été remplacés à leur position exacte.`,
);
console.log(`🐛 Bug de balise HTML du bouton 'groupSend' corrigé.`);
