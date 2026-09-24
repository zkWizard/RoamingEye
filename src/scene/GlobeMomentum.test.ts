import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  GlobeMomentum,
  coastDistance,
  coastStep,
  releaseVelocity,
  DECELERATION_RATE,
  MAX_COAST_SPEED,
  type OrbitLike,
  type PointerLike,
  type PointerSample,
} from "./GlobeMomentum";

const HEIGHT = 720;
const ROTATE_SPEED = 0.45;

const stubControls = (): OrbitLike & { updates: number } => {
  const controls = {
    target: new THREE.Vector3(),
    enabled: true,
    rotateSpeed: ROTATE_SPEED,
    updates: 0,
    update: () => {
      controls.updates++;
      return true;
    },
  };
  return controls;
};

const at = (t: number, x: number, y = 300): PointerLike => ({
  timeStamp: t,
  clientX: x,
  clientY: y,
});

const azimuthOf = (camera: THREE.Camera): number =>
  new THREE.Spherical().setFromVector3(camera.position).theta;

/** px/s of pointer travel → rad/s of globe turn, as OrbitControls maps it. */
const radPerSec = (pxPerSec: number): number =>
  (2 * Math.PI * pxPerSec * ROTATE_SPEED) / HEIGHT;

const setup = (coast = true) => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 3);
  const controls = stubControls();
  const momentum = new GlobeMomentum(
    camera,
    controls,
    { clientHeight: HEIGHT },
    coast
  );
  return { camera, controls, momentum };
};

/** Drag right at `pxPerSec` for 150 ms in 10 ms steps, then let go. */
const flick = (momentum: GlobeMomentum, pxPerSec: number): void => {
  momentum.grab(at(0, 100));
  for (let t = 10; t <= 150; t += 10) {
    momentum.move(at(t, 100 + (pxPerSec * t) / 1000));
  }
  momentum.release(at(150, 100 + (pxPerSec * 150) / 1000));
};

/** Run the render loop at 60 Hz until the coast stops. */
const settle = (momentum: GlobeMomentum): void => {
  for (let t = 0; t < 5000; t += 1000 / 60) momentum.tick(t);
};

describe("coast physics", () => {
  it("projects the distance Apple's scroll physics does", () => {
    // Designing Fluid Interfaces: (v / 1000) · d / (1 − d).
    expect(coastDistance(2)).toBeCloseTo(((2 / 1000) * 0.995) / 0.005, 10);
  });

  it("integrates to the same distance at 60 Hz, 120 Hz and in one step", () => {
    const run = (frameMs: number): number => {
      let speed = 3;
      let total = 0;
      for (let t = 0; t < 3000; t += frameMs) {
        const step = coastStep(speed, frameMs);
        total += step.distance;
        speed = step.speed;
      }
      return total;
    };
    const oneStep = coastStep(3, 3000).distance;
    expect(run(1000 / 60)).toBeCloseTo(oneStep, 6);
    expect(run(1000 / 120)).toBeCloseTo(oneStep, 6);
    // And the whole coast converges on the projection (-ln d ≈ 1 − d).
    expect(oneStep).toBeCloseTo(coastDistance(3), 2);
  });

  it("decays the speed by the rate per millisecond", () => {
    expect(coastStep(1, 200).speed).toBeCloseTo(DECELERATION_RATE ** 200, 12);
  });
});

