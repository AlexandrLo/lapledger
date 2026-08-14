import { describe, expect, it } from 'vitest';
import { buildLd, type FixtureChannel } from '@tests/fixtures/buildLd';
import { computeDelta } from '@core/lap/delta';
import { openSession } from '@core/session';

/**
 * Two complete laps plus partial ends, 10 Hz, 1000 m per lap. Ground Speed
 * ramps from 200 to 497 kph across each lap (well above the despiker's
 * plausibility floor) so tests can assert on the shape of a resampled
 * series instead of just its finiteness.
 */
function sampleBytes(extra: FixtureChannel[] = []): Uint8Array {
  const pos: number[] = [];
  const lapNumber: number[] = [];
  const lapTime: number[] = [];
  const distance: number[] = [];
  const speed: number[] = [];

  let travelled = 0;
  for (let lap = 0; lap <= 3; lap++) {
    const from = lap === 0 ? 50 : 0;
    const to = lap === 3 ? 50 : 100;
    for (let i = from; i < to; i++) {
      pos.push(i / 100);
      lapNumber.push(lap);
      lapTime.push((i - from) / 10);
      travelled += 10;
      distance.push(travelled);
      speed.push(200 + i * 3);
    }
  }

  return buildLd({
    driver: 'Test Driver',
    vehicle: 'test_car',
    venue: 'test-venue',
    channels: [
      { name: 'Car Pos Norm', shortName: 'Car Pos', freq: 10, values: pos },
      { name: 'Lap Number', shortName: 'Lap', freq: 10, dtypeA: 3, dtype: 2, values: lapNumber },
      { name: 'Lap Time', shortName: 'LapTime', unit: 's', freq: 10, values: lapTime },
      { name: 'Lap Distance', shortName: 'LDistanc', unit: 'm', freq: 10, values: distance },
      { name: 'Ground Speed', shortName: 'Gnd Spd', unit: 'kph', freq: 10, values: speed },
      ...extra,
    ],
  });
}

