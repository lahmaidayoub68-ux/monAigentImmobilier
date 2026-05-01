// ================== proximitePopup.js (VERSION FINALE BOOSTÉE & COMPLÈTE) ==================

const INFRA_TYPES = [
  {
    key: "transport",
    label: "Transport",
    color: "#6366f1",
    icon: `<path d="M17 13.5v-3c0-4.5-2.5-5-5-5s-5 .5-5 5v3m10 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7 13.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM5 18h14"/>`,
    tags: {
      amenity: ["bus_station", "taxi"],
      railway: ["station", "subway_entrance", "tram_stop"],
    },
  },
  {
    key: "school",
    label: "École",
    color: "#8b5cf6",
    icon: `<path d="M22 10v6M2 10l10-5 10 5-10 5-10-5Zm4.5 2.25v3.5l5.5 2.75 5.5-2.75v-3.5"/>`,
    tags: { amenity: ["school", "college", "university", "kindergarten"] },
  },
  {
    key: "commerce",
    label: "Commerce",
    color: "#ec4899",
    icon: `<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 0 1-8 0"/>`,
    tags: {
      shop: ["supermarket", "convenience", "bakery", "butcher"],
      amenity: ["marketplace"],
    },
  },
  {
    key: "health",
    label: "Santé",
    color: "#f43f5e",
    icon: `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>`,
    tags: { amenity: ["hospital", "clinic", "pharmacy", "doctors"] },
  },
  {
    key: "park",
    label: "Parc",
    color: "#10b981",
    icon: `<path d="M12 19V5M5 11l7-7 7 7M5 19h14"/>`,
    tags: { leisure: ["park", "garden", "playground"] },
  },
  {
    key: "restaurant",
    label: "Resto",
    color: "#f59e0b",
    icon: `<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v4M12 15v5m0 0h2m-2 0H10m7-18v17a1 1 0 0 1-1 1h-1"/>`,
    tags: { amenity: ["restaurant", "cafe", "bar", "fast_food"] },
  },
];

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

// Helpers
const getIcon = (type, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">${INFRA_TYPES.find((t) => t.key === type)?.icon || ""}</svg>`;
const getColor = (type) =>
  INFRA_TYPES.find((t) => t.key === type)?.color || "#6366f1";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryFetch(endpoint, query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      body: query,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.elements)) throw new Error("Réponse invalide");
    return data.elements;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function fetchPOIsAround(lat, lng, radius = 800, onProgress) {
  const filters = INFRA_TYPES.flatMap((t) =>
    Object.entries(t.tags).flatMap(([k, v]) =>
      v.map((val) => `node["${k}"="${val}"](around:${radius},${lat},${lng});`),
    ),
  ).join("\n");
  const query = `[out:json][timeout:25];(${filters});out body;`;

  let attemptTotal = 0;
  const totalAttempts = OVERPASS_ENDPOINTS.length * MAX_RETRIES;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let retry = 1; retry <= MAX_RETRIES; retry++) {
      attemptTotal++;
      onProgress?.(`Tentative ${attemptTotal}/${totalAttempts}…`);
      try {
        const elements = await tryFetch(endpoint, query);
        if (elements.length > 0) return { ok: true, elements };
        // Réponse vide → on essaie quand même l'endpoint suivant
        throw new Error("Aucun élément retourné");
      } catch (e) {
        console.warn(`[Overpass] ${endpoint} retry ${retry} — ${e.message}`);
        if (retry < MAX_RETRIES) await sleep(RETRY_DELAY_MS * retry);
      }
    }
  }

  return { ok: false, elements: [] };
}

function detectPoiType(tags) {
  for (const infra of INFRA_TYPES) {
    for (const [k, v] of Object.entries(infra.tags)) {
      if (tags[k] && v.includes(tags[k])) return infra.key;
    }
  }
  return null;
}

