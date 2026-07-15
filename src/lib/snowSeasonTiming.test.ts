import { describe, expect, it } from "vitest";
import { LAYERS } from "./timeline";
import {
  SNOW_COVER_DATASET,
  SNOW_COVER_LIMITATIONS,
  type SnowCoverObservation,
} from "./snowCover";
import { SNOW_PRESENT_THRESHOLD_PERCENT } from "./snowCoverPersistence";
import {
  SNOW_SEASON_TIMING_LIMITATIONS,
  describeSnowSeasonTiming,
} from "./snowSeasonTiming";

const AVAILABLE_THROUGH = { year: 2026, month: 6 };

/** Build a consecutive run starting at `start` from a list of percentages. */
function run(
  start: { year: number; month: number },
  percents: readonly (number | null)[]
): SnowCoverObservation[] {
  return percents.map((snowCoveredPercent, index) => ({
    dataMonth: {
      year: start.year + Math.floor((start.month - 1 + index) / 12),
      month: ((start.month - 1 + index) % 12) + 1,
    },
    snowCoveredPercent,
  }));
}

describe("describeSnowSeasonTiming provenance", () => {
  it("cites MOD10CM and carries the snow-cover limitations", () => {
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 9 }, [0, 20, 60, 40, 0]),
      AVAILABLE_THROUGH
    );
    expect(timing.dataset).toBe(LAYERS.snow.dataset);
    expect(timing.dataset).toBe(SNOW_COVER_DATASET);
    expect(timing.isForecast).toBe(false);
    // The timing caveats are a strict superset of the single-month ones.
    for (const limitation of SNOW_COVER_LIMITATIONS) {
      expect(timing.limitations).toContain(limitation);
    }
    expect(timing.limitations).toBe(SNOW_SEASON_TIMING_LIMITATIONS);
  });

  it("defaults the present threshold to the patchy extent floor", () => {
    expect(SNOW_PRESENT_THRESHOLD_PERCENT).toBe(5);
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 9 }, [0, 20, 60, 40, 0]),
      AVAILABLE_THROUGH
    );
    expect(timing.presentThresholdPercent).toBe(SNOW_PRESENT_THRESHOLD_PERCENT);
  });
});

describe("describeSnowSeasonTiming onset and melt-out", () => {
  it("locates the onset up-crossing and melt-out down-crossing of one season", () => {
    // Sep absent -> Oct present (onset) ... Dec present -> Jan absent (melt-out).
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 9 }, [0, 20, 60, 40, 0, 0]),
      AVAILABLE_THROUGH
    );
    expect(timing.status).toBe("available");
    expect(timing.onsetMonth).toEqual({ year: 2024, month: 10 });
    expect(timing.meltOutMonth).toEqual({ year: 2025, month: 1 });
    expect(timing.snowPresentAtStart).toBe(false);
    expect(timing.snowPresentAtEnd).toBe(false);
    expect(timing.presentEpisodeCount).toBe(1);
    expect(timing.hasMultiplePresentEpisodes).toBe(false);
    expect(timing.reason).toBeNull();
  });

  it("uses the threshold as an at-or-above floor for the crossing", () => {
    // Exactly at the floor counts as present, so the crossing is at that month.
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 10 }, [0, SNOW_PRESENT_THRESHOLD_PERCENT, 0]),
      AVAILABLE_THROUGH
    );
    expect(timing.onsetMonth).toEqual({ year: 2024, month: 11 });
    expect(timing.meltOutMonth).toEqual({ year: 2024, month: 12 });
  });

  it("honors an overridden present threshold", () => {
    // With a 50% floor, the 20% and 40% months are absent; only 60% is present.
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 9 }, [0, 20, 60, 40, 0]),
      AVAILABLE_THROUGH,
      { presentThresholdPercent: 50 }
    );
    expect(timing.presentThresholdPercent).toBe(50);
    expect(timing.onsetMonth).toEqual({ year: 2024, month: 11 });
    expect(timing.meltOutMonth).toEqual({ year: 2024, month: 12 });
    expect(timing.presentEpisodeCount).toBe(1);
  });
});

describe("describeSnowSeasonTiming censoring", () => {
  it("left-censors an onset present at the window start", () => {
    const timing = describeSnowSeasonTiming(
      run({ year: 2025, month: 1 }, [70, 40, 0]),
      AVAILABLE_THROUGH
    );
    expect(timing.snowPresentAtStart).toBe(true);
    expect(timing.snowPresentAtEnd).toBe(false);
    expect(timing.onsetMonth).toBeNull();
    expect(timing.meltOutMonth).toEqual({ year: 2025, month: 3 });
    expect(timing.presentEpisodeCount).toBe(1);
    expect(timing.reason).toBeNull();
  });

  it("right-censors a melt-out still present at the window end", () => {
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 10 }, [0, 30, 80]),
      AVAILABLE_THROUGH
    );
    expect(timing.snowPresentAtStart).toBe(false);
    expect(timing.snowPresentAtEnd).toBe(true);
    expect(timing.onsetMonth).toEqual({ year: 2024, month: 11 });
    expect(timing.meltOutMonth).toBeNull();
  });

  it("reports present-throughout when every month clears the floor", () => {
    const timing = describeSnowSeasonTiming(
      run({ year: 2025, month: 1 }, [60, 70, 80]),
      AVAILABLE_THROUGH
    );
    expect(timing.snowPresentAtStart).toBe(true);
    expect(timing.snowPresentAtEnd).toBe(true);
    expect(timing.onsetMonth).toBeNull();
    expect(timing.meltOutMonth).toBeNull();
    expect(timing.presentEpisodeCount).toBe(1);
    expect(timing.hasMultiplePresentEpisodes).toBe(false);
    expect(timing.reason).toBe("present-throughout-window");
  });

  it("reports no-snow-present when the floor is never reached", () => {
    const timing = describeSnowSeasonTiming(
      run({ year: 2025, month: 6 }, [0, 1, 0, 2]),
      AVAILABLE_THROUGH
    );
    expect(timing.status).toBe("available");
    expect(timing.onsetMonth).toBeNull();
    expect(timing.meltOutMonth).toBeNull();
    expect(timing.presentEpisodeCount).toBe(0);
    expect(timing.snowPresentAtStart).toBe(false);
    expect(timing.snowPresentAtEnd).toBe(false);
    expect(timing.reason).toBe("no-snow-present");
  });
});

