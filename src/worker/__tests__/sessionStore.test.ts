import { describe, expect, it } from 'vitest';

import { LDX, recording } from '@worker/__tests__/fixtures/recording';
import { SessionStore } from '@worker/sessionStore';

describe('SessionStore', () => {
  it('summarises an opened session without shipping any samples', () => {
    const store = new SessionStore();
    const summary = store.open(recording(), { fileName: 'a.ld', ldxText: LDX });

    expect(summary.fileName).toBe('a.ld');
    expect(summary.venue).toBe('test-venue');
    expect(summary.grid.length).toBeCloseTo(1000, 6);
    expect(summary.grid.approximate).toBe(false);
    expect(summary.channels.map((c) => c.name)).toContain('Ground Speed');
    expect(summary.laps.length).toBeGreaterThanOrEqual(1);
    expect(store.size).toBe(1);
  });

  it('gives every session its own id', () => {
    const store = new SessionStore();
    const first = store.open(recording(), { fileName: 'a.ld', ldxText: LDX });
    const second = store.open(recording(), { fileName: 'b.ld', ldxText: LDX });

    expect(first.id).not.toBe(second.id);
    expect(store.size).toBe(2);
  });

  it('hands back the session it opened', () => {
    const store = new SessionStore();
    const summary = store.open(recording(), { fileName: 'a.ld', ldxText: LDX });

    expect(store.get(summary.id).meta.fileName).toBe('a.ld');
  });

  it('names the missing session when asked for one it does not hold', () => {
    const store = new SessionStore();
    expect(() => store.get('nope')).toThrow(/no session "nope"/);
  });

  it('forgets a closed session', () => {
    const store = new SessionStore();
    const summary = store.open(recording(), { fileName: 'a.ld', ldxText: LDX });

    expect(store.close(summary.id)).toBe(true);
    expect(store.close(summary.id)).toBe(false);
    expect(store.size).toBe(0);
  });
});
