// alerts-manager.js

class AlertsManager {
  constructor() {
    this.alerts = [];
    this.modal = document.getElementById("modal-alertes");
    this.init();
  }

  init() {
    // Load alerts
    this.loadAlerts();

    // Open modal on "Gérer" links (en bas à droite du panel alertes)
    document.querySelectorAll('a[href="#manage-alerts"]').forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        this.open();
      });
    });

    // Close modal
    document.querySelectorAll('[data-close="modal-alertes"]').forEach((btn) => {
      btn.addEventListener("click", () => this.close());
    });

    this.modal
      ?.querySelector(".modal-overlay")
      ?.addEventListener("click", () => {
        this.close();
      });

    // New alert button
    document.getElementById("btn-new-alert")?.addEventListener("click", () => {
      this.addNewAlert();
    });
  }

  loadAlerts() {
    const saved = localStorage.getItem("marche_alerts");
    if (saved) {
      try {
        this.alerts = JSON.parse(saved);
      } catch {
        this.alerts = this.defaultAlerts();
      }
    } else {
      this.alerts = this.defaultAlerts();
      this.save();
    }
  }

  defaultAlerts() {
    return [
      {
        id: 1,
        type: "prix",
        title: "Alerte prix Paris",
        description: "Paris > 8500 €/m²",
        enabled: true,
      },
      {
        id: 2,
        type: "tension",
        title: "Tension marché",
        description: "Ratio demande/offre > 2",
        enabled: true,
      },
      {
        id: 3,
        type: "surface",
        title: "Petits biens",
        description: "Offre < 50m² en hausse",
        enabled: false,
      },
    ];
  }

  save() {
    localStorage.setItem("marche_alerts", JSON.stringify(this.alerts));
  }

  render() {
    const list = document.getElementById("alerts-list-modal");
    if (!list) return;

    list.innerHTML = this.alerts
      .map(
        (alert) => `
        <div style="display:grid;grid-template-columns:100px 1fr 80px 100px;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);align-items:center">
          <div style="font-size:9px;font-weight:700;color:var(--vl);text-transform:uppercase;background:rgba(124,58,237,0.12);padding:4px 8px;border-radius:5px;width:fit-content">${alert.type}</div>
          <div>
            <div style="font-size:11px;color:var(--text);font-weight:600">${alert.title}</div>
            <div style="font-size:9.5px;color:var(--t3);margin-top:2px;font-family:var(--mono)">${alert.description}</div>
          </div>
          <label class="toggle" style="justify-self:center">
            <input type="checkbox" class="toggle-input" ${alert.enabled ? "checked" : ""} data-id="${alert.id}">
            <span class="toggle-slider"></span>
          </label>
          <div style="display:flex;gap:4px;justify-self:end">
            <button class="btn-icon-sm" data-delete="${alert.id}" title="Supprimer">🗑</button>
          </div>
        </div>
      `,
      )
      .join("");

    // Listeners
    list.querySelectorAll(".toggle-input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const id = Number(e.target.dataset.id);
        const alert = this.alerts.find((a) => a.id === id);
        if (alert) {
          alert.enabled = e.target.checked;
          this.save();
          this.checkAlerts();
        }
      });
    });

    list.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = Number(e.target.dataset.delete);
        this.deleteAlert(id);
      });
    });
  }

  addNewAlert() {
    const id = Math.max(...this.alerts.map((a) => a.id), 0) + 1;
    this.alerts.push({
      id,
      type: "prix",
      title: "Nouvelle alerte",
      description: "À configurer",
      enabled: true,
    });
    this.save();
    this.render();
    toast("✅ Alerte créée");
  }

  deleteAlert(id) {
    this.alerts = this.alerts.filter((a) => a.id !== id);
    this.save();
    this.render();
    toast("🗑 Alerte supprimée");
  }

  checkAlerts() {
    if (!lastData?.kpi) return;

    this.alerts
      .filter((a) => a.enabled)
      .forEach((alert) => {
        let triggered = false;

        if (alert.type === "prix" && lastData.villes) {
          const paris = lastData.villes.find((v) => v.ville === "Paris");
          if (paris?.prixM2 > 8500) triggered = true;
        } else if (alert.type === "tension") {
          const ratio = lastData.kpi.buyers / (lastData.kpi.sellers + 1);
          if (ratio > 2) triggered = true;
        }

        if (triggered) {
          this.notify(alert);
        }
      });
  }

  notify(alert) {
    const notif = document.createElement("div");
    notif.className = "alert-notif";
    notif.innerHTML = `
      <div class="alert-notif-icon">🚨</div>
      <div class="alert-notif-content">
        <div class="alert-notif-title">${alert.title}</div>
        <div class="alert-notif-msg">${alert.description}</div>
      </div>
    `;
    notif.style.cssText = `
      position:fixed;bottom:20px;right:20px;
      background:linear-gradient(135deg,#1a1d28,#0f1117);
      border:1px solid rgba(239,68,68,0.3);
      border-radius:12px;padding:14px 16px;
      display:flex;gap:12px;align-items:flex-start;
      box-shadow:0 8px 24px rgba(0,0,0,0.4);
      animation:slideUp 0.3s ease;z-index:1000;
      font-family:var(--font);
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 5000);
  }

  open() {
    this.render();
    if (this.modal) {
      this.modal.style.display = "flex";
    }
  }

  close() {
    if (this.modal) {
      this.modal.style.display = "none";
    }
  }
}

// CSS Animations
const style = document.createElement("style");
style.textContent = `
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  
  .btn-icon-sm {
    width: 24px;
    height: 24px;
    border: 1px solid var(--border);
    background: var(--bg3);
    color: var(--t2);
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 11px;
    font-family: var(--font);
  }
  
  .btn-icon-sm:hover {
    border-color: var(--border2);
    color: var(--vl);
  }
`;
document.head.appendChild(style);

// Init
let alertsManager;
document.addEventListener("DOMContentLoaded", () => {
  alertsManager = new AlertsManager();
});
