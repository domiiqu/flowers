// views.js — the rooms. each mount* function renders into `app` and
// returns a cleanup function (timers, listeners) called before the router
// moves on.

import * as store from './store.js?v=21';
import { dayStateFields, computeWorldState } from './world.js?v=21';
import { farSideFor } from './farside.js?v=21';
import * as farview from './farview.js?v=21';
import { sigilSVG } from './sigil.js?v=21';
import * as gcal from './gcal.js?v=21';

// the day's finished print lives in ONE field — the base's AI image field,
// "Plate generator". Read only that (never scan every field), so a stray
// image in some other column can't be mistaken for the plate.
const PLATE_FIELD = 'Plate generator';
function plateImageUrl(row) {
  if (!row) return '';
  // a regenerated day accumulates every version it has ever had; always the
  // newest. store.latestImageUrl reads the generator's own filename stamp
  // rather than trusting position — see the note there.
  return store.latestImageUrl(row.f[PLATE_FIELD]);
}

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
    // the timeline (dragging a placed instrument, stretching a handle) and
    // a rating slider (dragging its handle end to end easily exceeds the
    // swipe threshold) are their own horizontal-drag surfaces — neither
    // must ever also read as a swipe-to-change-day gesture, so both are
    // excluded here on top of each one's own drag using setPointerCapture
    // (or, for the slider, stopPropagation on its own pointerdown).
    return t.closest && t.closest('button, a, input, textarea, select, .timeline-section, .rating-hit');
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

// a deterministic tone per instrument name (its lane and marks' fill) — no
// schema field for this, so it's derived, same spirit as habit identity
// being a hash of the name elsewhere in this app.
function hueFor(name) {
  let hh = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) hh = (hh * 31 + s.charCodeAt(i)) >>> 0;
  return hh % 360;
}

