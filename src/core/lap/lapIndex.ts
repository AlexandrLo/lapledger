import { sampleStep } from './interpolate';

export type ChannelSeries = { values: Float32Array; freq: number };

export type LapChannels = {
  carPosNorm: ChannelSeries;
  lapNumber: ChannelSeries;
  lapTime: ChannelSeries;
  lapInvalidated?: ChannelSeries;
};

export type LapMeta = {
  /** Unique zero-based index of the lap within the session. */
  number: number;
  /**
   * The sim's own Lap Number value. NOT unique: on real recordings the counter
   * can lag a Car Pos Norm wrap by a whole lap, so two laps may report the same
   * value. Use it for display, never as an identity.
   */
  sourceNumber: number;
  startTime: number;
  endTime: number;
  lapTime: number;
  valid: boolean;
  complete: boolean;
  /** Inclusive indices into carPosNorm. */
  startIndex: number;
  endIndex: number;
};

/** A drop larger than this in Car Pos Norm is a lap boundary, not noise. */
const WRAP_THRESHOLD = 0.5;

/**
 * A 10 Hz wrap boundary only resolves to 100 ms, so the channel and the
 * geometric duration should agree to well within this. On real recordings the
 * Lap Time channel occasionally fails to reset at the wrap, and the window
 * maximum then carries the previous lap's tail — up to 5.9 s out on the
 * Knockhill sample. Fall back to the geometry rather than publish that.
 */
const LAP_TIME_TOLERANCE = 0.25;

export function buildLapIndex(channels: LapChannels): LapMeta[] {
  const pos = channels.carPosNorm.values;
  const posFreq = channels.carPosNorm.freq;
  if (pos.length === 0) return [];

  const wraps: number[] = [];
  for (let j = 1; j < pos.length; j++) {
    if (pos[j] < pos[j - 1] - WRAP_THRESHOLD) wraps.push(j);
  }

  const segments: Array<{ start: number; end: number; complete: boolean }> = [];
  if (wraps.length === 0) {
    segments.push({ start: 0, end: pos.length - 1, complete: false });
  } else {
    // wraps[0] is always >= 1 because the wrap-detection loop starts at j = 1.
    segments.push({ start: 0, end: wraps[0] - 1, complete: false });
    for (let k = 0; k < wraps.length - 1; k++) {
      segments.push({ start: wraps[k], end: wraps[k + 1] - 1, complete: true });
    }
    segments.push({ start: wraps[wraps.length - 1], end: pos.length - 1, complete: false });
  }

  return segments.map(({ start, end, complete }, segmentIndex) => {
    const startTime = start / posFreq;
    const endTime = (end + 1) / posFreq;
    const midTime = (startTime + endTime) / 2;

    const spanned = endTime - startTime;
    const fromChannel = maxInWindow(channels.lapTime, startTime, endTime);
    const lapTime = Math.abs(fromChannel - spanned) <= LAP_TIME_TOLERANCE ? fromChannel : spanned;

    return {
      number: segmentIndex,
      sourceNumber: Math.round(sampleStep(channels.lapNumber.values, channels.lapNumber.freq, midTime)),
      startTime,
      endTime,
      lapTime,
      valid: complete ? !flagSetInWindow(channels.lapInvalidated, startTime, endTime) : false,
      complete,
      startIndex: start,
      endIndex: end,
    };
  });
}

/**
 * A lap window is [startTime, endTime), where endTime is the next lap's start.
 * The upper bound is therefore exclusive — an inclusive one would let a
 * flag raised on the next lap's first sample invalidate this lap.
 */
function windowBounds(series: ChannelSeries, from: number, to: number): [number, number] {
  const last = series.values.length - 1;
  const lo = Math.max(0, Math.min(last, Math.floor(from * series.freq)));
  const hi = Math.max(lo, Math.min(last, Math.ceil(to * series.freq) - 1));
  return [lo, hi];
}

function maxInWindow(series: ChannelSeries, from: number, to: number): number {
  if (series.values.length === 0) return 0;
  const [lo, hi] = windowBounds(series, from, to);
  let max = series.values[lo];
  for (let i = lo + 1; i <= hi; i++) {
    if (series.values[i] > max) max = series.values[i];
  }
  return max;
}

function flagSetInWindow(series: ChannelSeries | undefined, from: number, to: number): boolean {
  if (!series || series.values.length === 0) return false;
  const [lo, hi] = windowBounds(series, from, to);
  for (let i = lo; i <= hi; i++) {
    if (series.values[i] !== 0) return true;
  }
  return false;
}
