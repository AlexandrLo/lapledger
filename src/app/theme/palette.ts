/**
 * The single source of truth for colour.
 *
 * The DOM reads it as CSS custom properties written by `applyPalette`; the
 * canvas renderers import the object directly. Values are sampled from the
 * Kerbal Space Program 2 interface, panels over black space, as recorded in
 * §8.3 of the design document.
 */
export const palette = {
  background: '#040b19',
  panel: '#06121e',
  panelHeader: '#0e1d28',
  selectedRow: '#1b3346',
  border: '#1e537f',
  /** Derived: the border colour pulled back far enough to stay behind data. */
  gridLine: '#12293c',
  textPrimary: '#ffffff',
  textSecondary: '#bdc4d1',
  numeric: '#f1d37c',
  active: '#00cc51',
  warning: '#ffd600',
  critical: '#f04252',
} as const;

/**
 * Lap identity, by fixed slot: reference, then the two comparisons.
 *
 * Never cycled and never extended. A fourth slot fails the contrast check the
 * palette was validated with — on the reference eight-slot palette the
 * yellow/orange pair scores 10.6 for normal vision against a floor of 15 — and
 * labelling does not repair a pair a reader cannot separate.
 */
export const LAP_SLOTS = ['#3987e5', '#d95926', '#b23fa8'] as const;

const PREFIX = '--ll-';

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function paletteVariables(): [string, string][] {
  const tokens: [string, string][] = Object.entries(palette).map(([key, value]) => [
    `${PREFIX}${kebab(key)}`,
    value,
  ]);
  const slots: [string, string][] = LAP_SLOTS.map((value, index) => [
    `${PREFIX}lap-${index}`,
    value,
  ]);
  return [...tokens, ...slots];
}

export function applyPalette(target: {
  setProperty(name: string, value: string): void;
}): void {
  for (const [name, value] of paletteVariables()) target.setProperty(name, value);
}
