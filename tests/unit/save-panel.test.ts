import { describe, expect, it } from 'vitest';

import {
  SavePanel,
  type SaveDownload,
  type SaveImportPreview,
  type SavePanelActions,
  type SavePanelViewModel,
} from '../../src/ui/panels/SavePanel';

class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly ownerDocument: FakeDocument;
  readonly children: FakeElement[] = [];
  readonly #attributes = new Map<string, string>();
  #ownText = '';
  parentElement: FakeElement | null = null;
  className = '';
  value = '';
  type = '';
  accept = '';
  disabled = false;
  tabIndex = 0;

  constructor(tagName: string, ownerDocument: FakeDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
  }

  get textContent(): string {
    return this.#ownText + this.children.map(({ textContent }) => textContent).join('');
  }

  set textContent(value: string) {
    this.#ownText = value;
    this.children.length = 0;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  append(...nodes: readonly (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.#ownText += node;
      } else {
        node.parentElement = this;
        this.children.push(node);
      }
    }
  }

  replaceChildren(...nodes: readonly FakeElement[]): void {
    this.#ownText = '';
    this.children.length = 0;
    this.append(...nodes);
  }

  click(): void {
    if (!this.disabled) {
      this.dispatchEvent(new Event('click'));
    }
  }
}

class FakeDocument {
  createElement(tagName: string): HTMLElement {
    return new FakeElement(tagName, this) as unknown as HTMLElement;
  }
}

const documentForTest = (): Document => new FakeDocument() as unknown as Document;
const fakeElement = (element: HTMLElement): FakeElement => element as unknown as FakeElement;

const findByTestId = (root: HTMLElement, testId: string): FakeElement => {
  const queue = [fakeElement(root)];
  while (queue.length > 0) {
    const element = queue.shift();
    if (element === undefined) break;
    if (element.getAttribute('data-testid') === testId) return element;
    queue.push(...element.children);
  }
  throw new Error(`找不到 data-testid=${testId}`);
};

