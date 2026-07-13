import {
  summarizeMarineCoverage,
  type MarineCoverageInput,
  type MarineCoverageSummary,
} from "./marineCoverage";
import {
  summarizeOceanConditions,
  type OceanConditionSummary,
  type SeaSurfaceTemperatureObservation,
} from "./oceanConditions";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * A provenance-first contract for presenting supplied SST alongside a direct
 * marine-biological record. SST remains a physical observation; biology is
 * present only when a caller supplies its own direct, cited record.
 */
export const COASTAL_OCEAN_OBSERVATION_SCHEMA =
  "roamingeye-coastal-ocean-observation/v1" as const;

export type DirectMarineBiologicalObservationKind =
  "organism-count" | "biomass-measurement" | "occurrence-record";

/** Geographic scope supplied by a direct biological source, never inferred from SST. */
export interface DirectMarineBiologicalObservationGeography {
  kind: "point" | "boundary" | "area" | "unknown";
  /** Source-supplied place or geometry label; null makes unavailable explicit. */
  label: string | null;
}

export interface DirectMarineBiologicalObservationInput {
  /** The supplied record type; it is never inferred from SST. */
  observationKind: DirectMarineBiologicalObservationKind;
  /** Taxon label exactly as supplied by the biological source. */
  taxonName: string;
  /** Calendar month represented by the direct biological record. */
  dataMonth: YearMonth;
  /** Value in `nativeUnit`; null retains an unavailable source value. */
  value: number | null;
  /** Native unit from the biological source; never converted here. */
  nativeUnit: string;
  /** Citation for the direct biological source, distinct from the SST source. */
  source: DatasetRef;
  /** Usable share of the supplied biological survey or sampling footprint. */
  validFraction?: number;
  /** Geographic scope from the biological source, when it was supplied. */
  geography?: DirectMarineBiologicalObservationGeography | null;
}

export interface CoastalOceanObservationInput {
  /** Supplied monthly MODIS/Aqua SST observation. */
  sst: SeaSurfaceTemperatureObservation;
  /** Supplied spatial coverage metadata for the SST source image. */
  sstCoverage: MarineCoverageInput;
  /** An optional direct biological record; SST never fills this field. */
  biologicalObservation?: DirectMarineBiologicalObservationInput | null;
}

export type DirectMarineBiologicalObservationStatus =
  "observed" | "no-data" | "invalid";

export type DirectMarineBiologicalObservationReason =
  | "invalid-month"
  | "invalid-coverage"
  | "invalid-observation-kind"
  | "missing-taxon-name"
  | "missing-native-unit"
  | "incomplete-source-citation"
  | "invalid-geography"
  | "missing-value"
  | "zero-biological-coverage"
  | "invalid-value"
  | null;

export interface DirectMarineBiologicalObservationSummary {
  kind: "direct-marine-biological-observation";
  biologicalObservation: true;
  isForecast: false;
  status: DirectMarineBiologicalObservationStatus;
  observationKind: DirectMarineBiologicalObservationKind;
  taxonName: string;
  dataMonth: YearMonth;
  source: DatasetRef;
  nativeUnit: string;
  /** Retained direct-source geography; never substituted from SST. */
  geography: DirectMarineBiologicalObservationGeography | null;
  coverage: {
    /** Null means biological sampling coverage was not supplied. */
    validFraction: number | null;
    reason: DirectMarineBiologicalObservationReason;
  };
  /** Retained in `nativeUnit`; null whenever the direct record is unusable. */
  observedValue: number | null;
}

export interface NoDirectMarineBiologicalObservationSummary {
  kind: "no-direct-marine-biological-observation-supplied";
  biologicalObservation: false;
  isForecast: false;
  status: "not-supplied";
  observationKind: null;
  taxonName: null;
  dataMonth: null;
  source: null;
  nativeUnit: null;
  geography: null;
  coverage: { validFraction: null; reason: "not-supplied" };
  observedValue: null;
}

export type MarineBiologicalObservationSummary =
  | DirectMarineBiologicalObservationSummary
  | NoDirectMarineBiologicalObservationSummary;

export type ObservationMonthAlignment =
  | "same-data-month"
  | "different-data-month"
  | "invalid-data-month"
  | "not-applicable";

export interface CoastalOceanObservation {
  schema: typeof COASTAL_OCEAN_OBSERVATION_SCHEMA;
  kind: "coastal-ocean-observation";
  isForecast: false;
  claimScope: "separate-sst-and-direct-biological-observations-only";
  sst: OceanConditionSummary;
  sstCoverage: MarineCoverageSummary;
  biology: MarineBiologicalObservationSummary;
  dataMonthAlignment: {
    /** Whether the SST value and its supplied image coverage cite one month. */
    sstAndCoverage: Exclude<ObservationMonthAlignment, "not-applicable">;
    /** A matching month is temporal metadata, not evidence of a relationship. */
    sstAndBiology: ObservationMonthAlignment;
  };
  limitations: typeof COASTAL_OCEAN_OBSERVATION_LIMITATIONS;
}

export const COASTAL_OCEAN_OBSERVATION_LIMITATIONS = [
  "Sea surface temperature is a physical SST observation, not a marine-biological observation.",
  "Biological values appear only in supplied direct records with their own source, native unit, month, and sampling coverage.",
  "SST image coverage and biological sampling coverage use separate methods and are not interchangeable.",
  "Matching data months describes timing only; it does not establish association, causation, ecological condition, or a forecast.",
] as const;

/**
 * Assemble independent SST, SST-coverage, and direct-biology records without
 * merging their values or provenance into a biological interpretation.
 */
