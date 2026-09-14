/**
 * ============================================================
 * CHAT EMPLOI — FRONT COMPLET
 * ============================================================
 * Tunnel IA candidat/recruteur piloté par le serveur (déterministe),
 * pop-ups domaine>sous-domaine>métier, zone, diplôme, compétences,
 * CV/lettre, récapitulatif de profil avant publication, rendu du
 * matching (offres/candidats) et phase "résultats" (conseil,
 * comparaison, analyse marché, mise en relation).
 *
 * Branché sur ./server-emploi.js (monté via app.use(emploiRoutes))
 * et sur ./services/aiParseeEmploi.js pour toute la logique métier :
 * ce fichier ne réinvente aucun critère, il affiche et transmet.
 * ============================================================
 */

const API_BASE = "";
const ROLE_LABELS = { candidat: "Candidat", recruteur: "Recruteur" };

const state = {
  user: null,
  role: null,
  criteria: {},
  documents: {},
  history: [],
  sending: false,
  phase: null,
  lastMatches: [],
  domaines: null,
  ui: {
    domainePopupOpened: false,
    zonePopupOpened: false,
    diplomePopupOpened: false,
    competencesPopupOpened: false,
    cvlettrePopupOpened: false,
    recapPopupOpened: false,
  },
};

const $ = (id) => document.getElementById(id);
const scrollBottom = (el, smooth = true) =>
  el?.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
const esc = (s) => String(s ?? "").replace(/</g, "&lt;");

const storageKey = (key) =>
  state.user ? `${key}_emploi_${state.user.username}` : null;
const save = (key, value) => {
  const k = storageKey(key);
  if (k) localStorage.setItem(k, JSON.stringify(value));
};
const load = (key) => {
  const k = storageKey(key);
  if (!k) return null;
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};

function restoreSession() {
  const raw = localStorage.getItem("agent_emploi_user");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.user = parsed?.user
      ? { ...parsed.user, token: parsed.token }
      : parsed;
    state.role = state.user?.role ?? null;

    // Détection d'une NOUVELLE connexion : chaque login émet un token
    // différent (le précédent expire en 6h). Si le token a changé depuis
    // la dernière visite, on efface le chat/critères locaux — l'annonce déjà
    // publiée en base (published_criteria/documents) n'est jamais touchée.
    const lastToken = localStorage.getItem("agent_emploi_last_token");
    const isNewLogin = state.user?.token && state.user.token !== lastToken;

    if (isNewLogin) {
      localStorage.setItem("agent_emploi_last_token", state.user.token);
      state.criteria = { intent: state.role };
      state.documents = {};
      state.history = [];
      save("criteria", state.criteria);
      save("documents", state.documents);
      save("chat", state.history);
      save("phase", null);
      save("lastMatches", []);
    } else {
      state.criteria = load("criteria") ?? { intent: state.role };
      state.documents = load("documents") ?? {};
      state.history = load("chat") ?? [];
    }
  } catch {}
}

/* ════════════════════════════════════════════════════════════════════════
   ICÔNES (SVG uniquement — aucun emoji)
   ════════════════════════════════════════════════════════════════════════ */
const ICONS = {
  briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>`,
  cap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>`,
  award: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  handshake: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12l3 3 8-8"/><path d="M2 12l4-4 4 2 3-3 5 5-3 3-3-2-4 4-4-2z"/></svg>`,
  trend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  sliders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h13"/><path d="M13 6l7 6-7 6"/></svg>`,
};

/* Logo AiGENT Emploi en SVG pur (losanges et flèche ascendante) */
const AIGENT_LOGO_SVG = `
  <svg viewBox="0 0 220 170" xmlns="http://www.w3.org/2000/svg">
    <g class="lg-diamonds">
      <rect class="lg-shape" x="20" y="22" width="96" height="96" rx="20" transform="rotate(45 68 70)"/>
      <rect class="lg-shape" x="96" y="22" width="96" height="96" rx="20" transform="rotate(45 144 70)"/>
    </g>
    <g class="lg-arrow">
      <path class="lg-shape" d="M118 118 L158 78"/>
      <path class="lg-shape" d="M132 76 L160 76 L160 104"/>
    </g>
    <path class="lg-pulse" d="M118 118 L158 78 M132 76 L160 76 L160 104"/>
  </svg>`;

/** Fabrique un span.aigent-logo prêt à l'emploi (mode "idle" ou "thinking"). */
function renderAigentLogo(mode = "idle") {
  return `<span class="aigent-logo is-${mode}" aria-hidden="true">${AIGENT_LOGO_SVG}</span>`;
}
/* ════════════════════════════════════════════════════════════════════════
   NIVEAUX D'ÉTUDES (alignés sur etudeRank du matching engine)
   ════════════════════════════════════════════════════════════════════════ */
const NIVEAU_ETUDE_OPTIONS = [
  { value: "Aucun diplôme requis", label: "Aucun diplôme requis" },
  { value: "CAP / BEP", label: "CAP / BEP" },
  { value: "Bac", label: "Bac" },
  { value: "BTS / DUT (Bac+2)", label: "BTS / DUT (Bac+2)" },
  { value: "Licence (Bac+3)", label: "Licence (Bac+3)" },
  { value: "Master (Bac+5)", label: "Master (Bac+5)" },
  { value: "Doctorat (Bac+8)", label: "Doctorat (Bac+8)" },
];

const TYPE_CONTRAT_OPTIONS = [
  { value: "CDI", label: "CDI" },
  { value: "CDD", label: "CDD" },
  { value: "Alternance", label: "Alternance" },
  { value: "Stage", label: "Stage" },
  { value: "Freelance", label: "Freelance" },
];

/* ════════════════════════════════════════════════════════════════════════
   EMPTY STATE
   ════════════════════════════════════════════════════════════════════════ */
function emptyStateHTML() {
  const isRecruteur = state.role === "recruteur";
  const cards = isRecruteur
    ? [
        {
          icon: ICONS.briefcase,
          title: "Publier une offre",
          prompt:
            "Je souhaite publier une offre d'emploi pour recruter un profil.",
        },
        {
          icon: ICONS.users,
          title: "Trouver des candidats",
          prompt:
            "Je recherche des candidats compatibles avec un poste que je propose.",
        },
        {
          icon: ICONS.sliders,
          title: "Définir mes critères",
          prompt:
            "Aide-moi à définir précisément le profil recherché pour ce poste.",
        },
        {
          icon: ICONS.trend,
          title: "Analyser le marché",
          prompt:
            "Peux-tu analyser les tendances actuelles du marché de l'emploi sur ce secteur ?",
        },
      ]
    : [
        {
          icon: ICONS.target,
          title: "Trouver un emploi",
          prompt:
            "Je suis à la recherche d'un nouvel emploi correspondant à mon profil.",
        },
        {
          icon: ICONS.file,
          title: "Déposer mon CV",
          prompt:
            "Je veux déposer mon CV et ma lettre de motivation pour être mis en relation avec des recruteurs.",
        },
        {
          icon: ICONS.cap,
          title: "Changer de métier",
          prompt:
            "Je souhaite me réorienter professionnellement vers un nouveau métier.",
        },
        {
          icon: ICONS.trend,
          title: "Analyser le marché",
          prompt:
            "Peux-tu analyser les tendances actuelles du marché de l'emploi sur mon secteur ?",
        },
      ];

  return `
  <div class="chat-empty-state" id="chat-empty-state">
    <div class="ces-inner">
      <div class="ces-badge"><span class="pulse-dot"></span>Moteur de mise en relation Emploi — actif</div>
      <h1 class="ces-title">${
        isRecruteur
          ? "Trouvez le bon talent,<br/>plus vite."
          : "Trouvez le poste,<br/>qui vous correspond."
      }</h1>
      <p class="ces-sub">${
        isRecruteur
          ? "Décrivez le poste à pourvoir — l'IA structure vos critères, publie votre offre et vous met en relation avec les candidats les plus pertinents."
          : "Décrivez votre recherche — l'IA analyse métier, zone, rémunération et compétences pour vous mettre en relation directement avec les bonnes offres."
      }</p>
      <div class="ces-cards">
        ${cards
          .map(
            (c, i) => `
          <div class="ces-card" data-prompt="${esc(c.prompt)}">
            <div class="ces-card-icon c${(i % 4) + 1}">${c.icon}</div>
            <div class="ces-card-title">${esc(c.title)}</div>
          </div>`,
          )
          .join("")}
      </div>
    </div>
  </div>`;
}

