export const CORE_VERSION = '0.1.0';

export { openSession } from './session';
export type { OpenSessionOptions, Session, SessionMeta } from './session';
/**
 * Cross-session comparison — two laps from different recordings — is composed
 * as `computeDelta(a.elapsed(l1), b.elapsed(l2))`, provided both sessions share
 * a grid. Within one session, `Session.delta` is the shorthand.
 */
export { computeDelta } from './lap/delta';
export { makeDistanceGrid } from './lap/resample';
export type { LapMeta } from './lap/lapIndex';
export type { ChannelMeta, DistanceGrid, LapRef, SessionId, VehicleInfo } from './types';
