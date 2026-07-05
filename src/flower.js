import * as THREE from '../lib/three.module.min.js';

// Deterministic rng — a flower is its seed. Pick it in the field,
// meet the same flower again on the studio table.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();

// Append geometry `g` (transformed by matrix) into flat arrays.
// `color` may be: a Color; [base, tip] for a gradient along local y;
// or a function (localPosition) -> Color, for mottled things.
function push(arrays, g, matrix, color, colorTip = null) {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.attributes.position;
  const nor = src.attributes.normal;
  _n.getNormalMatrix(matrix);
  const v = new THREE.Vector3(), nv = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  if (colorTip) {
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const localY = v.y;
    if (typeof color === 'function') {
      const cc = color(v);
      arrays.color.push(cc.r, cc.g, cc.b);
    } else if (colorTip) {
      const f = (localY - minY) / Math.max(1e-6, maxY - minY);
      c.copy(color).lerp(colorTip, Math.pow(f, 1.8));
      arrays.color.push(c.r, c.g, c.b);
    } else {
      arrays.color.push(color.r, color.g, color.b);
    }
    v.applyMatrix4(matrix);
    arrays.position.push(v.x, v.y, v.z);
    nv.fromBufferAttribute(nor, i).applyMatrix3(_n).normalize();
    arrays.normal.push(nv.x, nv.y, nv.z);
  }
  if (src !== g) src.dispose();
}

function toGeometry(arrays) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 3));
  return geo;
}

function petalGeometry(len, wid, taper = 0.85, cup = 1.0) {
  const g = new THREE.PlaneGeometry(wid, len, 1, 4);
  g.translate(0, len / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), f = Math.max(0, y / len);
    pos.setX(i, pos.getX(i) * (1 - Math.pow(f, 1.7) * taper));
    pos.setZ(i, (Math.sin(f * Math.PI) * len * 0.10 - f * len * 0.06) * cup);
  }
  g.computeVertexNormals();
  return g;
}

// A wandering stem curve from the ground to (roughly) height H.
function stemCurve(rng, H, leanFactor = 1) {
  const leanA = rng() * Math.PI * 2;
  const lean = (0.06 + rng() * 0.22) * H * leanFactor;
  const lx = Math.cos(leanA) * lean, lz = Math.sin(leanA) * lean;
  const w = () => (rng() - 0.5) * 0.16 * H;
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(w(), H * 0.38, w()),
    new THREE.Vector3(lx * 0.65 + w(), H * 0.72, lz * 0.65 + w()),
    new THREE.Vector3(lx, H, lz),
  ];
  return { curve: new THREE.CatmullRomCurve3(pts), tip: pts[3] };
}

function nodDirection(nod, nodA) {
  return new THREE.Vector3(
    Math.sin(nod) * Math.cos(nodA), Math.cos(nod), Math.sin(nod) * Math.sin(nodA));
}

const STEM_GREEN = new THREE.Color('#5d6b44');
const STEM_PALE = new THREE.Color('#8a9860');
const STEM_DRIED = new THREE.Color('#7a6a45');
const DISC_DARK = new THREE.Color('#1d1210');
const DISC_RING = new THREE.Color('#3a1c14');
const PETAL_DRIED = new THREE.Color('#4f3623');

// A dark helianthus. Options:
//   cut  (0.3..1) — trims the stem from the bottom, like a florist would
//   wilt (0..1)   — time doing what time does: the head hangs, the colour dries
export function buildFlower(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;

  const H = (0.9 + rng() * 0.7) * cut * (1 - 0.12 * w);
  const { curve, tip } = stemCurve(rng, H, 1 + 0.5 * w);
  const arrays = { position: [], normal: [], color: [] };

  const stemCol = STEM_GREEN.clone().lerp(STEM_PALE, rng() * 0.5).lerp(STEM_DRIED, w * 0.6);
  push(arrays, new THREE.TubeGeometry(curve, 10, 0.0065 + rng() * 0.003, 5), _m.identity(), stemCol);

  // the head nods — down and to one side, never straight up
  const nod = 0.35 + rng() * 0.85 + 1.05 * w;
  const nodA = rng() * Math.PI * 2;
  const dir = nodDirection(nod, nodA);
  const headPos = tip.clone().addScaledVector(dir, 0.02);
  const headQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  const discR = 0.055 + rng() * 0.035;
  const disc = new THREE.SphereGeometry(discR, 10, 7);
  disc.scale(1, 1, 0.42);
  _m.compose(headPos, headQ, new THREE.Vector3(1, 1, 1));
  push(arrays, disc, _m, DISC_DARK, DISC_RING);
  disc.dispose();

  // petals — oxblood, a quarter of them tipped cream like old velvet
  const bicolor = rng() < 0.28;
  const base = new THREE.Color().setHSL(0.985 + rng() * 0.035, 0.48 + rng() * 0.18, 0.11 + rng() * 0.07);
  const tipCol = bicolor
    ? new THREE.Color('#d9bd8d').lerp(base, 0.15 + rng() * 0.2)
    : base.clone().lerp(new THREE.Color('#7a3020'), 0.4 + rng() * 0.4);
  base.lerp(PETAL_DRIED, w * 0.6);
  tipCol.lerp(PETAL_DRIED, w * 0.7);
  const nPetals = 14 + Math.floor(rng() * 9);
  const pLen = discR * (1.6 + rng() * 0.9);
  const petal = petalGeometry(pLen, pLen * 0.32);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  for (let i = 0; i < nPetals; i++) {
    const theta = (i / nPetals) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35 - rng() * 0.5 - 1.2 * w);
    q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), theta);
    q2.multiply(q1).premultiply(headQ);
    const s = 0.8 + rng() * 0.45;
    sc.set(s, s, s);
    _m.compose(headPos.clone().addScaledVector(dir, -discR * 0.15), q2, sc);
    push(arrays, petal, _m, base, tipCol);
  }
  petal.dispose();

  return { geometry: toGeometry(arrays), height: H, headPos, headR: discR + pLen };
}

