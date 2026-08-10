export const HEADER_SIZE = 1762;
export const EVENT_SIZE = 1154;
export const CHAN_SIZE = 124;
export const META_PTR = HEADER_SIZE + EVENT_SIZE; // 2916

export type FixtureChannel = {
  name: string;
  shortName?: string;
  unit?: string;
  freq: number;
  /** 7 = float, 0/3/5 = integer. Default 7. */
  dtypeA?: number;
  /** Byte width: 2 or 4. Default 4. */
  dtype?: number;
  scale?: number;
  mul?: number;
  dec?: number;
  shift?: number;
  /** Raw stored values, not physical ones. */
  values: number[];
};

export type FixtureOptions = {
  driver?: string;
  vehicle?: string;
  venue?: string;
  date?: string;
  time?: string;
  shortComment?: string;
  eventName?: string;
  sessionName?: string;
  channels: FixtureChannel[];
};

export function buildLd(opts: FixtureOptions): Uint8Array {
  const channels = opts.channels;
  const widths = channels.map((c) => ((c.dtype ?? 4) === 2 ? 2 : 4));
  const dataStart = META_PTR + channels.length * CHAN_SIZE;

  const offsets: number[] = [];
  let cursor = dataStart;
  channels.forEach((c, i) => {
    offsets.push(cursor);
    cursor += c.values.length * widths[i];
  });

  const bytes = new Uint8Array(cursor);
  const view = new DataView(bytes.buffer);
  const putStr = (offset: number, length: number, value: string): void => {
    for (let i = 0; i < Math.min(length, value.length); i++) {
      bytes[offset + i] = value.charCodeAt(i) & 0xff;
    }
  };

  view.setUint32(0, 0x40, true);
  view.setUint32(8, META_PTR, true);
  view.setUint32(12, dataStart, true);
  view.setUint32(36, HEADER_SIZE, true);
  view.setUint32(70, 12345, true);
  putStr(74, 8, 'ADL');
  view.setUint16(82, 420, true);
  view.setUint32(86, channels.length, true);
  putStr(94, 16, opts.date ?? '10/03/2026');
  putStr(126, 16, opts.time ?? '20:31:38');
  putStr(158, 64, opts.driver ?? 'Test Driver');
  putStr(222, 64, opts.vehicle ?? 'test_car');
  putStr(350, 64, opts.venue ?? 'test-venue');
  putStr(1572, 64, opts.shortComment ?? '');

  putStr(HEADER_SIZE + 0, 64, opts.eventName ?? 'Telemetrick');
  putStr(HEADER_SIZE + 64, 64, opts.sessionName ?? 'Race.online (50Hz)');

  channels.forEach((c, i) => {
    const m = META_PTR + i * CHAN_SIZE;
    view.setUint32(m + 0, i === 0 ? 0 : META_PTR + (i - 1) * CHAN_SIZE, true);
    view.setUint32(m + 4, i === channels.length - 1 ? 0 : META_PTR + (i + 1) * CHAN_SIZE, true);
    view.setUint32(m + 8, offsets[i], true);
    view.setUint32(m + 12, c.values.length, true);
    view.setUint16(m + 16, 0, true);
    view.setUint16(m + 18, c.dtypeA ?? 7, true);
    view.setUint16(m + 20, c.dtype ?? 4, true);
    view.setUint16(m + 22, c.freq, true);
    view.setInt16(m + 24, c.shift ?? 0, true);
    view.setInt16(m + 26, c.mul ?? 1, true);
    view.setInt16(m + 28, c.scale ?? 1, true);
    view.setInt16(m + 30, c.dec ?? 0, true);
    putStr(m + 32, 32, c.name);
    putStr(m + 64, 8, c.shortName ?? c.name.slice(0, 8));
    putStr(m + 72, 12, c.unit ?? '');

    const width = widths[i];
    const isFloat = (c.dtypeA ?? 7) === 7;
    c.values.forEach((v, k) => {
      const at = offsets[i] + k * width;
      if (isFloat) view.setFloat32(at, v, true);
      else if (width === 2) view.setInt16(at, v, true);
      else view.setInt32(at, v, true);
    });
  });

  return bytes;
}
