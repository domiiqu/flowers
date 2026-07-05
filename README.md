# picking flowers

An artwork you walk around in. Not a product.

There is an endless field. The only thing that changes about it is time —
the sky moves through dusk, twilight, blue hour, night, and a pale
almost-dawn, over about thirteen real minutes, and then again. In the field
grow dark sunflowers on wavering stems, and here and there a long pale
tendril looping off on its own errand. You may pick them. A flower you pick
is gone from the field, and the field remembers — walk back tomorrow and
the gap is still there.

There is also a studio: a table with a cloth on it, a shelf with three
vessels — a lumpy bone amphora, a white pitcher, a shallow footed dish.
Choose one and it comes to the table. Put your stems in it. Cut them
shorter. Take them out and try again. When it is right, photograph it.

An arrangement cannot be kept. To begin another, you must let the first
one go — press and hold, and it falls away. The flowers do not return to
the bag. That is the whole idea.

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
| look | mouse (click once to take hold of the view) |
| pick a flower | look at it, come close, click (or `E`) |
| the studio / the field | `Tab` |
| take a stem | click it in the bag at the bottom |
| cut a stem | scroll while holding it |
| place a stem | click over the mouth of the vessel |
| take a placed stem back | click it |
| put a held stem back in the bag | right-click |
| photograph | `P` — saves a print, bordered and grained |
| let the arrangement go | press and hold the words in the corner |
| wind on/off | `M` |

There is a quiet back door for the impatient: `[` and `]` move the sky.

## what it is made of

Everything is procedural — every flower is grown from a seed, every vessel
is turned on a lathe in code, the sky is one shader. Three.js (vendored in
`lib/`), five small source files, and no other machinery.

- `src/sky.js` — the colour score and the sky dome
- `src/flower.js` — flowers and whips, grown from seeds
- `src/field.js` — the endless field, in remembering chunks
- `src/studio.js` — the table, the shelf, the arranging
- `src/main.js` — walking, the bag, photographs, wind

## later, maybe (v2)

- a harvestable garden — carrots, lemons, branches for the arrangements
- adjustable studio lighting (the field's hour already leaks into the room)
- stars at night, a moon
- sound of footsteps in grass
- touch controls
