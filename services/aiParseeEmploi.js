//================ AI PARSEE — MON AIGENT EMPLOI ============================//
// Cascade IA : OpenRouter (découverte des modèles :free réellement dispo)
//            → Mistral (même clé/méthode que les autres AiGENT)
//            → Cohere (découverte dynamique des modèles Chat actifs)
//            → NVIDIA (Llama-3.3-70b, fallback final)
//
// Rôle de ce fichier : extraction des critères Emploi (postulant / recruteur),
// formulation des messages du tunnel, messages de mise en relation, chat
// phase "résultats". Même architecture que aiParsee.js / aiParsee-occas.js.
// ─────────────────────────────────────────────────────────────────────────

import "dotenv/config";

/* ════════════════════════════════════════════════════════════════════════
   HELPERS NUMÉRIQUES / JSON
   ════════════════════════════════════════════════════════════════════════ */
// Détecte une réponse négative/nulle à "avez-vous une expérience dans ce
// domaine ?" (candidat sans expérience préalable dans le métier visé).
// Retourne 0 si c'est bien une réponse de ce type, sinon null.
export function parseNoExperienceAnswer(message) {
  const t = (message || "").trim().toLowerCase();
  if (!t) return null;
  const patterns = [
    /^non\b/,
    /^aucune\b/,
    /^pas encore\b/,
    /^pas d'expérience\b/,
    /^jamais\b/,
    /^débutant/,
    /^0\s*an/,
    /^zéro\b/,
    /^je n'ai pas\b/,
    /^je débute\b/,
    /^première expérience\b/,
    /^ce sera ma première\b/,
  ];
  return patterns.some((re) => re.test(t)) ? 0 : null;
}

