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
