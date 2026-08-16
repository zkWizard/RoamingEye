import { describe, expect, it } from "vitest";
import { LAYERS } from "./timeline";
import { MEASURED_INVERSION } from "./validation";
import { AEROSOL_RAMP_CEILING } from "./aerosolPlaceInsight";
import {
  GIBS_IMAGERY_SOURCE,
  PLACE_OBSERVATION_NATIVE_UNITS,
  PLACE_OBSERVATION_GEOGRAPHY,
  aerosolPlaceObservationFromSample,
  createPlaceObservationExport,
  placeObservationProductFromSample,
  serializePlaceObservationExport,
  sstPlaceObservationFromSample,
} from "./placeObservationExport";
import {
  classifyModality,
  describeModality,
  MODALITY_LIMITS,
} from "./observationModality";
import { summarizeSstObservingConstraints } from "./sstObservingConstraints";

const PRECIP_COLORMAP_URL =
  "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GLDAS_Surface_Total_Precipitation_Rate_Monthly.xml";
const SOIL_COLORMAP_URL =
  "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GLDAS_Soil_Moisture_0_10_cm_Monthly.xml";

/** The base fixture already carries a precipitation product; these cases supply
 * their own, so they drop it rather than trip the duplicate-layer rule. */
const nonPrecipProducts = () =>
  input.products.filter((product) => product.layerId !== "precip");

const boundary = {
  type: "Polygon",
  coordinates: [
    [
      [-77.1, 38.8],
      [-76.9, 38.8],
      [-76.9, 39.0],
      [-77.1, 39.0],
      [-77.1, 38.8],
    ],
  ],
};

const input = {
  boundary,
  products: [
    {
      layerId: "ndvi" as const,
      wmsLayer: LAYERS.ndvi.wmsLayer,
      source: LAYERS.ndvi.dataset!,
      nativeUnit: "NDVI",
      valueMapping: {
        status: "gibs-colormap" as const,
        url: "https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_L3_NDVI.xml",
      },
      samplingSupport: {
        gridSize: 28,
        candidatePointCount: 784,
        interiorPointCount: 620,
        retainedPointCount: 512,
        sourcePixelCount: 488,
        pointLimitApplied: true,
      },
      sampleToNative: {
        sampledUnit: "NDVI",
        operation: "divide" as const,
        factor: 1,
      },
      samplingStrategy: "boundary-grid" as const,
      sourceImageDimensions: { width: 768, height: 384 },
      observations: [
        {
          dataMonth: { year: 2026, month: 4 },
          value: 0.62,
          validFraction: 0.82,
        },
        {
          dataMonth: { year: 2026, month: 5 },
          value: null,
          unavailableReason: "source-no-data" as const,
        },
      ],
    },
    {
      layerId: "precip" as const,
      wmsLayer: LAYERS.precip.wmsLayer,
      source: LAYERS.precip.dataset!,
      nativeUnit: PLACE_OBSERVATION_NATIVE_UNITS.precip,
      valueMapping: {
        status: "gibs-colormap" as const,
        url: "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GLDAS_Surface_Total_Precipitation_Rate_Monthly.xml",
      },
      sampleToNative: {
        sampledUnit: "mm/day",
        operation: "divide" as const,
        factor: 86_400,
      },
      samplingStrategy: "boundary-point" as const,
      sourceImageDimensions: { width: 1024, height: 512 },
      observations: [
        {
          dataMonth: { year: 2026, month: 4 },
          value: 0.00014,
          validFraction: 0.61,
        },
      ],
    },
  ],
  method: {
    sampling: "area-weighted-grid-mean" as const,
    imageWidth: 1024,
    imageHeight: 512,
  },
  generatedIso: "2026-07-13T06:00:00Z",
  toolVersion: "1.1.0",
};

