import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  LAYERS,
  DATA_LATEST,
  buildMonthRange,
  clampIndexToLayer,
  type LayerId,
  type YearMonth,
} from "./lib/timeline";
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
const MONTHS_BACK = 60; // last 5 years, to start

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
const months: YearMonth[] = buildMonthRange(DATA_LATEST, MONTHS_BACK);
let currentLayer: LayerId = "ndvi";
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
}

// Prefetch a small preview of every month so scrubbing updates the globe live
// at each month boundary, not just when the user stops dragging.
function prefetchCurrentLayer(): void {
  textures.prefetchPreviews(LAYERS[currentLayer], months);
}

// --- UI ---------------------------------------------------------------------
const timeSlider = timelineEl
  ? new TimeSlider(timelineEl, months, currentIndex, (index) => {
      currentIndex = index;
      refreshGlobe();
      if (studyRegion.active) studyRegion.setMonth(months[currentIndex]);
    })
  : null;

if (layerEl) {
  new LayerSelector(layerEl, currentLayer, (id) => {
    currentLayer = id;
    // Some layers (reanalysis, ocean) lag behind the MODIS composites — snap
    // the timeline to a month this layer actually covers.
    const snapped = clampIndexToLayer(months, currentIndex, LAYERS[id]);
    if (snapped !== currentIndex) {
      currentIndex = snapped;
      timeSlider?.setIndex(snapped);
      if (studyRegion.active) studyRegion.setMonth(months[currentIndex]);
    }
    refreshGlobe();
    prefetchCurrentLayer();
  });
}

refreshGlobe(); // kick off the initial month
prefetchCurrentLayer(); // warm the preview cache for instant scrubbing

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
