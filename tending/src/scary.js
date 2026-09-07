// scary.js — the hour. high-adrenaline is quarantined here; nothing else
// in the app pulses or alarms.

import * as store from './store.js?v=11';
import { holdToAct } from './views.js?v=11';

const DURATIONS = [60, 45, 25];
const WORDS = { 60: 'sixty', 45: 'forty-five', 25: 'twenty-five' };

function fmt(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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

const HINTS = [
  ['#/day/', 'the day'], ['#/gallery', 'the gallery'], ['#/tend', 'tend'],
];

export function mount(app) {
  let durationIdx = 0;
  let rafId = null, heartbeatT = null, audioCtx = null, masterGain = null;
  let muted = false;
  let startTime = 0, durationMs = 0;
  let ended = false;
  let visHandler = null;
  let unbindGiveup = null;

  const room = h('div', { class: 'hour-room' });
  const pulse = h('div', { class: 'hour-pulse' });
  const notice = h('div', { class: 'hour-notice' });
  const flood = h('div', { class: 'hour-flood' });
  const hints = h('div', { class: 'hints' }, HINTS.map(([href, label]) => h('a', { href }, label)));
  app.appendChild(pulse);
  app.appendChild(room);
  app.appendChild(notice);
  app.appendChild(flood);
  app.appendChild(hints);

  function cleanupAudio() {
    if (heartbeatT) { clearTimeout(heartbeatT); heartbeatT = null; }
    if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; masterGain = null; }
  }
  function cleanupLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
  function exitFullscreenSafe() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
  }

  function renderEntry() {
    cleanupAudio(); cleanupLoop();
    room.innerHTML = '';
    const mins = DURATIONS[durationIdx];
    const line = h('div', { class: 'hour-line hour-duration' }, `${WORDS[mins]} minutes. do not stop.`);
    line.addEventListener('click', () => {
      durationIdx = (durationIdx + 1) % DURATIONS.length;
      line.textContent = `${WORDS[DURATIONS[durationIdx]]} minutes. do not stop.`;
    });
    const begin = h('button', { class: 'btn' }, 'begin');
    begin.addEventListener('click', () => startHour(DURATIONS[durationIdx]));
    room.appendChild(line);
    room.appendChild(begin);
  }

  function startHour(minutes) {
    durationMs = minutes * 60 * 1000;
    startTime = Date.now();
    ended = false;
    room.innerHTML = '';

    const clock = h('div', { class: 'hour-clock' }, fmt(durationMs));
    const giveup = h('div', { class: 'hour-giveup italic' }, 'give up — press & hold three seconds');
    const muteBtn = h('button', { class: 'mute-btn plain' }, 'M — mute');
    room.appendChild(clock);
    room.appendChild(giveup);
    app.appendChild(muteBtn);

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(audioCtx.destination);
    } catch { audioCtx = null; }

    function thump(t, freq) {
      if (!audioCtx || !masterGain) return;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g); g.connect(masterGain);
      osc.start(t); osc.stop(t + 0.2);
    }
    function scheduleHeartbeat() {
      if (ended) return;
      const frac = Math.min(1, (Date.now() - startTime) / durationMs);
      const bpm = 50 + frac * 40;
      const interval = 60000 / bpm;
      if (audioCtx && !muted) {
        const t = audioCtx.currentTime;
        thump(t, 52);
        thump(t + 0.14, 42);
      }
      heartbeatT = setTimeout(scheduleHeartbeat, interval);
    }
    scheduleHeartbeat();

    muteBtn.addEventListener('click', () => {
      muted = !muted;
      muteBtn.textContent = muted ? 'M — muted' : 'M — mute';
    });
    function onKey(e) { if (e.key === 'm' || e.key === 'M') muteBtn.click(); }
    window.addEventListener('keydown', onKey);

    visHandler = () => {
      if (document.hidden) {
        notice.textContent = 'it sees you.';
        notice.classList.add('show');
      } else {
        setTimeout(() => notice.classList.remove('show'), 2400);
      }
    };
    document.addEventListener('visibilitychange', visHandler);

    if (room.requestFullscreen) room.requestFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});

    unbindGiveup = holdToAct(giveup, {
      ms: 3000,
      onComplete: () => finish('broken'),
    });

    function loop() {
      if (ended) return;
      const now = Date.now();
      const remaining = durationMs - (now - startTime);
      const progress = Math.min(1, (now - startTime) / durationMs);
      clock.textContent = fmt(Math.max(0, remaining));
      const period = 1800 - progress * 1300;
      const phase = (now % period) / period;
      const val = Math.pow(Math.sin(phase * Math.PI), 2) * (0.1 + 0.55 * progress);
      pulse.style.setProperty('--pulse', val.toFixed(3));
      if (remaining <= 0) { finish('held'); return; }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    function finish(outcome) {
      if (ended) return;
      ended = true;
      cleanupLoop(); cleanupAudio();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', visHandler);
      if (unbindGiveup) { unbindGiveup(); unbindGiveup = null; }
      exitFullscreenSafe();
      muteBtn.remove();
      pulse.style.setProperty('--pulse', 0);

      const elapsedMs = Date.now() - startTime;
      if (outcome === 'held') {
        store.logHour(minutes, 'held');
        flood.className = 'hour-flood gold';
        flood.textContent = 'the hour held.';
      } else {
        const minutesHeld = Math.round(elapsedMs / 60000);
        store.logHour(minutesHeld, 'broken');
        flood.className = 'hour-flood grey';
        flood.textContent = `the hour broke at ${fmt(elapsedMs)}.`;
      }
      requestAnimationFrame(() => flood.classList.add('show'));
    }
  }

  renderEntry();

  return () => {
    ended = true;
    cleanupLoop(); cleanupAudio();
    if (unbindGiveup) unbindGiveup();
    if (visHandler) document.removeEventListener('visibilitychange', visHandler);
    exitFullscreenSafe();
  };
}
