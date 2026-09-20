// views.js — the rooms. each mount* function renders into `app` and
// returns a cleanup function (timers, listeners) called before the router
// moves on.

import * as store from './store.js';
import { dayPrint } from './print.js';
import { computeWorldState } from './world.js';

// ------------------------------------------------------------------ dom

function h(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v; // only ever fed markup we generated ourselves
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };

export function whisper(text, ms = 3600) {
  const el = document.getElementById('whisper');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(whisper._t);
  whisper._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ------------------------------------------------------------- hold-to-act

// press-and-hold: the ceremonial verb everywhere. survives a finger
// wobbling a few pixels — only real movement (~12px) cancels it, so it
// works as well from a thumb on glass as a mouse.
const WOBBLE = 12;
export function holdToAct(el, { ms = 900, onComplete, onStart, onCancel } = {}) {
  let raf = null, startT = 0, active = false, sx = 0, sy = 0, pid = null;
  function frame(t) {
    if (!active) return;
    const p = Math.min(1, (t - startT) / ms);
    el.style.setProperty('--p', p.toFixed(3));
    if (p >= 1) { active = false; el.style.setProperty('--p', 0); onComplete && onComplete(); return; }
    raf = requestAnimationFrame(frame);
  }
  function move(e) {
    if (!active || (pid != null && e.pointerId !== pid)) return;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > WOBBLE) stop();
  }
  function start(e) {
    if (active) return;
    e.preventDefault && e.preventDefault();
    active = true; startT = performance.now();
    sx = e.clientX; sy = e.clientY; pid = e.pointerId;
    try { el.setPointerCapture(pid); } catch {}
    onStart && onStart();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    el.style.setProperty('--p', 0);
    onCancel && onCancel();
  }
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.classList.add('hold');
  return () => {
    el.removeEventListener('pointerdown', start);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', stop);
    el.removeEventListener('pointercancel', stop);
  };
}

// swipe left/right anywhere calm on a page — a soft alternative to the
// header arrows, never fighting a tap on something interactive.
export function bindSwipe(root, { onLeft, onRight, threshold = 56 }) {
  let active = false, sx = 0, sy = 0, pid = null;
  function interactive(t) {
    // the timeline is its own horizontal-drag surface (sliding a placed
    // instrument, stretching a span's handle) — it must never also read
    // as a swipe-to-change-day gesture, so the whole region is excluded
    // here on top of each drag using setPointerCapture.
    return t.closest && t.closest('button, a, input, textarea, select, .timeline-section');
  }
  function down(e) {
    if (interactive(e.target)) { active = false; return; }
    active = true; sx = e.clientX; sy = e.clientY; pid = e.pointerId;
  }
  function up(e) {
    if (!active || e.pointerId !== pid) return;
    active = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) onLeft(); else onRight();
    }
  }
  function cancel() { active = false; }
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', cancel);
  return () => {
    root.removeEventListener('pointerdown', down);
    root.removeEventListener('pointerup', up);
    root.removeEventListener('pointercancel', cancel);
  };
}

// ==================================================================== day

const GLYPHS = { sun: '☀', moon: '☾', dot: '•' };
function glyphChar(g) { return GLYPHS[g] || '•'; }

