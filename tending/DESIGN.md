# tending — a day-book that grows

A life-tracking system living beside *picking flowers*, at
`/tending/` in this repo (→ https://domiiqu.github.io/flowers/tending/ once
merged to main). Not a dashboard: a place. Same world as the field — dusk
ground, Georgia serif, whispered italics, film grain — but this room is a
day-book you keep, and the keeping itself must feel like the nightly unwind:
easy, seductive, one screen, no hunting.

## the moods (this is the core design law)

Different tools carry different voltages. The app shifts, the user never
toggles anything:

| room | voltage | palette |
|---|---|---|
| the day (default) | calm, gentle | night ground `#14161c`, ink `rgba(244,240,230,.62)`, warm accents |
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
tables via the meta API, sows defaults — `store.plantBase`); **carry the
sandbox over** (`store.transplantSandbox`); export everything as JSON;
and tiny editors to add/rename habits, trackers, shop items (needed for
sandbox mode; with Airtable connected the base itself is the admin UI —
say so here in one line). Show connection state and queued-writes count
plainly. A one-line warning that the token lives in this browser only.

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
