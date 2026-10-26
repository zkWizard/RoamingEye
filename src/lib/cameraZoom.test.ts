import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { latLngToVector3 } from "./geo";
import {
  ALTITUDE_ZOOM_STEP,
  MAX_CAMERA_DISTANCE,
  MIN_AGL_M,
  altitudeZoomDistance,
  clipPlanes,
  ellipsoidRadiusUnits,
  metresAboveEllipsoid,
  minimumCameraDistance,
  easedAltitudeDistance,
  nadirMetresPerPixel,
  pinchAltitudeFactor,
  raySpherePoint,
  resolveGroundPoint,
  terrainErrorTarget,
  wheelAltitudeFactor,
} from "./cameraZoom";

describe("ellipsoidRadiusUnits", () => {
  it("is the scaled equatorial radius at the equator and shorter at the poles", () => {
    expect(ellipsoidRadiusUnits(0)).toBeCloseTo(0.996, 6);
    expect(ellipsoidRadiusUnits(90)).toBeLessThan(ellipsoidRadiusUnits(0));
    expect(ellipsoidRadiusUnits(-90)).toBeCloseTo(ellipsoidRadiusUnits(90), 8);
  });

  it("puts Houston a few kilometres inside the unit sphere", () => {
    const houston = ellipsoidRadiusUnits(29.76);
    expect(houston).toBeLessThan(1);
    expect(houston).toBeGreaterThan(0.994);
  });
});

describe("minimumCameraDistance", () => {
  it("sits about MIN_AGL above flat ground and clears a summit", () => {
    const houston = minimumCameraDistance(29.76, 15);
    expect(metresAboveEllipsoid(houston, 29.76)).toBeCloseTo(MIN_AGL_M, 0);
    const everest = minimumCameraDistance(27.99, 8848);
    expect(metresAboveEllipsoid(everest, 27.99)).toBeGreaterThan(8800);
    expect(everest).toBeGreaterThan(houston);
  });

  it("is far inside the old orbital floor of 1.06", () => {
    expect(minimumCameraDistance(29.76)).toBeLessThan(1.01);
  });
});

describe("altitude zoom", () => {
  const floor = minimumCameraDistance(29.76);
  const limits = { min: floor, max: MAX_CAMERA_DISTANCE };

  it("multiplies altitude, so the old floor is not the end of the wheel", () => {
    const surface = ellipsoidRadiusUnits(29.76);
    let distance = 1.06;
    const startAgl = distance - surface;
    distance = altitudeZoomDistance(
      distance,
      surface,
      1 / ALTITUDE_ZOOM_STEP,
      limits
    );
    expect(distance - surface).toBeCloseTo(startAgl / ALTITUDE_ZOOM_STEP, 8);
    expect(distance).toBeLessThan(1.06);
  });

  it("reaches street level from the old floor and stops on the ground clearance", () => {
    const surface = ellipsoidRadiusUnits(29.76);
    let distance = 1.06;
    for (let i = 0; i < 40; i++) {
      distance = altitudeZoomDistance(
        distance,
        surface,
        1 / ALTITUDE_ZOOM_STEP,
        limits
      );
    }
    expect(distance).toBeCloseTo(floor, 8);
    expect(metresAboveEllipsoid(distance, 29.76)).toBeCloseTo(MIN_AGL_M, 0);
  });

  it("zooms back out to the same orbital cap", () => {
    const surface = ellipsoidRadiusUnits(29.76);
    let distance = floor;
    for (let i = 0; i < 40; i++) {
      distance = altitudeZoomDistance(
        distance,
        surface,
        ALTITUDE_ZOOM_STEP,
        limits
      );
    }
    expect(distance).toBeCloseTo(MAX_CAMERA_DISTANCE, 6);
  });
});

