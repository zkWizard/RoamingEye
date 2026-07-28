import { describe, expect, it } from "vitest";
import { NDVI_SOURCE, NDVI_UNIT } from "./phenology";
import { summarizeNdviMonthlyChange } from "./phenologyChange";
import {
  NDVI_CYCLE_MODALITY_LIMITATIONS,
  summarizeNdviCycleModality,
} from "./phenologyCycleModality";

/** Build a validated change summary from a bare monthly NDVI series. */
function changeFor(
  series: readonly { month: number; ndvi: number }[],
  latitude = 48.8,
  options?: { stabilityThreshold?: number }
) {
  return summarizeNdviMonthlyChange(
    series.map(({ month, ndvi }) => ({
      month: { year: 2025, month },
      ndvi,
      validFraction: 0.9,
    })),
    latitude,
    options
  );
}

describe("NDVI cycle modality", () => {
  it("reads a single-season rise-then-fall trace as one greenness maximum", () => {
    const summary = summarizeNdviCycleModality(
      changeFor([
        { month: 1, ndvi: 0.1 },
        { month: 2, ndvi: 0.3 },
        { month: 3, ndvi: 0.6 },
        { month: 4, ndvi: 0.4 },
        { month: 5, ndvi: 0.15 },
      ])
    );

    expect(summary).toMatchObject({
      kind: "observed-ndvi-cycle-modality",
      isForecast: false,
      hemisphere: "northern",
      status: "available",
      totalGreennessMaximaCount: 1,
      totalGreennessMinimaCount: 0,
      source: NDVI_SOURCE,
      unit: NDVI_UNIT,
      reason: null,
    });
    expect(summary.coverage).toMatchObject({
      transitionCount: 4,
      segmentCount: 1,
      gapCount: 0,
      littleChangeCount: 0,
      observedMonthCount: 5,
    });
    expect(summary.dataPeriod).toEqual({
      firstMonth: { year: 2025, month: 1 },
      lastMonth: { year: 2025, month: 5 },
    });
    expect(summary.segments).toHaveLength(1);
    expect(summary.segments[0]).toMatchObject({
      startMonth: { year: 2025, month: 1 },
      endMonth: { year: 2025, month: 5 },
      transitionCount: 4,
      greennessMaximaCount: 1,
      greennessMinimaCount: 0,
      modality: "single-maximum",
    });
    expect(summary.reversals).toEqual([
      {
        kind: "greenness-maximum",
        month: { year: 2025, month: 3 },
        meteorologicalSeason: "spring",
        ndvi: 0.6,
      },
    ]);
    expect(summary.mostMultimodalSegment).toBe(summary.segments[0]);
  });

  it("resolves a two-peak trace into two maxima and one interior minimum", () => {
    const summary = summarizeNdviCycleModality(
      changeFor([
        { month: 1, ndvi: 0.1 },
        { month: 2, ndvi: 0.4 },
        { month: 3, ndvi: 0.15 },
        { month: 4, ndvi: 0.45 },
        { month: 5, ndvi: 0.2 },
      ])
    );

    expect(summary.totalGreennessMaximaCount).toBe(2);
    expect(summary.totalGreennessMinimaCount).toBe(1);
    expect(summary.segments[0].modality).toBe("multiple-maxima");
    expect(
      summary.reversals.map(({ kind, month }) => ({
        kind,
        month: month.month,
      }))
    ).toEqual([
      { kind: "greenness-maximum", month: 2 },
      { kind: "greenness-minimum", month: 3 },
      { kind: "greenness-maximum", month: 4 },
    ]);
    // Turning points carry the index value at the reversing month.
    expect(summary.reversals[1]).toMatchObject({ ndvi: 0.15 });
  });

  it("treats a little-change flat top as a dead-band continuation, not a break", () => {
    const summary = summarizeNdviCycleModality(
      changeFor([
        { month: 1, ndvi: 0.1 },
        { month: 2, ndvi: 0.5 },
        { month: 3, ndvi: 0.52 },
        { month: 4, ndvi: 0.3 },
      ])
    );

    expect(summary.coverage.littleChangeCount).toBe(1);
    expect(summary.totalGreennessMaximaCount).toBe(1);
    // The maximum sits at the last month before the decline (the flat top).
    expect(summary.reversals).toEqual([
      {
        kind: "greenness-maximum",
        month: { year: 2025, month: 3 },
        meteorologicalSeason: "spring",
        ndvi: 0.52,
      },
    ]);
  });

  it("reports no interior maximum for an all-little-change series", () => {
    const summary = summarizeNdviCycleModality(
      changeFor([
        { month: 1, ndvi: 0.3 },
        { month: 2, ndvi: 0.31 },
        { month: 3, ndvi: 0.32 },
      ])
    );

    expect(summary.status).toBe("available");
    expect(summary.coverage.littleChangeCount).toBe(2);
    expect(summary.totalGreennessMaximaCount).toBe(0);
    expect(summary.totalGreennessMinimaCount).toBe(0);
    expect(summary.segments[0].modality).toBe("no-interior-maximum");
    expect(summary.mostMultimodalSegment).toBe(summary.segments[0]);
  });

  it("never bridges a data gap: each gap-free run is scored on its own", () => {
    const summary = summarizeNdviCycleModality(
      changeFor([
        { month: 1, ndvi: 0.1 },
        { month: 2, ndvi: 0.4 },
        { month: 3, ndvi: 0.15 },
        // months 4 and 5 missing — a gap the summary must not interpolate across
        { month: 6, ndvi: 0.2 },
        { month: 7, ndvi: 0.5 },
        { month: 8, ndvi: 0.25 },
      ])
    );

    expect(summary.coverage).toMatchObject({
      transitionCount: 4,
      segmentCount: 2,
      gapCount: 1,
      observedMonthCount: 6,
    });
    expect(summary.dataPeriod).toEqual({
      firstMonth: { year: 2025, month: 1 },
      lastMonth: { year: 2025, month: 8 },
    });
    expect(summary.segments.map((s) => s.greennessMaximaCount)).toEqual([1, 1]);
    expect(summary.totalGreennessMaximaCount).toBe(2);
    // Tie on maxima resolves to the earliest run.
    expect(summary.mostMultimodalSegment?.startMonth).toEqual({
      year: 2025,
      month: 1,
    });
  });

  it("returns an honest no-transitions result for a series too short to reverse", () => {
    const summary = summarizeNdviCycleModality(
      changeFor([{ month: 7, ndvi: 0.5 }])
    );

    expect(summary).toMatchObject({
      status: "no-transitions",
      totalGreennessMaximaCount: 0,
      totalGreennessMinimaCount: 0,
      mostMultimodalSegment: null,
      reason: "no-consecutive-month-transitions",
    });
    expect(summary.coverage).toMatchObject({
      transitionCount: 0,
      segmentCount: 0,
      gapCount: 0,
      littleChangeCount: 0,
      observedMonthCount: 0,
    });
    expect(summary.dataPeriod).toBeNull();
    expect(summary.segments).toEqual([]);
    expect(summary.reversals).toEqual([]);
  });

  it("labels turning-point seasons by hemisphere", () => {
    const summary = summarizeNdviCycleModality(
      changeFor(
        [
          { month: 1, ndvi: 0.1 },
          { month: 2, ndvi: 0.3 },
          { month: 3, ndvi: 0.6 },
          { month: 4, ndvi: 0.4 },
          { month: 5, ndvi: 0.15 },
        ],
        -23.5
      )
    );

    expect(summary.hemisphere).toBe("southern");
    // Month 3 is northern spring, hence southern autumn.
    expect(summary.reversals[0].meteorologicalSeason).toBe("autumn");
  });

  it("inherits the change summary's dead band, so the threshold controls modality", () => {
    const series = [
      { month: 1, ndvi: 0.1 },
      { month: 2, ndvi: 0.4 },
      { month: 3, ndvi: 0.32 },
      { month: 4, ndvi: 0.45 },
    ];

    const tight = summarizeNdviCycleModality(changeFor(series));
    expect(tight.stabilityThreshold).toBeCloseTo(0.05);
    expect(tight.totalGreennessMaximaCount).toBe(1);
    expect(tight.totalGreennessMinimaCount).toBe(1);

    const loose = summarizeNdviCycleModality(
      changeFor(series, 48.8, { stabilityThreshold: 0.1 })
    );
    expect(loose.stabilityThreshold).toBeCloseTo(0.1);
    // The -0.08 dip is now within the dead band, so the trend never reverses.
    expect(loose.totalGreennessMaximaCount).toBe(0);
    expect(loose.coverage.littleChangeCount).toBe(1);
  });

  it("documents its scope limits without over-claiming", () => {
    expect(NDVI_CYCLE_MODALITY_LIMITATIONS).toContain("NOT a count of");
    expect(NDVI_CYCLE_MODALITY_LIMITATIONS).toContain("forecast");
    expect(NDVI_CYCLE_MODALITY_LIMITATIONS.length).toBeGreaterThan(200);
  });
});
