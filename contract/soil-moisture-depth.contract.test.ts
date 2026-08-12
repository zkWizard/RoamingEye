import { describe, it, expect, beforeAll } from "vitest";
import { LAYERS } from "../src/lib/timeline";
import { SOIL_MOISTURE_DEPTH_CM } from "../src/lib/soilMoistureDepth";

/**
 * Sampling-depth contract: the depth RoamingEye cites for the soil layer must
 * be the depth NASA GIBS publishes it at.
 *
 * A soil-moisture column water content in kg/m² is meaningless without the
 * depth of the column it integrates, and GLDAS Noah carries several (0-10,
 * 10-40, 40-100, 100-200 cm, plus the 0-100 cm root zone). RoamingEye read the
 * rendered layer as root-zone moisture for a long time; it is in fact the
 * 0-10 cm surface layer, which holds ~10× less water and dries within days.
 * GIBS states the depth in the layer's own title, so this check re-derives it
 * from upstream rather than trusting our label — if NASA ever re-points the
 * identifier at a different column, this fails instead of silently
 * re-introducing the same mislabel.
 *
 * Network-touching by design, so it is NOT part of `npm run test`; it runs
 * weekly alongside the other catalog contracts (`npm run test:contract`). One
 * in-run retry absorbs a transient blip.
 */

const CAPS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml";

let soilLayerTitle: string | undefined;

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
  const identifier = LAYERS.soil.wmsLayer;
  for (const block of xml.split("<Layer>").slice(1)) {
    const body = block.split("</Layer>")[0];
    if (
      !new RegExp(`<ows:Identifier>${identifier}</ows:Identifier>`).test(body)
    ) {
      continue;
    }
    soilLayerTitle = /<ows:Title[^>]*>([^<]+)<\/ows:Title>/.exec(body)?.[1];
    break;
  }
}, 120_000);

describe("GLDAS soil-moisture sampling depth (live GetCapabilities)", () => {
  it("still publishes a title for the layer we render", () => {
    expect(
      soilLayerTitle,
      `no ows:Title for "${LAYERS.soil.wmsLayer}" — layer retired, or the capabilities format changed`
    ).toBeTruthy();
  });

  it("declares the depth interval we cite", () => {
    const { top, bottom } = SOIL_MOISTURE_DEPTH_CM;
    // GIBS writes the interval as "0-10 cm" inside the human-readable title,
    // e.g. "Soil Moisture (Monthly, 0-10 cm, Noah LSM, GLDAS)". Accept any
    // dash GIBS may render it with; reject a different pair of numbers.
    expect(
      soilLayerTitle,
      `GIBS now titles "${LAYERS.soil.wmsLayer}" as "${soilLayerTitle}" — it no longer declares the ${top}-${bottom} cm column RoamingEye cites`
    ).toMatch(new RegExp(`\\b${top}\\s*[-–—]\\s*${bottom}\\s*cm\\b`, "i"));
  });

  it("is not the root-zone column", () => {
    expect(
      soilLayerTitle,
      "GIBS now advertises this identifier as a root-zone layer; the surface-layer caveats no longer apply"
    ).not.toMatch(/root.?zone|RootMoist/i);
  });
});
