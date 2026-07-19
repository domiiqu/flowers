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

function petalGeometry(len, wid, taper = 0.85, cup = 1.0, d = 1) {
  const g = new THREE.PlaneGeometry(wid, len, d, 4 * d);
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
  const d = opts.detail ?? 1;

  const H = (0.9 + rng() * 0.7) * cut * (1 - 0.12 * w);
  const { curve, tip } = stemCurve(rng, H, 1 + 0.5 * w);
  const arrays = { position: [], normal: [], color: [] };

  const stemCol = STEM_GREEN.clone().lerp(STEM_PALE, rng() * 0.5).lerp(STEM_DRIED, w * 0.6);
  push(arrays, new THREE.TubeGeometry(curve, 10 * d, 0.0065 + rng() * 0.003, 4 + 3 * d), _m.identity(), stemCol);

  // a leaf or two along the stem, drooping with age
  const nLeaves2 = 1 + Math.floor(rng() * 2);
  const leafCol2 = STEM_GREEN.clone().lerp(new THREE.Color('#46512f'), rng() * 0.5)
    .lerp(STEM_DRIED, w * 0.6);
  for (let li = 0; li < nLeaves2; li++) {
    const len = 0.09 + rng() * 0.06;
    const leaf = new THREE.PlaneGeometry(len * 0.55, len, 2, 4);
    leaf.translate(0, len / 2, 0);
    const lp = leaf.attributes.position;
    for (let k = 0; k < lp.count; k++) {
      const f = Math.max(0, lp.getY(k) / len);
      lp.setX(k, lp.getX(k) * Math.sin(Math.min(1, f * 1.6) * Math.PI) * 1.15);
      lp.setZ(k, f * f * len * (0.7 + w * 0.9));
    }
    leaf.computeVertexNormals();
    const at = curve.getPoint(0.35 + rng() * 0.35);
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-(0.9 + rng() * 0.5 + w * 0.5), rng() * Math.PI * 2, 0, 'YXZ'));
    _m.compose(at, q, new THREE.Vector3(1, 1, 1));
    push(arrays, leaf, _m, leafCol2);
    leaf.dispose();
  }

  // the head nods — down and to one side, never straight up
  const nod = 0.35 + rng() * 0.85 + 1.05 * w;
  const nodA = rng() * Math.PI * 2;
  const dir = nodDirection(nod, nodA);
  const headPos = tip.clone().addScaledVector(dir, 0.02);
  const headQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  const discR = 0.055 + rng() * 0.035;
  const disc = new THREE.SphereGeometry(discR, 10 * d, 7 * d);
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
  const petal = petalGeometry(pLen, pLen * 0.32, 0.85, 1.0, d);
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
  const d = opts.detail ?? 1;

  const H = (0.65 + rng() * 0.6) * cut * (1 - 0.08 * w);
  const { curve, tip } = stemCurve(rng, H, 1.3);
  const arrays = { position: [], normal: [], color: [] };

  const stemCol = new THREE.Color('#6f6b48').lerp(new THREE.Color('#4a4130'), rng() * 0.5 + w * 0.4);
  push(arrays, new THREE.TubeGeometry(curve, 10 * d, 0.010 + rng() * 0.004, 4 + 3 * d), _m.identity(), stemCol);

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
  const disc = new THREE.SphereGeometry(discR, 22 * d, 14 * d);
  disc.scale(1 + (rng() - 0.5) * 0.16, 1 + (rng() - 0.5) * 0.16, 0.32);
  _m.compose(headPos, headQ, new THREE.Vector3(1, 1, 1));
  push(arrays, disc, _m, speckle);
  disc.dispose();

  // ragged fringe of dry sepals poking past the rim
  const sepCol = new THREE.Color('#a89a55').lerp(new THREE.Color('#6d6538'), rng() * 0.6 + w * 0.4);
  const nSep = 12 + Math.floor(rng() * 8);
  const sep = petalGeometry(discR * 1.3, discR * 0.16, 0.92, 0.4, d);
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
  const d = opts.detail ?? 1;

  const H = (0.45 + rng() * 0.55) * cut * (1 - 0.1 * w);
  const { curve, tip } = stemCurve(rng, H, 0.8);
  const arrays = { position: [], normal: [], color: [] };

  const stemCol = new THREE.Color('#4b573a').lerp(STEM_DRIED, w * 0.6);
  push(arrays, new THREE.TubeGeometry(curve, 8 * d, 0.0035 + rng() * 0.002, 4 + 3 * d), _m.identity(), stemCol);

  const dLeaf = new THREE.PlaneGeometry(0.008, 0.05, 1, 2);
  dLeaf.translate(0, 0.025, 0);
  for (let li = 0; li < 2 + Math.floor(rng() * 2); li++) {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-(0.6 + rng() * 0.5), rng() * Math.PI * 2, 0, 'YXZ'));
    _m.compose(new THREE.Vector3(0, 0.005, 0), q, new THREE.Vector3(1, 1, 1));
    push(arrays, dLeaf, _m, stemCol);
  }
  dLeaf.dispose();

  const nod = 0.15 + rng() * 0.5 + 0.5 * w;
  const nodA = rng() * Math.PI * 2;
  const dir = nodDirection(nod, nodA);
  const headPos = tip.clone().addScaledVector(dir, 0.008);
  const headQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  const centerR = 0.016 + rng() * 0.009;
  const center = new THREE.SphereGeometry(centerR, 8 * d, 6 * d);
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
  const petal = petalGeometry(pLen, pLen * 0.5, 0.35, 0.5, d);
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

