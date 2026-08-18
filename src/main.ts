import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  LAYERS,
  clampIndexToLayer,
  monthRangeForLayer,
  nearestMonthIndex,
  formatTimelineLabel,
  ymEqual,
  utcYearMonth,
  type LayerConfig,
  type LayerId,
  type YearMonth,
} from "./lib/timeline";
import {
  encodeViewState,
  decodeViewState,
  type ProbeShare,
} from "./lib/viewState";
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
  probeSstColdEndAccuracy,
  sstColdEndAccuracyCsvHeaders,
} from "./lib/sstColdEndAccuracy";
import { uncalibratedVegetationAccuracyCsvHeaders } from "./lib/vegetationIndexRamp";
import { vegetationSamplingIdentityCsvHeaders } from "./lib/vegetationObservingConstraints";
import {
  probeSstExtremeCensoring,
  sstExtremeBoundPrefix,
  sstExtremeCensoringCsvHeaders,
} from "./lib/probeSstExtremeCensoring";
import {
  aerosolCeilingBoundPrefix,
  aerosolCeilingCensoringCsvHeaders,
  probeAerosolCeilingCensoring,
} from "./lib/probeAerosolCeilingCensoring";
import {
  lstExtremeBoundPrefix,
  lstExtremeCensoringCsvHeaders,
  probeLstExtremeCensoring,
} from "./lib/probeLstExtremeCensoring";
import { averagedAerosolCensoringCsvHeaders } from "./lib/probeAerosolAveragedCensoring";
import { averagedLstCensoringCsvHeaders } from "./lib/probeLstAveragedCensoring";
import {
  probeRecordGaps,
  probeRecordGapsCsvHeaders,
} from "./lib/probeRecordGaps";
import { emptyAtmosphereProbeNote } from "./lib/atmosphereProbeDomain";
import { marineAveragedSstCensoringCsvHeaders } from "./lib/marineAveragedSstCensoring";
import { averagedSstSupportNote } from "./lib/marineAveragedSstSupport";
import { sstNativeSupportNote } from "./lib/sstNativeSupport";
import { vegetationAveragedSupportNote } from "./lib/vegetationAveragedSupport";
import { vegetationChartedRecordNote } from "./lib/vegetationChartedRecord";
import { gldasAveragedSupportNote } from "./lib/gldasAveragedSupport";
import { gldasChartedRecordNote } from "./lib/gldasChartedRecord";
import { airTemperatureAveragedSupportNote } from "./lib/airTemperatureAveragedSupport";
import { snowAveragedSupportNote } from "./lib/snowAveragedSupport";
import { snowChartedRecordNote } from "./lib/snowChartedRecord";
import { emptyMarineProbeNote } from "./lib/marineProbeDomain";
import { emptySnowProbeNote } from "./lib/snowProbeAbsence";
import { emptyVegetationProbeNote } from "./lib/vegetationProbeAbsence";
import { emptySoilProbeNote } from "./lib/soilProbeDomain";
import {
  seasonalSamplingBalance,
  seasonalSamplingCsvHeaders,
} from "./lib/seasonalSamplingBalance";
import { sstSamplingIdentityCsvHeaders } from "./lib/seaSurfaceTemperatureSamplingIdentity";
import { sstObservingConstraintCsvHeaders } from "./lib/sstObservingConstraints";
import { lstSamplingIdentityCsvHeaders } from "./lib/lstObservingConstraints";
import { snowIlluminationNote } from "./lib/snowCoverIllumination";
import type { GeoResult } from "./lib/geocoding";
import { refreshDataLatest } from "./lib/freshness";
import { isAbortError, isOnline, OfflineError } from "./lib/net";
import { nextPixelRatio } from "./lib/perf";
import { ProbeSampler } from "./probe/ProbeSampler";
import { ProbePanel } from "./ui/ProbePanel";
import { CompareController } from "./scene/CompareController";
import { CompareControls } from "./ui/CompareControls";
import {
  exportMonthStamp,
  imageryUrlExport,
  provenanceMonths,
  resolvePinnedMonth,
} from "./lib/compare";
import { ShareButton } from "./ui/ShareButton";
import { ExportControls } from "./ui/ExportControls";
import { ThemeToggle } from "./ui/ThemeToggle";
import type { Theme } from "./lib/theme";
import { GlobeTextureManager } from "./textures/GlobeTextureManager";
import { TimeSlider } from "./ui/TimeSlider";
import { dataCurrencyNote } from "./ui/dataCurrency";
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
import { Announcer } from "./ui/Announcer";
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
import {
  flyToDistance,
  rotateSpeedForDistance,
  stepGlobeView,
} from "./lib/navigation";

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
const loaderSlowEl = document.querySelector<HTMLElement>("#loader-slow");
const statusEl = document.querySelector<HTMLElement>("#timeline-status");
const layerEl = document.querySelector<HTMLElement>("#layer-selector");
const legendEl = document.querySelector<HTMLElement>("#legend");
const timelineEl = document.querySelector<HTMLElement>("#timeline");
const toolbarEl = document.querySelector<HTMLElement>("#toolbar");
const searchEl = document.querySelector<HTMLElement>("#search");
const tooltipEl = document.querySelector<HTMLElement>("#hover-tooltip");
const reticleEl = document.querySelector<HTMLElement>("#globe-reticle");
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
const announcer = new Announcer();

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
// Hoisted out of the block: the pointer is not the only thing that aims at the
// globe, and the keyboard section below puts the same readout on the point the
// arrow keys are turning towards.
let inspector: HoverInspector | undefined;
if (tooltipEl) {
  const hover = new HoverInspector(canvas, camera, earth, tooltipEl);
  inspector = hover;
  hover.addPointSource(() => citiesOverlay.hoverSource);
  hover.addPointSource(() => volcanoesOverlay.hoverSource);
  for (let index = 0; index < EARTHQUAKE_HOVER_SOURCE_COUNT; index += 1) {
    hover.addPointSource(() => earthquakesOverlay.hoverSources[index]);
  }
  hover.addPointSource(() => userLocationOverlay.hoverSource);
  hover.addLineSource(() => plateBoundariesOverlay.hoverSource);
  loadCountryIndex()
    .then((index) => {
      hover.setCountryIndex(index);
      // Admin-1 (province/state) is ~1.3 MB gzipped — load it only after the
      // small country index has landed, so it never competes with boot. The
      // hover upgrades in place: coords → country → province, country.
      loadAdmin1Index()
        .then((admin1) => hover.setAdmin1Index(admin1))
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

// How long the boot curtain may sit on a mute spinner before it says what it
// is waiting on. Under a stalled upstream the first imagery request runs its
// full 15 s timeout (lib/net.ts) before "Imagery failed to load" and the retry
// button appear — and both of those are painted *behind* the curtain, which
// covers the viewport at z-index 3. So the entire user-visible event for the
// first fifteen seconds of a GIBS stall was a spinner and "Loading Earth…",
// identical to a healthy boot that happens to be a second slow. Six seconds
// clears an ordinary boot (2–4 s) comfortably; past it, silence is the wrong
// answer whether the cause is NASA's service or the user's connection.
const SLOW_BOOT_NOTICE_MS = 6000;

const slowBootTimer = setTimeout(() => {
  if (firstLoadDone || !loaderSlowEl) return;
  const line = document.createElement("p");
  line.className = "loader__slow-text";
  // Names the service rather than blaming the connection: from here the two
  // are indistinguishable, and this audience knows what GIBS is.
  line.textContent = "NASA GIBS is slow to answer — still waiting on imagery.";
  loaderSlowEl.appendChild(line);
}, SLOW_BOOT_NOTICE_MS);

// The curtain is coming up, either onto the globe or onto the failure message
// it was hiding — the notice has nothing left to add in either case.
function clearSlowBootNotice(): void {
  clearTimeout(slowBootTimer);
  loaderSlowEl?.replaceChildren();
}

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
        clearSlowBootNotice();
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
      compareControls?.setLiveMonth(LAYERS[currentLayer], months[currentIndex]);
      scheduleHashSync();
    },
    (ym) => formatTimelineLabel(LAYERS[currentLayer], ym),
    LAYERS[currentLayer].cadence === "annual" ? "year" : "month",
    (message) => announcer.announce(message)
  );
  // The record end (and so how far behind the calendar it is) belongs to the
  // layer, so the resting caption is re-stated wherever the slider is rebuilt:
  // boot, layer switch, and the freshness probe extending the range.
  setStatus("");
}
buildTimeline();

