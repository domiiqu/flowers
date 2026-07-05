import * as THREE from '../lib/three.module.min.js';
import { buildStem, makePlantMaterial } from './flower.js';
import { samplePalette } from './sky.js';

const TABLE_Y = 1.02; // top of the cloth
const TARGET = new THREE.Vector3(0, 1.18, 0);

// ---- procedural surfaces — every material here is drawn, not downloaded
function canvasTex(size, draw, repX = 1, repY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  return t;
}

function linenTex(repX, repY) {
  return canvasTex(256, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const over = ((x >> 1) + (y >> 2)) % 2; // a simple over-under weave
        let v = 226 + over * 14 + (Math.random() - 0.5) * 16;
        if (Math.random() < 0.002) v -= 30; // a slub in the thread
        const i = (y * s + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, repX, repY);
}

function plasterTex() {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const g = 100 + Math.random() * 56;
      ctx.fillStyle = `rgba(${g},${g},${g},${0.04 + Math.random() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s,
        1 + Math.random() * 10, 1 + Math.random() * 10, Math.random() * 3, 0, 7);
      ctx.fill();
    }
  }, 5, 3);
}

function clayTex() {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, s, s);
    // faint throwing rings
    for (let y = 0; y < s; y += 3 + Math.random() * 5) {
      const g = 118 + Math.random() * 20;
      ctx.fillStyle = `rgba(${g},${g},${g},0.35)`;
      ctx.fillRect(0, y, s, 1 + Math.random() * 2);
    }
    for (let i = 0; i < 500; i++) {
      const g = 90 + Math.random() * 76;
      ctx.fillStyle = `rgba(${g},${g},${g},${0.1 + Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }, 3, 2);
}

function glazeTex() {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = 'rgb(92,92,92)';
    ctx.fillRect(0, 0, s, s);
    // drips of thicker glaze catch more light
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * s, w = 4 + Math.random() * 14;
      const g = 60 + Math.random() * 40;
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, `rgba(${g},${g},${g},0)`);
      grad.addColorStop(0.5, `rgba(${g},${g},${g},0.5)`);
      grad.addColorStop(1, `rgba(${g},${g},${g},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, w, s);
    }
  }, 2, 1);
}

// r/h profile pairs -> lathe. Everything in here is turned, like clay.
function lathe(profile, segments = 64) {
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
        bumpMap: clayTex(), bumpScale: 0.6, envMapIntensity: 0.45,
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
        color: 0xecebe2, roughness: 1.0, roughnessMap: glazeTex(),
        side: THREE.DoubleSide, envMapIntensity: 0.9,
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
        envMapIntensity: 0.8,
      }));
    },
    mouthR: 0.17, mouthY: 0.24, dip: 0.015, maxSplay: 1.35,
  },
];

const SHELF_POS = [
  new THREE.Vector3(-1.28, 1.62, -3.85),
  new THREE.Vector3(-0.98, 1.62, -3.85),
  new THREE.Vector3(-0.62, 1.62, -3.85),
];

export class Studio {
  constructor(uTime, hooks) {
    this.hooks = hooks; // { onReturnStem(entry), onMessage(text) }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa4ab97);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
    // the view walks a slow circle around the table
    this.orbit = { yaw: 0.06, pitch: 0.13, radius: 2.9 };

    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x67604f, 1.0);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff0dd, 1.4);
    this.key.position.set(2.4, 3.2, 1.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -3.2; this.key.shadow.camera.right = 3.2;
    this.key.shadow.camera.top = 5.5; this.key.shadow.camera.bottom = -0.5;
    this.key.shadow.bias = -0.002;
    this.key.shadow.radius = 5;
    this.scene.add(this.key);

    this.plantMat = makePlantMaterial(uTime, false, true);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.tableVase = null;   // index into VASES
    this.vaseMeshes = [];
    this.placed = [];        // { entry, group, mat, built }
    this.held = null;        // { entry, group, mat, mesh, built }
    this.anims = [];
    this._falling = [];
    this.discarding = false;
    this._t = 0;

    this._buildRoom();
    this._buildVases();

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.004, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xf2e9d4, transparent: true, opacity: 0.4 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  _buildRoom() {
    const wallMat = new THREE.MeshLambertMaterial({
      color: 0xa8b39a, bumpMap: plasterTex(), bumpScale: 4 });
    this._wallMat = wallMat;
    this._wallBase = new THREE.Color(0xa8b39a);
    const walls = [
      { pos: [0, 2.6, -4.25], rot: [0, 0, 0] },
      { pos: [0, 2.6, 4.6], rot: [0, Math.PI, 0] },
      { pos: [-4.0, 2.6, 0], rot: [0, Math.PI / 2, 0] },
      { pos: [4.0, 2.6, 0], rot: [0, -Math.PI / 2, 0] },
    ];
    for (const w of walls) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 10.5), wallMat);
      mesh.position.set(...w.pos);
      mesh.rotation.set(...w.rot);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    const ceilMat = new THREE.MeshLambertMaterial({ color: 0x8f9884 });
    this._ceilMat = ceilMat;
    this._ceilBase = new THREE.Color(0x8f9884);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 5.4;
    this.scene.add(ceiling);

    const floorMat = new THREE.MeshLambertMaterial({ color: 0x8b8274 });
    this._floorMat = floorMat;
    this._floorBase = new THREE.Color(0x8b8274);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), floorMat);
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
      leg.castShadow = true;
      this.scene.add(leg);
    }
    const clothLinen = linenTex(9, 6);
    const clothMat = new THREE.MeshStandardMaterial({
      color: 0xd9d2c0, side: THREE.DoubleSide, roughness: 1,
      map: clothLinen, bumpMap: clothLinen, bumpScale: 1.2, envMapIntensity: 0.3 });
    const clothTop = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.015, 1.08), clothMat);
    clothTop.position.set(0, TABLE_Y - 0.008, 0);
    clothTop.receiveShadow = true;
    clothTop.castShadow = true;
    this.scene.add(clothTop);
    // the skirt hangs on both long sides now that we can walk around
    for (const side of [1, -1]) {
      const skirt = new THREE.PlaneGeometry(1.78, 0.34, 24, 1);
      const pos = skirt.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < 0) pos.setZ(i, Math.sin(pos.getX(i) * 9.0 + side) * 0.03);
      }
      skirt.computeVertexNormals();
      const skirtMesh = new THREE.Mesh(skirt, clothMat);
      skirtMesh.position.set(0, TABLE_Y - 0.17, side * 0.54);
      if (side < 0) skirtMesh.rotation.y = Math.PI;
      this.scene.add(skirtMesh);
    }

    // shelf plank
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.035, 0.3), wood);
    plank.position.set(-0.95, 1.6, -3.9);
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

  // ---- the view ----------------------------------------------------------

  rotate(dx, dy) {
    this.orbit.yaw -= dx * 0.005;
    this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + dy * 0.004, 0.04, 0.85);
  }

  zoom(dy) {
    this.orbit.radius = THREE.MathUtils.clamp(this.orbit.radius + dy * 0.0022, 2.0, 5.2);
  }

  // ---- stems -------------------------------------------------------------

  holdStem(entry) {
    if (this.held || this.discarding) return false;
    const built = buildStem(entry, 2);
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

  _rebuildStem(s) {
    const built = buildStem(s.entry, 2);
    s.mesh.geometry.dispose();
    s.mesh.geometry = built.geometry;
    s.built = built;
  }

  wheel(dy) {
    if (!this.held) return;
    const e = this.held.entry;
    e.cut = THREE.MathUtils.clamp(e.cut - dy * 0.00055, 0.3, 1);
    this._rebuildStem(this.held);
    this._updateCutLabel();
  }

  _updateCutLabel() {
    const el = document.getElementById('cutlabel');
    if (!el) return;
    if (!this.held) { el.textContent = ''; return; }
    const cm = Math.round(this.held.built.height * 100);
    el.textContent = `${cm} cm — scroll to cut`;
  }

  // Called every so often as time passes; the stems in this room are
  // cut flowers, and they behave like it.
  refreshWilt(wiltOf) {
    if (this.held) {
      const w = wiltOf(this.held.entry);
      if (Math.abs(w - (this.held.entry.wilt || 0)) > 0.03) {
        this.held.entry.wilt = w;
        this._rebuildStem(this.held);
      }
    }
    for (const s of [...this.placed]) {
      const w = wiltOf(s.entry);
      if (w >= 1) {
        // dust
        this.placed.splice(this.placed.indexOf(s), 1);
        s.mat.transparent = true;
        s.vel = new THREE.Vector3(0, -0.1, 0);
        s.spin = (Math.random() - 0.5) * 0.4;
        s.life = 1;
        this._falling.push(s);
        this.hooks.onMessage('a stem has gone to dust');
      } else if (Math.abs(w - (s.entry.wilt || 0)) > 0.03) {
        s.entry.wilt = w;
        this._rebuildStem(s);
      }
    }
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
    const def = VASES[idx];
    this.ring.scale.setScalar(def.mouthR * 1.12);
    this.ring.position.set(0, TABLE_Y + def.mouthY + 0.004, 0);
  }

  // Where would the held stem stand, if you let it go right here?
  // The whole area around the vessel is the aiming surface: dead centre
  // is upright, further out leans further, in exactly that direction.
  _placementPose() {
    if (this.tableVase === null) return null;
    const { def, center, r } = this._mouth();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -center.y);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    const off = hit.sub(center);
    off.y = 0;
    const dist = off.length();
    if (dist > r * 3.4) return null; // out of range — just carrying it
    const rhat = dist > 1e-4
      ? off.clone().normalize()
      : new THREE.Vector3(0, 0, 1);
    const tilt = Math.min(1, dist / (r * 2.6)) * def.maxSplay;
    const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), rhat).normalize();
    const pos = center.clone().addScaledVector(rhat, Math.min(dist, r) * 0.6);
    pos.y = center.y - def.dip;
    const quat = new THREE.Quaternion().setFromAxisAngle(axis, tilt);
    return { pos, quat };
  }

  _tryPlace() {
    if (this.tableVase === null) {
      this.hooks.onMessage('choose a vessel from the shelf');
      return;
    }
    const pose = this._placementPose();
    if (!pose) return; // nowhere near — keep holding
    const s = this.held;
    this.held = null;
    s.group.position.copy(pose.pos);
    s.group.rotation.set(0, 0, 0);
    s.group.quaternion.copy(pose.quat);
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
      this._falling.push(s);
    }
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
    this._ceilMat.color.copy(this._ceilBase).multiplyScalar(day);
    this.scene.background = this._wallMat.color;

    // orbiting, breathing camera; stepping back lifts the gaze so a
    // tall arrangement is seen whole
    const o = this.orbit;
    const lift = Math.max(0, o.radius - 2.9) * 0.3;
    this.camera.position.set(
      TARGET.x + o.radius * Math.sin(o.yaw) * Math.cos(o.pitch) + Math.sin(this._t * 0.23) * 0.012,
      TARGET.y + lift * 0.7 + o.radius * Math.sin(o.pitch) + Math.sin(this._t * 0.31) * 0.008,
      TARGET.z + o.radius * Math.cos(o.yaw) * Math.cos(o.pitch));
    this.camera.lookAt(TARGET.x, TARGET.y + lift, TARGET.z);

    // the held stem previews its own placement; away from the vessel it
    // simply follows the hand
    if (this.held) {
      const pose = this.discarding ? null : this._placementPose();
      const k = 1 - Math.pow(0.002, dt);
      if (pose) {
        this.held.group.position.lerp(pose.pos, k);
        this.held.group.quaternion.slerp(pose.quat, k);
      } else {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TABLE_Y + 0.28));
        const hit = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(plane, hit)) {
          hit.x = THREE.MathUtils.clamp(hit.x, -1.6, 1.6);
          hit.z = THREE.MathUtils.clamp(hit.z, -1.3, 1.5);
          hit.y = TABLE_Y + 0.12;
          this.held.group.position.lerp(hit, k);
          this.held.group.quaternion.slerp(UPRIGHT_Q, k);
        }
      }
    }

    // the ring shows where the mouth is, only while you carry a stem
    this.ring.visible = !!this.held && this.tableVase !== null && !this.discarding;
    if (this.ring.visible) {
      this.ring.material.opacity = 0.28 + 0.16 * Math.sin(this._t * 2.4);
    }

    // vase travel
    this.anims = this.anims.filter((a) => a(dt));

    // whatever is falling, falls
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
    if (!alive && this._falling.length) this._falling = [];
    if (this.discarding && !alive) {
      this.discarding = false;
      if (this.tableVase !== null) {
        const mesh = this.vaseMeshes[this.tableVase];
        this.anims.push(animMove(mesh, SHELF_POS[this.tableVase], 0.72, 0.8));
        this.tableVase = null;
      }
    }
  }
}

const UPRIGHT_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.12);

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
