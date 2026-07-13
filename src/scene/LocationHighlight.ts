import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { geometryToRings, type GeoGeometry } from "../lib/geojson";
import { GLOBE_RADIUS } from "../overlays/types";

export interface HighlightTarget {
  lat: number;
  lon: number;
  geometry: GeoGeometry | null;
}

/**
 * Highlights the most recent search result on the globe. Administrative
 * polygon boundaries take precedence; point-like results fall back to a pin.
 * Only one search target is shown at a time.
 */
export class LocationHighlight {
  readonly object = new THREE.Group();
  private current: THREE.Group | undefined;
  private marker: THREE.Mesh | undefined;

  show(target: HighlightTarget): void {
    this.clear();
    const group = new THREE.Group();
    const radius = GLOBE_RADIUS * 1.006;

    const hasBoundary =
      target.geometry?.type === "Polygon" ||
      target.geometry?.type === "MultiPolygon";
    if (target.geometry && hasBoundary) {
      const linePositions: number[] = [];
      const pointPositions: number[] = [];
      for (const ring of geometryToRings(target.geometry)) {
        for (let i = 0; i + 1 < ring.length; i++) {
          const a = latLngToVector3(ring[i][1], ring[i][0], radius);
          const b = latLngToVector3(ring[i + 1][1], ring[i + 1][0], radius);
          linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
        pointPositions.push(...interpolatedRingPoints(ring, radius));
      }
      const line = makeBoundaryLine(linePositions);
      const points = makeBoundaryPoints(pointPositions);
      line.renderOrder = 10;
      points.renderOrder = 10;
      group.add(line, points);
    } else {
      this.marker = this.makeMarker(target.lat, target.lon);
      group.add(this.marker);
    }
    this.object.add(group);
    this.current = group;
  }

  clear(): void {
    if (!this.current) return;
    this.object.remove(this.current);
    disposeTree(this.current);
    this.current = undefined;
    this.marker = undefined;
  }

  /**
   * Keep the marker a roughly constant on-screen size at any zoom. Scaling by
   * height above the surface (distance − globe radius), not distance to centre,
   * so it shrinks correctly as you get right down to the surface.
   */
  update(cameraDistance: number): void {
    const aboveSurface = Math.max(0, cameraDistance - GLOBE_RADIUS);
    this.marker?.scale.setScalar(Math.max(0.0006, aboveSurface * 0.0045));
  }

  private makeMarker(lat: number, lon: number): THREE.Mesh {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16), // unit sphere; sized via update()
      new THREE.MeshBasicMaterial({ color: 0xffd166 })
    );
    marker.position.copy(latLngToVector3(lat, lon, GLOBE_RADIUS * 1.013));
    marker.scale.setScalar(0.009);
    return marker;
  }
}

function makeBoundaryLine(positions: number[]): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xffd166,
      depthTest: false,
      depthWrite: false,
    })
  );
}

function makeBoundaryPoints(positions: number[]): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffd166,
      size: 5,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
    })
  );
}

/** Fill long GeoJSON edges so the selected boundary stays readable in WebGL. */
function interpolatedRingPoints(
  ring: [number, number][],
  radius: number
): number[] {
  const positions: number[] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const [startLon, startLat] = ring[i];
    const [endLon, endLat] = ring[i + 1];
    let lonSpan = endLon - startLon;
    if (lonSpan > 180) lonSpan -= 360;
    if (lonSpan < -180) lonSpan += 360;
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(endLat - startLat), Math.abs(lonSpan)) / 0.08)
    );
    for (let step = 0; step < steps; step++) {
      const progress = step / steps;
      const point = latLngToVector3(
        startLat + (endLat - startLat) * progress,
        startLon + lonSpan * progress,
        radius
      );
      positions.push(point.x, point.y, point.z);
    }
  }
  return positions;
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Partial<THREE.Mesh>;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
