import type { ChannelMeta, DistanceGrid, LapMeta, LapRef, SessionId } from '@core/index';

/**
 * Everything the main thread learns about an opened session.
 *
 * A structural clone of `core`'s `SessionMeta` plus the grid it was opened
 * with. It carries no `Float32Array` and no reference to the file, so it costs
 * a few kilobytes to post even for a 186-channel recording.
 */
export type SessionSummary = {
  id: SessionId;
  fileName: string;
  driver: string;
  vehicle: string;
  venue: string;
  eventName: string;
  sessionName: string;
  recordedAt: string;
  duration: number;
  channels: ChannelMeta[];
  laps: LapMeta[];
  trackLength?: number;
  grid: DistanceGrid;
};

export type OpenSessionRequest = {
  kind: 'openSession';
  fileName: string;
  /** The whole .ld file. Transferred, not cloned — the main thread loses it. */
  bytes: ArrayBuffer;
  ldxText?: string;
};

export type CloseSessionRequest = { kind: 'closeSession'; sessionId: SessionId };

export type SeriesRequest = { kind: 'getSeries'; lap: LapRef; channel: string };

export type ElapsedRequest = { kind: 'getElapsed'; lap: LapRef };

export type DeltaRequest = { kind: 'getDelta'; reference: LapRef; comparison: LapRef };

export type RequestBody =
  | CloseSessionRequest
  | DeltaRequest
  | ElapsedRequest
  | OpenSessionRequest
  | SeriesRequest;

export type Request = RequestBody & { id: number };

export type SessionOpened = { kind: 'sessionOpened'; session: SessionSummary };
export type SessionClosed = { kind: 'sessionClosed' };
/** Values on the session's distance grid, one per node. */
export type SeriesResult = { kind: 'series'; values: Float32Array };

export type ResultBody = SeriesResult | SessionClosed | SessionOpened;

export type Response =
  | { id: number; ok: true; result: ResultBody }
  | { id: number; ok: false; message: string };

/** Which result each request kind produces, so the client can be typed. */
export type ResultByKind = {
  closeSession: SessionClosed;
  getDelta: SeriesResult;
  getElapsed: SeriesResult;
  getSeries: SeriesResult;
  openSession: SessionOpened;
};
