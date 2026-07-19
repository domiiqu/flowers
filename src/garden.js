import * as THREE from '../lib/three.module.min.js';
import { mulberry32, buildStem, buildWhip, makePlantMaterial, makeTransUniforms } from './flower.js';
import { SkyDome } from './sky.js';

// The walled garden. The field is forever dusk; this place is a held
// morning — lighter, sunnier, quieter. You are inside its walls, among
// raised beds that were planted in rows once and have since had their own
// ideas. The blue door in the south wall goes back to the field.

const STORE_KEY = 'garden.picked.v1';
const W = 11, D = 8;          // half-extents of the enclosure
const WALL_H = 2.35;
const BED_TOP = 0.18;

const MORNING = {
  zenith: new THREE.Color('#9fb5be'),
  horizon: new THREE.Color('#e9dcba'),
  glow: new THREE.Color('#f4e6b4'),
};

function soilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a89b7c';
  ctx.fillRect(0, 0, 128, 128);
  const rng = mulberry32(31);
  for (let i = 0; i < 500; i++) {
    const g = 120 + Math.floor(rng() * 90);
    ctx.fillStyle = `rgba(${g},${g - 8},${g - 26},${0.06 + rng() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(rng() * 128, rng() * 128, 1 + rng() * 7, 1 + rng() * 7, rng() * 3, 0, 7);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(20, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Garden {
  constructor(uTime) {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xe4d8b6, 0.012);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
    this.camera.position.set(0, 1.55, 5.5);
    this.camera.rotation.order = 'YXZ';

    this.sky = new SkyDome();
    this.sky.uniforms.uZenith.value.copy(MORNING.zenith);
    this.sky.uniforms.uHorizon.value.copy(MORNING.horizon);
    this.sky.uniforms.uGlow.value.copy(MORNING.glow);
    this.sky.uniforms.uSunDir.value.set(0.5, 0, 0.5).normalize();
    this.scene.add(this.sky.mesh);

    this.hemi = new THREE.HemisphereLight(0xfff4d8, 0x7a8054, 1.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0c4, 1.15);
    this.sun.position.set(14, 20, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -15; this.sun.shadow.camera.right = 15;
    this.sun.shadow.camera.top = 15; this.sun.shadow.camera.bottom = -15;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);

    this.transU = makeTransUniforms();
    this.transU.dir.value.copy(this.sun.position).normalize();
    this.transU.col.value.set(0xf4e6b4);
    this.transU.str.value = 0.3;
    this.plantMat = makePlantMaterial(uTime, true, false, this.transU);

    this.picked = new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]'));
    this.records = [];
    this.target = null;      // plant in reach + in gaze
    this.doorTarget = false; // looking at the door, near it
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._t = 0;

    this._buildEnclosure();
    this._plantMesh = null;
    this._rebuildPlants();
    this._buildButterflies();
  }

  // ---- the place itself ---------------------------------------------------

  _buildEnclosure() {
    // warm ground, and a lighter path worn from the door to the middle
    const groundMat = new THREE.MeshLambertMaterial({ map: soilTexture(), color: 0x8a9161 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 3, D * 2 + 3), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.6, D * 2),
      new THREE.MeshLambertMaterial({ color: 0xc2b491 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.005, 0);
    path.receiveShadow = true;
    this.scene.add(path);

    // sunlit plaster walls; the south wall parts around the door
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xd8c9a4 });
    const cap = new THREE.MeshLambertMaterial({ color: 0xb8a988 });
    const mkWall = (w, x, z, rotY) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, 0.3), wallMat);
      m.position.set(x, WALL_H / 2, z);
      m.rotation.y = rotY;
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      const c = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.08, 0.4), cap);
      c.position.set(x, WALL_H + 0.04, z);
      c.rotation.y = rotY;
      this.scene.add(c);
    };
    mkWall(W * 2 + 0.6, 0, -D - 0.15, 0);                     // north
    mkWall(D * 2 + 0.6, -W - 0.15, 0, Math.PI / 2);           // west
    mkWall(D * 2 + 0.6, W + 0.15, 0, Math.PI / 2);            // east
    const gap = 0.75; // half-width of the doorway
    mkWall(W - gap, -(W + gap) / 2 - 0.15, D + 0.15, 0);      // south, left of door
    mkWall(W - gap, (W + gap) / 2 + 0.15, D + 0.15, 0);       // south, right of door

    // the door — old blue, a little sun-bleached
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x7a6f58 });
    for (const dx of [-gap, gap]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.15, 0.34), frameMat);
      post.position.set(dx, 1.075, D + 0.15);
      this.scene.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(gap * 2 + 0.12, 0.14, 0.34), frameMat);
    lintel.position.set(0, 2.15, D + 0.15);
    this.scene.add(lintel);
    this.door = new THREE.Mesh(new THREE.BoxGeometry(gap * 2 - 0.1, 2.0, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x647082, roughness: 0.85 }));
    this.door.position.set(0.05, 1.0, D + 0.13);
    this.door.rotation.y = 0.12; // ajar, always
    this.door.castShadow = true;
    this.scene.add(this.door);
    this.doorPos = new THREE.Vector3(0, 1.1, D + 0.1);

    // raised beds, two ranks flanking the path
    this.beds = [];
    const bedMat = new THREE.MeshLambertMaterial({ color: 0x6b5a42 });
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x4a3b2c });
    for (const bx of [-5.6, 5.6]) {
      for (const bz of [-4.6, 0, 4.6]) {
        const bw = 6.6, bd = 2.0;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(bw, BED_TOP, bd), bedMat);
        frame.position.set(bx, BED_TOP / 2, bz);
        frame.castShadow = true;
        frame.receiveShadow = true;
        this.scene.add(frame);
        const soil = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.16, bd - 0.16), soilMat);
        soil.rotation.x = -Math.PI / 2;
        soil.position.set(bx, BED_TOP + 0.005, bz);
        soil.receiveShadow = true;
        this.scene.add(soil);
        this.beds.push({ x: bx, z: bz, w: bw - 0.5, d: bd - 0.5 });
      }
    }

    // a couple of terracotta pots left about, one on its side
    const potMat = new THREE.MeshStandardMaterial({ color: 0xa25c3b, roughness: 0.95 });
    const potGeo = new THREE.CylinderGeometry(0.14, 0.1, 0.22, 14, 1, true);
    for (const [px, pz, tipped] of [[-1.6, 6.2, false], [2.1, -6.6, true], [8.9, 6.9, false]]) {
      const pot = new THREE.Mesh(potGeo, potMat);
      if (tipped) {
        pot.rotation.z = Math.PI / 2 - 0.15;
        pot.position.set(px, 0.12, pz);
      } else {
        pot.position.set(px, 0.11, pz);
      }
      pot.castShadow = true;
      this.scene.add(pot);
    }
  }

  // ---- planting -----------------------------------------------------------

  _rebuildPlants() {
    if (this._plantMesh) {
      this.scene.remove(this._plantMesh);
      this._plantMesh.geometry.dispose();
    }
    const rng = mulberry32(20260719);
    const arrays = { position: [], normal: [], color: [] };
    this.records = [];
    const m = new THREE.Matrix4();
    let idx = 0;

    const plant = (x, z, kind, baseY) => {
      const seed = Math.floor(rng() * 0xffffffff);
      const id = `g${idx++}`;
      const rec = { id, seed, kind, pos: new THREE.Vector3(x, 0, z) };
      this.records.push(rec);
      if (this.picked.has(id)) return;
      const f = buildStem(rec);
      const y = baseY - (f.sink || 0);
      rec.headPos = f.headPos.clone().add(new THREE.Vector3(x, y, z));
      m.makeTranslation(x, y, z);
      f.geometry.applyMatrix4(m);
      this._append(arrays, f.geometry);
      f.geometry.dispose();
    };

    // each bed grows mostly one thing, in rows that have loosened
    const crops = ['carrot', 'ramp', 'artichoke', 'carrot', 'artichoke', 'ramp'];
    this.beds.forEach((bed, bi) => {
      const crop = crops[bi % crops.length];
      const spacing = crop === 'artichoke' ? 0.85 : 0.42;
      const rows = crop === 'artichoke' ? 2 : 3;
      for (let r = 0; r < rows; r++) {
        const rz = bed.z - bed.d / 2 + (r + 0.5) * (bed.d / rows);
        for (let cx = -bed.w / 2; cx < bed.w / 2; cx += spacing) {
          if (rng() < 0.16) continue; // gaps — something got eaten, or never came up
          const jit = 0.05 + rng() * 0.1;
          const kind = rng() < 0.92 ? crop : crops[Math.floor(rng() * crops.length)];
          plant(bed.x + cx + (rng() - 0.5) * jit * 2, rz + (rng() - 0.5) * jit * 2,
            kind, BED_TOP);
        }
      }
      // escapees at the bed's feet
      const nEsc = 1 + Math.floor(rng() * 3);
      for (let e = 0; e < nEsc; e++) {
        plant(bed.x + (rng() - 0.5) * (bed.w + 1.6),
          bed.z + (bed.d / 2 + 0.3 + rng() * 0.5) * (rng() < 0.5 ? 1 : -1),
          crop, 0);
      }
    });

    // weeds along the walls — a garden is a negotiation, not a victory
    const weedKinds = ['daisy', 'spray', 'daisy', 'bells'];
    for (let i = 0; i < 14; i++) {
      const side = Math.floor(rng() * 4);
      const x = side < 2 ? (side === 0 ? -W + 0.4 + rng() * 1.2 : W - 0.4 - rng() * 1.2)
        : -W + 1 + rng() * (W * 2 - 2);
      const z = side < 2 ? -D + 1 + rng() * (D * 2 - 2)
        : (side === 2 ? -D + 0.4 + rng() * 1.0 : D - 0.4 - rng() * 1.0);
      plant(x, z, weedKinds[Math.floor(rng() * weedKinds.length)], 0);
    }

    // and plain grass, everywhere the beds are not
    {
      const blade = new THREE.PlaneGeometry(0.025, 0.2, 1, 2);
      blade.translate(0, 0.1, 0);
      const bp = blade.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const f = Math.max(0, bp.getY(i) / 0.2);
        bp.setX(i, bp.getX(i) * (1 - f * 0.8));
        bp.setZ(i, f * f * 0.06);
      }
      blade.computeVertexNormals();
      const tc = new THREE.Color();
      const bm = new THREE.Matrix4();
      const sm = new THREE.Matrix4();
      const inBed = (x, z) => this.beds.some((b) =>
        Math.abs(x - b.x) < b.w / 2 + 0.4 && Math.abs(z - b.z) < b.d / 2 + 0.4);
      for (let i = 0; i < 420; i++) {
        const x = -W + 0.6 + rng() * (W * 2 - 1.2);
        const z = -D + 0.6 + rng() * (D * 2 - 1.2);
        if (inBed(x, z) || Math.abs(x) < 0.9) continue; // not in beds, not on the path
        tc.setHSL(0.24 + rng() * 0.05, 0.34, 0.2 + rng() * 0.1);
        const sc = 0.6 + rng() * 0.9;
        for (let k = 0; k < 2; k++) {
          bm.makeRotationY(rng() * Math.PI * 2);
          bm.setPosition(x + (rng() - 0.5) * 0.06, 0, z + (rng() - 0.5) * 0.06);
          sm.makeScale(sc, sc * (0.6 + rng() * 0.8), sc);
          bm.multiply(sm);
          const src = blade;
          const p2 = src.attributes.position, n2 = src.attributes.normal;
          const v = new THREE.Vector3(), nv = new THREE.Vector3();
          const nm = new THREE.Matrix3().getNormalMatrix(bm);
          for (let j = 0; j < p2.count; j++) {
            v.fromBufferAttribute(p2, j).applyMatrix4(bm);
            arrays.position.push(v.x, v.y, v.z);
            nv.fromBufferAttribute(n2, j).applyMatrix3(nm).normalize();
            arrays.normal.push(nv.x, nv.y, nv.z);
            arrays.color.push(tc.r, tc.g, tc.b);
          }
        }
      }
      blade.dispose();
    }

    // whips climbing the north wall, gone entirely feral
    for (let i = 0; i < 5; i++) {
      const seed = Math.floor(rng() * 0xffffffff);
      const id = `g${idx++}`;
      const x = -W + 2 + i * (W * 2 - 4) / 4 + (rng() - 0.5);
      const rec = { id, seed, kind: 'whip', pos: new THREE.Vector3(x, 0, -D + 0.35) };
      this.records.push(rec);
      if (this.picked.has(id)) continue;
      const wg = buildWhip(seed);
      rec.headPos = new THREE.Vector3(x, wg.height * 0.7, -D + 0.35);
      m.makeTranslation(x, 0, -D + 0.35);
      wg.geometry.applyMatrix4(m);
      this._append(arrays, wg.geometry);
      wg.geometry.dispose();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 3));
    this._plantMesh = new THREE.Mesh(geo, this.plantMat);
    this._plantMesh.castShadow = true;
    this._plantMesh.receiveShadow = true;
    this._plantMesh.frustumCulled = false;
    this.scene.add(this._plantMesh);
  }

  _append(arrays, geo) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const p2 = src.attributes.position, n2 = src.attributes.normal, c2 = src.attributes.color;
    for (let i = 0; i < p2.count; i++) {
      arrays.position.push(p2.getX(i), p2.getY(i), p2.getZ(i));
      arrays.normal.push(n2.getX(i), n2.getY(i), n2.getZ(i));
      arrays.color.push(c2.getX(i), c2.getY(i), c2.getZ(i));
    }
    if (src !== geo) src.dispose();
  }

  // ---- small lives --------------------------------------------------------

  _buildButterflies() {
    this.butterflies = [];
    const wing = new THREE.PlaneGeometry(0.035, 0.05);
    wing.translate(0.018, 0, 0);
    for (let i = 0; i < 3; i++) {
      const col = i === 2 ? 0xd8a45a : 0xf0ead6;
      const mat = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide });
      const b = new THREE.Group();
      const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
      r.rotation.y = Math.PI;
      b.add(l); b.add(r);
      b.position.set((Math.random() - 0.5) * W, 0.9 + Math.random(), (Math.random() - 0.5) * D);
      this.scene.add(b);
      this.butterflies.push({ b, l, r, ph: Math.random() * 20, sp: 0.7 + Math.random() * 0.5 });
    }
  }

  // ---- living in it -------------------------------------------------------

  clampPos(pos) {
    pos.x = THREE.MathUtils.clamp(pos.x, -W + 0.5, W - 0.5);
    pos.z = THREE.MathUtils.clamp(pos.z, -D + 0.5, D - 0.5);
  }

  update(dt, elapsed, camera) {
    this._t += dt;
    // the morning holds still, but breathes a little
    const drift = 0.5 + 0.5 * Math.sin(elapsed * 0.013);
    this.hemi.intensity = 1.45 + drift * 0.15;
    this.sun.intensity = 1.05 + drift * 0.2;
    this.sky.uniforms.uTime.value = elapsed;
    this.sky.mesh.position.copy(camera.position);

    for (const f of this.butterflies) {
      const t = elapsed * f.sp + f.ph;
      f.b.position.set(
        Math.sin(t * 0.31) * (W - 2) * 0.5 + Math.sin(t * 0.83) * 1.2,
        1.0 + Math.sin(t * 0.47) * 0.45 + Math.sin(t * 1.7) * 0.1,
        Math.cos(t * 0.23) * (D - 2) * 0.6 + Math.cos(t * 0.71) * 1.0);
      f.b.rotation.y = Math.atan2(Math.cos(t * 0.31), -Math.sin(t * 0.23)) + Math.PI / 2;
      const flap = Math.sin(elapsed * 14 * f.sp) * 0.9;
      f.l.rotation.y = flap;
      f.r.rotation.y = Math.PI - flap;
    }

    // what is in reach: a plant, or the door home
    camera.getWorldDirection(this._dir);
    this.target = null;
    let best = 0.93;
    for (const rec of this.records) {
      if (this.picked.has(rec.id) || !rec.headPos) continue;
      const d = this._tmp.copy(rec.headPos).sub(camera.position);
      const dist = d.length();
      if (dist > 2.4) continue;
      const align = d.normalize().dot(this._dir);
      if (align > best) { best = align; this.target = rec; }
    }
    const toDoor = this._tmp.copy(this.doorPos).sub(camera.position);
    this.doorTarget = toDoor.length() < 3.2
      && toDoor.normalize().dot(this._dir) > 0.92;
    if (this.doorTarget) this.target = null;
  }

  pick() {
    const rec = this.target;
    if (!rec) return null;
    this.picked.add(rec.id);
    localStorage.setItem(STORE_KEY, JSON.stringify([...this.picked]));
    this._rebuildPlants();
    this.target = null;
    return { kind: rec.kind, seed: rec.seed, cut: 1 };
  }
}
