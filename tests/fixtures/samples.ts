import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SampleFile = { name: string; ldPath: string; ldxPath?: string };

/**
 * Resolved from this module's own location rather than from `process.cwd()`,
 * so the fixture is found no matter which directory the runner started in.
 */
const SAMPLE_ROOT = fileURLToPath(new URL('./motec', import.meta.url));

export function findSampleFiles(): SampleFile[] {
  const found: SampleFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (entry.toLowerCase().endsWith('.ld')) {
        const ldxPath = `${path}x`;
        found.push({
          name: entry,
          ldPath: path,
          ...(existsSync(ldxPath) ? { ldxPath } : {}),
        });
      }
    }
  };
  walk(SAMPLE_ROOT);

  return found.sort((a, b) => a.name.localeCompare(b.name));
}
