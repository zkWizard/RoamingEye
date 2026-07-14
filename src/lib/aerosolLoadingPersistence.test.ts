import { describe, expect, it } from "vitest";
import { LAYERS, type YearMonth } from "./timeline";
import {
  AEROSOL_LOADING_LIMITATIONS,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  type AerosolObservation,
} from "./aerosolLoading";
import {
  AEROSOL_LOADING_PERSISTENCE_LIMITATIONS,
  describeAerosolLoadingPersistence,
} from "./aerosolLoadingPersistence";

const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/** Build a consecutive monthly run of AOD values starting at `start`. */
function run(
  start: YearMonth,
  values: readonly (number | null)[]
): AerosolObservation[] {
  return values.map((value, index) => ({
    dataMonth: {
      year: start.year + Math.floor((start.month - 1 + index) / 12),
      month: ((start.month - 1 + index) % 12) + 1,
    },
    value,
  }));
}

describe("describeAerosolLoadingPersistence provenance", () => {
  it("cites MERRA-2 and carries the aerosol limitations as a superset", () => {
    const persistence = describeAerosolLoadingPersistence(
      run({ year: 2025, month: 9 }, [0.25, 0.3, 0.28]),
      AVAILABLE_THROUGH
    );
    expect(persistence.source).toBe(LAYERS.aerosol.dataset);
    expect(persistence.wavelengthNm).toBe(AEROSOL_WAVELENGTH_NM);
    expect(persistence.unit).toBe(AEROSOL_UNIT);
    expect(persistence.isForecast).toBe(false);
    for (const limitation of AEROSOL_LOADING_LIMITATIONS) {
      expect(persistence.limitations).toContain(limitation);
    }
    expect(persistence.limitations).toBe(
      AEROSOL_LOADING_PERSISTENCE_LIMITATIONS
    );
  });

  it("keeps one summary per supplied observation in order", () => {
    const observations = run({ year: 2025, month: 9 }, [0.05, 0.15, 0.3]);
    const persistence = describeAerosolLoadingPersistence(
      observations,
      AVAILABLE_THROUGH
    );
    expect(persistence.summaries).toHaveLength(3);
    expect(persistence.summaries.map((s) => s.dataMonth)).toEqual(
      observations.map((o) => o.dataMonth)
    );
  });
});

describe("describeAerosolLoadingPersistence run length", () => {
  it("counts a full-window run when every month holds one tier", () => {
    // 0.25 / 0.30 / 0.40 all fall in the moderate band [0.2, 0.5).
    const persistence = describeAerosolLoadingPersistence(
      run({ year: 2025, month: 9 }, [0.25, 0.3, 0.4]),
      AVAILABLE_THROUGH
    );
    expect(persistence.status).toBe("available");
    expect(persistence.currentCategory).toBe("moderate");
    expect(persistence.currentTierRunLength).toBe(3);
    expect(persistence.currentRunStartMonth).toEqual({ year: 2025, month: 9 });
    expect(persistence.latestUsableMonth).toEqual({ year: 2025, month: 11 });
    expect(persistence.isConsecutiveRun).toBe(true);
    expect(persistence.hasGaps).toBe(false);
  });

  it("stops the run at a tier change, keeping only the recent streak", () => {
    // low, low, moderate, moderate: current tier (moderate) run is 2.
    const persistence = describeAerosolLoadingPersistence(
      run({ year: 2025, month: 8 }, [0.12, 0.15, 0.25, 0.3]),
      AVAILABLE_THROUGH
    );
    expect(persistence.currentCategory).toBe("moderate");
    expect(persistence.currentTierRunLength).toBe(2);
    expect(persistence.currentRunStartMonth).toEqual({ year: 2025, month: 10 });
    expect(persistence.usableMonths).toBe(4);
  });

  it("reports a run of 1 when the prior month held a different tier", () => {
    const persistence = describeAerosolLoadingPersistence(
      run({ year: 2025, month: 10 }, [0.3, 0.6]),
      AVAILABLE_THROUGH
    );
    expect(persistence.currentCategory).toBe("high");
    expect(persistence.currentTierRunLength).toBe(1);
    expect(persistence.currentRunStartMonth).toEqual({ year: 2025, month: 11 });
  });
});

