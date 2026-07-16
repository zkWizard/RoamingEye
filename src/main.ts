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
  type LayerId,
  type YearMonth,
} from "./lib/timeline";
import { encodeViewState, decodeViewState } from "./lib/viewState";
import { latLngToVector3, vector3ToLatLng, formatLatLng } from "./lib/geo";
import { buildProbeCsv, normalizeLon, PROBE_SCALES } from "./lib/probe";
import { isAreaGeometry } from "./lib/geojson";
import {
  placeObservationProductFromSample,
  serializePlaceObservationExport,
  type PlaceObservationExportSample,
} from "./lib/placeObservationExport";
import {
  PLACE_METRICS,
  latestComparisonMonths,
  loadPlaceColormap,
  nativePlaceSampleValues,
  placeInsightPhysicalReading,
  placeInsightReading,
} from "./lib/placeInsights";
import {
  marineBoundarySstReading,
  unavailableMarineBoundarySstReading,
} from "./lib/marinePlaceInsight";
import {
  climateInsightText,
  climateMetricForLayer,
  summarizeRenderedClimateSample,
} from "./lib/meteorology";
import { volcanoesInSearchExtent } from "./lib/volcanoExtent";
import { parseVolcanoList } from "./lib/volcanoes";
import type { GeoResult } from "./lib/geocoding";
import { refreshDataLatest } from "./lib/freshness";
import { fetchJson, isAbortError, isOnline, OfflineError } from "./lib/net";
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
import { EarthquakesOverlay } from "./overlays/EarthquakesOverlay";
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
import { ProvidersPage } from "./ui/ProvidersPage";
import { SoftwareFinder } from "./ui/SoftwareFinder";
import { FleetDashboard } from "./ui/FleetDashboard";
import { PlaceInsights } from "./ui/PlaceInsights";
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
const placeInsightsEl = document.querySelector<HTMLElement>("#place-insights");
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
const volcanoesOverlay = new VolcanoesOverlay();
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
  new PlateBoundariesOverlay(),
  volcanoesOverlay,
  new EarthquakesOverlay(),
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
  inspector.addPointSource(() => userLocationOverlay.hoverSource);
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

// Assigned by the probe/compare sections below; the layer selector closes
// both because their contents belong to the previous layer.
let closeProbe: (() => void) | undefined;
let compareControls: CompareControls | undefined;
let placeInsightsAbort: AbortController | undefined;
const placeInsights = placeInsightsEl
  ? new PlaceInsights(placeInsightsEl, () => placeInsightsAbort?.abort())
  : undefined;
const placeSampler = new ProbeSampler({ width: 512, height: 512 }, 2);