describe('openSession', () => {
  it('exposes session metadata', () => {
    const session = openSession(sampleBytes(), { fileName: 'sample.ld' });

    expect(session.meta.fileName).toBe('sample.ld');
    expect(session.meta.driver).toBe('Test Driver');
    expect(session.meta.venue).toBe('test-venue');
    expect(session.meta.channels).toHaveLength(5);
    expect(session.meta.duration).toBeCloseTo(30, 3);
  });

  it('marks the Lap Number channel as discrete and Car Pos Norm as continuous', () => {
    const session = openSession(sampleBytes());
    const byName = new Map(session.meta.channels.map((c) => [c.name, c]));

    expect(byName.get('Lap Number')?.discrete).toBe(true);
    expect(byName.get('Car Pos Norm')?.discrete).toBe(false);
  });

  it('indexes laps and marks the partial ones', () => {
    const session = openSession(sampleBytes());
    expect(session.meta.laps.map((l) => l.complete)).toEqual([false, true, true, false]);
  });

  it('takes the track length from the .ldx when present', () => {
    const session = openSession(sampleBytes(), {
      ldxText: '<LDXFile><Numeric Id="Venue Length" Value="1000" Unit="m"/></LDXFile>',
    });

    expect(session.meta.trackLength).toBeCloseTo(1000, 3);
    expect(session.grid.approximate).toBe(false);
    expect(session.grid.points).toBe(1000);
  });

  it('estimates the track length from Lap Distance when there is no .ldx', () => {
    const session = openSession(sampleBytes());

    expect(session.grid.approximate).toBe(true);
    expect(session.grid.length).toBeCloseTo(1000, 0);
  });

  // FIX A: channel() used to hand out the session's own cached array, so
  // transferring one to a worker detached the session's copy too.
  it('returns a fresh array from channel() on every call', () => {
    const session = openSession(sampleBytes());
    const first = session.channel('Car Pos Norm');
    const second = session.channel('Car Pos Norm');

    expect(first).not.toBe(second);
    expect([...first]).toEqual([...second]);

    first[0] = -999;
    expect(second[0]).not.toBe(-999);
  });

  it('reports an unknown channel by name', () => {
    const session = openSession(sampleBytes());
    expect(() => session.channel('Nope')).toThrow(/no channel named "Nope"/);
  });

  it('returns lap series on the distance grid', () => {
    const session = openSession(sampleBytes());
    const series = session.series(1, 'Ground Speed');

    expect(series).toHaveLength(session.grid.points);
    expect([...series].every(Number.isFinite)).toBe(true);
    // The fixture ramps Ground Speed from slow to fast over the lap, so the
    // resampled series should rise from start to middle to end.
    const mid = Math.floor(series.length / 2);
    expect(series[0]).toBeLessThan(series[mid]);
    expect(series[mid]).toBeLessThan(series[series.length - 1]);
  });

  // FIX A: series() used to hand out the session's own cached resampled
  // array, so transferring one to a worker detached the session's copy too.
  it('returns a fresh array from series() on every call', () => {
    const session = openSession(sampleBytes());
    const first = session.series(1, 'Ground Speed');
    const second = session.series(1, 'Ground Speed');

    expect(first).not.toBe(second);
    expect([...first]).toEqual([...second]);

    first[0] = -999;
    expect(second[0]).not.toBe(-999);
  });

  // FIX A: writing into a channel array must not corrupt a later series()
  // built from the same underlying channel, because the private helper that
  // feeds the resampler used to hand out the identical cached array. The
  // mutation happens BEFORE the first series() request for this lap, so a
  // pre-existing series cache cannot hide the corruption.
  it('does not let a mutated channel() array corrupt a later series()', () => {
    const session = openSession(sampleBytes());

    const speed = session.channel('Ground Speed');
    speed.fill(-1);

    const series = session.series(1, 'Ground Speed');
    expect([...series].every((v) => v !== -1)).toBe(true);
    expect(series[0]).toBeGreaterThan(0);
  });

  it('gives a zero delta for a lap against itself', () => {
    const session = openSession(sampleBytes());
    const delta = session.delta(1, 1);
    expect([...delta].every((v) => v === 0)).toBe(true);
  });

  it('refuses to build a series for an unknown lap', () => {
    const session = openSession(sampleBytes());
    expect(() => session.series(99, 'Ground Speed')).toThrow(/no lap 99/);
  });

  // FIX 1: the raw Lap Time channel does not reset in step with the Car Pos
  // Norm wrap, so a per-lap resampled Lap Time series is non-monotone on about
  // a third of real laps. Feeding two of them to computeDelta reproduces a bug
  // an earlier round removed, so the trap has to be loud.
  it('refuses to resample the Lap Time channel and points at elapsed()', () => {
    const session = openSession(sampleBytes());
    expect(() => session.series(1, 'Lap Time')).toThrow(/elapsed/);
    expect(() => session.series(1, 'Lap Time')).toThrow(/Lap Time/);
  });

  it('still exposes the raw Lap Time channel through channel()', () => {
    const session = openSession(sampleBytes());
    expect(session.channel('Lap Time').length).toBeGreaterThan(0);
  });

  it('exposes elapsed lap time that starts at zero and never goes backwards', () => {
    const session = openSession(sampleBytes());
    const elapsed = session.elapsed(1);

    expect(elapsed).toHaveLength(session.grid.points);
    expect(elapsed[0]).toBeCloseTo(0, 5);
    for (let i = 1; i < elapsed.length; i++) {
      expect(elapsed[i]).toBeGreaterThanOrEqual(elapsed[i - 1] - 1e-5);
    }
  });

  // FIX A: elapsed() used to hand out the session's own cached array, so
  // transferring one to a worker detached the session's copy too — and the
  // follow-on delta() call would then fail with a misleading grid-mismatch
  // error instead of a clear "this array was transferred" signal.
  it('returns a fresh array from elapsed() on every call', () => {
    const session = openSession(sampleBytes());
    const first = session.elapsed(1);
    const second = session.elapsed(1);

    expect(first).not.toBe(second);
    expect([...first]).toEqual([...second]);

    first[0] = -999;
    expect(second[0]).not.toBe(-999);
  });

  it('refuses to compute elapsed for an unknown lap', () => {
    const session = openSession(sampleBytes());
    expect(() => session.elapsed(99)).toThrow(/no lap 99/);
  });

  it('composes a cross-session delta from two sessions elapsed arrays', () => {
    const reference = openSession(sampleBytes(), { fileName: 'a.ld' });
    const comparison = openSession(sampleBytes(), { fileName: 'b.ld' });

    const delta = computeDelta(reference.elapsed(1), comparison.elapsed(2));
    expect(delta).toHaveLength(reference.grid.points);
    expect([...delta].every(Number.isFinite)).toBe(true);
  });

  // FIX A: transferring an accessor's returned array (the plan-2 worker
  // protocol's whole point) must not damage the session's own copy, and a
  // later delta() built from a transferred elapsed() must still work rather
  // than throwing a misleading grid-mismatch error.
  it('keeps serving channel(), series() and elapsed() correctly after a caller detaches the returned buffer', () => {
    const session = openSession(sampleBytes());

    const channelCopy = session.channel('Ground Speed');
    structuredClone(channelCopy.buffer, { transfer: [channelCopy.buffer] });
    expect(channelCopy.byteLength).toBe(0);
    expect(session.channel('Ground Speed').length).toBeGreaterThan(0);

    const seriesCopy = session.series(1, 'Ground Speed');
    structuredClone(seriesCopy.buffer, { transfer: [seriesCopy.buffer] });
    expect(seriesCopy.byteLength).toBe(0);
    expect(session.series(1, 'Ground Speed')).toHaveLength(session.grid.points);

    const elapsedCopy = session.elapsed(1);
    structuredClone(elapsedCopy.buffer, { transfer: [elapsedCopy.buffer] });
    expect(elapsedCopy.byteLength).toBe(0);
    expect(session.elapsed(1)).toHaveLength(session.grid.points);

    // The follow-on failure this fix removes: delta() must still work after
    // its elapsed() input was transferred away by the caller.
    expect(() => session.delta(1, 2)).not.toThrow();
  });

  // FIX 2: the aligned decode path used to hand out a Float32Array view over
  // the whole 30 MB file buffer. Transferring one detached every other channel,
  // and writing to one corrupted the file bytes for every later decode.
  it('returns channel data that owns its own buffer', () => {
    const session = openSession(sampleBytes());
    const speed = session.channel('Ground Speed');

    expect(speed.buffer.byteLength).toBe(speed.byteLength);
    expect(speed.byteOffset).toBe(0);
  });

  it('does not alias the file bytes, so writing to a channel cannot corrupt it', () => {
    const bytes = sampleBytes();

    const first = openSession(bytes);
    const before = [...first.channel('Ground Speed').slice(0, 4)];
    first.channel('Ground Speed')[0] = -12345;

    const second = openSession(bytes);
    expect([...second.channel('Ground Speed').slice(0, 4)]).toEqual(before);
  });

  // FIX 8: two recordings can share a venue, date and time down to the second.
  it('gives every session a distinct default id', () => {
    const a = openSession(sampleBytes());
    const b = openSession(sampleBytes());

    expect(a.meta.id).not.toBe(b.meta.id);
    expect(a.meta.id).toContain('test-venue');
    expect(b.meta.id).toContain('test-venue');
  });

  it('lets an explicit id override the default', () => {
    const session = openSession(sampleBytes(), { id: 'chosen' });
    expect(session.meta.id).toBe('chosen');
  });

  it('requires the channels lap detection depends on', () => {
    const bytes = buildLd({ channels: [{ name: 'Speed', freq: 10, values: [1, 2, 3] }] });
    expect(() => openSession(bytes)).toThrow(/Car Pos Norm/);
  });
});
