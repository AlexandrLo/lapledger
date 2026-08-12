import { describe, expect, it } from 'vitest';
import { buildLapIndex } from './lapIndex';
import { buildLapBasis, makeDistanceGrid, resampleToDistance } from './resample';

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
});
