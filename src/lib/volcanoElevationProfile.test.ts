import { describe, expect, it } from "vitest";
import type { Volcano } from "./volcanoes";
import {
  ELEVATION_REGIME_ORDER,
  summitDatumText,
  tallyElevationRegimes,
  volcanoElevationProfile,
} from "./volcanoElevationProfile";

const volcano = (overrides: Partial<Volcano> = {}): Volcano => ({
  name: "Etna",
  lat: 37.75,
  lon: 15,
  type: "Stratovolcano",
  elevation: 3357,
  lastEruptionYear: 2025,
  country: "Italy",
  ...overrides,
});

describe("volcanoElevationProfile", () => {
  it("summarizes the summit-elevation distribution with GVP provenance", () => {
    // Elevations 100, 200, 300, 400, 500 → clean R-7 quantiles.
    const profile = volcanoElevationProfile([
      volcano({ name: "A", elevation: 300 }),
      volcano({ name: "B", elevation: 100 }),
      volcano({ name: "C", elevation: 500 }),
      volcano({ name: "D", elevation: 200 }),
      volcano({ name: "E", elevation: 400 }),
    ]);

    expect(profile).toMatchObject({
      kind: "gvp-volcano-elevation-profile",
      isForecast: false,
      volcanoCount: 5,
      elevationCount: 5,
      quantiles: {
        min: 100,
        q1: 200,
        median: 300,
        q3: 400,
        max: 500,
        iqr: 200,
      },
      regimeCounts: { subaerial: 5, "sea-level": 0, submarine: 0, unknown: 0 },
      provenance: {
        org: "Smithsonian Institution Global Volcanism Program",
      },
      units: { elevation: "metres relative to sea level" },
    });
  });

  it("is order-independent — sorts before computing quantiles", () => {
    const ascending = volcanoElevationProfile([
      volcano({ elevation: 100 }),
      volcano({ elevation: 200 }),
      volcano({ elevation: 300 }),
    ]);
    const shuffled = volcanoElevationProfile([
      volcano({ elevation: 300 }),
      volcano({ elevation: 100 }),
      volcano({ elevation: 200 }),
    ]);
    expect(shuffled.quantiles).toEqual(ascending.quantiles);
    expect(ascending.quantiles).toMatchObject({
      min: 100,
      median: 200,
      max: 300,
    });
  });

  it("interpolates interior quantiles between the two nearest ranks (R-7)", () => {
    // Four values 0,10,20,30: rank = 3·p. q1 rank 0.75 → 7.5; q3 rank 2.25 → 22.5.
    const profile = volcanoElevationProfile([
      volcano({ elevation: 0 }),
      volcano({ elevation: 10 }),
      volcano({ elevation: 20 }),
      volcano({ elevation: 30 }),
    ]);
    expect(profile.quantiles).toMatchObject({
      min: 0,
      q1: 7.5,
      median: 15,
      q3: 22.5,
      max: 30,
      iqr: 15,
    });
  });

  it("keeps negative submarine elevations as signed metres below the datum", () => {
    // A mix that straddles sea level: -1000, -900, 0, 1500.
    const profile = volcanoElevationProfile([
      volcano({ name: "Seamount", elevation: -1000 }),
      volcano({ name: "Bank", elevation: -900 }),
      volcano({ name: "Atoll", elevation: 0 }),
      volcano({ name: "Peak", elevation: 1500 }),
    ]);
    expect(profile.quantiles?.min).toBe(-1000);
    expect(profile.quantiles?.max).toBe(1500);
    // Median of -1000,-900,0,1500 (rank 1.5) → −900 + 0.5·(0 − −900) = −450.
    expect(profile.quantiles?.median).toBe(-450);
    expect(profile.regimeCounts).toEqual({
      subaerial: 1,
      "sea-level": 1,
      submarine: 2,
      unknown: 0,
    });
  });

  it("counts a single-record set with a zero-width interquartile range", () => {
    const profile = volcanoElevationProfile([volcano({ elevation: 2500 })]);
    expect(profile.quantiles).toEqual({
      min: 2500,
      q1: 2500,
      median: 2500,
      q3: 2500,
      max: 2500,
      iqr: 0,
    });
  });

  it("excludes missing/non-finite elevations from quantiles but still counts them as unknown", () => {
    const profile = volcanoElevationProfile([
      volcano({ name: "Known", elevation: 800 }),
      volcano({ name: "NoElev", elevation: null }),
      volcano({ name: "Nan", elevation: Number.NaN }),
    ]);
    expect(profile.volcanoCount).toBe(3);
    expect(profile.elevationCount).toBe(1);
    expect(profile.quantiles).toMatchObject({ min: 800, max: 800, iqr: 0 });
    expect(profile.regimeCounts).toEqual({
      subaerial: 1,
      "sea-level": 0,
      submarine: 0,
      unknown: 2,
    });
  });

  it("makes an empty input explicit without inventing a distribution", () => {
    const profile = volcanoElevationProfile([]);
    expect(profile.volcanoCount).toBe(0);
    expect(profile.elevationCount).toBe(0);
    expect(profile.quantiles).toBeNull();
    expect(profile.regimeCounts).toEqual({
      subaerial: 0,
      "sea-level": 0,
      submarine: 0,
      unknown: 0,
    });
  });

  it("keeps the regime tally summing to the supplied record count", () => {
    const records = [
      volcano({ elevation: 1200 }),
      volcano({ elevation: -50 }),
      volcano({ elevation: 0 }),
      volcano({ elevation: null }),
    ];
    const profile = volcanoElevationProfile(records);
    const tallied = ELEVATION_REGIME_ORDER.reduce(
      (sum, regime) => sum + profile.regimeCounts[regime],
      0
    );
    expect(tallied).toBe(records.length);
  });

  it("orders regimes high-to-low datum position for deterministic iteration", () => {
    expect(ELEVATION_REGIME_ORDER).toEqual([
      "subaerial",
      "sea-level",
      "submarine",
      "unknown",
    ]);
  });

  it("carries honest limitations that disclaim relief, prominence, and hazard", () => {
    const { limitations } = volcanoElevationProfile([volcano()]);
    const joined = limitations.join(" ").toLowerCase();
    expect(joined).toContain("relief");
    expect(joined).toContain("prominence");
    expect(joined).toContain("hazard");
    // Discloses the R-7 quantile convention it shares with the depth profile.
    expect(joined).toContain("r-7");
  });
});

