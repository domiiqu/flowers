// bloom.js — procedural drawing. every plant is grown from a seed, never
// from Math.random(), so a habit is always *its* flower and a rendered day
// never flickers between paints.

export function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIES = ['daisy', 'tulip', 'poppy', 'umbel', 'seedhead', 'harebell'];

const C = {
  chalk: '#e8e2d2',
  blush: '#c98d84',
  rust: '#a35b32',
  harebell: '#8d86a8',
  gold: '#d9b36a',
  greenDeep: '#4b5a44',
  greenPale: '#6f7f61',
  greenDry: '#8a7f5e',
  greenGrey: '#5c6459',
  fade: '#6b6357',
};

const SPECIES_COLOR = {
  daisy: C.chalk,
  tulip: C.blush,
  poppy: C.rust,
  umbel: C.chalk,
  seedhead: C.gold,
  harebell: C.harebell,
};

let uidc = 0;
const uid = (tag) => `${tag}${(uidc++).toString(36)}`;

function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(a, b, t) {
  const [ar, ag, ab] = hex2rgb(a), [br, bg, bb] = hex2rgb(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(ar, br)},${m(ag, bg)},${m(ab, bb)})`;
}

// a gently curved stem from the base to a top point, plus 1-2 small leaves.
function stemAndLeaves(rng, { baseX, baseY, topX, topY, midX, midY, width, color, opacity, leaves = 2 }) {
  let out = `<path d="M${baseX.toFixed(1)},${baseY.toFixed(1)} Q${midX.toFixed(1)},${midY.toFixed(1)} ${topX.toFixed(1)},${topY.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" opacity="${opacity.toFixed(2)}"/>`;
  for (let i = 0; i < leaves; i++) {
    const t = 0.35 + i * 0.28 + rng() * 0.08;
    const side = i % 2 === 0 ? 1 : -1;
    const x = baseX + (topX - baseX) * t * t + (midX - baseX) * 2 * t * (1 - t);
    const y = baseY + (topY - baseY) * t * t + (midY - baseY) * 2 * t * (1 - t);
    const len = width * (6 + rng() * 4);
    const droop = 2 + rng() * 3;
    out += `<path d="M${x.toFixed(1)},${y.toFixed(1)} Q${(x + side * len * 0.6).toFixed(1)},${(y - droop).toFixed(1)} ${(x + side * len).toFixed(1)},${(y + droop).toFixed(1)} Q${(x + side * len * 0.5).toFixed(1)},${(y + droop * 1.6).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}" fill="${color}" opacity="${(opacity * 0.75).toFixed(2)}"/>`;
  }
  return out;
}

// a bloom head, centered at the origin, "up" is -y. returns a <g> body
// (no wrapping <g>) sized roughly to `size`.
function headShape(species, size, color, rng) {
  const petals = [];
  if (species === 'daisy') {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.1;
      const x = Math.sin(a) * size * 0.62, y = -Math.cos(a) * size * 0.62;
      const rot = (a * 180) / Math.PI;
      petals.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(size * 0.16).toFixed(1)}" ry="${(size * 0.48).toFixed(1)}" fill="${color}" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" opacity="0.92"/>`);
    }
    petals.push(`<circle r="${(size * 0.3).toFixed(1)}" fill="${C.gold}"/>`);
  } else if (species === 'tulip') {
    const w = size * 0.5, h = size * 1.15;
    petals.push(`<path d="M0,${(-h).toFixed(1)} C${(-w * 1.1).toFixed(1)},${(-h * 0.65).toFixed(1)} ${(-w * 0.95).toFixed(1)},${(h * 0.35).toFixed(1)} 0,${(h * 0.15).toFixed(1)} C${(w * 0.95).toFixed(1)},${(h * 0.35).toFixed(1)} ${(w * 1.1).toFixed(1)},${(-h * 0.65).toFixed(1)} 0,${(-h).toFixed(1)} Z" fill="${color}" opacity="0.94"/>`);
    petals.push(`<path d="M0,${(-h * 0.9).toFixed(1)} C${(-w * 0.5).toFixed(1)},${(-h * 0.3).toFixed(1)} ${(-w * 0.4).toFixed(1)},${(h * 0.1).toFixed(1)} 0,${(h * 0.05).toFixed(1)}" fill="none" stroke="${C.rust}" stroke-width="0.8" opacity="0.35"/>`);
  } else if (species === 'poppy') {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4 + rng() * 0.15;
      const x = Math.sin(a) * size * 0.42, y = -Math.cos(a) * size * 0.42;
      petals.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size * 0.46).toFixed(1)}" fill="${color}" stroke="#2a1810" stroke-width="0.6" opacity="0.92"/>`);
    }
    petals.push(`<circle r="${(size * 0.28).toFixed(1)}" fill="#2a1810"/>`);
    petals.push(`<circle r="${(size * 0.12).toFixed(1)}" fill="${C.gold}" opacity="0.8"/>`);
  } else if (species === 'umbel') {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * size * 0.6;
      const x = Math.sin(a) * r, y = -Math.abs(Math.cos(a) * r * 0.5) - size * 0.14;
      petals.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size * 0.13).toFixed(1)}" fill="${color}" stroke="${C.greenGrey}" stroke-width="0.4" opacity="0.95"/>`);
    }
  } else if (species === 'seedhead') {
    petals.push(`<circle r="${(size * 0.56).toFixed(1)}" fill="${color}" opacity="0.72"/>`);
    petals.push(`<circle r="${(size * 0.56).toFixed(1)}" fill="none" stroke="#3a2a18" stroke-width="0.8" opacity="0.6"/>`);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x1 = Math.sin(a) * size * 0.18, y1 = -Math.cos(a) * size * 0.18;
      const x2 = Math.sin(a) * size * 0.52, y2 = -Math.cos(a) * size * 0.52;
      petals.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#3a2a18" stroke-width="0.7" opacity="0.65"/>`);
    }
  } else if (species === 'harebell') {
    const w = size * 0.42, h = size * 0.7;
    petals.push(`<path d="M${(-w).toFixed(1)},${(-h * 0.3).toFixed(1)} Q${(-w * 1.1).toFixed(1)},${(h * 0.6).toFixed(1)} 0,${(h * 0.75).toFixed(1)} Q${(w * 1.1).toFixed(1)},${(h * 0.6).toFixed(1)} ${w.toFixed(1)},${(-h * 0.3).toFixed(1)} Q0,${(-h * 0.55).toFixed(1)} ${(-w).toFixed(1)},${(-h * 0.3).toFixed(1)} Z" fill="${color}" opacity="0.9"/>`);
  }
  return petals.join('');
}

