# Remaining Motorsport Telemetry Visualiser MVP Design

Date: 2026-08-18
Status: approved

## 1. Goal

Complete the remaining browser MVP around the telemetry analysis foundation that
is already implemented. The finished application must let a driver restore
recordings without dropping them again, arrange a dense desktop workspace,
compare laps by distance or elapsed time, and connect charts to a stable track
map in one coherent visual system.

This document is intentionally not a replacement description of the completed
telemetry core. It specifies only work that remains after the first comparison
screen.

## 2. Established foundation

The following behavior already exists and is an input to this design:

- `.ld` and `.ldx` parsing in pure TypeScript;
- position-wrap lap indexing with unique internal lap numbers;
- one-metre distance grids built through monotone interpolation;
- elapsed-basis accumulated delta calculation;
- a Web Worker with typed request/response RPC and transferable arrays;
- a Zustand application store with three stable lap colour slots;
- a lap table, delta chart, and stacked distance-based channel charts;
- a TypeScript palette consumed by both CSS and canvas code.

The committed anonymised MoTeC fixture remains mandatory integration coverage,
and a missing `Car Pos Norm` remains a clear unsupported-recording error. These
are retained regression invariants, not remaining implementation tasks.

The remaining work may extend these interfaces, but must not reimplement the
domain behavior behind them.

## 3. Scope

### 3.1 In scope

- The Apex-inspired visual system and complete application shell.
- A draggable and resizable widget workspace with one automatically persisted
  layout.
- One channel chart per widget rather than a monolithic channel stack.
- A shared distance/time basis, cursor, and zoom across all analytical widgets.
- A cursor-data widget populated from the open channel widgets.
- `.mt2` import, generated maps, track-map interaction, and map persistence.
- OPFS persistence and automatic restoration of the active recordings.
- Local persistence of workspace configuration and analysis selection.
- Bounded caches, complete error states, interaction tests, and visual tests.

### 3.2 Out of scope

- Mobile or narrow-viewport behavior. The minimum supported viewport is
  1280 x 720.
- Backends, accounts, sharing, or remote range reads.
- Telemetry formats other than MoTeC.
- User-defined maths channels.
- Named or multiple layouts. The footer tab is a non-functional placeholder.
- G-G scatter plots and delta-derivative widgets.
- Per-lap dead-reckoned trajectories, wind rendering, and `.mt2` export.
- Curvature-based automatic corner detection for generated maps.

Per-lap trajectories remain excluded because their dead-reckoning drift is of
the order of the track width and would present integration error as driving
line. Wind is excluded because the reference recordings do not provide a
reliable source. G-G and delta derivative are useful later analysis tools, but
do not improve the MVP's primary answer enough to justify their additional
interaction and signal-processing rules.

## 4. Capability stages

The remaining MVP is delivered in six dependency-ordered stages:

1. **Visual system and application shell:** tokens, fonts, patterns, bars,
   controls, and shared widget chrome.
2. **Widget workspace:** widget registry, drag/resize, channel widgets, default
   layout, automatic layout state, and reset.
3. **Analysis coordination:** distance/time basis, bidirectional cursor and
   zoom, cursor data, and comparison visibility.
4. **Track map:** parser, generator, worker operations, widget, interactions,
   and map-source controls.
5. **Persistence:** OPFS repository, automatic session restore, workspace
   hydration, deletion, and quota handling.
6. **Hardening:** bounded caches, remaining validation and error paths,
   browser interaction coverage, accessibility checks, and visual regression.

Each stage must leave the application usable. Later stages may add behavior to
earlier components, but must not require a parallel replacement architecture.

## 5. Architecture

The import direction remains `app -> worker -> core`: app may import public core
types, worker imports core behavior, and core imports neither outer layer.

