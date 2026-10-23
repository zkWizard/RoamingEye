import * as THREE from "three";
import { TilesRenderer, GlobeControls, WGS84_ELLIPSOID, CAMERA_FRAME } from "3d-tiles-renderer";
import { TerrariumMeshPlugin, ImageOverlayPlugin, XYZTilesOverlay } from "3d-tiles-renderer/plugins";
import {
  AerialPerspectiveEffect, PrecomputedTexturesLoader, SkyMaterial, getSunDirectionECEF,
} from "@takram/three-atmosphere";
import { EffectComposer, RenderPass, EffectPass, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import "../shared/ui.css";
import { ESRI_IMAGERY, TERRARIUM, LAYERS, gibsUrl, fetchQuakes, depthColor, mountUI, sunDateFor } from "../shared/data.js";

const ATMO = new URLSearchParams(location.search).get("atmo") !== "0";

const renderer = new THREE.WebGLRenderer({ antialias: !ATMO, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 10, 1e8);

// Sun lighting from the real solar position for DATE.
const sunDir = new THREE.Vector3();
const sun = new THREE.DirectionalLight(0xffffff, ATMO ? 2.2 : 3);
const sunTargets = [];
function setSun(date) {
  getSunDirectionECEF(date, sunDir);
  sun.position.copy(sunDir).multiplyScalar(1e8);
  for (const t of sunTargets) t.sunDirection.copy(sunDir);
}
scene.add(sun, new THREE.AmbientLight(0xffffff, ATMO ? 0.04 : 0.15));

// Terrain mesh from keyless Terrarium tiles; imagery draped as overlays.
let layerKey, month, opacity, science;
// Terrain options are fixed once the root loads, so exaggeration changes rebuild the tileset.
let tiles, overlays;
const controls = new GlobeControls(scene, camera, renderer.domElement);
controls.enableDamping = true;
function buildTiles(heightScale) {
  if (tiles) { scene.remove(tiles.group); tiles.dispose(); }
  tiles = new TilesRenderer();
  overlays = new ImageOverlayPlugin({ renderer });
  tiles.registerPlugin(new TerrariumMeshPlugin({ url: TERRARIUM, maxZoom: 15, heightScale }));
  tiles.registerPlugin(overlays);
  overlays.addOverlay(new XYZTilesOverlay({ url: ESRI_IMAGERY, levels: 19 }));
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  scene.add(tiles.group);
  controls.setEllipsoid(tiles.ellipsoid, tiles.group);
  science = null;
  swapChain = Promise.resolve();
  refreshScience();
}

// Atmosphere: precomputed Bruneton scattering (takram) – sky backdrop + aerial perspective.
let composer = null;
if (ATMO) {
  const skyMaterial = new SkyMaterial();
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMaterial);
  sky.frustumCulled = false;
  scene.add(sky);
  const aerial = new AerialPerspectiveEffect(camera, { correctGeometricError: true, sunLight: false, skyLight: false, transmittance: true, inscatter: true });
  new PrecomputedTexturesLoader().setType(renderer).load(`${import.meta.env.BASE_URL}atmosphere`, (textures) => {
    Object.assign(skyMaterial, textures);
    Object.assign(aerial, textures);
  });
  sunTargets.push(skyMaterial, aerial);
  composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new EffectPass(camera, aerial, new ToneMappingEffect({ mode: ToneMappingMode.AGX })));
} else {
  scene.background = new THREE.Color(0x000000);
}

// Science overlay (NASA GIBS), swapped per month.
// Overlay removal while tiles are still loading is fragile in 3d-tiles-renderer 0.5.x,
// so swaps are serialized: the old overlay is dropped only once the new one is ready.
let swapChain = Promise.resolve();
function refreshScience() {
  const key = layerKey, m = month;
  swapChain = swapChain.then(async () => {
    const old = science;
    science = null;
    if (key) {
      science = new XYZTilesOverlay({ url: gibsUrl(key, m), levels: LAYERS[key].level + 1, opacity });
      overlays.addOverlay(science);
      await science.whenReady();
      await new Promise((r) => setTimeout(r, 700));
    }
    if (old) overlays.deleteOverlay(old);
  }).catch(console.error);
}

