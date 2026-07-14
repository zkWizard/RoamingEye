import { describe, expect, it } from "vitest";
import { composeEnvironmentBrief } from "./environmentBrief";
import {
  auditBriefCitations,
  auditDatasetCitation,
} from "./citationCompleteness";
import { unsupportedBriefLanguageHits } from "./environmentBrief";
import type { DatasetRef } from "./timeline";

const GOOD: DatasetRef = {
  shortName: "MOD13A3",
  version: "061",
  doi: "10.5067/MODIS/MOD13A3.061",
  title: "MODIS/Terra Vegetation Indices Monthly L3 Global 1 km SIN Grid",
};

describe("auditDatasetCitation", () => {
  it("accepts a complete, well-formed citation", () => {
    const audit = auditDatasetCitation(GOOD);
    expect(audit.complete).toBe(true);
    expect(audit.issues).toEqual([]);
  });

  it("accepts the short-suffix and dotted DOI shapes NASA publishes", () => {
    for (const doi of [
      "10.5067/AP1B0BA5PD2K",
      "10.5067/MODSA-MO9D9",
      "10.5067/MODIS/MCD12Q1.061",
    ]) {
      expect(auditDatasetCitation({ ...GOOD, doi }).complete).toBe(true);
    }
  });

  it("flags each absent required field as missing", () => {
    // Simulate a runtime-degenerate ref that the static type would forbid.
    const degraded = { ...GOOD, version: "", title: "" } as DatasetRef;
    const audit = auditDatasetCitation(degraded);
    expect(audit.complete).toBe(false);
    expect(audit.issues.map((issue) => issue.field)).toEqual([
      "version",
      "title",
    ]);
    expect(audit.issues.every((issue) => issue.code === "missing")).toBe(true);
  });

  it("flags a whitespace-only field as blank, not missing", () => {
    const audit = auditDatasetCitation({ ...GOOD, shortName: "   " });
    expect(audit.complete).toBe(false);
    expect(audit.issues).toEqual([
      { field: "shortName", code: "blank", detail: "shortName is blank" },
    ]);
  });

  it("flags a malformed DOI without double-counting a present field", () => {
    const audit = auditDatasetCitation({
      ...GOOD,
      doi: "https://doi.org/10.5067/MODIS/MOD13A3.061",
    });
    expect(audit.complete).toBe(false);
    expect(audit.issues).toHaveLength(1);
    expect(audit.issues[0]).toMatchObject({
      field: "doi",
      code: "malformed-doi",
    });
  });

  it("reports a missing DOI once (missing), not also malformed", () => {
    const audit = auditDatasetCitation({ ...GOOD, doi: "" });
    expect(audit.issues).toEqual([
      { field: "doi", code: "missing", detail: "doi is absent" },
    ]);
  });

  it("rejects a bare identifier that lost its 10. prefix", () => {
    const audit = auditDatasetCitation({ ...GOOD, doi: "MODIS/MOD13A3.061" });
    expect(audit.complete).toBe(false);
    expect(audit.issues[0].code).toBe("malformed-doi");
  });
});

describe("auditBriefCitations", () => {
  it("confirms a real composed brief keeps every signal fully cited", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
      rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0.00012 },
      soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6.4 },
      airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289.4 },
      availableThrough: { year: 2026, month: 3 },
    });

    const audit = auditBriefCitations(brief);
    expect(audit.allCited).toBe(true);
    expect(audit.incompleteSignalIds).toEqual([]);
    expect(audit.signals).toHaveLength(4);
    expect(audit.statement).toBe(
      "All 4 signals carry a complete, well-formed dataset citation."
    );
    // The summary must stay within the module's own honest-language screen.
    expect(unsupportedBriefLanguageHits(audit.statement)).toEqual([]);
  });

  it("stays cited even when signals are unavailable or unpublished", () => {
    // A provenance-first brief must keep the source even with no usable value.
    const brief = composeEnvironmentBrief({
      vegetation: null,
      rainfall: null,
      soilMoisture: null,
      airTemperature: null,
      availableThrough: { year: 2026, month: 3 },
    });

    const audit = auditBriefCitations(brief);
    expect(brief.signals.every((signal) => signal.status !== "available")).toBe(
      true
    );
    expect(audit.allCited).toBe(true);
    expect(audit.statement).toContain("All 4 signals");
  });

  it("names the offending signals when a citation degrades", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
      rainfall: null,
      soilMoisture: null,
      airTemperature: null,
      availableThrough: { year: 2026, month: 3 },
    });
    // Corrupt one signal's citation the way a bad catalog re-point might.
    brief.signals[0].source = {
      ...brief.signals[0].source,
      doi: "not-a-doi",
    };

    const audit = auditBriefCitations(brief);
    expect(audit.allCited).toBe(false);
    expect(audit.incompleteSignalIds).toEqual(["vegetation"]);
    expect(audit.statement).toBe(
      "1 of 4 signals have an incomplete or malformed citation: vegetation."
    );
  });

  it("handles an empty signal set honestly", () => {
    const audit = auditBriefCitations({ signals: [] });
    expect(audit.allCited).toBe(true);
    expect(audit.incompleteSignalIds).toEqual([]);
    expect(audit.statement).toBe(
      "No signals to check for citation completeness."
    );
  });
});
