/* AiGENT — auteur de scènes 3D : l'IA écrit un programme de formes, le moteur le valide et le rend. */
import { repairJson } from "./aigentArtifactServer.js";
import { LIB_NAMES } from "../public/artifacts/shape-kit.js";

const SYSTEM = `Tu es modélisateur 3D technique. Tu écris la scène 3D EXACTE du sujet demandé, sous forme de PROGRAMMES DE FORMES. Réponds uniquement avec un JSON.

REPÈRE : mètres, +y vers le haut, sol à y=0, scène centrée. Chaque objet : {id, label, detail (rôle réel de la pièce), group, major:true (10 pièces au plus), material, position:[x,y,z], shape:<nœud>}.
MATÉRIAUX : steel aluminium iron concrete brick glass rubber plastic wood copper gold water fabric ceramic paint rock grass soil light, ou "paint:#rrggbb".
NŒUDS (chacun accepte at:[x,y,z], rot:[degrés], scale, mat) : box{size:[x,y,z],r} cyl{r|rt,rb,h} sphere{r} dome{r} cone{r,h} capsule{r,h} torus{R,r} prism{n,r,h} wedge{size} lathe{profile:[[rayon,y],…]} (révolution : tours, cuves, mâts, coques) extrude{poly:[[x,z],…],h,bevel} loft{sections:[{y,poly:[[x,z],…]},…]} (coques, carlingues, ailes) tube{path:[[x,y,z],…],r} hollow{size,t,open:"top|front|back|bottom|none"} plate{size:[w,d],t,holes:[[x,z,r]]} stairs{n,w,rise,run} rail{path,h} truss{from,to,w,bays} group{children} array{kind:"linear|grid|radial",n,step|sx,sz,nx|r,of} mirror{axis,of} lib{name,params}.
BIBLIOTHÈQUE (lib) : ${LIB_NAMES.join(", ")}. N'utilise lib QUE pour une pièce qui existe réellement dans le sujet. Une pièce qui n'est pas dans cette liste se modélise avec lathe, extrude, loft, hollow, box arrondie… ; jamais de pièce de bibliothèque posée « pour faire joli ».

QUALITÉ : 12 à 45 pièces cohérentes avec le sujet ; chaque pièce = un petit programme de 3 à 25 nœuds avec détails réels (fixations, ouvertures, nervures, garde-corps, fenêtres via array, chanfreins via box.r) ; proportions réalistes ; symétries par mirror ; toutes les pièces se touchent ou se supportent (rien en lévitation) ; matériaux justes (verre pour les vitres, acier pour la structure…). Pas de sphère ni de cylindre nu pour une pièce complexe.
CHAMPS DE LA SCÈNE : title, summary, renderStyle (realistic|semi|clay|toon|flat|matcap|wire|blueprint|npr : réaliste pour le technique, blueprint pour un plan, toon pour la pédagogie), view, representation (solid par défaut), lighting (studio par défaut), unitScale:1, unitLabel:"m", relationships:[{from,to,type,label}], simplifications:["ce qui est volontairement simplifié"].

EXEMPLE MINIMAL (phare) :
{"type":"scene3d","preset":"assembly","title":"Phare côtier","summary":"Tour conique, galerie, lanterne","renderStyle":"realistic","unitScale":1,"unitLabel":"m","objects":[
{"id":"socle","label":"Socle en pierre","material":"rock","position":[0,0,0],"shape":{"op":"cyl","rt":4.2,"rb":5,"h":1.2,"at":[0,0.6,0]}},
{"id":"tour","label":"Tour conique","major":true,"material":"paint:#f2efe8","position":[0,1.2,0],"shape":{"op":"group","children":[{"op":"lathe","profile":[[2.6,0],[2.4,6],[2,14],[1.8,18]]},{"op":"array","kind":"linear","n":4,"step":[0,3.6,0],"of":{"op":"box","size":[0.5,0.8,0.2],"mat":"glass","at":[0,2.2,2.3]}},{"op":"lathe","profile":[[2.62,3],[2.62,3.5]],"mat":"paint:#c0392b","at":[0,0,0]}]}},
{"id":"galerie","label":"Galerie","material":"steel","position":[0,19.2,0],"shape":{"op":"group","children":[{"op":"cyl","rt":2.6,"rb":2.2,"h":0.3},{"op":"rail","path":[[2.4,0.15,0],[0,0.15,2.4],[-2.4,0.15,0],[0,0.15,-2.4],[2.4,0.15,0]],"h":1.1}]}},
{"id":"lanterne","label":"Lanterne","major":true,"material":"glass","position":[0,19.5,0],"shape":{"op":"group","children":[{"op":"cyl","r":1.3,"h":2.2,"at":[0,1.1,0]},{"op":"dome","r":1.5,"mat":"copper","at":[0,2.2,0]},{"op":"sphere","r":0.4,"mat":"light","at":[0,1.1,0]}]}}]}`;

export async function authorScene({ message, answer, callLLM }) {
  const raw = await callLLM(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Sujet à modéliser : ${String(message).slice(0, 2000)}\n\nContexte de la réponse : ${String(answer || "").slice(0, 3500)}`,
      },
    ],
    {
      profile: "json",
      expectJson: true,
      maxTokens: 12000,
      maxChars: 140000,
      maxModelTries: 2,
      timeoutMs: 60000,
      totalTimeoutMs: 130000,
      order: [
        "gemini",
        "cohere",
        "mistral",
        "openrouter",
        "groq",
        "cloudflare",
        "nvidia",
        "pollinations",
        "github",
      ],
    },
  );
  const j = raw ? repairJson(raw) : null,
    a = j?.artifact && typeof j.artifact === "object" ? j.artifact : j;
  return a && Array.isArray(a.objects) && a.objects.length >= 3
    ? { ...a, type: "scene3d", preset: "assembly" }
    : null;
}