// A blush tulip — double-petalled, tea-coloured, heavy as silk. The only
// one of us with proper leaves.
export function buildTulip(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const d = opts.detail ?? 1;

  const H = (0.5 + rng() * 0.45) * cut * (1 - 0.1 * w);
  // dying tulips do it theatrically: the whole stem lets go over the rim
  const { curve, tip } = stemCurve(rng, H, 0.9 + 2.6 * w);
  const arrays = { position: [], normal: [], color: [] };

  const stemCol = new THREE.Color('#6f7f52').lerp(STEM_DRIED, w * 0.6);
  push(arrays, new THREE.TubeGeometry(curve, 10 * d, 0.007 + rng() * 0.002, 4 + 3 * d), _m.identity(), stemCol);

  // broad strap leaves from low on the stem
  const nLeaves = 1 + Math.floor(rng() * 2);
  const leafCol = new THREE.Color('#5f7250').lerp(new THREE.Color('#8a9860'), rng() * 0.3)
    .lerp(STEM_DRIED, w * 0.5);
  for (let i = 0; i < nLeaves; i++) {
    const len = 0.26 + rng() * 0.18;
    const leaf = new THREE.PlaneGeometry(0.055, len, 2, 6 * d);
    leaf.translate(0, len / 2, 0);
    const lp = leaf.attributes.position;
    for (let k = 0; k < lp.count; k++) {
      const f = Math.max(0, lp.getY(k) / len);
      lp.setX(k, lp.getX(k) * (1 - Math.pow(f, 1.5) * 0.75));
      lp.setZ(k, f * f * len * (0.55 + w * 0.5) + Math.abs(lp.getX(k)) * 0.4);
    }
    leaf.computeVertexNormals();
    const az = rng() * Math.PI * 2;
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-(0.25 + rng() * 0.4), az, 0, 'YXZ'));
    _m.compose(new THREE.Vector3(0, 0.02 + rng() * 0.08, 0), q, new THREE.Vector3(1, 1, 1));
    push(arrays, leaf, _m, leafCol, leafCol.clone().lerp(new THREE.Color('#b3ac72'), 0.4));
    leaf.dispose();
  }

  // the bloom points up, mostly — until, dying, it hangs right over
  const nod = 0.1 + rng() * 0.4 + 1.8 * w;
  const nodA = rng() * Math.PI * 2;
  const dir = nodDirection(nod, nodA);
  const headPos = tip.clone().addScaledVector(dir, 0.005);
  const headQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  // dusty tea / blush / parchment
  const base = new THREE.Color().setHSL(0.04 + rng() * 0.05, 0.22 + rng() * 0.2, 0.52 + rng() * 0.16);
  const tipCol = base.clone().lerp(new THREE.Color('#f0e4d0'), 0.35 + rng() * 0.3);
  base.lerp(new THREE.Color('#8a6a52'), w * 0.55);
  tipCol.lerp(PETAL_DRIED, w * 0.5);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  for (let layer = 0; layer < 3; layer++) {
    const nP = 5 + Math.floor(rng() * 3);
    const pLen = (0.055 + rng() * 0.02) * (1 - layer * 0.12);
    const petal = petalGeometry(pLen, pLen * 0.8, 0.55, -0.9, d);
    const pitch = (1.15 - layer * 0.22) - w * 0.7; // wilt lets the cup fall open
    for (let i = 0; i < nP; i++) {
      const theta = (i / nP) * Math.PI * 2 + layer * 0.45 + (rng() - 0.5) * 0.3;
      q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch + (rng() - 0.5) * 0.2);
      q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), theta);
      q2.multiply(q1).premultiply(headQ);
      _m.compose(headPos, q2, new THREE.Vector3(1, 1, 1));
      push(arrays, petal, _m, base, tipCol);
    }
    petal.dispose();
  }

  return { geometry: toGeometry(arrays), height: H, headPos, headR: 0.09 };
}

