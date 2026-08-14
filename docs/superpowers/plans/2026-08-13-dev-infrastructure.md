# Development Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the repository onto a containerised pnpm toolchain with a linter, a conventional test layout, a committed anonymised MoTeC fixture, and alias-only imports.

**Architecture:** Six sequential tasks. Task 1 builds the container the remaining five run inside. Tasks 2–5 each change one axis of the repository (lint, test layout, fixture, imports) and end green. Task 6 writes down the resulting rules so the next session follows them. No library behaviour changes anywhere in this plan: the same assertions pass at the end as at the start, except that the integration suite stops skipping itself.

**Tech Stack:** Docker + Compose, pnpm 11, Node 26 (alpine), Vite 8, Vitest 4, TypeScript 6, ESLint 10 (flat config), Prettier 3.

**Spec:** `docs/superpowers/specs/2026-08-13-dev-infrastructure-design.md`

## Global Constraints

- **No host `npm`, `npx`, `node`, `vite` or `vitest`.** Every command runs as `docker compose run --rm app <cmd>` (or `docker compose up`). This applies from the moment Task 1 lands, including to the agent executing this plan. `git`, `grep`, `ls` and file edits stay on the host.
- **Base image:** `node:26-alpine`, chosen to match `@types/node@^26`. If that tag is not published, fall back to `node:24-alpine` and move `@types/node` to `^24` in the same commit.
- **pnpm:** version 10.16 or newer (the release that introduced `minimumReleaseAge`), pinned identically in `package.json`'s `packageManager` field and the Dockerfile's `PNPM_VERSION` build argument.
- **`minimumReleaseAge: 10080`** (7 days) and **`onlyBuiltDependencies: []`** in `pnpm-workspace.yaml`.
- **Aliases:** `@core/* → src/core/*`, `@app/* → src/app/*`, `@tests/* → tests/*`.
- **Banned import patterns:** `..`, `../*`, `../**`, `./*/*`, `./*/**`. `./sibling` stays legal.
- **Test placement:** unit tests in a `__tests__` directory inside the directory holding the code under test; shared fixtures and integration tests under `tests/`.
- **Commit messages:** Conventional Commits, English, no `Co-Authored-By` trailer.
- Docs, comments and commit messages are written in English.

---

### Task 1: Containerised pnpm toolchain

Replaces npm with pnpm and makes the container the only supported way to run anything. Ends with the existing test suite passing inside the container.

**Files:**
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `.dockerignore`
- Create: `pnpm-workspace.yaml`
- Modify: `package.json` (add `packageManager`)
- Delete: `package-lock.json`

**Interfaces:**
- Produces: the command prefix `docker compose run --rm app` used by every later task; the `app` service name; the `pnpm test`, `pnpm build`, `pnpm dev` scripts already present in `package.json`.

- [ ] **Step 1: Confirm the base image tag and pick the pnpm version**

```bash
docker run --rm node:26-alpine node -v
docker run --rm node:26-alpine npm view pnpm version
```

Expected: a `v26.x.y` line, then a pnpm version `10.16.0` or higher. Record both.
If the first command fails with "manifest unknown", use `node:24-alpine` and change `@types/node` to `^24` in `package.json` — note the substitution in the commit message.

- [ ] **Step 2: Write `.dockerignore`**

```
node_modules
dist
.git
temp
```

- [ ] **Step 3: Write `Dockerfile`**

Substitute the pnpm version recorded in Step 1 for `10.18.0`.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:26-alpine

# Kept in sync by hand with the `packageManager` field in package.json.
ARG PNPM_VERSION=10.18.0

ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

# Docker seeds a fresh named volume from the ownership and contents of the
# image directory it is mounted over. Creating and chowning these paths here is
# what lets the unprivileged `node` user write to the node_modules and pnpm
# store volumes declared in compose.yaml.
RUN mkdir -p /app/node_modules "$PNPM_HOME/store" \
 && chown -R node:node /app "$PNPM_HOME"

USER node

CMD ["pnpm", "dev", "--host", "0.0.0.0"]
```

corepack is deliberately not used: it resolves its download cache per user, which fights with running the container as `node`. A global install pinned by build argument is simpler and just as reproducible.

- [ ] **Step 4: Write `compose.yaml`**

```yaml
services:
  app:
    build:
      context: .
    ports:
      - '5173:5173'
    volumes:
      - .:/app
      - node_modules:/app/node_modules
      - pnpm_store:/home/node/.local/share/pnpm/store

