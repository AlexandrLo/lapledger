# Browser Hardening and Release Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining format-validation gaps and prove the complete desktop MVP through deterministic Chromium interaction, accessibility, and visual tests.

**Architecture:** Keep Vitest responsible for pure/unit/integration tests and add a separate containerized Playwright Chromium service for real browser behavior. Browser fixtures use the committed MoTeC files and injected storage/lifecycle seams for deterministic loading, quota, corruption, and screenshot states.

**Tech Stack:** Vitest, Playwright Chromium, Docker Compose, TypeScript, MoTeC i2 evidence, visual snapshots

---

### Task 1: Validate `dtype_a = 0` Flag Channels

**Files:**
- Modify: `src/core/ld/__tests__/decode.test.ts`
- Modify: `tests/integration/realFiles.test.ts`
- Create: `tests/fixtures/motec/i2-flag-observations.json`

- [ ] **Step 1: Import owner-supplied MoTeC i2 observations**

Place the independently collected observations for every available
`dtype_a = 0` flag width into this schema:

```json
{
  "recording": "knockhill-cupra-tcr.ld",
  "source": "MoTeC i2",
  "channels": [
    {
      "name": "Lap Invalidated",
      "dtypeA": 0,
      "dtype": 4,
      "samples": [{ "index": 0, "value": 0 }]
    }
  ]
}
```

Include at least one transition, not only zero, for each observed width. Do not
derive expected values through LapLedger. Stop this task if the owner-supplied
evidence is absent or does not identify its recording and MoTeC i2 source.

- [ ] **Step 2: Write failing integer-class tests**

Add synthetic `(0,2)` and `(0,4)` signed integer decoding tests and assert both
are discrete. Add an integration loop that compares decoder output to every
committed observation.

- [ ] **Step 3: Run the tests**

```bash
docker compose run --rm app pnpm test src/core/ld/__tests__/decode.test.ts tests/integration/realFiles.test.ts
```

Expected: existing decoder should pass if the reverse-engineered interpretation
is correct. If it fails, stop this plan and use the systematic-debugging workflow
to reconcile raw bytes, i2 observations, and the decode formula before changing
production code.

- [ ] **Step 4: Remove conditional integration skips and commit**

All fixture/sidecar invariants must fail if committed fixture files disappear.

```bash
git add src/core/ld tests/integration tests/fixtures/motec/i2-flag-observations.json
git commit -m "test(core): validate flag channels against MoTeC i2"
```

### Task 2: Add a Containerized Playwright 1.62.1 Service

**Files:**
- Create: `Dockerfile.browser`
- Modify: `compose.yaml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `playwright.config.ts`
- Create: `tsconfig.browser.json`
- Modify: `tsconfig.json`
- Modify: `eslint.config.js`
- Modify: `Makefile`

- [ ] **Step 1: Verify Playwright 1.62.1 remains resolvable**

```bash
docker compose run --rm app pnpm view @playwright/test@1.62.1 version time --json
```

Expected: version `1.62.1`, published 2026-07-30, remains available and satisfies
the seven-day release-age policy on 2026-08-18.

- [ ] **Step 2: Add Playwright without browser lifecycle downloads**

```bash
docker compose run --rm app pnpm add -D @playwright/test@1.62.1
```

Keep lifecycle scripts blocked. `Dockerfile.browser` uses the matching official
image and installs pnpm 11.21.0:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.62.1-noble
ARG PNPM_VERSION=11.21.0
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app
```

The npm package and browser image must remain exactly version-matched.

- [ ] **Step 3: Add the browser service**

```yaml
browser:
  build:
    context: .
    dockerfile: Dockerfile.browser
  working_dir: /app
  volumes:
    - .:/app
    - pnpm_cache:/home/pwuser/.cache/pnpm
```

Do not add a browser download command; the image already contains the matching
browser binaries.

- [ ] **Step 4: Configure deterministic Chromium projects**

```ts
export default defineConfig({
  testDir: './tests/browser',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'chromium-1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: 'pnpm preview --host 0.0.0.0',
    port: 4173,
    reuseExistingServer: false,
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001 } },
});
```

- [ ] **Step 5: Add Make targets and smoke test**

```make
test-browser:
	$(COMPOSE) run --rm browser pnpm test:browser

test-browser-update:
	$(COMPOSE) run --rm browser pnpm test:browser:update

verify: check test build test-browser
```

Add package scripts `test:browser` and `test:browser:update`. Create one smoke
test asserting the LapLedger logo.

```bash
make image
make build
make test-browser
```

- [ ] **Step 6: Commit browser infrastructure**

```bash
git add Dockerfile.browser compose.yaml package.json pnpm-lock.yaml playwright.config.ts tsconfig.browser.json tsconfig.json eslint.config.js Makefile tests/browser
git commit -m "test(browser): add containerized Playwright Chromium"
```

### Task 3: Test Loading and Analysis Interactions

**Files:**
- Create: `tests/browser/fixtures/browser.ts`
- Create: `tests/browser/fixtures/test-state.ts`
- Create: `tests/browser/loading.spec.ts`
- Create: `tests/browser/analysis.spec.ts`
- Create: `src/app/testing/browserControls.ts`
- Modify: `src/app/main.tsx`
- Modify: `package.json`

- [ ] **Step 1: Build a shared browser fixture**

Expose paths to committed `.ld/.ldx`, clear OPFS/localStorage before each test,
wait for `document.fonts.ready`, and provide helpers:

```ts
async function loadRecording(page: Page): Promise<void>;
async function selectReference(page: Page, lapLabel: string): Promise<void>;
async function selectComparison(page: Page, lapLabel: string): Promise<void>;
```

