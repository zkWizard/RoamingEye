/**
 * GIBS colormap metadata: the machine-readable documents GIBS renders tiles
 * with (colormaps/v1.3/<doc>.xml), which map every ramp color to its source
 * data value and units. Parsing them is how PROBE_SCALES' physical ranges
 * were derived — and how the weekly contract test re-derives them, so an
 * upstream palette re-render fails loudly instead of silently mis-scaling
 * every probe (see contract/probe-scales.contract.test.ts).
 *
 * Format notes, learned from the live documents:
 *  - A document holds several <ColorMap> sections (No Data + the data ramp).
 *    Family documents (MODIS_Land_Surface_Temp) express ColorMapEntry
 *    sourceValue in raw DNs while the *continuous Legend* speaks physical
 *    units — so the ramp is read from the Legend's tooltip ranges.
 *  - The ramp's end entries are open catch-alls ("< 200.0", "≥ 350.0") with
 *    no width; they don't match the "lo – hi" tooltip shape and are skipped.
 *  - GLDAS documents print scientific notation ("1.0e-05 – 2.0e-05").
 *  - Not every ramp is continuous. Products quantized to integer classes ship
 *    a *discrete* Legend instead: one entry per class, tooltip a single value
 *    ("50") rather than a range. MODIS_NDSI_Snow_Cover is one — 100 integer
 *    percent classes. Those legends also carry entries GIBS never paints
 *    (transparent="true" on the matching ColorMapEntry ref): snow's 0% class,
 *    cloud, night, water and fill are all transparent, so reading them as
 *    ramp colours would invent data where the imagery draws none.
 */

export interface ColormapRamp {
  /** Units declared on the data ColorMap section ("K", "°C", "kg/m²"…). */
  units: string;
  /** Ordered finite value bins of the continuous legend ramp. */
  bins: { lo: number; hi: number }[];
}

/** A continuous-legend entry: the RGB GIBS renders, and the value it means. */
export interface ColormapEntry {
  rgb: { r: number; g: number; b: number };
  /** Midpoint of the entry's value range, in the colormap's own units. */
  value: number;
}

/**
 * Pair every continuous-legend entry's RGB with its value (range midpoint) —
 * the ground truth for "what does this color mean", used to validate the
 * probe's inversion end to end (see the inversion-validation contract). Open
 * end-cap entries ("< 200", "≥ 350") carry no finite range and are skipped.
 */
export function parseColormapEntries(xml: string): ColormapEntry[] {
  const legend = /<Legend type="continuous"[\s\S]*?<\/Legend>/.exec(xml)?.[0];
  if (!legend) return parseDiscreteEntries(xml);
  const entries: ColormapEntry[] = [];
  const num = "-?[\\d.]+(?:e[+-]?\\d+)?";
  for (const tag of legend.match(/<LegendEntry\b[^>]*\/?>/g) ?? []) {
    const rgbM = /rgb="(\d+),(\d+),(\d+)"/.exec(tag);
    const rangeM = new RegExp(
      `tooltip="\\s*(${num})\\s*[–—-]\\s*(${num})\\s*"`
    ).exec(tag);
    if (!rgbM || !rangeM) continue;
    const lo = Number(rangeM[1]);
    const hi = Number(rangeM[2]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) continue;
    entries.push({
      rgb: { r: +rgbM[1], g: +rgbM[2], b: +rgbM[3] },
      value: (lo + hi) / 2,
    });
  }
  return entries;
}

/**
 * The painted entries of a *discrete* legend: one colour per integer class,
 * tooltip a single value. Entries the sibling `<Entries>` block marks
 * transparent are dropped — GIBS never draws them, so they are not colours a
 * sampled pixel can be, and treating them as ramp values would let a
 * cloud/night/fill colour invert to a physical reading.
 */
function parseDiscreteEntries(xml: string): ColormapEntry[] {
  // Scope to the ColorMap section that owns the discrete legend: a document's
  // other sections (e.g. "Classifications") re-use ids for other meanings.
  const section = (xml.match(/<ColorMap\b[\s\S]*?<\/ColorMap>/g) ?? []).find(
    (s) => /<Legend type="discrete"/.test(s)
  );
  if (!section) return [];
  const transparent = new Set(
    [...section.matchAll(/<ColorMapEntry\b[^>]*\/?>/g)]
      .filter((m) => /transparent="true"/.test(m[0]))
      .map((m) => /ref="(\d+)"/.exec(m[0])?.[1])
  );
  const entries: ColormapEntry[] = [];
  const legend = /<Legend type="discrete"[\s\S]*?<\/Legend>/.exec(section)![0];
  for (const tag of legend.match(/<LegendEntry\b[^>]*\/?>/g) ?? []) {
    const rgbM = /rgb="(\d+),(\d+),(\d+)"/.exec(tag);
    const valueM = /tooltip="\s*(-?[\d.]+)\s*"/.exec(tag);
    if (!rgbM || !valueM) continue;
    if (transparent.has(/id="(\d+)"/.exec(tag)?.[1])) continue;
    const value = Number(valueM[1]);
    if (!Number.isFinite(value)) continue;
    entries.push({ rgb: { r: +rgbM[1], g: +rgbM[2], b: +rgbM[3] }, value });
  }
  return entries;
}

