// Vite compiles this to a worker bundle and gives back its constructor. The
// `?worker` suffix goes through the resolver, so the @worker alias applies.
import TelemetryWorker from '@worker/worker?worker';

import { createClient, type TelemetryClient } from './client';

export function spawnTelemetryWorker(): TelemetryClient {
  return createClient(new TelemetryWorker({ name: 'telemetry' }));
}
