import { describe, expect, it } from "vitest";
import type { Volcano } from "./volcanoes";
import {
  ERUPTION_CLASS_ORDER,
  summarizeEruptionRecency,
} from "./volcanoRecency";

const volcano = (overrides: Partial<Volcano> = {}): Volcano => ({
  name: "Etna",
  lat: 37.75,
  lon: 15,
  type: "Stratovolcano",
  elevation: 3357,
  lastEruptionYear: 2025,
  country: "Italy",
  ...overrides,
});

describe("summarizeEruptionRecency", () => {
  it("tallies supplied records by recency class with GVP provenance", () => {
    const summary = summarizeEruptionRecency([
      volcano({ name: "Etna", lastEruptionYear: 2025 }), // recent
      volcano({ name: "Vesuvius", lastEruptionYear: 1944 }), // recent
      volcano({ name: "Santorini", lastEruptionYear: 1650 }), // historic
      volcano({ name: "Ararat", lastEruptionYear: null }), // holocene evidence only
    ]);

    expect(summary).toMatchObject({
      kind: "gvp-eruption-recency-summary",
      isForecast: false,
      volcanoCount: 4,
      recencyClassCounts: { recent: 2, historic: 1, holocene: 1 },
      datedEruptionCount: 3,
      undatedCount: 1,
      lastEruptionYear: { min: 1650, max: 2025 },
      provenance: {
        org: "Smithsonian Institution Global Volcanism Program",
      },
      units: { lastEruptionYear: "calendar year; negative values are BCE" },
    });
  });

  it("bins a BCE-dated eruption as holocene but still counts it as dated", () => {
    const summary = summarizeEruptionRecency([
      volcano({ name: "Old Field", lastEruptionYear: -5600 }),
      volcano({ name: "Undated", lastEruptionYear: null }),
    ]);

    expect(summary.recencyClassCounts).toEqual({
      recent: 0,
      historic: 0,
      holocene: 2,
    });
    // The BCE eruption has a finite year, so it is dated; only the null is not.
    expect(summary.datedEruptionCount).toBe(1);
    expect(summary.undatedCount).toBe(1);
    expect(summary.lastEruptionYear).toEqual({ min: -5600, max: -5600 });
  });

  it("uses the 1900 and 1 CE class boundaries inclusively", () => {
    const summary = summarizeEruptionRecency([
      volcano({ lastEruptionYear: 1900 }), // recent (>= 1900)
      volcano({ lastEruptionYear: 1899 }), // historic
      volcano({ lastEruptionYear: 1 }), // historic (>= 1)
      volcano({ lastEruptionYear: 0 }), // holocene (< 1)
    ]);

    expect(summary.recencyClassCounts).toEqual({
      recent: 1,
      historic: 2,
      holocene: 1,
    });
  });

  it("treats a non-finite eruption year as undated Holocene evidence", () => {
    const summary = summarizeEruptionRecency([
      volcano({ lastEruptionYear: Number.NaN }),
    ]);

    expect(summary.recencyClassCounts).toEqual({
      recent: 0,
      historic: 0,
      holocene: 1,
    });
    expect(summary.datedEruptionCount).toBe(0);
    expect(summary.undatedCount).toBe(1);
    expect(summary.lastEruptionYear).toEqual({ min: null, max: null });
  });

  it("makes an empty input explicit without inventing a year range", () => {
    const summary = summarizeEruptionRecency([]);

    expect(summary.volcanoCount).toBe(0);
    expect(summary.recencyClassCounts).toEqual({
      recent: 0,
      historic: 0,
      holocene: 0,
    });
    expect(summary.datedEruptionCount).toBe(0);
    expect(summary.undatedCount).toBe(0);
    expect(summary.lastEruptionYear).toEqual({ min: null, max: null });
  });

  it("carries honest limitations that disclaim hazard and dormancy", () => {
    const summary = summarizeEruptionRecency([volcano()]);

    expect(summary.limitations.length).toBeGreaterThan(0);
    expect(summary.limitations.join(" ")).toMatch(/do not forecast/i);
    expect(summary.limitations.join(" ")).toMatch(/dormancy/i);
  });

  it("orders recency classes most-recent first for deterministic iteration", () => {
    expect(ERUPTION_CLASS_ORDER).toEqual(["recent", "historic", "holocene"]);
  });
});
