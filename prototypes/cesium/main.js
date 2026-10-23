import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "../shared/ui.css";
import { ESRI_IMAGERY, TERRARIUM, LAYERS, gibsUrl, fetchQuakes, depthColor, mountUI, sunDateFor } from "../shared/data.js";

window.CESIUM_BASE_URL = `${import.meta.env.BASE_URL}cesium/`;

// Keyless terrain: AWS Terrarium PNG tiles decoded into Cesium heightmaps.
const SIZE = 65;
const MAX_Z = 15;
const tileCache = new Map();
function loadTerrarium(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    const url = TERRARIUM.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    tileCache.set(
      key,
      fetch(url)
        .then((r) => r.blob())
        .then(createImageBitmap)
        .then((bmp) => {
          const c = new OffscreenCanvas(256, 256).getContext("2d", { willReadFrequently: true });
          c.drawImage(bmp, 0, 0);
          return c.getImageData(0, 0, 256, 256).data;
        }),
    );
  }
  return tileCache.get(key);
}
const terrainProvider = new Cesium.CustomHeightmapTerrainProvider({
  width: SIZE,
  height: SIZE,
  tilingScheme: new Cesium.WebMercatorTilingScheme(),
  credit: "Terrain: Mapzen/AWS Terrarium",
  callback: async (x, y, level) => {
    const z = Math.min(level, MAX_Z);
    const shift = level - z;
    const n = 1 << shift;
    const sx = x >> shift, sy = y >> shift;
    const ox = x - sx * n, oy = y - sy * n;
    const px = await loadTerrarium(z, sx, sy);
    const out = new Float32Array(SIZE * SIZE);
    for (let r = 0; r < SIZE; r++) {
      const v = Math.min(255, Math.round(((oy + r / (SIZE - 1)) / n) * 255));
      for (let c = 0; c < SIZE; c++) {
        const u = Math.min(255, Math.round(((ox + c / (SIZE - 1)) / n) * 255));
        const i = (v * 256 + u) * 4;
        out[r * SIZE + c] = Math.max(0, px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768);
      }
    }
    return out;
  },
});

const viewer = new Cesium.Viewer("app", {
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({ url: ESRI_IMAGERY, maximumLevel: 19, credit: "Imagery: Esri, Maxar, Earthstar Geographics" }),
  ),
  terrainProvider,
  baseLayerPicker: false, geocoder: false, timeline: false, animation: false, homeButton: false,
  sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
  selectionIndicator: false,
});
const { scene } = viewer;
scene.globe.enableLighting = true;
scene.globe.dynamicAtmosphereLighting = true;
scene.globe.maximumScreenSpaceError = 1.5;
scene.highDynamicRange = true;
viewer.clock.shouldAnimate = false;

let layerKey, month, opacity, science;
function refreshScience() {
  const old = science;
  science = null;
  if (layerKey) {
    science = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({ url: gibsUrl(layerKey, month), maximumLevel: LAYERS[layerKey].level, credit: "NASA GIBS" }),
    );
    science.alpha = opacity;
  }
  // keep the previous month visible until the new one has had a moment to stream
  if (old) setTimeout(() => viewer.imageryLayers.remove(old), 700);
}

const quakes = new Cesium.CustomDataSource("quakes");
viewer.dataSources.add(quakes);
fetchQuakes().then((list) => {
  for (const q of list) {
    const [r, g, b] = depthColor(q.depthKm);
    quakes.entities.add({
      position: Cesium.Cartesian3.fromDegrees(q.lon, q.lat),
      point: {
        pixelSize: 4 + (q.mag - 4.5) * 5,
        color: new Cesium.Color(r, g, b, 0.9),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
        outlineWidth: 1,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: 2_000_000,
      },
    });
  }
});

function flyTo({ lat, lon, heightM, pitch = -90, heading = 0 }, duration = 3) {
  // offset the eye so the target sits in the middle of a tilted view
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(sunDateFor(lon));
  const back = pitch > -89 ? heightM / Math.tan((-pitch * Math.PI) / 180) / 111_000 : 0;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat - back, heightM),
    orientation: { heading: Cesium.Math.toRadians(heading), pitch: Cesium.Math.toRadians(pitch) },
    duration,
  });
}

const { initial } = mountUI("CesiumJS", {
  setLayer: (k) => { layerKey = k; refreshScience(); },
  setMonth: (m) => { month = m; refreshScience(); },
  setOpacity: (o) => { opacity = o; if (science) science.alpha = o; },
  setExaggeration: (e) => (scene.verticalExaggeration = e),
  setQuakes: (on) => (quakes.show = on),
  flyTo,
});
({ layer: layerKey, month, opacity } = initial);
scene.verticalExaggeration = initial.exaggeration;
refreshScience();
flyTo(initial.view, 0);
window.__viewer = viewer;
