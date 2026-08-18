# Visual System and Widget Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed comparison screen with the Apex visual system, desktop shell, and draggable one-widget-per-channel workspace.

**Architecture:** Keep this stage inside `src/app`: a pure serialisable layout model feeds a thin `react-grid-layout` adapter, while a widget registry maps descriptors to React content. Theme tokens remain the single colour source for DOM and canvas code; workspace state replaces the legacy global channel list but leaves telemetry and worker APIs unchanged.

**Tech Stack:** React 19, TypeScript, Zustand, uPlot, react-grid-layout 2, Radix Dialog/Tooltip, Remix Icon, Vitest, Testing Library, jsdom

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/app/theme/palette.ts` | Apex colour tokens and lap slots |
| `src/app/theme/dither.ts` | Deterministic 8 x 8 Bayer masks |
| `src/app/theme/theme.css` | Fonts, focus, controls, and dither utilities |
| `src/app/layout/model.ts` | Serializable widget types and rectangles |
| `src/app/layout/defaults.ts` | Exact ten-widget default layout |
| `src/app/layout/validation.ts` | Runtime descriptor and collision validation |
| `src/app/layout/gridAdapter.ts` | react-grid-layout conversion and row sizing |
| `src/app/widgets/definitions.ts` | Pure widget metadata and policies |
| `src/app/widgets/registry.tsx` | Widget type to React component mapping |
| `src/app/widgets/WidgetFrame.tsx` | Shared window chrome |
| `src/app/widgets/Workspace.tsx` | Measured draggable/resizable grid |
| `src/app/widgets/AddWidgetDialog.tsx` | Widget/channel combobox |
| `src/app/shell/Header.tsx` | Global analysis and workspace commands |
| `src/app/shell/Footer.tsx` | Layout placeholder, GitHub link, plain version |
| `src/app/shell/status.ts` | Deterministic shell status aggregation |

### Task 1: Install UI Dependencies and Vendor Fonts

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `compose.yaml`
- Create: `tools/font-converter/Dockerfile`
- Create: `src/app/assets/fonts/vcr-osd-mono.woff2`
- Create: `src/app/assets/fonts/VCR-OSD-MONO-NOTICE.txt`
- Create: `src/app/assets/fonts/matrix-sans-video.woff2`
- Create: `src/app/assets/fonts/OFL.txt`

- [ ] **Step 1: Verify release-age-compatible dependency versions**

Run:

```bash
docker compose run --rm app pnpm view react-grid-layout versions --json
docker compose run --rm app pnpm view @radix-ui/react-dialog versions --json
docker compose run --rm app pnpm view @testing-library/react versions --json
```

Expected: select the newest versions at least seven days old; if the versions
below no longer satisfy that rule, use the newest eligible older versions.

- [ ] **Step 2: Add dependencies in the container**

Run:

```bash
docker compose run --rm app pnpm add react-grid-layout@^2.2.4 react-resizable@^3.1.3 @radix-ui/react-dialog@^1.1.23 @radix-ui/react-tooltip@^1.2.16 remixicon@^4.9.1
docker compose run --rm app pnpm add -D @testing-library/dom@^10.4.1 @testing-library/react@^16.3.2 @testing-library/user-event@^14.6.1 jsdom@^30.0.1
```

Expected: `package.json` and `pnpm-lock.yaml` change; no dependency requests an
install lifecycle exception.

- [ ] **Step 3: Add a pinned font-conversion service**

```dockerfile
FROM python:3.13-slim
RUN pip install --no-cache-dir "fonttools[woff]==4.59.0" "brotli==1.1.0"
WORKDIR /work
```

Add a Compose `font-tools` service built from that Dockerfile with `.:/work`.
All download, extraction, hashing, and conversion commands below run in
containers.

- [ ] **Step 4: Download and vendor both fonts**

Run:

```bash
docker compose run --rm app sh -lc 'mkdir -p temp/font-sources src/app/assets/fonts && wget -O temp/font-sources/vcr-osd-mono.zip "https://dl.dafont.com/dl/?f=vcr_osd_mono" && wget -O temp/font-sources/MatrixSans-v1.722.zip "https://github.com/FriedOrange/MatrixSans/releases/download/v1.722/MatrixSans-v1.722.zip"'
docker compose run --rm app sha256sum temp/font-sources/MatrixSans-v1.722.zip
docker compose run --rm app sh -lc 'unzip -p temp/font-sources/vcr-osd-mono.zip VCR_OSD_MONO_1.001.ttf > temp/font-sources/vcr-osd-mono.ttf && unzip -p temp/font-sources/MatrixSans-v1.722.zip MatrixSans-v1.722/fonts/webfonts/MatrixSansVideo-Regular.woff2 > src/app/assets/fonts/matrix-sans-video.woff2 && unzip -p temp/font-sources/MatrixSans-v1.722.zip MatrixSans-v1.722/OFL.txt > src/app/assets/fonts/OFL.txt'
docker compose run --rm font-tools pyftsubset temp/font-sources/vcr-osd-mono.ttf --output-file=src/app/assets/fonts/vcr-osd-mono.woff2 --flavor=woff2 '--unicodes=*' '--layout-features=*'
```

The SHA-256 output must be:

```text
0b864d016e15155779fb524472d39c14e22ab396d43bc2bf09fd1d4dbadf1dee  temp/font-sources/MatrixSans-v1.722.zip
```

Create `VCR-OSD-MONO-NOTICE.txt` with:

```text
VCR OSD Mono 1.001
Author: Riciery Leal
Source: https://www.dafont.com/vcr-osd-mono.font
DaFont classification at acquisition: 100% Free
The upstream archive contained no separate licence or readme.
Vendoring and WOFF2 conversion were accepted by the LapLedger project owner.
This notice does not describe the font as OFL or add author terms.
```

- [ ] **Step 5: Reinstall and verify dependency policy**

Run:

```bash
make install
docker compose run --rm app pnpm ignored-builds
```

Expected: install succeeds and none of the new packages requires an allowed
build script.

- [ ] **Step 6: Commit dependencies and assets**

```bash
git add package.json pnpm-lock.yaml compose.yaml tools/font-converter src/app/assets/fonts
git commit -m "build(app): add workspace UI dependencies and fonts"
```

### Task 2: Replace the Theme with Apex Tokens

**Files:**
- Modify: `src/app/theme/palette.ts`
- Modify: `src/app/theme/__tests__/palette.test.ts`
- Create: `src/app/theme/dither.ts`
- Create: `src/app/theme/__tests__/dither.test.ts`
- Create: `src/app/theme/contrast.ts`
- Create: `src/app/theme/__tests__/contrast.test.ts`
- Create: `src/app/theme/theme.css`
- Modify: `src/app/main.tsx`

- [ ] **Step 1: Write failing palette and dither tests**

Add exact palette assertions and this dither test:

```ts
import { describe, expect, it } from 'vitest';

