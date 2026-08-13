import { describe, it, expect } from "vitest";
import { emptySnowProbeNote, isUndrawnZeroLayer } from "./snowProbeAbsence";
import { snowAveragedSupportNote } from "./snowAveragedSupport";
import { LAYERS, type LayerId } from "./timeline";
import {
  MEASURED_SNOW_COVER_INVERSION,
  SNOW_COVER_COLORMAP_DOC,
} from "./snowCoverRamp";
import { NO_DATA_DISTANCE } from "./probe";

const EMPTY = [null, null, null, null];

describe("empty snow-cover probe record", () => {
  it("classifies snow as the app's transparent-zero layer", () => {
    expect(isUndrawnZeroLayer("snow")).toBe(true);
  });

  it("leaves every other layer unclassified rather than guessing", () => {
    // Including the other land-only products: an unclassified layer must
    // produce no note at all, not a plausible one.
    const others: LayerId[] = [
      "ndvi",
      "evi",
      "lst",
      "airtemp",
      "aerosol",
      "precip",
      "soil",
      "sst",
      "landcover",
      "terrain",
    ];
    for (const id of others) {
      expect(isUndrawnZeroLayer(id)).toBe(false);
      expect(emptySnowProbeNote(id, EMPTY)).toBeNull();
    }
    // An absent layer id is unclassified too, not a crash.
    expect(isUndrawnZeroLayer(undefined)).toBe(false);
    expect(emptySnowProbeNote(undefined, EMPTY)).toBeNull();
  });

  it("explains an empty snow record by the transparent zero band", () => {
    const note = emptySnowProbeNote("snow", EMPTY);

    expect(note).toContain("no sampled month drew snow at this point");
    expect(note).toContain("renders percent 0 transparent");
    expect(note).toContain(SNOW_COVER_COLORMAP_DOC);
  });

  it("refuses both readings the empty record cannot separate", () => {
    const note = emptySnowProbeNote("snow", EMPTY) ?? "";

    // Neither a measurement of no snow...
    expect(note).toContain("neither a reading of 0 %");
    // ...nor the retrieval failure the generic panel sentence implies.
    expect(note).toContain("nor evidence of a failed retrieval");
    expect(note).toContain("indistinguishable");
    // It never places the point on any particular surface.
    expect(note).not.toMatch(/this point is|you clicked|over land|over water/i);
  });

  it("names the flag classes as rejected, not decoded", () => {
    const note = emptySnowProbeNote("snow", EMPTY) ?? "";

    expect(note).toContain("observation flags the probe rejects");
    // The claim above is only honest because the inversion really does reject
    // them; snowCoverRamp.test.ts measures it, this pins the dependency.
    expect(MEASURED_SNOW_COVER_INVERSION.tightestFlagDistance).toBeGreaterThan(
      NO_DATA_DISTANCE
    );
  });

  it("cites the rendered product", () => {
    const note = emptySnowProbeNote("snow", EMPTY) ?? "";
    const dataset = LAYERS.snow.dataset;

    expect(dataset).toBeDefined();
    expect(note).toContain(`${dataset?.shortName} v${dataset?.version}`);
    expect(note.startsWith(`${LAYERS.snow.label}:`)).toBe(true);
  });

  it("stays silent whenever any month charted a value", () => {
    // A partially empty record is an ordinary readout; only an all-empty one
    // gets the generic "no data" sentence this note replaces.
    expect(emptySnowProbeNote("snow", [null, 12, null])).toBeNull();
    expect(emptySnowProbeNote("snow", [0])).toBeNull();
    // Non-finite entries are not values.
    expect(emptySnowProbeNote("snow", [Number.NaN, null])).not.toBeNull();
  });

  it("defers to an absence note another module already produced", () => {
    expect(
      emptySnowProbeNote("snow", EMPTY, "no month charted a drawn snow mean")
    ).toBeNull();
    // An empty string is not a sentence, so the note still speaks.
    expect(emptySnowProbeNote("snow", EMPTY, "")).not.toBeNull();
    expect(emptySnowProbeNote("snow", EMPTY, null)).not.toBeNull();
  });

  it("covers exactly the mode the share-based clause cannot", () => {
    // Area and drawn-region probes supply validFractions, so the averaged
    // clause explains their empty record and this module defers.
    const areaClause = snowAveragedSupportNote(
      "snow",
      "sampled-area",
      EMPTY,
      [0.4, 0.4, 0.4, 0.4]
    );
    expect(areaClause).not.toBeNull();
    expect(emptySnowProbeNote("snow", EMPTY, areaClause)).toBeNull();

    // A point probe supplies none, so that clause is null and this one speaks
    // — the hole this module exists to fill.
    const pointClause = snowAveragedSupportNote(
      "snow",
      "sampled-area",
      EMPTY,
      null
    );
    expect(pointClause).toBeNull();
    expect(emptySnowProbeNote("snow", EMPTY, pointClause)).not.toBeNull();
  });
});
