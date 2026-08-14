# Development infrastructure — design

Date: 2026-08-13
Status: approved

## 1. Goal

Bring the repository's tooling up to the standard the code already holds itself
to. Seven review findings drive the work:

1. Never run `npm` directly on the host; the development environment must be
   containerised.
2. Use pnpm, and refuse packages younger than a fixed age (supply-chain
   defence).
3. Rename the global `test` directory to `tests`.
4. Move unit tests into `__tests__` directories next to the code they cover.
5. Anonymise the sample recordings that tests depend on and turn them into
   committed fixtures.
6. Configure a linter with conventional default rules.
7. Configure import aliases and forbid relative imports: no `..` at all, no
   `./` deeper than one level.

Nothing about the telemetry library's behaviour changes. Every test that passes
today passes afterwards, and the integration test — which silently skips itself
today — starts actually running.

## 2. Container-based development environment

### Dockerfile

Base image `node:26-alpine`, chosen to match `@types/node@^26` already in
`devDependencies` — a container on an older major would run against types
promising APIs it does not have. If that tag turns out not to be published, the
fallback is `node:24-alpine` (active LTS) with `@types/node` moved to `^24` in
the same commit. The image enables corepack, so pnpm comes from the
`packageManager` field in `package.json` rather than from a separate install
step.

The container runs as the built-in `node` user (uid 1000). That matches the
host account, so files written through the bind mount stay owned by the host
user instead of root.

### compose.yaml

A single service, `app`:

- build context `.`
- bind mount of the repository at `/app`, `node_modules` included (see the
  revision note in §10 — this started out as a named volume)
- a named volume on pnpm's metadata cache, so a `--rm` run does not re-fetch
  the registry index every time
- port `5173` published
- default command `pnpm dev --host 0.0.0.0` — Vite must bind to all interfaces
  to be reachable from the host

A `.dockerignore` keeps `node_modules`, `.pnpm-store`, `dist`, `.git` and
`temp` out of the build context.

### Command protocol

Every command runs through the container, and a `Makefile` is the interface —
one target per operation, each wrapping a `docker compose` invocation, with
`make help` listing them and `make check` running the full gate:

```
make install     # required: fresh clone, or after pnpm-lock.yaml changes
make dev         # dev server on http://localhost:5173
make test
make lint
make build
make check
```

This applies to humans and to coding agents alike. `AGENTS.md` — currently an
empty file — documents the protocol, the directory layout and the import rules,
so a future session does not reach for `npm test` and undo the work. The
targets are also listed in `.claude/settings.local.json`'s allow-list, so an
agent runs them without a prompt per invocation; host `npm`, `npx`, `pnpm` and
`node` are denied there outright. That file is gitignored — it is a local
convenience, not part of the contract.

## 3. pnpm and release-age protection

`package-lock.json` is deleted and `pnpm-lock.yaml` is generated inside the
container. `package.json` gains a pinned `packageManager` field naming the
latest pnpm available at migration time; 10.16 or newer is required, as
that is the release where `minimumReleaseAge` landed. pnpm 11.21.0 was
installed (a deviation from the pnpm 10.x originally scoped here, reviewed and
accepted).

`pnpm-workspace.yaml` carries two settings:

- `minimumReleaseAge: 10080` — ignore any package version published less than
  seven days ago. A compromised release is usually pulled from npm well inside
  that window.
- `onlyBuiltDependencies: []` — pnpm already refuses to run dependency
  lifecycle scripts by default; stating the empty allow-list makes the decision
  explicit and forces a deliberate edit before any package may run
  `postinstall`. This is the second half of the same defence: release age keeps
  a malicious version out of the resolution, and the script block keeps a
  malicious version that slips through from executing at install time.

If resolution under the seven-day rule pushes any current dependency to an
older version, that dependency is pinned to its exact present version instead,
and the deviation is reported rather than absorbed silently.

## 4. Test layout

### Target structure

```
src/app/{App.tsx,main.tsx}
src/core/__tests__/{index,session}.test.ts
src/core/ld/__tests__/*.test.ts
src/core/lap/__tests__/*.test.ts
tests/fixtures/buildLd.ts
tests/fixtures/samples.ts
tests/fixtures/__tests__/buildLd.test.ts
tests/fixtures/motec/knockhill-cupra-tcr.{ld,ldx}
tests/integration/realFiles.test.ts
```

The rule: a unit test lives in a `__tests__` directory inside the directory
holding the code under test. The global `tests/` directory holds only what is
not owned by a single source directory — shared fixtures and integration tests.

`buildLd.ts` (the synthetic `.ld` builder) stays global because unit tests in
`src/core`, `src/core/ld` and `src/core/lap` all consume it; it belongs to no
one directory. Its own unit test follows the same rule as any other and moves
to `tests/fixtures/__tests__/`.

`src/app/` is a new directory holding `App.tsx` and `main.tsx`. The move exists
to give the `@app` alias a real root; `index.html` is updated to point at
`/src/app/main.tsx`.

### Vitest and TypeScript projects

Vitest's `include` becomes `['src/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts']`.

`tsconfig.app.json` excludes `**/__tests__/**` so application type-checking
does not pull in files that depend on Vitest globals; `tsconfig.test.json`
includes `tests` and `src/**/__tests__`.

## 5. Anonymised MoTeC fixture

Today `tests/fixtures/samples.ts` scans `temp/example`, a gitignored directory
holding two real recordings (~29 MB per `.ld` + `.ldx` pair) whose paths and
file headers carry a real driver's name. On a clean clone the directory is
absent, `describe.skipIf` fires, and the integration test asserts nothing while
still reporting as passing.

