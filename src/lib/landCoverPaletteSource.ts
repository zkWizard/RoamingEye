import { LAND_COVER_SOURCE, type IgbpLandCoverClassCode } from "./landCover";
import type { DatasetRef } from "./timeline";

/**
 * The authoritative GIBS rendering contract for the MCD12Q1 IGBP layer.
 *
 * `IGBP_RENDERED_PALETTE` pins the RGB values a rendered land-cover pixel is
 * decoded through, but nothing re-derived them from the source, so an upstream
 * re-render would relabel classes silently. On a *categorical* layer that is a
 * worse failure than the drift the continuous layers are guarded against: a
 * mis-scaled temperature is still a temperature, whereas a stale palette row
 * reports cropland as savanna with no numeric tell.
 *
 * The existing colormap guards cannot cover this layer. `COLORMAP_DOCS` lists
 * continuous ramps only, and both `parseColormapEntries` and `parseColormap`
 * read `<Legend type="continuous">` — this document publishes
 * `<Legend type="classification">`, so they return nothing for it.
 */

/**
 * Colormap document name, read 2026-08-11 from this layer's `ows:Metadata`
 * colormap link (role .../colormap/1.3) in the live EPSG:4326 WMTS
 * capabilities. As with LST and SST, it is NOT the layer identifier:
 * `MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual.xml` is a 404.
 */
export const LAND_COVER_COLORMAP_DOC = "MODIS_IGBP_Land_Cover_Type";

/** MCD12Q1 v061 provenance, retained with the rendering contract. */
export const LAND_COVER_PALETTE_SOURCE: DatasetRef = LAND_COVER_SOURCE;

export interface SourceClassRendering {
  /**
   * Every source data value GIBS renders with this colour. Usually one; the
   * document collapses more than one where the rendering does not separate
   * them, and that is a limit of the imagery, not of the product.
   */
  sourceValues: readonly number[];
  rgb: { r: number; g: number; b: number };
  /** GIBS's own name for the class, verbatim. */
  sourceLabel: string;
}

export interface ClassificationPalette {
  classes: SourceClassRendering[];
  /**
   * Entries GIBS marks `nodata`. They render transparent, so they carry no
   * colour to decode and are counted rather than mapped to a class.
   */
  noDataEntryCount: number;
}

/**
 * The rendering contract as published on 2026-08-11, pinned so the contract
 * test can fail naming the exact row that moved.
 *
 * Source labels are recorded verbatim and are deliberately not asserted
 * against `IGBP_LAND_COVER_CLASSES`, whose labels are shortened for display
 * ("Water" for "Water Bodies", "Urban & built-up" for "Urban and Built-up
 * Lands"). Pinning both separately catches an upstream relabel without
 * forcing the display copy to track GIBS's capitalisation and plurals.
 */
export const SOURCE_IGBP_CLASS_RENDERING: readonly SourceClassRendering[] = [
  {
    sourceValues: [1],
    rgb: { r: 33, g: 138, b: 33 },
    sourceLabel: "Evergreen Needleleaf Forests",
  },
  {
    sourceValues: [2],
    rgb: { r: 49, g: 204, b: 49 },
    sourceLabel: "Evergreen Broadleaf Forests",
  },
  {
    sourceValues: [3],
    rgb: { r: 152, g: 204, b: 49 },
    sourceLabel: "Deciduous Needleleaf Forests",
  },
  {
    sourceValues: [4],
    rgb: { r: 150, g: 250, b: 150 },
    sourceLabel: "Deciduous Broadleaf Forests",
  },
  {
    sourceValues: [5],
    rgb: { r: 141, g: 186, b: 141 },
    sourceLabel: "Mixed Forests",
  },
  {
    sourceValues: [6],
    rgb: { r: 186, g: 141, b: 141 },
    sourceLabel: "Closed Shrublands",
  },
  {
    sourceValues: [7],
    rgb: { r: 245, g: 222, b: 179 },
    sourceLabel: "Open Shrublands",
  },
  {
    sourceValues: [8],
    rgb: { r: 218, g: 235, b: 157 },
    sourceLabel: "Woody Savannas",
  },
  {
    sourceValues: [9],
    rgb: { r: 255, g: 213, b: 0 },
    sourceLabel: "Savannas",
  },
  {
    sourceValues: [10],
    rgb: { r: 240, g: 185, b: 103 },
    sourceLabel: "Grasslands",
  },
  {
    sourceValues: [11],
    rgb: { r: 71, g: 131, b: 181 },
    sourceLabel: "Permanent Wetlands",
  },
  {
    sourceValues: [12],
    rgb: { r: 250, g: 239, b: 115 },
    sourceLabel: "Croplands",
  },
  {
    sourceValues: [13],
    rgb: { r: 255, g: 0, b: 0 },
    sourceLabel: "Urban and Built-up Lands",
  },
  {
    sourceValues: [14],
    rgb: { r: 153, g: 147, b: 86 },
    sourceLabel: "Cropland/Natural Vegetation Mosaics",
  },
  {
    sourceValues: [15],
    rgb: { r: 255, g: 255, b: 255 },
    sourceLabel: "Permanent Snow and Ice",
  },
  {
    sourceValues: [16],
    rgb: { r: 191, g: 191, b: 189 },
    sourceLabel: "Barren",
  },
  {
    sourceValues: [0, 17],
    rgb: { r: 134, g: 202, b: 227 },
    sourceLabel: "Water Bodies",
  },
  {
    sourceValues: [255],
    rgb: { r: 100, g: 100, b: 100 },
    sourceLabel: "Unclassified",
  },
];

