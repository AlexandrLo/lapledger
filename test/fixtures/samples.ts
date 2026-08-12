import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type SampleFile = { name: string; ldPath: string; ldxPath?: string };

const SAMPLE_ROOT = join(process.cwd(), 'temp', 'example');

export function samplesAvailable(): boolean {
  return existsSync(SAMPLE_ROOT);
}

export function findSampleFiles(): SampleFile[] {
  if (!samplesAvailable()) return [];

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
