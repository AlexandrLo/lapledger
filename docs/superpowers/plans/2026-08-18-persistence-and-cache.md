# Persistence, Restore, and Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist recordings, maps, workspace state, and stable lap references across reloads while bounding every retained derived array.

**Architecture:** App storage writes immutable OPFS objects and checksummed manifest generations through a narrow injected adapter; a lifecycle coordinator sequences repository, worker, and Zustand updates. Repository UUIDs become session IDs, localStorage persists only the versioned workspace, and worker-owned byte LRU replaces unbounded derived caches.

**Tech Stack:** OPFS, Web Crypto SHA-256, localStorage, TypeScript, Web Worker, Vitest

---

### Task 1: Make Session IDs Repository-Owned

**Files:**
- Modify: `src/core/session.ts`
- Modify: `src/core/__tests__/session.test.ts`
- Modify: `src/worker/protocol.ts`
- Modify: `src/worker/sessionStore.ts`
- Modify: `src/worker/handlers.ts`
- Modify: `src/worker/__tests__/sessionStore.test.ts`
- Modify: `src/worker/__tests__/handlers.test.ts`
- Modify: `src/app/state/store.ts`
- Modify: `src/app/state/__tests__/store.test.ts`
- Modify: `tests/integration/realFiles.test.ts`

- [ ] **Step 1: Write failing explicit-ID tests**

Assert an exact supplied ID survives core/worker/app boundaries, duplicate active
IDs throw without replacement, close permits reopening, and app duplicate
summaries are idempotent.

- [ ] **Step 2: Make IDs mandatory**

Delete `sessionSequence` and require:

```ts
export type OpenSessionOptions = {
  id: SessionId;
  fileName: string;
  ldxText?: string;
};
```

Add `sessionId` to `OpenSessionRequest`. Reject duplicates before mutating the
worker map. Use deterministic IDs in tests; production UUID generation belongs
to the repository.

- [ ] **Step 3: Verify and commit**

```bash
docker compose run --rm app pnpm test src/core/__tests__/session.test.ts src/worker/__tests__ src/app/state/__tests__/store.test.ts tests/integration/realFiles.test.ts
make check
git add src/core src/worker src/app/state tests/integration/realFiles.test.ts
git commit -m "refactor: make recording IDs externally owned"
```

### Task 2: Define OPFS and Manifest Boundaries

**Files:**
- Create: `src/app/storage/types.ts`
- Create: `src/app/storage/opfs.ts`
- Create: `src/app/storage/manifest.ts`
- Create: `src/app/storage/__tests__/fixtures/memoryOpfs.ts`
- Create: `src/app/storage/__tests__/manifest.test.ts`

- [ ] **Step 1: Write failing manifest recovery tests**

Cover empty storage, valid round-trip, corrupt checksum, newest valid generation,
fallback from corrupt newest, missing referenced blob retained under an otherwise
authoritative manifest, unknown schema, abandoned temporary cleanup, and
monotone generation numbers.

- [ ] **Step 2: Define immutable schemas**

```ts
export type BlobRef = { name: string; size: number; sha256: string };

export type PersistedImportedMap = {
  mapId: string;
  fileName: string;
  bytes: BlobRef;
};

export type PersistedVenueMap = {
  venueKey: string;
  active: 'imported' | 'generated';
  importedMapId?: string;
  generated?: { mapId: string; geometry: BlobRef; generatedFrom: LapRef };
};

export type ManifestPayload = {
  schemaVersion: 1;
  generation: number;
  activeSessionIds: SessionId[];
  recordings: Record<SessionId, {
    id: SessionId;
    ld: BlobRef;
    ldx?: BlobRef;
    fingerprint: { name: string; size: number; lastModified: number };
  }>;
  importedMaps: Record<string, PersistedImportedMap>;
  venueMaps: Record<string, PersistedVenueMap>;
};

export type ManifestEnvelope = {
  payload: ManifestPayload;
  checksum: string;
};
```

Canonical serialization recursively sorts object keys before JSON encoding.
Hash those UTF-8 bytes; never hash ordinary object insertion order.

- [ ] **Step 3: Implement the adapter interface**

```ts
export interface OpfsAdapter {
  list(): Promise<string[]>;
  read(name: string): Promise<Uint8Array>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
  estimate(): Promise<{ quota?: number; usage?: number }>;
}
```

