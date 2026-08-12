import type { DistanceGrid } from '../types';
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
 * Builds the position-to-time mapping for one lap. Monotonisation happens
 * strictly inside the already-determined boundaries — applying a running
 * maximum across a boundary would flatten the whole lap.
 */
export function buildLapBasis(carPosNorm: ChannelSeries, lap: LapMeta): LapBasis {
  const count = lap.endIndex - lap.startIndex + 1;
  const u = new Float64Array(count);
  const t = new Float64Array(count);

  let running = -Infinity;
  for (let k = 0; k < count; k++) {
    const index = lap.startIndex + k;
    const value = carPosNorm.values[index];
    running = value < running ? running : value;
    u[k] = running;
    t[k] = index / carPosNorm.freq;
  }

  return { u, t, slopes: pchipSlopes(u, t) };
}

export function resampleToDistance(
  channel: ChannelSeries,
  basis: LapBasis,
  grid: DistanceGrid,
  discrete: boolean,
): Float32Array {
  const out = new Float32Array(grid.points);
  if (basis.u.length === 0) return out;

  const first = basis.u[0];
  const last = basis.u[basis.u.length - 1];
  const sample = discrete ? sampleStep : sampleLinear;

  let hint = 0;
  for (let i = 0; i < grid.points; i++) {
    const distance = i * grid.step;
    let position = distance / grid.length;
    if (position < first) position = first;
    else if (position > last) position = last;

    const evaluated = pchipEval(basis.u, basis.t, basis.slopes, position, hint);
    hint = evaluated.index;
    out[i] = sample(channel.values, channel.freq, evaluated.value);
  }

  return out;
}
