import { describe, expect, it } from 'vitest';

import { deltaChartOptions, stackChartOptions, SYNC_KEY } from '@app/charts/options';
import { LAP_SLOTS } from '@app/theme/palette';

const LINES = [
  { label: 'Lap 3', stroke: LAP_SLOTS[1] },
  { label: 'Lap 7', stroke: LAP_SLOTS[2] },
];

describe('deltaChartOptions', () => {
  it('puts the x series first and one series per line after it', () => {
    const options = deltaChartOptions({ width: 800, height: 200, lines: LINES });

    expect(options.series).toHaveLength(LINES.length + 1);
    expect(options.series[1].label).toBe('Lap 3');
    expect(options.series[1].stroke).toBe(LAP_SLOTS[1]);
    expect(options.series[2].stroke).toBe(LAP_SLOTS[2]);
  });

  it('draws data lines at two pixels', () => {
    const options = deltaChartOptions({ width: 800, height: 200, lines: LINES });

    expect(options.series[1].width).toBe(2);
  });

  it('joins the shared cursor on the x scale only', () => {
    const options = deltaChartOptions({ width: 800, height: 200, lines: LINES });

    expect(options.cursor?.sync?.key).toBe(SYNC_KEY);
    expect(options.cursor?.sync?.scales).toEqual(['x', null]);
  });

  it('sizes itself to what it was given', () => {
    const options = deltaChartOptions({ width: 640, height: 180, lines: LINES });

    expect(options.width).toBe(640);
    expect(options.height).toBe(180);
  });
});

describe('stackChartOptions', () => {
  it('labels the y axis with the channel unit', () => {
    const options = stackChartOptions({
      width: 800,
      height: 120,
      lines: LINES,
      unit: 'km/h',
      discrete: false,
    });

    expect(options.axes?.[1]?.label).toBe('km/h');
  });

  it('steps a discrete channel instead of interpolating it', () => {
    const options = stackChartOptions({
      width: 800,
      height: 120,
      lines: LINES,
      unit: '',
      discrete: true,
    });

    expect(options.series[1].paths).toBeTypeOf('function');
  });

  it('shares the cursor with the delta chart', () => {
    const options = stackChartOptions({
      width: 800,
      height: 120,
      lines: LINES,
      unit: '',
      discrete: false,
    });

    expect(options.cursor?.sync?.key).toBe(SYNC_KEY);
  });
});
