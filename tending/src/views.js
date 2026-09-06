// views.js — the rooms. each mount* function renders into `app` and
// returns a cleanup function (timers, listeners) called before the router
// moves on.

import * as store from './store.js?v=2';
import { dayPrint } from './print.js?v=2';
import { computeWorldState } from './world.js?v=2';

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

  // the provenance ledger — habits as words; tap to tick, tap again to
  // take it back while it's still unclaimed
  const ledger = h('div', { class: 'ledger' });
  root.appendChild(ledger);

  const hoursLine = h('div', { class: 'hours-line' });
  root.appendChild(hoursLine);

  const momentsText = h('div', { class: 'moments-text' });
  root.appendChild(momentsText);

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

  // the plate is a portrait leaf now — taller than wide on every screen,
  // never the square (iPad) or landscape (desktop) it used to be. height
  // leads; width follows at a portrait ratio, then both shrink to fit the
  // column and the viewport.
  const PLATE_RATIO = 0.74; // width / height
  function plateSize() {
    const containerW = Math.round(root.clientWidth || plate.clientWidth || window.innerWidth - 40);
    const availH = Math.round((window.innerHeight || 700) * 0.66);
    let ph = availH;
    let pw = Math.round(ph * PLATE_RATIO);
    if (pw > containerW) { pw = containerW; ph = Math.round(pw / PLATE_RATIO); }
    return [Math.max(200, pw), Math.max(260, ph)];
  }

  // the ledger, the hours line and the tag stream all sit exactly the
  // plate's width, centered under it — so the day reads as one column.
  function applyPlateWidth(pw) {
    const px = `${pw}px`;
    ledger.style.maxWidth = px;
    hoursLine.style.width = px;
    momentsText.style.maxWidth = px;
  }

  function renderPlate(crossfade = false) {
    const [pw, ph] = plateSize();
    applyPlateWidth(pw);
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

  function renderLedger() {
    clear(ledger);
    const habits = store.activeHabits();
    if (!habits.length) {
      ledger.appendChild(h('div', { class: 'dim italic' }, 'no habits planted yet — tend the garden.'));
      return;
    }
    habits.forEach((habit, i) => {
      const tick = store.tickFor(date, habit.f.Name);
      const word = h('button', { class: 'plain italic ledger-word' + (tick ? ' done' : '') }, habit.f.Name || '');
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
        renderPlate(true);
        renderWallet();
      });
      ledger.appendChild(word);
      if (i < habits.length - 1) ledger.appendChild(h('span', { class: 'ledger-sep' }, '·'));
    });
  }

  function onResize() { renderPlate(); }
  window.addEventListener('resize', onResize);

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
      });
      return h('div', { class: 'stream-entry' }, [text, del]);
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
  renderLedger();
  renderPlate();
  renderHoursLine();

  const unbindSwipe = bindSwipe(root, {
    onLeft: () => (location.hash = `#/day/${store.addDays(date, 1)}`),
    onRight: () => (location.hash = `#/day/${store.addDays(date, -1)}`),
  });

  return () => {
    unbindSwipe();
    unbindWalletHold();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('pointerdown', onDocDown);
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
