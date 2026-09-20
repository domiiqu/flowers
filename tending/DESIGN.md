# life emergent — a day-book that grows

A life-tracking system living beside *picking flowers*. The app is named
**Life Emergent**; it lives at `/tending/` in this repo
(→ https://domiiqu.github.io/flowers/tending/ — the path keeps the working
verb, the app carries the name). Not a dashboard: a place. Same world as the field — dusk
ground, Georgia serif, whispered italics, film grain — but this room is a
day-book you keep, and the keeping itself must feel like the nightly unwind:
easy, seductive, one screen, no hunting.

## the moods (this is the core design law)

Different tools carry different voltages. The app shifts, the user never
toggles anything:

| room | voltage | palette |
|---|---|---|
| the day (default) | calm, gentle | **lit like paper** — light ground `#ece7d8`, ink gone dark `rgba(44,39,30,.74)`, warm accents. Every other room keeps the dusk palette; the capture sheet + moment ribbon stay their own night layer even here |
| the meadow (history) | contemplative | same, hazier |
| the shop | small delight | same + gold `#d9b36a` |
| the hour (scary mode) | HIGH ADRENALINE | near-black `#0d0507`, blood reds, pulse |
| unwind (nightly capture) | hypnotic, slow | deep violet `#12101a`, blue hour |
| tend (settings) | plain, quiet | the day's palette, smaller |

## the economy

- Completing a habit = its flower **blooms** = a *tick* worth that habit's
  **seeds** (points).
- Seeds start **unclaimed**. You have **3 days** to *gather* them
  (press-and-hold — a deliberate, tactile act). After 3 days they
  **wither** — visibly, with a quiet count of what was lost. Urgency, but
  in the world's voice.
- Gathering's *home* is the nightly unwind — its final movement is **the
  harvest**, where waiting seeds swarm in as part of the ritual (this is
  the pull that opens the app each night). But the pollen line on the day
  page gathers at any hour: miss a night and tomorrow, or the day after,
  still catches it. The 3-day grace is exactly this forgiveness.
- Gathered seeds are the wallet. The **shop** (self-made gift shop —
  spending kept in sight) redeems them: press-and-hold on an item to buy.
- **The hour** (scary mode): sixty minutes, do not stop. Holding it earns a
  bonus tick ("the held hour", 12 seeds, still must be gathered). Breaking
  it is logged honestly. High-adrenaline is *quarantined here* — nothing
  else in the app pulses or alarms.

## the rooms

> **v4 — the instrument day, the plate restored (current).** Two parallel
> builds reconciled: the live plate is back, drawn in-browser at the top of
> the day page exactly as `study/`'s Moebius work always intended; the
> logging surface beneath it is Phase 1's **instrument day** — a timeline
> of placed instruments and a calm row of day-long events — which replaced
> the older habit ledger and the tag-capture sheet entirely. Top to bottom:
> the **date, prominent**; **the plate**, live, portrait, crossfading on
> every change; a quiet **print this day** line under it (see below); the
> **schedule as soft blocks** (Google Calendar when connected — see below —
> else editable blocks stored in `Days.Schedule`); **the timeline** (drag
> an instrument from its rail onto the line, stretch a span, tap to note
> it); **day-long events** (one pill row — active habits union active
> markers — tap to light for the day); **personal | work** (six 1–5
> scales); and **a line for the day** (Note).
>
> **The print ritual** stays quiet on purpose, since the live plate above
> is already the day's face: `print this day` checks `Days.Print?`; the
> base's automation paints the day into an image field on that row from
> the same flattened world-state (`world.dayStateFields`) the live plate
> reads; once it lands the line becomes `printed — in the gallery ↗`. The
> live plate is the working, mutable day; a print is a committed keepsake.
> **The gallery** (`#/gallery`) is the wall of every printed day — a plain
> grid of images, newest first, each a door back to its day.
>
> **Google Calendar** (`src/gcal.js`) connects straight from the browser via
> Google Identity Services: a *public* OAuth client id set in tend (no
> secret, no server), token in memory/sessionStorage like the PAT. Read the
> day's events as blocks; create one-hour events; the block count is written
> back so the print still gets its wires. Setup: a Google Cloud OAuth client
> id with the github.io origin allow-listed, scope `calendar.events`.
>
> The world-grammar prose below governs **both** the live plate and the
> print's prompt (via `world.dayStateFields` → the `Days` row → the base's
> formula) — they are two different renderings of the same day and are not
> expected to pixel-match.

### the day — `#/day/YYYY-MM-DD` (default: today)
One screen, a single gentle column on phones, still readable on desktop.
- Header: `‹  friday · september 5  ›` (arrow keys and a soft swipe work
  too — see "touch is the first-class hand" below for how swipe and the
  timeline's own drags stay out of each other's way).
