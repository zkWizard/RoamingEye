import {
  AEROSOL_SOURCE,
  AEROSOL_WAVELENGTH_NM,
  describeAerosolLoadingChange,
  type AerosolLoadingChange,
  type AerosolLoadingSummary,
} from "./aerosolLoading";
import { PROBE_SCALES, quantizationStep } from "./probe";
import { formatYm, type YearMonth } from "./timeline";

/**
 * A source-aware column-aerosol reading for the exact boundary returned by
 * place search.
 *
 * The atmosphere layer already renders MERRA-2 total aerosol optical thickness
 * at 550 nm, and `aerosolLoading` already describes a monthly value and its
 * month-over-month change. This module is the presentation seam between the
 * two: it turns one sampled boundary pair into the place panel's
 * value/detail shape without adding any inference of its own.
 *
 * It is deliberately separate from the terrestrial place metrics. Those are
 * surface quantities; AOD is a whole-column optical property from a reanalysis,
 * and the caveats that distinction forces are different enough that sharing a
 * formatter would blur them. Every reading therefore states, in the text the
 * user reads, that the value is modelled, column-integrated, and neither a
 * surface air-quality measurement nor a health index.
 */
export const AEROSOL_PLACE_METRIC = {
  id: "aerosol",
  label: "Aerosols (column AOD)",
} as const;

export interface AerosolBoundarySampleInput {
  /**
   * The two product months sampled, earlier first. They must be consecutive:
   * `aerosolLoading` refuses to difference a gap rather than bridging it.
   */
  months: readonly [YearMonth, YearMonth];
  /** Dimensionless column AOD per month, or null where no usable value. */
  observedValues: readonly [number | null, number | null];
  /** Share of the searched boundary yielding usable pixels, per month. */
  validFractions: readonly [number, number];
  /** Rendered source-image dimensions; provenance, never a resolution claim. */
  sourceImageDimensions?: { width: number; height: number };
}

export interface AerosolPlaceInsightReading {
  id: typeof AEROSOL_PLACE_METRIC.id;
  value: string;
  detail: string;
  kind: "observed-boundary-column-aerosol-optical-depth";
  isForecast: false;
  /** AOD is a column optical property, never a surface concentration. */
  surfaceAirQualityObservation: false;
  /** The descriptive loading tiers carry no health or compliance meaning. */
  healthIndex: false;
  wavelengthNm: number;
  /** The later of the two sampled months — the value shown on the card. */
  dataMonth: YearMonth;
  /** Dimensionless column AOD for `dataMonth`, or null when not usable. */
  observedValue: number | null;
  source: typeof AEROSOL_SOURCE;
}

/**
 * The scope limits every aerosol reading carries in its user-facing text.
 * Kept short enough to sit on a card while still refusing the three readings a
 * column AOD number most invites: surface air quality, a health rating, and a
 * forecast.
 */
const AEROSOL_CARD_SCOPE =
  "modelled column optical thickness (MERRA-2 reanalysis) — not surface air quality, not a health index, not a forecast";

/**
 * The rendered GIBS ramp for this product tops out just below
 * `PROBE_SCALES.aerosol.max` (measured: entries span 0.0025 to 0.8975). Because
 * the value is recovered by inverting that ramp, a genuinely heavier column —
 * a dust outbreak or smoke plume, where AOD can exceed 1 — cannot be
 * distinguished from one sitting at the ceiling. Such a sample is censored from
 * above, so the card says so instead of presenting the ceiling as the value.
 *
 * The `very-high` loading tier (AOD >= 1) is therefore unreachable through this
 * rendering path; a saturated sample reads as at most `high`.
 *
 * This is deliberately the *decode* ceiling, one quantization step below
 * `AEROSOL_RENDERED_RAMP_MAX` (0.9), and the two are not interchangeable.
 * `parseColormapEntries` drops the open-ended `≥ 0.900` cap and keeps only the
 * finite bins, whose topmost value is 0.8975, so a boundary sample recovered
 * through `sampleGeometryPhysical` can never reach 0.9. `describeAerosolCensoring`
 * tests `value < 0.9`, which means `AerosolLoadingChange.changeBound` stays
 * `"exact"` for every value this path can produce — its censoring flags never
 * fire here. Saturation is therefore screened at this consumer, against the
 * ceiling the imagery actually decodes to, rather than by weakening the shared
 * value-admission contract in `aerosolLoading` (which the multi-year judgment
 * modules also read, and whose 0.9 is correct for a native-value caller).
 */
