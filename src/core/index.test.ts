import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from './index';

describe('core', () => {
  it('exposes a version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
