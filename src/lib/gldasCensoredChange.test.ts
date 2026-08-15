import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate, type ClimateMetricId } from "./climate";
import { climateInsightText } from "./meteorology";
import {
  summarizeGldasRampSaturation,
  type GldasRampSamplePosition,
} from "./gldasRampSaturation";
import {
  describeGldasCensoredChange,
  gldasCensoredChangeNote,
  gldasChangeIsStated,
} from "./gldasCensoredChange";

const AVAILABLE_THROUGH = { year: 2026, month: 5 };

/** A published monthly observation of a GLDAS metric with the given coverage. */
function month(
  monthNumber: number,
  value: number | null,
  validFraction?: number,
  metricId: ClimateMetricId = "precipitation-rate"
) {
  return summarizeMonthlyClimate(
    {
      metricId,
      dataMonth: { year: 2026, month: monthNumber },
      value,
      ...(validFraction === undefined ? {} : { validFraction }),
    },
    AVAILABLE_THROUGH
  );
}

/** A saturation summary with `ceiling` capped cells out of `total` sampled. */
function saturation(ceiling: number, total: number) {
  const positions: GldasRampSamplePosition[] = [
    ...Array<GldasRampSamplePosition>(ceiling).fill("at-or-above-ceiling"),
    ...Array<GldasRampSamplePosition>(total - ceiling).fill("interior"),
  ];
  return summarizeGldasRampSaturation("precip", positions);
}

describe("describeGldasCensoredChange", () => {
  it("bounds the change from below when only the later month capped", () => {
    const change = describeGldasCensoredChange({
      earlier: month(4, 2.0e-5),
      later: month(5, 3.0e-5),
      earlierSaturation: saturation(0, 40),
      laterSaturation: saturation(6, 40),
    });

    expect(change?.direction).toBe("lower-bound");
    expect(change?.earlierCeilingCount).toBe(0);
    expect(change?.laterCeilingCount).toBe(6);
    expect(change?.isForecast).toBe(false);
  });

  it("bounds the change from above when only the earlier month capped", () => {
    const change = describeGldasCensoredChange({
      earlier: month(4, 2.0e-5),
      later: month(5, 3.0e-5),
      earlierSaturation: saturation(9, 40),
      laterSaturation: saturation(0, 40),
    });

    expect(change?.direction).toBe("upper-bound");
  });

  it("claims no direction when both endpoints capped", () => {
    // A difference of two lower bounds: the bias can go either way, so no
    // bound is asserted in either direction.
    const change = describeGldasCensoredChange({
      earlier: month(4, 2.0e-5),
      later: month(5, 3.0e-5),
      earlierSaturation: saturation(4, 40),
      laterSaturation: saturation(6, 40),
    });

    expect(change?.direction).toBe("undetermined");
  });

  it("is null when neither month reached the cap", () => {
    expect(
      describeGldasCensoredChange({
        earlier: month(4, 2.0e-5),
        later: month(5, 3.0e-5),
        earlierSaturation: saturation(0, 40),
        laterSaturation: saturation(0, 40),
      })
    ).toBeNull();
  });

  it("treats an unclassified month as unread, not as uncapped", () => {
    // A month whose colours were never read cannot support a bound in either
    // direction; asserting one would be an assumption, not an observation.
    expect(
      describeGldasCensoredChange({
        earlier: month(4, 2.0e-5),
        later: month(5, 3.0e-5),
        earlierSaturation: null,
        laterSaturation: saturation(6, 40),
      })
    ).toBeNull();
  });
});

