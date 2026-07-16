import {
  SEISMICITY_UNITS,
  USGS_FEED_URL,
  type Earthquake,
  type EarthquakeRange,
} from "./earthquakes";
import { USGS_M45_MONTH_SOURCE } from "./earthquakeContext";

/**
 * UTC daily observations from the existing USGS M4.5+ rolling-month feed.
 *
 * This contract is intended for timelines and exports. It groups supplied
 * observations by their reported origin time without interpreting event
 * cadence as a trend, cause, forecast, or hazard signal.
 */

export const EARTHQUAKE_TIMELINE_SOURCE = {
  ...USGS_M45_MONTH_SOURCE,
  feedUrl: USGS_FEED_URL,
} as const;

export const EARTHQUAKE_TIMELINE_UNITS = {
  ...SEISMICITY_UNITS,
  day: "UTC calendar date (YYYY-MM-DD)",
  eventCount: "count of supplied feed observations",
} as const;

export interface EarthquakeDailyBin {
  day: string;
  eventCount: number;
  eventTime: EarthquakeRange;
}

export type EarthquakeTimelineStatus =
  "available" | "no-events" | "no-usable-event-times";

export interface EarthquakeTimeline {
  kind: "usgs-earthquake-utc-daily-timeline";
  status: EarthquakeTimelineStatus;
  suppliedEventCount: number;
  usableEventCount: number;
  unavailableEventTimeCount: number;
  observedEventTime: EarthquakeRange;
  days: readonly EarthquakeDailyBin[];
  provenance: typeof EARTHQUAKE_TIMELINE_SOURCE;
  units: typeof EARTHQUAKE_TIMELINE_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Groups only the supplied feed observations; missing days do not establish that no earthquakes occurred.",
  "The source is a rolling global M4.5+ summary, not a complete earthquake catalog or a fixed calendar month.",
  "Daily counts are descriptive observations, not a trend, causal claim, forecast, hazard ranking, or risk score.",
] as const;

/**
 * Group supplied earthquake records into chronological UTC calendar days.
 * Non-finite event times remain visible in coverage counts and are never
 * assigned to a day.
 */
export function earthquakeDailyTimeline(
  earthquakes: readonly Earthquake[]
): EarthquakeTimeline {
  const usable = earthquakes.filter(({ time }) => Number.isFinite(time));
  const grouped = new Map<string, number[]>();

  for (const { time } of usable) {
    const day = new Date(time).toISOString().slice(0, 10);
    const times = grouped.get(day);
    if (times) times.push(time);
    else grouped.set(day, [time]);
  }

  const days = [...grouped.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([day, times]) => ({
      day,
      eventCount: times.length,
      eventTime: range(times),
    }));

  return {
    kind: "usgs-earthquake-utc-daily-timeline",
    status:
      earthquakes.length === 0
        ? "no-events"
        : usable.length === 0
          ? "no-usable-event-times"
          : "available",
    suppliedEventCount: earthquakes.length,
    usableEventCount: usable.length,
    unavailableEventTimeCount: earthquakes.length - usable.length,
    observedEventTime: range(usable.map(({ time }) => time)),
    days,
    provenance: EARTHQUAKE_TIMELINE_SOURCE,
    units: EARTHQUAKE_TIMELINE_UNITS,
    limitations: LIMITATIONS,
  };
}

function range(values: readonly number[]): EarthquakeRange {
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}