import { bayerMask } from '@app/theme/dither';

describe('bayerMask', () => {
  it.each([[1, 1], [5, 3], [10, 6], [50, 32]])(
    'enables the specified rank count for nominal %s%% density',
    (density, count) => {
      const mask = bayerMask(density);
      expect(mask).toHaveLength(64);
      expect(mask.filter(Boolean)).toHaveLength(count);
    },
  );
});
```

Add contrast tests requiring text contrast of 4.5:1, series contrast of 3:1
against `panel`, normal-vision CIEDE2000 distance of at least 15 between every
lap-slot pair, and simulated protan/deutan/tritan distance of at least 8.

The role/surface matrix is exact:

```ts
const REQUIRED_TEXT_PAIRS = [
  ['textPrimary', 'background'],
  ['textPrimary', 'barSurface'],
  ['textPrimary', 'controlSurface'],
  ['textPrimary', 'panel'],
  ['textSecondary', 'background'],
  ['textSecondary', 'barSurface'],
  ['textSecondary', 'panel'],
  ['numeric', 'background'],
  ['numeric', 'panel'],
] as const;
```

Also assert sequential scale Lab lightness strictly increases and the diverging
gain/loss endpoints remain distinguishable under all three CVD simulations.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
docker compose run --rm app pnpm test src/app/theme/__tests__
```

