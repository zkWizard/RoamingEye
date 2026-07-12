import type { Bounds } from "./imagery";
import type { LegendStop } from "./legend";
import { makeNeumaierAcc } from "./numerics";
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
  n: number
): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  for (let i = 0; i < n; i++) {
    const lat = bounds.south + ((i + 0.5) / n) * (bounds.north - bounds.south);
    for (let j = 0; j < n; j++) {
      const lon = bounds.west + ((j + 0.5) / n) * (bounds.east - bounds.west);
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
    label: "Soil moisture (approx.)",
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

/** Display formatting: 3 significant digits + unit ("0.63", "78 %"). */
export function formatProbeValue(value: number, scale: ProbeScale): string {
  const digits = scale.max - scale.min > 10 ? 0 : 2;
  return `${value.toFixed(digits)}${scale.unit ? ` ${scale.unit}` : ""}`;
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
    v === null || v === undefined ? "" : (offset + v * span).toFixed(decimals);
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
          `# data_doi: https://doi.org/${csvHeaderText(meta.dataset.doi)}`,
        ]
      : []),
    `# lat: ${meta.lat.toFixed(4)}`,
    `# lon: ${meta.lon.toFixed(4)}`,
    ...(region ? [`# region: ${region}`] : []),
    `# value: ${csvHeaderText(meta.scale.label)}${meta.scale.unit ? ` [${csvHeaderText(meta.scale.unit)}]` : ""} (${
      meta.scale.calibrated
        ? "approximate physical scale"
        : "fraction of color scale"
    })`,
    `# anomaly: value minus this location's mean for the same calendar month (same units)`,
    `# uncertainty: ${uncertaintyText(meta.scale)} colormap quantization (compression noise on top; see the probe accuracy suite for end-to-end bounds)`,
    ...trendCsvHeaders(trend),
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
        (fractions ? `,${(validFractions[i] ?? 0).toFixed(2)}` : "")
    );
  }
  return lines.join("\n") + "\n";
}
