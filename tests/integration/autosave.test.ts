import { describe, expect, it } from 'vitest';

import {
  AutosaveCoordinator,
  AutosaveDisposedError,
  type AutosaveReason,
} from '../../src/storage/AutosaveCoordinator';
import { validateSaveV1 } from '../../src/storage/saveSchema';
import { RecordingSaveRepository } from '../helpers/RecordingSaveRepository';
import { completeSave } from '../helpers/saveFixtures';

const deferred = (): { readonly promise: Promise<void>; readonly resolve: () => void } => {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => {
      resolvePromise?.();
    },
  };
};

describe('AutosaveCoordinator', () => {
  it('supports every autosave reason with synchronous and asynchronous snapshots', async () => {
    const repository = new RecordingSaveRepository();
    let asyncSnapshot = false;
    const autosave = new AutosaveCoordinator(repository, () => {
      const snapshot = completeSave({ slot: 1 });
      return asyncSnapshot ? Promise.resolve(snapshot) : snapshot;
    });
    const reasons: readonly AutosaveReason[] = [
      'map-change',
      'quest-stage',
      'death-respawn',
      'return-menu',
      'manual',
    ];

    for (const reason of reasons) {
      const result = await autosave.request(reason);
      expect(result).toMatchObject({ ok: true, reason });
      asyncSnapshot = true;
    }

    expect(repository.putReasons).toEqual(reasons);
  });

  it('coalesces a burst behind an active write without losing the final snapshot', async () => {
    const firstPut = deferred();
    const repository = new RecordingSaveRepository({
      beforePut: async (_save, reason) => {
        if (reason === 'map-change') {
          await firstPut.promise;
        }
      },
    });
    let level = 1;
    const autosave = new AutosaveCoordinator(repository, () => completeSave({ level }));

    const first = autosave.request('map-change');
    await repository.waitForPutCount(1);
    level = 2;
    const superseded = autosave.request('quest-stage');
    level = 3;
    const final = autosave.request('death-respawn');

    firstPut.resolve();
    const results = await Promise.all([first, superseded, final]);

    expect(repository.putReasons).toEqual(['map-change', 'death-respawn']);
    expect(repository.saves.map(({ character }) => character.level)).toEqual([1, 3]);
    expect(repository.maxConcurrentPuts).toBe(1);
    expect(results).toEqual([
      expect.objectContaining({ ok: true, reason: 'map-change' }),
      expect.objectContaining({ ok: true, reason: 'death-respawn' }),
      expect.objectContaining({ ok: true, reason: 'death-respawn' }),
    ]);
  });

  it('defers combat autosaves and flushes the latest state when combat resolves', async () => {
    const repository = new RecordingSaveRepository();
    let level = 5;
    const autosave = new AutosaveCoordinator(repository, () => completeSave({ level }));
    autosave.setCombatTransactionPending(true);

    const first = autosave.request('map-change');
    level = 6;
    const latest = autosave.request('quest-stage');
    await Promise.resolve();
    expect(repository.putReasons).toEqual([]);

    autosave.setCombatTransactionPending(false);
    await Promise.all([first, latest]);

    expect(repository.putReasons).toEqual(['quest-stage']);
    expect(repository.saves[0]?.character.level).toBe(6);
  });

  it('reports one failed write and continues processing later requests', async () => {
    const repository = new RecordingSaveRepository();
    const failure = new Error('disk unavailable');
    repository.failNext(failure);
    const autosave = new AutosaveCoordinator(repository, () => completeSave());

    const failed = await autosave.request('manual');
    const recovered = await autosave.request('return-menu');

    expect(failed).toEqual({ ok: false, reason: 'manual', error: failure });
    expect(recovered).toMatchObject({ ok: true, reason: 'return-menu' });
    expect(repository.putReasons).toEqual(['manual', 'return-menu']);
  });

  it('refreshes updatedAt and checksum for every actual write', async () => {
    const repository = new RecordingSaveRepository();
    const timestamps = [
      new Date('2026-07-17T10:00:00.000Z'),
      new Date('2026-07-17T10:00:01.000Z'),
    ];
    const autosave = new AutosaveCoordinator(
      repository,
      () => completeSave({ updatedAt: '2026-07-17T00:00:00.000Z' }),
      () => {
        const timestamp = timestamps.shift();
        if (timestamp === undefined) {
          throw new Error('test clock exhausted');
        }
        return timestamp;
      },
    );

    await autosave.request('map-change');
    await autosave.request('quest-stage');

    expect(repository.saves.map(({ updatedAt }) => updatedAt)).toEqual([
      '2026-07-17T10:00:00.000Z',
      '2026-07-17T10:00:01.000Z',
    ]);
    expect(repository.saves[0]?.checksum).not.toBe(repository.saves[1]?.checksum);
    for (const save of repository.saves) {
      expect(validateSaveV1(save)).toEqual(save);
    }
  });

  it('rejects new requests after disposal', async () => {
    const repository = new RecordingSaveRepository();
    const autosave = new AutosaveCoordinator(repository, () => completeSave());
    autosave.dispose();

    await expect(autosave.request('manual')).rejects.toBeInstanceOf(
      AutosaveDisposedError,
    );
    expect(repository.putReasons).toEqual([]);
  });
});