Expected: FAIL because Apex tokens and `bayerMask` do not exist.

- [ ] **Step 3: Implement the palette and Bayer generator**

Use these public tokens:

```ts
export const palette = {
  background: '#080a08',
  barSurface: '#10150f',
  controlSurface: '#1a2318',
  panel: '#0d100e',
  border: '#2c3a2d',
  gridLine: '#1d251c',
  textPrimary: '#cbe0c0',
  textSecondary: '#8fa688',
  textMuted: '#5c7057',
  numeric: '#f0a830',
  accentHover: '#ffd08a',
  active: '#8fd07a',
  warning: '#ffd08a',
  critical: '#e0603c',
} as const;

export const LAP_SLOTS = ['#f0a830', '#5fc9d9', '#d98ac0'] as const;
```

Implement `bayerMask(density: 1 | 5 | 10 | 50): boolean[]` from the standard
8 x 8 Bayer rank matrix and rank counts `{1: 1, 5: 3, 10: 6, 50: 32}`.

Implement `contrastRatio`, sRGB-to-Lab conversion, CIEDE2000, and deterministic
Brettel-style protan/deutan/tritan transforms in `contrast.ts`; keep them pure so
the same validator can become a release gate.

- [ ] **Step 4: Define fonts and visual primitives**

In `theme.css`, add exact local faces and square controls:

```css
@font-face {
  font-family: 'VCR OSD Mono';
  src: url('../assets/fonts/vcr-osd-mono.woff2') format('woff2');
  font-display: block;
}

@font-face {
  font-family: 'Matrix Sans Video';
  src: url('../assets/fonts/matrix-sans-video.woff2') format('woff2');
  font-display: block;
}

:root {
  color-scheme: dark;
  font-family: 'Matrix Sans Video', sans-serif;
  font-size: 13px;
}

button, input, [role='button'] { border-radius: 0; }
:focus-visible { outline: 2px solid var(--ll-numeric); outline-offset: 2px; }
.telemetry-value, .widget-title { font-family: 'VCR OSD Mono', monospace; }
```

Generate CSS pattern variables once from `bayerMask` during startup; do not copy
the ignored `temp/dither` files into runtime.

- [ ] **Step 5: Import CSS in deterministic order and run tests**

```ts
import 'remixicon/fonts/remixicon.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import '@app/theme/theme.css';
import '@app/app.css';
```

Run:

```bash
docker compose run --rm app pnpm test src/app/theme/__tests__
make check
```

Expected: tests and checks pass.

- [ ] **Step 6: Commit the visual tokens**

```bash
git add src/app/theme src/app/main.tsx
git commit -m "feat(app): establish the Apex visual system"
```

### Task 3: Define and Validate the Widget Layout Model

**Files:**
- Create: `src/app/layout/model.ts`
- Create: `src/app/layout/defaults.ts`
- Create: `src/app/layout/validation.ts`
- Create: `src/app/layout/__tests__/defaults.test.ts`
- Create: `src/app/layout/__tests__/validation.test.ts`

- [ ] **Step 1: Write failing default-layout tests**

Assert ten stable descriptors, unique IDs, no overlaps, and exact rectangles:

