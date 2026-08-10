import { describe, expect, it } from 'vitest';
import { ByteWindow } from './window';

function windowOf(size: number, base = 0): { bytes: Uint8Array; win: ByteWindow } {
  const bytes = new Uint8Array(size);
  return { bytes, win: new ByteWindow(bytes, base) };
}

describe('ByteWindow', () => {
  it('reads little-endian scalars', () => {
    const { bytes, win } = windowOf(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0xdeadbeef, true);
    view.setUint16(4, 4242, true);
    view.setInt16(6, -1234, true);

    expect(win.u32(0)).toBe(0xdeadbeef);
    expect(win.u16(4)).toBe(4242);
    expect(win.i16(6)).toBe(-1234);
  });

  it('reads NUL-padded strings and trims them', () => {
    const { bytes, win } = windowOf(16);
    bytes.set([0x41, 0x44, 0x4c, 0x00, 0x00, 0x00, 0x00, 0x00], 0);
    expect(win.str(0, 8)).toBe('ADL');
  });

  it('keeps interior spaces in strings', () => {
    const { bytes, win } = windowOf(16);
    for (const [i, ch] of [...'7  Bob'].entries()) bytes[i] = ch.charCodeAt(0);
    expect(win.str(0, 16)).toBe('7  Bob');
  });

  it('returns a zero-copy view when the offset is aligned', () => {
    const { bytes, win } = windowOf(16);
    new DataView(bytes.buffer).setFloat32(4, 1.5, true);

    const arr = win.f32Array(4, 1);
    expect(arr[0]).toBe(1.5);

    // Proof it shares memory with the source buffer.
    new DataView(bytes.buffer).setFloat32(4, 2.5, true);
    expect(arr[0]).toBe(2.5);
  });

  it('copies when the offset is not aligned', () => {
    const { bytes, win } = windowOf(16);
    new DataView(bytes.buffer).setFloat32(2, 1.5, true);

    const arr = win.f32Array(2, 1);
    expect(arr[0]).toBe(1.5);

    // Proof it is a detached copy.
    new DataView(bytes.buffer).setFloat32(2, 2.5, true);
    expect(arr[0]).toBe(1.5);
  });

  it('honours the base offset', () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setUint32(0, 99, true);
    const win = new ByteWindow(bytes, 1000);
    expect(win.u32(1000)).toBe(99);
    expect(win.base).toBe(1000);
    expect(win.end).toBe(1008);
  });

  it('throws when a read falls outside the window', () => {
    const { win } = windowOf(8);
    expect(() => win.u32(6)).toThrow(/outside window/);
    expect(() => win.u32(-4)).toThrow(/outside window/);
  });
});
