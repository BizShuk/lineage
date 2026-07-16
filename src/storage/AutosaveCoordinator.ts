import { sealSaveV1, type SaveGameV1 } from './saveSchema';

export type AutosaveReason =
  | 'map-change'
  | 'quest-stage'
  | 'death-respawn'
  | 'return-menu'
  | 'manual';

export interface AutosaveRepository {
  put(save: SaveGameV1, reason: AutosaveReason): Promise<void>;
}

export type AutosaveSnapshotFactory = () => SaveGameV1 | Promise<SaveGameV1>;

export type AutosaveResult =
  | {
      readonly ok: true;
      readonly reason: AutosaveReason;
      readonly save: SaveGameV1;
    }
  | {
      readonly ok: false;
      readonly reason: AutosaveReason;
      readonly error: unknown;
    };

interface PendingBatch {
  reason: AutosaveReason;
  readonly resolve: Array<(result: AutosaveResult) => void>;
}

export class AutosaveDisposedError extends Error {
  constructor() {
    super('Autosave coordinator has been disposed');
    this.name = 'AutosaveDisposedError';
  }
}

export class AutosaveCoordinator {
  readonly #repository: AutosaveRepository;
  readonly #snapshotFactory: AutosaveSnapshotFactory;
  readonly #now: () => Date;
  #pending: PendingBatch | null = null;
  #combatTransactionPending = false;
  #draining = false;
  #drainScheduled = false;
  #disposed = false;

  constructor(
    repository: AutosaveRepository,
    snapshotFactory: AutosaveSnapshotFactory,
    now: () => Date = () => new Date(),
  ) {
    this.#repository = repository;
    this.#snapshotFactory = snapshotFactory;
    this.#now = now;
  }

  request(reason: AutosaveReason): Promise<AutosaveResult> {
    if (this.#disposed) {
      return Promise.reject(new AutosaveDisposedError());
    }

    const result = new Promise<AutosaveResult>((resolve) => {
      if (this.#pending === null) {
        this.#pending = { reason, resolve: [resolve] };
      } else {
        this.#pending.reason = reason;
        this.#pending.resolve.push(resolve);
      }
    });
    this.#scheduleDrain();
    return result;
  }

  setCombatTransactionPending(pending: boolean): void {
    this.#combatTransactionPending = pending;
    if (!pending) {
      this.#scheduleDrain();
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const pending = this.#pending;
    this.#pending = null;
    if (pending !== null) {
      const result: AutosaveResult = {
        ok: false,
        reason: pending.reason,
        error: new AutosaveDisposedError(),
      };
      pending.resolve.forEach((resolve) => {
        resolve(result);
      });
    }
  }

  #scheduleDrain(): void {
    if (
      this.#disposed ||
      this.#combatTransactionPending ||
      this.#draining ||
      this.#drainScheduled ||
      this.#pending === null
    ) {
      return;
    }

    this.#drainScheduled = true;
    queueMicrotask(() => {
      this.#drainScheduled = false;
      void this.#drain();
    });
  }

  async #drain(): Promise<void> {
    if (this.#draining) {
      return;
    }

    this.#draining = true;
    try {
      while (this.#pending !== null) {
        if (this.#disposed || this.#combatTransactionPending) {
          return;
        }
        const batch = this.#pending;
        this.#pending = null;
        const result = await this.#write(batch.reason);
        batch.resolve.forEach((resolve) => {
          resolve(result);
        });
      }
    } finally {
      this.#draining = false;
      this.#scheduleDrain();
    }
  }

  async #write(reason: AutosaveReason): Promise<AutosaveResult> {
    try {
      const snapshot = await this.#snapshotFactory();
      const save = sealSaveV1({
        ...snapshot,
        updatedAt: this.#now().toISOString(),
        checksum: '',
      });
      await this.#repository.put(save, reason);
      return { ok: true, reason, save };
    } catch (error) {
      return { ok: false, reason, error };
    }
  }
}
