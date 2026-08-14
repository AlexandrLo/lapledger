import { describe, expect, it } from 'vitest';

import { pchipEval, pchipSlopes, sampleLinear, sampleStep } from '@core/lap/interpolate';

function evalAt(xs: number[], ys: number[], x: number): number {
  const fx = Float64Array.from(xs);
  const fy = Float64Array.from(ys);
  return pchipEval(fx, fy, pchipSlopes(fx, fy), x).value;
}

describe('pchip', () => {
  it('reproduces the knots exactly', () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 2, 3, 9];
    for (const [i, x] of xs.entries()) {
      expect(evalAt(xs, ys, x)).toBeCloseTo(ys[i], 10);
    }
  });

  it('is exact on linear data', () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 2, 4, 6];
    expect(evalAt(xs, ys, 0.5)).toBeCloseTo(1, 10);
    expect(evalAt(xs, ys, 2.25)).toBeCloseTo(4.5, 10);
  });

  it('does not overshoot a step', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [0, 0, 1, 1, 1];
    for (let x = 0; x <= 4; x += 0.05) {
      const y = evalAt(xs, ys, x);
      expect(y).toBeGreaterThanOrEqual(-1e-12);
      expect(y).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('stays monotone on monotone data', () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const ys = [0, 0.1, 0.15, 0.6, 0.9, 1];
    let previous = -Infinity;
    for (let x = 0; x <= 5; x += 0.01) {
      const y = evalAt(xs, ys, x);
      expect(y).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = y;
    }
  });

  it('clamps outside the knot range', () => {
    const xs = [0, 1, 2];
    const ys = [5, 6, 7];
    expect(evalAt(xs, ys, -3)).toBeCloseTo(5, 10);
    expect(evalAt(xs, ys, 99)).toBeCloseTo(7, 10);
  });

  it('accepts a hint and returns the interval used', () => {
    const xs = Float64Array.from([0, 1, 2, 3]);
    const ys = Float64Array.from([0, 1, 2, 3]);
    const slopes = pchipSlopes(xs, ys);

    const first = pchipEval(xs, ys, slopes, 2.5);
    expect(first.value).toBeCloseTo(2.5, 10);
    const second = pchipEval(xs, ys, slopes, 2.75, first.index);
    expect(second.value).toBeCloseTo(2.75, 10);
  });
});

describe('sampling', () => {
  const values = Float32Array.from([0, 10, 20, 30]);

  it('interpolates linearly between samples', () => {
    expect(sampleLinear(values, 10, 0.15)).toBeCloseTo(15, 5);
  });

  it('holds the previous value when stepping', () => {
    expect(sampleStep(values, 10, 0.15)).toBe(10);
    expect(sampleStep(values, 10, 0.19)).toBe(10);
    expect(sampleStep(values, 10, 0.2)).toBe(20);
  });

  it('clamps to the ends of the channel', () => {
    expect(sampleLinear(values, 10, -5)).toBe(0);
    expect(sampleLinear(values, 10, 500)).toBe(30);
    expect(sampleStep(values, 10, 500)).toBe(30);
  });

  it('handles floating-point rounding at reconstructed sample times for sampleStep', () => {
    const testValues = Float32Array.from({ length: 200 }, (_, i) => i);
    const frequencies = [1, 10, 30, 50];

    for (const freq of frequencies) {
      for (let i = 0; i < testValues.length; i++) {
        const t = i / freq;
        const result = sampleStep(testValues, freq, t);
        expect(result).toBe(i);
      }
    }
  });

  it('handles floating-point rounding at reconstructed sample times for sampleLinear', () => {
    const testValues = Float32Array.from({ length: 200 }, (_, i) => i);
    const frequencies = [1, 10, 30, 50];

    for (const freq of frequencies) {
      for (let i = 0; i < testValues.length; i++) {
        const t = i / freq;
        const result = sampleLinear(testValues, freq, t);
        expect(Math.abs(result - i)).toBeLessThan(1e-9);
      }
    }
  });

  it('maintains step-hold behavior after rounding fix', () => {
    expect(sampleStep(values, 10, 0.19)).toBe(10);
    expect(sampleStep(values, 10, 0.2)).toBe(20);
  });
});
