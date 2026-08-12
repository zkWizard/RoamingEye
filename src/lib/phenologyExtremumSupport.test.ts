import { describe, expect, it } from "vitest";
import {
  NDVI_SOURCE,
  NDVI_UNIT,
  summarizeAnnualNdviPhenology,
  type NdviAnnualPhenology,
  type NdviMonthlyObservation,
} from "./phenology";
import {
  NDVI_EXTREMUM_SUPPORT_LIMITATIONS,
  formatNdviExtremumSupport,
  summarizeNdviExtremumSupport,
} from "./phenologyExtremumSupport";

/** Build one year of month/ndvi pairs at a fixed year. */
function yearOf(
  year: number,
  months: readonly (readonly [number, number])[]
): NdviMonthlyObservation[] {
  return months.map(([month, ndvi]) => ({ month: { year, month }, ndvi }));
}

/**
 * A northern-hemisphere cycle peaking in July and troughing in January, with
 * every calendar month observed.
 */
function fullCycle(year: number): NdviMonthlyObservation[] {
  return yearOf(year, [
    [1, 0.11],
    [2, 0.14],
    [3, 0.22],
    [4, 0.38],
    [5, 0.55],
    [6, 0.71],
    [7, 0.82],
    [8, 0.7],
    [9, 0.5],
    [10, 0.33],
    [11, 0.2],
    [12, 0.13],
  ]);
}

const NORTH = 45;
const SOUTH = -33;