export function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, "").replace(/[€$]/g, "");
  if (cleaned.toLowerCase().endsWith("k")) {
    const n = parseFloat(cleaned.slice(0, -1)) * 1000;
    return isNaN(n) ? null : Math.round(n);
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function stripThinking(text) {
  if (!text) return text;
  let cleaned = text;
  // Supprime les blocs de raisonnement explicites (DeepSeek-R1, QwQ, etc.)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
  // Certains modèles renvoient le raisonnement SANS balise, suivi d'une
  // réponse finale après un séparateur du type "Final answer:" / "Réponse :"
  const finalMarkers =
    /(?:^|\n)\s*(?:final answer|réponse finale|réponse)\s*:\s*/i;
  const parts = cleaned.split(finalMarkers);
  if (parts.length > 1) cleaned = parts[parts.length - 1].trim();
  return cleaned;
}

function extractJSON(text) {
  if (!text) return null;
  const cleaned = stripThinking(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const direct = JSON.parse(cleaned);
    if (typeof direct === "object" && direct !== null) return direct;
  } catch (_) {}
  try {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (_) {}
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   PROVIDER 1 — OPENROUTER (découverte des modèles :free — méthode imposée)
   ════════════════════════════════════════════════════════════════════════ */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";
let openRouterModelsCache = null;
let openRouterModelsCacheAt = 0;
const OPENROUTER_MODELS_TTL = 15 * 60 * 1000; // 15 min

function openRouterPriority(model) {
  const id = model.id.toLowerCase();
  // Modèles "reasoning" exclus : exposent un chain-of-thought verbeux, souvent en anglais
  if (/(r1|qwq|thinking|reasoning|o1|o3)/.test(id)) return -1;
  if (id.includes("nemotron")) return 100;
  if (id.includes("trinity-large")) return 95;
  if (id.includes("deepseek")) return 90;
  if (id.includes("qwen")) return 85;
  if (id.includes("llama")) return 80;
  if (id.includes("gemma")) return 70;
  if (id.includes("mistral")) return 60;
  return 10;
}

async function getOpenRouterFreeModels() {
  if (
    openRouterModelsCache &&
    Date.now() - openRouterModelsCacheAt < OPENROUTER_MODELS_TTL
  ) {
    return openRouterModelsCache;
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const response = await fetch(
    `${OPENROUTER_API_URL}/models?output_modalities=text`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.error?.message || data?.message || `HTTP ${response.status}`,
    );
  }

  const models = (data.data || [])
    .filter((model) => {
      const promptPrice = Number(model.pricing?.prompt ?? -1);
      const completionPrice = Number(model.pricing?.completion ?? -1);
      return (
        promptPrice === 0 &&
        completionPrice === 0 &&
        model.architecture?.output_modalities?.includes("text")
      );
    })
    .filter((model) => openRouterPriority(model) >= 0)
    .sort((a, b) => openRouterPriority(b) - openRouterPriority(a))
    .slice(0, 5);

  openRouterModelsCache = models;
  openRouterModelsCacheAt = Date.now();
  return models;
}

async function callOpenRouter(messages, maxTokens = 500, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  let models;
  try {
    models = await getOpenRouterFreeModels();
  } catch (e) {
    console.warn(
      "⚠️ [EMPLOI AI] OpenRouter — impossible de récupérer les modèles:",
      e.message,
    );
    return null;
  }
  if (!models.length) {
    console.warn("⚠️ [EMPLOI AI] OpenRouter — aucun modèle :free disponible");
    return null;
  }

  for (const model of models) {
    try {
      const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model.id,
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.warn(
          `⚠️ [EMPLOI AI] OpenRouter ${model.id} FAILED: HTTP ${response.status} — ${data?.error?.message || data?.message || ""}`,
        );
        continue;
      }
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      if (text && !isUnusableOutput(text, opts)) {
        console.log(`✅ [EMPLOI AI] OpenRouter OK (${model.id})`);
        return text;
      }
      console.warn(
        `⚠️ [EMPLOI AI] OpenRouter ${model.id} — sortie inexploitable, modèle suivant`,
      );
      console.warn(`⚠️ [EMPLOI AI] OpenRouter ${model.id} — réponse vide`);
    } catch (e) {
      console.warn(
        `⚠️ [EMPLOI AI] OpenRouter ${model.id} FAILED:`,
        e.message?.slice(0, 100),
      );
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   PROVIDER 2 — MISTRAL (même clé / même méthode que les autres AiGENT)
   ════════════════════════════════════════════════════════════════════════ */

async function callMistral(messages, maxTokens = 500) {
  const apiKey = process.env.MISTRAL;
  if (!apiKey) return null;
  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages,
        temperature: 0.25,
        max_tokens: maxTokens,
      }),
    });
    if (!r.ok) {
      console.warn(`⚠️ [EMPLOI AI] Mistral FAILED: HTTP ${r.status}`);
      return null;
    }
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content?.trim() || "";
    if (text) {
      console.log("✅ [EMPLOI AI] Mistral OK");
      return text;
    }
    console.warn("⚠️ [EMPLOI AI] Mistral — réponse vide");
    return null;
  } catch (e) {
    console.warn("⚠️ [EMPLOI AI] Mistral FAILED:", e.message?.slice(0, 100));
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   PROVIDER 3 — COHERE (découverte dynamique des modèles Chat actifs)
   ════════════════════════════════════════════════════════════════════════ */

const COHERE_API_URL = "https://api.cohere.com";
let cohereModelsCache = null;
let cohereModelsCacheAt = 0;
const COHERE_MODELS_TTL = 30 * 60 * 1000; // 30 min

function isCohereTextModel(model) {
  return !model.is_deprecated && model.endpoints?.includes("chat");
}

async function getCohereModels() {
  if (
    cohereModelsCache &&
    Date.now() - cohereModelsCacheAt < COHERE_MODELS_TTL
  ) {
    return cohereModelsCache;
  }
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return [];

  const models = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ endpoint: "chat", page_size: "100" });
    if (pageToken) params.set("page_token", pageToken);
    const response = await fetch(`${COHERE_API_URL}/v1/models?${params}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data?.message || data?.error || `HTTP ${response.status}`,
      );
    }
    models.push(...(data.models || []));
    pageToken = data.next_page_token || null;
  } while (pageToken);

  const filtered = models.filter(isCohereTextModel);
  cohereModelsCache = filtered;
  cohereModelsCacheAt = Date.now();
  return filtered;
}

async function callCohere(messages, maxTokens = 500) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return null;

  let models;
  try {
    models = await getCohereModels();
  } catch (e) {
    console.warn(
      "⚠️ [EMPLOI AI] Cohere — impossible de récupérer les modèles:",
      e.message,
    );
    return null;
  }
  if (!models.length) {
    console.warn("⚠️ [EMPLOI AI] Cohere — aucun modèle Chat actif disponible");
    return null;
  }

  for (const model of models) {
    try {
      const response = await fetch(`${COHERE_API_URL}/v2/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model.name,
          messages,
          max_tokens: maxTokens,
          temperature: 0.2,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.warn(
          `⚠️ [EMPLOI AI] Cohere ${model.name} FAILED: HTTP ${response.status} — ${data?.message || data?.error || ""}`,
        );
        continue;
      }
      const content = data?.message?.content;
      const text = Array.isArray(content)
        ? content
            .filter((i) => i?.type === "text")
            .map((i) => i.text)
            .join("\n")
            .trim()
        : "";
      if (text) {
        console.log(`✅ [EMPLOI AI] Cohere OK (${model.name})`);
        return text;
      }
      console.warn(`⚠️ [EMPLOI AI] Cohere ${model.name} — réponse vide`);
    } catch (e) {
      console.warn(
        `⚠️ [EMPLOI AI] Cohere ${model.name} FAILED:`,
        e.message?.slice(0, 100),
      );
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   PROVIDER 4 — NVIDIA (fallback final)
   ════════════════════════════════════════════════════════════════════════ */

async function callNvidia(messages, maxTokens = 500) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "meta/llama-3.3-70b-instruct",
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
          stream: false,
        }),
      },
    );
    if (!r.ok) {
      console.warn(`⚠️ [EMPLOI AI] NVIDIA FAILED: HTTP ${r.status}`);
      return null;
    }
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content?.trim() || "";
    if (text) {
      console.log("✅ [EMPLOI AI] NVIDIA OK");
      return text;
    }
    console.warn("⚠️ [EMPLOI AI] NVIDIA — réponse vide");
    return null;
  } catch (e) {
    console.warn("⚠️ [EMPLOI AI] NVIDIA FAILED:", e.message?.slice(0, 100));
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   CASCADE PRINCIPALE — OpenRouter → Mistral → Cohere → NVIDIA
   ════════════════════════════════════════════════════════════════════════ */

async function callLLM(messages, maxTokens = 500, opts = {}) {
  const or = await callOpenRouter(messages, maxTokens, opts);
  if (or) return stripThinking(or);

  const mistral = await callMistral(messages, maxTokens);
  if (mistral) return stripThinking(mistral);

  const cohere = await callCohere(messages, maxTokens);
  if (cohere) return stripThinking(cohere);

  const nvidia = await callNvidia(messages, maxTokens);
  if (nvidia) return stripThinking(nvidia);
  console.error(
    "❌ [EMPLOI AI] Tous les providers ont échoué (OpenRouter, Mistral, Cohere, NVIDIA)",
  );
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   TAXONOMIE DOMAINE → SOUS-DOMAINE → MÉTIER
   Validation possible à N'IMPORTE QUEL niveau.
   ════════════════════════════════════════════════════════════════════════ */

export const DOMAINES = {
  Informatique: {
    Développement: {
      Web: [
        "Développeur Frontend",
        "Développeur Backend",
        "Développeur Fullstack",
      ],
      Mobile: [
        "Développeur iOS",
        "Développeur Android",
        "Développeur Flutter/React Native",
      ],
      Logiciel: [
        "Ingénieur logiciel",
        "Développeur Embarqué",
        "Développeur Jeux vidéo",
      ],
    },
    "Data / IA": {
      Data: ["Data Analyst", "Data Engineer", "Data Scientist"],
      "Intelligence Artificielle": [
        "Ingénieur Machine Learning",
        "Chercheur IA",
        "MLOps Engineer",
      ],
    },
    Infrastructure: {
      Cloud: ["Ingénieur Cloud", "DevOps Engineer", "SRE"],
      Réseaux: ["Administrateur Réseaux", "Ingénieur Systèmes"],
    },
    Cybersécurité: {
      Sécurité: ["Analyste SOC", "Pentester", "RSSI", "Ingénieur Sécurité"],
    },
    "Produit / Gestion": {
      Produit: ["Product Manager", "Product Owner", "Scrum Master"],
      Support: ["Support Technique", "Technicien Helpdesk"],
    },
  },
  Santé: {
    Soins: {
      Médical: ["Médecin généraliste", "Médecin spécialiste", "Interne"],
      Paramédical: [
        "Infirmier(ère)",
        "Aide-soignant(e)",
        "Kinésithérapeute",
        "Sage-femme",
      ],
    },
    "Pharma / Recherche": {
      Pharmacie: ["Pharmacien", "Préparateur en pharmacie"],
      Recherche: ["Chercheur biomédical", "Ingénieur biotech"],
    },
    Administratif: {
      Gestion: [
        "Secrétaire médical(e)",
        "Gestionnaire d'établissement de santé",
      ],
    },
  },
  Sécurité: {
    "Sécurité privée": {
      Terrain: ["Agent de sécurité", "Agent cynophile", "Rondier"],
      Management: ["Chef d'équipe sécurité", "Responsable sûreté"],
    },
    "Sécurité publique": {
      Forces: ["Policier", "Gendarme", "Sapeur-pompier"],
    },
  },
  Finance: {
    "Banque / Assurance": {
      Conseil: [
        "Conseiller clientèle",
        "Chargé d'affaires",
        "Courtier en assurance",
      ],
      Risque: ["Analyste risques", "Auditeur interne"],
    },
    Comptabilité: {
      Gestion: ["Comptable", "Contrôleur de gestion", "Expert-comptable"],
    },
    "Finance d'entreprise": {
      Analyse: ["Analyste financier", "Trésorier", "Directeur financier"],
    },
  },
  Commerce: {
    Vente: {
      Terrain: ["Vendeur", "Commercial terrain", "Business Developer"],
      Management: ["Responsable commercial", "Directeur des ventes"],
    },
    "Achat / Logistique": {
      Achats: ["Acheteur", "Category Manager"],
      Logistique: ["Responsable logistique", "Approvisionneur"],
    },
  },
  Marketing: {
    "Marketing digital": {
      Acquisition: ["SEA/SEO Manager", "Growth Hacker", "Traffic Manager"],
      Contenu: ["Content Manager", "Community Manager", "Social Media Manager"],
    },
    "Marketing produit": {
      Stratégie: ["Chef de produit marketing", "Brand Manager"],
    },
  },
  Industrie: {
    Production: {
      Terrain: [
        "Opérateur de production",
        "Technicien de maintenance",
        "Chef d'équipe",
      ],
      Ingénierie: [
        "Ingénieur process",
        "Ingénieur qualité",
        "Ingénieur méthodes",
      ],
    },
    "Supply Chain": {
      Logistique: ["Responsable supply chain", "Planificateur"],
    },
  },
  BTP: {
    Chantier: {
      Terrain: ["Chef de chantier", "Conducteur de travaux", "Ouvrier BTP"],
      Bureau: ["Ingénieur BTP", "Architecte", "Dessinateur-projeteur"],
    },
  },
  "Éducation / Formation": {
    Enseignement: {
      Scolaire: ["Professeur des écoles", "Enseignant secondaire"],
      Supérieur: ["Maître de conférences", "Formateur professionnel"],
    },
  },
  "Transport / Logistique": {
    Conduite: {
      Routier: ["Chauffeur livreur", "Chauffeur poids lourd", "Chauffeur VTC"],
    },
    Exploitation: {
      Gestion: [
        "Responsable d'exploitation transport",
        "Agent logistique entrepôt",
      ],
    },
  },
  Juridique: {
    Droit: {
      Cabinet: ["Avocat", "Juriste d'entreprise", "Notaire"],
      Support: ["Assistant(e) juridique", "Clerc de notaire"],
    },
  },
  "Ressources Humaines": {
    RH: {
      Recrutement: ["Chargé de recrutement", "Talent Acquisition Manager"],
      Gestion: ["Gestionnaire de paie", "Responsable RH", "HRBP"],
    },
  },
  "Design / Création": {
    Design: {
      Digital: ["UI Designer", "UX Designer", "Product Designer"],
      Graphique: ["Directeur artistique", "Graphiste", "Motion Designer"],
    },
  },
  "Hôtellerie / Restauration": {
    Cuisine: {
      Terrain: ["Chef de cuisine", "Cuisinier", "Commis de cuisine"],
    },
    Salle: {
      Service: ["Serveur", "Maître d'hôtel", "Réceptionniste"],
    },
  },
  "Agriculture / Environnement": {
    Terrain: {
      Production: ["Agriculteur", "Technicien agricole"],
    },
    Environnement: {
      Conseil: ["Ingénieur environnement", "Chargé d'études environnementales"],
    },
  },
};

export function flattenDomainPath(pathArr = []) {
  return pathArr.filter(Boolean).join(" > ");
}

/* ════════════════════════════════════════════════════════════════════════
   EXTRACTION — POSTULANT vs RECRUTEUR
   ════════════════════════════════════════════════════════════════════════ */

const EXTRACTION_SCHEMA_CANDIDAT = `{
  "domainePath": null,
  "metier": null,
  "salaireMin": null,
  "salaireMax": null,
  "zone": null,
  "toleranceKm": null,
  "experienceAnnees": null,
  "niveauEtude": null,
  "competences": null,
  "preferences": null,
  "remote": null
}`;

const EXTRACTION_SCHEMA_RECRUTEUR = `{
  "domainePath": null,
  "metier": null,
  "salaireMin": null,
  "salaireMax": null,
  "zone": null,
  "toleranceKm": null,
  "experienceRequiseAnnees": null,
  "niveauEtudeRequis": null,
  "competencesRequises": null,
  "typeContrat": null,
  "remote": null
}`;

const LANG_GUARD = `IMPÉRATIF : réponds exclusivement en français courant, comme le ferait un humain à l'oral. N'affiche JAMAIS ton raisonnement, tes étapes de réflexion, de balises comme <think>, ni de méta-commentaire du type "je dois générer", "ma tâche est", "tu es un conseiller"... Ne recopie jamais la consigne. Ne produis aucun mot en anglais. Ne renvoie du JSON QUE si un schéma JSON est explicitement demandé ci-dessous — sinon renvoie une phrase brute, sans accolades, sans guillemets, sans préambule. Une seule réponse finale, rien d'autre.`;

// Ajout : filtre anti-charabia / anti-méta-commentaire / anti-anglais.
// Trop de modèles gratuits d'OpenRouter renvoient leur raisonnement brut
// au lieu du texte final — on rejette ces sorties au lieu de les afficher.
function isUnusableOutput(text, { expectJson = false } = {}) {
  if (!text || !text.trim()) return true;
  const t = text.toLowerCase();
  if (!expectJson && t.length > 420) return true;
  // Une "réponse" de 1-2 mots n'est jamais une vraie phrase de conseiller —
  // c'est presque toujours un verdict de classifieur ou un artefact.
  if (!expectJson && text.trim().split(/\s+/).length < 3) return true;
  const metaPatterns = [
    /\btu es un\b/,
    /\bta tâche\b/,
    /\bla tâche est\b/,
    /\bje dois générer\b/,
    /\bréponds uniquement\b/,
    /\bvoici le message\b/,
    /\ben tant qu'ia\b/,
    /<think/i,
    /\bas an ai\b/,
    /\bokay,?\s*so\b/,
    /\blet me\b/,
    // Sorties de modèles-classifieurs de modération (pas des modèles de chat) :
    // renvoient un verdict au lieu d'une réponse — à rejeter systématiquement.
    /\buser safety\b/i,
    /\bcontent safety\b/i,
    /^\s*(safe|unsafe)\s*[:.]?\s*$/i,
    /\bmoderation (result|verdict|flag)\b/i,
    /\bpolicy violation\b/i,
  ];
  if (metaPatterns.some((re) => re.test(t))) return true;
  if (!expectJson && /[{}]/.test(text)) return true;
  if (/\b\w{3,}ells\w*\b/i.test(t)) return true; // bug connu (répétitions collées)
  const englishTells = (
    t.match(
      /\b(the|here|where|deep|every|this|should|would|i am|as an|okay)\b/g,
    ) || []
  ).length;
  if (englishTells >= 3) return true;
  return false;
}
function buildExtractionPrompt(role) {
  const isCandidat = role === "candidat";
  return `${LANG_GUARD}

Tu es un extracteur d'informations pour une plateforme d'emploi. Tu ne discutes pas, tu ne poses pas de question, tu extrais UNIQUEMENT ce qui est explicitement écrit dans le message pour un ${isCandidat ? "POSTULANT à la recherche d'un emploi" : "RECRUTEUR qui propose un poste, une mission ou une formation"}.
RÈGLES STRICTES :
- N'invente RIEN, ne déduis RIEN. Si une info n'est pas explicitement présente, laisse null.
- Le message peut contenir PLUSIEURS informations : extrais-les TOUTES.
- domainePath : chemine si possible du domaine large vers le métier précis, sous forme de tableau de chaînes, ex: ["Informatique","Développement","Web","Développeur Backend"]. Si seul un grand domaine est cité ("informatique", "santé"...), renseigne un tableau à un seul élément.
- metier : intitulé de poste précis s'il est cité, sinon null.
- Salaire : "35k" / "35 000€" / "2500€/mois" → convertis en annuel brut si mensuel donné (mensuel × 12). "entre 30k et 40k" → salaireMin=30000, salaireMax=40000.
- Zone : ville ou région citée.
- Rayon : "50 km" → toleranceKm=50 / "télétravail total" → remote="total" / "hybride" → remote="hybride" / "présentiel" → remote="non".
- Expérience : "3 ans d'expérience" → ${isCandidat ? "experienceAnnees" : "experienceRequiseAnnees"}=3 / "débutant accepté" → 0.
- Études : niveau cité (ex: "Bac+5", "Master", "BTS", "sans diplôme requis").
- Compétences : liste des compétences/technologies citées, sous forme de tableau de chaînes.
- ${isCandidat ? "preferences : toute préférence libre citée (culture d'entreprise, avantages recherchés, horaires...) sous forme de texte court." : "typeContrat : CDI/CDD/Alternance/Stage/Freelance si mentionné."}

Réponds UNIQUEMENT avec ce JSON strict, sans texte autour, sans commentaire :
${isCandidat ? EXTRACTION_SCHEMA_CANDIDAT : EXTRACTION_SCHEMA_RECRUTEUR}`;
}

function mergeExtractedCriteria(existing, incoming, role) {
  const merged = { ...existing };
  if (!incoming || typeof incoming !== "object") return merged;
  const isCandidat = role === "candidat";

  for (const [key, val] of Object.entries(incoming)) {
    if (val === null || val === undefined || val === "") continue;

    if (key === "domainePath") {
      if (Array.isArray(val) && val.length) merged.domainePath = val;
      else if (typeof val === "string" && val.trim())
        merged.domainePath = val.split(">").map((s) => s.trim());
      continue;
    }
    if (key === "competences" || key === "competencesRequises") {
      const arr = Array.isArray(val)
        ? val
        : String(val)
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean);
      if (arr.length) merged[key] = arr;
      continue;
    }
    if (
      [
        "salaireMin",
        "salaireMax",
        "toleranceKm",
        "experienceAnnees",
        "experienceRequiseAnnees",
      ].includes(key)
    ) {
      const n = normalizeNumber(val);
      if (n !== null) merged[key] = n;
      continue;
    }
    if (key === "remote") {
      const t = String(val).toLowerCase();
      if (t.includes("total")) merged.remote = "total";
      else if (t.includes("hybrid")) merged.remote = "hybride";
      else merged.remote = "non";
      continue;
    }
    if (typeof val === "string" && val.trim()) merged[key] = val.trim();
    else if (typeof val === "object") merged[key] = val;
  }

  if (isCandidat) {
    if (merged.salaireMin != null && merged.salaireMax == null)
      merged.salaireMax = Math.round(merged.salaireMin * 1.2);
  } else {
    if (merged.salaireMax != null && merged.salaireMin == null)
      merged.salaireMin = merged.salaireMax;
    if (merged.salaireMin != null && merged.salaireMax == null)
      merged.salaireMax = merged.salaireMin;
  }

  return merged;
}

export async function extractCriteria(userMessage, role, existingCriteria) {
  const prompt = buildExtractionPrompt(role);
  const aiText = await callLLM(
    [
      { role: "system", content: prompt },
      { role: "user", content: userMessage },
    ],
    350,
    { expectJson: true },
  );

  if (!aiText) return { ...existingCriteria };
  const raw = extractJSON(aiText);
  if (!raw) return { ...existingCriteria };
  return mergeExtractedCriteria(existingCriteria, raw, role);
}

/* ════════════════════════════════════════════════════════════════════════
   FORMULATION — TUNNEL / POP-UPS
   ════════════════════════════════════════════════════════════════════════ */

const FIELD_LABELS = {
  candidat: {
    zone: "la ville ou la zone géographique où le candidat souhaite travailler",
    salaireMax: "la rémunération annuelle brute souhaitée par le candidat",
    experienceAnnees:
      'si le candidat a déjà une expérience dans ce domaine ou ce métier, et si oui depuis combien de temps (une réponse comme "non" ou "débutant" est parfaitement valable)',
    niveauEtude: "le niveau d'études du candidat",
  },
  recruteur: {
    zone: "la ville ou la zone géographique du poste proposé",
    salaireMax: "la rémunération annuelle brute proposée pour le poste",
    experienceRequiseAnnees: "l'expérience minimum requise pour le poste",
    niveauEtudeRequis: "le niveau d'études requis pour le poste",
  },
};

function buildPhrasingPrompt(role, sc, event) {
  const isCandidat = role === "candidat";
  const toneBlock = isCandidat
    ? `Tu t'adresses à un POSTULANT à propos de SA RECHERCHE d'emploi. Ton chaleureux, professionnel, jamais robotique.`
    : `Tu t'adresses à un RECRUTEUR à propos DU POSTE qu'il propose. Ton professionnel, direct, orienté résultat.`;

  let task = "";
  if (event.type === "question") {
    const label = FIELD_LABELS[role][event.field] || event.field;
    task = `Pose UNE SEULE question courte et naturelle pour connaître : ${label}. Deux phrases maximum.`;
  } else if (event.type === "popup") {
    const LABELS = {
      domaine:
        "un sélecteur de domaine professionnel (secteur puis métier précis, à n'importe quel niveau)",
      zone: "un sélecteur de zone géographique",
      diplome: "un sélecteur de niveau d'études / diplôme",
      competences: "un sélecteur de compétences clés",
      documents:
        "une interface pour ajouter des diplômes ou documents justificatifs",
      cvlettre: "une interface pour ajouter un CV et une lettre de motivation",
      recap: "un récapitulatif final avant publication du profil",
    };
    task = `Annonce en 1 à 2 phrases chaleureuses que tu vas maintenant afficher ${LABELS[event.popup] || event.popup}. Ne pose AUCUNE question, l'interface s'affiche juste après.`;
  } else if (event.type === "match_intro") {
    task = event.hasMatches
      ? `Annonce avec enthousiasme que le profil est publié et que tu as trouvé des correspondances (${isCandidat ? "offres" : "candidats"}) compatibles.`
      : `Explique avec empathie qu'aucune correspondance parfaite n'a été trouvée pour l'instant, et propose 2-3 pistes concrètes (élargir la zone, ajuster le salaire, revoir l'expérience demandée).`;
  } else if (event.type === "modify_prompt") {
    task = `Demande gentiment ce que la personne souhaite modifier dans son profil.`;
  }

  const known = Object.entries(sc)
    .filter(
      ([k, v]) =>
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    )
    .map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join("/") : v}`)
    .join(", ");

  return `Tu es un conseiller carrière expert, chaleureux, jamais robotique.

${toneBlock}

Informations déjà connues (ne les redemande jamais) : ${known || "aucune pour l'instant"}.

TÂCHE : ${task}

Réponds UNIQUEMENT avec le texte du message, sans JSON, sans guillemets, sans préambule.`;
}

function fallbackPhrase(role, sc, event) {
  const isCandidat = role === "candidat";
  if (event.type === "question") {
    const FALLBACKS = {
      candidat: {
        zone: "Dans quelle ville ou région souhaitez-vous travailler ?",
        salaireMax: "Quelle rémunération annuelle visez-vous ?",
        experienceAnnees:
          "Avez-vous déjà une expérience dans ce domaine ? Si oui, depuis combien de temps ?",
        niveauEtude: "Quel est votre plus haut niveau d'études ?",
      },
      recruteur: {
        zone: "Dans quelle ville se situe le poste ?",
        salaireMax: "Quelle rémunération proposez-vous pour ce poste ?",
        experienceRequiseAnnees: "Quelle expérience minimum recherchez-vous ?",
        niveauEtudeRequis: "Quel niveau d'études demandez-vous ?",
      },
    };
    return (
      FALLBACKS[role]?.[event.field] || "Pouvez-vous m'en dire un peu plus ?"
    );
  }
  if (event.type === "popup") {
    const FALLBACKS = {
      domaine:
        "Je vous propose de préciser votre domaine ci-dessous — vous pouvez valider à tout moment.",
      zone: "Sélectionnez votre zone géographique ci-dessous.",
      diplome: "Indiquez votre niveau d'études ci-dessous.",
      competences: "Sélectionnez vos compétences clés ci-dessous.",
      documents: "Ajoutez vos diplômes ou documents ci-dessous.",
      cvlettre: "Ajoutez votre CV et votre lettre de motivation ci-dessous.",
      recap: "Voici le récapitulatif de votre profil avant publication.",
    };
    return FALLBACKS[event.popup] || "Continuons.";
  }
  if (event.type === "match_intro") {
    return event.hasMatches
      ? `Votre profil est publié ! Voici les ${isCandidat ? "offres" : "candidats"} les plus compatibles.`
      : "Aucune correspondance parfaite pour le moment. Vous pouvez élargir la zone, ajuster le salaire ou l'expérience.";
  }
  if (event.type === "modify_prompt")
    return "Bien sûr, dites-moi ce que vous souhaitez modifier.";
  return "Je vous écoute.";
}

export async function generatePhrasing(role, sc, event) {
  try {
    const prompt = buildPhrasingPrompt(role, sc, event);
    const aiText = await callLLM(
      [
        { role: "system", content: prompt },
        { role: "user", content: "Génère le message." },
      ],
      180,
    );
    if (aiText && aiText.trim() && !isUnusableOutput(aiText)) {
      return aiText.trim().replace(/^"|"$/g, "");
    }
  } catch (e) {
    console.warn("⚠️ [EMPLOI AI] Phrasing FAILED:", e?.message?.slice(0, 100));
  }
  return fallbackPhrase(role, sc, event);
}

/* ════════════════════════════════════════════════════════════════════════
   MISE EN RELATION
   ════════════════════════════════════════════════════════════════════════ */

export async function generateContactMessage(
  senderRole,
  senderCriteria,
  targetProfile,
) {
  const isCandidat = senderRole === "candidat";
  const prompt = `Tu es un conseiller carrière expert. Rédige un message de prise de contact professionnel, court (5-7 lignes), pour une mise en relation emploi.

ÉMETTEUR : ${isCandidat ? "Candidat" : "Recruteur"}
${
  isCandidat
    ? `Recherche : ${senderCriteria.metier || (senderCriteria.domainePath || []).join(" > ") || "poste"} — ${senderCriteria.zone || "N/A"} — rémunération visée ${senderCriteria.salaireMax ? senderCriteria.salaireMax.toLocaleString("fr-FR") + " €/an" : "N/A"}`
    : `Poste proposé : ${senderCriteria.metier || (senderCriteria.domainePath || []).join(" > ") || "poste"} — ${senderCriteria.zone || "N/A"} — rémunération ${senderCriteria.salaireMax ? senderCriteria.salaireMax.toLocaleString("fr-FR") + " €/an" : "N/A"}`
}

DESTINATAIRE :
${
  isCandidat
    ? `Offre : ${targetProfile.metier || "poste"} à ${targetProfile.zone} — Compatibilité ${targetProfile.compatibility}%`
    : `Candidat : ${targetProfile.metier || "profil"} — ${targetProfile.zone || "N/A"} — Compatibilité ${targetProfile.compatibility}%`
}

Consignes : commence par "Bonjour,", mentionne le point commun clé, invite à échanger, pas de formule creuse. Réponds UNIQUEMENT avec le texte du message.`;

  const aiText = await callLLM(
    [
      { role: "system", content: prompt },
      { role: "user", content: "Génère le message de mise en relation." },
    ],
    280,
  );

  if (!aiText) {
    return isCandidat
      ? `Bonjour,\n\nVotre offre à ${targetProfile.zone} correspond à ma recherche. Seriez-vous disponible pour échanger ?\n\nCordialement.`
      : `Bonjour,\n\nVotre profil correspond au poste que je propose à ${senderCriteria.zone}. Je serais ravi d'échanger avec vous.\n\nCordialement.`;
  }
  return aiText.trim();
}

