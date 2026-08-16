import { useStore } from 'zustand';

import { getTelemetry } from '@app/data/telemetry';
import { formatDelta, formatLapTime } from '@app/format';
import { appStore, canCompare, slotOf } from '@app/state/store';
import { LAP_SLOTS } from '@app/theme/palette';
import type { SessionId } from '@core/index';

import { buildLapRows } from './lapRows';

function closeSession(sessionId: SessionId): void {
  const { client, cache } = getTelemetry();
  appStore.getState().removeSession(sessionId);
  cache.forget(sessionId);
  void client.request({ kind: 'closeSession', sessionId });
}

export function LapTable() {
  const sessions = useStore(appStore, (state) => state.sessions);
  const slots = useStore(appStore, (state) => state.slots);
  const { setReference, toggleComparison } = appStore.getState();

  if (sessions.length === 0) return <p className="hint">No recording loaded.</p>;

  return (
    <div className="lap-table">
      {sessions.map((session) => (
        <section key={session.id}>
          <header className="session-head">
            <span>{session.fileName}</span>
            <span className="secondary">
              {session.venue} · {session.laps.length} laps
            </span>
            <button type="button" onClick={() => closeSession(session.id)}>
              close
            </button>
          </header>
          <table>
            <tbody>
              {buildLapRows(session.laps).map(({ lap, gapToBest }) => {
                const ref = { sessionId: session.id, lapNumber: lap.number };
                const slot = slotOf(slots, ref);
                const reference = slots[0];
                const incomparable =
                  slot < 0 && reference !== null && !canCompare(sessions, reference, ref);
                return (
                  <tr key={lap.number} className={slot === 0 ? 'reference' : undefined}>
                    <td className="chip">
                      {slot >= 0 && (
                        <span style={{ background: LAP_SLOTS[slot] }} className="swatch" />
                      )}
                    </td>
                    <td>{lap.sourceNumber}</td>
                    <td className="numeric">
                      {formatLapTime(lap.lapTime, lap.lapTimeApproximate)}
                    </td>
                    <td className="numeric gap">
                      {gapToBest === null ? '' : formatDelta(gapToBest)}
                    </td>
                    <td className="flags">
                      {!lap.complete && <abbr title="partial lap">part</abbr>}
                      {!lap.valid && <abbr title="lap invalidated">inv</abbr>}
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={!lap.complete || slot === 0}
                        onClick={() => setReference(ref)}
                      >
                        ref
                      </button>
                      <button
                        type="button"
                        disabled={slot === 0 || incomparable}
                        title={incomparable ? 'venue or distance grid differs' : undefined}
                        onClick={() => toggleComparison(ref)}
                      >
                        {slot > 0 ? 'drop' : 'cmp'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