const legend = legendEl ? new Legend(legendEl, currentLayer) : undefined;
hdTiles.onVisibleCoverageChange(({ requested, loaded, failed }) => {
  legend?.setTerrainTileCoverage(requested, loaded, failed);
});

// Assigned by the probe/compare sections below; the layer selector closes
// both because their contents belong to the previous layer.
let closeProbe: (() => void) | undefined;
// Set once the probe section builds it. The globe's key handler lives at module
// scope, above the drawer, and has to ask whether draw mode owns the arrows.
let regionDrawer: RegionDrawer | undefined;
let compareControls: CompareControls | undefined;
// The pinned month behind the divider, for surfaces that run before the
// comparison controller is constructed (it needs the renderer and the globe
// material, so it is built with the rest of the compare section below). The
// initial refreshGlobe() draws the provenance line before that point, when no
// comparison can be on screen.
let pinnedComparisonMonth: () => YearMonth | undefined = () => undefined;
let placeInsightsModule:
  Promise<typeof import("./place/placeInsightsController")> | undefined;

/**
 * The place-insights subsystem (panel UI, samplers, and every per-domain
 * reading) only matters once a search resolves a place, so it loads as its
 * own chunk on first use rather than riding the boot bundle.
 */
function runPlaceInsights(result: GeoResult): void {
  placeInsightsModule ??= import("./place/placeInsightsController");
  void placeInsightsModule.then(
    (m) => m.runPlaceInsights(result),
    () => {
      // A chunk fetch can fail on a flaky connection, and until now the only
      // report was the global unhandled-rejection toast quoting a hashed
      // bundle URL — which names nothing a reader in the field can act on.
      // Reloading is the honest remedy, not searching again: a dynamic import
      // that fails stays rejected in the browser's module map, so a later
      // search re-requests nothing (measured in Chromium — the retry the
      // secondary panels attempt by clearing their cache never reaches the
      // network either).
      errorToast.show(
        "Couldn't load place details. Reload the page to try again."
      );
    }
  );
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
  provenanceEl.textContent = `${layer.wmsLayer} · ${provenanceMonths(
    layer,
    months[currentIndex],
    pinnedComparisonMonth()
  )}`;
}

if (exportEl) {
  new ExportControls(
    exportEl,
    {
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
          // A successful save reports itself through the browser's own download
          // chrome, so it needs no message of ours. A failed encode fires no
          // download at all — without this the press is answered by nothing
          // whatsoever, on every channel. The toast is `role="alert"`, so the
          // one line covers both the user who would have seen the file appear
          // and the one who would have heard it.
          if (!blob) {
            errorToast.show("Couldn't save the PNG. Try again.");
            return;
          }
          const ym = months[currentIndex];
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          // Version in the filename: a figure in a slide deck stays traceable
          // to the software that rendered it, months later. `showing` (not
          // `active`) is the right gate here — it is the pinned texture landing
          // that puts a second month into the pixels being read back.
          a.download = `roamingeye_${currentLayer}_${exportMonthStamp(ym, compare.showing ? compare.pinned : undefined)}_v${__APP_VERSION__}.png`;
          a.click();
          URL.revokeObjectURL(a.href);
        }, "image/png");
      },
      // A comparison is built from two GetMap requests, so the copied URL has
      // to name both months — `showing` again, for the same reason as the PNG.
      imageryUrl: () =>
        imageryUrlExport(
          LAYERS[currentLayer],
          months[currentIndex],
          compare.showing ? compare.pinned : undefined
        ),
    },
    (message) => announcer.announce(message)
  );
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

// How long an overlay may take to load before its toggle admits it's waiting.
// Under this, the spinner would be a flicker the eye reads as a glitch; over
// it, silence reads as a dead button.
const PENDING_INDICATOR_DELAY_MS = 150;

// Toolbar overlays — load lazily on first enable, then toggle visibility.
// Returns whether the overlay is now in the requested state: an enable whose
// lazy load fails (e.g. geolocation denied) stays off so the caller can revert.
async function toggleOverlay(
  overlay: MapOverlay,
  on: boolean,
  // Whether a failed enable is worth a toast. True for a press the user just
  // made; false while restoring a saved session, because a cold boot on a bad
  // connection would otherwise open with an error over the globe, and the
  // offline banner covers that case honestly enough. The restore stays silent
  // but no longer stays wrong: its caller un-presses the button and drops the
  // legend key, so the bar reports what the globe is actually drawing.
  reportFailure = false
): Promise<boolean> {
  if (on && overlay.ensureLoaded) {
    try {
      await overlay.ensureLoaded();
    } catch (err) {
      console.warn(`RoamingEye: overlay "${overlay.id}" failed to load`, err);
      // Say so. The toggle is about to snap itself back off, and until now
      // that was the only evidence the user got: a button that flicked on and
      // returned, with the reason left in a console nobody in the field has
      // open. The catch here also keeps the failure away from the global
      // unhandledrejection toast, so nothing else was ever going to report it.
      // Geolocation is the exception — it words its own denial (see
      // `reportsOwnLoadErrors`), and a second toast would just talk over it.
      if (reportFailure && !overlay.reportsOwnLoadErrors) {
        errorToast.show(
          `Couldn't load ${overlay.label}. Turn it on again to retry.`
        );
      }
      overlay.object.visible = false;
      return false;
    }
  }
  overlay.object.visible = on;
  return true;
}

