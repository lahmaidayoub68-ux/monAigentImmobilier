/* ==========================================================================
   DEAL RADAR - LOGIQUE CLIENT (PRO SAAS)
========================================================================== */

const API = window.location.origin;
let currentThreshold = 65;
let silentActive = false;
let pollInterval = null;
let countdownInterval = null;
let countdownTarget = null;
let currentData = null;

/* ── AUTH & UTILS ── */
function getToken() {
  try {
    const raw = localStorage.getItem("agent_user");
    return raw ? JSON.parse(raw).token || null : null;
  } catch {
    return null;
  }
}

function getRole() {
  try {
    const raw = localStorage.getItem("agent_user");
    return raw ? JSON.parse(raw).role || "buyer" : "buyer";
  } catch {
    return "buyer";
  }
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ── SVGS UTILITAIRES (REMPLACEMENT DES EMOJIS) ── */

// Icônes de rang/urgence pour la liste
function getUrgencySVG(score) {
  const isHot = score >= 70;

  return `
    <svg class="rank-icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" opacity="0.2" fill="currentColor"/>
      <circle cx="12" cy="12" r="4" fill="currentColor"/>
      ${isHot ? '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" opacity="0.5"/>' : ""}
    </svg>
  `;
}

function getUrgencyClass(score) {
  if (score >= 70) return "urgent-hot";
  if (score >= 45) return "urgent-warm";
  if (score >= 25) return "urgent-cool";
  return "urgent-base";
}

function getUrgencyColor(score) {
  if (score >= 70) return "#f43f5e"; // hot (rose)
  if (score >= 45) return "#f59e0b"; // warm (ambre)
  if (score >= 25) return "#10b981"; // cool (vert)
  return "#8b5cf6"; // base (violet)
}

// SVG pour les états vides (Empty States)
const emptyIconSearch = `<svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
const emptyIconTarget = `<svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`;

/* ── FETCH DATA ── */
async function fetchRadar() {
  const token = getToken();
  if (!token) {
    showNotif(
      "Connexion requise",
      "Authentifiez-vous pour accéder au radar.",
      "lock",
    );
    return null;
  }
  try {
    const res = await fetch(
      `${API}/api/deal-radar?threshold=${currentThreshold}&limit=8`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (e) {
    console.error("[Deal Radar] fetch error:", e);
    return null;
  }
}

async function refresh() {
  const btn = document.getElementById("btn-refresh");
  if (btn) btn.classList.add("spinning");

  const data = await fetchRadar();
  if (data) renderRadar(data);

  if (btn) setTimeout(() => btn.classList.remove("spinning"), 600);
}

/* ── RENDER PRINCIPAL ── */
function renderRadar(data) {
  if (!data) return;
  currentData = data;
  const role = data.mode || "buyer";
  const summary = data.summary || {};
  const alerts = data.alerts || [];

  // En-tête
  const sub = document.getElementById("header-sub");
  if (sub) {
    sub.textContent =
      role === "seller"
        ? `${summary.totalOpportunities || 0} acheteurs analysés • Seuil ${currentThreshold}%`
        : `${summary.totalOpportunities || 0} opportunités détectées • Temps réel`;
  }

  // Cartes Résumé
  setText("sum-opps", summary.totalOpportunities ?? "—");
  setText("sum-urgency", summary.avgUrgency != null ? summary.avgUrgency : "—");
  setText("sum-threshold", currentThreshold + "%");

  let windowVal = "—";
  if (role === "seller" && data.myBien) {
    windowVal = data.myBien.estimatedWindowHours + "h";
  } else if (alerts.length > 0) {
    const minWindow = Math.min(
      ...alerts.map((a) => a.estimatedWindowHours || 72),
    );
    windowVal = minWindow + "h";
  }
  setText("sum-window", windowVal);

  // Animation Cercle Radar
  const urgency = summary.avgUrgency || 0;
  const arc = document.getElementById("radar-arc");
  const CIRCUMFERENCE = 439.82; // 2 * PI * r (r=70)
  if (arc) {
    const fill = CIRCUMFERENCE - (urgency / 100) * CIRCUMFERENCE;
    setTimeout(() => {
      arc.style.strokeDashoffset = fill;
    }, 150);
  }
  setText("radar-center-val", urgency || "—");

  const titleEl = document.getElementById("radar-title");
  const subEl = document.getElementById("radar-sub");
  if (urgency >= 70) {
    if (titleEl) titleEl.textContent = "Marché sous tension";
    if (subEl) subEl.textContent = "Fenêtre d'action critique en cours";
  } else if (urgency >= 40) {
    if (titleEl) titleEl.textContent = "Opportunités actives";
    if (subEl)
      subEl.textContent = "Plusieurs profils en attente sur votre zone";
  } else {
    if (titleEl) titleEl.textContent = "Marché calme";
    if (subEl)
      subEl.textContent = "Peu de correspondances détectées au seuil actuel";
  }

  renderRadarDots(alerts);
  renderCountdown(alerts, data);
  renderAlertList(alerts, role, data);
  renderCompetition(data);
}

/* ── ANIMATION POINTS DU RADAR ── */
function renderRadarDots(alerts) {
  const dotsG = document.getElementById("radar-dots");
  if (!dotsG) return;
  dotsG.innerHTML = "";

  alerts.forEach((a, i) => {
    // Position circulaire répartie
    const angle = (i / Math.max(alerts.length, 1)) * 2 * Math.PI - Math.PI / 2;
    // Plus le score est élevé, plus le point est proche du centre
    const normalizedUrgency = (a.urgencyScore || 0) / 100;
    const r = 20 + (1 - normalizedUrgency) * 48;
    const cx = 80 + r * Math.cos(angle);
    const cy = 80 + r * Math.sin(angle);
    const color = getUrgencyColor(a.urgencyScore);

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    circle.setAttribute("cx", cx.toFixed(1));
    circle.setAttribute("cy", cy.toFixed(1));
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", color);
    circle.style.animation = `radarPulse ${1.5 + i * 0.2}s infinite`;

    dotsG.appendChild(circle);
  });
}

/* ── COUNTDOWN ── */
function renderCountdown(alerts, data) {
  const wrap = document.getElementById("countdown-wrap");
  if (!wrap) return;

  const hotAlerts = alerts.filter((a) => (a.urgencyScore || 0) >= 65);
  const sellerWithWindow = data?.myBien?.estimatedWindowHours;

  if (hotAlerts.length === 0 && !sellerWithWindow) {
    wrap.style.display = "none";
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    return;
  }

  wrap.style.display = "flex";
  let windowHours =
    sellerWithWindow ||
    Math.min(...hotAlerts.map((a) => a.estimatedWindowHours || 48));

  if (!countdownTarget)
    countdownTarget = Date.now() + windowHours * 3600 * 1000;

  setText(
    "countdown-label",
    hotAlerts.length > 0
      ? `${hotAlerts.length} opportunité(s) critique(s)`
      : "Fenêtre de vente estimée",
  );
  setText(
    "countdown-sub",
    data?.myBien?.qualifiedBuyers > 0
      ? "Acheteurs qualifiés en attente de réponse."
      : "Réactivité maximale conseillée.",
  );

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const remaining = Math.max(0, countdownTarget - Date.now());
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    setText(
      "countdown-clock",
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
    );
    if (remaining === 0) clearInterval(countdownInterval);
  }, 1000);
}

/* ── RENDU DE LA LISTE D'ALERTES ── */
function renderAlertList(alerts, role, data) {
  const list = document.getElementById("alerts-list");
  if (!list) return;

  if (role === "seller" && data?.myBien) {
    const bien = data.myBien;
    setText("alerts-title", "Votre bien sur le radar");
    setText("alerts-meta", `${bien.qualifiedBuyers} acheteur(s) qualifié(s)`);

    const items = bien.topBuyers || [];
    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state">${emptyIconTarget}<div class="empty-title">Aucun acheteur qualifié</div><div class="empty-sub">Baissez le seuil de compatibilité.</div></div>`;
      return;
    }

    list.innerHTML = items
      .map((buyer, i) => {
        const cls = getUrgencyClass(buyer.compatibility);
        const icon = getUrgencySVG(buyer.compatibility);
        return `<div class="alert-item ${cls}">
        <div class="alert-rank">${icon}<span class="rank-num">#${i + 1}</span></div>
        <div class="alert-info">
          <div class="alert-title">Acheteur qualifié · ${buyer.ville || "Zone cible"}</div>
          <div class="alert-meta-row">
            <span class="alert-tag">${buyer.budgetMax ? buyer.budgetMax.toLocaleString("fr-FR") + " €" : "Budget N/A"}</span>
            <span class="alert-tag">${buyer.compatibility}% compat.</span>
          </div>
        </div>
        <div class="alert-right">
          <div class="alert-compat">${buyer.compatibility}%</div>
          <div class="alert-window">profil actif</div>
        </div>
      </div>`;
      })
      .join("");
    return;
  }

  // Mode acheteur
  setText("alerts-title", "Biens disponibles");
  setText("alerts-meta", `${alerts.length} résultat(s)`);

  if (alerts.length === 0) {
    list.innerHTML = `<div class="empty-state">${emptyIconSearch}<div class="empty-title">Aucune opportunité au seuil de ${currentThreshold}%</div><div class="empty-sub">Baissez le seuil ou mettez à jour vos critères dans le chat.</div></div>`;
    return;
  }

  list.innerHTML = alerts
    .map((a, i) => {
      const cls = getUrgencyClass(a.urgencyScore);
      const icon = getUrgencySVG(a.urgencyScore);
      const competitors = a.competitorCount || 0;

      // Icône éclair ultra clean pour la concurrence
      const boltSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

      return `<div class="alert-item ${cls}">
      <div class="alert-rank">${icon}<span class="rank-num">#${i + 1}</span></div>
      <div class="alert-info">
        <div class="alert-title">${capitalize(a.type || "Bien")} · ${a.ville}</div>
        <div class="alert-meta-row">
          ${a.price ? `<span class="alert-tag">${a.price.toLocaleString("fr-FR")} €</span>` : ""}
          ${a.surface ? `<span class="alert-tag">${a.surface} m²</span>` : ""}
          ${a.niveauEnergetique ? `<span class="alert-tag">DPE ${a.niveauEnergetique}</span>` : ""}
          ${competitors > 0 ? `<span class="alert-tag" style="color:#f43f5e; border-color:rgba(244,63,94,0.3); display:flex; align-items:center;">${boltSvg} ${competitors} concurrent(s)</span>` : ""}
        </div>
      </div>
      <div class="alert-right">
        <div class="alert-compat">${a.avgCompatibility}%</div>
        <div class="alert-window">~${a.estimatedWindowHours}h restantes</div>
      </div>
    </div>`;
    })
    .join("");
}

