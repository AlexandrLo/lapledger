import { describe, expect, it } from 'vitest';

import { channelInfo, presentChannels, sharedChannels } from '@app/panels/channels';
import type { ChannelMeta } from '@core/index';
import type { SessionSummary } from '@worker/protocol';

const AVAILABLE: ChannelMeta[] = [
  { name: 'Ground Speed', shortName: 'Gnd Spd', unit: 'km/h', freq: 30, count: 10, discrete: false },
  { name: 'Gear', shortName: 'Gear', unit: '', freq: 30, count: 10, discrete: true },
];

function session(id: string, channels: ChannelMeta[]): SessionSummary {
  return {
    id,
    fileName: `${id}.ld`,
    driver: 'Test Driver',
    vehicle: 'test_car',
    venue: 'test-venue',
    eventName: 'Telemetrick',
    sessionName: 'Race',
    recordedAt: '10/03/2026 20:31:38',
    duration: 300,
    channels,
    laps: [],
    grid: { step: 1, length: 1000, points: 1000, approximate: false },
  };
}

describe('presentChannels', () => {
  it('keeps only the wanted channels the recording carries', () => {
    expect(presentChannels(AVAILABLE, ['Ground Speed', 'Oil Temp', 'Gear'])).toEqual([
      'Ground Speed',
      'Gear',
    ]);
  });

  it('keeps the wanted order rather than the file order', () => {
    expect(presentChannels(AVAILABLE, ['Gear', 'Ground Speed'])).toEqual([
      'Gear',
      'Ground Speed',
    ]);
  });
});

describe('channelInfo', () => {
  it('reports the unit and whether the channel is discrete', () => {
    expect(channelInfo(AVAILABLE, 'Gear')).toEqual({ unit: '', discrete: true });
    expect(channelInfo(AVAILABLE, 'Ground Speed')).toEqual({ unit: 'km/h', discrete: false });
  });

  it('falls back to a continuous unitless channel when the name is unknown', () => {
    expect(channelInfo(AVAILABLE, 'Nope')).toEqual({ unit: '', discrete: false });
  });
});

describe('sharedChannels', () => {
  it('returns nothing for an empty list of sessions', () => {
    expect(sharedChannels([])).toEqual([]);
  });

  it('returns the only session own channels', () => {
    expect(sharedChannels([session('s', AVAILABLE)])).toEqual(AVAILABLE);
  });

  it('keeps only the channels every session carries, in the first session order', () => {
    const other: ChannelMeta[] = [
      { name: 'Gear', shortName: 'Gear', unit: '', freq: 30, count: 10, discrete: true },
      { name: 'Oil Temp', shortName: 'Oil T', unit: 'C', freq: 10, count: 10, discrete: false },
    ];

    expect(sharedChannels([session('s', AVAILABLE), session('t', other)])).toEqual([
      AVAILABLE[1],
    ]);
  });
});