// Hoisted out of the `if` below so the session restore that follows can correct
// the bar it built: a restored overlay whose load fails has to un-press its own
// button, and the restore loop runs after this block.
let toolbar: Toolbar | null = null;
if (toolbarEl) {
  toolbar = new Toolbar(
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

      // An enable that has to fetch — or ask the browser where we are — used to
      // look exactly like a settled one for the whole wait. Mark it busy, but
      // only once the wait is long enough to be worth reporting, so an
      // already-cached overlay never flashes a spinner on its way to instant.
      let pendingTimer: ReturnType<typeof setTimeout> | undefined;
      // Whether we actually told the user to wait, as opposed to merely
      // scheduling to. Only a wait that was announced needs an ending.
      let saidWaiting = false;
      if (on && overlay.ensureLoaded) {
        pendingTimer = setTimeout(() => {
          saidWaiting = true;
          toolbar?.setPending(overlay.id, true);
        }, PENDING_INDICATOR_DELAY_MS);
      }

      void toggleOverlay(overlay, on, true).then((ok) => {
        if (pendingTimer !== undefined) clearTimeout(pendingTimer);
        toolbar?.setPending(overlay.id, false);
        if (on && !ok) {
          // The enable didn't take (permission denied, load error) — snap the
          // button back and drop the (already-toasted) key.
          toolbar?.setPressed(overlay.id, false);
          legend?.setOverlayKey(overlay.id, false);
          return;
        }
        // The press flipped `aria-pressed` immediately, which is right for the
        // control but claims the overlay is drawn before its data exists — on
        // a slow feed, seconds before. `aria-busy` then said "waiting", and
        // its removal said nothing at all: the arrival of the markers is a
        // change on the globe, and the globe is not something a screen reader
        // can read. Only failure had a voice (the toast), so the one outcome a
        // user could hear was the bad one. Say when it worked, on exactly the
        // enables that admitted to waiting — announcing the instant, cached
        // ones would be chatter over a state `aria-pressed` already carried.
        if (saidWaiting) announcer.announce(`${overlay.label} shown`);
      });
    },
    (overlay) => overlayState.has(overlay.id)
  );
}
for (const overlay of overlays) {
  if (overlayState.has(overlay.id)) {
    legend?.setOverlayKey(overlay.id, true);
    void toggleOverlay(overlay, true).then((ok) => {
      if (ok) return;
      // The restore didn't take. Until now this branch was discarded, so the
      // failure showed up only as an absence: the button the toolbar built
      // from the stored session stayed pressed and the legend kept the key
      // that was set optimistically one line above — on the earthquakes feed,
      // a two-channel key naming depth bands and magnitude sizes for markers
      // that are not on the globe. A press that fails already snaps itself
      // back (see the toggle handler above); a restore has exactly the same
      // obligation, and more reason to meet it, because the user did not make
      // the gesture and so has nothing to explain what they are looking at.
      // The stored session is deliberately left alone: the id stays in
      // `overlayState`, so a feed that was merely unreachable this once comes
      // back on the next boot rather than being silently forgotten. That also
      // makes the button an honest retry — pressing it re-runs the load.
      toolbar?.setPressed(overlay.id, false);
      legend?.setOverlayKey(overlay.id, false);
    });
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

// --- Keyboard aim readout -----------------------------------------------------
// A pointer aims with a cursor, and the hover readout follows it. The keyboard
// has no cursor: it turns the globe under a fixed aim at the middle of the
// view, which is the point Enter charts. That point was neither drawn nor
// named, so arrowing the globe reported nothing at all — the only way to learn
// where you had arrived was to press Enter and read the probe that opened, and
// a screen-reader user got silence either way. The reticle marks the point, the
// same readout the cursor gets names it, and the live region says it out loud
// once the turning stops.
let aimSpeechTimer: ReturnType<typeof setTimeout> | undefined;

const syncKeyboardAim = (moved: boolean): void => {
  // `:focus-visible`, not `:focus` — clicking the globe focuses it too, and a
  // user who is already pointing does not need a second aim on screen.
  if (!inspector || !canvas.matches(":focus-visible")) {
    clearTimeout(aimSpeechTimer);
    inspector?.clearAim();
    reticleEl?.classList.remove("is-visible");
    tooltipEl?.classList.remove("is-aimed");
    return;
  }
  inspector.aimAt(vector3ToLatLng(camera.position));
  reticleEl?.classList.add("is-visible");
  tooltipEl?.classList.add("is-aimed");
  if (!moved) return;
  // Announce where the globe came to rest, not every step of getting there: a
  // held arrow key, and the damping that carries on after it, would otherwise
  // narrate dozens of points the user was only passing over.
  clearTimeout(aimSpeechTimer);
  aimSpeechTimer = setTimeout(() => {
    if (!inspector || !canvas.matches(":focus-visible")) return;
    // `nameAim`, not `describe`: a screen-reader user arrowing a volcano into
    // the middle of the view must hear that it is a volcano, not its latitude.
    announcer.announce(inspector.nameAim(vector3ToLatLng(camera.position)));
  }, 700);
};

canvas.addEventListener("focus", () => syncKeyboardAim(false));
canvas.addEventListener("blur", () => syncKeyboardAim(false));
// The arrow keys are not the only thing that moves the camera: a fly-to from
// search, or a drag begun while the canvas still holds keyboard focus, would
// otherwise leave the readout naming a point that has left the middle of view.
controls.addEventListener("change", () => syncKeyboardAim(true));

// --- Keyboard globe navigation ------------------------------------------------
// The canvas has declared `role="application"` since the first commit, which
// tells a screen reader to stop intercepting keys and hand them to the app —
// a promise that only makes sense if the app answers them. It answered none:
// there was no key handler on the canvas at all, and no tabindex, so the globe
// was the one control in the app a keyboard could not reach. Arrow keys turn
// it, +/- zoom, and (below, with the probe) Enter charts the point in view.
// OrbitControls' own key bindings are not an option: they pan a target this
// app pins to the globe's centre, and `enablePan` is off for that reason.
canvas.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return; // leave browser chords alone
  // Whoever disabled the controls owns the camera — the flyer, while a search
  // result is in flight. The region drawer disables them too, but only so a
  // *drag* sweeps a box instead of rotating; the arrows are still the way its
  // keyboard corners are aimed, so they keep working while it is armed.
  if (!controls.enabled && !regionDrawer?.active) return;
  const subpoint = vector3ToLatLng(camera.position);
  const next = stepGlobeView(
    { ...subpoint, distance: camera.position.length() },
    e.key,
    { min: controls.minDistance, max: controls.maxDistance }
  );
  if (!next) return;
  e.preventDefault(); // arrows would otherwise scroll the page
  camera.position
    .copy(latLngToVector3(next.lat, next.lon, 1))
    .multiplyScalar(next.distance);
  camera.lookAt(0, 0, 0);
  controls.update(); // adopt the new position and fire `change` → hash sync
  // With a corner already down, the box rubber-bands to the new subpoint —
  // the keyboard's version of dragging with the button held.
  regionDrawer?.stretchTo({ lat: next.lat, lon: next.lon });
  // Draw mode holds the controls disabled, so `update()` above may not raise a
  // `change`; re-aim here so the readout tracks the keys either way.
  syncKeyboardAim(true);
});

