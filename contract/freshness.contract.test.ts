import { describe, it, expect } from "vitest";
import {
  FRESHNESS_FAMILIES,
  describeDomainsUrl,
  parseLatestFromDomains,
} from "../src/lib/freshness";
import { DATA_LATEST, LAYERS, compareYm } from "../src/lib/timeline";

/**
 * Freshness contract: the boot-time DescribeDomains probe (lib/freshness.ts)
 * must keep working for EVERY product family it verifies — MOD13A3
 * (ndvi/evi), MOD11C3 (lst), MOD10CM (snow). If GIBS changes the endpoint,
 * the XML shape, or a layer identifier, this weekly check names the family
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
      const xml = await fetchDomains(
        describeDomainsUrl(family.probe, DATA_LATEST)
      );
      const latest = parseLatestFromDomains(xml);
      expect(
        latest,
        `${family.product}: DescribeDomains response no longer parses — ` +
          `boot freshness for ${family.layers.join("/")} is dead:\n` +
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