Production wraps `navigator.storage.getDirectory()`. Tests use `MemoryOpfs`; do
not touch the host filesystem.

- [ ] **Step 4: Implement manifest discovery and verify**

Manifest names are `manifest-<zero-padded-generation>-<uuid>.json`. Re-read and
verify envelope checksum and schema before selecting authority. Referenced blobs
are validated independently during recording/map restore; one corrupt entry is
reported and offered for deletion without invalidating the authoritative
manifest or its other entries.

```bash
docker compose run --rm app pnpm test src/app/storage/__tests__/manifest.test.ts
make check
git add src/app/storage
git commit -m "feat(storage): add recoverable OPFS manifest generations"
```

### Task 3: Build the Content-Addressed Recording Repository

**Files:**
- Create: `src/app/storage/repository.ts`
- Create: `src/app/storage/__tests__/repository.test.ts`

- [ ] **Step 1: Write failing hash/recovery tests**

Assert fingerprint is only a hint, equal fingerprint/different bytes creates new
content, different fingerprint/equal hash reuses UUID, active exact drop is a
no-op, sidecar hashes independently, failed validation never publishes, and one
failed batch item does not prevent later success.

- [ ] **Step 2: Implement SHA-256 and staging**

```ts
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
```

Write unique `tmp-<uuid>` entries, verify hash/size, then reference immutable
`blob-<sha256>` entries from a new manifest generation. Old authority remains
until the new manifest has been written, re-read, and verified.

- [ ] **Step 3: Implement repository API**

```ts
export interface RecordingRepository {
  recover(): Promise<ManifestPayload>;
  stageRecording(input: RecordingInput): Promise<StagedRecording>;
  commitRecording(staged: StagedRecording, summary: SessionSummary): Promise<ManifestPayload>;
  removeRecording(id: SessionId): Promise<ManifestPayload>;
  readRecording(id: SessionId): Promise<{ ld: ArrayBuffer; ldxText?: string }>;
}
```

The referenced input types are:

```ts
export type RecordingInput = {
  ld: File;
  ldx?: File;
  fingerprint: { name: string; size: number; lastModified: number };
};

export type StagedRecording = {
  id: SessionId;
  ld: BlobRef;
  ldx?: BlobRef;
  fingerprint: RecordingInput['fingerprint'];
  existing: boolean;
};
```

Assign `crypto.randomUUID()` only for unseen `.ld` content. Same `.ld` hash
retains UUID; changed `.ldx` retains UUID but creates a new generation.

- [ ] **Step 4: Verify and commit**

```bash
docker compose run --rm app pnpm test src/app/storage/__tests__/repository.test.ts src/app/storage/__tests__/manifest.test.ts
make check
git add src/app/storage
git commit -m "feat(storage): persist content-addressed recordings"
```

### Task 4: Persist Imported and Generated Venue Maps

**Files:**
- Create: `src/app/storage/maps.ts`
- Create: `src/app/storage/__tests__/maps.test.ts`
- Modify: `src/app/storage/repository.ts`
- Modify: `src/worker/protocol.ts`
- Modify: `src/worker/trackMapStore.ts`
- Modify: `src/worker/handlers.ts`
- Modify: `src/worker/__tests__/trackMapStore.test.ts`
- Modify: `src/worker/__tests__/handlers.test.ts`
- Modify: `src/app/worker/client.ts`
- Modify: `src/app/worker/__tests__/client.test.ts`
- Modify: `src/app/data/trackMaps.ts`
- Modify: `src/app/data/__tests__/trackMaps.test.ts`
- Modify: `src/app/widgets/track-map/MapSourceControls.tsx`

- [ ] **Step 1: Write failing map persistence tests**

Cover imported `.mt2` byte staging, unassigned imports, assign/reassign/replace,
generated geometry publication, imported deletion fallback, startup replay,
recording close preserving venue maps, and cleanup only after map removal.

- [ ] **Step 2: Define stable persisted map IDs**

Imported maps retain the app-supplied UUID from their first import. A venue's
first generated map receives `crypto.randomUUID()`; regeneration retains that
UUID and replaces its immutable geometry blob in a new manifest generation.

