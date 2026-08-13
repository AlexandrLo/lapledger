import { describe, expect, it } from 'vitest';
import { buildLapIndex } from './lapIndex';
import {
  buildLapBasis,
  makeDistanceGrid,
  resampleElapsedTime,
  resampleToDistance,
} from './resample';

/** One clean lap: 100 samples at 10 Hz sweeping Car Pos Norm from 0 to 0.99. */
function oneLap() {
  const pos = new Float32Array(200);
  const lapNumber = new Float32Array(200);
  const lapTime = new Float32Array(200);
  for (let i = 0; i < 200; i++) {
    pos[i] = (i % 100) / 100;
    lapNumber[i] = Math.floor(i / 100);
    lapTime[i] = (i % 100) / 10;
  }
  const channels = {
    carPosNorm: { values: pos, freq: 10 },
    lapNumber: { values: lapNumber, freq: 10 },
    lapTime: { values: lapTime, freq: 10 },
  };
  const laps = buildLapIndex(channels);
  return { channels, lap: laps[0] };
}

/** Two clean laps: 100 samples per lap at 10 Hz, second lap tests boundary conditions. */
function twoLaps() {
  const pos = new Float32Array(200);
  const lapNumber = new Float32Array(200);
  const lapTime = new Float32Array(200);
  for (let i = 0; i < 200; i++) {
    pos[i] = (i % 100) / 100;
    lapNumber[i] = Math.floor(i / 100);
    lapTime[i] = (i % 100) / 10;
  }
  const channels = {
    carPosNorm: { values: pos, freq: 10 },
    lapNumber: { values: lapNumber, freq: 10 },
    lapTime: { values: lapTime, freq: 10 },
  };
  const laps = buildLapIndex(channels);
  return { channels, lap1: laps[0], lap2: laps[1] };
}

describe('makeDistanceGrid', () => {
  it('uses a one-metre step by default', () => {
    const grid = makeDistanceGrid(5755);
    expect(grid.step).toBe(1);
    expect(grid.points).toBe(5755);
    expect(grid.approximate).toBe(false);
  });

  it('rejects a non-positive length', () => {
    expect(() => makeDistanceGrid(0)).toThrow(/track length/);
  });
});

