import { describe, it, expect, beforeAll } from "vitest";
import { CLIMATE_METRICS, type ClimateMetricId } from "../src/lib/climate";
import { climateRecordGapMonths } from "../src/lib/climateRecordGaps";
import { indexToYm, ymToIndex, type YearMonth } from "../src/lib/timeline";

/**
 * Distribution-gap contract: the months lib/climateRecordGaps.ts pins as never
 * distributed must be exactly the months GIBS omits from the layer's own
 * advertised time dimension.
 *
 * GIBS advertises one `<Value>` per contiguous range, so the gaps are the
 * months between one range's end and the next range's start. The pins rot two
 * ways — NASA backfills a month (the pin would hide real data), or a product
 * drops another one (a new gap would be summarized as observed-but-empty).
 * Re-deriving from the live ranges catches both.
 *
 * Network-touching by design (runs via catalog-check.yml, not `npm run test`).
 * One in-run retry absorbs transient blips.
 */

const CAPABILITIES_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml";

const layerBlocks = new Map<string, string>();

async function fetchCapabilities(): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(CAPABILITIES_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status} for WMTSCapabilities`);
      return await res.text();
    } catch (err) {
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

beforeAll(async () => {
  const xml = await fetchCapabilities();
  for (const metric of Object.values(CLIMATE_METRICS)) {
    const at = xml.indexOf(
      `<ows:Identifier>${metric.sourceLayer}</ows:Identifier>`
    );
    if (at < 0) continue;
    const start = xml.lastIndexOf("<Layer>", at);
    const end = xml.indexOf("</Layer>", at);
    layerBlocks.set(metric.sourceLayer, xml.slice(start, end));
  }
});

/** Monthly ISO ranges ("1980-01-01/2023-11-01/P1M") as [start, end] indices. */
function distributedRanges(body: string): { start: number; end: number }[] {
  return [...body.matchAll(/<Value>([^<]+)<\/Value>/g)]
    .map((m) => m[1].trim().split("/"))
    .filter(([, , period]) => period === "P1M")
    .map(([from, to]) => ({ start: isoToIndex(from), end: isoToIndex(to) }))
    .sort((a, b) => a.start - b.start);
}

/** "2024-05-01" → absolute month index, matching timeline's ymToIndex. */
function isoToIndex(iso: string): number {
  const [year, month] = iso.split("-").map(Number);
  return ymToIndex({ year, month });
}

/** Every month strictly between one advertised range and the next. */
function interiorGaps(ranges: { start: number; end: number }[]): YearMonth[] {
  const gaps: YearMonth[] = [];
  for (let i = 1; i < ranges.length; i++) {
    for (let m = ranges[i - 1].end + 1; m < ranges[i].start; m++) {
      gaps.push(indexToYm(m));
    }
  }
  return gaps;
}

describe("climate distribution gaps (live GetCapabilities)", () => {
  const metricIds = Object.keys(CLIMATE_METRICS) as ClimateMetricId[];

  it.each(metricIds)(
    "%s: the months pinned as undistributed are the months GIBS omits",
    (metricId) => {
      const metric = CLIMATE_METRICS[metricId];
      const body = layerBlocks.get(metric.sourceLayer);
      expect(
        body,
        `layer "${metric.sourceLayer}" missing from capabilities`
      ).toBeDefined();

      const ranges = distributedRanges(body!);
      expect(
        ranges.length,
        `no monthly time ranges parsed for "${metric.sourceLayer}"`
      ).toBeGreaterThan(0);

      expect(
        interiorGaps(ranges),
        `"${metric.sourceLayer}" distribution gaps drifted — GIBS now omits a ` +
          `different set of months than climateRecordGaps.ts pins. Either NASA ` +
          `backfilled a pinned month (the pin now hides real data) or the ` +
          `product skipped a new one (it is being summarized as ` +
          `observed-but-empty). Re-measure and update CLIMATE_RECORD_GAPS.`
      ).toEqual(climateRecordGapMonths(metricId));
    }
  );
});
