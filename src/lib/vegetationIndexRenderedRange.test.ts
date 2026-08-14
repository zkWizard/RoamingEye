import { describe, expect, it } from "vitest";
import { parseColormapEntries } from "./colormap";
import { LEGENDS } from "./legend";
import {
  RENDERED_VEGETATION_INDEX_RANGE,
  VEGETATION_INDEX_DEFINITION,
  classifyRenderedVegetationIndex,
  vegetationIndexLegendNote,
  type RenderedVegetationIndexId,
} from "./vegetationIndexRenderedRange";

const INDICES: RenderedVegetationIndexId[] = ["ndvi", "evi"];

/**
 * The shape both MODIS_L3_NDVI and MODIS_L3_EVI share: a "No Data" colormap
 * holding the fill band, then a "Vegetation Indices" colormap whose first three
 * entries are transparent and whose continuous legend starts above zero.
 * Abridged from the live documents (2026-08-11); the ids are the real ones.
 */
const COLORMAP_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<ColorMaps>
  <ColorMap title="No Data">
    <Entries>
      <ColorMapEntry rgb="0,26,105" transparent="true" value="[-0.3,-0.2)" nodata="true" ref="0"/>
    </Entries>
    <Legend type="classification">
      <LegendEntry rgb="0,26,105" tooltip="Fill" id="0"/>
    </Legend>
  </ColorMap>
  <ColorMap title="Vegetation Indices">
    <Entries>
      <ColorMapEntry rgb="225,225,225" transparent="true" value="[-0.2000,-0.0999)" ref="1"/>
      <ColorMapEntry rgb="225,225,226" transparent="true" value="[-0.0999,0.0001)" ref="2"/>
      <ColorMapEntry rgb="241,236,236" transparent="false" value="[0.0001,0.0051)" ref="3"/>
      <ColorMapEntry rgb="0,24,1" transparent="false" value="[0.9901,1.0001)" ref="142"/>
    </Entries>
    <Legend type="continuous">
      <LegendEntry rgb="241,236,236" tooltip="0.000 - 0.005" id="3"/>
      <LegendEntry rgb="0,24,1" tooltip="0.990 - 1.000" id="142"/>
    </Legend>
  </ColorMap>
