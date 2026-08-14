# Working in this repository

## Stay inside this directory

Everything you may read, run or change lives under this repository. Never read
files from, run commands in, or write to another project on this machine.

## Everything runs in the container

Never run `npm`, `npx`, `pnpm`, `node`, `vite` or `vitest` on the host. The
toolchain lives in the image defined by `Dockerfile`. The `Makefile` is the
interface to it — every target wraps a `docker compose` invocation, and
`make help` lists them:

    make install       # required: fresh clone, or after pnpm-lock.yaml changes
    make dev           # dev server on :5173
    make test
    make lint
    make build
    make check         # lint + format:check + test + build

For anything without a target — `pnpm add`, `pnpm why` — go through
`docker compose run --rm app pnpm …` or `make shell`.

`node_modules` and `.pnpm-store` sit in the project tree so an editor's
language server can resolve imports, but the container is the only thing that
may write them: an install run on the host would fetch the wrong platform's
binaries. On a fresh clone both directories are absent and every command fails
until `make install` creates them.

## Dependencies

pnpm only; `package-lock.json` must never come back. `pnpm-workspace.yaml` sets
`minimumReleaseAge: 10080`, so a package version published less than seven days
ago will not resolve — that is a supply-chain guard, not a bug. Install
lifecycle scripts are blocked by `onlyBuiltDependencies: []`; adding a package
there is a deliberate decision, not a workaround.

The pnpm version is pinned twice, in `package.json`'s `packageManager` field and
in the Dockerfile's `PNPM_VERSION` argument. Move both together.

A package whose install is blocked by `onlyBuiltDependencies` needs a
replacement, not an entry in the allow-list. `eslint-plugin-import-x` was
rejected on exactly this ground — its native `unrs-resolver` wants a
`postinstall` — and `eslint-plugin-perfectionist` took its place.

`@types/node` is pinned to an exact `26.1.2` (no caret) because
`minimumReleaseAge` rejected `26.2.0` as too recent and the caret range excluded
every older 26.x; it is a temporary release-age artifact, not a deliberate
compatibility constraint, and may be loosened once enough time has passed.

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
`../types` are not.

Import blocks are grouped, in this order, with a blank line between groups:
`node:` builtins, packages, `@core`/`@app`/`@tests`, then siblings —
alphabetical inside each group. ESLint enforces both rules and `make lint-fix`
applies the ordering, so don't sort by hand.

Adding a top-level directory means adding an alias in `tsconfig.base.json` and
`vite.config.ts`, and a pattern in `eslint.config.js`'s `internalPattern`.
`tsconfig.node.json` (config files: `vite.config.ts`, `vitest.config.ts`, …)
does not extend `tsconfig.base.json` and has no aliases — don't import through
one there.

## Style

ESLint flat config plus Prettier. `pnpm lint` and `pnpm format:check` must be
clean before a commit. Suppress a rule only with an inline comment explaining
why the rule is wrong for that line.

Documentation, code comments and commit messages are written in English.
Commit messages follow Conventional Commits and carry no `Co-Authored-By`
trailer.
