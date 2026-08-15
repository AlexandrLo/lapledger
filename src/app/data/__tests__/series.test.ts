import { describe, expect, it, vi } from 'vitest';

import { createSeriesCache } from '@app/data/series';
import type { TelemetryClient } from '@app/worker/client';

function fakeClient(): TelemetryClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    request: vi.fn((body: { kind: string }) => {
      calls.push(body.kind);
      return Promise.resolve({ kind: 'series', values: Float32Array.from([1, 2]) });
    }) as unknown as TelemetryClient['request'],
    terminate: vi.fn(),
  };
}

const LAP = { sessionId: 's', lapNumber: 3 };

describe('createSeriesCache', () => {
  it('asks the worker once for the same lap and channel', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);

    const [first, second] = await Promise.all([
      cache.series(LAP, 'Ground Speed'),
      cache.series(LAP, 'Ground Speed'),
    ]);

    expect(client.calls).toEqual(['getSeries']);
    expect(first).toBe(second);
  });

  it('keeps different channels apart', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);

    await Promise.all([cache.series(LAP, 'Ground Speed'), cache.series(LAP, 'Brake Pos')]);

    expect(client.calls).toEqual(['getSeries', 'getSeries']);
  });

  it('caches elapsed and delta separately from channel series', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);

    await cache.elapsed(LAP);
    await cache.elapsed(LAP);
    await cache.delta(LAP, { sessionId: 's', lapNumber: 4 });

    expect(client.calls).toEqual(['getElapsed', 'getDelta']);
  });

  it('drops every entry belonging to a forgotten session', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);

    await cache.series(LAP, 'Ground Speed');
    cache.forget('s');
    await cache.series(LAP, 'Ground Speed');

    expect(client.calls).toEqual(['getSeries', 'getSeries']);
  });

  it('does not drop a series entry whose channel name merely contains the forgotten session id', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);

    await cache.series(LAP, 'Ground Speed');
    cache.forget('Ground');
    await cache.series(LAP, 'Ground Speed');

    expect(client.calls).toEqual(['getSeries']);
  });

  it('drops a delta entry through either of the two sessions it depends on', async () => {
    const client = fakeClient();
    const cache = createSeriesCache(client);
    const reference = { sessionId: 'a', lapNumber: 1 };
    const comparison = { sessionId: 'b', lapNumber: 2 };

    await cache.delta(reference, comparison);
    cache.forget('a');
    await cache.delta(reference, comparison);
    cache.forget('b');
    await cache.delta(reference, comparison);

    expect(client.calls).toEqual(['getDelta', 'getDelta', 'getDelta']);
  });

  it('keeps a fresh entry alive when an older, forgotten request for the same key rejects', async () => {
    let calls = 0;
    const deferred: Array<{
      resolve: (value: { kind: string; values: Float32Array }) => void;
      reject: (error: unknown) => void;
    }> = [];
    const client: TelemetryClient = {
      request: vi.fn(() => {
        calls += 1;
        return new Promise((resolve, reject) => {
          deferred.push({ resolve, reject });
        });
      }) as unknown as TelemetryClient['request'],
      terminate: vi.fn(),
    };
    const cache = createSeriesCache(client);

    // Request A starts and is still in flight when its session is forgotten.
    const first = cache.series(LAP, 'Ground Speed');
    first.catch(() => {});
    cache.forget(LAP.sessionId);
    // Request B starts for the same key, taking A's old spot in the map.
    const second = cache.series(LAP, 'Ground Speed');

    // A rejects. Wait for its own rejection handler to run to completion.
    deferred[0].reject(new Error('boom'));
    await first.catch(() => {});

    // A stale rejection handler must not evict B's fresh entry: a third
    // caller should join B rather than trigger a spurious third request.
    const third = cache.series(LAP, 'Ground Speed');
    expect(third).toBe(second);
    expect(calls).toBe(2);

    deferred[1].resolve({ kind: 'series', values: Float32Array.from([9]) });
    await expect(second).resolves.toEqual(Float32Array.from([9]));
  });

  it('does not cache a failure', async () => {
    let attempt = 0;
    const client: TelemetryClient = {
      request: vi.fn(() => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ kind: 'series', values: Float32Array.from([7]) });
      }) as unknown as TelemetryClient['request'],
      terminate: vi.fn(),
    };
    const cache = createSeriesCache(client);

    await expect(cache.series(LAP, 'Ground Speed')).rejects.toThrow('boom');
    await expect(cache.series(LAP, 'Ground Speed')).resolves.toHaveLength(1);
  });
});
