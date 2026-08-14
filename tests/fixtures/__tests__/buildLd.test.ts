import { describe, expect, it } from 'vitest';
import { ByteWindow } from '@core/ld/window';
import { buildLd, CHAN_SIZE, META_PTR } from '@tests/fixtures/buildLd';

describe('buildLd', () => {
  it('writes a header a reader can recognise', () => {
    const bytes = buildLd({
      venue: 'test-venue',
      channels: [{ name: 'Speed', freq: 10, values: [1, 2, 3] }],
    });
    const win = new ByteWindow(bytes);

    expect(win.u32(0)).toBe(0x40);
    expect(win.u32(8)).toBe(META_PTR);
    expect(win.u32(86)).toBe(1);
    expect(win.str(350, 64)).toBe('test-venue');
  });

  it('lays channel data out contiguously after the metadata', () => {
    const bytes = buildLd({
      channels: [
        { name: 'A', freq: 1, values: [1, 2, 3] },
        { name: 'B', freq: 1, values: [4, 5] },
      ],
    });
    const win = new ByteWindow(bytes);
    const dataStart = META_PTR + 2 * CHAN_SIZE;

    expect(win.u32(12)).toBe(dataStart);
    expect(win.u32(META_PTR + 8)).toBe(dataStart);
    expect(win.u32(META_PTR + CHAN_SIZE + 8)).toBe(dataStart + 3 * 4);
  });

  it('links the channel metadata list in both directions', () => {
    const bytes = buildLd({
      channels: [
        { name: 'A', freq: 1, values: [1] },
        { name: 'B', freq: 1, values: [1] },
      ],
    });
    const win = new ByteWindow(bytes);

    expect(win.u32(META_PTR + 0)).toBe(0);
    expect(win.u32(META_PTR + 4)).toBe(META_PTR + CHAN_SIZE);
    expect(win.u32(META_PTR + CHAN_SIZE + 0)).toBe(META_PTR);
    expect(win.u32(META_PTR + CHAN_SIZE + 4)).toBe(0);
  });

  it('produces a misaligned float channel after an odd-length int16 channel', () => {
    const bytes = buildLd({
      channels: [
        { name: 'Gear', freq: 1, dtypeA: 3, dtype: 2, values: [1, 2, 3] },
        { name: 'Speed', freq: 1, values: [10.5] },
      ],
    });
    const win = new ByteWindow(bytes);
    const speedPtr = win.u32(META_PTR + CHAN_SIZE + 8);

    expect(speedPtr % 4).toBe(2);
    expect(win.f32Array(speedPtr, 1)[0]).toBe(10.5);
  });
});
