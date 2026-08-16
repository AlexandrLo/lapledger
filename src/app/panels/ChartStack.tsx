import { useState } from 'react';
import { useStore } from 'zustand';

import { gridNodes } from '@app/charts/data';
import { stackChartOptions } from '@app/charts/options';
import { UPlotChart } from '@app/charts/UPlotChart';
import { getTelemetry } from '@app/data/telemetry';
import { useArrays } from '@app/data/useArrays';
import { appStore, lapKey } from '@app/state/store';
import { LAP_SLOTS } from '@app/theme/palette';
import type { LapRef } from '@core/index';

import { channelInfo, presentChannels } from './channels';

const HEIGHT = 120;

type Drawn = { lap: LapRef; slot: number };

export function ChartStack() {
  const slots = useStore(appStore, (state) => state.slots);
  const sessions = useStore(appStore, (state) => state.sessions);
  const wanted = useStore(appStore, (state) => state.channels);
  const [pick, setPick] = useState('');

  const drawn: Drawn[] = slots
    .map((lap, slot) => ({ lap, slot }))
    .filter((entry): entry is Drawn => entry.lap !== null);

  const session = sessions.find((entry) => entry.id === drawn[0]?.lap.sessionId);
  const channels = session ? presentChannels(session.channels, wanted) : [];

  const key = [...channels, ...drawn.map((d) => lapKey(d.lap))].join('|');
  const { arrays, error } = useArrays(key, () => {
    const { cache } = getTelemetry();
    return Promise.all(
      channels.flatMap((channel) => drawn.map((d) => cache.series(d.lap, channel))),
    );
  });

  if (!session) return <p className="hint">Load a recording to see the channels.</p>;
  if (error !== null) return <p className="error">{error}</p>;

  return (
    <div className="stack">
      <div className="picker">
        <input
          list="channel-options"
          value={pick}
          placeholder="add a channel"
          onChange={(event) => setPick(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            appStore.getState().addChannel(pick);
            setPick('');
          }}
        />
        <datalist id="channel-options">
          {session.channels.map((channel) => (
            <option key={channel.name} value={channel.name} />
          ))}
        </datalist>
      </div>

      {arrays === null ? (
        <p className="hint">Resampling…</p>
      ) : (
        channels.map((channel, row) => {
          const info = channelInfo(session.channels, channel);
          const values = arrays.slice(row * drawn.length, (row + 1) * drawn.length);
          if (values.length !== drawn.length) return null;

          return (
            <div className="stack-row" key={channel}>
              <div className="stack-head">
                <span>{channel}</span>
                <button type="button" onClick={() => appStore.getState().removeChannel(channel)}>
                  ×
                </button>
              </div>
              <UPlotChart
                recreateKey={`${channel}|${key}`}
                options={stackChartOptions({
                  width: 800,
                  height: HEIGHT,
                  unit: info.unit,
                  discrete: info.discrete,
                  lines: drawn.map((d) => ({
                    label: `Lap ${d.lap.lapNumber}`,
                    stroke: LAP_SLOTS[d.slot],
                  })),
                })}
                data={[gridNodes(session.grid), ...values]}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
