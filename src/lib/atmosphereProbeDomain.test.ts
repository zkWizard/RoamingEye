import { describe, it, expect } from "vitest";
import {
  atmosphereLayerDomain,
  emptyAtmosphereProbeNote,
  MERRA2_AIR_TEMPERATURE_RAMP_CAPS,
  type AtmosphereProbeLayerId,
} from "./atmosphereProbeDomain";
import { LAYERS, type LayerId } from "./timeline";
import {
  buildColormapLut,
  invertColormap,
  NO_DATA_DISTANCE,
  PROBE_SCALES,
} from "./probe";
import { LEGENDS } from "./legend";
import { GLDAS_RAMP_SATURATION } from "./gldasRampSaturation";

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

  it("names the dropped ramp ceiling as the second reading, in both units", () => {
    // Without this clause a reader of an empty water-cycle record settles on
    // dryness, when a saturated cell is the opposite extreme.
    const note = emptyAtmosphereProbeNote("precip", EMPTY) ?? "";
    const { ceiling, nativeUnit, reportedUnit } = GLDAS_RAMP_SATURATION.precip;

    // The published label is in kg/m²/s but the probe reports mm/day; quoting
    // one against the other's unit is the mistake this asserts against.
    expect(note).toContain(`"${ceiling.publishedLabel}" ${nativeUnit}`);
    expect(note).toContain(`${ceiling.boundReported} ${reportedUnit}`);
    expect(note).toContain("at or above that bound");
    // It must never resolve the ambiguity it has just described.
    expect(note).not.toMatch(
      /this point is|you clicked|it rained|is saturated/i
    );
  });

  it("leaves the MERRA-2 wording free of any GLDAS ramp claim", () => {
    // The clause is keyed to the land-only claim, which only GLDAS holds; the
    // two MERRA-2 layers belong to another specialist and must read unchanged.
    for (const id of ["airtemp", "aerosol"] as const) {
      const note = emptyAtmosphereProbeNote(id, EMPTY) ?? "";
      expect(note).not.toContain(
        GLDAS_RAMP_SATURATION.precip.ceiling.publishedLabel
      );
      expect(note).not.toMatch(/top bin|at or above that bound/);
    }
  });

  it("rejects the published top cap on the ramp the probe inverts against", () => {
    // The clause's whole claim is that a saturated cell decodes to nothing, so
    // the distance is re-derived rather than trusted as prose. Measured on the
    // display-legend LUT — the point probe's oracle — not the published
    // colormap entries the place panel inverts against. If either the ramp or
    // the threshold moves, this fails before the sentence goes stale.
    const spec = LEGENDS.precip;
    if (spec.kind === "classes") throw new Error("precip legend is not a ramp");
    const { rgb } = GLDAS_RAMP_SATURATION.precip.ceiling;
    const lut = buildColormapLut(spec.stops);
    const distance = lut.reduce(
      (best, entry) =>
        Math.min(
          best,
          Math.hypot(entry.r - rgb.r, entry.g - rgb.g, entry.b - rgb.b)
        ),
      Infinity
    );

    expect(distance).toBeGreaterThan(NO_DATA_DISTANCE);
    expect(distance).toBeCloseTo(76.7, 1);
    expect(invertColormap(rgb, lut)).toBeNull();
  });

  it("names both discarded airtemp ramp ends as the second reading", () => {
    // The defect this closes: the panel told a reader of an empty air-temperature
    // record that it could not diagnose the cause at all, while the legend's own
    // interpretationNote already said both overflow colours read as no-data.
    const note = emptyAtmosphereProbeNote("airtemp", EMPTY) ?? "";
    const { closedSpan, unit, below, above } = MERRA2_AIR_TEMPERATURE_RAMP_CAPS;

    expect(note).toContain(
      `${closedSpan.min}–${closedSpan.max} ${unit} legend`
    );
    expect(note).toContain(`"${below.publishedLabel}"`);
    expect(note).toContain(`"${above.publishedLabel}"`);
    expect(note).toContain("beyond either end empties");
  });

  it("asserts no direction for airtemp, unlike the one-sided GLDAS clause", () => {
    // The load-bearing asymmetry. GLDAS may name "the wettest cells" because its
    // companion "< 0" cap is physically impossible; both MERRA-2 caps are
    // reachable monthly means, so naming an end here would be a fabrication.
    const note = emptyAtmosphereProbeNote("airtemp", EMPTY) ?? "";

    expect(note).toContain("consistent with either extreme");
    expect(note).toContain("does not diagnose the cause");
    // Never resolves the ambiguity it just described, in either direction.
    expect(note).not.toMatch(
      /coldest|hottest|the warmest|too cold|too hot|heat wave|freezing/i
    );
    // And never claims a place, a hazard, or a trend from an absence.
    expect(note).not.toMatch(/this point is|you clicked|Antarctic|desert/i);
  });

  it("rejects both published airtemp caps on the ramp the probe inverts against", () => {
    // Same re-derivation the precip cap gets: the clause's whole claim is that a
    // cell beyond either end decodes to nothing, so the distances are measured
    // against the display-legend LUT rather than trusted as prose. If the ramp
    // or the threshold moves, this fails before the sentence goes stale.
    const spec = LEGENDS.airtemp;
    if (spec.kind === "classes")
      throw new Error("airtemp legend is not a ramp");
    const lut = buildColormapLut(spec.stops);
    const distanceTo = (rgb: { r: number; g: number; b: number }) =>
      lut.reduce(
        (best, entry) =>
          Math.min(
            best,
            Math.hypot(entry.r - rgb.r, entry.g - rgb.g, entry.b - rgb.b)
          ),
        Infinity
      );

    const { below, above } = MERRA2_AIR_TEMPERATURE_RAMP_CAPS;
    expect(distanceTo(below.rgb)).toBeGreaterThan(NO_DATA_DISTANCE);
    expect(distanceTo(below.rgb)).toBeCloseTo(76.6, 1);
    expect(invertColormap(below.rgb, lut)).toBeNull();

    expect(distanceTo(above.rgb)).toBeGreaterThan(NO_DATA_DISTANCE);
    expect(distanceTo(above.rgb)).toBeCloseTo(74.5, 1);
    expect(invertColormap(above.rgb, lut)).toBeNull();

    // …while the ramp's own end colours still invert, so the caps are rejected
    // for being off the ramp, not because the ramp ends are unreachable.
    expect(invertColormap({ r: 50, g: 136, b: 189 }, lut)).not.toBeNull();
    expect(invertColormap({ r: 205, g: 53, b: 77 }, lut)).not.toBeNull();
  });

  it("pins the airtemp caps to the window the probe reports on", () => {
    // The note quotes a 220–310 K legend; PROBE_SCALES pins the same window.
    // If either moves without the other, the sentence starts describing a ramp
    // the app does not use.
    const { closedSpan, below, above } = MERRA2_AIR_TEMPERATURE_RAMP_CAPS;
    expect(closedSpan.min).toBe(PROBE_SCALES.airtemp.min);
    expect(closedSpan.max).toBe(PROBE_SCALES.airtemp.max);
    expect(below.bound).toBe(closedSpan.min);
    expect(above.bound).toBe(closedSpan.max);
    expect(MERRA2_AIR_TEMPERATURE_RAMP_CAPS.unit).toBe(
      PROBE_SCALES.airtemp.unit
    );
  });

  it("keeps aerosol's wording free of any ramp-cap clause", () => {
    // Aerosol's top end is a censoring handled by the aerosol ceiling modules,
    // not a rejection — it must not borrow air temperature's sentence.
    const note = emptyAtmosphereProbeNote("aerosol", EMPTY) ?? "";
    expect(note).not.toContain("second reading");
    expect(note).not.toContain(
      MERRA2_AIR_TEMPERATURE_RAMP_CAPS.above.publishedLabel
    );
    expect(note).toContain(
      "does not explain an empty record here; this note does not diagnose the cause"
    );
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