/**
 * plantSVG({seed, state, w, h}) — a single habit's flower.
 * state: 'bud' | 'bloom' | 'withered'
 */
export function plantSVG({ seed = 1, state = 'bud', w = 64, h = 96 } = {}) {
  const rng = mulberry(seed);
  const species = SPECIES[Math.floor(rng() * SPECIES.length)];
  const color = SPECIES_COLOR[species];
  const sway = (rng() - 0.5) * w * 0.22;
  const lean = (rng() - 0.5) * w * 0.16;

  const wither = state === 'withered';
  const bloom = state === 'bloom';
  const dim = state === 'bud';

  const baseX = w * 0.5, baseY = h - 3;
  const topFrac = wither ? 0.5 : 0.16;
  let topX = baseX + sway;
  let topY = h * topFrac;
  if (wither) topX += (rng() > 0.5 ? 1 : -1) * w * 0.2; // slump to a side
  const midX = baseX + lean, midY = h * 0.56;

  const stemColor = wither ? C.greenGrey : (bloom ? C.greenPale : C.greenDeep);
  const stemOpacity = wither ? 0.55 : (dim ? 0.55 : 0.85);
  const stemWidth = (wither ? 1.2 : 1.8) + rng() * 0.5;

  let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" data-species="${species}" data-state="${state}">`;

  const glowId = uid('g');
  if (bloom) {
    svg += `<defs><radialGradient id="${glowId}"><stop offset="0%" stop-color="${C.gold}" stop-opacity="0.32"/><stop offset="60%" stop-color="${C.gold}" stop-opacity="0.1"/><stop offset="100%" stop-color="${C.gold}" stop-opacity="0"/></radialGradient></defs>`;
  }

  svg += stemAndLeaves(rng, { baseX, baseY, topX, topY, midX, midY, width: stemWidth, color: stemColor, opacity: stemOpacity, leaves: wither ? 1 : 2 });

  if (bloom) {
    const size = w * (0.34 + rng() * 0.06);
    svg += `<circle cx="${topX.toFixed(1)}" cy="${topY.toFixed(1)}" r="${(size * 1.2).toFixed(1)}" fill="url(#${glowId})"/>`;
    svg += `<g transform="translate(${topX.toFixed(1)},${topY.toFixed(1)}) rotate(${((rng() - 0.5) * 12).toFixed(1)})">${headShape(species, size, color, rng)}</g>`;
  } else if (wither) {
    const size = w * 0.22;
    const tone = lerpColor(color, C.fade, 0.65);
    svg += `<g transform="translate(${topX.toFixed(1)},${topY.toFixed(1)}) rotate(${(120 + rng() * 40).toFixed(1)})" opacity="0.55">${headShape(species, size, tone, rng)}</g>`;
  } else {
    // closed bud — small, dim, faintly tinted toward what it will become
    const size = w * 0.13;
    const tone = lerpColor(color, '#4a463c', 0.55);
    svg += `<ellipse cx="${topX.toFixed(1)}" cy="${topY.toFixed(1)}" rx="${(size * 0.62).toFixed(1)}" ry="${size.toFixed(1)}" fill="${tone}" opacity="0.7"/>`;
    svg += `<ellipse cx="${topX.toFixed(1)}" cy="${topY.toFixed(1)}" rx="${(size * 0.62).toFixed(1)}" ry="${size.toFixed(1)}" fill="none" stroke="${C.greenDeep}" stroke-width="0.6" opacity="0.5"/>`;
  }

  svg += `</svg>`;
  return svg;
}

