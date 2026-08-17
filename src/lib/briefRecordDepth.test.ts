import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
} from "./environmentBrief";
import {
  RECORD_DEPTH_TIERS,
  summarizeBriefRecordDepth,
} from "./briefRecordDepth";
import { LAYERS, type YearMonth } from "./timeline";

/** A fully-usable four-signal brief, all observations within availability. */
const USABLE_INPUT: EnvironmentBriefInput = {
  vegetation: {
    dataMonth: { year: 2026, month: 1 },
    value: 0.61,
    validFraction: 0.82,
  },
  rainfall: {
    dataMonth: { year: 2026, month: 1 },
    value: 0.00012,
    validFraction: 0.74,
  },
  soilMoisture: {
    dataMonth: { year: 2026, month: 1 },
    value: 6.4,
    validFraction: 0.67,
  },
  airTemperature: {
    dataMonth: { year: 2026, month: 1 },
    value: 289.4,
    validFraction: 0.93,
  },
  availableThrough: { year: 2026, month: 3 },
};

/** Fixed horizon so the one open-ended product (NDVI) closes deterministically. */
const AS_OF = { year: 2026, month: 3 };

function signalsFor(input: EnvironmentBriefInput) {
  return composeEnvironmentBrief(input).signals;
}

describe("summarizeBriefRecordDepth", () => {
  it("reports each signal's published archive depth from catalog metadata", () => {
    const summary = summarizeBriefRecordDepth(signalsFor(USABLE_INPUT), {
      asOf: AS_OF,
    });

    expect(summary.kind).toBe("brief-record-depth");
    expect(summary.consideredSignalIds).toEqual([
      "vegetation",
      "rainfall",
      "soil-moisture",
      "air-temperature",
    ]);

    const byId = Object.fromEntries(
      summary.depths.map((depth) => [depth.signalId, depth])
    );

    // MERRA-2 air temperature publishes from 1980-01 to 2026-05 (fixed end):
    // (2026*12+4) - (1980*12) + 1 = 557 months ≈ 46.4 years.
    expect(byId["air-temperature"].startMonth).toEqual({
      year: 1980,
      month: 1,
    });
    expect(byId["air-temperature"].endMonth).toEqual({ year: 2026, month: 5 });
    expect(byId["air-temperature"].endIsHorizon).toBe(false);
    expect(byId["air-temperature"].spanMonths).toBe(557);
    expect(byId["air-temperature"].spanYears).toBe(46.4);
    expect(byId["air-temperature"].tier).toBe("four-decades-plus");

    // GLDAS rainfall/soil publish 2000-01 to 2026-03 (fixed end): 315 months.
    expect(byId["rainfall"].spanMonths).toBe(315);
    expect(byId["rainfall"].endIsHorizon).toBe(false);
    expect(byId["rainfall"].spanYears).toBe(26.3);
    expect(byId["rainfall"].tier).toBe("two-decades");
    expect(byId["soil-moisture"].spanMonths).toBe(315);

    // NDVI (MOD13A3) carries a verified catalog end too, so it is measured to
    // that, not to the horizon. Derived from the pin rather than restated:
    // MOD13A3 publishes on its own schedule, and a bumped pin must move this
    // expectation with it instead of failing a test that only ever restated it.
    const ndviLatest = LAYERS.ndvi.latest as YearMonth;
    expect(byId["vegetation"].endIsHorizon).toBe(false);
    expect(byId["vegetation"].endMonth).toEqual(ndviLatest);
    // 2000-03 through the pinned end, inclusive.
    expect(byId["vegetation"].spanMonths).toBe(
      ndviLatest.year * 12 + ndviLatest.month - (2000 * 12 + 3) + 1
    );
  });

  it("identifies the deepest and shallowest archives and their spread", () => {
    const summary = summarizeBriefRecordDepth(signalsFor(USABLE_INPUT), {
      asOf: AS_OF,
    });

    expect(summary.deepest?.signalId).toBe("air-temperature");
    // GLDAS rainfall and soil moisture are one granule, so they tie at the
    // shallowest depth; the picker keeps the first, in composed-signal order.
    expect(summary.shallowest?.signalId).toBe("rainfall");
    expect(summary.shallowest?.spanMonths).toBe(315);
    expect(summary.spreadMonths).toBe(557 - 315);
    expect(summary.commensurate).toBe(false);
    expect(summary.statement).toContain("air-temperature");
    expect(summary.statement).toContain("deeper archive");
    expect(summary.statement).toContain("242-month");
  });

  it("preserves each signal's source provenance", () => {
    const summary = summarizeBriefRecordDepth(signalsFor(USABLE_INPUT), {
      asOf: AS_OF,
    });
    for (const depth of summary.depths) {
      expect(depth.source.doi.length).toBeGreaterThan(0);
      expect(depth.source.shortName.length).toBeGreaterThan(0);
    }
  });

  it("reports commensurate depth when the assessed archives are equal", () => {
    // Only the two GLDAS signals are usable — both 2000-01..2026-01 (313 mo).
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      vegetation: null,
      airTemperature: null,
    };
    const summary = summarizeBriefRecordDepth(signalsFor(input), {
      asOf: AS_OF,
    });

    expect(summary.consideredSignalIds).toEqual(["rainfall", "soil-moisture"]);
    expect(summary.spreadMonths).toBe(0);
    expect(summary.commensurate).toBe(true);
    expect(summary.statement).toContain("equally deep");
    expect(summary.statement).toContain("commensurate");
  });

  it("does not call a single assessed signal commensurate", () => {
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      vegetation: null,
      rainfall: null,
      soilMoisture: null,
    };
    const summary = summarizeBriefRecordDepth(signalsFor(input), {
      asOf: AS_OF,
    });

    expect(summary.consideredSignalIds).toEqual(["air-temperature"]);
    expect(summary.spreadMonths).toBe(0);
    expect(summary.commensurate).toBe(false);
    expect(summary.statement).toContain("single signal");
  });

  it("excludes unusable signals by default but includes them with 'all'", () => {
    // Air temperature dated beyond its availability horizon → unavailable.
    const input: EnvironmentBriefInput = {
      ...USABLE_INPUT,
      airTemperature: {
        dataMonth: { year: 2030, month: 1 },
        value: 289.4,
        validFraction: 0.93,
      },
    };

    const usableOnly = summarizeBriefRecordDepth(signalsFor(input), {
      asOf: AS_OF,
    });
    expect(usableOnly.consideredSignalIds).not.toContain("air-temperature");

    const all = summarizeBriefRecordDepth(signalsFor(input), {
      include: "all",
      asOf: AS_OF,
    });
    expect(all.consideredSignalIds).toContain("air-temperature");
    // Record depth is a product property: the unavailable value does not change
    // the archive length behind the signal.
    const airtemp = all.depths.find((d) => d.signalId === "air-temperature");
    expect(airtemp?.spanMonths).toBe(557);
  });

  it("closes open-ended products at the supplied horizon only", () => {
    // Every catalogued product now carries a verified end (2026-08-15), so
    // this path is defensive — it covers a layer added without a pin, whose
    // end would otherwise silently be the fastest product's month. Unpin one
    // to exercise it, exactly as the freshness suite does.
    const vegetation = LAYERS.ndvi as { latest?: YearMonth };
    const pinned = vegetation.latest;
    delete vegetation.latest;
    try {
      const early = summarizeBriefRecordDepth(signalsFor(USABLE_INPUT), {
        asOf: { year: 2020, month: 3 },
      });
      const byIdEarly = Object.fromEntries(
        early.depths.map((d) => [d.signalId, d])
      );
      // The unpinned product shrinks with an earlier horizon, and says so...
      expect(byIdEarly["vegetation"].endIsHorizon).toBe(true);
      expect(byIdEarly["vegetation"].endMonth).toEqual({
        year: 2020,
        month: 3,
      });
      expect(byIdEarly["vegetation"].spanMonths).toBe(241);
      // ...while fixed-end products ignore the horizon entirely.
      expect(byIdEarly["air-temperature"].endMonth).toEqual({
        year: 2026,
        month: 5,
      });
      expect(byIdEarly["rainfall"].spanMonths).toBe(315);
    } finally {
      vegetation.latest = pinned;
    }
  });

  it("returns an empty, honest summary when nothing is assessed", () => {
    const input: EnvironmentBriefInput = {
      vegetation: null,
      rainfall: null,
      soilMoisture: null,
      airTemperature: null,
      availableThrough: { year: 2026, month: 3 },
    };
    const summary = summarizeBriefRecordDepth(signalsFor(input));

    expect(summary.depths).toEqual([]);
    expect(summary.deepest).toBeNull();
    expect(summary.shallowest).toBeNull();
    expect(summary.spreadMonths).toBeNull();
    expect(summary.commensurate).toBe(false);
    expect(summary.statement).toContain("No usable observations");
  });

  it("carries method limits and a descending, complete tier table", () => {
    const summary = summarizeBriefRecordDepth(signalsFor(USABLE_INPUT), {
      asOf: AS_OF,
    });
    expect(summary.limits.length).toBeGreaterThan(0);
    expect(summary.limits.some((l) => /not.*a data-quality/i.test(l))).toBe(
      true
    );

    // Thresholds strictly descend and bottom out at 0 so every span lands.
    const mins = RECORD_DEPTH_TIERS.map((t) => t.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
    expect(mins[mins.length - 1]).toBe(0);
  });
});
