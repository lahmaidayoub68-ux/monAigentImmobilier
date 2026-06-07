// villes-modal.js

class VillesModal {
  constructor() {
    this.modal = document.getElementById("modal-villes");
    this.searchInput = document.getElementById("search-villes");
    this.villesList = document.getElementById("modal-villes-list");
    this.selectedVilles = new Set(CITY_NAMES);
    this.allVilles = [];
    this.init();
  }

  init() {
    // Charger villes
    this.loadVilles();

    // Recherche
    this.searchInput?.addEventListener("input", (e) => {
      this.filterVilles(e.target.value);
    });

    // Close buttons
    document.querySelectorAll('[data-close="modal-villes"]').forEach((btn) => {
      btn.addEventListener("click", () => this.close());
    });

    // Overlay close
    this.modal
      ?.querySelector(".modal-overlay")
      ?.addEventListener("click", () => {
        this.close();
      });

    // Apply button
    document
      .getElementById("btn-apply-villes")
      ?.addEventListener("click", () => {
        this.apply();
      });
  }

  async loadVilles() {
    try {
      const t = tok();
      const res = await fetch("/api/marche", {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      if (!res.ok) throw new Error("Load villes failed");

      const data = await res.json();
      this.allVilles = (data.villes || []).map((v) => ({
        ville: v.ville,
        prixM2: v.prixM2,
        departement: v.departement,
      }));

      this.render();
    } catch (e) {
      console.error("[VillesModal] Load error:", e.message);
      this.allVilles = [];
    }
  }

  render(filter = "") {
    if (!this.villesList) return;

    const filtered = this.allVilles.filter((v) =>
      (v.ville || "").toLowerCase().includes(filter.toLowerCase()),
    );

    if (filtered.length === 0) {
      this.villesList.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--t3);">
          Aucune ville trouvée
        </div>
      `;
      return;
    }

    this.villesList.innerHTML = filtered
      .map((v) => {
        const selected = this.selectedVilles.has(v.ville);
        return `
          <div 
            class="modal-item ${selected ? "selected" : ""}" 
            data-ville="${v.ville}"
            style="cursor: pointer; transition: all 0.15s;"
          >
            <span class="modal-item-name">${v.ville}</span>
            <span class="modal-item-price">${v.prixM2 ? fmt(v.prixM2) + " €/m²" : "—"}</span>
            ${selected ? '<div style="position:absolute;top:8px;right:8px;width:16px;height:16px;background:var(--vl);border-radius:50%;display:flex;align-items:center;justify-content:center;"><span style="color:#fff;font-size:10px;font-weight:700">✓</span></div>' : ""}
          </div>
        `;
      })
      .join("");

    // Listeners
    this.villesList.querySelectorAll(".modal-item").forEach((el) => {
      el.addEventListener("click", () => {
        const ville = el.dataset.ville;
        if (this.selectedVilles.has(ville)) {
          this.selectedVilles.delete(ville);
        } else {
          this.selectedVilles.add(ville);
        }
        el.classList.toggle("selected");
      });
    });
  }

  filterVilles(query) {
    this.render(query);
  }

  open() {
    if (this.modal) {
      this.modal.style.display = "flex";
      this.searchInput?.focus();
    }
  }

  close() {
    if (this.modal) {
      this.modal.style.display = "none";
    }
  }

  apply() {
    // Mettre à jour CITY_NAMES et activeCities
    CITY_NAMES = Array.from(this.selectedVilles);
    activeCities = new Set(this.selectedVilles);

    // Recréer pills
    initCityPills();

    // Update chart
    if (lastData?.chartData) {
      lastData.chartData = buildChartData(lastData.villes || [], cRange);
      updateMainChart(lastData);
    }

    this.close();
    toast(`${this.selectedVilles.size} ville(s) affichée(s)`);
  }
}

// Init au boot
let villesModal;
document.addEventListener("DOMContentLoaded", () => {
  villesModal = new VillesModal();
});
