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
  type Rgb,
} from "../lib/probe";
import { fetchBlob } from "../lib/net";
import type { LayerId } from "../lib/timeline";

/**
 * Fetches one GIBS monthly preview per month and samples the pixel under a
 * lat/lon, inverting the layer's colormap into an approximate 0..1 value
 * (see lib/probe.ts for the math and the "approximate" caveat).
 *
 * The image size matches GlobeTextureManager's preview size exactly, so every
 * month the user has scrubbed past is already in the browser's HTTP cache —
 * a probe over recent years typically costs no network at all.
 */

export interface SampleOptions {
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
    const { signal, onProgress, onValue } = options;
    const lut = buildColormapLut(LEGENDS[layer.id as LayerId].stops);
    const { x, y } = latLonToPixel(
      lat,
      lon,
      this.imageSize.width,
      this.imageSize.height
    );

    const canvas = document.createElement("canvas");
    canvas.width = 3;
    canvas.height = 3;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("RoamingEye: 2d canvas context unavailable");

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
          x,
          y,
          lut,
          ctx,
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

  private async sampleMonth(
    layer: LayerConfig,
    ym: YearMonth,
    x: number,
    y: number,
    lut: Rgb[],
    ctx: CanvasRenderingContext2D,
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

    // Read the 3×3 neighborhood around the target pixel (latLonToPixel clamps
    // one pixel in from the borders, so the block is always inside the image).
    ctx.clearRect(0, 0, 3, 3);
    ctx.drawImage(bitmap, x - 1, y - 1, 3, 3, 0, 0, 3, 3);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, 3, 3);

    const inversions: (number | null)[] = [];
    for (let i = 0; i < 9; i++) {
      inversions.push(
        invertColormap(
          { r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] },
          lut
        )
      );
    }
    return medianValid(inversions);
  }
}
