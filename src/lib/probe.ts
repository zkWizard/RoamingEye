import {
  anomalyBaselineCsvHeaders,
  anomalyBaselineDepth,
} from "./anomalyBaselineDepth";
import { doiResolverUrl } from "./doiLink";
import type { Bounds } from "./imagery";
import type { LegendStop } from "./legend";
import { makeNeumaierAcc } from "./numerics";
import { SOIL_MOISTURE_DEPTH_LABEL } from "./soilMoistureDepth";
import type { DatasetRef, LayerId, YearMonth } from "./timeline";
import { trendSummary, trendCsvHeaders } from "./trend";

/**
 * Point time-series probe: the pure math for turning "the color of a pixel in
 * a GIBS monthly composite" back into an approximate data value.
 *
 * The imagery RoamingEye streams is *rendered* (a colormap applied to the
 * underlying science data), so the probe inverts that colormap: find where on
 * the legend gradient a sampled RGB sits, and map that position onto the
 * layer's value scale. The result is an **approximation** — good for trends,
 * seasonality, and anomalies at a point; not a substitute for the underlying
 * L3 product — and every output labels it as such.
 *
 * Everything here is render-free and unit-tested (see probe.test.ts); the
 * browser-side image fetching/decoding lives in probe/ProbeSampler.ts.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// --- Equirectangular pixel mapping -------------------------------------------

/**
 * Map a lat/lon to the pixel holding it in an equirectangular image covering
 * lat [-90, 90] / lon [-180, 180] (the GIBS full-globe GetMap layout).
 * Clamped one pixel in from the borders so a 3×3 neighborhood is always valid.
 */
export function latLonToPixel(
  lat: number,
  lon: number,
  width: number,
  height: number
): { x: number; y: number } {
  const fx = ((lon + 180) / 360) * width;
  const fy = ((90 - lat) / 180) * height;
  const clamp = (v: number, max: number): number =>
    Math.min(max - 2, Math.max(1, Math.floor(v)));
  return { x: clamp(fx, width), y: clamp(fy, height) };
}

// --- Colormap inversion -------------------------------------------------------

/** Parse "#rrggbb" into 0-255 channels. */
export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Densely sample a legend gradient into a lookup table of `size` colors, so
 * inversion is a nearest-neighbor search. Stops must be sorted by `at`
 * spanning 0 → 1 (as LEGENDS guarantees).
 */
export function buildColormapLut(stops: LegendStop[], size = 256): Rgb[] {
  const colors = stops.map((s) => hexToRgb(s.color));
  const lut: Rgb[] = [];
  for (let i = 0; i < size; i++) {
    const t = size === 1 ? 0 : i / (size - 1);
    let hi = stops.findIndex((s) => s.at >= t);
    if (hi < 0) hi = stops.length - 1;
    const lo = Math.max(0, hi === 0 ? 0 : hi - 1);
    const span = stops[hi].at - stops[lo].at;
    const f = span > 0 ? (t - stops[lo].at) / span : 0;
    lut.push({
      r: Math.round(colors[lo].r + (colors[hi].r - colors[lo].r) * f),
      g: Math.round(colors[lo].g + (colors[hi].g - colors[lo].g) * f),
      b: Math.round(colors[lo].b + (colors[hi].b - colors[lo].b) * f),
    });
  }
  return lut;
}

/**
 * How far (Euclidean RGB) a sampled color may sit from the legend gradient and
 * still count as data. Beyond this it's treated as no-data — ocean fill,
 * missing months, and the black background all land far outside the gradient.
 * Roomy enough to absorb JPEG compression noise (± ~10 per channel).
 */
export const NO_DATA_DISTANCE = 60;

/**
 * Invert a sampled color to its 0..1 position along the legend gradient, or
 * null when the color isn't on the gradient (no-data).
 */
export function invertColormap(
  rgb: Rgb,
  lut: Rgb[],
  maxDistance = NO_DATA_DISTANCE
): number | null {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < lut.length; i++) {
    const d = Math.hypot(rgb.r - lut[i].r, rgb.g - lut[i].g, rgb.b - lut[i].b);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (bestDist > maxDistance) return null;
  return lut.length === 1 ? 0 : best / (lut.length - 1);
}

/**
 * Invert a rendered GIBS colour through its authoritative colormap entries.
 * Unlike the lightweight display legends, these entries are the exact RGB
 * colours and physical values NASA publishes for the layer. The nearest-entry
 * lookup also absorbs the small colour shifts introduced by JPEG tiles.
 */
