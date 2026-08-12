/**
 * Snapshots the GIBS colormap documents the probe's inversion is validated
 * against into src/lib/gibsColormaps.json.
 *
 * Why a committed snapshot: the inversion-accuracy figures in
 * validation.MEASURED_INVERSION (published in METHODS.md §3 and
 * docs/validation.md) are measured by inverting these colormaps' colours
 * through our legend gradients. That measurement only ran weekly, over the
 * network — so a legend edit could change the real accuracy and leave the
 * published figures wrong for days with every offline check green. With the
 * ramps pinned here, the measurement re-runs offline on every PR.
 *
 * The snapshot is a *cache of the authoritative document*, never a substitute
 * for it: contract/inversion-validation.contract.test.ts still fetches the
 * live colormaps weekly and fails if they have drifted from this file.
 *
 * Run with: node scripts/snapshot-colormaps.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "lib", "gibsColormaps.json");

/** Kept in sync with COLORMAP_DOCS in src/lib/colormap.ts. */
const COLORMAP_DOCS = {
  lst: "MODIS_Land_Surface_Temp",
  airtemp: "MERRA2_2m_Air_Temperature_Monthly",
  sst: "MODIS_Sea_Surface_Temperature",
  precip: "GLDAS_Surface_Total_Precipitation_Rate_Monthly",
  soil: "GLDAS_Underground_Soil_Moisture_Monthly",
  aerosol: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
};

const url = (doc) =>
  `https://gibs.earthdata.nasa.gov/colormaps/v1.3/${doc}.xml`;

/**
 * Byte-for-byte the parse in src/lib/colormap.ts (parseColormapEntries).
 * Duplicated because this script is plain ESM run outside the bundler; the
 * snapshot test asserts the shipped parser reproduces these entries from the
 * live document, so the two can never quietly diverge.
 */
function parseColormapEntries(xml) {
  const legend = /<Legend type="continuous"[\s\S]*?<\/Legend>/.exec(xml)?.[0];
  if (!legend) return [];
  const entries = [];
  const num = "-?[\\d.]+(?:e[+-]?\\d+)?";
  for (const tag of legend.match(/<LegendEntry\b[^>]*\/?>/g) ?? []) {
    const rgbM = /rgb="(\d+),(\d+),(\d+)"/.exec(tag);
    const rangeM = new RegExp(
      `tooltip="\\s*(${num})\\s*[–—-]\\s*(${num})\\s*"`
    ).exec(tag);
    if (!rgbM || !rangeM) continue;
    const lo = Number(rangeM[1]);
    const hi = Number(rangeM[2]);
    // A zero-width printed range still names a value (its midpoint); GIBS
    // rounds the 2 m air-temperature tooltips to whole kelvin while the ramp
    // steps 0.5 K, so half that ramp prints as "222 - 222". Only a genuinely
    // inverted range is malformed — mirror parseColormapEntries (colormap.ts).
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) continue;
    entries.push({ rgb: [+rgbM[1], +rgbM[2], +rgbM[3]], value: (lo + hi) / 2 });
  }
  return entries;
}

const retrieved = new Date().toISOString().slice(0, 10);
const layers = {};
for (const [layer, doc] of Object.entries(COLORMAP_DOCS)) {
  const res = await fetch(url(doc));
  if (!res.ok) throw new Error(`${res.status} fetching ${url(doc)}`);
  const entries = parseColormapEntries(await res.text());
  if (entries.length < 10)
    throw new Error(`${doc}: only ${entries.length} entries`);
  layers[layer] = { doc, entries };
  console.log(`${layer.padEnd(8)} ${doc} → ${entries.length} entries`);
}

writeFileSync(
  OUT,
  JSON.stringify({ retrieved, base: url("<doc>"), layers }, null, 0) + "\n"
);
console.log(`wrote ${OUT}`);
