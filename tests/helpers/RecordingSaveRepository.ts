import type {
  AutosaveReason,
  AutosaveRepository,
} from '../../src/storage/AutosaveCoordinator';
import type { SaveGameV1 } from '../../src/storage/saveSchema';

export interface RecordingSaveRepositoryOptions {
  readonly beforePut?: (
    save: SaveGameV1,
    reason: AutosaveReason,
  ) => void | Promise<void>;
}

export class RecordingSaveRepository implements AutosaveRepository {
  readonly putReasons: AutosaveReason[] = [];
  readonly saves: SaveGameV1[] = [];
  maxConcurrentPuts = 0;

  readonly #beforePut:
    | ((save: SaveGameV1, reason: AutosaveReason) => void | Promise<void>)
    | undefined;
  readonly #failures: Error[] = [];
  readonly #putCountWaiters: Array<{
    readonly count: number;
    readonly resolve: () => void;
  }> = [];
  #activePuts = 0;

  constructor(options: RecordingSaveRepositoryOptions = {}) {
    this.#beforePut = options.beforePut;
  }

  failNext(error: Error): void {
    this.#failures.push(error);
  }

  waitForPutCount(count: number): Promise<void> {
    if (this.putReasons.length >= count) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#putCountWaiters.push({ count, resolve });
    });
  }

  async put(save: SaveGameV1, reason: AutosaveReason): Promise<void> {
    this.#activePuts += 1;
    this.maxConcurrentPuts = Math.max(this.maxConcurrentPuts, this.#activePuts);
    this.putReasons.push(reason);
    this.saves.push(save);
    this.#resolvePutCountWaiters();

    try {
      await this.#beforePut?.(save, reason);
      const failure = this.#failures.shift();
      if (failure !== undefined) {
        throw failure;
      }
    } finally {
      this.#activePuts -= 1;
    }
  }

  #resolvePutCountWaiters(): void {
    for (let index = this.#putCountWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.#putCountWaiters[index];
      if (waiter !== undefined && this.putReasons.length >= waiter.count) {
        this.#putCountWaiters.splice(index, 1);
        waiter.resolve();
      }
    }
  }
}
