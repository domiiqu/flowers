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

> **v3 — the day pares back (current).** The in-app SVG plate has retired:
> the day is no longer painted live in the browser. Instead the day page is
> a calm, near-blank page — a soft warm gradient with the grain over it —
> carrying, top to bottom: the **date, prominent**; the **schedule as soft
> blocks** (Google Calendar when connected — see below — else editable
> blocks stored in `Days.Schedule`), with a quiet `＋ a plan` that creates
> an event; the **print ritual**; then, kept small and quiet, the habit
> ledger and the tag mote (they still feed the world-state). The painted
> plate lives on as **the print**, generated in Airtable from the day's
> world-state, not drawn by the app.
>
> **The print ritual** replaces buying prints with seeds: a `print this day`
> button checks `Days.Print?`; the base's automation paints the day into an
> image field on that row; the button becomes the print itself once the
> image lands. **The gallery** (`#/gallery`) is the wall of every printed
> day — a plain grid of images, newest first, each a door back to its day.
>
> **Google Calendar** (`src/gcal.js`) connects straight from the browser via
> Google Identity Services: a *public* OAuth client id set in tend (no
> secret, no server), token in memory/sessionStorage like the PAT. Read the
> day's events as blocks; create one-hour events; the block count is written
> back so the print still gets its wires. Setup: a Google Cloud OAuth client
> id with the github.io origin allow-listed, scope `calendar.events`.
>
> The world-grammar prose below still governs **the print's prompt** (via
> `world.dayStateFields` → the `Days` row → the base's formula), so it stays
> as the reference — just read "the plate" as "the print" from here down.

### the day — `#/day/YYYY-MM-DD` (default: today)
One screen. No scrolling on desktop; a single gentle column on phones.
- Header: `‹  friday · september 5  ›` (arrow keys work too). A small
  "today" link when you've drifted.
- **The bed**: the habit garden. Each active habit is a procedurally grown
  plant (seeded by its `Variety` number — same species every day, *its*
  flower). Unticked = a closed bud, dim. Click → it blooms (pop, unfurl,
  luminous), `+3 seeds` floats up and fades. Click again (if unclaimed) to
  take it back. Plants sway slightly, offset phases.
