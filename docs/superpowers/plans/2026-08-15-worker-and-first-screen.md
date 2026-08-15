# Worker and First Working Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the finished `src/core` library into a working screen: drop a
`.ld` (+ `.ldx`) onto the page, pick a reference lap and up to two comparison
laps, and read where the time is lost on a delta chart and a stack of channel
charts sharing one cursor.

**Architecture:** A dedicated Web Worker becomes the sole owner of the raw
file bytes and of every `Session` object; the main thread never sees more than
a few `Float32Array`s of 1-metre-grid data. `src/worker` is a new module layer
between `core` and `app`, with its own alias, its own `tsconfig` project (it
needs the `WebWorker` lib, not `DOM`) and a request/response protocol shared
with the main thread. React reads only small arrays and never learns that the
`.ld` format exists.

**Tech Stack:** TypeScript (strict), Vite, Vitest, React 19, zustand (state),
uPlot (charts). No new native dependencies.

**Spec:** `docs/superpowers/specs/2026-08-09-motec-telemetry-viz-design.md`
(sections 3, 4, 6, 7 and the palette part of 8.3).

**Scope:** This is plan 2 of the MVP. Plan 1
(`docs/superpowers/plans/2026-08-09-core-telemetry-library.md`) is complete:
`src/core` parses `.ld`/`.ldx`, builds the lap index, resamples onto a 1-metre
distance grid and computes deltas, with 134 passing tests.

**Deliberately out of scope**, each carried by a later plan:

- Track map: `.mt2` parsing, map generation, the `TrackMap` panel (spec §5).
- The pixel/dithering visual layer, shadcn/ui and Tailwind (spec §8.2, §8.4).
  Only the palette module of §8.1/§8.3 is built here, because uPlot needs
  colours from day one and there must never be two sources for them.
- OPFS persistence of files and `localStorage` persistence of layout and
  selection (spec §11). Sessions live for as long as the tab does.
- `react-grid-layout`. The four panels sit in a fixed CSS grid.
- The time/distance x-axis basis toggle (spec §7). `core` resamples onto the
  distance grid only; a time basis needs new `core` work.
- The worker-side LRU cache by total size (spec §6). `core`'s `Session` already
  memoises per (lap, channel); at 23 KB a series and a handful of channels the
  ceiling is single-digit megabytes.

**A note on the spec's age.** The spec was written before the repository
gained its container toolchain, its aliases and its committed fixture. Where
they disagree, this plan follows the repository:

- Commands run in the container through the `Makefile` (`make test`,
  `make check`), never `npm`/`npx`/`pnpm` on the host.
- Sample recordings are no longer in `temp/example`; the anonymised Knockhill
  recording is committed at `tests/fixtures/motec/knockhill-cupra-tcr.ld`
  (+ `.ldx`), 28 MB, 34 laps.
- Unit tests live in a `__tests__` directory inside the directory holding the
  code, never beside the source.
- Imports go through aliases; relative imports may reach a sibling only.

## Global Constraints

- All files in this repository are written in **English** — documentation,
  comments, commit messages, identifiers.
- Commit messages follow Conventional Commits and must **not** contain a
  `Co-Authored-By` trailer.
- Never run `npm`, `npx`, `pnpm`, `node`, `vite` or `vitest` on the host.
  Everything goes through the `Makefile`; for anything without a target, use
  `docker compose run --rm app <command>`.
- pnpm only. `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080`, so a
  version published less than seven days ago will not resolve. Install
  lifecycle scripts are blocked by `onlyBuiltDependencies: []`; a package that
  needs an entry there must be replaced, not allow-listed. Neither `uplot` nor
  `zustand` has an install script or a native binary.
- TypeScript `strict: true`, and `erasableSyntaxOnly: true` — no constructor
  parameter properties, no `enum`, no `namespace`, no decorators.
- `make check` (`lint-check` + `types-check`) runs on every commit through the
  pre-commit hook. `make test` must also be green before each commit; the hook
  does not run it.
- Dependency direction is downwards only: `core` knows nothing of `worker` or
  `app`; `worker` holds no domain logic — it owns memory and routes requests;
  `app` never imports from `@core` except for types re-exported through
  `@worker/protocol`.
- `@stylistic` formatting rules are lint errors: single quotes, semicolons,
  trailing commas on multiline, arrow parens always, 100-column lines.
  `make lint-fix` applies import ordering; never sort imports by hand.
- Import groups, blank line between each: `node:` builtins, packages,
  `@core`/`@app`/`@tests`/`@worker`, then siblings — alphabetical inside a
  group.

---

## File Structure

| File | Responsibility |
|---|---|
| `tsconfig.worker.json` | The worker TypeScript project — `WebWorker` lib instead of `DOM` |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.base.json` | Register the project, keep `src/worker` out of the app project, add the `@worker` path and `esModuleInterop` |
| `vite.config.ts`, `eslint.config.js`, `AGENTS.md` | The `@worker` alias, its `internalPattern`, the documented rule |
| `src/worker/protocol.ts` | Request and response message types, shared with the main thread |
| `src/worker/sessionStore.ts` | `SessionStore` — the only owner of open `Session` objects |
| `src/worker/handlers.ts` | `handleRequest` — pure dispatch from a request to a result plus its transfer list |
| `src/worker/worker.ts` | Worker entry point: the twenty lines that touch `self` |
| `src/app/worker/client.ts` | `createClient`, `spawnTelemetryWorker` — typed request/response over a port |
| `src/app/data/series.ts` | `createSeriesCache` — promise memoisation so two panels asking for the same array cost one round trip |
| `src/app/data/telemetry.ts` | The lazily spawned worker singleton and the `useSeries` hook |
| `src/app/theme/palette.ts` | Colour tokens and the three lap slots; the single source of truth for DOM and canvas |
| `src/app/format.ts` | `formatLapTime`, `formatDelta`, `formatDistance` |
| `src/app/state/store.ts` | zustand store: sessions, slot assignment, cursor, chart channels |
| `src/app/charts/data.ts` | `gridNodes` — the x array shared by every chart |
| `src/app/charts/options.ts` | Pure uPlot option builders for the delta chart and a stack chart |
| `src/app/charts/UPlotChart.tsx` | React wrapper: create, resize, `setData`, destroy |
| `src/app/panels/FileDrop.tsx`, `src/app/panels/pairing.ts` | Drop target and the `.ld`/`.ldx` pairing rule |
| `src/app/panels/LapTable.tsx` | Sessions with their laps; reference and comparison selection |
| `src/app/panels/DeltaChart.tsx` | The primary panel |
| `src/app/panels/ChartStack.tsx` | One chart per channel, shared x and cursor, plus the channel picker |
| `src/app/App.tsx`, `src/app/app.css` | The fixed four-area layout |

---

### Task 1: The worker module boundary

**Files:**
- Create: `tsconfig.worker.json`, `src/worker/protocol.ts`
- Modify: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.base.json`,
  `vite.config.ts`, `eslint.config.js`, `AGENTS.md`

**Interfaces:**
- Consumes: `@core/index` types — `ChannelMeta`, `DistanceGrid`, `LapMeta`,
  `LapRef`, `SessionId`, `SessionMeta`.
- Produces:
  - the `@worker/*` alias resolving to `src/worker/*`
  - `type RequestBody`, `type Request`, `type ResultBody`, `type Response`,
    `type ResultByKind`, `type SessionSummary` in `@worker/protocol`

`src/worker` needs its own TypeScript project because a worker's global scope
is `DedicatedWorkerGlobalScope`, which lives in the `WebWorker` lib, and that
lib cannot be merged with `DOM` in one program. The app project therefore
excludes `src/worker` from its root file set — files it *imports* from there
(the protocol types) are still compiled, which is exactly what is wanted.

- [ ] **Step 1: Add the worker TypeScript project**

Create `tsconfig.worker.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.worker.tsbuildinfo",
    "lib": ["ES2023", "WebWorker"],
    "types": ["vite/client"]
  },
  "include": ["src/worker"],
  "exclude": ["src/worker/**/__tests__/**"]
}
```

Register it in `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.worker.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.test.json" }
  ]
}
```

Keep the worker out of the app project's root files — `tsconfig.app.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "types": ["vite/client"]
  },
  "include": ["src"],
  "exclude": ["src/**/__tests__/**", "src/worker"]
}
```

- [ ] **Step 2: Add the alias in all three places**

In `tsconfig.base.json`, add to `paths`:

```json
    "paths": {
      "@core/*": ["./src/core/*"],
      "@app/*": ["./src/app/*"],
      "@worker/*": ["./src/worker/*"],
      "@tests/*": ["./tests/*"]
    }
```

In `vite.config.ts`, add to `resolve.alias`:

```ts
      '@worker': fileURLToPath(new URL('./src/worker', import.meta.url)),
```

In `eslint.config.js`, extend `internalPattern` and both
`no-restricted-imports` messages:

```js
      'perfectionist/sort-imports': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'unknown'],
          internalPattern: ['^@core/.+', '^@app/.+', '^@worker/.+', '^@tests/.+'],
          newlinesBetween: 1,
        },
      ],
```

```js
            {
              group: ['..', '../*', '../**'],
              message:
                'Reach outside the directory through @core, @app, @worker or @tests, not "..".',
            },
            {
              group: ['./*/*', './*/**'],
              message:
                'Relative imports may go one level deep. Use @core, @app, @worker or @tests ' +
                'for anything deeper.',
            },
```

- [ ] **Step 3: Write the protocol**

Create `src/worker/protocol.ts`:

```ts
import type { ChannelMeta, DistanceGrid, LapMeta, LapRef, SessionId } from '@core/index';

/**
 * Everything the main thread learns about an opened session.
 *
 * A structural clone of `core`'s `SessionMeta` plus the grid it was opened
 * with. It carries no `Float32Array` and no reference to the file, so it costs
 * a few kilobytes to post even for a 186-channel recording.
 */
export type SessionSummary = {
  id: SessionId;
  fileName: string;
  driver: string;
  vehicle: string;
  venue: string;
  eventName: string;
  sessionName: string;
  recordedAt: string;
  duration: number;
  channels: ChannelMeta[];
  laps: LapMeta[];
  trackLength?: number;
  grid: DistanceGrid;
};

export type OpenSessionRequest = {
  kind: 'openSession';
  fileName: string;
  /** The whole .ld file. Transferred, not cloned — the main thread loses it. */
  bytes: ArrayBuffer;
  ldxText?: string;
};

export type CloseSessionRequest = { kind: 'closeSession'; sessionId: SessionId };

export type SeriesRequest = { kind: 'getSeries'; lap: LapRef; channel: string };

export type ElapsedRequest = { kind: 'getElapsed'; lap: LapRef };

export type DeltaRequest = { kind: 'getDelta'; reference: LapRef; comparison: LapRef };

export type RequestBody =
  | CloseSessionRequest
  | DeltaRequest
  | ElapsedRequest
  | OpenSessionRequest
  | SeriesRequest;

export type Request = RequestBody & { id: number };

export type SessionOpened = { kind: 'sessionOpened'; session: SessionSummary };
export type SessionClosed = { kind: 'sessionClosed' };
/** Values on the session's distance grid, one per node. */
export type SeriesResult = { kind: 'series'; values: Float32Array };

export type ResultBody = SeriesResult | SessionClosed | SessionOpened;

export type Response =
  | { id: number; ok: true; result: ResultBody }
  | { id: number; ok: false; message: string };

/** Which result each request kind produces, so the client can be typed. */
export type ResultByKind = {
  closeSession: SessionClosed;
  getDelta: SeriesResult;
  getElapsed: SeriesResult;
  getSeries: SeriesResult;
  openSession: SessionOpened;
};
```

- [ ] **Step 4: Document the rule**

In `AGENTS.md`, replace the "Three aliases" opening of the `## Imports`
section with four, and extend the sentence about adding a directory:

```
Four aliases, resolved in `tsconfig.base.json`, `vite.config.ts` and (through
`mergeConfig`) `vitest.config.ts`:

    @core/*   → src/core/*
    @app/*    → src/app/*
    @worker/* → src/worker/*
    @tests/*  → tests/*
```

and, in the paragraph that ends the section:

```
Adding a top-level directory means adding an alias in `tsconfig.base.json` and
`vite.config.ts`, and a pattern in `eslint.config.js`'s `internalPattern`. A
directory that needs a different `lib` also needs its own project file —
`src/worker` runs in `WebWorker`, not `DOM`, so it has `tsconfig.worker.json`
and is excluded from `tsconfig.app.json`.
```