// for a new instrument: just a name — every new tag is a dot (sun/moon are
// pinned lanes, never offered here; see ensureSunMoon). no window.prompt()
// anywhere in this flow.
function buildInstrumentAdd(onSubmit) {
  const wrap = h('div', { class: 'inline-add' });
  function showButton() {
    clear(wrap);
    const btn = h('button', { class: 'plain italic tl-add-btn' }, '+ tag');
    btn.addEventListener('click', showField);
    wrap.appendChild(btn);
  }
  function showField() {
    clear(wrap);
    let phase = 'open'; // 'open' -> 'closed'
    const input = h('input', { class: 'field inline-add-field', placeholder: 'a new tag…' });
    function cancel() { if (phase === 'closed') return; phase = 'closed'; showButton(); }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = input.value.trim();
        phase = 'closed';
        if (!name) return showButton();
        onSubmit(name, 'dot');
        showButton();
      } else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (phase === 'open') cancel(); }, 120));
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

  // the date itself is the page's face now — big and quiet, the arrows
  // small beside it. (seeds/shop are retired from this page — see the
  // hints below — so there's no point counter riding the corner any more.)
  const header = h('div', { class: 'day-head' });
  header.appendChild(h('button', { class: 'plain day-arrow', 'aria-label': 'previous day',
    onclick: () => (location.hash = `#/day/${store.addDays(date, -1)}`) }, '‹'));
  const dparts = store.fmtDate(date).split(' · ');
  header.appendChild(h('div', { class: 'day-date' }, [
    h('div', { class: 'day-weekday italic' }, dparts[0] || ''),
    h('div', { class: 'day-datum' }, dparts[1] || store.fmtDate(date)),
  ]));
  header.appendChild(h('button', { class: 'plain day-arrow', 'aria-label': 'next day',
    onclick: () => (location.hash = `#/day/${store.addDays(date, 1)}`) }, '›'));
  root.appendChild(header);

  // (no "today" link — the arrows and swipe carry you back; the word is gone.)

  // the day's ONLY image: the airtable-rendered plate. once it exists it
  // shows prominently here, at the top of the day; until then this is a
  // quiet "print this day" action, never a big empty box.
  const printBox = h('div', { class: 'print-ritual' });
  root.appendChild(printBox);
  // what arrived on this day — a reading on the day she brought it, a find
  // on the day it came. Puts the shelf on the calendar instead of only in
  // its own room: a day is not just what she logged, it is also what turned
  // up.
  const dayObjects = h('div', { class: 'day-objects' });
  root.appendChild(dayObjects);

  // the day's shape — schedule as soft blocks (Google Calendar when
  // connected, otherwise editable blocks kept in Days.Schedule)
  const schedule = h('div', { class: 'schedule' });
  root.appendChild(schedule);

  // the timeline, rebuilt as LANES — one lane per active instrument, an
  // hour ruler shared across all of them via one CSS grid (so the ruler
  // and every lane's track share the exact same x-axis). its own drag
  // surface: excluded from swipe-to-change-day (see bindSwipe's
  // interactive() check) and every drag inside it captures the pointer,
  // so a horizontal slide never bubbles into that handler.
  const timelineSection = h('div', { class: 'timeline-section day-col' });
  root.appendChild(timelineSection);
  const lanesGrid = h('div', { class: 'tl-grid' });
  timelineSection.appendChild(lanesGrid);

  // personal | work — side by side at every width, each a delicate slider
  const domains = h('div', { class: 'domains day-col' });
  root.appendChild(domains);

  // a line for the day
  const notesBlock = h('div', { class: 'notes-block day-col' });
  root.appendChild(notesBlock);

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/hour' }, 'the hour'),
    h('a', { href: '#/gallery' }, 'the gallery'),
    h('a', { href: '#/cupboard' }, 'the cupboard'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  root.appendChild(hints);

  // ---- the schedule ---------------------------------------------------
  // soft blocks, not a poem. Google Calendar when it's connected;
  // otherwise editable blocks stored as lines in Days.Schedule. Either
  // way the day's block count is written back so the print gets its wires.
  async function renderSchedule() {
    clear(schedule);
    let events = null; // [{time, title, allDay}]
    let live = false;
    if (gcal.connected()) {
      try { events = await gcal.listEvents(date); live = true; }
      catch (e) { events = null; }
    }
    if (!live) {
      const raw = (store.dayFor(date)?.f.Schedule || '').split('\n').map((l) => l.trim()).filter(Boolean);
      events = raw.map((line) => {
        const m = line.match(/^(\d{1,2}:\d{2})\s*[—-]\s*(.*)$/);
        return m ? { time: m[1], title: m[2], allDay: false } : { time: '', title: line, allDay: true };
      });
    }

    if (!events.length) {
      schedule.appendChild(h('div', { class: 'sched-empty dim italic' }, 'no plans yet'));
    }
    for (const ev of events) {
      const block = h('div', { class: 'sched-block' + (ev.allDay ? ' all-day' : '') }, [
        h('span', { class: 'sched-time' }, ev.allDay ? '' : ev.time),
        h('span', { class: 'sched-title' }, ev.title),
      ]);
      schedule.appendChild(block);
    }

    // the add affordance — a quiet ＋ that opens an inline block
    const add = h('button', { class: 'plain sched-add italic' }, '＋ a plan');
    add.addEventListener('click', () => openAddPlan(live));
    schedule.appendChild(add);

    // keep the print's schedule count fresh (blocks that carry a time feed
    // the wires); persist a text summary too when live so it survives offline
    if (live) {
      const text = events.filter((e) => !e.allDay).map((e) => `${e.time} — ${e.title}`).join('\n');
      const cur = store.dayFor(date)?.f.Schedule || '';
      if (text !== cur) store.saveDay(date, { Schedule: text });
    }
  }

  function openAddPlan(live) {
    const form = h('div', { class: 'sched-form' });
    const timeInput = h('input', { class: 'sched-in', type: 'time', value: '09:00' });
    const titleInput = h('input', { class: 'sched-in', type: 'text', placeholder: 'what…' });
    const save = h('button', { class: 'plain sched-save italic' }, 'add');
    async function commit() {
      const title = titleInput.value.trim();
      if (!title) return;
      const time = timeInput.value || '09:00';
      if (live && gcal.connected()) {
        try { await gcal.createEvent(date, { title, time }); }
        catch (e) { whisper(`couldn't add to google — ${e.message}`, 3600); }
      } else {
        const lines = (store.dayFor(date)?.f.Schedule || '').split('\n').filter(Boolean);
        lines.push(`${time} — ${title}`);
        lines.sort();
        await store.saveDay(date, { Schedule: lines.join('\n') });
      }
      await renderSchedule();
      scheduleDaySync();
    }
    save.addEventListener('click', commit);
    titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    form.appendChild(timeInput); form.appendChild(titleInput); form.appendChild(save);
    schedule.replaceChild(form, schedule.lastChild); // swap the ＋ for the form
    titleInput.focus();
  }

  // ---- the print ritual ----------------------------------------------
  // while a print is being painted in the base, quietly poll for it so it
  // swaps in on its own — no refresh. gives up after a couple of minutes;
  // the gallery (which refreshes on entry) catches any it missed.
  let printTimer = null;
  function pollForPrint() {
    if (printTimer || !store.connected()) return;
    let tries = 0;
    printTimer = setInterval(async () => {
      tries++;
      const ok = await store.reloadTable('Days');
      if (ok && plateImageUrl(store.dayFor(date))) { stopPollPrint(); renderPrint(); }
      else if (tries >= 20) stopPollPrint(); // ~2 minutes
    }, 6000);
  }
  function stopPollPrint() { clearInterval(printTimer); printTimer = null; }

  // the airtable render, once it exists, IS the day's face on the page —
  // shown large and portrait at the top; a small line under it points at
  // the gallery, where every keepsake collects.
  function renderPrint() {
    renderDayObjects();
    clear(printBox);
    const row = store.dayFor(date);
    const url = plateImageUrl(row);
    if (url) {
      stopPollPrint();
      // the print has landed — release the ritual flag so the press is
      // idle again (and re-printable later); harmless if already clear.
      if (row && row.f['Print?']) store.saveDay(date, { 'Print?': false });
      const shown = h('div', { class: 'print-shown' });
      const plate = h('img', {
        class: 'print-img', src: url,
        alt: `the day's plate — ${store.fmtDate(date)}`,
      });
      // the card is a portal. Touching it turns it over, and the far side
      // takes the whole screen — the front is bounded and printable, the
      // back has no edges and cannot be. No label says so; the only hint
      // is the slow breath at the card's edge (see .print-shown::after).
      plate.addEventListener('click', () => farview.open(date, plate));
      shown.appendChild(plate);
      shown.appendChild(h('a', { class: 'plain italic print-done', href: '#/gallery' }, 'printed — in the gallery ↗'));
      printBox.appendChild(shown);
      return;
    }
    const requested = !!(row && row.f['Print?']);
    const btn = h('button', { class: 'plain print-btn italic' }, requested ? 'printing…' : 'print this day');
    if (requested) { btn.setAttribute('disabled', ''); pollForPrint(); }
    btn.addEventListener('click', async () => {
      const res = await store.requestPrint(date);
      if (res && res.ok) {
        renderPrint();
        pollForPrint();
        whisper('the press is set — it will appear in the gallery.', 3800);
      } else if (res && res.sandbox) {
        renderPrint();
        whisper('not connected to airtable — add your token in tend, then print.', 5000);
      } else {
        // the write didn't reach airtable; say why (e.g. an unknown field name)
        whisper(`the press jammed — ${(res && res.error) || 'the write didn’t reach airtable'}`, 7000);
      }
    });
    printBox.appendChild(btn);
  }

  // the same two-faced card as the cupboard, at a smaller size: click turns
  // it, double-click follows it. Deliberately the same gesture everywhere —
  // a thing on the shelf and the same thing on its day behave identically.
  function renderDayObjects() {
    clear(dayObjects);
    const brought = (store.S.data.Readings || []).filter((r) => r.f.Submitted === date);
    const found = [
      ...(store.S.data.Readings || []).filter((r) => r.f.Read && r.f['Read on'] === date),
      ...(store.S.data.Specimens || []).filter((x) => x.f.Name && x.f.Found === date),
    ];
    // a reading brought AND read on the same day should appear once, as a find
    const foundKeys = new Set(found.map((o) => o.f.Key));
    const rows = [
      ...found.map((o) => ({ row: o, verb: o.f.Name ? 'given' : 'read' })),
      ...brought.filter((r) => !foundKeys.has(r.f.Key)).map((r) => ({ row: r, verb: 'brought' })),
    ];
    if (!rows.length) return;
    const strip = h('div', { class: 'day-objects-strip' });
    for (const { row, verb } of rows) {
      const isSpecimen = !!row.f.Name && !row.f.URL;
      const url = store.latestImageUrl(row.f.Image);
      const showDark = isSpecimen || row.f.Read;
      const art = (showDark && url)
        ? h('img', { class: 'day-object-img', src: url, alt: '', loading: 'lazy' })
        : h('div', { class: 'day-object-sigil' }, [sigilSVG(row.f.URL || row.f.Name || row.f.Key || '')]);
      const cell = h('a', {
        class: 'day-object', href: '#/cupboard',
        title: `${row.f.Title || row.f.Name || ''} — ${verb}`,
      });
      cell.appendChild(art);
      cell.appendChild(h('span', { class: 'day-object-verb dim italic' }, verb));
      strip.appendChild(cell);
    }
    dayObjects.appendChild(strip);
  }

  // after anything changes the day, its flattened world-state is written
  // back onto the Days row (debounced, so a rapid tag dump becomes one
  // write) — the base's plate generator paints from those numbers. also
  // run once on opening today, which both births the day's row and
  // catches changes made in other rooms (a held hour, say).
  let syncTimer = null;
  function scheduleDaySync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(runDaySync, 2500);
  }
  function runDaySync() {
    clearTimeout(syncTimer);
    syncTimer = null;
    store.saveDayState(date, dayStateFields(date, store.S.data));
    syncFarSide();
  }

  // the far side rides the same debounce. The land's slow memory is taken
  // straight from the front face's own world-state rather than recomputed:
  // the two faces remember one life and differ only in how they render it.
  function syncFarSide() {
    try {
      const w = computeWorldState(date, store.S.data);
      const slow = { aridity: w.aridity, path: w.path, sea: w.sea, towerFloors: w.towerFloors };
      const { world, specimen } = farSideFor(date, store.S.data, slow);
      store.saveWorld(date, world);
      if (specimen) store.saveSpecimen(date, specimen);
    } catch (e) {
      // the far side must never be able to take the day page down with it
      console.warn('far side sync skipped:', e.message);
    }
  }

  // ------------------------------------------------------------- the timeline
  // one lane per active instrument, all sharing one x-axis (0..1440
  // minutes) with the ruler above. no more rail/drag-a-chip — the lane
  // itself IS the instrument, so a tap on its own empty track places it.
  //
  // a mark is a POINT in time by default (Start === End, drawn as a small
  // dot) — never an implied 30-minute block. sun/moon are ALWAYS points
  // (wake/sleep are instants); a plain dot can be stretched into a span by
  // double-clicking it, after which its handles work as before, with a
  // 30-minute floor on how short a stretched span can get.

  function minutesToPct(min) { return Math.max(0, Math.min(100, (min / 1440) * 100)); }

  // a point is represented as End == null OR End === Start — either is
  // written back consistently by every code path below.
  function isPoint(row) { return row.f.End == null || row.f.End === row.f.Start; }
  function canHaveDuration(inst) { return inst && inst.f.Glyph !== 'sun' && inst.f.Glyph !== 'moon'; }

  function positionMarkEl(el, row) {
    el.style.left = `${minutesToPct(row.f.Start)}%`;
    el.style.width = isPoint(row) ? '' : `${minutesToPct(row.f.End - row.f.Start)}%`;
  }

  async function placeOn(inst, start) {
    const s = Math.max(0, Math.min(1439, Math.round(start)));
    await store.placeInstrument({ instrument: inst.f.Name, date, start: s });
    renderMarks();
    scheduleDaySync();
  }

  // tap-to-place: pointerdown arms a watch, not a drag; if the pointer
  // lifts again without real movement (a tap, not the start of a page
  // scroll — the whole .timeline-section is excluded from bindSwipe and
  // every mark's own drag stopPropagates, so a plain tap here always
  // means "empty track"), place the lane's instrument at that x's time.
  function bindLaneTap(trackEl, inst) {
    let pid = null, sx = 0, sy = 0, moved = false;
    function down(e) {
      if (pid != null) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false;
    }
    function move(e) {
      if (pid !== e.pointerId) return;
      if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) moved = true;
    }
    function up(e) {
      if (pid !== e.pointerId) return;
      const wasMoved = moved;
      pid = null; moved = false;
      if (wasMoved) return;
      const r = trackEl.getBoundingClientRect();
      if (!r.width) return;
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      placeOn(inst, frac * 1440);
    }
    trackEl.addEventListener('pointerdown', down);
    trackEl.addEventListener('pointermove', move);
    trackEl.addEventListener('pointerup', up);
    trackEl.addEventListener('pointercancel', () => { pid = null; moved = false; });
  }

  // a placed mark: dragging its body retimes it (Start and End shift
  // together, preserving duration, or a point stays a point); dragging the
  // left handle moves Start alone; dragging the right handle moves End
  // alone, never below a 30-minute floor. a tap (near-zero movement on the
  // body) opens the edit sheet after a short pause — long enough for a
  // SECOND tap to arrive first and read as a double-click instead, which
  // (dots only, never sun/moon) turns a point into a 30-minute span.
  // setPointerCapture + stopPropagation on every one of these so a
  // horizontal slide never reaches bindSwipe — belt & suspenders alongside
  // .timeline-section already being excluded from swipe's own
  // interactive() check.
  function bindMarkDrag(el, row, trackEl, leftHandle, rightHandle, canDuration) {
    const WOBBLE = 8;
    const DBLCLICK_MS = 320;
    let pid = null, sx = 0, sy = 0, moved = false, startStart = 0, startEnd = 0, tapTimer = null;
    function down(e) {
      if (pid != null) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false;
      startStart = row.f.Start; startEnd = isPoint(row) ? row.f.Start : row.f.End;
      try { el.setPointerCapture(pid); } catch {}
      e.stopPropagation();
    }
    function move(e) {
      if (pid !== e.pointerId) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && (Math.abs(dx) > WOBBLE || Math.abs(dy) > WOBBLE)) moved = true;
      if (!moved) return;
      e.preventDefault();
      const r = trackEl.getBoundingClientRect();
      const deltaMin = (dx / r.width) * 1440;
      const dur = startEnd - startStart;
      const newStart = Math.max(0, Math.min(1440 - dur, Math.round(startStart + deltaMin)));
      row.f.Start = newStart;
      row.f.End = dur === 0 ? newStart : newStart + dur; // a point (dur 0) stays a point
      positionMarkEl(el, row);
    }
    function up(e) {
      if (pid !== e.pointerId) return;
      pid = null;
      if (moved) {
        store.adjustTimeline(row.f.Key, { Start: row.f.Start, End: row.f.End });
        scheduleDaySync();
        return;
      }
      // a plain tap: wait a beat for a possible second tap (dblclick) —
      // if none comes, it's just a tap, so open the edit sheet.
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; return; } // this WAS the second tap
      tapTimer = setTimeout(() => { tapTimer = null; openInstrumentSheet(row); }, DBLCLICK_MS);
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { pid = null; moved = false; });

    if (canDuration) {
      // a toggle both ways: a point expands to a 30-minute span; a span
      // collapses back to a point. the collapse writes End === Start — the
      // same shape isPoint() reads back after reload, so it round-trips
      // exactly like every other point mark in the app.
      el.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        row.f.End = isPoint(row) ? Math.min(1439, row.f.Start + 30) : row.f.Start;
        await store.adjustTimeline(row.f.Key, { Start: row.f.Start, End: row.f.End });
        renderMarks();
        scheduleDaySync();
      });
    }

    if (leftHandle) bindHandle(leftHandle, 'left');
    if (rightHandle) bindHandle(rightHandle, 'right');

    function bindHandle(handle, side) {
      const MIN_DUR = 30;
      let hpid = null, hsx = 0, hStart = 0, hEnd = 0;
      function hdown(e) {
        if (hpid != null) return;
        hpid = e.pointerId; hsx = e.clientX; hStart = row.f.Start; hEnd = row.f.End;
        try { handle.setPointerCapture(hpid); } catch {}
        e.stopPropagation();
      }
      function hmove(e) {
        if (hpid !== e.pointerId) return;
        e.preventDefault();
        const r = trackEl.getBoundingClientRect();
        const deltaMin = ((e.clientX - hsx) / r.width) * 1440;
        if (side === 'right') {
          row.f.End = Math.max(hStart + MIN_DUR, Math.min(1439, Math.round(hEnd + deltaMin)));
        } else {
          row.f.Start = Math.min(hEnd - MIN_DUR, Math.max(0, Math.round(hStart + deltaMin)));
        }
        positionMarkEl(el, row);
      }
      function hup(e) {
        if (hpid !== e.pointerId) return;
        hpid = null;
        store.adjustTimeline(row.f.Key, { Start: row.f.Start, End: row.f.End });
        scheduleDaySync();
      }
      handle.addEventListener('pointerdown', hdown);
      handle.addEventListener('pointermove', hmove);
      handle.addEventListener('pointerup', hup);
      handle.addEventListener('pointercancel', () => { hpid = null; });
    }
  }

  // name -> that lane's track element, rebuilt whenever the instrument
  // roster changes (renderLanes); marks alone re-render far more often
  // (any drag/place/delete), so they're a separate, cheaper pass.
  const laneTracks = new Map();

  function renderMarks() {
    for (const trackEl of laneTracks.values()) clear(trackEl);
    for (const row of store.timelineFor(date)) {
      const trackEl = laneTracks.get(row.f.Instrument);
      const inst = store.S.data.Instruments.find((i) => i.f.Name === row.f.Instrument);
      if (!trackEl || !inst) continue; // its instrument was deactivated/renamed since — no lane to host it
      const point = isPoint(row);
      const span = h('div', { class: point ? 'tl-point' : 'tl-span' });
      span.style.setProperty('--hue', hueFor(inst.f.Name));
      positionMarkEl(span, row);
      span.appendChild(h('span', { class: point ? 'tl-point-glyph' : 'tl-span-glyph' }, glyphChar(inst.f.Glyph)));
      let leftHandle = null, rightHandle = null;
      if (!point) {
        leftHandle = h('button', { class: 'plain tl-handle tl-handle-left', 'aria-label': 'adjust start' });
        rightHandle = h('button', { class: 'plain tl-handle tl-handle-right', 'aria-label': 'adjust end' });
        span.appendChild(leftHandle);
        span.appendChild(rightHandle);
      }
      bindMarkDrag(span, row, trackEl, leftHandle, rightHandle, canHaveDuration(inst));
      trackEl.appendChild(span);
    }
  }

  // a lane's label: glyph, name, an inline quiet "now" (places a
  // point-in-time mark at the current clock time), and a small pencil that
  // opens rename + delete inline — the SAME rename/delete infrastructure
  // (renameNamed / deleteNamed on Instruments) the edit sheet below also
  // uses, so a tag can be managed from either place. deleting only drops it
  // from the offered lanes; days that already placed it keep their marks.
  //
  // sun and moon are pinned lanes — always present, never deletable — so
  // the ✕ is suppressed for them specifically by Glyph (never by Name, so
  // renaming one stays safe); rename (✎) stays available for them too.
  function buildLaneLabel(inst) {
    const label = h('div', { class: 'tl-lane-label' });
    const pinned = inst.f.Glyph === 'sun' || inst.f.Glyph === 'moon';
    function renderView() {
      clear(label);
      label.appendChild(h('span', { class: 'tl-lane-glyph' }, glyphChar(inst.f.Glyph)));
      label.appendChild(h('span', { class: 'tl-lane-name' }, inst.f.Name));
      // always available — a point-in-time mark at the current clock time,
      // never hidden behind a same-day check.
      const nowBtn = h('button', { class: 'plain tl-lane-now' }, 'now');
      nowBtn.addEventListener('click', () => placeOn(inst, nowMinutes()));
      label.appendChild(nowBtn);
      const editBtn = h('button', { class: 'plain tl-lane-edit', 'aria-label': `edit ${inst.f.Name}` }, '✎');
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); renderEdit(); });
      label.appendChild(editBtn);
    }
    function renderEdit() {
      clear(label);
      const input = h('input', { class: 'field tl-lane-edit-field' });
      input.value = inst.f.Name;
      let phase = 'open'; // 'open' -> 'closed', guards blur firing after Enter/Escape/delete
      async function commit() {
        if (phase === 'closed') return;
        phase = 'closed';
        const nm = input.value.trim();
        if (nm && nm !== inst.f.Name) await store.renameNamed('Instruments', inst.f.Name, nm);
        renderLanes();
      }
      // renderLanes() (not the local renderView()) keeps every lane (order,
      // any other edits) consistent after a rename/cancel.
      function cancel() { if (phase === 'closed') return; phase = 'closed'; renderLanes(); }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
      input.addEventListener('blur', () => setTimeout(() => { if (phase === 'open') commit(); }, 120));
      label.appendChild(input);
      if (!pinned) {
        const delBtn = h('button', { class: 'plain mini-x', 'aria-label': `delete ${inst.f.Name}` }, '✕');
        delBtn.addEventListener('click', async () => {
          phase = 'closed';
          if (!window.confirm(`delete “${inst.f.Name}”? past days keep it; it just stops being offered.`)) { phase = 'open'; return; }
          await store.deleteNamed('Instruments', inst.f.Name);
          renderLanes();
        });
        label.appendChild(delBtn);
      }
      setTimeout(() => input.focus(), 0);
    }
    renderView();
    return label;
  }

  async function renderLanes() {
    // sun (wake) and moon (sleep) are pinned, permanent lanes — self-heal
    // the roster before drawing it, so there's always exactly one of each.
    await store.ensureSunMoon();

    clear(lanesGrid);
    laneTracks.clear();

    // the hour ruler — a tick every hour, a number every 3 — sharing the
    // grid's track column so it lines up exactly with every lane below it.
    lanesGrid.appendChild(h('div', { class: 'tl-ruler-label' }));
    const ruler = h('div', { class: 'tl-ruler-track' });
    for (let hr = 0; hr <= 24; hr++) {
      const pct = (hr / 24) * 100;
      ruler.appendChild(h('div', { class: 'tl-ruler-tick' + (hr % 3 === 0 ? ' major' : ''), style: `left:${pct}%` }));
      if (hr % 3 === 0 && hr < 24) ruler.appendChild(h('span', { class: 'tl-ruler-num', style: `left:${pct}%` }, String(hr)));
    }
    lanesGrid.appendChild(ruler);

    // sun first, moon second, then everything else in its existing
    // (Order-sorted) order — identified by Glyph, never by Name.
    const roster = store.activeInstruments();
    const sunLane = roster.find((i) => i.f.Glyph === 'sun');
    const moonLane = roster.find((i) => i.f.Glyph === 'moon');
    const rest = roster.filter((i) => i.f.Glyph !== 'sun' && i.f.Glyph !== 'moon');
    const ordered = [sunLane, moonLane, ...rest].filter(Boolean);

    for (const inst of ordered) {
      const label = buildLaneLabel(inst);
      const laneTrack = h('div', { class: 'tl-lane-track' });
      laneTrack.style.setProperty('--hue', hueFor(inst.f.Name));
      bindLaneTap(laneTrack, inst);
      laneTracks.set(inst.f.Name, laneTrack);
      lanesGrid.appendChild(label);
      lanesGrid.appendChild(laneTrack);
    }

    const addRow = h('div', { class: 'tl-add-row' });
    addRow.appendChild(buildInstrumentAdd(async (name, glyph) => {
      await store.addInstrument(name, glyph);
      renderLanes();
    }));
    lanesGrid.appendChild(addRow);

    renderMarks();
  }

  // the instrument edit sheet — time (+ duration for a span), a note,
  // delete. Start/End are edited by re-dragging on the line itself.
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
    const timeText = isPoint(row)
      ? fmtClock(row.f.Start)
      : `${fmtClock(row.f.Start)} – ${fmtClock(row.f.End)} · ${fmtDuration(row.f.End - row.f.Start)}`;
    instSheet.appendChild(h('div', { class: 'instrument-sheet-time dim italic' }, timeText));

    const noteArea = h('textarea', { class: 'field', placeholder: 'a note…' });
    noteArea.value = row.f.Note || '';
    noteArea.addEventListener('blur', () => { store.adjustTimeline(row.f.Key, { Note: noteArea.value }); scheduleDaySync(); });
    instSheet.appendChild(noteArea);

    const delBtn = h('button', { class: 'btn instrument-sheet-delete' }, 'delete');
    delBtn.addEventListener('click', async () => {
      await store.removeTimeline(row.f.Key);
      closeInstrumentSheet();
      renderMarks();
      scheduleDaySync();
    });
    instSheet.appendChild(delBtn);

    // the tag itself (not just this one placed mark) — rename or delete it
    // from here too, using the same rename/delete infrastructure the lane
    // label's pencil uses. renaming never touches past marks that already
    // carry the old name (they're keyed by text, same as everywhere else).
    const tagName = row.f.Instrument;
    const tagRow = h('div', { class: 'row', style: 'justify-content:center;' });
    const tagInput = h('input', { class: 'field', style: 'max-width:12em;text-align:center;' });
    tagInput.value = tagName;
    tagInput.addEventListener('blur', async () => {
      const nm = tagInput.value.trim();
      if (!nm || nm === tagName) return;
      await store.renameNamed('Instruments', tagName, nm);
      closeInstrumentSheet();
      renderLanes();
    });
    tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tagInput.blur(); });
    tagRow.appendChild(tagInput);
    instSheet.appendChild(tagRow);
    const deleteTagBtn = h('button', { class: 'plain italic', style: 'align-self:center;font-size:0.78rem;opacity:0.7;' },
      `delete the “${tagName}” tag`);
    deleteTagBtn.addEventListener('click', async () => {
      if (!window.confirm(`delete “${tagName}”? past days keep it; it just stops being offered.`)) return;
      await store.deleteNamed('Instruments', tagName);
      closeInstrumentSheet();
      renderLanes();
    });
    instSheet.appendChild(deleteTagBtn);

    instSheet.classList.add('open');
    instBackdrop.classList.add('open');
  }

  // ------------------------------------------------------- personal | work
  // a delicate 1-5 slider: a thin track, 5 tick stops, a handle that only
  // appears once a value is set (unset reads as visibly bare, not "3-ish").
  // tap anywhere to jump to the nearest stop; drag continuously with
  // snapping; both paths end at the same commit, so there's no special
  // casing between "a tap" and "a drag that didn't move".

  // the axis list is a stored setting now (settings.axes), not a hardcoded
  // const — adding or deleting one applies to BOTH domains, since they
  // share the same rows. defaults to the original three until she edits it.
  const DEFAULT_AXES = ['alignment', 'novelty', 'agency'];
  function getAxes() {
    const s = store.getSettings();
    return Array.isArray(s.axes) && s.axes.length ? s.axes : DEFAULT_AXES;
  }
  function saveAxes(list) {
    store.saveSettings({ ...store.getSettings(), axes: list });
  }
  function buildAxisAdd(onSubmit) {
    const wrap = h('div', { class: 'inline-add' });
    function showButton() {
      clear(wrap);
      const btn = h('button', { class: 'plain italic tl-add-btn' }, '+ axis');
      btn.addEventListener('click', showField);
      wrap.appendChild(btn);
    }
    function showField() {
      clear(wrap);
      const input = h('input', { class: 'field inline-add-field', placeholder: 'a new axis…' });
      let phase = 'open';
      function cancel() { if (phase === 'closed') return; phase = 'closed'; showButton(); }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const name = input.value.trim().toLowerCase();
          phase = 'closed';
          if (!name) return showButton();
          onSubmit(name);
          showButton();
        } else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
      input.addEventListener('blur', () => setTimeout(() => { if (phase === 'open') cancel(); }, 120));
      wrap.appendChild(input);
      setTimeout(() => input.focus(), 0);
    }
    showButton();
    return wrap;
  }

  function buildRatingSlider(domain, axis) {
    const hit = h('div', { class: 'rating-hit', role: 'slider', 'aria-label': `${domain} ${axis}` });
    const track = h('div', { class: 'rating-track' });
    for (let n = 1; n <= 5; n++) track.appendChild(h('span', { class: 'rating-tick', style: `left:${(n - 1) / 4 * 100}%` }));
    const handle = h('div', { class: 'rating-handle', hidden: true });
    track.appendChild(handle);
    hit.appendChild(track);

    function stopPct(n) { return `${(n - 1) / 4 * 100}%`; }
    function nearestStop(clientX) {
      const r = track.getBoundingClientRect();
      if (!r.width) return 1;
      const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      return Math.round(pct * 4) + 1;
    }
    function paint() {
      const rec = store.ratingFor(date, domain, axis);
      const val = rec ? rec.f.Value : null;
      handle.hidden = !val;
      if (val) { handle.style.left = stopPct(val); handle.classList.remove('preview'); }
    }
    let pid = null;
    function down(e) {
      pid = e.pointerId;
      try { hit.setPointerCapture(pid); } catch {}
      const n = nearestStop(e.clientX);
      handle.hidden = false;
      handle.classList.add('preview');
      handle.style.left = stopPct(n);
      e.preventDefault();
      // belt & suspenders alongside .rating-hit already being excluded
      // from bindSwipe's own interactive() check: dragging end to end
      // easily exceeds the swipe threshold, and must never change the day.
      e.stopPropagation();
    }
    function move(e) {
      if (pid !== e.pointerId) return;
      handle.style.left = stopPct(nearestStop(e.clientX));
    }
    async function up(e) {
      if (pid !== e.pointerId) return;
      pid = null;
      const n = nearestStop(e.clientX);
      handle.classList.remove('preview');
      await store.setRating(date, domain, axis, n);
      paint();
      scheduleDaySync();
    }
    hit.addEventListener('pointerdown', down);
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerup', up);
    hit.addEventListener('pointercancel', () => { pid = null; paint(); });
    paint();
    return hit;
  }

  function renderDomains() {
    clear(domains);
    const axes = getAxes();
    for (const domain of ['personal', 'work']) {
      const col = h('div', { class: 'domain-col' });
      col.appendChild(h('h3', { class: 'italic' }, domain));
      for (const axis of axes) {
        const rowEl = h('div', { class: 'rating-row' });
        const labelRow = h('div', { class: 'rating-label-row' });
        labelRow.appendChild(h('div', { class: 'rating-label italic dim' }, axis));
        const delBtn = h('button', { class: 'plain mini-x', 'aria-label': `remove the ${axis} axis` }, '✕');
        delBtn.addEventListener('click', () => {
          const cur = getAxes();
          if (cur.length <= 1) { whisper('at least one axis has to stay.', 2400); return; }
          if (!window.confirm(`remove the “${axis}” axis from both columns?`)) return;
          saveAxes(cur.filter((a) => a !== axis));
          renderDomains();
        });
        labelRow.appendChild(delBtn);
        rowEl.appendChild(labelRow);
        rowEl.appendChild(buildRatingSlider(domain, axis));
        col.appendChild(rowEl);
      }
      domains.appendChild(col);
    }
    const addRow = h('div', { class: 'axis-add-row' });
    addRow.appendChild(buildAxisAdd((name) => {
      const cur = getAxes();
      if (cur.includes(name)) { whisper('that axis already exists.', 2200); return; }
      saveAxes([...cur, name]);
      renderDomains();
    }));
    domains.appendChild(addRow);
  }

  // --------------------------------------------------------------- notes

  function renderNotes() {
    clear(notesBlock);
    const day = store.dayFor(date);
    const ta = h('textarea', { class: 'field notes-field', placeholder: 'Notes…' });
    ta.value = (day && day.f.Note) || '';
    ta.addEventListener('blur', () => { store.saveDay(date, { Note: ta.value }); scheduleDaySync(); });
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

  renderPrint();
  renderSchedule();
  renderLanes();
  renderDomains();
  renderNotes();

  // birth today's row on arrival — this also catches state set in other
  // rooms (a held hour) and keeps the plate generator's feed current even
  // on a day she only looks at. past days are already fixed, so leave
  // them be rather than rewrite a settled row on every flip through history.
  if (date === today) scheduleDaySync();

  const unbindSwipe = bindSwipe(root, {
    onLeft: () => (location.hash = `#/day/${store.addDays(date, 1)}`),
    onRight: () => (location.hash = `#/day/${store.addDays(date, -1)}`),
  });

  return () => {
    unbindSwipe();
    stopPollPrint();
    if (syncTimer) runDaySync(); // flush a pending write before leaving
  };
}