```ts
expect(DEFAULT_WIDGETS.map(({ id, rect }) => [id, rect])).toEqual([
  ['lap-table', { x: 0, y: 0, w: 5, h: 8 }],
  ['cursor-data', { x: 0, y: 8, w: 5, h: 4 }],
  ['channel-throttle', { x: 5, y: 0, w: 11, h: 3 }],
  ['channel-brake', { x: 5, y: 3, w: 11, h: 3 }],
  ['channel-steering', { x: 5, y: 6, w: 11, h: 2 }],
  ['channel-lateral-g', { x: 5, y: 8, w: 5, h: 4 }],
  ['channel-longitudinal-g', { x: 10, y: 8, w: 6, h: 4 }],
  ['track-map', { x: 16, y: 0, w: 8, h: 5 }],
  ['delta', { x: 16, y: 5, w: 8, h: 4 }],
  ['channel-ground-speed', { x: 16, y: 9, w: 8, h: 3 }],
]);
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose run --rm app pnpm test src/app/layout/__tests__
```

Expected: FAIL because layout modules do not exist.

- [ ] **Step 3: Implement discriminated widget types**

```ts
export type WidgetRect = { x: number; y: number; w: number; h: number };

export type TrackMapWidgetConfig = {
  mode:
    | { kind: 'plain' }
    | { kind: 'channel'; lap: LapRef | null; channel: string | null }
    | { kind: 'delta'; comparison: LapRef | null };
  highlightedSection: string | null;
};

type WidgetBase<TType extends string, TConfig> = {
  id: string;
  type: TType;
  config: TConfig;
  rect: WidgetRect;
};

export type WidgetInstance =
  | WidgetBase<'lap-table', Record<string, never>>
  | WidgetBase<'cursor-data', Record<string, never>>
  | WidgetBase<'delta', Record<string, never>>
  | WidgetBase<'track-map', TrackMapWidgetConfig>
  | WidgetBase<'channel-chart', { channel: string }>;

export type WidgetType = WidgetInstance['type'];
export type WidgetConfig = WidgetInstance['config'];
type NewWidgetOf<T extends WidgetInstance> = T extends WidgetInstance
  ? Pick<T, 'type' | 'config'>
  : never;
export type NewWidget = NewWidgetOf<WidgetInstance>;
```

Create exact defaults with separate `type` and `config` fields, full names
`Throttle Pos`, `Brake Pos`,
`Steering Angle`, `CG Accel Lateral`, `CG Accel Longitudinal`, and
`Ground Speed`.

- [ ] **Step 4: Implement runtime validation**

Export:

```ts
export function validateWidgets(value: unknown): WidgetInstance[] | null;
export function widgetsOverlap(a: WidgetRect, b: WidgetRect): boolean;
```

Reject unknown config types, duplicate IDs, non-integer/non-finite rectangles,
`x < 0`, `y < 0`, `x + w > 24`, rectangles below the per-type minimum, and
overlaps. Preserve channel names exactly; the full name is the key.

- [ ] **Step 5: Run tests and commit**

```bash
docker compose run --rm app pnpm test src/app/layout/__tests__
make check
git add src/app/layout
git commit -m "feat(app): define the widget layout model"
```

### Task 4: Add the Grid Adapter and Workspace State

**Files:**
- Create: `src/app/layout/gridAdapter.ts`
- Create: `src/app/layout/__tests__/gridAdapter.test.ts`
- Modify: `src/app/state/store.ts`
- Modify: `src/app/state/__tests__/store.test.ts`
- Modify: `src/app/state/__tests__/devtools.test.ts`

- [ ] **Step 1: Write failing adapter and store tests**

Cover immutable rectangle commits, 12-row sizing, close/restore, multiple
channel instances, and exact reset:

```ts
expect(rowHeight(640)).toBe((640 - 11 * 4) / 12);
appStore.getState().closeWidget('channel-brake');
expect(appStore.getState().widgets.some(({ id }) => id === 'channel-brake')).toBe(false);
appStore.getState().resetLayout();
expect(appStore.getState().widgets).toEqual(DEFAULT_WIDGETS);
```

- [ ] **Step 2: Run focused tests to verify failure**

```bash
docker compose run --rm app pnpm test src/app/layout/__tests__/gridAdapter.test.ts src/app/state/__tests__
```

