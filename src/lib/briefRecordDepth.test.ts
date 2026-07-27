import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  type EnvironmentBriefInput,
} from "./environmentBrief";
import {
  RECORD_DEPTH_TIERS,
  summarizeBriefRecordDepth,
} from "./briefRecordDepth";

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

    // MERRA-2 air temperature publishes from 1980-01 to 2026-03 (fixed end):
    // (2026*12+2) - (1980*12) + 1 = 555 months ≈ 46.3 years.
    expect(byId["air-temperature"].startMonth).toEqual({
      year: 1980,
      month: 1,
    });
    expect(byId["air-temperature"].endMonth).toEqual({ year: 2026, month: 3 });
    expect(byId["air-temperature"].endIsHorizon).toBe(false);
    expect(byId["air-temperature"].spanMonths).toBe(555);
    expect(byId["air-temperature"].spanYears).toBe(46.3);
    expect(byId["air-temperature"].tier).toBe("four-decades-plus");

    // GLDAS rainfall/soil publish 2000-01 to 2026-01 (fixed end): 313 months.
    expect(byId["rainfall"].spanMonths).toBe(313);
    expect(byId["rainfall"].endIsHorizon).toBe(false);
    expect(byId["rainfall"].spanYears).toBe(26.1);
    expect(byId["rainfall"].tier).toBe("two-decades");
    expect(byId["soil-moisture"].spanMonths).toBe(313);

    // NDVI (MOD13A3) is open-ended: it closes at the supplied horizon and is
    // flagged. 2000-03 to 2026-03 inclusive = 313 months.
    expect(byId["vegetation"].endIsHorizon).toBe(true);
    expect(byId["vegetation"].endMonth).toEqual(AS_OF);
    expect(byId["vegetation"].spanMonths).toBe(313);
  });

  it("identifies the deepest and shallowest archives and their spread", () => {
    const summary = summarizeBriefRecordDepth(signalsFor(USABLE_INPUT), {
      asOf: AS_OF,
    });

    expect(summary.deepest?.signalId).toBe("air-temperature");
    expect(summary.shallowest?.signalId).toBe("vegetation");
    expect(summary.spreadMonths).toBe(555 - 313);
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
    expect(airtemp?.spanMonths).toBe(555);
  });

  it("closes open-ended products at the supplied horizon only", () => {
    const early = summarizeBriefRecordDepth(signalsFor(USABLE_INPUT), {
      asOf: { year: 2020, month: 3 },
    });
    const byIdEarly = Object.fromEntries(
      early.depths.map((d) => [d.signalId, d])
    );
    // NDVI (open-ended) shrinks with an earlier horizon...
    expect(byIdEarly["vegetation"].endMonth).toEqual({ year: 2020, month: 3 });
    expect(byIdEarly["vegetation"].spanMonths).toBe(241);
    // ...while fixed-end products ignore the horizon entirely.
    expect(byIdEarly["air-temperature"].endMonth).toEqual({
      year: 2026,
      month: 3,
    });
    expect(byIdEarly["rainfall"].spanMonths).toBe(313);
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
