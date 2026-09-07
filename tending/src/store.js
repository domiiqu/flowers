// store.js — the soil. settings, the airtable backend, a sandbox that
// grows in the browser, and one queue so nothing you do is lost offline.
//
// design: no linked-record fields, everything denormalized on text keys,
// all writes idempotent (upsert on Key) so the offline queue can replay
// safely. the app reads the last ~180 days into memory and works there.

const LS = {
  settings: 'tending.settings',
  queue: 'tending.queue',
  sandbox: 'tending.sandbox.',
  seen: 'tending.seen',
};

export const DAYS_BACK = 180;      // how much past is loaded
export const GATHER_DAYS = 3;      // seeds wither after this many days
export const HOUR_SEEDS = 4;       // a held hour is worth this

// ---------------------------------------------------------------- schema
// this single spec plants the airtable base, seeds the sandbox, and
// documents the whole data model. field names are the contract.

export const SCHEMA = [
  { name: 'Habits', fields: [
    { name: 'Name', type: 'singleLineText' },
    { name: 'Seeds', type: 'number', options: { precision: 0 } },
    { name: 'Variety', type: 'number', options: { precision: 0 } },
    { name: 'Order', type: 'number', options: { precision: 0 } },
    { name: 'Active', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Bonus', type: 'checkbox', options: { icon: 'star', color: 'yellowBright' },
      description: 'A bonus habit: left out of the day’s total, so skipping it never lowers the score — but doing it adds its points on top (the day can pass 100%).' },
    { name: 'Notes', type: 'multilineText' },
  ]},
  // the tag vocabulary — the words offered as chips. a typed tag joins it;
  // deleting one drops it from the chips but never touches the Moments that
  // already used it (those live on their own, keyed by text).
  { name: 'Tags', fields: [
    { name: 'Name', type: 'singleLineText' },
    { name: 'Order', type: 'number', options: { precision: 0 } },
    { name: 'Active', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
  ]},
  { name: 'Ticks', fields: [
    { name: 'Key', type: 'singleLineText' },
    { name: 'Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Habit', type: 'singleLineText' },
    { name: 'Seeds', type: 'number', options: { precision: 0 } },
    { name: 'Status', type: 'singleSelect', options: { choices: [
      { name: 'unclaimed', color: 'yellowLight1' },
      { name: 'gathered', color: 'greenLight1' },
      { name: 'withered', color: 'grayLight1' } ] } },
    { name: 'GatheredOn', type: 'date', options: { dateFormat: { name: 'iso' } } },
  ]},
  // Trackers + Entries retired — the nightly ritual that fed them is gone.
  // scalar ratings (mood, sleep, fog, energy) are captured as tagged
  // Moments carrying a Value now; VALUE_TAGS below defines their scales.
  { name: 'Shop', fields: [
    { name: 'Name', type: 'singleLineText' },
    { name: 'Cost', type: 'number', options: { precision: 0 } },
    { name: 'Sign', type: 'singleLineText' },
    { name: 'Link', type: 'url' },
    { name: 'Order', type: 'number', options: { precision: 0 } },
    { name: 'Active', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Notes', type: 'multilineText' },
  ]},
  { name: 'Redemptions', fields: [
    { name: 'Key', type: 'singleLineText' },
    { name: 'Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Item', type: 'singleLineText' },
    { name: 'Cost', type: 'number', options: { precision: 0 } },
  ]},
  { name: 'Days', fields: [
    { name: 'Key', type: 'singleLineText' },
    { name: 'Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Schedule', type: 'multilineText' },
    { name: 'Note', type: 'multilineText' },
    // the day's world-state, flattened and written back — the base's
    // plate generator (an AI image field over a formula field) paints
    // from these; the slow math stays in the app (world.js)
    { name: 'HabitsDone', type: 'number', options: { precision: 0 },
      description: 'Habits ticked this day (count).' },
    { name: 'HabitsTotal', type: 'number', options: { precision: 0 },
      description: 'Active habits in the roster this day (the denominator).' },
    { name: 'Fog', type: 'number', options: { precision: 0 },
      description: 'Brain fog 0–5, from a “fog” tag with a value that day (blank if none).' },
    { name: 'Mood', type: 'number', options: { precision: 0 },
      description: 'Overall mood 0–5: the average of the day’s morning/afternoon/late moods, else a plain “mood” tag. Drives the sky’s light.' },
    { name: 'MoodMorning', type: 'number', options: { precision: 0 },
      description: 'Morning mood 0–5, from the “mood (morning)” tag.' },
    { name: 'MoodAfternoon', type: 'number', options: { precision: 0 },
      description: 'Afternoon mood 0–5, from the “mood (afternoon)” tag.' },
    { name: 'MoodLate', type: 'number', options: { precision: 0 },
      description: 'Late/evening mood 0–5, from the “mood (late)” tag.' },
    { name: 'Sleep', type: 'number', options: { precision: 2 },
      description: 'Hours slept, from a “sleep” tag with a value. Under 5 makes two suns.' },
    { name: 'HeldHour', type: 'checkbox', options: { icon: 'check', color: 'greenBright' },
      description: 'An hour was held (scary mode) this day → the monolith + long shadow.' },
    { name: 'ScheduleCount', type: 'number', options: { precision: 0 },
      description: 'Number of timed schedule items → telephone poles with sagging wires.' },
    { name: 'Moments', type: 'number', options: { precision: 0 },
      description: 'Tags caught this day → birds.' },
    { name: 'NewTag', type: 'checkbox', options: { icon: 'check', color: 'greenBright' },
      description: 'A never-before-seen tag entered the day → the snake (novelty has a body).' },
    { name: 'Aridity', type: 'number', options: { precision: 2 },
      description: 'Drought 0–1 over the last 180 days. Grows fast with CONSECUTIVE untracked days (+0.15/day after the first) and with tracked-but-unfed days (+0.05); heals slowly with tracking (−0.04/day). Hysteresis: breaks fast, mends slow. Ramp: green field → scrub → cracked earth → pale dunes.' },
    { name: 'Path', type: 'number', options: { precision: 2 },
      description: 'Tracking continuity 0–1 over the last 14 days; the most recent 3 days count double. Confident road → faint trace → footprints → gone.' },
    { name: 'Sea', type: 'number', options: { precision: 2 },
      description: 'Reward for constancy 0–1: needs a 7-day tracking streak to appear, maxes near a 21-day streak ((streak−7)/14). Withdraws as quiet days pass (gone after 3 untracked).' },
    { name: 'TowerFloors', type: 'number', options: { precision: 0 },
      description: 'The archive: one floor per 10 day-notes written (Days.Note). Note: the current app has no note field, so this stays 0 until notes exist.' },
    // the two slower clocks: the year (season, from the date) and the
    // life (days tracked so far — the hand maturing across the practice)
    { name: 'Season', type: 'singleLineText',
      description: 'winter / spring / summer / autumn, from the date’s month (northern hemisphere). Drives the base palette.' },
    { name: 'DaysTracked', type: 'number', options: { precision: 0 },
      description: 'Distinct days the practice has touched so far (within the loaded ~180-day window). Drives the illustrator’s maturing hand.' },
    // the print ritual: the app checks this; the base's automation paints
    // into an image field on the row when it turns true.
    { name: 'Print?', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
  ]},
  { name: 'Moments', fields: [
    { name: 'Key', type: 'singleLineText' },
    { name: 'Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Time', type: 'singleLineText' },
    { name: 'Tag', type: 'singleLineText' },
    { name: 'Value', type: 'number', options: { precision: 2 } },
    { name: 'Sure', type: 'singleSelect', options: { choices: [
      { name: 'exact', color: 'greenLight1' },
      { name: 'about', color: 'yellowLight1' },
      { name: 'day', color: 'grayLight1' } ] } },
    { name: 'Words', type: 'multilineText' },
  ]},
  { name: 'Hours', fields: [
    { name: 'Key', type: 'singleLineText' },
    { name: 'Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Minutes', type: 'number', options: { precision: 0 } },
    { name: 'Outcome', type: 'singleSelect', options: { choices: [
      { name: 'held', color: 'yellowBright' }, { name: 'broken', color: 'redLight1' } ] } },
    { name: 'Seeds', type: 'number', options: { precision: 0 } },
  ]},
];

const DEFAULTS = {
  Habits: [
    { Name: 'moved my body',        Seeds: 3, Variety: 11, Order: 1, Active: true },
    { Name: 'went outside',         Seeds: 2, Variety: 27, Order: 2, Active: true },
    { Name: 'made something',       Seeds: 5, Variety: 43, Order: 3, Active: true },
    { Name: 'read paper pages',     Seeds: 2, Variety: 58, Order: 4, Active: true },
    { Name: 'in bed before midnight', Seeds: 4, Variety: 71, Order: 5, Active: true },
  ],
  Shop: [
    { Name: 'a fancy coffee',            Cost: 15, Sign: '☕', Order: 1, Active: true },
    { Name: 'an idle hour, guilt-free',  Cost: 25, Sign: '🕯', Order: 2, Active: true },
    { Name: 'a new book',                Cost: 40, Sign: '📖', Order: 3, Active: true },
    { Name: 'the thing in the cart',     Cost: 80, Sign: '🎁', Order: 4, Active: true,
      Link: 'https://example.com/replace-me-with-the-cart' },
  ],
  Tags: [
    'b', 'l', 'd', 'snack', 'coffee',
    'mood (morning)', 'mood (afternoon)', 'mood (late)', 'sleep', 'fog', 'energy',
    'dairy', 'adderall 10mg', 'fog rolls in', 'cramps', 'heavy', 'light',
  ].map((Name, i) => ({ Name, Order: i + 1, Active: true })),
};

// ------------------------------------------------------------------ time

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
export function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  const w = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()];
  const m = ['january','february','march','april','may','june','july','august','september','october','november','december'][d.getMonth()];
  return `${w} · ${m} ${d.getDate()}`;
}

// -------------------------------------------------------------- settings

export function getSettings() {
  try { return JSON.parse(localStorage.getItem(LS.settings)) || {}; } catch { return {}; }
}
export function saveSettings(s) {
  localStorage.setItem(LS.settings, JSON.stringify(s));
}
export function connected() {
  const s = getSettings();
  return !!(s.pat && s.baseId);
}

// ------------------------------------------------------- airtable client

const API = 'https://api.airtable.com/v0';

async function at(path, opts = {}) {
  const s = getSettings();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${s.pat}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify((await res.json()).error); } catch {}
    throw new Error(`airtable ${res.status} — ${detail || res.statusText}`);
  }
  return res.json();
}

