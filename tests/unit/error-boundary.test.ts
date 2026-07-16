import { describe, expect, it } from 'vitest';

import {
  ErrorBoundary,
  type DiagnosticDownload,
  type ErrorBoundaryPorts,
  type RecoveryView,
} from '../../src/app/ErrorBoundary';

const createPorts = (overrides: Partial<ErrorBoundaryPorts> = {}) => {
  const calls: string[] = [];
  const downloads: DiagnosticDownload[] = [];
  let recovery: RecoveryView | undefined;
  const ports: ErrorBoundaryPorts = {
    pause: () => {
      calls.push('pause');
    },
    save: () => {
      calls.push('save');
    },
    presentRecovery: (view) => {
      calls.push('present');
      recovery = view;
    },
    returnToMenu: () => {
      calls.push('return-menu');
    },
    loadLatestSave: () => {
      calls.push('load-latest');
    },
    exportDiagnostic: (download) => {
      calls.push('export-diagnostic');
      downloads.push(download);
    },
    ...overrides,
  };

  return {
    calls,
    downloads,
    ports,
    recovery: () => recovery,
  };
};

describe('ErrorBoundary', () => {
  it('pauses, attempts a save, then presents Traditional Chinese recovery actions', async () => {
    const fixture = createPorts();
    const logs: unknown[][] = [];
    const boundary = new ErrorBoundary(fixture.ports, {
      now: () => new Date('2026-07-17T12:34:56.000Z'),
      development: true,
      logger: { error: (...values) => logs.push(values) },
    });

    const view = await boundary.capture(new Error('renderer exploded'), {
      scene: 'WorldScene',
      mapId: 'north-field',
    });

    expect(fixture.calls).toEqual(['pause', 'save', 'present']);
    expect(fixture.recovery()).toBe(view);
    expect(view.title).toBe('遊戲發生錯誤');
    expect(view.actions.map(({ label }) => label)).toEqual([
      '返回主選單',
      '載入最近存檔',
      '匯出診斷資料',
    ]);
    expect(logs).toHaveLength(1);

    await view.actions[0]?.run();
    await view.actions[1]?.run();
    await view.actions[2]?.run();
    expect(fixture.calls).toEqual([
      'pause',
      'save',
      'present',
      'return-menu',
      'load-latest',
      'export-diagnostic',
    ]);

    const download = fixture.downloads[0];
    expect(download?.fileName).toBe(
      'talking-island-diagnostic-2026-07-17T12-34-56-000Z.json',
    );
    expect(download?.mediaType).toBe('application/json');
    expect(JSON.parse(download?.contents ?? '') as unknown).toMatchObject({
      gameVersion: '0.1.0',
      capturedAt: '2026-07-17T12:34:56.000Z',
      error: { name: 'Error', message: 'renderer exploded' },
      context: { scene: 'WorldScene', mapId: 'north-field' },
      save: { ok: true },
    });
  });

  it('still presents every recovery action when the best-effort save fails', async () => {
    const saveFailure = new Error('IndexedDB unavailable');
    const fixture = createPorts({
      save: () => {
        fixture.calls.push('save');
        return Promise.reject(saveFailure);
      },
    });
    const boundary = new ErrorBoundary(fixture.ports, {
      now: () => new Date('2026-07-17T13:00:00.000Z'),
    });

    const view = await boundary.capture(new TypeError('bad frame'));

    expect(fixture.calls).toEqual(['pause', 'save', 'present']);
    expect(view.saveSucceeded).toBe(false);
    expect(view.actions).toHaveLength(3);
    await view.actions[1]?.run();
    expect(fixture.calls).toContain('load-latest');
    await view.actions[2]?.run();
    expect(JSON.parse(fixture.downloads[0]?.contents ?? '') as unknown).toMatchObject({
      error: { name: 'TypeError', message: 'bad frame' },
      save: {
        ok: false,
        error: { name: 'Error', message: 'IndexedDB unavailable' },
      },
    });
  });
});
