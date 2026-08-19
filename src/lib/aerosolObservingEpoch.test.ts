import { describe, expect, it } from "vitest";
import { AEROSOL_SOURCE } from "./aerosolLoading";
import {
  AEROSOL_OBSERVING_EPOCHS,
  aerosolObservingEpochForMonth,
  describeAerosolObservingHomogeneity,
  aerosolObservingEpochClause,
  probeAerosolObservingEpoch,
  formatAerosolObservingHomogeneity,
} from "./aerosolObservingEpoch";
import {
  DATA_LATEST,
  LAYERS,
  compareYm,
  monthRangeForLayer,
  type YearMonth,
} from "./timeline";

/** Every July from `startYear` to `endYear` inclusive — a baseline's months. */
function julys(startYear: number, endYear: number): YearMonth[] {
  const months: YearMonth[] = [];
  for (let year = startYear; year <= endYear; year++) {
    months.push({ year, month: 7 });
  }
  return months;
}

describe("MERRA-2 aerosol observing-system epochs", () => {
  it("covers the aerosol layer's record contiguously from its first month", () => {
    // The epoch table is only trustworthy if it leaves no month unclassified
    // between the layer's start and today; a hole would silently return null.
    expect(AEROSOL_OBSERVING_EPOCHS[0].firstMonth).toEqual(
      LAYERS.aerosol.start
    );
    expect(
      AEROSOL_OBSERVING_EPOCHS[AEROSOL_OBSERVING_EPOCHS.length - 1].lastMonth
    ).toBeNull();

    for (let i = 1; i < AEROSOL_OBSERVING_EPOCHS.length; i++) {
      const previous = AEROSOL_OBSERVING_EPOCHS[i - 1];
      const current = AEROSOL_OBSERVING_EPOCHS[i];
      expect(previous.lastMonth).not.toBeNull();
      // Each epoch begins the month after the previous one ends.
      const expected =
        previous.lastMonth!.month === 12
          ? { year: previous.lastMonth!.year + 1, month: 1 }
          : {
              year: previous.lastMonth!.year,
              month: previous.lastMonth!.month + 1,
            };
      expect(current.firstMonth).toEqual(expected);
      expect(compareYm(previous.firstMonth, current.firstMonth)).toBeLessThan(
        0
      );
    }
  });

  it("records that only the pre-EOS epoch lacks an over-land AOD constraint", () => {
    // This flag is the module's load-bearing claim; pin it against a silent flip.
    expect(
      AEROSOL_OBSERVING_EPOCHS.filter((e) => !e.aodConstrainedOverLand).map(
        (e) => e.id
      )
    ).toEqual(["pre-eos"]);
  });

  it.each([
    [{ year: 1980, month: 1 }, "pre-eos"],
    [{ year: 1999, month: 12 }, "pre-eos"],
    [{ year: 2000, month: 1 }, "eos-transition"],
    [{ year: 2002, month: 12 }, "eos-transition"],
    [{ year: 2003, month: 1 }, "eos"],
    [{ year: 2026, month: 3 }, "eos"],
  ])("places %o in the %s epoch", (month, id) => {
    expect(aerosolObservingEpochForMonth(month)?.id).toBe(id);
  });

  it.each([
    ["a month before the product record", { year: 1979, month: 12 }],
    ["a month index out of range", { year: 2010, month: 13 }],
    ["a non-integer month", { year: 2010, month: 6.5 }],
  ])("states no epoch for %s", (_label, month) => {
    expect(aerosolObservingEpochForMonth(month)).toBeNull();
  });
});

