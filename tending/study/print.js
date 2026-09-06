// print.js — the print study: a standalone Moebius/Giraud-style renderer
// sample. Greenfield: does not import from, or get imported by, the app
// (bloom.js, views.js, index.html are untouched). mulberry() is copied
// verbatim from bloom.js:5 rather than imported, on purpose.
//
// Look: flat gouache fills at opacity 1.0 everywhere — depth is carried by
// value and a single uniform ink contour line, never by transparency. Every
// ink line is drawn twice: once as a faint rust "ghost" (a slight
// misregistration offset, like a print's key plate slipping a fraction off
// the color plate) and once crisp on top. A per-print grain filter sits
// over the paper only. This deliberately inverts bloom.js's opacity-as-
// shading approach.

export function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let uidc = 0;
const uid = (tag) => `${tag}${(uidc++).toString(36)}`;

// ------------------------------------------------------------- palette

const INK = '#26221c';
const INK_GHOST = '#8a5a42';
const PAPER = '#f0ead6';
const MOUNTS = ['#b9c4a6', '#cfd4e4', '#d9d4c8', '#c5d2c0', '#adb8d0'];

// the light ramp: 5 flat sky stops, driven by one 0..1 score
const SKY_STOPS = [
  { t: 0, c: '#e8e4d4' },    // dawn
  { t: 0.25, c: '#cfe0e8' }, // duck-egg
  { t: 0.5, c: '#3a6bc4' },  // cobalt
  { t: 0.75, c: '#e0b98a' }, // apricot
  { t: 1, c: '#2b3050' },    // indigo
];

const SUN = '#f2e7c8';
const MOON = '#dfe1de';
const CLOUD = '#f4f1e8';
const FIELD_LIGHT = '#7d9c6a';
const FIELD_DARK = '#5f7d52';
const DESERT = '#ddd3b8';
const NEUTRAL_GROUND = '#cec5ac';
const ROCK_DARK = '#a84428';
const ROCK_LIGHT = '#c15f33';
const FOG = '#e6e3d8';
const SHADOW = '#4a4238';
const MONOLITH = '#efe9d8';
const FLORA = ['#e8e2d2', '#c98d84', '#a35b32', '#eee6cf', '#d9b36a', '#8d86a8'];

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
// lightHour (0-24) -> a single 0..1 light score. 5am is the dawn floor,
// 10pm the indigo ceiling; outside that band it just clamps to night.
function lightScore(hour) {
  if (hour == null) return 0.5;
  return Math.max(0, Math.min(1, (hour - 5) / 17));
}

// ------------------------------------------------------------ flora, flat

