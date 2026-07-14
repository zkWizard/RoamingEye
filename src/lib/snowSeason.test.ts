import { describe, expect, it } from "vitest";
import { LAYERS } from "./timeline";
import {
  SNOW_COVER_DATASET,
  SNOW_COVER_LIMITATIONS,
  SNOW_SEASON_CHANGE_THRESHOLD_PP,
  type SnowCoverObservation,
} from "./snowCover";
import {
  SNOW_SEASON_SERIES_LIMITATIONS,
  describeSnowSeasonSeries,
} from "./snowSeason";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

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

describe("describeSnowSeasonSeries provenance", () => {
  it("cites MOD10CM and carries the snow-cover limitations", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 10 }, [20, 45, 70]),
      AVAILABLE_THROUGH
    );
    expect(series.dataset).toBe(LAYERS.snow.dataset);
    expect(series.dataset).toBe(SNOW_COVER_DATASET);
    expect(series.isForecast).toBe(false);
    // The series caveats are a strict superset of the single-month ones.
    for (const limitation of SNOW_COVER_LIMITATIONS) {
      expect(series.limitations).toContain(limitation);
    }
    expect(series.limitations).toBe(SNOW_SEASON_SERIES_LIMITATIONS);
  });
});

describe("describeSnowSeasonSeries shapes", () => {
  it("labels a steady rise as advancing and reports net change", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 10 }, [20, 45, 70]),
      AVAILABLE_THROUGH
    );
    expect(series.status).toBe("available");
    expect(series.progression).toBe("advancing");
    expect(series.netChangePercentPoints).toBe(50);
    expect(series.peak).toEqual({
      dataMonth: { year: 2024, month: 12 },
      snowCoveredPercent: 70,
    });
    expect(series.trough).toEqual({
      dataMonth: { year: 2024, month: 10 },
      snowCoveredPercent: 20,
    });
    expect(series.amplitudePercentPoints).toBe(50);
    expect(series.usableMonths).toBe(3);
    expect(series.observedMonths).toBe(3);
    expect(series.hasGaps).toBe(false);
  });

  it("labels a steady decline as retreating", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2025, month: 3 }, [85, 60, 25]),
      AVAILABLE_THROUGH
    );
    expect(series.progression).toBe("retreating");
    expect(series.netChangePercentPoints).toBe(-60);
  });

  it("labels a rise then retreat as a peak", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 11 }, [30, 90, 40]),
      AVAILABLE_THROUGH
    );
    expect(series.progression).toBe("peak");
    expect(series.peak?.dataMonth).toEqual({ year: 2024, month: 12 });
    expect(series.peak?.snowCoveredPercent).toBe(90);
    expect(series.netChangePercentPoints).toBe(10);
    expect(series.amplitudePercentPoints).toBe(60);
  });

  it("labels a decline then recovery as a trough", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2025, month: 2 }, [80, 30, 75]),
      AVAILABLE_THROUGH
    );
    expect(series.progression).toBe("trough");
    expect(series.trough?.snowCoveredPercent).toBe(30);
  });

  it("labels sub-threshold wobble as steady", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2025, month: 1 }, [70, 72, 69, 71]),
      AVAILABLE_THROUGH
    );
    expect(series.progression).toBe("steady");
    // Amplitude is real but every adjacent step is inside the flat band.
    expect(series.amplitudePercentPoints).toBe(3);
  });

  it("labels multiple significant reversals as mixed", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 9 }, [20, 60, 25, 65]),
      AVAILABLE_THROUGH
    );
    expect(series.progression).toBe("mixed");
  });

  it("ignores a sub-threshold dip between two rises", () => {
    // 20 -> 55 (rise) -> 52 (flat, |Δ|=3 < 5) -> 80 (rise): one sign run.
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 10 }, [20, 55, 52, 80]),
      AVAILABLE_THROUGH
    );
    expect(series.progression).toBe("advancing");
  });
});

describe("describeSnowSeasonSeries gaps and coverage", () => {
  it("skips an interior no-data month but still describes the shape", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 10 }, [20, null, 70]),
      AVAILABLE_THROUGH
    );
    expect(series.status).toBe("available");
    expect(series.progression).toBe("advancing");
    expect(series.observedMonths).toBe(3);
    expect(series.usableMonths).toBe(2);
    expect(series.hasGaps).toBe(true);
    expect(series.netChangePercentPoints).toBe(50);
  });

  it("drops unpublished future months from the usable subsequence", () => {
    // availableThrough is 2026-01, so 2026-02 is not yet published.
    const series = describeSnowSeasonSeries(
      run({ year: 2025, month: 12 }, [60, 80, 90]),
      AVAILABLE_THROUGH
    );
    expect(series.observedMonths).toBe(3);
    expect(series.usableMonths).toBe(2);
    expect(series.hasGaps).toBe(true);
    expect(series.summaries[2].publicationStatus).toBe("not-yet-published");
    expect(series.summaries[2].snowCoveredPercent).toBeNull();
  });

  it("is insufficient when fewer than two months are usable", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 10 }, [20, null, null]),
      AVAILABLE_THROUGH
    );
    expect(series.status).toBe("insufficient-usable-months");
    expect(series.reason).toBe("fewer-than-two-usable");
    expect(series.progression).toBeNull();
    expect(series.netChangePercentPoints).toBeNull();
  });
});

describe("describeSnowSeasonSeries validation", () => {
  it("rejects a non-consecutive supplied run", () => {
    const observations: SnowCoverObservation[] = [
      { dataMonth: { year: 2025, month: 1 }, snowCoveredPercent: 60 },
      { dataMonth: { year: 2025, month: 3 }, snowCoveredPercent: 80 },
    ];
    const series = describeSnowSeasonSeries(observations, AVAILABLE_THROUGH);
    expect(series.status).toBe("non-consecutive-months");
    expect(series.reason).toBe("months-not-consecutive");
    expect(series.progression).toBeNull();
  });

  it("crosses a year boundary as one consecutive run", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 11 }, [40, 70, 95]),
      AVAILABLE_THROUGH
    );
    expect(series.summaries.map((s) => s.dataMonth.month)).toEqual([11, 12, 1]);
    expect(series.status).toBe("available");
    expect(series.progression).toBe("advancing");
  });

  it("requires at least two observations", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2025, month: 1 }, [60]),
      AVAILABLE_THROUGH
    );
    expect(series.status).toBe("insufficient-usable-months");
    expect(series.reason).toBe("fewer-than-two-observations");
  });

  it("rejects an invalid threshold and falls back to the default", () => {
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 10 }, [20, 45, 70]),
      AVAILABLE_THROUGH,
      { thresholdPercentPoints: -1 }
    );
    expect(series.status).toBe("unavailable");
    expect(series.reason).toBe("invalid-threshold");
    expect(series.thresholdPercentPoints).toBe(SNOW_SEASON_CHANGE_THRESHOLD_PP);
  });

  it("honors a custom threshold band", () => {
    // With a 15pp band the 10pp steps are flat, so the season reads steady.
    const series = describeSnowSeasonSeries(
      run({ year: 2024, month: 10 }, [50, 60, 70]),
      AVAILABLE_THROUGH,
      { thresholdPercentPoints: 15 }
    );
    expect(series.progression).toBe("steady");
    expect(series.thresholdPercentPoints).toBe(15);
  });
});
