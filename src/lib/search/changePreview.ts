import {
  formatHeadline,
  placeChange,
  placeMetricShown,
  type PlaceChangeMetric,
} from "../placeChange";

/** What a search row shows once two annual means have been sampled. */
export interface ChangePreview {
  /** "NDVI +12% since 2005" — the percent and the year come from the samples. */
  text: string;
  /** Endpoint annual means, oldest first. Two values draw one line. */
  values: readonly number[];
}

/**
 * The row's change line from the same headline the place panel prints.
 * Returns null when the metric would be hidden there (no snow, no sea).
 */
export function describeChangePreview(
  metric: PlaceChangeMetric,
  fromYear: number,
  fromValue: number,
  toValue: number
): ChangePreview | null {
  if (!Number.isFinite(fromValue) || !Number.isFinite(toValue)) return null;
  if (!Number.isInteger(fromYear)) return null;
  const change = placeChange(metric, fromValue, toValue);
  if (!placeMetricShown(metric, change)) return null;
  return {
    text: `${metric.unit} ${formatHeadline(metric, change)} since ${fromYear}`,
    values: [fromValue, toValue],
  };
}
