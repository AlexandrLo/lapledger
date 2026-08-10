/**
 * A little-endian reader over a byte range of an .ld file.
 *
 * Every offset passed in is an absolute file offset; `base` is the file offset
 * of `bytes[0]`, so a window over a partial read behaves like a window over the
 * whole file.
 */
export class ByteWindow {
  private readonly view: DataView;

  constructor(
    private readonly bytes: Uint8Array,
    readonly base = 0,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get end(): number {
    return this.base + this.bytes.byteLength;
  }

  private local(offset: number, length: number): number {
    const local = offset - this.base;
    if (local < 0 || local + length > this.bytes.byteLength) {
      throw new RangeError(
        `read of ${length} byte(s) at ${offset} is outside window [${this.base}, ${this.end})`,
      );
    }
    return local;
  }

  u16(offset: number): number {
    return this.view.getUint16(this.local(offset, 2), true);
  }

  i16(offset: number): number {
    return this.view.getInt16(this.local(offset, 2), true);
  }

  u32(offset: number): number {
    return this.view.getUint32(this.local(offset, 4), true);
  }

  /** Fixed-width, NUL-padded, latin-1 string. */
  str(offset: number, length: number): string {
    const start = this.local(offset, length);
    const raw = this.bytes.subarray(start, start + length);
    let stop = raw.indexOf(0);
    if (stop === -1) stop = raw.length;
    let out = '';
    for (let i = 0; i < stop; i++) out += String.fromCharCode(raw[i]);
    return out.trim();
  }

  f32Array(offset: number, count: number): Float32Array {
    const abs = this.absolute(offset, count, 4);
    return abs % 4 === 0
      ? new Float32Array(this.bytes.buffer, abs, count)
      : new Float32Array(this.bytes.buffer.slice(abs, abs + count * 4));
  }

  i32Array(offset: number, count: number): Int32Array {
    const abs = this.absolute(offset, count, 4);
    return abs % 4 === 0
      ? new Int32Array(this.bytes.buffer, abs, count)
      : new Int32Array(this.bytes.buffer.slice(abs, abs + count * 4));
  }

  i16Array(offset: number, count: number): Int16Array {
    const abs = this.absolute(offset, count, 2);
    return abs % 2 === 0
      ? new Int16Array(this.bytes.buffer, abs, count)
      : new Int16Array(this.bytes.buffer.slice(abs, abs + count * 2));
  }

  /** Offset within the underlying ArrayBuffer, bounds-checked. */
  private absolute(offset: number, count: number, width: number): number {
    return this.bytes.byteOffset + this.local(offset, count * width);
  }
}
