import * as THREE from '../lib/three.module.min.js';

// The color score. One cycle is a slow walk from dusk into night and
// back toward a pale almost-dawn. t runs 0..1 and wraps.
const KEYS = [
  { t: 0.00, zenith: '#6f7385', horizon: '#c2a284', glow: '#e8b482', ground: '#59604a', light: 0.85 },
  { t: 0.16, zenith: '#575672', horizon: '#b8827a', glow: '#dd8f66', ground: '#4e5342', light: 0.70 },
  { t: 0.36, zenith: '#3c4468', horizon: '#7c6f88', glow: '#b07a85', ground: '#3c4238', light: 0.50 },
  { t: 0.54, zenith: '#1d2745', horizon: '#3f5178', glow: '#5b6b96', ground: '#2c3230', light: 0.34 },
  { t: 0.74, zenith: '#0a0e1e', horizon: '#1c2438', glow: '#2c3752', ground: '#1f2522', light: 0.22 },
  { t: 0.90, zenith: '#3a4256', horizon: '#8d8277', glow: '#bd9d80', ground: '#454b3c', light: 0.55 },
];

const _a = new THREE.Color(), _b = new THREE.Color();

function lerpKey(out, ka, kb, prop, f) {
  _a.set(ka[prop]); _b.set(kb[prop]);
  out.copy(_a).lerp(_b, f);
}

// Sample the palette at cycle position t (0..1). Returns reused object.
const _sample = {
  zenith: new THREE.Color(), horizon: new THREE.Color(),
  glow: new THREE.Color(), ground: new THREE.Color(), light: 1,
};
export function samplePalette(t) {
  t = ((t % 1) + 1) % 1;
  let ka = KEYS[KEYS.length - 1], kb = KEYS[0], span, f;
  for (let i = 0; i < KEYS.length; i++) {
    const next = KEYS[(i + 1) % KEYS.length];
    const end = next.t > KEYS[i].t ? next.t : next.t + 1;
    if (t >= KEYS[i].t && t < end) { ka = KEYS[i]; kb = next; break; }
  }
  span = (kb.t > ka.t ? kb.t : kb.t + 1) - ka.t;
  f = (t - ka.t) / span;
  f = f * f * (3 - 2 * f); // ease
  lerpKey(_sample.zenith, ka, kb, 'zenith', f);
  lerpKey(_sample.horizon, ka, kb, 'horizon', f);
  lerpKey(_sample.glow, ka, kb, 'glow', f);
  lerpKey(_sample.ground, ka, kb, 'ground', f);
  _sample.light = ka.light + (kb.light - ka.light) * f;
  return _sample;
}

export class SkyDome {
  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color('#8b8f9b') },
      uHorizon: { value: new THREE.Color('#cbaa8d') },
      uGlow: { value: new THREE.Color('#e6b98e') },
      uSunDir: { value: new THREE.Vector3(0.4, 0, -0.9).normalize() },
      uStars: { value: 0 },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = (projectionMatrix * p).xyww; // pin to far plane
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uZenith, uHorizon, uGlow, uSunDir;
        uniform float uStars, uTime;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          float a = pow(1.0 - h, 2.4);
          vec3 col = mix(uZenith, uHorizon, a);
          // a warm remnant where the sun went down
          float band = exp(-pow((d.y - 0.02) * 7.0, 2.0));
          vec3 flat_ = normalize(vec3(d.x, 0.0, d.z));
          float azim = 0.5 + 0.5 * dot(flat_, uSunDir);
          col = mix(col, uGlow, band * (0.25 + 0.75 * azim * azim) * 0.85);
          // on some nights, stars — never many, never the same twinkle twice
          if (uStars > 0.001 && d.y > 0.02) {
            vec2 sc = vec2(atan(d.x, d.z) * 57.0, d.y * 90.0);
            vec2 cell = floor(sc);
            float sh = hash(cell);
            if (sh > 0.994) {
              vec2 off = vec2(hash(cell + 1.3), hash(cell + 4.7)) - 0.5;
              float dist = length(fract(sc) - 0.5 - off * 0.6);
              float tw = 0.75 + 0.25 * sin(uTime * (1.0 + sh * 3.0) + sh * 40.0);
              float star = smoothstep(0.10, 0.0, dist) * tw;
              col += vec3(0.85, 0.9, 1.0) * star * uStars * smoothstep(0.02, 0.25, d.y);
            }
          }
          // dither so the gradient never bands
          col += (hash(gl_FragCoord.xy) - 0.5) / 128.0;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), mat);
    this.mesh.frustumCulled = false;
  }

  update(t, cameraPos, elapsed = 0) {
    const p = samplePalette(t);
    this.uniforms.uZenith.value.copy(p.zenith);
    this.uniforms.uHorizon.value.copy(p.horizon);
    this.uniforms.uGlow.value.copy(p.glow);
    // some nights are clear and starred; some are not. each night decides.
    const dark = THREE.MathUtils.smoothstep(0.42, 0.24, p.light);
    const nightSeed = Math.abs(Math.sin(Math.floor(((t % 1) + 1) % 1 + Math.floor(t)) * 12.9898 + Math.floor(t) * 3.7));
    this.uniforms.uStars.value = dark * (nightSeed > 0.4 ? 0.45 + nightSeed * 0.5 : 0);
    this.uniforms.uTime.value = elapsed;
    if (cameraPos) this.mesh.position.copy(cameraPos);
  }
}