```ts
export interface MapRepository {
  importMap(mapId: string, fileName: string, bytes: Uint8Array): Promise<PersistedImportedMap>;
  assignImported(mapId: string, venueKey: string, replace: boolean): Promise<ManifestPayload>;
  saveGenerated(venueKey: string, mapId: string, map: TrackMap, generatedFrom: LapRef): Promise<ManifestPayload>;
  deleteImported(venueKey: string): Promise<ManifestPayload>;
  restore(worker: TelemetryClient): Promise<MapRestoreResult>;
}

export type MapRestoreResult = {
  restored: { mapId: string; venueKey?: string }[];
  failed: { mapId: string; venueKey?: string; message: string }[];
};
```

Serialize generated `length`, interleaved arrays, sections, and source lap into
one checksummed geometry blob. Imported refs retain original `.mt2` bytes and
are stored independently by `mapId`, so unassigned imports survive reload.
`venueMaps` holds only assignments and generated venue geometry.

- [ ] **Step 3: Add generated-map restore protocol**

```ts
type RestoreGeneratedTrackMapRequest = {
  kind: 'restoreGeneratedTrackMap';
  mapId: string;
  venueKey: string;
  map: TrackMap;
  generatedFrom: LapRef;
};

type DiscardImportedTrackMapRequest = {
  kind: 'discardImportedTrackMap';
  mapId: string;
};

type UnassignTrackMapRequest = {
  kind: 'unassignTrackMap';
  mapId: string;
};
```

Worker generated restore is an idempotent upsert: the same ID replaces prior
geometry only after validating and copying all arrays. Imported restore replays
`importTrackMap` followed by the persisted assignment. Discard removes an import
by ID whether assigned or unassigned; unassign retains parsed import ownership.
Handler/client tests verify request routing, copied worker ownership, transferred
response buffers, and idempotent replacement.

- [ ] **Step 4: Coordinate durable map mutations**

Import parses in worker first, then commits bytes; commit failure calls
`discardImportedTrackMap`. Assignment/regeneration captures prior worker state,
mutates the worker, commits a manifest generation, and restores prior state with
`assignTrackMap`, `unassignTrackMap`, or generated upsert if commit fails.
Deletion commits the manifest without imported bytes, then deletes worker import
and exposes generated fallback.

- [ ] **Step 5: Verify and commit**

```bash
docker compose run --rm app pnpm test src/app/storage/__tests__/maps.test.ts src/worker/__tests__/trackMapStore.test.ts src/worker/__tests__/handlers.test.ts src/app/worker/__tests__/client.test.ts src/app/data/__tests__/trackMaps.test.ts
make check
git add src/app/storage src/app/data/trackMaps.ts src/app/data/__tests__/trackMaps.test.ts src/app/widgets/track-map src/app/worker src/worker
git commit -m "feat(storage): persist venue maps and assignments"
```

### Task 5: Coordinate Drop, Parse, and Manifest Commit

**Files:**
- Create: `src/app/data/sessionLifecycle.ts`
- Create: `src/app/data/__tests__/sessionLifecycle.test.ts`
- Modify: `src/app/panels/FileDrop.tsx`
- Modify: `src/app/data/telemetry.ts`
- Modify: `src/app/state/store.ts`
- Modify: `src/worker/protocol.ts`
- Modify: `src/worker/sessionStore.ts`
- Modify: `src/worker/handlers.ts`
- Modify: `src/worker/__tests__/sessionStore.test.ts`
- Modify: `src/app/worker/client.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Cover ordered multi-file success, one invalid item followed by success, active
duplicate no-op, inactive hash same UUID, sidecar replacement, parse failure
preserving prior manifest/session, and manifest failure closing only the newly
opened worker session.

- [ ] **Step 2: Define per-file results**

```ts
export type LoadResult =
  | { state: 'opened'; session: SessionSummary }
  | { state: 'unchanged'; sessionId: SessionId }
  | { state: 'failed'; fileName: string; message: string };
