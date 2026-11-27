import{Rt as e,St as t,_t as n,h as r,z as i}from"./three-D93lQpqA.js";var a=Math.PI/180;function o(e){let t=e.getUTCFullYear(),n=e.getUTCMonth()+1,r=e.getUTCDate();n<=2&&(--t,n+=12);let i=Math.floor(t/100),a=2-i+Math.floor(i/4);return Math.floor(365.25*(t+4716))+Math.floor(30.6001*(n+1))+r+a-1524.5+(e.getUTCHours()*3600+e.getUTCMinutes()*60+e.getUTCSeconds()+e.getUTCMilliseconds()/1e3)/86400}function s(e){return(e-2451545)/36525}function c(e){let t=e%360;return t>360&&(t-=360),t<0&&(t+=360),t}function l(e){return c(280.46646+e*(36000.76983+e*3032e-7))}function u(e){return 357.52911+e*(35999.05029-1537e-7*e)}function d(e){return .016708634-e*(42037e-9+1.267e-7*e)}function f(e){let t=u(e)*a;return Math.sin(t)*(1.914602-e*(.004817+14e-6*e))+Math.sin(t+t)*(.019993-101e-6*e)+Math.sin(t+t+t)*289e-6}function p(e){let t=23+(26+(21.448-e*(46.815+e*(59e-5-e*.001813)))/60)/60,n=125.04-1934.136*e;return t+.00256*Math.cos(n*a)}function m(e){let t=125.04-1934.136*e;return l(e)+f(e)-.00569-.00478*Math.sin(t*a)}function h(e){let t=s(o(e)),n=p(t),r=m(t);return Math.asin(Math.sin(n*a)*Math.sin(r*a))/a}function g(e){let t=s(o(e)),n=p(t)*a,r=l(t)*a,i=d(t),c=u(t)*a,f=Math.tan(n/2),m=f*f;return(m*Math.sin(2*r)-2*i*Math.sin(c)+4*i*m*Math.sin(c)*Math.cos(2*r)-.5*m*m*Math.sin(4*r)-1.25*i*i*Math.sin(2*c))/a*4}function _(e){let t=((e+180)%360+360)%360-180;return Object.is(t,-0)?0:t}function v(e){let t=(720-(e.getUTCHours()*60+e.getUTCMinutes()+e.getUTCSeconds()/60+e.getUTCMilliseconds()/6e4)-g(e))/4;return{lat:h(e),lon:_(t)}}function y(e){let{lat:t,lon:n}=v(e),r=(90-t)*a,i=(n+180)*a;return{x:-Math.sin(r)*Math.cos(i),y:Math.cos(r),z:Math.sin(r)*Math.sin(i)}}function b(e,t){return new Date(Date.UTC(e.year,e.month-1,15,t?t.getUTCHours():12,t?t.getUTCMinutes():0,t?t.getUTCSeconds():0,t?t.getUTCMilliseconds():0))}function x(e){let t=e.monthlyLayerVisible&&e.month?b(e.month,e.now):null;return{satellite:e.now,monthly:t}}var S=.25,C=.045,ee=-.22,te=.32,w=-.28,T=-.04,E=.04,D=.22,O={r:1,g:.42,b:.16},k=.38,A={r:.86,g:.93,b:1.08},j=.05,M=.28,N=.02,P=.1,F=.85,I={r:1,g:.96,b:.88};function L(){return`
const float RE_NIGHT_FLOOR = ${S};
const float RE_SCIENCE_FLOOR = ${C};
vec3 reShade(vec3 albedo, vec3 sunWorld, float glintOn, float emissive, float nightFloor, float coolNight, vec3 nightLights, vec3 nrm, vec3 viewPos) {
  vec3 sunV = normalize((viewMatrix * vec4(sunWorld, 0.0)).xyz);
  vec3 n = normalize(nrm);
  float ndl = dot(n, sunV);
  float day = smoothstep(${ee}, ${te}, ndl);
  float shade = mix(nightFloor, 1.0, day);
  vec3 tint = vec3(1.0);
  if (coolNight > 0.5) tint = mix(vec3(${A.r}, ${A.g}, ${A.b}), vec3(1.0), day);
  float tw = smoothstep(${w}, ${T}, ndl)
    * (1.0 - smoothstep(${E}, ${D}, ndl));
  float twScale = max(max(albedo.r, max(albedo.g, albedo.b)), 0.28);
  vec3 color = albedo * shade * tint;
  color += vec3(${O.r}, ${O.g}, ${O.b}) * tw * ${k} * twScale;
  float luma = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  float blue = albedo.b - max(albedo.r, albedo.g);
  float water = (1.0 - smoothstep(${j}, ${M}, luma))
    * smoothstep(${N}, ${P}, blue);
  vec3 viewDir = normalize(viewPos);
  vec3 halfDir = normalize(sunV + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), 64.0);
  color += vec3(${I.r}, ${I.g}, ${I.b}) * spec * water * day * glintOn * ${F};
  color += vec3(1.0, 0.93, 0.78) * emissive * (1.0 - day);
  color += nightLights * (1.0 - day);
  return color;
}
`}var R=`realEarth`,z=/tint\.rgb \*= tint\.a;\s*diffuseColor = tint \+ diffuseColor \* \( 1\.0 - tint\.a \);/;function ne(){return{uSunImagery:{value:new e(1,0,0)},uSunScience:{value:new e(1,0,0)},uRealLight:{value:1},uScienceLight:{value:0},uNightEmissive:{value:0},uHasNight:{value:0},uNightMap:{value:B()}}}function B(){let e=new Uint8Array([0,0,0,255]),a=new r(e,1,1,n);return a.colorSpace=t,a.magFilter=i,a.minFilter=i,a.needsUpdate=!0,a}function V(e,t,n){e.uniforms.uSunImagery=t.uSunImagery,e.uniforms.uSunScience=t.uSunScience,e.uniforms.uRealLight=t.uRealLight,e.uniforms.uScienceLight=t.uScienceLight,e.uniforms.uNightEmissive=t.uNightEmissive,e.uniforms.uHasNight=t.uHasNight,e.uniforms.uNightMap=t.uNightMap;let r=`
uniform vec3 uSunImagery;
uniform vec3 uSunScience;
uniform float uRealLight;
uniform float uScienceLight;
uniform float uNightEmissive;
uniform float uHasNight;
uniform sampler2D uNightMap;
${n}
${L()}
`;e.fragmentShader=e.fragmentShader.replace(`void main() {`,`${r}\nvoid main() {`)}function H(e){let t=e.customProgramCacheKey.bind(e);e.customProgramCacheKey=()=>`${t()}|real-earth`}function U(e,t){let n=e.onBeforeCompile;e.onBeforeCompile=(r,i)=>{n.call(e,r,i),t(r,i)},H(e),e.needsUpdate=!0,e.userData[R]=!0}var W=`
void main() {
  reBase = vec3(1.0);
  reImageryStraight = vec3(1.0);
  reImageryCover = 0.0;
  reScienceStraight = vec3(0.0);
  reScienceCover = 0.0;
`,G=`
#if UNROLLED_LOOP_INDEX == 0
  reImageryStraight = tint.rgb;
  reImageryCover = tint.a;
#else
  reScienceStraight = tint.rgb * tint.a + reScienceStraight * (1.0 - tint.a);
  reScienceCover = tint.a + reScienceCover * (1.0 - tint.a);
#endif
tint.rgb *= tint.a;
diffuseColor = tint + diffuseColor * (1.0 - tint.a);
`,K=`
if (uRealLight > 0.5) {
  vec3 imagery = mix(reBase, reImageryStraight, clamp(reImageryCover, 0.0, 1.0));
  if (reImageryCover <= 0.0 && reScienceCover <= 0.0) {
    imagery = diffuseColor.rgb;
  }
  vec3 lit = reShade(imagery, uSunImagery, 1.0, uNightEmissive, RE_NIGHT_FLOOR, 0.0, vec3(0.0), normal, vViewPosition);
  vec3 outc = lit;
  if (reScienceCover > 0.001) {
    vec3 sci = reScienceStraight / max(reScienceCover, 0.001);
    if (uScienceLight > 0.5) {
      sci = reShade(sci, uSunScience, 0.0, 0.0, RE_SCIENCE_FLOOR, 1.0, vec3(0.0), normal, vViewPosition);
    }
    outc = sci * reScienceCover + lit * (1.0 - reScienceCover);
  }
  outgoingLight = outc;
}
#include <opaque_fragment>
`,q=`
if (uRealLight > 0.5) {
  if (uScienceLight > 0.5) {
    vec3 nightLights = vec3(0.0);
    if (uHasNight > 0.5) {
      vec3 p = normalize(vNightWorld);
      float u = atan(p.z, -p.x) / 6.2831853;
      if (u < 0.0) u += 1.0;
      float v = asin(clamp(p.y, -1.0, 1.0)) / 3.14159265 + 0.5;
      vec3 raw = texture2D(uNightMap, vec2(u, v)).rgb;
      float city = smoothstep(0.18, 0.55, max(raw.r, max(raw.g, raw.b)));
      nightLights = raw * vec3(1.15, 0.92, 0.62) * city * 5.0;
    }
    outgoingLight = reShade(diffuseColor.rgb, uSunScience, 0.0, 0.0, RE_SCIENCE_FLOOR, 1.0, nightLights, normal, vViewPosition);
  } else {
    outgoingLight = diffuseColor.rgb;
  }
}
#include <opaque_fragment>
`,J=!1;function Y(e,t){e.userData[R]||U(e,e=>{V(e,t,`
vec3 reBase;
vec3 reImageryStraight;
float reImageryCover;
vec3 reScienceStraight;
float reScienceCover;
`),e.fragmentShader.includes(`void main() {`)&&(e.fragmentShader=e.fragmentShader.replace(`void main() {`,W),e.fragmentShader.includes(`vec4 tint;`)&&(e.fragmentShader=e.fragmentShader.replace(`vec4 tint;`,`vec4 tint;
	reBase = diffuseColor.rgb;`)),z.test(e.fragmentShader)?e.fragmentShader=e.fragmentShader.replace(z,G):J||(J=!0,console.warn(`RoamingEye: terrain lighting could not find the imagery overlay blend`)),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,K))})}function X(e,t){e.userData[R]||U(e,e=>{V(e,t,`varying vec3 vNightWorld;`),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vNightWorld;`).replace(`#include <project_vertex>`,`#include <project_vertex>
	vNightWorld = position;`),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,q)})}var Z=`
if (uRealLight > 0.5) {
  if (uScienceLight > 0.5) {
    vec3 nrm = normalize(mat3(viewMatrix) * normalize(vReWorld));
    vec3 viewPos = -(viewMatrix * vec4(vReWorld, 1.0)).xyz;
    outgoingLight = reShade(diffuseColor.rgb, uSunScience, 0.0, 0.0, RE_SCIENCE_FLOOR, 1.0, vec3(0.0), nrm, viewPos);
  } else {
    outgoingLight = diffuseColor.rgb;
  }
}
#include <opaque_fragment>
`;function re(e,t){e.userData[R]||U(e,e=>{V(e,t,`varying vec3 vReWorld;`),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vReWorld;`).replace(`#include <project_vertex>`,`#include <project_vertex>
	vReWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,Z)})}var Q=null;function ie(){return Q}var ae=new e(5,3,5),oe=new e;function $(e,t){return t.set(e.x,e.y,e.z)}function se(e){let t=ne();X(e.earthMaterial,t);let n=!1,r={satellite:{x:1,y:0,z:0},monthly:null,shown:{x:1,y:0,z:0}},i=()=>{let i=e.getRealLight(),a=e.getScienceLight();t.uRealLight.value=+!!i,t.uScienceLight.value=+!!a;let o=x(e.getClock()),s=y(o.satellite),c=o.monthly?y(o.monthly):null,l=a&&c?c:s;if(r={satellite:s,monthly:c,shown:l},$(l,t.uSunImagery.value),$(l,t.uSunScience.value),i?e.sunLight.position.copy($(l,oe)).multiplyScalar(8):e.sunLight.position.copy(ae),!n){let r=e.getTerrain();r&&(n=!0,r.setRealLightPatch(e=>{Y(e,t)}))}e.getScienceRoot().traverse(e=>{let n=e;if(!n.isMesh)return;let r=Array.isArray(n.material)?n.material:[n.material];for(let e of r)`isMeshBasicMaterial`in e&&e.isMeshBasicMaterial===!0&&re(e,t)})},a=e.scene.onBeforeRender;e.scene.onBeforeRender=function(e,t,n,r,o,s){a.call(this,e,t,n,r,o,s),i()};let o={setNightEmissive(e){t.uNightEmissive.value=e},setNightMap(e){e.flipY=!0,t.uNightMap.value=e,t.uHasNight.value=1},illumination:()=>r};return Q=o,i(),o}export{ie as n,se as t};