export function invertColormapEntries(
  rgb: Rgb,
  entries: { rgb: Rgb; value: number }[],
  maxDistance = NO_DATA_DISTANCE
): number | null {
  let bestValue = 0;
  let bestDist = Infinity;
  for (const entry of entries) {
    const d = Math.hypot(
      rgb.r - entry.rgb.r,
      rgb.g - entry.rgb.g,
      rgb.b - entry.rgb.b
    );
    if (d < bestDist) {
      bestDist = d;
      bestValue = entry.value;
    }
  }
  return bestDist > maxDistance ? null : bestValue;
}

/**
 * Median of the valid inversions from a pixel neighborhood — robust to JPEG
 * ringing and mixed coastline pixels. Null unless a majority of the
 * neighborhood is valid data (5 of a 3×3 block).
 */
export function medianValid(
  values: (number | null)[],
  minValid = 5
): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < Math.min(minValid, values.length)) return null;
  valid.sort((a, b) => a - b);
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

/**
 * Area-weighted mean of the valid samples from a geographic grid — the region
 * statistic. On an equal-angle lat/lon grid the area a sample represents
 * shrinks with cos(latitude); averaging without weights biases every
 * latitude-spanning box toward its poleward rows (the canonical gridded-data
 * mistake — see xarray's area-weighted-temperature example). Null when too
 * little of the grid's *area* is data (a mostly-ocean box has no land story
 * to tell); the default tolerates coastal boxes (¼ of the area is enough).
 */
export function weightedMeanValid(
  values: (number | null)[],
  weights: number[],
  minValidFraction = 0.25
): number | null {
  // Compensated sums: the region mean must not depend on the order the
  // sampling grid happens to be enumerated in (see lib/numerics.ts).
  const totalWeight = makeNeumaierAcc();
  const validWeight = makeNeumaierAcc();
  const sum = makeNeumaierAcc();
  for (let i = 0; i < values.length; i++) {
    const w = weights[i];
    totalWeight.add(w);
    const v = values[i];
    if (v === null) continue;
    validWeight.add(w);
    sum.add(v * w);
  }
  const total = totalWeight.sum();
  const valid = validWeight.sum();
  if (total <= 0 || valid / total < minValidFraction) {
    return null;
  }
  return sum.sum() / valid;
}

/**
 * Area-weighted share of samples that contain data. Compensated accumulation
 * keeps coverage reproducible when the same geographic cells are enumerated
 * in a different order; downstream availability thresholds must not depend on
 * row order or antimeridian stitching order.
 */
export function weightedValidFraction(
  values: (number | null)[],
  weights: number[]
): number {
  const totalWeight = makeNeumaierAcc();
  const validWeight = makeNeumaierAcc();
  for (let i = 0; i < values.length; i++) {
    const weight = weights[i];
    totalWeight.add(weight);
    if (values[i] !== null) validWeight.add(weight);
  }
  const total = totalWeight.sum();
  return total > 0 ? validWeight.sum() / total : 0;
}

/** The cos(latitude) area weight of a sample on an equal-angle grid. */
export function areaWeight(lat: number): number {
  return Math.cos((lat * Math.PI) / 180);
}

// --- Drawn-region helpers ---------------------------------------------------------

/** Wrap any longitude into [-180, 180). Pure and periodic-safe. */
export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Whether a bounds' longitudes cross the antimeridian. Crossing boxes use
 * the continuous-longitude convention: `east > 180`, with `east - west`
 * still the true (short-arc) width — sphere trig is periodic, so outline
 * meshes render such boxes correctly as-is.
 */
export function crossesAntimeridian(bounds: Bounds): boolean {
  return bounds.east > 180 || bounds.west < -180;
}

/**
 * Normalize the two corners of a drag into a bounding box. Latitudes clamp to
 * ±85° (the poles hold no GIBS detail and degenerate the equirectangular
 * grid). Longitude takes the **short arc**: a drag across the antimeridian
 * (Fiji, the Bering Strait) yields the few degrees the user swept — expressed
 * in continuous longitudes with `east > 180` — never the ~358° band around
 * the rest of the planet that a naive min→max would produce.
 */
