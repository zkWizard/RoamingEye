import { describe, expect, it } from "vitest";
import { LAYERS } from "./timeline";
import {
  GIBS_IMAGERY_SOURCE,
  PLACE_OBSERVATION_NATIVE_UNITS,
  PLACE_OBSERVATION_GEOGRAPHY,
  createPlaceObservationExport,
  placeObservationProductFromSample,
  serializePlaceObservationExport,
  sstPlaceObservationFromSample,
} from "./placeObservationExport";

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
      schema: "roamingeye-place-observation-export/v5",
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
            },
            {
              dataMonth: "2026-05",
              value: null,
              validFraction: null,
              unavailableReason: "source-no-data",
              coverageStatus: "not-supplied",
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
      },
      {
        dataMonth: "2026-05",
        value: null,
        validFraction: null,
        unavailableReason: "source-no-data",
        coverageStatus: "not-supplied",
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
