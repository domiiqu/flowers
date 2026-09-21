// sigil.js — the form a thing has before it has taken its form.
//
// An unread reading has no dark face yet; that is what reading it earns.
// But it must not be a blank, either — a shelf of identical grey rectangles
// says nothing, and fetching a real thumbnail is not available to us: a
// link preview needs the page, which a static browser app cannot request
// (CORS), and a favicon service would be both an external dependency this
// repo does not take and a quiet leak of what she reads.
//
// So: formless but SPECIFIC. A sigil drawn deterministically from the url
// itself — no network, no dependency, every link visibly its own, and the
// same link always the same mark. It reads as something under the surface
// that has not surfaced.

function hash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

// a small deterministic generator — never Math.random(), or a thing would
// wear a different face every time she opened the cupboard.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SVG = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
};

// the night register the far side is drawn in — pink over cold green, the
// colour sitting in the air rather than on the objects.
const INKS = [
  ['#e8a0c8', '#2a1230'],
  ['#9fd8c4', '#0e2a26'],
  ['#c8a6e0', '#1b1430'],
  ['#e0b48c', '#2a1c18'],
  ['#8fb8e8', '#101c2e'],
];

export function sigilSVG(seedText, { w = 200, h = 250 } = {}) {
  const seed = hash(seedText);
  const r = rng(seed);
  const [ink, ground] = INKS[(seed >>> 11) % INKS.length];

  const svg = el('svg', {
    viewBox: `0 0 ${w} ${h}`, width: '100%', height: '100%',
    preserveAspectRatio: 'xMidYMid slice', role: 'presentation', focusable: 'false',
  });

  const gid = `g${seed.toString(36)}`;
  const defs = el('defs', {});
  const grad = el('radialGradient', { id: gid, cx: `${20 + r() * 60}%`, cy: `${18 + r() * 40}%`, r: '78%' });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': ink, 'stop-opacity': '0.5' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': ground, 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  svg.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: ground }));
  svg.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${gid})` }));

  // a horizon it has not quite reached
  const hy = h * (0.52 + r() * 0.22);
  svg.appendChild(el('line', {
    x1: 0, y1: hy, x2: w, y2: hy, stroke: ink, 'stroke-opacity': 0.3, 'stroke-width': 1,
  }));

  // standing marks — the count and lean come from the url, so two links are
  // never the same and one link is never different
  const n = 3 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const x = w * (0.12 + (i + r() * 0.6) / (n + 0.4) * 0.82);
    const tall = h * (0.12 + r() * 0.36);
    const lean = (r() - 0.5) * 14;
    svg.appendChild(el('path', {
      d: `M ${x.toFixed(1)} ${hy.toFixed(1)} C ${(x + lean * 0.3).toFixed(1)} ${(hy - tall * 0.5).toFixed(1)}, `
        + `${(x + lean).toFixed(1)} ${(hy - tall * 0.8).toFixed(1)}, ${(x + lean).toFixed(1)} ${(hy - tall).toFixed(1)}`,
      fill: 'none', stroke: ink, 'stroke-opacity': (0.4 + r() * 0.45).toFixed(2),
      'stroke-width': (1.3 + r() * 2.2).toFixed(2), 'stroke-linecap': 'round',
    }));
  }

  // a disc that has not finished arriving
  const cx = w * (0.2 + r() * 0.6);
  const cy = hy - h * (0.18 + r() * 0.3);
  const rad = w * (0.055 + r() * 0.07);
  svg.appendChild(el('circle', {
    cx: cx.toFixed(1), cy: cy.toFixed(1), r: rad.toFixed(1),
    fill: ink, 'fill-opacity': (0.18 + r() * 0.26).toFixed(2),
    stroke: ink, 'stroke-opacity': 0.55, 'stroke-width': 1.1,
  }));

  return svg;
}
