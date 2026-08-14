import { describe, expect, it } from 'vitest';

import { despikeDistance } from '@core/lap/despike';

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

  it('repairs a corrupt first sample rather than trusting it', () => {
    const { distance, speed } = clean();
    distance[0] = 99999;

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    // First sample should be at the value of the first good sample, not the corrupt value
    expect(out[0]).toBeCloseTo(1, 1);
    // No fabricated ramp should descend from the corrupt first sample
    expect(out[1]).toBeCloseTo(1, 1);
    expect(out[2]).toBeCloseTo(2, 1);
  });

  it('handles a single sample without throwing', () => {
    const distance = new Float32Array([42]);
    const speed = new Float32Array([36]);

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    expect(out).toHaveLength(1);
    expect(out[0]).toBeCloseTo(42, 1);
    expect(Number.isNaN(out[0])).toBe(false);
  });

  it('handles two samples without throwing', () => {
    const distance = new Float32Array([0, 1]);
    const speed = new Float32Array([36, 36]);

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    expect(out).toHaveLength(2);
    expect(out[0]).toBeCloseTo(0, 1);
    expect(out[1]).toBeCloseTo(1, 1);
    expect(Number.isNaN(out[0])).toBe(false);
    expect(Number.isNaN(out[1])).toBe(false);
  });

  it('passes through genuine resets instead of bridging them', () => {
    // A ramp up to 2019, then restart from 1.6, then ramp again.
    // At 10 m/s, the implied step across the reset would be (1.6 - 2019) / 1 = -2017.4 m,
    // which is far beyond any plausible speed budget. Should NOT interpolate.
    const distance = new Float32Array(180);
    const speed = new Float32Array(180);

    // First ramp: 0..179 at 1 m per sample
    for (let i = 0; i < 180; i++) {
      distance[i] = i;
      speed[i] = 36;
    }

    // At index 177, introduce a reset
    distance[177] = 2019;
    distance[178] = 1.6;
    distance[179] = 2.6;

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });

    // The values at the reset indices should equal the originals, not interpolated
    expect(out[177]).toBeCloseTo(distance[177], 1);
    expect(out[178]).toBeCloseTo(distance[178], 1);
    expect(out[179]).toBeCloseTo(distance[179], 1);

    // Verify no value between the anchors was fabricated in the reset window
    // (all values should be close to original raw values or follow the good data)
    expect(out[177]).toBeGreaterThan(1000); // 2019
    expect(out[178]).toBeLessThan(100); // 1.6
    expect(out[179]).toBeCloseTo(distance[179], 1);
  });

  it('pins the cascade cluster semantics for two nearby isolated bad samples', () => {
    // Two isolated bad samples close together (bad, good, bad), not a run of
    // adjacent bad raw values. The step check flags 50 and 52 independently:
    // both are backward jumps beyond MAX_BACKWARD, while 51 and 53 land close
    // enough to their (corrupt) predecessor to look plausible on their own.
    //
    // The neighbour-drop cascade (fed from a `firstPass` snapshot) sees the
    // ORIGINAL rejection at 51 and 53 (both good) and, because 50 and 52 are
    // each isolated bad samples, drops both of their neighbours: 51 and 53
    // are cascaded to bad too. That leaves one gap spanning 49..54 with
    // anchors only at 49 and 54, filled by interpolating across the whole
    // span. A live-read variant would instead let the cascade's own write to
    // 51 suppress the second trigger at 52 (since it reads good[51] after it
    // has already been zeroed), leaving 53 as a surviving anchor and
    // producing different — and differently spanned — interpolated values.
    // This test was verified to fail under the live-read variant (see the
    // fix-2 report for the recorded output of both variants).
    const n = 60;
    const distance = new Float32Array(n);
    const speed = new Float32Array(n);
    for (let i = 0; i < n; i++) speed[i] = 36;
    for (let i = 0; i <= 49; i++) distance[i] = i;
    distance[50] = 47; // step 49->50 = -2, beyond MAX_BACKWARD: bad, isolated
    distance[51] = 47.2; // step 50->51 = 0.2: looks plausible on its own
    distance[52] = 45; // step 51->52 = -2.2, beyond MAX_BACKWARD: bad, isolated
    distance[53] = 45.3; // step 52->53 = 0.3: looks plausible on its own
    for (let i = 54; i < n; i++) distance[i] = 45.5 + 0.2 * (i - 54);

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });

    // Anchors, untouched.
    expect(out[48]).toBeCloseTo(48, 3);
    expect(out[49]).toBeCloseTo(49, 3);
    expect(out[54]).toBeCloseTo(45.5, 3);
    expect(out[55]).toBeCloseTo(45.7, 3);

    // The whole 49..54 span is cascaded to bad and linearly interpolated
    // between the two surviving anchors (49 -> 49, 54 -> 45.5).
    expect(out[50]).toBeCloseTo(48.3, 3);
    expect(out[51]).toBeCloseTo(47.6, 3);
    expect(out[52]).toBeCloseTo(46.9, 3);
    expect(out[53]).toBeCloseTo(46.2, 3);
  });

  it('still interpolates an isolated spike inside plausible data', () => {
    const { distance, speed } = clean();
    // Put a spike at index 40
    distance[40] = 10000;

    const out = despikeDistance({ values: distance, freq: 10 }, { values: speed, freq: 10 });
    // The spike should be repaired to something close to 40
    expect(out[40]).toBeCloseTo(40, 1);
    // Before and after should look normal
    expect(out[39]).toBeCloseTo(39, 1);
    expect(out[41]).toBeCloseTo(41, 1);
  });
});
