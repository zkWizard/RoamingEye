/**
 * Screen-space pick over a spatial hash. Callers project markers themselves
 * and pass pixel positions. Nothing here raycasts a point cloud.
 */

const CELL = 24;

export interface ScreenPoint {
  x: number;
  y: number;
}

export function pickNearest(
  points: readonly ScreenPoint[],
  pointerX: number,
  pointerY: number,
  maxDist = 18
): number | null {
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
      continue;
    const key = cellKey(point.x, point.y);
    const list = buckets.get(key);
    if (list) list.push(index);
    else buckets.set(key, [index]);
  }
  const cx = Math.floor(pointerX / CELL);
  const cy = Math.floor(pointerY / CELL);
  let best = -1;
  let bestDist = maxDist;
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oy = -1; oy <= 1; oy += 1) {
      const list = buckets.get(`${cx + ox},${cy + oy}`);
      if (!list) continue;
      for (const index of list) {
        const point = points[index];
        if (!point) continue;
        const dist = Math.hypot(point.x - pointerX, point.y - pointerY);
        if (dist <= bestDist) {
          bestDist = dist;
          best = index;
        }
      }
    }
  }
  return best < 0 ? null : best;
}

function cellKey(x: number, y: number): string {
  return `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
}
