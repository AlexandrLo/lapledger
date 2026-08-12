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
 *
 * The output is repaired for isolated spikes but is NOT guaranteed
 * non-decreasing across genuine odometer resets (e.g., session restarts).
 * Callers that need monotone distance must handle resets separately.
 */
export function despikeDistance(distance: ChannelSeries, speedKph: ChannelSeries): Float32Array {
  const values = distance.values;
  const n = values.length;
  const out = new Float32Array(n);
  if (n === 0) return out;

  const good = new Uint8Array(n);

  // Decide whether sample 0 is good or corrupt. For fewer than 3 samples,
  // trust sample 0 since there is nothing to cross-check against.
  if (n < 3) {
    good[0] = 1;
    if (n === 2) {
      const t = 1 / distance.freq;
      const speed = Math.max(0, sampleLinear(speedKph.values, speedKph.freq, t)) * KPH_TO_MPS;
      const maxStep = (speed / distance.freq) * STEP_TOLERANCE + STEP_SLACK;
      const step = values[1] - values[0];
      good[1] = step >= -MAX_BACKWARD && step <= maxStep ? 1 : 0;
    }
  } else {
    // Sample 0 is bad only if the step from 0 to 1 is implausible while
    // the step from 1 to 2 is plausible — meaning sample 1 is consistent
    // with everything after it, so sample 0 is the outlier.
    const t1 = 1 / distance.freq;
    const speed1 = Math.max(0, sampleLinear(speedKph.values, speedKph.freq, t1)) * KPH_TO_MPS;
    const maxStep1 = (speed1 / distance.freq) * STEP_TOLERANCE + STEP_SLACK;
    const step01 = values[1] - values[0];

    const t2 = 2 / distance.freq;
    const speed2 = Math.max(0, sampleLinear(speedKph.values, speedKph.freq, t2)) * KPH_TO_MPS;
    const maxStep2 = (speed2 / distance.freq) * STEP_TOLERANCE + STEP_SLACK;
    const step12 = values[2] - values[1];

    const bad01 = step01 < -MAX_BACKWARD || step01 > maxStep1;
    const good12 = step12 >= -MAX_BACKWARD && step12 <= maxStep2;

    if (bad01 && good12) {
      good[0] = 0;
      good[1] = 1;
    } else {
      good[0] = 1;
      const step = values[1] - values[0];
      good[1] = step >= -MAX_BACKWARD && step <= maxStep1 ? 1 : 0;
    }
  }

  // Evaluate samples 2 onwards
  for (let i = 2; i < n; i++) {
    const t = i / distance.freq;
    const speed = Math.max(0, sampleLinear(speedKph.values, speedKph.freq, t)) * KPH_TO_MPS;
    const maxStep = (speed / distance.freq) * STEP_TOLERANCE + STEP_SLACK;
    const step = values[i] - values[i - 1];
    good[i] = step >= -MAX_BACKWARD && step <= maxStep ? 1 : 0;
  }

  // A spike also corrupts the step into the following sample, so drop its
  // neighbour. Read from a snapshot: mutating `good` in place would cascade,
  // and a single spike would condemn the entire rest of the series.
  // Only cascade if the bad sample is isolated (previous sample is good),
  // not for runs of bad samples which indicate genuine resets.
  const firstPass = good.slice();
  for (let i = 1; i < n - 1; i++) {
    if (firstPass[i] === 0 && firstPass[i - 1] === 1) {
      good[i + 1] = 0;
    }
  }

  // At least one anchor should exist (sample 0 or another good sample).
  let previousGood = -1;
  for (let i = 0; i < n; i++) {
    if (good[i] === 1) {
      out[i] = values[i];
      if (previousGood >= 0 && i - previousGood > 1) {
        fillGap(out, previousGood, i, values, distance.freq, speedKph);
      }
      previousGood = i;
    }
  }

  // If no good sample was found, copy all values (edge case for all-corrupt input).
  if (previousGood === -1) {
    for (let i = 0; i < n; i++) {
      out[i] = values[i];
    }
    return out;
  }

  // A leading run of rejected samples takes the value of the first good sample.
  for (let i = 0; i < n; i++) {
    if (good[i] === 1) {
      for (let j = 0; j < i; j++) {
        out[j] = values[i];
      }
      break;
    }
  }

  // A trailing run of rejected samples holds the last good value.
  for (let i = previousGood + 1; i < n; i++) out[i] = out[previousGood];

  return out;
}

function fillGap(
  out: Float32Array,
  from: number,
  to: number,
  values: Float32Array,
  freq: number,
  speedKph: ChannelSeries,
): void {
  const span = to - from;
  const rise = out[to] - out[from];
  const impliedStepPerSample = rise / span;

  // Check if the implied per-sample step is plausible at the midpoint of the gap.
  const midpoint = (from + to) / 2;
  const t = midpoint / freq;
  const speed = Math.max(0, sampleLinear(speedKph.values, speedKph.freq, t)) * KPH_TO_MPS;
  const maxStep = (speed / freq) * STEP_TOLERANCE + STEP_SLACK;

  if (Math.abs(impliedStepPerSample) <= maxStep) {
    // Bridge is plausible; interpolate linearly.
    for (let k = 1; k < span; k++) {
      out[from + k] = out[from] + (rise * k) / span;
    }
  } else {
    // Large sustained jump is an odometer reset rather than a spike.
    // Copy the original raw values; real measured data beats invented data.
    for (let k = 1; k < span; k++) {
      out[from + k] = values[from + k];
    }
  }
}
