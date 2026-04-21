// ================== POPUP NIVEAU ENERGETIQUE ==================

const NIVEAUX_ENERGETIQUES = [
  { value: "A", label: "A", color: "#2D9E2D" },
  { value: "B", label: "B", color: "#4CAF50" },
  { value: "C", label: "C", color: "#8BC34A" },
  { value: "D", label: "D", color: "#FFEB3B" },
  { value: "E", label: "E", color: "#FF9800" },
  { value: "F", label: "F", color: "#F44336" },
  { value: "G", label: "G", color: "#B71C1C" },
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
    <div class="niveau-energie-card">

      <div class="niveau-energie-header">
        <h3>Performance énergétique</h3>
        <p>Sélectionnez le diagnostic de votre bien</p>
      </div>

      <div class="niveau-energie-pyramid">
        ${NIVEAUX_ENERGETIQUES.map(
          (n) => `
          <div class="niveau-row" data-value="${n.value}">
            <div class="niveau-band" style="background:${n.color}">
              <span class="niveau-letter">${n.label}</span>
            </div>
          </div>
        `,
        ).join("")}
      </div>

      <button class="btn-valider-energie" id="btn-valider-energie" disabled>
        Valider
      </button>

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