```text
src/
  core/
    track/              mt2 parsing, geometry, map generation

  worker/
    protocol.ts         distance/time and track-map operations
    sessionStore.ts     session ownership and byte-bounded caches

  app/
    layout/             layout model, defaults, validation, grid adapter
    shell/              header, footer, application status
    storage/            OPFS repository and local workspace persistence
    theme/              tokens, palette, typography, dither patterns
    widgets/            registry, frame, and widget implementations
```

`core/track` is pure TypeScript and knows nothing about workers, React, storage,
or canvas. The worker remains the owner of sessions and calculated large
arrays. Storage knows how to retain bytes and manifests, but does not parse
telemetry. Widgets consume typed application services and do not call OPFS or
worker message APIs directly.

### 5.1 Widget boundary

Every workspace item has a serialisable descriptor:

```ts
type WidgetInstance = {
  id: string;
  type: WidgetType;
  config: WidgetConfig;
  rect: { x: number; y: number; w: number; h: number };
};
```

The registry maps `type` to its component, title builder, default rectangle,
configuration validator, and minimum size. `WidgetFrame` owns the title bar,
drag handle, close action, focus treatment, and resize boundary. Widget content
does not import or depend on `react-grid-layout`. This permits several instances
of `channel-chart`, each configured with a different channel.

### 5.2 Dependency choices

The old proposal to introduce shadcn/ui and Tailwind is removed. The existing
application already owns a small CSS layer, and a precise pixel interface does
not benefit from a second styling abstraction. Native semantic controls are
used when sufficient. Radix Dialog and Tooltip primitives provide focus and
escape behavior for metadata, confirmation, map-assignment, and icon-tooltip
surfaces. The searchable widget/channel picker is an owned React combobox with
the ARIA combobox/listbox keyboard contract. Remix Icons are installed locally
and no runtime asset request is allowed.

The existing whole-`ArrayBuffer` worker transfer remains. Replacing it with a
`ByteSource` and range reads adds complexity without improving the local MVP:
OPFS removes repeat file selection and byte-bounded worker caches address the
actual retained-memory risk. A remote byte source remains future work.

## 6. Visual system

The supplied `temp/example/Apex T2 Telemetry.html` is the visual origin. Its palette,
typography, compact chrome, square geometry, and ordered patterns supersede the
KSP2 visual direction in the original MVP design.

All normative values and rules from that ignored working artifact are reproduced
in this document. Implementation and tests do not read `temp/`, so a clean clone
does not depend on the source artifact.

### 6.1 Palette

The initial token set is sampled from the reference artifact:

| Role | Value |
|---|---|
| Application background | `#080a08` |
| Bar surface | `#10150f` |
| Control surface | `#1a2318` |
| Border | `#2c3a2d` |
| Text primary | `#cbe0c0` |
| Text secondary | `#8fa688` |
| Text muted | `#5c7057` |
| Accent / numeric | `#f0a830` |
| Accent hover | `#ffd08a` |
| Active | `#8fd07a` |
| Warning | `#ffd08a` |
| Critical | `#e0603c` |

Lap identity uses fixed slots and never cycles:

| Slot | Colour |
|---|---|
| Reference | `#f0a830` |
| Comparison 1 | `#5fc9d9` |
| Comparison 2 | `#d98ac0` |

Text and controls must be validated for WCAG contrast on their actual surfaces.
The three simultaneous lap colours must separately pass all-pairs normal-vision
and colour-vision-deficiency separation. Sequential and diverging map scales
are validated for ordered lightness and distinguishable polarity respectively.
Status always includes an icon or label, so the nearby amber accent and warning
hues never carry meaning by colour alone.

Tokens remain TypeScript's responsibility. CSS custom properties are generated
from them for DOM content, while uPlot and map renderers import the same values
directly.

### 6.2 Typography and geometry

- VCR OSD Mono is used for widget titles, numeric data, telemetry values, and
  compact headings.
- Matrix Sans Video is used for labels, explanatory text, dialogs, and control
  text.
