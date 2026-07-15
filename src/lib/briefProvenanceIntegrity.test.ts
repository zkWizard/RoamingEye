import { describe, expect, it } from "vitest";
import {
  composeEnvironmentBrief,
  unsupportedBriefLanguageHits,
  type EnvironmentBrief,
} from "./environmentBrief";
import { auditBriefIntegrity } from "./briefProvenanceIntegrity";

/** A fully usable four-signal brief with contemporaneous months. */
function soundBrief(): EnvironmentBrief {
  return composeEnvironmentBrief({
    vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
    rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0.00012 },
    soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6.4 },
    airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289.4 },
    availableThrough: { year: 2026, month: 3 },
  });
}

describe("auditBriefIntegrity", () => {
  it("passes every check on a real, well-formed composed brief", () => {
    const report = auditBriefIntegrity(soundBrief());

    expect(report.sound).toBe(true);
    expect(report.failedCheckIds).toEqual([]);
    expect(report.checks.map((c) => c.id)).toEqual([
      "citations-complete",
      "language-bounded",
      "status-accounted",
    ]);
    expect(report.checks.every((c) => c.passed)).toBe(true);
    expect(report.incompleteCitationSignalIds).toEqual([]);
    expect(report.unsupportedLanguageHits).toEqual([]);
  });

  it("is sound for a brief with no usable observations (structure, not fitness)", () => {
    // A brief where every signal is unavailable is still provenance-complete:
    // the gate judges integrity, never whether the data is present or useful.
    const report = auditBriefIntegrity(
      composeEnvironmentBrief({
        vegetation: null,
        rainfall: null,
        soilMoisture: null,
        airTemperature: null,
        availableThrough: { year: 2026, month: 3 },
      })
    );
    expect(report.sound).toBe(true);
    expect(report.failedCheckIds).toEqual([]);
  });

  it("fails citations-complete when a signal's DatasetRef degrades", () => {
    const brief = soundBrief();
    // Corrupt one citation the way a bad catalog re-point might.
    brief.signals[3].source = { ...brief.signals[3].source, doi: "not-a-doi" };

    const report = auditBriefIntegrity(brief);
    expect(report.sound).toBe(false);
    expect(report.failedCheckIds).toEqual(["citations-complete"]);
    expect(report.incompleteCitationSignalIds).toEqual(["air-temperature"]);
    const check = report.checks.find((c) => c.id === "citations-complete")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("air-temperature");
  });

  it("catches unsupported-claim language in a DERIVED statement the brief itself misses", () => {
    const brief = soundBrief();
    // The brief's own `unsupportedLanguageHits` only scans per-signal
    // statements, so an over-claim planted in a derived sentence slips past it.
    brief.completeness.statement = "Usable observations indicate flood risk.";
    expect(brief.unsupportedLanguageHits).toEqual([]);

    const report = auditBriefIntegrity(brief);
    expect(report.sound).toBe(false);
    expect(report.failedCheckIds).toEqual(["language-bounded"]);
    expect(report.unsupportedLanguageHits).toContain("risk");
  });

  it("catches unsupported-claim language in a per-signal statement", () => {
    const brief = soundBrief();
    brief.statements = [
      ...brief.statements,
      "Vegetation greenness will forecast next month.",
    ];

    const report = auditBriefIntegrity(brief);
    expect(report.sound).toBe(false);
    expect(report.unsupportedLanguageHits).toContain("forecast");
  });

  it("deduplicates repeated language hits across the prose surface", () => {
    const brief = soundBrief();
    brief.statements = [...brief.statements, "risk here"];
    brief.completeness.statement = "risk there too";

    const report = auditBriefIntegrity(brief);
    expect(report.unsupportedLanguageHits).toEqual(["risk"]);
  });

  it("fails status-accounted when the completeness tally disagrees with the signals", () => {
    const brief = soundBrief();
    // A degraded brief whose headline tally no longer matches its signals.
    brief.completeness.available = 3;
    brief.completeness.byStatus.available = 3;

    const report = auditBriefIntegrity(brief);
    expect(report.sound).toBe(false);
    expect(report.failedCheckIds).toContain("status-accounted");
    const check = report.checks.find((c) => c.id === "status-accounted")!;
    expect(check.detail).toContain("available");
  });

  it("fails status-accounted when the total no longer matches the signal count", () => {
    const brief = soundBrief();
    brief.completeness.total = 5;

    const report = auditBriefIntegrity(brief);
    expect(report.sound).toBe(false);
    expect(report.failedCheckIds).toContain("status-accounted");
  });

  it("flags an unknown signal status as unaccounted", () => {
    const brief = soundBrief();
    // Force a status outside the known set (the static type would forbid it).
    (brief.signals[0] as { status: string }).status = "bogus";

    const report = auditBriefIntegrity(brief);
    expect(report.sound).toBe(false);
    expect(report.failedCheckIds).toContain("status-accounted");
    const check = report.checks.find((c) => c.id === "status-accounted")!;
    expect(check.detail).toContain("unknown status");
  });

  it("reports multiple simultaneous failures, in fixed check order", () => {
    const brief = soundBrief();
    brief.signals[0].source = { ...brief.signals[0].source, doi: "" };
    brief.completeness.statement = "elevated hazard here";

    const report = auditBriefIntegrity(brief);
    expect(report.sound).toBe(false);
    expect(report.failedCheckIds).toEqual([
      "citations-complete",
      "language-bounded",
    ]);
  });

  it("handles an empty brief honestly", () => {
    const report = auditBriefIntegrity({
      signals: [],
      statements: [],
      completeness: {
        total: 0,
        available: 0,
        byStatus: { available: 0, "no-data": 0, invalid: 0, unavailable: 0 },
        availableSignalIds: [],
        usableFraction: 0,
        statement: "No signals composed.",
      },
      temporalAlignment: {
        comparedSignalIds: [],
        earliestMonth: null,
        latestMonth: null,
        spanMonths: null,
        aligned: false,
        statement: "No usable observations to compare across time.",
      },
    });
    expect(report.sound).toBe(true);
    expect(report.checks).toHaveLength(3);
  });

  it("keeps its own report prose within the honest-language screen", () => {
    const sound = auditBriefIntegrity(soundBrief());
    for (const text of [
      sound.statement,
      ...sound.checks.map((c) => c.detail),
      ...sound.limits,
    ]) {
      expect(unsupportedBriefLanguageHits(text)).toEqual([]);
    }

    // The failure statement must also stay clean of the vocabulary it screens.
    const brief = soundBrief();
    brief.completeness.total = 99;
    const failed = auditBriefIntegrity(brief);
    expect(unsupportedBriefLanguageHits(failed.statement)).toEqual([]);
  });
});