const AEROSOL_RAMP_CEILING =
  PROBE_SCALES.aerosol.max - quantizationStep(PROBE_SCALES.aerosol);

/**
 * Whether a usable endpoint value rests on the rendered ramp's open-ended top
 * bin, and so reads as "at least this much" rather than as a measurement.
 */
function isRampSaturated(value: number | null): boolean {
  return (
    value !== null && Number.isFinite(value) && value >= AEROSOL_RAMP_CEILING
  );
}

/**
 * Format a boundary column-AOD pair for the place panel.
 *
 * The month-over-month difference is delegated to
 * {@link describeAerosolLoadingChange}, which only reports one when both months
 * are published, consecutive, and usable. When it declines, the later month's
 * value is still shown on its own with the reason stated, so a missing
 * comparison never silently becomes a bare number that reads as unchanged.
 */
export function aerosolBoundaryLoadingReading(
  input: AerosolBoundarySampleInput
): AerosolPlaceInsightReading {
  const [earlierMonth, laterMonth] = input.months;
  const change = describeAerosolLoadingChange(
    {
      dataMonth: earlierMonth,
      value: input.observedValues[0],
      validFraction: input.validFractions[0],
      ...(input.sourceImageDimensions
        ? { sourceImageDimensions: input.sourceImageDimensions }
        : {}),
    },
    {
      dataMonth: laterMonth,
      value: input.observedValues[1],
      validFraction: input.validFractions[1],
      ...(input.sourceImageDimensions
        ? { sourceImageDimensions: input.sourceImageDimensions }
        : {}),
    },
    // Availability is confirmed only through the later sampled month; the
    // caller derived both months from that layer's published range.
    laterMonth
  );

  const later = change.later;
  const observedValue = usableValue(later);
  return {
    id: AEROSOL_PLACE_METRIC.id,
    value:
      observedValue === null
        ? "No usable AOD observation"
        : formatAod(observedValue),
    detail: detailFor(change, observedValue),
    kind: "observed-boundary-column-aerosol-optical-depth",
    isForecast: false,
    surfaceAirQualityObservation: false,
    healthIndex: false,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    dataMonth: laterMonth,
    observedValue,
    source: AEROSOL_SOURCE,
  };
}

/**
 * Surface a sampling or source-mapping failure without relabeling it as an
 * observation of clean air. The card must never present "could not sample" and
 * "no aerosol" as the same thing.
 */
export function unavailableAerosolBoundaryReading(
  dataMonth: YearMonth
): AerosolPlaceInsightReading {
  return {
    id: AEROSOL_PLACE_METRIC.id,
    value: "Unavailable",
    detail: `${formatYm(dataMonth)} column AOD could not be sampled from the published source colormap; source ${sourceText()}; ${AEROSOL_CARD_SCOPE}`,
    kind: "observed-boundary-column-aerosol-optical-depth",
    isForecast: false,
    surfaceAirQualityObservation: false,
    healthIndex: false,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    dataMonth,
    observedValue: null,
    source: AEROSOL_SOURCE,
  };
}

