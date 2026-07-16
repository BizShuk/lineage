import type { SaveSlot } from '../../storage/saveSchema';
import {
  createActionButton,
  createPanelShell,
  type PanelActionResult,
} from './shared';

export interface SaveSummaryView {
  readonly name: string;
  readonly className: string;
  readonly level: number;
  readonly location: string;
  readonly updatedAt: string;
  readonly endingComplete: boolean;
}

export interface SaveSlotView {
  readonly slot: SaveSlot;
  readonly save: SaveSummaryView | null;
  readonly backupUpdatedAt: string | null;
}

export interface SavePanelViewModel {
  readonly slots: readonly SaveSlotView[];
}

export interface SaveImportPreview {
  readonly targetSlot: SaveSlot;
  readonly summary: SaveSummaryView;
  readonly validationToken: object;
}

export interface SaveDownload {
  readonly filename: string;
  readonly mediaType: string;
  readonly contents: string;
}

export interface SaveExportView {
  readonly panel: SavePanelViewModel;
  readonly download: SaveDownload;
}

export interface SavePanelActions {
  readonly load: (slot: SaveSlot) => Promise<PanelActionResult<SavePanelViewModel>>;
  readonly export: (slot: SaveSlot) => Promise<PanelActionResult<SaveExportView>>;
  readonly validateImport: (
    slot: SaveSlot,
    parsedJson: unknown,
  ) => Promise<PanelActionResult<SaveImportPreview>>;
  readonly confirmImport: (
    preview: SaveImportPreview,
  ) => Promise<PanelActionResult<SavePanelViewModel>>;
  readonly restore: (slot: SaveSlot) => Promise<PanelActionResult<SavePanelViewModel>>;
  readonly delete: (
    slot: SaveSlot,
    characterNameConfirmation: string,
  ) => Promise<PanelActionResult<SavePanelViewModel>>;
}

type PanelControl = HTMLButtonElement | HTMLInputElement;

const operationFailureMessage = '無法完成存檔操作，請稍後再試。';

export class SavePanel {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  readonly #actions: SavePanelActions;
  readonly #download: (payload: SaveDownload) => void;
  readonly #controls = new Map<PanelControl, boolean>();
  readonly #importPreviews = new Map<SaveSlot, SaveImportPreview>();
  #state: SavePanelViewModel | null = null;
  #pending = false;

  constructor(
    document: Document,
    actions: SavePanelActions,
    download: (payload: SaveDownload) => void,
  ) {
    this.#document = document;
    this.#actions = actions;
    this.#download = download;
    const shell = createPanelShell(document, 'save', '存檔管理');
    this.element = shell.element;
    this.#body = shell.body;
    this.#status = shell.status;
  }

  get state(): SavePanelViewModel | null {
    return this.#state;
  }

  render(viewModel: SavePanelViewModel): void {
    this.#state = viewModel;
    this.#controls.clear();
    const slots = this.#document.createElement('div');
    slots.className = 'save-slots';
    viewModel.slots.forEach((slot) => {
      slots.append(this.#renderSlot(slot));
    });
    this.#body.replaceChildren(slots);
  }

  async load(slot: SaveSlot): Promise<void> {
    await this.#run(
      () => this.#actions.load(slot),
      (viewModel) => {
        this.#renderActionViewModel(viewModel);
      },
    );
  }