describe("place observation export", () => {
  it("preserves distinct unavailable states for completed SST sampling", () => {
    const dataMonth = { year: 2026, month: 5 };

    expect(sstPlaceObservationFromSample(dataMonth, null, 0)).toEqual({
      dataMonth,
      value: null,
      validFraction: 0,
      unavailableReason: "source-no-data",
    });
    expect(sstPlaceObservationFromSample(dataMonth, null, 0.18)).toEqual({
      dataMonth,
      value: null,
      validFraction: 0.18,
      unavailableReason: "insufficient-valid-coverage",
    });
    expect(sstPlaceObservationFromSample(dataMonth, 18.375, 0.37)).toEqual({
      dataMonth,
      value: 18.375,
      validFraction: 0.37,
    });
  });

  it("records a column-AOD month on the open top bin as a lower bound", () => {
    const dataMonth = { year: 2026, month: 5 };

    // Pinned so a PROBE_SCALES or LUT edit that moved the decode ceiling would
    // be caught here rather than silently re-scoping which months are
    // censored. It sits one quantization step below the ramp's open 0.9 edge,
    // which the inversion can therefore never reach.
    expect(AEROSOL_RAMP_CEILING).toBeCloseTo(0.9 - 0.9 / 255, 9);
    expect(AEROSOL_RAMP_CEILING).toBeLessThan(0.9);

    expect(
      aerosolPlaceObservationFromSample(dataMonth, AEROSOL_RAMP_CEILING, 0.94)
    ).toEqual({
      dataMonth,
      value: AEROSOL_RAMP_CEILING,
      validFraction: 0.94,
      valueBound: "at-or-above",
    });
  });

  it("leaves a resolved column-AOD month unqualified", () => {
    const dataMonth = { year: 2026, month: 5 };

    // One quantization step below the ceiling is an ordinary two-sided
    // reading; qualifying it would put doubt in the file the ramp cannot
    // justify. The ramp's low end is closed at 0, so nothing bounds from below.
    expect(aerosolPlaceObservationFromSample(dataMonth, 0.895, 0.94)).toEqual({
      dataMonth,
      value: 0.895,
      validFraction: 0.94,
    });
    expect(aerosolPlaceObservationFromSample(dataMonth, 0, 0.94)).toEqual({
      dataMonth,
      value: 0,
      validFraction: 0.94,
    });
  });

  it("never bounds a column-AOD month that carries no value", () => {
    const dataMonth = { year: 2026, month: 5 };

    // A month with nothing to read is unassessed, not censored — the contract
    // rejects a bound on a null value outright.
    expect(aerosolPlaceObservationFromSample(dataMonth, null, 0.1)).toEqual({
      dataMonth,
      value: null,
      validFraction: 0.1,
    });
  });

  it("carries the column-AOD bound through to the serialized record", () => {
    const record = JSON.parse(
      serializePlaceObservationExport({
        ...input,
        products: [
          {
            layerId: "aerosol" as const,
            wmsLayer: LAYERS.aerosol.wmsLayer,
            nativeUnit: PLACE_OBSERVATION_NATIVE_UNITS.aerosol,
            source: LAYERS.aerosol.dataset!,
            samplingStrategy: "boundary-grid" as const,
            sourceImageDimensions: { width: 512, height: 512 },
            observations: [
              aerosolPlaceObservationFromSample(
                { year: 2026, month: 4 },
                0.41,
                0.9
              ),
              aerosolPlaceObservationFromSample(
                { year: 2026, month: 5 },
                AEROSOL_RAMP_CEILING,
                0.9
              ),
            ],
          },
          ...nonPrecipProducts(),
        ],
      })
    );
    const aerosol = record.products.find(
      (product: { layerId: string }) => product.layerId === "aerosol"
    );

    // The downloaded file is the surface that outlives the panel: a plume
    // month must leave the app reading as a bound, exactly as the card states.
    expect(aerosol.observations[0].valueBound).toBeNull();
    expect(aerosol.observations[1].valueBound).toBe("at-or-above");
    expect(aerosol.observations[1].value).toBeCloseTo(AEROSOL_RAMP_CEILING, 6);
  });

  it("records an SST value in a terminal ramp bin as a bound, not a measurement", () => {
    const dataMonth = { year: 2026, month: 5 };

    // NASA's published SST ramp ends in two open caps, so a boundary mean in
    // the lowest finite bin cannot be told from one the cold cap collapsed —
    // a censored cold pixel always decodes warmer than it is, so the truth
    // sits at or below the recorded number. The card renders this "≤ 0.1 °C".
    expect(sstPlaceObservationFromSample(dataMonth, 0.075, 0.42)).toEqual({
      dataMonth,
      value: 0.075,
      validFraction: 0.42,
      valueBound: "at-or-below",
    });
    // The warm cap censors the other way, in the tropical warm pool.
    expect(sstPlaceObservationFromSample(dataMonth, 31.9, 0.42)).toEqual({
      dataMonth,
      value: 31.9,
      validFraction: 0.42,
      valueBound: "at-or-above",
    });
    // An interior value is returned unqualified: the record never carries
    // doubt the published ramp does not justify.
    expect(
      sstPlaceObservationFromSample(dataMonth, 18.4, 0.42)
    ).not.toHaveProperty("valueBound");
  });

  it("carries the SST bound into the serialized record and states how to read it", () => {
    const sst = placeObservationProductFromSample({
      layerId: "sst",
      sourceValueFactor: 1,
      samplingStrategy: "boundary-grid",
      sourceImageDimensions: { width: 512, height: 256 },
      observations: [
        sstPlaceObservationFromSample({ year: 2026, month: 4 }, 31.9, 0.42),
        sstPlaceObservationFromSample({ year: 2026, month: 5 }, 18.4, 0.37),
      ],
    });

    const exported = createPlaceObservationExport({
      ...input,
      products: [sst],
    });

    expect(
      exported.products[0].observations.map((observation) => [
        observation.dataMonth,
        observation.value,
        observation.valueBound,
      ])
    ).toEqual([
      ["2026-04", 31.9, "at-or-above"],
      // Assessed and found unbounded — null here is "not assessed for a
      // bound", and the limitations line says so rather than leaving a
      // consumer to read it as "known to be resolved".
      ["2026-05", 18.4, null],
    ]);
    expect(exported.limitations).toContain(
      "An observation's valueBound marks that value as a bound the rendered ramp could not resolve past, never as a measurement; a null bound records that this observation was not assessed for one, which is not evidence its value was resolved."
    );
  });

  it("rejects a bound that names no value or an unsupported side", () => {
    const month = { year: 2026, month: 5 };

    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            observations: [
              {
                dataMonth: month,
                value: null,
                validFraction: 0,
                unavailableReason: "source-no-data",
                valueBound: "at-or-below",
              },
            ],
          },
        ],
      })
    ).toThrow(/cannot bound an unavailable value/);

    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            observations: [
              {
                dataMonth: month,
                value: 4.2,
                validFraction: 0.5,
                valueBound: "roughly" as never,
              },
            ],
          },
        ],
      })
    ).toThrow(/unsupported value bound/);
  });

  it("serializes unavailable SST without dropping the place export", () => {
    const sst = placeObservationProductFromSample({
      layerId: "sst",
      observations: [
        sstPlaceObservationFromSample({ year: 2026, month: 5 }, null, 0.18),
      ],
    });

    const exported = createPlaceObservationExport({
      ...input,
      products: [sst],
    });

    expect(exported.products[0].observations).toEqual([
      {
        dataMonth: "2026-05",
        value: null,
        validFraction: 0.18,
        unavailableReason: "insufficient-valid-coverage",
        coverageStatus: "fraction-recorded",
        valueBound: null,
      },
    ]);
    expect(exported.reproducibility.dataMonthMatrix).toEqual([
      {
        dataMonth: "2026-05",
        layers: [{ layerId: "sst", recordStatus: "no-data-recorded" }],
      },
    ]);
  });
  it("keeps the whole export when a sampled aerosol month is too thin to average", () => {
    // Shaped exactly as placeInsightsController builds an aerosol sample: the
    // sampler records the coverage share it saw but states no reason, because
    // the reason is a reading of that share. The earlier month cleared zero
    // coverage without clearing the mean's admission threshold.
    const aerosol = placeObservationProductFromSample({
      layerId: "aerosol",
      sourceValueFactor: 1,
      samplingStrategy: "boundary-grid",
      sourceImageDimensions: { width: 512, height: 512 },
      observations: [
        {
          dataMonth: { year: 2026, month: 5 },
          value: null,
          validFraction: 0.12,
        },
        {
          dataMonth: { year: 2026, month: 6 },
          value: 0.23,
          validFraction: 0.98,
        },
      ],
    });

    expect(aerosol.observations[0]).toEqual({
      dataMonth: { year: 2026, month: 5 },
      value: null,
      validFraction: 0.12,
      unavailableReason: "insufficient-valid-coverage",
    });
    // A recorded value never gains a reason.
    expect(aerosol.observations[1]).not.toHaveProperty("unavailableReason");

    // The point of the derivation: the unexplained-null rule is enforced during
    // serialization, so one reasonless month used to discard every product.
    const exported = createPlaceObservationExport({
      ...input,
      products: [...input.products, aerosol],
    });
    expect(exported.products.map((product) => product.layerId)).toEqual([
      "aerosol",
      "ndvi",
      "precip",
    ]);
  });

  it("reads zero recorded coverage as the source having published nothing", () => {
    const lst = placeObservationProductFromSample({
      layerId: "lst",
      sourceValueFactor: 1,
      samplingStrategy: "boundary-grid",
      observations: [
        { dataMonth: { year: 2026, month: 5 }, value: null, validFraction: 0 },
      ],
    });

    expect(lst.observations[0]).toEqual({
      dataMonth: { year: 2026, month: 5 },
      value: null,
      validFraction: 0,
      unavailableReason: "source-no-data",
    });
  });

  it("never overrides a reason the sample builder stated itself", () => {
    // A builder that knows sampling failed says so; positive coverage must not
    // downgrade that to a coverage shortfall.
    const product = placeObservationProductFromSample({
      layerId: "aerosol",
      sourceValueFactor: 1,
      samplingStrategy: "boundary-grid",
      observations: [
        {
          dataMonth: { year: 2026, month: 5 },
          value: null,
          validFraction: 0.4,
          unavailableReason: "sampling-failed",
        },
      ],
    });

    expect(product.observations[0].unavailableReason).toBe("sampling-failed");
  });

  it("still rejects a null month with no coverage evidence to read", () => {
    // No recorded share means no basis for either reason; inventing
    // "source-no-data" would blame the source without evidence, so the
    // unexplained-null rule is left to fire.
    const product = placeObservationProductFromSample({
      layerId: "aerosol",
      sourceValueFactor: 1,
      observations: [{ dataMonth: { year: 2026, month: 5 }, value: null }],
    });

    expect(product.observations[0]).not.toHaveProperty("unavailableReason");
    expect(() =>
      createPlaceObservationExport({ ...input, products: [product] })
    ).toThrow("Product aerosol must explain an unavailable value.");
  });

  it("exports boundary SST in native °C with MODIS provenance and coverage", () => {
    const product = placeObservationProductFromSample({
      layerId: "sst",
      sourceValueFactor: 1,
      samplingStrategy: "boundary-grid",
      sourceImageDimensions: { width: 512, height: 256 },
      observations: [
        {
          dataMonth: { year: 2026, month: 5 },
          value: 18.375,
          validFraction: 0.37,
        },
      ],
    });

    expect(product).toMatchObject({
      layerId: "sst",
      wmsLayer: "MODIS_Aqua_L3_SST_Thermal_9km_Day_Monthly",
      nativeUnit: "°C",
      source: {
        shortName: "MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0",
        version: "2019.0",
      },
      observations: [
        {
          dataMonth: { year: 2026, month: 5 },
          value: 18.375,
          validFraction: 0.37,
        },
      ],
    });
  });
  it("retains boundary, cited products, native units, months, coverage, and method", () => {
    const exported = createPlaceObservationExport(input);

    expect(exported).toMatchObject({
      schema: "roamingeye-place-observation-export/v10",
      kind: "place-observation-export",
      boundary,
      geography: PLACE_OBSERVATION_GEOGRAPHY,
      products: [
        {
          layerId: "ndvi",
          wmsLayer: LAYERS.ndvi.wmsLayer,
          source: LAYERS.ndvi.dataset,
          nativeUnit: "NDVI",
          valueMapping: {
            status: "gibs-colormap",
            url: "https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_L3_NDVI.xml",
          },
          samplingSupport: {
            gridSize: 28,
            candidatePointCount: 784,
            interiorPointCount: 620,
            retainedPointCount: 512,
            sourcePixelCount: 488,
            pointLimitApplied: true,
          },
          sampleToNative: {
            sampledUnit: "NDVI",
            operation: "divide",
            factor: 1,
          },
          samplingStrategy: "boundary-grid",
          observations: [
            {
              dataMonth: "2026-04",
              value: 0.62,
              validFraction: 0.82,
              unavailableReason: null,
              coverageStatus: "fraction-recorded",
              valueBound: null,
            },
            {
              dataMonth: "2026-05",
              value: null,
              validFraction: null,
              unavailableReason: "source-no-data",
              coverageStatus: "not-supplied",
              valueBound: null,
            },
          ],
        },
        {
          layerId: "precip",
          source: LAYERS.precip.dataset,
          nativeUnit: PLACE_OBSERVATION_NATIVE_UNITS.precip,
          valueMapping: {
            status: "gibs-colormap",
            url: "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GLDAS_Surface_Total_Precipitation_Rate_Monthly.xml",
          },
          samplingSupport: null,
          sampleToNative: {
            sampledUnit: "mm/day",
            operation: "divide",
            factor: 86_400,
          },
          samplingStrategy: "boundary-point",
          observations: [
            {
              dataMonth: "2026-04",
              value: 0.00014,
              validFraction: 0.61,
              unavailableReason: null,
              coverageStatus: "fraction-recorded",
              valueBound: null,
            },
          ],
        },
      ],
      method: {
        sampling: "area-weighted-grid-mean",
        imagery: GIBS_IMAGERY_SOURCE,
        sourceImage: { width: 1024, height: 512 },
        valueMethod: "approximate-colormap-inversion",
      },
      generated: {
        iso: "2026-07-13T06:00:00Z",
        tool: "RoamingEye",
        version: "1.1.0",
      },
      reproducibility: {
        canonicalOrder: {
          products: "layer-id-ascending",
          observations: "data-month-ascending",
        },
        geography: {
          geometryType: "Polygon",
          coordinateReferenceSystem: "OGC:CRS84",
          axisOrder: ["longitude", "latitude"],
          bounds: {
            west: -77.1,
            south: 38.8,
            east: -76.9,
            north: 39,
          },
          crossesAntimeridian: false,
        },
        dataMonthMatrix: [
          {
            dataMonth: "2026-04",
            layers: [
              { layerId: "ndvi", recordStatus: "value-recorded" },
              { layerId: "precip", recordStatus: "value-recorded" },
            ],
          },
          {
            dataMonth: "2026-05",
            layers: [
              { layerId: "ndvi", recordStatus: "no-data-recorded" },
              { layerId: "precip", recordStatus: "not-recorded" },
            ],
          },
        ],
      },
    });
    expect(exported.limitations.join(" ")).toMatch(
      /not infer conditions, causes, risks, or future values/i
    );
    expect(exported.limitations.join(" ")).toMatch(
      /do not make values across products interchangeable/i
    );
    expect(exported.limitations.join(" ")).toMatch(
      /coverage status describes the sampling result/i
    );
  });

  it("distinguishes unavailable coverage from an observed zero-valid sample", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [
        {
          ...input.products[0],
          observations: [
            {
              dataMonth: { year: 2026, month: 4 },
              value: null,
              validFraction: 0,
              unavailableReason: "source-no-data",
            },
            {
              dataMonth: { year: 2026, month: 5 },
              value: null,
              unavailableReason: "source-no-data",
            },
          ],
        },
      ],
    });

    expect(exported.products[0].observations).toEqual([
      {
        dataMonth: "2026-04",
        value: null,
        validFraction: 0,
        unavailableReason: "source-no-data",
        coverageStatus: "no-valid-samples",
        valueBound: null,
      },
      {
        dataMonth: "2026-05",
        value: null,
        validFraction: null,
        unavailableReason: "source-no-data",
        coverageStatus: "not-supplied",
        valueBound: null,
      },
    ]);
    expect(exported.reproducibility.dataMonthMatrix).toEqual([
      {
        dataMonth: "2026-04",
        layers: [{ layerId: "ndvi", recordStatus: "no-data-recorded" }],
      },
      {
        dataMonth: "2026-05",
        layers: [{ layerId: "ndvi", recordStatus: "no-data-recorded" }],
      },
    ]);
  });

  it("preserves a dateline-crossing footprint as a short-arc envelope", () => {
    const exported = createPlaceObservationExport({
      ...input,
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [179, -10],
            [-179, -10],
            [-179, 10],
            [179, 10],
            [179, -10],
          ],
        ],
      },
    });

    expect(exported.reproducibility.geography).toEqual({
      geometryType: "Polygon",
      coordinateReferenceSystem: "OGC:CRS84",
      axisOrder: ["longitude", "latitude"],
      bounds: { west: 179, south: -10, east: -179, north: 10 },
      crossesAntimeridian: true,
    });
  });

  it("uses a whitelist-only contract with no personal-data or hidden-telemetry fields", () => {
    const exported = createPlaceObservationExport(input);
    expect(Object.keys(exported).sort()).toEqual([
      "boundary",
      "generated",
      "geography",
      "kind",
      "limitations",
      "method",
      "privacy",
      "products",
      "reproducibility",
      "schema",
    ]);
    expect(exported.privacy).toEqual({
      includesPersonalData: false,
      includesHiddenTelemetry: false,
      excludedFields: [
        "place-name",
        "search-query",
        "account-id",
        "session-id",
        "device-id",
      ],
    });
    const dataBearingExport = Object.fromEntries(
      Object.entries(exported).filter(([key]) => key !== "privacy")
    );
    expect(JSON.stringify(dataBearingExport)).not.toMatch(
      /account|session|device|search-query/i
    );
  });

  it("declares boundary CRS, axis order, and requested-footprint semantics", () => {
    const exported = createPlaceObservationExport(input);

    expect(exported.geography).toEqual({
      coordinateReferenceSystem: "OGC:CRS84",
      coordinateOrder: "longitude-latitude",
      boundaryRole: "requested-sampling-footprint",
    });
    expect(exported.boundary).toEqual(boundary);
    expect(exported.limitations.join(" ")).toMatch(
      /boundary is the requested sampling footprint.*validFraction records usable sampled coverage/i
    );
  });

  it("canonicalizes equivalent product and month order for reproducible JSON", () => {
    const json = serializePlaceObservationExport(input);
    expect(JSON.parse(json)).toEqual(createPlaceObservationExport(input));
    expect(json).toContain('"dataMonth": "2026-04"');

    const reordered = {
      ...input,
      products: input.products
        .map((product) => ({
          ...product,
          observations: [...product.observations].reverse(),
        }))
        .reverse(),
    };

    expect(serializePlaceObservationExport(reordered)).toBe(json);

    const citationWithDifferentInsertionOrder = {
      ...input,
      products: input.products.map((product) => ({
        ...product,
        source: {
          title: product.source.title,
          doi: product.source.doi,
          version: product.source.version,
          shortName: product.source.shortName,
        },
      })),
    };

    expect(
      serializePlaceObservationExport(citationWithDifferentInsertionOrder)
    ).toBe(json);
  });

  it("detaches static provenance metadata from previously created exports", () => {
    const first = createPlaceObservationExport(input);
    const expected = serializePlaceObservationExport(input);

    // Export objects cross an application boundary and may be handed to
    // consumers that do not preserve readonly TypeScript types. Mutating one
    // result must not rewrite the module-level provenance used by later runs.
    (first.method.imagery as { name: string; url: string }).name =
      "mutated imagery source";
    (first.privacy.excludedFields as unknown as string[])[0] =
      "mutated excluded field";
    (first.limitations as unknown as string[])[0] = "mutated limitation";

    expect(serializePlaceObservationExport(input)).toBe(expected);
  });

  it("rejects ambiguous or invalid reproducibility metadata", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            observations: [
              { dataMonth: { year: 2026, month: 4 }, value: null },
            ],
          },
        ],
      })
    ).toThrow("Product ndvi must explain an unavailable value.");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            observations: [
              {
                dataMonth: { year: 2026, month: 4 },
                value: 0.1,
                unavailableReason: "sampling-failed" as const,
              },
            ],
          },
        ],
      })
    ).toThrow("Product ndvi cannot mark a recorded value unavailable.");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          ...input.products,
          {
            ...input.products[0],
            observations: input.products[0].observations,
          },
        ],
      })
    ).toThrow("Duplicate product layer: ndvi.");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        method: { ...input.method, imageWidth: 0 },
      })
    ).toThrow("Source image dimensions must be positive integers.");
    for (const generatedIso of [
      "2026-07-13T06:00:00",
      "2026-02-30T06:00:00Z",
      "2026-07-13T24:00:00Z",
      "2026-07-13T06:00:00+24:00",
    ]) {
      expect(() =>
        createPlaceObservationExport({ ...input, generatedIso })
      ).toThrow(
        "generatedIso must be a calendar-valid ISO 8601 timestamp with a timezone."
      );
    }
    expect(
      createPlaceObservationExport({
        ...input,
        generatedIso: "2026-07-13T06:00:00.125-07:00",
      }).generated.iso
    ).toBe("2026-07-13T06:00:00.125-07:00");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        generatedIso: "2026-04-30T23:30:00-07:00",
        products: [
          {
            ...input.products[0],
            observations: [{ dataMonth: { year: 2026, month: 5 }, value: 0.1 }],
          },
        ],
      })
    ).toThrow(
      "Product ndvi has data month 2026-05 after export generation month 2026-04."
    );
    expect(
      createPlaceObservationExport({
        ...input,
        generatedIso: "2026-05-01T00:30:00+14:00",
        products: [
          {
            ...input.products[0],
            observations: [{ dataMonth: { year: 2026, month: 5 }, value: 0.1 }],
          },
        ],
      }).products[0].observations[0].dataMonth
    ).toBe("2026-05");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            observations: [
              { dataMonth: { year: 2026, month: 4 }, value: 0.1 },
              { dataMonth: { year: 2026, month: 4 }, value: 0.2 },
            ],
          },
        ],
      })
    ).toThrow("Product ndvi has duplicate month 2026-04.");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            observations: [
              {
                dataMonth: { year: 2026, month: 4 },
                value: 0.1,
                validFraction: 0,
              },
            ],
          },
        ],
      })
    ).toThrow("Product ndvi has a value with zero sampled coverage.");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            observations: [{ dataMonth: { year: 26, month: 4 }, value: 0.1 }],
          },
        ],
      })
    ).toThrow("Product ndvi has an invalid data month.");
  });

  it("rejects product identifiers paired with different source provenance", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            wmsLayer: LAYERS.precip.wmsLayer,
          },
        ],
      })
    ).toThrow(
      "Product ndvi WMS layer does not match the configured RoamingEye data product."
    );

    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            source: LAYERS.precip.dataset!,
          },
        ],
      })
    ).toThrow(
      "Product ndvi citation does not match the configured RoamingEye data product."
    );
  });

  it.each([
    "source-no-data",
    "insufficient-valid-coverage",
    "sampling-failed",
  ] as const)("preserves the supported unavailable state %s", (reason) => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [
        {
          ...input.products[0],
          observations: [
            {
              dataMonth: { year: 2026, month: 4 },
              value: null,
              unavailableReason: reason,
            },
          ],
        },
      ],
    });

    expect(exported.products[0].observations[0]).toMatchObject({
      value: null,
      unavailableReason: reason,
    });
  });

  it("rejects unsupported unavailable states from untyped export inputs", () => {
    const untypedInput = {
      ...input,
      products: [
        {
          ...input.products[0],
          observations: [
            {
              dataMonth: { year: 2026, month: 4 },
              value: null,
              unavailableReason: "low-confidence",
            },
          ],
        },
      ],
    };

    expect(() =>
      createPlaceObservationExport(
        untypedInput as unknown as Parameters<
          typeof createPlaceObservationExport
        >[0]
      )
    ).toThrow("Product ndvi has an unsupported unavailable reason.");
  });

  it.each([
    {
      label: "an open ring",
      coordinates: [
        [
          [-77.1, 38.8],
          [-76.9, 38.8],
          [-76.9, 39],
          [-77.1, 39],
        ],
      ],
    },
    {
      label: "an out-of-range longitude",
      coordinates: [
        [
          [181, 38.8],
          [-76.9, 38.8],
          [-76.9, 39],
          [181, 38.8],
        ],
      ],
    },
    {
      label: "a non-finite latitude",
      coordinates: [
        [
          [-77.1, 38.8],
          [-76.9, 38.8],
          [-76.9, Infinity],
          [-77.1, 38.8],
        ],
      ],
    },
    {
      label: "a zero-extent ring",
      coordinates: [
        [
          [-77.1, 38.8],
          [-77, 38.9],
          [-76.9, 39],
          [-77.1, 38.8],
        ],
      ],
    },
  ])(
    "rejects $label instead of exporting an irreproducible footprint",
    ({ coordinates }) => {
      expect(() =>
        createPlaceObservationExport({
          ...input,
          boundary: { type: "Polygon", coordinates },
        })
      ).toThrow(/closed GeoJSON rings.*non-zero area extent/);
    }
  );

  it("validates every polygon and hole in a MultiPolygon footprint", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        boundary: {
          type: "MultiPolygon",
          coordinates: [
            boundary.coordinates,
            [
              [
                [-123, 47],
                [-122, 47],
                [-122, 48],
                [-123, 48],
              ],
            ],
          ],
        },
      })
    ).toThrow(/closed GeoJSON rings/);

    const withClosedHole = createPlaceObservationExport({
      ...input,
      boundary: {
        type: "Polygon",
        coordinates: [
          boundary.coordinates[0],
          [
            [-77.05, 38.85],
            [-77, 38.85],
            [-77, 38.9],
            [-77.05, 38.85],
          ],
        ],
      },
    });
    expect(withClosedHole.boundary).toEqual({
      type: "Polygon",
      coordinates: [
        boundary.coordinates[0],
        [
          [-77.05, 38.85],
          [-77, 38.85],
          [-77, 38.9],
          [-77.05, 38.85],
        ],
      ],
    });
  });

  it("reverses display conversions before exporting cited native units", () => {
    const precipitation = placeObservationProductFromSample({
      layerId: "precip",
      sampledUnit: "mm/day",
      sourceValueFactor: 86_400,
      colormapUrl:
        "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GLDAS_Surface_Total_Precipitation_Rate_Monthly.xml",
      samplingSupport: {
        gridSize: 16,
        candidatePointCount: 256,
        interiorPointCount: 180,
        retainedPointCount: 180,
        sourcePixelCount: 170,
        pointLimitApplied: false,
      },
      samplingStrategy: "boundary-point",
      observations: [
        {
          dataMonth: { year: 2026, month: 4 },
          // The place card displays this equivalent rate as mm/day.
          value: 8.64,
          validFraction: 0.75,
        },
        {
          dataMonth: { year: 2026, month: 5 },
          value: null,
          unavailableReason: "insufficient-valid-coverage",
        },
      ],
    });

    expect(precipitation).toMatchObject({
      layerId: "precip",
      wmsLayer: LAYERS.precip.wmsLayer,
      source: LAYERS.precip.dataset,
      valueMapping: {
        status: "gibs-colormap",
        url: "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GLDAS_Surface_Total_Precipitation_Rate_Monthly.xml",
      },
      nativeUnit: "kg/m²/s",
      samplingSupport: {
        gridSize: 16,
        candidatePointCount: 256,
        interiorPointCount: 180,
        retainedPointCount: 180,
        sourcePixelCount: 170,
        pointLimitApplied: false,
      },
      sampleToNative: {
        sampledUnit: "mm/day",
        operation: "divide",
        factor: 86_400,
      },
      observations: [
        {
          dataMonth: { year: 2026, month: 4 },
          value: 0.0001,
          validFraction: 0.75,
        },
        { dataMonth: { year: 2026, month: 5 }, value: null },
      ],
    });

    expect(() =>
      placeObservationProductFromSample({
        layerId: "ndvi",
        observations: [],
        sourceValueFactor: 0,
      })
    ).toThrow("sourceValueFactor must be a positive finite number.");
  });

  it("rejects a colormap mapping outside the official GIBS endpoint", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[1],
            valueMapping: {
              status: "gibs-colormap",
              url: "https://example.com/precip.xml",
            },
          },
        ],
      })
    ).toThrow("Product precip has an invalid GIBS colormap URL.");
  });

  it("records approximate and unavailable rendered-value mappings", () => {
    expect(
      placeObservationProductFromSample({
        layerId: "ndvi",
        observations: [],
        usedUiLegendApproximation: true,
      }).valueMapping
    ).toEqual({ status: "ui-legend-approximation", url: null });
    expect(
      placeObservationProductFromSample({
        layerId: "soil",
        observations: [],
        colormapUrl: null,
      }).valueMapping
    ).toEqual({ status: "not-available", url: null });
  });

  it("rejects impossible geometry sampling-support budgets", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            samplingSupport: {
              gridSize: 28,
              candidatePointCount: 784,
              interiorPointCount: 620,
              retainedPointCount: 700,
              sourcePixelCount: 488,
              pointLimitApplied: true,
            },
          },
        ],
      })
    ).toThrow("Product ndvi has inconsistent sampling-support counts.");
  });

  it("rejects contradictory geometry sampling-support plan metadata", () => {
    for (const samplingSupport of [
      {
        ...input.products[0].samplingSupport,
        candidatePointCount: 783,
      },
      {
        ...input.products[0].samplingSupport,
        pointLimitApplied: false,
      },
      {
        ...input.products[0].samplingSupport,
        pointLimitApplied: "yes",
      },
    ]) {
      expect(() =>
        createPlaceObservationExport({
          ...input,
          products: [
            {
              ...input.products[0],
              samplingSupport:
                samplingSupport as (typeof input.products)[0]["samplingSupport"],
            },
          ],
        })
      ).toThrow(
        "Product ndvi has inconsistent sampling-support plan metadata."
      );
    }
  });

  it("rejects non-reproducible sample-to-native transforms", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            sampleToNative: {
              sampledUnit: "NDVI",
              operation: "divide",
              factor: 0,
            },
          },
        ],
      })
    ).toThrow("Product ndvi has an invalid sample-to-native transform.");
  });

  it("does not invent a sampling strategy for unavailable samples", () => {
    const product = placeObservationProductFromSample({
      layerId: "ndvi",
      observations: [
        { dataMonth: { year: 2026, month: 4 }, value: null, validFraction: 0 },
      ],
    });

    expect(product.samplingStrategy).toBe("unavailable");
  });

  it("requires sampling geography for every product with recorded values", () => {
    expect(() =>
      placeObservationProductFromSample({
        layerId: "sst",
        observations: [
          {
            dataMonth: { year: 2026, month: 5 },
            value: 18.375,
            validFraction: 0.37,
          },
        ],
      })
    ).toThrow("Product sst needs a sampling strategy for recorded values.");

    const product = {
      ...input.products[1],
      samplingStrategy: "unavailable" as const,
    };

    expect(product.samplingStrategy).toBe("unavailable");
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [product],
      })
    ).toThrow(
      "Product precip must retain a boundary sampling strategy for recorded values."
    );

    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...product,
            samplingStrategy: "boundary-grid",
            sourceImageDimensions: { width: 512, height: 256 },
          },
        ],
      })
    ).not.toThrow();
  });

  it("rejects invalid product-level rendered-image dimensions", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            sourceImageDimensions: { width: 768, height: 0 },
          },
        ],
      })
    ).toThrow("Product ndvi has invalid source-image dimensions.");
  });

  it("rejects recorded values without product-level image provenance", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          {
            ...input.products[0],
            sourceImageDimensions: undefined,
          },
        ],
      })
    ).toThrow(
      "Product ndvi must identify its source image when a value is recorded."
    );
  });

  it("retains successful products when SST sampling fails", () => {
    const sst = placeObservationProductFromSample({
      layerId: "sst",
      observations: [
        {
          dataMonth: { year: 2026, month: 5 },
          value: null,
          unavailableReason: "sampling-failed",
        },
      ],
    });

    const exported = createPlaceObservationExport({
      ...input,
      products: [...input.products, sst],
    });

    expect(exported.products).toHaveLength(3);
    expect(
      exported.products
        .find(({ layerId }) => layerId === "ndvi")
        ?.observations.find(({ dataMonth }) => dataMonth === "2026-04")
    ).toMatchObject({ value: 0.62 });
    expect(
      exported.products.find(({ layerId }) => layerId === "sst")
    ).toMatchObject({
      nativeUnit: "°C",
      samplingStrategy: "unavailable",
      observations: [
        {
          dataMonth: "2026-05",
          value: null,
          validFraction: null,
          unavailableReason: "sampling-failed",
        },
      ],
    });
  });

  it("records open-ended legend-cap censoring and marks the value a bound", () => {
    const precipitation = placeObservationProductFromSample({
      layerId: "precip",
      sampledUnit: "mm/day",
      sourceValueFactor: 86_400,
      colormapUrl: PRECIP_COLORMAP_URL,
      samplingStrategy: "boundary-grid",
      sourceImageDimensions: { width: 512, height: 512 },
      legendCapCensoring: {
        assessedDataMonth: { year: 2026, month: 5 },
        censoredSampleCount: 31,
        valuedSampleCount: 204,
        bound: 5.0e-4,
        boundRelation: "at-or-above",
        publishedLabel: "≥ 5.0e-04",
        colormapDocument: PRECIP_COLORMAP_URL,
      },
      observations: [
        {
          dataMonth: { year: 2026, month: 5 },
          value: 8.64,
          validFraction: 0.71,
        },
      ],
    });

    const exported = createPlaceObservationExport({
      ...input,
      products: [...nonPrecipProducts(), precipitation],
    });

    expect(
      exported.products.find(({ layerId }) => layerId === "precip")
        ?.legendCapCensoring
    ).toEqual({
      assessedDataMonth: "2026-05",
      censoredSampleCount: 31,
      valuedSampleCount: 204,
      bound: 5.0e-4,
      boundRelation: "at-or-above",
      publishedLabel: "≥ 5.0e-04",
      colormapDocument: PRECIP_COLORMAP_URL,
      valueIsOneSidedBound: true,
    });
    expect(exported.limitations.join(" ")).toMatch(
      /legend-cap censoring record marks the month it names as a one-sided bound/i
    );
  });

  it("does not call an assessed footprint bounded when the cap took nothing", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [
        ...nonPrecipProducts(),
        placeObservationProductFromSample({
          layerId: "soil",
          sourceValueFactor: 1,
          colormapUrl: SOIL_COLORMAP_URL,
          samplingStrategy: "boundary-grid",
          sourceImageDimensions: { width: 512, height: 512 },
          legendCapCensoring: {
            assessedDataMonth: { year: 2026, month: 5 },
            censoredSampleCount: 0,
            valuedSampleCount: 188,
            bound: 50,
            boundRelation: "at-or-above",
            publishedLabel: "≥ 50.0",
            colormapDocument: SOIL_COLORMAP_URL,
          },
          observations: [
            {
              dataMonth: { year: 2026, month: 5 },
              value: 21.4,
              validFraction: 0.93,
            },
          ],
        }),
      ],
    });

    expect(
      exported.products.find(({ layerId }) => layerId === "soil")
        ?.legendCapCensoring
    ).toMatchObject({ censoredSampleCount: 0, valueIsOneSidedBound: false });
  });

  it("leaves censoring unassessed rather than reporting an uncensored tally", () => {
    const exported = createPlaceObservationExport(input);

    for (const product of exported.products) {
      expect(product.legendCapCensoring).toBeNull();
    }
    expect(exported.limitations.join(" ")).toMatch(
      /where no record is supplied, none was assessed, which is not evidence that no censoring occurred/i
    );
  });

  it("rejects a censoring record for a month the product does not export", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          ...nonPrecipProducts(),
          placeObservationProductFromSample({
            layerId: "precip",
            sourceValueFactor: 1,
            colormapUrl: PRECIP_COLORMAP_URL,
            samplingStrategy: "boundary-grid",
            sourceImageDimensions: { width: 512, height: 512 },
            legendCapCensoring: {
              assessedDataMonth: { year: 2026, month: 3 },
              censoredSampleCount: 4,
              valuedSampleCount: 100,
              bound: 5.0e-4,
              boundRelation: "at-or-above",
              publishedLabel: "≥ 5.0e-04",
              colormapDocument: PRECIP_COLORMAP_URL,
            },
            observations: [
              {
                dataMonth: { year: 2026, month: 5 },
                value: 1.0e-4,
                validFraction: 0.6,
              },
            ],
          }),
        ],
      })
    ).toThrow(
      "Product precip records legend-cap censoring for a month it does not export."
    );
  });

  it("rejects a tally counting more censored cells than valued cells", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          ...nonPrecipProducts(),
          placeObservationProductFromSample({
            layerId: "precip",
            sourceValueFactor: 1,
            colormapUrl: PRECIP_COLORMAP_URL,
            samplingStrategy: "boundary-grid",
            sourceImageDimensions: { width: 512, height: 512 },
            legendCapCensoring: {
              assessedDataMonth: { year: 2026, month: 5 },
              censoredSampleCount: 120,
              valuedSampleCount: 100,
              bound: 5.0e-4,
              boundRelation: "at-or-above",
              publishedLabel: "≥ 5.0e-04",
              colormapDocument: PRECIP_COLORMAP_URL,
            },
            observations: [
              {
                dataMonth: { year: 2026, month: 5 },
                value: 1.0e-4,
                validFraction: 0.6,
              },
            ],
          }),
        ],
      })
    ).toThrow("Product precip counts more censored cells than valued cells.");
  });

  it("requires a censoring record to cite the published bin it read", () => {
    expect(() =>
      createPlaceObservationExport({
        ...input,
        products: [
          ...nonPrecipProducts(),
          placeObservationProductFromSample({
            layerId: "precip",
            sourceValueFactor: 1,
            colormapUrl: PRECIP_COLORMAP_URL,
            samplingStrategy: "boundary-grid",
            sourceImageDimensions: { width: 512, height: 512 },
            legendCapCensoring: {
              assessedDataMonth: { year: 2026, month: 5 },
              censoredSampleCount: 3,
              valuedSampleCount: 100,
              bound: 5.0e-4,
              boundRelation: "at-or-above",
              publishedLabel: "≥ 5.0e-04",
              colormapDocument: "  ",
            },
            observations: [
              {
                dataMonth: { year: 2026, month: 5 },
                value: 1.0e-4,
                validFraction: 0.6,
              },
            ],
          }),
        ],
      })
    ).toThrow(
      "Product precip must cite the published legend bin it was capped by."
    );
  });
});