function detailFor(
  change: AerosolLoadingChange,
  observedValue: number | null
): string {
  const later = change.later;
  const month = formatYm(later.dataMonth);
  const parts = [
    `${month} boundary-mean column AOD at ${AEROSOL_WAVELENGTH_NM} nm`,
  ];

  const laterSaturated = isRampSaturated(observedValue);
  const earlierSaturated = isRampSaturated(usableValue(change.earlier));

  if (observedValue === null) {
    parts.push(`no usable value (${unusableReason(later)})`);
  } else if (later.loading) {
    // The tier is a reading aid; say so where it is shown, and flag a value
    // that only marginally falls inside it rather than implying a clean bin.
    const marginal = later.tierProximity?.marginal
      ? `, close to the ${formatAod(later.tierProximity.nearestBoundary)} tier edge`
      : "";
    // A saturated sample bounds the tier from below as well as the value:
    // `AerosolCensoring.lowestPossibleCategory` is the *lowest* tier consistent
    // with the reading, so naming it alone would present a floor as the finding.
    const tier = laterSaturated
      ? `${later.loading.label} or heavier`
      : later.loading.label;
    parts.push(`${tier} (descriptive tier${marginal})`);
    if (laterSaturated) {
      parts.push(
        `at the top of the rendered colour ramp — the true column value may be higher`
      );
    }
  }

  parts.push(comparisonText(change, earlierSaturated, laterSaturated));
  parts.push(coverageText(later.coverage.validFraction));
  parts.push(imageProvenance(later.sourceImageDimensions));
  parts.push(`source ${sourceText()}`);
  parts.push(AEROSOL_CARD_SCOPE);
  return parts.join("; ");
}

/**
 * The month-over-month sentence. A withheld comparison is stated with its
 * machine-readable reason rather than omitted, so the reader can tell "no
 * change" from "not compared".
 *
 * A value resting on the ramp's open-ended top bin is a lower bound, so any
 * difference built from it is a bound too — the rule
 * `AerosolLoadingChange.changeBound` states and this card must honour. Because
 * that field cannot fire on the boundary-sampling path (see
 * `AEROSOL_RAMP_CEILING`), saturation is supplied by the caller here instead of
 * read off the change.
 */
function comparisonText(
  change: AerosolLoadingChange,
  earlierSaturated: boolean,
  laterSaturated: boolean
): string {
  const earlierMonth = formatYm(change.earlier.dataMonth);
  const laterMonth = formatYm(change.later.dataMonth);

  // Both months rest on the open-ended top bin, so both are lower bounds and
  // their difference constrains neither the sign nor the size of the true
  // change: two readings of 0.90 could truly be 0.90 and 3.0, in either order.
  // Subtracting here would assert a stability the imagery cannot support, so no
  // number is shown at all — the same rule `describeAerosolLoadingChange`
  // applies as "both-endpoints-censored".
  if (
    earlierSaturated &&
    laterSaturated &&
    change.status === "available" &&
    change.changeValue !== null
  ) {
    return `no comparison with ${earlierMonth} (both months rest on the rendered ramp's open-ended top bin, so neither the direction nor the size of the change is recoverable)`;
  }

  if (change.status !== "available" || change.changeValue === null) {
    return `no comparison with ${earlierMonth} (${change.reason ?? "unavailable"})`;
  }

  const signed = `${change.changeValue >= 0 ? "+" : "-"}${formatAod(
    Math.abs(change.changeValue)
  )}`;
  // `little-change` means the difference is inside the module's descriptive
  // band, not that the two months are equal — keep the number visible.
  const trend =
    change.trend === "little-change"
      ? `little change, within ±${formatAod(change.threshold)}`
      : `${change.trend ?? "unavailable"}`;

  if (!earlierSaturated && !laterSaturated) {
    return `${signed} vs ${earlierMonth} (${trend}); a difference between two modelled monthly means, not a trend`;
  }

  // Exactly one endpoint saturated: the true difference is bounded on one side.
  // A censored later month can only be higher, so the true change is at least
  // the computed one; a censored earlier month can only be higher, so the true
  // change is at most the computed one.
  const bound = laterSaturated
    ? { phrase: "at least", month: laterMonth, side: "a lower bound" }
    : { phrase: "at most", month: earlierMonth, side: "an upper bound" };
  // The direction only survives when the computed difference already runs the
  // way the bound can still travel. With the later month censored the true
  // change lies in [change, +INF), so a computed "little change" of +0.01 is
  // equally consistent with a true jump of +2 — naming a trend there would
  // assert stability the imagery cannot support.
  const directionSurvives = laterSaturated
    ? change.trend === "increasing"
    : change.trend === "decreasing";
  const direction = directionSurvives ? `${trend}, ` : "";
  return `${bound.phrase} ${signed} vs ${earlierMonth} (${direction}${bound.month} rests on the rendered ramp's open-ended top bin, so this is ${bound.side} on the change, not a measured difference); a difference between two modelled monthly means, not a trend`;
}

