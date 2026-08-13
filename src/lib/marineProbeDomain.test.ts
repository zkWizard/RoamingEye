import { describe, it, expect } from "vitest";
import { emptyMarineProbeNote, isOceanOnlyLayer } from "./marineProbeDomain";
import { LAYERS, type LayerId } from "./timeline";

const EMPTY = [null, null, null, null];

describe("marine probe domain of definition", () => {
  it("classifies SST as the app's only ocean-only layer", () => {
    expect(isOceanOnlyLayer("sst")).toBe(true);
  });

  it("leaves every other layer unclassified rather than guessing", () => {
    // Including the land-only products, whose domain is asserted elsewhere: an
    // unclassified layer must produce no note at all, not a plausible one.
    const others: LayerId[] = [
      "ndvi",
      "evi",
      "lst",
      "airtemp",
      "aerosol",
      "precip",
      "snow",
      "soil",
      "landcover",
      "terrain",
    ];
    for (const id of others) {
      expect(isOceanOnlyLayer(id)).toBe(false);
      expect(emptyMarineProbeNote(id, EMPTY)).toBeNull();
    }
    // An absent layer id is unclassified too, not a crash.
    expect(isOceanOnlyLayer(undefined)).toBe(false);
    expect(emptyMarineProbeNote(undefined, EMPTY)).toBeNull();
  });

  it("explains an empty SST record by the ocean domain", () => {
    const note = emptyMarineProbeNote("sst", EMPTY);

    expect(note).toContain("defined over the ocean surface only");
    expect(note).toContain("masks land");
    // Conditional, never a claim about this particular location.
    expect(note).toContain("consistent with a point outside that domain");
  });

  it("refuses to let an absence locate the point", () => {
    // The whole reason this module cannot mirror the land-only wording: SST is
    // not defined on every ocean cell either, so an empty record is equally
    // consistent with an ice-covered or persistently clouded water point.
    const note = emptyMarineProbeNote("sst", EMPTY);

    expect(note).toContain("sea ice, persistent cloud, and missing swaths");
    expect(note).toContain("does not by itself say which");
    // It must never assert the surface class it cannot see — inferring "land"
    // from a missing value is exactly what lib/sstNoData.ts warns against.
    expect(note).not.toMatch(/\b(this point|you) (is|are|clicked)/i);
    expect(note).not.toMatch(/\bover land\b/i);
  });

  it("never infers a temperature or a biological outcome from the absence", () => {
    const note = emptyMarineProbeNote("sst", EMPTY) ?? "";

    for (const forbidden of [
      /\bcold\b/i,
      /\bwarm\b/i,
      /\bheatwave\b/i,
      /\bhabitat\b/i,
      /\bspecies\b/i,
      /\becosystem\b/i,
    ]) {
      expect(note).not.toMatch(forbidden);
    }
  });

  it("carries the cited dataset", () => {
    // Guards the repo's provenance rule at the point this module depends on it:
    // a note may never be emitted without a citation to fall back on.
    expect(LAYERS.sst.dataset).toBeDefined();
    const note = emptyMarineProbeNote("sst", EMPTY);
    expect(note).toContain(
      "Source MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0 v2019.0"
    );
    expect(note).not.toContain("no cited dataset");
  });

  it("stays silent whenever any month returned a usable value", () => {
    // The note explains an absence; attaching it to a record that has data
    // would be false, so the guard lives in the module, not just the caller.
    expect(emptyMarineProbeNote("sst", [null, 12.5, null])).toBeNull();
    // Zero is a usable SST reading — the ramp spans it.
    expect(emptyMarineProbeNote("sst", [null, 0, null])).toBeNull();
    expect(emptyMarineProbeNote("sst", [])).not.toBeNull();
    // A non-finite sample is not a value.
    expect(emptyMarineProbeNote("sst", [NaN, null])).not.toBeNull();
  });

  it("defers to a note another module already produced for the same absence", () => {
    // The averaged-footprint clause (lib/marineAveragedSstSupport) already names
    // the ocean domain when a drawn region returns nothing, and the panel prints
    // it as the leading sentence. Two explanations of one absence is worse than
    // one, so the point-probe note yields whenever that clause exists.
    const support =
      "usable SST over none of the drawn region — SST is undefined over land, " +
      "and cloud, ice, or source gaps also leave a footprint empty";
    expect(emptyMarineProbeNote("sst", EMPTY, support)).toBeNull();
    // Absent, null, and empty-string all mean "nothing was said" — speak.
    expect(emptyMarineProbeNote("sst", EMPTY, null)).not.toBeNull();
    expect(emptyMarineProbeNote("sst", EMPTY, undefined)).not.toBeNull();
    expect(emptyMarineProbeNote("sst", EMPTY, "")).not.toBeNull();
  });
});
