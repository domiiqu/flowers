// views.js — the rooms. each mount* function renders into `app` and
// returns a cleanup function (timers, listeners) called before the router
// moves on.

import * as store from './store.js?v=8';
import { dayStateFields } from './world.js?v=8';
import * as gcal from './gcal.js?v=8';

// a moment's sureness, made visible on the hours line: exact is red (the
// timestamp is trusted), roughly a warm rose, all-day a calm blue that
// rests at the end of the day. tapping a dot walks this ring.
const SURE_COLOR = { exact: '#c94a3f', about: '#c98d84', day: '#5b82c4' };
const SURE_WORD = { exact: 'exact', about: 'roughly', day: 'all day' };
const SURE_NEXT = { exact: 'about', about: 'day', day: 'exact' };
const sureOf = (m) => SURE_COLOR[m.f.Sure] ? m.f.Sure : 'exact';

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
    return t.closest && t.closest('button, a, input, textarea, select');
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

  if (date !== today) {
    // labeled as a return trip, not a claim about what day this is —
    // "today" alone read as the app calling yesterday today.
    root.appendChild(h('div', { class: 'today-link' },
      h('button', { class: 'plain italic', onclick: () => (location.hash = '#/day/') }, '‹ back to today')));
  }

  // the day's shape — schedule as soft blocks (Google Calendar when
  // connected, otherwise editable blocks kept in Days.Schedule)
  const schedule = h('div', { class: 'schedule' });
  root.appendChild(schedule);

  // the print ritual — ask the base to paint the day, then show it here
  const printBox = h('div', { class: 'print-ritual' });
  root.appendChild(printBox);

  // the provenance ledger — habits as words; tap to tick, tap again to
  // take it back while it's still unclaimed
  const ledger = h('div', { class: 'ledger day-col' });
  root.appendChild(ledger);

  const hoursLine = h('div', { class: 'hours-line day-col' });
  root.appendChild(hoursLine);

  const momentsText = h('div', { class: 'moments-text day-col' });
  root.appendChild(momentsText);

  const hints = h('div', { class: 'hints' }, [
    h('a', { href: '#/gallery' }, 'the gallery'),
    h('a', { href: '#/hour' }, 'the hour'),
    h('a', { href: '#/tend' }, 'tend'),
  ]);
  app.appendChild(hints);

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
  function printImageUrl(row) {
    if (!row) return '';
    for (const v of Object.values(row.f)) {
      if (Array.isArray(v) && v[0] && v[0].url && /image/i.test(v[0].type || '')) return v[0].url;
    }
    return '';
  }
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
      if (ok && printImageUrl(store.dayFor(date))) { stopPollPrint(); renderPrint(); }
      else if (tries >= 20) stopPollPrint(); // ~2 minutes
    }, 6000);
  }
  function stopPollPrint() { clearInterval(printTimer); printTimer = null; }

  function renderPrint() {
    clear(printBox);
    const row = store.dayFor(date);
    const url = printImageUrl(row);
    if (url) {
      stopPollPrint();
      // the print has landed — release the ritual flag so the press is
      // idle again (and re-printable later); harmless if already clear.
      if (row && row.f['Print?']) store.saveDay(date, { 'Print?': false });
      const a = h('a', { class: 'print-shown', href: url, target: '_blank', rel: 'noopener' },
        [h('img', { class: 'print-img', src: url, alt: 'the day, printed' })]);
      printBox.appendChild(a);
      return;
    }
    const requested = !!(row && row.f['Print?']);
    const btn = h('button', { class: 'plain print-btn italic' }, requested ? 'printing…' : 'print this day');
    if (requested) { btn.setAttribute('disabled', ''); pollForPrint(); }
    btn.addEventListener('click', async () => {
      await store.requestPrint(date);
      renderPrint();
      pollForPrint();
      whisper('the press is set — your print will appear here, and in the gallery.', 3800);
    });
    printBox.appendChild(btn);
  }

  function renderLedger() {
    clear(ledger);
    const habits = store.activeHabits();
    if (!habits.length) {
      ledger.appendChild(h('div', { class: 'dim italic' }, 'no habits planted yet — tend the garden.'));
      return;
    }
    habits.forEach((habit, i) => {
      const tick = store.tickFor(date, habit.f.Name);
      const word = h('button', { class: 'plain italic ledger-word' + (tick ? ' done' : '') + (habit.f.Bonus ? ' bonus' : '') },
        habit.f.Name || '');
      word.addEventListener('click', async () => {
        const cur = store.tickFor(date, habit.f.Name);
        if (!cur) {
          await store.tick(date, habit);
        } else if (cur.f.Status === 'unclaimed') {
          await store.untick(date, habit.f.Name);
        } else {
          return; // already gathered or withered — the ledger doesn't undo that
        }
        renderLedger();
        renderTally();
        scheduleDaySync();
      });
      ledger.appendChild(word);
      if (i < habits.length - 1) ledger.appendChild(h('span', { class: 'ledger-sep' }, '·'));
    });
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

  // which moment (by Key) is being edited right now — its dot is singled
  // out and the rest recede while this holds.
  let selectedKey = null;

  function timeToPct(time) {
    const parts = (time || '00:00').split(':').map(Number);
    const minutes = (parts[0] || 0) * 60 + (parts[1] || 0);
    return Math.min(98, (minutes / 1440) * 100);
  }
  // where along the track a pointer sits, 0..98% — the same scale the dots
  // are placed on, so a dot doesn't jump when you first grab it.
  function pctFromClientX(clientX, track) {
    const r = track.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.max(0, Math.min(98, ((clientX - r.left) / r.width) * 100));
  }
  function fmtMinutes(mins) {
    mins = ((Math.round(mins) % 1440) + 1440) % 1440;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }

  function renderHoursLine() {
    clear(hoursLine);
    const moments = store.momentsFor(date);
    hoursLine.classList.toggle('focus', !!selectedKey);
    const track = h('div', { class: 'hours-track' });
    hoursLine.appendChild(track);
    // all-day moments have no hour, so they gather at the day's end and
    // stack back from it; timed ones fall where their clock says.
    const dayMoments = moments.filter((m) => m.f.Sure === 'day');
    let dayIdx = 0;
    for (const m of moments) {
      let leftPct;
      if (m.f.Sure === 'day') {
        leftPct = Math.max(40, 97 - (dayMoments.length - 1 - dayIdx) * 3.2);
        dayIdx++;
      } else {
        leftPct = timeToPct(m.f.Time);
      }
      const sel = m.f.Key === selectedKey;
      const mote = h('button', { class: 'hour-mote plain' + (sel ? ' sel' : ''),
        style: `left:${leftPct.toFixed(2)}%`, 'aria-label': `${m.f.Tag} — ${SURE_WORD[sureOf(m)]}` });
      const dot = h('span', { class: 'dot' });
      dot.style.setProperty('--dot', SURE_COLOR[sureOf(m)]);
      mote.appendChild(dot);
      bindDot(mote, m, track);
      track.appendChild(mote);
    }

    // the visible tag stream — times, plainly, so capture is legible at
    // a glance (not just tiny motes on a line). fades while a dot is
    // being edited so it can't be mis-tapped.
    clear(momentsText);
    momentsText.classList.toggle('faded', !!selectedKey);
    if (!moments.length) {
      momentsText.appendChild(h('span', { class: 'dim italic' },
        'the day’s moments will hang here — tap tag to catch one.'));
      return;
    }
    moments.forEach((m, i) => {
      const label = m.f.Sure === 'day' ? 'all day' : (m.f.Time || '');
      const val = m.f.Value != null ? ` ${m.f.Value}` : '';
      const btn = h('button', { class: 'plain moment-chip italic' }, `${label} ${m.f.Tag}${val}`);
      btn.addEventListener('click', () => selectMoment(m.f.Key));
      momentsText.appendChild(btn);
      if (i < moments.length - 1) momentsText.appendChild(document.createTextNode(' · '));
    });
  }

  // one dot's whole hand-feel: a plain tap selects it (or, if already
  // selected, walks its colour through exact → roughly → all-day); a
  // press-and-drag slides it through the hours and commits the new time
  // on release. an all-day dot that gets dragged rejoins the clock.
  function bindDot(mote, m, track) {
    let sx = 0, pid = null, dragging = false;
    function down(e) {
      e.preventDefault(); e.stopPropagation();
      sx = e.clientX; pid = e.pointerId; dragging = false;
      try { mote.setPointerCapture(pid); } catch {}
    }
    function move(e) {
      if (pid == null || e.pointerId !== pid) return;
      if (!dragging && Math.abs(e.clientX - sx) > 6) dragging = true;
      if (dragging) {
        mote.classList.add('sel');
        mote.style.left = `${pctFromClientX(e.clientX, track).toFixed(2)}%`;
      }
    }
    async function up(e) {
      if (pid == null || e.pointerId !== pid) return;
      try { mote.releasePointerCapture(pid); } catch {}
      pid = null;
      if (dragging) {
        const minutes = (pctFromClientX(e.clientX, track) / 100) * 1440;
        const patch = { Time: fmtMinutes(minutes) };
        if (m.f.Sure === 'day') patch.Sure = 'about'; // it has a place in time now
        await store.adjustMoment(m.f.Key, patch);
        selectedKey = m.f.Key;
        renderHoursLine();
        showDetail(m.f.Key);
        scheduleDaySync();
      } else if (selectedKey === m.f.Key) {
        cycleSure(m.f.Key);
      } else {
        selectMoment(m.f.Key);
      }
    }
    function cancel() { pid = null; dragging = false; }
    mote.addEventListener('pointerdown', down);
    mote.addEventListener('pointermove', move);
    mote.addEventListener('pointerup', up);
    mote.addEventListener('pointercancel', cancel);
  }

  // the dot is small; once one is selected, let a drag ANYWHERE along the
  // line carry it — the whole timeline becomes its slider, far easier on a
  // thumb than grabbing an 8px dot. bound once; reads the live selection.
  function bindLineSlide() {
    let sliding = false, pid = null;
    const track = () => hoursLine.querySelector('.hours-track');
    const sel = () => hoursLine.querySelector('.hour-mote.sel');
    function place(clientX) {
      const t = track(), m = sel();
      if (t && m) m.style.left = `${pctFromClientX(clientX, t).toFixed(2)}%`;
    }
    hoursLine.addEventListener('pointerdown', (e) => {
      if (!selectedKey || e.target.closest('.hour-mote')) return; // dot has its own drag
      e.preventDefault(); e.stopPropagation();
      sliding = true; pid = e.pointerId;
      try { hoursLine.setPointerCapture(pid); } catch {}
      place(e.clientX);
    });
    hoursLine.addEventListener('pointermove', (e) => {
      if (sliding && e.pointerId === pid) place(e.clientX);
    });
    hoursLine.addEventListener('pointerup', async (e) => {
      if (!sliding || e.pointerId !== pid) return;
      sliding = false;
      try { hoursLine.releasePointerCapture(pid); } catch {}
      const t = track();
      if (!t || !selectedKey) return;
      const minutes = (pctFromClientX(e.clientX, t) / 100) * 1440;
      const m = store.S.data.Moments.find((x) => x.f.Key === selectedKey);
      const patch = { Time: fmtMinutes(minutes) };
      if (m && m.f.Sure === 'day') patch.Sure = 'about';
      await store.adjustMoment(selectedKey, patch);
      renderHoursLine();
      showDetail(selectedKey);
      scheduleDaySync();
    });
    hoursLine.addEventListener('pointercancel', () => { sliding = false; });
  }

  function selectMoment(key) {
    selectedKey = key;
    renderHoursLine();
    showDetail(key);
  }
  function deselect() {
    if (!selectedKey) return;
    selectedKey = null;
    hideRibbon();
    renderHoursLine();
  }
  async function cycleSure(key) {
    const m = store.S.data.Moments.find((x) => x.f.Key === key);
    if (!m) return;
    await store.adjustMoment(key, { Sure: SURE_NEXT[sureOf(m)] });
    renderHoursLine();
    showDetail(key);
    scheduleDaySync();
  }

  // -------------------------------------------------- moments, caught in passing
  const backdrop = h('div', { class: 'moment-backdrop' });
  const sheet = h('div', { class: 'moment-sheet' });
  const ribbon = h('div', { class: 'moment-ribbon' });
  const nowMote = h('button', { class: 'now-mote', 'aria-label': 'catch a moment' }, [h('span', { class: 'now-label italic' }, 'tag')]);
  app.appendChild(backdrop);
  app.appendChild(sheet);
  app.appendChild(ribbon);
  app.appendChild(nowMote);

  function hideRibbon() {
    ribbon.classList.remove('open');
  }
  // the detail card for the dot being edited: what it is and when, the
  // sureness word (tap to walk the ring, same as tapping the dot), and a
  // ✕ to take the moment back. it stays open until you tap away.
  function showDetail(key) {
    const m = store.S.data.Moments.find((x) => x.f.Key === key);
    if (!m) { hideRibbon(); return; }
    clear(ribbon);
    ribbon.appendChild(h('div', { class: 'ribbon-detail italic' }, momentDetail(key)));
    const line = h('div', { class: 'ribbon-line' });
    const word = h('button', { class: 'plain sure-word' }, SURE_WORD[sureOf(m)]);
    word.style.color = SURE_COLOR[sureOf(m)];
    word.addEventListener('click', () => cycleSure(key));
    const del = h('button', { class: 'plain ribbon-x', 'aria-label': 'delete' }, '✕');
    del.addEventListener('click', async () => {
      await store.removeMoment(key);
      deselect();
      renderHoursLine();
      scheduleDaySync();
    });
    line.appendChild(word);
    line.appendChild(del);
    ribbon.appendChild(line);
    ribbon.classList.add('open');
  }

  function momentDetail(key) {
    const m = store.S.data.Moments.find((x) => x.f.Key === key);
    if (!m) return '';
    const label = m.f.Sure === 'day' ? 'all day' : (m.f.Time || '');
    const val = m.f.Value != null ? ` ${m.f.Value}` : '';
    return `${label} · ${m.f.Tag}${val} — ${SURE_WORD[sureOf(m)]}`;
  }

  // a tap anywhere off the hours line and off the detail card lets go of
  // the moment being edited (so the fade lifts and the dots come back).
  function onDocDown(e) {
    if (!selectedKey) return;
    if (hoursLine.contains(e.target) || ribbon.contains(e.target)) return;
    deselect();
  }
  document.addEventListener('pointerdown', onDocDown);

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
    // the "create a tag" line rides at the end of the chips, not below —
    // one more chip-shaped thing, but the one you can type into.
    const input = h('input', { class: 'new-tag-inline', placeholder: 'create a tag…' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        captureFromChip(input.value.trim());
        input.value = '';
      }
    });
    chips.appendChild(input);
    sheet.appendChild(chips);

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
    // the running log of what's been caught this session — each line is
    // its time and tag with a ✕ to take it straight back. re-timing and
    // re-colouring happen on the hours line's dots, not here.
    function streamEntry(m) {
      const label = m.f.Sure === 'day' ? 'all day' : (m.f.Time || '');
      const val = m.f.Value != null ? ` ${m.f.Value}` : '';
      const text = h('span', { class: 'stream-text' }, `${label} · ${m.f.Tag}${val}`);
      const del = h('button', { class: 'plain stream-x', 'aria-label': 'delete' }, '✕');
      del.addEventListener('click', async () => {
        await store.removeMoment(m.f.Key);
        renderHoursLine();
        renderStream();
        scheduleDaySync();
      });
      return h('div', { class: 'stream-entry' }, [text, del]);
    }

    function petalStepInline(spec, key) {
      clear(petalSlot);
      const min = spec.min ?? 0, max = spec.max ?? 5;
      petalSlot.appendChild(h('div', { class: 'dim italic petal-hint' }, `${spec.name} — optional`));
      const row = h('div', { class: 'mini-petals' });
      for (let i = min; i <= max; i++) {
        const p = h('button', { class: 'mini-petal' }, String(i));
        p.addEventListener('click', async () => {
          await store.adjustMoment(key, { Value: i });
          renderHoursLine();
          clear(petalSlot);
          renderStream();
          scheduleDaySync();
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
      scheduleDaySync();
      const spec = store.valueTagFor(tag);
      if (spec) petalStepInline(spec, key);
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

  renderTally();
  renderSchedule();
  renderPrint();
  renderLedger();
  renderHoursLine();
  bindLineSlide();

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
    document.removeEventListener('pointerdown', onDocDown);
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

  function printImageUrl(row) {
    for (const v of Object.values(row.f)) {
      if (Array.isArray(v) && v[0] && v[0].url && /image/i.test(v[0].type || '')) return v[0].url;
    }
    return '';
  }

  function render() {
    clear(wall);
    const prints = [...store.S.data.Days]
      .map((d) => ({ date: d.f.Date || d.f.Key, url: printImageUrl(d) }))
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