async function geocodeVille(ville) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ville + ", France")}&format=json&limit=1`,
    );
    const data = await res.json();
    return data.length
      ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      : { lat: 48.8566, lng: 2.3522 };
  } catch (e) {
    return { lat: 48.8566, lng: 2.3522 };
  }
}

function showLoaderMessage(overlay, html) {
  const loader = overlay.querySelector("#prox-loader");
  loader.style.display = "flex";
  loader.innerHTML = html;
}

export async function openProximitePopup({ state, addMessage, sendProximite }) {
  if (!document.getElementById("proximite-popup-css")) {
    const s = document.createElement("style");
    s.id = "proximite-popup-css";
    s.textContent = PROXIMITE_CSS;
    document.head.appendChild(s);
  }

  const ville = state.criteria?.ville || "Paris";
  const overlay = document.createElement("div");
  overlay.className = "prox-overlay";
  overlay.innerHTML = `
    <div class="prox-modal">
      <button class="prox-close" id="prox-close-btn">✕</button>
      <div class="prox-header">
        <div class="prox-header-icon-main">
          <svg viewBox="0 0 24 24" fill="none" width="24" height="24" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div>
          <h3 class="prox-title">Commodités à proximité</h3>
          <p class="prox-subtitle">Autour de <span class="prox-highlight">${ville}</span></p>
        </div>
      </div>
      <div class="prox-legend" id="prox-legend">
        ${INFRA_TYPES.map((t) => `<button class="prox-legend-btn active" data-type="${t.key}" style="--infra-color:${t.color}">+ ${getIcon(t.key, 16)} <span>${t.label}</span></button>`).join("")}
      </div>
      <div class="prox-map-wrap">
        <div id="prox-leaflet-map" class="prox-map"></div>
        <div class="prox-map-loader" id="prox-loader">
          <div class="prox-loader-inner">
            <div class="prox-loader-spinner"></div>
            <span class="prox-loader-text" id="prox-loader-text">Chargement des points d'intérêt…</span>
          </div>
        </div>
      </div>
      <div class="prox-selection-area">
        <div class="prox-selection-label">SÉLECTIONS :</div>
        <div class="prox-chips" id="prox-selection"></div>
      </div>
      <div class="prox-footer">
        <div class="prox-radius-info">RAYON <span class="prox-highlight">800M</span></div>
        <div class="prox-actions">
          <button class="prox-btn-secondary" id="prox-skip-btn">Annuler</button>
          <button class="prox-btn-primary" id="prox-validate-btn">Valider la sélection</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const selected = new Map();
  const markerMap = new Map();
  let allPOIs = [];

  const updateUI = () => {
    const container = overlay.querySelector("#prox-selection");
    if (selected.size === 0) {
      container.innerHTML =
        '<span style="font-size:12px; color:#86868b; font-style:italic;">Aucun point sélectionné</span>';
      return;
    }
    container.innerHTML = [...selected.values()]
      .map(
        (item) => `
      <span class="prox-chip" style="--c:${getColor(item.type)}">${getIcon(item.type, 12)} ${item.name} <b class="remove-chip" data-id="${item.id}">×</b></span>
    `,
      )
      .join("");
    container.querySelectorAll(".remove-chip").forEach(
      (b) =>
        (b.onclick = () => {
          const id = Number(b.dataset.id);
          const marker = markerMap.get(id);
          if (marker) marker.fire("click");
        }),
    );
  };

  function buildMarkerIcon(type, isSelected) {
    const color = getColor(type);
    return L.divIcon({
      className: "",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      html: `<div class="custom-marker ${isSelected ? "is-selected" : ""}" style="--m-color:${color}"><div class="marker-inner">${getIcon(type, 16)}</div></div>`,
    });
  }

  await sleep(100);
  const coords = await geocodeVille(ville);
  const map = L.map("prox-leaflet-map").setView([coords.lat, coords.lng], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

  L.marker([coords.lat, coords.lng], {
    zIndexOffset: 1000,
    icon: L.divIcon({
      html: `<div class="home-marker">🏠</div>`,
      className: "",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    }),
  }).addTo(map);

  // ── Chargement POIs avec retry + fallback ──────────────────────────
  const onProgress = (msg) => {
    const el = overlay.querySelector("#prox-loader-text");
    if (el) el.textContent = msg;
  };

  const { ok, elements } = await fetchPOIsAround(
    coords.lat,
    coords.lng,
    800,
    onProgress,
  );

  if (!ok || elements.length === 0) {
    // ── Échec total → message d'erreur + bouton retry ──────────────
    showLoaderMessage(
      overlay,
      `<div class="prox-error">
        <span class="prox-error-icon">⚠️</span>
        <p>Impossible de charger les points d'intérêt.<br>Vérifie ta connexion ou réessaie.</p>
        <button class="prox-btn-retry" id="prox-retry-btn">Réessayer</button>
      </div>`,
    );

    overlay.querySelector("#prox-retry-btn").onclick = async () => {
      showLoaderMessage(
        overlay,
        `<div class="prox-loader-inner">
          <div class="prox-loader-spinner"></div>
          <span class="prox-loader-text" id="prox-loader-text">Chargement…</span>
        </div>`,
      );
      const { ok: ok2, elements: elements2 } = await fetchPOIsAround(
        coords.lat,
        coords.lng,
        800,
        onProgress,
      );
      if (!ok2 || elements2.length === 0) {
        showLoaderMessage(
          overlay,
          `<div class="prox-error">
            <span class="prox-error-icon">⚠️</span>
            <p>Toujours indisponible. Tu peux valider sans sélection.</p>
          </div>`,
        );
      } else {
        renderPOIs(elements2);
      }
    };
  } else {
    renderPOIs(elements);
  }

  function renderPOIs(elements) {
    allPOIs = elements
      .filter((el) => el.tags && el.lat)
      .map((el) => ({
        id: el.id,
        lat: el.lat,
        lng: el.lon,
        type: detectPoiType(el.tags),
        name: el.tags.name || el.tags.amenity || "Infrastructure",
      }))
      .filter((p) => p.type);

    allPOIs.forEach((poi) => {
      const m = L.marker([poi.lat, poi.lng], {
        icon: buildMarkerIcon(poi.type, false),
      }).addTo(map);
      m.on("click", () => {
        if (selected.has(poi.id)) {
          selected.delete(poi.id);
          m.setIcon(buildMarkerIcon(poi.type, false));
        } else {
          selected.set(poi.id, poi);
          m.setIcon(buildMarkerIcon(poi.type, true));
        }
        updateUI();
      });
      markerMap.set(poi.id, m);
    });

    overlay.querySelector("#prox-loader").style.display = "none";
    setTimeout(() => map.invalidateSize(), 200);
  }

  // ── Actions ────────────────────────────────────────────────────────
  const close = () => {
    map.remove();
    overlay.remove();
  };

  overlay.querySelector("#prox-close-btn").onclick = close;
  overlay.querySelector("#prox-skip-btn").onclick = () => {
    close();
    sendProximite([]);
  };
  overlay.querySelector("#prox-validate-btn").onclick = () => {
    const res = [...selected.values()].map(
      (i) => `${INFRA_TYPES.find((t) => t.key === i.type).label} : ${i.name}`,
    );
    addMessage({ text: `${res.length} sélectionné(s)`, from: "user" });
    sendProximite(res);
    close();
  };
}