// A poppy not yet open — a long swaying stem and a fuzzy green bud,
// sometimes with a crease of orange showing where the flower will be.
export function buildPoppy(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const d = opts.detail ?? 1;

  const H = (0.7 + rng() * 0.6) * cut * (1 - 0.1 * w);
  // an S of a stem — poppies cannot stand still
  const amp = (0.08 + rng() * 0.1) * H * (1 + 0.5 * w);
  const az = rng() * Math.PI * 2;
  const ax = Math.cos(az), az2 = Math.sin(az);
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(ax * amp * 0.7, H * 0.3, az2 * amp * 0.7),
    new THREE.Vector3(-ax * amp, H * 0.6, -az2 * amp),
    new THREE.Vector3(ax * amp * 0.8, H * 0.85, az2 * amp * 0.8),
    new THREE.Vector3(0, H, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const arrays = { position: [], normal: [], color: [] };
  const stemCol = new THREE.Color('#647449').lerp(new THREE.Color('#98a072'), rng() * 0.3)
    .lerp(STEM_DRIED, w * 0.6);
  push(arrays, new THREE.TubeGeometry(curve, 14 * d, 0.0065 + rng() * 0.002, 4 + 3 * d), _m.identity(), stemCol);

  const nod = 0.2 + rng() * 0.7 + 0.6 * w;
  const nodA = rng() * Math.PI * 2;
  const dir = nodDirection(nod, nodA);
  const headPos = pts[4].clone().addScaledVector(dir, 0.01);
  const headQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  const budR = 0.026 + rng() * 0.014;
  const bud = new THREE.SphereGeometry(budR, 10 * d, 8 * d);
  bud.scale(1, 1, 1.35);
  const budBase = new THREE.Color('#5c6c40').lerp(new THREE.Color('#3f4a2e'), w * 0.5);
  const budDark = budBase.clone().lerp(new THREE.Color('#2c331f'), 0.7);
  const jit = rng() * 90;
  const fuzz = (v) => {
    const h = Math.abs(Math.sin(v.x * 143.1 + v.y * 87.3 + v.z * 61.7 + jit)) % 1;
    return budBase.clone().lerp(budDark, h * 0.5);
  };
  _m.compose(headPos, headQ, new THREE.Vector3(1, 1, 1));
  push(arrays, bud, _m, fuzz);
  bud.dispose();

  // a crease of orange, where it is deciding to open
  if (rng() < 0.55 && w < 0.7) {
    const crest = new THREE.Color('#d05a1c').lerp(new THREE.Color('#e88a38'), rng() * 0.5);
    const cPetal = petalGeometry(budR * 1.3, budR * 0.5, 0.6, 0.6, d);
    const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.25 + (rng() - 0.5) * 0.3);
      q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rng() * Math.PI * 2);
      q2.multiply(q1).premultiply(headQ);
      _m.compose(headPos.clone().addScaledVector(dir, budR * 1.05), q2, new THREE.Vector3(1, 1, 1));
      push(arrays, cPetal, _m, crest, crest.clone().lerp(new THREE.Color('#f2b268'), 0.5));
    }
    cPetal.dispose();
  }

  return { geometry: toGeometry(arrays), height: H, headPos, headR: budR * 2.2 };
}

