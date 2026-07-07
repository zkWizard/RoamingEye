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
import { encodeViewState, decodeViewState } from "./lib/viewState";
import { latLngToVector3, vector3ToLatLng, formatLatLng } from "./lib/geo";
import { buildProbeCsv, PROBE_SCALES } from "./lib/probe";
import { refreshDataLatest } from "./lib/freshness";
import { isAbortError } from "./lib/net";
import { ProbeSampler } from "./probe/ProbeSampler";
import { ProbePanel } from "./ui/ProbePanel";
import { CompareController } from "./scene/CompareController";
import { CompareControls } from "./ui/CompareControls";
import { ShareButton } from "./ui/ShareButton";
import { ExportControls } from "./ui/ExportControls";
import { ThemeToggle } from "./ui/ThemeToggle";
import type { Theme } from "./lib/theme";
import { GlobeTextureManager } from "./textures/GlobeTextureManager";
import { TimeSlider } from "./ui/TimeSlider";
import { LayerSelector } from "./ui/LayerSelector";
import { Toolbar } from "./ui/Toolbar";
import { SearchBox } from "./ui/SearchBox";
import { Legend } from "./ui/Legend";
import type { MapOverlay } from "./overlays/types";
import { GraticuleOverlay } from "./overlays/GraticuleOverlay";
import { BordersOverlay } from "./overlays/BordersOverlay";
import { CitiesOverlay } from "./overlays/CitiesOverlay";
import { AtmosphereOverlay } from "./overlays/AtmosphereOverlay";
import { EarthquakesOverlay } from "./overlays/EarthquakesOverlay";
import { PlateBoundariesOverlay } from "./overlays/PlateBoundariesOverlay";
import { VolcanoesOverlay } from "./overlays/VolcanoesOverlay";
import { TiledImageryOverlay } from "./overlays/TiledImageryOverlay";
import { CameraFlyer } from "./scene/CameraFlyer";
import { LocationHighlight } from "./scene/LocationHighlight";
import { HoverInspector } from "./scene/HoverInspector";
import { StudyRegion } from "./scene/StudyRegion";
import { StudyChip } from "./ui/StudyChip";
import { ProvidersPage } from "./ui/ProvidersPage";
import { ShortcutsOverlay } from "./ui/ShortcutsOverlay";
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
const legendEl = document.querySelector<HTMLElement>("#legend");
const timelineEl = document.querySelector<HTMLElement>("#timeline");
const toolbarEl = document.querySelector<HTMLElement>("#toolbar");
const searchEl = document.querySelector<HTMLElement>("#search");
const tooltipEl = document.querySelector<HTMLElement>("#hover-tooltip");
const studyChipEl = document.querySelector<HTMLElement>("#study-chip");
const providersPageEl = document.querySelector<HTMLElement>("#providers-page");
const probeEl = document.querySelector<HTMLElement>("#probe-panel");
const compareEl = document.querySelector<HTMLElement>("#compare");
const compareDividerEl =
  document.querySelector<HTMLElement>("#compare-divider");
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
const starfield = createStarfield();
scene.add(starfield);

// --- Theme (light/dark) -------------------------------------------------------
// The DOM theme is CSS-variable driven; the WebGL side mirrors it here: a
// space-dark or daylight clear color, and stars only against a night sky.
const SPACE_BG = new THREE.Color(0x05070d); // matches --bg (dark)
const DAY_BG = new THREE.Color(0xeaf0f8); // matches --bg (light)

function applyTheme(theme: Theme): void {
  const dark = theme === "dark";
  renderer.setClearColor(dark ? SPACE_BG : DAY_BG, 1);
  starfield.visible = dark;
}

const themeEl = document.querySelector<HTMLElement>("#theme-toggle");
if (themeEl) {
  // Constructing the toggle applies the initial theme (calls applyTheme once).
  new ThemeToggle(themeEl, applyTheme);
}

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
// Tiled streaming (RFC-001, on by default): re-drapes the visible globe with
// WMTS tiles at the level the zoom justifies; the single full-globe texture
// below acts as the far-zoom level 0. Fed the current layer/month by
// refreshGlobe(), driven per-frame from the render loop.
const hdTiles = new TiledImageryOverlay(
  renderer.capabilities.getMaxAnisotropy()
);

