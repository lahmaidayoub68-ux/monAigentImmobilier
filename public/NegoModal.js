const API_BASE_NEGO = window.location.origin;

function getNegoToken() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) return null;
    return JSON.parse(raw).token || null;
  } catch {
    return null;
  }
}

function getNegoUsername() {
  try {
    const raw = localStorage.getItem("agent_user");
    if (!raw) return "Vous";
    return JSON.parse(raw).username || "Vous";
  } catch {
    return "Vous";
  }
}

// ─── État de la session de négociation ──────────────────────────────────────
const negoState = {
  sessionId: null,
  adverseRole: null,
  sending: false,
  outcome: null,
  turnCount: 0,
};

// ─── Ouvre le modal de négociation ──────────────────────────────────────────
window.openNegoModal = async function (matchProfile, userCriteria) {
  // Créer le modal s'il n'existe pas
  let overlay = document.getElementById("nego-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "nego-overlay";
  overlay.className = "nego-overlay";
  document.body.appendChild(overlay);

  // Contenu initial (loading)
  overlay.innerHTML = buildModalShell(matchProfile, userCriteria);

  // Fermeture sur clic overlay
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeNegoModal();
  });

  // Bind bouton fermeture header
  overlay
    .querySelector(".nego-close-btn")
    ?.addEventListener("click", closeNegoModal);

  // Démarrer la session
  await startNegoSession(matchProfile, userCriteria);
};

function buildModalShell(matchProfile, userCriteria) {
  const price = matchProfile.price || matchProfile.budgetMax || 0;
  const surface = matchProfile.surface || matchProfile.surfaceMin || 0;
  const pieces = matchProfile.pieces || matchProfile.piecesMin || 0;
  const ville = matchProfile.ville || "—";
  const type =
    matchProfile.type?.charAt(0).toUpperCase() +
      (matchProfile.type?.slice(1) || "") || "Bien";
  const compat = matchProfile.compatibility || "—";

  return `
    <div class="nego-modal" id="nego-modal">
      <div class="nego-header">
        <div class="nego-header-icon">⚔️</div>
        <div class="nego-header-info">
          <div class="nego-header-title">Simulation de négociation</div>
          <div class="nego-header-sub">L'IA joue la partie adverse · Préparez vos vrais arguments</div>
        </div>
        <button class="nego-close-btn" aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="nego-profile-strip">
        <span class="nego-profile-tag">${type} · ${ville}</span>
        ${price ? `<span class="nego-profile-tag">${price.toLocaleString("fr-FR")} €</span>` : ""}
        ${surface ? `<span class="nego-profile-tag">${surface} m²</span>` : ""}
        ${pieces ? `<span class="nego-profile-tag">${pieces} pièces</span>` : ""}
        <span class="nego-profile-tag compat">${compat}% compat.</span>
      </div>
      <div class="nego-chat" id="nego-chat">
        <div class="nego-thinking">
          <span>Partie adverse en train de préparer sa position</span>
          <span class="dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
      </div>
      <div class="nego-footer">
        <div class="nego-input-wrap">
          <textarea class="nego-input" id="nego-input"
            placeholder="Votre réponse…" rows="1"
            disabled></textarea>
        </div>
        <button class="nego-send" id="nego-send" disabled>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

// ─── Démarrer la session ─────────────────────────────────────────────────────
async function startNegoSession(matchProfile, userCriteria) {
  const token = getNegoToken();
  if (!token) {
    addNegoMessage(
      "adverse",
      "Vous devez être connecté pour utiliser la simulation.",
    );
    return;
  }

  try {
    const res = await fetch(`${API_BASE_NEGO}/api/nego/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ matchProfile, userCriteria }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Erreur serveur");

    negoState.sessionId = data.sessionId;
    negoState.adverseRole = data.adverseRole;
    negoState.outcome = null;
    negoState.turnCount = 0;

    // Vider le chat
    const chat = document.getElementById("nego-chat");
    if (chat) chat.innerHTML = "";

    // Message d'ouverture de l'adversaire
    addNegoMessage("adverse", data.message);

    // Activer l'input
    enableNegoInput();
  } catch (e) {
    const chat = document.getElementById("nego-chat");
    if (chat)
      chat.innerHTML = `<div style="color:#fb7185;font-size:13px;padding:16px">Erreur de connexion : ${e.message}</div>`;
  }
}