// A spray of wildflowers — one thin stem that cannot decide, branching
// into little white blossoms and unopened beads.
export function buildSpray(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const d = opts.detail ?? 1;

  const H = (0.5 + rng() * 0.4) * cut * (1 - 0.1 * w);
  const { curve, tip } = stemCurve(rng, H, 1.1);
  const arrays = { position: [], normal: [], color: [] };
  const stemCol = new THREE.Color('#6a6a4a').lerp(new THREE.Color('#4a4432'), rng() * 0.5 + w * 0.4);
  push(arrays, new THREE.TubeGeometry(curve, 10 * d, 0.0035, 4 + 2 * d), _m.identity(), stemCol);

  const petalCol = new THREE.Color('#ece6d4')
    .lerp(new THREE.Color('#e0c8bc'), rng() * 0.25)
    .lerp(new THREE.Color('#b5a07c'), w * 0.6);
  const centerCol = new THREE.Color('#caa23a').lerp(new THREE.Color('#7a5c22'), w * 0.5);
  const bPetal = petalGeometry(0.016 + rng() * 0.006, 0.011, 0.35, 0.4, d);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();

  const nBranch = 4 + Math.floor(rng() * 4);
  for (let b = 0; b < nBranch; b++) {
    const t = 0.45 + rng() * 0.5;
    const base = curve.getPoint(t);
    const bAz = rng() * Math.PI * 2;
    const len = 0.08 + rng() * 0.15;
    const out = new THREE.Vector3(Math.cos(bAz), 0.7 + rng() * 0.8, Math.sin(bAz)).normalize();
    const end = base.clone().addScaledVector(out, len);
    const mid = base.clone().addScaledVector(out, len * 0.55);
    mid.x += (rng() - 0.5) * 0.03; mid.z += (rng() - 0.5) * 0.03;
    const bc = new THREE.CatmullRomCurve3([base, mid, end]);
    push(arrays, new THREE.TubeGeometry(bc, 5 * d, 0.0022, 4), _m.identity(), stemCol);

    if (rng() < 0.32 + w * 0.5) {
      // still a bead
      const bead = new THREE.SphereGeometry(0.006, 6, 5);
      _m.makeTranslation(end.x, end.y, end.z);
      push(arrays, bead, _m, petalCol.clone().lerp(stemCol, 0.4));
      bead.dispose();
    } else {
      // a small open blossom facing along the branch, tilted skyward
      const fDir = out.clone().lerp(new THREE.Vector3(0, 1, 0), 0.5).normalize();
      const fQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fDir);
      const heart = new THREE.SphereGeometry(0.004, 6, 5);
      _m.compose(end, fQ, new THREE.Vector3(1, 1, 1));
      push(arrays, heart, _m, centerCol);
      heart.dispose();
      const nP = 5 + Math.floor(rng() * 2);
      for (let i = 0; i < nP; i++) {
        if (rng() < w * 0.6) continue;
        q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.35 + (rng() - 0.5) * 0.3);
        q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (i / nP) * Math.PI * 2 + rng() * 0.3);
        q2.multiply(q1).premultiply(fQ);
        _m.compose(end, q2, new THREE.Vector3(1, 1, 1));
        push(arrays, bPetal, _m, petalCol);
      }
    }
  }
  bPetal.dispose();

  return { geometry: toGeometry(arrays), height: H, headPos: tip.clone(), headR: 0.2 };
}

// Wild carrot — a tall umbel, a lace plate of tiny florets held up to
// the sky. As it dries it closes its hand into a bird's nest.
export function buildUmbel(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const d = opts.detail ?? 1;

  const H = (0.9 + rng() * 0.8) * cut * (1 - 0.08 * w);
  const { curve, tip } = stemCurve(rng, H, 0.7);
  const arrays = { position: [], normal: [], color: [] };
  const stemCol = new THREE.Color('#7a8556').lerp(STEM_DRIED, w * 0.7);
  push(arrays, new THREE.TubeGeometry(curve, 10 * d, 0.005 + rng() * 0.002, 4 + 2 * d), _m.identity(), stemCol);

  // a fan of ferny blades partway up
  const nFern = 2 + Math.floor(rng() * 2);
  const fernCol = stemCol.clone().lerp(new THREE.Color('#4c5936'), 0.4);
  for (let i = 0; i < nFern; i++) {
    const blade = new THREE.PlaneGeometry(0.012, 0.09, 1, 3);
    blade.translate(0, 0.045, 0);
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-(0.7 + rng() * 0.5), rng() * Math.PI * 2, 0, 'YXZ'));
    const at = curve.getPoint(0.25 + rng() * 0.3);
    _m.compose(at, q, new THREE.Vector3(1, 1, 1));
    push(arrays, blade, _m, fernCol);
    blade.dispose();
  }

  // the umbel: spokes from the tip, florets at their ends
  const up = new THREE.Vector3(0, 1, 0);
  const floretCol = new THREE.Color('#e9e4d0').lerp(new THREE.Color('#b9ad8a'), w * 0.7);
  const nSpokes = 9 + Math.floor(rng() * 6);
  const spread = THREE.MathUtils.lerp(1.05, 0.28, w); // drying, it closes
  const spokeLen = 0.05 + rng() * 0.04;
  const floret = new THREE.SphereGeometry(0.0075, 6 * d, 4 * d);
  floret.scale(1, 0.6, 1);
  for (let i = 0; i < nSpokes; i++) {
    const theta = (i / nSpokes) * Math.PI * 2 + rng() * 0.3;
    const sd = new THREE.Vector3(
      Math.sin(spread) * Math.cos(theta), Math.cos(spread), Math.sin(spread) * Math.sin(theta));
    const end = tip.clone().addScaledVector(sd, spokeLen * (0.85 + rng() * 0.3));
    const sc = new THREE.CatmullRomCurve3([tip, tip.clone().lerp(end, 0.5), end]);
    push(arrays, new THREE.TubeGeometry(sc, 3, 0.0012, 4), _m.identity(), stemCol);
    _m.makeTranslation(end.x, end.y, end.z);
    push(arrays, floret, _m, floretCol);
  }
  _m.makeTranslation(tip.x, tip.y + 0.01, tip.z);
  push(arrays, floret, _m, floretCol);
  floret.dispose();

  return { geometry: toGeometry(arrays), height: H, headPos: tip.clone(), headR: 0.12 };
}