const citiesOverlay = new CitiesOverlay();
const volcanoesOverlay = new VolcanoesOverlay();
const overlays: MapOverlay[] = [
  hdTiles,
  new GraticuleOverlay(),
  new BordersOverlay(),
  citiesOverlay,
  new AtmosphereOverlay(),
  // The geology trio — plate boundaries, volcanoes, and live seismicity line
  // up on the globe to tell the plate-tectonics story.
  new PlateBoundariesOverlay(),
  volcanoesOverlay,
  new EarthquakesOverlay(),
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
  inspector.addPointSource(() => citiesOverlay.hoverSource);
  inspector.addPointSource(() => volcanoesOverlay.hoverSource);
  loadCountryIndex()
    .then((index) => inspector.setCountryIndex(index))
    .catch((err) =>
      console.warn("RoamingEye: country index failed to load", err)
    );
}

// --- Temporal imagery pipeline ----------------------------------------------
// Restore a shared view (layer, month, camera) from the URL hash, if present —
// links reproduce exactly what the sender was looking at. Each layer exposes
// its full published record (MERRA-2 reaches back to 1980), so `months` is
// per-layer (the hash layer is resolved first) and the slider rebuilds on
// layer switch.
const initialView = decodeViewState(window.location.hash);
let currentLayer: LayerId = initialView.layer ?? "ndvi";
let months: YearMonth[] = monthRangeForLayer(LAYERS[currentLayer]);
let currentIndex = months.length - 1; // default: the most recent month
if (initialView.month) {
  const restored = ymToIndex(initialView.month) - ymToIndex(months[0]);
  if (restored >= 0 && restored < months.length) currentIndex = restored;
}
currentIndex = clampIndexToLayer(months, currentIndex, LAYERS[currentLayer]);
if (initialView.camera) {
  const { lat, lon, alt } = initialView.camera;
  camera.position.copy(latLngToVector3(lat, lon, EARTH_RADIUS + alt));
}

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
  hdTiles.setView(LAYERS[currentLayer], months[currentIndex]);
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
    compareControls?.setLiveMonth(months[currentIndex]);
    scheduleHashSync();
  });
}
buildTimeline();

const legend = legendEl ? new Legend(legendEl, currentLayer) : undefined;

// Assigned by the probe/compare sections below; the layer selector closes
// both because their contents belong to the previous layer.
let closeProbe: (() => void) | undefined;
let compareControls: CompareControls | undefined;

if (layerEl) {
  new LayerSelector(layerEl, currentLayer, (id) => {
    closeProbe?.();
    compareControls?.exit();
    const selected = months[currentIndex];
    currentLayer = id;
    legend?.setLayer(id);
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
    scheduleHashSync();
  });
}

refreshGlobe(); // kick off the initial month
resetPrefetch(); // warm the preview cache for instant scrubbing

// --- Timeline freshness -------------------------------------------------------
// NASA publishes a new month of composites every few weeks; probe GIBS once at
// boot and grow the timeline to the newest published month, so the deployed
// site stays current without a code bump (see lib/freshness.ts).
void refreshDataLatest().then((grew) => {
  if (!grew) return;
  // Layers with their own `latest` (lagging reanalysis) are unaffected.
  if (LAYERS[currentLayer].latest) return;
  const selected = months[currentIndex];
  const wasAtEnd = currentIndex === months.length - 1;
  months = monthRangeForLayer(LAYERS[currentLayer]);
  // Follow the newest month if the user was already on it (the default view);
  // otherwise stay on whatever month they had selected.
  currentIndex = wasAtEnd
    ? months.length - 1
    : Math.max(0, ymToIndex(selected) - ymToIndex(months[0]));
  buildTimeline();
  refreshGlobe();
  resetPrefetch();
  scheduleHashSync();
});

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
      // drawing buffer isn't preserved between frames. An active comparison
      // exports exactly what's on screen, divider split included.
      if (compare.showing) {
        compare.renderSplit(renderer, scene, camera, [hdTiles.object]);
      } else {
        renderer.render(scene, camera);
      }
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
    legend?.setOverlayKey(overlay.id, on);
    void toggleOverlay(overlay, on);
  });
}
for (const overlay of overlays) {
  if (overlay.defaultOn) {
    legend?.setOverlayKey(overlay.id, true);
    void toggleOverlay(overlay, true);
  }
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

// --- Shareable view state (URL hash) ------------------------------------------
// The hash always reflects the current view, so the address bar is a citable,
// reproducible link at any moment. Writes are debounced and use replaceState
// to avoid spamming session history while dragging.
// An open probe's location, mirrored into the shareable hash — a link then
// reproduces the analysis, not just the view. Maintained by the probe section.
let probeShare: { lat: number; lon: number } | undefined;

function currentViewState() {
  const subpoint = vector3ToLatLng(camera.position);
  return {
    layer: currentLayer,
    month: months[currentIndex],
    camera: {
      lat: subpoint.lat,
      lon: subpoint.lon,
      alt: camera.position.length() - EARTH_RADIUS,
    },
    probe: probeShare,
    pin: compare.active ? compare.pinned : undefined,
  };
}

let hashTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleHashSync(): void {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    history.replaceState(null, "", `#${encodeViewState(currentViewState())}`);
  }, 400);
}

