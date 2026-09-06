// print.js — the print study: a standalone Moebius/Giraud-style renderer
// sample. Greenfield: does not import from, or get imported by, the app
// (bloom.js, views.js, index.html are untouched). mulberry() is copied
// verbatim from bloom.js:5 rather than imported, on purpose.
//
// Look: flat gouache fills at opacity 1.0 everywhere — depth is carried by
// value, warmth and a single uniform ink contour line, never by
// transparency. Every ink line is drawn twice: once as a faint rust
// "ghost" (a slight misregistration offset, like a print's key plate
// slipping a fraction off the color plate) and once crisp on top. A
// per-print grain filter sits over the paper only, biased toward neutral
// so it adds texture without dimming the plate. This deliberately inverts
// bloom.js's opacity-as-shading approach.

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
const MOON = '#e8e0c8';       // pale cream — the brightest thing in an indigo sky
const CLOUD = '#f4f1e2';      // chalk white, never grey
const PATH_COLOR = '#e3d7b8'; // the winding dust path
const ROCK_DARK = '#a84428';
const ROCK_LIGHT = '#c15f33';
const FOG = '#e6e3d8';        // pale weather, never grey-dark
const SHADOW = '#4a4238';
const MONOLITH = '#efe9d8';
const FLORA = ['#e8e2d2', '#c98d84', '#a35b32', '#eee6cf', '#d9b36a', '#8d86a8'];

// three-tone ground ramps: far (cool, pale) -> mid -> near (warmer, darker)
const GROUND = {
  field: ['#a8c092', '#7d9c6a', '#5a6b3a'],
  desert: ['#e6dcc0', '#ddd3b8', '#c7a877'],
  neutral: ['#d6cdb4', '#cec5ac', '#b3a37e'],
};

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

// ------------------------------------------------------- flora, petalled

// a single asymmetric teardrop petal, pointing outward from (cx,cy) at
// `angle`, length `len`, half-width `w`.
function petalPath(cx, cy, angle, len, w) {
  const tipX = cx + Math.sin(angle) * len, tipY = cy - Math.cos(angle) * len;
  const lx = cx + Math.sin(angle - 0.55) * w, ly = cy - Math.cos(angle - 0.55) * w;
  const rx = cx + Math.sin(angle + 0.55) * w, ry = cy - Math.cos(angle + 0.55) * w;
  return `M${cx.toFixed(1)},${cy.toFixed(1)} Q${lx.toFixed(1)},${ly.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} `
    + `Q${rx.toFixed(1)},${ry.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)} Z`;
}