- VCR OSD Mono 1.001 by Riciery Leal comes from the author's
  [DaFont distribution](https://www.dafont.com/vcr-osd-mono.font), which marks
  it `100% Free`. Its converted web font is committed as
  `src/app/assets/fonts/vcr-osd-mono.woff2`, together with
  `VCR-OSD-MONO-NOTICE.txt` recording the author, version, source URL, DaFont
  classification, and the fact that the upstream archive contains no separate
  licence or readme. The project owner has explicitly accepted vendoring and
  WOFF2 conversion on that provenance; the notice must not describe it as an
  OFL or invent additional author terms.
- Matrix Sans Video 1.722 comes from the
  [FriedOrange/MatrixSans release](https://github.com/FriedOrange/MatrixSans/releases/tag/v1.722)
  by the Matrix Sans Project Authors. It is licensed under `OFL-1.1`; the Video
  WOFF2 is committed as `src/app/assets/fonts/matrix-sans-video.woff2` with the
  upstream `OFL.txt`. The pinned release archive has SHA-256
  `0b864d016e15155779fb524472d39c14e22ab396d43bc2bf09fd1d4dbadf1dee`.
- Network fonts and silent substitutions are not accepted.
- All radii are zero. Widget rectangles and shell spacing use integer multiples
  of the base spacing token.
- Glow is limited to active, warning, and critical indicators and deliberately
  emphasised values. Data lines, ordinary text, and borders do not glow.

Every button includes a Remix Icon. An icon-only button additionally requires
an accessible name, a tooltip, and a visible keyboard focus state.

### 6.3 Dither

Dither percentages denote binary ordered-pattern density, not element opacity.
Patterns use one standard 8 x 8 Bayer rank matrix repeated without smoothing.
The nominal 1%, 5%, 10%, and 50% masks enable respectively the first 1, 3, 6,
and 32 ranked cells, matching the supplied source tiles as closely as an 8 x 8
binary mask permits. Masks take their colour from tokens.

| Surface | Treatment |
|---|---|
| Workspace background | 1% dither |
| Header and footer bars | 5% dither |
| Widget title bar | 10% dither |
| Primary button | 50% dither |
| Widget content | Plain |
| Secondary controls and other surfaces | Plain |

Dither is not applied to telemetry lines, legends, labels, table rows, or
interactive state indicators. The earlier low-resolution offscreen-canvas idea
is removed: charts remain sharp, and the pixel character comes from chrome,
typography, and ordered patterns rather than reduced data precision.

## 7. Application shell

### 7.1 Header

The left side contains, in order:

1. product logo;
2. Open Log;
3. Reset Zoom;
4. Compare visibility toggle;
5. Distance/Time basis toggle;
6. Add Widget;
7. Reset Layout.

The Compare toggle hides or shows comparison series without changing selected
laps or their stable colour slots. When hidden, comparison lines, line labels,
and Cursor Data comparison columns disappear. A map in delta-colouring mode
falls back to plain geometry and restores its prior delta selection when
comparison becomes visible again. Reset Zoom resets only the currently active
axis basis. Add Widget opens the widget picker, including a searchable channel
selector for channel-chart instances.

The right side reports `IDLE`, `LOADING`, `READY`, or `ERROR`. A storage warning
may accompany the state without replacing it.

Manual Save Layout and Load Layout actions are omitted. They imply multiple
saved layouts, while this MVP has one automatically saved layout.

### 7.2 Footer

The left side contains one active tab labelled `LAYOUT 01`. It is an intentional
visual placeholder for future multiple-layout support: it cannot be selected,
renamed, closed, reordered, or duplicated in this MVP.

The right side contains Documentation and the application version linked to its
release page.

## 8. Widget workspace

The workspace uses `react-grid-layout` in fixed desktop mode: 24 columns, 12
rows in the initial viewport, a 4 px gutter, `compactType={null}`, overlap
disabled, and collision prevention enabled. Row height is recalculated from the
available workspace height so the initial 12 rows fit without page scroll.
Widgets added below row 12 introduce vertical workspace scrolling; horizontal
workspace scrolling is never used. Layout updates are committed after drag or
resize ends, not on every pointer movement. Every widget can be closed and later
restored through Add Widget.

Direct drag and resize are pointer interactions in this desktop MVP. Keyboard
users can add, close, and restore widgets and reset to the complete default
layout; keyboard commands for arbitrary widget movement and resizing are out of
scope.

### 8.1 Default layout

The default layout follows three conceptual columns:

- left: Lap Table and Cursor Data;
- centre: Throttle, Brake, Steering, Lateral G, and Longitudinal G channel
  charts;
- right: Track Map, Delta, and Ground Speed.

Clutch, Gear, Engine RPM, and every other common channel remain available from
Add Widget without occupying the default layout. A configured channel that is
absent from the active sessions shows a local unavailable state rather than
being silently removed.

| Widget | Rectangle `(x,y,w,h)` | Minimum `(w,h)` |
|---|---|---|
| Lap Table | `(0,0,5,8)` | `(4,4)` |
| Cursor Data | `(0,8,5,4)` | `(4,3)` |
| Throttle | `(5,0,11,3)` | `(4,2)` |
| Brake | `(5,3,11,3)` | `(4,2)` |
| Steering | `(5,6,11,2)` | `(4,2)` |
| Lateral G | `(5,8,5,4)` | `(4,2)` |
| Longitudinal G | `(10,8,6,4)` | `(4,2)` |
| Track Map | `(16,0,8,5)` | `(6,4)` |
| Delta | `(16,5,8,4)` | `(6,3)` |
| Ground Speed | `(16,9,8,3)` | `(4,2)` |

At 1280 x 720 and 1920 x 1080 the default layout must expose every mandatory
control without overlap or clipping. Content may scroll inside Lap Table, but
the workspace itself must not rely on horizontal scrolling at supported sizes.

### 8.2 Common graph rules

- Plot canvas consumes the complete widget content rectangle.
- Legends, axis labels, cursor values, and units overlay the plot instead of
  reserving exterior gutters.
- Data lines are 2 CSS pixels and remain the highest-contrast marks.
- Grid and axes remain visually recessive.
- Two or more series always have a legend with a separate colour marker. Labels
  use text tokens rather than series colours.
- Three overlaid series are additionally identified at their line ends.
- No dual-axis charts are allowed; channels with different scales use separate
  widgets.
- Resize preserves the current cursor and zoom.

### 8.3 Lap Table

Each session has a compact header with summary metadata, a full metadata dialog,
and a destructive Close Log action. Rows show source lap number, lap time, gap
to that session's best valid complete lap, tags, reference radio, comparison
checkbox, and stable lap marker.

Only complete and valid laps may become the reference. A comparison must be
complete; an invalid complete lap remains selectable and keeps its invalid tag,
because inspecting why it was faster or slower is a valid analysis task. At
most one reference and two comparisons are selected. A disabled comparison
control explains whether the cause is a different venue, incomplete lap, or the
slot limit.

### 8.4 Cursor Data

Rows correspond to currently open channel-chart widgets and columns correspond
to selected laps. In distance mode values represent the same track position. In
time mode values represent the same elapsed moment and therefore may describe
different track positions. Missing values and unavailable channels are shown
explicitly.

### 8.5 Channel Chart

Each instance owns one full channel name. The title follows
`CHANNEL // <SHORT LABEL>` while accessible and configuration text retains the
unique full name. Continuous channels interpolate linearly and discrete
channels hold their previous value. Closing a channel widget removes its row
from Cursor Data but does not alter telemetry caches needed by other widgets.

### 8.6 Delta

Delta remains accumulated comparison elapsed time minus reference elapsed time.
The reference is represented by the zero line. A rising comparison line means
time is being lost. The widget does not offer differential delta in this MVP.

## 9. Basis, cursor, and zoom

The application state adds:

```ts
type AxisBasis = 'distance' | 'time';

type AnalysisCursor = {
  distance: number;
  referenceElapsed: number;
} | null;

type ZoomByBasis = {
  distance: [number, number] | null;
  time: [number, number] | null;
};

```

Distance is the canonical track coordinate. `referenceElapsed` is derived from
the active reference lap and gives time charts and the map an unambiguous shared
anchor.

### 9.1 Distance basis

- Channel series compare laps at the same position on track.
- Delta is plotted directly as `delta(distance)`.
- Cursor Data reads each lap at that distance.
- Track Map places its marker at that distance.

### 9.2 Time basis

- Each channel series uses its lap's own elapsed time and native sample rate.
  uPlot renders these unaligned pairs in faceted mode rather than forcing them
  under one shared x-array.
- A vertical cursor means the same elapsed time for every lap; the cars may be
  at different track positions.
- Cursor Data reads every lap at that elapsed time.
- Track Map shows the reference lap's position at that elapsed time.
- Delta uses reference elapsed time as x and evaluates
  `delta(distanceReference(t))` as y.

Time-series values exist only over their lap's duration. A shorter lap has no
point beyond its end; the chart and Cursor Data show no value rather than
clamping its final sample. Cursor lookup linearly interpolates continuous
channels and holds the previous sample for discrete channels.

For a channel with sample time `t_i = i / freq`, native time extraction returns
the unchanged samples whose absolute times lie in the half-open interval
`[lap.startTime, lap.endTime)`. Returned x-values are
`elapsed_i = t_i - lap.startTime`. No synthetic boundary samples are inserted;
cursor values outside the returned elapsed range are unavailable.

Switching basis preserves the reference lap's physical track position through
its `distance <-> elapsed` mapping. If no reference exists, the cursor clears.
The time domain ends at the reference lap duration; longer comparison series are
clipped there so every visible cursor time maps to a reference distance. Changing
or removing the reference clears the cursor and both basis zoom ranges.

### 9.3 Coordination

Cursor and zoom are bidirectional. Pointer movement in any chart or a map click
updates the store; store changes programmatically position the cursor in every
other visible widget. Zoom is separate for each basis, synchronized between all
charts in the active basis, and retained through resize and basis switching.

The worker series operation accepts a basis and returns a discriminated result:

```ts
type DistanceSeriesResult = { basis: 'distance'; values: Float32Array };
type TimeSeriesResult = {
  basis: 'time';
  elapsed: Float64Array;
  values: Float32Array;
};
```

The matching requests are explicit about the target grid:

```ts
type SeriesRequest =
  | {
      kind: 'getSeries';
      basis: 'distance';
      lap: LapRef;
      reference: LapRef;
      channel: string;
    }
  | {
      kind: 'getSeries';
      basis: 'time';
      lap: LapRef;
      channel: string;
    };
```

Distance responses use the active reference session's one-metre x-grid. Every
selected lap is sampled at the same normalized `Car Pos Norm` positions and
displayed in reference-session metres. This makes recordings of the same venue
comparable even when independently estimated track lengths differ. Time results
use one `{elapsed, values}` pair per lap in uPlot faceted mode. Time delta uses
the reference lap's elapsed array on the reference distance grid.

For each reference distance node `d_i`, worker evaluation uses
`u_i = clamp(d_i / referenceGrid.length, 0, 1)` for both laps. `getDelta`
therefore evaluates reference and comparison elapsed values at identical `u_i`
instead of subtracting arrays built on their session-local grids. Distance cache
keys include lap, channel, basis, and reference-grid identity.

`LapMeta` adds `positionBasisValid`, computed while opening the session from the
finite, monotone position basis for that lap so app and worker can enforce the
same eligibility rule. Session metadata adds `venueKey`, defined by lowercasing
ASCII, trimming, and replacing every maximal `[ _-]+` run in the complete `.ld`
venue with `-`.
Suffixes are retained because they can identify distinct track layouts. The
prefix heuristic in map discovery never defines comparison identity.
Compatibility requires equal `venueKey` values and a valid `Car Pos Norm` basis,
not floating-point equality between independently estimated lengths. Both app
and worker enforce the same predicate.

## 10. Track map

`TrackMap` remains a venue-level entity, never a per-lap outline.

```ts
type TrackMap = {
  venueKey: string;
  source: 'mt2' | 'generated';
  length: number;
  inner?: Float32Array;
  outer?: Float32Array;
  centre: Float32Array;
  sections?: TrackSection[];
};
```

### 10.1 Source priority

1. Imported `.mt2` assigned to the venue.
2. A persisted generated map for the venue.
3. A newly generated map.
4. An unavailable state if generation cannot run.

Imported maps first match a normalised `.mt2` `Name`, then the part of venue
before its first hyphen. Normalisation lowercases, trims, and collapses spaces,
underscores, and hyphens to one separator. An absent or ambiguous match opens a
manual assignment dialog. The assignment is persisted.

Each `venueKey` has at most one active imported map. Importing a conflicting map
requires replacement confirmation. Map-source controls support assign, reassign,
replace, and delete; deleting an imported map falls back to persisted generated
geometry or regeneration. Closing a recording never deletes venue maps.

For maps with `Inner` and `Outer`, the centre is built from synchronously
arc-length-resampled edge midpoints. A `Nominal`-only map is shown as a line and
never given an invented width.

A generated map integrates `Car Heading` over the distance basis and applies
linear closure correction. The default source lap is the valid complete lap
with the smallest pre-correction closure error. Geometry is generated once,
persisted per venue, and reused across laps and sessions. The user may regenerate
it from another valid complete lap.

### 10.2 Widget behavior

The map supports:

- plain geometry;
- sequential channel colouring for a selected lap and channel;
- diverging delta colouring for a selected comparison lap;
- named-section highlighting.

Continuous channel colouring uses an Apex green sequential scale
`#25401f -> #5a7a52 -> #8fd07a`. Its domain is the finite 2nd to 98th percentile
of the selected lap and channel; values outside it clamp to the endpoint.
Discrete channels are not eligible for map colouring in this MVP.

Delta colouring uses `#5fc9d9` for gain, `#5c7057` for zero, and `#e0603c` for
loss. Its domain is symmetric around zero, with magnitude equal to the larger
absolute finite 2nd or 98th percentile. Values clamp at the endpoints; an
all-zero delta is entirely neutral. Segments without finite values use the
recessive border colour. Positive delta always means loss.

If a continuous channel's percentile bounds are equal, every finite segment
uses the sequential scale midpoint and the legend displays that single value.

The legend overlays the canvas. Corner labels and the scale ruler remain crisp.
Track surface uses a plain fill, not decorative dither.

Without a valid reference the map still renders geometry, but has no marker,
channel or delta colouring, or clickable cursor interaction. Those controls are
disabled with an explanation until a reference is selected.

Clicking finds the nearest centreline point and computes
`mapFraction = mapArcLength / map.length`. The cursor distance becomes
`mapFraction * referenceGrid.length`; marker placement performs the inverse.
Section boundaries use the same normalized conversion. This avoids treating an
`.mt2` edge length as identical to the simulator's spline length. In time mode
the reference mapping also updates elapsed time. The marker always represents
the reference lap position.

## 11. Persistence and lifecycle

### 11.1 Storage responsibilities

OPFS stores:

- `.ld` bytes;
- paired `.ldx` text;
- imported `.mt2` bytes and venue assignments;
- generated track geometry;
- a versioned manifest with file metadata and active session IDs.

`localStorage` stores only a small versioned workspace snapshot: widget layout,
selected lap slots, per-widget configuration, active basis, zoom, comparison
visibility, and UI preferences. Widget configuration is the sole source of
channel selection, including each channel chart's full name and Track Map
colouring selection; there is no parallel global channel list.

The repository assigns each recording an immutable UUID when first committed.
`openSession` accepts that ID, and core and worker use it as `SessionId` instead
of generating a process-local sequence. Duplicate active IDs are rejected. All
persisted `LapRef` values therefore remain stable across reloads and independent
of restore order.

### 11.2 Load and restore

1. Classify and pair dropped `.ld`, `.ldx`, and `.mt2` files.
2. Write uniquely named temporary OPFS entries.
3. Parse the temporary `.ld` bytes in the worker.
4. Write a new immutable, checksummed manifest generation that references the
   successful entries, then garbage-collect superseded entries.
5. On reload, select the newest valid manifest generation, remove unreferenced
   temporary entries, and restore active sessions in saved order.
6. Hydrate lap selection and widgets against the resulting stable session IDs.

A recording fingerprint `{ name, size, lastModified }` is only a lookup hint.
The repository computes a SHA-256 content hash and reuses bytes only on an exact
hash match. An incoming sidecar is hashed independently; replacing it triggers
a new parse and invalidates derived caches and selections if grid metadata
changes.

An exact `.ld` hash resolves to the existing recording UUID. Dropping it while
already active is a no-op except for an optional sidecar update; it never creates
two active sessions that share one recording entry.

This recoverable two-phase write does not assume atomic OPFS transactions. A
failure before a valid manifest generation leaves the previous generation
authoritative; startup cleanup removes abandoned temporary data.

### 11.3 Closing and failures

Close Log is destructive because this MVP has no separate library from which a
closed persisted recording could be reopened. After confirmation it unloads the
session from the worker, removes its OPFS data, and clears session- and lap-bound
selection. Channel widget descriptors remain keyed by full channel name even
when no active recording supplies that channel. Session-bound map colouring
falls back to plain geometry.

Deletion first commits a new valid manifest generation without the recording
UUID, then unloads the worker session and garbage-collects unreferenced bytes.
An interrupted deletion therefore leaves either the old authoritative manifest
and its data or the new authoritative manifest without dangling references.

An OPFS quota failure rolls back the attempted write and reports attempted bytes
and estimated available space (`quota - usage`) when
`navigator.storage.estimate()` supplies both values; otherwise capacity is
reported as unknown. It does not close already active sessions. A corrupt
persisted recording does not block startup: other sessions restore, while the
failed entry offers details and deletion.

Workspace state is saved after a drag/resize ends and after discrete state
changes. Unknown schema versions, invalid rectangles, and unknown widget types
fall back to the default layout without deleting telemetry files.

## 12. Caching and memory

Worker-derived series, elapsed arrays, and map caches are LRU caches bounded by
total byte size. `Session` must expose cache ownership or stop privately
retaining those derived arrays so the worker can actually evict them.
Cache-owned buffers remain attached; transferable responses are fresh copies.
An entry serving an active request is not evicted. Closing a session removes all
derived entries owned only by that session immediately. Venue maps remain while
another active session uses the venue.

The raw file, lazily decoded source channels, and one basis per active lap are
the active-session working set and are not part of the derived LRU. Their memory
is released when the session closes. Byte accounting and diagnostics report the
working set separately from evictable derived data.

The main thread may memoize in-flight requests, but completed arrays must follow
the same explicit ownership and eviction policy rather than remaining forever
in a promise cache. Cache limits are declared as named configuration constants
and covered by deterministic eviction tests.

## 13. Errors and edge cases

| Case | Behavior |
|---|---|
| One file in a multi-file drop fails | Report that file and continue opening the rest |
| Missing `Car Pos Norm` | Retain the existing precise unsupported-recording error |
| Different venue or invalid position basis | Disable comparison before a worker request |
| Incomplete or invalid reference candidate | Disable reference control with reason |
| Channel unavailable in one or more laps | Keep widget and show unavailable values locally |
| `.mt2` contains `Nominal` only | Draw a line without surface fill |
| Map parse or generation fails | Keep all non-map analysis working and show map error |
| OPFS quota exceeded | Roll back write and report attempted/estimated available space |
| Persisted recording is corrupt | Restore other sessions and offer removal |
| Layout snapshot is invalid | Load default layout without touching OPFS recordings |

The original design's proposed `Car Pos Norm -> Lap Distance -> speed integral`
fallback remains explicitly cancelled. `Lap Distance` is a path odometer, not a
shared track coordinate, so it can produce a plausible but false comparison
after different driving lines. The existing clear failure is retained instead
of presenting misleading delta data.

`.ldx` beacons remain diagnostic cross-checks; position wraps remain the source
of lap boundaries. Errors and status never rely on colour alone. Asynchronous
widgets have stable idle, loading, ready, unavailable, and error states without
changing their outer rectangle.

Shell status aggregation is deterministic: `IDLE` means no pending operation
and no usable session; `LOADING` means any load or restore is pending; `READY`
means at least one usable session exists; `ERROR` is reserved for a fatal worker
or startup failure that leaves no usable session. Per-file and per-widget errors
stay local, and storage warnings remain independent of this state.

## 14. Testing

Tests follow repository ownership rules: unit tests live in `__tests__` beside
their source directory, while shared recording integration remains under
`tests/integration`.

### 14.1 Unit and integration coverage

- `core/track`: synthetic `.mt2` trees, edge resampling, centreline, sections,
  angle wrapping, heading integration, and closure correction.
- `core/lap`: time-basis series, native elapsed arrays, and inverse
  `distance <-> elapsed` mapping.
- `worker`: basis-aware protocol, transferables, normalized-grid compatibility,
  map operations, and byte-bounded LRU behavior.
- `app/storage`: recoverable two-phase writes, fingerprint handling, restore,
  deletion, quota failure, and manifest migrations through an OPFS test adapter.
- `app/layout`: serialization, stable widget IDs, minimum sizes, invalid
  snapshot fallback, and reset.
- `app/widgets`: cursor and zoom propagation, basis switching, unavailable
  states, and accessible control names.
- Existing integration tests continue to use the committed anonymised MoTeC
  fixture and must never regress to conditional skipping.
- A known-value test confirms the undocumented `dtype_a = 0` flag-channel
  interpretation against values observed in MoTeC i2.

### 14.2 Browser and visual coverage

Playwright running bundled Chromium exercises loading, lap comparison, basis
switching, map clicks, dragging, resizing, reset layout, reload/restore, and
destructive deletion. Visual snapshots cover default, loading, unavailable,
and error states at 1280 x 720 and 1920 x 1080. Tests await
`document.fonts.ready`, disable animations and cursor blinking, use the same
container image in local and CI runs, and permit at most a 0.1% differing-pixel
ratio.

Keyboard focus, accessible names, dialog focus management, and non-colour status
cues are asserted. Mobile screenshots and responsive behavior are not part of
the MVP suite.

## 15. Definition of done

The remaining MVP is complete when:

- all six capability stages are implemented;
- repository checks, unit/integration tests, production build, and browser
  suite pass in the container;
- the Apex palette passes contrast and colour-separation validation;
- a reload restores active sessions and workspace without another file drop;
- cursor, zoom, basis, and lap identity stay synchronized across all widgets;
- the track map remains stable across laps and sessions on the same venue;
- cache tests demonstrate bounded retained array memory;
- the default layout has no overlapping widgets or clipped mandatory controls
  at both supported desktop viewports.

## Sources

- `docs/superpowers/specs/2026-08-09-motec-telemetry-viz-design.md`
- `temp/design-rules.md`
- Supplied Apex reference and dither tiles in `temp/`; their normative values
  are reproduced in this document and runtime code does not depend on them
- [Remix Icon](https://remixicon.com/)
- [VCR OSD Mono by Riciery Leal](https://www.dafont.com/vcr-osd-mono.font)
- [Matrix Sans](https://github.com/FriedOrange/MatrixSans), SIL Open Font
  License 1.1