Expected: FAIL because workspace actions are absent.

- [ ] **Step 3: Implement the adapter**

Export exact conversions:

```ts
export function rowHeight(availableHeight: number): number {
  return (availableHeight - 11 * 4) / 12;
}

export function toGridLayout(widgets: readonly WidgetInstance[]): Layout;
export function commitGridLayout(
  widgets: readonly WidgetInstance[],
  layout: readonly LayoutItem[],
): WidgetInstance[];
```

`commitGridLayout` changes only rectangles, validates the result, and returns the
old array if the candidate is invalid.

- [ ] **Step 4: Replace global channel state with widgets**

Change `AppState`:

```ts
widgets: WidgetInstance[];
addWidget(widget: NewWidget): void;
closeWidget(id: string): void;
commitWidgetRects(layout: readonly LayoutItem[]): void;
resetLayout(): void;
```

Remove `channels`, `addChannel`, and `removeChannel`. Singleton widgets restore
their stable default IDs; channel widgets use an injected `createWidgetId()`
whose production implementation calls `crypto.randomUUID()`.

Use DevTools names `widget/add`, `widget/close`, `layout/commit`, and
`layout/reset`.

- [ ] **Step 5: Run tests and commit**

```bash
docker compose run --rm app pnpm test src/app/layout/__tests__ src/app/state/__tests__
make check
git add src/app/layout src/app/state
git commit -m "feat(app): hold the widget workspace in application state"
```

### Task 5: Build Widget Chrome and the Draggable Workspace