// USGS quakes as screen-space points.
const dot = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
})();
const quakePts = new THREE.Points(
  new THREE.BufferGeometry(),
  new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, map: dot, alphaTest: 0.5 }),
);
quakePts.frustumCulled = false;
scene.add(quakePts);
fetchQuakes().then((list) => {
  const pos = [], col = [], v = new THREE.Vector3();
  for (const q of list) {
    WGS84_ELLIPSOID.getCartographicToPosition(q.lat * THREE.MathUtils.DEG2RAD, q.lon * THREE.MathUtils.DEG2RAD, 3000, v);
    pos.push(v.x, v.y, v.z);
    col.push(...depthColor(q.depthKm));
  }
  quakePts.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  quakePts.geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
});

// Simple fly-to: interpolate cartographic position + orientation with a height arc.
const D2R = THREE.MathUtils.DEG2RAD;
let flight = null;
let exagTimer;
function poseFor({ lat, lon, heightM, pitch = -90, heading = 0 }) {
  const back = pitch > -89 ? heightM / Math.tan(-pitch * D2R) / 111_000 : 0;
  return { lat: (lat - back) * D2R, lon: lon * D2R, h: heightM, el: pitch * D2R, az: heading * D2R };
}
function applyPose(p) {
  const m = new THREE.Matrix4();
  WGS84_ELLIPSOID.getObjectFrame(p.lat, p.lon, p.h, p.az, p.el, 0, m, CAMERA_FRAME);
  m.decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateMatrixWorld();
}
function flyTo(target, duration = 3) {
  setSun(sunDateFor(target.lon));
  const to = poseFor(target);
  if (!duration) { applyPose(to); return; }
  const c = WGS84_ELLIPSOID.getPositionToCartographic(camera.position, {});
  const from = { lat: c.lat, lon: c.lon, h: c.height, el: -Math.PI / 2, az: 0 };
  flight = { from, to, t0: performance.now(), dur: duration * 1000 };
}
function stepFlight(now) {
  if (!flight) return;
  const { from, to, t0, dur } = flight;
  const t = Math.min(1, (now - t0) / dur);
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  let dLon = to.lon - from.lon;
  if (dLon > Math.PI) dLon -= 2 * Math.PI;
  if (dLon < -Math.PI) dLon += 2 * Math.PI;
  const arc = Math.sin(Math.PI * e) * Math.min(8e6, Math.abs(to.lat - from.lat + dLon) * 3e6);
  applyPose({
    lat: from.lat + (to.lat - from.lat) * e,
    lon: from.lon + dLon * e,
    h: Math.exp(Math.log(from.h) + (Math.log(to.h) - Math.log(from.h)) * e) + arc,
    el: from.el + (to.el - from.el) * e,
    az: from.az + (to.az - from.az) * e,
  });
  if (t === 1) flight = null;
}
renderer.domElement.addEventListener("pointerdown", () => (flight = null));

const { initial } = mountUI("three.js + 3DTilesRendererJS", {
  setLayer: (k) => { layerKey = k; refreshScience(); },
  setMonth: (m) => { month = m; refreshScience(); },
  setOpacity: (o) => { opacity = o; if (science) science.opacity = o; },
  setExaggeration: (e) => {
    clearTimeout(exagTimer);
    exagTimer = setTimeout(() => buildTiles(e), 300);
  },
  setQuakes: (on) => (quakePts.visible = on),
  flyTo,
});
({ layer: layerKey, month, opacity } = initial);
buildTiles(initial.exaggeration);
flyTo(initial.view, 0);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
  tiles.setResolutionFromRenderer(camera, renderer);
});

renderer.setAnimationLoop((now) => {
  stepFlight(now);
  if (!flight) controls.update();
  camera.updateMatrixWorld();
  tiles.update();
  if (composer) composer.render();
  else renderer.render(scene, camera);
});
window.__three = { cart: () => WGS84_ELLIPSOID.getPositionToCartographic(camera.position, {}), get tiles() { return tiles; }, get overlays() { return overlays; }, get science() { return science; }, camera, controls, scene };