describe("tallyElevationRegimes", () => {
  it("buckets signed elevations by datum position", () => {
    expect(tallyElevationRegimes([1500, 0, -55, -1410])).toEqual({
      subaerial: 1,
      "sea-level": 1,
      submarine: 2,
      unknown: 0,
    });
  });

  it("counts missing and non-finite elevations as unknown rather than dropping them", () => {
    const counts = tallyElevationRegimes([
      800,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]);
    expect(counts).toEqual({
      subaerial: 1,
      "sea-level": 0,
      submarine: 0,
      unknown: 3,
    });
    const tallied = ELEVATION_REGIME_ORDER.reduce(
      (sum, regime) => sum + counts[regime],
      0
    );
    expect(tallied).toBe(4);
  });

  it("agrees with the profile's own tally over the same records", () => {
    const records = [
      volcano({ elevation: 1200 }),
      volcano({ elevation: -50 }),
      volcano({ elevation: 0 }),
      volcano({ elevation: null }),
    ];
    expect(tallyElevationRegimes(records.map((r) => r.elevation))).toEqual(
      volcanoElevationProfile(records).regimeCounts
    );
  });

  it("makes an empty input explicit with a zeroed tally", () => {
    expect(tallyElevationRegimes([])).toEqual({
      subaerial: 0,
      "sea-level": 0,
      submarine: 0,
      unknown: 0,
    });
  });
});

describe("summitDatumText", () => {
  const counts = (
    subaerial: number,
    seaLevel: number,
    submarine: number,
    unknown = 0
  ) => ({ subaerial, "sea-level": seaLevel, submarine, unknown });

  it("names submarine summits as below the datum, not as negative heights", () => {
    expect(summitDatumText(counts(3, 0, 2))).toBe(
      "Of the 5 reported summit elevations, 3 above sea level and 2 below it (submarine summits)."
    );
  });

  it("reads a wholly submarine set without implying any land summit", () => {
    const text = summitDatumText(counts(0, 0, 4));
    expect(text).toBe(
      "Of the 4 reported summit elevations, 4 below it (submarine summits)."
    );
    expect(text).not.toContain("above sea level");
  });

  it("uses a serial comma when all three datum positions are present", () => {
    expect(summitDatumText(counts(2, 1, 1))).toBe(
      "Of the 4 reported summit elevations, 2 above sea level, 1 at the 0 m datum, and 1 below it (submarine summit)."
    );
  });

  it("agrees singular for a single reported summit", () => {
    expect(summitDatumText(counts(0, 0, 1))).toBe(
      "Of the 1 reported summit elevation, 1 below it (submarine summit)."
    );
  });

  it("stays silent when every reported summit is subaerial", () => {
    // The plain "metres relative to sea level" reading already says this.
    expect(summitDatumText(counts(6, 0, 0))).toBeNull();
  });

  it("stays silent when no record reported a finite elevation", () => {
    expect(summitDatumText(counts(0, 0, 0, 7))).toBeNull();
    expect(summitDatumText(counts(0, 0, 0))).toBeNull();
  });

  it("counts only reported elevations, excluding the unknown bucket", () => {
    // 9 supplied records, 3 of them without a usable elevation.
    expect(summitDatumText(counts(4, 0, 2, 3))).toContain(
      "Of the 6 reported summit elevations"
    );
  });
});
