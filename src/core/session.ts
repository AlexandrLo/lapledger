import { computeDelta } from '@core/lap/delta';
import { despikeDistance } from '@core/lap/despike';
import { buildLapIndex, type ChannelSeries, type LapMeta } from '@core/lap/lapIndex';
import {
  buildLapBasis,
  makeDistanceGrid,
  resampleElapsedTime,
  resampleToDistance,
  type LapBasis,
} from '@core/lap/resample';
import { parseChannels } from '@core/ld/channels';
import { decodeChannel, isDiscrete } from '@core/ld/decode';
import { parseHeader } from '@core/ld/header';
import { parseLdx } from '@core/ld/ldx';
import type { LdChannel } from '@core/ld/types';
import { ByteWindow } from '@core/ld/window';

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
  /**
   * The whole channel at its own sample rate, decoded to physical units.
   *
   * Each call returns a fresh array: it owns its buffer, is not shared with
   * any other channel or with any previous call's result, and is safe to
   * write into or to hand to `postMessage(values, [values.buffer])`. The
   * decode is cached internally, so repeated calls are cheap, but the caller
   * owns whatever array it gets back and may transfer or mutate it freely
   * without affecting the session or any other caller.
   */
  channel(name: string): Float32Array;
  /**
   * One channel resampled onto `grid` for one lap.
   *
   * Throws for `Lap Time`: see `elapsed`. Each call returns a fresh array —
   * see `channel` for what that guarantees.
   */
  series(lapNumber: number, channelName: string): Float32Array;
  /**
   * Elapsed time within the lap, in seconds, at every node of `grid`.
   *
   * Monotone non-decreasing and starting at 0 by construction, because it is
   * derived from the lap's position basis rather than from the `Lap Time`
   * channel. This is the array to feed `computeDelta` — including for a
   * cross-session comparison, where the two laps come from different `Session`
   * objects that share a grid. Each call returns a fresh array — see
   * `channel` for what that guarantees.
   */
  elapsed(lapNumber: number): Float32Array;
  /** Shorthand for `computeDelta(elapsed(referenceLap), elapsed(comparisonLap))`. */
  delta(referenceLap: number, comparisonLap: number): Float32Array;
};

/**
 * Distinguishes two sessions opened from different files recorded at the same
 * venue in the same second, which would otherwise collide on the descriptive
 * default id below.
 */
let sessionSequence = 0;

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
    const values = own(decodeChannel(win, ld));
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
    id: options.id ?? `${header.venue}-${header.date}-${header.time}-${++sessionSequence}`,
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
    if (channelName === LAP_TIME) {
      throw new Error(
        `"${LAP_TIME}" cannot be resampled per lap: the raw channel does not reset in step ` +
          "with the lap's Car Pos Norm wrap, so on real recordings the resulting series is " +
          'non-monotone or ends at the wrong value on roughly a third of laps, and a delta ' +
          `built from two of them is wrong by tens of seconds. Use elapsed(${lapNumber}) ` +
          `instead, or channel("${LAP_TIME}") for the raw samples.`,
      );
    }

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
    // Public accessors copy on every call so a caller can transfer or mutate
    // the result freely; internal consumers (the `series` helper above,
    // `lapBasis`, `lapSeries` itself, and `delta` below) read the cached
    // arrays directly through the closures and never pay for the copy.
    channel: (name) => channel(name).slice(),
    series: (lapNumber, channelName) => lapSeries(lapNumber, channelName).slice(),
    elapsed: (lapNumber) => elapsed(lapNumber).slice(),
    delta: (referenceLap, comparisonLap) =>
      computeDelta(elapsed(referenceLap), elapsed(comparisonLap)),
  };
}

/**
 * Detaches a decoded channel from the file it came from.
 *
 * `ByteWindow` hands out zero-copy views for aligned channels and
 * `decodeChannel` passes them straight through when no scaling is needed — 94
 * of the Monza recording's 186 channels arrive as views over the whole
 * 30 MB file buffer. That is right internally and wrong at the library edge:
 * transferring such a view to a worker detaches the entire file and kills
 * every other channel, cloning one copies 30 MB to deliver 230 KB, and writing
 * into one corrupts the bytes every later decode reads. Copying here costs one
 * pass per channel, paid once because the caller caches the result.
 */
function own(values: Float32Array): Float32Array {
  const isWholeBuffer = values.byteOffset === 0 && values.buffer.byteLength === values.byteLength;
  return isWholeBuffer ? values : values.slice();
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