function drawFlora(rng, addInk, cx, baseY, size) {
  const kind = Math.floor(rng() * 6);
  const stemH = size * (1.5 + rng() * 0.5);
  const topY = baseY - stemH;
  const sway = (rng() - 0.5) * size * 0.4;
  const headX = cx + sway;
  addInk('line', { x1: cx, y1: baseY, x2: headX, y2: topY }, 1.1);
  const color = FLORA[kind];
  let fill = '';
  if (kind === 0) { // daisy — a filled disc, ink petal ticks radiating
    fill += `<circle cx="${headX.toFixed(1)}" cy="${topY.toFixed(1)}" r="${(size * 0.32).toFixed(1)}" fill="${color}"/>`;
    addInk('circle', { cx: headX, cy: topY, r: size * 0.32 }, 1.1);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x1 = headX + Math.sin(a) * size * 0.36, y1 = topY - Math.cos(a) * size * 0.36;
      const x2 = headX + Math.sin(a) * size * 0.56, y2 = topY - Math.cos(a) * size * 0.56;
      addInk('line', { x1, y1, x2, y2 }, 0.9);
    }
  } else if (kind === 1) { // tulip — a flat cup
    const w = size * 0.34, hh = size * 0.5;
    const d = `M${headX.toFixed(1)},${(topY - hh).toFixed(1)} C${(headX - w).toFixed(1)},${(topY - hh * 0.3).toFixed(1)} ${(headX - w * 0.8).toFixed(1)},${(topY + hh * 0.3).toFixed(1)} ${headX.toFixed(1)},${(topY + hh * 0.2).toFixed(1)} C${(headX + w * 0.8).toFixed(1)},${(topY + hh * 0.3).toFixed(1)} ${(headX + w).toFixed(1)},${(topY - hh * 0.3).toFixed(1)} ${headX.toFixed(1)},${(topY - hh).toFixed(1)} Z`;
    fill += `<path d="${d}" fill="${color}"/>`;
    addInk('path', { d }, 1.1);
  } else if (kind === 2) { // poppy — a wide flat bowl, dark ink center
    fill += `<circle cx="${headX.toFixed(1)}" cy="${topY.toFixed(1)}" r="${(size * 0.42).toFixed(1)}" fill="${color}"/>`;
    addInk('circle', { cx: headX, cy: topY, r: size * 0.42 }, 1.1);
    fill += `<circle cx="${headX.toFixed(1)}" cy="${topY.toFixed(1)}" r="${(size * 0.13).toFixed(1)}" fill="${INK}"/>`;
  } else if (kind === 3) { // umbel — a small dome of dots
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 1.6;
      const x = headX + Math.sin(a) * size * 0.34, y = topY - Math.abs(Math.cos(a)) * size * 0.18;
      fill += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size * 0.1).toFixed(1)}" fill="${color}"/>`;
      addInk('circle', { cx: x, cy: y, r: size * 0.1 }, 0.9);
    }
  } else if (kind === 4) { // seedhead — a filled disc with dry radiating lines
    fill += `<circle cx="${headX.toFixed(1)}" cy="${topY.toFixed(1)}" r="${(size * 0.3).toFixed(1)}" fill="${color}"/>`;
    addInk('circle', { cx: headX, cy: topY, r: size * 0.3 }, 1.1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      addInk('line', {
        x1: headX + Math.sin(a) * size * 0.12, y1: topY - Math.cos(a) * size * 0.12,
        x2: headX + Math.sin(a) * size * 0.3, y2: topY - Math.cos(a) * size * 0.3,
      }, 0.7);
    }
  } else { // harebell — a hanging bell
    const w = size * 0.26, hh = size * 0.4;
    const d = `M${(headX - w).toFixed(1)},${(topY - hh * 0.2).toFixed(1)} Q${headX.toFixed(1)},${(topY + hh).toFixed(1)} ${(headX + w).toFixed(1)},${(topY - hh * 0.2).toFixed(1)} Q${headX.toFixed(1)},${(topY - hh * 0.4).toFixed(1)} ${(headX - w).toFixed(1)},${(topY - hh * 0.2).toFixed(1)} Z`;
    fill += `<path d="${d}" fill="${color}"/>`;
    addInk('path', { d }, 1.1);
  }
  return fill;
}

/**
 * dayPrint(data, w, h) -> svg string
 * data: { seed, lightHour(0-24), habitsDone, habitsTotal, fog(0-5|null),
 *         fed(0|1|null), mood(0-5|null), sleep(hours|null), heldHour,
 *         moments(count), note(bool) }
 */
