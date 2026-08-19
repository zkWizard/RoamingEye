import { describe, it, expect } from "vitest";
import {
  emptyLstProbeNote,
  isLandSurfaceTemperatureLayer,
  lstInDomainGapConstraint,
} from "./lstProbeDomain";
import { LAYERS, type LayerId } from "./timeline";
import { LST_OBSERVING_CONSTRAINTS } from "./lstObservingConstraints";

const EMPTY = [null, null, null, null];

describe("LST probe domain of definition", () => {
  it("classifies LST as the layer this module speaks for", () => {
    expect(isLandSurfaceTemperatureLayer("lst")).toBe(true);
  });

  it("leaves every other layer unclassified rather than guessing", () => {
    // Including the other land-only products, whose domain is asserted by
    // their own discipline's module: an unclassified layer must produce no
    // note at all, not a plausible one.
    const others: LayerId[] = [
      "ndvi",
      "evi",
      "sst",
      "airtemp",
      "aerosol",
      "precip",
      "snow",
      "soil",
      "landcover",
      "terrain",
    ];
    for (const id of others) {
      expect(isLandSurfaceTemperatureLayer(id)).toBe(false);
      expect(emptyLstProbeNote(id, EMPTY)).toBeNull();
    }
    // An absent layer id is unclassified too, not a crash.
    expect(isLandSurfaceTemperatureLayer(undefined)).toBe(false);
    expect(emptyLstProbeNote(undefined, EMPTY)).toBeNull();
  });

  it("explains an empty LST record by the land domain", () => {
    const note = emptyLstProbeNote("lst", EMPTY);

    expect(note).toContain("defined over land surfaces only");
    expect(note).toContain("open water carries no value by construction");
    // Conditional, never a claim about this particular location.
    expect(note).toContain("consistent with a point outside that domain");
  });

  it("refuses to let an absence locate the point", () => {
    const note = emptyLstProbeNote("lst", EMPTY) ?? "";

    // The mirror of the marine sibling's refusal: SST has gaps inside the
    // ocean, LST has gaps inside the land, so neither absence locates a point.
    expect(note).toContain("empties a land record too");
    expect(note).toContain("does not by itself say which");
    expect(note).not.toMatch(/\bover (?:the )?(?:ocean|water)\b.*\bis\b/i);
  });

  it("states the clear-sky gate in the constraint table's own words", () => {
    const gate = lstInDomainGapConstraint();
    expect(gate).toBeDefined();
    // The note quotes the committed fact rather than restating it, so the two
    // cannot drift; removing the entry must fail here rather than silently
    // making the note one-sided.
    expect(emptyLstProbeNote("lst", EMPTY)).toContain(gate!.constraint);
    expect(LST_OBSERVING_CONSTRAINTS.map((entry) => entry.id)).toContain(
      "clear-sky-retrieval-only"
    );
  });

  it("cites the rendered product", () => {
    const note = emptyLstProbeNote("lst", EMPTY) ?? "";
    const dataset = LAYERS.lst.dataset;

    expect(dataset).toBeDefined();
    expect(note).toContain(`Source ${dataset!.shortName} v${dataset!.version}`);
    expect(note.startsWith(`${LAYERS.lst.label}:`)).toBe(true);
  });

  it("stays silent for a record that returned any usable value", () => {
    // The note must never be attachable to a record that did return data,
    // whatever a caller passes.
    expect(emptyLstProbeNote("lst", [null, 291.4, null])).toBeNull();
    expect(emptyLstProbeNote("lst", [273.15])).toBeNull();
    // A zero-kelvin reading is not a physical LST, but it IS a finite value,
    // so the series is not empty and this module still does not speak.
    expect(emptyLstProbeNote("lst", [0])).toBeNull();
    // Non-finite entries are not usable values, so these records are still
    // empty and the note does speak for them.
    expect(
      emptyLstProbeNote("lst", [Number.NaN, Number.POSITIVE_INFINITY])
    ).not.toBeNull();
    expect(emptyLstProbeNote("lst", [])).not.toBeNull();
  });

  it("refuses the readings the product cannot support", () => {
    const note = emptyLstProbeNote("lst", EMPTY) ?? "";

    // Interval scale: the misreading to head off is "cold", not "zero". The
    // GLDAS notes refuse a zero reading because a rate is a ratio quantity;
    // that wording is not transferable to a temperature and must not appear.
    expect(note).toContain("not a cold reading");
    expect(note).toContain("not evidence of a failed retrieval");
    expect(note).not.toMatch(/reading of zero|zero temperature/i);
    // No hazard, health, attribution, causation or forecast language.
    expect(note).not.toMatch(
      /heat wave|heatwave|hazard|health|comfort|urban heat|because|caused|will be|forecast|expect/i
    );
    // The ramp caps are censored, not rejected, so they cannot empty a record
    // and must not be offered here as a cause.
    expect(note).not.toMatch(/legend|swatch|top bin|catch-all|ramp/i);
  });
});