// ─── Envoyer un tour ─────────────────────────────────────────────────────────
async function sendNegoTurn(text) {
  if (!text.trim() || negoState.sending || !negoState.sessionId) return;
  if (negoState.outcome) return; // négociation terminée

  negoState.sending = true;
  disableNegoInput();

  addNegoMessage("user", text);

  // Thinking indicator
  const thinkId = "nego-think-" + Date.now();
  const chat = document.getElementById("nego-chat");
  if (chat) {
    const thinkEl = document.createElement("div");
    thinkEl.id = thinkId;
    thinkEl.className = "nego-thinking";
    thinkEl.innerHTML = `<span>${negoState.adverseRole === "vendeur" ? "Vendeur" : "Acheteur"} réfléchit</span><span class="dots"><span>.</span><span>.</span><span>.</span></span>`;
    chat.appendChild(thinkEl);
    scrollNegoChat();
  }

  try {
    const token = getNegoToken();
    const res = await fetch(`${API_BASE_NEGO}/api/nego/turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId: negoState.sessionId,
        userMessage: text,
      }),
    });

    const data = await res.json();

    // Retirer thinking
    document.getElementById(thinkId)?.remove();

    addNegoMessage("adverse", data.message);
    negoState.turnCount = data.turnCount || negoState.turnCount + 1;

    // Feedback coach (toutes les 3 turns ou si outcome)
    if (data.analysis) {
      addNegoAnalysis(data.analysis);
    }

    // Outcome
    if (data.outcome) {
      negoState.outcome = data.outcome;
      showNegoOutcome(data.outcome);
      await showNegoSummary();
    } else {
      enableNegoInput();
    }
  } catch (e) {
    document.getElementById(thinkId)?.remove();
    addNegoMessage(
      "adverse",
      "Connexion perdue. Veuillez relancer la simulation.",
    );
    enableNegoInput();
  }

  negoState.sending = false;
}

// ─── Récupérer et afficher le résumé ─────────────────────────────────────────
async function showNegoSummary() {
  if (!negoState.sessionId) return;

  const token = getNegoToken();
  try {
    const res = await fetch(
      `${API_BASE_NEGO}/api/nego/summary/${negoState.sessionId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json();

    if (data.summary) {
      renderNegoSummary(data.summary, data.outcome);
    }
  } catch (e) {
    console.warn("[NegoModal] summary error:", e);
  }
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function addNegoMessage(role, text) {
  const chat = document.getElementById("nego-chat");
  if (!chat) return;

  const isUser = role === "user";
  const username = getNegoUsername();
  const avatarText = isUser
    ? username.charAt(0).toUpperCase()
    : negoState.adverseRole === "vendeur"
      ? "V"
      : "A";
  const avatarClass = isUser ? "user-av" : "adverse";
  const msgClass = isUser ? "user" : "adverse";

  const row = document.createElement("div");
  row.className = `nego-msg ${msgClass}`;
  row.innerHTML = `
    <div class="nego-avatar ${avatarClass}">${avatarText}</div>
    <div class="nego-bubble">${escapeHtml(text)}</div>`;

  chat.appendChild(row);
  scrollNegoChat();
}

function addNegoAnalysis(text) {
  const modal = document.getElementById("nego-modal");
  if (!modal) return;

  const el = document.createElement("div");
  el.className = "nego-analysis";
  el.textContent = text;

  // Insérer avant le footer
  const footer = modal.querySelector(".nego-footer");
  if (footer) modal.insertBefore(el, footer);

  // Auto-remove après 6s
  setTimeout(() => {
    el.style.transition = "opacity 0.4s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 400);
  }, 6000);
}

function showNegoOutcome(outcome) {
  const modal = document.getElementById("nego-modal");
  if (!modal) return;

  const icons = { deal: "🤝", walkaway: "🚪", deadlock: "⏸️" };
  const titles = {
    deal: "Accord trouvé !",
    walkaway: "Négociation rompue",
    deadlock: "Blocage — positions irréconciliables",
  };
  const subs = {
    deal: "Félicitations — vous avez conclu cette simulation avec succès.",
    walkaway:
      "La partie adverse a mis fin aux discussions. Analysez vos erreurs.",
    deadlock:
      "Trop de tours sans mouvement. La négociation est dans l'impasse.",
  };

  const card = document.createElement("div");
  card.className = `nego-outcome-card ${outcome}`;
  card.innerHTML = `
    <div class="nego-outcome-icon">${icons[outcome] || "⚡"}</div>
    <div class="nego-outcome-text">
      <strong>${titles[outcome] || "Fin de simulation"}</strong>
      <span>${subs[outcome] || ""}</span>
    </div>`;

  const footer = modal.querySelector(".nego-footer");
  if (footer) modal.insertBefore(card, footer);

  // Désactiver l'input
  const input = document.getElementById("nego-input");
  const send = document.getElementById("nego-send");
  if (input) {
    input.disabled = true;
    input.placeholder = "Simulation terminée";
  }
  if (send) send.disabled = true;
}

function renderNegoSummary(summary, outcome) {
  const modal = document.getElementById("nego-modal");
  if (!modal) return;

  // Remplacer le contenu sous le profile strip
  const chat = modal.querySelector(".nego-chat");
  const footer = modal.querySelector(".nego-footer");
  const outcome_card = modal.querySelector(".nego-outcome-card");
  const analysis = modal.querySelector(".nego-analysis");

  // Supprimer les éléments intermédiaires
  [analysis, outcome_card].forEach((el) => el?.remove());

  // Injecter le résumé après le chat
  const summaryPanel = document.createElement("div");
  summaryPanel.className = "nego-summary-panel";

  const note = summary.globalNote ?? "—";
  const verdict = summary.verdict || "Simulation terminée.";

  let sectionsHTML = "";

  if (summary.pointsForts?.length) {
    sectionsHTML += buildSummarySection(
      "✅ Points forts",
      summary.pointsForts,
      "✓",
    );
  }
  if (summary.pointsFaibles?.length) {
    sectionsHTML += buildSummarySection(
      "⚠️ Points à améliorer",
      summary.pointsFaibles,
      "→",
    );
  }
  if (summary.objectionsRatees?.length) {
    sectionsHTML += buildSummarySection(
      "🔴 Objections manquées",
      summary.objectionsRatees,
      "✗",
    );
  }
  if (summary.conseilPrioritaire) {
    sectionsHTML += `<div class="nego-summary-section">
      <div class="nego-summary-section-header">💡 Conseil prioritaire</div>
      <div class="nego-summary-item"><span>${escapeHtml(summary.conseilPrioritaire)}</span></div>
    </div>`;
  }
  if (summary.prochaineFois) {
    sectionsHTML += `<div class="nego-summary-section">
      <div class="nego-summary-section-header">🔄 La prochaine fois</div>
      <div class="nego-summary-item"><span>${escapeHtml(summary.prochaineFois)}</span></div>
    </div>`;
  }

  summaryPanel.innerHTML = `
    <div class="nego-summary-score">
      <div class="nego-score-number">${note}<span style="font-size:24px;opacity:0.5">/10</span></div>
      <div class="nego-score-verdict">${escapeHtml(verdict)}</div>
    </div>
    ${sectionsHTML}`;

  // Insérer avant le footer
  if (chat) chat.style.display = "none";
  if (outcome_card) outcome_card.remove();
  if (footer) modal.insertBefore(summaryPanel, footer);

  // Action buttons
  const actionRow = document.createElement("div");
  actionRow.className = "nego-action-row";
  actionRow.innerHTML = `
    <button class="nego-action-btn primary" id="nego-restart">↩ Rejouer</button>
    <button class="nego-action-btn ghost" id="nego-close-summary">Fermer</button>`;
  if (footer) modal.insertBefore(actionRow, footer);

  document.getElementById("nego-restart")?.addEventListener("click", () => {
    summaryPanel.remove();
    actionRow.remove();
    if (chat) {
      chat.style.display = "flex";
      chat.innerHTML = "";
    }
    negoState.sessionId = null;
    negoState.outcome = null;
    // Récupérer matchProfile depuis le data-attribute du bouton qui a ouvert (hack simple)
    const btn = document.querySelector("[data-nego-match]");
    if (btn) {
      try {
        const mp = JSON.parse(btn.dataset.negoMatch);
        const uc = JSON.parse(btn.dataset.negoCriteria || "{}");
        startNegoSession(mp, uc);
      } catch {}
    }
  });

  document
    .getElementById("nego-close-summary")
    ?.addEventListener("click", closeNegoModal);

  // Hide footer input
  if (footer) footer.style.display = "none";
}

function buildSummarySection(title, items, icon) {
  return `<div class="nego-summary-section">
    <div class="nego-summary-section-header">${title}</div>
    ${items.map((item) => `<div class="nego-summary-item"><span class="nego-summary-item-icon">${icon}</span><span>${escapeHtml(item)}</span></div>`).join("")}
  </div>`;
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
function enableNegoInput() {
  const input = document.getElementById("nego-input");
  const send = document.getElementById("nego-send");
  if (input) {
    input.disabled = false;
    input.placeholder = "Votre réponse…";
    input.focus();
  }
  if (send) send.disabled = false;
}

function disableNegoInput() {
  const input = document.getElementById("nego-input");
  const send = document.getElementById("nego-send");
  if (input) input.disabled = true;
  if (send) send.disabled = true;
}

function scrollNegoChat() {
  const chat = document.getElementById("nego-chat");
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function closeNegoModal() {
  const overlay = document.getElementById("nego-overlay");
  if (overlay) {
    overlay.style.animation = "negoFadeIn 0.2s ease reverse forwards";
    setTimeout(() => overlay.remove(), 200);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

// ─── Bind events footer ───────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  const send = e.target.closest("#nego-send");
  if (send) {
    const input = document.getElementById("nego-input");
    if (input?.value.trim()) {
      const text = input.value.trim();
      input.value = "";
      input.style.height = "auto";
      sendNegoTurn(text);
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    const input = document.getElementById("nego-input");
    if (input && document.activeElement === input) {
      e.preventDefault();
      const text = input.value.trim();
      if (text && !negoState.sending && negoState.sessionId) {
        input.value = "";
        input.style.height = "auto";
        sendNegoTurn(text);
      }
    }
  }
});

// Auto-resize textarea
document.addEventListener("input", (e) => {
  if (e.target.id === "nego-input") {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
  }
});
