# Chart Distance Axis and Redux DevTools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render chart x values as distance in metres and expose named application-state transitions in Redux DevTools.

**Architecture:** The common uPlot options declare the shared x scale as non-temporal, so both chart types inherit the correction. The existing zustand vanilla state creator is wrapped in the official `devtools` middleware without changing the exported store API, and every mutation carries a stable action name.

**Tech Stack:** TypeScript, uPlot, zustand 5, Vitest

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/charts/options.ts` | Shared numeric distance scale and x-axis label for all charts |
| `src/app/charts/__tests__/options.test.ts` | Regression coverage for uPlot's temporal-scale default |
| `src/app/state/store.ts` | Named Redux DevTools middleware connection and action events |
| `src/app/state/__tests__/devtools.test.ts` | Browser-extension boundary test for the middleware integration |

---

### Task 1: Make the shared x-axis a distance scale

**Files:**
- Modify: `src/app/charts/options.ts:24-47`
- Test: `src/app/charts/__tests__/options.test.ts`

- [ ] **Step 1: Write the failing scale regression test**

Add this test inside `describe('deltaChartOptions', ...)`:

```ts
  it('treats the x values as distance rather than Unix timestamps', () => {
    const options = deltaChartOptions({ width: 800, height: 200, lines: LINES });

    expect(options.scales?.x?.time).toBe(false);
    expect(options.axes?.[0]?.label).toBe('Distance (m)');
  });
```

- [ ] **Step 2: Run the focused test and verify the current default is exposed**

Run:

```bash
docker compose run --rm app pnpm test src/app/charts/__tests__/options.test.ts
```

Expected: FAIL because `options.scales?.x` and the x-axis label are undefined.

- [ ] **Step 3: Configure the common scale and axis**

In `base`, add `scales` and label the first axis:

```ts
function base(params: ChartParams): Omit<uPlot.Options, 'series'> {
  return {
    width: params.width,
    height: params.height,
    scales: {
      x: { time: false },
    },
    cursor: {
      // Only x is shared: two channels on different scales must keep their own
      // y, or a zoom on one would squash the other.
      sync: { key: SYNC_KEY, scales: ['x', null] },
      drag: { x: true, y: false, setScale: true },
    },
    legend: { live: true },
    axes: [
      {
        label: 'Distance (m)',
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
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
docker compose run --rm app pnpm test src/app/charts/__tests__/options.test.ts
```

Expected: PASS, including the new numeric distance-scale assertion.

- [ ] **Step 5: Commit the chart correction when explicitly requested**

```bash
git add src/app/charts/options.ts src/app/charts/__tests__/options.test.ts
git commit -m "fix(app): render chart x axes as distance"
```

---

### Task 2: Connect the application store to Redux DevTools

**Files:**
- Modify: `src/app/state/store.ts`
- Create: `src/app/state/__tests__/devtools.test.ts`

- [ ] **Step 1: Write the failing extension-boundary test**

Create `src/app/state/__tests__/devtools.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('appStore Redux DevTools integration', () => {
  it('opens a named connection and reports named state transitions', async () => {
    const send = vi.fn();
    const unsubscribe = vi.fn();
    const connect = vi.fn(() => ({
      init: vi.fn(),
      send,
      subscribe: vi.fn(),
      unsubscribe,
    }));
    vi.stubGlobal('window', {
      __REDUX_DEVTOOLS_EXTENSION__: { connect },
    });
    vi.resetModules();

    const { appStore } = await import('@app/state/store');
    appStore.getState().setCursor(42);

    expect(connect).toHaveBeenCalledWith({ name: 'LapLedger' });
    expect(send).toHaveBeenCalledWith(
      { type: 'cursor/set' },
      expect.objectContaining({ cursor: 42 }),
    );

    appStore.devtools.cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the focused test and verify the store is not connected**

Run:

```bash
docker compose run --rm app pnpm test src/app/state/__tests__/devtools.test.ts
```

Expected: FAIL because the extension's `connect` function is never called.

- [ ] **Step 3: Wrap the state creator and name every mutation**

Add the middleware import:

```ts
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
```

Wrap the existing creator and add the indicated third argument to each `set` call:

```ts
export const appStore = createStore<AppState>()(
  devtools(
    (set, get) => ({
      ...initial(),

      addSession(session) {
        set((state) => ({ sessions: [...state.sessions, session] }), undefined, 'session/add');
        if (get().slots[0] === null) {
          const reference = pickDefaultReference(session);
          if (reference) get().setReference(reference);
        }
      },

      removeSession(sessionId) {
        set(
          (state) => ({
            sessions: state.sessions.filter((session) => session.id !== sessionId),
            slots: state.slots.map((slot) => (slot?.sessionId === sessionId ? null : slot)),
          }),
          undefined,
          'session/remove',
        );
      },

      setReference(lap) {
        set(
          (state) => {
            const slots = state.slots.map((slot) => (sameLap(slot, lap) ? null : slot));
            slots[0] = lap;
            for (let index = 1; index < slots.length; index++) {
              const comparison = slots[index];
              if (comparison && !canCompare(state.sessions, lap, comparison)) slots[index] = null;
            }
            return { slots };
          },
          undefined,
          'lap/setReference',
        );
      },

      toggleComparison(lap) {
        set(
          (state) => {
            if (sameLap(state.slots[0], lap)) return state;

            const slots = [...state.slots];
            const held = slotOf(slots, lap);
            if (held > 0) {
              slots[held] = null;
              return { slots };
            }

            const reference = slots[0];
            const against = reference ? [reference] : drawnLaps(slots.slice(1));
            if (against.some((existing) => !canCompare(state.sessions, existing, lap))) return state;

            const free = slots.findIndex((slot, index) => index > 0 && slot === null);
            if (free === -1) return state;
            slots[free] = lap;
            return { slots };
          },
          undefined,
          'lap/toggleComparison',
        );
      },

      setCursor(distance) {
        set({ cursor: distance }, undefined, 'cursor/set');
      },

      addChannel(name) {
        set(
          (state) =>
            state.channels.includes(name) ? state : { channels: [...state.channels, name] },
          undefined,
          'channel/add',
        );
      },

      removeChannel(name) {
        set(
          (state) => ({ channels: state.channels.filter((channel) => channel !== name) }),
          undefined,
          'channel/remove',
        );
      },

      reset() {
        set(initial(), undefined, 'store/reset');
      },
    }),
    { name: 'LapLedger' },
  ),
);
```

Preserve the existing explanatory comments around the unchanged comparison logic.

- [ ] **Step 4: Run the DevTools and store tests**

Run:

```bash
docker compose run --rm app pnpm test src/app/state/__tests__/devtools.test.ts src/app/state/__tests__/store.test.ts
```

Expected: PASS; the fake extension observes `LapLedger` and `cursor/set`, and all existing state behavior remains unchanged.

- [ ] **Step 5: Commit the DevTools integration when explicitly requested**

```bash
git add src/app/state/store.ts src/app/state/__tests__/devtools.test.ts
git commit -m "feat(app): expose named state actions in Redux DevTools"
```

---

### Task 3: Verify the complete correction

**Files:**
- No additional files

- [ ] **Step 1: Run all tests**

Run:

```bash
make test
```

Expected: every test passes without skipped integration tests.

- [ ] **Step 2: Run repository checks**

Run:

```bash
make check
```

Expected: both `lint-check` and `types-check` exit 0.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git diff --check
```

Expected: no whitespace errors; the diff contains only the distance-scale regression fix and Redux DevTools integration.