- [ ] **Step 5: Verify**

Run: `make check`
Expected: both `lint-check` and `types-check` exit 0. `tsc -b` compiles four
projects, one of which now contains only `protocol.ts`.

Run: `make test`
Expected: PASS, 134 tests — nothing has changed for `core`.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.worker.json tsconfig.json tsconfig.app.json tsconfig.base.json \
  vite.config.ts eslint.config.js AGENTS.md src/worker/protocol.ts
git commit -m "feat(worker): add the worker module boundary and its message protocol"
```

---

### Task 2: SessionStore

**Files:**
- Create: `src/worker/sessionStore.ts`, `src/worker/__tests__/sessionStore.test.ts`

**Interfaces:**
- Consumes: `openSession`, `type Session`, `type SessionId` from `@core/index`;
  `type SessionSummary` from `@worker/protocol`; `buildLd` from
  `@tests/fixtures/buildLd`.
- Produces:
  - `class SessionStore`
  - `open(bytes: Uint8Array, options: { fileName: string; ldxText?: string }): SessionSummary`
  - `get(id: SessionId): Session`
  - `close(id: SessionId): boolean`
  - `readonly size: number`

The store is the only thing that keeps a `Session` alive, and therefore the
only thing that keeps 28 MB of file bytes alive. `get` throws rather than
returning `undefined`: every caller would otherwise repeat the same message.

- [ ] **Step 1: Write the failing test**

Create `src/worker/__tests__/sessionStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildLd } from '@tests/fixtures/buildLd';
import { SessionStore } from '@worker/sessionStore';

/**
 * Three laps of a one-kilometre track at 10 Hz: position ramps 0 → 1 three
 * times, the lap counter follows it, and Lap Time restarts at each wrap. Three
 * rather than two, so that the middle lap is bounded by a wrap on both sides
 * and comes out of the lap index as `complete`.
 */
function recording(venue = 'test-venue'): Uint8Array {
  const position: number[] = [];
  const lapNumber: number[] = [];
  const lapTime: number[] = [];
  const speed: number[] = [];
  for (let lap = 0; lap < 3; lap++) {
    for (let i = 0; i < 100; i++) {
      position.push(i / 100);
      lapNumber.push(lap);
      lapTime.push(i / 10);
      speed.push(100);
    }
  }

  return buildLd({
    venue,
    channels: [
      { name: 'Car Pos Norm', freq: 10, values: position },
      { name: 'Lap Number', freq: 10, values: lapNumber },
      { name: 'Lap Time', freq: 10, values: lapTime },
      { name: 'Ground Speed', freq: 10, values: speed },
    ],
  });
}

const LDX = '<LDXFile><Numeric Id="Venue Length" Value="1000" Unit="m"/></LDXFile>';