/** Transparent `nodata` entries published alongside the classes. */
export const SOURCE_NO_DATA_ENTRY_COUNT = 1;

/** Codes the repository decodes rendered pixels into (1..17 and 255). */
const DECODABLE_CLASS_CODES: ReadonlySet<number> = new Set([
  ...Array.from({ length: 17 }, (_, index) => index + 1),
  255,
]);

/**
 * Resolve the class code a rendered colour is decoded as.
 *
 * Only value 17 of the shared `0,17` entry is a published MCD12Q1 LC_Type1
 * class — the product documents 1..17 with 255 as fill — so the colour is
 * decoded as water. That resolution comes from the product specification, not
 * from the pixel: the rendered image alone does not separate the two values.
 * A row that stops resolving to exactly one decodable code is a rendering
 * change the decoder cannot absorb, so it is reported rather than guessed at.
 */
export function decodableClassCode(
  rendering: SourceClassRendering
): IgbpLandCoverClassCode | null {
  const decodable = rendering.sourceValues.filter((value) =>
    DECODABLE_CLASS_CODES.has(value)
  );
  return decodable.length === 1
    ? (decodable[0] as IgbpLandCoverClassCode)
    : null;
}

/**
 * Parse a GIBS classification colormap document into its rendering contract.
 *
 * Format notes, learned from the live document:
 *  - `<Entries>` carries the data side (`sourceValue`, `nodata`) and the
 *    `<Legend type="classification">` block carries the human class name;
 *    they are joined on the entry's `ref` and the legend's `id`.
 *  - `sourceValue` is a comma-separated list where one colour renders more
 *    than one source value.
 *  - the `nodata` entry has no `sourceValue` and no legend row.
 */
export function parseClassificationPalette(xml: string): ClassificationPalette {
  const legend = /<Legend type="classification"[\s\S]*?<\/Legend>/.exec(
    xml
  )?.[0];
  const labels = new Map<string, { label: string; rgb: string }>();
  for (const tag of legend?.match(/<LegendEntry\b[^>]*\/?>/g) ?? []) {
    const id = /\bid="([^"]*)"/.exec(tag)?.[1];
    const label = /\btooltip="([^"]*)"/.exec(tag)?.[1];
    const rgb = /\brgb="([^"]*)"/.exec(tag)?.[1];
    if (id === undefined || label === undefined || rgb === undefined) continue;
    labels.set(id, { label, rgb });
  }

  const classes: SourceClassRendering[] = [];
  let noDataEntryCount = 0;
  for (const tag of xml.match(/<ColorMapEntry\b[^>]*\/?>/g) ?? []) {
    if (/\bnodata="true"/.test(tag)) {
      noDataEntryCount += 1;
      continue;
    }
    const rgb = /\brgb="(\d+),(\d+),(\d+)"/.exec(tag);
    const ref = /\bref="([^"]*)"/.exec(tag)?.[1];
    const sourceValue = /\bsourceValue="([^"]*)"/.exec(tag)?.[1];
    if (!rgb || ref === undefined || sourceValue === undefined) continue;

    const legendEntry = labels.get(ref);
    if (!legendEntry) {
      throw new Error(
        `RoamingEye: classification colormap entry ref="${ref}" has no legend row`
      );
    }
    if (legendEntry.rgb !== `${+rgb[1]},${+rgb[2]},${+rgb[3]}`) {
      throw new Error(
        `RoamingEye: classification colormap entry ref="${ref}" and its legend row disagree on colour`
      );
    }

    const sourceValues = sourceValue
      .split(",")
      .map((value) => Number(value.trim()));
    if (sourceValues.some((value) => !Number.isInteger(value))) {
      throw new Error(
        `RoamingEye: classification colormap entry ref="${ref}" has a non-integer source value`
      );
    }

    classes.push({
      sourceValues,
      rgb: { r: +rgb[1], g: +rgb[2], b: +rgb[3] },
      sourceLabel: legendEntry.label,
    });
  }
  return { classes, noDataEntryCount };
}
