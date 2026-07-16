import {
  applyPanelResult,
  bindDragPayload,
  bindDropAction,
  createActionButton,
  createPanelShell,
  createTextRow,
  type PanelActionResult,
} from './shared';

export interface InventoryItemView {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly equipped: boolean;
}

export interface InventoryPanelViewModel {
  readonly adena: number;
  readonly weight: number;
  readonly weightLimit: number;
  readonly items: readonly InventoryItemView[];
}

export interface InventoryPanelActions {
  readonly activateItem: (itemId: string) => PanelActionResult<InventoryPanelViewModel>;
  readonly assignQuickSlot: (
    itemId: string,
    slot: number,
  ) => PanelActionResult<InventoryPanelViewModel>;
}

export class InventoryPanel {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  readonly #actions: InventoryPanelActions;
  #state: InventoryPanelViewModel | null = null;

  constructor(document: Document, actions: InventoryPanelActions) {
    this.#document = document;
    this.#actions = actions;
    const shell = createPanelShell(document, 'inventory', '物品欄');
    this.element = shell.element;
    this.#body = shell.body;
    this.#status = shell.status;
  }

  get state(): InventoryPanelViewModel | null {
    return this.#state;
  }

  render(viewModel: InventoryPanelViewModel): void {
    this.#state = viewModel;
    const summary = createTextRow(
      this.#document,
      '金幣／負重',
      `${String(viewModel.adena)}／${String(viewModel.weight)} / ${String(viewModel.weightLimit)}`,
      'inventory-summary',
    );
    const list = this.#document.createElement('ul');
    list.className = 'item-grid';
    list.setAttribute('aria-label', '持有物品');
    viewModel.items.forEach((item) => {
      const row = this.#document.createElement('li');
      const button = createActionButton(
        this.#document,
        `${item.name} ×${String(item.quantity)}${item.equipped ? '（已裝備）' : ''}`,
        `inventory-item-${item.id}`,
        () => {
          this.handleItemKeyboard(item.id);
        },
      );
      bindDragPayload(button, item.id);
      row.append(button);
      list.append(row);
    });
    const equipmentTarget = this.#document.createElement('div');
    equipmentTarget.className = 'drop-target';
    equipmentTarget.tabIndex = 0;
    equipmentTarget.textContent = '拖放或以鍵盤啟用物品';
    equipmentTarget.setAttribute('aria-label', '裝備或使用物品');
    equipmentTarget.setAttribute('data-testid', 'inventory-equipment-target');
    bindDropAction(equipmentTarget, (itemId) => {
      this.handleItemDrop(itemId);
    });
    this.#body.replaceChildren(summary, list, equipmentTarget);
  }

  handleItemKeyboard(itemId: string): void {
    this.#activateItem(itemId);
  }

  handleItemDrop(itemId: string): void {
    this.#activateItem(itemId);
  }

  assignQuickSlot(itemId: string, slot: number): void {
    applyPanelResult(
      this.#actions.assignQuickSlot(itemId, slot),
      (viewModel) => {
        this.render(viewModel);
      },
      this.#status,
    );
  }

  #activateItem(itemId: string): void {
    applyPanelResult(
      this.#actions.activateItem(itemId),
      (viewModel) => {
        this.render(viewModel);
      },
      this.#status,
    );
  }
}