// --- Shareable view state (URL hash) ------------------------------------------
// The hash always reflects the current view, so the address bar is a citable,
// reproducible link at any moment. Writes are debounced and use replaceState
// to avoid spamming session history while dragging.
// An open probe's location, mirrored into the shareable hash — a link then
// reproduces the analysis, not just the view. Maintained by the probe section.
let probeShare: ProbeShare | undefined;

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
  new ShareButton(shareEl, currentShareUrl, (message) =>
    announcer.announce(message)
  );
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
  new SearchBox(
    searchEl,
    (result) => {
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
    },
    (message) => announcer.announce(message)
  );
}

// --- Comparison mode (A/B of two months) ---------------------------------------
// Scrub to the "before" month, hit Compare to pin it on the left; the timeline
// keeps driving the right side. Rendered as two scissored passes per frame
// with the globe texture swapped (see CompareController).
const compare = new CompareController(
  earth.material,
  renderer.capabilities.getMaxAnisotropy(),
  (ready) => {
    setStatus(ready ? "" : "Comparison imagery failed to load");
    // The second month only belongs in the provenance line once its imagery is
    // actually drawn — and a load failure drops the comparison, so the line
    // falls back to the one month still on screen.
    updateProvenance();
  }
);
pinnedComparisonMonth = () => (compare.showing ? compare.pinned : undefined);

