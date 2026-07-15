import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first measurement reference-frame descriptor for a multi-signal
 * environment brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature as
 * single monthly observations for one place. Every one of those values is an
 * *absolute* observation in its native unit — a measured NDVI index, a
 * precipitation rate, a soil-moisture mass, a 2 m air temperature in kelvin. None
 * is an *anomaly*: a departure from that place's climatological normal for the
 * month. The distinction is the single most common misreading of an
 * environmental value — a reader glances at 289 K and asks "is that warm for
 * here?", which is an above-/below-normal question the number cannot answer,
 * because the brief attaches no baseline period to compare it against.
 *
 * This helper makes the frame explicit and checkable. It classifies each signal
 * by its reference frame and reports, at the brief level, that the composed
 * values are absolute observations carrying no climatological baseline — so they
 * must not be read as departures from normal. It is forward-compatible: were an
 * anomaly product ever added to the brief, the registry would carry `anomaly`
 * for it and the descriptor would flag the absolute/anomaly mix, since values on
 * the two frames are not directly comparable.
 *
 * It is deliberately distinct from — and composes with — the brief's other rigor
 * descriptors:
 *   - Quantity kind (`quantityKind.ts`) says whether a value is a flux, a state,
 *     or a dimensionless index (its kinematic nature, and whether it may be
 *     integrated over time). A flux and a state can both be absolute observations,
 *     so quantity kind does not answer the absolute-vs-anomaly question.
 *   - Unit commensurability (`unitCommensurability.ts`) groups by native unit; two
 *     values sharing a unit could still be one absolute and one anomaly, so units
 *     alone do not reveal the reference frame.
 *   - The per-signal anomaly modules (e.g. `phenologyStandardizedDeparture.ts`,
 *     `seasonalAnomalyContext.ts`) compute a departure from a multi-year series a
 *     single signal carries. The brief carries no such series — one monthly value
 *     per signal, no baseline — which is exactly the gap this descriptor states.
 *
 * It reports the frame only. It never combines the values, computes an anomaly,
 * attaches a baseline, or infers any condition, departure, causation, or
 * forecast — the brief's shared method limits still hold.
 */

export type MeasurementReferenceFrame =
  /** An absolute value in native units (a level, rate, or index), not a departure. */
  | "absolute-observation"
  /** A departure from a stated climatological baseline for the period. */
  | "anomaly"
  /** Signal absent from the reference-frame table; never guessed. */
  | "unclassified";

interface FrameInfo {
  /** Short human phrase for a statement, e.g. "absolute observation". */
  description: string;
  /** Parenthetical clarifying what the frame does and does not carry. */
  detail: string;
}

const FRAME_INFO: Record<MeasurementReferenceFrame, FrameInfo> = {
  "absolute-observation": {
    description: "absolute observation",
    detail:
      "a measured value in native units, not a departure from a climatological baseline",
  },
  anomaly: {
    description: "anomaly",
    detail: "a departure from a stated climatological baseline",
  },
  unclassified: {
    description: "reference frame not asserted",
    detail: "signal absent from the reference-frame table",
  },
};

/**
 * Reference frame keyed by the brief signal id. The frame is a property of what
 * the signal reports — an absolute value versus a departure from a normal — not
 * of the cited product, so it is asserted per signal here: this is the single
 * place each brief signal's frame is declared. Every current brief signal is an
 * absolute monthly observation; the brief holds one value per signal and no
 * baseline period, so none is an anomaly. A signal id absent from this table
 * resolves to `unclassified`; a frame is never inferred from a value or a unit.
 */
const SIGNAL_REFERENCE_FRAME: Record<
  EnvironmentSignalId,
  MeasurementReferenceFrame
> = {
  // NDVI: an absolute monthly index value, not a departure from a normal.
  vegetation: "absolute-observation",
  // Precipitation rate (kg/m²/s): an absolute monthly-mean rate.
  rainfall: "absolute-observation",
  // Soil-moisture storage (kg/m²): an absolute monthly level.
  "soil-moisture": "absolute-observation",
  // 2 m air temperature (K): an absolute monthly-mean level.
  "air-temperature": "absolute-observation",
};

/** One signal classified by the reference frame of the value it reports. */
export interface SignalReferenceFrame {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  referenceFrame: MeasurementReferenceFrame;
  /**
   * True only when the value is an absolute observation (a measured value in
   * native units). False for an anomaly and for an unclassified signal (whose
   * frame is not asserted).
   */
  isAbsolute: boolean;
  /** Honest, source-carrying sentence; no condition, value, or fitness claim. */
  statement: string;
}

export interface ReferenceFrameSummary {
  kind: "measurement-reference-frame";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal reference-frame classifications, in signal order. */
  signals: SignalReferenceFrame[];
  /** Count of considered signals in each frame (zeros included). */
  frameCounts: Record<MeasurementReferenceFrame, number>;
  /** Ids of considered signals reporting an absolute observation, in order. */
  absoluteSignalIds: EnvironmentSignalId[];
  /** Ids of considered signals reporting an anomaly, in order. */
  anomalySignalIds: EnvironmentSignalId[];
  /** Considered signals whose id is not in the reference-frame table. */
  unclassifiedCount: number;
  /** True when every considered signal shares one reference frame. */
  homogeneous: boolean;
  /**
   * True when the considered signals mix an absolute observation with an
   * anomaly — values on different reference frames that must not be compared
   * directly.
   */
  mixesAbsoluteAndAnomaly: boolean;
  /**
   * True when the considered set includes an absolute observation. The brief
   * attaches no climatological baseline, so an absolute value cannot be read as
   * above or below normal for the place or season; this flags that guard.
   */
  hasAbsoluteWithoutBaseline: boolean;
  /** Honest one-line reference-frame statement; no condition or value inference. */
  statement: string;
  limits: string[];
}

