import * as THREE from '../lib/three.module.min.js';
import { mulberry32, buildStem, buildWhip, makePlantMaterial, makeTransUniforms } from './flower.js';
import { buildObject, disposeObject, OBJECT_KINDS } from './objects.js';
import { SkyDome, samplePalette } from './sky.js';

const CHUNK = 22;      // metres
const RADIUS = 2;      // chunks loaded around you -> 5x5
const STORE_KEY = 'field.picked.v1';

// Low-frequency value noise, one channel per species — this is what makes
// the groves: tulips gather here, poppies there, edges soft as weather.
const KINDS = ['flower', 'seedhead', 'daisy', 'tulip', 'poppy', 'spray', 'umbel', 'plume', 'bells'];
const KIND_CH = { flower: 11, seedhead: 23, daisy: 37, tulip: 53, poppy: 67, spray: 83, umbel: 101, plume: 113, bells: 127 };
function vhash(a, b, ch) {
  let n = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(ch, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, ch) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf), sz = zf * zf * (3 - 2 * zf);
  return vhash(xi, zi, ch) * (1 - sx) * (1 - sz) + vhash(xi + 1, zi, ch) * sx * (1 - sz)
    + vhash(xi, zi + 1, ch) * (1 - sx) * sz + vhash(xi + 1, zi + 1, ch) * sx * sz;
}
function pickKind(x, z, rng) {
  const s = 0.055;
  let total = 0;
  const w = KINDS.map((k) => {
    const ch = KIND_CH[k];
    const v = Math.pow(vnoise(x * s + ch * 10.3, z * s - ch * 4.7, ch), 2.5) + 0.04;
    total += v;
    return v;
  });
  let r = rng() * total;
  for (let i = 0; i < KINDS.length; i++) {
    r -= w[i];
    if (r <= 0) return KINDS[i];
  }
  return 'flower';
}

