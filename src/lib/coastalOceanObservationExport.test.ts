import { describe, expect, it } from "vitest";
import {
  COASTAL_OCEAN_OBSERVATION_EXPORT_SCHEMA,
  createCoastalOceanObservationExport,
  serializeCoastalOceanObservationExport,
} from "./coastalOceanObservationExport";

const BOUNDARY = {
  type: "Polygon",
  coordinates: [
    [
      [-123.2, 37.7],
      [-122.8, 37.7],
      [-122.8, 38],
      [-123.2, 38],
      [-123.2, 37.7],
    ],
  ],
};

const BASE_INPUT = {
  geography: BOUNDARY,
  observation: {
    sst: {
      dataMonth: { year: 2026, month: 6 },
      value: 13.75,
      validFraction: 0.62,
      footprint: "land-mixed-coastal" as const,
    },
    sstCoverage: {
      dataMonth: { year: 2026, month: 6 },
      footprint: "coastal-or-land-mixed" as const,
      validFraction: 0.62,
      sourceImageDimensions: { width: 2048, height: 1024 },
    },
  },
  generatedIso: "2026-07-27T09:30:00.000Z",
  toolVersion: "1.1.0",
};

describe("coastal ocean observation export", () => {
  it("exports the actual coastal SST path with native provenance and geography", () => {
    const exported = createCoastalOceanObservationExport(BASE_INPUT);

    expect(exported).toMatchObject({
      schema: COASTAL_OCEAN_OBSERVATION_EXPORT_SCHEMA,
      kind: "coastal-ocean-observation-export",
      geography: {
        kind: "supplied-area-boundary",
        geometry: BOUNDARY,
      },
      observation: {
        isForecast: false,
        sst: {
          dataMonth: { year: 2026, month: 6 },
          observedValue: 13.75,
          metric: {
            sourceUnit: "°C",
            source: {
              shortName:
                "MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0",
            },
          },
          coverage: {
            status: "land-mixed-coastal",
            validFraction: 0.62,
          },
        },
        sstCoverage: {
          marineBiologyObservation: false,
          dataMonth: { year: 2026, month: 6 },
          coverage: {
            status: "coastal-or-land-mixed",
            validFraction: 0.62,
          },
          sourceImageDimensions: { width: 2048, height: 1024 },
        },
        biology: {
          biologicalObservation: false,
          status: "not-supplied",
          observedValue: null,
        },
        dataMonthAlignment: {
          sstAndCoverage: "same-data-month",
          sstAndBiology: "not-applicable",
        },
      },
      interpretation: {
        seaSurfaceTemperatureIsBiologicalEvidence: false,
        monthAlignmentEstablishesAssociation: false,
        includesForecast: false,
      },
    });
    expect(exported.limitations.join(" ")).toContain("not biological evidence");
    expect(exported.geography.geometry).not.toBe(BOUNDARY);
  });

  it("preserves no-data and differing-month states without inventing a value", () => {
    const exported = createCoastalOceanObservationExport({
      ...BASE_INPUT,
      observation: {
        sst: {
          dataMonth: { year: 2026, month: 6 },
          value: null,
          footprint: "unknown",
        },
        sstCoverage: {
          dataMonth: { year: 2026, month: 5 },
          footprint: "unknown",
        },
      },
    });

    expect(exported.observation).toMatchObject({
      sst: {
        observedValue: null,
        temperatureBand: null,
        coverage: { status: "missing", reason: "missing-sst-value" },
      },
      sstCoverage: {
        coverage: {
          status: "unknown",
          validFraction: null,
          reason: "unknown-footprint",
        },
      },
      dataMonthAlignment: { sstAndCoverage: "different-data-month" },
    });
  });

  it("serializes deterministically with a trailing newline", () => {
    const serialized = serializeCoastalOceanObservationExport(BASE_INPUT);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(
      createCoastalOceanObservationExport(BASE_INPUT)
    );
  });

  it("rejects missing geography and non-canonical generation timestamps", () => {
    expect(() =>
      createCoastalOceanObservationExport({
        ...BASE_INPUT,
        geography: { type: "Point", coordinates: [-123, 38] },
      })
    ).toThrow("Polygon or MultiPolygon");

    expect(() =>
      createCoastalOceanObservationExport({
        ...BASE_INPUT,
        generatedIso: "2026-07-27",
      })
    ).toThrow("ISO 8601 instant");
  });
});
