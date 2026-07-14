import { describe, expect, it } from "vitest";
import { LAYERS } from "./timeline";
import {
  SNOW_COVER_DATASET,
  SNOW_COVER_LIMITATIONS,
  type SnowCoverObservation,
} from "./snowCover";
import {
  SNOW_COVER_PERSISTENCE_LIMITATIONS,
  SNOW_PRESENT_THRESHOLD_PERCENT,
  describeSnowCoverPersistence,
} from "./snowCoverPersistence";

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

describe("describeSnowCoverPersistence provenance", () => {
  it("cites MOD10CM and carries the snow-cover limitations", () => {
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [20, 45, 70]),
      AVAILABLE_THROUGH
    );
    expect(persistence.dataset).toBe(LAYERS.snow.dataset);
    expect(persistence.dataset).toBe(SNOW_COVER_DATASET);
    expect(persistence.isForecast).toBe(false);
    // The persistence caveats are a strict superset of the single-month ones.
    for (const limitation of SNOW_COVER_LIMITATIONS) {
      expect(persistence.limitations).toContain(limitation);
    }
    expect(persistence.limitations).toBe(SNOW_COVER_PERSISTENCE_LIMITATIONS);
  });

  it("defaults the present threshold to the patchy extent floor", () => {
    expect(SNOW_PRESENT_THRESHOLD_PERCENT).toBe(5);
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [20, 45, 70]),
      AVAILABLE_THROUGH
    );
    expect(persistence.presentThresholdPercent).toBe(
      SNOW_PRESENT_THRESHOLD_PERCENT
    );
  });
});

describe("describeSnowCoverPersistence tallies", () => {
  it("counts every usable month present when all clear the threshold", () => {
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 11 }, [20, 60, 90, 40]),
      AVAILABLE_THROUGH
    );
    expect(persistence.status).toBe("available");
    expect(persistence.observedMonths).toBe(4);
    expect(persistence.usableMonths).toBe(4);
    expect(persistence.snowPresentMonths).toBe(4);
    expect(persistence.snowPresentFraction).toBe(1);
    expect(persistence.isConsecutiveRun).toBe(true);
    expect(persistence.hasGaps).toBe(false);
    expect(persistence.reason).toBeNull();
  });

  it("excludes months below the present threshold from the tally", () => {
    // 2 and 0 sit under the 5% patchy floor; 30 and 55 are present.
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [0, 2, 30, 55]),
      AVAILABLE_THROUGH
    );
    expect(persistence.usableMonths).toBe(4);
    expect(persistence.snowPresentMonths).toBe(2);
    expect(persistence.snowPresentFraction).toBe(0.5);
  });

  it("treats the threshold as inclusive at its lower bound", () => {
    // Exactly 5% is the patchy floor and counts as present.
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [5, 4.9]),
      AVAILABLE_THROUGH
    );
    expect(persistence.snowPresentMonths).toBe(1);
  });

  it("honours a caller-supplied present threshold", () => {
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [20, 60, 90]),
      AVAILABLE_THROUGH,
      { presentThresholdPercent: 50 }
    );
    expect(persistence.presentThresholdPercent).toBe(50);
    expect(persistence.snowPresentMonths).toBe(2);
    expect(persistence.snowPresentFraction).toBeCloseTo(2 / 3, 12);
  });
});

describe("describeSnowCoverPersistence gaps and coverage", () => {
  it("drops no-data months from the usable subset and flags gaps", () => {
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [40, null, 60]),
      AVAILABLE_THROUGH
    );
    expect(persistence.observedMonths).toBe(3);
    expect(persistence.usableMonths).toBe(2);
    expect(persistence.snowPresentMonths).toBe(2);
    expect(persistence.snowPresentFraction).toBe(1);
    expect(persistence.hasGaps).toBe(true);
    // The supplied months are still a consecutive calendar run despite the gap.
    expect(persistence.isConsecutiveRun).toBe(true);
  });

  it("drops not-yet-published months from the usable subset", () => {
    // Availability ends 2024-11, so the 2024-12 month is unpublished.
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [30, 40, 50]),
      { year: 2024, month: 11 }
    );
    expect(persistence.usableMonths).toBe(2);
    expect(persistence.snowPresentMonths).toBe(2);
    expect(persistence.hasGaps).toBe(true);
  });

  it("ignores an invalid coverage fraction as no data", () => {
    const observations: SnowCoverObservation[] = [
      { dataMonth: { year: 2024, month: 10 }, snowCoveredPercent: 40 },
      {
        dataMonth: { year: 2024, month: 11 },
        snowCoveredPercent: 60,
        validFraction: 1.5,
      },
    ];
    const persistence = describeSnowCoverPersistence(
      observations,
      AVAILABLE_THROUGH
    );
    expect(persistence.usableMonths).toBe(1);
    expect(persistence.snowPresentMonths).toBe(1);
    expect(persistence.snowPresentFraction).toBe(1);
    expect(persistence.hasGaps).toBe(true);
  });

  it("flags a non-consecutive supplied sequence without spanning the gap", () => {
    const observations: SnowCoverObservation[] = [
      { dataMonth: { year: 2024, month: 1 }, snowCoveredPercent: 80 },
      { dataMonth: { year: 2024, month: 6 }, snowCoveredPercent: 0 },
      { dataMonth: { year: 2024, month: 12 }, snowCoveredPercent: 70 },
    ];
    const persistence = describeSnowCoverPersistence(
      observations,
      AVAILABLE_THROUGH
    );
    expect(persistence.isConsecutiveRun).toBe(false);
    // Persistence is still computed over the usable sampled months.
    expect(persistence.usableMonths).toBe(3);
    expect(persistence.snowPresentMonths).toBe(2);
    expect(persistence.snowPresentFraction).toBeCloseTo(2 / 3, 12);
  });
});

describe("describeSnowCoverPersistence honest refusals", () => {
  it("reports no-usable-months when every month is no data", () => {
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [null, null]),
      AVAILABLE_THROUGH
    );
    expect(persistence.status).toBe("no-usable-months");
    expect(persistence.snowPresentMonths).toBeNull();
    expect(persistence.snowPresentFraction).toBeNull();
    expect(persistence.reason).toBe("no-usable-months");
  });

  it("reports no-observations for an empty run", () => {
    const persistence = describeSnowCoverPersistence([], AVAILABLE_THROUGH);
    expect(persistence.status).toBe("no-usable-months");
    expect(persistence.observedMonths).toBe(0);
    expect(persistence.usableMonths).toBe(0);
    expect(persistence.reason).toBe("no-observations");
    // An empty run has no supplied months to break consecutiveness.
    expect(persistence.isConsecutiveRun).toBe(true);
  });

  it("rejects a non-finite present threshold without fabricating a tally", () => {
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [40, 60]),
      AVAILABLE_THROUGH,
      { presentThresholdPercent: Number.NaN }
    );
    expect(persistence.status).toBe("unavailable");
    expect(persistence.reason).toBe("invalid-threshold");
    expect(persistence.snowPresentMonths).toBeNull();
    expect(persistence.snowPresentFraction).toBeNull();
    // The reported threshold falls back to the documented default.
    expect(persistence.presentThresholdPercent).toBe(
      SNOW_PRESENT_THRESHOLD_PERCENT
    );
  });

  it("rejects an out-of-range present threshold", () => {
    const persistence = describeSnowCoverPersistence(
      run({ year: 2024, month: 10 }, [40, 60]),
      AVAILABLE_THROUGH,
      { presentThresholdPercent: 120 }
    );
    expect(persistence.status).toBe("unavailable");
    expect(persistence.reason).toBe("invalid-threshold");
  });
});