  async export(slot: SaveSlot): Promise<void> {
    await this.#run(
      () => this.#actions.export(slot),
      ({ panel, download }) => {
        this.#renderActionViewModel(panel);
        this.#download(download);
      },
    );
  }

  async importSerialized(slot: SaveSlot, serialized: string): Promise<void> {
    if (this.#pending) return;
    this.#importPreviews.delete(slot);
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch {
      this.#status.textContent = '匯入檔案不是有效的 JSON。';
      this.#rerenderCurrent();
      return;
    }
    await this.#validateImport(slot, parsed);
  }

  async confirmImport(slot: SaveSlot): Promise<void> {
    const preview = this.#importPreviews.get(slot);
    if (preview === undefined) return;
    await this.#run(
      () => this.#actions.confirmImport(preview),
      (viewModel) => {
        this.#renderActionViewModel(viewModel);
      },
      () => this.#importPreviews.delete(slot),
    );
  }

  async restore(slot: SaveSlot): Promise<void> {
    await this.#run(
      () => this.#actions.restore(slot),
      (viewModel) => {
        this.#renderActionViewModel(viewModel);
      },
    );
  }

  async delete(slot: SaveSlot, characterNameConfirmation: string): Promise<void> {
    const summary = this.#state?.slots.find((candidate) => candidate.slot === slot)?.save;
    if (summary === null || summary === undefined) return;
    if (characterNameConfirmation !== summary.name) {
      this.#status.textContent = `請輸入完整角色名稱「${summary.name}」以刪除存檔。`;
      return;
    }
    await this.#run(
      () => this.#actions.delete(slot, characterNameConfirmation),
      (viewModel) => {
        this.#renderActionViewModel(viewModel);
      },
    );
  }

  #renderSlot(slot: SaveSlotView): HTMLElement {
    const card = this.#document.createElement('section');
    card.className = 'save-slot';
    card.setAttribute('data-testid', `save-slot-${String(slot.slot)}`);

    const heading = this.#document.createElement('h3');
    heading.textContent = `存檔欄 ${String(slot.slot)}`;
    const summary = this.#document.createElement('div');
    if (slot.save === null) {
      summary.textContent = '空存檔欄';
    } else {
      const ending = slot.save.endingComplete ? ' / 結局完成' : '';
      summary.textContent = `${slot.save.name} / ${slot.save.className} / 等級 ${String(slot.save.level)} / ${slot.save.location} / 更新 ${slot.save.updatedAt}${ending}`;
    }

    const backup = this.#document.createElement('p');
    backup.setAttribute('data-testid', `save-backup-${String(slot.slot)}`);
    backup.textContent = `目前 ${slot.save?.updatedAt ?? '無'} / 備份 ${slot.backupUpdatedAt ?? '無'}`;

    const actions = this.#document.createElement('div');
    const load = createActionButton(
      this.#document,
      '載入',
      `save-load-${String(slot.slot)}`,
      () => void this.load(slot.slot),
    );
    const exportButton = createActionButton(
      this.#document,
      '匯出',
      `save-export-${String(slot.slot)}`,
      () => void this.export(slot.slot),
    );
    this.#registerControl(load, slot.save === null);
    this.#registerControl(exportButton, slot.save === null);

    const importLabel = this.#document.createElement('label');
    importLabel.textContent = '匯入 JSON';
    const importInput = this.#document.createElement('input');
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.setAttribute('aria-label', `匯入至存檔欄 ${String(slot.slot)}`);
    importInput.setAttribute('data-testid', `save-import-file-${String(slot.slot)}`);
    importInput.addEventListener('change', () => {
      const file = importInput.files?.item(0);
      if (file !== null && file !== undefined) void this.#importFile(slot.slot, file);
    });
    this.#registerControl(importInput, false);
    importLabel.append(importInput);

    const restore = createActionButton(
      this.#document,
      '還原備份',
      `save-restore-${String(slot.slot)}`,
      () => void this.restore(slot.slot),
    );
    this.#registerControl(restore, slot.backupUpdatedAt === null);

    const deleteLabel = this.#document.createElement('label');
    deleteLabel.textContent = '輸入角色名稱以刪除';
    const deleteName = this.#document.createElement('input');
    deleteName.type = 'text';
    deleteName.setAttribute('aria-label', `存檔欄 ${String(slot.slot)} 刪除確認名稱`);
    deleteName.setAttribute('data-testid', `save-delete-name-${String(slot.slot)}`);
    this.#registerControl(deleteName, slot.save === null);
    deleteLabel.append(deleteName);
    const deleteButton = createActionButton(
      this.#document,
      '刪除',
      `save-delete-${String(slot.slot)}`,
      () => void this.delete(slot.slot, deleteName.value),
    );
    this.#registerControl(deleteButton, slot.save === null);

    actions.append(load, exportButton, importLabel, restore, deleteLabel, deleteButton);
    card.append(heading, summary, backup, actions);

    const preview = this.#importPreviews.get(slot.slot);
    if (preview !== undefined) card.append(this.#renderImportPreview(preview));
    return card;
  }

  #renderImportPreview(preview: SaveImportPreview): HTMLElement {
    const container = this.#document.createElement('div');
    container.setAttribute(
      'data-testid',
      `save-import-preview-${String(preview.targetSlot)}`,
    );
    const summary = preview.summary;
    const ending = summary.endingComplete ? ' / 結局完成' : '';
    const description = this.#document.createElement('p');
    description.textContent = `目標存檔欄 ${String(preview.targetSlot)} / ${summary.name} / ${summary.className} / 等級 ${String(summary.level)} / ${summary.location} / 更新 ${summary.updatedAt}${ending}`;
    const confirm = createActionButton(
      this.#document,
      '確認匯入',
      `save-import-confirm-${String(preview.targetSlot)}`,
      () => void this.confirmImport(preview.targetSlot),
    );
    this.#registerControl(confirm, false);
    container.append(description, confirm);
    return container;
  }

  async #importFile(slot: SaveSlot, file: File): Promise<void> {
    if (this.#pending) return;
    this.#setPending(true);
    this.#status.textContent = '';
    this.#importPreviews.delete(slot);
    try {
      const serialized = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(serialized) as unknown;
      } catch {
        this.#status.textContent = '匯入檔案不是有效的 JSON。';
        this.#rerenderCurrent();
        return;
      }
      const result = await this.#actions.validateImport(slot, parsed);
      this.#applyImportValidation(slot, result);
    } catch {
      this.#status.textContent = operationFailureMessage;
    } finally {
      this.#setPending(false);
    }
  }

  async #validateImport(slot: SaveSlot, parsed: unknown): Promise<void> {
    await this.#run(
      () => this.#actions.validateImport(slot, parsed),
      (preview) => {
        this.#importPreviews.set(slot, preview);
        this.#rerenderCurrent();
      },
      () => {
        this.#importPreviews.delete(slot);
        this.#rerenderCurrent();
      },
    );
  }

  #applyImportValidation(
    slot: SaveSlot,
    result: PanelActionResult<SaveImportPreview>,
  ): void {
    if (!result.ok) {
      this.#importPreviews.delete(slot);
      this.#status.textContent = result.reason;
      this.#rerenderCurrent();
      return;
    }
    this.#importPreviews.set(slot, result.viewModel);
    this.#rerenderCurrent();
  }

  async #run<T>(
    operation: () => Promise<PanelActionResult<T>>,
    onSuccess: (viewModel: T) => void,
    onFailure?: () => void,
  ): Promise<void> {
    if (this.#pending) return;
    this.#setPending(true);
    this.#status.textContent = '';
    try {
      const result = await operation();
      if (!result.ok) {
        onFailure?.();
        this.#status.textContent = result.reason;
        return;
      }
      onSuccess(result.viewModel);
    } catch {
      onFailure?.();
      this.#status.textContent = operationFailureMessage;
    } finally {
      this.#setPending(false);
    }
  }

  #renderActionViewModel(viewModel: SavePanelViewModel): void {
    this.#importPreviews.clear();
    this.render(viewModel);
  }

  #rerenderCurrent(): void {
    if (this.#state !== null) this.render(this.#state);
  }

  #registerControl(control: PanelControl, disabled: boolean): void {
    this.#controls.set(control, disabled);
    control.disabled = disabled || this.#pending;
  }

  #setPending(pending: boolean): void {
    this.#pending = pending;
    this.#controls.forEach((disabled, control) => {
      control.disabled = disabled || pending;
    });
  }
}
