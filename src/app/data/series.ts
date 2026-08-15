import type { TelemetryClient } from '@app/worker/client';
import type { LapRef, SessionId } from '@core/index';

export type SeriesCache = {
  series(lap: LapRef, channel: string): Promise<Float32Array>;
  elapsed(lap: LapRef): Promise<Float32Array>;
  delta(reference: LapRef, comparison: LapRef): Promise<Float32Array>;
  /** Drops every entry that mentions the session, after it has been closed. */
  forget(sessionId: SessionId): void;
};

// NUL cannot appear in a channel name, venue or session id, so no two
// different keys can collide.
const SEP = '\u0000';

function lapPart(lap: LapRef): string {
  return `${lap.sessionId}${SEP}${lap.lapNumber}`;
}

type Entry = { promise: Promise<Float32Array>; sessions: SessionId[] };

export function createSeriesCache(client: TelemetryClient): SeriesCache {
  const inFlight = new Map<string, Entry>();

  // The promise is cached rather than the array, so a second caller arriving
  // during the round trip joins it instead of starting a second one. A
  // rejection is evicted: an error must not be remembered forever.
  const once = (
    key: string,
    sessions: SessionId[],
    run: () => Promise<Float32Array>,
  ): Promise<Float32Array> => {
    const existing = inFlight.get(key);
    if (existing) return existing.promise;
    const promise = run().catch((error: unknown) => {
      inFlight.delete(key);
      throw error;
    });
    inFlight.set(key, { promise, sessions });
    return promise;
  };

  return {
    series(lap, channel) {
      const key = `series${SEP}${lapPart(lap)}${SEP}${channel}`;
      return once(key, [lap.sessionId], async () => {
        const result = await client.request({ kind: 'getSeries', lap, channel });
        return result.values;
      });
    },

    elapsed(lap) {
      const key = `elapsed${SEP}${lapPart(lap)}`;
      return once(key, [lap.sessionId], async () => {
        const result = await client.request({ kind: 'getElapsed', lap });
        return result.values;
      });
    },

    delta(reference, comparison) {
      const key = `delta${SEP}${lapPart(reference)}${SEP}${lapPart(comparison)}`;
      return once(key, [reference.sessionId, comparison.sessionId], async () => {
        const result = await client.request({ kind: 'getDelta', reference, comparison });
        return result.values;
      });
    },

    forget(sessionId) {
      for (const [key, entry] of [...inFlight]) {
        if (entry.sessions.includes(sessionId)) inFlight.delete(key);
      }
    },
  };
}
