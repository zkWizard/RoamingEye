import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first EOSDIS processing-level descriptor for a multi-signal
 * environment brief.
 *
 * NASA classifies every Earth-science data product on a standard processing
 * ladder (EOSDIS Data Processing Levels, L0–L4): higher levels sit further from
 * the raw instrument, with more algorithmic processing, gridding, or modeling
 * between the sensor and the reported value.
 *
 *  - L1–L2: reconstructed or per-retrieval instrument data.
 *  - L3: geophysical variables mapped onto a uniform space-time grid.
 *  - L4: variables from a model or analysis of lower-level data — quantities
 *    that are not directly measured by any single instrument.
 *
 * The brief's four products span two of these tiers:
 *
 *  - NDVI (MOD13A3) is a **Level-3** gridded monthly vegetation index.
 *  - Rainfall and soil moisture (GLDAS_NOAH025_M) are **Level-4** land-surface
 *    model output.
 *  - Air temperature (M2TMNXSLV) is a **Level-4** atmospheric reanalysis field.
 *
 * METHODS.md §8 already notes the tool does not replace "the underlying L3/L4
 * granules" — this module makes that L3/L4 split checkable per signal instead of
 * leaving it to prose, so a reader placing an L3 gridded index next to L4 model
 * output can see the two sit at different processing tiers.
 *
 * This is a companion axis to observation modality (`observationModality.ts`),
 * not a duplicate: modality asks HOW a value is produced (remote-sensing index
 * vs land-surface model vs reanalysis); processing level asks HOW FAR from the
 * raw sensor the value sits on NASA's standard 0–4 ladder. The two partition the
 * products differently — modality separates the two model products, processing
 * level groups them as L4 and separates the L3 index.
 *
 * Processing level is a **position on a processing ladder, not a quality
 * judgement**: a higher level is neither better nor worse data. This helper
 * reports provenance structure only; it never combines the values, weights them,
 * ranks them, or infers any condition, fitness, risk, causation, or forecast —
 * the shared method limits of the brief still hold.
 */

export type ProcessingLevel =
  /** Level-3: geophysical variables on a uniform space-time grid. */
  | "L3"
  /** Level-4: model or analysis output; not directly instrument-measured. */
  | "L4"
  /** Product absent from the processing-level table; never guessed. */
  | "unclassified";

interface ProcessingLevelInfo {
  /** Short human phrase for a statement, e.g. "gridded Level-3 product". */
  description: string;
  /** Numeric rung on the 0–4 ladder; null when the level is not asserted. */
  numeric: number | null;
}

const LEVEL_INFO: Record<ProcessingLevel, ProcessingLevelInfo> = {
  L3: {
    description: "gridded Level-3 product",
    numeric: 3,
  },
  L4: {
    description: "Level-4 model or analysis output",
    numeric: 4,
  },
  unclassified: {
    description: "unclassified processing level",
    numeric: null,
  },
};

/**
 * EOSDIS processing level keyed by the cited product's short name. Processing
 * level is a fixed, published property of a product (NASA/GES DISC state it on
 * each dataset's landing page), so this table is the single place each brief
 * product's level is asserted. A product not listed resolves to `unclassified` —
 * its level is never inferred from a value or a modality.
 */
const PRODUCT_PROCESSING_LEVEL: Record<string, ProcessingLevel> = {
  // MODIS/Terra Vegetation Indices Monthly L3 Global 1 km (NDVI/EVI).
  MOD13A3: "L3",
  // GLDAS Noah Land Surface Model L4 monthly (precipitation, soil moisture).
  GLDAS_NOAH025_M: "L4",
  // MERRA-2 monthly single-level diagnostics — reanalysis, processing level 4.
  M2TMNXSLV: "L4",
};

/** One signal classified by the processing level of its cited product. */
export interface SignalProcessingLevel {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  level: ProcessingLevel;
  /** Numeric rung (3 or 4); null for an unclassified product. */
  numericLevel: number | null;
  /**
   * True when the value is Level-4 model or analysis output — a quantity not
   * directly measured by an instrument. False for L3 and for unclassified
   * products (whose level, and so basis, is not asserted). This flags the
   * processing tier, not measurement independence — see `observationModality.ts`.
   */
  modelOrAnalysisOutput: boolean;
  /** Honest, source-carrying sentence; no fitness, condition, or value claim. */
  statement: string;
}