describe("wheel and pinch factors", () => {
  it("treats one mouse notch as one altitude step", () => {
    expect(wheelAltitudeFactor(-100, 0, false)).toBeCloseTo(
      1 / ALTITUDE_ZOOM_STEP,
      8
    );
    expect(wheelAltitudeFactor(100, 0, false)).toBeCloseTo(
      ALTITUDE_ZOOM_STEP,
      8
    );
  });

  it("amplifies a trackpad pinch and caps a single wild event", () => {
    const pinch = wheelAltitudeFactor(-12, 0, true);
    expect(pinch).toBeLessThan(1);
    // ctrlKey is the trackpad pinch: the same delta moves much further in.
    expect(pinch).toBeLessThan(wheelAltitudeFactor(-12, 0, false));
    expect(wheelAltitudeFactor(-10_000, 0, true)).toBeCloseTo(
      Math.pow(ALTITUDE_ZOOM_STEP, -6),
      8
    );
  });

  it("scales a two-finger pinch with the fingers", () => {
    expect(pinchAltitudeFactor(100, 200)).toBeCloseTo(0.5, 8);
    expect(pinchAltitudeFactor(200, 100)).toBeCloseTo(2, 8);
    expect(pinchAltitudeFactor(0, 100)).toBe(1);
  });
});

describe("eased altitude zoom", () => {
  const surface = ellipsoidRadiusUnits(29.76);

  it("moves toward the destination without reaching it in one short frame", () => {
    const step = easedAltitudeDistance(1.06, surface + 0.001, surface, 1 / 60);
    expect(step.distance).toBeLessThan(1.06);
    expect(step.distance).toBeGreaterThan(surface + 0.001);
    expect(step.settled).toBe(false);
  });

  it("lands on the destination after a short glide", () => {
    let distance = 1.06;
    let settled = false;
    for (let i = 0; i < 90 && !settled; i++) {
      const step = easedAltitudeDistance(
        distance,
        surface + 0.001,
        surface,
        1 / 60
      );
      distance = step.distance;
      settled = step.settled;
    }
    expect(settled).toBe(true);
    expect(distance).toBeCloseTo(surface + 0.001, 6);
  });

  it("does not move when no time has passed", () => {
    const step = easedAltitudeDistance(1.06, 1.02, surface, 0);
    expect(step.distance).toBe(1.06);
    expect(step.settled).toBe(false);
  });
});

describe("terrain error target", () => {
  it("stays coarse from orbit and sharp at street level", () => {
    expect(terrainErrorTarget(8_000)).toBe(8);
    expect(terrainErrorTarget(0.3)).toBe(1.25);
    const city = terrainErrorTarget(150);
    expect(city).toBeGreaterThan(1.25);
    expect(city).toBeLessThan(3);
  });
});

describe("nadir resolution and clip planes", () => {
  it("reports a few tens of centimetres per pixel at the street-level floor", () => {
    const mpp = nadirMetresPerPixel(MIN_AGL_M, 900, 45);
    expect(mpp).toBeGreaterThan(0.15);
    expect(mpp).toBeLessThan(0.4);
  });

  it("pulls the near plane inside the old 0.01 once the camera is close", () => {
    const surface = ellipsoidRadiusUnits(29.76);
    const street = minimumCameraDistance(29.76);
    const clip = clipPlanes(street, surface);
    expect(clip.near).toBeLessThan(0.01);
    expect(clip.near).toBeLessThan(street - surface);
    expect(clip.far / clip.near).toBeLessThan(2_000);
    const orbit = clipPlanes(3.2, surface);
    expect(orbit.far).toBeGreaterThan(40);
    expect(orbit.near).toBeLessThan(3.2 - surface);
  });
});

describe("resolveGroundPoint", () => {
  it("keeps an outside mesh hit and intersects the ellipsoid from inside", () => {
    const mesh = { x: 1, y: 0, z: 0 };
    expect(
      resolveGroundPoint(
        1.5,
        0,
        { x: 2, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        mesh
      )
    ).toBe(mesh);
    const camera = latLngToVector3(29.76, -95.37, minimumCameraDistance(29.76));
    const origin = { x: camera.x, y: camera.y, z: camera.z };
    const direction = camera.clone().negate().normalize();
    const hit = resolveGroundPoint(camera.length(), 29.76, origin, direction, {
      x: 0,
      y: 0,
      z: 0,
    });
    expect(hit).not.toBeNull();
    const point = new Vector3(hit!.x, hit!.y, hit!.z);
    expect(point.length()).toBeCloseTo(ellipsoidRadiusUnits(29.76), 4);
    expect(point.distanceTo(camera)).toBeLessThan(0.01);
  });

  it("returns null when the ray misses the sphere", () => {
    expect(
      raySpherePoint({ x: 2, y: 2, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5)
    ).toBeNull();
  });
});