function bindEmptyStateEvents() {
  document.querySelectorAll(".ces-card").forEach((card) => {
    card.addEventListener("click", () => {
      const prompt =
        card.dataset.prompt ||
        card.querySelector(".ces-card-title")?.textContent?.trim();
      const input = $("user-input");
      if (input && prompt) {
        input.value = prompt;
        input.focus();
        input.dispatchEvent(new Event("input"));
      }
    });
  });
}

/* ════════════════════════════════════════════════════════════════════════
   MESSAGERIE
   ════════════════════════════════════════════════════════════════════════ */
function addThinkingIndicator() {
  const box = $("chat-box");
  const el = document.createElement("div");
  el.className = "msg bot thinking-msg";
  el.innerHTML = `
    <div class="bot-row">
      ${renderAigentLogo("thinking")}
      <span class="thinking-shimmer">Analyse en cours</span>
    </div>`;
  box.appendChild(el);
  scrollBottom(box);
  return el;
}

function addMessage({
  text,
  from = "bot",
  structured = false,
  persist = true,
  typing = false,
}) {
  if (!text) return;
  const es = document.querySelector(".chat-empty-state");
  if (es) es.remove();

  const box = $("chat-box");
  const row = document.createElement("div");
  row.className = `msg ${from} ${structured ? "structured" : "text-msg"}`;

  if (from === "user") {
    row.innerHTML = `<div class="bubble-user">${esc(text)}</div>`;
    box.appendChild(row);
  } else if (structured) {
    const c = document.createElement("div");
    c.innerHTML = text;
    row.appendChild(c);
    box.appendChild(row);
  } else {
    row.innerHTML = `
      <div class="bot-row">
        ${renderAigentLogo("idle")}
        <div class="ai-text"></div>
      </div>`;
    box.appendChild(row);
    const aiText = row.querySelector(".ai-text");
    if (typing) {
      let i = 0;
      const full = text;
      const step = () => {
        if (i < full.length) {
          aiText.innerHTML = esc(full.substring(0, i + 1));
          i++;
          scrollBottom(box);
          setTimeout(step, Math.random() * 11 + 3);
        }
      };
      step();
    } else {
      aiText.innerHTML = esc(text);
    }
  }

  if (persist && state.user) {
    state.history.push({ role: from, content: text, structured });
    save("chat", state.history);
  }
  scrollBottom(box);
}

/* ════════════════════════════════════════════════════════════════════════
   APPELS RÉSEAU
   ════════════════════════════════════════════════════════════════════════ */
