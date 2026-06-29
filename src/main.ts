import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * RoamingEye — MVP
 * A single, grab-to-rotate 3D Earth rendered with NASA Blue Marble imagery.
 *
 * Scope of this milestone (intentionally minimal):
 *   - One textured sphere (the Earth), centered.
 *   - Drag / touch to rotate the globe in any direction.
 *   - No zoom and no pan yet — that comes in a later milestone.
 */

declare global {
  interface Window {
    /** Set to true after the first render — used by the e2e smoke test. */
    __APP_READY__?: boolean;
  }
}

const EARTH_RADIUS = 1;
const TEXTURE_URL = "/textures/earth_daymap.jpg";

const canvas = document.querySelector<HTMLCanvasElement>("#globe");
if (!canvas) {
  throw new Error("RoamingEye: #globe canvas element not found");
}
const loader = document.querySelector<HTMLElement>("#loader");

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Scene & camera ---------------------------------------------------------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 3.2);

// --- Lighting ---------------------------------------------------------------
// Strong ambient so the whole globe stays readable (satellite-eye feel),
// plus a soft directional light for a little dimensionality.
scene.add(new THREE.AmbientLight(0xffffff, 1.1));

const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(5, 3, 5);
scene.add(sunLight);

// --- Starfield backdrop -----------------------------------------------------
scene.add(createStarfield());

// --- Earth ------------------------------------------------------------------
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 96, 96),
  new THREE.MeshStandardMaterial({
    color: 0x222222, // placeholder tint until the texture loads
    roughness: 1,
    metalness: 0,
  })
);
scene.add(earth);

const textureLoader = new THREE.TextureLoader();
textureLoader.load(
  TEXTURE_URL,
  (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    earth.material.map = texture;
    earth.material.color.set(0xffffff);
    earth.material.needsUpdate = true;
    hideLoader();
  },
  undefined,
  (err) => {
    console.error("Failed to load Earth texture:", err);
    hideLoader();
  }
);

// --- Controls (rotate only) -------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // inertia for a natural "spin" feel
controls.dampingFactor = 0.08;
controls.enableZoom = false; // MVP: no zoom yet
controls.enablePan = false; // MVP: no pan
controls.rotateSpeed = 0.45;

// --- Render loop ------------------------------------------------------------
let signalledReady = false;
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);

  if (!signalledReady) {
    signalledReady = true;
    window.__APP_READY__ = true;
  }
});

// --- Resize handling --------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Helpers ----------------------------------------------------------------
function hideLoader(): void {
  loader?.classList.add("is-hidden");
}

function createStarfield(): THREE.Points {
  const starCount = 1500;
  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    // Scatter stars on a large sphere shell around the scene.
    const r = 40 + Math.random() * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
  });

  return new THREE.Points(geometry, material);
}
