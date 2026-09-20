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

> **v5: seeds/shop unlinked from the day page.** This whole economy is
> still real underneath (the shop room, `store.wallet`/`gather`/`tick`
> all work exactly as described above), but the day page itself no longer
> surfaces any of it — no point counter, no habit ledger, no shop link in
> its corner hints. The day now logs through the instrument lanes alone;
> re-linking the economy to the day page is a deferred conversation, not
> a removed one.

## the rooms

> **v5 — the timeline becomes lanes; seeds/shop step back (current).** The
> day-events pill row is gone, and with it the point counter — see the
> economy note above. The timeline (still the day's one time surface) is
> rebuilt as **lanes**: one row per active instrument, an hour ruler
> shared across all of them, no more rail-and-drag-a-chip. **The oak now
> grows from the timeline itself** — an instrument not yet logged today
> is a cloud, exactly as an undone habit used to be; logging it converts
> that cloud into a leaf cluster (see "the world grammar" below). Top to
> bottom: the **date, prominent**; **the plate**, live, portrait,
> crossfading on every change; a quiet **print this day** line under it
> (see below); the **schedule as soft blocks** (Google Calendar when
> connected — see below — else editable blocks stored in
> `Days.Schedule`); **the lanes** (tap an empty spot on an instrument's
> own lane to place it there, stretch either edge, drag the body to
> retime); **personal | work** (side by side, six delicate 1–5 sliders);
> and **a line for the day** (Note).
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
No point counter rides the corner any more — see the v5 economy note above.
- Header: `‹  friday · september 5  ›` (arrow keys and a soft swipe work
  too — see "touch is the first-class hand" below for how swipe and the
  lanes'/sliders' own drags stay out of each other's way).
- **The plate**, live: drawn in-browser (`print.js`'s `dayPrint`) from
  `world.computeWorldState`, portrait, crossfading (180ms fade-out/in) on
  every mutation below. This is the day's face on the page.
- **Print this day** — a quiet line under the plate (see the v5 callout
  above); it is not shown inline again once printed, only linked to the
  gallery.
- **The schedule** — Google Calendar blocks when connected, else editable
  `Days.Schedule` lines, unchanged from v3.
- **The timeline, as lanes** — the day's one time surface, and now the
  oak's only input (see "the world grammar" below). One lane per active
  instrument (`store.activeInstruments()` — woke ☀, slept ☾, food •,
  water •, fatigue, despondency, tech brain… — add your own inline, never
  `window.prompt()`), stacked under a shared hour ruler (a tick every
  hour, a number every 3). The lane IS the instrument now — no more rail
  to drag a chip off of: **tap an empty spot on a lane's own track** to
  place it there (a default 30-minute span, every mark stretchable, the
  old `Spans` flag no longer consulted); a `now` tap beside the lane's
  name drops it at the current time in one gesture (today only). Every
  mark drags three ways — the body retimes it, the left edge moves its
  start, the right edge moves its end — each a generous ≥44px touch zone
  even though the mark itself reads smaller. Tap a mark to open its sheet
  — a note, and delete. All of this is deliberately kept out of the
  header's swipe-to-change-day gesture (see the touch rules below).
- **Personal | Work** — side by side at every width (never stacked, even
  on a phone): each column carries the same three delicate 1–5 sliders —
  **alignment, novelty, agency** (`Ratings`, unchanged schema) — label
  above a thin track, snapping to five stops by tap or drag. Unset reads
  as visibly bare (no handle at all, just the five ghosted stops); a real
  value shows a filled handle.
- **A line for the day** — a notes block (`Days.Note`); Enter inserts a
  bullet (`\n• `), deliberately simple.
- Corner hints (exact idiom of the field's `.hints`): `the hour · the
  gallery · tend` — no shop link; see the v5 economy note above.

(Moments/tags-as-timestamped-capture and the day-events pill row — both
now retired from this page. `store`'s `Moments`/`tagChips`/`VALUE_TAGS`
and `Markers`/`DayMarks`/`toggleDayEvent` machinery all stay in place
underneath for back-compat — scalar ratings still read tagged Moments by
name (`momentValue`) — but no day-page UI writes to either any more.)

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
- **clouds = instruments not yet logged today.** The day starts overcast
  — one cloud per active instrument, its x/y set parametrically by the
  letter-lengths of the instrument's name (her rule, verbatim — habits
  had this first; instruments inherit it now). Logging an instrument
  (placing it anywhere on its lane) converts its cloud into a leaf
  cluster: the sky literally clears as the day fills in.
- light ← mood (proposed); fog ← fog, redesigned as reference-style solid
  ground-hugging banks; birds ← moments; **the snake** appears on any day
  a never-before-seen tag OR instrument enters the vocabulary — novelty
  has a body; **telephone poles** along the horizon = the day's schedule
  items, wires sagging between; **two suns** when sleep < 5 (from the
  timeline's own woke/slept marks, falling back to a tagged "sleep"
  Moment) — short sleep makes the sky unreal.
- instrument identity is a **hash of the instrument's name** → species,
  petal count, lean — so instruments added, renamed, or archived once
  live simply re-enter the equations; no fixed Variety needed (renaming
  one regrows its plant — provenance shifts, and that is acceptable).

**The oak (decided):** the plate's centerpiece is a single tree, not a
bed of flowers — many small ink flowers go line-messy; the references
always hold one subject in a vast space. **v5: the oak's input moved from
habits/day-events to the timeline** — `world.computeInstrumentEvents`
reads `store.activeInstruments()` and marks each one done the moment it
has at least one `Timeline` row that date. Logged instruments = leaf mass
and branch reach; wind (a hard day) visibly bends it and strips leaves
leeward; high aridity bares the branches. An instrument not yet logged
remains a cloud; logging it still clears the sky and fills the tree.
Flowers become rare small ground-marks, spent sparingly. Past plates
always render from that day's *recorded* Timeline rows, never the
current instrument roster — roster edits never rewrite history. (Habits/
Ticks and Markers/DayMarks no longer feed the plate at all — see the v5
economy note and the retired-day-events note above; their tables and
helpers are untouched, just unlinked.)

**The archive (replaces the meadow):** history is a wall of small plates —
the postcards themselves, scrollable, tap one to visit the day. The
meadow view and daySVG retire when the plate wiring lands.

**The plate is portrait** — taller than wide on every screen (never the
old square on iPad or landscape on desktop); the lanes, sliders and notes
below are all sized to it and centered, so the day reads as one column.

### Phase 2, chosen: the far side & the moon-turn (the double, first face)

> **Superseded in part by "the far side, v2" below (current).** The *thesis*
> in this section stands entirely — the double-machine, data crisp /
> uncertainty in the render, resolution kills the numinous, sleep as the
> crossing, the pink slippery moon as the threshold. What is retired is this
> section's *render recipe*: "far side = same territory rendered as reverse,
> lower-res, heavier grain." The same map at worse resolution is a photocopy,
> not a double. v2 below replaces the mechanism and keeps the law.

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

### the far side, v2 — a place you visit (current direction)

The back of the card is not another rendering of the day. **The front is a
still — committed, printable, hung in the gallery. The back is never still,
never the same twice, and cannot be printed.** Same day, two states of
matter. That difference *is* the double, and it does the work the old
grain-and-blur recipe was trying to do.

**The place is continuous.** It does not fork into one plate per day; it
accumulates. What is per-day is the **specimen** — the thing found there,
the souvenir carried back. `Days` keeps the front face; `Specimens` keeps
the finds.

**An inhabitant, not an avatar.** An avatar of her collapses the double into
a mirror. What lives back there is an other, unsteerable; her logged day
reaches it only as *climate*. She sets the weather by living. It decides
what to do about it. (The Sims pleasure was never control — it was watching
something choose inside conditions you built.)

**The law: difference, never grade.** Every day-shape yields something. A
bad night makes a *different* creature, not a dying one; insomnia is
fertile; the rare conditions include the chaotic ones. The moment the world
withers when she sleeps badly it becomes a guilt machine and the card stops
getting flipped. *God is Change* — adaptation, not judgment. This is a hard
law, not a preference.

**Rarity is computed from her own statistics**, never a fixed table. A thing
is rare because she has only done that twice.

**Storage: Airtable, one soil.** *(Rejected: world state as JSON in the repo
written by a nightly Action — a second source of truth for no gain, when the
front face already proves the Airtable generation pattern and a `Specimens`
table is already a specimen cabinet: sortable, filterable, hand-editable.
Hand-editing **is** the canon loop — she renames a thing and the world is
bound by it. If rolling narrative context later outgrows what an aiText
field can see, an Action writes **into** Airtable; it never becomes a second
store.)*

**The split that keeps emergence real:** the simulation is deterministic
code (`world.js`), the generator only renders. The sim decides what a
specimen **is** — traits, form, coloration, provenance, rarity — and those
words go into the prompt. **Determinism lives in the description, richness
lives in the render.** A specimen can always be regenerated identically,
because its identity is text, not pixels. If the model improvises the world
it goes mushy and self-contradicting by week three; if rules produce the
state and the model only renders it, the surprise is real and the voice
stays consistent.

**One style preamble in one field**, so the whole cabinet is restyleable
from a single cell. Style drift across a year is the failure mode to design
against — the collection must read as one collection.

**Irresolution, enforced mechanically:** unlogged stretches render *masked*,
not absent — the place has rooms she never sees. No legend, ever. The pink
slippery moon stays the threshold.

#### motion — the back breathes

Airtable returns a still, so motion happens in the browser over it. The
reference is *Sky: Children of the Light*, and what makes that world feel
alive is **atmosphere**, not character animation. Build order:

1. **Breathing.** Living atmosphere over the generated plate — fog banks
   drifting at different rates, grain that pulses, a slow push, light
   temperature shifting with the actual hour of viewing. Cheap; most of the
   feeling.
2. **Depth.** Generate in named layers (**sky / far / mid / near**) and
   parallax them to device tilt (`deviceorientation` — she lives on iPad and
   phone). The biggest felt jump for the effort. **The layer spec must be in
   the image prompt from day one** — retrofitting depth onto a flat plate
   means regenerating everything.
3. **Inhabitants.** A canvas layer where things move and answer touch. Here
   the automaton finally earns its place: the day's `Timeline` lanes are
   already a bitmap (instrument × minute), so the day is an initial
   condition. Run it forward in the browser and let its output drive the
   motes and the figure — deterministic seed, live motion, never twice the
   same. The automaton is the **genome, never the visual**; she is not
   looking at cells.

*Rejected: generated video.* Cost per day, slow, style-unstable, heavy on
mobile, and it breaks both the no-build rule and the Airtable pipeline.
Tiers 1–3 get closer to the reference than a four-second clip would.

#### the place, decided

**Another planet.** Alien vegetation, strange physics, creatures. The
inhabitant **has a voice**, and the far side **has teeth** — but teeth as
*cost*, not punishment: canon's opening line for the planet is "the place is
indifferent, and it is expensive." A planet that punished her for a bad night
would be the guilt machine the law above forbids; a planet that *charges* her
is a world.

#### the tables (built — base `life_emergent`)

Three tables, following this base's existing contract: **no linked records,
everything denormalized on text keys, `Key` is the upsert key.**

- **`Canon`** — the law. `Name / Kind / Text / Active / Added / Notes`.
  `Kind` = style · voice · planet · law · being · place · name · event. The
  three pinned rows (style, voice, planet) are copied forward as text onto
  every new `World` and `Specimens` row, so a past plate keeps the canon it
  was made under and later edits never rewrite history. Editing a row by
  hand **is** the ratification loop.
- **`World`** — the continuous place, one snapshot row per day inheriting
  from the last. `Key / Date / Era / Region / Sky / Far / Mid / Near / Light
  / Weather / Inhabitant / Teeth / Masked / Changed / Found / Drift / Style /
  Voice / Planet / Dispatch / Regenerate? / Plate` + two formulas.
  **`Sky / Far / Mid / Near` are the four parallax planes** and must always
  be filled — the browser lifts them for depth-on-tilt, so a flat plate is a
  bug, not a style choice.
- **`Specimens`** — the cabinet. `Name / Found / Kind / Conditions / Traits /
  Rarity / Rarity note / Style / Planet / Image / Notes` + `Prompt`. Rarity
  runs 0→1 with 1 rarest, computed against her own history. The sim writes
  `Conditions` and `Traits`; she overwrites `Name`, and her name is what gets
  promoted into `Canon`.

**The prompts live in formula fields, never inside an AI field's config.**
An AI field's prompt cannot be edited through the API once created, so
holding both prompts in formulas (`World."Plate prompt"`,
`World."Dispatch prompt"`, `Specimens."Prompt"`) keeps them tunable forever
and versioned in one place. They are siblings of `Days."Day's prompt"` and
follow its conventions exactly: field **IDs** not names, an `&` chain of
`IF`/`SWITCH`, and the style coda last.

The image fields themselves are hand-made in the Airtable UI (the API
exposes no generative-image field type), generating from those formulas into
`World.Plate` and `Specimens.Image` — mirroring `Days."Plate generator"`.

#### still open

- **Does the plate regenerate nightly, or only when the world materially
  changes?** *(Recommended: on change.* A place you visit is not repainted
  every night. It is cheaper, it prevents drift, and it makes regeneration
  an **event** — when the world visibly shifts, that shift means something.
  Day to day, the motion, the inhabitant and the specimen carry the
  difference.)
- **What is the planet called, and what are its laws?** The `Canon` rows
  seeded so far are drafts in my hand, deliberately thin. This is the part
  that is hers to build, day after day.

#### the turn — `src/farview.js`

**The print makes the card; the card is the portal.** Touching the printed
plate turns it over and the far side takes the whole screen. The turn starts
from the card's own rect, so the plate appears to rotate where it sits and
then swell to fill the viewport — it is the same object seen from behind,
not a link to another room.

**The bleed is the argument, not decoration.** The front is bounded,
committed, printable, hangs in the gallery. The back has no edges, is never
twice the same, and cannot be printed. `object-fit: cover`, so the far side
is never letterboxed — a thing with no edges must not be given any. The
words sit *on* the world, never in a panel beside it. No legend, ever; the
only affordance is how to leave.

**Driven by the Web Animations API, never a CSS transition.** A transition
depends on the browser resolving style between the start and end writes, and
it does not reliably do that for an element inserted in the same task — the
two writes coalesce, no `transitionstart` fires, and the card silently
teleports open instead of turning. `animate()` takes its keyframes literally
and cannot be coalesced away. Verified by sampling the computed matrix
through the turn rather than by looking at it.

**Tier 1 of motion lives here:** the plate breathes — a slow push and drift
on periods (37s, 53s, 61s) that never visibly loop, grain, and a light wash
— and it answers `deviceorientation`, with pointer as the desktop fallback.
A single flat plate cannot give true parallax; this is the honest version,
and it is the hook tiers 2 and 3 attach to once the plate arrives in
separable layers. That is why the sky/far/mid/near spec is in the image
prompt from the first day.

**The far side rides the day's own debounce.** `views.syncFarSide()` runs
beside `saveDayState`, taking the land's slow memory straight from
`computeWorldState` rather than recomputing it, and is wrapped so the far
side can never take the day page down with it.

#### ratification — how a thing that turns up becomes a resident

The generator adds things nobody specified. That is the co-authored d2 the
thesis asks for, and it is not noise to be suppressed: **if something turns
up twice and she likes it, she writes it into `Canon` as a `being`** (or a
`law`, `place`, `name`, `event`), and from then on every plate is bound by
it. `farSideFor` joins every Active accrued row into `World.Canon`, both
prompts carry it under *"what is already true here, and may not be
contradicted"*, and it is copied forward once at row creation so canon
accepted later never rewrites a plate already made. Without that wiring the
loop would be decorative — she could bless a creature and the generator
would never hear about it.

**Creatures are not people.** The prompt now welcomes creatures explicitly,
at any number and any distance, and separately holds the *person* count at
exactly one (the inhabitant) — nothing bipedal-and-clothed, in a suit or
mask, holding a tool, or reading as a small human at work. The first plate
produced a suited humanoid crouching at a fallen disc, which quietly invents
a society and tool-users; banning "a second figure" outright would have
banned the creatures the canon explicitly promises. The distinction is the
fix.
- ~~What writes `World` each day?~~ **Built: `src/farside.js`.** Pure
  functions beside `world.js` — `computeFarSide(dateISO, data, prev, slow)`
  returns the whole `World` row, `germinate(dateISO, data)` returns the day's
  specimen or null. Three laws are written at the head of that file and are
  the reason it is code rather than a prompt: the sim decides what is there
  and the generator only renders it; nothing in its output may speak her log
  (an instrument becomes a species by the hash of its name, never by being
  named); and difference, never grade. The sun/moon lanes are read by
  **Glyph**, never by Name.
  `Masked` is the day's literal largest unlogged stretch, turned into
  occluded ground — the unknown shown *as* unknown, straight out of the
  thesis. The `FAR` plane deliberately reuses the front face's own slow
  memory (`aridity / path / sea / towerFloors`) rather than recomputing it:
  the two faces remember one life and only render it differently.
  Rarity is measured against days *strictly before* today, so a first-ever
  shape is rarest; counting today in its own denominator inverted it.
  **The write path is wired too:** `Canon`/`World`/`Specimens` are in
  `store.SCHEMA` (so `plant the base` grows them and `loadAll` reads them),
  with `worldFor` / `worldBefore` / `canonText` / `saveWorld` / `specimenFor`
  / `saveSpecimen` beside the other domain acts. `farside.farSideFor(date,
  data, slow)` does a day in one call — inherits the place, carries canon
  forward, germinates, and decides whether to repaint — and the caller just
  writes what it returns. `Specimens` is keyed on the **date**, never the
  Name, because Name is hers to overwrite and upserting on it would fork a
  duplicate on every rename; a Name she has already rewritten is never
  clobbered by a re-run.
  **The flip is built too** — `src/farview.js`. See below.

- **When the plate repaints.** Not nightly. `Drift` is measured against the
  last **painted** plate, and the planes are weighted — `Far` (the land's
  slow memory) 0.40 and `Sky` (the night) 0.25 are structural; `Mid` and
  `Near` are the day's furniture and shuffle constantly. An ordinary day
  scores ~0.1 and holds; a day where the slow memory moves crosses 0.5 and
  repaints. **A day with no plate of its own is not a gap** — the card shows
  the most recent painted plate until the place has actually moved. That is
  what "a place you visit" means, and it is why the repaint test asks how far
  the place has drifted rather than whether this date has an image.
  `Regenerate?` is only ever written `true`, never `false`, so it cannot
  clear a box she checked by hand.
- **What trips `Regenerate?`** — a `Drift` threshold, an `Era` turn, or her
  hand.

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
  (with a soft slide); the header arrows remain for taps. **The lanes and
  the rating sliders are both excluded from this** (`.timeline-section`
  and `.rating-hit` in `bindSwipe`'s `interactive()` check) — a delicate
  slider spans nearly a column's width, so dragging its handle end to end
  alone exceeds the swipe threshold, and a lane's own drag is horizontal
  by definition. Every drag inside either calls `setPointerCapture` (the
  slider additionally `stopPropagation`s on its own pointerdown), so a
  horizontal slide on a placed instrument, a span's handle, or a slider
  never also reads as swipe-to-change-day.
- **Never `window.prompt()`** for "add a new X" (an instrument): the app
  can run as an iOS home-screen (standalone) web app, where
  `window.prompt()` can be silently suppressed. Every such flow uses an
  inline `.field` text input instead (`buildInstrumentAdd` in `views.js`).
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
