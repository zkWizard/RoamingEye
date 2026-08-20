import { describe, it, expect } from "vitest";
import {
  GIBS_VARIABLE_TITLES,
  UNSTATED_IDENTITY_GAPS,
  identityStatement,
  renderedLayerIdentities,
  statesQualifier,
  unstatedQualifiers,
  variableName,
  variableQualifiers,
} from "./variableIdentity";
import { LAYERS, LAYER_ORDER } from "./timeline";
import { LEGENDS } from "./legend";
import { HIRES_LAYER } from "./imagery";

describe("variableQualifiers", () => {
  it("reads the measurement depth out of a GLDAS soil title", () => {
    const qualifiers = variableQualifiers(
      "Soil Moisture (Monthly, 0-10 cm, Noah LSM, GLDAS)"
    );
    expect(qualifiers.map((q) => [q.kind, q.text])).toEqual([
      ["depth", "0-10 cm"],
      ["compositing", "Monthly"],
    ]);
    expect(qualifiers[0].discriminating).toBe(true);
  });

  it("keeps a measurement height distinct from a grid resolution", () => {
    // "2-meter" is where the thermometer sits; "9 km" is how big the bin is.
    // Both are lengths, and reading one as the other misstates the variable.
    expect(
      variableQualifiers("2-meter Air Temperature, (Monthly, MERRA2)").map(
        (q) => q.kind
      )
    ).toEqual(["height", "compositing"]);
    expect(
      variableQualifiers(
        "Sea Surface Temperature (L3, Day, Monthly, Thermal, 9 km, MODIS, Aqua)"
      )
        .filter((q) => q.kind === "resolution")
        .map((q) => q.text)
    ).toEqual(["9 km"]);
  });

  it("reads a wavelength, an overpass time, and a rate", () => {
    expect(
      variableQualifiers(
        "Total Aerosol Optical Thickness Extinction 550nm (Monthly, MERRA2)"
      )
        .filter((q) => q.kind === "wavelength")
        .map((q) => q.text)
    ).toEqual(["550nm"]);
    expect(
      variableQualifiers(
        "Land Surface Temperature (L3, Monthly, Day, MODIS, Terra)"
      )
        .filter((q) => q.kind === "observationTime")
        .map((q) => q.phrase)
    ).toEqual(["daytime overpass only"]);
    const rate = variableQualifiers(
      "Total Precipitation Rate (Monthly, Surface, Noah LSM,  GLDAS)"
    ).find((q) => q.kind === "statistic" && q.text === "Rate");
    expect(rate?.discriminating).toBe(true);
  });

  it("does not mistake 'Daily' or 'Annual' for a daytime overpass", () => {
    const kinds = variableQualifiers(
      "Land Cover Type (L3, IGBP, Annual, MODIS, Aqua+Terra)"
    ).map((q) => q.kind);
    expect(kinds).not.toContain("observationTime");
    expect(
      variableQualifiers("Something Daily").map((q) => q.kind)
    ).not.toContain("observationTime");
  });

  it("treats compositing and non-rate statistics as non-discriminating", () => {
    // The whole timeline is monthly and the legend carries the units; only
    // qualifiers that change what the number IS are worth reporting on.
    const qualifiers = variableQualifiers(
      "Snow Cover (L3, Monthly Average Percent, MODIS, Terra)"
    );
    expect(qualifiers.every((q) => !q.discriminating)).toBe(true);
  });

  it("returns nothing for a title that states no qualifiers", () => {
    expect(
      variableQualifiers("Digital Elevation Model (Color Shaded Relief, ASTER)")
    ).toEqual([]);
  });
});