describe("describeAerosolLoadingPersistence gaps and coverage", () => {
  it("breaks the calendar-adjacent run across a no-data month", () => {
    // moderate, no-data, moderate: latest is usable but the gap severs the run.
    const persistence = describeAerosolLoadingPersistence(
      run({ year: 2025, month: 9 }, [0.3, null, 0.35]),
      AVAILABLE_THROUGH
    );
    expect(persistence.usableMonths).toBe(2);
    expect(persistence.hasGaps).toBe(true);
    expect(persistence.currentCategory).toBe("moderate");
    // The intervening null month is not calendar-adjacent skip-free, so the run
    // ending at the latest month is length 1, never bridged to 2.
    expect(persistence.currentTierRunLength).toBe(1);
    expect(persistence.currentRunStartMonth).toEqual({ year: 2025, month: 11 });
  });

  it("breaks the run across a non-consecutive supplied gap", () => {
    // Sep and Nov 2025 only (Oct omitted from the supplied window).
    const persistence = describeAerosolLoadingPersistence(
      [
        { dataMonth: { year: 2025, month: 9 }, value: 0.3 },
        { dataMonth: { year: 2025, month: 11 }, value: 0.32 },
      ],
      AVAILABLE_THROUGH
    );
    expect(persistence.isConsecutiveRun).toBe(false);
    expect(persistence.currentTierRunLength).toBe(1);
  });

  it("excludes a not-yet-published month from the usable subset", () => {
    // Latest month is Feb 2026, one month past AVAILABLE_THROUGH (Jan 2026).
    const persistence = describeAerosolLoadingPersistence(
      run({ year: 2025, month: 12 }, [0.3, 0.31, 0.32]),
      AVAILABLE_THROUGH
    );
    expect(persistence.usableMonths).toBe(2);
    expect(persistence.hasGaps).toBe(true);
    // The most-recent *usable* month is Jan 2026, not the unpublished Feb.
    expect(persistence.latestUsableMonth).toEqual({ year: 2026, month: 1 });
    expect(persistence.currentTierRunLength).toBe(2);
  });

  it("drops an out-of-range coverage month from the run", () => {
    const persistence = describeAerosolLoadingPersistence(
      [
        { dataMonth: { year: 2025, month: 9 }, value: 0.3 },
        { dataMonth: { year: 2025, month: 10 }, value: 0.3, validFraction: 2 },
        { dataMonth: { year: 2025, month: 11 }, value: 0.31 },
      ],
      AVAILABLE_THROUGH
    );
    expect(persistence.usableMonths).toBe(2);
    expect(persistence.hasGaps).toBe(true);
    // The invalid-coverage Oct breaks adjacency, so the Nov run is length 1.
    expect(persistence.currentTierRunLength).toBe(1);
  });
});

describe("describeAerosolLoadingPersistence tenure", () => {
  it("tallies usable months per tier, most months first", () => {
    // very-low, low, moderate, moderate, moderate.
    const persistence = describeAerosolLoadingPersistence(
      run({ year: 2025, month: 7 }, [0.05, 0.15, 0.25, 0.3, 0.35]),
      AVAILABLE_THROUGH
    );
    expect(persistence.tierTenure).toEqual([
      {
        category: "moderate",
        label: "moderate column loading",
        months: 3,
        fractionOfUsableMonths: 3 / 5,
      },
      {
        category: "very-low",
        label: "very low column loading",
        months: 1,
        fractionOfUsableMonths: 1 / 5,
      },
      {
        category: "low",
        label: "low column loading",
        months: 1,
        fractionOfUsableMonths: 1 / 5,
      },
    ]);
  });

  it("breaks tenure ties by clean-to-loaded order", () => {
    // One very-low, one high: equal counts resolve to the cleaner tier first.
    const persistence = describeAerosolLoadingPersistence(
      run({ year: 2025, month: 11 }, [0.05, 0.6]),
      AVAILABLE_THROUGH
    );
    expect(persistence.tierTenure.map((t) => t.category)).toEqual([
      "very-low",
      "high",
    ]);
  });
});

describe("describeAerosolLoadingPersistence empty and unusable inputs", () => {
  it("reports no-usable-months for an empty series", () => {
    const persistence = describeAerosolLoadingPersistence(
      [],
      AVAILABLE_THROUGH
    );
    expect(persistence.status).toBe("no-usable-months");
    expect(persistence.observedMonths).toBe(0);
    expect(persistence.usableMonths).toBe(0);
    expect(persistence.currentCategory).toBeNull();
    expect(persistence.currentTierRunLength).toBe(0);
    expect(persistence.currentRunStartMonth).toBeNull();
    expect(persistence.latestUsableMonth).toBeNull();
    expect(persistence.tierTenure).toEqual([]);
    expect(persistence.reason).toBe("no-observations");
  });

  it("reports no-usable-months when every month is no-data", () => {
    const persistence = describeAerosolLoadingPersistence(
      run({ year: 2025, month: 9 }, [null, null]),
      AVAILABLE_THROUGH
    );
    expect(persistence.status).toBe("no-usable-months");
    expect(persistence.observedMonths).toBe(2);
    expect(persistence.usableMonths).toBe(0);
    expect(persistence.hasGaps).toBe(true);
    expect(persistence.reason).toBe("no-usable-months");
  });
});