// A dried seed head — the flower long over, the great disc remaining.
// Grey, brown or rust, speckled like a thumbprint, ringed with a ragged
// fringe of old sepals. Heavy; it hangs.
export function buildSeedhead(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;

  const H = (0.65 + rng() * 0.6) * cut * (1 - 0.08 * w);
  const { curve, tip } = stemCurve(rng, H, 1.3);
  const arrays = { position: [], normal: [], color: [] };

  const stemCol = new THREE.Color('#6f6b48').lerp(new THREE.Color('#4a4130'), rng() * 0.5 + w * 0.4);
  push(arrays, new THREE.TubeGeometry(curve, 10, 0.010 + rng() * 0.004, 5), _m.identity(), stemCol);

  const nod = 0.8 + rng() * 0.8 + 0.35 * w;
  const nodA = rng() * Math.PI * 2;
  const dir = nodDirection(nod, nodA);
  const headPos = tip.clone().addScaledVector(dir, 0.015);
  const headQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  // the disc families of the dried heads: silver, umber, rust
  const fam = rng();
  const base = fam < 0.4 ? new THREE.Color('#b5b0a0')
    : fam < 0.75 ? new THREE.Color('#6e4c34') : new THREE.Color('#8a5638');
  const dark = fam < 0.4 ? new THREE.Color('#2e241c') : new THREE.Color('#1d1410');
  base.lerp(dark, w * 0.35);
  const jitter = rng() * 100;
  const speckle = (v) => {
    const h = Math.abs(Math.sin(v.x * 91.7 + v.y * 47.3 + v.z * 73.1 + jitter)) % 1;
    const c = base.clone();
    if (h < 0.45) c.lerp(dark, 0.65 + h * 0.7);
    else c.lerp(dark, h * 0.18);
    return c;
  };

  const discR = 0.085 + rng() * 0.075;
  const disc = new THREE.SphereGeometry(discR, 22, 14);
  disc.scale(1 + (rng() - 0.5) * 0.16, 1 + (rng() - 0.5) * 0.16, 0.32);
  _m.compose(headPos, headQ, new THREE.Vector3(1, 1, 1));
  push(arrays, disc, _m, speckle);
  disc.dispose();

  // ragged fringe of dry sepals poking past the rim
  const sepCol = new THREE.Color('#a89a55').lerp(new THREE.Color('#6d6538'), rng() * 0.6 + w * 0.4);
  const nSep = 12 + Math.floor(rng() * 8);
  const sep = petalGeometry(discR * 1.3, discR * 0.16, 0.92, 0.4);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  for (let i = 0; i < nSep; i++) {
    if (rng() < 0.2) continue; // gaps — nothing dried is complete
    const theta = (i / nSep) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.15 - rng() * 0.3);
    q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), theta);
    q2.multiply(q1).premultiply(headQ);
    _m.compose(headPos.clone().addScaledVector(dir, -discR * 0.12), q2,
      new THREE.Vector3(1, 1, 1));
    push(arrays, sep, _m, sepCol);
  }
  sep.dispose();

  return { geometry: toGeometry(arrays), height: H, headPos, headR: discR * 1.4 };
}

