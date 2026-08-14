import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  LAYERS,
  clampIndexToLayer,
  monthRangeForLayer,
  nearestMonthIndex,
  formatTimelineLabel,
  ymEqual,
  ymToIndex,
  gibsWmsUrl,
  type LayerConfig,
  type LayerId,
  type YearMonth,
} from "./lib/timeline";
import { encodeViewState, decodeViewState } from "./lib/viewState";
import { latLngToVector3, vector3ToLatLng, formatLatLng } from "./lib/geo";
import {
  buildProbeCsv,
  normalizeLon,
  PROBE_SCALES,
  scaleValue,
} from "./lib/probe";
import {
  inversionAccuracyCsvHeaders,
  probeInversionAccuracy,
} from "./lib/probeInversionAccuracy";
import {
  probeSstExtremeCensoring,
  sstExtremeCensoringCsvHeaders,
} from "./lib/probeSstExtremeCensoring";
import {
  probeRecordGaps,
  probeRecordGapsCsvHeaders,
} from "./lib/probeRecordGaps";
import { emptyAtmosphereProbeNote } from "./lib/atmosphereProbeDomain";
import { marineAveragedSstCensoringCsvHeaders } from "./lib/marineAveragedSstCensoring";
import { averagedSstSupportNote } from "./lib/marineAveragedSstSupport";
import { vegetationAveragedSupportNote } from "./lib/vegetationAveragedSupport";
import { snowAveragedSupportNote } from "./lib/snowAveragedSupport";
import { emptyMarineProbeNote } from "./lib/marineProbeDomain";
import { emptySnowProbeNote } from "./lib/snowProbeAbsence";
import { emptyVegetationProbeNote } from "./lib/vegetationProbeAbsence";
import {
  seasonalSamplingBalance,
  seasonalSamplingCsvHeaders,
} from "./lib/seasonalSamplingBalance";
import { sstSamplingIdentityCsvHeaders } from "./lib/seaSurfaceTemperatureSamplingIdentity";
import { snowIlluminationNote } from "./lib/snowCoverIllumination";
import type { GeoResult } from "./lib/geocoding";
import { refreshDataLatest } from "./lib/freshness";
import { isAbortError, isOnline, OfflineError } from "./lib/net";
import { nextPixelRatio } from "./lib/perf";
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
import { UserLocationOverlay } from "./overlays/UserLocationOverlay";
import { GraticuleOverlay } from "./overlays/GraticuleOverlay";
import { BordersOverlay } from "./overlays/BordersOverlay";
import { CitiesOverlay } from "./overlays/CitiesOverlay";
import { AtmosphereOverlay } from "./overlays/AtmosphereOverlay";
import {
  EARTHQUAKE_HOVER_SOURCE_COUNT,
  EarthquakesOverlay,
} from "./overlays/EarthquakesOverlay";
import { PlateBoundariesOverlay } from "./overlays/PlateBoundariesOverlay";
import { VolcanoesOverlay } from "./overlays/VolcanoesOverlay";
import { TiledImageryOverlay } from "./overlays/TiledImageryOverlay";
import { CameraFlyer } from "./scene/CameraFlyer";
import { LocationHighlight } from "./scene/LocationHighlight";
import { HoverInspector } from "./scene/HoverInspector";
import { RegionDrawer } from "./scene/RegionDrawer";
import { RegionButton } from "./ui/RegionButton";
import { ErrorToast } from "./ui/ErrorToast";
import {
  SESSION_STORAGE_KEY,
  serializeSession,
  parseSession,
  type SessionState,
} from "./lib/sessionState";
import type { Bounds } from "./lib/imagery";
import { StudyRegion } from "./scene/StudyRegion";
import { StudyChip } from "./ui/StudyChip";
import { ShortcutsOverlay } from "./ui/ShortcutsOverlay";
import { loadAdmin1Index, loadCountryIndex } from "./lib/countryIndex";
import { flyToDistance, rotateSpeedForDistance } from "./lib/navigation";

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
    /** Whether the render loop is running (false while the tab is hidden). */
    __RENDER_ACTIVE__?: boolean;
    /** GPU-resource counters for the soak e2e's leak canary. */
    __RENDERER_STATS__?: () => { textures: number; geometries: number };
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
const softwarePageEl = document.querySelector<HTMLElement>("#software-page");
const fleetPageEl = document.querySelector<HTMLElement>("#fleet-page");
const probeEl = document.querySelector<HTMLElement>("#probe-panel");
const compareEl = document.querySelector<HTMLElement>("#compare");
const compareDividerEl =
  document.querySelector<HTMLElement>("#compare-divider");
const providersLinkEl = document.querySelector<HTMLElement>("#providers-link");
const softwareLinkEl = document.querySelector<HTMLElement>("#software-link");
const fleetLinkEl = document.querySelector<HTMLElement>("#fleet-link");
const provenanceEl = document.querySelector<HTMLElement>("#provenance");
const exportEl = document.querySelector<HTMLElement>("#export");

