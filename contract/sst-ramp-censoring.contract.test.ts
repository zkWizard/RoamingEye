import { describe, it, expect } from "vitest";
import {
  COLORMAP_DOCS,
  colormapUrl,
  parseColormapEntries,
} from "../src/lib/colormap";
import { invertColormapEntries } from "../src/lib/probe";
import { SST_PUBLISHED_RAMP } from "../src/lib/sstRampCensoring";

/**
 * SST end-cap contract: NASA's published sea-surface-temperature colormap
 * closes with two OPEN intervals ("< 0.00", "≥ 32.00"). They carry no finite
 * range, so parseColormapEntries drops them and the probe's nearest-entry
 * inversion silently resolves them to the adjacent finite ramp colour —
 * censoring, not rejection. src/lib/sstRampCensoring.ts commits the terminal
 * bin edges so the place card can report those values as bounds.
 *
 * This re-derives all four edges from the live document. A GIBS re-render that
 * widens the ramp, moves a cap, or closes one must fail here rather than
 * quietly change which observations are censored.
 *
 * Network-touching; runs weekly via catalog-check.yml.
 */

async function fetchColormap(doc: string): Promise<string> {
  const url = colormapUrl(doc);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/** Open end caps, as the source ColorMap writes them: "[-INF,0.00)". */
function openCaps(xml: string): { belowLo: number; aboveLo: number } {
  const below = /sourceValue="\[-INF,\s*(-?[\d.]+)\)"/.exec(xml);
  const above = /sourceValue="\[(-?[\d.]+),\s*\+INF\)"/.exec(xml);
  if (!below || !above) {
    throw new Error("SST colormap no longer publishes both open end caps");
  }
  return { belowLo: Number(below[1]), aboveLo: Number(above[1]) };
}

describe("SST ramp censoring ↔ live GIBS colormap", () => {
  it("keeps the committed terminal bins and open caps valid", async () => {
    const xml = await fetchColormap(COLORMAP_DOCS.sst);
    const entries = parseColormapEntries(xml);
    expect(entries.length, "SST ramp has continuous entries").toBeGreaterThan(
      10
    );

    const values = entries.map((entry) => entry.value).sort((a, b) => a - b);
    const lowest = values[0];
    const highest = values[values.length - 1];
    const { floorBin, ceilingBin } = SST_PUBLISHED_RAMP;

    // The parsed ramp's extreme entries are the midpoints of the committed
    // terminal bins — the values a censored pixel is decoded as.
    expect(
      lowest,
      `live ramp floor midpoint moved; update floorBin in src/lib/sstRampCensoring.ts`
    ).toBeCloseTo((floorBin.lo + floorBin.hi) / 2, 4);
    expect(
      highest,
      `live ramp ceiling midpoint moved; update ceilingBin in src/lib/sstRampCensoring.ts`
    ).toBeCloseTo((ceilingBin.lo + ceilingBin.hi) / 2, 4);

    // Both caps still exist, and still start exactly where the finite ramp ends.
    const caps = openCaps(xml);
    expect(caps.belowLo).toBeCloseTo(floorBin.lo, 4);
    expect(caps.aboveLo).toBeCloseTo(ceilingBin.hi, 4);

    // Why the qualifier is needed at all: each cap colour is close enough to
    // the adjacent finite entry that inversion accepts it as a measurement.
    const capRgb = (sourceValue: string) => {
      const m = new RegExp(
        `<ColorMapEntry rgb="(\\d+),(\\d+),(\\d+)"[^>]*sourceValue="\\[${sourceValue}\\)"`
      ).exec(xml);
      if (!m) throw new Error(`SST colormap has no ${sourceValue} cap entry`);
      return { r: +m[1], g: +m[2], b: +m[3] };
    };
    expect(
      invertColormapEntries(capRgb("-INF,0.00"), entries),
      "the below-ramp cap still inverts to the ramp's lowest bin"
    ).toBeCloseTo(lowest, 4);
    expect(
      invertColormapEntries(capRgb("32.00,\\+INF"), entries),
      "the above-ramp cap still inverts to the ramp's highest bin"
    ).toBeCloseTo(highest, 4);
  });
});
