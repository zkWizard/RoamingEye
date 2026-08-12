import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  SST_DEFAULT_DISTANCE_IS_UNSAFE,
  SST_MAX_INVERSION_DISTANCE,
  SST_NO_DATA_RGB,
  SST_NO_DATA_TO_RAMP_DISTANCE,
  colorDistance,
  isSstNoDataColor,
} from "./sstNoData";
import { NO_DATA_DISTANCE, invertColormapEntries } from "./probe";

/**
 * The dark end of NASA's published MODIS_Sea_Surface_Temperature ramp, plus a
 * mid-ramp colour, copied from the live colormap document (read 2026-08-11).
 * The first entry is what a JPEG no-data pixel gets mistaken for.
 */
const SST_RAMP_SAMPLE = [
  { rgb: { r: 45, g: 0, b: 28 }, value: 0.075 }, // 0.00 – 0.15 °C
  { rgb: { r: 48, g: 0, b: 31 }, value: 0.225 }, // 0.15 – 0.30 °C
  { rgb: { r: 51, g: 0, b: 34 }, value: 0.375 }, // 0.30 – 0.45 °C
  { rgb: { r: 232, g: 76, b: 0 }, value: 27.375 }, // 27.30 – 27.45 °C
];

describe("SST no-data separation", () => {
  it("keeps the committed black-to-ramp distance consistent with the ramp", () => {
    // Guards the derivation in sstNoData.ts: if the published ramp's coldest
    // colour ever moves, the committed constant must move with it.
    expect(colorDistance(SST_NO_DATA_RGB, SST_RAMP_SAMPLE[0].rgb)).toBeCloseTo(
      SST_NO_DATA_TO_RAMP_DISTANCE,
      1
    );
  });

  it("documents that the app-wide threshold cannot separate SST no-data", () => {
    expect(SST_DEFAULT_DISTANCE_IS_UNSAFE).toBe(true);
    // The regression this fixes: at the default threshold, GIBS's JPEG black
    // inverts into a plausible near-freezing sea-surface temperature.
    expect(invertColormapEntries(SST_NO_DATA_RGB, SST_RAMP_SAMPLE)).toBe(0.075);
    expect(colorDistance(SST_NO_DATA_RGB, SST_RAMP_SAMPLE[0].rgb)).toBeLessThan(
      NO_DATA_DISTANCE
    );
  });

  it("rejects no-data black at the SST threshold", () => {
    expect(
      invertColormapEntries(
        SST_NO_DATA_RGB,
        SST_RAMP_SAMPLE,
        SST_MAX_INVERSION_DISTANCE
      )
    ).toBeNull();
  });

  it("still accepts published ramp colours, JPEG noise included", () => {
    for (const entry of SST_RAMP_SAMPLE) {
      expect(
        invertColormapEntries(
          entry.rgb,
          SST_RAMP_SAMPLE,
          SST_MAX_INVERSION_DISTANCE
        )
      ).toBe(entry.value);
    }
    // ±10 per channel is the compression noise the app-wide threshold is
    // sized for; the tighter SST threshold must still absorb it.
    const noisy = { r: 232 + 10, g: 76 - 10, b: 0 + 10 };
    expect(
      invertColormapEntries(noisy, SST_RAMP_SAMPLE, SST_MAX_INVERSION_DISTANCE)
    ).toBe(27.375);
  });

  it("leaves margin on both sides of the separation", () => {
    // Below the black-to-ramp distance, so no-data is excluded...
    expect(SST_MAX_INVERSION_DISTANCE).toBeLessThan(
      SST_NO_DATA_TO_RAMP_DISTANCE / 2
    );
    // ...and comfortably above the worst deviation measured for genuine
    // open-ocean pixels (8.1 units; see the derivation in sstNoData.ts).
    expect(SST_MAX_INVERSION_DISTANCE).toBeGreaterThan(8.1 * 2);
  });

  it("flags colours indistinguishable from no-data, not cold water", () => {
    expect(isSstNoDataColor(SST_NO_DATA_RGB)).toBe(true);
    expect(isSstNoDataColor({ r: 8, g: 4, b: 6 })).toBe(true); // JPEG-smeared black
    expect(isSstNoDataColor(SST_RAMP_SAMPLE[0].rgb)).toBe(false);
    expect(isSstNoDataColor(SST_RAMP_SAMPLE[3].rgb)).toBe(false);
  });
});

/**
 * Drift guard for METHODS.md §2, matching the §3 guard in methods-doc.test.ts:
 * the handbook quotes this module's separation and threshold, so a future edit
 * to either has to update the documented method rather than leave it rotting.
 */
describe("METHODS.md SST no-data section", () => {
  const methods = readFileSync(
    new URL("../../METHODS.md", import.meta.url),
    "utf8"
  );

  it("quotes the committed separation and threshold", () => {
    expect(methods).toContain("No-data separation (sea surface temperature)");
    expect(methods).toContain(SST_NO_DATA_TO_RAMP_DISTANCE.toFixed(1));
    expect(methods).toContain(`**${SST_MAX_INVERSION_DISTANCE}**-unit`);
  });

  it("keeps the honest reading of a rejected pixel", () => {
    expect(methods).toContain("the product reports no SST");
  });
});
