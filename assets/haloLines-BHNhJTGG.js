import{Lt as e,Rt as t,S as n,X as r,l as i,p as a,wt as o}from"./three-D93lQpqA.js";import{f as s}from"./buildings-D_tdpckO.js";var c=`
  attribute vec3 start;
  attribute vec3 end;
  attribute float side;
  attribute float along;
  uniform float uWidth;
  uniform vec2 uResolution;
  varying float vSide;
  void main() {
    vec4 clipA = projectionMatrix * modelViewMatrix * vec4(start, 1.0);
    vec4 clipB = projectionMatrix * modelViewMatrix * vec4(end, 1.0);
    vec2 ndcA = clipA.xy / clipA.w;
    vec2 ndcB = clipB.xy / clipB.w;
    vec2 dir = ndcB - ndcA;
    float len = length(dir);
    vec2 normal = len < 1e-6 ? vec2(0.0, 1.0) : vec2(-dir.y, dir.x) / len;
    vec2 offset = normal * side * uWidth / uResolution;
    vec4 clip = mix(clipA, clipB, along);
    gl_Position = vec4(clip.xy + offset * clip.w, clip.z, clip.w);
    vSide = side;
  }
`,l=`
  varying float vSide;
  uniform vec3 uCore;
  uniform vec3 uHalo;
  void main() {
    float d = abs(vSide);
    float edge = smoothstep(0.28, 0.58, d);
    vec3 color = mix(uCore, uHalo, edge);
    float alpha = mix(0.95, 0.82, edge);
    alpha *= 1.0 - smoothstep(0.84, 1.0, d);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
  }
`,u=[[-1,0],[1,0],[-1,1],[-1,1],[1,0],[1,1]],d=.35;function f(f,p,m){let h=[],g=[],_=[],v=[],y=new t,b=new t;for(let e of f)for(let t=0;t+1<e.length;t++){let n=e[t],r=e[t+1];if(n&&r&&(y.copy(s(n[1],n[0],p)),b.copy(s(r[1],r[0],p)),!(y.angleTo(b)>d)))for(let[e,t]of u)h.push(y.x,y.y,y.z),g.push(b.x,b.y,b.z),_.push(e),v.push(t)}if(h.length===0)return null;let x=new i;x.setAttribute(`start`,new n(h,3)),x.setAttribute(`end`,new n(g,3)),x.setAttribute(`side`,new n(_,1)),x.setAttribute(`along`,new n(v,1));let S=new o({transparent:!0,depthWrite:!1,uniforms:{uWidth:{value:m.widthPx},uResolution:{value:new e(typeof window>`u`?1:window.innerWidth,typeof window>`u`?1:window.innerHeight)},uCore:{value:new a(m.core)},uHalo:{value:new a(m.halo)}},vertexShader:c,fragmentShader:l}),C=new r(x,S);return C.frustumCulled=!1,C}function p(e,t,n){e.traverse(e=>{let r=e.material;r instanceof o&&r.uniforms.uResolution&&r.uniforms.uResolution.value.set(t,n)})}export{f as haloLineMesh,p as setHaloResolution};