if (compareEl && compareDividerEl) {
  compareControls = new CompareControls(
    compareEl,
    compareDividerEl,
    {
      onEnable: () => {
        const layer = LAYERS[currentLayer];
        if (layer.static) return false; // one image regardless of month
        compare.enable(layer, months[currentIndex]);
        compareControls?.showDivider(
          layer,
          months[currentIndex],
          compare.split
        );
        compareControls?.setLiveMonth(layer, months[currentIndex]);
        scheduleHashSync();
        return true;
      },
      onDisable: () => {
        compare.disable();
        updateProvenance();
        scheduleHashSync();
      },
      onSplitChange: (fraction) => {
        compare.split = fraction;
      },
    },
    (message) => announcer.announce(message)
  );

  // Restore a shared comparison: the pinned month from the URL, snapped to a
  // slot the active layer actually publishes, when its record covers it.
  const pin = initialView.pin;
  if (pin && !LAYERS[currentLayer].static) {
    const pinned = resolvePinnedMonth(months, pin);
    if (pinned) {
      compare.enable(LAYERS[currentLayer], pinned);
      compareControls.restore(LAYERS[currentLayer], pinned, compare.split);
      compareControls.setLiveMonth(LAYERS[currentLayer], months[currentIndex]);
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
      // Naming both gestures: the button that arms this is an ordinary button,
      // so a keyboard reaches draw mode perfectly well, and used to land on an
      // instruction it could not carry out.
      setStatus(armed ? "Drag a box, or press Enter at two corners" : "");
      // Every gesture this mode accepts happens on the globe, and arming it
      // leaves focus on the button — so hand focus over, the way opening a
      // dialog does. Disarming leaves focus alone: Escape should not yank it
      // away from whatever the user moved on to.
      if (armed) canvas.focus();
    },
    onComplete: (bounds) => runRegionProbe(bounds),
  });
  regionDrawer = drawer;
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
   * The on-demand chunk leg of a land-cover read, tagged so its failure can be
   * told apart from the sampler fetch beside it.
   *
   * Both legs of the `Promise.all` below can fail, but they need OPPOSITE
   * remedies, and until now one sentence answered for both. A rejected dynamic
   * import stays rejected in the browser's module map, so probing again
   * re-requests nothing and repeats the same failure for the life of the page —
   * measured in Chromium: with the chunk aborted, a first probe fetches it once
   * and a second adds no attempt at all. The sampler fetch is an ordinary
   * request a second probe really does re-issue (measured: 2 attempts, then 4).
   * So "check the connection and retry" is honest for the sampler and a false
   * promise for the chunk, which needs a reload.
   *
   * When both legs fail, `Promise.all` rejects with whichever lost the race;
   * either message then describes a real failure, and the sampler's advice is
   * the cheaper first move.
   */
  class ChunkLoadError extends Error {}

  const onDemand = <T>(chunk: Promise<T>): Promise<T> =>
    chunk.catch((err) => {
      throw new ChunkLoadError(String(err));
    });

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
      onDemand(import("./probe/landCoverClassRead")),
    ])
      .then(([pixels, { readLandCoverClassText }]) => {
        if (abort.signal.aborted) return;
        panel.setStatus(readLandCoverClassText(pixels, ym.year));
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.warn("RoamingEye: land-cover class read failed", err);
        panel.setStatus(
          err instanceof ChunkLoadError
            ? "Reading the land-cover class failed — reload the page to try again."
            : "Reading the land-cover class failed — check the connection and retry."
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
      onDemand(import("./probe/landCoverRegionRead")),
    ])
      .then(([{ pixels, sampling }, { readLandCoverRegionText }]) => {
        if (abort.signal.aborted) return;
        panel.setStatus(readLandCoverRegionText(pixels, ym.year, sampling));
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.warn("RoamingEye: land-cover region read failed", err);
        panel.setStatus(
          err instanceof ChunkLoadError
            ? "Reading the land-cover classes failed — reload the page to try again."
            : "Reading the land-cover classes failed — check the connection and retry."
        );
      });
  };

  const runProbe = (lat: number, lon: number): void => {
    const layer = LAYERS[currentLayer];
    const mode = panel.mode;
    probeTarget = { lat, lon };
    // The mode goes into the share hash with the coordinates: it selects which
    // statistic the series reports, and the CSV this same view stamps a
    // `view_url` into names that statistic in its own header.
    probeShare = { kind: "point", lat, lon, mode };
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
        // has no share to report, so it passes none and stays silent. The
        // charted series comes too: a month the box returned nothing for
        // reports a zero share, and the mean never saw it.
        const sstSupportNote = averagedSstSupportNote(
          layer.id,
          "sampled-area",
          values,
          mode === "area" ? validFractions : null
        );
        // The same question for the vegetation indices, whose undrawn pixels
        // are their lowest-index ones rather than a domain boundary — so the
        // share qualifies the direction of the mean, not just its extent.
        // Both layers pass through the same gate: no shares, no clause.
        // And the same question along the OTHER axis, which no vegetation mode
        // stated: that transparent below-ramp band drops whole MONTHS out of
        // the series too, so the statistics beside the chart cover the drawn
        // months alone — and because the surfaces it excludes are the
        // lowest-index ones, the mean reads high and the min is the lowest
        // drawn value rather than the record's. The share clause above already
        // names the mechanism for an averaged footprint, so this defers to it
        // and speaks for the point probe, which passes no shares and so had no
        // clause in any partial case at all. Same composition as the snow and
        // GLDAS pairs below.
        const vegetationSupportNote =
          vegetationAveragedSupportNote(
            layer.id,
            "sampled-area",
            values,
            mode === "area" ? validFractions : null
          ) ?? vegetationChartedRecordNote(layer.id, values);
        // And once more for snow, where the undrawn pixels are the percent-0
        // ones GIBS leaves transparent — so an area mean is the mean where
        // snow was drawn, and the undrawn share moves with the melt season
        // rather than sitting still. The place panel states this for one
        // month; the series did not. It also gives a snow-free box a reason
        // for its empty chart instead of "no data at this point".
        // And the same question along the OTHER axis, which no mode stated:
        // that transparent band drops whole MONTHS out of the series too, so a
        // seasonal point charts only the months that carried snow and the
        // statistics beside them are conditional on that. The share clause
        // above already names the mechanism for an averaged footprint, so this
        // defers to it and speaks for the point probe — which passes no shares
        // and so had no snow clause in any partial case at all.
        const snowSupportNote =
          snowAveragedSupportNote(
            layer.id,
            "sampled-area",
            values,
            mode === "area" ? validFractions : null
          ) ?? snowChartedRecordNote(layer.id, values);
        // And the two water-cycle layers, the last averaged ones charting a
        // bare mean. GLDAS is solved on land cells only, and its ramp discards
        // both the sub-zero fill and the open top bin, so an area mean covers
        // the drawn cells alone. Unlike snow's undrawn pixels — all at the low
        // end — the discarded set here holds the box's WETTEST cells too, so
        // the clause refuses the dry reading rather than damping a swing.
        // And the same question along the OTHER axis, which no mode stated for
        // either water-cycle layer: those three exclusions drop whole MONTHS
        // out of the series too, so the statistics beside the chart cover the
        // charted months alone — and because the discarded set includes any
        // month at or above the open top bin, the maximum need not be the
        // record's. The share clause above already names the mechanism for an
        // averaged footprint, so this defers to it and speaks for the point
        // probe, which passes no shares and so had no clause in any partial
        // case at all. Same composition as snow's pair, one line above.
        const gldasSupportNote =
          gldasAveragedSupportNote(
            layer.id,
            "sampled-area",
            values,
            mode === "area" ? validFractions : null
          ) ?? gldasChartedRecordNote(layer.id, values);
        // And air temperature, the last averaged layer charting a bare mean.
        // Nothing is missing by domain here — MERRA-2 spans land and ocean —
        // but its ramp is closed at BOTH ends and both open catch-alls are
        // dropped by the inversion, so a box holding polar-winter or
        // desert-summer cells averages the rest and reads as a mean of the box.
        // Unlike snow's undrawn pixels, all at the low end, the discarded set
        // here can hold the box's coldest and hottest cells at once, so the
        // clause refuses a cool reading and a warm one alike rather than
        // damping a swing. No charted-record companion: emptyAtmosphereProbeNote
        // already owns the empty record for this layer with the same refusal.
        const airtempSupportNote = airTemperatureAveragedSupportNote(
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
        // The aerosol ramp has the same problem at one end: its top bin is open,
        // so a heavy-loading month decodes to a lower bound. The status line has
        // marked those since the end-cap screen shipped; the file did not.
        const aerosolCensoring = probeAerosolCeilingCensoring(
          layer.id,
          physical
        );
        // And the LST ramp is capped at BOTH ends, so a polar-winter or
        // desert-summer month decodes to a one-sided bound in either
        // direction. The status line has marked those since the extreme screen
        // shipped; the file did not.
        const lstCensoring = probeLstExtremeCensoring(layer.id, physical);
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
                // That RMSE is pooled over the whole ramp, and SST's is
                // measured to be about three times worse below 4 °C. The
                // status line already carries the split; the file needs it
                // more, because it states its accuracy once at the top as a
                // rule covering every row and then outlives the session that
                // would have given the reader context. Judged on the physical
                // series the file writes. Empty for every other layer and for
                // an SST record that never enters the band.
                // The ramp screen goes in because both figures are two-sided
                // residuals: a month the low cap collapsed is inside the band but
                // outside either ±, and it is exactly the coldest rows that reach
                // the cap.
                inversionAccuracyHeaders: [
                  ...inversionAccuracyCsvHeaders(
                    probeInversionAccuracy(layer.id, scale)
                  ),
                  // That builder is keyed to the calibrated layers, so it
                  // writes nothing for EVI — whose error against GIBS's
                  // published MOD13A3 ramp is measured all the same, in a
                  // second record the lookup cannot reach. The status line
                  // already says so; the file outlives the session and needs
                  // it more. Empty for every layer the line above speaks for,
                  // so the two can never both state an accuracy.
                  ...uncalibratedVegetationAccuracyCsvHeaders(
                    layer.id,
                    probeInversionAccuracy(layer.id, scale).status
                  ),
                  ...sstColdEndAccuracyCsvHeaders(
                    probeSstColdEndAccuracy(layer.id, physical, sstCensoring)
                  ),
                ],
                // The status line already qualifies the on-screen month
                // count; the exported file outlives the session, so it
                // carries the same correction.
                recordGapHeaders: probeRecordGapsCsvHeaders(
                  probeRecordGaps(layer.id, probeMonths)
                ),
                // Same reasoning for *which* moments the values sample and
                // *what quantity* they are: the probe states the SST and the
                // LST sampling gate on screen, and the download needs them
                // more — nothing in a column of degrees says it is a daytime
                // skin composite, and on land the 2 m air-temperature sibling
                // exports a column that looks identical to this one. A layer
                // is sst or lst or neither, so only one product's lists
                // contribute; for SST that is two, because the diurnal half
                // and the cloud screen are separate gates owned by separate
                // modules and the file was carrying only the first. Naming one
                // of two co-equal gates reads as the whole account of which
                // moments were composited, which is the same failure
                // sstCaptionConstraintOmissions guards the caption against.
                //
                // The vegetation indices state the same gate on screen and were
                // exporting none of it, though theirs is the one monthly value
                // in the app that is not an average at all: each row is the
                // *highest* eligible observation of its compositing window, and
                // for NDVI that selection rule fixes a sign. A column of
                // dimensionless index values says none of that. A layer is sst
                // or lst or a vegetation index or none of them, so only one
                // product's lists contribute.
                samplingIdentityHeaders: [
                  ...sstSamplingIdentityCsvHeaders(layer.id),
                  ...sstObservingConstraintCsvHeaders(layer.id),
                  ...lstSamplingIdentityCsvHeaders(layer.id),
                  ...vegetationSamplingIdentityCsvHeaders(layer.id),
                ],
                // And the same for the rows themselves: the status line prints
                // an inequality in front of every censored statistic, while a
                // capped month's `value` cell is an ordinary decimal. Judged on
                // the physical series the file writes, not the 0..1 gradient
                // positions held here. Empty for every other layer and for a
                // record that stayed inside the finite ramp. A layer is sst or
                // aerosol or lst or none of them, so at most one list is
                // non-empty.
                censoringHeaders: [
                  ...sstExtremeCensoringCsvHeaders(sstCensoring),
                  ...aerosolCeilingCensoringCsvHeaders(aerosolCensoring),
                  ...lstExtremeCensoringCsvHeaders(lstCensoring),
                ],
                // And that screen reads the area mean, not the pixels it
                // averaged, so an unflagged row is not an uncensored one. A
                // point probe's median needs no such correction.
                averagedCensoringHeaders: [
                  ...marineAveragedSstCensoringCsvHeaders(
                    averagedFootprint,
                    sstCensoring
                  ),
                  ...averagedAerosolCensoringCsvHeaders(
                    averagedFootprint,
                    aerosolCensoring
                  ),
                  ...averagedLstCensoringCsvHeaders(
                    averagedFootprint,
                    lstCensoring
                  ),
                ],
                // And the same for the record's calendar composition: the panel
                // says a mean over 11 of 12 calendar months is not an annual
                // mean, then hands over a value column with nothing on it to
                // stop the next reader averaging all of it. Silent for a record
                // spread evenly across the calendar.
                //
                // The bound prefix goes in for the same reason it goes on the
                // status line: the two means this header quotes are reduced
                // from the very same months the block above may have just
                // reported as capped. The panel at least prints its own `mean`
                // already marked, so the reader sees the inequality either way;
                // this file states no other mean, which makes these two the
                // only ones in it and leaves nothing else to carry the caveat.
                // Empty for every uncensored record and every closed ramp.
                seasonalSamplingHeaders: seasonalSamplingCsvHeaders(
                  seasonalSamplingBalance(probeMonths, physical),
                  scale,
                  sstExtremeBoundPrefix(sstCensoring, "mean") ||
                    aerosolCeilingBoundPrefix(aerosolCensoring, "mean") ||
                    lstExtremeBoundPrefix(lstCensoring, "mean")
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
          // Soil moisture is precipitation's sibling field in one GLDAS run, so
          // it empties off land for the same reason — and again at the ramp's
          // dropped top bin, which is why its note refuses the dry reading.
          emptyAtmosphereProbeNote(layer.id, values) ??
            emptyMarineProbeNote(layer.id, values, sstSupportNote) ??
            emptySnowProbeNote(layer.id, values, snowSupportNote) ??
            emptyVegetationProbeNote(layer.id, values, vegetationSupportNote) ??
            emptySoilProbeNote(layer.id, values),
          // Each note is gated on its own layer, so at most one is ever a
          // string — the fallback picks the one that spoke.
          sstSupportNote ??
            vegetationSupportNote ??
            snowSupportNote ??
            gldasSupportNote ??
            airtempSupportNote,
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
    // The box travels in the link with the chart it explains. It used to be
    // dropped here, while the CSV this same view stamps a `view_url` into
    // declared its bounds in a `# region:` header — so the file's own
    // reproduction link reopened the globe with no chart at all.
    probeShare = { kind: "region", bounds };
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
          values,
          validFractions
        );
        // That share says how much of the box returned pixels; it cannot say
        // how many independent source values those pixels carry. A region may
        // be drawn as small as 0.2° a side, and above ~66° that is narrower
        // than one ~9 km L3 cell — so the charted mean can rest on a single
        // retrieval whose footprint extends outside the box the header names.
        // The place panel states this for a searched boundary; the series
        // surface did not. Silent unless the geometry actually qualifies the
        // mean, and only where there is a charted mean to qualify.
        const sstNativeNote = sstNativeSupportNote(
          layer.id,
          "drawn-region",
          bounds,
          values
        );
        // And the same for the vegetation indices. GIBS leaves every value
        // below the ramp start undrawn, so a box's water, snow, ice and cloud
        // pixels are rejected rather than averaged in — and those are exactly
        // its lowest-index ones, which the CSV's per-month share records but
        // the panel did not. The place panel already states this for a single
        // month; the series surface did not.
        // And the same other axis here. A drawn region always supplies shares,
        // so the clause above usually speaks — but it reads shares only from
        // months that charted, so a box whose drawn months each covered it
        // fully still reports nothing about the months that dropped out
        // entirely. This covers exactly that case and defers otherwise.
        const vegetationSupportNote =
          vegetationAveragedSupportNote(
            layer.id,
            "drawn-region",
            values,
            validFractions
          ) ?? vegetationChartedRecordNote(layer.id, values);
        // And the same for snow: GIBS leaves percent 0 transparent, so a box's
        // snow-free ground is rejected rather than averaged in as 0% — the
        // charted mean covers the drawn patches only, and the share it covers
        // shrinks through the melt season, damping the swing the chart shows.
        // And the same temporal companion as the point/area path: a drawn box
        // loses whole months to the same transparent band, and the share clause
        // above speaks first whenever it has something to say.
        const snowSupportNote =
          snowAveragedSupportNote(
            layer.id,
            "drawn-region",
            values,
            validFractions
          ) ?? snowChartedRecordNote(layer.id, values);
        // And the same for the two water-cycle layers — see the point/area
        // path. A drawn box gets the clause for the same reason a sampled one
        // does: GLDAS carries no value off land, and its ramp's discarded caps
        // sit at both ends, so the share the mean covers is not a share of the
        // box and its remainder is not dry ground.
        // And along the time axis, exactly as in the point/area path: the same
        // three exclusions drop whole months out, so the statistics cover the
        // charted months alone and a month at or above the open top bin is
        // among the discarded. Defers to the share clause when that spoke.
        const gldasSupportNote =
          gldasAveragedSupportNote(
            layer.id,
            "drawn-region",
            values,
            validFractions
          ) ?? gldasChartedRecordNote(layer.id, values);
        // And air temperature — see the point/area path. A drawn box gets the
        // clause for the same reason a sampled one does: the rendered ramp is
        // closed at both ends, so the share the mean covers is not a share of
        // the box, and its remainder is evidence in neither direction.
        const airtempSupportNote = airTemperatureAveragedSupportNote(
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
        // Same for the aerosol ramp's open top bin — see the point/area path.
        const aerosolCensoring = probeAerosolCeilingCensoring(
          layer.id,
          physical
        );
        // And the LST ramp is capped at BOTH ends, so a polar-winter or
        // desert-summer month decodes to a one-sided bound in either
        // direction. The status line has marked those since the extreme screen
        // shipped; the file did not.
        const lstCensoring = probeLstExtremeCensoring(layer.id, physical);
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
                // That RMSE is pooled over the whole ramp, and SST's is
                // measured to be about three times worse below 4 °C. The
                // status line already carries the split; the file needs it
                // more, because it states its accuracy once at the top as a
                // rule covering every row and then outlives the session that
                // would have given the reader context. Judged on the physical
                // series the file writes. Empty for every other layer and for
                // an SST record that never enters the band.
                // The ramp screen goes in because both figures are two-sided
                // residuals: a month the low cap collapsed is inside the band but
                // outside either ±, and it is exactly the coldest rows that reach
                // the cap.
                inversionAccuracyHeaders: [
                  ...inversionAccuracyCsvHeaders(
                    probeInversionAccuracy(layer.id, scale)
                  ),
                  // That builder is keyed to the calibrated layers, so it
                  // writes nothing for EVI — whose error against GIBS's
                  // published MOD13A3 ramp is measured all the same, in a
                  // second record the lookup cannot reach. The status line
                  // already says so; the file outlives the session and needs
                  // it more. Empty for every layer the line above speaks for,
                  // so the two can never both state an accuracy.
                  ...uncalibratedVegetationAccuracyCsvHeaders(
                    layer.id,
                    probeInversionAccuracy(layer.id, scale).status
                  ),
                  ...sstColdEndAccuracyCsvHeaders(
                    probeSstColdEndAccuracy(layer.id, physical, sstCensoring)
                  ),
                ],
                // The status line already qualifies the on-screen month
                // count; the exported file outlives the session, so it
                // carries the same correction.
                recordGapHeaders: probeRecordGapsCsvHeaders(
                  probeRecordGaps(layer.id, probeMonths)
                ),
                // Same reasoning for *which* moments the values sample and
                // *what quantity* they are: the probe states the SST and the
                // LST sampling gate on screen, and the download needs them
                // more — nothing in a column of degrees says it is a daytime
                // skin composite, and on land the 2 m air-temperature sibling
                // exports a column that looks identical to this one. A layer
                // is sst or lst or neither, so only one product's lists
                // contribute; for SST that is two, because the diurnal half
                // and the cloud screen are separate gates owned by separate
                // modules and the file was carrying only the first. Naming one
                // of two co-equal gates reads as the whole account of which
                // moments were composited, which is the same failure
                // sstCaptionConstraintOmissions guards the caption against.
                //
                // The vegetation indices state the same gate on screen and were
                // exporting none of it, though theirs is the one monthly value
                // in the app that is not an average at all: each row is the
                // *highest* eligible observation of its compositing window, and
                // for NDVI that selection rule fixes a sign. A column of
                // dimensionless index values says none of that. A layer is sst
                // or lst or a vegetation index or none of them, so only one
                // product's lists contribute.
                samplingIdentityHeaders: [
                  ...sstSamplingIdentityCsvHeaders(layer.id),
                  ...sstObservingConstraintCsvHeaders(layer.id),
                  ...lstSamplingIdentityCsvHeaders(layer.id),
                  ...vegetationSamplingIdentityCsvHeaders(layer.id),
                ],
                // And the same for the rows themselves: the status line prints
                // an inequality in front of every censored statistic, while a
                // capped month's `value` cell is an ordinary decimal. Judged on
                // the physical series the file writes, not the 0..1 gradient
                // positions held here. Empty for every other layer and for a
                // record that stayed inside the finite ramp. A layer is sst or
                // aerosol or lst or none of them, so at most one list is
                // non-empty.
                censoringHeaders: [
                  ...sstExtremeCensoringCsvHeaders(sstCensoring),
                  ...aerosolCeilingCensoringCsvHeaders(aerosolCensoring),
                  ...lstExtremeCensoringCsvHeaders(lstCensoring),
                ],
                // And that screen reads the region mean, not the pixels it
                // averaged, so an unflagged row is not an uncensored one.
                averagedCensoringHeaders: [
                  ...marineAveragedSstCensoringCsvHeaders(
                    "drawn-region",
                    sstCensoring
                  ),
                  ...averagedAerosolCensoringCsvHeaders(
                    "drawn-region",
                    aerosolCensoring
                  ),
                  ...averagedLstCensoringCsvHeaders(
                    "drawn-region",
                    lstCensoring
                  ),
                ],
                // A drawn box spans latitudes and can straddle hemispheres, so
                // the balance is measured on the region's own charted series
                // and given no location context — it describes which calendar
                // months this file holds, and claims nothing about their
                // seasons.
                //
                // The bound prefix carries over unchanged: a region's censoring
                // screen reads its area means, so a prefix it does raise is as
                // true of a re-weighting of those means as of their average.
                // The averaged-censoring lines above already say that silence
                // here is not evidence the region held no capped pixel.
                seasonalSamplingHeaders: seasonalSamplingCsvHeaders(
                  seasonalSamplingBalance(probeMonths, physical),
                  scale,
                  sstExtremeBoundPrefix(sstCensoring, "mean") ||
                    aerosolCeilingBoundPrefix(aerosolCensoring, "mean") ||
                    lstExtremeBoundPrefix(lstCensoring, "mean")
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
          // The soil note is passed no share for the opposite reason: the GLDAS
          // clause is deliberately silent on an empty record, because this note
          // and the atmosphere one already own that sentence and both already
          // refuse the dry reading. So it reads the same here as it always did.
          emptyAtmosphereProbeNote(layer.id, values) ??
            emptyMarineProbeNote(layer.id, values, sstSupportNote) ??
            emptySnowProbeNote(layer.id, values, snowSupportNote) ??
            emptyVegetationProbeNote(layer.id, values, vegetationSupportNote) ??
            emptySoilProbeNote(layer.id, values),
          // Each note is gated on its own layer, so at most one layer's notes
          // are ever strings — the fallback picks the one that spoke. SST is
          // the one layer with two clauses on this axis: the share it covered
          // and the source cells it could resolve. They answer different
          // questions about the same box, so both are carried, in that order.
          // The native clause is null for an empty series, so the absence
          // line built from this argument reads exactly as it did before.
          [sstSupportNote, sstNativeNote].filter(Boolean).join(" · ") ||
            vegetationSupportNote ||
            snowSupportNote ||
            gldasSupportNote ||
            airtempSupportNote,
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
      if (!firstLoadDone) {
        setTimeout(restoreWhenReady, 300);
        return;
      }
      if (target.kind === "region") {
        // Redraw the box first: nothing dragged it, and the chart's caption
        // names those corners as what it averaged over.
        drawer.show(target.bounds);
        runRegionProbe(target.bounds);
        return;
      }
      // Before the sampling, not after: runProbe reads the panel's mode to
      // choose the statistic, so adopting it afterwards would chart a point
      // median under an area caption.
      panel.restoreMode(target.mode);
      runProbe(target.lat, target.lon);
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

  // The keyboard equivalent of that click. A pointer names its own target;
  // a keyboard has to be given one, and the only point on the globe a
  // keyboard user has already aimed at is the one the arrow keys steer: the
  // camera's subpoint, dead centre of the view. It is the same point the
  // shareable hash records as the camera position, so a probe opened this way
  // reproduces from the link like any other. The marker the search fly-to
  // uses is shown at it, so the answer is not only in the panel — a sighted
  // keyboard user can see which point was charted.
  canvas.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const { lat, lon } = vector3ToLatLng(camera.position);
    // In draw mode the same key takes a corner instead of a point: two
    // presses, with the arrows between them, are a drag a keyboard can make.
    if (drawer.active) {
      e.preventDefault();
      const outcome = drawer.markCorner({ lat, lon });
      if (outcome === "anchored") {
        // Nothing is outlined yet — one corner is not a box — so the marker
        // is what a sighted keyboard user sees the corner land on.
        highlight.show({ lat, lon, geometry: null });
        setStatus("Corner set — turn the globe, then Enter");
      } else if (outcome === "rejected") {
        setStatus("Too small — turn further, then Enter");
      } else {
        highlight.clear(); // the outline is the region's own mark now
      }
      return;
    }
    if (!controls.enabled) return; // a flight owns the camera
    e.preventDefault(); // Space would otherwise scroll the page
    highlight.show({ lat, lon, geometry: null });
    runProbe(lat, lon);
  });
}

// --- Secondary panels -------------------------------------------------------
// The providers, software and fleet panels are reference material: none of it is
// needed to render the globe, and each drags in its own catalog and formatting
// code. They are loaded on first open instead of at boot, which keeps that code
// out of the entry chunk (see scripts/check-bundle-size.mjs).
//
// Clearing the cache on failure only gives the panel's own construction a second
// chance. It does NOT make a failed chunk fetch retry: a dynamic import that
// fails stays rejected in the browser's module map, so a later click re-requests
// nothing (measured in Chromium). Reloading is the only honest remedy, which is
// what `name` is here to say — before this, the whole report was the global
// unhandled-rejection toast quoting a hashed bundle URL.
function lazyPanel(
  container: HTMLElement,
  link: HTMLElement,
  name: string,
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
    void panel.then(
      (p) => p.open(),
      () => {
        errorToast.show(`Couldn't load ${name}. Reload the page to try again.`);
      }
    );
  });
}

