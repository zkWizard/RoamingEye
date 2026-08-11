import { describe, it, expect, beforeAll } from "vitest";
import {
  GIBS_VARIABLE_TITLES,
  renderedLayerIdentities,
  variableQualifiers,
} from "../src/lib/variableIdentity";

/**
 * Variable-identity contract: the `<ows:Title>` GIBS advertises for each layer
 * we render must still name the same quantity we pinned in
 * lib/variableIdentity.ts.
 *
 * The catalog contract next door asks whether an identifier still EXISTS; this
 * one asks what it IS. Those are different questions, and only the second
 * catches the failure that produced #733 — `GLDAS_Underground_Soil_Moisture_
 * Monthly` describes a 0-10 cm surface layer, not the root zone the app named
 * for months, and every existence check passed the whole time. GIBS also
 * re-points identifiers at new products, and a re-point that changes the
 * variable (a different depth, a different band, a night composite instead of
 * a day one) would otherwise reach users as a silent unit change in every
 * chart, CSV, and citation.
 *
 * Network-touching by design, so it is NOT part of `npm run test`; it runs
 * weekly via .github/workflows/catalog-check.yml (and `npm run test:contract`
 * on demand). One in-run retry absorbs a transient blip.
 */

const CAPS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml";

/** Advertised title per layer identifier, from the live capabilities. */
let liveTitles: Map<string, string>;

async function fetchCapabilities(): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(CAPS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status} for GetCapabilities`);
      return await res.text();
    } catch (err) {
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

beforeAll(async () => {
  const xml = await fetchCapabilities();
  liveTitles = new Map();
  // In a GIBS <Layer> block ows:Title precedes ows:Identifier, and both recur
  // deeper (styles, dimensions) — so the FIRST of each is the layer's own.
  for (const block of xml.split("<Layer>").slice(1)) {
    const body = block.split("</Layer>")[0];
    const id = /<ows:Identifier>([^<]+)<\/ows:Identifier>/.exec(body)?.[1];
    const title = /<ows:Title[^>]*>([^<]*)<\/ows:Title>/.exec(body)?.[1];
    if (id && title !== undefined) liveTitles.set(id, title);
  }
  expect(
    liveTitles.size,
    "capabilities parsed into zero titled layers — format change?"
  ).toBeGreaterThan(100);
}, 120_000);

describe("GIBS variable-identity contract (live GetCapabilities)", () => {
  it.each(renderedLayerIdentities())(
    "$wmsLayer still renders the variable we pinned",
    ({ id, wmsLayer, gibsTitle }) => {
      const live = liveTitles.get(wmsLayer);
      expect(
        live,
        `layer "${wmsLayer}" (${id}) advertises no title — gone or renamed?`
      ).toBeDefined();
      expect(
        live,
        `layer "${wmsLayer}" (${id}) now calls itself something else.\n` +
          `  pinned: ${gibsTitle}\n` +
          `  live:   ${live}\n` +
          `If the quantity changed (depth, band, overpass, units), our copy, ` +
          `legend, scale, and citations all describe the wrong thing. ` +
          `Re-pin only after checking what actually moved.`
      ).toBe(gibsTitle);
    }
  );

  it("every pinned title still parses into the qualifiers we rely on", () => {
    // A title can keep its wording and still be re-punctuated upstream, which
    // would quietly empty the qualifier list this module reports from.
    const parsed = renderedLayerIdentities().map((i) => ({
      id: i.id,
      qualifiers: variableQualifiers(liveTitles.get(i.wmsLayer) ?? "").length,
    }));
    const expected = renderedLayerIdentities().map((i) => ({
      id: i.id,
      qualifiers: variableQualifiers(GIBS_VARIABLE_TITLES[i.wmsLayer]).length,
    }));
    expect(parsed).toEqual(expected);
  });
});