export interface ReferenceFrameOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because the frame matters for the values a
   * reader would actually try to interpret; "all" describes the whole brief's
   * reference-frame basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const REFERENCE_FRAME_LIMITS = [
  "Every brief value is an absolute observation in its native unit — a measured level, rate, or index — not an anomaly (a departure from a climatological normal).",
  "The brief holds one monthly value per signal and attaches no baseline period, so an absolute value cannot be read as above or below normal for the place or season.",
  "Reference frame is a property of the reported variable, not the cited product; it is distinct from quantity kind (flux/state/index) and from the native unit.",
  "Absolute and anomaly values are on different reference frames and must not be compared directly; a signal absent from the table is reported as unclassified, never inferred from its value or unit.",
];

/**
 * Look up a signal's reference frame by its brief id, returning "unclassified"
 * for any id not in the table so a frame is never silently invented for an
 * unknown signal.
 */
export function classifyReferenceFrame(
  id: EnvironmentSignalId
): MeasurementReferenceFrame {
  return SIGNAL_REFERENCE_FRAME[id] ?? "unclassified";
}

/**
 * Classify each brief signal by its measurement reference frame and report,
 * at the brief level, that the composed values are absolute observations
 * carrying no climatological baseline — so they must not be read as departures
 * from normal. This makes that explicit without touching the values themselves.
 */
export function summarizeReferenceFrames(
  signals: readonly EnvironmentSignalBrief[],
  options?: ReferenceFrameOptions
): ReferenceFrameSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalReferenceFrame[] = considered.map((signal) => {
    const referenceFrame = classifyReferenceFrame(signal.id);
    const info = FRAME_INFO[referenceFrame];
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      referenceFrame,
      isAbsolute: referenceFrame === "absolute-observation",
      statement: `${signal.label}: ${info.description} (${info.detail}); source ${sourceLabel(signal.source)}.`,
    };
  });

  const frameCounts = countFrames(classified);
  const absoluteSignalIds = classified
    .filter((s) => s.referenceFrame === "absolute-observation")
    .map((s) => s.id);
  const anomalySignalIds = classified
    .filter((s) => s.referenceFrame === "anomaly")
    .map((s) => s.id);
  const unclassifiedCount = frameCounts.unclassified;
  const distinctFrames = REFERENCE_FRAMES.filter(
    (frame) => frameCounts[frame] > 0
  ).length;

  return {
    kind: "measurement-reference-frame",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    frameCounts,
    absoluteSignalIds,
    anomalySignalIds,
    unclassifiedCount,
    homogeneous: classified.length >= 1 && distinctFrames === 1,
    mixesAbsoluteAndAnomaly:
      absoluteSignalIds.length > 0 && anomalySignalIds.length > 0,
    hasAbsoluteWithoutBaseline: absoluteSignalIds.length > 0,
    statement: referenceFrameStatement(
      classified.length,
      frameCounts,
      absoluteSignalIds,
      anomalySignalIds,
      unclassifiedCount
    ),
    limits: REFERENCE_FRAME_LIMITS,
  };
}

/** Fixed reference-frame order for reporting, so none is silently dropped. */
const REFERENCE_FRAMES: readonly MeasurementReferenceFrame[] = [
  "absolute-observation",
  "anomaly",
  "unclassified",
];

function countFrames(
  signals: readonly SignalReferenceFrame[]
): Record<MeasurementReferenceFrame, number> {
  const counts = Object.fromEntries(
    REFERENCE_FRAMES.map((frame) => [frame, 0])
  ) as Record<MeasurementReferenceFrame, number>;
  for (const signal of signals) counts[signal.referenceFrame] += 1;
  return counts;
}

function referenceFrameStatement(
  consideredCount: number,
  frameCounts: Record<MeasurementReferenceFrame, number>,
  absoluteSignalIds: EnvironmentSignalId[],
  anomalySignalIds: EnvironmentSignalId[],
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by measurement reference frame.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = frameBreakdown(frameCounts);
  const absoluteCount = absoluteSignalIds.length;
  const anomalyCount = anomalySignalIds.length;
  const classifiedCount = absoluteCount + anomalyCount;

  let frameClause: string;
  if (classifiedCount === 0) {
    frameClause =
      "no considered signal is in the reference-frame table, so their frame is not asserted";
  } else if (anomalyCount === 0) {
    frameClause =
      "all are absolute observations in native units; the brief attaches no climatological baseline, so a value cannot be read as above or below normal for the place or season";
  } else if (absoluteCount === 0) {
    frameClause =
      "all are anomalies (departures from a climatological baseline)";
  } else {
    frameClause = `${absoluteCount} absolute and ${anomalyCount} anomaly, on different reference frames that must not be compared directly`;
  }

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified signal${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} usable ${noun}: ${breakdown}; ${frameClause}.${unclassifiedClause}`;
}

/** Non-zero frame counts in fixed order, e.g. "4 absolute-observation". */
function frameBreakdown(
  frameCounts: Record<MeasurementReferenceFrame, number>
): string {
  return REFERENCE_FRAMES.filter((frame) => frameCounts[frame] > 0)
    .map((frame) => `${frameCounts[frame]} ${frame}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