function fmtClock(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  let hh = Math.floor(min / 60);
  const mm = min % 60;
  const ap = hh >= 12 ? 'pm' : 'am';
  hh = hh % 12; if (hh === 0) hh = 12;
  return `${hh}:${String(mm).padStart(2, '0')}${ap}`;
}
function fmtDuration(mins) {
  mins = Math.max(0, Math.round(mins));
  const hh = Math.floor(mins / 60), mm = mins % 60;
  if (hh && mm) return `${hh}h ${mm}m`;
  if (hh) return `${hh}h`;
  return `${mm}m`;
}
function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// a small reusable inline "+ add" control: a button that swaps to a text
// field (house .field style) with Enter/✓ to commit, Esc/blur to cancel.
// She runs this as an iOS standalone web app, where window.prompt() can
// be silently suppressed — so this never uses it.
function buildInlineTextAdd(btnClass, placeholder, onSubmit) {
  const wrap = h('div', { class: 'inline-add' });
  function showButton() {
    clear(wrap);
    const btn = h('button', { class: 'plain italic ' + btnClass }, '+ add');
    btn.addEventListener('click', showField);
    wrap.appendChild(btn);
  }
  function showField() {
    clear(wrap);
    let done = false;
    const input = h('input', { class: 'field inline-add-field', placeholder });
    function commit() {
      const name = input.value.trim();
      if (!name) return cancel();
      done = true;
      onSubmit(name);
      showButton();
    }
    function cancel() {
      if (done) return;
      done = true;
      showButton();
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    // the blur-vs-click race: tapping ✓ blurs the input first: defer the
    // cancel so a synchronous click on ✓ (which sets `done`) wins.
    input.addEventListener('blur', () => setTimeout(cancel, 120));
    const ok = h('button', { class: 'plain inline-add-ok' }, '✓');
    ok.addEventListener('pointerdown', (e) => e.preventDefault());
    ok.addEventListener('click', commit);
    wrap.appendChild(input);
    wrap.appendChild(ok);
    setTimeout(() => input.focus(), 0);
  }
  showButton();
  return wrap;
}

// same idea, for a new instrument: name, then a tiny glyph pick (☀/☾/·)
// in place of the "+" chip — no window.prompt() anywhere in this flow.
function buildInstrumentAdd(onSubmit) {
  const wrap = h('div', { class: 'inline-add' });
  function showButton() {
    clear(wrap);
    const btn = h('button', { class: 'plain italic instrument-chip add' }, '+ instrument');
    btn.addEventListener('click', showField);
    wrap.appendChild(btn);
  }
  function showField() {
    clear(wrap);
    // a three-stage phase, not a boolean: moving from the text field to
    // the glyph pick removes (and so blurs) the input as part of the very
    // same keydown handler that advances the phase — a boolean "done"
    // flag set only at the *final* commit stays false through that
    // transition, so the input's own deferred blur-cancel (see below)
    // would fire 120ms later and wipe the glyph pick out from under her
    // thumb. checking the phase at callback time (not registration time)
    // sidesteps that regardless of whether blur fires sync or async.
    let phase = 'input'; // 'input' -> 'glyphpick' -> 'closed'
    const input = h('input', { class: 'field inline-add-field', placeholder: 'a new instrument…' });
    function cancel() { if (phase === 'closed') return; phase = 'closed'; showButton(); }
    function toGlyphPick(name) {
      phase = 'glyphpick';
      clear(wrap);
      wrap.appendChild(h('span', { class: 'dim italic inline-add-label' }, name));
      for (const g of ['sun', 'moon', 'dot']) {
        const b = h('button', { class: 'plain glyph-pick' }, glyphChar(g));
        b.addEventListener('click', () => { phase = 'closed'; onSubmit(name, g); showButton(); });
        wrap.appendChild(b);
      }
      setTimeout(() => { if (phase === 'glyphpick') { phase = 'closed'; onSubmit(name, 'dot'); showButton(); } }, 6000);
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) return cancel();
        toGlyphPick(name);
      } else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (phase === 'input') cancel(); }, 120));
    wrap.appendChild(input);
    setTimeout(() => input.focus(), 0);
  }
  showButton();
  return wrap;
}

