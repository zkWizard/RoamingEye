import { describe, it, expect } from "vitest";
import {
  LEGENDS,
  OVERLAY_KEYS,
  gradientCss,
  legendTicks,
  overlayKeyFor,
} from "./legend";
import { PROBE_SCALES } from "./probe";
import { LAYER_ORDER } from "./timeline";
import { DEPTH_CLASS_COLORS } from "./earthquakes";
import { ERUPTION_CLASS_COLORS } from "./volcanoes";

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
    expect(legendTicks("ndvi")).toEqual({
      min: "0.00",
      mid: "0.50",
      max: "1.00",
    });
    expect(legendTicks("snow")).toEqual({
      min: "0 %",
      mid: "50 %",
      max: "100 %",
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
