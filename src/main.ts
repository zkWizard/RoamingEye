import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  LAYERS,
  clampIndexToLayer,
  monthRangeForLayer,
  ymToIndex,
  formatYm,
  gibsWmsUrl,
  type LayerId,
  type YearMonth,
} from "./lib/timeline";
import { ExportControls } from "./ui/ExportControls";
import { GlobeTextureManager } from "./textures/GlobeTextureManager";
import { TimeSlider } from "./ui/TimeSlider";
import { LayerSelector } from "./ui/LayerSelector";
import { Toolbar } from "./ui/Toolbar";
import { SearchBox } from "./ui/SearchBox";
import type { MapOverlay } from "./overlays/types";
import { GraticuleOverlay } from "./overlays/GraticuleOverlay";
import { BordersOverlay } from "./overlays/BordersOverlay";
import { CitiesOverlay } from "./overlays/CitiesOverlay";
import { AtmosphereOverlay } from "./overlays/AtmosphereOverlay";
import { CameraFlyer } from "./scene/CameraFlyer";
import { LocationHighlight } from "./scene/LocationHighlight";
import { HoverInspector } from "./scene/HoverInspector";
import { StudyRegion } from "./scene/StudyRegion";
import { StudyChip } from "./ui/StudyChip";
import { ProvidersPage } from "./ui/ProvidersPage";
import { loadCountryIndex } from "./lib/countryIndex";
import { flyToDistance } from "./lib/navigation";
import { regionAround } from "./lib/imagery";

/**
 * RoamingEye
 * A grab-to-rotate 3D Earth whose surface is driven by a temporal scrubber:
 * scrub month-by-month through NASA's monthly seasonal composites (vegetation,
 * snow) to watch the planet's seasons shift across years.
 */

declare global {
  interface Window {
    /** Set to true after the first render — used by the e2e smoke test. */
    __APP_READY__?: boolean;
  }
}

const EARTH_RADIUS = 1;

const canvas = document.querySelector<HTMLCanvasElement>("#globe");
if (!canvas) {
  throw new Error("RoamingEye: #globe canvas element not found");
}
const loaderEl = document.querySelector<HTMLElement>("#loader");
const statusEl = document.querySelector<HTMLElement>("#timeline-status");
const layerEl = document.querySelector<HTMLElement>("#layer-selector");
const timelineEl = document.querySelector<HTMLElement>("#timeline");
const toolbarEl = document.querySelector<HTMLElement>("#toolbar");
const searchEl = document.querySelector<HTMLElement>("#search");
const tooltipEl = document.querySelector<HTMLElement>("#hover-tooltip");
const studyChipEl = document.querySelector<HTMLElement>("#study-chip");
const providersPageEl = document.querySelector<HTMLElement>("#providers-page");
const providersLinkEl = document.querySelector<HTMLElement>("#providers-link");
const provenanceEl = document.querySelector<HTMLElement>("#provenance");
const exportEl = document.querySelector<HTMLElement>("#export");

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Scene & camera ---------------------------------------------------------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.01, // near plane small enough to get right down to the surface
  100
);
camera.position.set(0, 0, 3.2);

// --- Lighting ---------------------------------------------------------------
// Strong ambient so the whole globe stays readable (satellite-eye feel),
// plus a soft directional light for a little dimensionality.
scene.add(new THREE.AmbientLight(0xffffff, 1.1));

const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(5, 3, 5);
scene.add(sunLight);

// --- Starfield backdrop -----------------------------------------------------
scene.add(createStarfield());

// --- Earth ------------------------------------------------------------------
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 96, 96),
  new THREE.MeshStandardMaterial({
    color: 0x111418, // dark base shown over ocean / no-data areas
    roughness: 1,
    metalness: 0,
  })
);
scene.add(earth);

// --- Map overlays (toolbar-toggleable) --------------------------------------
const overlays: MapOverlay[] = [
  new GraticuleOverlay(),
  new BordersOverlay(),
  new CitiesOverlay(),
  new AtmosphereOverlay(),
];
for (const overlay of overlays) scene.add(overlay.object);

