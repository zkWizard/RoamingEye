import { describe, expect, it } from "vitest";
import {
  COASTAL_OCEAN_OBSERVATION_LIMITATIONS,
  COASTAL_OCEAN_OBSERVATION_SCHEMA,
  createCoastalOceanObservation,
  summarizeDirectMarineBiologicalObservation,
} from "./marineObservation";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";

const BIOLOGICAL_SOURCE = {
  shortName: "COASTAL_DIRECT_SURVEY",
  version: "1.0",
  doi: "10.1234/coastal.direct.survey.1",
  title: "Coastal Direct Biological Survey",
};

describe("coastal ocean observation contract", () => {
  it("keeps supplied direct biology distinct from SST and SST coverage", () => {
    const summary = createCoastalOceanObservation({
      sst: {
        dataMonth: { year: 2026, month: 3 },
        value: 18.4,
        validFraction: 0.37,
        footprint: "land-mixed-coastal",
      },
      sstCoverage: {
        dataMonth: { year: 2026, month: 3 },
        footprint: "coastal-or-land-mixed",
        validFraction: 0.37,
        sourceImageDimensions: { width: 2048, height: 1024 },
      },
      biologicalObservation: {
        observationKind: "organism-count",
        taxonName: "Example coastal taxon",
        dataMonth: { year: 2026, month: 3 },
        value: 0,
        nativeUnit: "individuals",
        source: BIOLOGICAL_SOURCE,
        validFraction: 0.65,
        geography: {
          kind: "boundary",
          label: "Supplied coastal survey boundary",
        },
      },
    });

    expect(summary).toMatchObject({
      schema: COASTAL_OCEAN_OBSERVATION_SCHEMA,
      kind: "coastal-ocean-observation",
      isForecast: false,
      claimScope: "separate-sst-and-direct-biological-observations-only",
      sst: {
        observedValue: 18.4,
        temperatureBand: "temperate",
        metric: SEA_SURFACE_TEMPERATURE_METRIC,
        coverage: {
          status: "land-mixed-coastal",
          validFraction: 0.37,
        },
      },
      sstCoverage: {
        marineBiologyObservation: false,
        coverage: {
          status: "coastal-or-land-mixed",
          validFraction: 0.37,
        },
      },
      biology: {
        kind: "direct-marine-biological-observation",
        biologicalObservation: true,
        status: "observed",
        observationKind: "organism-count",
        taxonName: "Example coastal taxon",
        source: BIOLOGICAL_SOURCE,
        nativeUnit: "individuals",
        geography: {
          kind: "boundary",
          label: "Supplied coastal survey boundary",
        },
        coverage: { validFraction: 0.65, reason: null },
        observedValue: 0,
      },
      dataMonthAlignment: {
        sstAndCoverage: "same-data-month",
        sstAndBiology: "same-data-month",
      },
    });
    expect(summary.limitations).toEqual(COASTAL_OCEAN_OBSERVATION_LIMITATIONS);
    expect(summary.limitations.join(" ")).toContain(
      "not a marine-biological observation"
    );
  });

  it("retains a different biological month without turning timing into an inference", () => {
    const summary = createCoastalOceanObservation({
      sst: {
        dataMonth: { year: 2026, month: 3 },
        value: 12.2,
        footprint: "water",
      },
      sstCoverage: {
        dataMonth: { year: 2026, month: 2 },
        footprint: "water",
      },
      biologicalObservation: {
        observationKind: "occurrence-record",
        taxonName: "Example pelagic taxon",
        dataMonth: { year: 2026, month: 2 },
        value: 1,
        nativeUnit: "records",
        source: BIOLOGICAL_SOURCE,
      },
    });

    expect(summary.dataMonthAlignment).toEqual({
      sstAndCoverage: "different-data-month",
      sstAndBiology: "different-data-month",
    });
    expect(summary.biology).toMatchObject({
      status: "observed",
      dataMonth: { year: 2026, month: 2 },
      observedValue: 1,
    });
    expect(summary.limitations.join(" ")).toContain(
      "Matching data months describes timing only"
    );
  });

  it("makes an absent biological record explicit instead of deriving one from SST", () => {
    const summary = createCoastalOceanObservation({
      sst: {
        dataMonth: { year: 2026, month: 3 },
        value: 14.5,
        footprint: "water",
      },
      sstCoverage: {
        dataMonth: { year: 2026, month: 3 },
        footprint: "water",
      },
    });

    expect(summary.biology).toEqual({
      kind: "no-direct-marine-biological-observation-supplied",
      biologicalObservation: false,
      isForecast: false,
      status: "not-supplied",
      observationKind: null,
      taxonName: null,
      dataMonth: null,
      source: null,
      nativeUnit: null,
      geography: null,
      coverage: { validFraction: null, reason: "not-supplied" },
      observedValue: null,
    });
    expect(summary.dataMonthAlignment.sstAndBiology).toBe("not-applicable");
  });

  it("preserves missing and invalid biological data as explicit non-observations", () => {
    expect(
      summarizeDirectMarineBiologicalObservation({
        observationKind: "biomass-measurement",
        taxonName: "Example benthic taxon",
        dataMonth: { year: 2026, month: 3 },
        value: null,
        nativeUnit: "g",
        source: BIOLOGICAL_SOURCE,
      })
    ).toMatchObject({
      biologicalObservation: true,
      status: "no-data",
      coverage: { validFraction: null, reason: "missing-value" },
      observedValue: null,
    });

    expect(
      summarizeDirectMarineBiologicalObservation({
        observationKind: "organism-count",
        taxonName: "Example coastal taxon",
        dataMonth: { year: 2026, month: 3 },
        value: 24,
        nativeUnit: "individuals",
        source: BIOLOGICAL_SOURCE,
        validFraction: 1.1,
      })
    ).toMatchObject({
      biologicalObservation: true,
      status: "invalid",
      coverage: { validFraction: null, reason: "invalid-coverage" },
      observedValue: null,
    });
  });

  it("retains supplied biological geography and rejects malformed geography", () => {
    expect(
      summarizeDirectMarineBiologicalObservation({
        observationKind: "occurrence-record",
        taxonName: "Example pelagic taxon",
        dataMonth: { year: 2026, month: 3 },
        value: 1,
        nativeUnit: "records",
        source: BIOLOGICAL_SOURCE,
        geography: { kind: "point", label: "Station A" },
      })
    ).toMatchObject({
      status: "observed",
      geography: { kind: "point", label: "Station A" },
    });

    expect(
      summarizeDirectMarineBiologicalObservation({
        observationKind: "occurrence-record",
        taxonName: "Example pelagic taxon",
        dataMonth: { year: 2026, month: 3 },
        value: 1,
        nativeUnit: "records",
        source: BIOLOGICAL_SOURCE,
        geography: { kind: "point", label: "   " },
      })
    ).toMatchObject({
      status: "invalid",
      coverage: { reason: "invalid-geography" },
      observedValue: null,
    });
  });
});
