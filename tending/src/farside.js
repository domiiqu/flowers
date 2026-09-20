// farside.js — the far side's simulation. Turns a day's records into the
// planet that day leaves behind. Pure functions, exactly like world.js:
// computeFarSide(dateISO, data, prev) reads only `data` (the shape of
// store.S.data) plus the previous day's World row, and never touches the
// DOM or writes anything back.
//
// THE LAW OF THIS FILE, and the reason it is code and not a prompt:
//
//   the simulation decides what is there; the generator only renders it.
//
// If the model invented the planet each night it would go mushy and
// contradict itself by the third week. Rules produce the state, language
// renders it — so the surprise is real and the world stays consistent.
//
// SECOND LAW: nothing in this file's output may speak her log. No
// instrument is ever named, no tag, no rating, no hour, no word like
// sleep, fatigue, work, habit or track. The day reaches the planet only
// as weather. An instrument becomes a species by the hash of its name
// (her rule, inherited from the plate) — so instruments added, renamed or
// archived simply re-enter the equations.
//
// THIRD LAW: difference, never grade. Every day-shape yields something.
// A thin day makes a different planet, not a dying one; the teeth are
// cost, never punishment. A place that withered when she slept badly
// would be a guilt machine, and she would stop turning the card.

import { addDays, DAYS_BACK } from './store.js?v=16';

const MINUTES = 1440;

// ------------------------------------------------------------------ seeds
// same idiom as world.js's hashDate: a stable integer from a string, so a
// given day and a given instrument always land on the same form.
function hashStr(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0;
  return h || 1;
}

// deterministic pick — never Math.random(), or a past day would redraw
// itself differently every time she turned back to it.
function pick(arr, n) { return arr[Math.abs(n) % arr.length]; }

// ------------------------------------------------------- reading the day
// the sun and moon lanes are identified by GLYPH, never by Name — store.js
// is explicit about this (a renamed lane must keep working), and the names
// themselves have drifted between 'woke'/'slept' and 'wake'/'sleep'.
function glyphNames(data) {
  const active = (data.Instruments || []).filter((i) => i.f.Active);
  const sun = active.find((i) => i.f.Glyph === 'sun');
  const moon = active.find((i) => i.f.Glyph === 'moon');
  return { sun: sun ? sun.f.Name : null, moon: moon ? moon.f.Name : null };
}

