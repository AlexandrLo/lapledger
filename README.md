# LapLedger

A web application for analysing MoTeC (`.ld` + `.ldx`) telemetry:
overlay laps, see the accumulated time delta against distance, and find where
on the track that time is lost.

Parsing, lap detection and the distance-based comparison model run entirely in
the browser. No backend.

## Requirements

- [Docker](https://docs.docker.com/get-docker/)

## Working with the project

Everything runs in a container — never run `npm`, `pnpm`, `node` or `vite`
directly on the host. The `Makefile` is the interface.

Install dependencies (required on a fresh clone and after pnpm-lock.yaml changes):

```
make install
```

Start dev server:

```
make dev
```

Run the test suite once:


```
make test
```

To list every command run:

```
make help
```

If there's no `make` target for what you need (e.g. `pnpm add`, `pnpm why`),
run it through `docker compose run --rm app`:

```
docker compose run --rm app pnpm add some-package
```

