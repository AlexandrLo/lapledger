import { describe, expect, it } from 'vitest';

import { formatDelta, formatDistance, formatLapTime } from '@app/format';

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
