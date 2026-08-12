import { describe, expect, it } from 'vitest';
import { despikeDistance } from './despike';

/** 100 samples at 10 Hz, a constant 36 kph (10 m/s), so 1 m per sample. */
function clean(): { distance: Float32Array; speed: Float32Array } {
  const distance = new Float32Array(100);
  const speed = new Float32Array(100);
  for (let i = 0; i < 100; i++) {
    distance[i] = i;
    speed[i] = 36;
  }
  return { distance, speed };
}

describe('despikeDistance', () => {
  it('leaves clean data untouched', () => {
    const { distance, speed } = clean();
    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    expect([...out]).toEqual([...distance]);
  });

  it('repairs an upward spike', () => {
    const { distance, speed } = clean();
    distance[50] = 33365;

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    expect(out[50]).toBeCloseTo(50, 3);
  });

  it('repairs a spike followed by a garbage value', () => {
    const { distance, speed } = clean();
    distance[50] = 33365;
    distance[51] = 20126;

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    expect(out[50]).toBeCloseTo(50, 3);
    expect(out[51]).toBeCloseTo(51, 3);
  });

  it('keeps the series non-decreasing', () => {
    const { distance, speed } = clean();
    distance[30] = 9999;
    distance[31] = 12;
    distance[70] = -500;

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-6);
    }
  });

  it('returns an empty array for empty input', () => {
    const out = despikeDistance(
      { values: new Float32Array(0), freq: 10 },
      { values: new Float32Array(0), freq: 10 },
    );
    expect(out).toHaveLength(0);
  });
});
