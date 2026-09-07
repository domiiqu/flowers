// world.js — turns the soil's records into the plate's world-state. Pure
// functions: computeWorldState(dateISO, data) reads only `data` (the shape
// of store.S.data) and never touches the DOM or writes anything back.
// Only the loaded window (store.DAYS_BACK days) feeds the slow variables —
// documented, not hidden: a garden older than that is remembered by its
// current shape, not relitigated day by day.
//
// A viewed day never sees records dated after itself — a past plate is
// drawn exactly as that day's world stood, not with hindsight.

import { addDays, todayISO, DAYS_BACK } from './store.js?v=12';

const MEAL_TAGS = new Set(['b', 'l', 'd', 'snack']);

function hashDate(dateISO) {
  let h = 0;
  const s = String(dateISO || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

function isMealTag(tag) {
  return MEAL_TAGS.has(String(tag || '').trim().toLowerCase());
}

function activeHabitsOf(data) {
  return (data.Habits || [])
    .filter((h) => h.f.Active)
    .sort((a, b) => (a.f.Order || 0) - (b.f.Order || 0));
}

// a date -> { tracked, meal } map across the whole loaded window, built
// once and reused by aridity, path and sea, which all lean on the same
// idea of "something happened, or didn't, on this day".
function buildDayInfo(data) {
  const info = new Map();
  const touch = (date, meal) => {
    if (!date) return;
    const cur = info.get(date) || { tracked: false, meal: false };
    cur.tracked = true;
    if (meal) cur.meal = true;
    info.set(date, cur);
  };
  for (const t of data.Ticks || []) touch(t.f.Date, false);
  for (const m of data.Moments || []) touch(m.f.Date, isMealTag(m.f.Tag));
  return info;
}

function computeAridity(dateISO, dayInfo) {
  const start = addDays(dateISO, -DAYS_BACK);
  let aridity = 0;
  let untrackedRun = 0;
  for (let d = start; d <= dateISO; d = addDays(d, 1)) {
    const info = dayInfo.get(d);
    if (!info || !info.tracked) {
      untrackedRun++;
      if (untrackedRun > 1) aridity += 0.15;
    } else {
      untrackedRun = 0;
      aridity -= 0.04;
      if (!info.meal) aridity += 0.05;
    }
    aridity = Math.max(0, Math.min(1, aridity));
  }
  return aridity;
}

function computePath(dateISO, dayInfo) {
  let weighted = 0, total = 0;
  for (let i = 13; i >= 0; i--) {
    const d = addDays(dateISO, -i);
    const weight = i <= 2 ? 2 : 1;
    total += weight;
    const info = dayInfo.get(d);
    if (info && info.tracked) weighted += weight;
  }
  return total ? weighted / total : 0;
}

function computeSea(dateISO, dayInfo) {
  let quietRun = 0;
  let d = dateISO;
  while (!(dayInfo.get(d) && dayInfo.get(d).tracked)) {
    quietRun++;
    if (quietRun >= 3) return 0; // fully receded; no need to walk further
    d = addDays(d, -1);
  }
  let streak = 0;
  let d2 = d;
  while (dayInfo.get(d2) && dayInfo.get(d2).tracked) {
    streak++;
    d2 = addDays(d2, -1);
  }
  const level = Math.max(0, Math.min(1, (streak - 7) / 14));
  if (quietRun === 0) return level;
  if (quietRun >= 3) return 0;
  return level * (1 - quietRun / 3);
}

function computeRange(dateISO, data) {
  const n = (data.Hours || []).filter((h) => h.f.Outcome === 'held' && h.f.Date <= dateISO).length;
  return Math.min(1, Math.log2(1 + n) / Math.log2(41));
}

function computeTowerFloors(dateISO, data) {
  const n = (data.Days || []).filter((d) => d.f.Date <= dateISO && (d.f.Note || '').trim()).length;
  return Math.floor(n / 10);
}

function computeWires(dateISO, data) {
  const day = (data.Days || []).find((d) => d.f.Date === dateISO);
  if (!day || !day.f.Schedule) return 0;
  return day.f.Schedule.split('\n').filter((line) => line.trim()).length;
}

function computeHeldHour(dateISO, data) {
  return (data.Hours || []).some((h) => h.f.Date === dateISO && h.f.Outcome === 'held');
}

// scalar ratings live on tagged Moments now (Trackers/Entries retired):
// the day's value for a tag whose name matches `re` and carries a Value.
function momentValue(dateISO, data, re) {
  const m = (data.Moments || []).find(
    (x) => x.f.Date === dateISO && x.f.Value != null && re.test(x.f.Tag || '')
  );
  return m ? m.f.Value : null;
}
// the value of a tag by its EXACT name (case-insensitive) — needed now that
// several mood tags coexist ("mood (morning)" must not answer for "mood").
function momentValueExact(dateISO, data, name) {
  const nm = name.toLowerCase();
  const m = (data.Moments || []).find(
    (x) => x.f.Date === dateISO && x.f.Value != null && String(x.f.Tag || '').trim().toLowerCase() === nm
  );
  return m ? m.f.Value : null;
}
// the day's overall mood: the average of whichever time-of-day moods were
// logged, else a plain "mood" tag, else nothing.
function overallMood(dateISO, data) {
  const parts = ['mood (morning)', 'mood (afternoon)', 'mood (late)']
    .map((t) => momentValueExact(dateISO, data, t)).filter((v) => v != null);
  if (parts.length) return parts.reduce((a, b) => a + b, 0) / parts.length;
  return momentValueExact(dateISO, data, 'mood');
}

function computeTwoSuns(dateISO, data) {
  const s = momentValue(dateISO, data, /sleep/i);
  return s != null ? s < 5 : false;
}

function computeFog(dateISO, data) {
  return momentValue(dateISO, data, /fog/i);
}

function computeSnake(dateISO, data) {
  const todays = (data.Moments || []).filter((m) => m.f.Date === dateISO && m.f.Tag);
  if (!todays.length) return false;
  const firstSeen = new Map();
  for (const m of data.Moments || []) {
    if (!m.f.Tag || m.f.Date > dateISO) continue;
    const cur = firstSeen.get(m.f.Tag);
    if (!cur || m.f.Date < cur) firstSeen.set(m.f.Tag, m.f.Date);
  }
  return todays.some((m) => firstSeen.get(m.f.Tag) === dateISO);
}

function computeLight(dateISO, data, isToday) {
  const mood = overallMood(dateISO, data);
  if (mood != null) {
    const m = Math.max(0, Math.min(5, mood));
    return { light: 0.12 + (m / 5) * 0.76, lightHour: 13.5 };
  }
  if (isToday) {
    const now = new Date();
    return { light: null, lightHour: now.getHours() + now.getMinutes() / 60 };
  }
  return { light: 0.5, lightHour: 13.5 };
}

function computeHabits(dateISO, data, isToday) {
  if (isToday) {
    const ticked = new Set(
      (data.Ticks || []).filter((t) => t.f.Date === dateISO).map((t) => t.f.Habit)
    );
    return activeHabitsOf(data).map((h) => ({ name: h.f.Name, done: ticked.has(h.f.Name) }));
  }
  // past days: history shows what happened, never what didn't — no clouds
  // for habits that simply weren't tracked or weren't yet part of the roster.
  return (data.Ticks || [])
    .filter((t) => t.f.Date === dateISO && t.f.Habit)
    .map((t) => ({ name: t.f.Habit, done: true }));
}

// the same world, flattened to scalars for the Days row — the base's
// plate generator (an AI image field reading a formula field) paints from
// these numbers; a formula there turns them into prompt prose. Pure like
// everything here: the caller decides when to write it back.
// the year clock — season from the date's month (northern hemisphere;
// flip the pairs for southern). Kept to the four canonical words so the
// base's formula can SWITCH on it cleanly; early/late nuance can layer on
// later.
function seasonOf(dateISO) {
  const m = Number((dateISO || '').slice(5, 7)); // 1..12
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'autumn';
}

// the life clock — how many distinct days the practice has touched up to
// and including this one. NOTE: only the loaded window feeds this (~DAYS_BACK
// days), so it plateaus for a long practice; a true lifetime count would
// need a stored running total. Good enough as a maturity proxy for now.
function countTrackedDays(dateISO, data) {
  const seen = new Set();
  const add = (d) => { if (d && d <= dateISO) seen.add(d); };
  for (const t of data.Ticks || []) add(t.f.Date);
  for (const m of data.Moments || []) add(m.f.Date);
  return seen.size;
}

export function dayStateFields(dateISO, data) {
  const w = computeWorldState(dateISO, data);
  // bonus habits sit outside the total, so an undone one never adds a cloud;
  // a done one still counts toward what's done (leaf mass / overachievement)
  const bonusNames = new Set((data.Habits || []).filter((h) => h.f.Active && h.f.Bonus).map((h) => h.f.Name));
  return {
    HabitsDone: w.habits.filter((h) => h.done).length,
    HabitsTotal: w.habits.filter((h) => !bonusNames.has(h.name)).length,
    Fog: w.fog,
    Mood: (() => { const v = overallMood(dateISO, data); return v == null ? null : Math.round(v); })(),
    MoodMorning: momentValueExact(dateISO, data, 'mood (morning)'),
    MoodAfternoon: momentValueExact(dateISO, data, 'mood (afternoon)'),
    MoodLate: momentValueExact(dateISO, data, 'mood (late)'),
    Sleep: momentValue(dateISO, data, /sleep/i),
    HeldHour: w.heldHour,
    ScheduleCount: w.wires,
    Moments: w.moments,
    NewTag: w.snake,
    Aridity: Number(w.aridity.toFixed(2)),
    Path: Number(w.path.toFixed(2)),
    Sea: Number(w.sea.toFixed(2)),
    TowerFloors: w.towerFloors,
    Season: seasonOf(dateISO),
    DaysTracked: countTrackedDays(dateISO, data),
  };
}

export function computeWorldState(dateISO, data) {
  const isToday = dateISO === todayISO();
  const dayInfo = buildDayInfo(data);
  const { light, lightHour } = computeLight(dateISO, data, isToday);

  return {
    seed: hashDate(dateISO),
    lightHour,
    light,
    heldHour: computeHeldHour(dateISO, data),
    moments: (data.Moments || []).filter((m) => m.f.Date === dateISO).length,
    fog: computeFog(dateISO, data),
    aridity: computeAridity(dateISO, dayInfo),
    range: computeRange(dateISO, data),
    path: computePath(dateISO, dayInfo),
    sea: computeSea(dateISO, dayInfo),
    towerFloors: computeTowerFloors(dateISO, data),
    snake: computeSnake(dateISO, data),
    wires: computeWires(dateISO, data),
    twoSuns: computeTwoSuns(dateISO, data),
    habits: computeHabits(dateISO, data, isToday),
  };
}
