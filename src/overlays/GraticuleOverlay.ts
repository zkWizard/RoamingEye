import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type MapOverlay } from "./types";

/**
 * A latitude/longitude grid (graticule) — coordinate reference for orientation
 * and locating study areas. Meridians every 30°, parallels every 30°, with the
 * equator and prime meridian emphasised.
 */
export class GraticuleOverlay implements MapOverlay {
  readonly id = "graticule";
  readonly label = "Grid";
  readonly icon = ICONS.graticule;
  readonly object: THREE.Group;

  constructor(radius = GLOBE_RADIUS * 1.001) {
    this.object = new THREE.Group();
    this.object.visible = false;

    const minor = new THREE.LineBasicMaterial({
      color: 0x4ea1ff,
      transparent: true,
      opacity: 0.22,
    });
    const major = new THREE.LineBasicMaterial({
      color: 0x8fc1ff,
      transparent: true,
      opacity: 0.5,
    });

    // Meridians (constant longitude).
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 2) {
        pts.push(latLngToVector3(lat, lon, radius));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lon === 0 ? major : minor
      );
      this.object.add(line);
    }

    // Parallels (constant latitude).
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 2) {
        pts.push(latLngToVector3(lat, lon, radius));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lat === 0 ? major : minor
      );
      this.object.add(line);
    }
  }
}