async function postChat(payload) {
  const res = await fetch(`${API_BASE}/emploi/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.user?.token || ""}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function sendMessage(text) {
  if (state.sending || !text) return;
  state.sending = true;
  addMessage({ text, from: "user" });
  const thinkEl = addThinkingIndicator();
  try {
    const data = await postChat({ message: text });
    thinkEl.remove();
    await handleServerResponse(data);
  } catch (e) {
    thinkEl.remove();
    addMessage({
      text: "Erreur de communication avec le serveur.",
      from: "bot",
    });
  } finally {
    state.sending = false;
  }
}

async function sendSpecialUpdate(payload) {
  const thinkEl = addThinkingIndicator();
  try {
    const data = await postChat(payload);
    thinkEl.remove();
    await handleServerResponse(data);
  } catch (e) {
    thinkEl.remove();
    addMessage({ text: "Erreur de communication.", from: "bot" });
  }
}

/* ════════════════════════════════════════════════════════════════════════
   DISPATCH DES RÉPONSES SERVEUR
   ════════════════════════════════════════════════════════════════════════ */
async function handleServerResponse(data) {
  if (!data || data.success === false) {
    addMessage({
      text: data?.error || "Une erreur est survenue.",
      from: "bot",
    });
    return;
  }

  if (data.phase) {
    state.phase = data.phase;
    save("phase", data.phase);
    if (data.phase === "results") unlockPanelActions();
    else lockPanelActions();
  }

  if (data.criteria) {
    state.criteria = { ...state.criteria, ...data.criteria };
    save("criteria", state.criteria);
    updateAIPanel();
  }

  const isInitialMatchDisplay =
    data.matchingDone && data.actionType === undefined;
  if (data.reply && !isInitialMatchDisplay) {
    addMessage({ text: data.reply, from: "bot", typing: true });
  }

  if (
    data.messageSent &&
    data.contactInfo &&
    data.actionType === "contact_done"
  ) {
    renderContactSuccessCard(data.contactInfo.name, data.contactInfo.email);
  }

  if (data.triggerDomainePopup && !state.ui.domainePopupOpened) {
    state.ui.domainePopupOpened = true;
    setTimeout(openDomainePopup, 650);
    return;
  }
  if (data.triggerZonePopup && !state.ui.zonePopupOpened) {
    state.ui.zonePopupOpened = true;
    setTimeout(openZonePopup, 650);
    return;
  }
  if (data.triggerDiplomePopup && !state.ui.diplomePopupOpened) {
    state.ui.diplomePopupOpened = true;
    setTimeout(openDiplomePopup, 650);
    return;
  }
  if (data.triggerCompetencesPopup && !state.ui.competencesPopupOpened) {
    state.ui.competencesPopupOpened = true;
    setTimeout(openCompetencesPopup, 650);
    return;
  }
  if (data.triggerCvlettrePopup && !state.ui.cvlettrePopupOpened) {
    state.ui.cvlettrePopupOpened = true;
    setTimeout(openCvLettrePopup, 650);
    return;
  }
  if (data.triggerRecapPopup) {
    state.ui.recapPopupOpened = true;
    setTimeout(
      () =>
        openRecapPopup(
          data.recapData || {
            ...state.criteria,
            role: state.role,
            documents: state.documents,
          },
        ),
      650,
    );
    return;
  }

  if (data.matchingDone) {
    state.phase = "results";
    save("phase", "results");
    unlockPanelActions();

    if (data.actionType === "criteria_updated" && Array.isArray(data.matches)) {
      state.lastMatches = data.matches;
      save("lastMatches", data.matches);
      renderMatches(data.matches, null);
    } else if (isInitialMatchDisplay) {
      state.lastMatches = data.matches || [];
      save("lastMatches", state.lastMatches);
      // Réinitialise les gardes de pop-up pour un futur "Modifier mes critères".
      Object.keys(state.ui).forEach((k) => (state.ui[k] = false));
      if (Array.isArray(data.matches) && data.matches.length > 0) {
        renderMatches(data.matches, data.postReply);
      } else if (data.postReply) {
        addMessage({ text: data.postReply, from: "bot", typing: true });
      }
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════
   PANNEAU CRITÈRES (droite)
   ════════════════════════════════════════════════════════════════════════ */
function updateAIPanel() {
  const c = state.criteria;
  const isRecruteur = state.role === "recruteur";
  const set = (id, val) => {
    const el = $(id);
    if (el) el.textContent = val ?? "En attente";
  };

  const metier =
    c.metier || (c.domainePath || [])[(c.domainePath || []).length - 1] || null;
  set(
    "ai-metier",
    metier ||
      (c.domainePath && c.domainePath.length
        ? c.domainePath.join(" › ")
        : null),
  );

  const zoneLabel = document
    .getElementById("ai-zone")
    ?.closest(".criteria-item")
    ?.querySelector(".criteria-label");
  set(
    "ai-zone",
    c.zone
      ? `${c.zone}${c.remote === "total" ? " · télétravail total" : c.remote === "hybride" ? " · hybride" : ""}`
      : null,
  );

  const salaireLabelEl = document
    .getElementById("ai-salaire")
    ?.closest(".criteria-item")
    ?.querySelector(".criteria-label");
  if (salaireLabelEl)
    salaireLabelEl.textContent = isRecruteur
      ? "Rémunération proposée"
      : "Rémunération visée";
  set(
    "ai-salaire",
    c.salaireMax
      ? `${Number(c.salaireMax).toLocaleString("fr-FR")} €/an`
      : null,
  );

  const expLabelEl = document
    .getElementById("ai-experience")
    ?.closest(".criteria-item")
    ?.querySelector(".criteria-label");
  if (expLabelEl)
    expLabelEl.textContent = isRecruteur
      ? "Expérience requise"
      : "Expérience dans le domaine";
  const exp = isRecruteur ? c.experienceRequiseAnnees : c.experienceAnnees;
  set(
    "ai-experience",
    exp != null
      ? exp === 0
        ? isRecruteur
          ? "Non exigée"
          : "Aucune expérience"
        : `${exp} an${exp > 1 ? "s" : ""}`
      : null,
  );

  set("ai-etudes", (isRecruteur ? c.niveauEtudeRequis : c.niveauEtude) || null);

  const comp = isRecruteur ? c.competencesRequises : c.competences;
  set(
    "ai-competences",
    Array.isArray(comp) && comp.length
      ? comp.slice(0, 3).join(", ") + (comp.length > 3 ? "…" : "")
      : null,
  );

  const docRow = document
    .getElementById("ai-documents")
    ?.closest(".criteria-item");
  if (docRow) {
    if (isRecruteur) {
      docRow.style.display = "none";
    } else {
      docRow.style.display = "";
      const has = state.documents?.cv || state.documents?.lettre;
      set(
        "ai-documents",
        has ? "CV / lettre ajoutés" : c.cvLettreDecided ? "Non fourni" : null,
      );
    }
  }

  const contratRow = document
    .getElementById("ai-contrat")
    ?.closest(".criteria-item");
  if (contratRow) {
    if (isRecruteur) {
      contratRow.style.display = "";
      set("ai-contrat", c.typeContrat || null);
    } else {
      contratRow.style.display = "none";
    }
  }
}

function unlockPanelActions() {
  ["btn-mise-relation", "btn-analyse-marche", "btn-modifier-criteres"].forEach(
    (id) => {
      const btn = $(id);
      if (btn) {
        btn.removeAttribute("disabled");
        btn.classList.remove("is-locked");
      }
    },
  );
}
function lockPanelActions() {
  ["btn-mise-relation", "btn-analyse-marche", "btn-modifier-criteres"].forEach(
    (id) => {
      const btn = $(id);
      if (btn) {
        btn.setAttribute("disabled", "true");
        btn.classList.add("is-locked");
      }
    },
  );
}

/* ════════════════════════════════════════════════════════════════════════
   POP-UP HELPERS (bulle structurée dans le chat)
   ════════════════════════════════════════════════════════════════════════ */
function popupBubble(innerHTML, extraClass = "") {
  const row = document.createElement("div");
  row.className = "msg bot structured";
  row.innerHTML = `<div class="bubble saas-popup ${extraClass}">${innerHTML}</div>`;
  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));
  return row;
}

function popupHeader(icon, title, sub) {
  return `
    <div class="saas-popup-header">
      <div class="saas-popup-icon">${icon}</div>
      <div>
        <h3 class="saas-popup-title">${esc(title)}</h3>
        <p class="saas-popup-sub">${esc(sub)}</p>
      </div>
    </div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   POP-UP 1 — DOMAINE › SOUS-DOMAINE › MÉTIER
   ════════════════════════════════════════════════════════════════════════ */
async function fetchDomaines() {
  if (state.domaines) return state.domaines;
  try {
    const res = await fetch(`${API_BASE}/emploi/api/domaines`, {
      headers: { Authorization: `Bearer ${state.user?.token || ""}` },
    });
    const data = await res.json();
    state.domaines = data.domaines || {};
  } catch {
    state.domaines = {};
  }
  return state.domaines;
}

async function openDomainePopup() {
  const domaines = await fetchDomaines();
  const path = []; // chemin en cours de construction

  const row = popupBubble(
    `
    ${popupHeader(ICONS.briefcase, "Domaine professionnel", "Affinez jusqu'au métier précis, ou validez à tout moment")}
    <div class="domain-breadcrumb" id="dp-breadcrumb"></div>
    <div class="domain-grid" id="dp-grid"></div>
    <div class="saas-popup-actions">
      <button class="btn-saas-ghost" id="dp-back" style="display:none">Précédent</button>
      <button class="btn-saas-primary" id="dp-valider" disabled>${ICONS.check} Valider ce niveau</button>
    </div>`,
    "domaine-popup",
  );

  const breadcrumb = row.querySelector("#dp-breadcrumb");
  const grid = row.querySelector("#dp-grid");
  const backBtn = row.querySelector("#dp-back");
  const validerBtn = row.querySelector("#dp-valider");

  function currentLevelData() {
    let node = domaines;
    for (const seg of path) {
      if (node && typeof node === "object" && !Array.isArray(node))
        node = node[seg];
      else return null;
    }
    return node;
  }

  function renderBreadcrumb() {
    breadcrumb.innerHTML =
      path.length === 0
        ? `<span class="crumb-empty">Choisissez un domaine</span>`
        : path
            .map(
              (p, i) =>
                `<span class="crumb-item">${esc(p)}</span>${i < path.length - 1 ? `<span class="crumb-sep">${ICONS.chevron}</span>` : ""}`,
            )
            .join("");
  }

  function renderGrid() {
    const node = currentLevelData();
    grid.innerHTML = "";

    if (Array.isArray(node)) {
      // Niveau final : liste de métiers
      node.forEach((metier) => {
        const btn = document.createElement("button");
        btn.className = "domain-card domain-card-leaf";
        btn.innerHTML = `<span>${esc(metier)}</span>${ICONS.chevron}`;
        btn.onclick = () => {
          grid
            .querySelectorAll(".domain-card")
            .forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          path.push(metier);
          validerBtn.disabled = false;
          renderBreadcrumb();
        };
        grid.appendChild(btn);
      });
    } else if (node && typeof node === "object") {
      Object.keys(node).forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "domain-card";
        btn.innerHTML = `<span>${esc(key)}</span>${ICONS.chevron}`;
        btn.onclick = () => {
          path.push(key);
          validerBtn.disabled = false;
          renderBreadcrumb();
          renderGrid();
        };
        grid.appendChild(btn);
      });
    }

    backBtn.style.display = path.length ? "inline-flex" : "none";
    validerBtn.disabled = path.length === 0;
  }

  backBtn.onclick = () => {
    path.pop();
    renderBreadcrumb();
    renderGrid();
  };

  validerBtn.onclick = () => {
    addMessage({ text: `Domaine : ${path.join(" › ")}`, from: "user" });
    row.remove();
    sendSpecialUpdate({
      domainePath: [...path],
      message: "__DOMAINE_SELECTED__",
    });
  };

  renderBreadcrumb();
  renderGrid();
}

