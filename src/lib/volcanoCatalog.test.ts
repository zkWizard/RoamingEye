import { describe, expect, it } from "vitest";
import { parseVolcanoCatalog } from "./volcanoCatalog";

const etna = {
  volcanoNumber: 211060,
  name: "Etna",
  lat: 37.748,
  lon: 14.999,
  type: "Stratovolcano",
  elevation: 3357,
  lastEruptionYear: 2025,
  country: "Italy",
};

describe("parseVolcanoCatalog", () => {
  it("preserves parser coverage and static source context", () => {
    const snapshot = parseVolcanoCatalog([
      etna,
      { ...etna, name: "" },
      { ...etna, name: "Invalid latitude", lat: 95 },
    ]);

    expect(snapshot).toMatchObject({
      kind: "gvp-volcano-catalog-snapshot",
      status: "available",
      suppliedRecordCount: 3,
      parsedRecordCount: 1,
      droppedRecordCount: 2,
      dataMonth: null,
      temporalCoverage: "static-bundled-snapshot",
      provenance: {
        org: "Smithsonian Institution Global Volcanism Program",
        localFile: "public/data/volcanoes.json",
      },
    });
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.records[0]).toMatchObject({
      name: "Etna",
      elevation: 3357,
      lastEruptionYear: 2025,
    });
    expect(snapshot.geographicCoverage).toContain(
      "geographic completeness is not independently assessed"
    );
    expect(snapshot.limitations.join(" ")).toContain(
      "do not establish catalog completeness"
    );
  });

  it("distinguishes a valid empty catalog from an unavailable root", () => {
    expect(parseVolcanoCatalog([])).toMatchObject({
      status: "available",
      suppliedRecordCount: 0,
      parsedRecordCount: 0,
      droppedRecordCount: 0,
      records: [],
    });

    expect(parseVolcanoCatalog({ records: [] })).toMatchObject({
      status: "invalid-root",
      suppliedRecordCount: null,
      parsedRecordCount: 0,
      droppedRecordCount: null,
      records: [],
    });
  });
});