/* ── RENDU DE LA CONCURRENCE ── */
function renderCompetition(data) {
  const panel = document.getElementById("competition-panel");
  if (!panel) return;

  if (data?.mode !== "seller" || !data?.competition) {
    panel.style.display = "none";
    return;
  }

  const comp = data.competition;
  panel.style.display = "block";

  const badge = document.getElementById("comp-advantage-badge");
  if (badge) {
    const adv = comp.yourAdvantage || 0;
    if (adv > 0) {
      badge.textContent = `Avantage : +${adv} acheteurs`;
      badge.className = "comp-advantage positive";
    } else if (adv < 0) {
      badge.textContent = `Déficit : ${adv} acheteurs`;
      badge.className = "comp-advantage negative";
    } else {
      badge.textContent = "À parité avec le marché";
      badge.className = "comp-advantage neutral";
    }
  }

  const list = document.getElementById("comp-list");
  if (!list) return;

  const items = comp.items || [];
  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:24px"><div class="empty-sub">Aucun bien concurrent détecté sur votre zone.</div></div>`;
    return;
  }

  const maxBuyers = Math.max(...items.map((c) => c.qualifiedBuyers || 0), 1);
  list.innerHTML = items
    .map((c) => {
      const pct = Math.round((c.qualifiedBuyers / maxBuyers) * 100);
      return `<div class="comp-item">
      <div>
        <div class="comp-item-city">${c.ville} · ${capitalize(c.type || "bien")}</div>
        <div class="comp-item-price">${c.price ? c.price.toLocaleString("fr-FR") + " €" : "—"}</div>
      </div>
      <div class="comp-buyers-bar">
        <div class="bar-track"><div class="bar-fill" style="width:0%" data-target="${pct}"></div></div>
        <span class="bar-count">${c.qualifiedBuyers} acheteur(s)</span>
      </div>
    </div>`;
    })
    .join("");

  // Animation des barres
  requestAnimationFrame(() => {
    setTimeout(() => {
      list.querySelectorAll(".bar-fill[data-target]").forEach((el) => {
        el.style.width = el.dataset.target + "%";
      });
    }, 100);
  });
}

