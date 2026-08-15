import { describe, expect, it } from 'vitest';

import { LDX, recording } from '@worker/__tests__/fixtures/recording';
import { handleRequest } from '@worker/handlers';
import { SessionStore } from '@worker/sessionStore';

function storeWith(venue = 'test-venue'): { store: SessionStore; id: string; lap: number } {
  const store = new SessionStore();
  const summary = store.open(recording(venue), { fileName: 'a.ld', ldxText: LDX });
  const lap = summary.laps.find((l) => l.complete) ?? summary.laps[0];
  return { store, id: summary.id, lap: lap.number };
}

describe('handleRequest', () => {
  it('opens a session from transferred bytes', () => {
    const store = new SessionStore();
    const bytes = recording();
    const result = handleRequest(store, {
      kind: 'openSession',
      fileName: 'a.ld',
      bytes: bytes.buffer.slice(0) as ArrayBuffer,
      ldxText: LDX,
    });

    expect(result.body.kind).toBe('sessionOpened');
    expect(store.size).toBe(1);
  });

  it('returns a channel series on the distance grid, and transfers it', () => {
    const { store, id, lap } = storeWith();
    const result = handleRequest(store, {
      kind: 'getSeries',
      lap: { sessionId: id, lapNumber: lap },
      channel: 'Ground Speed',
    });

    expect(result.body.kind).toBe('series');
    if (result.body.kind !== 'series') throw new Error('unreachable');
    expect(result.body.values).toBeInstanceOf(Float32Array);
    expect(result.body.values.length).toBe(store.get(id).grid.points);
    expect(result.transfer).toEqual([result.body.values.buffer]);
  });

  it('returns elapsed lap time that starts at zero', () => {
    const { store, id, lap } = storeWith();
    const result = handleRequest(store, {
      kind: 'getElapsed',
      lap: { sessionId: id, lapNumber: lap },
    });

    if (result.body.kind !== 'series') throw new Error('unreachable');
    expect(result.body.values[0]).toBeCloseTo(0, 6);
  });

  it('gives a zero delta for a lap against itself', () => {
    const { store, id, lap } = storeWith();
    const result = handleRequest(store, {
      kind: 'getDelta',
      reference: { sessionId: id, lapNumber: lap },
      comparison: { sessionId: id, lapNumber: lap },
    });

    if (result.body.kind !== 'series') throw new Error('unreachable');
    for (const value of result.body.values) expect(value).toBeCloseTo(0, 6);
  });

  it('refuses to compare laps recorded at different venues', () => {
    const monza = storeWith('monza-lfm');
    const summary = monza.store.open(recording('knockhill'), {
      fileName: 'b.ld',
      ldxText: LDX,
    });

    expect(() =>
      handleRequest(monza.store, {
        kind: 'getDelta',
        reference: { sessionId: monza.id, lapNumber: monza.lap },
        comparison: { sessionId: summary.id, lapNumber: summary.laps[0].number },
      }),
    ).toThrow(/different venues: "monza-lfm" and "knockhill"/);
  });

  it('closes a session', () => {
    const { store, id } = storeWith();
    const result = handleRequest(store, { kind: 'closeSession', sessionId: id });

    expect(result.body.kind).toBe('sessionClosed');
    expect(store.size).toBe(0);
  });
});
