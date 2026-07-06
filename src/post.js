import * as THREE from '../lib/three.module.min.js';

// A small hand-rolled lens. The scene is rendered in linear light into a
// texture, a soft glow is skimmed off the brightest parts, a blurred copy
// stands in for everything out of focus, and the final pass grades it all
// through the same filmic curve as before. Four extra passes, all at
// reduced resolution; no external machinery.

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const BLUR_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uDir, uTexel;
  void main() {
    vec2 o = uDir * uTexel;
    vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
    c += (texture2D(tSrc, vUv + o * 1.384).rgb + texture2D(tSrc, vUv - o * 1.384).rgb) * 0.316;
    c += (texture2D(tSrc, vUv + o * 3.230).rgb + texture2D(tSrc, vUv - o * 3.230).rgb) * 0.070;
    gl_FragColor = vec4(c, 1.0);
  }`;

const BRIGHT_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform float uThresh;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(c * smoothstep(uThresh, uThresh + 0.7, l), 1.0);
  }`;

const COMP_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tScene, tBlur, tBloom, tDepth;
  uniform float uNear, uFar, uFocus, uRange, uDof, uBloom;
  float toViewZ(float d) {
    return (uNear * uFar) / ((uFar - uNear) * d - uFar);
  }
  void main() {
    vec3 sharp = texture2D(tScene, vUv).rgb;
    vec3 col = sharp;
    if (uDof > 0.001) {
      float z = -toViewZ(texture2D(tDepth, vUv).x);
      float coc = clamp(abs(z - uFocus) / uRange, 0.0, 1.0) * uDof;
      col = mix(sharp, texture2D(tBlur, vUv).rgb, coc);
    }
    col += texture2D(tBloom, vUv).rgb * uBloom;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function makeRT(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: opts.depth ?? false,
    samples: opts.samples ?? 0,
  });
}

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo, null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    const shader = (frag, uniforms) => new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: frag,
      depthTest: false, depthWrite: false,
    });
    this.blurMat = shader(BLUR_FRAG, {
      tSrc: { value: null },
      uDir: { value: new THREE.Vector2(1, 0) },
      uTexel: { value: new THREE.Vector2() },
    });
    this.brightMat = shader(BRIGHT_FRAG, {
      tSrc: { value: null },
      uThresh: { value: 0.55 },
    });
    this.compMat = shader(COMP_FRAG, {
      tScene: { value: null }, tBlur: { value: null },
      tBloom: { value: null }, tDepth: { value: null },
      uNear: { value: 0.1 }, uFar: { value: 100 },
      uFocus: { value: 3 }, uRange: { value: 1.5 },
      uDof: { value: 0 }, uBloom: { value: 0.25 },
    });
  }

  setSize(w, h) {
    for (const rt of [this.rtScene, this.rtA, this.rtB, this.rtBloomA, this.rtBloomB]) {
      rt?.dispose();
    }
    this.rtScene = makeRT(w, h, { depth: true, samples: 4 });
    this.rtScene.depthTexture = new THREE.DepthTexture(w, h);
    this.rtA = makeRT(w / 2, h / 2);
    this.rtB = makeRT(w / 2, h / 2);
    this.rtBloomA = makeRT(w / 4, h / 4);
    this.rtBloomB = makeRT(w / 4, h / 4);
  }

  _pass(mat, src, dest, dir = null) {
    this.quad.material = mat;
    mat.uniforms.tSrc.value = src;
    if (dir) {
      mat.uniforms.uDir.value.set(dir[0], dir[1]);
      mat.uniforms.uTexel.value.set(1 / dest.width, 1 / dest.height);
    }
    this.renderer.setRenderTarget(dest);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera, o) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);

    // the glow
    this._pass(this.brightMat, this.rtScene.texture, this.rtBloomA);
    this._pass(this.blurMat, this.rtBloomA.texture, this.rtBloomB, [1, 0]);
    this._pass(this.blurMat, this.rtBloomB.texture, this.rtBloomA, [0, 1]);
    this._pass(this.blurMat, this.rtBloomA.texture, this.rtBloomB, [1, 0]);
    this._pass(this.blurMat, this.rtBloomB.texture, this.rtBloomA, [0, 1]);

    // the out-of-focus world
    if (o.dof > 0.001) {
      this._pass(this.blurMat, this.rtScene.texture, this.rtA, [1, 0]);
      this._pass(this.blurMat, this.rtA.texture, this.rtB, [0, 1]);
      this._pass(this.blurMat, this.rtB.texture, this.rtA, [1, 0]);
      this._pass(this.blurMat, this.rtA.texture, this.rtB, [0, 1]);
    }

    const u = this.compMat.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tBlur.value = this.rtB.texture;
    u.tBloom.value = this.rtBloomA.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uFocus.value = o.focus ?? 3;
    u.uRange.value = o.range ?? 1.5;
    u.uDof.value = o.dof ?? 0;
    u.uBloom.value = o.bloom ?? 0.25;
    this.quad.material = this.compMat;
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
