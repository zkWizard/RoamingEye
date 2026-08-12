import { describe, it, expect } from "vitest";
import {
  atmosphereLayerDomain,
  emptyAtmosphereProbeNote,
  type AtmosphereProbeLayerId,
} from "./atmosphereProbeDomain";
import { LAYERS, type LayerId } from "./timeline";
import { buildColormapLut, invertColormap, NO_DATA_DISTANCE } from "./probe";
import { LEGENDS } from "./legend";

const EMPTY = [null, null, null, null];

describe("atmosphere probe domain of definition", () => {
  it("classifies GLDAS precipitation as land-only and both MERRA-2 fields as global", () => {
    // The distinction that matters: only the land-surface model has cells the
    // Earth's surface can fall outside of.
    expect(atmosphereLayerDomain("precip")).toBe("land-only");
    expect(atmosphereLayerDomain("airtemp")).toBe("land-and-ocean");
    expect(atmosphereLayerDomain("aerosol")).toBe("land-and-ocean");
  });

  it("leaves every other layer unclassified rather than guessing", () => {
    // Including GLDAS soil moisture, which shares precipitation's product and
    // land-only domain but is another specialist's module — an unclassified
    // layer must produce no note at all, not a plausible-looking one.
    const others: LayerId[] = [
      "ndvi",
      "evi",
      "lst",
      "sst",
      "snow",
      "soil",
      "landcover",
      "terrain",
    ];
    for (const id of others) {
      expect(atmosphereLayerDomain(id)).toBe("unclassified");
      expect(emptyAtmosphereProbeNote(id, EMPTY)).toBeNull();
    }
  });

  it("explains an empty precipitation record without claiming where the point is", () => {
    const note = emptyAtmosphereProbeNote("precip", EMPTY);

    expect(note).toContain("defined over land surfaces only");
    expect(note).toContain("solved on land cells only");
    // Conditional, never a claim about this particular location.
    expect(note).toContain("consistent with a point outside that domain");
    // The two readings the bare "no data" line invites, both refused.
    expect(note).toContain("not a reading of zero precipitation");
    expect(note).toContain("not evidence of a failed retrieval");
    expect(note).not.toMatch(/\b(is|over) (the )?ocean\b/i);
  });

  it("refuses to let the domain excuse an empty MERRA-2 record", () => {
    for (const id of ["airtemp", "aerosol"] as const) {
      const note = emptyAtmosphereProbeNote(id, EMPTY);
      expect(note).toContain("defined over both land and ocean");
      expect(note).toContain("does not explain an empty record here");
      // It must not invent a cause it cannot see from the imagery.
      expect(note).toContain("does not diagnose the cause");
    }
  });

  it("carries the cited dataset on every note", () => {
    expect(emptyAtmosphereProbeNote("precip", EMPTY)).toContain(
      "Source GLDAS_NOAH025_M v2.1"
    );
    expect(emptyAtmosphereProbeNote("airtemp", EMPTY)).toContain(
      "Source M2TMNXSLV v5.12.4"
    );
    expect(emptyAtmosphereProbeNote("aerosol", EMPTY)).toContain(
      "Source M2TMNXAER v5.12.4"
    );
  });

  it("keeps a cited DatasetRef on each classified layer", () => {
    // Guards the repo's provenance rule at the point this module depends on it:
    // a note may never be emitted without a citation to fall back on.
    const classified: AtmosphereProbeLayerId[] = [
      "precip",
      "airtemp",
      "aerosol",
    ];
    for (const id of classified) {
      expect(LAYERS[id].dataset).toBeDefined();
      expect(emptyAtmosphereProbeNote(id, EMPTY)).not.toContain(
        "no cited dataset"
      );
    }
  });

  it("stays silent whenever any month returned a usable value", () => {
    // The note explains an absence; attaching it to a record that has data
    // would be false, so the guard lives in the module, not just the caller.
    expect(emptyAtmosphereProbeNote("precip", [null, 0.4, null])).toBeNull();
    // Zero is a usable precipitation reading — a genuinely dry month is data.
    expect(emptyAtmosphereProbeNote("precip", [null, 0, null])).toBeNull();
    expect(emptyAtmosphereProbeNote("precip", [])).not.toBeNull();
    // A non-finite sample is not a value.
    expect(emptyAtmosphereProbeNote("precip", [NaN, null])).not.toBeNull();
  });
});

describe("why an out-of-domain atmosphere pixel arrives empty", () => {
  // The note describes correct sampler behaviour, so pin the mechanism it
  // describes: GIBS declares each atmosphere layer's no-data fill transparent,
  // the JPEG transport has no alpha and flattens that to black, and black must
  // fall outside the gradient so the pixel is rejected rather than decoded.
  const BLACK = { r: 0, g: 0, b: 0 };

  it.each(["precip", "airtemp", "aerosol"] as const)(
    "rejects black rather than decoding it as a %s value",
    (id) => {
      const legend = LEGENDS[id];
      expect(legend.kind).not.toBe("classes");
      const lut = buildColormapLut(
        (legend as { stops: { color: string; at: number }[] }).stops
      );
      expect(invertColormap(BLACK, lut)).toBeNull();

      // …and with margin, not by a hair: the nearest ramp colour is far
      // outside NO_DATA_DISTANCE, so JPEG noise cannot pull black onto it.
      const nearest = Math.min(...lut.map((c) => Math.hypot(c.r, c.g, c.b)));
      expect(nearest).toBeGreaterThan(NO_DATA_DISTANCE * 1.5);
    }
  );
});