/* ════════════════════════════════════════════════════════════════════════
   POP-UP 2 — ZONE GÉOGRAPHIQUE
   ════════════════════════════════════════════════════════════════════════ */
const REMOTE_OPTIONS = [
  { value: "non", label: "Présentiel" },
  { value: "hybride", label: "Hybride" },
  { value: "total", label: "Télétravail total" },
];

function openZonePopup() {
  const row = popupBubble(
    `
    ${popupHeader(ICONS.pin, "Zone géographique", state.role === "recruteur" ? "Où se situe le poste ?" : "Où souhaitez-vous travailler ?")}
    <input type="text" id="zp-input" class="saas-text-input" placeholder="Ville, région..." autocomplete="off"/>
    <div class="chip-row" id="zp-remote">
      ${REMOTE_OPTIONS.map((r) => `<button class="chip-option" data-value="${r.value}">${esc(r.label)}</button>`).join("")}
    </div>
    <div class="saas-popup-actions">
      <button class="btn-saas-primary" id="zp-valider" disabled>${ICONS.check} Valider la zone</button>
    </div>`,
    "zone-popup",
  );

  const input = row.querySelector("#zp-input");
  const validerBtn = row.querySelector("#zp-valider");
  let remote = null;

  row.querySelectorAll(".chip-option").forEach((btn) => {
    btn.onclick = () => {
      row
        .querySelectorAll(".chip-option")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      remote = btn.dataset.value;
      checkValid();
    };
  });

  function checkValid() {
    validerBtn.disabled = !input.value.trim() && remote !== "total";
  }
  input.addEventListener("input", checkValid);
  setTimeout(() => input.focus(), 50);

  validerBtn.onclick = () => {
    const zone =
      input.value.trim() || (remote === "total" ? "France entière" : "");
    if (!zone) return;
    addMessage({
      text: `Zone : ${zone}${remote ? " · " + REMOTE_OPTIONS.find((r) => r.value === remote)?.label : ""}`,
      from: "user",
    });
    row.remove();
    sendSpecialUpdate({
      zone,
      remote: remote || undefined,
      message: "__ZONE_SELECTED__",
    });
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !validerBtn.disabled) validerBtn.click();
  });
}

/* ════════════════════════════════════════════════════════════════════════
   POP-UP 3 — NIVEAU D'ÉTUDES
   ════════════════════════════════════════════════════════════════════════ */
function openDiplomePopup() {
  const row = popupBubble(
    `
    ${popupHeader(ICONS.cap, "Niveau d'études", state.role === "recruteur" ? "Quel diplôme est requis pour ce poste ?" : "Quel est votre plus haut niveau d'études ?")}
    <div class="diplome-grid">
      ${NIVEAU_ETUDE_OPTIONS.map((n) => `<button class="diplome-card" data-value="${esc(n.value)}"><span>${esc(n.label)}</span></button>`).join("")}
    </div>`,
    "diplome-popup",
  );

  row.querySelectorAll(".diplome-card").forEach((btn) => {
    btn.onclick = () => {
      addMessage({
        text: `Niveau d'études : ${btn.dataset.value}`,
        from: "user",
      });
      row.remove();
      sendSpecialUpdate({
        niveau: btn.dataset.value,
        message: "__DIPLOME_SELECTED__",
      });
    };
  });
}

/* ════════════════════════════════════════════════════════════════════════
   POP-UP 4 — COMPÉTENCES (chips)
   ════════════════════════════════════════════════════════════════════════ */
const SKILL_SUGGESTIONS = [
  "Communication",
  "Gestion de projet",
  "Travail d'équipe",
  "Anglais courant",
  "Excel",
  "Autonomie",
  "Rigueur",
  "Leadership",
  "Négociation",
  "Analyse de données",
];

function openCompetencesPopup() {
  const skills = [];
  const row = popupBubble(
    `
    ${popupHeader(ICONS.award, "Compétences clés", state.role === "recruteur" ? "Quelles compétences recherchez-vous ?" : "Sélectionnez ou ajoutez vos compétences")}
    <div class="skill-input-row">
      <input type="text" id="cp-input" class="saas-text-input" placeholder="Ajouter une compétence et valider..." autocomplete="off"/>
      <button class="btn-saas-icon" id="cp-add">${ICONS.plus}</button>
    </div>
    <div class="skill-suggestions" id="cp-suggestions">
      ${SKILL_SUGGESTIONS.map((s) => `<button class="chip-suggestion" data-value="${esc(s)}">${ICONS.plus}${esc(s)}</button>`).join("")}
    </div>
    <div class="skill-chips" id="cp-chips"></div>
    <div class="saas-popup-actions">
      <button class="btn-saas-primary" id="cp-valider" disabled>${ICONS.check} Valider les compétences</button>
    </div>`,
    "competences-popup",
  );

  const input = row.querySelector("#cp-input");
  const chipsWrap = row.querySelector("#cp-chips");
  const validerBtn = row.querySelector("#cp-valider");

  function renderChips() {
    chipsWrap.innerHTML = skills
      .map(
        (s, i) =>
          `<span class="skill-chip">${esc(s)}<button data-i="${i}">${ICONS.close}</button></span>`,
      )
      .join("");
    chipsWrap.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        skills.splice(Number(b.dataset.i), 1);
        renderChips();
        validerBtn.disabled = skills.length === 0;
      };
    });
    validerBtn.disabled = skills.length === 0;
  }

  function addSkill(val) {
    const v = val.trim();
    if (!v || skills.includes(v)) return;
    skills.push(v);
    renderChips();
  }

  row.querySelector("#cp-add").onclick = () => {
    addSkill(input.value);
    input.value = "";
    input.focus();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill(input.value);
      input.value = "";
    }
  });
  row.querySelectorAll(".chip-suggestion").forEach((btn) => {
    btn.onclick = () => addSkill(btn.dataset.value);
  });

  validerBtn.onclick = () => {
    addMessage({ text: `Compétences : ${skills.join(", ")}`, from: "user" });
    row.remove();
    sendSpecialUpdate({
      competences: [...skills],
      message: "__COMPETENCES_SELECTED__",
    });
  };
}