// A grass plume — no flower at all, just a feather the light likes.
export function buildPlume(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const d = opts.detail ?? 1;

  const H = (0.8 + rng() * 0.7) * cut;
  const { curve, tip } = stemCurve(rng, H, 1.6 + w * 0.8); // leans hard
  const arrays = { position: [], normal: [], color: [] };
  const straw = new THREE.Color().setHSL(0.11 + rng() * 0.03, 0.3, 0.55 + rng() * 0.12)
    .lerp(new THREE.Color('#8a7452'), w * 0.5);
  const rose = straw.clone().lerp(new THREE.Color('#c8a098'), rng() * 0.5);
  push(arrays, new THREE.TubeGeometry(curve, 10 * d, 0.0035, 4 + 2 * d), _m.identity(), straw);

  // the feather: little tilted blades spiralling up the last quarter
  const nHairs = 14 + Math.floor(rng() * 8);
  const hair = new THREE.PlaneGeometry(0.006, 0.055, 1, 2);
  hair.translate(0, 0.025, 0);
  const q = new THREE.Quaternion();
  for (let i = 0; i < nHairs; i++) {
    const t = 0.72 + (i / nHairs) * 0.28;
    const at = curve.getPoint(Math.min(t, 1));
    q.setFromEuler(new THREE.Euler(
      -(0.5 + rng() * 0.6), (i * 2.4) + rng() * 0.4, rng() * 0.3, 'YXZ'));
    _m.compose(at, q, new THREE.Vector3(1, 1, 1));
    push(arrays, hair, _m, straw, rose);
  }
  hair.dispose();

  return { geometry: toGeometry(arrays), height: H, headPos: tip.clone(), headR: 0.14 };
}

// Harebells — a curved stem hung with little dusty-violet bells,
// each one facing the ground it came from.
export function buildBells(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const d = opts.detail ?? 1;

  const H = (0.45 + rng() * 0.45) * cut * (1 - 0.1 * w);
  const { curve, tip } = stemCurve(rng, H, 1.2);
  const arrays = { position: [], normal: [], color: [] };
  const stemCol = new THREE.Color('#586648').lerp(STEM_DRIED, w * 0.6);
  push(arrays, new THREE.TubeGeometry(curve, 10 * d, 0.003, 4 + 2 * d), _m.identity(), stemCol);

  // small lance leaves at the base
  const leaf = new THREE.PlaneGeometry(0.012, 0.07, 1, 2);
  leaf.translate(0, 0.035, 0);
  for (let i = 0; i < 2; i++) {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-(0.5 + rng() * 0.4), rng() * Math.PI * 2, 0, 'YXZ'));
    _m.compose(new THREE.Vector3(0, 0.01, 0), q, new THREE.Vector3(1, 1, 1));
    push(arrays, leaf, _m, stemCol);
  }
  leaf.dispose();

  const white = rng() < 0.25;
  const bellCol = (white ? new THREE.Color('#ddd8cc') : new THREE.Color('#8a7a9c'))
    .lerp(new THREE.Color('#6a5c50'), w * 0.6);
  const rimCol = bellCol.clone().lerp(new THREE.Color('#e8e2d8'), 0.4);
  const bell = new THREE.CylinderGeometry(0.0045, 0.0115, 0.02, 7, 1, true);
  bell.translate(0, -0.01, 0);
  const nBells = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < nBells; i++) {
    if (rng() < w * 0.7) continue; // bells fall as it dries
    const t = 0.5 + (i / nBells) * 0.5;
    const at = curve.getPoint(Math.min(t, 1));
    const az = rng() * Math.PI * 2;
    at.x += Math.cos(az) * 0.012;
    at.z += Math.sin(az) * 0.012;
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((rng() - 0.5) * 0.5 + Math.PI, rng() * Math.PI, 0));
    _m.compose(at, q, new THREE.Vector3(1, 1, 1));
    push(arrays, bell, _m, bellCol, rimCol);
  }
  bell.dispose();

  return { geometry: toGeometry(arrays), height: H, headPos: tip.clone(), headR: 0.1 };
}

