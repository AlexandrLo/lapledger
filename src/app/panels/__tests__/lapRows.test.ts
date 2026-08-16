import { describe, expect, it } from 'vitest';

import { buildLapRows } from '@app/panels/lapRows';
import type { LapMeta } from '@core/index';

function lap(number: number, overrides: Partial<LapMeta> = {}): LapMeta {
  return {
    number,
    sourceNumber: number,
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

describe('buildLapRows', () => {
  it('measures every lap against the fastest complete valid one', () => {
    const rows = buildLapRows([lap(0, { lapTime: 101 }), lap(1, { lapTime: 99 })]);

    expect(rows[0].gapToBest).toBeCloseTo(2, 6);
    expect(rows[1].gapToBest).toBeNull();
  });

  it('never takes the best lap from a partial or invalid one', () => {
    const rows = buildLapRows([
      lap(0, { lapTime: 50, complete: false }),
      lap(1, { lapTime: 60, valid: false }),
      lap(2, { lapTime: 100 }),
    ]);

    expect(rows[2].gapToBest).toBeNull();
    expect(rows[0].gapToBest).toBeCloseTo(-50, 6);
  });

  it('leaves every gap empty when no lap qualifies', () => {
    const rows = buildLapRows([lap(0, { complete: false })]);

    expect(rows[0].gapToBest).toBeNull();
  });

  it('keeps the laps in the order it was given them', () => {
    const rows = buildLapRows([lap(5), lap(2), lap(9)]);

    expect(rows.map((row) => row.lap.number)).toEqual([5, 2, 9]);
  });
});
