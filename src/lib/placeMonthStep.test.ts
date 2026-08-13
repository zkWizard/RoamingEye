import { describe, expect, it } from "vitest";
import {
  PLACE_MONTH_STEP_LIMITATIONS,
  placeMonthStep,
  placeMonthStepNote,
  placeMonthStepRefusal,
} from "./placeMonthStep";

describe("placeMonthStep", () => {
  it("classifies an adjacent pair as a month-over-month step", () => {
    const step = placeMonthStep([
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ]);
    expect(step.step).toBe("consecutive-months");
    expect(step.monthsApart).toBe(1);
    expect(step.isMonthOverMonth).toBe(true);
  });

  it("counts an adjacent pair across a year boundary", () => {
    const step = placeMonthStep([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
    expect(step.step).toBe("consecutive-months");
    expect(step.monthsApart).toBe(1);
  });

  it("refuses a pair straddling a skipped month", () => {
    const step = placeMonthStep([
      { year: 2026, month: 1 },
      { year: 2026, month: 3 },
    ]);
    expect(step.step).toBe("not-consecutive-months");
    expect(step.monthsApart).toBe(2);
    expect(step.isMonthOverMonth).toBe(false);
  });

  it("reports an out-of-order pair rather than sorting it", () => {
    const step = placeMonthStep([
      { year: 2026, month: 3 },
      { year: 2026, month: 2 },
    ]);
    expect(step.step).toBe("not-consecutive-months");
    expect(step.monthsApart).toBe(-1);
  });

  it("treats an identical pair as no step", () => {
    const step = placeMonthStep([
      { year: 2026, month: 3 },
      { year: 2026, month: 3 },
    ]);
    expect(step.step).toBe("not-consecutive-months");
    expect(step.monthsApart).toBe(0);
  });

  it("never guesses an interval from a month outside 1-12", () => {
    const step = placeMonthStep([
      { year: 2026, month: 13 },
      { year: 2026, month: 14 },
    ]);
    expect(step.step).toBe("unusable-months");
    expect(step.monthsApart).toBeNull();
    expect(step.isMonthOverMonth).toBe(false);
  });

  it("never guesses an interval from a non-integer year", () => {
    const step = placeMonthStep([
      { year: 2026.5, month: 2 },
      { year: 2026, month: 3 },
    ]);
    expect(step.step).toBe("unusable-months");
    expect(step.monthsApart).toBeNull();
  });

  it("carries the shared limitations", () => {
    expect(
      placeMonthStep([
        { year: 2026, month: 2 },
        { year: 2026, month: 3 },
      ]).limitations
    ).toBe(PLACE_MONTH_STEP_LIMITATIONS);
  });
});

describe("placeMonthStepNote", () => {
  it("discloses that a month-over-month step is not deseasonalized", () => {
    const note = placeMonthStepNote(
      placeMonthStep([
        { year: 2026, month: 2 },
        { year: 2026, month: 3 },
      ])
    );
    expect(note).toBe(" · annual cycle not removed");
  });

  it("says nothing when no difference is reported", () => {
    expect(
      placeMonthStepNote(
        placeMonthStep([
          { year: 2026, month: 1 },
          { year: 2026, month: 3 },
        ])
      )
    ).toBe("");
  });
});

describe("placeMonthStepRefusal", () => {
  it("allows a difference for an adjacent pair", () => {
    expect(
      placeMonthStepRefusal(
        placeMonthStep([
          { year: 2026, month: 2 },
          { year: 2026, month: 3 },
        ]),
        "Feb 2026"
      )
    ).toBeNull();
  });

  it("names the earlier month when the pair is not adjacent", () => {
    expect(
      placeMonthStepRefusal(
        placeMonthStep([
          { year: 2026, month: 1 },
          { year: 2026, month: 3 },
        ]),
        "Jan 2026"
      )
    ).toBe(
      "Jan 2026 is not the preceding month, so no month-over-month change is reported"
    );
  });

  it("states an unusable month instead of naming it as a gap", () => {
    expect(
      placeMonthStepRefusal(
        placeMonthStep([
          { year: 2026, month: 0 },
          { year: 2026, month: 3 },
        ]),
        "undefined 2026"
      )
    ).toBe(
      "the earlier month is not a usable calendar month, so no month-over-month change is reported"
    );
  });
});