describe("NDVI annual extremum support", () => {
  it("brackets an extremum whose adjacent months were both observed", () => {
    // July peak flanked by June and August; the trough sits in a mid-year
    // month here so that neither extremum lands on the calendar-year edge.
    const annuals = summarizeAnnualNdviPhenology(
      yearOf(2024, [
        [2, 0.4],
        [3, 0.3],
        [4, 0.12],
        [5, 0.3],
        [6, 0.71],
        [7, 0.82],
        [8, 0.7],
      ]),
      NORTH
    );
    const summary = summarizeNdviExtremumSupport(annuals);

    expect(summary.status).toBe("available");
    expect(summary.years).toHaveLength(1);
    expect(summary.years[0].peak).toMatchObject({
      month: { year: 2024, month: 7 },
      status: "bracketed",
      unobservedFlankMonths: [],
      isAtYearWindowEdge: false,
    });
    expect(summary.years[0].trough).toMatchObject({
      month: { year: 2024, month: 4 },
      status: "bracketed",
    });
    expect(summary.years[0].isFullySupported).toBe(true);
    expect(summary.fullySupportedYearCount).toBe(1);
  });

  it("names the unobserved neighbour that could hold a more extreme value", () => {
    // August is absent, so the observed July peak is not established: the
    // unobserved month sits directly on the falling limb beside it.
    const annuals = summarizeAnnualNdviPhenology(
      yearOf(2024, [
        [2, 0.4],
        [3, 0.3],
        [4, 0.12],
        [5, 0.3],
        [6, 0.71],
        [7, 0.82],
        [9, 0.5],
      ]),
      NORTH
    );
    const summary = summarizeNdviExtremumSupport(annuals);

    expect(summary.years[0].peak).toMatchObject({
      month: { year: 2024, month: 7 },
      status: "flank-gap",
      unobservedFlankMonths: [{ year: 2024, month: 8 }],
      isAtYearWindowEdge: false,
    });
    // The trough is still bracketed; support is assessed per extremum.
    expect(summary.years[0].trough.status).toBe("bracketed");
    expect(summary.years[0].isFullySupported).toBe(false);
    expect(summary.peakTally).toEqual({
      bracketed: 0,
      flankGap: 1,
      windowEdge: 0,
    });
    expect(summary.troughTally).toEqual({
      bracketed: 1,
      flankGap: 0,
      windowEdge: 0,
    });
  });

  it("treats a month supplied but unusable as an unobserved flank", () => {
    // A supplied no-data month is not an observation, so it cannot bracket.
    const annuals = summarizeAnnualNdviPhenology(
      [
        ...yearOf(2024, [
          [2, 0.4],
          [3, 0.3],
          [4, 0.12],
          [5, 0.3],
          [6, 0.71],
          [7, 0.82],
        ]),
        { month: { year: 2024, month: 8 }, ndvi: null },
      ],
      NORTH
    );
    const summary = summarizeNdviExtremumSupport(annuals);

    expect(summary.years[0].peak.status).toBe("flank-gap");
    expect(summary.years[0].peak.unobservedFlankMonths).toEqual([
      { year: 2024, month: 8 },
    ]);
  });

  it("reports both unobserved flanks when an extremum is isolated", () => {
    const annuals = summarizeAnnualNdviPhenology(
      yearOf(2024, [
        [2, 0.4],
        [3, 0.3],
        [5, 0.9],
        [7, 0.12],
        [9, 0.4],
        [10, 0.35],
      ]),
      NORTH
    );
    const summary = summarizeNdviExtremumSupport(annuals);

    expect(summary.years[0].peak).toMatchObject({
      month: { year: 2024, month: 5 },
      status: "flank-gap",
      unobservedFlankMonths: [
        { year: 2024, month: 4 },
        { year: 2024, month: 6 },
      ],
    });
    expect(summary.years[0].trough.unobservedFlankMonths).toEqual([
      { year: 2024, month: 6 },
      { year: 2024, month: 8 },
    ]);
  });

  it("marks a January or December extremum as unbounded by the calendar window", () => {
    // A complete northern-hemisphere year: the July peak is bracketed, but the
    // January trough is on the window edge even though February was observed.
    const summary = summarizeNdviExtremumSupport(
      summarizeAnnualNdviPhenology(fullCycle(2024), NORTH)
    );

    expect(summary.years[0].peak.status).toBe("bracketed");
    expect(summary.years[0].trough).toMatchObject({
      month: { year: 2024, month: 1 },
      status: "window-edge",
      // December 2023 lies outside this annual summary, not merely missing.
      unobservedFlankMonths: [],
      isAtYearWindowEdge: true,
    });
    expect(summary.years[0].isFullySupported).toBe(false);
  });

  it("keeps the in-window gap visible when an edge extremum also has one", () => {
    // December peak: November is inside the year and unobserved, January of the
    // next year is outside it. Both conditions are reported.
    const annuals = summarizeAnnualNdviPhenology(
      yearOf(2024, [
        [4, 0.3],
        [5, 0.12],
        [6, 0.3],
        [7, 0.4],
        [9, 0.5],
        [12, 0.9],
      ]),
      NORTH
    );
    const summary = summarizeNdviExtremumSupport(annuals);

    expect(summary.years[0].peak).toMatchObject({
      month: { year: 2024, month: 12 },
      status: "window-edge",
      unobservedFlankMonths: [{ year: 2024, month: 11 }],
      isAtYearWindowEdge: true,
    });
  });

  it("shows a southern-hemisphere peak landing on the window edge every year", () => {
    // The southern growing season straddles the new year, so a calendar-year
    // window cuts through the peak. This is the normal case there, not a fault.
    const southernYear = (year: number) =>
      yearOf(year, [
        [1, 0.78],
        [2, 0.7],
        [3, 0.55],
        [4, 0.4],
        [5, 0.28],
        [6, 0.18],
        [7, 0.14],
        [8, 0.2],
        [9, 0.33],
        [10, 0.48],
        [11, 0.62],
        [12, 0.74],
      ]);
    const summary = summarizeNdviExtremumSupport(
      summarizeAnnualNdviPhenology(
        [...southernYear(2023), ...southernYear(2024)],
        SOUTH
      )
    );

    expect(summary.hemisphere).toBe("southern");
    expect(summary.peakTally).toEqual({
      bracketed: 0,
      flankGap: 0,
      windowEdge: 2,
    });
    // The mid-year trough is fully observed in both years.
    expect(summary.troughTally).toEqual({
      bracketed: 2,
      flankGap: 0,
      windowEdge: 0,
    });
    expect(summary.fullySupportedYearCount).toBe(0);
  });

  it("counts a sparse year as unusable rather than unsupported", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [
        ...fullCycle(2023),
        ...yearOf(2024, [
          [6, 0.7],
          [7, 0.8],
        ]),
      ],
      NORTH
    );
    const summary = summarizeNdviExtremumSupport(annuals);

    expect(summary.coverage).toMatchObject({
      suppliedYearCount: 2,
      usableYearCount: 1,
      unusableYearCount: 1,
    });
    expect(summary.years.map(({ year }) => year)).toEqual([2023]);
    // Tallies count assessed years only, so they sum to usableYearCount.
    const { bracketed, flankGap, windowEdge } = summary.peakTally;
    expect(bracketed + flankGap + windowEdge).toBe(1);
  });

  it("orders years oldest to newest whatever order they arrive in", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [...fullCycle(2024), ...fullCycle(2022), ...fullCycle(2023)],
      NORTH
    );
    const summary = summarizeNdviExtremumSupport(annuals);

    expect(summary.years.map(({ year }) => year)).toEqual([2022, 2023, 2024]);
    expect(summary.coverage.usableYearCount).toBe(3);
  });

  it("rejects duplicate, malformed, and incompatible annual records", () => {
    const [base] = summarizeAnnualNdviPhenology(fullCycle(2024), NORTH);
    const [other] = summarizeAnnualNdviPhenology(fullCycle(2023), NORTH);
    const summary = summarizeNdviExtremumSupport([
      base,
      { ...base },
      { ...other, year: 2023.5 },
      { ...other, hemisphere: "southern" },
      {
        ...other,
        source: { ...NDVI_SOURCE, doi: "10.5067/OTHER" },
      },
    ]);

    expect(summary.coverage).toMatchObject({
      suppliedYearCount: 5,
      usableYearCount: 1,
      duplicateYearCount: 1,
      invalidYearCount: 1,
      incompatibleContextCount: 2,
    });
  });

  it("reports no usable years honestly instead of an empty assessment", () => {
    const summary = summarizeNdviExtremumSupport([]);

    expect(summary).toMatchObject({
      status: "no-usable-years",
      reason: "no-usable-years",
      hemisphere: "unknown",
      fullySupportedYearCount: 0,
      peakTally: { bracketed: 0, flankGap: 0, windowEdge: 0 },
    });
    // Provenance is never dropped, even with nothing to assess.
    expect(summary.source).toEqual(NDVI_SOURCE);
    expect(summary.unit).toBe(NDVI_UNIT);
    expect(formatNdviExtremumSupport(summary)).toContain(
      "No NDVI extremum support assessed"
    );
  });

  it("carries dataset provenance and forecast disclaimers through", () => {
    const summary = summarizeNdviExtremumSupport(
      summarizeAnnualNdviPhenology(fullCycle(2024), NORTH)
    );

    expect(summary.kind).toBe("observed-ndvi-extremum-support");
    expect(summary.isForecast).toBe(false);
    expect(summary.source).toEqual(NDVI_SOURCE);
    expect(summary.unit).toBe(NDVI_UNIT);
  });

  it("does not count a stray neighbouring-year month as an observed flank", () => {
    // A record whose validMonths leak an adjacent year must not bracket month 7.
    const [base] = summarizeAnnualNdviPhenology(
      yearOf(2024, [
        [2, 0.4],
        [3, 0.3],
        [4, 0.12],
        [5, 0.3],
        [7, 0.82],
        [9, 0.5],
      ]),
      NORTH
    );
    const leaked: NdviAnnualPhenology = {
      ...base,
      coverage: {
        ...base.coverage,
        validMonths: [
          ...base.coverage.validMonths,
          { year: 2023, month: 6 },
          { year: 2023, month: 8 },
        ],
      },
    };
    const summary = summarizeNdviExtremumSupport([leaked]);

    expect(summary.years[0].peak).toMatchObject({
      status: "flank-gap",
      unobservedFlankMonths: [
        { year: 2024, month: 6 },
        { year: 2024, month: 8 },
      ],
    });
  });

  it("formats a readout that does not present a gap as a wrong measurement", () => {
    const text = formatNdviExtremumSupport(
      summarizeNdviExtremumSupport(
        summarizeAnnualNdviPhenology(fullCycle(2024), NORTH)
      )
    );

    expect(text).toContain("0/1 year(s)");
    expect(text).toContain("MOD13A3 v061");
    expect(text).toContain("not an established annual extremum");
  });

  it("states its scope limits for callers to surface", () => {
    expect(NDVI_EXTREMUM_SUPPORT_LIMITATIONS.length).toBeGreaterThanOrEqual(5);
    const joined = NDVI_EXTREMUM_SUPPORT_LIMITATIONS.join(" ");
    expect(joined).toContain("sampling");
    expect(joined).toContain("green-up or senescence date");
  });
});
