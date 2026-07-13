import {
  gibsWmsUrl,
  type LayerConfig,
  type YearMonth,
  type GibsImageOptions,
} from "../lib/timeline";
import { LEGENDS } from "../lib/legend";
import {
  areaWeight,
  buildColormapLut,
  invertColormap,
  invertColormapEntries,
  latLonToPixel,
  medianValid,
  normalizeLon,
  weightedMeanValid,
  gridPoints,
  regionGridSize,
  type Rgb,
} from "../lib/probe";
import type { ColormapEntry } from "../lib/colormap";
import {
  regionAround,
  gibsRegionUrl,
  splitBoundsAtAntimeridian,
  type Bounds,
} from "../lib/imagery";
import { fetchBlob } from "../lib/net";
import type { LayerId } from "../lib/timeline";
import {
  geometryBounds,
  geometrySamplingPlan,
  type GeometrySamplingStrategy,
  type GeoGeometry,
} from "../lib/geojson";

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

export type ProbeMode = "point" | "area" | "region";

/** An image pixel to sample plus the geographic area weight it represents. */
interface WeightedPixel {
  x: number;
  y: number;
  weight: number;
}

/** A sampled series plus, per month, how much of the sampled area held data. */
export interface SampleResult {
  values: (number | null)[];
  /** Area-weighted share of valid samples per month (0..1; 0 for a month
   * whose image failed to load) — coverage honesty for the CSV's
   * valid_fraction column. */
  validFractions: number[];
  /** Dimensions of the rendered GIBS image actually sampled. These describe
   * the source imagery, not a ground-resolution measurement. */
  sourceImageDimensions: { width: number; height: number };
  /** Present for exact Polygon/MultiPolygon samples. It records the geometry
   * mask and image-pixel budget, not a ground-resolution measurement. */
  geometrySampling?: {
    gridSize: number;
    candidatePointCount: number;
    interiorPointCount: number;
    retainedPointCount: number;
    sourcePixelCount: number;
    pointLimitApplied: boolean;
  };
  /** Present for searched-boundary sampling so consumers do not present a
   * single in-boundary fallback pixel as a regional mean. */
  geometrySamplingStrategy?: GeometrySamplingStrategy;
}

/** Ground span of the area-mode box, in degrees of latitude. */
export const AREA_SPAN_DEG = 1.0;
const AREA_GRID = 8;

export interface SampleOptions {
  mode?: "point" | "area";
  signal?: AbortSignal;
  /** Called as months complete (done counts monotonically to total). */
  onProgress?: (done: number, total: number) => void;
  /**
   * Called with each month's value as it lands (index into the months array),
   * so the chart can fill in progressively.
   */
  onValue?: (index: number, value: number | null) => void;
}

type ColorInverter = (rgb: Rgb) => number | null;