```

- [ ] **Step 3: Implement lifecycle order**

First add an explicit replacement operation:

```ts
type ReplaceSessionRequest = {
  kind: 'replaceSession';
  sessionId: SessionId;
  fileName: string;
  bytes: ArrayBuffer;
  ldxText?: string;
};
```

`SessionStore.replace` parses a new `Session` into a local variable and swaps
the map entry only after parsing succeeds. Failure leaves the original object
and derived cache ownership untouched. Success retains the same UUID and evicts
old derived entries.

For each recording: stage/hash, open worker with staged UUID, commit manifest,
then add app session. If manifest commit fails, close that newly opened session
and remove temporary data. Continue subsequent batch items.

Sidecar update parses into a temporary `Session` and replaces the worker map
only after success. If grid metadata changes, clear session-bound lap refs and
derived data.

- [ ] **Step 4: Make FileDrop a thin UI and verify**

Expose aggregate loading plus local per-file failures. Do not turn a local file
failure into shell `ERROR` when another session is usable.

```bash
docker compose run --rm app pnpm test src/app/data/__tests__/sessionLifecycle.test.ts src/app/panels/__tests__ src/worker/__tests__/sessionStore.test.ts src/worker/__tests__/handlers.test.ts src/app/worker/__tests__/client.test.ts
make check
git add src/app/data src/app/panels src/app/state src/app/worker src/worker
git commit -m "feat(app): persist recordings during file loading"
```

### Task 6: Restore Sessions and Handle Destructive Delete

**Files:**
- Modify: `src/app/data/sessionLifecycle.ts`
- Modify: `src/app/data/__tests__/sessionLifecycle.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/main.tsx`
- Modify: `src/app/widgets/LapTableWidget.tsx`
- Modify: `src/app/shell/status.ts`
- Modify: `src/app/storage/maps.ts`
- Modify: `src/app/data/trackMaps.ts`

- [ ] **Step 1: Write failing restore tests**

Assert saved order independent of parse completion order, exact persisted UUID,
corrupt first recording not blocking later ones, missing OPFS allowing
nonpersistent use, and explicit restoring shell state.

- [ ] **Step 2: Implement startup restore**

```ts
export type RestoreResult = {
  opened: SessionSummary[];
  failed: { sessionId: SessionId; message: string }[];
};
```

Recover newest valid manifest, clean abandoned data, read/transfer active
recordings in order, and append successful summaries in manifest order. Hydrate
persisted map imports, assignments, and generated geometry through
`MapRepository.restore` after session restore and before workspace hydration.
One corrupt map remains a local map-source failure and does not block sessions or
other maps. Add each `MapRestoreResult.failed` item to local map-source errors and
continue with `restored`. Hydrate workspace only after the successful session
and map sets are known.

- [ ] **Step 3: Write failing deletion/quota tests**

Cover cancel, manifest failure, commit-before-worker-close, interrupted cleanup,
shared blob references, session-bound map colouring reset, and deterministic
`QuotaExceededError` reporting.

- [ ] **Step 4: Implement deletion order**

Commit a new manifest without the UUID, then close worker, clear app session and
lap refs, forget requests, and garbage-collect bytes. Keep channel widget
descriptors. Report attempted bytes and `max(0, quota - usage)` when both values
exist, otherwise unknown capacity.

- [ ] **Step 5: Verify and commit**

```bash
docker compose run --rm app pnpm test src/app/data/__tests__/sessionLifecycle.test.ts src/app/shell/__tests__
make check
git add src/app
git commit -m "feat(app): restore and delete persisted recordings"
```

### Task 7: Persist and Migrate Workspace State

**Files:**
- Create: `src/app/storage/workspace.ts`
- Create: `src/app/storage/__tests__/workspace.test.ts`
- Modify: `src/app/state/store.ts`
- Modify: `src/app/layout/validation.ts`
- Modify: `src/app/widgets/definitions.ts`

- [ ] **Step 1: Write failing snapshot tests**

Cover round-trip, stable widget IDs, invalid JSON, future schema, unknown widget,
invalid rectangles, missing sessions clearing only lap refs, unavailable channel
names retained, transient cursor/errors excluded, and save after stop rather than
pointer movement.

- [ ] **Step 2: Define the first schema**

```ts
export type WorkspaceSnapshotV1 = {
  schemaVersion: 1;
  widgets: WidgetInstance[];
  slots: (LapRef | null)[];
  axisBasis: AxisBasis;
  zoom: ZoomByBasis;
  comparisonsVisible: boolean;
  preferences: Record<string, boolean>;
};
```

Do not persist session summaries, telemetry arrays, cursor, errors, or a global
channel list.

- [ ] **Step 3: Implement validation and hydration**

```ts
export function serializeWorkspace(state: AppState): string;
export function parseWorkspace(text: string): WorkspaceSnapshotV1 | null;
export function reconcileWorkspace(snapshot: WorkspaceSnapshotV1, sessions: readonly SessionSummary[]): WorkspaceSnapshotV1;
```

Future/invalid schemas use exact defaults without touching OPFS. Schedule writes
after discrete actions and drag/resize stop.

- [ ] **Step 4: Verify and commit**

```bash
docker compose run --rm app pnpm test src/app/storage/__tests__/workspace.test.ts src/app/state/__tests__ src/app/layout/__tests__
make check
git add src/app/storage src/app/state src/app/layout src/app/widgets
git commit -m "feat(app): persist the telemetry workspace"
```

### Task 8: Move Derived Arrays into a Byte-Bounded Worker LRU

**Files:**
- Create: `src/worker/byteLru.ts`
- Create: `src/worker/cacheConfig.ts`
- Create: `src/worker/__tests__/byteLru.test.ts`
- Modify: `src/core/session.ts`
- Modify: `src/worker/sessionStore.ts`
- Modify: `src/worker/handlers.ts`
- Modify: `src/worker/protocol.ts`
- Modify: `src/worker/trackMapStore.ts`
- Modify: `src/worker/__tests__/sessionStore.test.ts`
- Modify: `src/worker/__tests__/handlers.test.ts`
- Modify: `src/worker/__tests__/trackMapStore.test.ts`
- Modify: `src/app/storage/maps.ts`
- Modify: `src/app/data/trackMaps.ts`
- Modify: `src/app/data/__tests__/trackMaps.test.ts`

- [ ] **Step 1: Write failing LRU tests**

Cover byte accounting, hit recency, replacement, least-recent eviction,
oversized non-retention, pinning, post-unpin eviction, session forgetting,
shared venue maps, transfer-copy safety, and diagnostics.

- [ ] **Step 2: Implement generic byte LRU**

```ts
export type ByteLruStats = {
  limit: number;
  retainedBytes: number;
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
};

