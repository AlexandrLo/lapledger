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

