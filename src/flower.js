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

// Append geometry `g` (transformed by matrix) into flat arrays with one
// color per vertex (or a [from,to] gradient along the local y of g).
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
    v.applyMatrix4(matrix);
    arrays.position.push(v.x, v.y, v.z);
    nv.fromBufferAttribute(nor, i).applyMatrix3(_n).normalize();
    arrays.normal.push(nv.x, nv.y, nv.z);
    if (colorTip) {
      const f = (localY - minY) / Math.max(1e-6, maxY - minY);
      c.copy(color).lerp(colorTip, Math.pow(f, 1.8));
      arrays.color.push(c.r, c.g, c.b);
    } else {
      arrays.color.push(color.r, color.g, color.b);
    }
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

function petalGeometry(len, wid) {
  const g = new THREE.PlaneGeometry(wid, len, 1, 4);
  g.translate(0, len / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), f = Math.max(0, y / len);
    pos.setX(i, pos.getX(i) * (1 - Math.pow(f, 1.7) * 0.85)); // taper to a point
    pos.setZ(i, Math.sin(f * Math.PI) * len * 0.10 - f * len * 0.06); // cup + fall back
  }
  g.computeVertexNormals();
  return g;
}

const STEM_GREEN = new THREE.Color('#5d6b44');
const STEM_PALE = new THREE.Color('#8a9860');
const DISC_DARK = new THREE.Color('#1d1210');
const DISC_RING = new THREE.Color('#3a1c14');

// A dark helianthus. Options: cut (0.3..1) trims the stem from the bottom,
// the way a florist would; the head is untouched.
export function buildFlower(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;

  const H = (0.9 + rng() * 0.7) * cut;
  const leanA = rng() * Math.PI * 2;
  const lean = (0.06 + rng() * 0.22) * H;
  const lx = Math.cos(leanA) * lean, lz = Math.sin(leanA) * lean;
  const w = () => (rng() - 0.5) * 0.16 * H;

  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(w(), H * 0.38, w()),
    new THREE.Vector3(lx * 0.65 + w(), H * 0.72, lz * 0.65 + w()),
    new THREE.Vector3(lx, H, lz),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const arrays = { position: [], normal: [], color: [] };

  const stemCol = STEM_GREEN.clone().lerp(STEM_PALE, rng() * 0.5);
  push(arrays, new THREE.TubeGeometry(curve, 10, 0.0065 + rng() * 0.003, 5), _m.identity(), stemCol);

  // the head nods — down and to one side, never straight up
  const nod = 0.35 + rng() * 0.85;
  const nodA = rng() * Math.PI * 2;
  const dir = new THREE.Vector3(
    Math.sin(nod) * Math.cos(nodA), Math.cos(nod), Math.sin(nod) * Math.sin(nodA));
  const headPos = pts[3].clone().addScaledVector(dir, 0.02);
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
  const tip = bicolor
    ? new THREE.Color('#d9bd8d').lerp(base, 0.15 + rng() * 0.2)
    : base.clone().lerp(new THREE.Color('#7a3020'), 0.4 + rng() * 0.4);
  const nPetals = 14 + Math.floor(rng() * 9);
  const pLen = discR * (1.6 + rng() * 0.9);
  const petal = petalGeometry(pLen, pLen * 0.32);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  for (let i = 0; i < nPetals; i++) {
    const theta = (i / nPetals) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35 - rng() * 0.5); // fall back off the disc
    q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), theta);
    q2.multiply(q1).premultiply(headQ);
    const s = 0.8 + rng() * 0.45;
    sc.set(s, s, s);
    _m.compose(headPos.clone().addScaledVector(dir, -discR * 0.15), q2, sc);
    push(arrays, petal, _m, base, tip);
  }
  petal.dispose();

  return { geometry: toGeometry(arrays), height: H, headPos, headR: discR + pLen };
}

// A whip — one of those long pale tendrils that loops off on its own
// errand. No flower to speak of; it is all gesture.
export function buildWhip(seed, opts = {}) {
  const rng = mulberry32(seed);
  const cut = opts.cut ?? 1;
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
  const curve = new THREE.CatmullRomCurve3(pts);
  const arrays = { position: [], normal: [], color: [] };
  const col = new THREE.Color().setHSL(0.21 + rng() * 0.04, 0.28, 0.5 + rng() * 0.12);
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

export function buildStem(entry) {
  return entry.kind === 'whip'
    ? buildWhip(entry.seed, { cut: entry.cut })
    : buildFlower(entry.seed, { cut: entry.cut });
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
