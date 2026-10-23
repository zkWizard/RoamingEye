// Shared, engine-agnostic data + UI so both prototypes are compared like for like.
export const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const TERRARIUM =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const QUAKES =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";

export const LAYERS = {
  ndvi: { label: "Vegetation (NDVI)", id: "MODIS_Terra_L3_NDVI_Monthly", level: 7, latest: "2026-07" },
  lst: { label: "Land surface temp", id: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day", level: 6, latest: "2026-07" },
  snow: { label: "Snow cover", id: "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct", level: 6, latest: "2026-07" },
};

/** XYZ template ({z}/{y}/{x}) for a GIBS monthly layer in Web Mercator. */
export function gibsUrl(layerKey, month) {
  const l = LAYERS[layerKey];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${l.id}/default/${month}-01/GoogleMapsCompatible_Level${l.level}/{z}/{y}/{x}.png`;
}

export function monthList(from = "2000-03", to = "2026-07") {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export async function fetchQuakes() {
  const r = await fetch(QUAKES);
  const j = await r.json();
  return j.features.map((f) => ({
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    depthKm: f.geometry.coordinates[2],
    mag: f.properties.mag,
    place: f.properties.place,
  }));
}

/** A July 2024 date when `lon` is at ~10:00 local solar time, so every view is daylit. */
export function sunDateFor(lon) {
  const utcHours = (((10 - lon / 15) % 24) + 24) % 24;
  return new Date(Date.UTC(2024, 6, 15) + utcHours * 3_600_000);
}

export function depthColor(d) {
  return d < 70 ? [1, 0.35, 0.2] : d < 300 ? [1, 0.8, 0.2] : [0.3, 0.7, 1];
}

/**
 * Builds the shared control panel. `engine` handlers:
 * setLayer(key|null), setMonth("YYYY-MM"), setOpacity(0..1), setQuakes(bool),
 * setExaggeration(n), flyTo({lat, lon, heightM}).
 */
export function mountUI(engineName, h) {
  const months = monthList();
  const el = document.createElement("div");
  el.className = "proto-ui";
  el.innerHTML = `
    <div class="title">RoamingEye · <b>${engineName}</b> prototype</div>
    <label>Science layer
      <select data-k="layer">
        <option value="none">None (imagery only)</option>
        ${Object.entries(LAYERS).map(([k, l]) => `<option value="${k}" ${k === "ndvi" ? "selected" : ""}>${l.label}</option>`).join("")}
      </select></label>
    <label>Month <span data-k="mlabel"></span>
      <input type="range" data-k="month" min="0" max="${months.length - 1}" value="${months.indexOf("2024-07")}"></label>
    <label>Layer opacity <input type="range" data-k="opacity" min="0" max="100" value="65"></label>
    <label>Terrain exaggeration <input type="range" data-k="exag" min="1" max="5" step="0.5" value="1.5"></label>
    <label class="row"><input type="checkbox" data-k="quakes" checked> USGS quakes M4.5+ (30 days)</label>
    <div class="row fly">
      <button data-fly="globe">Globe</button>
      <button data-fly="himalaya">Everest</button>
      <button data-fly="sf">SF Bay</button>
      <button data-fly="amazon">Amazon</button>
      <button data-fly="alps">Alps</button>
    </div>
    <div class="stats" data-k="stats"></div>`;
  document.body.appendChild(el);
  const q = (k) => el.querySelector(`[data-k="${k}"]`);
  const flights = {
    globe: { lat: 20, lon: -90, heightM: 14_000_000 },
    himalaya: { lat: 27.6, lon: 86.9, heightM: 30_000, pitch: -20, heading: 0 },
    sf: { lat: 37.6, lon: -122.45, heightM: 40_000, pitch: -35 },
    amazon: { lat: -9.5, lon: -63, heightM: 600_000 },
    alps: { lat: 45.6, lon: 7.3, heightM: 35_000, pitch: -25 },
  };
  const monthChanged = () => {
    const m = months[+q("month").value];
    q("mlabel").textContent = m;
    h.setMonth(m);
  };
  q("layer").onchange = () => h.setLayer(q("layer").value === "none" ? null : q("layer").value);
  q("month").oninput = monthChanged;
  q("opacity").oninput = () => h.setOpacity(+q("opacity").value / 100);
  q("exag").oninput = () => h.setExaggeration(+q("exag").value);
  q("quakes").onchange = () => h.setQuakes(q("quakes").checked);
  el.querySelectorAll("[data-fly]").forEach((b) => (b.onclick = () => h.flyTo(flights[b.dataset.fly])));
  q("mlabel").textContent = months[+q("month").value];

  // FPS meter (rolling 1 s window)
  let frames = 0, last = performance.now();
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - last > 1000) {
      q("stats").textContent = `${Math.round((frames * 1000) / (now - last))} fps · ${innerWidth}×${innerHeight} @${devicePixelRatio}x`;
      frames = 0; last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    initial: {
      layer: "ndvi",
      month: months[+q("month").value],
      opacity: 0.65,
      exaggeration: 1.5,
      quakes: true,
      view: flights.globe,
    },
  };
}