export function dayPrint(data = {}, w = 300, h = 380) {
  const {
    seed = 1, lightHour = 13.5, habitsDone = 0, habitsTotal = 5,
    fog = null, fed = null, heldHour = false, moments = 0,
  } = data;
  const rng = mulberry(seed);
  const inkShapes = [];
  const addInk = (el, attrs, sw = 1.3) => inkShapes.push({ el, attrs, sw });

  let fills = '';

  // 1. mount
  const mount = MOUNTS[Math.floor(rng() * MOUNTS.length)];
  fills += `<rect x="0" y="0" width="${w}" height="${h}" fill="${mount}"/>`;

  // 2. paper — inset cream plate, thin ink frame
  const margin = Math.min(w, h) * 0.075;
  const px = margin, py = margin * 0.85, pBottom = margin * 1.7;
  const pw = w - 2 * margin, ph = h - py - pBottom;
  fills += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${PAPER}"/>`;
  addInk('rect', { x: px, y: py, width: pw, height: ph }, 1.5);

  // 3. sky — one flat colour from the light score
  const t = lightScore(lightHour);
  const isNight = t > 0.82;
  const skyH = ph * 0.62;
  const skyTop = py, skyBottom = py + skyH;
  fills += `<rect x="${px.toFixed(1)}" y="${skyTop.toFixed(1)}" width="${pw.toFixed(1)}" height="${skyH.toFixed(1)}" fill="${skyColor(t)}"/>`;

  const bodyR = Math.min(pw, ph) * 0.045;
  const bodyX = px + pw * (0.2 + rng() * 0.6);
  const bodyY = skyTop + skyH * (0.22 + rng() * 0.16);
  fills += `<circle cx="${bodyX.toFixed(1)}" cy="${bodyY.toFixed(1)}" r="${bodyR.toFixed(1)}" fill="${isNight ? MOON : SUN}"/>`;
  addInk('circle', { cx: bodyX, cy: bodyY, r: bodyR }, 1.1);

  if (rng() < 0.45) {
    const side = rng() < 0.5 ? 0.14 : 0.62;
    const ccx = px + pw * (side + rng() * 0.12);
    const ccy = skyTop + skyH * (0.42 + rng() * 0.22);
    const cw = pw * (0.15 + rng() * 0.07), ch = cw * 0.3;
    const d = `M${(ccx - cw / 2).toFixed(1)},${(ccy + ch / 2).toFixed(1)} `
      + `h${(cw * 0.16).toFixed(1)} v${(-ch * 0.35).toFixed(1)} h${(cw * 0.18).toFixed(1)} v${(-ch * 0.3).toFixed(1)} `
      + `h${(cw * 0.32).toFixed(1)} v${(ch * 0.3).toFixed(1)} h${(cw * 0.18).toFixed(1)} v${(ch * 0.35).toFixed(1)} `
      + `h${(cw * 0.16).toFixed(1)} v${(ch * 0.4).toFixed(1)} h${(-cw).toFixed(1)} Z`;
    fills += `<path d="${d}" fill="${CLOUD}"/>`;
    addInk('path', { d }, 1.0);
  }

  // 4. land — terrain grammar as consequence
  const landTop = skyBottom, landH = ph - skyH;
  if (fed === 0) {
    fills += `<rect x="${px.toFixed(1)}" y="${landTop.toFixed(1)}" width="${pw.toFixed(1)}" height="${landH.toFixed(1)}" fill="${DESERT}"/>`;
    addInk('line', { x1: px, y1: landTop, x2: px + pw, y2: landTop }, 1.5);
    const cracks = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < cracks; i++) {
      const sx = px + pw * (0.15 + rng() * 0.7), sy = landTop + landH * (0.3 + rng() * 0.45);
      const d = `M${sx.toFixed(1)},${sy.toFixed(1)} l${((rng() - 0.5) * pw * 0.08).toFixed(1)},${(landH * 0.12).toFixed(1)} `
        + `l${((rng() - 0.5) * pw * 0.06).toFixed(1)},${(landH * 0.1).toFixed(1)}`;
      addInk('path', { d }, 0.8);
    }
  } else if (fed === 1) {
    const midY = landTop + landH * 0.45;
    fills += `<rect x="${px.toFixed(1)}" y="${landTop.toFixed(1)}" width="${pw.toFixed(1)}" height="${(landH * 0.45).toFixed(1)}" fill="${FIELD_LIGHT}"/>`;
    fills += `<rect x="${px.toFixed(1)}" y="${midY.toFixed(1)}" width="${pw.toFixed(1)}" height="${(landH * 0.55).toFixed(1)}" fill="${FIELD_DARK}"/>`;
    addInk('line', { x1: px, y1: landTop, x2: px + pw, y2: landTop }, 1.5);
    addInk('line', { x1: px, y1: midY, x2: px + pw, y2: midY }, 0.9);
  } else {
    fills += `<rect x="${px.toFixed(1)}" y="${landTop.toFixed(1)}" width="${pw.toFixed(1)}" height="${landH.toFixed(1)}" fill="${NEUTRAL_GROUND}"/>`;
    addInk('line', { x1: px, y1: landTop, x2: px + pw, y2: landTop }, 1.5);
  }

  if (rng() < 0.35) {
    const side = rng() < 0.5 ? 0 : 1;
    const rw = pw * (0.18 + rng() * 0.1), rh = landH * (0.45 + rng() * 0.3);
    const rx = side === 0 ? px + pw * 0.04 : px + pw - rw - pw * 0.04;
    const ry = landTop + landH - rh;
    const outline = `M${rx.toFixed(1)},${(landTop + landH).toFixed(1)} L${(rx + rw * 0.15).toFixed(1)},${(ry + rh * 0.2).toFixed(1)} `
      + `L${(rx + rw * 0.5).toFixed(1)},${ry.toFixed(1)} L${(rx + rw * 0.85).toFixed(1)},${(ry + rh * 0.25).toFixed(1)} `
      + `L${(rx + rw).toFixed(1)},${(landTop + landH).toFixed(1)} Z`;
    fills += `<path d="${outline}" fill="${ROCK_DARK}"/>`;
    const lit = `M${(rx + rw * 0.5).toFixed(1)},${ry.toFixed(1)} L${(rx + rw * 0.85).toFixed(1)},${(ry + rh * 0.25).toFixed(1)} `
      + `L${(rx + rw).toFixed(1)},${(landTop + landH).toFixed(1)} L${(rx + rw * 0.55).toFixed(1)},${(landTop + landH).toFixed(1)} Z`;
    fills += `<path d="${lit}" fill="${ROCK_LIGHT}"/>`;
    addInk('path', { d: outline }, 1.2);
  }

  // 6. fog — a hard-edged bank with a stepped top, sliding in, swallowing
  // the horizon past 4 (Moebius fog is a solid shape, never a gradient).
  // Drawn behind the flora and the figure — it rolls at the horizon, not
  // over what's standing close to the viewer.
  if (fog != null && fog > 0) {
    const fromLeft = rng() < 0.5;
    const fw = pw * (0.2 + (fog / 5) * 0.62);
    const fh = landH * (0.3 + (fog / 5) * 0.85);
    const fx = fromLeft ? px : px + pw - fw;
    const baseTop = landTop + landH - fh;
    const steps = 4;
    const stepW = fw / steps;
    const heights = Array.from({ length: steps }, () => 0.5 + rng() * 0.5).sort((a, b) => (fromLeft ? b - a : a - b));
    let d = fromLeft ? `M${fx.toFixed(1)},${(landTop + landH).toFixed(1)} ` : `M${(fx + fw).toFixed(1)},${(landTop + landH).toFixed(1)} `;
    const xs = fromLeft ? fx : fx + fw;
    for (let i = 0; i < steps; i++) {
      const stepX = fromLeft ? xs + i * stepW : xs - i * stepW;
      const stepY = baseTop + fh * (1 - heights[i]) * 0.4;
      d += `L${stepX.toFixed(1)},${stepY.toFixed(1)} `;
      const nextX = fromLeft ? xs + (i + 1) * stepW : xs - (i + 1) * stepW;
      d += `L${nextX.toFixed(1)},${stepY.toFixed(1)} `;
    }
    d += `L${(fromLeft ? fx + fw : fx).toFixed(1)},${(landTop + landH).toFixed(1)} Z`;
    fills += `<path d="${d}" fill="${FOG}"/>`;
    addInk('path', { d }, 1.2);
  }

  // 5. flora — one per habit done, absent (not dimmed) when not
  const n = Math.max(0, Math.min(5, habitsDone));
  for (let i = 0; i < n; i++) {
    const fx = px + pw * ((i + 1) / (n + 1));
    const fy = landTop + landH * 0.94;
    fills += drawFlora(rng, addInk, fx, fy, Math.min(pw, ph) * 0.09);
  }

  // 7. the figure — tiny, lone, flat ink, standing apart from the flora
  // (near the horizon, not among the plants) so it reads as *distance*.
  const figH = ph * 0.032;
  const figX = px + pw * (0.15 + rng() * 0.7);
  let figBaseY = landTop + landH * (0.08 + rng() * 0.2);
  if (heldHour) {
    const mw = figH * 1.1, mh = figH * 0.7;
    fills += `<rect x="${(figX - mw / 2).toFixed(1)}" y="${(figBaseY - mh).toFixed(1)}" width="${mw.toFixed(1)}" height="${mh.toFixed(1)}" fill="${MONOLITH}"/>`;
    addInk('rect', { x: figX - mw / 2, y: figBaseY - mh, width: mw, height: mh }, 1.0);
    figBaseY -= mh;
    const shx = figX + figH * 2.6, shy = figBaseY + figH * 0.15;
    const shadow = `M${figX.toFixed(1)},${figBaseY.toFixed(1)} L${shx.toFixed(1)},${shy.toFixed(1)} L${shx.toFixed(1)},${(shy + figH * 0.35).toFixed(1)} L${figX.toFixed(1)},${(figBaseY + figH * 0.3).toFixed(1)} Z`;
    fills += `<path d="${shadow}" fill="${SHADOW}"/>`;
  }
  fills += figureMark(figX, figBaseY, figH);

  // 8. birds — a tick-mark per captured moment
  for (let i = 0; i < Math.min(moments, 8); i++) {
    const bx = px + pw * (0.1 + rng() * 0.8);
    const by = skyTop + skyH * (0.12 + rng() * 0.45);
    const bw = pw * 0.018;
    const d = `M${(bx - bw).toFixed(1)},${by.toFixed(1)} Q${bx.toFixed(1)},${(by - bw * 0.9).toFixed(1)} ${(bx + bw).toFixed(1)},${by.toFixed(1)}`;
    addInk('path', { d, fill: 'none' }, 0.9);
  }

  // 9. print finish — grain over the paper, then the ink (ghost, then real)
  const grainId = uid('grain');
  const grainSeed = Math.floor(rng() * 900) + 1;
  const defs = `<defs><filter id="${grainId}" x="-5%" y="-5%" width="110%" height="110%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="${grainSeed}" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.1 1.1 1.1 0 0"/>`
    + `</filter></defs>`;
  const grain = `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" `
    + `fill="#000" filter="url(#${grainId})" opacity="0.65" style="mix-blend-mode:multiply"/>`;

  const inkLayer = (color, opacity, dx, dy) => {
    let s = `<g transform="translate(${dx},${dy})" fill="none" stroke="${color}" stroke-opacity="${opacity}" `
      + `stroke-linecap="round" stroke-linejoin="round">`;
    for (const { el, attrs, sw } of inkShapes) {
      const a = { ...attrs };
      const fill = a.fill; delete a.fill;
      const attrStr = Object.entries(a).map(([k, v]) => `${k}="${typeof v === 'number' ? v.toFixed(2) : v}"`).join(' ');
      s += `<${el} ${attrStr} fill="${fill || 'none'}" stroke-width="${sw}"/>`;
    }
    return s + `</g>`;
  };

  // the slip is faint but must actually read at print size, so it's
  // proportional to the paper rather than a fixed unit offset
  const slip = Math.max(1, Math.min(pw, ph) * 0.008);

  let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  svg += defs;
  svg += fills;
  svg += grain;
  svg += inkLayer(INK_GHOST, 0.4, slip, slip * 0.9); // misregistration ghost
  svg += inkLayer(INK, 1, 0, 0);                      // crisp ink, on top
  svg += `</svg>`;
  return svg;
}

function figureMark(x, baseY, h) {
  const legY = baseY, hipY = baseY - h * 0.55, headY = baseY - h;
  const d = `M${(x - h * 0.12).toFixed(1)},${legY.toFixed(1)} L${x.toFixed(1)},${hipY.toFixed(1)} `
    + `L${(x + h * 0.12).toFixed(1)},${legY.toFixed(1)} M${x.toFixed(1)},${hipY.toFixed(1)} `
    + `L${x.toFixed(1)},${(baseY - h * 0.78).toFixed(1)}`;
  return `<circle cx="${x.toFixed(1)}" cy="${headY.toFixed(1)}" r="${(h * 0.14).toFixed(1)}" fill="${INK}"/>`
    + `<path d="${d}" stroke="${INK}" stroke-width="${Math.max(1, h * 0.14)}" fill="none" stroke-linecap="round"/>`;
}