</ColorMaps>`;

describe("rendered vegetation-index range", () => {
  it("keeps the transparent bands out of the ramp the app reads", () => {
    // The transparent entries live in <Entries>, never in the continuous
    // legend, so the parser the probe and place panel share cannot see them.
    // This is why no negative index value can be recovered from the imagery:
    // there is no colour to invert, not merely a colour that is hard to match.
    const entries = parseColormapEntries(COLORMAP_FIXTURE);

    expect(entries).toHaveLength(2);
    expect(Math.min(...entries.map((entry) => entry.value))).toBeGreaterThan(0);
    expect(
      entries.some(
        ({ rgb }) => rgb.r === 225 && rgb.g === 225 && rgb.b === 225
      ),
      "a transparent band must not become an invertible colour"
    ).toBe(false);
  });

  for (const index of INDICES) {
    const range = RENDERED_VEGETATION_INDEX_RANGE[index];

    it(`${index}: pins the drawn ramp and keeps MOD13A3 provenance`, () => {
      expect(range.colormapDoc).toBe(
        index === "ndvi" ? "MODIS_L3_NDVI" : "MODIS_L3_EVI"
      );
      // Both documents draw from just above zero to 1, and the fill band is
      // the deepest transparent value in either.
      expect(range.renderedMinimum).toBeGreaterThan(0);
      expect(range.renderedMaximum).toBe(1);
      expect(range.transparentFloor).toBe(-0.3);
      expect(range.transparentFloor).toBeGreaterThan(
        VEGETATION_INDEX_DEFINITION.minimum
      );
      expect(range.transparentFloor).toBeLessThan(range.renderedMinimum);
      expect(range.renderedBinCount).toBeGreaterThan(100);
      expect(range.source.shortName).toBe("MOD13A3");
      expect(range.source.doi).toBe("10.5067/MODIS/MOD13A3.061");
    });

    it(`${index}: separates undrawn values from invalid ones`, () => {
      // Legitimate observations the layer simply does not draw. Water, snow,
      // ice, and cloud all sit here, and so does product fill.
      expect(classifyRenderedVegetationIndex(index, -0.25)).toBe(
        "below-rendered-minimum"
      );
      expect(classifyRenderedVegetationIndex(index, 0)).toBe(
        "below-rendered-minimum"
      );
      expect(classifyRenderedVegetationIndex(index, -1)).toBe(
        "below-rendered-minimum"
      );

      // Inside the drawn ramp, including both of its ends.
      expect(
        classifyRenderedVegetationIndex(index, range.renderedMinimum)
      ).toBe("rendered");
      expect(classifyRenderedVegetationIndex(index, 0.42)).toBe("rendered");
      expect(classifyRenderedVegetationIndex(index, 1)).toBe("rendered");

      // Outside the index definition entirely — a decode or scaling error,
      // which is a different failure from "valid but not drawn".
      expect(classifyRenderedVegetationIndex(index, 1.4)).toBe(
        "outside-index-definition"
      );
      expect(classifyRenderedVegetationIndex(index, -1.4)).toBe(
        "outside-index-definition"
      );
      expect(classifyRenderedVegetationIndex(index, Number.NaN)).toBe(
        "outside-index-definition"
      );
      expect(
        classifyRenderedVegetationIndex(index, Number.POSITIVE_INFINITY)
      ).toBe("outside-index-definition");
    });

    it(`${index}: the legend note keeps the index caveat and adds the gap`, () => {
      const note = vegetationIndexLegendNote(index);

      expect(note).toContain(index.toUpperCase());
      // The pre-existing guardrail must survive.
      expect(note).toContain(
        "color does not measure vegetation cover, biomass, or condition"
      );
      // The new one: a gap is not a low reading.
      expect(note).toContain("not low greenness");
      expect(note).toMatch(/above zero/);
      // Nothing here may claim what the undrawn pixel actually is.
      expect(note).not.toMatch(/\b(cause|because|due to|health|risk)\b/i);
    });

    it(`${index}: the legend note names the fill band, not only the surfaces`, () => {
      const note = vegetationIndexLegendNote(index);

      // The colormap marks the product's fill band transparent alongside the
      // negative range, so a blank pixel has four readings, not three. Naming
      // only water/snow/ice/cloud corrects "low greenness" by asserting a
      // surface is present — which the tile cannot support. The wired probe
      // note (vegetationProbeAbsence.ts) and the snow legend note both already
      // disclose the unobserved reading for the same rendering fact.
      expect(note).toMatch(/fill/i);
      expect(note).toMatch(/unobserved/i);
      // And the disclosure must not quietly drop the surfaces it replaces.
      for (const surface of ["water", "snow", "ice", "cloud"]) {
        expect(note).toContain(surface);
      }
      // Still no claim about which of the four any one blank pixel is.
      expect(note).not.toMatch(/\b(is|are) (water|snow|ice|cloud)\b/i);
    });

    it(`${index}: the rendered floor and ceiling match the note's own claim`, () => {
      // If the layer ever spanned a different range, the note's "above zero"
      // claim and the ramp would disagree. Fail here rather than in prose.
      // The stop positions below are normalized 0..1 by construction and so
      // cannot witness that; the measured range is what the sentence asserts.
      const range = RENDERED_VEGETATION_INDEX_RANGE[index];
      expect(range.renderedMinimum).toBeGreaterThan(0);
      // The fill band the note now names must actually sit below the ramp.
      expect(range.transparentFloor).toBeLessThan(range.renderedMinimum);

      const spec = LEGENDS[index];
      if (spec.kind === "classes")
        throw new Error(`${index} must be a gradient`);
      expect(spec.interpretationNote).toBe(vegetationIndexLegendNote(index));
      expect(spec.stops.at(-1)?.at).toBe(1);
      expect(spec.stops[0].at).toBe(0);
    });
  }
});
