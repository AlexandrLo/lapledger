import { useMemo, useState } from 'react';
import { useStore } from 'zustand';

import { gridNodes } from '@app/charts/data';
import { stackChartOptions } from '@app/charts/options';
import { UPlotChart } from '@app/charts/UPlotChart';
import { getTelemetry } from '@app/data/telemetry';
import { useArrays } from '@app/data/useArrays';
import { lapLabel } from '@app/format';
import { appStore, findLap, lapKey } from '@app/state/store';
import { LAP_SLOTS } from '@app/theme/palette';
import type { LapRef } from '@core/index';
import type { SessionSummary } from '@worker/protocol';

import { channelInfo, presentChannels, sharedChannels } from './channels';

const HEIGHT = 120;

type Drawn = { lap: LapRef; slot: number };

export function ChartStack() {
  const slots = useStore(appStore, (state) => state.slots);
  const sessions = useStore(appStore, (state) => state.sessions);
  const wanted = useStore(appStore, (state) => state.channels);
  const [pick, setPick] = useState('');

  // `slots.map().filter()` allocates a fresh array on every render, which
  // would otherwise make `perChannelData` below recompute (and every chart
  // lose its zoom) each time an unrelated render happens — such as a
  // keystroke in the channel picker below. Memoised so it keeps its identity
  // while `slots` itself hasn't changed.
  const drawn: Drawn[] = useMemo(
    () =>
      slots
        .map((lap, slot) => ({ lap, slot }))
        .filter((entry): entry is Drawn => entry.lap !== null),
    [slots],
  );

  const session = sessions.find((entry) => entry.id === drawn[0]?.lap.sessionId);

  const drawnSessions = useMemo(() => {
    const result: SessionSummary[] = [];
    for (const entry of drawn) {
      const found = sessions.find((candidate) => candidate.id === entry.lap.sessionId);
      if (found && !result.some((existing) => existing.id === found.id)) result.push(found);
    }
    return result;
  }, [drawn, sessions]);

  const available = useMemo(() => sharedChannels(drawnSessions), [drawnSessions]);

  const channels = useMemo(
    () => (session ? presentChannels(available, wanted) : []),
    [session, available, wanted],
  );

  const key = [...channels, ...drawn.map((d) => lapKey(d.lap))].join('|');
  const { arrays, error } = useArrays(key, () => {
    const { cache } = getTelemetry();
    return Promise.all(
      channels.flatMap((channel) => drawn.map((d) => cache.series(d.lap, channel))),
    );
  });

  // Memoised so each channel's data array keeps its identity across renders
  // that don't change the grid, the loaded arrays or the channel list —
  // otherwise a fresh array per channel per render (e.g. from a keystroke in
  // the channel picker) would reset every chart's zoom.
  const perChannelData = useMemo(() => {
    if (!session || arrays === null) return null;
    const grid = gridNodes(session.grid);
    const rows: { channel: string; data: [Float64Array, ...Float32Array[]] }[] = [];
    for (const [row, channel] of channels.entries()) {
      const values = arrays.slice(row * drawn.length, (row + 1) * drawn.length);
      if (values.length !== drawn.length) continue;
      rows.push({ channel, data: [grid, ...values] });
    }
    return rows;
  }, [session, arrays, channels, drawn]);

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
          {available.map((channel) => (
            <option key={channel.name} value={channel.name} />
          ))}
        </datalist>
      </div>

      {perChannelData === null ? (
        <p className="hint">Resampling…</p>
      ) : (
        perChannelData.map(({ channel, data }) => {
          const info = channelInfo(available, channel);

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
                    label: `Lap ${lapLabel(findLap(sessions, d.lap), d.lap.lapNumber)}`,
                    stroke: LAP_SLOTS[d.slot],
                  })),
                })}
                data={data}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
