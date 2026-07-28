import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef, LayerId } from "./timeline";

/**
 * Provenance-first *level-of-measurement* (measurement-scale) descriptor for a
 * multi-signal environment brief.
 *
 * The brief renders each signal's value as a plain number — "Vegetation (NDVI):
 * 0.61", "2 m air temperature: 289.4 K" — which invites a reader to do the same
 * arithmetic on all of them: differences, means, and especially *ratios* and
 * *percentage changes* ("vegetation is 20% higher", "rainfall doubled"). But
 * which of those operations is even defined depends on each value's measurement
 * scale (Stevens' level of measurement), a property of the quantity and its
 * reported unit — not of the number itself:
 *
 *  - Rainfall (precipitation rate, kg/m²/s), soil moisture (kg/m²), and 2 m air
 *    temperature reported in kelvin (K) are on **ratio** scales: they have a
 *    true, absolute zero (no precipitation, no water column, absolute zero
 *    thermal energy), so ratios and percentage changes are meaningful — "twice
 *    as much rainfall" is a well-defined statement.
 *  - NDVI is a dimensionless **bounded index** in [-1, 1]. Its zero is not an
 *    origin (NDVI = 0 means red ≈ near-infrared reflectance, not "no
 *    vegetation"), so ratios and percentage changes of NDVI are not meaningful;
 *    only ordering and, with care, differences are.
 *
 * A subtlety this descriptor keeps honest: air temperature is ratio-scaled only
 * *because the brief reports it in kelvin*. The identical quantity in °C (or °F)
 * is an **interval** scale — its zero is a convention, so a temperature
 * "percentage change" is meaningless. The classification is therefore derived
 * from each signal's reported native unit, not assumed from the quantity.
 *
 * This helper classifies each brief signal's scale and reports, per signal,
 * whether difference and ratio arithmetic are valid, plus whether the whole
 * considered set is uniformly ratio-scaled (so a blanket percentage-change
 * treatment across the brief would be sound). It reports the algebraic
 * structure of the values already carried by each signal; it never combines,
 * converts, rescales, or ranks the values, and makes no condition, risk,
 * causation, or forecast claim — the brief's shared method limits still hold.
 *
 * It is deliberately distinct from — and composes with — the brief's other
 * separation-of-signals descriptors, which each encode a different reason two
 * values must not be casually combined:
 *   - unit commensurability (`unitCommensurability.ts`) → do two signals share a
 *     *dimension/unit* at all? (a cross-signal question)
 *   - quantity kind (`quantityKind.ts`) → is a value a time-integrable *flux* or
 *     a stored *state*? (its kinematic nature)
 *   - measurement scale (this module) → for one signal's own values, what
 *     *arithmetic* (difference vs ratio/percent-change) is even defined? (its
 *     algebraic structure)
 * Two signals can share neither unit nor scale, or share a scale while differing
 * in unit (precipitation rate and soil moisture are both ratio-scaled yet
 * dimensionally incommensurable), so scale is a genuinely separate axis.
 */

export type MeasurementScale =
  /**
   * Absolute (true) zero: both differences and ratios/percentage changes are
   * meaningful (precipitation rate, soil moisture, air temperature in kelvin).
   */
  | "ratio"
  /**
   * Meaningful differences but an arbitrary, conventional zero, so
   * ratios/percentage changes are NOT meaningful (temperature in °C or °F).
   */
  | "interval"
  /**
   * Dimensionless normalized index on a fixed range with no origin for ratios;
   * ordering and (with care) differences are meaningful, ratios are not (NDVI).
   */
  | "bounded-index"
  /**
   * Signal not in the scale table, or a temperature in an unrecognized unit;
   * the scale is never guessed, so no arithmetic is asserted for it.
   */
  | "unclassified";

interface ScaleInfo {
  /** Short human phrase for a statement, e.g. "ratio scale". */
  description: string;
  /** True when the value has a true zero, so ratios/percent-change are valid. */
  ratioMeaningful: boolean;
  /**
   * True when differences of two values are meaningful. Holds for ratio and
   * interval scales and for a bounded index; false only for `unclassified`,
   * whose structure is not asserted.
   */
  differenceMeaningful: boolean;
}

