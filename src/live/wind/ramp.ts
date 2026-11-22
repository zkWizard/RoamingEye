/** Shared colour stops for the GPU ramp and the on-screen legend. */

export interface ColorStop {
  at: number;
  rgb: readonly [number, number, number];
}

/** Wind speed, metres per second. */
export const SPEED_STOPS: readonly ColorStop[] = [
  { at: 0, rgb: [48, 72, 168] },
  { at: 3, rgb: [56, 140, 220] },
  { at: 8, rgb: [40, 210, 186] },
  { at: 14, rgb: [130, 220, 70] },
  { at: 22, rgb: [245, 210, 55] },
  { at: 35, rgb: [235, 90, 40] },
  { at: 55, rgb: [170, 24, 90] },
];

/** Air temperature, degrees Celsius. */
export const TEMP_STOPS: readonly ColorStop[] = [
  { at: -40, rgb: [40, 70, 180] },
  { at: -10, rgb: [70, 150, 230] },
  { at: 0, rgb: [150, 220, 230] },
  { at: 12, rgb: [90, 190, 80] },
  { at: 24, rgb: [240, 210, 60] },
  { at: 36, rgb: [230, 100, 40] },
  { at: 46, rgb: [160, 30, 70] },
];

export function colorAlong(
  stops: readonly ColorStop[],
  value: number
): [number, number, number] {
  if (stops.length === 0) return [0, 0, 0];
  if (value <= stops[0].at)
    return [stops[0].rgb[0], stops[0].rgb[1], stops[0].rgb[2]];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (value <= next.at) {
      const span = next.at - prev.at;
      const t = span === 0 ? 0 : (value - prev.at) / span;
      return [
        Math.round(prev.rgb[0] + (next.rgb[0] - prev.rgb[0]) * t),
        Math.round(prev.rgb[1] + (next.rgb[1] - prev.rgb[1]) * t),
        Math.round(prev.rgb[2] + (next.rgb[2] - prev.rgb[2]) * t),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last.rgb[0], last.rgb[1], last.rgb[2]];
}

export function cssRamp(stops: readonly ColorStop[]): string {
  if (stops.length === 0) return "transparent";
  const min = stops[0].at;
  const max = stops[stops.length - 1].at;
  const span = max - min || 1;
  const parts = stops.map((stop) => {
    const pct = ((stop.at - min) / span) * 100;
    return `rgb(${stop.rgb[0]}, ${stop.rgb[1]}, ${stop.rgb[2]}) ${pct}%`;
  });
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

function glslFloat(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

function glslVec(rgb: readonly [number, number, number]): string {
  const parts = rgb.map((channel) => (channel / 255).toFixed(4));
  return `vec3(${parts.join(", ")})`;
}

/** A GLSL function `vec3 name(float x)` that piecewise-mixes `stops`. */
export function glslRampFunction(
  name: string,
  stops: readonly ColorStop[]
): string {
  const lines = [`vec3 ${name}(float x) {`];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    const span = next.at - prev.at;
    const keyword = i === 1 ? "if" : "else if";
    lines.push(
      `  ${keyword} (x <= ${glslFloat(next.at)}) return mix(${glslVec(prev.rgb)}, ${glslVec(next.rgb)}, clamp((x - ${glslFloat(prev.at)}) / ${glslFloat(span)}, 0.0, 1.0));`
    );
  }
  const last = stops[stops.length - 1];
  lines.push(`  return ${last ? glslVec(last.rgb) : "vec3(0.0)"};`);
  lines.push("}");
  return lines.join("\n");
}
