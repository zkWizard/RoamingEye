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
 * Highlights the most recent search result on the globe: the administrative
 * boundary (when available) plus a marker pin. Only one is shown at a time.
 */
export class LocationHighlight {
  readonly object = new THREE.Group();
  private current: THREE.Group | undefined;

  show(target: HighlightTarget): void {
    this.clear();
    const group = new THREE.Group();
    const radius = GLOBE_RADIUS * 1.004;

    if (target.geometry) {
      const positions: number[] = [];
      for (const ring of geometryToRings(target.geometry)) {
        for (let i = 0; i + 1 < ring.length; i++) {
          const a = latLngToVector3(ring[i][1], ring[i][0], radius);
          const b = latLngToVector3(ring[i + 1][1], ring[i + 1][0], radius);
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      group.add(
        new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: 0xffd166 })
        )
      );
    }

    group.add(this.makeMarker(target.lat, target.lon));
    this.object.add(group);
    this.current = group;
  }

  clear(): void {
    if (!this.current) return;
    this.object.remove(this.current);
    disposeTree(this.current);
    this.current = undefined;
  }

  private makeMarker(lat: number, lon: number): THREE.Object3D {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd166 })
    );
    marker.position.copy(latLngToVector3(lat, lon, GLOBE_RADIUS * 1.012));
    return marker;
  }
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
