import { describe, expect, it } from 'vitest';

import { gridNodes } from '@app/charts/data';

describe('gridNodes', () => {
  it('gives one node per grid point, starting at zero', () => {
    const nodes = gridNodes({ step: 1, length: 5, points: 5, approximate: false });

    expect([...nodes]).toEqual([0, 1, 2, 3, 4]);
  });

  it('honours a step other than one metre', () => {
    const nodes = gridNodes({ step: 2.5, length: 10, points: 4, approximate: false });

    expect([...nodes]).toEqual([0, 2.5, 5, 7.5]);
  });
});
