import { describe, expect, it } from "vitest";
import { composeEnvironmentBrief } from "./environmentBrief";
import { unsupportedBriefLanguageHits } from "./environmentBrief";
import {
  auditBriefCitationConsistency,
  auditCitationConsistency,
  type LabeledCitation,
} from "./citationConsistency";
import { LAYERS, LAYER_ORDER, type DatasetRef } from "./timeline";

const NDVI: DatasetRef = {
  shortName: "MOD13A3",
  version: "061",
  doi: "10.5067/MODIS/MOD13A3.061",
  title: "MODIS/Terra Vegetation Indices Monthly L3 Global 1km",
};

// Rainfall and soil moisture are both GLDAS — one DOI, cited once. This shared
// DOI is exactly what the consistency check must guard.
const GLDAS: DatasetRef = {
  shortName: "GLDAS_NOAH025_M",
  version: "2.1",
  doi: "10.5067/SXAVCZFAQLNO",
  title: "GLDAS Noah Land Surface Model L4 monthly 0.25 x 0.25 degree V2.1",
};

const labeled = (source: DatasetRef, label: string): LabeledCitation => ({
  source,
  label,
});

describe("auditCitationConsistency", () => {
  it("passes when refs sharing a DOI carry identical identifying metadata", () => {
    const audit = auditCitationConsistency([
      labeled(NDVI, "ndvi"),
      labeled({ ...NDVI }, "evi"),
      labeled(GLDAS, "rainfall"),
      labeled({ ...GLDAS }, "soil-moisture"),
    ]);
    expect(audit.consistent).toBe(true);
    expect(audit.conflictingDois).toEqual([]);
    // Two DOIs are each shared by two refs; both distinct-DOI groups appear.
    expect(audit.sharedDois.map((group) => group.doi)).toEqual([
      NDVI.doi,
      GLDAS.doi,
    ]);
    expect(audit.sharedDois[0].members).toEqual(["ndvi", "evi"]);
    expect(audit.sharedDois[1].members).toEqual(["rainfall", "soil-moisture"]);
    expect(audit.statement).toBe(
      "All 2 shared DOIs carry consistent citation metadata across their sources."
    );
    expect(unsupportedBriefLanguageHits(audit.statement)).toEqual([]);
  });

  it("flags a version drift between two refs sharing one DOI", () => {
    // The motivating defect: a catalog re-point leaves soil moisture on GLDAS
    // v2.0 while rainfall stays on v2.1 — same DOI, so the dedup would keep only
    // the first-seen version and silently discard the other.
    const audit = auditCitationConsistency([
      labeled(GLDAS, "rainfall"),
      labeled({ ...GLDAS, version: "2.0" }, "soil-moisture"),
    ]);
    expect(audit.consistent).toBe(false);
    expect(audit.conflictingDois).toEqual([GLDAS.doi]);
    expect(audit.sharedDois).toHaveLength(1);
    const group = audit.sharedDois[0];
    expect(group.consistent).toBe(false);
    expect(group.members).toEqual(["rainfall", "soil-moisture"]);
    expect(group.conflicts).toEqual([
      {
        field: "version",
        values: ["2.1", "2.0"],
        detail: 'version disagrees across the shared DOI: "2.1" vs "2.0"',
      },
    ]);
    expect(audit.statement).toBe(
      "1 of 1 shared DOI carry conflicting citation metadata: 10.5067/SXAVCZFAQLNO."
    );
    expect(unsupportedBriefLanguageHits(audit.statement)).toEqual([]);
  });

  it("reports every disagreeing field within one group, in field order", () => {
    const audit = auditCitationConsistency([
      labeled(GLDAS, "rainfall"),
      labeled(
        { ...GLDAS, shortName: "GLDAS_NOAH10_M", title: "A different title" },
        "soil-moisture"
      ),
    ]);
    expect(audit.sharedDois[0].conflicts.map((c) => c.field)).toEqual([
      "shortName",
      "title",
    ]);
  });

  it("treats a trailing-whitespace-only difference as agreement, not a conflict", () => {
    const audit = auditCitationConsistency([
      labeled(GLDAS, "rainfall"),
      labeled({ ...GLDAS, version: " 2.1 " }, "soil-moisture"),
    ]);
    expect(audit.consistent).toBe(true);
    expect(audit.sharedDois[0].conflicts).toEqual([]);
  });

  it("groups by trimmed DOI so surrounding whitespace still collapses", () => {
    const audit = auditCitationConsistency([
      labeled(GLDAS, "rainfall"),
      labeled({ ...GLDAS, doi: `  ${GLDAS.doi}  ` }, "soil-moisture"),
    ]);
    expect(audit.sharedDois).toHaveLength(1);
    expect(audit.sharedDois[0].doi).toBe(GLDAS.doi);
    expect(audit.sharedDois[0].members).toEqual(["rainfall", "soil-moisture"]);
  });

  it("ignores a DOI carried by only one ref — nothing to cross-check", () => {
    const audit = auditCitationConsistency([
      labeled(NDVI, "ndvi"),
      labeled(GLDAS, "rainfall"),
    ]);
    expect(audit.consistent).toBe(true);
    expect(audit.sharedDois).toEqual([]);
    expect(audit.statement).toBe(
      "No DOI is shared by multiple citations; nothing to cross-check."
    );
  });

  it("skips blank/absent DOIs — those are completeness defects, not conflicts", () => {
    // Two refs with an empty DOI must not be grouped together as a shared DOI.
    const audit = auditCitationConsistency([
      labeled({ ...NDVI, doi: "" }, "a"),
      labeled({ ...GLDAS, doi: "   " }, "b"),
    ]);
    expect(audit.sharedDois).toEqual([]);
    expect(audit.consistent).toBe(true);
  });

  it("surfaces a blank identifying field as a disagreement with the sibling", () => {
    const audit = auditCitationConsistency([
      labeled(GLDAS, "rainfall"),
      labeled({ ...GLDAS, version: "" }, "soil-moisture"),
    ]);
    expect(audit.consistent).toBe(false);
    expect(audit.sharedDois[0].conflicts[0]).toMatchObject({
      field: "version",
      values: ["2.1", ""],
    });
  });

  it("handles three-way sharing and lists every distinct value", () => {
    const audit = auditCitationConsistency([
      labeled(GLDAS, "a"),
      labeled({ ...GLDAS, version: "2.0" }, "b"),
      labeled({ ...GLDAS, version: "2.2" }, "c"),
    ]);
    expect(audit.sharedDois[0].members).toEqual(["a", "b", "c"]);
    expect(audit.sharedDois[0].conflicts[0].values).toEqual([
      "2.1",
      "2.0",
      "2.2",
    ]);
  });

  it("handles an empty input honestly", () => {
    const audit = auditCitationConsistency([]);
    expect(audit.consistent).toBe(true);
    expect(audit.sharedDois).toEqual([]);
    expect(audit.statement).toBe(
      "No DOI is shared by multiple citations; nothing to cross-check."
    );
  });
});