describe("place observation export inversion accuracy", () => {
  const productFor = (
    exported: ReturnType<typeof createPlaceObservationExport>,
    layerId: string
  ) => exported.products.find((product) => product.layerId === layerId)!;

  it("carries each product's committed inversion RMSE rather than a restated constant", () => {
    const exported = createPlaceObservationExport(input);

    // Read from the committed table, not a literal: recalibrating a legend must
    // move the exported figure, never leave a stale number behind here.
    expect(productFor(exported, "ndvi").inversionAccuracy).toEqual({
      status: "characterized",
      // This product's values were read through GIBS's published colormap, so
      // the committed figure — measured on the UI legend gradient — describes a
      // different inversion from the one that produced them.
      scope: "measures-a-different-inversion",
      uncharacterizedReason: null,
      nativeRmse: MEASURED_INVERSION.ndvi.rmse,
      reportedRmse: MEASURED_INVERSION.ndvi.rmse,
      reportedUnit: "NDVI",
      recoveredColormapSteps:
        MEASURED_INVERSION.ndvi.total - MEASURED_INVERSION.ndvi.nulls,
      totalColormapSteps: MEASURED_INVERSION.ndvi.total,
    });
  });

  it("states the band in the product's native unit using the same factor as sampleToNative", () => {
    const exported = createPlaceObservationExport(input);
    const precip = productFor(exported, "precip");

    // The published figure is mm/day; the export records kg/m²/s. A band left in
    // the published unit would be 86 400× too large for the value it qualifies.
    expect(precip.nativeUnit).toBe("kg/m²/s");
    expect(precip.inversionAccuracy.reportedUnit).toBe("mm/day");
    expect(precip.inversionAccuracy.reportedRmse).toBe(
      MEASURED_INVERSION.precip.rmse
    );
    expect(precip.inversionAccuracy.nativeRmse).toBeCloseTo(
      (MEASURED_INVERSION.precip.rmse as number) / 86_400,
      12
    );
    // The conversion is the export's own sampleToNative factor, so the band and
    // the value it qualifies can never drift into different units.
    expect(precip.inversionAccuracy.nativeRmse).toBeCloseTo(
      (precip.inversionAccuracy.reportedRmse as number) /
        precip.sampleToNative.factor,
      12
    );
  });

  it("keeps the band consistent for every exported product", () => {
    const exported = createPlaceObservationExport(input);

    for (const product of exported.products) {
      const accuracy = product.inversionAccuracy;
      // characterized and "has a number" are the same fact, never two.
      expect(accuracy.status === "characterized").toBe(
        accuracy.nativeRmse !== null
      );
      expect(accuracy.uncharacterizedReason === null).toBe(
        accuracy.status === "characterized"
      );
      if (accuracy.status === "characterized") {
        expect(accuracy.nativeRmse as number).toBeGreaterThan(0);
        expect(accuracy.recoveredColormapSteps as number).toBeGreaterThan(0);
        expect(accuracy.totalColormapSteps as number).toBeGreaterThanOrEqual(
          accuracy.recoveredColormapSteps as number
        );
      }
    }
  });

  it("reads the scope from the product's own recorded value method", () => {
    const withMappings = {
      ...input,
      products: [
        // Same layer three times is not possible (products are keyed by layer),
        // so vary the mapping across the fixture's real products instead.
        { ...input.products[0], valueMapping: undefined },
        {
          ...input.products[1],
          valueMapping: {
            status: "ui-legend-approximation" as const,
            url: null,
          },
        },
      ],
    };
    const exported = createPlaceObservationExport(withMappings);

    // No mapping recorded: which ramp was inverted is unknown, and that is not
    // evidence that either one ran.
    expect(productFor(exported, "ndvi").inversionAccuracy.scope).toBe(
      "value-inversion-unrecorded"
    );
    // The legend approximation is the very inversion MEASURED_INVERSION covers.
    expect(productFor(exported, "precip").inversionAccuracy.scope).toBe(
      "measures-this-product"
    );
  });

  it("never lets the scope disagree with the recorded value mapping", () => {
    const exported = createPlaceObservationExport(input);

    for (const product of exported.products) {
      const expected =
        product.valueMapping.status === "gibs-colormap"
          ? "measures-a-different-inversion"
          : product.valueMapping.status === "ui-legend-approximation"
            ? "measures-this-product"
            : "value-inversion-unrecorded";
      expect(product.inversionAccuracy.scope).toBe(expected);
    }
  });

  it("states the scope without inventing a figure for the unmeasured inversion", () => {
    const exported = createPlaceObservationExport(input);
    const ndvi = productFor(exported, "ndvi");

    // The mismatch is reported, never repaired: the quoted figure stays the
    // committed one, unscaled and unsubstituted.
    expect(ndvi.inversionAccuracy.scope).toBe("measures-a-different-inversion");
    expect(ndvi.inversionAccuracy.nativeRmse).toBe(
      MEASURED_INVERSION.ndvi.rmse
    );
    expect(exported.limitations.join(" ")).toMatch(
      /neither this product's error nor evidence of a larger or smaller one/
    );
  });

  it("survives serialization and states its limits", () => {
    const exported = createPlaceObservationExport(input);
    const parsed = JSON.parse(serializePlaceObservationExport(input));

    expect(parsed).toEqual(exported);
    expect(
      parsed.products.find(
        (product: { layerId: string }) => product.layerId === "ndvi"
      ).inversionAccuracy.scope
    ).toBe("measures-a-different-inversion");
    expect(
      parsed.products.find(
        (product: { layerId: string }) => product.layerId === "ndvi"
      ).inversionAccuracy.nativeRmse
    ).toBe(MEASURED_INVERSION.ndvi.rmse);
    // The value method is named in the record; its measured error must be too.
    expect(exported.method.valueMethod).toBe("approximate-colormap-inversion");
    expect(exported.limitations.join(" ")).toMatch(
      /inversionAccuracy is the measured end-to-end error/
    );
    expect(exported.limitations.join(" ")).toMatch(
      /not the source product's validation against in-situ measurement/
    );
  });
});