function runPlaceInsights(result: GeoResult): void {
  if (!placeInsights || !result.geometry || !isAreaGeometry(result.geometry)) {
    placeInsights?.close();
    return;
  }

  placeInsightsAbort?.abort();
  const abort = (placeInsightsAbort = new AbortController());
  const geometry = result.geometry;
  placeInsights.open(result.name);
  const exportSamples = new Map<string, PlaceObservationExportSample>();
  const samplingTasks: Promise<void>[] = [];

  if (result.boundingBox) {
    void fetchJson<unknown>(`${import.meta.env.BASE_URL}data/volcanoes.json`, {
      signal: abort.signal,
    })
      .then(parseVolcanoList)
      .then((volcanoes) => {
        if (abort.signal.aborted) return;
        placeInsights.setVolcanoContext(
          volcanoesInSearchExtent(volcanoes, result.boundingBox)
        );
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || abort.signal.aborted) return;
        console.warn("RoamingEye: place volcano context failed to load", error);
        placeInsights.setVolcanoUnavailable();
      });
  } else {
    placeInsights.setVolcanoContext(volcanoesInSearchExtent([], null));
  }

  for (const metric of PLACE_METRICS) {
    const months = latestComparisonMonths(metric.layerId);
    if (!months) continue;
    // Start with explicit no-data observations. A failed request or an
    // unavailable authoritative colormap must not be replaced with a
    // display-converted value labelled as a native-unit measurement. NDVI is
    // withheld below because its display-ramp position is not a native value.
    exportSamples.set(metric.layerId, {
      layerId: metric.layerId,
      observations: months.map((dataMonth) => ({ dataMonth, value: null })),
    });
    samplingTasks.push(
      (async () => {
        const colormap = await loadPlaceColormap(metric.layerId);
        const sample = colormap
          ? placeSampler.sampleGeometryPhysical(
              LAYERS[metric.layerId],
              months,
              geometry,
              { lat: result.lat, lon: result.lon },
              colormap.entries,
              colormap.factor,
              { signal: abort.signal }
            )
          : placeSampler.sampleGeometry(
              LAYERS[metric.layerId],
              months,
              geometry,
              { lat: result.lat, lon: result.lon },
              { signal: abort.signal }
            );
        const {
          values,
          validFractions,
          sourceImageDimensions,
          geometrySamplingStrategy,
        } = await sample;
        if (abort.signal.aborted) return;
        const climateMetricId = climateMetricForLayer(metric.layerId);
        const climateReading =
          colormap && climateMetricId
            ? summarizeRenderedClimateSample(
                {
                  metricId: climateMetricId,
                  months,
                  sampledValues: values,
                  nativeToSampledValueFactor: colormap.factor,
                  validFractions,
                  sourceImageDimensions,
                },
                months[1]
              )
            : null;
        placeInsights.setReading(
          climateReading
            ? {
                id: metric.id,
                ...climateInsightText(climateReading[0], climateReading[1]),
              }
            : colormap
              ? placeInsightPhysicalReading(metric, months, values, {
                  validFractions,
                  sourceImageDimensions,
                  geometrySamplingStrategy,
                })
              : placeInsightReading(metric, months, values, {
                  validFractions,
                  sourceImageDimensions,
                  geometrySamplingStrategy,
                })
        );
        if (colormap || metric.layerId === "ndvi") {
          const nativeValues = colormap
            ? nativePlaceSampleValues(values, "authoritative-colormap")
            : nativePlaceSampleValues(values, "display-ramp");
          exportSamples.set(metric.layerId, {
            layerId: metric.layerId,
            sourceValueFactor: colormap?.factor ?? 1,
            observations: months.map((dataMonth, index) => ({
              dataMonth,
              value: nativeValues[index] ?? null,
              validFraction: validFractions[index],
            })),
          });
        }
      })().catch((error: unknown) => {
        if (isAbortError(error) || abort.signal.aborted) return;
        console.warn("RoamingEye: place insight sampling failed", error);
        placeInsights.setReading({
          id: metric.id,
          value: "Unavailable",
          detail:
            "Boundary could not be represented by the bounded sample grid",
        });
      })
    );
  }

  // SST is a single, latest-observation card rather than a terrestrial
  // month-over-month "condition". Sample the exact searched geometry through
  // NASA GIBS's published physical colormap so the value remains in °C.
  const sstMonths = monthRangeForLayer(LAYERS.sst);
  const sstMonth = sstMonths[sstMonths.length - 1];
  void (async () => {
    const colormap = await loadPlaceColormap("sst");
    if (!colormap) {
      throw new Error("RoamingEye: SST physical colormap is unavailable");
    }
    const sample = await placeSampler.sampleGeometryPhysical(
      LAYERS.sst,
      [sstMonth],
      geometry,
      { lat: result.lat, lon: result.lon },
      colormap.entries,
      colormap.factor,
      { signal: abort.signal }
    );
    if (abort.signal.aborted) return;
    placeInsights.setReading(
      marineBoundarySstReading({
        dataMonth: sstMonth,
        observedValue: sample.values[0],
        validFraction: sample.validFractions[0],
        sourceImageDimensions: sample.sourceImageDimensions,
      })
    );
  })().catch((error: unknown) => {
    if (isAbortError(error) || abort.signal.aborted) return;
    console.warn("RoamingEye: marine place insight sampling failed", error);
    placeInsights.setReading(unavailableMarineBoundarySstReading(sstMonth));
  });

  void Promise.all(samplingTasks).then(() => {
    if (abort.signal.aborted) return;
    const products = [...exportSamples.values()].map(
      placeObservationProductFromSample
    );
    if (products.length === 0) return;
    placeInsights.setObservationExport(
      serializePlaceObservationExport({
        boundary: geometry,
        products,
        method: {
          sampling: "area-weighted-grid-mean",
          imageWidth: 512,
          imageHeight: 512,
        },
        generatedIso: new Date().toISOString(),
        toolVersion: __APP_VERSION__,
      })
    );
  });
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

  const runProbe = (lat: number, lon: number): void => {
    const layer = LAYERS[currentLayer];
    const mode = panel.mode;
    probeTarget = { lat, lon };
    probeShare = { lat, lon };
    drawer.clear(); // a point probe replaces any drawn-region chart
    scheduleHashSync();
    panel.open(layer.label, formatLatLng({ lat, lon }));
    panel.setModeToggleVisible(true);
    if (mode === "area") {
      panel.setSubtitle(`~1° area around ${formatLatLng({ lat, lon })}`);
    }
    if (layer.static) {
      panel.setStatus(
        "This layer has no time dimension — pick a monthly layer to chart a series."
      );
      return;
    }
    if (layer.categorical) {
      panel.setStatus(
        "This layer shows classes, not a measurement — there is no numeric series to chart."
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
      .then(({ values, validFractions }) => {
        if (abort.signal.aborted) return;
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
              },
              probeMonths,
              values,
              undefined,
              validFractions
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
      panel.setStatus(
        "This layer shows classes, not a measurement — there is no numeric series to chart."
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
      .then(({ values, validFractions }) => {
        if (abort.signal.aborted) return;
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
                imageWidth: PROBE_IMAGE.width,
                imageHeight: PROBE_IMAGE.height,
                generatedIso: new Date().toISOString(),
                toolVersion: __APP_VERSION__,
                viewUrl: currentShareUrl(),
              },
              probeMonths,
              values,
              undefined,
              validFractions
            ),
          `roamingeye_region_${layer.id}_${bounds.south.toFixed(2)}_${normalizeLon(bounds.west).toFixed(2)}_${bounds.north.toFixed(2)}_${normalizeLon(bounds.east).toFixed(2)}.csv`
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

// --- Providers page ---------------------------------------------------------
if (providersPageEl && providersLinkEl) {
  const providers = new ProvidersPage(providersPageEl);
  providersLinkEl.addEventListener("click", () => providers.open());
}

// Software discovery is static and review-gated: the finder reads only the
// approved catalog artifact produced by the catalog agent fleet.
if (softwarePageEl && softwareLinkEl) {
  const softwareFinder = new SoftwareFinder(softwarePageEl);
  softwareLinkEl.addEventListener("click", () => softwareFinder.open());
}

if (fleetPageEl && fleetLinkEl) {
  const fleetDashboard = new FleetDashboard(fleetPageEl);
  fleetLinkEl.addEventListener("click", () => fleetDashboard.open());
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
