import { createSeriesCache, type SeriesCache } from '@app/data/series';
import type { TelemetryClient } from '@app/worker/client';
import { spawnTelemetryWorker } from '@app/worker/spawn';

export type Telemetry = { client: TelemetryClient; cache: SeriesCache };

let telemetry: Telemetry | null = null;

/**
 * One worker per tab, spawned on first use.
 *
 * A module singleton rather than React context: the worker outlives every
 * component, nothing renders differently because of it, and a context would
 * only add a provider for a value that never changes.
 */
export function getTelemetry(): Telemetry {
  if (!telemetry) {
    const client = spawnTelemetryWorker();
    telemetry = { client, cache: createSeriesCache(client) };
  }
  return telemetry;
}