describe("place observation export observing constraints", () => {
  const productFor = (
    exported: ReturnType<typeof createPlaceObservationExport>,
    layerId: string
  ) => exported.products.find((product) => product.layerId === layerId)!;

  const sstProduct = () =>
    placeObservationProductFromSample({
      layerId: "sst",
      sourceValueFactor: 1,
      samplingStrategy: "boundary-grid",
      sourceImageDimensions: { width: 512, height: 256 },
      observations: [
        sstPlaceObservationFromSample({ year: 2026, month: 4 }, 18.4, 0.42),
      ],
    });

  it("carries the cited SST product's observing constraints verbatim", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [sstProduct()],
    });
    const summary = summarizeSstObservingConstraints();

    // Read from the descriptor, not restated here: a correction to the module
    // every other surface quotes must move this record too.
    expect(productFor(exported, "sst").observingConstraints).toEqual({
      status: "published",
      claimScope: "product-observing-system-only",
      notPublishedReason: null,
      representsFullDiurnalCycle: false,
      constraints: summary.constraints.map((entry) => ({
        id: entry.id,
        constraint: entry.constraint,
        implication: entry.implication,
        direction: entry.direction,
      })),
      limits: [...summary.limits],
    });
  });

  it("names the three gates a reader must know before using an SST value", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [sstProduct()],
    });
    const constraints = productFor(exported, "sst").observingConstraints;

    expect(constraints.constraints.map((entry) => entry.id)).toEqual([
      "daytime-overpass-only",
      "clear-sky-retrieval-only",
      "near-surface-radiometric",
    ]);
    // The one sign the observing geometry fixes is stated; the two that depend
    // on regime stay unasserted rather than guessed.
    expect(
      constraints.constraints
        .filter((entry) => entry.direction !== "not-asserted")
        .map((entry) => entry.id)
    ).toEqual(["daytime-overpass-only"]);
  });

  it("asserts no magnitude, no biology and no forecast", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [sstProduct()],
    });
    const record = productFor(exported, "sst").observingConstraints;

    // Screened over what the record ASSERTS. The limits are excluded on
    // purpose: they name organisms and ecosystems precisely to refuse them, and
    // a regex that cannot tell a claim from its disclaimer would delete the
    // disclaimer.
    expect(assertedText(record)).not.toMatch(
      /species|habitat|ecosystem|coral|bleach|heatwave|forecast|will be|expect/i
    );
    expect(record.limits.join(" ")).toMatch(
      /carry no claim about organisms, habitat, ecosystem condition, causation, or any future value/
    );
    // No offset magnitude anywhere: the size of a daytime-versus-daily-mean
    // difference depends on wind, insolation and mixing this app never observes.
    expect(constraintText(record)).not.toMatch(/\d/);
  });

  it("records an absent descriptor as absent, never as unconstrained", () => {
    const exported = createPlaceObservationExport(input);

    for (const product of exported.products) {
      const constraints = product.observingConstraints;
      expect(constraints.claimScope).toBe("product-observing-system-only");
      if (product.layerId === "sst") continue;
      expect(constraints).toEqual({
        status: "not-published",
        claimScope: "product-observing-system-only",
        notPublishedReason: "no-descriptor-published-for-this-product",
        // Deliberately null, not true: no descriptor is not an answer.
        representsFullDiurnalCycle: null,
        constraints: [],
        limits: [],
      });
    }
  });

  it("keeps the record self-describing so absence needs no external note", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [sstProduct(), ...nonPrecipProducts()],
    });

    for (const product of exported.products) {
      const constraints = product.observingConstraints;
      // published and "has constraints" are the same fact, never two.
      expect(constraints.status === "published").toBe(
        constraints.constraints.length > 0
      );
      expect(constraints.notPublishedReason === null).toBe(
        constraints.status === "published"
      );
      expect(constraints.representsFullDiurnalCycle === null).toBe(
        constraints.status === "not-published"
      );
    }
  });

  it("survives serialization", () => {
    const withSst = { ...input, products: [sstProduct()] };
    const parsed = JSON.parse(serializePlaceObservationExport(withSst));

    expect(parsed).toEqual(createPlaceObservationExport(withSst));
    expect(
      parsed.products.find(
        (product: { layerId: string }) => product.layerId === "sst"
      ).observingConstraints.representsFullDiurnalCycle
    ).toBe(false);
  });
});

