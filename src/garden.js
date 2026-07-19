import * as THREE from '../lib/three.module.min.js';
import { mulberry32, buildStem, buildWhip, makePlantMaterial, makeTransUniforms } from './flower.js';
import { SkyDome } from './sky.js';

// The garden. The field is forever dusk; this place is a held morning —
// lighter, sunnier, quieter. A low fence, not a wall: beyond it a bright
// meadow runs out in every direction, sun-dappled, unreachable. Inside,
// raised beds packed close with mixed plantings — rows gone loose, vines
// on trellises, edible flowers between the vegetables. The blue door in
// the fence goes back to the field.

const STORE_KEY = 'garden.picked.v1';
const W = 9, D = 7;           // half-extents of the fence
const BED_TOP = 0.18;

const MORNING = {
  zenith: new THREE.Color('#9fb5be'),
  horizon: new THREE.Color('#e9dcba'),
  glow: new THREE.Color('#f4e6b4'),
};

// per-crop planting habits: spacing along the row, and how many rows
const HABITS = {
  carrot: { sp: 0.15, rows: 3 },
  ramp: { sp: 0.2, rows: 3 },
  chive: { sp: 0.26, rows: 2 },
  nasturtium: { sp: 0.5, rows: 1 },
  chard: { sp: 0.42, rows: 2 },
  artichoke: { sp: 0.68, rows: 1 },
};
const CROPS = Object.keys(HABITS);

const POTS = [
  { x: -1.5, z: 5.9, plant: 'chive' },
  { x: 1.9, z: -6.1, tipped: true },
  { x: 7.6, z: 6.0, plant: 'nasturtium' },
  { x: -7.9, z: -5.8, plant: 'nasturtium' },
  { x: -7.5, z: 6.1, plant: 'chive' },
  { x: 2.4, z: 6.2 },
];