export function dragBounds(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): Bounds {
  const clampLat = (lat: number): number => Math.min(85, Math.max(-85, lat));
  let west = Math.min(a.lon, b.lon);
  let east = Math.max(a.lon, b.lon);
  if (east - west > 180) {
    // The drag went the other way around — across the seam.
    [west, east] = [east, west + 360];
  }
  return {
    south: clampLat(Math.min(a.lat, b.lat)),
    north: clampLat(Math.max(a.lat, b.lat)),
    west,
    east,
  };
}

/** Whether a drawn box is big enough to mean something (not a stray click). */
export function boundsUsable(bounds: Bounds, minSpanDeg = 0.2): boolean {
  return (
    bounds.north - bounds.south >= minSpanDeg &&
    bounds.east - bounds.west >= minSpanDeg
  );
}

/**
 * Sampling-grid resolution for a drawn region: aim for one cell per ~0.25°,
 * clamped so small boxes still average well and continental boxes stay cheap
 * (n×n samples; 28² = 784 pixel reads at most).
 */
export function regionGridSize(
  bounds: Bounds,
  degPerCell = 0.25,
  min = 8,
  max = 28
): number {
  const span = Math.max(bounds.north - bounds.south, bounds.east - bounds.west);
  return Math.min(max, Math.max(min, Math.ceil(span / degPerCell)));
}

/**
 * Independently size each axis of a drawn-region sampling grid. This avoids
 * oversampling a narrow axis while retaining the same per-axis density,
 * minimum coverage, and maximum cost.
 */
export function regionGridDimensions(
  bounds: Bounds,
  degPerCell = 0.25,
  min = 8,
  max = 28
): { latitude: number; longitude: number } {
  const size = (span: number): number =>
    Math.min(max, Math.max(min, Math.ceil(span / degPerCell)));
  return {
    latitude: size(bounds.north - bounds.south),
    longitude: size(bounds.east - bounds.west),
  };
}

// --- Area sampling grid ---------------------------------------------------------

/**
 * Cell-center grid of n×n lat/lon points inside a bounding box — the sample
 * layout for area (region-mean) probing. Cell centers, not corners, so all
 * points are strictly inside the box. Longitudes are emitted normalized to
 * [-180, 180), so a box in continuous longitudes (crossing the antimeridian,
 * `east > 180`) samples the correct pixels on both sides of the seam.
 */
export function gridPoints(
  bounds: Bounds,
  latitudeCount: number,
  longitudeCount = latitudeCount
): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  for (let i = 0; i < latitudeCount; i++) {
    const lat =
      bounds.south +
      ((i + 0.5) / latitudeCount) * (bounds.north - bounds.south);
    for (let j = 0; j < longitudeCount; j++) {
      const lon =
        bounds.west +
        ((j + 0.5) / longitudeCount) * (bounds.east - bounds.west);
      points.push({ lat, lon: normalizeLon(lon) });
    }
  }
  return points;
}

// --- Seasonal climatology & anomalies --------------------------------------------

/**
 * Mean value per calendar month (index 0 = January) across the whole series —
 * the seasonal climatology. Entries with no data in any year stay null.
 */
export function monthlyClimatology(
  months: YearMonth[],
  values: (number | null)[]
): (number | null)[] {
  // The climatology is subtracted from near-equal values (anomaly = value −
  // climatology), so digits lost here would surface amplified: compensated.
  const sums = Array.from({ length: 12 }, () => makeNeumaierAcc());
  const counts = new Array<number>(12).fill(0);
  for (let i = 0; i < months.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    sums[months[i].month - 1].add(v);
    counts[months[i].month - 1]++;
  }
  return sums.map((sum, m) => (counts[m] > 0 ? sum.sum() / counts[m] : null));
}

/**
 * De-seasonalized series: each month minus its calendar-month climatology.
 * This is where droughts, heatwaves, and greening trends stop hiding behind
 * the seasonal cycle.
 */
export function anomalySeries(
  months: YearMonth[],
  values: (number | null)[],
  climatology = monthlyClimatology(months, values)
): (number | null)[] {
  return months.map((ym, i) => {
    const v = values[i];
    const clim = climatology[ym.month - 1];
    if (v === null || v === undefined || clim === null) return null;
    return v - clim;
  });
}

// --- Value scales -------------------------------------------------------------

