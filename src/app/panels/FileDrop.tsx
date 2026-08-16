import { useCallback, useState } from 'react';

import { getTelemetry } from '@app/data/telemetry';
import { appStore } from '@app/state/store';

import { pairTelemetryFiles } from './pairing';

async function openFiles(files: File[]): Promise<void> {
  const { client } = getTelemetry();

  for (const pair of pairTelemetryFiles(files.map((file) => file.name))) {
    const ld = files[pair.ld];
    const bytes = await ld.arrayBuffer();
    const ldxText = pair.ldx === undefined ? undefined : await files[pair.ldx].text();

    // The buffer is transferred, not cloned: 28 MB copied per file would be
    // a visible pause, and the main thread has no further use for the bytes.
    const result = await client.request(
      {
        kind: 'openSession',
        fileName: ld.name,
        bytes,
        ...(ldxText === undefined ? {} : { ldxText }),
      },
      [bytes],
    );
    appStore.getState().addSession(result.session);
  }
}

export function FileDrop() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((files: File[]) => {
    setBusy(true);
    setError(null);
    openFiles(files)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  }, []);

  return (
    <div
      className="file-drop"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        load([...event.dataTransfer.files]);
      }}
    >
      <label>
        {busy ? 'Reading…' : 'Drop .ld and .ldx here, or choose files'}
        <input
          type="file"
          multiple
          accept=".ld,.ldx"
          onChange={(event) => load([...(event.target.files ?? [])])}
        />
      </label>
      {error !== null && <p className="error">{error}</p>}
    </div>
  );
}