describe("statesQualifier", () => {
  const depth = variableQualifiers("Soil Moisture (Monthly, 0-10 cm)")[0];
  const height = variableQualifiers("2-meter Air Temperature")[0];
  const band = variableQualifiers("Optical Thickness 550nm")[0];

  it("accepts our own spelling of the same qualifier", () => {
    // Our copy is written for humans, so it hyphenates and spaces differently
    // from the source title. Agreement on the quantity is what matters.
    expect(statesQualifier("soil water in the top 0–10 cm", depth)).toBe(true);
    expect(statesQualifier("Air temperature (2 m)", height)).toBe(true);
    expect(
      statesQualifier("2 metre screen-level air temperature", height)
    ).toBe(true);
    expect(statesQualifier("optical thickness at 550 nanometres", band)).toBe(
      true
    );
  });

  it("rejects copy that states a different quantity, or none", () => {
    expect(statesQualifier("Root-zone soil moisture (GLDAS)", depth)).toBe(
      false
    );
    expect(statesQualifier("soil water in the top 0–100 cm", depth)).toBe(
      false
    );
    expect(statesQualifier("Aerosol optical thickness — dust", band)).toBe(
      false
    );
  });
});

describe("identityStatement", () => {
  it("states the variable, its qualifiers, and the identifier rendered", () => {
    expect(
      identityStatement(
        "GLDAS_Underground_Soil_Moisture_Monthly",
        GIBS_VARIABLE_TITLES.GLDAS_Underground_Soil_Moisture_Monthly
      )
    ).toBe(
      "Soil Moisture (0–10 cm below the surface, monthly) — GIBS GLDAS_Underground_Soil_Moisture_Monthly"
    );
  });

  it("does not repeat a qualifier the variable's own name already carries", () => {
    expect(
      identityStatement(
        "GLDAS_Surface_Total_Precipitation_Rate_Monthly",
        GIBS_VARIABLE_TITLES.GLDAS_Surface_Total_Precipitation_Rate_Monthly
      )
    ).toBe(
      "Total Precipitation Rate (monthly) — GIBS GLDAS_Surface_Total_Precipitation_Rate_Monthly"
    );
  });

  it("omits the parenthetical entirely when nothing is qualified", () => {
    expect(
      identityStatement(
        "ASTER_GDEM_Color_Shaded_Relief",
        GIBS_VARIABLE_TITLES.ASTER_GDEM_Color_Shaded_Relief
      )
    ).toBe("Digital Elevation Model — GIBS ASTER_GDEM_Color_Shaded_Relief");
  });

  it("trims the trailing punctuation GIBS's own titles are inconsistent about", () => {
    expect(variableName("2-meter Air Temperature, (Monthly, MERRA2)")).toBe(
      "2-meter Air Temperature"
    );
  });
});

describe("catalog identity coverage", () => {
  it("pins a source title for every layer whose pixels reach a user", () => {
    const missing = renderedLayerIdentities().filter((i) => !i.gibsTitle);
    expect(
      missing.map((i) => `${i.id} (${i.wmsLayer})`),
      "a rendered layer with no pinned GIBS title — add it from the live " +
        "capabilities, or the app is showing a variable nothing has identified"
    ).toEqual([]);
    expect(renderedLayerIdentities()).toHaveLength(LAYER_ORDER.length + 1);
  });

  it("pins no title for a layer we do not render", () => {
    const rendered = new Set([
      ...LAYER_ORDER.map((id) => LAYERS[id].wmsLayer),
      HIRES_LAYER.wmsLayer as string,
    ]);
    expect(
      Object.keys(GIBS_VARIABLE_TITLES).filter((id) => !rendered.has(id)),
      "a pinned title with no layer behind it — stale after a catalog change"
    ).toEqual([]);
  });
});

