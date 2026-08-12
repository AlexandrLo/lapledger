import { sampleLinear } from './interpolate';
import type { ChannelSeries } from './lapIndex';

/** Allowance over the speed-derived step, in metres, before a sample is rejected. */
const STEP_SLACK = 5;
/** Multiplier on the speed-derived step before a sample is rejected. */
const STEP_TOLERANCE = 2;
/** Backwards movement larger than this is impossible for an odometer. */
const MAX_BACKWARD = 0.5;

const KPH_TO_MPS = 1 / 3.6;

/**
 * Removes the corrupt odometer samples MoTeC/Telemetrick emits around lap
 * transitions and fills the gaps by linear interpolation.
 */
export function despikeDistance(distance: ChannelSeries, speedKph: ChannelSeries): Float32Array {
  const values = distance.values;
  const n = values.length;
  const out = new Float32Array(n);
  if (n === 0) return out;

  const good = new Uint8Array(n);
  good[0] = 1;

  for (let i = 1; i < n; i++) {
    const t = i / distance.freq;
    const speed = Math.max(0, sampleLinear(speedKph.values, speedKph.freq, t)) * KPH_TO_MPS;
    const maxStep = (speed / distance.freq) * STEP_TOLERANCE + STEP_SLACK;
    const step = values[i] - values[i - 1];
    good[i] = step >= -MAX_BACKWARD && step <= maxStep ? 1 : 0;
  }

  // A spike also corrupts the step into the following sample, so drop its
  // neighbour. Read from a snapshot: mutating `good` in place would cascade,
  // and a single spike would condemn the entire rest of the series.
  const firstPass = good.slice();
  for (let i = 1; i < n - 1; i++) {
    if (firstPass[i] === 0) good[i + 1] = 0;
  }

  // good[0] is forced to 1 above, so at least one anchor always exists.
  let previousGood = -1;
  for (let i = 0; i < n; i++) {
    if (good[i] === 1) {
      out[i] = values[i];
      if (previousGood >= 0 && i - previousGood > 1) {
        fillGap(out, previousGood, i);
      }
      previousGood = i;
    }
  }

  // A trailing run of rejected samples holds the last good value.
  for (let i = previousGood + 1; i < n; i++) out[i] = out[previousGood];

  return out;
}

function fillGap(out: Float32Array, from: number, to: number): void {
  const span = to - from;
  const rise = out[to] - out[from];
  for (let k = 1; k < span; k++) {
    out[from + k] = out[from] + (rise * k) / span;
  }
}
