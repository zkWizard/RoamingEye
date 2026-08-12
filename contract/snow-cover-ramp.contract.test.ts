import { describe, it, expect } from "vitest";
import { colormapUrl } from "../src/lib/colormap";
import {
  MEASURED_SNOW_COVER_INVERSION,
  SNOW_COVER_COLORMAP_DOC,
  SNOW_COVER_FLAG_COLORS,
  auditSnowCoverInversion,
  parseSnowCoverFlagColors,
  parseSnowCoverRampEntries,
} from "../src/lib/snowCoverRamp";
import { NO_DATA_DISTANCE } from "../src/lib/probe";

/**
 * Snow-cover ramp contract: the cryosphere layer is the one calibrated layer
 * whose colormap is *discrete* rather than continuous, so it is invisible to
 * the inversion-validation contract that covers COLORMAP_DOCS. Re-derive its
 * accuracy from the live MODIS_NDSI_Snow_Cover document instead, and re-check
 * that GIBS's eight non-measurement flag colours still sit outside the
 * probe's no-data threshold.
 *
 * A GIBS re-render that shifts the ramp, or a legend edit that drifts from
 * it, must fail here — the previous blue → white gradient rejected all 100
 * published ramp colours as no-data while decoding Fill as 100 % snow, and
 * nothing in CI noticed.
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

describe("snow-cover legend ↔ live GIBS ramp", () => {
  it("still inverts the published ramp and rejects every flag", async () => {
    const xml = await fetchColormap(SNOW_COVER_COLORMAP_DOC);
    const entries = parseSnowCoverRampEntries(xml);
    const flags = parseSnowCoverFlagColors(xml);

    expect(
      entries.length,
      `${SNOW_COVER_COLORMAP_DOC} discrete ramp entry count`
    ).toBe(MEASURED_SNOW_COVER_INVERSION.total);

    // The undrawn 0 % is the reason "snow-free" and "unobserved" cannot be
    // separated in a rendered tile; assert GIBS still renders it transparent
    // rather than trusting the note in src/lib/snowCoverRamp.ts.
    expect(
      /<ColorMapEntry[^>]*sourceValue="\[0\]"[^>]*transparent="true"|<ColorMapEntry[^>]*transparent="true"[^>]*sourceValue="\[0\]"/.test(
        xml
      ),
      "percent 0 is still rendered transparent"
    ).toBe(true);

    expect(
      flags,
      "classification flags drifted; update SNOW_COVER_FLAG_COLORS"
    ).toEqual([...SNOW_COVER_FLAG_COLORS]);

    const audit = auditSnowCoverInversion(entries, flags);

    expect(
      audit.nulls,
      `${audit.nulls} live ramp colours now invert to no-data`
    ).toBe(MEASURED_SNOW_COVER_INVERSION.nulls);
    expect(audit.monotone, "recovered percent must rise with the ramp").toBe(
      true
    );
    expect(
      audit.rmse,
      `snow inversion RMSE drifted: ${MEASURED_SNOW_COVER_INVERSION.rmse} → ${audit.rmse?.toFixed(2)} (update src/lib/snowCoverRamp.ts and METHODS.md)`
    ).toBeCloseTo(MEASURED_SNOW_COVER_INVERSION.rmse, 1);
    expect(audit.worstAbsError).toBeLessThanOrEqual(
      MEASURED_SNOW_COVER_INVERSION.worstAbsError
    );

    expect(
      audit.decodedFlags,
      "flag colours must never decode to a snow percentage"
    ).toEqual([]);
    expect(
      audit.tightestFlagDistance,
      `nearest flag is ${audit.tightestFlagDistance.toFixed(1)} from the legend gradient (threshold ${NO_DATA_DISTANCE})`
    ).toBeGreaterThan(NO_DATA_DISTANCE);
  });
});
