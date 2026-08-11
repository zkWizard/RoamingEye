import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate, type ClimateMetricId } from "./climate";
import {
  PRECIPITATION_WITHHELD_VALUE,
  guardPrecipitationReadout,
} from "./precipitationReadoutGuard";
import { PRECIPITATION_RATE_RECORD_ANCHOR } from "./precipitationRatePlausibility";
import type { YearMonth } from "./timeline";

/** Build a published, usable climate summary at a chosen month. */
function summaryOf(
  metricId: ClimateMetricId,
  value: number | null,
  dataMonth: YearMonth = { year: 2026, month: 1 }
) {
  return summarizeMonthlyClimate(
    { metricId, dataMonth, value, validFraction: 0.8 },
    { year: dataMonth.year + 1, month: dataMonth.month }
  );
}

/** Stand-in for the formatted place-panel readout the guard filters. */
const READOUT = {
  value: "4.3 mm/day",
  detail: "January 2026 regional mean; source GLDAS v2.1",
};

describe("precipitation readout guard", () => {
  it("passes a plausible rate through completely untouched", () => {
    const guarded = guardPrecipitationReadout(
      summaryOf("precipitation-rate", 5e-5),
      READOUT
    );

    // A sanity pass must never edit, clamp, or re-word an admitted reading.
    expect(guarded).toEqual(READOUT);
  });

  it("passes a rainless (zero) month through as a real observation", () => {
    const guarded = guardPrecipitationReadout(
      summaryOf("precipitation-rate", 0),
      { value: "0.0 mm/day", detail: READOUT.detail }
    );

    // Zero is a legitimate arid-month value, not a decode error.
    expect(guarded.value).toBe("0.0 mm/day");
  });

  it("never withholds a genuine rainfall extreme at the record anchor", () => {
    const guarded = guardPrecipitationReadout(
      summaryOf(
        "precipitation-rate",
        PRECIPITATION_RATE_RECORD_ANCHOR.wettestCalendarMonthKgM2S
      ),
      READOUT
    );

    expect(guarded).toEqual(READOUT);
  });

  it("withholds an unconverted mm/day value mistakenly decoded as kg/m²/s", () => {
    // 20 "kg/m²/s" is ≈ 1.7 million mm/day — a classic unit slip, not weather.
    const guarded = guardPrecipitationReadout(
      summaryOf("precipitation-rate", 20),
      READOUT
    );

    expect(guarded.value).toBe(PRECIPITATION_WITHHELD_VALUE);
    expect(guarded.detail).toContain("Reading withheld");
    expect(guarded.detail).toContain("likely a unit or decode error");
  });

  it("keeps the cited source attached to a withheld reading", () => {
    const guarded = guardPrecipitationReadout(
      summaryOf("precipitation-rate", 20),
      READOUT
    );

    // Provenance survives rejection: the value is still attributed.
    expect(guarded.detail).toMatch(/source \S+ v\S+/);
  });

  it("does not claim a withheld month was dry", () => {
    const guarded = guardPrecipitationReadout(
      summaryOf("precipitation-rate", 20),
      READOUT
    );

    expect(guarded.detail).not.toMatch(/\b(no rain|dry|zero)\b/i);
  });

  it("leaves air temperature and soil moisture readouts alone", () => {
    // A rainfall band must never be applied to another metric, even when the
    // raw number would fall outside it.
    for (const metricId of [
      "air-temperature-2m",
      "soil-moisture",
    ] as ClimateMetricId[]) {
      expect(
        guardPrecipitationReadout(summaryOf(metricId, 20), READOUT)
      ).toEqual(READOUT);
    }
  });

  it("passes an unusable month through so upstream reporting is preserved", () => {
    const unavailable = {
      value: "Unavailable",
      detail: "No usable January 2026 precipitation rate (source-no-data)",
    };
    const guarded = guardPrecipitationReadout(
      summaryOf("precipitation-rate", null),
      unavailable
    );

    // The upstream message is more specific than anything this guard could add.
    expect(guarded).toEqual(unavailable);
  });

  it("passes a not-yet-published month through untouched", () => {
    const future = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 6 },
        value: 5e-5,
        validFraction: 0.8,
      },
      { year: 2026, month: 1 }
    );

    expect(guardPrecipitationReadout(future, READOUT)).toEqual(READOUT);
  });
});
