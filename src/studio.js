import * as THREE from '../lib/three.module.min.js';
import { buildStem, makePlantMaterial } from './flower.js';
import { samplePalette } from './sky.js';

const TABLE_Y = 1.02; // top of the cloth

// r/h profile pairs -> lathe. Everything in here is turned, like clay.
function lathe(profile, segments = 40) {
  const pts = profile.map(([r, h]) => new THREE.Vector2(r, h));
  return new THREE.LatheGeometry(pts, segments);
}

function lumpify(geo, amount, freq = 23) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const d = 1 + amount * (Math.sin(a * 5 + v.y * freq) * 0.6 + Math.sin(a * 9 - v.y * 13) * 0.4);
    pos.setX(i, v.x * d);
    pos.setZ(i, v.z * d);
  }
  geo.computeVertexNormals();
  return geo;
}

const VASES = [
  {
    name: 'bone amphora',
    make() {
      const g = lumpify(lathe([
        [0.001, 0.0], [0.055, 0.0], [0.12, 0.035], [0.175, 0.16], [0.155, 0.24],
        [0.085, 0.33], [0.072, 0.375], [0.086, 0.415],
      ]), 0.012);
      return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: 0xe6dcc4, roughness: 0.95, side: THREE.DoubleSide,
      }));
    },
    mouthR: 0.062, mouthY: 0.415, dip: 0.16, maxSplay: 1.0,
  },
  {
    name: 'white pitcher',
    make() {
      const g = lathe([
        [0.001, 0.0], [0.048, 0.0], [0.082, 0.025], [0.105, 0.11], [0.082, 0.21],
        [0.05, 0.30], [0.05, 0.35], [0.069, 0.405],
      ]);
      return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: 0xecebe2, roughness: 0.35, side: THREE.DoubleSide,
      }));
    },
    mouthR: 0.055, mouthY: 0.405, dip: 0.16, maxSplay: 0.85,
  },
  {
    name: 'footed dish',
    make() {
      const g = lathe([
        [0.001, 0.0], [0.075, 0.0], [0.075, 0.012], [0.024, 0.022], [0.02, 0.165],
        [0.05, 0.185], [0.185, 0.225], [0.222, 0.262],
      ]);
      return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: 0x9d9787, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide,
      }));
    },
    mouthR: 0.17, mouthY: 0.24, dip: 0.015, maxSplay: 1.35,
  },
];

const SHELF_POS = [
  new THREE.Vector3(-1.28, 1.62, -2.15),
  new THREE.Vector3(-0.98, 1.62, -2.15),
  new THREE.Vector3(-0.62, 1.62, -2.15),
];