// A chalk daisy — small, pale, offhand. Loses petals as it goes.
export function buildDaisy(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;

  const H = (0.45 + rng() * 0.55) * cut * (1 - 0.1 * w);
  const { curve, tip } = stemCurve(rng, H, 0.8);
  const arrays = { position: [], normal: [], color: [] };

  const stemCol = new THREE.Color('#4b573a').lerp(STEM_DRIED, w * 0.6);
  push(arrays, new THREE.TubeGeometry(curve, 8, 0.0035 + rng() * 0.002, 5), _m.identity(), stemCol);

  const nod = 0.15 + rng() * 0.5 + 0.5 * w;
  const nodA = rng() * Math.PI * 2;
  const dir = nodDirection(nod, nodA);
  const headPos = tip.clone().addScaledVector(dir, 0.008);
  const headQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  const centerR = 0.016 + rng() * 0.009;
  const center = new THREE.SphereGeometry(centerR, 8, 6);
  center.scale(1, 1, 0.55);
  _m.compose(headPos, headQ, new THREE.Vector3(1, 1, 1));
  push(arrays, center,
    _m, new THREE.Color('#b08434').lerp(new THREE.Color('#6b4c1e'), w * 0.6));
  center.dispose();

  const petalCol = new THREE.Color('#ece2c8')
    .lerp(new THREE.Color('#d8b0a0'), rng() * 0.3)
    .lerp(new THREE.Color('#b5a07c'), w * 0.7);
  const nPetals = 7 + Math.floor(rng() * 3);
  const pLen = centerR * (2.2 + rng() * 0.9);
  const petal = petalGeometry(pLen, pLen * 0.5, 0.35, 0.5);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  for (let i = 0; i < nPetals; i++) {
    if (rng() < 0.08 + w * 0.75) continue; // petals let go, one by one
    const theta = (i / nPetals) * Math.PI * 2 + (rng() - 0.5) * 0.2;
    q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.2 - rng() * 0.3 - 0.6 * w);
    q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), theta);
    q2.multiply(q1).premultiply(headQ);
    _m.compose(headPos.clone().addScaledVector(dir, -centerR * 0.2), q2,
      new THREE.Vector3(1, 1, 1));
    push(arrays, petal, _m, petalCol);
  }
  petal.dispose();

  return { geometry: toGeometry(arrays), height: H, headPos, headR: centerR + pLen };
}

// A whip — one of those long pale tendrils that loops off on its own
// errand. No flower to speak of; it is all gesture.
export function buildWhip(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const steps = 26;
  const totalLen = (1.5 + rng() * 1.2) * cut;
  const step = totalLen / steps;
  const pts = [new THREE.Vector3(0, 0, 0)];
  const d = new THREE.Vector3(0, 1, 0);
  const turn = new THREE.Vector3();
  let wildness = 0.12;
  for (let i = 1; i <= steps; i++) {
    turn.set((rng() - 0.5), (rng() - 0.5) * 0.6, (rng() - 0.5)).multiplyScalar(wildness);
    d.add(turn).normalize();
    // gravity for long arcs, so loops lean out and over
    d.y -= (i / steps) * 0.05 * rng();
    d.normalize();
    pts.push(pts[i - 1].clone().addScaledVector(d, step));
    wildness = Math.min(0.9, wildness + 0.045); // starts obedient, ends lost
  }
  if (w > 0) { // dried whips sag toward the ground
    for (let i = 0; i <= steps; i++) pts[i].y *= 1 - 0.32 * w * (i / steps);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const arrays = { position: [], normal: [], color: [] };
  const col = new THREE.Color().setHSL(0.21 + rng() * 0.04, 0.28, 0.5 + rng() * 0.12)
    .lerp(new THREE.Color('#b3a066'), w * 0.7);
  push(arrays, new THREE.TubeGeometry(curve, 48, 0.006, 4), _m.identity(), col);
  // a tiny closed bud at the very end
  const end = pts[pts.length - 1];
  const bud = new THREE.SphereGeometry(0.014, 6, 5);
  _m.makeTranslation(end.x, end.y, end.z);
  push(arrays, bud, _m, col.clone().lerp(new THREE.Color('#c9c39a'), 0.5));
  bud.dispose();
  let top = 0;
  for (const p of pts) top = Math.max(top, p.y);
  return { geometry: toGeometry(arrays), height: top, headPos: end.clone(), headR: 0.12 };
}

const BUILDERS = {
  flower: buildFlower,
  seedhead: buildSeedhead,
  daisy: buildDaisy,
  whip: buildWhip,
};

export const STEM_NAMES = {
  flower: 'dark sunflower',
  seedhead: 'seed head',
  daisy: 'chalk daisy',
  whip: 'whip',
};

export function buildStem(entry) {
  const make = BUILDERS[entry.kind] || buildFlower;
  return make(entry.seed, { cut: entry.cut, wilt: entry.wilt || 0 });
}

// One shared material for everything grown. Sway is injected into the
// shader: anything above the soil moves a little.
export function makePlantMaterial(uTime, sway = true) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  if (sway) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float swayAmt = smoothstep(0.15, 1.4, position.y);
        transformed.x += swayAmt * 0.022 * sin(uTime * 0.8 + position.x * 0.6 + position.z * 0.8);
        transformed.z += swayAmt * 0.017 * sin(uTime * 0.63 + position.x * 0.8 + 2.0);`
      );
    };
  }
  return mat;
}
