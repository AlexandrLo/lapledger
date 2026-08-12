import { describe, expect, it } from 'vitest';
import { buildLd, type FixtureChannel } from '../../test/fixtures/buildLd';
import { openSession } from './session';

/** Two complete laps plus partial ends, 10 Hz, 1000 m per lap at 10 m/s. */
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
      speed.push(360);
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

  it('caches decoded channels', () => {
    const session = openSession(sampleBytes());
    expect(session.channel('Car Pos Norm')).toBe(session.channel('Car Pos Norm'));
  });

  it('reports an unknown channel by name', () => {
    const session = openSession(sampleBytes());
    expect(() => session.channel('Nope')).toThrow(/no channel named "Nope"/);
  });

  it('returns lap series on the distance grid', () => {
    const session = openSession(sampleBytes());
    const series = session.series(1, 'Lap Time');

    expect(series).toHaveLength(session.grid.points);
    expect(series[0]).toBeCloseTo(0, 2);
    expect(series[series.length - 1]).toBeGreaterThan(8);
  });

  it('gives a zero delta for a lap against itself', () => {
    const session = openSession(sampleBytes());
    const delta = session.delta(1, 1);
    expect([...delta].every((v) => v === 0)).toBe(true);
  });

  it('refuses to build a series for an unknown lap', () => {
    const session = openSession(sampleBytes());
    expect(() => session.series(99, 'Lap Time')).toThrow(/no lap 99/);
  });

  it('requires the channels lap detection depends on', () => {
    const bytes = buildLd({ channels: [{ name: 'Speed', freq: 10, values: [1, 2, 3] }] });
    expect(() => openSession(bytes)).toThrow(/Car Pos Norm/);
  });
});
