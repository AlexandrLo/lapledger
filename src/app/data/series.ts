import type { TelemetryClient } from '@app/worker/client';
import type { LapRef, SessionId } from '@core/index';

export type SeriesCache = {
  series(lap: LapRef, channel: string): Promise<Float32Array>;
  elapsed(lap: LapRef): Promise<Float32Array>;
  delta(reference: LapRef, comparison: LapRef): Promise<Float32Array>;
  /** Drops every entry that mentions the session, after it has been closed. */
  forget(sessionId: SessionId): void;
};

function lapPart(lap: LapRef): string {
  return `${lap.sessionId} ${lap.lapNumber}`;
}

export function createSeriesCache(client: TelemetryClient): SeriesCache {
  const inFlight = new Map<string, Promise<Float32Array>>();

  // The promise is cached rather than the array, so a second caller arriving
  // during the round trip joins it instead of starting a second one. A
  // rejection is evicted: an error must not be remembered forever.
  const once = (key: string, run: () => Promise<Float32Array>): Promise<Float32Array> => {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const started = run().catch((error: unknown) => {
      inFlight.delete(key);
      throw error;
    });
    inFlight.set(key, started);
    return started;
  };

  return {
    series(lap, channel) {
      return once(`series ${lapPart(lap)} ${channel}`, async () => {
        const result = await client.request({ kind: 'getSeries', lap, channel });
        return result.values;
      });
    },

    elapsed(lap) {
      return once(`elapsed ${lapPart(lap)}`, async () => {
        const result = await client.request({ kind: 'getElapsed', lap });
        return result.values;
      });
    },

    delta(reference, comparison) {
      const key = `delta ${lapPart(reference)} ${lapPart(comparison)}`;
      return once(key, async () => {
        const result = await client.request({ kind: 'getDelta', reference, comparison });
        return result.values;
      });
    },

    forget(sessionId) {
      for (const key of [...inFlight.keys()]) {
        if (key.includes(` ${sessionId} `)) inFlight.delete(key);
      }
    },
  };
}