const highlight = new LocationHighlight();
scene.add(highlight.object);

// High-resolution study region: a sharp HLS patch draped over a searched area,
// driven by the same timeline so you can watch it change over the years. It
// auto-selects the clearest satellite pass for each month.
function exitStudyRegion(): void {
  studyRegion.hide();
}
const studyChip = studyChipEl
  ? new StudyChip(studyChipEl, exitStudyRegion)
  : null;
const studyRegion = new StudyRegion(renderer.capabilities.getMaxAnisotropy(), {
  onLoadingChange: (loading) =>
    setStatus(loading ? "Loading high-res imagery…" : ""),
  onStatus: (text) => studyChip?.setDetail(text),
});
scene.add(studyRegion.object);

// --- Hover inspector (coordinate + country readout) -------------------------
if (tooltipEl) {
  const inspector = new HoverInspector(canvas, camera, earth, tooltipEl);
  loadCountryIndex()
    .then((index) => inspector.setCountryIndex(index))
    .catch((err) =>
      console.warn("RoamingEye: country index failed to load", err)
    );
}

// --- Temporal imagery pipeline ----------------------------------------------
// Each layer exposes its full published record (MERRA-2 reaches back to 1980),
// so `months` is per-layer and the slider rebuilds on layer switch.
let currentLayer: LayerId = "ndvi";
let months: YearMonth[] = monthRangeForLayer(LAYERS[currentLayer]);
let currentIndex = months.length - 1; // start at the most recent month
let firstLoadDone = false;

const textures = new GlobeTextureManager(
  earth.material,
  renderer.capabilities.getMaxAnisotropy(),
  {
    preview: { width: 1024, height: 512 }, // prefetched for every month → instant, crisp scrub
    sharp: { width: 2048, height: 1024 }, // loaded for the settled month (final refinement)
    onLoadingChange: (loading) => {
      setStatus(loading ? "Loading imagery…" : "");
      if (!loading && !firstLoadDone) {
        firstLoadDone = true;
        loaderEl?.classList.add("is-hidden");
      }
    },
    onError: () => setStatus("No imagery for this month"),
  }
);

function refreshGlobe(): void {
  textures.show(LAYERS[currentLayer], months[currentIndex]);
  updateProvenance();
}

// Prefetch previews so scrubbing updates the globe live at month boundaries.
// Full-record layers hold 550+ months — warming them all at once would pin
// hundreds of MB of textures, so warm the recent decade and extend backwards
// on demand as the user scrubs into older months.
const PREFETCH_CHUNK = 120;
let warmedStart = Number.MAX_SAFE_INTEGER;

function prefetchFrom(index: number): void {
  const start = Math.max(0, index);
  if (start >= warmedStart) return;
  warmedStart = start;
  textures.prefetchPreviews(LAYERS[currentLayer], months.slice(start));
}

function resetPrefetch(): void {
  warmedStart = Number.MAX_SAFE_INTEGER;
  prefetchFrom(months.length - PREFETCH_CHUNK);
}

function ensureWarm(index: number): void {
  if (index - 24 < warmedStart) prefetchFrom(index - PREFETCH_CHUNK);
}

// --- UI ---------------------------------------------------------------------
// The slider is rebuilt on layer switch because each layer's month range
// differs (its constructor clears the container).
function buildTimeline(): void {
  if (!timelineEl) return;
  new TimeSlider(timelineEl, months, currentIndex, (index) => {
    currentIndex = index;
    refreshGlobe();
    ensureWarm(index);
    if (studyRegion.active) studyRegion.setMonth(months[currentIndex]);
  });
}
buildTimeline();

