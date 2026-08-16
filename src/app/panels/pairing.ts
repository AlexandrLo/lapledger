export type FilePair = { ld: number; ldx?: number };

function split(name: string): { base: string; extension: string } {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return { base: name.toLowerCase(), extension: '' };
  return { base: name.slice(0, dot).toLowerCase(), extension: name.slice(dot + 1).toLowerCase() };
}

/**
 * Groups dropped file names into recordings.
 *
 * The `.ldx` is optional — laps can be derived without it — so an unmatched
 * `.ld` is still a recording, while an unmatched `.ldx` is nothing at all.
 */
export function pairTelemetryFiles(names: string[]): FilePair[] {
  const sidecars = new Map<string, number>();
  names.forEach((name, index) => {
    const { base, extension } = split(name);
    if (extension === 'ldx') sidecars.set(base, index);
  });

  const pairs: FilePair[] = [];
  names.forEach((name, index) => {
    const { base, extension } = split(name);
    if (extension !== 'ld') return;
    const ldx = sidecars.get(base);
    pairs.push(ldx === undefined ? { ld: index } : { ld: index, ldx });
  });

  return pairs;
}
