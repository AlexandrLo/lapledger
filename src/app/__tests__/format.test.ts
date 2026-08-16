import { describe, expect, it } from 'vitest';

import { formatDelta, formatDistance, formatLapTime, lapLabel } from '@app/format';
import type { LapMeta } from '@core/index';

function lapMeta(overrides: Partial<LapMeta> = {}): LapMeta {
  return {
    number: 0,
    sourceNumber: 0,
    startTime: 0,
    endTime: 100,
    lapTime: 100,
    lapTimeApproximate: false,
    valid: true,
    complete: true,
    startIndex: 0,
    endIndex: 1,
    ...overrides,
  };
}

describe('formatLapTime', () => {
  it('renders minutes, seconds and milliseconds', () => {
    expect(formatLapTime(119.874)).toBe('1:59.874');
    expect(formatLapTime(61.005)).toBe('1:01.005');
    expect(formatLapTime(9.5)).toBe('0:09.500');
  });

  it('drops to one decimal and marks an approximate lap time', () => {
    expect(formatLapTime(121.84, true)).toBe('~2:01.8');
  });

  it('renders a lap over ten minutes without truncating', () => {
    expect(formatLapTime(725.25)).toBe('12:05.250');
  });

  it('rounds seconds up across the minute boundary', () => {
    expect(formatLapTime(59.9999)).toBe('1:00.000');
  });

  it('rounds seconds up across the minute boundary in the approximate branch', () => {
    expect(formatLapTime(119.96, true)).toBe('~2:00.0');
  });
});

describe('formatDelta', () => {
  it('always carries an explicit sign', () => {
    expect(formatDelta(0.213)).toBe('+0.213');
    expect(formatDelta(-0.213)).toBe('−0.213');
  });

  it('renders zero without a sign', () => {
    expect(formatDelta(0)).toBe('0.000');
  });
});

describe('formatDistance', () => {
  it('rounds to whole metres', () => {
    expect(formatDistance(1234.6)).toBe('1235 m');
    expect(formatDistance(0)).toBe('0 m');
  });
});

describe('lapLabel', () => {
  it('shows the sim source number, not the internal index', () => {
    expect(lapLabel(lapMeta({ number: 3, sourceNumber: 4 }), 99)).toBe(4);
  });

  it('falls back to the given lap number when the lap could not be found', () => {
    expect(lapLabel(undefined, 5)).toBe(5);
  });
});
