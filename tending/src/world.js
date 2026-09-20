// world.js — turns the soil's records into the plate's world-state. Pure
// functions: computeWorldState(dateISO, data) reads only `data` (the shape
// of store.S.data) and never touches the DOM or writes anything back.
// Only the loaded window (store.DAYS_BACK days) feeds the slow variables —
// documented, not hidden: a garden older than that is remembered by its
// current shape, not relitigated day by day.
//
// A viewed day never sees records dated after itself — a past plate is
// drawn exactly as that day's world stood, not with hindsight.

import { addDays, todayISO, DAYS_BACK } from './store.js';

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

function activeMarkersOf(data) {
  return (data.Markers || [])
    .filter((m) => m.f.Active)
    .sort((a, b) => (a.f.Order || 0) - (b.f.Order || 0));
}

// a date -> { tracked, meal } map across the whole loaded window, built
// once and reused by aridity, path and sea, which all lean on the same
// idea of "something happened, or didn't, on this day". any of the new
// instrument-day tables count as tracked too, alongside the older ones
// (which stay populated — DayMarks toggles still write a Tick).
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
  for (const e of data.Entries || []) touch(e.f.Date, false);
  for (const m of data.Moments || []) touch(m.f.Date, isMealTag(m.f.Tag));
  for (const d of data.DayMarks || []) touch(d.f.Date, false);
  for (const t of data.Timeline || []) touch(t.f.Date, t.f.Instrument === 'food');
  for (const r of data.Ratings || []) touch(r.f.Date, false);
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

// point-events that day stand in for "the day had appointments" — a
// telephone-pole count without needing the never-built Schedule editor.
function computeWires(dateISO, data) {
  return (data.Timeline || []).filter((t) => t.f.Date === dateISO && t.f.End == null).length;
}

function computeHeldHour(dateISO, data) {
  return (data.Hours || []).some((h) => h.f.Date === dateISO && h.f.Outcome === 'held');
}

// sleep, from the timeline: woke minus slept, wrapping past midnight.
// falls back to the old Entries/Moments reading when either mark (or
// the whole feature) is missing, so nothing goes blank mid-transition.
function computeTwoSuns(dateISO, data) {
  const woke = (data.Timeline || []).find((t) => t.f.Date === dateISO && t.f.Instrument === 'woke');
  const slept = (data.Timeline || []).find((t) => t.f.Date === dateISO && t.f.Instrument === 'slept');
  if (woke && slept && woke.f.Start != null && slept.f.Start != null) {
    const duration = woke.f.Start <= slept.f.Start
      ? woke.f.Start + 1440 - slept.f.Start
      : woke.f.Start - slept.f.Start;
    return duration < 300;
  }
  const entry = (data.Entries || []).find((e) => e.f.Tracker === 'sleep' && e.f.Date === dateISO);
  if (entry && entry.f.Value != null) return entry.f.Value < 5;
  const moment = (data.Moments || []).find((m) => m.f.Date === dateISO && m.f.Value != null && /sleep/i.test(m.f.Tag || ''));
  if (moment) return moment.f.Value < 5;
  return false;
}

// fog, from the timeline: a "tech brain" (or legacy "brain fog") mark
// that day — a span's duration maps to severity, a point is a flat 2.
// falls back to the old Entries/Moments reading when absent.
function computeFog(dateISO, data) {
  const mark = (data.Timeline || []).find((t) => t.f.Date === dateISO && /tech brain|brain fog/i.test(t.f.Instrument || ''));
  if (mark) {
    if (mark.f.End != null && mark.f.Start != null) {
      return Math.max(0, Math.min(5, (mark.f.End - mark.f.Start) / 60));
    }
    return 2;
  }
  const entry = (data.Entries || []).find((e) => e.f.Tracker === 'brain fog' && e.f.Date === dateISO);
  if (entry && entry.f.Value != null) return entry.f.Value;
  const moment = (data.Moments || []).find((m) => m.f.Date === dateISO && m.f.Value != null && /fog/i.test(m.f.Tag || ''));
  if (moment) return moment.f.Value;
  return null;
}

// the snake — novelty has a body. either a moment's tag or a timeline
// instrument seen for the first time in the loaded window can trigger it.
function computeSnake(dateISO, data) {
  const todaysTags = (data.Moments || []).filter((m) => m.f.Date === dateISO && m.f.Tag);
  const todaysInstruments = (data.Timeline || []).filter((t) => t.f.Date === dateISO && t.f.Instrument);
  if (!todaysTags.length && !todaysInstruments.length) return false;

  const firstSeenTag = new Map();
  for (const m of data.Moments || []) {
    if (!m.f.Tag || m.f.Date > dateISO) continue;
    const cur = firstSeenTag.get(m.f.Tag);
    if (!cur || m.f.Date < cur) firstSeenTag.set(m.f.Tag, m.f.Date);
  }
  if (todaysTags.some((m) => firstSeenTag.get(m.f.Tag) === dateISO)) return true;

  const firstSeenInstrument = new Map();
  for (const t of data.Timeline || []) {
    if (!t.f.Instrument || t.f.Date > dateISO) continue;
    const cur = firstSeenInstrument.get(t.f.Instrument);
    if (!cur || t.f.Date < cur) firstSeenInstrument.set(t.f.Instrument, t.f.Date);
  }
  return todaysInstruments.some((t) => firstSeenInstrument.get(t.f.Instrument) === dateISO);
}

function computeLight(dateISO, data, isToday) {
  const moodEntry = (data.Entries || []).find((e) => e.f.Tracker === 'mood' && e.f.Date === dateISO);
  if (moodEntry && moodEntry.f.Value != null) {
    const m = Math.max(0, Math.min(5, moodEntry.f.Value));
    return { light: 0.12 + (m / 5) * 0.76, lightHour: 13.5 };
  }
  if (isToday) {
    const now = new Date();
    return { light: null, lightHour: now.getHours() + now.getMinutes() / 60 };
  }
  return { light: 0.5, lightHour: 13.5 };
}

// the oak's leaf mass now reads day-marks (the folded-in habits plus
// period/wfh and anything she's added), not the old habit ledger.
function computeHabits(dateISO, data, isToday) {
  if (isToday) {
    const lit = new Set(
      (data.DayMarks || []).filter((m) => m.f.Date === dateISO).map((m) => m.f.Marker)
    );
    return activeMarkersOf(data).map((m) => ({ name: m.f.Name, done: lit.has(m.f.Name) }));
  }
  // past days: history shows what happened, never what didn't — no clouds
  // for markers that simply weren't lit or weren't yet part of the roster.
  return (data.DayMarks || [])
    .filter((m) => m.f.Date === dateISO && m.f.Marker)
    .map((m) => ({ name: m.f.Marker, done: true }));
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
