const MINUS = '−';

/**
 * `1:59.874`, or `~2:01.8` when the lap time is the geometric wrap-to-wrap
 * duration rather than the recorded channel: that figure is only as precise as
 * a 10 Hz sample, so three decimals would claim precision it does not have.
 */
export function formatLapTime(seconds: number, approximate = false): string {
  const decimals = approximate ? 1 : 3;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
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