export function mountDay(app, date) {
  const today = store.todayISO();
  const root = h('div', { class: 'room' });
  app.appendChild(root);

  const wallet = h('button', { class: 'wallet' });
  app.appendChild(wallet);
  const unbindWalletHold = holdToAct(wallet, {
    ms: 900,
    onComplete: async () => {
      const got = await store.gather();
      renderWallet();
      if (got) whisper(`${got} seed${got === 1 ? '' : 's'} gathered.`, 2200);
    },
  });

  const header = h('div', { class: 'day-header' });
  const title = h('h1', {}, store.fmtDate(date));
  header.appendChild(h('button', { class: 'plain', 'aria-label': 'previous day',
    onclick: () => (location.hash = `#/day/${store.addDays(date, -1)}`) }, '‹'));
  header.appendChild(title);
  header.appendChild(h('button', { class: 'plain', 'aria-label': 'next day',
    onclick: () => (location.hash = `#/day/${store.addDays(date, 1)}`) }, '›'));
  root.appendChild(header);

  if (date !== today) {
    root.appendChild(h('div', { class: 'today-link' },
      h('button', { class: 'plain italic', onclick: () => (location.hash = '#/day/') }, 'today')));
  }

  // the plate — the day itself, painted
  const plate = h('div', { class: 'plate' });
  root.appendChild(plate);

  // day-long events — booleans true for the whole day (the folded-in
  // habits, plus period/wfh); these drive the oak's leaf mass
  const dayEvents = h('div', { class: 'day-events' });
  root.appendChild(dayEvents);

  // the timeline — instruments placed on a line, midnight to midnight.
  // its own drag surface: excluded from swipe-to-change-day (see
  // bindSwipe's interactive() check) and every drag inside it captures
  // the pointer, so a horizontal slide never bubbles into that handler.
  const timelineSection = h('div', { class: 'timeline-section' });
  root.appendChild(timelineSection);
  const rail = h('div', { class: 'instrument-rail' });
  const track = h('div', { class: 'timeline-track' });
  const ticksLayer = h('div', { class: 'tl-ticks' });
  const line = h('div', { class: 'tl-line' });
  const marksLayer = h('div', { class: 'tl-marks' });
  track.appendChild(ticksLayer);
  track.appendChild(line);
  track.appendChild(marksLayer);
  timelineSection.appendChild(rail);
  timelineSection.appendChild(track);
  for (let hr = 0; hr <= 24; hr += 6) {
    const pct = (hr / 24) * 100;
    const col = h('div', { class: 'tick-col', style: `left:${pct}%` });
    col.appendChild(h('div', { class: 'tick' }));
    if (hr === 6 || hr === 12 || hr === 18) col.appendChild(h('span', { class: 'tick-label' }, String(hr)));
    ticksLayer.appendChild(col);
  }

  // personal | work — six 1-5 scales
  const domains = h('div', { class: 'domains' });
  root.appendChild(domains);

  // a line for the day
  const notesBlock = h('div', { class: 'notes-block' });
  root.appendChild(notesBlock);

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/shop' }, 'the shop'),
    h('a', { href: '#/hour' }, 'the hour'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  app.appendChild(hints);

  function renderWallet() {
    clear(wallet);
    wallet.appendChild(h('span', { class: 'dot' }, '◦ '));
    wallet.appendChild(document.createTextNode(String(store.wallet())));
    const pending = store.pendingTicks();
    if (pending.length) {
      const waiting = pending.reduce((a, t) => a + (t.f.Seeds || 0), 0);
      wallet.appendChild(document.createTextNode(` · ${waiting} waiting — hold to gather`));
    }
  }

  function plateSize() {
    const w = Math.round(root.clientWidth || plate.clientWidth || window.innerWidth - 40);
    const hh = Math.round((window.innerHeight || 700) * 0.6);
    return [Math.max(200, w), Math.max(240, hh)];
  }

  function renderPlate(crossfade = false) {
    const [pw, ph] = plateSize();
    if (crossfade) {
      plate.style.opacity = '0';
      setTimeout(() => {
        plate.innerHTML = dayPrint(computeWorldState(date, store.S.data), pw, ph);
        plate.style.opacity = '1';
      }, 180);
    } else {
      plate.innerHTML = dayPrint(computeWorldState(date, store.S.data), pw, ph);
    }
  }

  function onResize() { renderPlate(); }
  window.addEventListener('resize', onResize);

  // -------------------------------------------------------- day-long events

  function renderDayEvents() {
    clear(dayEvents);
    for (const marker of store.activeMarkers()) {
      const lit = !!store.markFor(date, marker.f.Name);
      const btn = h('button', { class: 'plain italic day-event' + (lit ? ' lit' : '') }, marker.f.Name || '');
      btn.addEventListener('click', async () => {
        await store.toggleMark(date, marker);
        renderDayEvents();
        renderPlate(true);
        renderWallet();
      });
      dayEvents.appendChild(btn);
    }
    dayEvents.appendChild(buildInlineTextAdd('day-event add', 'a new day-event…', async (name) => {
      await store.addMarker(name);
      renderDayEvents();
    }));
  }

  // ------------------------------------------------------------- the timeline

  function minutesToPct(min) { return Math.max(0, Math.min(100, (min / 1440) * 100)); }

  function glyphFor(instrumentName) {
    const inst = store.S.data.Instruments.find((i) => i.f.Name === instrumentName);
    return glyphChar(inst && inst.f.Glyph);
  }

  async function dropInstrument(instrument, start) {
    const end = instrument.f.Spans ? Math.min(1439, start + 30) : undefined;
    await store.placeInstrument({ instrument: instrument.f.Name, date, start, end });
    renderMarks();
    renderPlate(true);
  }

  // dragging a rail chip: pointerdown arms a "pending drag" watch, not a
  // drag. moving mostly DOWN first (or a short hold with no sideways
  // movement) engages it — capture the pointer, show a floating glyph
  // ghost, suppress the rail's own scroll for this gesture. moving
  // mostly SIDEWAYS first instead does nothing further (no capture, no
  // preventDefault), so the rail's native horizontal scroll just
  // happens, untouched. dropping while dragging, with the pointer over
  // (or near) the track, places the instrument at that x's time.
  function bindChipDrag(chipBody, instrument) {
    let pid = null, sx = 0, sy = 0, dragging = false, holdTimer = null;
    function reset() {
      clearTimeout(holdTimer);
      pid = null; dragging = false;
      ghost.hidden = true;
    }
    function moveGhost(x, y) {
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
    }
    function engage(e) {
      if (dragging) return;
      dragging = true;
      try { chipBody.setPointerCapture(pid); } catch {}
      ghost.hidden = false;
      ghost.textContent = glyphChar(instrument.f.Glyph);
      moveGhost(e.clientX, e.clientY);
    }
    function down(e) {
      if (pid != null) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY; dragging = false;
      holdTimer = setTimeout(() => engage(e), 150);
    }
    function move(e) {
      if (pid !== e.pointerId) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!dragging) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) engage(e);
        else if (Math.abs(dx) > 10) { reset(); return; }
        else return;
      }
      e.preventDefault();
      moveGhost(e.clientX, e.clientY);
    }
    function up(e) {
      if (pid !== e.pointerId) return;
      const wasDragging = dragging;
      const trackRect = track.getBoundingClientRect();
      reset();
      if (!wasDragging) return;
      const withinX = e.clientX >= trackRect.left - 20 && e.clientX <= trackRect.right + 20;
      const withinY = e.clientY >= trackRect.top - 40 && e.clientY <= trackRect.bottom + 60;
      if (!withinX || !withinY) return; // dropped away from the line — cancelled
      const frac = Math.max(0, Math.min(1, (e.clientX - trackRect.left) / trackRect.width));
      dropInstrument(instrument, Math.round(frac * 1439));
    }
    chipBody.addEventListener('pointerdown', down);
    chipBody.addEventListener('pointermove', move);
    chipBody.addEventListener('pointerup', up);
    chipBody.addEventListener('pointercancel', reset);
  }

  function positionMarkEl(el, row) {
    el.style.left = `${minutesToPct(row.f.Start)}%`;
    if (row.f.End != null) el.style.width = `${minutesToPct(row.f.End - row.f.Start)}%`;
  }

  // a placed mark: dragging its body slides Start (and End, preserving
  // duration); dragging its handle (spans only) adjusts End alone. a tap
  // (near-zero movement) opens the edit sheet instead. setPointerCapture
  // + stopPropagation on every one of these so a horizontal slide never
  // reaches bindSwipe — belt & suspenders alongside .timeline-section
  // already being excluded from swipe's own interactive() check.
  function bindMarkDrag(el, row, handle) {
    const WOBBLE = 8;
    let pid = null, sx = 0, sy = 0, moved = false, startStart = 0, startEnd = null;
    function down(e) {
      if (pid != null) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false;
      startStart = row.f.Start; startEnd = row.f.End;
      try { el.setPointerCapture(pid); } catch {}
      e.stopPropagation();
    }
    function move(e) {
      if (pid !== e.pointerId) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && (Math.abs(dx) > WOBBLE || Math.abs(dy) > WOBBLE)) moved = true;
      if (!moved) return;
      e.preventDefault();
      const trackRect = track.getBoundingClientRect();
      const deltaMin = (dx / trackRect.width) * 1440;
      const newStart = Math.max(0, Math.min(1439, Math.round(startStart + deltaMin)));
      row.f.Start = newStart;
      if (startEnd != null) row.f.End = newStart + (startEnd - startStart);
      positionMarkEl(el, row);
    }
    function up(e) {
      if (pid !== e.pointerId) return;
      pid = null;
      if (!moved) { openInstrumentSheet(row); return; }
      const patch = { Start: row.f.Start };
      if (row.f.End != null) patch.End = row.f.End;
      store.adjustTimeline(row.f.Key, patch);
      renderPlate(true);
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { pid = null; });

    if (!handle) return;
    let hpid = null, hsx = 0, hStartEnd = 0;
    function hdown(e) {
      if (hpid != null) return;
      hpid = e.pointerId; hsx = e.clientX; hStartEnd = row.f.End;
      try { handle.setPointerCapture(hpid); } catch {}
      e.stopPropagation();
    }
    function hmove(e) {
      if (hpid !== e.pointerId) return;
      e.preventDefault();
      const trackRect = track.getBoundingClientRect();
      const deltaMin = ((e.clientX - hsx) / trackRect.width) * 1440;
      row.f.End = Math.max(row.f.Start + 5, Math.min(1439, Math.round(hStartEnd + deltaMin)));
      positionMarkEl(el, row);
    }
    function hup(e) {
      if (hpid !== e.pointerId) return;
      hpid = null;
      store.adjustTimeline(row.f.Key, { End: row.f.End });
      renderPlate(true);
    }
    handle.addEventListener('pointerdown', hdown);
    handle.addEventListener('pointermove', hmove);
    handle.addEventListener('pointerup', hup);
    handle.addEventListener('pointercancel', () => { hpid = null; });
  }

  function renderMarks() {
    clear(marksLayer);
    for (const row of store.timelineFor(date)) {
      const glyph = glyphFor(row.f.Instrument);
      if (row.f.End != null) {
        const span = h('div', { class: 'tl-span' });
        positionMarkEl(span, row);
        span.appendChild(h('span', { class: 'tl-span-glyph' }, glyph));
        const handle = h('button', { class: 'plain tl-handle', 'aria-label': 'adjust duration' });
        span.appendChild(handle);
        bindMarkDrag(span, row, handle);
        marksLayer.appendChild(span);
      } else {
        const mark = h('button', { class: 'plain tl-mark' }, glyph);
        positionMarkEl(mark, row);
        bindMarkDrag(mark, row, null);
        marksLayer.appendChild(mark);
      }
    }
  }

  function renderRail() {
    clear(rail);
    for (const inst of store.activeInstruments()) {
      const chip = h('div', { class: 'instrument-chip' });
      const body = h('button', { class: 'plain instrument-chip-body' }, [
        h('span', { class: 'glyph' }, glyphChar(inst.f.Glyph)),
        h('span', { class: 'name' }, inst.f.Name),
      ]);
      chip.appendChild(body);
      if (date === today) {
        const nowTap = h('button', { class: 'plain now-tap' }, 'now');
        nowTap.addEventListener('click', (e) => { e.stopPropagation(); dropInstrument(inst, nowMinutes()); });
        chip.appendChild(nowTap);
      }
      bindChipDrag(body, inst);
      rail.appendChild(chip);
    }
    rail.appendChild(buildInstrumentAdd(async (name, glyph) => {
      await store.addInstrument(name, glyph);
      renderRail();
    }));
  }

  // the floating drag ghost — fixed to the viewport, follows the pointer
  const ghost = h('div', { class: 'tl-ghost', hidden: true });
  app.appendChild(ghost);

  // the instrument edit sheet — its own small sheet (not the retired
  // moment-sheet): time (+ duration for a span), a note, delete. Start/
  // End are edited by re-dragging on the line itself, not here.
  const instBackdrop = h('div', { class: 'instrument-backdrop' });
  const instSheet = h('div', { class: 'instrument-sheet' });
  app.appendChild(instBackdrop);
  app.appendChild(instSheet);
  function closeInstrumentSheet() {
    instSheet.classList.remove('open');
    instBackdrop.classList.remove('open');
  }
  instBackdrop.addEventListener('click', closeInstrumentSheet);

  function openInstrumentSheet(row) {
    clear(instSheet);
    const top = h('div', { class: 'sheet-top' });
    top.appendChild(h('div', { class: 'sheet-handle' }));
    const closeBtn = h('button', { class: 'sheet-close plain', 'aria-label': 'close' }, '✕');
    closeBtn.addEventListener('click', closeInstrumentSheet);
    top.appendChild(closeBtn);
    instSheet.appendChild(top);

    instSheet.appendChild(h('div', { class: 'instrument-sheet-name italic' }, row.f.Instrument));
    const timeText = row.f.End != null
      ? `${fmtClock(row.f.Start)} – ${fmtClock(row.f.End)} · ${fmtDuration(row.f.End - row.f.Start)}`
      : fmtClock(row.f.Start);
    instSheet.appendChild(h('div', { class: 'instrument-sheet-time dim italic' }, timeText));

    const noteArea = h('textarea', { class: 'field', placeholder: 'a note…' });
    noteArea.value = row.f.Note || '';
    noteArea.addEventListener('blur', () => store.adjustTimeline(row.f.Key, { Note: noteArea.value }));
    instSheet.appendChild(noteArea);

    const delBtn = h('button', { class: 'btn instrument-sheet-delete' }, 'delete');
    delBtn.addEventListener('click', async () => {
      await store.removeTimeline(row.f.Key);
      closeInstrumentSheet();
      renderMarks();
      renderPlate(true);
    });
    instSheet.appendChild(delBtn);

    instSheet.classList.add('open');
    instBackdrop.classList.add('open');
  }

  // ------------------------------------------------------- personal | work

  const AXES = ['alignment', 'novelty', 'agency'];
  function renderDomains() {
    clear(domains);
    for (const domain of ['personal', 'work']) {
      const col = h('div', { class: 'domain-col' });
      col.appendChild(h('h3', { class: 'italic' }, domain));
      for (const axis of AXES) {
        const rowEl = h('div', { class: 'rating-row' });
        rowEl.appendChild(h('span', { class: 'rating-label italic dim' }, axis));
        const dotsWrap = h('div', { class: 'rating-dots' });
        rowEl.appendChild(dotsWrap);
        function paintDots() {
          clear(dotsWrap);
          const rec = store.ratingFor(date, domain, axis);
          const val = rec ? rec.f.Value || 0 : 0;
          for (let n = 1; n <= 5; n++) {
            const dot = h('button', { class: 'rating-dot' + (n <= val ? ' on' : ''), 'aria-label': `${axis} ${n}` });
            dot.addEventListener('click', async () => {
              await store.setRating(date, domain, axis, n);
              paintDots();
            });
            dotsWrap.appendChild(dot);
          }
        }
        paintDots();
        col.appendChild(rowEl);
      }
      domains.appendChild(col);
    }
  }

  // --------------------------------------------------------------- notes

  function renderNotes() {
    clear(notesBlock);
    const day = store.dayFor(date);
    const ta = h('textarea', { class: 'field notes-field', placeholder: 'a line for the day…' });
    ta.value = (day && day.f.Note) || '';
    ta.addEventListener('blur', () => store.saveDay(date, { Note: ta.value }));
    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const start = ta.selectionStart, end = ta.selectionEnd, value = ta.value, insert = '\n• ';
      ta.value = value.slice(0, start) + insert + value.slice(end);
      const pos = start + insert.length;
      ta.setSelectionRange(pos, pos);
    });
    notesBlock.appendChild(ta);
  }

  renderWallet();
  renderPlate();
  renderDayEvents();
  renderRail();
  renderMarks();
  renderDomains();
  renderNotes();

  const unbindSwipe = bindSwipe(root, {
    onLeft: () => (location.hash = `#/day/${store.addDays(date, 1)}`),
    onRight: () => (location.hash = `#/day/${store.addDays(date, -1)}`),
  });

  return () => {
    unbindSwipe();
    unbindWalletHold();
    window.removeEventListener('resize', onResize);
  };
}