const SCALE_INFO: Record<MeasurementScale, ScaleInfo> = {
  ratio: {
    description: "ratio scale (true zero)",
    ratioMeaningful: true,
    differenceMeaningful: true,
  },
  interval: {
    description: "interval scale (conventional zero)",
    ratioMeaningful: false,
    differenceMeaningful: true,
  },
  "bounded-index": {
    description: "bounded normalized index (no ratio origin)",
    ratioMeaningful: false,
    differenceMeaningful: true,
  },
  unclassified: {
    description: "unclassified scale",
    ratioMeaningful: false,
    differenceMeaningful: false,
  },
};

/**
 * Temperature units with an absolute zero (ratio-scaled). The brief reports 2 m
 * air temperature in kelvin, so temperature is ratio-scaled here; the identical
 * quantity in a relative unit (°C/°F) would be interval-scaled, which is why the
 * scale is read from the unit rather than assumed from the "temperature" layer.
 */
const ABSOLUTE_TEMPERATURE_UNITS: ReadonlySet<string> = new Set([
  "K",
  "kelvin",
  "°R",
  "R",
  "rankine",
]);

/** Temperature units whose zero is a convention (interval-scaled). */
const RELATIVE_TEMPERATURE_UNITS: ReadonlySet<string> = new Set([
  "°C",
  "C",
  "degC",
  "celsius",
  "°F",
  "F",
  "degF",
  "fahrenheit",
]);

/**
 * Classify a signal's measurement scale from its layer and reported native
 * unit. NDVI is a bounded normalized index; the precipitation-rate and
 * soil-moisture mass fluxes/states have true zeros (ratio); temperature's scale
 * is unit-dependent — ratio in an absolute unit (kelvin), interval in a relative
 * one (°C/°F). Anything else — an unexpected layer, or a temperature in an
 * unrecognized unit — resolves to `unclassified` so a scale is never invented.
 */
export function classifyMeasurementScale(
  layerId: LayerId,
  nativeUnit: string
): MeasurementScale {
  switch (layerId) {
    case "ndvi":
      return "bounded-index";
    case "precip":
    case "soil":
      return "ratio";
    case "airtemp":
      return temperatureScale(nativeUnit);
    default:
      return "unclassified";
  }
}

function temperatureScale(nativeUnit: string): MeasurementScale {
  const unit = nativeUnit.trim();
  if (ABSOLUTE_TEMPERATURE_UNITS.has(unit)) return "ratio";
  if (RELATIVE_TEMPERATURE_UNITS.has(unit)) return "interval";
  return "unclassified";
}

/** One signal classified by the level of measurement of its reported values. */
export interface SignalMeasurementScale {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  /** The signal's reported native unit, carried so the scale is auditable. */
  nativeUnit: string;
  scale: MeasurementScale;
  /** True when ratios/percentage changes of this signal's values are valid. */
  ratioMeaningful: boolean;
  /** True when differences of this signal's values are meaningful. */
  differenceMeaningful: boolean;
  /** Honest, source-carrying sentence; no fitness, condition, or value claim. */
  statement: string;
}

export interface MeasurementScaleSummary {
  kind: "measurement-scale";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal scale classifications, in signal order. */
  signals: SignalMeasurementScale[];
  /** Count of considered signals in each scale (zeros included). */
  scaleCounts: Record<MeasurementScale, number>;
  /** Considered signals whose scale is not asserted. */
  unclassifiedCount: number;
  /** Ids of considered signals whose values admit ratio/percent-change, in order. */
  ratioScaledSignalIds: EnvironmentSignalId[];
  /**
   * True only when at least one signal is classified and *every* classified
   * considered signal is ratio-scaled, so a blanket percentage-change or ratio
   * treatment across the considered signals is algebraically sound. False as
   * soon as any classified signal is interval or a bounded index — the case NDVI
   * introduces, since a percentage change of NDVI is not meaningful.
   */
  uniformlyRatioScaled: boolean;
  /** Honest one-line scale statement; no condition or value inference. */
  statement: string;
  limits: string[];
}

export interface MeasurementScaleOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because the scale matters for the values a
   * reader would actually do arithmetic on; "all" describes the whole brief's
   * scale basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const SCALE_LIMITS = [
  "Measurement scale is a property of the quantity and its reported unit, not of any individual value.",
  "Ratio-scaled values (true zero) admit differences and ratios/percentage changes; interval-scaled values (conventional zero) admit differences but not ratios; a bounded index admits ordering and differences but not ratios.",
  "Air temperature is ratio-scaled only when reported in kelvin; the same quantity in °C or °F would be interval-scaled and would not admit a percentage change.",
  "A signal whose scale is not in the table (or a temperature in an unrecognized unit) is reported as unclassified, never inferred from its value.",
];