// A carrot — pulled, not picked. In the garden only the feathered
// greens show; the orange of it is a surprise you earn by pulling.
// In a vase it hangs its root like a jewel.
export function buildCarrot(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const d = opts.detail ?? 1;

  const arrays = { position: [], normal: [], color: [] };
  const size = 0.8 + rng() * 0.5;
  const rootH = 0.13 * size;

  // the root: a tapered lathe, bent a little, orange as agreement allows
  const prof = [
    [0.001, 0], [0.006, 0.008], [0.013, 0.035], [0.019, 0.07],
    [0.023, 0.105], [0.024, rootH / size - 0.01], [0.019, rootH / size],
  ].map(([r, h]) => new THREE.Vector2(r * size, h * size));
  const root = new THREE.LatheGeometry(prof, 8 * d);
  { // a crooked one, now and then
    const bend = (rng() - 0.5) * 0.35;
    const rp = root.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const f = rp.getY(i) / rootH;
      rp.setX(i, rp.getX(i) + f * f * bend * rootH);
    }
    root.computeVertexNormals();
  }
  const orange = new THREE.Color('#c96a1b').lerp(new THREE.Color('#a8571a'), rng() * 0.4)
    .lerp(new THREE.Color('#8a6a45'), w * 0.35);
  push(arrays, root, _m.identity(), orange, orange.clone().lerp(new THREE.Color('#e08a35'), 0.5));
  root.dispose();

  // the greens: feathered fronds from the crown
  const crown = new THREE.Vector3(0, rootH, 0);
  const greenF = new THREE.Color('#4e6b2e').lerp(new THREE.Color('#a8a04e'), w * 0.75);
  const leaflet = new THREE.PlaneGeometry(0.005, 0.016, 1, 1);
  let top = rootH;
  const nFronds = 4 + Math.floor(rng() * 3);
  for (let fr = 0; fr < nFronds; fr++) {
    const az = rng() * Math.PI * 2;
    const len = (0.16 + rng() * 0.14) * size * cut;
    const out = 0.25 + rng() * 0.35 + w * 0.55; // wilting, they splay flat
    const dirV = new THREE.Vector3(
      Math.cos(az) * out, 1 - w * 0.5, Math.sin(az) * out).normalize();
    const end = crown.clone().addScaledVector(dirV, len);
    end.y -= w * len * 0.3; // and droop
    const mid = crown.clone().addScaledVector(dirV, len * 0.55);
    mid.y += len * 0.08 * (1 - w);
    const fc = new THREE.CatmullRomCurve3([crown, mid, end]);
    push(arrays, new THREE.TubeGeometry(fc, 5 * d, 0.0016, 4), _m.identity(), greenF);
    const q = new THREE.Quaternion();
    for (let l = 0; l < 7 * d; l++) {
      const t = 0.4 + (l / (7 * d)) * 0.6;
      const at = fc.getPoint(t);
      q.setFromEuler(new THREE.Euler(
        -(0.6 + rng() * 0.8), rng() * Math.PI * 2, 0, 'YXZ'));
      _m.compose(at, q, new THREE.Vector3(1, 1, 1));
      push(arrays, leaflet, _m, greenF, greenF.clone().lerp(new THREE.Color('#7d9a4a'), 0.5));
      top = Math.max(top, at.y);
    }
  }
  leaflet.dispose();

  return {
    geometry: toGeometry(arrays), height: top,
    headPos: new THREE.Vector3(0, top * 0.92, 0), headR: 0.16,
    sink: rootH * 0.94,
  };
}

