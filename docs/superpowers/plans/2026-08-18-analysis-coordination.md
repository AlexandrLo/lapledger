# Analysis Basis, Cursor, and Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reference-grid distance comparison, native elapsed-time charts, and one bidirectional cursor/zoom model shared by all analytical widgets.

**Architecture:** Core produces target-grid distance arrays and unchanged native-time pairs; worker requests explicitly carry basis and reference identity. Zustand owns the dual-coordinate cursor, basis-specific zoom, and comparison visibility, while uPlot is a controlled renderer in aligned distance/delta mode or faceted channel-time mode.

**Tech Stack:** TypeScript, Web Worker RPC, Zustand, uPlot faceted mode, Vitest

---

### Task 1: Add Venue Identity and Position-Basis Validity

**Files:**
- Create: `src/core/venue.ts`
- Create: `src/core/__tests__/venue.test.ts`
- Modify: `src/core/lap/lapIndex.ts`
- Modify: `src/core/session.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/index.ts`
- Modify: `src/core/__tests__/session.test.ts`
- Modify: `tests/integration/realFiles.test.ts`

- [ ] **Step 1: Write failing venue and basis tests**

```ts
expect(venueKey(' MONZA_GP-LFM ')).toBe('monza-gp-lfm');
expect(venueKey('monza-gp')).not.toBe(venueKey('monza-short'));
expect(session.meta.venueKey).toBe('knockhill-lfm');
expect(session.meta.laps.filter((lap) => lap.complete).every(
  (lap) => lap.positionBasisValid,
)).toBe(true);
```

Add synthetic collapsed and non-finite lap bases that produce
`positionBasisValid: false`.

- [ ] **Step 2: Run tests to verify failure**

```bash
docker compose run --rm app pnpm test src/core/__tests__/venue.test.ts src/core/__tests__/session.test.ts tests/integration/realFiles.test.ts
```

- [ ] **Step 3: Implement deterministic normalization**

```ts
export function venueKey(venue: string): string {
  return venue
    .trim()
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[ _-]+/g, '-');
}
```

Add the shared basis type in `src/core/types.ts`:

```ts
export type AxisBasis = 'distance' | 'time';
```

Extend `SessionMeta` with `venueKey` and `LapMeta` with
`positionBasisValid`. Populate validity during `openSession` after building each
lap basis. Require at least two finite nodes, non-decreasing position, strictly
increasing time, and positive position/time spans.

- [ ] **Step 4: Export, verify, and commit**

```bash
docker compose run --rm app pnpm test src/core/__tests__/venue.test.ts src/core/__tests__/session.test.ts tests/integration/realFiles.test.ts
make check
git add src/core tests/integration/realFiles.test.ts
git commit -m "feat(core): expose comparable venue and lap basis metadata"
```

### Task 2: Add Native Time Series and Reference-Grid Resampling

**Files:**
- Modify: `src/core/session.ts`
- Modify: `src/core/lap/resample.ts`
- Modify: `src/core/lap/__tests__/resample.test.ts`
- Modify: `src/core/__tests__/session.test.ts`

- [ ] **Step 1: Write failing native-series tests**

For a 10 Hz channel and lap `[1.05, 1.36)`, assert only samples at 1.1, 1.2,
and 1.3 seconds are returned, elapsed values are 0.05, 0.15, and 0.25, and no
boundary samples are synthesized.

```ts
expect(result.elapsed).toEqual(new Float64Array([0.05, 0.15, 0.25]));
expect(result.values).toEqual(new Float32Array([11, 12, 13]));
```

Add a same-venue pair with different local grid lengths and assert both series
requested against one target grid have the target point count and matching
normalized-position values.

- [ ] **Step 2: Run tests to verify failure**

```bash
docker compose run --rm app pnpm test src/core/lap/__tests__/resample.test.ts src/core/__tests__/session.test.ts
```

- [ ] **Step 3: Implement the public operations**

```ts
export type NativeLapSeries = {
  elapsed: Float64Array;
  values: Float32Array;
};

series(lapNumber: number, channel: string, targetGrid = grid): Float32Array;
elapsed(lapNumber: number, targetGrid = grid): Float32Array;
nativeSeries(lapNumber: number, channel: string): NativeLapSeries;
```