const allButtons = (root: HTMLElement): FakeElement[] => {
  const queue = [fakeElement(root)];
  const buttons: FakeElement[] = [];
  while (queue.length > 0) {
    const element = queue.shift();
    if (element === undefined) break;
    if (element.tagName === 'BUTTON') buttons.push(element);
    queue.push(...element.children);
  }
  return buttons;
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const initialModel = (): SavePanelViewModel => ({
  slots: [
    {
      slot: 1,
      save: null,
      backupUpdatedAt: null,
    },
    {
      slot: 2,
      save: {
        name: '海風騎士',
        className: '騎士',
        level: 8,
        location: '說話之島村',
        updatedAt: '2026-07-17T02:00:00.000Z',
        endingComplete: false,
      },
      backupUpdatedAt: '2026-07-16T23:00:00.000Z',
    },
    {
      slot: 3,
      save: {
        name: '星光法師',
        className: '法師',
        level: 15,
        location: '說話之島村',
        updatedAt: '2026-07-17T03:00:00.000Z',
        endingComplete: true,
      },
      backupUpdatedAt: null,
    },
  ],
});

const unchangedFailure = () => Promise.resolve({ ok: false as const, reason: '操作失敗' });

const actionsWith = (overrides: Partial<SavePanelActions> = {}): SavePanelActions => ({
  load: unchangedFailure,
  export: unchangedFailure,
  validateImport: unchangedFailure,
  confirmImport: unchangedFailure,
  restore: unchangedFailure,
  delete: unchangedFailure,
  ...overrides,
});

describe('SavePanel', () => {
  it('renders exactly three slot summaries including empty, timestamps, and ending state', () => {
    const panel = new SavePanel(documentForTest(), actionsWith(), () => undefined);

    panel.render(initialModel());

    expect(findByTestId(panel.element, 'save-panel').getAttribute('aria-label')).toBe('存檔管理');
    expect(findByTestId(panel.element, 'save-slot-1').textContent).toContain('空存檔欄');
    expect(findByTestId(panel.element, 'save-slot-2').textContent).toContain('海風騎士');
    expect(findByTestId(panel.element, 'save-slot-2').textContent).toContain('騎士 / 等級 8');
    expect(findByTestId(panel.element, 'save-slot-2').textContent).toContain('說話之島村');
    expect(findByTestId(panel.element, 'save-backup-2').textContent).toContain(
      '目前 2026-07-17T02:00:00.000Z',
    );
    expect(findByTestId(panel.element, 'save-backup-2').textContent).toContain(
      '備份 2026-07-16T23:00:00.000Z',
    );
    expect(findByTestId(panel.element, 'save-slot-3').textContent).toContain('結局完成');
  });

  it('parses and validates import before showing a preview, then confirms with the opaque token', async () => {
    const token = Object.freeze({ repositoryOwned: '不可由 UI 解讀' });
    const preview: SaveImportPreview = {
      targetSlot: 1,
      summary: {
        name: '匯入妖精',
        className: '妖精',
        level: 11,
        location: '海岸',
        updatedAt: '2026-07-17T04:00:00.000Z',
        endingComplete: false,
      },
      validationToken: token,
    };
    const imported = initialModel();
    let validatedValue: unknown;
    const confirmedPreviews: SaveImportPreview[] = [];
    const panel = new SavePanel(
      documentForTest(),
      actionsWith({
        validateImport: (slot, parsed) => {
          expect(slot).toBe(1);
          validatedValue = parsed;
          return Promise.resolve({ ok: true as const, viewModel: preview });
        },
        confirmImport: (candidate) => {
          confirmedPreviews.push(candidate);
          return Promise.resolve({ ok: true as const, viewModel: imported });
        },
      }),
      () => undefined,
    );
    panel.render(initialModel());

    await panel.importSerialized(1, '{"schemaVersion":1,"slot":3}');

    expect(validatedValue).toEqual({ schemaVersion: 1, slot: 3 });
    expect(confirmedPreviews).toEqual([]);
    expect(findByTestId(panel.element, 'save-import-preview-1').textContent).toContain('匯入妖精');
    expect(findByTestId(panel.element, 'save-import-preview-1').textContent).toContain('目標存檔欄 1');

    findByTestId(panel.element, 'save-import-confirm-1').click();
    await flush();

    expect(confirmedPreviews).toEqual([preview]);
    expect(confirmedPreviews[0]?.validationToken).toBe(token);
    expect(panel.state).toBe(imported);
  });

  it('rejects malformed import JSON locally and preserves state on validation failure', async () => {
    let validationCalls = 0;
    const initial = initialModel();
    const panel = new SavePanel(
      documentForTest(),
      actionsWith({
        validateImport: () => {
          validationCalls += 1;
          return Promise.resolve({ ok: false as const, reason: '存檔 checksum 驗證失敗' });
        },
      }),
      () => undefined,
    );
    panel.render(initial);

    await panel.importSerialized(2, '{not-json');
    expect(validationCalls).toBe(0);
    expect(findByTestId(panel.element, 'save-status').textContent).toBe(
      '匯入檔案不是有效的 JSON。',
    );

    await panel.importSerialized(2, '{"schemaVersion":99}');
    expect(validationCalls).toBe(1);
    expect(panel.state).toBe(initial);
    expect(findByTestId(panel.element, 'save-status').textContent).toBe(
      '存檔 checksum 驗證失敗',
    );
  });

  it('removes a stale import confirmation when a later validation fails', async () => {
    const preview: SaveImportPreview = {
      targetSlot: 2,
      summary: {
        name: '第一份存檔',
        className: '王族',
        level: 5,
        location: '北部野外',
        updatedAt: '2026-07-17T05:00:00.000Z',
        endingComplete: false,
      },
      validationToken: Object.freeze({ id: 'first-validation' }),
    };
    let succeeds = true;
    const panel = new SavePanel(
      documentForTest(),
      actionsWith({
        validateImport: () =>
          Promise.resolve(
            succeeds
              ? { ok: true as const, viewModel: preview }
              : { ok: false as const, reason: '第二份存檔驗證失敗' },
          ),
      }),
      () => undefined,
    );
    panel.render(initialModel());

    await panel.importSerialized(2, '{"candidate":1}');
    expect(findByTestId(panel.element, 'save-import-confirm-2').textContent).toBe('確認匯入');

    succeeds = false;
    await panel.importSerialized(2, '{"candidate":2}');

    expect(() => findByTestId(panel.element, 'save-import-confirm-2')).toThrow(/找不到/);
    expect(findByTestId(panel.element, 'save-status').textContent).toBe('第二份存檔驗證失敗');
  });

  it('locks every async action while pending and renders only the action result', async () => {
    const initial = initialModel();
    let resolveLoad: ((result: Awaited<ReturnType<SavePanelActions['load']>>) => void) | undefined;
    let loadCalls = 0;
    const panel = new SavePanel(
      documentForTest(),
      actionsWith({
        load: () => {
          loadCalls += 1;
          return new Promise((resolve) => {
            resolveLoad = resolve;
          });
        },
      }),
      () => undefined,
    );
    panel.render(initial);
    const load = findByTestId(panel.element, 'save-load-2');

    load.click();
    load.click();

    expect(loadCalls).toBe(1);
    expect(panel.state).toBe(initial);
    expect(allButtons(panel.element).every(({ disabled }) => disabled)).toBe(true);

    resolveLoad?.({ ok: false, reason: '存檔已損毀，無法載入。' });
    await flush();

    expect(panel.state).toBe(initial);
    expect(findByTestId(panel.element, 'save-status').getAttribute('aria-live')).toBe('polite');
    expect(findByTestId(panel.element, 'save-status').textContent).toBe('存檔已損毀，無法載入。');
    expect(allButtons(panel.element).some(({ disabled }) => !disabled)).toBe(true);
  });

  it('requires an exact delete name and supports restore timestamps and downloadable export', async () => {
    const initial = initialModel();
    const afterDelete: SavePanelViewModel = {
      slots: initial.slots.map((slot) =>
        slot.slot === 2 ? { slot: 2 as const, save: null, backupUpdatedAt: null } : slot,
      ),
    };
    const download: SaveDownload = {
      filename: 'lineage-slot-2.json',
      mediaType: 'application/json',
      contents: '{"slot":2}',
    };
    const downloaded: SaveDownload[] = [];
    let deleteCalls = 0;
    let restoreCalls = 0;
    const panel = new SavePanel(
      documentForTest(),
      actionsWith({
        delete: (slot, name) => {
          deleteCalls += 1;
          expect([slot, name]).toEqual([2, '海風騎士']);
          return Promise.resolve({ ok: true as const, viewModel: afterDelete });
        },
        restore: (slot) => {
          restoreCalls += 1;
          expect(slot).toBe(2);
          return Promise.resolve({ ok: true as const, viewModel: initial });
        },
        export: () => Promise.resolve({
          ok: true,
          viewModel: { panel: initial, download },
        }),
      }),
      (payload) => downloaded.push(payload),
    );
    panel.render(initial);
    const confirmation = findByTestId(panel.element, 'save-delete-name-2');

    confirmation.value = '海風騎士 ';
    findByTestId(panel.element, 'save-delete-2').click();
    await flush();
    expect(deleteCalls).toBe(0);
    expect(findByTestId(panel.element, 'save-status').textContent).toBe(
      '請輸入完整角色名稱「海風騎士」以刪除存檔。',
    );

    confirmation.value = '海風騎士';
    findByTestId(panel.element, 'save-delete-2').click();
    await flush();
    expect(deleteCalls).toBe(1);
    expect(panel.state).toBe(afterDelete);

    panel.render(initial);
    findByTestId(panel.element, 'save-restore-2').click();
    await flush();
    expect(restoreCalls).toBe(1);

    findByTestId(panel.element, 'save-export-2').click();
    await flush();
    expect(downloaded).toEqual([download]);
    expect(panel.state).toBe(initial);
  });
});
