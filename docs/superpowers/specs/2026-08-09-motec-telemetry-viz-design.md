# Motorsport telemetry visualiser — MVP design

Date: 2026-08-09
Status: approved

## 1. Goal

A web application that opens MoTeC-compatible telemetry files and answers the
driver's question **"where am I losing time?"**: overlay laps, show the
accumulated time difference against distance, and make it obvious which corner
the loss builds up in.

The MVP supports the MoTeC format only (`.ld` + `.ldx`). Reference data is
Assetto Corsa race logs recorded by the Telemetrick app, which open correctly in
official MoTeC i2.

### MVP scope

In scope:

- Loading several files at once, comparing laps across different sessions.
- Time delta chart against distance.
- A stack of overlaid channel charts sharing an axis and a synchronised cursor.
- Track map with cursor position and channel colouring.
- Lap table with lap times and reference selection.
- Configurable panel layout (drag, resize), persisted between sessions.
- Persisting loaded files in OPFS so 30 MB does not have to be dropped in again.
- A pixel retro-futuristic visual layer in the spirit of Kerbal Space Program 2 (§8).

Out of scope:

- Backend, accounts, sharing. The architecture prepares an extension point
  (see §6), but no code is written for it.
- Formats other than MoTeC.
- User-defined maths channels.
- Curvature-based automatic corner detection for generated track maps.
- Exporting a generated track map back to `.mt2`.

## 2. Format research findings

