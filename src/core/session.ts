import { parseChannels } from './ld/channels';
import { decodeChannel, isDiscrete } from './ld/decode';
import { parseHeader } from './ld/header';
import { parseLdx } from './ld/ldx';
import type { LdChannel } from './ld/types';
import { ByteWindow } from './ld/window';
import { computeDelta } from './lap/delta';
import { despikeDistance } from './lap/despike';
import { buildLapIndex, type ChannelSeries, type LapMeta } from './lap/lapIndex';
import {
  buildLapBasis,
  makeDistanceGrid,
  resampleElapsedTime,
  resampleToDistance,
  type LapBasis,
} from './lap/resample';
import type { ChannelMeta, DistanceGrid, SessionId, VehicleInfo } from './types';

const CAR_POS_NORM = 'Car Pos Norm';
const LAP_NUMBER = 'Lap Number';
const LAP_TIME = 'Lap Time';
const LAP_INVALIDATED = 'Lap Invalidated';
const LAP_DISTANCE = 'Lap Distance';
const GROUND_SPEED = 'Ground Speed';

export type SessionMeta = {
  id: SessionId;
  fileName: string;
  driver: string;
  vehicle: string;
  venue: string;
  eventName: string;
  sessionName: string;
  recordedAt: string;
  /** Seconds; the longest channel wins. */
  duration: number;
  channels: ChannelMeta[];
  laps: LapMeta[];
  trackLength?: number;
  vehicleInfo?: VehicleInfo;
};

export type Session = {
  meta: SessionMeta;
  grid: DistanceGrid;
  channel(name: string): Float32Array;
  series(lapNumber: number, channelName: string): Float32Array;
  delta(referenceLap: number, comparisonLap: number): Float32Array;
};

export type OpenSessionOptions = {
  fileName?: string;
  id?: SessionId;
  ldxText?: string;
};

export function openSession(bytes: Uint8Array, options: OpenSessionOptions = {}): Session {
  const win = new ByteWindow(bytes);
  const header = parseHeader(win);
  const ldChannels = parseChannels(win, header);

  const byName = new Map<string, LdChannel>();
  for (const channel of ldChannels) byName.set(channel.name, channel);

  const decoded = new Map<string, Float32Array>();
  const channel = (name: string): Float32Array => {
    const cached = decoded.get(name);
    if (cached) return cached;
    const ld = byName.get(name);
    if (!ld) throw new Error(`no channel named "${name}" in this session`);
    const values = decodeChannel(win, ld);
    decoded.set(name, values);
    return values;
  };

  const series = (name: string): ChannelSeries => {
    const ld = byName.get(name);
    if (!ld) throw new Error(`no channel named "${name}" in this session`);
    return { values: channel(name), freq: ld.freq };
  };

  for (const required of [CAR_POS_NORM, LAP_NUMBER, LAP_TIME]) {
    if (!byName.has(required)) {
      throw new Error(`this file has no "${required}" channel, so laps cannot be detected`);
    }
  }

  const laps = buildLapIndex({
    carPosNorm: series(CAR_POS_NORM),
    lapNumber: series(LAP_NUMBER),
    lapTime: series(LAP_TIME),
    ...(byName.has(LAP_INVALIDATED) ? { lapInvalidated: series(LAP_INVALIDATED) } : {}),
  });

  const ldx = options.ldxText ? parseLdx(options.ldxText) : undefined;
  const { length, approximate } = resolveTrackLength(ldx?.trackLength, byName, series, laps);
  const grid = makeDistanceGrid(length, { approximate });

  const meta: SessionMeta = {
    id: options.id ?? `${header.venue}-${header.date}-${header.time}`,
    fileName: options.fileName ?? '',
    driver: header.driver,
    vehicle: header.vehicle,
    venue: header.venue,
    eventName: header.eventName,
    sessionName: header.sessionName,
    recordedAt: `${header.date} ${header.time}`.trim(),
    duration: Math.max(...ldChannels.map((c) => c.count / c.freq)),
    channels: ldChannels.map(toChannelMeta),
    laps,
    ...(approximate ? {} : { trackLength: length }),
    ...(ldx && Object.keys(ldx.vehicle).length > 0 ? { vehicleInfo: ldx.vehicle } : {}),
  };

  const findLap = (lapNumber: number): LapMeta => {
    const lap = laps.find((l) => l.number === lapNumber);
    if (!lap) throw new Error(`no lap ${lapNumber} in this session`);
    return lap;
  };

  const basisCache = new Map<number, LapBasis>();
  const lapBasis = (lapNumber: number): LapBasis => {
    const cached = basisCache.get(lapNumber);
    if (cached) return cached;
    const lap = findLap(lapNumber);
    const basis = buildLapBasis(series(CAR_POS_NORM), lap);
    basisCache.set(lapNumber, basis);
    return basis;
  };

  const seriesCache = new Map<string, Float32Array>();
  const lapSeries = (lapNumber: number, channelName: string): Float32Array => {
    const key = `${lapNumber} ${channelName}`;
    const cached = seriesCache.get(key);
    if (cached) return cached;

    const ld = byName.get(channelName);
    if (!ld) throw new Error(`no channel named "${channelName}" in this session`);

    const basis = lapBasis(lapNumber);
    const values = resampleToDistance(series(channelName), basis, grid, isDiscrete(ld));
    seriesCache.set(key, values);
    return values;
  };

  const elapsedCache = new Map<number, Float32Array>();
  const elapsed = (lapNumber: number): Float32Array => {
    const cached = elapsedCache.get(lapNumber);
    if (cached) return cached;

    const basis = lapBasis(lapNumber);
    const values = resampleElapsedTime(basis, grid);
    elapsedCache.set(lapNumber, values);
    return values;
  };

  return {
    meta,
    grid,
    channel,
    series: lapSeries,
    delta: (referenceLap, comparisonLap) => computeDelta(elapsed(referenceLap), elapsed(comparisonLap)),
  };
}

function toChannelMeta(channel: LdChannel): ChannelMeta {
  return {
    name: channel.name,
    shortName: channel.shortName,
    unit: channel.unit,
    freq: channel.freq,
    count: channel.count,
    discrete: isDiscrete(channel),
  };
}

function resolveTrackLength(
  declared: number | undefined,
  byName: Map<string, LdChannel>,
  series: (name: string) => ChannelSeries,
  laps: LapMeta[],
): { length: number; approximate: boolean } {
  if (declared !== undefined && declared > 0) return { length: declared, approximate: false };

  if (byName.has(LAP_DISTANCE) && byName.has(GROUND_SPEED)) {
    const distance = series(LAP_DISTANCE);
    const clean = despikeDistance(distance, series(GROUND_SPEED));
    const lengths: number[] = [];

    for (const lap of laps) {
      if (!lap.complete) continue;
      const from = Math.round(lap.startTime * distance.freq);
      const to = Math.min(Math.round(lap.endTime * distance.freq), clean.length - 1);
      const covered = clean[to] - clean[from];
      if (covered > 0) lengths.push(covered);
    }

    if (lengths.length > 0) {
      lengths.sort((a, b) => a - b);
      return { length: lengths[Math.floor(lengths.length / 2)], approximate: true };
    }
  }

  throw new Error(
    'track length is unknown: provide the .ldx file, or a Lap Distance and Ground Speed channel',
  );
}
