import * as THREE from "three";

/**
 * Momentum for the globe drag.
 *
 * OrbitControls' `enableDamping` looks like inertia but is not momentum. Each
 * frame it pays out a fixed fraction of the drag still owed, so while the
 * pointer moves the ground trails it by ~200 ms, and after release the globe
 * travels exactly as far as the pointer did however fast it was going: a flick
 * and a slow drag of the same length land in the same place. It is also counted
 * per frame, so a 120 Hz display settles twice as fast as a 60 Hz one.
 *
 * With damping off the drag tracks the pointer 1:1, and this class supplies the
 * momentum instead: on release the globe keeps the speed the pointer was moving
 * at over the last `VELOCITY_WINDOW_MS`, decaying exponentially in wall-clock
 * time, which is the scroll-view model from Apple's *Designing Fluid Interfaces*
 * (WWDC 2018). A pointer that came to rest before letting go has no velocity, so
 * the globe stays exactly where it was put.
 *
 * The velocity comes from the pointer's own event history, not from frames.
 * Pointer timestamps are exact at any frame rate. The camera only moves once a
 * frame, so at 9 fps (SwiftShader in CI, or a phone under load) a flick is over
 * inside two frames and any frame-sampled speed is mostly guesswork.
 */

/**
 * Velocity kept per millisecond of coasting. 0.995 gives a 200 ms time
 * constant, the same settle the old `dampingFactor = 0.08` had at 60 Hz, so a
 * flick feels as heavy as the globe always did. The difference is that now the
 * distance comes from the release speed: a coast covers `v × 0.2 s`
 * (see `coastDistance`).
 */
export const DECELERATION_RATE = 0.995;
/** How far back from release the pointer's velocity is read. */
export const VELOCITY_WINDOW_MS = 100;
/** Below this (rad/s) a release reads as a stop, not a throw. */
export const MIN_COAST_SPEED = 0.05;
/** One turn a second. A synthetic or wild flick can't spin the globe away. */
export const MAX_COAST_SPEED = 2 * Math.PI;
/** Keep the camera off the poles, where its heading is undefined. */
const POLE_MARGIN = 0.01;

export interface PointerSample {
  /** The event's `timeStamp`, ms. */
  t: number;
  x: number;
  y: number;
}

/** How far a release at `speed` (per second) coasts before it stops. */
export function coastDistance(speed: number, rate = DECELERATION_RATE): number {
  return ((speed / 1000) * rate) / (1 - rate);
}

/**
 * One frame of coasting: the distance covered in `dtMs` at `speed`, integrated
 * exactly over the decay rather than stepped, so the path is identical at any
 * frame rate, and the speed left at the end of the frame.
 */
export function coastStep(
  speed: number,
  dtMs: number,
  rate = DECELERATION_RATE
): { distance: number; speed: number } {
  const decay = Math.pow(rate, dtMs);
  return {
    distance: ((speed / 1000) * (decay - 1)) / Math.log(rate),
    speed: speed * decay,
  };
}

/**
 * The pointer's velocity (px/s) over the last `windowMs` before `now`. It is
 * measured from the last sample before the window, so it always spans the whole
 * window even when events arrive only once a frame on a slow device. Zero when
 * the pointer rested for longer than the window, or there's too little history.
 */