Native bounds follow `lap.startTime <= i / freq < lap.endTime`. Target-grid
walking evaluates `u = clamp(distance / targetGrid.length, 0, 1)` against the
lap's position basis. Preserve old callers through the default parameter.

- [ ] **Step 4: Add mapping helpers**

Add:

```ts
elapsedAtDistance(lapNumber: number, distance: number, targetGrid = grid): number;
distanceAtElapsed(lapNumber: number, elapsed: number, targetGrid = grid): number;
```

Use monotone interpolation and return `NaN` outside the valid domain. Add
round-trip tests and plateau tests.

- [ ] **Step 5: Verify and commit**

```bash
docker compose run --rm app pnpm test src/core/lap/__tests__/resample.test.ts src/core/__tests__/session.test.ts
make check
git add src/core
git commit -m "feat(core): expose native and reference-grid lap series"
```

### Task 3: Make Worker Requests Basis-Aware

**Files:**
- Modify: `src/worker/protocol.ts`
- Modify: `src/worker/handlers.ts`
- Modify: `src/worker/sessionStore.ts`
- Modify: `src/worker/__tests__/handlers.test.ts`
- Modify: `src/worker/__tests__/sessionStore.test.ts`
- Modify: `src/worker/__tests__/fixtures/recording.ts`
- Modify: `src/app/worker/client.ts`
- Modify: `src/app/worker/__tests__/client.test.ts`

- [ ] **Step 1: Write failing protocol/handler tests**

Cover two transferred time buffers, same `venueKey` with unequal local grids,
incomplete comparison rejection, invalid complete comparison acceptance, and
position-basis rejection.

- [ ] **Step 2: Define discriminated requests and results**

```ts
export type SeriesRequest =
  | { kind: 'getSeries'; basis: 'distance'; lap: LapRef; reference: LapRef; channel: string }
  | { kind: 'getSeries'; basis: 'time'; lap: LapRef; channel: string };

export type SeriesResult =
  | { kind: 'series'; basis: 'distance'; values: Float32Array }
  | { kind: 'series'; basis: 'time'; elapsed: Float64Array; values: Float32Array };
```

Add `venueKey` to `SessionSummary`. Keep delta request ordered as
`{ reference, comparison }` and return its y values on the reference grid.

- [ ] **Step 3: Implement one comparison predicate**

```ts
function assertComparable(reference: ResolvedLap, comparison: ResolvedLap): void {
  if (reference.session.meta.venueKey !== comparison.session.meta.venueKey) throw new Error('Laps belong to different venues');
  if (!reference.lap.complete || !reference.lap.valid || !reference.lap.positionBasisValid) throw new Error('Reference lap is not eligible');
  if (!comparison.lap.complete || !comparison.lap.positionBasisValid) throw new Error('Comparison lap is not eligible');
}
```

Distance series and both delta elapsed arrays use `reference.session.grid`. Time
series call `nativeSeries` and transfer both copied buffers.

- [ ] **Step 4: Run focused tests and commit**

```bash
docker compose run --rm app pnpm test src/worker/__tests__ src/app/worker/__tests__/client.test.ts
make check
git add src/worker src/app/worker
git commit -m "feat(worker): support distance and time lap series"
```

### Task 4: Add Basis-Aware Data and Cursor Helpers

**Files:**
- Modify: `src/app/data/series.ts`
- Modify: `src/app/data/__tests__/series.test.ts`
- Create: `src/app/data/cursorValues.ts`
- Create: `src/app/data/__tests__/cursorValues.test.ts`
- Create: `src/app/data/useAsyncValue.ts`

- [ ] **Step 1: Write failing cache and sampling tests**

Assert distance keys include reference identity, time keys do not collide, and
settled requests leave the in-flight map. Test continuous interpolation,
discrete previous-value hold, non-finite neighbors, and unavailable values
outside native elapsed ranges.

- [ ] **Step 2: Implement basis-aware service methods**

```ts
series(basis: AxisBasis, lap: LapRef, reference: LapRef | null, channel: string): Promise<SeriesResult>;
elapsed(lap: LapRef, reference: LapRef): Promise<Float32Array>;
delta(reference: LapRef, comparison: LapRef): Promise<Float32Array>;
```

