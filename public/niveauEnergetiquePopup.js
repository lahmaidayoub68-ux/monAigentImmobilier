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

  bubble.innerHTML = `
  <div class="niveau-energie-card saas-popup">
    <div class="saas-popup-header">
      <div class="saas-popup-icon">
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <path d="M13 2L4.09 12.11A2 2 0 005.61 15H11l-1 7 8.91-10.11A2 2 0 0017.39 9H12l1-7z"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <h3 class="saas-popup-title">Performance énergétique</h3>
        <p class="saas-popup-sub">Sélectionnez le DPE de votre bien</p>
      </div>
    </div>
    <div class="niveau-energie-pyramid">
      ${NIVEAUX_ENERGETIQUES.map(
        (n) => `
        <div class="niveau-row" data-value="${n.value}">
          <div class="niveau-band">
            <span class="niveau-letter">${n.label}</span>
            <span class="niveau-sub">${n.sub}</span>
          </div>
        </div>
      `,
      ).join("")}
    </div>
    <div class="saas-popup-actions">
      <button class="btn-saas-primary" id="btn-valider-energie" disabled>
        <svg viewBox="0 0 24 24" fill="none" width="15" height="15">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Valider le DPE
      </button>
    </div>
  </div>
`;
  row.appendChild(bubble);
  chatBox.appendChild(row);
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });

  let selectedValue = null;

  // ===== CLICK HANDLER =====
  bubble.querySelectorAll(".niveau-row").forEach((el) => {
    el.addEventListener("click", () => {
      bubble
        .querySelectorAll(".niveau-row")
        .forEach((r) => r.classList.remove("selected"));
      el.classList.add("selected");
      selectedValue = el.dataset.value;

      const btn = bubble.querySelector("#btn-valider-energie");
      btn.removeAttribute("disabled");
    });
  });

  // ===== VALIDER =====
  bubble.querySelector("#btn-valider-energie").addEventListener("click", () => {
    if (!selectedValue) return;

    addMessage({ text: `Niveau énergétique : ${selectedValue}`, from: "user" });
    row.remove();

    sendNiveauEnergetique(selectedValue);
  });
}