export interface ProbeScale {
  /** Axis label, e.g. "NDVI (approx.)". */
  label: string;
  min: number;
  max: number;
  /** Unit suffix for display, e.g. "%" (empty for dimensionless). */
  unit: string;
  /**
   * True when min/max carry physical meaning (NDVI 0–1, snow 0–100 %).
   * False means the value is a fraction of the color scale — still faithful
   * for trends and seasonality, but not in physical units.
   */
  calibrated: boolean;
}

/** Fraction-of-scale fallback for layers without a trusted physical range. */
const scaleFraction = (label: string): ProbeScale => ({
  label,
  min: 0,
  max: 1,
  unit: "",
  calibrated: false,
});

/**
 * Physical ranges below were derived 2026-07-09 from the colormap metadata
 * GIBS itself renders the tiles with (colormaps/v1.3 — see lib/colormap.ts),
 * every ramp verified linear-in-value (worst deviation 0.16%, SST).
 * Precipitation converts GIBS's kg/m²/s to mm/day (SCALE_CONVERSIONS).
 * The weekly contract suite re-derives all six from the live documents, so
 * an upstream palette change fails CI instead of silently mis-scaling.
 */
export const PROBE_SCALES: Record<LayerId, ProbeScale> = {
  ndvi: { label: "NDVI (approx.)", min: 0, max: 1, unit: "", calibrated: true },
  evi: { label: "EVI (approx.)", min: 0, max: 1, unit: "", calibrated: true },
  snow: {
    label: "Snow cover (approx.)",
    min: 0,
    max: 100,
    unit: "%",
    calibrated: true,
  },
  lst: {
    label: "Land surface temp (approx.)",
    min: 200,
    max: 350,
    unit: "K",
    calibrated: true,
  },
  airtemp: {
    label: "Air temp 2 m (approx.)",
    min: 220,
    max: 310,
    unit: "K",
    calibrated: true,
  },
  sst: {
    label: "Sea surface temp (approx.)",
    min: 0,
    max: 32,
    unit: "°C",
    calibrated: true,
  },
  precip: {
    label: "Precipitation rate (approx.)",
    min: 0,
    max: 43.2, // 5.0e-4 kg/m²/s × 86 400 s/day
    unit: "mm/day",
    calibrated: true,
  },
  soil: {
    // Depth belongs in the label: it rides into the CSV's "# value:" header,
    // where a downstream reader has nothing else to tell 0-10 cm from root zone.
    label: `Soil moisture ${SOIL_MOISTURE_DEPTH_LABEL} (approx.)`,
    min: 0,
    max: 50,
    unit: "kg/m²",
    calibrated: true,
  },
  aerosol: {
    label: "Aerosol optical depth 550 nm (approx.)",
    min: 0,
    max: 0.9,
    unit: "",
    calibrated: true,
  },
  // Categorical — the probe declines to chart it (see main.ts), but the
  // record stays exhaustive per LayerId.
  landcover: scaleFraction("Land-cover class (categorical)"),
  terrain: scaleFraction("Elevation (fraction of scale)"),
};

/** Map a 0..1 gradient position onto a layer's value scale. */
export function scaleValue(t: number, scale: ProbeScale): number {
  return scale.min + t * (scale.max - scale.min);
}

/**
 * Display formatting: enough decimals to resolve the inversion's quantization
 * step, plus the unit ("0.634", "78.4 %").
 *
 * Decimals come from `csvDecimals` — the same quantization-derived rule the
 * download already applies — so the status line, the chart axes, the legend
 * ticks and the CSV state one measurement at one method-justified precision.
 * The previous rule keyed the decimals off the scale's *span* (none above 10
 * units, two below), which printed a value coarser than the uncertainty
 * quoted beside it. That hurt the atmospheric layers most: precipitation
 * resolves ±0.08 mm/day but rendered to a whole mm/day, so every arid and
 * semi-arid monthly mean (< 0.5 mm/day) collapsed onto "0 mm/day" — the same
 * string a rain-free month gets — and the anomaly axis printed sub-unit
 * departures as "+0"; 2 m air temperature quoted ±0.2 K next to a value
 * rounded to the nearest kelvin, discarding the interannual signal entirely.
 */
export function formatProbeValue(value: number, scale: ProbeScale): string {
  return `${value.toFixed(csvDecimals(scale))}${scale.unit ? ` ${scale.unit}` : ""}`;
}

// --- Quantified uncertainty ------------------------------------------------------

/** LUT resolution the inversion runs at (buildColormapLut's default). */
export const PROBE_LUT_SIZE = 256;

