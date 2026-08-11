import { describe, expect, it } from 'vitest';
import { buildLd } from '../../../test/fixtures/buildLd';
import { parseChannels } from './channels';
import { decodeChannel, isDiscrete } from './decode';
import { parseHeader } from './header';
import { ByteWindow } from './window';

function decodeFirst(bytes: Uint8Array, index = 0): Float32Array {
  const win = new ByteWindow(bytes);
  const channels = parseChannels(win, parseHeader(win));
  return decodeChannel(win, channels[index]);
}

describe('decodeChannel', () => {
  it('passes float32 channels through untouched', () => {
    const out = decodeFirst(
      buildLd({ channels: [{ name: 'Speed', freq: 10, values: [0.5, 1.25, -3] }] }),
    );
    expect([...out]).toEqual([0.5, 1.25, -3]);
  });

  it('applies scale, dec, shift and mul to integer channels', () => {
    // raw 1234 -> (1234 / 10 * 10^-1 + 2) * 3 = (12.34 + 2) * 3 = 43.02
    const out = decodeFirst(
      buildLd({
        channels: [
          { name: 'A', freq: 1, dtypeA: 3, dtype: 2, scale: 10, dec: 1, shift: 2, mul: 3, values: [1234] },
        ],
      }),
    );
    expect(out[0]).toBeCloseTo(43.02, 5);
  });

  it('decodes a misaligned float32 channel correctly', () => {
    const out = decodeFirst(
      buildLd({
        channels: [
          { name: 'Gear', freq: 1, dtypeA: 3, dtype: 2, values: [1, 2, 3] },
          { name: 'Speed', freq: 1, values: [10.5, 11.5] },
        ],
      }),
      1,
    );
    expect([...out]).toEqual([10.5, 11.5]);
  });

  it('decodes int32 channels', () => {
    const out = decodeFirst(
      buildLd({ channels: [{ name: 'Race Flag', freq: 1, dtypeA: 5, dtype: 4, values: [7] }] }),
    );
    expect(out[0]).toBe(7);
  });

  it('rejects float16 rather than misreading it as int16', () => {
    expect(() =>
      decodeFirst(buildLd({ channels: [{ name: 'A', freq: 1, dtypeA: 7, dtype: 2, values: [1] }] })),
    ).toThrow(/float16/);
  });

  it('rejects a zero scale instead of dividing by zero', () => {
    expect(() =>
      decodeFirst(
        buildLd({ channels: [{ name: 'A', freq: 1, dtypeA: 3, dtype: 2, scale: 0, values: [1] }] }),
      ),
    ).toThrow(/scale of 0/);
  });
});

describe('isDiscrete', () => {
  it('is false for float channels and true for integer channels', () => {
    const win = new ByteWindow(
      buildLd({
        channels: [
          { name: 'Speed', freq: 1, values: [1] },
          { name: 'Gear', freq: 1, dtypeA: 3, dtype: 2, values: [1] },
        ],
      }),
    );
    const channels = parseChannels(win, parseHeader(win));

    expect(isDiscrete(channels[0])).toBe(false);
    expect(isDiscrete(channels[1])).toBe(true);
  });
});
