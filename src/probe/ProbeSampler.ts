import {
  gibsWmsUrl,
  type LayerConfig,
  type YearMonth,
  type GibsImageOptions,
} from "../lib/timeline";
import { LEGENDS } from "../lib/legend";
import {
  buildColormapLut,
  invertColormap,
  latLonToPixel,
  medianValid,
  meanValid,
  gridPoints,
  type Rgb,
} from "../lib/probe";
import { regionAround, type Bounds } from "../lib/imagery";
import { fetchBlob } from "../lib/net";
import type { LayerId } from "../lib/timeline";

/**
 * Fetches one GIBS monthly preview per month and samples it at a lat/lon,
 * inverting the layer's colormap into an approximate 0..1 value (see
 * lib/probe.ts for the math and the "approximate" caveat).
 *
 * Two sampling modes:
 *  - "point": the 3×3 pixel block around the location, median of the valid
 *    inversions — robust to JPEG ringing and coastline mixing.
 *  - "area": an 8×8 geographic grid over a ~1° box centred on the location,
 *    mean of the valid inversions — the region statistic (drought over a
 *    district, not a field).
 *
 * The image size matches GlobeTextureManager's preview size exactly, so every
 * month the user has scrubbed past is already in the browser's HTTP cache —
 * a probe over recent years typically costs no network at all.
 */

export type ProbeMode = "point" | "area";

/** Ground span of the area-mode box, in degrees of latitude. */
export const AREA_SPAN_DEG = 1.0;
const AREA_GRID = 8;

export interface SampleOptions {
  mode?: ProbeMode;
  signal?: AbortSignal;
  /** Called as months complete (done counts monotonically to total). */
  onProgress?: (done: number, total: number) => void;
  /**
   * Called with each month's value as it lands (index into the months array),
   * so the chart can fill in progressively.
   */
  onValue?: (index: number, value: number | null) => void;
}

export class ProbeSampler {
  constructor(
    private readonly imageSize: Required<
      Pick<GibsImageOptions, "width" | "height">
    > = { width: 1024, height: 512 },
    private readonly concurrency = 8
  ) {}

  /** The box area mode averages over, for provenance and the panel caption. */
  areaBounds(lat: number, lon: number): Bounds {
    return regionAround(lat, lon, AREA_SPAN_DEG);
  }

  /**
   * Sample a layer at (lat, lon) across the given months. Resolves with one
   * value (or null = no data) per month, in order. Rejects on abort.
   */
  async sample(
    layer: LayerConfig,
    months: YearMonth[],
    lat: number,
    lon: number,
    options: SampleOptions = {}
  ): Promise<(number | null)[]> {
    const { mode = "point", signal, onProgress, onValue } = options;
    const spec = LEGENDS[layer.id as LayerId];
    if (spec.kind === "classes") {
      // Class-coded layers have no continuous colormap to invert; the app
      // declines to probe them before getting here (see main.ts).
      throw new Error(
        `RoamingEye: layer "${layer.id}" is categorical — nothing to sample`
      );
    }
    const lut = buildColormapLut(spec.stops);
    const pixels = this.pixelsFor(mode, lat, lon);

    const canvas = document.createElement("canvas");
    canvas.width = pixels.length;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("RoamingEye: 2d canvas context unavailable");

    // Median for a tight pixel block; mean with a lower validity bar for a
    // geographic grid (a coastal region box is still a valid region).
    const combine =
      mode === "point"
        ? (inversions: (number | null)[]) => medianValid(inversions)
        : (inversions: (number | null)[]) => meanValid(inversions);

    const values: (number | null)[] = new Array(months.length).fill(null);
    let done = 0;
    let next = 0;

    const worker = async (): Promise<void> => {
      while (next < months.length) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const index = next++;
        values[index] = await this.sampleMonth(
          layer,
          months[index],
          pixels,
          lut,
          ctx,
          combine,
          signal
        );
        done++;
        onValue?.(index, values[index]);
        onProgress?.(done, months.length);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, months.length) }, worker)
    );
    return values;
  }

  /** The set of source pixels a mode reads (deduped for coarse images). */
  private pixelsFor(
    mode: ProbeMode,
    lat: number,
    lon: number
  ): { x: number; y: number }[] {
    const { width, height } = this.imageSize;
    if (mode === "point") {
      const { x, y } = latLonToPixel(lat, lon, width, height);
      const block: { x: number; y: number }[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) block.push({ x: x + dx, y: y + dy });
      }
      return block;
    }
    const seen = new Set<string>();
    const pixels: { x: number; y: number }[] = [];
    for (const p of gridPoints(this.areaBounds(lat, lon), AREA_GRID)) {
      const px = latLonToPixel(p.lat, p.lon, width, height);
      const key = `${px.x}:${px.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pixels.push(px);
    }
    return pixels;
  }

  private async sampleMonth(
    layer: LayerConfig,
    ym: YearMonth,
    pixels: { x: number; y: number }[],
    lut: Rgb[],
    ctx: CanvasRenderingContext2D,
    combine: (inversions: (number | null)[]) => number | null,
    signal?: AbortSignal
  ): Promise<number | null> {
    let bitmap: ImageBitmap;
    try {
      const blob = await fetchBlob(
        gibsWmsUrl(layer, ym, {
          width: this.imageSize.width,
          height: this.imageSize.height,
        }),
        { signal, retries: 1 }
      );
      bitmap = await createImageBitmap(blob);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      return null; // a missing month is a gap in the chart, not a failure
    }

    // Copy each source pixel into a 1-px-tall strip and read it in one call.
    ctx.clearRect(0, 0, pixels.length, 1);
    for (let i = 0; i < pixels.length; i++) {
      ctx.drawImage(bitmap, pixels[i].x, pixels[i].y, 1, 1, i, 0, 1, 1);
    }
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, pixels.length, 1);

    const inversions: (number | null)[] = [];
    for (let i = 0; i < pixels.length; i++) {
      inversions.push(
        invertColormap(
          { r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] },
          lut
        )
      );
    }
    return combine(inversions);
  }
}
