import { describe, expect, it } from "vitest";
import { latLngToVector3, vector3ToLatLng } from "./geo";
import {
  PITCH_3D_DEG,
  clampPitch,
  poseVectors,
  wrapHeading,
} from "./cameraPose";

describe("camera pose", () => {
  const surface = 1;

  it("looks straight down the radial when pitch and heading are zero", () => {
    const { eye, target } = poseVectors(
      { lat: 28, lon: 86, distance: 1.4, pitch: 0, heading: 0 },
      surface
    );
    const radial = latLngToVector3(28, 86, 1.4);
    expect(eye.distanceTo(radial)).toBeLessThan(1e-6);
    expect(target.distanceTo(latLngToVector3(28, 86, surface))).toBeLessThan(
      1e-6
    );
  });

  it("pitches back from the ground point by the requested angle", () => {
    const pose = {
      lat: 46,
      lon: 8,
      distance: 1.35,
      pitch: PITCH_3D_DEG,
      heading: 0,
    };
    const { eye, target } = poseVectors(pose, surface);
    const up = target.clone().normalize();
    const view = target.clone().sub(eye).normalize();
    const fromNadir = Math.acos(
      Math.min(1, Math.max(-1, view.dot(up.clone().negate())))
    );
    expect((fromNadir * 180) / Math.PI).toBeCloseTo(PITCH_3D_DEG, 4);
    expect(eye.length()).toBeGreaterThan(surface);
  });

  it("turns the eye around the point when the heading changes", () => {
    const base = { lat: 36, lon: -112, distance: 1.2, pitch: 50, heading: 0 };
    const north = poseVectors(base, surface).eye;
    const east = poseVectors({ ...base, heading: 90 }, surface).eye;
    expect(north.distanceTo(east)).toBeGreaterThan(0.05);
  });

  it("clamps pitch and wraps heading", () => {
    expect(clampPitch(120)).toBe(80);
    expect(clampPitch(-4)).toBe(0);
    expect(wrapHeading(190)).toBeCloseTo(-170, 5);
    expect(wrapHeading(0)).toBe(0);
  });

  it("keeps a steep eye outside a raised ground distance", () => {
    const pose = {
      lat: 27.99,
      lon: 86.93,
      distance: 1.01,
      pitch: 70,
      heading: 20,
    };
    const { eye } = poseVectors(pose, 0.996);
    const ll = vector3ToLatLng(eye);
    expect(Math.abs(ll.lat)).toBeLessThanOrEqual(90);
    expect(eye.length()).toBeGreaterThan(0.5);
  });
});
