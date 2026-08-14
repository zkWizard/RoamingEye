import { describe, it, expect } from "vitest";
import {
  LEGENDS,
  OVERLAY_KEYS,
  gradientCss,
  legendProvenance,
  legendTicks,
  overlayKeyFor,
} from "./legend";
import { vegetationIndexLegendNote } from "./vegetationIndexRenderedRange";
import { PROBE_SCALES } from "./probe";
import { LAYERS, LAYER_ORDER } from "./timeline";
import {
  DEPTH_CLASS_COLORS,
  MAGNITUDE_SIZE_BUCKETS,
  SEISMICITY_OVERLAY_POPULATION,
} from "./earthquakes";
import {
  ERUPTION_CLASS_COLORS,
  ERUPTION_CLASS_LABELS,
  VOLCANO_OVERLAY_POPULATION,
} from "./volcanoes";

describe("LEGENDS", () => {
  it("covers every data layer", () => {
    for (const id of LAYER_ORDER) {
      expect(LEGENDS[id], `missing legend for layer "${id}"`).toBeDefined();
    }
  });

  it("has non-empty labels and measure text", () => {
    for (const spec of Object.values(LEGENDS)) {
      expect(spec.measures.length).toBeGreaterThan(0);
      if (spec.kind === "classes") continue;
      expect(spec.minLabel.length).toBeGreaterThan(0);
      expect(spec.maxLabel.length).toBeGreaterThan(0);
    }
  });

  it("spans the full 0..1 range with sorted stops (gradient legends)", () => {
    for (const [id, spec] of Object.entries(LEGENDS)) {
      if (spec.kind === "classes") continue;
      expect(spec.stops.length, id).toBeGreaterThanOrEqual(2);
      expect(spec.stops[0].at, id).toBe(0);
      expect(spec.stops[spec.stops.length - 1].at, id).toBe(1);
      for (let i = 1; i < spec.stops.length; i++) {
        expect(spec.stops[i].at, id).toBeGreaterThan(spec.stops[i - 1].at);
      }
    }
  });

  it("uses valid hex colors", () => {
    for (const spec of Object.values(LEGENDS)) {
      const colors =
        spec.kind === "classes"
          ? spec.classes.map((c) => c.color)
          : spec.stops.map((s) => s.color);
      for (const color of colors) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("gives the categorical land-cover layer all 17 IGBP classes", () => {
    const spec = LEGENDS.landcover;
    expect(spec.kind).toBe("classes");
    if (spec.kind !== "classes") return;
    // 17 IGBP classes + Unclassified, each named.
    expect(spec.classes).toHaveLength(18);
    for (const entry of spec.classes) {
      expect(entry.label.length).toBeGreaterThan(0);
    }
    const labels = spec.classes.map((c) => c.label.toLowerCase());
    expect(labels.some((l) => l.includes("cropland"))).toBe(true);
    expect(labels.some((l) => l.includes("urban"))).toBe(true);
  });

  it("describes vegetation-index colors without inferring cover or condition", () => {
    // The exact sentence is derived from the measured GIBS ramp and pinned in
    // vegetationIndexRenderedRange.test.ts. What this suite guards is the
    // property: the note disclaims cover/biomass/condition, and it says a gap
    // in the layer is undrawn rather than low.
    expect(LEGENDS.ndvi).toMatchObject({
      minLabel: "lower NDVI",
      maxLabel: "higher NDVI",
      interpretationNote: vegetationIndexLegendNote("ndvi"),
    });
    expect(LEGENDS.evi).toMatchObject({
      minLabel: "lower EVI",
      maxLabel: "higher EVI",
      interpretationNote: vegetationIndexLegendNote("evi"),
    });
    for (const index of ["ndvi", "evi"] as const) {
      const note = vegetationIndexLegendNote(index);
      expect(note).toContain(
        "color does not measure vegetation cover, biomass, or condition"
      );
      expect(note).toContain("not low greenness");
    }
  });
});

describe("OVERLAY_KEYS", () => {
  it("has a titled, non-empty key per color-coded overlay", () => {
    for (const [id, spec] of Object.entries(OVERLAY_KEYS)) {
      expect(spec.title.length, id).toBeGreaterThan(0);
      expect(spec.entries.length, id).toBeGreaterThanOrEqual(2);
      for (const entry of spec.entries) {
        expect(entry.color, id).toMatch(/^#[0-9a-f]{6}$/i);
        expect(entry.label.length, id).toBeGreaterThan(0);
      }
    }
  });

  it("keys use the exact colors the overlays render with", () => {
    expect(OVERLAY_KEYS.quakes.entries.map((e) => e.color)).toEqual(
      Object.values(DEPTH_CLASS_COLORS)
    );
    expect(OVERLAY_KEYS.volcanoes.entries.map((e) => e.color)).toEqual(
      Object.values(ERUPTION_CLASS_COLORS)
    );
  });

  it("covers the seismological depth classes in order", () => {
    expect(OVERLAY_KEYS.quakes.entries.map((e) => e.label)).toEqual([
      "< 70 km",
      "70–300 km",
      "> 300 km",
    ]);
  });

  it("names the eruption bands eruptionClass assigns, in order", () => {
    // Sourced from volcanoes.ts so the key cannot drift from the classifier
    // the overlay colors with — the same contract as the colors above.
    expect(OVERLAY_KEYS.volcanoes.entries.map((e) => e.label)).toEqual(
      Object.values(ERUPTION_CLASS_LABELS)
    );
    expect(OVERLAY_KEYS.volcanoes.entries.map((e) => e.label)).toEqual([
      "since 1900",
      "year 0–1899",
      "BCE or undated",
    ]);
  });
});

describe("OVERLAY_KEYS quake magnitude-size channel", () => {
  it("names the second thing quake markers encode", () => {
    // Color is depth; size is the reported magnitude. Only the first was ever
    // stated, so the largest dots on the globe carried no stated meaning.
    const size = OVERLAY_KEYS.quakes.secondary;
    expect(size).toBeDefined();
    expect(size!.title).toContain("size");
    expect(size!.title).toContain("magnitude");
  });

  it("covers every rendered magnitude band, smallest first", () => {
    expect(OVERLAY_KEYS.quakes.secondary!.entries.map((e) => e.label)).toEqual([
      "< M5.5",
      "M5.5–6.4",
      "M6.5+",
    ]);
  });

  it("takes its labels and ratios from the buckets the overlay draws with", () => {
    // Same contract as the colors above: one definition, so the key cannot
    // drift from the sizes on the globe.
    const entries = OVERLAY_KEYS.quakes.secondary!.entries;
    expect(entries.map((e) => e.label)).toEqual(
      [...MAGNITUDE_SIZE_BUCKETS].reverse().map((b) => b.label)
    );
    const largest = Math.max(...MAGNITUDE_SIZE_BUCKETS.map((b) => b.size));
    expect(entries.map((e) => e.scale)).toEqual(
      [...MAGNITUDE_SIZE_BUCKETS].reverse().map((b) => b.size / largest)
    );
  });

  it("scales swatches within the key's own size, largest anchored at 1", () => {
    const scales = OVERLAY_KEYS.quakes.secondary!.entries.map((e) => e.scale!);
    expect(Math.max(...scales)).toBe(1);
    for (const scale of scales) {
      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThanOrEqual(1);
    }
    // Strictly increasing, so the row reads as a size ramp rather than three
    // swatches that happen to differ.
    expect([...scales].sort((a, b) => a - b)).toEqual(scales);
  });

  it("keeps the size swatches neutral so they assert no depth", () => {
    // Depth already owns color on this overlay; tinting a size swatch with a
    // depth color would claim a depth the magnitude band does not have.
    for (const entry of OVERLAY_KEYS.quakes.secondary!.entries) {
      expect(entry.color).not.toMatch(/^#/);
      expect(Object.values(DEPTH_CLASS_COLORS)).not.toContain(entry.color);
    }
  });

  it("leaves single-channel overlays without a second row", () => {
    expect(OVERLAY_KEYS.volcanoes.secondary).toBeUndefined();
    for (const entry of OVERLAY_KEYS.volcanoes.entries) {
      expect(entry.scale).toBeUndefined();
    }
  });
});

describe("OVERLAY_KEYS marker population", () => {
  it("states which records were eligible to be drawn, for both overlays", () => {
    // A channel says what a marker means; only this says what no marker means.
    expect(OVERLAY_KEYS.quakes.population).toBe(SEISMICITY_OVERLAY_POPULATION);
    expect(OVERLAY_KEYS.volcanoes.population).toBe(VOLCANO_OVERLAY_POPULATION);
  });

  it("names the seismicity selection the feed actually applies", () => {
    // Both filters, because either one alone understates what is missing.
    expect(SEISMICITY_OVERLAY_POPULATION).toContain("M4.5+");
    expect(SEISMICITY_OVERLAY_POPULATION).toContain("30 days");
    expect(SEISMICITY_OVERLAY_POPULATION).toContain(
      "not a complete earthquake catalog"
    );
  });

  it("names the volcano inventory rather than implying every vent", () => {
    expect(VOLCANO_OVERLAY_POPULATION).toContain("Holocene inventory");
    expect(VOLCANO_OVERLAY_POPULATION).toContain(
      "not a complete record of every volcanic feature or vent"
    );
  });

  it("reads an absent marker as unrecorded, never as an all-clear", () => {
    // The whole point of the note: absence is a property of the selection,
    // not of the ground. Neither may be read as a hazard or risk statement.
    for (const note of [
      SEISMICITY_OVERLAY_POPULATION,
      VOLCANO_OVERLAY_POPULATION,
    ]) {
      expect(note).toContain("an area with no marker is not established as");
      expect(note).not.toMatch(/hazard|risk|forecast|danger|safe/i);
    }
  });

  it("stays out of the channel rows so the key gains no height", () => {
    // The note describes the marker set, so it belongs to the spec rather than
    // to a channel; a secondary channel carrying one would repeat it verbatim.
    expect(OVERLAY_KEYS.quakes.secondary).not.toHaveProperty("population");
  });
});

describe("overlayKeyFor", () => {
  it("resolves known overlay ids and rejects the rest", () => {
    expect(overlayKeyFor("quakes")).toBe(OVERLAY_KEYS.quakes);
    expect(overlayKeyFor("volcanoes")).toBe(OVERLAY_KEYS.volcanoes);
    expect(overlayKeyFor("cities")).toBeUndefined();
    expect(overlayKeyFor("")).toBeUndefined();
  });
});

describe("legendTicks", () => {
  it("prints min/mid/max in the layer's units for calibrated gradients", () => {
    // Digits follow the probe's quantization step, so a tick and a probed
    // value can never quote the same colour at two different precisions.
    expect(legendTicks("ndvi")).toEqual({
      min: "0.000",
      mid: "0.500",
      max: "1.000",
    });
    expect(legendTicks("snow")).toEqual({
      min: "0.0 %",
      mid: "50.0 %",
      max: "100.0 %",
    });
  });

  it("shows nothing rather than fake numbers for uncalibrated layers", () => {
    // Terrain's shaded relief is inversion-ambiguous — honestly unticked.
    expect(legendTicks("terrain")).toBeNull();
  });

  it("declines categorical layers (class swatches, not a gradient)", () => {
    expect(legendTicks("landcover")).toBeNull();
  });

  it("ticks every calibrated gradient layer, exactly", () => {
    // The rule, not a snapshot: ticks ⟺ calibrated gradient. Stays true as
    // more layers gain colormap-derived physical scales.
    for (const [id, spec] of Object.entries(LEGENDS)) {
      const scale = PROBE_SCALES[id as keyof typeof PROBE_SCALES];
      const expectTicks = spec.kind !== "classes" && scale.calibrated;
      expect(legendTicks(id as keyof typeof PROBE_SCALES) !== null, id).toBe(
        expectTicks
      );
    }
  });
});

describe("gradientCss", () => {
  it("renders stops as a left-to-right linear gradient", () => {
    const css = gradientCss([
      { color: "#000000", at: 0 },
      { color: "#ffffff", at: 1 },
    ]);
    expect(css).toBe("linear-gradient(to right, #000000 0%, #ffffff 100%)");
  });

  it("rounds fractional positions to whole percentages", () => {
    const css = gradientCss([
      { color: "#111111", at: 0 },
      { color: "#222222", at: 1 / 3 },
      { color: "#333333", at: 1 },
    ]);
    expect(css).toContain("#222222 33%");
  });
});

describe("legend dataset provenance", () => {
  // The invariant this exists to hold: a rendered dataset stays cited. Before
  // `legendProvenance`, the source line rode on `interpretationNote`, so a
  // layer without a colour caveat silently showed no citation at all.
  it("cites every layer that names a source product", () => {
    const uncited = LAYER_ORDER.filter(
      (id) => LAYERS[id].dataset && legendProvenance(id) === null
    );
    expect(uncited).toEqual([]);
  });

  it("covers the layers that carry no interpretation note", () => {
    // These rendered a calibrated colour scale with no stated source. Land
    // cover was a fifth until it gained a categorical guardrail of its own
    // (lib/landCoverLegendNote.ts); the invariant here is unchanged — a layer
    // carrying no note is still cited.
    for (const id of ["lst", "sst", "soil", "aerosol"] as const) {
      expect(LEGENDS[id].interpretationNote).toBeUndefined();
      const provenance = legendProvenance(id);
      expect(provenance).not.toBeNull();
      expect(provenance!.note).toBeUndefined();
      expect(provenance!.label).toBe(
        `${LAYERS[id].dataset!.shortName} v${LAYERS[id].dataset!.version}`
      );
      expect(provenance!.doi).toBe(LAYERS[id].dataset!.doi);
    }
  });

  it("keeps the interpretation note alongside the citation", () => {
    const ndvi = legendProvenance("ndvi");
    expect(ndvi?.note).toBe(LEGENDS.ndvi.interpretationNote);
    expect(ndvi?.label).toBe("MOD13A3 v061");
  });

  it("transcribes the DOI rather than resolving or reformatting it", () => {
    // The caller builds the resolver URL, so a legend citation and the
    // providers page cannot disagree about the link for one product.
    for (const id of LAYER_ORDER) {
      const provenance = legendProvenance(id);
      if (!provenance) continue;
      expect(provenance.doi).toBe(LAYERS[id].dataset!.doi);
      expect(provenance.doi).not.toContain("https://");
    }
  });
});
