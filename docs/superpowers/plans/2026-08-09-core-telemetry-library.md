# Core Telemetry Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-TypeScript core that turns MoTeC `.ld`/`.ldx` bytes into session metadata, a lap index, distance-aligned channel series and lap-to-lap time deltas.

**Architecture:** Everything in this plan lives under `src/core/` and depends on neither the DOM, React nor a Web Worker, so it runs and is tested in Node. Binary reads go through one alignment-aware `ByteWindow`. Lap boundaries come from `Car Pos Norm` wraps; every channel is resampled onto a shared 1-metre distance grid, which makes deltas and overlays trivial downstream.

**Tech Stack:** TypeScript (strict), Vite (project shell for later plans), Vitest. No runtime dependencies in `core`.

**Scope:** This is plan 1 of 3 for the MVP described in
`docs/superpowers/specs/2026-08-09-motec-telemetry-viz-design.md`.
Plan 2 covers the Web Worker and the first working screen; plan 3 covers track
maps (`.mt2` parsing, map generation, `Car Heading` ±180° interpolation) and the
visual layer. Nothing in this plan consumes headings or renders anything.

## Global Constraints

- All files in this repository are written in **English** — documentation, comments, commit messages, identifiers.
- Commit messages must **not** contain a `Co-Authored-By` trailer.
- TypeScript `strict: true`. No `any` in exported signatures.
- The Vite template sets `erasableSyntaxOnly: true`, so TypeScript-only runtime
  syntax is banned: no constructor parameter properties, no `enum`, no
  `namespace`, no decorators. Vitest strips types with esbuild and does not
  enforce this, so **every task must run `npx tsc -b` as well as `npm test`**
  before committing — otherwise the build breaks while the tests stay green.
- `src/core/**` must not import from `src/app/**`, `src/worker/**`, or any DOM API.
- `src/core/**` must have zero runtime dependencies.
- Little-endian for every binary read.
- Sample time is always derived as `index / freq`; never stored per sample.
- The unique key for a channel is its **full name**. Short names are not unique (102 distinct across 186 channels in the samples) and are for labels only.
- Real sample files live in `temp/`, which is gitignored. Tests that need them must skip when absent.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts` | Project shell and test runner |
| `src/core/ld/window.ts` | `ByteWindow` — alignment-aware little-endian reads over a byte range |
| `src/core/ld/layout.ts` | Byte offsets of the header, event and channel-metadata structs |
| `src/core/ld/types.ts` | `LdHeader`, `LdChannel` |
| `src/core/ld/header.ts` | `parseHeader` |
| `src/core/ld/channels.ts` | `parseChannels` — linked-list walk |
| `src/core/ld/decode.ts` | `decodeChannel` — raw values to physical `Float32Array` |
| `src/core/ld/ldx.ts` | `parseLdx` — beacons, venue length, vehicle info |
| `src/core/lap/interpolate.ts` | `pchip`, `sampleLinear`, `sampleStep` |
| `src/core/lap/lapIndex.ts` | `buildLapIndex` |
| `src/core/lap/despike.ts` | `despikeDistance` |
| `src/core/lap/resample.ts` | `makeDistanceGrid`, `buildLapBasis`, `resampleToDistance` |
| `src/core/lap/delta.ts` | `computeDelta` |
| `src/core/session.ts` | `openSession` — assembles everything, caches decoded channels and series |
| `src/core/types.ts` | `SessionMeta`, `ChannelMeta`, `LapMeta`, `LapRef`, `DistanceGrid` |
| `test/fixtures/buildLd.ts` | Synthetic `.ld` builder used by every unit test |
| `test/fixtures/samples.ts` | Locates the real files under `temp/example`, or reports absence |

Tests are co-located as `*.test.ts` beside the module they cover, except the
integration suite, which lives in `test/integration/`.

---

### Task 1: Project shell

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/core/index.ts`, `src/core/index.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test`, and the `src/core/` directory that every later task adds to.

- [ ] **Step 1: Scaffold the Vite project**

Run in the repository root (it already contains `docs/`, `temp/`, `AGENTS.md`):

```bash
npm create vite@latest . -- --template react-ts
```

Answer "Ignore files and continue" if prompted about the non-empty directory.
Then install the test runner:

```bash
npm install
npm install -D vitest
```

Do not pin versions — take whatever the current majors are.

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
```

Add the script to `package.json`:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Enforce strict TypeScript**

In `tsconfig.app.json` (created by the Vite template), confirm `"strict": true`
is present and add these if missing:

```json
"noUncheckedIndexedAccess": false,
"exactOptionalPropertyTypes": false
```

Both are deliberately off: the binary readers index typed arrays in hot loops,
where `noUncheckedIndexedAccess` adds noise without catching real bugs here.

- [ ] **Step 4: Write the smoke test**

Create `src/core/index.ts`:

```ts
export const CORE_VERSION = '0.1.0';
```

Create `src/core/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from './index';