describe("aerosol observing-system homogeneity of a span", () => {
  it("calls a span inside one epoch homogeneous", () => {
    const result = describeAerosolObservingHomogeneity(julys(2010, 2024));

    expect(result).not.toBeNull();
    expect(result!.homogeneous).toBe(true);
    expect(result!.crossesTransition).toBe(false);
    expect(result!.includesUnconstrainedOverLand).toBe(false);
    expect(result!.spans).toHaveLength(1);
    expect(result!.spans[0].epoch.id).toBe("eos");
    expect(result!.spans[0].monthCount).toBe(15);
    expect(result!.monthCount).toBe(15);
    expect(result!.caveat).toContain("not affected by an assimilation change");
  });

  it("flags a baseline that reaches back before EOS", () => {
    // The exact shape of a 1980-anchored same-calendar-month baseline, which is
    // what the aerosol layer's 1980 start invites a caller to build.
    const result = describeAerosolObservingHomogeneity(julys(1980, 2024));

    expect(result!.homogeneous).toBe(false);
    expect(result!.crossesTransition).toBe(true);
    expect(result!.includesUnconstrainedOverLand).toBe(true);
    expect(result!.spans.map((span) => span.epoch.id)).toEqual([
      "pre-eos",
      "eos-transition",
      "eos",
    ]);
    // 1980-1999, 2000-2002, 2003-2024.
    expect(result!.spans.map((span) => span.monthCount)).toEqual([20, 3, 22]);
    expect(result!.caveat).toContain(
      "may reflect the change in assimilated observations"
    );
    expect(result!.caveat).toContain("unconstrained by observations");
  });

  it("flags a transition crossing that never reaches the pre-EOS epoch", () => {
    // Terra-era into the Terra+Aqua backbone: still not homogeneous, but the
    // over-land constraint gap does not apply and must not be claimed.
    const result = describeAerosolObservingHomogeneity(julys(2001, 2006));

    expect(result!.crossesTransition).toBe(true);
    expect(result!.includesUnconstrainedOverLand).toBe(false);
    expect(result!.spans.map((span) => span.epoch.id)).toEqual([
      "eos-transition",
      "eos",
    ]);
    expect(result!.caveat).not.toContain("unconstrained by observations");
  });

  it("describes a wholly pre-EOS span as internally consistent but unconstrained over land", () => {
    const result = describeAerosolObservingHomogeneity(julys(1985, 1995));

    expect(result!.homogeneous).toBe(true);
    expect(result!.crossesTransition).toBe(false);
    // Homogeneous and yet still carrying the over-land caveat: the two are
    // independent claims and one must not suppress the other.
    expect(result!.includesUnconstrainedOverLand).toBe(true);
    expect(result!.caveat).toContain("reflect the underlying model");
    expect(result!.caveat).toContain("internally consistent");
  });

  it("needs no consecutive run and accepts months in any order", () => {
    // A same-calendar-month baseline is deliberately full of gaps.
    const result = describeAerosolObservingHomogeneity([
      { year: 2015, month: 7 },
      { year: 1998, month: 3 },
      { year: 2004, month: 11 },
    ]);

    expect(result!.firstMonth).toEqual({ year: 1998, month: 3 });
    expect(result!.lastMonth).toEqual({ year: 2015, month: 7 });
    expect(result!.spans.map((span) => span.epoch.id)).toEqual([
      "pre-eos",
      "eos",
    ]);
  });

  it("counts a repeated month once so it cannot inflate an epoch's weight", () => {
    const result = describeAerosolObservingHomogeneity([
      { year: 2010, month: 7 },
      { year: 2010, month: 7 },
      { year: 1990, month: 7 },
    ]);

    expect(result!.monthCount).toBe(2);
    expect(result!.spans.map((span) => span.monthCount)).toEqual([1, 1]);
  });

  it("reports each epoch's own first and last supplied month", () => {
    const result = describeAerosolObservingHomogeneity(julys(1997, 2005));

    expect(result!.spans[0]).toMatchObject({
      firstMonth: { year: 1997, month: 7 },
      lastMonth: { year: 1999, month: 7 },
    });
    expect(result!.spans[1]).toMatchObject({
      firstMonth: { year: 2000, month: 7 },
      lastMonth: { year: 2002, month: 7 },
    });
    expect(result!.spans[2]).toMatchObject({
      firstMonth: { year: 2003, month: 7 },
      lastMonth: { year: 2005, month: 7 },
    });
  });

  it("preserves the cited aerosol product and never claims a forecast", () => {
    const result = describeAerosolObservingHomogeneity(julys(2010, 2012));

    expect(result!.source).toEqual(AEROSOL_SOURCE);
    expect(result!.isForecast).toBe(false);
  });

  it.each([
    ["an empty span", []],
    ["a span containing a month before the record", [{ year: 1979, month: 6 }]],
    [
      "a span whose other months are valid",
      [
        { year: 2010, month: 7 },
        { year: 1979, month: 6 },
      ],
    ],
    ["a malformed month", [{ year: 2010, month: 0 }]],
  ])("states nothing for %s", (_label, months) => {
    // Refusing the whole call matters for the third case: classifying only the
    // usable months would understate what the span actually contains.
    expect(describeAerosolObservingHomogeneity(months)).toBeNull();
  });

  it("does not mutate or alias the caller's months", () => {
    const month = { year: 2010, month: 7 };
    const result = describeAerosolObservingHomogeneity([month]);
    month.year = 1990;

    expect(result!.firstMonth).toEqual({ year: 2010, month: 7 });
  });
});