/* ── SILENT MATCHING & NOTIFICATIONS ── */
async function toggleSilentMatching() {
  silentActive = !silentActive;
  const btn = document.getElementById("silent-toggle");
  if (btn) btn.classList.toggle("active", silentActive);

  // Mise à jour de l'icône SVG du bouton
  const svg = btn.querySelector("svg");
  if (svg) {
    if (silentActive) {
      svg.innerHTML = `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="18" cy="6" r="3" fill="currentColor" stroke="var(--bg-surface)" stroke-width="1.5"/>`;
    } else {
      svg.innerHTML = `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`;
    }
  }

  const token = getToken();
  if (token) {
    try {
      await fetch(`${API}/api/deal-radar/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          active: silentActive,
          threshold: currentThreshold,
        }),
      });
    } catch (e) {
      console.warn("Subscribe err", e);
    }
  }

  if (silentActive) {
    showNotif(
      "Surveillance activée",
      `Vous serez alerté si un profil atteint ${currentThreshold}%.`,
      "radar",
    );
    pollInterval = setInterval(pollNotifications, 15000);
  } else {
    showNotif(
      "Surveillance désactivée",
      "Le Radar silencieux est en pause.",
      "bell-off",
    );
    if (pollInterval) clearInterval(pollInterval);
  }
}

async function pollNotifications() {
  const token = getToken();
  if (!token || !silentActive) return;
  try {
    const res = await fetch(`${API}/api/deal-radar/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    (data.notifications || []).forEach((n) => {
      if (n.type === "new_match") {
        showNotif(
          `Nouveau profil détecté : ${n.compatibility}%`,
          `${capitalize(n.seller?.type || "Bien")} · ${n.seller?.ville || "—"} · ${n.seller?.price ? n.seller.price.toLocaleString("fr-FR") + " €" : "—"}`,
          "zap",
        );
      }
    });
  } catch (e) {
    console.warn("[Silent Matching] poll error:", e);
  }
}

function showNotif(title, body, iconType = "info", duration = 4000) {
  const tray = document.getElementById("notif-tray");
  if (!tray) return;

  // SVG selon type
  let svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

  if (iconType === "radar") {
    svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`;
  } else if (iconType === "bell-off") {
    svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
  } else if (iconType === "zap") {
    svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
  } else if (iconType === "lock") {
    svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
  }

  const pill = document.createElement("div");
  pill.className = "notif-pill";

  pill.innerHTML = `
    <div class="notif-icon-wrap">${svgIcon}</div>
    <div class="notif-body">
      <strong>${title}</strong>
      <span>${body}</span>
    </div>
    <button class="notif-close" onclick="
      const el = this.closest('.notif-pill');
      el.classList.add('fadeout');
      setTimeout(() => el.remove(), 300);
    " aria-label="Fermer">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  tray.appendChild(pill);

  // Auto disparition (FIX du bug duration)
  setTimeout(() => {
    if (!pill.parentElement) return;

    pill.classList.add("fadeout");

    setTimeout(() => {
      if (pill.parentElement) pill.remove();
    }, 300);
  }, duration);
}

/* ── INITIALISATION ── */
document.addEventListener("DOMContentLoaded", () => {
  // Clic cloche → profil notifications
  document.getElementById("btn-notif-bell")?.addEventListener("click", () => {
    window.location.href = "profil.html#notifications";
  });

  // Badge notifs temps réel
  (async function refreshNotifBadge() {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const notifs = await res.json();
      const count = notifs.filter((n) => !n.read).length;
      const badge = document.getElementById("notif-badge-global");
      if (badge) {
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = count > 0 ? "flex" : "none";
      }
    } catch {}
  })();

  setInterval(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const notifs = await res.json();
      const count = notifs.filter((n) => !n.read).length;
      const badge = document.getElementById("notif-badge-global");
      if (badge) {
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = count > 0 ? "flex" : "none";
      }
    } catch {}
  }, 20000);

  // Slider Threshold
  const slider = document.getElementById("threshold-slider");
  const display = document.getElementById("threshold-display");

  if (slider) {
    slider.addEventListener("input", () => {
      currentThreshold = parseInt(slider.value, 10);
      if (display) display.textContent = currentThreshold + "%";
      setText("sum-threshold", currentThreshold + "%");
    });

    slider.addEventListener("change", () => {
      countdownTarget = null; // Reset le chrono au changement
      refresh();
    });
  }

  // Bouton Actualiser
  document.getElementById("btn-refresh")?.addEventListener("click", () => {
    countdownTarget = null;
    refresh();
  });

  // Bouton Silent Matching
  document
    .getElementById("silent-toggle")
    ?.addEventListener("click", toggleSilentMatching);

  // Auto-refresh toutes les 30s
  setInterval(refresh, 30000);

  // Chargement initial
  refresh();
});
