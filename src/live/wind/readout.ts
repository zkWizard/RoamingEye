import type { WindSample } from "./field";

const COMPASS_16 = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

export function compass16(directionDeg: number): string {
  const wrapped = ((directionDeg % 360) + 360) % 360;
  const index = Math.round(wrapped / 22.5) % 16;
  return COMPASS_16[index];
}

export function formatWindReadout(
  sample: WindSample,
  showTemperature: boolean
): string {
  const speed =
    sample.speed >= 10 ? sample.speed.toFixed(0) : sample.speed.toFixed(1);
  const direction = Math.round(sample.directionDeg) % 360;
  const wind = `${speed} m/s from the ${compass16(sample.directionDeg)} (${direction}\u00b0)`;
  if (!showTemperature || !Number.isFinite(sample.t)) return wind;
  return `${wind}, ${sample.t.toFixed(0)}\u00b0C`;
}

/** "updated X h ago" from the field header time. */
export function updatedAgoLabel(time: string, nowMs: number): string {
  const then = Date.parse(time);
  if (!Number.isFinite(then)) return "updated time unknown";
  const hours = Math.max(0, Math.floor((nowMs - then) / 3_600_000));
  return `updated ${hours} h ago`;
}