describe("describeSnowSeasonTiming multiple episodes", () => {
  it("flags more than one present span and brackets the outer crossings", () => {
    // present -> absent -> present -> absent: two episodes.
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 10 }, [0, 40, 0, 50, 0]),
      AVAILABLE_THROUGH
    );
    expect(timing.presentEpisodeCount).toBe(2);
    expect(timing.hasMultiplePresentEpisodes).toBe(true);
    // First up-crossing (Nov) and last down-crossing (Feb) bracket the window.
    expect(timing.onsetMonth).toEqual({ year: 2024, month: 11 });
    expect(timing.meltOutMonth).toEqual({ year: 2025, month: 2 });
  });
});

describe("describeSnowSeasonTiming gaps and coverage", () => {
  it("skips no-data months and locates crossings on the usable subsequence", () => {
    // The interior null is dropped; the onset is read across the gap.
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 9 }, [0, null, 60, 0]),
      AVAILABLE_THROUGH
    );
    expect(timing.observedMonths).toBe(4);
    expect(timing.usableMonths).toBe(3);
    expect(timing.hasGaps).toBe(true);
    expect(timing.isConsecutiveRun).toBe(true);
    expect(timing.onsetMonth).toEqual({ year: 2024, month: 11 });
    expect(timing.meltOutMonth).toEqual({ year: 2024, month: 12 });
  });

  it("marks a non-consecutive supplied sequence", () => {
    const scattered: SnowCoverObservation[] = [
      { dataMonth: { year: 2024, month: 10 }, snowCoveredPercent: 0 },
      { dataMonth: { year: 2024, month: 12 }, snowCoveredPercent: 60 },
    ];
    const timing = describeSnowSeasonTiming(scattered, AVAILABLE_THROUGH);
    expect(timing.isConsecutiveRun).toBe(false);
    // Crossings are still read in supplied order across the usable months.
    expect(timing.onsetMonth).toEqual({ year: 2024, month: 12 });
  });

  it("returns no-usable-months when nothing is published or usable", () => {
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 10 }, [null, null]),
      AVAILABLE_THROUGH
    );
    expect(timing.status).toBe("no-usable-months");
    expect(timing.usableMonths).toBe(0);
    expect(timing.onsetMonth).toBeNull();
    expect(timing.meltOutMonth).toBeNull();
    expect(timing.snowPresentAtStart).toBeNull();
    expect(timing.snowPresentAtEnd).toBeNull();
    expect(timing.reason).toBe("no-usable-months");
  });

  it("returns no-observations for an empty run", () => {
    const timing = describeSnowSeasonTiming([], AVAILABLE_THROUGH);
    expect(timing.status).toBe("no-usable-months");
    expect(timing.observedMonths).toBe(0);
    expect(timing.reason).toBe("no-observations");
  });

  it("drops future unpublished months from the usable subsequence", () => {
    // AVAILABLE_THROUGH is 2026-06; the 2026-08 month is unpublished.
    const timing = describeSnowSeasonTiming(
      [
        { dataMonth: { year: 2026, month: 5 }, snowCoveredPercent: 40 },
        { dataMonth: { year: 2026, month: 6 }, snowCoveredPercent: 0 },
        { dataMonth: { year: 2026, month: 8 }, snowCoveredPercent: 70 },
      ],
      AVAILABLE_THROUGH
    );
    expect(timing.observedMonths).toBe(3);
    expect(timing.usableMonths).toBe(2);
    expect(timing.hasGaps).toBe(true);
    expect(timing.snowPresentAtStart).toBe(true);
    expect(timing.snowPresentAtEnd).toBe(false);
    expect(timing.meltOutMonth).toEqual({ year: 2026, month: 6 });
  });
});

describe("describeSnowSeasonTiming validation", () => {
  it("rejects an out-of-range present threshold", () => {
    const timing = describeSnowSeasonTiming(
      run({ year: 2024, month: 10 }, [0, 60, 0]),
      AVAILABLE_THROUGH,
      { presentThresholdPercent: 150 }
    );
    expect(timing.status).toBe("unavailable");
    expect(timing.reason).toBe("invalid-threshold");
    expect(timing.presentThresholdPercent).toBe(SNOW_PRESENT_THRESHOLD_PERCENT);
    expect(timing.onsetMonth).toBeNull();
    expect(timing.meltOutMonth).toBeNull();
  });
});
