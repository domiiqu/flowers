import * as THREE from '../lib/three.module.min.js';
import { mulberry32 } from './flower.js';

// Things the field has been keeping. They turn up very rarely, half in
// the grass, and they do not wilt — a treasure is a treasure. They can
// stand in the still life alongside the flowers.

export const OBJECT_NAMES = {
  locket: 'a lost locket',
  can: 'an old tin',
  stone: 'a striped stone',
  fossil: 'an ammonite',
};

export const OBJECT_KINDS = Object.keys(OBJECT_NAMES);

function lumpySphere(r, amount, rng, w = 12, h = 9) {
  const g = new THREE.SphereGeometry(r, w, h);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const j = rng() * 20;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + amount * (Math.sin(v.x * 40 + j) * 0.5 + Math.sin(v.y * 55 - j) * 0.3
      + Math.sin(v.z * 33 + j * 2) * 0.2);
    pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }
  g.computeVertexNormals();
  return g;
}

// Returns { group, height, headR }. The group's origin sits on the ground.
export function buildObject(kind, seed) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  let height = 0.06, headR = 0.12;

  if (kind === 'locket') {
    const gold = new THREE.MeshStandardMaterial({
      color: 0xc9a44a, metalness: 0.85, roughness: 0.35, envMapIntensity: 1.2 });
    const caseGeo = new THREE.SphereGeometry(0.021, 20, 14);
    caseGeo.scale(1, 1, 0.42);
    const locket = new THREE.Mesh(caseGeo, gold);
    locket.rotation.x = -Math.PI / 2 + 0.35 + rng() * 0.2;
    locket.position.y = 0.012;
    locket.castShadow = true;
    group.add(locket);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0015, 6, 12), gold);
    loop.position.set(0, 0.02, -0.019);
    group.add(loop);
    // the chain, spilled where it fell
    const pts = [new THREE.Vector3(0, 0.004, -0.02)];
    const dir = new THREE.Vector3(rng() - 0.5, 0, -0.5 - rng()).normalize();
    for (let i = 1; i < 9; i++) {
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (rng() - 0.5) * 1.1).normalize();
      pts.push(pts[i - 1].clone().addScaledVector(dir, 0.014 + rng() * 0.008));
      pts[i].y = 0.0035;
    }
    const chain = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0016, 5), gold);
    chain.castShadow = true;
    group.add(chain);
    height = 0.03; headR = 0.1;
  } else if (kind === 'can') {
    const metal = new THREE.MeshStandardMaterial({
      color: 0x9a958a, metalness: 0.8, roughness: 0.5, envMapIntensity: 0.9,
      side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.092, 20, 1, true), metal);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.031, 20), metal);
    bottom.position.y = -0.046;
    bottom.rotation.x = Math.PI / 2;
    body.add(bottom);
    // a faded paper band, half the label gone
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0315, 0.0315, 0.04, 20, 1, true, 0, 4.2),
      new THREE.MeshStandardMaterial({ color: 0xb0685a, roughness: 0.95, side: THREE.DoubleSide }));
    band.position.y = 0.005;
    body.add(band);
    const tin = new THREE.Group();
    tin.add(body);
    // lying on its side in the grass
    tin.rotation.z = Math.PI / 2 - 0.12 + rng() * 0.24;
    tin.rotation.y = rng() * Math.PI * 2;
    tin.position.y = 0.031;
    tin.traverse((o) => { o.castShadow = true; });
    group.add(tin);
    height = 0.065; headR = 0.11;
  } else if (kind === 'stone') {
    const r = 0.03 + rng() * 0.018;
    const geo = lumpySphere(r, 0.13, rng, 16, 12);
    // sediment bands, drawn straight through the vertex colours
    const pos = geo.attributes.position;
    const cols = [];
    const a = new THREE.Color('#8d8578'), b = new THREE.Color('#d9d2c2');
    const bandF = 90 + rng() * 120, phase = rng() * 7;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const band = 0.5 + 0.5 * Math.sin(pos.getY(i) * bandF + phase);
      c.copy(a).lerp(b, Math.pow(band, 2.2));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const stone = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.7, envMapIntensity: 0.5 }));
    stone.scale.y = 0.72;
    stone.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.6);
    stone.position.y = r * 0.62;
    stone.castShadow = true;
    group.add(stone);
    height = r * 1.3; headR = 0.1;
  } else { // fossil — an ammonite, patient beyond argument
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb3a284, roughness: 0.85, envMapIntensity: 0.5 });
    const pts = [];
    const turns = 3.4 * Math.PI * 2;
    for (let i = 0; i <= 64; i++) {
      const th = (i / 64) * turns;
      const r = 0.0035 * Math.exp(0.105 * th);
      pts.push(new THREE.Vector3(Math.cos(th) * r, Math.sin(th) * r, 0));
    }
    const spiral = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.0062, 8), mat);
    spiral.castShadow = true;
    const shell = new THREE.Group();
    shell.add(spiral);
    shell.rotation.x = -Math.PI / 2 + 0.25 + rng() * 0.2; // lying almost flat
    shell.rotation.z = rng() * Math.PI * 2;
    shell.position.y = 0.012;
    group.add(shell);
    height = 0.03; headR = 0.1;
  }

  return { group, height, headR, headPos: new THREE.Vector3(0, height, 0) };
}

export function disposeObject(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}
