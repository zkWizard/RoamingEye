import { LAYERS, monthRangeForLayer } from "../lib/timeline";
import { geometryBounds, isAreaGeometry } from "../lib/geojson";
import {
  PLACE_OBSERVATION_NATIVE_UNITS,
  placeObservationProductFromSample,
  serializePlaceObservationExport,
  sstPlaceObservationFromSample,
  type PlaceObservationExportSample,
} from "../lib/placeObservationExport";
import { SCALE_CONVERSIONS, colormapUrl } from "../lib/colormap";
import { environmentUnavailableSample } from "../lib/environmentUnavailableSample";
import {
  PLACE_METRICS,
  PLACE_COLORMAP_DOCS,
  latestComparisonMonths,
  loadPlaceColormap,
  placeInsightPhysicalReading,
  placeInsightReading,
} from "../lib/placeInsights";
import { NDVI_MAX_INVERSION_DISTANCE } from "../lib/vegetationIndexNoData";
import { placeSnowCoverInsight } from "../lib/snowCoverNarrative";
import { PROBE_SCALES, scaleValue } from "../lib/probe";
import type { PlaceMetricLayerId } from "../lib/placeInsights";
import {
  MARINE_PLACE_METRIC,
  marineBoundarySstReading,
  unavailableMarineBoundarySstReading,
} from "../lib/marinePlaceInsight";
import { SST_MAX_INVERSION_DISTANCE } from "../lib/sstNoData";
import {
  aerosolBoundaryLoadingReading,
  unavailableAerosolBoundaryReading,
} from "../lib/aerosolPlaceInsight";
import {
  summarizePlaceMonthAlignment,
  type PlaceMonthCard,
} from "../lib/placeMonthAlignment";
import {
  describeMarineBoundarySstChange,
  formatMarineBoundarySstChange,
} from "../lib/marineBoundarySstChange";
import {
  climateInsightText,
  climateMetricForLayer,
  exportObservationsFromRenderedClimateSample,
  summarizeRenderedClimateSample,
} from "../lib/meteorology";
import { volcanoesInSearchExtent } from "../lib/volcanoExtent";
import {
  nearbyEarthquakeContext,
  searchExtentEarthquakeQuery,
} from "../lib/earthquakeContext";
import { parseEarthquakeFeed, USGS_FEED_URL } from "../lib/earthquakes";
import {
  NEAREST_VOLCANO_RADIUS_KM,
  nearbyVolcanoContext,
} from "../lib/volcanoProximityContext";
import { parseVolcanoDataset } from "../lib/volcanoes";
import { plateBoundariesInSearchExtent } from "../lib/plateBoundaryContext";
import { parsePlateBoundaries } from "../lib/plates";
import type { GeoResult } from "../lib/geocoding";
import { fetchJson, isAbortError } from "../lib/net";
import { ProbeSampler } from "../probe/ProbeSampler";
import { PlaceInsights } from "../ui/PlaceInsights";

/**
 * The place-insights subsystem: the panel UI, its dedicated sampler, and the
 * per-domain readings a resolved place search populates it with. Split out of
 * main.ts so the whole stack — UI, samplers, and the science modules behind
 * each card — loads as its own chunk on first search instead of riding the
 * boot bundle (the same treatment the providers/software/fleet panels got).
 */

/**
 * Narrow a place metric to the layers whose sample may enter the native-unit
 * observation export.
 *
 * Snow is deliberately excluded. GIBS renders it through a discrete NDSI
 * legend rather than one of the authoritative physical colormaps, so there is
 * no `PLACE_COLORMAP_DOCS` entry to cite as the value mapping and no native
 * unit to promise — the export would have to assert a provenance that does not
 * exist. That is the same rule `nativePlaceSampleValues` already applies to
 * display-ramp values; withholding the layer keeps the exported contract
 * honest instead of publishing a percentage under an invented mapping.
 */
function exportableLayerId(
  layerId: PlaceMetricLayerId
): Exclude<PlaceMetricLayerId, "snow"> | null {
  return layerId === "snow" ? null : layerId;
}

const placeInsightsEl = document.querySelector<HTMLElement>("#place-insights");

let placeInsightsAbort: AbortController | undefined;
const placeInsights = placeInsightsEl
  ? new PlaceInsights(placeInsightsEl, () => placeInsightsAbort?.abort())
  : undefined;
const placeSampler = new ProbeSampler({ width: 512, height: 512 }, 2);

