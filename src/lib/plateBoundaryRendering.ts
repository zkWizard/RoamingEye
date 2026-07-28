import * as THREE from "three";
import { latLngToVector3 } from "./geo";
import type { Position } from "./geojson";
import type { PlateBoundary } from "./plates";

/** Maximum central angle represented by one rendered line segment. */
export const MAX_PLATE_RENDER_SEGMENT_DEGREES = 1;

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
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(maxSegmentDegrees) ||
    maxSegmentDegrees <= 0 ||
    maxSegmentDegrees > 180
  ) {
    return [];
  }

  const positions: number[] = [];
  for (const boundary of boundaries) {
    for (let index = 0; index + 1 < boundary.points.length; index++) {
      appendGreatCircleEdge(
        positions,
        boundary.points[index],
        boundary.points[index + 1],
        radius,
        maxSegmentDegrees
      );
    }
  }
  return positions;
}

function appendGreatCircleEdge(
  positions: number[],
  start: Position,
  end: Position,
  radius: number,
  maxSegmentDegrees: number
): void {
  const a = latLngToVector3(start[1], start[0], radius);
  const b = latLngToVector3(end[1], end[0], radius);
  const angle = a.angleTo(b);
  if (!Number.isFinite(angle)) return;

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
