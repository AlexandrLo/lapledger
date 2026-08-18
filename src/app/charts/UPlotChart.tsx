import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

import { appStore } from '@app/state/store';

export type UPlotChartProps = {
  options: uPlot.Options;
  data: uPlot.AlignedData;
  /**
   * Identifies the chart's shape — series count, labels and colours. A change
   * rebuilds the instance; an unchanged key only pushes new data, which is
   * what keeps a zoom alive while laps are being switched.
   */
  recreateKey: string;
};

export function UPlotChart({ options, data, recreateKey }: UPlotChartProps) {
  return <UPlotInstance key={recreateKey} options={options} data={data} />;
}

function UPlotInstance({ options, data }: { options: uPlot.Options; data: uPlot.AlignedData }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const instance = new uPlot(
      {
        ...options,
        width: element.clientWidth || options.width,
        hooks: {
          setCursor: [
            (self) => {
              const index = self.cursor.idx;
              const distance =
                index === null || index === undefined ? null : (self.data[0][index] ?? null);
              appStore.getState().setCursor(distance);
            },
          ],
        },
      },
      data,
      element,
    );
    chart.current = instance;

    const observer = new ResizeObserver(([entry]) => {
      instance.setSize({
        width: Math.max(1, Math.round(entry.contentRect.width)),
        height: options.height,
      });
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      instance.destroy();
      chart.current = null;
    };
    // Built once per mount: `options` and `data` are the values this instance
    // is for, and the parent remounts it through `key` when they change shape.
    // Listing them here would rebuild the chart on every data update and throw
    // away the zoom the user just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chart.current?.setData(data);
  }, [data]);

  return <div ref={host} className="chart-host" />;
}