describe("place observation export observation modality", () => {
  const productFor = (
    exported: ReturnType<typeof createPlaceObservationExport>,
    layerId: string
  ) => exported.products.find((product) => product.layerId === layerId)!;

  const gldasProduct = (layerId: "precip" | "soil") =>
    placeObservationProductFromSample({
      layerId,
      sourceValueFactor: 1,
      samplingStrategy: "boundary-grid",
      sourceImageDimensions: { width: 512, height: 256 },
      observations: [
        { dataMonth: { year: 2026, month: 3 }, value: 4.2, validFraction: 0.9 },
      ],
    });

  const sstSample = () =>
    placeObservationProductFromSample({
      layerId: "sst",
      sourceValueFactor: 1,
      samplingStrategy: "boundary-grid",
      sourceImageDimensions: { width: 512, height: 256 },
      observations: [
        sstPlaceObservationFromSample({ year: 2026, month: 4 }, 18.4, 0.42),
      ],
    });

  it("marks the two GLDAS fields as modelled, not measured", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [gldasProduct("precip"), gldasProduct("soil")],
    });

    // The defect this closes: the place card renders "model-derived, not a
    // direct measurement" for both of these, and the download said nothing.
    for (const layerId of ["precip", "soil"] as const) {
      const modality = productFor(exported, layerId).observationModality;
      expect(modality.modality).toBe("land-surface-model");
      expect(modality.basis).toBe("model");
      expect(modality.modelDerived).toBe(true);
      expect(modality.statement).toMatch(
        /model-derived, not a direct measurement of the sampled cell/
      );
      // The citation travels with the claim, so the record reads standalone.
      expect(modality.statement).toContain("GLDAS_NOAH025_M v2.1");
    }
  });

  it("gives the two GLDAS fields one modality, because they are one product", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [gldasProduct("precip"), gldasProduct("soil")],
    });

    // Rainfall is a flux and soil moisture a state, but modality is keyed by
    // the product both are delivered in — so they must not disagree here.
    expect(productFor(exported, "precip").observationModality).toEqual(
      productFor(exported, "soil").observationModality
    );
  });

  it("reads the modality table rather than restating it", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [gldasProduct("precip"), ...nonPrecipProducts()],
    });

    // Read from the module every other surface quotes: a correction there must
    // move this record too, which is the whole point of deriving it.
    for (const product of exported.products) {
      const expected = classifyModality(product.source);
      expect(product.observationModality.modality).toBe(expected);
      expect(product.observationModality.basis).toBe(
        describeModality(expected).basis
      );
      expect(product.observationModality.statement).toContain(
        describeModality(expected).description
      );
      expect(product.observationModality.limits).toEqual([...MODALITY_LIMITS]);
    }
  });

  it("keeps modelDerived exactly the model basis, never a measurement claim", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [
        gldasProduct("precip"),
        gldasProduct("soil"),
        sstSample(),
        ...nonPrecipProducts(),
      ],
    });

    for (const product of exported.products) {
      const modality = product.observationModality;
      expect(modality.modelDerived).toBe(modality.basis === "model");
    }

    // NDVI is sensed, so it is not model-derived — but a false here says
    // "remotely sensed", not "measured in situ".
    const ndvi = productFor(exported, "ndvi").observationModality;
    expect(ndvi.modality).toBe("satellite-derived-index");
    expect(ndvi.modelDerived).toBe(false);
    expect(ndvi.statement).toMatch(/not a direct in-situ measurement/);
  });

  it("records an untabled product as unasserted, never as measured", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [sstSample()],
    });
    const modality = productFor(exported, "sst").observationModality;

    // SST is absent from the modality table. The false modelDerived that
    // follows must not read as a finding that the value was measured.
    expect(modality.modality).toBe("unclassified");
    expect(modality.basis).toBe("unknown");
    expect(modality.modelDerived).toBe(false);
    expect(modality.statement).toMatch(/production basis not asserted/);
    expect(modality.limits.join(" ")).toMatch(/never inferred from its value/);
  });

  it("asserts production basis and nothing further", () => {
    const exported = createPlaceObservationExport({
      ...input,
      products: [gldasProduct("precip"), gldasProduct("soil")],
    });

    for (const product of exported.products) {
      // Screened over the statement alone: the limits name confirmation and
      // independence precisely to refuse them.
      expect(product.observationModality.statement).not.toMatch(
        /drought|flood|wet|dry|risk|condition|forecast|will be|expect|because/i
      );
    }
    expect(exported.limitations.join(" ")).toMatch(
      /observationModality\.modelDerived marks a value produced by a land-surface model/
    );
  });

  it("survives serialization", () => {
    const withGldas = { ...input, products: [gldasProduct("soil")] };
    const parsed = JSON.parse(serializePlaceObservationExport(withGldas));

    expect(parsed).toEqual(createPlaceObservationExport(withGldas));
    expect(
      parsed.products.find(
        (product: { layerId: string }) => product.layerId === "soil"
      ).observationModality.modelDerived
    ).toBe(true);
  });
});

interface ObservingConstraintProse {
  constraints: readonly { constraint: string; implication: string }[];
  limits: readonly string[];
}

/** Only what the record claims — its limits, which refuse claims, excluded. */
function assertedText(record: ObservingConstraintProse): string {
  return record.constraints
    .flatMap((entry) => [entry.constraint, entry.implication])
    .join(" ");
}

/** Every prose string in the record, with the identifiers left out. */
function constraintText(record: ObservingConstraintProse): string {
  return [assertedText(record), ...record.limits].join(" ");
}
