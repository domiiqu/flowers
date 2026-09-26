// farview.js — the turn. The printed plate is a card; the card is a portal;
// touching it turns it over and the far side takes the whole screen.
//
// The bleed is the argument, not decoration. The front face is bounded,
// committed, printable, hangs in the gallery. The back has no edges, is
// never twice the same, and cannot be printed. Same day, two states of
// matter — that difference is the double, and the reason the flip is worth
// building at all.
//
// Tier 1 of motion lives here: the plate breathes (a slow push, grain,
// a light that drifts) and answers tilt. Tiers 2 and 3 — true depth from
// the four parallax planes, and live inhabitants over the top — want a
// plate generated in separable layers, which is why the layer spec is in
// the image prompt from the first day.

import * as store from './store.js?v=22';

const PLATE_FIELD = 'Plate';

function h(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

// the place is CONTINUOUS: a day with no plate of its own is not a gap.
// Show the most recent painted plate at or before this date — which is
// exactly what "a place you visit" means.
function plateFor(dateISO) {
  const rows = (store.S.data.World || [])
    .filter((w) => w.f.Key && w.f.Key <= dateISO)
    .sort((a, b) => (a.f.Key < b.f.Key ? 1 : -1));
  for (const row of rows) {
    // the far side is impermanent by design: any edit regenerates it, and the
    // image field union-merges rather than replacing, so a day carries every
    // plate it has ever had. Always the newest — that impermanence is the
    // point, and showing a stale one quietly freezes the place in its first
    // render. store.latestImageUrl reads the generator's filename stamp
    // rather than trusting array position.
    const url = store.latestImageUrl(row.f[PLATE_FIELD]);
    if (url) return { url, from: row.f.Key, row };
  }
  return null;
}

// the dispatch is an aiText field: { state, value } when generated, a bare
// string when it isn't. Read both shapes rather than trusting one.
function textOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && typeof v.value === 'string') return v.value;
  return '';
}

let openLayer = null;

export function isOpen() { return !!openLayer; }

