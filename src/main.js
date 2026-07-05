import * as THREE from '../lib/three.module.min.js';
import { Field } from './field.js';
import { Studio } from './studio.js';

const CYCLE = 780; // seconds of real time for one pass of the sky

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

const uTime = { value: 0 };

// ---------------------------------------------------------------- ui bits
const $ = (id) => document.getElementById(id);
const veil = $('veil'), msgEl = $('msg'), bagEl = $('bag');
const reticle = $('reticle'), retLabel = $('retlabel');
const hintField = $('hint-field'), hintStudio = $('hint-studio');

let msgTimer = null;
function say(text, ms = 2600) {
  msgEl.textContent = text;
  msgEl.classList.add('show');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => msgEl.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- the bag
const BAG_MAX = 12;
const bag = [];
function renderBag() {
  bagEl.innerHTML = '';
  bag.forEach((entry, i) => {
    const d = document.createElement('button');
    d.className = 'stem ' + entry.kind;
    d.title = entry.kind;
    d.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (mode !== 'studio') return;
      if (studio.holding) { say('your hands are full'); return; }
      const [e] = bag.splice(i, 1);
      studio.holdStem(e);
      renderBag();
    });
    bagEl.appendChild(d);
  });
  bagEl.classList.toggle('empty', bag.length === 0);
}

// ---------------------------------------------------------------- scenes
const field = new Field(uTime);
const fieldCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 800);
fieldCam.position.set(11, 1.55, 11);
fieldCam.rotation.order = 'YXZ';

const studio = new Studio(uTime, {
  onReturnStem(entry) { bag.push(entry); renderBag(); },
  onMessage(t) { say(t); },
});

let mode = 'field';
let switching = false;

function setMode(next) {
  if (switching || next === mode) return;
  switching = true;
  veil.classList.add('on');
  setTimeout(() => {
    mode = next;
    document.body.dataset.mode = mode;
    if (mode === 'studio') {
      document.exitPointerLock?.();
    }
    onResize();
    veil.classList.remove('on');
    setTimeout(() => { switching = false; }, 500);
  }, 480);
}

// ---------------------------------------------------------------- walking
const keys = new Set();
let yaw = -2.35, pitch = 0, bobPhase = 0;
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); setMode(mode === 'field' ? 'studio' : 'field'); return; }
  if (e.code === 'KeyP') { photograph(); return; }
  if (e.code === 'KeyM') { audio.muted = !audio.muted; say(audio.muted ? 'quiet' : 'wind', 1200); return; }
  if (e.code === 'BracketLeft') { timeOffset -= 0.02; return; }
  if (e.code === 'BracketRight') { timeOffset += 0.02; return; }
  if (e.code === 'KeyE' && mode === 'field') { tryPick(); return; }
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

document.addEventListener('mousemove', (e) => {
  if (mode === 'field' && document.pointerLockElement === renderer.domElement) {
    yaw -= e.movementX * 0.0021;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0021, -1.2, 1.2);
  }
  if (mode === 'studio') {
    pointerNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    studio.setPointer(pointerNdc);
  }
});

const pointerNdc = new THREE.Vector2();

renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  audio.ensure();
  if (started === false) { begin(); return; }
  if (mode === 'field') {
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
      return;
    }
    tryPick();
  } else {
    pointerNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    studio.click(pointerNdc);
    renderBag();
  }
});

renderer.domElement.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (mode === 'studio' && studio.holding) { studio.returnHeld(); }
});

addEventListener('wheel', (e) => {
  if (mode === 'studio' && studio.holding) { e.preventDefault(); studio.wheel(e.deltaY); }
}, { passive: false });

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  hintField.classList.toggle('dim', locked);
});

function tryPick() {
  if (!field.target) return;
  if (bag.length >= BAG_MAX) { say('the bag is full'); return; }
  const entry = field.pick();
  if (entry) {
    bag.push(entry);
    renderBag();
    audio.pluck();
  }
}

function movePlayer(dt) {
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const str = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const speed = 2.15;
  const moving = fwd !== 0 || str !== 0;
  if (moving) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    fieldCam.position.x += (-sy * fwd + cy * str) * speed * dt;
    fieldCam.position.z += (-cy * fwd - sy * str) * speed * dt;
    bobPhase += dt * 5.6;
  }
  fieldCam.position.y = 1.55 + Math.sin(bobPhase) * (moving ? 0.026 : 0.004);
  fieldCam.rotation.set(pitch, yaw, 0);
}

