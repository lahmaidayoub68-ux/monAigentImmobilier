// ================== POPUP NIVEAU ENERGETIQUE ==================

const NIVEAUX_ENERGETIQUES = [
  { value: "A", label: "A", sub: "≤ 70 kWh/m²" },
  { value: "B", label: "B", sub: "71–110 kWh/m²" },
  { value: "C", label: "C", sub: "111–180 kWh/m²" },
  { value: "D", label: "D", sub: "181–250 kWh/m²" },
  { value: "E", label: "E", sub: "251–330 kWh/m²" },
  { value: "F", label: "F", sub: "331–420 kWh/m²" },
  { value: "G", label: "G", sub: "> 420 kWh/m²" },
];

export function openNiveauEnergetiquePopup({
  state,
  save,
  addMessage,
  sendNiveauEnergetique,
}) {
  const chatBox = document.getElementById("chat-box");
  const row = document.createElement("div");
  row.className = "msg bot structured";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.style.cssText = `
    background: transparent;
    border: none;
    padding: 0;
    max-width: 460px;
    width: 100%;
  `;

  bubble.innerHTML = `
    <div class="dpe-popup-shell">
      <div class="dpe-popup-head">
        <div class="dpe-popup-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M13 2L4.09 12.11A2 2 0 005.61 15H11l-1 7 8.91-10.11A2 2 0 0017.39 9H12l1-7z"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div>
          <div class="dpe-popup-title">Performance énergétique</div>
          <div class="dpe-popup-sub">Sélectionnez le DPE de votre bien</div>
        </div>
      </div>

      <div class="dpe-pyramid">
        ${[
          {
            v: "A",
            sub: "≤ 70 kWh/m²",
            w: "40%",
            bg: "linear-gradient(90deg,#059669,#34d399)",
            glow: "rgba(52,211,153,.32)",
          },
          {
            v: "B",
            sub: "71–110 kWh/m²",
            w: "50%",
            bg: "linear-gradient(90deg,#65a30d,#a3e635)",
            glow: "rgba(163,230,53,.28)",
          },
          {
            v: "C",
            sub: "111–180 kWh/m²",
            w: "60%",
            bg: "linear-gradient(90deg,#d97706,#fbbf24)",
            glow: "rgba(251,191,36,.28)",
          },
          {
            v: "D",
            sub: "181–250 kWh/m²",
            w: "70%",
            bg: "linear-gradient(90deg,#ea580c,#fb923c)",
            glow: "rgba(251,146,60,.28)",
          },
          {
            v: "E",
            sub: "251–330 kWh/m²",
            w: "80%",
            bg: "linear-gradient(90deg,#c2410c,#f97316)",
            glow: "rgba(249,115,22,.28)",
          },
          {
            v: "F",
            sub: "331–420 kWh/m²",
            w: "90%",
            bg: "linear-gradient(90deg,#dc2626,#f87171)",
            glow: "rgba(248,113,113,.28)",
          },
          {
            v: "G",
            sub: "> 420 kWh/m²",
            w: "100%",
            bg: "linear-gradient(90deg,#991b1b,#ef4444)",
            glow: "rgba(239,68,68,.28)",
          },
        ]
          .map(
            (n) => `
          <div class="dpe-row" data-value="${n.v}" data-glow="${n.glow}">
            <div class="dpe-band" style="width:${n.w};background:${n.bg};">
              <span class="dpe-letter">${n.v}</span>
              <span class="dpe-hint">${n.sub}</span>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>

      <div class="dpe-popup-footer">
        <button class="dpe-btn-validate" id="btn-valider-energie" disabled>
          <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.3"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Valider le DPE
        </button>
      </div>
    </div>
  `;

  row.appendChild(bubble);
  chatBox.appendChild(row);
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });

  // ── Inject styles (une seule fois) ──────────────────────────────────
  if (!document.getElementById("dpe-popup-styles")) {
    const st = document.createElement("style");
    st.id = "dpe-popup-styles";
    st.textContent = `
      .dpe-popup-shell {
        background: var(--bg-panel, #111118);
        border: 1px solid var(--border-mid, #2a2a3e);
        border-radius: 16px;
        padding: 20px 18px 16px;
        width: 100%;
        max-width: 440px;
        box-shadow: 0 8px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset;
      }
      [data-theme="light"] .dpe-popup-shell {
        background: #fff;
        border-color: rgba(139,92,246,.2);
        box-shadow: 0 8px 32px rgba(139,92,246,.12);
      }
      .dpe-popup-head {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 18px;
      }
      .dpe-popup-icon-wrap {
        width: 38px; height: 38px;
        border-radius: 10px;
        background: linear-gradient(135deg,#6366f1,#8b5cf6);
        display: flex; align-items: center; justify-content: center;
        color: #fff;
        flex-shrink: 0;
        box-shadow: 0 4px 14px rgba(99,102,241,.35);
      }
      .dpe-popup-title {
        font-size: 14px; font-weight: 700;
        color: var(--text-primary, #e0e0e0);
        letter-spacing: -.01em;
      }
      .dpe-popup-sub {
        font-size: 11.5px;
        color: var(--text-muted, #888);
        margin-top: 2px;
      }
      .dpe-pyramid {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-bottom: 18px;
      }
      .dpe-row {
        cursor: pointer;
        transition: transform .22s cubic-bezier(.34,1.56,.64,1);
      }
      .dpe-row:hover { transform: translateX(5px); }
      .dpe-row.selected { transform: translateX(10px) scale(1.02); }
      .dpe-band {
        height: 36px;
        border-radius: 6px;
        display: flex; align-items: center;
        padding: 0 14px; gap: 12px;
        clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%);
        transition: filter .2s, outline .15s, box-shadow .2s;
      }
      .dpe-row.selected .dpe-band {
        filter: brightness(1.1);
        outline: 2px solid rgba(255,255,255,.85);
        outline-offset: 2px;
      }
      .dpe-letter {
        font-size: 17px; font-weight: 900;
        color: #fff !important;
        text-shadow: 0 1px 4px rgba(0,0,0,.45);
        min-width: 16px;
      }
      .dpe-hint {
        font-size: 11px; font-weight: 600;
        color: rgba(255,255,255,.92) !important;
        white-space: nowrap;
      }
      .dpe-popup-footer { display: flex; justify-content: flex-end; }
      .dpe-btn-validate {
        display: inline-flex; align-items: center; gap: 7px;
        background: linear-gradient(135deg,#6366f1,#8b5cf6);
        border: none; border-radius: 9px;
        color: #fff; font-size: 13px; font-weight: 600;
        padding: 9px 18px; cursor: pointer;
        box-shadow: 0 4px 16px rgba(99,102,241,.35);
        transition: opacity .15s, transform .12s;
      }
      .dpe-btn-validate:hover:not(:disabled) {
        opacity: .88; transform: translateY(-1px);
      }
      .dpe-btn-validate:disabled {
        opacity: .38; cursor: not-allowed; transform: none;
      }
    `;
    document.head.appendChild(st);
  }

  // ── Events ──────────────────────────────────────────────────────────
  let selectedValue = null;

  bubble.querySelectorAll(".dpe-row").forEach((el) => {
    el.addEventListener("click", () => {
      bubble.querySelectorAll(".dpe-row").forEach((r) => {
        r.classList.remove("selected");
        r.querySelector(".dpe-band").style.boxShadow = "";
      });
      el.classList.add("selected");
      const glow = el.dataset.glow || "rgba(139,92,246,.35)";
      el.querySelector(".dpe-band").style.boxShadow = `0 6px 22px ${glow}`;
      selectedValue = el.dataset.value;
      bubble.querySelector("#btn-valider-energie").removeAttribute("disabled");
    });
  });

  bubble.querySelector("#btn-valider-energie").addEventListener("click", () => {
    if (!selectedValue) return;
    addMessage({ text: `Niveau énergétique : ${selectedValue}`, from: "user" });
    row.remove();
    sendNiveauEnergetique(selectedValue);
  });
}
