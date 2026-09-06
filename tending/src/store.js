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
    { name: 'Notes', type: 'multilineText' },
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
    { name: 'HabitsDone', type: 'number', options: { precision: 0 } },
    { name: 'HabitsTotal', type: 'number', options: { precision: 0 } },
    { name: 'Fog', type: 'number', options: { precision: 0 } },
    { name: 'Mood', type: 'number', options: { precision: 0 } },
    { name: 'Sleep', type: 'number', options: { precision: 2 } },
    { name: 'HeldHour', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'ScheduleCount', type: 'number', options: { precision: 0 } },
    { name: 'Moments', type: 'number', options: { precision: 0 } },
    { name: 'NewTag', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Aridity', type: 'number', options: { precision: 2 } },
    { name: 'Path', type: 'number', options: { precision: 2 } },
    { name: 'Sea', type: 'number', options: { precision: 2 } },
    { name: 'TowerFloors', type: 'number', options: { precision: 0 } },
    // the two slower clocks: the year (season, from the date) and the
    // life (days tracked so far — the hand maturing across the practice)
    { name: 'Season', type: 'singleLineText' },
    { name: 'DaysTracked', type: 'number', options: { precision: 0 } },
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
}

let flushing = false;
export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    let q = qRead();
    while (q.length) {
      await runOp(q[0]);
      q = q.slice(1);
      qWrite(q);
    }
  } catch (e) {
    console.warn('queue holds:', e.message);
  } finally {
    flushing = false;
  }
}
export function queuedCount() { return qRead().length; }

async function write(op) {
  try {
    await flushQueue();
    if (qRead().length) throw new Error('queue not empty');
    await runOp(op);
    return true;
  } catch (e) {
    console.warn('kept for later:', e.message);
    qWrite([...qRead(), op]);
    return false;
  }
}

// ------------------------------------------------------------- the state

export const S = {
  data: { Habits: [], Ticks: [], Shop: [], Redemptions: [], Days: [], Moments: [], Hours: [] },
  loaded: false,
  problem: null,
};

export async function loadAll() {
  const b = backend();
  S.problem = null;
  try {
    await flushQueue();
    for (const t of SCHEMA) S.data[t.name] = await b.list(t.name);
    S.loaded = true;
    await witherOldSeeds();
  } catch (e) {
    S.problem = e.message;
    S.loaded = true;
  }
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
    Seeds: 1, Status: 'unclaimed',
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

// the print ritual — check the day's Print? box; the base paints from there
export async function requestPrint(date) {
  return saveDay(date, { 'Print?': true });
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
  'b', 'l', 'd', 'snack', 'coffee', 'mood', 'sleep', 'fog', 'energy',
  'dairy', 'adderall 10mg', 'fog rolls in', 'cramps', 'heavy', 'light',
];

// the scalar ratings that used to be Trackers — now just tags that carry a
// Value. capturing one of these opens the little petal/stepper for the
// number; world.js reads them back by name for the plate (mood → light,
// sleep → two suns, fog → fog banks). keys are matched case-insensitively.
export const VALUE_TAGS = {
  mood:   { name: 'mood',   kind: 'scale',  min: 0, max: 5 },
  energy: { name: 'energy', kind: 'scale',  min: 0, max: 5 },
  fog:    { name: 'fog',    kind: 'scale',  min: 0, max: 5 },
  sleep:  { name: 'sleep',  kind: 'number', min: 0, max: 14 },
};
export function valueTagFor(tag) {
  return VALUE_TAGS[String(tag || '').trim().toLowerCase()] || null;
}

// the chips: her own vocabulary, surfacing by recency then frequency.
// before any history exists, the starter words fill the rest — they
// recede on their own as real tags outrank them.
export function tagChips(n = 8) {
  const seen = new Map(); // tag -> { count, last }
  for (const m of S.data.Moments) {
    const tag = m.f.Tag;
    if (!tag) continue;
    const cur = seen.get(tag) || { count: 0, last: '' };
    cur.count++;
    const stamp = `${m.f.Date} ${m.f.Time || ''}`;
    if (stamp > cur.last) cur.last = stamp;
    seen.set(tag, cur);
  }
  const ranked = [...seen.entries()]
    .sort((a, b) => b[1].last.localeCompare(a[1].last) || b[1].count - a[1].count)
    .map(([tag]) => tag);
  if (ranked.length < n) {
    for (const t of STARTER_TAGS) {
      if (ranked.length >= n) break;
      if (!ranked.includes(t)) ranked.push(t);
    }
  }
  return ranked.slice(0, n);
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