// A ramp — a wild leek: white bulb, a blush of burgundy at the throat,
// and two or three broad glossy leaves that cannot agree on a direction.
export function buildRamp(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const d = opts.detail ?? 1;

  const arrays = { position: [], normal: [], color: [] };
  const size = 0.85 + rng() * 0.4;

  const bulbProf = [
    [0.001, 0], [0.009, 0.004], [0.013, 0.018], [0.009, 0.036], [0.006, 0.05],
  ].map(([r, h]) => new THREE.Vector2(r * size, h * size));
  const bulb = new THREE.LatheGeometry(bulbProf, 8 * d);
  const white = new THREE.Color('#e8e2d2').lerp(new THREE.Color('#b8a888'), w * 0.4);
  const throatCol = new THREE.Color('#8a4a5a');
  push(arrays, bulb, _m.identity(), white, throatCol);
  bulb.dispose();

  const stemTop = 0.05 * size + (0.03 + rng() * 0.04) * size;
  const sc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.045 * size, 0),
    new THREE.Vector3((rng() - 0.5) * 0.01, stemTop, (rng() - 0.5) * 0.01),
  ]);
  push(arrays, new THREE.TubeGeometry(sc, 3, 0.004 * size, 6), _m.identity(),
    throatCol.clone().lerp(white, 0.4));

  const leafGreen = new THREE.Color('#55743c').lerp(new THREE.Color('#a8a04e'), w * 0.7);
  const nLeaves = 2 + Math.floor(rng() * 2);
  let top = stemTop;
  for (let i = 0; i < nLeaves; i++) {
    const len = (0.2 + rng() * 0.12) * size * cut;
    const wid = 0.042 * size;
    const leaf = new THREE.PlaneGeometry(wid, len, 2, 6 * d);
    leaf.translate(0, len / 2, 0);
    const lp = leaf.attributes.position;
    for (let k = 0; k < lp.count; k++) {
      const f = Math.max(0, lp.getY(k) / len);
      lp.setX(k, lp.getX(k) * Math.sin(Math.min(1, 0.15 + f) * Math.PI) * 1.1);
      lp.setZ(k, f * f * len * (0.5 + rng() * 0.3 + w * 1.1));
    }
    leaf.computeVertexNormals();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      -(0.15 + rng() * 0.3 + w * 0.5), rng() * Math.PI * 2, 0, 'YXZ'));
    _m.compose(new THREE.Vector3(0, stemTop, 0), q, new THREE.Vector3(1, 1, 1));
    push(arrays, leaf, _m, leafGreen, leafGreen.clone().lerp(new THREE.Color('#7d9a55'), 0.55));
    leaf.dispose();
    top = Math.max(top, stemTop + len * (0.8 - w * 0.4));
  }

  return {
    geometry: toGeometry(arrays), height: top,
    headPos: new THREE.Vector3(0, top * 0.85, 0), headR: 0.14,
    sink: 0.03 * size,
  };
}

// An artichoke — a thistle that went to finishing school. Architectural,
// silver-green, tips sometimes bruised purple; dried, it opens and keeps.
export function buildArtichoke(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const d = opts.detail ?? 1;

  const H = (0.45 + rng() * 0.4) * cut * (1 - 0.05 * w);
  const { curve, tip } = stemCurve(rng, H, 0.6);
  const arrays = { position: [], normal: [], color: [] };
  const stemCol = new THREE.Color('#7d8873').lerp(new THREE.Color('#6b5f45'), w * 0.5);
  push(arrays, new THREE.TubeGeometry(curve, 10 * d, 0.011 + rng() * 0.003, 5 + 2 * d), _m.identity(), stemCol);

  // one or two long silvered leaves, edges lobed like torn paper
  const nLeaves = 1 + Math.floor(rng() * 2);
  const silver = new THREE.Color('#93a08a').lerp(new THREE.Color('#8a8468'), w * 0.5);
  for (let i = 0; i < nLeaves; i++) {
    const len = 0.2 + rng() * 0.12;
    const leaf = new THREE.PlaneGeometry(0.05, len, 2, 8 * d);
    leaf.translate(0, len / 2, 0);
    const lp = leaf.attributes.position;
    for (let k = 0; k < lp.count; k++) {
      const f = Math.max(0, lp.getY(k) / len);
      lp.setX(k, lp.getX(k) * (0.5 + 0.5 * Math.abs(Math.sin(f * 9.0))) * (1 - f * 0.5));
      lp.setZ(k, f * f * len * (0.6 + w * 0.6));
    }
    leaf.computeVertexNormals();
    const at = curve.getPoint(0.2 + rng() * 0.3);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      -(0.7 + rng() * 0.5), rng() * Math.PI * 2, 0, 'YXZ'));
    _m.compose(at, q, new THREE.Vector3(1, 1, 1));
    push(arrays, leaf, _m, silver);
    leaf.dispose();
  }

  // the head: layered bracts closing to a point, opening as it dries
  const nod = 0.08 + rng() * 0.3 + 0.2 * w;
  const nodA = rng() * Math.PI * 2;
  const dir = nodDirection(nod, nodA);
  const headPos = tip.clone().addScaledVector(dir, 0.008);
  const headQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const bruised = rng() < 0.45;
  const bract = new THREE.Color('#6e7d5e').lerp(new THREE.Color('#6b5638'), w * 0.6);
  const tipCol = (bruised ? new THREE.Color('#7a5a74') : new THREE.Color('#8d9a78'))
    .lerp(new THREE.Color('#7a6548'), w * 0.6);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const headR = 0.032 + rng() * 0.016;
  for (let layer = 0; layer < 4; layer++) {
    const nB = 6 + Math.floor(rng() * 3);
    const bLen = headR * (1.7 - layer * 0.22);
    const petal = petalGeometry(bLen, bLen * 0.85, 0.5, -0.6, d);
    const pitch = (0.72 + layer * 0.16) - w * 0.55; // drying, it blooms open
    for (let i = 0; i < nB; i++) {
      const theta = (i / nB) * Math.PI * 2 + layer * 0.5 + (rng() - 0.5) * 0.2;
      q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch + (rng() - 0.5) * 0.12);
      q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), theta);
      q2.multiply(q1).premultiply(headQ);
      _m.compose(headPos.clone().addScaledVector(dir, layer * headR * 0.16), q2,
        new THREE.Vector3(1, 1, 1));
      push(arrays, petal, _m, bract, tipCol);
    }
    petal.dispose();
  }

  return { geometry: toGeometry(arrays), height: H, headPos, headR: headR * 2.4 };
}

