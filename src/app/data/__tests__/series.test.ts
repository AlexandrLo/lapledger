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