describe("auditBriefCitationConsistency", () => {
  it("confirms a real composed brief's shared GLDAS DOI is consistent", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
      rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0.00012 },
      soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6.4 },
      airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289.4 },
      availableThrough: { year: 2026, month: 3 },
    });
    const audit = auditBriefCitationConsistency(brief);
    expect(audit.consistent).toBe(true);
    // Rainfall and soil moisture share the GLDAS DOI; that group is checked.
    expect(audit.sharedDois).toHaveLength(1);
    expect(audit.sharedDois[0].members).toEqual(["rainfall", "soil-moisture"]);
    expect(unsupportedBriefLanguageHits(audit.statement)).toEqual([]);
  });

  it("names the disagreeing signals when a shared-DOI citation drifts", () => {
    const brief = composeEnvironmentBrief({
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
      rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0.00012 },
      soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6.4 },
      airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289.4 },
      availableThrough: { year: 2026, month: 3 },
    });
    // Corrupt one of the two GLDAS signals the way a bad catalog re-point might.
    const soil = brief.signals.find((s) => s.id === "soil-moisture")!;
    soil.source = { ...soil.source, version: "2.0" };

    const audit = auditBriefCitationConsistency(brief);
    expect(audit.consistent).toBe(false);
    expect(audit.conflictingDois).toEqual([soil.source.doi]);
    expect(audit.sharedDois[0].members).toEqual(["rainfall", "soil-moisture"]);
    expect(audit.sharedDois[0].conflicts[0].field).toBe("version");
  });

  it("guards the live layer catalog: shared DOIs agree across layers", () => {
    // Real-data guard. Several layers share a product DOI (ndvi/evi are MOD13A3;
    // the two GLDAS layers share a DOI). Every such group must agree, or the
    // dedup-by-DOI credit paths would emit an order-dependent citation.
    const entries: LabeledCitation[] = LAYER_ORDER.flatMap((id) => {
      const dataset = LAYERS[id].dataset;
      return dataset ? [{ source: dataset, label: LAYERS[id].label }] : [];
    });
    const audit = auditCitationConsistency(entries);
    expect(entries.length).toBeGreaterThan(0);
    expect(audit.sharedDois.length).toBeGreaterThan(0);
    expect(audit.consistent).toBe(true);
    expect(audit.conflictingDois).toEqual([]);
  });
});
