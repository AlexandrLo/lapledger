import { useStore } from 'zustand';

import { gridNodes } from '@app/charts/data';
import { deltaChartOptions } from '@app/charts/options';
import { UPlotChart } from '@app/charts/UPlotChart';
import { getTelemetry } from '@app/data/telemetry';
import { useArrays } from '@app/data/useArrays';
import { formatDelta, formatDistance } from '@app/format';
import { appStore, lapKey } from '@app/state/store';
import { LAP_SLOTS } from '@app/theme/palette';
import type { LapRef } from '@core/index';

const HEIGHT = 200;

type Drawn = { lap: LapRef; slot: number };

export function DeltaChart() {
  const slots = useStore(appStore, (state) => state.slots);
  const sessions = useStore(appStore, (state) => state.sessions);
  const cursor = useStore(appStore, (state) => state.cursor);

  const reference = slots[0];
  const comparisons: Drawn[] = slots
    .map((lap, slot) => ({ lap, slot }))
    .filter((entry): entry is Drawn => entry.slot > 0 && entry.lap !== null);

  const key = [reference ? lapKey(reference) : 'none', ...comparisons.map((c) => lapKey(c.lap))]
    .join('|');

  const { arrays, error } = useArrays(key, () => {
    if (!reference) return Promise.resolve([]);
    const { cache } = getTelemetry();
    return Promise.all(comparisons.map((c) => cache.delta(reference, c.lap)));
  });

  const session = sessions.find((entry) => entry.id === reference?.sessionId);
  if (!reference || !session) return <p className="hint">Load a recording to see the delta.</p>;
  if (comparisons.length === 0) {
    return <p className="hint">Mark a lap as “cmp” to compare it with the reference.</p>;
  }
  if (error !== null) return <p className="error">{error}</p>;
  if (arrays === null) return <p className="hint">Computing…</p>;

  const options = deltaChartOptions({
    width: 800,
    height: HEIGHT,
    lines: comparisons.map((c) => ({
      label: `Lap ${c.lap.lapNumber}`,
      stroke: LAP_SLOTS[c.slot],
    })),
  });

  const index = cursor === null ? null : Math.round(cursor / session.grid.step);

  return (
    <div className="delta">
      <div className="readout">
        <span className="secondary">
          {cursor === null ? '—' : formatDistance(cursor)}
        </span>
        {comparisons.map((c, line) => (
          <span key={lapKey(c.lap)} style={{ color: LAP_SLOTS[c.slot] }}>
            Lap {c.lap.lapNumber}{' '}
            <span className="numeric">
              {index === null || !arrays[line] || arrays[line][index] === undefined
                ? '—'
                : formatDelta(arrays[line][index])}
            </span>
          </span>
        ))}
      </div>
      <UPlotChart
        recreateKey={key}
        options={options}
        data={[gridNodes(session.grid), ...arrays]}
      />
    </div>
  );
}
