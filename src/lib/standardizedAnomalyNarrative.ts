import type {
  AnomalyMagnitudeBand,
  StandardizedSeasonalAnomaly,
} from "./seasonalAnomalyContext";

/**
 * Accessible, provenance-tagged language for a standardized seasonal climate
 * anomaly (see seasonalAnomalyContext.ts).
 *
 * `standardizeSeasonalAnomaly` already produces the typed number — the target
 * month's departure from its same-calendar-month baseline expressed in multiples
 * of that baseline's year-to-year sample standard deviation. This helper turns
 * that record into an honest, screen-reader-friendly sentence for the place
 * panel without adding any new inference: it restates the standardized value,
 * its direction, and its descriptive magnitude band, and it reports every
 * withheld case (too few years, a flat baseline, an unpublished month, …)
 * plainly rather than as a number.
 *
 * Scientific honesty (kept in the copy because callers surface it):
 *  - The standardized value is a DESCRIPTIVE departure in standard-deviation
 *    multiples, NOT a probability, p-value, exceedance likelihood, significance
 *    test, or forecast.
 *  - The divisor is a *sample* standard deviation from a limited number of
 *    years and assumes no particular distribution.
 *  - Values stay in the source product's native unit; provenance is preserved.
 */

export interface StandardizedAnomalyNarrative {
  kind: "standardized-seasonal-anomaly-narrative";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Whether a standardized value was available to describe. */
  available: boolean;
  /** One-line summary suitable for a heading or screen-reader announcement. */
  headline: string;
  /** Fuller sentence with the raw anomaly, band, sample count, and framing. */
  detail: string;
  provenance: {
    metricLabel: string;
    /** Native unit of the raw anomaly; the standardized value is unitless. */
    nativeUnit: string;
    /** "SHORTNAME vVERSION — Title" for the cited source product. */
    sourceLabel: string;
    /** Resolvable DOI link for the cited source. */
    sourceUrl: string;
    /** Same-calendar-month years behind the baseline standard deviation. */
    baselineSampleCount: number;
  };
  limitations: readonly string[];
}

const LIMITATIONS = [
  "The standardized value is a descriptive departure in baseline standard-deviation multiples, not a probability, p-value, exceedance likelihood, or forecast.",
  "The divisor is a sample standard deviation from a limited number of same-calendar-month years and assumes no particular distribution.",
  "Raw departures stay in the source product's native unit; consult the cited product for measurement-grade analysis.",
] as const;

/**
 * Convert a standardized seasonal anomaly into honest UI copy while keeping the
 * metric label, native unit, baseline sample count, and citation available to
 * the caller. Withheld anomalies yield an explanatory sentence, never a number.
 */
export function describeStandardizedAnomaly(
  anomaly: StandardizedSeasonalAnomaly
): StandardizedAnomalyNarrative {
  const { metric, source } = anomaly;
  const sourceLabel = `${source.shortName} v${source.version} — ${source.title}`;
  const available = anomaly.status === "available";

  return {
    kind: "standardized-seasonal-anomaly-narrative",
    isForecast: false,
    available,
    headline: available ? availableHeadline(anomaly) : unavailableHeadline(),
    detail: available ? availableDetail(anomaly) : unavailableDetail(anomaly),
    provenance: {
      metricLabel: metric.label,
      nativeUnit: anomaly.anomalyUnit,
      sourceLabel,
      sourceUrl: `https://doi.org/${source.doi}`,
      baselineSampleCount: anomaly.baselineSampleCount,
    },
    limitations: LIMITATIONS,
  };
}

function availableHeadline(anomaly: StandardizedSeasonalAnomaly): string {
  const label = anomaly.metric.label;
  const z = anomaly.standardizedAnomaly!;
  const direction = anomaly.direction!;

  if (direction === "at") {
    return `${label} matched the same-calendar-month average`;
  }
  // A finite-but-tiny departure would round to "0.0 standard deviations", which
  // reads as no departure at all; state it qualitatively instead.
  if (Math.abs(z) < 0.05) {
    return `${label} sat marginally ${direction} the same-calendar-month average`;
  }
  const magnitude = formatMagnitude(Math.abs(z));
  const plural = magnitude === "1.0" ? "" : "s";
  return `${label} ran ${magnitude} baseline standard deviation${plural} ${direction} the same-calendar-month average`;
}

