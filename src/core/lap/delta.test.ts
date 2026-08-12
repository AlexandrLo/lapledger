import { describe, expect, it } from 'vitest';
import { computeDelta } from './delta';

describe('computeDelta', () => {
  it('is zero for a lap against itself', () => {
    const lap = Float32Array.from([0, 1, 2, 3.5, 7]);
    expect([...computeDelta(lap, lap)]).toEqual([0, 0, 0, 0, 0]);
  });

  it('is positive where the comparison lap is behind', () => {
    const reference = Float32Array.from([0, 1, 2, 3]);
    const comparison = Float32Array.from([0, 1.2, 2.1, 2.9]);

    const delta = computeDelta(reference, comparison);
    expect(delta[1]).toBeCloseTo(0.2, 5);
    expect(delta[2]).toBeCloseTo(0.1, 5);
    expect(delta[3]).toBeCloseTo(-0.1, 5);
  });

  it('rejects grids of different sizes', () => {
    expect(() => computeDelta(new Float32Array(3), new Float32Array(4))).toThrow(
      /same distance grid/,
    );
  });

  // FIX 1: the parameter names are what an IDE tooltip shows, and the tooltip
  // is what tells a caller these are elapsed()-derived arrays rather than the
  // broken per-lap Lap Time series.
  it('names elapsed time in its arity error, not lap time', () => {
    expect(() => computeDelta(new Float32Array(3), new Float32Array(4))).toThrow(/elapsed/i);
    expect(() => computeDelta(new Float32Array(3), new Float32Array(4))).not.toThrow(
      /lap time/i,
    );
  });

  it('declares its parameters as elapsed arrays', () => {
    const source = computeDelta.toString();
    expect(source).toContain('referenceElapsed');
    expect(source).toContain('comparisonElapsed');
  });
});