Delete settled in-flight entries on both success and failure using the existing
promise-identity guard. Do not introduce a completed main-thread cache.

- [ ] **Step 3: Implement cursor functions**

```ts
export function sampleDistanceSeries(values: Float32Array, grid: DistanceGrid, distance: number, discrete: boolean): number | null;
export function sampleTimeSeries(elapsed: Float64Array, values: Float32Array, time: number, discrete: boolean): number | null;
export function distanceToReferenceElapsed(values: Float32Array, grid: DistanceGrid, distance: number): number | null;
export function referenceElapsedToDistance(values: Float32Array, grid: DistanceGrid, elapsed: number): number | null;
```

- [ ] **Step 4: Add generic async loading, verify, and commit**

Implement `useAsyncValue<T>(key, load)` with stale-result suppression. Retain
`useArrays` only as a temporary wrapper until all widgets migrate.

```bash
docker compose run --rm app pnpm test src/app/data/__tests__
make check
git add src/app/data
git commit -m "feat(app): load and sample basis-aware telemetry"
```

### Task 5: Move Analysis Coordination into Zustand

**Files:**
- Modify: `src/app/state/store.ts`
- Modify: `src/app/state/__tests__/store.test.ts`
- Modify: `src/app/state/__tests__/devtools.test.ts`

- [ ] **Step 1: Write failing state-transition tests**

Cover basis-specific zoom, dual-coordinate cursor, reference-change clearing,
compare visibility retaining slots, invalid reference rejection, and invalidated
complete comparison acceptance.

- [ ] **Step 2: Add target state and actions**

```ts
export type AnalysisCursor = { distance: number; referenceElapsed: number } | null;
export type ZoomRange = [number, number] | null;

axisBasis: 'distance' | 'time';
cursor: AnalysisCursor;
zoom: { distance: ZoomRange; time: ZoomRange };
comparisonsVisible: boolean;
setAxisBasis(basis: AxisBasis): void;
setCursor(cursor: AnalysisCursor): void;
setZoom(basis: AxisBasis, range: ZoomRange): void;
resetActiveZoom(): void;
toggleComparisonsVisible(): void;
```

Changing/removing the reference clears cursor and both zooms. Toggling basis
does not alter either coordinate. Use `venueKey` and `positionBasisValid` in
selection guards; remove grid-point equality.

- [ ] **Step 3: Name DevTools actions and verify**

Use `basis/set`, `cursor/set`, `zoom/set`, `zoom/resetActive`, and
`comparison/toggleVisibility`.

```bash
docker compose run --rm app pnpm test src/app/state/__tests__
make check
git add src/app/state
git commit -m "feat(app): coordinate basis cursor and zoom in state"
```

### Task 6: Add Faceted Time Data and Controlled uPlot Coordination

**Files:**
- Modify: `src/app/charts/data.ts`
- Modify: `src/app/charts/__tests__/data.test.ts`
- Modify: `src/app/charts/options.ts`
- Modify: `src/app/charts/__tests__/options.test.ts`
- Create: `src/app/charts/coordination.ts`
- Create: `src/app/charts/__tests__/coordination.test.ts`
- Modify: `src/app/charts/UPlotChart.tsx`

- [ ] **Step 1: Write failing faceted-data and options tests**

```ts
export type FacetedData = [null, ...Array<[Float64Array, Float32Array]>];
```

Assert mode 2 channel data accepts unequal sample counts, clips at reference
duration without synthesizing endpoints, labels x as `Elapsed (s)`, and uses a
basis-specific sync key. Delta remains aligned in both bases.

- [ ] **Step 2: Implement data builders and options**

Add `facetedTimeData` and `deltaChartData`. Configure mode-2 facets:

```ts
facets: [
  { scale: 'x', sorted: 1 },
  { scale: 'y' },
]
```

Keep one documented cast at the uPlot constructor/setData boundary because
uPlot 1.6 declarations omit faceted data.

- [ ] **Step 3: Write failing controlled-chart tests**

With a fake chart, assert pointer x uses `posToVal`, store cursor uses
`valToPos`/`setCursor`, chart scale changes publish zoom, programmatic updates do
not loop, and resize reapplies cursor/zoom.