// A whip — one of those long pale tendrils that loops off on its own
// errand. No flower to speak of; it is all gesture.
export function buildWhip(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
  const w = opts.wilt ?? 0;
  const det = opts.detail ?? 1;
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
  push(arrays, new THREE.TubeGeometry(curve, 48 * det, 0.006, 3 + 3 * det), _m.identity(), col);
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
  tulip: buildTulip,
  poppy: buildPoppy,
  spray: buildSpray,
  umbel: buildUmbel,
  plume: buildPlume,
  bells: buildBells,
  carrot: buildCarrot,
  ramp: buildRamp,
  artichoke: buildArtichoke,
};

export const STEM_NAMES = {
  flower: 'dark sunflower',
  seedhead: 'seed head',
  daisy: 'chalk daisy',
  whip: 'whip',
  tulip: 'blush tulip',
  poppy: 'poppy bud',
  spray: 'wild spray',
  umbel: 'wild carrot',
  plume: 'grass plume',
  bells: 'harebells',
  carrot: 'carrot',
  ramp: 'ramp',
  artichoke: 'artichoke',
};

export function buildStem(entry, detail = 1) {
  const make = BUILDERS[entry.kind] || buildFlower;
  return make(entry.seed, { cut: entry.cut, wilt: entry.wilt || 0, detail });
}

// Shared uniforms for translucency — the scene that owns the plants
// points these at its own sun, and light passes through the petals.
export function makeTransUniforms() {
  return {
    dir: { value: new THREE.Vector3(0, 1, 0) },
    col: { value: new THREE.Color(0xffffff) },
    str: { value: 0 },
  };
}

// One shared material for everything grown. Sway is injected into the
// shader: anything above the soil moves a little. Translucency is
// injected too: petals lit from behind glow like backlit tissue.
export function makePlantMaterial(uTime, sway = true, standard = false, trans = null) {
  const mat = standard
    ? new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.82, metalness: 0,
      envMapIntensity: 0.55 })
    : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  if (sway || trans) {
    mat.onBeforeCompile = (shader) => {
      if (sway) {
        shader.uniforms.uTime = uTime;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float swayAmt = smoothstep(0.15, 1.4, position.y);
          transformed.x += swayAmt * 0.022 * sin(uTime * 0.8 + position.x * 0.6 + position.z * 0.8);
          transformed.z += swayAmt * 0.017 * sin(uTime * 0.63 + position.x * 0.8 + 2.0);`
        );
      }
      if (trans) {
        shader.uniforms.uTransDir = trans.dir;
        shader.uniforms.uTransCol = trans.col;
        shader.uniforms.uTransStr = trans.str;
        shader.fragmentShader =
          'uniform vec3 uTransDir;\nuniform vec3 uTransCol;\nuniform float uTransStr;\n'
          + shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
            {
              vec3 V = normalize(vViewPosition);
              vec3 L = normalize((viewMatrix * vec4(uTransDir, 0.0)).xyz);
              float tr = pow(clamp(dot(V, -L), 0.0, 1.0), 3.0);
              reflectedLight.indirectDiffuse += diffuseColor.rgb * uTransCol * tr * uTransStr;
            }`
          );
      }
    };
  }
  return mat;
}