// one stylized plant, off-vertical, with an asymmetric petalled head —
// never a filled disc on a stick. `depth` (0 far/small .. 1 near/large)
// sets size and line weight.
function drawFlora(rng, addInk, cx, baseY, size, depth = 0.5) {
  const kind = Math.floor(rng() * FLORA.length);
  const color = FLORA[kind];
  const lean = (rng() - 0.5) * 0.7; // radians — a visible off-vertical lean
  const stemH = size * (1.7 + rng() * 0.5);
  const topX = cx + Math.sin(lean) * stemH * 0.7;
  const topY = baseY - Math.cos(lean) * stemH;
  const midX = cx + Math.sin(lean) * stemH * 0.32;
  const midY = baseY - Math.cos(lean) * stemH * 0.5;
  const sw = 0.7 + depth * 0.6;
  addInk('path', { d: `M${cx.toFixed(1)},${baseY.toFixed(1)} Q${midX.toFixed(1)},${midY.toFixed(1)} ${topX.toFixed(1)},${topY.toFixed(1)}`, fill: 'none' }, sw);

  const petals = 5 + Math.floor(rng() * 4); // 5-8, asymmetric
  const baseAngle = rng() * Math.PI * 2;
  let fill = '';
  for (let i = 0; i < petals; i++) {
    const a = baseAngle + (i / petals) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const len = size * (0.28 + rng() * 0.16);
    const w = size * (0.16 + rng() * 0.06);
    const d = petalPath(topX, topY, a, len, w);
    fill += `<path d="${d}" fill="${color}"/>`;
    addInk('path', { d }, Math.max(0.6, sw * 0.75));
  }
  fill += `<circle cx="${topX.toFixed(1)}" cy="${topY.toFixed(1)}" r="${(size * 0.12).toFixed(1)}" fill="${INK}"/>`;
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
    seed = 1, lightHour = 13.5, habitsDone = 0, fog = null, fed = null,
    heldHour = false, moments = 0,
  } = data;
  const rng = mulberry(seed);
  const inkShapes = [];
  const addInk = (el, attrs, sw = 1.3) => inkShapes.push({ el, attrs, sw });

  let fills = '';

  // 1. mount
  const mount = MOUNTS[Math.floor(rng() * MOUNTS.length)];
  fills += `<rect x="0" y="0" width="${w}" height="${h}" fill="${mount}"/>`;

  // 2. paper — the outer cream plate, thin ink frame
  const margin = Math.min(w, h) * 0.075;
  const px = margin, py = margin * 0.85, pBottom = margin * 1.7;
  const pw = w - 2 * margin, ph = h - py - pBottom;
  fills += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${PAPER}"/>`;
  addInk('rect', { x: px, y: py, width: pw, height: ph }, 1.5);

  // the picture window — inset from the paper edge, so a visible cream
  // margin (the plate's own white border) sits between the picture and
  // the frame, like the reference postcards.
  const win = Math.min(pw, ph) * 0.06;
  const ix = px + win, iy = py + win, iw = pw - 2 * win, ih = ph - 2 * win;
  addInk('rect', { x: ix, y: iy, width: iw, height: ih }, 1.0);

  // 3. sky — one flat colour from the light score, low horizon (~62%)
  const t = lightScore(lightHour);
  const isNight = t > 0.82;
  const skyH = ih * 0.62;
  const skyTop = iy, horizonY = iy + skyH;
  fills += `<rect x="${ix.toFixed(1)}" y="${skyTop.toFixed(1)}" width="${iw.toFixed(1)}" height="${skyH.toFixed(1)}" fill="${skyColor(t)}"/>`;

  const bodyR = Math.min(iw, ih) * 0.042;
  const bodyX = ix + iw * (0.2 + rng() * 0.6);
  const bodyY = skyTop + skyH * (0.2 + rng() * 0.15);
  fills += `<circle cx="${bodyX.toFixed(1)}" cy="${bodyY.toFixed(1)}" r="${bodyR.toFixed(1)}" fill="${isNight ? MOON : SUN}"/>`;
  addInk('circle', { cx: bodyX, cy: bodyY, r: bodyR }, 1.0);

  if (rng() < 0.45) {
    const side = rng() < 0.5 ? 0.14 : 0.62;
    const ccx = ix + iw * (side + rng() * 0.12);
    const ccy = skyTop + skyH * (0.4 + rng() * 0.2);
    const cw = iw * (0.15 + rng() * 0.07), ch = cw * 0.3;
    const d = `M${(ccx - cw / 2).toFixed(1)},${(ccy + ch / 2).toFixed(1)} `
      + `h${(cw * 0.16).toFixed(1)} v${(-ch * 0.35).toFixed(1)} h${(cw * 0.18).toFixed(1)} v${(-ch * 0.3).toFixed(1)} `
      + `h${(cw * 0.32).toFixed(1)} v${(ch * 0.3).toFixed(1)} h${(cw * 0.18).toFixed(1)} v${(ch * 0.35).toFixed(1)} `
      + `h${(cw * 0.16).toFixed(1)} v${(ch * 0.4).toFixed(1)} h${(-cw).toFixed(1)} Z`;
    fills += `<path d="${d}" fill="${CLOUD}"/>`;
    addInk('path', { d }, 1.0);
  }

  // 4. ground — one plane, horizon to bottom, in 2-3 flat bands that get
  // warmer and darker toward the viewer (not a second horizontal strip)
  const groundH = ih - skyH;
  const ramp = fed === 0 ? GROUND.desert : fed === 1 ? GROUND.field : GROUND.neutral;
  const bandSplits = [0, 0.22, 0.52, 1];
  for (let i = 0; i < 3; i++) {
    const y0 = horizonY + groundH * bandSplits[i];
    const y1 = horizonY + groundH * bandSplits[i + 1];
    fills += `<rect x="${ix.toFixed(1)}" y="${y0.toFixed(1)}" width="${iw.toFixed(1)}" height="${(y1 - y0).toFixed(1)}" fill="${ramp[i]}"/>`;
  }
  addInk('line', { x1: ix, y1: horizonY, x2: ix + iw, y2: horizonY }, 1.4);

  if (fed === 0) {
    const cracks = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < cracks; i++) {
      const sx = ix + iw * (0.15 + rng() * 0.7), sy = horizonY + groundH * (0.35 + rng() * 0.5);
      const d = `M${sx.toFixed(1)},${sy.toFixed(1)} l${((rng() - 0.5) * iw * 0.08).toFixed(1)},${(groundH * 0.12).toFixed(1)} `
        + `l${((rng() - 0.5) * iw * 0.06).toFixed(1)},${(groundH * 0.1).toFixed(1)}`;
      addInk('path', { d }, 0.8);
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

  // the winding path — the Moebius signature: a pale flat road from the
  // foreground to a vanishing point at the horizon, ink on both edges
  const vpX = ix + iw * (0.4 + rng() * 0.2);
  const baseW = iw * (0.2 + rng() * 0.08);
  const baseX = ix + iw * (0.32 + rng() * 0.36);
  const bendL = (rng() - 0.5) * iw * 0.14;
  const bendR = (rng() - 0.5) * iw * 0.14;
  const baseY2 = iy + ih;
  const pathD = `M${(baseX - baseW / 2).toFixed(1)},${baseY2.toFixed(1)} `
    + `C${(baseX - baseW / 2 + bendL).toFixed(1)},${(baseY2 - groundH * 0.55).toFixed(1)} ${(vpX - 3 + bendL * 0.3).toFixed(1)},${(horizonY + groundH * 0.12).toFixed(1)} ${(vpX - 2).toFixed(1)},${horizonY.toFixed(1)} `
    + `L${(vpX + 2).toFixed(1)},${horizonY.toFixed(1)} `
    + `C${(vpX + 3 + bendR * 0.3).toFixed(1)},${(horizonY + groundH * 0.12).toFixed(1)} ${(baseX + baseW / 2 + bendR).toFixed(1)},${(baseY2 - groundH * 0.55).toFixed(1)} ${(baseX + baseW / 2).toFixed(1)},${baseY2.toFixed(1)} Z`;
  fills += `<path d="${pathD}" fill="${PATH_COLOR}"/>`;
  addInk('path', { d: pathD }, 1.1);

  // 5. fog — a hard-edged, pale weather bank with a stepped top, menacing
  // by size, never by darkness; drawn behind the flora and the figure
  if (fog != null && fog > 0) {
    const fromLeft = rng() < 0.5;
    const fw = iw * (0.2 + (fog / 5) * 0.62);
    const fh = groundH * (0.3 + (fog / 5) * 0.85);
    const fx = fromLeft ? ix : ix + iw - fw;
    const baseTop = horizonY + groundH - fh;
    const steps = 4;
    const stepW = fw / steps;
    const heights = Array.from({ length: steps }, () => 0.5 + rng() * 0.5).sort((a, b) => (fromLeft ? b - a : a - b));
    let d = fromLeft ? `M${fx.toFixed(1)},${(horizonY + groundH).toFixed(1)} ` : `M${(fx + fw).toFixed(1)},${(horizonY + groundH).toFixed(1)} `;
    const xs = fromLeft ? fx : fx + fw;
    for (let i = 0; i < steps; i++) {
      const stepX = fromLeft ? xs + i * stepW : xs - i * stepW;
      const stepY = baseTop + fh * (1 - heights[i]) * 0.4;
      d += `L${stepX.toFixed(1)},${stepY.toFixed(1)} `;
      const nextX = fromLeft ? xs + (i + 1) * stepW : xs - (i + 1) * stepW;
      d += `L${nextX.toFixed(1)},${stepY.toFixed(1)} `;
    }
    d += `L${(fromLeft ? fx + fw : fx).toFixed(1)},${(horizonY + groundH).toFixed(1)} Z`;
    fills += `<path d="${d}" fill="${FOG}"/>`;
    addInk('path', { d }, 1.1);
  }

  // 6. flora — clumped in 1-2 loose groups on the ground plane, not
  // spread evenly; depth (near horizon = far = tiny, near bottom = large)
  // sets size, so at most one plant reads as foreground
  const n = Math.max(0, Math.min(5, habitsDone));
  if (n > 0) {
    const groups = n <= 2 || rng() < 0.55 ? 1 : 2;
    const centers = Array.from({ length: groups }, () => ix + iw * (0.22 + rng() * 0.56));
    const foregroundIdx = rng() < 0.6 ? 0 : -1;
    for (let i = 0; i < n; i++) {
      const g = i % groups;
      const depth = i === foregroundIdx ? 0.72 + rng() * 0.24 : 0.12 + rng() * 0.4;
      const fy = horizonY + groundH * depth;
      const fx = centers[g] + (rng() - 0.5) * iw * (0.05 + depth * 0.06);
      const size = Math.min(iw, ih) * (0.035 + 0.09 * depth);
      fills += drawFlora(rng, addInk, fx, fy, size, depth);
    }
  }

  // 7. the figure — tiny, standing mid-distance ON the path; a held hour
  // earns a monolith + long shadow
  const figFrac = 0.28 + rng() * 0.24; // how far up the path, 0=horizon..1=bottom
  const figH = ih * (0.022 + 0.02 * figFrac);
  const pathCenterX = vpX + (baseX - vpX) * figFrac;
  const figX = pathCenterX + (rng() - 0.5) * baseW * figFrac * 0.3;
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
  fills += figureMark(figX, figBaseY, figH);

  // 8. birds — a tick-mark per captured moment
  for (let i = 0; i < Math.min(moments, 8); i++) {
    const bx = ix + iw * (0.1 + rng() * 0.8);
    const by = skyTop + skyH * (0.12 + rng() * 0.45);
    const bw = iw * 0.018;
    const d = `M${(bx - bw).toFixed(1)},${by.toFixed(1)} Q${bx.toFixed(1)},${(by - bw * 0.9).toFixed(1)} ${(bx + bw).toFixed(1)},${by.toFixed(1)}`;
    addInk('path', { d, fill: 'none' }, 0.9);
  }

  // 9. print finish — grain over the paper (biased neutral, so it adds
  // texture without dimming the plate), then the ink (ghost, then real)
  const grainId = uid('grain');
  const grainSeed = Math.floor(rng() * 900) + 1;
  const defs = `<defs><filter id="${grainId}" x="-5%" y="-5%" width="110%" height="110%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${grainSeed}" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" `
    + `values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0" result="grey"/>`
    + `</filter></defs>`;
  // a neutral-grey noise field, blended with 'overlay' rather than
  // 'multiply': mid-grey pixels leave the plate unchanged, only the noise
  // itself (lighter and darker specks alike) reads as grain — it cannot
  // wash the whole plate dark the way a black multiply layer does.
  const grain = `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" `
    + `filter="url(#${grainId})" style="mix-blend-mode:overlay"/>`;

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
  svg += inkLayer(INK_GHOST, 0.45, slip, slip * 0.9); // misregistration ghost
  svg += inkLayer(INK, 1, 0, 0);                       // crisp ink, on top
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