// open(dateISO, cardEl) — cardEl is the plate that was touched; the turn
// starts from exactly where it sits, so the card becomes the portal rather
// than merely linking to one.
export function open(dateISO, cardEl) {
  if (openLayer) return;

  const world = (store.S.data.World || []).find((w) => w.f.Key === dateISO);
  const plate = plateFor(dateISO);
  const specimen = (store.S.data.Specimens || []).find((x) => x.f.Key === dateISO);
  const dispatch = textOf(world && world.f.Dispatch);

  const layer = h('div', { class: 'far-layer', role: 'dialog', 'aria-label': 'the far side' });
  const stage = h('div', { class: 'far-stage' });
  const back = h('div', { class: 'far-back' });

  // the plate, bleeding. object-fit: cover — the far side has no edges, so
  // it is never letterboxed even when the image and the screen disagree.
  const art = h('div', { class: 'far-art' });
  if (plate) {
    const img = h('img', { class: 'far-img', src: plate.url, alt: '' });
    art.appendChild(img);
  } else {
    art.appendChild(h('div', { class: 'far-unpainted' }));
  }
  back.appendChild(art);
  back.appendChild(h('div', { class: 'far-wash' }));
  back.appendChild(h('div', { class: 'far-grain' }));

  // the words sit ON the world, never in a panel beside it.
  const say = h('div', { class: 'far-say' });
  if (dispatch) say.appendChild(h('p', { class: 'far-dispatch' }, dispatch));
  if (specimen && specimen.f.Name) {
    const found = h('p', { class: 'far-found italic' }, `found — ${specimen.f.Name}`);
    // the moment of collecting. The whole layer closes on click, so this
    // has to stop its own event or touching the find would turn the card
    // back instead of opening what she carried out.
    found.addEventListener('click', (e) => { e.stopPropagation(); openSpecimen(); });
    say.appendChild(found);
  }
  // no legend, ever. The only affordance is how to leave.
  say.appendChild(h('p', { class: 'far-exit italic dim' }, 'touch to turn back'));
  back.appendChild(say);

  stage.appendChild(back);
  layer.appendChild(stage);
  document.body.appendChild(layer);

  // The turn starts from the card's own position and size, so the plate
  // appears to rotate where it sits and then swell to fill the screen.
  //
  // Driven by the Web Animations API, NOT a CSS transition. A transition
  // here depends on the browser resolving style between the start and end
  // writes, and it does not reliably do that for an element inserted in
  // the same task — the two writes coalesce, no transitionstart fires, and
  // the card silently teleports open instead of turning. animate() takes
  // its keyframes literally and cannot be coalesced away.
  const EASE = 'cubic-bezier(.22, .68, .28, 1)';
  function cardTransform() {
    const r = cardEl && cardEl.getBoundingClientRect ? cardEl.getBoundingClientRect() : null;
    if (!r || !r.width) return 'rotateY(-180deg)';
    const sx = r.width / window.innerWidth;
    const sy = r.height / window.innerHeight;
    const dx = r.left + r.width / 2 - window.innerWidth / 2;
    const dy = r.top + r.height / 2 - window.innerHeight / 2;
    return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotateY(-180deg)`;
  }
  const shut = cardTransform();
  layer.style.opacity = '1';
  layer.classList.add('open');
  layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease' });
  stage.animate(
    [{ transform: shut }, { transform: 'none' }],
    { duration: 560, easing: EASE },
  );

  // ---- tier 1: the plate breathes, and answers tilt --------------------
  // a single flat plate cannot give true parallax; this is the honest
  // version of it — a slow push and a small lean — and it is also the
  // hook tiers 2 and 3 will attach to once the plate arrives in layers.
  const img = art.querySelector('.far-img');
  let tiltX = 0, tiltY = 0, rafId = null, t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    // a very slow drift, never looping visibly: the place is alive but
    // it is not performing for her.
    const push = 1.06 + Math.sin(t / 37) * 0.012;
    const driftX = Math.sin(t / 53) * 6 + tiltX;
    const driftY = Math.cos(t / 61) * 5 + tiltY;
    if (img) img.style.transform =
      `scale(${push}) translate3d(${driftX}px, ${driftY}px, 0)`;
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  // she lives on iPad and phone: tilt is the first-class hand here.
  // Pointer is the desktop fallback. Neither is required.
  function onTilt(e) {
    if (e.gamma == null || e.beta == null) return;
    tiltX = Math.max(-14, Math.min(14, e.gamma * 0.5));
    tiltY = Math.max(-14, Math.min(14, (e.beta - 45) * 0.35));
  }
  function onMove(e) {
    const cx = (e.clientX / window.innerWidth) - 0.5;
    const cy = (e.clientY / window.innerHeight) - 0.5;
    tiltX = cx * -16; tiltY = cy * -12;
  }
  window.addEventListener('deviceorientation', onTilt);
  window.addEventListener('pointermove', onMove);

  // ---- the find --------------------------------------------------------
  // A specimen is NOT the place. The place bleeds — cover, no edges, it
  // cannot be held or printed. A specimen is a thing she carried back out,
  // so it is contained: it has edges, it sits on the dimmed world rather
  // than replacing it, and it can be put down again without leaving.
  function openSpecimen() {
    if (!specimen || back.querySelector('.spec-layer')) return;
    const url = store.latestImageUrl(specimen.f.Image);
    const spec = h('div', { class: 'spec-layer' });
    const card = h('div', { class: 'spec-card' });
    if (url) card.appendChild(h('img', { class: 'spec-img', src: url, alt: '' }));
    card.appendChild(h('p', { class: 'spec-name' }, specimen.f.Name || ''));
    // provenance, never a stat block: what the day was, in the far side's
    // own terms, and how rare that is against her own history.
    if (specimen.f.Conditions) {
      card.appendChild(h('p', { class: 'spec-cond italic' }, specimen.f.Conditions));
    }
    if (specimen.f['Rarity note']) {
      card.appendChild(h('p', { class: 'spec-rare italic' }, specimen.f['Rarity note']));
    }
    spec.appendChild(card);
    spec.addEventListener('click', (e) => { e.stopPropagation(); closeSpecimen(); });
    back.appendChild(spec);
    spec.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' });
    card.animate(
      [{ transform: 'translateY(20px) scale(0.97)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 420, easing: EASE },
    );
  }

  function closeSpecimen() {
    const spec = back.querySelector('.spec-layer');
    if (!spec || spec.dataset.closing) return;
    spec.dataset.closing = '1';
    const a = spec.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease' });
    a.onfinish = () => spec.remove();
    setTimeout(() => spec.remove(), 420);
  }

  // ---- leaving ---------------------------------------------------------
  let closing = false;
  function close() {
    if (closing) return;
    closing = true;
    // re-read the card's rect rather than reusing the one from opening:
    // the page may have scrolled or resized while she was on the far side,
    // and the plate must turn back into wherever the card actually is now.
    const back0 = cardTransform();
    layer.style.opacity = '0';
    layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease' });
    const turn = stage.animate(
      [{ transform: 'none' }, { transform: back0 }],
      { duration: 560, easing: EASE, fill: 'forwards' },
    );
    const done = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('deviceorientation', onTilt);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
      layer.remove();
      openLayer = null;
      document.body.classList.remove('far-open');
    };
    turn.onfinish = done;
    // a cancelled or unsupported animation must never strand the layer
    // over the whole screen with no way back.
    setTimeout(done, 700);
  }
  // Escape unwinds one layer at a time — put the specimen down first, and
  // only then turn the card back.
  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (back.querySelector('.spec-layer')) { closeSpecimen(); return; }
    close();
  }
  window.addEventListener('keydown', onKey);
  layer.addEventListener('click', close);

  document.body.classList.add('far-open');
  openLayer = { close };
  return close;
}
