import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate, type ClimateMetricId } from "./climate";
import {
  CLIMATE_RECORD_GAPS,
  climateRecordGap,
  climateRecordGapMonths,
  formatClimateRecordGap,
  isUndistributedClimateMonth,
} from "./climateRecordGaps";
import { LAYERS, type YearMonth } from "./timeline";

/** A published, usable climate summary at a chosen month. */
function summaryOf(
  metricId: ClimateMetricId,
  dataMonth: YearMonth,
  value: number | null = 289.4,
  availableThrough: YearMonth = { year: 2026, month: 5 }
) {
  return summarizeMonthlyClimate(
    { metricId, dataMonth, value, validFraction: 0.8 },
    availableThrough
  );
}

/** The three months MERRA2_2m_Air_Temperature_Monthly never distributed. */
const AIR_TEMP_GAPS: YearMonth[] = [
  { year: 2023, month: 12 },
  { year: 2024, month: 1 },
  { year: 2024, month: 5 },
];

describe("measured distribution gaps", () => {
  it("pins exactly the three months GIBS omits for 2 m air temperature", () => {
    expect(climateRecordGapMonths("air-temperature-2m")).toEqual(AIR_TEMP_GAPS);
  });

  it("declares the GLDAS metrics contiguous, as measured", () => {
    expect(CLIMATE_RECORD_GAPS["precipitation-rate"]).toEqual([]);
    expect(CLIMATE_RECORD_GAPS["soil-moisture"]).toEqual([]);
  });

  it("keeps every pinned gap inside the layer's own advertised record", () => {
    // A gap is interior by definition — outside the record it is simply
    // "before-source-record" or "not-yet-published", which climate.ts already
    // describes correctly.
    for (const gap of AIR_TEMP_GAPS) {
      expect(
        climateRecordGap(summaryOf("air-temperature-2m", gap))
      ).toMatchObject({ status: "not-distributed-by-source" });
    }
    expect(LAYERS.airtemp.start).toEqual({ year: 1980, month: 1 });
  });

  it("does not apply one metric's gaps to another", () => {
    expect(
      isUndistributedClimateMonth("air-temperature-2m", AIR_TEMP_GAPS[0])
    ).toBe(true);
    expect(
      isUndistributedClimateMonth("precipitation-rate", AIR_TEMP_GAPS[0])
    ).toBe(false);
  });

  it("returns copies, so a caller cannot mutate the pinned set", () => {
    const months = climateRecordGapMonths("air-temperature-2m");
    months[0].month = 7;
    expect(climateRecordGapMonths("air-temperature-2m")[0]).toEqual({
      year: 2023,
      month: 12,
    });
  });
});

