import { describe, it, expect } from "vitest";
import { PerspectiveCamera } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CameraFlyer } from "./CameraFlyer";
import { latLngToVector3 } from "../lib/geo";

const stubControls = (): OrbitControls =>
  ({ enabled: true, update: () => true }) as unknown as OrbitControls;

describe("CameraFlyer reduced-motion (instant) mode", () => {
  it("lands at the destination in a single step, no flight", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 3.2);
    const flyer = new CameraFlyer(camera, stubControls(), true);

    flyer.flyTo(48.86, 2.35, 1.8); // Paris at distance 1.8
    expect(flyer.isFlying).toBe(false);

    const expected = latLngToVector3(48.86, 2.35, 1)
      .normalize()
      .multiplyScalar(1.8);
    expect(camera.position.distanceTo(expected)).toBeLessThan(1e-9);
  });

  it("animated mode still tweens (isFlying until duration elapses)", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 3.2);
    const flyer = new CameraFlyer(camera, stubControls(), false);
    flyer.flyTo(48.86, 2.35, 1.8, 1.0);
    expect(flyer.isFlying).toBe(true);
    flyer.update(0.5);
    expect(flyer.isFlying).toBe(true);
    flyer.update(0.6);
    expect(flyer.isFlying).toBe(false);
  });
});

describe("CameraFlyer gaze", () => {
  it("blends pitch and heading and lands on the nadir orbit", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 3.2);
    const flyer = new CameraFlyer(camera, stubControls(), false);
    flyer.armGaze(0, 170);
    flyer.flyTo(48.86, 2.35, 1.8, 1, { pitch: 55, heading: -170 });

    flyer.update(0.5);
    const mid = flyer.takeGaze();
    // 170 -> -170 takes the short way across ±180, not the long way through 0.
    expect(Math.abs(Math.abs(mid?.heading ?? 0) - 180)).toBeLessThan(1);
    expect(mid?.pitch).toBeCloseTo(27.5, 0);

    flyer.update(0.6);
    expect(flyer.isFlying).toBe(false);
    const expected = latLngToVector3(48.86, 2.35, 1)
      .normalize()
      .multiplyScalar(1.8);
    expect(camera.position.distanceTo(expected)).toBeLessThan(1e-6);
    const landed = flyer.takeGaze();
    expect(landed?.pitch).toBeCloseTo(55);
    expect(landed?.heading).toBeCloseTo(-170);
  });
});

describe("CameraFlyer.cancel", () => {
  it("stops mid-flight where the camera is and hands the controls back", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 3.2);
    const controls = stubControls();
    const flyer = new CameraFlyer(camera, controls, false);
    flyer.flyTo(48.86, 2.35, 1.8, 1.0);
    expect(controls.enabled).toBe(false);

    flyer.update(0.4);
    const midFlight = camera.position.clone();
    flyer.cancel();

    expect(flyer.isFlying).toBe(false);
    expect(controls.enabled).toBe(true);
    flyer.update(0.4); // later frames no longer move it
    expect(camera.position.equals(midFlight)).toBe(true);
  });

  it("is a no-op when nothing is flying", () => {
    const camera = new PerspectiveCamera();
    const controls = stubControls();
    controls.enabled = false; // e.g. the region drawer holds them
    new CameraFlyer(camera, controls, false).cancel();
    expect(controls.enabled).toBe(false);
  });
});