export function createCoastalOceanObservation(
  input: CoastalOceanObservationInput
): CoastalOceanObservation {
  const sst = summarizeOceanConditions(input.sst);
  const sstCoverage = summarizeMarineCoverage(input.sstCoverage);
  const biology = summarizeDirectMarineBiologicalObservation(
    input.biologicalObservation ?? null
  );

  return {
    schema: COASTAL_OCEAN_OBSERVATION_SCHEMA,
    kind: "coastal-ocean-observation",
    isForecast: false,
    claimScope: "separate-sst-and-direct-biological-observations-only",
    sst,
    sstCoverage,
    biology,
    dataMonthAlignment: {
      sstAndCoverage: alignMonths(
        input.sst.dataMonth,
        input.sstCoverage.dataMonth
      ),
      sstAndBiology:
        biology.biologicalObservation === false
          ? "not-applicable"
          : alignMonths(input.sst.dataMonth, biology.dataMonth),
    },
    limitations: COASTAL_OCEAN_OBSERVATION_LIMITATIONS,
  };
}

export function summarizeDirectMarineBiologicalObservation(
  input: DirectMarineBiologicalObservationInput | null
): MarineBiologicalObservationSummary {
  if (input === null) return noDirectMarineBiologicalObservation();

  const validFraction = input.validFraction;
  const base = {
    kind: "direct-marine-biological-observation" as const,
    biologicalObservation: true as const,
    isForecast: false as const,
    observationKind: input.observationKind,
    taxonName: input.taxonName,
    dataMonth: input.dataMonth,
    source: input.source,
    nativeUnit: input.nativeUnit,
    geography: input.geography ?? null,
  };

  if (!isYearMonth(input.dataMonth)) {
    return invalidBiologicalObservation(base, null, "invalid-month");
  }
  if (
    validFraction !== undefined &&
    (!Number.isFinite(validFraction) || validFraction < 0 || validFraction > 1)
  ) {
    return invalidBiologicalObservation(base, null, "invalid-coverage");
  }
  if (!isObservationKind(input.observationKind)) {
    return invalidBiologicalObservation(
      base,
      validFraction ?? null,
      "invalid-observation-kind"
    );
  }
  if (!input.taxonName.trim()) {
    return invalidBiologicalObservation(
      base,
      validFraction ?? null,
      "missing-taxon-name"
    );
  }
  if (!input.nativeUnit.trim()) {
    return invalidBiologicalObservation(
      base,
      validFraction ?? null,
      "missing-native-unit"
    );
  }
  if (!hasCitation(input.source)) {
    return invalidBiologicalObservation(
      base,
      validFraction ?? null,
      "incomplete-source-citation"
    );
  }
  if (input.geography !== undefined && !isGeography(input.geography)) {
    return invalidBiologicalObservation(
      base,
      validFraction ?? null,
      "invalid-geography"
    );
  }
  if (input.value === null) {
    return noDataBiologicalObservation(
      base,
      validFraction ?? null,
      "missing-value"
    );
  }
  if (validFraction === 0) {
    return noDataBiologicalObservation(base, 0, "zero-biological-coverage");
  }
  if (!Number.isFinite(input.value) || input.value < 0) {
    return invalidBiologicalObservation(
      base,
      validFraction ?? null,
      "invalid-value"
    );
  }

  return {
    ...base,
    status: "observed",
    coverage: { validFraction: validFraction ?? null, reason: null },
    observedValue: input.value,
  };
}

function noDirectMarineBiologicalObservation(): NoDirectMarineBiologicalObservationSummary {
  return {
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
  };
}

function invalidBiologicalObservation(
  base: Omit<
    DirectMarineBiologicalObservationSummary,
    "status" | "coverage" | "observedValue"
  >,
  validFraction: number | null,
  reason: Exclude<
    DirectMarineBiologicalObservationReason,
    "missing-value" | "zero-biological-coverage" | null
  >
): DirectMarineBiologicalObservationSummary {
  return {
    ...base,
    status: "invalid",
    coverage: { validFraction, reason },
    observedValue: null,
  };
}

function noDataBiologicalObservation(
  base: Omit<
    DirectMarineBiologicalObservationSummary,
    "status" | "coverage" | "observedValue"
  >,
  validFraction: number | null,
  reason: Extract<
    DirectMarineBiologicalObservationReason,
    "missing-value" | "zero-biological-coverage"
  >
): DirectMarineBiologicalObservationSummary {
  return {
    ...base,
    status: "no-data",
    coverage: { validFraction, reason },
    observedValue: null,
  };
}

function alignMonths(
  first: YearMonth,
  second: YearMonth
): Exclude<ObservationMonthAlignment, "not-applicable"> {
  if (!isYearMonth(first) || !isYearMonth(second)) {
    return "invalid-data-month";
  }
  return first.year === second.year && first.month === second.month
    ? "same-data-month"
    : "different-data-month";
}

function isObservationKind(
  value: DirectMarineBiologicalObservationKind
): boolean {
  return [
    "organism-count",
    "biomass-measurement",
    "occurrence-record",
  ].includes(value);
}

function hasCitation(source: DatasetRef): boolean {
  return [source.shortName, source.version, source.doi, source.title].every(
    (field) => field.trim().length > 0
  );
}

function isGeography(
  geography: DirectMarineBiologicalObservationGeography | null
): boolean {
  if (geography === null) return true;
  return (
    ["point", "boundary", "area", "unknown"].includes(geography.kind) &&
    (geography.label === null || geography.label.trim().length > 0)
  );
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
