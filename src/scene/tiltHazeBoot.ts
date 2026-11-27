import { Color, FogExp2, type Scene } from "three";
import { clampPitch } from "../lib/cameraPose";

/**
 * A thin distance fog while the camera is pitched, so the limb reads as haze.
 * Loaded only once the visitor tilts.
 */

const FOG_COLOR = new Color(0x93a8bc);

export function bootTiltHaze(scene: Scene): (pitchDeg: number) => void {
  return (pitchDeg: number) => {
    const pitch = clampPitch(pitchDeg);
    if (pitch < 5) {
      if (scene.fog) scene.fog = null;
      return;
    }
    const t = Math.min(1, (pitch - 5) / 55);
    const density = 0.028 + t * 0.055;
    if (scene.fog instanceof FogExp2) {
      scene.fog.density = density;
      scene.fog.color.copy(FOG_COLOR);
    } else {
      scene.fog = new FogExp2(FOG_COLOR, density);
    }
  };
}
