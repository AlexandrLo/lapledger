import { describe, expect, it } from 'vitest';

import { ByteWindow } from '@core/ld/window';

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

  it('reads from Uint8Array views with non-zero byteOffset (scalar)', () => {
    // Create a parent buffer and a view into it with byteOffset=2
    const parent = new ArrayBuffer(32);
    const view = new Uint8Array(parent, 2, 30); // view covers bytes 2-31 of parent
    const win = new ByteWindow(view, 1000);

    // Write a u32 at parent offset 4, which is local offset 2 in the view
    new DataView(parent).setUint32(4, 0xdeadbeef, true);

    // Read at window offset 1002 (local=2, absolute=4 in parent)
    expect(win.u32(1002)).toBe(0xdeadbeef);
  });

  it('f32Array with non-zero byteOffset returns zero-copy when aligned in parent buffer', () => {
    const parent = new ArrayBuffer(32);
    const view = new Uint8Array(parent, 2, 30);
    const win = new ByteWindow(view, 1000);

    // Write f32 at parent offset 4, which is local offset 2 in view
    new DataView(parent).setFloat32(4, 1.5, true);

    // Read at window offset 1002 (local=2, absolute=4 in parent) - aligned
    const arr = win.f32Array(1002, 1);
    expect(arr[0]).toBe(1.5);

    // Mutate parent buffer - should affect the array (zero-copy)
    new DataView(parent).setFloat32(4, 2.5, true);
    expect(arr[0]).toBe(2.5);
  });

  it('f32Array with non-zero byteOffset returns copy when misaligned in parent buffer', () => {
    const parent = new ArrayBuffer(32);
    const view = new Uint8Array(parent, 2, 30);
    const win = new ByteWindow(view, 1000);

    // Write f32 at parent offset 2, which is local offset 0 in view
    new DataView(parent).setFloat32(2, 1.5, true);

    // Read at window offset 1000 (local=0, absolute=2 in parent) - misaligned
    const arr = win.f32Array(1000, 1);
    expect(arr[0]).toBe(1.5);

    // Mutate parent buffer - should NOT affect the array (copy)
    new DataView(parent).setFloat32(2, 2.5, true);
    expect(arr[0]).toBe(1.5);
  });
});
