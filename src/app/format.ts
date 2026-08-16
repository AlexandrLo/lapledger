import type { LapMeta } from '@core/index';

const MINUS = '−';

/**
 * `1:59.874`, or `~2:01.8` when the lap time is the geometric wrap-to-wrap
 * duration rather than the recorded channel: that figure is only as precise as
 * a 10 Hz sample, so three decimals would claim precision it does not have.
 */
export function formatLapTime(seconds: number, approximate = false): string {
  const decimals = approximate ? 1 : 3;
  const scale = 10 ** decimals;
  // Round first, then split. Deriving the minutes from the unrounded value
  // lets a lap of 119.96 s round its seconds up to 60.0 and print "1:60.0".
  const ticks = Math.round(seconds * scale);
  const minutes = Math.floor(ticks / (60 * scale));
  const rest = (ticks - minutes * 60 * scale) / scale;
  const padded = rest.toFixed(decimals).padStart(decimals + 3, '0');
  return `${approximate ? '~' : ''}${minutes}:${padded}`;
}

/** `+0.213`, `−0.213`, `0.000`. The sign is the whole point. */
export function formatDelta(seconds: number): string {
  const text = Math.abs(seconds).toFixed(3);
  if (seconds > 0) return `+${text}`;
  if (seconds < 0) return `${MINUS}${text}`;
  return text;
}

export function formatDistance(metres: number): string {
  return `${Math.round(metres)} m`;
}

/**
 * The lap number shown to the user. `LapMeta.sourceNumber` is the sim's own
 * counter and what a driver would call the lap; `LapMeta.number` (and a
 * `LapRef.lapNumber`) is the lap's unique identity within the session and
 * must never be printed, because on a real recording two different laps can
 * report the same source number. Falls back to `fallbackLapNumber` when the
 * lookup that should have produced `lap` failed, so a stale reference
 * degrades to a plausible number instead of throwing.
 */
export function lapLabel(lap: LapMeta | undefined, fallbackLapNumber: number): number {
  return lap ? lap.sourceNumber : fallbackLapNumber;
}
