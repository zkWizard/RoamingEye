/**
 * A place's camera target and the box that frames it.
 *
 * Longitude is the short arc that actually contains the outline. A date-line
 * country such as Fiji is stored with coordinates on both sides of ±180, and
 * a naive min/max is the whole circle — the bug that used to zoom the camera
 * all the way out. west > east means the box crosses the date line.
 */
export interface PlaceFix {
  lat: number;
  lon: number;
  /** [south, north, west, east]. */
  boundingBox: [number, number, number, number];
}

export interface LongitudeArc {
  west: number;
  east: number;
  center: number;
  span: number;
}

/** Shortest arc containing every sample. */
export function longitudeArc(
  longitudes: readonly number[]
): LongitudeArc | null {
  const unique = [
    ...new Set(
      longitudes
        .filter((lon) => Number.isFinite(lon))
        .map((lon) => {
          const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
          return Math.round(wrapped * 1e6) / 1e6;
        })
    ),
  ].sort((a, b) => a - b);
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    const only = unique[0];
    return { west: only, east: only, center: only, span: 0 };
  }
  let maxGap = -1;
  let gapAt = 0;
  for (let i = 0; i < unique.length; i++) {
    const a = unique[i];
    const b = i + 1 < unique.length ? unique[i + 1] : unique[0] + 360;
    const gap = b - a;
    if (gap > maxGap) {
      maxGap = gap;
      gapAt = i;
    }
  }
  const start = unique[(gapAt + 1) % unique.length];
  const end = unique[gapAt];
  const span = 360 - maxGap;
  let center = start + span / 2;
  if (center > 180) center -= 360;
  return { west: start, east: end, center, span };
}

/** A small box around a point, wrapped when the pad crosses the date line. */
export function pointBox(
  lat: number,
  lon: number,
  pad = 0.4
): [number, number, number, number] {
  const south = Math.max(-90, lat - pad);
  const north = Math.min(90, lat + pad);
  let west = lon - pad;
  let east = lon + pad;
  if (west < -180) west += 360;
  if (east > 180) east -= 360;
  return [south, north, west, east];
}

/** Representative point and short-arc box of a GeoJSON geometry. */
export function placeFixFromGeometry(geometry: unknown): PlaceFix | null {
  const lons: number[] = [];
  const lats: number[] = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node) || node.length === 0) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      if (Number.isFinite(node[0]) && Number.isFinite(node[1])) {
        lons.push(node[0]);
        lats.push(node[1]);
      }
      return;
    }
    for (const child of node) walk(child);
  };
  if (geometry && typeof geometry === "object" && "coordinates" in geometry) {
    walk((geometry as { coordinates: unknown }).coordinates);
  }
  if (lats.length === 0) return null;
  let south = Infinity;
  let north = -Infinity;
  for (const lat of lats) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  const arc = longitudeArc(lons);
  if (!arc) return null;
  const boundingBox: [number, number, number, number] =
    arc.span === 0
      ? pointBox((south + north) / 2, arc.center)
      : [south, north, arc.west, arc.east];
  return { lat: (south + north) / 2, lon: arc.center, boundingBox };
}
