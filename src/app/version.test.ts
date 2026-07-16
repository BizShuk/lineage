import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from './version';

describe('GAME_VERSION', () => {
  it('uses semantic versioning', () => {
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
