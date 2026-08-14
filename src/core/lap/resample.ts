import type { DistanceGrid } from '@core/types';
import { pchipEval, pchipSlopes, sampleLinear, sampleStep } from './interpolate';
import type { ChannelSeries, LapMeta } from './lapIndex';

const DEFAULT_STEP_METRES = 1;

export function makeDistanceGrid(
  length: number,
  options: { step?: number; approximate?: boolean } = {},
): DistanceGrid {
  const step = options.step ?? DEFAULT_STEP_METRES;
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`track length must be a positive number of metres, got ${length}`);
  }
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`grid step must be a positive number of metres, got ${step}`);
  }
  return {
    step,
    length,
    points: Math.max(1, Math.ceil(length / step)),
    approximate: options.approximate ?? false,
  };
}

export type LapBasis = {
  /** Non-decreasing track position, 0..1. */
  u: Float64Array;
  /** Absolute session time in seconds for each u. */
  t: Float64Array;
  slopes: Float64Array;
};

/**
 * Car Pos Norm is a normalised track position, so anything outside [0, 1] is
 * meaningless. The margin above 1 exists because the real recordings carry
 * legitimate values up to 1.0008 on a lap's final sample, where the sim has
 * already crossed the line but has not yet wrapped the counter.
 *
 * Anything beyond it is an outlier: the Knockhill recording reaches 1.3802 at
 * sample 1 and 1.2389 at sample 4, with 16 samples above this bound in total.
 * Left in, the running maximum latches on the spike and every later sample
 * inherits it, so the basis becomes a plateau and the lap's whole series
 * flattens to a constant — silently, with no NaN and no flag.
 */
const MAX_POSITION = 1.001;
const MIN_POSITION = 0;

/**
 * Builds the position-to-time mapping for one lap. Monotonisation happens
 * strictly inside the already-determined boundaries — applying a running
 * maximum across a boundary would flatten the whole lap.
 *
 * Samples outside the plausible position range are skipped: they neither
 * become basis nodes nor feed the running maximum. Fewer than two survivors
 * leaves an empty basis, which the resamplers below handle as all-zero output.
 */
export function buildLapBasis(carPosNorm: ChannelSeries, lap: LapMeta): LapBasis {
  const count = lap.endIndex - lap.startIndex + 1;
  const u = new Float64Array(count);
  const t = new Float64Array(count);

  let kept = 0;
  let running = -Infinity;
  for (let k = 0; k < count; k++) {
    const index = lap.startIndex + k;
    const value = carPosNorm.values[index];
    if (!(value >= MIN_POSITION && value <= MAX_POSITION)) continue;
    running = value < running ? running : value;
    u[kept] = running;
    t[kept] = index / carPosNorm.freq;
    kept++;
  }

  if (kept < 2) {
    const empty = new Float64Array(0);
    return { u: empty, t: empty, slopes: empty };
  }

  const keptU = kept === count ? u : u.slice(0, kept);
  const keptT = kept === count ? t : t.slice(0, kept);
  return { u: keptU, t: keptT, slopes: pchipSlopes(keptU, keptT) };
}

/**
 * Sweeps the distance grid once, clamping each node to the lap's position
 * extent and evaluating the basis there, and hands the resulting absolute
 * session time to `emit`.
 *
 * Both resamplers below share this so they cannot drift apart on what a lap's
 * extent is: if they disagreed, a channel series and its elapsed time would
 * describe different laps, and neither function's own tests would notice.
 * Does nothing for an empty basis, leaving the caller's output all zeros.
 */
function walkGrid(
  basis: LapBasis,
  grid: DistanceGrid,
  emit: (node: number, time: number) => void,
): void {
  if (basis.u.length === 0) return;

  const first = basis.u[0];
  const last = basis.u[basis.u.length - 1];

  let hint = 0;
  for (let i = 0; i < grid.points; i++) {
    const distance = i * grid.step;
    let position = distance / grid.length;
    if (position < first) position = first;
    else if (position > last) position = last;

    const evaluated = pchipEval(basis.u, basis.t, basis.slopes, position, hint);
    hint = evaluated.index;
    emit(i, evaluated.value);
  }
}

export function resampleToDistance(
  channel: ChannelSeries,
  basis: LapBasis,
  grid: DistanceGrid,
  discrete: boolean,
): Float32Array {
  const out = new Float32Array(grid.points);
  const sample = discrete ? sampleStep : sampleLinear;

  walkGrid(basis, grid, (node, time) => {
    out[node] = sample(channel.values, channel.freq, time);
  });

  return out;
}

/**
 * Elapsed time within the lap at each grid node, in seconds.
 *
 * Derived from the lap basis rather than from the `Lap Time` channel: on the
 * real recordings that channel fails to reset in step with the position wrap
 * on a third of laps, ending a lap at 17 s instead of 120 s or starting one at
 * 54 s. The basis is monotone by construction, so this is too.
 */
export function resampleElapsedTime(basis: LapBasis, grid: DistanceGrid): Float32Array {
  const out = new Float32Array(grid.points);
  const t0 = basis.t.length > 0 ? basis.t[0] : 0;

  walkGrid(basis, grid, (node, time) => {
    out[node] = time - t0;
  });

  return out;
}
