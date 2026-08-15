import { openSession, type Session, type SessionId } from '@core/index';

import type { SessionSummary } from './protocol';

export type OpenOptions = { fileName: string; ldxText?: string };

/**
 * The sole owner of open sessions, and therefore of the file bytes behind
 * them: a `Session` closes over the whole `.ld` buffer, so dropping it here is
 * what actually frees the memory.
 */
export class SessionStore {
  private readonly sessions = new Map<SessionId, Session>();

  get size(): number {
    return this.sessions.size;
  }

  open(bytes: Uint8Array, options: OpenOptions): SessionSummary {
    const session = openSession(bytes, {
      fileName: options.fileName,
      ...(options.ldxText === undefined ? {} : { ldxText: options.ldxText }),
    });
    this.sessions.set(session.meta.id, session);
    return summarise(session);
  }

  get(id: SessionId): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`no session "${id}" is open`);
    return session;
  }

  close(id: SessionId): boolean {
    return this.sessions.delete(id);
  }
}

function summarise(session: Session): SessionSummary {
  const { meta } = session;
  return {
    id: meta.id,
    fileName: meta.fileName,
    driver: meta.driver,
    vehicle: meta.vehicle,
    venue: meta.venue,
    eventName: meta.eventName,
    sessionName: meta.sessionName,
    recordedAt: meta.recordedAt,
    duration: meta.duration,
    channels: meta.channels,
    laps: meta.laps,
    ...(meta.trackLength === undefined ? {} : { trackLength: meta.trackLength }),
    grid: session.grid,
  };
}
