import { describe, it, expect } from "vitest";
import {
  FRESHNESS_FAMILIES,
  describeDomainsUrl,
  freshnessProbeFrom,
  parseLatestFromDomains,
} from "../src/lib/freshness";
import { DATA_LATEST, LAYERS, compareYm } from "../src/lib/timeline";

/**
 * Freshness contract: the boot-time DescribeDomains probe (lib/freshness.ts)
 * must keep working for EVERY product family it verifies. The request uses
 * the same compiled floor boot uses (`freshnessProbeFrom`). Anchoring the
 * window on DATA_LATEST instead asks for months a lagging product has not
 * published, and GIBS answers with an empty domain. That empty answer is a
 * stall (the timeline already says how many months behind), not a dead
 * probe. An empty answer from the boot window means the endpoint, the XML
 * shape, or the layer identifier changed, and this check names the family
 * before users boot into a timeline that can't self-update.
 *
 * Network-touching by design (runs via catalog-check.yml, not `npm run
 * test`). One in-run retry absorbs transient blips.
 */

async function fetchDomains(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for DescribeDomains`);
      return await res.text();
    } catch (err) {
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

describe("DescribeDomains freshness contract (live GIBS)", () => {
  for (const family of FRESHNESS_FAMILIES) {
    it(`${family.product} (${family.probe}) answers with a parseable, sane time domain`, async () => {
      // Same anchor as refreshDataLatest. DATA_LATEST is the wrong one for a
      // family whose compiled end trails the global baseline: the requested
      // range then starts after the last granule and the body is
      // `<Domain></Domain><Size>0</Size>`.
      const from = freshnessProbeFrom(family);
      const xml = await fetchDomains(describeDomainsUrl(family.probe, from));
      const latest = parseLatestFromDomains(xml);
      const anchor = `${from.year}-${String(from.month).padStart(2, "0")}`;
      expect(
        latest,
        `${family.product} (${LAYERS[family.probe].wmsLayer}): DescribeDomains ` +
          `for the boot window anchored at ${anchor} returned no usable time. ` +
          `An empty <Domain></Domain><Size>0</Size> means this layer publishes ` +
          `nothing in that window (retired, renamed, or the identifier no ` +
          `longer has a time domain), so boot freshness for ` +
          `${family.layers.join("/")} is dead:\n` +
          xml.slice(0, 500)
      ).not.toBeNull();
      // Sanity, not freshness: the verified end may trail the compiled
      // baseline (that's the lag this mechanism exists to respect), but an
      // answer YEARS behind means we're parsing the wrong thing.
      expect(
        Math.abs(compareYm(latest!, DATA_LATEST)),
        `${family.product}: verified end ${JSON.stringify(latest)} is ` +
          `implausibly far from the compiled baseline`
      ).toBeLessThanOrEqual(24);
      // The probe layer still exists under the identifier we ask for.
      expect(LAYERS[family.probe].wmsLayer.length).toBeGreaterThan(0);
    });
  }
});
