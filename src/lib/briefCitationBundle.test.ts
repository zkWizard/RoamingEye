import { describe, expect, it } from "vitest";
import {
  acknowledgment,
  briefCitationBundle,
  briefCitedDatasets,
} from "./briefCitationBundle";
import {
  bibtexDataset,
  bibtexTool,
  cslTool,
  risTool,
  textTool,
  type CslItem,
} from "./citation";
import {
  composeEnvironmentBrief,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import { GIBS_ACKNOWLEDGMENT } from "./providers";

/** A full four-signal brief dated to a single, published month. */
function fullBrief() {
  return composeEnvironmentBrief({
    vegetation: { dataMonth: { year: 2026, month: 1 }, value: 0.61 },
    rainfall: { dataMonth: { year: 2026, month: 1 }, value: 0.00012 },
    soilMoisture: { dataMonth: { year: 2026, month: 1 }, value: 6.4 },
    airTemperature: { dataMonth: { year: 2026, month: 1 }, value: 289.4 },
    availableThrough: { year: 2026, month: 1 },
  });
}

describe("brief-scoped citation bundle", () => {
  it("cites exactly the brief's sources, deduped by DOI in first-seen order", () => {
    const datasets = briefCitedDatasets(fullBrief().signals);

    // Rainfall and soil moisture are both GLDAS (one DOI): three distinct
    // sources, not four, with the shared product listed once.
    expect(datasets.map((d) => d.shortName)).toEqual([
      "MOD13A3",
      "GLDAS_NOAH025_M",
      "M2TMNXSLV",
    ]);
  });

  it("mirrors citationBundle's shape: tool first, then the deduped datasets", () => {
    const datasets = briefCitedDatasets(fullBrief().signals);
    const expected =
      [bibtexTool(), ...datasets.map(bibtexDataset)].join("\n\n") + "\n";

    const bundle = briefCitationBundle(fullBrief().signals, "bibtex");
    expect(bundle).toBe(expected);
    expect(bundle.startsWith(bibtexTool())).toBe(true);
    // GLDAS is cited once even though two signals draw on it.
    expect(bundle.match(/GLDAS_NOAH025_M/g)).toHaveLength(1);
    expect(bundle.endsWith("\n")).toBe(true);
  });

  it("emits RIS entries a reference manager can ingest", () => {
    const bundle = briefCitationBundle(fullBrief().signals, "ris");
    expect(bundle.startsWith(risTool())).toBe(true);
    // One DATA record per distinct source (3), plus the tool's COMP record.
    expect(bundle.match(/TY {2}- DATA/g)).toHaveLength(3);
    expect(bundle.match(/TY {2}- COMP/g)).toHaveLength(1);
    expect(bundle).toContain("DO  - 10.5067/SXAVCZFAQLNO");
  });

  it("emits human-readable text citations with resolvable DOIs", () => {
    const bundle = briefCitationBundle(fullBrief().signals, "text");
    expect(bundle.startsWith(textTool())).toBe(true);
    expect(bundle).toContain("https://doi.org/10.5067/MODIS/MOD13A3.061");
    // The shared GLDAS product resolves once.
    expect(bundle.match(/10\.5067\/SXAVCZFAQLNO/g)).toHaveLength(1);
  });

  it("emits CSL-JSON scoped to the brief (tool + deduped datasets), not BibTeX", () => {
    const signals = fullBrief().signals;
    const bundle = briefCitationBundle(signals, "csljson");
    // Guards the fall-through: 'csljson' must NOT silently return BibTeX.
    expect(bundle).not.toContain("@software{");
    const items = JSON.parse(bundle) as CslItem[];
    expect(items[0]).toMatchObject({ id: "roamingeye", type: "software" });

    // Exactly the brief's own sources (GLDAS deduped to one), each resolvable —
    // identical to the credit line, so the two can never disagree.
    const expectedDois = briefCitedDatasets(signals).map((d) => d.doi);
    expect(expectedDois).toHaveLength(3); // MOD13A3, GLDAS (shared), MERRA-2
    const datasets = items.filter((i) => i.type === "dataset");
    expect(datasets.map((i) => i.DOI)).toEqual(expectedDois);
    for (const item of datasets) {
      expect(item.URL).toBe(`https://doi.org/${item.DOI}`);
    }
  });

  it("cites just the tool as CSL-JSON for an empty brief", () => {
    const empty: EnvironmentSignalBrief[] = [];
    const items = JSON.parse(
      briefCitationBundle(empty, "csljson")
    ) as CslItem[];
    expect(items).toEqual([cslTool()]);
  });

  it("still cites a source the brief consulted that returned no usable value", () => {
    const brief = composeEnvironmentBrief({
      // Vegetation has a data month but a null (no-data) value.
      vegetation: { dataMonth: { year: 2026, month: 1 }, value: null },
      rainfall: null,
      soilMoisture: null,
      airTemperature: null,
      availableThrough: { year: 2026, month: 1 },
    });

    // Every signal still carries its canonical source, so the whole basis is
    // cited even when no signal yielded a usable value — provenance is never
    // silently dropped from the citation.
    const datasets = briefCitedDatasets(brief.signals);
    expect(datasets.map((d) => d.shortName)).toEqual([
      "MOD13A3",
      "GLDAS_NOAH025_M",
      "M2TMNXSLV",
    ]);
    expect(briefCitationBundle(brief.signals, "bibtex")).toContain("MOD13A3");
  });

  it("cites just the tool for an empty brief", () => {
    const empty: EnvironmentSignalBrief[] = [];
    expect(briefCitedDatasets(empty)).toEqual([]);
    expect(briefCitationBundle(empty, "bibtex")).toBe(bibtexTool() + "\n");
    expect(briefCitationBundle(empty, "ris")).toBe(risTool() + "\n");
    expect(briefCitationBundle(empty, "text")).toBe(textTool() + "\n");
  });

  it("re-exports the GIBS acknowledgment verbatim for the acknowledgments section", () => {
    expect(acknowledgment).toBe(GIBS_ACKNOWLEDGMENT);
    // The reference-manager bundle itself does not inject it.
    expect(briefCitationBundle(fullBrief().signals, "bibtex")).not.toContain(
      GIBS_ACKNOWLEDGMENT
    );
  });
});