describe("releaseVelocity", () => {
  const trail = (points: [number, number][]): PointerSample[] =>
    points.map(([t, x]) => ({ t, x, y: 0 }));

  it("reads the speed over the last 100 ms only", () => {
    const samples = trail([
      [0, 0], // an old slow stretch, outside the window
      [400, 100],
      [450, 150],
      [500, 200],
    ]);
    expect(releaseVelocity(samples, 500).x).toBeCloseTo(1000, 10);
  });

  it("is zero when the pointer came to rest before letting go", () => {
    const samples = trail([
      [0, 0],
      [50, 80],
      [400, 80], // the release, 350 ms after the last move
    ]);
    expect(releaseVelocity(samples, 400)).toEqual({ x: 0, y: 0 });
  });

  it("still reads a flick when events arrive once per 110 ms frame", () => {
    const samples = trail([
      [0, 0],
      [110, 60],
      [220, 120], // release
    ]);
    // Anchored on the 110 ms event: 60 px over 0.11 s.
    expect(releaseVelocity(samples, 220).x).toBeCloseTo(60 / 0.11, 10);
  });

  it("is zero with fewer than two samples", () => {
    expect(releaseVelocity(trail([[0, 1]]), 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("GlobeMomentum", () => {
  it("keeps turning after a flick, the way the drag was going, then stops", () => {
    const { camera, controls, momentum } = setup();
    flick(momentum, 800);
    expect(momentum.isCoasting).toBe(true);

    const released = azimuthOf(camera);
    settle(momentum);
    expect(momentum.isCoasting).toBe(false);
    // A rightward drag lowers theta (OrbitControls' rotateLeft), so the
    // coast does too, by the projection of the release speed, less the
    // ~0.01 rad tail below MIN_COAST_SPEED that is cut rather than crawled.
    const coasted = azimuthOf(camera) - released;
    expect(coasted).toBeLessThan(0);
    expect(Math.abs(coasted + coastDistance(radPerSec(800)))).toBeLessThan(
      0.012
    );
    expect(camera.position.length()).toBeCloseTo(3, 10); // distance untouched
    expect(controls.updates).toBeGreaterThan(0); // hash/aim hear about it
  });

  it("doesn't coast when the pointer stopped before letting go", () => {
    const { momentum } = setup();
    momentum.grab(at(0, 100));
    momentum.move(at(50, 200));
    momentum.release(at(400, 200));
    expect(momentum.isCoasting).toBe(false);
  });

  it("stops dead when grabbed mid-coast", () => {
    const { camera, momentum } = setup();
    flick(momentum, 800);
    momentum.tick(0);
    momentum.tick(16);
    momentum.grab(at(200, 300));
    const caught = azimuthOf(camera);
    momentum.tick(32);
    momentum.tick(48);
    expect(momentum.isCoasting).toBe(false);
    expect(azimuthOf(camera)).toBe(caught);
  });

  it("doesn't coast under reduced motion", () => {
    const { momentum } = setup(false);
    flick(momentum, 800);
    expect(momentum.isCoasting).toBe(false);
  });

  it("doesn't coast when the controls were off (a region-drawer sweep)", () => {
    const { controls, momentum } = setup();
    controls.enabled = false;
    flick(momentum, 800);
    expect(momentum.isCoasting).toBe(false);
  });

  it("doesn't throw after stop() (a pinch took over mid-drag)", () => {
    const { momentum } = setup();
    momentum.grab(at(0, 100));
    momentum.move(at(50, 200));
    momentum.stop();
    momentum.release(at(60, 220)); // the last finger lifting
    expect(momentum.isCoasting).toBe(false);
  });

  it("caps a wild flick at one turn a second", () => {
    const { camera, momentum } = setup();
    flick(momentum, 50_000);
    const released = azimuthOf(camera);
    settle(momentum);
    expect(Math.abs(azimuthOf(camera) - released)).toBeLessThanOrEqual(
      coastDistance(MAX_COAST_SPEED) + 1e-6
    );
  });

  it("reads coalesced moves when the browser batches them", () => {
    const { momentum } = setup();
    momentum.grab(at(0, 100));
    const batched: PointerLike = {
      ...at(100, 200),
      getCoalescedEvents: () => [at(40, 140), at(70, 170), at(100, 200)],
    };
    momentum.move(batched);
    momentum.release(at(100, 200));
    expect(momentum.isCoasting).toBe(true);
  });
});
