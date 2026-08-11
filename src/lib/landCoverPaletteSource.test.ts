import { describe, expect, it } from "vitest";
import { IGBP_LAND_COVER_CLASSES } from "./landCover";
import {
  decodeRenderedLandCoverPixel,
  IGBP_RENDERED_PALETTE,
} from "./landCoverPalette";
import {
  decodableClassCode,
  LAND_COVER_COLORMAP_DOC,
  LAND_COVER_PALETTE_SOURCE,
  parseClassificationPalette,
  SOURCE_IGBP_CLASS_RENDERING,
  SOURCE_NO_DATA_ENTRY_COUNT,
} from "./landCoverPaletteSource";

function colormapDoc(entries: string, legend: string): string {
  return `<ColorMaps><ColorMap title="Classifications"><Entries>${entries}</Entries><Legend type="classification">${legend}</Legend></ColorMap></ColorMaps>`;
}

describe("GIBS classification colormap parsing", () => {
  it("joins each colour's source values to the legend class name", () => {
    const xml = colormapDoc(
      `<ColorMapEntry rgb="255,0,0" transparent="false" sourceValue="13" ref="12"/>`,
      `<LegendEntry rgb="255,0,0" tooltip="Urban and Built-up Lands" id="12"/>`
    );
    expect(parseClassificationPalette(xml)).toEqual({
      classes: [
        {
          sourceValues: [13],
          rgb: { r: 255, g: 0, b: 0 },
          sourceLabel: "Urban and Built-up Lands",
        },
      ],
      noDataEntryCount: 0,
    });
  });

  it("keeps every source value a single colour renders", () => {
    const xml = colormapDoc(
      `<ColorMapEntry rgb="134,202,227" transparent="false" sourceValue="0,17" ref="16"/>`,
      `<LegendEntry rgb="134,202,227" tooltip="Water Bodies" id="16"/>`
    );
    expect(parseClassificationPalette(xml).classes[0].sourceValues).toEqual([
      0, 17,
    ]);
  });

  it("counts transparent no-data entries instead of mapping them to a class", () => {
    const xml = colormapDoc(
      `<ColorMapEntry rgb="100,100,100" transparent="false" sourceValue="255" ref="17"/><ColorMapEntry rgb="0,0,0" transparent="true" nodata="true" ref="18"/>`,
      `<LegendEntry rgb="100,100,100" tooltip="Unclassified" id="17"/>`
    );
    const palette = parseClassificationPalette(xml);
    expect(palette.classes).toHaveLength(1);
    expect(palette.noDataEntryCount).toBe(1);
  });

  it("reads nothing from a continuous ramp document", () => {
    const xml = `<ColorMaps><ColorMap units="K"><Legend type="continuous"><LegendEntry rgb="1,2,3" tooltip="200.0 - 210.0" id="0"/></Legend></ColorMap></ColorMaps>`;
    expect(parseClassificationPalette(xml)).toEqual({
      classes: [],
      noDataEntryCount: 0,
    });
  });

  it("rejects a class entry with no legend row rather than dropping it", () => {
    const xml = colormapDoc(
      `<ColorMapEntry rgb="255,0,0" transparent="false" sourceValue="13" ref="12"/>`,
      `<LegendEntry rgb="255,0,0" tooltip="Urban and Built-up Lands" id="9"/>`
    );
    expect(() => parseClassificationPalette(xml)).toThrow(/no legend row/);
  });

  it("rejects a document whose entry and legend row disagree on colour", () => {
    const xml = colormapDoc(
      `<ColorMapEntry rgb="255,0,0" transparent="false" sourceValue="13" ref="12"/>`,
      `<LegendEntry rgb="254,0,0" tooltip="Urban and Built-up Lands" id="12"/>`
    );
    expect(() => parseClassificationPalette(xml)).toThrow(/disagree on colour/);
  });

  it("rejects a non-integer source value rather than rounding it into a class", () => {
    const xml = colormapDoc(
      `<ColorMapEntry rgb="255,0,0" transparent="false" sourceValue="13.5" ref="12"/>`,
      `<LegendEntry rgb="255,0,0" tooltip="Urban and Built-up Lands" id="12"/>`
    );
    expect(() => parseClassificationPalette(xml)).toThrow(
      /non-integer source value/
    );
  });
});

describe("pinned MCD12Q1 rendering contract", () => {
  it("names the colormap document and retains its dataset provenance", () => {
    expect(LAND_COVER_COLORMAP_DOC).toBe("MODIS_IGBP_Land_Cover_Type");
    expect(LAND_COVER_PALETTE_SOURCE.doi).toBe("10.5067/MODIS/MCD12Q1.061");
    expect(LAND_COVER_PALETTE_SOURCE.shortName).toBe("MCD12Q1");
  });

  it("agrees with the palette rendered pixels are decoded through", () => {
    for (const rendering of SOURCE_IGBP_CLASS_RENDERING) {
      const code = decodableClassCode(rendering);
      expect(
        code,
        `${rendering.sourceLabel} resolves to one class`
      ).not.toBeNull();
      expect(IGBP_RENDERED_PALETTE[code!]).toEqual(rendering.rgb);
    }
  });

  it("covers every class the repository can decode, and no others", () => {
    const pinned = SOURCE_IGBP_CLASS_RENDERING.map((rendering) =>
      decodableClassCode(rendering)!
    );
    expect([...pinned].sort((a, b) => a - b)).toEqual(
      IGBP_LAND_COVER_CLASSES.map(({ code }) => code).sort((a, b) => a - b)
    );
  });

  it("decodes each pinned source colour back to its own class", () => {
    for (const rendering of SOURCE_IGBP_CLASS_RENDERING) {
      expect(decodeRenderedLandCoverPixel(rendering.rgb)).toEqual({
        status: "classified",
        classCode: decodableClassCode(rendering),
      });
    }
  });

  it("resolves the shared water colour without inventing a class for source value 0", () => {
    const water = SOURCE_IGBP_CLASS_RENDERING.find((rendering) =>
      rendering.sourceValues.includes(17)
    );
    expect(water?.sourceValues).toEqual([0, 17]);
    expect(decodableClassCode(water!)).toBe(17);
  });

  it("reports no class when a colour stops resolving to exactly one code", () => {
    expect(
      decodableClassCode({
        sourceValues: [12, 14],
        rgb: { r: 0, g: 0, b: 0 },
        sourceLabel: "Croplands merged with mosaics",
      })
    ).toBeNull();
    expect(
      decodableClassCode({
        sourceValues: [0],
        rgb: { r: 0, g: 0, b: 0 },
        sourceLabel: "Undocumented source value",
      })
    ).toBeNull();
  });

  it("pins the transparent no-data entry count", () => {
    expect(SOURCE_NO_DATA_ENTRY_COUNT).toBe(1);
  });
});
