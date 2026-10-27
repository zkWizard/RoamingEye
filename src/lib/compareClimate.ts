import {
  addMonths,
  compareYm,
  MONTH_NAMES,
  type LayerId,
  type YearMonth,
} from "./timeline";
import { formatProbeValue, quantizationStep, type ProbeScale } from "./probe";

/**
 * Place-vs-place numbers for rain and heat.
 *
 * The globe comparison used to invert a JPEG of the GIBS colormap and then
 * print that 0..1 fraction with the layer's physical unit. On precipitation
 * the fraction for a Gulf city in winter is about 0.02, which formats as
 * "0.0 mm/day", and the "about the same" test compared that fraction with a
 * step of 0.17 mm/day, so every dry-end pair collapsed to zero. Rain and
 * temperature now come from monthly ERA5 point values. Other layers still
 * read the map, but only after the fraction is scaled into the layer's units.
 */

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Millimetres in an inch. */
export const MM_PER_INCH = 25.4;

/** Layers whose comparison numbers come from a point archive, not map colors. */
const POINT_LAYERS = new Set<LayerId>(["precip", "lst", "airtemp"]);

export function isPointClimateLayer(id: LayerId): boolean {
  return POINT_LAYERS.has(id);
}

export type ClimateVariable = "precipMm" | "tempC";

export function variableForLayer(id: LayerId): ClimateVariable {
  return id === "precip" ? "precipMm" : "tempC";
}

/** What the card calls the quantity. Heat uses 2 m air temperature. */
export function measureName(id: LayerId): string {
  if (id === "precip") return "Rain";
  if (id === "lst" || id === "airtemp") return "Air temperature";
  return "";
}

export interface DailyClimate {
  time: readonly string[];
  precipMm: readonly (number | null)[];
  tempC: readonly (number | null)[];
}

export interface MonthClimate {
  year: number;
  month: number;
  precipMm: number | null;
  tempC: number | null;
  /** Days with a precipitation value. */
  precipDays: number;
  /** Days with a temperature value. */
  tempDays: number;
  expectedDays: number;
}

