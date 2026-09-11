# Rainbow Gallop

A six-unicorn race down a rainbow road in the clouds, built for
**js13kGames 2026** (theme: *Unicorns and Rainbows*). The whole game, including
every sprite, sound effect and music track, fits in a single zipped HTML file
under 13,312 bytes. Nothing is loaded from the network and no library is used.

`js13k-game.zip` is the submission file, produced by `npm run build`. Unzip it
and open `index.html` in a browser, or open `src/index.html` directly to play the
readable source.

![Gameplay](media/gameplay.gif)

## Playing

Acceleration is automatic. There is no brake.

| | Desktop | Mobile |
|---|---|---|
| Steer | left / right arrows | tilt the device (buttons as fallback) |
| Jump | up arrow | JUMP |
| Fire | space | FIRE |

Three laps, five opponents. On the first touch, mobile asks for permission to
use the gyroscope; if you decline, on-screen arrows appear instead.

## The colour mechanic

The road is split into three longitudinal lanes, each with its own colour, and
the pattern shifts by one lane on every musical bar. Riding through a rainbow
arch repaints your unicorn, and every bot that passes under it too. Running on
a lane that matches your current colour makes you 8% faster. There is no penalty
for being on the wrong lane, so the mechanic rewards attention without punishing
players who ignore it.

Your matching lane pulses white and a coloured halo sits under your hooves, so
the line you want to hold is readable at speed.

Everything else on the track is placed on the same musical grid. One bar is 73
segments, which at top speed is 1.593 seconds against the music's 1.600, so
hurdles, rings and item boxes drift out of sync by only 7 milliseconds per bar.
Jumping within 11% of the beat builds a rhythm combo.

## Other mechanics

Slipstreaming charges while you sit in an opponent's wake and lifts your speed
ceiling by up to 14%, worth about 24% more average speed over a lap. Item boxes
give one of four pickups: a homing comet, a protective bubble, a jump boost, or
a triple straight shot. Clipping a hurdle at full height costs 38% of your
speed; clearing one cleanly gives a small boost.

The opponents do not use rubber-banding. Each one follows its own target gap
that slides from a start value to a finish value across the race, in the style
of the Pure and Black Rock racing games, which keeps finishes spread out instead
of bunching every bot on the player's bumper. They make the same mistakes you
can: roughly 28 visible errors and 10 position changes per race.

## Building

Requires `node`, `zip`, and network access on the first run so that `terser` and
`roadroller` can be fetched.

```sh
npm run build          # -> js13k-game.zip, dist/js13k/, dist/wavedash/
npm run build:best     # same, keeping the smallest of 8 roadroller draws
npm test               # track geometry, physics, a full race, rendering, edge cases
npm run wavedash       # the Wavedash integration, on the terser output
npm run check          # both test suites
```

`build.sh` extracts the script, runs it through terser, packs it with roadroller,
zips, recompresses the container with `advzip` when it is installed, and prints
the remaining budget. It takes the source path as its argument.

Two knobs, both environment variables:

- `RRBEST=n` runs roadroller `n` times and keeps the smallest output. Its
  parameter search is random: on this source, successive draws ranged from
  16,431 to 16,475 bytes. **The zip size is not reproducible from one build to
  the next** — read the number the build just printed, never one written down.
- `RRSEL=n` sets the number of roadroller contexts, and defaults to 9 here.
  Fewer contexts means a bigger zip but a much faster decode at load time,
  which matters because the submission site now runs every uploaded zip in a
  resource-constrained Chromium. Measured on this game, after advzip:

  | contexts | zip | startup, CPU throttled 8x |
  |---|---|---|
  | 12 (default) | 12,651 | 6,139 ms |
  | 9 | 12,747 | 4,814 ms |
  | 8 | 12,808 | 3,945 ms |
  | 6 | 13,155 | 3,412 ms |

  Without roadroller at all, the same page starts in 1,204 ms — so the
  decompressor, not the game, is what costs the startup time.

`FAST=1` skips roadroller entirely and writes to `dist/fast/`; it never touches
the zip or `dist/js13k/`.

## Wavedash

The game is also entered in the **Wavedash challenge**, which is a checkbox on
the same js13k entry, not a second submission. The platform injects a `Wavedash`
global before the game runs; `src/index.html` calls it behind a guard:

```js
if(self.Wavedash) Wavedash.init();
```

Nothing is downloaded and no SDK is bundled, so the "no external resources" rule
still holds: off-platform the global is absent, the line does nothing, and the
console stays clean. Costs 46 bytes in the zip.

`wavedash.toml` points at `dist/wavedash/`, which holds the unminified page —
there is no size limit there, so no roadroller and no decode delay.

One build trap worth recording: `terser --compress booleans_as_integers=true`
rewrites `true` as `1`, and the Wavedash SDK validates its argument types, so
every call would be rejected in silence — working from source, broken from the
zip. That option is deliberately absent from `build.sh`.

## Layout

```
src/index.html           the game, readable and commented
build.sh                 the build chain
wavedash.toml            Wavedash deployment config
js13k-game.zip           the submission archive (generated, not committed)
dist/js13k/index.html    compressed page, the one inside the zip (generated)
dist/wavedash/index.html unminified page for Wavedash (generated)
media/                   gameplay GIF, submission cover and thumbnail
tools/                   test harnesses, see tools/README.md
```

## Technical notes

The renderer is a pseudo-3D segment projector, not a raycaster: 1,484 road
segments are projected with a perspective divide, sorted back to front, and
drawn as trapezoids with billboarded sprites on top. A lap is 35.6 seconds at
top speed.

The unicorn is drawn procedurally into 96 pre-rendered canvases (six coat
colours by two gaits by eight animation phases), with the outline produced by
dilating the silhouette. Two gaits are used, a floating canter at low speed and
a gathered bound at high speed, with hysteresis at 0.55 and 0.42 to stop the
animation flickering between them.

The music is a NES-style engine: two pulse channels, a triangle bass and a noise
channel, with a swing feel from delaying weak sixteenths by 32 ms. It runs a
16-bar loop in two contrasting sections and modulates up two semitones with a
faster tempo on the final lap.

If the frame rate drops below 38, the renderer drops bloom first, then reduces
draw distance in steps down to 90 segments.