export class ByteLru<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V, bytes: number, owners: readonly string[]): void;
  pin(key: K): void;
  unpin(key: K): void;
  forgetOwner(owner: string): void;
  stats(): ByteLruStats;
}
```

An entry larger than the limit is returned to its caller but not retained.

- [ ] **Step 3: Remove private derived retention from Session**

Keep raw file, decoded source channels, and lap bases as working set. Stop
retaining resampled series and elapsed arrays privately. Expose separate
working-set byte diagnostics.

- [ ] **Step 4: Cache worker-derived values**

Keys include operation, session/lap, full channel, basis/reference grid, ordered
delta refs, and venue/map revision. Pin through creation of a fresh transferable
copy; never transfer cache-owned buffers.

Move reconstructable imported/generated geometry arrays from `TrackMapStore`
into the byte LRU. Keep map IDs, source metadata, and assignments outside
eviction. The worker must not import app storage. Instead add:

```ts
type TrackMapHydrationRequired = {
  kind: 'trackMapHydrationRequired';
  venueKey: string;
  mapId: string;
  source: 'mt2' | 'generated';
};

type HydrateImportedTrackMapRequest = {
  kind: 'hydrateImportedTrackMap';
  mapId: string;
  bytes: ArrayBuffer;
};

type HydrateGeneratedTrackMapRequest = {
  kind: 'hydrateGeneratedTrackMap';
  mapId: string;
  venueKey: string;
  map: TrackMap;
  generatedFrom: LapRef;
};
```

On cache miss, `getTrackMap` returns hydration-required metadata. The app map
service reads the matching OPFS object through `MapRepository`, sends one hydrate
request, and retries `getTrackMap` once. Pin resolved venue geometry while a
request uses it; never create a worker-to-app dependency.

- [ ] **Step 5: Verify and commit**

```bash
docker compose run --rm app pnpm test src/worker/__tests__/byteLru.test.ts src/worker/__tests__/sessionStore.test.ts src/worker/__tests__/trackMapStore.test.ts src/worker/__tests__/handlers.test.ts src/core/__tests__/session.test.ts
make check
make test
make build
git add src/core/session.ts src/worker src/app/storage/maps.ts src/app/data/trackMaps.ts src/app/data/__tests__/trackMaps.test.ts
git commit -m "perf(worker): bound derived telemetry caches by bytes"
```