/**
 * The value resolution of the colormap inversion: one LUT step on the
 * layer's scale. Values can't be known finer than this — the quantization
 * floor of the method (compression noise sits on top; see
 * probe.accuracy.test.ts for the measured end-to-end bounds).
 */
export function quantizationStep(scale: ProbeScale): number {
  return (scale.max - scale.min) / (PROBE_LUT_SIZE - 1);
}

/**
 * Decimals that honestly represent the quantization step — enough to
 * resolve it, none implying precision the method doesn't have (the old
 * fixed 4 decimals printed 0.6338 from a ±0.002 measurement).
 *
 * Named for the download it was written for, but it is the repository's one
 * value-precision rule: `formatProbeValue` renders every on-screen value with
 * it too, so no surface can quote a number coarser or finer than the method
 * resolves.
 */
export function csvDecimals(scale: ProbeScale): number {
  const step = quantizationStep(scale);
  if (step <= 0) return 0;
  return Math.max(0, Math.ceil(-Math.log10(step)));
}

/** "±0.002" / "±0.2 %" — half the quantization step, one significant digit. */
export function uncertaintyText(scale: ProbeScale): string {
  const half = quantizationStep(scale) / 2;
  return `±${half.toPrecision(1)}${scale.unit ? ` ${scale.unit}` : ""}`;
}

// --- Series statistics ---------------------------------------------------------

export interface SeriesStats {
  min: number;
  max: number;
  mean: number;
  /** Months with data (non-null). */
  count: number;
}

export function seriesStats(values: (number | null)[]): SeriesStats | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  const sum = makeNeumaierAcc();
  for (const v of valid) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum.add(v);
  }
  return { min, max, mean: sum.sum() / valid.length, count: valid.length };
}

// --- CSV export -----------------------------------------------------------------

/**
 * Make free text safe to embed in a `#` provenance header line.
 *
 * Header lines are comments to the supported parsers (pandas
 * `comment="#"`, R `comment.char="#"`), but naive consumers — Excel,
 * Sheets, `split(",")` scripts — read them as rows. RFC 4180 quoting can't
 * rescue those lines (a leading quote would hide the `#` from the comment
 * convention), so the discipline is the reverse: a header line never
 * *contains* a delimiter, a quote, or a line break. Interpolated text from
 * outside this file (layer labels, upstream dataset titles) is scrubbed
 * here; `,` → `;` keeps the prose readable. `# view_url` is the one
 * documented exception — commas are valid URI characters and the link must
 * stay byte-exact.
 */
