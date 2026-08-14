import { describe, expect, it } from 'vitest';

import { parseHeader } from '@core/ld/header';
import { ByteWindow } from '@core/ld/window';
import { buildLd, META_PTR } from '@tests/fixtures/buildLd';

describe('parseHeader', () => {
  it('reads identity and pointers', () => {
    const bytes = buildLd({
      driver: '7  Test Driver',
      vehicle: 'fw_cupra_tcr_2024',
      venue: 'monza-lfm',
      date: '10/03/2026',
      time: '20:31:38',
      shortComment: 'Kumho TCR Dry (S)',
      eventName: 'Telemetrick',
      sessionName: 'Race.online (50Hz)',
      channels: [
        { name: 'A', freq: 1, values: [1] },
        { name: 'B', freq: 1, values: [1] },
      ],
    });

    const head = parseHeader(new ByteWindow(bytes));

    expect(head.channelMetaPtr).toBe(META_PTR);
    expect(head.channelCount).toBe(2);
    expect(head.deviceType).toBe('ADL');
    expect(head.deviceVersion).toBe(420);
    expect(head.date).toBe('10/03/2026');
    expect(head.time).toBe('20:31:38');
    expect(head.driver).toBe('7  Test Driver');
    expect(head.vehicle).toBe('fw_cupra_tcr_2024');
    expect(head.venue).toBe('monza-lfm');
    expect(head.shortComment).toBe('Kumho TCR Dry (S)');
    expect(head.eventName).toBe('Telemetrick');
    expect(head.sessionName).toBe('Race.online (50Hz)');
  });

  it('rejects a file whose marker is not 0x40', () => {
    const bytes = buildLd({ channels: [{ name: 'A', freq: 1, values: [1] }] });
    new DataView(bytes.buffer).setUint32(0, 0x41, true);

    expect(() => parseHeader(new ByteWindow(bytes))).toThrow(/not a MoTeC \.ld file/);
  });
});
