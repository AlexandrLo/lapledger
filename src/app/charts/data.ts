import type { DistanceGrid } from '@core/index';

/**
 * The x array every chart shares: distance in metres at each grid node.
 *
 * Float64 rather than Float32 because uPlot compares x values to find the
 * cursor's nearest index, and a Float32 rounding of 5754 would put the cursor
 * on the wrong node near the end of a long lap.
 */
export function gridNodes(grid: DistanceGrid): Float64Array {
  const nodes = new Float64Array(grid.points);
  for (let i = 0; i < grid.points; i++) nodes[i] = i * grid.step;
  return nodes;
}
