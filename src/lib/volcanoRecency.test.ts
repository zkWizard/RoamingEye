import { describe, expect, it } from "vitest";
import type { Volcano } from "./volcanoes";
import {
  ERUPTION_CLASS_ORDER,
  eruptionRecencyText,
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
      units: {
        lastEruptionYear:
          "source calendar year; negative values are BCE and zero is preserved without era conversion",
      },
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

  it("uses the 1900 and GVP source-year-zero class boundaries inclusively", () => {
    const summary = summarizeEruptionRecency([
      volcano({ lastEruptionYear: 1900 }), // recent (>= 1900)
      volcano({ lastEruptionYear: 1899 }), // historic
      volcano({ lastEruptionYear: 1 }), // historic
      volcano({ lastEruptionYear: 0 }), // historic (GVP source year)
    ]);

    expect(summary.recencyClassCounts).toEqual({
      recent: 1,
      historic: 3,
      holocene: 0,
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

  it("tallies any record shape that carries the GVP eruption-year field", () => {
    // Search-extent records are derived from markers and are not Volcano
    // objects; the tally must not require widening them back into markers.
    const summary = summarizeEruptionRecency([
      { lastEruptionYear: 2021 },
      { lastEruptionYear: null },
    ]);

    expect(summary.recencyClassCounts).toEqual({
      recent: 1,
      historic: 0,
      holocene: 1,
    });
  });
});

describe("eruptionRecencyText", () => {
  it("states the class boundaries and the counted set, not a hazard claim", () => {
    const text = eruptionRecencyText(
      summarizeEruptionRecency([
        volcano({ lastEruptionYear: 2025 }),
        volcano({ lastEruptionYear: 1944 }),
        volcano({ lastEruptionYear: 1650 }),
        volcano({ lastEruptionYear: null }),
      ])
    );

    expect(text).toContain("all 4 matched records");
    expect(text).toContain("2 dated 1900 or later");
    expect(text).toContain("1 dated between source year 0 and 1899");
    expect(text).toContain("1 with Holocene evidence only");
    expect(text).toContain("Dated eruption years span 1650 to 2025.");
    expect(text).toMatch(/not a hazard ranking/i);
    expect(text).toMatch(/not a measure of current activity/i);
  });

  it("agrees in number for a single matched record", () => {
    const text = eruptionRecencyText(
      summarizeEruptionRecency([volcano({ lastEruptionYear: 1902 })])
    );

    expect(text).toContain("all 1 matched record:");
    expect(text).toContain("Dated eruption years span 1902 to 1902.");
  });

  it("reports BCE and GVP source year zero without a fake civil era", () => {
    const text = eruptionRecencyText(
      summarizeEruptionRecency([
        volcano({ lastEruptionYear: -5600 }),
        volcano({ lastEruptionYear: 0 }),
      ])
    );

    expect(text).toContain(
      "Dated eruption years span 5600 BCE to source year 0."
    );
    expect(text).not.toContain("-5600");
    // Year 0 must never be rendered as "0 BCE"; there is no such year.
    expect(text).not.toMatch(/(?<!\d)0 BCE/);
    // The BCE record is a dated eruption, so it must not be reported under a
    // label that reads as "no dated eruption".
    expect(text).toContain("1 dated BCE");
    expect(text).not.toContain("Holocene evidence only");
  });

  it("separates BCE-dated records from undated ones in the same class", () => {
    // eruptionClass puts both in "holocene", but they are different
    // observations: GVP dates the first eruption and records none for the
    // second. One label for both would misdescribe one of them.
    const text = eruptionRecencyText(
      summarizeEruptionRecency([
        volcano({ lastEruptionYear: -6850 }),
        volcano({ lastEruptionYear: -50 }),
        volcano({ lastEruptionYear: null }),
      ])
    );

    expect(text).toContain(
      "2 dated BCE, 1 with no dated eruption (Holocene evidence only)"
    );
    expect(text).toContain("Dated eruption years span 6850 BCE to 50 BCE.");
  });

  it("omits the year span when no matched record carries a dated eruption", () => {
    const text = eruptionRecencyText(
      summarizeEruptionRecency([volcano({ lastEruptionYear: null })])
    );

    expect(text).toContain("1 with Holocene evidence only.");
    expect(text).not.toMatch(/span/i);
    // With nothing dated BCE, naming that state would read as a finding.
    expect(text).not.toContain("dated BCE");
  });

  it("keeps the three class counts summing to the counted set", () => {
    const records = [
      volcano({ lastEruptionYear: 2025 }),
      volcano({ lastEruptionYear: 1650 }),
      volcano({ lastEruptionYear: -6850 }),
      volcano({ lastEruptionYear: null }),
    ];
    const summary = summarizeEruptionRecency(records);
    const text = eruptionRecencyText(summary) ?? "";
    const counted = [...text.matchAll(/(\d+) (?:dated|with)/g)].reduce(
      (total, [, value]) => total + Number(value),
      0
    );

    // The reported states partition the set exactly once: splitting the third
    // class in the wording must not double-count or drop a record.
    expect(counted).toBe(records.length);
  });

  it("returns null for an empty set rather than a row of zeroes", () => {
    // Zero counts across three classes would read as a finding about the
    // place; there is simply nothing to characterise.
    expect(eruptionRecencyText(summarizeEruptionRecency([]))).toBeNull();
  });
});