// Some ground is lusher than other ground; and in places the grass
// stands tall enough to slow a person down.
const LUSH_CH = 131, TALL_CH = 97;
export function tallGrassAt(x, z) {
  return vnoise(x * 0.045, z * 0.045, TALL_CH) > 0.60;
}

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
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.groundMat = new THREE.MeshLambertMaterial({ map: mottledTexture(), color: 0x59604a });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(280, 40), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.ground = ground;
    this.scene.add(ground);

    this.transU = makeTransUniforms();
    this.transU.dir.value.set(26, 20, -44).normalize();
    this.plantMat = makePlantMaterial(uTime, true, false, this.transU);

    // and somewhere near where you wake, a door stands alone in the
    // grass, opening onto nothing you can see from here
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x7a6f58 });
    const doorGrp = new THREE.Group();
    for (const dx of [-0.62, 0.62]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.2, 0.16), frameMat);
      post.position.set(dx, 1.1, 0);
      doorGrp.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.18), frameMat);
    lintel.position.set(0, 2.22, 0);
    doorGrp.add(lintel);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.02, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x647082, roughness: 0.85 }));
    panel.position.set(0.04, 1.01, 0.01);
    panel.rotation.y = -0.1; // ajar, always
    doorGrp.add(panel);
    doorGrp.traverse((o) => { o.castShadow = true; });
    doorGrp.position.set(7, 0, 3);
    doorGrp.rotation.y = 0.7;
    this.scene.add(doorGrp);
    this.doorPos = new THREE.Vector3(7, 1.1, 3);
    this.doorTarget = false;
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

    const extras = [];
    const addPlant = (x, z, kind, id) => {
      const seed = Math.floor(rng() * 0xffffffff);
      const rec = { id, seed, kind, pos: new THREE.Vector3(x, 0, z) };
      records.push(rec);
      if (this.picked.has(id)) return;
      const f = buildStem(rec);
      rec.headPos = f.headPos.clone().add(rec.pos);
      m.makeTranslation(x, 0, z);
      f.geometry.applyMatrix4(m);
      this._append(arrays, f.geometry);
      f.geometry.dispose();
    };

    // flowers gather in loose companies, with stragglers between;
    // lush ground carries more of everything
    const lush = vnoise((ox + CHUNK / 2) * 0.03, (oz + CHUNK / 2) * 0.03, LUSH_CH);
    let fi = 0;
    const nClusters = 2 + Math.floor(rng() * 3) + Math.floor(lush * 2.6);
    for (let c = 0; c < nClusters; c++) {
      const cx0 = ox + rng() * CHUNK, cz0 = oz + rng() * CHUNK;
      const clusterKind = pickKind(cx0, cz0, rng);
      const n = 3 + Math.floor(rng() * 5 + lush * 3);
      for (let j = 0; j < n; j++) {
        const x = cx0 + (rng() - rng()) * 2.4;
        const z = cz0 + (rng() - rng()) * 2.4;
        const kind = rng() < 0.85 ? clusterKind : pickKind(x, z, rng);
        addPlant(x, z, kind, `${cx},${cz},f${fi++}`);
      }
    }
    const nLoners = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < nLoners; j++) {
      const x = ox + rng() * CHUNK, z = oz + rng() * CHUNK;
      addPlant(x, z, pickKind(x, z, rng), `${cx},${cz},f${fi++}`);
    }

    // whips wander wherever they like
    const nWhips = (rng() < 0.85 ? 1 : 0) + (rng() < 0.4 ? 1 : 0);
    for (let wi = 0; wi < nWhips; wi++) {
      const x = ox + rng() * CHUNK, z = oz + rng() * CHUNK;
      const seed = Math.floor(rng() * 0xffffffff);
      const id = `${cx},${cz},w${wi}`;
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

    // and very rarely, the field gives something up
    if (rng() < 0.045) {
      const x = ox + rng() * CHUNK, z = oz + rng() * CHUNK;
      const seed = Math.floor(rng() * 0xffffffff);
      const kind = OBJECT_KINDS[Math.floor(rng() * OBJECT_KINDS.length)];
      const id = `${cx},${cz},o0`;
      const rec = {
        id, seed, kind, object: true,
        pos: new THREE.Vector3(x, 0, z),
        headPos: new THREE.Vector3(x, 0.06, z),
      };
      records.push(rec);
      if (!this.picked.has(id)) {
        const obj = buildObject(kind, seed);
        obj.group.position.set(x, 0, z);
        this.scene.add(obj.group);
        extras.push(obj.group);
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
    const plantTuft = (x, z, tall) => {
      const s = tall ? 1.1 + rng() * 0.9 : 0.5 + rng() * 1.1;
      if (tall) tc.setHSL(0.17 + rng() * 0.06, 0.28, 0.13 + rng() * 0.07);
      else tc.setHSL(0.23 + rng() * 0.06, 0.32, 0.07 + rng() * 0.05);
      const nBlades = tall ? 4 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 2);
      for (let k = 0; k < nBlades; k++) {
        m.makeRotationY(rng() * Math.PI * 2);
        m.setPosition(x + (rng() - 0.5) * (tall ? 0.16 : 0.08), 0, z + (rng() - 0.5) * (tall ? 0.16 : 0.08));
        scaleM.makeScale(s, s * (tall ? 2.4 + rng() * 1.4 : 0.6 + rng() * 0.9), s);
        m.multiply(scaleM);
        this._append(arrays, blade, m, tc);
      }
    };
    for (let i = 0; i < 60; i++) {
      const x = ox + rng() * CHUNK, z = oz + rng() * CHUNK;
      plantTuft(x, z, tallGrassAt(x, z));
    }
    // extra standing grass where the tall patches run
    for (let i = 0; i < 70; i++) {
      const x = ox + rng() * CHUNK, z = oz + rng() * CHUNK;
      if (tallGrassAt(x, z)) plantTuft(x, z, true);
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
    return { mesh, records, extras };
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
    if (old) {
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      for (const g of old.extras) { this.scene.remove(g); disposeObject(g); }
    }
    this.chunks.set(key, this._buildChunk(cx, cz));
  }

  update(worldT, camera, elapsed = 0) {
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
    // light through the petals — strongest looking into the afterglow
    this.transU.col.value.copy(p.glow);
    this.transU.str.value = 0.15 + p.light * 0.5;
    this.plantMat.emissive.copy(p.glow).multiplyScalar(0.03 * p.light);
    this.sky.update(worldT, camera.position, elapsed);

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
        for (const g of ch.extras) { this.scene.remove(g); disposeObject(g); }
        this.chunks.delete(key);
      }
    }

    // what are you looking at, and is it close enough to reach?
    camera.getWorldDirection(this._dir);
    this.target = null;
    const toDoor = this._tmp.copy(this.doorPos).sub(camera.position);
    this.doorTarget = toDoor.length() < 3.4
      && toDoor.normalize().dot(this._dir) > 0.92;
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
    if (this.doorTarget) this.target = null;
  }

  // Is the walker pushing through standing grass here?
  grassAt(x, z) { return tallGrassAt(x, z); }

  // Pick the current target. Gone from the field, forever.
  pick() {
    const rec = this.target;
    if (!rec) return null;
    this.picked.add(rec.id);
    localStorage.setItem(STORE_KEY, JSON.stringify([...this.picked]));
    const [cx, cz] = rec.id.split(',').map(Number);
    this._rebuildChunk(cx, cz);
    this.target = null;
    return { kind: rec.kind, seed: rec.seed, cut: 1, object: rec.object || false };
  }
}