describe("aerosol observing-epoch readout", () => {
  it("names the window, the epochs, and the cited source", () => {
    const text = formatAerosolObservingHomogeneity(
      describeAerosolObservingHomogeneity(julys(1998, 2004))!
    );

    expect(text).toContain("1998-07-2004-07");
    expect(text).toContain("7 months across 3 observing-system epochs");
    expect(text).toContain("pre-EOS");
    expect(text).toContain(`Source ${AEROSOL_SOURCE.shortName}`);
    expect(text).toContain(
      "may reflect the change in assimilated observations"
    );
  });

  it("singularizes a one-month span", () => {
    const text = formatAerosolObservingHomogeneity(
      describeAerosolObservingHomogeneity([{ year: 2010, month: 7 }])!
    );

    expect(text).toContain("1 month across one observing-system epoch");
    expect(text).toContain("(1 month)");
  });
});

describe("probe observing-epoch gate", () => {
  const testable = { testable: true };

  it("classifies only the aerosol layer", () => {
    const months = julys(1998, 2004);

    expect(probeAerosolObservingEpoch("aerosol", months)).not.toBeNull();
    // Same MERRA-2 stream, entirely different observing system: air
    // temperature must not inherit an aerosol assimilation history.
    expect(probeAerosolObservingEpoch("airtemp", months)).toBeNull();
    expect(probeAerosolObservingEpoch("ndvi", months)).toBeNull();
    expect(probeAerosolObservingEpoch(undefined, months)).toBeNull();
  });

  it("stays null for an empty series", () => {
    expect(probeAerosolObservingEpoch("aerosol", [])).toBeNull();
  });

  it("qualifies a trend fitted across the EOS transition", () => {
    const clause = aerosolObservingEpochClause(
      probeAerosolObservingEpoch("aerosol", julys(1998, 2004)),
      testable
    );

    expect(clause).toContain("1998-2004 record spans 3 MERRA-2");
    expect(clause).toContain("pre-EOS");
    expect(clause).toContain("not attributable to the atmosphere alone");
    expect(clause).toContain("over land the earliest of those had no");
    expect(clause).toContain(
      `source ${AEROSOL_SOURCE.shortName} v${AEROSOL_SOURCE.version}`
    );
  });

  it("drops the land arm when the span starts after EOS began", () => {
    // 2000-2004 crosses the transition but never reaches the ocean-only epoch,
    // so the clause must not claim an unconstrained land column it does not have.
    const clause = aerosolObservingEpochClause(
      probeAerosolObservingEpoch("aerosol", julys(2000, 2004)),
      testable
    );

    expect(clause).toContain("spans 2 MERRA-2");
    expect(clause).not.toContain("over land the earliest");
  });

  it("is silent for a span inside one epoch", () => {
    expect(
      aerosolObservingEpochClause(
        probeAerosolObservingEpoch("aerosol", julys(2005, 2020)),
        testable
      )
    ).toBeNull();
  });

  it("is silent when no trend was fitted", () => {
    // Nothing on the line reads across the transition, so there is no claim
    // to qualify — the clause must not appear merely because the record is long.
    expect(
      aerosolObservingEpochClause(
        probeAerosolObservingEpoch("aerosol", julys(1998, 2004)),
        { testable: false }
      )
    ).toBeNull();
  });

  it("is silent for every non-aerosol layer even across the same months", () => {
    expect(
      aerosolObservingEpochClause(
        probeAerosolObservingEpoch("airtemp", julys(1998, 2004)),
        testable
      )
    ).toBeNull();
  });

  it("speaks for the record the probe actually enumerates", () => {
    // The probe hands over monthRangeForLayer(aerosol), which runs from the
    // layer's first published month — so this clause is not a hypothetical:
    // every aerosol probe with a testable trend crosses all three epochs.
    const clause = aerosolObservingEpochClause(
      probeAerosolObservingEpoch("aerosol", monthRangeForLayer(LAYERS.aerosol)),
      testable
    );

    expect(clause).toContain(
      `${LAYERS.aerosol.start.year}-${(LAYERS.aerosol.latest ?? DATA_LATEST).year} record spans 3 MERRA-2`
    );
  });
});