export function runPlaceInsights(result: GeoResult): void {
  if (!placeInsights || !result.geometry || !isAreaGeometry(result.geometry)) {
    placeInsights?.close();
    return;
  }

  placeInsightsAbort?.abort();
  const abort = (placeInsightsAbort = new AbortController());
  const geometry = result.geometry;
  placeInsights.open(result.name);
  const exportSamples = new Map<string, PlaceObservationExportSample>();
  const samplingTasks: Promise<void>[] = [];
  // The month each card reads, collected as the cards are scheduled. The
  // products publish on different lags, so this is rarely one month.
  const monthCards: PlaceMonthCard[] = [];

  if (result.boundingBox) {
    void fetchJson<unknown>(`${import.meta.env.BASE_URL}data/volcanoes.json`, {
      signal: abort.signal,
    })
      .then(parseVolcanoDataset)
      .then((dataset) => {
        if (abort.signal.aborted) return;
        const extent = volcanoesInSearchExtent(
          dataset.volcanoes,
          result.boundingBox
        );
        // An empty bounding box is a boundary-size artefact, not evidence of
        // no volcanism nearby — fall back to a fixed, stated search radius.
        placeInsights.setVolcanoContext(
          extent,
          dataset.dataMonth,
          extent.matchedRecordCount === 0
            ? nearbyVolcanoContext(dataset.volcanoes, {
                latitude: result.lat,
                longitude: result.lon,
                radiusKm: NEAREST_VOLCANO_RADIUS_KM,
              })
            : null
        );
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || abort.signal.aborted) return;
        console.warn("RoamingEye: place volcano context failed to load", error);
        placeInsights.setVolcanoUnavailable();
      });
  } else {
    placeInsights.setVolcanoContext(volcanoesInSearchExtent([], null));
  }

  // Which Bird (2003) boundary polylines cross the same extent. The plate
  // overlay already reads this bundled file, so the panel reuses the identical
  // URL and parser rather than introducing a second view of the linework.
  if (result.boundingBox) {
    void fetchJson<unknown>(
      `${import.meta.env.BASE_URL}data/plate-boundaries.geojson`,
      { signal: abort.signal }
    )
      .then(parsePlateBoundaries)
      .then((boundaries) => {
        if (abort.signal.aborted) return;
        placeInsights.setPlateBoundaryContext(
          plateBoundariesInSearchExtent(boundaries, result.boundingBox)
        );
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || abort.signal.aborted) return;
        console.warn("RoamingEye: place plate context failed to load", error);
        placeInsights.setPlateBoundaryUnavailable();
      });
  } else {
    // No usable extent means nothing to intersect; report that directly rather
    // than spending a request on the bundled linework.
    placeInsights.setPlateBoundaryContext(
      plateBoundariesInSearchExtent([], null)
    );
  }

  // Live seismicity for the same extent. The overlay already reads this feed,
  // so the place panel reuses the identical URL and parser rather than
  // introducing a second, divergent view of USGS records.
  const seismicityQuery = searchExtentEarthquakeQuery(result.boundingBox);
  if (result.boundingBox) {
    void fetchJson<unknown>(USGS_FEED_URL, { signal: abort.signal })
      .then(parseEarthquakeFeed)
      .then((earthquakes) => {
        if (abort.signal.aborted) return;
        placeInsights.setSeismicityContext(
          nearbyEarthquakeContext(earthquakes, seismicityQuery)
        );
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || abort.signal.aborted) return;
        console.warn(
          "RoamingEye: place seismicity context failed to load",
          error
        );
        placeInsights.setSeismicityUnavailable();
      });
  } else {
    // No usable extent means no answerable radial query — report that directly
    // instead of spending a request on the shared USGS feed.
    placeInsights.setSeismicityContext(
      nearbyEarthquakeContext([], seismicityQuery)
    );
  }

  for (const metric of PLACE_METRICS) {
    const months = latestComparisonMonths(metric.layerId);
    if (!months) continue;
    monthCards.push({ label: metric.label, month: months[1] });
    const exportLayerId = exportableLayerId(metric.layerId);
    // Start with explicit no-data observations. A failed request or an
    // unavailable authoritative colormap must not be replaced with a
    // display-converted value labelled as a native-unit measurement. NDVI is
    // the exception: its 0..1 physical range is already its native unit.
    if (exportLayerId) {
      exportSamples.set(
        exportLayerId,
        environmentUnavailableSample(exportLayerId, months)
      );
    }
    samplingTasks.push(
      (async () => {
        const colormap = await loadPlaceColormap(metric.layerId);
        const sample = colormap
          ? placeSampler.sampleGeometryPhysical(
              LAYERS[metric.layerId],
              months,
              geometry,
              { lat: result.lat, lon: result.lon },
              colormap.entries,
              colormap.factor,
              {
                signal: abort.signal,
                // NDVI's ramp runs to near-black, close enough to the JPEG
                // black GIBS renders where it draws no index that the default
                // would average undrawn water, snow, and cloud into the
                // vegetation mean as 0.985 (lib/vegetationIndexNoData).
                maxInversionDistance:
                  metric.layerId === "ndvi"
                    ? NDVI_MAX_INVERSION_DISTANCE
                    : undefined,
              }
            )
          : placeSampler.sampleGeometry(
              LAYERS[metric.layerId],
              months,
              geometry,
              { lat: result.lat, lon: result.lon },
              { signal: abort.signal }
            );
        const {
          values,
          validFractions,
          sourceImageDimensions,
          geometrySampling,
          geometrySamplingStrategy,
        } = await sample;
        if (abort.signal.aborted) return;
        const climateMetricId = climateMetricForLayer(metric.layerId);
        const climateReading =
          colormap && climateMetricId
            ? summarizeRenderedClimateSample(
                {
                  metricId: climateMetricId,
                  months,
                  sampledValues: values,
                  nativeToSampledValueFactor: colormap.factor,
                  validFractions,
                  sourceImageDimensions,
                  geometrySamplingStrategy,
                },
                months[1]
              )
            : null;
        // Snow has no continuous GIBS ramp to decode against (its NDSI legend
        // is discrete, so `loadPlaceColormap` returns null and the shared
        // display-ramp path would apply here). That path is measured accurate
        // for this layer — 0.62 percentage points RMSE over all 100 published
        // colours, with every observation flag rejected outright
        // (lib/snowCoverRamp MEASURED_SNOW_COVER_INVERSION) — but it cannot
        // state the drawn-fraction bias that percent-0 transparency creates,
        // so the card is written by the snow narrative instead.
        const snowReading =
          metric.layerId === "snow"
            ? placeSnowCoverInsight(
                months,
                values.map((value) =>
                  value === null ? null : scaleValue(value, PROBE_SCALES.snow)
                ),
                months[1],
                { validFractions, sourceImageDimensions }
              )
            : null;
        placeInsights.setReading(
          snowReading
            ? { id: metric.id, ...snowReading }
            : climateReading
              ? {
                  id: metric.id,
                  ...climateInsightText(climateReading[0], climateReading[1]),
                }
              : colormap
                ? placeInsightPhysicalReading(metric, months, values, {
                    validFractions,
                    sourceImageDimensions,
                    geometrySamplingStrategy,
                  })
                : placeInsightReading(metric, months, values, {
                    validFractions,
                    sourceImageDimensions,
                    geometrySamplingStrategy,
                  })
        );
        if (colormap && exportLayerId) {
          exportSamples.set(exportLayerId, {
            layerId: exportLayerId,
            sampledUnit:
              SCALE_CONVERSIONS[exportLayerId as keyof typeof SCALE_CONVERSIONS]
                ?.unit ?? PLACE_OBSERVATION_NATIVE_UNITS[exportLayerId],
            sourceValueFactor: colormap?.factor ?? 1,
            colormapUrl: colormapUrl(PLACE_COLORMAP_DOCS[exportLayerId]),
            samplingSupport: geometrySampling,
            samplingStrategy: geometrySamplingStrategy,
            sourceImageDimensions,
            observations:
              colormap && climateMetricId
                ? exportObservationsFromRenderedClimateSample(
                    {
                      metricId: climateMetricId,
                      months,
                      sampledValues: values,
                      nativeToSampledValueFactor: colormap.factor,
                      validFractions,
                      sourceImageDimensions,
                      geometrySamplingStrategy,
                    },
                    months[1]
                  )
                : months.map((dataMonth, index) => {
                    const value = values[index] ?? null;
                    if (value === null) {
                      return {
                        dataMonth,
                        value,
                        unavailableReason:
                          (validFractions[index] ?? 0) > 0
                            ? ("insufficient-valid-coverage" as const)
                            : ("source-no-data" as const),
                        validFraction: validFractions[index],
                      };
                    }
                    return {
                      dataMonth,
                      value,
                      validFraction: validFractions[index],
                    };
                  }),
          });
        }
      })().catch((error: unknown) => {
        if (isAbortError(error) || abort.signal.aborted) return;
        console.warn("RoamingEye: place insight sampling failed", error);
        placeInsights.setReading({
          id: metric.id,
          value: "Unavailable",
          detail:
            "Boundary could not be represented by the bounded sample grid",
        });
      })
    );
  }

  // SST carries the latest observation plus, when the preceding month is also
  // usable, the month-over-month change every terrestrial place metric already
  // reports. Sample the exact searched geometry through NASA GIBS's published
  // physical colormap so the values remain in °C, with a tighter no-data
  // threshold: this ramp's coldest colour is close enough to the JPEG black
  // GIBS renders where the product holds no SST that the default would
  // average land and ice in as ~0.08 °C water (lib/sstNoData).
  const sstPairMonths =
    latestComparisonMonths("sst") ?? monthRangeForLayer(LAYERS.sst).slice(-1);
  const sstMonth = sstPairMonths[sstPairMonths.length - 1];
  // Also sample the same calendar month one year earlier, so the card can
  // report a like-for-like difference instead of the seasonal cycle. Only when
  // the layer actually publishes that month — a nearby month is never
  // substituted for it.
  const sstPriorYearMonth = monthRangeForLayer(LAYERS.sst).find(
    (ym) => ym.year === sstMonth.year - 1 && ym.month === sstMonth.month
  );
  const sstSampleMonths = sstPriorYearMonth
    ? [sstPriorYearMonth, ...sstPairMonths]
    : [...sstPairMonths];
  // Index where the consecutive pair (or lone latest month) begins.
  const sstPairStart = sstPriorYearMonth ? 1 : 0;
  const sstTarget = sstSampleMonths.length - 1;
  monthCards.push({ label: MARINE_PLACE_METRIC.label, month: sstMonth });
  // Say which of these cards are contemporaneous before any sampling resolves:
  // the months are fixed by the products' publication calendars, not by what
  // this place returns, so the reader is never left assuming one snapshot.
  placeInsights.setMonthAlignment(summarizePlaceMonthAlignment(monthCards));
  let sstFailureReason:
    "source-colormap-unavailable" | "boundary-sampling-failed" =
    "source-colormap-unavailable";
  exportSamples.set(
    "sst",
    environmentUnavailableSample("sst", sstSampleMonths)
  );
  samplingTasks.push(
    (async () => {
      const colormap = await loadPlaceColormap("sst");
      if (!colormap) {
        throw new Error("RoamingEye: SST physical colormap is unavailable");
      }
      sstFailureReason = "boundary-sampling-failed";
      const sample = await placeSampler.sampleGeometryPhysical(
        LAYERS.sst,
        sstSampleMonths,
        geometry,
        { lat: result.lat, lon: result.lon },
        colormap.entries,
        colormap.factor,
        {
          signal: abort.signal,
          maxInversionDistance: SST_MAX_INVERSION_DISTANCE,
        }
      );
      if (abort.signal.aborted) return;
      const sstReadings = sstSampleMonths.slice(sstPairStart).map((month, i) =>
        marineBoundarySstReading({
          geographyLabel: result.name,
          dataMonth: month,
          observedValue: sample.values[sstPairStart + i],
          validFraction: sample.validFractions[sstPairStart + i],
          sourceImageDimensions: sample.sourceImageDimensions,
          geography: { kind: "boundary", label: result.name },
          // The year-over-year comparison belongs to the latest month only —
          // the preceding month is eleven months from the prior-year sample.
          priorYear:
            sstPairStart + i === sstTarget && sstPriorYearMonth
              ? {
                  dataMonth: sstPriorYearMonth,
                  observedValue: sample.values[0],
                  validFraction: sample.validFractions[0],
                }
              : undefined,
          // Extent of the searched boundary, so the reading can bound how many
          // native ~9 km source cells stand behind its "boundary-mean".
          bounds: geometryBounds(geometry),
        })
      );
      const latestSst = sstReadings[sstReadings.length - 1];
      // Only explain the change once the latest month is itself a reading; an
      // unusable latest month already says so and needs no second negative.
      const sstChange =
        sstReadings.length > 1 && latestSst.availability === "available"
          ? describeMarineBoundarySstChange(sstReadings[0], latestSst)
          : null;
      placeInsights.setReading(
        sstChange
          ? {
              ...latestSst,
              detail: `${latestSst.detail}; ${formatMarineBoundarySstChange(sstChange)}`,
            }
          : latestSst
      );
      exportSamples.set("sst", {
        layerId: "sst",
        sourceValueFactor: colormap.factor,
        samplingStrategy: sample.geometrySamplingStrategy,
        sourceImageDimensions: sample.sourceImageDimensions,
        colormapUrl: colormapUrl(PLACE_COLORMAP_DOCS.sst),
        // Every sampled month is exported, so both differences shown on the
        // card can be recomputed from the record rather than trusted.
        observations: sstSampleMonths.map((dataMonth, index) =>
          sstPlaceObservationFromSample(
            dataMonth,
            sample.values[index],
            sample.validFractions[index]
          )
        ),
      });
    })().catch((error: unknown) => {
      if (isAbortError(error) || abort.signal.aborted) return;
      console.warn("RoamingEye: marine place insight sampling failed", error);
      placeInsights.setReading(
        unavailableMarineBoundarySstReading(
          sstMonth,
          {
            kind: "boundary",
            label: result.name,
          },
          sstFailureReason
        )
      );
    })
  );

  // Column aerosol optical depth gets its own card and formatter. It is
  // neither a terrestrial surface metric nor a marine one: MERRA-2 AOD is a
  // modelled, whole-column optical property, so the reading must carry limits
  // ("not surface air quality, not a health index") that the surface
  // formatters do not state.
  const aerosolMonths = latestComparisonMonths("aerosol");
  if (aerosolMonths) {
    exportSamples.set(
      "aerosol",
      environmentUnavailableSample("aerosol", aerosolMonths)
    );
    samplingTasks.push(
      (async () => {
        const colormap = await loadPlaceColormap("aerosol");
        if (!colormap) {
          throw new Error(
            "RoamingEye: aerosol physical colormap is unavailable"
          );
        }
        const sample = await placeSampler.sampleGeometryPhysical(
          LAYERS.aerosol,
          aerosolMonths,
          geometry,
          { lat: result.lat, lon: result.lon },
          colormap.entries,
          colormap.factor,
          { signal: abort.signal }
        );
        if (abort.signal.aborted) return;
        placeInsights.setReading(
          aerosolBoundaryLoadingReading({
            months: aerosolMonths,
            observedValues: [sample.values[0], sample.values[1]],
            validFractions: [
              sample.validFractions[0],
              sample.validFractions[1],
            ],
            sourceImageDimensions: sample.sourceImageDimensions,
          })
        );
        exportSamples.set("aerosol", {
          layerId: "aerosol",
          sourceValueFactor: colormap.factor,
          samplingStrategy: sample.geometrySamplingStrategy,
          sourceImageDimensions: sample.sourceImageDimensions,
          colormapUrl: colormapUrl(PLACE_COLORMAP_DOCS.aerosol),
          observations: aerosolMonths.map((dataMonth, index) => ({
            dataMonth,
            value: sample.values[index] ?? null,
            validFraction: sample.validFractions[index],
          })),
        });
      })().catch((error: unknown) => {
        if (isAbortError(error) || abort.signal.aborted) return;
        console.warn(
          "RoamingEye: aerosol place insight sampling failed",
          error
        );
        placeInsights.setReading(
          unavailableAerosolBoundaryReading(aerosolMonths[1])
        );
      })
    );
  }

  void Promise.all(samplingTasks)
    .then(() => {
      if (abort.signal.aborted) return;
      const products = [...exportSamples.values()].map(
        placeObservationProductFromSample
      );
      if (products.length === 0) return;
      placeInsights.setObservationExport(
        serializePlaceObservationExport({
          boundary: geometry,
          products,
          method: {
            sampling: "area-weighted-grid-mean",
            imageWidth: 512,
            imageHeight: 512,
          },
          generatedIso: new Date().toISOString(),
          toolVersion: __APP_VERSION__,
        })
      );
    })
    .catch((error: unknown) => {
      // Export validation throws on contract violations (unexplained nulls,
      // invalid footprints). Losing the export beats an unhandled rejection
      // that would silently strand the whole insights panel.
      if (isAbortError(error) || abort.signal.aborted) return;
      console.warn("RoamingEye: place observation export failed", error);
    });
}