// =================================================================== shop

export function mountShop(app) {
  const root = h('div', { class: 'room' });
  app.appendChild(root);
  root.appendChild(h('div', { class: 'meadow-title italic' }, 'the shop'));
  const walletEl = h('div', { class: 'shop-wallet' });
  root.appendChild(walletEl);
  const goGet = h('div', { class: 'go-get' });
  root.appendChild(goGet);
  const shelf = h('div', { class: 'shelf' });
  root.appendChild(shelf);
  const redemptions = h('div', { class: 'redemptions' });
  root.appendChild(redemptions);

  function renderWallet() {
    walletEl.textContent = `◦ ${store.wallet()} seeds`;
  }
  function renderShelf() {
    clear(shelf);
    const items = store.activeShop();
    if (!items.length) {
      shelf.appendChild(h('div', { class: 'dim italic' }, 'the shelf is bare — tend to stock it.'));
      return;
    }
    const w = store.wallet();
    for (const item of items) {
      const cant = w < (item.f.Cost || 0);
      const row = h('div', { class: 'shop-item' + (cant ? ' cant' : '') });
      row.appendChild(h('span', { class: 'sign' }, item.f.Sign || '·'));
      row.appendChild(h('span', { class: 'name italic' }, item.f.Name || ''));
      row.appendChild(h('span', { class: 'cost' }, `${item.f.Cost || 0}`));
      if (item.f.Link) {
        const link = h('a', { class: 'link-out', href: item.f.Link, target: '_blank', rel: 'noopener' }, '↗');
        link.addEventListener('pointerdown', (e) => e.stopPropagation());
        link.addEventListener('click', (e) => e.stopPropagation());
        row.appendChild(link);
      }
      shelf.appendChild(row);
      holdToAct(row, {
        ms: 900,
        onComplete: async () => {
          const ok = await store.redeem(item);
          if (ok) {
            whisper(`${item.f.Name} — yours.`, 2200);
            renderGoGet(item);
          }
          renderWallet(); renderShelf(); renderRedemptions();
        },
      });
    }
  }
  function renderGoGet(item) {
    clear(goGet);
    if (!item.f.Link) return;
    const a = h('a', { class: 'go-get-link italic', href: item.f.Link, target: '_blank', rel: 'noopener' }, 'go get it ↗');
    a.addEventListener('click', () => setTimeout(() => clear(goGet), 300));
    goGet.appendChild(a);
    setTimeout(() => clear(goGet), 9000);
  }
  function renderRedemptions() {
    clear(redemptions);
    const rows = [...store.S.data.Redemptions].sort((a, b) => (a.f.Key < b.f.Key ? 1 : -1)).slice(0, 6);
    if (!rows.length) return;
    redemptions.appendChild(h('div', { class: 'dim italic' }, 'what the seeds became'));
    for (const r of rows) {
      redemptions.appendChild(h('div', { class: 'r' }, `${r.f.Item} — ${r.f.Cost}`));
    }
  }

  renderWallet(); renderShelf(); renderRedemptions();

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/day/' }, 'the day'),
    h('a', { href: '#/hour' }, 'the hour'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  app.appendChild(hints);
  return () => {};
}

// ==================================================================== tend

export function mountTend(app) {
  const root = h('div', { class: 'room' });
  app.appendChild(root);
  root.appendChild(h('div', { class: 'meadow-title italic' }, 'tend'));

  // connection ---------------------------------------------------------
  const s = store.getSettings();
  const connSection = h('div', { class: 'tend-section' });
  connSection.appendChild(h('h2', {}, 'connection'));
  const status = h('div', { class: 'tend-status' });
  connSection.appendChild(status);
  const patInput = h('input', { class: 'field', type: 'text', placeholder: 'personal access token' });
  patInput.value = s.pat || '';
  const baseInput = h('input', { class: 'field', type: 'text', placeholder: 'base id (appXXXXXXXX)' });
  baseInput.value = s.baseId || '';
  connSection.appendChild(h('div', { class: 'row' }, [patInput]));
  connSection.appendChild(h('div', { class: 'row' }, [baseInput]));
  const saveConn = h('button', { class: 'btn' }, 'save connection');
  connSection.appendChild(h('div', { class: 'row', style: 'margin-top:10px' }, [saveConn]));
  saveConn.addEventListener('click', () => {
    store.saveSettings({ ...store.getSettings(), pat: patInput.value.trim(), baseId: baseInput.value.trim() });
    renderStatus();
    whisper('connection saved.');
  });
  function renderStatus() {
    clear(status);
    const c = store.connected();
    status.appendChild(h('div', {}, c ? 'connected to airtable.' : 'sandbox — living in this browser.'));
    status.appendChild(h('div', { class: 'dim' }, `${store.queuedCount()} writes queued.`));
    if (c) status.appendChild(h('div', { class: 'dim' }, 'the base itself is the admin UI now — edit rows there.'));
  }
  renderStatus();
  connSection.appendChild(h('div', { class: 'tend-warning italic' }, 'the token lives only in this browser.'));

  const plantBaseBtn = h('button', { class: 'btn' }, 'plant the base');
  const transplantBtn = h('button', { class: 'btn' }, 'carry the sandbox over');
  connSection.appendChild(h('div', { class: 'row', style: 'margin-top:14px' }, [plantBaseBtn, transplantBtn]));
  const report = h('div', { class: 'tend-report' });
  connSection.appendChild(report);
  function logReport(line) { report.appendChild(h('div', {}, line)); }
  plantBaseBtn.addEventListener('click', async () => {
    clear(report);
    plantBaseBtn.setAttribute('disabled', '');
    try { await store.plantBase(logReport); }
    catch (e) { logReport(`— ${e.message}`); }
    plantBaseBtn.removeAttribute('disabled');
    renderStatus();
  });
  transplantBtn.addEventListener('click', async () => {
    clear(report);
    transplantBtn.setAttribute('disabled', '');
    try { await store.transplantSandbox(logReport); }
    catch (e) { logReport(`— ${e.message}`); }
    transplantBtn.removeAttribute('disabled');
    renderStatus();
  });
  root.appendChild(connSection);

  // export ---------------------------------------------------------
  const exportSection = h('div', { class: 'tend-section' });
  exportSection.appendChild(h('h2', {}, 'export'));
  const exportBtn = h('button', { class: 'btn' }, 'export everything as json');
  exportSection.appendChild(exportBtn);
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `life-emergent-${store.todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  root.appendChild(exportSection);

  // editors ---------------------------------------------------------
  root.appendChild(rowEditor('Habits', 'habits', [
    { key: 'Seeds', type: 'number', width: 70 },
  ], () => ({ Variety: 1 + Math.floor(Math.random() * 900), Order: nextOrder('Habits'), Active: true, Seeds: 3 })));

  root.appendChild(trackerEditor());

  root.appendChild(shopEditor());

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/day/' }, 'the day'),
    h('a', { href: '#/shop' }, 'the shop'),
    h('a', { href: '#/hour' }, 'the hour'),
  ]);
  app.appendChild(hints);
  return () => {};
}

function nextOrder(table) {
  const rows = store.S.data[table] || [];
  return 1 + rows.reduce((m, r) => Math.max(m, r.f.Order || 0), 0);
}

async function renameRow(table, row, newName) {
  const newName2 = newName.trim();
  if (!newName2 || newName2 === row.f.Name) return;
  const carried = { ...row.f, Name: newName2 };
  await store.upsertRow(table, 'Name', carried);
  await store.upsertRow(table, 'Name', { Name: row.f.Name, Active: false });
}

function rowEditor(table, label, extraFields, defaultsFn) {
  const section = h('div', { class: 'tend-section' });
  section.appendChild(h('h2', {}, label));
  const list = h('div', { class: 'tend-list' });
  section.appendChild(list);

  function renderList() {
    clear(list);
    const rows = [...(store.S.data[table] || [])].sort((a, b) => (a.f.Order || 0) - (b.f.Order || 0));
    for (const row of rows) {
      const nameInput = h('input', { type: 'text', class: 'field' });
      nameInput.value = row.f.Name || '';
      nameInput.addEventListener('blur', () => renameRow(table, row, nameInput.value).then(renderList));
      const fieldInputs = extraFields.map((f) => {
        const inp = h('input', { type: f.type, class: 'field', style: `width:${f.width}px` });
        inp.value = row.f[f.key] ?? '';
        inp.addEventListener('blur', () => {
          store.upsertRow(table, 'Name', { Name: row.f.Name, [f.key]: Number(inp.value) || 0 });
        });
        return inp;
      });
      const active = h('input', { type: 'checkbox' });
      active.checked = !!row.f.Active;
      active.addEventListener('change', () => {
        store.upsertRow(table, 'Name', { Name: row.f.Name, Active: active.checked });
      });
      const line = h('div', { class: 'tend-row' }, [nameInput, ...fieldInputs, h('label', { class: 'checklabel' }, [active, 'on'])]);
      list.appendChild(line);
    }
  }
  renderList();

  const addName = h('input', { type: 'text', placeholder: 'name…', class: 'field' });
  const addBtn = h('button', { class: 'btn' }, 'add');
  addBtn.addEventListener('click', async () => {
    const name = addName.value.trim();
    if (!name) return;
    await store.upsertRow(table, 'Name', { Name: name, ...defaultsFn() });
    addName.value = '';
    renderList();
  });
  section.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, [addName, addBtn]));
  return section;
}

function shopEditor() {
  const table = 'Shop';
  const section = h('div', { class: 'tend-section' });
  section.appendChild(h('h2', {}, 'shop'));
  const list = h('div', { class: 'tend-list' });
  section.appendChild(list);

  function renderList() {
    clear(list);
    const rows = [...store.S.data.Shop].sort((a, b) => (a.f.Order || 0) - (b.f.Order || 0));
    for (const row of rows) {
      const nameInput = h('input', { type: 'text', class: 'field' });
      nameInput.value = row.f.Name || '';
      nameInput.addEventListener('blur', () => renameRow(table, row, nameInput.value).then(renderList));
      const costInput = h('input', { type: 'number', class: 'field', style: 'width:64px' });
      costInput.value = row.f.Cost ?? '';
      costInput.addEventListener('blur', () => store.upsertRow(table, 'Name', { Name: row.f.Name, Cost: Number(costInput.value) || 0 }));
      const linkInput = h('input', { type: 'text', class: 'field', placeholder: 'link…' });
      linkInput.value = row.f.Link || '';
      linkInput.addEventListener('blur', () => store.upsertRow(table, 'Name', { Name: row.f.Name, Link: linkInput.value.trim() }));
      const active = h('input', { type: 'checkbox' });
      active.checked = !!row.f.Active;
      active.addEventListener('change', () => store.upsertRow(table, 'Name', { Name: row.f.Name, Active: active.checked }));
      list.appendChild(h('div', { class: 'tend-row' }, [nameInput, costInput, h('label', { class: 'checklabel' }, [active, 'on'])]));
      list.appendChild(h('div', { class: 'tend-row', style: 'grid-template-columns:1fr' }, [linkInput]));
    }
  }
  renderList();

  const addName = h('input', { type: 'text', placeholder: 'name…', class: 'field' });
  const addCost = h('input', { type: 'number', placeholder: 'cost', class: 'field', style: 'width:80px' });
  const addSign = h('input', { type: 'text', placeholder: 'sign (emoji)', class: 'field', style: 'width:100px' });
  const addLink = h('input', { type: 'text', placeholder: 'link (optional)…', class: 'field' });
  const addBtn = h('button', { class: 'btn' }, 'add');
  addBtn.addEventListener('click', async () => {
    const name = addName.value.trim();
    if (!name) return;
    await store.upsertRow(table, 'Name', {
      Name: name, Cost: Number(addCost.value) || 10, Sign: addSign.value.trim() || '·',
      Link: addLink.value.trim(), Order: nextOrder(table), Active: true,
    });
    addName.value = ''; addCost.value = ''; addSign.value = ''; addLink.value = '';
    renderList();
  });
  section.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, [addName, addSign, addCost]));
  section.appendChild(h('div', { class: 'row', style: 'margin-top:6px' }, [addLink, addBtn]));
  return section;
}

function trackerEditor() {
  const section = h('div', { class: 'tend-section' });
  section.appendChild(h('h2', {}, 'trackers'));
  const list = h('div', { class: 'tend-list' });
  section.appendChild(list);

  function renderList() {
    clear(list);
    const rows = [...store.S.data.Trackers].sort((a, b) => (a.f.Order || 0) - (b.f.Order || 0));
    for (const row of rows) {
      const nameInput = h('input', { type: 'text', class: 'field' });
      nameInput.value = row.f.Name || '';
      nameInput.addEventListener('blur', () => renameRow('Trackers', row, nameInput.value).then(renderList));
      const kind = h('span', { class: 'dim', style: 'font-size:.72rem' }, row.f.Kind || '');
      const active = h('input', { type: 'checkbox' });
      active.checked = !!row.f.Active;
      active.addEventListener('change', () => {
        store.upsertRow('Trackers', 'Name', { Name: row.f.Name, Active: active.checked });
      });
      list.appendChild(h('div', { class: 'tend-row' }, [nameInput, kind, h('label', { class: 'checklabel' }, [active, 'on'])]));
    }
  }
  renderList();

  const addName = h('input', { type: 'text', placeholder: 'name…', class: 'field' });
  const addAsk = h('input', { type: 'text', placeholder: 'ask… (how thick was the fog today?)', class: 'field' });
  const kindSel = h('select', { class: 'field' }, ['scale', 'number', 'yesno', 'words'].map((k) => h('option', { value: k }, k)));
  const addBtn = h('button', { class: 'btn' }, 'add');
  addBtn.addEventListener('click', async () => {
    const name = addName.value.trim();
    if (!name) return;
    await store.upsertRow('Trackers', 'Name', {
      Name: name, Ask: addAsk.value.trim() || name, Kind: kindSel.value,
      Min: 0, Max: kindSel.value === 'scale' ? 5 : kindSel.value === 'number' ? 14 : 1,
      Order: nextOrder('Trackers'), Active: true,
    });
    addName.value = ''; addAsk.value = '';
    renderList();
  });
  section.appendChild(h('div', { class: 'row', style: 'margin-top:8px;flex-direction:column;align-items:stretch;gap:6px' },
    [addName, addAsk, h('div', { class: 'row' }, [kindSel, addBtn])]));
  return section;
}
