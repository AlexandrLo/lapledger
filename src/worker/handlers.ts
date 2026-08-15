import { computeDelta, type Session } from '@core/index';

import type { DeltaRequest, RequestBody, ResultBody } from './protocol';
import type { SessionStore } from './sessionStore';

export type HandlerResult = {
  body: ResultBody;
  /** Buffers handed to `postMessage` so the copy is skipped. */
  transfer: Transferable[];
};

export function handleRequest(store: SessionStore, request: RequestBody): HandlerResult {
  switch (request.kind) {
    case 'openSession': {
      const session = store.open(new Uint8Array(request.bytes), {
        fileName: request.fileName,
        ...(request.ldxText === undefined ? {} : { ldxText: request.ldxText }),
      });
      return { body: { kind: 'sessionOpened', session }, transfer: [] };
    }

    case 'closeSession': {
      store.close(request.sessionId);
      return { body: { kind: 'sessionClosed' }, transfer: [] };
    }

    case 'getSeries': {
      const session = store.get(request.lap.sessionId);
      return series(session.series(request.lap.lapNumber, request.channel));
    }

    case 'getElapsed': {
      const session = store.get(request.lap.sessionId);
      return series(session.elapsed(request.lap.lapNumber));
    }

    case 'getDelta':
      return series(delta(store, request));
  }
}

function series(values: Float32Array): HandlerResult {
  return { body: { kind: 'series', values }, transfer: [values.buffer] };
}

function delta(store: SessionStore, request: DeltaRequest): Float32Array {
  const reference = store.get(request.reference.sessionId);
  const comparison = store.get(request.comparison.sessionId);
  assertComparable(reference, comparison);

  return computeDelta(
    reference.elapsed(request.reference.lapNumber),
    comparison.elapsed(request.comparison.lapNumber),
  );
}

/**
 * A delta is read as a distance along one track, so two laps from different
 * venues have nothing to compare: node 1500 is a different corner in each.
 * The grid check catches the subtler case of one venue whose track length was
 * estimated from `Lap Distance` while the other's came from the `.ldx`.
 */
function assertComparable(reference: Session, comparison: Session): void {
  if (reference.meta.venue !== comparison.meta.venue) {
    throw new Error(
      `cannot compare laps from different venues: "${reference.meta.venue}" and ` +
        `"${comparison.meta.venue}"`,
    );
  }
  if (reference.grid.points !== comparison.grid.points) {
    throw new Error(
      `cannot compare laps on different distance grids: ${reference.grid.points} and ` +
        `${comparison.grid.points} points`,
    );
  }
}
