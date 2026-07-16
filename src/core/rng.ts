const UINT32_RANGE = 0x1_0000_0000;
const MULBERRY32_INCREMENT = 0x6d2b_79f5;

/** Deterministic 32-bit Mulberry32 pseudo-random number generator. */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + MULBERRY32_INCREMENT) | 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }

  int(min: number, max: number): number {
    const span = max - min + 1;
    if (
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      min > max ||
      !Number.isSafeInteger(span)
    ) {
      throw new RangeError('SeededRng.int bounds must define a safe inclusive integer range');
    }

    return min + Math.floor(this.next() * span);
  }
}