const PROXIMITE_CSS = `
.prox-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(255,255,255,0.4); backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center; font-family: -apple-system, system-ui, sans-serif; }
.prox-modal { width: min(800px, 95vw); background: white; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.1); overflow: hidden; position: relative; border: 1px solid #fff; display: flex; flex-direction: column; }
.prox-close { position: absolute; top: 20px; right: 20px; border: none; background: #f5f5f7; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; z-index: 10; }
.prox-header { padding: 30px 30px 15px; display: flex; gap: 15px; align-items: center; }
.prox-header-icon-main { width: 48px; height: 48px; background: linear-gradient(135deg, #f02aa6, #9c42f5); border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 15px rgba(156,66,245,0.3); }
.prox-title { margin: 0; font-size: 20px; font-weight: 700; color: #1d1d1f; }
.prox-subtitle { margin: 2px 0 0; color: #86868b; font-size: 14px; }
.prox-highlight { color: #9c42f5; font-weight: 600; }
.prox-legend { padding: 0 30px 15px; display: flex; gap: 8px; overflow-x: auto; }
.prox-legend-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; border: 1px solid #e5e5e7; background: white; cursor: pointer; font-size: 13px; transition: 0.2s; white-space: nowrap; }
.prox-legend-btn.active { border-color: var(--infra-color); color: var(--infra-color); }
.prox-map-wrap { height: 350px; position: relative; background: #f5f5f7; }
.prox-map { height: 100%; width: 100%; }
.prox-map .leaflet-tile-pane { filter: grayscale(1) brightness(1.05); }
.prox-map-loader { position: absolute; inset: 0; z-index: 500; background: rgba(245,245,247,0.92); display: flex; align-items: center; justify-content: center; }
.prox-loader-inner { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.prox-loader-spinner { width: 36px; height: 36px; border: 3px solid #e5e5e7; border-top-color: #9c42f5; border-radius: 50%; animation: prox-spin 0.8s linear infinite; }
.prox-loader-text { font-size: 13px; color: #86868b; font-weight: 500; }
.prox-error { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px; text-align: center; }
.prox-error-icon { font-size: 32px; }
.prox-error p { font-size: 14px; color: #86868b; margin: 0; line-height: 1.5; }
.prox-btn-retry { background: linear-gradient(135deg, #f02aa6, #9c42f5); color: white; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 600; cursor: pointer; margin-top: 4px; }
@keyframes prox-spin { to { transform: rotate(360deg); } }
.prox-selection-area { padding: 15px 30px; border-top: 1px solid #f5f5f7; display: flex; align-items: center; gap: 10px; }
.prox-selection-label { font-size: 11px; font-weight: 800; color: #86868b; }
.prox-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.prox-chip { background: #f5f5f7; color: var(--c); padding: 4px 10px; border-radius: 15px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 5px; border: 1px solid color-mix(in srgb, var(--c) 20%, transparent); }
.remove-chip { cursor: pointer; margin-left: 4px; opacity: 0.5; }
.prox-footer { padding: 15px 30px 25px; border-top: 1px solid #f5f5f7; display: flex; justify-content: space-between; align-items: center; }
.prox-radius-info { font-size: 11px; font-weight: 700; color: #1d1d1f; }
.prox-btn-secondary { background: #f5f5f7; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; }
.prox-btn-primary { background: linear-gradient(135deg, #f02aa6, #9c42f5); color: white; border: none; padding: 10px 25px; border-radius: 10px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(156,66,245,0.3); }
.custom-marker { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
.marker-inner { width: 30px; height: 30px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--m-color); box-shadow: 0 3px 8px rgba(0,0,0,0.15); border: 2px solid white; transition: 0.2s; }
.is-selected .marker-inner { background: var(--m-color); color: white; transform: scale(1.2); box-shadow: 0 0 0 5px color-mix(in srgb, var(--m-color) 30%, transparent); }
.home-marker { font-size: 24px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2)); }
`;
