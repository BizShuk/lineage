import { describe, expect, it } from 'vitest';

import { SeededRng } from '../../src/core/rng';

describe('SeededRng', () => {
  it('repeats the same Mulberry32 sequence for the same seed', () => {
    const first = new SeededRng(0x12345678);
    const second = new SeededRng(0x12345678);

    const firstSequence = Array.from({ length: 5 }, () => first.next());
    const secondSequence = Array.from({ length: 5 }, () => second.next());

    expect(firstSequence).toEqual(secondSequence);
    expect(firstSequence).toEqual([
      0.10615200875326991,
      0.941276284167543,
      0.9398706152569503,
      0.2338848018553108,
      0.9045877147000283,
    ]);
  });

  it('returns next values in the half-open range from 0 through less than 1', () => {
    const rng = new SeededRng(7);

    for (let index = 0; index < 1_000; index += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('returns integers within inclusive bounds', () => {
    const rng = new SeededRng(99);
    const values = Array.from({ length: 500 }, () => rng.int(-2, 2));

    expect(values.every(Number.isInteger)).toBe(true);
    expect(Math.min(...values)).toBe(-2);
    expect(Math.max(...values)).toBe(2);
  });

  it('returns the bound when the inclusive range has one value', () => {
    expect(new SeededRng(1).int(4, 4)).toBe(4);
  });

  it.each([
    [2, 1],
    [0.5, 2],
    [1, Number.POSITIVE_INFINITY],
  ])('rejects invalid integer bounds %s through %s', (min, max) => {
    expect(() => new SeededRng(1).int(min, max)).toThrow(RangeError);
  });
});