// ---------------------------------------------------------------- let go
const letgo = $('letgo');
let holdT = 0, holdRAF = null;
function holdStep() {
  holdT += 1 / 60;
  letgo.style.setProperty('--p', Math.min(1, holdT / 1.4));
  if (holdT >= 1.4) {
    stopHold();
    studio.discard();
    say('gone', 1800);
  } else holdRAF = requestAnimationFrame(holdStep);
}
function stopHold() {
  cancelAnimationFrame(holdRAF);
  holdT = 0;
  letgo.style.setProperty('--p', 0);
}
letgo.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  if (!studio.hasArrangement()) { say('there is nothing to let go of'); return; }
  holdStep();
});
addEventListener('mouseup', stopHold);

// ---------------------------------------------------------------- photo
$('photo').addEventListener('mousedown', (e) => { e.stopPropagation(); });
$('photo').addEventListener('click', (e) => { e.stopPropagation(); photograph(); });

let photoN = 1;
function photograph() {
  const cam = mode === 'field' ? fieldCam : studio.camera;
  const scene = mode === 'field' ? field.scene : studio.scene;
  renderer.render(scene, cam);
  const src = renderer.domElement;
  const border = Math.round(Math.min(src.width, src.height) * 0.045);
  const c = document.createElement('canvas');
  c.width = src.width + border * 2;
  c.height = src.height + border * 2;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe9db';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, border, border);
  // vignette
  const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35,
    c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72);
  g.addColorStop(0, 'rgba(20,16,14,0)');
  g.addColorStop(1, 'rgba(20,16,14,0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(border, border, src.width, src.height);
  // grain
  const n = document.createElement('canvas');
  n.width = n.height = 140;
  const nctx = n.getContext('2d');
  const img = nctx.createImageData(140, 140);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 26;
  }
  nctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(border, border, src.width, src.height);
  ctx.clip();
  const pat = ctx.createPattern(n, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();

  const flash = $('flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');
  const a = document.createElement('a');
  a.download = `${mode === 'field' ? 'field' : 'still-life'}-${String(photoN++).padStart(2, '0')}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}

// ---------------------------------------------------------------- sound
const audio = {
  ctx: null, gain: null, muted: false,
  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      const len = this.ctx.sampleRate * 4;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995;
        d[i] = last * 3.5;
      }
      const srcN = this.ctx.createBufferSource();
      srcN.buffer = buf; srcN.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420; filt.Q.value = 0.4;
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.05;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 0.028;
      lfo.connect(lfoG).connect(this.gain.gain);
      srcN.connect(filt).connect(this.gain).connect(this.ctx.destination);
      srcN.start(); lfo.start();
    } catch { /* silence is acceptable */ }
  },
  pluck() {
    if (!this.ctx || this.muted) return;
    const notes = [392, 440, 523, 587, 659];
    const f = notes[Math.floor(Math.random() * notes.length)];
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.9);
    o.connect(g).connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + 1);
  },
  get mutedState() { return this.muted; },
};
Object.defineProperty(audio, 'muted', {
  get() { return this._m || false; },
  set(v) { this._m = v; if (this.gain) this.gain.gain.value = v ? 0 : 0.05; },
});

// ---------------------------------------------------------------- begin
let started = false;
function begin() {
  started = true;
  $('title').classList.add('away');
  document.body.dataset.mode = 'field';
  renderer.domElement.requestPointerLock();
}
$('title').addEventListener('mousedown', () => { audio.ensure(); begin(); });

// ---------------------------------------------------------------- loop
let timeOffset = 0.015;
const clock = new THREE.Clock();
function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  fieldCam.aspect = innerWidth / innerHeight;
  fieldCam.updateProjectionMatrix();
  studio.camera.aspect = innerWidth / innerHeight;
  studio.camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);
onResize();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  uTime.value = clock.elapsedTime;
  const worldT = timeOffset + clock.elapsedTime / CYCLE;

  if (mode === 'field') {
    if (started) movePlayer(dt);
    field.update(worldT, fieldCam);
    reticle.classList.toggle('near', !!field.target);
    retLabel.textContent = field.target ? 'pick' : '';
    renderer.render(field.scene, fieldCam);
  } else {
    studio.update(dt, worldT);
    renderer.render(studio.scene, studio.camera);
  }
});
renderBag();

// a small back door, for tests and for the curious
window.__game = {
  setMode, field, studio, bag, fieldCam, renderBag, begin,
  scrub: (t) => { timeOffset = t - clock.elapsedTime / CYCLE; },
  look: (y, p) => { yaw = y; pitch = p; },
};