- **The pollen line**: unclaimed seeds of the last 3 days as glowing motes,
  each cohort labelled — `today · 9`, `yesterday · 5 — two days left`,
  fading as they age. One action: **gather — press & hold** (900ms, with
  the underline-progress idiom from the studio's "let go"). Gathering pulls
  the motes into the wallet count with a little swarm animation.
- Wallet, corner, quiet: `◦ 124 seeds` (click → shop).
- **The day, gently**: the schedule block. Small italic lines
  (`14:00 — dentist`). Click anywhere on it to edit in place (textarea,
  save on blur → `Days.Schedule`). No calendar grid, no boxes: a poem of
  appointments. (ICS/Google hookup is a later verse; the field exists.)
- **The instruments**: one row of small tracker glyphs with today's value
  (`fog 2 · fed yes · current 4 · slept 7½ · colour 4`). Click one → a
  compact inline control right there (scale = row of 6 dots, yesno = two
  words, number = stepper, words = a line). Saves on change. No modal, no
  navigation.
- **A line for the day**: one input at the bottom → `Days.Note`.
- Corner hints (exact idiom of the field's `.hints`): `the meadow · the
  shop · the hour · unwind · tend`.

### moments — caught in passing (lives inside the day page)
The capture primitive (it absorbed the retired trackers too): **moments**
are timestamped (or deliberately un-timestamped) tags — `adderall 10mg` at
exactly 14:32, `mood 2` mid-afternoon, `cramps` sometime today. Built for
running out the door with a poor memory: capture must cost two taps, and
trusting the timestamp must cost zero.

- A small glowing mote labelled **tag** sits fixed in the thumb zone
  (bottom-right) of every day page. Tap → a calm layer slides up:
  - her tag vocabulary as chips (`store.tagChips()` — recency then
    frequency, trackers lend names before history exists), and at the end
    of that same chip row one **create a tag…** line to type a new tag
    (it joins the vocabulary forever after).
  - tap a chip → **saved instantly** (`captureMoment`, time = now,
    sure = 'exact'), layer starts dismissing. Two taps total.
  - if the tag matches a scale-kind tracker's name, six small petals
    appear for one optional extra tap (the value); skipping is fine.
- **Sureness has a colour, and it lives on the dot.** A new tag times to
  now and lands as a **red** dot (`Sure: 'exact'` — the timestamp is
  trusted). The whole after-the-fact adjustment happens on the hours
  line, not in a fleeting ribbon (`SURE_COLOR`/`SURE_WORD`/`SURE_NEXT` in
  `views.js`): red **exact** → rose **roughly** (`'about'`) → blue **all
  day** (`'day'`, time-agnostic: `heavy`, `light`, `cramps`).
- **The hours line**: on the day page, beneath the plate and sized to it —
  one thin horizontal line, midnight to midnight (the 24-hour day), the
  day's moments strung on it as coloured dots. All-day (blue) dots gather
  at the day's **end** and stack back from it; timed ones fall where their
  clock says. The line is a small instrument:
  - **tap a dot** → it is singled out (enlarged), every other dot and the
    tag stream fade and go untappable, and a detail card shows
    `14:32 · adderall 10mg — exact` with the sureness word (in its colour)
    and a ✕ to take the moment back (`removeMoment`).
  - **tap the selected dot again** (or its word) → walk the colour ring
    exact → roughly → all-day (`adjustMoment` on `Sure`); becoming all-day
    slides it to the end, leaving it un-fades it back.
  - **press-and-drag a dot** → slide it through the hours; release commits
    the new `Time`. Dragging an all-day dot gives it a place in time again
    (`Sure: 'about'`).
  - a tap anywhere off the line and off the card lets the moment go.
- Voltage: calm. The layer must never feel like a form. No required
  fields, no confirm buttons, nothing modal that traps.
- Later verses: wearables write straight into `Moments` (same shape);
  the meadow's day-plants grow fireflies hovering at heights matching
  their hour.

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

**Capture, reworked — the tag dump (urgent, before the plate wiring):**
the now-sheet becomes a rapid-dump surface: it STAYS OPEN after each
tag — tap tap tap, each entry logs with its timestamp and flashes into a
small running stream inside the sheet; close is explicit (swipe down or ✕).
The type-a-tag line autofocuses and Enter logs + clears for the next.
Starter vocabulary (shown only until her own tags take over): b · l · d ·
snack · dairy · coffee · adderall 10mg · fog rolls in · cramps · heavy ·
light. The day page shows the day's tag stream with visible times
(`13:05 b · 14:32 adderall 10mg`), and the hours line + now-mote get an
empty-state hint so capture is discoverable. Nightly questions demote to
optional: unwind leads with the harvest and the day-plate; scales (fog,
mood, sleep, energy) remain but "ate enough" retires in favor of b/l/d
tags. After a week of real tag data, the structure gets revisited.

**The plate is portrait** — taller than wide on every screen (never the
old square on iPad or landscape on desktop); the ledger, hours line and
tag stream are all sized to it and centered, so the day reads as one
column.

**The provenance ledger (new day-page concept, replacing click-the-flower):**
under the plate, the habits stand as a single **dot-separated line** of
small grey words, full plate width — like a print's documentation, a
serial line (`moved my body · went outside · made something`). Tap a word
→ it inks to black, the plate redraws (its cloud becomes its plant), one
seed is earned. The plate is the day; the words are its provenance. Economy
simplifies with it: **every habit = 1 seed**, a held hour = 4; gather and
wither rules unchanged; shop default prices rescale accordingly.

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
everything as JSON; and tiny editors to add/rename habits, shop items
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
  (with a soft slide); the header arrows remain for taps.
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