/**
 * Layer id → colormap document name for the layers whose probe scale is
 * calibrated from GIBS metadata. NOT always the layer identifier: LST and
 * SST use family-wide colormaps (verified against each layer's
 * ows:Metadata colormap link in the live WMTS capabilities).
 */
export const COLORMAP_DOCS = {
  lst: "MODIS_Land_Surface_Temp",
  snow: "MODIS_NDSI_Snow_Cover",
  airtemp: "MERRA2_2m_Air_Temperature_Monthly",
  sst: "MODIS_Sea_Surface_Temperature",
  precip: "GLDAS_Surface_Total_Precipitation_Rate_Monthly",
  soil: "GLDAS_Underground_Soil_Moisture_Monthly",
  aerosol: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
} as const;

export type CalibratedLayerId = keyof typeof COLORMAP_DOCS;

export function colormapUrl(doc: string): string {
  return `https://gibs.earthdata.nasa.gov/colormaps/v1.3/${doc}.xml`;
}

/**
 * Unit conversions applied between GIBS's stored ramp and the scale the
 * probe reports, where scientific convention differs from storage:
 * precipitation rate kg/m²/s → mm/day (1 kg/m² of water ≡ 1 mm depth;
 * × 86 400 s/day). Everything else is reported in GIBS's own units.
 *
 * Snow is a unit *declaration*, not a conversion: MODIS_NDSI_Snow_Cover
 * carries no `units` attribute (its legend labels the classes "1"–"100"),
 * while MOD10CM's variable is fractional snow-covered area in percent. The
 * factor is 1 — only the name is pinned, so the contract still checks the
 * ramp itself rather than accepting an undeclared unit.
 */
export const SCALE_CONVERSIONS: Partial<
  Record<CalibratedLayerId, { factor: number; unit: string }>
> = {
  precip: { factor: 86_400, unit: "mm/day" },
  snow: { factor: 1, unit: "%" },
};

/** Parse a GIBS colormap document into its physical ramp. */
export function parseColormap(xml: string): ColormapRamp {
  const units = /<ColorMap[^>]*units="([^"]*)"/.exec(xml)?.[1].trim() ?? "";
  const legend = /<Legend type="continuous"[\s\S]*?<\/Legend>/.exec(xml)?.[0];
  if (!legend) return { units, bins: discreteBins(parseDiscreteEntries(xml)) };
  const bins: ColormapRamp["bins"] = [];
  const num = "(-?[\\d.]+(?:e[+-]?\\d+)?)";
  const range = new RegExp(`tooltip="\\s*${num}\\s*[–—-]\\s*${num}\\s*"`, "g");
  for (const m of legend.matchAll(range)) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
      bins.push({ lo, hi });
    }
  }
  return { units, bins };
}

/**
 * Value bins for a discrete ramp. Each painted class stands for one step of
 * the quantization, so class `v` covers `(v − step, v]` — that makes the
 * ramp's span the same quantity a continuous legend reports, and lets the
 * linearity check run unchanged. The step is read from the entries rather
 * than assumed, so a non-unit quantization is still described correctly.
 */
function discreteBins(entries: ColormapEntry[]): ColormapRamp["bins"] {
  if (entries.length < 2) return [];
  const step = entries[1].value - entries[0].value;
  if (!(step > 0)) return [];
  return entries.map((e) => ({ lo: e.value - step, hi: e.value }));
}

/**
 * How far a ramp deviates from linear-in-value: the max difference between
 * each bin edge's uniform position (index/count) and its value position
 * ((edge − min)/span), as a fraction of the span. 0 = perfectly uniform.
 * The probe's linear position→value mapping is only honest when this is
 * small; the contract test enforces the ceiling below.
 */
export function linearityDeviation(bins: ColormapRamp["bins"]): number {
  if (bins.length === 0) return Infinity;
  const min = bins[0].lo;
  const span = bins[bins.length - 1].hi - min;
  if (span <= 0) return Infinity;
  let worst = 0;
  for (let i = 0; i < bins.length; i++) {
    const uniform = (i + 1) / bins.length;
    const value = (bins[i].hi - min) / span;
    worst = Math.max(worst, Math.abs(uniform - value));
  }
  return worst;
}

/**
 * The ceiling on linearityDeviation for a layer to stay `calibrated`.
 * Live values at derivation time (2026-07-09): 0% everywhere except SST's
 * 0.16% — an order of magnitude of headroom without letting a genuinely
 * non-linear re-render (e.g. a log precip ramp) slip through.
 */
export const MAX_LINEARITY_DEVIATION = 0.02;
