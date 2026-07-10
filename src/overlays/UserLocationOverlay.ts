import * as THREE from "three";
import { latLngToVector3 } from "../lib/geo";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type HoverPointSource, type MapOverlay } from "./types";

/**
 * "You are here" — an opt-in red pin at the visitor's own location.
 *
 * Enabling the toggle asks the browser for geolocation (the standard
 * permission prompt is the consent gate — nothing is requested until the user
 * clicks). On grant, a red pin is dropped at the reported coordinates with a
 * "You are here!" hover label. On denial or error, the caller is told via
 * `onError` so it can revert the toggle and toast.
 *
 * Marked `ephemeral`: never persisted to the session, so a returning visitor is
 * never silently re-prompted — geolocation is a fresh, explicit choice each
 * visit.
 */

/** The minimal slice of the Geolocation API we use — injectable for tests. */
export interface GeolocationLike {
  getCurrentPosition(
    success: (position: {
      coords: { latitude: number; longitude: number };
    }) => void,
    error: (err: { code: number }) => void,
    options?: PositionOptions
  ): void;
}

/** Short, human message for a GeolocationPositionError code. */
export function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return "Location access was denied — enable it in your browser to drop your pin.";
    case 2: // POSITION_UNAVAILABLE
      return "Your location is unavailable right now. Try again in a moment.";
    case 3: // TIMEOUT
      return "Finding your location took too long. Try again.";
    default:
      return "Couldn't get your location.";
  }
}

const PIN_COLOR = 0xff3b30; // a clear map-pin red
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false, // city-level is plenty on a globe; faster, less battery
  timeout: 10_000,
  maximumAge: 60_000,
};

export class UserLocationOverlay implements MapOverlay {
  readonly id = "you-are-here";
  readonly label = "My location";
  readonly icon = ICONS.pin;
  readonly object = new THREE.Group();
  readonly ephemeral = true;

  /** Set once located — lets the HoverInspector show "You are here!". */
  hoverSource: HoverPointSource | undefined;

  private located = false;

  constructor(
    /** Report a denial/failure so the caller can revert the toggle + toast. */
    private readonly onError: (message: string) => void,
    private readonly geolocation:
      GeolocationLike | undefined = typeof navigator !== "undefined"
      ? navigator.geolocation
      : undefined,
    // Slightly higher above the surface than the geology markers so the pin
    // reads as "on top", and stays hittable near the limb.
    private readonly radius = GLOBE_RADIUS * 1.01
  ) {
    this.object.visible = false;
  }

  /**
   * Request the location on enable. NOT memoized: a denied or failed attempt
   * should be retryable the next time the user toggles it on. Rejects on
   * denial/error (after reporting via onError) so the caller keeps the pin off.
   */
  ensureLoaded(): Promise<void> {
    if (this.located) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (!this.geolocation) {
        this.onError("This browser can't share a location.");
        reject(new Error("geolocation unavailable"));
        return;
      }
      this.geolocation.getCurrentPosition(
        (position) => {
          this.placePin(position.coords.latitude, position.coords.longitude);
          this.located = true;
          resolve();
        },
        (err) => {
          this.onError(geolocationErrorMessage(err.code));
          reject(new Error(`geolocation error ${err.code}`));
        },
        GEOLOCATION_OPTIONS
      );
    });
  }

  private placePin(lat: number, lon: number): void {
    this.object.clear();
    const p = latLngToVector3(lat, lon, this.radius);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([p.x, p.y, p.z], 3)
    );
    const material = new THREE.PointsMaterial({
      size: 0.05,
      color: PIN_COLOR,
      transparent: true,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const texture = makePinTexture();
    if (texture) material.map = texture;

    const points = new THREE.Points(geometry, material);
    this.object.add(points);
    this.hoverSource = { points, describe: () => "You are here!" };
  }
}

/**
 * A classic map-pin teardrop sprite (white, so the material colour tints it
 * red). Null when there's no DOM (unit tests run headless) — the pin still
 * renders as a plain coloured point there.
 */
function makePinTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Teardrop: a circle head over a point, the familiar "drop a pin" silhouette.
  const cx = size / 2;
  const cy = size * 0.38;
  const r = size * 0.26;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.lineTo(cx, size * 0.94);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.98)";
  ctx.fill();
  // A hollow centre so it reads as a pin, not a blob.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