function availableDetail(anomaly: StandardizedSeasonalAnomaly): string {
  const rawAnomaly = formatSigned(anomaly.anomaly!);
  const signedZ = formatSigned(anomaly.standardizedAnomaly!);
  const count = anomaly.baselineSampleCount;
  const years = `${count} prior same-calendar-month observation${count === 1 ? "" : "s"}`;

  return (
    `The target month's value is ${rawAnomaly} ${anomaly.anomalyUnit} from the mean of ${years}, ` +
    `or ${signedZ} times that baseline's year-to-year sample standard deviation — ` +
    `${bandText(anomaly.magnitudeBand!)}. ` +
    `This is a descriptive standardized departure, not a probability, exceedance likelihood, or forecast.`
  );
}

function unavailableHeadline(): string {
  return "A standardized same-calendar-month anomaly is not available";
}

function unavailableDetail(anomaly: StandardizedSeasonalAnomaly): string {
  const base = `A standardized ${anomaly.metric.label} anomaly could not be formed: ${explainReason(anomaly.reason)}.`;
  // Some withheld cases (a flat baseline) still carry an auditable raw anomaly;
  // surface it honestly without standardizing it.
  if (anomaly.anomaly !== null && Number.isFinite(anomaly.anomaly)) {
    return `${base} The raw departure of ${formatSigned(anomaly.anomaly)} ${anomaly.anomalyUnit} from the baseline mean is retained for reference, but it cannot be expressed in standard-deviation multiples.`;
  }
  return base;
}

/**
 * Plain-language explanation for each machine-readable withholding reason
 * produced by the standardized-anomaly and seasonal-baseline paths. Unknown
 * reasons fall back to a generic sentence that still echoes the raw code so no
 * detail is silently lost.
 */
function explainReason(reason: string | null): string {
  switch (reason) {
    case "no-baseline-variability":
      return "the same-calendar-month baseline shows no year-to-year variability, so the departure cannot be divided by a zero spread";
    case "insufficient-baseline-spread":
      return "the baseline has too few years to estimate a year-to-year spread";
    case "too-few-same-calendar-month-samples":
      return "too few same-calendar-month observations were available to form a baseline";
    case "baseline-coverage-below-threshold":
      return "the available same-calendar-month observations did not meet the minimum spatial-coverage threshold";
    case "target-not-yet-published":
      return "the target month has not yet been published for this product";
    case "target-coverage-below-threshold":
      return "the target month did not meet the minimum spatial-coverage threshold";
    case "invalid-anomaly":
      return "the underlying anomaly was not a finite number";
    case "invalid-month":
    case "invalid-baseline-configuration":
      return "the requested months or baseline configuration were invalid";
    case null:
      return "no standardized value was produced";
    default:
      return `the comparison was withheld (${reason})`;
  }
}

function bandText(band: AnomalyMagnitudeBand): string {
  switch (band) {
    case "within-typical-spread":
      return "within the baseline's typical year-to-year spread (|z| < 1)";
    case "beyond-typical-spread":
      return "beyond the baseline's typical year-to-year spread (1 ≤ |z| < 2)";
    case "well-beyond-typical-spread":
      return "well beyond the baseline's typical year-to-year spread (|z| ≥ 2)";
  }
}

/** Fixed one-decimal magnitude for headline readability (e.g. "1.7"). */
function formatMagnitude(value: number): string {
  return value.toFixed(1);
}

/** Signed, precision-trimmed number for audit detail (e.g. "+3", "-0.0012"). */
function formatSigned(value: number): string {
  if (value === 0) return "0";
  const trimmed = Number(value.toPrecision(4));
  return trimmed > 0 ? `+${trimmed}` : `${trimmed}`;
}
