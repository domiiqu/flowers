// views.js — the rooms. each mount* function renders into `app` and
// returns a cleanup function (timers, listeners) called before the router
// moves on.

import * as store from './store.js?v=13';
import { dayPrint } from './print.js?v=13';
import { computeWorldState, dayStateFields } from './world.js?v=13';
import * as gcal from './gcal.js?v=13';

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
function buildInlineTextAdd(btnClass, btnLabel, placeholder, onSubmit) {
  const wrap = h('div', { class: 'inline-add' });
  function showButton() {
    clear(wrap);
    const btn = h('button', { class: 'plain italic ' + btnClass }, btnLabel);
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

  // top-right: the day's points — the sum of the point values of the habits
  // done today (each habit's worth is set in tend). A dot appears under the
  // number as the day fills: light blue past 75%, ultramarine at 100%.
  // (The seed economy — waiting, gathering, the shop — is hidden for now.)
  const tally = h('div', { class: 'day-tally', 'aria-label': 'points today' });
  app.appendChild(tally);

  // the date itself is the page's face now — big and quiet, the arrows
  // small beside it.
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

  // the timeline — instruments placed on a line, midnight to midnight.
  // its own drag surface: excluded from swipe-to-change-day (see
  // bindSwipe's interactive() check) and every drag inside it captures
  // the pointer, so a horizontal slide never bubbles into that handler.
  // REPLACES the old ledger/hours-line/moments-capture apparatus.
  const timelineSection = h('div', { class: 'timeline-section day-col' });
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

  // day-long events — the union of active habits (the existing tick
  // economy) and active markers (Period, WFH, anything added inline).
  // REPLACES the old provenance ledger; drives the oak's leaf mass.
  const dayEvents = h('div', { class: 'day-events day-col' });
  root.appendChild(dayEvents);

  // personal | work — six 1-5 scales
  const domains = h('div', { class: 'domains day-col' });
  root.appendChild(domains);

  // a line for the day
  const notesBlock = h('div', { class: 'notes-block day-col' });
  root.appendChild(notesBlock);

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/shop' }, 'the shop'),
    h('a', { href: '#/hour' }, 'the hour'),
    h('a', { href: '#/gallery' }, 'the gallery'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  app.appendChild(hints);

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

  function dayPointsInfo() {
    const habits = store.activeHabits();
    let earned = 0, total = 0;
    for (const hb of habits) {
      const pts = hb.f.Seeds || 0;
      const done = !!store.tickFor(date, hb.f.Name);
      if (hb.f.Bonus) { if (done) earned += pts; }   // bonus: adds when done, never in the total
      else { total += pts; if (done) earned += pts; } // required: counts both ways
    }
    return { earned, total, ratio: total ? earned / total : (earned > 0 ? 1 : 0) };
  }
  function renderTally() {
    clear(tally);
    const { earned, ratio } = dayPointsInfo();
    tally.appendChild(h('div', { class: 'tally-num' }, String(earned)));
    if (ratio >= 1) tally.appendChild(h('span', { class: 'tally-dot full' }));
    else if (ratio >= 0.75) tally.appendChild(h('span', { class: 'tally-dot near' }));
  }

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

  // ---------------------------------------------------------- day-long events
  // one calm, uniform pill row: the union of active habits (the existing
  // tick economy) and active markers (Period, WFH, anything added inline).
  // a bonus habit still wears its ✦; markers and habits otherwise look
  // exactly alike, on purpose — this is one idea (a day-event), not two.

  function renderDayEvents() {
    clear(dayEvents);
    const items = [...store.activeHabits(), ...store.activeMarkers()];
    if (!items.length) {
      dayEvents.appendChild(h('div', { class: 'dim italic' }, 'no day-events yet — tend the garden.'));
    }
    for (const item of items) {
      const isHabit = store.S.data.Habits.includes(item);
      const lit = isHabit ? !!store.tickFor(date, item.f.Name) : !!store.markFor(date, item.f.Name);
      const btn = h('button', { class: 'plain italic day-event' + (lit ? ' lit' : '') + (isHabit && item.f.Bonus ? ' bonus' : '') },
        item.f.Name || '');
      btn.addEventListener('click', async () => {
        await store.toggleDayEvent(date, item);
        renderDayEvents();
        renderTally();
        renderPlate(true);
        scheduleDaySync();
      });
      dayEvents.appendChild(btn);
    }
    dayEvents.appendChild(buildInlineTextAdd('day-event add', '+ add', 'a new day-event…', async (name) => {
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
    scheduleDaySync();
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
      scheduleDaySync();
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
      scheduleDaySync();
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
              scheduleDaySync();
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

  renderTally();
  renderPlate();
  renderPrint();
  renderSchedule();
  renderRail();
  renderMarks();
  renderDayEvents();
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
