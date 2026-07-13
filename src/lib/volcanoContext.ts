import { lastEruptionLabel, type Volcano } from "./volcanoes";

/**
 * Source-limited context for a selected GVP volcano marker.
 *
 * These helpers report only fields already retained from Smithsonian GVP
 * Volcanoes of the World. They do not forecast eruptions, rank hazards, score
 * risk, or infer volcanic causes from nearby observations.
 */

export const GVP_VOLCANO_SOURCE = {
  name: "Volcanoes of the World",
  org: "Smithsonian Institution Global Volcanism Program",
  url: "https://volcano.si.edu/",
  preparedBy: "scripts/prepare-data.mjs",
  localFile: "public/data/volcanoes.json",
} as const;

export const VOLCANO_CONTEXT_UNITS = {
  coordinates: "decimal degrees",
  elevation: "metres relative to sea level",
  lastEruptionYear: "calendar year; negative values are BCE",
} as const;

export type VolcanoFactField =
  | "name"
  | "country"
  | "coordinates"
  | "primaryType"
  | "elevationMeters"
  | "lastEruptionYear";

export interface VolcanoSelection {
  /** Exact volcano name as supplied by the GVP-derived local file. */
  name: string;
  /** Optional country/region string for disambiguating repeated names. */
  country?: string | null;
}

export interface VolcanoSelectionOption {
  value: string;
  label: string;
  accessibleLabel: string;
  selection: VolcanoSelection;
}

export interface SelectedVolcanoFacts {
  name: string;
  country: string | null;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  primaryType: string | null;
  elevationMeters: number | null;
  lastEruptionYear: number | null;
  lastEruptionText: string;
}

export type VolcanoContextStatus = "selected" | "not-found" | "ambiguous";

export interface VolcanoContextCoverage {
  status: VolcanoContextStatus;
  suppliedRecordCount: number;
  matchedRecordCount: number;
  presentFields: VolcanoFactField[];
  missingFields: VolcanoFactField[];
}

export interface VolcanoContext {
  kind: "gvp-selected-volcano-context";
  isForecast: false;
  selection: VolcanoSelection;
  selected: SelectedVolcanoFacts | null;
  coverage: VolcanoContextCoverage;
  provenance: typeof GVP_VOLCANO_SOURCE;
  units: typeof VOLCANO_CONTEXT_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only the supplied, locally bundled GVP-derived volcano records.",
  "Does not forecast eruptions, rank hazards, score risk, or infer causes.",
] as const;

export function volcanoSelectionOptions(
  volcanoes: readonly Volcano[]
): VolcanoSelectionOption[] {
  return volcanoes.map((volcano) => {
    const selection = { name: volcano.name, country: volcano.country };
    return {
      value: selectionValue(volcano),
      label: displayName(volcano),
      accessibleLabel: accessibleSelectionLabel(volcano),
      selection,
    };
  });
}

export function selectedVolcanoContext(
  volcanoes: readonly Volcano[],
  selection: VolcanoSelection
): VolcanoContext {
  const normalizedName = normalize(selection.name);
  const normalizedCountry =
    selection.country === undefined || selection.country === null
      ? null
      : normalize(selection.country);
  const matches = volcanoes.filter(
    (volcano) =>
      normalize(volcano.name) === normalizedName &&
      (normalizedCountry === null ||
        normalize(volcano.country ?? "") === normalizedCountry)
  );
  const selected = matches.length === 1 ? factsFor(matches[0]) : null;

  return {
    kind: "gvp-selected-volcano-context",
    isForecast: false,
    selection: {
      name: selection.name,
      country: selection.country ?? null,
    },
    selected,
    coverage: {
      status:
        matches.length === 0
          ? "not-found"
          : matches.length === 1
            ? "selected"
            : "ambiguous",
      suppliedRecordCount: volcanoes.length,
      matchedRecordCount: matches.length,
      presentFields: selected ? presentFields(selected) : [],
      missingFields: selected ? missingFields(selected) : [],
    },
    provenance: GVP_VOLCANO_SOURCE,
    units: VOLCANO_CONTEXT_UNITS,
    limitations: LIMITATIONS,
  };
}

function factsFor(volcano: Volcano): SelectedVolcanoFacts {
  return {
    name: volcano.name,
    country: volcano.country,
    coordinates: {
      latitude: volcano.lat,
      longitude: volcano.lon,
    },
    primaryType: volcano.type,
    elevationMeters: volcano.elevation,
    lastEruptionYear: volcano.lastEruptionYear,
    lastEruptionText: lastEruptionLabel(volcano.lastEruptionYear),
  };
}

function presentFields(facts: SelectedVolcanoFacts): VolcanoFactField[] {
  return factFields.filter((field) => hasField(facts, field));
}

function missingFields(facts: SelectedVolcanoFacts): VolcanoFactField[] {
  return factFields.filter((field) => !hasField(facts, field));
}

const factFields: VolcanoFactField[] = [
  "name",
  "country",
  "coordinates",
  "primaryType",
  "elevationMeters",
  "lastEruptionYear",
];

function hasField(
  facts: SelectedVolcanoFacts,
  field: VolcanoFactField
): boolean {
  switch (field) {
    case "name":
      return facts.name.length > 0;
    case "country":
      return facts.country !== null;
    case "coordinates":
      return (
        Number.isFinite(facts.coordinates.latitude) &&
        Number.isFinite(facts.coordinates.longitude)
      );
    case "primaryType":
      return facts.primaryType !== null;
    case "elevationMeters":
      return facts.elevationMeters !== null;
    case "lastEruptionYear":
      return facts.lastEruptionYear !== null;
  }
}

function displayName(volcano: Volcano): string {
  return volcano.country ? `${volcano.name}, ${volcano.country}` : volcano.name;
}

function accessibleSelectionLabel(volcano: Volcano): string {
  const parts = [displayName(volcano)];
  if (volcano.type) parts.push(volcano.type);
  if (volcano.elevation !== null) {
    parts.push(`${volcano.elevation} metres elevation`);
  }
  parts.push(lastEruptionLabel(volcano.lastEruptionYear));
  return parts.join("; ");
}

function selectionValue(volcano: Volcano): string {
  return [
    volcano.name,
    volcano.country ?? "",
    volcano.lat.toFixed(3),
    volcano.lon.toFixed(3),
  ].join("|");
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}
