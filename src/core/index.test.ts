import { describe, expect, it } from 'vitest';
import { buildLd } from '../../test/fixtures/buildLd';
import { computeDelta, CORE_VERSION, openSession } from './index';

/** Two complete laps plus partial ends, 10 Hz, 1000 m per lap at 10 m/s. */
function sampleBytes(): Uint8Array {
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
    channels: [
      { name: 'Car Pos Norm', shortName: 'Car Pos', freq: 10, values: pos },
      { name: 'Lap Number', shortName: 'Lap', freq: 10, dtypeA: 3, dtype: 2, values: lapNumber },
      { name: 'Lap Time', shortName: 'LapTime', unit: 's', freq: 10, values: lapTime },
      { name: 'Lap Distance', shortName: 'LDistanc', unit: 'm', freq: 10, values: distance },
      { name: 'Ground Speed', shortName: 'Gnd Spd', unit: 'kph', freq: 10, values: speed },
    ],
  });
}

describe('core', () => {
  it('exposes a version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });

  // FIX 1: comparing laps recorded in two different sessions is MVP scope and
  // the whole point of LapRef, so the barrel must make it composable without
  // reaching past the public surface.
  it('makes a cross-session delta composable from the barrel alone', () => {
    const ldxText = '<LDXFile><Numeric Id="Venue Length" Value="1000" Unit="m"/></LDXFile>';
    const reference = openSession(sampleBytes(), { fileName: 'a.ld', ldxText });
    const comparison = openSession(sampleBytes(), { fileName: 'b.ld', ldxText });

    expect(reference.grid.points).toBe(comparison.grid.points);

    const delta = computeDelta(reference.elapsed(1), comparison.elapsed(2));
    expect(delta).toHaveLength(reference.grid.points);
    expect([...delta].every(Number.isFinite)).toBe(true);
  });
});
