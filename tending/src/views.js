// views.js — the rooms. each mount* function renders into `app` and
// returns a cleanup function (timers, listeners) called before the router
// moves on.

import * as store from './store.js';
import { plantSVG, daySVG } from './bloom.js';

// ------------------------------------------------------------------ dom

function h(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v; // only ever fed markup we generated (bloom.js svg)
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
    return t.closest && t.closest('button, a, input, textarea, select, .plant-slot, .gather, .schedule, .instrument, .instrument-panel');
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

const COHORT_WORD = ['today', 'yesterday', 'two days ago', 'three days ago', 'four days ago'];
function cohortLabel(age) { return COHORT_WORD[age] || `${age} days ago`; }
function daysLeftWord(n) { return n === 1 ? 'one day left' : `${n} days left`; }

// ==================================================================== day

export function mountDay(app, date) {
  const today = store.todayISO();
  const root = h('div', { class: 'room' });
  app.appendChild(root);

  const wallet = h('button', { class: 'wallet', onclick: () => (location.hash = '#/shop') });
  app.appendChild(wallet);

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

  const bed = h('div', { class: 'bed' });
  root.appendChild(bed);

  const hoursLine = h('div', { class: 'hours-line' });
  root.appendChild(hoursLine);

  const momentsText = h('div', { class: 'moments-text' });
  root.appendChild(momentsText);

  const pollen = h('div', { class: 'pollen' });
  root.appendChild(pollen);

  const schedule = h('div', { class: 'schedule' });
  root.appendChild(schedule);

  const instruments = h('div', { class: 'instruments' });
  root.appendChild(instruments);

  const noteLine = h('div', { class: 'note-line' });
  root.appendChild(noteLine);

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/meadow' }, 'the meadow'),
    h('a', { href: '#/shop' }, 'the shop'),
    h('a', { href: '#/hour' }, 'the hour'),
    h('a', { href: '#/unwind' }, 'unwind'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  app.appendChild(hints);

  function renderWallet() {
    clear(wallet);
    wallet.appendChild(h('span', { class: 'dot' }, '◦ '));
    wallet.appendChild(document.createTextNode(`${store.wallet()} seeds`));
  }

  function renderBed() {
    clear(bed);
    const habits = store.activeHabits();
    if (!habits.length) {
      bed.appendChild(h('div', { class: 'dim italic' }, 'no habits planted yet — tend the garden.'));
      return;
    }
    for (const habit of habits) {
      const slot = h('div', { class: 'plant-slot' });
      const svgWrap = h('div');
      const label = h('div', { class: 'label' }, habit.f.Name || '');
      const float = h('div', { class: 'float' });
      slot.appendChild(svgWrap);
      slot.appendChild(label);
      slot.appendChild(float);
      bed.appendChild(slot);

      function paint() {
        const tick = store.tickFor(date, habit.f.Name);
        const state = tick ? 'bloom' : 'bud';
        slot.classList.toggle('bloom', !!tick);
        svgWrap.innerHTML = plantSVG({ seed: habit.f.Variety || 1, state, w: 62, h: 108 });
        slot.style.animationDelay = `${((habit.f.Variety || 1) % 40) / 10}s`;
      }
      paint();

      slot.addEventListener('click', async () => {
        const tick = store.tickFor(date, habit.f.Name);
        if (!tick) {
          await store.tick(date, habit);
          paint();
          float.textContent = `+${habit.f.Seeds || 0} seeds`;
          float.classList.remove('go'); void float.offsetWidth; float.classList.add('go');
          renderPollen();
        } else if (tick.f.Status === 'unclaimed') {
          await store.untick(date, habit.f.Name);
          paint();
          renderPollen();
        }
      });
    }
  }

  function renderHoursLine() {
    clear(hoursLine);
    const moments = store.momentsFor(date);
    const track = h('div', { class: 'hours-track' });
    hoursLine.appendChild(track);
    let dayIdx = 0;
    for (const m of moments) {
      let leftPct;
      if (m.f.Sure === 'day') {
        leftPct = 1.5 + dayIdx * 2.6;
        dayIdx++;
      } else {
        const parts = (m.f.Time || '00:00').split(':').map(Number);
        const minutes = (parts[0] || 0) * 60 + (parts[1] || 0);
        leftPct = Math.min(98, (minutes / 1440) * 100);
      }
      const mote = h('button', { class: 'hour-mote plain', style: `left:${leftPct.toFixed(2)}%` });
      mote.appendChild(h('span', { class: 'dot' }));
      mote.addEventListener('click', (e) => {
        e.stopPropagation();
        showRibbon(m.f.Key, momentDetail(m.f.Key));
      });
      track.appendChild(mote);
    }

    // the visible tag stream — times, plainly, so capture is legible at
    // a glance (not just tiny motes on a line)
    clear(momentsText);
    if (!moments.length) {
      momentsText.appendChild(h('span', { class: 'dim italic' },
        'the day’s moments will hang here — tap now to catch one.'));
      return;
    }
    moments.forEach((m, i) => {
      const label = m.f.Sure === 'day' ? 'all day' : (m.f.Time || '');
      const val = m.f.Value != null ? ` ${m.f.Value}` : '';
      const btn = h('button', { class: 'plain moment-chip italic' }, `${label} ${m.f.Tag}${val}`);
      btn.addEventListener('click', () => showRibbon(m.f.Key, momentDetail(m.f.Key)));
      momentsText.appendChild(btn);
      if (i < moments.length - 1) momentsText.appendChild(document.createTextNode(' · '));
    });
  }

  function renderPollen() {
    clear(pollen);
    const groups = {};
    for (const t of store.pendingTicks()) {
      (groups[t.f.Date] = groups[t.f.Date] || []).push(t);
    }
    const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));
    const cohorts = h('div', { class: 'cohorts' });
    if (!dates.length) {
      cohorts.appendChild(h('span', { class: 'dim' }, 'no pollen waiting.'));
    } else {
      dates.forEach((d, i) => {
        const age = store.daysBetween(d, today);
        const seeds = groups[d].reduce((a, t) => a + (t.f.Seeds || 0), 0);
        const left = store.GATHER_DAYS - age;
        let text = `${cohortLabel(age)} · ${seeds}`;
        if (age >= 1) text += ` — ${daysLeftWord(left)}`;
        cohorts.appendChild(h('span', { class: 'n' }, text));
        if (i < dates.length - 1) cohorts.appendChild(document.createTextNode('   '));
      });
    }
    pollen.appendChild(cohorts);
    const gatherBtn = h('div', { class: 'gather italic dim' }, 'gather — press & hold');
    pollen.appendChild(gatherBtn);
    if (dates.length) {
      holdToAct(gatherBtn, {
        ms: 900,
        onComplete: async () => {
          const got = await store.gather();
          renderPollen();
          renderWallet();
          if (got) whisper(`${got} seeds gathered.`, 2200);
        },
      });
    }
  }

  function renderSchedule() {
    clear(schedule);
    const day = store.dayFor(date);
    const text = (day && day.f.Schedule) || '';
    const view = h('div');
    function showText() {
      clear(view);
      if (!text.trim()) {
        view.appendChild(h('div', { class: 'line empty italic' }, 'the day, gently — click to add a line.'));
      } else {
        for (const line of text.split('\n').filter((l) => l.trim())) {
          view.appendChild(h('div', { class: 'line italic' }, line));
        }
      }
    }
    showText();
    view.addEventListener('click', () => {
      const ta = h('textarea', { class: 'field', placeholder: '14:00 — dentist' });
      ta.value = text;
      clear(schedule);
      schedule.appendChild(ta);
      ta.focus();
      ta.addEventListener('blur', async () => {
        await store.saveDay(date, { Schedule: ta.value });
        renderSchedule();
      });
    });
    clear(schedule);
    schedule.appendChild(view);
  }

  let openTracker = null;
  function renderInstruments() {
    clear(instruments);
    const trackers = store.activeTrackers();
    if (!trackers.length) {
      instruments.appendChild(h('div', { class: 'dim italic' }, 'no instruments set — tend to add some.'));
      return;
    }
    for (const tracker of trackers) {
      const entry = store.entryFor(date, tracker.f.Name);
      const row = h('div', { class: 'instrument' });
      const disp = displayFor(tracker, entry);
      row.appendChild(h('span', { class: 'k' }, `${tracker.f.Name} `));
      row.appendChild(h('span', { class: 'v' }, disp));
      row.addEventListener('click', () => {
        openTracker = openTracker === tracker.f.Name ? null : tracker.f.Name;
        renderInstruments();
        renderPanel();
      });
      instruments.appendChild(row);
    }
  }

  function renderPanel() {
    let panel = instruments.nextSibling && instruments.nextSibling.classList && instruments.nextSibling.classList.contains('instrument-panel')
      ? instruments.nextSibling : null;
    if (panel) panel.remove();
    if (!openTracker) return;
    const tracker = store.activeTrackers().find((t) => t.f.Name === openTracker);
    if (!tracker) return;
    const entry = store.entryFor(date, tracker.f.Name);
    panel = h('div', { class: 'instrument-panel' });
    buildControl(panel, tracker, entry, async (value, words) => {
      await store.saveEntry(date, tracker, value, words);
      renderInstruments();
      renderPanel();
    });
    instruments.insertAdjacentElement('afterend', panel);
  }

  function renderNote() {
    clear(noteLine);
    const day = store.dayFor(date);
    const input = h('input', { class: 'field', placeholder: 'a line for the day…' });
    input.value = (day && day.f.Note) || '';
    input.addEventListener('blur', async () => {
      await store.saveDay(date, { Note: input.value });
    });
    noteLine.appendChild(input);
  }

  // -------------------------------------------------- moments, caught in passing
  const backdrop = h('div', { class: 'moment-backdrop' });
  const sheet = h('div', { class: 'moment-sheet' });
  const ribbon = h('div', { class: 'moment-ribbon' });
  const nowMote = h('button', { class: 'now-mote', 'aria-label': 'catch a moment' }, [h('span', { class: 'now-label italic' }, 'now')]);
  app.appendChild(backdrop);
  app.appendChild(sheet);
  app.appendChild(ribbon);
  app.appendChild(nowMote);

  let ribbonTimer = null;
  function hideRibbon() {
    clearTimeout(ribbonTimer);
    ribbon.classList.remove('open');
  }
  function showRibbon(momentKey, detailText) {
    clearTimeout(ribbonTimer);
    clear(ribbon);
    if (detailText) ribbon.appendChild(h('div', { class: 'ribbon-detail italic' }, detailText));
    const line = h('div', { class: 'ribbon-line' });
    ribbon.appendChild(line);
    function main() {
      clear(line);
      const mk = (label, fn) => { const b = h('button', { class: 'plain' }, label); b.addEventListener('click', fn); return b; };
      line.appendChild(mk('just now', () => hideRibbon()));
      line.appendChild(mk('about then', async () => { await store.adjustMoment(momentKey, { Sure: 'about' }); renderHoursLine(); hideRibbon(); }));
      line.appendChild(mk('earlier…', () => offsets()));
      line.appendChild(mk('all day', async () => { await store.adjustMoment(momentKey, { Sure: 'day' }); renderHoursLine(); hideRibbon(); }));
      line.appendChild(mk('✕', async () => { await store.removeMoment(momentKey); renderHoursLine(); hideRibbon(); }));
    }
    function offsets() {
      clearTimeout(ribbonTimer);
      clear(line);
      const OFFS = [
        ['−15m', (t) => addMinutes(t, -15)],
        ['−1h', (t) => addMinutes(t, -60)],
        ['−3h', (t) => addMinutes(t, -180)],
        ['this morning', () => '08:00'],
      ];
      const m = store.S.data.Moments.find((x) => x.f.Key === momentKey);
      const baseTime = (m && m.f.Time) || '00:00';
      for (const [label, fn] of OFFS) {
        const b = h('button', { class: 'plain' }, label);
        b.addEventListener('click', async () => {
          await store.adjustMoment(momentKey, { Time: fn(baseTime), Sure: 'about' });
          renderHoursLine();
          hideRibbon();
        });
        line.appendChild(b);
      }
      ribbonTimer = setTimeout(hideRibbon, 4000);
    }
    main();
    ribbon.classList.add('open');
    ribbonTimer = setTimeout(hideRibbon, 4000);
  }
  function addMinutes(hhmm, delta) {
    const [hh, mm] = hhmm.split(':').map(Number);
    let total = ((hh || 0) * 60 + (mm || 0) + delta) % 1440;
    if (total < 0) total += 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function momentDetail(key) {
    const m = store.S.data.Moments.find((x) => x.f.Key === key);
    if (!m) return '';
    const label = m.f.Sure === 'day' ? 'all day' : (m.f.Time || '');
    const val = m.f.Value != null ? ` ${m.f.Value}` : '';
    return `${label} · ${m.f.Tag}${val} — ${m.f.Sure}`;
  }

  // the running stream's own inline ribbon — no timer here; it stays
  // exactly as long as the sheet does, since the sheet itself is now the
  // ceremony (a dump, not a single capture)
  function buildInlineRibbon(container, momentKey, onChange) {
    function main() {
      clear(container);
      const line = h('div', { class: 'ribbon-line' });
      const mk = (label, fn) => { const b = h('button', { class: 'plain' }, label); b.addEventListener('click', fn); return b; };
      line.appendChild(mk('about then', async () => { await store.adjustMoment(momentKey, { Sure: 'about' }); onChange(); }));
      line.appendChild(mk('earlier…', () => offsets()));
      line.appendChild(mk('all day', async () => { await store.adjustMoment(momentKey, { Sure: 'day' }); onChange(); }));
      line.appendChild(mk('✕', async () => { await store.removeMoment(momentKey); onChange(); }));
      container.appendChild(line);
    }
    function offsets() {
      clear(container);
      const line = h('div', { class: 'ribbon-line' });
      const OFFS = [
        ['−15m', (t) => addMinutes(t, -15)],
        ['−1h', (t) => addMinutes(t, -60)],
        ['−3h', (t) => addMinutes(t, -180)],
        ['this morning', () => '08:00'],
      ];
      const m = store.S.data.Moments.find((x) => x.f.Key === momentKey);
      const baseTime = (m && m.f.Time) || '00:00';
      for (const [label, fn] of OFFS) {
        const b = h('button', { class: 'plain' }, label);
        b.addEventListener('click', async () => {
          await store.adjustMoment(momentKey, { Time: fn(baseTime), Sure: 'about' });
          onChange();
        });
        line.appendChild(b);
      }
      container.appendChild(line);
    }
    main();
  }

  function closeSheet() {
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    nowMote.classList.remove('away');
    sheet.style.transform = '';
  }

  // iOS focusing an input the instant a fixed sheet slides up can jump
  // the scroll/viewport; skip the autofocus there (a tap still opens the
  // keyboard whenever she actually wants to type a tag).
  const IOS_LIKE = /iP(ad|hone|od)/.test(navigator.platform || '')
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function openSheet() {
    hideRibbon();
    nowMote.classList.add('away');
    clear(sheet);

    const top = h('div', { class: 'sheet-top' });
    top.appendChild(h('div', { class: 'sheet-handle' }));
    const closeBtn = h('button', { class: 'sheet-close plain', 'aria-label': 'close' }, '✕');
    closeBtn.addEventListener('click', () => closeSheet());
    top.appendChild(closeBtn);
    sheet.appendChild(top);
    bindHandleSwipeDown(top);

    const chips = h('div', { class: 'chip-row' });
    for (const tag of store.tagChips(8)) {
      const chip = h('button', { class: 'chip' }, tag);
      chip.addEventListener('click', () => captureFromChip(tag));
      chips.appendChild(chip);
    }
    sheet.appendChild(chips);

    const input = h('input', { class: 'field new-tag', placeholder: 'type a tag…' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        captureFromChip(input.value.trim());
        input.value = '';
      }
    });
    sheet.appendChild(input);

    const petalSlot = h('div', { class: 'petal-slot' });
    sheet.appendChild(petalSlot);

    const streamLabel = h('div', { class: 'stream-label dim italic' }, 'just now');
    sheet.appendChild(streamLabel);
    const stream = h('div', { class: 'stream' });
    sheet.appendChild(stream);

    function renderStream() {
      clear(stream);
      const list = store.momentsFor(date).slice().reverse();
      streamLabel.hidden = !list.length;
      for (const m of list) stream.appendChild(streamEntry(m));
    }
    function streamEntry(m) {
      const label = m.f.Sure === 'day' ? 'all day' : (m.f.Time || '');
      const val = m.f.Value != null ? ` ${m.f.Value}` : '';
      const row = h('button', { class: 'stream-row plain' }, `${label} · ${m.f.Tag}${val}`);
      const detail = h('div', { class: 'stream-detail' });
      detail.hidden = true;
      row.addEventListener('click', () => {
        const wasHidden = detail.hidden;
        stream.querySelectorAll('.stream-detail').forEach((d) => { d.hidden = true; });
        detail.hidden = !wasHidden;
      });
      buildInlineRibbon(detail, m.f.Key, () => { renderHoursLine(); renderStream(); });
      return h('div', { class: 'stream-entry' }, [row, detail]);
    }

    function petalStepInline(tracker, key) {
      clear(petalSlot);
      const min = tracker.f.Min ?? 0, max = tracker.f.Max ?? 5;
      petalSlot.appendChild(h('div', { class: 'dim italic petal-hint' }, `${tracker.f.Name} — optional`));
      const row = h('div', { class: 'mini-petals' });
      for (let i = min; i <= max; i++) {
        const p = h('button', { class: 'mini-petal' }, String(i));
        p.addEventListener('click', async () => {
          await store.adjustMoment(key, { Value: i });
          renderHoursLine();
          clear(petalSlot);
          renderStream();
        });
        row.appendChild(p);
      }
      petalSlot.appendChild(row);
      const skip = h('button', { class: 'plain italic petal-skip' }, 'skip');
      skip.addEventListener('click', () => clear(petalSlot));
      petalSlot.appendChild(skip);
    }

    async function captureFromChip(tag) {
      const key = await store.captureMoment({ tag, date });
      renderHoursLine();
      renderStream();
      const tracker = store.activeTrackers().find((t) => t.f.Name === tag && t.f.Kind === 'scale');
      if (tracker) petalStepInline(tracker, key);
      else clear(petalSlot);
    }

    sheet.classList.add('open');
    backdrop.classList.add('open');
    renderStream();
    if (!IOS_LIKE) setTimeout(() => input.focus(), 260);
  }

  // swipe-down on the sheet's own handle closes it — scoped to the handle
  // (not the whole sheet) so dragging inside the tag/stream list still
  // scrolls normally; rebound on each open since `top` is a fresh element
  function bindHandleSwipeDown(handle) {
    let sy = 0, active = false, pid = null;
    function down(e) {
      // never on the close button: capturing the pointer here would
      // swallow its click entirely (setPointerCapture reroutes all
      // subsequent pointer/click resolution to the capturing element)
      if (e.target.closest('button')) return;
      active = true; sy = e.clientY; pid = e.pointerId;
      try { handle.setPointerCapture(pid); } catch {}
    }
    function move(e) {
      if (!active || e.pointerId !== pid) return;
      const dy = e.clientY - sy;
      if (dy > 4) sheet.style.transform = `translateY(${Math.min(dy, 220)}px)`;
    }
    function up(e) {
      if (!active || e.pointerId !== pid) return;
      active = false;
      const dy = e.clientY - sy;
      sheet.style.transform = '';
      if (dy > 60) closeSheet();
    }
    handle.addEventListener('pointerdown', down);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  nowMote.addEventListener('click', () => {
    if (sheet.classList.contains('open')) closeSheet();
    else openSheet();
  });
  backdrop.addEventListener('click', () => closeSheet());

  renderWallet();
  renderBed();
  renderHoursLine();
  renderPollen();
  renderSchedule();
  renderInstruments();
  renderNote();

  const unbindSwipe = bindSwipe(root, {
    onLeft: () => (location.hash = `#/day/${store.addDays(date, 1)}`),
    onRight: () => (location.hash = `#/day/${store.addDays(date, -1)}`),
  });

  return () => { unbindSwipe(); clearTimeout(ribbonTimer); };
}

function displayFor(tracker, entry) {
  const kind = tracker.f.Kind;
  const f = entry && entry.f;
  if (!f || (f.Value == null && !f.Words)) return '–';
  if (kind === 'yesno') return f.Value ? 'yes' : 'no';
  if (kind === 'words') return f.Words ? (f.Words.length > 24 ? f.Words.slice(0, 24) + '…' : f.Words) : '–';
  if (f.Value == null) return '–';
  return Number.isInteger(f.Value) ? String(f.Value) : f.Value.toFixed(1);
}

function buildControl(panel, tracker, entry, onSave) {
  const kind = tracker.f.Kind;
  const min = tracker.f.Min ?? 0, max = tracker.f.Max ?? 5;
  const cur = entry && entry.f;
  if (kind === 'scale') {
    const value = cur && cur.Value != null ? cur.Value : null;
    const dots = h('div', { class: 'dots' });
    for (let i = min; i <= max; i++) {
      const dot = h('button', { class: value != null && i <= value ? 'on' : '' });
      dot.addEventListener('click', () => onSave(i));
      dots.appendChild(dot);
    }
    panel.appendChild(dots);
  } else if (kind === 'yesno') {
    const value = cur && cur.Value != null ? cur.Value : null;
    const row = h('div', { class: 'yesno-row' });
    const yes = h('button', { class: 'plain' + (value === 1 ? ' on' : '') }, 'yes');
    const no = h('button', { class: 'plain' + (value === 0 ? ' on' : '') }, 'no');
    yes.addEventListener('click', () => onSave(1));
    no.addEventListener('click', () => onSave(0));
    row.appendChild(yes); row.appendChild(no);
    panel.appendChild(row);
  } else if (kind === 'number') {
    let value = cur && cur.Value != null ? cur.Value : min;
    const wrap = h('div', { class: 'stepper' });
    const valEl = h('span', { class: 'val' }, String(value));
    const dec = h('button', {}, '–');
    const inc = h('button', {}, '+');
    let timer = null, held = null;
    function step(delta) {
      value = Math.max(min, Math.min(max, value + delta));
      valEl.textContent = String(value);
    }
    function commit() { onSave(value); }
    function pressStart(delta) {
      step(delta);
      held = setTimeout(function repeat() { step(delta); held = setTimeout(repeat, 110); }, 420);
    }
    function pressEnd() { clearTimeout(held); held = null; clearTimeout(timer); timer = setTimeout(commit, 400); }
    dec.addEventListener('pointerdown', () => pressStart(-1));
    inc.addEventListener('pointerdown', () => pressStart(1));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => {
      dec.addEventListener(ev, pressEnd); inc.addEventListener(ev, pressEnd);
    });
    wrap.appendChild(dec); wrap.appendChild(valEl); wrap.appendChild(inc);
    panel.appendChild(wrap);
  } else if (kind === 'words') {
    const ta = h('textarea', { class: 'field' });
    ta.value = (cur && cur.Words) || '';
    ta.addEventListener('blur', () => onSave(undefined, ta.value));
    panel.appendChild(ta);
  }
}