const shareEl = document.querySelector<HTMLElement>("#share");
if (shareEl) {
  new ShareButton(
    shareEl,
    () =>
      `${location.origin}${location.pathname}#${encodeViewState(currentViewState())}`
  );
}

// --- Search + fly-to --------------------------------------------------------
const flyer = new CameraFlyer(camera, controls);
controls.addEventListener("change", scheduleHashSync);

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

// --- Comparison mode (A/B of two months) ---------------------------------------
// Scrub to the "before" month, hit Compare to pin it on the left; the timeline
// keeps driving the right side. Rendered as two scissored passes per frame
// with the globe texture swapped (see CompareController).
const compare = new CompareController(
  earth.material,
  renderer.capabilities.getMaxAnisotropy(),
  (ready) => setStatus(ready ? "" : "Comparison imagery failed to load")
);

if (compareEl && compareDividerEl) {
  compareControls = new CompareControls(compareEl, compareDividerEl, {
    onEnable: () => {
      const layer = LAYERS[currentLayer];
      if (layer.static) return false; // one image regardless of month
      compare.enable(layer, months[currentIndex]);
      compareControls?.showDivider(months[currentIndex], compare.split);
      compareControls?.setLiveMonth(months[currentIndex]);
      scheduleHashSync();
      return true;
    },
    onDisable: () => {
      compare.disable();
      scheduleHashSync();
    },
    onSplitChange: (fraction) => {
      compare.split = fraction;
    },
  });

  // Restore a shared comparison: the pinned month from the URL, when the
  // active layer's record covers it.
  const pin = initialView.pin;
  if (pin && !LAYERS[currentLayer].static) {
    const pinIndex = ymToIndex(pin) - ymToIndex(months[0]);
    if (pinIndex >= 0 && pinIndex < months.length) {
      compare.enable(LAYERS[currentLayer], pin);
      compareControls.restore(pin, compare.split);
      compareControls.setLiveMonth(months[currentIndex]);
    }
  }
}