/* ════════════════════════════════════════════════════════════════════════
   PHASE RÉSULTATS
   ════════════════════════════════════════════════════════════════════════ */

export function detectResultsIntent(userMessage) {
  const msg = (userMessage || "").toLowerCase().trim();
  if (
    /mise en relation|contact|contacter|envoyer un message|écrire à|joindre/i.test(
      msg,
    )
  )
    return "contact";
  if (
    /modif|chang|adjust|revoir|reprendre|nouveau|différent|autre|élargir|réduire|salaire|zone|expérience|diplôme|compétence/i.test(
      msg,
    )
  )
    return "modify_criteria";
  if (
    /marché|tendance|analyse|évolution|secteur|recrutement|tension/i.test(msg)
  )
    return "market_analysis";
  if (
    /compar|meilleur|lequel|priorité|classer|rang|différence entre|vs\b|versus/i.test(
      msg,
    )
  )
    return "compare";
  if (
    /détail|plus d'info|dis-moi|parle-moi|ce profil|cette offre|ce candidat/i.test(
      msg,
    )
  )
    return "detail";
  return "general";
}

function buildResultsPrompt(role, sc, matches, userMessage, intent) {
  const isCandidat = role === "candidat";
  const topMatches = (matches || []).slice(0, 5);

  const criteriaLines = [
    sc.zone && `Zone : ${sc.zone}`,
    (sc.metier || (sc.domainePath || []).length) &&
      `${isCandidat ? "Métier visé" : "Poste"} : ${sc.metier || (sc.domainePath || []).join(" > ")}`,
    sc.salaireMax &&
      `${isCandidat ? "Rémunération visée" : "Rémunération proposée"} : ${sc.salaireMax} €/an`,
    (sc.experienceAnnees != null || sc.experienceRequiseAnnees != null) &&
      `Expérience : ${sc.experienceAnnees ?? sc.experienceRequiseAnnees} ans`,
  ].filter(Boolean);

  let intentInstruction = "";
  if (intent === "contact") {
    intentInstruction = `INTENTION : MISE EN RELATION. Demande QUEL profil contacter parmi la liste numérotée. Le système gère l'envoi automatiquement.`;
  } else if (intent === "modify_criteria") {
    intentInstruction = `INTENTION : MODIFICATION. Récapitule les critères actuels clairement puis demande ce qu'il veut ajuster.`;
  } else if (intent === "market_analysis") {
    intentInstruction = `INTENTION : ANALYSE MARCHÉ. Analyse la tension recrutement/candidats sur ce métier et cette zone, donne une recommandation chiffrée.`;
  } else if (intent === "compare") {
    intentInstruction = `INTENTION : COMPARAISON. Compare objectivement les profils (rémunération, compétences, expérience, compatibilité) et recommande le meilleur avec justification.`;
  } else {
    intentInstruction = `INTENTION : CONSEIL GÉNÉRAL. Réponds avec expertise en t'appuyant sur les données réelles.`;
  }

  return `Tu es un conseiller carrière expert de haut niveau. Un ${isCandidat ? "candidat" : "recruteur"} vient de recevoir ses résultats de matching.

PROFIL :
${criteriaLines.map((l) => `  - ${l}`).join("\n") || "  (incomplet)"}

RÉSULTATS (${topMatches.length}) :
${JSON.stringify(topMatches, null, 2)}

MESSAGE UTILISATEUR : "${userMessage}"

${intentInstruction}

RÈGLES : maximum 4 phrases sauf comparaison détaillée, jamais de répétition, toujours factuel. Va directement au contenu, pas de texte parasite.

Réponds UNIQUEMENT avec ce JSON :
{ "message": "ta réponse", "intent": "${intent}" }`.trim();
}

export async function aiResultsChat(
  userMessage,
  existingCriteria = {},
  context = {},
) {
  const role = context.role || "candidat";
  const matches = Array.isArray(context.matchingProfiles)
    ? context.matchingProfiles
    : [];
  const intent = detectResultsIntent(userMessage);

  const systemPrompt = buildResultsPrompt(
    role,
    existingCriteria,
    matches,
    userMessage,
    intent,
  );
  const aiText = await callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    550,
    { expectJson: true },
  );

  if (!aiText)
    return {
      message: "Je suis à votre disposition pour analyser ces résultats.",
      intent: "general",
    };

  const raw = extractJSON(aiText);
  if (!raw) return { message: aiText.trim(), intent };
  return {
    message: raw?.message?.trim() || "Je suis à votre disposition.",
    intent: raw?.intent || intent,
  };
}
