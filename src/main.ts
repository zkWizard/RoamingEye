import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  LAYERS,
  DATA_LATEST,
  buildMonthRange,
  type LayerId,
  type YearMonth,
} from "./lib/timeline";
import { GlobeTextureManager } from "./textures/GlobeTextureManager";
import { TimeSlider } from "./ui/TimeSlider";
import { LayerSelector } from "./ui/LayerSelector";

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

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Scene & camera ---------------------------------------------------------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
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
if (layerEl) {
  new LayerSelector(layerEl, currentLayer, (id) => {
    currentLayer = id;
    refreshGlobe();
    prefetchCurrentLayer();
  });
}

if (timelineEl) {
  new TimeSlider(timelineEl, months, currentIndex, (index) => {
    currentIndex = index;
    refreshGlobe();
  });
}

refreshGlobe(); // kick off the initial month
prefetchCurrentLayer(); // warm the preview cache for instant scrubbing

// --- Controls (rotate + zoom) -------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // inertia for a natural "spin" feel
controls.dampingFactor = 0.08;
controls.enableZoom = true;
controls.zoomSpeed = 0.6; // gentle wheel/pinch steps
controls.minDistance = 1.15 * EARTH_RADIUS; // stop just above the surface
controls.maxDistance = 8 * EARTH_RADIUS; // keep the globe comfortably in frame
controls.enablePan = false; // panning off-center is disorienting on a globe

const BASE_ROTATE_SPEED = 0.45;
const START_ALTITUDE = camera.position.length() - EARTH_RADIUS;

// --- Render loop ------------------------------------------------------------
let signalledReady = false;
renderer.setAnimationLoop(() => {
  // Slow rotation as the camera closes in, so close-up dragging stays
  // controllable instead of whipping the surface past the viewport.
  const altitude = camera.position.length() - EARTH_RADIUS;
  controls.rotateSpeed =
    BASE_ROTATE_SPEED * Math.min(1, Math.max(0.05, altitude / START_ALTITUDE));

  controls.update();
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
