import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { latLngToVector3 } from "./geo";
import { framePair, type FrameOcclusion } from "./placeFrame";

const HOUSTON = { lat: 29.76, lon: -95.37 };
const AUSTIN = { lat: 30.27, lon: -97.74 };

const DESKTOP: FrameOcclusion = {
  top: 0.1,
  right: 0.27,
  bottom: 0.16,
  left: 0.3,
};
const PHONE: FrameOcclusion = {
  top: 0.09,
  right: 0.03,
  bottom: 0.45,
  left: 0.03,
};

function project(
  place: { lat: number; lon: number },
  pose: { lat: number; lon: number; distance: number },
  fov: number,
  aspect: number
): { x: number; y: number } {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 100);
  camera.position.copy(latLngToVector3(pose.lat, pose.lon, pose.distance));
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const ndc = latLngToVector3(place.lat, place.lon, 1).project(camera);
  return { x: ndc.x, y: ndc.y };
}

function safeNdc(occlude: FrameOcclusion, padding: number) {
  const top = occlude.top + padding;
  const bottom = occlude.bottom + padding;
  const left = occlude.left + padding;
  const right = occlude.right + padding;
  return {
    minX: -1 + 2 * left,
    maxX: 1 - 2 * right,
    maxY: 1 - 2 * top,
    minY: -1 + 2 * bottom,
  };
}

describe("framePair", () => {
  it("holds Houston and Austin in the open part of a desktop view", () => {
    const pose = framePair(HOUSTON, AUSTIN, {
      fovDeg: 45,
      aspect: 1280 / 800,
      occlude: DESKTOP,
      padding: 0.05,
    });
    // The old pair flight forced distance 2.8 (alt 1.8), a whole hemisphere.
    expect(pose.distance).toBeGreaterThan(1.02);
    expect(pose.distance).toBeLessThan(1.7);
    const safe = safeNdc(DESKTOP, 0.05);
    const pins = [HOUSTON, AUSTIN].map((place) =>
      project(place, pose, 45, 1280 / 800)
    );
    for (const pin of pins) {
      expect(pin.x).toBeGreaterThan(safe.minX);
      expect(pin.x).toBeLessThan(safe.maxX);
      expect(pin.y).toBeGreaterThan(safe.minY);
      expect(pin.y).toBeLessThan(safe.maxY);
    }
    const span = Math.abs(pins[0].x - pins[1].x);
    expect(span).toBeGreaterThan(0.18);
  });

  it("lifts both cities above a phone's bottom sheet without an 18° shove", () => {
    const pose = framePair(HOUSTON, AUSTIN, {
      fovDeg: 45,
      aspect: 390 / 844,
      occlude: PHONE,
      padding: 0.05,
    });
    const mid = (HOUSTON.lat + AUSTIN.lat) / 2;
    expect(pose.lat).toBeLessThan(mid);
    expect(mid - pose.lat).toBeLessThan(8);
    expect(pose.distance).toBeLessThan(1.8);
    const safe = safeNdc(PHONE, 0.05);
    const pins = [HOUSTON, AUSTIN].map((place) =>
      project(place, pose, 45, 390 / 844)
    );
    for (const pin of pins) {
      expect(pin.x).toBeGreaterThan(safe.minX);
      expect(pin.x).toBeLessThan(safe.maxX);
      expect(pin.y).toBeGreaterThan(safe.minY);
      expect(pin.y).toBeLessThan(safe.maxY);
    }
    expect(
      Math.hypot(pins[0].x - pins[1].x, pins[0].y - pins[1].y)
    ).toBeGreaterThan(0.12);
  });
});
