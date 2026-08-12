import { describe, it, expect } from "vitest";
import { colormapUrl, parseColormapEntries } from "../src/lib/colormap";
import {
  GLDAS_RAMP_SATURATION,
  type GldasRampLayerId,
} from "../src/lib/gldasRampSaturation";
import { invertColormapEntries, NO_DATA_DISTANCE } from "../src/lib/probe";

/**
 * GLDAS ramp-saturation contract check: `GLDAS_RAMP_SATURATION` pins the two
 * open-ended catch-all swatches at each water-cycle ramp's ends — the colours
 * `parseColormapEntries` drops and the inversion then rejects as no-data — read
 * from the live colormap documents on 2026-08-11. GIBS can re-render a palette,
 * move a cap's bound, or close an open end, and the saturation descriptor would
 * silently describe a ramp that no longer exists. This re-derives both caps from
 * the live XML and fails naming the layer and the drift.
 *
 * Network-touching by design; runs weekly via catalog-check.yml alongside the
 * other contracts (same npm run test:contract).
 */

async function fetchColormap(doc: string): Promise<string> {
  const url = colormapUrl(doc);
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

/**
 * Every continuous-legend swatch with its raw tooltip, caps included — the
 * superset `parseColormapEntries` narrows to the finite "lo – hi" ones.
 */
function publishedSwatches(
  xml: string
): { rgb: { r: number; g: number; b: number }; tooltip: string }[] {
  const legend = /<Legend type="continuous"[\s\S]*?<\/Legend>/.exec(xml)?.[0];
  if (!legend) return [];
  const swatches: {
    rgb: { r: number; g: number; b: number };
    tooltip: string;
  }[] = [];
  for (const tag of legend.match(/<LegendEntry\b[^>]*\/?>/g) ?? []) {
    const rgbM = /rgb="(\d+),(\d+),(\d+)"/.exec(tag);
    const tipM = /tooltip="([^"]*)"/.exec(tag);
    if (!rgbM || !tipM) continue;
    swatches.push({
      rgb: { r: +rgbM[1], g: +rgbM[2], b: +rgbM[3] },
      tooltip: decodeEntities(tipM[1]).trim(),
    });
  }
  return swatches;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8805;/g, "≥")
    .replace(/&amp;/g, "&");
}

const LAYER_IDS: GldasRampLayerId[] = ["precip", "soil"];

describe("GIBS GLDAS colormap ↔ ramp-saturation contract", () => {
  for (const layerId of LAYER_IDS) {
    const facts = GLDAS_RAMP_SATURATION[layerId];

    it(`${layerId}: live ${facts.colormapDocument} still ends in the pinned caps`, async () => {
      const xml = await fetchColormap(facts.colormapDocument);
      const swatches = publishedSwatches(xml);
      const retained = parseColormapEntries(xml);

      // Shape: the document still publishes exactly two more swatches than the
      // parser retains, and they are still the first and last.
      expect(swatches, `${facts.colormapDocument} swatch count`).toHaveLength(
        facts.publishedSwatchCount
      );
      expect(retained, `${facts.colormapDocument} retained count`).toHaveLength(
        facts.retainedSwatchCount
      );

      const first = swatches[0];
      const last = swatches[swatches.length - 1];
      expect(first.rgb, `${layerId} sub-zero cap colour`).toEqual(
        facts.belowZeroFill.rgb
      );
      expect(last.rgb, `${layerId} ceiling cap colour`).toEqual(
        facts.ceiling.rgb
      );

      // Bounds: the tooltips still print the values the descriptor quotes.
      expect(first.tooltip, `${layerId} sub-zero cap label`).toBe(
        facts.belowZeroFill.publishedLabel
      );
      expect(last.tooltip, `${layerId} ceiling cap label`).toBe(
        facts.ceiling.publishedLabel
      );

      // Openness: neither cap may become a finite bin without the descriptor
      // being revisited — a closed end would be representable, not a bound.
      for (const tooltip of [first.tooltip, last.tooltip]) {
        expect(tooltip, `${layerId} cap still open-ended`).toMatch(/^[<≥]/);
      }

      // Reachability: the caps must remain outside the inversion's tolerance,
      // so a saturated pixel is still withheld rather than silently reported as
      // a neighbouring swatch's value.
      for (const cap of [facts.belowZeroFill, facts.ceiling]) {
        const nearest = Math.min(
          ...retained.map((entry) =>
            Math.hypot(
              cap.rgb.r - entry.rgb.r,
              cap.rgb.g - entry.rgb.g,
              cap.rgb.b - entry.rgb.b
            )
          )
        );
        expect(
          nearest,
          `${layerId} cap ${cap.publishedLabel} beyond no-data tolerance`
        ).toBeGreaterThan(NO_DATA_DISTANCE);
        expect(invertColormapEntries(cap.rgb, retained)).toBeNull();
      }
    });
  }
});
