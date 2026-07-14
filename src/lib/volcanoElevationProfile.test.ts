import { describe, expect, it } from "vitest";
import type { Volcano } from "./volcanoes";
import {
  ELEVATION_REGIME_ORDER,
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
