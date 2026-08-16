import type { LapMeta } from '@core/index';

export type LapRow = {
  lap: LapMeta;
  /** Seconds behind the session's best lap; null for the best lap itself. */
  gapToBest: number | null;
};

export function buildLapRows(laps: LapMeta[]): LapRow[] {
  let best: LapMeta | undefined;
  for (const lap of laps) {
    if (!lap.complete || !lap.valid) continue;
    if (!best || lap.lapTime < best.lapTime) best = lap;
  }

  return laps.map((lap) => ({
    lap,
    gapToBest: !best || lap.number === best.number ? null : lap.lapTime - best.lapTime,
  }));
}