/** Fixed scale order for reporting, so no scale is silently dropped. */
const SCALES: readonly MeasurementScale[] = [
  "ratio",
  "interval",
  "bounded-index",
  "unclassified",
];

/**
 * Classify each brief signal by its level of measurement, and report which
 * signals admit ratio/percentage-change arithmetic and whether the whole
 * considered set is uniformly ratio-scaled. This makes explicit that a
 * percentage change is a valid statement for rainfall, soil moisture, and
 * air temperature in kelvin, but not for NDVI — without touching the values.
 */
export function summarizeMeasurementScale(
  signals: readonly EnvironmentSignalBrief[],
  options?: MeasurementScaleOptions
): MeasurementScaleSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalMeasurementScale[] = considered.map((signal) => {
    const scale = classifyMeasurementScale(signal.layerId, signal.nativeUnit);
    const info = SCALE_INFO[scale];
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      nativeUnit: signal.nativeUnit,
      scale,
      ratioMeaningful: info.ratioMeaningful,
      differenceMeaningful: info.differenceMeaningful,
      statement: `${signal.label}: ${info.description}, unit ${signal.nativeUnit} (${scale}); ${arithmeticClause(info)}; source ${sourceLabel(signal.source)}.`,
    };
  });

  const scaleCounts = countScales(classified);
  const unclassifiedCount = scaleCounts.unclassified;
  const classifiedCount = classified.length - unclassifiedCount;
  const ratioScaled = classified.filter((s) => s.scale === "ratio");

  return {
    kind: "measurement-scale",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    scaleCounts,
    unclassifiedCount,
    ratioScaledSignalIds: ratioScaled.map((s) => s.id),
    uniformlyRatioScaled:
      classifiedCount >= 1 && ratioScaled.length === classifiedCount,
    statement: scaleStatement(
      classified.length,
      scaleCounts,
      classifiedCount,
      ratioScaled.length,
      unclassifiedCount
    ),
    limits: SCALE_LIMITS,
  };
}

function arithmeticClause(info: ScaleInfo): string {
  if (info.ratioMeaningful)
    return "differences and ratios/percentage changes valid";
  if (info.differenceMeaningful)
    return "differences valid, ratios/percentage changes not";
  return "arithmetic not asserted";
}

function countScales(
  signals: readonly SignalMeasurementScale[]
): Record<MeasurementScale, number> {
  const counts = Object.fromEntries(
    SCALES.map((scale) => [scale, 0])
  ) as Record<MeasurementScale, number>;
  for (const signal of signals) counts[signal.scale] += 1;
  return counts;
}

function scaleStatement(
  consideredCount: number,
  scaleCounts: Record<MeasurementScale, number>,
  classifiedCount: number,
  ratioCount: number,
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by measurement scale.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = scaleBreakdown(scaleCounts);

  let ratioClause: string;
  if (classifiedCount === 0) {
    ratioClause =
      "no considered signal has an asserted scale, so which arithmetic is valid is not stated";
  } else if (ratioCount === classifiedCount) {
    const verb = classifiedCount === 1 ? "is" : "are";
    ratioClause = `all ${classifiedCount} classified ${verb} ratio-scaled, so differences and ratios/percentage changes are valid for each`;
  } else if (ratioCount === 0) {
    ratioClause =
      "no classified signal is ratio-scaled, so ratios/percentage changes are not valid for any — only differences";
  } else {
    ratioClause = `${ratioCount} of ${classifiedCount} classified ${ratioCount === 1 ? "is" : "are"} ratio-scaled (ratios/percentage changes valid); the rest admit differences only, so a blanket percentage change across signals is not valid`;
  }

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified signal${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} usable ${noun}: ${breakdown}; ${ratioClause}.${unclassifiedClause}`;
}

/** Non-zero scale counts in fixed order, e.g. "3 ratio, 1 bounded-index". */
function scaleBreakdown(scaleCounts: Record<MeasurementScale, number>): string {
  return SCALES.filter((scale) => scaleCounts[scale] > 0)
    .map((scale) => `${scaleCounts[scale]} ${scale}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
