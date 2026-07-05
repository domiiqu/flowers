import * as THREE from '../lib/three.module.min.js';
import { mulberry32, buildStem, buildWhip, makePlantMaterial } from './flower.js';
import { SkyDome, samplePalette } from './sky.js';

const CHUNK = 22;      // metres
const RADIUS = 2;      // chunks loaded around you -> 5x5
const STORE_KEY = 'field.picked.v1';

function chunkSeed(cx, cz) {
  let h = 1779033703 ^ cx;
  h = Math.imul(h ^ cz, 3432918353);
  h = (h << 13) | (h >>> 19);
  return (h ^ 88651) >>> 0;
}

function mottledTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a8a8a0';
  ctx.fillRect(0, 0, 256, 256);
  const rng = mulberry32(7);
  for (let i = 0; i < 700; i++) {
    const g = 140 + Math.floor(rng() * 90);
    ctx.fillStyle = `rgba(${g},${g + 6},${g - 10},${0.05 + rng() * 0.10})`;
    ctx.beginPath();
    ctx.ellipse(rng() * 256, rng() * 256, 2 + rng() * 16, 2 + rng() * 16, rng() * 3, 0, 7);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 48);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Field {
  constructor(uTime) {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x888888, 0.026);

    this.sky = new SkyDome();
    this.scene.add(this.sky.mesh);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffddbb, 0.5);
    this.sun.position.set(26, 20, -44);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -40; this.sun.shadow.camera.right = 40;
    this.sun.shadow.camera.top = 40; this.sun.shadow.camera.bottom = -40;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 140;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.groundMat = new THREE.MeshLambertMaterial({ map: mottledTexture(), color: 0x59604a });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(280, 40), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.ground = ground;
    this.scene.add(ground);

    this.plantMat = makePlantMaterial(uTime, true);
    this.chunks = new Map();   // "cx,cz" -> { mesh, records }
    this.picked = new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]'));
    this.target = null;        // record currently in reach + in gaze
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  _buildChunk(cx, cz) {
    const rng = mulberry32(chunkSeed(cx, cz));
    const arrays = { position: [], normal: [], color: [] };
    const records = [];
    const m = new THREE.Matrix4();
    const ox = cx * CHUNK, oz = cz * CHUNK;

    const nFlowers = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < nFlowers; i++) {
      const x = ox + rng() * CHUNK, z = oz + rng() * CHUNK;
      const seed = Math.floor(rng() * 0xffffffff);
      const roll = rng();
      const kind = roll < 0.5 ? 'flower' : roll < 0.78 ? 'seedhead' : 'daisy';
      const id = `${cx},${cz},f${i}`;
      const rec = { id, seed, kind, pos: new THREE.Vector3(x, 0, z) };
      records.push(rec);
      if (this.picked.has(id)) continue;
      const f = buildStem(rec);
      rec.headPos = f.headPos.clone().add(rec.pos);
      m.makeTranslation(x, 0, z);
      f.geometry.applyMatrix4(m);
      this._append(arrays, f.geometry);
      f.geometry.dispose();
    }

    if (rng() < 0.55) {
      const x = ox + rng() * CHUNK, z = oz + rng() * CHUNK;
      const seed = Math.floor(rng() * 0xffffffff);
      const id = `${cx},${cz},w0`;
      const rec = { id, seed, kind: 'whip', pos: new THREE.Vector3(x, 0, z) };
      records.push(rec);
      if (!this.picked.has(id)) {
        const wgeo = buildWhip(seed);
        rec.headPos = new THREE.Vector3(x, wgeo.height * 0.7, z);
        m.makeTranslation(x, 0, z);
        wgeo.geometry.applyMatrix4(m);
        this._append(arrays, wgeo.geometry);
        wgeo.geometry.dispose();
      }
    }

    // grass blades, not pickable, just company
    const blade = new THREE.PlaneGeometry(0.03, 0.26, 1, 2);
    blade.translate(0, 0.13, 0);
    { // taper and lean the blade
      const bp = blade.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const f = Math.max(0, bp.getY(i) / 0.26);
        bp.setX(i, bp.getX(i) * (1 - f * 0.8));
        bp.setZ(i, f * f * 0.09);
      }
      blade.computeVertexNormals();
    }
    const tc = new THREE.Color();
    const scaleM = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) {
      const x = ox + rng() * CHUNK, z = oz + rng() * CHUNK;
      const s = 0.5 + rng() * 1.1;
      tc.setHSL(0.23 + rng() * 0.06, 0.32, 0.07 + rng() * 0.05);
      const nBlades = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < nBlades; k++) {
        m.makeRotationY(rng() * Math.PI * 2);
        m.setPosition(x + (rng() - 0.5) * 0.08, 0, z + (rng() - 0.5) * 0.08);
        scaleM.makeScale(s, s * (0.6 + rng() * 0.9), s);
        m.multiply(scaleM);
        this._append(arrays, blade, m, tc);
      }
    }
    blade.dispose();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 3));
    const mesh = new THREE.Mesh(geo, this.plantMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // coords are baked world-space
    this.scene.add(mesh);
    return { mesh, records };
  }

  _append(arrays, geo, matrix = null, color = null) {
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const col = geo.attributes.color;
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    const src = geo.index ? geo.toNonIndexed() : geo;
    const p2 = src.attributes.position, n2 = src.attributes.normal, c2 = src.attributes.color;
    for (let i = 0; i < p2.count; i++) {
      v.fromBufferAttribute(p2, i);
      if (matrix) v.applyMatrix4(matrix);
      arrays.position.push(v.x, v.y, v.z);
      nv.fromBufferAttribute(n2, i);
      if (nm) nv.applyMatrix3(nm).normalize();
      arrays.normal.push(nv.x, nv.y, nv.z);
      if (c2) arrays.color.push(c2.getX(i), c2.getY(i), c2.getZ(i));
      else arrays.color.push(color.r, color.g, color.b);
    }
    if (src !== geo) src.dispose();
  }

  _rebuildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const old = this.chunks.get(key);
    if (old) { this.scene.remove(old.mesh); old.mesh.geometry.dispose(); }
    this.chunks.set(key, this._buildChunk(cx, cz));
  }

  update(worldT, camera) {
    const p = samplePalette(worldT);
    this.hemi.color.copy(p.horizon).lerp(p.zenith, 0.3);
    this.hemi.groundColor.copy(p.ground).multiplyScalar(1.3);
    this.hemi.intensity = 0.7 + p.light * 1.0;
    this.sun.color.copy(p.glow);
    this.sun.intensity = 0.15 + p.light * 0.75;
    // the low sun follows you so its shadows always reach
    this.sun.position.set(camera.position.x + 26, 20, camera.position.z - 44);
    this.sun.target.position.set(camera.position.x, 0, camera.position.z);
    // the fog must dissolve into the sky where they meet — this mirrors
    // the sky shader's own colour just above the horizon line
    this.scene.fog.color.copy(p.horizon).lerp(p.glow, 0.36);
    this.groundMat.color.copy(p.ground).multiplyScalar(1.45);
    this.sky.update(worldT, camera.position);

    // ground follows you, snapped to the texture repeat so it stays world-fixed
    const cell = 560 / 48;
    this.ground.position.set(
      Math.round(camera.position.x / cell) * cell, 0,
      Math.round(camera.position.z / cell) * cell);

    // chunk management
    const ccx = Math.floor(camera.position.x / CHUNK);
    const ccz = Math.floor(camera.position.z / CHUNK);
    const want = new Set();
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dz = -RADIUS; dz <= RADIUS; dz++) {
        const key = `${ccx + dx},${ccz + dz}`;
        want.add(key);
        if (!this.chunks.has(key)) {
          this.chunks.set(key, this._buildChunk(ccx + dx, ccz + dz));
        }
      }
    }
    for (const [key, ch] of this.chunks) {
      if (!want.has(key)) {
        this.scene.remove(ch.mesh);
        ch.mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }

    // what are you looking at, and is it close enough to reach?
    camera.getWorldDirection(this._dir);
    this.target = null;
    let best = 0.93;
    for (const [, ch] of this.chunks) {
      for (const rec of ch.records) {
        if (this.picked.has(rec.id) || !rec.headPos) continue;
        const d = this._tmp.copy(rec.headPos).sub(camera.position);
        const dist = d.length();
        if (dist > 2.6) continue;
        const align = d.normalize().dot(this._dir);
        if (align > best) { best = align; this.target = rec; }
      }
    }
  }

  // Pick the current target. Gone from the field, forever.
  pick() {
    const rec = this.target;
    if (!rec) return null;
    this.picked.add(rec.id);
    localStorage.setItem(STORE_KEY, JSON.stringify([...this.picked]));
    const [cx, cz] = rec.id.split(',').map(Number);
    this._rebuildChunk(cx, cz);
    this.target = null;
    return { kind: rec.kind, seed: rec.seed, cut: 1 };
  }
}