**Files:**
- Create: `src/app/widgets/definitions.ts`
- Create: `src/app/widgets/registry.tsx`
- Create: `src/app/widgets/WidgetFrame.tsx`
- Create: `src/app/widgets/Workspace.tsx`
- Create: `src/app/widgets/__tests__/definitions.test.ts`
- Create: `src/app/widgets/__tests__/WidgetFrame.test.tsx`
- Create: `src/app/widgets/__tests__/Workspace.test.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Enable jsdom only for DOM-owned tests**

Use a file annotation rather than changing all core tests:

```ts
// @vitest-environment jsdom
```

Place it at the top of each `.test.tsx` file.

- [ ] **Step 2: Write failing frame and workspace tests**

Assert the title, drag handle, accessible close action, ten default widgets, and
that only stop callbacks commit layouts. Mock the RGL boundary; do not test its
library internals.

- [ ] **Step 3: Implement definitions and WidgetFrame**

Use pure definitions such as:

```ts
export const widgetDefinition = (widget: WidgetInstance) => ({
  title: widget.type === 'channel-chart'
    ? `CHANNEL // ${widget.config.channel.toUpperCase()}`
    : TITLES[widget.type],
  singleton: widget.type !== 'channel-chart',
  minimum: MINIMUMS[widget.type],
});
```

`WidgetFrame` renders `.widget-frame__drag-handle`, one Remix close icon with
`aria-label="Close <title>"`, and a content region that never owns grid logic.

- [ ] **Step 4: Implement the workspace**

Configure RGL with 24 columns, `[4, 4]` margin, no overlap/compaction, collision
prevention, `.widget-frame__drag-handle`, and south-east resize handles. Use
`ResizeObserver` for available width/height. Call `commitWidgetRects` only from
`onDragStop` and `onResizeStop`.

- [ ] **Step 5: Run tests and commit**

```bash
docker compose run --rm app pnpm test src/app/widgets/__tests__
make check
git add src/app/widgets vitest.config.ts
git commit -m "feat(app): add the draggable widget workspace"
```

### Task 6: Extract One Channel per Widget

**Files:**
- Create: `src/app/widgets/ChannelChartWidget.tsx`
- Create: `src/app/widgets/DeltaWidget.tsx`
- Create: `src/app/widgets/LapTableWidget.tsx`
- Create: `src/app/widgets/CursorDataWidget.tsx`
- Create: `src/app/widgets/track-map/TrackMapWidget.tsx`
- Create: `src/app/widgets/__tests__/ChannelChartWidget.test.tsx`
- Modify: `src/app/panels/channels.ts`
- Modify: `src/app/panels/__tests__/channels.test.ts`
- Modify: `src/app/charts/UPlotChart.tsx`
- Modify: `src/app/charts/options.ts`
- Delete: `src/app/panels/ChartStack.tsx`

- [ ] **Step 1: Write failing channel-widget tests**

Assert one configured full channel, local unavailable state, and no requirement
that every session contains the channel. Add a pure availability result:

```ts
type ChannelAvailability = {
  lap: LapRef;
  channel: ChannelMeta | null;
};
```

- [ ] **Step 2: Run tests to verify failure**

```bash
docker compose run --rm app pnpm test src/app/widgets/__tests__/ChannelChartWidget.test.tsx src/app/panels/__tests__/channels.test.ts
```

- [ ] **Step 3: Extract the chart**

Move the single-row behavior from `ChartStack` into `ChannelChartWidget`. Keep
distance-only requests in this plan. Missing channels render an explicit label
for that lap and do not remove available series.

Make `UPlotChart` observe both dimensions and call:

```ts
chart.setSize({ width: Math.max(1, width), height: Math.max(1, height) });
```

Do not recreate the chart on resize.

- [ ] **Step 4: Add stable placeholder widgets**

`CursorDataWidget` renders `Cursor data becomes available after loading a
reference lap.` when no data can be derived.
`widgets/track-map/TrackMapWidget.tsx` renders `No track map loaded.` until the
track-map plan. These are explicit unavailable states,
not fake data.

Wrap existing Lap Table and Delta components in their widget adapters.

- [ ] **Step 5: Register widgets, remove ChartStack, and verify**

```bash
docker compose run --rm app pnpm test src/app/widgets/__tests__ src/app/charts/__tests__ src/app/panels/__tests__
make check
git add src/app/widgets src/app/charts src/app/panels
git commit -m "feat(app): render each telemetry channel as a widget"
```

### Task 7: Build the Header, Footer, and Status Model

**Files:**
- Create: `src/app/shell/IconButton.tsx`
- Create: `src/app/shell/Header.tsx`
- Create: `src/app/shell/Footer.tsx`
- Create: `src/app/shell/AppStatus.tsx`
- Create: `src/app/shell/status.ts`
- Create: `src/app/shell/__tests__/Header.test.tsx`
- Create: `src/app/shell/__tests__/Footer.test.tsx`
- Modify: `src/app/worker/client.ts`
- Modify: `src/app/worker/__tests__/client.test.ts`
- Modify: `src/app/state/store.ts`
- Modify: `src/app/state/__tests__/store.test.ts`
- Modify: `src/app/App.tsx`
- Create: `src/app/shell/__tests__/status.test.ts`
- Modify: `vite.config.ts`
- Create: `src/app/vite-env.d.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing shell tests**

Assert ordered controls, accessible icon labels, `LAYOUT 01`, one GitHub link,
and a version that is not inside an anchor:

```ts
expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
  'href',
  'https://github.com/AlexandrLo/lapledger',
);
expect(screen.getByText(/^v0\.0\.0$/).closest('a')).toBeNull();
```

Test status precedence: loading wins while pending, ready wins over local file
errors when a usable session exists, fatal error requires no usable session.

Add fake-worker tests for native `error` and `messageerror` events. Extend
`TelemetryClient` with:

```ts
subscribeFatal(listener: (message: string) => void): () => void;
```

Either native event rejects every pending request, notifies subscribers once,
and prevents new requests. Add `fatalError: string | null` and
`setFatalError(message)` to Zustand. `App` subscribes on mount; a worker fatal or
uncaught initial bootstrap failure sets that production state. Local request and
file errors do not call `setFatalError`.

- [ ] **Step 2: Inject build metadata**

Add to `package.json`:

```json
"repository": "https://github.com/AlexandrLo/lapledger"
```

In `vite.config.ts`, read package metadata and define:

```ts
define: {
  __APP_VERSION__: JSON.stringify(packageJson.version),
  __REPOSITORY_URL__: JSON.stringify(packageJson.repository),
}
```

Declare both constants in `src/app/vite-env.d.ts`.

- [ ] **Step 3: Implement the shell**

Header order: logo, Open Log, Reset Zoom, Compare, Distance/Time, Add Widget,
Reset Layout. Keep Time, Reset Zoom, and Compare visibly disabled until the next
plan wires their behavior. Footer left is non-interactive `LAYOUT 01`; footer
right is the GitHub link followed by plain `v${__APP_VERSION__}` text.

The logo is a typography-only `LAPLEDGER` wordmark in VCR OSD Mono for this MVP;
do not introduce an unlicensed image asset.

- [ ] **Step 4: Run tests and commit**

```bash
docker compose run --rm app pnpm test src/app/shell/__tests__ src/app/worker/__tests__/client.test.ts src/app/state/__tests__/store.test.ts
make check
git add package.json vite.config.ts src/app/vite-env.d.ts src/app/shell src/app/worker src/app/state src/app/App.tsx
git commit -m "feat(app): add the telemetry application shell"
```

### Task 8: Add Widget Selection and Complete App Composition

**Files:**
- Create: `src/app/widgets/AddWidgetDialog.tsx`
- Create: `src/app/widgets/__tests__/AddWidgetDialog.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/panels/FileDrop.tsx`
- Modify: `src/app/panels/LapTable.tsx`
- Modify: `src/app/app.css`

- [ ] **Step 1: Write failing keyboard and composition tests**

Cover search, ArrowDown, Enter, Escape, singleton restore, channel creation,
metadata dialog focus, destructive-close confirmation, and root drops with no
files ignored.

Add a DOM assertion over the completed shell/workspace that every rendered
`button` contains one `.ri-*` Remix icon element; text-only and icon-only buttons
both follow this rule.

- [ ] **Step 2: Implement the owned combobox**

Use Radix Dialog around an input with `role="combobox"`, `aria-expanded`, and a
list with `role="listbox"`. Maintain an active option index; ArrowDown/ArrowUp
wrap, Enter selects, Escape closes. Singleton selection restores its stable ID;
channel selection creates
`{ type: 'channel-chart', config: { channel: fullName } }`.

- [ ] **Step 3: Compose App and refine Lap Table**

`App` renders Tooltip Provider, Header, Workspace, Footer, and the Add Widget
dialog. Keep root file-drop handling without intercepting pointer-only RGL
drags. Lap reference controls require complete and valid laps; comparisons
require complete laps and may remain invalidated.

Implement the compact session summary and a Radix metadata dialog containing
file name, driver, vehicle, venue, event/session names, recorded time, duration,
track length, and channel/lap counts. The destructive close button opens a
separate confirmation dialog; cancel and Escape restore focus and change
nothing. Disabled controls expose exact reasons: incomplete/invalid reference,
different venue, incomplete comparison, or full comparison slots. This plan's
confirmed callback performs the current in-memory close; the persistence plan
replaces only that callback with durable deletion.

- [ ] **Step 4: Replace fixed CSS with shell/workspace rules**

Use fixed header/footer, plain widget content, 1% workspace dither, 5% bars,
10% widget title bars, and 50% primary buttons. Set all radii to zero. At
1280 x 720 the initial 12 rows must fit without horizontal scroll.

- [ ] **Step 5: Run the complete checkpoint**

```bash
make check
make test
make build
```

Expected: all commands pass; the app builds with ten default widgets and no
legacy `ChartStack` or global `channels` state.

- [ ] **Step 6: Commit the completed workspace**

```bash
git add src/app/App.tsx src/app/app.css src/app/panels src/app/widgets
git commit -m "feat(app): complete the configurable telemetry workspace"
```
