import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import { DATA_LATEST, LAYERS, type YearMonth } from "./timeline";

describe("monthly climate summaries", () => {
  it("retains native units, cited sources, and the product publication lag", () => {
    const summary = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 1 },
        value: 0.0002,
        validFraction: 0.74,
        geometrySamplingStrategy: "boundary-grid",
      },
      { year: 2026, month: 5 }
    );

    expect(summary).toMatchObject({
      kind: "observed-monthly-climate",
      isForecast: false,
      metric: {
        nativeUnit: "kg/m²/s",
        source: CLIMATE_METRICS["precipitation-rate"].source,
      },
      dataMonth: { year: 2026, month: 1 },
      firstAvailableMonth: { year: 2000, month: 1 },
      availableThrough: { year: 2026, month: 5 },
      publicationStatus: "published",
      publicationLagMonths: 4,
      observedValue: 0.0002,
      coverage: { status: "available", validFraction: 0.74, reason: null },
      geometrySamplingStrategy: "boundary-grid",
    });
  });

  it("keeps air temperature and soil moisture in their native source units", () => {
    const air = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 3 },
        value: 289.4,
      },
      { year: 2026, month: 5 }
    );
    const soil = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: 7.2,
      },
      { year: 2026, month: 5 }
    );

    expect(air.metric.nativeUnit).toBe("K");
    expect(air.observedValue).toBe(289.4);
    expect(soil.metric.nativeUnit).toBe("kg/m²");
    expect(soil.observedValue).toBe(7.2);
  });

  it("keeps missing, invalid, and not-yet-published values unavailable without forecasting", () => {
    const missing = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: null,
        validFraction: 0,
      },
      { year: 2026, month: 5 }
    );
    const invalid = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 3 },
        value: -1,
      },
      { year: 2026, month: 5 }
    );
    const future = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 6 },
        value: 0.0001,
      },
      { year: 2026, month: 5 }
    );

    expect(missing).toMatchObject({
      isForecast: false,
      observedValue: null,
      coverage: {
        status: "no-data",
        reason: "missing-value",
        validFraction: 0,
      },
    });
    expect(invalid).toMatchObject({
      observedValue: null,
      coverage: { status: "invalid", reason: "invalid-value" },
    });
    expect(future).toMatchObject({
      isForecast: false,
      dataMonth: { year: 2026, month: 6 },
      availableThrough: { year: 2026, month: 5 },
      metric: {
        nativeUnit: CLIMATE_METRICS["precipitation-rate"].nativeUnit,
        source: CLIMATE_METRICS["precipitation-rate"].source,
      },
      publicationStatus: "not-yet-published",
      publicationLagMonths: null,
      observedValue: null,
      coverage: { status: "available" },
    });
  });

  it("snapshots source and availability months for stable provenance", () => {
    const dataMonth = { year: 2026, month: 1 };
    const availableThrough = { year: 2026, month: 5 };
    const summary = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth,
        value: null,
      },
      availableThrough
    );

    dataMonth.month = 2;
    availableThrough.month = 6;

    expect(summary.dataMonth).toEqual({ year: 2026, month: 1 });
    expect(summary.availableThrough).toEqual({ year: 2026, month: 5 });
    expect(summary.publicationLagMonths).toBe(4);
    expect(summary.coverage).toMatchObject({
      status: "no-data",
      reason: "missing-value",
    });
  });

  it("does not expose an otherwise usable value when the availability checkpoint is invalid", () => {
    const summary = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 4 },
        value: 8.1,
        validFraction: 0.91,
      },
      { year: 2026, month: 13 }
    );

    expect(summary).toMatchObject({
      isForecast: false,
      publicationStatus: "invalid-reference-month",
      publicationLagMonths: null,
      observedValue: null,
      coverage: {
        status: "invalid",
        validFraction: null,
        reason: "invalid-month",
      },
    });
  });

  it.each([
    ["precipitation-rate", 0.0002, 2000, 317],
    ["air-temperature-2m", 289.4, 1980, 557],
    ["soil-moisture", 7.2, 2000, 317],
  ] as const)(
    "withholds %s observations before the cited source record",
    (metricId, value, firstAvailableYear, publicationLagMonths) => {
      const summary = summarizeMonthlyClimate(
        {
          metricId,
          dataMonth: { year: firstAvailableYear - 1, month: 12 },
          value,
          validFraction: 0.88,
          sourceImageDimensions: { width: 512, height: 256 },
          geometrySamplingStrategy: "boundary-grid",
        },
        { year: 2026, month: 5 }
      );

      expect(summary).toMatchObject({
        isForecast: false,
        metric: {
          id: metricId,
          source: CLIMATE_METRICS[metricId].source,
          nativeUnit: CLIMATE_METRICS[metricId].nativeUnit,
        },
        dataMonth: { year: firstAvailableYear - 1, month: 12 },
        firstAvailableMonth: { year: firstAvailableYear, month: 1 },
        availableThrough: { year: 2026, month: 5 },
        publicationStatus: "before-source-record",
        publicationLagMonths,
        coverage: {
          status: "available",
          validFraction: 0.88,
          reason: null,
        },
        sourceImageDimensions: { width: 512, height: 256 },
        geometrySamplingStrategy: "boundary-grid",
        observedValue: null,
      });
    }
  );

  it.each([
    ["precipitation-rate", "precip", 0.0002],
    ["air-temperature-2m", "airtemp", 289.4],
    ["soil-moisture", "soil", 7.2],
  ] as const)(
    "reports the %s record end the cited layer actually declares",
    (metricId, layerId, value) => {
      const declared = LAYERS[layerId].latest ?? DATA_LATEST;
      const summary = summarizeMonthlyClimate(
        { metricId, dataMonth: declared, value },
        declared
      );

      expect(summary.lastAvailableMonth).toEqual(declared);
      expect(summary.beyondDeclaredRecord).toBe(false);
      expect(summary.observedValue).toBe(value);
    }
  );

  it("flags a month past the cited layer's declared record without withholding it", () => {
    // MERRA-2 is a reanalysis: it lags the MODIS composites the global
    // timeline end tracks, which is why `airtemp` carries its own `latest`.
    // A caller driving off DATA_LATEST therefore reaches months MERRA-2 has
    // not declared — the case this flag exists to name.
    const declared = LAYERS.airtemp.latest ?? DATA_LATEST;
    expect(monthsAfter(declared, DATA_LATEST)).toBeGreaterThan(0);

    const summary = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: DATA_LATEST,
        value: 289.4,
        validFraction: 0.9,
      },
      DATA_LATEST
    );

    expect(summary).toMatchObject({
      dataMonth: DATA_LATEST,
      lastAvailableMonth: declared,
      beyondDeclaredRecord: true,
      // Behaviour is unchanged: the flag reports the overreach, it does not
      // withhold. A conservative pre-boot baseline must not delete real data.
      publicationStatus: "published",
      observedValue: 289.4,
    });
  });

  it("does not flag an observation inside the record, or one that is unusable", () => {
    const inside = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2010, month: 6 },
        value: 0.0002,
      },
      { year: 2026, month: 5 }
    );
    // An unusable availability checkpoint leaves nothing to compare against.
    const invalidMonth = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2030, month: 6 },
        value: 0.0002,
      },
      { year: 2026, month: 13 }
    );

    expect(inside.beyondDeclaredRecord).toBe(false);
    expect(invalidMonth.publicationStatus).toBe("invalid-reference-month");
    expect(invalidMonth.beyondDeclaredRecord).toBe(false);
  });

  it("snapshots the record end so a later timeline mutation cannot re-date it", () => {
    const declared = LAYERS.precip.latest ?? DATA_LATEST;
    const summary = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2010, month: 6 },
        value: 0.0002,
      },
      { year: 2026, month: 5 }
    );

    expect(summary.lastAvailableMonth).toEqual(declared);
    expect(summary.lastAvailableMonth).not.toBe(LAYERS.precip.latest);
  });
});

/** Calendar months from `earlier` to `later` (negative when `later` is first). */
function monthsAfter(earlier: YearMonth, later: YearMonth): number {
  return (later.year - earlier.year) * 12 + later.month - earlier.month;
}