if (layerEl) {
  new LayerSelector(layerEl, currentLayer, (id) => {
    const selected = months[currentIndex];
    currentLayer = id;
    months = monthRangeForLayer(LAYERS[id]);
    // Keep the same calendar month selected where the new layer covers it;
    // clamp into range otherwise (reanalysis/ocean products start/lag apart).
    const mapped = ymToIndex(selected) - ymToIndex(months[0]);
    currentIndex = Math.min(months.length - 1, Math.max(0, mapped));
    currentIndex = clampIndexToLayer(months, currentIndex, LAYERS[id]);
    buildTimeline();
    if (studyRegion.active) studyRegion.setMonth(months[currentIndex]);
    refreshGlobe();
    resetPrefetch();
  });
}

refreshGlobe(); // kick off the initial month
resetPrefetch(); // warm the preview cache for instant scrubbing

// --- Provenance & export ------------------------------------------------------
function updateProvenance(): void {
  if (!provenanceEl) return;
  const layer = LAYERS[currentLayer];
  provenanceEl.textContent = `${layer.wmsLayer} · ${formatYm(months[currentIndex])}`;
}

if (exportEl) {
  new ExportControls(exportEl, {
    downloadPng: () => {
      // Render a fresh frame and read the canvas in the same task — the
      // drawing buffer isn't preserved between frames.
      renderer.render(scene, camera);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const ym = months[currentIndex];
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `roamingeye_${currentLayer}_${ym.year}-${String(ym.month).padStart(2, "0")}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    },
    imageryUrl: () => gibsWmsUrl(LAYERS[currentLayer], months[currentIndex]),
  });
}

// Toolbar overlays — load lazily on first enable, then toggle visibility.
async function toggleOverlay(overlay: MapOverlay, on: boolean): Promise<void> {
  if (on && overlay.ensureLoaded) {
    try {
      await overlay.ensureLoaded();
    } catch (err) {
      console.warn(`RoamingEye: overlay "${overlay.id}" failed to load`, err);
    }
  }
  overlay.object.visible = on;
}

if (toolbarEl) {
  new Toolbar(toolbarEl, overlays, (overlay, on) => {
    void toggleOverlay(overlay, on);
  });
}
for (const overlay of overlays) {
  if (overlay.defaultOn) void toggleOverlay(overlay, true);
}

// --- Controls (rotate + zoom) -----------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // inertia for a natural "spin" feel
controls.dampingFactor = 0.08;
controls.enablePan = false; // keep the globe centred
controls.rotateSpeed = 0.45;
controls.zoomSpeed = 0.8;
controls.minDistance = 1.06; // get right down to a study region's surface
controls.maxDistance = 4.5; // furthest zoom-out

// --- Search + fly-to --------------------------------------------------------
const flyer = new CameraFlyer(camera, controls);

if (searchEl) {
  new SearchBox(searchEl, (result) => {
    flyer.flyTo(result.lat, result.lon, flyToDistance(result.boundingBox));
    highlight.show({
      lat: result.lat,
      lon: result.lon,
      geometry: result.geometry,
    });
    // Drape a high-res patch over the area, driven by the current timeline month.
    studyRegion.show(
      regionAround(result.lat, result.lon, 1.2),
      months[currentIndex]
    );
    studyChip?.show(result.name);
  });
}

// --- Providers page ---------------------------------------------------------
if (providersPageEl && providersLinkEl) {
  const providers = new ProvidersPage(providersPageEl);
  providersLinkEl.addEventListener("click", () => providers.open());
}

// --- Render loop ------------------------------------------------------------
const timer = new THREE.Timer();
let signalledReady = false;
renderer.setAnimationLoop(() => {
  timer.update();
  const delta = timer.getDelta();
  flyer.update(delta);
  if (!flyer.isFlying) controls.update(); // flyer drives the camera while active
  highlight.update(camera.position.length()); // keep the marker a constant size
  renderer.render(scene, camera);

  if (!signalledReady) {
    signalledReady = true;
    window.__APP_READY__ = true;
  }
});

// --- Resize handling --------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Helpers ----------------------------------------------------------------
function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

function createStarfield(): THREE.Points {
  const starCount = 1500;
  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    // Scatter stars on a large sphere shell around the scene.
    const r = 40 + Math.random() * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
  });

  return new THREE.Points(geometry, material);
}