- [ ] **Step 4: Implement controlled coordination**

Update props:

```ts
type UPlotChartProps = {
  basis: AxisBasis;
  options: uPlot.Options;
  data: uPlot.AlignedData | FacetedData;
  cursorValue: number | null;
  zoom: ZoomRange;
  onCursor(value: number): void;
  onZoom(range: ZoomRange): void;
  recreateKey: string;
};
```

Use an origin guard around programmatic cursor/scale updates. Never use
`cursor.idx` or `data[0]` for time mode.

- [ ] **Step 5: Verify and commit**

```bash
docker compose run --rm app pnpm test src/app/charts/__tests__
make check
git add src/app/charts
git commit -m "feat(app): control aligned and faceted telemetry charts"
```

### Task 7: Wire Channel, Delta, Header, and Reference Axis

**Files:**
- Create: `src/app/data/useReferenceAxis.ts`
- Create: `src/app/data/__tests__/referenceAxis.test.ts`
- Modify: `src/app/widgets/ChannelChartWidget.tsx`
- Modify: `src/app/widgets/DeltaWidget.tsx`
- Modify: `src/app/widgets/LapTableWidget.tsx`
- Modify: `src/app/shell/Header.tsx`
- Create: `src/app/widgets/__tests__/analysisWidgets.test.tsx`

- [ ] **Step 1: Write failing reference-axis tests**

Expose:

```ts
fromChartValue(basis: AxisBasis, value: number): AnalysisCursor | null;
chartValue(basis: AxisBasis, cursor: AnalysisCursor): number;
```

Assert distance movement derives elapsed and time movement derives distance.

- [ ] **Step 2: Implement the reference-axis coordinator**

Load reference elapsed on the reference grid. Return null without an eligible
reference or outside the mapping domain.

- [ ] **Step 3: Update widgets**

Channel widgets request reference-grid distance or native time data. Delta uses
distance x or reference elapsed x while retaining the same y arrays and always
shows a zero reference line. When comparisons are hidden, widgets omit their
comparison lines/readouts without clearing slots.

- [ ] **Step 4: Enable header controls**

Wire Distance/Time, Compare, and Reset Zoom to Zustand actions. Labels and
pressed/disabled states must remain accessible.

- [ ] **Step 5: Verify and commit**

```bash
docker compose run --rm app pnpm test src/app/data/__tests__/referenceAxis.test.ts src/app/widgets/__tests__/analysisWidgets.test.tsx src/app/shell/__tests__
make check
git add src/app/data src/app/widgets src/app/shell
git commit -m "feat(app): synchronize analysis widgets across both bases"
```

### Task 8: Implement Cursor Data and Complete Integration

**Files:**
- Create: `src/app/widgets/cursorData.ts`
- Create: `src/app/widgets/__tests__/cursorData.test.ts`
- Modify: `src/app/widgets/CursorDataWidget.tsx`
- Create: `src/app/widgets/__tests__/CursorDataWidget.test.tsx`
- Modify: `tests/integration/realFiles.test.ts`

- [ ] **Step 1: Write failing row-model tests**

```ts
type CursorCell =
  | { state: 'value'; value: number; unit: string }
  | { state: 'missing' }
  | { state: 'unavailable-channel' }
  | { state: 'no-cursor' };
```

Assert rows derive from open channel-widget IDs, duplicate channels remain
separate rows, hidden comparisons remove columns, and short time series return
missing rather than clamped values.

- [ ] **Step 2: Implement the pure model and widget**

Distance cells sample target-grid arrays at `cursor.distance`; time cells sample
native pairs at `cursor.referenceElapsed`. Use text tokens and separate colour
markers for lap identity.

- [ ] **Step 3: Add real-recording regressions**

Assert all complete laps have valid position bases, native samples obey the
half-open interval, distance/elapsed mapping round-trips within one grid step,
and time delta x/y arrays are finite and equal in length.

- [ ] **Step 4: Run the checkpoint and commit**

```bash
make check
make test
make build
git add src/app/widgets tests/integration/realFiles.test.ts
git commit -m "feat(app): show synchronized cursor telemetry"
```