Expose a browser-build-only control object when
`import.meta.env.VITE_BROWSER_TEST === '1'`:

```ts
export type BrowserTestControls = {
  delayLoads(milliseconds: number): void;
  failNextStorageWrite(name: 'QuotaExceededError' | 'UnknownError'): void;
  corruptStoredObject(name: string): Promise<void>;
  setForcedWidgetError(message: string | null): void;
};
```

`tests/browser/fixtures/test-state.ts` wraps that object. Production builds do
not attach it to `window`. Add a `build:browser-test` script that runs
`VITE_BROWSER_TEST=1 vite build`; `test-browser` runs that build before
Playwright starts `pnpm preview`.

- [ ] **Step 2: Write loading behavior tests**

Load through the actual file input. Assert shell status, session header, lap rows,
reference eligibility, local failure handling, and continued processing after
one invalid file.

- [ ] **Step 3: Write analysis behavior tests**

Select reference/comparisons, switch distance/time, move one chart cursor, assert
other widgets and Cursor Data update, zoom one chart, reset active zoom, hide
comparisons without clearing selected controls, and restore them with stable
colours.

- [ ] **Step 4: Run both viewports and commit**

```bash
make build
make test-browser
git add package.json src/app/testing/browserControls.ts src/app/main.tsx tests/browser
git commit -m "test(browser): cover loading and synchronized analysis"
```

### Task 4: Test Workspace, Track Map, and Persistence

**Files:**
- Create: `tests/browser/workspace.spec.ts`
- Create: `tests/browser/track-map.spec.ts`
- Create: `tests/browser/persistence.spec.ts`

- [ ] **Step 1: Test the workspace**

Drag and resize a channel widget, assert no overlap/horizontal overflow, reload
and verify layout restoration, close/add a widget, and reset exact defaults.

- [ ] **Step 2: Test track-map flows**

Import synthetic `.mt2`, assign/replace/reassign through real dialogs, click the
map and assert shared cursor/marker movement, hide comparisons during delta
colouring, delete imported map and assert generated fallback, then regenerate
from an eligible lap.

- [ ] **Step 3: Test persistence and recovery**

Reload after loading and assert stable session UUID/order, lap slots, basis,
zoom, widget layout, and map source. Confirm delete and ensure reload does not
restore; cancel delete and ensure it does. Through an injected test seam, corrupt
one object and assert another session restores; trigger quota error and assert
attempted/estimated space text.

- [ ] **Step 4: Run and commit**

```bash
make build
make test-browser
git add tests/browser
git commit -m "test(browser): cover workspace maps and persistence"
```

### Task 5: Add Accessibility Coverage

**Files:**
- Create: `tests/browser/accessibility.spec.ts`
- Modify: relevant app components only when an assertion exposes a defect

- [ ] **Step 1: Write keyboard navigation tests**

Tab through every mandatory header control, open Add Widget, use combobox arrows
and Enter, close with Escape, and verify focus restoration. Open destructive
confirmation, cancel, reopen, and confirm explicit action naming.

- [ ] **Step 2: Assert non-colour semantics**

Check active/warning/error labels or icons have accessible names, lap identity
has text plus marker, unavailable widgets expose text, and app status is a live
region without replacing local errors.

Assert every rendered `button` in the completed app contains a Remix `.ri-*`
icon, including map display/source controls and destructive dialogs.

- [ ] **Step 3: Assert default-layout geometry**

At both viewports, collect widget/header rectangles and assert no overlaps,
clipped mandatory controls, or horizontal workspace overflow.

- [ ] **Step 4: Fix only observed defects, rerun, and commit**

```bash
make check
make test
make build
make test-browser
git add tests/browser src/app
git commit -m "test(browser): enforce desktop accessibility contracts"
```

### Task 6: Add Deterministic Visual Regression

**Files:**
- Create: `tests/browser/visual.spec.ts`
- Create: `tests/browser/snapshots/`
- Modify: `tests/browser/fixtures/test-state.ts`
- Modify: `src/app/testing/browserControls.ts`

- [ ] **Step 1: Add deterministic state seams**

Extend the Task 3 browser controls with stable unavailable, local error, fatal
error, and storage warning states. Keep them enabled only under the existing
browser-test build flag.

- [ ] **Step 2: Stabilize rendering before screenshots**

```ts
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
` });
```

- [ ] **Step 3: Capture required states**

At 1280 x 720 and 1920 x 1080 capture default ready, loading/restore,
unavailable widget, local file/widget error, and storage warning. Ensure the
version is plain text and the only footer link points to GitHub.

- [ ] **Step 4: Review and commit baselines**

```bash
make build
make test-browser-update
make test-browser
git add src/app/testing/browserControls.ts tests/browser
git commit -m "test(browser): add Apex visual regression baselines"
```

### Task 7: Add CI and Final Release Gate

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: Define the CI workflow**

Build the same Compose images and run:

```bash
make install
make check
make test
make build
make test-browser
```

Upload Playwright traces/screenshots on failure. Do not run host npm/pnpm.

- [ ] **Step 2: Document local verification**

Add `make test-browser`, `make test-browser-update`, and `make verify` to README,
including that snapshot updates must be reviewed and committed intentionally.

- [ ] **Step 3: Run the complete release gate**

```bash
make verify
git diff --check
```

Expected: all unit/integration/browser tests pass, both desktop snapshots match,
and no mandatory integration test is skipped.

- [ ] **Step 4: Commit final hardening**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: enforce the complete telemetry MVP verification"
```
