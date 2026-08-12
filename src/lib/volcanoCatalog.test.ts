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

/** The provenance envelope scripts/prepare-data.mjs writes to public/data. */
const provenance = {
  source:
    "Smithsonian Institution Global Volcanism Program — Volcanoes of the World",
  sourceUrl: "https://volcano.si.edu/",
  service: "GVP-VOTW WFS",
  retrievedAt: "2026-07-28T07:09:41.058Z",
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

  it("reads the shipped provenance envelope as a usable root", () => {
    const snapshot = parseVolcanoCatalog({
      provenance,
      records: [etna, { ...etna, name: "Invalid latitude", lat: 95 }],
    });

    expect(snapshot).toMatchObject({
      status: "available",
      suppliedRecordCount: 2,
      parsedRecordCount: 1,
      droppedRecordCount: 1,
      dataMonth: "2026-07",
      snapshotProvenance: {
        service: "GVP-VOTW WFS",
        retrievedAt: "2026-07-28T07:09:41.058Z",
      },
    });
    expect(snapshot.records[0]).toMatchObject({ name: "Etna" });
  });

  it("distinguishes a valid empty catalog from an unavailable root", () => {
    expect(parseVolcanoCatalog([])).toMatchObject({
      status: "available",
      suppliedRecordCount: 0,
      parsedRecordCount: 0,
      droppedRecordCount: 0,
      records: [],
    });

    expect(parseVolcanoCatalog({ provenance, records: [] })).toMatchObject({
      status: "available",
      suppliedRecordCount: 0,
      parsedRecordCount: 0,
      droppedRecordCount: 0,
      records: [],
    });

    // No record array in either accepted shape: the dropped-record audit has
    // no denominator, so counts stay null rather than reading as zero drops.
    for (const root of [null, "volcanoes", { records: "Etna" }, {}]) {
      expect(parseVolcanoCatalog(root)).toMatchObject({
        status: "invalid-root",
        suppliedRecordCount: null,
        parsedRecordCount: 0,
        droppedRecordCount: null,
        records: [],
      });
    }
  });

  it("reports no retrieval month when the file publishes no usable provenance", () => {
    expect(parseVolcanoCatalog([etna])).toMatchObject({
      dataMonth: null,
      snapshotProvenance: null,
    });

    // A malformed retrievedAt must not become an invented retrieval month.
    expect(
      parseVolcanoCatalog({
        provenance: { ...provenance, retrievedAt: "last July" },
        records: [etna],
      })
    ).toMatchObject({
      status: "available",
      parsedRecordCount: 1,
      dataMonth: null,
      snapshotProvenance: null,
    });
  });
});
