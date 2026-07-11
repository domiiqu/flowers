# picking flowers

An artwork you walk around in. Not a product.

There is an endless field. The only thing that changes about it is time —
the sky moves through dusk, twilight, blue hour, night, and a pale
almost-dawn, over about thirteen real minutes, and then again. In the field
grow dark sunflowers, great dried seed heads — silver, umber, rust — chalk
daisies, blush tulips with their strap leaves, unopened poppies on long
swaying stems, sprays of small white wildflowers, tall wild carrot that
closes into a bird's nest as it dries, feathery grass plumes, hanging
harebells, and pale tendrils looping off on their own errands. They grow
in loose companies: a stand of tulips here, poppies gathering there, edges
soft as weather; some ground is lush and crowded, and in places the grass
stands tall enough that walking through it takes real effort. You may pick
them.
A flower you pick is gone from the field, and the field remembers — walk
back tomorrow and the gap is still there.

Very rarely, the field gives something up: a lost locket, an old tin, a
striped stone, an ammonite. Treasures go in the bag too, and can stand in
the still life beside the flowers. They do not wilt — a treasure is a
treasure — and when an arrangement is let go, the treasures come back to
you.

There is also a studio: a table with a cloth on it, a plinth in the corner
with a gauze curtain hung behind it, and two shelves of vessels — a lumpy
bone amphora, a white pitcher, a shallow footed dish, a tall concrete
cylinder, a hand-built black terracotta jar, a terracotta pot. You are in
the room on your feet: walk anywhere, look anywhere. Choose a vessel and
it lands wherever you are standing nearer — the table, or the plinth.
Carry a stem near it and it shows you exactly how it would stand — lean it
left, lean it right, turn it to face the light, click to set it. Cut them
shorter. Take them out and try again. When it is right, photograph it.
Two arrangements can stand at once; when you let go, it is the one you are
standing nearer that falls.

Cut flowers do not last. From the moment you pick a stem it is dying —
after a few minutes it softens, the head hangs, the colour dries, daisies
let their petals go, tulips collapse entirely over the rim — and fallen
petals rest on the cloth where they land, and stay. In the end each stem
crumbles to dust, whether in the bag or standing in the vase. An
arrangement cannot be kept. To begin another, you must let it go — press
and hold on the arrangement itself (or the words in the corner), and the
room darkens, and it falls away, petals and all. That is the whole idea.

On some nights, if the night is clear, there are stars.

## running it

No build, no dependencies, no accounts, no ads, no analytics.

```
python3 -m http.server 8000
# then open http://localhost:8000
```

(or any static file server — the only requirement is that ES modules are
served over http, not file://)

## how to play

| | |
|---|---|
| walk | `W A S D` / arrows |
| look (full 360) | mouse (click once to take hold of the view) |
| pick a flower | look at it, come close, click (or `E`) |
| the studio / the field | `Tab` |
| walk the studio | `W A S D`; drag to look around |
| see a stem properly | rest on it in the bag at the bottom |
| take a stem | click it in the bag |
| place a stem | carry it near the vessel — it previews how it will stand — click to set |
| turn a held stem or treasure | `Q` / `E` |
| set a treasure down | click anywhere on the cloth |
| cut a stem | scroll while holding it |
| take a placed stem back | click it |
| send an empty vessel home | click it |
| put a held stem back in the bag | right-click |
| photograph | `P` — saves a print, bordered and grained |
| let an arrangement go | press and hold on the arrangement itself, or the words in the corner |
| sound on/off | `M` — wind in the field; in the studio, a small radio plays patient piano minimalism, composed as it plays (synthesized, like everything else) |

There is a quiet back door for the impatient: `[` and `]` move the sky.

## what it is made of

Everything is procedural — every flower is grown from a seed, every vessel
is turned on a lathe in code, the sky is one shader, the cloth's weave and
the walls' plaster are drawn onto canvases at load, the studio's light
comes from a painted environment baked at startup, and the radio programme
is composed as it plays. The image passes through a small hand-rolled
lens: real depth of field in the studio, a soft glow off anything bright,
and light that passes through petals when the sun is behind them.
Three.js (vendored in `lib/`), six small source files, and no other
machinery.

- `src/sky.js` — the colour score and the sky dome
- `src/post.js` — the lens: depth of field, bloom, the filmic grade
- `src/flower.js` — flowers and whips, grown from seeds
- `src/field.js` — the endless field, in remembering chunks
- `src/studio.js` — the table, the shelf, the arranging
- `src/main.js` — walking, the bag, photographs, wind

## later, maybe (v2)

- a harvestable garden — carrots, lemons, branches for the arrangements
- adjustable studio lighting (the field's hour already leaks into the room)
- stars at night, a moon
- sound of footsteps in grass
- a compost pile where the let-go arrangements land
- touch controls
