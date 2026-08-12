/**
 * Accumulated time difference against distance.
 *
 * Both arguments are **elapsed lap time** on the same distance grid, as
 * produced by `Session.elapsed(lapNumber)` (or by `resampleElapsedTime`).
 * A positive value means the comparison lap is behind the reference at that
 * point on track.
 *
 * Do not pass a per-lap `Lap Time` series here. The raw Lap Time channel does
 * not reset in step with the Car Pos Norm wrap, so on the real recordings it
 * is non-monotone or ends at the wrong value on roughly a third of laps, and
 * the resulting delta is wrong by tens of seconds. `Session.series` refuses to
 * build that series for exactly this reason; `Session.elapsed` is the array to
 * use, and because both sessions' arrays lie on their own grids it is also how
 * a cross-session comparison is composed.
 */
export function computeDelta(
  referenceElapsed: Float32Array,
  comparisonElapsed: Float32Array,
): Float32Array {
  if (referenceElapsed.length !== comparisonElapsed.length) {
    throw new Error(
      `elapsed arrays must be on the same distance grid: got ${referenceElapsed.length} and ${comparisonElapsed.length} points`,
    );
  }

  const out = new Float32Array(referenceElapsed.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = comparisonElapsed[i] - referenceElapsed[i];
  }
  return out;
}
