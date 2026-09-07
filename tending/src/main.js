// main.js — hash router and glue. boots the sandbox, loads the soil,
// and hands each room off to its view.

import * as store from './store.js?v=4';
import * as views from './views.js?v=4';
import * as scary from './scary.js?v=4';

const app = document.getElementById('app');
const queuedot = document.getElementById('queuedot');
const VALID = ['day', 'shop', 'hour', 'tend', 'gallery'];
const REDIRECT_TO_DAY = ['meadow', 'unwind'];
const WITHER_SEEN_KEY = 'tending.witherSeenUntil';

let cleanup = null;

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || !VALID.includes(parts[0])) return { room: 'day', date: store.todayISO() };
  if (parts[0] === 'day') {
    const date = parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? parts[1] : store.todayISO();
    return { room: 'day', date };
  }
  return { room: parts[0] };
}

function route() {
  const rawRoom = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean)[0];
  if (rawRoom && REDIRECT_TO_DAY.includes(rawRoom)) {
    location.hash = '#/day/';
    return; // hashchange fires route() again against the new hash
  }
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  const { room, date } = parseHash();
  document.body.dataset.room = room;
  app.innerHTML = '';
  if (room === 'shop') cleanup = views.mountShop(app);
  else if (room === 'hour') cleanup = scary.mount(app);
  else if (room === 'tend') cleanup = views.mountTend(app);
  else if (room === 'gallery') cleanup = views.mountGallery(app);
  else cleanup = views.mountDay(app, date);
  updateQueueDot();
}

function updateQueueDot() {
  if (!queuedot) return;
  queuedot.classList.toggle('show', store.queuedCount() > 0);
}

window.addEventListener('hashchange', route);

window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const cur = parseHash();
  if (cur.room !== 'day') return;
  const delta = e.key === 'ArrowLeft' ? -1 : 1;
  location.hash = `#/day/${store.addDays(cur.date, delta)}`;
});

window.addEventListener('online', async () => {
  await store.loadAll();
  updateQueueDot();
  route();
});

function witherReport() {
  const lastSeen = localStorage.getItem(WITHER_SEEN_KEY);
  const today = store.todayISO();
  let lost = 0, count = 0;
  for (const t of store.S.data.Ticks) {
    if (t.f.Status === 'withered' && (!lastSeen || t.f.Date > lastSeen)) {
      lost += t.f.Seeds || 0;
      count++;
    }
  }
  localStorage.setItem(WITHER_SEEN_KEY, today);
  return { lost, count };
}

async function boot() {
  const wasFirst = store.firstVisit();
  await store.seedSandboxIfBare();
  await store.loadAll();
  route();

  if (store.S.problem) {
    views.whisper('the soil is quiet — working from what is saved here.', 4200);
  } else {
    const { lost, count } = witherReport();
    if (lost > 0) {
      views.whisper(`${lost} seed${lost === 1 ? '' : 's'} withered while you were away — ${count} tick${count === 1 ? '' : 's'} unclaimed too long.`, 5000);
    } else if (wasFirst) {
      views.whisper('this garden is growing in your browser. when you want it permanent — tend.', 6000);
    }
  }

  updateQueueDot();
  setInterval(updateQueueDot, 4000);
}

boot();