describe("refining a summary against its source's distribution", () => {
  it("separates 'never distributed' from 'published but empty'", () => {
    // The defect this module exists for: climate.ts calls the gap month
    // "published", then coverage degrades to no-data, and the pair reads as a
    // month the source published with nothing in it.
    const summary = summaryOf(
      "air-temperature-2m",
      { year: 2024, month: 1 },
      null
    );
    expect(summary.publicationStatus).toBe("published");
    expect(summary.coverage.status).toBe("no-data");

    const gap = climateRecordGap(summary);
    expect(gap).toMatchObject({
      kind: "climate-record-gap",
      isForecast: false,
      status: "not-distributed-by-source",
      publicationStatus: "not-distributed",
      sourceLayer: "MERRA2_2m_Air_Temperature_Monthly",
      reason: null,
    });
  });

  it("retains the cited dataset unchanged", () => {
    const gap = climateRecordGap(
      summaryOf("air-temperature-2m", { year: 2024, month: 5 })
    );
    expect(gap.source).toEqual(LAYERS.airtemp.dataset);
  });

  it("passes a distributed month through untouched", () => {
    const gap = climateRecordGap(
      summaryOf("air-temperature-2m", { year: 2024, month: 6 })
    );
    expect(gap).toMatchObject({
      status: "within-distributed-record",
      publicationStatus: "published",
      bounds: null,
      reason: null,
    });
  });

  it("brackets a lone gap with its published neighbours", () => {
    const gap = climateRecordGap(
      summaryOf("air-temperature-2m", { year: 2024, month: 5 })
    );
    expect(gap.bounds).toEqual({
      before: { year: 2024, month: 4 },
      after: { year: 2024, month: 6 },
    });
  });

  it("brackets a consecutive run as a whole, skipping the other gap months", () => {
    // Dec 2023 and Jan 2024 are one two-month run: the neighbours are the
    // months bounding the run, not the adjacent gap month.
    for (const month of [
      { year: 2023, month: 12 },
      { year: 2024, month: 1 },
    ]) {
      expect(
        climateRecordGap(summaryOf("air-temperature-2m", month)).bounds
      ).toEqual({
        before: { year: 2023, month: 11 },
        after: { year: 2024, month: 2 },
      });
    }
  });

  it("declines to judge a month outside the record", () => {
    const early = climateRecordGap(
      summaryOf("air-temperature-2m", { year: 1979, month: 12 })
    );
    expect(early).toMatchObject({
      status: "not-applicable",
      publicationStatus: "before-source-record",
      reason: "before-source-record",
      bounds: null,
    });

    const ahead = climateRecordGap(
      summaryOf("air-temperature-2m", { year: 2026, month: 9 })
    );
    expect(ahead).toMatchObject({
      status: "not-applicable",
      publicationStatus: "not-yet-published",
      reason: "not-yet-published",
    });
  });

  it("never reports a gap for a contiguous metric", () => {
    const gap = climateRecordGap(
      summaryOf("precipitation-rate", { year: 2024, month: 1 }, 0.0001)
    );
    expect(gap.status).toBe("within-distributed-record");
    expect(gap.sourceLayer).toBe(
      "GLDAS_Surface_Total_Precipitation_Rate_Monthly"
    );
  });

  it("carries no observed value — it describes availability, not the atmosphere", () => {
    const gap = climateRecordGap(
      summaryOf("air-temperature-2m", { year: 2024, month: 5 }, 289.4)
    );
    expect(Object.keys(gap)).not.toContain("observedValue");
  });

  it("snapshots the data month against later mutation by the caller", () => {
    const month = { year: 2024, month: 5 };
    const gap = climateRecordGap(summaryOf("air-temperature-2m", month));
    month.month = 6;
    expect(gap.dataMonth).toEqual({ year: 2024, month: 5 });
  });
});

describe("formatting a gap verdict", () => {
  it("names the gap as a distribution fact and offers the neighbours", () => {
    const text = formatClimateRecordGap(
      climateRecordGap(
        summaryOf("air-temperature-2m", { year: 2024, month: 5 })
      )
    );
    expect(text).toContain("May 2024 was never distributed");
    expect(text).toContain("not a missing observation");
    expect(text).toContain("Apr 2024 and Jun 2024");
    expect(text).toContain("M2TMNXSLV v5.12.4");
    // No causal or meteorological claim about the absent month.
    expect(text).not.toMatch(/because|due to|caused|warm|cold/i);
  });

  it("states plainly that a distributed month is inside the record", () => {
    const text = formatClimateRecordGap(
      climateRecordGap(
        summaryOf("air-temperature-2m", { year: 2024, month: 6 })
      )
    );
    expect(text).toContain("Jun 2024 is inside the distributed record");
    expect(text).toContain("MERRA2_2m_Air_Temperature_Monthly");
  });

  it("says why no check applies rather than implying one passed", () => {
    const text = formatClimateRecordGap(
      climateRecordGap(
        summaryOf("air-temperature-2m", { year: 2026, month: 9 })
      )
    );
    expect(text).toContain("No distribution check");
    expect(text).toContain("not-yet-published");
  });
});