describe('core', () => {
  it('exposes a version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Trim the app shell**

Replace `src/App.tsx` with a placeholder — the UI arrives in plan 2:

```tsx
export default function App() {
  return <main>Telemetry viewer — core library only at this stage.</main>;
}
```

Delete `src/App.css` and the `import './App.css'` line if the template created
them.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TypeScript + Vitest project shell"
```

---

### Task 2: ByteWindow

**Files:**
- Create: `src/core/ld/window.ts`, `src/core/ld/window.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `class ByteWindow`
  - `constructor(bytes: Uint8Array, base?: number)`
  - `u16(offset: number): number`, `i16(offset: number): number`, `u32(offset: number): number`
  - `str(offset: number, length: number): string`
  - `f32Array(offset: number, count: number): Float32Array`
  - `i16Array(offset: number, count: number): Int16Array`
  - `i32Array(offset: number, count: number): Int32Array`
  - `readonly base: number`, `get end(): number`

Offsets passed to every method are **absolute file offsets**. `base` is the file
offset of `bytes[0]`, so a window over a partial read still works.

Alignment matters: measured on both sample files, 79 of the 186 four-byte
channels start at an offset where `offset % 4 === 2`. A typed-array view requires
the offset to be a multiple of the element size, so those channels must be copied
rather than viewed.

- [ ] **Step 1: Write the failing test**

Create `src/core/ld/window.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ByteWindow } from './window';

function windowOf(size: number, base = 0): { bytes: Uint8Array; win: ByteWindow } {
  const bytes = new Uint8Array(size);
  return { bytes, win: new ByteWindow(bytes, base) };
}

describe('ByteWindow', () => {
  it('reads little-endian scalars', () => {
    const { bytes, win } = windowOf(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0xdeadbeef, true);
    view.setUint16(4, 4242, true);
    view.setInt16(6, -1234, true);

    expect(win.u32(0)).toBe(0xdeadbeef);
    expect(win.u16(4)).toBe(4242);
    expect(win.i16(6)).toBe(-1234);
  });

  it('reads NUL-padded strings and trims them', () => {
    const { bytes, win } = windowOf(16);
    bytes.set([0x41, 0x44, 0x4c, 0x00, 0x00, 0x00, 0x00, 0x00], 0);
    expect(win.str(0, 8)).toBe('ADL');
  });

  it('keeps interior spaces in strings', () => {
    const { bytes, win } = windowOf(16);
    for (const [i, ch] of [...'7  Bob'].entries()) bytes[i] = ch.charCodeAt(0);
    expect(win.str(0, 16)).toBe('7  Bob');
  });

  it('returns a zero-copy view when the offset is aligned', () => {
    const { bytes, win } = windowOf(16);
    new DataView(bytes.buffer).setFloat32(4, 1.5, true);

    const arr = win.f32Array(4, 1);
    expect(arr[0]).toBe(1.5);

    // Proof it shares memory with the source buffer.
    new DataView(bytes.buffer).setFloat32(4, 2.5, true);
    expect(arr[0]).toBe(2.5);
  });

  it('copies when the offset is not aligned', () => {
    const { bytes, win } = windowOf(16);
    new DataView(bytes.buffer).setFloat32(2, 1.5, true);

    const arr = win.f32Array(2, 1);
    expect(arr[0]).toBe(1.5);

    // Proof it is a detached copy.
    new DataView(bytes.buffer).setFloat32(2, 2.5, true);
    expect(arr[0]).toBe(1.5);
  });

  it('honours the base offset', () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setUint32(0, 99, true);
    const win = new ByteWindow(bytes, 1000);
    expect(win.u32(1000)).toBe(99);
    expect(win.base).toBe(1000);
    expect(win.end).toBe(1008);
  });

  it('throws when a read falls outside the window', () => {
    const { win } = windowOf(8);
    expect(() => win.u32(6)).toThrow(/outside window/);
    expect(() => win.u32(-4)).toThrow(/outside window/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/ld/window.test.ts`
Expected: FAIL — cannot resolve `./window`.

- [ ] **Step 3: Implement ByteWindow**

Create `src/core/ld/window.ts`:

```ts
/**
 * A little-endian reader over a byte range of an .ld file.
 *
 * Every offset passed in is an absolute file offset; `base` is the file offset
 * of `bytes[0]`, so a window over a partial read behaves like a window over the
 * whole file.
 */
export class ByteWindow {
  private readonly bytes: Uint8Array;
  readonly base: number;
  private readonly view: DataView;

  // Fields are declared and assigned explicitly rather than with constructor
  // parameter properties: the Vite template sets `erasableSyntaxOnly: true`,
  // which rejects that shorthand (TS1294). Vitest strips types with esbuild and
  // does not enforce the flag, so `npm test` passes while `npm run build` fails.
  constructor(bytes: Uint8Array, base = 0) {
    this.bytes = bytes;
    this.base = base;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get end(): number {
    return this.base + this.bytes.byteLength;
  }

  private local(offset: number, length: number): number {
    const local = offset - this.base;
    if (local < 0 || local + length > this.bytes.byteLength) {
      throw new RangeError(
        `read of ${length} byte(s) at ${offset} is outside window [${this.base}, ${this.end})`,
      );
    }
    return local;
  }

  u16(offset: number): number {
    return this.view.getUint16(this.local(offset, 2), true);
  }

  i16(offset: number): number {
    return this.view.getInt16(this.local(offset, 2), true);
  }

  u32(offset: number): number {
    return this.view.getUint32(this.local(offset, 4), true);
  }

  /** Fixed-width, NUL-padded, latin-1 string. */
  str(offset: number, length: number): string {
    const start = this.local(offset, length);
    const raw = this.bytes.subarray(start, start + length);
    let stop = raw.indexOf(0);
    if (stop === -1) stop = raw.length;
    let out = '';
    for (let i = 0; i < stop; i++) out += String.fromCharCode(raw[i]);
    return out.trim();
  }

  f32Array(offset: number, count: number): Float32Array {
    const abs = this.absolute(offset, count, 4);
    return abs % 4 === 0
      ? new Float32Array(this.bytes.buffer, abs, count)
      : new Float32Array(this.bytes.buffer.slice(abs, abs + count * 4));
  }

  i32Array(offset: number, count: number): Int32Array {
    const abs = this.absolute(offset, count, 4);
    return abs % 4 === 0
      ? new Int32Array(this.bytes.buffer, abs, count)
      : new Int32Array(this.bytes.buffer.slice(abs, abs + count * 4));
  }

  i16Array(offset: number, count: number): Int16Array {
    const abs = this.absolute(offset, count, 2);
    return abs % 2 === 0
      ? new Int16Array(this.bytes.buffer, abs, count)
      : new Int16Array(this.bytes.buffer.slice(abs, abs + count * 2));
  }

  /** Offset within the underlying ArrayBuffer, bounds-checked. */
  private absolute(offset: number, count: number, width: number): number {
    return this.bytes.byteOffset + this.local(offset, count * width);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/core/ld/window.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ld/window.ts src/core/ld/window.test.ts
git commit -m "feat(core): add alignment-aware ByteWindow reader"
```

---

### Task 3: Synthetic .ld fixture builder

**Files:**
- Create: `test/fixtures/buildLd.ts`, `test/fixtures/buildLd.test.ts`

**Interfaces:**
- Consumes: `ByteWindow` (for the self-test only)
- Produces:
  - `type FixtureChannel = { name: string; shortName?: string; unit?: string; freq: number; dtypeA?: number; dtype?: number; scale?: number; mul?: number; dec?: number; shift?: number; values: number[] }`
  - `type FixtureOptions = { driver?: string; vehicle?: string; venue?: string; date?: string; time?: string; shortComment?: string; eventName?: string; sessionName?: string; channels: FixtureChannel[] }`
  - `buildLd(opts: FixtureOptions): Uint8Array`
  - Constants `HEADER_SIZE = 1762`, `EVENT_SIZE = 1154`, `CHAN_SIZE = 124`, `META_PTR = 2916`

`values` are the **raw stored values**, not physical ones. For the common
`dtypeA=7, dtype=4, scale=1, mul=1, dec=0, shift=0` channel the two are the same.

The layout constants are not invented — they were derived from the sample files:
the header is 1762 bytes, which is exactly the `event_ptr` in both samples; the
event struct is 1154 bytes, and `1762 + 1154 = 2916`, which is exactly the
`channelMetaPtr` in both samples.

- [ ] **Step 1: Write the failing test**

Create `test/fixtures/buildLd.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ByteWindow } from '../../src/core/ld/window';
import { buildLd, CHAN_SIZE, META_PTR } from './buildLd';

describe('buildLd', () => {
  it('writes a header a reader can recognise', () => {
    const bytes = buildLd({
      venue: 'test-venue',
      channels: [{ name: 'Speed', freq: 10, values: [1, 2, 3] }],
    });
    const win = new ByteWindow(bytes);

    expect(win.u32(0)).toBe(0x40);
    expect(win.u32(8)).toBe(META_PTR);
    expect(win.u32(86)).toBe(1);
    expect(win.str(350, 64)).toBe('test-venue');
  });

  it('lays channel data out contiguously after the metadata', () => {
    const bytes = buildLd({
      channels: [
        { name: 'A', freq: 1, values: [1, 2, 3] },
        { name: 'B', freq: 1, values: [4, 5] },
      ],
    });
    const win = new ByteWindow(bytes);
    const dataStart = META_PTR + 2 * CHAN_SIZE;

    expect(win.u32(12)).toBe(dataStart);
    expect(win.u32(META_PTR + 8)).toBe(dataStart);
    expect(win.u32(META_PTR + CHAN_SIZE + 8)).toBe(dataStart + 3 * 4);
  });

  it('links the channel metadata list in both directions', () => {
    const bytes = buildLd({
      channels: [
        { name: 'A', freq: 1, values: [1] },
        { name: 'B', freq: 1, values: [1] },
      ],
    });
    const win = new ByteWindow(bytes);

    expect(win.u32(META_PTR + 0)).toBe(0);
    expect(win.u32(META_PTR + 4)).toBe(META_PTR + CHAN_SIZE);
    expect(win.u32(META_PTR + CHAN_SIZE + 0)).toBe(META_PTR);
    expect(win.u32(META_PTR + CHAN_SIZE + 4)).toBe(0);
  });

  it('produces a misaligned float channel after an odd-length int16 channel', () => {
    const bytes = buildLd({
      channels: [
        { name: 'Gear', freq: 1, dtypeA: 3, dtype: 2, values: [1, 2, 3] },
        { name: 'Speed', freq: 1, values: [10.5] },
      ],
    });
    const win = new ByteWindow(bytes);
    const speedPtr = win.u32(META_PTR + CHAN_SIZE + 8);

    expect(speedPtr % 4).toBe(2);
    expect(win.f32Array(speedPtr, 1)[0]).toBe(10.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/fixtures/buildLd.test.ts`
Expected: FAIL — cannot resolve `./buildLd`.

- [ ] **Step 3: Implement the builder**

Create `test/fixtures/buildLd.ts`:

```ts
export const HEADER_SIZE = 1762;
export const EVENT_SIZE = 1154;
export const CHAN_SIZE = 124;
export const META_PTR = HEADER_SIZE + EVENT_SIZE; // 2916

export type FixtureChannel = {
  name: string;
  shortName?: string;
  unit?: string;
  freq: number;
  /** 7 = float, 0/3/5 = integer. Default 7. */
  dtypeA?: number;
  /** Byte width: 2 or 4. Default 4. */
  dtype?: number;
  scale?: number;
  mul?: number;
  dec?: number;
  shift?: number;
  /** Raw stored values, not physical ones. */
  values: number[];
};

export type FixtureOptions = {
  driver?: string;
  vehicle?: string;
  venue?: string;
  date?: string;
  time?: string;
  shortComment?: string;
  eventName?: string;
  sessionName?: string;
  channels: FixtureChannel[];
};

export function buildLd(opts: FixtureOptions): Uint8Array {
  const channels = opts.channels;
  const widths = channels.map((c) => ((c.dtype ?? 4) === 2 ? 2 : 4));
  const dataStart = META_PTR + channels.length * CHAN_SIZE;

  const offsets: number[] = [];
  let cursor = dataStart;
  channels.forEach((c, i) => {
    offsets.push(cursor);
    cursor += c.values.length * widths[i];
  });

  const bytes = new Uint8Array(cursor);
  const view = new DataView(bytes.buffer);
  const putStr = (offset: number, length: number, value: string): void => {
    for (let i = 0; i < Math.min(length, value.length); i++) {
      bytes[offset + i] = value.charCodeAt(i) & 0xff;
    }
  };

  view.setUint32(0, 0x40, true);
  view.setUint32(8, META_PTR, true);
  view.setUint32(12, dataStart, true);
  view.setUint32(36, HEADER_SIZE, true);
  view.setUint32(70, 12345, true);
  putStr(74, 8, 'ADL');
  view.setUint16(82, 420, true);
  view.setUint32(86, channels.length, true);
  putStr(94, 16, opts.date ?? '10/03/2026');
  putStr(126, 16, opts.time ?? '20:31:38');
  putStr(158, 64, opts.driver ?? 'Test Driver');
  putStr(222, 64, opts.vehicle ?? 'test_car');
  putStr(350, 64, opts.venue ?? 'test-venue');
  putStr(1572, 64, opts.shortComment ?? '');

  putStr(HEADER_SIZE + 0, 64, opts.eventName ?? 'Telemetrick');
  putStr(HEADER_SIZE + 64, 64, opts.sessionName ?? 'Race.online (50Hz)');

  channels.forEach((c, i) => {
    const m = META_PTR + i * CHAN_SIZE;
    view.setUint32(m + 0, i === 0 ? 0 : META_PTR + (i - 1) * CHAN_SIZE, true);
    view.setUint32(m + 4, i === channels.length - 1 ? 0 : META_PTR + (i + 1) * CHAN_SIZE, true);
    view.setUint32(m + 8, offsets[i], true);
    view.setUint32(m + 12, c.values.length, true);
    view.setUint16(m + 16, 0, true);
    view.setUint16(m + 18, c.dtypeA ?? 7, true);
    view.setUint16(m + 20, c.dtype ?? 4, true);
    view.setUint16(m + 22, c.freq, true);
    view.setInt16(m + 24, c.shift ?? 0, true);
    view.setInt16(m + 26, c.mul ?? 1, true);
    view.setInt16(m + 28, c.scale ?? 1, true);
    view.setInt16(m + 30, c.dec ?? 0, true);
    putStr(m + 32, 32, c.name);
    putStr(m + 64, 8, c.shortName ?? c.name.slice(0, 8));
    putStr(m + 72, 12, c.unit ?? '');

    const width = widths[i];
    const isFloat = (c.dtypeA ?? 7) === 7;
    c.values.forEach((v, k) => {
      const at = offsets[i] + k * width;
      // `width === 4` is not redundant: a float16 fixture (dtypeA 7, dtype 2)
      // declares a 2-byte slot, and setFloat32 would write 4 bytes into it —
      // silently corrupting the next channel's data, or throwing a DataView
      // range error when it is the last channel.
      if (isFloat && width === 4) view.setFloat32(at, v, true);
      else if (width === 2) view.setInt16(at, v, true);
      else view.setInt32(at, v, true);
    });
  });

  return bytes;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/fixtures/buildLd.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/buildLd.ts test/fixtures/buildLd.test.ts
git commit -m "test: add synthetic .ld fixture builder"
```

---

### Task 4: Header parser

**Files:**
- Create: `src/core/ld/layout.ts`, `src/core/ld/types.ts`, `src/core/ld/header.ts`, `src/core/ld/header.test.ts`

**Interfaces:**
- Consumes: `ByteWindow`, `buildLd`
- Produces:
  - `const HEADER`, `const EVENT`, `const CHAN` offset tables in `layout.ts`
  - `type LdHeader = { channelMetaPtr: number; channelDataPtr: number; eventPtr: number; channelCount: number; deviceSerial: number; deviceType: string; deviceVersion: number; date: string; time: string; driver: string; vehicle: string; venue: string; shortComment: string; eventName: string; sessionName: string }`
  - `parseHeader(win: ByteWindow): LdHeader`

The offsets below were read out of the sample files byte by byte. Note that they
differ from the offset table published alongside the commonly cited struct
string — that table is wrong, while its struct string is right. Trust these.

- [ ] **Step 1: Write the failing test**

Create `src/core/ld/header.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLd, META_PTR } from '../../../test/fixtures/buildLd';
import { parseHeader } from './header';
import { ByteWindow } from './window';

describe('parseHeader', () => {
  it('reads identity and pointers', () => {
    const bytes = buildLd({
      driver: '7  Stanley Bublick',
      vehicle: 'fw_cupra_tcr_2024',
      venue: 'monza-lfm',
      date: '10/03/2026',
      time: '20:31:38',
      shortComment: 'Kumho TCR Dry (S)',
      eventName: 'Telemetrick',
      sessionName: 'Race.online (50Hz)',
      channels: [
        { name: 'A', freq: 1, values: [1] },
        { name: 'B', freq: 1, values: [1] },
      ],
    });

    const head = parseHeader(new ByteWindow(bytes));

    expect(head.channelMetaPtr).toBe(META_PTR);
    expect(head.channelCount).toBe(2);
    expect(head.deviceType).toBe('ADL');
    expect(head.deviceVersion).toBe(420);
    expect(head.date).toBe('10/03/2026');
    expect(head.time).toBe('20:31:38');
    expect(head.driver).toBe('7  Stanley Bublick');
    expect(head.vehicle).toBe('fw_cupra_tcr_2024');
    expect(head.venue).toBe('monza-lfm');
    expect(head.shortComment).toBe('Kumho TCR Dry (S)');
    expect(head.eventName).toBe('Telemetrick');
    expect(head.sessionName).toBe('Race.online (50Hz)');
  });

  it('rejects a file whose marker is not 0x40', () => {
    const bytes = buildLd({ channels: [{ name: 'A', freq: 1, values: [1] }] });
    new DataView(bytes.buffer).setUint32(0, 0x41, true);

    expect(() => parseHeader(new ByteWindow(bytes))).toThrow(/not a MoTeC \.ld file/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/ld/header.test.ts`
Expected: FAIL — cannot resolve `./header`.

- [ ] **Step 3: Write the layout table**

Create `src/core/ld/layout.ts`:

```ts
/**
 * Byte offsets inside the .ld structures.
 *
 * Verified byte by byte against the sample files. The header is 1762 bytes,
 * which equals the eventPtr both samples carry; the event struct is 1154 bytes,
 * and 1762 + 1154 = 2916, which equals the channelMetaPtr both samples carry.
 */
export const HEADER = {
  marker: 0,
  channelMetaPtr: 8,
  channelDataPtr: 12,
  eventPtr: 36,
  deviceSerial: 70,
  deviceType: 74,
  deviceTypeLen: 8,
  deviceVersion: 82,
  channelCount: 86,
  date: 94,
  time: 126,
  driver: 158,
  vehicle: 222,
  venue: 350,
  shortComment: 1572,
  textLen: 64,
  dateLen: 16,
  size: 1762,
} as const;

export const EVENT = {
  name: 0,
  session: 64,
  comment: 128,
  venuePtr: 1152,
  textLen: 64,
  size: 1154,
} as const;

export const CHAN = {
  prevPtr: 0,
  nextPtr: 4,
  dataPtr: 8,
  count: 12,
  counter: 16,
  dtypeA: 18,
  dtype: 20,
  freq: 22,
  shift: 24,
  mul: 26,
  scale: 28,
  dec: 30,
  name: 32,
  nameLen: 32,
  shortName: 64,
  shortNameLen: 8,
  unit: 72,
  unitLen: 12,
  size: 124,
} as const;

export const LD_MARKER = 0x40;
```

- [ ] **Step 4: Write the types**

Create `src/core/ld/types.ts`:

```ts
export type LdHeader = {
  channelMetaPtr: number;
  channelDataPtr: number;
  eventPtr: number;
  channelCount: number;
  deviceSerial: number;
  deviceType: string;
  deviceVersion: number;
  date: string;
  time: string;
  driver: string;
  vehicle: string;
  venue: string;
  shortComment: string;
  eventName: string;
  sessionName: string;
};

export type LdChannel = {
  name: string;
  shortName: string;
  unit: string;
  freq: number;
  count: number;
  dataPtr: number;
  dtypeA: number;
  dtype: number;
  shift: number;
  mul: number;
  scale: number;
  dec: number;
};
```

- [ ] **Step 5: Implement parseHeader**

Create `src/core/ld/header.ts`:

```ts
import { EVENT, HEADER, LD_MARKER } from './layout';
import type { LdHeader } from './types';
import type { ByteWindow } from './window';

export function parseHeader(win: ByteWindow): LdHeader {
  const marker = win.u32(HEADER.marker);
  if (marker !== LD_MARKER) {
    throw new Error(
      `not a MoTeC .ld file: expected marker 0x${LD_MARKER.toString(16)} at offset 0, got 0x${marker.toString(16)}`,
    );
  }

  const eventPtr = win.u32(HEADER.eventPtr);

  return {
    channelMetaPtr: win.u32(HEADER.channelMetaPtr),
    channelDataPtr: win.u32(HEADER.channelDataPtr),
    eventPtr,
    channelCount: win.u32(HEADER.channelCount),
    deviceSerial: win.u32(HEADER.deviceSerial),
    deviceType: win.str(HEADER.deviceType, HEADER.deviceTypeLen),
    deviceVersion: win.u16(HEADER.deviceVersion),
    date: win.str(HEADER.date, HEADER.dateLen),
    time: win.str(HEADER.time, HEADER.dateLen),
    driver: win.str(HEADER.driver, HEADER.textLen),
    vehicle: win.str(HEADER.vehicle, HEADER.textLen),
    venue: win.str(HEADER.venue, HEADER.textLen),
    shortComment: win.str(HEADER.shortComment, HEADER.textLen),
    eventName: win.str(eventPtr + EVENT.name, EVENT.textLen),
    sessionName: win.str(eventPtr + EVENT.session, EVENT.textLen),
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/core/ld/header.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add src/core/ld/layout.ts src/core/ld/types.ts src/core/ld/header.ts src/core/ld/header.test.ts
git commit -m "feat(core): parse .ld header and event block"
```

---

### Task 5: Channel metadata walk

**Files:**
- Create: `src/core/ld/channels.ts`, `src/core/ld/channels.test.ts`

**Interfaces:**
- Consumes: `ByteWindow`, `parseHeader`, `CHAN`, `LdChannel`
- Produces: `parseChannels(win: ByteWindow, header: LdHeader): LdChannel[]`

- [ ] **Step 1: Write the failing test**

Create `src/core/ld/channels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLd, CHAN_SIZE, META_PTR } from '../../../test/fixtures/buildLd';
import { parseChannels } from './channels';
import { parseHeader } from './header';
import { ByteWindow } from './window';

function parse(bytes: Uint8Array) {
  const win = new ByteWindow(bytes);
  return parseChannels(win, parseHeader(win));
}

describe('parseChannels', () => {
  it('walks the linked list in order', () => {
    const channels = parse(
      buildLd({
        channels: [
          { name: 'Ground Speed', shortName: 'Gnd Spd', unit: 'kph', freq: 30, values: [1, 2] },
          { name: 'Engine RPM', shortName: 'RPM', unit: 'rpm', freq: 30, dtypeA: 3, dtype: 2, values: [3] },
        ],
      }),
    );

    expect(channels.map((c) => c.name)).toEqual(['Ground Speed', 'Engine RPM']);
    expect(channels[0].unit).toBe('kph');
    expect(channels[0].shortName).toBe('Gnd Spd');
    expect(channels[0].freq).toBe(30);
    expect(channels[0].count).toBe(2);
    expect(channels[1].dtypeA).toBe(3);
    expect(channels[1].dtype).toBe(2);
  });

  it('reads the scaling fields as signed', () => {
    const channels = parse(
      buildLd({
        channels: [{ name: 'A', freq: 1, dtypeA: 3, dtype: 2, shift: -5, mul: 2, scale: 10, dec: 1, values: [0] }],
      }),
    );

    expect(channels[0].shift).toBe(-5);
    expect(channels[0].mul).toBe(2);
    expect(channels[0].scale).toBe(10);
    expect(channels[0].dec).toBe(1);
  });

  it('stops on a cycle instead of looping forever', () => {
    const bytes = buildLd({
      channels: [
        { name: 'A', freq: 1, values: [1] },
        { name: 'B', freq: 1, values: [1] },
      ],
    });
    // Point B's nextPtr back at A.
    new DataView(bytes.buffer).setUint32(META_PTR + CHAN_SIZE + 4, META_PTR, true);

    expect(parse(bytes).map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('throws when the list length disagrees with the header count', () => {
    const bytes = buildLd({
      channels: [
        { name: 'A', freq: 1, values: [1] },
        { name: 'B', freq: 1, values: [1] },
      ],
    });
    new DataView(bytes.buffer).setUint32(86, 5, true);

    expect(() => parse(bytes)).toThrow(/header declares 5 channels, list yields 2/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/ld/channels.test.ts`
Expected: FAIL — cannot resolve `./channels`.

- [ ] **Step 3: Implement parseChannels**

Create `src/core/ld/channels.ts`:

```ts
import { CHAN } from './layout';
import type { LdChannel, LdHeader } from './types';
import type { ByteWindow } from './window';

export function parseChannels(win: ByteWindow, header: LdHeader): LdChannel[] {
  const channels: LdChannel[] = [];
  const visited = new Set<number>();

  let ptr = header.channelMetaPtr;
  while (ptr !== 0 && !visited.has(ptr)) {
    visited.add(ptr);
    channels.push({
      name: win.str(ptr + CHAN.name, CHAN.nameLen),
      shortName: win.str(ptr + CHAN.shortName, CHAN.shortNameLen),
      unit: win.str(ptr + CHAN.unit, CHAN.unitLen),
      freq: win.u16(ptr + CHAN.freq),
      count: win.u32(ptr + CHAN.count),
      dataPtr: win.u32(ptr + CHAN.dataPtr),
      dtypeA: win.u16(ptr + CHAN.dtypeA),
      dtype: win.u16(ptr + CHAN.dtype),
      shift: win.i16(ptr + CHAN.shift),
      mul: win.i16(ptr + CHAN.mul),
      scale: win.i16(ptr + CHAN.scale),
      dec: win.i16(ptr + CHAN.dec),
    });
    ptr = win.u32(ptr + CHAN.nextPtr);
  }

  if (channels.length !== header.channelCount) {
    throw new Error(
      `channel list is inconsistent: header declares ${header.channelCount} channels, list yields ${channels.length}`,
    );
  }

  return channels;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/core/ld/channels.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ld/channels.ts src/core/ld/channels.test.ts
git commit -m "feat(core): walk the .ld channel metadata list"
```

---

### Task 6: Channel decoding

**Files:**
- Create: `src/core/ld/decode.ts`, `src/core/ld/decode.test.ts`

**Interfaces:**
- Consumes: `ByteWindow`, `LdChannel`
- Produces:
  - `decodeChannel(win: ByteWindow, channel: LdChannel): Float32Array`
  - `isDiscrete(channel: LdChannel): boolean` — true when the stored type is an integer, which later drives step rather than linear resampling

Decoding formula: `value = (raw / scale * 10^(-dec) + shift) * mul`.

Type mapping observed across the samples: `(7,4)` float32 (161 channels),
`(5,4)` int32 (13), `(3,2)` int16 (5), `(0,2)` int16 (5), `(0,4)` int32 (2).
`dtypeA = 7, dtype = 2` would be float16 and `dtypeA = 8` float64; neither occurs
in the samples, and both throw rather than being silently misread as integers.

- [ ] **Step 1: Write the failing test**

Create `src/core/ld/decode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLd } from '../../../test/fixtures/buildLd';
import { parseChannels } from './channels';
import { decodeChannel, isDiscrete } from './decode';
import { parseHeader } from './header';
import { ByteWindow } from './window';

function decodeFirst(bytes: Uint8Array, index = 0): Float32Array {
  const win = new ByteWindow(bytes);
  const channels = parseChannels(win, parseHeader(win));
  return decodeChannel(win, channels[index]);
}

describe('decodeChannel', () => {
  it('passes float32 channels through untouched', () => {
    const out = decodeFirst(
      buildLd({ channels: [{ name: 'Speed', freq: 10, values: [0.5, 1.25, -3] }] }),
    );
    expect([...out]).toEqual([0.5, 1.25, -3]);
  });

  it('applies scale, dec, shift and mul to integer channels', () => {
    // raw 1234 -> (1234 / 10 * 10^-1 + 2) * 3 = (12.34 + 2) * 3 = 43.02
    const out = decodeFirst(
      buildLd({
        channels: [
          { name: 'A', freq: 1, dtypeA: 3, dtype: 2, scale: 10, dec: 1, shift: 2, mul: 3, values: [1234] },
        ],
      }),
    );
    expect(out[0]).toBeCloseTo(43.02, 5);
  });

  it('decodes a misaligned float32 channel correctly', () => {
    const out = decodeFirst(
      buildLd({
        channels: [
          { name: 'Gear', freq: 1, dtypeA: 3, dtype: 2, values: [1, 2, 3] },
          { name: 'Speed', freq: 1, values: [10.5, 11.5] },
        ],
      }),
      1,
    );
    expect([...out]).toEqual([10.5, 11.5]);
  });

  it('decodes int32 channels', () => {
    const out = decodeFirst(
      buildLd({ channels: [{ name: 'Race Flag', freq: 1, dtypeA: 5, dtype: 4, values: [7] }] }),
    );
    expect(out[0]).toBe(7);
  });

  it('rejects float16 rather than misreading it as int16', () => {
    expect(() =>
      decodeFirst(buildLd({ channels: [{ name: 'A', freq: 1, dtypeA: 7, dtype: 2, values: [1] }] })),
    ).toThrow(/float16/);
  });

  it('rejects a zero scale instead of dividing by zero', () => {
    expect(() =>
      decodeFirst(
        buildLd({ channels: [{ name: 'A', freq: 1, dtypeA: 3, dtype: 2, scale: 0, values: [1] }] }),
      ),
    ).toThrow(/scale of 0/);
  });
});

describe('isDiscrete', () => {
  it('is false for float channels and true for integer channels', () => {
    const win = new ByteWindow(
      buildLd({
        channels: [
          { name: 'Speed', freq: 1, values: [1] },
          { name: 'Gear', freq: 1, dtypeA: 3, dtype: 2, values: [1] },
        ],
      }),
    );
    const channels = parseChannels(win, parseHeader(win));

    expect(isDiscrete(channels[0])).toBe(false);
    expect(isDiscrete(channels[1])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/ld/decode.test.ts`
Expected: FAIL — cannot resolve `./decode`.

- [ ] **Step 3: Implement the decoder**

Create `src/core/ld/decode.ts`:

```ts
import type { LdChannel } from './types';
import type { ByteWindow } from './window';

const FLOAT_CLASS = 7;
const DOUBLE_CLASS = 8;

/** True when the channel stores integers, which must be resampled as steps. */
export function isDiscrete(channel: LdChannel): boolean {
  return channel.dtypeA !== FLOAT_CLASS && channel.dtypeA !== DOUBLE_CLASS;
}

export function decodeChannel(win: ByteWindow, channel: LdChannel): Float32Array {
  if (channel.scale === 0) {
    throw new Error(`channel "${channel.name}" declares a scale of 0, which cannot be applied`);
  }

  const raw = readRaw(win, channel);
  const identity =
    channel.scale === 1 && channel.mul === 1 && channel.dec === 0 && channel.shift === 0;

  if (identity && raw instanceof Float32Array) return raw;

  const out = new Float32Array(raw.length);
  const decFactor = 10 ** -channel.dec;
  for (let i = 0; i < raw.length; i++) {
    out[i] = (raw[i] / channel.scale * decFactor + channel.shift) * channel.mul;
  }
  return out;
}

function readRaw(win: ByteWindow, channel: LdChannel): Float32Array | Int32Array | Int16Array {
  const { dtypeA, dtype, dataPtr, count, name } = channel;

  if (dtypeA === FLOAT_CLASS) {
    if (dtype === 4) return win.f32Array(dataPtr, count);
    throw new Error(`channel "${name}" is float16, which is not supported`);
  }
  if (dtypeA === DOUBLE_CLASS) {
    throw new Error(`channel "${name}" is float64, which is not supported`);
  }
  if (dtype === 2) return win.i16Array(dataPtr, count);
  if (dtype === 4) return win.i32Array(dataPtr, count);

  throw new Error(`channel "${name}" has an unknown type (dtypeA=${dtypeA}, dtype=${dtype})`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/core/ld/decode.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ld/decode.ts src/core/ld/decode.test.ts
git commit -m "feat(core): decode channel data to physical values"
```

---

### Task 7: .ldx parser

**Files:**
- Create: `src/core/ld/ldx.ts`, `src/core/ld/ldx.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type LdxVehicleInfo = { wheelbase?: number; track?: number; weight?: number; fuelCapacity?: number }`
  - `type LdxData = { beaconTimes: number[]; trackLength?: number; vehicle: LdxVehicleInfo; appName?: string }`
  - `parseLdx(xml: string): LdxData`

Beacon `Time` attributes are in **microseconds**; `beaconTimes` is returned in
seconds. Verified against the samples: a marker at `1.27033e8` µs corresponds to
a `Lap Time` channel reading of 127.038 s.

`core` may not use the DOM, so `DOMParser` is unavailable. The file is a small,
flat, attribute-only XML, so it is read with regular expressions over the
relevant tags rather than a general parser.

- [ ] **Step 1: Write the failing test**

Create `src/core/ld/ldx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseLdx } from './ldx';

const SAMPLE = `<?xml version="1.0"?>
<LDXFile Locale="Russian_Russia.1251" Version="1.6">
 <Layers>
  <Layer>
   <MarkerBlock>
    <MarkerGroup Name="Beacons" Index="15">
     <Marker Version="100" ClassName="BCN" Name="Manual.1" Flags="77" Time="1.27033000000000000e+08"/>
     <Marker Version="100" ClassName="BCN" Name="Manual.2" Flags="77" Time="2.48988000000000000e+08"/>
    </MarkerGroup>
   </MarkerBlock>
  </Layer>
  <Details>
   <Numeric Id="Vehicle Wheelbase" Value="2.715" Unit="m" DPS="3"/>
   <Numeric Id="Vehicle Track" Value="1.693" Unit="m" DPS="3"/>
   <Numeric Id="Venue Length" Value="5755.02" Unit="m" DPS="6"/>
   <Numeric Id="Fuel Tank Capacity" Value="100" Unit="l" DPS="2"/>
   <Numeric Id="Vehicle Weight" Value="1255" Unit="kg" DPS="2"/>
   <String Id="AppName" Value="Telemetrick v1.72"/>
  </Details>
 </Layers>
</LDXFile>`;

describe('parseLdx', () => {
  it('reads beacon times in seconds', () => {
    const data = parseLdx(SAMPLE);
    expect(data.beaconTimes).toHaveLength(2);
    expect(data.beaconTimes[0]).toBeCloseTo(127.033, 3);
    expect(data.beaconTimes[1]).toBeCloseTo(248.988, 3);
  });

  it('reads the venue length and vehicle details', () => {
    const data = parseLdx(SAMPLE);
    expect(data.trackLength).toBeCloseTo(5755.02, 2);
    expect(data.vehicle.wheelbase).toBeCloseTo(2.715, 3);
    expect(data.vehicle.track).toBeCloseTo(1.693, 3);
    expect(data.vehicle.weight).toBeCloseTo(1255, 0);
    expect(data.vehicle.fuelCapacity).toBeCloseTo(100, 0);
    expect(data.appName).toBe('Telemetrick v1.72');
  });

  it('returns empty data for an .ldx without markers or details', () => {
    const data = parseLdx('<?xml version="1.0"?><LDXFile Version="1.6"></LDXFile>');
    expect(data.beaconTimes).toEqual([]);
    expect(data.trackLength).toBeUndefined();
    expect(data.vehicle).toEqual({});
  });

  it('ignores markers that are not beacons', () => {
    const xml = `<LDXFile><Marker ClassName="RNG" Name="Range.1" Time="1.0e+08"/></LDXFile>`;
    expect(parseLdx(xml).beaconTimes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/ld/ldx.test.ts`
Expected: FAIL — cannot resolve `./ldx`.

- [ ] **Step 3: Implement parseLdx**

Create `src/core/ld/ldx.ts`:

```ts
export type LdxVehicleInfo = {
  wheelbase?: number;
  track?: number;
  weight?: number;
  fuelCapacity?: number;
};

export type LdxData = {
  /** Lap beacon times in seconds from session start. */
  beaconTimes: number[];
  /** Venue Length in metres, when the file declares one. */
  trackLength?: number;
  vehicle: LdxVehicleInfo;
  appName?: string;
};

const MARKER_RE = /<Marker\b[^>]*\/>/g;
const NUMERIC_RE = /<Numeric\s+Id="([^"]*)"\s+Value="([^"]*)"/g;
const STRING_RE = /<String\s+Id="([^"]*)"\s+Value="([^"]*)"/g;

const MICROSECONDS_PER_SECOND = 1e6;

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match?.[1];
}

export function parseLdx(xml: string): LdxData {
  const beaconTimes: number[] = [];
  for (const [tag] of xml.matchAll(MARKER_RE)) {
    if (attr(tag, 'ClassName') !== 'BCN') continue;
    const raw = attr(tag, 'Time');
    if (raw === undefined) continue;
    const microseconds = Number(raw);
    if (Number.isFinite(microseconds)) {
      beaconTimes.push(microseconds / MICROSECONDS_PER_SECOND);
    }
  }
  beaconTimes.sort((a, b) => a - b);

  const numerics = new Map<string, number>();
  for (const [, id, value] of xml.matchAll(NUMERIC_RE)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) numerics.set(id, parsed);
  }

  const strings = new Map<string, string>();
  for (const [, id, value] of xml.matchAll(STRING_RE)) strings.set(id, value);

  const vehicle: LdxVehicleInfo = {};
  const wheelbase = numerics.get('Vehicle Wheelbase');
  const track = numerics.get('Vehicle Track');
  const weight = numerics.get('Vehicle Weight');
  const fuelCapacity = numerics.get('Fuel Tank Capacity');
  if (wheelbase !== undefined) vehicle.wheelbase = wheelbase;
  if (track !== undefined) vehicle.track = track;
  if (weight !== undefined) vehicle.weight = weight;
  if (fuelCapacity !== undefined) vehicle.fuelCapacity = fuelCapacity;

  const data: LdxData = { beaconTimes, vehicle };
  const trackLength = numerics.get('Venue Length');
  if (trackLength !== undefined) data.trackLength = trackLength;
  const appName = strings.get('AppName');
  if (appName !== undefined) data.appName = appName;

  return data;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/core/ld/ldx.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ld/ldx.ts src/core/ld/ldx.test.ts
git commit -m "feat(core): parse .ldx beacons and venue details"
```

---

### Task 8: Interpolation primitives

**Files:**
- Create: `src/core/lap/interpolate.ts`, `src/core/lap/interpolate.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `pchipSlopes(xs: Float64Array, ys: Float64Array): Float64Array`
  - `pchipEval(xs: Float64Array, ys: Float64Array, slopes: Float64Array, x: number, hint?: number): { value: number; index: number }`
  - `sampleLinear(values: Float32Array, freq: number, t: number): number`
  - `sampleStep(values: Float32Array, freq: number, t: number): number`

`pchipEval` returns the interval index it used so callers sweeping a
monotonically increasing `x` can pass it back as `hint` and stay O(1) per call.

Monotone cubic (Fritsch–Carlson) rather than plain cubic, because the inverse
`t(pos)` must not overshoot: `Car Pos Norm` arrives at 10 Hz, leaving up to 7 m
between points, and an overshoot would land exactly on braking.

- [ ] **Step 1: Write the failing test**

Create `src/core/lap/interpolate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pchipEval, pchipSlopes, sampleLinear, sampleStep } from './interpolate';

function evalAt(xs: number[], ys: number[], x: number): number {
  const fx = Float64Array.from(xs);
  const fy = Float64Array.from(ys);
  return pchipEval(fx, fy, pchipSlopes(fx, fy), x).value;
}

describe('pchip', () => {
  it('reproduces the knots exactly', () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 2, 3, 9];
    for (const [i, x] of xs.entries()) {
      expect(evalAt(xs, ys, x)).toBeCloseTo(ys[i], 10);
    }
  });

  it('is exact on linear data', () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 2, 4, 6];
    expect(evalAt(xs, ys, 0.5)).toBeCloseTo(1, 10);
    expect(evalAt(xs, ys, 2.25)).toBeCloseTo(4.5, 10);
  });

  it('does not overshoot a step', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [0, 0, 1, 1, 1];
    for (let x = 0; x <= 4; x += 0.05) {
      const y = evalAt(xs, ys, x);
      expect(y).toBeGreaterThanOrEqual(-1e-12);
      expect(y).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('stays monotone on monotone data', () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const ys = [0, 0.1, 0.15, 0.6, 0.9, 1];
    let previous = -Infinity;
    for (let x = 0; x <= 5; x += 0.01) {
      const y = evalAt(xs, ys, x);
      expect(y).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = y;
    }
  });

  it('clamps outside the knot range', () => {
    const xs = [0, 1, 2];
    const ys = [5, 6, 7];
    expect(evalAt(xs, ys, -3)).toBeCloseTo(5, 10);
    expect(evalAt(xs, ys, 99)).toBeCloseTo(7, 10);
  });

  it('accepts a hint and returns the interval used', () => {
    const xs = Float64Array.from([0, 1, 2, 3]);
    const ys = Float64Array.from([0, 1, 2, 3]);
    const slopes = pchipSlopes(xs, ys);

    const first = pchipEval(xs, ys, slopes, 2.5);
    expect(first.value).toBeCloseTo(2.5, 10);
    const second = pchipEval(xs, ys, slopes, 2.75, first.index);
    expect(second.value).toBeCloseTo(2.75, 10);
  });
});