if (providersPageEl && providersLinkEl) {
  lazyPanel(providersPageEl, providersLinkEl, "the data providers", () =>
    import("./ui/ProvidersPage").then((m) => m.ProvidersPage)
  );
}

// Software discovery is static and review-gated: the finder reads only the
// approved catalog artifact produced by the catalog agent fleet.
if (softwarePageEl && softwareLinkEl) {
  lazyPanel(softwarePageEl, softwareLinkEl, "the software finder", () =>
    import("./ui/SoftwareFinder").then((m) => m.SoftwareFinder)
  );
}

if (fleetPageEl && fleetLinkEl) {
  lazyPanel(fleetPageEl, fleetLinkEl, "the fleet status", () =>
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
// The `role="status"` root stays rendered and empty; the pill is what gets
// inserted. Toggling `hidden` on the region itself was silent to assistive
// technology: a `display: none` live region is outside the accessibility
// tree, and the banner's text never changed after construction, so going
// offline mutated nothing a screen reader could announce.
const offlineBanner = document.createElement("div");
offlineBanner.className = "offline-banner";
offlineBanner.setAttribute("role", "status");
document.body.appendChild(offlineBanner);

const offlineBannerPill = document.createElement("span");
offlineBannerPill.className = "offline-banner__pill";
offlineBannerPill.textContent = "Offline — showing last loaded imagery";

function setOfflineBannerShown(shown: boolean): void {
  // Guard: re-appending an identical node would re-announce it.
  if (shown === offlineBannerPill.isConnected) return;
  if (shown) offlineBanner.appendChild(offlineBannerPill);
  else offlineBannerPill.remove();
}

window.addEventListener("offline", () => {
  setOfflineBannerShown(true);
});
window.addEventListener("online", () => {
  setOfflineBannerShown(false);
  refreshGlobe();
  if (studyRegion.active) studyRegion.setMonth(months[currentIndex]);
});
if (!isOnline()) setOfflineBannerShown(true);

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
  // HD tiles only ever stream the live month, so a comparison suppresses them
  // on both sides and both months render from their own full-globe texture —
  // a like-for-like split (see CompareController.renderSplit).
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
/**
 * The status row doubles as the timeline's resting caption. Transient text
 * (loading, failures) wins while it lasts; the moment it clears, the row goes
 * back to saying how current the layer actually is — see ui/dataCurrency.ts
 * for why the silence there was read as a fault.
 */
function setStatus(text: string): void {
  if (!statusEl) return;
  const note = dataCurrencyNote(
    LAYERS[currentLayer],
    months[months.length - 1],
    utcYearMonth()
  );
  const next = text || note.text;
  // The row is aria-live: rewriting identical text re-announces it, and this
  // runs on every settled imagery load (i.e. every scrub).
  if (statusEl.textContent !== next) statusEl.textContent = next;
  const detail = text ? "" : note.detail;
  if (statusEl.title !== detail) statusEl.title = detail;
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