export function releaseVelocity(
  samples: readonly PointerSample[],
  now: number,
  windowMs = VELOCITY_WINDOW_MS
): { x: number; y: number } {
  let start = samples.findIndex((s) => s.t >= now - windowMs);
  if (start === -1) return { x: 0, y: 0 };
  if (start > 0 && samples[start - 1].t >= now - windowMs * 3) start--;
  const first = samples[start];
  const last = samples[samples.length - 1];
  const seconds = (last.t - first.t) / 1000;
  if (seconds <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
}

/** The part of OrbitControls this needs. */
export interface OrbitLike {
  target: THREE.Vector3;
  enabled: boolean;
  rotateSpeed: number;
  update(): boolean;
}

/** A pointer event, or the parts of one this reads. */
export interface PointerLike {
  timeStamp: number;
  clientX: number;
  clientY: number;
  getCoalescedEvents?: () => PointerLike[];
}

export class GlobeMomentum {
  private readonly samples: PointerSample[] = [];
  private tracking = false; // a pointer is down on the globe
  private vAzimuth = 0; // rad/s
  private vPolar = 0; // rad/s
  private lastTick: number | undefined;
  private readonly offset = new THREE.Vector3();
  private readonly spherical = new THREE.Spherical();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly controls: OrbitLike,
    /** The drag surface. OrbitControls scales a drag by its height. */
    private readonly surface: { clientHeight: number },
    /** false under prefers-reduced-motion: the globe stops where it's let go. */
    private readonly coastEnabled = true
  ) {}

  get isCoasting(): boolean {
    return this.vAzimuth !== 0 || this.vPolar !== 0;
  }

  /** A pointer went down on the globe: catch it where it is and start measuring. */
  grab(e: PointerLike): void {
    this.stop();
    this.tracking = true;
    this.record(e);
  }

  move(e: PointerLike): void {
    if (!this.tracking) return;
    // Browsers deliver one pointermove a frame. The coalesced list holds every
    // position in between, each with its own timestamp.
    const events = e.getCoalescedEvents?.() ?? [];
    for (const c of events.length > 0 ? events : [e]) this.record(c);
  }

  /** Let go: turn the pointer's last velocity into the globe's. */
  release(e: PointerLike): void {
    if (!this.tracking) return;
    this.record(e);
    this.tracking = false;
    const px = releaseVelocity(this.samples, e.timeStamp);
    this.samples.length = 0;
    // A drag the controls didn't turn the globe for (the region drawer holds
    // them off while it sweeps a box) has nothing to carry on.
    if (!this.coastEnabled || !this.controls.enabled) return;
    // OrbitControls' own mapping: 2π × pixels × rotateSpeed / height, for
    // both axes, and a rightward or downward drag lowers theta or phi.
    const k =
      (2 * Math.PI * this.controls.rotateSpeed) /
      Math.max(1, this.surface.clientHeight);
    let azimuth = -px.x * k;
    let polar = -px.y * k;
    const speed = Math.hypot(azimuth, polar);
    if (speed < MIN_COAST_SPEED) return;
    if (speed > MAX_COAST_SPEED) {
      azimuth *= MAX_COAST_SPEED / speed; // keep the direction
      polar *= MAX_COAST_SPEED / speed;
    }
    this.vAzimuth = azimuth;
    this.vPolar = polar;
  }

  /** Drop any coast or throw in progress: a fly-to, a key press or a pinch took over. */
  stop(): void {
    this.tracking = false;
    this.vAzimuth = 0;
    this.vPolar = 0;
    this.samples.length = 0;
  }

  /** Once per frame, after `controls.update()`. */
  tick(now: number): void {
    const dtMs = this.lastTick === undefined ? 0 : now - this.lastTick;
    this.lastTick = now;
    if (!this.isCoasting || dtMs <= 0) return;
    const azimuth = coastStep(this.vAzimuth, dtMs);
    const polar = coastStep(this.vPolar, dtMs);
    this.vAzimuth = azimuth.speed;
    this.vPolar = polar.speed;
    if (Math.hypot(this.vAzimuth, this.vPolar) < MIN_COAST_SPEED) {
      this.vAzimuth = 0;
      this.vPolar = 0;
    }
    this.turn(azimuth.distance, polar.distance);
  }

  private record(e: PointerLike): void {
    this.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    // Only the window before release (plus one anchor sample) is ever read,
    // so a long drag doesn't pile up history.
    const cutoff = e.timeStamp - VELOCITY_WINDOW_MS * 4;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  private turn(dAzimuth: number, dPolar: number): void {
    this.offset.copy(this.camera.position).sub(this.controls.target);
    this.spherical.setFromVector3(this.offset);
    this.spherical.theta += dAzimuth;
    const phi = this.spherical.phi + dPolar;
    this.spherical.phi = Math.min(
      Math.PI - POLE_MARGIN,
      Math.max(POLE_MARGIN, phi)
    );
    // Reaching a pole ends the vertical part of the throw, not the spin.
    if (phi !== this.spherical.phi) this.vPolar = 0;
    this.offset.setFromSpherical(this.spherical);
    this.camera.position.copy(this.controls.target).add(this.offset);
    this.camera.lookAt(this.controls.target);
    this.controls.update(); // adopt the new position and fire `change`
  }
}