/* ════════════════════════════════════════════════════════════════════════
   POP-UP 5 — CV / LETTRE DE MOTIVATION (candidat uniquement)
   ════════════════════════════════════════════════════════════════════════ */
function openCvLettrePopup() {
  const row = popupBubble(
    `
    ${popupHeader(ICONS.file, "CV et lettre de motivation", "Renforcez votre profil auprès des recruteurs")}
    <div class="cv-drop-grid">
      <div class="cv-drop-zone" id="cv-zone-cv" data-kind="cv">
        <input type="file" id="cv-file-cv" hidden accept=".pdf,.doc,.docx"/>
        ${ICONS.upload}
        <p class="img-drop-label">Curriculum Vitae</p>
        <p class="img-drop-hint">PDF, DOC — 10 Mo max</p>
        <div class="cv-file-name" id="cv-name-cv"></div>
      </div>
      <div class="cv-drop-zone" id="cv-zone-lettre" data-kind="lettre">
        <input type="file" id="cv-file-lettre" hidden accept=".pdf,.doc,.docx"/>
        ${ICONS.upload}
        <p class="img-drop-label">Lettre de motivation</p>
        <p class="img-drop-hint">PDF, DOC — 10 Mo max</p>
        <div class="cv-file-name" id="cv-name-lettre"></div>
      </div>
    </div>
    <div class="saas-popup-actions">
      <button class="btn-saas-ghost" id="cv-skip">Passer cette étape</button>
      <button class="btn-saas-primary" id="cv-valider" disabled>${ICONS.check} Envoyer mes documents</button>
    </div>`,
    "cvlettre-popup",
  );

  const files = { cv: null, lettre: null };
  const validerBtn = row.querySelector("#cv-valider");

  ["cv", "lettre"].forEach((kind) => {
    const zone = row.querySelector(`#cv-zone-${kind}`);
    const input = row.querySelector(`#cv-file-${kind}`);
    const nameEl = row.querySelector(`#cv-name-${kind}`);
    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const f = input.files[0];
      if (!f) return;
      files[kind] = f;
      nameEl.textContent = f.name;
      zone.classList.add("has-file");
      validerBtn.disabled = !(files.cv || files.lettre);
    });
  });

  row.querySelector("#cv-skip").onclick = () => {
    addMessage({ text: "Je passe cette étape pour le moment.", from: "user" });
    row.remove();
    sendSpecialUpdate({ message: "__CVLETTRE_SKIPPED__" });
  };

  validerBtn.onclick = async () => {
    validerBtn.innerHTML = `<span class="btn-loading"></span> Envoi…`;
    validerBtn.disabled = true;
    try {
      const fd = new FormData();
      if (files.cv) fd.append("cv", files.cv);
      if (files.lettre) fd.append("lettre", files.lettre);
      const res = await fetch(`${API_BASE}/emploi/api/upload-cvlettre`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.user?.token || ""}` },
        body: fd,
      });
      const data = await res.json();
      state.documents = {
        ...state.documents,
        cv: data.cv,
        lettre: data.lettre,
      };
      save("documents", state.documents);
      addMessage({ text: "CV / lettre de motivation ajoutés.", from: "user" });
      row.remove();
      sendSpecialUpdate({
        cv: data.cv,
        lettre: data.lettre,
        message: "__CVLETTRE_UPLOADED__",
      });
    } catch {
      validerBtn.innerHTML = `${ICONS.check} Réessayer`;
      validerBtn.disabled = false;
    }
  };
}

/* ════════════════════════════════════════════════════════════════════════
   POP-UP 6 — RÉCAPITULATIF DU PROFIL
   ════════════════════════════════════════════════════════════════════════ */
function fmtEuro(n) {
  return n != null ? `${Number(n).toLocaleString("fr-FR")} €` : "—";
}

function openRecapPopup(data) {
  const isRecruteur = data.role === "recruteur";
  const metier = data.metier || (data.domainePath || []).slice(-1)[0] || "—";
  const domainePath = (data.domainePath || []).join(" › ") || "—";
  const comp = isRecruteur ? data.competencesRequises : data.competences;
  const niveau = isRecruteur ? data.niveauEtudeRequis : data.niveauEtude;
  const exp = isRecruteur
    ? data.experienceRequiseAnnees
    : data.experienceAnnees;
  const hasDocs = data.documents?.cv || data.documents?.lettre;

  const row = popupBubble(
    `
    <div class="recap-profile">
      <div class="recap-profile-head">
        <div class="recap-profile-badge">${isRecruteur ? ICONS.briefcase : ICONS.target}</div>
        <div>
          <div class="recap-profile-role">${isRecruteur ? "Offre à publier" : "Profil candidat"}</div>
          <div class="recap-profile-title">${esc(metier)}</div>
        </div>
        <div class="recap-profile-salary">${fmtEuro(data.salaireMax)}<span>/an</span></div>
      </div>
      <div class="recap-profile-grid">
        <div class="recap-profile-row"><span class="rpr-label">${ICONS.briefcase} Domaine</span><span class="rpr-val">${esc(domainePath)}</span></div>
        <div class="recap-profile-row"><span class="rpr-label">${ICONS.pin} Zone</span><span class="rpr-val">${esc(data.zone || "—")}${data.remote === "total" ? " · télétravail total" : data.remote === "hybride" ? " · hybride" : ""}</span></div>
        <div class="recap-profile-row"><span class="rpr-label">${ICONS.clock} Expérience</span><span class="rpr-val">${exp != null ? exp + " an" + (exp > 1 ? "s" : "") : "—"}</span></div>
        <div class="recap-profile-row"><span class="rpr-label">${ICONS.cap} Études</span><span class="rpr-val">${esc(niveau || "—")}</span></div>
        ${isRecruteur ? `<div class="recap-profile-row"><span class="rpr-label">${ICONS.file} Contrat</span><span class="rpr-val">${esc(data.typeContrat || "—")}</span></div>` : `<div class="recap-profile-row"><span class="rpr-label">${ICONS.file} Documents</span><span class="rpr-val">${hasDocs ? "CV / lettre joints" : "Non fournis"}</span></div>`}
      </div>
      ${
        Array.isArray(comp) && comp.length
          ? `<div class="recap-profile-skills">${comp.map((c) => `<span class="skill-chip static">${esc(c)}</span>`).join("")}</div>`
          : ""
      }
      <div class="saas-popup-actions">
        <button class="btn-saas-ghost" id="recap-modify">Modifier</button>
        <button class="btn-saas-primary" id="recap-confirm">${ICONS.check} ${isRecruteur ? "Publier l'offre" : "Publier mon profil"}</button>
      </div>
    </div>`,
    "recap-popup",
  );

  row.querySelector("#recap-confirm").onclick = () => {
    addMessage({
      text: isRecruteur
        ? "Je confirme, publiez l'offre."
        : "Je confirme, publiez mon profil.",
      from: "user",
    });
    row.remove();
    sendSpecialUpdate({ message: "__RECAP_CONFIRMED__" });
  };
  row.querySelector("#recap-modify").onclick = () => {
    addMessage({
      text: "Je souhaite modifier des informations.",
      from: "user",
    });
    row.remove();
    sendSpecialUpdate({ message: "__RECAP_MODIFY__" });
  };
}

/* ════════════════════════════════════════════════════════════════════════
   RENDU DU MATCHING — OFFRES (candidat) / CANDIDATS (recruteur)
   ════════════════════════════════════════════════════════════════════════ */
function renderMatches(matches, postReply) {
  addMessage({
    text: `<strong>${matches.length} ${state.role === "recruteur" ? "candidat(s)" : "offre(s)"}</strong> identifié(s) par le Cerveau IA :`,
    from: "bot",
  });

  matches.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "msg bot structured";
    const compatColor =
      m.compatibility >= 80
        ? "#b7e34e"
        : m.compatibility >= 60
          ? "#8fd6c4"
          : m.compatibility >= 40
            ? "#f0b95e"
            : "#e56a5a";
    const domainePath = (m.domainePath || []).join(" › ");

    row.innerHTML = `
      <div class="match-card-wrap">
        <div class="match-card-top">
          <div class="match-card-avatar">${state.role === "recruteur" ? ICONS.users : ICONS.briefcase}</div>
          <div class="match-card-heading">
            <div class="match-card-title">${esc(m.metier || domainePath || "Profil")}</div>
            <div class="match-card-sub">${esc(domainePath)}</div>
          </div>
          <div class="match-card-compat" style="color:${compatColor};border-color:${compatColor}55">${m.compatibility}%</div>
        </div>
        <div class="match-card-meta">
          <span>${ICONS.pin}${esc(m.zone || "—")}</span>
          <span>${ICONS.coin}${m.salaireMax ? Number(m.salaireMax).toLocaleString("fr-FR") + " €/an" : "—"}</span>
          <span>${ICONS.clock}${m.experience != null ? m.experience + " an" + (m.experience > 1 ? "s" : "") : "—"}</span>
          ${m.typeContrat ? `<span>${ICONS.file}${esc(m.typeContrat)}</span>` : ""}
        </div>
        ${
          Array.isArray(m.competences) && m.competences.length
            ? `<div class="match-card-skills">${m.competences
                .slice(0, 5)
                .map((c) => `<span class="skill-chip static">${esc(c)}</span>`)
                .join("")}</div>`
            : ""
        }
        ${
          Array.isArray(m.reasons) && m.reasons.length
            ? `<div class="match-card-reasons">${m.reasons.map((r) => `<span class="reason-tag good">${ICONS.check}${esc(r)}</span>`).join("")}</div>`
            : ""
        }
        <div class="match-card-footer">
          <button class="mc-btn mc-btn-contact" data-idx="${i}">${ICONS.handshake} Mettre en relation</button>
        </div>
      </div>`;

    $("chat-box").appendChild(row);
    scrollBottom($("chat-box"));

    row.querySelector(".mc-btn-contact").onclick = () => {
      addMessage({
        text: `Mise en relation avec ${m.metier || domainePath || "ce profil"} — ${m.zone || ""}`.trim(),
        from: "user",
      });
      sendSpecialUpdate({ message: `__ACTION_CONTACT__:${i}` });
    };
  });

  if (postReply) addMessage({ text: postReply, from: "bot", typing: true });
}

function renderContactSuccessCard(name, email) {
  const row = document.createElement("div");
  row.className = "msg bot structured";
  row.innerHTML = `
    <div class="bubble contact-success-card">
      <div class="csc-icon">${ICONS.mail}</div>
      <div>
        <div class="csc-title">Message envoyé</div>
        <div class="csc-sub">à ${esc(name)} · ${esc(email)}</div>
      </div>
    </div>`;
  $("chat-box").appendChild(row);
  scrollBottom($("chat-box"));
}

/* ════════════════════════════════════════════════════════════════════════
   ACTIONS DU PANNEAU — CONTACTER / MARCHÉ / MODIFIER
   ════════════════════════════════════════════════════════════════════════ */
function initPanelActions() {
  $("btn-mise-relation")?.addEventListener("click", openContactPickerPopup);
  $("btn-analyse-marche")?.addEventListener("click", () =>
    sendMessage(
      state.role === "recruteur"
        ? "Peux-tu analyser le marché du recrutement pour ce poste ?"
        : "Peux-tu analyser le marché de l'emploi pour mon profil actuel ?",
    ),
  );
  $("btn-modifier-criteres")?.addEventListener("click", openCriteriaEditPopup);
}

function openContactPickerPopup() {
  const matches = state.lastMatches || [];
  if (!matches.length) {
    addMessage({
      text: "Aucun profil compatible pour l'instant — relancez d'abord une recherche.",
      from: "bot",
    });
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "va-modal-overlay";
  overlay.innerHTML = `
    <div class="va-modal-sheet">
      <div class="va-modal-header">
        <div>
          <div class="va-modal-header-title">Choisir un profil à contacter</div>
          <div class="va-modal-header-sub">${matches.length} profil(s) compatible(s)</div>
        </div>
        <button class="va-modal-close" id="cp-close">${ICONS.close}</button>
      </div>
      <div class="va-modal-body" id="cp-list">
        ${matches
          .map(
            (m, i) => `
          <button class="cp-row" data-idx="${i}">
            <span class="cp-row-title">${esc(m.metier || (m.domainePath || []).join(" › ") || "Profil")} — ${esc(m.zone || "")}</span>
            <span class="cp-row-sub">${m.compatibility != null ? m.compatibility + "% compatible" : ""}</span>
          </button>`,
          )
          .join("")}
      </div>
      <div class="saas-popup-actions" style="padding:0 20px 20px">
        <button class="btn-saas-primary" id="cp-valider" disabled>Valider</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let selectedIdx = null;
  overlay.querySelectorAll(".cp-row").forEach((r) => {
    r.onclick = () => {
      overlay
        .querySelectorAll(".cp-row")
        .forEach((x) => x.classList.remove("selected"));
      r.classList.add("selected");
      selectedIdx = Number(r.dataset.idx);
      overlay.querySelector("#cp-valider").disabled = false;
    };
  });
  overlay.querySelector("#cp-close").onclick = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector("#cp-valider").onclick = () => {
    if (selectedIdx === null) return;
    const m = matches[selectedIdx];
    overlay.remove();
    addMessage({
      text: `Mise en relation avec ${m.metier || ""} — ${m.zone || ""}`.trim(),
      from: "user",
    });
    sendSpecialUpdate({ message: `__ACTION_CONTACT__:${selectedIdx}` });
  };
}

const CRITERIA_FIELDS = {
  candidat: [
    { key: "domainePath", label: "Domaine / métier", type: "domaine" },
    { key: "zone", label: "Zone géographique", type: "text" },
    {
      key: "salaireMax",
      label: "Rémunération visée",
      type: "number",
      suffix: " €/an",
    },
    {
      key: "experienceAnnees",
      label: "Expérience",
      type: "number",
      suffix: " an(s)",
    },
    {
      key: "niveauEtude",
      label: "Niveau d'études",
      type: "select",
      options: NIVEAU_ETUDE_OPTIONS,
    },
    { key: "competences", label: "Compétences", type: "chips" },
  ],
  recruteur: [
    { key: "domainePath", label: "Domaine / poste", type: "domaine" },
    { key: "zone", label: "Zone géographique", type: "text" },
    {
      key: "salaireMax",
      label: "Rémunération proposée",
      type: "number",
      suffix: " €/an",
    },
    {
      key: "experienceRequiseAnnees",
      label: "Expérience requise",
      type: "number",
      suffix: " an(s)",
    },
    {
      key: "niveauEtudeRequis",
      label: "Niveau d'études requis",
      type: "select",
      options: NIVEAU_ETUDE_OPTIONS,
    },
    {
      key: "competencesRequises",
      label: "Compétences requises",
      type: "chips",
    },
    {
      key: "typeContrat",
      label: "Type de contrat",
      type: "select",
      options: TYPE_CONTRAT_OPTIONS,
    },
  ],
};

function formatCriteriaValue(field, value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
    return "—";
  if (field.type === "domaine")
    return Array.isArray(value) ? value.join(" › ") : "—";
  if (field.type === "chips")
    return Array.isArray(value) ? value.join(", ") : "—";
  if (field.type === "number")
    return `${Number(value).toLocaleString("fr-FR")}${field.suffix || ""}`;
  if (field.type === "select") {
    const found = field.options.find((o) => o.value === value);
    return found?.label || value;
  }
  return value;
}

function openCriteriaEditPopup() {
  const fields = CRITERIA_FIELDS[state.role] || CRITERIA_FIELDS.candidat;
  const pendingEdits = {};

  const overlay = document.createElement("div");
  overlay.className = "va-modal-overlay";
  overlay.innerHTML = `
    <div class="va-modal-sheet">
      <div class="va-modal-header">
        <div>
          <div class="va-modal-header-title">Modifier mes critères</div>
          <div class="va-modal-header-sub">Cliquez sur une ligne pour la modifier</div>
        </div>
        <button class="va-modal-close" id="ce-close">${ICONS.close}</button>
      </div>
      <div class="va-modal-body" id="ce-table"></div>
      <div class="saas-popup-actions" style="padding:0 20px 20px">
        <button class="btn-saas-ghost" id="ce-cancel">Annuler</button>
        <button class="btn-saas-primary" id="ce-valider" disabled>Valider et relancer le matching</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const table = overlay.querySelector("#ce-table");
  const validerBtn = overlay.querySelector("#ce-valider");

  function renderRows() {
    table.innerHTML = fields
      .map((f) => {
        const currentVal =
          pendingEdits[f.key] !== undefined
            ? pendingEdits[f.key]
            : state.criteria[f.key];
        const changed = pendingEdits[f.key] !== undefined;
        return `
        <button class="ce-row ${changed ? "changed" : ""}" data-key="${f.key}">
          <span class="ce-row-label">${esc(f.label)}</span>
          <span class="ce-row-val">${esc(formatCriteriaValue(f, currentVal))}</span>
        </button>`;
      })
      .join("");

    table.querySelectorAll(".ce-row").forEach((row) => {
      row.onclick = () => {
        const key = row.dataset.key;
        const field = fields.find((f) => f.key === key);
        const current = pendingEdits[key] ?? state.criteria[key];
        openInlineFieldEditor(field, current, (newVal) => {
          pendingEdits[key] = newVal;
          renderRows();
          validerBtn.disabled = Object.keys(pendingEdits).length === 0;
        });
      };
    });
  }
  renderRows();

  overlay.querySelector("#ce-close").onclick = () => overlay.remove();
  overlay.querySelector("#ce-cancel").onclick = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  validerBtn.onclick = () => {
    if (!Object.keys(pendingEdits).length) return;
    overlay.remove();
    addMessage({
      text: "Je souhaite mettre à jour mes critères.",
      from: "user",
    });
    sendSpecialUpdate({
      updatedCriteria: pendingEdits,
      message: "__CRITERIA_UPDATE__",
    });
  };
}

/** Mini-éditeur inline générique (texte / nombre / select / chips / domaine). */
function openInlineFieldEditor(field, currentValue, onSave) {
  document.querySelectorAll(".zone-mini-popup").forEach((p) => p.remove());
  const mini = document.createElement("div");
  mini.className = "zone-mini-popup";

  if (field.type === "select") {
    mini.innerHTML = `
      <div class="zmp-title">${esc(field.label)}</div>
      <div class="zmp-options">
        ${field.options.map((o) => `<button class="zmp-opt" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join("")}
      </div>`;
    mini.querySelectorAll(".zmp-opt").forEach((btn) => {
      btn.onclick = () => {
        onSave(btn.dataset.value);
        mini.remove();
      };
    });
  } else if (field.type === "chips") {
    const chips = Array.isArray(currentValue) ? [...currentValue] : [];
    mini.innerHTML = `
      <div class="zmp-title">${esc(field.label)}</div>
      <input type="text" class="ce-inline-input" placeholder="Ajouter et valider..."/>
      <div class="skill-chips" id="mini-chips" style="margin-top:8px"></div>
      <button class="btn-saas-primary" id="mini-chips-save" style="margin-top:8px;width:100%">OK</button>`;
    const input = mini.querySelector("input");
    const chipsWrap = mini.querySelector("#mini-chips");
    function render() {
      chipsWrap.innerHTML = chips
        .map(
          (c, i) =>
            `<span class="skill-chip">${esc(c)}<button data-i="${i}">${ICONS.close}</button></span>`,
        )
        .join("");
      chipsWrap.querySelectorAll("button").forEach((b) => {
        b.onclick = () => {
          chips.splice(Number(b.dataset.i), 1);
          render();
        };
      });
    }
    render();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = input.value.trim();
        if (v && !chips.includes(v)) chips.push(v);
        input.value = "";
        render();
      }
    });
    mini.querySelector("#mini-chips-save").onclick = () => {
      onSave(chips);
      mini.remove();
    };
    setTimeout(() => input.focus(), 10);
  } else if (field.type === "domaine") {
    mini.innerHTML = `<div class="zmp-title">${esc(field.label)}</div><p class="zmp-hint">Rouvrez le sélecteur de domaine complet pour modifier ce champ.</p><button class="btn-saas-primary" id="mini-domaine-open" style="margin-top:8px;width:100%">Ouvrir le sélecteur</button>`;
    mini.querySelector("#mini-domaine-open").onclick = () => {
      mini.remove();
      openDomaineMiniSelector(onSave);
    };
  } else {
    mini.innerHTML = `
      <div class="zmp-title">${esc(field.label)}</div>
      <input type="${field.type === "number" ? "number" : "text"}" class="ce-inline-input" value="${currentValue ?? ""}"/>
      <button class="btn-saas-primary" id="ce-inline-save" style="margin-top:8px;width:100%">OK</button>`;
    const input = mini.querySelector("input");
    setTimeout(() => input.focus(), 10);
    mini.querySelector("#ce-inline-save").onclick = () => {
      const v =
        field.type === "number"
          ? Number(input.value) || null
          : input.value.trim();
      onSave(v);
      mini.remove();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") mini.querySelector("#ce-inline-save").click();
    });
  }

  document.body.appendChild(mini);
  mini.style.position = "fixed";
  mini.style.top = "50%";
  mini.style.left = "50%";
  mini.style.transform = "translate(-50%,-50%)";
  mini.style.zIndex = "10000";
}