// every metric the planet is built from. All of it is shape — counts,
// spans, gaps, coverage — never content.
function dayShape(dateISO, data) {
  const rows = (data.Timeline || []).filter((t) => t.f.Date === dateISO);
  const { sun, moon } = glyphNames(data);

  const wake = sun ? rows.find((t) => t.f.Instrument === sun) : null;
  const slept = moon ? rows.find((t) => t.f.Instrument === moon) : null;

  // the night wraps midnight: slept yesterday evening, woke this morning.
  let sleepMinutes = null;
  if (wake && slept) {
    const w = wake.f.Start, s = slept.f.Start;
    sleepMinutes = w <= s ? (w + MINUTES - s) : (w - s);
  }

  // the body of the day, with the sun/moon lanes held out — they are the
  // crossing, not an instrument like the others.
  const body = rows.filter((t) => t.f.Instrument !== sun && t.f.Instrument !== moon);
  const names = [...new Set(body.map((t) => String(t.f.Instrument || '')))].filter(Boolean).sort();
  const spans = body.filter((t) => t.f.End != null && t.f.End > t.f.Start);
  const points = body.filter((t) => !(t.f.End != null && t.f.End > t.f.Start));

  // covered minutes, so overlapping spans are not double-counted.
  const covered = new Array(MINUTES).fill(false);
  for (const s of spans) {
    const a = Math.max(0, Math.min(MINUTES - 1, s.f.Start | 0));
    const b = Math.max(0, Math.min(MINUTES, s.f.End | 0));
    for (let m = a; m < b; m++) covered[m] = true;
  }
  const coverage = covered.filter(Boolean).length / MINUTES;

  // the longest waking stretch with nothing on it — this becomes the
  // occluded ground. The unknown shown AS unknown.
  const dayStart = wake ? Math.max(0, wake.f.Start | 0) : 6 * 60;
  const dayEnd = slept && slept.f.Start > dayStart ? (slept.f.Start | 0) : 23 * 60;
  const marked = new Array(MINUTES).fill(false);
  for (const t of body) {
    const a = Math.max(0, Math.min(MINUTES - 1, t.f.Start | 0));
    const b = t.f.End != null && t.f.End > t.f.Start
      ? Math.max(0, Math.min(MINUTES, t.f.End | 0)) : a + 1;
    for (let m = a; m < b; m++) marked[m] = true;
  }
  let gap = 0, bestGap = 0, bestGapAt = null, run = 0;
  for (let m = dayStart; m < dayEnd; m++) {
    if (!marked[m]) { run++; if (run > bestGap) { bestGap = run; bestGapAt = m - run + 1; } }
    else run = 0;
  }
  gap = bestGap;

  const longestSpan = spans.reduce((mx, s) => Math.max(mx, (s.f.End | 0) - (s.f.Start | 0)), 0);

  // the ratings, if she set any. Absent is a real state, not a zero.
  const ratings = (data.Ratings || []).filter((r) => r.f.Date === dateISO);
  const axis = (domain, name) => {
    const r = ratings.find((x) => x.f.Domain === domain && x.f.Axis === name);
    return r && r.f.Value != null ? r.f.Value : null;
  };
  const mean = (vals) => {
    const v = vals.filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  const dayRow = (data.Days || []).find((d) => d.f.Date === dateISO);
  const note = dayRow && dayRow.f.Note ? String(dayRow.f.Note).trim() : '';

  // an instrument seen today and never before, anywhere in the window —
  // novelty gets a body on the far side too.
  const earlier = new Set(
    (data.Timeline || []).filter((t) => t.f.Date < dateISO).map((t) => String(t.f.Instrument || ''))
  );
  const firstSeen = names.filter((n) => !earlier.has(n));

  return {
    dateISO,
    seed: hashStr(dateISO),
    names, marks: body.length,
    spanCount: spans.length, pointCount: points.length,
    coverage, longestSpan, gap, gapAt: bestGapAt,
    sleepMinutes, wakeAt: wake ? wake.f.Start : null,
    alignment: mean([axis('personal', 'alignment'), axis('work', 'alignment')]),
    novelty: mean([axis('personal', 'novelty'), axis('work', 'novelty')]),
    agency: mean([axis('personal', 'agency'), axis('work', 'agency')]),
    noteLength: note.length,
    firstSeen,
    tracked: body.length > 0 || !!wake || !!slept || !!note || ratings.length > 0,
  };
}

// ------------------------------------------------------------ vocabulary
// One form per instrument, chosen by the hash of the instrument's name.
// Rename a lane and its species changes — provenance shifts, and that is
// acceptable; it is the same bargain the front face already makes.
const FORMS = [
  { n: 'heavy ribbed stalks', d: 'opening at the top into flat pale discs that turn with the moon and ignore the sun' },
  { n: 'low domes', d: 'skins drawn tight, lit faintly from within' },
  { n: 'hair-thin spires', d: 'that hum when the pressure drops and are silent otherwise' },
  { n: 'flat black rosettes', d: 'lying hard against the ground, opening only once the light has gone' },
  { n: 'jointed canes', d: 'bending away from the water rather than toward it' },
  { n: 'pale bladders', d: 'each one holding a little weather of its own' },
  { n: 'coiled fronds', d: 'that unwind a measured amount each night and do not wind back' },
  { n: 'stiff grey fans', d: 'turned edge-on, as if the air were coming from somewhere else' },
  { n: 'clustered beads', d: 'strung on filaments too fine to see from standing height' },
  { n: 'hollow trumpets', d: 'filling slowly with the night and emptying at no fixed hour' },
  { n: 'sheet lichens', d: 'lifting at the corners, showing a wet green underside' },
  { n: 'stubbed columns', d: 'worn smooth at the top by something that comes back' },
];
const formFor = (name) => FORMS[hashStr(name) % FORMS.length];

// ---------------------------------------------------------------- planes
// SKY — the night, and therefore the crossing. Sleep is what furnishes it;
// unlogged sleep leaves it numinous rather than empty.
function skyOf(s) {
  const bands = Math.max(2, Math.min(5, 2 + Math.floor(s.names.length / 2)));
  const spread = s.coverage > 0.5 ? 'all moving the same way and at the same speed'
    : s.coverage > 0.2 ? 'moving at different speeds and in different directions — the lowest fast, the highest almost still'
    : 'barely moving at all, stacked and waiting';
  let moon;
  if (s.sleepMinutes == null) {
    moon = 'Above the cloud there is a paleness that may be a moon. It does not resolve tonight.';
  } else if (s.sleepMinutes < 300) {
    moon = 'Two moons, neither of them finished, and the smaller keeps pace with the faster cloud.';
  } else if (s.sleepMinutes < 400) {
    moon = 'A moon: pink, wet-looking, too large, and slightly out of round.';
  } else if (s.sleepMinutes > 560) {
    moon = 'The moon has not moved all night. It sits pink and swollen where it sat at dusk.';
  } else {
    moon = 'A moon low and pink, slick as something just lifted out of water.';
  }
  return `${bands} bands of cloud, ${spread}. ${moon}`;
}

// FAR — the land's memory. This plane is slow: it answers to the trailing
// window, not to today, which is why it is the one that makes a year of
// days legible as a single shape.
function farOf(s, slow) {
  const lean = slow.aridity > 0.66 ? 'leaning far over, several of them down'
    : slow.aridity > 0.33 ? 'leaning together where they meet at the top'
    : 'standing nearly upright, well apart';
  const horizon = slow.aridity > 0.5
    ? 'Behind them the haze thins and the horizon finishes too soon, too sharply.'
    : 'Behind them the haze goes green and the horizon does not finish.';
  const shore = slow.sea > 0.2 ? ' A pale shoreline gleams along the far edge, further out than it was.' : '';
  const structure = slow.towerFloors > 0
    ? ` Something built stands far off, ${slow.towerFloors === 1 ? 'a single tier' : slow.towerFloors + ' tiers'} of it, lit at no window.`
    : '';
  const trace = slow.path > 0.6 ? ' A causeway runs out through all of it, raised and certain.'
    : slow.path > 0.25 ? ' A broken causeway shows in places and is gone in others.' : '';
  return `A ridge of pale vertical growths, taller than trees and far thinner, ${lean}. ${horizon}${shore}${structure}${trace}`;
}

// MID — the day's own structure. Spans become terraces, and how much of
// the day was held becomes how much water they hold.
function midOf(s) {
  if (s.spanCount === 0 && s.pointCount === 0) {
    return 'Flat ground going on without terraces, holding nothing, its colour uniform and slightly wrong.';
  }
  const terraces = Math.max(1, Math.min(9, s.spanCount || 1));
  const one = terraces === 1;
  const water = s.coverage > 0.45 ? (one ? 'full to its lip' : 'each one full to its lip')
    : s.coverage > 0.15 ? (one ? 'holding less than it was built for' : 'each one holding a different amount, and each a slightly different colour')
    : (one ? 'down to a skin of water at the bottom' : 'most of them down to a skin of water at the bottom');
  const margin = s.pointCount > 4
    ? ' Small lit things crowd the margins, too many to count.'
    : s.pointCount > 0 ? ` ${s.pointCount === 1 ? 'One lit thing sits' : 'A few lit things sit'} on the margins, well apart.` : '';
  return `Standing water held in ${terraces} shallow terrace${terraces === 1 ? '' : 's'}, ${water}.${margin}`;
}

// NEAR — the instruments themselves, as growth close to the glass. Up to
// three get named; a fourth becomes "and others", because a foreground
// that lists everything stops being a foreground.
function nearOf(s) {
  if (!s.names.length) {
    return 'Foreground growth held in shadow, close enough to touch and not resolved.';
  }
  const forms = s.names.map(formFor);
  const seen = [];
  for (const f of forms) if (!seen.some((x) => x.n === f.n)) seen.push(f);
  const shown = seen.slice(0, 3);
  const parts = shown.map((f, i) => (i === 0 ? `${f.n} at waist height, ${f.d}` : `${f.n} ${f.d}`));
  let text = parts.join('; ');
  if (seen.length > 3) text += `; and other growth behind them, unnamed`;
  const novel = s.firstSeen.length
    ? ` One kind here has not been seen before and does not match the rest.` : '';
  return `${text}.${novel}`;
}

// -------------------------------------------------------- light, weather
function lightOf(s) {
  if (s.wakeAt == null) return 'Light from no clear source, caught in the haze rather than landing on the ground.';
  const h = s.wakeAt / 60;
  if (h < 5) return 'Light from below the horizon, hours before anything should be lighting anything. The ground returns more of it than it is given.';
  if (h < 7.5) return 'Low light from three-quarters behind, caught in the haze rather than landing on the ground.';
  if (h < 10) return 'Flat light from directly above the cloud, arriving evenly and without direction.';
  return 'Late light, already going, coming in almost level and catching only the standing water.';
}

function weatherOf(s) {
  const a = s.alignment, n = s.novelty, g = s.agency;
  const ground = g == null ? 'Still at ground level'
    : g >= 4 ? 'Moving hard at ground level' : g <= 2 ? 'Dead still at ground level' : 'Barely moving at ground level';
  const above = a == null ? 'and moving above'
    : a >= 4 ? 'and steady above' : a <= 2 ? 'and turning over fast above' : 'and moving above';
  const pressure = n == null ? 'Pressure unread.'
    : n >= 4 ? 'Pressure rising, and quickly.' : n <= 2 ? 'Pressure dropping.' : 'Pressure level.';
  return `${ground}, ${above}. ${pressure}`;
}

// ----------------------------------------------------------- the teeth
// Cost, never punishment. Every branch here charges her something; none
// of them says she did wrong, and none of them can be repaid by trying
// harder tomorrow. That distinction is the whole design.
function teethOf(s, slow) {
  const out = [];
  if (s.gap >= 240) {
    out.push('The water in the lower terraces went back down while no one was watching, and will not be replaced this era.');
  }
  if (s.sleepMinutes != null && s.sleepMinutes < 300) {
    out.push('The second moon pulls on everything that opens at night; what opened under it opened wrong and cannot be reset.');
  }
  if (s.longestSpan >= 240) {
    out.push('Something held its position here for a long time and the ground beneath it has not come back up.');
  }
  if (slow.aridity > 0.5) {
    out.push('The ridge is further over than it was and nothing is holding it.');
  }
  if (!out.length) {
    out.push('Whatever did not open tonight will not open. That is the ordinary cost and it is charged every night.');
  }
  return out.slice(0, 2).join(' ');
}

// --------------------------------------------------------------- masked
// the literal unlogged stretch, rendered as occluded ground. Never as
// absence — the unknown shown AS unknown.
function maskedOf(s) {
  if (!s.tracked) {
    return 'Nearly all of it. The weather came in and has not lifted, and the shape of the ground beneath is a guess.';
  }
  if (s.gap < 90) return '';
  const hours = Math.round(s.gap / 60);
  const where = s.gapAt == null ? 'a shelf out past the terraces'
    : s.gapAt < 11 * 60 ? 'the eastern shelf'
    : s.gapAt < 16 * 60 ? 'the middle ground, directly ahead'
    : 'the western shelf';
  return `${where[0].toUpperCase()}${where.slice(1)}, behind weather — ${hours} hours of it, and no way to tell from here what stands there.`;
}

// ------------------------------------------------------------ the drift
// how far the place has moved since the last painted plate. Regeneration
// is an event, not a nightly chore: a place you visit is not repainted
// every night.
function driftOf(next, prev) {
  if (!prev) return 1;
  const keys = ['Sky', 'Far', 'Mid', 'Near', 'Light', 'Weather'];
  let changed = 0;
  for (const k of keys) if ((prev[k] || '') !== (next[k] || '')) changed++;
  return Math.round((changed / keys.length) * 100) / 100;
}

// ---------------------------------------------------------- germination
// A specimen comes up on a rare day-shape, and rarity is measured against
// her own history — a thing is rare because she has only done that twice,
// never because a table said so.
const GERMS = [
  { id: 'long-span', test: (s) => s.longestSpan >= 300,
    kind: 'vegetation', why: 'one thing held without a break from first light to well past the middle of the day' },
  { id: 'early', test: (s) => s.wakeAt != null && s.wakeAt < 5 * 60,
    kind: 'creature', why: 'the light came before anything should have been lighting anything' },
  { id: 'short-night', test: (s) => s.sleepMinutes != null && s.sleepMinutes < 300,
    kind: 'weather', why: 'a night that ended before it had finished' },
  { id: 'long-night', test: (s) => s.sleepMinutes != null && s.sleepMinutes > 600,
    kind: 'mineral', why: 'a night that went on past its own end' },
  { id: 'dense', test: (s) => s.names.length >= 6,
    kind: 'vegetation', why: 'more kinds standing at once than the ground here usually carries' },
  { id: 'novel', test: (s) => s.firstSeen.length > 0,
    kind: 'creature', why: 'a kind that had not been seen on this shelf before' },
  { id: 'empty', test: (s) => s.tracked && s.marks === 0,
    kind: 'trace', why: 'a day that left almost nothing standing, and left this instead' },
];

// how often this shape has come up across the loaded window — the honest
// denominator, and the reason rarity cannot be gamed.
function rarityOf(germ, dateISO, data) {
  const start = addDays(dateISO, -DAYS_BACK);
  // strictly BEFORE today: counting today in its own denominator made a
  // first-ever shape come out rarity 0, the exact inverse of the truth.
  let priorHits = 0, priorDays = 0;
  for (let d = start; d < dateISO; d = addDays(d, 1)) {
    const s = dayShape(d, data);
    if (!s.tracked) continue;
    priorDays++;
    if (germ.test(s)) priorHits++;
  }
  if (!priorDays) return { rarity: 1, note: 'the first of its kind on this shelf' };
  const rarity = Math.max(0, Math.min(1, 1 - (priorHits / priorDays)));
  const span = priorDays === 1 ? 'day' : 'days';
  const note = priorHits === 0 ? `the first in ${priorDays} ${span}`
    : priorHits === 1 ? `the second in ${priorDays} ${span}`
    : `the ${priorHits + 1}th in ${priorDays} ${span}`;
  return { rarity: Math.round(rarity * 100) / 100, note };
}

export function germinate(dateISO, data) {
  const s = dayShape(dateISO, data);
  if (!s.tracked) return null;
  const hit = GERMS.filter((g) => g.test(s));
  if (!hit.length) return null;
  const germ = pick(hit, s.seed);
  const form = s.names.length ? formFor(pick(s.names, s.seed)) : FORMS[s.seed % FORMS.length];
  const { rarity, note } = rarityOf(germ, dateISO, data);
  return {
    Name: `${form.n.split(' ').slice(-1)[0].replace(/s$/, '')}, ${pick(['fallen', 'unopened', 'split', 'out of season', 'carried', 'left standing'], s.seed >> 3)}`,
    Found: dateISO,
    Kind: germ.kind,
    Conditions: `It came up on ${germ.why}.`,
    Traits: `One of the ${form.n}, ${form.d}. Taken entire. Lit faintly from within, and dimming.`,
    Rarity: rarity,
    'Rarity note': note,
  };
}

// ----------------------------------------------------------------- main
// `slow` is the land's memory. It is deliberately the SAME memory the
// front face keeps (world.js's aridity/path/sea/towerFloors), translated
// rather than recomputed — the two faces remember one life, and only
// render it differently.
export function computeFarSide(dateISO, data, prev, slow) {
  const s = dayShape(dateISO, data);
  const mem = slow || { aridity: 0, path: 0, sea: 0, towerFloors: 0 };
  const next = {
    Key: dateISO,
    Date: dateISO,
    Sky: skyOf(s),
    Far: farOf(s, mem),
    Mid: midOf(s),
    Near: nearOf(s),
    Light: lightOf(s),
    Weather: weatherOf(s),
    Inhabitant: inhabitantOf(s),
    Teeth: teethOf(s, mem),
    Masked: maskedOf(s),
  };
  next.Changed = changedOf(next, prev);
  next.Drift = driftOf(next, prev);
  return next;
}

// where it is and what it is doing. It is not her, and it cannot be
// steered — it only ever reacts to the weather she sets.
function inhabitantOf(s) {
  const where = s.spanCount > 2 ? 'Walking the terrace margins'
    : s.spanCount > 0 ? 'Standing at the near edge of the water'
    : 'Out past the terraces, further than usual';
  const doing = s.names.length >= 5 ? 'checking every kind in turn, and behind on it'
    : s.names.length >= 2 ? 'checking which of the domes have opened'
    : s.names.length === 1 ? 'seeing to one thing only, and taking time over it'
    : 'not working. Looking at the weather coming in';
  const since = s.wakeAt != null && s.wakeAt < 6 * 60
    ? '. Has been out since before the light changed.' : '. Carrying something.';
  return `${where}, ${doing}${since}`;
}

// what materially shifted since the last plate — empty means the place
// held still, and a place that held still does not need repainting.
function changedOf(next, prev) {
  if (!prev) return 'The first plate of this shelf. Nothing to compare it against yet.';
  const out = [];
  if ((prev.Mid || '') !== next.Mid) out.push('The terraces stand differently than they did.');
  if ((prev.Far || '') !== next.Far) out.push('The ridge has moved.');
  if ((prev.Near || '') !== next.Near) out.push('What is growing close to hand has changed over.');
  if ((prev.Sky || '') !== next.Sky) out.push('The sky is not the sky of the last plate.');
  return out.join(' ');
}

// the Airtable payload, keyed by field NAME — the same shape and the same
// contract as world.dayStateFields, so the write path is an upsert on Key.
export function farSideFields(dateISO, data, prev, slow) {
  return computeFarSide(dateISO, data, prev, slow);
}