interface ImageSource {
  image: CanvasImageSource;
  close: () => void;
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
  ): Promise<SampleResult> {
    const { mode = "point", signal, onProgress, onValue } = options;
    // Median for a tight pixel block; cos(lat) area-weighted mean with a
    // lower validity bar for a geographic grid (a coastal region box is
    // still a valid region).
    const combine =
      mode === "point"
        ? (inversions: (number | null)[]) => medianValid(inversions)
        : (inversions: (number | null)[], weights: number[]) =>
            weightedMeanValid(inversions, weights);
    return this.run(
      layer,
      months,
      this.pixelsFor(mode, lat, lon),
      combine,
      this.legendInverter(layer),
      { signal, onProgress, onValue }
    );
  }

  /**
   * Sample a layer's mean over an arbitrary drawn region across the given
   * months — the flagship "drawn study region" statistic. Same colormap
   * inversion and caveats as the point probe; the grid resolution adapts to
   * the box size (see lib/probe.regionGridSize).
   */
  async sampleRegion(
    layer: LayerConfig,
    months: YearMonth[],
    bounds: Bounds,
    options: Omit<SampleOptions, "mode"> = {}
  ): Promise<SampleResult> {
    return this.run(
      layer,
      months,
      this.dedupedPixels(gridPoints(bounds, regionGridSize(bounds))),
      (inversions, weights) => weightedMeanValid(inversions, weights),
      this.legendInverter(layer),
      options
    );
  }

  /**
   * Sample only cells that fall inside a searched place's Polygon or
   * MultiPolygon. The source image is requested for the place's own bounds,
   * avoiding the coarse full-globe pixel grid used by ordinary point probes.
   */
  async sampleGeometry(
    layer: LayerConfig,
    months: YearMonth[],
    geometry: GeoGeometry,
    fallback: { lat: number; lon: number },
    options: Omit<SampleOptions, "mode"> = {}
  ): Promise<SampleResult> {
    const sampling = this.geometrySampling(geometry, fallback);
    const result = await this.run(
      layer,
      months,
      sampling.pixels,
      (inversions, weights) => weightedMeanValid(inversions, weights),
      this.legendInverter(layer),
      options,
      sampling.bounds,
      sampling.strategy
    );
    return { ...result, geometrySampling: sampling.provenance };
  }

  /**
   * Sample a searched place using GIBS's published colormap values rather
   * than the UI legend approximation. The returned values are in the source
   * product's units after `factor` (for example precipitation in mm/day).
   */
  async sampleGeometryPhysical(
    layer: LayerConfig,
    months: YearMonth[],
    geometry: GeoGeometry,
    fallback: { lat: number; lon: number },
    entries: ColormapEntry[],
    factor: number,
    options: Omit<SampleOptions, "mode"> = {}
  ): Promise<SampleResult> {
    const sampling = this.geometrySampling(geometry, fallback);
    const invert: ColorInverter = (rgb) => {
      const value = invertColormapEntries(rgb, entries);
      return value === null ? null : value * factor;
    };
    const result = await this.run(
      layer,
      months,
      sampling.pixels,
      (inversions, weights) => weightedMeanValid(inversions, weights),
      invert,
      options,
      sampling.bounds,
      sampling.strategy
    );
    return { ...result, geometrySampling: sampling.provenance };
  }

  /**
   * Convert the exact-boundary plan to source pixels once. Interior grid
   * cells are preferred, refining a sparse mask within bounded budgets. When
   * even the refined mask holds no cell centre, the search coordinate itself
   * is admitted only if it lies inside the exact boundary, and the sample is
   * labelled "boundary-point" so consumers never present it as a regional
   * mean.
   */
  private geometrySampling(
    geometry: GeoGeometry,
    fallback: { lat: number; lon: number }
  ): {
    bounds: Bounds;
    pixels: WeightedPixel[];
    strategy: GeometrySamplingStrategy;
    provenance: NonNullable<SampleResult["geometrySampling"]>;
  } {
    const bounds = geometryBounds(geometry);
    if (!bounds)
      throw new Error("RoamingEye: place has no sampleable boundary");
    const plan = geometrySamplingPlan(geometry, regionGridSize(bounds));
    if (!plan) throw new Error("RoamingEye: place has no sampleable boundary");
    if (plan.points.length > 0) {
      const pixels = this.dedupedPixels(plan.points, bounds);
      return {
        bounds,
        pixels,
        strategy: plan.strategy,
        provenance: {
          gridSize: plan.gridSize,
          candidatePointCount: plan.candidatePointCount,
          interiorPointCount: plan.interiorPointCount,
          retainedPointCount: plan.points.length,
          sourcePixelCount: pixels.length,
          pointLimitApplied: plan.pointLimitApplied,
        },
      };
    }
    const pointPlan = geometrySamplingPlan(
      geometry,
      regionGridSize(bounds),
      fallback
    );
    if (!pointPlan)
      throw new Error(
        "RoamingEye: place boundary has no interior cells at bounded sampling resolution"
      );
    const pixels = this.dedupedPixels(pointPlan.points, bounds);
    return {
      bounds,
      pixels,
      strategy: "boundary-point",
      provenance: {
        gridSize: plan.gridSize,
        candidatePointCount: plan.candidatePointCount,
        interiorPointCount: plan.interiorPointCount,
        retainedPointCount: pointPlan.points.length,
        sourcePixelCount: pixels.length,
        pointLimitApplied: plan.pointLimitApplied,
      },
    };
  }

  private legendInverter(layer: LayerConfig): ColorInverter {
    const spec = LEGENDS[layer.id as LayerId];
    if (spec.kind === "classes") {
      throw new Error(
        `RoamingEye: layer "${layer.id}" is categorical - nothing to sample`
      );
    }
    const lut = buildColormapLut(spec.stops);
    return (rgb) => invertColormap(rgb, lut);
  }

  private async run(
    layer: LayerConfig,
    months: YearMonth[],
    pixels: WeightedPixel[],
    combine: (
      inversions: (number | null)[],
      weights: number[]
    ) => number | null,
    invert: ColorInverter,
    options: Omit<SampleOptions, "mode">,
    regionBounds?: Bounds,
    geometrySamplingStrategy?: GeometrySamplingStrategy
  ): Promise<SampleResult> {
    const { signal, onProgress, onValue } = options;
    const values: (number | null)[] = new Array(months.length).fill(null);
    const validFractions: number[] = new Array(months.length).fill(0);
    if (months.length === 0) {
      return {
        values,
        validFractions,
        sourceImageDimensions: { ...this.imageSize },
      };
    }
    const canvas = document.createElement("canvas");
    canvas.width = pixels.length;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("RoamingEye: 2d canvas context unavailable");

    let done = 0;
    let next = 0;

    const worker = async (): Promise<void> => {
      while (next < months.length) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const index = next++;
        const month = await this.sampleMonth(
          layer,
          months[index],
          pixels,
          invert,
          ctx,
          combine,
          signal,
          regionBounds
        );
        values[index] = month.value;
        validFractions[index] = month.validFraction;
        done++;
        onValue?.(index, values[index]);
        onProgress?.(done, months.length);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, months.length) }, worker)
    );
    return {
      values,
      validFractions,
      sourceImageDimensions: { ...this.imageSize },
      geometrySamplingStrategy,
    };
  }

  /** The set of source pixels a mode reads (deduped for coarse images). */
  private pixelsFor(
    mode: "point" | "area",
    lat: number,
    lon: number
  ): WeightedPixel[] {
    const { width, height } = this.imageSize;
    if (mode === "point") {
      const { x, y } = latLonToPixel(lat, lon, width, height);
      const block: WeightedPixel[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++)
          block.push({ x: x + dx, y: y + dy, weight: 1 });
      }
      return block;
    }
    return this.dedupedPixels(gridPoints(this.areaBounds(lat, lon), AREA_GRID));
  }

  /**
   * Geographic grid points → unique image pixels. On coarse images several
   * grid points collapse onto one pixel; that pixel then carries their summed
   * cos(lat) area weight, so the dedup never distorts the region statistic.
   */
  private dedupedPixels(
    points: { lat: number; lon: number }[],
    bounds?: Bounds
  ): WeightedPixel[] {
    const { width, height } = this.imageSize;
    const byPixel = new Map<string, WeightedPixel>();
    for (const p of points) {
      const px = bounds
        ? latLonToRegionPixel(p.lat, p.lon, bounds, width, height)
        : latLonToPixel(p.lat, p.lon, width, height);
      const key = `${px.x}:${px.y}`;
      const existing = byPixel.get(key);
      if (existing) existing.weight += areaWeight(p.lat);
      else byPixel.set(key, { ...px, weight: areaWeight(p.lat) });
    }
    return [...byPixel.values()];
  }

  private async sampleMonth(
    layer: LayerConfig,
    ym: YearMonth,
    pixels: WeightedPixel[],
    invert: ColorInverter,
    ctx: CanvasRenderingContext2D,
    combine: (
      inversions: (number | null)[],
      weights: number[]
    ) => number | null,
    signal?: AbortSignal,
    regionBounds?: Bounds
  ): Promise<{ value: number | null; validFraction: number }> {
    let source: ImageSource;
    try {
      source = regionBounds
        ? await this.loadRegionSource(layer, ym, regionBounds, signal)
        : await this.loadGlobalSource(layer, ym, signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // A missing month is a gap in the chart, not a failure.
      return { value: null, validFraction: 0 };
    }

    // Copy each source pixel into a 1-px-tall strip and read it in one call.
    ctx.clearRect(0, 0, pixels.length, 1);
    for (let i = 0; i < pixels.length; i++) {
      ctx.drawImage(source.image, pixels[i].x, pixels[i].y, 1, 1, i, 0, 1, 1);
    }
    source.close();
    const { data } = ctx.getImageData(0, 0, pixels.length, 1);

    const inversions: (number | null)[] = [];
    for (let i = 0; i < pixels.length; i++) {
      inversions.push(
        invert({ r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] })
      );
    }
    // Coverage alongside the statistic: the (area-weighted) share of the
    // sampled grid that held data — combine-independent, so point mode's
    // unit weights reduce it to a plain count share.
    let totalWeight = 0;
    let validWeight = 0;
    for (let i = 0; i < pixels.length; i++) {
      totalWeight += pixels[i].weight;
      if (inversions[i] !== null) validWeight += pixels[i].weight;
    }
    return {
      value: combine(
        inversions,
        pixels.map((p) => p.weight)
      ),
      validFraction: totalWeight > 0 ? validWeight / totalWeight : 0,
    };
  }

  private async loadGlobalSource(
    layer: LayerConfig,
    ym: YearMonth,
    signal?: AbortSignal
  ): Promise<ImageSource> {
    const blob = await fetchBlob(gibsWmsUrl(layer, ym, this.imageSize), {
      signal,
      retries: 1,
    });
    const image = await createImageBitmap(blob);
    return { image, close: () => image.close() };
  }

  private async loadRegionSource(
    layer: LayerConfig,
    ym: YearMonth,
    bounds: Bounds,
    signal?: AbortSignal
  ): Promise<ImageSource> {
    const time = `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
    const parts = splitBoundsAtAntimeridian(bounds);
    if (parts.length === 1) {
      const blob = await fetchBlob(
        gibsRegionUrl(layer.wmsLayer, parts[0].bounds, time, this.imageSize),
        { signal, retries: 1 }
      );
      const image = await createImageBitmap(blob);
      return { image, close: () => image.close() };
    }

    const widths = parts.map((part) =>
      Math.max(1, Math.round(this.imageSize.width * part.fraction))
    );
    widths[widths.length - 1] =
      this.imageSize.width -
      widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
    const bitmaps = await Promise.all(
      parts.map(async (part, index) => {
        const blob = await fetchBlob(
          gibsRegionUrl(layer.wmsLayer, part.bounds, time, {
            width: widths[index],
            height: this.imageSize.height,
          }),
          { signal, retries: 1 }
        );
        return createImageBitmap(blob);
      })
    );
    const canvas = document.createElement("canvas");
    canvas.width = this.imageSize.width;
    canvas.height = this.imageSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      for (const image of bitmaps) image.close();
      throw new Error("RoamingEye: 2d canvas context unavailable");
    }
    let x = 0;
    for (let i = 0; i < bitmaps.length; i++) {
      ctx.drawImage(bitmaps[i], x, 0, widths[i], this.imageSize.height);
      bitmaps[i].close();
      x += widths[i];
    }
    return { image: canvas, close: () => undefined };
  }
}

function lonInBoundsFrame(lon: number, bounds: Bounds): number {
  const center = (bounds.west + bounds.east) / 2;
  let framed = normalizeLon(lon);
  while (framed - center > 180) framed -= 360;
  while (framed - center < -180) framed += 360;
  return framed;
}

export function latLonToRegionPixel(
  lat: number,
  lon: number,
  bounds: Bounds,
  width: number,
  height: number
): { x: number; y: number } {
  const framedLon = lonInBoundsFrame(lon, bounds);
  const x = ((framedLon - bounds.west) / (bounds.east - bounds.west)) * width;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * height;
  return {
    x: Math.min(width - 2, Math.max(1, Math.floor(x))),
    y: Math.min(height - 2, Math.max(1, Math.floor(y))),
  };
}
