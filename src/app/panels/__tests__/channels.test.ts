import { describe, expect, it } from 'vitest';

import { channelInfo, presentChannels } from '@app/panels/channels';
import type { ChannelMeta } from '@core/index';

const AVAILABLE: ChannelMeta[] = [
  { name: 'Ground Speed', shortName: 'Gnd Spd', unit: 'km/h', freq: 30, count: 10, discrete: false },
  { name: 'Gear', shortName: 'Gear', unit: '', freq: 30, count: 10, discrete: true },
];

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