describe('SessionStore', () => {
  it('summarises an opened session without shipping any samples', () => {
    const store = new SessionStore();
    const summary = store.open(recording(), { fileName: 'a.ld', ldxText: LDX });

    expect(summary.fileName).toBe('a.ld');
    expect(summary.venue).toBe('test-venue');
    expect(summary.grid.length).toBeCloseTo(1000, 6);
    expect(summary.grid.approximate).toBe(false);
    expect(summary.channels.map((c) => c.name)).toContain('Ground Speed');
    expect(summary.laps.length).toBeGreaterThanOrEqual(1);
    expect(store.size).toBe(1);
  });

  it('gives every session its own id', () => {
    const store = new SessionStore();
    const first = store.open(recording(), { fileName: 'a.ld', ldxText: LDX });
    const second = store.open(recording(), { fileName: 'b.ld', ldxText: LDX });

    expect(first.id).not.toBe(second.id);
    expect(store.size).toBe(2);
  });

  it('hands back the session it opened', () => {
    const store = new SessionStore();
    const summary = store.open(recording(), { fileName: 'a.ld', ldxText: LDX });

    expect(store.get(summary.id).meta.fileName).toBe('a.ld');
  });

  it('names the missing session when asked for one it does not hold', () => {
    const store = new SessionStore();
    expect(() => store.get('nope')).toThrow(/no session "nope"/);
  });

  it('forgets a closed session', () => {
    const store = new SessionStore();
    const summary = store.open(recording(), { fileName: 'a.ld', ldxText: LDX });

    expect(store.close(summary.id)).toBe(true);
    expect(store.close(summary.id)).toBe(false);
    expect(store.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/worker/__tests__/sessionStore.test.ts`
Expected: FAIL — cannot resolve `@worker/sessionStore`.

- [ ] **Step 3: Implement the store**

Create `src/worker/sessionStore.ts`:

```ts
import { openSession, type Session, type SessionId } from '@core/index';

import type { SessionSummary } from './protocol';

export type OpenOptions = { fileName: string; ldxText?: string };

/**
 * The sole owner of open sessions, and therefore of the file bytes behind
 * them: a `Session` closes over the whole `.ld` buffer, so dropping it here is
 * what actually frees the memory.
 */
export class SessionStore {
  private readonly sessions = new Map<SessionId, Session>();

  get size(): number {
    return this.sessions.size;
  }

  open(bytes: Uint8Array, options: OpenOptions): SessionSummary {
    const session = openSession(bytes, {
      fileName: options.fileName,
      ...(options.ldxText === undefined ? {} : { ldxText: options.ldxText }),
    });
    this.sessions.set(session.meta.id, session);
    return summarise(session);
  }

  get(id: SessionId): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`no session "${id}" is open`);
    return session;
  }

  close(id: SessionId): boolean {
    return this.sessions.delete(id);
  }
}

function summarise(session: Session): SessionSummary {
  const { meta } = session;
  return {
    id: meta.id,
    fileName: meta.fileName,
    driver: meta.driver,
    vehicle: meta.vehicle,
    venue: meta.venue,
    eventName: meta.eventName,
    sessionName: meta.sessionName,
    recordedAt: meta.recordedAt,
    duration: meta.duration,
    channels: meta.channels,
    laps: meta.laps,
    ...(meta.trackLength === undefined ? {} : { trackLength: meta.trackLength }),
    grid: session.grid,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/worker/__tests__/sessionStore.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/worker/sessionStore.ts src/worker/__tests__/sessionStore.test.ts
git commit -m "feat(worker): own opened sessions in a SessionStore"
```

---

### Task 3: Request handlers

**Files:**
- Create: `src/worker/handlers.ts`, `src/worker/__tests__/handlers.test.ts`

**Interfaces:**
- Consumes: `SessionStore`; `computeDelta` from `@core/index`; the protocol types.
- Produces:
  - `type HandlerResult = { body: ResultBody; transfer: Transferable[] }`
  - `handleRequest(store: SessionStore, request: RequestBody): HandlerResult`

All the routing lives here, in a function with no reference to `self`, so it
is tested in Node like anything in `core`. Two guards belong here rather than
in `core`, because they are about comparing two sessions and `core` only ever
sees one: laps from different venues cannot be compared (spec §9), and neither
can laps whose grids differ in size.

- [ ] **Step 1: Write the failing test**

Create `src/worker/__tests__/handlers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildLd } from '@tests/fixtures/buildLd';
import { handleRequest } from '@worker/handlers';
import { SessionStore } from '@worker/sessionStore';

/** Three laps of a one-kilometre track at 10 Hz; the middle one is complete. */
function recording(venue = 'test-venue', speed = 100): Uint8Array {
  const position: number[] = [];
  const lapNumber: number[] = [];
  const lapTime: number[] = [];
  const groundSpeed: number[] = [];
  for (let lap = 0; lap < 3; lap++) {
    for (let i = 0; i < 100; i++) {
      position.push(i / 100);
      lapNumber.push(lap);
      lapTime.push(i / 10);
      groundSpeed.push(speed);
    }
  }

  return buildLd({
    venue,
    channels: [
      { name: 'Car Pos Norm', freq: 10, values: position },
      { name: 'Lap Number', freq: 10, values: lapNumber },
      { name: 'Lap Time', freq: 10, values: lapTime },
      { name: 'Ground Speed', freq: 10, values: groundSpeed },
    ],
  });
}

const LDX = '<LDXFile><Numeric Id="Venue Length" Value="1000" Unit="m"/></LDXFile>';

function storeWith(venue = 'test-venue'): { store: SessionStore; id: string; lap: number } {
  const store = new SessionStore();
  const summary = store.open(recording(venue), { fileName: 'a.ld', ldxText: LDX });
  const lap = summary.laps.find((l) => l.complete) ?? summary.laps[0];
  return { store, id: summary.id, lap: lap.number };
}

describe('handleRequest', () => {
  it('opens a session from transferred bytes', () => {
    const store = new SessionStore();
    const bytes = recording();
    const result = handleRequest(store, {
      kind: 'openSession',
      fileName: 'a.ld',
      bytes: bytes.buffer.slice(0) as ArrayBuffer,
      ldxText: LDX,
    });

    expect(result.body.kind).toBe('sessionOpened');
    expect(store.size).toBe(1);
  });

  it('returns a channel series on the distance grid, and transfers it', () => {
    const { store, id, lap } = storeWith();
    const result = handleRequest(store, {
      kind: 'getSeries',
      lap: { sessionId: id, lapNumber: lap },
      channel: 'Ground Speed',
    });

    expect(result.body.kind).toBe('series');
    if (result.body.kind !== 'series') throw new Error('unreachable');
    expect(result.body.values).toBeInstanceOf(Float32Array);
    expect(result.body.values.length).toBe(store.get(id).grid.points);
    expect(result.transfer).toEqual([result.body.values.buffer]);
  });

  it('returns elapsed lap time that starts at zero', () => {
    const { store, id, lap } = storeWith();
    const result = handleRequest(store, {
      kind: 'getElapsed',
      lap: { sessionId: id, lapNumber: lap },
    });

    if (result.body.kind !== 'series') throw new Error('unreachable');
    expect(result.body.values[0]).toBeCloseTo(0, 6);
  });

  it('gives a zero delta for a lap against itself', () => {
    const { store, id, lap } = storeWith();
    const result = handleRequest(store, {
      kind: 'getDelta',
      reference: { sessionId: id, lapNumber: lap },
      comparison: { sessionId: id, lapNumber: lap },
    });

    if (result.body.kind !== 'series') throw new Error('unreachable');
    for (const value of result.body.values) expect(value).toBeCloseTo(0, 6);
  });

  it('refuses to compare laps recorded at different venues', () => {
    const monza = storeWith('monza-lfm');
    const summary = monza.store.open(recording('knockhill'), {
      fileName: 'b.ld',
      ldxText: LDX,
    });

    expect(() =>
      handleRequest(monza.store, {
        kind: 'getDelta',
        reference: { sessionId: monza.id, lapNumber: monza.lap },
        comparison: { sessionId: summary.id, lapNumber: summary.laps[0].number },
      }),
    ).toThrow(/different venues: "monza-lfm" and "knockhill"/);
  });

  it('closes a session', () => {
    const { store, id } = storeWith();
    const result = handleRequest(store, { kind: 'closeSession', sessionId: id });

    expect(result.body.kind).toBe('sessionClosed');
    expect(store.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/worker/__tests__/handlers.test.ts`
Expected: FAIL — cannot resolve `@worker/handlers`.

- [ ] **Step 3: Implement the handlers**

Create `src/worker/handlers.ts`:

```ts
import { computeDelta, type Session } from '@core/index';

import type { DeltaRequest, RequestBody, ResultBody } from './protocol';
import type { SessionStore } from './sessionStore';

export type HandlerResult = {
  body: ResultBody;
  /** Buffers handed to `postMessage` so the copy is skipped. */
  transfer: Transferable[];
};

export function handleRequest(store: SessionStore, request: RequestBody): HandlerResult {
  switch (request.kind) {
    case 'openSession': {
      const session = store.open(new Uint8Array(request.bytes), {
        fileName: request.fileName,
        ...(request.ldxText === undefined ? {} : { ldxText: request.ldxText }),
      });
      return { body: { kind: 'sessionOpened', session }, transfer: [] };
    }

    case 'closeSession': {
      store.close(request.sessionId);
      return { body: { kind: 'sessionClosed' }, transfer: [] };
    }

    case 'getSeries': {
      const session = store.get(request.lap.sessionId);
      return series(session.series(request.lap.lapNumber, request.channel));
    }

    case 'getElapsed': {
      const session = store.get(request.lap.sessionId);
      return series(session.elapsed(request.lap.lapNumber));
    }

    case 'getDelta':
      return series(delta(store, request));
  }
}

function series(values: Float32Array): HandlerResult {
  return { body: { kind: 'series', values }, transfer: [values.buffer] };
}

function delta(store: SessionStore, request: DeltaRequest): Float32Array {
  const reference = store.get(request.reference.sessionId);
  const comparison = store.get(request.comparison.sessionId);
  assertComparable(reference, comparison);

  return computeDelta(
    reference.elapsed(request.reference.lapNumber),
    comparison.elapsed(request.comparison.lapNumber),
  );
}

/**
 * A delta is read as a distance along one track, so two laps from different
 * venues have nothing to compare: node 1500 is a different corner in each.
 * The grid check catches the subtler case of one venue whose track length was
 * estimated from `Lap Distance` while the other's came from the `.ldx`.
 */
function assertComparable(reference: Session, comparison: Session): void {
  if (reference.meta.venue !== comparison.meta.venue) {
    throw new Error(
      `cannot compare laps from different venues: "${reference.meta.venue}" and ` +
        `"${comparison.meta.venue}"`,
    );
  }
  if (reference.grid.points !== comparison.grid.points) {
    throw new Error(
      `cannot compare laps on different distance grids: ${reference.grid.points} and ` +
        `${comparison.grid.points} points`,
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/worker/__tests__/handlers.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/worker/handlers.ts src/worker/__tests__/handlers.test.ts
git commit -m "feat(worker): route protocol requests through pure handlers"
```

---

### Task 4: Worker entry point and typed client

**Files:**
- Create: `src/worker/worker.ts`, `src/app/worker/client.ts`,
  `src/app/worker/__tests__/client.test.ts`

**Interfaces:**
- Consumes: `handleRequest`, `SessionStore`, the protocol types.
- Produces:
  - `type ClientPort` — the slice of `Worker` the client needs
  - `type TelemetryClient = { request; terminate }` where
    `request<B extends RequestBody>(body: B, transfer?: Transferable[]): Promise<ResultByKind[B['kind']]>`
  - `createClient(port: ClientPort): TelemetryClient`
  - `spawnTelemetryWorker(): TelemetryClient`

The client is written against a `ClientPort` rather than against `Worker` so
that it can be tested in Node against a fake. `spawnTelemetryWorker` is the
three lines that know about the real thing.

- [ ] **Step 1: Write the failing test**

Create `src/app/worker/__tests__/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { createClient, type ClientPort } from '@app/worker/client';

import type { Request, Response } from '@worker/protocol';

/** A port that answers whatever the test tells it to, one message at a time. */
function fakePort(answer: (request: Request) => Response): ClientPort & { sent: Request[] } {
  let listener: ((event: MessageEvent) => void) | undefined;
  const sent: Request[] = [];

  return {
    sent,
    postMessage(message: unknown) {
      const request = message as Request;
      sent.push(request);
      queueMicrotask(() => listener?.({ data: answer(request) } as MessageEvent));
    },
    addEventListener(_type: 'message', handler: (event: MessageEvent) => void) {
      listener = handler;
    },
    terminate: vi.fn(),
  };
}

describe('createClient', () => {
  it('resolves a request with the matching response', async () => {
    const port = fakePort((request) => ({
      id: request.id,
      ok: true,
      result: { kind: 'series', values: Float32Array.from([1, 2, 3]) },
    }));
    const client = createClient(port);

    const result = await client.request({
      kind: 'getElapsed',
      lap: { sessionId: 's', lapNumber: 0 },
    });

    expect([...result.values]).toEqual([1, 2, 3]);
    expect(port.sent[0].kind).toBe('getElapsed');
  });

  it('gives each request its own id', async () => {
    const port = fakePort((request) => ({
      id: request.id,
      ok: true,
      result: { kind: 'series', values: Float32Array.from([request.id]) },
    }));
    const client = createClient(port);

    const [first, second] = await Promise.all([
      client.request({ kind: 'getElapsed', lap: { sessionId: 's', lapNumber: 0 } }),
      client.request({ kind: 'getElapsed', lap: { sessionId: 's', lapNumber: 1 } }),
    ]);

    expect(first.values[0]).not.toBe(second.values[0]);
  });

  it('rejects with the message the worker reported', async () => {
    const port = fakePort((request) => ({ id: request.id, ok: false, message: 'no such lap' }));
    const client = createClient(port);

    await expect(
      client.request({ kind: 'getElapsed', lap: { sessionId: 's', lapNumber: 9 } }),
    ).rejects.toThrow('no such lap');
  });

  it('ignores a response whose id it never issued', async () => {
    const port = fakePort((request) => ({
      id: request.id + 1000,
      ok: true,
      result: { kind: 'sessionClosed' },
    }));
    const client = createClient(port);

    const pending = client.request({ kind: 'closeSession', sessionId: 's' });
    const settled = await Promise.race([
      pending.then(() => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 10)),
    ]);

    expect(settled).toBe('pending');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/app/worker/__tests__/client.test.ts`
Expected: FAIL — cannot resolve `@app/worker/client`.

- [ ] **Step 3: Write the worker entry point**

Create `src/worker/worker.ts`:

```ts
import { handleRequest } from './handlers';
import type { Request, Response } from './protocol';
import { SessionStore } from './sessionStore';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const store = new SessionStore();

scope.addEventListener('message', (event: MessageEvent<Request>) => {
  // The request is passed on whole rather than stripped of its id: rest
  // destructuring a discriminated union loses the discriminant, and one extra
  // property costs the handler nothing.
  const request = event.data;
  try {
    const { body, transfer } = handleRequest(store, request);
    const response: Response = { id: request.id, ok: true, result: body };
    scope.postMessage(response, transfer);
  } catch (error) {
    const response: Response = {
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(response);
  }
});
```

- [ ] **Step 4: Write the client**

Create `src/app/worker/client.ts`:

```ts
import type { Request, RequestBody, ResultByKind, Response } from '@worker/protocol';

// Vite compiles this to a worker bundle and gives back its constructor. The
// `?worker` suffix goes through the resolver, so the @worker alias applies.
import TelemetryWorker from '@worker/worker?worker';

/** The part of `Worker` the client uses, so a test can supply a fake. */
export type ClientPort = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  terminate(): void;
};

export type TelemetryClient = {
  // The body itself is the inference site. `Extract<RequestBody, { kind: K }>`
  // would read better and not work: TypeScript cannot infer K out of a
  // conditional type.
  request<B extends RequestBody>(
    body: B,
    transfer?: Transferable[],
  ): Promise<ResultByKind[B['kind']]>;
  terminate(): void;
};

type Pending = { resolve: (result: never) => void; reject: (error: Error) => void };

export function createClient(port: ClientPort): TelemetryClient {
  const pending = new Map<number, Pending>();
  let nextId = 1;

  port.addEventListener('message', (event: MessageEvent) => {
    const response = event.data as Response;
    const waiting = pending.get(response.id);
    // A response with an unknown id belongs to nobody — a request that was
    // already settled, or a stray message. Dropping it is the only safe move.
    if (!waiting) return;
    pending.delete(response.id);
    if (response.ok) waiting.resolve(response.result as never);
    else waiting.reject(new Error(response.message));
  });

  return {
    request(body, transfer) {
      const id = nextId++;
      const message: Request = { id, ...body };
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (result: never) => void, reject });
        port.postMessage(message, transfer ?? []);
      });
    },
    terminate() {
      port.terminate();
    },
  };
}

export function spawnTelemetryWorker(): TelemetryClient {
  return createClient(new TelemetryWorker({ name: 'telemetry' }));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/app/worker/__tests__/client.test.ts`
Expected: PASS, 4 tests.

Then run: `make check`
Expected: exit 0. If `tsc` reports that `@worker/worker?worker` has no
declaration, confirm `tsconfig.app.json` still lists `"types": ["vite/client"]`
— that is where the `*?worker` module declaration comes from.

- [ ] **Step 6: Commit**

```bash
git add src/worker/worker.ts src/app/worker/client.ts src/app/worker/__tests__/client.test.ts
git commit -m "feat(app): talk to the telemetry worker through a typed client"
```

---

### Task 5: Series cache

**Files:**
- Create: `src/app/data/series.ts`, `src/app/data/__tests__/series.test.ts`

**Interfaces:**
- Consumes: `type TelemetryClient` from `@app/worker/client`; `type LapRef`,
  `type SessionId` from `@core/index`.
- Produces:
  - `type SeriesCache`
  - `createSeriesCache(client: TelemetryClient): SeriesCache` with
    `series(lap, channel)`, `elapsed(lap)`, `delta(reference, comparison)`,
    `forget(sessionId)`

The delta chart and the chart stack ask for overlapping data, and React will
re-render both on every selection change. Memoising the **promise**, not the
result, means a second ask during the first round trip joins it instead of
starting another.

- [ ] **Step 1: Write the failing test**

Create `src/app/data/__tests__/series.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { createSeriesCache } from '@app/data/series';
import type { TelemetryClient } from '@app/worker/client';

function fakeClient(): TelemetryClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    request: vi.fn((body: { kind: string }) => {
      calls.push(body.kind);
      return Promise.resolve({ kind: 'series', values: Float32Array.from([1, 2]) });
    }) as unknown as TelemetryClient['request'],
    terminate: vi.fn(),
  };
}

const LAP = { sessionId: 's', lapNumber: 3 };

describe('createSeriesCache', () => {
  it('asks the worker once for the same lap and channel', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);

    const [first, second] = await Promise.all([
      cache.series(LAP, 'Ground Speed'),
      cache.series(LAP, 'Ground Speed'),
    ]);

    expect(client.calls).toEqual(['getSeries']);
    expect(first).toBe(second);
  });

  it('keeps different channels apart', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);

    await Promise.all([cache.series(LAP, 'Ground Speed'), cache.series(LAP, 'Brake Pos')]);

    expect(client.calls).toEqual(['getSeries', 'getSeries']);
  });

  it('caches elapsed and delta separately from channel series', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);

    await cache.elapsed(LAP);
    await cache.elapsed(LAP);
    await cache.delta(LAP, { sessionId: 's', lapNumber: 4 });

    expect(client.calls).toEqual(['getElapsed', 'getDelta']);
  });

  it('drops every entry belonging to a forgotten session', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);

    await cache.series(LAP, 'Ground Speed');
    cache.forget('s');
    await cache.series(LAP, 'Ground Speed');

    expect(client.calls).toEqual(['getSeries', 'getSeries']);
  });

  it('does not cache a failure', async () => {
    let attempt = 0;
    const client: TelemetryClient = {
      request: vi.fn(() => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ kind: 'series', values: Float32Array.from([7]) });
      }) as unknown as TelemetryClient['request'],
      terminate: vi.fn(),
    };
    const cache = createSeriesCache(client);

    await expect(cache.series(LAP, 'Ground Speed')).rejects.toThrow('boom');
    await expect(cache.series(LAP, 'Ground Speed')).resolves.toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/app/data/__tests__/series.test.ts`
Expected: FAIL — cannot resolve `@app/data/series`.

- [ ] **Step 3: Implement the cache**

Create `src/app/data/series.ts`:

```ts
import type { LapRef, SessionId } from '@core/index';

import type { TelemetryClient } from '@app/worker/client';

export type SeriesCache = {
  series(lap: LapRef, channel: string): Promise<Float32Array>;
  elapsed(lap: LapRef): Promise<Float32Array>;
  delta(reference: LapRef, comparison: LapRef): Promise<Float32Array>;
  /** Drops every entry that mentions the session, after it has been closed. */
  forget(sessionId: SessionId): void;
};

function lapPart(lap: LapRef): string {
  return `${lap.sessionId} ${lap.lapNumber}`;
}

export function createSeriesCache(client: TelemetryClient): SeriesCache {
  const inFlight = new Map<string, Promise<Float32Array>>();

  // The promise is cached rather than the array, so a second caller arriving
  // during the round trip joins it instead of starting a second one. A
  // rejection is evicted: an error must not be remembered forever.
  const once = (key: string, run: () => Promise<Float32Array>): Promise<Float32Array> => {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const started = run().catch((error: unknown) => {
      inFlight.delete(key);
      throw error;
    });
    inFlight.set(key, started);
    return started;
  };

  return {
    series(lap, channel) {
      return once(`series ${lapPart(lap)} ${channel}`, async () => {
        const result = await client.request({ kind: 'getSeries', lap, channel });
        return result.values;
      });
    },

    elapsed(lap) {
      return once(`elapsed ${lapPart(lap)}`, async () => {
        const result = await client.request({ kind: 'getElapsed', lap });
        return result.values;
      });
    },

    delta(reference, comparison) {
      const key = `delta ${lapPart(reference)} ${lapPart(comparison)}`;
      return once(key, async () => {
        const result = await client.request({ kind: 'getDelta', reference, comparison });
        return result.values;
      });
    },

    forget(sessionId) {
      for (const key of [...inFlight.keys()]) {
        if (key.includes(` ${sessionId} `)) inFlight.delete(key);
      }
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/app/data/__tests__/series.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/data/series.ts src/app/data/__tests__/series.test.ts
git commit -m "feat(app): memoise worker series requests per lap and channel"
```

---

### Task 6: Palette

**Files:**
- Create: `src/app/theme/palette.ts`, `src/app/theme/__tests__/palette.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const palette` with keys `background`, `panel`, `panelHeader`,
    `selectedRow`, `border`, `gridLine`, `textPrimary`, `textSecondary`,
    `numeric`, `active`, `warning`, `critical`
  - `const LAP_SLOTS: readonly string[]` — three colours, fixed order
  - `paletteVariables(): [string, string][]`
  - `applyPalette(target: { setProperty(name: string, value: string): void }): void`

Half the interface is canvas, which cannot read a CSS class, so the palette is
declared in TypeScript and the CSS custom properties are generated from it. A
lap's colour has to be identical in the table and on both charts; two sources
would drift.

- [ ] **Step 1: Write the failing test**

Create `src/app/theme/__tests__/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { applyPalette, LAP_SLOTS, palette, paletteVariables } from '@app/theme/palette';

describe('palette', () => {
  it('names every variable in kebab case under one prefix', () => {
    const names = paletteVariables().map(([name]) => name);

    expect(names).toContain('--ll-panel-header');
    expect(names).toContain('--ll-text-secondary');
    expect(names.every((name) => /^--ll-[a-z0-9-]+$/.test(name))).toBe(true);
  });

  it('exposes one variable per token plus one per lap slot', () => {
    expect(paletteVariables()).toHaveLength(Object.keys(palette).length + LAP_SLOTS.length);
  });

  it('writes every variable onto the target', () => {
    const written = new Map<string, string>();
    applyPalette({ setProperty: (name, value) => written.set(name, value) });

    expect(written.get('--ll-background')).toBe(palette.background);
    expect(written.get('--ll-lap-0')).toBe(LAP_SLOTS[0]);
    expect(written.size).toBe(paletteVariables().length);
  });

  it('keeps the three lap slots distinct and in their documented order', () => {
    expect(LAP_SLOTS).toEqual(['#3987e5', '#d95926', '#b23fa8']);
    expect(new Set(LAP_SLOTS).size).toBe(3);
  });

  it('never reuses a status colour as a lap colour', () => {
    const status = [palette.active, palette.warning, palette.critical];
    for (const slot of LAP_SLOTS) expect(status).not.toContain(slot);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/app/theme/__tests__/palette.test.ts`
Expected: FAIL — cannot resolve `@app/theme/palette`.

- [ ] **Step 3: Implement the palette**

Create `src/app/theme/palette.ts`:

```ts
/**
 * The single source of truth for colour.
 *
 * The DOM reads it as CSS custom properties written by `applyPalette`; the
 * canvas renderers import the object directly. Values are sampled from the
 * Kerbal Space Program 2 interface, panels over black space, as recorded in
 * §8.3 of the design document.
 */
export const palette = {
  background: '#040b19',
  panel: '#06121e',
  panelHeader: '#0e1d28',
  selectedRow: '#1b3346',
  border: '#1e537f',
  /** Derived: the border colour pulled back far enough to stay behind data. */
  gridLine: '#12293c',
  textPrimary: '#ffffff',
  textSecondary: '#bdc4d1',
  numeric: '#f1d37c',
  active: '#00cc51',
  warning: '#ffd600',
  critical: '#f04252',
} as const;

/**
 * Lap identity, by fixed slot: reference, then the two comparisons.
 *
 * Never cycled and never extended. A fourth slot fails the contrast check the
 * palette was validated with — on the reference eight-slot palette the
 * yellow/orange pair scores 10.6 for normal vision against a floor of 15 — and
 * labelling does not repair a pair a reader cannot separate.
 */
export const LAP_SLOTS = ['#3987e5', '#d95926', '#b23fa8'] as const;

const PREFIX = '--ll-';

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function paletteVariables(): [string, string][] {
  const tokens: [string, string][] = Object.entries(palette).map(([key, value]) => [
    `${PREFIX}${kebab(key)}`,
    value,
  ]);
  const slots: [string, string][] = LAP_SLOTS.map((value, index) => [
    `${PREFIX}lap-${index}`,
    value,
  ]);
  return [...tokens, ...slots];
}

export function applyPalette(target: {
  setProperty(name: string, value: string): void;
}): void {
  for (const [name, value] of paletteVariables()) target.setProperty(name, value);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/app/theme/__tests__/palette.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/theme/palette.ts src/app/theme/__tests__/palette.test.ts
git commit -m "feat(app): declare the palette in TypeScript as the single colour source"
```

---

### Task 7: Formatting helpers

**Files:**
- Create: `src/app/format.ts`, `src/app/__tests__/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatLapTime(seconds: number, approximate?: boolean): string`
  - `formatDelta(seconds: number): string`
  - `formatDistance(metres: number): string`

`LapMeta.lapTimeApproximate` is true when the lap time came from the
wrap-to-wrap geometric duration instead of the `Lap Time` channel, which makes
it only as precise as a 10 Hz sample — about 100 ms. Rendering that as
`1:59.874` would be a lie, so it is shown to one decimal with a leading `~`.

- [ ] **Step 1: Write the failing test**

Create `src/app/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatDelta, formatDistance, formatLapTime } from '@app/format';

describe('formatLapTime', () => {
  it('renders minutes, seconds and milliseconds', () => {
    expect(formatLapTime(119.874)).toBe('1:59.874');
    expect(formatLapTime(61.005)).toBe('1:01.005');
    expect(formatLapTime(9.5)).toBe('0:09.500');
  });

  it('drops to one decimal and marks an approximate lap time', () => {
    expect(formatLapTime(121.84, true)).toBe('~2:01.8');
  });

  it('renders a lap over ten minutes without truncating', () => {
    expect(formatLapTime(725.25)).toBe('12:05.250');
  });
});

describe('formatDelta', () => {
  it('always carries an explicit sign', () => {
    expect(formatDelta(0.213)).toBe('+0.213');
    expect(formatDelta(-0.213)).toBe('−0.213');
  });

  it('renders zero without a sign', () => {
    expect(formatDelta(0)).toBe('0.000');
  });
});

describe('formatDistance', () => {
  it('rounds to whole metres', () => {
    expect(formatDistance(1234.6)).toBe('1235 m');
    expect(formatDistance(0)).toBe('0 m');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/app/__tests__/format.test.ts`
Expected: FAIL — cannot resolve `@app/format`.

- [ ] **Step 3: Implement the helpers**

Create `src/app/format.ts`:

```ts
const MINUS = '−';

/**
 * `1:59.874`, or `~2:01.8` when the lap time is the geometric wrap-to-wrap
 * duration rather than the recorded channel: that figure is only as precise as
 * a 10 Hz sample, so three decimals would claim precision it does not have.
 */
export function formatLapTime(seconds: number, approximate = false): string {
  const decimals = approximate ? 1 : 3;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const padded = rest.toFixed(decimals).padStart(decimals + 3, '0');
  return `${approximate ? '~' : ''}${minutes}:${padded}`;
}

/** `+0.213`, `−0.213`, `0.000`. The sign is the whole point. */
export function formatDelta(seconds: number): string {
  const text = Math.abs(seconds).toFixed(3);
  if (seconds > 0) return `+${text}`;
  if (seconds < 0) return `${MINUS}${text}`;
  return text;
}

export function formatDistance(metres: number): string {
  return `${Math.round(metres)} m`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/app/__tests__/format.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/format.ts src/app/__tests__/format.test.ts
git commit -m "feat(app): format lap times, deltas and distances"
```

---

### Task 8: Application store

**Files:**
- Create: `src/app/state/store.ts`, `src/app/state/__tests__/store.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add zustand`)

**Interfaces:**
- Consumes: `type LapRef`, `type SessionId` from `@core/index`;
  `type SessionSummary` from `@worker/protocol`; `LAP_SLOTS` from
  `@app/theme/palette`.
- Produces:
  - `const DEFAULT_CHANNELS: readonly string[]`
  - `lapKey(lap: LapRef): string`
  - `pickDefaultReference(session: SessionSummary): LapRef | null`
  - `type AppState` and `const appStore` (a zustand vanilla store)
  - selectors `slotOf(slots, lap): number`, `drawnLaps(slots): LapRef[]`

The store is built with `zustand/vanilla` so its whole behaviour is testable
in Node without a renderer; React subscribes to it through `useStore`.

Slot 0 is the reference and slots 1 and 2 are the comparisons. Colour is bound
to the slot a lap occupies, and a slot is freed only by the lap that holds it,
so removing one comparison never repaints the other.

- [ ] **Step 1: Add the dependency**

Run: `docker compose run --rm app pnpm add zustand`
Expected: `zustand` appears under `dependencies`. It has no install script, so
`onlyBuiltDependencies: []` does not block it.

- [ ] **Step 2: Write the failing test**

Create `src/app/state/__tests__/store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import {
  appStore,
  drawnLaps,
  lapKey,
  pickDefaultReference,
  slotOf,
} from '@app/state/store';

import type { SessionSummary } from '@worker/protocol';

function lap(number: number, overrides: Partial<SessionSummary['laps'][number]> = {}) {
  return {
    number,
    sourceNumber: number,
    startTime: number * 100,
    endTime: number * 100 + 100,
    lapTime: 100 + number,
    lapTimeApproximate: false,
    valid: true,
    complete: true,
    startIndex: 0,
    endIndex: 1,
    ...overrides,
  };
}

function session(id: string, laps = [lap(0), lap(1), lap(2)]): SessionSummary {
  return {
    id,
    fileName: `${id}.ld`,
    driver: 'Test Driver',
    vehicle: 'test_car',
    venue: 'test-venue',
    eventName: 'Telemetrick',
    sessionName: 'Race',
    recordedAt: '10/03/2026 20:31:38',
    duration: 300,
    channels: [],
    laps,
    grid: { step: 1, length: 1000, points: 1000, approximate: false },
  };
}

beforeEach(() => {
  appStore.getState().reset();
});

describe('pickDefaultReference', () => {
  it('picks the fastest complete valid lap', () => {
    const summary = session('s', [
      lap(0, { lapTime: 90, complete: false }),
      lap(1, { lapTime: 101 }),
      lap(2, { lapTime: 99 }),
      lap(3, { lapTime: 95, valid: false }),
    ]);

    expect(pickDefaultReference(summary)).toEqual({ sessionId: 's', lapNumber: 2 });
  });

  it('returns null when no lap qualifies', () => {
    const summary = session('s', [lap(0, { complete: false })]);
    expect(pickDefaultReference(summary)).toBeNull();
  });
});

describe('appStore', () => {
  it('takes a reference automatically from the first session added', () => {
    appStore.getState().addSession(session('s'));

    expect(appStore.getState().slots[0]).toEqual({ sessionId: 's', lapNumber: 0 });
  });

  it('fills comparison slots in order and refuses a fourth lap', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    state().toggleComparison({ sessionId: 's', lapNumber: 1 });
    state().toggleComparison({ sessionId: 's', lapNumber: 2 });
    state().toggleComparison({ sessionId: 's', lapNumber: 3 });

    expect(drawnLaps(state().slots).map((l) => l.lapNumber)).toEqual([0, 1, 2]);
  });

  it('frees only the slot of the lap that was removed', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    const first = { sessionId: 's', lapNumber: 1 };
    const second = { sessionId: 's', lapNumber: 2 };
    state().toggleComparison(first);
    state().toggleComparison(second);

    const secondSlot = slotOf(state().slots, second);
    state().toggleComparison(first);

    expect(slotOf(state().slots, second)).toBe(secondSlot);
    expect(slotOf(state().slots, first)).toBe(-1);
  });

  it('moves a lap out of its comparison slot when it becomes the reference', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    const promoted = { sessionId: 's', lapNumber: 2 };
    state().toggleComparison(promoted);
    state().setReference(promoted);

    expect(state().slots[0]).toEqual(promoted);
    expect(state().slots.slice(1).filter(Boolean)).toEqual([]);
  });

  it('ignores an attempt to compare the reference with itself', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    state().toggleComparison({ sessionId: 's', lapNumber: 0 });

    expect(drawnLaps(state().slots)).toHaveLength(1);
  });

  it('clears every slot pointing at a removed session', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    state().toggleComparison({ sessionId: 's', lapNumber: 1 });
    state().removeSession('s');

    expect(state().sessions).toHaveLength(0);
    expect(state().slots).toEqual([null, null, null]);
  });

  it('adds and removes chart channels without duplicating them', () => {
    const state = () => appStore.getState();
    const before = state().channels.length;
    state().addChannel('Ground Speed');
    state().addChannel('Ground Speed');
    state().addChannel('Oil Temp');

    expect(state().channels.filter((c) => c === 'Ground Speed')).toHaveLength(1);
    expect(state().channels).toHaveLength(before + 1);

    state().removeChannel('Oil Temp');
    expect(state().channels).toHaveLength(before);
  });

  it('holds the cursor as a single distance in metres', () => {
    appStore.getState().setCursor(1234);
    expect(appStore.getState().cursor).toBe(1234);

    appStore.getState().setCursor(null);
    expect(appStore.getState().cursor).toBeNull();
  });

  it('keys a lap by session and number together', () => {
    expect(lapKey({ sessionId: 'a', lapNumber: 1 })).not.toBe(
      lapKey({ sessionId: 'b', lapNumber: 1 }),
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/app/state/__tests__/store.test.ts`
Expected: FAIL — cannot resolve `@app/state/store`.

- [ ] **Step 4: Implement the store**

Create `src/app/state/store.ts`:

```ts
import { createStore } from 'zustand/vanilla';

import type { LapRef, SessionId } from '@core/index';

import { LAP_SLOTS } from '@app/theme/palette';

import type { SessionSummary } from '@worker/protocol';

/** Slot 0 is the reference; the rest are comparisons. */
export const SLOT_COUNT = LAP_SLOTS.length;

/** The stack the design document opens with, filtered to what a file carries. */
export const DEFAULT_CHANNELS = [
  'Ground Speed',
  'Throttle Pos',
  'Brake Pos',
  'Steering Angle',
  'Gear',
  'Engine RPM',
] as const;

export function lapKey(lap: LapRef): string {
  return `${lap.sessionId} ${lap.lapNumber}`;
}

function sameLap(a: LapRef | null, b: LapRef): boolean {
  return a !== null && a.sessionId === b.sessionId && a.lapNumber === b.lapNumber;
}

export function slotOf(slots: readonly (LapRef | null)[], lap: LapRef): number {
  return slots.findIndex((slot) => sameLap(slot, lap));
}

export function drawnLaps(slots: readonly (LapRef | null)[]): LapRef[] {
  return slots.filter((slot): slot is LapRef => slot !== null);
}

/**
 * The fastest lap that is both complete and valid. A partial lap is never
 * offered as the reference — the first and last lap of a session usually are
 * partial, and a delta against half a lap is meaningless.
 */
export function pickDefaultReference(session: SessionSummary): LapRef | null {
  let best: SessionSummary['laps'][number] | undefined;
  for (const lap of session.laps) {
    if (!lap.complete || !lap.valid) continue;
    if (!best || lap.lapTime < best.lapTime) best = lap;
  }
  return best ? { sessionId: session.id, lapNumber: best.number } : null;
}

export type AppState = {
  sessions: SessionSummary[];
  slots: (LapRef | null)[];
  /** Distance in metres, shared by every panel. Null when the pointer is out. */
  cursor: number | null;
  channels: string[];

  addSession(session: SessionSummary): void;
  removeSession(sessionId: SessionId): void;
  setReference(lap: LapRef): void;
  toggleComparison(lap: LapRef): void;
  setCursor(distance: number | null): void;
  addChannel(name: string): void;
  removeChannel(name: string): void;
  reset(): void;
};

const initial = (): Pick<AppState, 'sessions' | 'slots' | 'cursor' | 'channels'> => ({
  sessions: [],
  slots: Array.from({ length: SLOT_COUNT }, () => null),
  cursor: null,
  channels: [...DEFAULT_CHANNELS],
});

export const appStore = createStore<AppState>()((set, get) => ({
  ...initial(),

  addSession(session) {
    set((state) => ({ sessions: [...state.sessions, session] }));
    if (get().slots[0] === null) {
      const reference = pickDefaultReference(session);
      if (reference) get().setReference(reference);
    }
  },

  removeSession(sessionId) {
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== sessionId),
      slots: state.slots.map((slot) => (slot?.sessionId === sessionId ? null : slot)),
    }));
  },

  setReference(lap) {
    set((state) => {
      const slots = state.slots.map((slot) => (sameLap(slot, lap) ? null : slot));
      slots[0] = lap;
      return { slots };
    });
  },

  toggleComparison(lap) {
    set((state) => {
      if (sameLap(state.slots[0], lap)) return state;

      const slots = [...state.slots];
      const held = slotOf(slots, lap);
      if (held > 0) {
        slots[held] = null;
        return { slots };
      }

      const free = slots.findIndex((slot, index) => index > 0 && slot === null);
      if (free === -1) return state;
      slots[free] = lap;
      return { slots };
    });
  },

  setCursor(distance) {
    set({ cursor: distance });
  },

  addChannel(name) {
    set((state) =>
      state.channels.includes(name) ? state : { channels: [...state.channels, name] },
    );
  },

  removeChannel(name) {
    set((state) => ({ channels: state.channels.filter((channel) => channel !== name) }));
  },

  reset() {
    set(initial());
  },
}));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/app/state/__tests__/store.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/state/store.ts src/app/state/__tests__/store.test.ts
git commit -m "feat(app): hold sessions, lap slots and the cursor in a zustand store"
```

---

### Task 9: Chart data and uPlot options

**Files:**
- Create: `src/app/charts/data.ts`, `src/app/charts/options.ts`,
  `src/app/charts/__tests__/data.test.ts`, `src/app/charts/__tests__/options.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add uplot`),
  `tsconfig.base.json`

**Interfaces:**
- Consumes: `type DistanceGrid` from `@core/index`; `palette` from
  `@app/theme/palette`.
- Produces:
  - `gridNodes(grid: DistanceGrid): Float64Array`
  - `type LineSpec = { label: string; stroke: string }`
  - `const SYNC_KEY: string`
  - `deltaChartOptions(params: ChartParams): uPlot.Options`
  - `stackChartOptions(params: ChartParams & { unit: string; discrete: boolean }): uPlot.Options`
  - `type ChartParams = { width: number; height: number; lines: LineSpec[] }`

uPlot ships its types as `export = uPlot`, so a default import of it needs
`esModuleInterop`. Its runtime ESM build has a real default export, so only the
compiler is affected.

- [ ] **Step 1: Add the dependency and the compiler flag**

Run: `docker compose run --rm app pnpm add uplot`

In `tsconfig.base.json`, add under `// Bundler mode`:

```json
    "esModuleInterop": true,
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/charts/__tests__/data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { gridNodes } from '@app/charts/data';

describe('gridNodes', () => {
  it('gives one node per grid point, starting at zero', () => {
    const nodes = gridNodes({ step: 1, length: 5, points: 5, approximate: false });

    expect([...nodes]).toEqual([0, 1, 2, 3, 4]);
  });

  it('honours a step other than one metre', () => {
    const nodes = gridNodes({ step: 2.5, length: 10, points: 4, approximate: false });

    expect([...nodes]).toEqual([0, 2.5, 5, 7.5]);
  });
});
```

Create `src/app/charts/__tests__/options.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { deltaChartOptions, stackChartOptions, SYNC_KEY } from '@app/charts/options';
import { LAP_SLOTS } from '@app/theme/palette';

const LINES = [
  { label: 'Lap 3', stroke: LAP_SLOTS[1] },
  { label: 'Lap 7', stroke: LAP_SLOTS[2] },
];

describe('deltaChartOptions', () => {
  it('puts the x series first and one series per line after it', () => {
    const options = deltaChartOptions({ width: 800, height: 200, lines: LINES });

    expect(options.series).toHaveLength(LINES.length + 1);
    expect(options.series[1].label).toBe('Lap 3');
    expect(options.series[1].stroke).toBe(LAP_SLOTS[1]);
    expect(options.series[2].stroke).toBe(LAP_SLOTS[2]);
  });

  it('draws data lines at two pixels', () => {
    const options = deltaChartOptions({ width: 800, height: 200, lines: LINES });

    expect(options.series[1].width).toBe(2);
  });

  it('joins the shared cursor on the x scale only', () => {
    const options = deltaChartOptions({ width: 800, height: 200, lines: LINES });

    expect(options.cursor?.sync?.key).toBe(SYNC_KEY);
    expect(options.cursor?.sync?.scales).toEqual(['x', null]);
  });

  it('sizes itself to what it was given', () => {
    const options = deltaChartOptions({ width: 640, height: 180, lines: LINES });

    expect(options.width).toBe(640);
    expect(options.height).toBe(180);
  });
});

describe('stackChartOptions', () => {
  it('labels the y axis with the channel unit', () => {
    const options = stackChartOptions({
      width: 800,
      height: 120,
      lines: LINES,
      unit: 'km/h',
      discrete: false,
    });

    expect(options.axes?.[1]?.label).toBe('km/h');
  });

  it('steps a discrete channel instead of interpolating it', () => {
    const options = stackChartOptions({
      width: 800,
      height: 120,
      lines: LINES,
      unit: '',
      discrete: true,
    });

    expect(options.series[1].paths).toBeTypeOf('function');
  });

  it('shares the cursor with the delta chart', () => {
    const options = stackChartOptions({
      width: 800,
      height: 120,
      lines: LINES,
      unit: '',
      discrete: false,
    });

    expect(options.cursor?.sync?.key).toBe(SYNC_KEY);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm app pnpm test src/app/charts`
Expected: FAIL — cannot resolve `@app/charts/data` or `@app/charts/options`.

- [ ] **Step 4: Implement the builders**

Create `src/app/charts/data.ts`:

```ts
import type { DistanceGrid } from '@core/index';

/**
 * The x array every chart shares: distance in metres at each grid node.
 *
 * Float64 rather than Float32 because uPlot compares x values to find the
 * cursor's nearest index, and a Float32 rounding of 5754 would put the cursor
 * on the wrong node near the end of a long lap.
 */
export function gridNodes(grid: DistanceGrid): Float64Array {
  const nodes = new Float64Array(grid.points);
  for (let i = 0; i < grid.points; i++) nodes[i] = i * grid.step;
  return nodes;
}
```

Create `src/app/charts/options.ts`:

```ts
import uPlot from 'uplot';

import { palette } from '@app/theme/palette';

/** Every chart on screen shares this cursor. */
export const SYNC_KEY = 'lapledger-distance';

export type LineSpec = { label: string; stroke: string };

export type ChartParams = {
  width: number;
  height: number;
  lines: LineSpec[];
};

export type StackChartParams = ChartParams & {
  unit: string;
  /** Integer channels such as Gear are drawn as steps, never interpolated. */
  discrete: boolean;
};

const stepped = uPlot.paths.stepped?.({ align: 1 });

function base(params: ChartParams): Omit<uPlot.Options, 'series'> {
  return {
    width: params.width,
    height: params.height,
    cursor: {
      // Only x is shared: two channels on different scales must keep their own
      // y, or a zoom on one would squash the other.
      sync: { key: SYNC_KEY, scales: ['x', null] },
      drag: { x: true, y: false, setScale: true },
    },
    legend: { live: true },
    axes: [
      {
        stroke: palette.textSecondary,
        grid: { stroke: palette.gridLine, width: 1 },
        ticks: { stroke: palette.gridLine, width: 1 },
      },
      {
        stroke: palette.textSecondary,
        grid: { stroke: palette.gridLine, width: 1 },
        ticks: { stroke: palette.gridLine, width: 1 },
      },
    ],
  };
}

function lineSeries(line: LineSpec, paths?: uPlot.Series.PathBuilder): uPlot.Series {
  return {
    label: line.label,
    stroke: line.stroke,
    width: 2,
    ...(paths ? { paths } : {}),
  };
}

export function deltaChartOptions(params: ChartParams): uPlot.Options {
  return {
    ...base(params),
    series: [{ label: 'Distance' }, ...params.lines.map((line) => lineSeries(line))],
  };
}

export function stackChartOptions(params: StackChartParams): uPlot.Options {
  const options = base(params);
  const axes = [...(options.axes ?? [])];
  axes[1] = { ...axes[1], label: params.unit };

  return {
    ...options,
    axes,
    series: [
      { label: 'Distance' },
      ...params.lines.map((line) =>
        lineSeries(line, params.discrete && stepped ? stepped : undefined),
      ),
    ],
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm app pnpm test src/app/charts`
Expected: PASS, 9 tests.

Run: `make check`
Expected: exit 0. Without `esModuleInterop`, `import uPlot from 'uplot'`
fails with TS1259 — that flag is why it was added in step 1.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.base.json src/app/charts
git commit -m "feat(app): build uPlot options for the delta chart and the channel stack"
```

---

### Task 10: The uPlot React wrapper

**Files:**
- Create: `src/app/charts/UPlotChart.tsx`

**Interfaces:**
- Consumes: `uPlot`, `appStore`, `SYNC_KEY`.
- Produces: `function UPlotChart(props: { options: uPlot.Options; data: uPlot.AlignedData; recreateKey: string }): JSX.Element`

uPlot is imperative: it owns a DOM subtree and must be destroyed by hand.
`recreateKey` names the shape of the chart — how many series, in what colours —
so the effect can rebuild the instance when the shape changes and merely call
`setData` when only the numbers did. Rebuilding on every data change would
drop the zoom the user just made.

There is no test here: it is DOM glue, and the repository has no browser test
environment. Everything it composes — the options, the data, the store — is
tested on its own, and Task 15 verifies it on the real recording.

- [ ] **Step 1: Write the component**

Create `src/app/charts/UPlotChart.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';

import 'uplot/dist/uPlot.min.css';

import { appStore } from '@app/state/store';

export type UPlotChartProps = {
  options: uPlot.Options;
  data: uPlot.AlignedData;
  /**
   * Identifies the chart's shape — series count, labels and colours. A change
   * rebuilds the instance; an unchanged key only pushes new data, which is
   * what keeps a zoom alive while laps are being switched.
   */
  recreateKey: string;
};

/**
 * Remounts the instance below whenever the chart's shape changes, so that
 * component can build uPlot once, on mount, from the props it was given. The
 * alternative — reading the current props out of a ref — would mean writing to
 * that ref during render, which the React Compiler lint rules reject.
 */
export function UPlotChart({ options, data, recreateKey }: UPlotChartProps) {
  return <UPlotInstance key={recreateKey} options={options} data={data} />;
}

function UPlotInstance({ options, data }: { options: uPlot.Options; data: uPlot.AlignedData }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const instance = new uPlot(
      {
        ...options,
        width: element.clientWidth || options.width,
        hooks: {
          setCursor: [
            (self) => {
              const index = self.cursor.idx;
              const distance =
                index === null || index === undefined ? null : (self.data[0][index] ?? null);
              appStore.getState().setCursor(distance);
            },
          ],
        },
      },
      data,
      element,
    );
    chart.current = instance;

    const observer = new ResizeObserver(([entry]) => {
      instance.setSize({
        width: Math.max(1, Math.round(entry.contentRect.width)),
        height: options.height,
      });
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      instance.destroy();
      chart.current = null;
    };
    // Built once per mount: `options` and `data` are the values this instance
    // is for, and the parent remounts it through `key` when they change shape.
    // Listing them here would rebuild the chart on every data update and throw
    // away the zoom the user just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chart.current?.setData(data);
  }, [data]);

  return <div ref={host} className="chart-host" />;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `make check`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/charts/UPlotChart.tsx
git commit -m "feat(app): wrap uPlot in a React component with a shared cursor"
```

---

### Task 11: File drop and the application shell

**Files:**
- Create: `src/app/panels/pairing.ts`, `src/app/panels/__tests__/pairing.test.ts`,
  `src/app/panels/FileDrop.tsx`, `src/app/data/telemetry.ts`, `src/app/app.css`
- Modify: `src/app/App.tsx`, `src/app/main.tsx`, `index.html`

**Interfaces:**
- Consumes: `spawnTelemetryWorker`, `createSeriesCache`, `appStore`,
  `applyPalette`.
- Produces:
  - `pairTelemetryFiles(names: string[]): FilePair[]` where
    `type FilePair = { ld: number; ldx?: number }`
  - `getTelemetry(): { client: TelemetryClient; cache: SeriesCache }`
  - `function FileDrop(): JSX.Element`

After this task the application opens a real recording and lists what it
found. The panels arrive in the three tasks after it.

- [ ] **Step 1: Write the failing test**

Create `src/app/panels/__tests__/pairing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { pairTelemetryFiles } from '@app/panels/pairing';

describe('pairTelemetryFiles', () => {
  it('pairs an .ldx with the .ld of the same base name', () => {
    expect(pairTelemetryFiles(['run.ld', 'run.ldx'])).toEqual([{ ld: 0, ldx: 1 }]);
  });

  it('pairs regardless of the order they were dropped in', () => {
    expect(pairTelemetryFiles(['run.ldx', 'run.ld'])).toEqual([{ ld: 1, ldx: 0 }]);
  });

  it('ignores case in the extension', () => {
    expect(pairTelemetryFiles(['RUN.LD', 'run.LDX'])).toEqual([{ ld: 0, ldx: 1 }]);
  });

  it('accepts an .ld with no .ldx beside it', () => {
    expect(pairTelemetryFiles(['run.ld'])).toEqual([{ ld: 0 }]);
  });

  it('keeps several recordings apart', () => {
    expect(pairTelemetryFiles(['a.ld', 'b.ld', 'b.ldx'])).toEqual([
      { ld: 0 },
      { ld: 1, ldx: 2 },
    ]);
  });

  it('drops files that are neither .ld nor .ldx', () => {
    expect(pairTelemetryFiles(['notes.txt', 'run.ld'])).toEqual([{ ld: 1 }]);
  });

  it('ignores an .ldx with no recording to belong to', () => {
    expect(pairTelemetryFiles(['orphan.ldx'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/app/panels/__tests__/pairing.test.ts`
Expected: FAIL — cannot resolve `@app/panels/pairing`.

- [ ] **Step 3: Implement the pairing rule**

Create `src/app/panels/pairing.ts`:

```ts
export type FilePair = { ld: number; ldx?: number };

function split(name: string): { base: string; extension: string } {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return { base: name.toLowerCase(), extension: '' };
  return { base: name.slice(0, dot).toLowerCase(), extension: name.slice(dot + 1).toLowerCase() };
}

/**
 * Groups dropped file names into recordings.
 *
 * The `.ldx` is optional — laps can be derived without it — so an unmatched
 * `.ld` is still a recording, while an unmatched `.ldx` is nothing at all.
 */
export function pairTelemetryFiles(names: string[]): FilePair[] {
  const sidecars = new Map<string, number>();
  names.forEach((name, index) => {
    const { base, extension } = split(name);
    if (extension === 'ldx') sidecars.set(base, index);
  });

  const pairs: FilePair[] = [];
  names.forEach((name, index) => {
    const { base, extension } = split(name);
    if (extension !== 'ld') return;
    const ldx = sidecars.get(base);
    pairs.push(ldx === undefined ? { ld: index } : { ld: index, ldx });
  });

  return pairs;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/app/panels/__tests__/pairing.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire up the worker singleton**

Create `src/app/data/telemetry.ts`:

```ts
import { createSeriesCache, type SeriesCache } from '@app/data/series';
import { spawnTelemetryWorker, type TelemetryClient } from '@app/worker/client';

export type Telemetry = { client: TelemetryClient; cache: SeriesCache };

let telemetry: Telemetry | null = null;

/**
 * One worker per tab, spawned on first use.
 *
 * A module singleton rather than React context: the worker outlives every
 * component, nothing renders differently because of it, and a context would
 * only add a provider for a value that never changes.
 */
export function getTelemetry(): Telemetry {
  if (!telemetry) {
    const client = spawnTelemetryWorker();
    telemetry = { client, cache: createSeriesCache(client) };
  }
  return telemetry;
}
```

- [ ] **Step 6: Write the drop target**

Create `src/app/panels/FileDrop.tsx`:

```tsx
import { useCallback, useState } from 'react';

import { getTelemetry } from '@app/data/telemetry';
import { appStore } from '@app/state/store';

import { pairTelemetryFiles } from './pairing';

async function openFiles(files: File[]): Promise<void> {
  const { client } = getTelemetry();

  for (const pair of pairTelemetryFiles(files.map((file) => file.name))) {
    const ld = files[pair.ld];
    const bytes = await ld.arrayBuffer();
    const ldxText = pair.ldx === undefined ? undefined : await files[pair.ldx].text();

    // The buffer is transferred, not cloned: 28 MB copied per file would be
    // a visible pause, and the main thread has no further use for the bytes.
    const result = await client.request(
      {
        kind: 'openSession',
        fileName: ld.name,
        bytes,
        ...(ldxText === undefined ? {} : { ldxText }),
      },
      [bytes],
    );
    appStore.getState().addSession(result.session);
  }
}

export function FileDrop() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((files: File[]) => {
    setBusy(true);
    setError(null);
    openFiles(files)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  }, []);

  return (
    <div
      className="file-drop"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        load([...event.dataTransfer.files]);
      }}
    >
      <label>
        {busy ? 'Reading…' : 'Drop .ld and .ldx here, or choose files'}
        <input
          type="file"
          multiple
          accept=".ld,.ldx"
          onChange={(event) => load([...(event.target.files ?? [])])}
        />
      </label>
      {error !== null && <p className="error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 7: Lay out the shell**

Replace `src/app/App.tsx`:

```tsx
import { FileDrop } from './panels/FileDrop';

export default function App() {
  return (
    <div className="layout">
      <header className="titlebar">
        <span className="product">LapLedger</span>
        <FileDrop />
      </header>
      <aside className="panel area-laps">
        <h2>Laps</h2>
      </aside>
      <section className="panel area-delta">
        <h2>Delta</h2>
      </section>
      <section className="panel area-channels">
        <h2>Channels</h2>
      </section>
    </div>
  );
}
```

Create `src/app/app.css`:

```css
:root {
  color-scheme: dark;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}

body {
  margin: 0;
  background: var(--ll-background);
  color: var(--ll-text-primary);
}

.layout {
  display: grid;
  grid-template-columns: minmax(260px, 22%) 1fr;
  grid-template-rows: auto minmax(180px, 30%) 1fr;
  grid-template-areas:
    'title title'
    'laps delta'
    'laps channels';
  gap: 6px;
  padding: 6px;
  height: 100vh;
  box-sizing: border-box;
}

.titlebar {
  grid-area: title;
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--ll-panel-header);
  border: 1px solid var(--ll-border);
  padding: 6px 10px;
}

.product {
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.panel {
  background: var(--ll-panel);
  border: 1px solid var(--ll-border);
  overflow: auto;
  min-height: 0;
}

.panel > h2 {
  margin: 0;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ll-text-secondary);
  background: var(--ll-panel-header);
  border-bottom: 1px solid var(--ll-border);
}

.area-laps { grid-area: laps; }
.area-delta { grid-area: delta; }
.area-channels { grid-area: channels; }

.file-drop input { margin-left: 8px; }
.file-drop .error { color: var(--ll-critical); margin: 4px 0 0; }

.chart-host { width: 100%; }

.hint { color: var(--ll-text-secondary); padding: 8px; }
.error { color: var(--ll-critical); padding: 8px; }
```

- [ ] **Step 8: Apply the palette at start-up**

Replace `src/app/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { applyPalette } from '@app/theme/palette';

import App from './App.tsx';
import './app.css';

applyPalette(document.documentElement.style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

In `index.html`, change the title:

```html
    <title>LapLedger</title>
```

- [ ] **Step 9: Verify**

Run: `make test`
Expected: PASS — the new pairing tests included.

Run: `make check`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/app/panels/pairing.ts src/app/panels/__tests__/pairing.test.ts \
  src/app/panels/FileDrop.tsx src/app/data/telemetry.ts src/app/app.css \
  src/app/App.tsx src/app/main.tsx index.html
git commit -m "feat(app): open dropped recordings in the worker and lay out the shell"
```

---

### Task 12: LapTable

**Files:**
- Create: `src/app/panels/lapRows.ts`, `src/app/panels/__tests__/lapRows.test.ts`,
  `src/app/panels/LapTable.tsx`
- Modify: `src/app/App.tsx`, `src/app/app.css`

**Interfaces:**
- Consumes: `appStore`, `slotOf`, `formatLapTime`, `formatDelta`, `LAP_SLOTS`,
  `getTelemetry`.
- Produces:
  - `type LapRow = { lap: LapMeta; gapToBest: number | null }`
  - `buildLapRows(laps: LapMeta[]): LapRow[]`
  - `function LapTable(): JSX.Element`

The gap column compares each lap with the session's fastest complete valid lap,
which is also what `pickDefaultReference` chooses, so the reference row is the
one showing no gap.

- [ ] **Step 1: Write the failing test**

Create `src/app/panels/__tests__/lapRows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildLapRows } from '@app/panels/lapRows';

import type { LapMeta } from '@core/index';

function lap(number: number, overrides: Partial<LapMeta> = {}): LapMeta {
  return {
    number,
    sourceNumber: number,
    startTime: 0,
    endTime: 100,
    lapTime: 100,
    lapTimeApproximate: false,
    valid: true,
    complete: true,
    startIndex: 0,
    endIndex: 1,
    ...overrides,
  };
}

describe('buildLapRows', () => {
  it('measures every lap against the fastest complete valid one', () => {
    const rows = buildLapRows([lap(0, { lapTime: 101 }), lap(1, { lapTime: 99 })]);

    expect(rows[0].gapToBest).toBeCloseTo(2, 6);
    expect(rows[1].gapToBest).toBeNull();
  });

  it('never takes the best lap from a partial or invalid one', () => {
    const rows = buildLapRows([
      lap(0, { lapTime: 50, complete: false }),
      lap(1, { lapTime: 60, valid: false }),
      lap(2, { lapTime: 100 }),
    ]);

    expect(rows[2].gapToBest).toBeNull();
    expect(rows[0].gapToBest).toBeCloseTo(-50, 6);
  });

  it('leaves every gap empty when no lap qualifies', () => {
    const rows = buildLapRows([lap(0, { complete: false })]);

    expect(rows[0].gapToBest).toBeNull();
  });

  it('keeps the laps in the order it was given them', () => {
    const rows = buildLapRows([lap(5), lap(2), lap(9)]);

    expect(rows.map((row) => row.lap.number)).toEqual([5, 2, 9]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/app/panels/__tests__/lapRows.test.ts`
Expected: FAIL — cannot resolve `@app/panels/lapRows`.

- [ ] **Step 3: Implement the rows**

Create `src/app/panels/lapRows.ts`:

```ts
import type { LapMeta } from '@core/index';

export type LapRow = {
  lap: LapMeta;
  /** Seconds behind the session's best lap; null for the best lap itself. */
  gapToBest: number | null;
};

export function buildLapRows(laps: LapMeta[]): LapRow[] {
  let best: LapMeta | undefined;
  for (const lap of laps) {
    if (!lap.complete || !lap.valid) continue;
    if (!best || lap.lapTime < best.lapTime) best = lap;
  }

  return laps.map((lap) => ({
    lap,
    gapToBest: !best || lap.number === best.number ? null : lap.lapTime - best.lapTime,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/app/panels/__tests__/lapRows.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the panel**

Create `src/app/panels/LapTable.tsx`:

```tsx
import { useStore } from 'zustand';

import type { SessionId } from '@core/index';

import { getTelemetry } from '@app/data/telemetry';
import { formatDelta, formatLapTime } from '@app/format';
import { appStore, slotOf } from '@app/state/store';
import { LAP_SLOTS } from '@app/theme/palette';

import { buildLapRows } from './lapRows';

function closeSession(sessionId: SessionId): void {
  const { client, cache } = getTelemetry();
  appStore.getState().removeSession(sessionId);
  cache.forget(sessionId);
  void client.request({ kind: 'closeSession', sessionId });
}

export function LapTable() {
  const sessions = useStore(appStore, (state) => state.sessions);
  const slots = useStore(appStore, (state) => state.slots);
  const { setReference, toggleComparison } = appStore.getState();

  if (sessions.length === 0) return <p className="hint">No recording loaded.</p>;

  return (
    <div className="lap-table">
      {sessions.map((session) => (
        <section key={session.id}>
          <header className="session-head">
            <span>{session.fileName}</span>
            <span className="secondary">
              {session.venue} · {session.laps.length} laps
            </span>
            <button type="button" onClick={() => closeSession(session.id)}>
              close
            </button>
          </header>
          <table>
            <tbody>
              {buildLapRows(session.laps).map(({ lap, gapToBest }) => {
                const ref = { sessionId: session.id, lapNumber: lap.number };
                const slot = slotOf(slots, ref);
                return (
                  <tr key={lap.number} className={slot === 0 ? 'reference' : undefined}>
                    <td className="chip">
                      {slot >= 0 && (
                        <span style={{ background: LAP_SLOTS[slot] }} className="swatch" />
                      )}
                    </td>
                    <td>{lap.sourceNumber}</td>
                    <td className="numeric">
                      {formatLapTime(lap.lapTime, lap.lapTimeApproximate)}
                    </td>
                    <td className="numeric gap">
                      {gapToBest === null ? '' : formatDelta(gapToBest)}
                    </td>
                    <td className="flags">
                      {!lap.complete && <abbr title="partial lap">part</abbr>}
                      {!lap.valid && <abbr title="lap invalidated">inv</abbr>}
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={!lap.complete || slot === 0}
                        onClick={() => setReference(ref)}
                      >
                        ref
                      </button>
                      <button
                        type="button"
                        disabled={slot === 0}
                        onClick={() => toggleComparison(ref)}
                      >
                        {slot > 0 ? 'drop' : 'cmp'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Put it on screen**

In `src/app/App.tsx`, replace the laps panel body:

```tsx
      <aside className="panel area-laps">
        <h2>Laps</h2>
        <LapTable />
      </aside>
```

and add the import beside the existing one:

```tsx
import { LapTable } from './panels/LapTable';
```

Append to `src/app/app.css`:

```css
.lap-table table { width: 100%; border-collapse: collapse; }
.lap-table td { padding: 1px 4px; white-space: nowrap; }
.lap-table tr.reference { background: var(--ll-selected-row); }
.lap-table .numeric { color: var(--ll-numeric); text-align: right; }
.lap-table .gap { color: var(--ll-text-secondary); }
.lap-table .flags abbr { color: var(--ll-warning); margin-right: 4px; }
.lap-table .swatch { display: inline-block; width: 8px; height: 8px; }

.session-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--ll-border);
}

.secondary { color: var(--ll-text-secondary); }
```

- [ ] **Step 7: Verify**

Run: `make test` — PASS.
Run: `make check` — exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/panels/lapRows.ts src/app/panels/__tests__/lapRows.test.ts \
  src/app/panels/LapTable.tsx src/app/App.tsx src/app/app.css
git commit -m "feat(app): list laps with gaps and reference selection"
```

---

### Task 13: DeltaChart

**Files:**
- Create: `src/app/data/useArrays.ts`, `src/app/panels/DeltaChart.tsx`
- Modify: `src/app/App.tsx`, `src/app/app.css`

**Interfaces:**
- Consumes: `gridNodes`, `deltaChartOptions`, `UPlotChart`, `getTelemetry`,
  `appStore`, `lapKey`, `formatDelta`, `formatDistance`, `LAP_SLOTS`.
- Produces:
  - `useArrays(key: string, load: () => Promise<Float32Array[]>): { arrays: Float32Array[] | null; error: string | null }`
  - `function DeltaChart(): JSX.Element`

This is the panel the application exists for. The zero line is the reference
lap; a line going up means the comparison lap is losing time there.

- [ ] **Step 1: Write the loading hook**

Create `src/app/data/useArrays.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

export type Loaded = { arrays: Float32Array[] | null; error: string | null };

/**
 * Runs an async load whenever `key` changes and drops a result that arrived
 * after the selection moved on.
 *
 * `key` rather than the loader itself is the dependency: the loader is a fresh
 * closure on every render, and depending on it would refetch forever.
 */
export function useArrays(key: string, load: () => Promise<Float32Array[]>): Loaded {
  const loader = useRef(load);
  const [state, setState] = useState<Loaded>({ arrays: null, error: null });

  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    let live = true;
    setState({ arrays: null, error: null });

    loader
      .current()
      .then((arrays) => {
        if (live) setState({ arrays, error: null });
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setState({ arrays: null, error: cause instanceof Error ? cause.message : String(cause) });
      });

    return () => {
      live = false;
    };
  }, [key]);

  return state;
}
```

- [ ] **Step 2: Write the panel**

Create `src/app/panels/DeltaChart.tsx`:

```tsx
import { useStore } from 'zustand';

import type { LapRef } from '@core/index';

import { gridNodes } from '@app/charts/data';
import { deltaChartOptions } from '@app/charts/options';
import { UPlotChart } from '@app/charts/UPlotChart';
import { getTelemetry } from '@app/data/telemetry';
import { useArrays } from '@app/data/useArrays';
import { formatDelta, formatDistance } from '@app/format';
import { appStore, lapKey } from '@app/state/store';
import { LAP_SLOTS } from '@app/theme/palette';

const HEIGHT = 200;

type Drawn = { lap: LapRef; slot: number };

export function DeltaChart() {
  const slots = useStore(appStore, (state) => state.slots);
  const sessions = useStore(appStore, (state) => state.sessions);
  const cursor = useStore(appStore, (state) => state.cursor);

  const reference = slots[0];
  const comparisons: Drawn[] = slots
    .map((lap, slot) => ({ lap, slot }))
    .filter((entry): entry is Drawn => entry.slot > 0 && entry.lap !== null);

  const key = [reference ? lapKey(reference) : 'none', ...comparisons.map((c) => lapKey(c.lap))]
    .join('|');

  const { arrays, error } = useArrays(key, () => {
    if (!reference) return Promise.resolve([]);
    const { cache } = getTelemetry();
    return Promise.all(comparisons.map((c) => cache.delta(reference, c.lap)));
  });

  const session = sessions.find((entry) => entry.id === reference?.sessionId);
  if (!reference || !session) return <p className="hint">Load a recording to see the delta.</p>;
  if (comparisons.length === 0) {
    return <p className="hint">Mark a lap as “cmp” to compare it with the reference.</p>;
  }
  if (error !== null) return <p className="error">{error}</p>;
  if (arrays === null) return <p className="hint">Computing…</p>;

  const options = deltaChartOptions({
    width: 800,
    height: HEIGHT,
    lines: comparisons.map((c) => ({
      label: `Lap ${c.lap.lapNumber}`,
      stroke: LAP_SLOTS[c.slot],
    })),
  });

  const index = cursor === null ? null : Math.round(cursor / session.grid.step);

  return (
    <div className="delta">
      <div className="readout">
        <span className="secondary">
          {cursor === null ? '—' : formatDistance(cursor)}
        </span>
        {comparisons.map((c, line) => (
          <span key={lapKey(c.lap)} style={{ color: LAP_SLOTS[c.slot] }}>
            Lap {c.lap.lapNumber}{' '}
            <span className="numeric">
              {index === null || !arrays[line] || arrays[line][index] === undefined
                ? '—'
                : formatDelta(arrays[line][index])}
            </span>
          </span>
        ))}
      </div>
      <UPlotChart
        recreateKey={key}
        options={options}
        data={[gridNodes(session.grid), ...arrays]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Put it on screen**

In `src/app/App.tsx`:

```tsx
      <section className="panel area-delta">
        <h2>Delta</h2>
        <DeltaChart />
      </section>
```

with `import { DeltaChart } from './panels/DeltaChart';` beside the others.

Append to `src/app/app.css`:

```css
.readout {
  display: flex;
  gap: 16px;
  padding: 3px 8px;
  border-bottom: 1px solid var(--ll-border);
}

.readout .numeric { color: var(--ll-numeric); }
```

- [ ] **Step 4: Verify**

Run: `make test` — PASS, nothing new but nothing broken.
Run: `make check` — exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/data/useArrays.ts src/app/panels/DeltaChart.tsx src/app/App.tsx src/app/app.css
git commit -m "feat(app): draw the accumulated time delta against distance"
```

---

### Task 14: ChartStack and the channel picker

**Files:**
- Create: `src/app/panels/channels.ts`, `src/app/panels/__tests__/channels.test.ts`,
  `src/app/panels/ChartStack.tsx`
- Modify: `src/app/App.tsx`, `src/app/app.css`

**Interfaces:**
- Consumes: `stackChartOptions`, `gridNodes`, `UPlotChart`, `useArrays`,
  `getTelemetry`, `appStore`, `drawnLaps`, `LAP_SLOTS`.
- Produces:
  - `presentChannels(available: ChannelMeta[], wanted: readonly string[]): string[]`
  - `channelInfo(available: ChannelMeta[], name: string): { unit: string; discrete: boolean }`
  - `function ChartStack(): JSX.Element`

The default stack is the six channels the design document names, but a
recording need not carry all six, and the picker must reach all 186. A native
`<datalist>` gives search over the full list without a combobox library.

- [ ] **Step 1: Write the failing test**

Create `src/app/panels/__tests__/channels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { channelInfo, presentChannels } from '@app/panels/channels';

import type { ChannelMeta } from '@core/index';

const AVAILABLE: ChannelMeta[] = [
  { name: 'Ground Speed', shortName: 'Gnd Spd', unit: 'km/h', freq: 30, count: 10, discrete: false },
  { name: 'Gear', shortName: 'Gear', unit: '', freq: 30, count: 10, discrete: true },
];

describe('presentChannels', () => {
  it('keeps only the wanted channels the recording carries', () => {
    expect(presentChannels(AVAILABLE, ['Ground Speed', 'Oil Temp', 'Gear'])).toEqual([
      'Ground Speed',
      'Gear',
    ]);
  });

  it('keeps the wanted order rather than the file order', () => {
    expect(presentChannels(AVAILABLE, ['Gear', 'Ground Speed'])).toEqual([
      'Gear',
      'Ground Speed',
    ]);
  });
});

describe('channelInfo', () => {
  it('reports the unit and whether the channel is discrete', () => {
    expect(channelInfo(AVAILABLE, 'Gear')).toEqual({ unit: '', discrete: true });
    expect(channelInfo(AVAILABLE, 'Ground Speed')).toEqual({ unit: 'km/h', discrete: false });
  });

  it('falls back to a continuous unitless channel when the name is unknown', () => {
    expect(channelInfo(AVAILABLE, 'Nope')).toEqual({ unit: '', discrete: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pnpm test src/app/panels/__tests__/channels.test.ts`
Expected: FAIL — cannot resolve `@app/panels/channels`.

- [ ] **Step 3: Implement the helpers**

Create `src/app/panels/channels.ts`:

```ts
import type { ChannelMeta } from '@core/index';

export type ChannelInfo = { unit: string; discrete: boolean };

/**
 * The wanted channels that this recording actually has, in the wanted order.
 *
 * The default stack names six channels; a recording from another sim or an
 * older version of the logger may carry only four of them, and a missing
 * channel must not take the panel down with it.
 */
export function presentChannels(available: ChannelMeta[], wanted: readonly string[]): string[] {
  const names = new Set(available.map((channel) => channel.name));
  return wanted.filter((name) => names.has(name));
}

export function channelInfo(available: ChannelMeta[], name: string): ChannelInfo {
  const channel = available.find((entry) => entry.name === name);
  return channel
    ? { unit: channel.unit, discrete: channel.discrete }
    : { unit: '', discrete: false };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose run --rm app pnpm test src/app/panels/__tests__/channels.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the panel**

Create `src/app/panels/ChartStack.tsx`:

```tsx
import { useState } from 'react';
import { useStore } from 'zustand';

import type { LapRef } from '@core/index';

import { gridNodes } from '@app/charts/data';
import { stackChartOptions } from '@app/charts/options';
import { UPlotChart } from '@app/charts/UPlotChart';
import { getTelemetry } from '@app/data/telemetry';
import { useArrays } from '@app/data/useArrays';
import { appStore, lapKey } from '@app/state/store';
import { LAP_SLOTS } from '@app/theme/palette';

import { channelInfo, presentChannels } from './channels';

const HEIGHT = 120;

type Drawn = { lap: LapRef; slot: number };

export function ChartStack() {
  const slots = useStore(appStore, (state) => state.slots);
  const sessions = useStore(appStore, (state) => state.sessions);
  const wanted = useStore(appStore, (state) => state.channels);
  const [pick, setPick] = useState('');

  const drawn: Drawn[] = slots
    .map((lap, slot) => ({ lap, slot }))
    .filter((entry): entry is Drawn => entry.lap !== null);

  const session = sessions.find((entry) => entry.id === drawn[0]?.lap.sessionId);
  const channels = session ? presentChannels(session.channels, wanted) : [];

  const key = [...channels, ...drawn.map((d) => lapKey(d.lap))].join('|');
  const { arrays, error } = useArrays(key, () => {
    const { cache } = getTelemetry();
    return Promise.all(
      channels.flatMap((channel) => drawn.map((d) => cache.series(d.lap, channel))),
    );
  });

  if (!session) return <p className="hint">Load a recording to see the channels.</p>;
  if (error !== null) return <p className="error">{error}</p>;

  return (
    <div className="stack">
      <div className="picker">
        <input
          list="channel-options"
          value={pick}
          placeholder="add a channel"
          onChange={(event) => setPick(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            appStore.getState().addChannel(pick);
            setPick('');
          }}
        />
        <datalist id="channel-options">
          {session.channels.map((channel) => (
            <option key={channel.name} value={channel.name} />
          ))}
        </datalist>
      </div>

      {arrays === null ? (
        <p className="hint">Resampling…</p>
      ) : (
        channels.map((channel, row) => {
          const info = channelInfo(session.channels, channel);
          const values = arrays.slice(row * drawn.length, (row + 1) * drawn.length);
          if (values.length !== drawn.length) return null;

          return (
            <div className="stack-row" key={channel}>
              <div className="stack-head">
                <span>{channel}</span>
                <button type="button" onClick={() => appStore.getState().removeChannel(channel)}>
                  ×
                </button>
              </div>
              <UPlotChart
                recreateKey={`${channel}|${key}`}
                options={stackChartOptions({
                  width: 800,
                  height: HEIGHT,
                  unit: info.unit,
                  discrete: info.discrete,
                  lines: drawn.map((d) => ({
                    label: `Lap ${d.lap.lapNumber}`,
                    stroke: LAP_SLOTS[d.slot],
                  })),
                })}
                data={[gridNodes(session.grid), ...values]}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 6: Put it on screen**

In `src/app/App.tsx`:

```tsx
      <section className="panel area-channels">
        <h2>Channels</h2>
        <ChartStack />
      </section>
```

with `import { ChartStack } from './panels/ChartStack';` beside the others.

Append to `src/app/app.css`:

```css
.picker { padding: 4px 8px; border-bottom: 1px solid var(--ll-border); }
.picker input { width: 220px; }

.stack-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 2px 8px;
  color: var(--ll-text-secondary);
}

.stack-row + .stack-row { border-top: 1px solid var(--ll-grid-line); }
```

- [ ] **Step 7: Verify**

Run: `make test` — PASS.
Run: `make check` — exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/panels/channels.ts src/app/panels/__tests__/channels.test.ts \
  src/app/panels/ChartStack.tsx src/app/App.tsx src/app/app.css
git commit -m "feat(app): stack channel charts on the shared distance axis"
```

---

### Task 15: Verification against the real recording

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything built above and
  `tests/fixtures/motec/knockhill-cupra-tcr.ld` (+ `.ldx`), the committed
  28 MB anonymised recording — 34 laps, of which two carry an approximate lap
  time and the first flying lap shares the sim's lap number with another lap.
- Produces: a verified screen and the README section describing it.

Nothing here is automated. The unit suites cover every pure piece; this task
is where the DOM glue is exercised, because the repository has no browser test
environment and adding one is not worth it for four components.

- [ ] **Step 1: Run the full suite**

Run: `make test`
Expected: PASS. Count the totals — 134 from plan 1 plus the tests added here.

Run: `make check`
Expected: exit 0.

- [ ] **Step 2: Start the application**

Run: `make dev`
Open `http://localhost:5173`.

- [ ] **Step 3: Load the committed recording**

Drop both `tests/fixtures/motec/knockhill-cupra-tcr.ld` and
`knockhill-cupra-tcr.ldx` onto the window at once.

Expected, and each of these is a real assertion about the data:

- The lap table appears in well under a second — only about 500 KB of the
  28 MB is read before it can be drawn.
- 34 laps are listed. The first and the last are marked `part`.
- Two laps show a lap time rendered as `~m:ss.s` rather than `m:ss.mmm`; those
  are the ones whose `Lap Time` channel failed to reset at the wrap.
- A reference lap is selected automatically, and it is the fastest lap that is
  neither partial nor invalidated.
- The `Lap` column repeats a number, because the sim's counter stays at 0 for
  the whole first flying lap. That is expected — identity is the row's own
  index, and the column is display only.

- [ ] **Step 4: Check the delta**

Mark two other laps as `cmp`.

Expected:

- Each comparison lap gets its own colour, matching its swatch in the table:
  orange for the first, magenta for the second.
- The delta chart draws two lines starting at 0 s at distance 0.
- Each line ends at that lap's gap to the reference, which matches the `gap`
  column in the lap table to within about 0.2 s — the residual is the 10 Hz
  boundary quantisation of the lap basis.
- Dropping the first comparison leaves the second one's colour unchanged.
- Marking a lap as `cmp` when three laps are already drawn does nothing.

- [ ] **Step 5: Check the cursor and the stack**

Move the pointer across the delta chart.

Expected:

- The distance readout above the chart follows the pointer, and every channel
  chart's cursor moves with it.
- The `Gear` chart is drawn as steps, not as a sloped line.
- The readout shows the delta at the cursor with an explicit sign.
- Typing a channel name into the picker and pressing Enter adds a chart;
  the `×` button removes it.
- A default channel the recording does not carry simply does not appear —
  no empty chart, no error.

- [ ] **Step 6: Check that a second recording is refused sensibly**

Drop the same file a second time. It opens as a second session with its own
id, and its laps can be compared with the first — same venue, same grid. There
is no second venue in the repository to test the cross-venue guard by hand;
that path is covered by the handler test.

Run: `make down` when finished.

- [ ] **Step 7: Describe it in the README**

Add after the "Working with the project" section:

```markdown
## Using it

Start the dev server with `make dev` and open `http://localhost:5173`, then
drop a `.ld` file — with its `.ldx` beside it, if there is one — onto the
window. The file is parsed in a Web Worker; the page only ever receives lap
metadata and the small arrays it draws.

Pick one lap as the reference and up to two more to compare with it. The delta
chart reads as accumulated time against distance: the zero line is the
reference lap, and a line rising means that lap is losing time at that point on
track. The channel charts below share the same distance axis and the same
cursor.

Three laps are drawn at once at most. That is a legibility limit, not an
arbitrary one — a fourth colour cannot be told apart from the other three.
```

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "docs: describe the lap comparison screen"
```

---

## Self-Review

**Spec coverage.** Sections 3 (worker architecture, protocol), 4 (data model,
`LapRef` identity), 6 (data flow, transferable bytes, cursor as a single
number on the main thread), 7 (LapTable, DeltaChart, ChartStack), 8.1/8.3
(tokens in TypeScript, three fixed lap slots, status colours never reused) and
the relevant rows of 9 (cross-venue comparison blocked, partial laps never
offered as reference, absent channels tolerated) are each carried by a task.
Sections 5 (track map), 8.2/8.4 (pixel visual layer), the OPFS and
`react-grid-layout` parts of 11, and the time-basis toggle of 7 are listed as
out of scope at the top of this plan and belong to later plans.

**Deviations from the spec, and why.** The spec's worker protocol takes a
`ByteSource` with a `read(offset, length)` method; `core.openSession` takes the
whole `Uint8Array`, so `openSession` here transfers the buffer instead. The
extension point is unaffected — it lives inside the worker, and nothing in
`app` would change if the worker later pulled ranges over HTTP. The spec's
`getSeries(..., basis)` parameter is absent because `core` has no time basis
yet.

