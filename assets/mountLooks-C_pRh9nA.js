import{Ct as e,Lt as t,Vt as n,X as r,f as i,st as a,ut as o,wt as s,z as c}from"./three-D93lQpqA.js";import{r as l,t as u}from"./looks-BTGvs4sH.js";var d=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,f=`
precision highp float;
uniform sampler2D uFrame;
uniform sampler2D uBloom;
uniform float uLook;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBloomStrength;
varying vec2 vUv;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float grain(vec2 uv) {
  vec2 p = floor(uv * uResolution + vec2(uTime * 48.0, uTime * 29.0));
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 thermal(float t) {
  vec3 c0 = vec3(0.02, 0.00, 0.08);
  vec3 c1 = vec3(0.28, 0.00, 0.58);
  vec3 c2 = vec3(0.75, 0.02, 0.18);
  vec3 c3 = vec3(1.00, 0.32, 0.02);
  vec3 c4 = vec3(1.00, 0.86, 0.12);
  vec3 c5 = vec3(1.00, 1.00, 0.96);
  t = clamp(pow(t, 0.8), 0.0, 1.0);
  if (t < 0.2) return mix(c0, c1, t / 0.2);
  if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
  if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
  if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
  return mix(c4, c5, (t - 0.8) / 0.2);
}

vec3 night(vec2 uv) {
  vec2 px = 2.0 / uResolution;
  float l = luma(texture2D(uFrame, uv).rgb);
  float nearby = max(
    max(luma(texture2D(uFrame, uv + vec2(px.x, 0.0)).rgb), luma(texture2D(uFrame, uv - vec2(px.x, 0.0)).rgb)),
    max(luma(texture2D(uFrame, uv + vec2(0.0, px.y)).rgb), luma(texture2D(uFrame, uv - vec2(0.0, px.y)).rgb))
  );
  float g = smoothstep(0.2, 0.75, l);
  g = pow(g, 2.6);
  float spark = smoothstep(0.58, 0.9, max(l, nearby));
  g = clamp(g + spark * 0.4, 0.0, 1.0);
  g = clamp(g + (grain(uv) - 0.5) * 0.09 * (0.2 + g), 0.0, 1.0);
  float vig = smoothstep(0.18, 0.62, length(uv - 0.5));
  vec3 phosphor = vec3(0.04, 0.42, 0.08) * g + vec3(0.35, 1.0, 0.45) * spark * g;
  return phosphor * (1.0 - vig);
}

vec3 noir(vec2 uv) {
  float l = luma(texture2D(uFrame, uv).rgb);
  l = smoothstep(0.16, 0.7, l);
  l = pow(l, 1.25);
  float vig = smoothstep(0.4, 0.9, length(uv - 0.5));
  l = clamp(l * (1.0 - vig * 0.7) + (grain(uv) - 0.5) * 0.035, 0.0, 1.0);
  return vec3(l * 0.92, l * 0.9, l * 0.86);
}

vec3 crt(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  vec2 curved = c * (1.0 + 0.12 * r2) * 0.5 + 0.5;
  if (curved.x < 0.0 || curved.y < 0.0 || curved.x > 1.0 || curved.y > 1.0) {
    return vec3(0.0);
  }
  float shift = 0.0022;
  vec3 col = vec3(
    texture2D(uFrame, curved + vec2(shift, 0.0)).r,
    texture2D(uFrame, curved).g,
    texture2D(uFrame, curved - vec2(shift, 0.0)).b
  );
  float scan = 0.72 + 0.28 * sin(curved.y * uResolution.y * 3.14159);
  float vig = smoothstep(0.35, 0.85, length(uv - 0.5));
  vec3 graded = pow(max(col, vec3(0.0)), vec3(1.2)) * 0.85;
  return graded * scan * (1.0 - vig * 0.72);
}

vec3 blueprint(vec2 uv) {
  vec2 px = 1.0 / uResolution;
  float l = luma(texture2D(uFrame, uv).rgb);
  float gx = luma(texture2D(uFrame, uv + vec2(px.x, 0.0)).rgb) - luma(texture2D(uFrame, uv - vec2(px.x, 0.0)).rgb);
  float gy = luma(texture2D(uFrame, uv + vec2(0.0, px.y)).rgb) - luma(texture2D(uFrame, uv - vec2(0.0, px.y)).rgb);
  float edge = smoothstep(0.03, 0.18, length(vec2(gx, gy)));
  float shape = smoothstep(0.22, 0.62, l);
  float grid = 0.0;
  if (fract(uv.x * 36.0) > 0.96 || fract(uv.y * 24.0) > 0.96) grid = 0.22;
  vec3 paper = vec3(0.03, 0.16, 0.42);
  vec3 ink = vec3(0.86, 0.95, 1.0);
  return mix(paper, ink, clamp(shape * 0.28 + edge * 1.35 + grid, 0.0, 1.0));
}

vec3 cinematic(vec2 uv) {
  vec3 c = texture2D(uFrame, uv).rgb + texture2D(uBloom, uv).rgb * uBloomStrength;
  float vig = smoothstep(0.28, 0.92, length((uv - 0.5) * vec2(0.85, 1.05)));
  c *= 1.0 - vig * 0.55;
  c += (grain(uv) - 0.5) * 0.045;
  if (uv.y < 0.07 || uv.y > 0.93) c = vec3(0.0);
  return c;
}

void main() {
  vec3 color;
  if (uLook < 1.5) color = night(vUv);
  else if (uLook < 2.5) color = thermal(luma(texture2D(uFrame, vUv).rgb));
  else if (uLook < 3.5) color = noir(vUv);
  else if (uLook < 4.5) color = crt(vUv);
  else if (uLook < 5.5) color = blueprint(vUv);
  else color = cinematic(vUv);
  gl_FragColor = vec4(color, 1.0);
}
`,p=`
precision highp float;
uniform sampler2D uFrame;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uFrame, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(0.9, 1.0, l);
  gl_FragColor = vec4(c * k, 1.0);
}
`,m=`
precision highp float;
uniform sampler2D uFrame;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(uFrame, vUv).rgb * 0.227027;
  sum += texture2D(uFrame, vUv + uDirection).rgb * 0.1945946;
  sum += texture2D(uFrame, vUv - uDirection).rgb * 0.1945946;
  sum += texture2D(uFrame, vUv + uDirection * 2.0).rgb * 0.1216216;
  sum += texture2D(uFrame, vUv - uDirection * 2.0).rgb * 0.1216216;
  sum += texture2D(uFrame, vUv + uDirection * 3.0).rgb * 0.054054;
  sum += texture2D(uFrame, vUv - uDirection * 3.0).rgb * 0.054054;
  gl_FragColor = vec4(sum, 1.0);
}
`,h=class{renderer;camera=new a(-1,1,1,-1,.1,10);scene=new e;material;extractMat;blurMat;passScene=new e;size=new t;target=null;bloomA=null;bloomB=null;look=`natural`;constructor(e){this.renderer=e,this.camera.position.z=1,this.material=new s({uniforms:{uFrame:{value:null},uBloom:{value:null},uLook:{value:1},uResolution:{value:new t(1,1)},uTime:{value:0},uBloomStrength:{value:0}},vertexShader:d,fragmentShader:f,depthTest:!1,depthWrite:!1,toneMapped:!1});let n=new r(new o(2,2),this.material);n.frustumCulled=!1,this.scene.add(n),this.extractMat=this.passMaterial(p,{uFrame:{value:null}}),this.blurMat=this.passMaterial(m,{uFrame:{value:null},uDirection:{value:new t(1,0)}});let i=new r(new o(2,2),this.extractMat);i.frustumCulled=!1,this.passScene.add(i)}setLook(e){this.look=e,this.material.uniforms.uLook.value=l(e)}present(e){if(e(this.renderer),this.look===`natural`)return;let t=this.frameTexture();t&&(this.renderer.initRenderTarget(t),this.renderer.copyFramebufferToTexture(t.texture),this.material.uniforms.uTime.value=performance.now()*.001,this.look===`cinematic`?this.bloom(t):this.material.uniforms.uBloomStrength.value=0,this.renderer.setRenderTarget(null),this.renderer.render(this.scene,this.camera))}dispose(){this.target?.dispose(),this.target=null,this.bloomA?.dispose(),this.bloomB?.dispose(),this.bloomA=null,this.bloomB=null,this.material.dispose(),this.extractMat.dispose(),this.blurMat.dispose();for(let e of[this.scene,this.passScene]){let t=e.children[0];t instanceof r&&t.geometry.dispose()}}bloom(e){let t=Math.max(1,Math.floor(e.width/4)),n=Math.max(1,Math.floor(e.height/4));this.bloomA&&this.bloomA.width===t&&this.bloomA.height===n||(this.bloomA?.dispose(),this.bloomB?.dispose(),this.bloomA=this.makeTarget(t,n),this.bloomB=this.makeTarget(t,n));let r=this.bloomA,i=this.bloomB;i&&(this.extractMat.uniforms.uFrame.value=e.texture,this.pass(this.extractMat,r),this.blurMat.uniforms.uFrame.value=r.texture,this.blurMat.uniforms.uDirection.value.set(1/t,0),this.pass(this.blurMat,i),this.blurMat.uniforms.uFrame.value=i.texture,this.blurMat.uniforms.uDirection.value.set(0,1/n),this.pass(this.blurMat,r),this.material.uniforms.uBloom.value=r.texture,this.material.uniforms.uBloomStrength.value=.55)}pass(e,t){let n=this.passScene.children[0];n instanceof r&&(n.material=e),this.renderer.setRenderTarget(t),this.renderer.render(this.passScene,this.camera)}passMaterial(e,t){return new s({uniforms:t,vertexShader:d,fragmentShader:e,depthTest:!1,depthWrite:!1,toneMapped:!1})}frameTexture(){this.renderer.getDrawingBufferSize(this.size);let e=Math.max(1,this.size.x),t=Math.max(1,this.size.y);return this.target&&this.target.width===e&&this.target.height===t||(this.target?.dispose(),this.target=this.makeTarget(e,t),this.material.uniforms.uFrame.value=this.target.texture,this.material.uniforms.uBloom.value=this.target.texture,this.material.uniforms.uResolution.value.set(e,t)),this.target}makeTarget(e,t){let r=new n(e,t,{depthBuffer:!1,stencilBuffer:!1});return r.texture.colorSpace=``,r.texture.minFilter=c,r.texture.magFilter=c,r.texture.wrapS=i,r.texture.wrapT=i,r.texture.generateMipmaps=!1,r}};function g(e){let t=new h(e.renderer),n=e.initial;t.setLook(n),document.documentElement.dataset.look=n;let r=[];if(e.host){let i=document.createElement(`div`);i.className=`look-row`,i.setAttribute(`role`,`group`),i.setAttribute(`aria-label`,`Look`);let a=document.createElement(`span`);a.className=`look-row__label`,a.textContent=`Look`,i.append(a);for(let a of u){let o=document.createElement(`button`);o.type=`button`,o.className=`look-row__button`,o.dataset.look=a.id,o.textContent=a.label,o.setAttribute(`aria-pressed`,String(a.id===n)),o.addEventListener(`click`,()=>{if(a.id!==n){n=a.id,t.setLook(n),document.documentElement.dataset.look=n;for(let e of r)e.setAttribute(`aria-pressed`,String(e.dataset.look===n));e.onChange(n)}}),r.push(o),i.append(o)}e.host.prepend(i)}return{present(e){t.present(e)},dispose(){t.dispose(),delete document.documentElement.dataset.look}}}export{g as mountLooks};