// =============================================================== the cupboard
// One shelf, two provenances. SPECIMENS are what the far side gave her —
// she cannot ask for one; they come up on rare day-shapes or not at all.
// READINGS are what she brought: a link dropped in from this world, which
// materialises there as an artifact of unclear purpose. Keeping them as
// separate tables and joining them only at the glass is the point — the
// shelf holds what you were given beside what you went and got.

function shelfImageUrl(row, field) {
  return store.latestImageUrl(row && row.f[field]);
}

// the app's usual date ("saturday · september 19") is too long for a shelf
// card — a read one carries two of them and wrapped to two lines. Same
// lowercase register, tighter: "19 sep".
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const SHELF_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${SHELF_MONTHS[Number(m[2]) - 1] || ''}`.trim();
}

export function mountCupboard(app) {
  const root = h('div', { class: 'room' });
  app.appendChild(root);
  root.appendChild(h('div', { class: 'meadow-title italic' }, 'the cupboard'));

  // ---- putting something on the shelf ---------------------------------
  // never window.prompt() — this can run as a home-screen web app, where
  // it is silently suppressed (see the touch rules in DESIGN).
  const put = h('div', { class: 'shelf-put' });
  const urlField = h('input', {
    class: 'field shelf-url', type: 'url', inputmode: 'url',
    placeholder: 'drop a link', 'aria-label': 'link to shelve',
  });
  const titleField = h('input', {
    class: 'field shelf-title', type: 'text',
    placeholder: 'what to call it (optional)', 'aria-label': 'title',
  });
  const putBtn = h('button', { class: 'plain italic shelf-add' }, 'put it on the shelf');
  put.appendChild(urlField);
  put.appendChild(titleField);
  put.appendChild(putBtn);
  root.appendChild(put);

  const wall = h('div', { class: 'shelf-wall' });
  root.appendChild(wall);

  async function shelve() {
    const url = urlField.value.trim();
    if (!url) { urlField.focus(); return; }
    putBtn.setAttribute('disabled', '');
    await store.shelveReading({ url, title: titleField.value });
    urlField.value = ''; titleField.value = '';
    putBtn.removeAttribute('disabled');
    render();
    whisper('on the shelf. it will take its form shortly.', 3600);
  }
  putBtn.addEventListener('click', shelve);
  urlField.addEventListener('keydown', (e) => { if (e.key === 'Enter') shelve(); });
  titleField.addEventListener('keydown', (e) => { if (e.key === 'Enter') shelve(); });

  // ---- the shelf -------------------------------------------------------
  // ---- one card, two faces -------------------------------------------
  // LIGHT face = the record: what it is, when it came, where from.
  // DARK face  = the image: its form on the planet.
  // A click turns it. A double-click follows it. An unread reading has no
  // dark face yet — that is exactly what reading it earns, so its dark side
  // is a sigil drawn from its own url: formless, but unmistakably itself.
  //
  // Single- and double-click fight on the same element: the single fires
  // first, so it is held back briefly and cancelled if a second comes. The
  // delay is unnoticeable on a turn and is the price of the gesture pair.
  const DOUBLE_MS = 230;

  function twoFaced({ dark, lightNodes, onFollow, extraClass = '' }) {
    const cell = h('div', { class: `shelf-cell${extraClass}` });
    const card = h('div', { class: 'shelf-card' });
    const faces = h('div', { class: 'shelf-faces' });

    const darkFace = h('div', { class: 'shelf-face shelf-dark' });
    darkFace.appendChild(dark);
    const lightFace = h('div', { class: 'shelf-face shelf-light' });
    for (const n of lightNodes) lightFace.appendChild(n);

    faces.appendChild(darkFace);
    faces.appendChild(lightFace);
    card.appendChild(faces);
    cell.appendChild(card);

    let turned = false, timer = null;
    function turn() {
      turned = !turned;
      faces.classList.toggle('turned', turned);
    }
    card.addEventListener('click', () => {
      if (timer) return;                       // second half of a double
      timer = setTimeout(() => { timer = null; turn(); }, DOUBLE_MS);
    });
    card.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (timer) { clearTimeout(timer); timer = null; }   // cancel the turn
      if (onFollow) onFollow();
    });
    return cell;
  }

  function readingCard(r) {
    const key = r.f.Key;
    const read = !!r.f.Read;
    const url = shelfImageUrl(r, 'Image');

    // its form on the planet — but only once she has read it
    const dark = (read && url)
      ? h('img', { class: 'shelf-img', src: url, alt: '', loading: 'lazy' })
      : h('div', { class: 'shelf-sigil' }, [sigilSVG(r.f.URL || key)]);

    const light = [
      h('div', { class: 'shelf-lt-name' }, r.f.Title || 'untitled'),
      h('div', { class: 'shelf-lt-line dim italic' }, hostOf(r.f.URL)),
      h('div', { class: 'shelf-lt-when dim italic' },
        `brought ${shortDate(r.f.Submitted)}${read && r.f['Read on'] ? ` · read ${shortDate(r.f['Read on'])}` : ''}`),
      h('div', { class: 'shelf-lt-hint dim italic' }, read ? 'read' : 'unread'),
    ];

    const cell = twoFaced({
      dark, lightNodes: light,
      extraClass: read ? ' is-read' : '',
      onFollow: () => {
        if (!r.f.URL) return;
        window.open(r.f.URL, '_blank', 'noopener,noreferrer');
      },
    });

    const mark = h('button', { class: 'plain italic shelf-mark' },
      read ? 'hold to unread' : 'hold to mark read');
    holdToAct(mark, {
      ms: 700,
      onComplete: async () => {
        await store.markRead(key, !read);
        render();
        whisper(read ? 'back on the shelf, unopened.' : 'read — it takes its form now.', 3400);
      },
    });
    cell.appendChild(mark);
    return cell;
  }

  function specimenCard(x) {
    const url = shelfImageUrl(x, 'Image');
    const dark = url
      ? h('img', { class: 'shelf-img', src: url, alt: '', loading: 'lazy' })
      : h('div', { class: 'shelf-sigil' }, [sigilSVG(x.f.Name || x.f.Key || '')]);
    const light = [
      h('div', { class: 'shelf-lt-name' }, x.f.Name || 'unnamed'),
      h('div', { class: 'shelf-lt-line dim italic' }, x.f.Kind || 'specimen'),
      h('div', { class: 'shelf-lt-when dim italic' },
        x.f['Rarity note'] || `found ${shortDate(x.f.Found)}`),
      h('div', { class: 'shelf-lt-hint dim italic' }, 'given'),
    ];
    return twoFaced({
      dark, lightNodes: light,
      // a specimen has no link to follow — it goes back to the day it came up
      onFollow: () => { if (x.f.Found) location.hash = `#/day/${x.f.Found}`; },
    });
  }

  function section(title, cells) {
    if (!cells.length) return null;
    const sec = h('div', { class: 'shelf-section' });
    sec.appendChild(h('div', { class: 'shelf-heading italic dim' }, title));
    const grid = h('div', { class: 'shelf-grid' });
    for (const c of cells) grid.appendChild(c);
    sec.appendChild(grid);
    return sec;
  }

  function render() {
    clear(wall);
    const all = store.readings();
    const unread = all.filter((r) => !r.f.Read).map(readingCard);

    // once read, a reading IS a find — it has taken its form and belongs
    // beside the things the world handed over. Brought and given sit on the
    // same shelf, sorted by when they arrived; the light face says which is
    // which, so the distinction is legible without being segregated.
    const finds = [
      ...all.filter((r) => r.f.Read)
        .map((r) => ({ on: r.f['Read on'] || r.f.Submitted || '', node: () => readingCard(r) })),
      ...(store.S.data.Specimens || []).filter((x) => x.f.Name)
        .map((x) => ({ on: x.f.Found || '', node: () => specimenCard(x) })),
    ].sort((a, b) => String(b.on).localeCompare(String(a.on))).map((o) => o.node());

    const parts = [
      section('waiting', unread),
      section('found', finds),
    ].filter(Boolean);

    if (!parts.length) {
      wall.appendChild(h('div', { class: 'dim italic', style: 'text-align:center;margin-top:24px' },
        'the cupboard is bare. drop a link above, or go and find something.'));
      return;
    }
    for (const p of parts) wall.appendChild(p);
  }

  render();
  let alive = true;
  // pull the freshest rows on entry, so a just-painted artifact appears
  if (store.connected()) {
    Promise.all([store.reloadTable('Readings'), store.reloadTable('Specimens')])
      .then(() => { if (alive) render(); });
  }

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/day/' }, 'the day'),
    h('a', { href: '#/gallery' }, 'the gallery'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  app.appendChild(hints);
  return () => { alive = false; };
}

