import { describe, it, expect, beforeAll } from "vitest";
import { colormapUrl } from "../src/lib/colormap";
import { LAYERS } from "../src/lib/timeline";
import { IGBP_RENDERED_PALETTE } from "../src/lib/landCoverPalette";
import {
  decodableClassCode,
  LAND_COVER_COLORMAP_DOC,
  parseClassificationPalette,
  SOURCE_IGBP_CLASS_RENDERING,
  SOURCE_NO_DATA_ENTRY_COUNT,
} from "../src/lib/landCoverPaletteSource";

/**
 * Land-cover palette contract: `IGBP_RENDERED_PALETTE` is the table every
 * rendered MCD12Q1 pixel is decoded through, and it was hand-entered. GIBS can
 * re-render a palette, and on a categorical layer that does not shift a value
 * — it renames the class. A stale row reports cropland as savanna with no
 * numeric tell, so this re-derives the mapping from the live document and
 * fails naming the class that moved.
 *
 * `probe-scales` and `inversion-validation` cannot cover this layer: both walk
 * `COLORMAP_DOCS`, which lists continuous ramps only, and both parse
 * `<Legend type="continuous">` while this document publishes
 * `<Legend type="classification">`.
 *
 * Network-touching by design; runs weekly via catalog-check.yml alongside the
 * other contracts (same npm run test:contract).
 */

const CAPS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml";

async function fetchText(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

describe("GIBS colormap ↔ IGBP_RENDERED_PALETTE contract", () => {
  let xml: string;

  beforeAll(async () => {
    xml = await fetchText(colormapUrl(LAND_COVER_COLORMAP_DOC));
  }, 120_000);

  it("is still the colormap the land-cover layer itself points at", async () => {
    const caps = await fetchText(CAPS_URL);
    const wmsLayer = LAYERS.landcover.wmsLayer;
    const block = caps
      .split("<Layer>")
      .slice(1)
      .map((part) => part.split("</Layer>")[0])
      .find((body) =>
        body.includes(`<ows:Identifier>${wmsLayer}</ows:Identifier>`)
      );
    expect(block, `${wmsLayer} is published`).toBeTruthy();

    // The colormap document name is not the layer identifier for this layer,
    // so the link is the only thing that proves which document applies.
    const linked = [
      ...block!.matchAll(/href='([^']*\/colormaps\/[^']*)'/g),
    ].map((match) => match[1]);
    expect(
      linked.length,
      `${wmsLayer} publishes a colormap link`
    ).toBeGreaterThan(0);
    expect(linked).toContain(colormapUrl(LAND_COVER_COLORMAP_DOC));
  });

  it("still publishes the pinned class rendering, row for row", () => {
    const palette = parseClassificationPalette(xml);
    expect(palette.classes).toEqual(SOURCE_IGBP_CLASS_RENDERING);
    expect(palette.noDataEntryCount).toBe(SOURCE_NO_DATA_ENTRY_COUNT);
  });

  it("still renders every decoded class with the colour the decoder expects", () => {
    for (const rendering of parseClassificationPalette(xml).classes) {
      const code = decodableClassCode(rendering);
      expect(
        code,
        `"${rendering.sourceLabel}" (source ${rendering.sourceValues.join(
          ","
        )}) resolves to exactly one decodable class`
      ).not.toBeNull();
      expect(
        IGBP_RENDERED_PALETTE[code!],
        `class ${code} ("${rendering.sourceLabel}") rendering`
      ).toEqual(rendering.rgb);
    }
  });

  it("maps each palette colour to exactly one class", () => {
    const { classes } = parseClassificationPalette(xml);
    const colours = classes.map(({ rgb }) => `${rgb.r},${rgb.g},${rgb.b}`);
    expect(new Set(colours).size, "distinct rendered colours").toBe(
      colours.length
    );
  });
});