// The ground's own colour carries the sun patches — baked into the
// diffuse texture, so the scene's own lights shade them like grass, not
// a floating glow. An additive overlay here reads as a sheen skating
// across the surface; at a grazing angle that sheen is indistinguishable
// from still water. Real light and shadow never do that.
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7e8c5c';
  ctx.fillRect(0, 0, 256, 256);
  const rng = mulberry32(31);
  // a few big warm patches, as if sun fell through a gap in leaves
  for (let i = 0; i < 9; i++) {
    const x = rng() * 256, y = rng() * 256;
    const r = 46 + rng() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(214,204,132,${0.30 + rng() * 0.16})`);
    g.addColorStop(1, 'rgba(214,204,132,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * 3);
    ctx.scale(1, 0.55 + rng() * 0.4);
    ctx.translate(-x, -y);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  // a few darker patches too — shade has to exist for light to mean anything
  for (let i = 0; i < 6; i++) {
    const x = rng() * 256, y = rng() * 256;
    const r = 30 + rng() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(58,66,38,${0.16 + rng() * 0.12})`);
    g.addColorStop(1, 'rgba(58,66,38,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  }
  // fine grain, so nothing reads as a smooth flat fill up close
  for (let i = 0; i < 700; i++) {
    const g = 100 + Math.floor(rng() * 90);
    ctx.fillStyle = `rgba(${g},${g + 6},${g - 26},${0.05 + rng() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(rng() * 256, rng() * 256, 1 + rng() * 5, 1 + rng() * 5, rng() * 3, 0, 7);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(11, 9);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Garden {
  constructor(uTime) {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xdccf9e, 0.0055);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
    this.camera.position.set(0, 1.55, 5.2);
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
    this.sun.shadow.camera.left = -13; this.sun.shadow.camera.right = 13;
    this.sun.shadow.camera.top = 13; this.sun.shadow.camera.bottom = -13;
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
    this.zones = new Map();   // name -> { plants: [{x,z,kind,id,baseY}], mesh }
    this.target = null;
    this.doorTarget = false;
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._t = 0;
    this._built = false; // the heavy planting happens on first visit

    this._buildEnclosure();
    this._buildButterflies();
  }

  // ---- the place itself ---------------------------------------------------

  _buildEnclosure() {
    // one green ground running out to the fog, its own sun patches baked in
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTexture(), color: 0x8d9868 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 40), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.5, D * 2),
      new THREE.MeshLambertMaterial({ color: 0xc2b491 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.006, 0);
    path.receiveShadow = true;
    this.scene.add(path);

    // a low weathered fence — post and rail, nothing to keep the meadow out
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8a7a62 });
    const postGeo = new THREE.BoxGeometry(0.07, 0.95, 0.07);
    const fenceRun = (x1, z1, x2, z2) => {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz);
      const n = Math.max(1, Math.round(len / 1.45));
      for (let i = 0; i <= n; i++) {
        const post = new THREE.Mesh(postGeo, fenceMat);
        post.position.set(x1 + (dx * i) / n, 0.475, z1 + (dz * i) / n);
        post.castShadow = true;
        this.scene.add(post);
      }
      for (const ry of [0.42, 0.78]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.035), fenceMat);
        rail.position.set((x1 + x2) / 2, ry, (z1 + z2) / 2);
        rail.rotation.y = -Math.atan2(dz, dx);
        rail.castShadow = true;
        this.scene.add(rail);
      }
    };
    const gap = 0.75;
    fenceRun(-W, -D, W, -D);
    fenceRun(-W, -D, -W, D);
    fenceRun(W, -D, W, D);
    fenceRun(-W, D, -gap, D);
    fenceRun(gap, D, W, D);

    // the blue door, taller than the fence it stands in — a door is a
    // door, whatever it is asked to interrupt
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x7a6f58 });
    for (const dx of [-gap, gap]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.15, 0.2), frameMat);
      post.position.set(dx, 1.075, D);
      post.castShadow = true;
      this.scene.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(gap * 2 + 0.12, 0.14, 0.2), frameMat);
    lintel.position.set(0, 2.15, D);
    this.scene.add(lintel);
    this.door = new THREE.Mesh(new THREE.BoxGeometry(gap * 2 - 0.1, 2.0, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x647082, roughness: 0.85 }));
    this.door.position.set(0.05, 1.0, D - 0.02);
    this.door.rotation.y = 0.12; // ajar, always
    this.door.castShadow = true;
    this.scene.add(this.door);
    this.doorPos = new THREE.Vector3(0, 1.1, D);

    // raised beds, two ranks flanking the path
    this.beds = [];
    const bedMat = new THREE.MeshLambertMaterial({ color: 0x6b5a42 });
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x4a3b2c });
    for (const bx of [-4.6, 4.6]) {
      for (const bz of [-4.2, 0, 4.2]) {
        const bw = 5.6, bd = 1.9;
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
        this.beds.push({ x: bx, z: bz, w: bw - 0.4, d: bd - 0.4 });
      }
    }

    // trellises on the two middle beds — some things need to climb
    this.trellises = [1, 4];
    const latticeMat = new THREE.MeshLambertMaterial({ color: 0x7a6a52 });
    for (const bi of this.trellises) {
      const bed = this.beds[bi];
      const tz = bed.z - bed.d / 2 - 0.12;
      for (const px of [-bed.w / 2, bed.w / 2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.06), latticeMat);
        post.position.set(bed.x + px, 0.9, tz);
        post.castShadow = true;
        this.scene.add(post);
      }
      for (const ly of [0.55, 0.95, 1.35, 1.7]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(bed.w, 0.035, 0.03), latticeMat);
        bar.position.set(bed.x, ly, tz);
        bar.castShadow = true;
        this.scene.add(bar);
      }
      for (let sx = -bed.w / 2 + 0.5; sx < bed.w / 2; sx += 0.6) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.028, 1.35, 0.026), latticeMat);
        slat.position.set(bed.x + sx, 1.1, tz);
        this.scene.add(slat);
      }
    }

    // pots — a small crowd of them now, some with tenants
    const potMat = new THREE.MeshStandardMaterial({
      color: 0xa25c3b, roughness: 0.95, side: THREE.DoubleSide });
    for (const p of POTS) {
      const size = 0.1 + ((p.x * 13 + p.z * 7) % 5) * 0.012;
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 1.35, size, size * 2.1, 14, 1, true), potMat);
      if (p.tipped) {
        pot.rotation.z = Math.PI / 2 - 0.15;
        pot.position.set(p.x, size, p.z);
      } else {
        pot.position.set(p.x, size * 1.05, p.z);
        // packed earth in the planted ones
        const soil = new THREE.Mesh(new THREE.CircleGeometry(size * 1.28, 12),
          new THREE.MeshLambertMaterial({ color: 0x4a3b2c }));
        soil.rotation.x = -Math.PI / 2;
        soil.position.set(p.x, size * 1.95, p.z);
        this.scene.add(soil);
        p.rim = size * 1.95;
      }
      pot.castShadow = true;
      this.scene.add(pot);
    }

    // a bag of mulch, slumped against the nearest bed, half spilled
    const kraft = new THREE.MeshLambertMaterial({ color: 0xb89a6a });
    const bagMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.26), kraft);
    bagMesh.position.set(-2.6, 0.2, 4.9);
    bagMesh.rotation.set(0.12, 0.5, -0.18); // it has given up standing straight
    bagMesh.castShadow = true;
    this.scene.add(bagMesh);
    const mulchMat = new THREE.MeshLambertMaterial({ color: 0x3a2e22 });
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 7), mulchMat);
    mound.scale.set(1, 0.45, 1);
    mound.position.set(-2.58, 0.42, 4.87);
    this.scene.add(mound);
    const spill = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 7), mulchMat);
    spill.scale.set(1.3, 0.16, 1);
    spill.position.set(-2.3, 0.03, 5.15);
    spill.receiveShadow = true;
    this.scene.add(spill);
  }

  // ---- planting -----------------------------------------------------------

  // Decide, once and deterministically, everything that grows here.
  _layout() {
    const rng = mulberry32(20260720);
    let idx = 0;
    const zonePlants = new Map([['ground', []]]);
    const addPlant = (zone, x, z, kind, baseY) => {
      if (!zonePlants.has(zone)) zonePlants.set(zone, []);
      zonePlants.get(zone).push({ x, z, kind, baseY, id: `g${idx++}` });
    };

    this.beds.forEach((bed, bi) => {
      const zone = `bed${bi}`;
      // the bed is cut into sections, each with its own crop
      const nSec = 2 + Math.floor(rng() * 2);
      const pool = [...CROPS].sort(() => rng() - 0.5);
      let x0 = -bed.w / 2;
      for (let sIdx = 0; sIdx < nSec; sIdx++) {
        const secW = bed.w / nSec;
        const crop = pool[sIdx % pool.length];
        const habit = HABITS[crop];
        for (let r = 0; r < habit.rows; r++) {
          const rz = bed.z - bed.d / 2 + (r + 0.5) * (bed.d / habit.rows);
          for (let cx = x0 + habit.sp / 2; cx < x0 + secW; cx += habit.sp) {
            if (rng() < 0.1) continue; // a gap; something got there first
            const kind = rng() < 0.9 ? crop
              : CROPS[Math.floor(rng() * CROPS.length)];
            addPlant(zone, bed.x + cx + (rng() - 0.5) * 0.07,
              rz + (rng() - 0.5) * 0.09, kind, BED_TOP);
          }
        }
        x0 += secW;
      }
      // nasturtiums spill over the edges wherever they were planted
      for (let e = 0; e < 2 + Math.floor(rng() * 2); e++) {
        addPlant(zone, bed.x + (rng() - 0.5) * bed.w,
          bed.z + (bed.d / 2 + 0.25 + rng() * 0.3) * (rng() < 0.5 ? 1 : -1),
          rng() < 0.6 ? 'nasturtium' : 'chard', 0);
      }
      // and the trellised beds carry pea vines up their lattice
      if (this.trellises.includes(bi)) {
        const tz = bed.z - bed.d / 2 - 0.05;
        for (let vx = -bed.w / 2 + 0.3; vx < bed.w / 2; vx += 0.42 + rng() * 0.2) {
          addPlant(zone, bed.x + vx, tz + (rng() - 0.5) * 0.06, 'peavine', BED_TOP);
        }
      }
    });

    // the potted tenants
    for (const p of POTS) {
      if (p.plant && p.rim) addPlant('ground', p.x, p.z, p.plant, p.rim);
    }
    // weeds along the fence line
    const weedKinds = ['daisy', 'spray', 'bells', 'nasturtium'];
    for (let i = 0; i < 12; i++) {
      const side = Math.floor(rng() * 4);
      const x = side < 2 ? (side === 0 ? -W + 0.4 + rng() : W - 0.4 - rng())
        : -W + 1 + rng() * (W * 2 - 2);
      const z = side < 2 ? -D + 1 + rng() * (D * 2 - 2)
        : (side === 2 ? -D + 0.35 + rng() * 0.8 : D - 0.35 - rng() * 0.8);
      addPlant('ground', x, z, weedKinds[Math.floor(rng() * weedKinds.length)], 0);
    }
    // whips gone feral along the north fence
    for (let i = 0; i < 4; i++) {
      addPlant('ground', -W + 2 + i * (W * 2 - 4) / 3 + (rng() - 0.5), -D + 0.3, 'whip', 0);
    }

    // register records
    for (const [zone, plants] of zonePlants) {
      this.zones.set(zone, { plants, mesh: null });
      for (const pl of plants) {
        this.records.push({
          id: pl.id, seed: 0, kind: pl.kind, zone,
          pos: new THREE.Vector3(pl.x, 0, pl.z), headPos: null,
        });
      }
    }
    // seeds come from position so they survive any relayout
    for (const rec of this.records) {
      rec.seed = (Math.abs(Math.imul(Math.round(rec.pos.x * 97), 2654435761)
        ^ Math.imul(Math.round(rec.pos.z * 131), 1274126177)) >>> 0);
    }

    for (const zone of this.zones.keys()) this._rebuildZone(zone);
    this._buildMeadow(rng);
  }

  _rebuildZone(zone) {
    const z = this.zones.get(zone);
    if (!z) return;
    if (z.mesh) {
      this.scene.remove(z.mesh);
      z.mesh.geometry.dispose();
    }
    const arrays = { position: [], normal: [], color: [] };
    const m = new THREE.Matrix4();
    for (const pl of z.plants) {
      const rec = this.records.find((r) => r.id === pl.id);
      if (!rec || this.picked.has(pl.id)) continue;
      const kind = pl.kind === 'whip' ? null : null;
      const f = pl.kind === 'whip'
        ? buildWhip(rec.seed)
        : buildStem(rec);
      const y = pl.baseY - (f.sink || 0);
      rec.headPos = (f.headPos || new THREE.Vector3(0, f.height * 0.7, 0))
        .clone().add(new THREE.Vector3(pl.x, y, pl.z));
      m.makeTranslation(pl.x, y, pl.z);
      f.geometry.applyMatrix4(m);
      this._append(arrays, f.geometry);
      f.geometry.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 3));
    z.mesh = new THREE.Mesh(geo, this.plantMat);
    z.mesh.castShadow = true;
    z.mesh.receiveShadow = true;
    z.mesh.frustumCulled = false;
    this.scene.add(z.mesh);
  }

  // The meadow beyond the fence: unreachable, unpickable, generous. It
  // hugs the fence in a dense ring — that's the band the fog actually
  // lets you see — and thins out fast beyond it.
  _buildMeadow(rng) {
    const arrays = { position: [], normal: [], color: [] };
    const m = new THREE.Matrix4();
    const inside = (x, z) => Math.abs(x) < W + 0.6 && Math.abs(z) < D + 0.6;

    // pick a point just outside the fence: a side, a spot along it, and
    // a push outward biased toward "close" so the band reads dense
    const ringPoint = () => {
      const side = Math.floor(rng() * 4);
      const push = 0.4 + Math.pow(rng(), 2.2) * 34;
      if (side < 2) {
        const z = -D + rng() * D * 2;
        const x = (side === 0 ? -W : W) + (side === 0 ? -push : push);
        return [x, z];
      }
      const x = -W + rng() * W * 2;
      const z = (side === 2 ? -D : D) + (side === 2 ? -push : push);
      return [x, z];
    };

    const kinds = ['daisy', 'daisy', 'spray', 'poppy', 'plume', 'plume', 'umbel', 'tulip', 'bells'];
    for (let i = 0; i < 340; i++) {
      const [x, z] = ringPoint();
      if (inside(x, z)) continue;
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const f = buildStem({ kind, seed: Math.floor(rng() * 0xffffffff), cut: 1 });
      m.makeTranslation(x, 0, z);
      f.geometry.applyMatrix4(m);
      this._append(arrays, f.geometry);
      f.geometry.dispose();
    }

    // grass, in here and out there
    const blade = new THREE.PlaneGeometry(0.025, 0.22, 1, 2);
    blade.translate(0, 0.11, 0);
    const bp = blade.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const f = Math.max(0, bp.getY(i) / 0.22);
      bp.setX(i, bp.getX(i) * (1 - f * 0.8));
      bp.setZ(i, f * f * 0.06);
    }
    blade.computeVertexNormals();
    const tc = new THREE.Color();
    const bm = new THREE.Matrix4(), sm = new THREE.Matrix4();
    const inBed = (x, z) => this.beds.some((b) =>
      Math.abs(x - b.x) < b.w / 2 + 0.4 && Math.abs(z - b.z) < b.d / 2 + 0.4);
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    for (let i = 0; i < 1100; i++) {
      const far = i > 380;
      const x = far ? (rng() - 0.5) * 100 : -W + 0.5 + rng() * (W * 2 - 1);
      const z = far ? (rng() - 0.5) * 100 : -D + 0.5 + rng() * (D * 2 - 1);
      if (far && inside(x, z)) continue;
      if (!far && (inBed(x, z) || Math.abs(x) < 0.85)) continue;
      tc.setHSL(0.2 + rng() * 0.07, 0.36, 0.24 + rng() * 0.14);
      const sc = 0.6 + rng() * 1.0;
      for (let k = 0; k < 2; k++) {
        bm.makeRotationY(rng() * Math.PI * 2);
        bm.setPosition(x + (rng() - 0.5) * 0.06, 0, z + (rng() - 0.5) * 0.06);
        sm.makeScale(sc, sc * (0.6 + rng() * 0.9), sc);
        bm.multiply(sm);
        nm.getNormalMatrix(bm);
        const p2 = blade.attributes.position, n2 = blade.attributes.normal;
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

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 3));
    const mesh = new THREE.Mesh(geo, this.plantMat);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
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
    for (let i = 0; i < 4; i++) {
      const col = i === 2 ? 0xd8a45a : i === 3 ? 0xc8ccdb : 0xf0ead6;
      const mat = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide });
      const b = new THREE.Group();
      const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
      r.rotation.y = Math.PI;
      b.add(l); b.add(r);
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
    if (!this._built) { // the garden plants itself the first time you arrive
      this._built = true;
      this._layout();
    }
    this._t += dt;
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
    this._rebuildZone(rec.zone);
    this.target = null;
    return { kind: rec.kind, seed: rec.seed, cut: 1 };
  }
}
