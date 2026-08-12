/**
 * Accumulated time difference against distance.
 *
 * Both arguments are elapsed lap time on the same distance grid as produced
 * by `resampleElapsedTime`. A positive value means the comparison lap is
 * behind the reference at that point on track.
 */
export function computeDelta(
  referenceLapTime: Float32Array,
  comparisonLapTime: Float32Array,
): Float32Array {
  if (referenceLapTime.length !== comparisonLapTime.length) {
    throw new Error(
      `laps must be resampled onto the same distance grid: got ${referenceLapTime.length} and ${comparisonLapTime.length} points`,
    );
  }

  const out = new Float32Array(referenceLapTime.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = comparisonLapTime[i] - referenceLapTime[i];
  }
  return out;
}