volumes:
  node_modules:
  pnpm_store:
```

The named `node_modules` volume is not an optimisation — it stops the host's tree from shadowing the container's Linux-native install, and vice versa.

- [ ] **Step 5: Write `pnpm-workspace.yaml`**

```yaml
minimumReleaseAge: 10080
onlyBuiltDependencies: []
```

`minimumReleaseAge` is in minutes; 10080 is seven days. `onlyBuiltDependencies: []` states explicitly that no dependency may run install lifecycle scripts.

- [ ] **Step 6: Pin the package manager in `package.json`**

Add the field, using the version from Step 1:

```json
  "packageManager": "pnpm@10.18.0",
```

Place it after `"type": "module",`.

- [ ] **Step 7: Record the versions npm currently resolves, before the lockfile goes away**

```bash
docker compose build
docker compose run --rm app node -e "const l=require('/app/package-lock.json');for(const [k,v] of Object.entries(l.packages)){const p=k.split('/');if(p.length===2&&p[0]==='node_modules')console.log(p[1],v.version)}" | sort > temp/versions-before.txt
cat temp/versions-before.txt
```

`temp/` is gitignored, so this scratch output never reaches a commit.

- [ ] **Step 8: Remove the npm artefacts**

```bash
git rm --cached package-lock.json
rm package-lock.json
rm -rf node_modules
```

The host `node_modules` is deleted so a stale npm tree cannot make something "work on the host" that is broken in the container. An IDE running its TypeScript server on the host will lose type resolution until it is pointed at the container; that is the accepted cost of the containerisation requirement.

- [ ] **Step 9: Install with pnpm inside the container**

```bash
docker compose run --rm app pnpm install
```

Expected: `pnpm-lock.yaml` is created. Warnings that a version was skipped for being too new are the release-age rule working as designed.

- [ ] **Step 10: Check whether the release-age rule pushed anything backwards**

```bash
docker compose run --rm app pnpm list --depth 0
```

Compare each direct dependency against `temp/versions-before.txt`. For any package that resolved **lower** than the version npm had, pin it to that exact previous version in `package.json` (drop the `^`), re-run `pnpm install`, and list the pins in the commit message. If nothing moved backwards, say so explicitly when reporting the task.

- [ ] **Step 11: Run the existing suite inside the container**

```bash
docker compose run --rm app pnpm test
```

Expected: PASS. `temp/example` is still bind-mounted, so the integration suite runs exactly as it did before this task.

- [ ] **Step 12: Verify the build and the dev server**

```bash
docker compose run --rm app pnpm build
docker compose up -d && sleep 3 && curl -sSf http://localhost:5173 | head -5 && docker compose down
```

Expected: a successful build, then the `index.html` shell over HTTP.

- [ ] **Step 13: Commit**

```bash
git add Dockerfile compose.yaml .dockerignore pnpm-workspace.yaml package.json pnpm-lock.yaml
git rm --cached package-lock.json 2>/dev/null; true
git commit -m "build: run the dev environment in a container on pnpm"
```

---

### Task 2: ESLint and Prettier

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `package.json` (devDependencies, scripts)

**Interfaces:**
- Consumes: the `docker compose run --rm app` prefix from Task 1.
- Produces: the `lint`, `lint:fix`, `format`, `format:check` scripts; the `eslint.config.js` array that Task 5 appends the import ban to.

- [ ] **Step 1: Add the tooling**

```bash
docker compose run --rm app pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh eslint-config-prettier globals prettier
```

- [ ] **Step 2: Check how the installed react-hooks plugin exposes its flat config**

```bash
docker compose run --rm app node -e "import('eslint-plugin-react-hooks').then(m=>console.log(Object.keys(m.default.configs)))"
```

If the printed keys include `recommended-latest`, use `reactHooks.configs['recommended-latest']` as a config object in Step 3. If they only include `recommended`, spread `reactHooks.configs.recommended.rules` into the `rules` block as written below.

- [ ] **Step 3: Write `eslint.config.js`**

```js
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'temp', 'tests/fixtures/motec'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['tests/**/*.ts', 'src/**/__tests__/**/*.ts', '*.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
```

`prettier` goes last so it can switch off every stylistic rule the formatter owns.

- [ ] **Step 4: Write `.prettierrc.json`**

These values match the code already in the repository — single quotes, semicolons, trailing commas, roughly 100-column lines.

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "all",
  "arrowParens": "always"
}
```

- [ ] **Step 5: Write `.prettierignore`**

```
dist
node_modules
temp
docs
pnpm-lock.yaml
tests/fixtures/motec
```

`docs/` is excluded so the existing design documents keep their hand-wrapped prose.

- [ ] **Step 6: Add the scripts to `package.json`**

```json
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
```

- [ ] **Step 7: Run the linter and read every finding**

```bash
docker compose run --rm app pnpm lint
```

Fix real findings by editing the code. Do **not** silence a rule with an inline disable comment unless the code is provably correct and the rule provably wrong — in that case the disable comment carries a one-line reason. If a whole rule is wrong for this codebase, turn it off in `eslint.config.js` with a comment saying why. Re-run until clean.

- [ ] **Step 8: Confirm the tests still pass after any lint fixes**

```bash
docker compose run --rm app pnpm test
```

Expected: PASS.

- [ ] **Step 9: Commit the configuration separately from the reformatting**

```bash
git add eslint.config.js .prettierrc.json .prettierignore package.json pnpm-lock.yaml
git add -u src test
git commit -m "chore: add eslint and prettier"
```

- [ ] **Step 10: Reformat the tree**

```bash
docker compose run --rm app pnpm format
docker compose run --rm app pnpm format:check
docker compose run --rm app pnpm test
```

Expected: `format:check` reports all files formatted, tests PASS.

- [ ] **Step 11: Commit the reformatting on its own**

```bash
git add -A
git commit -m "style: apply prettier to the tree"
```

A pure-formatting commit stays separate so later `git blame` runs can skip it.

---

### Task 3: Test relocation

Moves every test to its final path. Imports are rewritten to whatever relative path is correct after the move — Task 5 replaces them with aliases. Nothing is anonymised here; the integration suite still reads `temp/example`.

**Files:**
- Rename: `test/` → `tests/`
- Move: `src/core/index.test.ts` → `src/core/__tests__/index.test.ts`
- Move: `src/core/session.test.ts` → `src/core/__tests__/session.test.ts`
- Move: `src/core/ld/{channels,decode,header,ldx,window}.test.ts` → `src/core/ld/__tests__/`
- Move: `src/core/lap/{delta,despike,interpolate,lapIndex,resample}.test.ts` → `src/core/lap/__tests__/`
- Move: `tests/fixtures/buildLd.test.ts` → `tests/fixtures/__tests__/buildLd.test.ts`
- Modify: `vitest.config.ts`, `tsconfig.app.json`, `tsconfig.test.json`

**Interfaces:**
- Consumes: the container command prefix from Task 1.
- Produces: the final directory layout that Task 5's alias rewrite is applied to; `tests/fixtures/buildLd.ts` and `tests/fixtures/samples.ts` at their permanent paths.

- [ ] **Step 1: Record the current test count**

```bash
docker compose run --rm app pnpm test 2>&1 | tail -5
```

Write down the "Tests  N passed" number. It must be identical at the end of this task.

- [ ] **Step 2: Rename the global directory and create the `__tests__` directories**

```bash
git mv test tests
mkdir -p src/core/__tests__ src/core/ld/__tests__ src/core/lap/__tests__ tests/fixtures/__tests__
```

- [ ] **Step 3: Move the unit tests**

```bash
git mv src/core/index.test.ts src/core/session.test.ts src/core/__tests__/
git mv src/core/ld/channels.test.ts src/core/ld/decode.test.ts src/core/ld/header.test.ts \
       src/core/ld/ldx.test.ts src/core/ld/window.test.ts src/core/ld/__tests__/
git mv src/core/lap/delta.test.ts src/core/lap/despike.test.ts src/core/lap/interpolate.test.ts \
       src/core/lap/lapIndex.test.ts src/core/lap/resample.test.ts src/core/lap/__tests__/
git mv tests/fixtures/buildLd.test.ts tests/fixtures/__tests__/buildLd.test.ts
```

- [ ] **Step 4: Rewrite the imports in the moved files**

Every moved file sits one directory deeper than before. Apply exactly these substitutions:

`src/core/__tests__/index.test.ts`
- `'../../test/fixtures/buildLd'` → `'../../../tests/fixtures/buildLd'`
- `'./index'` → `'../index'`

`src/core/__tests__/session.test.ts`
- `'../../test/fixtures/buildLd'` → `'../../../tests/fixtures/buildLd'`
- `'./lap/delta'` → `'../lap/delta'`
- `'./session'` → `'../session'`

`src/core/ld/__tests__/*.test.ts` (all five)
- `'../../../test/fixtures/buildLd'` → `'../../../../tests/fixtures/buildLd'`
- `'./channels'` → `'../channels'`, `'./decode'` → `'../decode'`, `'./header'` → `'../header'`, `'./ldx'` → `'../ldx'`, `'./window'` → `'../window'`

`src/core/lap/__tests__/*.test.ts` (all five)
- `'./delta'` → `'../delta'`, `'./despike'` → `'../despike'`, `'./interpolate'` → `'../interpolate'`, `'./lapIndex'` → `'../lapIndex'`, `'./resample'` → `'../resample'`

`tests/fixtures/__tests__/buildLd.test.ts`
- `'../../src/core/ld/window'` → `'../../../src/core/ld/window'`
- `'./buildLd'` → `'../buildLd'`

`tests/integration/realFiles.test.ts` — unchanged; the rename of `test` to `tests` does not alter its relative paths.

- [ ] **Step 5: Point Vitest at the new layout**

In `vitest.config.ts`, replace the `include` line with:

```ts
      include: ['src/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
```

- [ ] **Step 6: Split the TypeScript projects along the new boundary**

In `tsconfig.app.json`, add an `exclude` next to the existing `"include": ["src"]`:

```json
  "include": ["src"],
  "exclude": ["src/**/__tests__/**"]
```

In `tsconfig.test.json`, replace `"include": ["test"]` with:

```json
  "include": ["tests", "src/**/__tests__"]
```

Without the exclude, the application project would type-check test files that rely on Vitest's types, which it does not load.

- [ ] **Step 7: Run the suite**

```bash
docker compose run --rm app pnpm test
```

Expected: PASS with the same test count recorded in Step 1. A lower count means a file is no longer being picked up by `include`.

- [ ] **Step 8: Confirm nothing stayed behind**

```bash
find src tests -name '*.test.ts' -not -path '*/__tests__/*' -not -path 'tests/integration/*'
```

Expected: no output.

- [ ] **Step 9: Type-check and lint**

```bash
docker compose run --rm app pnpm build
docker compose run --rm app pnpm lint
```

Expected: both clean.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "test: move unit tests into __tests__ and rename test to tests"
```

---

### Task 4: Anonymised MoTeC fixture

**Files:**
- Create: `tests/fixtures/motec/knockhill-cupra-tcr.ld`
- Create: `tests/fixtures/motec/knockhill-cupra-tcr.ldx`
- Modify: `tests/fixtures/samples.ts`
- Modify: `tests/integration/realFiles.test.ts`
- Temporary, never committed: `temp/anonymize-fixture.mjs`

**Interfaces:**
- Consumes: `tests/fixtures/samples.ts` at the path Task 3 left it.
- Produces: `findSampleFiles(): SampleFile[]` where `SampleFile = { name: string; ldPath: string; ldxPath?: string }` — the same type as today. `samplesAvailable()` is deleted.

The `.ld` header stores the driver name as a fixed 64-byte field at offset 158 (`HEADER.driver` and `HEADER.textLen` in `src/core/ld/layout.ts`). A survey of the Knockhill recording found the name at exactly that offset and nowhere else in the 28.6 MB file, and not at all in the `.ldx`. Overwriting the field in place, padded with NULs to the same 64 bytes, therefore anonymises the recording without moving a single channel offset.

- [ ] **Step 1: Write the throwaway anonymiser to `temp/anonymize-fixture.mjs`**

`temp/` is gitignored but bind-mounted, so the script runs in the container and never reaches a commit.

```js
import { readFileSync, writeFileSync } from 'node:fs';

const DRIVER_OFFSET = 158;
const TEXT_LEN = 64;
const REPLACEMENT = 'Test Driver';

const [, , src, dst] = process.argv;
if (!src || !dst) throw new Error('usage: node anonymize-fixture.mjs <src.ld> <dst.ld>');

const buf = readFileSync(src);
const field = buf.subarray(DRIVER_OFFSET, DRIVER_OFFSET + TEXT_LEN);
const before = field.toString('latin1').replace(/\0[\s\S]*$/, '');
console.log(`driver field before: ${JSON.stringify(before)}`);
if (before.length === 0) throw new Error('driver field is already empty — wrong offset or wrong file');

field.fill(0);
field.write(REPLACEMENT, 0, 'latin1');

writeFileSync(dst, buf);
console.log(`wrote ${dst} (${buf.length} bytes, unchanged length)`);
```

- [ ] **Step 2: Produce the fixture**

```bash
mkdir -p tests/fixtures/motec
cp "temp/example/2 Stanley Bublick/fw_cupra_tcr_2024/knockhill2017-knockhill_lfm/06082026-213050-Stanley Bublick-fw_cupra_tcr_2024-knockhill2017-knockhill_lfm.ldx" \
   tests/fixtures/motec/knockhill-cupra-tcr.ldx
docker compose run --rm app node temp/anonymize-fixture.mjs \
  "temp/example/2 Stanley Bublick/fw_cupra_tcr_2024/knockhill2017-knockhill_lfm/06082026-213050-Stanley Bublick-fw_cupra_tcr_2024-knockhill2017-knockhill_lfm.ld" \
  tests/fixtures/motec/knockhill-cupra-tcr.ld
```

Expected: `driver field before: "Stanley Bublick"`, then a 28602976-byte output.

- [ ] **Step 3: Verify the name is gone and the file length is unchanged**

```bash
grep -c -i -E 'Stanley|Bublick' tests/fixtures/motec/knockhill-cupra-tcr.ld tests/fixtures/motec/knockhill-cupra-tcr.ldx
ls -l tests/fixtures/motec/
```

Expected: `0` for both files (grep exits 1, which is the success case here), and a `.ld` of exactly 28602976 bytes. A non-zero count means the survey missed an occurrence — stop and widen the anonymiser before continuing.

- [ ] **Step 4: Write the failing test — the fixture must exist and be used**

Replace the top of `tests/integration/realFiles.test.ts` (the `const samples = ...` line and the `describe.skipIf(...)` line) with:

```ts
const samples = findSampleFiles();

describe('real MoTeC files', () => {
  it('ships at least one committed sample recording', () => {
    expect(samples).not.toHaveLength(0);
  });
```

and change the import on line 5 from `import { findSampleFiles, samplesAvailable } from '../fixtures/samples';` to:

```ts
import { findSampleFiles } from '../fixtures/samples';
```

No other assertion needs touching: `expect(session.meta.driver.length).toBeGreaterThan(0)` still holds for `"Test Driver"`.

The `it.skipIf(!hasSidecar)` and `it.skipIf(!hasSidecar || !hasEnoughBeacons)` guards inside the loop stay: they describe a property of an individual recording, not the absence of fixtures. With this fixture both are satisfied, so those tests execute.

- [ ] **Step 5: Run it and watch it fail for the right reason**

`samples.ts` still scans `temp/example`, so the new test would pass on data the suite is about to stop using. Move that data aside first, so the red proves what it is supposed to prove — that nothing committed satisfies the test yet:

```bash
mv temp/example temp/example-holdout
docker compose run --rm app pnpm test tests/integration/realFiles.test.ts
```

Expected: FAIL. Either `ships at least one committed sample recording` fails on an empty `samples` array, or the run errors because `SAMPLE_ROOT` no longer exists — both are the same missing fixture. Leave `temp/example-holdout` where it is; Step 7 runs against it too, and Step 8 restores it.

- [ ] **Step 6: Repoint `tests/fixtures/samples.ts` at the committed fixture**

Replace the whole file with:

```ts
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SampleFile = { name: string; ldPath: string; ldxPath?: string };

/**
 * Resolved from this module's own location rather than from `process.cwd()`,
 * so the fixture is found no matter which directory the runner started in.
 */
const SAMPLE_ROOT = fileURLToPath(new URL('./motec', import.meta.url));

export function findSampleFiles(): SampleFile[] {
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

The directory walk is kept rather than hard-coding one path, so a second fixture can be added later by dropping the files in.

- [ ] **Step 7: Run the integration suite**

```bash
docker compose run --rm app pnpm test tests/integration/realFiles.test.ts
```

Expected: PASS, with every test **executing** — no `skipped` count for the `real MoTeC files` describe block other than none at all. Confirm the reported test names include `resolves meta.trackLength and grid.length exactly to the .ldx Venue Length`, which only runs when the sidecar is present.

Note that `temp/example` is still moved aside at this point, so this pass is already proof that the suite runs off the committed fixture.

- [ ] **Step 8: Run the whole suite, then restore the scratch data**

```bash
docker compose run --rm app pnpm test
mv temp/example-holdout temp/example
```

Expected: PASS with `temp/example` still absent.

- [ ] **Step 9: Delete the throwaway script and lint**

```bash
rm temp/anonymize-fixture.mjs
docker compose run --rm app pnpm lint
docker compose run --rm app pnpm build
```

Expected: both clean.

- [ ] **Step 10: Commit**

```bash
git add tests/fixtures/motec tests/fixtures/samples.ts tests/integration/realFiles.test.ts
git commit -m "test: add an anonymised MoTeC recording as a committed fixture"
```

Check `git show --stat HEAD` and confirm the `.ld` is listed at roughly 28 MB — this is the point of no return the spec flags, and it should be entered deliberately.

---

### Task 5: Import aliases and the relative-import ban

**Files:**
- Create: `tsconfig.base.json`
- Create: `src/app/App.tsx`, `src/app/main.tsx` (moved)
- Modify: `tsconfig.app.json`, `tsconfig.test.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `eslint.config.js`
- Modify: every file listed in Step 5 and Step 6

**Interfaces:**
- Consumes: the file layout from Tasks 3 and 4; the `eslint.config.js` array from Task 2.
- Produces: `@core/*`, `@app/*`, `@tests/*` resolvable from TypeScript, Vite and Vitest. Note that the barrel is imported as `@core/index`, not bare `@core` — only the wildcard mapping exists.

- [ ] **Step 1: Move the UI entry points under `src/app/`**

```bash
mkdir -p src/app
git mv src/App.tsx src/main.tsx src/app/
```

In `index.html`, change the script source:

```html
    <script type="module" src="/src/app/main.tsx"></script>
```

`src/app/main.tsx` imports `./App.tsx`, which is one level deep and stays as it is.

- [ ] **Step 2: Create `tsconfig.base.json`**

This collapses the near-identical duplication between `tsconfig.app.json` and `tsconfig.test.json` and gives the aliases a single home.

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": false,
    "exactOptionalPropertyTypes": false,

    "baseUrl": ".",
    "paths": {
      "@core/*": ["src/core/*"],
      "@app/*": ["src/app/*"],
      "@tests/*": ["tests/*"]
    }
  }
}
```

- [ ] **Step 3: Reduce the leaf configs to their differences**

Replace `tsconfig.app.json` with:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "types": ["vite/client"]
  },
  "include": ["src"],
  "exclude": ["src/**/__tests__/**"]
}
```

Replace `tsconfig.test.json` with:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.test.tsbuildinfo",
    "types": ["node", "vite/client"]
  },
  "include": ["tests", "src/**/__tests__"]
}
```

Leave `tsconfig.node.json` on its own settings — it targets `module: nodenext` without the DOM lib, which is genuinely different — but add the Vitest config to its `include`:

```json
  "include": ["vite.config.ts", "vitest.config.ts"]
```

Under `module: nodenext` a relative import needs an explicit file extension, which is why Step 4 writes `'./vite.config.ts'` rather than `'./vite.config'` (`allowImportingTsExtensions` is already true in this project). If `tsc -b` rejects the import anyway, drop `vitest.config.ts` back out of this `include` — that restores today's behaviour, where the file is not type-checked at all — and note the fallback in the task report.

- [ ] **Step 4: Teach Vite and Vitest the same aliases**

Replace `vite.config.ts` with:

```ts
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Kept in sync by hand with the `paths` block in tsconfig.base.json.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
});
```

Replace `vitest.config.ts` with:

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    },
  }),
);
```

Merging means the alias table is written once; `./vite.config` is a one-level relative import and stays legal.

- [ ] **Step 5: Rewrite the deep relative imports in library code**

`src/core/index.ts`
- `'./lap/delta'` → `'@core/lap/delta'`
- `'./lap/resample'` → `'@core/lap/resample'`
- `'./lap/lapIndex'` → `'@core/lap/lapIndex'`
- `'./session'` stays — one level.

`src/core/session.ts` (lines 1–16)
- `'./ld/channels'` → `'@core/ld/channels'`
- `'./ld/decode'` → `'@core/ld/decode'`
- `'./ld/header'` → `'@core/ld/header'`
- `'./ld/ldx'` → `'@core/ld/ldx'`
- `'./ld/types'` → `'@core/ld/types'`
- `'./ld/window'` → `'@core/ld/window'`
- `'./lap/delta'` → `'@core/lap/delta'`
- `'./lap/despike'` → `'@core/lap/despike'`
- `'./lap/lapIndex'` → `'@core/lap/lapIndex'`
- `'./lap/resample'` → `'@core/lap/resample'`

`src/core/lap/resample.ts`
- `'../types'` → `'@core/types'`

Every other import inside `src/core/ld/` and `src/core/lap/` is a one-level sibling (`'./window'`, `'./layout'`, and so on) and is left alone.

- [ ] **Step 6: Rewrite the imports in tests**

`src/core/__tests__/index.test.ts`
- `'../../../tests/fixtures/buildLd'` → `'@tests/fixtures/buildLd'`
- `'../index'` → `'@core/index'`

`src/core/__tests__/session.test.ts`
- `'../../../tests/fixtures/buildLd'` → `'@tests/fixtures/buildLd'`
- `'../lap/delta'` → `'@core/lap/delta'`
- `'../session'` → `'@core/session'`

`src/core/ld/__tests__/*.test.ts`
- `'../../../../tests/fixtures/buildLd'` → `'@tests/fixtures/buildLd'`
- `'../channels'` → `'@core/ld/channels'`, `'../decode'` → `'@core/ld/decode'`, `'../header'` → `'@core/ld/header'`, `'../ldx'` → `'@core/ld/ldx'`, `'../window'` → `'@core/ld/window'`

`src/core/lap/__tests__/*.test.ts`
- `'../delta'` → `'@core/lap/delta'`, `'../despike'` → `'@core/lap/despike'`, `'../interpolate'` → `'@core/lap/interpolate'`, `'../lapIndex'` → `'@core/lap/lapIndex'`, `'../resample'` → `'@core/lap/resample'`

`tests/fixtures/__tests__/buildLd.test.ts`
- `'../../../src/core/ld/window'` → `'@core/ld/window'`
- `'../buildLd'` → `'@tests/fixtures/buildLd'`

`tests/integration/realFiles.test.ts`
- `'../../src/core'` → `'@core/index'`
- `'../../src/core/ld/ldx'` → `'@core/ld/ldx'`
- `'../fixtures/samples'` → `'@tests/fixtures/samples'`

- [ ] **Step 7: Verify the aliases resolve before switching the rule on**

```bash
docker compose run --rm app pnpm test
docker compose run --rm app pnpm build
```

Expected: both PASS, with the same test count as Task 3 Step 1 plus the one new fixture-presence test from Task 4.

- [ ] **Step 8: Add the ban to `eslint.config.js`**

Insert this rule into the `rules` block of the `files: ['**/*.{ts,tsx}']` config object added in Task 2:

```js
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['..', '../*', '../**'],
              message: 'Reach outside the directory through @core, @app or @tests, not through "..".',
            },
            {
              group: ['./*/*', './*/**'],
              message:
                'Relative imports may go one level deep. Use @core, @app or @tests for anything deeper.',
            },
          ],
        },
      ],
```

- [ ] **Step 9: Run the linter and confirm the rule bites**

```bash
docker compose run --rm app pnpm lint
```

Expected: clean. To confirm the rule is actually active rather than vacuously satisfied, temporarily change one import in `src/core/session.ts` back to `'./ld/window'`, re-run `pnpm lint`, see the error, then revert it.

- [ ] **Step 10: Confirm no banned import survived anywhere**

```bash
grep -rn "from '\.\." src tests --include=*.ts --include=*.tsx
grep -rn "from '\./[^']*/[^']*'" src tests --include=*.ts --include=*.tsx
```

Expected: no output from either command.

- [ ] **Step 11: Full green run**

```bash
docker compose run --rm app pnpm lint
docker compose run --rm app pnpm format:check
docker compose run --rm app pnpm test
docker compose run --rm app pnpm build
docker compose up -d && sleep 3 && curl -sSf http://localhost:5173 | head -5 && docker compose down
```

Expected: every command succeeds and the dev server still serves the shell — the `index.html` script path change is only exercised here.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: import through @core, @app and @tests aliases only"
```

---

### Task 6: Write the rules down in AGENTS.md

`AGENTS.md` is currently a zero-byte file that `CLAUDE.md` includes. Everything above is undone the moment someone runs `npm test` on the host or drops a `.test.ts` next to its source, so the conventions have to be written where the next session will read them.

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: the finished state of Tasks 1–5.

- [ ] **Step 1: Write `AGENTS.md`**

The file already carries its `## Stay inside this directory` section, committed
ahead of this task. Keep that section first and verbatim; add the rest below it.

```markdown
# Working in this repository

## Stay inside this directory

Everything you may read, run or change lives under this repository. Never read
files from, run commands in, or write to another project on this machine.

## Everything runs in the container

Never run `npm`, `npx`, `node`, `vite` or `vitest` on the host. The toolchain
lives in the image defined by `Dockerfile`, and the host has no `node_modules`.

    docker compose up                            # dev server on :5173
    docker compose run --rm app pnpm install     # after changing package.json
    docker compose run --rm app pnpm test
    docker compose run --rm app pnpm lint
    docker compose run --rm app pnpm build

## Dependencies

pnpm only; `package-lock.json` must never come back. `pnpm-workspace.yaml` sets
`minimumReleaseAge: 10080`, so a package version published less than seven days
ago will not resolve — that is a supply-chain guard, not a bug. Install
lifecycle scripts are blocked by `onlyBuiltDependencies: []`; adding a package
there is a deliberate decision, not a workaround.

The pnpm version is pinned twice, in `package.json`'s `packageManager` field and
in the Dockerfile's `PNPM_VERSION` argument. Move both together.

## Where tests live

Unit tests go in a `__tests__` directory inside the directory holding the code
under test — `src/core/ld/window.ts` is tested by
`src/core/ld/__tests__/window.test.ts`. Never place a `.test.ts` beside its
source.

`tests/` holds only what no single source directory owns:

    tests/fixtures/            shared builders and sample data
    tests/fixtures/motec/      an anonymised MoTeC recording, committed
    tests/integration/         end-to-end tests over real recordings

A fixture used by exactly one directory belongs in that directory's
`__tests__/fixtures/`, not in the global `tests/fixtures/`.

The MoTeC fixture is a real recording with the driver field overwritten. Any new
sample recording must be anonymised the same way before it is committed, and the
integration suite must never be allowed to pass by skipping.

## Imports

Three aliases, resolved in `tsconfig.base.json`, `vite.config.ts` and (through
`mergeConfig`) `vitest.config.ts`:

    @core/*   → src/core/*
    @app/*    → src/app/*
    @tests/*  → tests/*

The barrel is `@core/index`; there is no bare `@core` mapping.

Relative imports may only reach a sibling: `./window` is fine, `./ld/window` and
`../types` are not. ESLint enforces this. Adding a top-level directory means
adding an alias in `tsconfig.base.json` and `vite.config.ts`.

## Style

ESLint flat config plus Prettier. `pnpm lint` and `pnpm format:check` must be
clean before a commit. Suppress a rule only with an inline comment explaining
why the rule is wrong for that line.

Documentation, code comments and commit messages are written in English.
Commit messages follow Conventional Commits and carry no `Co-Authored-By`
trailer.
```

- [ ] **Step 2: Check the document against reality**

Run each command block in the document and confirm it does what the text claims. Correct the text, not the reality, if they disagree.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document the container workflow and repository conventions"
```

---

## Final verification

- [ ] **Every review point is closed**

```bash
docker compose run --rm app pnpm lint          # point 6
docker compose run --rm app pnpm format:check
docker compose run --rm app pnpm test          # points 3, 4, 5
docker compose run --rm app pnpm build
test ! -e package-lock.json && test ! -e test  # points 2, 3
grep -rn "from '\.\." src tests --include=*.ts --include=*.tsx        # point 7
grep -rn "from '\./[^']*/[^']*'" src tests --include=*.ts --include=*.tsx
grep -rc -i -E 'Stanley|Bublick' tests/fixtures/motec/* # point 5
git status --porcelain                         # clean
```

Expected: the four pnpm commands succeed, the two `test !` checks pass, both greps print nothing, the fixture grep prints `0` for each file, and the working tree is clean.

- [ ] **The integration suite really ran**

```bash
docker compose run --rm app pnpm test 2>&1 | grep -A2 'real MoTeC files'
```

Expected: the block's tests are listed as passed, with no `skipped` entries beyond the sidecar-conditional ones (which this fixture satisfies, so there should be none).
