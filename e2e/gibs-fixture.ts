import { crc32, deflateSync } from "node:zlib";
import type { Page, Route } from "@playwright/test";

/**
 * Vegetation green from the NDVI legend stop at 0.7 (`#126e01` in
 * src/lib/legend.ts). It sits on the gradient the probe inverts, so a solid
 * frame reads as a real value rather than the black no-data fill.
 */
export const VEGETATION_GREEN: readonly [number, number, number] = [
  0x12, 0x6e, 0x01,
];

/**
 * Lossless truecolor PNG. GIBS WMS is answered with one of these so a
 * full-record probe does not wait on NASA, and the colour survives decoding
 * (JPEG would drift off the legend and come back as no-data).
 */
export function solidRgbPng(
  width: number,
  height: number,
  rgb: readonly [number, number, number]
): Buffer {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) row.copy(raw, y * row.length);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData) >>> 0);
  return Buffer.concat([length, typeAndData, crc]);
}

const TILE = { width: 8, height: 8 } as const;

/**
 * Serve globe imagery from memory.
 *
 * The full-record probe specs wait until every month has been sampled. On a
 * live runner that is a few hundred GIBS previews competing with the terrain
 * mesh for sockets — about a minute locally, and the 90s/180s timeouts that
 * flake CI. These specs assert the settled readout, not NASA's latency, so a
 * legend-green frame of the requested size settles the same panel. The Amazon
 * aim is unchanged: without this stub the Pacific default still has nothing
 * to split, and the test fails instead of passing on an empty record.
 *
 * Terrain and the photographic base map are answered too. They are not what
 * the spec measures, and a live stream of them is what starved the sample.
 */
export async function fulfillImageryLocally(page: Page): Promise<void> {
  const cache = new Map<string, Buffer>();
  const png = (width: number, height: number): Buffer => {
    const key = `${width}x${height}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = solidRgbPng(width, height, VEGETATION_GREEN);
      cache.set(key, hit);
    }
    return hit;
  };
  // A fresh copy every time: Playwright detaches the body buffer it sends,
  // and a reused one fails later months, which then retry until the test dies
  // still saying "Sampling…".
  const fulfill = (route: Route, width: number, height: number) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(png(width, height)),
    });

  await page.route("**gibs.earthdata.nasa.gov**", (route: Route) => {
    const url = route.request().url();
    if (!/wms\.cgi|\/wmts\//.test(url)) return route.continue();
    // The probe samples a JPEG GetMap at the preview size and reads pixels by
    // that size, so the bitmap has to be the requested one. Globe previews,
    // the sharp frame, and WMTS tiles only have to decode; an 8×8 frame keeps
    // three hundred of them from competing with the sample.
    if (isProbeSample(url)) {
      const size = requestedSize(url);
      return fulfill(route, size.width, size.height);
    }
    return fulfill(route, TILE.width, TILE.height);
  });

  await page.route("**elevation-tiles-prod**", (route) =>
    fulfill(route, TILE.width, TILE.height)
  );
  await page.route("**arcgisonline.com**", (route) =>
    fulfill(route, TILE.width, TILE.height)
  );
}

function isProbeSample(url: string): boolean {
  try {
    return new URL(url).searchParams.get("FORMAT") === "image/jpeg";
  } catch {
    return false;
  }
}

function requestedSize(url: string): { width: number; height: number } {
  let width = Number.NaN;
  let height = Number.NaN;
  try {
    const parsed = new URL(url);
    width = Number(parsed.searchParams.get("WIDTH"));
    height = Number(parsed.searchParams.get("HEIGHT"));
  } catch {
    // WMTS tile paths have no dimensions; a small frame is enough.
  }
  if (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 1 &&
    width <= 4096 &&
    height >= 1 &&
    height <= 4096
  ) {
    return { width, height };
  }
  return { width: TILE.width, height: TILE.height };
}