// --- Renderer ---------------------------------------------------------------
// WebGL can be unavailable (blocked by policy, ancient drivers, disabled
// hardware acceleration) — the constructor throws. Show a human explanation
// in the loader instead of a blank page and a console stack.
function webglUnavailable(err: unknown): never {
  if (loaderEl) {
    loaderEl.classList.remove("is-hidden");
    loaderEl.innerHTML = `
      <div class="loader__fallback">
        <h2>RoamingEye needs WebGL</h2>
        <p>Your browser blocked or doesn't support WebGL, which draws the 3D
        globe. Try enabling hardware acceleration in your browser settings,
        updating your graphics drivers, or a current version of Chrome,
        Firefox, Edge, or Safari.</p>
        <p><a href="https://get.webgl.org/" target="_blank" rel="noopener">Test WebGL support →</a></p>
      </div>`;
  }
  throw err instanceof Error ? err : new Error(String(err));
}
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  webglUnavailable(err);
}
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

// Surfaced early so the geolocation overlay can report a denied permission.
const errorToast = new ErrorToast();

const citiesOverlay = new CitiesOverlay();
const plateBoundariesOverlay = new PlateBoundariesOverlay();
const volcanoesOverlay = new VolcanoesOverlay();
const earthquakesOverlay = new EarthquakesOverlay();
// "You are here" — opt-in geolocation pin; denial reverts its toggle + toasts.
const userLocationOverlay = new UserLocationOverlay((message) =>
  errorToast.show(message)
);
const overlays: MapOverlay[] = [
  hdTiles,
  new GraticuleOverlay(),
  new BordersOverlay(),
  citiesOverlay,
  new AtmosphereOverlay(),
  // The geology trio — plate boundaries, volcanoes, and live seismicity line
  // up on the globe to tell the plate-tectonics story.
  plateBoundariesOverlay,
  volcanoesOverlay,
  earthquakesOverlay,
  userLocationOverlay,
];
for (const overlay of overlays) scene.add(overlay.object);

const highlight = new LocationHighlight();
scene.add(highlight.object);

// High-resolution study regions are kept separate from place search. Search
// results use their actual returned boundaries, rather than a generic image box.
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
  for (let index = 0; index < EARTHQUAKE_HOVER_SOURCE_COUNT; index += 1) {
    inspector.addPointSource(() => earthquakesOverlay.hoverSources[index]);
  }
  inspector.addPointSource(() => userLocationOverlay.hoverSource);
  inspector.addLineSource(() => plateBoundariesOverlay.hoverSource);
  loadCountryIndex()
    .then((index) => {
      inspector.setCountryIndex(index);
      // Admin-1 (province/state) is ~1.3 MB gzipped — load it only after the
      // small country index has landed, so it never competes with boot. The
      // hover upgrades in place: coords → country → province, country.
      loadAdmin1Index()
        .then((admin1) => inspector.setAdmin1Index(admin1))
        .catch((err) =>
          console.warn("RoamingEye: admin-1 index failed to load", err)
        );
    })
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
// The last session's working context (layer/month/overlays) restores on a
// plain revisit; an explicit URL hash always wins. localStorage can throw
// (private mode) — degrade to defaults, never break boot.
function loadStoredSession(): SessionState {
  try {
    return parseSession(window.localStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return {};
  }
}
const storedSession = loadStoredSession();
let currentLayer: LayerId = initialView.layer ?? storedSession.layer ?? "ndvi";
let months: YearMonth[] = monthRangeForLayer(LAYERS[currentLayer]);
let currentIndex = months.length - 1; // default: the most recent month
// Nearest-entry mapping (not raw month arithmetic) so annual layers'
// non-consecutive timelines restore correctly too.
const restoredMonth = initialView.month ?? storedSession.month;
if (restoredMonth) {
  currentIndex = nearestMonthIndex(months, restoredMonth);
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
    onError: () => {
      // Could be genuinely absent data or a GIBS hiccup — offer the retry.
      setStatus("Imagery failed to load");
      retryBtn.hidden = false;
    },
  }
);

// Failed imagery is not cached (see GlobeTextureManager), so retrying is
// simply re-driving the pipeline for the current view.
const retryBtn = document.createElement("button");
retryBtn.type = "button";
retryBtn.className = "status-retry";
retryBtn.textContent = "Retry";
retryBtn.hidden = true;
statusEl?.insertAdjacentElement("afterend", retryBtn);
retryBtn.addEventListener("click", () => refreshGlobe());

function refreshGlobe(): void {
  retryBtn.hidden = true;
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
  new TimeSlider(
    timelineEl,
    months,
    currentIndex,
    (index) => {
      currentIndex = index;
      refreshGlobe();
      ensureWarm(index);
      if (studyRegion.active) studyRegion.setMonth(months[currentIndex]);
      compareControls?.setLiveMonth(months[currentIndex]);
      scheduleHashSync();
    },
    (ym) => formatTimelineLabel(LAYERS[currentLayer], ym),
    LAYERS[currentLayer].cadence === "annual" ? "year" : "month"
  );
}
buildTimeline();

const legend = legendEl ? new Legend(legendEl, currentLayer) : undefined;
hdTiles.onVisibleCoverageChange(({ requested, loaded, failed }) => {
  legend?.setTerrainTileCoverage(requested, loaded, failed);
});

// Assigned by the probe/compare sections below; the layer selector closes
// both because their contents belong to the previous layer.
let closeProbe: (() => void) | undefined;
let compareControls: CompareControls | undefined;
let placeInsightsModule:
  Promise<typeof import("./place/placeInsightsController")> | undefined;