One pair — the Knockhill recording — becomes a committed fixture:

- A throwaway script overwrites the driver name with `Test Driver`, NUL-padded
  to the original byte length; fixed-length overwriting keeps every channel
  offset in the file valid. The script lives in the gitignored `temp/`
  directory — it has to run inside the container, which only mounts the
  repository — and is deleted afterwards.
- The `.ldx` sidecar is XML and is treated the same way.
- The file is renamed to `knockhill-cupra-tcr.{ld,ldx}`; the original name
  encoded a timestamp and the driver's name.
- Venue and vehicle strings (`knockhill`, `fw_cupra_tcr_2024`) are not personal
  data and stay — the integration test asserts they are non-empty.
- After the rewrite, both files are searched again to confirm the name is gone.

Telemetry bytes are **not** truncated or regenerated. The fixture's value is
that it was produced by MoTeC rather than by this repository's own writer;
synthetic coverage already exists in `buildLd.ts`. The cost is ~29 MB entering
git history permanently — accepted deliberately.

`samples.ts` is rewritten to read `tests/fixtures/motec`, and the `skipIf`
guard is removed: the integration test is no longer permitted to pass by
skipping. Its existing assertions (186 channels, more than five complete laps,
lap identity derived from `Car Pos Norm` wraps) are unchanged.

## 6. Linting and formatting

`eslint.config.js` in flat format:

- `@eslint/js` recommended
- `typescript-eslint` recommended
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`
- `eslint-plugin-perfectionist`, for import grouping (§7)
- `eslint-config-prettier` last, to disable stylistic rules Prettier owns
- `dist/` ignored

Prettier is configured to match the code already in the repository: single
quotes, semicolons, print width 100.

Scripts: `lint`, `lint:fix`, `format`, `format:check`.

## 7. Import aliases

Three aliases:

| Alias     | Target       |
|-----------|--------------|
| `@core/*` | `src/core/*` |
| `@app/*`  | `src/app/*`  |
| `@tests/*`| `tests/*`    |

They are declared in TypeScript, Vite and Vitest. To avoid three drifting
copies:

- A new `tsconfig.base.json` holds the shared `compilerOptions`, including
  `paths`. `tsconfig.app.json` and `tsconfig.test.json` extend it and keep only
  what actually differs between them (`types`, `include`, `tsBuildInfoFile`).
  Today those two files are near-identical duplicates; the alias work is the
  right moment to collapse them.
- `vitest.config.ts` is rebuilt with `mergeConfig` over `vite.config.ts`, so
  the alias table is written once.

The ban is enforced by ESLint `no-restricted-imports` with two pattern groups:

- `['..', '../**']` — any upward relative import
- `['./*/**']` — a downward relative import deeper than one level

Both carry the message that `@core`, `@app` or `@tests` should be used instead.
`./sibling` remains legal.

### Grouping

What survives the ban is then ordered by `perfectionist/sort-imports` into four
bands, blank line between each, alphabetical within: `node:` builtins,
packages, the three aliases, siblings. Type and value imports share a band —
the plugin's default splits them, which would separate a module's
`import type { LapMeta }` from its `import { openSession }`.

The ordering is fully autofixable, so it costs nothing to comply with and never
becomes a review topic. The plugin is `perfectionist` rather than the more
conventional `eslint-plugin-import-x` because import-x depends on the native
`unrs-resolver`, whose `postinstall` script `onlyBuiltDependencies: []` blocks
by design (§3); perfectionist is pure JavaScript and classifies specifiers by
pattern, needing no module resolution at all.

This rule is switched on during the alias step, not during the linter step:
moving unit tests into `__tests__` temporarily turns `./window` into
`../window`, and those imports are rewritten to aliases in the same step that
starts enforcing the rule.

## 8. Order of work

1. pnpm migration and container — everything afterwards runs inside it.
2. ESLint and Prettier.
3. Test relocation and the anonymised fixture.
4. Aliases, `tsconfig.base.json`, and the relative-import ban.
5. `AGENTS.md`.

Steps 3 and 4 are ordered this way because rewriting every import to an alias
is cheaper once files sit at their final paths.

## 9. Definition of done

Inside the container:

- `pnpm lint` clean
- `pnpm test` green, with the integration test **executing** rather than
  skipping
- `pnpm build` succeeds
- `docker compose up` serves the app at `http://localhost:5173`

And in the tree: no `package-lock.json`, no `test/` directory, no `.test.ts`
outside a `__tests__` directory or `tests/integration/`, no import matching the
banned patterns, and no occurrence of the original driver's name in any
committed file.

## 10. Revision, 2026-08-14

A round of review after the work landed produced four findings, all of them
about the developer's experience of the setup rather than its correctness.

**`node_modules` was invisible to the host.** The named volume on
`/app/node_modules` did its job too well: the host saw an empty, root-owned
directory, so no editor could resolve an import and every symbol in the project
was unnavigable. The volume is gone. The install lands on the bind-mounted tree
and the container remains the only writer — an install run on the host would
fetch the wrong platform's binaries.

pnpm's content-addressable store follows it, to a gitignored `.pnpm-store` in
the project root. A store on the other side of a filesystem boundary forces
pnpm to copy every package rather than link it; on the same btrfs filesystem
the packages are reflink clones and the two directories share their extents.
The original concern — that the store must not be written back to the host —
no longer applies once the install itself is on the host by design.

**A `Makefile`** replaces `docker compose run --rm app …` as the thing anyone
types (§2).

**Its targets are pre-approved** in `.claude/settings.local.json` (§2).

**Import grouping** is enforced (§7).
