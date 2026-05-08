const BlogEngine = {
  async init() {
    this.renderHeader();
    this.renderFooter();

    try {
      const data = await this.fetchData();
      this.handleDynamicContent(data);
    } catch (e) {
      console.error("Erreur de chargement data Mon AiGENT", e);
    }
  },

  renderHeader() {
    const header = document.getElementById("main-nav");
    if (!header) return;
    header.innerHTML = `
            <div class="nav-container">
                <a href="index.html" class="logo">Mon Ai<span>GENT</span> Immobilier</a>
                <nav>
                    <ul>
                        <li><a href="marches.html" class="${window.location.href.includes("marches") ? "active" : ""}">Marché</a></li>
                        <li><a href="guides.html" class="${window.location.href.includes("guides") ? "active" : ""}">Guides</a></li>
                        <li><a href="actu.html" class="${window.location.href.includes("actu") ? "active" : ""}">Actualités</a></li>
                    </ul>
                </nav>
                <a href="../intro.html" class="btn-match">Lancer mon Matching →</a>
            </div>
        `;
  },

  renderFooter() {
    const footer = document.getElementById("main-footer");
    if (!footer) return;
    footer.innerHTML = `
            <div class="container">
                <p style="margin-bottom: 1rem;"><strong>Mon AiGENT Immobilier</strong> — L'intelligence au service de votre patrimoine.</p>
                <div style="display: flex; justify-content: center; gap: 2rem; font-size: 0.8rem; opacity: 0.6;">
                    <span>© 2026 IA-Driven Data</span>
                    <a href="#" style="color: inherit;">Mentions Légales</a>
                    <a href="#" style="color: inherit;">Confidentialité</a>
                </div>
            </div>
        `;
  },

  async fetchData() {
    const res = await fetch("/api/marche");
    return await res.json();
  },

  handleDynamicContent(data) {
    // Page Marché
    const table = document.getElementById("market-table-body");
    if (table) {
      table.innerHTML = data.villes
        .map(
          (v) => `
                <tr>
                    <td><strong>${v.ville}</strong></td>
                    <td>${v.prixM2.toLocaleString()} €</td>
                    <td class="${v.variation >= 0 ? "trend-up" : "trend-down"}">${v.variation > 0 ? "+" : ""}${v.variation}%</td>
                    <td>${v.matchs} profils</td>
                    <td><small>${v.variation < 0 ? "Opportunité d'achat" : "Forte demande"}</small></td>
                </tr>
            `,
        )
        .join("");

      document.getElementById("kpi-total-matchs").innerText =
        data.kpi.totalMatchs.toLocaleString();
      document.getElementById("kpi-median-price").innerText =
        data.kpi.prixMedianM2.toLocaleString() + " €";
    }

    // Page Index Mini List
    const miniList = document.getElementById("kpi-mini-list");
    if (miniList) {
      miniList.innerHTML = data.villes
        .slice(0, 3)
        .map(
          (v) => `
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 0.5rem 0;">
                    <span style="font-size: 0.8rem;">${v.ville}</span>
                    <span style="font-weight: 600; font-size: 0.8rem;">${v.prixM2}€/m²</span>
                </div>
            `,
        )
        .join("");
    }
  },
};

document.addEventListener("DOMContentLoaded", () => BlogEngine.init());