// --- Point probe (click → time series) ----------------------------------------
// Click anywhere on the globe to chart the active layer's approximate value at
// that point across its full published record, with a provenance-stamped CSV.
// Values come from inverting the layer's colormap on the same preview imagery
// the scrubber prefetches (see lib/probe.ts) — labeled approximate throughout.
if (probeEl) {
  const PROBE_IMAGE = { width: 1024, height: 512 }; // = preview size → HTTP cache hits
  let probeAbort: AbortController | undefined;
  let probeTarget: { lat: number; lon: number } | undefined;
  const panel = new ProbePanel(
    probeEl,
    () => {
      probeAbort?.abort();
      probeShare = undefined;
      scheduleHashSync();
    },
    // Mode toggle (point ↔ area) re-samples the same location.
    () => {
      if (probeTarget) runProbe(probeTarget.lat, probeTarget.lon);
    }
  );
  const sampler = new ProbeSampler(PROBE_IMAGE);
  closeProbe = () => {
    probeAbort?.abort();
    probeShare = undefined;
    panel.close();
  };

  const runProbe = (lat: number, lon: number): void => {
    const layer = LAYERS[currentLayer];
    const mode = panel.mode;
    probeTarget = { lat, lon };
    probeShare = { lat, lon };
    scheduleHashSync();
    panel.open(layer.label, formatLatLng({ lat, lon }));
    if (mode === "area") {
      panel.setSubtitle(`~1° area around ${formatLatLng({ lat, lon })}`);
    }
    if (layer.static) {
      panel.setStatus(
        "This layer has no time dimension — pick a monthly layer to chart a series."
      );
      return;
    }

    probeAbort?.abort();
    const abort = (probeAbort = new AbortController());
    const probeMonths = monthRangeForLayer(layer);
    const scale = PROBE_SCALES[layer.id];
    panel.beginSeries(probeMonths, scale);

    let lastDraw = 0;
    sampler
      .sample(layer, probeMonths, lat, lon, {
        mode,
        signal: abort.signal,
        onValue: (index, value) => panel.setValue(index, value),
        onProgress: (done, total) => {
          panel.setStatus(`Sampling ${done}/${total} months…`);
          const now = performance.now();
          if (now - lastDraw > 150 || done === total) {
            lastDraw = now;
            panel.refresh();
          }
        },
      })
      .then((values) => {
        if (abort.signal.aborted) return;
        panel.finish(
          () =>
            buildProbeCsv(
              {
                layerLabel: layer.label,
                wmsLayer: layer.wmsLayer,
                lat,
                lon,
                scale,
                mode,
                sampledBounds:
                  mode === "area" ? sampler.areaBounds(lat, lon) : undefined,
                imageWidth: PROBE_IMAGE.width,
                imageHeight: PROBE_IMAGE.height,
                generatedIso: new Date().toISOString(),
              },
              probeMonths,
              values
            ),
          `roamingeye_probe_${mode}_${layer.id}_${lat.toFixed(3)}_${lon.toFixed(3)}.csv`
        );
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.warn("RoamingEye: probe sampling failed", err);
        panel.setStatus("Sampling failed — check the connection and retry.");
      });
  };

  // Restore a shared probe: rerun the sampling at the linked point so the
  // recipient sees the same chart the sender did. Deferred until the first
  // globe imagery has landed — the probe's ~300 fetches would otherwise
  // compete with the initial load on the same connection pool.
  if (initialView.probe) {
    const target = initialView.probe;
    const restoreWhenReady = (): void => {
      if (firstLoadDone) runProbe(target.lat, target.lon);
      else setTimeout(restoreWhenReady, 300);
    };
    restoreWhenReady();
  }

  // A click is a pointer that barely travels; anything longer is a rotate/zoom.
  const probeRaycaster = new THREE.Raycaster();
  let probeDownX = 0;
  let probeDownY = 0;
  canvas.addEventListener("pointerdown", (e) => {
    probeDownX = e.clientX;
    probeDownY = e.clientY;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (Math.hypot(e.clientX - probeDownX, e.clientY - probeDownY) > 6) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    probeRaycaster.setFromCamera(ndc, camera);
    const hit = probeRaycaster.intersectObject(earth, false)[0];
    if (!hit) return;
    const { lat, lon } = vector3ToLatLng(hit.point);
    runProbe(lat, lon);
  });
}

// --- Providers page ---------------------------------------------------------
if (providersPageEl && providersLinkEl) {
  const providers = new ProvidersPage(providersPageEl);
  providersLinkEl.addEventListener("click", () => providers.open());
}

// --- Keyboard shortcuts overlay -----------------------------------------------
const shortcutsPageEl = document.querySelector<HTMLElement>("#shortcuts-page");
if (shortcutsPageEl) {
  const shortcuts = new ShortcutsOverlay(shortcutsPageEl);
  document
    .querySelector<HTMLElement>("#shortcuts-link")
    ?.addEventListener("click", () => shortcuts.open());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "?") return;
    const target = e.target as HTMLElement | null;
    // Don't hijack typing (e.g. the search box).
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    e.preventDefault();
    shortcuts.toggle();
  });
}

// --- Render loop ------------------------------------------------------------
const timer = new THREE.Timer();
let signalledReady = false;
let wasFlying = false;
renderer.setAnimationLoop(() => {
  timer.update();
  const delta = timer.getDelta();
  flyer.update(delta);
  if (!flyer.isFlying) controls.update(); // flyer drives the camera while active
  // Flights move the camera without OrbitControls events — sync the shareable
  // hash once when a fly-to lands.
  if (wasFlying && !flyer.isFlying) scheduleHashSync();
  wasFlying = flyer.isFlying;
  highlight.update(camera.position.length()); // keep the marker a constant size
  for (const overlay of overlays) overlay.update?.(camera, window.innerHeight);
  // HD tiles stream the live month, so they only belong on the live side of
  // a comparison split (the pinned side falls back to its full-globe texture).
  if (compare.showing) {
    compare.renderSplit(renderer, scene, camera, [hdTiles.object]);
  } else {
    renderer.render(scene, camera);
  }

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
