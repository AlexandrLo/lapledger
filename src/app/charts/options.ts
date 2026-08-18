import uPlot from 'uplot';

import { palette } from '@app/theme/palette';

/** Every chart on screen shares this cursor. */
export const SYNC_KEY = 'lapledger-distance';

export type LineSpec = { label: string; stroke: string };

export type ChartParams = {
  width: number;
  height: number;
  lines: LineSpec[];
};

export type StackChartParams = ChartParams & {
  unit: string;
  /** Integer channels such as Gear are drawn as steps, never interpolated. */
  discrete: boolean;
};

const stepped = uPlot.paths.stepped?.({ align: 1 });

function base(params: ChartParams): Omit<uPlot.Options, 'series'> {
  return {
    width: params.width,
    height: params.height,
    scales: {
      x: { time: false },
    },
    cursor: {
      // Only x is shared: two channels on different scales must keep their own
      // y, or a zoom on one would squash the other.
      sync: { key: SYNC_KEY, scales: ['x', null] },
      drag: { x: true, y: false, setScale: true },
    },
    legend: { live: true },
    axes: [
      {
        label: 'Distance (m)',
        stroke: palette.textSecondary,
        grid: { stroke: palette.gridLine, width: 1 },
        ticks: { stroke: palette.gridLine, width: 1 },
      },
      {
        stroke: palette.textSecondary,
        grid: { stroke: palette.gridLine, width: 1 },
        ticks: { stroke: palette.gridLine, width: 1 },
      },
    ],
  };
}

function lineSeries(line: LineSpec, paths?: uPlot.Series.PathBuilder): uPlot.Series {
  return {
    label: line.label,
    stroke: line.stroke,
    width: 2,
    ...(paths ? { paths } : {}),
  };
}

export function deltaChartOptions(params: ChartParams): uPlot.Options {
  return {
    ...base(params),
    series: [{ label: 'Distance' }, ...params.lines.map((line) => lineSeries(line))],
  };
}

export function stackChartOptions(params: StackChartParams): uPlot.Options {
  const options = base(params);
  const axes = [...(options.axes ?? [])];
  axes[1] = { ...axes[1], label: params.unit };

  return {
    ...options,
    axes,
    series: [
      { label: 'Distance' },
      ...params.lines.map((line) =>
        lineSeries(line, params.discrete && stepped ? stepped : undefined),
      ),
    ],
  };
}