// ================================================================ gallery
// the wall of prints — every day that's been painted, newest first. as
// simple as the day is long: a grid of images, each a door back to its day.

export function mountGallery(app) {
  const root = h('div', { class: 'room' });
  app.appendChild(root);
  root.appendChild(h('div', { class: 'meadow-title italic' }, 'the gallery'));
  const wall = h('div', { class: 'gallery-wall' });
  root.appendChild(wall);
  let alive = true;

  function render() {
    clear(wall);
    const prints = [...store.S.data.Days]
      .map((d) => ({ date: d.f.Date || d.f.Key, url: plateImageUrl(d) }))
      .filter((p) => p.url && p.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!prints.length) {
      wall.appendChild(h('div', { class: 'dim italic', style: 'text-align:center;margin-top:24px' },
        'no prints yet — press “print this day” on a day to begin the wall.'));
      return;
    }
    const grid = h('div', { class: 'gallery-grid' });
    for (const p of prints) {
      grid.appendChild(h('a', { class: 'gallery-cell', href: `#/day/${p.date}` }, [
        h('img', { class: 'gallery-img', src: p.url, alt: p.date, loading: 'lazy' }),
        h('div', { class: 'gallery-date dim italic' }, store.fmtDate(p.date)),
      ]));
    }
    wall.appendChild(grid);
  }

  render();
  // pull the freshest Days once on entry, so a just-printed day shows up
  if (store.connected()) store.reloadTable('Days').then(() => { if (alive) render(); });

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/day/' }, 'the day'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  app.appendChild(hints);
  return () => { alive = false; };
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

  // google calendar ----------------------------------------------------
  const gcalSection = h('div', { class: 'tend-section' });
  gcalSection.appendChild(h('h2', {}, 'google calendar'));
  const gcalStatus = h('div', { class: 'tend-status' });
  gcalSection.appendChild(gcalStatus);
  const gcalIdInput = h('input', { class: 'field', type: 'text', placeholder: 'google oauth client id (…apps.googleusercontent.com)' });
  gcalIdInput.value = store.getSettings().gcalClientId || '';
  gcalSection.appendChild(h('div', { class: 'row' }, [gcalIdInput]));
  const saveGcalId = h('button', { class: 'btn' }, 'save client id');
  const connectBtn = h('button', { class: 'btn' }, 'connect google');
  gcalSection.appendChild(h('div', { class: 'row', style: 'margin-top:10px' }, [saveGcalId, connectBtn]));
  function renderGcalStatus() {
    clear(gcalStatus);
    if (!gcal.configured()) {
      gcalStatus.appendChild(h('div', { class: 'dim' }, 'not set up — paste a client id, then connect.'));
    } else if (gcal.connected()) {
      gcalStatus.appendChild(h('div', {}, 'connected — the day reads your calendar.'));
    } else {
      gcalStatus.appendChild(h('div', { class: 'dim' }, 'client id saved — press connect to sign in.'));
    }
  }
  renderGcalStatus();
  saveGcalId.addEventListener('click', () => {
    store.saveSettings({ ...store.getSettings(), gcalClientId: gcalIdInput.value.trim() });
    renderGcalStatus();
    whisper('client id saved.');
  });
  connectBtn.addEventListener('click', async () => {
    store.saveSettings({ ...store.getSettings(), gcalClientId: gcalIdInput.value.trim() });
    try { await gcal.connect(); whisper('google connected.'); }
    catch (e) { whisper(`google — ${e.message}`, 4000); }
    renderGcalStatus();
  });
  gcalSection.appendChild(h('div', { class: 'tend-warning italic' },
    'the calendar token lives only in this browser tab.'));
  root.appendChild(gcalSection);

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

  // tend keeps only connections (airtable + google calendar) and export —
  // the shop, habits, points/seeds settings and the tag roster all stepped
  // back from the experience already; their editors are retired from here
  // too. the base itself (or the day page's own lane pencil) is the place
  // to manage a tag now.

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/day/' }, 'the day'),
    h('a', { href: '#/hour' }, 'the hour'),
  ]);
  app.appendChild(hints);
  return () => {};
}
