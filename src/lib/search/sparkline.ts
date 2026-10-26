/**
 * SVG polyline `points` for a left-to-right series.
 *
 * Two annual means are a single segment. The line rises on screen when the
 * value rises. A flat series stays a horizontal line rather than disappearing.
 */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number
): string {
  if (values.length === 0 || width <= 0 || height <= 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 1;
  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : (index / (values.length - 1)) * (width - pad * 2) + pad;
      const y =
        span === 0
          ? height / 2
          : pad + (1 - (value - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
