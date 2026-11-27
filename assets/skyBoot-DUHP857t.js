import{Rt as e,St as t,c as n,ft as r,l as i,wt as a}from"./three-D93lQpqA.js";import{n as o}from"./Sun-DQmwVX_-.js";var s=[.3,.52,1],c=[1,.42,.22],l=3.6,u=-.08,d=.4,f=-.6,p=-.08,m=.02,h=.14,g=.12,_=2*h*h;function v(){return`
    varying float vRim;
    varying float vSun;
    uniform float uGain;
    void main() {
      float day = smoothstep(${u}, ${d}, vSun);
      float night = 1.0 - smoothstep(${f}, ${p}, vSun);
      float twilight = exp(-pow(vSun - ${m}, 2.0) / ${_});
      float warmMix = min(1.0, twilight * (1.0 - night * 0.35));
      vec3 color = mix(
        vec3(${s[0]}, ${s[1]}, ${s[2]}),
        vec3(${c[0]}, ${c[1]}, ${c[2]}),
        warmMix
      );
      float limb = pow(clamp(vRim, 0.0, 1.0), ${l});
      float alpha = limb * (0.05 + 0.95 * day) * mix(${g}, 1.0, 1.0 - night) * uGain;
      gl_FragColor = vec4(color, alpha);
    }
  `}var y=6e3,b=20901;function x(e){let t=e>>>0;return()=>{t|=0,t=t+1831565813|0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}function S(e=y,t=b){let n=x(t),r=new Float32Array(e*3),i=new Float32Array(e);for(let t=0;t<e;t++){let e=40+n()*30,a=n()*Math.PI*2,o=Math.acos(2*n()-1),s=Math.sin(o);r[t*3]=e*s*Math.cos(a),r[t*3+1]=e*s*Math.sin(a),r[t*3+2]=e*Math.cos(o),i[t]=.25+.75*n()*n()}return{positions:r,brightness:i}}var C=`
  attribute float aBright;
  varying float vBright;
  void main() {
    vBright = aBright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aBright * 160.0 / -mv.z, 0.6, 2.6);
    gl_Position = projectionMatrix * mv;
  }
`,w=`
  varying float vBright;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float disk = dot(p, p);
    if (disk > 1.0) discard;
    float glow = exp(-disk * 3.2) * vBright;
    gl_FragColor = vec4(0.93, 0.95, 1.0, glow);
  }
`;function T(){let e=S(),t=new i;t.setAttribute(`position`,new n(e.positions,3)),t.setAttribute(`aBright`,new n(e.brightness,1));let o=new a({transparent:!0,depthWrite:!1,toneMapped:!1,vertexShader:C,fragmentShader:w}),s=new r(t,o);return s.name=`starfield`,s.frustumCulled=!1,s}var E=`
  varying float vRim;
  varying float vSun;
  uniform vec3 uSun;
  void main() {
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    vSun = dot(normalize(position), normalize(uSun));
    gl_Position = projectionMatrix * mv;
  }
`;function D(t){let n=new e(1,.15,.35),r=new a({transparent:!0,side:0,blending:2,depthWrite:!1,depthTest:!1,toneMapped:!1,uniforms:{uSun:{value:n},uGain:{value:.85}},vertexShader:E,fragmentShader:v()}),i=t.material;t.material=r;let o=Array.isArray(i)?i:[i];for(let e of o)e.dispose();return{setSun(e,t,r){n.set(e,t,r)},setGain(e){r.uniforms.uGain.value=e}}}var O=.9;function k(e){if(!(`material`in e))return null;let t=e.material;return t?Array.isArray(t)?t:[t]:null}function A(e){let t=e;for(;t;){if(t.name===`terrain-globe`)return!0;t=t.parent}return!1}function j(e,t){let n=k(e);if(n)for(let e of n)e.toneMapped!==t&&(e.toneMapped=t)}function M(e,t){let n=!1,r=null;return()=>{let i=t();n?r!==i&&e.getObjectByName(`terrain-globe`)?.traverse(e=>{j(e,!i)}):(n=!0,e.traverse(e=>{j(e,A(e)&&!i)})),r=i}}function N(e){let n=T();e.scene.add(n);let r=D(e.atmosphere);e.renderer.outputColorSpace=t,e.renderer.toneMapping=6,e.renderer.toneMappingExposure=1;let i=M(e.scene,e.scienceOnTerrain),a=e.scene.onBeforeRender;e.scene.onBeforeRender=function(e,t,s,c,l,u){a.call(this,e,t,s,c,l,u),n.visible=!0,r.setGain(O);let d=o()?.illumination().shown;d&&r.setSun(d.x,d.y,d.z),i()}}export{N as bootSky};