function usableValue(summary: AerosolLoadingSummary): number | null {
  if (summary.publicationStatus !== "published") return null;
  if (summary.coverage.status !== "available") return null;
  const value = summary.observedValue;
  return value !== null && Number.isFinite(value) ? value : null;
}

function unusableReason(summary: AerosolLoadingSummary): string {
  if (summary.publicationStatus !== "published") {
    return summary.publicationStatus;
  }
  return summary.coverage.reason ?? "unspecified";
}

/**
 * Complete coverage is a ratio of two compensated area sums, so it can land a
 * representation error below one rather than exactly on it. This snaps such a
 * share back to `100%` instead of demoting it to the bounded wording below,
 * which exists for genuinely incomplete samples.
 */
const PERCENT_SNAP_EPSILON = 1e-9;

function coverageText(validFraction: number | null): string {
  return validFraction === null
    ? "sampled coverage not supplied"
    : `${formatCoverageShare(validFraction)} sampled boundary coverage`;
}

/**
 * Whole percent, except at the two endpoints where nearest rounding would state
 * something the share does not say.
 *
 * Rounding an incomplete share to `100%` claims the boundary mean covers the
 * whole searched area when part of it went unobserved — and on this layer the
 * unobserved part is not a random scatter. As {@link AEROSOL_RAMP_CEILING}
 * records, `parseColormapEntries` drops the open-ended `>= 0.900` bin, so the
 * heaviest pixels decode as no-data: the missing share is drawn from the heavy
 * tail, and its absence biases the mean low. Rounding it away removes the only
 * cue on the card that this happened.
 *
 * The floor case is the mirror. A positive share below half a percent rounds to
 * `0%`, which sits beside a printed AOD number and reads as a value derived
 * from nothing; `marineBoundarySstSupport` states the same "<1%" rule for the
 * same reason. A share of exactly zero keeps `0%` — there the card is reporting
 * no data, not contradicting itself.
 *
 * Both endpoint cases are written as bounds because that is what they are.
 * Shares away from the endpoints keep nearest rounding, which is the useful
 * reading of a known share.
 */
function formatCoverageShare(fraction: number): string {
  if (fraction <= 0) return "0%";
  if (fraction >= 1 - PERCENT_SNAP_EPSILON) return "100%";
  const percent = Math.round(fraction * 100);
  if (percent >= 100) return ">99%";
  if (percent <= 0) return "<1%";
  return `${percent}%`;
}

function imageProvenance(
  dimensions: AerosolLoadingSummary["sourceImageDimensions"]
): string {
  return dimensions
    ? `rendered source image ${dimensions.width} x ${dimensions.height} px`
    : "rendered source image dimensions not supplied";
}

function sourceText(): string {
  return `${AEROSOL_SOURCE.shortName} v${AEROSOL_SOURCE.version}`;
}

/** AOD is dimensionless and small; two decimals is the useful scale. */
function formatAod(value: number): string {
  return value.toFixed(2);
}