export class Studio {
  constructor(uTime, hooks) {
    this.hooks = hooks; // { onReturnStem(entry), onMessage(text) }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa4ab97);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
    this.camera.position.set(0.14, 1.52, 2.85);
    this.camera.lookAt(0, 1.28, 0);
    this._camBase = this.camera.position.clone();

    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x67604f, 1.0);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff0dd, 1.4);
    this.key.position.set(2.4, 3.2, 1.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -2; this.key.shadow.camera.right = 2;
    this.key.shadow.camera.top = 3; this.key.shadow.camera.bottom = -1;
    this.key.shadow.bias = -0.002;
    this.scene.add(this.key);

    this.plantMat = makePlantMaterial(uTime, false);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.tableVase = null;   // index into VASES
    this.vaseMeshes = [];
    this.placed = [];        // { entry, group, mat }
    this.held = null;        // { entry, group, mat, built }
    this.anims = [];
    this.discarding = false;
    this._t = 0;

    this._buildRoom();
    this._buildVases();
  }

  _buildRoom() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xa8b39a });
    this._wallMat = wallMat;
    this._wallBase = new THREE.Color(0xa8b39a);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), wallMat);
    back.position.set(0, 3, -2.45);
    back.receiveShadow = true;
    this.scene.add(back);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), wallMat);
    side.rotation.y = Math.PI / 2;
    side.position.set(-2.6, 3, 0);
    this.scene.add(side);

    const floorMat = new THREE.MeshLambertMaterial({ color: 0x8b8274 });
    this._floorMat = floorMat;
    this._floorBase = new THREE.Color(0x8b8274);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // the table, and a cloth that hangs a little unevenly
    const wood = new THREE.MeshLambertMaterial({ color: 0x4c4038 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 1.0), wood);
    top.position.set(0, 0.97, 0);
    this.scene.add(top);
    for (const [lx, lz] of [[-0.76, -0.4], [0.76, -0.4], [-0.76, 0.4], [0.76, 0.4]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.95, 8), wood);
      leg.position.set(lx, 0.475, lz);
      this.scene.add(leg);
    }
    const clothMat = new THREE.MeshLambertMaterial({ color: 0xd9d2c0, side: THREE.DoubleSide });
    const clothTop = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.015, 1.08), clothMat);
    clothTop.position.set(0, TABLE_Y - 0.008, 0);
    clothTop.receiveShadow = true;
    this.scene.add(clothTop);
    const skirt = new THREE.PlaneGeometry(1.78, 0.34, 24, 1);
    { // hem drifts in and out; nothing hangs perfectly
      const pos = skirt.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < 0) pos.setZ(i, Math.sin(pos.getX(i) * 9.0) * 0.03);
      }
      skirt.computeVertexNormals();
    }
    const skirtMesh = new THREE.Mesh(skirt, clothMat);
    skirtMesh.position.set(0, TABLE_Y - 0.17, 0.54);
    this.scene.add(skirtMesh);

    // shelf plank
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.035, 0.3), wood);
    plank.position.set(-0.95, 1.6, -2.2);
    plank.castShadow = true;
    this.scene.add(plank);
  }

  _buildVases() {
    VASES.forEach((def, i) => {
      const mesh = def.make();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.scale.setScalar(0.72);
      mesh.position.copy(SHELF_POS[i]);
      mesh.userData.vaseIndex = i;
      this.scene.add(mesh);
      this.vaseMeshes.push(mesh);
    });
  }

  get holding() { return this.held !== null; }
  hasArrangement() { return this.placed.length > 0; }
  vaseOnTable() { return this.tableVase !== null; }

  _mouth() {
    const def = VASES[this.tableVase];
    return {
      def,
      center: new THREE.Vector3(0, TABLE_Y + def.mouthY, 0),
      r: def.mouthR,
    };
  }

  // ---- stems -------------------------------------------------------------

  holdStem(entry) {
    if (this.held || this.discarding) return false;
    const built = buildStem(entry);
    const mat = this.plantMat.clone();
    const mesh = new THREE.Mesh(built.geometry, mat);
    mesh.castShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    group.position.set(0.5, 1.25, 0.6);
    group.rotation.z = -0.15;
    this.scene.add(group);
    this.held = { entry, group, mat, mesh, built };
    this._updateCutLabel();
    return true;
  }

  returnHeld() {
    if (!this.held) return;
    const entry = this.held.entry;
    this._disposeStem(this.held);
    this.held = null;
    this._updateCutLabel();
    this.hooks.onReturnStem(entry);
  }

  _disposeStem(s) {
    this.scene.remove(s.group);
    s.mesh.geometry.dispose();
    s.mat.dispose();
  }

  wheel(dy) {
    if (!this.held) return;
    const e = this.held.entry;
    e.cut = THREE.MathUtils.clamp(e.cut - dy * 0.00055, 0.3, 1);
    const built = buildStem(e);
    this.held.mesh.geometry.dispose();
    this.held.mesh.geometry = built.geometry;
    this.held.built = built;
    this._updateCutLabel();
  }

  _updateCutLabel() {
    const el = document.getElementById('cutlabel');
    if (!el) return;
    if (!this.held) { el.textContent = ''; return; }
    const cm = Math.round(this.held.built.height * 100);
    el.textContent = `${cm} cm — scroll to cut`;
  }

  // ---- pointer -----------------------------------------------------------

  setPointer(ndc) { this.pointer.copy(ndc); }

  click(ndc) {
    if (this.discarding) return;
    this.raycaster.setFromCamera(ndc, this.camera);

    if (this.held) { this._tryPlace(); return; }

    // a placed stem? take it back into your hand
    const hitStem = this._stemUnderRay();
    if (hitStem) {
      this.placed.splice(this.placed.indexOf(hitStem), 1);
      this.scene.remove(hitStem.group);
      hitStem.group.position.set(0.5, 1.25, 0.6);
      hitStem.group.rotation.set(0, 0, -0.15);
      this.scene.add(hitStem.group);
      this.held = hitStem;
      this._updateCutLabel();
      return;
    }

    // a vase on the shelf?
    const hits = this.raycaster.intersectObjects(this.vaseMeshes);
    if (hits.length) {
      const idx = hits[0].object.userData.vaseIndex;
      if (idx === this.tableVase) return;
      if (this.hasArrangement()) {
        this.hooks.onMessage('let this arrangement go first');
        return;
      }
      this._chooseVase(idx);
    }
  }

  _stemUnderRay() {
    let best = null, bestD = 0.09;
    const p = new THREE.Vector3();
    for (const s of this.placed) {
      const head = s.built.headPos.clone().applyMatrix4(s.group.matrixWorld);
      this.raycaster.ray.closestPointToPoint(head, p);
      const d = p.distanceTo(head);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  _chooseVase(idx) {
    // send the previous one home
    if (this.tableVase !== null) {
      const old = this.vaseMeshes[this.tableVase];
      this.anims.push(animMove(old, SHELF_POS[this.tableVase], 0.72, 0.7));
    }
    this.tableVase = idx;
    const mesh = this.vaseMeshes[idx];
    this.anims.push(animMove(mesh, new THREE.Vector3(0, TABLE_Y, 0), 1.0, 0.8));
  }

  _tryPlace() {
    if (this.tableVase === null) {
      this.hooks.onMessage('choose a vessel from the shelf');
      return;
    }
    const { def, center, r } = this._mouth();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -center.y);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return;
    const off = hit.sub(center);
    off.y = 0;
    const dist = off.length();
    if (dist > r * 3.5) return; // nowhere near the mouth — keep holding
    if (dist > r) off.setLength(r);

    const s = this.held;
    this.held = null;
    const frac = off.length() / r;
    const tilt = frac * def.maxSplay * (0.85 + Math.random() * 0.3);
    const rhat = off.length() > 1e-4
      ? off.clone().normalize()
      : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), rhat).normalize();
    s.group.position.copy(center).addScaledVector(rhat, Math.min(dist, r * 0.6));
    s.group.position.y = center.y - def.dip;
    s.group.quaternion.setFromAxisAngle(axis, tilt);
    s.group.rotation.z += 0; // keep quaternion authoritative
    this.placed.push(s);
    this._updateCutLabel();
  }

  // ---- letting go ----------------------------------------------------------

  discard() {
    if (!this.hasArrangement() || this.discarding) return;
    this.discarding = true;
    for (const s of this.placed) {
      s.mat.transparent = true;
      s.vel = new THREE.Vector3((Math.random() - 0.5) * 0.5, -0.25, (Math.random() - 0.3) * 0.5);
      s.spin = (Math.random() - 0.5) * 1.6;
      s.life = 1;
    }
    this._falling = this.placed;
    this.placed = [];
  }

  update(dt, worldT) {
    this._t += dt;
    // the day leaks into the studio
    const p = samplePalette(worldT);
    const day = 0.35 + p.light * 0.65;
    this.hemi.intensity = 0.45 + p.light * 0.75;
    this.hemi.color.copy(p.horizon).lerp(new THREE.Color(0xfff4e0), 0.5);
    this.key.intensity = 0.5 + p.light * 1.1;
    this.key.color.copy(p.glow).lerp(new THREE.Color(0xfff0dd), 0.4);
    this._wallMat.color.copy(this._wallBase).multiplyScalar(day);
    this._floorMat.color.copy(this._floorBase).multiplyScalar(day);
    this.scene.background = this._wallMat.color;

    // breathing camera
    this.camera.position.x = this._camBase.x + Math.sin(this._t * 0.23) * 0.012;
    this.camera.position.y = this._camBase.y + Math.sin(this._t * 0.31) * 0.008;
    this.camera.lookAt(0, 1.28, 0);

    // held stem follows the pointer, a beat behind
    if (this.held) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TABLE_Y + 0.28));
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, hit)) {
        hit.x = THREE.MathUtils.clamp(hit.x, -1.3, 1.3);
        hit.z = THREE.MathUtils.clamp(hit.z, -0.9, 1.2);
        hit.y = TABLE_Y + 0.12;
        this.held.group.position.lerp(hit, 1 - Math.pow(0.002, dt));
      }
    }

    // vase travel
    this.anims = this.anims.filter((a) => a(dt));

    // the old arrangement, falling away
    if (this._falling) {
      let alive = false;
      for (const s of this._falling) {
        s.life -= dt / 1.3;
        if (s.life > 0) {
          alive = true;
          s.group.position.addScaledVector(s.vel, dt);
          s.group.rotation.z += s.spin * dt;
          s.mat.opacity = Math.max(0, s.life);
        } else if (!s.done) {
          s.done = true;
          this._disposeStem(s);
        }
      }
      if (!alive) {
        this._falling = null;
        this.discarding = false;
        if (this.tableVase !== null) {
          const mesh = this.vaseMeshes[this.tableVase];
          this.anims.push(animMove(mesh, SHELF_POS[this.tableVase], 0.72, 0.8));
          this.tableVase = null;
        }
      }
    }
  }
}

function animMove(obj, toPos, toScale, dur) {
  const fromPos = obj.position.clone();
  const fromScale = obj.scale.x;
  let t = 0;
  return (dt) => {
    t += dt / dur;
    const f = t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
    obj.position.lerpVectors(fromPos, toPos, f);
    // a small arc so it travels, not teleports
    obj.position.y += Math.sin(f * Math.PI) * 0.18;
    obj.scale.setScalar(fromScale + (toScale - fromScale) * f);
    return t < 1;
  };
}
