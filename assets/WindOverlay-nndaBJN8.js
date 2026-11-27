const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/mount-D7My-7oc.js","assets/three-D93lQpqA.js","assets/buildings-D_tdpckO.js","assets/tiles-B1uv5Jcg.js"])))=>i.map(i=>d[i]);
import{C as e,Ct as t,E as n,It as r,Lt as i,Ot as a,S as o,Vt as s,X as c,_t as l,f as u,ft as d,h as f,l as p,nt as m,p as h,st as g,ut as _,wt as v,xt as y,z as b}from"./three-D93lQpqA.js";import{l as x,p as S}from"./buildings-D_tdpckO.js";var C=[{at:0,rgb:[48,72,168]},{at:3,rgb:[56,140,220]},{at:8,rgb:[40,210,186]},{at:14,rgb:[130,220,70]},{at:22,rgb:[245,210,55]},{at:35,rgb:[235,90,40]},{at:55,rgb:[170,24,90]}],w=[{at:-40,rgb:[40,70,180]},{at:-10,rgb:[70,150,230]},{at:0,rgb:[150,220,230]},{at:12,rgb:[90,190,80]},{at:24,rgb:[240,210,60]},{at:36,rgb:[230,100,40]},{at:46,rgb:[160,30,70]}];function T(e){if(e.length===0)return`transparent`;let t=e[0].at,n=e[e.length-1].at-t||1;return`linear-gradient(90deg, ${e.map(e=>{let r=(e.at-t)/n*100;return`rgb(${e.rgb[0]}, ${e.rgb[1]}, ${e.rgb[2]}) ${r}%`}).join(`, `)})`}function E(e){return Number.isInteger(e)?e.toFixed(1):String(e)}function D(e){return`vec3(${e.map(e=>(e/255).toFixed(4)).join(`, `)})`}function O(e,t){let n=[`vec3 ${e}(float x) {`];for(let e=1;e<t.length;e++){let r=t[e-1],i=t[e],a=i.at-r.at,o=e===1?`if`:`else if`;n.push(`  ${o} (x <= ${E(i.at)}) return mix(${D(r.rgb)}, ${D(i.rgb)}, clamp((x - ${E(r.at)}) / ${E(a)}, 0.0, 1.0));`)}let r=t[t.length-1];return n.push(`  return ${r?D(r.rgb):`vec3(0.0)`};`),n.push(`}`),n.join(`
`)}var ee=[`N`,`NNE`,`NE`,`ENE`,`E`,`ESE`,`SE`,`SSE`,`S`,`SSW`,`SW`,`WSW`,`W`,`WNW`,`NW`,`NNW`];function te(e){let t=(e%360+360)%360;return ee[Math.round(t/22.5)%16]}function ne(e,t){let n=e.speed>=10?e.speed.toFixed(0):e.speed.toFixed(1),r=Math.round(e.directionDeg)%360,i=`${n} m/s from the ${te(e.directionDeg)} (${r}\u00b0)`;return!t||!Number.isFinite(e.t)?i:`${i}, ${e.t.toFixed(0)}\u00b0C`}function k(e,t){let n=Date.parse(e);return Number.isFinite(n)?`updated ${Math.max(0,Math.floor((t-n)/36e5))} h ago`:`updated time unknown`}var re=`roamingeye-wind`,A=`field`,j=`latest`;function M(e){if(e instanceof ArrayBuffer)return e;if(e instanceof Uint8Array){let t=new ArrayBuffer(e.byteLength);return new Uint8Array(t).set(e),t}return null}function N(){return typeof indexedDB>`u`?Promise.resolve(null):new Promise(e=>{let t=indexedDB.open(re,1);t.onupgradeneeded=()=>{t.result.objectStoreNames.contains(A)||t.result.createObjectStore(A)},t.onsuccess=()=>e(t.result),t.onerror=()=>e(null)})}async function ie(e=Date.now()){let t=await N();if(!t)return null;try{let n=await new Promise(n=>{let r=t.transaction(A,`readonly`).objectStore(A).get(j);r.onsuccess=()=>{let t=r.result;if(!t||typeof t.savedAt!=`number`||e-t.savedAt>108e5){n(null);return}let i=M(t.buffer);n(i?{savedAt:t.savedAt,header:t.header,buffer:i}:null)},r.onerror=()=>n(null)});return t.close(),n}catch{return t.close(),null}}async function ae(e){let t=await N();t&&(await new Promise(n=>{let r=t.transaction(A,`readwrite`);r.objectStore(A).put(e,j),r.oncomplete=()=>n(),r.onerror=()=>n(),r.onabort=()=>n()}),t.close())}var oe=-32768,P=111320,se=.2,ce=`https://api.open-meteo.com/v1/forecast`;function le(e){return`${ce}?latitude=${e.map(e=>F(e.lat)).join(`,`)}&longitude=${e.map(e=>F(e.lon)).join(`,`)}&current=temperature_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=UTC`}function F(e){return String(Math.round(e*1e3)/1e3)}var I={lat0:-90,lon0:-180,dLat:10,dLon:10,nLat:19,nLon:36},ue=32e4;function de(e){let t=[];for(let n=0;n<e.nLat;n++)for(let r=0;r<e.nLon;r++)t.push({lat:e.lat0+n*e.dLat,lon:e.lon0+r*e.dLon});return t}function fe(e,t){let n=t*Math.PI/180;return{u:-e*Math.sin(n),v:-e*Math.cos(n)}}function pe(e,t){let n=Math.hypot(e,t);return n===0?{speed:0,directionDeg:0}:{speed:n,directionDeg:(Math.atan2(-e,-t)*180/Math.PI+360)%360}}function me(e,t,n){let r=n!==null&&Number.isFinite(n)?n:NaN;if(e===null||t===null||!Number.isFinite(e)||!Number.isFinite(t))return{u:NaN,v:NaN,t:r};let{u:i,v:a}=fe(e,t);return{u:i,v:a,t:r}}function he(e){return/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e)?`${e}:00Z`:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(e)?`${e}Z`:e}function L(e){return e==null||typeof e!=`number`||!Number.isFinite(e)?null:e}function R(e){return(Array.isArray(e)?e:[e]).map((e,t)=>{if(!e||typeof e!=`object`)throw Error(`Open-Meteo row ${t} is not an object`);let n=e.current;if(!n||typeof n!=`object`)throw Error(`Open-Meteo row ${t} has no current block`);let r=n;if(typeof r.time!=`string`)throw Error(`Open-Meteo row ${t} has no time`);return{time:r.time,temperature_2m:L(r.temperature_2m),wind_speed_10m:L(r.wind_speed_10m),wind_direction_10m:L(r.wind_direction_10m)}})}function ge(e,t){let n=e.nLat*e.nLon;if(t.length!==n)throw Error(`Open-Meteo returned ${t.length} rows for a ${n}-cell grid`);let r=new Float32Array(n),i=new Float32Array(n),a=new Float32Array(n),o=0,s=new Map;for(let e=0;e<n;e++){let n=me(t[e].wind_speed_10m,t[e].wind_direction_10m,t[e].temperature_2m);r[e]=n.u,i[e]=n.v,a[e]=n.t,Number.isFinite(n.u)&&Number.isFinite(n.v)||(o+=1);let c=t[e].time;s.set(c,(s.get(c)??0)+1)}let c=t[0]?.time??``,l=-1;for(let[e,t]of s)t>l&&(l=t,c=e);return{u:r,v:i,t:a,time:he(c),missing:o}}function _e(e){if(!e||typeof e!=`object`)return!1;let t=e;return Number.isFinite(t.lat0)&&Number.isFinite(t.lon0)&&Number.isFinite(t.dLat)&&t.dLat>0&&Number.isFinite(t.dLon)&&t.dLon>0&&Number.isInteger(t.nLat)&&t.nLat>1&&Number.isInteger(t.nLon)&&t.nLon>1&&t.nLat*t.nLon<=ue}function z(e){if(!_e(e)||typeof e!=`object`||!e)throw Error(`Wind header is not a grid`);let t=e;if(t.version!==1)throw Error(`Wind header version is not 1`);if(t.encoding!==`int16le`)throw Error(`Wind header encoding is not int16le`);if(!Array.isArray(t.order)||t.order.join(`,`)!==`u,v,t`)throw Error(`Wind header component order is not u, v, t`);if(typeof t.scale!=`number`||!(t.scale>0))throw Error(`Wind header scale is not a positive number`);if(t.missing!==-32768)throw Error(`Wind header missing sentinel changed`);if(typeof t.time!=`string`||t.time.length===0)throw Error(`Wind header has no time`);if(typeof t.source!=`string`||t.source.length===0)throw Error(`Wind header has no source`);return{version:1,time:t.time,lat0:t.lat0,lon0:t.lon0,dLat:t.dLat,dLon:t.dLon,nLat:t.nLat,nLon:t.nLon,encoding:`int16le`,scale:t.scale,order:[`u`,`v`,`t`],missing:oe,source:t.source}}function B(e,t){let n=z(t),r=n.nLat*n.nLon;if(e.byteLength!==r*6)throw Error(`Wind field is ${e.byteLength} bytes, expected ${r*6}`);let i=new DataView(e),a=new Float32Array(r),o=new Float32Array(r),s=new Float32Array(r);for(let e=0;e<r;e++)a[e]=V(i,e*6,n),o[e]=V(i,e*6+2,n),s[e]=V(i,e*6+4,n);return{header:n,u:a,v:o,t:s}}function V(e,t,n){let r=e.getInt16(t,!0);return r===n.missing?NaN:r*n.scale}function ve(e){let t=e.header.nLat*e.header.nLon,n=new Float32Array(t*4);for(let r=0;r<t;r++){let t=e.u[r],i=e.v[r],a=e.t[r],o=Number.isFinite(t)&&Number.isFinite(i);n[r*4]=o?t:0,n[r*4+1]=o?i:0,n[r*4+2]=Number.isFinite(a)?a:0,n[r*4+3]=+!!o}return n}function H(e,t,n){let{nLon:r}=e.header,i=t*r+n,a=e.u[i],o=e.v[i];return!Number.isFinite(a)||!Number.isFinite(o)?null:{u:a,v:o,t:e.t[i]}}function ye(e){let t=0,n=0,r=0,i=0,a=0;for(let o of e)o.weight<=0||(t+=o.weight,n+=o.sample.u*o.weight,r+=o.sample.v*o.weight,Number.isFinite(o.sample.t)&&(i+=o.sample.t*o.weight,a+=o.weight));return t<=0?null:{u:n/t,v:r/t,t:a>0?i/a:NaN}}function be(e,t,n){let{lat0:r,lon0:i,dLat:a,dLon:o,nLat:s,nLon:c}=e.header,l=r+(s-1)*a,u=(Math.min(l,Math.max(r,t))-r)/a,d=Math.floor(u),f=Math.min(s-1,d+1),p=f===d?0:u-d,m=c*o,h=((n-i)%m+m)%m/o,g=Math.floor(h)%c,_=h-Math.floor(h),v=(g+1)%c,y=H(e,d,g),b=H(e,d,v),x=H(e,f,g),S=H(e,f,v),C=[];y&&C.push({sample:y,weight:(1-_)*(1-p)}),b&&C.push({sample:b,weight:_*(1-p)}),x&&C.push({sample:x,weight:(1-_)*p}),S&&C.push({sample:S,weight:_*p});let w=ye(C);if(!w)return null;let T=pe(w.u,w.v);return{...w,...T}}function xe(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}function Se(e,t){return typeof Worker>`u`?Promise.resolve(B(e,t)):new Promise((n,r)=>{let i;try{i=new Worker(new URL(`/assets/worker-DpBszmgg.js`,``+import.meta.url),{type:`module`})}catch(e){r(e);return}let a=setTimeout(()=>{i.terminate(),r(Error(`Wind worker timed out`))},8e3);i.onmessage=e=>{clearTimeout(a),i.terminate();let t=e.data;!t||t.error||!t.u||!t.v||!t.t||!t.header?r(Error(t?.error??`Wind worker returned no field`)):n({header:t.header,u:t.u,v:t.v,t:t.t})},i.onerror=()=>{clearTimeout(a),i.terminate(),r(Error(`Wind worker failed`))},i.postMessage({buffer:e.slice(0),header:t})})}async function U(e,t){try{return await Se(e,t)}catch(n){return console.warn(`RoamingEye: wind worker unavailable, decoding on the main thread`,n),B(e,t)}}async function Ce(e,t){let n=de(t),r=[];for(let t of xe(n,200)){let n=await e(le(t));if(!n.ok)throw Error(`Open-Meteo answered ${n.status}`);r.push(...R(await n.json()))}return r}async function we(e){let t=ge(I,await Ce(e,I));if(t.missing>t.u.length*.5)throw Error(`Open-Meteo wind grid is mostly empty`);return{header:z({...I,version:1,time:t.time,encoding:`int16le`,scale:.01,order:[`u`,`v`,`t`],missing:-32768,source:`open-meteo-fallback`}),u:t.u,v:t.v,t:t.t}}async function Te(e){let t=e?.fetch??fetch,n=e?.baseUrl??`/`??`/`,r=e?.cache===!0||e?.cache!==!1&&e?.fetch===void 0;if(r){let t=await ie(e?.now);if(t)try{return await U(t.buffer,z(t.header))}catch{}}try{let i=await t(`${n}data/wind/latest.json`);if(!i.ok)throw Error(`wind header HTTP ${i.status}`);let a=z(await i.json()),o=await t(`${n}data/wind/latest.bin`);if(!o.ok)throw Error(`wind field HTTP ${o.status}`);let s=await o.arrayBuffer(),c=await U(s,a);return r&&ae({savedAt:e?.now??Date.now(),header:a,buffer:s}),c}catch(e){return console.warn(`RoamingEye: prebuilt wind field unavailable, asking Open-Meteo for a coarse grid`,e),we(t)}}var Ee=O(`rampSpeed`,C),De=O(`rampTemp`,w),W=`
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
`,G=`
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
`,K=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,Oe=`
precision highp float;
uniform sampler2D uState;
uniform float uDtHours;
uniform float uDtSeconds;
uniform float uSeed;
varying vec2 vUv;
${W}
${G}

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
    float cosLat = max(${se}, cos(latRad));
    dLat = (w.g * dtSec) / ${P}.0;
    dLon = (w.r * dtSec) / (${P}.0 * cosLat);
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
`,ke=`
precision highp float;
uniform sampler2D uTex;
uniform float uDecay;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uTex, vUv) * uDecay;
}
`,Ae=`
attribute float aIndex;
uniform sampler2D uState;
uniform vec2 uStateSize;
uniform float uPointSize;
varying vec2 vLonLat;
${W}
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
`,je=`
precision highp float;
uniform float uMode;
varying vec2 vLonLat;
${G}
${Ee}
${De}
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
`,Me=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,Ne=`
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
`,Pe=4e4,Fe=1e4;function Ie(e){let t=e.deviceMemoryGb!==void 0&&e.deviceMemoryGb<=4,n=(e.hardwareConcurrency??8)<=2,r=e.pixelRatio<e.maxPixelRatio-.05;return t||n||r?Fe:Pe}function q(e){return e<=1e4?{width:100,height:100}:{width:200,height:200}}function J(e){return e<=1e4?{width:1024,height:512}:{width:2048,height:1024}}function Y(e){return Math.min(1.35,Math.max(.65,.4*(Number.isFinite(e)?e:3)))}var Le=.95,Re=10;function X(e){let t=Math.min(1,Math.max(0,e))*65535,n=Math.min(255,Math.floor(t/256));return[n,Math.min(255,Math.floor(t-n*256+.5))]}function Z(e,t,n){let i=n?m:b,a=new s(e,t,{format:l,type:r,depthBuffer:!1,stencilBuffer:!1,magFilter:i,minFilter:i,generateMipmaps:!1});return a.texture.colorSpace=``,a}function Q(e){let{lat0:t,lon0:n,dLat:r,dLon:i,nLat:a,nLon:o}=e.header;return{uLat0:{value:t},uLon0:{value:n},uDLat:{value:r},uDLon:{value:i},uNLon:{value:o},uNLat:{value:a}}}var ze=class{object=new n;renderer;ortho=new g(-1,1,1,-1,.1,10);quadScene=new t;stampScene=new t;savedClear=new h;fieldTexture;stateRead;seedTexture=null;stateA;stateB;trailA;trailB;advectMat;fadeMat;stampMat;displayMat;points;count;lastNow=0;lastTierCheck=0;seed=Math.random()*1e3;constructor(e,t){if(!e.capabilities.isWebGL2)throw Error(`Wind needs WebGL2`);this.renderer=e,this.ortho.position.z=2,this.count=this.desiredCount(),this.fieldTexture=this.uploadField(t);let n=q(this.count),r=J(this.count);this.stateA=Z(n.width,n.height,!0),this.stateB=Z(n.width,n.height,!0),this.trailA=Z(r.width,r.height,!1),this.trailB=Z(r.width,r.height,!1),this.stateRead=this.seedState(n.width,n.height);let o=Q(t);this.advectMat=new v({uniforms:{...o,uState:{value:this.stateRead},uField:{value:this.fieldTexture},uDtHours:{value:0},uDtSeconds:{value:0},uSeed:{value:this.seed}},vertexShader:K,fragmentShader:Oe,depthTest:!1,depthWrite:!1}),this.fadeMat=new v({uniforms:{uTex:{value:this.trailA.texture},uDecay:{value:1}},vertexShader:K,fragmentShader:ke,depthTest:!1,depthWrite:!1,blending:0}),this.stampMat=new v({uniforms:{...o,uState:{value:this.stateRead},uField:{value:this.fieldTexture},uStateSize:{value:new i(n.width,n.height)},uPointSize:{value:Y(3.2)},uMode:{value:0}},vertexShader:Ae,fragmentShader:je,transparent:!0,depthTest:!1,depthWrite:!1,premultipliedAlpha:!0,blending:5,blendEquation:100,blendSrc:201,blendDst:205,blendEquationAlpha:100,blendSrcAlpha:201,blendDstAlpha:205}),this.displayMat=new v({uniforms:{uTrail:{value:this.trailA.texture}},vertexShader:Me,fragmentShader:Ne,transparent:!0,depthWrite:!1,toneMapped:!1,premultipliedAlpha:!0,blending:5,blendEquation:100,blendSrc:201,blendDst:205,blendEquationAlpha:100,blendSrcAlpha:201,blendDstAlpha:205});let s=new c(new _(2,2),this.advectMat);s.frustumCulled=!1,this.quadScene.add(s),this.points=this.makePoints(n.width,n.height),this.stampScene.add(this.points);let l=new c(new a(1.0015,96,64),this.displayMat);l.frustumCulled=!1,this.object.add(l),this.clearTarget(this.trailA),this.clearTarget(this.trailB);for(let e=0;e<Re;e++)this.step(1/45);this.lastNow=performance.now()}setColorMode(e){this.stampMat.uniforms.uMode.value=+(e===`temperature`),this.clearTarget(this.trailA),this.clearTarget(this.trailB)}update(e,t,n=3.2){if(!t||document.hidden){this.lastNow=e;return}e-this.lastTierCheck>2e3&&(this.lastTierCheck=e,this.applyCount(this.desiredCount()));let r=Math.min(.05,Math.max(0,(e-this.lastNow)/1e3));this.lastNow=e,!(r<=0)&&(this.stampMat.uniforms.uPointSize.value=Y(n),this.step(r))}dispose(){this.fieldTexture.dispose(),this.seedTexture?.dispose(),this.seedTexture=null,this.stateA.dispose(),this.stateB.dispose(),this.trailA.dispose(),this.trailB.dispose(),this.advectMat.dispose(),this.fadeMat.dispose(),this.stampMat.dispose(),this.displayMat.dispose(),this.points.geometry.dispose();let e=this.object.children[0];e instanceof c&&e.geometry.dispose()}desiredCount(){let e=navigator,t=Math.min(window.devicePixelRatio||1,2);return Ie({deviceMemoryGb:e.deviceMemory,hardwareConcurrency:e.hardwareConcurrency,pixelRatio:this.renderer.getPixelRatio(),maxPixelRatio:t})}applyCount(e){if(e===this.count)return;this.count=e;let t=q(e),n=J(e);this.stateA.dispose(),this.stateB.dispose(),this.trailA.dispose(),this.trailB.dispose(),this.seedTexture?.dispose(),this.seedTexture=null,this.stateA=Z(t.width,t.height,!0),this.stateB=Z(t.width,t.height,!0),this.trailA=Z(n.width,n.height,!1),this.trailB=Z(n.width,n.height,!1),this.stateRead=this.seedState(t.width,t.height),this.stampMat.uniforms.uStateSize.value.set(t.width,t.height),this.stampMat.uniforms.uPointSize.value=Y(3.2),this.stampScene.remove(this.points),this.points.geometry.dispose(),this.points=this.makePoints(t.width,t.height),this.stampScene.add(this.points),this.clearTarget(this.trailA),this.clearTarget(this.trailB)}uploadField(t){let{nLon:n,nLat:r}=t.header,i=ve(t),a=new f(i,n,r,l,e);return a.wrapS=y,a.wrapT=u,a.magFilter=m,a.minFilter=m,a.colorSpace=``,a.needsUpdate=!0,a}seedState(e,t){let n=new Uint8Array(e*t*4);for(let r=0;r<e*t;r++){let e=Math.random()*360-180,t=Math.asin(Math.random()*2-1)*180/Math.PI,[i,a]=X((e+180)/360),[o,s]=X((t+90)/180);n[r*4]=i,n[r*4+1]=a,n[r*4+2]=o,n[r*4+3]=s}let r=new f(n,e,t);return this.seedTexture?.dispose(),this.seedTexture=r,r.magFilter=m,r.minFilter=m,r.colorSpace=``,r.needsUpdate=!0,r}makePoints(e,t){let n=e*t,r=new Float32Array(n);for(let e=0;e<n;e++)r[e]=e;let i=new p;i.setAttribute(`aIndex`,new o(r,1)),i.setAttribute(`position`,new o(new Float32Array(n*3),3));let a=new d(i,this.stampMat);return a.frustumCulled=!1,a}step(e){let t=e*18;this.advectMat.uniforms.uState.value=this.stateRead,this.advectMat.uniforms.uDtHours.value=t,this.advectMat.uniforms.uDtSeconds.value=e,this.advectMat.uniforms.uSeed.value=this.seed+=e;let n=this.stateRead===this.stateA.texture?this.stateB:this.stateA;this.quadScene.children[0].material=this.advectMat,this.pass(n,this.quadScene,!0);let r=.5**(e/Le),i=this.displayMat.uniforms.uTrail.value===this.trailA.texture,a=i?this.trailA:this.trailB,o=i?this.trailB:this.trailA;this.fadeMat.uniforms.uTex.value=a.texture,this.fadeMat.uniforms.uDecay.value=r,this.quadScene.children[0].material=this.fadeMat,this.pass(o,this.quadScene,!0),this.stampMat.uniforms.uState.value=n.texture,this.pass(o,this.stampScene,!1),this.displayMat.uniforms.uTrail.value=o.texture;let s=this.seedTexture!==null&&this.stateRead===this.seedTexture;this.stateRead=n.texture,s&&this.seedTexture&&(this.seedTexture.dispose(),this.seedTexture=null)}clearTarget(e){this.pass(e,this.quadScene,!0,!0)}pass(e,t,n,r=!1){let i=this.renderer,a=i.getRenderTarget(),o=i.autoClear;i.getClearColor(this.savedClear);let s=i.getClearAlpha();i.setRenderTarget(e),i.autoClear=!1,(n||r)&&(i.setClearColor(0,0),i.clear(!0,!1,!1)),r||i.render(t,this.ortho),i.setRenderTarget(a),i.autoClear=o,i.setClearColor(this.savedClear,s)}};async function Be(e,t){let n=await Te(),r=new ze(t,n);e.add(r.object);let i=Ve(n);(document.querySelector(`#app`)??document.body).append(i.root);let a=!1,o=``,s=0,c=null;return x(async()=>{let{mountRadar:e}=await import(`./mount-D7My-7oc.js`);return{mountRadar:e}},__vite__mapDeps([0,1,2,3])).then(({mountRadar:t})=>{c=t(e,i.extra)},()=>{}),i.temperature.addEventListener(`click`,()=>{a=!a,i.temperature.setAttribute(`aria-pressed`,String(a)),r.setColorMode(a?`temperature`:`speed`),$(i,a)}),{id:`weather`,label:`Weather now`,detail:`Animated wind, coloured by speed`,group:`live`,icon:``,object:e,update(t){let l=e.visible&&!document.hidden;if(i.root.hidden=!e.visible,r.update(performance.now(),l,t.position.length()),c?.update(t,l),!l)return;let u=Date.now();u-s>3e4&&(s=u,i.age.textContent=k(n.header.time,u));let d=S(t.position),f=be(n,d.lat,d.lon),p=f?ne(f,a):`No wind at the map centre`;p!==o&&(o=p,i.readout.textContent=p)}}}function $(e,t){let n=t?w:C;e.ramp.style.background=T(n),e.low.textContent=t?`Cold`:`Calm`,e.high.textContent=t?`Hot`:`Strong`,e.ramp.setAttribute(`aria-label`,t?`Temperature from cold to hot`:`Wind speed from calm to strong`)}function Ve(e){let t=document.createElement(`div`);t.className=`weather-hud`,t.hidden=!0;let n=document.createElement(`p`);n.className=`weather-readout`,n.textContent=`Wind`;let r=document.createElement(`section`);r.className=`weather-card`,r.setAttribute(`aria-label`,`Wind now`);let i=document.createElement(`p`);i.className=`weather-card__title`,i.textContent=`Wind now`;let a=document.createElement(`div`);a.className=`weather-card__scale`;let o=document.createElement(`span`),s=document.createElement(`div`);s.className=`weather-card__ramp`,s.setAttribute(`role`,`img`);let c=document.createElement(`span`);a.append(o,s,c);let l=document.createElement(`p`);l.className=`weather-card__age`,l.textContent=k(e.header.time,Date.now());let u=document.createElement(`button`);u.type=`button`,u.className=`weather-card__temp`,u.textContent=`Temperature colours`,u.setAttribute(`aria-pressed`,`false`);let d=document.createElement(`div`);d.className=`weather-card__extra`,d.dataset.weatherExtra=``,r.append(i,a,l,u,d),t.append(n,r);let f={root:t,readout:n,ramp:s,low:o,high:c,age:l,temperature:u,extra:d};return $(f,!1),f}export{Be as mountWindOverlay};