const airtable = {
  async list(table) {
    const s = getSettings();
    const recs = [];
    let offset;
    const dated = SCHEMA.find(t => t.name === table).fields.some(f => f.name === 'Date');
    const filter = dated
      ? `&filterByFormula=${encodeURIComponent(`IS_AFTER({Date}, DATEADD(TODAY(), -${DAYS_BACK}, 'days'))`)}`
      : '';
    do {
      const page = await at(`/${s.baseId}/${encodeURIComponent(table)}?pageSize=100${filter}${offset ? `&offset=${offset}` : ''}`);
      recs.push(...page.records.map(r => ({ id: r.id, f: r.fields })));
      offset = page.offset;
    } while (offset);
    return recs;
  },
  async upsert(table, mergeField, fieldsList) {
    const s = getSettings();
    const out = [];
    for (let i = 0; i < fieldsList.length; i += 10) {
      const page = await at(`/${s.baseId}/${encodeURIComponent(table)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          performUpsert: { fieldsToMergeOn: [mergeField] },
          records: fieldsList.slice(i, i + 10).map(f => ({ fields: f })),
          typecast: true,
        }),
      });
      out.push(...page.records.map(r => ({ id: r.id, f: r.fields })));
    }
    return out;
  },
  async create(table, fields) {
    const s = getSettings();
    const page = await at(`/${s.baseId}/${encodeURIComponent(table)}`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    return { id: page.records[0].id, f: page.records[0].fields };
  },
  async update(table, id, fields) {
    const s = getSettings();
    const rec = await at(`/${s.baseId}/${encodeURIComponent(table)}/${id}`, {
      method: 'PATCH', body: JSON.stringify({ fields, typecast: true }),
    });
    return { id: rec.id, f: rec.fields };
  },
  async destroy(table, id) {
    const s = getSettings();
    await at(`/${s.baseId}/${encodeURIComponent(table)}?records[]=${id}`, { method: 'DELETE' });
  },
};

// -------------------------------------------------------- sandbox client
// same surface, grows in localStorage. lets the garden live before (or
// without) airtable, and is the fallback the queue drains into.

function sbRead(table) {
  try { return JSON.parse(localStorage.getItem(LS.sandbox + table)) || []; } catch { return []; }
}
function sbWrite(table, recs) {
  localStorage.setItem(LS.sandbox + table, JSON.stringify(recs));
}
const rid = () => 'loc' + Math.random().toString(36).slice(2, 12);

const sandbox = {
  async list(table) { return sbRead(table); },
  async upsert(table, mergeField, fieldsList) {
    const recs = sbRead(table);
    const out = [];
    for (const f of fieldsList) {
      const hit = recs.find(r => r.f[mergeField] === f[mergeField]);
      if (hit) { Object.assign(hit.f, f); out.push(hit); }
      else { const r = { id: rid(), f }; recs.push(r); out.push(r); }
    }
    sbWrite(table, recs);
    return out;
  },
  async create(table, fields) {
    const recs = sbRead(table);
    const r = { id: rid(), f: fields };
    recs.push(r); sbWrite(table, recs);
    return r;
  },
  async update(table, id, fields) {
    const recs = sbRead(table);
    const hit = recs.find(r => r.id === id);
    if (hit) { Object.assign(hit.f, fields); sbWrite(table, recs); }
    return hit;
  },
  async destroy(table, id) {
    sbWrite(table, sbRead(table).filter(r => r.id !== id));
  },
};

function backend() { return connected() ? airtable : sandbox; }

// ----------------------------------------------------------------- queue
// every write goes through here. it runs immediately when it can and
// replays later when it can't. upserts make the replay harmless.

function qRead() {
  try { return JSON.parse(localStorage.getItem(LS.queue)) || []; } catch { return []; }
}
function qWrite(q) { localStorage.setItem(LS.queue, JSON.stringify(q)); }

async function runOp(op) {
  const b = backend();
  if (op.kind === 'upsert') return b.upsert(op.table, op.mergeField, [op.fields]);
  if (op.kind === 'create') return b.create(op.table, op.fields);
  if (op.kind === 'destroyByKey') {
    const recs = await b.list(op.table);
    const hit = recs.find(r => r.f.Key === op.key);
    if (hit) await b.destroy(op.table, hit.id);
    return;
  }
  // find a row by one of its field values (the backend's real id may
  // differ from the in-memory temp id, so we always look it up fresh),
  // then delete or update it — how rename-in-place and delete replay.
  if (op.kind === 'destroyByField') {
    const recs = await b.list(op.table);
    const hit = recs.find(r => r.f[op.field] === op.value);
    if (hit) await b.destroy(op.table, hit.id);
    return;
  }
  if (op.kind === 'updateByField') {
    const recs = await b.list(op.table);
    const hit = recs.find(r => r.f[op.field] === op.value);
    if (hit) await b.update(op.table, hit.id, op.fields);
    return;
  }
}

// a write can fail two ways. a *transient* failure (offline, a 5xx, a rate
// limit) will succeed if we try again later, so we keep the op and replay it.
// a *permanent* failure (a 4xx — a field the base doesn't have, a deleted
// table, a bad record) will never succeed as written, so replaying it just
// jams the queue and blocks every write behind it. we drop those instead,
// remembering the last one so the app can say what happened.
function isPermanent(err) {
  const code = +((String(err && err.message).match(/airtable (\d{3})/) || [])[1] || 0);
  return code >= 400 && code < 500 && code !== 429; // client error, not rate-limit
}

let flushing = false;
export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    let q = qRead();
    while (q.length) {
      try {
        await runOp(q[0]);
      } catch (e) {
        if (!isPermanent(e)) { console.warn('queue holds:', e.message); break; }
        // this op can never land as written — drop it so it can't wedge the
        // queue and stop every future write (a print, a tag) from syncing.
        console.warn('dropped a stuck write:', q[0].kind, q[0].table, e.message);
        S.dropped = { op: q[0], error: e.message };
      }
      q = q.slice(1);
      qWrite(q);
    }
  } finally {
    flushing = false;
  }
}
export function queuedCount() { return qRead().length; }
export function lastDropped() { return S.dropped || null; }

async function write(op) {
  await flushQueue();
  if (qRead().length) { qWrite([...qRead(), op]); return false; } // transient backlog — get in line
  try {
    await runOp(op);
    return true;
  } catch (e) {
    if (isPermanent(e)) { S.dropped = { op, error: e.message }; return false; } // don't jam the queue with poison
    console.warn('kept for later:', e.message);
    qWrite([...qRead(), op]);
    return false;
  }
}

// ------------------------------------------------------------- the state

export const S = {
  data: { Habits: [], Tags: [], Ticks: [], Shop: [], Redemptions: [], Days: [], Moments: [], Hours: [] },
  loaded: false,
  problem: null,
  dropped: null,
};

export async function loadAll() {
  const b = backend();
  S.problem = null;
  await flushQueue(); // swallows its own errors — a jam here must not blank reads
  // load each table on its own. a base that's drifted from the schema (a
  // hidden gift shop, a not-yet-planted table) leaves one list 404-ing;
  // that must not blank the calendar and everything else that *does* load.
  const failed = [];
  for (const t of SCHEMA) {
    try { S.data[t.name] = await b.list(t.name); }
    catch (e) { failed.push(t.name); console.warn(`table "${t.name}" unavailable:`, e.message); }
  }
  S.loaded = true;
  try { await witherOldSeeds(); } catch (e) { console.warn(e); }
  // only a total failure means we're really cut off (bad token, no network);
  // a few missing tables is just a partly-planted base, still usable.
  S.problem = failed.length === SCHEMA.length ? 'could not reach the base' : null;
}

// re-list a single table into memory — used to poll for a print that the
// base is still painting, without reloading the whole world.
export async function reloadTable(name) {
  try { S.data[name] = await backend().list(name); return true; }
  catch (e) { return false; }
}

// first visit, empty sandbox: plant something to wake up to
export async function seedSandboxIfBare() {
  if (connected()) return;
  if (sbRead('Habits').length) return;
  for (const [table, rows] of Object.entries(DEFAULTS)) {
    for (const f of rows) await sandbox.create(table, f);
  }
}

// ----------------------------------------------------------- domain acts

const key = (date, name) => `${date} · ${name}`;

export function tickFor(date, habitName) {
  return S.data.Ticks.find(t => t.f.Key === key(date, habitName));
}

export async function tick(date, habit) {
  const fields = {
    Key: key(date, habit.f.Name), Date: date, Habit: habit.f.Name,
    Seeds: habit.f.Seeds ?? 1, Status: 'unclaimed', // the habit's own point value
  };
  const existing = tickFor(date, habit.f.Name);
  if (existing) Object.assign(existing.f, fields);
  else S.data.Ticks.push({ id: 'tmp' + Math.random(), f: fields });
  write({ kind: 'upsert', table: 'Ticks', mergeField: 'Key', fields });
}

export async function untick(date, habitName) {
  const t = tickFor(date, habitName);
  if (!t || t.f.Status !== 'unclaimed') return false;
  S.data.Ticks = S.data.Ticks.filter(x => x !== t);
  write({ kind: 'destroyByKey', table: 'Ticks', key: t.f.Key });
  return true;
}

export function pendingTicks() {
  const today = todayISO();
  return S.data.Ticks.filter(t =>
    t.f.Status === 'unclaimed' && daysBetween(t.f.Date, today) < GATHER_DAYS);
}

export async function witherOldSeeds() {
  const today = todayISO();
  let lost = 0;
  for (const t of S.data.Ticks) {
    if (t.f.Status === 'unclaimed' && daysBetween(t.f.Date, today) >= GATHER_DAYS) {
      t.f.Status = 'withered';
      lost += t.f.Seeds || 0;
      write({ kind: 'upsert', table: 'Ticks', mergeField: 'Key',
        fields: { Key: t.f.Key, Status: 'withered' } });
    }
  }
  return lost;
}

export async function gather() {
  const today = todayISO();
  let got = 0;
  for (const t of pendingTicks()) {
    t.f.Status = 'gathered';
    t.f.GatheredOn = today;
    got += t.f.Seeds || 0;
    write({ kind: 'upsert', table: 'Ticks', mergeField: 'Key',
      fields: { Key: t.f.Key, Status: 'gathered', GatheredOn: today } });
  }
  return got;
}

export function wallet() {
  const earned = S.data.Ticks
    .filter(t => t.f.Status === 'gathered')
    .reduce((a, t) => a + (t.f.Seeds || 0), 0);
  const spent = S.data.Redemptions.reduce((a, r) => a + (r.f.Cost || 0), 0);
  return earned - spent;
}

export async function redeem(item) {
  if (wallet() < (item.f.Cost || 0)) return false;
  const now = new Date();
  const fields = {
    Key: `${todayISO()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} · ${item.f.Name}`,
    Date: todayISO(), Item: item.f.Name, Cost: item.f.Cost || 0,
  };
  S.data.Redemptions.push({ id: 'tmp' + Math.random(), f: fields });
  write({ kind: 'create', table: 'Redemptions', fields });
  return true;
}

export function dayFor(date) {
  return S.data.Days.find(d => d.f.Key === date);
}

export async function saveDay(date, patch) {
  const fields = { Key: date, Date: date, ...patch };
  const existing = dayFor(date);
  if (existing) Object.assign(existing.f, fields);
  else S.data.Days.push({ id: 'tmp' + Math.random(), f: fields });
  write({ kind: 'upsert', table: 'Days', mergeField: 'Key', fields });
}

// the day's flattened world-state, upserted onto its Days row (an alias
// of saveDay in shape, named for its purpose: this is the plate
// generator's feed, not a schedule/note edit)
export async function saveDayState(date, state) {
  return saveDay(date, state);
}

// the print ritual — check the day's Print? box; the base paints from there.
// unlike a normal write, this REPORTS its outcome instead of silently
// queueing, so the day page can say what went wrong (not connected, a
// field-name mismatch, an airtable error) rather than just spinning.
// returns { ok, sandbox?, error? }.
export async function requestPrint(date) {
  const fields = { Key: date, Date: date, 'Print?': true };
  const existing = dayFor(date);
  if (existing) Object.assign(existing.f, fields);
  else S.data.Days.push({ id: 'tmp' + Math.random(), f: fields });
  if (!connected()) {
    // sandbox: it "works" locally, but there's no airtable to paint from
    write({ kind: 'upsert', table: 'Days', mergeField: 'Key', fields });
    return { ok: false, sandbox: true };
  }
  const op = { kind: 'upsert', table: 'Days', mergeField: 'Key', fields };
  await flushQueue(); // clears any self-healable jam first (drops poison)
  if (qRead().length) return { ok: false, error: 'an earlier write is still waiting to sync' };
  try {
    await runOp(op);
    return { ok: true };
  } catch (e) {
    // a permanent failure (a missing field/table) would only jam the queue —
    // don't re-queue it; report exactly what airtable rejected.
    if (!isPermanent(e)) qWrite([...qRead(), op]);
    return { ok: false, error: e.message };
  }
}

// moments — caught in passing. append-only but keyed, so the little
// after-ribbon (adjusting time or sureness) is just an upsert, and a
// mis-tap can be taken back.
export async function captureMoment({ tag, value, words, time, sure = 'exact', date }) {
  const now = new Date();
  const d = date || todayISO();
  const t = time || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const ss = String(now.getSeconds()).padStart(2, '0');
  const fields = { Key: `${d} ${t}:${ss} · ${tag}`, Date: d, Time: t, Tag: tag, Sure: sure };
  if (value !== undefined && value !== null && value !== '') fields.Value = Number(value);
  if (words) fields.Words = words;
  S.data.Moments.push({ id: 'tmp' + Math.random(), f: fields });
  write({ kind: 'upsert', table: 'Moments', mergeField: 'Key', fields });
  ensureTag(tag); // a new word joins the vocabulary the first time it's caught
  return fields.Key;
}

export async function adjustMoment(momentKey, patch) {
  const m = S.data.Moments.find(x => x.f.Key === momentKey);
  if (!m) return;
  Object.assign(m.f, patch);
  write({ kind: 'upsert', table: 'Moments', mergeField: 'Key', fields: { Key: momentKey, ...patch } });
}

export async function removeMoment(momentKey) {
  S.data.Moments = S.data.Moments.filter(x => x.f.Key !== momentKey);
  write({ kind: 'destroyByKey', table: 'Moments', key: momentKey });
}

export function momentsFor(date) {
  return S.data.Moments
    .filter(m => m.f.Date === date)
    .sort((a, b) => (a.f.Time || '').localeCompare(b.f.Time || ''));
}

// a starter vocabulary — shown only until her own tags take over. never
// seeded as data; just fills whatever slots her real usage hasn't yet.
export const STARTER_TAGS = [
  'b', 'l', 'd', 'snack', 'coffee',
  'mood (morning)', 'mood (afternoon)', 'mood (late)', 'sleep', 'fog', 'energy',
  'dairy', 'adderall 10mg', 'fog rolls in', 'cramps', 'heavy', 'light',
];

// the scalar ratings that used to be Trackers — now just tags that carry a
// Value. capturing one of these opens the little petal/stepper for the
// number; world.js reads them back by name for the plate (mood → light,
// sleep → two suns, fog → fog banks). keys are matched case-insensitively.
export const VALUE_TAGS = {
  'mood (morning)':   { name: 'mood (morning)',   kind: 'scale', min: 0, max: 5 },
  'mood (afternoon)': { name: 'mood (afternoon)', kind: 'scale', min: 0, max: 5 },
  'mood (late)':      { name: 'mood (late)',      kind: 'scale', min: 0, max: 5 },
  mood:   { name: 'mood',   kind: 'scale',  min: 0, max: 5 },
  energy: { name: 'energy', kind: 'scale',  min: 0, max: 5 },
  fog:    { name: 'fog',    kind: 'scale',  min: 0, max: 5 },
  sleep:  { name: 'sleep',  kind: 'number', min: 0, max: 14 },
};
export function valueTagFor(tag) {
  return VALUE_TAGS[String(tag || '').trim().toLowerCase()] || null;
}

// the chips: the active tag vocabulary, most-recently-used first. Deleted
// tags never appear (even if history used them). Before the Tags table
// exists (an un-replanted base, a bare sandbox) it falls back to moment
// history plus the starter words, so capture still works.
export function tagChips(n = 8) {
  const lastUse = new Map(); // tag -> latest stamp
  for (const m of S.data.Moments) {
    if (!m.f.Tag) continue;
    const stamp = `${m.f.Date} ${m.f.Time || ''}`;
    if (stamp > (lastUse.get(m.f.Tag) || '')) lastUse.set(m.f.Tag, stamp);
  }
  const active = activeTags();
  let pool;
  if (active.length) {
    const order = new Map(active.map((t) => [t.f.Name, t.f.Order || 0]));
    pool = active.map((t) => t.f.Name).sort((a, b) =>
      (lastUse.get(b) || '').localeCompare(lastUse.get(a) || '') || (order.get(a) || 0) - (order.get(b) || 0));
  } else {
    pool = [...lastUse.keys()].sort((a, b) => (lastUse.get(b) || '').localeCompare(lastUse.get(a) || ''));
    for (const t of STARTER_TAGS) if (!pool.includes(t)) pool.push(t);
  }
  return pool.slice(0, n);
}

export async function logHour(minutes, outcome) {
  const now = new Date();
  const stamp = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const seeds = outcome === 'held' ? HOUR_SEEDS : 0;
  const fields = { Key: `${todayISO()} ${stamp}`, Date: todayISO(), Minutes: minutes, Outcome: outcome, Seeds: seeds };
  S.data.Hours.push({ id: 'tmp' + Math.random(), f: fields });
  write({ kind: 'create', table: 'Hours', fields });
  if (outcome === 'held') {
    const tf = { Key: `${todayISO()} ${stamp} · the held hour`, Date: todayISO(),
      Habit: 'the held hour', Seeds: seeds, Status: 'unclaimed' };
    S.data.Ticks.push({ id: 'tmp' + Math.random(), f: tf });
    write({ kind: 'upsert', table: 'Ticks', mergeField: 'Key', fields: tf });
  }
}

// simple in-app editors (needed for sandbox; harmless with airtable)
export async function upsertRow(table, mergeField, fields) {
  const existing = S.data[table].find(r => r.f[mergeField] === fields[mergeField]);
  if (existing) Object.assign(existing.f, fields);
  else S.data[table].push({ id: 'tmp' + Math.random(), f: fields });
  write({ kind: 'upsert', table, mergeField, fields });
}

// rename a row IN PLACE (by its old Name) — not a create-a-new-one, which
// is what upserting a fresh Name would do. history that referenced the old
// name (ticks, moments) keeps it; the roster carries the new one forward.
export async function renameNamed(table, oldName, newName) {
  const nm = String(newName || '').trim();
  if (!nm || nm === oldName) return;
  const row = S.data[table].find(r => r.f.Name === oldName);
  if (row) row.f.Name = nm;
  write({ kind: 'updateByField', table, field: 'Name', value: oldName, fields: { Name: nm } });
}

// delete a row by Name — gone from the roster/vocabulary, but anything that
// already used the name stays untouched (ticks and moments are keyed on
// their own text, not on this row).
export async function deleteNamed(table, name) {
  S.data[table] = S.data[table].filter(r => r.f.Name !== name);
  write({ kind: 'destroyByField', table, field: 'Name', value: name });
}

// a typed tag joins the vocabulary the first time it's used (or wakes back
// up if it was deleted and typed again).
export async function ensureTag(name) {
  const nm = String(name || '').trim();
  if (!nm) return;
  const row = (S.data.Tags || []).find(t => t.f.Name === nm);
  if (row) {
    if (!row.f.Active) { row.f.Active = true; write({ kind: 'upsert', table: 'Tags', mergeField: 'Name', fields: { Name: nm, Active: true } }); }
    return;
  }
  const order = 1 + (S.data.Tags || []).reduce((m, r) => Math.max(m, r.f.Order || 0), 0);
  const fields = { Name: nm, Active: true, Order: order };
  (S.data.Tags = S.data.Tags || []).push({ id: 'tmp' + Math.random(), f: fields });
  write({ kind: 'upsert', table: 'Tags', mergeField: 'Name', fields });
}
export const activeTags = () =>
  (S.data.Tags || []).filter(t => t.f.Active).sort((a, b) => (a.f.Order || 0) - (b.f.Order || 0));

// --------------------------------------------------------- planting base
// creates any missing tables in the given base via the airtable meta api,
// grows any missing fields on tables that already exist (so replanting
// upgrades an old base in place), then sows default rows into tables it
// just created.

export async function plantBase(report = () => {}) {
  const s = getSettings();
  if (!s.pat || !s.baseId) throw new Error('a token and a base id first');
  const meta = await at(`/meta/bases/${s.baseId}/tables`);
  const grown = [];
  for (const spec of SCHEMA) {
    const table = meta.tables.find(t => t.name === spec.name);
    if (!table) {
      report(`planting ${spec.name}…`);
      await at(`/meta/bases/${s.baseId}/tables`, {
        method: 'POST',
        body: JSON.stringify({ name: spec.name, fields: spec.fields }),
      });
      grown.push(spec.name);
      continue;
    }
    const haveFields = new Set(table.fields.map(f => f.name));
    const missing = spec.fields.filter(f => !haveFields.has(f.name));
    if (!missing.length) { report(`${spec.name} — already growing`); continue; }
    report(`${spec.name} — growing ${missing.length} new field${missing.length === 1 ? '' : 's'}…`);
    for (const f of missing) {
      await at(`/meta/bases/${s.baseId}/tables/${table.id}/fields`, {
        method: 'POST',
        body: JSON.stringify(f),
      });
    }
  }
  for (const [table, rows] of Object.entries(DEFAULTS)) {
    if (!grown.includes(table)) continue;
    report(`sowing ${table}…`);
    for (let i = 0; i < rows.length; i += 10) {
      await at(`/${s.baseId}/${encodeURIComponent(table)}`, {
        method: 'POST',
        body: JSON.stringify({ records: rows.slice(i, i + 10).map(f => ({ fields: f })), typecast: true }),
      });
    }
  }
  report(grown.length ? 'the base is planted.' : 'everything was already here.');
  return grown;
}

// carry the sandbox's life into airtable once connected
export async function transplantSandbox(report = () => {}) {
  for (const spec of SCHEMA) {
    const rows = sbRead(spec.name);
    if (!rows.length) continue;
    report(`carrying ${spec.name} (${rows.length})…`);
    const mergeField = spec.fields[0].name; // Name or Key
    await airtable.upsert(spec.name, mergeField, rows.map(r => r.f));
  }
  report('transplanted.');
}

export function exportAll() {
  const out = {};
  for (const t of SCHEMA) out[t.name] = S.data[t.name].map(r => r.f);
  return JSON.stringify(out, null, 2);
}

// actives, sorted — the two lists every view wants
export const activeHabits = () =>
  S.data.Habits.filter(h => h.f.Active).sort((a, b) => (a.f.Order || 0) - (b.f.Order || 0));
export const activeShop = () =>
  S.data.Shop.filter(i => i.f.Active).sort((a, b) => (a.f.Order || 0) - (b.f.Order || 0));

export function firstVisit() {
  if (localStorage.getItem(LS.seen)) return false;
  localStorage.setItem(LS.seen, '1');
  return true;
}