export interface ClimateQuery {
  requested: { year: number | null; month: number | null };
  defaultMonth: number;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function fullMonthLabel(ym: YearMonth): string {
  return `${FULL_MONTHS[ym.month - 1]} ${ym.year}`;
}

export function shortMonthLabel(ym: YearMonth): string {
  return `${MONTH_NAMES[ym.month - 1]} ${ym.year}`;
}

/** Sum daily ERA5 columns into calendar months, oldest first. */
export function monthsFromDaily(daily: DailyClimate): MonthClimate[] {
  const byKey = new Map<string, MonthClimate>();
  const order: string[] = [];
  const count = Math.min(
    daily.time.length,
    daily.precipMm.length,
    daily.tempC.length
  );
  for (let i = 0; i < count; i++) {
    const day = daily.time[i];
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(day);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const key = `${year}-${month}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        year,
        month,
        precipMm: null,
        tempC: null,
        precipDays: 0,
        tempDays: 0,
        expectedDays: daysInMonth(year, month),
      };
      byKey.set(key, row);
      order.push(key);
    }
    const rain = daily.precipMm[i];
    const temp = daily.tempC[i];
    if (rain !== null && Number.isFinite(rain)) {
      row.precipMm = (row.precipMm ?? 0) + rain;
      row.precipDays += 1;
    }
    if (temp !== null && Number.isFinite(temp)) {
      row.tempC = (row.tempC ?? 0) + temp;
      row.tempDays += 1;
    }
  }
  return order.map((key) => {
    const row = byKey.get(key) as MonthClimate;
    if (row.tempDays > 0 && row.tempC !== null) {
      row.tempC = row.tempC / row.tempDays;
    }
    return row;
  });
}

export function monthIsComplete(
  row: MonthClimate,
  variable: ClimateVariable
): boolean {
  const days = variable === "precipMm" ? row.precipDays : row.tempDays;
  return days === row.expectedDays && row[variable] !== null;
}

export function latestCompleteMonth(
  months: readonly MonthClimate[],
  variable: ClimateVariable
): MonthClimate | undefined {
  for (let i = months.length - 1; i >= 0; i--) {
    if (monthIsComplete(months[i], variable)) return months[i];
  }
  return undefined;
}

function monthOf(row: MonthClimate): YearMonth {
  return { year: row.year, month: row.month };
}

function findMonth(
  months: readonly MonthClimate[],
  wanted: YearMonth
): MonthClimate | undefined {
  return months.find(
    (row) => row.year === wanted.year && row.month === wanted.month
  );
}

/**
 * The month a query is asking for, before looking at which months arrived.
 * No date means "the latest complete month" (null). A year alone uses the
 * layer word's season (`rainfall 2026` → September).
 */
export function requestedCompareMonth(
  query: ClimateQuery,
  today: YearMonth
): YearMonth | null {
  const { year, month } = query.requested;
  if (year === null && month === null) return null;
  if (year !== null && month !== null) return { year, month };
  if (year !== null) return { year, month: query.defaultMonth };
  const candidate = { year: today.year, month: month as number };
  if (compareYm(candidate, today) >= 0) {
    return { year: today.year - 1, month: candidate.month };
  }
  return candidate;
}

export interface SelectedMonth {
  month: YearMonth;
  row: MonthClimate | undefined;
  note: string | null;
}

/**
 * Pick the month to show. An explicit month that is not a complete month of
 * the archive falls back to the latest complete one and says so. No date
 * uses that latest month directly.
 */
export function selectCompareMonth(
  months: readonly MonthClimate[],
  query: ClimateQuery,
  variable: ClimateVariable,
  today: YearMonth
): SelectedMonth | undefined {
  const latest = latestCompleteMonth(months, variable);
  if (!latest) return undefined;
  const wanted = requestedCompareMonth(query, today);
  if (!wanted) return { month: monthOf(latest), row: latest, note: null };
  const row = findMonth(months, wanted);
  if (row && monthIsComplete(row, variable)) {
    return { month: monthOf(row), row, note: null };
  }
  const asked = fullMonthLabel(wanted);
  const shown = fullMonthLabel(monthOf(latest));
  const future = compareYm(wanted, monthOf(latest)) > 0;
  const why = future
    ? `${asked} isn't complete yet`
    : `${asked} isn't in this record`;
  return {
    month: monthOf(latest),
    row: latest,
    note: `${why}. Showing ${shown}, the latest complete month.`,
  };
}

export function monthValue(
  months: readonly MonthClimate[],
  ym: YearMonth,
  variable: ClimateVariable
): number | null {
  const row = findMonth(months, ym);
  if (!row || !monthIsComplete(row, variable)) return null;
  return row[variable];
}

export interface PairMonth {
  month: YearMonth;
  note: string | null;
  valueA: number | null;
  valueB: number | null;
}

/**
 * One month for two places. A month counts when either place has a complete
 * reading, so a missing pixel on one side does not hide the other.
 */
export function selectPairMonth(
  monthsA: readonly MonthClimate[],
  monthsB: readonly MonthClimate[],
  query: ClimateQuery,
  variable: ClimateVariable,
  today: YearMonth
): PairMonth | undefined {
  const byKey = new Map<string, MonthClimate>();
  for (const row of [...monthsA, ...monthsB]) {
    if (!monthIsComplete(row, variable)) continue;
    const key = `${row.year}-${row.month}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  const union = [...byKey.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month
  );
  const selected = selectCompareMonth(union, query, variable, today);
  if (!selected) return undefined;
  return {
    month: selected.month,
    note: selected.note,
    valueA: monthValue(monthsA, selected.month, variable),
    valueB: monthValue(monthsB, selected.month, variable),
  };
}

/** How far back to ask the archive so the chart and the fallback both fit. */
export function climateFetchRange(
  query: ClimateQuery,
  today: YearMonth
): { start: YearMonth; end: YearMonth } {
  const wanted = requestedCompareMonth(query, today) ?? today;
  const recent = compareYm(wanted, addMonths(today, -18)) >= 0;
  if (recent || compareYm(wanted, today) >= 0) {
    return { start: addMonths(today, -14), end: today };
  }
  return { start: addMonths(wanted, -11), end: wanted };
}

export function isoMonthStart(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
}

export function isoMonthEnd(ym: YearMonth): string {
  const day = String(daysInMonth(ym.year, ym.month)).padStart(2, "0");
  return `${ym.year}-${String(ym.month).padStart(2, "0")}-${day}`;
}

/** Open-Meteo archive URL for ERA5 daily rain and 2 m temperature. */
export function era5DailyUrl(
  lat: number,
  lon: number,
  start: string,
  end: string
): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: start,
    end_date: end,
    daily: "precipitation_sum,temperature_2m_mean",
    timezone: "UTC",
    models: "era5",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
}

export interface FormattedValue {
  primary: string;
  secondary: string;
}

export function formatRain(mm: number): FormattedValue {
  const inches = mm / MM_PER_INCH;
  const inchText =
    inches >= 10 ? `${Math.round(inches)} in` : `${inches.toFixed(1)} in`;
  return { primary: `${Math.round(mm)} mm`, secondary: inchText };
}

export function formatTemp(celsius: number): FormattedValue {
  const fahrenheit = (celsius * 9) / 5 + 32;
  return {
    primary: `${Math.round(celsius)}°C`,
    secondary: `${Math.round(fahrenheit)}°F`,
  };
}

export function formatTimes(ratio: number): string {
  if (ratio >= 9.5) return String(Math.round(ratio));
  const tenths = Math.round(ratio * 10) / 10;
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
}

function placePair(placeA: string, placeB: string, month: string): string {
  return `${placeA} and ${placeB} in ${month}`;
}

/**
 * Plain-language rain comparison. Totals are millimetres for the month.
 * A near-tie stays a tie; a dry place is not "infinity times" a wet one.
 */
export function rainSentence(
  placeA: string,
  placeB: string,
  monthLabel: string,
  valueA: number | null,
  valueB: number | null
): string {
  if (valueA === null && valueB === null) {
    return `No rainfall reading for ${placePair(placeA, placeB, monthLabel)}.`;
  }
  if (valueA === null || valueB === null) {
    const known = valueA === null ? placeB : placeA;
    const missing = valueA === null ? placeA : placeB;
    const value = (valueA === null ? valueB : valueA) as number;
    const rain = formatRain(value);
    return `${known} got ${rain.primary} (${rain.secondary}) of rain in ${monthLabel}. ${missing} has no reading for that month.`;
  }
  if (valueA < 1 && valueB < 1) {
    return `${placeA} and ${placeB} got essentially no rain in ${monthLabel}.`;
  }
  const low = Math.min(valueA, valueB);
  const high = Math.max(valueA, valueB);
  if (low < 1) {
    const winner = valueA >= valueB ? placeA : placeB;
    const loser = valueA >= valueB ? placeB : placeA;
    const rain = formatRain(high);
    return `${winner} got ${rain.primary} (${rain.secondary}) of rain in ${monthLabel}. ${loser} got essentially none.`;
  }
  if (high / low < 1.25) {
    const rain = formatRain((valueA + valueB) / 2);
    return `${placeA} and ${placeB} got about the same rain in ${monthLabel} (around ${rain.secondary}).`;
  }
  const winner = valueA >= valueB ? placeA : placeB;
  const loser = valueA >= valueB ? placeB : placeA;
  return `${winner} got about ${formatTimes(high / low)}× more rain than ${loser} in ${monthLabel}.`;
}

/** Air temperature at 2 m. Differences a person would not feel stay a tie. */
export function tempSentence(
  placeA: string,
  placeB: string,
  monthLabel: string,
  valueA: number | null,
  valueB: number | null
): string {
  if (valueA === null && valueB === null) {
    return `No temperature reading for ${placePair(placeA, placeB, monthLabel)}.`;
  }
  if (valueA === null || valueB === null) {
    const known = valueA === null ? placeB : placeA;
    const missing = valueA === null ? placeA : placeB;
    const value = (valueA === null ? valueB : valueA) as number;
    const temp = formatTemp(value);
    return `${known} averaged ${temp.primary} (${temp.secondary}) in ${monthLabel}. ${missing} has no reading for that month.`;
  }
  const deltaC = valueA - valueB;
  if (Math.abs(deltaC) < 0.6) {
    const temp = formatTemp((valueA + valueB) / 2);
    return `${placeA} and ${placeB} were about the same temperature in ${monthLabel} (around ${temp.secondary}).`;
  }
  const warmer = deltaC > 0 ? placeA : placeB;
  const cooler = deltaC > 0 ? placeB : placeA;
  const deltaF = Math.abs(deltaC) * (9 / 5);
  const degrees = Math.max(1, Math.round(deltaF));
  return `${warmer} was about ${degrees}°F warmer than ${cooler} in ${monthLabel}.`;
}

const SCALED_SPEECH: Partial<
  Record<LayerId, { noun: string; more: string; less: string }>
> = {
  ndvi: { noun: "greenness", more: "greener", less: "less green" },
  evi: { noun: "greenness", more: "greener", less: "less green" },
  snow: { noun: "snow cover", more: "snowier", less: "less snowy" },
  sst: { noun: "sea surface temperature", more: "warmer", less: "cooler" },
  aerosol: { noun: "haze", more: "hazier", less: "clearer" },
  soil: { noun: "soil moisture", more: "wetter", less: "drier" },
};

export function scaledSentence(
  layer: LayerId,
  placeA: string,
  placeB: string,
  monthLabel: string,
  valueA: number | null,
  valueB: number | null,
  scale: ProbeScale
): string {
  const speech = SCALED_SPEECH[layer] ?? {
    noun: "value",
    more: "higher",
    less: "lower",
  };
  if (valueA === null && valueB === null) {
    return `No ${speech.noun} reading for ${placePair(placeA, placeB, monthLabel)}.`;
  }
  if (valueA === null || valueB === null) {
    const known = valueA === null ? placeB : placeA;
    const missing = valueA === null ? placeA : placeB;
    const value = (valueA === null ? valueB : valueA) as number;
    return `${known}'s ${speech.noun} is ${formatProbeValue(value, scale)} in ${monthLabel}. ${missing} has no reading for that month.`;
  }
  if (Math.abs(valueA - valueB) <= quantizationStep(scale)) {
    return `${placeA} and ${placeB} have about the same ${speech.noun} in ${monthLabel} (${formatProbeValue(valueA, scale)}).`;
  }
  const winner = valueA > valueB ? placeA : placeB;
  const how = valueA > valueB ? speech.more : speech.less;
  return `${placeA}'s ${speech.noun} is ${formatProbeValue(valueA, scale)} and ${placeB}'s is ${formatProbeValue(valueB, scale)} in ${monthLabel}. ${winner} is ${how}.`;
}

export function formatScaled(value: number, scale: ProbeScale): FormattedValue {
  if (scale.unit === "°C") return formatTemp(value);
  if (scale.max <= 1 && scale.unit === "") {
    return { primary: value.toFixed(2), secondary: "index" };
  }
  return { primary: formatProbeValue(value, scale), secondary: "" };
}

/** Twelve months ending at `focus`, aligned across both places. */
export function chartWindow(
  focus: YearMonth,
  monthsA: readonly MonthClimate[],
  monthsB: readonly MonthClimate[],
  variable: ClimateVariable
): { labels: string[]; a: (number | null)[]; b: (number | null)[] } {
  const labels: string[] = [];
  const a: (number | null)[] = [];
  const b: (number | null)[] = [];
  for (let i = 11; i >= 0; i--) {
    const ym = addMonths(focus, -i);
    labels.push(MONTH_NAMES[ym.month - 1]);
    const rowA = findMonth(monthsA, ym);
    const rowB = findMonth(monthsB, ym);
    a.push(rowA && monthIsComplete(rowA, variable) ? rowA[variable] : null);
    b.push(rowB && monthIsComplete(rowB, variable) ? rowB[variable] : null);
  }
  return { labels, a, b };
}

export interface ChartPoint {
  year: number;
  month: number;
  value: number | null;
}

/** Twelve months ending at `focus`, for readings that are not ERA5 rows. */
export function valueChart(
  focus: YearMonth,
  seriesA: readonly ChartPoint[],
  seriesB: readonly ChartPoint[]
): { labels: string[]; a: (number | null)[]; b: (number | null)[] } {
  const labels: string[] = [];
  const a: (number | null)[] = [];
  const b: (number | null)[] = [];
  const at = (series: readonly ChartPoint[], ym: YearMonth): number | null => {
    const point = series.find(
      (row) => row.year === ym.year && row.month === ym.month
    );
    return point?.value ?? null;
  };
  for (let i = 11; i >= 0; i--) {
    const ym = addMonths(focus, -i);
    labels.push(MONTH_NAMES[ym.month - 1]);
    a.push(at(seriesA, ym));
    b.push(at(seriesB, ym));
  }
  return { labels, a, b };
}

/**
 * Suggestion subtitle for rain and heat. A month that has not finished yet
 * is not named as if it were the comparison.
 */
export function pointClimateSuggestion(
  query: ClimateQuery & { layer: LayerId },
  today: YearMonth
): string {
  const name = measureName(query.layer);
  const wanted = requestedCompareMonth(query, today);
  if (!wanted) return `${name} · latest complete month`;
  if (compareYm(wanted, today) < 0) {
    return `${name} · ${shortMonthLabel(wanted)}`;
  }
  return `${name}. ${shortMonthLabel(wanted)} isn't complete yet. Opens the latest complete month.`;
}

/** Bar chart vertical scale. Rain starts at zero; temperature uses the data. */
export function chartBounds(
  values: readonly (number | null)[],
  zeroBased: boolean
): { lo: number; hi: number } {
  const finite = values.filter((value): value is number => value !== null);
  if (finite.length === 0) return { lo: 0, hi: 1 };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (zeroBased) return { lo: 0, hi: Math.max(max, 1) };
  const pad = Math.max((max - min) * 0.2, 0.5);
  return { lo: min - pad, hi: max + pad };
}