describe('sampling', () => {
  const values = Float32Array.from([0, 10, 20, 30]);

  it('interpolates linearly between samples', () => {
    expect(sampleLinear(values, 10, 0.15)).toBeCloseTo(15, 5);
  });

  it('holds the previous value when stepping', () => {
    expect(sampleStep(values, 10, 0.15)).toBe(10);
    expect(sampleStep(values, 10, 0.19)).toBe(10);
    expect(sampleStep(values, 10, 0.2)).toBe(20);
  });

  it('clamps to the ends of the channel', () => {
    expect(sampleLinear(values, 10, -5)).toBe(0);
    expect(sampleLinear(values, 10, 500)).toBe(30);
    expect(sampleStep(values, 10, 500)).toBe(30);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/lap/interpolate.test.ts`
Expected: FAIL — cannot resolve `./interpolate`.

- [ ] **Step 3: Implement the primitives**

Create `src/core/lap/interpolate.ts`:

```ts
/**
 * Fritsch-Carlson monotone cubic slopes. Guarantees the interpolant neither
 * overshoots nor introduces extrema the data does not have.
 */
export function pchipSlopes(xs: Float64Array, ys: Float64Array): Float64Array {
  const n = xs.length;
  const slopes = new Float64Array(n);
  if (n < 2) return slopes;

  const h = new Float64Array(n - 1);
  const delta = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    delta[i] = h[i] === 0 ? 0 : (ys[i + 1] - ys[i]) / h[i];
  }

  if (n === 2) {
    slopes[0] = delta[0];
    slopes[1] = delta[0];
    return slopes;
  }

  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      slopes[i] = 0;
      continue;
    }
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    slopes[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
  }

  slopes[0] = endpointSlope(h[0], h[1], delta[0], delta[1]);
  slopes[n - 1] = endpointSlope(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
  return slopes;
}

function endpointSlope(hNear: number, hFar: number, dNear: number, dFar: number): number {
  const denominator = hNear + hFar;
  let slope = denominator === 0 ? dNear : ((2 * hNear + hFar) * dNear - hNear * dFar) / denominator;
  if (slope * dNear <= 0) return 0;
  if (dNear * dFar < 0 && Math.abs(slope) > Math.abs(3 * dNear)) return 3 * dNear;
  return slope;
}

export function pchipEval(
  xs: Float64Array,
  ys: Float64Array,
  slopes: Float64Array,
  x: number,
  hint = 0,
): { value: number; index: number } {
  const n = xs.length;
  if (n === 0) return { value: NaN, index: 0 };
  if (n === 1 || x <= xs[0]) return { value: ys[0], index: 0 };
  if (x >= xs[n - 1]) return { value: ys[n - 1], index: n - 2 };

  let i = Math.min(Math.max(hint, 0), n - 2);
  while (i < n - 2 && xs[i + 1] < x) i++;
  while (i > 0 && xs[i] > x) i--;

  const h = xs[i + 1] - xs[i];
  if (h === 0) return { value: ys[i], index: i };

  const s = (x - xs[i]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;

  const value = h00 * ys[i] + h10 * h * slopes[i] + h01 * ys[i + 1] + h11 * h * slopes[i + 1];
  return { value, index: i };
}

/** Linear interpolation of a constant-rate channel at absolute time `t`. */
export function sampleLinear(values: Float32Array, freq: number, t: number): number {
  const last = values.length - 1;
  if (last < 0) return NaN;
  const x = t * freq;
  if (x <= 0) return values[0];
  if (x >= last) return values[last];
  const i = Math.floor(x);
  const frac = x - i;
  return values[i] * (1 - frac) + values[i + 1] * frac;
}

/** Previous-sample hold for discrete channels (gear, flags, modes). */
export function sampleStep(values: Float32Array, freq: number, t: number): number {
  const last = values.length - 1;
  if (last < 0) return NaN;
  const i = Math.floor(t * freq);
  if (i <= 0) return values[0];
  if (i >= last) return values[last];
  return values[i];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/core/lap/interpolate.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/lap/interpolate.ts src/core/lap/interpolate.test.ts
git commit -m "feat(core): add monotone cubic and channel sampling primitives"
```

---

### Task 9: Lap index

**Files:**
- Create: `src/core/types.ts`, `src/core/lap/lapIndex.ts`, `src/core/lap/lapIndex.test.ts`

**Interfaces:**
- Consumes: `sampleStep` from `interpolate.ts`
- Produces:
  - `type ChannelSeries = { values: Float32Array; freq: number }`
  - `type LapChannels = { carPosNorm: ChannelSeries; lapNumber: ChannelSeries; lapTime: ChannelSeries; lapInvalidated?: ChannelSeries }`
  - `type LapMeta = { number: number; startTime: number; endTime: number; lapTime: number; valid: boolean; complete: boolean; startIndex: number; endIndex: number }`
  - `buildLapIndex(channels: LapChannels): LapMeta[]`

`startIndex`/`endIndex` are inclusive indices into the **`carPosNorm`** array, so
the resampler can rebuild the lap basis without re-deriving boundaries.

Boundaries come from `Car Pos Norm` wraps, never from `Lap Number` — see spec
§2.4. The two disagree by up to one 10 Hz sample, and using the wrong one
collapses a lap to a constant.

`lapTime` is the maximum of the `Lap Time` channel inside the window rather than
`endTime - startTime`: the channel carries millisecond precision while the wrap
boundary only resolves to 100 ms.

- [ ] **Step 1: Write the failing test**

Create `src/core/lap/lapIndex.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLapIndex, type LapChannels } from './lapIndex';

/** Three laps of 10 samples each at 10 Hz, preceded by half an out-lap. */
function synthetic(): LapChannels {
  const pos: number[] = [];
  const lapNumber: number[] = [];
  const lapTime: number[] = [];

  // Out-lap: positions 0.5 .. 0.9, lap 0.
  for (let i = 5; i < 10; i++) {
    pos.push(i / 10);
    lapNumber.push(0);
    lapTime.push((i - 5) / 10);
  }
  // Laps 1..3: positions 0.0 .. 0.9.
  for (let lap = 1; lap <= 3; lap++) {
    for (let i = 0; i < 10; i++) {
      pos.push(i / 10);
      lapNumber.push(lap);
      lapTime.push(i / 10);
    }
  }

  return {
    carPosNorm: { values: Float32Array.from(pos), freq: 10 },
    lapNumber: { values: Float32Array.from(lapNumber), freq: 10 },
    lapTime: { values: Float32Array.from(lapTime), freq: 10 },
  };
}

describe('buildLapIndex', () => {
  it('finds every lap, marking the partial ones', () => {
    const laps = buildLapIndex(synthetic());

    expect(laps.map((l) => l.complete)).toEqual([false, true, true, false]);
    expect(laps.map((l) => l.number)).toEqual([0, 1, 2, 3]);
  });

  it('takes boundaries from Car Pos Norm wraps', () => {
    const laps = buildLapIndex(synthetic());

    expect(laps[1].startIndex).toBe(5);
    expect(laps[1].endIndex).toBe(14);
    expect(laps[1].startTime).toBeCloseTo(0.5, 6);
    expect(laps[1].endTime).toBeCloseTo(1.5, 6);
  });

  it('takes lap time from the Lap Time channel maximum', () => {
    const laps = buildLapIndex(synthetic());
    expect(laps[1].lapTime).toBeCloseTo(0.9, 6);
  });

  it('tolerates micro-reversals that are not wraps', () => {
    const channels = synthetic();
    // A 0.001 backwards step inside lap 2 must not be read as a lap boundary.
    channels.carPosNorm.values[18] = channels.carPosNorm.values[17] - 0.001;

    expect(buildLapIndex(channels)).toHaveLength(4);
  });

  it('marks a lap invalid when Lap Invalidated is set inside it', () => {
    const channels = synthetic();
    const flags = new Float32Array(channels.carPosNorm.values.length);
    flags[17] = 1;
    channels.lapInvalidated = { values: flags, freq: 10 };

    const laps = buildLapIndex(channels);
    expect(laps[1].valid).toBe(true);
    expect(laps[2].valid).toBe(false);
  });

  it('returns a single partial lap when there is no wrap at all', () => {
    const values = Float32Array.from([0.1, 0.2, 0.3]);
    const laps = buildLapIndex({
      carPosNorm: { values, freq: 10 },
      lapNumber: { values: Float32Array.from([0, 0, 0]), freq: 10 },
      lapTime: { values: Float32Array.from([0, 0.1, 0.2]), freq: 10 },
    });

    expect(laps).toHaveLength(1);
    expect(laps[0].complete).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/lap/lapIndex.test.ts`
Expected: FAIL — cannot resolve `./lapIndex`.

- [ ] **Step 3: Write the shared types**

Create `src/core/types.ts`:

```ts
export type SessionId = string;

export type ChannelMeta = {
  /** Full channel name — the only unique key. */
  name: string;
  /** Not unique; labels only. */
  shortName: string;
  unit: string;
  freq: number;
  count: number;
  /** Integer-valued channels are resampled as steps, not interpolated. */
  discrete: boolean;
};

export type VehicleInfo = {
  wheelbase?: number;
  track?: number;
  weight?: number;
  fuelCapacity?: number;
};

export type DistanceGrid = {
  /** Metres between grid nodes. */
  step: number;
  /** Track length in metres. */
  length: number;
  points: number;
  /** True when the length was estimated rather than read from the .ldx. */
  approximate: boolean;
};

export type LapRef = { sessionId: SessionId; lapNumber: number };
```

- [ ] **Step 4: Implement buildLapIndex**

Create `src/core/lap/lapIndex.ts`:

```ts
import { sampleStep } from './interpolate';

export type ChannelSeries = { values: Float32Array; freq: number };

export type LapChannels = {
  carPosNorm: ChannelSeries;
  lapNumber: ChannelSeries;
  lapTime: ChannelSeries;
  lapInvalidated?: ChannelSeries;
};

export type LapMeta = {
  number: number;
  startTime: number;
  endTime: number;
  lapTime: number;
  valid: boolean;
  complete: boolean;
  /** Inclusive indices into carPosNorm. */
  startIndex: number;
  endIndex: number;
};

/** A drop larger than this in Car Pos Norm is a lap boundary, not noise. */
const WRAP_THRESHOLD = 0.5;

export function buildLapIndex(channels: LapChannels): LapMeta[] {
  const pos = channels.carPosNorm.values;
  const posFreq = channels.carPosNorm.freq;
  if (pos.length === 0) return [];

  const wraps: number[] = [];
  for (let j = 1; j < pos.length; j++) {
    if (pos[j] < pos[j - 1] - WRAP_THRESHOLD) wraps.push(j);
  }

  const segments: Array<{ start: number; end: number; complete: boolean }> = [];
  if (wraps.length === 0) {
    segments.push({ start: 0, end: pos.length - 1, complete: false });
  } else {
    if (wraps[0] > 0) segments.push({ start: 0, end: wraps[0] - 1, complete: false });
    for (let k = 0; k < wraps.length - 1; k++) {
      segments.push({ start: wraps[k], end: wraps[k + 1] - 1, complete: true });
    }
    segments.push({ start: wraps[wraps.length - 1], end: pos.length - 1, complete: false });
  }

  return segments.map(({ start, end, complete }) => {
    const startTime = start / posFreq;
    const endTime = (end + 1) / posFreq;
    const midTime = (startTime + endTime) / 2;

    return {
      number: Math.round(sampleStep(channels.lapNumber.values, channels.lapNumber.freq, midTime)),
      startTime,
      endTime,
      lapTime: maxInWindow(channels.lapTime, startTime, endTime),
      valid: complete ? !flagSetInWindow(channels.lapInvalidated, startTime, endTime) : false,
      complete,
      startIndex: start,
      endIndex: end,
    };
  });
}

function windowBounds(series: ChannelSeries, from: number, to: number): [number, number] {
  const last = series.values.length - 1;
  const lo = Math.max(0, Math.min(last, Math.floor(from * series.freq)));
  const hi = Math.max(0, Math.min(last, Math.ceil(to * series.freq)));
  return [lo, hi];
}

function maxInWindow(series: ChannelSeries, from: number, to: number): number {
  if (series.values.length === 0) return 0;
  const [lo, hi] = windowBounds(series, from, to);
  let max = series.values[lo];
  for (let i = lo + 1; i <= hi; i++) {
    if (series.values[i] > max) max = series.values[i];
  }
  return max;
}

/**
 * A lap window is [startTime, endTime), where endTime is the next lap's start.
 * The upper bound is therefore exclusive here — an inclusive one would let a
 * flag raised on the next lap's first sample invalidate this lap.
 */
function flagSetInWindow(series: ChannelSeries | undefined, from: number, to: number): boolean {
  if (!series || series.values.length === 0) return false;
  const last = series.values.length - 1;
  const lo = Math.max(0, Math.min(last, Math.floor(from * series.freq)));
  const hi = Math.max(lo, Math.min(last, Math.ceil(to * series.freq) - 1));
  for (let i = lo; i <= hi; i++) {
    if (series.values[i] !== 0) return true;
  }
  return false;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/core/lap/lapIndex.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/lap/lapIndex.ts src/core/lap/lapIndex.test.ts
git commit -m "feat(core): build the lap index from Car Pos Norm wraps"
```

---

### Task 10: Lap Distance despiking

**Files:**
- Create: `src/core/lap/despike.ts`, `src/core/lap/despike.test.ts`

**Interfaces:**
- Consumes: `sampleLinear` from `interpolate.ts`, `ChannelSeries` from `lapIndex.ts`
- Produces: `despikeDistance(distance: ChannelSeries, speedKph: ChannelSeries): Float32Array`

Measured on the samples: 24 corrupt values out of 58153 (0.04%), clustered in the
1–3 samples before each lap change, where the odometer spikes to 33365 m against
a correct 23020 m and then drops to garbage. A sample is rejected when its step
from the previous sample is negative or larger than the distance the car could
have covered at the recorded speed; rejected runs are filled by linear
interpolation between the surviving neighbours.

- [ ] **Step 1: Write the failing test**

Create `src/core/lap/despike.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { despikeDistance } from './despike';

/** 100 samples at 10 Hz, a constant 36 kph (10 m/s), so 1 m per sample. */
function clean(): { distance: Float32Array; speed: Float32Array } {
  const distance = new Float32Array(100);
  const speed = new Float32Array(100);
  for (let i = 0; i < 100; i++) {
    distance[i] = i;
    speed[i] = 36;
  }
  return { distance, speed };
}

describe('despikeDistance', () => {
  it('leaves clean data untouched', () => {
    const { distance, speed } = clean();
    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    expect([...out]).toEqual([...distance]);
  });

  it('repairs an upward spike', () => {
    const { distance, speed } = clean();
    distance[50] = 33365;

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    expect(out[50]).toBeCloseTo(50, 3);
  });

  it('repairs a spike followed by a garbage value', () => {
    const { distance, speed } = clean();
    distance[50] = 33365;
    distance[51] = 20126;

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    expect(out[50]).toBeCloseTo(50, 3);
    expect(out[51]).toBeCloseTo(51, 3);
  });

  it('keeps the series non-decreasing', () => {
    const { distance, speed } = clean();
    distance[30] = 9999;
    distance[31] = 12;
    distance[70] = -500;

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-6);
    }
  });

  it('returns an empty array for empty input', () => {
    const out = despikeDistance(
      { values: new Float32Array(0), freq: 10 },
      { values: new Float32Array(0), freq: 10 },
    );
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/lap/despike.test.ts`
Expected: FAIL — cannot resolve `./despike`.

- [ ] **Step 3: Implement despikeDistance**

Create `src/core/lap/despike.ts`:

```ts
import { sampleLinear } from './interpolate';
import type { ChannelSeries } from './lapIndex';

/** Allowance over the speed-derived step, in metres, before a sample is rejected. */
const STEP_SLACK = 5;
/** Multiplier on the speed-derived step before a sample is rejected. */
const STEP_TOLERANCE = 2;
/** Backwards movement larger than this is impossible for an odometer. */
const MAX_BACKWARD = 0.5;

const KPH_TO_MPS = 1 / 3.6;

/**
 * Removes the corrupt odometer samples MoTeC/Telemetrick emits around lap
 * transitions and fills the gaps by linear interpolation.
 */
export function despikeDistance(distance: ChannelSeries, speedKph: ChannelSeries): Float32Array {
  const values = distance.values;
  const n = values.length;
  const out = new Float32Array(n);
  if (n === 0) return out;

  const good = new Uint8Array(n);
  good[0] = 1;

  for (let i = 1; i < n; i++) {
    const t = i / distance.freq;
    const speed = Math.max(0, sampleLinear(speedKph.values, speedKph.freq, t)) * KPH_TO_MPS;
    const maxStep = (speed / distance.freq) * STEP_TOLERANCE + STEP_SLACK;
    const step = values[i] - values[i - 1];
    good[i] = step >= -MAX_BACKWARD && step <= maxStep ? 1 : 0;
  }

  // A spike also corrupts the step into the following sample, so drop its
  // neighbour. Read from a snapshot: mutating `good` in place would cascade,
  // and a single spike would condemn the entire rest of the series.
  const firstPass = good.slice();
  for (let i = 1; i < n - 1; i++) {
    if (firstPass[i] === 0) good[i + 1] = 0;
  }

  // good[0] is forced to 1 above, so at least one anchor always exists.
  let previousGood = -1;
  for (let i = 0; i < n; i++) {
    if (good[i] === 1) {
      out[i] = values[i];
      if (previousGood >= 0 && i - previousGood > 1) {
        fillGap(out, previousGood, i);
      }
      previousGood = i;
    }
  }

  // A trailing run of rejected samples holds the last good value.
  for (let i = previousGood + 1; i < n; i++) out[i] = out[previousGood];

  return out;
}

function fillGap(out: Float32Array, from: number, to: number): void {
  const span = to - from;
  const rise = out[to] - out[from];
  for (let k = 1; k < span; k++) {
    out[from + k] = out[from] + (rise * k) / span;
  }
}
```

Note: `Uint8Array.prototype.slice` returns a new typed array, which is what makes
the snapshot above cheap and correct.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/core/lap/despike.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/lap/despike.ts src/core/lap/despike.test.ts
git commit -m "feat(core): despike the Lap Distance odometer"
```

---

### Task 11: Distance-grid resampling

**Files:**
- Create: `src/core/lap/resample.ts`, `src/core/lap/resample.test.ts`

**Interfaces:**
- Consumes: `pchipSlopes`, `pchipEval`, `sampleLinear`, `sampleStep`, `LapMeta`, `ChannelSeries`, `DistanceGrid`
- Produces:
  - `makeDistanceGrid(length: number, options?: { step?: number; approximate?: boolean }): DistanceGrid`
  - `type LapBasis = { u: Float64Array; t: Float64Array; slopes: Float64Array }`
  - `buildLapBasis(carPosNorm: ChannelSeries, lap: LapMeta): LapBasis`
  - `resampleToDistance(channel: ChannelSeries, basis: LapBasis, grid: DistanceGrid, discrete: boolean): Float32Array`

The grid step is fixed at 1 metre by default: 2000–7000 points per lap per
channel, comfortably finer than the 4.8 m median spacing of raw `Car Pos Norm`.

- [ ] **Step 1: Write the failing test**

Create `src/core/lap/resample.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLapIndex } from './lapIndex';
import { buildLapBasis, makeDistanceGrid, resampleToDistance } from './resample';

/** One clean lap: 100 samples at 10 Hz sweeping Car Pos Norm from 0 to 0.99. */
function oneLap() {
  const pos = new Float32Array(200);
  const lapNumber = new Float32Array(200);
  const lapTime = new Float32Array(200);
  for (let i = 0; i < 200; i++) {
    pos[i] = (i % 100) / 100;
    lapNumber[i] = Math.floor(i / 100);
    lapTime[i] = (i % 100) / 10;
  }
  const channels = {
    carPosNorm: { values: pos, freq: 10 },
    lapNumber: { values: lapNumber, freq: 10 },
    lapTime: { values: lapTime, freq: 10 },
  };
  const laps = buildLapIndex(channels);
  return { channels, lap: laps[0] };
}

describe('makeDistanceGrid', () => {
  it('uses a one-metre step by default', () => {
    const grid = makeDistanceGrid(5755);
    expect(grid.step).toBe(1);
    expect(grid.points).toBe(5755);
    expect(grid.approximate).toBe(false);
  });

  it('rejects a non-positive length', () => {
    expect(() => makeDistanceGrid(0)).toThrow(/track length/);
  });
});

describe('resampleToDistance', () => {
  it('produces one value per grid node', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const out = resampleToDistance(channels.carPosNorm, basis, grid, false);
    expect(out).toHaveLength(grid.points);
    expect([...out].every(Number.isFinite)).toBe(true);
  });

  it('recovers a channel that is linear in distance', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    // Car Pos Norm itself is exactly distance/length.
    const out = resampleToDistance(channels.carPosNorm, basis, grid, false);
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[500]).toBeCloseTo(0.5, 2);
    expect(out[900]).toBeCloseTo(0.9, 2);
  });

  it('keeps a monotone channel monotone', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const out = resampleToDistance(channels.lapTime, basis, grid, false);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-5);
    }
  });

  it('holds discrete channels at sample values', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const gear = new Float32Array(200);
    for (let i = 0; i < 200; i++) gear[i] = i < 50 ? 3 : 4;

    const out = resampleToDistance({ values: gear, freq: 10 }, basis, grid, true);
    expect(new Set([...out])).toEqual(new Set([3, 4]));
  });

  it('forces the basis to be non-decreasing', () => {
    const { channels, lap } = oneLap();
    channels.carPosNorm.values[30] = channels.carPosNorm.values[29] - 0.002;

    const basis = buildLapBasis(channels.carPosNorm, lap);
    for (let i = 1; i < basis.u.length; i++) {
      expect(basis.u[i]).toBeGreaterThanOrEqual(basis.u[i - 1]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/lap/resample.test.ts`
Expected: FAIL — cannot resolve `./resample`.

- [ ] **Step 3: Implement the resampler**

Create `src/core/lap/resample.ts`:

```ts
import type { DistanceGrid } from '../types';
import { pchipEval, pchipSlopes, sampleLinear, sampleStep } from './interpolate';
import type { ChannelSeries, LapMeta } from './lapIndex';

const DEFAULT_STEP_METRES = 1;

export function makeDistanceGrid(
  length: number,
  options: { step?: number; approximate?: boolean } = {},
): DistanceGrid {
  const step = options.step ?? DEFAULT_STEP_METRES;
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`track length must be a positive number of metres, got ${length}`);
  }
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`grid step must be a positive number of metres, got ${step}`);
  }
  return {
    step,
    length,
    points: Math.max(1, Math.ceil(length / step)),
    approximate: options.approximate ?? false,
  };
}

export type LapBasis = {
  /** Non-decreasing track position, 0..1. */
  u: Float64Array;
  /** Absolute session time in seconds for each u. */
  t: Float64Array;
  slopes: Float64Array;
};

/**
 * Builds the position-to-time mapping for one lap. Monotonisation happens
 * strictly inside the already-determined boundaries — applying a running
 * maximum across a boundary would flatten the whole lap.
 */
export function buildLapBasis(carPosNorm: ChannelSeries, lap: LapMeta): LapBasis {
  const count = lap.endIndex - lap.startIndex + 1;
  const u = new Float64Array(count);
  const t = new Float64Array(count);

  let running = -Infinity;
  for (let k = 0; k < count; k++) {
    const index = lap.startIndex + k;
    const value = carPosNorm.values[index];
    running = value < running ? running : value;
    u[k] = running;
    t[k] = index / carPosNorm.freq;
  }

  return { u, t, slopes: pchipSlopes(u, t) };
}

export function resampleToDistance(
  channel: ChannelSeries,
  basis: LapBasis,
  grid: DistanceGrid,
  discrete: boolean,
): Float32Array {
  const out = new Float32Array(grid.points);
  if (basis.u.length === 0) return out;

  const first = basis.u[0];
  const last = basis.u[basis.u.length - 1];
  const sample = discrete ? sampleStep : sampleLinear;

  let hint = 0;
  for (let i = 0; i < grid.points; i++) {
    const distance = i * grid.step;
    let position = distance / grid.length;
    if (position < first) position = first;
    else if (position > last) position = last;

    const evaluated = pchipEval(basis.u, basis.t, basis.slopes, position, hint);
    hint = evaluated.index;
    out[i] = sample(channel.values, channel.freq, evaluated.value);
  }

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/core/lap/resample.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/lap/resample.ts src/core/lap/resample.test.ts
git commit -m "feat(core): resample channels onto a shared distance grid"
```

---

### Task 12: Time delta

**Files:**
- Create: `src/core/lap/delta.ts`, `src/core/lap/delta.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `computeDelta(referenceLapTime: Float32Array, comparisonLapTime: Float32Array): Float32Array`

Both inputs are the `Lap Time` channel already resampled onto the same grid, so
the delta is a subtraction. Positive means the comparison lap is behind.

- [ ] **Step 1: Write the failing test**

Create `src/core/lap/delta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeDelta } from './delta';

describe('computeDelta', () => {
  it('is zero for a lap against itself', () => {
    const lap = Float32Array.from([0, 1, 2, 3.5, 7]);
    expect([...computeDelta(lap, lap)]).toEqual([0, 0, 0, 0, 0]);
  });

  it('is positive where the comparison lap is behind', () => {
    const reference = Float32Array.from([0, 1, 2, 3]);
    const comparison = Float32Array.from([0, 1.2, 2.1, 2.9]);

    const delta = computeDelta(reference, comparison);
    expect(delta[1]).toBeCloseTo(0.2, 5);
    expect(delta[2]).toBeCloseTo(0.1, 5);
    expect(delta[3]).toBeCloseTo(-0.1, 5);
  });

  it('rejects grids of different sizes', () => {
    expect(() => computeDelta(new Float32Array(3), new Float32Array(4))).toThrow(
      /same distance grid/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/lap/delta.test.ts`
Expected: FAIL — cannot resolve `./delta`.

- [ ] **Step 3: Implement computeDelta**

Create `src/core/lap/delta.ts`:

```ts
/**
 * Accumulated time difference against distance.
 *
 * Both arguments are the Lap Time channel resampled onto the same distance
 * grid. A positive value means the comparison lap is behind the reference at
 * that point on track.
 */
export function computeDelta(
  referenceLapTime: Float32Array,
  comparisonLapTime: Float32Array,
): Float32Array {
  if (referenceLapTime.length !== comparisonLapTime.length) {
    throw new Error(
      `laps must be resampled onto the same distance grid: got ${referenceLapTime.length} and ${comparisonLapTime.length} points`,
    );
  }

  const out = new Float32Array(referenceLapTime.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = comparisonLapTime[i] - referenceLapTime[i];
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/core/lap/delta.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/lap/delta.ts src/core/lap/delta.test.ts
git commit -m "feat(core): compute lap-to-lap time delta"
```

---

### Task 13: Session assembly

**Files:**
- Create: `src/core/session.ts`, `src/core/session.test.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- Consumes: everything built so far
- Produces:
  - `type SessionMeta = { id: SessionId; fileName: string; driver: string; vehicle: string; venue: string; eventName: string; sessionName: string; recordedAt: string; duration: number; channels: ChannelMeta[]; laps: LapMeta[]; trackLength?: number; vehicleInfo?: VehicleInfo }`
  - `type Session = { meta: SessionMeta; grid: DistanceGrid; channel(name: string): Float32Array; series(lapNumber: number, channelName: string): Float32Array; delta(referenceLap: number, comparisonLap: number): Float32Array }`
  - `openSession(bytes: Uint8Array, options?: { fileName?: string; id?: SessionId; ldxText?: string }): Session`

Required channel names, exactly as they appear in the files: `Car Pos Norm`,
`Lap Number`, `Lap Time`. `Lap Invalidated`, `Lap Distance` and `Ground Speed`
are optional; the last two are only needed to estimate the track length when no
`.ldx` is present.

Track length resolution order: `.ldx` `Venue Length`, then the median despiked
`Lap Distance` across complete laps (grid marked approximate), otherwise
`openSession` throws.

- [ ] **Step 1: Write the failing test**

Create `src/core/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLd, type FixtureChannel } from '../../test/fixtures/buildLd';
import { openSession } from './session';

/** Two complete laps plus partial ends, 10 Hz, 1000 m per lap at 10 m/s. */
function sampleBytes(extra: FixtureChannel[] = []): Uint8Array {
  const pos: number[] = [];
  const lapNumber: number[] = [];
  const lapTime: number[] = [];
  const distance: number[] = [];
  const speed: number[] = [];

  let travelled = 0;
  for (let lap = 0; lap <= 3; lap++) {
    const from = lap === 0 ? 50 : 0;
    const to = lap === 3 ? 50 : 100;
    for (let i = from; i < to; i++) {
      pos.push(i / 100);
      lapNumber.push(lap);
      lapTime.push((i - from) / 10);
      travelled += 10;
      distance.push(travelled);
      speed.push(360);
    }
  }

  return buildLd({
    driver: 'Test Driver',
    vehicle: 'test_car',
    venue: 'test-venue',
    channels: [
      { name: 'Car Pos Norm', shortName: 'Car Pos', freq: 10, values: pos },
      { name: 'Lap Number', shortName: 'Lap', freq: 10, dtypeA: 3, dtype: 2, values: lapNumber },
      { name: 'Lap Time', shortName: 'LapTime', unit: 's', freq: 10, values: lapTime },
      { name: 'Lap Distance', shortName: 'LDistanc', unit: 'm', freq: 10, values: distance },
      { name: 'Ground Speed', shortName: 'Gnd Spd', unit: 'kph', freq: 10, values: speed },
      ...extra,
    ],
  });
}

describe('openSession', () => {
  it('exposes session metadata', () => {
    const session = openSession(sampleBytes(), { fileName: 'sample.ld' });

    expect(session.meta.fileName).toBe('sample.ld');
    expect(session.meta.driver).toBe('Test Driver');
    expect(session.meta.venue).toBe('test-venue');
    expect(session.meta.channels).toHaveLength(5);
    expect(session.meta.duration).toBeCloseTo(30, 3);
  });

  it('marks the Lap Number channel as discrete and Car Pos Norm as continuous', () => {
    const session = openSession(sampleBytes());
    const byName = new Map(session.meta.channels.map((c) => [c.name, c]));

    expect(byName.get('Lap Number')?.discrete).toBe(true);
    expect(byName.get('Car Pos Norm')?.discrete).toBe(false);
  });

  it('indexes laps and marks the partial ones', () => {
    const session = openSession(sampleBytes());
    expect(session.meta.laps.map((l) => l.complete)).toEqual([false, true, true, false]);
  });

  it('takes the track length from the .ldx when present', () => {
    const session = openSession(sampleBytes(), {
      ldxText: '<LDXFile><Numeric Id="Venue Length" Value="1000" Unit="m"/></LDXFile>',
    });

    expect(session.meta.trackLength).toBeCloseTo(1000, 3);
    expect(session.grid.approximate).toBe(false);
    expect(session.grid.points).toBe(1000);
  });

  it('estimates the track length from Lap Distance when there is no .ldx', () => {
    const session = openSession(sampleBytes());

    expect(session.grid.approximate).toBe(true);
    expect(session.grid.length).toBeCloseTo(1000, 0);
  });

  it('caches decoded channels', () => {
    const session = openSession(sampleBytes());
    expect(session.channel('Car Pos Norm')).toBe(session.channel('Car Pos Norm'));
  });

  it('reports an unknown channel by name', () => {
    const session = openSession(sampleBytes());
    expect(() => session.channel('Nope')).toThrow(/no channel named "Nope"/);
  });

  it('returns lap series on the distance grid', () => {
    const session = openSession(sampleBytes());
    const series = session.series(1, 'Lap Time');

    expect(series).toHaveLength(session.grid.points);
    expect(series[0]).toBeCloseTo(0, 2);
    expect(series[series.length - 1]).toBeGreaterThan(8);
  });

  it('gives a zero delta for a lap against itself', () => {
    const session = openSession(sampleBytes());
    const delta = session.delta(1, 1);
    expect([...delta].every((v) => v === 0)).toBe(true);
  });

  it('refuses to build a series for an unknown lap', () => {
    const session = openSession(sampleBytes());
    expect(() => session.series(99, 'Lap Time')).toThrow(/no lap 99/);
  });

  it('requires the channels lap detection depends on', () => {
    const bytes = buildLd({ channels: [{ name: 'Speed', freq: 10, values: [1, 2, 3] }] });
    expect(() => openSession(bytes)).toThrow(/Car Pos Norm/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/core/session.test.ts`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 3: Implement openSession**

Create `src/core/session.ts`:

```ts
import { parseChannels } from './ld/channels';
import { decodeChannel, isDiscrete } from './ld/decode';
import { parseHeader } from './ld/header';
import { parseLdx } from './ld/ldx';
import type { LdChannel } from './ld/types';
import { ByteWindow } from './ld/window';
import { computeDelta } from './lap/delta';
import { despikeDistance } from './lap/despike';
import { buildLapIndex, type ChannelSeries, type LapMeta } from './lap/lapIndex';
import { buildLapBasis, makeDistanceGrid, resampleToDistance } from './lap/resample';
import type { ChannelMeta, DistanceGrid, SessionId, VehicleInfo } from './types';

const CAR_POS_NORM = 'Car Pos Norm';
const LAP_NUMBER = 'Lap Number';
const LAP_TIME = 'Lap Time';
const LAP_INVALIDATED = 'Lap Invalidated';
const LAP_DISTANCE = 'Lap Distance';
const GROUND_SPEED = 'Ground Speed';

export type SessionMeta = {
  id: SessionId;
  fileName: string;
  driver: string;
  vehicle: string;
  venue: string;
  eventName: string;
  sessionName: string;
  recordedAt: string;
  /** Seconds; the longest channel wins. */
  duration: number;
  channels: ChannelMeta[];
  laps: LapMeta[];
  trackLength?: number;
  vehicleInfo?: VehicleInfo;
};

export type Session = {
  meta: SessionMeta;
  grid: DistanceGrid;
  channel(name: string): Float32Array;
  series(lapNumber: number, channelName: string): Float32Array;
  delta(referenceLap: number, comparisonLap: number): Float32Array;
};

export type OpenSessionOptions = {
  fileName?: string;
  id?: SessionId;
  ldxText?: string;
};

export function openSession(bytes: Uint8Array, options: OpenSessionOptions = {}): Session {
  const win = new ByteWindow(bytes);
  const header = parseHeader(win);
  const ldChannels = parseChannels(win, header);

  const byName = new Map<string, LdChannel>();
  for (const channel of ldChannels) byName.set(channel.name, channel);

  const decoded = new Map<string, Float32Array>();
  const channel = (name: string): Float32Array => {
    const cached = decoded.get(name);
    if (cached) return cached;
    const ld = byName.get(name);
    if (!ld) throw new Error(`no channel named "${name}" in this session`);
    const values = decodeChannel(win, ld);
    decoded.set(name, values);
    return values;
  };

  const series = (name: string): ChannelSeries => {
    const ld = byName.get(name);
    if (!ld) throw new Error(`no channel named "${name}" in this session`);
    return { values: channel(name), freq: ld.freq };
  };

  for (const required of [CAR_POS_NORM, LAP_NUMBER, LAP_TIME]) {
    if (!byName.has(required)) {
      throw new Error(`this file has no "${required}" channel, so laps cannot be detected`);
    }
  }

  const laps = buildLapIndex({
    carPosNorm: series(CAR_POS_NORM),
    lapNumber: series(LAP_NUMBER),
    lapTime: series(LAP_TIME),
    ...(byName.has(LAP_INVALIDATED) ? { lapInvalidated: series(LAP_INVALIDATED) } : {}),
  });

  const ldx = options.ldxText ? parseLdx(options.ldxText) : undefined;
  const { length, approximate } = resolveTrackLength(ldx?.trackLength, byName, series, laps);
  const grid = makeDistanceGrid(length, { approximate });

  const meta: SessionMeta = {
    id: options.id ?? `${header.venue}-${header.date}-${header.time}`,
    fileName: options.fileName ?? '',
    driver: header.driver,
    vehicle: header.vehicle,
    venue: header.venue,
    eventName: header.eventName,
    sessionName: header.sessionName,
    recordedAt: `${header.date} ${header.time}`.trim(),
    duration: Math.max(...ldChannels.map((c) => c.count / c.freq)),
    channels: ldChannels.map(toChannelMeta),
    laps,
    ...(approximate ? {} : { trackLength: length }),
    ...(ldx && Object.keys(ldx.vehicle).length > 0 ? { vehicleInfo: ldx.vehicle } : {}),
  };

  const seriesCache = new Map<string, Float32Array>();
  const lapSeries = (lapNumber: number, channelName: string): Float32Array => {
    const key = `${lapNumber} ${channelName}`;
    const cached = seriesCache.get(key);
    if (cached) return cached;

    const lap = laps.find((l) => l.number === lapNumber);
    if (!lap) throw new Error(`no lap ${lapNumber} in this session`);

    const ld = byName.get(channelName);
    if (!ld) throw new Error(`no channel named "${channelName}" in this session`);

    const basis = buildLapBasis(series(CAR_POS_NORM), lap);
    const values = resampleToDistance(series(channelName), basis, grid, isDiscrete(ld));
    seriesCache.set(key, values);
    return values;
  };

  return {
    meta,
    grid,
    channel,
    series: lapSeries,
    delta: (referenceLap, comparisonLap) =>
      computeDelta(lapSeries(referenceLap, LAP_TIME), lapSeries(comparisonLap, LAP_TIME)),
  };
}

function toChannelMeta(channel: LdChannel): ChannelMeta {
  return {
    name: channel.name,
    shortName: channel.shortName,
    unit: channel.unit,
    freq: channel.freq,
    count: channel.count,
    discrete: isDiscrete(channel),
  };
}

function resolveTrackLength(
  declared: number | undefined,
  byName: Map<string, LdChannel>,
  series: (name: string) => ChannelSeries,
  laps: LapMeta[],
): { length: number; approximate: boolean } {
  if (declared !== undefined && declared > 0) return { length: declared, approximate: false };

  if (byName.has(LAP_DISTANCE) && byName.has(GROUND_SPEED)) {
    const distance = series(LAP_DISTANCE);
    const clean = despikeDistance(distance, series(GROUND_SPEED));
    const lengths: number[] = [];

    for (const lap of laps) {
      if (!lap.complete) continue;
      const from = Math.round(lap.startTime * distance.freq);
      const to = Math.min(Math.round(lap.endTime * distance.freq), clean.length - 1);
      const covered = clean[to] - clean[from];
      if (covered > 0) lengths.push(covered);
    }

    if (lengths.length > 0) {
      lengths.sort((a, b) => a - b);
      return { length: lengths[Math.floor(lengths.length / 2)], approximate: true };
    }
  }

  throw new Error(
    'track length is unknown: provide the .ldx file, or a Lap Distance and Ground Speed channel',
  );
}
```

- [ ] **Step 4: Re-export the public surface**

Replace `src/core/index.ts`:

```ts
export const CORE_VERSION = '0.1.0';

export { openSession } from './session';
export type { OpenSessionOptions, Session, SessionMeta } from './session';
export { computeDelta } from './lap/delta';
export { makeDistanceGrid } from './lap/resample';
export type { LapMeta } from './lap/lapIndex';
export type { ChannelMeta, DistanceGrid, LapRef, SessionId, VehicleInfo } from './types';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/core/session.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, every suite green.

- [ ] **Step 7: Commit**

```bash
git add src/core/session.ts src/core/session.test.ts src/core/index.ts
git commit -m "feat(core): assemble sessions with cached channels, series and deltas"
```

---

### Task 14: Integration tests against the real files

**Files:**
- Create: `test/fixtures/samples.ts`, `test/integration/realFiles.test.ts`

**Interfaces:**
- Consumes: `openSession`
- Produces: `findSampleFiles(): SampleFile[]` where `type SampleFile = { name: string; ldPath: string; ldxPath?: string }`

These tests assert invariants rather than golden numbers, and skip themselves
when `temp/example` is absent, because the samples are gitignored.

- [ ] **Step 1: Write the sample locator**

Create `test/fixtures/samples.ts`:

```ts
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type SampleFile = { name: string; ldPath: string; ldxPath?: string };

const SAMPLE_ROOT = join(process.cwd(), 'temp', 'example');

export function samplesAvailable(): boolean {
  return existsSync(SAMPLE_ROOT);
}

export function findSampleFiles(): SampleFile[] {
  if (!samplesAvailable()) return [];

  const found: SampleFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (entry.toLowerCase().endsWith('.ld')) {
        const ldxPath = `${path}x`;
        found.push({
          name: entry,
          ldPath: path,
          ...(existsSync(ldxPath) ? { ldxPath } : {}),
        });
      }
    }
  };
  walk(SAMPLE_ROOT);

  return found.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 2: Write the integration test**

Create `test/integration/realFiles.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openSession } from '../../src/core';
import { findSampleFiles, samplesAvailable } from '../fixtures/samples';

const samples = findSampleFiles();

describe.skipIf(!samplesAvailable() || samples.length === 0)('real MoTeC files', () => {
  for (const sample of samples) {
    describe(sample.name, () => {
      const session = openSession(new Uint8Array(readFileSync(sample.ldPath)), {
        fileName: sample.name,
        ...(sample.ldxPath ? { ldxText: readFileSync(sample.ldxPath, 'latin1') } : {}),
      });

      it('reads 186 channels with unique full names', () => {
        expect(session.meta.channels).toHaveLength(186);
        const names = new Set(session.meta.channels.map((c) => c.name));
        expect(names.size).toBe(186);
      });

      it('has non-unique short names, so they are labels only', () => {
        const shortNames = new Set(session.meta.channels.map((c) => c.shortName));
        expect(shortNames.size).toBeLessThan(186);
      });

      it('reports the driver, vehicle and venue', () => {
        expect(session.meta.driver.length).toBeGreaterThan(0);
        expect(session.meta.vehicle.length).toBeGreaterThan(0);
        expect(session.meta.venue.length).toBeGreaterThan(0);
      });

      it('finds complete laps', () => {
        const complete = session.meta.laps.filter((l) => l.complete);
        expect(complete.length).toBeGreaterThan(5);
      });

      it('agrees with the Lap Number channel on how many lap changes there are', () => {
        const lapNumber = session.channel('Lap Number');
        let transitions = 0;
        for (let i = 1; i < lapNumber.length; i++) {
          if (lapNumber[i] !== lapNumber[i - 1]) transitions++;
        }
        const wraps = session.meta.laps.length - 1;
        expect(wraps).toBe(transitions);
      });

      it('has lap times consistent with the wrap boundaries', () => {
        for (const lap of session.meta.laps) {
          if (!lap.complete) continue;
          const span = lap.endTime - lap.startTime;
          expect(Math.abs(lap.lapTime - span)).toBeLessThan(0.25);
        }
      });

      it('reads the track length from the .ldx', () => {
        if (!sample.ldxPath) return;
        expect(session.grid.approximate).toBe(false);
        expect(session.meta.trackLength).toBeGreaterThan(1000);
        expect(session.meta.trackLength).toBeLessThan(10000);
      });

      it('resamples Ground Speed onto the grid with finite values', () => {
        const lap = session.meta.laps.find((l) => l.complete);
        expect(lap).toBeDefined();

        const speed = session.series(lap!.number, 'Ground Speed');
        expect(speed).toHaveLength(session.grid.points);
        expect([...speed].every(Number.isFinite)).toBe(true);
        expect(Math.max(...speed)).toBeGreaterThan(100);
      });

      it('produces a zero delta for a lap against itself', () => {
        const lap = session.meta.laps.find((l) => l.complete)!;
        const delta = session.delta(lap.number, lap.number);
        expect([...delta].every((v) => v === 0)).toBe(true);
      });

      it('produces a delta that starts near zero between two laps', () => {
        const complete = session.meta.laps.filter((l) => l.complete);
        expect(complete.length).toBeGreaterThan(1);

        const delta = session.delta(complete[0].number, complete[1].number);
        expect(delta).toHaveLength(session.grid.points);
        expect(Math.abs(delta[0])).toBeLessThan(0.5);
        expect([...delta].every(Number.isFinite)).toBe(true);
      });
    });
  }
});
```

- [ ] **Step 3: Run the integration tests**

Run: `npm test -- test/integration/realFiles.test.ts`
Expected: PASS. With `temp/example` present, both sample files are exercised;
without it, the suite reports as skipped rather than failing.

- [ ] **Step 4: Verify the skip path works**

Run: `mv temp temp-hidden && npm test -- test/integration/realFiles.test.ts; mv temp-hidden temp`
Expected: the suite is skipped, the command still exits 0.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS across every suite.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/samples.ts test/integration/realFiles.test.ts
git commit -m "test: assert core invariants against the real MoTeC samples"
```

---

## Deferred to later plans

Recorded here so nothing in the spec is silently dropped:

- **`Car Heading` ±180° interpolation** (spec §9) — belongs with track map
  generation in plan 3; nothing in this plan reads headings.
- **The `Car Pos Norm` → `Lap Distance` → speed-integral fallback cascade**
  (spec §9) — this plan implements despiking and uses `Lap Distance` only to
  estimate the track length. `openSession` currently throws when `Car Pos Norm`
  is missing; the full cascade arrives with plan 2, where a real file without
  that channel can actually be exercised.
- **Confirming the `(dtype_a = 0, dtype)` reading against MoTeC i2** (spec §2.2,
  §10) — `decodeChannel` treats those as integers and the integration tests
  exercise them, but the values have not been cross-checked with i2. Do this
  before trusting flag channels in the UI.
- **Comparing laps across sessions and blocking different venues** (spec §9) —
  needs more than one session loaded, which arrives with the worker in plan 2.
- **The async `ByteSource` interface** (spec §6) — `openSession` here takes a
  `Uint8Array` synchronously, which keeps `core` pure and trivially testable.
  `ByteWindow` already carries a `base` offset, so a window over a partial read
  behaves identically to one over the whole file; that is the seam plan 2 uses
  to introduce `ByteSource` in the worker without touching any parsing code.