/**
 * The place-insights subsystem (panel UI, samplers, and every per-domain
 * reading) only matters once a search resolves a place, so it loads as its
 * own chunk on first use rather than riding the boot bundle.
 */
function runPlaceInsights(result: GeoResult): void {
  placeInsightsModule ??= import("./place/placeInsightsController");
  void placeInsightsModule.then((m) => m.runPlaceInsights(result));
}

if (layerEl) {
  new LayerSelector(layerEl, currentLayer, (id) => {
    closeProbe?.();
    compareControls?.exit();
    const selected = months[currentIndex];
    currentLayer = id;
    legend?.setLayer(id);
    months = monthRangeForLayer(LAYERS[id]);
    // Keep the closest calendar month selected where the new layer covers it;
    // clamp into range otherwise (reanalysis/ocean products start/lag apart,
    // annual layers step by year).
    currentIndex = nearestMonthIndex(months, selected);
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
  // Freshness pins each product family separately — rebuild only if the
  // *current* layer's own record actually grew (a compiled-`latest`
  // reanalysis layer, or a lagging family, is unaffected).
  const fresh = monthRangeForLayer(LAYERS[currentLayer]);
  if (ymEqual(fresh[fresh.length - 1], months[months.length - 1])) return;
  const selected = months[currentIndex];
  const wasAtEnd = currentIndex === months.length - 1;
  months = fresh;
  // Follow the newest month if the user was already on it (the default view);
  // otherwise stay on whatever month they had selected.
  currentIndex = wasAtEnd
    ? months.length - 1
    : nearestMonthIndex(months, selected);
  buildTimeline();
  refreshGlobe();
  resetPrefetch();
  scheduleHashSync();
});

// --- Provenance & export ------------------------------------------------------
function updateProvenance(): void {
  if (!provenanceEl) return;
  const layer = LAYERS[currentLayer];
  provenanceEl.textContent = `${layer.wmsLayer} · ${formatTimelineLabel(layer, months[currentIndex])}`;
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
        // Version in the filename: a figure in a slide deck stays traceable
        // to the software that rendered it, months later.
        a.download = `roamingeye_${currentLayer}_${ym.year}-${String(ym.month).padStart(2, "0")}_v${__APP_VERSION__}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    },
    imageryUrl: () => gibsWmsUrl(LAYERS[currentLayer], months[currentIndex]),
  });
}

// Intended overlay on/off state — tracked separately from object.visible
// (which lags behind async lazy loads) so persistence is race-free. A stored
// list (even empty) is authoritative; otherwise the defaults apply.
const ephemeralOverlayIds = new Set(
  overlays.filter((o) => o.ephemeral).map((o) => o.id)
);
const overlayState = new Set<string>(
  (
    storedSession.overlays ??
    overlays.filter((o) => o.defaultOn).map((o) => o.id)
  ).filter((id) => !ephemeralOverlayIds.has(id))
);

function saveSession(): void {
  try {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializeSession({
        layer: currentLayer,
        month: months[currentIndex],
        overlays: [...overlayState],
      })
    );
  } catch {
    // Private mode / storage disabled — persistence is best-effort.
  }
}

// Toolbar overlays — load lazily on first enable, then toggle visibility.
// Returns whether the overlay is now in the requested state: an enable whose
// lazy load fails (e.g. geolocation denied) stays off so the caller can revert.
async function toggleOverlay(
  overlay: MapOverlay,
  on: boolean
): Promise<boolean> {
  if (on && overlay.ensureLoaded) {
    try {
      await overlay.ensureLoaded();
    } catch (err) {
      console.warn(`RoamingEye: overlay "${overlay.id}" failed to load`, err);
      overlay.object.visible = false;
      return false;
    }
  }
  overlay.object.visible = on;
  return true;
}

if (toolbarEl) {
  const toolbar = new Toolbar(
    toolbarEl,
    overlays,
    (overlay, on) => {
      // Ephemeral overlays (geolocation) are never persisted — a returning
      // visitor shouldn't be silently re-prompted for their location.
      if (!overlay.ephemeral) {
        if (on) overlayState.add(overlay.id);
        else overlayState.delete(overlay.id);
        saveSession();
      }
      legend?.setOverlayKey(overlay.id, on);
      void toggleOverlay(overlay, on).then((ok) => {
        if (on && !ok) {
          // The enable didn't take (permission denied, load error) — snap the
          // button back and drop the (already-toasted) key.
          toolbar.setPressed(overlay.id, false);
          legend?.setOverlayKey(overlay.id, false);
        }
      });
    },
    (overlay) => overlayState.has(overlay.id)
  );
}
for (const overlay of overlays) {
  if (overlayState.has(overlay.id)) {
    legend?.setOverlayKey(overlay.id, true);
    void toggleOverlay(overlay, true);
  }
}

// --- Controls (rotate + zoom) -----------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // inertia for a natural "spin" feel
controls.dampingFactor = 0.08;
controls.enablePan = false; // keep the globe centred
// rotateSpeed is re-derived from the camera altitude every frame (see the
// render loop): constant speed flings the camera when zoomed to the surface.
controls.rotateSpeed = rotateSpeedForDistance(camera.position.length());
controls.zoomSpeed = 0.8;
controls.minDistance = 1.06; // get right down to a selected place boundary
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
    saveSession();
  }, 400);
}

/** The shareable deep link for the current view — the reproduction URL that
 * goes on the clipboard and into every CSV export's provenance header. */
function currentShareUrl(): string {
  return `${location.origin}${location.pathname}#${encodeViewState(currentViewState())}`;
}

const shareEl = document.querySelector<HTMLElement>("#share");
if (shareEl) {
  new ShareButton(shareEl, currentShareUrl);
}

// --- Search + fly-to --------------------------------------------------------
// Vestibular safety: users who set prefers-reduced-motion get an instant
// reposition instead of an animated flight (CSS already respects it).
const flyer = new CameraFlyer(
  camera,
  controls,
  window.matchMedia("(prefers-reduced-motion: reduce)").matches
);
controls.addEventListener("change", scheduleHashSync);

if (searchEl) {
  new SearchBox(searchEl, (result) => {
    closeProbe?.();
    flyer.flyTo(result.lat, result.lon, flyToDistance(result.boundingBox));
    highlight.show({
      lat: result.lat,
      lon: result.lon,
      geometry: result.geometry,
    });
    // A search result can be a postcode, city, state, or country. Nominatim
    // already returns its polygon when one is mapped, and LocationHighlight
    // traces that exact geometry. Do not drape the old fixed 1.2° study patch:
    // its rectangular footprint obscures the boundary the user asked for.
    studyRegion.hide();
    studyChip?.hide();
    runPlaceInsights(result);
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

  // Drawn study regions (the #26 flagship): arm via the "Draw region"
  // button, drag a box on the globe, and its monthly mean charts in the
  // probe panel. OrbitControls pauses while the drawer owns the drag.
  const drawEl = document.querySelector<HTMLElement>("#draw");
  let regionButton: RegionButton | undefined;
  const drawer = new RegionDrawer(canvas, camera, earth, {
    onModeChange: (armed) => {
      controls.enabled = !armed;
      regionButton?.setActive(armed);
      setStatus(armed ? "Drag on the globe to draw a region" : "");
    },
    onComplete: (bounds) => runRegionProbe(bounds),
  });
  scene.add(drawer.object);
  if (drawEl) {
    regionButton = new RegionButton(drawEl, (on) => drawer.setArmed(on));
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") drawer.setArmed(false);
  });

  const panel = new ProbePanel(
    probeEl,
    () => {
      probeAbort?.abort();
      probeShare = undefined;
      drawer.clear();
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
    drawer.setArmed(false);
    drawer.clear();
    panel.close();
  };

  /**
   * Read the IGBP class at a point on the class-coded land-cover layer.
   *
   * Class codes are categorical, so the pixels are decoded through the source
   * palette and counted — never inverted through a colormap or averaged. The
   * panel reports the most frequent sampled class with its pixel count and the
   * cited MCD12Q1 record it came from.
   */
  const readLandCoverClass = (
    layer: LayerConfig,
    ym: YearMonth,
    lat: number,
    lon: number,
    mode: "point" | "area",
    abort: AbortController
  ): void => {
    panel.setStatus("Reading land-cover class…");
    // The class tables and decoder load on demand: only this one layer needs
    // them, and the entry chunk's budget is shared with everything else.
    Promise.all([
      sampler.sampleRenderedPixels(layer, ym, lat, lon, {
        mode,
        signal: abort.signal,
      }),
      import("./probe/landCoverClassRead"),
    ])
      .then(([pixels, { readLandCoverClassText }]) => {
        if (abort.signal.aborted) return;
        panel.setStatus(readLandCoverClassText(pixels, ym.year));
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.warn("RoamingEye: land-cover class read failed", err);
        panel.setStatus(
          "Reading the land-cover class failed — check the connection and retry."
        );
      });
  };

  // Same on-demand class tables as the point read, over the drawn box: a
  // region covers many source pixels, so the honest answer is the mix of
  // classes rather than one label.
  const readLandCoverRegion = (
    layer: LayerConfig,
    ym: YearMonth,
    bounds: Bounds,
    abort: AbortController
  ): void => {
    panel.setStatus("Reading land-cover classes…");
    Promise.all([
      sampler.sampleRenderedRegionPixels(layer, ym, bounds, {
        signal: abort.signal,
      }),
      import("./probe/landCoverRegionRead"),
    ])
      .then(([{ pixels, sampling }, { readLandCoverRegionText }]) => {
        if (abort.signal.aborted) return;
        panel.setStatus(readLandCoverRegionText(pixels, ym.year, sampling));
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.warn("RoamingEye: land-cover region read failed", err);
        panel.setStatus(
          "Reading the land-cover classes failed — check the connection and retry."
        );
      });
  };

  const runProbe = (lat: number, lon: number): void => {
    const layer = LAYERS[currentLayer];
    const mode = panel.mode;
    probeTarget = { lat, lon };
    probeShare = { lat, lon };
    drawer.clear(); // a point probe replaces any drawn-region chart
    scheduleHashSync();
    const where =
      mode === "area"
        ? `~1° area around ${formatLatLng({ lat, lon })}`
        : formatLatLng({ lat, lon });
    // MOD10CM maps snow from reflected sunlight, so a high-latitude record has
    // months it cannot have observed at all. Name them before the chart fills
    // in, so a polar-winter gap — or a filled dark-month value — is not read
    // as a snow measurement. Null, and free, everywhere equatorward of 63.3°.
    const darkness = layer.id === "snow" ? snowIlluminationNote(lat) : null;
    panel.open(layer.label, darkness ? `${where} · ${darkness}` : where);
    panel.setModeToggleVisible(true);
    if (layer.static) {
      panel.setStatus(
        "This layer has no time dimension — pick a monthly layer to chart a series."
      );
      return;
    }
    if (layer.categorical) {
      // No numeric series to chart — but the class at the point is a real,
      // citable observation, so read it instead of dead-ending. Only the IGBP
      // layer has a decodable palette here; any other class-coded layer keeps
      // the honest "nothing to chart" message rather than being read through
      // a palette that does not describe it.
      if (layer.id === "landcover") {
        probeAbort?.abort();
        const abort = (probeAbort = new AbortController());
        readLandCoverClass(layer, months[currentIndex], lat, lon, mode, abort);
        return;
      }
      panel.setStatus(
        "This layer shows classes, not a measurement — there is no numeric series to chart."
      );
      return;
    }

    probeAbort?.abort();
    const abort = (probeAbort = new AbortController());
    const probeMonths = monthRangeForLayer(layer);
    const scale = PROBE_SCALES[layer.id];
    panel.beginSeries(probeMonths, scale, { layerId: layer.id, latitude: lat });

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
      .then(({ values, validFractions }) => {
        if (abort.signal.aborted) return;
        // An area mean over a coastal box averages only the pixels that
        // carried SST; say what share of the box those were. A point probe
        // has no share to report, so it passes none and stays silent.
        const sstSupportNote = averagedSstSupportNote(
          layer.id,
          "sampled-area",
          mode === "area" ? validFractions : null
        );
        // The same question for the vegetation indices, whose undrawn pixels
        // are their lowest-index ones rather than a domain boundary — so the
        // share qualifies the direction of the mean, not just its extent.
        // Both layers pass through the same gate: no shares, no clause.
        const vegetationSupportNote = vegetationAveragedSupportNote(
          layer.id,
          "sampled-area",
          values,
          mode === "area" ? validFractions : null
        );
        // And once more for snow, where the undrawn pixels are the percent-0
        // ones GIBS leaves transparent — so an area mean is the mean where
        // snow was drawn, and the undrawn share moves with the melt season
        // rather than sitting still. The place panel states this for one
        // month; the series did not. It also gives a snow-free box a reason
        // for its empty chart instead of "no data at this point".
        const snowSupportNote = snowAveragedSupportNote(
          layer.id,
          "sampled-area",
          values,
          mode === "area" ? validFractions : null
        );
        // An area value is a mean of per-pixel decodes and a point value a
        // median, so only the area footprint carries censoring the end-cap
        // screen cannot see. Shared by the status line and the export.
        const averagedFootprint = mode === "area" ? "sampled-area" : null;
        // The physical series the file writes, not the 0..1 gradient positions
        // held here — every screen below judges the record as exported.
        const physical = values.map((v) =>
          v === null ? null : scaleValue(v, scale)
        );
        const sstCensoring = probeSstExtremeCensoring(layer.id, physical);
        panel.finish(
          () =>
            buildProbeCsv(
              {
                layerLabel: layer.label,
                wmsLayer: layer.wmsLayer,
                dataset: layer.dataset,
                lat,
                lon,
                scale,
                mode,
                sampledBounds:
                  mode === "area" ? sampler.areaBounds(lat, lon) : undefined,
                imageWidth: PROBE_IMAGE.width,
                imageHeight: PROBE_IMAGE.height,
                generatedIso: new Date().toISOString(),
                toolVersion: __APP_VERSION__,
                viewUrl: currentShareUrl(),
                inversionAccuracyHeaders: inversionAccuracyCsvHeaders(
                  probeInversionAccuracy(layer.id, scale)
                ),
                // The status line already qualifies the on-screen month
                // count; the exported file outlives the session, so it
                // carries the same correction.
                recordGapHeaders: probeRecordGapsCsvHeaders(
                  probeRecordGaps(layer.id, probeMonths)
                ),
                // Same reasoning for *which* moments the values sample: the
                // probe states the SST sampling gate on screen, and the
                // download needs it more — nothing in a column of degrees
                // says it is a daytime skin composite. Empty for every
                // other layer.
                samplingIdentityHeaders: sstSamplingIdentityCsvHeaders(
                  layer.id
                ),
                // And the same for the rows themselves: the status line prints
                // an inequality in front of every censored statistic, while a
                // capped month's `value` cell is an ordinary decimal. Judged on
                // the physical series the file writes, not the 0..1 gradient
                // positions held here. Empty for every other layer and for an
                // SST record that stayed inside the finite ramp.
                censoringHeaders: sstExtremeCensoringCsvHeaders(sstCensoring),
                // And that screen reads the area mean, not the pixels it
                // averaged, so an unflagged row is not an uncensored one. A
                // point probe's median needs no such correction.
                averagedCensoringHeaders: marineAveragedSstCensoringCsvHeaders(
                  averagedFootprint,
                  sstCensoring
                ),
                // And the same for the record's calendar composition: the panel
                // says a mean over 11 of 12 calendar months is not an annual
                // mean, then hands over a value column with nothing on it to
                // stop the next reader averaging all of it. Silent for a record
                // spread evenly across the calendar.
                seasonalSamplingHeaders: seasonalSamplingCsvHeaders(
                  seasonalSamplingBalance(probeMonths, physical),
                  scale
                ),
              },
              probeMonths,
              values,
              undefined,
              validFractions
            ),
          `roamingeye_probe_${mode}_${layer.id}_${lat.toFixed(3)}_${lon.toFixed(3)}.csv`,
          // SST is an ocean product, so an inland point returns nothing by
          // construction — "no data at this point" reports that domain
          // boundary as a retrieval failure. The marine note defers to the
          // support clause above whenever that already explained the absence.
          // Snow empties for the opposite reason — GIBS draws no colour for
          // percent 0 — and a POINT probe carries no shares, so the averaged
          // clause above cannot speak for it. This is that mode's only note.
          // The vegetation indices empty the same way, below their ramp start
          // rather than at zero, and were the last domain still reporting that
          // as "no data at this point".
          emptyAtmosphereProbeNote(layer.id, values) ??
            emptyMarineProbeNote(layer.id, values, sstSupportNote) ??
            emptySnowProbeNote(layer.id, values, snowSupportNote) ??
            emptyVegetationProbeNote(layer.id, values, vegetationSupportNote),
          // Each note is gated on its own layer, so at most one is ever a
          // string — the fallback picks the one that spoke.
          sstSupportNote ?? vegetationSupportNote ?? snowSupportNote,
          // Area mode charts a weighted mean of per-pixel decodes; point mode
          // charts a median, which the SST end-cap screen already catches.
          averagedFootprint
        );
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.warn("RoamingEye: probe sampling failed", err);
        panel.setStatus("Sampling failed — check the connection and retry.");
      });
  };

  // Chart the monthly mean of a drawn region — same pipeline as the point
  // probe, sampling a grid over the box instead of one location.
  const runRegionProbe = (bounds: Bounds): void => {
    const layer = LAYERS[currentLayer];
    probeTarget = undefined; // the mode toggle is hidden for region charts
    probeShare = undefined;
    scheduleHashSync();
    panel.open(
      layer.label,
      // normalizeLon: a box drawn across the antimeridian carries continuous
      // longitudes (east > 180); display them as real coordinates.
      `Drawn region · mean over ${formatLatLng({ lat: bounds.south, lon: normalizeLon(bounds.west) })} → ` +
        formatLatLng({ lat: bounds.north, lon: normalizeLon(bounds.east) })
    );
    panel.setModeToggleVisible(false);
    if (layer.static) {
      panel.setStatus(
        "This layer has no time dimension — pick a monthly layer to chart a series."
      );
      return;
    }
    if (layer.categorical) {
      // No numeric series to chart — but the class mix over the drawn box is a
      // real, citable observation, so read it instead of dead-ending. Only the
      // IGBP layer has a decodable palette here; any other class-coded layer
      // keeps the honest "nothing to chart" message rather than being read
      // through a palette that does not describe it.
      if (layer.id === "landcover") {
        probeAbort?.abort();
        const abort = (probeAbort = new AbortController());
        readLandCoverRegion(layer, months[currentIndex], bounds, abort);
        return;
      }
      panel.setStatus(
        "This layer shows classes, not a measurement — there is no numeric series to chart."
      );
      return;
    }

    probeAbort?.abort();
    const abort = (probeAbort = new AbortController());
    const probeMonths = monthRangeForLayer(layer);
    const scale = PROBE_SCALES[layer.id];
    panel.beginSeries(probeMonths, scale, { layerId: layer.id });

    let lastDraw = 0;
    sampler
      .sampleRegion(layer, probeMonths, bounds, {
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
      .then(({ values, validFractions, regionSampling }) => {
        if (abort.signal.aborted) return;
        // The header names the drawn box, but SST is undefined over land and
        // those pixels are rejected rather than averaged in — so a coastal
        // box charts the water it found, not the box. The CSV already
        // carries this share per month; state it on the panel too.
        const sstSupportNote = averagedSstSupportNote(
          layer.id,
          "drawn-region",
          validFractions
        );
        // And the same for the vegetation indices. GIBS leaves every value
        // below the ramp start undrawn, so a box's water, snow, ice and cloud
        // pixels are rejected rather than averaged in — and those are exactly
        // its lowest-index ones, which the CSV's per-month share records but
        // the panel did not. The place panel already states this for a single
        // month; the series surface did not.
        const vegetationSupportNote = vegetationAveragedSupportNote(
          layer.id,
          "drawn-region",
          values,
          validFractions
        );
        // And the same for snow: GIBS leaves percent 0 transparent, so a box's
        // snow-free ground is rejected rather than averaged in as 0% — the
        // charted mean covers the drawn patches only, and the share it covers
        // shrinks through the melt season, damping the swing the chart shows.
        const snowSupportNote = snowAveragedSupportNote(
          layer.id,
          "drawn-region",
          values,
          validFractions
        );
        // The physical series the file writes, not the 0..1 gradient positions
        // held here. Shared by the status line and the export.
        const physical = values.map((v) =>
          v === null ? null : scaleValue(v, scale)
        );
        const sstCensoring = probeSstExtremeCensoring(layer.id, physical);
        panel.finish(
          () =>
            buildProbeCsv(
              {
                layerLabel: layer.label,
                wmsLayer: layer.wmsLayer,
                dataset: layer.dataset,
                lat: (bounds.south + bounds.north) / 2,
                lon: (bounds.west + bounds.east) / 2,
                scale,
                mode: "region",
                sampledBounds: bounds,
                regionSampling,
                imageWidth: PROBE_IMAGE.width,
                imageHeight: PROBE_IMAGE.height,
                generatedIso: new Date().toISOString(),
                toolVersion: __APP_VERSION__,
                viewUrl: currentShareUrl(),
                inversionAccuracyHeaders: inversionAccuracyCsvHeaders(
                  probeInversionAccuracy(layer.id, scale)
                ),
                // The status line already qualifies the on-screen month
                // count; the exported file outlives the session, so it
                // carries the same correction.
                recordGapHeaders: probeRecordGapsCsvHeaders(
                  probeRecordGaps(layer.id, probeMonths)
                ),
                // Same reasoning for *which* moments the values sample: the
                // probe states the SST sampling gate on screen, and the
                // download needs it more — nothing in a column of degrees
                // says it is a daytime skin composite. Empty for every
                // other layer.
                samplingIdentityHeaders: sstSamplingIdentityCsvHeaders(
                  layer.id
                ),
                // And the same for the rows themselves: the status line prints
                // an inequality in front of every censored statistic, while a
                // capped month's `value` cell is an ordinary decimal. Judged on
                // the physical series the file writes, not the 0..1 gradient
                // positions held here. Empty for every other layer and for an
                // SST record that stayed inside the finite ramp.
                censoringHeaders: sstExtremeCensoringCsvHeaders(sstCensoring),
                // And that screen reads the region mean, not the pixels it
                // averaged, so an unflagged row is not an uncensored one.
                averagedCensoringHeaders: marineAveragedSstCensoringCsvHeaders(
                  "drawn-region",
                  sstCensoring
                ),
                // A drawn box spans latitudes and can straddle hemispheres, so
                // the balance is measured on the region's own charted series
                // and given no location context — it describes which calendar
                // months this file holds, and claims nothing about their
                // seasons.
                seasonalSamplingHeaders: seasonalSamplingCsvHeaders(
                  seasonalSamplingBalance(probeMonths, physical),
                  scale
                ),
              },
              probeMonths,
              values,
              undefined,
              validFractions
            ),
          `roamingeye_region_${layer.id}_${bounds.south.toFixed(2)}_${normalizeLon(bounds.west).toFixed(2)}_${bounds.north.toFixed(2)}_${normalizeLon(bounds.east).toFixed(2)}.csv`,
          // A drawn region that returned nothing is normally explained by the
          // support clause; the marine, snow and vegetation notes only speak
          // when it did not — a region always supplies shares, so those three
          // defer here. They are passed anyway so the chain stays the same on
          // both paths and a region that ever loses its shares is still
          // explained rather than falling back to "no data at this point".
          emptyAtmosphereProbeNote(layer.id, values) ??
            emptyMarineProbeNote(layer.id, values, sstSupportNote) ??
            emptySnowProbeNote(layer.id, values, snowSupportNote) ??
            emptyVegetationProbeNote(layer.id, values, vegetationSupportNote),
          // Each note is gated on its own layer, so at most one is ever a
          // string — the fallback picks the one that spoke.
          sstSupportNote ?? vegetationSupportNote ?? snowSupportNote,
          // Every drawn-region value is a weighted mean of per-pixel decodes.
          "drawn-region"
        );
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.warn("RoamingEye: region sampling failed", err);
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
  let probeSuppressed = false;
  canvas.addEventListener("pointerdown", (e) => {
    probeDownX = e.clientX;
    probeDownY = e.clientY;
    probeSuppressed = drawer.active; // that gesture belongs to the drawer
  });
  canvas.addEventListener("pointerup", (e) => {
    if (probeSuppressed) return;
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

// --- Secondary panels -------------------------------------------------------
// The providers, software and fleet panels are reference material: none of it is
// needed to render the globe, and each drags in its own catalog and formatting
// code. They are loaded on first open instead of at boot, which keeps that code
// out of the entry chunk (see scripts/check-bundle-size.mjs). A failed chunk
// load clears the cache so the next click retries, and rejects so the global
// error surface reports it.
function lazyPanel(
  container: HTMLElement,
  link: HTMLElement,
  load: () => Promise<new (el: HTMLElement) => { open(): void }>
): void {
  let panel: Promise<{ open(): void }> | null = null;
  link.addEventListener("click", () => {
    if (!panel) {
      panel = load().then((Panel) => new Panel(container));
      panel.catch(() => {
        panel = null;
      });
    }
    void panel.then((p) => p.open());
  });
}

if (providersPageEl && providersLinkEl) {
  lazyPanel(providersPageEl, providersLinkEl, () =>
    import("./ui/ProvidersPage").then((m) => m.ProvidersPage)
  );
}

// Software discovery is static and review-gated: the finder reads only the
// approved catalog artifact produced by the catalog agent fleet.
if (softwarePageEl && softwareLinkEl) {
  lazyPanel(softwarePageEl, softwareLinkEl, () =>
    import("./ui/SoftwareFinder").then((m) => m.SoftwareFinder)
  );
}

if (fleetPageEl && fleetLinkEl) {
  lazyPanel(fleetPageEl, fleetLinkEl, () =>
    import("./ui/FleetDashboard").then((m) => m.FleetDashboard)
  );
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

// --- Uncaught-error surface -----------------------------------------------------
// Failures must be visible in the field, not just in the console. Expected
// noise (aborted fetches from scrubbing/typing fast) is filtered out.
// (errorToast is constructed early, up by the overlays, so the geolocation
// overlay can report a denied permission through it.)
window.addEventListener("error", (e) => {
  errorToast.show(`Something went wrong: ${e.message}`);
});
window.addEventListener("unhandledrejection", (e) => {
  if (isAbortError(e.reason)) return;
  // Offline fast-fails are expected while disconnected — the banner below
  // already tells that story; a toast per background prefetch would be spam.
  if (e.reason instanceof OfflineError) return;
  const message =
    e.reason instanceof Error ? e.reason.message : String(e.reason);
  errorToast.show(`Something went wrong: ${message}`);
});

// --- Connectivity awareness ------------------------------------------------------
// Field connectivity churns (trains, planes, remote sites). While offline the
// fetch layer fast-fails (see lib/net.ts OfflineError) and a quiet banner says
// why nothing new is loading; on reconnect the banner drops and the current
// view refreshes itself — failed months aren't cached, so a refreshGlobe()
// genuinely refetches.
const offlineBanner = document.createElement("div");
offlineBanner.className = "offline-banner";
offlineBanner.setAttribute("role", "status");
offlineBanner.textContent = "Offline — showing last loaded imagery";
offlineBanner.hidden = true;
document.body.appendChild(offlineBanner);

window.addEventListener("offline", () => {
  offlineBanner.hidden = false;
});
window.addEventListener("online", () => {
  offlineBanner.hidden = true;
  refreshGlobe();
  if (studyRegion.active) studyRegion.setMonth(months[currentIndex]);
});
if (!isOnline()) offlineBanner.hidden = false;

// --- WebGL context loss/recovery ---------------------------------------------
// A GPU reset, driver update, or aggressive mobile backgrounding can kill the
// context mid-session. preventDefault() on `lost` tells the browser we intend
// to handle restoration; three.js re-uploads GPU resources on `restored`, and
// a refreshGlobe() re-drives the texture pipeline for the current view.
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  setStatus("Graphics context lost — recovering…");
});
canvas.addEventListener("webglcontextrestored", () => {
  setStatus("");
  refreshGlobe();
});

// --- Adaptive resolution -------------------------------------------------------
// Weak GPUs (old lab machines, software rendering) can't hold 60 fps at full
// devicePixelRatio. Measure FPS over ~2 s windows and trade resolution for
// interactivity (pure decision logic in lib/perf.ts).
const MAX_PIXEL_RATIO = Math.min(window.devicePixelRatio, 2);
let fpsWindowStart = performance.now();
let fpsFrames = 0;
function adaptResolution(now: number): void {
  fpsFrames++;
  const elapsed = now - fpsWindowStart;
  if (elapsed < 2000) return;
  const fps = (fpsFrames * 1000) / elapsed;
  fpsWindowStart = now;
  fpsFrames = 0;
  const current = renderer.getPixelRatio();
  const target = nextPixelRatio(current, fps, undefined, MAX_PIXEL_RATIO);
  if (target !== current) {
    renderer.setPixelRatio(target);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// --- Render loop ------------------------------------------------------------
const timer = new THREE.Timer();
let signalledReady = false;
let wasFlying = false;
const renderFrame = (): void => {
  timer.update();
  const delta = timer.getDelta();
  flyer.update(delta);
  // Drag speed follows the camera altitude, so the ground under the cursor
  // tracks the drag at street-level zoom and orbit alike.
  controls.rotateSpeed = rotateSpeedForDistance(camera.position.length());
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
  adaptResolution(performance.now());
};
renderer.setAnimationLoop(renderFrame);
window.__RENDER_ACTIVE__ = true;
// Read-only GPU-resource counters for the soak e2e (see e2e/soak.spec.ts):
// un-disposed textures/geometries survive GC and accumulate until the WebGL
// context dies, so the leak canary watches the renderer's own bookkeeping.
window.__RENDERER_STATS__ = () => ({
  textures: renderer.info.memory.textures,
  geometries: renderer.info.memory.geometries,
});

// Pause rendering while the tab is hidden — no reason to burn GPU/battery on
// a globe nobody can see. Data work (freshness probe, in-flight sampling) is
// untouched; only drawing stops. The timer resets on resume so the hidden gap
// never lands as one giant delta (which would teleport an in-flight flight).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    renderer.setAnimationLoop(null);
    window.__RENDER_ACTIVE__ = false;
  } else {
    timer.reset();
    // Restart the FPS window too — the hidden gap must not read as low FPS.
    fpsWindowStart = performance.now();
    fpsFrames = 0;
    renderer.setAnimationLoop(renderFrame);
    window.__RENDER_ACTIVE__ = true;
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