// ================================================================= meadow

export function mountMeadow(app) {
  const root = h('div', { class: 'room' });
  root.appendChild(h('div', { class: 'meadow-title italic' }, 'the meadow'));
  const strip = h('div', { class: 'meadow-strip' });
  root.appendChild(strip);
  root.appendChild(h('div', { class: 'legend' },
    'stem height — habits done · blooms — ticks · colour — mood · veil — fog · a star — a held hour'));
  app.appendChild(root);

  const habitsCount = Math.max(1, store.activeHabits().length);
  const today = store.todayISO();
  const N = 90;
  const days = [];
  for (let i = N - 1; i >= 0; i--) days.push(store.addDays(today, -i));

  // a full-habit day stands tall — roughly 40-45% of the viewport; even a
  // bare day still stands (the field is continuous, never gappy).
  const vh = window.innerHeight || 700;
  const PH = Math.round(vh * 0.525) + 12;
  const PW = Math.round(PH * 0.3);

  for (const d of days) {
    const ticksForDay = store.S.data.Ticks.filter((t) => t.f.Date === d);
    const ticks = ticksForDay.length;
    const doneRatio = Math.min(1, ticks / habitsCount);
    const mood = store.entryFor(d, 'mood');
    const fog = store.entryFor(d, 'brain fog');
    const fed = store.entryFor(d, 'ate enough');
    const heldHour = store.S.data.Hours.some((hh) => hh.f.Date === d && hh.f.Outcome === 'held');
    const daySeed = d.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

    const moodVal = mood && mood.f.Value != null ? mood.f.Value : null;
    const fogVal = fog && fog.f.Value != null ? fog.f.Value : null;
    const fedVal = fed && fed.f.Value != null ? fed.f.Value : null;
    const noData = ticks === 0 && moodVal == null && fogVal == null && fedVal == null && !heldHour;

    const summary = { doneRatio, ticks, mood: moodVal, fog: fogVal, fed: fedVal, heldHour, noData, daySeed };

    const cell = h('div', { class: 'meadow-day' });
    cell.innerHTML = daySVG(summary, PW, PH);
    const parts = [store.fmtDate(d)];
    if (noData) parts.push('nothing kept');
    else {
      parts.push(`${ticks} of ${habitsCount}`);
      if (fogVal != null) parts.push(`fog ${fogVal}`);
      if (fedVal != null) parts.push(fedVal ? 'fed yes' : 'fed no');
    }
    const tag = h('div', { class: 'tag' }, parts.join(' — '));
    cell.insertBefore(tag, cell.firstChild);
    cell.addEventListener('click', () => (location.hash = `#/day/${d}`));
    strip.appendChild(cell);
  }
  // land on "today" — after the browser has actually laid the strip out
  requestAnimationFrame(() => requestAnimationFrame(() => { strip.scrollLeft = strip.scrollWidth; }));

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/day/' }, 'the day'),
    h('a', { href: '#/shop' }, 'the shop'),
    h('a', { href: '#/hour' }, 'the hour'),
    h('a', { href: '#/unwind' }, 'unwind'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  app.appendChild(hints);
  return () => {};
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
    h('a', { href: '#/meadow' }, 'the meadow'),
    h('a', { href: '#/hour' }, 'the hour'),
    h('a', { href: '#/unwind' }, 'unwind'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  app.appendChild(hints);
  return () => {};
}

// ================================================================= unwind

export function mountUnwind(app) {
  const today = store.todayISO();
  const root = h('div', { class: 'unwind-room' });
  app.appendChild(root);
  const esc = h('div', { class: 'unwind-esc italic' }, 'esc — leave');
  app.appendChild(esc);

  // the harvest leads (payday first), then the scales — entirely
  // optional, skippable one at a time or all at once — then the note,
  // then the day made into a flower.
  const trackers = store.activeTrackers();
  const cards = [{ type: 'harvest' }, ...trackers.map((t) => ({ type: 'tracker', tracker: t })), { type: 'note' }, { type: 'final' }];
  let i = 0;
  let advanceTimer = null;

  function onKey(e) {
    if (e.key === 'Escape') { location.hash = '#/day/'; }
  }
  window.addEventListener('keydown', onKey);

  function advanceSoon(ms = 500) {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => { i++; renderCard(); }, ms);
  }

  function renderCard() {
    clearTimeout(advanceTimer);
    clear(root);
    if (i >= cards.length) { renderFinal(); return; }
    const card = cards[i];
    if (card.type === 'tracker') renderTrackerCard(card.tracker);
    else if (card.type === 'note') renderNoteCard();
    else if (card.type === 'harvest') renderHarvestCard();
    else renderFinal();
  }

  function renderHarvestCard() {
    if (!store.pendingTicks().length) { i++; renderCard(); return; }
    root.appendChild(h('div', { class: 'unwind-q' }, 'the harvest.'));
    const groups = {};
    for (const t of store.pendingTicks()) (groups[t.f.Date] = groups[t.f.Date] || []).push(t);
    const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));
    const cohorts = h('div', { class: 'cohorts' });
    dates.forEach((d, idx) => {
      const age = store.daysBetween(d, today);
      const seeds = groups[d].reduce((a, t) => a + (t.f.Seeds || 0), 0);
      cohorts.appendChild(h('span', { class: 'n' }, `${cohortLabel(age)} · ${seeds}`));
      if (idx < dates.length - 1) cohorts.appendChild(document.createTextNode('   '));
    });
    root.appendChild(cohorts);
    const holdEl = h('div', { class: 'gather italic' }, 'gather — press & hold');
    root.appendChild(holdEl);
    holdToAct(holdEl, {
      ms: 900,
      onComplete: async () => { await store.gather(); i++; renderCard(); },
    });
  }

  function renderTrackerCard(tracker) {
    const kind = tracker.f.Kind;
    const min = tracker.f.Min ?? 0, max = tracker.f.Max ?? 5;
    const existing = store.entryFor(today, tracker.f.Name);
    root.appendChild(h('div', { class: 'unwind-q' }, tracker.f.Ask || tracker.f.Name));

    // an answer locks the card — without this, a second tap (a real
    // finger's natural double-tap, or a mis-tap on a neighbouring petal)
    // just calls advanceSoon() again, which clearTimeouts the pending
    // advance and reschedules it; repeat that indefinitely and the card
    // never moves — this is very likely what read as "the questions
    // don't work" on a touchscreen.
    let answered = false;
    function lockedAdvance(ms) {
      if (answered) return;
      answered = true;
      advanceSoon(ms);
    }

    if (kind === 'scale') {
      const wrap = h('div', { class: 'petals' });
      const n = max - min + 1;
      for (let k = 0; k < n; k++) {
        const angle = -100 + (200 / (n - 1)) * k;
        const petal = h('button', { class: 'petal' }, String(min + k));
        petal.style.transform = `rotate(${angle}deg) translate(0, -100px) rotate(${-angle}deg)`;
        petal.addEventListener('click', async () => {
          if (answered) return;
          const val = min + k;
          [...wrap.children].forEach((c, ci) => c.classList.toggle('on', ci <= k));
          await store.saveEntry(today, tracker, val);
          lockedAdvance();
        });
        wrap.appendChild(petal);
      }
      if (existing && existing.f.Value != null) {
        [...wrap.children].forEach((c, ci) => c.classList.toggle('on', ci <= existing.f.Value - min));
      }
      root.appendChild(wrap);
    } else if (kind === 'yesno') {
      const wrap = h('div', { class: 'unwind-yesno' });
      const yes = h('button', { class: 'plain italic' }, 'yes');
      const no = h('button', { class: 'plain italic' }, 'no');
      yes.addEventListener('click', async () => { if (answered) return; await store.saveEntry(today, tracker, 1); lockedAdvance(); });
      no.addEventListener('click', async () => { if (answered) return; await store.saveEntry(today, tracker, 0); lockedAdvance(); });
      wrap.appendChild(yes); wrap.appendChild(no);
      root.appendChild(wrap);
    } else if (kind === 'number') {
      let value = existing && existing.f.Value != null ? existing.f.Value : min;
      const wrap = h('div', { class: 'stepper' });
      const valEl = h('span', { class: 'val' }, String(value));
      const dec = h('button', {}, '–');
      const inc = h('button', {}, '+');
      let held = null;
      function step(d) { value = Math.max(min, Math.min(max, value + d)); valEl.textContent = String(value); }
      function start(d) { if (answered) return; step(d); held = setTimeout(function r() { step(d); held = setTimeout(r, 110); }, 420); }
      function end() { clearTimeout(held); if (answered) return; store.saveEntry(today, tracker, value); lockedAdvance(700); }
      dec.addEventListener('pointerdown', () => start(-1));
      inc.addEventListener('pointerdown', () => start(1));
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => { dec.addEventListener(ev, end); inc.addEventListener(ev, end); });
      wrap.appendChild(dec); wrap.appendChild(valEl); wrap.appendChild(inc);
      root.appendChild(wrap);
    } else {
      const ta = h('textarea', { class: 'field unwind-note' });
      ta.value = (existing && existing.f.Words) || '';
      ta.addEventListener('blur', () => { if (answered) return; store.saveEntry(today, tracker, undefined, ta.value); lockedAdvance(300); });
      root.appendChild(ta);
      setTimeout(() => ta.focus(), 50);
    }

    const skipRow = h('div', { class: 'unwind-skip-row' });
    const skipOne = h('button', { class: 'plain italic' }, 'skip');
    skipOne.addEventListener('click', () => { if (answered) return; answered = true; advanceSoon(0); });
    skipRow.appendChild(skipOne);
    const noteIdx = cards.findIndex((c) => c.type === 'note');
    if (noteIdx > i) {
      const skipRest = h('button', { class: 'plain italic' }, 'skip the rest');
      skipRest.addEventListener('click', () => {
        answered = true;
        clearTimeout(advanceTimer);
        i = noteIdx;
        renderCard();
      });
      skipRow.appendChild(skipRest);
    }
    root.appendChild(skipRow);
  }

  function renderNoteCard() {
    root.appendChild(h('div', { class: 'unwind-q' }, 'a line for the day.'));
    const day = store.dayFor(today);
    const ta = h('textarea', { class: 'field unwind-note' });
    ta.value = (day && day.f.Note) || '';
    ta.addEventListener('blur', () => { store.saveDay(today, { Note: ta.value }); advanceSoon(300); });
    root.appendChild(ta);
    setTimeout(() => ta.focus(), 50);
  }

  function renderFinal() {
    const habitsCount = Math.max(1, store.activeHabits().length);
    const ticks = store.S.data.Ticks.filter((t) => t.f.Date === today).length;
    const mood = store.entryFor(today, 'mood');
    const fog = store.entryFor(today, 'brain fog');
    const fed = store.entryFor(today, 'ate enough');
    const heldHour = store.S.data.Hours.some((hh) => hh.f.Date === today && hh.f.Outcome === 'held');
    const summary = {
      doneRatio: Math.min(1, ticks / habitsCount), ticks,
      mood: mood && mood.f.Value != null ? mood.f.Value : null,
      fog: fog && fog.f.Value != null ? fog.f.Value : null,
      fed: fed && fed.f.Value != null ? fed.f.Value : null,
      heldHour,
    };
    // the moment of the night — grown large, centered, before "goodnight."
    const vh = window.innerHeight || 700;
    const fh = Math.round(vh * 0.5);
    const fw = Math.round(fh * 0.44);
    const plant = h('div', { class: 'unwind-plant' });
    plant.innerHTML = daySVG(summary, fw, fh);
    plant.style.opacity = '0';
    plant.style.transform = 'scale(0.7)';
    plant.style.transition = 'opacity 1.5s ease, transform 1.5s ease';
    root.appendChild(plant);
    root.appendChild(h('div', { class: 'unwind-goodnight' }, 'goodnight.'));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      plant.style.opacity = '1'; plant.style.transform = 'scale(1)';
    }));
  }

  renderCard();

  return () => { window.removeEventListener('keydown', onKey); clearTimeout(advanceTimer); };
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
    h('a', { href: '#/meadow' }, 'the meadow'),
    h('a', { href: '#/shop' }, 'the shop'),
    h('a', { href: '#/hour' }, 'the hour'),
    h('a', { href: '#/unwind' }, 'unwind'),
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
