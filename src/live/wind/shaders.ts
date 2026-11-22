import { METRES_PER_DEGREE, MIN_ADVECT_COS } from "./field";
import { glslRampFunction, SPEED_STOPS, TEMP_STOPS } from "./ramp";

const RAMP_SPEED = glslRampFunction("rampSpeed", SPEED_STOPS);
const RAMP_TEMP = glslRampFunction("rampTemp", TEMP_STOPS);

const PACK = /* glsl */ `
float unpack16(vec2 c) {
  float hi = floor(c.r * 255.0 + 0.5);
  float lo = floor(c.g * 255.0 + 0.5);
  return (hi * 256.0 + lo) / 65535.0;
}
vec2 pack16(float n) {
  float x = clamp(n, 0.0, 1.0) * 65535.0;
  float hi = floor(x / 256.0);
  float lo = floor(x - hi * 256.0 + 0.5);
  return vec2(hi / 255.0, lo / 255.0);
}
`;

const FIELD_SAMPLE = /* glsl */ `
uniform sampler2D uField;
uniform float uLat0;
uniform float uLon0;
uniform float uDLat;
uniform float uDLon;
uniform float uNLon;
uniform float uNLat;

vec4 sampleField(float lon, float lat) {
  float x = (lon - uLon0) / uDLon;
  float y = (lat - uLat0) / uDLat;
  float x0 = floor(x);
  float y0 = floor(y);
  float fx = clamp(x - x0, 0.0, 1.0);
  float fy = clamp(y - y0, 0.0, 1.0);
  float xa = mod(x0, uNLon);
  float xb = mod(x0 + 1.0, uNLon);
  if (xa < 0.0) xa += uNLon;
  if (xb < 0.0) xb += uNLon;
  float ya = clamp(y0, 0.0, uNLat - 1.0);
  float yb = clamp(y0 + 1.0, 0.0, uNLat - 1.0);
  vec2 size = vec2(uNLon, uNLat);
  vec4 s00 = texture2D(uField, (vec2(xa, ya) + 0.5) / size);
  vec4 s10 = texture2D(uField, (vec2(xb, ya) + 0.5) / size);
  vec4 s01 = texture2D(uField, (vec2(xa, yb) + 0.5) / size);
  vec4 s11 = texture2D(uField, (vec2(xb, yb) + 0.5) / size);
  return mix(mix(s00, s10, fx), mix(s01, s11, fx), fy);
}
`;

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ADVECT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uState;
uniform float uDtHours;
uniform float uDtSeconds;
uniform float uSeed;
varying vec2 vUv;
${PACK}
${FIELD_SAMPLE}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 s = texture2D(uState, vUv);
  float lon = unpack16(s.rg) * 360.0 - 180.0;
  float lat = unpack16(s.ba) * 180.0 - 90.0;
  vec4 w = sampleField(lon, lat);
  float dtSec = uDtHours * 3600.0;
  float dLat = 0.0;
  float dLon = 0.0;
  if (w.a > 0.5) {
    float latRad = radians(lat);
    float cosLat = max(${MIN_ADVECT_COS}, cos(latRad));
    dLat = (w.g * dtSec) / ${METRES_PER_DEGREE}.0;
    dLon = (w.r * dtSec) / (${METRES_PER_DEGREE}.0 * cosLat);
  }
  lon += dLon;
  lat += dLat;
  float h = hash(gl_FragCoord.xy + uSeed);
  float h2 = hash(gl_FragCoord.yx - uSeed);
  if (abs(lat) > 84.0 || h < uDtSeconds * 0.012) {
    lon = h * 360.0 - 180.0;
    lat = degrees(asin(clamp(h2 * 2.0 - 1.0, -1.0, 1.0)));
  }
  lon = mod(lon + 180.0, 360.0) - 180.0;
  lat = clamp(lat, -90.0, 90.0);
  gl_FragColor = vec4(pack16((lon + 180.0) / 360.0), pack16((lat + 90.0) / 180.0));
}
`;

export const FADE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform float uDecay;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uTex, vUv) * uDecay;
}
`;

export const STAMP_VERT = /* glsl */ `
attribute float aIndex;
uniform sampler2D uState;
uniform vec2 uStateSize;
uniform float uPointSize;
varying vec2 vLonLat;
${PACK}
void main() {
  vec2 ij = vec2(mod(aIndex, uStateSize.x), floor(aIndex / uStateSize.x));
  vec2 uv = (ij + 0.5) / uStateSize;
  vec4 s = texture2D(uState, uv);
  float lon = unpack16(s.rg) * 360.0 - 180.0;
  float lat = unpack16(s.ba) * 180.0 - 90.0;
  vLonLat = vec2(lon, lat);
  float x = (lon + 180.0) / 360.0;
  float y = (lat + 90.0) / 180.0;
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uPointSize;
}
`;

export const STAMP_FRAG = /* glsl */ `
precision highp float;
uniform float uMode;
varying vec2 vLonLat;
${FIELD_SAMPLE}
${RAMP_SPEED}
${RAMP_TEMP}
void main() {
  vec4 w = sampleField(vLonLat.x, vLonLat.y);
  if (w.a < 0.5) discard;
  float speed = length(w.rg);
  vec3 color = uMode < 0.5 ? rampSpeed(speed) : rampTemp(w.b);
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float falloff = smoothstep(1.0, 0.2, length(pc));
  // Premultiplied. The trail stores color * alpha so a later fade stays
  // transparent instead of turning black.
  float alpha = 0.62 * falloff;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export const DISPLAY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const DISPLAY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTrail;
varying vec2 vUv;
void main() {
  // c is premultiplied. Cap the coverage at 0.6 so the basemap stays visible,
  // and scale rgb with alpha so the fade does not leave a black shell.
  vec4 c = texture2D(uTrail, vUv);
  if (c.a < 0.03) discard;
  float a = min(c.a, 0.6);
  gl_FragColor = vec4(c.rgb * (a / c.a), a);
}
`;
