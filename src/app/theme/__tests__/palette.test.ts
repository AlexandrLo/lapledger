import { describe, expect, it } from 'vitest';

import { applyPalette, LAP_SLOTS, palette, paletteVariables } from '@app/theme/palette';

describe('palette', () => {
  it('names every variable in kebab case under one prefix', () => {
    const names = paletteVariables().map(([name]) => name);

    expect(names).toContain('--ll-panel-header');
    expect(names).toContain('--ll-text-secondary');
    expect(names.every((name) => /^--ll-[a-z0-9-]+$/.test(name))).toBe(true);
  });

  it('exposes one variable per token plus one per lap slot', () => {
    expect(paletteVariables()).toHaveLength(Object.keys(palette).length + LAP_SLOTS.length);
  });

  it('writes every variable onto the target', () => {
    const written = new Map<string, string>();
    applyPalette({ setProperty: (name, value) => written.set(name, value) });

    expect(written.get('--ll-background')).toBe(palette.background);
    expect(written.get('--ll-lap-0')).toBe(LAP_SLOTS[0]);
    expect(written.size).toBe(paletteVariables().length);
  });

  it('keeps the three lap slots distinct and in their documented order', () => {
    expect(LAP_SLOTS).toEqual(['#3987e5', '#d95926', '#b23fa8']);
    expect(new Set(LAP_SLOTS).size).toBe(3);
  });

  it('never reuses a status colour as a lap colour', () => {
    const status = [palette.active, palette.warning, palette.critical];
    for (const slot of LAP_SLOTS) expect(status).not.toContain(slot);
  });
});
