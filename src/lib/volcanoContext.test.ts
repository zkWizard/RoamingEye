import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseVolcanoList, type Volcano } from "./volcanoes";
import {
  GVP_VOLCANO_SOURCE,
  VOLCANO_CONTEXT_UNITS,
  selectedVolcanoContext,
  volcanoSelectionOptions,
} from "./volcanoContext";

const volcano = (overrides: Partial<Volcano> = {}): Volcano => ({
  name: "Etna",
  lat: 37.748,
  lon: 14.999,
  type: "Stratovolcano",
  elevation: 3357,
  lastEruptionYear: 2025,
  country: "Italy",
  ...overrides,
});

describe("selectedVolcanoContext", () => {
  it("reports selected-volcano facts with GVP provenance and native units", () => {
    const context = selectedVolcanoContext(
      [volcano(), volcano({ name: "Vesuvius", lastEruptionYear: 1944 })],
      { name: "Etna", country: "Italy" }
    );

    expect(context).toMatchObject({
      kind: "gvp-selected-volcano-context",
      isForecast: false,
      selection: { name: "Etna", country: "Italy" },
      selected: {
        name: "Etna",
        country: "Italy",
        coordinates: { latitude: 37.748, longitude: 14.999 },
        primaryType: "Stratovolcano",
        elevationMeters: 3357,
        lastEruptionYear: 2025,
        lastEruptionText: "last erupted 2025",
      },
      coverage: {
        status: "selected",
        suppliedRecordCount: 2,
        matchedRecordCount: 1,
        presentFields: [
          "name",
          "country",
          "coordinates",
          "primaryType",
          "elevationMeters",
          "lastEruptionYear",
        ],
        missingFields: [],
      },
      provenance: GVP_VOLCANO_SOURCE,
      units: VOLCANO_CONTEXT_UNITS,
    });
    expect(context.limitations.join(" ")).toContain("Does not forecast");
  });

  it("keeps missing GVP fields visible instead of filling them", () => {
    const context = selectedVolcanoContext(
      [
        volcano({
          country: null,
          type: null,
          elevation: null,
          lastEruptionYear: null,
        }),
      ],
      { name: "Etna" }
    );

    expect(context.selected).toMatchObject({
      country: null,
      primaryType: null,
      elevationMeters: null,
      lastEruptionYear: null,
      lastEruptionText: "Holocene evidence only",
    });
    expect(context.coverage.presentFields).toEqual(["name", "coordinates"]);
    expect(context.coverage.missingFields).toEqual([
      "country",
      "primaryType",
      "elevationMeters",
      "lastEruptionYear",
    ]);
  });

  it("requires disambiguation when a selected name matches multiple records", () => {
    const context = selectedVolcanoContext(
      [
        volcano({ country: "Country A", lat: 1, lon: 2 }),
        volcano({ country: "Country B", lat: 3, lon: 4 }),
      ],
      { name: "etna" }
    );

    expect(context.coverage).toMatchObject({
      status: "ambiguous",
      suppliedRecordCount: 2,
      matchedRecordCount: 2,
      presentFields: [],
      missingFields: [],
    });
    expect(context.selected).toBeNull();
  });

  it("reports not-found selections without inventing a nearby volcano", () => {
    const context = selectedVolcanoContext([volcano()], {
      name: "Not in supplied data",
    });

    expect(context.coverage).toMatchObject({
      status: "not-found",
      suppliedRecordCount: 1,
      matchedRecordCount: 0,
    });
    expect(context.selected).toBeNull();
  });

  it("selects from the bundled Smithsonian GVP-derived volcano file", () => {
    const data = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "public", "data", "volcanoes.json"),
        "utf8"
      )
    );
    const volcanoes = parseVolcanoList(data);
    const context = selectedVolcanoContext(volcanoes, {
      name: "Vesuvius",
      country: "Italy",
    });

    expect(context.coverage.status).toBe("selected");
    expect(context.coverage.suppliedRecordCount).toBeGreaterThanOrEqual(1000);
    expect(context.provenance.localFile).toBe("public/data/volcanoes.json");
    expect(context.selected).toMatchObject({
      name: "Vesuvius",
      country: "Italy",
      primaryType: "Stratovolcano",
      lastEruptionYear: 1944,
    });
  });
});

describe("volcanoSelectionOptions", () => {
  it("builds accessible option labels for exact marker selection", () => {
    const [option] = volcanoSelectionOptions([volcano()]);

    expect(option).toEqual({
      value: "Etna|Italy|37.748|14.999",
      label: "Etna, Italy",
      accessibleLabel:
        "Etna, Italy; Stratovolcano; 3357 metres elevation; last erupted 2025",
      selection: { name: "Etna", country: "Italy" },
    });
  });
});
