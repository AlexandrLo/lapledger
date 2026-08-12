export const CORE_VERSION = '0.1.0';

export { openSession } from './session';
export type { OpenSessionOptions, Session, SessionMeta } from './session';
export { computeDelta } from './lap/delta';
export { makeDistanceGrid } from './lap/resample';
export type { LapMeta } from './lap/lapIndex';
export type { ChannelMeta, DistanceGrid, LapRef, SessionId, VehicleInfo } from './types';
