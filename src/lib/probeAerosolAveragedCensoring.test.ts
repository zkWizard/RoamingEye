import { describe, expect, it } from "vitest";
import {
  aerosolAveragedCensoringClause,
  averagedAerosolCensoringNote,
  summarizeProbeAerosolAveragedCensoring,
} from "./probeAerosolAveragedCensoring";
import {
  AEROSOL_PROBE_DECODE_CEILING,
  probeAerosolCeilingCensoring,
} from "./probeAerosolCeilingCensoring";
import { LAYER_ORDER } from "./timeline";

/** Decoded values either side of the ramp's open top bin. */
const CAPPED = AEROSOL_PROBE_DECODE_CEILING;
const INTERIOR = 0.21;

const uncensored = probeAerosolCeilingCensoring("aerosol", [
  INTERIOR,
  0.34,
  0.18,
]);
const censored = probeAerosolCeilingCensoring("aerosol", [INTERIOR, CAPPED]);
const empty = probeAerosolCeilingCensoring("aerosol", [null, null]);

describe("summarizeProbeAerosolAveragedCensoring", () => {
  it("never claims detectability or a renderable mark, applicable or not", () => {
    for (const summary of [
      summarizeProbeAerosolAveragedCensoring("drawn-region", uncensored),
      summarizeProbeAerosolAveragedCensoring("drawn-region", censored),
      summarizeProbeAerosolAveragedCensoring(null, uncensored),
    ]) {
      expect(summary.pixelCensoringDetectable).toBe(false);
      expect(summary.boundMarkClaimable).toBe(false);
      expect(summary.airQualityObservation).toBe(false);
      expect(summary.isForecast).toBe(false);
    }
  });

  it("is inapplicable for a point probe even on a censored series", () => {
    const summary = summarizeProbeAerosolAveragedCensoring(null, censored);
    expect(summary.applicable).toBe(false);
    expect(summary.combination).toBeNull();
    expect(summary.markedMonthCount).toBe(0);
    expect(summary.biasDirectionIfPresent).toBeNull();
  });

  it("is inapplicable when the footprint returned nothing", () => {
    expect(
      summarizeProbeAerosolAveragedCensoring("drawn-region", empty).applicable
    ).toBe(false);
  });

  it("counts the months the end-cap screen marked", () => {
    expect(
      summarizeProbeAerosolAveragedCensoring("sampled-area", censored)
        .markedMonthCount
    ).toBe(1);
    expect(
      summarizeProbeAerosolAveragedCensoring("sampled-area", uncensored)
        .markedMonthCount
    ).toBe(0);
  });

  it("names the combination and the one-sided bias only when it applies", () => {
    const summary = summarizeProbeAerosolAveragedCensoring(
      "drawn-region",
      uncensored
    );
    expect(summary.combination).toBe("area-weighted-mean-of-per-pixel-decodes");
    // The ramp is open at its top only, so a hidden cap can bias one way only.
    expect(summary.biasDirectionIfPresent).toBe("understates");
  });
});

describe("averagedAerosolCensoringNote", () => {
  it("stays silent for a point probe and an absent footprint", () => {
    expect(averagedAerosolCensoringNote(null, censored)).toBeNull();
    expect(averagedAerosolCensoringNote(undefined, uncensored)).toBeNull();
  });

  it("stays silent for every layer but aerosol", () => {
    for (const layerId of LAYER_ORDER) {
      if (layerId === "aerosol") continue;
      const other = probeAerosolCeilingCensoring(layerId, [INTERIOR, CAPPED]);
      expect(averagedAerosolCensoringNote("drawn-region", other)).toBeNull();
      expect(averagedAerosolCensoringNote("sampled-area", other)).toBeNull();
    }
  });

  it("stays silent for an averaged footprint that returned nothing", () => {
    expect(averagedAerosolCensoringNote("drawn-region", empty)).toBeNull();
  });

  it("qualifies an unmarked averaged series as not established uncensored", () => {
    const note = averagedAerosolCensoringNote("drawn-region", uncensored) ?? "";
    expect(note).toContain("weighted mean of per-pixel decodes");
    expect(note).toContain(
      "not evidence the drawn region held no capped pixel"
    );
    // The sibling clause is silent without a mark, so this one names the cap.
    expect(note).toContain("AOD 0.900 at 550 nm");
    // The one thing that IS knowable: which way an unseen cap would push it.
    expect(note).toContain("understate the true loading");
  });

  it("corrects the marks themselves when the screen did fire", () => {
    const note = averagedAerosolCensoringNote("sampled-area", censored) ?? "";
    expect(note).toContain("screen the sampled area's monthly means");
    // Averaging dilutes a plume narrower than the footprint, so surviving
    // marks undercount rather than enumerate the censoring.
    expect(note).toContain("narrower than the sampled area");
    expect(note).toContain("only have lowered the value");
  });

  it("names the published colormap it is a statement about", () => {
    for (const censoring of [uncensored, censored]) {
      expect(averagedAerosolCensoringNote("drawn-region", censoring)).toContain(
        "colormap"
      );
    }
  });

  it("renders no inequality on any number, in either wording", () => {
    for (const censoring of [uncensored, censored]) {
      const note =
        averagedAerosolCensoringNote("drawn-region", censoring) ?? "";
      expect(note).not.toContain("≥");
      expect(note).not.toContain("≤");
    }
  });

  it("labels the footprint the user actually chose", () => {
    expect(averagedAerosolCensoringNote("drawn-region", uncensored)).toContain(
      "drawn region"
    );
    expect(averagedAerosolCensoringNote("sampled-area", uncensored)).toContain(
      "sampled area"
    );
  });

  it("agrees with the summary it is built from", () => {
    const summary = summarizeProbeAerosolAveragedCensoring(
      "drawn-region",
      censored
    );
    expect(aerosolAveragedCensoringClause(summary, censored)).toBe(
      averagedAerosolCensoringNote("drawn-region", censored)
    );
  });
});