describe("gldasCensoredChangeNote", () => {
  it("names the direction and the earlier month for a lower bound", () => {
    const note = gldasCensoredChangeNote({
      earlier: month(4, 2.0e-5),
      later: month(5, 3.0e-5),
      earlierSaturation: saturation(0, 40),
      laterSaturation: saturation(6, 40),
    });

    expect(note).toContain("2026-04");
    expect(note).toContain("lower bound on the change");
    expect(note).not.toContain("upper bound");
  });

  it("counts the earlier month's capped cells for an upper bound", () => {
    const note = gldasCensoredChangeNote({
      earlier: month(4, 2.0e-5),
      later: month(5, 3.0e-5),
      earlierSaturation: saturation(9, 40),
      laterSaturation: saturation(0, 40),
    });

    expect(note).toContain("capped at 9 of 40 cells");
    expect(note).toContain("upper bound on the change");
  });

  it("withholds any bound when both endpoints were censored", () => {
    const note = gldasCensoredChangeNote({
      earlier: month(4, 2.0e-5),
      later: month(5, 3.0e-5),
      earlierSaturation: saturation(4, 40),
      laterSaturation: saturation(6, 40),
    });

    expect(note).toContain("4 of 40 cells in 2026-04");
    expect(note).toContain("6 of 40 cells here");
    expect(note).toContain(
      "neither an estimate nor a bound in a known direction"
    );
  });

  it("is silent when nothing was capped", () => {
    expect(
      gldasCensoredChangeNote({
        earlier: month(4, 2.0e-5),
        later: month(5, 3.0e-5),
        earlierSaturation: saturation(0, 40),
        laterSaturation: saturation(0, 40),
      })
    ).toBe("");
  });

  it("does not qualify a difference the card never stated", () => {
    // The earlier month has no usable value, so `climateInsightText` renders no
    // comparison at all; qualifying one would describe a clause that is absent.
    expect(
      gldasCensoredChangeNote({
        earlier: month(4, null),
        later: month(5, 3.0e-5),
        earlierSaturation: saturation(0, 40),
        laterSaturation: saturation(6, 40),
      })
    ).toBe("");
  });

  it("does not qualify a comparison against a later month", () => {
    expect(
      gldasCensoredChangeNote({
        earlier: month(5, 2.0e-5),
        later: month(4, 3.0e-5),
        earlierSaturation: saturation(0, 40),
        laterSaturation: saturation(6, 40),
      })
    ).toBe("");
  });
});

describe("gldasChangeIsStated", () => {
  // The admissibility rule lives inside `climateInsightText`, so pin this
  // against what that function actually renders rather than against a copy of
  // its source: if the rule moves, this fails instead of drifting silently.
  const cases: ReadonlyArray<{
    label: string;
    earlier: ReturnType<typeof month>;
    later: ReturnType<typeof month>;
  }> = [
    {
      label: "an ordinary consecutive pair",
      earlier: month(4, 2.0e-5),
      later: month(5, 3.0e-5),
    },
    {
      label: "an earlier month with no usable value",
      earlier: month(4, null),
      later: month(5, 3.0e-5),
    },
    {
      label: "a current month with no usable value",
      earlier: month(4, 2.0e-5),
      later: month(5, null),
    },
    {
      label: "a comparison month that is not earlier",
      earlier: month(5, 2.0e-5),
      later: month(4, 3.0e-5),
    },
    {
      label: "an earlier month outside the gross-error band",
      earlier: month(4, 9.9),
      later: month(5, 3.0e-5),
    },
    {
      label: "a current month outside the gross-error band",
      earlier: month(4, 2.0e-5),
      later: month(5, 9.9),
    },
    {
      label: "a non-adjacent but ordered pair",
      earlier: month(1, 2.0e-5),
      later: month(5, 3.0e-5),
    },
  ];

  for (const { label, earlier, later } of cases) {
    it(`agrees with the rendered card for ${label}`, () => {
      const rendered = climateInsightText(earlier, later).detail;
      const cardStatedChange =
        rendered.includes(` vs ${formatMonth(earlier.dataMonth)}`) &&
        !rendered.includes("comparison unavailable");

      expect(gldasChangeIsStated(earlier, later)).toBe(cardStatedChange);
    });
  }

  function formatMonth(m: { year: number; month: number }): string {
    return `${m.year}-${String(m.month).padStart(2, "0")}`;
  }
});
