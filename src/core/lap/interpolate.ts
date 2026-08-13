/**
 * Fritsch-Carlson monotone cubic slopes. Guarantees the interpolant neither
 * overshoots nor introduces extrema the data does not have.
 */
export function pchipSlopes(xs: Float64Array, ys: Float64Array): Float64Array {
  const n = xs.length;
  const slopes = new Float64Array(n);
  if (n < 2) return slopes;

  const h = new Float64Array(n - 1);
  const delta = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    delta[i] = h[i] === 0 ? 0 : (ys[i + 1] - ys[i]) / h[i];
  }

  if (n === 2) {
    slopes[0] = delta[0];
    slopes[1] = delta[0];
    return slopes;
  }

  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      slopes[i] = 0;
      continue;
    }
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    slopes[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
  }

  slopes[0] = endpointSlope(h[0], h[1], delta[0], delta[1]);
  slopes[n - 1] = endpointSlope(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
  return slopes;
}

function endpointSlope(hNear: number, hFar: number, dNear: number, dFar: number): number {
  const denominator = hNear + hFar;
  const slope = denominator === 0 ? dNear : ((2 * hNear + hFar) * dNear - hNear * dFar) / denominator;
  if (slope * dNear <= 0) return 0;
  if (dNear * dFar < 0 && Math.abs(slope) > Math.abs(3 * dNear)) return 3 * dNear;
  return slope;
}

export function pchipEval(
  xs: Float64Array,
  ys: Float64Array,
  slopes: Float64Array,
  x: number,
  hint = 0,
): { value: number; index: number } {
  const n = xs.length;
  if (n === 0) return { value: NaN, index: 0 };
  if (n === 1 || x <= xs[0]) return { value: ys[0], index: 0 };
  if (x >= xs[n - 1]) return { value: ys[n - 1], index: n - 2 };

  let i = Math.min(Math.max(hint, 0), n - 2);
  while (i < n - 2 && xs[i + 1] < x) i++;
  while (i > 0 && xs[i] > x) i--;

  const h = xs[i + 1] - xs[i];
  if (h === 0) return { value: ys[i], index: i };

  const s = (x - xs[i]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;

  const value = h00 * ys[i] + h10 * h * slopes[i] + h01 * ys[i + 1] + h11 * h * slopes[i + 1];
  return { value, index: i };
}

/**
 * Sample times are reconstructed as `i / freq`, and multiplying back by `freq`
 * can land a hair below the intended integer: `49 / 30 * 30` is
 * 48.99999999999999, which floors to 48. Snap to the nearest integer when we
 * are within a rounding error of it.
 */
const INDEX_EPSILON = 1e-9;

function snapToSample(x: number): number {
  const nearest = Math.round(x);
  return Math.abs(x - nearest) < INDEX_EPSILON ? nearest : x;
}

/** Linear interpolation of a constant-rate channel at absolute time `t`. */
export function sampleLinear(values: Float32Array, freq: number, t: number): number {
  const last = values.length - 1;
  if (last < 0) return NaN;
  const x = snapToSample(t * freq);
  if (x <= 0) return values[0];
  if (x >= last) return values[last];
  const i = Math.floor(x);
  const frac = x - i;
  return values[i] * (1 - frac) + values[i + 1] * frac;
}

/** Previous-sample hold for discrete channels (gear, flags, modes). */
export function sampleStep(values: Float32Array, freq: number, t: number): number {
  const last = values.length - 1;
  if (last < 0) return NaN;
  const i = Math.floor(snapToSample(t * freq));
  if (i <= 0) return values[0];
  if (i >= last) return values[last];
  return values[i];
}
