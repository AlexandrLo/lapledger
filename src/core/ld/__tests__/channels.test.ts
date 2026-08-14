import { describe, expect, it } from 'vitest';
import { buildLd, CHAN_SIZE, META_PTR } from '@tests/fixtures/buildLd';
import { parseChannels } from '@core/ld/channels';
import { parseHeader } from '@core/ld/header';
import { ByteWindow } from '@core/ld/window';

function parse(bytes: Uint8Array) {
  const win = new ByteWindow(bytes);
  return parseChannels(win, parseHeader(win));
}

describe('parseChannels', () => {
  it('walks the linked list in order', () => {
    const channels = parse(
      buildLd({
        channels: [
          { name: 'Ground Speed', shortName: 'Gnd Spd', unit: 'kph', freq: 30, values: [1, 2] },
          {
            name: 'Engine RPM',
            shortName: 'RPM',
            unit: 'rpm',
            freq: 30,
            dtypeA: 3,
            dtype: 2,
            values: [3],
          },
        ],
      }),
    );

    expect(channels.map((c) => c.name)).toEqual(['Ground Speed', 'Engine RPM']);
    expect(channels[0].unit).toBe('kph');
    expect(channels[0].shortName).toBe('Gnd Spd');
    expect(channels[0].freq).toBe(30);
    expect(channels[0].count).toBe(2);
    expect(channels[1].dtypeA).toBe(3);
    expect(channels[1].dtype).toBe(2);
  });

  it('reads the scaling fields as signed', () => {
    const channels = parse(
      buildLd({
        channels: [
          {
            name: 'A',
            freq: 1,
            dtypeA: 3,
            dtype: 2,
            shift: -5,
            mul: 2,
            scale: 10,
            dec: 1,
            values: [0],
          },
        ],
      }),
    );

    expect(channels[0].shift).toBe(-5);
    expect(channels[0].mul).toBe(2);
    expect(channels[0].scale).toBe(10);
    expect(channels[0].dec).toBe(1);
  });

  it('stops on a cycle instead of looping forever', () => {
    const bytes = buildLd({
      channels: [
        { name: 'A', freq: 1, values: [1] },
        { name: 'B', freq: 1, values: [1] },
      ],
    });
    // Point B's nextPtr back at A.
    new DataView(bytes.buffer).setUint32(META_PTR + CHAN_SIZE + 4, META_PTR, true);

    expect(parse(bytes).map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('throws when the list length disagrees with the header count', () => {
    const bytes = buildLd({
      channels: [
        { name: 'A', freq: 1, values: [1] },
        { name: 'B', freq: 1, values: [1] },
      ],
    });
    new DataView(bytes.buffer).setUint32(86, 5, true);

    expect(() => parse(bytes)).toThrow(/header declares 5 channels, list yields 2/);
  });
});
