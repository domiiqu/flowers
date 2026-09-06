// print.js — the plate renderer, grown originally in tending/study/ as a
// style lab and now the app's own engine (study/print.js re-exports this
// file so the lab keeps exercising the same code the app runs).
//
// Look: flat gouache fills at opacity 1.0 everywhere — depth is carried by
// value, warmth and a single uniform ink contour line, never by
// transparency. Every ink line is drawn twice: a faint rust misregistration
// ghost, then crisp on top. A per-print grain filter (neutral-biased,
// overlay-blended) sits over the paper only. Habit *identity* (species,
// petals, lean) comes from a hash of the habit's name, not a seed — a
// renamed habit simply regrows its plant.

export function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashName(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

let uidc = 0;
const uid = (tag) => `${tag}${(uidc++).toString(36)}`;

// ------------------------------------------------------------- palette

const INK = '#26221c';
const INK_GHOST = '#8a5a42';
const PAPER = '#f0ead6';
const MOUNTS = ['#b9c4a6', '#cfd4e4', '#d9d4c8', '#c5d2c0', '#adb8d0'];

const SKY_STOPS = [
  { t: 0, c: '#e8e4d4' },    // dawn
  { t: 0.25, c: '#cfe0e8' }, // duck-egg
  { t: 0.5, c: '#3a6bc4' },  // cobalt
  { t: 0.75, c: '#e0b98a' }, // apricot
  { t: 1, c: '#2b3050' },    // indigo
];

const SUN = '#f2e7c8';
const MOON = '#e8e0c8';
const CLOUD = '#f4f1e2';
const PATH_COLOR = '#e3d7b8';
const ROCK_DARK = '#a84428';
const ROCK_LIGHT = '#c15f33';
const FOG = '#e6e3d8';
const SHADOW = '#4a4238';
const MONOLITH = '#efe9d8';
const MOUNTAIN = '#b7c4d6';
const SNOW = '#f4f1e2';
const SEA = '#a3cdc4';
const TOWER = '#f2efe4';
const SNAKE_COLOR = '#8a7a42';
const TREE_CYPRESS = '#3f5233';
const TREE_ROUND = '#6f8f52';
const FLORA = ['#e8e2d2', '#c98d84', '#a35b32', '#eee6cf', '#d9b36a', '#8d86a8'];
const FLORA_STEM = '#5f6b45';
const OAK_TRUNK = '#6b5a3f';
const OAK_LEAVES = ['#6f8f52', '#5a7a42', '#84a35f', '#4f6b3a'];

// four aridity keyframes: green field -> sparse scrub -> cracked earth ->
// pale dunes, each a far/mid/near three-tone ramp (cooler+paler far,
// warmer+darker near — depth, not just terrain type)
const ARIDITY_STOPS = [
  { a: 0, ramp: ['#a8c092', '#7d9c6a', '#5a6b3a'] },
  { a: 0.34, ramp: ['#c3c19a', '#a8a476', '#867d4e'] },
  { a: 0.67, ramp: ['#ddd3b8', '#d0c4a0', '#c7a877'] },
  { a: 1, ramp: ['#ece3c8', '#e6dcc0', '#d8c9a0'] },
];

function hex2rgb(hx) {
  const n = parseInt(hx.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(a, b, t) {
  const [ar, ag, ab] = hex2rgb(a), [br, bg, bb] = hex2rgb(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(ar, br)},${m(ag, bg)},${m(ab, bb)})`;
}
function skyColor(t) {
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
    if (t >= a.t && t <= b.t) return lerpColor(a.c, b.c, (t - a.t) / (b.t - a.t));
  }
  return SKY_STOPS[SKY_STOPS.length - 1].c;
}
function lightScore(hour) {
  if (hour == null) return 0.5;
  return Math.max(0, Math.min(1, (hour - 5) / 17));
}
function terrainRamp(aridity) {
  const a = Math.max(0, Math.min(1, aridity ?? 0));
  for (let i = 0; i < ARIDITY_STOPS.length - 1; i++) {
    const s0 = ARIDITY_STOPS[i], s1 = ARIDITY_STOPS[i + 1];
    if (a >= s0.a && a <= s1.a) {
      const t = (a - s0.a) / (s1.a - s0.a);
      return [0, 1, 2].map((k) => lerpColor(s0.ramp[k], s1.ramp[k], t));
    }
  }
  return ARIDITY_STOPS[ARIDITY_STOPS.length - 1].ramp;
}

// -------------------------------------------------------------- flora

function petalPath(cx, cy, angle, len, w) {
  const tipX = cx + Math.sin(angle) * len, tipY = cy - Math.cos(angle) * len;
  const lx = cx + Math.sin(angle - 0.55) * w, ly = cy - Math.cos(angle - 0.55) * w;
  const rx = cx + Math.sin(angle + 0.55) * w, ry = cy - Math.cos(angle + 0.55) * w;
  return `M${cx.toFixed(1)},${cy.toFixed(1)} Q${lx.toFixed(1)},${ly.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} `
    + `Q${rx.toFixed(1)},${ry.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)} Z`;
}

// one stylized ground flower — a rare, small accent now (the oak is the
// centerpiece); a habit's identity is a hash of its NAME, not the day's
// seed, so renaming a habit regrows its plant but a stable name always
// grows the same one. `layoutRng` (the day's own seeded stream) only ever
// decides *where* it stands, never *what* it is.
function drawFlora(name, addInk, cx, baseY, size, depth = 0.5) {
  const nrng = mulberry(hashName(name));
  const color = FLORA[Math.floor(nrng() * FLORA.length)];
  const lean = (nrng() - 0.5) * 0.7;
  const stemH = size * (1.8 + nrng() * 0.5);
  const topX = cx + Math.sin(lean) * stemH * 0.7;
  const topY = baseY - Math.cos(lean) * stemH;
  const midX = cx + Math.sin(lean) * stemH * 0.32;
  const midY = baseY - Math.cos(lean) * stemH * 0.5;
  const sw = 0.9 + depth * 0.7;

  // a thick tapered stem — a filled quad, not a hairline
  const stemW = size * (0.09 + depth * 0.03);
  const perpA = lean + Math.PI / 2;
  const baseHalf = Math.sin(perpA), baseHalfY = -Math.cos(perpA);
  const bl = { x: cx - baseHalf * stemW, y: baseY - baseHalfY * stemW };
  const br = { x: cx + baseHalf * stemW, y: baseY + baseHalfY * stemW };
  const stemD = `M${bl.x.toFixed(1)},${bl.y.toFixed(1)} Q${midX.toFixed(1)},${midY.toFixed(1)} ${topX.toFixed(1)},${topY.toFixed(1)} `
    + `Q${midX.toFixed(1)},${midY.toFixed(1)} ${br.x.toFixed(1)},${br.y.toFixed(1)} Z`;
  let fill = `<path d="${stemD}" fill="${FLORA_STEM}"/>`;
  addInk('path', { d: stemD }, sw);

  // two leaves off the stem
  for (let i = 0; i < 2; i++) {
    const t = 0.4 + i * 0.28;
    const lx = cx + (midX - cx) * t + (topX - midX) * Math.max(0, t - 0.5) * 2;
    const ly = baseY + (midY - baseY) * t + (topY - midY) * Math.max(0, t - 0.5) * 2;
    const side = i % 2 === 0 ? 1 : -1;
    const la = lean + side * 1.1;
    const d = petalPath(lx, ly, la, size * 0.32, size * 0.11);
    fill += `<path d="${d}" fill="${FLORA_STEM}"/>`;
    addInk('path', { d }, Math.max(0.6, sw * 0.7));
  }

  // a fuller petalled head, with a visible center disc
  const petals = 5 + Math.floor(nrng() * 4);
  const baseAngle = nrng() * Math.PI * 2;
  for (let i = 0; i < petals; i++) {
    const a = baseAngle + (i / petals) * Math.PI * 2 + (nrng() - 0.5) * 0.4;
    const len = size * (0.3 + nrng() * 0.14);
    const w = size * (0.19 + nrng() * 0.06);
    const d = petalPath(topX, topY, a, len, w);
    fill += `<path d="${d}" fill="${color}"/>`;
    addInk('path', { d }, Math.max(0.6, sw * 0.75));
  }
  const discR = size * 0.19;
  fill += `<circle cx="${topX.toFixed(1)}" cy="${topY.toFixed(1)}" r="${discR.toFixed(1)}" fill="#d9b36a"/>`;
  addInk('circle', { cx: topX, cy: topY, r: discR }, sw * 0.8);
  return fill;
}

// ---------------------------------------------------------------- the oak

// a leaf-cluster keyed by a habit's name, not chance — the same habit
// always grows the same clump wherever it lands on the crown.
function leafCluster(name, addInk, cx, cy, size) {
  const nrng = mulberry(hashName('leaf:' + name));
  const color = OAK_LEAVES[Math.floor(nrng() * OAK_LEAVES.length)];
  const count = 4 + Math.floor(nrng() * 3);
  let fill = '';
  for (let i = 0; i < count; i++) {
    const a = nrng() * Math.PI * 2;
    const len = size * (0.42 + nrng() * 0.3);
    const w = size * (0.24 + nrng() * 0.08);
    const d = petalPath(cx, cy, a, len, w);
    fill += `<path d="${d}" fill="${color}"/>`;
    addInk('path', { d }, 0.7);
  }
  return fill;
}

// the oak — the plate's centerpiece, off the path. habits done drive leaf
// mass and how far the branches reach; 0 done is a bare armature. wind
// (fog ≥ 4 or aridity ≥ 0.7) bends the whole crown leeward and loosens a
// few leaves into the air; high aridity thins the leaves toward bare
// regardless of how many habits are done — a drought doesn't care.
function drawOak(rng, addInk, cx, baseY, scale, doneHabits, windy, aridity) {
  let fill = '';
  const lean = windy ? (rng() < 0.5 ? -0.3 : 0.3) : (rng() - 0.5) * 0.08;
  const trunkH = scale * (1.15 + Math.min(1, doneHabits.length / 5) * 0.35);
  const topX = cx + Math.sin(lean) * trunkH * 0.4;
  const topY = baseY - Math.cos(lean) * trunkH;
  const midX = cx + Math.sin(lean) * trunkH * 0.18, midY = baseY - trunkH * 0.55;
  const trunkW = scale * 0.1;
  const trunkD = `M${(cx - trunkW).toFixed(1)},${baseY.toFixed(1)} Q${(midX - trunkW * 0.6).toFixed(1)},${midY.toFixed(1)} `
    + `${(topX - trunkW * 0.35).toFixed(1)},${topY.toFixed(1)} L${(topX + trunkW * 0.35).toFixed(1)},${topY.toFixed(1)} `
    + `Q${(midX + trunkW * 0.6).toFixed(1)},${midY.toFixed(1)} ${(cx + trunkW).toFixed(1)},${baseY.toFixed(1)} Z`;
  fill += `<path d="${trunkD}" fill="${OAK_TRUNK}"/>`;
  addInk('path', { d: trunkD }, 1.2);

  // a fixed armature of branch slots — filled with leaf-clusters for as
  // many habits as are done today, the rest staying bare wood
  const slots = Math.max(3, Math.min(6, doneHabits.length || 3));
  const bareFactor = Math.max(0, 1 - Math.max(0, (aridity - 0.6) / 0.4)); // drought thins leaves toward 0
  for (let i = 0; i < slots; i++) {
    const frac = slots === 1 ? 0.5 : i / (slots - 1);
    const angle = lean + (frac - 0.5) * 2.3;
    const blen = scale * (0.5 + rng() * 0.3) * (0.85 + Math.min(1, doneHabits.length / 5) * 0.3);
    const bx = topX + Math.sin(angle) * blen;
    const by = topY - Math.abs(Math.cos(angle)) * blen * 0.55 - blen * 0.25;
    addInk('line', { x1: topX, y1: topY, x2: bx, y2: by, fill: 'none' }, 1.0);
    if (i < doneHabits.length && bareFactor > 0.08) {
      fill += leafCluster(doneHabits[i].name, addInk, bx, by, scale * 0.34 * bareFactor);
    }
  }

  if (windy) {
    // a few leaves loosened into the air, drifting leeward
    const driftN = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < driftN; i++) {
      const dx = topX + Math.sin(lean) * scale * (0.9 + rng() * 0.7);
      const dy = topY - scale * 0.15 + rng() * scale * 0.5;
      const d = petalPath(dx, dy, lean, scale * 0.13, scale * 0.06);
      addInk('path', { d, fill: 'none' }, 0.6);
    }
  }
  return fill;
}

// ------------------------------------------------------- clouds (weather)

// her rule, verbatim: a cloud's position comes from its habit's own name,
// not chance — the sky is legible if you know the words.
function cloudPosition(name, ix, iw, skyTop, skyH) {
  const s = String(name || '');
  const sum = [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
  const xRaw = (s.length * 7 + sum) % 997;
  const words = Math.max(1, s.trim().split(/\s+/).length);
  const yRaw = (words * 13 + sum) % 61;
  return {
    x: ix + (xRaw / 997) * iw * 0.86 + iw * 0.05,
    y: skyTop + skyH * (0.14 + (yRaw / 61) * 0.42),
  };
}
function stepCloud(cx, cy, cw) {
  const ch = cw * 0.3;
  return `M${(cx - cw / 2).toFixed(1)},${(cy + ch / 2).toFixed(1)} `
    + `h${(cw * 0.16).toFixed(1)} v${(-ch * 0.35).toFixed(1)} h${(cw * 0.18).toFixed(1)} v${(-ch * 0.3).toFixed(1)} `
    + `h${(cw * 0.32).toFixed(1)} v${(ch * 0.3).toFixed(1)} h${(cw * 0.18).toFixed(1)} v${(ch * 0.35).toFixed(1)} `
    + `h${(cw * 0.16).toFixed(1)} v${(ch * 0.4).toFixed(1)} h${(-cw).toFixed(1)} Z`;
}

// -------------------------------------------------------------- figure

// a proper Moebius silhouette: cloak, hood, one fold line — reads as a
// tiny lone walker at 10px, never a stick figure.
function figureMark(addInk, x, baseY, h) {
  const cloakTopY = baseY - h * 0.6, cloakW = h * 0.52;
  const bodyD = `M${(x - cloakW / 2).toFixed(1)},${baseY.toFixed(1)} L${(x - cloakW * 0.16).toFixed(1)},${cloakTopY.toFixed(1)} `
    + `L${(x + cloakW * 0.16).toFixed(1)},${cloakTopY.toFixed(1)} L${(x + cloakW / 2).toFixed(1)},${baseY.toFixed(1)} Z`;
  const headR = h * 0.17, headY = baseY - h * 0.78;
  const hatRx = headR * 1.7, hatRy = headR * 0.6, hatY = headY - headR * 0.35;
  let s = `<path d="${bodyD}" fill="${INK}"/>`;
  s += `<ellipse cx="${x.toFixed(1)}" cy="${hatY.toFixed(1)}" rx="${hatRx.toFixed(1)}" ry="${hatRy.toFixed(1)}" fill="${INK}"/>`;
  s += `<circle cx="${x.toFixed(1)}" cy="${headY.toFixed(1)}" r="${headR.toFixed(1)}" fill="${INK}"/>`;
  addInk('line', { x1: x, y1: cloakTopY, x2: x, y2: baseY, fill: 'none' }, Math.max(0.7, h * 0.045));
  return s;
}

// ------------------------------------------------------------ the path

// one wandering centerline, shared by every path/trace/footprint regime,
// so "how confident is she tracking" is a single continuous dial.
function pathGeometry(rng, ix, iw, horizonY, baseY2) {
  const vpX = ix + iw * (0.4 + rng() * 0.2);
  const baseW = iw * (0.2 + rng() * 0.08);
  const baseX = ix + iw * (0.32 + rng() * 0.36);
  const swing = iw * (0.1 + rng() * 0.1);
  const s1 = rng() < 0.5 ? -1 : 1;
  const centerAt = (t) => {
    const wander = Math.sin(t * Math.PI) * swing * s1 * (1 - t * 0.4)
      + Math.sin(t * Math.PI * 2) * swing * 0.45 * -s1 * (1 - t);
    return baseX + (vpX - baseX) * t + wander;
  };
  const halfWidthAt = (t) => (baseW * Math.pow(1 - t, 1.35) + 3) / 2;
  const yAt = (t) => baseY2 + (horizonY - baseY2) * t;
  return { vpX, baseX, baseW, centerAt, halfWidthAt, yAt };
}

/**
 * dayPrint(data, w, h) -> svg string
 * data: { seed, lightHour(0-24)|light(0-1), heldHour, moments, fog(0-5|null),
 *   aridity(0-1), range(0-1), path(0-1), sea(0-1), towerFloors(n),
 *   snake(bool), wires(n), twoSuns(bool),
 *   habits: [{ name, done }] }
 * `light` (0..1), when given, overrides the lightHour→score conversion —
 * world.js uses this for a mood-derived score; lightHour stays the direct
 * "follow the clock" input for a still-unrated today.
 */
export function dayPrint(data = {}, w = 300, h = 380) {
  const {
    seed = 1, lightHour = 13.5, light: lightOverride = null,
    heldHour = false, moments = 0, fog = null,
    aridity = 0, range = 0, path: pathVar = 0.6, sea = 0, towerFloors = 0,
    snake = false, wires = 0, twoSuns = false,
  } = data;
  let habits = data.habits;
  if (!Array.isArray(habits)) {
    const n = data.habitsDone ?? 0, total = data.habitsTotal ?? Math.max(n, 3);
    habits = Array.from({ length: total }, (_, i) => ({ name: `habit ${i + 1}`, done: i < n }));
  }
  const doneHabits = habits.filter((hb) => hb.done);
  const undoneHabits = habits.filter((hb) => !hb.done);

  const rng = mulberry(seed);
  let fills = '';
  // ink is painted *immediately*, interleaved with fills in document
  // order — not collected and flushed as one final top layer. That
  // matters: a later opaque fill (fog, at high severity) must be able to
  // occlude an earlier element's ink outline too (a mountain "swallowed"
  // by fog loses its line, not just its color), and SVG only gives you
  // that if ink actually sits where it was drawn, not painted last.
  const slipSeed = Math.min(w, h) * 0.008;
  const slip = Math.max(1, slipSeed);
  const addInk = (el, attrs, sw = 1.3) => {
    const a = { ...attrs };
    const fillAttr = a.fill; delete a.fill;
    const attrStr = Object.entries(a).map(([k, v]) => `${k}="${typeof v === 'number' ? v.toFixed(2) : v}"`).join(' ');
    const shape = `<${el} ${attrStr} fill="${fillAttr || 'none'}" stroke-width="${sw}"/>`;
    fills += `<g transform="translate(${slip},${(slip * 0.9).toFixed(2)})" fill="none" stroke="${INK_GHOST}" `
      + `stroke-opacity="0.45" stroke-linecap="round" stroke-linejoin="round">${shape}</g>`;
    fills += `<g fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">${shape}</g>`;
  };

  // 1. mount
  const mount = MOUNTS[Math.floor(rng() * MOUNTS.length)];
  fills += `<rect x="0" y="0" width="${w}" height="${h}" fill="${mount}"/>`;

  // 2. paper + inset picture window (a visible cream matting border)
  const margin = Math.min(w, h) * 0.075;
  const px = margin, py = margin * 0.85, pBottom = margin * 1.7;
  const pw = w - 2 * margin, ph = h - py - pBottom;
  fills += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${PAPER}"/>`;
  addInk('rect', { x: px, y: py, width: pw, height: ph }, 1.5);
  const win = Math.min(pw, ph) * 0.06;
  const ix = px + win, iy = py + win, iw = pw - 2 * win, ih = ph - 2 * win;
  addInk('rect', { x: ix, y: iy, width: iw, height: ih }, 1.0);
  // everything from here on is "the scene" — clipped to the picture
  // window, since wide elements (a broad mountain range, a full-bleed fog
  // bank) would otherwise spill into the cream margin
  const sceneStart = fills.length;

  // 3. sky
  const t = lightOverride != null ? Math.max(0, Math.min(1, lightOverride)) : lightScore(lightHour);
  const isNight = t > 0.82;
  const skyH = ih * 0.62;
  const skyTop = iy, horizonY = iy + skyH;
  const groundH = ih - skyH;
  const baseY2 = iy + ih;
  const windy = (fog != null && fog >= 4) || aridity >= 0.7;
  fills += `<rect x="${ix.toFixed(1)}" y="${skyTop.toFixed(1)}" width="${iw.toFixed(1)}" height="${skyH.toFixed(1)}" fill="${skyColor(t)}"/>`;

  const bodyR = Math.min(iw, ih) * 0.042;
  const bodyX = ix + iw * (0.2 + rng() * 0.6);
  const bodyY = skyTop + skyH * (0.18 + rng() * 0.14);
  fills += `<circle cx="${bodyX.toFixed(1)}" cy="${bodyY.toFixed(1)}" r="${bodyR.toFixed(1)}" fill="${isNight ? MOON : SUN}"/>`;
  addInk('circle', { cx: bodyX, cy: bodyY, r: bodyR }, 1.0);
  if (twoSuns) {
    const r2 = bodyR * 0.65;
    const x2 = ix + iw * (bodyX - ix > iw / 2 ? 0.18 : 0.72) + (rng() - 0.5) * iw * 0.08;
    const y2 = skyTop + skyH * (0.5 + rng() * 0.14);
    fills += `<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${r2.toFixed(1)}" fill="${isNight ? MOON : SUN}"/>`;
    addInk('circle', { cx: x2, cy: y2, r: r2 }, 1.0);
  }

  // clouds = undone habits — position from the habit's own name, not luck
  for (const hb of undoneHabits) {
    const { x: ccx, y: ccy } = cloudPosition(hb.name, ix, iw, skyTop, skyH);
    const cw = iw * (0.13 + (hashName(hb.name) % 100) / 100 * 0.07);
    const d = stepCloud(ccx, ccy, cw);
    fills += `<path d="${d}" fill="${CLOUD}"/>`;
    addInk('path', { d }, 1.0);
  }

  // distant mountain range — log-scaled with `range`, pale and cool
  if (range > 0.02) {
    const count = Math.max(1, Math.min(6, Math.round(1 + Math.log2(1 + range * 15))));
    const heightScale = ih * (0.05 + 0.2 * (Math.log2(1 + range * 8) / Math.log2(9)));
    for (let i = 0; i < count; i++) {
      const cx = ix + iw * ((i + 0.5) / count) + (rng() - 0.5) * (iw / count) * 0.5;
      const peakH = heightScale * (0.6 + rng() * 0.6);
      const halfW = (iw / count) * (0.55 + rng() * 0.2);
      const baseY = horizonY + groundH * 0.06;
      const peakY = baseY - peakH;
      const d = `M${(cx - halfW).toFixed(1)},${baseY.toFixed(1)} L${cx.toFixed(1)},${peakY.toFixed(1)} L${(cx + halfW).toFixed(1)},${baseY.toFixed(1)} Z`;
      fills += `<path d="${d}" fill="${MOUNTAIN}"/>`;
      addInk('path', { d }, 1.0);
      const snowY = peakY + peakH * 0.32;
      const snowD = `M${cx.toFixed(1)},${peakY.toFixed(1)} L${(cx - halfW * 0.32).toFixed(1)},${snowY.toFixed(1)} L${(cx + halfW * 0.32).toFixed(1)},${snowY.toFixed(1)} Z`;
      fills += `<path d="${snowD}" fill="${SNOW}"/>`;
      addInk('path', { d: snowD }, 0.8);
    }
  }

  // the retro-futurist tower — visible from the road, near the vanishing
  // point; the archive, a floor per ~10 written notes
  const preGeo = pathGeometry(rng, ix, iw, horizonY, baseY2);
  if (towerFloors > 0) {
    const floors = Math.min(14, towerFloors);
    const twX = preGeo.vpX + iw * 0.06;
    const twH = ih * (0.09 + Math.min(1, floors / 14) * 0.16);
    const twW = iw * 0.028;
    const baseY = horizonY + groundH * 0.05;
    const topY = baseY - twH;
    fills += `<rect x="${(twX - twW / 2).toFixed(1)}" y="${topY.toFixed(1)}" width="${twW.toFixed(1)}" height="${twH.toFixed(1)}" fill="${TOWER}"/>`;
    addInk('rect', { x: twX - twW / 2, y: topY, width: twW, height: twH }, 0.9);
    fills += `<ellipse cx="${twX.toFixed(1)}" cy="${topY.toFixed(1)}" rx="${(twW * 0.7).toFixed(1)}" ry="${(twW * 0.35).toFixed(1)}" fill="${TOWER}"/>`;
    addInk('ellipse', { cx: twX, cy: topY, rx: twW * 0.7, ry: twW * 0.35 }, 0.8);
    for (let f = 0; f < floors; f++) {
      const fy = topY + twH * ((f + 0.6) / floors);
      addInk('line', { x1: twX - twW / 2, y1: fy, x2: twX + twW / 2, y2: fy, fill: 'none' }, 0.6);
      if (f % 2 === 0) addInk('circle', { cx: twX, cy: fy - twH / floors * 0.25, r: twW * 0.1 }, 0.5);
    }
  }

  // telephone poles + sagging wires along the horizon
  const wireY = [];
  if (wires > 0) {
    const n = Math.min(8, wires);
    const poleH = ih * 0.055;
    const xs = [];
    for (let i = 0; i < n; i++) {
      const x = ix + iw * ((i + 0.5) / n);
      if (towerFloors > 0 && Math.abs(x - preGeo.vpX) < iw * 0.08) continue;
      xs.push(x);
      const baseY = horizonY + groundH * 0.04;
      const topY = baseY - poleH;
      addInk('line', { x1: x, y1: baseY, x2: x, y2: topY, fill: 'none' }, 1.0);
      addInk('line', { x1: x - poleH * 0.22, y1: topY + poleH * 0.12, x2: x + poleH * 0.22, y2: topY + poleH * 0.12, fill: 'none' }, 0.8);
      wireY.push({ x, y: topY + poleH * 0.12 });
    }
    for (let i = 0; i < wireY.length - 1; i++) {
      const a = wireY[i], b = wireY[i + 1];
      const midX = (a.x + b.x) / 2, sag = poleH * 0.32;
      const d = `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${midX.toFixed(1)},${(a.y + sag).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
      addInk('path', { d, fill: 'none' }, 0.6);
    }
  }

  // 4. ground — one plane, continuous with aridity (fed no longer flips
  // terrain directly; it feeds aridity upstream)
  const ramp = terrainRamp(aridity);
  const bandSplits = [0, 0.22, 0.52, 1];
  for (let i = 0; i < 3; i++) {
    const y0 = horizonY + groundH * bandSplits[i];
    const y1 = horizonY + groundH * bandSplits[i + 1];
    fills += `<rect x="${ix.toFixed(1)}" y="${y0.toFixed(1)}" width="${iw.toFixed(1)}" height="${(y1 - y0).toFixed(1)}" fill="${ramp[i]}"/>`;
  }
  addInk('line', { x1: ix, y1: horizonY, x2: ix + iw, y2: horizonY }, 1.4);

  if (aridity > 0.55) {
    const cracks = 1 + Math.floor((aridity - 0.55) * 6);
    for (let i = 0; i < cracks; i++) {
      const sx = ix + iw * (0.15 + rng() * 0.7), sy = horizonY + groundH * (0.35 + rng() * 0.5);
      const d = `M${sx.toFixed(1)},${sy.toFixed(1)} l${((rng() - 0.5) * iw * 0.08).toFixed(1)},${(groundH * 0.12).toFixed(1)} `
        + `l${((rng() - 0.5) * iw * 0.06).toFixed(1)},${(groundH * 0.1).toFixed(1)}`;
      addInk('path', { d }, 0.8);
    }
  }
  if (aridity > 0.18 && aridity < 0.8) {
    const tufts = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < tufts; i++) {
      const sx = ix + iw * (0.1 + rng() * 0.8), sy = horizonY + groundH * (0.2 + rng() * 0.6);
      const sz = Math.min(iw, ih) * 0.015;
      for (let k = 0; k < 3; k++) {
        const a = (k - 1) * 0.5;
        addInk('line', { x1: sx, y1: sy, x2: sx + Math.sin(a) * sz, y2: sy - Math.cos(a) * sz, fill: 'none' }, 0.7);
      }
    }
  }

  if (rng() < 0.35) {
    const side = rng() < 0.5 ? 0 : 1;
    const rw = iw * (0.16 + rng() * 0.09), rh = groundH * (0.4 + rng() * 0.28);
    const rx = side === 0 ? ix + iw * 0.03 : ix + iw - rw - iw * 0.03;
    const ry = iy + ih - rh;
    const outline = `M${rx.toFixed(1)},${(iy + ih).toFixed(1)} L${(rx + rw * 0.15).toFixed(1)},${(ry + rh * 0.2).toFixed(1)} `
      + `L${(rx + rw * 0.5).toFixed(1)},${ry.toFixed(1)} L${(rx + rw * 0.85).toFixed(1)},${(ry + rh * 0.25).toFixed(1)} `
      + `L${(rx + rw).toFixed(1)},${(iy + ih).toFixed(1)} Z`;
    fills += `<path d="${outline}" fill="${ROCK_DARK}"/>`;
    const lit = `M${(rx + rw * 0.5).toFixed(1)},${ry.toFixed(1)} L${(rx + rw * 0.85).toFixed(1)},${(ry + rh * 0.25).toFixed(1)} `
      + `L${(rx + rw).toFixed(1)},${(iy + ih).toFixed(1)} L${(rx + rw * 0.55).toFixed(1)},${(iy + ih).toFixed(1)} Z`;
    fills += `<path d="${lit}" fill="${ROCK_LIGHT}"/>`;
    addInk('path', { d: outline }, 1.1);
  }
  // small foreground/midground pebbles
  const pebbles = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < pebbles; i++) {
    const depth = 0.15 + rng() * 0.6;
    const pcx = ix + iw * (0.06 + rng() * 0.88), pcy = horizonY + groundH * depth;
    const pr = Math.min(iw, ih) * (0.008 + depth * 0.012);
    fills += `<ellipse cx="${pcx.toFixed(1)}" cy="${pcy.toFixed(1)}" rx="${(pr * 1.3).toFixed(1)}" ry="${pr.toFixed(1)}" fill="#8a8270"/>`;
    addInk('ellipse', { cx: pcx, cy: pcy, rx: pr * 1.3, ry: pr }, 0.7);
  }

  // the shoreline — arrives at the horizon after a tracking streak,
  // claims more ground as `sea` grows, but never reads as a second sky:
  // capped well short of the whole ground plane, in two flat depth bands,
  // with an irregular (never ruler-straight) foam edge and a few waves.
  let seaH = 0;
  if (sea > 0.02) {
    seaH = groundH * (0.08 + 0.32 * sea); // caps near 40% of the ground
    const farH = seaH * 0.42;
    fills += `<rect x="${ix.toFixed(1)}" y="${horizonY.toFixed(1)}" width="${iw.toFixed(1)}" height="${farH.toFixed(1)}" fill="${SEA}"/>`;
    fills += `<rect x="${ix.toFixed(1)}" y="${(horizonY + farH).toFixed(1)}" width="${iw.toFixed(1)}" height="${(seaH - farH).toFixed(1)}" fill="${lerpColor(SEA, '#5f9c93', 0.4)}"/>`;

    // 2-3 short wave dashes in the sea body, ink only
    const waves = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < waves; i++) {
      const wy = horizonY + seaH * (0.25 + rng() * 0.6);
      const wx = ix + iw * (0.1 + rng() * 0.7), wl = iw * (0.05 + rng() * 0.06);
      addInk('line', { x1: wx, y1: wy, x2: wx + wl, y2: wy, fill: 'none' }, 0.7);
    }

    // the foam line — a smooth, gently irregular curve, never straight
    const foamY = horizonY + seaH;
    const segN = 6, segW = iw / segN;
    const pts = [[ix, foamY + (rng() - 0.5) * groundH * 0.025]];
    for (let i = 1; i <= segN; i++) {
      pts.push([ix + i * segW, foamY + (rng() - 0.5) * groundH * 0.035]);
    }
    let foamD = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} `;
    for (let i = 1; i < pts.length; i++) {
      const [px0, py0] = pts[i - 1], [px1, py1] = pts[i];
      const mx = (px0 + px1) / 2, my = (py0 + py1) / 2;
      foamD += `Q${px0.toFixed(1)},${py0.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)} `;
    }
    const [lastX, lastY] = pts[pts.length - 1];
    foamD += `T${lastX.toFixed(1)},${lastY.toFixed(1)}`;
    addInk('path', { d: foamD, fill: 'none' }, 1.0);
  }

  // the path / trace / footprints — one geometry, three confidences
  const geo = preGeo;
  const SEGS = 16;
  if (pathVar > 0.6) {
    const wScale = 0.55 + 0.45 * Math.min(1, (pathVar - 0.6) / 0.4);
    const leftPts = [], rightPts = [];
    for (let i = 0; i <= SEGS; i++) {
      const tt = i / SEGS, cx = geo.centerAt(tt), half = geo.halfWidthAt(tt) * wScale, y = geo.yAt(tt);
      leftPts.push(`${(cx - half).toFixed(1)},${y.toFixed(1)}`);
      rightPts.push(`${(cx + half).toFixed(1)},${y.toFixed(1)}`);
    }
    const d = 'M' + leftPts.concat(rightPts.reverse()).join(' L') + ' Z';
    fills += `<path d="${d}" fill="${PATH_COLOR}"/>`;
    addInk('path', { d }, 1.1);
  } else if (pathVar > 0.25) {
    const dashes = 7;
    for (let i = 0; i < dashes; i++) {
      const t0 = i / dashes, t1 = t0 + (0.5 / dashes);
      const y0 = geo.yAt(t0), y1 = geo.yAt(t1);
      const half0 = geo.halfWidthAt(t0) * 0.4, half1 = geo.halfWidthAt(t1) * 0.4;
      const c0 = geo.centerAt(t0), c1 = geo.centerAt(t1);
      const d = `M${(c0 - half0).toFixed(1)},${y0.toFixed(1)} L${(c1 - half1).toFixed(1)},${y1.toFixed(1)} `
        + `L${(c1 + half1).toFixed(1)},${y1.toFixed(1)} L${(c0 + half0).toFixed(1)},${y0.toFixed(1)} Z`;
      const traceColor = lerpColor(PATH_COLOR, ramp[1], 0.4);
      fills += `<path d="${d}" fill="${traceColor}"/>`;
      addInk('path', { d }, 0.8);
    }
  } else if (pathVar > 0.03) {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const tt = 0.08 + (i / steps) * 0.7;
      const y = geo.yAt(tt), cx = geo.centerAt(tt);
      const side = i % 2 === 0 ? -1 : 1;
      const fx = cx + side * geo.halfWidthAt(tt) * 0.5;
      const fr = Math.min(iw, ih) * 0.006;
      fills += `<ellipse cx="${fx.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(fr * 0.7).toFixed(1)}" ry="${fr.toFixed(1)}" fill="${INK}"/>`;
    }
  }

  // the snake — novelty has a body; crosses the path or the sand
  if (snake) {
    const tt = 0.14 + rng() * 0.16;
    const cx = geo.centerAt(tt), cy = geo.yAt(tt);
    const len = iw * 0.09, amp = iw * 0.018;
    const d = `M${(cx - len).toFixed(1)},${cy.toFixed(1)} `
      + `Q${(cx - len * 0.3).toFixed(1)},${(cy - amp).toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)} `
      + `Q${(cx + len * 0.3).toFixed(1)},${(cy + amp).toFixed(1)} ${(cx + len).toFixed(1)},${cy.toFixed(1)}`;
    addInk('path', { d, fill: 'none' }, 2.2);
    fills += `<path d="${d}" fill="none" stroke="${SNAKE_COLOR}" stroke-width="1.6" stroke-linecap="round"/>`;
  }

  // 5. fog — 1-3 solid pale banks hugging the ground, stepped top edges,
  // ink only on the top; at 4-5 they stack and swallow the horizon
  if (fog != null && fog > 0) {
    const n = fog < 2 ? 1 : fog < 4 ? 2 : 3;
    for (let b = 0; b < n; b++) {
      const severity = fog / 5;
      const bankFrac = (b + 1) / n;
      let topBase = horizonY + groundH * (0.62 - 0.55 * severity * bankFrac);
      if (fog >= 4 && b === n - 1) topBase -= ih * 0.11 * (fog - 3);
      const steps = 5, stepW = iw / steps;
      let topD = '';
      let prevY = null;
      for (let i = 0; i <= steps; i++) {
        const jitter = (rng() - 0.5) * groundH * 0.09;
        const x = ix + i * stepW, y = topBase + jitter;
        if (i === 0) { topD = `M${x.toFixed(1)},${y.toFixed(1)} `; }
        else { topD += `L${x.toFixed(1)},${prevY.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)} `; }
        prevY = y;
      }
      const bottomY = iy + ih;
      const closedD = topD + `L${(ix + iw).toFixed(1)},${bottomY.toFixed(1)} L${ix.toFixed(1)},${bottomY.toFixed(1)} Z`;
      fills += `<path d="${closedD}" fill="${FOG}"/>`;
      addInk('path', { d: topD, fill: 'none' }, 1.1);
    }
  }

  // land begins strictly below the mountain band and any shoreline — no
  // plant, and no figure, may stand on water or on the mountains
  const mountainMargin = 0.24; // mountains sit ≤6% of groundH; leave enough
  // clearance that even a short-statured horizon plant's stem-and-head
  // doesn't reach back up into the mountain band
  const seaMargin = sea > 0.02 ? seaH / groundH + 0.05 : 0;
  const minDepth = Math.min(0.85, Math.max(mountainMargin, seaMargin));

  // 6. the oak — the centerpiece, midground, off the path (opposite side
  // from wherever the path's foreground anchor sits, so they never
  // collide); habits done shape its leaf mass and reach
  const oakSide = preGeo.baseX > ix + iw / 2 ? 0.16 : 0.84;
  const oakDepth = Math.min(0.68, Math.max(minDepth + 0.08, 0.4));
  const oakX = ix + iw * oakSide;
  const oakY = horizonY + groundH * oakDepth;
  const oakScale = Math.min(iw, ih) * 0.3;
  // note: capture the return value in its own statement, then append it —
  // `fills += drawOak(...)` would read the pre-call value of `fills` before
  // evaluating the call, silently discarding every addInk() the call makes
  // internally (they mutate `fills` via closure, but that write gets
  // clobbered by the outer assignment's stale left-hand read).
  const oakFill = drawOak(rng, addInk, oakX, oakY, oakScale, doneHabits, windy, aridity);
  fills += oakFill;

  // flora demoted: at most 1-2 small ground-mark flowers, only on strong
  // days, never near water or the mountains (same land-only floor)
  if (doneHabits.length >= 4) {
    const flowerCount = rng() < 0.5 ? 1 : 2;
    const span = 1 - minDepth;
    const maxSize = Math.min(iw, ih) * 0.06;
    for (let i = 0; i < flowerCount; i++) {
      const hb = doneHabits[Math.floor(rng() * doneHabits.length)];
      const depth = minDepth + span * (0.5 + rng() * 0.45);
      const fx = ix + iw * (0.15 + rng() * 0.7);
      const fy = horizonY + groundH * depth;
      const depthNorm = (depth - minDepth) / span;
      const size = maxSize * (0.6 + 0.4 * depthNorm);
      const floraFill = drawFlora(hb.name + i, addInk, fx, fy, size, depth); // see note above drawOak's call
      fills += floraFill;
    }
  }

  // 7. the figure — mid-distance on the path (never on water or the
  // mountain band); a held hour earns a monolith + long shadow
  const figFrac = Math.max(minDepth + 0.04, 0.28 + rng() * 0.24);
  const figH = ih * (0.024 + 0.022 * figFrac);
  const figT = 1 - figFrac;
  const pathCenterX = geo.centerAt(figT);
  const figX = pathCenterX + (rng() - 0.5) * geo.baseW * figFrac * 0.3;
  let figBaseY = horizonY + groundH * figFrac;
  if (heldHour) {
    const mw = figH * 1.1, mh = figH * 0.7;
    fills += `<rect x="${(figX - mw / 2).toFixed(1)}" y="${(figBaseY - mh).toFixed(1)}" width="${mw.toFixed(1)}" height="${mh.toFixed(1)}" fill="${MONOLITH}"/>`;
    addInk('rect', { x: figX - mw / 2, y: figBaseY - mh, width: mw, height: mh }, 1.0);
    figBaseY -= mh;
    const shx = figX + figH * 2.8, shy = figBaseY + figH * 0.15;
    const shadow = `M${figX.toFixed(1)},${figBaseY.toFixed(1)} L${shx.toFixed(1)},${shy.toFixed(1)} L${shx.toFixed(1)},${(shy + figH * 0.3).toFixed(1)} L${figX.toFixed(1)},${(figBaseY + figH * 0.28).toFixed(1)} Z`;
    fills += `<path d="${shadow}" fill="${SHADOW}"/>`;
  }
  const figureFill = figureMark(addInk, figX, figBaseY, figH); // see note above drawOak's call
  fills += figureFill;

  // 8. birds — a tick-mark per captured moment; some perch on wires
  const onWire = wires > 0 && wireY.length > 1 ? Math.min(moments, Math.floor(moments / 2) + 1) : 0;
  for (let i = 0; i < Math.min(moments, 8); i++) {
    if (i < onWire) {
      const seg = Math.floor(rng() * (wireY.length - 1));
      const a = wireY[seg], b = wireY[seg + 1];
      const bt = 0.3 + rng() * 0.4;
      const bx = a.x + (b.x - a.x) * bt, by = a.y + (b.y - a.y) * bt + Math.sin(bt * Math.PI) * (Math.min(iw, ih) * 0.01);
      addInk('circle', { cx: bx, cy: by - Math.min(iw, ih) * 0.006, r: Math.min(iw, ih) * 0.006, fill: INK }, 0.5);
      continue;
    }
    const bx = ix + iw * (0.1 + rng() * 0.8);
    const by = skyTop + skyH * (0.12 + rng() * 0.45);
    const bw = iw * 0.018;
    const d = `M${(bx - bw).toFixed(1)},${by.toFixed(1)} Q${bx.toFixed(1)},${(by - bw * 0.9).toFixed(1)} ${(bx + bw).toFixed(1)},${by.toFixed(1)}`;
    addInk('path', { d, fill: 'none' }, 0.9);
  }

  // clip the whole scene (everything since the picture window was cut)
  // to that window, so wide elements can't bleed into the cream margin
  const clipId = uid('clip');
  const scene = fills.slice(sceneStart);
  fills = fills.slice(0, sceneStart)
    + `<g clip-path="url(#${clipId})">${scene}</g>`;

  // 9. print finish — grain over the paper (neutral-biased, overlay
  // blended: adds texture, never dims the plate), then the ink
  const grainId = uid('grain');
  const grainSeed = Math.floor(rng() * 900) + 1;
  const defs = `<defs>`
    + `<clipPath id="${clipId}"><rect x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}"/></clipPath>`
    + `<filter id="${grainId}" x="-5%" y="-5%" width="110%" height="110%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${grainSeed}" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" `
    + `values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0" result="grey"/>`
    + `</filter></defs>`;
  const grain = `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" `
    + `filter="url(#${grainId})" style="mix-blend-mode:overlay"/>`;

  let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  svg += defs;
  svg += fills; // fills and their ink are already interleaved in z-order
  svg += grain;
  svg += `</svg>`;
  return svg;
}