describe("UNSTATED_IDENTITY_GAPS", () => {
  /**
   * The committed measurement, re-taken 2026-08-19 across all three rendered
   * statements: ONE layer now describes its variable less completely than GIBS
   * does. Asserting a SUBSET rather than an equality means closing a gap never
   * breaks CI — the owning specialist just fixes the copy — while a NEW
   * mislabel fails here at once, naming the layer and the qualifier that went
   * missing. That is the guard the soil-moisture depth error (#733) got past:
   * nothing checked what quantity an identifier IS, only that it still existed.
   *
   * The corollary the subset direction carries: a gap that closes must be
   * DELETED from the list, because every surviving entry is a live permission
   * to omit. `soil` outlived its own fix here, which is how the legend's
   * measures line kept saying "underground" with CI green.
   */
  it("reports no identity gap outside the known, documented set", () => {
    const found = renderedLayerIdentities()
      .filter((i) => unstatedQualifiers(i).length > 0)
      .map((i) => ({
        id: i.id,
        unstated: unstatedQualifiers(i).map((q) => `${q.kind}=${q.text}`),
      }));
    const unexpected = found.filter((f) => !(f.id in UNSTATED_IDENTITY_GAPS));
    expect(
      unexpected,
      "a layer's user-facing copy dropped a qualifier its GIBS title states — " +
        "either state it, or add it to UNSTATED_IDENTITY_GAPS with a reason"
    ).toEqual([]);
  });

  it("reads every rendered statement, not the caption alone", () => {
    // `Legend.setLayer` paints LEGENDS[id].measures and LAYERS[id].description
    // into one panel, so both are copy the reader sees. Auditing only the
    // caption made this report wrong in both directions at once — a false
    // positive on aerosol, whose band the legend states, and a blind spot over
    // the measures line itself, which is where the soil mislabel outlived the
    // caption fix.
    const soil = renderedLayerIdentities().find((i) => i.id === "soil");
    expect(soil?.ourCopy).toContain(LEGENDS.soil.measures);
    expect(soil?.ourCopy).toContain(LAYERS.soil.description);

    const aerosol = renderedLayerIdentities().find((i) => i.id === "aerosol");
    expect(aerosol?.ourCopy).toContain(LEGENDS.aerosol.measures);
  });

  it("has no open gap on any layer whose copy states its qualifier", () => {
    // These are the closures that let their entries be deleted above. Asserting
    // them here is what makes the deletion a tightening rather than a loss: the
    // subset test turns a regression into a failure, and this names the layer.
    const byId = new Map(renderedLayerIdentities().map((i) => [i.id, i]));
    for (const id of ["soil", "aerosol", "sst"]) {
      const identity = byId.get(id);
      expect(identity, `${id} is not a rendered layer`).toBeDefined();
      expect(
        unstatedQualifiers(identity!).map((q) => `${q.kind}=${q.text}`),
        `${id} closed its identity gap; our copy must keep stating the qualifier`
      ).toEqual([]);
    }
  });

  it("states every discriminating qualifier the catalog's titles carry", () => {
    // The list is empty, so this is now a statement about the whole catalog
    // rather than about one survivor: no rendered layer describes its variable
    // less completely than GIBS does. Asserting emptiness directly — rather
    // than leaving only the subset test — is what stops a future run from
    // "closing" a gap by adding an excuse instead of fixing the copy.
    const open = renderedLayerIdentities()
      .filter((i) => unstatedQualifiers(i).length > 0)
      .map((i) => `${i.id}: ${unstatedQualifiers(i).map((q) => q.text)}`);
    expect(open).toEqual([]);
    expect(Object.keys(UNSTATED_IDENTITY_GAPS)).toEqual([]);
  });

  it("states the 9 km native grid in sst's copy, not just the overpass", () => {
    // The last gap to close, and the one a coastal reader most needs: the
    // daytime overpass was already stated in the caption ("Daytime clear-sky
    // ocean surface temperature"), while the 9 km bin — which straddles a
    // shoreline — was stated nowhere. Pinning the surface form here means a
    // future reword of the measures line cannot silently drop it again.
    const sst = renderedLayerIdentities().find((i) => i.id === "sst");
    expect(sst?.ourCopy).toContain(LEGENDS.sst.measures);
    expect(unstatedQualifiers(sst!)).toEqual([]);
    const grid = variableQualifiers(sst!.gibsTitle).find(
      (q) => q.kind === "resolution"
    );
    expect(grid?.text).toBe("9 km");
    expect(statesQualifier(LEGENDS.sst.measures, grid!)).toBe(true);
  });

  it("excuses only real layers, with a reason each", () => {
    // Deliberately NOT asserted: that each listed gap is still open. These
    // close one at a time as the owning specialist restates the variable, and
    // a closure must not turn CI red on their PR.
    const ids = new Set(renderedLayerIdentities().map((i) => i.id));
    for (const [id, reason] of Object.entries(UNSTATED_IDENTITY_GAPS)) {
      expect(ids.has(id), `${id} is not a rendered layer`).toBe(true);
      expect(reason.length, `${id} needs a reason`).toBeGreaterThan(20);
    }
  });
});