export interface ProcessingLevelSummary {
  kind: "processing-level";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal processing-level classifications, in signal order. */
  signals: SignalProcessingLevel[];
  /** Count of considered signals at each level (zeros included). */
  levelCounts: Record<ProcessingLevel, number>;
  /** Considered signals that are Level-4 model or analysis output. */
  levelFourCount: number;
  /** Considered signals whose product is not in the processing-level table. */
  unclassifiedCount: number;
  /** Distinct classified levels present (unclassified excluded). */
  distinctLevels: number;
  /** True when every considered signal shares one classified level. */
  homogeneous: boolean;
  /** True when the considered signals span more than one classified level. */
  spansMultipleLevels: boolean;
  /** Honest one-line processing-level statement; no condition or value inference. */
  statement: string;
  limits: string[];
}

export interface ProcessingLevelOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because processing level matters for the
   * evidence a reader would actually place side by side; "all" describes the
   * whole brief's processing tiers regardless of per-signal status.
   */
  include?: "available" | "all";
}

const PROCESSING_LEVEL_LIMITS = [
  "Processing level is a fixed property of the cited source product, not of any individual value.",
  "A higher level means more processing between the instrument and the value, not lower or higher data quality.",
  "Level-4 fields are model or analysis output, not directly instrument-measured; sharing a level is not measurement agreement.",
  "A product absent from the processing-level table is reported as unclassified, never inferred from its value.",
];

/**
 * Look up a product's EOSDIS processing level by its short name, returning
 * "unclassified" for any product not in the table so a level is never silently
 * invented for an unknown source.
 */
export function classifyProcessingLevel(source: DatasetRef): ProcessingLevel {
  return PRODUCT_PROCESSING_LEVEL[source.shortName] ?? "unclassified";
}

/**
 * Classify each brief signal by the processing level of its cited product and
 * report whether the considered signals sit at one tier or span multiple. A
 * brief that mixes an L3 gridded index (NDVI) with L4 model output (GLDAS,
 * MERRA-2) is combining products at different distances from the raw sensor, and
 * this makes that explicit without touching the values themselves.
 */
export function summarizeProcessingLevel(
  signals: readonly EnvironmentSignalBrief[],
  options?: ProcessingLevelOptions
): ProcessingLevelSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalProcessingLevel[] = considered.map((signal) => {
    const level = classifyProcessingLevel(signal.source);
    const info = LEVEL_INFO[level];
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      level,
      numericLevel: info.numeric,
      modelOrAnalysisOutput: level === "L4",
      statement: `${signal.label}: ${info.description} (${level}); source ${sourceLabel(signal.source)}.`,
    };
  });

  const levelCounts = countLevels(classified);
  const levelFourCount = levelCounts.L4;
  const unclassifiedCount = levelCounts.unclassified;
  const distinctLevels = CLASSIFIED_LEVELS.filter(
    (level) => levelCounts[level] > 0
  ).length;

  return {
    kind: "processing-level",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    levelCounts,
    levelFourCount,
    unclassifiedCount,
    distinctLevels,
    homogeneous: classified.length >= 1 && distinctLevels === 1,
    spansMultipleLevels: distinctLevels >= 2,
    statement: processingLevelStatement(
      classified.length,
      levelCounts,
      distinctLevels,
      unclassifiedCount
    ),
    limits: PROCESSING_LEVEL_LIMITS,
  };
}

/** Fixed level order for reporting, so no level is silently dropped. */
const LEVELS: readonly ProcessingLevel[] = ["L3", "L4", "unclassified"];

/** The classified (asserted) levels, excluding the unclassified fallback. */
const CLASSIFIED_LEVELS: readonly ProcessingLevel[] = ["L3", "L4"];

function countLevels(
  signals: readonly SignalProcessingLevel[]
): Record<ProcessingLevel, number> {
  const counts = Object.fromEntries(
    LEVELS.map((level) => [level, 0])
  ) as Record<ProcessingLevel, number>;
  for (const signal of signals) counts[signal.level] += 1;
  return counts;
}

function processingLevelStatement(
  consideredCount: number,
  levelCounts: Record<ProcessingLevel, number>,
  distinctLevels: number,
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by processing level.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = levelBreakdown(levelCounts);
  const classifiedCount = consideredCount - unclassifiedCount;

  let tierClause: string;
  if (classifiedCount === 0) {
    tierClause =
      "no considered signal is in the processing-level table, so their tier is not asserted";
  } else if (distinctLevels === 1) {
    tierClause = "all classified signals share one processing level";
  } else {
    tierClause =
      "classified signals span more than one processing level — they sit at different distances from the raw sensor and should not be read as equally direct";
  }

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified product${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} usable ${noun}: ${breakdown}; ${tierClause}.${unclassifiedClause}`;
}

/** Non-zero level counts in fixed order, e.g. "1 L3, 3 L4". */
function levelBreakdown(levelCounts: Record<ProcessingLevel, number>): string {
  return LEVELS.filter((level) => levelCounts[level] > 0)
    .map((level) => `${levelCounts[level]} ${level}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
