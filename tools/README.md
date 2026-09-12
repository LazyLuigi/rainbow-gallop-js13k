# Tools

None of these needs a native dependency: `stub.js` provides a fake DOM and 2D
canvas context, which is enough to run the whole game under node.

| script             | what it checks                                                      |
|--------------------|---------------------------------------------------------------------|
| `test.js`          | track geometry, physics, a full race, rendering, falling off the road |
| `test-wavedash.js` | all ten trophy triggers, JSON identifiers and four leaderboard contracts, against a strict SDK stub |

`drive-gif.js` is not a test: it is the autopilot for the capture harness
(`record-gif.py`). It is called once per frame and writes straight into the
`keys` object that `playerStep()` reads, rather than faking keyboard events. It
holds the lane matching its colour, jumps hurdles, and aims for rings and item
boxes. It is what produces `media/gameplay.gif`, reproducibly down to the byte.

Each test takes an optional path, defaulting to `src/index.html`:

    node tools/test.js src/index.html

The fake context throws as soon as a non-finite value (NaN, Infinity) is
assigned to the canvas. That is what catches the divide-by-zero cases in the
projection before they reach the screen.

`npm run wavedash` runs these checks on both source and Terser output, including
queued trophies, duplicate awards, zero scores and rejected uploads. These local
tests do not prove that trophy definitions exist or scores persist on Wavedash.