MoTeC publishes no specification for `.ld`. The format has been reverse
engineered by the community ([gotzl/ldparser](https://github.com/gotzl/ldparser),
[afonso360/motec-i2](https://github.com/afonso360/motec-i2),
[GeekyDeaks/sim-to-motec](https://github.com/GeekyDeaks/sim-to-motec)). Every
fact below was verified with a purpose-built parser against the two real files in
`temp/example` (Monza, 30 MB, 16 laps; Knockhill, 29 MB, 33 laps).

### 2.1 `.ld` structure

A header, then a linked list of channel metadata, then contiguous data blocks —
one continuous block per channel. **The layout is columnar**: any channel can be
read independently of the others.

Header (`struct`, little-endian):

```
'<I4xII20xI24xHHHI8sHHI4x16s16x16s16x64s64s64x64s64x1024xI66x64s126x'
```

Significant fields: marker `0x40` (offset 0), channel metadata pointer (8), data
pointer (12), event pointer (36), channel count (86), date and time (102, 118),
driver (134), vehicle (198), venue (326).

Channel metadata — 124 bytes:

```
'<IIIIHHHHhhhh32s8s12s40x'
```

Fields: `prev_ptr`, `next_ptr`, `data_ptr`, `data_len`, `counter`, `dtype_a`,
`dtype`, `freq`, `shift`, `mul`, `scale`, `dec`, `name[32]`, `short_name[8]`,
`unit[12]`.

Value decoding:

```
value = (raw / scale * 10^(-dec) + shift) * mul
```

### 2.2 What this means for implementation

- **Parsing is nearly free.** 161 of 186 channels are `dtype_a=7, dtype=4`, i.e.
  raw `float32`, with `scale=1, mul=1, dec=0, shift=0` — no arithmetic needed.
  WASM is not required.
- **But data blocks are not aligned.** Measured on both samples: 79 of the 186
  4-byte channels start at an offset with `offset % 4 == 2`. A typed-array view
  requires the offset to be a multiple of the element size, so
  `new Float32Array(buffer, offset, count)` throws for those channels. The reader
  therefore branches: aligned channels get a zero-copy view, misaligned ones get
  one `slice()` of their byte range into a fresh aligned buffer. That is a single
  memcpy per channel, performed once and cached. 2-byte channels are always
  2-aligned, so they never need the copy.
- **Data blocks are contiguous.** Verified on both samples: walking the channel
  list in order, the blocks follow one another with zero gaps and zero overlaps,
  and the metadata region ends exactly where the data region begins. A channel's
  byte length is therefore `count × width`, and the file needs no free-space map.
- **The channel identifier is the full name.** Verified: 186 of 186 full names are
  unique in both files. Short names are not — 102 distinct across 186 channels
  (`TPress` occurs four times). Short names are fit for labels only.
- **Sample time is computed, not stored.** All channels start at `t=0` and run at
  a constant rate, so `t_i = i / freq`. Verified by duration agreement:
  58153/30 = 1938.43 s, 96921/50 = 1938.42 s, 19383/10 = 1938.3 s.
- Rates in the samples: 1 Hz (36 channels), 10 Hz (56), 30 Hz (67), 50 Hz (27).

Observed `(dtype_a, dtype)` pairs: `(7,4)` — 161 channels, `(5,4)` — 13,
`(3,2)` — 5, `(0,2)` — 5, `(0,4)` — 2. Pairs with `dtype_a = 0` are undocumented
in the known format descriptions; in the samples they are flag channels
(`DRS Available`, `ERS Is Charging`, `Mark`, `Lap Invalidated`). The
implementation treats them as integers of the width given by `dtype`; **this
reading must be confirmed by a test** that checks the values against MoTeC i2.

### 2.3 `.ldx`

Plain XML. Holds lap beacons (`Marker` with time in microseconds), vehicle and
venue parameters (`Venue Length`, `Vehicle Wheelbase`, `Vehicle Weight`, gear
ratios) and the workspace maths channels.

Beacon times agree with the channels: marker `1.27033e8` µs ↔ `Lap Time` channel
127.038 s. The file is useful but not required — laps can be derived without it.

### 2.4 Lap detection

Three sources, and they are **not equivalent**:

- The `Lap Number` channel (30 Hz) — gives the lap number.
- The zero crossing of `Car Pos Norm` (10 Hz) — gives the lap boundary.
- `.ldx` beacons — duplicate the boundaries when the file is present.

Boundaries from `Lap Number` and from the `Car Pos Norm` wrap differ by one 10 Hz
sample (up to 100 ms ≈ 7 m). This is not a detail: take the boundary from
`Lap Number`, then make `Car Pos Norm` monotone with a running maximum, and the
first value of the lap can turn out to be 1.0003, collapsing the whole lap to a
constant.

**Decision: lap boundaries come from the `Car Pos Norm` wrap; the lap number
comes from `Lap Number`.**

**Correction, measured during implementation.** The disagreement is not bounded
by one sample. On the Knockhill recording there are 34 position wraps but only
33 `Lap Number` transitions: the counter stays at 0 for the whole first flying
lap, so labelling laps by that channel gives two different laps the number 0.
A lap's identity therefore cannot come from the sim at all — the lap index
assigns its own unique zero-based `number` and keeps the sim's value alongside
it as `sourceNumber`, for display only.

The same recording shows the `Lap Time` channel failing to reset at the wrap on
two laps out of 34, leaving the window maximum carrying the previous lap's tail
— 5.9 s and 0.8 s too long, on laps that otherwise looked complete and valid.
`lapTime` is therefore taken from the channel only when it agrees with the
lap's own geometric duration to within 0.25 s, and falls back to that duration
otherwise.

### 2.5 Basis for lap comparison

Two candidates, and the choice is substantive rather than a matter of taste:

- `Lap Distance` — a **path odometer**. It measures how far the car travelled. A
  wider line accumulates more metres, so the same value on two laps corresponds
  to **different points on track**.
- `Car Pos Norm` — **position on track**, a spline fraction from 0 to 1. The same
  value on two laps is guaranteed to be the same point on track.

Lap comparison needs the second. Otherwise, after the very first corner taken on
a different line, the charts drift apart and the delta starts lying.

`Car Pos Norm` quality on the Monza sample: exactly 15 wraps for 15 lap changes,
none spurious; range within a lap 0.0013…1.0008; median step 4.8 m, p95 = 6.5 m.
One or two micro-reversals occur inside a lap, so monotonisation is needed.

`Lap Distance` remains a valid odometer but carries outliers: 24 corrupt samples
out of 58153 (0.04%), clustered in the 1–3 samples before a lap change (the value
spikes to 33365 m where the correct figure is 23020 m, then drops to garbage). It
is used only as a fallback basis and requires despiking.

### 2.6 Track map

**There are no GPS channels in the files.** There is `Car Heading` (10 Hz,
degrees), `Ground Speed` (30 Hz) and `CG Accel Lateral` (50 Hz).

Two dead-reckoning methods were tested.

| Method | Closure error (Monza) | Lap-to-lap divergence, median / worst p95 | bbox |
|---|---|---|---|
| Integrating `Car Heading` | 21–69 m (0.4–1.2 %) | **8.4 m** / 43 m | 2131 × 1247 m |
| Curvature from `CG Accel Lateral` | 18–96 m | 30.5 m / 119 m | 2202 × 1201 m |

The second is the method i2 uses (the Telemetrick workspace declares
`<LatGTrackGen LateralGChannel="CG Accel Lateral" />`). It turned out **worse**:
`k = a_lat / v²` divides by the square of speed, and on straights with
near-zero lateral acceleration the noise blows up. We integrate heading.

The key conclusion: **neither method is fit for regenerating the map on every
lap, and it does not need to be.** i2 generates the map once, saves it to `.mt2`
and then draws every lap against the saved one — which is why its outlines are
stable. We do the same, and the 8 m lap-to-lap divergence stops being a problem.

Track edges cannot be derived from telemetry. The idea of recovering them from
the `Num Tires Off Track` channel was tested: across the whole race, 272 samples
out of 19383 (1.4 %) have at least one wheel off, and four wheels off occurs 16
times. That is enough to highlight individual excursions but nowhere near enough
to trace the edge of the track.

### 2.7 The `.mt2` format (MoTeC track maps)

Fully decoded. A self-describing tree, little-endian, every string and blob
prefixed with a `u32` length.

```
file  := blob("MoTeCTrackV2"), props, u32 nSections, Node[nSections]
props := u32 n, (blob name, blob value)[n]
Node  := blob name, props, u32 nChildren, Node[nChildren]
```

Root properties: `Name` (UTF-16LE), `Dist` (f32, track length), `Clockwise`,
`Closed`, `XOver`, `ZRotation` (f32, radians, display rotation), `Version`, and
on curated maps also `Curvature`, `MinTurnLength` (5 m),
`TurnThresholdFactor` (0.27).

The tree:

```
Models
  Model{Name: "Nominal" | "Inner" | "Outer"}
    Origin{Alt, Lat, Lng: f64}
    Points{Count: u32, Data: blob}
SectionGroups
  SectionGroup{Name}
    Markers   → Marker{Dist: f64, Name: UTF-16}
    SectionTypes → SectionType{Name: "Straights" | "Corners"}
    Sections  → Section{Marker1, Marker2, Name}
```

`Points.Data` is 20 bytes per point, five `float32` values:
**X, Y, Z, cumulative distance, heading in radians.** Z is zero in every file
inspected.

Verified against `monza.mt2`: 5755 points, path length over X/Y is 5832.38 m and
matches the `Dist` property exactly, closure gap **0.000 m**, bbox 1264 × 2178 m.

**`Inner` and `Outer` are genuine track edges.** The distance between them is
4–15 m, median 10–12 m. `Nominal` is a byte-for-byte copy of one of the edges
(the outer one on Monza and Spa, the inner one on Laguna Seca), so it is **not a
centreline**.

`Sections` provide named corners and straights (`Turn 1`, `Str 2-3`, …) tied to
distance through `Markers`: 18 sections on Monza, 34 on Spa, 40 on COTA.

Of the 25 maps in the Telemetrick workspace, 21 carry all three models and 4
carry `Nominal` only.

### 2.8 Validating our own generator against i2

i2 generates a `.mt2` on the fly when a log from an unknown track is imported.
Such a file for Knockhill contains **`Nominal` only** (no edges), `Dist` =
2013.11 m against 2019.39 m in the `.ldx`, 1575 points, `ZRotation` = 0, and 16
automatically placed corner markers.

Comparing our map (heading integration plus linear closure correction) with i2's
map from the same telemetry, after alignment by rotation and translation
(Procrustes without scaling, 1000 points):

| Measure | Value |
|---|---|
| Divergence, median across 33 laps | 1.7–5.5 m |
| Best lap | median 1.74 m, p95 5.53 m |
| Our lap length | 2018.9 m (i2: 2013.11, `.ldx`: 2019.39) |
| Closure error before correction | 7–32 m |

With a track width of 10–12 m, a 1.7 m divergence is under half the width of the
track. Our generator is equivalent to i2's.

## 3. Architecture

The chosen option is "all heavy work in a Web Worker, the main thread only
draws".

Rationale: the main thread never sees 30 MB of raw data, the UI never freezes,
memory stays bounded, and the module boundaries (worker = data, React =
presentation) match the ones a backend would need later.

Rejected options: everything on the main thread (a visible freeze on open, ~120 MB
and GC trouble with several sessions loaded) and Rust/WASM + WebGL (a second
toolchain to optimise something that is not the bottleneck — parsing is
zero-copy).

```
src/
  core/                 pure TypeScript. No DOM, no React, no worker.
    ld/  header.ts      header parsing
         channels.ts    walking the channel metadata linked list
         decode.ts      raw → physical values, zero-copy where possible
         ldx.ts         XML parsing: beacons, vehicle and venue parameters
    lap/ lapIndex.ts    lap boundaries, reconciling the sources
         distance.ts    the distance(t) function, distance grid
         resample.ts    channel → distance grid
         delta.ts       time delta between laps
    track/ mt2.ts       .mt2 parser
           generate.ts  map generation from telemetry
           geometry.ts  centreline, closure correction, normalisation

  worker/               sole owner of the large ArrayBuffers
    protocol.ts         message types, shared with main
    sessionStore.ts     sessions, series cache, track map cache
    worker.ts           entry point and dispatcher

  app/                  React. Only ever sees small arrays.
    state/              zustand: sessions, lap and channel selection, cursor, layout
    panels/             LapTable, DeltaChart, ChartStack, TrackMap
    charts/             uPlot wrappers, cursor and zoom synchronisation
    storage/            OPFS (files, maps) + localStorage (layout, selection)
```

Dependency rule: downwards only. `core` knows nothing of the worker or React, so
it is testable in Node in its entirety. `worker` holds no domain logic — it owns
memory, caches and routes. `app` does not know the `.ld` format exists.

### Worker protocol

Asynchronous request/response with ids; results are passed as transferables.

| Request | Response |
|---|---|
| `openSession(ByteSource, ldxText?)` | `SessionMeta` — header, channels, laps. No data |
| `getSeries(sessionId, lapNumber, channel, basis)` | `Float32Array`. `basis: 'distance' \| 'time'` — the 1 m grid, or the channel's native samples within the lap |
| `getDelta(refLap, cmpLap)` | `Float32Array` — delta over the distance grid |
| `getTrackMap(venue)` | `TrackMapData` — polylines, sections, source |
| `importTrackMap(bytes)` | `TrackMapMeta` — parse and store a `.mt2` |

## 4. Data model

```ts
type SessionMeta = {
  id: SessionId
  fileName: string
  driver: string
  vehicle: string
  venue: string                 // "monza-lfm"
  eventName: string             // "Telemetrick"
  sessionName: string           // "Race.online (50Hz)"
  recordedAt: string
  duration: number              // seconds
  channels: ChannelMeta[]
  laps: LapMeta[]
  trackLength?: number          // .ldx <Numeric Id="Venue Length">
  vehicleInfo?: VehicleInfo     // wheelbase, weight, gear ratios — from .ldx
}

type ChannelMeta = {
  name: string       // full name, the only unique key
  shortName: string  // not unique, labels only
  unit: string
  freq: number       // 1 | 10 | 30 | 50
  count: number
}

type LapMeta = {
  number: number      // unique zero-based index within the session — the identity
  sourceNumber: number // the sim's own Lap Number; NOT unique, display only
  startTime: number   // seconds from session start
  endTime: number
  lapTime: number     // seconds
  valid: boolean      // from the Lap Invalidated channel
  complete: boolean   // the first and last lap of a session are usually partial
}

type LapRef = { sessionId: SessionId; lapNumber: number }

type DistanceGrid = { step: number; length: number; points: number }
// Monza: step = 1 m, length = 5755 m → 5755 points per lap per channel
```

`LapRef` is the central concept of the UI. Because several sessions can be
loaded, a lap is never identified by a number alone.

### Series construction pipeline

Executed once per lap, the result cached:

1. Take `Car Pos Norm` within the lap boundaries (the boundaries come from that
   same channel's wrap) and force it non-decreasing inside those boundaries.
2. Build the inverse function `t(pos)` with monotone cubic interpolation (PCHIP).
   Linear interpolation is not good enough here: 10 Hz leaves up to 7 m between
   points, and the kink lands exactly on braking, which is where the interest is.
3. For every grid node `d`: `pos = d / length` → `t` → sample the channel at its
   own rate, `i = t · freq`.

The grid step is fixed at 1 metre. For a typical track length that is 2000–7000
points per lap per channel, which uPlot draws without effort, and the resolution
is comfortably finer than the 4.8 m between raw `Car Pos Norm` samples.

The distance grid is built from `Car Pos Norm × trackLength`. If there is no
`.ldx` and the track length is unknown, the median of despiked `Lap Distance`
over complete laps is used and the grid is flagged as approximate — this affects
axis labels only, not alignment.

### Time delta

Taken from the `Lap Time` channel (seconds from lap start, 30 Hz), resampled
through the same pipeline:

```
delta(d) = t_cmp(d) − t_ref(d)
```

No speed integration and no error accumulation.

## 5. Track map

`TrackMap` is a first-class entity cached **per track**, not per lap. That is
precisely what keeps the outline stable between laps.

```ts
type TrackMap = {
  venue: string
  source: 'mt2' | 'generated'
  length: number
  inner?: Float32Array      // interleaved x,y — only for source: 'mt2'
  outer?: Float32Array
  centre: Float32Array      // centreline; for generated, the trajectory itself
  sections?: TrackSection[] // named corners and straights
}

type TrackSection = { name: string; startDist: number; endDist: number; kind: 'corner' | 'straight' }
```

Three sources, in priority order:

1. **An imported `.mt2`.** Exact geometry, `Inner`/`Outer` as genuine edges,
   curated named corners. The user drags the files (or the `Track Maps` folder)
   into the app once; they are stored in OPFS and matched to a session by track
   name. Matching rule: exact match on `Name`, then a match on the part of
   `venue` before the first hyphen, then manual assignment by the user.
2. **Generated from telemetry.** Once, by integrating `Car Heading` over the
   distance grid followed by linear closure correction. The lap used for
   generation is picked automatically: among valid complete laps, the one with
   the smallest closure error before correction. Cached per `venue` and used for
   every lap and every session on that track. There are no edges — a line is
   drawn, with no pretence of knowing the width of the track. The user can
   regenerate from a different lap.
3. **Nothing available.** The map panel says so; the other panels keep working.

For `.mt2`, the centreline is built as the midpoint between `Inner` and `Outer`,
parameterised by its own arc length. Cursor position on the map comes from
`Car Pos Norm` as a fraction of that length.

Known approximation: the lengths of `Inner`, `Outer` and the AC spline differ
(Monza: 5832.38, 5780.52 and 5755.02 m), so matching by normalised distance
carries an error of a few metres in tight corners. For the "which corner is this"
question that is immaterial.

## 6. Data flow

```
drop .ld (+ .ldx)
  → app: pair them by file name, write the bytes to OPFS
  → worker: openSession(ByteSource)
      reads the header (~25 KB) → metadata for 186 channels
      decodes only Lap Number, Car Pos Norm, Lap Time, Lap Invalidated
      builds the lap index, cross-checks against .ldx beacons when present
  → SessionMeta to the main thread → lap table on screen
```

About 500 KB of the 30 MB is read before the lap table appears. The other 182
channels are untouched until requested.

The extension point for a future backend is the byte source interface:

```ts
interface ByteSource {
  size: number
  read(offset: number, length: number): Promise<ArrayBuffer>
}
```

Locally this is `File.slice()`; later it becomes `fetch` with a `Range` header.
The columnar `.ld` layout allows individual channels to be pulled from a server
without downloading the whole file. Nothing else in the architecture has to
change for sharing.

**Memory budget.** The raw file is 30 MB in the worker. One (lap, channel) pair
on the 1 m grid for Monza is 5755 × 4 = 23 KB. Eight channels across four laps is
736 KB on the main thread. The worker cache is an LRU by total size.

**The cursor** lives on the main thread only, as a single number — distance in
metres. Every panel reads it from one place; no worker round-trips on mouse move.

## 7. Screen

A `react-grid-layout` grid with a persisted layout, four panels.

**LapTable.** Sessions with their laps expanded: time, delta to best, validity
flag. One lap is marked as reference, the others are added to the comparison and
receive a colour. The colour carries across all panels.

**DeltaChart.** uPlot, x is distance, y is seconds. The zero line is the
reference; a line going up means time lost. The primary panel.

**ChartStack.** A stack of uPlot charts sharing the x axis, with a synchronised
cursor and zoom. By default `Ground Speed`, `Throttle Pos`, `Brake Pos`,
`Steering Angle`, `Gear`, `Engine RPM`. Any channel can be picked, with search
over full names.

**TrackMap.** A bespoke canvas. For `.mt2`, the track surface is filled between
`Inner` and `Outer` with section labels; for a generated map, a line. The
centreline is coloured by the selected channel or by a delta gradient. A marker
shows the cursor position. Clicking the map moves the cursor.

Individual lap trajectories are **not** drawn on the map: with dead-reckoning
drift of the order of the track width, that would display an artefact of the
method while looking like a difference in driving.

The x-axis basis toggle (distance or time) is shared by DeltaChart and
ChartStack.

## 8. Visual layer

### 8.1 Components and tokens

Components come from **shadcn/ui**: Radix primitives plus Tailwind, with the
component code copied into the repository and owned by the project. The interface
here is dense, like i2, and off-the-shelf libraries with generous spacing would
have to be reworked in exactly the place they were supposed to save time.
Meanwhile there is no point hand-writing a combobox with keyboard navigation over
186 channels, dialogs, or focus traps — Radix provides them.

**Tokens live in TypeScript and are the single source of truth.** Half the
interface is not DOM: uPlot draws charts into a canvas, the track map is another
canvas, and neither reads CSS classes. So the palette is declared in
`app/theme/palette.ts`; CSS custom properties for Tailwind and the DOM are
generated from it, and the canvas renderers import it directly. A lap's colour
must be identical in the table, on the delta chart, in the chart stack and on the
map — with two sources of truth it will drift apart.

### 8.2 Style: retro-futurism in the spirit of Kerbal Space Program 2

A pixel aesthetic with pronounced ordered dithering.

**Dithering belongs to chrome, backgrounds and fills. Data lines stay the
sharpest, highest-contrast thing on screen.** This is a functional boundary
rather than a stylistic one: the delta chart is the only reason the application
exists, and it must not suffer for decoration.

Technique:

- **Chrome** — ordered Bayer dithering from a 4×4 or 8×8 tile: an inline SVG in
  `background-image`, `background-repeat: repeat`, `image-rendering: pixelated`.
  A dithered gradient is a CSS gradient with a Bayer pattern layered over it via
  `mix-blend-mode`.
- **Canvas** — uPlot antialiases and will not become pixelated on its own.
  Rendering goes to an offscreen canvas at 1/N scale and is blitted up with
  `imageSmoothingEnabled = false`.
- **Two canvas layers.** The lower one is pixelated: data lines, fills, the map.
  The upper one is full resolution: text and cursor only. Otherwise the axis
  labels, lap times and cursor readouts would coarsen along with the lines, and
  "1:59.874" and "−0.213 s" have to be read precisely. The same applies to the
  track map: the surface between `Inner` and `Outer` is filled with dithering
  while corner labels stay crisp.
- The whole layout snaps to a virtual pixel grid; the typeface is a pixel
  monospace (Departure Mono, Pixel Operator or Silkscreen), used only at integer
  multiples of the base size.

### 8.3 Palette

Colours were sampled from the KSP 2 screenshots in
`temp/example/ksp2ui screenshots`. Method: accents and text are drawn opaque in
the game, so they are taken directly; surfaces were sampled from panels **over
black space** — which is exactly the case being reproduced, since the application
is dark. Panels from the vehicle assembly building are not used for surfaces:
they are translucent over a bright background and yield a blended colour.

| Role | Value | Origin |
|---|---|---|
| Application background | `#040b19` | sampled |
| Panel | `#06121e` | sampled |
| Panel header, table header | `#0e1d28` | sampled |
| Selected row | `#1b3346` | derived |
| Border | `#1e537f` | sampled |
| Text primary | `#ffffff` | sampled |
| Text secondary | `#bdc4d1` | sampled |
| Numeric values | `#f1d37c` | sampled |
| Active state | `#00cc51` | sampled |
| Warning | `#ffd600` | sampled |
| Critical | `#f04252` | sampled |

Status colours are reserved and are **never reused as a series colour**; they
always ship with an icon or a label rather than colour alone.

**Lap identity uses a categorical palette with a fixed slot order, never
cycled:**

| Slot | Role | Colour |
|---|---|---|
| 1 | reference | `#3987e5` blue |
| 2 | comparison 1 | `#d95926` orange |
| 3 | comparison 2 | `#b23fa8` magenta |

The hues come from the KSP 2 palette (blue, amber-orange and magenta are its
signature) and were brought into the lightness band the validator requires.

**No more than three laps are overlaid at once.** This follows from validation,
not from taste. Running the validator in all-pairs mode against the `#06121e`
surface: three slots pass everything (worst pair CVD ΔE 9.7, normal vision 21.3,
contrast ≥ 3:1); a fourth slot fails — on the eight-slot reference palette the
yellow ↔ orange pair scores CVD ΔE 4.8 and 10.6 for normal vision against a floor
of 15. The normal-vision floor is not offset by labelling: a reader with full
colour vision cannot tell that pair apart either. All-pairs mode applies because
overlaid lines are compared in any pairing, not only with their neighbour. Any
number of laps may be selected in the lap table — the limit applies to
simultaneously drawn series.

**Delta on the track map uses a diverging scale**, because it is polarity data:
loss and gain relative to the reference. Blue ↔ red with a neutral grey at zero.
No rainbow and no coloured midpoint.

**Colouring the map by a channel uses a sequential scale**, a single blue hue
from light to dark, no darker than the step that holds 2:1 contrast against the
surface.

### 8.4 Rules common to both canvases

- A legend is always present for two or more series; with three series they are
  additionally labelled at the lines, so identity never rests on colour alone.
- Values, labels and legends use text tokens rather than the series colour; a
  coloured marker beside them carries the identity.
- Data lines are 2 px; grid and axes are recessive.
- A crosshair cursor with a tooltip is mandatory on DeltaChart and ChartStack —
  it is the primary way the chart is read.
- No dual-axis charts. Channels on different scales get separate charts in the
  stack, which is how ChartStack is built anyway.
- Colour is bound to the lap, not to its position in a list: removing one lap
  from the comparison does not repaint the others.

## 9. Errors and edge cases

| Case | Behaviour |
|---|---|
| Corrupt `Lap Distance` samples at lap boundaries (24 of 58153) | Despike: drop steps impossible at the current speed, interpolate |
| `Lap Number` and `Car Pos Norm` wrap boundaries differ by a sample | Boundaries from the `Car Pos Norm` wrap, number from `Lap Number` |
| `Car Pos Norm` micro-reversals inside a lap (1–2 per lap) | Monotonise within already-determined boundaries, not with a global running maximum |
| Channels of differing duration (1 Hz is 1.4 s shorter) | Clamp time to the bounds of that channel, not of the session |
| `Car Heading` wraps through ±180° | Interpolate angles along the shortest arc. Naive linear interpolation produces a 360° spike and destroys the map |
| Partial first and last laps | `complete: false`, not offered as reference |
| No `.ldx` | Work anyway. Without the track length the grid is approximate |
| No `Car Pos Norm` | Cascade: `Car Pos Norm` → despiked `Lap Distance` → speed integral |
| Not a `.ld`, or header marker ≠ `0x40` | A clear error stating what did not match |
| Comparing laps from different tracks | Block it: a different `venue` means a different grid, so the comparison is meaningless |
| No `.mt2` for the track | Generate a map; if that fails, the map panel reports its absence |
| `.mt2` carries `Nominal` only | Draw a line without a filled surface |
| OPFS quota exceeded | Show the space used and allow deleting sessions from the library |

## 10. Testing

`core` depends on neither the DOM nor the worker, so all the substantive logic is
tested in Node.

The samples weigh 30 MB and `temp/` is in `.gitignore`, hence two levels.

**Unit tests on synthetic data.** A small `.ld` and `.mt2` generator is written —
the formats are known in full. It exercises the decode formula for every observed
`dtype` combination, the channel linked-list walk, despiking, monotonisation,
PCHIP, closure correction, angle interpolation through ±180°, and `.mt2` tree
parsing.

**Integration tests on the real files**, skipped when `temp/example` is absent.
They assert invariants rather than golden values:

- the sum of lap times agrees with the session duration;
- the number of `Car Pos Norm` wraps equals the number of `Lap Number` changes;
- the integrated path length agrees with `Venue Length` to within 1 %;
- the closure error of a generated map is below 2 %;
- the X/Y path length in a `.mt2` matches its `Dist` property.

**Properties.** The delta of a lap against itself is zero across the whole grid.
Resampling a monotone channel stays monotone. Resampling onto a grid whose step
equals the native period returns the original values.

A dedicated test confirms the reading of `(dtype_a = 0, dtype)` pairs by checking
flag-channel values against MoTeC i2.

## 11. Stack

| What | With | Why |
|---|---|---|
| Build | Vite | Fast dev server, native worker support |
| Language | TypeScript | Binary parsing without types is painful |
| UI | React | Given by requirements |
| Charts | uPlot | Under 50 KB, around 10 % CPU where ECharts takes 70 % |
| State | Zustand | Enough for flat state, without ceremony |
| Layout | react-grid-layout | Drag and resize with a serialisable layout |
| Components | shadcn/ui (Radix + Tailwind) | Code in the repository, density fixed in-house; a11y and keyboard handled |
| Tokens | Own TypeScript module | Single source of truth: CSS variables and canvas colours both come from it |
| Typeface | Pixel monospace | Departure Mono, Pixel Operator or Silkscreen — integer size multiples only |
| Storage | OPFS + localStorage | Files and maps in OPFS, layout and selection in localStorage |
| Tests | Vitest | One runtime with Vite, runs in Node for `core` |

The track map is drawn by a bespoke canvas component: no library is needed here.

## Sources

- [gotzl/ldparser](https://github.com/gotzl/ldparser) — `.ld` reverse engineering
- [afonso360/motec-i2](https://github.com/afonso360/motec-i2) — independent implementation
- [GeekyDeaks/sim-to-motec](https://github.com/GeekyDeaks/sim-to-motec) — sim telemetry to MoTeC format converter
- [uPlot](https://github.com/leeoniya/uPlot)
- Kerbal Space Program 2 interface screenshots in `temp/example/ksp2ui screenshots` — palette source for §8.3
- [Jennie Yim's KSP 2 UI portfolio](https://jennieyim.com/ksp2) — process, without a visual language specification