/** Sélecteur de domaine compact, utilisé depuis l'éditeur de critères. */
async function openDomaineMiniSelector(onSave) {
  const domaines = await fetchDomaines();
  const path = [];

  const overlay = document.createElement("div");
  overlay.className = "va-modal-overlay";
  overlay.innerHTML = `
    <div class="va-modal-sheet" style="max-width:420px">
      <div class="va-modal-header">
        <div><div class="va-modal-header-title">Domaine professionnel</div></div>
        <button class="va-modal-close" id="dm-close">${ICONS.close}</button>
      </div>
      <div class="va-modal-body">
        <div class="domain-breadcrumb" id="dm-breadcrumb"></div>
        <div class="domain-grid" id="dm-grid"></div>
      </div>
      <div class="saas-popup-actions" style="padding:0 20px 20px">
        <button class="btn-saas-ghost" id="dm-back" style="display:none">Précédent</button>
        <button class="btn-saas-primary" id="dm-valider" disabled>${ICONS.check} Valider</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const breadcrumb = overlay.querySelector("#dm-breadcrumb");
  const grid = overlay.querySelector("#dm-grid");
  const backBtn = overlay.querySelector("#dm-back");
  const validerBtn = overlay.querySelector("#dm-valider");

  function currentLevelData() {
    let node = domaines;
    for (const seg of path)
      node = node && typeof node === "object" ? node[seg] : null;
    return node;
  }
  function renderBreadcrumb() {
    breadcrumb.innerHTML = path.length
      ? path
          .map((p) => `<span class="crumb-item">${esc(p)}</span>`)
          .join(`<span class="crumb-sep">${ICONS.chevron}</span>`)
      : `<span class="crumb-empty">Choisissez un domaine</span>`;
  }
  function renderGrid() {
    const node = currentLevelData();
    grid.innerHTML = "";
    if (Array.isArray(node)) {
      node.forEach((metier) => {
        const btn = document.createElement("button");
        btn.className = "domain-card domain-card-leaf";
        btn.innerHTML = `<span>${esc(metier)}</span>${ICONS.chevron}`;
        btn.onclick = () => {
          path.push(metier);
          validerBtn.disabled = false;
          renderBreadcrumb();
        };
        grid.appendChild(btn);
      });
    } else if (node && typeof node === "object") {
      Object.keys(node).forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "domain-card";
        btn.innerHTML = `<span>${esc(key)}</span>${ICONS.chevron}`;
        btn.onclick = () => {
          path.push(key);
          validerBtn.disabled = false;
          renderBreadcrumb();
          renderGrid();
        };
        grid.appendChild(btn);
      });
    }
    backBtn.style.display = path.length ? "inline-flex" : "none";
    validerBtn.disabled = path.length === 0;
  }
  backBtn.onclick = () => {
    path.pop();
    renderBreadcrumb();
    renderGrid();
  };
  overlay.querySelector("#dm-close").onclick = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  validerBtn.onclick = () => {
    overlay.remove();
    onSave([...path]);
  };
  renderBreadcrumb();
  renderGrid();
}

/* ════════════════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════════════════ */
function updateSidebarUser() {
  const nameEl = $("sidebar-username");
  const roleEl = $("sidebar-role");
  const avatarEl = $("sidebar-avatar");

  // Éléments pour le bas du chat et menu mobile
  const infoTextBar = $("user-info-text");
  const mobileName = $("mobile-profile-name");
  const mobileRole = $("mobile-profile-role");
  const mobileAvatar = $("mobile-profile-avatar");

  if (!state.user) return;

  const username = state.user.username || "Utilisateur";
  const roleLabel = ROLE_LABELS[state.role] || "";

  // Mise à jour Sidebar
  if (nameEl) nameEl.textContent = username;
  if (roleEl) roleEl.textContent = roleLabel;
  if (avatarEl) avatarEl.textContent = username.slice(0, 2).toUpperCase();

  // --- CORRECTION BUG 1 : Mise à jour du bas du chat et du menu mobile ---
  if (infoTextBar)
    infoTextBar.textContent = `Connecté : ${username} (${roleLabel})`;
  if (mobileName) mobileName.textContent = username;
  if (mobileRole) mobileRole.textContent = roleLabel;
  if (mobileAvatar) mobileAvatar.textContent = username.charAt(0).toUpperCase();
  // ------------------------------------------------------------------------

  document.body.classList.toggle("role-recruteur", state.role === "recruteur");
  document.body.classList.toggle("role-candidat", state.role === "candidat");
  const brandSub = $("nouvelle-recherche-label");
  if (brandSub)
    brandSub.textContent =
      state.role === "recruteur" ? "Nouvelle offre" : "Nouvelle recherche";
}

function render() {
  const box = $("chat-box");
  if (!box) return;
  box.innerHTML = "";
  if (state.history.length > 0) {
    state.history.forEach((m) =>
      addMessage({
        text: m.content,
        from: m.role,
        structured: m.structured,
        persist: false,
      }),
    );
  } else {
    box.innerHTML = emptyStateHTML();
    bindEmptyStateEvents();
  }
  updateAIPanel();
}

export function initChatEmploi() {
  restoreSession();
  if (!state.user) return;

  updateSidebarUser();

  if (load("phase") === "results") {
    state.phase = "results";
    state.lastMatches = load("lastMatches") || [];
    unlockPanelActions();
  } else {
    lockPanelActions();
  }

  render();
  initPanelActions();

  const input = $("user-input");
  const sendBtn = $("send-btn");
  const newSearchBtn = $("btn-new-search");

  function doSend() {
    const text = (input?.value || "").trim();
    if (!text) return;
    sendMessage(text);
    if (input) {
      input.value = "";
      input.style.height = "auto";
      input.dispatchEvent(new Event("input"));
    }
  }

  sendBtn?.addEventListener("click", doSend);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
  input?.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
    // Icône d'envoi : discrète tant qu'il n'y a rien à envoyer, colorée dès
    // qu'un message est prêt à partir.
    sendBtn?.classList.toggle("is-ready", input.value.trim().length > 0);
  });

  newSearchBtn?.addEventListener("click", () => {
    state.criteria = { intent: state.role };
    state.documents = {};
    state.history = [];
    state.phase = null;
    state.lastMatches = [];
    Object.keys(state.ui).forEach((k) => (state.ui[k] = false));
    save("criteria", state.criteria);
    save("documents", state.documents);
    save("chat", state.history);
    save("phase", null);
    save("lastMatches", []);
    lockPanelActions();
    render();
  });

  document.querySelectorAll(".suggestion-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = btn.textContent.trim();
      input.focus();
      input.dispatchEvent(new Event("input"));
    });
  });
}

document.addEventListener("DOMContentLoaded", initChatEmploi);
