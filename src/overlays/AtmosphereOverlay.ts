import * as THREE from "three";
import { ICONS } from "../ui/icons";
import { GLOBE_RADIUS, type MapOverlay } from "./types";

/**
 * A soft atmospheric halo around the globe — a back-side shell with a fresnel
 * rim that brightens toward the limb. Purely visual; additive over space.
 */
export class AtmosphereOverlay implements MapOverlay {
  readonly id = "atmosphere";
  readonly label = "Atmosphere";
  readonly icon = ICONS.atmosphere;
  readonly object: THREE.Mesh;
  readonly defaultOn = true;

  constructor(radius = GLOBE_RADIUS * 1.16) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0x4ea1ff) } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        uniform vec3 uColor;
        void main() {
          vec3 viewDir = normalize(-vView);
          float rim = 1.0 - abs(dot(vNormal, viewDir));
          float intensity = pow(rim, 3.0);
          gl_FragColor = vec4(uColor, intensity);
        }
      `,
    });

    this.object = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 64, 64),
      material
    );
    this.object.visible = false;
  }
}