const MOOD_COLD = '#5c6b7a';
const MOOD_WARM = '#d9a066';

/**
 * daySVG(summary, w, h) — a day-plant for the meadow.
 * summary: { doneRatio, ticks, mood(0-5|null), fog(0-5|null), fed(0|1|null), heldHour, noData, daySeed }
 * a day with no signal at all (noData) draws as a small dry stub at the
 * ground line, rather than nothing — the field stays continuous.
 */
export function daySVG(summary = {}, w = 46, h = 100) {
  const { doneRatio = 0, ticks = 0, mood = null, fog = null, fed = null, heldHour = false, noData = false, daySeed = 0 } = summary;

  if (noData) {
    const rng = mulberry(101 + (daySeed % 4999));
    const baseX = w * 0.5, baseY = h - 3;
    const stubH = h * (0.05 + rng() * 0.03);
    const sway = (rng() - 0.5) * w * 0.12;
    const topX = baseX + sway, topY = baseY - stubH;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<path d="M${baseX.toFixed(1)},${baseY.toFixed(1)} L${topX.toFixed(1)},${topY.toFixed(1)}" stroke="${C.fade}" stroke-width="1" stroke-linecap="round" opacity="0.5"/>`;
    svg += `<circle cx="${topX.toFixed(1)}" cy="${topY.toFixed(1)}" r="${(w * 0.028).toFixed(1)}" fill="${C.fade}" opacity="0.45"/>`;
    svg += `</svg>`;
    return svg;
  }

  const seed = Math.max(1, Math.round(
    (doneRatio * 977) + (ticks * 131) + ((mood ?? -1) * 53 + 61) + ((fog ?? -1) * 37 + 41) + ((fed ?? -1) * 19 + 23) + (daySeed % 41)
  ));
  const rng = mulberry(seed);

  const baseX = w * 0.5, baseY = h - 3;
  const stemFrac = 0.12 + 0.68 * Math.min(1, doneRatio);
  const sway = (rng() - 0.5) * w * 0.2;
  const topX = baseX + sway;
  const topY = baseY - stemFrac * (h - 12);
  const midX = baseX + (rng() - 0.5) * w * 0.18, midY = (baseY + topY) / 2;

  const fedColor = fed === 1 ? '#5f8a4f' : fed === 0 ? '#b3a06e' : C.greenPale;
  const fedOpacity = fed === 0 ? 0.45 : fed === 1 ? 0.9 : 0.7;
  const fedWidth = fed === 1 ? 2.6 : fed === 0 ? 1.0 : 1.7;

  const moodColor = mood == null ? '#9a9484' : lerpColor(MOOD_COLD, MOOD_WARM, Math.max(0, Math.min(1, mood / 5)));

  let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  svg += stemAndLeaves(rng, { baseX, baseY, topX, topY, midX, midY, width: fedWidth, color: fedColor, opacity: fedOpacity, leaves: 1 });

  const n = Math.max(0, Math.min(7, Math.round(ticks)));
  for (let i = 0; i < n; i++) {
    const t = 0.35 + (i / Math.max(1, n - 1 || 1)) * 0.6;
    const side = i % 2 === 0 ? 1 : -1;
    const x = baseX + (topX - baseX) * t * t + (midX - baseX) * 2 * t * (1 - t) + side * w * 0.16;
    const y = baseY + (topY - baseY) * t * t + (midY - baseY) * 2 * t * (1 - t);
    const r = w * (0.07 + rng() * 0.03);
    svg += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})">`;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      svg += `<ellipse cx="${(Math.sin(a) * r * 0.7).toFixed(1)}" cy="${(-Math.cos(a) * r * 0.7).toFixed(1)}" rx="${(r * 0.32).toFixed(1)}" ry="${(r * 0.6).toFixed(1)}" fill="${moodColor}" transform="rotate(${(a * 180 / Math.PI).toFixed(1)} ${(Math.sin(a) * r * 0.7).toFixed(1)} ${(-Math.cos(a) * r * 0.7).toFixed(1)})" opacity="0.88"/>`;
    }
    svg += `<circle r="${(r * 0.32).toFixed(1)}" fill="${C.gold}" opacity="0.8"/></g>`;
  }

  if (heldHour) {
    const sx = topX, sy = topY - 9;
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 5 : 2.1;
      pts.push(`${(sx + Math.sin(a) * r).toFixed(1)},${(sy - Math.cos(a) * r).toFixed(1)}`);
    }
    svg += `<polygon points="${pts.join(' ')}" fill="${C.gold}" opacity="0.95"/>`;
  }

  if (fog != null && fog > 0) {
    // a soft haze hugging the plant itself — sized to how tall it stands
    // today, not the full (now much taller) canvas, and soft-edged so it
    // reads as weather, not a grey card behind the flower.
    const fogId = uid('fog');
    const cy = (baseY + topY) / 2;
    // keep the whole soft-edged ellipse inside the canvas — otherwise the
    // gradient never gets to fade before the SVG clips it, and a haze
    // reads as a hard-edged slab instead.
    const rawRy = Math.max(h * 0.07, Math.abs(baseY - topY) * 0.32);
    const ry = Math.max(6, Math.min(rawRy, cy - 4, h - 4 - cy));
    const rx = Math.min(w * 0.24, w / 2 - 6);
    const op = 0.12 + (fog / 5) * 0.24;
    svg += `<defs><radialGradient id="${fogId}" cx="50%" cy="50%" r="55%">` +
      `<stop offset="0%" stop-color="#aeb9c8" stop-opacity="${op.toFixed(2)}"/>` +
      `<stop offset="100%" stop-color="#aeb9c8" stop-opacity="0"/></radialGradient></defs>`;
    svg += `<ellipse cx="${(w / 2).toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#${fogId})"/>`;
  }

  svg += `</svg>`;
  return svg;
}