export function csvHeaderText(text: string): string {
  return text
    .replace(/\r\n|[\r\n]/g, " ")
    .replace(/"/g, "'")
    .replace(/,/g, ";");
}

export interface ProbeCsvMeta {
  layerLabel: string;
  wmsLayer: string;
  /** The layer's cited source dataset (see DatasetRef in lib/timeline.ts). */
  dataset?: DatasetRef;
  lat: number;
  lon: number;
  scale: ProbeScale;
  /** "point" (3×3 px median), "area" (~1° grid mean), or "region" (a
   * user-drawn box, grid mean over sampledBounds). */
  mode: "point" | "area" | "region";
  /** The averaged region, present in area and region modes. */
  sampledBounds?: Bounds;
  /** Adaptive drawn-region grid and rendered-pixel mapping. Omitted for point
   * and fixed-size area probes. These are counts, not ground resolution. */
  regionSampling?: {
    latitudeGridSize: number;
    longitudeGridSize: number;
    candidatePointCount: number;
    sourcePixelCount: number;
  };
  /** Source image size the pixel was sampled from. */
  imageWidth: number;
  imageHeight: number;
  /** ISO timestamp for the provenance header. */
  generatedIso: string;
  /** App version (package.json) that produced this file — the inversion
   * method can evolve between releases, so exports carry their origin. */
  toolVersion?: string;
  /** Deep link that reproduces the exact chart (layer, month, probe). */
  viewUrl?: string;
  /**
   * Measured colormap-inversion accuracy lines for this layer, built by
   * `probeInversionAccuracy.inversionAccuracyCsvHeaders`. Passed in rather
   * than derived here so this module stays a leaf of the validation figures
   * (validation.ts already imports this file). Omitted for layers with no
   * committed measurement — never replaced with a hedged placeholder.
   */
  inversionAccuracyHeaders?: string[];
  /**
   * Provenance lines naming months inside this file's span that the source
   * never distributed, built by `probeRecordGaps.probeRecordGapsCsvHeaders`.
   * Passed in for the same reason as `inversionAccuracyHeaders`: this module
   * stays a leaf and never reaches into the layer catalog. Empty for the
   * layers whose charted span clears every pinned gap.
   */
  recordGapHeaders?: string[];
  /**
   * Provenance lines naming *which* moments and which water the sampled
   * quantity represents, built by
   * `seaSurfaceTemperatureSamplingIdentity.sstSamplingIdentityCsvHeaders`.
   * Passed in for the same reason as the two above: this module stays a leaf
   * and never reaches into the layer catalog. Empty for every layer whose
   * value needs no such qualifier.
   */
  samplingIdentityHeaders?: string[];
  /**
   * Provenance lines disclosing that some rows below are one-sided bounds
   * rather than measurements, built by
   * `probeSstExtremeCensoring.sstExtremeCensoringCsvHeaders`. Passed in for the
   * same reason as the three above: this module stays a leaf and never reaches
   * into the layer catalog or the colormap tables. Empty for every layer whose
   * ramp has no open end cap and for any record that stayed inside it.
   */
  censoringHeaders?: string[];
}

/**
 * Build the probe CSV: provenance as `#` comment headers, then one row per
 * month (empty value = no data). Values arrive as 0..1 gradient positions and
 * are written on the layer's scale (so a snow-cover CSV really is percent);
 * the anomaly column is the value minus its calendar-month climatology, in
 * the same units. Reproducibility is the point — the header states exactly
 * what was sampled, how, and that values are approximate.
 */
export function buildProbeCsv(
  meta: ProbeCsvMeta,
  months: YearMonth[],
  values: (number | null)[],
  anomalies: (number | null)[] = anomalySeries(months, values),
  validFractions?: number[]
): string {
  const ymStr = (ym: YearMonth): string =>
    `${ym.year}-${String(ym.month).padStart(2, "0")}`;
  const span = meta.scale.max - meta.scale.min;
  // Decimals follow the quantization step — printing more digits than the
  // method resolves is false precision (the pre-#149 fixed 4 decimals
  // printed 0.6338 from a ±0.002 measurement).
  const decimals = csvDecimals(meta.scale);
  const cell = (v: number | null | undefined, offset: number): string =>
    v === null || v === undefined || !Number.isFinite(v)
      ? ""
      : (offset + v * span).toFixed(decimals);
  const coverageCell = (fraction: number | undefined): string =>
    fraction !== undefined &&
    Number.isFinite(fraction) &&
    fraction >= 0 &&
    fraction <= 1
      ? fraction.toFixed(2)
      : "";
  // Coverage column for averaged modes: how much of the box's *area* held
  // data each month — a 25%-coverage mean and a 100% one should never look
  // alike downstream.
  const fractions = meta.mode !== "point" && validFractions;
  // Trend runs on physical values (slope in scale units), not gradient
  // positions; headers are empty when the record is too short to test.
  const physical = values.map((v) =>
    v === null || v === undefined ? null : meta.scale.min + v * span
  );
  const trend = trendSummary(months, physical, meta.scale);
  // Crossing boxes print normalized longitudes with west > east — the
  // GeoJSON (RFC 7946 §5.2) convention for an antimeridian-spanning bbox.
  // Space-separated (not commas): a header line must stay a single CSV
  // field so naive parsers never split provenance into ragged cells.
  const region = meta.sampledBounds
    ? `${meta.sampledBounds.south.toFixed(3)} ${normalizeLon(meta.sampledBounds.west).toFixed(3)} ${meta.sampledBounds.north.toFixed(3)} ${normalizeLon(meta.sampledBounds.east).toFixed(3)} (S W N E)${
        crossesAntimeridian(meta.sampledBounds)
          ? " — crosses the antimeridian (west > east)"
          : ""
      }`
    : undefined;
  const lines = [
    `# RoamingEye ${meta.mode} probe — APPROXIMATE values`,
    `# method: colormap inversion of NASA GIBS rendered imagery (${meta.imageWidth}x${meta.imageHeight} equirectangular GetMap)${
      meta.mode === "point" ? "" : "; area-weighted (cos latitude) grid mean"
    }`,
    `# caveat: reconstructed from public imagery colors; use the underlying L3 product for measurement-grade work`,
    `# layer: ${csvHeaderText(meta.layerLabel)}`,
    `# gibs_layer: ${csvHeaderText(meta.wmsLayer)}`,
    // Cite the data, not the picture: the rendered imagery derives from a
    // dataset with its own DOI and citation (NASA data-use guidance).
    ...(meta.dataset
      ? [
          `# data_product: ${csvHeaderText(
            `${meta.dataset.shortName} v${meta.dataset.version} — ${meta.dataset.title}`
          )}`,
          // Percent-encode the DOI for URL safety first, then apply the CSV
          // header contract (no comma, no quote, single line) to the link.
          `# data_doi: ${csvHeaderText(doiResolverUrl(meta.dataset.doi))}`,
        ]
      : []),
    // Directly under the citation, because it decodes it: the short name above
    // states the sampled half of the diurnal cycle only as a suffix nobody
    // reads. A qualifier on what `value` means belongs with the product it
    // qualifies, not down in the series-describing block.
    ...(meta.samplingIdentityHeaders ?? []),
    `# lat: ${meta.lat.toFixed(4)}`,
    `# lon: ${meta.lon.toFixed(4)}`,
    ...(region ? [`# region: ${region}`] : []),
    ...(meta.regionSampling
      ? [
          `# sampling_grid: ${meta.regionSampling.latitudeGridSize}x${meta.regionSampling.longitudeGridSize} geographic cell centres (latitude x longitude)`,
          `# sampling_candidates: ${meta.regionSampling.candidatePointCount}`,
          `# sampled_source_pixels: ${meta.regionSampling.sourcePixelCount} unique rendered-image pixels`,
        ]
      : []),
    `# value: ${csvHeaderText(meta.scale.label)}${meta.scale.unit ? ` [${csvHeaderText(meta.scale.unit)}]` : ""} (${
      meta.scale.calibrated
        ? "approximate physical scale"
        : "fraction of color scale"
    })`,
    // The anomaly is a within-record departure, and how much record backs it
    // varies by calendar month — say both, so a single-year calendar month's
    // constructed zero is never read as a measured "exactly average".
    `# anomaly: value minus this location's mean for the same calendar month in this file (same units) — a within-record departure; not an independent climatological normal`,
    ...anomalyBaselineCsvHeaders(anomalyBaselineDepth(months, values)),
    `# uncertainty: ${uncertaintyText(meta.scale)} colormap quantization (compression noise on top; see the probe accuracy suite for end-to-end bounds)`,
    // Quantization is the floor, not the error. The measured disagreement with
    // GIBS's own colormap is far larger on most layers, so it ships alongside
    // rather than staying in docs/validation.md (see probeInversionAccuracy).
    ...(meta.inversionAccuracyHeaders ?? []),
    ...trendCsvHeaders(trend),
    // Directly after the statistics it qualifies: the uncertainty line above is
    // two-sided and the trend is fitted over the same series, and both are
    // wrong over a month the colormap capped. A row-level bound disclosed only
    // in prose still beats one disclosed nowhere, which is where the export
    // stood while the status line already marked every affected statistic.
    ...(meta.censoringHeaders ?? []),
    // Last of the series-describing block, and deliberately after it: the
    // scope line qualifies the month count, the anomaly baseline and the
    // trend, so it reads as the correction to statistics already stated.
    ...(meta.recordGapHeaders ?? []),
    ...(fractions
      ? [
          `# valid_fraction: share of the sampled area that held data that month (area-weighted)`,
        ]
      : []),
    `# imagery: NASA GIBS (public domain) — https://gibs.earthdata.nasa.gov`,
    `# generated: ${meta.generatedIso}`,
    `# tool: RoamingEye — https://github.com/zkWizard/RoamingEye`,
    ...(meta.toolVersion ? [`# tool_version: ${meta.toolVersion}`] : []),
    ...(meta.viewUrl ? [`# view_url: ${meta.viewUrl}`] : []),
    `year_month,value,anomaly${fractions ? ",valid_fraction" : ""}`,
  ];
  for (let i = 0; i < months.length; i++) {
    lines.push(
      `${ymStr(months[i])},${cell(values[i], meta.scale.min)},${cell(anomalies[i], 0)}` +
        (fractions ? `,${coverageCell(validFractions[i])}` : "")
    );
  }
  return lines.join("\n") + "\n";
}