describe('resampleToDistance', () => {
  it('produces one value per grid node', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const out = resampleToDistance(channels.carPosNorm, basis, grid, false);
    expect(out).toHaveLength(grid.points);
    expect([...out].every(Number.isFinite)).toBe(true);
  });

  it('recovers a channel that is linear in distance', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    // Car Pos Norm itself is exactly distance/length.
    const out = resampleToDistance(channels.carPosNorm, basis, grid, false);
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[500]).toBeCloseTo(0.5, 2);
    expect(out[900]).toBeCloseTo(0.9, 2);
  });

  it('keeps a monotone channel monotone', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const out = resampleToDistance(channels.lapTime, basis, grid, false);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-5);
    }
  });

  it('holds discrete channels at sample values', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const gear = new Float32Array(200);
    for (let i = 0; i < 200; i++) gear[i] = i < 50 ? 3 : 4;

    const out = resampleToDistance({ values: gear, freq: 10 }, basis, grid, true);
    expect(new Set([...out])).toEqual(new Set([3, 4]));
  });

  it('forces the basis to be non-decreasing', () => {
    const { channels, lap } = oneLap();
    channels.carPosNorm.values[30] = channels.carPosNorm.values[29] - 0.002;

    const basis = buildLapBasis(channels.carPosNorm, lap);
    for (let i = 1; i < basis.u.length; i++) {
      expect(basis.u[i]).toBeGreaterThanOrEqual(basis.u[i - 1]);
    }
  });

  // FIX 3: Knockhill's Car Pos Norm reaches 1.3802 at sample 1. The running
  // maximum latched on it, the first segment's basis became a 58-sample
  // plateau, and the resampled series was constant across 1946 m of a 2020 m
  // grid — flat charts and a flat delta with no NaN and no flag.
  it('ignores an out-of-range Car Pos Norm spike instead of latching on it', () => {
    const { channels, lap } = oneLap();
    channels.carPosNorm.values[1] = 1.3802;
    channels.carPosNorm.values[4] = 1.2389;

    const basis = buildLapBasis(channels.carPosNorm, lap);

    expect(Math.max(...basis.u)).toBeLessThan(1.001);
    expect(basis.u[basis.u.length - 1]).toBeGreaterThan(0.9);
    for (let i = 1; i < basis.u.length; i++) {
      expect(basis.u[i]).toBeGreaterThanOrEqual(basis.u[i - 1]);
    }
  });

  it('does not flatten the series into a plateau after a spike', () => {
    const { channels, lap } = oneLap();
    channels.carPosNorm.values[1] = 1.3802;

    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);
    const out = resampleToDistance(channels.lapTime, basis, grid, false);

    // A latched spike squeezes the whole grid into the 0.1 s between the two
    // surviving basis nodes, so the lap's 9.9 s of Lap Time collapse to ~0.
    const span = Math.max(...out) - Math.min(...out);
    expect(span).toBeGreaterThan(8);
  });

  it('accepts the legitimate 1.0008 sample real files carry at a lap end', () => {
    const { channels, lap } = oneLap();
    channels.carPosNorm.values[99] = 1.0008;

    const basis = buildLapBasis(channels.carPosNorm, lap);
    expect(basis.u.length).toBe(lap.endIndex - lap.startIndex + 1);
    expect(basis.u[basis.u.length - 1]).toBeCloseTo(1.0008, 4);
  });

  it('yields an empty basis when fewer than two samples survive the range check', () => {
    const { channels, lap } = oneLap();
    for (let i = lap.startIndex; i <= lap.endIndex; i++) {
      channels.carPosNorm.values[i] = 5;
    }

    const basis = buildLapBasis(channels.carPosNorm, lap);
    expect(basis.u).toHaveLength(0);

    const grid = makeDistanceGrid(1000);
    const out = resampleToDistance(channels.lapTime, basis, grid, false);
    expect([...out].every((v) => v === 0)).toBe(true);
  });

  it('handles non-zero startIndex correctly (boundary bug regression)', () => {
    const { channels, lap2 } = twoLaps();
    const basis = buildLapBasis(channels.carPosNorm, lap2);
    const grid = makeDistanceGrid(1000);

    // Second lap should start near 0, not be flattened
    expect(basis.u[0]).toBeLessThan(0.15);
    expect(basis.u[basis.u.length - 1]).toBeGreaterThan(0.8);

    // Resampled values should span a wide range, not collapse to a constant
    const out = resampleToDistance(channels.carPosNorm, basis, grid, false);
    const min = Math.min(...out);
    const max = Math.max(...out);
    expect(max - min).toBeGreaterThan(0.7);
  });
});

describe('resampleElapsedTime', () => {
  it('produces one value per grid node', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const out = resampleElapsedTime(basis, grid);
    expect(out).toHaveLength(grid.points);
    expect([...out].every(Number.isFinite)).toBe(true);
  });

  it('starts at zero and is non-decreasing', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const out = resampleElapsedTime(basis, grid);
    expect(out[0]).toBeCloseTo(0, 5);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-5);
    }
  });

  it('recovers elapsed time proportional to distance at constant speed', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const out = resampleElapsedTime(basis, grid);
    // At constant speed over 0.99 position in 10 seconds:
    // elapsed time ≈ distance / 1000 * 10 / 0.99
    const expectedAt500 = (500 / 1000) * (10 / 0.99);
    expect(out[500]).toBeCloseTo(expectedAt500, 0);
  });

  it('final element is close to lap duration', () => {
    const { channels, lap } = oneLap();
    const basis = buildLapBasis(channels.carPosNorm, lap);
    const grid = makeDistanceGrid(1000);

    const out = resampleElapsedTime(basis, grid);
    const expectedDuration = basis.t[basis.t.length - 1] - basis.t[0];
    expect(out[out.length - 1]).toBeCloseTo(expectedDuration, 1);
  });

  it('handles empty basis by returning zeros', () => {
    const emptyBasis = {
      u: new Float64Array(0),
      t: new Float64Array(0),
      slopes: new Float64Array(0),
    };
    const grid = makeDistanceGrid(100);

    const out = resampleElapsedTime(emptyBasis, grid);
    expect(out).toHaveLength(grid.points);
    expect([...out].every((v) => v === 0)).toBe(true);
  });
});
