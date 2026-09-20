// views.js — the rooms. each mount* function renders into `app` and
// returns a cleanup function (timers, listeners) called before the router
// moves on.

import * as store from './store.js?v=14';
import { dayPrint } from './print.js?v=14';
import { computeWorldState, dayStateFields } from './world.js?v=14';
import * as gcal from './gcal.js?v=14';

// the day's finished print lives in ONE field — the base's AI image field,
// "Plate generator". Read only that (never scan every field), so a stray
// image in some other column can't be mistaken for the plate.
const PLATE_FIELD = 'Plate generator';
function plateImageUrl(row) {
  if (!row) return '';
  const v = row.f[PLATE_FIELD];
  // attachment field: Airtable appends, so the last item is the newest plate.
  // across repeated test runs a day accumulates many — show the most recent.
  if (Array.isArray(v) && v.length) {
    const a = v[v.length - 1];
    if (a && a.url) return a.url;
  }
  if (typeof v === 'string' && /^https?:\/\//.test(v)) return v; // url/text shape
  return '';
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

// for a new instrument: name, then a tiny glyph pick (☀/☾/·)
// in place of the "+" chip — no window.prompt() anywhere in this flow.
function buildInstrumentAdd(onSubmit) {
  const wrap = h('div', { class: 'inline-add' });
  function showButton() {
    clear(wrap);
    const btn = h('button', { class: 'plain italic tl-add-btn' }, '+ instrument');
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

  // the plate — restored, live: the day itself, painted in-browser from
  // the instrument day's data. portrait, at the top — what the coming
  // "far side" will one day turn over.
  const plate = h('div', { class: 'plate' });
  root.appendChild(plate);

  // the print ritual — a quiet action under the plate, not a second big
  // image. the live plate above is the day's face on the page; a print
  // is a committed keepsake that lands in the gallery instead.
  const printBox = h('div', { class: 'print-ritual' });
  root.appendChild(printBox);

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
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  root.appendChild(hints);

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

  // quiet, not a second big image — the live plate above is the day's
  // face on the page. once a print lands, this becomes a small line
  // pointing at the gallery, where the actual keepsake lives.
  function renderPrint() {
    clear(printBox);
    const row = store.dayFor(date);
    const url = plateImageUrl(row);
    if (url) {
      stopPollPrint();
      // the print has landed — release the ritual flag so the press is
      // idle again (and re-printable later); harmless if already clear.
      if (row && row.f['Print?']) store.saveDay(date, { 'Print?': false });
      printBox.appendChild(h('a', { class: 'plain italic print-done', href: '#/gallery' }, 'printed — in the gallery ↗'));
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
  }

  // ------------------------------------------------------------- the timeline
  // one lane per active instrument, all sharing one x-axis (0..1440
  // minutes) with the ruler above. no more rail/drag-a-chip — the lane
  // itself IS the instrument, so a tap on its own empty track places it.
  // every mark stretches from both edges (the Spans flag is ignored).

  function minutesToPct(min) { return Math.max(0, Math.min(100, (min / 1440) * 100)); }

  function positionMarkEl(el, row) {
    el.style.left = `${minutesToPct(row.f.Start)}%`;
    el.style.width = `${minutesToPct((row.f.End != null ? row.f.End : row.f.Start + 30) - row.f.Start)}%`;
  }

  async function placeOn(inst, start) {
    const s = Math.max(0, Math.min(1409, Math.round(start)));
    const end = Math.min(1439, s + 30);
    await store.placeInstrument({ instrument: inst.f.Name, date, start: s, end });
    renderMarks();
    renderPlate(true);
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
  // together, preserving duration); dragging the left handle moves Start
  // alone; dragging the right handle moves End alone. a tap (near-zero
  // movement on the body) opens the edit sheet instead. setPointerCapture
  // + stopPropagation on every one of these so a horizontal slide never
  // reaches bindSwipe — belt & suspenders alongside .timeline-section
  // already being excluded from swipe's own interactive() check.
  function bindMarkDrag(el, row, trackEl, leftHandle, rightHandle) {
    const WOBBLE = 8;
    let pid = null, sx = 0, sy = 0, moved = false, startStart = 0, startEnd = 0;
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
      const r = trackEl.getBoundingClientRect();
      const deltaMin = (dx / r.width) * 1440;
      const dur = startEnd - startStart;
      const newStart = Math.max(0, Math.min(1440 - dur, Math.round(startStart + deltaMin)));
      row.f.Start = newStart;
      row.f.End = newStart + dur;
      positionMarkEl(el, row);
    }
    function up(e) {
      if (pid !== e.pointerId) return;
      pid = null;
      if (!moved) { openInstrumentSheet(row); return; }
      store.adjustTimeline(row.f.Key, { Start: row.f.Start, End: row.f.End });
      renderPlate(true);
      scheduleDaySync();
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { pid = null; moved = false; });

    bindHandle(leftHandle, 'left');
    bindHandle(rightHandle, 'right');

    function bindHandle(handle, side) {
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
          row.f.End = Math.max(hStart + 5, Math.min(1439, Math.round(hEnd + deltaMin)));
        } else {
          row.f.Start = Math.min(hEnd - 5, Math.max(0, Math.round(hStart + deltaMin)));
        }
        positionMarkEl(el, row);
      }
      function hup(e) {
        if (hpid !== e.pointerId) return;
        hpid = null;
        store.adjustTimeline(row.f.Key, { Start: row.f.Start, End: row.f.End });
        renderPlate(true);
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
      const span = h('div', { class: 'tl-span' });
      span.style.setProperty('--hue', hueFor(inst.f.Name));
      positionMarkEl(span, row);
      span.appendChild(h('span', { class: 'tl-span-glyph' }, glyphChar(inst.f.Glyph)));
      const leftHandle = h('button', { class: 'plain tl-handle tl-handle-left', 'aria-label': 'adjust start' });
      const rightHandle = h('button', { class: 'plain tl-handle tl-handle-right', 'aria-label': 'adjust end' });
      span.appendChild(leftHandle);
      span.appendChild(rightHandle);
      bindMarkDrag(span, row, trackEl, leftHandle, rightHandle);
      trackEl.appendChild(span);
    }
  }

  function renderLanes() {
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

    for (const inst of store.activeInstruments()) {
      const label = h('div', { class: 'tl-lane-label' }, [
        h('span', { class: 'tl-lane-glyph' }, glyphChar(inst.f.Glyph)),
        h('span', { class: 'tl-lane-name' }, inst.f.Name),
      ]);
      if (date === today) {
        const nowBtn = h('button', { class: 'plain tl-lane-now' }, 'now');
        nowBtn.addEventListener('click', () => placeOn(inst, nowMinutes()));
        label.appendChild(nowBtn);
      }
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
    const timeText = row.f.End != null
      ? `${fmtClock(row.f.Start)} – ${fmtClock(row.f.End)} · ${fmtDuration(row.f.End - row.f.Start)}`
      : fmtClock(row.f.Start);
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
      renderPlate(true);
      scheduleDaySync();
    });
    instSheet.appendChild(delBtn);

    instSheet.classList.add('open');
    instBackdrop.classList.add('open');
  }

  // ------------------------------------------------------- personal | work
  // a delicate 1-5 slider: a thin track, 5 tick stops, a handle that only
  // appears once a value is set (unset reads as visibly bare, not "3-ish").
  // tap anywhere to jump to the nearest stop; drag continuously with
  // snapping; both paths end at the same commit, so there's no special
  // casing between "a tap" and "a drag that didn't move".

  const AXES = ['alignment', 'novelty', 'agency'];

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
    for (const domain of ['personal', 'work']) {
      const col = h('div', { class: 'domain-col' });
      col.appendChild(h('h3', { class: 'italic' }, domain));
      for (const axis of AXES) {
        const rowEl = h('div', { class: 'rating-row' });
        rowEl.appendChild(h('div', { class: 'rating-label italic dim' }, axis));
        rowEl.appendChild(buildRatingSlider(domain, axis));
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

  renderPlate();
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
    window.removeEventListener('resize', onResize);
    stopPollPrint();
    if (syncTimer) runDaySync(); // flush a pending write before leaving
  };
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

  // editors ---------------------------------------------------------
  root.appendChild(rowEditor('Habits', 'habits', [
    { key: 'Seeds', type: 'number', width: 70 },
  ], () => ({ Variety: 1 + Math.floor(Math.random() * 900), Order: nextOrder('Habits'), Active: true, Seeds: 3 })));

  root.appendChild(tagsEditor());

  root.appendChild(shopEditor());

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/day/' }, 'the day'),
    h('a', { href: '#/hour' }, 'the hour'),
  ]);
  app.appendChild(hints);
  return () => {};
}

function nextOrder(table) {
  const rows = store.S.data[table] || [];
  return 1 + rows.reduce((m, r) => Math.max(m, r.f.Order || 0), 0);
}

// rename in place (never a duplicate) and only when it actually changed
function renameRow(table, row, newName) {
  const nm = newName.trim();
  if (!nm || nm === row.f.Name) return Promise.resolve();
  return store.renameNamed(table, row.f.Name, nm);
}
// a small ✕ that deletes a roster row after a confirm — gone from the
// options, but past days keep whatever used its name
function deleteX(table, row, after) {
  const x = h('button', { class: 'plain tend-x', 'aria-label': `delete ${row.f.Name}` }, '✕');
  x.addEventListener('click', async () => {
    if (!window.confirm(`delete “${row.f.Name}”? past days keep it; it just stops being offered.`)) return;
    await store.deleteNamed(table, row.f.Name);
    after();
  });
  return x;
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
      // the bonus flag — a starred habit sits outside the day's total:
      // skipping it never lowers the score, doing it adds points on top
      const bonus = h('input', { type: 'checkbox' });
      bonus.checked = !!row.f.Bonus;
      bonus.addEventListener('change', () => {
        store.upsertRow(table, 'Name', { Name: row.f.Name, Bonus: bonus.checked });
      });
      const flags = h('div', { class: 'tend-flags' }, [
        h('label', { class: 'checklabel', title: 'bonus — outside the total; adds points when done' }, [bonus, '✦']),
        h('label', { class: 'checklabel' }, [active, 'on']),
      ]);
      const line = h('div', { class: 'tend-row' },
        [nameInput, ...fieldInputs, flags, deleteX(table, row, renderList)]);
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
      list.appendChild(h('div', { class: 'tend-row' }, [nameInput, costInput, h('label', { class: 'checklabel' }, [active, 'on']), deleteX(table, row, renderList)]));
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

// the tag vocabulary — the words offered as chips when catching a moment.
// add one here (or just type it while capturing); delete one to stop it
// being offered, without touching the days that already used it.
function tagsEditor() {
  const table = 'Tags';
  const section = h('div', { class: 'tend-section' });
  section.appendChild(h('h2', {}, 'tags'));
  section.appendChild(h('div', { class: 'tend-warning italic', style: 'margin-top:0' },
    'deleting a tag only drops it from the chips — past days keep it.'));
  const list = h('div', { class: 'tend-list' });
  section.appendChild(list);

  function renderList() {
    clear(list);
    const rows = [...(store.S.data.Tags || [])].sort((a, b) => (a.f.Order || 0) - (b.f.Order || 0));
    if (!rows.length) {
      list.appendChild(h('div', { class: 'dim italic' }, 'no tags yet — type one while catching a moment, or add below.'));
      return;
    }
    for (const row of rows) {
      const nameInput = h('input', { type: 'text', class: 'field' });
      nameInput.value = row.f.Name || '';
      nameInput.addEventListener('blur', () => renameRow(table, row, nameInput.value).then(renderList));
      const active = h('input', { type: 'checkbox' });
      active.checked = !!row.f.Active;
      active.addEventListener('change', () => store.upsertRow(table, 'Name', { Name: row.f.Name, Active: active.checked }));
      list.appendChild(h('div', { class: 'tend-row' },
        [nameInput, h('label', { class: 'checklabel' }, [active, 'on']), deleteX(table, row, renderList)]));
    }
  }
  renderList();

  const addName = h('input', { type: 'text', placeholder: 'a new tag…', class: 'field' });
  const addBtn = h('button', { class: 'btn' }, 'add');
  addBtn.addEventListener('click', async () => {
    const name = addName.value.trim();
    if (!name) return;
    await store.ensureTag(name);
    addName.value = '';
    renderList();
  });
  section.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, [addName, addBtn]));
  return section;
}
