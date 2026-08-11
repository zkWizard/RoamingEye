import * as THREE from "three";
import { latLngToVector3 } from "./geo";
import type { Position } from "./geojson";
import type { PlateBoundary } from "./plates";

/** Maximum central angle represented by one rendered line segment. */
export const MAX_PLATE_RENDER_SEGMENT_DEGREES = 1;

/**
 * Rendered linework plus the supplied boundary each rendered segment came from.
 *
 * The overlay flattens every boundary into a single LineSegments for one draw
 * call, which drops the plate-pair label the source polyline carried. This
 * index restores that association — it records provenance already present in
 * the input and neither adds observations nor changes what is drawn.
 */
export interface PlateBoundaryRenderGeometry {
  /** Flat [x, y, z, ...] vertex pairs: two vertices per rendered segment. */
  positions: number[];
  /**
   * Index into the supplied `boundaries` array for each rendered segment, so
   * `segmentBoundaries[n]` owns the segment starting at `positions[n * 6]`.
   */
  segmentBoundaries: number[];
}

/**
 * Convert Bird (2003) boundary polylines into line-segment positions that
 * follow great-circle arcs. Subdivision is render-only and does not add source
 * observations or alter the supplied coordinates.
 */
export function plateBoundaryRenderPositions(
  boundaries: readonly PlateBoundary[],
  radius: number,
  maxSegmentDegrees = MAX_PLATE_RENDER_SEGMENT_DEGREES
): number[] {
  return plateBoundaryRenderGeometry(boundaries, radius, maxSegmentDegrees)
    .positions;
}

/**
 * As {@link plateBoundaryRenderPositions}, but also reporting which supplied
 * boundary produced each rendered segment. Invalid render parameters yield
 * empty linework rather than a guessed fallback.
 */
export function plateBoundaryRenderGeometry(
  boundaries: readonly PlateBoundary[],
  radius: number,
  maxSegmentDegrees = MAX_PLATE_RENDER_SEGMENT_DEGREES
): PlateBoundaryRenderGeometry {
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(maxSegmentDegrees) ||
    maxSegmentDegrees <= 0 ||
    maxSegmentDegrees > 180
  ) {
    return { positions: [], segmentBoundaries: [] };
  }

  const positions: number[] = [];
  const segmentBoundaries: number[] = [];
  for (const [boundaryIndex, boundary] of boundaries.entries()) {
    for (let index = 0; index + 1 < boundary.points.length; index++) {
      const appended = appendGreatCircleEdge(
        positions,
        boundary.points[index],
        boundary.points[index + 1],
        radius,
        maxSegmentDegrees
      );
      for (let segment = 0; segment < appended; segment++) {
        segmentBoundaries.push(boundaryIndex);
      }
    }
  }
  return { positions, segmentBoundaries };
}

/** Appends one source edge's segments and reports how many were written. */
function appendGreatCircleEdge(
  positions: number[],
  start: Position,
  end: Position,
  radius: number,
  maxSegmentDegrees: number
): number {
  const a = latLngToVector3(start[1], start[0], radius);
  const b = latLngToVector3(end[1], end[0], radius);
  const angle = a.angleTo(b);
  if (!Number.isFinite(angle)) return 0;

  const subdivisions = Math.max(
    1,
    Math.ceil(THREE.MathUtils.radToDeg(angle) / maxSegmentDegrees - 1e-10)
  );
  let previous = a;
  for (let step = 1; step <= subdivisions; step++) {
    const current =
      step === subdivisions
        ? b
        : slerpOnSphere(a, b, step / subdivisions, radius);
    positions.push(
      previous.x,
      previous.y,
      previous.z,
      current.x,
      current.y,
      current.z
    );
    previous = current;
  }
  return subdivisions;
}

function slerpOnSphere(
  start: THREE.Vector3,
  end: THREE.Vector3,
  fraction: number,
  radius: number
): THREE.Vector3 {
  const startUnit = start.clone().normalize();
  const endUnit = end.clone().normalize();
  const dot = THREE.MathUtils.clamp(startUnit.dot(endUnit), -1, 1);
  const angle = Math.acos(dot);

  if (angle < 1e-9) return startUnit.multiplyScalar(radius);

  const sinAngle = Math.sin(angle);
  if (Math.abs(sinAngle) < 1e-9) {
    const axis =
      Math.abs(startUnit.x) < 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    return startUnit
      .clone()
      .applyAxisAngle(axis.cross(startUnit).normalize(), Math.PI * fraction)
      .multiplyScalar(radius);
  }

  return startUnit
    .multiplyScalar(Math.sin((1 - fraction) * angle) / sinAngle)
    .add(endUnit.multiplyScalar(Math.sin(fraction * angle) / sinAngle))
    .normalize()
    .multiplyScalar(radius);
}