- **The plate**, live: drawn in-browser (`print.js`'s `dayPrint`) from
  `world.computeWorldState`, portrait, crossfading (180ms fade-out/in) on
  every mutation below. This is the day's face on the page.
- **Print this day** — a quiet line under the plate (see the v4 callout
  above); it is not shown inline again once printed, only linked to the
  gallery.
- **The schedule** — Google Calendar blocks when connected, else editable
  `Days.Schedule` lines, unchanged from v3.
- **The timeline** — the day's time surface, replacing the old habit
  ledger and the tag-capture sheet entirely. A rail of **instruments**
  (woke ☀, slept ☾, food •, water •, fatigue, despondency, tech brain… —
  `store.activeInstruments()`, add your own inline, never `window.prompt()`)
  beside a thin midnight-to-midnight line. Drag an instrument down onto the
  line to place it at that rough hour (a spanning instrument gets a
  default 30-minute width you then stretch by its handle; a point
  instrument needs no duration); a `now` tap on the chip drops it at the
  current time in one gesture (today only). Tap a placed instrument to
  open its sheet — a note, and delete. Dragging a placed instrument slides
  it in time; this drag is deliberately kept out of the header's
  swipe-to-change-day gesture (see the touch rules below).
- **Day-long events** — one calm, uniform pill row: `store.activeHabits()`
  union `store.activeMarkers()` (Period, WFH, anything added inline),
  toggled together by `store.toggleDayEvent()`. A habit-pill still runs
  through the existing tick economy (so the day's point tally keeps
  working, and a bonus habit keeps its ✦); a marker-pill just flips a
  `DayMarks` row. Both read alike as "a thing that was true today" and
  both feed the oak's leaf mass — see "the world grammar" below.
- **Personal | Work** — the screen splits into two columns, each carrying
  the same three 1–5 scales: **alignment, novelty, agency** (`Ratings`).
- **A line for the day** — a notes block (`Days.Note`); Enter inserts a
  bullet (`\n• `), deliberately simple.
- Corner hints (exact idiom of the field's `.hints`): `the shop · the
  hour · the gallery · tend`.

(Moments/tags-as-timestamped-capture — the sheet, the hours line, the
sureness ring — retired with v4: the timeline is now the single time
surface. `store`'s `Moments`/`tagChips`/`VALUE_TAGS` machinery stays in
place underneath for back-compat and because scalar ratings still read
tagged Moments by name (`momentValue`), but no day-page UI writes new
Moments any more.)

### the world grammar (the print, v2 — approved direction)
The day is a Moebius plate (see `study/`), and **every interaction is
world-building, parametrically** — continuous math from data to geometry,
never a lookup table of finished cards. Two clocks run:

**Slow variables — the land remembers (computed from trailing history):**
- **aridity** 0..1 — grows with *consecutive* untracked days (one missed
  day barely shows; three crack the earth; a week brings dunes) and with
  unfed days; heals slowly with tracking again — hysteresis: breaking the
  land is fast, mending it is slow. Ramp: green field → sparse scrub →
  cracked earth → pale dunes.
- **the range** — every held hour (scary mode) raises distant mountains,
  cumulatively, permanently, log-scaled. Months of hours become a horizon.
- **the path** 0..1 — tracking continuity over ~14 days. A confident road
  → a faint trace → gone. Returning after absence, it comes back first as
  footprints.
- **the sea** — a shoreline arrives at the horizon after a 7-day tracking
  streak, and withdraws over quiet days. The reward for constancy is a
  coast.
- **the tower** — a retro-futurist building that gains a floor per ~10
  written notes: the archive, visible from the road.

**Fast variables — the day's weather:**
- **clouds = undone habits.** The day starts overcast — one cloud per
  active habit, its x/y set parametrically by the letter-lengths of the
  habit's name (her rule, verbatim). Completing a habit converts its cloud
  into its plant: the sky literally clears as the day is done.
- light ← mood (proposed); fog ← fog, redesigned as reference-style solid
  ground-hugging banks; birds ← moments; **the snake** appears on any day
  a never-before-seen tag enters the vocabulary — novelty has a body;
  **telephone poles** along the horizon = the day's schedule items, wires
  sagging between; **two suns** when sleep < 5 — short sleep makes the
  sky unreal.
- habit identity is a **hash of the habit's name** → species, petal
  count, lean — so habits added, renamed, or archived once live simply
  re-enter the equations; no fixed Variety needed (renaming a habit
  regrows its plant — provenance shifts, and that is acceptable).

**The oak (decided):** the plate's centerpiece is a single tree, not a
bed of flowers — many small ink flowers go line-messy; the references
always hold one subject in a vast space. Habits done = leaf mass and
branch reach; wind (a hard day) visibly bends it and strips leaves
leeward; high aridity bares the branches. Undone habits remain clouds;
completing one still clears the sky and fills the tree. Flowers become
rare small ground-marks, spent sparingly. Past plates always render from
that day's *recorded* ticks, never the current roster — roster edits
never rewrite history.

**The archive (replaces the meadow):** history is a wall of small plates —
the postcards themselves, scrollable, tap one to visit the day. The
meadow view and daySVG retire when the plate wiring lands.

**The plate is portrait** — taller than wide on every screen (never the
old square on iPad or landscape on desktop); the timeline, day-events row
and everything below are all sized to it and centered, so the day reads
as one column.

**The day-events row (replaces the old provenance ledger and, before
that, click-the-flower):** under the plate, the day's lit things stand as
one calm pill row — the union of active habits and active markers,
`store.toggleDayEvent()`. Both a habit-pill and a marker-pill light the
same way and both count toward the oak's leaf mass; only a habit-pill
still earns a seed (through the pre-existing tick economy) and can wear
the ✦ bonus star. The plate is the day; the row is its provenance.

### Phase 2, chosen: the far side & the moon-turn (the double, first face)
Grounded in the user's thesis *The Double as a Triangle or a Pink and
Slippery Moon*: the app is a **double-machine** — the plate (d1) is the
lit, logged face; the unloggable real day is the big-D Double behind it;
the render must simulate the pursuit of comprehension **without
resolving** (resolution kills the numinous). Rule: **data crisp** (d1 =
the log), **uncertainty in the render** (d2 = the world).
- Every plate gains a **reverse (d2) we never fully see**; the moon on the
  timeline is the **threshold**. A moon affordance / tap on the plate
  *turns it over* to the day's far side.
- Far side = same territory rendered as reverse: lower-res, heavier grain,
  atmospheric ripple, night/pink-green register, more blank/masked.
- Authored three ways: the day's data seen from behind (a fatigue span →
  a shadow mass; a held hour → a distant light); **emergence I author**
  (an inhabitant/structure she didn't specify — co-authored d2); and
  **deliberate blank** where the day is unrecorded (Remainder's hockey
  mask — the unknown shown *as* unknown).
- **Sleep is the crossing**: woke/slept (sun/moon) marks define the night
  span; the far side *is* the night. Logged sleep furnishes it; unlogged
  leaves it blank/numinous.
- **Orlando remade at the threshold**: lit-face figure steered by her
  (agency), far-side figure altered by emergence (both — her earlier
  answer). Authoring controls + seasonal accumulation come later.
- Irresolution rules: no labels, no legend, grainier than the lit face,
  always a pink slippery moon.
- Build: prototype the far-side render in `study/` first (my visual review
  against the numinous register), then wire the moon-turn into the app.
  Touches print.js/world.js/views.js/index.html; **no new data tables**
  (reads the instrument-day's data — the timeline's woke/slept marks are
  exactly the sleep-crossing this needs). Past days can be turned.

This is the next build after the instrument day + restored plate (this
round): the live plate above is exactly what the moon-turn will one day
turn over.

### the meadow — `#/meadow`
The emergence payoff. The last ~90 days as one strip of generated
day-plants (horizontal scroll inside its own container), each grown from
that day's data:
- stem height — fraction of habits done
- blooms on the stalk — one per tick
- head colour — mood (cold grey-blue 0 → warm rose-gold 5)
- a fog veil over the plant — brain fog value (this is how she *sees*
  fog-vs-food: foggy days visibly shrouded, thin days visibly starved)
- stem thickness — ate enough (thin & pale when no)
- a tiny gold star above — a held hour that day
Hover/tap a plant: `tuesday · sep 2 — 3 of 5 · fog 4 · fed no`. Click →
that day's page. A one-line legend at the bottom, italic, dim.

### the shop — `#/shop`
A shelf. Each item: its Sign (emoji), name, cost in seeds, and — when it
has a `Link` — a small `↗` that opens the thing itself in a new tab (the
cart, the book, the listing). She names anything, links out, sets a
price: material and immaterial rewards alike. Wallet shown large but
calm. Press-and-hold an item to redeem (the hold is the ceremony);
can't-afford items sit dimmer, cost in dull red. After redeeming a linked
item, offer its link once more — *"go get it ↗"*. Below, small: the last
few redemptions ("what the seeds became").

### the hour — `#/hour`
Entry: near-black room, one line — *"sixty minutes. do not stop."* — a
duration word that cycles on click (sixty / forty-five / twenty-five
minutes), and **begin**.
Running: giant thin countdown `59:12` (tabular numerals), a slow red pulse
vignette that quickens over the hour, synthesized heartbeat (WebAudio, two
low thumps, ~50bpm → ~90bpm; M mutes). Tab-away → the screen notices:
*"it sees you."* No mercy UI: the only exit is **give up — press & hold
three seconds**, which cracks the screen to grey: *"the hour broke at
41:17."* → logged `broken`. Reaching 0:00 → gold flood, *"the hour
held."* → logged `held`, +12 unclaimed seeds waiting in the pollen line.

### unwind — `#/unwind`
The nightly ritual, full-screen, deep violet. One question at a time, big
type, the tracker's own `Ask` field as the question ("how thick was the
fog today?"). Answer with one touch:
- scale → six large petals in an arc; touching the nth opens n petals
- yesno → two words, far apart
- number → large stepper (long-press repeats)
- words → one calm textarea
Auto-advance ~500ms after an answer (Esc leaves anytime; every answer
already saved). Then *a line for the day* (→ Note). Then **the harvest**:
if unclaimed seeds are waiting, they appear as motes and one press-and-hold
gathers them all — the nightly ritual is also payday. Last: today's
finished day-plant grows in before her eyes — the day, summarized as a
flower — and *"goodnight."*

### tend — `#/tend`
Plain and small: PAT + base id fields; **plant the base** (creates missing
tables *and grows missing fields on tables that already exist* via the meta
API, sows defaults — `store.plantBase`, so replanting upgrades an old base
in place); **carry the sandbox over** (`store.transplantSandbox`); export
everything as JSON; and tiny editors to add/rename/**delete** habits,
**tags** (the chip vocabulary), shop items — rename is in place now (never
a duplicate), and delete drops a row from the roster/vocabulary while the
ticks and moments that used its name live on
(needed for sandbox mode; with Airtable connected the base itself is the
admin UI — say so here in one line). Show connection state and queued-writes
count plainly. A one-line warning that the token lives in this browser only.

> **Trackers/Entries retired.** The nightly ritual that fed them is gone;
> scalar ratings (mood, sleep, fog, energy) are captured as **tagged
> Moments carrying a `Value`** — `store.VALUE_TAGS` defines their scales,
> and `world.js` reads them back by name for the plate. The day's whole
> world-state is flattened onto its `Days` row (`world.dayStateFields`,
> written by the day page) so the base can paint the plate from a formula.

## first run
No auth wall, no title screen. The sandbox seeds itself
(`seedSandboxIfBare`) and the day is already alive. One whisper across the
bottom, once: *"this garden is growing in your browser. when you want it
permanent — tend."*

## build law
- Vanilla ES modules, **no build, no dependencies, no accounts, no
  analytics** (house rule of this repo).
- Files: `index.html` (shell + all CSS), `src/store.js` (done — do not
  redesign its API), `src/bloom.js` (all procedural drawing: `plantSVG`,
  `daySVG`, seeded rng), `src/views.js` (the rooms), `src/scary.js` (the
  hour), `src/main.js` (hash router + glue).
- Hash routing; works from any static server; relative paths only.

### touch is the first-class hand (she lives on iPad and phone)
- Every target ≥ 44px; pointer events only; **nothing depends on hover or
  a keyboard** — arrow keys and shortcuts are conveniences layered on top.
- **Swipe** left/right anywhere calm on the day page moves between days
  (with a soft slide); the header arrows remain for taps. **The timeline
  is excluded from this** (`.timeline-section` in `bindSwipe`'s
  `interactive()` check) and every drag inside it calls
  `setPointerCapture`, so a horizontal slide on a placed instrument or a
  span's handle never also reads as swipe-to-change-day.
- **Never `window.prompt()`** for "add a new X" (a day-event, an
  instrument): the app can run as an iOS home-screen (standalone) web app,
  where `window.prompt()` can be silently suppressed. Every such flow uses
  an inline `.field` text input instead (`buildInlineTextAdd`/
  `buildInstrumentAdd` in `views.js`).
- Press-and-hold is the ceremonial verb everywhere — so every holdable
  element gets `-webkit-touch-callout: none; user-select: none;
  touch-action: manipulation;` and holds are driven by
  pointerdown/pointerup/pointercancel (a hold must survive the finger
  wobbling a few pixels; cancel only on real movement > ~12px).
- No double-tap-to-zoom surprises: `touch-action: manipulation` on
  interactive things; layout breathes at 320px wide and at iPad width.
- **The hour cannot rely on the Fullscreen API** (iPhone Safari has none):
  it must be its own fixed full-viewport layer regardless, fullscreen
  request just a bonus. Audio starts only from the begin tap (iOS gesture
  rule). `visibilitychange` still catches tab-switching for *"it sees
  you."*
- Inline edits (schedule, note) use plain textareas/inputs sized ≥ 16px
  font so iOS doesn't zoom the page when they focus.
- Phone-first sizes; hold-to-act everywhere destructive or ceremonial.
- The grain + vignette from the field's index.html, always on, quiet.
- Offline: store.js already queues writes; the UI just trusts it and never
  blocks on the network. A tiny dot in a corner when writes are queued.
