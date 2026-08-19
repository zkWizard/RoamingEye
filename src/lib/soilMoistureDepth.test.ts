import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  GLDAS_ROOT_ZONE_DEPTH_LABEL,
  SOIL_MOISTURE_DEPTH_CM,
  SOIL_MOISTURE_DEPTH_LABEL,
  SOIL_MOISTURE_DEPTH_LIMITATIONS,
  soilMoistureDepthText,
} from "./soilMoistureDepth";
import { LAYERS } from "./timeline";
import { LEGENDS } from "./legend";
import { CLIMATE_METRICS } from "./climate";
import { PROBE_SCALES } from "./probe";

describe("soil-moisture sampling depth", () => {
  it("cites the topmost Noah soil layer GIBS publishes", () => {
    expect(SOIL_MOISTURE_DEPTH_CM).toEqual({ top: 0, bottom: 10 });
    expect(SOIL_MOISTURE_DEPTH_LABEL).toBe("0-10 cm");
    expect(soilMoistureDepthText()).toBe("0-10 cm surface layer");
  });

  it("keeps the root zone named as a different, deeper column", () => {
    expect(GLDAS_ROOT_ZONE_DEPTH_LABEL).not.toBe(SOIL_MOISTURE_DEPTH_LABEL);
    expect(SOIL_MOISTURE_DEPTH_CM.bottom).toBeLessThan(100);
  });

  it("states the limits a near-surface column imposes", () => {
    expect(SOIL_MOISTURE_DEPTH_LIMITATIONS.length).toBeGreaterThan(0);
    const joined = SOIL_MOISTURE_DEPTH_LIMITATIONS.join(" ");
    expect(joined).toContain(SOIL_MOISTURE_DEPTH_LABEL);
    expect(joined).toContain(GLDAS_ROOT_ZONE_DEPTH_LABEL);
    // The caveats describe scope; they must not become an inference.
    expect(joined).not.toMatch(/forecast|will be|predict/i);
  });
});

describe("every soil surface cites the same depth", () => {
  // The depth reaches users through five independent strings. A reader who
  // sees one without the depth — or with a different one — cannot tell which
  // GLDAS column the kg/m² value integrates.
  it("labels the probe scale (and therefore the CSV value header)", () => {
    expect(PROBE_SCALES.soil.label).toContain(SOIL_MOISTURE_DEPTH_LABEL);
  });

  it("labels the place-panel climate metric", () => {
    expect(CLIMATE_METRICS["soil-moisture"].label).toContain(
      SOIL_MOISTURE_DEPTH_LABEL
    );
  });

  it("states the depth in the legend caption / layer-picker description", () => {
    // timeline.ts is deliberately dependency-free, so its description is a
    // literal. This is the pin that keeps that literal honest.
    expect(LAYERS.soil.description).toContain(SOIL_MOISTURE_DEPTH_LABEL);
  });

  it("states the depth on the legend's own measures line", () => {
    // The fourth string, and the one #733 missed: `Legend.setLayer` paints
    // LEGENDS[id].measures and LAYERS[id].description into the SAME panel, so
    // a measures line that omitted the depth sat directly above a caption
    // saying "not root zone" — the panel contradicting itself about which
    // GLDAS column the scale below it reads.
    expect(LEGENDS.soil.measures).toContain(SOIL_MOISTURE_DEPTH_LABEL);
  });

  it("stops echoing the GIBS identifier's own word for the column", () => {
    // GIBS names the layer GLDAS_Underground_Soil_Moisture_Monthly. "Under-
    // ground" spans every Noah column from 0-10 cm to 0-200 cm, so it is the
    // vaguer half of the same mislabel: true of the rendered layer and of the
    // root zone alike, which is exactly the distinction the depth exists to
    // draw. The identifier stays in wmsLayer, where it addresses tiles.
    expect(LEGENDS.soil.measures).not.toMatch(/underground/i);
  });
});

describe("the retired root-zone claim does not come back", () => {
  const shipped = [
    "src/lib/timeline.ts",
    "src/lib/legend.ts",
    "src/lib/climate.ts",
    "src/lib/probe.ts",
    "src/lib/soilMoistureChange.ts",
    "src/lib/soilMoisturePercentile.ts",
    "DATA_SOURCES.md",
    "docs/research-recipes.md",
  ];

  it.each(shipped)(
    "%s never describes the rendered soil layer as root-zone",
    (path) => {
      const text = readFileSync(new URL(`../../${path}`, import.meta.url), {
        encoding: "utf8",
      });
      // The defect is naming the *rendered* layer root-zone. A line that
      // negates it ("not root zone"), names the deeper column it actually
      // belongs to ("0-100 cm", "RootMoist"), or contrasts it against the
      // sampled depth ("0-10 cm") is drawing the distinction, not erasing it.
      const drawsTheDistinction = new RegExp(
        `\\bnot\\b|0-100 cm|RootMoist|${SOIL_MOISTURE_DEPTH_LABEL}`,
        "i"
      );
      for (const line of text.split("\n")) {
        if (!/root.?zone/i.test(line)) continue;
        expect(
          line,
          `${path}: "root zone" must be negated or attributed to the deeper GLDAS column, not to the rendered layer`
        ).toMatch(drawsTheDistinction);
      }
    }
  );
});
