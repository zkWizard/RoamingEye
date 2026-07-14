import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBriefInput,
  type EnvironmentObservation,
} from "./environmentBrief";
import { parseNativeGrid, summarizeSpatialSupport } from "./spatialSupport";

const AVAILABLE_THROUGH = { year: 2026, month: 3 };

function obs(value: number, validFraction?: number): EnvironmentObservation {
  return { dataMonth: { year: 2026, month: 1 }, value, validFraction };
}

/** A brief where every supplied signal is dated 2026-01 (published, in-range). */
function briefWith(
  overrides: Partial<EnvironmentBriefInput>
): ReturnType<typeof composeEnvironmentBrief> {
  return composeEnvironmentBrief({
    vegetation: null,
    rainfall: null,
    soilMoisture: null,
    airTemperature: null,
    availableThrough: AVAILABLE_THROUGH,
    ...overrides,
  });
}

describe("parseNativeGrid", () => {
  it("reads a kilometre grid from a MODIS title", () => {
    expect(
      parseNativeGrid("MODIS/Terra Vegetation Indices Monthly L3 Global 1km")
    ).toEqual({ statedGrid: "1km", nominalMetres: 1000 });
    expect(
      parseNativeGrid("MODIS Aqua L3 SST Thermal IR Monthly 9km Daytime")
    ).toEqual({ statedGrid: "9km", nominalMetres: 9000 });
  });

  it("reads a degree grid, whether written with ° or 'Deg'", () => {
    expect(
      parseNativeGrid("GLDAS Noah Land Surface Model L4 monthly 0.25°")
    ).toEqual({ statedGrid: "0.25°", nominalMetres: 0.25 * 111_320 });
    expect(
      parseNativeGrid("MODIS/Terra Snow Cover Monthly L3 Global 0.05Deg CMG")
    ).toEqual({ statedGrid: "0.05Deg", nominalMetres: 0.05 * 111_320 });
  });

  it("prefers a km token over a bare-metre reading", () => {
    // "1km" must not be mis-parsed as "1 m"; km is tried first.
    expect(parseNativeGrid("Global 1km product")?.nominalMetres).toBe(1000);
  });

  it("returns null when the title states no grid (MERRA-2 air temperature)", () => {
    expect(
      parseNativeGrid(
        "MERRA-2 tavgM_2d_slv_Nx: Monthly Single-Level Diagnostics"
      )
    ).toBeNull();
    expect(parseNativeGrid("No resolution here")).toBeNull();
  });
});

describe("summarizeSpatialSupport", () => {
  it("flags the grain mismatch between 1 km NDVI and the 0.25° GLDAS grid", () => {
    const brief = briefWith({
      vegetation: obs(0.6, 1),
      rainfall: obs(4, 0.9),
      soilMoisture: obs(0.3, 0.9),
    });

    const summary = summarizeSpatialSupport(brief.signals);

    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
    ]);
    expect(summary.distinctStatedGrids).toBe(2);
    expect(summary.unknownGridSignalIds).toEqual([]);
    expect(summary.finestMetres).toBe(1000);
    expect(summary.coarsestMetres).toBe(0.25 * 111_320);
    expect(summary.scaleRatio).toBeCloseTo((0.25 * 111_320) / 1000, 5);
    expect(summary.commonGrid).toBe(false);
    expect(summary.statement).toContain("distinct native grids");
    expect(summary.statement).toContain("not co-registered");
    expect(summary.statement).toContain("28×");
  });

  it("asserts a common grid only when every considered signal shares one", () => {
    // Rainfall and soil moisture are both GLDAS 0.25° — one native grid.
    const brief = briefWith({
      rainfall: obs(4, 0.9),
      soilMoisture: obs(0.3, 0.9),
    });

    const summary = summarizeSpatialSupport(brief.signals);

    expect(summary.distinctStatedGrids).toBe(1);
    expect(summary.commonGrid).toBe(true);
    expect(summary.scaleRatio).toBe(1);
    expect(summary.statement).toContain("share one");
    expect(summary.statement).not.toContain("not co-registered");
  });

  it("reports an unstated grid as unknown rather than inventing one", () => {
    // Air temperature (MERRA-2) states no grid in its cited title.
    const brief = briefWith({
      vegetation: obs(0.6, 1),
      airTemperature: obs(280, 0.9),
    });

    const summary = summarizeSpatialSupport(brief.signals);

    const airtemp = summary.signals.find((s) => s.id === "air-temperature");
    expect(airtemp?.statedGrid).toBeNull();
    expect(airtemp?.nominalMetres).toBeNull();
    expect(airtemp?.statement).toContain("native grid not stated");
    expect(summary.unknownGridSignalIds).toEqual(["air-temperature"]);
    // One known grid (NDVI) is not enough to compare across signals.
    expect(summary.statement).toContain("needs two or more");
    expect(summary.statement).toContain("air-temperature");
  });

  it("handles a single considered signal with no comparison to make", () => {
    const brief = briefWith({ vegetation: obs(0.6, 1) });
    const summary = summarizeSpatialSupport(brief.signals);

    expect(summary.consideredSignalIds).toEqual(["vegetation"]);
    expect(summary.commonGrid).toBe(false);
    expect(summary.scaleRatio).toBeNull();
    expect(summary.finestMetres).toBe(1000);
    expect(summary.statement).toContain("needs two or more");
  });

  it("considers only available signals by default, all signals on request", () => {
    // Soil moisture supplied but invalid (out-of-range coverage) → not available.
    const brief = briefWith({
      vegetation: obs(0.6, 1),
      soilMoisture: {
        dataMonth: { year: 2026, month: 1 },
        value: 0.3,
        validFraction: 2,
      },
    });

    const byDefault = summarizeSpatialSupport(brief.signals);
    expect(byDefault.consideredSignalIds).toEqual(["vegetation"]);

    const all = summarizeSpatialSupport(brief.signals, { include: "all" });
    // "all" walks every composed signal, including unsupplied/unavailable ones.
    expect(all.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);
  });

  it("returns an empty, honest summary when nothing is usable", () => {
    const summary = summarizeSpatialSupport(briefWith({}).signals);
    expect(summary.consideredSignalIds).toEqual([]);
    expect(summary.distinctStatedGrids).toBe(0);
    expect(summary.finestMetres).toBeNull();
    expect(summary.coarsestMetres).toBeNull();
    expect(summary.scaleRatio).toBeNull();
    expect(summary.commonGrid).toBe(false);
    expect(summary.statement).toContain("No usable observations");
  });

  it("keeps every signal's DatasetRef and makes no unsupported claim", () => {
    const brief = briefWith({
      vegetation: obs(0.6, 1),
      rainfall: obs(4, 0.9),
      airTemperature: obs(280, 0.9),
    });
    const summary = summarizeSpatialSupport(brief.signals);

    for (const signal of summary.signals) {
      expect(signal.source.doi).toBeTruthy();
      expect(signal.source.shortName).toBeTruthy();
    }
    const prose = [
      summary.statement,
      ...summary.signals.map((s) => s.statement),
    ]
      .concat(summary.limits)
      .join(" ");
    expect(unsupportedBriefLanguageHits(prose)).toEqual([]);
  });
});
