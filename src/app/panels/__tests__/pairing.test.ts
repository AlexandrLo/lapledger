import { describe, expect, it } from 'vitest';

import { pairTelemetryFiles } from '@app/panels/pairing';

describe('pairTelemetryFiles', () => {
  it('pairs an .ldx with the .ld of the same base name', () => {
    expect(pairTelemetryFiles(['run.ld', 'run.ldx'])).toEqual([{ ld: 0, ldx: 1 }]);
  });

  it('pairs regardless of the order they were dropped in', () => {
    expect(pairTelemetryFiles(['run.ldx', 'run.ld'])).toEqual([{ ld: 1, ldx: 0 }]);
  });

  it('ignores case in the extension', () => {
    expect(pairTelemetryFiles(['RUN.LD', 'run.LDX'])).toEqual([{ ld: 0, ldx: 1 }]);
  });

  it('accepts an .ld with no .ldx beside it', () => {
    expect(pairTelemetryFiles(['run.ld'])).toEqual([{ ld: 0 }]);
  });

  it('keeps several recordings apart', () => {
    expect(pairTelemetryFiles(['a.ld', 'b.ld', 'b.ldx'])).toEqual([
      { ld: 0 },
      { ld: 1, ldx: 2 },
    ]);
  });

  it('drops files that are neither .ld nor .ldx', () => {
    expect(pairTelemetryFiles(['notes.txt', 'run.ld'])).toEqual([{ ld: 1 }]);
  });

  it('ignores an .ldx with no recording to belong to', () => {
    expect(pairTelemetryFiles(['orphan.ldx'])).toEqual([]);
  });
});
